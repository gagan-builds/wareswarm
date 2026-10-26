"""
routes_keys.py - API Key Management Routes.

Purpose:
    Allows workspace managers to generate, list, and revoke API keys for
    headless automation, CI/CD, and external programmatic simulation runs.
"""

from __future__ import annotations
import secrets
import hashlib
from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, Organization, ApiKey, AuditLog
from app.api.routes_auth import get_current_user
from app.billing.entitlements import get_entitlements, get_current_org

router = APIRouter(prefix="/api/keys", tags=["api-keys"])


class CreateApiKeyRequest(BaseModel):
    name: str
    scopes: List[str] = ["read"]  # "read", "write"


def get_user_org(user: User, db: Session) -> Organization:
    """Helper to retrieve user's organization."""
    if user and user.org_id:
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if org:
            return org
    return get_current_org(db=db)


def hash_key(raw_key: str) -> str:
    """Return SHA-256 hash of API key."""
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


@router.get("")
def list_api_keys(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """List all API keys for the current user's workspace."""
    org = get_user_org(current_user, db)
    keys = (
        db.query(ApiKey)
        .filter(ApiKey.org_id == org.id)
        .order_by(ApiKey.created_at.desc())
        .all()
    )
    return {"api_keys": [k.to_dict() for k in keys]}


@router.post("", status_code=status.HTTP_201_CREATED)
def create_api_key(
    req: CreateApiKeyRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Creates a new hashed API key for headless access.
    Enforces plan limits:
    - Free: API access locked.
    - Pro: Read-only scopes allowed.
    - Team/Enterprise: Read and write scopes allowed.
    Returns the plaintext API key ONCE.
    """
    org = get_user_org(current_user, db)
    entitlements = get_entitlements(org, db)
    api_access = entitlements.features.get("api_access")

    if not api_access:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "PLAN_LIMIT",
                "limit": "api_keys",
                "max_allowed": 0,
                "required_plan": "pro",
                "upgrade_url": "/pricing",
                "message": "Headless API access is not included on the Free plan. Upgrade to Pro for read access or Team for read/write.",
            },
        )

    # Check scopes against plan
    valid_scopes = {"read", "write"}
    requested_scopes = [s.lower() for s in req.scopes if s.lower() in valid_scopes]
    if not requested_scopes:
        requested_scopes = ["read"]

    if "write" in requested_scopes and (api_access == "read_only" or api_access == "read"):
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "FEATURE_LOCKED",
                "feature": "api_write",
                "required_plan": "team",
                "upgrade_url": "/pricing",
                "message": "Write scope API keys (for running headless simulations) require Team plan or above.",
            },
        )

    # Generate token
    entropy = secrets.token_hex(24)
    raw_key = f"ws_live_{entropy}"
    prefix = raw_key[:16] + "..."
    k_hash = hash_key(raw_key)

    api_key_record = ApiKey(
        org_id=org.id,
        user_id=current_user.id,
        key_hash=k_hash,
        prefix=prefix,
        name=req.name.strip() or "Default Key",
        scopes=requested_scopes,
        revoked=False,
    )
    db.add(api_key_record)

    # Security Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="api_key.created",
        target_type="api_key",
        target_id=prefix,
        details={"name": api_key_record.name, "scopes": requested_scopes},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()
    db.refresh(api_key_record)

    return {
        "status": "success",
        "api_key": raw_key,  # Shown only once!
        "prefix": prefix,
        "name": api_key_record.name,
        "scopes": requested_scopes,
        "created_at": api_key_record.created_at.isoformat(),
        "warning": "Copy this secret key now. It will never be shown again.",
    }


@router.delete("/{key_id}")
def revoke_api_key(
    key_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """Revokes an API key permanently."""
    org = get_user_org(current_user, db)
    key_record = (
        db.query(ApiKey)
        .filter(ApiKey.id == key_id, ApiKey.org_id == org.id)
        .first()
    )
    if not key_record:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="API key not found.")

    key_record.revoked = True

    # Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="api_key.revoked",
        target_type="api_key",
        target_id=str(key_id),
        details={"prefix": key_record.prefix, "name": key_record.name},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": f"API key '{key_record.name}' revoked."}
