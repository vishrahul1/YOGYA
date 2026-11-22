"""Google Gemini provider for YOGYA AI features.

Gemini is used only for profile extraction, follow-up questions and
explanation phrasing. Eligibility is decided by the deterministic rules
engine. Every failure path falls back to the deterministic provider.
"""

from __future__ import annotations

import json
import logging
import os
from typing import Any, Literal, Optional

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from app.ai.explain import DISCLAIMER, build_explanation
from app.ai.extraction import extract_profile_deterministic
from app.ai.provider import AIProvider, DeterministicProvider
from app.ai.redaction import contains_sensitive_id, redact

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "gemini-2.5-flash"
DEFAULT_BASE_URL = "https://generativelanguage.googleapis.com/v1beta"
DEFAULT_TIMEOUT_SECONDS = 10.0

VALID_OUTCOMES = frozenset(
    {"LIKELY_ELIGIBLE", "NOT_ELIGIBLE", "NEED_MORE_INFORMATION", "UNVERIFIED"}
)

MAX_EXPLANATION_CHARS = 4000
MAX_FOLLOWUP_CHARS = 300
MAX_FOLLOWUPS = 10


class GeminiExtractionResponse(BaseModel):
    """Validated shape of Gemini's JSON profile extraction output."""

    model_config = ConfigDict(extra="ignore")

    age: Optional[int] = Field(default=None, ge=0, le=120)
    annual_family_income_inr: Optional[int] = Field(default=None, ge=0)
    caste_category: Optional[Literal["SC", "ST", "BC", "OC", "EWS", "MINORITY"]] = None
    gender: Optional[Literal["female", "male", "other"]] = None
    district: Optional[str] = None
    course_level: Optional[Literal["intermediate", "undergraduate", "postgraduate", "other"]] = None
    disability: Optional[bool] = None


class GeminiFollowupResponse(BaseModel):
    """Validated shape of Gemini's follow-up question output."""

    model_config = ConfigDict(extra="ignore")

    questions: list[str] = Field(min_length=1, max_length=MAX_FOLLOWUPS)


class GeminiProvider(AIProvider):
    """AI provider backed by the Gemini generateContent REST API."""

    def __init__(
        self,
        api_key: str,
        model: Optional[str] = None,
        base_url: Optional[str] = None,
        timeout: Optional[float] = None,
    ) -> None:
        self._api_key = api_key
        self.model = model or os.getenv("GEMINI_MODEL") or DEFAULT_MODEL
        self.base_url = (
            base_url or os.getenv("GEMINI_BASE_URL") or DEFAULT_BASE_URL
        ).rstrip("/")
        if timeout is not None:
            self.timeout = float(timeout)
        else:
            self.timeout = float(os.getenv("GEMINI_TIMEOUT_SECONDS") or DEFAULT_TIMEOUT_SECONDS)
        self._fallback = DeterministicProvider()
        self.last_used_fallback = False

    def __repr__(self) -> str:
        return f"GeminiProvider(model={self.model}, key=***)"

    # ------------------------------------------------------------------ HTTP

    def _call(self, prompt: str, expect_json: bool) -> Optional[str]:
        """Send one generateContent request. Returns the text or None on any failure."""
        url = f"{self.base_url}/models/{self.model}:generateContent"
        headers = {
            "x-goog-api-key": self._api_key,
            "Content-Type": "application/json",
        }
        generation_config: dict[str, Any] = {}
        if expect_json:
            generation_config["responseMimeType"] = "application/json"
        payload: dict[str, Any] = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": generation_config,
        }
        try:
            response = httpx.post(
                url, headers=headers, json=payload, timeout=self.timeout
            )
        except httpx.TimeoutException:
            logger.warning("GeminiProvider: %s", "TimeoutException")
            return None
        except httpx.HTTPError as exc:
            logger.warning("GeminiProvider: %s", type(exc).__name__)
            return None
        except Exception as exc:  # noqa: BLE001 - never raise to caller
            logger.warning("GeminiProvider: %s", type(exc).__name__)
            return None

        if response.status_code != 200:
            logger.warning("GeminiProvider: HTTP %s", response.status_code)
            return None

        try:
            body = response.json()
            candidates = body.get("candidates") or []
            if not candidates:
                logger.warning("GeminiProvider: %s", "EmptyCandidates")
                return None
            text = candidates[0]["content"]["parts"][0]["text"]
        except (ValueError, KeyError, IndexError, TypeError, AttributeError):
            logger.warning("GeminiProvider: %s", "MalformedResponse")
            return None

        if not isinstance(text, str) or not text.strip():
            logger.warning("GeminiProvider: %s", "EmptyText")
            return None
        return text

    # --------------------------------------------------------- AIProvider API

    def extract_profile(self, text: str, language: str) -> dict:
        self.last_used_fallback = False
        redacted = redact(text)
        if contains_sensitive_id(redacted):
            self.last_used_fallback = True
            return extract_profile_deterministic(text, language)

        prompt = (
            "Extract a student profile from the text below. The text may be in "
            "Telugu or English. Return ONLY a JSON object with these keys: "
            "age (integer 0-120), annual_family_income_inr (integer >= 0), "
            "caste_category (one of SC, ST, BC, OC, EWS, MINORITY), "
            "gender (one of female, male, other), district (string), "
            "course_level (one of intermediate, undergraduate, postgraduate, other), "
            "disability (boolean). Omit any key not clearly stated; do not guess. "
            "Do not include any identification numbers.\n\nTEXT:\n"
            + redacted
        )
        raw = self._call(prompt, expect_json=True)
        if raw is None:
            self.last_used_fallback = True
            return extract_profile_deterministic(text, language)

        try:
            data = json.loads(raw)
            if not isinstance(data, dict):
                raise ValueError("not an object")
            validated = GeminiExtractionResponse.model_validate(data)
        except (ValueError, ValidationError):
            logger.warning("GeminiProvider: %s", "InvalidExtraction")
            self.last_used_fallback = True
            return extract_profile_deterministic(text, language)

        # Same shape as the deterministic provider: profile / missing / followup_questions.
        base = extract_profile_deterministic(text, language)
        found = {k: v for k, v in validated.model_dump().items() if v is not None}
        profile = {**base.get("profile", {}), **found}
        missing = [k for k in base.get("missing", []) if k not in profile]
        followups = [q for q in base.get("followup_questions", [])]
        return {"profile": profile, "missing": missing, "followup_questions": followups}

    def generate_followups(self, missing: list, language: str) -> list:
        self.last_used_fallback = False
        fallback = self._fallback.generate_followups(missing, language)
        if not missing:
            return fallback

        prompt = (
            "Write short, polite follow-up questions asking a student for the "
            f"following missing information. Language: {language}. "
            "Return ONLY a JSON object of the form {\"questions\": [\"...\"]} "
            "with 1 to 10 questions, each at most 300 characters. "
            "Do not add new requirements or eligibility claims.\n\nMISSING:\n"
            + json.dumps([str(m) for m in missing], ensure_ascii=False)
        )
        raw = self._call(prompt, expect_json=True)
        if raw is None:
            self.last_used_fallback = True
            return fallback

        try:
            data = json.loads(raw)
            validated = GeminiFollowupResponse.model_validate(data)
            questions = [q.strip() for q in validated.questions]
            if not all(q and len(q) <= MAX_FOLLOWUP_CHARS for q in questions):
                raise ValueError("question out of bounds")
        except (ValueError, ValidationError):
            logger.warning("GeminiProvider: %s", "InvalidFollowups")
            self.last_used_fallback = True
            return fallback
        return questions

    def explain(self, result: dict, language: str) -> str:
        self.last_used_fallback = False
        outcome = result.get("outcome")
        if outcome not in VALID_OUTCOMES:
            raise ValueError(f"unsupported outcome: {outcome!r}")

        def _fallback_text() -> str:
            self.last_used_fallback = True
            return build_explanation(result, language)

        rule_results = [
            {
                "rule_label": r.get("rule_label"),
                "result": r.get("result"),
                "explanation": r.get("explanation"),
            }
            for r in (result.get("rule_results") or [])
        ]
        safe_view = {
            "outcome": outcome,
            "scheme_name": result.get("scheme_name"),
            "rule_results": rule_results,
        }
        prompt = (
            f"Rewrite the following eligibility result for a student in language "
            f"'{language}'. Use ONLY the facts provided. Do not add new requirements, "
            "amounts, deadlines or conclusions. Keep the wording of the outcome. "
            "Plain text only.\n\nRESULT:\n"
            + json.dumps(safe_view, ensure_ascii=False, default=str)
        )
        raw = self._call(prompt, expect_json=False)
        if raw is None:
            return _fallback_text()

        text = raw.strip()
        disclaimer = DISCLAIMER.get(language, DISCLAIMER["en"])
        if (
            not text
            or len(text) > MAX_EXPLANATION_CHARS
            or disclaimer not in text
        ):
            logger.warning("GeminiProvider: %s", "InvalidExplanation")
            return _fallback_text()
        return text
