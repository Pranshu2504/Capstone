# User API Specification

## Base URL
`http://localhost:8000/users`

---

## Endpoints

### POST /users/register
Create a new user account.

**Request**
```json
{
  "email": "aria@example.com",
  "password": "securepassword123",
  "display_name": "Aria Chen"
}
```

**Validation**
- `email`: valid email format, unique in DB
- `password`: 8–128 characters
- `display_name`: 1–100 characters, no HTML

**Response 201**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer"
}
```

**Response 409** — email already registered
```json
{"detail": "Email already registered"}
```

---

### POST /users/login
Authenticate and get a JWT token.

**Request**
```json
{
  "email": "aria@example.com",
  "password": "securepassword123"
}
```

**Response 200**
```json
{
  "access_token": "eyJhbGci...",
  "token_type": "bearer"
}
```

**Response 401**
```json
{"detail": "Incorrect email or password"}
```

---

### GET /users/me
Get current user's profile.

**Headers**: `Authorization: Bearer <token>`

**Response 200**
```json
{
  "id": "uuid",
  "email": "aria@example.com",
  "display_name": "Aria Chen",
  "created_at": "2025-01-15T10:30:00Z"
}
```

---

### PATCH /users/me
Update display name.

**Headers**: `Authorization: Bearer <token>`

**Request**
```json
{
  "display_name": "Aria"
}
```

**Response 200** — updated UserResponse

---

### GET /users/me/measurements
Get stored body measurements.

**Headers**: `Authorization: Bearer <token>`

**Response 200**
```json
{
  "id": "uuid",
  "height_cm": 165.0,
  "chest_cm": 88.0,
  "waist_cm": 72.0,
  "hip_cm": 94.0,
  "inseam_cm": 78.0,
  "shoulder_width_cm": 38.0,
  "arm_length_cm": 58.0,
  "smplx_betas": [0.1, -0.2, 0.5, -0.1, 0.3, 0.0, 0.2, -0.4, 0.1, 0.6],
  "updated_at": "2025-01-15T10:30:00Z"
}
```

**Response 404** — no measurements stored yet
```json
{"detail": "No body measurements found. Please complete body scan first."}
```

---

### PUT /users/me/measurements
Create or replace body measurements (from body scan result).

**Headers**: `Authorization: Bearer <token>`

**Request**
```json
{
  "height_cm": 165.0,
  "chest_cm": 88.0,
  "waist_cm": 72.0,
  "hip_cm": 94.0,
  "inseam_cm": 78.0,
  "shoulder_width_cm": 38.0,
  "arm_length_cm": 58.0,
  "smplx_betas": [0.1, -0.2, 0.5, -0.1, 0.3, 0.0, 0.2, -0.4, 0.1, 0.6]
}
```

**Validation**
- `height_cm`: 100–250
- `chest_cm`: 60–180
- `waist_cm`: 50–160
- `hip_cm`: 60–180
- `smplx_betas`: exactly 10 floats, each in [-5, 5]

**Response 200** — stored MeasurementsResponse

---

### POST /users/me/body-scan
Trigger body mesh generation from uploaded photos. Proxies to ai/ service.

**Headers**: `Authorization: Bearer <token>`
**Content-Type**: `multipart/form-data`

**Fields**
- `front_photo`: File (JPEG/PNG, ≤ 10 MB)
- `side_photo`: File (JPEG/PNG, ≤ 10 MB)

**Response 202**
```json
{
  "job_id": "uuid",
  "status": "queued",
  "estimated_seconds": 20
}
```

**Response 422**
```json
{"detail": "front_photo: File too large — max 10 MB"}
```

---

## DB Table: `users`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| email | VARCHAR(320) UNIQUE | Indexed |
| hashed_password | VARCHAR(60) | bcrypt |
| display_name | VARCHAR(100) | |
| created_at | TIMESTAMPTZ | server default |
| updated_at | TIMESTAMPTZ | on update |

## DB Table: `body_measurements`
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| user_id | UUID FK → users(id) | UNIQUE, CASCADE DELETE |
| height_cm | FLOAT | |
| chest_cm | FLOAT | |
| waist_cm | FLOAT | |
| hip_cm | FLOAT | |
| inseam_cm | FLOAT | nullable |
| shoulder_width_cm | FLOAT | nullable |
| arm_length_cm | FLOAT | nullable |
| smplx_betas | FLOAT[] | nullable |
| updated_at | TIMESTAMPTZ | |
