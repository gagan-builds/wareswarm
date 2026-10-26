"""
seed_demo.py - Comprehensive Multi-Tier SaaS Demo Seeding Script.

Purpose:
    Populates database with realistic multi-tenant SaaS data:
    - 4 Organization Workspaces (Free, Pro Trial, Team 10-Seat, Enterprise)
    - Platform Administrator account (admin / AdminPassword123!)
    - Tiered accounts (Pro Engineer, Team Lead, Fleet Operator, Enterprise Director)
    - Active subscriptions (trialing countdown, active annual/monthly)
    - Sample usage records, mock invoices, and promo coupons (LAUNCH50, SWARM20)
    - Preloaded custom maps and historical simulation runs (NAIVE vs SWARM)
    - Test API keys and platform security audit logs

Usage:
    python scripts/seed_demo.py
    (Or from wareswarm root / backend)
"""

from __future__ import annotations
import os
import sys
import secrets
import hashlib
from datetime import datetime, timedelta

# Ensure backend directory is in sys.path
SCRIPT_DIR = os.path.dirname(os.path.abspath(__file__))
PROJECT_ROOT = os.path.abspath(os.path.join(SCRIPT_DIR, ".."))
BACKEND_DIR = os.path.join(PROJECT_ROOT, "backend")

if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)
if PROJECT_ROOT not in sys.path:
    sys.path.insert(0, PROJECT_ROOT)

from app.db.session import SessionLocal, init_db
from app.db.models import (
    Organization,
    Subscription,
    User,
    UsageRecord,
    Invoice,
    ApiKey,
    AuditLog,
    Coupon,
    TeamInvite,
    SimRun,
    CustomMap,
)
from app.core.auth_utils import hash_password
from app.config import PRODUCT_NAME


def hash_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def seed_database():
    print(f"\n=======================================================")
    print(f"  SEEDING {PRODUCT_NAME.upper()} SAAS PLATFORM (TEST MODE)")
    print(f"=======================================================\n")

    init_db()
    db = SessionLocal()

    try:
        now = datetime.utcnow()
        current_period = now.strftime("%Y-%m")

        # -------------------------------------------------------------
        # 1. ORGANIZATIONS
        # -------------------------------------------------------------
        print("-> Seeding Organizations...")
        org_free = db.query(Organization).filter(Organization.slug == "default").first()
        if not org_free:
            org_free = Organization(name="Default Workspace", slug="default", created_at=now - timedelta(days=60))
            db.add(org_free)

        org_pro = db.query(Organization).filter(Organization.slug == "pro-logistics").first()
        if not org_pro:
            org_pro = Organization(name="Pro Logistics Lab", slug="pro-logistics", created_at=now - timedelta(days=5))
            db.add(org_pro)

        org_team = db.query(Organization).filter(Organization.slug == "omnichannel-fleet").first()
        if not org_team:
            org_team = Organization(name="OmniChannel Fleet Systems", slug="omnichannel-fleet", created_at=now - timedelta(days=45))
            db.add(org_team)

        org_ent = db.query(Organization).filter(Organization.slug == "titan-robotics").first()
        if not org_ent:
            org_ent = Organization(name="Titan Industrial Robotics", slug="titan-robotics", created_at=now - timedelta(days=120))
            db.add(org_ent)

        db.commit()
        db.refresh(org_free)
        db.refresh(org_pro)
        db.refresh(org_team)
        db.refresh(org_ent)

        # -------------------------------------------------------------
        # 2. SUBSCRIPTIONS
        # -------------------------------------------------------------
        print("-> Seeding Subscriptions...")
        sub_configs = [
            {
                "org_id": org_free.id,
                "plan": "free",
                "status": "active",
                "billing_interval": "month",
                "trial_start": None,
                "trial_end": None,
                "provider": "mock",
            },
            {
                "org_id": org_pro.id,
                "plan": "pro",
                "status": "trialing",
                "billing_interval": "month",
                "trial_start": now - timedelta(days=4),
                "trial_end": now + timedelta(days=10),
                "provider": "mock",
            },
            {
                "org_id": org_team.id,
                "plan": "team",
                "status": "active",
                "billing_interval": "year",
                "current_period_start": now - timedelta(days=45),
                "current_period_end": now + timedelta(days=320),
                "provider": "mock",
            },
            {
                "org_id": org_ent.id,
                "plan": "enterprise",
                "status": "active",
                "billing_interval": "year",
                "current_period_start": now - timedelta(days=120),
                "current_period_end": now + timedelta(days=245),
                "provider": "mock",
            },
        ]

        for sc in sub_configs:
            existing_sub = db.query(Subscription).filter(Subscription.org_id == sc["org_id"]).first()
            if not existing_sub:
                sub = Subscription(
                    org_id=sc["org_id"],
                    plan=sc["plan"],
                    status=sc["status"],
                    billing_interval=sc["billing_interval"],
                    current_period_start=sc.get("current_period_start", now),
                    current_period_end=sc.get("current_period_end", now + timedelta(days=30)),
                    trial_start=sc.get("trial_start"),
                    trial_end=sc.get("trial_end"),
                    provider=sc["provider"],
                    provider_customer_id=f"cus_mock_{sc['plan']}_{sc['org_id']}",
                    provider_subscription_id=f"sub_mock_{sc['plan']}_{sc['org_id']}",
                )
                db.add(sub)
        db.commit()

        # -------------------------------------------------------------
        # 3. USERS
        # -------------------------------------------------------------
        print("-> Seeding Users...")
        users_data = [
            {
                "username": "admin",
                "email": "admin@wareswarm.io",
                "full_name": "Platform Administrator",
                "password": "AdminPassword123!",
                "role": "owner",
                "is_platform_admin": True,
                "org_id": org_free.id,
            },
            {
                "username": "pro_engineer",
                "email": "engineer@prologistics.io",
                "full_name": "Alex Mercer (Pro Engineer)",
                "password": "ProPassword123!",
                "role": "owner",
                "is_platform_admin": False,
                "org_id": org_pro.id,
            },
            {
                "username": "team_lead",
                "email": "lead@omnichannel.io",
                "full_name": "Elena Rostova (Team Lead)",
                "password": "TeamPassword123!",
                "role": "owner",
                "is_platform_admin": False,
                "org_id": org_team.id,
            },
            {
                "username": "fleet_operator",
                "email": "operator@omnichannel.io",
                "full_name": "Marcus Vance (Fleet Operator)",
                "password": "TeamPassword123!",
                "role": "member",
                "is_platform_admin": False,
                "org_id": org_team.id,
            },
            {
                "username": "analytics_admin",
                "email": "analyst@omnichannel.io",
                "full_name": "Sofia Chen (Data Analyst)",
                "password": "TeamPassword123!",
                "role": "admin",
                "is_platform_admin": False,
                "org_id": org_team.id,
            },
            {
                "username": "vp_automation",
                "email": "director@titan.com",
                "full_name": "Dr. Arthur Pendelton (VP Automation)",
                "password": "TitanPassword123!",
                "role": "owner",
                "is_platform_admin": False,
                "org_id": org_ent.id,
            },
            {
                "username": "putin",
                "email": "putin@wareswarm.io",
                "full_name": "Vladimir Putin (Platform Admin & Enterprise)",
                "password": "putin123",
                "role": "owner",
                "is_platform_admin": True,
                "org_id": org_ent.id,
            },
        ]

        for ud in users_data:
            existing_user = db.query(User).filter(User.username == ud["username"]).first()
            if not existing_user:
                u = User(
                    username=ud["username"],
                    email=ud["email"],
                    full_name=ud["full_name"],
                    hashed_password=hash_password(ud["password"]),
                    role=ud["role"],
                    is_platform_admin=ud["is_platform_admin"],
                    org_id=ud["org_id"],
                )
                db.add(u)
        db.commit()

        # -------------------------------------------------------------
        # 4. COUPONS
        # -------------------------------------------------------------
        print("-> Seeding Promo Coupons...")
        coupons = [
            {"code": "LAUNCH50", "percent_off": 50, "duration": "once"},
            {"code": "SWARM20", "percent_off": 20, "duration": "repeating", "duration_in_months": 3},
            {"code": "ACADEMIC100", "percent_off": 100, "duration": "once"},
        ]
        for c in coupons:
            if not db.query(Coupon).filter(Coupon.code == c["code"]).first():
                db.add(Coupon(
                    code=c["code"],
                    percent_off=c["percent_off"],
                    duration=c["duration"],
                    duration_in_months=c.get("duration_in_months"),
                    active=True,
                ))
        db.commit()

        # -------------------------------------------------------------
        # 5. USAGE RECORDS
        # -------------------------------------------------------------
        print("-> Seeding Monthly Usage Counters...")
        usage_data = [
            {"org_id": org_free.id, "metric": "simulation_runs", "count": 14},
            {"org_id": org_free.id, "metric": "api_calls", "count": 0},
            {"org_id": org_pro.id, "metric": "simulation_runs", "count": 142},
            {"org_id": org_pro.id, "metric": "api_calls", "count": 48},
            {"org_id": org_team.id, "metric": "simulation_runs", "count": 1280},
            {"org_id": org_team.id, "metric": "api_calls", "count": 4210},
            {"org_id": org_ent.id, "metric": "simulation_runs", "count": 8950},
            {"org_id": org_ent.id, "metric": "api_calls", "count": 31200},
        ]
        for ud in usage_data:
            rec = (
                db.query(UsageRecord)
                .filter(UsageRecord.org_id == ud["org_id"], UsageRecord.metric == ud["metric"], UsageRecord.period == current_period)
                .first()
            )
            if not rec:
                db.add(UsageRecord(
                    org_id=ud["org_id"],
                    metric=ud["metric"],
                    period=current_period,
                    count=ud["count"],
                ))
        db.commit()

        # -------------------------------------------------------------
        # 6. INVOICES
        # -------------------------------------------------------------
        print("-> Seeding Invoices...")
        invoices = [
            {
                "org_id": org_pro.id,
                "amount": 2900,
                "currency": "usd",
                "status": "paid",
                "period_start": now - timedelta(days=30),
                "period_end": now,
                "provider_invoice_id": "in_mock_pro_2026_10",
                "pdf_url": "http://localhost:8000/api/billing/mock-invoice.pdf",
            },
            {
                "org_id": org_team.id,
                "amount": 99000,
                "currency": "usd",
                "status": "paid",
                "period_start": now - timedelta(days=45),
                "period_end": now + timedelta(days=320),
                "provider_invoice_id": "in_mock_team_annual_01",
                "pdf_url": "http://localhost:8000/api/billing/mock-invoice.pdf",
            },
        ]
        for inv in invoices:
            if not db.query(Invoice).filter(Invoice.provider_invoice_id == inv["provider_invoice_id"]).first():
                db.add(Invoice(
                    org_id=inv["org_id"],
                    amount=inv["amount"],
                    currency=inv["currency"],
                    status=inv["status"],
                    period_start=inv["period_start"],
                    period_end=inv["period_end"],
                    provider_invoice_id=inv["provider_invoice_id"],
                    pdf_url=inv["pdf_url"],
                    created_at=now - timedelta(days=20),
                ))
        db.commit()

        # -------------------------------------------------------------
        # 7. API KEYS
        # -------------------------------------------------------------
        print("-> Seeding Test API Keys...")
        keys = [
            {
                "org_id": org_pro.id,
                "name": "Pro Telemetry Key",
                "raw_key": "ws_live_pro_read_demo_98fbc12e44aa",
                "scopes": ["read"],
            },
            {
                "org_id": org_team.id,
                "name": "Team CI/CD Headless Pipeline",
                "raw_key": "ws_live_team_full_demo_18a2bc4499ff",
                "scopes": ["read", "write"],
            },
        ]
        for k in keys:
            k_hash = hash_key(k["raw_key"])
            if not db.query(ApiKey).filter(ApiKey.key_hash == k_hash).first():
                db.add(ApiKey(
                    org_id=k["org_id"],
                    name=k["name"],
                    prefix=k["raw_key"][:16] + "...",
                    key_hash=k_hash,
                    scopes=k["scopes"],
                    revoked=False,
                    created_at=now - timedelta(days=10),
                    last_used_at=now - timedelta(minutes=45),
                ))
        db.commit()

        # -------------------------------------------------------------
        # 8. CUSTOM MAPS
        # -------------------------------------------------------------
        print("-> Seeding Custom Maps...")
        sample_maps = [
            {
                "org_id": org_pro.id,
                "name": "High-Density Logistics Hub",
                "description": "Dual narrow aisles with charging bays and packaging dropoffs",
                "width": 30,
                "height": 20,
                "robot_count": 8,
                "cells": [[0] * 30 for _ in range(20)],
            },
            {
                "org_id": org_team.id,
                "name": "Cross-Dock Velocity Lanes",
                "description": "Rapid sorting corridors connecting incoming dock to delivery bays",
                "width": 40,
                "height": 25,
                "robot_count": 15,
                "cells": [[0] * 40 for _ in range(25)],
            },
        ]
        for sm in sample_maps:
            if not db.query(CustomMap).filter(CustomMap.name == sm["name"]).first():
                db.add(CustomMap(
                    org_id=sm["org_id"],
                    name=sm["name"],
                    description=sm["description"],
                    width=sm["width"],
                    height=sm["height"],
                    robot_count=sm["robot_count"],
                    cells=sm["cells"],
                    created_at=now - timedelta(days=15),
                ))
        db.commit()

        # -------------------------------------------------------------
        # 9. SIMULATION RUNS (NAIVE VS SWARM HISTORICAL KPI RUNS)
        # -------------------------------------------------------------
        print("-> Seeding Historical Simulation Runs...")
        sample_runs = [
            {
                "org_id": org_pro.id,
                "map_preset": "congested",
                "coordination": "swarm",
                "planner": "astar",
                "num_robots": 10,
                "seed": 42,
                "total_ticks": 200,
                "metrics": {
                    "throughput": 18.5,
                    "collision_count": 0,
                    "collisions_prevented": 34,
                    "deadlocks_detected": 4,
                    "deadlocks_resolved": 4,
                    "utilisation_moving": 78.4,
                    "avg_completion_time": 24.2,
                },
                "notes": "Benchmark Run: SWARM Mode (Zero Collisions Guaranteed)",
            },
            {
                "org_id": org_pro.id,
                "map_preset": "congested",
                "coordination": "naive",
                "planner": "astar",
                "num_robots": 10,
                "seed": 42,
                "total_ticks": 200,
                "metrics": {
                    "throughput": 9.2,
                    "collision_count": 18,
                    "collisions_prevented": 0,
                    "deadlocks_detected": 12,
                    "deadlocks_resolved": 0,
                    "utilisation_moving": 42.1,
                    "avg_completion_time": 49.8,
                },
                "notes": "Baseline Run: NAIVE Mode (18 Collisions at Chokepoints)",
            },
        ]
        for sr in sample_runs:
            if not db.query(SimRun).filter(SimRun.notes == sr["notes"]).first():
                db.add(SimRun(
                    org_id=sr["org_id"],
                    map_preset=sr["map_preset"],
                    coordination=sr["coordination"],
                    planner=sr["planner"],
                    num_robots=sr["num_robots"],
                    seed=sr["seed"],
                    total_ticks=sr["total_ticks"],
                    metrics=sr["metrics"],
                    notes=sr["notes"],
                    share_token=secrets.token_urlsafe(16),
                    created_at=now - timedelta(days=2),
                ))
        db.commit()

        # -------------------------------------------------------------
        # 10. SECURITY AUDIT LOGS
        # -------------------------------------------------------------
        print("-> Seeding Security Audit Trail...")
        sample_audits = [
            {
                "org_id": org_team.id,
                "user_id": 1,
                "action": "admin.plan_override",
                "target_type": "organization",
                "target_id": str(org_team.id),
                "details": {"plan": "team", "reason": "Annual contract renewal"},
            },
            {
                "org_id": org_pro.id,
                "user_id": 2,
                "action": "api_key.created",
                "target_type": "api_key",
                "target_id": "ws_live_pro_rea...",
                "details": {"scopes": ["read"]},
            },
            {
                "org_id": org_team.id,
                "user_id": 3,
                "action": "team.invite_created",
                "target_type": "team_invite",
                "target_id": "operator@omnichannel.io",
                "details": {"role": "member"},
            },
        ]
        for sa in sample_audits:
            db.add(AuditLog(
                org_id=sa["org_id"],
                user_id=sa["user_id"],
                action=sa["action"],
                target_type=sa["target_type"],
                target_id=sa["target_id"],
                details=sa["details"],
                ip_address="127.0.0.1",
                created_at=now - timedelta(days=1),
            ))
        db.commit()

        print("\n" + "=" * 70)
        print("  DEMO ACCOUNTS READY FOR IMMEDIATE LOGIN & VIVA DEMONSTRATION")
        print("=" * 70)
        print(f"1. PLATFORM ADMIN:   admin           / AdminPassword123!   (/admin)")
        print(f"2. PRO TRIAL USER:   pro_engineer    / ProPassword123!     (14-Day Trial)")
        print(f"3. TEAM LEAD USER:   team_lead       / TeamPassword123!    (10 Seats)")
        print(f"4. ENTERPRISE USER:  vp_automation   / TitanPassword123!   (Custom Plan)")
        print(f"\nPROMO COUPONS:       LAUNCH50 (50% off) | SWARM20 (20% off)")
        print(f"TEST API KEY (TEAM): ws_live_team_full_demo_18a2bc4499ff")
        print("=" * 70 + "\n")

    finally:
        db.close()


if __name__ == "__main__":
    seed_database()
