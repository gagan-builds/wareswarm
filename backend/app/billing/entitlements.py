"""
entitlements.py - SaaS Entitlement, Quota Enforcement & Feature Gating Engine.

Purpose:
    Evaluates workspace subscription status (accounting for active trials and
    past-due grace periods), determines effective quotas, checks limits, and
    provides FastAPI route dependencies for feature and limit gating.

Role in the project:
    Core backend security & revenue enforcement layer. Guarantees that no client
    can bypass plan limits (robots, grid size, planners, saved maps, runs/month).
    Never trusts frontend claims.

Key contents:
    - Entitlements: Data container with effective plan, limits, and grace/trial status.
    - get_entitlements(): Calculates active quotas with trial expiry & grace handling.
    - get_current_org(): FastAPI dependency resolving active workspace from token or default org.
    - require_feature(): FastAPI dependency gating endpoints behind feature flags.
    - validate_sim_config(): Validates robot count, grid dimensions, planner, and preset against plan.
    - check_and_consume_sim_run(): Enforces and atomically consumes monthly simulation run quotas.
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Any, Callable, Optional
from fastapi import HTTPException, Depends, Request, Header
from sqlalchemy.orm import Session
from sqlalchemy import select, update

from app.db.session import get_db
from app.db.models import Organization, Subscription, UsageRecord, User
from app.billing.plans import get_plan, Plan, PLANS
from app.config import settings


class Entitlements:
    """Computed runtime permissions and quotas for an Organization."""

    def __init__(
        self,
        org: Organization,
        subscription: Subscription,
        effective_plan: Plan,
        is_trial: bool = False,
        trial_days_remaining: int = 0,
        is_past_due: bool = False,
        grace_days_remaining: int = 0,
        in_grace_period: bool = False,
    ):
        self.org = org
        self.subscription = subscription
        self.plan = effective_plan
        self.is_trial = is_trial
        self.trial_days_remaining = trial_days_remaining
        self.is_past_due = is_past_due
        self.grace_days_remaining = grace_days_remaining
        self.in_grace_period = in_grace_period

    @property
    def plan_id(self) -> str:
        return self.plan.id

    @property
    def limits(self) -> dict[str, Any]:
        if not settings.enforce_subscription_limits:
            return {
                "robots": 30,
                "max_grid_width": 60,
                "max_grid_height": 40,
                "map_presets": ["*"],
                "saved_maps": -1,
                "saved_runs": -1,
                "simulation_runs_per_month": -1,
                "planners": ["*"],
                "coordination_modes": ["*"],
                "team_members": -1,
                "api_calls_per_month": -1,
                "api_rate_limit_per_min": 600,
            }
        return self.plan.limits

    @property
    def features(self) -> dict[str, Any]:
        if not settings.enforce_subscription_limits:
            return {
                "benchmarks_compare": True,
                "heatmap": True,
                "replay": True,
                "export_csv_json": True,
                "export_pdf": True,
                "api_access": "read_write",
                "priority_tuning": True,
                "scheduled_benchmarks": True,
                "scenario_library": True,
                "share_links": True,
                "support": "community",
                "watermark": False,
            }
        return self.plan.features

    def get_limit(self, key: str, default: Any = None) -> Any:
        if not settings.enforce_subscription_limits:
            if key in ("planners", "map_presets", "coordination_modes"):
                return ["*"]
            if key == "robots":
                return 30
            if key == "max_grid_width":
                return 60
            if key == "max_grid_height":
                return 40
            return -1
        return self.limits.get(key, default)

    def has_feature(self, key: str) -> bool:
        if not settings.enforce_subscription_limits:
            if key == "watermark":
                return False
            return True
        val = self.features.get(key, False)
        return bool(val)

    def to_dict(self) -> dict[str, Any]:
        return {
            "org_id": self.org.id,
            "org_name": self.org.name,
            "plan_id": self.plan_id,
            "plan_name": self.plan.name,
            "status": self.subscription.status,
            "is_trial": self.is_trial,
            "trial_days_remaining": self.trial_days_remaining,
            "is_past_due": self.is_past_due,
            "in_grace_period": self.in_grace_period,
            "grace_days_remaining": self.grace_days_remaining,
            "limits": self.limits,
            "features": self.features,
            "watermark": self.features.get("watermark", False),
        }


def get_current_period_key(reference_date: datetime | None = None) -> str:
    """Format year-month string for usage tracking partitioning (e.g. '2026-10')."""
    dt = reference_date or datetime.utcnow()
    return dt.strftime("%Y-%m")


def get_entitlements(org: Organization, db: Session | None = None) -> Entitlements:
    """
    Calculate the effective entitlement permissions for an organization.
    Handles trial countdown and 7-day past-due grace period.
    """
    sub = org.subscription
    now = datetime.utcnow()

    # Fallback to Free if organization has no subscription record
    if not sub:
        free_plan = get_plan("free")
        sub = Subscription(
            org_id=org.id,
            plan="free",
            status="active",
            billing_interval="month",
            current_period_start=now,
        )
        return Entitlements(
            org=org,
            subscription=sub,
            effective_plan=free_plan,
        )

    configured_plan = get_plan(sub.plan)
    effective_plan = configured_plan
    is_trial = False
    trial_days_remaining = 0
    is_past_due = False
    in_grace_period = False
    grace_days_remaining = 0

    # 1. Handle Trial Evaluation
    if sub.status == "trialing":
        if sub.trial_end and now > sub.trial_end:
            effective_plan = get_plan("free")
            if db:
                sub.status = "active"
                sub.plan = "free"
                db.commit()
        else:
            is_trial = True
            if sub.trial_end:
                delta = sub.trial_end - now
                trial_days_remaining = max(0, delta.days + (1 if delta.seconds > 0 else 0))
            else:
                trial_days_remaining = settings.trial_duration_days

    # 2. Handle Failed Payment / Past Due
    elif sub.status == "past_due":
        is_past_due = True
        grace_limit = timedelta(days=settings.grace_period_days)
        past_due_start = sub.past_due_since or sub.updated_at or now

        if now - past_due_start > grace_limit:
            effective_plan = get_plan("free")
            if db:
                sub.status = "canceled"
                sub.plan = "free"
                db.commit()
        else:
            in_grace_period = True
            remaining = grace_limit - (now - past_due_start)
            grace_days_remaining = max(0, remaining.days + (1 if remaining.seconds > 0 else 0))

    # 3. Handle Canceled Subscriptions
    elif sub.status == "canceled":
        effective_plan = get_plan("free")

    return Entitlements(
        org=org,
        subscription=sub,
        effective_plan=effective_plan,
        is_trial=is_trial,
        trial_days_remaining=trial_days_remaining,
        is_past_due=is_past_due,
        grace_days_remaining=grace_days_remaining,
        in_grace_period=in_grace_period,
    )


# ---------------------------------------------------------------------------
# Organization Resolver Dependency
# ---------------------------------------------------------------------------

def get_current_org(
    authorization: Optional[str] = Header(None),
    db: Session = Depends(get_db),
) -> Organization:
    """Dependency extracting the user's workspace Organization, falling back to Default Workspace."""
    from app.api.routes_auth import get_current_user
    user = get_current_user(authorization=authorization, db=db)
    if user and user.org_id:
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if org:
            return org

    default_org = db.query(Organization).filter(Organization.slug == "default").first()
    if not default_org:
        from app.db.session import migrate_to_default_org
        migrate_to_default_org(db)
        default_org = db.query(Organization).filter(Organization.slug == "default").first()
    return default_org


# ---------------------------------------------------------------------------
# Usage Tracking & Metering
# ---------------------------------------------------------------------------

def get_monthly_usage(org_id: int, metric: str, db: Session, period: str | None = None) -> int:
    """Retrieve current consumption count for a given metric in the billing period."""
    p = period or get_current_period_key()
    record = (
        db.query(UsageRecord)
        .filter(UsageRecord.org_id == org_id, UsageRecord.metric == metric, UsageRecord.period == p)
        .first()
    )
    return record.count if record else 0


def increment_monthly_usage(org_id: int, metric: str, amount: int = 1, db: Session | None = None) -> int:
    """Atomically increment usage counter for an organization's current billing period."""
    if db is None:
        return 0

    period = get_current_period_key()
    record = (
        db.query(UsageRecord)
        .filter(UsageRecord.org_id == org_id, UsageRecord.metric == metric, UsageRecord.period == period)
        .first()
    )
    if not record:
        record = UsageRecord(
            org_id=org_id,
            metric=metric,
            period=period,
            count=amount,
            updated_at=datetime.utcnow(),
        )
        db.add(record)
    else:
        record.count += amount
        record.updated_at = datetime.utcnow()

    db.commit()
    db.refresh(record)
    return record.count


# ---------------------------------------------------------------------------
# Fast Resolution Helpers
# ---------------------------------------------------------------------------

def find_plan_for_feature(feature_name: str) -> str:
    """Determine minimum required tier that enables a specific feature."""
    for tier in ("pro", "team", "enterprise"):
        plan = PLANS.get(tier)
        if plan and plan.features.get(feature_name):
            return tier
    return "pro"


def find_plan_for_limit(limit_name: str, value: int | float) -> str:
    """Determine minimum required tier that satisfies a numerical limit."""
    for tier in ("free", "pro", "team", "enterprise"):
        plan = PLANS.get(tier)
        if not plan:
            continue
        max_val = plan.limits.get(limit_name)
        if max_val is None:
            continue
        if max_val == -1 or value <= max_val:
            return tier
    return "enterprise"


def raise_feature_locked(feature_name: str, required_plan: str | None = None):
    """Raise standardized 402 HTTP exception for locked premium features."""
    req_plan = required_plan or find_plan_for_feature(feature_name)
    raise HTTPException(
        status_code=402,
        detail={
            "code": "FEATURE_LOCKED",
            "feature": feature_name,
            "required_plan": req_plan,
            "message": f"Feature '{feature_name}' requires the {req_plan.capitalize()} plan.",
            "upgrade_url": "/pricing",
        },
    )


def raise_plan_limit(limit_name: str, current: Any, max_val: Any, required_plan: str | None = None):
    """Raise standardized 402 HTTP exception when numerical plan quota is reached."""
    req_plan = required_plan or find_plan_for_limit(limit_name, current)
    raise HTTPException(
        status_code=402,
        detail={
            "code": "PLAN_LIMIT",
            "limit": limit_name,
            "current": current,
            "max": max_val,
            "required_plan": req_plan,
            "message": f"Plan limit reached for '{limit_name}' ({current}/{max_val}). Upgrade to {req_plan.capitalize()}.",
            "upgrade_url": "/pricing",
        },
    )


# ---------------------------------------------------------------------------
# Simulation Config Validator
# ---------------------------------------------------------------------------

def validate_sim_config(cfg_dict: dict[str, Any], org: Organization, db: Session):
    """
    Validates simulation configuration against plan limits.
    When enforce_subscription_limits is False, all configurations are permitted.
    """
    if not settings.enforce_subscription_limits:
        return
    ent = get_entitlements(org, db)
    num_robots = cfg_dict.get("num_robots")
    if num_robots is not None:
        max_robots = ent.get_limit("robots", 5)
        if max_robots != -1 and num_robots > max_robots:
            raise_plan_limit("robots", num_robots, max_robots)
    planner = cfg_dict.get("planner")
    if planner is not None:
        allowed = ent.get_limit("planners", ["astar"])
        if "*" not in allowed and planner not in allowed:
            raise_feature_locked(f"planner:{planner}")
    gw = cfg_dict.get("grid_width")
    if gw is not None:
        max_w = ent.get_limit("max_grid_width", 30)
        if max_w != -1 and gw > max_w:
            raise_plan_limit("max_grid_width", gw, max_w)
    gh = cfg_dict.get("grid_height")
    if gh is not None:
        max_h = ent.get_limit("max_grid_height", 20)
        if max_h != -1 and gh > max_h:
            raise_plan_limit("max_grid_height", gh, max_h)


# ---------------------------------------------------------------------------
# FastAPI Route Dependencies
# ---------------------------------------------------------------------------

def require_feature(feature_name: str):
    """
    Gating dependency for premium SaaS features.
    When enforce_subscription_limits is False, features are automatically unlocked.
    """
    def dependency(
        authorization: Optional[str] = Header(None),
        db: Session = Depends(get_db),
    ):
        org = get_current_org(authorization=authorization, db=db)
        if not settings.enforce_subscription_limits:
            return get_entitlements(org, db)
        ent = get_entitlements(org, db)
        if not ent.has_feature(feature_name):
            raise_feature_locked(feature_name)
        return ent

    return dependency


def check_and_consume_sim_run(org: Organization, db: Session):
    """
    Enforces monthly simulation run quotas and increments usage counter.
    When enforce_subscription_limits is False, runs are unlimited.
    """
    if not settings.enforce_subscription_limits:
        increment_monthly_usage(org.id, "simulation_runs", 1, db)
        return
    ent = get_entitlements(org, db)
    max_runs = ent.get_limit("simulation_runs_per_month", 50)
    current = get_monthly_usage(org.id, "simulation_runs", db)
    if max_runs != -1 and current >= max_runs:
        raise_plan_limit("simulation_runs_per_month", current, max_runs, required_plan="pro")
    increment_monthly_usage(org.id, "simulation_runs", 1, db)
