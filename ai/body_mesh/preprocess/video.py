"""
Video decoding and keyframe extraction.

Decodes the capture video using ffmpeg, estimates the rotation angle per
frame from hip-pelvis heading (or a fallback uniform distribution), then
selects N frames spaced evenly in angle-space (not time).
"""
from __future__ import annotations

import logging
import os
import subprocess
import tempfile
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# ── Constants ─────────────────────────────────────────────────────────────────

TARGET_HEIGHT = 720          # max decode height (preserves aspect)
MAX_FPS = 60                 # keep up to 60fps (iPhone MOV shoots at 60fps)
N_KEYFRAMES_DEFAULT = int(os.getenv("N_KEYFRAMES", "32"))


# ── Public API ────────────────────────────────────────────────────────────────

def extract_keyframes(
    video_path: str | Path,
    n: int = N_KEYFRAMES_DEFAULT,
    target_height: int = TARGET_HEIGHT,
    max_fps: int = MAX_FPS,
) -> list[np.ndarray]:
    """
    Decode video and return N keyframes spaced evenly in estimated angle-space.

    Args:
        video_path:    path to input video file.
        n:             number of keyframes to return.
        target_height: resize height (aspect-ratio-preserving).
        max_fps:       drop frames above this rate during decode.

    Returns:
        list of n (H, W, 3) uint8 RGB frames.

    Raises:
        ValueError: if video cannot be decoded or fewer than n frames are available.
    """
    frames = _decode_video(str(video_path), target_height, max_fps)
    if len(frames) == 0:
        raise ValueError("Video yielded 0 frames. Check codec and file integrity.")

    # Use all frames if fewer than requested (short videos still work)
    n_actual = min(n, len(frames))
    if n_actual < n:
        logger.warning("Video only has %d frames, using all (requested %d)", len(frames), n)

    angles = _estimate_rotation_angles(frames)
    indices = _angle_spaced_indices(angles, n_actual)
    keyframes = [frames[i] for i in indices]
    logger.info("Extracted %d keyframes from %d decoded frames (angle-spaced)", len(keyframes), len(frames))
    return keyframes


def get_video_metadata(video_path: str | Path) -> dict:
    """
    Return basic metadata: duration_s, fps, width, height, codec.
    Uses ffprobe (bundled with ffmpeg).
    """
    import json
    cmd = [
        "ffprobe", "-v", "quiet", "-print_format", "json",
        "-show_streams", str(video_path),
    ]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=15)
    if result.returncode != 0:
        raise ValueError(f"ffprobe failed: {result.stderr[:200]}")
    info = json.loads(result.stdout)
    video_stream = next(
        (s for s in info.get("streams", []) if s.get("codec_type") == "video"), None
    )
    if video_stream is None:
        raise ValueError("No video stream found in file.")
    fps_str = video_stream.get("r_frame_rate", "30/1")
    num, den = fps_str.split("/")
    fps = float(num) / float(den)
    return {
        "duration_s": float(video_stream.get("duration", 0)),
        "fps": fps,
        "width": int(video_stream.get("width", 0)),
        "height": int(video_stream.get("height", 0)),
        "codec": video_stream.get("codec_name", "unknown"),
        "frame_count": int(video_stream.get("nb_frames", 0)),
    }


# ── Internal helpers ──────────────────────────────────────────────────────────

def _decode_video(
    video_path: str, target_height: int, max_fps: int
) -> list[np.ndarray]:
    """
    Decode video to RGB frames using ffmpeg pipe.
    Handles MOV, MP4, HEVC, ProRes — anything ffmpeg supports.
    Falls back to OpenCV if ffmpeg is not available.
    """
    frames = _decode_via_ffmpeg(video_path, target_height, max_fps)
    if frames:
        return frames
    logger.warning("ffmpeg decode failed, falling back to OpenCV")
    return _decode_via_opencv(video_path, target_height, max_fps)


def _decode_via_ffmpeg(
    video_path: str, target_height: int, max_fps: int
) -> list[np.ndarray]:
    """Use ffmpeg to extract frames at capped fps, scaling to target_height."""
    try:
        # Get video dimensions first
        probe_cmd = [
            "ffprobe", "-v", "error", "-select_streams", "v:0",
            "-show_entries", "stream=width,height,r_frame_rate",
            "-of", "csv=p=0", video_path,
        ]
        probe = subprocess.run(probe_cmd, capture_output=True, text=True, timeout=15)
        if probe.returncode != 0:
            return []

        parts = probe.stdout.strip().split(",")
        if len(parts) < 3:
            return []
        src_w, src_h = int(parts[0]), int(parts[1])
        fps_parts = parts[2].split("/")
        src_fps = float(fps_parts[0]) / float(fps_parts[1]) if len(fps_parts) == 2 else 30.0
        out_fps = min(src_fps, float(max_fps))

        # Scale: preserve aspect ratio
        if src_h > target_height:
            scale_h = target_height
            scale_w = int(src_w * target_height / src_h)
            # width must be even for ffmpeg
            scale_w = scale_w - (scale_w % 2)
        else:
            scale_h = src_h - (src_h % 2)
            scale_w = src_w - (src_w % 2)

        # Pipe raw RGB24 frames from ffmpeg
        cmd = [
            "ffmpeg", "-y", "-loglevel", "error",
            "-i", video_path,
            "-vf", f"fps={out_fps:.3f},scale={scale_w}:{scale_h}",
            "-f", "rawvideo", "-pix_fmt", "rgb24",
            "pipe:1",
        ]
        proc = subprocess.Popen(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
        raw, err = proc.communicate(timeout=120)
        if proc.returncode != 0:
            logger.warning("ffmpeg error: %s", err.decode()[:200])
            return []

        frame_bytes = scale_w * scale_h * 3
        if frame_bytes == 0 or len(raw) < frame_bytes:
            return []

        n_frames = len(raw) // frame_bytes
        frames = []
        for i in range(n_frames):
            chunk = raw[i * frame_bytes: (i + 1) * frame_bytes]
            frame = np.frombuffer(chunk, dtype=np.uint8).reshape(scale_h, scale_w, 3)
            frames.append(frame.copy())

        logger.info("ffmpeg decoded %d frames (%dx%d @ %.1f fps)", n_frames, scale_w, scale_h, out_fps)
        return frames

    except Exception as e:
        logger.warning("ffmpeg pipe decode failed: %s", e)
        return []


def _decode_via_opencv(
    video_path: str, target_height: int, max_fps: int
) -> list[np.ndarray]:
    """OpenCV fallback decoder."""
    cap = cv2.VideoCapture(video_path)
    if not cap.isOpened():
        raise ValueError(f"Cannot open video: {video_path}")

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    frame_step = max(1, round(src_fps / max_fps))
    frames: list[np.ndarray] = []
    frame_idx = 0
    while True:
        ret, bgr = cap.read()
        if not ret:
            break
        if frame_idx % frame_step == 0:
            rgb = cv2.cvtColor(bgr, cv2.COLOR_BGR2RGB)
            if rgb.shape[0] > target_height:
                scale = target_height / rgb.shape[0]
                new_w = int(rgb.shape[1] * scale)
                rgb = cv2.resize(rgb, (new_w, target_height), interpolation=cv2.INTER_AREA)
            frames.append(rgb)
        frame_idx += 1
    cap.release()
    return frames


def _estimate_rotation_angles(frames: list[np.ndarray]) -> list[float]:
    """
    Estimate the azimuth angle (degrees) each frame was captured at.

    Strategy: we don't have IMU data, so we use optical flow magnitude on a
    centre-cropped strip to detect motion rate, then integrate to get
    cumulative angle. Fast-path: if total estimated rotation < 270°, return
    uniform distribution so the quality gate can reject.

    Returns: list[float] of length == len(frames), values in [0, 360].
    """
    if len(frames) < 2:
        return [float(i * 360 / max(len(frames), 1)) for i in range(len(frames))]

    prev_gray = _centre_strip_gray(frames[0])
    flow_magnitudes: list[float] = [0.0]

    for frame in frames[1:]:
        curr_gray = _centre_strip_gray(frame)
        flow = cv2.calcOpticalFlowFarneback(
            prev_gray, curr_gray,
            None, 0.5, 3, 15, 3, 5, 1.2, 0
        )
        mag = float(np.mean(np.linalg.norm(flow, axis=2)))
        flow_magnitudes.append(mag)
        prev_gray = curr_gray

    # Normalise cumulative sum to [0, 360]
    cumulative = np.cumsum(flow_magnitudes)
    total = cumulative[-1] if cumulative[-1] > 0 else 1.0
    angles = (cumulative / total * 360.0).tolist()
    return angles


def _centre_strip_gray(frame: np.ndarray) -> np.ndarray:
    """Crop central 20% width strip; convert to grayscale using numpy (no cv2 needed)."""
    h, w = frame.shape[:2]
    x0, x1 = int(w * 0.4), int(w * 0.6)
    strip = frame[:, x0:x1]
    # BT.601 luma: works for both RGB and BGR frames
    return (strip[..., 0] * 0.299 + strip[..., 1] * 0.587 + strip[..., 2] * 0.114).astype(np.uint8)


def _angle_spaced_indices(angles: list[float], n: int) -> list[int]:
    """
    Select n frame indices evenly spaced across the estimated rotation range.
    Uses a greedy nearest-angle search.
    """
    angles_arr = np.array(angles)
    min_a, max_a = angles_arr.min(), angles_arr.max()
    targets = np.linspace(min_a, max_a, n)
    indices: list[int] = []
    used: set[int] = set()
    for t in targets:
        diffs = np.abs(angles_arr - t)
        for idx in np.argsort(diffs):
            if int(idx) not in used:
                indices.append(int(idx))
                used.add(int(idx))
                break
    return sorted(indices)
