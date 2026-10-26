# WareSwarm: Complete Multi-Tier SaaS Architecture & Viva Reference Guide

---

## 1. Project Overview

**WareSwarm** is an autonomous multi-agent warehouse robot fleet simulator extended into a comprehensive, multi-tenant **subscription SaaS product**. It pairs a high-performance **FastAPI (Python)** simulation backend—which executes all path planning algorithms (A\*, Dijkstra, Space-Time A\*), reservation-table swarm coordination, dynamic priority assignment, cycle-detection deadlock resolution, and Hungarian/nearest task allocation—with a modern **Next.js 14 / TypeScript** frontend.

### Hard Architectural Commitments
1. **Zero Planning Logic on Frontend:** All AI pathfinding, multi-robot coordination, reservation tables, deadlock breaking, and subscription plan quota enforcement execute exclusively in Python on the backend.
2. **Backend Enforcement:** Never trust the frontend for plan checks. Every limit (robots, map size, planners, monthly simulation runs, custom map saves, seat counts, API quotas) is enforced server-side returning structured HTTP 402/403 errors (`PLAN_LIMIT` or `FEATURE_LOCKED`).
3. **Test Mode Billing:** All payments operate in **TEST MODE**. Safe simulation via `MockBillingProvider` (or Stripe Test Mode) with zero real credit card storage.
4. **Single-Point White-Labeling:** The platform name is driven by a single backend configuration constant (`PRODUCT_NAME = "WareSwarm"`).

---

## 2. Multi-Tenant SaaS Architecture

```mermaid
flowchart TD
    subgraph Frontend["Frontend (Next.js 14 / TypeScript / Tailwind)"]
        UI["Web Browser Client\n(Canvas 60 FPS, Controls, KPI Panels)"]
        PricingUI["Pricing & Plans (/pricing)"]
        BillingUI["Billing & Usage Meters (/settings/billing)"]
        TeamUI["Team Collaboration (/settings/team)"]
        KeysUI["API Keys Dashboard (/settings/api)"]
        AdminUI["Platform Admin (/admin)"]
        UpgradeModal["Upgrade Prompt Modal\n[PLAN_LIMIT / FEATURE_LOCKED]"]
        
        UI --> UpgradeModal
    end

    subgraph Network["Network Protocols"]
        HTTP["HTTP REST (/api/*)"]
        V1["Public Versioned REST API (/api/v1/*)\nBearer API Key Auth"]
        WSS["WebSocket Stream (/ws/sim)"]
    end

    subgraph Backend["FastAPI Backend (Python 3.11/3.14)"]
        subgraph BillingLayer["SaaS Billing & Entitlements Engine"]
            PlansDef["Plans Definition (billing/plans.py)\n[Free, Pro, Team, Enterprise]"]
            EntitlementsEngine["Entitlements & Gating (billing/entitlements.py)\n[Trial, Grace Period, Atomic Quotas]"]
            BillingProvider["Billing Providers (billing/provider.py)\n[MockBillingProvider / StripeBillingProvider]"]
        end

        subgraph CoreAPIs["API Routers"]
            RoutesSim["routes_sim.py"]
            RoutesCompare["routes_compare.py"]
            RoutesMap["routes_map.py"]
            RoutesBilling["routes_billing.py"]
            RoutesTeam["routes_team.py"]
            RoutesKeys["routes_keys.py"]
            RoutesV1["routes_v1.py"]
            RoutesAdmin["routes_admin.py"]
        end

        subgraph SimulationLayer["Python Simulation Kernel"]
            SimKernel["Simulator Engine (core/simulator.py)"]
            Coordination["Swarm Coordinator & 4D Reservation Table"]
            Planners["Path Planners (A*, Dijkstra, Space-Time A*)"]
            Deadlock["Deadlock Resolver (Wait-For Graph Cycles)"]
        end

        Database[("SQLite / PostgreSQL Database\nOrganizations, Subscriptions, Users, Usage, Invoices, ApiKeys, AuditLogs")]
    end

    PricingUI -->|Checkout / Plans| HTTP --> RoutesBilling
    BillingUI -->|Meters / Coupons| HTTP --> RoutesBilling
    TeamUI -->|Seats / Invites| HTTP --> RoutesTeam
    KeysUI -->|Key CRUD| HTTP --> RoutesKeys
    AdminUI -->|MRR / Overrides| HTTP --> RoutesAdmin
    UI -->|Simulation State| HTTP --> RoutesSim
    UI -->|Live Stream (60Hz)| WSS

    ExternalClient["External CI/CD / Scripts"] -->|Bearer ws_live_...| V1 --> RoutesV1

    RoutesBilling --> BillingProvider
    RoutesSim --> EntitlementsEngine --> SimKernel
    RoutesV1 --> EntitlementsEngine --> SimKernel
    RoutesAdmin --> Database
```

---

## 3. Subscription Tiers & Entitlements Matrix

| Feature / Limit | **Free** ($0) | **Pro** ($29/mo, $290/yr) | **Team** ($99/mo, $990/yr) | **Enterprise** (Custom) |
|---|---|---|---|---|
| **Robots per simulation** | Up to 5 | Up to 20 | Up to 30 | 100+ (Configurable) |
| **Map Grid Size** | Up to 30×20 | Up to 60×40 | Up to 100×60 | Unlimited |
| **Map Presets** | 2 basic (Warehouse, Open Floor) | All + Congested & Random | All + Custom Templates | All + Custom |
| **Saved Custom Maps** | 1 map | 20 maps | 200 maps | Unlimited |
| **Saved Runs History** | Last 5 runs | 200 runs | 2,000 runs | Unlimited |
| **Simulation Runs / Month** | 50 runs | 1,000 runs | 10,000 runs | Unlimited |
| **Path Planners** | A\* only | A\*, Dijkstra, Space-Time A\* | All Planners | All + Custom Planners |
| **Coordination Modes** | SWARM (Basic) | NAIVE vs SWARM compare | All + Priority Tuning | Full Custom |
| **Benchmarks & Compare** | Locked | Full Access | Full Access | Full Access |
| **Congestion Heatmap & Replay** | Locked | Full Access | Full Access | Full Access |
| **PDF Report Export** | Locked | Locked | Branded Reports | Dedicated Reports |
| **API Keys & Public API** | Locked | Read-Only (1,000 calls/mo) | Read + Write (10k calls/mo) | Unlimited (Dedicated SLA) |
| **Team Member Seats** | 1 seat | 1 seat | 10 seats | Unlimited |
| **Watermark on Exports** | Yes | None | None | None |

---

## 4. Repository Layout

```text
wareswarm/
├── .env.example                     # Environment template (BILLING_PROVIDER, STRIPE_*, AUTH_SECRET_KEY)
├── docker-compose.yml               # Multi-container orchestration (Backend 8000, Frontend 3000)
├── PROJECT_MAP.md                   # Complete architectural guide & viva reference
├── README.md                        # Quickstart instructions, feature summary, and demo script
│
├── scripts/
│   └── seed_demo.py                 # Multi-tier SaaS demo data seeder (users, orgs, invoices, maps, runs)
│
├── backend/
│   ├── alembic/                     # Database migrations (Batch SQLite foreign key constraints)
│   │   ├── versions/
│   │   │   └── ee0aa1904394_*.py    # SaaS multi-tenant schema migration
│   │   └── env.py
│   ├── alembic.ini
│   │
│   ├── app/
│   │   ├── config.py                # PRODUCT_NAME, trial/grace period durations, billing provider config
│   │   ├── main.py                  # FastAPI app assembly, CORS, health checks, and route mounting
│   │   │
│   │   ├── billing/                 # SaaS Billing Engine
│   │   │   ├── plans.py             # Plan dataclass and PLANS data dictionary
│   │   │   ├── entitlements.py      # Gating engine, trial countdown, grace periods, atomic usage tracking
│   │   │   └── provider.py          # Abstract BillingProvider, MockBillingProvider, StripeBillingProvider
│   │   │
│   │   ├── api/                     # REST & WebSocket Route Handlers
│   │   │   ├── routes_auth.py       # User registration, JWT issuance, /me, demo login
│   │   │   ├── routes_billing.py    # /plans, /subscription, /usage, /checkout, /portal, /change-plan, /mock/action
│   │   │   ├── routes_team.py       # Workspace members, email invites, seat limits, role management
│   │   │   ├── routes_keys.py       # Hashed API keys CRUD, scope checks, key revocation
│   │   │   ├── routes_v1.py         # Versioned Public API (/api/v1/simulations/run, /planners/compare)
│   │   │   ├── routes_admin.py      # Platform admin console (/metrics, /organizations, /override-plan, /audit-logs)
│   │   │   ├── routes_sim.py        # Live simulation control (gated by robot/grid/run quotas)
│   │   │   ├── routes_compare.py    # NAIVE vs SWARM compare (gated by benchmarks_compare feature)
│   │   │   ├── routes_map.py        # Custom map CRUD (gated by saved_maps quota)
│   │   │   ├── routes_runs.py       # Historical run archives & shareable tokens
│   │   │   └── ws.py                # WebSocket 60 FPS live broadcast
│   │   │
│   │   ├── core/                    # Simulation Kernel
│   │   │   ├── simulator.py         # Main discrete tick loop
│   │   │   ├── grid.py              # 2D Grid & cell types
│   │   │   ├── robot.py             # Robot kinematics & states
│   │   │   ├── task.py              # Dynamic warehouse deliveries
│   │   │   └── auth_utils.py        # HMAC-SHA256 session tokens & salted hashing
│   │   │
│   │   ├── planning/                # Path Finding Algorithms
│   │   │   ├── astar.py             # A* single-agent pathfinding
│   │   │   ├── dijkstra.py          # Baseline uniform-cost search
│   │   │   └── space_time_astar.py  # Space-Time A* searching in 4D space-time graphs
│   │   │
│   │   ├── swarm/                   # Swarm Coordination
│   │   │   ├── coordinator.py       # Multi-robot conflict resolution & stepping
│   │   │   ├── reservation_table.py # Discrete 4D reservation table
│   │   │   ├── deadlock.py          # Wait-for graph cycle detector (DFS)
│   │   │   └── priority.py          # Dynamic priority scoring
│   │   │
│   │   └── db/                      # Database Layer
│   │       ├── models.py            # Organization, Subscription, User, UsageRecord, Invoice, ApiKey, AuditLog
│   │       └── session.py           # Database engine & auto-migration bootstrapping
│   │
│   └── tests/                       # 384 Automated Pytest Tests
│       ├── test_billing_entitlements.py
│       ├── test_billing_api_and_limits.py
│       ├── test_team_routes.py
│       ├── test_api_v1_and_admin.py
│       ├── test_planners.py
│       ├── test_swarm.py
│       └── test_auth.py
│
└── frontend/                        # Next.js 14 App Router UI
    ├── app/
    │   ├── layout.tsx               # Root layout mounting GlobalBanner, NavBar, and UpgradeModal
    │   ├── page.tsx                 # SaaS landing page with neutral benchmark metrics & plans teaser
    │   ├── pricing/page.tsx         # 4-tier pricing matrix, monthly/annual toggle (Save 17%), FAQ accordion
    │   ├── settings/
    │   │   ├── billing/page.tsx     # Billing dashboard: trial countdown, usage meters (80%/100%), QA panel
    │   │   ├── team/page.tsx        # Workspace team: seat indicators, member roles, dev-mode console invites
    │   │   └── api/page.tsx         # API keys console: copy-once token revelation & cURL snippets
    │   ├── admin/page.tsx           # Platform admin: live MRR, trials, churn, comp plan override modal
    │   ├── onboarding/page.tsx      # 3-step signup wizard (Workspace Name -> Use Case -> Plan Selection)
    │   ├── invite/page.tsx          # Team invite acceptance landing page
    │   ├── simulator/page.tsx       # Live simulation canvas, controls, and live KPI feeds
    │   ├── builder/page.tsx         # Custom warehouse layout painter
    │   ├── compare/page.tsx         # Side-by-side benchmark comparison
    │   ├── history/page.tsx         # Saved simulation runs archive
    │   └── dashboard/page.tsx       # Fleet overview
    │
    ├── components/
    │   ├── UpgradeModal.tsx         # Global upgrade modal intercepting PLAN_LIMIT / FEATURE_LOCKED
    │   ├── GlobalBanner.tsx         # Test mode notice & trial countdown banner
    │   ├── NavBar.tsx               # Header with user avatar, settings dropdown, and admin pill
    │   └── ControlPanel.tsx         # Simulation sidebar with plan-capped sliders and locked feature badges
    └── lib/
        ├── api.ts                   # REST client with automatic Bearer token injection & error interceptors
        └── types.ts                 # TypeScript data contracts matching backend models
```

---

## 5. Demo Accounts & Verification Guide

Run the seed script to initialize all demo accounts:
```powershell
python scripts/seed_demo.py
```

| Persona | Username | Password | Organization | Tier / Access |
|---|---|---|---|---|
| **Platform Admin** | `admin` | `AdminPassword123!` | Default Workspace | Global `/admin` console, MRR telemetry, comp overrides |
| **Pro Engineer** | `pro_engineer` | `ProPassword123!` | Pro Logistics Lab | Active 14-day Pro trial (20 robots, STA\*, heatmaps) |
| **Team Lead** | `team_lead` | `TeamPassword123!` | OmniChannel Fleet Systems | 10 seats, annual billing, read/write API keys |
| **Fleet Operator** | `fleet_operator` | `TeamPassword123!` | OmniChannel Fleet Systems | Member role (can run simulations, cannot modify billing) |
| **Enterprise Director** | `vp_automation` | `TitanPassword123!` | Titan Industrial Robotics | Custom unlimited capacity fleet |

### Promo Coupons (Test Mode)
- `LAUNCH50`: 50% discount on any subscription checkout.
- `SWARM20`: 20% recurring discount for 3 months.

### Test API Key
- `ws_live_team_full_demo_18a2bc4499ff` (Read + Write scopes, 300 requests/minute limit).
