"""
session.py - Database Session Engine & Table Initializer.

Purpose:
    Configures SQLAlchemy connection engine, scoped session factory, and startup
    table auto-creation for SQLite or PostgreSQL. Performs automatic data migration
    for multi-tenant workspaces.

Role in the project:
    Supplies the database session dependency (get_db) used by FastAPI route handlers,
    initializes tables on application launch, and migrates legacy rows to the default org.

Key contents:
    - engine: SQLAlchemy database engine with multi-threading support for SQLite.
    - SessionLocal: Factory generating independent transactional database sessions.
    - Base: Declarative model base class.
    - get_db(): Dependency generator yielding db sessions.
    - init_db(): Creates all database tables, ensures columns, and runs default organization migration.
"""
from __future__ import annotations
import os
from datetime import datetime
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker

raw_url = os.environ.get("DATABASE_URL", "sqlite:///./wareswarm.db")

# Canonicalize SQLite relative path to backend directory
if raw_url.startswith("sqlite:///./") or raw_url == "sqlite:///wareswarm.db":
    backend_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
    db_filename = os.path.basename(raw_url.replace("sqlite:///", ""))
    canonical_path = os.path.join(backend_dir, db_filename).replace("\\", "/")
    DATABASE_URL = f"sqlite:///{canonical_path}"
else:
    DATABASE_URL = raw_url

connect_args = {"check_same_thread": False} if DATABASE_URL.startswith("sqlite") else {}

engine = create_engine(DATABASE_URL, connect_args=connect_args)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """FastAPI dependency that yields a database session."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def ensure_schema_columns(engine) -> None:
    """Ensure newly added columns exist in existing SQLite databases."""
    try:
        with engine.connect() as conn:
            # Check users columns
            cols = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(users)").fetchall()}
            if cols:
                if "org_id" not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN org_id INTEGER")
                if "is_platform_admin" not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN is_platform_admin BOOLEAN DEFAULT 0")
                if "updated_at" not in cols:
                    conn.exec_driver_sql("ALTER TABLE users ADD COLUMN updated_at DATETIME")

            # Check sim_runs columns
            cols_sr = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(sim_runs)").fetchall()}
            if cols_sr:
                if "org_id" not in cols_sr:
                    conn.exec_driver_sql("ALTER TABLE sim_runs ADD COLUMN org_id INTEGER")
                if "user_id" not in cols_sr:
                    conn.exec_driver_sql("ALTER TABLE sim_runs ADD COLUMN user_id INTEGER")
                if "share_token" not in cols_sr:
                    conn.exec_driver_sql("ALTER TABLE sim_runs ADD COLUMN share_token VARCHAR(100)")

            # Check custom_maps columns
            cols_cm = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(custom_maps)").fetchall()}
            if cols_cm:
                if "org_id" not in cols_cm:
                    conn.exec_driver_sql("ALTER TABLE custom_maps ADD COLUMN org_id INTEGER")
                if "user_id" not in cols_cm:
                    conn.exec_driver_sql("ALTER TABLE custom_maps ADD COLUMN user_id INTEGER")
                if "is_scenario" not in cols_cm:
                    conn.exec_driver_sql("ALTER TABLE custom_maps ADD COLUMN is_scenario BOOLEAN DEFAULT 0")
                if "scenario_tag" not in cols_cm:
                    conn.exec_driver_sql("ALTER TABLE custom_maps ADD COLUMN scenario_tag VARCHAR(50)")
            conn.commit()
    except Exception as e:
        print(f"[ensure_schema_columns] Note: {e}")


def migrate_to_default_org(db) -> None:
    """Migrate legacy unassigned users, custom maps, and sim runs into a default organization on the Free plan."""
    from app.db.models import Organization, Subscription, User, CustomMap, SimRun

    default_org = db.query(Organization).filter(Organization.slug == "default").first()
    if not default_org:
        default_org = Organization(
            name="Default Workspace",
            slug="default",
            created_at=datetime.utcnow(),
        )
        db.add(default_org)
        db.flush()

        # Create Free subscription for default organization
        sub = Subscription(
            org_id=default_org.id,
            plan="free",
            status="active",
            billing_interval="month",
            current_period_start=datetime.utcnow(),
        )
        db.add(sub)
        db.flush()

    # Assign orphaned users to default org
    orphan_users = db.query(User).filter(User.org_id == None).all()
    for idx, u in enumerate(orphan_users):
        u.org_id = default_org.id
        if idx == 0 and u.role not in ("owner", "admin"):
            u.role = "owner"
        elif u.role not in ("owner", "admin", "member"):
            u.role = "member"

    # Assign orphaned custom maps
    orphan_maps = db.query(CustomMap).filter(CustomMap.org_id == None).all()
    for m in orphan_maps:
        m.org_id = default_org.id

    # Assign orphaned simulation runs
    orphan_runs = db.query(SimRun).filter(SimRun.org_id == None).all()
    for r in orphan_runs:
        r.org_id = default_org.id

    db.commit()


def init_db() -> None:
    """Create all tables, ensure columns, and run default migrations (called on startup)."""
    from app.db import models  # noqa: F401
    Base.metadata.create_all(bind=engine)
    ensure_schema_columns(engine)

    db = SessionLocal()
    try:
        migrate_to_default_org(db)
    except Exception as e:
        db.rollback()
        print(f"[init_db] Note: migration check: {e}")
    finally:
        db.close()
