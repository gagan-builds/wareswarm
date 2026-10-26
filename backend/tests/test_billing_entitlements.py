"""
test_billing_entitlements.py - Unit & Integration Tests for SaaS Entitlements Engine.

Tests:
    1. Plan definitions (free, pro, team, enterprise) and pricing structures.
    2. get_entitlements calculation for active tiers.
    3. Trial lifecycle (active 14-day trial countdown, trial expiry fallback to Free).
    4. Past-due payment grace period (7-day active grace, post-grace fallback to Free).
    5. Quota validation (robots, grid size, planners, monthly simulation runs).
    6. Feature gating (heatmap, compare, export_pdf, watermark).
    7. Atomic monthly usage counters.
"""

from datetime import datetime, timedelta
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.db.session import Base
from app.db.models import Organization, Subscription, User
from app.billing.plans import PLANS, get_plan, get_all_plans
from app.billing.entitlements import (
    get_entitlements,
    get_monthly_usage,
    increment_monthly_usage,
    find_plan_for_feature,
    find_plan_for_limit,
    raise_feature_locked,
    raise_plan_limit,
    check_and_consume_sim_run,
)
from fastapi import HTTPException


@pytest.fixture
def db_session():
    """In-memory SQLite session for isolated billing and entitlement tests."""
    test_engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(test_engine)
    TestingSession = sessionmaker(autocommit=False, autoflush=False, bind=test_engine)
    session = TestingSession()
    try:
        yield session
    finally:
        session.close()


def test_plans_definition():
    """Verify that all four required tiers exist with exact specified quotas and pricing."""
    all_plans = get_all_plans()
    assert len(all_plans) == 4

    # 1. Free plan
    free = get_plan("free")
    assert free.price_monthly == 0
    assert free.price_yearly == 0
    assert free.limits["robots"] == 5
    assert free.limits["max_grid_width"] == 30
    assert free.limits["max_grid_height"] == 20
    assert free.limits["saved_maps"] == 1
    assert free.limits["saved_runs"] == 5
    assert free.limits["simulation_runs_per_month"] == 50
    assert free.features["watermark"] is True
    assert free.features["export_pdf"] is False
    assert free.features["heatmap"] is False

    # 2. Pro plan ($29/mo, $290/yr)
    pro = get_plan("pro")
    assert pro.price_monthly == 2900
    assert pro.price_yearly == 29000
    assert pro.limits["robots"] == 20
    assert pro.limits["max_grid_width"] == 60
    assert pro.limits["max_grid_height"] == 40
    assert pro.limits["saved_maps"] == 20
    assert pro.limits["saved_runs"] == 200
    assert pro.limits["simulation_runs_per_month"] == 1000
    assert pro.features["watermark"] is False
    assert pro.features["heatmap"] is True
    assert pro.features["benchmarks_compare"] is True
    assert pro.features["export_pdf"] is False

    # 3. Team plan ($99/mo, $990/yr)
    team = get_plan("team")
    assert team.price_monthly == 9900
    assert team.price_yearly == 99000
    assert team.limits["robots"] == 30
    assert team.limits["max_grid_width"] == 100
    assert team.limits["max_grid_height"] == 60
    assert team.limits["saved_maps"] == 200
    assert team.limits["saved_runs"] == 2000
    assert team.limits["simulation_runs_per_month"] == 10000
    assert team.features["export_pdf"] is True
    assert team.features["priority_tuning"] is True
    assert team.features["scheduled_benchmarks"] is True

    # 4. Enterprise plan
    enterprise = get_plan("enterprise")
    assert enterprise.limits["robots"] == 100
    assert enterprise.limits["simulation_runs_per_month"] == -1  # unlimited
    assert enterprise.limits["saved_maps"] == -1
    assert enterprise.features["watermark"] is False


def test_entitlements_active_tiers(db_session):
    """Verify get_entitlements correctly resolves active subscriptions."""
    org = Organization(name="RoboCorp", slug="robocorp")
    db_session.add(org)
    db_session.flush()

    # Default to Free
    sub = Subscription(org_id=org.id, plan="free", status="active")
    db_session.add(sub)
    db_session.commit()

    ent = get_entitlements(org, db_session)
    assert ent.plan_id == "free"
    assert ent.get_limit("robots") == 5
    assert ent.has_feature("watermark") is True
    assert ent.has_feature("heatmap") is False

    # Upgrade to Pro
    sub.plan = "pro"
    db_session.commit()
    ent_pro = get_entitlements(org, db_session)
    assert ent_pro.plan_id == "pro"
    assert ent_pro.get_limit("robots") == 20
    assert ent_pro.has_feature("heatmap") is True
    assert ent_pro.has_feature("export_pdf") is False

    # Upgrade to Team
    sub.plan = "team"
    db_session.commit()
    ent_team = get_entitlements(org, db_session)
    assert ent_team.plan_id == "team"
    assert ent_team.get_limit("robots") == 30
    assert ent_team.has_feature("export_pdf") is True


def test_trial_lifecycle(db_session):
    """Verify 14-day Pro trial countdown and automatic fallback upon expiry."""
    org = Organization(name="TrialStartup", slug="trialstartup")
    db_session.add(org)
    db_session.flush()

    # Active 14-day trial of Pro
    now = datetime.utcnow()
    sub = Subscription(
        org_id=org.id,
        plan="pro",
        status="trialing",
        trial_start=now,
        trial_end=now + timedelta(days=14),
    )
    db_session.add(sub)
    db_session.commit()

    ent = get_entitlements(org, db_session)
    assert ent.plan_id == "pro"
    assert ent.is_trial is True
    assert ent.trial_days_remaining == 14
    assert ent.has_feature("heatmap") is True

    # Fast-forward trial past expiration
    sub.trial_end = now - timedelta(hours=1)
    db_session.commit()

    ent_expired = get_entitlements(org, db_session)
    assert ent_expired.plan_id == "free"
    assert ent_expired.is_trial is False
    assert ent_expired.get_limit("robots") == 5


def test_past_due_grace_period(db_session):
    """Verify 7-day grace period keeps features active and downgrades only after grace expires."""
    org = Organization(name="GraceFleet", slug="gracefleet")
    db_session.add(org)
    db_session.flush()

    now = datetime.utcnow()
    sub = Subscription(
        org_id=org.id,
        plan="team",
        status="past_due",
        past_due_since=now - timedelta(days=2),
    )
    db_session.add(sub)
    db_session.commit()

    # Within 7-day grace: team features still work with active warning flag
    ent = get_entitlements(org, db_session)
    assert ent.plan_id == "team"
    assert ent.is_past_due is True
    assert ent.in_grace_period is True
    assert ent.grace_days_remaining == 5
    assert ent.has_feature("export_pdf") is True

    # Past 7-day grace: downgraded to Free, data preserved
    sub.past_due_since = now - timedelta(days=8)
    db_session.commit()

    ent_expired = get_entitlements(org, db_session)
    assert ent_expired.plan_id == "free"
    assert ent_expired.in_grace_period is False
    assert ent_expired.has_feature("export_pdf") is False


def test_monthly_usage_and_limit_enforcement(db_session):
    """Test monthly simulation run counting and limit exceptions."""
    org = Organization(name="UsageLab", slug="usagelab")
    db_session.add(org)
    db_session.flush()

    sub = Subscription(org_id=org.id, plan="free", status="active")
    db_session.add(sub)
    db_session.commit()

    # Initial usage is 0
    assert get_monthly_usage(org.id, "simulation_runs", db_session) == 0

    # Increment usage up to limit
    count = increment_monthly_usage(org.id, "simulation_runs", 49, db_session)
    assert count == 49

    # 50th run succeeds
    check_and_consume_sim_run(org, db_session)
    assert get_monthly_usage(org.id, "simulation_runs", db_session) == 50

    # 51st run triggers PLAN_LIMIT 402 HTTP exception
    with pytest.raises(HTTPException) as exc_info:
        check_and_consume_sim_run(org, db_session)
    assert exc_info.value.status_code == 402
    assert exc_info.value.detail["code"] == "PLAN_LIMIT"
    assert exc_info.value.detail["limit"] == "simulation_runs_per_month"
    assert exc_info.value.detail["required_plan"] == "pro"


def test_find_plan_helpers():
    """Verify helper utilities correctly compute required upgrade tiers."""
    assert find_plan_for_feature("heatmap") == "pro"
    assert find_plan_for_feature("export_pdf") == "team"
    assert find_plan_for_feature("priority_tuning") == "team"

    assert find_plan_for_limit("robots", 4) == "free"
    assert find_plan_for_limit("robots", 5) == "free"
    assert find_plan_for_limit("robots", 12) == "pro"
    assert find_plan_for_limit("robots", 25) == "team"
    assert find_plan_for_limit("robots", 50) == "enterprise"
