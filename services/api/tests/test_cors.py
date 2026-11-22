"""Tests for CORS policy. No live database or network is used.

Settings reads DATABASE_URL and SUPABASE_URL, so every test sets synthetic
values with monkeypatch before building the app or Settings.
"""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.config import Settings
from app.main import create_app

ALLOWED_ORIGIN = "http://localhost:3000"
UNLISTED_ORIGIN = "http://evil.example"


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.delenv("CORS_ALLOWED_ORIGINS", raising=False)
    return TestClient(create_app())


def test_preflight_from_allowed_origin_is_accepted(client: TestClient) -> None:
    response = client.options(
        "/api/schemes",
        headers={
            "Origin": ALLOWED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_preflight_from_unlisted_origin_is_not_allowed(client: TestClient) -> None:
    response = client.options(
        "/api/schemes",
        headers={
            "Origin": UNLISTED_ORIGIN,
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.headers.get("access-control-allow-origin") != UNLISTED_ORIGIN


def test_health_with_allowed_origin_returns_cors_header(client: TestClient) -> None:
    response = client.get("/health", headers={"Origin": ALLOWED_ORIGIN})

    assert response.status_code == 200
    assert response.headers.get("access-control-allow-origin") == ALLOWED_ORIGIN


def test_allowed_origins_list_parses_and_strips(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    monkeypatch.setenv("CORS_ALLOWED_ORIGINS", "https://a.example, https://b.example ")

    settings = Settings()

    assert settings.allowed_origins_list() == ["https://a.example", "https://b.example"]
