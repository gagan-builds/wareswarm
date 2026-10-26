"""
routes_team.py - Workspace Team & Member Management Routes.

Purpose:
    Handles member invitations, seat limits, role management (owner/admin/member),
    ownership transfer, and team invite lifecycle.

Role in project:
    FastAPI router mounted at /api/team.
    Enforces plan seat limits and role-based permissions.
"""

from __future__ import annotations
import secrets
import logging
from datetime import datetime, timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, field_validator
from sqlalchemy.orm import Session

from app.db.session import get_db
from app.db.models import User, Organization, TeamInvite, AuditLog
from app.api.routes_auth import get_current_user
from app.billing.entitlements import get_entitlements, get_current_org

router = APIRouter(prefix="/api/team", tags=["team"])
logger = logging.getLogger("wareswarm.team")


class InviteRequest(BaseModel):
    email: str
    role: str = "member"  # "admin" or "member"

    @field_validator("email")
    @classmethod
    def validate_email_format(cls, v: str) -> str:
        v = v.strip().lower()
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v


class AcceptInviteRequest(BaseModel):
    token: str


class UpdateRoleRequest(BaseModel):
    role: str  # "admin" or "member"


class TransferOwnershipRequest(BaseModel):
    new_owner_id: int


def get_user_org(user: User, db: Session) -> Organization:
    """Helper to retrieve user's organization."""
    if user and user.org_id:
        org = db.query(Organization).filter(Organization.id == user.org_id).first()
        if org:
            return org
    return get_current_org(db=db)


def require_org_manager(user: User):
    """Ensure user is workspace owner or admin."""
    role = (user.role or "").lower()
    if role not in ("owner", "admin"):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only workspace owners and administrators can manage team members.",
        )


@router.get("/members")
def get_team_members(
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Returns all workspace team members, pending invites, seat usage, and quota limits.
    """
    org = get_user_org(current_user, db)
    entitlements = get_entitlements(org, db)
    seat_limit = entitlements.get_limit("team_members", 1)

    members = (
        db.query(User)
        .filter(User.org_id == org.id)
        .order_by(User.id.asc())
        .all()
    )

    now = datetime.utcnow()
    pending_invites = (
        db.query(TeamInvite)
        .filter(
            TeamInvite.org_id == org.id,
            TeamInvite.accepted == False,
            TeamInvite.expires_at > now,
        )
        .all()
    )

    return {
        "organization": {
            "id": org.id,
            "name": org.name,
            "slug": org.slug,
        },
        "seats_limit": seat_limit,
        "seats_used": len(members),
        "pending_count": len(pending_invites),
        "current_user_role": current_user.role,
        "members": [
            {
                "id": m.id,
                "username": m.username,
                "email": m.email,
                "full_name": m.full_name,
                "role": m.role,
                "created_at": m.created_at.isoformat() if m.created_at else None,
            }
            for m in members
        ],
        "invites": [
            {
                "id": inv.id,
                "email": inv.email,
                "role": inv.role,
                "expires_at": inv.expires_at.isoformat() if inv.expires_at else None,
                "invite_url": f"/invite?token={inv.token}",
                "token": inv.token,
            }
            for inv in pending_invites
        ],
    }


@router.post("/invite")
def invite_team_member(
    req: InviteRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Invites a new member by email if within the plan seat limits.
    In development mode, the invite link is logged to the console.
    """
    require_org_manager(current_user)
    org = get_user_org(current_user, db)
    entitlements = get_entitlements(org, db)
    seat_limit = entitlements.get_limit("team_members", 1)

    # Count existing members
    members_count = db.query(User).filter(User.org_id == org.id).count()

    # Count active pending invites
    now = datetime.utcnow()
    pending_count = (
        db.query(TeamInvite)
        .filter(
            TeamInvite.org_id == org.id,
            TeamInvite.accepted == False,
            TeamInvite.expires_at > now,
        )
        .count()
    )

    if seat_limit != -1 and (members_count + pending_count) >= seat_limit:
        raise HTTPException(
            status_code=status.HTTP_402_PAYMENT_REQUIRED,
            detail={
                "code": "PLAN_LIMIT",
                "limit": "team_members",
                "current": members_count + pending_count,
                "max_allowed": seat_limit,
                "required_plan": "team" if seat_limit < 10 else "enterprise",
                "upgrade_url": "/pricing",
                "message": f"Workspace seat limit of {seat_limit} reached. Upgrade your plan to invite more members.",
            },
        )

    # Check if target email already belongs to this org
    existing_user = db.query(User).filter(User.email == req.email, User.org_id == org.id).first()
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"{req.email} is already a member of this workspace.",
        )

    # Check or invalidate previous active invites for this email in this org
    old_invites = (
        db.query(TeamInvite)
        .filter(TeamInvite.org_id == org.id, TeamInvite.email == req.email, TeamInvite.accepted == False)
        .all()
    )
    for old in old_invites:
        db.delete(old)

    token = secrets.token_urlsafe(32)
    expires_at = now + timedelta(days=7)
    invite = TeamInvite(
        org_id=org.id,
        email=req.email,
        role=req.role if req.role in ("admin", "member") else "member",
        token=token,
        expires_at=expires_at,
        accepted=False,
    )
    db.add(invite)

    # Security Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="team.invite_created",
        target_type="team_invite",
        target_id=req.email,
        details={"role": invite.role, "expires_at": expires_at.isoformat()},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()
    db.refresh(invite)

    # Dev mode: Log invite link directly to stdout / terminal
    invite_url = f"http://localhost:3000/invite?token={token}"
    print(f"\n{'='*70}\n[DEV MODE EMAIL] Team Invite for: {req.email}\nWorkspace: {org.name}\nInvite URL: {invite_url}\n{'='*70}\n")
    logger.info("Generated invite token for %s -> %s", req.email, invite_url)

    return {
        "status": "success",
        "message": f"Invitation link generated for {req.email}",
        "invite": {**invite.to_dict(), "token": invite.token},
        "invite_url": invite_url,
        "token": token,
    }


@router.post("/accept-invite")
def accept_team_invite(
    req: AcceptInviteRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Accepts an invitation token and links current authenticated user to the workspace.
    """
    now = datetime.utcnow()
    invite = (
        db.query(TeamInvite)
        .filter(
            TeamInvite.token == req.token,
            TeamInvite.accepted == False,
            TeamInvite.expires_at > now,
        )
        .first()
    )
    if not invite:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Invalid or expired invitation token.",
        )

    org = db.query(Organization).filter(Organization.id == invite.org_id).first()
    if not org:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Workspace associated with this invite no longer exists.",
        )

    # Update user's workspace and role
    current_user.org_id = org.id
    current_user.role = invite.role
    invite.accepted = True

    # Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="team.invite_accepted",
        target_type="user",
        target_id=str(current_user.id),
        details={"email": invite.email, "role": invite.role},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {
        "status": "success",
        "message": f"Successfully joined {org.name} as {invite.role}.",
        "org_id": org.id,
        "org_name": org.name,
        "role": invite.role,
    }


@router.delete("/members/{user_id}")
def remove_team_member(
    user_id: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Removes a member from the workspace. Owners and Admins only.
    Cannot remove workspace owner.
    """
    require_org_manager(current_user)
    org = get_user_org(current_user, db)

    target_user = db.query(User).filter(User.id == user_id, User.org_id == org.id).first()
    if not target_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Member not found in this workspace.",
        )

    if (target_user.role or "").lower() == "owner":
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove workspace owner. Transfer ownership first.",
        )

    if target_user.id == current_user.id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Cannot remove yourself. Use transfer ownership or delete workspace.",
        )

    # Reset member's workspace affiliation
    target_user.org_id = None
    target_user.role = "member"

    # Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="team.member_removed",
        target_type="user",
        target_id=str(target_user.id),
        details={"username": target_user.username, "email": target_user.email},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": f"{target_user.username} has been removed from {org.name}."}


@router.patch("/members/{user_id}/role")
def update_member_role(
    user_id: int,
    req: UpdateRoleRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Updates a member's role (admin or member). Owner or Admin required.
    """
    require_org_manager(current_user)
    org = get_user_org(current_user, db)

    if req.role not in ("admin", "member"):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Role must be 'admin' or 'member'.")

    target_user = db.query(User).filter(User.id == user_id, User.org_id == org.id).first()
    if not target_user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found in this workspace.")

    if (target_user.role or "").lower() == "owner":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Cannot alter workspace owner's role.")

    target_user.role = req.role

    # Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="team.role_updated",
        target_type="user",
        target_id=str(target_user.id),
        details={"new_role": req.role},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": f"Updated {target_user.username}'s role to {req.role}."}


@router.post("/transfer-ownership")
def transfer_ownership(
    req: TransferOwnershipRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """
    Transfers primary workspace ownership to another member. Current user becomes Admin.
    """
    if (current_user.role or "").lower() != "owner":
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Only workspace owner can transfer ownership.")

    org = get_user_org(current_user, db)

    new_owner = db.query(User).filter(User.id == req.new_owner_id, User.org_id == org.id).first()
    if not new_owner:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Target user not found in this workspace.")

    current_user.role = "admin"
    new_owner.role = "owner"

    # Audit Log
    client_ip = request.client.host if request.client else None
    audit = AuditLog(
        org_id=org.id,
        user_id=current_user.id,
        action="team.ownership_transferred",
        target_type="user",
        target_id=str(new_owner.id),
        details={"from_user_id": current_user.id, "to_user_id": new_owner.id},
        ip_address=client_ip,
    )
    db.add(audit)
    db.commit()

    return {"status": "success", "message": f"Workspace ownership transferred to {new_owner.username}."}
