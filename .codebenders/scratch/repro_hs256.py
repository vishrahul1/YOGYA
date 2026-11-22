import sys, os, time
from unittest import mock
sys.path.insert(0, os.getcwd())
import jwt
import app.auth as auth

SYN_ISS = "https://synthetic.example/auth/v1"
fake_settings = mock.Mock(supabase_url="https://synthetic.example", supabase_jwt_audience="authenticated")
token = jwt.encode(
    {"sub": "00000000-0000-0000-0000-000000000001", "aud": "authenticated",
     "iss": SYN_ISS, "exp": int(time.time()) + 600},
    "test-secret-value", algorithm="HS256")
fake_client = mock.Mock()
fake_client.get_signing_key_from_jwt.side_effect = jwt.PyJWKClientError("simulated JWKS failure")

print("STEP2 allowed:", auth._ALLOWED_ALGORITHMS)
with mock.patch("app.auth.get_settings", return_value=fake_settings), \
     mock.patch("app.auth._jwks_client", return_value=fake_client):
    try:
        auth._decode_claims(token)
        print("STEP2 result: no exception")
    except Exception as e:
        print("STEP2 exception:", type(e).__name__, "|", e)

    from fastapi.testclient import TestClient
    import app.main
    client = TestClient(app.main.app)
    r = client.get("/api/me", headers={"Authorization": "Bearer " + token})
    print("STEP3 status:", r.status_code)
    print("STEP3 body:", r.text)
