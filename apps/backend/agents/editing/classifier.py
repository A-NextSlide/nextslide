"""
Fast message classifier using Gemini Flash.

Routes messages to appropriate handlers:
- chat: Conversational messages (greetings, questions, feedback)
- simple_edit: Single, obvious operations
- complex_edit: Multi-step, creative, or ambiguous requests

Note: Doesn't use Gemini context caching because the system prompt is only ~900 tokens,
below Gemini's 4096 token minimum. Direct Gemini Flash calls are fast enough (~300-500ms).
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field

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
- needs_screenshot: Does this need to SEE the slide? Set TRUE for:
  * Visual issues, layout, design feedback
  * Image replacement when user describes the image visually ("the older woman", "guy in blue")
  * ANY image-related edit ("replace the image", "change the photo", "fix the picture")
  * Multiple similar images where position matters ("3rd image", "first photo")
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

"replace the older woman's photo" → {"type": "simple_edit", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "confidence": 0.95, "reasoning": "visual image reference needs screenshot to identify which image"}

"replace all the images" → {"type": "complex_edit", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "confidence": 0.9, "reasoning": "multiple images need visual context"}

BE FAST. Default to the simpler category when uncertain."""


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFIER AGENT
# ═══════════════════════════════════════════════════════════════════════════════
# Note: Classifier doesn't use Gemini context caching because the system prompt
# is only ~900 tokens, below Gemini's 4096 token minimum for caching.
# Instead, we use direct Gemini Flash calls which are fast enough (~300-500ms).

async def classify_message(
    message: str,
    recent_messages: Optional[List[str]] = None,
) -> MessageClassification:
    """
    Classify a user message using a fast LLM call.

    This is the first step in the two-stage architecture:
    1. Classify (fast, <300ms) → determines what context is needed
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

    # Use fast Gemini Flash call (no caching - prompt too small for 4096 token minimum)
    try:
        result = await _classify_with_gemini_flash(prompt)
        if result:
            return result
    except Exception as e:
        logger.warning(f"[Classifier] Gemini Flash call failed: {e}")

    # Fallback to Haiku
    try:
        result = await _classify_direct(prompt)
        if result:
            return result
    except Exception as e:
        logger.warning(f"[Classifier] Haiku fallback failed: {e}")

    # Last resort: rule-based fallback
    return _classify_fallback(message)


async def _classify_with_gemini_flash(prompt: str) -> Optional[MessageClassification]:
    """Classify using Gemini Flash (fast, no caching needed for small prompt)."""
    import asyncio

    try:
        from google.genai import Client as Gemini
        from google.genai import types as genai_types

        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            return None

        client = Gemini(api_key=api_key)

        # Combine system prompt and user prompt for single call
        full_prompt = f"{CLASSIFIER_SYSTEM_PROMPT}\n\n{prompt}"

        # Run in thread pool since genai is sync
        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            lambda: client.models.generate_content(
                model="models/gemini-2.0-flash",  # Fast model
                contents=full_prompt,
                config=genai_types.GenerateContentConfig(
                    response_mime_type="application/json",
                    temperature=0.1,  # Low temp for consistent classification
                    max_output_tokens=256,
                )
            )
        )

        text = response.text.strip()
        return _parse_classification(text)

    except Exception as e:
        logger.error(f"[Classifier] Gemini Flash error: {e}")
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
# WARMUP (no caching needed - prompt is too small for Gemini's 4096 token minimum)
# ═══════════════════════════════════════════════════════════════════════════════

def warmup_classifier_cache():
    """
    Classifier warmup - verifies API connectivity.
    Note: Classifier doesn't use caching (prompt too small for 4096 token minimum).
    """
    try:
        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if api_key:
            logger.info("[Classifier] API key found, classifier ready (no caching - prompt too small)")
        else:
            logger.warning("[Classifier] No Gemini API key found")
    except Exception as e:
        logger.error(f"[Classifier] Warmup error: {e}")
