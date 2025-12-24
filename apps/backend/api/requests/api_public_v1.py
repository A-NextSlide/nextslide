"""
Public Developer API v1

REST API for programmatically creating presentations.
Requires API key authentication (X-API-Key header).
Available only for Pro subscribers.
"""

import asyncio
import logging
import uuid
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from fastapi import APIRouter, HTTPException, Depends, Header, BackgroundTasks
from pydantic import BaseModel, Field

from services.api_key_service import get_api_key_service, ApiKeyRecord
from services.billing_service import get_billing_service, CreditAction
from services.deck_sharing_service import get_sharing_service
from services.webhook_service import get_webhook_service
from services.supabase import get_supabase_client
from utils.supabase import upload_deck, get_deck
from models.registry import get_global_registry

logger = logging.getLogger(__name__)

router = APIRouter(tags=["Public API v1"])


# =============================================================================
# Request/Response Models
# =============================================================================

class CreateDeckRequest(BaseModel):
    """Request to create a new deck via API."""
    topic: str = Field(..., min_length=1, max_length=1000, description="Topic or prompt for the presentation")
    slides: int = Field(default=8, ge=1, le=30, description="Number of slides to generate")
    style: Optional[str] = Field(default=None, max_length=100, description="Style preset (e.g., 'corporate', 'creative', 'minimal')")
    additional_instructions: Optional[str] = Field(default=None, max_length=2000, description="Additional instructions for generation")
    metadata: Optional[Dict[str, Any]] = Field(default=None, description="Custom metadata to include in webhook responses")


class DeckStatusResponse(BaseModel):
    """Response for deck status endpoint."""
    deck_id: str
    status: str  # "generating", "completed", "failed"
    view_url: Optional[str] = None
    edit_url: Optional[str] = None
    slides_count: Optional[int] = None
    created_at: str
    completed_at: Optional[str] = None
    error_message: Optional[str] = None


class CreateDeckResponse(BaseModel):
    """Response after initiating deck creation."""
    deck_id: str
    status: str  # Always "generating" on creation
    view_url: str
    edit_url: Optional[str] = None
    poll_url: str
    estimated_seconds: int
    message: str


class DeckListResponse(BaseModel):
    """Response for listing API-created decks."""
    decks: List[DeckStatusResponse]
    total: int
    offset: int
    limit: int


# =============================================================================
# API Key Authentication
# =============================================================================

async def get_api_key_auth(
    x_api_key: str = Header(..., alias="X-API-Key", description="Your API key")
) -> Tuple[str, ApiKeyRecord]:
    """
    Validate API key and return user_id and key record.

    Raises:
        HTTPException 401: Invalid or missing API key
        HTTPException 403: User doesn't have Pro subscription
    """
    if not x_api_key:
        raise HTTPException(
            status_code=401,
            detail="Missing X-API-Key header"
        )

    service = get_api_key_service()
    result = await service.validate_api_key(x_api_key)

    if not result:
        raise HTTPException(
            status_code=401,
            detail="Invalid API key"
        )

    user_id, key_record = result

    # Verify Pro subscription
    billing = get_billing_service()
    try:
        balance = await billing.get_user_balance(user_id)
        if not balance or balance.plan_id not in ('pro', 'enterprise'):
            # Check for friends & family
            if not (balance and hasattr(balance, 'is_friends_family') and balance.is_friends_family):
                raise HTTPException(
                    status_code=403,
                    detail="Developer API requires a Pro subscription"
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error checking subscription: {e}")
        raise HTTPException(
            status_code=500,
            detail="Unable to verify subscription status"
        )

    return user_id, key_record


# =============================================================================
# Background Generation Task
# =============================================================================

async def generate_deck_background(
    deck_uuid: str,
    user_id: str,
    api_key_record: ApiKeyRecord,
    topic: str,
    num_slides: int,
    style: Optional[str],
    additional_instructions: Optional[str],
    view_url: str,
    edit_url: Optional[str],
    metadata: Optional[Dict[str, Any]]
):
    """
    Background task to generate a deck.

    This runs after the API returns immediately with the deck URLs.
    """
    webhook_service = get_webhook_service()

    try:
        # Build the outline from the topic
        from services.outline import OutlineGenerator, OutlineOptions
        from models.registry import get_global_registry

        # Combine instructions: API key context + request instructions
        # Make context instructions prominent so they're not ignored
        combined_instructions = topic

        context_parts = []
        if api_key_record.context_instructions:
            context_parts.append(api_key_record.context_instructions)
        if additional_instructions:
            context_parts.append(additional_instructions)

        if context_parts:
            combined_instructions += "\n\n---\nIMPORTANT INSTRUCTIONS (MUST FOLLOW):\n" + "\n".join(f"• {part}" for part in context_parts)

        # Prepare context images as files for the outline generator
        context_files = []
        if api_key_record.context_images:
            for img_url in api_key_record.context_images:
                if img_url:
                    context_files.append({
                        "type": "image",
                        "url": img_url,
                        "name": "context_image",
                        "source": "api_key_context"
                    })

        # Generate outline
        logger.info(f"Generating outline for deck {deck_uuid}")
        logger.info(f"Combined instructions: {combined_instructions[:200]}...")
        registry = get_global_registry()
        generator = OutlineGenerator(registry)

        options = OutlineOptions(
            prompt=combined_instructions,
            slide_count=num_slides,
            style_context=style,
            async_images=False,  # Auto-apply images for API
            files=context_files if context_files else []
        )

        outline_result = await generator.generate(options)

        if not outline_result or not outline_result.slides:
            raise Exception("Failed to generate outline")

        # Convert OutlineResult to DeckOutline model
        from models.requests import DeckOutline, SlideOutline
        import uuid as uuid_module
        deck_outline = DeckOutline(
            id=deck_uuid,
            title=outline_result.title or topic[:100],
            slides=[
                SlideOutline(
                    id=str(uuid_module.uuid4()),
                    title=slide.title,
                    content=slide.content or ""
                )
                for slide in outline_result.slides
            ]
        )

        # Build stylePreferences from brand_settings and context_images
        # This ensures logo, colors, fonts, and reference images flow through to slide generation
        from models.requests import StylePreferencesItem, ColorConfigItem

        style_prefs_data = {
            "initialIdea": topic,
            "vibeContext": style or topic,
        }

        # Add context images as reference images for slide generation to use
        if api_key_record.context_images:
            # Filter out any base64/data URLs - only keep actual URLs
            reference_urls = [
                url for url in api_key_record.context_images
                if url and not url.startswith("data:") and len(url) < 2048
            ]
            if reference_urls:
                style_prefs_data["referenceImages"] = reference_urls
                logger.info(f"Added {len(reference_urls)} reference images to stylePreferences")

        # Inject brand settings if available
        if api_key_record.brand_settings:
            brand = api_key_record.brand_settings

            # Handle new format (colors, fonts, logo) vs legacy (primary_color, etc.)
            if "colors" in brand:
                # New format from ThemeChatBlock
                colors = brand.get("colors", {})
                fonts = brand.get("fonts", {})
                bg_color = colors.get("background", "#FFFFFF")
                text_color = colors.get("text", "#1a1a1a")
                accent_color = colors.get("accent", "#6366f1")
                heading_font = fonts.get("heading", "Montserrat")
                body_font = fonts.get("body", "Inter")
                logo_url = brand.get("logo")
            else:
                # Legacy format
                bg_color = brand.get("primary_color", "#FFFFFF")
                text_color = "#1A1A1A"
                accent_color = brand.get("secondary_color", "#2563EB")
                heading_font = brand.get("font_family", "Montserrat")
                body_font = brand.get("font_family", "Poppins")
                logo_url = brand.get("logo_url")

            # Add to stylePreferences (this is how normal generation flow works)
            style_prefs_data["font"] = heading_font
            style_prefs_data["bodyFont"] = body_font
            style_prefs_data["colors"] = ColorConfigItem(
                type="custom",
                background=bg_color,
                text=text_color,
                accent1=accent_color
            )
            # Logo URL - must be an actual URL, not base64
            if logo_url and not logo_url.startswith("data:"):
                style_prefs_data["logoUrl"] = logo_url

            # Also build theme dict for ThemeResolver (notes.theme path)
            theme_dict = {
                "theme_name": "Brand Theme",
                "design_philosophy": "Brand-focused design",
                "color_palette": {
                    "source": "brand",
                    "primary_background": bg_color,
                    "primary_text": text_color,
                    "accent_1": accent_color,
                    "colors": [bg_color, text_color, accent_color]
                },
                "typography": {
                    "hero_title": {"family": heading_font, "weight": 700},
                    "body_text": {"family": body_font, "weight": 400}
                },
                "layout_style": "modern",
                "visual_effects": {},
                "image_treatment": {},
                "brandInfo": {
                    "logo_url": logo_url if logo_url and not logo_url.startswith("data:") else None,
                    "primary_color": bg_color,
                    "accent_color": accent_color,
                    "text_color": text_color,
                    "heading_font": heading_font,
                    "body_font": body_font
                },
                # Include reference images in theme for additional context
                "reference_images": style_prefs_data.get("referenceImages", [])
            }
            deck_outline.notes = {"theme": theme_dict}
            logger.info(f"Injected brand theme with logo: {bool(logo_url)}")

        # Set stylePreferences on deck_outline - this flows through to slide generation
        deck_outline.stylePreferences = StylePreferencesItem(**style_prefs_data)
        logger.info(f"Set stylePreferences: font={style_prefs_data.get('font')}, referenceImages={len(style_prefs_data.get('referenceImages', []))}")

        # Get registry
        registry = get_global_registry()

        # Build initial deck payload
        from api.requests.deck_create import build_initial_deck_payload
        deck_data = build_initial_deck_payload(deck_outline, deck_uuid)

        # Add API source metadata
        deck_data["data"] = deck_data.get("data", {})
        deck_data["data"]["source"] = "api"
        deck_data["data"]["api_key_id"] = api_key_record.id
        deck_data["data"]["api_key_name"] = api_key_record.name

        # Upload initial deck
        upload_deck(deck_data, deck_uuid, user_id)

        # Run composition
        from agents.generation.deck_composer import compose_deck_stream
        from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES

        slides_generated = 0
        async for update in compose_deck_stream(
            deck_outline, registry, deck_uuid,
            max_parallel=MAX_PARALLEL_SLIDES,
            delay_between_slides=DELAY_BETWEEN_SLIDES,
            async_images=False,  # Auto-apply images for API
            user_id=user_id
        ):
            utype = update.get('type', '')
            if utype == 'slide_generated':
                slides_generated += 1
            elif utype in ('deck_complete', 'composition_complete', 'complete'):
                break

        # Update deck status and restore API metadata
        client = get_supabase_client()

        # Get current deck to preserve existing data
        final_deck = get_deck(deck_uuid)
        existing_data = final_deck.get("data", {}) if final_deck else {}

        # Merge API metadata into existing data
        updated_data = {
            **existing_data,
            "source": "api",
            "api_key_id": api_key_record.id,
            "api_key_name": api_key_record.name
        }

        client.table("decks").update({
            "status": {"state": "completed"},
            "data": updated_data
        }).eq("uuid", deck_uuid).execute()

        # Refresh deck data
        final_deck = get_deck(deck_uuid)
        final_slides_count = len(final_deck.get("slides", [])) if final_deck else slides_generated

        logger.info(f"Deck {deck_uuid} generation completed with {final_slides_count} slides")

        # Send webhook if configured
        if api_key_record.webhook_url:
            await webhook_service.send_deck_completed(
                webhook_url=api_key_record.webhook_url,
                deck_id=deck_uuid,
                view_url=view_url,
                slides_count=final_slides_count,
                edit_url=edit_url,
                metadata=metadata
            )

    except Exception as e:
        logger.error(f"Deck generation failed for {deck_uuid}: {e}", exc_info=True)

        # Update deck status to failed
        try:
            client = get_supabase_client()
            client.table("decks").update({
                "status": {"state": "failed", "error": str(e)}
            }).eq("uuid", deck_uuid).execute()
        except Exception:
            pass

        # Send failure webhook if configured
        if api_key_record.webhook_url:
            await webhook_service.send_deck_failed(
                webhook_url=api_key_record.webhook_url,
                deck_id=deck_uuid,
                error_message=str(e),
                metadata=metadata
            )


# =============================================================================
# Endpoints
# =============================================================================

@router.post("/decks", response_model=CreateDeckResponse)
async def create_deck(
    request: CreateDeckRequest,
    background_tasks: BackgroundTasks,
    auth: Tuple[str, ApiKeyRecord] = Depends(get_api_key_auth)
):
    """
    Create a new presentation.

    This endpoint returns immediately with view/edit URLs.
    Generation happens in the background.

    If a webhook URL is configured for your API key,
    you'll receive a callback when generation completes.

    Otherwise, poll the status endpoint.
    """
    user_id, api_key_record = auth
    deck_uuid = str(uuid.uuid4())

    # Check credits
    billing = get_billing_service()
    try:
        balance = await billing.get_user_balance(user_id)
        credit_cost = billing.get_credit_cost(CreditAction.SLIDE_GENERATION) * request.slides

        if balance and balance.remaining_credits < credit_cost:
            raise HTTPException(
                status_code=402,
                detail=f"Insufficient credits. Need {credit_cost}, have {balance.remaining_credits}"
            )

        # Consume credits
        await billing.consume_credits(
            user_id,
            CreditAction.SLIDE_GENERATION,
            metadata={
                "deck_id": deck_uuid,
                "num_slides": request.slides,
                "source": "api",
                "api_key_id": api_key_record.id
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Credit check failed, proceeding anyway: {e}")

    # Create initial deck record FIRST (needed for share link foreign key)
    try:
        initial_deck = {
            "name": request.topic[:100],
            "slides": [],
            "size": {"width": 1920, "height": 1080},
            "status": {"state": "generating"},
            "data": {
                "source": "api",
                "api_key_id": api_key_record.id,
                "api_key_name": api_key_record.name
            }
        }
        upload_deck(initial_deck, deck_uuid, user_id)
    except Exception as e:
        logger.error(f"Failed to create initial deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to create deck")

    # Create share links after deck exists
    sharing_service = get_sharing_service()

    try:
        # Create view link
        view_share = sharing_service.create_share_link(
            deck_uuid=deck_uuid,
            user_id=user_id,
            share_type='view',
            metadata={"source": "api", "api_key_id": api_key_record.id}
        )
        view_url = f"https://nextslide.ai/p/{view_share['short_code']}"

        # Create edit link if enabled
        edit_url = None
        if api_key_record.include_edit_link:
            edit_share = sharing_service.create_share_link(
                deck_uuid=deck_uuid,
                user_id=user_id,
                share_type='edit',
                metadata={"source": "api", "api_key_id": api_key_record.id}
            )
            edit_url = f"https://nextslide.ai/e/{edit_share['short_code']}"

    except Exception as e:
        logger.error(f"Failed to create share links: {e}")
        # Fallback to direct URLs
        view_url = f"https://nextslide.ai/deck/{deck_uuid}"
        edit_url = f"https://nextslide.ai/deck/{deck_uuid}" if api_key_record.include_edit_link else None

    # Start generation in background
    background_tasks.add_task(
        generate_deck_background,
        deck_uuid=deck_uuid,
        user_id=user_id,
        api_key_record=api_key_record,
        topic=request.topic,
        num_slides=request.slides,
        style=request.style,
        additional_instructions=request.additional_instructions,
        view_url=view_url,
        edit_url=edit_url,
        metadata=request.metadata
    )

    # Send creation webhook if configured
    if api_key_record.webhook_url:
        webhook_service = get_webhook_service()
        asyncio.create_task(
            webhook_service.send_deck_created(
                webhook_url=api_key_record.webhook_url,
                deck_id=deck_uuid,
                view_url=view_url,
                edit_url=edit_url,
                metadata=request.metadata
            )
        )

    return CreateDeckResponse(
        deck_id=deck_uuid,
        status="generating",
        view_url=view_url,
        edit_url=edit_url,
        poll_url=f"/api/v1/decks/{deck_uuid}/status",
        estimated_seconds=120,  # ~2 minutes
        message="Deck creation started. Poll the status endpoint or wait for webhook."
    )


@router.get("/decks/{deck_id}/status", response_model=DeckStatusResponse)
async def get_deck_status(
    deck_id: str,
    auth: Tuple[str, ApiKeyRecord] = Depends(get_api_key_auth)
):
    """
    Get the current status of a deck.

    Use this to poll for completion if you don't have webhooks configured.
    """
    user_id, _ = auth

    try:
        deck = get_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")

        # Verify ownership
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        status_obj = deck.get("status", {})
        if isinstance(status_obj, dict):
            status_state = status_obj.get("state", "unknown")
        elif isinstance(status_obj, str):
            status_state = status_obj
        else:
            status_state = "unknown"

        # Get share URLs
        sharing_service = get_sharing_service()
        shares = sharing_service.get_user_share_links(user_id, deck_id)

        view_url = None
        edit_url = None
        for share in shares:
            if share.get("share_type") == "view":
                view_url = f"https://nextslide.ai/p/{share['short_code']}"
            elif share.get("share_type") == "edit":
                edit_url = f"https://nextslide.ai/e/{share['short_code']}"

        return DeckStatusResponse(
            deck_id=deck_id,
            status=status_state,
            view_url=view_url,
            edit_url=edit_url,
            slides_count=len(deck.get("slides", [])),
            created_at=deck.get("created_at", ""),
            completed_at=deck.get("last_modified") if status_state == "completed" else None,
            error_message=status_obj.get("error") if status_state == "failed" else None
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting deck status: {e}")
        raise HTTPException(status_code=500, detail="Failed to get deck status")


@router.get("/decks/{deck_id}", response_model=Dict[str, Any])
async def get_deck_full(
    deck_id: str,
    auth: Tuple[str, ApiKeyRecord] = Depends(get_api_key_auth)
):
    """
    Get the full deck data including all slides.

    Returns the complete deck JSON structure.
    """
    user_id, _ = auth

    try:
        deck = get_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")

        # Verify ownership
        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        return deck

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to get deck")


@router.get("/decks", response_model=DeckListResponse)
async def list_decks(
    offset: int = 0,
    limit: int = 20,
    auth: Tuple[str, ApiKeyRecord] = Depends(get_api_key_auth)
):
    """
    List all decks created via API.

    Only returns decks created with API keys (source='api').
    """
    user_id, _ = auth

    try:
        client = get_supabase_client()

        # Query decks with API source
        result = client.table("decks") \
            .select("uuid, name, slides, status, created_at, last_modified, data") \
            .eq("user_id", user_id) \
            .order("created_at", desc=True) \
            .range(offset, offset + limit - 1) \
            .execute()

        # Filter to API-created decks
        api_decks = []
        for deck in (result.data or []):
            data = deck.get("data", {})
            if isinstance(data, dict) and data.get("source") == "api":
                status_obj = deck.get("status", {})
                if isinstance(status_obj, dict):
                    status_state = status_obj.get("state", "unknown")
                elif isinstance(status_obj, str):
                    status_state = status_obj
                else:
                    status_state = "unknown"

                api_decks.append(DeckStatusResponse(
                    deck_id=deck["uuid"],
                    status=status_state,
                    slides_count=len(deck.get("slides", [])),
                    created_at=deck.get("created_at", ""),
                    completed_at=deck.get("last_modified") if status_state == "completed" else None
                ))

        # Get total count
        count_result = client.table("decks") \
            .select("uuid", count="exact") \
            .eq("user_id", user_id) \
            .execute()

        return DeckListResponse(
            decks=api_decks,
            total=len(api_decks),  # Approximate since we filter client-side
            offset=offset,
            limit=limit
        )

    except Exception as e:
        logger.error(f"Error listing decks: {e}")
        raise HTTPException(status_code=500, detail="Failed to list decks")


@router.delete("/decks/{deck_id}")
async def delete_deck(
    deck_id: str,
    auth: Tuple[str, ApiKeyRecord] = Depends(get_api_key_auth)
):
    """
    Delete a deck.

    This permanently removes the deck and all associated data.
    """
    user_id, _ = auth

    try:
        # Verify ownership
        deck = get_deck(deck_id)
        if not deck:
            raise HTTPException(status_code=404, detail="Deck not found")

        if deck.get("user_id") != user_id:
            raise HTTPException(status_code=403, detail="Access denied")

        # Delete deck
        client = get_supabase_client()
        client.table("decks").delete().eq("uuid", deck_id).execute()

        return {"success": True, "message": "Deck deleted"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error deleting deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete deck")
