"""
scrape_garment.py
Full async Playwright garment scraper for ZORA.

Usage:
    python scrape_garment.py --url "https://www.uniqlo.com/..." --output /tmp/scrapes

Output: prints GarmentOutput JSON to stdout.
"""

import argparse
import asyncio
import base64
import io
import json
import os
import re
import sys
import time
from pathlib import Path
from typing import Optional

import httpx
from pydantic import BaseModel, Field


# ── Schemas ──────────────────────────────────────────────────────────────────

class SizeChartRow(BaseModel):
    size_label: str
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hip_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None


class GarmentOutput(BaseModel):
    url: str
    product_name: str
    brand: Optional[str] = None
    category: str
    garment_image_url: str
    garment_image_no_bg_path: str
    size_chart: list[SizeChartRow] = Field(default_factory=list)
    size_chart_source: str
    scrape_duration_seconds: float


# ── Configuration ─────────────────────────────────────────────────────────────

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llava:13b")
USER_AGENTS = [
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36",
    "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36",
]


# ── HTML Parsing Helpers ──────────────────────────────────────────────────────

def _extract_og_image(soup) -> Optional[str]:
    tag = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
    return tag["content"] if tag and tag.get("content") else None


def _extract_product_name(soup, url: str) -> str:
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return h1.get_text(strip=True)
    og_title = soup.find("meta", property="og:title")
    if og_title and og_title.get("content"):
        return og_title["content"]
    slug = url.rstrip("/").split("/")[-1]
    return re.sub(r"[-_]", " ", slug).title()


def _extract_brand(soup) -> Optional[str]:
    og_site = soup.find("meta", property="og:site_name")
    if og_site:
        return og_site.get("content")
    # Try schema.org brand
    brand_tag = soup.find("span", itemprop="brand")
    return brand_tag.get_text(strip=True) if brand_tag else None


def _classify_category(product_name: str, soup) -> str:
    text = (product_name + " " + soup.get_text()[:2000]).lower()
    if any(w in text for w in ["dress", "gown", "maxi", "midi", "kurta", "kurti", "saree"]):
        return "dresses"
    if any(w in text for w in ["jean", "trouser", "pant", "short", "skirt", "legging", "chino"]):
        return "lower_body"
    if any(w in text for w in ["bag", "shoe", "boot", "sandal", "hat", "belt", "watch", "jewel", "accessory"]):
        return "accessories"
    return "upper_body"


def _parse_size_table_from_html(soup) -> list[SizeChartRow]:
    """Find size chart table by scanning for 'size' or measurement headers."""
    def _to_cm(val: str) -> Optional[float]:
        nums = re.findall(r"[\d.]+", val.replace(",", "."))
        if not nums:
            return None
        v = float(nums[0])
        # Heuristic: if value < 10, likely in inches — convert
        if v < 10:
            return None
        if v < 50:  # likely inches (chest 32-48 → cm 81-122)
            v *= 2.54
        return round(v, 1)

    for table in soup.find_all("table"):
        raw_headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not raw_headers:
            # Try first row as header
            first_row = table.find("tr")
            if first_row:
                raw_headers = [td.get_text(strip=True).lower() for td in first_row.find_all(["td", "th"])]

        has_size = any("size" in h or "chest" in h or "bust" in h or "waist" in h for h in raw_headers)
        if not has_size:
            continue

        rows = []
        for tr in table.find_all("tr")[1:]:
            cells = [td.get_text(strip=True) for td in tr.find_all(["td", "th"])]
            if len(cells) < 2:
                continue

            data = dict(zip(raw_headers, cells))
            size_label = (
                data.get("size") or data.get("uk size") or data.get("eu size") or
                data.get("us size") or data.get("in size") or cells[0]
            ).strip()

            if not size_label or size_label.lower() in ("size", ""):
                continue

            row = SizeChartRow(
                size_label=size_label,
                chest_cm=_to_cm(data.get("chest", "") or data.get("bust", "")),
                waist_cm=_to_cm(data.get("waist", "")),
                hip_cm=_to_cm(data.get("hip", "") or data.get("hips", "") or data.get("seat", "")),
                inseam_cm=_to_cm(data.get("inseam", "") or data.get("inside leg", "") or data.get("length", "")),
                shoulder_cm=_to_cm(data.get("shoulder", "")),
            )
            rows.append(row)

        if rows:
            return rows

    return []


# ── Ollama LLaVA Size Chart OCR ───────────────────────────────────────────────

async def _ocr_size_chart_with_llava(screenshot_path: str) -> list[SizeChartRow]:
    """Parse size chart from page screenshot using local LLaVA model."""
    if not Path(screenshot_path).exists():
        return []

    with open(screenshot_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    prompt = (
        "Look at this screenshot of a fashion product page. "
        "Find the size chart table if one is visible. "
        "Extract it as a JSON array. Each element should be: "
        '{"size_label": "...", "chest_cm": number_or_null, "waist_cm": number_or_null, '
        '"hip_cm": number_or_null, "inseam_cm": number_or_null, "shoulder_cm": number_or_null}. '
        "Convert all values to centimetres (multiply inches by 2.54). "
        "If no size chart is visible, return an empty JSON array []. "
        "Return ONLY the JSON array, no other text."
    )

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            resp = await client.post(
                f"{OLLAMA_BASE_URL}/api/generate",
                json={
                    "model": OLLAMA_VISION_MODEL,
                    "prompt": prompt,
                    "images": [img_b64],
                    "stream": False,
                    "options": {"temperature": 0.05},
                },
            )
            resp.raise_for_status()
            raw = resp.json().get("response", "").strip()
    except Exception as e:
        print(f"[WARN] Ollama LLaVA OCR failed: {e}", file=sys.stderr)
        return []

    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []

    try:
        data = json.loads(match.group(0))
        rows = []
        for item in data:
            if not item.get("size_label"):
                continue
            rows.append(SizeChartRow(
                size_label=str(item["size_label"]),
                chest_cm=item.get("chest_cm"),
                waist_cm=item.get("waist_cm"),
                hip_cm=item.get("hip_cm"),
                inseam_cm=item.get("inseam_cm"),
                shoulder_cm=item.get("shoulder_cm"),
            ))
        return rows
    except Exception as e:
        print(f"[WARN] LLaVA JSON parse failed: {e}", file=sys.stderr)
        return []


# ── Image Download + Background Removal ──────────────────────────────────────

async def _download_and_remove_bg(image_url: str, output_dir: str) -> str:
    """Download garment image, remove background, save as PNG."""
    async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
        resp = await client.get(image_url, headers={"User-Agent": USER_AGENTS[0]})
        resp.raise_for_status()
        raw_bytes = resp.content

    try:
        from rembg import remove
        no_bg_bytes = remove(raw_bytes)
        from PIL import Image
        img = Image.open(io.BytesIO(no_bg_bytes)).convert("RGBA")
    except ImportError:
        print("[WARN] rembg not installed — saving original image", file=sys.stderr)
        from PIL import Image
        img = Image.open(io.BytesIO(raw_bytes)).convert("RGBA")

    slug = re.sub(r"[^a-zA-Z0-9]", "_", image_url.split("/")[-1].split("?")[0])[:40]
    out_path = str(Path(output_dir) / f"{slug}_no_bg.png")
    img.save(out_path, format="PNG")
    return out_path


# ── Playwright Scraper ────────────────────────────────────────────────────────

async def scrape_garment(url: str, output_dir: str = "/tmp/zora_scrapes") -> GarmentOutput:
    """
    Full pipeline: URL → Playwright → extract image + name + size chart → rembg.
    Returns GarmentOutput pydantic model.
    """
    from playwright.async_api import async_playwright
    from bs4 import BeautifulSoup
    import random

    Path(output_dir).mkdir(parents=True, exist_ok=True)
    start = time.time()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=random.choice(USER_AGENTS),
            locale="en-US",
            viewport={"width": 1280, "height": 900},
            extra_http_headers={"Accept-Language": "en-US,en;q=0.9"},
        )

        # Basic stealth: hide webdriver flag
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        page = await context.new_page()

        try:
            await page.goto(url, wait_until="networkidle", timeout=15000)
        except Exception:
            # Some sites don't reach networkidle — try domcontentloaded
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)

        await page.wait_for_timeout(random.randint(1500, 3000))

        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        product_name = _extract_product_name(soup, url)
        brand = _extract_brand(soup)
        category = _classify_category(product_name, soup)

        # Image extraction: og:image first, then largest img
        image_url = _extract_og_image(soup)
        if not image_url:
            images = await page.evaluate("""
                () => Array.from(document.images)
                    .filter(img => img.naturalWidth > 300 && img.naturalHeight > 300)
                    .map(img => ({src: img.src, w: img.naturalWidth, h: img.naturalHeight}))
                    .sort((a, b) => (b.w * b.h) - (a.w * a.h))
            """)
            if images:
                image_url = images[0]["src"]
            else:
                raise ValueError(f"No product image found on page: {url}")

        # Size chart: try DOM first, then screenshot + LLaVA
        size_chart_rows = _parse_size_table_from_html(soup)
        if size_chart_rows:
            size_chart_source = "dom"
        else:
            screenshot_path = str(Path(output_dir) / "size_chart_screenshot.png")
            await page.screenshot(path=screenshot_path, full_page=False)
            size_chart_rows = await _ocr_size_chart_with_llava(screenshot_path)
            size_chart_source = "llava_vision" if size_chart_rows else "not_found"

        await browser.close()

    # Download image and remove background
    garment_no_bg_path = await _download_and_remove_bg(image_url, output_dir)

    return GarmentOutput(
        url=url,
        product_name=product_name,
        brand=brand,
        category=category,
        garment_image_url=image_url,
        garment_image_no_bg_path=garment_no_bg_path,
        size_chart=size_chart_rows,
        size_chart_source=size_chart_source,
        scrape_duration_seconds=round(time.time() - start, 2),
    )


# ── CLI ───────────────────────────────────────────────────────────────────────

async def main():
    parser = argparse.ArgumentParser(description="ZORA Garment Scraper")
    parser.add_argument("--url", required=True, help="Product URL to scrape")
    parser.add_argument("--output", default="/tmp/zora_scrapes", help="Output directory")
    args = parser.parse_args()

    print(f"[INFO] Scraping: {args.url}", file=sys.stderr)
    result = await scrape_garment(args.url, args.output)
    print(result.model_dump_json(indent=2))


if __name__ == "__main__":
    asyncio.run(main())
