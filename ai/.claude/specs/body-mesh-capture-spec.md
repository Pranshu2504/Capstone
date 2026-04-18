# Body Mesh Capture Pipeline — Full Specification (v2)

> **Scope**: From a short **guided turntable video** captured in-app, produce an **identity-preserving, fully-textured 3D avatar of the user in their current clothing**. The avatar must be indistinguishable from the person in the video (face features, skin tone, clothing) and must **expose an inner SMPL-X body layer** so that a downstream VTON pipeline (separate spec) can later swap garments onto the same body.
>
> **Hardware target**: Apple Mac M2 (unified memory, Metal/MPS backend). No CUDA. Pipeline must be optimized for 8–24 GB unified memory.
>
> **All dependencies free and open-source. Self-hosted on the `ai/` service (port 8001).**

---

## 1. Problem Statement

The previous `body-mesh` skill produced a parametric SMPL-X mesh from two still photos. That is insufficient for ZORA's avatar experience because:

1. **No facial identity** — SMPL-X head is a generic neutral mean; real users must recognize themselves.
2. **No clothing capture** — two stills cannot reconstruct what the user is actually wearing; VTON requires a clothed baseline to visually overlay new garments.
3. **Under-constrained shape** — two views miss backside silhouette and clothed volume.
4. **No skin texture** — solid-color skin looks like a mannequin.
5. **Not M2-aware** — SMPLest-X + SMPLify-X joint optimization is too heavy for unified memory.

This spec defines a guided-video capture pipeline that produces, in a single job:

- A **clothed textured avatar** (`.glb`) — what the user looks like *right now*.
- A **naked SMPL-X body layer** (`betas`, T-pose mesh) — input for VTON.
- A **FLAME face layer** (shape + texture) — for identity preservation.
- **Body measurements** in cm.

---

## 2. User Stories

- **US-01 (first-time onboarding)** — *As a new user*, I open ZORA, tap "Create My Avatar", follow an on-screen tutorial, record a 10-second video of myself rotating in place, and within ~2 minutes I see a 3D avatar that looks like me (face, skin tone, outfit). *Acceptance*: user recognizes themself on a 10-person test panel ≥ 8/10.

- **US-02 (tutorial guidance)** — *As a user unfamiliar with 3D capture*, I see an animated tutorial overlay (silhouette guide + rotation arc + voice prompts: "Stand in A-pose", "Turn slowly in place", "Keep going", "Hold") so I can record correctly the first try. *Acceptance*: ≥ 85 % of captures pass the quality gate on the first attempt in UAT.

- **US-03 (quality feedback)** — *As a user*, if my video is too blurry, too dark, or I didn't complete a full rotation, the app tells me **why** and lets me re-record without losing state. *Acceptance*: every rejection returns an actionable message from a fixed enum (`BLUR`, `LOW_LIGHT`, `INCOMPLETE_ROTATION`, `BODY_CROPPED`, `FACE_NOT_DETECTED`).

- **US-04 (privacy)** — *As a user*, I can delete my avatar + all captured frames from settings. *Acceptance*: `DELETE /body-mesh/artifact/{user_id}` purges S3 objects and DB rows within 60 s.

- **US-05 (identity preservation)** — *As a user*, my avatar's face looks like me, not a generic template. *Acceptance*: ArcFace cosine similarity ≥ 0.55 between my portrait frame and a frontal render of the avatar.

- **US-06 (skin tone match)** — *As a user with any skin tone*, my avatar's visible skin regions (face, neck, hands, arms if bare) match my real skin within ΔE\*ab ≤ 8 averaged over sampled patches. *Acceptance*: automated skin-tone test across Monk Skin Tone scale fixtures passes for all 10 tones.

- **US-07 (outfit preserved)** — *As a user*, the avatar shows the exact outfit I recorded in — shirt, pants, dress, everything. *Acceptance*: user judges on a 1–5 Likert scale ≥ 4 on "does this match my outfit?".

- **US-08 (ready for VTON)** — *As the VTON pipeline (programmatic consumer)*, I receive an inner SMPL-X body layer with `betas` and canonical T-pose vertices so I can later drape any garment on the user's true body shape. *Acceptance*: VTON spec's contract test passes against this spec's output.

- **US-09 (offline-capable device processing)** — *As an M2 MacBook user running ZORA locally for development*, the full pipeline completes in ≤ 3 minutes on 16 GB unified memory and ≤ 5 minutes on 8 GB (with reduced-quality path). *Acceptance*: benchmark harness in `tests/bench/` meets targets.

- **US-10 (retry without re-record)** — *As a user*, if the server-side fit fails after my upload succeeded, the system retries with a lighter adapter automatically before asking me to re-record. *Acceptance*: fallback matrix (§9) engaged at least once on a synthetic-OOM test.

---

## 3. Functional Requirements

1. **FR-01** — Input: exactly one video file (5–15 s, ≥ 720p, ≤ 50 MB, H.264/H.265/HEVC) + exactly one companion face portrait frame (≥ 1080p, auto-captured from the video's sharpest front frame or taken separately).
2. **FR-02** — Extract **N keyframes** from the video (default 12) spaced evenly along the detected rotation angle, not just time.
3. **FR-03** — Per-frame pipeline: segment person → 2D keypoints (body + face) → per-frame mesh estimate.
4. **FR-04** — **Joint multi-view shape fusion**: a single shared SMPL-X `betas` vector across all frames with per-frame pose/camera.
5. **FR-05** — **FLAME face fit** on the sharpest frontal face crop; merge FLAME shape into SMPL-X head vertices using the published correspondence.
6. **FR-06** — **Clothed surface reconstruction**: from the SMPL-X base, generate a clothed outer surface that follows the garment silhouette in each view.
7. **FR-07** — **Texture projection**: project RGB from keyframes onto the clothed mesh's UV atlas; inpaint occluded seams.
8. **FR-08** — Extract measurements from the SMPL-X **body layer** (not the clothed layer — clothing bias-corrects).
9. **FR-09** — Output artifact bundle (see §7).
10. **FR-10** — Every step has a graceful fallback (see §9).
11. **FR-11** — Expose async API on port 8001 (§8).
12. **FR-12** — No paid APIs. All models swappable via env vars.
13. **FR-13** — Face and skin colour must **match the input video, not a template** (see US-06).
14. **FR-14** — Output must include a **naked SMPL-X layer** re-usable by the VTON spec.

---

## 4. Non-Functional Requirements

- **Latency (M2 16 GB)**: ≤ 180 s end-to-end for a 10 s / 720p / 30 fps video.
- **Latency (M2 8 GB, low-mem path)**: ≤ 300 s, N=8 keyframes, lighter adapters.
- **Memory ceiling**: peak RSS ≤ 6 GB on 8 GB systems (leaves 2 GB for OS), ≤ 12 GB on 16 GB systems.
- **Identity**: ArcFace(render, portrait) ≥ 0.55.
- **Skin colour**: mean ΔE\*ab ≤ 8 on sampled skin patches.
- **Measurement accuracy**: bust / waist / hips MAE < 2 cm on CAESAR sample (n=20).
- **Reproducibility**: fixed seeds; same video → identical output (±0.1 cm measurement jitter).
- **Privacy**: raw video + frames purged within 60 s of job success unless `DEBUG_KEEP_RAW=true`.

---

## 5. Mac M2 Optimization Strategy

> [!IMPORTANT]
> M2 has **unified memory** shared between CPU and GPU. That means "moving tensors to GPU" is essentially free — but we must size models so *total working set* fits in RAM with headroom. The ceiling is memory pressure, not VRAM.

### 5.1 Runtime choices
- **PyTorch ≥ 2.2** with **MPS backend** (`torch.device("mps")`).
- Set `PYTORCH_ENABLE_MPS_FALLBACK=1` — several ops (e.g. `aten::_weight_norm_interface`, certain `grid_sample` variants) still missing on MPS; this lets them fall back to CPU transparently. Better than crashing; worse than native, but acceptable.
- **fp16** inference wherever supported (MPS supports it; halves memory, ~1.4× speed).
- Prefer **Core ML–converted variants** (via `coremltools` or `executorch`) for segmentation and keypoint models — Apple's Neural Engine is ~3× faster than MPS for CNN inference.
- **ONNX Runtime with CoreMLExecutionProvider** is an acceptable alternative when Core ML conversion is fragile.
- Avoid models that require **`torch.compile` + CUDA kernels**; explicitly guard out.

### 5.2 Model choices tuned for M2
| Step | Primary (M2 ≥ 16 GB) | Low-mem fallback (M2 8 GB) | Why |
|---|---|---|---|
| Segmentation | **SAM2-Tiny** (~150 MB, fp16) | **MediaPipe Selfie Segmentation** (Core ML native) | SAM2-Tiny quality > rembg; MediaPipe runs on ANE |
| Body keypoints | **ViTPose-Base** (halpe 133 kpts) | **RTMPose-s** (ONNX) | ViTPose-Base ~90 MB on MPS; RTMPose-s is 10 MB Core ML |
| Face landmarks | **MediaPipe FaceMesh** (468 pts) | same | Apple ANE-native, sub-10 ms |
| Body mesh | **HMR2.0 / 4D-Humans** on MPS | **HMR2.0 small (`hmr2_vit_small`)** | SMPLest-X is too heavy for unified memory; HMR2.0 ViT-B is ~450 MB, MPS-stable |
| Face identity | **MICA** (MIT-licensed, FLAME from single image, ONNX-exportable) | same | Lightweight (120 MB), commercial-safe, fast |
| Clothed surface | **SIFU** (Apache 2.0, single-image clothed reconstruction) | **ECON-lite** | SIFU works from monocular + multi-view aggregation; SCARF (per-subject training) is ruled out on M2 due to per-user optimization time |
| Texture projection | **nvdiffrast-free fallback** via `pyrender` + manual UV rasterization | same | nvdiffrast's CUDA kernel isn't available on MPS — use CPU rasterization (acceptable, runs seconds) |
| Inpainting | **OpenCV `INPAINT_TELEA`** | same | No DL needed for seam fill |

### 5.3 Memory discipline
- Run steps sequentially, never hold two big models in memory at once. After each step, `del model; gc.collect(); torch.mps.empty_cache()`.
- Stream frames from disk (`torchvision.io.read_video`) rather than loading all decoded frames at once.
- Cache intermediate tensors (keypoints, masks) to `.npy` on disk between stages; worker restarts per stage.

### 5.4 Build-time
- Ship model weights as Core ML `.mlpackage` where licenses permit, otherwise PyTorch `.pt`.
- Use `requirements-m2.txt` with pinned versions known-good on Apple Silicon (`torch==2.5.1`, `torchvision==0.20.1`, `onnxruntime-silicon`, etc.). Separate from a future `requirements-cuda.txt` for server deployments.

---

## 6. Pipeline — Step by Step

```
[0] POST /body-mesh/capture  (video + optional portrait)
        │   validate MIME, duration, resolution → enqueue Redis job
        ▼
[1] VIDEO PRE-PROCESS
        ├─ ffmpeg decode to RGB frames (max 30 fps, downscale to 720p)
        ├─ estimate rotation angle per frame (IMU metadata if present,
        │   else pose-heading heuristic from hip-pelvis vector)
        └─ pick N=12 keyframes spaced evenly in angle-space (not time)
        ▼
[2] QUALITY GATE
        ├─ blur: Laplacian variance > 100 per keyframe (else drop)
        ├─ brightness: 60 ≤ mean ≤ 200 (else reject capture)
        ├─ face detected in ≥ 1 front frame (else reject)
        ├─ body fully visible (head + feet in frame) in ≥ 80 % of keyframes
        └─ rotation coverage: angular span > 300° (else reject: INCOMPLETE_ROTATION)
        ▼
[3] PERSON SEGMENTATION  per keyframe
        SAM2-Tiny (point prompt at frame center) → binary mask
        fallback: MediaPipe Selfie Segmentation
        ▼
[4] 2D KEYPOINTS  per keyframe
        body+feet+hands: ViTPose-Base  (fallback: RTMPose-s)
        face: MediaPipe FaceMesh       (always)
        ▼
[5] PER-FRAME BODY MESH
        HMR2.0 → per-frame (betas_i, pose_i, cam_i)
        ▼
[6] MULTI-VIEW SHAPE FUSION
        Optimize ONE shared β across frames:
          min_β,{θ_i,π_i} Σ_i ||proj(SMPLX(β,θ_i),π_i) - kpts_i||² + λ||β||²
        Scale mesh so (head_top_y - foot_y) == user-entered height_cm.
        ▼
[7] FACE IDENTITY FIT  (on sharpest front portrait frame)
        MICA → FLAME (shape β_face, neutral expression)
        Transplant FLAME head shape into SMPL-X head vertices
          via published SMPL-X↔FLAME correspondence table.
        ▼
[8] CLOTHED SURFACE RECONSTRUCTION
        SIFU per-keyframe → implicit clothed geometry
        Aggregate across views: per-vertex depth median voting
          constrained to stay within {SMPLX_surface ≤ clothed_surface ≤ +8 cm}
        → clothed.obj (SMPL-X topology with per-vertex offset vectors)
        ▼
[9] TEXTURE PROJECTION
        For each keyframe:
          raycast from camera → mesh surface
          for each UV texel, accumulate RGB weighted by
              w = cos(normal·view) * visibility * mask
        Average across keyframes; fill holes with OpenCV inpaint.
        ▼
[10] SKIN COLOUR CORRECTION
        Sample skin patches on face/neck mean RGB → anchor skin tone.
        For any SMPL-X body region occluded by clothing in ALL views,
          paint with anchored skin tone (not mean template).
        ▼
[11] MEASUREMENT EXTRACTION
        Use SMPL-X base layer (not clothed) → geodesic circumferences.
        ▼
[12] ARTIFACT PACKAGING
        clothed.glb  — clothed avatar, textured, SMPL-X topology + offsets
        body.glb     — naked SMPL-X T-pose, flat skin-tone texture
        face.glb     — FLAME face, textured (for re-use in other contexts)
        betas.npy, flame_params.npz, measurements.json,
        thumbnail.jpg (rendered frontal pose)
        ▼
[13] S3/MinIO UPLOAD + POSTGRES PERSIST → webhook / polling complete
```

---

## 7. Output Artifact (Pydantic v2, `ai/shared/schemas.py`)

```python
class Measurements(BaseModel):
    height_cm: float
    bust_cm: float
    underbust_cm: float
    chest_cm: float
    waist_cm: float
    hips_cm: float
    thigh_cm: float
    inseam_cm: float
    shoulder_cm: float
    arm_length_cm: float
    neck_cm: float

class BodyMeshArtifact(BaseModel):
    user_id: UUID
    # clothed avatar — what the user sees
    clothed_glb_key: str
    clothed_thumbnail_key: str
    # inner body layer — what VTON consumes
    body_glb_key: str
    body_betas_key: str          # SMPL-X β (10 or 300 dim)
    # face layer
    face_glb_key: str | None
    flame_params_key: str | None
    face_identity_preserved: bool
    arcface_similarity: float | None
    # measurements
    measurements: Measurements
    # provenance
    model_versions: dict[str, str]   # {"body":"hmr2@1.0","face":"mica@0.9","clothed":"sifu@0.3"}
    created_at: datetime
    runtime_ms: int
    hardware: Literal["mps", "cpu", "cuda"]
```

This `body_glb_key` + `body_betas_key` pair is **the contract** the separate VTON spec consumes.

---

## 8. API Surface (port 8001)

```
POST   /body-mesh/capture
   multipart/form-data:
     user_id: uuid
     gender_hint: "neutral" | "male" | "female"
     height_cm: int  (120..230)
     video: file (5..15 s, <=50 MB)
     face_portrait: file (optional, server will pick sharpest frame if absent)
   → 202 { job_id, status:"queued", estimated_seconds:int }

GET    /body-mesh/job/{job_id}
   → { status, progress_pct, step:"segmentation"|..., artifact?:BodyMeshArtifact, error? }

GET    /body-mesh/artifact/{user_id}
   → latest BodyMeshArtifact  (404 if none)

DELETE /body-mesh/artifact/{user_id}
   → 204 (purges S3 keys + DB row)

GET    /health
   → { status:"ok", hardware:"mps", models_loaded:{...} }
```

Redis queue: `body_mesh_jobs`. Worker count: 1 on M2 (memory-bound). Horizontal scale only on server deployments.

---

## 9. Fallback Matrix

| Failure | Fallback | User-visible? |
|---|---|---|
| MPS op unsupported | `PYTORCH_ENABLE_MPS_FALLBACK=1` → CPU op | No |
| Memory pressure > 85 % | Switch primary→low-mem path; reduce N keyframes 12→8 | No |
| SAM2-Tiny fails to load | MediaPipe Selfie Segmentation | No |
| ViTPose-Base runs OOM | RTMPose-s | No |
| HMR2.0 fails per-frame (< 4 valid frames) | Abort 422 `INCOMPLETE_ROTATION` | Yes |
| MICA fails | Skip FLAME merge; `face_identity_preserved=false`; avatar still produced with generic head | Soft warning |
| SIFU fails | Skip clothed layer; render SMPL-X body with projected-texture clothing approximation | Soft warning |
| Video decode error | 422 `UNSUPPORTED_VIDEO` + list of accepted codecs | Yes |
| Face not detected anywhere | 422 `FACE_NOT_DETECTED` — ask re-record with face visible | Yes |
| Rotation < 300° | 422 `INCOMPLETE_ROTATION` | Yes |
| All heavy adapters OOM | Emergency path: HMR2.0 + MediaPipe + no SIFU → still return a minimal clothed-ish avatar, flag `degraded=true` | Soft warning |

---

## 10. Adapter Interfaces (model-agnostic)

Per the `superpowers` skill, nothing imports a model repo directly in business logic. All model access goes through ABCs:

```python
# ai/body_mesh/adapters/base.py
class SegmentationAdapter(ABC):
    @abstractmethod
    def segment(self, img: np.ndarray) -> np.ndarray: ...

class KeypointAdapter(ABC):
    @abstractmethod
    def detect(self, img: np.ndarray) -> Keypoints2D: ...

class BodyMeshAdapter(ABC):
    @abstractmethod
    def fit(self, frames: list[np.ndarray], keypoints: list[Keypoints2D],
            gender: str) -> SMPLXFit: ...

class FaceIdentityAdapter(ABC):
    @abstractmethod
    def fit(self, face_img: np.ndarray) -> FLAMEFit: ...

class ClothedSurfaceAdapter(ABC):
    @abstractmethod
    def reconstruct(self, frames: list[np.ndarray], masks: list[np.ndarray],
                    base_mesh: SMPLXFit) -> ClothedMesh: ...
```

Selected at runtime by env vars:
```
BODY_MESH_MODEL=hmr2             # hmr2 | smplest-x (server only)
FACE_ID_MODEL=mica               # mica | deca (research only)
SEGMENTATION_MODEL=sam2-tiny     # sam2-tiny | mediapipe-selfie | rembg
KEYPOINT_MODEL=vitpose-base      # vitpose-base | rtmpose-s
CLOTHED_MODEL=sifu               # sifu | econ | none
BACKEND_DEVICE=mps               # mps | cpu | cuda
N_KEYFRAMES=12
LOW_MEM_MODE=false               # auto-set if psutil detects <12GB free
```

---

## 11. Folder Layout

```
ai/body_mesh/
├── __init__.py
├── router.py
├── service.py               # orchestrator
├── worker.py                # Redis consumer
├── adapters/
│   ├── base.py
│   ├── hmr2_adapter.py
│   ├── smplestx_adapter.py  # server-only
│   ├── mica_adapter.py
│   ├── sam2_tiny_adapter.py
│   ├── mediapipe_seg_adapter.py
│   ├── vitpose_adapter.py
│   ├── rtmpose_adapter.py
│   └── sifu_adapter.py
├── preprocess/
│   ├── video.py             # ffmpeg + angle estimation + keyframe picking
│   ├── quality.py           # blur, brightness, face-presence, rotation-span checks
│   └── face_align.py
├── fit/
│   ├── multi_view_smplx.py  # shared-β optimizer
│   ├── flame_merge.py
│   └── clothed_fuse.py
├── texture/
│   ├── project.py           # multi-view UV projection (CPU rasterizer)
│   ├── inpaint.py
│   └── skin_match.py        # Monk-scale skin-tone anchoring
├── measurements.py
├── requirements-m2.txt
└── tests/
    ├── fixtures/
    ├── test_adapters.py
    ├── test_preprocess.py
    ├── test_fit.py
    ├── test_texture.py
    ├── test_measurements.py
    ├── test_fallbacks.py
    ├── test_end_to_end.py
    └── bench/
        └── bench_m2.py
```

---

## 12. Test Cases

### 12.1 Unit tests (contracts, adapters, utilities)
- **T-U-01** `BodyMeshArtifact` Pydantic round-trip (serialize → deserialize → equal).
- **T-U-02** Each adapter ABC: mock weights, assert input/output shapes (`SAM2 → (H,W) binary`, `ViTPose → 133×3`, `HMR2 → β∈ℝ¹⁰, θ∈ℝ⁷²`).
- **T-U-03** Beta clamping: values forced to ±9 → clamped to [-5, 5].
- **T-U-04** Measurement function: SMPL-X T-pose neutral β=0 → waist ≈ 78 cm ± 1 cm (regression lock).
- **T-U-05** Skin tone anchoring: paint Monk-9 (dark) skin tone into hidden region → sampled region RGB within ΔE\*ab ≤ 5 of target.
- **T-U-06** Rotation angle estimator: synthetic turntable frames with known GT angle → MAE < 5°.

### 12.2 Integration tests (per step)
- **T-I-01** Preprocess: given fixture `tests/fixtures/good_video.mp4` → 12 keyframes returned, rotation span > 330°.
- **T-I-02** Quality gate rejects `tests/fixtures/blurry_video.mp4` with error `BLUR`.
- **T-I-03** Segmentation + keypoints: given fixture frame → mask IoU > 0.9 vs GT, kpt PCK@0.1 > 0.8 vs GT.
- **T-I-04** Multi-view fit: synthetic avatar (β known) re-rendered from 12 viewpoints → recovered β within ε=0.15 per dim.
- **T-I-05** MICA fit: a face photo → ArcFace similarity to original ≥ 0.55 on internal 5-user fixture.
- **T-I-06** Clothed surface: SIFU on fixture → no vertex offset > 15 cm (sanity clamp).
- **T-I-07** Texture projection: render output mesh from each keyframe camera → SSIM vs input > 0.75 in masked region.

### 12.3 End-to-end tests
- **T-E-01** `good_video.mp4` → full pipeline → artifact valid, all URLs fetchable, measurements in plausible ranges.
- **T-E-02** `dark_video.mp4` → 422 `LOW_LIGHT`.
- **T-E-03** `partial_rotation_video.mp4` → 422 `INCOMPLETE_ROTATION`.
- **T-E-04** Identity suite: 10 fixture users (diverse skin tones, genders, body types) → all ArcFace ≥ 0.55; all skin ΔE ≤ 8.
- **T-E-05** VTON contract: `body_glb` + `body_betas` loadable by the VTON spec's consumer mock (shape `(10475,3)` vertices, β dim 10).

### 12.4 Fallback tests
- **T-F-01** Monkeypatch HMR2.0 adapter to raise `RuntimeError("MPS OOM")` → service retries with `LOW_MEM_MODE=true`, still produces artifact.
- **T-F-02** Remove SAM2 weights file → pipeline logs warning, uses MediaPipe, produces artifact.
- **T-F-03** Force MICA failure → artifact returned with `face_identity_preserved=false`.
- **T-F-04** Force SIFU failure → artifact returned with `degraded=true`, only SMPL-X body textured with projected clothing.

### 12.5 Performance benchmarks (non-blocking CI, tracked over time)
- **T-P-01** `bench_m2.py` on 16 GB M2: record p50/p95 end-to-end latency over 20 runs of `good_video.mp4`. Target p95 ≤ 180 s.
- **T-P-02** Same on 8 GB M2 with `LOW_MEM_MODE=true`: p95 ≤ 300 s, peak RSS ≤ 6 GB.

### 12.6 Privacy tests
- **T-P-03** After job success with default config, raw video + frames are absent from `/tmp/zora/*` and S3 `raw/` prefix within 60 s.
- **T-P-04** `DELETE /body-mesh/artifact/{user_id}` removes all S3 objects with that user_id prefix + DB row; follow-up `GET` returns 404.

---

## 13. Relationship to Separate VTON Spec

> A separate spec (`vton-avatar-spec.md` — to be written) will consume this spec's `body_glb_key` + `body_betas_key` and produce a new clothed render with a chosen garment instead of the user's captured outfit. That spec owns garment scraping, garment mesh fitting, and re-rendering. **This spec owns only the avatar + body layer.**

The contract between the two specs:
- Input to VTON: `body_betas` (SMPL-X β), `body_glb` (T-pose neutral), `face_glb`, `Measurements`, `skin_tone` (averaged RGB sample).
- Output of VTON: new `clothed_glb` with the swapped garment(s).
- Both avatars (original captured + VTON re-dressed) share the same underlying SMPL-X body → consistent proportions.

---

## 14. Acceptance Criteria (go/no-go)

- [ ] `POST /body-mesh/capture` returns 202 in ≤ 200 ms for valid upload.
- [ ] E2E on fixture `good_video.mp4` (16 GB M2) completes in ≤ 180 s.
- [ ] `clothed.glb` opens in three.js / Blender with UVs, embedded texture, skinned armature.
- [ ] `body.glb` openable and SMPL-X-shape-compliant (10475 vertices).
- [ ] Identity suite (§12.3 T-E-04) passes for all 10 fixtures.
- [ ] Skin tone ΔE\*ab ≤ 8 across full Monk scale fixtures.
- [ ] Measurement MAE < 2 cm on CAESAR sample.
- [ ] All 4 fallback tests pass.
- [ ] Privacy tests pass.
- [ ] No paid API, license audit clean for research use (SIFU Apache 2.0, MICA MIT, HMR2 MIT, SMPL-X research-only — acceptable for capstone).
- [ ] `body_glb` + `body_betas` contract test (T-E-05) passes against VTON spec mock.

---

## 15. Open Questions

- **Clothing taxonomy**: does the clothed-surface output need to label regions (shirt, pants) for downstream VTON, or is raw geometry enough? *Tentatively: raw geometry only in v1; segmentation labels deferred.*
- **Hair**: SMPL-X has no hair. For v1, hair is baked into the clothed-surface texture (good enough for static avatar). Proper 3D hair (neural hair strands) deferred to v2.
- **Animation rig**: GLB exports include SMPL-X skeleton weights, but no blendshapes for facial animation. Deferred.
- **Per-subject fine-tuning** (SCARF / GaussianAvatar): too slow for M2; revisit if we deploy to a server GPU.
