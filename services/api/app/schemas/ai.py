"""AI route schemas.

Requests are strict (extra keys rejected) and length-limited. Input text is
redacted in the route before any provider call. Eligibility outcomes are never
accepted from the client; they are computed by the deterministic engine.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.ai.extraction import REQUIRED_KEYS

MAX_TEXT_CHARS = 2000
MAX_MISSING_KEYS = 10
MAX_KEY_CHARS = 64
MAX_HISTORY_MESSAGES = 10
MAX_REPLY_CHARS = 4000

Language = Literal["en", "te"]
EngineOutcome = Literal["LIKELY_ELIGIBLE", "NOT_ELIGIBLE", "NEED_MORE_INFORMATION", "UNVERIFIED"]


class ProfileExtractRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    language: Language = "en"


class FollowupQuestion(BaseModel):
    key: str
    en: str
    te: str


class ProfileExtractResponse(BaseModel):
    profile: dict[str, Any]
    missing: list[str]
    followup_questions: list[FollowupQuestion]
    used_fallback: bool


class FollowUpsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    missing: list[Annotated[str, Field(min_length=1, max_length=MAX_KEY_CHARS)]] = Field(
        min_length=1, max_length=MAX_MISSING_KEYS
    )
    language: Language = "en"

    @field_validator("missing")
    @classmethod
    def _known_keys_only(cls, value: list[str]) -> list[str]:
        unknown = [key for key in value if key not in REQUIRED_KEYS]
        if unknown:
            raise ValueError("missing contains unknown profile keys")
        return value


class FollowUpsResponse(BaseModel):
    questions: list[str]
    used_fallback: bool


class ChatHistoryMessage(BaseModel):
    model_config = ConfigDict(extra="forbid")

    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)


class ChatRequest(BaseModel):
    """One conversational turn. Eligibility outcomes are never accepted."""

    model_config = ConfigDict(extra="forbid")

    message: str = Field(min_length=1, max_length=MAX_TEXT_CHARS)
    language: Language = "en"
    scheme_version_id: uuid.UUID | None = None
    profile: dict[str, Any] = Field(default_factory=dict)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=MAX_HISTORY_MESSAGES)


class ChatResponse(BaseModel):
    reply: str = Field(min_length=1, max_length=MAX_REPLY_CHARS)
    intent: Literal["profile", "question", "both", "unsupported"]
    profile: dict[str, Any]
    missing: list[str]
    followup_questions: list[FollowupQuestion]
    used_fallback: bool


class ExplanationRequest(BaseModel):
    """Only the scheme and profile are accepted. No outcome field is allowed."""

    model_config = ConfigDict(extra="forbid")

    scheme_version_id: uuid.UUID
    profile: dict[str, Any] = Field(default_factory=dict)
    language: Language = "en"


class ExplanationRuleResult(BaseModel):
    rule_label: str
    result: str
    explanation: str


class ExplanationResponse(BaseModel):
    scheme_version_id: uuid.UUID
    outcome: EngineOutcome
    explanation: str
    rule_results: list[ExplanationRuleResult]
    used_fallback: bool
