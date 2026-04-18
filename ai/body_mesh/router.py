"""
Body mesh capture — FastAPI router.

Interactive docs: http://localhost:8001/docs
"""
from __future__ import annotations

import asyncio
import base64
import io
import os
import shutil
import tempfile
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Annotated

import cv2
import numpy as np
from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse, JSONResponse
from pydantic import BaseModel, Field

from body_mesh.preprocess.quality import (
    quality_gate, check_face_present,
    BLUR_MIN_LAPLACIAN, BRIGHTNESS_MIN, BRIGHTNESS_MAX,
    MIN_ROTATION_DEGREES,
)
from body_mesh.fit.multi_view_smplx import fuse_shape, compute_beta_diversity
from body_mesh.measurements import extract_measurements, measurements_from_numpy
from shared.schemas import (
    BodyMeshArtifact, CaptureRequest, FLAMEFit, JobStatus,
    Measurements, SMPLXFit, VTONHandoff, STAGE_PROGRESS,
)

router = APIRouter()

# in-memory job store (replace with Redis in production)
_jobs: dict[str, dict] = {}


# ── Health ────────────────────────────────────────────────────────────────────

@router.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "body-mesh",
        "hardware": os.getenv("BACKEND_DEVICE", "mps"),
        "models_loaded": {
            "segmentation": os.getenv("SEGMENTATION_MODEL", "sam2-tiny"),
            "keypoints": os.getenv("KEYPOINT_MODEL", "vitpose-base"),
            "body_mesh": os.getenv("BODY_MESH_MODEL", "hmr2"),
            "face_id": os.getenv("FACE_ID_MODEL", "mica"),
            "clothed": os.getenv("CLOTHED_MODEL", "sifu"),
        },
    }


# ── Schema examples (try-out without running ML) ─────────────────────────────

@router.get(
    "/schemas/example",
    summary="Return example JSON for all pipeline schemas",
    description="Useful for understanding the data shapes without running any ML model.",
)
async def schema_examples():
    uid = uuid.uuid4()
    now = datetime.now(timezone.utc)
    return {
        "CaptureRequest": {
            "user_id": str(uid),
            "gender_hint": "neutral",
            "height_cm": 175,
        },
        "SMPLXFit": {
            "betas": [0.1, -0.2, 0.05, 0.0, 0.3, -0.1, 0.0, 0.15, -0.05, 0.2],
            "global_orient": [0.0, 0.0, 0.0],
            "body_pose": [0.0] * 63,
            "cam_translation": [0.0, 0.0, 2.5],
            "vertices_tpose": None,
        },
        "FLAMEFit": {
            "shape": [0.0] * 100,
            "expression": [0.0] * 50,
            "arcface_similarity": 0.72,
            "skin_sample_rgb": [210, 170, 140],
        },
        "Measurements": {
            "height_cm": 175.0, "bust_cm": 92.0, "underbust_cm": 80.0,
            "chest_cm": 90.0, "waist_cm": 76.0, "hips_cm": 98.0,
            "thigh_cm": 56.0, "inseam_cm": 78.0, "shoulder_cm": 42.0,
            "arm_length_cm": 60.0, "neck_cm": 36.0,
        },
        "BodyMeshArtifact": {
            "user_id": str(uid),
            "clothed_glb_key": f"users/{uid}/clothed.glb",
            "clothed_thumbnail_key": f"users/{uid}/thumbnail.jpg",
            "body_glb_key": f"users/{uid}/body.glb",
            "body_betas_key": f"users/{uid}/betas.npy",
            "face_glb_key": None,
            "flame_params_key": None,
            "face_identity_preserved": True,
            "arcface_similarity": 0.68,
            "skin_tone_rgb": [210, 170, 140],
            "measurements": {
                "height_cm": 175.0, "bust_cm": 92.0, "underbust_cm": 80.0,
                "chest_cm": 90.0, "waist_cm": 76.0, "hips_cm": 98.0,
                "thigh_cm": 56.0, "inseam_cm": 78.0, "shoulder_cm": 42.0,
                "arm_length_cm": 60.0, "neck_cm": 36.0,
            },
            "model_versions": {"body": "hmr2@1.0", "face": "mica@0.9", "clothed": "sifu@0.3"},
            "created_at": now.isoformat(),
            "runtime_ms": 95000,
            "hardware": "mps",
            "degraded": False,
        },
        "JobStatus_stages": STAGE_PROGRESS,
    }


# ── Validate measurement JSON ─────────────────────────────────────────────────

@router.post(
    "/validate/measurements",
    summary="Validate a Measurements JSON payload",
    description=(
        "POST raw measurement values (cm). Returns validated schema or "
        "validation errors. Great for testing body measurement logic without "
        "running any ML."
    ),
    response_model=Measurements,
)
async def validate_measurements(measurements: Measurements):
    return measurements


# ── Validate SMPL-X betas ─────────────────────────────────────────────────────

class BetaPayload(BaseModel):
    betas: list[float] = Field(
        description="SMPL-X shape coefficients (10-dim). Values outside [-5, 5] are clamped.",
        examples=[[0.1, -0.2, 0.05, 0.0, 0.3, -0.1, 0.0, 0.15, -0.05, 0.2]],
    )
    height_cm: int = Field(default=175, ge=120, le=230)


class BetaFusionResult(BaseModel):
    fused_betas: list[float]
    beta_diversity: float
    clamped: bool
    frames_used: int


@router.post(
    "/validate/betas",
    summary="Fuse and validate SMPL-X betas from multiple frames",
    description=(
        "Simulates the multi-view beta fusion step. Pass a list of beta vectors "
        "(one per simulated frame) and get back the fused result."
    ),
    response_model=BetaFusionResult,
)
async def validate_betas(payload: list[BetaPayload]):
    if not payload:
        raise HTTPException(status_code=422, detail="Provide at least one frame's betas.")
    fits = [
        SMPLXFit(
            betas=p.betas,
            global_orient=[0.0, 0.0, 0.0],
            body_pose=[0.0] * 63,
            cam_translation=[0.0, 0.0, 2.5],
        )
        for p in payload
    ]
    raw_betas_before = fits[0].betas[:]
    fused = fuse_shape(fits, height_cm=float(payload[0].height_cm))
    was_clamped = any(abs(b) > 4.99 for b in raw_betas_before)
    diversity = compute_beta_diversity(fits)
    return BetaFusionResult(
        fused_betas=fused.betas,
        beta_diversity=round(diversity, 4),
        clamped=was_clamped,
        frames_used=len(fits),
    )


# ── Quality check on uploaded images ─────────────────────────────────────────

class FrameQualityResult(BaseModel):
    frame_index: int
    sharpness_score: float
    brightness: float
    is_blurry: bool
    is_dark_or_overexposed: bool
    body_fully_visible: bool
    passed: bool


class QualityCheckResult(BaseModel):
    overall_passed: bool
    error_code: str | None
    error_detail: str | None
    rotation_span_deg: float
    frames: list[FrameQualityResult]
    usable_frame_count: int
    face_detected: bool


@router.post(
    "/validate/quality",
    summary="Run quality gate on uploaded images (simulating keyframes)",
    description=(
        "Upload 1–12 JPEG/PNG images (simulating video keyframes). "
        "Returns per-frame quality scores and whether the set would pass "
        "the pipeline quality gate. Use this to test capture conditions "
        "before building the full video pipeline."
    ),
    response_model=QualityCheckResult,
)
async def validate_quality(
    files: list[UploadFile] = File(..., description="1–12 JPEG or PNG images"),
    simulate_rotation_deg: float = Form(
        default=360.0,
        description="Simulated total rotation span in degrees (default 360 = full turn)",
    ),
):
    if not files:
        raise HTTPException(status_code=422, detail="Upload at least one image.")
    if len(files) > 12:
        raise HTTPException(status_code=422, detail="Maximum 12 frames at once.")

    frames: list[np.ndarray] = []
    for f in files:
        data = await f.read()
        arr = np.frombuffer(data, dtype=np.uint8)
        img = cv2.imdecode(arr, cv2.IMREAD_COLOR)
        if img is None:
            raise HTTPException(status_code=422, detail=f"Cannot decode image: {f.filename}")
        rgb = cv2.cvtColor(img, cv2.COLOR_BGR2RGB)
        frames.append(rgb)

    n = len(frames)
    angles = list(np.linspace(0.0, simulate_rotation_deg, n)) if n > 1 else [0.0]

    report = quality_gate(frames, angles=angles, raise_on_fail=False)
    face_found = check_face_present(frames)

    frame_results = [
        FrameQualityResult(
            frame_index=fq.index,
            sharpness_score=round(fq.sharpness, 2),
            brightness=round(fq.brightness, 2),
            is_blurry=fq.is_blurry,
            is_dark_or_overexposed=fq.is_dark_or_overexposed,
            body_fully_visible=fq.body_fully_visible,
            passed=not fq.is_blurry and not fq.is_dark_or_overexposed,
        )
        for fq in report.frame_reports
    ]

    return QualityCheckResult(
        overall_passed=report.passed,
        error_code=report.error_code,
        error_detail=report.error_detail,
        rotation_span_deg=round(report.rotation_span_deg, 1),
        frames=frame_results,
        usable_frame_count=len(report.usable_frame_indices),
        face_detected=face_found,
    )


# ── Mock full pipeline (no ML weights needed) ─────────────────────────────────

class MockPipelineRequest(BaseModel):
    user_id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    gender_hint: str = "neutral"
    height_cm: int = Field(default=175, ge=120, le=230)
    num_simulated_frames: int = Field(default=12, ge=4, le=12)


@router.post(
    "/mock-pipeline",
    summary="Run the full pipeline end-to-end using mock adapters (no ML weights needed)",
    description=(
        "Simulates all 13 pipeline stages using mock adapters. "
        "Returns a realistic BodyMeshArtifact so you can validate the "
        "output schema and VTON handoff contract without installing any ML models."
    ),
)
async def mock_pipeline(req: MockPipelineRequest):
    import time
    start = time.monotonic()

    from body_mesh.adapters.mock_adapters import (
        MockBodyMeshAdapter, MockClothedSurfaceAdapter,
        MockFaceIdentityAdapter, MockKeypointAdapter, MockSegmentationAdapter,
    )
    from body_mesh.fit.flame_merge import merge_flame_into_smplx
    from body_mesh.fit.multi_view_smplx import fuse_shape
    import tempfile

    n = req.num_simulated_frames
    uid = uuid.UUID(req.user_id) if req.user_id else uuid.uuid4()
    dummy_frame = np.random.randint(80, 180, (720, 1280, 3), dtype=np.uint8)
    frames = [dummy_frame] * n

    stages = []

    # Stage 2–3: Segmentation + Keypoints
    stages.append("segmenting")
    with MockSegmentationAdapter() as seg, MockKeypointAdapter() as kpt:
        masks = [seg.segment(f) for f in frames]
        kpts = [kpt.detect(f) for f in frames]

    # Stage 4–5: Body mesh + fusion
    stages.append("fitting")
    with MockBodyMeshAdapter() as body:
        per_frame_fits = body.fit(frames, kpts, gender=req.gender_hint)
    fused = fuse_shape(per_frame_fits, height_cm=float(req.height_cm))

    # Stage 6: Face identity
    stages.append("face_fitting")
    face_crop = np.random.randint(80, 200, (224, 224, 3), dtype=np.uint8)
    with MockFaceIdentityAdapter() as face_adapter:
        flame_fit = face_adapter.fit(face_crop)
    fused = merge_flame_into_smplx(fused, flame_fit)

    # Stage 7: Clothed surface
    stages.append("clothed_reconstruction")
    with MockClothedSurfaceAdapter() as clothed_adapter, tempfile.TemporaryDirectory() as d:
        clothed_mesh = clothed_adapter.reconstruct(frames, masks, fused, d)

    # Stage 8: Measurements (from base body layer)
    stages.append("measuring")
    if fused.vertices_tpose:
        try:
            measurements = extract_measurements(fused.vertices_tpose)
        except Exception:
            measurements = Measurements(
                height_cm=float(req.height_cm), bust_cm=92.0, underbust_cm=80.0,
                chest_cm=90.0, waist_cm=76.0, hips_cm=98.0, thigh_cm=56.0,
                inseam_cm=78.0, shoulder_cm=42.0, arm_length_cm=60.0, neck_cm=36.0,
            )
    else:
        measurements = Measurements(
            height_cm=float(req.height_cm), bust_cm=92.0, underbust_cm=80.0,
            chest_cm=90.0, waist_cm=76.0, hips_cm=98.0, thigh_cm=56.0,
            inseam_cm=78.0, shoulder_cm=42.0, arm_length_cm=60.0, neck_cm=36.0,
        )

    runtime_ms = int((time.monotonic() - start) * 1000)

    artifact = BodyMeshArtifact(
        user_id=uid,
        clothed_glb_key=f"users/{uid}/clothed.glb",
        clothed_thumbnail_key=f"users/{uid}/thumbnail.jpg",
        body_glb_key=f"users/{uid}/body.glb",
        body_betas_key=f"users/{uid}/betas.npy",
        face_glb_key=f"users/{uid}/face.glb",
        flame_params_key=f"users/{uid}/flame.npz",
        face_identity_preserved=flame_fit.arcface_similarity is not None
            and flame_fit.arcface_similarity >= 0.55,
        arcface_similarity=flame_fit.arcface_similarity,
        skin_tone_rgb=flame_fit.skin_sample_rgb,
        measurements=measurements,
        model_versions={
            "body": "mock-hmr2@1.0",
            "face": "mock-mica@0.9",
            "clothed": "mock-sifu@0.3",
        },
        created_at=datetime.now(timezone.utc),
        runtime_ms=runtime_ms,
        hardware="cpu",
        degraded=clothed_mesh.degraded,
    )

    vton_handoff = VTONHandoff(
        user_id=uid,
        body_glb_key=artifact.body_glb_key,
        body_betas=fused.betas,
        face_glb_key=artifact.face_glb_key,
        skin_tone_rgb=artifact.skin_tone_rgb,
        measurements=measurements,
    )

    return {
        "stages_completed": stages,
        "artifact": artifact.model_dump(mode="json"),
        "vton_handoff": vton_handoff.model_dump(mode="json"),
        "runtime_ms": runtime_ms,
    }

# ── Real capture endpoint ─────────────────────────────────────────────────────

@router.post(
    "/capture",
    summary="Upload a turntable video → get textured 3D avatar + measurements",
    description=(
        "Upload your 5–15 s guided turntable video. "
        "The pipeline segments you, fits your body shape (SMPL-X), "
        "projects your clothing+skin texture from the video frames, "
        "exports a textured GLB, and returns body measurements. "
        "Runs entirely on M2 (MPS) — no GPU server needed.\n\n"
        "**Returns immediately with a job_id. Poll `/body-mesh/job/{job_id}` for status.**"
    ),
    status_code=202,
)
async def capture(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(..., description="5–15 s H.264 / HEVC turntable video, ≤50 MB"),
    user_id: str = Form(default="", description="Leave empty to auto-generate a UUID"),
    height_cm: int = Form(default=175, ge=120, le=230, description="Your height in cm"),
    gender_hint: str = Form(default="neutral", description="neutral | male | female"),
):
    # Validate file type
    if video.content_type and not video.content_type.startswith("video/"):
        if video.content_type == "application/octet-stream":
            if video.filename and not video.filename.lower().endswith((".mp4", ".mov", ".avi", ".mkv", ".webm")):
                raise HTTPException(
                    status_code=422,
                    detail={"code": "UNSUPPORTED_VIDEO", "detail": f"Expected video/*, got {video.content_type} for {video.filename}"}
                )
        else:
            raise HTTPException(
                status_code=422,
                detail={"code": "UNSUPPORTED_VIDEO", "detail": f"Expected video/*, got {video.content_type}"}
            )

    # Save upload to temp file
    suffix = Path(video.filename or "upload.mp4").suffix or ".mp4"
    tmp = tempfile.mktemp(suffix=suffix, prefix="zora_upload_")
    with open(tmp, "wb") as f:
        content = await video.read()
        if len(content) > 50 * 1024 * 1024:
            os.unlink(tmp)
            raise HTTPException(status_code=422, detail={"code": "FILE_TOO_LARGE", "detail": "Max 50 MB"})
        f.write(content)

    job_id = str(uuid.uuid4())
    # Auto-generate UUID if user_id is empty or not provided
    user_id = user_id.strip()
    if not user_id:
        uid = uuid.uuid4()
    else:
        try:
            uid = uuid.UUID(user_id)
        except ValueError:
            os.unlink(tmp)
            raise HTTPException(status_code=422, detail="user_id must be a valid UUID or left empty")

    _jobs[job_id] = {
        "job_id": job_id,
        "user_id": str(uid),
        "state": "queued",
        "progress_pct": 0,
        "step_detail": "queued",
        "artifact": None,
        "error_code": None,
        "error_detail": None,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "video_path": tmp,
        "output_dir": tempfile.mkdtemp(prefix=f"zora_job_{job_id[:8]}_"),
    }

    background_tasks.add_task(_run_pipeline, job_id, uid, height_cm, gender_hint)

    return {
        "job_id": job_id,
        "status": "queued",
        "poll_url": f"/body-mesh/job/{job_id}",
        "estimated_seconds": 120,
    }


@router.get(
    "/job/{job_id}",
    summary="Poll capture job status",
)
async def get_job(job_id: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail=f"Job {job_id!r} not found")
    return job


@router.get(
    "/job/{job_id}/download/{filename}",
    summary="Download a job output file (clothed.glb, body.glb, thumbnail.jpg, texture.png)",
)
async def download_artifact(job_id: str, filename: str):
    job = _jobs.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job["state"] != "complete":
        raise HTTPException(status_code=409, detail=f"Job not complete yet (state={job['state']})")

    output_dir = job.get("output_dir", "")
    file_path = Path(output_dir) / filename
    if not file_path.exists():
        raise HTTPException(status_code=404, detail=f"{filename} not found in job output")

    media_map = {
        ".glb": "model/gltf-binary",
        ".jpg": "image/jpeg",
        ".png": "image/png",
        ".npy": "application/octet-stream",
        ".npz": "application/octet-stream",
    }
    media_type = media_map.get(file_path.suffix, "application/octet-stream")
    return FileResponse(str(file_path), media_type=media_type, filename=filename)


# ── Background pipeline runner ────────────────────────────────────────────────

async def _run_pipeline(job_id: str, uid: uuid.UUID, height_cm: int, gender: str):
    job = _jobs[job_id]

    def update(state: str, pct: int, detail: str = ""):
        job["state"] = state
        job["progress_pct"] = pct
        job["step_detail"] = detail or state
        job["updated_at"] = datetime.now(timezone.utc).isoformat()

    try:
        update("preprocessing", 5)
        from body_mesh.service import run_capture

        artifact = await run_capture(
            video_path=job["video_path"],
            user_id=uid,
            height_cm=height_cm,
            gender=gender,
            job_id=job["job_id"],
            job_dir=job["output_dir"],
            on_progress=lambda stage, pct: update(stage, pct),
        )

        job["artifact"] = artifact.model_dump(mode="json")
        job["state"] = "complete"
        job["progress_pct"] = 100
        job["updated_at"] = datetime.now(timezone.utc).isoformat()

        # Clean up uploaded video
        try:
            os.unlink(job["video_path"])
        except Exception:
            pass

    except Exception as e:
        import traceback
        job["state"] = "failed"
        job["error_detail"] = str(e)
        job["step_detail"] = traceback.format_exc()[-500:]
        job["updated_at"] = datetime.now(timezone.utc).isoformat()
        try:
            os.unlink(job.get("video_path", ""))
        except Exception:
            pass
