"""
Shared Pydantic v2 schemas for the ZORA AI service.
All inter-module data contracts live here.
"""
from __future__ import annotations

import math
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, Field, field_validator, model_validator


# ---------------------------------------------------------------------------
# Enums / literals
# ---------------------------------------------------------------------------

QualityErrorCode = Literal[
    "BLUR",
    "LOW_LIGHT",
    "INCOMPLETE_ROTATION",
    "BODY_CROPPED",
    "FACE_NOT_DETECTED",
    "UNSUPPORTED_VIDEO",
    "FILE_TOO_LARGE",
]

JobState = Literal[
    "queued",
    "preprocessing",
    "segmenting",
    "fitting",
    "face_fitting",
    "clothed_reconstruction",
    "texturing",
    "measuring",
    "packaging",
    "uploading",
    "complete",
    "failed",
]

Hardware = Literal["mps", "cpu", "cuda"]


# ---------------------------------------------------------------------------
# Request schemas
# ---------------------------------------------------------------------------

class CaptureRequest(BaseModel):
    user_id: UUID
    gender_hint: Literal["neutral", "male", "female"] = "neutral"
    height_cm: int = Field(ge=120, le=230, description="User's height in cm (anchor measurement)")


# ---------------------------------------------------------------------------
# Intermediate pipeline schemas
# ---------------------------------------------------------------------------

class Keypoint(BaseModel):
    x: float
    y: float
    confidence: float = Field(ge=0.0, le=1.0)


class Keypoints2D(BaseModel):
    """Detected 2D keypoints for one frame."""
    body: list[Keypoint] = Field(description="133 whole-body keypoints (halpe format)")
    hands: list[Keypoint] | None = None
    face: list[Keypoint] | None = Field(default=None, description="468 MediaPipe FaceMesh landmarks")
    frame_index: int = 0
    sharpness_score: float = Field(default=0.0, ge=0.0)

    @field_validator("body")
    @classmethod
    def body_must_have_keypoints(cls, v: list[Keypoint]) -> list[Keypoint]:
        # 17=COCO, 25=body_25(OpenPose), 33=BlazePose(MediaPipe), 133=halpe(ViTPose)
        if len(v) not in (17, 25, 33, 133):
            raise ValueError(f"body must have 17, 25, 33, or 133 keypoints, got {len(v)}")
        return v


class SMPLXFit(BaseModel):
    """Result of SMPL-X body fitting for a single frame (or fused multi-view)."""
    betas: list[float] = Field(description="Shape coefficients (10-dim)")
    global_orient: list[float] = Field(description="Root orientation (3 axis-angle floats)")
    body_pose: list[float] = Field(description="Body joint poses (63 floats = 21×3)")
    left_hand_pose: list[float] | None = None
    right_hand_pose: list[float] | None = None
    cam_translation: list[float] = Field(description="Weak-perspective camera (3 floats: tx, ty, tz)")
    # Optional: raw vertices in T-pose (set after multi-view fusion)
    vertices_tpose: list[list[float]] | None = Field(
        default=None, description="(10475, 3) SMPL-X vertices in T-pose, metres"
    )

    @field_validator("betas")
    @classmethod
    def clamp_betas(cls, v: list[float]) -> list[float]:
        return [max(-5.0, min(5.0, b)) for b in v]

    @field_validator("betas")
    @classmethod
    def betas_length(cls, v: list[float]) -> list[float]:
        if len(v) not in (10, 16, 300):
            raise ValueError(f"betas must be 10, 16, or 300 dims, got {len(v)}")
        return v


class FLAMEFit(BaseModel):
    """FLAME face model fit result from MICA."""
    shape: list[float] = Field(description="FLAME shape coefficients (100-dim)")
    expression: list[float] = Field(description="FLAME expression (50-dim, neutralized to ~0)")
    texture_uv_path: str | None = Field(default=None, description="Local path to 256×256 UV texture PNG")
    arcface_similarity: float | None = Field(default=None, ge=0.0, le=1.0)
    skin_sample_rgb: list[int] | None = Field(
        default=None, description="Mean face/neck skin RGB [R, G, B] sampled in best-lit patch"
    )

    @field_validator("shape")
    @classmethod
    def shape_dim(cls, v: list[float]) -> list[float]:
        if len(v) != 100:
            raise ValueError(f"FLAME shape must be 100-dim, got {len(v)}")
        return v

    @field_validator("expression")
    @classmethod
    def expression_dim(cls, v: list[float]) -> list[float]:
        if len(v) != 50:
            raise ValueError(f"FLAME expression must be 50-dim, got {len(v)}")
        return v

    @model_validator(mode="after")
    def warn_low_arcface(self) -> "FLAMEFit":
        if self.arcface_similarity is not None and self.arcface_similarity < 0.55:
            import warnings
            warnings.warn(
                f"ArcFace similarity {self.arcface_similarity:.3f} below 0.55 identity threshold",
                stacklevel=2,
            )
        return self


class ClothedMesh(BaseModel):
    """Clothed surface from SIFU/ECON, expressed as per-vertex offsets from SMPL-X."""
    obj_path: str = Field(description="Local path to reconstructed clothed .obj file")
    vertex_offsets_cm: list[float] | None = Field(
        default=None, description="Per-vertex offset magnitudes in cm (clamp 0..8)"
    )
    degraded: bool = Field(default=False, description="True if clothed reconstruction fell back to texture-only")


# ---------------------------------------------------------------------------
# Measurements
# ---------------------------------------------------------------------------

class Measurements(BaseModel):
    """Body measurements in cm extracted from the naked SMPL-X base layer."""
    height_cm: float = Field(ge=100.0, le=250.0)
    bust_cm: float = Field(ge=50.0, le=200.0)
    underbust_cm: float = Field(ge=40.0, le=180.0)
    chest_cm: float = Field(ge=50.0, le=200.0)
    waist_cm: float = Field(ge=40.0, le=200.0)
    hips_cm: float = Field(ge=50.0, le=220.0)
    thigh_cm: float = Field(ge=20.0, le=130.0)
    inseam_cm: float = Field(ge=30.0, le=120.0)
    shoulder_cm: float = Field(ge=20.0, le=70.0)
    arm_length_cm: float = Field(ge=30.0, le=100.0)
    neck_cm: float = Field(ge=20.0, le=60.0)

    @model_validator(mode="after")
    def cross_validate(self) -> "Measurements":
        if self.waist_cm >= self.bust_cm:
            raise ValueError(f"waist_cm ({self.waist_cm}) must be < bust_cm ({self.bust_cm})")
        if self.underbust_cm >= self.bust_cm:
            raise ValueError(f"underbust_cm ({self.underbust_cm}) must be < bust_cm ({self.bust_cm})")
        if self.inseam_cm >= self.height_cm * 0.65:
            raise ValueError(f"inseam_cm ({self.inseam_cm}) implausibly large for height {self.height_cm}")
        return self


# ---------------------------------------------------------------------------
# Output artifact
# ---------------------------------------------------------------------------

class BodyMeshArtifact(BaseModel):
    """
    Final output of the body mesh capture pipeline.
    body_glb_key + body_betas_key form the VTON handoff contract.
    """
    user_id: UUID

    # Clothed avatar (visible to user)
    clothed_glb_key: str = Field(description="S3 key: clothed textured avatar GLB")
    clothed_thumbnail_key: str = Field(description="S3 key: 512×512 frontal thumbnail JPEG")

    # Inner body layer (consumed by VTON pipeline)
    body_glb_key: str = Field(description="S3 key: naked SMPL-X T-pose GLB (10475 vertices)")
    body_betas_key: str = Field(description="S3 key: SMPL-X betas .npy (dim 10)")

    # Face layer
    face_glb_key: str | None = None
    flame_params_key: str | None = None
    face_identity_preserved: bool = False
    arcface_similarity: float | None = Field(default=None, ge=0.0, le=1.0)

    # Skin (used by VTON for texture seeding)
    skin_tone_rgb: list[int] | None = Field(
        default=None, description="[R, G, B] uint8 mean skin tone from face/neck region"
    )

    measurements: Measurements
    model_versions: dict[str, str] = Field(
        description='e.g. {"body": "hmr2@1.0", "face": "mica@0.9", "clothed": "sifu@0.3"}'
    )
    created_at: datetime
    runtime_ms: int = Field(ge=0)
    hardware: Hardware
    degraded: bool = Field(default=False, description="True if any fallback was engaged")

    @field_validator("skin_tone_rgb")
    @classmethod
    def validate_rgb(cls, v: list[int] | None) -> list[int] | None:
        if v is not None:
            if len(v) != 3 or not all(0 <= c <= 255 for c in v):
                raise ValueError("skin_tone_rgb must be [R, G, B] with values 0–255")
        return v


# ---------------------------------------------------------------------------
# Job status (polling)
# ---------------------------------------------------------------------------

STAGE_PROGRESS: dict[str, int] = {
    "queued": 0,
    "preprocessing": 5,
    "segmenting": 20,
    "fitting": 40,
    "face_fitting": 55,
    "clothed_reconstruction": 65,
    "texturing": 80,
    "measuring": 88,
    "packaging": 93,
    "uploading": 97,
    "complete": 100,
    "failed": 0,
}


class JobStatus(BaseModel):
    job_id: str
    user_id: UUID
    state: JobState
    progress_pct: int = Field(ge=0, le=100)
    step_detail: str | None = None
    artifact: BodyMeshArtifact | None = None
    error_code: QualityErrorCode | None = None
    error_detail: str | None = None
    created_at: datetime
    updated_at: datetime

    @model_validator(mode="after")
    def sync_progress(self) -> "JobStatus":
        self.progress_pct = STAGE_PROGRESS.get(self.state, self.progress_pct)
        return self


# ---------------------------------------------------------------------------
# VTON handoff contract (snapshot type — do not mutate)
# ---------------------------------------------------------------------------

class VTONHandoff(BaseModel):
    """Minimal data the VTON pipeline needs from this pipeline's output."""
    user_id: UUID
    body_glb_key: str
    body_betas: list[float]                   # 10-dim
    smplx_vertex_count: int = 10475
    face_glb_key: str | None = None
    skin_tone_rgb: list[int] | None = None    # [R, G, B]
    measurements: Measurements
