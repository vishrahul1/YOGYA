"""Document checklist task schemas."""

import uuid
from datetime import date

from pydantic import BaseModel, Field


class DocumentTaskIn(BaseModel):
    """Create a document checklist task."""

    title: str = Field(min_length=1, max_length=200)
    document_kind: str | None = Field(None, max_length=100)
    due_on: date | None = None


class DocumentTaskUpdate(BaseModel):
    """Update a document checklist task."""

    is_done: bool | None = None
    due_on: date | None = None


class DocumentTaskOut(DocumentTaskIn):
    """Stored document checklist task."""

    id: uuid.UUID
    application_id: uuid.UUID
    is_done: bool
