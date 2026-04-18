"""
HMR2.0 (4D-Humans) body mesh adapter.

Primary path:  4D-Humans HMR2 ViT-B → SMPL-X betas + body pose + camera.
Fallback path: MediaPipe body landmarks + smplx library → proportional fitting.

The fallback is always attempted when 4D-Humans is not installed, and still
produces real SMPL-X vertices via the smplx library forward pass, which are
required for UV texture projection, measurements, and VTON handoff.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import cv2
import numpy as np

from .base import BodyMeshAdapter
from shared.schemas import Keypoints2D, SMPLXFit

logger = logging.getLogger(__name__)

DEVICE = "cpu"  # resolved in load()
SMPLX_MODEL_DIR = os.getenv(
    "SMPLX_MODEL_DIR",
    str(Path(__file__).parents[2] / "smplx_models"),  # ai/smplx_models
)

# MediaPipe BlazePose → rough SMPL-X joint index mapping (body_pose is 21 joints × 3)
# MP indices: 11=L_shoulder, 12=R_shoulder, 13=L_elbow, 14=R_elbow,
#             15=L_wrist, 16=R_wrist, 23=L_hip, 24=R_hip,
#             25=L_knee, 26=R_knee, 27=L_ankle, 28=R_ankle
MP_TO_SMPLX_JOINT = {
    11: 16, 12: 17, 13: 18, 14: 19, 15: 20, 16: 21,
    23: 1,  24: 2,  25: 4,  26: 5,  27: 7,  28: 8,
}


class HMR2Adapter(BodyMeshAdapter):
    """
    Per-frame SMPL-X estimation.
    Tries HMR2.0, falls back to smplx + MediaPipe proportional fitting.
    """

    def __init__(self):
        self._mode = "unknown"
        self._hmr2_model = None
        self._smplx_model = None
        self._smplx_model_cfg = None

    def load(self) -> None:
        global DEVICE
        try:
            import torch
            if torch.backends.mps.is_available():
                DEVICE = "mps"
            elif torch.cuda.is_available():
                DEVICE = "cuda"
            else:
                DEVICE = "cpu"
        except Exception:
            DEVICE = "cpu"

        # Try 4D-Humans HMR2
        try:
            from hmr2.models import load_hmr2, DEFAULT_CHECKPOINT
            import torch
            model, cfg = load_hmr2(DEFAULT_CHECKPOINT)
            model = model.to(DEVICE)
            model.eval()
            if DEVICE == "mps":
                model = model.half()
            self._hmr2_model = model
            self._hmr2_cfg = cfg
            self._mode = "hmr2"
            logger.info("HMR2.0 loaded on %s", DEVICE)
        except Exception as e:
            logger.info("HMR2.0 not available (%s) — using smplx+MediaPipe fallback", e)
            self._load_smplx_fallback()

    def _load_smplx_fallback(self) -> None:
        try:
            import smplx
            import torch
            model_path = SMPLX_MODEL_DIR
            for gender in ("neutral", "NEUTRAL"):
                for ext in ("npz", "pkl"):
                    p = Path(model_path) / f"SMPLX_{gender.upper()}.{ext}"
                    if p.exists():
                        self._smplx_model = smplx.create(
                            model_path,
                            model_type="smplx",
                            gender="neutral",
                            use_face_contour=False,
                            num_betas=10,
                            num_expression_coeffs=10,
                            ext=ext,
                        )
                        self._smplx_model.eval()
                        self._mode = "smplx_mediapipe"
                        logger.info("smplx fallback loaded from %s", p)
                        return
            logger.warning("SMPL-X model not found in %s — will return heuristic fits", model_path)
            self._mode = "heuristic"
        except Exception as e:
            logger.warning("smplx not available (%s) — heuristic fallback", e)
            self._mode = "heuristic"

    def unload(self) -> None:
        self._hmr2_model = None
        self._smplx_model = None
        import gc
        gc.collect()
        try:
            import torch
            if torch.backends.mps.is_available():
                torch.mps.empty_cache()
        except Exception:
            pass

    def fit(
        self,
        frames: list[np.ndarray],
        keypoints: list[Keypoints2D],
        gender: str = "neutral",
    ) -> list[SMPLXFit]:
        if self._mode == "hmr2":
            return self._fit_hmr2(frames, keypoints, gender)
        if self._mode == "smplx_mediapipe":
            return self._fit_smplx_mediapipe(frames, keypoints, gender)
        return self._fit_heuristic(frames, keypoints, gender)

    # ── HMR2 path ────────────────────────────────────────────────────────────

    def _fit_hmr2(self, frames, keypoints, gender) -> list[SMPLXFit]:
        import torch
        from hmr2.utils import recursive_to
        from hmr2.datasets.vitdet_dataset import ViTDetDataset, DEFAULT_MEAN, DEFAULT_STD
        from hmr2.utils.renderer import Renderer
        results = []
        for frame, kp in zip(frames, keypoints):
            try:
                fit = self._hmr2_single(frame, kp, gender)
                results.append(fit)
            except Exception as e:
                logger.warning("HMR2 frame failed (%s), using heuristic", e)
                results.append(self._single_heuristic(frame, kp, gender))
        return results

    def _hmr2_single(self, frame, kp, gender) -> SMPLXFit:
        import torch
        # Crop person bbox from keypoints
        bbox = self._kp_bbox(kp, frame.shape)
        crop = self._crop_to_bbox(frame, bbox, out_size=256)

        # Normalize
        mean = np.array([0.485, 0.456, 0.406])
        std  = np.array([0.229, 0.224, 0.225])
        inp = (crop.astype(np.float32) / 255.0 - mean) / std
        inp_t = torch.from_numpy(inp.transpose(2, 0, 1)).unsqueeze(0).float()

        if DEVICE in ("mps", "cuda"):
            inp_t = inp_t.to(DEVICE)
            if DEVICE == "mps":
                inp_t = inp_t.half()

        with torch.no_grad():
            batch = {"img": inp_t}
            out = self._hmr2_model(batch)

        betas = out["pred_smpl_params"]["betas"][0].float().cpu().numpy().tolist()
        body_pose = out["pred_smpl_params"]["body_pose"][0].float().cpu().numpy().flatten().tolist()
        global_orient = out["pred_smpl_params"]["global_orient"][0].float().cpu().numpy().flatten().tolist()
        cam = out["pred_cam"][0].float().cpu().numpy().tolist()

        # Run SMPL-X forward to get vertices
        verts = self._smplx_forward(betas, body_pose, global_orient, gender)

        return SMPLXFit(
            betas=betas[:10],
            global_orient=global_orient[:3],
            body_pose=body_pose[:63],
            cam_translation=cam[:3] if len(cam) >= 3 else [0.0, 0.0, 2.5],
            vertices_tpose=verts,
        )

    # ── smplx + MediaPipe fallback ────────────────────────────────────────────

    def _fit_smplx_mediapipe(self, frames, keypoints, gender) -> list[SMPLXFit]:
        results = []
        for frame, kp in zip(frames, keypoints):
            try:
                betas, body_pose, global_orient = self._estimate_params_from_kp(kp, frame)
                verts = self._smplx_forward(betas, body_pose, global_orient, gender)
                results.append(SMPLXFit(
                    betas=betas,
                    global_orient=global_orient,
                    body_pose=body_pose,
                    cam_translation=[0.0, 0.0, 2.5],
                    vertices_tpose=verts,
                ))
            except Exception as e:
                logger.warning("smplx frame fit failed (%s), using heuristic", e)
                results.append(self._single_heuristic(frame, kp, gender))
        return results

    def _estimate_params_from_kp(self, kp, frame) -> tuple[list, list, list]:
        """
        Estimate SMPL-X shape betas from MediaPipe body proportions.
        Rough but effective for height/build encoding.
        """
        body = kp.body if kp else []
        betas = [0.0] * 10
        body_pose = [0.0] * 63
        global_orient = [0.0, 0.0, 0.0]

        if len(body) >= 25:
            # Shoulder width → beta 1 (broad/narrow)
            try:
                lsh = body[11]; rsh = body[12]
                shoulder_width = abs(lsh.x - rsh.x)
                betas[1] = float(np.clip((shoulder_width - 0.25) * 8.0, -3, 3))
            except Exception:
                pass

            # Hip width → beta 2
            try:
                lhip = body[23]; rhip = body[24]
                hip_width = abs(lhip.x - rhip.x)
                betas[2] = float(np.clip((hip_width - 0.20) * 8.0, -3, 3))
            except Exception:
                pass

            # Torso height ratio → beta 3
            try:
                neck = body[0]; hip_c = body[23]
                torso_h = abs(neck.y - hip_c.y)
                betas[3] = float(np.clip((torso_h - 0.40) * 5.0, -2, 2))
            except Exception:
                pass

            # Leg length ratio → beta 4
            try:
                hip = body[23]; knee = body[25]; ankle = body[27]
                leg_h = abs(hip.y - ankle.y)
                betas[4] = float(np.clip((leg_h - 0.45) * 5.0, -2, 2))
            except Exception:
                pass

        return betas, body_pose, global_orient

    def _smplx_forward(self, betas, body_pose, global_orient, gender) -> list[list[float]] | None:
        if self._smplx_model is None:
            return None
        try:
            import torch
            b = torch.tensor([betas], dtype=torch.float32)
            bp = torch.tensor([body_pose + [0.0] * max(0, 63 - len(body_pose))],
                              dtype=torch.float32)[:, :63]
            go = torch.tensor([global_orient + [0.0] * max(0, 3 - len(global_orient))],
                              dtype=torch.float32)[:, :3]
            with torch.no_grad():
                out = self._smplx_model(
                    betas=b,
                    body_pose=bp,
                    global_orient=go,
                    return_verts=True,
                )
            verts = out.vertices[0].detach().cpu().numpy()  # (10475, 3)
            return verts.tolist()
        except Exception as e:
            logger.warning("smplx forward pass failed: %s", e)
            return None

    # ── Heuristic fallback (no smplx) ────────────────────────────────────────

    def _fit_heuristic(self, frames, keypoints, gender) -> list[SMPLXFit]:
        return [self._single_heuristic(f, k, gender) for f, k in zip(frames, keypoints)]

    def _single_heuristic(self, frame, kp, gender) -> SMPLXFit:
        betas, body_pose, global_orient = self._estimate_params_from_kp(kp, frame) if kp else ([0.0]*10, [0.0]*63, [0.0]*3)
        return SMPLXFit(
            betas=betas,
            global_orient=global_orient,
            body_pose=body_pose,
            cam_translation=[0.0, 0.0, 2.5],
            vertices_tpose=None,
        )

    # ── Utilities ─────────────────────────────────────────────────────────────

    def _kp_bbox(self, kp, shape) -> tuple[int, int, int, int]:
        h, w = shape[:2]
        if not kp or not kp.body:
            return 0, 0, w, h
        xs = [p.x * w for p in kp.body if p.confidence > 0.3]
        ys = [p.y * h for p in kp.body if p.confidence > 0.3]
        if not xs:
            return 0, 0, w, h
        pad = 0.1
        x1 = max(0, int(min(xs) - w * pad))
        y1 = max(0, int(min(ys) - h * pad))
        x2 = min(w, int(max(xs) + w * pad))
        y2 = min(h, int(max(ys) + h * pad))
        return x1, y1, x2, y2

    def _crop_to_bbox(self, img, bbox, out_size=256) -> np.ndarray:
        x1, y1, x2, y2 = bbox
        crop = img[y1:y2, x1:x2]
        if crop.size == 0:
            return cv2.resize(img, (out_size, out_size))
        return cv2.resize(crop, (out_size, out_size), interpolation=cv2.INTER_LINEAR)
