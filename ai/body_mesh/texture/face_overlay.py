"""
Face + hair photo overlay onto SMPL-X UV atlas.

Strategy:
  1. Detect face in front frame (MediaPipe landmarks → Haar cascade).
  2. Only proceed if detection is confirmed — never paint from heuristic fallback.
  3. For each front-face vertex, map its 3D position to the detected face bbox,
     sample the photo pixel, and write to UV atlas.
  4. Brightness guard: skip pixels below threshold to avoid painting background.
"""
from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# SMPL-X head vertex threshold (y_norm > this = actual head/neck, Y > 0.30m)
HEAD_Y_THRESHOLD = 0.93
# Extend crop above face to capture hair
HAIR_EXTEND_RATIO = 0.70
# Minimum mean pixel brightness to proceed with face painting
MIN_CROP_BRIGHTNESS = 55
# Blend alpha for face photo (lower to not overpower body projection)
UV_FACE_BLEND_ALPHA = 0.88


def overlay_face_onto_atlas(
    atlas: np.ndarray,
    front_frame: np.ndarray | None,
    front_mask: np.ndarray | None,
    face_landmarks: list | None,
    vertices: np.ndarray | None,
    uv_per_vertex: np.ndarray | None,
    atlas_size: int,
) -> np.ndarray:
    """
    Paint face + hair photo into UV atlas using confirmed face detection only.
    Returns atlas unchanged if detection fails or crop is too dark.
    """
    if front_frame is None or front_frame.size == 0:
        return atlas

    atlas = atlas.copy().astype(np.float32)
    fh, fw = front_frame.shape[:2]

    # Only paint face if detection is CONFIRMED (not heuristic fallback)
    face_px_bbox, detection_method = _detect_face_confirmed(
        front_frame, front_mask, face_landmarks, fw, fh
    )
    if face_px_bbox is None:
        logger.warning("No confirmed face detection — skipping face overlay to avoid black face")
        return atlas

    fx1, fy1, fx2, fy2 = face_px_bbox
    logger.info("Face detected via %s: (%d,%d)-(%d,%d)", detection_method, fx1, fy1, fx2, fy2)

    # Extend crop upward to capture hair
    face_h_px = fy2 - fy1
    hair_top = max(0, int(fy1 - face_h_px * HAIR_EXTEND_RATIO))
    side_ext = max(0, int((fx2 - fx1) * 0.12))
    crop_x1 = max(0, fx1 - side_ext)
    crop_x2 = min(fw - 1, fx2 + side_ext)
    crop_y1 = hair_top
    crop_y2 = min(fh - 1, fy2 + int(face_h_px * 0.05))

    if crop_x2 - crop_x1 < 15 or crop_y2 - crop_y1 < 15:
        logger.warning("Face crop too small (%dx%d), skipping", crop_x2 - crop_x1, crop_y2 - crop_y1)
        return atlas

    face_crop = front_frame[crop_y1:crop_y2, crop_x1:crop_x2].copy()

    # Brightness guard: don't paint if crop is mostly background/dark
    if face_crop.mean() < MIN_CROP_BRIGHTNESS:
        logger.warning("Face crop too dark (mean=%.1f < %d) — skipping", face_crop.mean(), MIN_CROP_BRIGHTNESS)
        return atlas

    # Paint via vertices (only if mesh available)
    if vertices is not None and uv_per_vertex is not None:
        atlas = _paint_face_vertices(
            atlas, front_frame, front_mask,
            vertices, uv_per_vertex,
            fw, fh, atlas_size,
            fx1=fx1, fy1=fy1, fx2=fx2, fy2=fy2, hair_top=hair_top,
        )
    else:
        # Fallback: direct decal into estimated SMPL-X face UV region
        atlas = _paint_face_decal_fallback(atlas, face_crop, atlas_size)

    return atlas


def _detect_face_confirmed(
    frame: np.ndarray,
    mask: np.ndarray | None,
    face_landmarks: list | None,
    fw: int, fh: int,
) -> tuple[tuple[int, int, int, int] | None, str]:
    """
    Return (bbox, method) only if face detection is confirmed via landmarks or Haar.
    Returns (None, '') if only heuristic fallback would apply.
    """
    # 1. MediaPipe face landmarks (most reliable)
    if face_landmarks and len(face_landmarks) >= 100:
        xs = [lm.x * fw for lm in face_landmarks]
        ys = [lm.y * fh for lm in face_landmarks]
        x1 = max(0, int(min(xs)))
        y1 = max(0, int(min(ys)))
        x2 = min(fw - 1, int(max(xs)))
        y2 = min(fh - 1, int(max(ys)))
        if x2 - x1 > 20 and y2 - y1 > 20:
            return (x1, y1, x2, y2), "mediapipe"

    # 2. OpenCV Haar cascade
    try:
        gray = cv2.cvtColor(frame, cv2.COLOR_RGB2GRAY)
        cascade_path = cv2.data.haarcascades + "haarcascade_frontalface_default.xml"
        detector = cv2.CascadeClassifier(cascade_path)
        faces = detector.detectMultiScale(
            gray, scaleFactor=1.08, minNeighbors=3, minSize=(30, 30)
        )
        if len(faces) > 0:
            x, y, w, h = max(faces, key=lambda f: f[2] * f[3])
            return (int(x), int(y), int(x + w), int(y + h)), "haar"
    except Exception as e:
        logger.debug("Haar detection error: %s", e)

    # Not confirmed — do NOT fall back to heuristic (would paint wrong pixels)
    return None, ""


def _paint_face_vertices(
    atlas: np.ndarray,
    front_frame: np.ndarray,
    front_mask: np.ndarray | None,
    vertices: np.ndarray,
    uv_per_vertex: np.ndarray,
    fw: int, fh: int,
    atlas_size: int,
    fx1: int, fy1: int, fx2: int, fy2: int,
    hair_top: int,
) -> np.ndarray:
    """
    For each front-face vertex: map 3D pos → face frame pixel → UV atlas.
    Uses the confirmed face bbox for calibration (not full frame width).
    """
    y_min = vertices[:, 1].min()
    y_max = vertices[:, 1].max()
    y_norm = (vertices[:, 1] - y_min) / (y_max - y_min + 1e-6)

    # Select front-facing head vertices only (Z > 0 = facing camera)
    is_head = y_norm > HEAD_Y_THRESHOLD
    if vertices.shape[1] > 2:
        is_front = vertices[:, 2] > 0.01
    else:
        is_front = np.ones(len(vertices), dtype=bool)
    face_mask_verts = is_head & is_front

    if face_mask_verts.sum() == 0:
        logger.warning("No front-face vertices found")
        return atlas

    head_verts = vertices[face_mask_verts]
    head_uv = uv_per_vertex[face_mask_verts]
    head_y_norm = y_norm[face_mask_verts]

    # Map head vertex X → pixel X within confirmed face bbox
    hx_min = head_verts[:, 0].min(); hx_max = head_verts[:, 0].max()
    hx_span = hx_max - hx_min + 1e-6

    # X: left ear → fx1, right ear → fx2
    px = (fx1 + (head_verts[:, 0] - hx_min) / hx_span * (fx2 - fx1)).astype(int)

    # Y: neck (y_norm=HEAD_Y_THRESHOLD) → fy2, crown (y_norm=1.0) → hair_top
    head_y_local = (head_y_norm - HEAD_Y_THRESHOLD) / (1.0 - HEAD_Y_THRESHOLD + 1e-6)
    py = (fy2 - head_y_local * (fy2 - hair_top)).astype(int)

    px = np.clip(px, 0, fw - 1)
    py = np.clip(py, 0, fh - 1)

    # UV pixel coords in atlas
    u_px = np.clip((head_uv[:, 0] * (atlas_size - 1)).astype(int), 0, atlas_size - 1)
    v_px = np.clip(((1.0 - head_uv[:, 1]) * (atlas_size - 1)).astype(int), 0, atlas_size - 1)

    # Sample pixels; filter out dark ones (background)
    sampled = front_frame[py, px].astype(np.float32)  # (N, 3)
    bright_enough = sampled.mean(axis=1) > MIN_CROP_BRIGHTNESS

    # Optionally: must be in person mask
    if front_mask is not None:
        in_person = front_mask[py, px] > 64
    else:
        in_person = np.ones(len(px), dtype=bool)

    valid = bright_enough & in_person
    if valid.sum() == 0:
        logger.warning("All face vertex samples were dark/outside mask")
        return atlas

    existing = atlas[v_px[valid], u_px[valid]]
    atlas[v_px[valid], u_px[valid]] = (
        sampled[valid] * UV_FACE_BLEND_ALPHA + existing * (1.0 - UV_FACE_BLEND_ALPHA)
    )

    # Also fill UV-space gaps using the face crop directly in the UV head region
    atlas = _fill_face_uv_gaps(atlas, front_frame, head_uv, px, py, u_px, v_px, valid, atlas_size)

    logger.info(
        "Painted %d/%d front-face vertices (skipped %d dark/outside)",
        valid.sum(), len(px), (~valid).sum()
    )
    return atlas


def _fill_face_uv_gaps(
    atlas: np.ndarray,
    front_frame: np.ndarray,
    head_uv: np.ndarray,
    px: np.ndarray, py: np.ndarray,
    u_px: np.ndarray, v_px: np.ndarray,
    valid: np.ndarray,
    atlas_size: int,
) -> np.ndarray:
    """
    Bilinear interpolation to fill gaps between painted vertices using nearest-neighbor
    in UV space. Only fills truly empty (near-zero) atlas cells.
    """
    # Build a sparse lookup: UV cell → frame pixel
    # Use a small UV grid to find empty neighbors
    u_min = head_uv[:, 0].min(); u_max = head_uv[:, 0].max()
    v_min = head_uv[:, 1].min(); v_max = head_uv[:, 1].max()

    au1 = max(0, int(u_min * atlas_size))
    au2 = min(atlas_size - 1, int(u_max * atlas_size))
    av1 = max(0, int((1.0 - v_max) * atlas_size))
    av2 = min(atlas_size - 1, int((1.0 - v_min) * atlas_size))

    if au2 - au1 < 3 or av2 - av1 < 3:
        return atlas

    region = atlas[av1:av2, au1:au2]
    empty = region.mean(axis=2) < 10

    if empty.sum() == 0:
        return atlas

    # Build source crop from the frame pixel range used for valid vertices
    if valid.sum() > 4:
        px_v = px[valid]; py_v = py[valid]
        src_x1, src_x2 = px_v.min(), px_v.max()
        src_y1, src_y2 = py_v.min(), py_v.max()

        if src_x2 > src_x1 and src_y2 > src_y1:
            crop = front_frame[src_y1:src_y2, src_x1:src_x2].astype(np.float32)
            rw, rh = au2 - au1, av2 - av1
            if crop.shape[0] > 0 and crop.shape[1] > 0:
                resized = cv2.resize(crop, (rw, rh), interpolation=cv2.INTER_LINEAR)
                region[empty] = resized[empty]
                atlas[av1:av2, au1:au2] = region

    return atlas


def _paint_face_decal_fallback(
    atlas: np.ndarray,
    face_crop: np.ndarray,
    atlas_size: int,
) -> np.ndarray:
    """
    Fallback when no vertex data: paste face crop into known SMPL-X face UV region.
    Front-face UV from empirical measurement: atlas rows 10-455, cols 25-1197.
    """
    u1, u2 = 25, min(atlas_size - 1, 1197)
    v1, v2 = 10, 455

    region_w = u2 - u1; region_h = v2 - v1
    resized = cv2.resize(face_crop, (region_w, region_h), interpolation=cv2.INTER_LINEAR).astype(np.float32)

    existing = atlas[v1:v2, u1:u2]
    empty = existing.mean(axis=2) < 10
    blended = existing.copy()
    blended[empty] = resized[empty]
    blended[~empty] = resized[~empty] * UV_FACE_BLEND_ALPHA + existing[~empty] * (1.0 - UV_FACE_BLEND_ALPHA)

    atlas[v1:v2, u1:u2] = blended
    logger.info("Face decal pasted to SMPL-X UV region (fallback, no vertex coords)")
    return atlas


def select_best_face_frames(frames: list[np.ndarray], kpts: list) -> list[int]:
    """Return indices sorted best→worst for face capture."""
    scores = []
    for i, (frame, kp) in enumerate(zip(frames, kpts)):
        face_present = (kp is not None and kp.face is not None and len(kp.face) >= 100)
        sharpness = getattr(kp, "sharpness_score", 0.0) if kp else 0.0
        frontality = _frontality_score(kp)
        score = float(face_present) * 200.0 + sharpness + frontality * 50.0
        scores.append((i, score))
    scores.sort(key=lambda x: x[1], reverse=True)
    return [i for i, _ in scores[:5]]


def _frontality_score(kp) -> float:
    if kp is None or not kp.body or len(kp.body) < 13:
        return 0.0
    try:
        lsh = kp.body[11]; rsh = kp.body[12]
        if lsh.confidence < 0.4 or rsh.confidence < 0.4:
            return 0.0
        shoulder_sym = 1.0 - abs(lsh.y - rsh.y)
        center_offset = 1.0 - abs((lsh.x + rsh.x) / 2 - 0.5)
        return (shoulder_sym + center_offset) / 2.0
    except Exception:
        return 0.0
