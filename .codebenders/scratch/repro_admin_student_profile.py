import json, os, sys
from pathlib import Path

API = Path(__file__).resolve().parents[2] / "services" / "api"
sys.path.insert(0, str(API))
sys.path.insert(0, str(API / "tests"))

# Synthetic, non-secret settings (same as the test fixture).
os.environ.setdefault("DATABASE_URL", "postgresql://synthetic:synthetic@localhost/test")
os.environ.setdefault("SUPABASE_URL", "https://example.supabase.co")
os.environ.setdefault("SUPABASE_JWT_AUDIENCE", "authenticated")

import test_auth_rbac as t  # reuses token helper + fakes; no secrets printed
from app import auth as auth_module
from app.main import create_app
from fastapi.testclient import TestClient

auth_module._jwks_client = lambda: t._FakeJWKSClient()
auth_module._lookup_role = t._fake_lookup_role
client = TestClient(create_app())

def show(label, user_id):
    token = t.make_token(user_id)
    r = client.get(f"/api/admin/students/{t.STUDENT_ID}/profile",
                   headers={"Authorization": f"Bearer {token}"})
    body = r.json()
    print(f"--- {label}")
    print("status:", r.status_code)
    print("top-level keys:", sorted(body.keys()) if isinstance(body, dict) else type(body).__name__)
    print("body:", json.dumps(body))
    print("has 'detail':", isinstance(body, dict) and "detail" in body)

show("ADMIN token (what the failing test uses)", t.ADMIN_ID)
show("STUDENT token (scenario named in task)", t.STUDENT_ID)
