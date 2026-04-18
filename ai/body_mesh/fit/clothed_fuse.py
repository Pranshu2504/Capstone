"""
Clothed surface — texture-based approach.

Since SIFU requires a complex per-user NeRF training, v1 uses a simpler
but effective strategy: project the video frame texture directly onto the
SMPL-X mesh UV. The clothing texture baked into the UV atlas makes the
avatar appear clothed without needing a separate geometry layer.

The clothed_fuse step here just returns the base SMPL-X mesh with a
ClothedMesh wrapper, letting texture/project.py do the actual work.
"""
from __future__ import annotations

import logging
import os
from pathlib import Path

import numpy as np

from shared.schemas import ClothedMesh, SMPLXFit

logger = logging.getLogger(__name__)


def build_clothed_mesh_from_smplx(
    smplx_fit: SMPLXFit,
    output_dir: str,
) -> ClothedMesh:
    """
    Write a minimal OBJ from SMPL-X T-pose vertices (if available).
    Texture will be applied separately by texture/project.py.

    Returns ClothedMesh pointing to the written OBJ.
    """
    os.makedirs(output_dir, exist_ok=True)
    obj_path = str(Path(output_dir) / "clothed.obj")

    if smplx_fit.vertices_tpose is None:
        # No real vertices — write a placeholder
        with open(obj_path, "w") as f:
            f.write("# placeholder — no SMPL-X vertices available\nv 0 0 0\n")
        logger.warning("No SMPL-X vertices available for clothed mesh — placeholder written.")
        return ClothedMesh(obj_path=obj_path, degraded=True)

    verts = np.array(smplx_fit.vertices_tpose, dtype=np.float32)
    _write_obj(verts, obj_path)
    logger.info("Clothed mesh OBJ written to %s (%d vertices)", obj_path, len(verts))
    return ClothedMesh(obj_path=obj_path, degraded=False)


def _write_obj(verts: np.ndarray, path: str) -> None:
    """Write a vertex-only OBJ (faces added later when SMPL-X topology is available)."""
    with open(path, "w") as f:
        f.write("# ZORA clothed mesh — SMPL-X topology\n")
        for v in verts:
            f.write(f"v {v[0]:.6f} {v[1]:.6f} {v[2]:.6f}\n")
