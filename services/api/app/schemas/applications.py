"""Application tracking schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field

ApplicationStatus = Literal[
    "not_started",
    "in_progress",
    "submitted_on_portal",
    "reported_result",
    "withdrawn",
]


class ApplicationCreate(BaseModel):
    """Start tracking an application for a scheme version."""

    scheme_version_id: uuid.UUID
    status: ApplicationStatus = "not_started"


class ApplicationUpdate(BaseModel):
    """Tracking is self-reported."""

    status: ApplicationStatus | None = None
    portal_reference: str | None = Field(None, max_length=100)


class ApplicationOut(BaseModel):
    """Stored application tracking record."""

    id: uuid.UUID
    scheme_version_id: uuid.UUID
    status: ApplicationStatus
    portal_reference: str | None = None
    status_updated_at: datetime
