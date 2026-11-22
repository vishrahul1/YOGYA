"""Authentication and role-based access control tests (synthetic data only).

No live Supabase and no real database are used:
- Tokens are signed with an RSA key generated at import time.
- auth._jwks_client is patched to return that key's public half.
- auth._lookup_role is patched to return a fixed role per synthetic user.
- access._fetch_own_profile is patched wherever a profile read would hit the DB.

Tokens are never printed or logged.
"""

from __future__ import annotations

import time
import uuid
from types import SimpleNamespace

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.main import create_app
from app.routers import access as access_module

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "test-kid"


def _pem_pair() -> tuple[bytes, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return private_pem, private_key.public_key()


# Trusted key (what the patched JWKS client returns) and an unrelated key.
TRUSTED_PEM, TRUSTED_PUBLIC = _pem_pair()
UNRELATED_PEM, _ = _pem_pair()

# Synthetic users.
STUDENT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
OTHER_STUDENT_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
ADMIN_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")
NO_ROLE_ID = uuid.UUID("44444444-4444-4444-8444-444444444444")

ROLES: dict[uuid.UUID, str | None] = {
    STUDENT_ID: "student",
    OTHER_STUDENT_ID: "student",
    ADMIN_ID: "admin",
    NO_ROLE_ID: None,
}


class _FakeJWKSClient:
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=TRUSTED_PUBLIC)


def _fake_lookup_role(auth_user_id: uuid.UUID) -> str | None:
    return ROLES.get(auth_user_id)


def make_token(
    sub: uuid.UUID | str,
    role_claim: str | None = None,
    exp_offset: int = 3600,
    audience: str = "authenticated",
    issuer: str = ISSUER,
    key: bytes = TRUSTED_PEM,
) -> str:
    now = int(time.time())
    payload: dict = {
        "sub": str(sub),
        "aud": audience,
        "iss": issuer,
        "iat": now,
        "exp": now + exp_offset,
        "email": "synthetic@example.test",
    }
    if role_claim is not None:
        payload["app_metadata"] = {"role": role_claim}
        payload["user_metadata"] = {"role": role_claim}
    return jwt.encode(payload, key, algorithm="RS256", headers={"kid": KID})


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    # get_settings() is not cached in this codebase (it builds Settings on each
    # call), so setting environment variables is enough; no cache to clear.
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setattr(auth_module, "_jwks_client", lambda: _FakeJWKSClient())
    monkeypatch.setattr(auth_module, "_lookup_role", _fake_lookup_role)
    return TestClient(create_app())


# --- Authentication (401) ---------------------------------------------------


def test_student_token_on_me_returns_200_with_student_role(client: TestClient) -> None:
    token = make_token(STUDENT_ID)
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 200
    assert r.json()["role"] == "student"


def test_missing_authorization_header_on_me_returns_401(client: TestClient) -> None:
    r = client.get("/api/me")
    assert r.status_code == 401


def test_malformed_token_returns_401(client: TestClient) -> None:
    r = client.get("/api/me", headers={"Authorization": "Bearer not-a-jwt"})
    assert r.status_code == 401


def test_expired_token_returns_401(client: TestClient) -> None:
    token = make_token(STUDENT_ID, exp_offset=-60)
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 401


def test_wrong_signature_returns_401(client: TestClient) -> None:
    token = make_token(STUDENT_ID, key=UNRELATED_PEM)
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 401


def test_wrong_audience_returns_401(client: TestClient) -> None:
    token = make_token(STUDENT_ID, audience="someone-else")
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 401


def test_wrong_issuer_returns_401(client: TestClient) -> None:
    token = make_token(STUDENT_ID, issuer="https://evil.example.test/auth/v1")
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 401


def test_hs256_token_signed_with_shared_secret_returns_401(client: TestClient) -> None:
    # Algorithm-confusion guard: HS256 must not be accepted even if the
    # attacker signs with a secret string.
    now = int(time.time())
    payload = {
        "sub": str(STUDENT_ID),
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
    }
    token = jwt.encode(payload, "shared-secret-for-tests-only", algorithm="HS256")
    r = client.get("/api/me", headers=_bearer(token))
    assert r.status_code == 401


def test_guest_without_token_on_admin_catalogue_returns_401(client: TestClient) -> None:
    r = client.get("/api/admin/schemes-catalogue")
    assert r.status_code == 401


# --- Authorisation (403 / 200) ----------------------------------------------


def test_student_token_on_admin_catalogue_returns_403(client: TestClient) -> None:
    token = make_token(STUDENT_ID)
    r = client.get("/api/admin/schemes-catalogue", headers=_bearer(token))
    assert r.status_code == 403


def test_admin_token_on_admin_catalogue_returns_200(client: TestClient) -> None:
    token = make_token(ADMIN_ID)
    r = client.get("/api/admin/schemes-catalogue", headers=_bearer(token))
    assert r.status_code == 200


def test_admin_token_on_admin_student_profile_returns_403_with_detail(
    client: TestClient,
) -> None:
    token = make_token(ADMIN_ID)
    r = client.get(
        f"/api/admin/students/{STUDENT_ID}/profile", headers=_bearer(token)
    )
    assert r.status_code == 403
    assert r.json()["error"]["code"] == "http_403"
    assert r.json()["error"]["message"] == "Admins cannot access student private records"


def test_student_reading_other_student_profile_returns_403(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(access_module, "_fetch_own_profile", lambda uid: {})
    token = make_token(STUDENT_ID)
    r = client.get(f"/api/students/{OTHER_STUDENT_ID}/profile", headers=_bearer(token))
    assert r.status_code == 403


def test_student_reading_own_profile_is_not_forbidden(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    # Patched to return an empty profile (the "no row" result), so the route
    # returns a valid JSON object rather than None.
    monkeypatch.setattr(access_module, "_fetch_own_profile", lambda uid: {})
    token = make_token(STUDENT_ID)
    r = client.get(f"/api/students/{STUDENT_ID}/profile", headers=_bearer(token))
    assert r.status_code != 403
    assert r.status_code == 200


def test_token_with_no_role_row_on_student_profile_returns_403(
    client: TestClient,
) -> None:
    token = make_token(NO_ROLE_ID)
    r = client.get("/api/student/profile", headers=_bearer(token))
    assert r.status_code == 403


def test_client_supplied_admin_role_claim_does_not_grant_admin(
    client: TestClient,
) -> None:
    # STUDENT_ID has a 'student' role row; the token claims 'admin'.
    # Role must come from the DB lookup, never from the token.
    token = make_token(STUDENT_ID, role_claim="admin")
    r = client.get("/api/admin/schemes-catalogue", headers=_bearer(token))
    assert r.status_code == 403


# --- Public and cross-cutting ------------------------------------------------


def test_health_is_public_without_token(client: TestClient) -> None:
    r = client.get("/health")
    assert r.status_code == 200


def test_token_value_is_not_echoed_in_response_body(client: TestClient) -> None:
    token = make_token(STUDENT_ID)
    r = client.get("/api/me", headers=_bearer(token))
    assert token not in r.text
