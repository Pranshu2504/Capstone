"""
Mock adapters for testing — no real model weights needed.
Set env var SEGMENTATION_MODEL=mock etc. to use in tests.
"""
from __future__ import annotations

import numpy as np

from shared.schemas import (
    ClothedMesh, FLAMEFit, Keypoint, Keypoints2D, SMPLXFit,
)
from .base import (
    BodyMeshAdapter, ClothedSurfaceAdapter, FaceIdentityAdapter,
    KeypointAdapter, SegmentationAdapter,
)

# ── Fixed test betas (known-good neutral SMPL-X shape) ───────────────────────
NEUTRAL_BETAS = [0.0] * 10

# ── Neutral SMPL-X T-pose vertex placeholder (1 vertex for schema compat) ────
MOCK_VERTICES_TPOSE: list[list[float]] = [[0.0, 0.0, 0.0]] * 10475


class MockSegmentationAdapter(SegmentationAdapter):
    """Returns a rectangle mask covering the centre 60% of the frame."""

    def load(self) -> None: pass
    def unload(self) -> None: pass

    def segment(self, img: np.ndarray) -> np.ndarray:
        h, w = img.shape[:2]
        mask = np.zeros((h, w), dtype=np.uint8)
        r0, r1 = int(h * 0.2), int(h * 0.8)
        c0, c1 = int(w * 0.2), int(w * 0.8)
        mask[r0:r1, c0:c1] = 255
        return mask


class MockKeypointAdapter(KeypointAdapter):
    """Returns 133 evenly distributed keypoints with confidence=0.9."""

    def load(self) -> None: pass
    def unload(self) -> None: pass

    def detect(self, img: np.ndarray, mask: np.ndarray | None = None) -> Keypoints2D:
        h, w = img.shape[:2]
        body = [
            Keypoint(x=float(i % w) / w, y=float(i // w) / max(h, 1), confidence=0.9)
            for i in range(133)
        ]
        lap = float(np.var(np.array([[1, -2, 1]])))  # placeholder sharpness
        return Keypoints2D(body=body, sharpness_score=150.0)


class MockBodyMeshAdapter(BodyMeshAdapter):
    """Returns a neutral SMPL-X fit for every frame."""

    def load(self) -> None: pass
    def unload(self) -> None: pass

    def fit(
        self, frames: list[np.ndarray], keypoints: list[Keypoints2D], gender: str = "neutral"
    ) -> list[SMPLXFit]:
        return [
            SMPLXFit(
                betas=list(NEUTRAL_BETAS),
                global_orient=[0.0, 0.0, 0.0],
                body_pose=[0.0] * 63,
                cam_translation=[0.0, 0.0, 2.5],
                vertices_tpose=MOCK_VERTICES_TPOSE,
            )
            for _ in frames
        ]


class MockFaceIdentityAdapter(FaceIdentityAdapter):
    """Returns a neutral FLAME fit with synthetic identity."""

    def load(self) -> None: pass
    def unload(self) -> None: pass

    def fit(self, face_img: np.ndarray) -> FLAMEFit:
        return FLAMEFit(
            shape=[0.0] * 100,
            expression=[0.0] * 50,
            arcface_similarity=0.72,
            skin_sample_rgb=[200, 160, 130],
        )


class MockClothedSurfaceAdapter(ClothedSurfaceAdapter):
    """Returns a degraded ClothedMesh (no real reconstruction)."""

    def load(self) -> None: pass
    def unload(self) -> None: pass

    def reconstruct(
        self,
        frames: list[np.ndarray],
        masks: list[np.ndarray],
        base_fit: SMPLXFit,
        output_dir: str,
    ) -> ClothedMesh:
        import os
        placeholder = os.path.join(output_dir, "mock_clothed.obj")
        # Write minimal valid OBJ
        os.makedirs(output_dir, exist_ok=True)
        with open(placeholder, "w") as f:
            f.write("# Mock clothed mesh\nv 0 0 0\n")
        return ClothedMesh(obj_path=placeholder, degraded=True)
