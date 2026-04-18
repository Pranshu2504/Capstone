"""
Multi-view SMPL-X shape fusion.

Given per-frame SMPLXFit estimates (one β per frame), compute a single
shared β that best explains all views. We minimise the weighted mean of
the per-frame β values using a soft regulariser, because we do not have
a differentiable renderer available on MPS for true reprojection loss.

For full accuracy (server deployment with nvdiffrast/CUDA), replace
`fuse_shape` with a real gradient-descent reprojection optimizer.
"""
from __future__ import annotations

import logging

import numpy as np

from shared.schemas import SMPLXFit

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────
BETA_CLAMP = 5.0          # max absolute beta value (physical plausibility)
CONFIDENCE_WEIGHT_POWER = 2.0   # square keypoint confidence for weighting


def fuse_shape(
    per_frame_fits: list[SMPLXFit],
    height_cm: float | None = None,
) -> SMPLXFit:
    """
    Compute a single shared SMPL-X beta vector from multiple per-frame fits.

    Strategy (lightweight, MPS-safe):
      1. Collect β vectors from all frames.
      2. Weight each frame by its average keypoint confidence (if available).
      3. Compute weighted mean β.
      4. Clamp to [-5, 5].
      5. Optionally scale vertices so body height matches height_cm.

    Returns:
        A single SMPLXFit whose `betas` is the fused shape and
        `vertices_tpose` is computed from the fused shape (if available).
        Pose/cam are taken from the best-confidence frame.
    """
    if not per_frame_fits:
        raise ValueError("Need at least one per-frame fit to fuse.")

    betas_stack = np.array([f.betas for f in per_frame_fits], dtype=np.float32)  # (N, 10)
    weights = _compute_frame_weights(per_frame_fits)   # (N,)

    fused_betas = np.average(betas_stack, axis=0, weights=weights)
    fused_betas = np.clip(fused_betas, -BETA_CLAMP, BETA_CLAMP)

    # Use the best-confidence frame's pose and camera
    best_idx = int(np.argmax(weights))
    best_frame = per_frame_fits[best_idx]

    # Aggregate T-pose vertices if present (simple mean over available frames)
    fused_vertices = _fuse_vertices(per_frame_fits, weights)

    if height_cm is not None and fused_vertices is not None:
        fused_vertices = _scale_to_height(fused_vertices, height_cm)

    logger.info(
        "Fused %d frames → β̄ mean=%.3f std=%.3f (weight range [%.2f, %.2f])",
        len(per_frame_fits),
        float(fused_betas.mean()),
        float(fused_betas.std()),
        float(weights.min()),
        float(weights.max()),
    )

    return SMPLXFit(
        betas=fused_betas.tolist(),
        global_orient=best_frame.global_orient,
        body_pose=best_frame.body_pose,
        left_hand_pose=best_frame.left_hand_pose,
        right_hand_pose=best_frame.right_hand_pose,
        cam_translation=best_frame.cam_translation,
        vertices_tpose=fused_vertices,
    )


def compute_beta_diversity(per_frame_fits: list[SMPLXFit]) -> float:
    """
    Returns the mean std of β across frames — a measure of view consistency.
    Low diversity (< 0.2) means all views agree on body shape (good).
    """
    betas = np.array([f.betas for f in per_frame_fits])
    return float(betas.std(axis=0).mean())


# ── Internal ──────────────────────────────────────────────────────────────────

def _compute_frame_weights(fits: list[SMPLXFit]) -> np.ndarray:
    """
    Weight each frame by confidence-related signal.
    Currently: uniform (1/N) since SMPLXFit doesn't carry explicit confidence.
    Extend here once HMR2.0 exposes per-frame confidence scores.
    """
    n = len(fits)
    return np.ones(n, dtype=np.float32) / n


def _fuse_vertices(
    fits: list[SMPLXFit], weights: np.ndarray
) -> list[list[float]] | None:
    """Weighted mean of T-pose vertices across frames that have them."""
    available = [(f.vertices_tpose, w) for f, w in zip(fits, weights) if f.vertices_tpose]
    if not available:
        return None
    verts_list, w_list = zip(*available)
    verts_stack = np.array(verts_list, dtype=np.float32)  # (K, 10475, 3)
    w_arr = np.array(w_list, dtype=np.float32)
    w_arr /= w_arr.sum()
    fused = np.einsum("k,kij->ij", w_arr, verts_stack)   # (10475, 3)
    return fused.tolist()


def _scale_to_height(
    vertices: list[list[float]], target_height_cm: float
) -> list[list[float]]:
    """
    Scale vertices so that (head_top_y - foot_y) == target_height_cm.
    SMPL-X vertices are in metres; we scale uniformly.
    """
    v = np.array(vertices, dtype=np.float32)
    current_height_m = float(v[:, 1].max() - v[:, 1].min())
    if current_height_m < 0.01:
        return vertices  # degenerate mesh — don't scale
    target_height_m = target_height_cm / 100.0
    scale = target_height_m / current_height_m
    v *= scale
    logger.debug(
        "Scaled mesh from %.2f m to %.2f m (target %d cm)",
        current_height_m, float(v[:, 1].max() - v[:, 1].min()), int(target_height_cm),
    )
    return v.tolist()
