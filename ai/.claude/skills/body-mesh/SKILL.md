---
name: body-mesh
description: Trigger this skill when working on anything related to creating 3D body mesh from photos or video, extracting body measurements, SMPL or SMPL-X models, body shape estimation, or human mesh recovery
---

# Body Mesh Skill

## Goal
Generate a parametric 3D body mesh (SMPL-X format) from two user photos (front + side), then extract precise body measurements in centimetres from the mesh vertices. No paid APIs — everything runs self-hosted.

> [!IMPORTANT]
> **Model-Agnostic Design**: 3D body mesh models improve rapidly. Do not hardcode direct dependencies on a specific repo throughout the application. Instead, implement a generic `BodyMeshAdapter` class that can swap underlying models via an environment variable (e.g., `BODY_MESH_MODEL=smplest-x`).

## SOTA Reference Models



### 1. SMPLest-X (Primary)
- **Repo**: `https://github.com/SMPLest/SMPLest-X`
- Best accuracy for expressive body + hand + face mesh
- Requires 2 images minimum (front-facing, side-facing)
- Outputs SMPL-X betas (shape coefficients) + poses + vertices

### 2. HMR2.0 / 4D-Humans (Fallback)
- **Repo**: `https://github.com/shubham-goel/4D-Humans`
- Faster, single-image capable, simpler setup
- Outputs SMPL betas (10-dim) + poses
- Use when SMPLest-X fails (bad lighting, partial body, low GPU VRAM)

### 3. PyMAF-X (Alternative fallback)
- **Repo**: `https://github.com/HongwenZhang/PyMAF-X`
- Part-aware mesh fitting, good for fashion photos

## Setup Instructions

### SMPLest-X Installation
```bash
# Clone repo
git clone https://github.com/SMPLest/SMPLest-X.git
cd SMPLest-X

# Create virtualenv
python3.11 -m venv .venv && source .venv/bin/activate

# Install dependencies
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu121
pip install -r requirements.txt

# Download SMPL-X model weights (free registration at smplx.is.tue.mpg.de)
# Place files under: SMPLest-X/data/smplx/
#   SMPLX_NEUTRAL.npz
#   SMPLX_MALE.npz
#   SMPLX_FEMALE.npz

# Download SMPLest-X pretrained checkpoint
# https://github.com/SMPLest/SMPLest-X (see releases)
# Place under: SMPLest-X/pretrained_models/smplest_x_l.pth.tar
```

### HMR2.0 Installation (fallback)
```bash
git clone https://github.com/shubham-goel/4D-Humans.git
cd 4D-Humans
pip install -e ".[all]"
# Model weights auto-download on first run via HuggingFace
```

## Working Python Example — SMPLest-X Inference

```python
import sys
import torch
import numpy as np
from pathlib import Path
from PIL import Image

# Add SMPLest-X to path
SMPLESTX_ROOT = Path("/opt/SMPLest-X")
sys.path.insert(0, str(SMPLESTX_ROOT))

from main.inference import SMPLestXInferencer

def run_smplestx(front_image_path: str, side_image_path: str) -> dict:
    """
    Run SMPLest-X on front + side images.
    Returns dict with smplx_betas, smplx_poses, vertices (numpy arrays).
    """
    device = "cuda" if torch.cuda.is_available() else "cpu"

    inferencer = SMPLestXInferencer(
        pretrained=str(SMPLESTX_ROOT / "pretrained_models/smplest_x_l.pth.tar"),
        device=device,
    )

    images = [Image.open(front_image_path), Image.open(side_image_path)]
    result = inferencer.infer(images)

    return {
        "smplx_betas": result["betas"].cpu().numpy().tolist(),   # shape (10,)
        "smplx_poses": result["poses"].cpu().numpy().tolist(),   # full pose vector
        "vertices": result["vertices"].cpu().numpy(),            # (10475, 3) float32
    }
```

## Measurement Extraction from SMPL-X Vertices

Measurements are computed as Euclidean distances between specific vertex pairs.
See `resources/smplx-vertex-indices.md` for the full vertex index table.

```python
import numpy as np

def euclidean_distance(vertices: np.ndarray, idx_a: int, idx_b: int) -> float:
    """3D Euclidean distance between two SMPL-X vertices, in metres."""
    return float(np.linalg.norm(vertices[idx_a] - vertices[idx_b]))

def compute_circumference(vertices: np.ndarray, indices: list[int]) -> float:
    """
    Approximate circumference by summing distances between consecutive
    vertices in a ring (e.g. chest ring indices listed in order).
    """
    total = 0.0
    for i in range(len(indices)):
        total += euclidean_distance(vertices, indices[i], indices[(i + 1) % len(indices)])
    return total
```

See `scripts/extract_measurements.py` for the full implementation.

## Output Schema (Pydantic v2)

```python
from pydantic import BaseModel, Field
from typing import List

class MeasurementsOutput(BaseModel):
    height_cm: float = Field(..., description="Full body height in cm")
    chest_cm: float = Field(..., description="Chest circumference in cm")
    waist_cm: float = Field(..., description="Waist circumference in cm")
    hip_cm: float = Field(..., description="Hip circumference in cm")
    inseam_cm: float = Field(..., description="Inseam (crotch to floor) in cm")
    shoulder_width_cm: float = Field(..., description="Shoulder width (L to R acromion) in cm")
    arm_length_cm: float = Field(..., description="Arm length (shoulder to wrist) in cm")
    smplx_betas: List[float] = Field(..., description="SMPL-X shape coefficients (10-dim)")
    model_used: str = Field(..., description="'smplestx' or 'hmr2'")
    confidence: float = Field(..., ge=0.0, le=1.0, description="Inference confidence score")
```

## Common Pitfalls

1. **Poor lighting**: Reject images where average pixel brightness < 40 or > 220. Return HTTP 422 with `{"detail": "Image too dark or overexposed"}`.
2. **Minimum 2 photos required**: Front-facing + side-facing. Validate before inference.
3. **Beta clamping**: Always clamp `smplx_betas` to `[-5, 5]` per component before extracting measurements. Values outside this range produce physically implausible bodies.
4. **Vertex units**: SMPL-X vertices are in **metres**. Multiply by 100 for centimetres.
5. **CUDA OOM**: If CUDA out of memory, retry on CPU with a warning log.
6. **Partial body**: If body is not fully visible (cropped at knee/chest), fall back to HMR2.0 which is more robust to partial crops.

## Validation Steps

```bash
# Run test script
python ai/.claude/skills/body-mesh/scripts/test_smplx.py \
    --front tests/fixtures/person_front.jpg \
    --side tests/fixtures/person_side.jpg

# Expected output:
# [PASS] MeasurementsOutput schema valid
# [PASS] height_cm in range [140, 220]
# [PASS] chest_cm in range [70, 140]
# [PASS] smplx_betas length == 10
# [PASS] all betas in [-5, 5]
```

## Script References
- `scripts/test_smplx.py` — end-to-end test (load images → inference → schema validation)
- `scripts/extract_measurements.py` — vertex-to-measurement computation utility
- `resources/smplx-vertex-indices.md` — vertex index reference table
