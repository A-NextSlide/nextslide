"""
Fast message classifier using Gemini context caching.

Routes messages to appropriate handlers:
- chat: Conversational messages (greetings, questions, feedback)
- simple_edit: Single, obvious operations
- complex_edit: Multi-step, creative, or ambiguous requests

The classifier itself uses a cached system prompt for <200ms response times.
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from datetime import datetime, timezone
import hashlib

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFICATION MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class MessageClassification(BaseModel):
    """Classification result from the classifier agent."""

    type: str = Field(
        description="Message type: 'chat', 'simple_edit', or 'complex_edit'"
    )
    needs_deck: bool = Field(
        default=True,
        description="Whether this request needs current deck/slide data"
    )
    needs_screenshot: bool = Field(
        default=False,
        description="Whether this request needs visual inspection of the slide"
    )
    needs_history: bool = Field(
        default=False,
        description="Whether this request needs conversation history for context"
    )
    confidence: float = Field(
        default=0.9,
        description="Confidence in classification (0-1)"
    )
    reasoning: str = Field(
        default="",
        description="Brief explanation of classification decision"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFIER SYSTEM PROMPT (cached)
# ═══════════════════════════════════════════════════════════════════════════════

CLASSIFIER_SYSTEM_PROMPT = """You are a fast message router for a presentation editor assistant.

Your job is to classify user messages into categories so we can route them efficiently.

CATEGORIES:

1. "chat" - Conversational messages that don't require deck changes:
   - Greetings: "hey", "hi", "hello", "good morning"
   - Thanks/feedback: "thanks!", "perfect", "looks good", "nice"
   - Questions seeking advice: "what do you think?", "how should I...", "should I...", "any suggestions?"
   - Clarifications: "what did you mean?", "can you explain?"
   - General chat: "tell me about...", "I'm not sure..."
   - Acknowledgments: "ok", "got it", "I see"

2. "simple_edit" - Clear, single operations:
   - Text changes: "change the title to X", "fix the typo", "update the text"
   - Color changes: "make it red", "change the background to blue"
   - Single deletions: "delete this slide", "remove the image"
   - Single additions: "add a new slide", "duplicate this"
   - Direct commands: "make the font bigger", "center the text"

3. "complex_edit" - Multi-step, creative, or ambiguous:
   - Redesigns: "redesign this slide", "make it look better", "improve the layout"
   - Creative requests: "create a slide about X", "make this more professional"
   - Research needed: "add latest stats about X", "update with current data"
   - Multiple changes: "fix the images and update the text"
   - Vague requests: "fix this", "something's wrong", "make it pop"
   - Visual analysis needed: "why does this look weird?", "the alignment is off"

CONTEXT REQUIREMENTS:

- needs_deck: Does this need current slide/component data? (false for pure chat)
- needs_screenshot: Does this need to SEE the slide? (visual issues, layout, design feedback)
- needs_history: Does this need prior messages? (references like "make it bigger", "do that again", "the previous one")

RESPOND WITH JSON:
{
  "type": "chat|simple_edit|complex_edit",
  "needs_deck": true/false,
  "needs_screenshot": true/false,
  "needs_history": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation"
}

EXAMPLES:

"hey" → {"type": "chat", "needs_deck": false, "needs_screenshot": false, "needs_history": false, "confidence": 1.0, "reasoning": "greeting"}

"make the title red" → {"type": "simple_edit", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "confidence": 0.95, "reasoning": "single color change"}

"make it bigger" → {"type": "simple_edit", "needs_deck": true, "needs_screenshot": false, "needs_history": true, "confidence": 0.9, "reasoning": "needs history to know what 'it' refers to"}

"how should I present this slide?" → {"type": "chat", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "confidence": 0.95, "reasoning": "advice question, needs to see slide"}

"redesign this with our brand colors" → {"type": "complex_edit", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "confidence": 0.95, "reasoning": "full redesign requires visual context"}

"something looks off" → {"type": "complex_edit", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "confidence": 0.9, "reasoning": "vague visual issue needs screenshot"}

BE FAST. Default to the simpler category when uncertain."""


# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI CONTEXT CACHE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

_classifier_cache = None
_classifier_cache_name = None
_cache_created_at = None

# Cache TTL in seconds (24 hours - prompt doesn't change)
CLASSIFIER_CACHE_TTL = 86400


def _get_cache_key() -> str:
    """Generate a cache key based on the system prompt content."""
    return hashlib.md5(CLASSIFIER_SYSTEM_PROMPT.encode()).hexdigest()[:12]


def get_or_create_classifier_cache() -> Optional[str]:
    """
    Get or create a Gemini context cache for the classifier.

    Returns the cache name if successful, None otherwise.
    The cache contains the system prompt, enabling fast classification.
    """
    global _classifier_cache, _classifier_cache_name, _cache_created_at

    # Return existing cache if valid
    if _classifier_cache_name:
        # Check if cache is still valid (within TTL)
        if _cache_created_at:
            age = (datetime.now(timezone.utc) - _cache_created_at).total_seconds()
            if age < CLASSIFIER_CACHE_TTL - 300:  # 5 min buffer
                return _classifier_cache_name

    try:
        from google.genai import Client as Gemini
        from google.genai import types as genai_types

        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("[Classifier] No Gemini API key found, caching disabled")
            return None

        client = Gemini(api_key=api_key)
        cache_key = _get_cache_key()
        display_name = f"nextslide_classifier_{cache_key}"

        # Check for existing cache with same name
        try:
            for existing_cache in client.caches.list():
                if existing_cache.display_name == display_name:
                    _classifier_cache_name = existing_cache.name
                    _cache_created_at = datetime.now(timezone.utc)
                    logger.info(f"[Classifier] Reusing existing cache: {_classifier_cache_name}")
                    return _classifier_cache_name
        except Exception as e:
            logger.debug(f"[Classifier] Error listing caches: {e}")

        # Create new cache
        cache = client.caches.create(
            model="models/gemini-2.0-flash",  # Fast model for classification
            config=genai_types.CreateCachedContentConfig(
                display_name=display_name,
                system_instruction=CLASSIFIER_SYSTEM_PROMPT,
                ttl=f"{CLASSIFIER_CACHE_TTL}s",
            )
        )

        _classifier_cache = cache
        _classifier_cache_name = cache.name
        _cache_created_at = datetime.now(timezone.utc)

        logger.info(f"[Classifier] Created new cache: {_classifier_cache_name}")
        return _classifier_cache_name

    except Exception as e:
        logger.error(f"[Classifier] Failed to create cache: {e}")
        return None


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFIER AGENT
# ═══════════════════════════════════════════════════════════════════════════════

async def classify_message(
    message: str,
    recent_messages: Optional[List[str]] = None,
) -> MessageClassification:
    """
    Classify a user message using a fast LLM call with cached context.

    This is the first step in the two-stage architecture:
    1. Classify (fast, <200ms) → determines what context is needed
    2. Process (with appropriate context) → handles the actual request

    Args:
        message: The user's message to classify
        recent_messages: Optional list of recent message texts for context

    Returns:
        MessageClassification with type, context needs, and confidence
    """
    import asyncio

    # Build the classification prompt
    prompt_parts = []

    if recent_messages and len(recent_messages) > 0:
        # Include last 2 messages for context (e.g., "make it bigger")
        history = recent_messages[-2:] if len(recent_messages) > 2 else recent_messages
        prompt_parts.append("Recent conversation:")
        for msg in history:
            prompt_parts.append(f"- {msg[:100]}")  # Truncate long messages
        prompt_parts.append("")

    prompt_parts.append(f"Classify this message: \"{message}\"")
    prompt = "\n".join(prompt_parts)

    # Try cached Gemini call first
    try:
        result = await _classify_with_gemini_cache(prompt)
        if result:
            return result
    except Exception as e:
        logger.warning(f"[Classifier] Gemini cache call failed: {e}")

    # Fallback to direct call (no cache)
    try:
        result = await _classify_direct(prompt)
        if result:
            return result
    except Exception as e:
        logger.warning(f"[Classifier] Direct call failed: {e}")

    # Last resort: rule-based fallback
    return _classify_fallback(message)


async def _classify_with_gemini_cache(prompt: str) -> Optional[MessageClassification]:
    """Classify using Gemini with cached system prompt."""
    import asyncio

    cache_name = get_or_create_classifier_cache()
    if not cache_name:
        return None

    try:
        from google.genai import Client as Gemini
        from google.genai import types as genai_types

        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        client = Gemini(api_key=api_key)

        # Run in thread pool since genai is sync
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(
                model="models/gemini-2.0-flash",
                contents=prompt,
                config=genai_types.GenerateContentConfig(
                    cached_content=cache_name,
                    response_mime_type="application/json",
                    temperature=0.1,  # Low temp for consistent classification
                    max_output_tokens=256,
                )
            )
        )

        text = response.text.strip()

        # Log cache usage
        if hasattr(response, 'usage_metadata'):
            cached_tokens = getattr(response.usage_metadata, 'cached_content_token_count', 0)
            if cached_tokens > 0:
                logger.debug(f"[Classifier] Used {cached_tokens} cached tokens")

        return _parse_classification(text)

    except Exception as e:
        logger.error(f"[Classifier] Gemini cache error: {e}")
        return None


async def _classify_direct(prompt: str) -> Optional[MessageClassification]:
    """Classify using direct LLM call (no cache) - fallback."""
    import asyncio

    try:
        from agents.ai.clients import get_client, invoke
        from agents.config import MODEL_EASY  # Haiku for speed

        client, model = get_client(MODEL_EASY)

        messages = [
            {"role": "system", "content": CLASSIFIER_SYSTEM_PROMPT},
            {"role": "user", "content": prompt}
        ]

        # Run in thread pool
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: invoke(
                client=client,
                model=model,
                messages=messages,
                max_tokens=256,
                temperature=0.1,
            )
        )

        return _parse_classification(response)

    except Exception as e:
        logger.error(f"[Classifier] Direct call error: {e}")
        return None


def _parse_classification(text: str) -> Optional[MessageClassification]:
    """Parse JSON response into MessageClassification."""
    try:
        # Clean up response
        text = text.strip()
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
        text = text.strip()

        data = json.loads(text)

        # Validate type
        msg_type = data.get("type", "complex_edit")
        if msg_type not in ["chat", "simple_edit", "complex_edit"]:
            msg_type = "complex_edit"

        return MessageClassification(
            type=msg_type,
            needs_deck=data.get("needs_deck", True),
            needs_screenshot=data.get("needs_screenshot", False),
            needs_history=data.get("needs_history", False),
            confidence=data.get("confidence", 0.8),
            reasoning=data.get("reasoning", ""),
        )

    except Exception as e:
        logger.warning(f"[Classifier] Parse error: {e}, text: {text[:100]}")
        return None


def _classify_fallback(message: str) -> MessageClassification:
    """
    Rule-based fallback classification when LLM is unavailable.

    This is NOT the primary path - it's a safety net.
    The LLM classifier is preferred for accuracy.
    """
    msg_lower = message.lower().strip()

    # Very short messages are usually chat
    if len(msg_lower) < 10:
        if msg_lower in ["hey", "hi", "hello", "thanks", "ok", "yes", "no", "sure", "cool"]:
            return MessageClassification(
                type="chat",
                needs_deck=False,
                needs_screenshot=False,
                needs_history=False,
                confidence=0.7,
                reasoning="fallback: short greeting/acknowledgment"
            )

    # Questions are usually chat
    if msg_lower.startswith(("how ", "what ", "why ", "should ", "can you ", "could you ")):
        if "change" not in msg_lower and "make" not in msg_lower and "edit" not in msg_lower:
            return MessageClassification(
                type="chat",
                needs_deck=True,
                needs_screenshot=True,  # Questions often need visual context
                needs_history=True,
                confidence=0.6,
                reasoning="fallback: question without edit keywords"
            )

    # Default to complex_edit (safest - loads all context)
    return MessageClassification(
        type="complex_edit",
        needs_deck=True,
        needs_screenshot=True,
        needs_history=True,
        confidence=0.5,
        reasoning="fallback: defaulting to complex_edit"
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CACHE WARMUP
# ═══════════════════════════════════════════════════════════════════════════════

def warmup_classifier_cache():
    """
    Pre-create the classifier cache on startup.
    Call this during server initialization for faster first requests.
    """
    try:
        cache_name = get_or_create_classifier_cache()
        if cache_name:
            logger.info(f"[Classifier] Cache warmed up: {cache_name}")
        else:
            logger.warning("[Classifier] Cache warmup failed")
    except Exception as e:
        logger.error(f"[Classifier] Cache warmup error: {e}")
