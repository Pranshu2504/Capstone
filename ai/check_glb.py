import trimesh
mesh = trimesh.load('/Users/parth/Capstone/ai/my_avatar.glb', force='mesh')
verts = mesh.vertices
min_y = verts[:,1].min()
max_y = verts[:,1].max()
max_x = verts[:,0].max()
min_x = verts[:,0].min()
width = max_x - min_x
print(f"Mesh loaded: {len(verts)} vertices")
print(f"Height (Y bounds): {max_y - min_y:.3f} meters")
print(f"Width (X bounds): {width:.3f} meters")
