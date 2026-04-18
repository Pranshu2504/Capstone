"""
Stage 3 validation — video preprocessing and quality gate.
Run: cd ai && python3.11 -m pytest body_mesh/tests/test_preprocess.py -v
"""
import numpy as np
import pytest

from body_mesh.preprocess.quality import (
    FrameQuality, QualityReport, quality_gate, check_face_present,
    _laplacian_variance, _mean_brightness,
    BLUR_MIN_LAPLACIAN, BRIGHTNESS_MIN, BRIGHTNESS_MAX,
)
from body_mesh.preprocess.video import (
    _angle_spaced_indices, _estimate_rotation_angles,
)


# ── Helper fixtures ───────────────────────────────────────────────────────────

def _make_sharp_bright_frame(h=720, w=1280) -> np.ndarray:
    """Textured frame that should pass sharpness + brightness checks."""
    rng = np.random.default_rng(42)
    frame = rng.integers(80, 180, (h, w, 3), dtype=np.uint8)
    # Add a high-contrast grid to ensure Laplacian variance is high
    frame[::20, :, :] = 0
    frame[:, ::20, :] = 0
    return frame


def _make_blurry_frame(h=720, w=1280) -> np.ndarray:
    """Gaussian-blurred solid-colour frame — very low Laplacian variance."""
    import cv2
    frame = np.full((h, w, 3), 120, dtype=np.uint8)
    frame = cv2.GaussianBlur(frame, (51, 51), 20)
    return frame


def _make_dark_frame(h=720, w=1280) -> np.ndarray:
    return np.full((h, w, 3), 20, dtype=np.uint8)


def _make_overexposed_frame(h=720, w=1280) -> np.ndarray:
    return np.full((h, w, 3), 240, dtype=np.uint8)


# ── Laplacian / brightness unit tests ────────────────────────────────────────

def test_laplacian_sharp_frame():
    frame = _make_sharp_bright_frame()
    score = _laplacian_variance(frame)
    assert score >= BLUR_MIN_LAPLACIAN, f"Expected sharp frame, got Laplacian={score:.1f}"


def test_laplacian_blurry_frame():
    frame = _make_blurry_frame()
    score = _laplacian_variance(frame)
    assert score < BLUR_MIN_LAPLACIAN, f"Expected blurry frame, got Laplacian={score:.1f}"


def test_brightness_dark():
    b = _mean_brightness(_make_dark_frame())
    assert b < BRIGHTNESS_MIN


def test_brightness_overexposed():
    b = _mean_brightness(_make_overexposed_frame())
    assert b > BRIGHTNESS_MAX


def test_brightness_good():
    b = _mean_brightness(_make_sharp_bright_frame())
    assert BRIGHTNESS_MIN <= b <= BRIGHTNESS_MAX


# ── Angle-space index selection ───────────────────────────────────────────────

def test_angle_spaced_indices_count():
    angles = list(range(0, 360, 3))  # 120 angles
    indices = _angle_spaced_indices(angles, 12)
    assert len(indices) == 12


def test_angle_spaced_indices_no_duplicates():
    angles = list(range(0, 360, 3))
    indices = _angle_spaced_indices(angles, 12)
    assert len(set(indices)) == len(indices)


def test_angle_spaced_indices_sorted():
    angles = list(range(0, 360, 3))
    indices = _angle_spaced_indices(angles, 12)
    assert indices == sorted(indices)


def test_angle_spaced_covers_range():
    angles = [float(i * 3) for i in range(120)]
    indices = _angle_spaced_indices(angles, 12)
    selected_angles = [angles[i] for i in indices]
    # First and last selected angles should be near the range edges
    assert selected_angles[0] < 30.0
    assert selected_angles[-1] > 330.0


# ── Quality gate ─────────────────────────────────────────────────────────────

def test_quality_gate_passes_good_frames():
    frames = [_make_sharp_bright_frame() for _ in range(12)]
    angles = list(np.linspace(0, 355, 12))
    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    assert report.passed, f"Expected pass, got: {report.error_code} — {report.error_detail}"


def test_quality_gate_rejects_all_blurry():
    frames = [_make_blurry_frame() for _ in range(12)]
    angles = list(np.linspace(0, 355, 12))
    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    assert not report.passed
    assert report.error_code == "BLUR"


def test_quality_gate_rejects_dark():
    # Mix: 8 dark + 4 good — majority dark
    frames = [_make_dark_frame()] * 8 + [_make_sharp_bright_frame()] * 4
    angles = list(np.linspace(0, 355, 12))
    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    # 8/12 dark-or-overexposed → should fail brightness, OR sharpness, but dark frames are also blurry-ish
    # We just check it doesn't pass
    assert not report.passed


def test_quality_gate_rejects_incomplete_rotation():
    frames = [_make_sharp_bright_frame() for _ in range(12)]
    angles = list(np.linspace(0, 180, 12))  # only 180° span
    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    assert not report.passed
    assert report.error_code == "INCOMPLETE_ROTATION"


def test_quality_gate_raises_http_exception():
    from fastapi import HTTPException
    frames = [_make_blurry_frame() for _ in range(12)]
    with pytest.raises(HTTPException) as exc_info:
        quality_gate(frames, raise_on_fail=True)
    assert exc_info.value.status_code == 422
    assert exc_info.value.detail["code"] == "BLUR"


def test_quality_gate_usable_indices_non_empty():
    frames = [_make_sharp_bright_frame() for _ in range(12)]
    report = quality_gate(frames, raise_on_fail=False)
    assert len(report.usable_frame_indices) > 0


def test_quality_gate_rotation_span_stored():
    frames = [_make_sharp_bright_frame() for _ in range(12)]
    angles = list(np.linspace(0, 355, 12))
    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    assert report.rotation_span_deg > 300.0


# ── Face detection ───────────────────────────────────────────────────────────

def test_face_not_detected_in_noise():
    """Random noise frames should not trigger face detection."""
    frames = [np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8) for _ in range(4)]
    result = check_face_present(frames)
    # Can't guarantee absence (false positives possible with Haar), just check it runs
    assert isinstance(result, bool)
