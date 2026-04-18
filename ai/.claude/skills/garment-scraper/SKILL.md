---
name: garment-scraper
description: Trigger this skill when working on scraping garment images or metadata from fashion websites, parsing product pages, extracting size charts, handling Myntra/Zara/ASOS/H&M URLs, or processing pasted product URLs
---

# Garment Scraper Skill

## Goal
Given any fashion product URL (Myntra, Zara, ASOS, H&M, Uniqlo, etc.), extract: product name, primary garment image, category, and size chart. Remove garment background with rembg. Use Ollama LLaVA vision model to parse size charts from images when DOM parsing fails. No paid APIs.

## Stack
- **Playwright** (async Python) — JS-rendered pages, anti-bot stealth
- **BeautifulSoup4** — static HTML fallback
- **rembg** — background removal
- **Ollama + LLaVA 1.6** — size chart OCR from screenshots
- **httpx** — lightweight image downloads

## Output Schema (Pydantic v2)

```python
from pydantic import BaseModel, Field, HttpUrl
from typing import Optional

class SizeChartRow(BaseModel):
    size_label: str                          # "S", "M", "32", "EU 38"
    chest_cm: Optional[float] = None
    waist_cm: Optional[float] = None
    hip_cm: Optional[float] = None
    inseam_cm: Optional[float] = None
    shoulder_cm: Optional[float] = None

class GarmentOutput(BaseModel):
    url: str
    product_name: str
    brand: Optional[str] = None
    category: str = Field(..., description="'upper_body' | 'lower_body' | 'dresses' | 'accessories'")
    garment_image_url: str = Field(..., description="Direct URL of primary garment image")
    garment_image_no_bg_path: str = Field(..., description="Local path to bg-removed PNG")
    size_chart: list[SizeChartRow] = Field(default_factory=list)
    size_chart_source: str = Field(..., description="'dom' | 'llava_vision' | 'not_found'")
    scrape_duration_seconds: float
```

## Playwright Scraper (Primary)

```python
import asyncio
import time
import re
from pathlib import Path
from playwright.async_api import async_playwright, Page
from bs4 import BeautifulSoup
import httpx

async def scrape_garment(url: str, output_dir: str = "/tmp/zora_scrapes") -> GarmentOutput:
    """
    Full pipeline: scrape URL → extract image + size chart → remove bg.
    Handles JS-rendered fashion sites with stealth mode.
    """
    Path(output_dir).mkdir(parents=True, exist_ok=True)
    start = time.time()

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        context = await browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
            locale="en-US",
            viewport={"width": 1280, "height": 900},
        )
        # Basic stealth: mask webdriver flag
        await context.add_init_script(
            "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
        )

        page = await context.new_page()
        await page.goto(url, wait_until="networkidle", timeout=15000)
        await page.wait_for_timeout(2000)  # let lazy images load

        html = await page.content()
        soup = BeautifulSoup(html, "html.parser")

        product_name = _extract_product_name(soup, url)
        brand = _extract_brand(soup)
        image_url = _extract_og_image(soup) or await _find_product_image(page)
        category = _classify_category(product_name, soup)
        size_chart_rows, size_chart_source = await _extract_size_chart(page, soup)

        await browser.close()

    # Download and strip garment background
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
```

## Helper Functions

```python
def _extract_og_image(soup: BeautifulSoup) -> str | None:
    """Extract og:image meta tag — works on most fashion sites."""
    tag = soup.find("meta", property="og:image") or soup.find("meta", attrs={"name": "og:image"})
    return tag["content"] if tag and tag.get("content") else None


def _extract_product_name(soup: BeautifulSoup, url: str) -> str:
    """Try h1 → og:title → URL slug."""
    h1 = soup.find("h1")
    if h1 and h1.get_text(strip=True):
        return h1.get_text(strip=True)
    og_title = soup.find("meta", property="og:title")
    if og_title:
        return og_title.get("content", "Unknown Product")
    # fall back to URL slug
    slug = url.rstrip("/").split("/")[-1].replace("-", " ").replace("_", " ")
    return slug.title()


def _extract_brand(soup: BeautifulSoup) -> str | None:
    og_site = soup.find("meta", property="og:site_name")
    return og_site["content"] if og_site else None


def _classify_category(product_name: str, soup: BeautifulSoup) -> str:
    name_lower = product_name.lower()
    page_text = soup.get_text().lower()
    if any(w in name_lower for w in ["dress", "gown", "maxi", "midi", "kurta"]):
        return "dresses"
    if any(w in name_lower for w in ["jean", "trouser", "pant", "short", "skirt", "legging"]):
        return "lower_body"
    if any(w in name_lower for w in ["bag", "shoe", "hat", "belt", "watch", "accessory"]):
        return "accessories"
    return "upper_body"  # default


async def _find_product_image(page: Page) -> str:
    """Fallback: find largest visible img on the page."""
    images = await page.evaluate("""
        () => Array.from(document.images)
            .filter(img => img.naturalWidth > 300 && img.naturalHeight > 300)
            .map(img => ({src: img.src, w: img.naturalWidth, h: img.naturalHeight}))
            .sort((a, b) => (b.w * b.h) - (a.w * a.h))
    """)
    if images:
        return images[0]["src"]
    raise ValueError("Could not find product image on page")


async def _extract_size_chart(page: Page, soup: BeautifulSoup) -> tuple[list[SizeChartRow], str]:
    """Try DOM table parsing, then screenshot + LLaVA OCR."""
    rows = _parse_size_table_from_html(soup)
    if rows:
        return rows, "dom"

    # Screenshot visible size chart area and use LLaVA
    screenshot_path = "/tmp/zora_size_chart.png"
    await page.screenshot(path=screenshot_path, full_page=False)
    rows = await _ocr_size_chart_with_llava(screenshot_path)
    if rows:
        return rows, "llava_vision"

    return [], "not_found"


def _parse_size_table_from_html(soup: BeautifulSoup) -> list[SizeChartRow]:
    """Find size chart table by heuristic: table with 'size' header column."""
    for table in soup.find_all("table"):
        headers = [th.get_text(strip=True).lower() for th in table.find_all("th")]
        if not any("size" in h or "chest" in h or "waist" in h for h in headers):
            continue
        rows = []
        for tr in table.find_all("tr")[1:]:  # skip header
            cells = [td.get_text(strip=True) for td in tr.find_all("td")]
            if not cells:
                continue
            row = _cells_to_size_row(headers, cells)
            if row:
                rows.append(row)
        if rows:
            return rows
    return []


def _cells_to_size_row(headers: list[str], cells: list[str]) -> SizeChartRow | None:
    def _cm(val: str) -> float | None:
        nums = re.findall(r"[\d.]+", val.replace(",", "."))
        return float(nums[0]) if nums else None

    data = dict(zip(headers, cells))
    size_label = data.get("size") or data.get("uk size") or data.get("eu size") or cells[0]
    if not size_label:
        return None
    return SizeChartRow(
        size_label=size_label,
        chest_cm=_cm(data.get("chest", "") or data.get("bust", "")),
        waist_cm=_cm(data.get("waist", "")),
        hip_cm=_cm(data.get("hip", "") or data.get("hips", "")),
        inseam_cm=_cm(data.get("inseam", "") or data.get("inside leg", "")),
        shoulder_cm=_cm(data.get("shoulder", "")),
    )
```

## Ollama LLaVA Size Chart OCR

```python
import base64
import json
import httpx
import os

OLLAMA_BASE_URL = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")
OLLAMA_VISION_MODEL = os.getenv("OLLAMA_VISION_MODEL", "llava:13b")

async def _ocr_size_chart_with_llava(screenshot_path: str) -> list[SizeChartRow]:
    """
    Send page screenshot to local LLaVA model.
    Ask it to extract size chart as JSON.
    """
    with open(screenshot_path, "rb") as f:
        img_b64 = base64.b64encode(f.read()).decode()

    prompt = (
        "Look at this screenshot of a fashion product page. "
        "Find the size chart if visible. Extract it as a JSON array where each element has: "
        '{"size_label": "...", "chest_cm": number_or_null, "waist_cm": number_or_null, '
        '"hip_cm": number_or_null, "inseam_cm": number_or_null, "shoulder_cm": number_or_null}. '
        "Convert inches to cm (multiply by 2.54). "
        "If no size chart is visible, return an empty array []. "
        "Return ONLY the JSON array, no other text."
    )

    async with httpx.AsyncClient(timeout=60.0) as client:
        response = await client.post(
            f"{OLLAMA_BASE_URL}/api/generate",
            json={
                "model": OLLAMA_VISION_MODEL,
                "prompt": prompt,
                "images": [img_b64],
                "stream": False,
                "options": {"temperature": 0.1},
            },
        )
        response.raise_for_status()
        raw = response.json()["response"].strip()

    # Extract JSON from LLaVA response
    match = re.search(r"\[.*\]", raw, re.DOTALL)
    if not match:
        return []
    try:
        data = json.loads(match.group(0))
        return [SizeChartRow(**row) for row in data if row.get("size_label")]
    except Exception:
        return []
```

## Background Removal

```python
import io
from rembg import remove
from PIL import Image

async def _download_and_remove_bg(image_url: str, output_dir: str) -> str:
    """Download garment image and remove background. Returns local file path."""
    async with httpx.AsyncClient(timeout=15.0) as client:
        r = await client.get(image_url, follow_redirects=True)
        r.raise_for_status()
        raw_bytes = r.content

    no_bg_bytes = remove(raw_bytes)
    img = Image.open(io.BytesIO(no_bg_bytes)).convert("RGBA")

    slug = re.sub(r"[^a-zA-Z0-9]", "_", image_url.split("/")[-1])[:40]
    out_path = str(Path(output_dir) / f"{slug}_no_bg.png")
    img.save(out_path, format="PNG")
    return out_path
```

## Pitfalls

1. **Anti-bot**: Myntra and Zara aggressively block headless browsers. Add randomised delays (`await page.wait_for_timeout(random.randint(1000, 3000))`). If blocked, rotate user agents.
2. **Stealth mode**: For persistent blocks, install `playwright-stealth` (`pip install playwright-stealth`) and call `await stealth_async(page)` before `goto`.
3. **Rate limiting**: Add a minimum 2-second delay between requests to the same domain.
4. **Size chart not in DOM**: Many sites render size charts as images (not HTML tables). LLaVA OCR handles this — but requires Ollama + LLaVA model running.
5. **Inch vs cm**: Always normalise to cm. LLaVA prompt explicitly asks to convert. Double-check: chest values should be 80–140 cm; if >200 assume inches and multiply by 2.54.
6. **og:image fallback**: Not all sites have og:image. Use the `_find_product_image` Playwright fallback.

## Validation Steps

```bash
# Install Playwright browsers (one-time)
playwright install chromium

# Run scraper on a real URL
python ai/.claude/skills/garment-scraper/scripts/scrape_garment.py \
    --url "https://www.uniqlo.com/us/en/products/E459692-000" \
    --output /tmp/zora_test

# Expected:
# [PASS] GarmentOutput schema valid
# [PASS] garment_image_no_bg_path exists and is PNG
# [PASS] scrape_duration_seconds < 15
# [PASS] product_name non-empty
```

## Script References
- `scripts/scrape_garment.py` — full working async scraper
