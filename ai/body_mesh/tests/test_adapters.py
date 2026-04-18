"""
Stage 2 validation — adapter ABCs and mock implementations.
Run: cd ai && python3.11 -m pytest body_mesh/tests/test_adapters.py -v
"""
import os
import tempfile

import numpy as np
import pytest

from body_mesh.adapters.base import (
    BodyMeshAdapter, ClothedSurfaceAdapter, FaceIdentityAdapter,
    KeypointAdapter, SegmentationAdapter,
)
from body_mesh.adapters.mock_adapters import (
    MockBodyMeshAdapter, MockClothedSurfaceAdapter,
    MockFaceIdentityAdapter, MockKeypointAdapter, MockSegmentationAdapter,
)
from shared.schemas import ClothedMesh, FLAMEFit, Keypoints2D, SMPLXFit


DUMMY_FRAME = np.random.randint(0, 255, (720, 1280, 3), dtype=np.uint8)


# ── SegmentationAdapter ───────────────────────────────────────────────────────

def test_segmentation_is_abc():
    assert issubclass(MockSegmentationAdapter, SegmentationAdapter)


def test_segmentation_output_shape():
    with MockSegmentationAdapter() as seg:
        mask = seg.segment(DUMMY_FRAME)
    assert mask.shape == (720, 1280)
    assert mask.dtype == np.uint8
    assert set(np.unique(mask)).issubset({0, 255})


def test_segmentation_centre_is_person():
    with MockSegmentationAdapter() as seg:
        mask = seg.segment(DUMMY_FRAME)
    # Centre pixel should be person
    assert mask[360, 640] == 255


# ── KeypointAdapter ───────────────────────────────────────────────────────────

def test_keypoint_is_abc():
    assert issubclass(MockKeypointAdapter, KeypointAdapter)


def test_keypoint_output_schema():
    with MockKeypointAdapter() as kpt:
        kp = kpt.detect(DUMMY_FRAME)
    assert isinstance(kp, Keypoints2D)
    assert len(kp.body) == 133
    assert all(0.0 <= k.confidence <= 1.0 for k in kp.body)


def test_keypoint_sharpness_non_negative():
    with MockKeypointAdapter() as kpt:
        kp = kpt.detect(DUMMY_FRAME)
    assert kp.sharpness_score >= 0.0


# ── BodyMeshAdapter ───────────────────────────────────────────────────────────

def test_body_mesh_is_abc():
    assert issubclass(MockBodyMeshAdapter, BodyMeshAdapter)


def test_body_mesh_output_schema():
    from body_mesh.adapters.mock_adapters import MockKeypointAdapter
    with MockBodyMeshAdapter() as body, MockKeypointAdapter() as kpt:
        kps = [kpt.detect(DUMMY_FRAME)]
        fits = body.fit([DUMMY_FRAME], kps, gender="neutral")
    assert len(fits) == 1
    fit = fits[0]
    assert isinstance(fit, SMPLXFit)
    assert len(fit.betas) == 10
    assert all(-5.0 <= b <= 5.0 for b in fit.betas)
    assert len(fit.body_pose) == 63
    assert len(fit.cam_translation) == 3


def test_body_mesh_vertices_shape():
    from body_mesh.adapters.mock_adapters import MockKeypointAdapter
    with MockBodyMeshAdapter() as body, MockKeypointAdapter() as kpt:
        kps = [kpt.detect(DUMMY_FRAME)]
        fits = body.fit([DUMMY_FRAME], kps)
    verts = fits[0].vertices_tpose
    assert verts is not None
    assert len(verts) == 10475
    assert len(verts[0]) == 3


# ── FaceIdentityAdapter ───────────────────────────────────────────────────────

def test_face_identity_is_abc():
    assert issubclass(MockFaceIdentityAdapter, FaceIdentityAdapter)


def test_face_identity_output_schema():
    face_crop = np.random.randint(0, 255, (224, 224, 3), dtype=np.uint8)
    with MockFaceIdentityAdapter() as face:
        ff = face.fit(face_crop)
    assert isinstance(ff, FLAMEFit)
    assert len(ff.shape) == 100
    assert len(ff.expression) == 50
    assert ff.arcface_similarity is not None and ff.arcface_similarity >= 0.55
    assert ff.skin_sample_rgb is not None and len(ff.skin_sample_rgb) == 3


# ── ClothedSurfaceAdapter ─────────────────────────────────────────────────────

def test_clothed_surface_is_abc():
    assert issubclass(MockClothedSurfaceAdapter, ClothedSurfaceAdapter)


def test_clothed_surface_output_schema():
    from body_mesh.adapters.mock_adapters import MockKeypointAdapter
    mask = np.full((720, 1280), 255, dtype=np.uint8)
    with MockBodyMeshAdapter() as body, MockKeypointAdapter() as kpt:
        kps = [kpt.detect(DUMMY_FRAME)]
        fit = body.fit([DUMMY_FRAME], kps)[0]

    with MockClothedSurfaceAdapter() as cl, tempfile.TemporaryDirectory() as d:
        mesh = cl.reconstruct([DUMMY_FRAME], [mask], fit, d)
        assert isinstance(mesh, ClothedMesh)
        assert os.path.isfile(mesh.obj_path)


# ── Factory smoke test ────────────────────────────────────────────────────────

def test_factory_raises_on_unknown_model(monkeypatch):
    monkeypatch.setenv("SEGMENTATION_MODEL", "nonexistent-model")
    from body_mesh.adapters import factory
    with pytest.raises(ValueError, match="Unknown SEGMENTATION_MODEL"):
        factory.get_segmentation_adapter()


def test_factory_mock_via_env(monkeypatch):
    """Verify factory won't crash for known choices (import guard only)."""
    monkeypatch.setenv("CLOTHED_MODEL", "none")
    from body_mesh.adapters import factory
    result = factory.get_clothed_surface_adapter()
    assert result is None
