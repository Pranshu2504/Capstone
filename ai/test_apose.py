import torch
import numpy as np
from pathlib import Path
import os

try:
    import smplx
    model_dir = str(Path.home() / "smplx_models")
    smplx_model = smplx.create(
        model_dir,
        model_type="smplx",
        gender="neutral",
        num_betas=10,
        use_pca=False,
        flat_hand_mean=True,
    )
    
    # zero pose
    body_pose = torch.zeros(1, 63)
    # A-pose: 16 = left shoulder, 17 = right shoulder
    # The axis might be Z. Let's try 0.8 radians (~45 deg)
    body_pose[0, 16*3 + 2] = -np.pi/4
    body_pose[0, 17*3 + 2] = np.pi/4
    
    output = smplx_model(body_pose=body_pose, return_verts=True)
    verts = output.vertices[0].detach().numpy()
    
    import trimesh
    faces = smplx_model.faces
    mesh = trimesh.Trimesh(vertices=verts, faces=faces)
    mesh.export("apose.glb")
    print("A-pose exported to apose.glb")
except Exception as e:
    print(f"Error: {e}")
