"""
test_idmvton.py
End-to-end test: person image + garment image → rembg → IDM-VTON → validate TryOnOutput schema.

Usage:
    python test_idmvton.py --person /path/to/person.jpg --garment /path/to/garment.jpg --output /tmp/result.jpg

If IDM-VTON is not installed, runs MOCK mode (validates schema + rembg step only).
"""

import argparse
import sys
import io
import time
from pathlib import Path
from pydantic import BaseModel, Field, ValidationError


# ── Schema ──────────────────────────────────────────────────────────────────

class TryOnOutput(BaseModel):
    result_image_url: str
    model_used: str
    person_image_url: str
    garment_image_url: str
    inference_time_seconds: float = Field(..., ge=0.0)
    category: str


# ── rembg step ───────────────────────────────────────────────────────────────

def remove_background(input_path: str, output_path: str) -> bool:
    """Remove garment background with rembg. Returns True on success."""
    try:
        from rembg import remove
        from PIL import Image

        with open(input_path, "rb") as f:
            raw = f.read()
        result_bytes = remove(raw)
        img = Image.open(io.BytesIO(result_bytes)).convert("RGBA")
        img.save(output_path, format="PNG")
        return True
    except ImportError:
        print("[WARN] rembg not installed — skipping background removal")
        return False
    except Exception as e:
        print(f"[WARN] rembg failed: {e}")
        return False


# ── IDM-VTON inference ───────────────────────────────────────────────────────

def run_idmvton(person_path: str, garment_path: str, output_path: str) -> tuple[bool, float]:
    """
    Run IDM-VTON. Returns (success, elapsed_seconds).
    Falls back gracefully if not installed.
    """
    IDMVTON_ROOT = Path("/opt/IDM-VTON")
    if not IDMVTON_ROOT.exists():
        print("[SKIP] IDM-VTON not found at /opt/IDM-VTON — using mock output")
        return False, 0.0

    import subprocess
    start = time.time()
    cmd = [
        sys.executable,
        str(IDMVTON_ROOT / "inference.py"),
        "--person_image", person_path,
        "--garment_image", garment_path,
        "--output", output_path,
        "--category", "upper_body",
        "--num_inference_steps", "30",
        "--guidance_scale", "2.0",
    ]
    result = subprocess.run(cmd, cwd=str(IDMVTON_ROOT), capture_output=True, text=True)
    elapsed = time.time() - start

    if result.returncode != 0:
        print(f"[FAIL] IDM-VTON inference error:\n{result.stderr[:500]}")
        return False, elapsed

    return True, elapsed


# ── Mock result for schema validation ────────────────────────────────────────

def mock_tryon_output(person_path: str, garment_path: str) -> TryOnOutput:
    return TryOnOutput(
        result_image_url=f"file:///tmp/mock_tryon_result.jpg",
        model_used="mock",
        person_image_url=f"file://{person_path}",
        garment_image_url=f"file://{garment_path}",
        inference_time_seconds=0.0,
        category="upper_body",
    )


# ── Validation helpers ───────────────────────────────────────────────────────

def check_output_image(path: str) -> tuple[bool, str]:
    """Check output image exists, is valid, and is at least 200x200."""
    try:
        from PIL import Image
        img = Image.open(path)
        w, h = img.size
        if w < 200 or h < 200:
            return False, f"Output image too small: {w}x{h}"
        return True, f"{w}x{h}"
    except ImportError:
        # PIL not available — just check file exists
        if Path(path).exists():
            return True, "file exists (PIL not available for size check)"
        return False, "file not found"
    except Exception as e:
        return False, str(e)


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser(description="Test IDM-VTON try-on pipeline")
    parser.add_argument("--person", default="tests/fixtures/person_front.jpg")
    parser.add_argument("--garment", default="tests/fixtures/garment_tshirt.jpg")
    parser.add_argument("--output", default="/tmp/zora_tryon_result.jpg")
    parser.add_argument("--mock", action="store_true", help="Force mock mode")
    args = parser.parse_args()

    print("=" * 60)
    print("ZORA Virtual Try-On Pipeline Test")
    print("=" * 60)

    passes = []
    failures = []

    def check(label: str, passed: bool, detail: str = ""):
        status = "[PASS]" if passed else "[FAIL]"
        msg = f"{status} {label}"
        if detail:
            msg += f" — {detail}"
        print(msg)
        (passes if passed else failures).append(label)

    # 1. Input files
    person_exists = Path(args.person).exists() or args.mock
    garment_exists = Path(args.garment).exists() or args.mock
    check("Person image exists", person_exists)
    check("Garment image exists", garment_exists)

    if not person_exists or not garment_exists:
        print("[INFO] Input files missing, switching to mock mode")
        args.mock = True

    # 2. Background removal
    garment_no_bg = "/tmp/garment_no_bg_test.png"
    if not args.mock:
        rembg_ok = remove_background(args.garment, garment_no_bg)
        check("rembg background removal", rembg_ok)
        if not rembg_ok:
            garment_no_bg = args.garment  # continue without bg removal

    # 3. IDM-VTON inference (or mock)
    inference_ok = False
    elapsed = 0.0
    if args.mock:
        output = mock_tryon_output(args.person, args.garment)
        check("IDM-VTON inference (mock)", True)
        inference_ok = True
    else:
        inference_ok, elapsed = run_idmvton(args.person, garment_no_bg, args.output)
        check("IDM-VTON inference completed", inference_ok, f"{elapsed:.1f}s")
        if inference_ok:
            check("Inference time < 300s", elapsed < 300.0, f"{elapsed:.1f}s")
            img_ok, img_detail = check_output_image(args.output)
            check("Output image valid", img_ok, img_detail)

    # 4. Schema validation
    try:
        if args.mock:
            validated = output
        else:
            validated = TryOnOutput(
                result_image_url=f"file://{args.output}",
                model_used="idmvton",
                person_image_url=f"file://{args.person}",
                garment_image_url=f"file://{garment_no_bg}",
                inference_time_seconds=elapsed,
                category="upper_body",
            )
        TryOnOutput.model_validate(validated.model_dump())
        check("TryOnOutput schema valid", True)
    except ValidationError as e:
        check("TryOnOutput schema valid", False, str(e))

    # Summary
    print("\n" + "=" * 60)
    if not failures:
        print(f"ALL {len(passes)} TESTS PASSED")
        sys.exit(0)
    else:
        print(f"{len(passes)} passed, {len(failures)} FAILED:")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
