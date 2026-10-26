"""
test_api_v1_and_admin.py - Integration tests for Public API v1 and Platform Admin operations.
"""

from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.db.models import Organization, Subscription, User, ApiKey, AuditLog, SimRun
from app.core.auth_utils import hash_password, create_token
from app.main import app


@pytest.fixture(name="admin_db")
def fixture_admin_db():
    engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(bind=engine)
    TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    db = TestingSessionLocal()
    try:
        yield db
    finally:
        db.close()


@pytest.fixture(name="client")
def fixture_client(admin_db):
    def override_get_db():
        try:
            yield admin_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_api_keys_and_v1_endpoints(client, admin_db):
    # Setup Org on Free plan
    org = Organization(name="RoboCorp", slug="robocorp")
    admin_db.add(org)
    admin_db.flush()

    sub = Subscription(org_id=org.id, plan="free", status="active", billing_interval="month")
    admin_db.add(sub)

    user = User(
        org_id=org.id,
        username="dev1",
        email="dev1@robocorp.com",
        hashed_password=hash_password("secret123"),
        role="owner",
    )
    admin_db.add(user)
    admin_db.commit()

    token = create_token(user.id, user.username, user.email, user.role)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Free plan cannot create API key -> Expect 402 PLAN_LIMIT
    res = client.post("/api/keys", headers=headers, json={"name": "CI Key", "scopes": ["read"]})
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "PLAN_LIMIT"

    # 2. Upgrade to Pro -> Can create 'read' key, but 'write' scope is locked
    sub.plan = "pro"
    admin_db.commit()

    res = client.post("/api/keys", headers=headers, json={"name": "CI Key", "scopes": ["write"]})
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "FEATURE_LOCKED"

    res = client.post("/api/keys", headers=headers, json={"name": "Read Key", "scopes": ["read"]})
    assert res.status_code == 201
    key_data = res.json()
    assert "api_key" in key_data
    raw_read_key = key_data["api_key"]

    # 3. Upgrade to Team -> Can create 'write' key
    sub.plan = "team"
    admin_db.commit()

    res = client.post("/api/keys", headers=headers, json={"name": "Write Key", "scopes": ["read", "write"]})
    assert res.status_code == 201
    raw_write_key = res.json()["api_key"]
    write_key_id = res.json()["status"]

    # 4. Public API v1: Health check
    res = client.get("/api/v1/health")
    assert res.status_code == 200
    assert res.json()["status"] == "healthy"

    # 5. Public API v1: Planner compare using Read Key
    v1_read_headers = {"Authorization": f"Bearer {raw_read_key}"}
    res = client.post(
        "/api/v1/planners/compare",
        headers=v1_read_headers,
        json={"map_preset": "warehouse", "start": [1, 1], "goal": [4, 4]},
    )
    assert res.status_code == 200
    comp = res.json()
    assert "astar" in comp
    assert "dijkstra" in comp
    assert comp["astar"]["success"] is True

    # 6. Read Key cannot call 'write' endpoint -> 403 Forbidden
    res = client.post(
        "/api/v1/simulations/run",
        headers=v1_read_headers,
        json={"map_preset": "warehouse", "num_robots": 3, "max_ticks": 20},
    )
    assert res.status_code == 403

    # 7. Write Key can call headless simulation run
    v1_write_headers = {"Authorization": f"Bearer {raw_write_key}"}
    res = client.post(
        "/api/v1/simulations/run",
        headers=v1_write_headers,
        json={"map_preset": "warehouse", "num_robots": 3, "max_ticks": 20},
    )
    assert res.status_code == 200
    run_res = res.json()
    assert run_res["status"] == "success"
    assert "run_id" in run_res
    run_id = run_res["run_id"]

    # 8. Fetch run by ID via v1
    res = client.get(f"/api/v1/runs/{run_id}", headers=v1_read_headers)
    assert res.status_code == 200
    assert res.json()["run_id"] == run_id

    # 9. Invalid key returns 401
    bad_headers = {"Authorization": "Bearer ws_live_invalid_key_123"}
    res = client.get(f"/api/v1/runs/{run_id}", headers=bad_headers)
    assert res.status_code == 401


def test_platform_admin_operations(client, admin_db):
    # Setup regular user and platform admin user
    org = Organization(name="LogiTech", slug="logitech")
    admin_db.add(org)
    admin_db.flush()

    sub = Subscription(org_id=org.id, plan="free", status="active", billing_interval="month")
    admin_db.add(sub)

    regular_user = User(
        org_id=org.id,
        username="regular_joe",
        email="joe@logitech.com",
        hashed_password=hash_password("secret123"),
        role="member",
        is_platform_admin=False,
    )
    platform_admin = User(
        org_id=org.id,
        username="superadmin",
        email="admin@wareswarm.io",
        hashed_password=hash_password("adminpass"),
        role="platform_admin",
        is_platform_admin=True,
    )
    admin_db.add_all([regular_user, platform_admin])
    admin_db.commit()

    reg_token = create_token(regular_user.id, regular_user.username, regular_user.email, regular_user.role)
    admin_token = create_token(platform_admin.id, platform_admin.username, platform_admin.email, platform_admin.role)

    # 1. Regular user forbidden from admin metrics
    res = client.get("/api/admin/metrics", headers={"Authorization": f"Bearer {reg_token}"})
    assert res.status_code == 403

    # 2. Platform admin can access metrics
    admin_headers = {"Authorization": f"Bearer {admin_token}"}
    res = client.get("/api/admin/metrics", headers=admin_headers)
    assert res.status_code == 200
    metrics = res.json()
    assert "mrr" in metrics
    assert "total_organizations" in metrics
    assert "plan_distribution" in metrics

    # 3. List organizations
    res = client.get("/api/admin/organizations", headers=admin_headers)
    assert res.status_code == 200
    orgs = res.json()["organizations"]
    assert len(orgs) >= 1

    # 4. Comp plan override for LogiTech org to Enterprise
    res = client.post(
        f"/api/admin/organizations/{org.id}/override-plan",
        headers=admin_headers,
        json={"plan": "enterprise", "duration_days": 90, "reason": "VIP Pilot Evaluation"},
    )
    assert res.status_code == 200
    assert res.json()["new_plan"] == "enterprise"

    # Verify updated subscription in database
    admin_db.refresh(sub)
    assert sub.plan == "enterprise"

    # 5. Verify security audit log entry
    res = client.get("/api/admin/audit-logs", headers=admin_headers)
    assert res.status_code == 200
    logs = res.json()["audit_logs"]
    assert len(logs) >= 1
    actions = [l["action"] for l in logs]
    assert "admin.plan_override" in actions
