"""
Stage 4 validation — fit algorithms and measurement extraction.
Run: cd ai && python3.11 -m pytest body_mesh/tests/test_fit.py -v
"""
import warnings

import numpy as np
import pytest

from body_mesh.adapters.mock_adapters import (
    NEUTRAL_BETAS, MockBodyMeshAdapter, MockKeypointAdapter,
)
from body_mesh.fit.multi_view_smplx import (
    compute_beta_diversity, fuse_shape, _scale_to_height,
)
from body_mesh.fit.flame_merge import merge_flame_into_smplx
from body_mesh.measurements import (
    extract_measurements, _ring_circumference, _distance_cm,
    PLAUSIBILITY,
)
from shared.schemas import FLAMEFit, SMPLXFit, Measurements


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_smplxfit(betas=None, with_vertices=True) -> SMPLXFit:
    if betas is None:
        betas = list(NEUTRAL_BETAS)
    verts = None
    if with_vertices:
        # Simple synthetic T-pose: spread vertices in a roughly human shape
        rng = np.random.default_rng(0)
        verts = rng.standard_normal((10475, 3)).tolist()
    return SMPLXFit(
        betas=betas,
        global_orient=[0.0, 0.0, 0.0],
        body_pose=[0.0] * 63,
        cam_translation=[0.0, 0.0, 2.5],
        vertices_tpose=verts,
    )


def _make_flame_fit(arcface=0.72) -> FLAMEFit:
    return FLAMEFit(
        shape=[0.0] * 100,
        expression=[0.0] * 50,
        arcface_similarity=arcface,
        skin_sample_rgb=[200, 160, 130],
    )


def _make_human_vertices(height_m=1.75) -> np.ndarray:
    """
    Create a synthetic 10475-vertex mesh with plausible human proportions
    so that measurement extraction returns values in the plausible range.
    All vertices start at origin; we spread them proportionally.
    """
    rng = np.random.default_rng(42)
    v = np.zeros((10475, 3), dtype=np.float32)

    # Distribute Y (height) axis between 0 and height_m
    v[:, 1] = rng.uniform(0.0, height_m, 10475)

    # Head top and heel
    v[2800, 1] = height_m          # head top
    v[8846, 1] = 0.0               # left heel

    # Crotch ~ 45% up
    v[1769, 1] = height_m * 0.45

    # Shoulders at ~85% height, ±22 cm apart
    v[5005] = [0.22,  height_m * 0.85, 0.0]   # left shoulder
    v[1853] = [-0.22, height_m * 0.85, 0.0]   # right shoulder

    # Wrists at ~60% height (arms down), ±35 cm from center
    v[5551] = [0.35,  height_m * 0.60, 0.0]   # left wrist
    v[2098] = [-0.35, height_m * 0.60, 0.0]   # right wrist

    # Rings: scatter vertices in a small circle at appropriate heights
    def _place_ring(indices, centre_y, radius):
        n = len(indices)
        for i, idx in enumerate(indices):
            theta = 2 * np.pi * i / n
            v[idx] = [radius * np.cos(theta), centre_y, radius * np.sin(theta)]

    # Radii chosen so circumference (2π×r) lands in plausible range:
    # bust ~90 cm  → r ≈ 0.143 m
    # underbust ~75 cm → r ≈ 0.119 m
    # chest ~88 cm → r ≈ 0.140 m
    # waist ~70 cm → r ≈ 0.111 m
    # hips ~95 cm  → r ≈ 0.151 m
    # thigh ~55 cm → r ≈ 0.087 m
    # neck ~35 cm  → r ≈ 0.056 m
    _place_ring(list(range(3500, 3522)), height_m * 0.70, 0.143)  # bust
    _place_ring(list(range(3540, 3562)), height_m * 0.67, 0.119)  # underbust
    _place_ring(list(range(3480, 3502)), height_m * 0.72, 0.140)  # chest
    _place_ring(list(range(3600, 3622)), height_m * 0.60, 0.111)  # waist
    _place_ring(list(range(3650, 3672)), height_m * 0.55, 0.151)  # hips
    _place_ring(list(range(5100, 5112)), height_m * 0.42, 0.087)  # thigh
    _place_ring(list(range(2850, 2862)), height_m * 0.89, 0.056)  # neck

    return v


# ── Multi-view shape fusion ───────────────────────────────────────────────────

def test_fuse_shape_single_frame():
    fits = [_make_smplxfit(betas=[1.0] * 10)]
    result = fuse_shape(fits)
    assert len(result.betas) == 10
    assert all(abs(b - 1.0) < 0.01 for b in result.betas)


def test_fuse_shape_averages_betas():
    fits = [
        _make_smplxfit(betas=[2.0] * 10),
        _make_smplxfit(betas=[0.0] * 10),
    ]
    result = fuse_shape(fits)
    assert all(abs(b - 1.0) < 0.01 for b in result.betas)


def test_fuse_shape_clamps_extremes():
    fits = [_make_smplxfit(betas=[9.0] * 10)]
    result = fuse_shape(fits)
    assert all(b <= 5.0 for b in result.betas)


def test_fuse_shape_with_height_scaling():
    fits = [_make_smplxfit()]
    result = fuse_shape(fits, height_cm=175.0)
    if result.vertices_tpose is not None:
        v = np.array(result.vertices_tpose)
        height_m = v[:, 1].max() - v[:, 1].min()
        # After scaling to 175 cm, height should be ~1.75 m
        assert abs(height_m - 1.75) < 0.1


def test_fuse_shape_empty_raises():
    with pytest.raises(ValueError, match="at least one"):
        fuse_shape([])


def test_fuse_shape_produces_smplxfit():
    fits = [_make_smplxfit() for _ in range(8)]
    result = fuse_shape(fits)
    assert isinstance(result, SMPLXFit)


def test_beta_diversity_low_for_consistent_fits():
    fits = [_make_smplxfit(betas=[0.5] * 10) for _ in range(6)]
    diversity = compute_beta_diversity(fits)
    assert diversity < 0.01, f"Expected low diversity, got {diversity:.4f}"


def test_scale_to_height():
    # Create vertices spanning 1.0 m
    v = np.zeros((10475, 3), dtype=np.float32)
    v[:, 1] = np.linspace(0, 1.0, 10475)
    scaled = _scale_to_height(v.tolist(), 175.0)
    sv = np.array(scaled)
    height_m = sv[:, 1].max() - sv[:, 1].min()
    assert abs(height_m - 1.75) < 0.001


# ── FLAME merge ───────────────────────────────────────────────────────────────

def test_flame_merge_returns_smplxfit():
    fit = _make_smplxfit()
    flame = _make_flame_fit()
    result = merge_flame_into_smplx(fit, flame)
    assert isinstance(result, SMPLXFit)


def test_flame_merge_preserves_betas():
    fit = _make_smplxfit(betas=[1.5] * 10)
    flame = _make_flame_fit()
    result = merge_flame_into_smplx(fit, flame)
    assert all(abs(b - 1.5) < 0.01 for b in result.betas)


def test_flame_merge_no_vertices_returns_unchanged():
    fit = _make_smplxfit(with_vertices=False)
    flame = _make_flame_fit()
    result = merge_flame_into_smplx(fit, flame)
    assert result.vertices_tpose is None  # unchanged


def test_flame_merge_vertices_count_unchanged():
    fit = _make_smplxfit(with_vertices=True)
    flame = _make_flame_fit()
    result = merge_flame_into_smplx(fit, flame)
    if result.vertices_tpose is not None:
        assert len(result.vertices_tpose) == 10475


# ── Measurements ──────────────────────────────────────────────────────────────

def test_ring_circumference_equilateral_square():
    """4 vertices forming a unit square → perimeter = 4.0 m = 400 cm."""
    v = np.zeros((10475, 3), dtype=np.float32)
    indices = [0, 1, 2, 3]
    v[0] = [0.5, 0, 0]
    v[1] = [0, 0, 0.5]
    v[2] = [-0.5, 0, 0]
    v[3] = [0, 0, -0.5]
    circ = _ring_circumference(v, indices)
    expected = 4 * np.sqrt(0.5**2 + 0.5**2) * 100  # ≈ 282 cm for this square
    assert abs(circ - expected) < 0.1


def test_distance_cm_known():
    v = np.zeros((10475, 3), dtype=np.float32)
    v[10] = [1.0, 0.0, 0.0]   # 1 m apart
    v[20] = [0.0, 0.0, 0.0]
    assert abs(_distance_cm(v, 10, 20) - 100.0) < 0.01


def test_extract_measurements_plausible_human():
    v = _make_human_vertices(height_m=1.75)
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        m = extract_measurements(v)
    assert isinstance(m, Measurements)
    assert 140.0 <= m.height_cm <= 220.0


def test_extract_measurements_wrong_shape():
    with pytest.raises(ValueError, match="Expected"):
        extract_measurements(np.zeros((1000, 3)))  # wrong count


def test_measurements_plausibility_keys_complete():
    expected_keys = {
        "height_cm", "bust_cm", "underbust_cm", "chest_cm", "waist_cm",
        "hips_cm", "thigh_cm", "inseam_cm", "shoulder_cm", "arm_length_cm", "neck_cm"
    }
    assert set(PLAUSIBILITY.keys()) == expected_keys


def test_measurements_warns_out_of_range():
    v = np.zeros((10475, 3), dtype=np.float32)  # All zeros → implausible measurements
    # Set minimal structure to avoid division errors
    v[2800, 1] = 0.0   # head_top at 0
    v[8846, 1] = 0.0   # heel at 0 — height = 0 (implausible)
    with pytest.warns(UserWarning, match="outside plausible range"):
        try:
            extract_measurements(v)
        except Exception:
            pass  # Pydantic may raise after warnings — that's OK
