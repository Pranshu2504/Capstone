"""
Stage 1 validation — Pydantic schemas.
Run: cd ai && python -m pytest body_mesh/tests/test_schemas.py -v
"""
import pytest
from datetime import datetime, timezone
from uuid import uuid4

from shared.schemas import (
    Measurements, SMPLXFit, FLAMEFit, Keypoints2D, Keypoint,
    BodyMeshArtifact, JobStatus, VTONHandoff, STAGE_PROGRESS,
)


# ── Measurements ─────────────────────────────────────────────────────────────

def test_measurements_valid():
    m = Measurements(
        height_cm=175.0, bust_cm=92.0, underbust_cm=80.0, chest_cm=90.0,
        waist_cm=76.0, hips_cm=98.0, thigh_cm=56.0, inseam_cm=78.0,
        shoulder_cm=42.0, arm_length_cm=60.0, neck_cm=36.0,
    )
    assert m.height_cm == 175.0
    assert m.waist_cm < m.bust_cm


def test_measurements_waist_must_be_less_than_bust():
    with pytest.raises(ValueError, match="waist_cm"):
        Measurements(
            height_cm=175.0, bust_cm=70.0, underbust_cm=65.0, chest_cm=72.0,
            waist_cm=80.0,  # invalid: waist > bust
            hips_cm=90.0, thigh_cm=50.0, inseam_cm=78.0,
            shoulder_cm=40.0, arm_length_cm=60.0, neck_cm=35.0,
        )


def test_measurements_out_of_range():
    with pytest.raises(ValueError):
        Measurements(
            height_cm=50.0,  # below 100 cm minimum
            bust_cm=90.0, underbust_cm=80.0, chest_cm=88.0,
            waist_cm=70.0, hips_cm=95.0, thigh_cm=55.0, inseam_cm=30.0,
            shoulder_cm=40.0, arm_length_cm=58.0, neck_cm=35.0,
        )


# ── SMPLXFit ─────────────────────────────────────────────────────────────────

def test_smplxfit_betas_clamped():
    fit = SMPLXFit(
        betas=[10.0, -10.0] + [0.0] * 8,   # outside [-5, 5]
        global_orient=[0.0, 0.0, 0.0],
        body_pose=[0.0] * 63,
        cam_translation=[0.0, 0.0, 2.5],
    )
    assert fit.betas[0] == 5.0
    assert fit.betas[1] == -5.0


def test_smplxfit_betas_wrong_dim():
    with pytest.raises(ValueError, match="betas must be"):
        SMPLXFit(
            betas=[0.0] * 7,  # invalid dim
            global_orient=[0.0, 0.0, 0.0],
            body_pose=[0.0] * 63,
            cam_translation=[0.0, 0.0, 2.5],
        )


# ── FLAMEFit ─────────────────────────────────────────────────────────────────

def test_flamefit_valid():
    ff = FLAMEFit(
        shape=[0.0] * 100,
        expression=[0.0] * 50,
        arcface_similarity=0.72,
        skin_sample_rgb=[200, 160, 130],
    )
    assert ff.arcface_similarity == 0.72


def test_flamefit_shape_wrong_dim():
    with pytest.raises(ValueError, match="FLAME shape must be 100-dim"):
        FLAMEFit(shape=[0.0] * 50, expression=[0.0] * 50)


def test_flamefit_low_arcface_warns():
    with pytest.warns(UserWarning, match="below 0.55"):
        FLAMEFit(shape=[0.0] * 100, expression=[0.0] * 50, arcface_similarity=0.40)


# ── Keypoints2D ──────────────────────────────────────────────────────────────

def test_keypoints_valid():
    kp = Keypoints2D(
        body=[Keypoint(x=0.5, y=0.3, confidence=0.9)] * 133,
        sharpness_score=145.0,
    )
    assert len(kp.body) == 133


def test_keypoints_wrong_count():
    with pytest.raises(ValueError, match="17, 25, 33, or 133"):
        Keypoints2D(body=[Keypoint(x=0.0, y=0.0, confidence=0.5)] * 20)


# ── BodyMeshArtifact ─────────────────────────────────────────────────────────

def _good_measurements():
    return Measurements(
        height_cm=175.0, bust_cm=92.0, underbust_cm=80.0, chest_cm=90.0,
        waist_cm=76.0, hips_cm=98.0, thigh_cm=56.0, inseam_cm=78.0,
        shoulder_cm=42.0, arm_length_cm=60.0, neck_cm=36.0,
    )


def test_artifact_roundtrip():
    artifact = BodyMeshArtifact(
        user_id=uuid4(),
        clothed_glb_key="users/abc/clothed.glb",
        clothed_thumbnail_key="users/abc/thumbnail.jpg",
        body_glb_key="users/abc/body.glb",
        body_betas_key="users/abc/betas.npy",
        face_identity_preserved=True,
        arcface_similarity=0.68,
        skin_tone_rgb=[200, 160, 130],
        measurements=_good_measurements(),
        model_versions={"body": "hmr2@1.0", "face": "mica@0.9", "clothed": "sifu@0.3"},
        created_at=datetime.now(timezone.utc),
        runtime_ms=95000,
        hardware="mps",
    )
    data = artifact.model_dump()
    restored = BodyMeshArtifact.model_validate(data)
    assert restored.arcface_similarity == artifact.arcface_similarity


def test_artifact_invalid_rgb():
    with pytest.raises(ValueError, match="skin_tone_rgb"):
        BodyMeshArtifact(
            user_id=uuid4(),
            clothed_glb_key="k", clothed_thumbnail_key="k",
            body_glb_key="k", body_betas_key="k",
            skin_tone_rgb=[300, 0, 0],  # invalid: 300 > 255
            measurements=_good_measurements(),
            model_versions={},
            created_at=datetime.now(timezone.utc),
            runtime_ms=1000,
            hardware="mps",
        )


# ── JobStatus ────────────────────────────────────────────────────────────────

def test_job_status_progress_sync():
    now = datetime.now(timezone.utc)
    js = JobStatus(
        job_id="abc123", user_id=uuid4(),
        state="fitting", progress_pct=0,  # will be overwritten by validator
        created_at=now, updated_at=now,
    )
    assert js.progress_pct == STAGE_PROGRESS["fitting"]


def test_stage_progress_coverage():
    for state in ["queued", "preprocessing", "segmenting", "fitting",
                  "face_fitting", "clothed_reconstruction", "texturing",
                  "measuring", "packaging", "uploading", "complete", "failed"]:
        assert state in STAGE_PROGRESS


# ── VTONHandoff ──────────────────────────────────────────────────────────────

def test_vton_handoff_minimal():
    h = VTONHandoff(
        user_id=uuid4(),
        body_glb_key="users/abc/body.glb",
        body_betas=[0.0] * 10,
        measurements=_good_measurements(),
    )
    assert h.smplx_vertex_count == 10475
