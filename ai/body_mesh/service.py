"""
Body mesh capture service — full pipeline orchestrator.

Stages:
  1  preprocess: extract max keyframes from video (angle-spaced)
  2  quality gate
  3  segmentation
  4  keypoints (body + face landmarks)
  5  per-frame body mesh (HMR2 → smplx fallback → heuristic)
  6  multi-view shape fusion + height scale
  7  DECA face fit (DECA → MediaPipe+photo fallback)
  8  FLAME head merge
  9  clothed mesh (texture-projection approach)
  10 multi-view UV texture projection
  11 face+hair overlay (exact appearance from photo)
  12 skin tone anchoring for occluded body regions
  13 measurements
  14 GLB export with PBR materials
  15 persist / S3 upload
"""
from __future__ import annotations

import gc
import json
import logging
import os
import shutil
import tempfile
import time
from datetime import datetime, timezone
from pathlib import Path
from uuid import UUID

import cv2
import numpy as np

from body_mesh.adapters.factory import (
    get_segmentation_adapter, get_keypoint_adapter,
    get_body_mesh_adapter, get_face_identity_adapter,
)
from body_mesh.fit.clothed_fuse import build_clothed_mesh_from_smplx
from body_mesh.fit.flame_merge import merge_flame_into_smplx
from body_mesh.fit.multi_view_smplx import fuse_shape
from body_mesh.measurements import extract_measurements
from body_mesh.preprocess.quality import quality_gate
from body_mesh.preprocess.video import extract_keyframes
from body_mesh.texture.face_overlay import select_best_face_frames
from body_mesh.texture.project import project_texture, project_texture_simple
from body_mesh.texture.skin_match import apply_skin_to_occluded, sample_skin_tone
from shared.schemas import (
    BodyMeshArtifact, FLAMEFit, Measurements, SMPLXFit, VTONHandoff,
)

logger = logging.getLogger(__name__)

N_KEYFRAMES = int(os.getenv("N_KEYFRAMES", "16"))   # more frames = better texture
LOW_MEM_MODE = os.getenv("LOW_MEM_MODE", "false").lower() == "true"

ProgressCallback = callable  # (stage: str, pct: int) -> None


async def run_capture(
    video_path: str,
    user_id: UUID,
    height_cm: int,
    gender: str = "neutral",
    job_id: str | None = None,
    job_dir: str | None = None,
    on_progress: ProgressCallback | None = None,
) -> BodyMeshArtifact:
    """
    Full pipeline: video → BodyMeshArtifact.
    """
    start_t = time.monotonic()
    tmp_owned = job_dir is None
    if tmp_owned:
        _tmpdir = tempfile.mkdtemp(prefix="zora_capture_")
        job_dir = _tmpdir

    def _progress(stage: str, pct: int):
        logger.info("[%s] %d%%", stage, pct)
        if on_progress:
            on_progress(stage, pct)

    try:
        # ── Stage 1: Extract maximum keyframes ────────────────────────────────
        _progress("preprocessing", 3)
        n_frames = 8 if LOW_MEM_MODE else N_KEYFRAMES
        frames = extract_keyframes(video_path, n=n_frames)
        logger.info("Extracted %d keyframes", len(frames))
        _progress("preprocessing", 8)

        # ── Stage 2: Quality gate ─────────────────────────────────────────────
        quality_gate(frames, raise_on_fail=True)

        # ── Stage 3: Segmentation ─────────────────────────────────────────────
        _progress("segmenting", 15)
        masks = _run_segmentation(frames)
        _gc()

        # ── Stage 4: Keypoints (body + 468 face landmarks) ────────────────────
        _progress("segmenting", 22)
        kpts = _run_keypoints(frames)
        _gc()

        # ── Stage 5: Per-frame body mesh ──────────────────────────────────────
        _progress("fitting", 32)
        per_frame_fits = _run_body_mesh(frames, kpts, gender)
        _gc()

        # ── Stage 6: Multi-view shape fusion + height calibration ─────────────
        _progress("fitting", 46)
        fused = fuse_shape(per_frame_fits, height_cm=float(height_cm))

        # ── Stage 7: Face identity fit ────────────────────────────────────────
        _progress("face_fitting", 53)
        # Pick best face frames (sharpest + most frontal)
        face_frame_indices = select_best_face_frames(frames, kpts)
        best_face_idx = face_frame_indices[0]
        front_frame = frames[best_face_idx]
        front_kp = kpts[best_face_idx]

        # For face fit: use the sharpest frame; crop to face region
        face_crop = _crop_face_region(front_frame, front_kp)
        jid = job_id or "unknown"
        debug_path = f"outputs/job_{jid}/face_debug.jpg"

        flame_fit = _run_face_fit(face_crop, front_kp, debug_path)
        _gc()

        # ── Stage 8: FLAME head merge ──────────────────────────────────────────
        _progress("face_fitting", 60)
        if fused.vertices_tpose:
            fused = merge_flame_into_smplx(fused, flame_fit)

        # ── Stage 9: Clothed mesh (texture-projection approach) ────────────────
        _progress("clothed_reconstruction", 65)
        clothed_mesh = build_clothed_mesh_from_smplx(fused, job_dir)

        # ── Stage 10+11: Texture projection + face/hair overlay ───────────────
        _progress("texturing", 70)
        smplx_data = _load_smplx_data()

        if fused.vertices_tpose and smplx_data is not None and "faces" in smplx_data:
            verts = np.array(fused.vertices_tpose, dtype=np.float32)
            texture_path = project_texture(
                frames, masks, verts, smplx_data, job_dir,
                best_face_frame_idx=best_face_idx,
                face_landmarks=front_kp.face if front_kp else None,
            )
        else:
            texture_path = project_texture_simple(
                frames, masks, job_dir,
                best_face_frame_idx=best_face_idx,
                face_landmarks=front_kp.face if front_kp else None,
            )
        _progress("texturing", 80)

        # ── Stage 12: Skin tone anchoring ─────────────────────────────────────
        skin_rgb = sample_skin_tone(front_frame, front_kp.face if front_kp else None)
        texture_img = cv2.cvtColor(cv2.imread(texture_path), cv2.COLOR_BGR2RGB)
        texture_filled = apply_skin_to_occluded(texture_img, skin_rgb)
        cv2.imwrite(texture_path, cv2.cvtColor(texture_filled, cv2.COLOR_RGB2BGR))

        # Also save DECA face texture if we have one
        if flame_fit.texture_uv_path and Path(flame_fit.texture_uv_path).exists():
            face_tex_dest = str(Path(job_dir) / "face_texture.jpg")
            shutil.copy2(flame_fit.texture_uv_path, face_tex_dest)
            logger.info("Face texture saved: %s", face_tex_dest)

        # ── Stage 13: Measurements ─────────────────────────────────────────────
        _progress("measuring", 86)
        measurements = _extract_measurements_safe(fused, height_cm)

        # ── Stage 14: GLB export ───────────────────────────────────────────────
        _progress("packaging", 91)
        clothed_glb = _export_glb(fused, texture_path, job_dir, "clothed", with_texture=True)
        body_glb = _export_glb(fused, None, job_dir, "body", with_texture=False)
        thumbnail_path = _render_thumbnail(front_frame, job_dir)

        # ── Stage 15: Persist + upload ─────────────────────────────────────────
        _progress("uploading", 96)
        user_prefix = f"users/{user_id}"
        keys = _upload_artifacts(
            user_prefix, clothed_glb, body_glb, texture_path,
            thumbnail_path, fused, flame_fit, job_dir
        )

        final_dir = f"outputs/job_{jid}"
        os.makedirs(final_dir, exist_ok=True)
        for src, dst in [
            (clothed_glb, "clothed.glb"),
            (body_glb, "body.glb"),
            (texture_path, "texture.png"),
            (thumbnail_path, "thumbnail.jpg"),
        ]:
            if Path(src).exists():
                shutil.copy2(src, os.path.join(final_dir, dst))
        logger.info("Job results persisted to %s", final_dir)

        runtime_ms = int((time.monotonic() - start_t) * 1000)
        _progress("complete", 100)

        face_preserved = (
            flame_fit.arcface_similarity is not None and flame_fit.arcface_similarity >= 0.55
        ) or (flame_fit.texture_uv_path is not None)

        return BodyMeshArtifact(
            user_id=user_id,
            clothed_glb_key=keys["clothed_glb"],
            clothed_thumbnail_key=keys["thumbnail"],
            body_glb_key=keys["body_glb"],
            body_betas_key=keys["betas"],
            face_glb_key=keys.get("face_glb"),
            flame_params_key=keys.get("flame"),
            face_identity_preserved=face_preserved,
            arcface_similarity=flame_fit.arcface_similarity,
            skin_tone_rgb=skin_rgb,
            measurements=measurements,
            model_versions={
                "body": f"{os.getenv('BODY_MESH_MODEL', 'hmr2')}@2.0",
                "face": "deca@1.0" if flame_fit.arcface_similarity else "mediapipe-photo@1.0",
                "clothed": "texture-projection@2.0",
                "segmentation": os.getenv("SEGMENTATION_MODEL", "rembg"),
            },
            created_at=datetime.now(timezone.utc),
            runtime_ms=runtime_ms,
            hardware=_get_hardware(),
            degraded=clothed_mesh.degraded,
        )

    finally:
        if tmp_owned:
            keep_raw = os.getenv("DEBUG_KEEP_RAW", "false").lower() == "true"
            if not keep_raw:
                shutil.rmtree(job_dir, ignore_errors=True)


# ── Stage runners ─────────────────────────────────────────────────────────────

def _run_segmentation(frames: list[np.ndarray]) -> list[np.ndarray]:
    try:
        from body_mesh.adapters.rembg_adapter import RembgAdapter
        with RembgAdapter() as seg:
            masks = [seg.segment(f) for f in frames]
        logger.info("Segmentation: rembg (%d frames)", len(frames))
        return masks
    except Exception as e:
        logger.warning("rembg failed (%s), falling back to MediaPipe selfie", e)
        from body_mesh.adapters.mediapipe_seg_adapter import MediaPipeSelfieAdapter
        with MediaPipeSelfieAdapter() as seg:
            return [seg.segment(f) for f in frames]


def _run_keypoints(frames: list[np.ndarray]) -> list:
    from body_mesh.adapters.mediapipe_pose_adapter import MediaPipePoseAdapter
    with MediaPipePoseAdapter() as kpt:
        return [kpt.detect(f) for f in frames]


def _run_body_mesh(frames, kpts, gender) -> list[SMPLXFit]:
    adapter = get_body_mesh_adapter()
    with adapter as body:
        # Process all frames together so adapter can run batch if available
        return body.fit(frames, kpts, gender=gender)


def _crop_face_region(frame: np.ndarray, kp) -> np.ndarray:
    """Crop the face region (+ hair above) from a frame for DECA input."""
    h, w = frame.shape[:2]
    if kp and kp.face and len(kp.face) >= 100:
        xs = [lm.x for lm in kp.face]
        ys = [lm.y for lm in kp.face]
        fx1, fy1 = min(xs), min(ys)
        fx2, fy2 = max(xs), max(ys)
        face_h = fy2 - fy1
        face_w = fx2 - fx1
        # Extend to include hair (60% above forehead) and sides (20% each)
        y1 = max(0.0, fy1 - face_h * 0.65)
        y2 = min(1.0, fy2 + face_h * 0.08)
        x1 = max(0.0, fx1 - face_w * 0.20)
        x2 = min(1.0, fx2 + face_w * 0.20)
        crop = frame[int(y1*h):int(y2*h), int(x1*w):int(x2*w)]
        if crop.size > 0:
            return crop
    # Heuristic fallback
    return frame[int(h*0.02):int(h*0.55), int(w*0.20):int(w*0.80)]


def _run_face_fit(face_img: np.ndarray, kp, debug_path: str | None = None) -> FLAMEFit:
    skin_rgb = sample_skin_tone(face_img, kp.face if kp else None)
    adapter = get_face_identity_adapter()
    try:
        with adapter as face_id:
            fit = face_id.fit(face_img, debug_path=debug_path)
            if fit:
                if not fit.skin_sample_rgb:
                    fit.skin_sample_rgb = skin_rgb
                return fit
    except Exception as e:
        logger.warning("Face identity adapter failed: %s — neutral FLAME", e)
    return FLAMEFit(shape=[0.0]*100, expression=[0.0]*50, skin_sample_rgb=skin_rgb)


def _extract_measurements_safe(fused: SMPLXFit, height_cm: int) -> Measurements:
    if fused.vertices_tpose:
        try:
            return extract_measurements(fused.vertices_tpose)
        except Exception as e:
            logger.warning("Vertex measurement extraction failed: %s — proportional fallback", e)
    h = float(height_cm)
    return Measurements(
        height_cm=h,
        bust_cm=round(h * 0.527, 1),
        underbust_cm=round(h * 0.456, 1),
        chest_cm=round(h * 0.514, 1),
        waist_cm=round(h * 0.434, 1),
        hips_cm=round(h * 0.559, 1),
        thigh_cm=round(h * 0.320, 1),
        inseam_cm=round(h * 0.445, 1),
        shoulder_cm=round(h * 0.240, 1),
        arm_length_cm=round(h * 0.343, 1),
        neck_cm=round(h * 0.206, 1),
    )


def _load_smplx_data() -> dict | None:
    model_dir = Path(os.getenv(
        "SMPLX_MODEL_DIR",
        str(Path(__file__).parents[1] / "smplx_models"),  # ai/smplx_models
    ))
    for fname in ["SMPLX_NEUTRAL.npz", "SMPLX_NEUTRAL.pkl"]:
        fpath = model_dir / fname
        if fpath.exists():
            try:
                data = np.load(str(fpath), allow_pickle=True)
                result = {}
                if "f" in data:
                    result["faces"] = data["f"].astype(np.int32)
                if "vt" in data:
                    result["vt"] = data["vt"].astype(np.float64)
                if "ft" in data:
                    result["ft"] = data["ft"].astype(np.int32)
                if result:
                    return result
            except Exception:
                pass
    return None


def _export_glb(
    fused: SMPLXFit,
    texture_path: str | None,
    output_dir: str,
    name: str,
    with_texture: bool,
) -> str:
    import trimesh
    out_path = str(Path(output_dir) / f"{name}.glb")

    if not fused.vertices_tpose:
        mesh = trimesh.Trimesh(vertices=[[0, 0, 0]], faces=[], process=False)
        mesh.export(out_path)
        return out_path

    verts = np.array(fused.vertices_tpose, dtype=np.float32)
    smplx_data = _load_smplx_data()
    faces = smplx_data["faces"] if smplx_data and "faces" in smplx_data else None

    if faces is None or len(faces) == 0:
        logger.error("SMPL-X faces not loaded — check SMPLX_MODEL_DIR. Exporting vertex cloud.")
        # Export as point cloud GLB so viewer shows something
        mesh = trimesh.points.PointCloud(verts)
        mesh.export(out_path)
        return out_path

    mesh = trimesh.Trimesh(vertices=verts, faces=faces, process=False)

    if with_texture and texture_path and Path(texture_path).exists():
        try:
            from PIL import Image
            pil_image = Image.open(texture_path)
            vt = smplx_data.get("vt") if smplx_data else None
            ft = smplx_data.get("ft") if smplx_data else None

            if vt is not None and ft is not None:
                uv = np.zeros((len(verts), 2), dtype=np.float64)
                counts = np.zeros(len(verts), dtype=np.int32)
                ft_arr = np.array(ft)
                faces_arr = np.array(faces)
                for fi in range(len(faces_arr)):
                    for c in range(3):
                        mv = int(faces_arr[fi, c]); uv_v = int(ft_arr[fi, c])
                        if mv < len(verts) and uv_v < len(vt):
                            uv[mv] += vt[uv_v]; counts[mv] += 1
                valid = counts > 0
                uv[valid] /= counts[valid, None]
                # flip V axis (GLB convention)
                uv[:, 1] = 1.0 - uv[:, 1]
                material = trimesh.visual.material.PBRMaterial(
                    baseColorTexture=pil_image,
                    metallicFactor=0.0,
                    roughnessFactor=0.75,
                )
                mesh.visual = trimesh.visual.texture.TextureVisuals(
                    uv=uv, material=material
                )
                logger.info("Attached PBR texture to %s.glb (%d UV coords)", name, int(valid.sum()))
        except Exception as e:
            logger.warning("Could not attach texture to GLB: %s", e)

    mesh.export(out_path)
    logger.info("Exported %s.glb (%d verts, %d faces)", name, len(verts), len(faces))
    return out_path


def _render_thumbnail(front_frame: np.ndarray, output_dir: str) -> str:
    thumb = cv2.resize(front_frame, (512, 512), interpolation=cv2.INTER_AREA)
    thumb_path = str(Path(output_dir) / "thumbnail.jpg")
    cv2.imwrite(thumb_path, cv2.cvtColor(thumb, cv2.COLOR_RGB2BGR),
                [cv2.IMWRITE_JPEG_QUALITY, 92])
    return thumb_path


def _upload_artifacts(
    prefix, clothed_glb, body_glb, texture, thumbnail, fused, flame_fit, job_dir
) -> dict[str, str]:
    betas_path = str(Path(job_dir) / "betas.npy")
    np.save(betas_path, np.array(fused.betas, dtype=np.float32))

    flame_path = str(Path(job_dir) / "flame_params.npz")
    np.savez(flame_path, shape=flame_fit.shape, expression=flame_fit.expression)

    bucket = os.getenv("S3_BUCKET")
    if bucket and os.getenv("AWS_ACCESS_KEY_ID"):
        try:
            from shared.storage import upload_file
            return {
                "clothed_glb": upload_file(clothed_glb, f"{prefix}/clothed.glb"),
                "body_glb":    upload_file(body_glb,    f"{prefix}/body.glb"),
                "texture":     upload_file(texture,     f"{prefix}/texture.png"),
                "thumbnail":   upload_file(thumbnail,   f"{prefix}/thumbnail.jpg"),
                "betas":       upload_file(betas_path,  f"{prefix}/betas.npy"),
                "flame":       upload_file(flame_path,  f"{prefix}/flame_params.npz"),
            }
        except Exception as e:
            logger.warning("S3 upload failed (%s) — local paths", e)

    return {
        "clothed_glb": clothed_glb,
        "body_glb":    body_glb,
        "texture":     texture,
        "thumbnail":   thumbnail,
        "betas":       betas_path,
        "flame":       flame_path,
    }


def _get_hardware() -> str:
    try:
        import torch
        if torch.backends.mps.is_available():
            return "mps"
        if torch.cuda.is_available():
            return "cuda"
    except Exception:
        pass
    return "cpu"


def _gc():
    gc.collect()
    try:
        import torch
        if torch.backends.mps.is_available():
            torch.mps.empty_cache()
    except Exception:
        pass
