"""
Developer API Key Management Endpoints

Handles CRUD operations for API keys in the developer settings.
All endpoints require JWT authentication.
"""

import logging
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, UploadFile, File
from pydantic import BaseModel, Field
import uuid

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.api_key_service import get_api_key_service, ApiKeyRecord
from services.billing_service import get_billing_service
from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/developer", tags=["Developer API"])


# =============================================================================
# Request/Response Models
# =============================================================================

class CreateApiKeyRequest(BaseModel):
    """Request to create a new API key."""
    name: str = Field(default="Default", max_length=100)
    context_instructions: Optional[str] = Field(default=None, max_length=5000)
    context_images: Optional[List[str]] = Field(default=None)
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    include_edit_link: bool = Field(default=False)


class UpdateApiKeyRequest(BaseModel):
    """Request to update an API key."""
    name: Optional[str] = Field(default=None, max_length=100)
    context_instructions: Optional[str] = Field(default=None, max_length=5000)
    context_images: Optional[List[str]] = Field(default=None)
    webhook_url: Optional[str] = Field(default=None, max_length=500)
    include_edit_link: Optional[bool] = Field(default=None)


class ApiKeyResponse(BaseModel):
    """Response containing API key details (without the secret)."""
    id: str
    key_prefix: str
    name: str
    context_instructions: Optional[str]
    context_images: List[str]
    webhook_url: Optional[str]
    include_edit_link: bool
    created_at: str
    last_used_at: Optional[str]
    request_count: int
    is_active: bool


class CreateApiKeyResponse(BaseModel):
    """Response after creating an API key (includes the full key ONCE)."""
    api_key: str  # Full key - shown only once
    key_details: ApiKeyResponse


class ImageUploadResponse(BaseModel):
    """Response after uploading a context image."""
    url: str
    path: str


# =============================================================================
# Helper Functions
# =============================================================================

async def get_current_user(token: Optional[str] = Depends(get_auth_header)) -> dict:
    """Get current authenticated user from JWT token."""
    if not token:
        raise HTTPException(status_code=401, detail="Authentication required")

    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token)

    if not user:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    return user


async def require_pro_user(user: dict = Depends(get_current_user)) -> dict:
    """Require user to have Pro subscription for API access."""
    user_id = user.get("id")
    if not user_id:
        raise HTTPException(status_code=401, detail="Invalid user")

    billing = get_billing_service()
    try:
        balance = await billing.get_user_balance(user_id)
        if balance and balance.plan_id in ('pro', 'enterprise'):
            return user
        # Also allow friends & family
        if balance and hasattr(balance, 'is_friends_family') and balance.is_friends_family:
            return user
    except Exception as e:
        logger.warning(f"Error checking subscription: {e}")

    raise HTTPException(
        status_code=403,
        detail="Developer API requires a Pro subscription. Please upgrade to access this feature."
    )


def record_to_response(record: ApiKeyRecord) -> ApiKeyResponse:
    """Convert ApiKeyRecord to ApiKeyResponse."""
    return ApiKeyResponse(
        id=record.id,
        key_prefix=record.key_prefix,
        name=record.name,
        context_instructions=record.context_instructions,
        context_images=record.context_images,
        webhook_url=record.webhook_url,
        include_edit_link=record.include_edit_link,
        created_at=record.created_at,
        last_used_at=record.last_used_at,
        request_count=record.request_count,
        is_active=record.is_active
    )


# =============================================================================
# Endpoints
# =============================================================================

@router.get("/keys", response_model=List[ApiKeyResponse])
async def list_api_keys(user: dict = Depends(require_pro_user)):
    """
    List all API keys for the current user.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    keys = await service.list_api_keys(user_id)
    return [record_to_response(k) for k in keys]


@router.post("/keys", response_model=CreateApiKeyResponse)
async def create_api_key(
    request: CreateApiKeyRequest,
    user: dict = Depends(require_pro_user)
):
    """
    Create a new API key.

    The full API key is returned ONLY in this response.
    Store it securely - it cannot be retrieved again.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    try:
        full_key, record = await service.create_api_key(
            user_id=user_id,
            name=request.name,
            context_instructions=request.context_instructions,
            context_images=request.context_images,
            webhook_url=request.webhook_url,
            include_edit_link=request.include_edit_link
        )

        return CreateApiKeyResponse(
            api_key=full_key,
            key_details=record_to_response(record)
        )

    except Exception as e:
        logger.error(f"Error creating API key: {e}")
        raise HTTPException(status_code=500, detail="Failed to create API key")


@router.get("/keys/{key_id}", response_model=ApiKeyResponse)
async def get_api_key(
    key_id: str,
    user: dict = Depends(require_pro_user)
):
    """
    Get details of a specific API key.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    record = await service.get_api_key(key_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    return record_to_response(record)


@router.patch("/keys/{key_id}", response_model=ApiKeyResponse)
async def update_api_key(
    key_id: str,
    request: UpdateApiKeyRequest,
    user: dict = Depends(require_pro_user)
):
    """
    Update an API key's settings.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    # Build updates dict from non-None fields
    updates = {}
    if request.name is not None:
        updates["name"] = request.name
    if request.context_instructions is not None:
        updates["context_instructions"] = request.context_instructions
    if request.context_images is not None:
        updates["context_images"] = request.context_images
    if request.webhook_url is not None:
        updates["webhook_url"] = request.webhook_url
    if request.include_edit_link is not None:
        updates["include_edit_link"] = request.include_edit_link

    record = await service.update_api_key(key_id, user_id, updates)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    return record_to_response(record)


@router.delete("/keys/{key_id}")
async def delete_api_key(
    key_id: str,
    user: dict = Depends(require_pro_user)
):
    """
    Delete an API key permanently.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    success = await service.delete_api_key(key_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")

    return {"success": True, "message": "API key deleted"}


@router.post("/keys/{key_id}/revoke")
async def revoke_api_key(
    key_id: str,
    user: dict = Depends(require_pro_user)
):
    """
    Revoke an API key (soft delete).

    The key will no longer work but the record is preserved.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    success = await service.revoke_api_key(key_id, user_id)
    if not success:
        raise HTTPException(status_code=404, detail="API key not found")

    return {"success": True, "message": "API key revoked"}


@router.post("/keys/{key_id}/images", response_model=ImageUploadResponse)
async def upload_context_image(
    key_id: str,
    file: UploadFile = File(...),
    user: dict = Depends(require_pro_user)
):
    """
    Upload a context image for an API key.

    Images are stored in Supabase storage and the URL is returned.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    # Verify key belongs to user
    record = await service.get_api_key(key_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    # Validate file type
    allowed_types = ["image/jpeg", "image/png", "image/gif", "image/webp"]
    if file.content_type not in allowed_types:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid file type. Allowed: {', '.join(allowed_types)}"
        )

    # Read file content
    content = await file.read()

    # Max 5MB
    if len(content) > 5 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="File too large. Maximum 5MB.")

    try:
        # Generate unique filename
        ext = file.filename.split(".")[-1] if file.filename and "." in file.filename else "jpg"
        filename = f"{uuid.uuid4()}.{ext}"
        path = f"{user_id}/{key_id}/{filename}"

        # Upload to Supabase storage
        client = get_supabase_client()
        result = client.storage.from_("api-context-images").upload(
            path=path,
            file=content,
            file_options={"content-type": file.content_type}
        )

        # Get public URL
        url_result = client.storage.from_("api-context-images").get_public_url(path)

        return ImageUploadResponse(url=url_result, path=path)

    except Exception as e:
        logger.error(f"Error uploading context image: {e}")
        raise HTTPException(status_code=500, detail="Failed to upload image")


@router.delete("/keys/{key_id}/images/{image_path:path}")
async def delete_context_image(
    key_id: str,
    image_path: str,
    user: dict = Depends(require_pro_user)
):
    """
    Delete a context image from an API key.

    Requires Pro subscription.
    """
    user_id = user.get("id")
    service = get_api_key_service()

    # Verify key belongs to user
    record = await service.get_api_key(key_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="API key not found")

    # Verify path belongs to user
    if not image_path.startswith(f"{user_id}/"):
        raise HTTPException(status_code=403, detail="Access denied")

    try:
        client = get_supabase_client()
        client.storage.from_("api-context-images").remove([image_path])
        return {"success": True, "message": "Image deleted"}

    except Exception as e:
        logger.error(f"Error deleting context image: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete image")


@router.get("/status")
async def get_developer_status(user: dict = Depends(get_current_user)):
    """
    Check if the current user has access to Developer API.

    Returns subscription status and whether API access is available.
    """
    user_id = user.get("id")
    billing = get_billing_service()

    try:
        balance = await billing.get_user_balance(user_id)

        has_access = False
        if balance:
            has_access = balance.plan_id in ('pro', 'enterprise')
            if hasattr(balance, 'is_friends_family') and balance.is_friends_family:
                has_access = True

        return {
            "has_access": has_access,
            "plan_id": balance.plan_id if balance else "free",
            "plan_name": balance.plan_name if balance else "Free",
            "message": "Developer API access granted" if has_access else "Upgrade to Pro for Developer API access"
        }

    except Exception as e:
        logger.error(f"Error checking developer status: {e}")
        return {
            "has_access": False,
            "plan_id": "unknown",
            "plan_name": "Unknown",
            "message": "Unable to verify subscription status"
        }
