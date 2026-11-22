"""Student profile schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel

AttributeValue = str | int | float | bool | None | list[str]


class StudentProfileIn(BaseModel):
    """Writable student profile. Keys come from the profile attribute registry (TBD)."""

    attributes: dict[str, AttributeValue] = {}
    preferred_language: Literal["en", "te"] | None = None


class StudentProfileOut(StudentProfileIn):
    """Stored student profile."""

    id: uuid.UUID
    updated_at: datetime
