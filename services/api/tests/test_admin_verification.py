"""Tests for the admin scheme version and source verification routes (synthetic data only).

get_connection in app.routers.admin_verification is replaced with an in-memory fake.
The fake recognises each SQL statement the router issues by its prefix and keeps
scheme versions, sources, verification history and audit rows in Python dicts, so
multi-step flows (add source, verify, submit, approve, publish) run against real state.
No live database and no network are used.

Auth follows tests/test_auth_rbac.py: tokens are signed with an RSA key generated at
import time, auth._jwks_client is patched to return its public half, and
auth._lookup_role is patched to return a fixed role per synthetic user.

Tokens are never printed or logged.
"""

from __future__ import annotations

import time
import uuid
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.main import create_app
from app.routers import admin_verification

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "test-kid"

SCHEME_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
ADMIN_AUTH_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")
ADMIN_USER_ID = uuid.UUID("55555555-5555-4555-8555-555555555555")
STUDENT_AUTH_ID = uuid.UUID("66666666-6666-4666-8666-666666666666")
OFFICIAL_URL = "https://example.invalid/synthetic"
AUTHORITY = "Synthetic Authority"
BASE_TIME = datetime(2024, 1, 1, 0, 0, 0, tzinfo=timezone.utc)


def _pem_pair() -> tuple[bytes, object]:
    private_key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    private_pem = private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return private_pem, private_key.public_key()


TRUSTED_PEM, TRUSTED_PUBLIC = _pem_pair()

ROLES: dict[str, str] = {
    str(ADMIN_AUTH_ID): "admin",
    str(STUDENT_AUTH_ID): "student",
}


class _FakeJWKSClient:
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=TRUSTED_PUBLIC)


def _fake_lookup_role(auth_user_id: Any) -> str | None:
    return ROLES.get(str(auth_user_id))


def make_token(sub: uuid.UUID | str) -> str:
    now = int(time.time())
    payload: dict = {
        "sub": str(sub),
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "email": "synthetic@example.test",
    }
    return jwt.encode(payload, TRUSTED_PEM, algorithm="RS256", headers={"kid": KID})


def _bearer(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"}


ADMIN_HEADERS = _bearer(make_token(ADMIN_AUTH_ID))


class FakeState:
    def __init__(self) -> None:
        self.schemes: set[uuid.UUID] = {SCHEME_ID}
        self.users: dict[str, uuid.UUID] = {str(ADMIN_AUTH_ID): ADMIN_USER_ID}
        self.versions: dict[uuid.UUID, dict[str, Any]] = {}
        self.sources: dict[uuid.UUID, dict[str, Any]] = {}
        self.history: list[dict[str, Any]] = []
        # Raw parameter tuples of every INSERT INTO audit_logs, in order.
        self.audit_params: list[tuple[Any, ...]] = []
        self.executed: list[tuple[str, tuple[Any, ...]]] = []
        self._tick = 0

    def now(self) -> datetime:
        self._tick += 1
        return BASE_TIME + timedelta(seconds=self._tick)


def _version_row(v: dict[str, Any]) -> tuple[Any, ...]:
    return (
        v["id"],
        v["scheme_id"],
        v["version_number"],
        v["academic_year"],
        v["status"],
        v["verified_at"],
        v["published_at"],
        v["source_id"],
        v["created_at"],
        v["updated_at"],
    )


def _source_row(src: dict[str, Any]) -> tuple[Any, ...]:
    return (
        src["id"],
        src["scheme_id"],
        src["official_url"],
        src["issuing_authority"],
        src["notes"],
        src["retrieved_at"],
        src["verified_at"],
    )


def _update_version(s: FakeState, version_id: uuid.UUID, **fields: Any) -> dict[str, Any]:
    v = s.versions[version_id]
    v.update(fields)
    v["updated_at"] = s.now()
    return v


def _run(s: FakeState, sql: str, p: tuple[Any, ...]) -> list[tuple[Any, ...]]:
    """Interpret one normalised SQL statement from the router. Returns result rows."""
    if sql.startswith("SELECT id FROM schemes WHERE id = %s"):
        return [(p[0],)] if p[0] in s.schemes else []

    if sql.startswith("SELECT 1 FROM scheme_versions WHERE scheme_id = %s AND academic_year = %s"):
        taken = any(
            v["scheme_id"] == p[0] and v["academic_year"] == p[1] and v["status"] != "retired"
            for v in s.versions.values()
        )
        return [(1,)] if taken else []

    if sql.startswith("SELECT COALESCE(MAX(version_number), 0) + 1"):
        numbers = [v["version_number"] for v in s.versions.values() if v["scheme_id"] == p[0]]
        return [(max(numbers, default=0) + 1,)]

    if sql.startswith("INSERT INTO scheme_versions"):
        version_id, scheme_id, number, year = p
        now = s.now()
        v = {
            "id": version_id,
            "scheme_id": scheme_id,
            "version_number": number,
            "academic_year": year,
            "status": "draft",
            "verified_at": None,
            "published_at": None,
            "source_id": None,
            "created_at": now,
            "updated_at": now,
        }
        s.versions[version_id] = v
        return [_version_row(v)]

    if sql.startswith("SELECT scheme_id, status FROM scheme_versions WHERE id = %s"):
        v = s.versions.get(p[0])
        return [(v["scheme_id"], v["status"])] if v is not None else []

    if sql.startswith("SELECT 1 FROM scheme_versions WHERE id = %s"):
        return [(1,)] if p[0] in s.versions else []

    if sql.startswith("INSERT INTO scheme_sources"):
        source_id, scheme_id, url, authority, notes = p
        src = {
            "id": source_id,
            "scheme_id": scheme_id,
            "official_url": url,
            "issuing_authority": authority,
            "notes": notes,
            "retrieved_at": s.now(),
            "verified_at": None,
            "verified_by": None,
        }
        s.sources[source_id] = src
        return [_source_row(src)]

    if sql.startswith("SELECT id FROM scheme_sources WHERE id = %s AND scheme_id = %s"):
        src = s.sources.get(p[0])
        return [(p[0],)] if src is not None and src["scheme_id"] == p[1] else []

    if sql.startswith("UPDATE scheme_sources"):
        # Params: (verifying auth user id, source id).
        src = s.sources[p[1]]
        src["verified_at"] = s.now()
        src["verified_by"] = s.users.get(str(p[0]))
        return [_source_row(src)]

    if sql.startswith("SELECT EXISTS (SELECT 1 FROM scheme_sources WHERE scheme_id = %s)"):
        return [(any(x["scheme_id"] == p[0] for x in s.sources.values()),)]

    if sql.startswith("SELECT id FROM scheme_sources WHERE scheme_id = %s AND verified_at IS NOT NULL"):
        verified = sorted(
            (
                x
                for x in s.sources.values()
                if x["scheme_id"] == p[0] and x["verified_at"] is not None
            ),
            key=lambda x: (x["verified_at"], x["id"]),
        )
        return [(verified[0]["id"],)] if verified else []

    if sql.startswith("SELECT id FROM scheme_versions WHERE scheme_id = %s AND status = 'published'"):
        return [
            (v["id"],)
            for v in s.versions.values()
            if v["scheme_id"] == p[0] and v["status"] == "published" and v["id"] != p[1]
        ]

    if sql.startswith("UPDATE scheme_versions SET status = 'in_review'"):
        return [_version_row(_update_version(s, p[0], status="in_review"))]

    if sql.startswith("UPDATE scheme_versions SET status = 'verified'"):
        # Params: (approving auth user id, evidence source id, version id).
        v = _update_version(
            s,
            p[2],
            status="verified",
            verified_at=s.now(),
            verified_by=s.users.get(str(p[0])),
            source_id=p[1],
        )
        return [_version_row(v)]

    if sql.startswith("UPDATE scheme_versions SET status = 'draft'"):
        return [_version_row(_update_version(s, p[0], status="draft"))]

    if sql.startswith("UPDATE scheme_versions SET status = 'retired'"):
        _update_version(s, p[0], status="retired")
        return []

    if sql.startswith("UPDATE scheme_versions SET status = 'published'"):
        return [_version_row(_update_version(s, p[0], status="published", published_at=s.now()))]

    if sql.startswith("INSERT INTO scheme_verification_history"):
        version_id, action, auth_user_id, note = p
        s.history.append(
            {
                "id": uuid.uuid4(),
                "scheme_version_id": version_id,
                "action": action,
                "actor_user_id": s.users.get(str(auth_user_id)),
                "note": note,
                "recorded_at": s.now(),
            }
        )
        return []

    if sql.startswith("INSERT INTO audit_logs"):
        s.audit_params.append(p)
        return []

    if sql.startswith(
        "SELECT id, action, actor_user_id, note, recorded_at FROM scheme_verification_history"
    ):
        rows = sorted(
            (h for h in s.history if h["scheme_version_id"] == p[0]),
            key=lambda h: h["recorded_at"],
            reverse=True,
        )
        return [(h["id"], h["action"], h["actor_user_id"], h["note"], h["recorded_at"]) for h in rows]

    raise AssertionError(f"Unexpected SQL in fake: {sql}")


class FakeCursor:
    def __init__(self, state: FakeState) -> None:
        self._state = state
        self._rows: list[tuple[Any, ...]] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def execute(self, sql: str, params: Any = None) -> None:
        normalized = " ".join(sql.split())
        p = tuple(params) if params is not None else ()
        self._state.executed.append((normalized, p))
        self._rows = _run(self._state, normalized, p)

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._rows.pop(0) if self._rows else None

    def fetchall(self) -> list[tuple[Any, ...]]:
        rows, self._rows = self._rows, []
        return rows


class FakeConnection:
    def __init__(self, state: FakeState) -> None:
        self._state = state

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def cursor(self, *args: Any, **kwargs: Any) -> FakeCursor:
        return FakeCursor(self._state)


@pytest.fixture
def state(monkeypatch: pytest.MonkeyPatch) -> FakeState:
    fake = FakeState()
    monkeypatch.setattr(
        admin_verification,
        "get_connection",
        lambda: FakeConnection(fake),
    )
    return fake


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setattr(auth_module, "_jwks_client", lambda: _FakeJWKSClient())
    monkeypatch.setattr(auth_module, "_lookup_role", _fake_lookup_role)
    return TestClient(create_app())


# --- Helpers -----------------------------------------------------------------


def _seed_version(state: FakeState, status: str, academic_year: str, number: int) -> uuid.UUID:
    version_id = uuid.uuid4()
    now = state.now()
    state.versions[version_id] = {
        "id": version_id,
        "scheme_id": SCHEME_ID,
        "version_number": number,
        "academic_year": academic_year,
        "status": status,
        "verified_at": now if status in ("verified", "published") else None,
        "published_at": now if status == "published" else None,
        "source_id": None,
        "created_at": now,
        "updated_at": now,
    }
    return version_id


def _create_version(client: TestClient, academic_year: str = "2024-25") -> str:
    r = client.post(
        f"/api/admin/schemes/{SCHEME_ID}/versions",
        json={"academic_year": academic_year},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    return r.json()["id"]


def _add_source(client: TestClient, version_id: str) -> str:
    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/sources",
        json={"official_url": OFFICIAL_URL, "issuing_authority": AUTHORITY},
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 201
    return r.json()["id"]


def _verify_source(client: TestClient, version_id: str, source_id: str) -> None:
    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/sources/{source_id}/verify",
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200


def _submit(client: TestClient, version_id: str) -> None:
    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/submit-review",
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200
    assert r.json()["status"] == "in_review"


# --- Version creation --------------------------------------------------------


def test_create_draft_version_returns_201_with_draft_status(
    state: FakeState, client: TestClient
) -> None:
    r = client.post(
        f"/api/admin/schemes/{SCHEME_ID}/versions",
        json={"academic_year": "2024-25"},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 201
    body = r.json()
    assert body["status"] == "draft"
    assert body["academic_year"] == "2024-25"
    assert body["version_number"] == 1
    assert body["scheme_id"] == str(SCHEME_ID)


def test_duplicate_academic_year_returns_409(state: FakeState, client: TestClient) -> None:
    _create_version(client, "2024-25")

    r = client.post(
        f"/api/admin/schemes/{SCHEME_ID}/versions",
        json={"academic_year": "2024-25"},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 409
    assert len(state.versions) == 1


# --- Sources -----------------------------------------------------------------


def test_add_source_with_https_url_returns_201(state: FakeState, client: TestClient) -> None:
    version_id = _create_version(client)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/sources",
        json={"official_url": OFFICIAL_URL, "issuing_authority": AUTHORITY},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 201
    assert r.json()["official_url"] == OFFICIAL_URL
    assert r.json()["verified_at"] is None
    assert len(state.sources) == 1


def test_add_source_with_non_https_url_returns_422_and_stores_nothing(
    state: FakeState, client: TestClient
) -> None:
    version_id = _create_version(client)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/sources",
        json={"official_url": "http://example.invalid/synthetic", "issuing_authority": AUTHORITY},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 422
    assert state.sources == {}


# --- Approval gate -----------------------------------------------------------


def test_approve_without_verified_source_returns_409(state: FakeState, client: TestClient) -> None:
    version_id = _create_version(client)
    _add_source(client, version_id)  # present but not verified
    _submit(client, version_id)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/approve",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 409
    assert state.versions[uuid.UUID(version_id)]["status"] == "in_review"


def test_verify_source_then_submit_then_approve_sets_verified(
    state: FakeState, client: TestClient
) -> None:
    version_id = _create_version(client)
    source_id = _add_source(client, version_id)
    _verify_source(client, version_id, source_id)
    _submit(client, version_id)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/approve",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "verified"
    assert body["source_id"] == source_id


# --- Rejection ---------------------------------------------------------------


def test_reject_without_reason_returns_422(state: FakeState, client: TestClient) -> None:
    version_id = _create_version(client)
    _add_source(client, version_id)
    _submit(client, version_id)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/reject",
        json={},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 422
    assert state.versions[uuid.UUID(version_id)]["status"] == "in_review"


def test_reject_from_in_review_returns_version_to_draft(
    state: FakeState, client: TestClient
) -> None:
    version_id = _create_version(client)
    _add_source(client, version_id)
    _submit(client, version_id)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/reject",
        json={"reason": "Synthetic reason"},
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 200
    assert r.json()["status"] == "draft"
    assert any(h["action"] == "rejected" and h["note"] == "Synthetic reason" for h in state.history)


# --- Publishing --------------------------------------------------------------


def test_publish_from_draft_returns_409(state: FakeState, client: TestClient) -> None:
    version_id = _create_version(client)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/publish",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 409
    assert state.versions[uuid.UUID(version_id)]["status"] == "draft"


def test_publish_from_verified_publishes_and_retires_previous(
    state: FakeState, client: TestClient
) -> None:
    previous_id = _seed_version(state, "published", "2023-24", number=1)
    new_id = _seed_version(state, "verified", "2024-25", number=2)

    r = client.post(
        f"/api/admin/scheme-versions/{new_id}/publish",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 200
    assert r.json()["status"] == "published"
    assert r.json()["published_at"] is not None
    assert state.versions[new_id]["status"] == "published"
    assert state.versions[previous_id]["status"] == "retired"


def test_publish_writes_audit_row_with_published_action(
    state: FakeState, client: TestClient
) -> None:
    version_id = _seed_version(state, "verified", "2024-25", number=1)

    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/publish",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 200
    published_rows = [p for p in state.audit_params if p[1] == "scheme_version.published"]
    assert len(published_rows) == 1
    actor, action, entity_type, entity_id = published_rows[0][:4]
    assert str(actor) == str(ADMIN_AUTH_ID)
    assert action == "scheme_version.published"
    assert entity_type == "scheme_version"
    assert str(entity_id) == str(version_id)


# --- History -----------------------------------------------------------------


def test_history_returns_rows_newest_first(state: FakeState, client: TestClient) -> None:
    version_id = _create_version(client)
    source_id = _add_source(client, version_id)
    _verify_source(client, version_id, source_id)
    _submit(client, version_id)
    r = client.post(
        f"/api/admin/scheme-versions/{version_id}/approve",
        headers=ADMIN_HEADERS,
    )
    assert r.status_code == 200

    r = client.get(
        f"/api/admin/scheme-versions/{version_id}/history",
        headers=ADMIN_HEADERS,
    )

    assert r.status_code == 200
    items = r.json()["items"]
    assert [i["action"] for i in items] == ["verified", "submitted_for_review", "verified"]
    recorded = [datetime.fromisoformat(i["recorded_at"]) for i in items]
    assert recorded == sorted(recorded, reverse=True)
    assert items[0]["note"].startswith("Version approved")


# --- Authorisation -----------------------------------------------------------


def test_student_on_admin_write_route_returns_403_and_writes_nothing(
    state: FakeState, client: TestClient
) -> None:
    student_headers = _bearer(make_token(STUDENT_AUTH_ID))

    r = client.post(
        f"/api/admin/schemes/{SCHEME_ID}/versions",
        json={"academic_year": "2024-25"},
        headers=student_headers,
    )

    assert r.status_code == 403
    assert state.versions == {}
    assert state.executed == []
