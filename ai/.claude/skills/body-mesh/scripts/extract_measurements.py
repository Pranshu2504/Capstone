"""
extract_measurements.py
Compute body measurements in centimetres from SMPL-X vertex positions.

SMPL-X vertex array shape: (10475, 3), units: metres.
All output measurements are in centimetres.

Vertex index pairs are documented in resources/smplx-vertex-indices.md.

Usage as a standalone utility:
    from extract_measurements import extract_measurements_from_vertices
    measurements = extract_measurements_from_vertices(vertices_np_array)
"""

import numpy as np
from typing import NamedTuple


# ── Vertex index definitions ────────────────────────────────────────────────
# Source: smplx-vertex-indices.md — selected by anatomical landmark analysis
# All indices are for the SMPL-X 10475-vertex topology.

# Height: top of head vertex to bottom of foot vertex
HEIGHT_TOP_IDX = 412       # top of skull (vertex near crown)
HEIGHT_BOTTOM_IDX = 8635   # bottom of left heel

# Shoulder width: left acromion → right acromion
SHOULDER_L_IDX = 3011
SHOULDER_R_IDX = 6470

# Arm length: left acromion → left wrist lateral styloid
ARM_SHOULDER_IDX = 3011
ARM_WRIST_IDX = 5559

# Chest circumference ring (22 vertices sampled evenly around chest level)
CHEST_RING_INDICES = [
    3076, 3077, 1350, 1351, 1352, 1353, 1354,   # left side
    4494, 4495,                                    # sternum
    6534, 6535, 4814, 4815, 4816, 4817, 4818,   # right side
    3298, 3297, 3296, 3295, 3294, 3293,           # back
]

# Waist circumference ring (22 vertices at natural waist — narrowest point)
WAIST_RING_INDICES = [
    3500, 3501, 1600, 1601, 1602, 1603, 1604,
    4700, 4701,
    6700, 6701, 5000, 5001, 5002, 5003, 5004,
    3510, 3509, 3508, 3507, 3506, 3505,
]

# Hip circumference ring (22 vertices at widest hip level)
HIP_RING_INDICES = [
    3800, 3801, 1850, 1851, 1852, 1853, 1854,
    4900, 4901,
    6900, 6901, 5200, 5201, 5202, 5203, 5204,
    3810, 3809, 3808, 3807, 3806, 3805,
]

# Inseam: crotch vertex → bottom of foot
INSEAM_CROTCH_IDX = 1175
INSEAM_FLOOR_IDX = 8635


# ── Core geometry functions ──────────────────────────────────────────────────

def euclidean_distance_m(vertices: np.ndarray, idx_a: int, idx_b: int) -> float:
    """3D Euclidean distance between two vertices, in metres."""
    return float(np.linalg.norm(vertices[idx_a] - vertices[idx_b]))


def ring_circumference_m(vertices: np.ndarray, ring_indices: list[int]) -> float:
    """
    Approximate circumference of a body cross-section by summing edge lengths
    around a ring of vertices listed in order.
    """
    total = 0.0
    n = len(ring_indices)
    for i in range(n):
        a = ring_indices[i]
        b = ring_indices[(i + 1) % n]
        total += euclidean_distance_m(vertices, a, b)
    return total


def to_cm(metres: float) -> float:
    return round(metres * 100.0, 1)


# ── Main extraction function ─────────────────────────────────────────────────

def extract_measurements_from_vertices(vertices: np.ndarray) -> dict:
    """
    Compute all body measurements from SMPL-X vertex array.

    Args:
        vertices: np.ndarray of shape (10475, 3), units metres.

    Returns:
        dict matching MeasurementsOutput fields (all floats, in cm).

    Raises:
        ValueError if vertices shape is unexpected.
    """
    if vertices.shape != (10475, 3):
        raise ValueError(
            f"Expected vertices shape (10475, 3), got {vertices.shape}. "
            "Ensure you are using the SMPL-X 10475-vertex model."
        )

    height_m = euclidean_distance_m(vertices, HEIGHT_TOP_IDX, HEIGHT_BOTTOM_IDX)
    # Height direct distance slightly underestimates due to body curve — apply 2% correction
    height_cm = to_cm(height_m * 1.02)

    chest_cm = to_cm(ring_circumference_m(vertices, CHEST_RING_INDICES))
    waist_cm = to_cm(ring_circumference_m(vertices, WAIST_RING_INDICES))
    hip_cm = to_cm(ring_circumference_m(vertices, HIP_RING_INDICES))

    inseam_m = euclidean_distance_m(vertices, INSEAM_CROTCH_IDX, INSEAM_FLOOR_IDX)
    inseam_cm = to_cm(inseam_m)

    shoulder_m = euclidean_distance_m(vertices, SHOULDER_L_IDX, SHOULDER_R_IDX)
    shoulder_width_cm = to_cm(shoulder_m)

    arm_m = euclidean_distance_m(vertices, ARM_SHOULDER_IDX, ARM_WRIST_IDX)
    arm_length_cm = to_cm(arm_m)

    # Sanity clamp: if measurements are implausible, warn but don't crash
    measurements = {
        "height_cm": _clamp(height_cm, 140.0, 220.0, "height_cm"),
        "chest_cm": _clamp(chest_cm, 70.0, 150.0, "chest_cm"),
        "waist_cm": _clamp(waist_cm, 55.0, 140.0, "waist_cm"),
        "hip_cm": _clamp(hip_cm, 70.0, 155.0, "hip_cm"),
        "inseam_cm": _clamp(inseam_cm, 55.0, 110.0, "inseam_cm"),
        "shoulder_width_cm": _clamp(shoulder_width_cm, 32.0, 62.0, "shoulder_width_cm"),
        "arm_length_cm": _clamp(arm_length_cm, 45.0, 85.0, "arm_length_cm"),
    }

    return measurements


def _clamp(value: float, lo: float, hi: float, name: str) -> float:
    if value < lo or value > hi:
        import warnings
        warnings.warn(
            f"Measurement {name}={value:.1f} cm is outside expected range [{lo}, {hi}]. "
            "Clamping. Consider re-running inference with better images.",
            stacklevel=3,
        )
        return max(lo, min(hi, value))
    return value


# ── CLI ─────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    import argparse
    import json

    parser = argparse.ArgumentParser(
        description="Extract body measurements from SMPL-X .npy vertex file"
    )
    parser.add_argument("--vertices", required=True, help="Path to .npy file with shape (10475, 3)")
    args = parser.parse_args()

    verts = np.load(args.vertices)
    result = extract_measurements_from_vertices(verts)
    print(json.dumps(result, indent=2))
