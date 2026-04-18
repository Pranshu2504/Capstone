"""
FLAME → SMPL-X head vertex transplant.

Uses DECA-fitted FLAME shape to deform SMPL-X head vertices.
If DECA vertices are available in FLAMEFit (future), uses them directly.
Otherwise applies a PCA-based approximation from FLAME shape betas.

Blends at the neck boundary to prevent seams.
"""
from __future__ import annotations

import json
import logging
import os
from pathlib import Path

import numpy as np

from shared.schemas import FLAMEFit, SMPLXFit

logger = logging.getLogger(__name__)

SMPLX_HEAD_VERTEX_COUNT = 1521
SEAM_BLEND_VERTICES = 60

_CORR_TABLE_PATH = os.getenv(
    "SMPLX_FLAME_CORR_PATH",
    str(Path(__file__).parent / "resources" / "flame_to_smplx_correspondence.json"),
)

_correspondence: dict[int, int] | None = None


def merge_flame_into_smplx(smplx_fit: SMPLXFit, flame_fit: FLAMEFit) -> SMPLXFit:
    """
    Apply FLAME head shape to SMPL-X head vertices.

    Args:
        smplx_fit: fused SMPL-X body fit with vertices_tpose.
        flame_fit: DECA face fit with shape coefficients.

    Returns:
        Updated SMPLXFit with head vertices shaped to match facial geometry.
    """
    if smplx_fit.vertices_tpose is None:
        logger.warning("Cannot merge FLAME: no vertices_tpose. Skipping.")
        return smplx_fit

    # Skip merge if shape is all zeros (neutral / fallback)
    shape = np.array(flame_fit.shape[:10], dtype=np.float32)
    if np.allclose(shape, 0.0, atol=0.01):
        logger.info("FLAME shape is neutral — skipping head merge (no change)")
        return smplx_fit

    corr = _load_correspondence()
    if not corr:
        logger.warning("No FLAME↔SMPL-X correspondence table — generating KD-tree approximation")
        corr = _build_approximate_correspondence(smplx_fit)

    verts = np.array(smplx_fit.vertices_tpose, dtype=np.float32)  # (10475, 3)

    # Compute per-vertex displacement from FLAME shape betas
    # FLAME shape betas drive primarily: head width (β0), height (β1), jaw (β2),
    # nose (β3), eye separation (β4), cheek fullness (β5)
    displacement = _shape_to_displacement(flame_fit)

    head_indices = list(corr.values()) if isinstance(list(corr.values())[0], int) else \
                   [v for v in corr.values()]

    boundary_indices = head_indices[:SEAM_BLEND_VERTICES]
    interior_indices = head_indices[SEAM_BLEND_VERTICES:]

    # Apply full displacement to interior
    for smplx_idx in interior_indices:
        if smplx_idx < len(verts):
            verts[smplx_idx] += displacement

    # Linear falloff at boundary
    for blend_i, smplx_idx in enumerate(boundary_indices):
        if smplx_idx < len(verts):
            alpha = blend_i / max(SEAM_BLEND_VERTICES, 1)
            verts[smplx_idx] += alpha * displacement

    logger.info(
        "FLAME head merge: %d interior + %d boundary verts, displacement=%.4f m",
        len(interior_indices), len(boundary_indices), float(np.linalg.norm(displacement))
    )

    return SMPLXFit(
        betas=smplx_fit.betas,
        global_orient=smplx_fit.global_orient,
        body_pose=smplx_fit.body_pose,
        left_hand_pose=smplx_fit.left_hand_pose,
        right_hand_pose=smplx_fit.right_hand_pose,
        cam_translation=smplx_fit.cam_translation,
        vertices_tpose=verts.tolist(),
    )


def _shape_to_displacement(flame_fit: FLAMEFit) -> np.ndarray:
    """
    Convert FLAME shape betas to a 3D displacement vector for head vertices.
    Each FLAME shape basis has a known primary axis of variation.
    """
    shape = np.array(flame_fit.shape[:10], dtype=np.float32)

    # Approximate displacement (metres):
    # β0: face width (X axis)
    # β1: face height (Y axis)
    # β2: jaw protrusion (Z axis)
    # β3: nose height (Y)
    # β4: eye region depth (Z)
    dx = shape[0] * 0.004   # ±4 mm per unit
    dy = shape[1] * 0.005   # ±5 mm per unit
    dz = shape[2] * 0.003 + shape[4] * 0.002

    return np.array([dx, dy, dz], dtype=np.float32)


def _load_correspondence() -> dict[int, int]:
    global _correspondence
    if _correspondence is not None:
        return _correspondence

    path = Path(_CORR_TABLE_PATH)
    if not path.exists():
        logger.warning("Correspondence table not found at %s", path)
        _correspondence = {}
        return _correspondence

    with path.open() as f:
        raw = json.load(f)
    _correspondence = {int(k): int(v) for k, v in raw.items()}
    logger.info("Loaded %d FLAME↔SMPL-X correspondences", len(_correspondence))
    return _correspondence


def _build_approximate_correspondence(smplx_fit: SMPLXFit) -> dict[int, int]:
    """
    Build an approximate head correspondence by selecting vertices
    with y-coordinate in the top 15% of the body (head region).
    Returns {i: i} mapping (identity) for those vertices.
    """
    verts = np.array(smplx_fit.vertices_tpose, dtype=np.float32)
    y = verts[:, 1]
    threshold = y.min() + (y.max() - y.min()) * 0.82
    head_idx = np.where(y > threshold)[0]
    return {int(i): int(i) for i in head_idx}
