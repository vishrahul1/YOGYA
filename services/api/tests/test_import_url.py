"""Tests for POST /api/admin/schemes/import-url. No live database and no network.

get_connection in app.routers.admin_schemes is replaced with a recording fake.
Authentication is bypassed by patching the two functions in app.auth that touch
the token and the role table. The route must never make an outbound request; the
tests only exercise the database fake. All identifiers are synthetic.
"""

from __future__ import annotations

import uuid
from collections import deque
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.main import app
from app.routers import admin_schemes as admin_module

ADMIN_ID = uuid.UUID("55555555-5555-4555-8555-555555555555")
STUDENT_ID = uuid.UUID("66666666-6666-4666-8666-666666666666")
VALID_URL = "https://example.invalid/synthetic/scheme-b"


class FakeState:
    def __init__(self) -> None:
        self.executed: list[tuple[str, Any]] = []
        self.fetchone_queue: deque[tuple[Any, ...] | None] = deque()


class FakeCursor:
    def __init__(self, state: FakeState) -> None:
        self._state = state

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def execute(self, sql: str, params: Any = None) -> None:
        self._state.executed.append((sql, params))

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._state.fetchone_queue.popleft() if self._state.fetchone_queue else None


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
    monkeypatch.setattr(admin_module, "get_connection", lambda: FakeConnection(fake))
    return fake


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def admin(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(
        auth_module,
        "_decode_claims",
        lambda token: {"sub": str(ADMIN_ID), "email": "admin@example.test"},
    )
    monkeypatch.setattr(auth_module, "_lookup_role", lambda auth_user_id: "admin")
    return {"Authorization": "Bearer synthetic-token"}


@pytest.fixture
def student(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    monkeypatch.setattr(
        auth_module,
        "_decode_claims",
        lambda token: {"sub": str(STUDENT_ID), "email": "student@example.test"},
    )
    monkeypatch.setattr(auth_module, "_lookup_role", lambda auth_user_id: "student")
    return {"Authorization": "Bearer synthetic-token"}


def test_https_url_returns_201_with_draft_ids(
    state: FakeState, client: TestClient, admin: dict[str, str]
) -> None:
    state.fetchone_queue.append(None)  # slug is free

    response = client.post(
        "/api/admin/schemes/import-url",
        json={
            "official_url": VALID_URL,
            "name": "Synthetic Scheme B",
            "issuing_body": "Synthetic Authority",
        },
        headers=admin,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["status"] == "draft"
    assert body["slug"] == "synthetic-scheme-b"
    uuid.UUID(body["scheme_id"])
    uuid.UUID(body["scheme_source_id"])


def test_https_url_writes_scheme_source_and_audit_only(
    state: FakeState, client: TestClient, admin: dict[str, str]
) -> None:
    state.fetchone_queue.append(None)

    client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": VALID_URL, "name": "Synthetic Scheme B"},
        headers=admin,
    )

    sql_all = "\n".join(sql for sql, _ in state.executed)
    assert "INSERT INTO schemes" in sql_all
    assert "INSERT INTO scheme_sources" in sql_all
    assert "scheme.imported_from_url" in sql_all
    assert "scheme_versions" not in sql_all
    source_params = next(p for sql, p in state.executed if "scheme_sources" in sql)
    assert VALID_URL in source_params
    assert "TBD" in source_params  # issuing_authority when issuing_body is absent


def test_slug_collision_gets_suffix(
    state: FakeState, client: TestClient, admin: dict[str, str]
) -> None:
    state.fetchone_queue.append((uuid.uuid4(),))  # base slug already taken

    response = client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": VALID_URL, "name": "Synthetic Scheme B"},
        headers=admin,
    )

    assert response.status_code == 201
    assert response.json()["slug"].startswith("synthetic-scheme-b-")
    assert response.json()["slug"] != "synthetic-scheme-b"


def test_http_url_returns_422_and_no_db_access(
    state: FakeState, client: TestClient, admin: dict[str, str]
) -> None:
    response = client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": "http://example.invalid/synthetic"},
        headers=admin,
    )

    assert response.status_code == 422
    assert state.executed == []


def test_extra_key_returns_422(
    state: FakeState, client: TestClient, admin: dict[str, str]
) -> None:
    response = client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": VALID_URL, "fetch_now": True},
        headers=admin,
    )

    assert response.status_code == 422
    assert state.executed == []


def test_student_role_returns_403(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    response = client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": VALID_URL},
        headers=student,
    )

    assert response.status_code == 403
    assert state.executed == []


def test_missing_token_returns_401(state: FakeState, client: TestClient) -> None:
    response = client.post(
        "/api/admin/schemes/import-url",
        json={"official_url": VALID_URL},
    )

    assert response.status_code == 401
    assert state.executed == []
