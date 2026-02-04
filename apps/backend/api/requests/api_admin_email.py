"""Admin Email Control Center API endpoints."""

import logging
from typing import Optional, List, Dict, Any
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, BackgroundTasks
from pydantic import BaseModel

from services.supabase import get_supabase_client
from api.requests.api_admin import verify_admin_role, log_admin_action

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/admin/email", tags=["Admin Email"])

# ============================================================================
# Request / Response Models
# ============================================================================

class TemplateCreateRequest(BaseModel):
    name: str
    slug: str
    subject: str
    category: str = "transactional"
    html_body: str = ""
    variables: List[str] = []
    is_active: bool = True


class TemplateUpdateRequest(BaseModel):
    name: Optional[str] = None
    slug: Optional[str] = None
    subject: Optional[str] = None
    category: Optional[str] = None
    html_body: Optional[str] = None
    variables: Optional[List[str]] = None
    is_active: Optional[bool] = None


class PreviewRequest(BaseModel):
    variables: Dict[str, str] = {}


class AIGenerateRequest(BaseModel):
    prompt: str
    existing_html: Optional[str] = None
    template_context: Optional[str] = None


class CampaignCreateRequest(BaseModel):
    name: str
    template_id: str
    subject_override: Optional[str] = None
    audience: str = "all"
    audience_config: Dict[str, Any] = {}
    scheduled_at: Optional[str] = None


class CampaignUpdateRequest(BaseModel):
    name: Optional[str] = None
    template_id: Optional[str] = None
    subject_override: Optional[str] = None
    audience: Optional[str] = None
    audience_config: Optional[Dict[str, Any]] = None
    scheduled_at: Optional[str] = None
    status: Optional[str] = None


class AudienceCountRequest(BaseModel):
    audience: str
    audience_config: Dict[str, Any] = {}


# ============================================================================
# Template Endpoints
# ============================================================================

@router.get("/templates")
async def list_templates(
    category: Optional[str] = Query(None),
    admin: dict = Depends(verify_admin_role),
):
    """List all email templates, optionally filtered by category."""
    supabase = get_supabase_client()
    query = supabase.table("email_templates").select("*").order("created_at", desc=False)
    if category:
        query = query.eq("category", category)
    result = query.execute()
    return {"templates": result.data or []}


@router.get("/templates/{template_id}")
async def get_template(
    template_id: str,
    admin: dict = Depends(verify_admin_role),
):
    """Get a single email template by ID."""
    supabase = get_supabase_client()
    result = supabase.table("email_templates").select("*").eq("id", template_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Template not found")
    return result.data


@router.post("/templates")
async def create_template(
    body: TemplateCreateRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Create a new email template."""
    supabase = get_supabase_client()
    data = {
        "name": body.name,
        "slug": body.slug,
        "subject": body.subject,
        "category": body.category,
        "html_body": body.html_body,
        "variables": body.variables,
        "is_active": body.is_active,
        "is_system": False,
        "created_by": admin["user_id"],
        "updated_by": admin["user_id"],
    }
    result = supabase.table("email_templates").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create template")
    return result.data[0]


@router.put("/templates/{template_id}")
async def update_template(
    template_id: str,
    body: TemplateUpdateRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Update an email template. System templates cannot have html_body deleted."""
    supabase = get_supabase_client()

    # Fetch existing
    existing = supabase.table("email_templates").select("is_system").eq("id", template_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Template not found")

    update_data = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_by"] = admin["user_id"]
    update_data["updated_at"] = datetime.utcnow().isoformat()

    # Bump version
    update_data["version"] = (existing.data.get("version", 1) or 1) + 1 if "html_body" in update_data else existing.data.get("version", 1)

    result = supabase.table("email_templates").update(update_data).eq("id", template_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update template")
    return result.data[0]


@router.delete("/templates/{template_id}")
async def delete_template(
    template_id: str,
    admin: dict = Depends(verify_admin_role),
):
    """Delete a non-system email template."""
    supabase = get_supabase_client()
    existing = supabase.table("email_templates").select("is_system").eq("id", template_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Template not found")
    if existing.data.get("is_system"):
        raise HTTPException(status_code=403, detail="Cannot delete system templates")
    supabase.table("email_templates").delete().eq("id", template_id).execute()
    return {"deleted": True}


@router.post("/templates/{template_id}/preview")
async def preview_template(
    template_id: str,
    body: PreviewRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Render template preview with sample variable values."""
    supabase = get_supabase_client()
    result = supabase.table("email_templates").select("html_body, subject, variables").eq("id", template_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Template not found")

    html = result.data["html_body"]
    subject = result.data["subject"]

    # Replace variables
    for key, value in body.variables.items():
        html = html.replace(f"{{{{{key}}}}}", value)
        subject = subject.replace(f"{{{{{key}}}}}", value)

    return {"html": html, "subject": subject}


@router.post("/templates/{template_id}/send-test")
async def send_test_email(
    template_id: str,
    admin: dict = Depends(verify_admin_role),
):
    """Send a test email to the admin's own email."""
    supabase = get_supabase_client()
    result = supabase.table("email_templates").select("*").eq("id", template_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Template not found")

    template = result.data
    admin_email = admin.get("user_email")
    if not admin_email:
        raise HTTPException(status_code=400, detail="Admin email not found")

    # Replace variables with sample values
    html = template["html_body"]
    subject = f"[TEST] {template['subject']}"
    variables = template.get("variables") or []
    for var in variables:
        html = html.replace(f"{{{{{var}}}}}", f"[{var}]")
        subject = subject.replace(f"{{{{{var}}}}}", f"[{var}]")

    from services.email_service import send_tracked_email
    success = send_tracked_email(
        to_email=admin_email,
        subject=subject,
        html_body=html,
        template_id=template_id,
    )

    if not success:
        raise HTTPException(status_code=500, detail="Failed to send test email")

    return {"sent": True, "to": admin_email}


# ============================================================================
# AI Endpoint
# ============================================================================

@router.post("/ai/generate")
async def ai_generate_email(
    body: AIGenerateRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Generate or edit email HTML via Claude AI."""
    try:
        from services.email_ai_service import generate_email_html
        result = generate_email_html(
            prompt=body.prompt,
            existing_html=body.existing_html,
            context=body.template_context,
        )
        return {"html": result.html, "subject": result.subject}
    except Exception as e:
        logger.error(f"AI email generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")


# ============================================================================
# Campaign Endpoints
# ============================================================================

@router.get("/campaigns")
async def list_campaigns(
    admin: dict = Depends(verify_admin_role),
):
    """List all campaigns with template name joined."""
    supabase = get_supabase_client()
    result = (
        supabase.table("email_campaigns")
        .select("*, email_templates(name)")
        .order("created_at", desc=True)
        .execute()
    )
    campaigns = []
    for c in (result.data or []):
        template_info = c.pop("email_templates", None)
        c["template_name"] = template_info.get("name") if template_info else None
        campaigns.append(c)
    return {"campaigns": campaigns}


@router.post("/campaigns")
async def create_campaign(
    body: CampaignCreateRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Create a new campaign (draft or scheduled)."""
    supabase = get_supabase_client()

    status = "scheduled" if body.scheduled_at else "draft"

    data = {
        "name": body.name,
        "template_id": body.template_id,
        "subject_override": body.subject_override,
        "audience": body.audience,
        "audience_config": body.audience_config,
        "status": status,
        "scheduled_at": body.scheduled_at,
        "created_by": admin["user_id"],
    }
    result = supabase.table("email_campaigns").insert(data).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create campaign")
    return result.data[0]


@router.put("/campaigns/{campaign_id}")
async def update_campaign(
    campaign_id: str,
    body: CampaignUpdateRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Update or cancel a campaign."""
    supabase = get_supabase_client()

    existing = supabase.table("email_campaigns").select("status").eq("id", campaign_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    current_status = existing.data["status"]

    # Only draft/scheduled campaigns can be modified
    if body.status == "cancelled" and current_status in ("draft", "scheduled"):
        supabase.table("email_campaigns").update({
            "status": "cancelled",
            "updated_at": datetime.utcnow().isoformat(),
        }).eq("id", campaign_id).execute()
        return {"cancelled": True}

    if current_status not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Cannot update campaign with status '{current_status}'")

    update_data = {k: v for k, v in body.dict(exclude_unset=True).items() if v is not None}
    update_data["updated_at"] = datetime.utcnow().isoformat()

    # If scheduled_at is being set, update status to scheduled
    if "scheduled_at" in update_data and update_data["scheduled_at"]:
        update_data["status"] = "scheduled"

    result = supabase.table("email_campaigns").update(update_data).eq("id", campaign_id).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to update campaign")
    return result.data[0]


@router.post("/campaigns/{campaign_id}/send")
async def send_campaign(
    campaign_id: str,
    background_tasks: BackgroundTasks,
    admin: dict = Depends(verify_admin_role),
):
    """Execute a campaign immediately (runs in background)."""
    supabase = get_supabase_client()

    existing = supabase.table("email_campaigns").select("status").eq("id", campaign_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    if existing.data["status"] not in ("draft", "scheduled"):
        raise HTTPException(status_code=400, detail=f"Cannot send campaign with status '{existing.data['status']}'")

    from services.email_campaign_service import execute_campaign
    background_tasks.add_task(execute_campaign, campaign_id)

    return {"started": True, "campaign_id": campaign_id}


@router.get("/campaigns/{campaign_id}/recipients")
async def get_campaign_recipients(
    campaign_id: str,
    admin: dict = Depends(verify_admin_role),
):
    """Get estimated recipient count for a campaign's audience."""
    supabase = get_supabase_client()
    campaign = supabase.table("email_campaigns").select("audience, audience_config").eq("id", campaign_id).single().execute()
    if not campaign.data:
        raise HTTPException(status_code=404, detail="Campaign not found")

    from services.email_campaign_service import get_audience_count
    count = get_audience_count(campaign.data["audience"], campaign.data.get("audience_config"))
    return {"count": count}


@router.post("/campaigns/audience-count")
async def get_audience_count_endpoint(
    body: AudienceCountRequest,
    admin: dict = Depends(verify_admin_role),
):
    """Get estimated recipient count for an audience type (for campaign creation form)."""
    from services.email_campaign_service import get_audience_count
    count = get_audience_count(body.audience, body.audience_config)
    return {"count": count}


# ============================================================================
# Send History
# ============================================================================

@router.get("/sends")
async def list_sends(
    template_id: Optional[str] = Query(None),
    campaign_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    email: Optional[str] = Query(None),
    date_from: Optional[str] = Query(None),
    date_to: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    limit: int = Query(50, ge=1, le=200),
    admin: dict = Depends(verify_admin_role),
):
    """Paginated send history with filters."""
    supabase = get_supabase_client()

    query = (
        supabase.table("email_sends")
        .select("*, email_templates(name)", count="exact")
        .order("created_at", desc=True)
    )

    if template_id:
        query = query.eq("template_id", template_id)
    if campaign_id:
        query = query.eq("campaign_id", campaign_id)
    if status:
        query = query.eq("status", status)
    if email:
        query = query.ilike("recipient_email", f"%{email}%")
    if date_from:
        query = query.gte("created_at", date_from)
    if date_to:
        query = query.lte("created_at", date_to)

    offset = (page - 1) * limit
    query = query.range(offset, offset + limit - 1)

    result = query.execute()

    sends = []
    for s in (result.data or []):
        template_info = s.pop("email_templates", None)
        s["template_name"] = template_info.get("name") if template_info else None
        sends.append(s)

    total = result.count or 0
    total_pages = (total + limit - 1) // limit

    return {
        "sends": sends,
        "total": total,
        "page": page,
        "limit": limit,
        "total_pages": total_pages,
    }
