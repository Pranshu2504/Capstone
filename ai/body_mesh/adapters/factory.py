"""
Adapter factory — reads env vars and returns the configured adapters.
Import this in service.py; never import concrete adapters directly.
"""
from __future__ import annotations

import os

from .base import (
    BodyMeshAdapter, ClothedSurfaceAdapter, FaceIdentityAdapter,
    KeypointAdapter, SegmentationAdapter,
)


def get_segmentation_adapter() -> SegmentationAdapter:
    model = os.getenv("SEGMENTATION_MODEL", "rembg").lower()
    if model == "rembg":
        from .rembg_adapter import RembgAdapter
        return RembgAdapter()
    if model == "sam2-tiny":
        from .sam2_tiny_adapter import SAM2TinyAdapter
        return SAM2TinyAdapter()
    if model in ("mediapipe-selfie", "mediapipe"):
        from .mediapipe_seg_adapter import MediaPipeSelfieAdapter
        return MediaPipeSelfieAdapter()
    raise ValueError(f"Unknown SEGMENTATION_MODEL={model!r}. Choices: rembg, sam2-tiny, mediapipe-selfie")


def get_keypoint_adapter() -> KeypointAdapter:
    model = os.getenv("KEYPOINT_MODEL", "mediapipe").lower()
    if model in ("mediapipe", "mediapipe-holistic"):
        from .mediapipe_pose_adapter import MediaPipePoseAdapter
        return MediaPipePoseAdapter()
    if model in ("vitpose-base", "vitpose"):
        from .vitpose_adapter import ViTPoseBaseAdapter
        return ViTPoseBaseAdapter()
    if model in ("rtmpose-s", "rtmpose"):
        from .rtmpose_adapter import RTMPoseAdapter
        return RTMPoseAdapter()
    raise ValueError(f"Unknown KEYPOINT_MODEL={model!r}. Choices: mediapipe, vitpose-base, rtmpose-s")


def get_body_mesh_adapter() -> BodyMeshAdapter:
    model = os.getenv("BODY_MESH_MODEL", "hmr2").lower()
    if model == "hmr2":
        from .hmr2_adapter import HMR2Adapter
        return HMR2Adapter()
    if model == "smplest-x":
        from .smplestx_adapter import SMPLestXAdapter
        return SMPLestXAdapter()
    raise ValueError(f"Unknown BODY_MESH_MODEL={model!r}. Choices: hmr2, smplest-x")


def get_face_identity_adapter() -> FaceIdentityAdapter:
    model = os.getenv("FACE_ID_MODEL", "deca").lower()
    if model in ("deca", "mica"):  # accept "mica" env var for backwards compat
        from .deca_adapter import DECAFaceAdapter
        return DECAFaceAdapter()
    raise ValueError(f"Unknown FACE_ID_MODEL={model!r}. Choices: deca")


def get_clothed_surface_adapter() -> ClothedSurfaceAdapter | None:
    model = os.getenv("CLOTHED_MODEL", "none").lower()
    if model == "none":
        return None
    if model == "sifu":
        from .sifu_adapter import SIFUAdapter
        return SIFUAdapter()
    if model == "econ":
        from .econ_adapter import ECONAdapter
        return ECONAdapter()
    raise ValueError(f"Unknown CLOTHED_MODEL={model!r}. Choices: sifu, econ, none")
