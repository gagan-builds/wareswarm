"""
routes_admin.py - Platform Administration & Operations REST API.

Purpose:
    Provides platform administrators with SaaS telemetry:
    - Real-time MRR (Monthly Recurring Revenue)
    - Active subscriptions & plan distribution
    - Trial and churn tracking
    - Organization search and plan override / complimentary accounts
    - System-wide security audit logging
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Optional, List

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.db.session import get_db
from app.db.models import (
    User,
    Organization,
    Subscription,
    UsageRecord,
    AuditLog,
    SimRun,
)
from app.api.routes_auth import get_current_user
from app.billing.plans import PLANS

router = APIRouter(prefix="/api/admin", tags=["admin"])


def require_platform_admin(user: User = Depends(get_current_user)) -> User:
    """Dependency verifying that the caller is a global platform administrator."""
    if not user:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Authentication required.")
    
    # Allow platform admin flag or username 'admin'
    if not (user.is_platform_admin or (user.role or "").lower() == "platform_admin" or user.username == "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Platform administrator privileges required.",
        )
    return user


class PlanOverrideRequest(BaseModel):
    plan: str  # "free", "pro", "team", "enterprise"
    duration_days: int = 30
    reason: str = "Admin comp override"


@router.get("/metrics")
def get_platform_metrics(
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    """
    Returns platform-wide business metrics:
    MRR, plan distribution, active trials, churned workspaces, and usage totals.
    """
    now = datetime.utcnow()

    total_orgs = db.query(Organization).count()
    total_users = db.query(User).count()
    total_sim_runs = db.query(SimRun).count()

    subscriptions = db.query(Subscription).all()

    # Plan distribution
    plan_dist = {"free": 0, "pro": 0, "team": 0, "enterprise": 0}
    active_trials = 0
    churned_count = 0
    calculated_mrr = 0.0

    # Monthly rates for MRR
    monthly_rates = {
        "free": 0.0,
        "pro": 29.0,
        "team": 99.0,
        "enterprise": 299.0,
    }

    for s in subscriptions:
        plan_key = (s.plan or "free").lower()
        plan_dist[plan_key] = plan_dist.get(plan_key, 0) + 1

        if s.status == "trialing":
            active_trials += 1

        if s.status == "canceled" or s.cancel_at_period_end:
            churned_count += 1

        if s.status in ("active", "trialing") and plan_key != "free":
            rate = monthly_rates.get(plan_key, 0.0)
            if s.billing_interval == "year":
                rate = (PLANS[plan_key].price_yearly / 12.0) if plan_key in PLANS else (rate * 0.83)
            calculated_mrr += rate

    # Total runs this month
    period_key = now.strftime("%Y-%m")
    runs_this_month = (
        db.query(func.sum(UsageRecord.count))
        .filter(UsageRecord.metric == "simulation_runs", UsageRecord.period == period_key)
        .scalar()
        or 0
    )

    return {
        "mrr": round(calculated_mrr, 2),
        "total_organizations": total_orgs,
        "total_users": total_users,
        "total_sim_runs": total_sim_runs,
        "runs_this_month": runs_this_month,
        "active_trials": active_trials,
        "churned_subscriptions": churned_count,
        "plan_distribution": plan_dist,
        "test_mode": True,
    }


@router.get("/organizations")
def list_organizations(
    search: Optional[str] = None,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    """Lists all organizations with their active plans, user counts, and statuses."""
    query = db.query(Organization)
    if search:
        query = query.filter(Organization.name.ilike(f"%{search}%"))

    orgs = query.order_by(Organization.created_at.desc()).limit(100).all()

    result = []
    for org in orgs:
        sub = org.subscription
        user_count = len(org.users)
        run_count = len(org.sim_runs)

        result.append({
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
            "created_at": org.created_at.isoformat() if org.created_at else None,
            "user_count": user_count,
            "run_count": run_count,
            "subscription": {
                "plan": sub.plan if sub else "free",
                "status": sub.status if sub else "active",
                "billing_interval": sub.billing_interval if sub else "month",
                "trial_end": sub.trial_end.isoformat() if sub and sub.trial_end else None,
            } if sub else None,
        })

    return {"organizations": result}


@router.post("/organizations/{org_id}/override-plan")
def override_organization_plan(
    org_id: int,
    req: PlanOverrideRequest,
    request: Request,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    """
    Grants a complimentary plan upgrade or override to an organization.
    Records the operation in the platform AuditLog.
    """
    org = db.query(Organization).filter(Organization.id == org_id).first()
    if not org:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found.")

    plan_key = req.plan.lower()
    if plan_key not in PLANS:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=f"Invalid plan '{req.plan}'.")

    sub = org.subscription
    now = datetime.utcnow()
    period_end = now + timedelta(days=req.duration_days)

    if not sub:
        sub = Subscription(
            org_id=org.id,
            plan=plan_key,
            status="active",
            billing_interval="month",
            current_period_start=now,
            current_period_end=period_end,
            provider="admin_override",
        )
        db.add(sub)
    else:
        old_plan = sub.plan
        sub.plan = plan_key
        sub.status = "active"
        sub.current_period_start = now
        sub.current_period_end = period_end
        sub.cancel_at_period_end = False

    # Security Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=admin.id,
        action="admin.plan_override",
        target_type="organization",
        target_id=str(org.id),
        details={
            "plan": plan_key,
            "duration_days": req.duration_days,
            "reason": req.reason,
            "admin_user": admin.username,
        },
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "message": f"Organization '{org.name}' upgraded to {plan_key.upper()} for {req.duration_days} days.",
        "organization_id": org.id,
        "new_plan": plan_key,
        "period_end": period_end.isoformat(),
    }


@router.get("/audit-logs")
def get_audit_logs(
    limit: int = 50,
    admin: User = Depends(require_platform_admin),
    db: Session = Depends(get_db),
):
    """Returns the most recent security and administrative audit log entries."""
    logs = (
        db.query(AuditLog)
        .order_by(AuditLog.created_at.desc())
        .limit(min(limit, 200))
        .all()
    )

    return {
        "audit_logs": [
            {
                "id": l.id,
                "org_id": l.org_id,
                "user_id": l.user_id,
                "action": l.action,
                "target_type": l.target_type,
                "target_id": l.target_id,
                "details": l.details,
                "ip_address": l.ip_address,
                "created_at": l.created_at.isoformat() if l.created_at else None,
            }
            for l in logs
        ]
    }
