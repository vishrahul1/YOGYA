"""Public scheme catalogue routes. Only published scheme versions are returned.

Reads write no audit rows. verified_by is never exposed.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException, Query

from app.db import get_connection

router = APIRouter()

_LIST_SELECT = """
    SELECT s.id,
           v.id,
           s.slug,
           s.name,
           v.academic_year,
           v.benefit_summary,
           v.deadline_text,
           v.application_start_date,
           v.application_end_date,
           src.official_url,
           src.issuing_authority,
           v.verified_at,
           v.published_at
      FROM scheme_versions AS v
      JOIN schemes AS s ON s.id = v.scheme_id
      LEFT JOIN scheme_sources AS src ON src.id = v.source_id
"""


def _iso(value: Any) -> str | None:
    return value.isoformat() if value is not None else None


def _item(row: tuple[Any, ...]) -> dict[str, Any]:
    return {
        "scheme_id": row[0],
        "scheme_version_id": row[1],
        "slug": row[2],
        "name": row[3],
        "academic_year": row[4],
        "benefit_summary": row[5],
        "deadline_text": row[6],
        "application_start_date": _iso(row[7]),
        "application_end_date": _iso(row[8]),
        "official_url": row[9],
        "issuing_authority": row[10],
        "verified_at": _iso(row[11]),
        "published_at": _iso(row[12]),
    }


@router.get("/api/schemes")
def list_schemes(
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
    q: str | None = Query(None, max_length=200),
) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            _LIST_SELECT
            + """
     WHERE v.status = 'published'
       AND (%s::text IS NULL OR s.name ILIKE '%%' || %s || '%%')
     ORDER BY s.name, v.id
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


@router.get("/api/schemes/{scheme_version_id}")
def get_scheme(scheme_version_id: uuid.UUID) -> dict[str, Any]:
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            _LIST_SELECT
            + """
     WHERE v.id = %s AND v.status = 'published'
            """,
            (scheme_version_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scheme not found")
        item = _item(row)

        cur.execute(
            """
            SELECT document_name, document_kind, is_mandatory
              FROM scheme_required_documents
             WHERE scheme_version_id = %s
             ORDER BY document_name
            """,
            (scheme_version_id,),
        )
        docs = cur.fetchall()

        cur.execute(
            """
            SELECT rule_json, rule_format_version, sort_order
              FROM scheme_rules
             WHERE scheme_version_id = %s
             ORDER BY sort_order
            """,
            (scheme_version_id,),
        )
        rules = cur.fetchall()

    item["required_documents"] = [
        {"document_name": d[0], "document_kind": d[1], "is_mandatory": d[2]}
        for d in docs
    ]
    item["rules"] = [
        {"rule_json": r[0], "rule_format_version": r[1], "sort_order": r[2]}
        for r in rules
    ]
    return item
