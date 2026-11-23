"""Admin scheme review and publication schemas."""

import uuid
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

SchemeReviewAction = Literal["submitted_for_review", "verified", "rejected"]


class SchemeCreateRequest(BaseModel):
    """Admin request to create a catalogue scheme. Created as status 'draft' only."""

    slug: str = Field(min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$")
    name: str = Field(min_length=1, max_length=200)
    issuing_body: str | None = Field(None, max_length=200)
    academic_year: str = Field(pattern=r"^[0-9]{4}-[0-9]{2}$")


class ImportUrlRequest(BaseModel):
    """Admin request to create a candidate scheme from an official URL. No fetch is made."""

    model_config = ConfigDict(extra="forbid")

    official_url: str = Field(
        min_length=1, max_length=2000, pattern=r"^https://[^/\s]+\S*$"
    )
    name: str | None = Field(None, min_length=1, max_length=200)
    issuing_body: str | None = Field(None, max_length=200)


class SchemeUpdateRequest(BaseModel):
    """Admin partial update of a catalogue scheme. Status cannot be changed here."""

    model_config = ConfigDict(extra="forbid")

    slug: str | None = Field(
        None, min_length=1, max_length=100, pattern=r"^[a-z0-9]+(?:-[a-z0-9]+)*$"
    )
    name: str | None = Field(None, min_length=1, max_length=200)
    issuing_body: str | None = Field(None, max_length=200)

    @model_validator(mode="after")
    def _reject_null_required(self) -> "SchemeUpdateRequest":
        for field in ("slug", "name"):
            if field in self.model_fields_set and getattr(self, field) is None:
                raise ValueError(f"{field} cannot be null")
        return self


class SchemeReviewRequest(BaseModel):
    """Admin review action on a scheme version."""

    action: SchemeReviewAction
    note: str | None = Field(None, max_length=1000)


class SchemePublishRequest(BaseModel):
    """Publication requires verification date and official source (PRD; DB constraint)."""

    scheme_version_id: uuid.UUID
    verified_at: datetime
    source_id: uuid.UUID


class PublishResponse(BaseModel):
    """Result of publishing a scheme version."""

    scheme_version_id: uuid.UUID
    status: Literal["published"]
    published_at: datetime
