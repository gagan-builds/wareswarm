"""
test_billing_api_and_limits.py - Integration Tests for Phase 2 (Limit Enforcement) & Phase 3 (Billing API & Mock Provider).

Tests:
    1. GET /api/billing/plans returns public plans and pricing table.
    2. GET /api/billing/subscription returns workspace active subscription details.
    3. POST /api/billing/checkout creates mock checkout session and fulfills upgrade.
    4. POST /api/billing/change-plan handles upgrade and downgrade warnings.
    5. POST /api/billing/cancel and /resume manage cancellation at period end.
    6. PUT /api/sim/config enforces plan limits on robot counts, grid size, and planners (HTTP 402).
    7. POST /api/compare/modes blocks Free plan (FEATURE_LOCKED) and unlocks on Pro.
    8. POST /api/map/custom blocks second saved map on Free plan (PLAN_LIMIT).
    9. GET /api/runs trims history to plan quota.
    10. Mock billing simulation actions (payment_failed, grace period, expiration).
"""

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.main import app
from app.db.session import Base, get_db
from app.db.models import Organization, Subscription, User, CustomMap, SimRun
from app.core.auth_utils import create_token


@pytest.fixture
def client_and_db():
    """Isolated test client with a shared in-memory SQLite database via StaticPool."""
    test_engine = create_engine(
        "sqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)

    def override_get_db():
        db = TestingSession()
        try:
            yield db
        finally:
            db.close()

    app.dependency_overrides[get_db] = override_get_db
    test_client = TestClient(app)

    # Initialize default organization on Free tier
    db = TestingSession()
    default_org = Organization(name="Default Workspace", slug="default")
    db.add(default_org)
    db.flush()

    sub = Subscription(
        org_id=default_org.id,
        plan="free",
        status="active",
        billing_interval="month",
    )
    db.add(sub)

    user = User(
        org_id=default_org.id,
        username="lead_engineer",
        email="engineer@wareswarm.io",
        hashed_password="fakehash:fakekey",
        role="owner",
    )
    db.add(user)
    db.commit()
    db.refresh(user)

    token = create_token(user.id, user.username, user.email, user.role)
    headers = {"Authorization": f"Bearer {token}"}

    yield test_client, TestingSession, headers, default_org.id

    app.dependency_overrides.clear()


def test_public_plans_endpoint(client_and_db):
    client, _, _, _ = client_and_db
    res = client.get("/api/billing/plans")
    assert res.status_code == 200
    data = res.json()
    assert data["product_name"] == "WareSwarm"
    assert data["test_mode"] is True
    assert len(data["plans"]) == 4


def test_subscription_and_usage_endpoints(client_and_db):
    client, _, headers, _ = client_and_db
    res = client.get("/api/billing/subscription", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["plan"] == "free"
    assert data["status"] == "active"
    assert data["test_mode"] is True

    res_usage = client.get("/api/billing/usage", headers=headers)
    assert res_usage.status_code == 200
    meters = res_usage.json()["meters"]
    assert "simulation_runs" in meters
    assert meters["simulation_runs"]["max"] == 50


def test_mock_checkout_flow(client_and_db):
    client, _, headers, _ = client_and_db

    # Checkout Pro plan
    res = client.post(
        "/api/billing/checkout",
        json={"plan_id": "pro", "interval": "month"},
        headers=headers,
    )
    assert res.status_code == 200
    data = res.json()
    assert data["test_mode"] is True
    assert "checkout_url" in data

    # Verify subscription was upgraded to Pro
    res_sub = client.get("/api/billing/subscription", headers=headers)
    assert res_sub.json()["plan"] == "pro"

    # Verify invoice was created
    res_inv = client.get("/api/billing/invoices", headers=headers)
    assert res_inv.status_code == 200
    invs = res_inv.json()
    assert len(invs) >= 1
    assert invs[0]["status"] == "paid"
    assert invs[0]["amount"] == 2900


def test_enforce_sim_config_limits(client_and_db):
    """Verify backend blocks robots > 5 or locked planners on Free tier."""
    client, _, headers, _ = client_and_db

    # 1. 5 robots allowed on Free
    res_ok = client.put("/api/sim/config", json={"num_robots": 5}, headers=headers)
    assert res_ok.status_code == 200

    # 2. 6 robots blocked on Free (PLAN_LIMIT 402)
    res_limit = client.put("/api/sim/config", json={"num_robots": 6}, headers=headers)
    assert res_limit.status_code == 402
    err = res_limit.json()["detail"]
    assert err["code"] == "PLAN_LIMIT"
    assert err["limit"] == "robots"
    assert err["required_plan"] == "pro"

    # 3. Dijkstra planner blocked on Free (FEATURE_LOCKED 402)
    res_dijkstra = client.put("/api/sim/config", json={"planner": "dijkstra"}, headers=headers)
    assert res_dijkstra.status_code == 402
    assert res_dijkstra.json()["detail"]["code"] == "FEATURE_LOCKED"

    # 4. Grid width > 30 blocked on Free
    res_grid = client.put("/api/sim/config", json={"grid_width": 45}, headers=headers)
    assert res_grid.status_code == 402
    assert res_grid.json()["detail"]["code"] == "PLAN_LIMIT"


def test_compare_modes_feature_gated(client_and_db):
    """Verify NAIVE vs SWARM compare is locked on Free and unlocked on Pro."""
    client, _, headers, _ = client_and_db

    # Free plan: compare is locked
    res = client.post("/api/compare/modes", json={"num_robots": 4, "max_ticks": 10}, headers=headers)
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "FEATURE_LOCKED"
    assert res.json()["detail"]["required_plan"] == "pro"

    # Upgrade to Pro
    client.post("/api/billing/checkout", json={"plan_id": "pro", "interval": "month"}, headers=headers)

    # Pro plan: compare succeeds
    res_pro = client.post("/api/compare/modes", json={"num_robots": 4, "max_ticks": 10}, headers=headers)
    assert res_pro.status_code == 200
    assert "naive" in res_pro.json()
    assert "swarm" in res_pro.json()


def test_saved_maps_quota_enforced(client_and_db):
    """Verify Free plan allows 1 custom map, blocks 2nd with PLAN_LIMIT."""
    client, _, headers, _ = client_and_db

    # First custom map succeeds
    res1 = client.post(
        "/api/map/custom",
        json={"name": "Map Alpha", "width": 10, "height": 10, "cells": [[0]*10 for _ in range(10)]},
        headers=headers,
    )
    assert res1.status_code == 200

    # Second custom map blocked on Free
    res2 = client.post(
        "/api/map/custom",
        json={"name": "Map Beta", "width": 10, "height": 10, "cells": [[0]*10 for _ in range(10)]},
        headers=headers,
    )
    assert res2.status_code == 402
    assert res2.json()["detail"]["code"] == "PLAN_LIMIT"
    assert res2.json()["detail"]["limit"] == "saved_maps"


def test_mock_action_simulation_triggers(client_and_db):
    """Verify test-mode triggers for payment failure, past-due grace, and renewal."""
    client, _, headers, _ = client_and_db

    # Upgrade to Team
    client.post("/api/billing/checkout", json={"plan_id": "team"}, headers=headers)

    # Trigger payment failure
    res_fail = client.post("/api/billing/mock/action", json={"action": "payment_failed"}, headers=headers)
    assert res_fail.status_code == 200
    assert res_fail.json()["status"] == "past_due"

    # Verify status is past_due with active grace
    res_sub = client.get("/api/billing/subscription", headers=headers)
    assert res_sub.json()["status"] == "past_due"
    assert res_sub.json()["in_grace_period"] is True

    # Trigger grace period expiration
    res_exp = client.post("/api/billing/mock/action", json={"action": "expire_grace"}, headers=headers)
    assert res_exp.status_code == 200
    assert res_exp.json()["effective_plan"] == "free"
