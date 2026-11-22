"""Tests for app.ai: redaction, provider selection/fallback, extraction, explanations.

No network and no database. httpx.post is monkeypatched where a remote call
would otherwise happen.
"""

import re

import pytest

from app.ai import provider as provider_module
from app.ai.explain import build_explanation
from app.ai.extraction import extract_profile_deterministic
from app.ai.provider import DeterministicProvider, HttpProvider, get_provider
from app.ai.redaction import contains_sensitive_id, redact

TELUGU_RANGE = re.compile(r"[\u0C00-\u0C7F]")
DIGIT_12_RE = re.compile(r"\d{4}[ -]?\d{4}[ -]?\d{4}")


@pytest.mark.parametrize(
    "raw",
    ["123456789012", "1234 5678 9012", "1234-5678-9012"],
)
def test_redacts_aadhaar_in_three_forms(raw):
    text = f"my id is {raw} ok"
    assert contains_sensitive_id(text)
    out = redact(text)
    assert "[REDACTED_ID]" in out
    assert raw not in out
    assert not contains_sensitive_id(out)


def test_redacts_pan():
    out = redact("PAN ABCDE1234F here")
    assert "ABCDE1234F" not in out
    assert "[REDACTED_ID]" in out


def test_redacts_indian_mobile():
    out = redact("call 9876543210 today")
    assert "9876543210" not in out
    assert "[REDACTED_PHONE]" in out


def test_telugu_text_passes_through_unchanged():
    text = "నా వయస్సు 19 ఏళ్ళు"
    assert redact(text) == text
    assert not contains_sensitive_id(text)


def test_get_provider_defaults_to_deterministic(monkeypatch):
    monkeypatch.delenv("AI_PROVIDER", raising=False)
    monkeypatch.delenv("AI_API_KEY", raising=False)
    monkeypatch.delenv("AI_BASE_URL", raising=False)
    assert isinstance(get_provider(), DeterministicProvider)

    monkeypatch.setenv("AI_PROVIDER", "http")
    assert isinstance(get_provider(), DeterministicProvider)


def test_http_provider_exception_falls_back(monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("network down")

    monkeypatch.setattr(provider_module.httpx, "post", boom)
    p = HttpProvider("test-key", "https://ai.example.invalid/v1")
    result = p.extract_profile("I am 19 years old", "en")
    assert p.last_used_fallback is True
    assert result["profile"]["age"] == 19


def test_http_payload_contains_no_aadhaar(monkeypatch):
    captured = {}

    class FakeResponse:
        status_code = 500

        def json(self):
            return {}

    def fake_post(url, **kwargs):
        captured.update(kwargs)
        return FakeResponse()

    monkeypatch.setattr(provider_module.httpx, "post", fake_post)
    p = HttpProvider("test-key", "https://ai.example.invalid/v1")
    p.extract_profile("Aadhaar 1234 5678 9012, I am 19 years old", "en")

    body = captured["content"].decode("utf-8")
    assert not DIGIT_12_RE.search(body)
    assert "1234 5678 9012" not in body
    assert p.last_used_fallback is True


def test_http_success_path_is_not_fallback(monkeypatch):
    class FakeResponse:
        status_code = 200

        def json(self):
            return {
                "result": {
                    "profile": {"age": 21},
                    "missing": [],
                    "followup_questions": [],
                }
            }

    monkeypatch.setattr(provider_module.httpx, "post", lambda *a, **k: FakeResponse())
    p = HttpProvider("test-key", "https://ai.example.invalid/v1")
    result = p.extract_profile("I am 21", "en")
    assert p.last_used_fallback is False
    assert result["profile"]["age"] == 21


def test_english_extraction_example():
    text = "I am 19 years old, family income 1.5 lakh, SC, female, from Warangal, final year degree"
    result = extract_profile_deterministic(text, "en")
    profile = result["profile"]
    assert profile["age"] == 19
    assert profile["annual_family_income_inr"] == 150000
    assert profile["caste_category"] == "SC"
    assert profile["gender"] == "female"
    assert profile["district"] == "Warangal"
    assert profile["course_level"] == "undergraduate"
    assert result["missing"] == []
    assert result["followup_questions"] == []


def test_telugu_digits_give_age():
    result = extract_profile_deterministic("౧౯ ఏళ్ళు", "te")
    assert result["profile"]["age"] == 19


def test_missing_keys_produce_en_and_te_followups():
    result = extract_profile_deterministic("I am 19 years old", "en")
    assert "caste_category" in result["missing"]
    assert "age" not in result["missing"]
    keys = {q["key"] for q in result["followup_questions"]}
    assert keys == set(result["missing"])
    for question in result["followup_questions"]:
        assert question["en"]
        assert TELUGU_RANGE.search(question["te"])

    followups_te = DeterministicProvider().generate_followups(["age"], "te")
    assert followups_te and TELUGU_RANGE.search(followups_te[0])


def test_explain_telugu_contains_telugu_and_only_listed_content():
    result = {
        "outcome": "LIKELY_ELIGIBLE",
        "scheme_name": "Test Scheme",
        "rule_results": [
            {
                "rule_label": "Income limit",
                "result": "PASS",
                "explanation": "Income is within the limit.",
            }
        ],
    }
    text = build_explanation(result, "te")
    assert TELUGU_RANGE.search(text)
    assert "Test Scheme" in text
    assert "Income is within the limit." in text
    assert "official portal" not in text  # Telugu disclaimer replaces the English one
    assert "Final eligibility" not in text


def test_explain_rejects_unknown_outcome_and_language():
    with pytest.raises(ValueError):
        build_explanation({"outcome": "MAYBE", "scheme_name": "X", "rule_results": []}, "en")
    with pytest.raises(ValueError):
        build_explanation({"outcome": "UNVERIFIED", "scheme_name": "X", "rule_results": []}, "fr")
