"""Unit tests for guarded deletion of admin scholarship drafts."""

from __future__ import annotations

import uuid
from typing import Any

import pytest
from fastapi import HTTPException

from app.auth import AuthContext
from app.routers import admin_schemes


SCHEME_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
ADMIN_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")


class FakeCursor:
    def __init__(self, scheme: tuple[str, str] | None, statuses: list[str], activity: bool) -> None:
        self.scheme = scheme
        self.statuses = statuses
        self.activity = activity
        self.executed: list[str] = []
        self._one: tuple[Any, ...] | None = None
        self._all: list[tuple[Any, ...]] = []

    def __enter__(self) -> "FakeCursor":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def execute(self, sql: str, _params: tuple[Any, ...]) -> None:
        normalized = " ".join(sql.split())
        self.executed.append(normalized)
        self._one = None
        self._all = []
        if normalized.startswith("SELECT slug, name FROM schemes"):
            self._one = self.scheme
        elif normalized.startswith("SELECT status FROM scheme_versions"):
            self._all = [(status,) for status in self.statuses]
        elif normalized.startswith("SELECT EXISTS"):
            self._one = (self.activity,)

    def fetchone(self) -> tuple[Any, ...] | None:
        return self._one

    def fetchall(self) -> list[tuple[Any, ...]]:
        return self._all


class FakeConnection:
    def __init__(self, cursor: FakeCursor) -> None:
        self.fake_cursor = cursor

    def __enter__(self) -> "FakeConnection":
        return self

    def __exit__(self, *_args: Any) -> None:
        return None

    def cursor(self) -> FakeCursor:
        return self.fake_cursor


def context() -> AuthContext:
    return AuthContext(auth_user_id=ADMIN_ID, email="admin@example.test", role="admin")


def test_delete_draft_removes_workspace_in_safe_order(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(("synthetic-draft", "Synthetic Draft"), ["draft", "draft"], False)
    monkeypatch.setattr(admin_schemes, "get_connection", lambda: FakeConnection(cursor))

    result = admin_schemes.delete_draft_scheme(SCHEME_ID, context())

    assert result == {"deleted": True}
    mutations = [sql for sql in cursor.executed if sql.startswith(("INSERT", "DELETE"))]
    assert mutations[0].startswith("INSERT INTO audit_logs")
    assert mutations[1].startswith("DELETE FROM scheme_versions")
    assert mutations[2].startswith("DELETE FROM source_documents")
    assert mutations[3].startswith("DELETE FROM scheme_sources")
    assert mutations[4].startswith("DELETE FROM schemes")


def test_delete_rejects_version_that_left_draft(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(("reviewed", "Reviewed"), ["in_review"], False)
    monkeypatch.setattr(admin_schemes, "get_connection", lambda: FakeConnection(cursor))

    with pytest.raises(HTTPException) as raised:
        admin_schemes.delete_draft_scheme(SCHEME_ID, context())

    assert raised.value.status_code == 409
    assert not any(sql.startswith("DELETE") for sql in cursor.executed)


def test_delete_rejects_student_activity(monkeypatch: pytest.MonkeyPatch) -> None:
    cursor = FakeCursor(("used-draft", "Used Draft"), ["draft"], True)
    monkeypatch.setattr(admin_schemes, "get_connection", lambda: FakeConnection(cursor))

    with pytest.raises(HTTPException) as raised:
        admin_schemes.delete_draft_scheme(SCHEME_ID, context())

    assert raised.value.status_code == 409
    assert not any(sql.startswith("DELETE") for sql in cursor.executed)
