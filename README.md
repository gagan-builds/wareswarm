# ⬡ WareSwarm – AI Multi-Robot Fleet Software & Subscription SaaS

> **Multi-Tier Subscription SaaS Platform & Autonomous Robot Fleet Simulator**  
> AI path planning, Space-Time reservation swarm coordination, multi-tenant billing, and headless automation.

---

## Table of Contents

1. [Overview](#overview)
2. [Multi-Tier Subscription Plans](#multi-tier-subscription-plans)
3. [Architecture & Non-Negotiable Rules](#architecture--non-negotiable-rules)
4. [Tech Stack](#tech-stack)
5. [Quickstart: How to Run](#quickstart-how-to-run)
6. [Preloaded Demo Accounts](#preloaded-demo-accounts)
7. [Testing & Verification](#testing--verification)
8. [Public REST API v1](#public-rest-api-v1)
9. [5-Minute Demo Script (Viva / Presentation)](#5-minute-demo-script-viva--presentation)

---

## Overview

**WareSwarm** is a commercial-grade, multi-tenant SaaS application that coordinates autonomous warehouse robot fleets operating in high-density grid environments without collisions or deadlocks.

- **Simulation Core (Backend in Python):** Space-Time A\* (4D MAPF), dynamic priority scoring, 4D reservation table, wait-for cycle deadlock resolution, and Hungarian task allocation.
- **SaaS Business Layer:** 4 subscription tiers (**Free**, **Pro** at \$29/mo, **Team** at \$99/mo, **Enterprise**), 14-day free Pro trial, 7-day past-due grace periods, multi-tenant organization workspaces, seat limits, promo coupons, usage meters, hashed API keys, and platform admin MRR telemetry.
- **Test Mode Payments:** Runs completely in **TEST MODE** with built-in instant mock fulfillment (or Stripe Test Mode), zero card storage, and on-screen test-mode notices.

---

## Multi-Tier Subscription Plans

All limits and features are defined centrally in `backend/app/billing/plans.py` and strictly enforced on the Python backend:

| Capability | Free ($0) | Pro ($29/mo, $290/yr) | Team ($99/mo, $990/yr) | Enterprise (Custom) |
|---|---|---|---|---|
| **Max Robots** | Up to 5 | Up to 20 | Up to 30 | 100+ |
| **Grid Size** | 30×20 | 60×40 | 100×60 | Unlimited |
| **Planners** | A\* only | A\*, Dijkstra, Space-Time A\* | All Planners | All + Custom |
| **Coordination** | Basic SWARM | NAIVE vs SWARM compare | All + Priority Tuning | Full Custom |
| **Monthly Runs** | 50 | 1,000 | 10,000 | Unlimited |
| **Saved Maps** | 1 | 20 | 200 | Unlimited |
| **Team Seats** | 1 seat | 1 seat | 10 seats | Unlimited |
| **API Keys** | Locked | Read-Only (60 req/min) | Read + Write (300 req/min) | Unlimited |
| **Watermark** | Yes | None | None | None |

---

## Architecture & Non-Negotiable Rules

1. **All Planning & Coordination in Python:** Every pathfinding algorithm (A\*, Dijkstra, Space-Time A\*), reservation table entry, deadlock resolution cycle, and fleet task assignment runs exclusively on the Python backend. The frontend only displays graphics and calls REST/WebSocket APIs.
2. **Never Trust the Frontend for Plan Checks:** Every endpoint validates user entitlements via FastAPI dependencies. Exceeding limits returns HTTP `402 Payment Required` or `403 Forbidden` with structured JSON payloads (`PLAN_LIMIT` or `FEATURE_LOCKED`), triggering the on-screen upgrade modal.
3. **Single Product Name Constant:** Driven by `PRODUCT_NAME = "WareSwarm"` in `backend/app/config.py`.

---

## Tech Stack

- **Backend:** Python 3.11 / 3.14, FastAPI, SQLAlchemy ORM, Alembic migrations, Pydantic v2, Pytest (384 tests).
- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind CSS, HTML5 Canvas (60 FPS rendering), Recharts.
- **Database:** SQLite (default `wareswarm.db`) or PostgreSQL via `DATABASE_URL`.

---

## Quickstart: How to Run

### 1. Backend Setup
```powershell
cd wareswarm/backend
pip install -r requirements.txt
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
*Backend API will run at `http://localhost:8000`. OpenAPI documentation available at `http://localhost:8000/docs`.*

### 2. Frontend Setup
```powershell
cd wareswarm/frontend
npm install
npm run dev
```
*Frontend will run at `http://localhost:3000`.*

### 3. Seed Demo Data (1-Click Setup)
In a new terminal window:
```powershell
python scripts/seed_demo.py
```
*Populates all four organization workspaces, test users, historical runs, custom maps, API keys, and invoices.*

---

## Preloaded Demo Accounts

After running `python scripts/seed_demo.py`, you can log into any of these preloaded personas:

| Role | Username | Password | Access / Tier |
|---|---|---|---|
| **Platform Administrator** | `admin` | `AdminPassword123!` | Global Admin Console (`/admin`), MRR analytics, plan overrides |
| **Pro Engineer** | `pro_engineer` | `ProPassword123!` | Active 14-day Pro trial (20 robots, Space-Time A\*, heatmaps) |
| **Team Lead** | `team_lead` | `TeamPassword123!` | 10 team seats, member invites, annual billing |
| **Fleet Operator** | `fleet_operator` | `TeamPassword123!` | Collaborative member (can run simulations) |
| **Enterprise Director** | `vp_automation` | `TitanPassword123!` | Custom unlimited capacity fleet |

### Promo Coupons (Test Mode)
- `LAUNCH50`: 50% discount on subscription checkout.
- `SWARM20`: 20% recurring discount for 3 months.

---

## Testing & Verification

Run the full automated test suite (all 384 tests passing):
```powershell
python -m pytest backend/tests -v
```

Run specific test modules:
```powershell
# SaaS Billing API & Limits
python -m pytest backend/tests/test_billing_api_and_limits.py -v

# Team Seats & Invitations
python -m pytest backend/tests/test_team_routes.py -v

# API v1 & Platform Admin Operations
python -m pytest backend/tests/test_api_v1_and_admin.py -v
```

Verify the Next.js production build:
```powershell
cd frontend
npm run build
```

---

## Public REST API v1

Authenticate with Bearer API Key (`Authorization: Bearer ws_live_...`):

### 1. Run Headless Simulation (Requires 'write' scope)
```bash
curl -X POST http://localhost:8000/api/v1/simulations/run \
  -H "Authorization: Bearer ws_live_team_full_demo_18a2bc4499ff" \
  -H "Content-Type: application/json" \
  -d '{"map_preset": "warehouse", "num_robots": 5, "max_ticks": 100}'
```

### 2. Compare Path Planners (Requires 'read' scope)
```bash
curl -X POST http://localhost:8000/api/v1/planners/compare \
  -H "Authorization: Bearer ws_live_team_full_demo_18a2bc4499ff" \
  -H "Content-Type: application/json" \
  -d '{"map_preset": "warehouse", "start": [1, 1], "goal": [15, 20]}'
```

---

## 5-Minute Demo Script (Viva / Presentation)

1. **Landing Page (`/`):** Point out the clean architecture, live benchmark indicators, and the multi-tier plans teaser section.
2. **Pricing Matrix (`/pricing`):** Toggle between **Monthly** and **Annual** billing to show dynamic price adjustments and the **Save 17%** badge. Review the full capability comparison table and FAQ accordion.
3. **Billing Dashboard (`/settings/billing`):** Log in as `pro_engineer` (`ProPassword123!`). Demonstrate:
   - Visible **"Test mode, no real charges"** banner.
   - 14-day Pro trial countdown timer.
   - Real-time monthly usage progress bars that change to amber at 80% and red at 100%.
   - Test coupon redemption (`LAUNCH50`).
   - One-click QA simulation box (*Simulate Payment Failure*, *Simulate Renewal*).
4. **Interactive Simulator (`/simulator`):**
   - Start simulation to see 60 FPS multi-robot navigation.
   - Show how the robot slider is capped at the plan limit (5 on Free, 20 on Pro).
   - Attempting to unlock premium planners or exceed quotas triggers the **Upgrade Prompt Modal**.
5. **Team Collaboration (`/settings/team`):** Log in as `team_lead` (`TeamPassword123!`). Show seat usage (3 of 10 seats used), member role switches, and dev-mode console invitation generation.
6. **API Automation (`/settings/api`):** Create a new hashed API key and demonstrate the copy-once secret reveal and cURL integration.
7. **Platform Admin Dashboard (`/admin`):** Log in as `admin` (`AdminPassword123!`). View live MRR, active trials, churn, plan distribution, and execute a complimentary plan override on any workspace with an audit trail entry.
