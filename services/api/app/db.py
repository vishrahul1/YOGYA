import psycopg

from app.config import get_settings


def get_connection():
    """Return a new psycopg connection to the configured database.

    Server-side only; service-role credentials must never reach clients.
    """
    return psycopg.connect(get_settings().database_url)
