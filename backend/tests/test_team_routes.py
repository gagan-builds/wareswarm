"""
test_team_routes.py - Integration tests for team seats and collaboration.
"""

from __future__ import annotations
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from app.db.session import Base, get_db
from app.db.models import Organization, Subscription, User, TeamInvite
from app.core.auth_utils import hash_password, create_token
from app.main import app


@pytest.fixture(name="team_db")
def fixture_team_db():
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
def fixture_client(team_db):
    def override_get_db():
        try:
            yield team_db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as test_client:
        yield test_client
    app.dependency_overrides.clear()


def test_team_seat_limits_and_invites(client, team_db):
    # Setup Org with Free plan (seat limit: 1)
    org = Organization(name="RoboCorp Free", slug="robocorp-free")
    team_db.add(org)
    team_db.flush()

    sub = Subscription(org_id=org.id, plan="free", status="active", billing_interval="month")
    team_db.add(sub)

    owner = User(
        org_id=org.id,
        username="owner1",
        email="owner1@robocorp.com",
        hashed_password=hash_password("password123"),
        role="owner",
    )
    team_db.add(owner)
    team_db.commit()

    token = create_token(owner.id, owner.username, owner.email, owner.role)
    headers = {"Authorization": f"Bearer {token}"}

    # 1. Fetch team members list
    res = client.get("/api/team/members", headers=headers)
    assert res.status_code == 200
    data = res.json()
    assert data["seats_limit"] == 1
    assert data["seats_used"] == 1
    assert len(data["members"]) == 1

    # 2. Free plan cannot invite more than 1 seat -> Expect 402 PLAN_LIMIT
    res = client.post("/api/team/invite", headers=headers, json={"email": "colleague@robocorp.com", "role": "member"})
    assert res.status_code == 402
    assert res.json()["detail"]["code"] == "PLAN_LIMIT"
    assert res.json()["detail"]["limit"] == "team_members"

    # 3. Upgrade Org to Team plan (seat limit: 10)
    sub.plan = "team"
    team_db.commit()

    # Re-attempt invite -> should succeed
    res = client.post("/api/team/invite", headers=headers, json={"email": "colleague@robocorp.com", "role": "member"})
    assert res.status_code == 200
    invite_data = res.json()
    assert invite_data["status"] == "success"
    invite_token = invite_data["invite"]["token"]

    # 4. Create another user and accept invite
    member_user = User(
        username="colleague1",
        email="colleague@robocorp.com",
        hashed_password=hash_password("password123"),
        role="member",
    )
    team_db.add(member_user)
    team_db.commit()

    member_token = create_token(member_user.id, member_user.username, member_user.email, member_user.role)
    member_headers = {"Authorization": f"Bearer {member_token}"}

    res = client.post("/api/team/accept-invite", headers=member_headers, json={"token": invite_token})
    assert res.status_code == 200
    assert res.json()["org_id"] == org.id

    # 5. Check team list again -> 2 members
    res = client.get("/api/team/members", headers=headers)
    assert res.status_code == 200
    assert res.json()["seats_used"] == 2

    # 6. Member cannot invite others (only owner/admin)
    res = client.post("/api/team/invite", headers=member_headers, json={"email": "third@robocorp.com", "role": "member"})
    assert res.status_code == 403

    # 7. Owner can change role of colleague to admin
    res = client.patch(f"/api/team/members/{member_user.id}/role", headers=headers, json={"role": "admin"})
    assert res.status_code == 200

    # 8. Admin colleague can now invite someone
    res = client.post("/api/team/invite", headers=member_headers, json={"email": "engineer@robocorp.com", "role": "member"})
    assert res.status_code == 200
