"""
Skin tone anchoring.

Samples face/neck skin pixels from the best-lit front frame,
computes mean LAB colour, and uses it to fill occluded skin regions
in the UV atlas (arms, neck back, hands) with a consistent tone.
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# MediaPipe face mesh landmark indices for the inner face (forehead + cheeks)
# Used to sample skin colour avoiding lips, eyes, eyebrows
FACE_SKIN_MP_INDICES = [10, 338, 297, 332, 284, 251, 389, 356, 454, 323,
                         361, 288, 397, 365, 379, 378, 400, 377, 152, 148,
                         176, 149, 150, 136, 172, 58, 132, 93, 234, 127,
                         162, 21, 54, 103, 67, 109]


def sample_skin_tone(
    frame: np.ndarray,
    face_landmarks: list | None,
) -> list[int]:
    """
    Sample mean skin RGB from the face region.

    Args:
        frame:           (H, W, 3) uint8 RGB — best front frame.
        face_landmarks:  list of Keypoint objects (MediaPipe 468 landmarks) or None.

    Returns:
        [R, G, B] uint8 mean skin tone.
    """
    h, w = frame.shape[:2]

    if face_landmarks and len(face_landmarks) >= 468:
        # Sample pixels at face-skin landmark positions
        pixels = []
        for idx in FACE_SKIN_MP_INDICES:
            if idx < len(face_landmarks):
                lm = face_landmarks[idx]
                px, py = int(lm.x * w), int(lm.y * h)
                px = max(0, min(w - 1, px))
                py = max(0, min(h - 1, py))
                pixels.append(frame[py, px])

        if pixels:
            mean_rgb = np.mean(pixels, axis=0).astype(int).tolist()
            logger.debug("Skin tone sampled from %d face landmarks: RGB=%s", len(pixels), mean_rgb)
            return mean_rgb

    # Fallback: sample from upper-centre region (face area heuristic)
    top_h = int(h * 0.15)
    bot_h = int(h * 0.45)
    left_w = int(w * 0.35)
    right_w = int(w * 0.65)
    region = frame[top_h:bot_h, left_w:right_w]
    if region.size == 0:
        return [200, 170, 140]   # neutral fallback
    mean_rgb = region.mean(axis=(0, 1)).astype(int).tolist()
    logger.debug("Skin tone sampled from face-region heuristic: RGB=%s", mean_rgb)
    return mean_rgb


def apply_skin_to_occluded(
    texture_atlas: np.ndarray,
    skin_rgb: list[int],
    hole_threshold: int = 12,
) -> np.ndarray:
    """
    Fill very dark / near-black holes in the UV atlas with the sampled skin tone.
    These are regions never seen in any camera view.

    Args:
        texture_atlas:   (H, W, 3) uint8 RGB texture.
        skin_rgb:        [R, G, B] fill colour.
        hole_threshold:  pixels with mean channel < this are considered holes.

    Returns:
        Filled texture atlas (uint8 RGB).
    """
    atlas = texture_atlas.copy()
    gray = atlas.mean(axis=2)
    hole_mask = gray < hole_threshold
    atlas[hole_mask] = skin_rgb
    n_filled = int(hole_mask.sum())
    if n_filled > 0:
        logger.debug("Filled %d occluded texels with skin tone %s", n_filled, skin_rgb)
    return atlas


def delta_e_lab(rgb1: list[int], rgb2: list[int]) -> float:
    """
    Compute CIE ΔE*ab between two RGB colours (for identity/skin-tone testing).
    """
    def to_lab(rgb):
        arr = np.array([[rgb]], dtype=np.uint8)
        bgr = arr[:, :, ::-1]
        lab = cv2.cvtColor(bgr, cv2.COLOR_BGR2LAB)
        return lab[0, 0].astype(float)

    lab1 = to_lab(rgb1)
    lab2 = to_lab(rgb2)
    return float(np.linalg.norm(lab1 - lab2))
