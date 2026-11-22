"""Admin scheme version and source verification routes.

Admin only. Business rules enforced here:
- Only a version whose status is 'verified' can be published.
- A version becomes 'verified' only after at least one source of its scheme is
  verified (approve route).
- The verifying admin is always taken from the authenticated AdminUser context,
  never from the request body.
- Every state change runs in one transaction, locks the version row FOR UPDATE,
  checks the current status, and writes a verification history row and an
  audit_logs row.

Sources are linked to a scheme (scheme_sources.scheme_id), not to a version.
Routes that act on a version resolve the version's scheme_id first.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException, status
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from app.auth import AuthContext, require_admin
from app.db import get_connection
from app.schemas.admin_verification import (
    ReasonRequest,
    SourceCreateRequest,
    VersionCreateRequest,
)

router = APIRouter()

AdminUser = Annotated[AuthContext, Depends(require_admin)]

_VERSION_RETURNING = """
    id,
    scheme_id,
    version_number,
    academic_year,
    status,
    verified_at,
    published_at,
    source_id,
    created_at,
    updated_at
"""

_SOURCE_RETURNING = """
    id,
    scheme_id,
    official_url,
    issuing_authority,
    notes,
    retrieved_at,
    verified_at
"""


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _uuid_str(value: Any) -> str | None:
    return str(value) if value is not None else None


def _version_item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "scheme_id": str(row[1]),
        "version_number": row[2],
        "academic_year": row[3],
        "status": row[4],
        "verified_at": _iso(row[5]),
        "published_at": _iso(row[6]),
        "source_id": _uuid_str(row[7]),
        "created_at": _iso(row[8]),
        "updated_at": _iso(row[9]),
    }


def _source_item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "scheme_id": str(row[1]),
        "official_url": row[2],
        "issuing_authority": row[3],
        "notes": row[4],
        "retrieved_at": _iso(row[5]),
        "verified_at": _iso(row[6]),
    }


def _lock_version(cur: Any, version_id: uuid.UUID) -> tuple[uuid.UUID, str]:
    """Lock the version row and return (scheme_id, status). 404 if missing."""
    cur.execute(
        "SELECT scheme_id, status FROM scheme_versions WHERE id = %s FOR UPDATE",
        (version_id,),
    )
    row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Scheme version not found")
    return row[0], row[1]


def _require_status(current: str, allowed: tuple[str, ...], message: str) -> None:
    if current not in allowed:
        raise HTTPException(status_code=409, detail=message)


def _audit(
    cur: Any,
    ctx: AuthContext,
    action: str,
    entity_type: str,
    entity_id: uuid.UUID,
    details: dict[str, Any],
) -> None:
    cur.execute(
        """
        INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
        VALUES (
            (SELECT id FROM users WHERE auth_user_id = %s),
            %s,
            %s,
            %s,
            %s
        )
        """,
        (ctx.auth_user_id, action, entity_type, entity_id, Jsonb(details)),
    )


def _history(
    cur: Any,
    ctx: AuthContext,
    version_id: uuid.UUID,
    action: str,
    note: str | None,
) -> None:
    cur.execute(
        """
        INSERT INTO scheme_verification_history
            (scheme_version_id, action, actor_user_id, note, recorded_at)
        VALUES (
            %s,
            %s,
            (SELECT id FROM users WHERE auth_user_id = %s),
            %s,
            now()
        )
        """,
        (version_id, action, ctx.auth_user_id, note),
    )


@router.post(
    "/api/admin/schemes/{scheme_id}/versions",
    status_code=status.HTTP_201_CREATED,
)
def create_scheme_version(
    scheme_id: uuid.UUID, body: VersionCreateRequest, ctx: AdminUser
) -> dict[str, Any]:
    version_id = uuid.uuid4()
    try:
        with get_connection() as conn, conn.cursor() as cur:
            # Lock the parent scheme so concurrent creates cannot pick the same number.
            cur.execute("SELECT id FROM schemes WHERE id = %s FOR UPDATE", (scheme_id,))
            if cur.fetchone() is None:
                raise HTTPException(status_code=404, detail="Scheme not found")

            cur.execute(
                """
                SELECT 1
                  FROM scheme_versions
                 WHERE scheme_id = %s
                   AND academic_year = %s
                   AND status <> 'retired'
                """,
                (scheme_id, body.academic_year),
            )
            if cur.fetchone() is not None:
                raise HTTPException(
                    status_code=409,
                    detail="A non-retired version for this academic year already exists",
                )

            cur.execute(
                "SELECT COALESCE(MAX(version_number), 0) + 1 FROM scheme_versions WHERE scheme_id = %s",
                (scheme_id,),
            )
            next_number = cur.fetchone()[0]

            cur.execute(
                f"""
                INSERT INTO scheme_versions
                    (id, scheme_id, version_number, academic_year, status, created_at, updated_at)
                VALUES (%s, %s, %s, %s, 'draft', now(), now())
                RETURNING {_VERSION_RETURNING}
                """,
                (version_id, scheme_id, next_number, body.academic_year),
            )
            row = cur.fetchone()
            _audit(
                cur,
                ctx,
                "scheme_version.created",
                "scheme_version",
                version_id,
                {
                    "scheme_id": str(scheme_id),
                    "version_number": next_number,
                    "academic_year": body.academic_year,
                },
            )
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Scheme version already exists")
    return _version_item(row)


@router.post(
    "/api/admin/scheme-versions/{version_id}/sources",
    status_code=status.HTTP_201_CREATED,
)
def create_scheme_source(
    version_id: uuid.UUID, body: SourceCreateRequest, ctx: AdminUser
) -> dict[str, Any]:
    source_id = uuid.uuid4()
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, _current = _lock_version(cur, version_id)
        cur.execute(
            f"""
            INSERT INTO scheme_sources
                (id, scheme_id, official_url, issuing_authority, notes, retrieved_at)
            VALUES (%s, %s, %s, %s, %s, now())
            RETURNING {_SOURCE_RETURNING}
            """,
            (source_id, scheme_id, body.official_url, body.issuing_authority, body.notes),
        )
        row = cur.fetchone()
        _audit(
            cur,
            ctx,
            "scheme_source.created",
            "scheme_source",
            source_id,
            {
                "scheme_id": str(scheme_id),
                "scheme_version_id": str(version_id),
                "official_url": body.official_url,
            },
        )
    return _source_item(row)


@router.post("/api/admin/scheme-versions/{version_id}/sources/{source_id}/verify")
def verify_scheme_source(
    version_id: uuid.UUID, source_id: uuid.UUID, ctx: AdminUser
) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, current = _lock_version(cur, version_id)
        _require_status(
            current,
            ("draft", "in_review"),
            "Sources can only be verified while the version is draft or in_review",
        )

        cur.execute(
            "SELECT id FROM scheme_sources WHERE id = %s AND scheme_id = %s FOR UPDATE",
            (source_id, scheme_id),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Source not found for this scheme version")

        cur.execute(
            f"""
            UPDATE scheme_sources
               SET verified_at = now(),
                   verified_by = (SELECT id FROM users WHERE auth_user_id = %s)
             WHERE id = %s
            RETURNING {_SOURCE_RETURNING}
            """,
            (ctx.auth_user_id, source_id),
        )
        row = cur.fetchone()
        _history(cur, ctx, version_id, "verified", f"Source {source_id} verified")
        _audit(
            cur,
            ctx,
            "scheme_source.verified",
            "scheme_source",
            source_id,
            {"scheme_id": str(scheme_id), "scheme_version_id": str(version_id)},
        )
    return _source_item(row)


@router.post("/api/admin/scheme-versions/{version_id}/submit-review")
def submit_scheme_version_for_review(version_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, current = _lock_version(cur, version_id)
        _require_status(current, ("draft",), "Only a draft version can be submitted for review")

        cur.execute(
            "SELECT EXISTS (SELECT 1 FROM scheme_sources WHERE scheme_id = %s)",
            (scheme_id,),
        )
        if not cur.fetchone()[0]:
            raise HTTPException(
                status_code=409,
                detail="At least one source is required before submitting for review",
            )

        cur.execute(
            f"""
            UPDATE scheme_versions
               SET status = 'in_review', updated_at = now()
             WHERE id = %s
            RETURNING {_VERSION_RETURNING}
            """,
            (version_id,),
        )
        row = cur.fetchone()
        _history(cur, ctx, version_id, "submitted_for_review", None)
        _audit(
            cur,
            ctx,
            "scheme_version.submitted_for_review",
            "scheme_version",
            version_id,
            {"scheme_id": str(scheme_id)},
        )
    return _version_item(row)


@router.post("/api/admin/scheme-versions/{version_id}/approve")
def approve_scheme_version(version_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, current = _lock_version(cur, version_id)
        _require_status(current, ("in_review",), "Only an in_review version can be approved")

        # Evidence source: the earliest-verified source of this scheme.
        cur.execute(
            """
            SELECT id
              FROM scheme_sources
             WHERE scheme_id = %s
               AND verified_at IS NOT NULL
             ORDER BY verified_at ASC, id ASC
             LIMIT 1
            """,
            (scheme_id,),
        )
        source_row = cur.fetchone()
        if source_row is None:
            raise HTTPException(
                status_code=409,
                detail="At least one verified source is required before approval",
            )
        evidence_source_id = source_row[0]

        cur.execute(
            f"""
            UPDATE scheme_versions
               SET status = 'verified',
                   verified_at = now(),
                   verified_by = (SELECT id FROM users WHERE auth_user_id = %s),
                   source_id = %s,
                   updated_at = now()
             WHERE id = %s
            RETURNING {_VERSION_RETURNING}
            """,
            (ctx.auth_user_id, evidence_source_id, version_id),
        )
        row = cur.fetchone()
        _history(cur, ctx, version_id, "verified", f"Version approved using source {evidence_source_id}")
        _audit(
            cur,
            ctx,
            "scheme_version.approved",
            "scheme_version",
            version_id,
            {"scheme_id": str(scheme_id), "source_id": str(evidence_source_id)},
        )
    return _version_item(row)


@router.post("/api/admin/scheme-versions/{version_id}/reject")
def reject_scheme_version(
    version_id: uuid.UUID, body: ReasonRequest, ctx: AdminUser
) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, current = _lock_version(cur, version_id)
        _require_status(current, ("in_review",), "Only an in_review version can be rejected")

        cur.execute(
            f"""
            UPDATE scheme_versions
               SET status = 'draft', updated_at = now()
             WHERE id = %s
            RETURNING {_VERSION_RETURNING}
            """,
            (version_id,),
        )
        row = cur.fetchone()
        _history(cur, ctx, version_id, "rejected", body.reason)
        _audit(
            cur,
            ctx,
            "scheme_version.rejected",
            "scheme_version",
            version_id,
            {"scheme_id": str(scheme_id), "reason": body.reason},
        )
    return _version_item(row)


@router.post("/api/admin/scheme-versions/{version_id}/publish")
def publish_scheme_version(version_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, current = _lock_version(cur, version_id)
        _require_status(current, ("verified",), "Only a verified version can be published")

        # Retire the currently published version(s) of this scheme in the same
        # transaction, before publishing, so the partial unique index is not violated.
        cur.execute(
            """
            SELECT id
              FROM scheme_versions
             WHERE scheme_id = %s
               AND status = 'published'
               AND id <> %s
             FOR UPDATE
            """,
            (scheme_id, version_id),
        )
        retired_ids = [r[0] for r in cur.fetchall()]
        for retired_id in retired_ids:
            cur.execute(
                "UPDATE scheme_versions SET status = 'retired', updated_at = now() WHERE id = %s",
                (retired_id,),
            )
            _history(
                cur,
                ctx,
                retired_id,
                "retired",
                f"Retired: superseded by version {version_id}",
            )

        cur.execute(
            f"""
            UPDATE scheme_versions
               SET status = 'published',
                   published_at = now(),
                   updated_at = now()
             WHERE id = %s
            RETURNING {_VERSION_RETURNING}
            """,
            (version_id,),
        )
        row = cur.fetchone()
        _history(cur, ctx, version_id, "published", None)
        _audit(
            cur,
            ctx,
            "scheme_version.published",
            "scheme_version",
            version_id,
            {
                "scheme_id": str(scheme_id),
                "retired_version_id": str(retired_ids[0]) if retired_ids else None,
            },
        )
    return _version_item(row)


@router.get("/api/admin/scheme-versions/{version_id}/history")
def get_scheme_version_history(version_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM scheme_versions WHERE id = %s", (version_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Scheme version not found")

        cur.execute(
            """
            SELECT id, action, actor_user_id, note, recorded_at
              FROM scheme_verification_history
             WHERE scheme_version_id = %s
             ORDER BY recorded_at DESC, id DESC
            """,
            (version_id,),
        )
        rows = cur.fetchall()
    return {
        "items": [
            {
                "id": str(r[0]),
                "action": r[1],
                "actor_user_id": _uuid_str(r[2]),
                "note": r[3],
                "recorded_at": _iso(r[4]),
            }
            for r in rows
        ]
    }
