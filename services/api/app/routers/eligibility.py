"""Eligibility evaluation route. Deterministic rules only; no AI calls.

Only published scheme versions are evaluated. Rule outcomes come from
app.eligibility.engine, reached through the schema adapter. AI never decides eligibility.
"""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import Field

from app.db import get_connection
from app.eligibility import engine
from app.eligibility.adapter import FORMAT_VERSION, adapt_rule_document, scrub_profile
from app.routers.access import CurrentUser
from app.schemas.eligibility import EligibilityRequest, EligibilityResponse, RuleResult

router = APIRouter()


class EvaluateRequest(EligibilityRequest):
    """Eligibility request with an inline profile until profile storage is confirmed."""

    profile: dict[str, Any] = Field(default_factory=dict)


@router.post("/api/eligibility/evaluate", response_model=EligibilityResponse)
def evaluate_eligibility(body: EvaluateRequest, ctx: CurrentUser) -> EligibilityResponse:
    scheme_version_id = body.scheme_version_id
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT v.id
              FROM scheme_versions AS v
             WHERE v.id = %s AND v.status = 'published'
            """,
            (scheme_version_id,),
        )
        if cur.fetchone() is None:
            raise HTTPException(status_code=404, detail="Scheme not found")

        cur.execute(
            """
            SELECT rule_json
              FROM scheme_rules
             WHERE scheme_version_id = %s
             ORDER BY sort_order
            """,
            (scheme_version_id,),
        )
        rows = cur.fetchall()

    try:
        rules = [adapt_rule_document(row[0]) for row in rows]
        evaluation = engine.evaluate_scheme(
            engine.PUBLISHED_STATUS,
            str(scheme_version_id),
            rules,
            scrub_profile(body.profile),
        )
    except ValueError as exc:
        # Stored rules failed validation; this is a data problem, not a client error.
        raise HTTPException(status_code=500, detail="Stored scheme rules are invalid") from exc
    except TypeError as exc:
        # A stored rule has a malformed field type (e.g. an unhashable operator); data problem.
        raise HTTPException(status_code=500, detail="Stored eligibility rule is invalid") from exc

    return EligibilityResponse(
        scheme_version_id=scheme_version_id,
        overall_outcome=evaluation.outcome,  # type: ignore[arg-type]
        rule_results=[
            RuleResult(
                rule_ref=result.rule_label,
                outcome=result.result,  # type: ignore[arg-type]
                reason_code=result.explanation,
            )
            for result in evaluation.rule_results
        ],
        evaluated_at=datetime.now(timezone.utc),
        rule_format_version=FORMAT_VERSION,
    )
