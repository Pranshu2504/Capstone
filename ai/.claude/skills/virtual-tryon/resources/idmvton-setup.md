# IDM-VTON Setup Guide

## Repository
- **GitHub**: `https://github.com/yisol/IDM-VTON`
- **Paper**: "Improving Diffusion Models for Authentic Virtual Try-On in the Wild" (ECCV 2024)
- **License**: CC BY-NC-SA 4.0 (non-commercial)

---

## Hardware Requirements

| Config | GPU VRAM | Inference Time (768×1024) |
|--------|----------|--------------------------|
| Optimal | 24 GB (A100/RTX 3090) | ~8s |
| Comfortable | 16 GB (RTX 3080) | ~15s |
| Minimum | 12 GB (RTX 3060 Ti) | ~25s |
| CPU fallback | 16 GB RAM | ~3–5 min |

---

## Installation

```bash
# 1. Clone
git clone https://github.com/yisol/IDM-VTON.git /opt/IDM-VTON
cd /opt/IDM-VTON

# 2. Create Python 3.10 env (IDM-VTON tested on 3.10)
python3.10 -m venv .venv && source .venv/bin/activate

# 3. Install PyTorch (CUDA 12.1)
pip install torch==2.1.0 torchvision==0.16.0 --index-url https://download.pytorch.org/whl/cu121

# 4. Install dependencies
pip install -r requirements.txt

# 5. Install diffusers pinned version
pip install diffusers==0.25.0 transformers accelerate

# 6. Install rembg for background removal
pip install rembg[gpu]   # or rembg (CPU-only)
```

---

## Model Weights Download

IDM-VTON weights are hosted on HuggingFace (free account required):

```bash
# Install huggingface_hub CLI
pip install huggingface_hub

# Download weights (~5 GB total)
python -c "
from huggingface_hub import snapshot_download
snapshot_download(
    repo_id='yisol/IDM-VTON',
    local_dir='/opt/IDM-VTON/checkpoints/idm_vton',
)
"
```

Alternatively, download manually from `https://huggingface.co/yisol/IDM-VTON` and place under `/opt/IDM-VTON/checkpoints/idm_vton/`.

Required files:
```
checkpoints/idm_vton/
├── unet/                  # Diffusion UNet weights
├── vae/                   # VAE encoder/decoder
├── image_encoder/         # CLIP image encoder
└── config.json
```

---

## Inference CLI

```bash
# Basic usage
python inference.py \
    --person_image /path/to/person_front.jpg \
    --garment_image /path/to/garment_no_bg.png \
    --output /path/to/result.jpg \
    --category upper_body \
    --num_inference_steps 30 \
    --guidance_scale 2.0

# Categories: upper_body | lower_body | dresses

# Lower memory usage (reduces resolution)
python inference.py \
    --person_image person.jpg \
    --garment_image garment.png \
    --output result.jpg \
    --category upper_body \
    --height 512 --width 384 \
    --num_inference_steps 20
```

---

## Python API Integration

```python
import subprocess
import sys
from pathlib import Path

IDMVTON_ROOT = Path("/opt/IDM-VTON")
PYTHON = str(IDMVTON_ROOT / ".venv/bin/python")

def run_idmvton(
    person_image: str,
    garment_image: str,
    output_path: str,
    category: str = "upper_body",
    steps: int = 30,
) -> str:
    """Run IDM-VTON via subprocess. Returns output_path."""
    cmd = [
        PYTHON,
        str(IDMVTON_ROOT / "inference.py"),
        "--person_image", person_image,
        "--garment_image", garment_image,
        "--output", output_path,
        "--category", category,
        "--num_inference_steps", str(steps),
        "--guidance_scale", "2.0",
    ]
    result = subprocess.run(
        cmd,
        cwd=str(IDMVTON_ROOT),
        capture_output=True,
        text=True,
        timeout=300,   # 5 min hard timeout
    )
    if result.returncode != 0:
        raise RuntimeError(f"IDM-VTON failed:\n{result.stderr[-500:]}")
    return output_path
```

---

## CatVTON Fallback Setup

When IDM-VTON is unavailable or VRAM is insufficient:

```bash
git clone https://github.com/Zheng-Chong/CatVTON.git /opt/CatVTON
cd /opt/CatVTON
pip install -r requirements.txt

# Weights auto-download from HuggingFace on first run:
# zheng-chong/CatVTON (~3 GB)
```

---

## Common Errors & Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| `CUDA out of memory` | VRAM insufficient | Add `--height 512 --width 384` or use CPU |
| `FileNotFoundError: checkpoints/...` | Weights not downloaded | Run `snapshot_download` step again |
| `ImportError: diffusers` | Wrong version | `pip install diffusers==0.25.0` |
| Garment colour wrong in output | Background not removed | Always run rembg on garment before VTON |
| Garment misaligned on body | Wrong category | Check `upper_body` vs `lower_body` vs `dresses` |
| Blank/black output image | Guidance scale too low | Increase `--guidance_scale` to 3.0–4.0 |
| Person looks distorted | Image not portrait | Crop/resize person image to portrait (h > 1.2w) |

---

## Garment Preprocessing Checklist

Before passing garment to IDM-VTON:
- [ ] Background removed (rembg) → RGBA PNG
- [ ] Garment is flat-lay or on mannequin (not worn by a person)
- [ ] Image is at least 512×512
- [ ] Category matches actual garment type

Before passing person photo:
- [ ] Full body visible (head to ankles minimum)
- [ ] Front-facing pose preferred
- [ ] No other people in frame
- [ ] Good even lighting (avoid harsh shadows)
- [ ] Portrait orientation (height > width)

---

## Performance Benchmarks (from IDM-VTON paper)

| Dataset | SSIM ↑ | FID ↓ | KID ↓ |
|---------|--------|-------|-------|
| VITON-HD | 0.855 | 9.47 | 4.43 |
| DressCode | 0.813 | 11.23 | 5.02 |

IDM-VTON outperforms OOTD, LaDI-VTON, and DCI-VTON on both datasets as of ECCV 2024.
