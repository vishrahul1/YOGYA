"""Milestone A gap tests: public catalogue, pagination, eligibility and auth edges.

No live database and no network. get_connection in app.routers.schemes and
app.routers.eligibility is replaced with the same recording fake used in
test_schemes_public.py. Authentication is bypassed by patching the two
functions in app.auth that touch the token and the role table.
Every identifier and profile value here is synthetic.
"""

from __future__ import annotations

import uuid
from collections import deque
from typing import Any

import pytest
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.main import app
from app.routers import eligibility as eligibility_module
from app.routers import schemes as schemes_module

SCHEME_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
VERSION_ID = uuid.UUID("22222222-2222-4222-8222-222222222222")
DRAFT_VERSION_ID = uuid.UUID("33333333-3333-4333-8333-333333333333")
STUDENT_ID = uuid.UUID("44444444-4444-4444-8444-444444444444")

VALID_RULE_DOC: dict[str, Any] = {
    "format_version": 1,
    "academic_year": "2025-26",
    "root": {
        "type": "group",
        "operator": "AND",
        "children": [
            {
                "type": "criterion",
                "attribute": "income",
                "operator": "lte",
                "value": 250000,
                "source_reference": "income lte",
            }
        ],
    },
}

# Operator "approx" is not in the schema operator map: the adapter raises ValueError.
INVALID_RULE_DOC: dict[str, Any] = {
    "format_version": 1,
    "academic_year": "2025-26",
    "root": {
        "type": "criterion",
        "attribute": "income",
        "operator": "approx",
        "value": 5,
        "source_reference": "income approx",
    },
}

# Operator given as a list: the adapter's dict lookup raises TypeError, not ValueError.
UNHASHABLE_OPERATOR_RULE_DOC: dict[str, Any] = {
    "format_version": 1,
    "academic_year": "2025-26",
    "root": {
        "type": "criterion",
        "attribute": "income",
        "operator": ["lt"],
        "value": 5,
        "source_reference": "income lt",
    },
}

SPEC_OUTCOMES = {"LIKELY_ELIGIBLE", "NEED_MORE_INFORMATION", "NOT_ELIGIBLE", "UNVERIFIED"}


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
    monkeypatch.setattr(schemes_module, "get_connection", lambda: FakeConnection(fake))
    monkeypatch.setattr(eligibility_module, "get_connection", lambda: FakeConnection(fake))
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


def _list_row() -> tuple[Any, ...]:
    return (
        SCHEME_ID,
        VERSION_ID,
        "synthetic-scheme-a",
        "Synthetic Scheme A",
        "2024-25",
        "Synthetic benefit",
        "Synthetic deadline",
        None,
        None,
        "https://example.invalid/synthetic",
        "Synthetic Authority",
        None,
        None,
    )


# ---------------------------------------------------------------------------
# 1-4: public catalogue
# ---------------------------------------------------------------------------


def test_list_sql_restricts_to_published_versions(state: FakeState, client: TestClient) -> None:
    state.fetchall_queue.append([_list_row()])

    response = client.get("/api/schemes")

    assert response.status_code == 200
    sql, _params = state.executed[-1]
    assert "published" in sql
    assert "v.status = 'published'" in sql


def test_detail_non_published_version_returns_404(state: FakeState, client: TestClient) -> None:
    # The detail query filters on status, so a draft id yields no row.
    state.fetchone_queue.append(None)

    response = client.get(f"/api/schemes/{DRAFT_VERSION_ID}")

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Scheme not found"
    sql, params = state.executed[0]
    assert "v.status = 'published'" in sql
    assert params == (DRAFT_VERSION_ID,)
    assert len(state.executed) == 1


def test_list_limit_and_offset_are_sql_parameters(state: FakeState, client: TestClient) -> None:
    state.fetchall_queue.append([])

    response = client.get("/api/schemes", params={"limit": 7, "offset": 14})

    assert response.status_code == 200
    sql, params = state.executed[-1]
    assert "LIMIT %s OFFSET %s" in sql
    assert params[-2:] == (7, 14)
    assert "7" not in sql and "14" not in sql


def test_list_limit_101_returns_422(state: FakeState, client: TestClient) -> None:
    response = client.get("/api/schemes", params={"limit": 101})

    assert response.status_code == 422
    assert state.executed == []


# ---------------------------------------------------------------------------
# 4-7: eligibility endpoint
# ---------------------------------------------------------------------------


def test_eligibility_published_version_returns_likely_eligible(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    # The overall outcome uses the spec vocabulary; rule outcomes stay PASS/FAIL/UNKNOWN.
    state.fetchone_queue.append((VERSION_ID,))
    state.fetchall_queue.append([(VALID_RULE_DOC,)])

    response = client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(VERSION_ID), "profile": {"income": 50000}},
        headers=student,
    )

    assert response.status_code == 200
    body = response.json()
    assert body["overall_outcome"] in SPEC_OUTCOMES
    assert body["overall_outcome"] == "LIKELY_ELIGIBLE"
    assert [r["outcome"] for r in body["rule_results"]] == ["PASS"]


def test_eligibility_overall_outcome_uses_spec_vocabulary(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((VERSION_ID,))
    state.fetchall_queue.append([(VALID_RULE_DOC,)])

    response = client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(VERSION_ID), "profile": {"income": 50000}},
        headers=student,
    )

    assert response.status_code == 200
    assert response.json()["overall_outcome"] in SPEC_OUTCOMES


def test_eligibility_unpublished_version_returns_404_without_rule_query(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append(None)

    response = client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(DRAFT_VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 404
    assert response.json()["error"]["message"] == "Scheme not found"
    assert len(state.executed) == 1
    sql, _params = state.executed[0]
    assert "v.status = 'published'" in sql
    assert all("scheme_rules" not in executed_sql for executed_sql, _ in state.executed)


def test_invalid_stored_rule_returns_500_with_error_key(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    # Documents the actual status: adapter ValueError is caught and mapped to HTTP 500
    # with the standard {"error": ...} body. It is not a 422.
    state.fetchone_queue.append((VERSION_ID,))
    state.fetchall_queue.append([(INVALID_RULE_DOC,)])

    response = client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 500
    body = response.json()
    assert "error" in body
    assert body["error"]["message"] == "Stored scheme rules are invalid"


def test_invalid_stored_rule_with_unhashable_operator_returns_error_body(
    state: FakeState, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((VERSION_ID,))
    state.fetchall_queue.append([(UNHASHABLE_OPERATOR_RULE_DOC,)])
    raw_client = TestClient(app, raise_server_exceptions=False)

    response = raw_client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(VERSION_ID)},
        headers=student,
    )

    assert response.status_code == 500
    assert response.json()["error"]["message"] == "Stored eligibility rule is invalid"


def test_eligibility_extra_body_keys_return_422(
    state: FakeState, client: TestClient, student: dict[str, str]
) -> None:
    state.fetchone_queue.append((VERSION_ID,))
    state.fetchall_queue.append([(VALID_RULE_DOC,)])

    response = client.post(
        "/api/eligibility/evaluate",
        json={"scheme_version_id": str(VERSION_ID), "unexpected_key": "synthetic"},
        headers=student,
    )

    assert response.status_code == 422


# ---------------------------------------------------------------------------
# 8: admin route without credentials
# ---------------------------------------------------------------------------


def test_admin_schemes_without_token_returns_401(client: TestClient) -> None:
    response = client.get("/api/admin/schemes")

    assert response.status_code in (401, 403)
    assert response.status_code == 401
    assert "error" in response.json()
