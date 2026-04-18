import torch
import numpy as np
from pathlib import Path

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
    
    # strictly zero body pose
    body_pose = torch.zeros(1, 63)
    
    output = smplx_model(body_pose=body_pose, return_verts=True)
    verts = output.vertices[0].detach().numpy()
    
    min_x = verts[:,0].min()
    max_x = verts[:,0].max()
    print(f"ZERO-pose width: {max_x - min_x:.3f} meters")
except Exception as e:
    print(f"Error: {e}")
