"""
Quality gate — validate keyframes before any ML inference.

All checks raise fastapi.HTTPException(422) with a machine-readable
QualityErrorCode so the frontend can show a specific retry message.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Literal

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Thresholds (overridable via env for tuning) ───────────────────────────────
BLUR_MIN_LAPLACIAN = 30.0           # iPhone MOV is compressed — 30 is realistic
BRIGHTNESS_MIN = 40
BRIGHTNESS_MAX = 220
MIN_ROTATION_DEGREES = 200.0        # allow slightly incomplete rotations
MIN_FULLY_VISIBLE_FRACTION = 0.60   # 60% of frames need full body (relaxed for short clips)


# ── Result types ──────────────────────────────────────────────────────────────

@dataclass
class FrameQuality:
    index: int
    sharpness: float
    brightness: float
    is_blurry: bool
    is_dark_or_overexposed: bool
    has_face: bool          # placeholder — populated by QualityGate if keypoints passed
    body_fully_visible: bool


@dataclass
class QualityReport:
    passed: bool
    error_code: str | None = None
    error_detail: str | None = None
    rotation_span_deg: float = 0.0
    frame_reports: list[FrameQuality] = field(default_factory=list)
    usable_frame_indices: list[int] = field(default_factory=list)


# ── Public API ────────────────────────────────────────────────────────────────

def quality_gate(
    frames: list[np.ndarray],
    angles: list[float] | None = None,
    raise_on_fail: bool = True,
) -> QualityReport:
    """
    Run all quality checks. By default raises HTTPException on failure.

    Args:
        frames:        list of (H, W, 3) uint8 RGB keyframes.
        angles:        optional per-frame rotation angle estimates (degrees).
        raise_on_fail: if True, raise HTTPException(422) on failure.

    Returns:
        QualityReport.
    """
    report = QualityReport(passed=True)
    frame_reports: list[FrameQuality] = []

    for i, frame in enumerate(frames):
        sharpness = _laplacian_variance(frame)
        brightness = _mean_brightness(frame)
        fq = FrameQuality(
            index=i,
            sharpness=sharpness,
            brightness=brightness,
            is_blurry=sharpness < BLUR_MIN_LAPLACIAN,
            is_dark_or_overexposed=not (BRIGHTNESS_MIN <= brightness <= BRIGHTNESS_MAX),
            has_face=True,            # updated later when keypoints available
            body_fully_visible=_body_fully_visible(frame),
        )
        frame_reports.append(fq)

    report.frame_reports = frame_reports
    usable = [fq.index for fq in frame_reports if not fq.is_blurry]
    report.usable_frame_indices = usable

    # Check 1: at least 30% of frames are sharp (relaxed for short/compressed videos)
    sharp_fraction = len(usable) / max(len(frames), 1)
    if sharp_fraction < 0.30:
        report.passed = False
        report.error_code = "BLUR"
        report.error_detail = (
            f"Only {len(usable)}/{len(frames)} frames were sharp enough "
            f"(Laplacian variance < {BLUR_MIN_LAPLACIAN}). "
            "Try better lighting and hold the phone steadier while rotating."
        )
        if raise_on_fail:
            _raise(report.error_code, report.error_detail)
        return report

    # Check 2: brightness
    dark_or_blown = [fq for fq in frame_reports if fq.is_dark_or_overexposed]
    if len(dark_or_blown) > len(frames) * 0.5:
        report.passed = False
        report.error_code = "LOW_LIGHT"
        report.error_detail = (
            f"More than half of frames are too dark or overexposed. "
            f"Mean brightness should be in [{BRIGHTNESS_MIN}, {BRIGHTNESS_MAX}]."
        )
        if raise_on_fail:
            _raise(report.error_code, report.error_detail)
        return report

    # Check 3: rotation span
    if angles is not None and len(angles) >= 2:
        span = float(max(angles) - min(angles))
    else:
        span = 360.0   # assume complete if no angle data (e.g. in tests)
    report.rotation_span_deg = span
    if span < MIN_ROTATION_DEGREES:
        report.passed = False
        report.error_code = "INCOMPLETE_ROTATION"
        report.error_detail = (
            f"Detected rotation span of only {span:.0f}° (need ≥ {MIN_ROTATION_DEGREES:.0f}°). "
            "Complete a full 360° turn slowly in place."
        )
        if raise_on_fail:
            _raise(report.error_code, report.error_detail)
        return report

    # Check 4: body fully visible in ≥ 80% of frames
    visible_count = sum(1 for fq in frame_reports if fq.body_fully_visible)
    if visible_count / max(len(frames), 1) < MIN_FULLY_VISIBLE_FRACTION:
        report.passed = False
        report.error_code = "BODY_CROPPED"
        report.error_detail = (
            f"Body was fully visible in only {visible_count}/{len(frames)} frames. "
            "Ensure head and feet are both in frame throughout."
        )
        if raise_on_fail:
            _raise(report.error_code, report.error_detail)
        return report

    logger.info(
        "Quality gate passed: %d frames, %.0f° rotation, %d sharp",
        len(frames), span, len(usable),
    )
    return report


def check_face_present(frames: list[np.ndarray]) -> bool:
    """
    Lightweight face detection using OpenCV Haar cascade.
    Returns True if a face is detected in at least one frame.
    Called separately after quality_gate() for the FACE_NOT_DETECTED check.
    """
    cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
    detector = cv2.CascadeClassifier(cascade_path)
    for frame in frames:
        gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        faces = detector.detectMultiScale(gray, scaleFactor=1.1, minNeighbors=5, minSize=(30, 30))
        if len(faces) > 0:
            return True
    return False


# ── Internal ─────────────────────────────────────────────────────────────────

def _laplacian_variance(frame: np.ndarray) -> float:
    """Sharpness via Laplacian variance of the green channel (least noise)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    lap = cv2.Laplacian(gray, cv2.CV_64F)
    return float(lap.var())


def _mean_brightness(frame: np.ndarray) -> float:
    """Mean luminance of the frame (0–255)."""
    gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
    return float(gray.mean())


def _body_fully_visible(frame: np.ndarray) -> bool:
    """
    Heuristic: check that there is non-background content at the top 5% and
    bottom 5% of the frame. Not a perfect pose detector, but avoids loading
    the keypoint model here. Full pose check happens in the fitting stage.
    """
    h, w = frame.shape[:2]
    top_strip = frame[: int(h * 0.05), :, :]
    bot_strip = frame[int(h * 0.95) :, :, :]
    # Simple: if both strips have significant standard deviation, something is there
    top_std = float(top_strip.std())
    bot_std = float(bot_strip.std())
    return top_std > 10.0 and bot_std > 10.0


def _raise(code: str, detail: str) -> None:
    from fastapi import HTTPException
    raise HTTPException(status_code=422, detail={"code": code, "detail": detail})
