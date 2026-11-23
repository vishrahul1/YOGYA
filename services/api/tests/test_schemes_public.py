"""Tests for the public scheme catalogue routes. No live database is used.

get_connection in app.routers.schemes is replaced with a fake that records
every execute() call and returns rows from queues set up per test.
"""

from __future__ import annotations

import uuid
from collections import deque
from datetime import date, datetime, timezone
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.routers import schemes

SCHEME_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
VERSION_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
NAME = "Synthetic Scheme A"
SLUG = "synthetic-scheme-a"
OFFICIAL_URL = "https://example.invalid/synthetic"
AUTHORITY = "Synthetic Authority"
VERIFIED_AT = datetime(2024, 1, 2, 3, 4, 5, tzinfo=timezone.utc)
PUBLISHED_AT = datetime(2024, 1, 3, 3, 4, 5, tzinfo=timezone.utc)


class FakeState:
    def __init__(self) -> None:
        self.executed: list[tuple[str, Any]] = []
        self.fetchall_queue: deque[list[tuple[Any, ...]]] = deque()
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
    monkeypatch.setattr(
        schemes,
        "get_connection",
        lambda: FakeConnection(fake),
    )
    return fake


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def _list_row() -> tuple[Any, ...]:
    return (
        SCHEME_ID,
        VERSION_ID,
        SLUG,
        NAME,
        "2024-25",
        "Synthetic benefit",
        "Synthetic deadline",
        date(2024, 1, 1),
        date(2024, 3, 31),
        OFFICIAL_URL,
        AUTHORITY,
        VERIFIED_AT,
        PUBLISHED_AT,
    )


def test_list_returns_200_and_no_verified_by(state: FakeState, client: TestClient) -> None:
    state.fetchall_queue.append([_list_row()])

    response = client.get("/api/schemes")

    assert response.status_code == 200
    body = response.json()
    assert len(body["items"]) == 1
    for item in body["items"]:
        assert "verified_by" not in item


def test_list_passes_limit_offset_and_q(state: FakeState, client: TestClient) -> None:
    state.fetchall_queue.append([])

    response = client.get("/api/schemes", params={"limit": 5, "offset": 10, "q": "abc"})

    assert response.status_code == 200
    assert response.json() == {"items": [], "limit": 5, "offset": 10}
    _sql, params = state.executed[-1]
    assert 5 in params
    assert 10 in params
    assert "abc" in params


def test_list_limit_zero_returns_422(state: FakeState, client: TestClient) -> None:
    response = client.get("/api/schemes", params={"limit": 0})

    assert response.status_code == 422
    assert state.executed == []


def test_list_sql_filters_published(state: FakeState, client: TestClient) -> None:
    state.fetchall_queue.append([])

    client.get("/api/schemes")

    sql, _params = state.executed[-1]
    assert "v.status = 'published'" in sql


def test_detail_returns_404_when_version_missing(state: FakeState, client: TestClient) -> None:
    state.fetchone_queue.append(None)

    response = client.get(f"/api/schemes/{VERSION_ID}")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Scheme not found"


def test_detail_returns_rules_and_required_documents(state: FakeState, client: TestClient) -> None:
    state.fetchone_queue.append(_list_row())
    state.fetchall_queue.append([("Synthetic document", "certificate", True)])
    state.fetchall_queue.append([({"field": "synthetic"}, "1", 1)])

    response = client.get(f"/api/schemes/{VERSION_ID}")

    assert response.status_code == 200
    body = response.json()
    assert body["slug"] == SLUG
    assert body["official_url"] == OFFICIAL_URL
    assert "verified_by" not in body
    assert body["required_documents"] == [
        {
            "document_name": "Synthetic document",
            "document_kind": "certificate",
            "is_mandatory": True,
        }
    ]
    assert body["rules"] == [
        {
            "rule_json": {"field": "synthetic"},
            "rule_format_version": "1",
            "sort_order": 1,
        }
    ]


def test_detail_invalid_uuid_returns_422(state: FakeState, client: TestClient) -> None:
    response = client.get("/api/schemes/not-a-uuid")

    assert response.status_code == 422
    assert state.executed == []
