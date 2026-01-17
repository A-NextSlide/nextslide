"""
Fast-path message handling with agent-driven classification.

Two-stage architecture:
1. Classify (fast, <200ms) → determines routing and context needs
2. Process (with appropriate context) → handles the actual request

Routing:
- chat → Haiku, minimal context, skip orchestrator
- simple_edit → Flash, deck context only, orchestrator with cache
- complex_edit → Pro, full context with screenshot, full orchestrator
"""

import asyncio
import logging
from typing import Dict, Any, List, Optional, Tuple
from datetime import datetime, timezone

from agents.editing.classifier import classify_message, MessageClassification
from agents.config import MODEL_EASY, GEMINI_3_FLASH, GEMINI_3_PRO

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# CHAT HANDLER (skip orchestrator entirely)
# ═══════════════════════════════════════════════════════════════════════════════

CHAT_SYSTEM_PROMPT = """You are a friendly assistant helping users create presentations.

IMPORTANT RULES:
- Be conversational and helpful
- NEVER use emojis
- Keep responses concise (1-3 sentences)
- If asked about slide content or design, offer specific suggestions
- If the user seems to want an edit, tell them to describe what change they'd like

You're here to chat, answer questions, and offer guidance - not to make edits directly.
When the user describes what they want changed, the editing system will handle it."""


async def handle_chat_message(
    message: str,
    deck_context: Optional[Dict[str, Any]] = None,
    chat_history: Optional[List[Dict]] = None,
) -> Dict[str, Any]:
    """
    Handle a chat-only message using Haiku (fast, cheap).

    No orchestrator, no deck edits - just conversational response.

    Returns:
        {"message": str, "deck_diff": None}
    """
    from agents.ai.clients import get_client, invoke

    try:
        client, model = get_client(MODEL_EASY)

        messages = [{"role": "system", "content": CHAT_SYSTEM_PROMPT}]

        # Add minimal context if we have it
        if deck_context:
            slide_title = deck_context.get("current_slide_title", "")
            deck_name = deck_context.get("deck_name", "")
            if slide_title or deck_name:
                context_msg = f"Context: The user is working on"
                if deck_name:
                    context_msg += f" '{deck_name}'"
                if slide_title:
                    context_msg += f", currently viewing a slide titled '{slide_title}'"
                messages.append({"role": "system", "content": context_msg})

        # Add recent chat history (last 3 messages)
        if chat_history:
            for msg in chat_history[-3:]:
                role = "user" if msg.get("role") == "user" else "assistant"
                content = msg.get("content") or msg.get("text") or ""
                if content:
                    messages.append({"role": role, "content": content[:500]})

        messages.append({"role": "user", "content": message})

        # Run in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: invoke(
                client=client,
                model=model,
                messages=messages,
                max_tokens=256,
                temperature=0.7,
            )
        )

        return {
            "message": response,
            "deck_diff": None,
            "edit_summary": None,
            "_classification": "chat",
            "_model": MODEL_EASY,
        }

    except Exception as e:
        logger.error(f"[FastPath] Chat handler error: {e}")
        return {
            "message": "I'm here to help! What would you like to do with your presentation?",
            "deck_diff": None,
            "edit_summary": None,
            "_classification": "chat",
            "_error": str(e),
        }


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT BUILDER (lazy loading based on classification)
# ═══════════════════════════════════════════════════════════════════════════════

def build_minimal_context(
    deck_data: Dict,
    current_slide: Optional[Dict],
) -> Dict[str, Any]:
    """Build minimal context for simple edits (no full HTML)."""
    context = {}

    if deck_data:
        context["deck_name"] = deck_data.get("name", "")
        context["slide_count"] = len(deck_data.get("slides") or [])

    if current_slide:
        context["current_slide_id"] = current_slide.get("id", "")
        context["current_slide_title"] = _extract_slide_title(current_slide)
        # Just component IDs and types, no full HTML
        components = current_slide.get("components") or []
        context["components"] = [
            {"id": c.get("id"), "type": c.get("type")}
            for c in components
        ]

    return context


def _extract_slide_title(slide: Dict) -> str:
    """Extract a title from slide components."""
    for comp in slide.get("components") or []:
        if comp.get("type") in ["TiptapTextBlock", "Text"]:
            props = comp.get("props") or {}
            text = props.get("text") or props.get("content") or ""
            if text and len(text) < 100:
                # Strip HTML tags
                import re
                clean = re.sub(r'<[^>]+>', '', text)
                if clean.strip():
                    return clean.strip()[:50]
    return ""


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN FAST-PATH ROUTER
# ═══════════════════════════════════════════════════════════════════════════════

async def classify_and_route(
    message: str,
    deck_data: Optional[Dict] = None,
    current_slide: Optional[Dict] = None,
    chat_history: Optional[List[Dict]] = None,
) -> Tuple[MessageClassification, Optional[Dict[str, Any]]]:
    """
    Classify the message and potentially handle it via fast path.

    Returns:
        (classification, result_if_handled)
        - If result_if_handled is not None, the message was fully handled
        - If result_if_handled is None, caller should proceed with orchestrator
    """
    # Extract recent message texts for classifier
    recent_texts = []
    if chat_history:
        for msg in chat_history[-3:]:
            text = msg.get("text") or msg.get("content") or ""
            if text:
                recent_texts.append(text[:200])

    # Classify the message
    start_time = datetime.now(timezone.utc)
    classification = await classify_message(message, recent_texts)
    classify_time = (datetime.now(timezone.utc) - start_time).total_seconds() * 1000

    logger.info(
        f"[FastPath] Classified in {classify_time:.0f}ms: type={classification.type}, "
        f"needs_deck={classification.needs_deck}, needs_screenshot={classification.needs_screenshot}, "
        f"confidence={classification.confidence:.2f}, reason={classification.reasoning}"
    )

    # Handle chat messages immediately (skip orchestrator)
    if classification.type == "chat":
        deck_context = None
        if classification.needs_deck and deck_data:
            deck_context = build_minimal_context(deck_data, current_slide)

        result = await handle_chat_message(
            message=message,
            deck_context=deck_context,
            chat_history=chat_history if classification.needs_history else None,
        )
        return classification, result

    # For edits, return classification so caller can proceed with orchestrator
    return classification, None


def get_model_for_classification(classification: MessageClassification) -> str:
    """
    Get the appropriate model based on classification.

    Returns model alias from config.
    """
    if classification.type == "chat":
        return MODEL_EASY  # Haiku
    elif classification.type == "simple_edit":
        return GEMINI_3_FLASH  # Fast
    else:  # complex_edit
        return GEMINI_3_PRO  # Pro


def should_include_screenshot(classification: MessageClassification) -> bool:
    """Determine if screenshot should be included based on classification."""
    return classification.needs_screenshot


def should_include_full_context(classification: MessageClassification) -> bool:
    """Determine if full deck context (HTML, etc) should be included."""
    return classification.type == "complex_edit"


# ═══════════════════════════════════════════════════════════════════════════════
# WARMUP
# ═══════════════════════════════════════════════════════════════════════════════

def warmup_fast_path():
    """Warmup caches on server startup."""
    from agents.editing.classifier import warmup_classifier_cache
    from agents.editing.orchestrator_cache import warmup_orchestrator_cache

    logger.info("[FastPath] Warming up caches...")
    warmup_classifier_cache()
    warmup_orchestrator_cache()
    logger.info("[FastPath] Cache warmup complete")
