"""
Integrations API

Endpoints for managing user integrations via Nango.
Handles connection sessions, listing integrations, and connection status.
"""

import os
import logging
from typing import Any, Dict, List, Optional
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from api.requests.api_auth import get_auth_header
from services.nango_service import (
    get_nango_service,
    SUPPORTED_INTEGRATIONS,
    IntegrationCategory
)
from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/integrations", tags=["Integrations"])


# ==================
# Models
# ==================

class ConnectSessionRequest(BaseModel):
    """Request to create a connection session"""
    integrations: Optional[List[str]] = Field(
        None,
        description="Specific integrations to allow. If None, shows all available."
    )


class ConnectSessionResponse(BaseModel):
    """Response with session token for Connect UI"""
    token: str


class IntegrationInfo(BaseModel):
    """Information about an integration"""
    id: str
    name: str
    category: str
    icon: str
    description: str
    capabilities: List[str]
    connected: bool
    connection_id: Optional[str] = None
    connected_at: Optional[str] = None
    account_email: Optional[str] = None
    account_name: Optional[str] = None
    status: Optional[str] = None


class IntegrationListResponse(BaseModel):
    """Response with list of integrations"""
    integrations: List[IntegrationInfo]
    categories: List[Dict[str, Any]]


class ConnectionWebhookPayload(BaseModel):
    """Webhook payload from Nango on connection events"""
    type: str  # 'auth'
    operation: str  # 'creation', 'refresh_error', 'deletion'
    success: bool
    connection_id: Optional[str] = None
    provider_config_key: Optional[str] = None
    end_user: Optional[Dict[str, Any]] = None
    error: Optional[str] = None


class DisconnectResponse(BaseModel):
    """Response after disconnecting an integration"""
    success: bool
    message: str


# ==================
# Endpoints
# ==================

@router.get("/available")
async def get_available_integrations(
    category: Optional[str] = Query(None, description="Filter by category")
) -> Dict[str, Any]:
    """
    Get all available integrations (no auth required).
    Used to show what integrations are possible.
    """
    nango = get_nango_service()

    # Filter by category if provided
    cat_filter = None
    if category:
        try:
            cat_filter = IntegrationCategory(category)
        except ValueError:
            pass

    integrations = nango.get_supported_integrations(category=cat_filter)

    # Build category list
    categories = [
        {"id": c.value, "name": c.value.replace("_", " ").title()}
        for c in IntegrationCategory
    ]

    return {
        "integrations": [
            {
                "id": i.id,
                "name": i.name,
                "category": i.category.value,
                "icon": i.icon,
                "description": i.description,
                "capabilities": i.capabilities
            }
            for i in integrations
        ],
        "categories": categories
    }


@router.get("")
async def get_user_integrations(
    auth: Dict = Depends(get_auth_header)
) -> IntegrationListResponse:
    """
    Get all integrations with user's connection status.
    Returns both available and connected integrations.
    """
    user_id = auth["user_id"]
    local_connections = {}

    # Try to get user's connections from local cache
    try:
        supabase = get_supabase_client()
        result = supabase.table("user_integrations") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("status", "active") \
            .execute()

        for conn in result.data or []:
            local_connections[conn["provider"]] = conn
    except Exception as e:
        # Table might not exist or other error - continue without connections
        logger.warning(f"Failed to fetch local connections: {e}")

    # Build integration list with connection status
    integrations = []

    # Add Apollo as a special "always available" integration (uses our API key)
    from services.apollo_service import get_apollo_service
    apollo = get_apollo_service()
    if apollo.is_configured():
        integrations.append(IntegrationInfo(
            id="apollo",
            name="Apollo.io",
            category="crm",
            icon="apollo",
            description="Business intelligence - company and contact enrichment. Always available.",
            capabilities=["Company lookup", "Person lookup", "Business intelligence"],
            connected=True,  # Always connected since we use our API key
            status="active"
        ))

    # Add Nango-based OAuth integrations
    for integration_id, config in SUPPORTED_INTEGRATIONS.items():
        local_conn = local_connections.get(config.id)

        integrations.append(IntegrationInfo(
            id=config.id,
            name=config.name,
            category=config.category.value,
            icon=config.icon,
            description=config.description,
            capabilities=config.capabilities,
            connected=local_conn is not None,
            connection_id=local_conn["connection_id"] if local_conn else None,
            connected_at=local_conn["created_at"] if local_conn else None,
            account_email=local_conn.get("provider_account_email") if local_conn else None,
            account_name=local_conn.get("provider_account_name") if local_conn else None,
            status=local_conn.get("status") if local_conn else None
        ))

    # Sort: connected first, then by name
    integrations.sort(key=lambda x: (not x.connected, x.name))

    categories = [
        {"id": c.value, "name": c.value.replace("_", " ").title()}
        for c in IntegrationCategory
    ]

    return IntegrationListResponse(integrations=integrations, categories=categories)


@router.post("/session")
async def create_connect_session(
    request: ConnectSessionRequest,
    auth: Dict = Depends(get_auth_header)
) -> ConnectSessionResponse:
    """
    Create a session token for the Nango Connect UI.
    Frontend uses this to open the OAuth modal.
    """
    user_id = auth["user_id"]
    nango = get_nango_service()

    if not nango.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Integration service not configured"
        )

    try:
        result = nango.create_connect_session(
            user_id=user_id,
            allowed_integrations=request.integrations
        )

        return ConnectSessionResponse(token=result["token"])
    except Exception as e:
        logger.error(f"Failed to create connect session: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create connection session"
        )


@router.delete("/{provider}")
async def disconnect_integration(
    provider: str,
    auth: Dict = Depends(get_auth_header)
) -> DisconnectResponse:
    """
    Disconnect an integration.
    Removes the connection from both Nango and local cache.
    """
    user_id = auth["user_id"]
    nango = get_nango_service()
    supabase = get_supabase_client()

    # Get local connection record
    try:
        result = supabase.table("user_integrations") \
            .select("connection_id") \
            .eq("user_id", user_id) \
            .eq("provider", provider) \
            .single() \
            .execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Integration not found")

        connection_id = result.data["connection_id"]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to find integration: {e}")
        raise HTTPException(status_code=404, detail="Integration not found")

    # Delete from Nango
    try:
        if nango.is_configured():
            nango.delete_connection(provider, connection_id)
    except Exception as e:
        logger.warning(f"Failed to delete from Nango (may already be deleted): {e}")

    # Delete local record
    try:
        supabase.table("user_integrations") \
            .delete() \
            .eq("user_id", user_id) \
            .eq("provider", provider) \
            .execute()
    except Exception as e:
        logger.error(f"Failed to delete local record: {e}")

    return DisconnectResponse(
        success=True,
        message=f"Disconnected {provider}"
    )


@router.post("/webhook")
async def handle_nango_webhook(
    payload: ConnectionWebhookPayload
) -> Dict[str, str]:
    """
    Handle webhooks from Nango for connection events.
    Updates local cache when connections are created/deleted/errored.
    """
    logger.info(f"Nango webhook: {payload.type}/{payload.operation}")

    supabase = get_supabase_client()

    if payload.type == "auth":
        end_user = payload.end_user or {}
        user_id = end_user.get("endUserId") or end_user.get("id")
        provider = payload.provider_config_key
        connection_id = payload.connection_id

        if not user_id or not provider:
            return {"status": "ignored", "reason": "missing user or provider"}

        if payload.operation == "creation" and payload.success:
            # New connection - save to local cache
            try:
                # Fetch connection details from Nango
                nango = get_nango_service()
                conn_details = nango.get_connection(provider, connection_id) if connection_id else None

                data = {
                    "user_id": user_id,
                    "provider": provider,
                    "connection_id": connection_id,
                    "status": "active",
                    "provider_account_email": conn_details.get("metadata", {}).get("email") if conn_details else None,
                    "provider_account_name": conn_details.get("metadata", {}).get("name") if conn_details else None,
                }

                # Upsert (in case of reconnection)
                supabase.table("user_integrations") \
                    .upsert(data, on_conflict="user_id,provider") \
                    .execute()

                logger.info(f"Saved connection: {user_id}/{provider}")
            except Exception as e:
                logger.error(f"Failed to save connection: {e}")

        elif payload.operation == "deletion":
            # Connection deleted
            try:
                supabase.table("user_integrations") \
                    .delete() \
                    .eq("user_id", user_id) \
                    .eq("provider", provider) \
                    .execute()

                logger.info(f"Deleted connection: {user_id}/{provider}")
            except Exception as e:
                logger.error(f"Failed to delete connection: {e}")

        elif payload.operation == "refresh_error":
            # Token refresh failed - mark as expired
            try:
                supabase.table("user_integrations") \
                    .update({
                        "status": "expired",
                        "error_message": payload.error
                    }) \
                    .eq("user_id", user_id) \
                    .eq("provider", provider) \
                    .execute()

                logger.info(f"Marked connection as expired: {user_id}/{provider}")
            except Exception as e:
                logger.error(f"Failed to update connection status: {e}")

    return {"status": "ok"}


@router.get("/{provider}/status")
async def get_integration_status(
    provider: str,
    auth: Dict = Depends(get_auth_header)
) -> Dict[str, Any]:
    """
    Get detailed status for a specific integration.
    Checks both local cache and Nango for freshness.
    """
    user_id = auth["user_id"]
    supabase = get_supabase_client()
    nango = get_nango_service()

    # Get local record
    try:
        result = supabase.table("user_integrations") \
            .select("*") \
            .eq("user_id", user_id) \
            .eq("provider", provider) \
            .single() \
            .execute()

        if not result.data:
            return {
                "connected": False,
                "provider": provider
            }

        local = result.data

        # Optionally verify with Nango
        nango_status = None
        if nango.is_configured() and local.get("connection_id"):
            try:
                conn = nango.get_connection(provider, local["connection_id"])
                nango_status = "valid" if conn else "not_found"
            except Exception:
                nango_status = "error"

        return {
            "connected": True,
            "provider": provider,
            "connection_id": local["connection_id"],
            "account_email": local.get("provider_account_email"),
            "account_name": local.get("provider_account_name"),
            "status": local["status"],
            "nango_status": nango_status,
            "created_at": local["created_at"],
            "last_used_at": local.get("last_used_at")
        }
    except Exception as e:
        logger.error(f"Failed to get integration status: {e}")
        return {
            "connected": False,
            "provider": provider,
            "error": str(e)
        }


@router.post("/{provider}/reconnect")
async def reconnect_integration(
    provider: str,
    auth: Dict = Depends(get_auth_header)
) -> ConnectSessionResponse:
    """
    Create a reconnection session for an expired integration.
    """
    user_id = auth["user_id"]
    nango = get_nango_service()

    if not nango.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Integration service not configured"
        )

    try:
        result = nango.create_connect_session(
            user_id=user_id,
            allowed_integrations=[provider]
        )

        return ConnectSessionResponse(token=result["token"])
    except Exception as e:
        logger.error(f"Failed to create reconnect session: {e}")
        raise HTTPException(
            status_code=500,
            detail="Failed to create reconnection session"
        )


# ==================
# Enabled Integrations (for @ mentions)
# ==================

class EnabledIntegrationInfo(BaseModel):
    """Information about an enabled integration for @ mentions"""
    id: str
    name: str
    icon: str
    description: str
    capabilities: List[str]


@router.get("/enabled")
async def get_enabled_integrations(
    auth: Dict = Depends(get_auth_header)
) -> Dict[str, Any]:
    """
    Get all system-enabled integrations for @ mentions in chat.
    Only returns integrations that are activated system-wide.
    """
    from services.integration_registry import get_integration_registry

    registry = get_integration_registry()
    enabled = await registry.get_enabled_integrations()

    return {
        "integrations": [
            EnabledIntegrationInfo(
                id=config.id,
                name=config.name,
                icon=config.icon,
                description=config.description,
                capabilities=config.capabilities
            ).model_dump()
            for config in enabled
        ]
    }


# ==================
# LinkedIn Search (via Apollo)
# ==================

class LinkedInSearchRequest(BaseModel):
    """Request for LinkedIn profile search"""
    query: Optional[str] = Field(None, description="Free-text search query")
    name: Optional[str] = Field(None, description="Person's name")
    company: Optional[str] = Field(None, description="Company name")
    title: Optional[str] = Field(None, description="Job title")
    location: Optional[str] = Field(None, description="Location")
    linkedin_url: Optional[str] = Field(None, description="Direct LinkedIn URL")
    page: int = Field(1, ge=1)
    per_page: int = Field(10, ge=1, le=100)


class LinkedInProfile(BaseModel):
    """LinkedIn profile result"""
    name: str
    title: Optional[str] = None
    company: Optional[str] = None
    linkedin_url: Optional[str] = None
    location: Optional[str] = None


@router.post("/linkedin/search")
async def search_linkedin(
    request: LinkedInSearchRequest,
    auth: Dict = Depends(get_auth_header)
) -> Dict[str, Any]:
    """
    Search LinkedIn profiles via Apollo's People Search API.
    Uses system Apollo API key - no user OAuth required.
    """
    from services.integration_registry import get_integration_registry
    from services.apollo_service import get_apollo_service

    # Check if LinkedIn integration is enabled
    registry = get_integration_registry()
    if not await registry.is_enabled("linkedin"):
        raise HTTPException(
            status_code=403,
            detail="LinkedIn integration is not enabled"
        )

    apollo = get_apollo_service()
    if not apollo.is_configured():
        raise HTTPException(
            status_code=503,
            detail="Apollo API not configured"
        )

    try:
        # If query is provided, parse it for name/company
        name = request.name
        company = request.company
        title = request.title

        if request.query and not (name or company):
            # Try to parse "Name at Company" format
            query = request.query.strip()
            if " at " in query.lower():
                parts = query.lower().split(" at ", 1)
                name = parts[0].strip().title()
                company = parts[1].strip().title()
            elif " @ " in query:
                parts = query.split(" @ ", 1)
                name = parts[0].strip()
                company = parts[1].strip()
            else:
                name = query

        results = apollo.search_linkedin_profiles(
            name=name,
            company=company,
            title=title,
            location=request.location,
            linkedin_url=request.linkedin_url,
            page=request.page,
            per_page=request.per_page
        )

        return {
            "profiles": [
                LinkedInProfile(
                    name=p.name,
                    title=p.title,
                    company=p.company,
                    linkedin_url=p.linkedin_url,
                    location=", ".join(filter(None, [p.city, p.state, p.country]))
                ).model_dump()
                for p in results
            ],
            "page": request.page,
            "per_page": request.per_page
        }
    except PermissionError as e:
        raise HTTPException(
            status_code=403,
            detail="People search requires paid Apollo plan"
        )
    except Exception as e:
        logger.error(f"LinkedIn search failed: {e}")
        raise HTTPException(
            status_code=500,
            detail="Search failed"
        )


# ==================
# Admin Integration Settings
# ==================

class UpdateIntegrationSettingsRequest(BaseModel):
    """Request to update integration settings"""
    enabled: Optional[bool] = None
    config: Optional[Dict[str, Any]] = None


class IntegrationSettingsResponse(BaseModel):
    """Integration settings response"""
    id: str
    name: str
    description: str
    icon: str
    provider: str
    requires_user_connection: bool
    capabilities: List[str]
    enabled: bool
    config: Dict[str, Any]


@router.get("/admin/all")
async def list_all_integrations_admin(
    auth: Dict = Depends(get_auth_header)
) -> Dict[str, Any]:
    """
    List all integrations with their settings (admin).
    Returns all registered integrations regardless of enabled status.
    """
    # TODO: Add proper admin role check here
    # For now, any authenticated user can access
    from services.integration_registry import get_integration_registry

    registry = get_integration_registry()
    all_integrations = registry.get_all_integrations()

    results = []
    for config in all_integrations:
        settings = await registry.get_integration_settings(config.id)
        results.append(IntegrationSettingsResponse(
            id=config.id,
            name=config.name,
            description=config.description,
            icon=config.icon,
            provider=config.provider.value,
            requires_user_connection=config.requires_user_connection,
            capabilities=config.capabilities,
            enabled=settings.get("enabled", config.default_enabled),
            config=settings.get("config", {})
        ).model_dump())

    return {"integrations": results}


@router.patch("/admin/{integration_id}")
async def update_integration_settings(
    integration_id: str,
    request: UpdateIntegrationSettingsRequest,
    auth: Dict = Depends(get_auth_header)
) -> Dict[str, Any]:
    """
    Update settings for an integration (admin).
    Can enable/disable and configure integrations.
    """
    # TODO: Add proper admin role check here
    from services.integration_registry import get_integration_registry

    registry = get_integration_registry()

    if not registry.is_registered(integration_id):
        raise HTTPException(
            status_code=404,
            detail=f"Integration '{integration_id}' not found"
        )

    # Update enabled status
    if request.enabled is not None:
        success = await registry.set_enabled(integration_id, request.enabled)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update integration status"
            )

    # Update config
    if request.config is not None:
        success = await registry.update_integration_config(integration_id, request.config)
        if not success:
            raise HTTPException(
                status_code=500,
                detail="Failed to update integration config"
            )

    # Return updated settings
    settings = await registry.get_integration_settings(integration_id)
    return {"success": True, "settings": settings}
