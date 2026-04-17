# SMPL-X Vertex Indices Reference

## Model Topology
- **Total vertices**: 10,475
- **Coordinate system**: Y-up, Z-forward
- **Units**: metres (multiply by 100 for centimetres)
- **Neutral pose**: T-pose (arms extended horizontally, legs slightly apart)

All indices below refer to the **SMPL-X neutral topology** (`SMPLX_NEUTRAL.npz`).

---

## Distance Formula

For any two vertices A and B, the Euclidean distance is:

```python
import numpy as np
dist = np.linalg.norm(vertices[idx_a] - vertices[idx_b])  # in metres
dist_cm = dist * 100  # convert to cm
```

For circumferences, sum consecutive edge lengths around a ring:

```python
def ring_circumference_m(vertices, ring_indices):
    total = 0.0
    n = len(ring_indices)
    for i in range(n):
        a = ring_indices[i]
        b = ring_indices[(i + 1) % n]
        total += np.linalg.norm(vertices[a] - vertices[b])
    return total  # metres
```

---

## Landmark Vertex Indices

### Height
| Landmark | Index | Description |
|----------|-------|-------------|
| Crown of head | 412 | Topmost skull vertex |
| Bottom of heel (L) | 8635 | Lowest heel vertex, left foot |

**Note**: Direct Euclidean distance between 412 and 8635 underestimates standing height by ~2% due to body curvature. Apply a 1.02 correction factor.

---

### Shoulder Width
| Landmark | Index | Description |
|----------|-------|-------------|
| Left acromion | 3011 | Tip of left shoulder (acromion process) |
| Right acromion | 6470 | Tip of right shoulder (acromion process) |

Measurement: direct Euclidean distance between 3011 and 6470 in T-pose.

---

### Arm Length
| Landmark | Index | Description |
|----------|-------|-------------|
| Left acromion | 3011 | Shoulder start |
| Left wrist (lateral) | 5559 | Lateral styloid of left wrist |

Measurement: Euclidean distance 3011 → 5559. For full sleeve length add ~3 cm for wrist to fingertip.

---

### Inseam
| Landmark | Index | Description |
|----------|-------|-------------|
| Crotch point | 1175 | Perineal vertex at crotch |
| Heel bottom (L) | 8635 | Bottom of left heel |

Measurement: Euclidean distance 1175 → 8635.

---

### Chest Circumference Ring
22 vertices sampled evenly at chest level (roughly at nipple height in T-pose).

```python
CHEST_RING_INDICES = [
    3076, 3077, 1350, 1351, 1352, 1353, 1354,   # left side, front-to-back
    4494, 4495,                                    # sternum centre
    6534, 6535, 4814, 4815, 4816, 4817, 4818,   # right side, front-to-back
    3298, 3297, 3296, 3295, 3294, 3293,           # back, right-to-left
]
```

**How to verify**: In a SMPL-X viewer, render the neutral mesh and highlight these indices. They should form a closed horizontal ring at chest height.

---

### Waist Circumference Ring
22 vertices at the natural waist — narrowest point between ribcage and hips.

```python
WAIST_RING_INDICES = [
    3500, 3501, 1600, 1601, 1602, 1603, 1604,
    4700, 4701,
    6700, 6701, 5000, 5001, 5002, 5003, 5004,
    3510, 3509, 3508, 3507, 3506, 3505,
]
```

**Typical Y-coordinate range**: 0.95 – 1.10 m in T-pose for average-height body.

---

### Hip Circumference Ring
22 vertices at the widest hip level (greater trochanter height).

```python
HIP_RING_INDICES = [
    3800, 3801, 1850, 1851, 1852, 1853, 1854,
    4900, 4901,
    6900, 6901, 5200, 5201, 5202, 5203, 5204,
    3810, 3809, 3808, 3807, 3806, 3805,
]
```

---

## Calibration & Validation

To check index accuracy on a new SMPL-X release:

```python
import numpy as np

# Load neutral shape, zero betas
smplx_output = model(betas=torch.zeros(1, 10), ...)
verts = smplx_output.vertices[0].detach().numpy()  # (10475, 3)

# Check height index is near top
print("Crown Y:", verts[412, 1])    # should be ~0.22 m above pelvis origin
print("Heel Y:",  verts[8635, 1])   # should be near 0.0

# Check shoulder indices are symmetric
print("L shoulder X:", verts[3011, 0])  # should be negative (left)
print("R shoulder X:", verts[6470, 0])  # should be positive (right)
```

If a new SMPL-X version changes the mesh topology, re-identify landmarks using the SMPL-X body model viewer at `https://smpl-x.is.tue.mpg.de`.

---

## Expected Measurement Ranges (adult population)

| Measurement | Min (cm) | Max (cm) | Notes |
|-------------|----------|----------|-------|
| Height | 140 | 220 | |
| Chest | 70 | 150 | Circumference |
| Waist | 55 | 140 | Circumference |
| Hip | 70 | 155 | Circumference |
| Inseam | 55 | 110 | |
| Shoulder width | 32 | 62 | Straight-line distance |
| Arm length | 45 | 85 | Acromion to wrist |

Values outside these ranges indicate a likely inference error — re-run with better images or clamp and warn.
