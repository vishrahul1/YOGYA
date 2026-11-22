import sys
sys.path.insert(0, "services/api")
sys.path.insert(0, "services/api/tests")
import os
from app import auth as auth_module
import test_auth_rbac as t
from fastapi.testclient import TestClient
from app.main import create_app
os.environ["DATABASE_URL"] = "postgresql://synthetic:synthetic@localhost/test"
os.environ["SUPABASE_URL"] = t.SUPABASE_URL
os.environ["SUPABASE_JWT_AUDIENCE"] = "authenticated"
auth_module._jwks_client = lambda: t._FakeJWKSClient()
auth_module._lookup_role = t._fake_lookup_role
c = TestClient(create_app())
tok = t.make_token(t.ADMIN_ID)
r = c.get(f"/api/admin/students/{t.STUDENT_ID}/profile", headers=t._bearer(tok))
body = r.json()
print("status:", r.status_code)
print("top-level keys:", sorted(body.keys()))
if isinstance(body.get("error"), dict):
    print("error keys:", sorted(body["error"].keys()))
    print("error.code:", body["error"].get("code"))
    print("error.message:", body["error"].get("message"))
