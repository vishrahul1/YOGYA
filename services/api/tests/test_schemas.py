"""Schema validation tests (no database)."""

import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest
from pydantic import ValidationError

# Make `app` importable when pytest runs from services/api.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.schemas.admin import SchemePublishRequest  # noqa: E402
from app.schemas.applications import ApplicationUpdate  # noqa: E402
from app.schemas.eligibility import EligibilityResponse  # noqa: E402
from app.schemas.schemes import DiscoveryQuery  # noqa: E402


def test_eligibility_response_rejects_unknown_outcome():
    with pytest.raises(ValidationError):
        EligibilityResponse(
            scheme_version_id=uuid.uuid4(),
            overall_outcome="MAYBE",
            evaluated_at=datetime.now(timezone.utc),
            rule_format_version=1,
        )


def test_publish_requires_verified_at():
    with pytest.raises(ValidationError):
        SchemePublishRequest(
            scheme_version_id=uuid.uuid4(),
            source_id=uuid.uuid4(),
        )


def test_publish_requires_source_id():
    with pytest.raises(ValidationError):
        SchemePublishRequest(
            scheme_version_id=uuid.uuid4(),
            verified_at=datetime.now(timezone.utc),
        )


def test_discovery_query_rejects_limit_above_100():
    with pytest.raises(ValidationError):
        DiscoveryQuery(limit=101)


def test_application_update_rejects_unknown_status():
    with pytest.raises(ValidationError):
        ApplicationUpdate(status="deleted")


def test_health_endpoint_returns_ok():
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
