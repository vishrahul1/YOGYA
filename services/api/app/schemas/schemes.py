"""Scheme discovery and detail schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class DiscoveryQuery(BaseModel):
    """Query parameters for scheme discovery."""

    limit: int = Field(20, ge=1, le=100)
    offset: int = Field(0, ge=0)
    q: str | None = Field(None, max_length=200)


class SchemeSummary(BaseModel):
    """Scheme card. Guests only ever see published schemes."""

    id: uuid.UUID
    slug: str
    name: str
    status: Literal["published"]
    issuing_body: str | None = None


class SchemeVersionSummary(BaseModel):
    """One academic-year version of a scheme."""

    id: uuid.UUID
    academic_year: str = Field(pattern=r"^\d{4}-\d{2}$")
    status: Literal["draft", "in_review", "verified", "published", "retired"]
    verified_at: datetime | None = None
    published_at: datetime | None = None
    official_url: str | None = None


class SchemeDetail(SchemeSummary):
    """Scheme with its versions."""

    versions: list[SchemeVersionSummary] = []
