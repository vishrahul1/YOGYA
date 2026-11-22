"""AI provider abstraction.

AI is used only for profile extraction, follow-up questions and explanations.
Input text is redacted before any external call. Any HTTP failure falls back
to the deterministic provider. The API key is never logged.
"""

import json
import logging
import os
from abc import ABC, abstractmethod

import httpx

from app.ai.explain import build_explanation
from app.ai.extraction import FOLLOWUP_TEMPLATES, extract_profile_deterministic
from app.ai.redaction import contains_sensitive_id, redact

logger = logging.getLogger(__name__)

HTTP_TIMEOUT_SECONDS = 10


class AIProvider(ABC):
    """Interface for AI-backed helpers. `last_used_fallback` records fallbacks."""

    last_used_fallback: bool = False

    @abstractmethod
    def extract_profile(self, text: str, language: str) -> dict:
        """Return the extraction result dict (profile, missing, followup_questions)."""

    @abstractmethod
    def generate_followups(self, missing: list[str], language: str) -> list[str]:
        """Return follow-up question strings for the missing keys."""

    @abstractmethod
    def explain(self, result: dict, language: str) -> str:
        """Return a grounded explanation string."""


def _check_language(language: str) -> None:
    if language not in ("en", "te"):
        raise ValueError(f"Unsupported language: {language!r}")


class DeterministicProvider(AIProvider):
    """Always available, no network. Delegates to extraction and explain modules."""

    def __init__(self) -> None:
        self.last_used_fallback = False

    def extract_profile(self, text: str, language: str) -> dict:
        _check_language(language)
        self.last_used_fallback = False
        return extract_profile_deterministic(text, language)

    def generate_followups(self, missing: list[str], language: str) -> list[str]:
        _check_language(language)
        self.last_used_fallback = False
        return [FOLLOWUP_TEMPLATES[key][language] for key in missing if key in FOLLOWUP_TEMPLATES]

    def explain(self, result: dict, language: str) -> str:
        self.last_used_fallback = False
        return build_explanation(result, language)


class HttpProvider(AIProvider):
    """Remote AI provider. Falls back to DeterministicProvider on any failure."""

    def __init__(self, api_key: str, base_url: str) -> None:
        self._api_key = api_key
        self._base_url = base_url
        self._fallback = DeterministicProvider()
        self.last_used_fallback = False

    def _post(self, task: str, language: str, payload: dict) -> dict:
        """POST a redacted JSON body; return the parsed "result" object."""
        body = redact(json.dumps({"task": task, "language": language, "payload": payload}, ensure_ascii=False))
        if contains_sensitive_id(body):
            raise ValueError("Sensitive identifier present after redaction; request refused")
        response = httpx.post(
            self._base_url,
            content=body.encode("utf-8"),
            headers={
                "Authorization": f"Bearer {self._api_key}",
                "Content-Type": "application/json; charset=utf-8",
            },
            timeout=HTTP_TIMEOUT_SECONDS,
        )
        if response.status_code != 200:
            raise RuntimeError(f"AI provider returned status {response.status_code}")
        result = response.json().get("result")
        if not isinstance(result, dict):
            raise RuntimeError("AI provider returned an unexpected shape")
        return result

    def extract_profile(self, text: str, language: str) -> dict:
        _check_language(language)
        try:
            result = self._post("extract_profile", language, {"text": redact(text)})
            self.last_used_fallback = False
            return result
        except Exception:
            logger.warning("AI extract_profile failed; using deterministic fallback")
            self.last_used_fallback = True
            return self._fallback.extract_profile(text, language)

    def generate_followups(self, missing: list[str], language: str) -> list[str]:
        _check_language(language)
        try:
            result = self._post("generate_followups", language, {"missing": list(missing)})
            questions = result.get("questions")
            if not isinstance(questions, list) or not all(isinstance(q, str) for q in questions):
                raise RuntimeError("AI provider returned an unexpected shape")
            self.last_used_fallback = False
            return questions
        except Exception:
            logger.warning("AI generate_followups failed; using deterministic fallback")
            self.last_used_fallback = True
            return self._fallback.generate_followups(missing, language)

    def explain(self, result: dict, language: str) -> str:
        _check_language(language)
        try:
            response = self._post("explain", language, {"result": result})
            text = response.get("text")
            if not isinstance(text, str):
                raise RuntimeError("AI provider returned an unexpected shape")
            self.last_used_fallback = False
            return text
        except Exception:
            logger.warning("AI explain failed; using deterministic fallback")
            self.last_used_fallback = True
            return self._fallback.explain(result, language)


def get_provider() -> AIProvider:
    """Select the provider from AI_PROVIDER, AI_API_KEY and AI_BASE_URL.

    HttpProvider is used only when AI_PROVIDER is "http" and both key and URL
    are set. Otherwise the deterministic provider is returned.
    """
    provider_name = os.getenv("AI_PROVIDER", "").strip().lower()
    api_key = os.getenv("AI_API_KEY", "").strip()
    base_url = os.getenv("AI_BASE_URL", "").strip()
    if provider_name == "http" and api_key and base_url:
        return HttpProvider(api_key, base_url)
    if provider_name == "gemini":
        gemini_key = os.getenv("GEMINI_API_KEY", "").strip()
        if gemini_key:
            # Local import: gemini.py imports this module, so a top-level import would be circular.
            from app.ai.gemini import GeminiProvider

            return GeminiProvider(api_key=gemini_key)
    return DeterministicProvider()
