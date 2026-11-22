"""Admin scheme version and source verification request schemas.

All request models forbid unknown fields. The verifying admin is never taken
from the request body; it comes from the authenticated AdminUser context.
"""

from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field


class VersionCreateRequest(BaseModel):
    """Create a new draft scheme version for an academic year (YYYY-YY)."""

    model_config = ConfigDict(extra="forbid")

    academic_year: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}$")


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
