"""Shared primitive types for YOGYA API schemas."""

import uuid
from typing import Literal

from pydantic import BaseModel, Field

UUIDStr = uuid.UUID

OutcomeLiteral = Literal["PASS", "FAIL", "UNKNOWN"]


class Page(BaseModel):
    """Generic-free page wrapper; items are untyped dicts for now."""

    items: list[dict]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
