"""
Chatbase API endpoints for identity verification and help center proxy
"""
import os
import jwt
import httpx
import logging
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, Depends, Header, Request
from fastapi.responses import StreamingResponse, Response
from typing import Optional

from services.supabase_auth_service import get_auth_service

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/chatbase", tags=["chatbase"])

# Get the secret from environment
CHATBASE_IDENTITY_SECRET = os.getenv("CHATBASE_IDENTITY_SECRET")


async def get_current_user(authorization: Optional[str] = Header(None)):
    """Extract and verify user from Authorization header"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid authorization header")

    token = authorization.replace("Bearer ", "")
    auth_service = get_auth_service()

    try:
        user = auth_service.get_user_with_token(token)
        if not user:
            raise HTTPException(status_code=401, detail="Invalid token")
        return user
    except Exception as e:
        logger.error(f"Auth error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")


@router.get("/identity-token")
async def get_identity_token(user: dict = Depends(get_current_user)):
    """
    Generate a JWT token for Chatbase identity verification.
    This allows Chatbase to identify the user for personalized support
    and Stripe integration.
    """
    if not CHATBASE_IDENTITY_SECRET:
        logger.warning("CHATBASE_IDENTITY_SECRET not configured")
        raise HTTPException(status_code=500, detail="Chatbase not configured")

    try:
        # Build the payload for Chatbase
        payload = {
            "user_id": user.get("id"),
            "email": user.get("email"),
            "name": user.get("user_metadata", {}).get("full_name"),
            # Add Stripe customer ID if available for billing integration
            # "stripe_customer_id": user.get("stripe_customer_id"),
            "exp": datetime.utcnow() + timedelta(hours=1),
            "iat": datetime.utcnow(),
        }

        # Remove None values
        payload = {k: v for k, v in payload.items() if v is not None}

        # Sign the JWT
        token = jwt.encode(payload, CHATBASE_IDENTITY_SECRET, algorithm="HS256")

        return {"token": token}

    except Exception as e:
        logger.error(f"Error generating Chatbase token: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate identity token")


# Chatbase Bot ID
CHATBASE_BOT_ID = os.getenv("VITE_CHATBASE_BOT_ID", "lO1UjxyTYHy5jrGi9Fjnz")

# Create a separate router for help center proxy (no /api prefix)
help_router = APIRouter(tags=["chatbase-help"])


@help_router.get("/help")
@help_router.get("/help/{path:path}")
async def proxy_help_center(request: Request, path: str = ""):
    """Proxy requests to Chatbase help center"""
    target_url = f"https://www.chatbase.co/{CHATBASE_BOT_ID}/help"
    if path:
        target_url = f"{target_url}/{path}"

    # Forward query params
    if request.query_params:
        target_url = f"{target_url}?{request.query_params}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                target_url,
                headers={
                    "User-Agent": request.headers.get("user-agent", ""),
                    "Accept": request.headers.get("accept", "*/*"),
                },
                follow_redirects=True,
            )

            # Filter headers to forward
            headers = {}
            for key, value in response.headers.items():
                if key.lower() not in ("transfer-encoding", "connection", "content-encoding"):
                    headers[key] = value

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=headers,
            )
        except httpx.RequestError as e:
            logger.error(f"Help center proxy error: {e}")
            raise HTTPException(status_code=502, detail="Failed to fetch help center")


@help_router.get("/__cb/{path:path}")
async def proxy_chatbase_assets(request: Request, path: str):
    """Proxy Chatbase static assets"""
    target_url = f"https://www.chatbase.co/__cb/{path}"

    if request.query_params:
        target_url = f"{target_url}?{request.query_params}"

    async with httpx.AsyncClient(timeout=30.0) as client:
        try:
            response = await client.get(
                target_url,
                headers={
                    "User-Agent": request.headers.get("user-agent", ""),
                    "Accept": request.headers.get("accept", "*/*"),
                },
                follow_redirects=True,
            )

            headers = {}
            for key, value in response.headers.items():
                if key.lower() not in ("transfer-encoding", "connection", "content-encoding"):
                    headers[key] = value

            return Response(
                content=response.content,
                status_code=response.status_code,
                headers=headers,
            )
        except httpx.RequestError as e:
            logger.error(f"Chatbase assets proxy error: {e}")
            raise HTTPException(status_code=502, detail="Failed to fetch assets")
