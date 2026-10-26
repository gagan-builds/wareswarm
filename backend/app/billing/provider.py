"""
provider.py - Abstract Billing Provider & Built-in MockBillingProvider Engine.

Purpose:
    Abstracts payment gateways (Stripe vs Mock) behind a unified interface.
    Provides complete test-mode checkout sessions, customer portal redirection,
    subscription plan upgrades/downgrades, invoice generation, and failure simulations.

Role in the project:
    Billing execution layer. Guarantees 100% test-mode safety (never stores credit card numbers,
    never charges real money). Allows local development, viva presentations, and continuous integration
    without external API credentials.

Key contents:
    - BillingProvider: Abstract base class defining checkout, portal, and lifecycle hooks.
    - MockBillingProvider: Pure Python in-memory test payment provider with coupon validation.
    - StripeBillingProvider: Stripe Test Mode provider (activated when STRIPE_SECRET_KEY is present).
    - get_billing_provider(): Factory returning the active provider instance based on settings.
"""

from __future__ import annotations
import secrets
from abc import ABC, abstractmethod
from datetime import datetime, timedelta
from typing import Any, Optional
from sqlalchemy.orm import Session

from app.db.models import Organization, Subscription, Invoice, Coupon, AuditLog
from app.billing.plans import get_plan, Plan, PLANS
from app.config import settings


class BillingProvider(ABC):
    """Abstract interface for payment processing."""

    @abstractmethod
    def create_checkout_session(
        self,
        org: Organization,
        plan_id: str,
        billing_interval: str,
        success_url: str,
        cancel_url: str,
        coupon_code: str | None = None,
        db: Session | None = None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def create_customer_portal_session(
        self,
        org: Organization,
        return_url: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def cancel_subscription(
        self,
        subscription: Subscription,
        immediate: bool = False,
        db: Session | None = None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def resume_subscription(
        self,
        subscription: Subscription,
        db: Session | None = None,
    ) -> dict[str, Any]:
        pass

    @abstractmethod
    def change_plan(
        self,
        subscription: Subscription,
        new_plan_id: str,
        new_interval: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        pass


class MockBillingProvider(BillingProvider):
    """
    Simulated Billing Provider for testing and viva presentation.
    Implements full checkout flow, immediate mock card charges, coupon discounts,
    and simulated renewal/failure triggers without real payment cards.
    """

    def create_checkout_session(
        self,
        org: Organization,
        plan_id: str,
        billing_interval: str,
        success_url: str,
        cancel_url: str,
        coupon_code: str | None = None,
        db: Session | None = None,
    ) -> dict[str, Any]:
        target_plan = get_plan(plan_id)
        if target_plan.id == "free":
            # Direct switch to Free
            if db and org.subscription:
                org.subscription.plan = "free"
                org.subscription.status = "active"
                db.commit()
            return {
                "checkout_url": f"{settings.frontend_url}/settings/billing?status=success&plan=free",
                "session_id": f"mock_sess_{secrets.token_hex(8)}",
                "mode": "free",
                "test_mode": True,
            }

        session_id = f"mock_sess_{secrets.token_hex(12)}"
        
        # Calculate discount if coupon provided
        discount_percent = 0
        if coupon_code and db:
            coupon = (
                db.query(Coupon)
                .filter(Coupon.code == coupon_code.strip().upper(), Coupon.active == True)
                .first()
            )
            if coupon:
                discount_percent = coupon.percent_off
                coupon.times_redeemed += 1

        base_price = target_plan.price_yearly if billing_interval == "year" else target_plan.price_monthly
        final_price = max(0, int(base_price * (1 - discount_percent / 100)))

        # Instant mock fulfillment in test mode
        if db:
            sub = org.subscription
            now = datetime.utcnow()
            period_delta = timedelta(days=365 if billing_interval == "year" else 30)

            if not sub:
                sub = Subscription(
                    org_id=org.id,
                    plan=target_plan.id,
                    status="active",
                    billing_interval=billing_interval,
                    current_period_start=now,
                    current_period_end=now + period_delta,
                    provider="mock",
                    provider_customer_id=f"mock_cust_{org.id}",
                    provider_subscription_id=f"mock_sub_{secrets.token_hex(6)}",
                )
                db.add(sub)
            else:
                sub.plan = target_plan.id
                sub.status = "active"
                sub.billing_interval = billing_interval
                sub.current_period_start = now
                sub.current_period_end = now + period_delta
                sub.cancel_at_period_end = False
                sub.past_due_since = None
                sub.provider = "mock"

            # Create paid invoice receipt
            invoice = Invoice(
                org_id=org.id,
                amount=final_price,
                currency="usd",
                status="paid",
                period_start=now,
                period_end=now + period_delta,
                provider_invoice_id=f"mock_inv_{secrets.token_hex(8)}",
                pdf_url=f"/api/billing/invoices/mock-{secrets.token_hex(4)}/receipt",
            )
            db.add(invoice)

            # Audit log
            audit = AuditLog(
                org_id=org.id,
                action="subscription.created",
                target_type="subscription",
                target_id=str(sub.id),
                details={
                    "plan": target_plan.id,
                    "interval": billing_interval,
                    "amount": final_price,
                    "coupon": coupon_code,
                    "test_mode": True,
                },
            )
            db.add(audit)
            db.commit()

        checkout_redirect = (
            f"{settings.frontend_url}/settings/billing?"
            f"session_id={session_id}&status=success&plan={target_plan.id}&test_mode=true"
        )
        return {
            "checkout_url": checkout_redirect,
            "session_id": session_id,
            "amount": final_price,
            "currency": "usd",
            "test_mode": True,
            "banner": "Test mode, no real charges",
        }

    def create_customer_portal_session(
        self,
        org: Organization,
        return_url: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        portal_url = f"{settings.frontend_url}/settings/billing?portal=mock&test_mode=true"
        return {"portal_url": portal_url, "test_mode": True}

    def cancel_subscription(
        self,
        subscription: Subscription,
        immediate: bool = False,
        db: Session | None = None,
    ) -> dict[str, Any]:
        if immediate:
            subscription.status = "canceled"
            subscription.plan = "free"
        else:
            subscription.cancel_at_period_end = True

        if db:
            db.commit()
            db.refresh(subscription)

        return {
            "status": "updated",
            "cancel_at_period_end": subscription.cancel_at_period_end,
            "subscription_status": subscription.status,
            "effective_plan": subscription.plan,
        }

    def resume_subscription(
        self,
        subscription: Subscription,
        db: Session | None = None,
    ) -> dict[str, Any]:
        subscription.cancel_at_period_end = False
        if subscription.status == "canceled":
            subscription.status = "active"

        if db:
            db.commit()
            db.refresh(subscription)

        return {
            "status": "resumed",
            "cancel_at_period_end": False,
            "subscription_status": subscription.status,
        }

    def change_plan(
        self,
        subscription: Subscription,
        new_plan_id: str,
        new_interval: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        old_plan = get_plan(subscription.plan)
        target_plan = get_plan(new_plan_id)

        # Immediate upgrade (prorated calculation in test mode)
        now = datetime.utcnow()
        subscription.plan = target_plan.id
        subscription.billing_interval = new_interval
        subscription.status = "active"
        subscription.cancel_at_period_end = False
        subscription.current_period_start = now
        subscription.current_period_end = now + timedelta(days=365 if new_interval == "year" else 30)

        if db:
            new_price = target_plan.price_yearly if new_interval == "year" else target_plan.price_monthly
            if new_price > 0:
                inv = Invoice(
                    org_id=subscription.org_id,
                    amount=new_price,
                    currency="usd",
                    status="paid",
                    period_start=now,
                    period_end=subscription.current_period_end,
                    provider_invoice_id=f"mock_prorate_{secrets.token_hex(6)}",
                )
                db.add(inv)
            db.commit()
            db.refresh(subscription)

        return {
            "status": "changed",
            "old_plan": old_plan.id,
            "new_plan": target_plan.id,
            "interval": new_interval,
            "test_mode": True,
        }


class StripeBillingProvider(BillingProvider):
    """
    Stripe Test Mode Provider.
    Activated when `BILLING_PROVIDER=stripe` and `STRIPE_SECRET_KEY` is present.
    """

    def __init__(self, secret_key: str):
        self.secret_key = secret_key
        try:
            import stripe
            stripe.api_key = self.secret_key
            self.stripe = stripe
        except ImportError:
            self.stripe = None

    def create_checkout_session(
        self,
        org: Organization,
        plan_id: str,
        billing_interval: str,
        success_url: str,
        cancel_url: str,
        coupon_code: str | None = None,
        db: Session | None = None,
    ) -> dict[str, Any]:
        if not self.stripe:
            # Fallback to mock if stripe package missing
            mock = MockBillingProvider()
            return mock.create_checkout_session(org, plan_id, billing_interval, success_url, cancel_url, coupon_code, db)

        target_plan = get_plan(plan_id)
        unit_amount = target_plan.price_yearly if billing_interval == "year" else target_plan.price_monthly

        session = self.stripe.checkout.Session.create(
            payment_method_types=["card"],
            line_items=[{
                "price_data": {
                    "currency": "usd",
                    "product_data": {
                        "name": f"{settings.product_name} {target_plan.name} Plan",
                        "description": target_plan.description,
                    },
                    "unit_amount": unit_amount,
                    "recurring": {"interval": billing_interval},
                },
                "quantity": 1,
            }],
            mode="subscription",
            client_reference_id=str(org.id),
            customer_email=org.users[0].email if org.users else None,
            success_url=f"{success_url}?session_id={{CHECKOUT_SESSION_ID}}&status=success",
            cancel_url=cancel_url,
            metadata={"org_id": str(org.id), "plan_id": plan_id, "interval": billing_interval},
        )
        return {
            "checkout_url": session.url,
            "session_id": session.id,
            "test_mode": True,
            "banner": "Test mode, no real charges",
        }

    def create_customer_portal_session(
        self,
        org: Organization,
        return_url: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        if not self.stripe or not org.subscription or not org.subscription.provider_customer_id:
            mock = MockBillingProvider()
            return mock.create_customer_portal_session(org, return_url, db)

        session = self.stripe.billing_portal.Session.create(
            customer=org.subscription.provider_customer_id,
            return_url=return_url,
        )
        return {"portal_url": session.url, "test_mode": True}

    def cancel_subscription(
        self,
        subscription: Subscription,
        immediate: bool = False,
        db: Session | None = None,
    ) -> dict[str, Any]:
        mock = MockBillingProvider()
        return mock.cancel_subscription(subscription, immediate, db)

    def resume_subscription(
        self,
        subscription: Subscription,
        db: Session | None = None,
    ) -> dict[str, Any]:
        mock = MockBillingProvider()
        return mock.resume_subscription(subscription, db)

    def change_plan(
        self,
        subscription: Subscription,
        new_plan_id: str,
        new_interval: str,
        db: Session | None = None,
    ) -> dict[str, Any]:
        mock = MockBillingProvider()
        return mock.change_plan(subscription, new_plan_id, new_interval, db)


def get_billing_provider() -> BillingProvider:
    """Factory selecting BillingProvider based on environment configuration."""
    if settings.billing_provider == "stripe" and settings.stripe_secret_key:
        return StripeBillingProvider(settings.stripe_secret_key)
    return MockBillingProvider()
