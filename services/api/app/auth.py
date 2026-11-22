import uuid
from dataclasses import dataclass
from functools import lru_cache
from typing import Any

import jwt
from fastapi import Depends, HTTPException, Request, status

from app.config import get_settings
from app.db import get_connection

_ALLOWED_ALGORITHMS = ["RS256", "ES256"]
_UNAUTHORIZED_DETAIL = "Invalid or missing authentication token"
_NO_ROLE_DETAIL = "No application role assigned"


@dataclass(frozen=True)
class AuthContext:
    auth_user_id: uuid.UUID
    email: str | None
    role: str | None


@lru_cache(maxsize=1)
def _jwks_client() -> jwt.PyJWKClient:
    """Module-level, cached JWKS client for the Supabase project."""
    jwks_url = f"{get_settings().supabase_url}/auth/v1/.well-known/jwks.json"
    return jwt.PyJWKClient(jwks_url)


def _unauthorized() -> HTTPException:
    return HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=_UNAUTHORIZED_DETAIL,
        headers={"WWW-Authenticate": "Bearer"},
    )


def _bearer_token(request: Request) -> str:
    scheme, _, token = request.headers.get("authorization", "").partition(" ")
    token = token.strip()
    if scheme.lower() != "bearer" or not token:
        raise _unauthorized()
    return token


def _decode_claims(token: str) -> dict[str, Any]:
    settings = get_settings()
    signing_key = _jwks_client().get_signing_key_from_jwt(token)
    return jwt.decode(
        token,
        signing_key.key,
        algorithms=_ALLOWED_ALGORITHMS,
        audience=settings.supabase_jwt_audience,
        issuer=f"{settings.supabase_url}/auth/v1",
        options={"require": ["exp", "sub"]},
    )


def _lookup_role(auth_user_id: uuid.UUID) -> str | None:
    """Return the application role for an auth user, or None if unassigned.

    The role comes from role_assignments (via users.auth_user_id), never from
    the token. Ordering makes the result deterministic if several rows exist.
    """
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT ra.role
            FROM role_assignments ra
            JOIN users u ON u.id = ra.user_id
            WHERE u.auth_user_id = %s
            ORDER BY ra.role
            LIMIT 1
            """,
            (auth_user_id,),
        ).fetchone()
    return row[0] if row else None


def get_current_user(request: Request) -> AuthContext:
    """Verify the Supabase access token and resolve the caller's role.

    Raises 401 for a missing, malformed, expired, or invalid token and 403 when
    the verified user has no role assignment. Tokens and headers are never
    included in error messages.
    """
    token = _bearer_token(request)
    try:
        claims = _decode_claims(token)
        auth_user_id = uuid.UUID(str(claims["sub"]))
    except (jwt.PyJWTError, KeyError, TypeError, ValueError):
        raise _unauthorized() from None

    email = claims.get("email")
    role = _lookup_role(auth_user_id)
    if role is None:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=_NO_ROLE_DETAIL,
        )
    return AuthContext(
        auth_user_id=auth_user_id,
        email=email if isinstance(email, str) else None,
        role=role,
    )


def require_student(ctx: AuthContext = Depends(get_current_user)) -> AuthContext:
    if ctx.role != "student":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return ctx


def require_admin(ctx: AuthContext = Depends(get_current_user)) -> AuthContext:
    if ctx.role != "admin":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Forbidden")
    return ctx
