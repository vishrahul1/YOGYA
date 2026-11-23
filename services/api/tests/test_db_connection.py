"""Database connectivity checks for YOGYA's Postgres (Supabase).

Run with pytest:  pytest services/api/tests/test_db_connection.py
Or plain Python:  python services/api/tests/test_db_connection.py

DATABASE_URL is read from the environment first, then from services/api/.env.
The URL and password are never printed; only host and database name are shown.
"""

import os
import sys
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

API_DIR = Path(__file__).resolve().parent.parent
ENV_FILE = API_DIR / ".env"
MISSING_MSG = "DATABASE_URL is not set (checked environment and services/api/.env)"


def _database_url() -> str:
    value = os.environ.get("DATABASE_URL", "").strip()
    if not value and ENV_FILE.is_file():
        for raw in ENV_FILE.read_text(encoding="utf-8").splitlines():
            line = raw.strip()
            if line.startswith("DATABASE_URL="):
                value = line.split("=", 1)[1].strip().strip('"').strip("'")
                break
    if not value:
        raise RuntimeError(MISSING_MSG)
    return value


def _open_connection() -> psycopg.Connection:
    try:
        return psycopg.connect(_database_url(), connect_timeout=10)
    except psycopg.Error:
        # psycopg's exception can include the full connection string, including
        # its password. Replace it with a deliberately credential-free error.
        raise RuntimeError(f"Database connection failed ({_describe_target()})") from None


def _describe_target() -> str:
    parts = urlsplit(_database_url())
    return f"host={parts.hostname} database={parts.path.lstrip('/')}"


def test_connection_opens():
    conn = _open_connection()
    assert not conn.closed, "connection object reports closed"
    conn.close()


def test_select_one_returns_1():
    with _open_connection() as conn:
        row = conn.execute("SELECT 1").fetchone()
    assert row is not None and row[0] == 1, f"expected 1, got {row!r}"


def test_select_version_starts_with_postgresql():
    with _open_connection() as conn:
        row = conn.execute("SELECT version()").fetchone()
    version = row[0] if row else None
    assert isinstance(version, str), f"expected str, got {version!r}"
    assert version.startswith("PostgreSQL"), f"unexpected version string: {version[:40]}"


CHECKS = [
    ("connection opens", test_connection_opens),
    ("SELECT 1 returns 1", test_select_one_returns_1),
    ("SELECT version() starts with PostgreSQL", test_select_version_starts_with_postgresql),
]


def _run_plain() -> int:
    try:
        print(f"Target: {_describe_target()}")
    except (RuntimeError, ValueError) as exc:
        print(f"FAIL: {exc}")
        return 1

    failures = 0
    for name, check in CHECKS:
        try:
            check()
        except Exception as exc:
            failures += 1
            print(f"FAIL {name}: {type(exc).__name__}: {exc}")
        else:
            print(f"PASS {name}")
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(_run_plain())
