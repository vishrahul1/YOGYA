"""Tests for the student tracking routes. No live database and no network.

get_connection in app.routers.student_tracking is replaced with a recording fake
that returns rows from per-test queues. Authentication is bypassed by patching the
two functions in app.auth that touch the token and the role table. All identifiers
and values are synthetic.
"""

from __future__ import annotations

import uuid
from collections import deque
from datetime import datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient
from psycopg.errors import UniqueViolation

from app import auth as auth_module
from app.main import app
from app.routers import student_tracking as tracking_module

STUDENT_ID = uuid.UUID("44444444-4444-4444-8444-444444444444")
PROFILE_ID = uuid.UUID("77777777-7777-4777-8777-777777777777")
SCHEME_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
VERSION_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
SAVED_ID = uuid.UUID("88888888-8888-4888-8888-888888888888")
APPLICATION_ID = uuid.UUID("99999999-9999-4999-8999-999999999999")
SAVED_AT = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)


class FakeState:
    def __init__(self) -> None:
        self.executed: list[tuple[str, Any]] = []
        self.fetchall_queue: deque[list[tuple[Any, ...]]] = deque()
        self.fetchone_queue: deque[tuple[Any, ...] | None] = deque()
        self.raise_on: str | None = None


class FakeCursor:
    def __init__(self, state: FakeState) -> None:
        self._state = state

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *exc: object) -> bool:
        return False

    def execute(self, sql: str, params: Any = None) -> None:
        self._state.executed.append((sql, params))
        if self._state.raise_on and self._state.raise_on in sql:
            raise UniqueViolation("synthetic duplicate")

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self._state.fetchall_queue.popleft() if self._state.fetchall_queue else []

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
    monkeypatch.setattr(tracking_module, "get_connection", lambda: FakeConnection(fake))
    return fake


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


@pytest.fixture
def student(monkeypatch: pytest.MonkeyPatch) -> dict[str, str]:
    """Authenticate as a synthetic student without touching JWKS or the role table."""
    monkeypatch.setattr(
        auth_module,
        "_decode_claims",
        lambda token: {"sub": str(STUDENT_ID), "email": "synthetic@example.test"},
    )
    monkeypatch.setattr(auth_module, "_lookup_role", lambda auth_user_id: "student")
    return {"Authorization": "Bearer synthetic-token"}


def test_save_published_scheme_returns_201(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((PROFILE_ID,))  # owner profile
    state.fetchone_queue.append((SCHEME_ID,))  # published version -> scheme
    state.fetchone_queue.append((SAVED_ID, SCHEME_ID, SAVED_AT))  # inserted row

    response = client.post(
        "/api/student/saved-schemes",
        json={"scheme_version_id": str(VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 201
    body = response.json()
    assert body["id"] == str(SAVED_ID)
    assert body["scheme_id"] == str(SCHEME_ID)
    insert_sql, insert_params = state.executed[-1]
    assert "INSERT INTO saved_schemes" in insert_sql
    assert insert_params == (PROFILE_ID, SCHEME_ID)


def test_save_unpublished_scheme_returns_404(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((PROFILE_ID,))
    state.fetchone_queue.append(None)  # no published version with this id

    response = client.post(
        "/api/student/saved-schemes",
        json={"scheme_version_id": str(VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Scheme not found"
    assert all("INSERT INTO saved_schemes" not in sql for sql, _ in state.executed)


def test_save_duplicate_returns_409(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((PROFILE_ID,))
    state.fetchone_queue.append((SCHEME_ID,))
    state.raise_on = "INSERT INTO saved_schemes"

    response = client.post(
        "/api/student/saved-schemes",
        json={"scheme_version_id": str(VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 409


def test_delete_another_students_row_returns_404(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    # The owner-scoped DELETE matches no row when the saved row belongs to someone else.
    state.fetchone_queue.append(None)

    response = client.delete(f"/api/student/saved-schemes/{SAVED_ID}", headers=student)

    assert response.status_code == 404
    sql, params = state.executed[-1]
    assert "DELETE FROM saved_schemes" in sql
    assert params == (SAVED_ID, STUDENT_ID)


def test_delete_own_row_returns_204(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((SAVED_ID,))

    response = client.delete(f"/api/student/saved-schemes/{SAVED_ID}", headers=student)

    assert response.status_code == 204


def test_extra_keys_in_save_body_return_422(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    response = client.post(
        "/api/student/saved-schemes",
        json={"scheme_version_id": str(VERSION_ID), "student_profile_id": str(PROFILE_ID)},
        headers=student,
    )

    assert response.status_code == 422
    assert state.executed == []


def test_unauthenticated_request_returns_401(state: FakeState, client: TestClient) -> None:
    response = client.get("/api/student/saved-schemes")

    assert response.status_code == 401
    assert state.executed == []


def test_patch_application_invalid_status_returns_422(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    response = client.patch(
        f"/api/student/applications/{APPLICATION_ID}",
        json={"status": "approved"},
        headers=student,
    )

    assert response.status_code == 422
    assert state.executed == []
