# Backend Test Commands

## Run All Tests

```bash
cd backend
pytest tests/ -v --tb=short
```

## Run with Coverage

```bash
pytest tests/ --cov=app --cov-report=term-missing --cov-fail-under=80
```

Coverage must stay above **80%**. New routes require tests before merging.

## Run Specific Test Groups

```bash
# Auth routes only
pytest tests/test_users.py -v

# Garment routes only
pytest tests/test_garments.py -v

# Database queries only
pytest tests/test_db_queries.py -v

# Run a single test
pytest tests/test_users.py::test_register_success -v
```

## Test Database Setup

Tests use a separate PostgreSQL DB. Set `TEST_DATABASE_URL` in `backend/.env.test`:

```
TEST_DATABASE_URL=postgresql+asyncpg://user:pass@localhost:5432/zora_test
```

The `conftest.py` should:
1. Create a fresh DB session per test (transaction rollback after each)
2. Mock the AI service (`httpx` mock, not real calls)
3. Mock S3 with `moto` or `localstack`

## Test Coverage Requirements per Module

| Module | Min Coverage |
|--------|-------------|
| `app/api/users.py` | 90% |
| `app/api/garments.py` | 85% |
| `app/auth.py` | 95% |
| `app/api/health.py` | 100% |
| All other modules | 75% |

## Validate Route Status Codes

Key status codes that must be tested:

```python
# Register
assert response.status_code == 201       # success
assert response.status_code == 409       # duplicate email
assert response.status_code == 422       # invalid email / short password

# Login
assert response.status_code == 200       # success
assert response.status_code == 401       # wrong password

# Protected routes without token
assert response.status_code == 403       # missing auth

# Garment not found
assert response.status_code == 404

# File too large
assert response.status_code == 422

# Another user's garment
assert response.status_code == 403
```

## Linting and Type Checking

```bash
# Type check
mypy app/ --ignore-missing-imports

# Lint
ruff check app/ tests/

# Format check
ruff format --check app/ tests/
```
