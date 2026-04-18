"""
Person segmentation using rembg (u2net_human_seg).
Works on M2 via onnxruntime — no CUDA needed.
"""
from __future__ import annotations

import logging

import numpy as np

from .base import SegmentationAdapter

logger = logging.getLogger(__name__)


class RembgAdapter(SegmentationAdapter):
    def __init__(self):
        self._session = None

    def load(self) -> None:
        if self._session is not None:
            return
        from rembg import new_session
        # u2net_human_seg is tuned specifically for full-body person segmentation
        self._session = new_session("isnet-general-use")
        logger.info("rembg isnet-general-use loaded")

    def unload(self) -> None:
        self._session = None
        import gc
        gc.collect()

    def segment(self, img: np.ndarray) -> np.ndarray:
        """
        Args:
            img: (H, W, 3) uint8 RGB
        Returns:
            mask: (H, W) uint8 — 255 = person, 0 = background
        """
        from rembg import remove
        from PIL import Image

        pil = Image.fromarray(img)
        result = remove(pil, session=self._session, only_mask=True)
        mask = np.array(result)
        # only_mask=True returns a grayscale PIL; threshold at 128
        if mask.ndim == 3:
            mask = mask[:, :, 0]
        binary = (mask > 128).astype(np.uint8) * 255
        return binary
