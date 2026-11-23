"""AI routes: profile extraction, follow-up questions and explanations.

All routes require an authenticated user (CurrentUser). AI output never decides
eligibility. The explanation route computes the outcome server-side with the
deterministic engine and passes only that trusted result to the provider. The
provider falls back to deterministic output on any failure. Raw input text is
never logged.
"""

from __future__ import annotations

import uuid
from typing import Any

from fastapi import APIRouter, HTTPException

from app.ai.provider import get_provider
from app.ai.redaction import redact
from app.ai.extraction import FOLLOWUP_TEMPLATES, REQUIRED_KEYS
from app.db import get_connection
from app.eligibility import engine
from app.eligibility.adapter import adapt_rule_document, scrub_profile
from app.routers.access import CurrentUser
from app.schemas.ai import (
    ChatRequest,
    ChatResponse,
    ExplanationRequest,
    ExplanationResponse,
    ExplanationRuleResult,
    FollowUpsRequest,
    FollowUpsResponse,
    FollowupQuestion,
    ProfileExtractRequest,
    ProfileExtractResponse,
)

router = APIRouter()

_PROFILE_KEYS = frozenset([*REQUIRED_KEYS, "disability"])


def _safe_profile(value: dict[str, Any]) -> dict[str, Any]:
    """Keep only supported non-sensitive profile attributes."""
    safe: dict[str, Any] = {}
    for key, item in value.items():
        if key not in _PROFILE_KEYS:
            continue
        if isinstance(item, str):
            safe[key] = redact(item)
        elif isinstance(item, list):
            safe[key] = [redact(entry) if isinstance(entry, str) else entry for entry in item]
        else:
            safe[key] = item
    return safe


def _load_chat_context(scheme_version_id: uuid.UUID | None) -> dict[str, Any]:
    """Load only published, verified catalogue facts for grounded chat replies."""
    with get_connection() as conn, conn.cursor() as cur:
        if scheme_version_id is None:
            cur.execute(
                """
                SELECT v.id, s.name, v.academic_year, v.benefit_summary,
                       v.deadline_text, src.issuing_authority, src.official_url,
                       v.verified_at
                  FROM scheme_versions AS v
                  JOIN schemes AS s ON s.id = v.scheme_id
                  LEFT JOIN scheme_sources AS src ON src.id = v.source_id
                 WHERE v.status = 'published'
                 ORDER BY s.name
                 LIMIT 20
                """
            )
            return {
                "schemes": [
                    {
                        "scheme_version_id": str(row[0]),
                        "name": row[1],
                        "academic_year": row[2],
                        "benefit_summary": row[3],
                        "deadline_text": row[4],
                        "issuing_authority": row[5],
                        "official_url": row[6],
                        "verified_at": row[7].isoformat() if row[7] is not None else None,
                    }
                    for row in cur.fetchall()
                ]
            }

        cur.execute(
            """
            SELECT v.id, s.name, v.academic_year, v.benefit_summary,
                   v.deadline_text, src.issuing_authority, src.official_url,
                   v.verified_at
              FROM scheme_versions AS v
              JOIN schemes AS s ON s.id = v.scheme_id
              LEFT JOIN scheme_sources AS src ON src.id = v.source_id
             WHERE v.id = %s AND v.status = 'published'
            """,
            (scheme_version_id,),
        )
        row = cur.fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Scheme not found")
        selected: dict[str, Any] = {
            "scheme_version_id": str(row[0]),
            "name": row[1],
            "academic_year": row[2],
            "benefit_summary": row[3],
            "deadline_text": row[4],
            "issuing_authority": row[5],
            "official_url": row[6],
            "verified_at": row[7].isoformat() if row[7] is not None else None,
        }
        cur.execute(
            """
            SELECT document_name, document_kind, is_mandatory
              FROM scheme_required_documents
             WHERE scheme_version_id = %s
             ORDER BY document_name
            """,
            (scheme_version_id,),
        )
        selected["required_documents"] = [
            {"name": item[0], "kind": item[1], "mandatory": item[2]}
            for item in cur.fetchall()
        ]
        cur.execute(
            """
            SELECT rule_json
              FROM scheme_rules
             WHERE scheme_version_id = %s
             ORDER BY sort_order
            """,
            (scheme_version_id,),
        )
        selected["verified_rules"] = [item[0] for item in cur.fetchall()]
        return {"selected_scheme": selected}


def _load_published_scheme(scheme_version_id: uuid.UUID) -> tuple[str, list[Any]] | None:
    """Return (scheme name, stored rule documents) for a published version, or None."""
    with get_connection() as conn, conn.cursor() as cur:
        cur.execute(
            """
            SELECT s.name
              FROM scheme_versions AS v
              JOIN schemes AS s ON s.id = v.scheme_id
             WHERE v.id = %s AND v.status = 'published'
            """,
            (scheme_version_id,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        cur.execute(
            """
            SELECT rule_json
              FROM scheme_rules
             WHERE scheme_version_id = %s
             ORDER BY sort_order
            """,
            (scheme_version_id,),
        )
        rules = [r[0] for r in cur.fetchall()]
    return row[0], rules


@router.post("/api/ai/profile/extract", response_model=ProfileExtractResponse)
def extract_profile_route(body: ProfileExtractRequest, ctx: CurrentUser) -> ProfileExtractResponse:
    # Redact before any provider call. The raw text is not logged.
    provider = get_provider()
    result = provider.extract_profile(redact(body.text), body.language)
    return ProfileExtractResponse(
        profile=result.get("profile", {}),
        missing=result.get("missing", []),
        followup_questions=[FollowupQuestion(**q) for q in result.get("followup_questions", [])],
        used_fallback=provider.last_used_fallback,
    )


@router.post("/api/ai/follow-ups", response_model=FollowUpsResponse)
def generate_followups_route(body: FollowUpsRequest, ctx: CurrentUser) -> FollowUpsResponse:
    provider = get_provider()
    questions = provider.generate_followups(list(body.missing), body.language)
    return FollowUpsResponse(questions=questions, used_fallback=provider.last_used_fallback)


@router.post("/api/ai/chat", response_model=ChatResponse)
def chat_route(body: ChatRequest, ctx: CurrentUser) -> ChatResponse:
    """Answer one grounded chat turn and extract profile details in one provider call."""
    del ctx
    context = _load_chat_context(body.scheme_version_id)
    profile = _safe_profile(body.profile)
    history = [
        {"role": item.role, "content": redact(item.content)}
        for item in body.history
    ]
    provider = get_provider()
    result = provider.chat(redact(body.message), body.language, context, profile, history)

    merged_profile = {**profile, **_safe_profile(result.get("profile", {}))}
    missing = [key for key in REQUIRED_KEYS if key not in merged_profile]
    followups = [
        FollowupQuestion(
            key=key,
            en=FOLLOWUP_TEMPLATES[key]["en"],
            te=FOLLOWUP_TEMPLATES[key]["te"],
        )
        for key in missing
    ]
    reply = str(result.get("reply") or "").strip()[:4000]
    if not reply:
        reply = "I could not prepare a response. Please try asking in a different way."
    intent = result.get("intent")
    if intent not in {"profile", "question", "both", "unsupported"}:
        intent = "unsupported"
    return ChatResponse(
        reply=reply,
        intent=intent,
        profile=merged_profile,
        missing=missing,
        followup_questions=followups,
        used_fallback=provider.last_used_fallback,
    )


@router.post("/api/ai/explanations", response_model=ExplanationResponse)
def explain_eligibility_route(body: ExplanationRequest, ctx: CurrentUser) -> ExplanationResponse:
    loaded = _load_published_scheme(body.scheme_version_id)
    if loaded is None:
        raise HTTPException(status_code=404, detail="Scheme not found")
    scheme_name, rule_docs = loaded

    try:
        rules = [adapt_rule_document(doc) for doc in rule_docs]
        evaluation = engine.evaluate_scheme(
            engine.PUBLISHED_STATUS,
            str(body.scheme_version_id),
            rules,
            scrub_profile(body.profile),
        )
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Stored scheme rules are invalid") from exc

    # The trusted, server-computed result is the only input the explanation sees.
    trusted_result = {
        "outcome": evaluation.outcome,
        "scheme_name": scheme_name,
        "rule_results": [
            {
                "rule_label": r.rule_label,
                "result": r.result,
                "explanation": r.explanation,
            }
            for r in evaluation.rule_results
        ],
    }

    provider = get_provider()
    try:
        text = provider.explain(trusted_result, body.language)
    except ValueError as exc:
        raise HTTPException(status_code=500, detail="Explanation unavailable") from exc

    return ExplanationResponse(
        scheme_version_id=body.scheme_version_id,
        outcome=evaluation.outcome,  # type: ignore[arg-type]
        explanation=text,
        rule_results=[ExplanationRuleResult(**r) for r in trusted_result["rule_results"]],
        used_fallback=provider.last_used_fallback,
    )
