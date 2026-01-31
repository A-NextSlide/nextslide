"""
API endpoints for PQA (Product Qualified Account) detection and enterprise
upgrade prompts.

Endpoints:
- GET    /api/pqa/status              - Check if current user's domain is PQA
- GET    /api/pqa/prompt-status       - Check if upgrade prompt should be shown
- POST   /api/pqa/dismiss-prompt      - Dismiss the upgrade prompt
- POST   /api/pqa/convert             - Record conversion event
- GET    /api/pqa/enterprise-features - Get available enterprise features for plan
"""

import os
import logging
from typing import Optional, Dict, Any

from fastapi import APIRouter, HTTPException, Depends, Header
from pydantic import BaseModel
import httpx

from services.pqa_service import get_pqa_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/pqa", tags=["PQA Enterprise"])


# ============================================================================
# Auth Helpers (same pattern as api_sharing.py)
# ============================================================================

async def _get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def _get_current_user(token: Optional[str] = Depends(_get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0),
        )

        if resp.status_code == 200:
            user_json = resp.json()
            return {
                "id": user_json.get("id"),
                "email": user_json.get("email"),
                "user_metadata": user_json.get("user_metadata", {}),
            }

        raise HTTPException(status_code=401, detail="Invalid token")
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Auth failure in PQA endpoint: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


# ============================================================================
# Request / Response Models
# ============================================================================

class DismissPromptRequest(BaseModel):
    prompt_type: str


# ============================================================================
# Endpoints
# ============================================================================

@router.get("/status")
async def get_pqa_status(user: Dict[str, Any] = Depends(_get_current_user)):
    """Check if the current user's domain qualifies as PQA."""
    service = get_pqa_service()

    try:
        result = service.detect_pqa_for_user(user["id"], user.get("email", ""))
        return result
    except Exception as e:
        logger.error(f"Error checking PQA status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check PQA status")


@router.get("/prompt-status")
async def get_prompt_status(user: Dict[str, Any] = Depends(_get_current_user)):
    """Check if upgrade prompt should be shown to the current user."""
    service = get_pqa_service()

    try:
        result = service.get_pqa_prompt_status(user["id"])
        return result
    except Exception as e:
        logger.error(f"Error checking PQA prompt status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check prompt status")


@router.post("/dismiss-prompt")
async def dismiss_prompt(
    body: DismissPromptRequest,
    user: Dict[str, Any] = Depends(_get_current_user),
):
    """Dismiss a PQA upgrade prompt."""
    service = get_pqa_service()

    try:
        success = service.dismiss_pqa_prompt(user["id"], body.prompt_type)
        if not success:
            raise HTTPException(status_code=500, detail="Failed to dismiss prompt")
        return {"success": True, "message": "Prompt dismissed"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error dismissing PQA prompt: {e}")
        raise HTTPException(status_code=500, detail="Failed to dismiss prompt")


@router.post("/convert")
async def record_conversion(user: Dict[str, Any] = Depends(_get_current_user)):
    """Record that a PQA user has converted (upgraded)."""
    service = get_pqa_service()

    try:
        success = service.record_pqa_conversion(user["id"])
        if not success:
            raise HTTPException(status_code=500, detail="Failed to record conversion")
        return {"success": True, "message": "Conversion recorded"}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error recording PQA conversion: {e}")
        raise HTTPException(status_code=500, detail="Failed to record conversion")


@router.get("/enterprise-features")
async def get_enterprise_features(user: Dict[str, Any] = Depends(_get_current_user)):
    """Get available enterprise features for the current user's plan."""
    service = get_pqa_service()

    try:
        # Get the user's plan from billing/users table
        from services.supabase import get_supabase_client

        client = get_supabase_client()
        plan_result = (
            client.table("users")
            .select("plan_id")
            .eq("id", user["id"])
            .execute()
        )

        plan_id = "free"
        if plan_result.data:
            plan_id = plan_result.data[0].get("plan_id", "free") or "free"

        result = service.get_enterprise_features_status(user["id"], plan_id)
        return result

    except Exception as e:
        logger.error(f"Error getting enterprise features: {e}")
        raise HTTPException(status_code=500, detail="Failed to get enterprise features")
