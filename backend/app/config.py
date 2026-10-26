"""
config.py - Application Settings & Environment Configuration.

Purpose:
    Defines application-wide constants, database connection strings, server ports,
    simulation default boundaries, and SaaS subscription/billing configuration
    using Pydantic BaseSettings.

Role in the project:
    Loaded once at backend startup to configure the FastAPI server, SQLite engine,
    CORS origins, SaaS billing mode, and default simulation parameters.

Key contents:
    - Settings: Pydantic BaseSettings class loading environment variables with fallback defaults.
    - PRODUCT_NAME: Global product name constant for easy white-labeling / rebranding.
    - settings: Singleton instance used across the backend.

Talks to:
    - app.main: Configures server host, port, and CORS origins.
    - app.db.session: Provides database_url.
    - app.billing: Configures billing provider, trial duration, and plans.
    - app.core.simulator: Supplies default grid dimensions, tick rate, and robot limits.
"""

from pydantic_settings import BaseSettings
from typing import Literal


class Settings(BaseSettings):
    """Application-wide settings loaded from environment variables."""

    # Product Branding
    product_name: str = "WareSwarm"

    # Server
    host: str = "0.0.0.0"
    port: int = 8000
    debug: bool = False
    frontend_url: str = "http://localhost:3000"

    # Database
    database_url: str = "sqlite:///./wareswarm.db"

    # Authentication & Security
    auth_secret_key: str = "wareswarm-dev-secret-key-2026-auth"
    token_expire_days: int = 30

    # Billing & Subscription
    billing_provider: Literal["mock", "stripe"] = "mock"
    stripe_secret_key: str = ""
    stripe_publishable_key: str = ""
    stripe_webhook_secret: str = ""
    trial_duration_days: int = 14
    grace_period_days: int = 7
    enforce_subscription_limits: bool = False

    # CORS - comma-separated origins
    cors_origins: str = "http://localhost:3000,http://127.0.0.1:3000"

    # Simulation defaults
    default_grid_width: int = 30
    default_grid_height: int = 20
    default_num_robots: int = 5
    default_tick_rate_hz: float = 2.0   # ticks per second at 1x speed
    max_grid_width: int = 60
    max_grid_height: int = 40
    max_robots: int = 30

    # Planning defaults
    default_planner: Literal["astar", "dijkstra"] = "astar"
    default_heuristic: Literal["manhattan", "euclidean", "octile"] = "manhattan"
    default_connectivity: Literal[4, 8] = 4
    max_replan_attempts: int = 5
    max_wait_ticks: int = 3   # before triggering re-plan (smoother flow)

    # Task generation
    default_task_rate: float = 0.3   # probability per tick of a new task

    @property
    def cors_origins_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",")]

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8", "extra": "ignore"}


settings = Settings()
PRODUCT_NAME = settings.product_name
