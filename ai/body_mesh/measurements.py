"""
Extract body measurements (cm) from SMPL-X T-pose vertices.

Measurements are computed from the SMPL-X base layer (not the clothed surface).
All vertex indices reference the SMPL-X 10,475-vertex topology.
Units: SMPL-X vertices are in metres → multiply by 100 for cm.
"""
from __future__ import annotations

import logging
import warnings
from pathlib import Path

import numpy as np

from shared.schemas import Measurements

logger = logging.getLogger(__name__)

# ── Vertex index definitions ──────────────────────────────────────────────────
# See ai/.claude/skills/body-mesh/resources/smplx-vertex-indices.md for full table.
# These are approximate ring indices — replace with the exact published indices
# once SMPL-X model weights are available and the mesh can be inspected.

VERTEX_INDICES: dict[str, list[int] | tuple[int, int]] = {
    # Point landmarks (computed from SMPLX_NEUTRAL.npz v_template + J_regressor)
    "head_top":         9003,         # crown of head (highest Y vertex)
    "foot_heel_l":      5916,         # left heel (lowest Y on left foot)
    "shoulder_l":       4490,         # left acromion (closest vertex to joint 16)
    "shoulder_r":       7227,         # right acromion (closest vertex to joint 17)
    "wrist_l":          4717,         # left wrist (closest vertex to joint 20)
    "wrist_r":          7453,         # right wrist (closest vertex to joint 21)
    "crotch":           7161,         # crotch point (inner thigh, near midline)

    # Ring landmarks (vertex indices forming closed circumference rings,
    # computed from Y-slicing the torso region with |X| < 0.25 to exclude arms,
    # sorted by angle around the Y axis)
    "bust_ring":        [6913, 6146, 8214, 6880, 7189, 8241, 8242, 8327, 5633, 5522,
                         5521, 4453, 4136, 5480, 3385, 4169, 5441, 5643, 3895, 3894,
                         6642, 6643, 8337, 8175],
    "underbust_ring":   [6037, 6038, 6129, 6156, 8217, 6641, 6624, 3873, 3893, 5483,
                         3395, 3368, 3275, 3274, 4055, 3833, 4056, 3321, 5448, 8182,
                         6084, 6802, 6588, 6801],
    "chest_ring":       [6162, 6165, 6112, 7200, 7202, 7194, 8249, 8260, 5547, 5536,
                         4458, 4466, 4464, 3349, 3404, 3401, 3302, 3270, 3268, 5430,
                         8164, 6031, 6033, 6065],
    "waist_ring":       [6865, 6652, 8136, 6871, 6870, 8150, 5496, 5416, 4126, 4127,
                         5402, 3904, 4121, 4120, 5407, 4117, 4116, 3551, 6312, 6313,
                         6860, 6861, 8141, 6864],
    "hip_ring":         [6203, 6200, 8358, 8362, 8382, 8380, 8377, 6231, 6234, 5934,
                         3473, 3470, 5683, 5686, 5688, 5668, 5664, 3439, 3442, 3498,
                         4420, 5615, 7156, 6259],
    "thigh_l_ring":     [3566, 3529, 3527, 3530, 3484, 3592, 3533, 3481, 3532, 3478,
                         3479, 3502, 3503, 3504, 3507, 3505, 3506, 3996, 4132, 3539,
                         3914, 3538, 3864, 3861],
    "neck_ring":        [6666, 6211, 6199, 6206, 5920, 3445, 3438, 3450, 3918, 3204,
                         3205, 3189, 3188, 1759, 8988, 2870, 5951, 5952, 5968, 5967],
}

# Height correction factor for body curvature (spine is not perfectly straight)
HEIGHT_CORRECTION = 1.02

# Measurement plausibility ranges [min_cm, max_cm]
PLAUSIBILITY: dict[str, tuple[float, float]] = {
    "height_cm":       (140.0, 220.0),
    "bust_cm":         (70.0, 140.0),
    "underbust_cm":    (60.0, 130.0),
    "chest_cm":        (70.0, 140.0),
    "waist_cm":        (55.0, 130.0),
    "hips_cm":         (70.0, 160.0),
    "thigh_cm":        (30.0, 110.0),
    "inseam_cm":       (60.0, 100.0),
    "shoulder_cm":     (20.0, 70.0),
    "arm_length_cm":   (30.0, 95.0),
    "neck_cm":         (28.0, 50.0),
}


# ── Public API ────────────────────────────────────────────────────────────────

def extract_measurements(vertices: list[list[float]] | np.ndarray) -> Measurements:
    """
    Compute all body measurements from SMPL-X T-pose vertices.

    Args:
        vertices: (10475, 3) float array in metres (SMPL-X units).

    Returns:
        Measurements schema (all values in cm, validated).
    """
    v = np.array(vertices, dtype=np.float32)
    if v.shape != (10475, 3):
        raise ValueError(f"Expected (10475, 3) vertices, got {v.shape}")

    raw = {
        "height_cm":      _height(v),
        "bust_cm":        _ring_circumference(v, VERTEX_INDICES["bust_ring"]),
        "underbust_cm":   _ring_circumference(v, VERTEX_INDICES["underbust_ring"]),
        "chest_cm":       _ring_circumference(v, VERTEX_INDICES["chest_ring"]),
        "waist_cm":       _ring_circumference(v, VERTEX_INDICES["waist_ring"]),
        "hips_cm":        _ring_circumference(v, VERTEX_INDICES["hip_ring"]),
        "thigh_cm":       _ring_circumference(v, VERTEX_INDICES["thigh_l_ring"]),
        "inseam_cm":      _inseam(v),
        "shoulder_cm":    _distance_cm(v, VERTEX_INDICES["shoulder_l"], VERTEX_INDICES["shoulder_r"]),
        "arm_length_cm":  _arm_length(v),
        "neck_cm":        _ring_circumference(v, VERTEX_INDICES["neck_ring"]),
    }

    _warn_out_of_range(raw)
    return Measurements(**raw)


def measurements_from_numpy(vertices: np.ndarray) -> dict[str, float]:
    """
    Low-level version returning a plain dict (useful for tests/benchmarks).
    Does not validate via Pydantic.
    """
    m = extract_measurements(vertices)
    return m.model_dump()


# ── Internal ──────────────────────────────────────────────────────────────────

def _ring_circumference(v: np.ndarray, indices: list[int]) -> float:
    """Sum of consecutive edge lengths around a closed vertex ring, in cm."""
    pts = v[indices]  # (N, 3)
    rolled = np.roll(pts, -1, axis=0)
    edge_lengths = np.linalg.norm(pts - rolled, axis=1)
    return float(edge_lengths.sum() * 100.0)


def _distance_cm(v: np.ndarray, idx_a: int, idx_b: int) -> float:
    """Euclidean distance between two vertices, in cm."""
    return float(np.linalg.norm(v[idx_a] - v[idx_b]) * 100.0)


def _height(v: np.ndarray) -> float:
    """Crown-to-heel height with curvature correction factor."""
    head_y = float(v[VERTEX_INDICES["head_top"], 1])
    heel_y = float(v[VERTEX_INDICES["foot_heel_l"], 1])
    raw_height_m = abs(head_y - heel_y)
    return raw_height_m * 100.0 * HEIGHT_CORRECTION


def _inseam(v: np.ndarray) -> float:
    """Crotch vertex to foot heel (left side), in cm."""
    return _distance_cm(v, VERTEX_INDICES["crotch"], VERTEX_INDICES["foot_heel_l"])


def _arm_length(v: np.ndarray) -> float:
    """Left shoulder acromion to left wrist, in cm."""
    return _distance_cm(v, VERTEX_INDICES["shoulder_l"], VERTEX_INDICES["wrist_l"])


def _warn_out_of_range(raw: dict[str, float]) -> None:
    for key, value in raw.items():
        lo, hi = PLAUSIBILITY.get(key, (0.0, 9999.0))
        if not (lo <= value <= hi):
            warnings.warn(
                f"Measurement {key}={value:.1f} cm is outside plausible range [{lo}, {hi}]. "
                "Check vertex indices or mesh scaling.",
                stacklevel=3,
            )
