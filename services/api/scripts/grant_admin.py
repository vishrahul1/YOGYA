"""Grant or revoke the admin role for a YOGYA user.

Usage (from services/api):
    python scripts/grant_admin.py <email>
    python scripts/grant_admin.py <email> --revoke

Grant sets role_assignments to 'admin' and auth.users.raw_app_meta_data.role to
'admin' in one transaction. Revoke sets both back to 'student'.

Admin is granted only through this script. The signup trigger in migration 0006
always assigns 'student', so clients cannot choose admin.

Prints only the email and the resulting role. Never prints DATABASE_URL.
"""

import argparse
import sys
from pathlib import Path

# Make the 'app' package importable when run as scripts/grant_admin.py.
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

import psycopg  # noqa: E402
from pydantic import ValidationError  # noqa: E402

from app.config import get_settings  # noqa: E402


def _set_role(conn: psycopg.Connection, email: str, revoke: bool) -> str:
    """Apply the role change in a single transaction. Returns the resulting role."""
    new_role = "student" if revoke else "admin"

    with conn.cursor() as cur:
        # users.email is not unique in 0002, so require exactly one match.
        cur.execute(
            "SELECT id, auth_user_id FROM users WHERE email = %s",
            (email,),
        )
        rows = cur.fetchall()

        if not rows:
            raise LookupError(f"no user found with email {email}")
        if len(rows) > 1:
            raise LookupError(f"more than one user has email {email}; resolve manually")

        user_id, auth_user_id = rows[0]

        # Make sure the auth schema exists. Without it the JWT claim cannot be set,
        # so do not change role_assignments either.
        cur.execute("SELECT to_regclass('auth.users') IS NOT NULL")
        if not cur.fetchone()[0]:
            raise RuntimeError("auth.users not found; this script needs Supabase Auth")

        if revoke:
            # Back to student: ensure the student row exists, drop the admin row.
            cur.execute(
                """
                INSERT INTO role_assignments (user_id, role)
                VALUES (%s, 'student')
                ON CONFLICT (user_id, role) DO NOTHING
                """,
                (user_id,),
            )
            cur.execute(
                "DELETE FROM role_assignments WHERE user_id = %s AND role = 'admin'",
                (user_id,),
            )
        else:
            cur.execute(
                """
                INSERT INTO role_assignments (user_id, role)
                VALUES (%s, 'admin')
                ON CONFLICT (user_id, role) DO NOTHING
                """,
                (user_id,),
            )

        cur.execute(
            """
            UPDATE auth.users
               SET raw_app_meta_data =
                   coalesce(raw_app_meta_data, '{}'::jsonb) || %s::jsonb
             WHERE id = %s
            """,
            (f'{{"role": "{new_role}"}}', auth_user_id),
        )
        if cur.rowcount != 1:
            raise LookupError("auth.users row missing for this user")

    return new_role


def main() -> int:
    parser = argparse.ArgumentParser(description="Grant or revoke the YOGYA admin role.")
    parser.add_argument("email", help="email address of the user")
    parser.add_argument(
        "--revoke",
        action="store_true",
        help="set the role back to 'student' instead of 'admin'",
    )
    args = parser.parse_args()
    email = args.email.strip()

    try:
        settings = get_settings()
    except ValidationError:
        # Do not echo the settings error: it could contain config values.
        print("error: DATABASE_URL is not set (check services/api/.env)", file=sys.stderr)
        return 1

    try:
        with psycopg.connect(settings.database_url) as conn:
            # The connection context commits on success and rolls back on error.
            role = _set_role(conn, email, revoke=args.revoke)
    except LookupError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except RuntimeError as exc:
        print(f"error: {exc}", file=sys.stderr)
        return 1
    except psycopg.Error as exc:
        # Print only the error class, not the message, to keep connection details out of output.
        print(f"error: database operation failed ({type(exc).__name__})", file=sys.stderr)
        return 1

    print(f"{email}: role={role}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
