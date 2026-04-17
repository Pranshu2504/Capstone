# Backend Security Scan

Run these checks before every release. Fix all CRITICAL and HIGH findings before merging.

---

## 1. Hardcoded Secrets Check

```bash
# Search for any hardcoded tokens/keys/passwords
grep -rn --include="*.py" \
    -e "password\s*=\s*['\"]" \
    -e "secret\s*=\s*['\"]" \
    -e "api_key\s*=\s*['\"]" \
    -e "Authorization.*Bearer [A-Za-z0-9]" \
    backend/app/

# Should return zero matches
```

Also run `gitleaks detect --source .` if gitleaks is installed.

---

## 2. Unvalidated File Uploads

Check that every `UploadFile` endpoint calls `validate_image_upload()`:

```bash
grep -n "UploadFile" backend/app/api/*.py
# For each occurrence, verify validate_image_upload is called before processing
```

Must verify:
- [ ] File size checked before reading full bytes
- [ ] MIME type validated with `python-magic` (not just extension)
- [ ] No user-controlled filename used in file paths

---

## 3. Missing Auth on Routes

```bash
# Find all @router.get/post/put/delete decorators
grep -n "@router\." backend/app/api/*.py | grep -v health | grep -v login | grep -v register
# For each, verify Depends(get_current_user) is in the signature
```

Expected public routes (no auth): `/health`, `/users/register`, `/users/login`
All other routes must have `current_user = Depends(get_current_user)`.

---

## 4. SQL Injection Scan

```bash
# Check for any raw text() SQL with user input interpolation
grep -rn "text(" backend/app/ | grep -v "SELECT 1"
```

No user-supplied values should be interpolated into `text()` SQL fragments.
All parameterized queries must use SQLAlchemy's bound parameter syntax (`:param`).

---

## 5. Dependency Vulnerability Scan

```bash
cd backend
pip install pip-audit
pip-audit -r requirements.txt
```

All CRITICAL and HIGH CVEs must be resolved before release.

---

## 6. Environment Variable Audit

```bash
# Find any os.getenv with a hardcoded default that looks like a real secret
grep -rn "os.getenv" backend/app/ | grep -v "localhost" | grep -v "redis://" | grep -v "8001"
```

Secrets (`JWT_SECRET_KEY`, `AWS_*`) must use `os.environ["KEY"]` (raises if missing) not `os.getenv("KEY", "default")`.

---

## 7. PII Logging Check

```bash
grep -rn "print\|logger\." backend/app/ | grep -i "password\|token\|secret\|email"
```

No logging of: passwords (even hashed), raw JWTs, full email addresses in INFO+ logs.

---

## 8. CORS Configuration Check

Open `backend/main.py` and verify:
- [ ] `allow_origins` is not `["*"]` in production
- [ ] Only the frontend origin is allowed
- [ ] `allow_credentials=True` is set if cookies are used (not applicable — JWT only)

---

## 9. Rate Limiting

Verify rate limiting middleware is applied to:
- [ ] `POST /users/login` — max 10 req/min per IP
- [ ] `POST /users/register` — max 5 req/min per IP
- [ ] `POST /garments/tryon/start` — max 3 concurrent jobs per user

---

## 10. Bandit Static Analysis

```bash
pip install bandit
bandit -r backend/app/ -ll  # report medium severity and above
```

Review all B-level findings. Fix any:
- `B106` hardcoded passwords
- `B108` insecure temp file
- `B307` eval usage
- `B324` weak hash (MD5/SHA1 for security purposes)
