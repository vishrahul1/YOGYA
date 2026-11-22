"""Eligibility evaluation schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from app.schemas.common import OutcomeLiteral

# Scheme-level outcome vocabulary from the product spec (engine.evaluate_scheme).
OverallOutcome = Literal[
    "LIKELY_ELIGIBLE",
    "NOT_ELIGIBLE",
    "NEED_MORE_INFORMATION",
    "UNVERIFIED",
]


class EligibilityRequest(BaseModel):
    """Eligibility request.

    The profile is read from the stored student profile; no inline override.
    """

    model_config = ConfigDict(extra="forbid")

    scheme_version_id: uuid.UUID


class RuleResult(BaseModel):
    """Outcome of one deterministic rule."""

    rule_ref: str
    outcome: OutcomeLiteral
    reason_code: str | None = None


class EligibilityResponse(BaseModel):
    """Overall and per-rule eligibility outcome."""

    scheme_version_id: uuid.UUID
    overall_outcome: OverallOutcome
    rule_results: list[RuleResult] = []
    evaluated_at: datetime
    rule_format_version: int = Field(ge=1)
