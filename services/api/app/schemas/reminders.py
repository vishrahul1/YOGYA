"""Reminder schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


class ReminderIn(BaseModel):
    """Create a reminder."""

    remind_at: datetime
    message: str = Field(min_length=1, max_length=500)
    application_id: uuid.UUID | None = None


DeliveryState = Literal["pending", "sent", "failed", "cancelled"]


class ReminderOut(ReminderIn):
    """Stored reminder with delivery state."""

    id: uuid.UUID
    delivery_state: DeliveryState
