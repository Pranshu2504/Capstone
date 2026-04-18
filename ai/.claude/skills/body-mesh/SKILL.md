---
name: body-mesh
description: Trigger this skill for anything related to 3D body mesh / avatar creation from a guided turntable video on Mac M2 — SMPL-X fitting, FLAME face identity, clothed-surface reconstruction (SIFU), multi-view texture projection, measurement extraction. The pipeline produces both a clothed avatar and an inner SMPL-X body layer consumed by the downstream VTON pipeline.
---

# Body Mesh Skill (v2 — Video on M2)

## Goal
From a single **guided turntable video** (5–15 s, ~720p), produce:
1. A **clothed, textured 3D avatar** (`.glb`) that looks like the user in their current outfit.
2. An **inner SMPL-X body layer** (`betas` + T-pose mesh) that the VTON pipeline consumes to drape new garments.
3. A **FLAME face layer** that preserves facial identity.
4. **Measurements** in cm from the body layer.

Hardware target: **Apple Mac M2 (MPS backend, unified memory, no CUDA)**. Everything free / open-source. See the full contract in `ai/.claude/specs/body-mesh-capture-spec.md`.

> [!IMPORTANT]
> **Model-agnostic**: never import specific repos directly in business logic. Go through the `BodyMeshAdapter`, `FaceIdentityAdapter`, `SegmentationAdapter`, `KeypointAdapter`, `ClothedSurfaceAdapter` ABCs and select implementations via env vars (`BODY_MESH_MODEL`, `FACE_ID_MODEL`, `SEGMENTATION_MODEL`, `KEYPOINT_MODEL`, `CLOTHED_MODEL`).

## M2-Tuned Model Choices

| Step | Primary (≥16 GB) | Low-mem (8 GB) | License |
|---|---|---|---|
| Segmentation | SAM2-Tiny (fp16, MPS) | MediaPipe Selfie (Core ML) | Apache 2.0 / Apache 2.0 |
| Body keypoints | ViTPose-Base (133 kpts) | RTMPose-s (ONNX/CoreML) | Apache 2.0 |
| Face landmarks | MediaPipe FaceMesh | same | Apache 2.0 |
| Body mesh | HMR2.0 / 4D-Humans (ViT-B) on MPS | HMR2.0 ViT-S | MIT |
| Face identity | MICA (single-image FLAME) | same | MIT |
| Clothed surface | SIFU | ECON-lite | Apache 2.0 / research |
| Texture projection | CPU rasterizer (`pyrender`) + OpenCV inpaint | same | — |

SMPLest-X is **not** used on M2 — reserved for server deployments via `BODY_MESH_MODEL=smplest-x`.

## Pipeline

```
video → ffmpeg keyframes (angle-spaced, N=12)
      → quality gate (blur, brightness, rotation span, face presence)
      → per-frame: SAM2-Tiny mask + ViTPose kpts + MediaPipe face kpts
      → HMR2.0 per-frame β,θ,cam
      → multi-view fusion: shared β, per-frame θ,cam (SMPLify-X-style optimizer)
      → scale by user-entered height_cm
      → MICA face fit on sharpest front frame → FLAME shape → transplant into SMPL-X head
      → SIFU clothed surface → SMPL-X vertex offsets (clamped 0–8 cm)
      → multi-view UV texture projection + OpenCV inpaint
      → skin-tone anchoring (Monk scale) for occluded skin regions
      → measurements from SMPL-X base layer
      → package: clothed.glb, body.glb, face.glb, betas.npy, flame_params.npz,
                 measurements.json, thumbnail.jpg
```

## M2 Runtime Setup

```bash
# Python 3.11 + MPS-capable PyTorch
python3.11 -m venv .venv && source .venv/bin/activate

pip install -r requirements-m2.txt
# Pinned-good versions:
#   torch==2.5.1 torchvision==0.20.1          (MPS-stable)
#   onnxruntime-silicon                       (Core ML EP)
#   coremltools
#   mediapipe
#   trimesh pyrender opencv-python
#   smplx                                     (SMPL-X model API)

# Required for some adapters (ops not yet on MPS)
export PYTORCH_ENABLE_MPS_FALLBACK=1
```

Select device once in code:
```python
import torch
DEVICE = "mps" if torch.backends.mps.is_available() else "cpu"
```

## Minimal Orchestrator Skeleton

```python
# ai/body_mesh/service.py
from .adapters.base import (
    SegmentationAdapter, KeypointAdapter, BodyMeshAdapter,
    FaceIdentityAdapter, ClothedSurfaceAdapter,
)
from .preprocess.video import extract_keyframes
from .preprocess.quality import quality_gate
from .fit.multi_view_smplx import fuse_shape
from .fit.flame_merge import merge_flame_into_smplx
from .fit.clothed_fuse import aggregate_clothed
from .texture.project import project_uv
from .texture.skin_match import anchor_skin_tone
from .measurements import extract_measurements

async def run_capture(video_path: str, height_cm: int, gender: str,
                      seg: SegmentationAdapter, kpt: KeypointAdapter,
                      body: BodyMeshAdapter, face: FaceIdentityAdapter,
                      clothed: ClothedSurfaceAdapter) -> BodyMeshArtifact:
    frames = extract_keyframes(video_path, n=12)
    quality_gate(frames)  # raises HTTP 422 on failure

    masks = [seg.segment(f) for f in frames]
    kpts  = [kpt.detect(f) for f in frames]

    per_frame_fits = [body.fit([f], [k], gender) for f, k in zip(frames, kpts)]
    fused = fuse_shape(per_frame_fits, height_cm=height_cm)

    face_fit = face.fit(pick_sharpest_front(frames, kpts))
    fused = merge_flame_into_smplx(fused, face_fit)

    clothed_mesh = aggregate_clothed(clothed, frames, masks, fused)
    textured = project_uv(clothed_mesh, frames, masks)
    textured = anchor_skin_tone(textured, face_fit.skin_sample)

    measurements = extract_measurements(fused.body_vertices)
    return package_artifact(textured, fused, face_fit, measurements)
```

## Measurement Extraction

Always computed from the **SMPL-X base layer**, not the clothed surface (clothing biases circumferences upward).

```python
def compute_circumference(vertices_m: np.ndarray, ring_indices: list[int]) -> float:
    v = vertices_m[ring_indices]
    return float(np.linalg.norm(v - np.roll(v, -1, axis=0), axis=1).sum() * 100)  # cm
```

See `resources/smplx-vertex-indices.md` for ring definitions (bust, underbust, waist, hips, thigh, neck, etc.).

## Pitfalls on M2

1. **MPS op gaps**: always set `PYTORCH_ENABLE_MPS_FALLBACK=1`. Without it, SIFU/HMR2 crash on certain kernels.
2. **Memory pressure**: serialize stages. After each adapter runs: `del model; gc.collect(); torch.mps.empty_cache()`.
3. **fp16 where possible**: `model.half()` on MPS halves memory with negligible quality loss.
4. **No `torch.compile`** on MPS for these models — it silently falls back to eager + breaks many graphs.
5. **nvdiffrast CUDA-only**: use CPU `pyrender` rasterizer for texture projection; acceptable (seconds, not minutes).
6. **Skin-tone drift**: do NOT average skin colour across the whole body — clothing contaminates. Sample only from face/neck skin pixels, then paint occluded regions.
7. **Rotation span**: videos where the user stops mid-turn produce garbage shape fusion. Quality gate rejects span < 300°.

## Output Schema (Pydantic v2)

```python
class BodyMeshArtifact(BaseModel):
    user_id: UUID
    clothed_glb_key: str
    clothed_thumbnail_key: str
    body_glb_key: str
    body_betas_key: str
    face_glb_key: str | None
    flame_params_key: str | None
    face_identity_preserved: bool
    arcface_similarity: float | None
    measurements: Measurements          # see spec §7
    model_versions: dict[str, str]
    created_at: datetime
    runtime_ms: int
    hardware: Literal["mps", "cpu", "cuda"]
```

`body_glb_key` + `body_betas_key` are the **contract** with the VTON pipeline (separate spec).

## Validation

```bash
# Full pipeline on a fixture video
python -m ai.body_mesh.worker --video tests/fixtures/good_video.mp4 \
    --height 172 --gender neutral --out /tmp/zora_artifact

# Expected:
# [PASS] 12 keyframes extracted, rotation span 348°
# [PASS] SAM2-Tiny masks IoU > 0.9
# [PASS] HMR2.0 per-frame fits valid
# [PASS] shared β converged (loss < 0.02)
# [PASS] MICA ArcFace similarity = 0.71
# [PASS] SIFU clothed offsets within [0, 12] cm
# [PASS] measurements within plausible ranges
# [PASS] artifact written to /tmp/zora_artifact/
```

See the spec for the full test matrix (unit, integration, E2E, fallback, performance, privacy).

## Script References
- `scripts/extract_measurements.py` — vertex ring → circumference
- `scripts/test_smplx.py` — end-to-end smoke test on fixture video
- `resources/smplx-vertex-indices.md` — vertex indices for measurement rings
