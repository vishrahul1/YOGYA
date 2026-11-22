"""Role-protected access routes.

Scholarship features are intentionally absent. Admins are never given access
to student private records.
"""

from __future__ import annotations

import uuid
from typing import Annotated, Any

from fastapi import APIRouter, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from psycopg.rows import dict_row

from app.auth import AuthContext, get_current_user, require_admin, require_student
from app.db import get_connection

router = APIRouter()

CurrentUser = Annotated[AuthContext, Depends(get_current_user)]
StudentUser = Annotated[AuthContext, Depends(require_student)]
AdminUser = Annotated[AuthContext, Depends(require_admin)]


def _fetch_own_profile(auth_user_id: uuid.UUID) -> dict[str, Any]:
    """Return the student_profiles row for auth_user_id, or {} if none.

    student_profiles.user_id references users.id, so the lookup joins users
    on auth_user_id. Parameterised; no string interpolation.
    """
    with get_connection() as conn, conn.cursor(row_factory=dict_row) as cur:
        cur.execute(
            """
            SELECT sp.id,
                   sp.user_id,
                   sp.attributes,
                   sp.preferred_language,
                   sp.created_at,
                   sp.updated_at
              FROM student_profiles AS sp
              JOIN users AS u ON u.id = sp.user_id
             WHERE u.auth_user_id = %s
            """,
            (auth_user_id,),
        )
        row = cur.fetchone()
    if row is None:
        return {}
    return jsonable_encoder(dict(row))


@router.get("/api/me")
def get_me(ctx: CurrentUser) -> dict[str, str | None]:
    return {
        "auth_user_id": str(ctx.auth_user_id),
        "email": ctx.email,
        "role": ctx.role,
    }


@router.get("/api/student/profile")
def get_own_student_profile(ctx: StudentUser) -> dict[str, Any]:
    return _fetch_own_profile(ctx.auth_user_id)


@router.get("/api/students/{student_user_id}/profile")
def get_student_profile_by_id(
    student_user_id: uuid.UUID,
    ctx: StudentUser,
) -> dict[str, Any]:
    # Only the owner may read their own profile. The same 403 is returned
    # whether or not a record exists, so existence is not revealed.
    if student_user_id != ctx.auth_user_id:
        raise HTTPException(status_code=403, detail="Not permitted to view this profile")
    return _fetch_own_profile(ctx.auth_user_id)


@router.get("/api/admin/schemes-catalogue")
def get_admin_schemes_catalogue(ctx: AdminUser) -> dict[str, str]:
    # Placeholder: confirms admin access to catalogue management only.
    # Must not query any student table.
    return {"status": "ok", "scope": "catalogue"}


@router.get("/api/admin/students/{student_user_id}/profile")
def get_admin_student_profile(
    student_user_id: uuid.UUID,
    ctx: AdminUser,
) -> dict[str, Any]:
    # Admins never see private student data. Raise before any DB access.
    raise HTTPException(status_code=403, detail="Admins cannot access student private records")
