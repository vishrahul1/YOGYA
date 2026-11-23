"""Admin scheme catalogue routes: create, list, detail, patch.

Admin only. Create always inserts status 'draft'. Patch never changes status.
This module does not publish, does not write scheme_versions, and does not
verify sources.
"""

from __future__ import annotations

import re
import uuid
from typing import Annotated, Any
from urllib.parse import urlsplit

from fastapi import APIRouter, Depends, HTTPException, Query, status
from psycopg.errors import UniqueViolation
from psycopg.types.json import Jsonb

from app.auth import AuthContext, require_admin
from app.db import get_connection
from app.schemas.admin import ImportUrlRequest, SchemeCreateRequest, SchemeUpdateRequest

router = APIRouter()

AdminUser = Annotated[AuthContext, Depends(require_admin)]

_SCHEME_COLUMNS = """
    s.id,
    s.slug,
    s.name,
    s.status,
    s.issuing_body,
    s.created_at,
    s.updated_at
"""

# Whitelist of columns PATCH may change. Keys are request field names and are
# also the column names; never built from user input.
_SCHEME_UPDATE_COLUMNS: tuple[str, ...] = ("slug", "name", "issuing_body")


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "id": str(row[0]),
        "slug": row[1],
        "name": row[2],
        "status": row[3],
        "issuing_body": row[4],
        "created_at": _iso(row[5]),
        "updated_at": _iso(row[6]),
    }


@router.post("/api/admin/schemes", status_code=status.HTTP_201_CREATED)
def create_scheme(body: SchemeCreateRequest, ctx: AdminUser) -> dict[str, Any]:
    scheme_id = uuid.uuid4()
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                """
                INSERT INTO schemes (id, slug, name, issuing_body, status)
                VALUES (%s, %s, %s, %s, 'draft')
                RETURNING id, slug, name, status, issuing_body, created_at, updated_at
                """,
                (scheme_id, body.slug, body.name, body.issuing_body),
            )
            row = cur.fetchone()
            cur.execute(
                """
                INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
                VALUES (
                    (SELECT id FROM users WHERE auth_user_id = %s),
                    'scheme.created',
                    'scheme',
                    %s,
                    jsonb_build_object('slug', %s::text)
                )
                """,
                (ctx.auth_user_id, scheme_id, body.slug),
            )
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Scheme slug already exists")
    return _item(row)


def _slugify(text: str) -> str:
    """Lowercase ASCII slug: runs of non-alphanumerics become single hyphens."""
    return re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")[:80].strip("-")


@router.post("/api/admin/schemes/import-url", status_code=status.HTTP_201_CREATED)
def import_scheme_from_url(body: ImportUrlRequest, ctx: AdminUser) -> dict[str, Any]:
    """Create a candidate scheme from an official URL. Makes NO outbound request.

    Inserts a draft scheme, a draft source row and an audit entry in one
    transaction. No scheme_versions row is written: academic_year is NOT NULL and
    cannot be derived from the request body (see report in CURRENT_TASK).
    """
    parts = urlsplit(body.official_url)
    location = f"{parts.netloc}{parts.path}".rstrip("/")
    name = body.name or location[:200]
    base_slug = _slugify(body.name or location) or "imported-scheme"
    scheme_id = uuid.uuid4()
    source_id = uuid.uuid4()
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute("SELECT 1 FROM schemes WHERE slug = %s", (base_slug,))
            if cur.fetchone() is None:
                slug = base_slug
            else:
                slug = f"{base_slug}-{uuid.uuid4().hex[:8]}"
            cur.execute(
                """
                INSERT INTO schemes (id, slug, name, issuing_body, status)
                VALUES (%s, %s, %s, %s, 'draft')
                """,
                (scheme_id, slug, name, body.issuing_body),
            )
            cur.execute(
                """
                INSERT INTO scheme_sources (id, scheme_id, official_url, issuing_authority, notes)
                VALUES (%s, %s, %s, %s, 'Imported from URL; not yet verified')
                """,
                (source_id, scheme_id, body.official_url, body.issuing_body or "TBD"),
            )
            cur.execute(
                """
                INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
                VALUES (
                    (SELECT id FROM users WHERE auth_user_id = %s),
                    'scheme.imported_from_url',
                    'scheme',
                    %s,
                    jsonb_build_object(
                        'slug', %s::text,
                        'official_url', %s::text,
                        'scheme_source_id', %s::text
                    )
                )
                """,
                (ctx.auth_user_id, scheme_id, slug, body.official_url, source_id),
            )
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Scheme slug already exists")
    return {
        "scheme_id": str(scheme_id),
        "scheme_source_id": str(source_id),
        "slug": slug,
        "status": "draft",
    }


@router.patch("/api/admin/schemes/{scheme_id}")
def update_scheme(
    scheme_id: uuid.UUID, body: SchemeUpdateRequest, ctx: AdminUser
) -> dict[str, Any]:
    changes = body.model_dump(exclude_unset=True)
    fields = [f for f in _SCHEME_UPDATE_COLUMNS if f in changes]
    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update")

    set_clause = ", ".join(f"{col} = %s" for col in fields)
    select_old = ", ".join(_SCHEME_UPDATE_COLUMNS)
    try:
        with get_connection() as conn, conn.cursor() as cur:
            cur.execute(
                f"SELECT {select_old} FROM schemes WHERE id = %s FOR UPDATE",
                (scheme_id,),
            )
            old_row = cur.fetchone()
            if old_row is None:
                raise HTTPException(status_code=404, detail="Scheme not found")
            old = dict(zip(_SCHEME_UPDATE_COLUMNS, old_row))

            cur.execute(
                f"""
                UPDATE schemes
                   SET {set_clause}, updated_at = now()
                 WHERE id = %s
                RETURNING id, slug, name, status, issuing_body, created_at, updated_at
                """,
                (*(changes[f] for f in fields), scheme_id),
            )
            row = cur.fetchone()
            if row is None:
                raise HTTPException(status_code=404, detail="Scheme not found")
            details = {
                "fields": {f: {"old": old[f], "new": changes[f]} for f in fields}
            }
            cur.execute(
                """
                INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
                VALUES (
                    (SELECT id FROM users WHERE auth_user_id = %s),
                    'scheme.updated',
                    'scheme',
                    %s,
                    %s
                )
                """,
                (ctx.auth_user_id, scheme_id, Jsonb(details)),
            )
    except UniqueViolation:
        raise HTTPException(status_code=409, detail="Scheme slug already exists")
    return _item(row)


@router.get("/api/admin/schemes")
def list_admin_schemes(
    ctx: AdminUser,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT "
            + _SCHEME_COLUMNS
            + """
              FROM schemes AS s
             WHERE (%s::text IS NULL OR s.name ILIKE '%%' || %s || '%%')
             ORDER BY s.name, s.id
             LIMIT %s OFFSET %s
            """,
            (q, q, limit, offset),
        )
        rows = cur.fetchall()
    return {
        "items": [_item(r) for r in rows],
        "limit": limit,
        "offset": offset,
    }


@router.get("/api/admin/schemes/{scheme_id}")
def get_admin_scheme(scheme_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT "
            + _SCHEME_COLUMNS
            + """
              FROM schemes AS s
             WHERE s.id = %s
            """,
            (scheme_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    return _item(row)


@router.delete("/api/admin/schemes/{scheme_id}")
def delete_draft_scheme(scheme_id: uuid.UUID, ctx: AdminUser) -> dict[str, bool]:
    """Permanently delete an unpublished draft and its draft workspace.

    Versions that have entered review, verification, publication, or retirement are
    retained. Student application/check results also block deletion.
    """
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            "SELECT slug, name FROM schemes WHERE id = %s FOR UPDATE",
            (scheme_id,),
        )
        scheme = cur.fetchone()
        if scheme is None:
            raise HTTPException(status_code=404, detail="Scheme not found")

        cur.execute(
            "SELECT status FROM scheme_versions WHERE scheme_id = %s FOR UPDATE",
            (scheme_id,),
        )
        version_statuses = [row[0] for row in cur.fetchall()]
        if any(item != "draft" for item in version_statuses):
            raise HTTPException(
                status_code=409,
                detail="Only scholarships whose versions are all drafts can be deleted",
            )

        cur.execute(
            """
            SELECT EXISTS (
                SELECT 1 FROM applications a
                JOIN scheme_versions v ON v.id = a.scheme_version_id
                WHERE v.scheme_id = %s
            ) OR EXISTS (
                SELECT 1 FROM eligibility_checks e
                JOIN scheme_versions v ON v.id = e.scheme_version_id
                WHERE v.scheme_id = %s
            )
            """,
            (scheme_id, scheme_id),
        )
        if cur.fetchone()[0]:
            raise HTTPException(
                status_code=409,
                detail="This scholarship has student activity and cannot be deleted",
            )

        cur.execute(
            """
            INSERT INTO audit_logs (actor_user_id, action, entity_type, entity_id, details)
            VALUES (
                (SELECT id FROM users WHERE auth_user_id = %s),
                'scheme.deleted',
                'scheme',
                %s,
                jsonb_build_object('slug', %s::text, 'name', %s::text)
            )
            """,
            (ctx.auth_user_id, scheme_id, scheme[0], scheme[1]),
        )
        cur.execute("DELETE FROM scheme_versions WHERE scheme_id = %s", (scheme_id,))
        cur.execute(
            "DELETE FROM source_documents WHERE scheme_source_id IN "
            "(SELECT id FROM scheme_sources WHERE scheme_id = %s)",
            (scheme_id,),
        )
        cur.execute("DELETE FROM scheme_sources WHERE scheme_id = %s", (scheme_id,))
        cur.execute("DELETE FROM schemes WHERE id = %s", (scheme_id,))

    return {"deleted": True}
