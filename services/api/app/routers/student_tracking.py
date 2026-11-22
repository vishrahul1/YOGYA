"""Student tracking routes: saved schemes, self-reported applications, document
preparation tasks and reminders (read-only).

Every query is scoped to the caller's own student_profiles row, resolved from the
verified auth context and never from the request body. A row that is missing or
owned by another student returns 404. Application status and portal reference are
SELF-REPORTED and are not verified against any government system.
"""

from __future__ import annotations

import re
import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Response
from psycopg.errors import UniqueViolation
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from app.db import get_connection
from app.routers.access import CurrentUser
from app.schemas.applications import ApplicationStatus

router = APIRouter()

# Self-reported fields that PATCH may change. Names are also the column names;
# never built from user input.
_APPLICATION_UPDATE_COLUMNS: tuple[str, ...] = ("status", "portal_reference")

# Rejects values that look like 12-digit ID numbers (e.g. Aadhaar), with or without
# spaces. Applies to self-reported portal references.
_ID_NUMBER_LIKE = re.compile(r"\d{12}|\d{4}\s\d{4}\s\d{4}")


def _check_portal_reference(value: str | None) -> str | None:
    if value is not None and _ID_NUMBER_LIKE.search(value):
        raise ValueError("portal_reference must not contain ID numbers")
    return value


class SavedSchemeCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    scheme_version_id: uuid.UUID


class ApplicationCreate(BaseModel):
    """Start a self-reported application for a published scheme version."""

    model_config = ConfigDict(extra="forbid")

    scheme_version_id: uuid.UUID
    status: ApplicationStatus = "not_started"
    portal_reference: str | None = Field(None, max_length=100)

    @field_validator("portal_reference")
    @classmethod
    def check_portal_reference(cls, value: str | None) -> str | None:
        return _check_portal_reference(value)


class ApplicationUpdate(BaseModel):
    """Self-reported update. Status cannot be cleared; portal_reference may be cleared."""

    model_config = ConfigDict(extra="forbid")

    status: ApplicationStatus | None = None
    portal_reference: str | None = Field(None, max_length=100)

    @field_validator("portal_reference")
    @classmethod
    def check_portal_reference(cls, value: str | None) -> str | None:
        return _check_portal_reference(value)

    @model_validator(mode="after")
    def _status_not_null(self) -> "ApplicationUpdate":
        if "status" in self.model_fields_set and self.status is None:
            raise ValueError("status cannot be null")
        return self


class DocumentTaskUpdate(BaseModel):
    """Preparation status only."""

    model_config = ConfigDict(extra="forbid")

    is_done: bool


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _owner_profile_id(cur: Any, auth_user_id: uuid.UUID) -> uuid.UUID | None:
    """Return the caller's student_profiles.id, or None if no profile exists."""
    cur.execute(
        """
        SELECT sp.id
          FROM student_profiles AS sp
          JOIN users AS u ON u.id = sp.user_id
         WHERE u.auth_user_id = %s
        """,
        (auth_user_id,),
    )
    row = cur.fetchone()
    return row[0] if row else None


def _application_item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "scheme_version_id": str(row[1]),
        "status": row[2],
        "portal_reference": row[3],
        "status_updated_at": _iso(row[4]),
        "self_reported": True,
    }


def _document_task_item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "application_id": str(row[1]),
        "title": row[2],
        "document_kind": row[3],
        "is_done": row[4],
        "due_on": _iso(row[5]),
        "updated_at": _iso(row[6]),
        "self_reported": True,
    }


# ---------------------------------------------------------------------------
# Saved schemes
# ---------------------------------------------------------------------------


@router.post("/api/student/saved-schemes", status_code=201)
def save_scheme(body: SavedSchemeCreate, ctx: CurrentUser) -> dict[str, Any]:
    try:
        with get_connection() as conn, conn.cursor() as cur:
            profile_id = _owner_profile_id(cur, ctx.auth_user_id)
            if profile_id is None:
                raise HTTPException(status_code=404, detail="Student profile not found")
            cur.execute(
                """
                SELECT v.scheme_id
                  FROM scheme_versions AS v
                 WHERE v.id = %s AND v.status = 'published'
                """,
                (body.scheme_version_id,),
            )
            scheme_row = cur.fetchone()
            if scheme_row is None:
                raise HTTPException(status_code=404, detail="Scheme not found")
            cur.execute(
                """
                INSERT INTO saved_schemes (student_profile_id, scheme_id)
                VALUES (%s, %s)
                RETURNING id, scheme_id, saved_at
                """,
                (profile_id, scheme_row[0]),
            )
            row = cur.fetchone()
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Scheme already saved")
    return {"id": str(row[0]), "scheme_id": str(row[1]), "saved_at": _iso(row[2])}


@router.get("/api/student/saved-schemes")
def list_saved_schemes(ctx: CurrentUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT ss.id, ss.scheme_id, s.name, ss.saved_at
              FROM saved_schemes AS ss
              JOIN student_profiles AS sp ON sp.id = ss.student_profile_id
              JOIN users AS u ON u.id = sp.user_id
              JOIN schemes AS s ON s.id = ss.scheme_id
             WHERE u.auth_user_id = %s
             ORDER BY ss.saved_at, ss.id
            """,
            (ctx.auth_user_id,),
        )
        rows = cur.fetchall()
    return {
        "items": [
            {
                "id": str(r[0]),
                "scheme_id": str(r[1]),
                "scheme_name": r[2],
                "saved_at": _iso(r[3]),
            }
            for r in rows
        ]
    }


@router.delete("/api/student/saved-schemes/{saved_id}", status_code=204)
def delete_saved_scheme(saved_id: uuid.UUID, ctx: CurrentUser) -> Response:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            DELETE FROM saved_schemes AS ss
             WHERE ss.id = %s
               AND ss.student_profile_id = (
                   SELECT sp.id
                     FROM student_profiles AS sp
                     JOIN users AS u ON u.id = sp.user_id
                    WHERE u.auth_user_id = %s
               )
            RETURNING ss.id
            """,
            (saved_id, ctx.auth_user_id),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Saved scheme not found")
    return Response(status_code=204)


# ---------------------------------------------------------------------------
# Applications (self-reported)
# ---------------------------------------------------------------------------


@router.post("/api/student/applications", status_code=201)
def create_application(body: ApplicationCreate, ctx: CurrentUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        profile_id = _owner_profile_id(cur, ctx.auth_user_id)
        if profile_id is None:
            raise HTTPException(status_code=404, detail="Student profile not found")
        cur.execute(
            """
            SELECT v.id
              FROM scheme_versions AS v
             WHERE v.id = %s AND v.status = 'published'
            """,
            (body.scheme_version_id,),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Scheme not found")
        cur.execute(
            """
            INSERT INTO applications (student_profile_id, scheme_version_id, status, portal_reference)
            VALUES (%s, %s, %s, %s)
            RETURNING id, scheme_version_id, status, portal_reference, status_updated_at
            """,
            (profile_id, body.scheme_version_id, body.status, body.portal_reference),
        )
        row = cur.fetchone()
    return _application_item(row)


@router.get("/api/student/applications")
def list_applications(ctx: CurrentUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT a.id, a.scheme_version_id, a.status, a.portal_reference, a.status_updated_at
              FROM applications AS a
              JOIN student_profiles AS sp ON sp.id = a.student_profile_id
              JOIN users AS u ON u.id = sp.user_id
             WHERE u.auth_user_id = %s
             ORDER BY a.created_at, a.id
            """,
            (ctx.auth_user_id,),
        )
        rows = cur.fetchall()
    return {
        "items": [_application_item(r) for r in rows],
        "self_reported": True,
    }


@router.patch("/api/student/applications/{application_id}")
def update_application(
    application_id: uuid.UUID, body: ApplicationUpdate, ctx: CurrentUser
) -> dict[str, Any]:
    changes = body.model_dump(exclude_unset=True)
    fields = [f for f in _APPLICATION_UPDATE_COLUMNS if f in changes]
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    assignments = [f"{col} = %s" for col in fields]
    if "status" in fields:
        assignments.append("status_updated_at = now()")
    set_clause = ", ".join(assignments)

    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            f"""
            UPDATE applications
               SET {set_clause}
             WHERE applications.id = %s
               AND applications.student_profile_id = (
                   SELECT sp.id
                     FROM student_profiles AS sp
                     JOIN users AS u ON u.id = sp.user_id
                    WHERE u.auth_user_id = %s
               )
            RETURNING id, scheme_version_id, status, portal_reference, status_updated_at
            """,
            (*(changes[f] for f in fields), application_id, ctx.auth_user_id),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Application not found")
    return _application_item(row)


# ---------------------------------------------------------------------------
# Document preparation tasks (self-reported)
# ---------------------------------------------------------------------------


@router.get("/api/student/document-tasks")
def list_document_tasks(ctx: CurrentUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT dt.id, dt.application_id, dt.title, dt.document_kind,
                   dt.is_done, dt.due_on, dt.updated_at
              FROM document_tasks AS dt
              JOIN applications AS a ON a.id = dt.application_id
              JOIN student_profiles AS sp ON sp.id = a.student_profile_id
              JOIN users AS u ON u.id = sp.user_id
             WHERE u.auth_user_id = %s
             ORDER BY dt.created_at, dt.id
            """,
            (ctx.auth_user_id,),
        )
        rows = cur.fetchall()
    return {
        "items": [_document_task_item(r) for r in rows],
        "self_reported": True,
    }


@router.patch("/api/student/document-tasks/{task_id}")
def update_document_task(
    task_id: uuid.UUID, body: DocumentTaskUpdate, ctx: CurrentUser
) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            UPDATE document_tasks AS dt
               SET is_done = %s
             WHERE dt.id = %s
               AND EXISTS (
                   SELECT 1
                     FROM applications AS a
                     JOIN student_profiles AS sp ON sp.id = a.student_profile_id
                     JOIN users AS u ON u.id = sp.user_id
                    WHERE a.id = dt.application_id
                      AND u.auth_user_id = %s
               )
            RETURNING dt.id, dt.application_id, dt.title, dt.document_kind,
                      dt.is_done, dt.due_on, dt.updated_at
            """,
            (body.is_done, task_id, ctx.auth_user_id),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Document task not found")
    return _document_task_item(row)


# ---------------------------------------------------------------------------
# Reminders (read-only)
# ---------------------------------------------------------------------------


@router.get("/api/student/reminders")
def list_reminders(ctx: CurrentUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT r.id, r.application_id, r.remind_at, r.message,
                   r.delivery_state, r.channel, r.created_at
              FROM reminders AS r
              JOIN student_profiles AS sp ON sp.id = r.student_profile_id
              JOIN users AS u ON u.id = sp.user_id
             WHERE u.auth_user_id = %s
             ORDER BY r.remind_at, r.id
            """,
            (ctx.auth_user_id,),
        )
        rows = cur.fetchall()
    return {
        "items": [
            {
                "id": str(r[0]),
                "application_id": str(r[1]) if r[1] is not None else None,
                "remind_at": _iso(r[2]),
                "message": r[3],
                "delivery_state": r[4],
                "channel": r[5],
                "created_at": _iso(r[6]),
            }
            for r in rows
        ]
    }
