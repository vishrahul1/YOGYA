"""AI route tests (synthetic data only).

- The provider is replaced by a fake via monkeypatch; no network call is made.
- The DB loader and engine adapter are patched; no database is used.
- Auth mirrors test_auth_rbac.py: RSA-signed tokens, patched JWKS and role lookup.
"""

from __future__ import annotations

import time
import uuid
from types import SimpleNamespace
from typing import Any

import jwt
import pytest
from cryptography.hazmat.primitives import serialization
from cryptography.hazmat.primitives.asymmetric import rsa
from fastapi.testclient import TestClient

from app import auth as auth_module
from app.eligibility import engine
from app.eligibility.engine import RuleResult, SchemeEvaluation
from app.main import create_app
from app.routers import ai as ai_routes

SUPABASE_URL = "https://example.supabase.co"
ISSUER = f"{SUPABASE_URL}/auth/v1"
KID = "test-kid"
STUDENT_ID = uuid.UUID("11111111-1111-4111-8111-111111111111")
SCHEME_ID = uuid.UUID("55555555-5555-4555-8555-555555555555")


def _make_keys() -> tuple[bytes, Any]:
    key = rsa.generate_private_key(public_exponent=65537, key_size=2048)
    pem = key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.PKCS8,
        serialization.NoEncryption(),
    )
    return pem, key.public_key()


TRUSTED_PEM, TRUSTED_PUBLIC = _make_keys()


class _FakeJWKSClient:
    def get_signing_key_from_jwt(self, token: str) -> SimpleNamespace:
        return SimpleNamespace(key=TRUSTED_PUBLIC)


def _token() -> str:
    now = int(time.time())
    payload = {
        "sub": str(STUDENT_ID),
        "aud": "authenticated",
        "iss": ISSUER,
        "iat": now,
        "exp": now + 3600,
        "email": "synthetic@example.test",
    }
    return jwt.encode(payload, TRUSTED_PEM, algorithm="RS256", headers={"kid": KID})


AUTH = {"Authorization": f"Bearer {_token()}"}


class FakeProvider:
    """Records calls and returns fixed synthetic output. No network."""

    def __init__(self) -> None:
        self.calls: list[tuple[str, Any, str]] = []
        self.last_used_fallback = False

    def extract_profile(self, text: str, language: str) -> dict:
        self.calls.append(("extract", text, language))
        return {
            "profile": {"age": 19, "caste_category": "SC"},
            "missing": ["gender"],
            "followup_questions": [{"key": "gender", "en": "What is your gender?", "te": "లింగం?"}],
        }

    def generate_followups(self, missing: list, language: str) -> list:
        self.calls.append(("followups", list(missing), language))
        return [f"Question about {key}?" for key in missing]

    def explain(self, result: dict, language: str) -> str:
        self.calls.append(("explain", result, language))
        return "Synthetic explanation. Final eligibility is confirmed on the official portal."

    def chat(self, message: str, language: str, context: dict, existing_profile: dict, history: list) -> dict:
        self.calls.append(("chat", {"message": message, "context": context, "profile": existing_profile, "history": history}, language))
        return {
            "reply": "The verified context does not include that detail. Check the official source.",
            "intent": "both",
            "profile": {**existing_profile, "age": 19},
        }


@pytest.fixture
def fake_provider(monkeypatch: pytest.MonkeyPatch) -> FakeProvider:
    provider = FakeProvider()
    monkeypatch.setattr(ai_routes, "get_provider", lambda: provider)
    return provider


@pytest.fixture
def client(monkeypatch: pytest.MonkeyPatch) -> TestClient:
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", SUPABASE_URL)
    monkeypatch.setenv("SUPABASE_JWT_AUDIENCE", "authenticated")
    monkeypatch.setattr(auth_module, "_jwks_client", lambda: _FakeJWKSClient())
    monkeypatch.setattr(auth_module, "_lookup_role", lambda _uid: "student")
    return TestClient(create_app())


@pytest.fixture
def scheme_db(monkeypatch: pytest.MonkeyPatch) -> None:
    """Fake published scheme loader and adapter; the engine evaluation is faked per test."""

    def loader(scheme_version_id: uuid.UUID):
        if scheme_version_id == SCHEME_ID:
            return ("Synthetic Scheme", [{"synthetic": True}])
        return None

    monkeypatch.setattr(ai_routes, "_load_published_scheme", loader)
    monkeypatch.setattr(ai_routes, "adapt_rule_document", lambda doc: doc)


def _extract_body(**overrides: Any) -> dict:
    body = {"text": "I am 19 years old, SC, from Warangal", "language": "en"}
    body.update(overrides)
    return body


# --- Authentication ---------------------------------------------------------


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/ai/profile/extract", _extract_body()),
        ("/api/ai/follow-ups", {"missing": ["age"], "language": "en"}),
        ("/api/ai/chat", {"message": "Am I eligible?", "language": "en"}),
        ("/api/ai/explanations", {"scheme_version_id": str(SCHEME_ID), "profile": {}}),
    ],
)
def test_unauthenticated_call_is_rejected(client: TestClient, fake_provider: FakeProvider, path: str, body: dict) -> None:
    r = client.post(path, json=body)
    assert r.status_code in (401, 403)
    assert fake_provider.calls == []


# --- Extract ----------------------------------------------------------------


def test_extract_returns_structured_profile(client: TestClient, fake_provider: FakeProvider) -> None:
    r = client.post("/api/ai/profile/extract", json=_extract_body(), headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["profile"] == {"age": 19, "caste_category": "SC"}
    assert data["missing"] == ["gender"]
    assert data["followup_questions"][0]["key"] == "gender"
    assert data["used_fallback"] is False


def test_extract_redacts_sensitive_numbers_before_provider(client: TestClient, fake_provider: FakeProvider) -> None:
    text = "Contact 9876543210, I am 19 years old"
    client.post("/api/ai/profile/extract", json=_extract_body(text=text), headers=AUTH)
    _, sent_text, _ = fake_provider.calls[0]
    assert "9876543210" not in sent_text
    assert "[REDACTED_PHONE]" in sent_text


# --- Follow-ups -------------------------------------------------------------


def test_followups_returns_questions(client: TestClient, fake_provider: FakeProvider) -> None:
    r = client.post(
        "/api/ai/follow-ups",
        json={"missing": ["age", "district"], "language": "en"},
        headers=AUTH,
    )
    assert r.status_code == 200
    assert r.json()["questions"] == ["Question about age?", "Question about district?"]


def test_followups_rejects_unknown_profile_key(client: TestClient, fake_provider: FakeProvider) -> None:
    r = client.post("/api/ai/follow-ups", json={"missing": ["secret_field"]}, headers=AUTH)
    assert r.status_code == 422


# --- Conversational chat ----------------------------------------------------


def test_chat_returns_grounded_reply_and_extracted_profile(
    client: TestClient, fake_provider: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_routes, "_load_chat_context", lambda _scheme_id: {"schemes": [{"name": "Synthetic Scheme"}]})
    r = client.post(
        "/api/ai/chat",
        json={
            "message": "I am 19. What documents do I need?",
            "language": "en",
            "profile": {"district": "Warangal", "untrusted": "drop me"},
            "history": [{"role": "user", "content": "Hello"}],
        },
        headers=AUTH,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["intent"] == "both"
    assert data["profile"] == {"district": "Warangal", "age": 19}
    assert "untrusted" not in data["profile"]
    assert "official source" in data["reply"]
    assert any(item["key"] == "annual_family_income_inr" for item in data["followup_questions"])


def test_chat_redacts_sensitive_message_and_history(
    client: TestClient, fake_provider: FakeProvider, monkeypatch: pytest.MonkeyPatch
) -> None:
    monkeypatch.setattr(ai_routes, "_load_chat_context", lambda _scheme_id: {"schemes": []})
    r = client.post(
        "/api/ai/chat",
        json={
            "message": "My phone is 9876543210",
            "history": [{"role": "user", "content": "Aadhaar 1234 5678 9012"}],
        },
        headers=AUTH,
    )
    assert r.status_code == 200
    _, payload, _ = fake_provider.calls[-1]
    assert "9876543210" not in payload["message"]
    assert "1234 5678 9012" not in payload["history"][0]["content"]


# --- Explanations (trusted engine outcome) ----------------------------------


def test_explanation_uses_server_computed_outcome(
    client: TestClient,
    fake_provider: FakeProvider,
    scheme_db: None,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_evaluate(status, scheme_version_id, rules, profile):
        return SchemeEvaluation(
            scheme_version_id=scheme_version_id,
            outcome=engine.NOT_ELIGIBLE,
            rule_results=[
                RuleResult(
                    rule_label="Income limit",
                    result="FAIL",
                    missing_attributes=[],
                    explanation="Income is above the limit.",
                )
            ],
            missing_attributes=[],
            reason="synthetic",
        )

    monkeypatch.setattr(engine, "evaluate_scheme", fake_evaluate)

    # The client tries to claim a favourable outcome. It must be rejected, and the
    # provider must still see the server-computed NOT_ELIGIBLE.
    r = client.post(
        "/api/ai/explanations",
        json={
            "scheme_version_id": str(SCHEME_ID),
            "profile": {"annual_family_income_inr": 50000},
            "language": "en",
        },
        headers=AUTH,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["outcome"] == "NOT_ELIGIBLE"
    assert data["rule_results"][0]["rule_label"] == "Income limit"

    kind, result, language = fake_provider.calls[-1]
    assert kind == "explain"
    assert result["outcome"] == "NOT_ELIGIBLE"
    assert result["scheme_name"] == "Synthetic Scheme"
    assert language == "en"


def test_explanation_rejects_client_supplied_outcome(
    client: TestClient, fake_provider: FakeProvider, scheme_db: None
) -> None:
    r = client.post(
        "/api/ai/explanations",
        json={"scheme_version_id": str(SCHEME_ID), "profile": {}, "outcome": "LIKELY_ELIGIBLE"},
        headers=AUTH,
    )
    assert r.status_code == 422
    assert fake_provider.calls == []


def test_explanation_unknown_scheme_returns_404(
    client: TestClient, fake_provider: FakeProvider, scheme_db: None
) -> None:
    r = client.post(
        "/api/ai/explanations",
        json={"scheme_version_id": str(uuid.uuid4()), "profile": {}},
        headers=AUTH,
    )
    assert r.status_code == 404


# --- Extra keys rejected (422) ----------------------------------------------


@pytest.mark.parametrize(
    ("path", "body"),
    [
        ("/api/ai/profile/extract", _extract_body(role="admin")),
        ("/api/ai/follow-ups", {"missing": ["age"], "role": "admin"}),
        ("/api/ai/explanations", {"scheme_version_id": str(SCHEME_ID), "profile": {}, "role": "admin"}),
    ],
)
def test_extra_keys_rejected(client: TestClient, fake_provider: FakeProvider, path: str, body: dict) -> None:
    r = client.post(path, json=body, headers=AUTH)
    assert r.status_code == 422
    assert fake_provider.calls == []


def test_text_over_limit_rejected(client: TestClient, fake_provider: FakeProvider) -> None:
    r = client.post("/api/ai/profile/extract", json=_extract_body(text="a" * 2001), headers=AUTH)
    assert r.status_code == 422


# --- Deterministic fallback (no AI configured) -------------------------------


@pytest.fixture
def no_ai_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("AI_PROVIDER", "")
    monkeypatch.setenv("AI_API_KEY", "")
    monkeypatch.setenv("AI_BASE_URL", "")
    monkeypatch.setenv("GEMINI_API_KEY", "")


def test_deterministic_fallback_extract_returns_200(client: TestClient, no_ai_env: None) -> None:
    r = client.post("/api/ai/profile/extract", json=_extract_body(), headers=AUTH)
    assert r.status_code == 200
    data = r.json()
    assert data["profile"]["age"] == 19
    assert data["profile"]["caste_category"] == "SC"


def test_deterministic_fallback_followups_returns_200(client: TestClient, no_ai_env: None) -> None:
    r = client.post("/api/ai/follow-ups", json={"missing": ["age"], "language": "en"}, headers=AUTH)
    assert r.status_code == 200
    assert r.json()["questions"] == ["What is your age?"]


def test_deterministic_fallback_explanations_returns_200(
    client: TestClient, no_ai_env: None, scheme_db: None, monkeypatch: pytest.MonkeyPatch
) -> None:
    def fake_evaluate(status, scheme_version_id, rules, profile):
        return SchemeEvaluation(
            scheme_version_id=scheme_version_id,
            outcome=engine.NEED_MORE_INFORMATION,
            rule_results=[],
            missing_attributes=["age"],
            reason="synthetic",
        )

    monkeypatch.setattr(engine, "evaluate_scheme", fake_evaluate)
    r = client.post(
        "/api/ai/explanations",
        json={"scheme_version_id": str(SCHEME_ID), "profile": {}, "language": "en"},
        headers=AUTH,
    )
    assert r.status_code == 200
    data = r.json()
    assert data["outcome"] == "NEED_MORE_INFORMATION"
    assert "Synthetic Scheme" in data["explanation"]
    assert data["used_fallback"] is False
