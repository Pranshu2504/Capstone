# Fit Logic Rules Reference

## Ease Allowance Tables

Ease is the extra room added to body measurements before comparing to garment dimensions.
Body measurement + ease = minimum garment measurement needed for a comfortable fit.

### Upper Body Garments (chest/waist ease in cm)

| Category | Chest Ease | Waist Ease | Hip Ease | Notes |
|----------|-----------|-----------|---------|-------|
| T-shirt (regular fit) | 6 | 4 | 0 | |
| T-shirt (slim fit) | 3 | 2 | 0 | |
| Dress shirt | 8 | 6 | 0 | Includes button placket allowance |
| Casual shirt | 10 | 8 | 0 | |
| Blazer / Jacket | 12 | 10 | 6 | Over shirt ease |
| Suit jacket | 10 | 8 | 6 | Structured — less ease than casual |
| Sweater / Knitwear | 8 | 6 | 0 | Knit has stretch |
| Hoodie | 14 | 12 | 0 | Intentionally oversized category |
| Coat | 16 | 14 | 10 | Worn over layers |

### Lower Body Garments

| Category | Waist Ease | Hip Ease | Inseam Ease | Notes |
|----------|-----------|---------|------------|-------|
| Jeans (regular) | 2 | 4 | 2 | Denim has minimal stretch |
| Jeans (stretch) | 0 | 2 | 1 | Stretch denim contour fit |
| Chinos / Trousers | 3 | 5 | 2 | |
| Shorts | 3 | 4 | 0 | |
| Leggings | -2 | -2 | 0 | Negative ease — compressive |
| Skirt (A-line) | 2 | 4 | 0 | |
| Skirt (pencil) | 1 | 2 | 0 | |

### Full-Body Garments

| Category | Chest Ease | Waist Ease | Hip Ease | Notes |
|----------|-----------|-----------|---------|-------|
| Casual dress | 6 | 4 | 6 | |
| Formal dress | 4 | 3 | 4 | Structured |
| Maxi dress | 8 | 6 | 8 | |
| Jumpsuit | 8 | 6 | 6 | |
| Kurta / Kurti | 8 | 8 | 8 | South Asian silhouette |

---

## Size Chart Normalization Rules

Fashion brands publish size charts in two conventions:

### Convention A — Body Measurements (most common)
Chart lists the wearer's actual body measurements for each size.
**Action**: Add ease allowance before comparing to garment dimensions.

### Convention B — Garment Measurements (some EU brands)
Chart lists the finished garment dimensions.
**Action**: Compare directly to `body + ease` — garment value must be ≥ body + ease.

**How to detect convention**: If chest values are in the range 86–104 for S/M/L sizes, it's likely body measurements. If chest values are 94–116 for the same sizes, it's likely garment dimensions.

### Unit Conversion
- Inches to cm: multiply by 2.54
- EU numeric sizes to cm: EU size ≈ body height in cm / 6 (rough approximation only; use chart values)

---

## Confidence Scoring Formula

The confidence score (0–1) reflects how well the body + ease fits the recommended size:

```python
def compute_confidence(body_cm: dict, garment_dims: dict, ease: dict) -> float:
    """
    Per-dimension score, averaged across available dimensions.
    Perfect fit (body+ease within 0-3cm of garment) = 1.0
    Slightly off (3-6cm difference) = 0.7
    Tight (garment < body+ease) = 0.4 * (1 - shortfall/body_dim)
    Very loose (>8cm excess) = 0.5
    """
    dim_scores = []
    for dim, body_val in body_cm.items():
        if dim not in garment_dims:
            continue
        needed = body_val + ease.get(dim, 0)
        garment_val = garment_dims[dim]
        diff = garment_val - needed

        if 0 <= diff <= 3:
            score = 1.0
        elif 3 < diff <= 6:
            score = 0.8
        elif 6 < diff <= 10:
            score = 0.65
        elif diff > 10:
            score = 0.5   # very loose
        elif -2 <= diff < 0:
            score = 0.6   # barely tight
        elif -5 <= diff < -2:
            score = 0.35  # tight
        else:
            score = 0.1   # very tight / wrong size

        dim_scores.append(score)

    return sum(dim_scores) / len(dim_scores) if dim_scores else 0.0
```

---

## Verdict Decision Tree

```
confidence >= 0.85 AND no "tight" dimensions     → "perfect_fit"
confidence >= 0.70 AND 1-2 "slightly tight"      → "slightly_tight"
confidence >= 0.70 AND 1-2 "slightly loose"      → "slightly_loose"
majority of dimensions "tight"                    → "size_up"
majority of dimensions "loose"                    → "size_down"
size chart unavailable                            → "unavailable"
```

---

## Multi-Size Recommendation Logic

When a user sits between two sizes (e.g., chest fits M but waist fits L):

1. **Prioritise the most coverage-critical dimension** by category:
   - Tops/shirts: chest > shoulders > waist
   - Trousers/jeans: waist > hip > inseam
   - Dresses: chest > hip > waist

2. **Size up** if the critical dimension requires it (better to have a looser waist than a tight chest).

3. **Flag conflict** in `fit_breakdown` (e.g., `{"chest": "good", "waist": "tight"}`).

4. Include this conflict in the LLM reasoning prompt so the explanation is accurate.

---

## Brand Size Normalization

Different brands have inconsistent size labelling. When the garment brand is known, apply these offsets:

| Brand | Chest offset | Waist offset | Notes |
|-------|-------------|-------------|-------|
| Zara | -2 cm | -2 cm | Runs small (European silhouette) |
| H&M | 0 cm | 0 cm | Standard |
| ASOS | +1 cm | +1 cm | Runs slightly large |
| Myntra (private labels) | -1 cm | -1 cm | Varies; use chart when available |
| Uniqlo | +2 cm | +2 cm | Generous Japanese sizing |

Apply these offsets to garment chart values before comparison (or equivalently, subtract from body measurement).

---

## Indian Size Standards (common on Myntra)

Indian apparel uses S/M/L/XL labels but with different underlying measurements than Western brands.

| Indian Size | Chest (cm) | Waist (cm) | Hip (cm) |
|-------------|-----------|-----------|---------|
| XS | 80–84 | 64–68 | 88–92 |
| S | 84–88 | 68–72 | 92–96 |
| M | 88–92 | 72–76 | 96–100 |
| L | 92–96 | 76–80 | 100–104 |
| XL | 96–100 | 80–84 | 104–108 |
| XXL | 100–106 | 84–90 | 108–114 |

These are **body measurements** (Convention A). Add standard ease before comparing.
