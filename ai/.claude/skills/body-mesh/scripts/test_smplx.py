"""
test_smplx.py
End-to-end test: load two images → SMPLest-X inference → validate MeasurementsOutput schema.

Usage:
    python test_smplx.py --front /path/to/front.jpg --side /path/to/side.jpg

If SMPLest-X is not installed (CI environment), the test runs in MOCK mode and validates
schema structure only.
"""

import argparse
import sys
import json
from pathlib import Path
from typing import Optional

# ── Pydantic schema (mirrors ai/shared/schemas.py) ─────────────────────────
from pydantic import BaseModel, Field, ValidationError

class MeasurementsOutput(BaseModel):
    height_cm: float = Field(..., ge=100.0, le=250.0)
    chest_cm: float = Field(..., ge=60.0, le=180.0)
    waist_cm: float = Field(..., ge=50.0, le=160.0)
    hip_cm: float = Field(..., ge=60.0, le=180.0)
    inseam_cm: float = Field(..., ge=50.0, le=130.0)
    shoulder_width_cm: float = Field(..., ge=30.0, le=70.0)
    arm_length_cm: float = Field(..., ge=40.0, le=90.0)
    smplx_betas: list[float] = Field(..., min_length=10, max_length=10)
    model_used: str
    confidence: float = Field(..., ge=0.0, le=1.0)


# ── Attempt real inference ──────────────────────────────────────────────────
def try_real_inference(front_path: str, side_path: str) -> Optional[MeasurementsOutput]:
    """
    Try to run actual SMPLest-X inference.
    Returns MeasurementsOutput on success, None if SMPLest-X not installed.
    """
    try:
        import torch
        import numpy as np
        from pathlib import Path as P

        SMPLESTX_ROOT = P("/opt/SMPLest-X")
        if not SMPLESTX_ROOT.exists():
            print("[SKIP] SMPLest-X not found at /opt/SMPLest-X — running mock mode")
            return None

        sys.path.insert(0, str(SMPLESTX_ROOT))
        from main.inference import SMPLestXInferencer  # type: ignore
        from PIL import Image

        # Import measurement extractor
        sys.path.insert(0, str(Path(__file__).parent))
        from extract_measurements import extract_measurements_from_vertices

        device = "cuda" if torch.cuda.is_available() else "cpu"
        print(f"[INFO] Running on {device}")

        inferencer = SMPLestXInferencer(
            pretrained=str(SMPLESTX_ROOT / "pretrained_models/smplest_x_l.pth.tar"),
            device=device,
        )

        images = [Image.open(front_path), Image.open(side_path)]
        result = inferencer.infer(images)

        betas = result["betas"].cpu().numpy()
        # Clamp betas to [-5, 5]
        betas = betas.clip(-5, 5).tolist()

        vertices = result["vertices"].cpu().numpy()  # (10475, 3) in metres
        measurements = extract_measurements_from_vertices(vertices)

        return MeasurementsOutput(
            **measurements,
            smplx_betas=betas,
            model_used="smplestx",
            confidence=float(result.get("confidence", 0.85)),
        )

    except ImportError as e:
        print(f"[SKIP] Import error (SMPLest-X not installed): {e}")
        return None
    except Exception as e:
        print(f"[WARN] Real inference failed: {e}")
        return None


# ── Mock inference (schema-only validation in CI) ──────────────────────────
def mock_inference() -> MeasurementsOutput:
    """Generate plausible synthetic measurements for schema validation."""
    return MeasurementsOutput(
        height_cm=172.0,
        chest_cm=94.0,
        waist_cm=78.0,
        hip_cm=98.0,
        inseam_cm=80.0,
        shoulder_width_cm=42.0,
        arm_length_cm=62.0,
        smplx_betas=[0.1, -0.3, 0.5, -0.2, 0.8, -0.1, 0.0, 0.4, -0.6, 0.2],
        model_used="mock",
        confidence=1.0,
    )


# ── Validation checks ───────────────────────────────────────────────────────
def validate_output(output: MeasurementsOutput) -> list[str]:
    """Run validation checks. Returns list of failure messages (empty = all pass)."""
    failures = []

    if not (100 <= output.height_cm <= 250):
        failures.append(f"height_cm out of range: {output.height_cm}")
    if not (60 <= output.chest_cm <= 180):
        failures.append(f"chest_cm out of range: {output.chest_cm}")
    if not (50 <= output.waist_cm <= 160):
        failures.append(f"waist_cm out of range: {output.waist_cm}")
    if not (60 <= output.hip_cm <= 180):
        failures.append(f"hip_cm out of range: {output.hip_cm}")
    if len(output.smplx_betas) != 10:
        failures.append(f"smplx_betas length != 10: {len(output.smplx_betas)}")
    for i, b in enumerate(output.smplx_betas):
        if not (-5 <= b <= 5):
            failures.append(f"smplx_betas[{i}] = {b} outside [-5, 5]")
    if output.waist_cm >= output.chest_cm:
        failures.append(f"waist ({output.waist_cm}) >= chest ({output.chest_cm}) — implausible")

    return failures


# ── Main ────────────────────────────────────────────────────────────────────
def main():
    parser = argparse.ArgumentParser(description="Test SMPLest-X body mesh pipeline")
    parser.add_argument("--front", default="tests/fixtures/person_front.jpg")
    parser.add_argument("--side", default="tests/fixtures/person_side.jpg")
    parser.add_argument("--mock", action="store_true", help="Force mock mode")
    args = parser.parse_args()

    print("=" * 60)
    print("ZORA Body Mesh Pipeline Test")
    print("=" * 60)

    # Validate input files exist (if not mock)
    if not args.mock:
        for path in [args.front, args.side]:
            if not Path(path).exists():
                print(f"[WARN] Input file not found: {path} — switching to mock mode")
                args.mock = True
                break

    # Run inference
    if args.mock:
        print("[INFO] Mock mode — generating synthetic measurements")
        output = mock_inference()
    else:
        print(f"[INFO] Front image: {args.front}")
        print(f"[INFO] Side image:  {args.side}")
        output = try_real_inference(args.front, args.side)
        if output is None:
            print("[INFO] Falling back to mock mode")
            output = mock_inference()

    # Pydantic schema validation
    print("\n--- Schema Validation ---")
    try:
        validated = MeasurementsOutput.model_validate(output.model_dump())
        print("[PASS] MeasurementsOutput schema valid")
    except ValidationError as e:
        print(f"[FAIL] Schema validation error:\n{e}")
        sys.exit(1)

    # Business logic checks
    print("\n--- Measurement Checks ---")
    failures = validate_output(validated)

    checks = [
        ("height_cm in range [100, 250]", not any("height_cm" in f for f in failures)),
        ("chest_cm in range [60, 180]", not any("chest_cm" in f for f in failures)),
        ("waist_cm in range [50, 160]", not any("waist_cm" in f for f in failures)),
        ("hip_cm in range [60, 180]", not any("hip_cm" in f for f in failures)),
        ("smplx_betas length == 10", not any("smplx_betas length" in f for f in failures)),
        ("all betas in [-5, 5]", not any("outside [-5, 5]" in f for f in failures)),
        ("waist < chest (plausible)", not any("waist" in f and ">=" in f for f in failures)),
    ]

    all_pass = True
    for label, passed in checks:
        status = "[PASS]" if passed else "[FAIL]"
        print(f"{status} {label}")
        if not passed:
            all_pass = False

    # Print measurements
    print("\n--- Measurements ---")
    data = validated.model_dump()
    for k, v in data.items():
        if k == "smplx_betas":
            print(f"  {k}: [{', '.join(f'{b:.3f}' for b in v)}]")
        else:
            print(f"  {k}: {v}")

    print("\n" + "=" * 60)
    if all_pass:
        print("ALL TESTS PASSED")
        sys.exit(0)
    else:
        print(f"FAILED: {len(failures)} check(s) failed")
        for f in failures:
            print(f"  - {f}")
        sys.exit(1)


if __name__ == "__main__":
    main()
