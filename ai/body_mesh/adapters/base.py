"""
Abstract base classes for all body-mesh pipeline adapters.
No model repo is imported here — concrete adapters live in their own files.
"""
from __future__ import annotations

from abc import ABC, abstractmethod

import numpy as np

from shared.schemas import ClothedMesh, FLAMEFit, Keypoints2D, SMPLXFit


class SegmentationAdapter(ABC):
    """
    Segment the person from a single BGR/RGB frame.

    Output: binary uint8 mask (H, W), 255 = person.
    """

    @abstractmethod
    def load(self) -> None:
        """Load model weights into memory. Must be idempotent."""

    @abstractmethod
    def unload(self) -> None:
        """Release model weights and free device memory."""

    @abstractmethod
    def segment(self, img: np.ndarray) -> np.ndarray:
        """
        Args:
            img: (H, W, 3) uint8 RGB image.
        Returns:
            mask: (H, W) uint8, values 0 or 255.
        """

    def __enter__(self) -> "SegmentationAdapter":
        self.load()
        return self

    def __exit__(self, *_) -> None:
        self.unload()


class KeypointAdapter(ABC):
    """
    Detect 2D keypoints for a single person in a frame.

    Supports 133-keypoint halpe whole-body format (ViTPose) and
    25-keypoint body_25 format (OpenPose) — callers must check kp count.
    """

    @abstractmethod
    def load(self) -> None: ...

    @abstractmethod
    def unload(self) -> None: ...

    @abstractmethod
    def detect(self, img: np.ndarray, mask: np.ndarray | None = None) -> Keypoints2D:
        """
        Args:
            img:  (H, W, 3) uint8 RGB image.
            mask: optional (H, W) uint8 person mask to crop search region.
        Returns:
            Keypoints2D with body (and optionally face/hands) populated.
        """

    def __enter__(self) -> "KeypointAdapter":
        self.load()
        return self

    def __exit__(self, *_) -> None:
        self.unload()


class BodyMeshAdapter(ABC):
    """
    Estimate SMPL-X parameters from one or more frames.

    Typical usage: call fit() once per frame, then use the fused betas
    computed externally in multi_view_smplx.py.
    """

    @abstractmethod
    def load(self) -> None: ...

    @abstractmethod
    def unload(self) -> None: ...

    @abstractmethod
    def fit(
        self,
        frames: list[np.ndarray],
        keypoints: list[Keypoints2D],
        gender: str = "neutral",
    ) -> list[SMPLXFit]:
        """
        Args:
            frames:    list of (H, W, 3) uint8 RGB images.
            keypoints: matching list of Keypoints2D.
            gender:    "neutral" | "male" | "female" for SMPL-X template.
        Returns:
            list of per-frame SMPLXFit (one per input frame).
        """

    def __enter__(self) -> "BodyMeshAdapter":
        self.load()
        return self

    def __exit__(self, *_) -> None:
        self.unload()


class FaceIdentityAdapter(ABC):
    """
    Fit a FLAME face model from a single frontal face crop.

    Outputs the FLAME shape coefficients (not expression) plus a
    face texture map and skin-tone sample.
    """

    @abstractmethod
    def load(self) -> None: ...

    @abstractmethod
    def unload(self) -> None: ...

    @abstractmethod
    def fit(self, face_img: np.ndarray) -> FLAMEFit:
        """
        Args:
            face_img: (224, 224, 3) uint8 RGB aligned face crop.
        Returns:
            FLAMEFit with shape, expression, arcface_similarity, skin_sample_rgb.
        """

    def __enter__(self) -> "FaceIdentityAdapter":
        self.load()
        return self

    def __exit__(self, *_) -> None:
        self.unload()


class ClothedSurfaceAdapter(ABC):
    """
    Reconstruct a clothed mesh from one or more masked frames,
    guided by the SMPL-X base mesh.

    Output is a ClothedMesh with path to the reconstructed .obj
    and optional per-vertex offsets from the SMPL-X surface.
    """

    @abstractmethod
    def load(self) -> None: ...

    @abstractmethod
    def unload(self) -> None: ...

    @abstractmethod
    def reconstruct(
        self,
        frames: list[np.ndarray],
        masks: list[np.ndarray],
        base_fit: SMPLXFit,
        output_dir: str,
    ) -> ClothedMesh:
        """
        Args:
            frames:     list of (H, W, 3) uint8 RGB keyframes.
            masks:      matching list of (H, W) uint8 person masks.
            base_fit:   fused SMPL-X fit (provides body prior).
            output_dir: local directory to write output .obj and textures.
        Returns:
            ClothedMesh.
        """

    def __enter__(self) -> "ClothedSurfaceAdapter":
        self.load()
        return self

    def __exit__(self, *_) -> None:
        self.unload()
