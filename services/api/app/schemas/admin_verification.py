"""Admin scheme version and source verification request schemas.

All request models forbid unknown fields. The verifying admin is never taken
from the request body; it comes from the authenticated AdminUser context.
"""

from __future__ import annotations

from datetime import date
from typing import Any, Literal
import uuid

from pydantic import BaseModel, ConfigDict, Field, model_validator


class SourceCreateRequest(BaseModel):
    """Attach an official government source to a scheme version's scheme."""

    model_config = ConfigDict(extra="forbid")

    official_url: str = Field(min_length=9, max_length=2000, pattern=r"^https://")
    issuing_authority: str = Field(min_length=1, max_length=200)
    notes: str | None = Field(None, max_length=1000)


class ReasonRequest(BaseModel):
    """Reason text for a rejection."""

    model_config = ConfigDict(extra="forbid")

    reason: str = Field(min_length=1, max_length=1000)


class VersionContentUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    benefit_summary: str | None = Field(None, max_length=5000)
    deadline_text: str | None = Field(None, max_length=2000)
    application_start_date: date | None = None
    application_end_date: date | None = None

    @model_validator(mode="after")
    def dates_in_order(self) -> "VersionContentUpdate":
        if self.application_start_date and self.application_end_date:
            if self.application_start_date > self.application_end_date:
                raise ValueError("application_start_date must not be after application_end_date")
        return self


class RequiredDocumentCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    document_name: str = Field(min_length=1, max_length=300)
    document_kind: str = Field(default="other", min_length=1, max_length=100)
    is_mandatory: bool = True
    source_id: uuid.UUID | None = None


class EligibilityCriterionCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    attribute: str = Field(pattern=r"^[a-z][a-z0-9_]*$")
    operator: Literal["eq", "neq", "lt", "lte", "gt", "gte", "in", "not_in", "between", "is_set"]
    value: Any = None
    source_id: uuid.UUID

    @model_validator(mode="after")
    def validate_value(self) -> "EligibilityCriterionCreate":
        if self.operator == "is_set":
            return self
        if self.operator in ("in", "not_in"):
            if not isinstance(self.value, list) or not self.value:
                raise ValueError("in operators require a non-empty list")
        elif self.operator == "between":
            if (
                not isinstance(self.value, list)
                or len(self.value) != 2
                or not all(isinstance(item, (int, float)) and not isinstance(item, bool) for item in self.value)
                or self.value[0] > self.value[1]
            ):
                raise ValueError("between requires two ordered numbers")
        elif not isinstance(self.value, (str, int, float)) or isinstance(self.value, bool):
            raise ValueError("comparison operators require a string or number")
        return self
