"""
DECA face identity adapter.

Primary: DECA (Detailed Expression Capture and Animation) →
         FLAME shape (100-dim) + albedo texture UV map.
Fallback: MediaPipe FaceMesh 3D landmarks → approximate FLAME shape +
          direct photo crop as face texture.

The fallback still captures exact face appearance (glasses, lips, eyebrows,
eyes, hair) via the photo crop approach — geometry is approximate but texture
is pixel-accurate from the real photo.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import cv2
import numpy as np

from .base import FaceIdentityAdapter
from shared.schemas import FLAMEFit

logger = logging.getLogger(__name__)

DECA_DATA_DIR = os.getenv("DECA_DATA_DIR", str(Path.home() / ".cache" / "deca"))


class DECAFaceAdapter(FaceIdentityAdapter):
    """
    DECA → FLAME shape + albedo.  Falls back to MediaPipe photo-based texture.
    """

    def __init__(self):
        self._mode = "unknown"
        self._deca = None

    def load(self) -> None:
        try:
            # Add cloned DECA repo to path
            import sys
            deca_repo = Path(__file__).parents[3] / "third_party" / "DECA"
            if deca_repo.exists() and str(deca_repo) not in sys.path:
                sys.path.insert(0, str(deca_repo))

            from decalib.deca import DECA
            from decalib.utils.config import cfg as deca_cfg
            os.makedirs(DECA_DATA_DIR, exist_ok=True)
            deca_cfg.model.use_tex = True
            deca_cfg.rasterizer_type = "standard"  # avoid pytorch3d dependency
            self._deca = DECA(config=deca_cfg, device="cpu")
            self._mode = "deca"
            logger.info("DECA loaded (CPU mode)")
        except Exception as e:
            logger.info("DECA not available (%s) — using MediaPipe photo-texture fallback", e)
            self._mode = "mediapipe_photo"

    def unload(self) -> None:
        self._deca = None
        import gc
        gc.collect()

    def fit(self, face_img: np.ndarray, debug_path: str | None = None) -> FLAMEFit:
        if self._mode == "deca":
            return self._fit_deca(face_img)
        return self._fit_mediapipe_photo(face_img, debug_path)

    # ── DECA path ─────────────────────────────────────────────────────────────

    def _fit_deca(self, face_img: np.ndarray) -> FLAMEFit:
        import torch
        try:
            rgb_224 = cv2.resize(face_img, (224, 224), interpolation=cv2.INTER_LINEAR)
            img_t = torch.from_numpy(rgb_224.transpose(2, 0, 1)).float().unsqueeze(0) / 255.0

            with torch.no_grad():
                codedict = self._deca.encode(img_t)
                opdict = self._deca.decode(codedict)

            shape = codedict["shape"][0].cpu().numpy().tolist()
            expression = codedict["exp"][0].cpu().numpy().tolist()
            if len(shape) < 100:
                shape = shape + [0.0] * (100 - len(shape))
            if len(expression) < 50:
                expression = expression + [0.0] * (50 - len(expression))

            # Save albedo texture
            tex_path = None
            if "albedo" in opdict:
                tex = opdict["albedo"][0].permute(1, 2, 0).cpu().numpy()
                tex = (np.clip(tex, 0, 1) * 255).astype(np.uint8)
                tex_path = str(Path(DECA_DATA_DIR) / "face_albedo.png")
                cv2.imwrite(tex_path, cv2.cvtColor(tex, cv2.COLOR_RGB2BGR))

            # ArcFace similarity from DECA
            arcface_sim = None
            if "arcface" in opdict:
                arcface_sim = float(opdict.get("arcface_similarity", 0.0))

            skin_rgb = _sample_skin_from_image(face_img)

            return FLAMEFit(
                shape=shape[:100],
                expression=expression[:50],
                texture_uv_path=tex_path,
                arcface_similarity=arcface_sim,
                skin_sample_rgb=skin_rgb,
            )
        except Exception as e:
            logger.warning("DECA fit failed: %s — photo fallback", e)
            return self._fit_mediapipe_photo(face_img)

    # ── MediaPipe photo-texture fallback ──────────────────────────────────────

    def _fit_mediapipe_photo(self, face_img: np.ndarray, debug_path: str | None = None) -> FLAMEFit:
        """
        No DECA available. Use MediaPipe FaceMesh 3D landmarks to approximate
        FLAME shape, and save the face photo crop as the face texture.
        This preserves glasses, lips, eyebrows, eyes, skin — everything visible.
        """
        shape = self._mediapipe_to_flame_shape(face_img)
        skin_rgb = _sample_skin_from_image(face_img)

        # Save face photo as texture (pixel-accurate appearance)
        tex_path = None
        try:
            os.makedirs(DECA_DATA_DIR, exist_ok=True)
            tex_path = str(Path(DECA_DATA_DIR) / "face_photo_texture.jpg")
            face_bgr = cv2.cvtColor(face_img, cv2.COLOR_RGB2BGR)
            cv2.imwrite(tex_path, face_bgr, [cv2.IMWRITE_JPEG_QUALITY, 95])
            if debug_path:
                os.makedirs(Path(debug_path).parent, exist_ok=True)
                cv2.imwrite(debug_path, face_bgr)
        except Exception as e:
            logger.warning("Could not save face photo texture: %s", e)

        return FLAMEFit(
            shape=shape,
            expression=[0.0] * 50,
            texture_uv_path=tex_path,
            arcface_similarity=None,
            skin_sample_rgb=skin_rgb,
        )

    def _mediapipe_to_flame_shape(self, face_img: np.ndarray) -> list[float]:
        """
        Estimate FLAME shape betas from MediaPipe FaceMesh 3D landmarks.
        Returns 100-dim vector; first 10 dims carry most signal.
        """
        shape = [0.0] * 100
        try:
            import mediapipe as mp
            mp_face = mp.solutions.face_mesh
            with mp_face.FaceMesh(
                static_image_mode=True,
                max_num_faces=1,
                refine_landmarks=True,
                min_detection_confidence=0.5,
            ) as face_mesh:
                result = face_mesh.process(face_img)
                if not result.multi_face_landmarks:
                    return shape
                lms = result.multi_face_landmarks[0].landmark

                # Face width → shape[0]
                left_cheek = lms[234]
                right_cheek = lms[454]
                face_width = abs(left_cheek.x - right_cheek.x)
                shape[0] = float(np.clip((face_width - 0.35) * 6.0, -3, 3))

                # Face height → shape[1]
                chin = lms[152]
                forehead = lms[10]
                face_height = abs(chin.y - forehead.y)
                shape[1] = float(np.clip((face_height - 0.35) * 6.0, -3, 3))

                # Jaw width → shape[2]
                left_jaw = lms[172]
                right_jaw = lms[397]
                jaw_width = abs(left_jaw.x - right_jaw.x)
                shape[2] = float(np.clip((jaw_width - 0.25) * 8.0, -3, 3))

                # Nose length → shape[3]
                nose_tip = lms[4]
                nose_bridge = lms[6]
                nose_len = abs(nose_tip.y - nose_bridge.y)
                shape[3] = float(np.clip((nose_len - 0.10) * 10.0, -2, 2))

                # Eye separation → shape[4]
                l_eye = lms[33]
                r_eye = lms[263]
                eye_sep = abs(l_eye.x - r_eye.x)
                shape[4] = float(np.clip((eye_sep - 0.28) * 8.0, -2, 2))

        except Exception as e:
            logger.debug("MediaPipe face shape estimation failed: %s", e)

        return shape


# ── Helpers ───────────────────────────────────────────────────────────────────

def _sample_skin_from_image(img: np.ndarray) -> list[int]:
    """Sample skin tone from cheek region of face image."""
    try:
        h, w = img.shape[:2]
        # Sample from left cheek region (~25-45% x, 40-65% y)
        region = img[int(h*0.40):int(h*0.65), int(w*0.10):int(w*0.35)]
        if region.size == 0:
            region = img[int(h*0.3):int(h*0.7), int(w*0.1):int(w*0.5)]
        mean = region.mean(axis=(0, 1)).astype(int)
        return mean.tolist()
    except Exception:
        return [200, 170, 140]
