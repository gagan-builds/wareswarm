"""
plans.py - SaaS Subscription Tiers, Limits, and Feature Gates.

Purpose:
    Defines the four core subscription tiers (Free, Pro, Team, Enterprise)
    along with their exact operational quotas, feature toggles, and pricing.
    Plans are defined as structured data objects so new tiers can be added
    without altering endpoint logic.

Role in the project:
    Single source of truth for all pricing, quota enforcement, and tier gating.
    Queried by entitlements engine, billing API, and frontend pricing tables.

Key contents:
    - Plan: Dataclass holding metadata, pricing, limits, and feature flags.
    - PLANS: Dictionary of active plan definitions keyed by tier slug.
    - get_plan(): Safe plan retrieval with fallback to Free.
    - get_all_plans(): Public plan definitions formatted for REST serialization.
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any


@dataclass
class Plan:
    """SaaS Subscription Plan definition."""
    id: str
    name: str
    tagline: str
    description: str
    price_monthly: int  # in USD cents (e.g. 2900 = $29.00), -1 for custom/contact
    price_yearly: int   # in USD cents (e.g. 29000 = $290.00 / $24.16/mo), -1 for contact
    currency: str = "usd"
    highlight: bool = False
    badge: str | None = None
    limits: dict[str, Any] = field(default_factory=dict)
    features: dict[str, Any] = field(default_factory=dict)

    def to_dict(self) -> dict[str, Any]:
        """Convert plan to serializable dictionary for public API consumption."""
        return {
            "id": self.id,
            "name": self.name,
            "tagline": self.tagline,
            "description": self.description,
            "price_monthly": self.price_monthly,
            "price_yearly": self.price_yearly,
            "currency": self.currency,
            "highlight": self.highlight,
            "badge": self.badge,
            "limits": self.limits,
            "features": self.features,
        }


PLANS: dict[str, Plan] = {
    "free": Plan(
        id="free",
        name="Free",
        tagline="Basic evaluation for individuals",
        description="Core simulation engine with basic A* pathfinding and standard layouts.",
        price_monthly=0,
        price_yearly=0,
        highlight=False,
        badge=None,
        limits={
            "robots": 5,
            "max_grid_width": 30,
            "max_grid_height": 20,
            "map_presets": ["open_floor", "congested"],
            "saved_maps": 1,
            "saved_runs": 5,
            "simulation_runs_per_month": 50,
            "planners": ["astar"],
            "coordination_modes": ["swarm"],
            "team_members": 1,
            "api_calls_per_month": 0,
            "api_rate_limit_per_min": 0,
        },
        features={
            "benchmarks_compare": False,
            "heatmap": False,
            "replay": False,
            "export_csv_json": False,
            "export_pdf": False,
            "api_access": False,
            "priority_tuning": False,
            "scheduled_benchmarks": False,
            "scenario_library": False,
            "share_links": False,
            "support": "community",
            "watermark": True,
        },
    ),
    "pro": Plan(
        id="pro",
        name="Pro",
        tagline="Advanced swarm analytics for engineers",
        description="Comprehensive pathfinding algorithms, congestion replays, and benchmark comparisons.",
        price_monthly=2900,  # $29/mo
        price_yearly=29000,  # $290/yr (~$24.16/mo, 17% savings)
        highlight=True,
        badge="Most Popular",
        limits={
            "robots": 20,
            "max_grid_width": 60,
            "max_grid_height": 40,
            "map_presets": ["warehouse", "open_floor", "congested", "random"],
            "saved_maps": 20,
            "saved_runs": 200,
            "simulation_runs_per_month": 1000,
            "planners": ["astar", "dijkstra", "space_time_astar"],
            "coordination_modes": ["swarm", "naive"],
            "team_members": 1,
            "api_calls_per_month": 0,
            "api_rate_limit_per_min": 60,
        },
        features={
            "benchmarks_compare": True,
            "heatmap": True,
            "replay": True,
            "export_csv_json": True,
            "export_pdf": False,
            "api_access": "read_only",
            "priority_tuning": False,
            "scheduled_benchmarks": False,
            "scenario_library": True,
            "share_links": True,
            "support": "email",
            "watermark": False,
        },
    ),
    "team": Plan(
        id="team",
        name="Team",
        tagline="Fleet-scale collaboration & automated reporting",
        description="Full multi-robot fleet size, team member seats, custom maps, and branded PDF reports.",
        price_monthly=9900,  # $99/mo
        price_yearly=99000,  # $990/yr (~$82.50/mo, 17% savings)
        highlight=False,
        badge="Best for Teams",
        limits={
            "robots": 30,
            "max_grid_width": 100,
            "max_grid_height": 60,
            "map_presets": ["warehouse", "open_floor", "congested", "random", "custom"],
            "saved_maps": 200,
            "saved_runs": 2000,
            "simulation_runs_per_month": 10000,
            "planners": ["astar", "dijkstra", "space_time_astar"],
            "coordination_modes": ["swarm", "naive"],
            "team_members": 10,
            "api_calls_per_month": 10000,
            "api_rate_limit_per_min": 300,
        },
        features={
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
            "support": "priority_email",
            "watermark": False,
        },
    ),
    "enterprise": Plan(
        id="enterprise",
        name="Enterprise",
        tagline="Custom fleet limits & dedicated infrastructure",
        description="Unlimited simulations, custom planner integrations, 100+ robot capacity, and dedicated support.",
        price_monthly=-1,  # Contact Us
        price_yearly=-1,   # Contact Us
        highlight=False,
        badge="Custom Scale",
        limits={
            "robots": 100,
            "max_grid_width": -1,  # unlimited
            "max_grid_height": -1, # unlimited
            "map_presets": ["*"],  # all
            "saved_maps": -1,      # unlimited
            "saved_runs": -1,      # unlimited
            "simulation_runs_per_month": -1,  # unlimited
            "planners": ["*"],     # all
            "coordination_modes": ["*"],
            "team_members": -1,    # unlimited
            "api_calls_per_month": -1,  # unlimited
            "api_rate_limit_per_min": 1000,
        },
        features={
            "benchmarks_compare": True,
            "heatmap": True,
            "replay": True,
            "export_csv_json": True,
            "export_pdf": True,
            "api_access": "unlimited",
            "priority_tuning": True,
            "scheduled_benchmarks": True,
            "scenario_library": True,
            "share_links": True,
            "support": "dedicated",
            "watermark": False,
        },
    ),
}


def get_plan(plan_id: str | None) -> Plan:
    """Retrieve plan by ID, safely defaulting to Free tier."""
    if not plan_id:
        return PLANS["free"]
    return PLANS.get(plan_id.lower().strip(), PLANS["free"])


def get_all_plans() -> list[dict[str, Any]]:
    """Return all active plans formatted for public JSON endpoint."""
    return [p.to_dict() for p in PLANS.values()]
