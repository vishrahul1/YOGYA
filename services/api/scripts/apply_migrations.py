"""Apply database/migrations/*.sql in filename order to DATABASE_URL.

Each file runs in its own transaction. Stops at the first failure.
Migrations are NOT tracked: re-running an applied migration will fail on
existing objects. Use only against a database you have confirmed is intended.

Usage (from services/api):
    python scripts/apply_migrations.py --confirm-target
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path
from urllib.parse import urlsplit

import psycopg

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import get_settings  # noqa: E402

MIGRATIONS_DIR = Path(__file__).resolve().parents[3] / "database" / "migrations"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument(
        "--confirm-target",
        action="store_true",
        help="Required. Confirms the DATABASE_URL target is intended to be migrated.",
    )
    args = parser.parse_args()
    if not args.confirm_target:
        print("Refusing to run without --confirm-target.")
        return 2

    database_url = get_settings().database_url
    host = urlsplit(database_url).hostname or "unknown-host"
    print(f"Target host: {host} (credentials not shown)")

    files = sorted(MIGRATIONS_DIR.glob("*.sql"))
    if not files:
        print(f"No .sql files found in {MIGRATIONS_DIR}")
        return 1

    for path in files:
        print(f"Applying {path.name} ...")
        sql = path.read_text(encoding="utf-8")
        try:
            with psycopg.connect(database_url, autocommit=False) as conn:
                with conn.cursor() as cur:
                    cur.execute(sql)
                conn.commit()
        except psycopg.Error as exc:
            print(f"FAILED on {path.name}: {exc.__class__.__name__}: {exc}")
            return 1
        print(f"OK {path.name}")

    print("All migrations applied.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
