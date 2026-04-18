"""
Body keypoints + face landmarks from MediaPipe.
- Body: 33 BlazePose landmarks → mapped to Keypoints2D.body (33 kpts)
- Face: 468 FaceMesh landmarks → Keypoints2D.face
Runs natively on Apple Silicon (ANE / CPU).
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

from .base import KeypointAdapter
from shared.schemas import Keypoint, Keypoints2D

logger = logging.getLogger(__name__)

# Sharpness threshold below which we consider a frame too blurry for face
SHARPNESS_BLUR_THRESHOLD = 80.0


class MediaPipePoseAdapter(KeypointAdapter):
    """Detects 33 body + 468 face landmarks per frame."""

    def __init__(self):
        self._holistic = None

    def load(self) -> None:
        if self._holistic is not None:
            return
        import mediapipe as mp
        self._holistic = mp.solutions.holistic.Holistic(
            static_image_mode=True,
            model_complexity=2,       # highest accuracy
            enable_segmentation=False,
            refine_face_landmarks=True,
        )
        logger.info("MediaPipe Holistic loaded (complexity=2)")

    def unload(self) -> None:
        if self._holistic:
            self._holistic.close()
            self._holistic = None

    def detect(self, img: np.ndarray, mask: np.ndarray | None = None) -> Keypoints2D:
        """
        Args:
            img:  (H, W, 3) uint8 RGB
            mask: optional person mask (not used by MediaPipe but recorded)
        Returns:
            Keypoints2D with 33 body + optional 468 face kpts
        """
        result = self._holistic.process(img)
        h, w = img.shape[:2]

        body_kpts = _extract_pose(result, h, w)
        face_kpts = _extract_face(result, h, w)

        sharpness = _laplacian_var(img)

        return Keypoints2D(
            body=body_kpts,
            face=face_kpts if face_kpts else None,
            sharpness_score=sharpness,
        )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _extract_pose(result, h: int, w: int) -> list[Keypoint]:
    """Extract 33 BlazePose landmarks. Returns dummy low-confidence if not detected."""
    if result.pose_landmarks is None:
        return [Keypoint(x=0.5, y=0.5, confidence=0.0)] * 33
    kpts = []
    for lm in result.pose_landmarks.landmark:
        kpts.append(Keypoint(
            x=float(lm.x),           # normalized [0, 1]
            y=float(lm.y),
            confidence=float(lm.visibility),
        ))
    return kpts


def _extract_face(result, h: int, w: int) -> list[Keypoint] | None:
    """Extract 468 FaceMesh landmarks."""
    if result.face_landmarks is None:
        return None
    kpts = []
    for lm in result.face_landmarks.landmark:
        kpts.append(Keypoint(
            x=float(lm.x),
            y=float(lm.y),
            confidence=1.0,   # FaceMesh doesn't output confidence
        ))
    return kpts


def _laplacian_var(img: np.ndarray) -> float:
    gray = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    return float(cv2.Laplacian(gray, cv2.CV_64F).var())
