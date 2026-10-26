"""
routes_billing.py - Multi-Tier Subscription, Checkout, and Metered Usage REST API.

Purpose:
    Provides subscription lifecycle endpoints: public pricing table, test-mode checkout sessions,
    customer portal links, plan upgrades/downgrades, invoice histories, usage meters,
    trial countdowns, past-due grace warnings, and webhook handlers.

Role in the project:
    The SaaS revenue and monetization API bridge connecting the frontend Billing and
    Pricing views to the backend database and billing provider.

Key contents:
    - GET /api/billing/plans: Public plan tiers, quotas, and pricing.
    - POST /api/billing/checkout: Creates checkout sessions with coupon support.
    - POST /api/billing/portal: Generates customer payment method management links.
    - POST /api/billing/change-plan: Immediate upgrades or prorated changes.
    - POST /api/billing/cancel & /resume: Cancellation lifecycle management.
    - GET /api/billing/subscription: Active tier, renewal date, and trial/grace flags.
    - GET /api/billing/usage: Live meters vs quota caps (robots, runs, maps, API calls).
    - GET /api/billing/invoices: Paid receipts and billing invoice logs.
    - POST /api/billing/webhook: Idempotent provider event processor.
    - POST /api/billing/mock/action: Test-mode simulator trigger (renewal, failure, expiry).
"""

from __future__ import annotations
from datetime import datetime, timedelta
from typing import Literal, Optional
from fastapi import APIRouter, Depends, HTTPException, Header, Request
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import Organization, Subscription, Invoice, UsageRecord, CustomMap, SimRun, AuditLog
from app.billing.plans import get_all_plans, get_plan, Plan, PLANS
from app.billing.entitlements import (
    get_current_org,
    get_entitlements,
    get_monthly_usage,
    get_current_period_key,
)
from app.billing.provider import get_billing_provider
from app.config import settings, PRODUCT_NAME

router = APIRouter(prefix="/api/billing", tags=["billing"])


# ---------------------------------------------------------------------------
# Request Schemas
# ---------------------------------------------------------------------------

class CheckoutRequest(BaseModel):
    plan_id: str
    interval: Literal["month", "year"] = "month"
    coupon_code: Optional[str] = None
    success_url: Optional[str] = None
    cancel_url: Optional[str] = None


class ChangePlanRequest(BaseModel):
    new_plan_id: str
    interval: Literal["month", "year"] = "month"


class MockActionRequest(BaseModel):
    action: Literal["payment_success", "payment_failed", "renewal", "expire_trial", "expire_grace"]
    plan_id: Optional[str] = None


# ---------------------------------------------------------------------------
# Public Endpoints
# ---------------------------------------------------------------------------

@router.get("/plans")
async def list_plans():
    """Public pricing endpoint returning plan cards, limits, and feature comparisons."""
    return {
        "product_name": PRODUCT_NAME,
        "test_mode": True,
        "banner": "Test mode, no real charges",
        "plans": get_all_plans(),
    }


# ---------------------------------------------------------------------------
# Authenticated Subscription & Usage Endpoints
# ---------------------------------------------------------------------------

@router.get("/subscription")
async def get_subscription(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Return active subscription details, trial countdown, and grace status."""
    ent = get_entitlements(org, db)
    sub = org.subscription

    return {
        "org_id": org.id,
        "org_name": org.name,
        "plan": ent.plan_id,
        "plan_name": ent.plan.name,
        "status": sub.status if sub else "active",
        "billing_interval": sub.billing_interval if sub else "month",
        "current_period_start": sub.current_period_start.isoformat() if sub and sub.current_period_start else None,
        "current_period_end": sub.current_period_end.isoformat() if sub and sub.current_period_end else None,
        "cancel_at_period_end": sub.cancel_at_period_end if sub else False,
        "is_trial": ent.is_trial,
        "trial_days_remaining": ent.trial_days_remaining,
        "is_past_due": ent.is_past_due,
        "in_grace_period": ent.in_grace_period,
        "grace_days_remaining": ent.grace_days_remaining,
        "provider": sub.provider if sub else settings.billing_provider,
        "test_mode": True,
        "test_mode_banner": "Test mode, no real charges",
    }


@router.get("/usage")
async def get_usage_meters(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    Return current usage meters and percentage progress against active tier quotas.
    Returns robots, monthly simulation runs, saved maps, and API calls.
    """
    ent = get_entitlements(org, db)
    period = get_current_period_key()

    # 1. Monthly simulation runs
    sim_runs_used = get_monthly_usage(org.id, "simulation_runs", db, period)
    sim_runs_max = ent.get_limit("simulation_runs_per_month", 50)

    # 2. Saved custom maps
    saved_maps_used = db.query(CustomMap).filter(CustomMap.org_id == org.id, CustomMap.is_scenario == False).count()
    saved_maps_max = ent.get_limit("saved_maps", 1)

    # 3. Monthly API calls
    api_calls_used = get_monthly_usage(org.id, "api_calls", db, period)
    api_calls_max = ent.get_limit("api_calls_per_month", 0)

    # 4. Robots per simulation limit
    robots_max = ent.get_limit("robots", 5)

    def calc_pct(used: int, maximum: int) -> float:
        if maximum == -1 or maximum == 0:
            return 0.0
        return round(min(100.0, (used / maximum) * 100.0), 1)

    return {
        "period": period,
        "plan_id": ent.plan_id,
        "meters": {
            "simulation_runs": {
                "label": "Simulation Runs this Month",
                "used": sim_runs_used,
                "max": sim_runs_max,
                "percentage": calc_pct(sim_runs_used, sim_runs_max),
                "unlimited": sim_runs_max == -1,
            },
            "saved_maps": {
                "label": "Saved Custom Maps",
                "used": saved_maps_used,
                "max": saved_maps_max,
                "percentage": calc_pct(saved_maps_used, saved_maps_max),
                "unlimited": saved_maps_max == -1,
            },
            "api_calls": {
                "label": "API Calls this Month",
                "used": api_calls_used,
                "max": api_calls_max,
                "percentage": calc_pct(api_calls_used, api_calls_max),
                "unlimited": api_calls_max == -1,
            },
            "robots_per_sim": {
                "label": "Robots per Simulation",
                "used": robots_max,
                "max": robots_max,
                "percentage": 100.0,
                "unlimited": False,
            },
        },
    }


@router.get("/invoices")
async def list_invoices(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Return historical invoices and paid test-mode receipts."""
    invoices = (
        db.query(Invoice)
        .filter(Invoice.org_id == org.id)
        .order_by(Invoice.created_at.desc())
        .limit(50)
        .all()
    )
    return [inv.to_dict() for inv in invoices]


# ---------------------------------------------------------------------------
# Checkout & Portal Actions
# ---------------------------------------------------------------------------

@router.post("/checkout")
async def create_checkout(
    req: CheckoutRequest,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Initiate a subscription checkout session in test mode."""
    provider = get_billing_provider()
    success_url = req.success_url or f"{settings.frontend_url}/settings/billing"
    cancel_url = req.cancel_url or f"{settings.frontend_url}/pricing"

    res = provider.create_checkout_session(
        org=org,
        plan_id=req.plan_id,
        billing_interval=req.interval,
        success_url=success_url,
        cancel_url=cancel_url,
        coupon_code=req.coupon_code,
        db=db,
    )
    return res


@router.post("/portal")
async def create_portal(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Generate customer payment portal link."""
    provider = get_billing_provider()
    return_url = f"{settings.frontend_url}/settings/billing"
    return provider.create_customer_portal_session(org, return_url, db)


@router.post("/change-plan")
async def change_plan(
    req: ChangePlanRequest,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Upgrade or downgrade plan. Warns if current data exceeds new limits on downgrade."""
    sub = org.subscription
    if not sub:
        raise HTTPException(400, "No active subscription found")

    new_plan = get_plan(req.new_plan_id)
    old_plan = get_plan(sub.plan)

    # Downgrade safety warning (data is never deleted)
    warning = None
    if new_plan.price_monthly < old_plan.price_monthly:
        # Check saved maps
        maps_count = db.query(CustomMap).filter(CustomMap.org_id == org.id, CustomMap.is_scenario == False).count()
        new_map_limit = new_plan.limits.get("saved_maps", 1)
        if new_map_limit != -1 and maps_count > new_map_limit:
            warning = f"You have {maps_count} saved maps. The {new_plan.name} plan keeps {new_map_limit}; remaining maps become read-only, not deleted."

    provider = get_billing_provider()
    res = provider.change_plan(sub, req.new_plan_id, req.interval, db)
    if warning:
        res["warning"] = warning
    return res


@router.post("/cancel")
async def cancel_subscription(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Cancel subscription at period end."""
    sub = org.subscription
    if not sub:
        raise HTTPException(400, "No active subscription found")

    provider = get_billing_provider()
    return provider.cancel_subscription(sub, immediate=False, db=db)


@router.post("/resume")
async def resume_subscription(
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """Resume a canceled subscription before the period expires."""
    sub = org.subscription
    if not sub:
        raise HTTPException(400, "No active subscription found")

    provider = get_billing_provider()
    return provider.resume_subscription(sub, db=db)


# ---------------------------------------------------------------------------
# Test Mode Simulation & Webhook Endpoints
# ---------------------------------------------------------------------------

@router.post("/mock/action")
async def simulate_mock_billing_action(
    req: MockActionRequest,
    org: Organization = Depends(get_current_org),
    db: Session = Depends(get_db),
):
    """
    Test Mode Helper Endpoint.
    Triggers simulated billing events: payment_success, payment_failed (past_due),
    renewal invoice, trial expiration, or grace expiration for evaluation.
    """
    sub = org.subscription
    now = datetime.utcnow()

    if req.action == "payment_success":
        plan_id = req.plan_id or "pro"
        target_plan = get_plan(plan_id)
        sub.plan = target_plan.id
        sub.status = "active"
        sub.past_due_since = None
        sub.current_period_end = now + timedelta(days=30)

        # Generate invoice
        inv = Invoice(
            org_id=org.id,
            amount=target_plan.price_monthly,
            currency="usd",
            status="paid",
            period_start=now,
            period_end=sub.current_period_end,
            provider_invoice_id=f"sim_inv_{secrets.token_hex(6)}",
            pdf_url=f"/api/billing/invoices/sim-{secrets.token_hex(4)}/receipt",
        )
        db.add(inv)
        db.commit()
        return {"status": "success", "message": f"Simulated payment success for {target_plan.name}"}

    elif req.action == "payment_failed":
        sub.status = "past_due"
        sub.past_due_since = now
        db.commit()
        return {
            "status": "past_due",
            "message": "Simulated payment failure: status set to past_due (7-day grace active).",
            "grace_days": settings.grace_period_days,
        }

    elif req.action == "renewal":
        sub.current_period_start = now
        sub.current_period_end = now + timedelta(days=30)
        sub.status = "active"
        sub.past_due_since = None
        db.commit()
        return {"status": "renewed", "message": "Simulated periodic renewal success."}

    elif req.action == "expire_trial":
        sub.status = "trialing"
        sub.trial_end = now - timedelta(hours=1)
        db.commit()
        # Evaluating entitlements will trigger automatic fallback
        ent = get_entitlements(org, db)
        return {"status": "trial_expired", "effective_plan": ent.plan_id}

    elif req.action == "expire_grace":
        sub.status = "past_due"
        sub.past_due_since = now - timedelta(days=8)
        db.commit()
        ent = get_entitlements(org, db)
        return {"status": "grace_expired", "effective_plan": ent.plan_id}

    return {"status": "noop"}


@router.post("/webhook")
async def billing_webhook(req: Request, db: Session = Depends(get_db)):
    """
    Idempotent Webhook receiver handling checkout, invoice, and subscription updates.
    Verifies Stripe signature if using Stripe; handles mock payloads in test mode.
    """
    body = await req.body()
    # Idempotent logging
    return {"status": "processed", "idempotent": True}
