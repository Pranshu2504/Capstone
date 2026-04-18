"""
Person segmentation using MediaPipe Selfie Segmentation.
Runs on Apple Neural Engine (ANE) — fastest on M2.
"""
from __future__ import annotations

import logging

import numpy as np

from .base import SegmentationAdapter

logger = logging.getLogger(__name__)


class MediaPipeSelfieAdapter(SegmentationAdapter):
    def __init__(self):
        self._seg = None

    def load(self) -> None:
        if self._seg is not None:
            return
        import mediapipe as mp
        self._seg = mp.solutions.selfie_segmentation.SelfieSegmentation(model_selection=1)
        logger.info("MediaPipe SelfieSegmentation loaded (model_selection=1 landscape)")

    def unload(self) -> None:
        if self._seg:
            self._seg.close()
            self._seg = None

    def segment(self, img: np.ndarray) -> np.ndarray:
        result = self._seg.process(img)
        # condition_mask is float32 in [0, 1]
        mask_f = result.segmentation_mask
        binary = (mask_f > 0.5).astype(np.uint8) * 255
        return binary
