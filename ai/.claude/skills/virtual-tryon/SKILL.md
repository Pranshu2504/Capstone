---
name: virtual-tryon
description: Trigger this skill when working on garment try-on, overlaying clothes on body, VTON models, IDM-VTON, CatVTON, OOTDiffusion, garment rendering, or try-on image generation
---

# Virtual Try-On Skill

## Goal
Composite a target garment onto a person photo, producing a photorealistic try-on image. Entirely self-hosted with open-source models — no paid APIs.

> [!IMPORTANT]
> **Model-Agnostic Design**: Diffusion models evolve fast. Avoid tight coupling by wrapping inference inside an adapter (e.g., `BaseVTONService`) that dynamically loads the appropriate runner based on an environment variable (`VTON_MODEL=idmvton`).

## SOTA Reference Models


### 1. IDM-VTON (Primary — ECCV 2024)
- **Repo**: `https://github.com/yisol/IDM-VTON`
- State-of-the-art diffusion-based try-on
- Requires: person image (full body, front facing) + flat-lay garment image (background removed)
- Produces 768×1024 or 1024×1280 output
- GPU recommended (RTX 3090 or better); falls back to CPU at ~3 min/image

### 2. CatVTON (Fallback — lightweight)
- **Repo**: `https://github.com/Zheng-Chong/CatVTON`
- No separate warping module — simpler pipeline
- Faster on lower-VRAM GPUs (8 GB works)
- Slightly lower fidelity than IDM-VTON

### 3. OOTDiffusion (Alternative)
- **Repo**: `https://github.com/levihsu/OOTDiffusion`
- Good for upper-body garments specifically

## Required Preprocessing Pipeline

### Step 1 — Background Removal from Garment (rembg)

```python
import io
from rembg import remove
from PIL import Image

def remove_garment_background(image_path: str) -> Image.Image:
    """
    Remove background from garment image using rembg (u2net model).
    Input: path to garment photo
    Output: PIL Image with transparent background (RGBA)
    """
    with open(image_path, "rb") as f:
        input_bytes = f.read()

    output_bytes = remove(input_bytes)          # uses u2net by default
    result = Image.open(io.BytesIO(output_bytes)).convert("RGBA")
    return result


def save_garment_no_bg(image_path: str, output_path: str) -> str:
    """Remove background and save as PNG. Returns output_path."""
    result = remove_garment_background(image_path)
    result.save(output_path, format="PNG")
    return output_path
```

### Step 2 — Person Image Validation

```python
from PIL import Image

def validate_person_image(image_path: str) -> tuple[bool, str]:
    """
    Check that person image meets IDM-VTON requirements.
    Returns (is_valid, error_message).
    """
    img = Image.open(image_path)
    w, h = img.size

    if h < 512 or w < 384:
        return False, f"Image too small: {w}x{h}, minimum 384x512"
    if h / w < 1.2:
        return False, "Image must be portrait orientation (height > 1.2x width)"

    return True, ""
```

### Step 3 — IDM-VTON Inference

```python
import subprocess
import json
from pathlib import Path

IDMVTON_ROOT = Path("/opt/IDM-VTON")

def run_idmvton(
    person_image_path: str,
    garment_image_path: str,  # background already removed
    output_path: str,
    category: str = "upper_body",  # "upper_body" | "lower_body" | "dresses"
) -> str:
    """
    Run IDM-VTON inference via subprocess.
    Returns path to output image.
    """
    cmd = [
        "python", str(IDMVTON_ROOT / "inference.py"),
        "--person_image", person_image_path,
        "--garment_image", garment_image_path,
        "--output", output_path,
        "--category", category,
        "--num_inference_steps", "30",
        "--guidance_scale", "2.0",
    ]
    result = subprocess.run(cmd, cwd=str(IDMVTON_ROOT), capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"IDM-VTON failed: {result.stderr}")
    return output_path
```

## CatVTON Fallback

```python
from pathlib import Path

CATVTON_ROOT = Path("/opt/CatVTON")

def run_catvton(person_image_path: str, garment_image_path: str, output_path: str) -> str:
    """CatVTON fallback — simpler pipeline, lower VRAM requirement."""
    import sys
    sys.path.insert(0, str(CATVTON_ROOT))
    from model.pipeline import CatVTONPipeline  # type: ignore

    pipe = CatVTONPipeline.from_pretrained("zheng-chong/CatVTON")
    result = pipe(
        person_image=person_image_path,
        garment_image=garment_image_path,
        num_inference_steps=20,
    )
    result.images[0].save(output_path)
    return output_path
```

## Output Schema (Pydantic v2)

```python
from pydantic import BaseModel, Field

class TryOnOutput(BaseModel):
    result_image_url: str = Field(..., description="S3/MinIO URL of the try-on output image")
    model_used: str = Field(..., description="'idmvton' | 'catvton' | 'ootdiffusion'")
    person_image_url: str = Field(..., description="Original person image URL")
    garment_image_url: str = Field(..., description="Garment image URL (bg removed)")
    inference_time_seconds: float
    category: str = Field(..., description="'upper_body' | 'lower_body' | 'dresses'")
```

## Common Pitfalls

1. **Garment must be flat-lay or on mannequin** — person-worn garment photos produce poor results (model can't isolate the garment geometry).
2. **Full body photo required** — person must be visible head-to-toe. Cropped photos fail for lower_body/dresses categories.
3. **Always remove background from garment first** — skip this step and the diffusion model will composite the background onto the person.
4. **Category mismatch**: passing a dress with `category=upper_body` produces artifacts. Detect category from garment scraper metadata.
5. **IDM-VTON weights**: download from HuggingFace `yisol/IDM-VTON`. Model is ~5 GB, cache under `/opt/IDM-VTON/checkpoints/`.
6. **VRAM**: IDM-VTON needs ~12 GB VRAM at 768×1024. Use CatVTON on 8 GB GPU or CPU.

## Validation Steps

```bash
python ai/.claude/skills/virtual-tryon/scripts/test_idmvton.py \
    --person tests/fixtures/person_front.jpg \
    --garment tests/fixtures/garment_tshirt.jpg \
    --output /tmp/tryon_result.jpg

# Expected:
# [PASS] Background removed from garment
# [PASS] IDM-VTON inference completed in <8s (GPU) or <180s (CPU)
# [PASS] Output image saved: 768x1024
# [PASS] TryOnOutput schema valid
```

## Script References
- `scripts/test_idmvton.py` — end-to-end test (rembg → IDM-VTON → validate)
- `resources/idmvton-setup.md` — setup guide, weight download, common errors
