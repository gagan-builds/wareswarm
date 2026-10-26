"""
test_auth.py - Unit & Endpoint Tests for User Authentication.

Purpose:
    Validates cryptographic password hashing, session token verification,
    user sign up, duplicate handling, sign in, and demo login endpoints.

Role in the project:
    Quality assurance and verification for the user authentication system.

Key contents:
    - TestAuthUtils: Verifies salted hashing and HMAC token signature/expiry.
    - TestAuthEndpoints: End-to-end FastAPI test client testing sign up and sign in.

Talks to:
    - app.api.routes_auth: Tests authentication API endpoints.
    - app.core.auth_utils: Tests cryptographic functions.
"""
import pytest
from app.core.auth_utils import hash_password, verify_password, create_token, verify_token
from app.db.session import SessionLocal, init_db
from app.db.models import User

@pytest.fixture(autouse=True)
def setup_db():
    init_db()

class TestAuthUtils:
    def test_password_hashing_and_verification(self):
        pwd = "SecretPassword123!"
        hashed = hash_password(pwd)
        assert hashed != pwd
        assert ":" in hashed
        assert verify_password(pwd, hashed) is True
        assert verify_password("WrongPassword", hashed) is False

    def test_token_creation_and_verification(self):
        token = create_token(user_id=42, username="alice", email="alice@example.com", role="Engineer")
        payload = verify_token(token)
        assert payload is not None
        assert payload["sub"] == 42
        assert payload["username"] == "alice"
        assert payload["email"] == "alice@example.com"
        assert payload["role"] == "Engineer"

    def test_invalid_token(self):
        assert verify_token("invalid.token.structure") is None
        assert verify_token("fake_payload.fake_signature") is None


class TestAuthEndpoints:
    def test_signup_and_signin_flow(self):
        import uuid
        from fastapi.testclient import TestClient
        from app.main import app

        client = TestClient(app)
        unique_suffix = uuid.uuid4().hex[:8]
        username = f"user_{unique_suffix}"
        email = f"user_{unique_suffix}@example.com"

        # 1. Sign Up
        res = client.post("/api/auth/signup", json={
            "username": username,
            "email": email,
            "password": "mypassword123",
            "full_name": "Test Engineer",
            "role": "Robotics Engineer",
        })
        assert res.status_code == 200, res.text
        data = res.json()
        assert data["status"] == "success"
        assert "token" in data
        assert data["user"]["username"] == username
        token = data["token"]

        # 2. Duplicate registration rejected
        res_dup = client.post("/api/auth/signup", json={
            "username": username,
            "email": f"diff_{unique_suffix}@example.com",
            "password": "mypassword123",
        })
        assert res_dup.status_code == 409

        # 3. Sign In with valid credentials
        res_in = client.post("/api/auth/signin", json={
            "username_or_email": username,
            "password": "mypassword123",
        })
        assert res_in.status_code == 200
        in_data = res_in.json()
        assert in_data["status"] == "success"
        assert in_data["user"]["email"] == email

        # 4. Sign In with invalid password rejected
        res_fail = client.post("/api/auth/signin", json={
            "username_or_email": username,
            "password": "wrongpassword",
        })
        assert res_fail.status_code == 401

        # 5. Access profile with token
        res_me = client.get("/api/auth/me", headers={"Authorization": f"Bearer {token}"})
        assert res_me.status_code == 200
        assert res_me.json()["username"] == username

        # 6. 1-Click Demo Login
        res_demo = client.post("/api/auth/demo")
        assert res_demo.status_code == 200
        assert res_demo.json()["user"]["username"] == "demo_engineer"
