"""
models.py - SQLAlchemy Database Models & Schemas.

Purpose:
    Defines database tables for multi-tenant SaaS operations:
    Organizations (Workspaces), Subscriptions, Users, Usage Tracking,
    Invoices, API Keys, Audit Logs, Coupons, Simulation Runs, and Custom Maps.

Role in the project:
    Data persistence layer of WareSwarm, backed by SQLite (or PostgreSQL via DATABASE_URL).
    Enforces multi-tenancy by linking resources to an Organization.

Key contents:
    - Organization: Workspace entity containing members, subscriptions, and assets.
    - User: Accounts with roles (owner, admin, member) and platform admin flag.
    - Subscription: Tier status (trialing, active, past_due, canceled), intervals, and provider IDs.
    - UsageRecord: Atomic monthly usage tracking (simulation runs, API calls).
    - Invoice: Billing history records and mock/Stripe receipts.
    - ApiKey: Headless public API credentials stored hashed.
    - AuditLog: Immutable security audit trail of administrative actions.
    - Coupon: Promotional discount codes for subscription checkout.
    - TeamInvite: Secure invite tokens for team collaboration.
    - SimRun: Persisted simulation runs linked to workspace and shareable tokens.
    - CustomMap: Custom warehouse maps and curated scenarios.
"""

from __future__ import annotations
from datetime import datetime
from sqlalchemy import (
    Column, Integer, String, Float, JSON, DateTime, Text, Boolean, ForeignKey
)
from sqlalchemy.orm import relationship
from app.db.session import Base


class Organization(Base):
    """Multi-tenant Workspace entity owning subscriptions, members, and data."""
    __tablename__ = "organizations"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationships
    users = relationship("User", back_populates="organization", cascade="all, delete-orphan")
    subscription = relationship("Subscription", back_populates="organization", uselist=False, cascade="all, delete-orphan")
    sim_runs = relationship("SimRun", back_populates="organization", cascade="all, delete-orphan")
    custom_maps = relationship("CustomMap", back_populates="organization", cascade="all, delete-orphan")
    invoices = relationship("Invoice", back_populates="organization", cascade="all, delete-orphan")
    api_keys = relationship("ApiKey", back_populates="organization", cascade="all, delete-orphan")
    usage_records = relationship("UsageRecord", back_populates="organization", cascade="all, delete-orphan")
    team_invites = relationship("TeamInvite", back_populates="organization", cascade="all, delete-orphan")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "slug": self.slug,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class User(Base):
    """User account belonging to an Organization with role-based access control."""
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="SET NULL"), nullable=True, index=True)
    username = Column(String(50), unique=True, index=True, nullable=False)
    email = Column(String(120), unique=True, index=True, nullable=False)
    hashed_password = Column(String(255), nullable=False)
    full_name = Column(String(100), nullable=True)
    # Role within organization: "owner", "admin", "member" (fallback to Legacy "Robotics Engineer")
    role = Column(String(50), default="member")
    is_platform_admin = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    # Relationship
    organization = relationship("Organization", back_populates="users")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "username": self.username,
            "email": self.email,
            "full_name": self.full_name,
            "role": self.role,
            "is_platform_admin": self.is_platform_admin,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class Subscription(Base):
    """Subscription record determining workspace plan, quota limits, and billing lifecycle."""
    __tablename__ = "subscriptions"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), unique=True, nullable=False, index=True)
    plan = Column(String(50), default="free", nullable=False)  # "free", "pro", "team", "enterprise"
    status = Column(String(50), default="active", nullable=False)  # "trialing", "active", "past_due", "canceled"
    billing_interval = Column(String(20), default="month", nullable=False)  # "month", "year"
    current_period_start = Column(DateTime, default=datetime.utcnow, nullable=False)
    current_period_end = Column(DateTime, nullable=True)
    cancel_at_period_end = Column(Boolean, default=False)
    
    # Trial countdown & grace period trackers
    trial_start = Column(DateTime, nullable=True)
    trial_end = Column(DateTime, nullable=True)
    past_due_since = Column(DateTime, nullable=True)

    # External Provider mapping (Stripe or Mock)
    provider = Column(String(50), default="mock")
    provider_customer_id = Column(String(100), nullable=True)
    provider_subscription_id = Column(String(100), nullable=True)

    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="subscription")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "plan": self.plan,
            "status": self.status,
            "billing_interval": self.billing_interval,
            "current_period_start": self.current_period_start.isoformat() if self.current_period_start else None,
            "current_period_end": self.current_period_end.isoformat() if self.current_period_end else None,
            "cancel_at_period_end": self.cancel_at_period_end,
            "trial_start": self.trial_start.isoformat() if self.trial_start else None,
            "trial_end": self.trial_end.isoformat() if self.trial_end else None,
            "past_due_since": self.past_due_since.isoformat() if self.past_due_since else None,
            "provider": self.provider,
            "provider_customer_id": self.provider_customer_id,
            "provider_subscription_id": self.provider_subscription_id,
        }


class UsageRecord(Base):
    """Tracks consumption of metered items (simulation runs, API calls) per billing period."""
    __tablename__ = "usage_records"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    metric = Column(String(50), nullable=False, index=True)  # e.g. "simulation_runs", "api_calls"
    period = Column(String(20), nullable=False, index=True)  # e.g. "2026-10"
    count = Column(Integer, default=0, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)

    organization = relationship("Organization", back_populates="usage_records")


class Invoice(Base):
    """Billing receipts and invoices issued to the organization."""
    __tablename__ = "invoices"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    amount = Column(Integer, nullable=False)  # in USD cents
    currency = Column(String(10), default="usd")
    status = Column(String(30), default="paid")  # "paid", "open", "void", "uncollectible"
    period_start = Column(DateTime, nullable=True)
    period_end = Column(DateTime, nullable=True)
    provider_invoice_id = Column(String(100), nullable=True)
    pdf_url = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="invoices")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "org_id": self.org_id,
            "amount": self.amount,
            "currency": self.currency,
            "status": self.status,
            "period_start": self.period_start.isoformat() if self.period_start else None,
            "period_end": self.period_end.isoformat() if self.period_end else None,
            "provider_invoice_id": self.provider_invoice_id,
            "pdf_url": self.pdf_url,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class ApiKey(Base):
    """API Keys for programmatic headless simulation execution and data queries."""
    __tablename__ = "api_keys"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    key_hash = Column(String(128), index=True, nullable=False)
    prefix = Column(String(24), nullable=False)  # e.g. "ws_live_9f81..."
    name = Column(String(100), nullable=False)
    scopes = Column(JSON, default=lambda: ["read"])  # ["read", "write"]
    created_at = Column(DateTime, default=datetime.utcnow)
    last_used_at = Column(DateTime, nullable=True)
    revoked = Column(Boolean, default=False)

    organization = relationship("Organization", back_populates="api_keys")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "prefix": self.prefix,
            "name": self.name,
            "scopes": self.scopes,
            "created_at": self.created_at.isoformat() if self.created_at else None,
            "last_used_at": self.last_used_at.isoformat() if self.last_used_at else None,
            "revoked": self.revoked,
        }


class AuditLog(Base):
    """Immutable log of organizational security and administrative actions."""
    __tablename__ = "audit_logs"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    action = Column(String(100), nullable=False)  # e.g. "plan.upgraded", "member.invited", "key.revoked"
    target_type = Column(String(50), nullable=False)
    target_id = Column(String(100), nullable=True)
    details = Column(JSON, nullable=True)
    ip_address = Column(String(50), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)


class Coupon(Base):
    """Discount coupon for promotional checkouts."""
    __tablename__ = "coupons"

    id = Column(Integer, primary_key=True, index=True)
    code = Column(String(50), unique=True, index=True, nullable=False)
    percent_off = Column(Integer, nullable=False)  # e.g. 20 for 20%
    duration = Column(String(20), default="once")  # "once", "repeating", "forever"
    duration_in_months = Column(Integer, nullable=True)
    active = Column(Boolean, default=True)
    max_redemptions = Column(Integer, nullable=True)
    times_redeemed = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.utcnow)


class TeamInvite(Base):
    """Pending team invitations sent via email."""
    __tablename__ = "team_invites"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=False, index=True)
    email = Column(String(120), nullable=False, index=True)
    role = Column(String(30), default="member")  # "admin" or "member"
    token = Column(String(100), unique=True, index=True, nullable=False)
    expires_at = Column(DateTime, nullable=False)
    accepted = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)

    organization = relationship("Organization", back_populates="team_invites")

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "email": self.email,
            "role": self.role,
            "expires_at": self.expires_at.isoformat() if self.expires_at else None,
            "accepted": self.accepted,
            "created_at": self.created_at.isoformat() if self.created_at else None,
        }


class SimRun(Base):
    """Persisted record of a completed or manually saved simulation run."""
    __tablename__ = "sim_runs"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    map_preset = Column(String(50), default="warehouse")
    coordination = Column(String(10), default="swarm")
    planner = Column(String(20), default="astar")
    heuristic = Column(String(20), default="manhattan")
    connectivity = Column(Integer, default=4)
    num_robots = Column(Integer, default=5)
    seed = Column(Integer, nullable=True)
    total_ticks = Column(Integer, default=0)
    speed = Column(Float, default=1.0)
    task_rate = Column(Float, default=0.3)
    # Metrics snapshot at run end
    metrics = Column(JSON, nullable=True)
    # Sampled event log (last N events)
    event_log = Column(JSON, nullable=True)
    notes = Column(Text, nullable=True)
    # Shareable token for read-only public run link
    share_token = Column(String(100), unique=True, index=True, nullable=True)

    organization = relationship("Organization", back_populates="sim_runs")


class CustomMap(Base):
    """Persisted user-designed custom warehouse map or curated scenario."""
    __tablename__ = "custom_maps"

    id = Column(Integer, primary_key=True, index=True)
    org_id = Column(Integer, ForeignKey("organizations.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    name = Column(String(100), unique=True, index=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    width = Column(Integer, default=30)
    height = Column(Integer, default=20)
    cells = Column(JSON)  # 2D list of int cell types
    robot_count = Column(Integer, default=5)
    description = Column(String(255), nullable=True)
    # Curated scenario library flag
    is_scenario = Column(Boolean, default=False)
    scenario_tag = Column(String(50), nullable=True)  # e.g. "head_on_deadlock", "intersection_rush"

    organization = relationship("Organization", back_populates="custom_maps")
