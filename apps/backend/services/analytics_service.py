"""
PostHog Analytics Service for NextSlide Backend

Centralized analytics tracking for server-side events.
Handles user identification and event tracking with PostHog.
"""

import os
import logging
from typing import Optional, Dict, Any

logger = logging.getLogger(__name__)

# PostHog client - initialized lazily
_posthog_client = None
_is_initialized = False

def _get_posthog():
    """Lazy initialization of PostHog client"""
    global _posthog_client, _is_initialized

    if _is_initialized:
        return _posthog_client

    _is_initialized = True

    api_key = os.getenv("POSTHOG_API_KEY", "").strip()
    if not api_key:
        logger.warning("[Analytics] POSTHOG_API_KEY not configured - analytics disabled")
        return None

    try:
        from posthog import Posthog
        client = Posthog(
            project_api_key=api_key,
            host=os.getenv("POSTHOG_HOST", "https://us.i.posthog.com"),
            debug=os.getenv("POSTHOG_DEBUG", "").lower() == "true",
        )
        _posthog_client = client
        logger.info("[Analytics] PostHog initialized successfully")
        return client
    except ImportError:
        logger.warning("[Analytics] posthog package not installed - analytics disabled")
        return None
    except Exception as e:
        logger.error(f"[Analytics] Failed to initialize PostHog: {e}")
        return None


def track_event(
    user_id: Optional[str],
    event_name: str,
    properties: Optional[Dict[str, Any]] = None
) -> None:
    """
    Track an analytics event.

    Args:
        user_id: The distinct user ID (or 'anon' for anonymous users)
        event_name: Name of the event to track
        properties: Optional dictionary of event properties
    """
    posthog = _get_posthog()
    if not posthog:
        return

    try:
        distinct_id = user_id or "anon"
        posthog.capture(
            distinct_id=distinct_id,
            event=event_name,
            properties=properties or {}
        )
    except Exception as e:
        logger.error(f"[Analytics] Failed to track event {event_name}: {e}")


def identify_user(
    user_id: str,
    properties: Optional[Dict[str, Any]] = None
) -> None:
    """
    Identify a user with their properties.

    Args:
        user_id: The distinct user ID
        properties: User properties like email, name, plan, etc.
    """
    posthog = _get_posthog()
    if not posthog:
        return

    try:
        posthog.identify(
            distinct_id=user_id,
            properties=properties or {}
        )
    except Exception as e:
        logger.error(f"[Analytics] Failed to identify user {user_id}: {e}")


# ============================================================================
# Typed Event Tracking Functions
# ============================================================================

def track_outline_generation_started(
    user_id: Optional[str],
    detail_level: str,
    slide_count: Optional[int] = None,
    has_attachments: bool = False,
    has_url: bool = False,
    model: Optional[str] = None
) -> None:
    """Track when outline generation begins"""
    track_event(user_id, "outline_generation_started", {
        "detail_level": detail_level,
        "slide_count": slide_count,
        "has_attachments": has_attachments,
        "has_url": has_url,
        "model": model,
    })


def track_outline_generation_completed(
    user_id: Optional[str],
    detail_level: str,
    slide_count: int,
    duration_ms: int,
    model: Optional[str] = None
) -> None:
    """Track when outline generation completes successfully"""
    track_event(user_id, "outline_generation_completed", {
        "detail_level": detail_level,
        "slide_count": slide_count,
        "duration_ms": duration_ms,
        "model": model,
    })


def track_outline_generation_failed(
    user_id: Optional[str],
    error: str,
    detail_level: Optional[str] = None
) -> None:
    """Track when outline generation fails"""
    track_event(user_id, "outline_generation_failed", {
        "error": error,
        "detail_level": detail_level,
    })


def track_deck_composition_started(
    user_id: Optional[str],
    deck_id: str,
    slide_count: int,
    is_partial: bool = False
) -> None:
    """Track when deck composition (slide generation) begins"""
    track_event(user_id, "deck_composition_started", {
        "deck_id": deck_id,
        "slide_count": slide_count,
        "is_partial": is_partial,
    })


def track_deck_composition_completed(
    user_id: Optional[str],
    deck_id: str,
    slide_count: int,
    duration_ms: int,
    credits_consumed: Optional[int] = None,
    is_partial: bool = False
) -> None:
    """Track when deck composition completes successfully"""
    track_event(user_id, "deck_composition_completed", {
        "deck_id": deck_id,
        "slide_count": slide_count,
        "duration_ms": duration_ms,
        "credits_consumed": credits_consumed,
        "is_partial": is_partial,
    })


def track_deck_composition_failed(
    user_id: Optional[str],
    deck_id: str,
    error: str,
    slide_count: Optional[int] = None
) -> None:
    """Track when deck composition fails"""
    track_event(user_id, "deck_composition_failed", {
        "deck_id": deck_id,
        "error": error,
        "slide_count": slide_count,
    })


def track_credits_consumed(
    user_id: str,
    action: str,
    credits_used: int,
    credits_remaining: int,
    metadata: Optional[Dict[str, Any]] = None
) -> None:
    """Track when credits are consumed"""
    track_event(user_id, "credits_consumed", {
        "action": action,
        "credits_used": credits_used,
        "credits_remaining": credits_remaining,
        **(metadata or {}),
    })


def track_insufficient_credits(
    user_id: str,
    action: str,
    credits_required: int,
    credits_remaining: int,
    plan: str
) -> None:
    """Track when a user doesn't have enough credits"""
    track_event(user_id, "insufficient_credits", {
        "action": action,
        "credits_required": credits_required,
        "credits_remaining": credits_remaining,
        "plan": plan,
    })


def track_media_search(
    user_id: Optional[str],
    query: str,
    source: str,
    result_count: int
) -> None:
    """Track media search events"""
    track_event(user_id, "media_searched", {
        "query": query,
        "source": source,
        "result_count": result_count,
    })


def track_ai_chat_message(
    user_id: Optional[str],
    deck_id: Optional[str] = None,
    message_type: str = "user"
) -> None:
    """Track AI chat interactions"""
    track_event(user_id, "ai_chat_message", {
        "deck_id": deck_id,
        "message_type": message_type,
    })


def track_api_error(
    user_id: Optional[str],
    endpoint: str,
    error: str,
    status_code: int
) -> None:
    """Track API errors for monitoring"""
    track_event(user_id, "api_error", {
        "endpoint": endpoint,
        "error": error,
        "status_code": status_code,
    })


def track_image_generated(
    user_id: Optional[str],
    model: str,
    mode: str,
    duration_ms: int,
    aspect_ratio: Optional[str] = None,
    deck_id: Optional[str] = None,
) -> None:
    """Track when an AI image is generated successfully"""
    track_event(user_id, "image_generated", {
        "model": model,
        "mode": mode,
        "duration_ms": duration_ms,
        "aspect_ratio": aspect_ratio,
        "deck_id": deck_id,
    })


def track_image_generation_failed(
    user_id: Optional[str],
    model: str,
    mode: str,
    error: str,
    deck_id: Optional[str] = None,
) -> None:
    """Track when AI image generation fails"""
    track_event(user_id, "image_generation_failed", {
        "model": model,
        "mode": mode,
        "error": error,
        "deck_id": deck_id,
    })


def track_image_pipeline_completed(
    user_id: Optional[str],
    deck_id: Optional[str],
    ai_generated: int,
    ai_failed: int,
    searched: int,
    total_images: int,
    duration_ms: int,
) -> None:
    """Track image pipeline summary for a slide"""
    track_event(user_id, "image_pipeline_completed", {
        "deck_id": deck_id,
        "ai_generated": ai_generated,
        "ai_failed": ai_failed,
        "searched": searched,
        "total_images": total_images,
        "duration_ms": duration_ms,
    })


def shutdown() -> None:
    """Flush and shutdown PostHog client"""
    posthog = _get_posthog()
    if posthog:
        try:
            posthog.shutdown()
            logger.info("[Analytics] PostHog shutdown complete")
        except Exception as e:
            logger.error(f"[Analytics] Error during PostHog shutdown: {e}")
