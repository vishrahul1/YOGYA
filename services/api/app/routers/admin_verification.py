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
from psycopg.types.json import Jsonb

from app.auth import AuthContext, require_admin
from app.db import get_connection
from app.schemas.admin_verification import (
    EligibilityCriterionCreate,
    ReasonRequest,
    RequiredDocumentCreate,
    SourceCreateRequest,
    VersionContentUpdate,
)
from app.eligibility.adapter import adapt_rule_document

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


def _draft_version(cur: Any, version_id: uuid.UUID) -> tuple[uuid.UUID, str]:
    scheme_id, current = _lock_version(cur, version_id)
    _require_status(current, ("draft",), "Version content can only be edited while it is draft")
    return scheme_id, current


def _require_scheme_source(cur: Any, scheme_id: uuid.UUID, source_id: uuid.UUID) -> None:
    cur.execute("SELECT 1 FROM scheme_sources WHERE id = %s AND scheme_id = %s", (source_id, scheme_id))
    if cur.fetchone() is None:
        raise HTTPException(status_code=404, detail="Official source not found for this scheme")


@router.get("/api/admin/scheme-versions/{version_id}/content")
def get_version_content(version_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT benefit_summary, deadline_text, application_start_date, application_end_date
              FROM scheme_versions WHERE id = %s
            """,
            (version_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scheme version not found")
        cur.execute(
            """
            SELECT id, document_name, document_kind, is_mandatory, source_id
              FROM scheme_required_documents WHERE scheme_version_id = %s
             ORDER BY document_name, id
            """,
            (version_id,),
        )
        documents = cur.fetchall()
        cur.execute(
            """
            SELECT id, rule_json, source_id, sort_order
              FROM scheme_rules WHERE scheme_version_id = %s
             ORDER BY sort_order, id
            """,
            (version_id,),
        )
        rules = cur.fetchall()
    return {
        "benefit_summary": row[0],
        "deadline_text": row[1],
        "application_start_date": _iso(row[2]),
        "application_end_date": _iso(row[3]),
        "required_documents": [
            {"id": str(item[0]), "document_name": item[1], "document_kind": item[2],
             "is_mandatory": item[3], "source_id": _uuid_str(item[4])}
            for item in documents
        ],
        "eligibility_rules": [
            {"id": str(item[0]), "rule_json": item[1], "source_id": str(item[2]), "sort_order": item[3]}
            for item in rules
        ],
    }


@router.patch("/api/admin/scheme-versions/{version_id}/content")
def update_version_content(version_id: uuid.UUID, body: VersionContentUpdate, ctx: AdminUser) -> dict[str, Any]:
    changes = body.model_dump(exclude_unset=True)
    allowed = ("benefit_summary", "deadline_text", "application_start_date", "application_end_date")
    fields = [field for field in allowed if field in changes]
    if not fields:
        raise HTTPException(status_code=400, detail="No content fields to update")
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, _ = _draft_version(cur, version_id)
        assignments = ", ".join(f"{field} = %s" for field in fields)
        cur.execute(
            f"UPDATE scheme_versions SET {assignments}, updated_at = now() WHERE id = %s",
            (*(changes[field] for field in fields), version_id),
        )
        _audit(cur, ctx, "scheme_version.content_updated", "scheme_version", version_id,
               {"scheme_id": str(scheme_id), "fields": fields})
    return get_version_content(version_id, ctx)


@router.post("/api/admin/scheme-versions/{version_id}/documents", status_code=201)
def add_required_document(version_id: uuid.UUID, body: RequiredDocumentCreate, ctx: AdminUser) -> dict[str, Any]:
    document_id = uuid.uuid4()
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, _ = _draft_version(cur, version_id)
        if body.source_id:
            _require_scheme_source(cur, scheme_id, body.source_id)
        cur.execute(
            """
            INSERT INTO scheme_required_documents
              (id, scheme_version_id, document_name, document_kind, is_mandatory, source_id)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id, document_name, document_kind, is_mandatory, source_id
            """,
            (document_id, version_id, body.document_name.strip(), body.document_kind.strip(),
             body.is_mandatory, body.source_id),
        )
        row = cur.fetchone()
        _audit(cur, ctx, "scheme_document.created", "scheme_version", version_id,
               {"document_id": str(document_id)})
    return {"id": str(row[0]), "document_name": row[1], "document_kind": row[2],
            "is_mandatory": row[3], "source_id": _uuid_str(row[4])}


@router.delete("/api/admin/scheme-versions/{version_id}/documents/{document_id}")
def delete_required_document(version_id: uuid.UUID, document_id: uuid.UUID, ctx: AdminUser) -> dict[str, bool]:
    with get_connection() as conn, conn.cursor() as cur:
        _draft_version(cur, version_id)
        cur.execute("DELETE FROM scheme_required_documents WHERE id = %s AND scheme_version_id = %s RETURNING id",
                    (document_id, version_id))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Required document not found")
    return {"deleted": True}


@router.post("/api/admin/scheme-versions/{version_id}/eligibility-rules", status_code=201)
def add_eligibility_criterion(version_id: uuid.UUID, body: EligibilityCriterionCreate, ctx: AdminUser) -> dict[str, Any]:
    rule_id = uuid.uuid4()
    with get_connection() as conn, conn.cursor() as cur:
        scheme_id, _ = _draft_version(cur, version_id)
        _require_scheme_source(cur, scheme_id, body.source_id)
        cur.execute("SELECT academic_year FROM scheme_versions WHERE id = %s", (version_id,))
        academic_year = cur.fetchone()[0]
        criterion: dict[str, Any] = {
            "type": "criterion", "attribute": body.attribute, "operator": body.operator,
            "academic_year": academic_year, "source_reference": str(body.source_id),
            "unknown_policy": "UNKNOWN",
        }
        if body.operator != "is_set":
            criterion["value"] = body.value
        rule_json = {"format_version": 1, "academic_year": academic_year, "root": criterion}
        try:
            adapt_rule_document(rule_json)
        except (TypeError, ValueError) as exc:
            raise HTTPException(status_code=422, detail="Invalid eligibility criterion") from exc
        cur.execute("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM scheme_rules WHERE scheme_version_id = %s", (version_id,))
        sort_order = cur.fetchone()[0]
        cur.execute(
            """
            INSERT INTO scheme_rules
              (id, scheme_version_id, rule_json, rule_format_version, academic_year, source_id, sort_order)
            VALUES (%s, %s, %s, 1, %s, %s, %s)
            """,
            (rule_id, version_id, Jsonb(rule_json), academic_year, body.source_id, sort_order),
        )
        _audit(cur, ctx, "scheme_rule.created", "scheme_version", version_id, {"rule_id": str(rule_id)})
    return {"id": str(rule_id), "rule_json": rule_json, "source_id": str(body.source_id), "sort_order": sort_order}


@router.delete("/api/admin/scheme-versions/{version_id}/eligibility-rules/{rule_id}")
def delete_eligibility_rule(version_id: uuid.UUID, rule_id: uuid.UUID, ctx: AdminUser) -> dict[str, bool]:
    with get_connection() as conn, conn.cursor() as cur:
        _draft_version(cur, version_id)
        cur.execute("DELETE FROM scheme_rules WHERE id = %s AND scheme_version_id = %s RETURNING id", (rule_id, version_id))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Eligibility rule not found")
    return {"deleted": True}


@router.get("/api/admin/schemes/{scheme_id}/record")
def get_scheme_record(scheme_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    """Return the scheme's single persisted workflow record."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM schemes WHERE id = %s", (scheme_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Scheme not found")
        cur.execute(
            f"""
            SELECT {_VERSION_RETURNING}
              FROM scheme_versions
             WHERE scheme_id = %s
             LIMIT 1
            """,
            (scheme_id,),
        )
        row = cur.fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Scholarship record not found")
    return _version_item(row)


@router.get("/api/admin/schemes/{scheme_id}/sources")
def list_scheme_sources(scheme_id: uuid.UUID, ctx: AdminUser) -> dict[str, Any]:
    """Return official sources already attached to an admin scheme."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute("SELECT 1 FROM schemes WHERE id = %s", (scheme_id,))
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Scheme not found")
        cur.execute(
            f"""
            SELECT {_SOURCE_RETURNING}
              FROM scheme_sources
             WHERE scheme_id = %s
             ORDER BY retrieved_at DESC, id DESC
            """,
            (scheme_id,),
        )
        rows = cur.fetchall()
    return {"items": [_source_item(row) for row in rows]}


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
