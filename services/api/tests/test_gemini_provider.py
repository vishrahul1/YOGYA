"""Mocked tests for the Gemini provider. No network, no paid calls.

Every test runs with an autouse guard that makes any unmocked httpx.post fail.
Per-test fakes record (url, headers, json, timeout) into a list.
"""

from __future__ import annotations

import json
import re

import httpx
import pytest

from app.ai.gemini import GeminiProvider
from app.ai.provider import DeterministicProvider, get_provider

FAKE_KEY = "test-key-123"

SYNTHETIC_RESULT = {
    "outcome": "LIKELY_ELIGIBLE",
    "scheme_name": "Synthetic Test Scheme",
    "rule_results": [
        {
            "rule_label": "Income limit",
            "result": "PASS",
            "explanation": "Income is within limit.",
        }
    ],
}

VALID_EXTRACTION_TEXT = (
    '{"age": 19, "annual_family_income_inr": 150000, "caste_category": "SC", '
    '"gender": "female", "district": "Warangal", "course_level": "undergraduate"}'
)


class FakeResponse:
    """Minimal stand-in for httpx.Response."""

    def __init__(self, status_code=200, body=None, text=""):
        self.status_code = status_code
        self._body = body
        self.text = text

    def json(self):
        if self._body is None:
            raise ValueError("no JSON body")
        return self._body


def _gemini_body(text: str) -> dict:
    return {"candidates": [{"content": {"parts": [{"text": text}]}}]}


@pytest.fixture(autouse=True)
def block_live_network(monkeypatch):
    """Any httpx.post that is not replaced by a test fake fails loudly."""

    def _blocked(*args, **kwargs):
        raise RuntimeError("live network blocked in tests")

    monkeypatch.setattr(httpx, "post", _blocked)


@pytest.fixture
def calls(monkeypatch):
    """Install a recording fake for httpx.post. Set fake.response or fake.error."""
    recorded: list = []

    class _Fake:
        response = FakeResponse(200, _gemini_body(VALID_EXTRACTION_TEXT))
        error = None

    fake = _Fake()

    def _post(url, headers=None, json=None, timeout=None, **kwargs):
        recorded.append((url, headers, json, timeout))
        if fake.error is not None:
            raise fake.error
        return fake.response

    monkeypatch.setattr(httpx, "post", _post)
    fake.recorded = recorded
    return fake


@pytest.fixture
def clean_env(monkeypatch):
    monkeypatch.setenv("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
    monkeypatch.setenv("SUPABASE_URL", "https://example.supabase.co")
    for name in ("AI_PROVIDER", "GEMINI_API_KEY", "AI_API_KEY", "AI_BASE_URL"):
        monkeypatch.setenv(name, "")
    return monkeypatch


def _provider() -> GeminiProvider:
    return GeminiProvider(api_key=FAKE_KEY, model="gemini-2.5-flash", timeout=5.0)


# ----------------------------------------------------------- provider selection


def test_get_provider_without_env_returns_deterministic(clean_env):
    provider = get_provider()
    assert not isinstance(provider, GeminiProvider)
    assert isinstance(provider, DeterministicProvider)


def test_get_provider_gemini_env_returns_gemini(clean_env):
    clean_env.setenv("AI_PROVIDER", "gemini")
    clean_env.setenv("GEMINI_API_KEY", "test-key-123")
    assert isinstance(get_provider(), GeminiProvider)


# ------------------------------------------------------------------ extraction


def test_extraction_success_returns_profile(calls):
    calls.response = FakeResponse(200, _gemini_body(VALID_EXTRACTION_TEXT))
    provider = _provider()
    result = provider.extract_profile("I am 19 from Warangal", "en")
    assert result["profile"]["age"] == 19
    assert provider.last_used_fallback is False


def test_extraction_invalid_json_falls_back(calls):
    calls.response = FakeResponse(200, _gemini_body("this is not json {"))
    provider = _provider()
    result = provider.extract_profile("I am 19 from Warangal", "en")
    assert provider.last_used_fallback is True
    assert result is not None


def test_extraction_schema_violation_falls_back(calls):
    calls.response = FakeResponse(200, _gemini_body('{"age": 500}'))
    provider = _provider()
    result = provider.extract_profile("I am 19 from Warangal", "en")
    assert provider.last_used_fallback is True
    assert result is not None


def test_extraction_http_429_falls_back_without_exception(calls):
    calls.response = FakeResponse(429, None, "rate limited")
    provider = _provider()
    result = provider.extract_profile("I am 19 from Warangal", "en")
    assert provider.last_used_fallback is True
    assert result is not None


def test_extraction_http_500_falls_back(calls):
    calls.response = FakeResponse(500, None, "server error")
    provider = _provider()
    provider.extract_profile("I am 19 from Warangal", "en")
    assert provider.last_used_fallback is True


def test_extraction_timeout_falls_back(calls):
    calls.error = httpx.TimeoutException("synthetic timeout")
    provider = _provider()
    provider.extract_profile("I am 19 from Warangal", "en")
    assert provider.last_used_fallback is True


# ------------------------------------------------------------ privacy and auth


def test_aadhaar_never_appears_in_payload(calls):
    provider = _provider()
    provider.extract_profile("My Aadhaar is 1234 5678 9012, I am 19", "en")
    serialised = "".join(json.dumps(payload) for _, _, payload, _ in calls.recorded)
    assert "123456789012" not in serialised
    assert "1234 5678 9012" not in serialised
    assert re.search(r"\d{12}", serialised) is None


def test_api_key_only_in_header(calls):
    provider = _provider()
    provider.extract_profile("I am 19 from Warangal", "en")
    assert calls.recorded, "expected one captured request"
    url, headers, payload, _ = calls.recorded[0]
    assert headers["x-goog-api-key"] == FAKE_KEY
    assert FAKE_KEY not in url
    assert FAKE_KEY not in json.dumps(payload)
    assert FAKE_KEY not in repr(provider)


# ------------------------------------------------------------------ follow-ups


def test_followups_non_json_returns_deterministic_questions(calls):
    calls.response = FakeResponse(200, _gemini_body("plain text, not JSON"))
    provider = _provider()
    questions = provider.generate_followups(["age", "district"], "en")
    assert len(questions) >= 1
    assert all(isinstance(q, str) and q.strip() for q in questions)
    assert provider.last_used_fallback is True


# ----------------------------------------------------------------------- chat


def test_chat_returns_reply_and_profile_in_one_call(calls):
    calls.response = FakeResponse(
        200,
        _gemini_body('{"reply":"The deadline is not available in the verified context.","intent":"both","profile":{"age":19}}'),
    )
    provider = _provider()
    result = provider.chat("I am 19. When is the deadline?", "en", {"schemes": []}, {}, [])
    assert result["profile"]["age"] == 19
    assert result["intent"] == "both"
    assert "not available" in result["reply"]
    assert len(calls.recorded) == 1


def test_chat_invalid_response_uses_safe_fallback(calls):
    calls.response = FakeResponse(200, _gemini_body("not json"))
    provider = _provider()
    result = provider.chat("Which scholarship can I apply for?", "en", {"schemes": []}, {}, [])
    assert provider.last_used_fallback is True
    assert result["reply"]


# ------------------------------------------------------------------ explanation


def test_explain_bogus_outcome_raises_and_makes_no_call(calls):
    provider = _provider()
    bogus = dict(SYNTHETIC_RESULT, outcome="BOGUS")
    with pytest.raises(ValueError):
        provider.explain(bogus, "en")
    assert calls.recorded == []


def test_explain_missing_disclaimer_uses_fallback(calls):
    calls.response = FakeResponse(200, _gemini_body("Some plain text without the notice."))
    provider = _provider()
    output = provider.explain(SYNTHETIC_RESULT, "en")
    assert "Final eligibility is confirmed on the official portal." in output
    assert provider.last_used_fallback is True


def test_explain_deterministic_telugu_has_telugu_characters():
    output = DeterministicProvider().explain(SYNTHETIC_RESULT, "te")
    assert any("\u0c00" <= ch <= "\u0c7f" for ch in output)
