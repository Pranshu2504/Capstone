"""
Multi-view UV texture projection.

Strategy per frame:
  1. Get person bounding box from segmentation mask (ground truth position).
  2. Map 3D vertex positions to pixel coords using mask bbox (not assumed azimuths).
  3. Sample frame RGB for each visible vertex (in mask), accumulate into UV atlas.
  4. Inpaint holes with OpenCV TELEA.
  5. Overlay face+hair photo at high alpha (see face_overlay.py).

Uses orthographic projection — no CUDA needed on M2.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import cv2
import numpy as np

logger = logging.getLogger(__name__)

UV_SIZE = 2048
INPAINT_RADIUS = 8
FACE_FRAME_WEIGHT_BOOST = 5.0   # front frame weight multiplier for head vertices
HEAD_Y_NORM_THRESHOLD = 0.93    # y_norm > this = actual head (neck and above, Y > 0.30m)


def project_texture(
    frames: list[np.ndarray],
    masks: list[np.ndarray],
    vertices: np.ndarray,
    smplx_data: dict | None,
    output_dir: str,
    best_face_frame_idx: int = 0,
    face_landmarks: list | None = None,
) -> str:
    """
    Project video frame RGB onto a UV texture atlas using mask-calibrated projection.
    """
    os.makedirs(output_dir, exist_ok=True)
    out_path = str(Path(output_dir) / "texture.png")

    if smplx_data is None or "faces" not in smplx_data or vertices is None or len(vertices) == 0:
        logger.warning("No mesh geometry — generating skin-tone placeholder texture.")
        _write_placeholder_texture(out_path)
        return out_path

    uv_per_vertex = _build_uv_per_vertex(vertices, smplx_data)

    atlas = _multi_view_projection(
        frames, masks, vertices, uv_per_vertex, best_face_frame_idx
    )
    atlas_filled = _inpaint_holes(atlas)

    # Face + hair overlay: paste face photo at high alpha for exact appearance
    from body_mesh.texture.face_overlay import overlay_face_onto_atlas
    front_frame = frames[best_face_frame_idx] if frames else None
    front_mask = masks[best_face_frame_idx] if masks else None
    atlas_filled = overlay_face_onto_atlas(
        atlas=atlas_filled.astype(np.float32),
        front_frame=front_frame,
        front_mask=front_mask,
        face_landmarks=face_landmarks,
        vertices=vertices,
        uv_per_vertex=uv_per_vertex,
        atlas_size=UV_SIZE,
    ).astype(np.uint8)

    cv2.imwrite(out_path, cv2.cvtColor(atlas_filled, cv2.COLOR_RGB2BGR))
    logger.info("Texture atlas written: %s (%dx%d)", out_path, UV_SIZE, UV_SIZE)
    return out_path


def project_texture_simple(
    frames: list[np.ndarray],
    masks: list[np.ndarray],
    output_dir: str,
    best_face_frame_idx: int = 0,
    face_landmarks: list | None = None,
) -> str:
    """Simplified texture without mesh geometry — uses best front frame as base."""
    os.makedirs(output_dir, exist_ok=True)
    out_path = str(Path(output_dir) / "texture.png")

    best_frame, best_mask = _pick_best_frame(frames, masks)
    atlas = _frame_to_atlas(best_frame, best_mask, UV_SIZE)

    from body_mesh.texture.face_overlay import overlay_face_onto_atlas
    front_frame = frames[best_face_frame_idx] if frames else None
    front_mask = masks[best_face_frame_idx] if masks else None
    atlas = overlay_face_onto_atlas(
        atlas=atlas.astype(np.float32),
        front_frame=front_frame,
        front_mask=front_mask,
        face_landmarks=face_landmarks,
        vertices=None,
        uv_per_vertex=None,
        atlas_size=UV_SIZE,
    ).astype(np.uint8)

    cv2.imwrite(out_path, cv2.cvtColor(atlas, cv2.COLOR_RGB2BGR))
    logger.info("Simple texture atlas written → %s", out_path)
    return out_path


# ── Internal ──────────────────────────────────────────────────────────────────

def _build_uv_per_vertex(vertices: np.ndarray, smplx_data: dict) -> np.ndarray:
    """Build (N_verts, 2) UV coords from SMPL-X topology data."""
    n = len(vertices)
    uv = np.zeros((n, 2), dtype=np.float32)

    if "vt" in smplx_data and "ft" in smplx_data and "faces" in smplx_data:
        faces = smplx_data["faces"]
        vt = smplx_data["vt"]
        ft = smplx_data["ft"]
        counts = np.zeros(n, dtype=np.int32)
        for fi in range(len(faces)):
            for c in range(3):
                mv = faces[fi, c]
                uv_v = ft[fi, c]
                if mv < n and uv_v < len(vt):
                    uv[mv] += vt[uv_v]
                    counts[mv] += 1
        valid = counts > 0
        uv[valid] /= counts[valid, None]
    else:
        # Cylindrical fallback
        x, y = vertices[:, 0], vertices[:, 1]
        y_min, y_max = y.min(), y.max()
        uv[:, 0] = (np.arctan2(x, vertices[:, 2]) + np.pi) / (2 * np.pi)
        uv[:, 1] = (y - y_min) / (y_max - y_min + 1e-6)

    return uv


def _mask_bbox(mask: np.ndarray) -> tuple[int, int, int, int] | None:
    """Return (x1, y1, x2, y2) bounding box of non-zero mask pixels, or None."""
    rows = np.any(mask > 128, axis=1)
    cols = np.any(mask > 128, axis=0)
    if not rows.any() or not cols.any():
        return None
    y1, y2 = int(np.argmax(rows)), int(len(rows) - 1 - np.argmax(rows[::-1]))
    x1, x2 = int(np.argmax(cols)), int(len(cols) - 1 - np.argmax(cols[::-1]))
    if x2 <= x1 or y2 <= y1:
        return None
    return x1, y1, x2, y2


def _multi_view_projection(
    frames: list[np.ndarray],
    masks: list[np.ndarray],
    vertices: np.ndarray,
    uv_per_vertex: np.ndarray,
    best_face_idx: int,
) -> np.ndarray:
    """
    Accumulate RGB from all frames into UV atlas using mask-calibrated projection.
    Each frame: find person bbox from mask, map 3D positions to that bbox.
    Front frame gets FACE_FRAME_WEIGHT_BOOST × weight for head vertices.
    """
    accum = np.zeros((UV_SIZE, UV_SIZE, 3), dtype=np.float64)
    weight = np.zeros((UV_SIZE, UV_SIZE), dtype=np.float64)

    # Precompute vertex height normalisation (used for Y projection)
    y_min = vertices[:, 1].min()
    y_max = vertices[:, 1].max()
    y_range = y_max - y_min + 1e-6
    y_norm = (vertices[:, 1] - y_min) / y_range   # (N,) in [0,1]
    is_head = y_norm > HEAD_Y_NORM_THRESHOLD       # actual head/neck vertices only

    # Torso X range for calibration — much narrower than full T-pose (no arm stretch)
    torso_mask = (y_norm > 0.35) & (y_norm < 0.75)
    if torso_mask.sum() > 10:
        torso_x_min = vertices[torso_mask, 0].min()
        torso_x_max = vertices[torso_mask, 0].max()
    else:
        torso_x_min = vertices[:, 0].min()
        torso_x_max = vertices[:, 0].max()

    for i, (frame, mask) in enumerate(zip(frames, masks)):
        is_front = (i == best_face_idx)
        col, w = _project_frame_masked(
            frame, mask, vertices, uv_per_vertex, y_norm, is_head, is_front,
            torso_x_min=torso_x_min, torso_x_max=torso_x_max,
        )
        accum += col * w[:, :, None]
        weight += w

    w_safe = np.where(weight > 0, weight, 1.0)
    atlas = (accum / w_safe[:, :, None])
    atlas[weight == 0] = 0.0
    return atlas.astype(np.float32)


def _project_frame_masked(
    frame: np.ndarray,
    mask: np.ndarray,
    vertices: np.ndarray,
    uv: np.ndarray,
    y_norm: np.ndarray,
    is_head: np.ndarray,
    is_front: bool,
    torso_x_min: float = -0.25,
    torso_x_max: float = 0.25,
) -> tuple[np.ndarray, np.ndarray]:
    """
    Project frame pixels onto UV atlas using mask-calibrated, torso-anchored mapping.

    Uses torso X range (not full T-pose arm-outstretched range) for X calibration,
    so clothing pixels land on the correct body vertices instead of missing due to
    T-pose arm stretch.
    """
    fh, fw = frame.shape[:2]

    color_atlas = np.zeros((UV_SIZE, UV_SIZE, 3), dtype=np.float32)
    weight_atlas = np.zeros((UV_SIZE, UV_SIZE), dtype=np.float32)

    # Get person's actual pixel position from mask
    bbox = _mask_bbox(mask)
    if bbox is None:
        return color_atlas, weight_atlas
    bx1, by1, bx2, by2 = bbox

    pad_x = max(5, int((bx2 - bx1) * 0.03))
    pad_y = max(5, int((by2 - by1) * 0.01))
    bx1 = max(0, bx1 - pad_x); bx2 = min(fw - 1, bx2 + pad_x)
    by1 = max(0, by1 - pad_y); by2 = min(fh - 1, by2 + pad_y)

    bbox_w = bx2 - bx1 + 1
    bbox_h = by2 - by1 + 1

    # Use torso X range to calibrate: torso is ±0.20m, maps to center of person bbox
    # This prevents arm vertices (at ±0.8m in T-pose) from mapping to background pixels
    x_span = torso_x_max - torso_x_min + 1e-6
    bbox_center_x = (bx1 + bx2) / 2.0
    # Map torso width to 70% of bbox width (leaves room for slight arm visibility)
    body_px_half = bbox_w * 0.45

    px = (bbox_center_x + (vertices[:, 0] - (torso_x_min + torso_x_max) / 2) / x_span * bbox_w).astype(int)
    py = (by1 + (1.0 - y_norm) * bbox_h).astype(int)
    px = np.clip(px, 0, fw - 1)
    py = np.clip(py, 0, fh - 1)

    # UV pixel coords in atlas
    u_px = np.clip((uv[:, 0] * (UV_SIZE - 1)).astype(int), 0, UV_SIZE - 1)
    v_px = np.clip(((1.0 - uv[:, 1]) * (UV_SIZE - 1)).astype(int), 0, UV_SIZE - 1)

    # Visibility: vertex's projected pixel must be inside person mask
    in_mask = mask[py, px] > 128

    frame_weight = np.ones(len(vertices), dtype=np.float32)
    if is_front:
        frame_weight = np.where(is_head, frame_weight * FACE_FRAME_WEIGHT_BOOST, frame_weight)

    valid = in_mask
    if valid.sum() == 0:
        return color_atlas, weight_atlas

    sample = frame[py[valid], px[valid]].astype(np.float32)
    w = frame_weight[valid]
    color_atlas[v_px[valid], u_px[valid]] = sample
    weight_atlas[v_px[valid], u_px[valid]] = w

    return color_atlas, weight_atlas


def _inpaint_holes(atlas: np.ndarray) -> np.ndarray:
    atlas_u8 = np.clip(atlas, 0, 255).astype(np.uint8)
    gray = cv2.cvtColor(atlas_u8, cv2.COLOR_RGB2GRAY)
    hole_mask = (gray < 5).astype(np.uint8) * 255
    if hole_mask.sum() == 0:
        return atlas_u8
    bgr = cv2.cvtColor(atlas_u8, cv2.COLOR_RGB2BGR)
    inpainted = cv2.inpaint(bgr, hole_mask, INPAINT_RADIUS, cv2.INPAINT_TELEA)
    return cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB)


def _pick_best_frame(frames, masks):
    best_i = max(range(len(frames)), key=lambda i: masks[i].sum())
    return frames[best_i], masks[best_i]


def _frame_to_atlas(frame, mask, size) -> np.ndarray:
    resized = cv2.resize(frame, (size, size), interpolation=cv2.INTER_AREA)
    mask_r = cv2.resize(mask, (size, size), interpolation=cv2.INTER_NEAREST)
    result = resized.copy()
    result[mask_r == 0] = [30, 25, 20]
    return result.astype(np.float32)


def _write_placeholder_texture(path: str) -> None:
    atlas = np.full((UV_SIZE, UV_SIZE, 3), [190, 160, 130], dtype=np.uint8)
    cv2.imwrite(path, cv2.cvtColor(atlas, cv2.COLOR_RGB2BGR))
