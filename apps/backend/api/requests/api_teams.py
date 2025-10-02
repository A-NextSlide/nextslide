"""
Teams API (P1): teams, members, and invitations
"""
import logging
import secrets
from typing import Any, Dict, List, Optional
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field, EmailStr

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/teams", tags=["teams"])


class CreateTeamRequest(BaseModel):
    name: str


class UpdateTeamRequest(BaseModel):
    name: Optional[str] = None


class InviteRequest(BaseModel):
    email: EmailStr
    role: str = Field("member", description="Role in team: owner|admin|member")


class AddMemberRequest(BaseModel):
    user_id: Optional[str] = None
    email: Optional[EmailStr] = None
    role: str = Field("member", description="owner|admin|member")


class UpdateMemberRequest(BaseModel):
    role: str = Field(..., description="owner|admin|member")


def _get_supabase():
    from utils.supabase import get_supabase_client
    return get_supabase_client()


def _require_user(token: Optional[str]) -> Dict[str, Any]:
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


def _assert_team_role(team_id: str, user_id: str, required_roles: List[str]) -> Dict[str, Any]:
    supabase = _get_supabase()
    # owner/admin/member roles allowed, fetch user's role in team
    resp = supabase.table("team_members").select("role").eq("team_id", team_id).eq("user_id", user_id).single().execute()
    if not resp.data:
        raise HTTPException(status_code=403, detail="Not a team member")
    role = resp.data.get("role")
    if role not in required_roles:
        raise HTTPException(status_code=403, detail="Insufficient permissions")
    return {"role": role}


@router.post("", status_code=201)
async def create_team(request: CreateTeamRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    supabase = _get_supabase()
    now = datetime.utcnow().isoformat()
    # Create team
    res = supabase.table("teams").insert({
        "name": request.name,
        "owner_id": user["id"],
        "created_at": now
    }).execute()
    if not res.data:
        raise HTTPException(status_code=500, detail="Failed to create team")
    team = res.data[0]
    # Add owner membership
    try:
        supabase.table("team_members").upsert({
            "team_id": team["id"],
            "user_id": user["id"],
            "role": "owner"
        }).execute()
    except Exception as e:
        logger.warning(f"Failed to upsert team owner membership: {e}")
    return team


@router.get("")
async def list_teams(token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    supabase = _get_supabase()
    # Return teams where the user is a member
    resp = supabase.table("team_members").select("team_id, role, teams:teams(id,name,owner_id,created_at)").eq("user_id", user["id"]).execute()
    teams: List[Dict[str, Any]] = []
    for row in resp.data or []:
        t = row.get("teams", {})
        teams.append({
            "id": t.get("id"),
            "name": t.get("name"),
            "owner_id": t.get("owner_id"),
            "created_at": t.get("created_at"),
            "role": row.get("role")
        })
    return teams


@router.get("/{team_id}")
async def get_team(team_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin", "member"])  # member or higher
    supabase = _get_supabase()
    res = supabase.table("teams").select("*").eq("id", team_id).single().execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Team not found")
    return res.data


@router.patch("/{team_id}")
async def update_team(team_id: str, request: UpdateTeamRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    # Only team owner can update team
    supabase = _get_supabase()
    owner = supabase.table("teams").select("owner_id").eq("id", team_id).single().execute()
    if not owner.data:
        raise HTTPException(status_code=404, detail="Team not found")
    if owner.data.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only team owner can update team")
    updates: Dict[str, Any] = {}
    if request.name is not None:
        updates["name"] = request.name
    if not updates:
        return {"message": "No changes"}
    res = supabase.table("teams").update(updates).eq("id", team_id).execute()
    return res.data[0] if res.data else {"id": team_id, **updates}


@router.delete("/{team_id}")
async def delete_team(team_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    supabase = _get_supabase()
    owner = supabase.table("teams").select("owner_id").eq("id", team_id).single().execute()
    if not owner.data:
        raise HTTPException(status_code=404, detail="Team not found")
    if owner.data.get("owner_id") != user["id"]:
        raise HTTPException(status_code=403, detail="Only team owner can delete team")
    supabase.table("teams").delete().eq("id", team_id).execute()
    return {"message": "Team deleted", "id": team_id}


@router.get("/{team_id}/members")
async def list_members(team_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin", "member"])  # member or higher
    supabase = _get_supabase()
    res = supabase.table("team_members").select(
        "user_id, role, created_at, users:users(id,email,full_name,avatar_url)"
    ).eq("team_id", team_id).execute()
    members: List[Dict[str, Any]] = []
    for row in res.data or []:
        u = row.get("users", {})
        members.append({
            "user_id": row.get("user_id"),
            "email": u.get("email"),
            "role": row.get("role"),
            "created_at": row.get("created_at")
        })
    return members


@router.post("/{team_id}/members")
async def add_member(team_id: str, request: AddMemberRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin"])  # admin or owner
    supabase = _get_supabase()
    target_user_id: Optional[str] = request.user_id
    if not target_user_id and request.email:
        # try resolve by email
        ures = supabase.table("users").select("id").eq("email", str(request.email).lower()).single().execute()
        if ures.data:
            target_user_id = ures.data.get("id")
    if target_user_id:
        # upsert membership
        supabase.table("team_members").upsert({
            "team_id": team_id,
            "user_id": target_user_id,
            "role": request.role
        }).execute()
        return {"user_id": target_user_id, "role": request.role}
    # Else: create invitation
    if not request.email:
        raise HTTPException(status_code=400, detail="email or user_id required")
    token_value = secrets.token_urlsafe(24)
    exp = datetime.utcnow() + timedelta(days=14)
    inv = supabase.table("invitations").insert({
        "type": "team",
        "email": str(request.email).lower(),
        "role": request.role,
        "token": token_value,
        "team_id": team_id,
        "invited_by_user_id": user["id"],
        "expires_at": exp.isoformat()
    }).execute()
    # Best-effort email using Resend
    try:
        from services.email_service import send_invite_email_via_resend
        import os
        frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
        accept_url = f"{frontend}/team/invite/{token_value}"
        send_invite_email_via_resend(str(request.email), "Team invitation", f"Click to join: <a href='{accept_url}'>{accept_url}</a>")
    except Exception:
        pass
    return {"invitation_id": (inv.data[0]["id"] if inv.data else None), "token": token_value}


@router.patch("/{team_id}/members/{member_user_id}")
async def update_member(team_id: str, member_user_id: str, request: UpdateMemberRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin"])  # admin or owner
    supabase = _get_supabase()
    res = supabase.table("team_members").update({"role": request.role}).eq("team_id", team_id).eq("user_id", member_user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"message": "Role updated", "user_id": member_user_id, "role": request.role}


@router.delete("/{team_id}/members/{member_user_id}")
async def remove_member(team_id: str, member_user_id: str, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin"])  # admin or owner
    supabase = _get_supabase()
    res = supabase.table("team_members").delete().eq("team_id", team_id).eq("user_id", member_user_id).execute()
    if not res.data:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"message": "Member removed", "user_id": member_user_id}


@router.post("/{team_id}/invitations")
async def create_team_invitation(team_id: str, request: InviteRequest, token: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token)
    _assert_team_role(team_id, user["id"], ["owner", "admin"])  # admin or owner
    supabase = _get_supabase()
    token_value = secrets.token_urlsafe(24)
    exp = datetime.utcnow() + timedelta(days=14)
    inv = supabase.table("invitations").insert({
        "type": "team",
        "email": str(request.email).lower(),
        "role": request.role,
        "token": token_value,
        "team_id": team_id,
        "invited_by_user_id": user["id"],
        "expires_at": exp.isoformat()
    }).execute()
    # Best-effort email using Resend
    try:
        from services.email_service import send_invite_email_via_resend
        import os
        frontend = os.getenv("FRONTEND_URL", "http://localhost:5173")
        accept_url = f"{frontend}/team/invite/{token_value}"
        send_invite_email_via_resend(str(request.email), "Team invitation", f"Click to join: <a href='{accept_url}'>{accept_url}</a>")
    except Exception:
        pass
    return {"invitation_id": (inv.data[0]["id"] if inv.data else None), "token": token_value}


@router.post("/invitations/{token}/accept")
async def accept_team_invitation(token: str, token_header: Optional[str] = Depends(get_auth_header)):
    user = _require_user(token_header)
    supabase = _get_supabase()
    inv = supabase.table("invitations").select("*").eq("token", token).eq("type", "team").single().execute()
    if not inv.data:
        raise HTTPException(status_code=404, detail="Invitation not found")
    # Mark accepted and add member
    supabase.table("invitations").update({
        "accepted_by_user_id": user["id"],
        "accepted_at": datetime.utcnow().isoformat()
    }).eq("id", inv.data["id"]).execute()
    supabase.table("team_members").upsert({
        "team_id": inv.data["team_id"],
        "user_id": user["id"],
        "role": inv.data.get("role") or "member"
    }).execute()
    return {"message": "Invitation accepted", "team_id": inv.data["team_id"]}


