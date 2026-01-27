"""
Fast message classifier using Gemini Flash.

Routes messages to appropriate handlers with skill-based architecture:
- Classifies into specific edit types for optimal tool/prompt selection
- Determines what context is needed (screenshot, history, research)
- Enables model selection based on complexity

Note: Doesn't use Gemini context caching because the system prompt is only ~900 tokens,
below Gemini's 4096 token minimum. Direct Gemini Flash calls are fast enough (~300-500ms).
"""

import os
import json
import logging
from typing import Optional, Dict, Any, List
from pydantic import BaseModel, Field
from enum import Enum

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# EDIT TYPES (Skills)
# ═══════════════════════════════════════════════════════════════════════════════

class EditSkill(str, Enum):
    """Specific edit types for skill-based routing."""
    # Chat - no edits needed
    CHAT = "chat"

    # Simple edits - single operation, fast model
    TEXT_EDIT = "text_edit"           # Change text, fix typo
    COLOR_EDIT = "color_edit"         # Change a color
    IMAGE_SEARCH = "image_search"     # Replace/find image
    IMAGE_AI_EDIT = "image_ai_edit"   # AI modify existing image

    # Theme edits - affect multiple slides
    THEME_CHANGE = "theme_change"     # Change fonts/colors globally

    # Content edits - may need research first
    CONTENT_UPDATE = "content_update" # Update with real data (needs research)

    # Slide operations
    SLIDE_CREATE = "slide_create"     # Create new slide
    SLIDE_DELETE = "slide_delete"     # Delete slide

    # Complex edits - need smart model
    COMPLEX_EDIT = "complex_edit"     # Redesign, multi-step, ambiguous
    RESEARCH_EDIT = "research_edit"   # Research then edit (charts, data)


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFICATION MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class EditScope(str, Enum):
    """Scope of the edit - slide-specific or whole deck."""
    SLIDE = "slide"      # Affects only current slide
    DECK = "deck"        # Affects all slides (theme change)


class MessageClassification(BaseModel):
    """Classification result from the classifier agent."""

    type: str = Field(
        description="Message type: 'chat', 'simple_edit', or 'complex_edit' (legacy)"
    )
    skill: str = Field(
        default="complex_edit",
        description="Specific edit skill for routing"
    )
    scope: str = Field(
        default="slide",
        description="Edit scope: 'slide' (current only) or 'deck' (all slides)"
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
    needs_research: bool = Field(
        default=False,
        description="Whether this request needs web research first"
    )
    confidence: float = Field(
        default=0.9,
        description="Confidence in classification (0-1)"
    )
    reasoning: str = Field(
        default="",
        description="Brief explanation of classification decision"
    )

    @property
    def is_simple(self) -> bool:
        """Check if this is a simple edit (fast model)."""
        return self.skill in [
            EditSkill.TEXT_EDIT, EditSkill.COLOR_EDIT,
            EditSkill.IMAGE_SEARCH, EditSkill.THEME_CHANGE,
            EditSkill.SLIDE_DELETE
        ]

    @property
    def is_complex(self) -> bool:
        """Check if this is a complex edit (smart model)."""
        return self.skill in [
            EditSkill.COMPLEX_EDIT, EditSkill.RESEARCH_EDIT,
            EditSkill.CONTENT_UPDATE, EditSkill.IMAGE_AI_EDIT
        ]

    @property
    def is_creative(self) -> bool:
        """Check if this needs creative generation (Pro model)."""
        return self.skill == EditSkill.SLIDE_CREATE


# ═══════════════════════════════════════════════════════════════════════════════
# CLASSIFIER SYSTEM PROMPT (cached)
# ═══════════════════════════════════════════════════════════════════════════════

CLASSIFIER_SYSTEM_PROMPT = """You are a fast message router for a presentation editor assistant.

Classify user messages into SKILLS (specific operations), determine SCOPE (slide vs deck), and context needs.

SKILLS (pick the most specific one):

CHAT:
- "chat" - Greetings, thanks, questions, acknowledgments (no edit needed)

SIMPLE EDITS (fast, single operation):
- "text_edit" - Change/fix text: "change title to X", "fix typo", "update the text"
- "color_edit" - Change colors/fonts on CURRENT SLIDE: "make it red", "change the font here", "use Comic Sans on this slide"
- "image_search" - Replace/find images: "replace the image", "find a better photo", "use a dog image"
- "theme_change" - Global changes across ALL SLIDES: "change all fonts", "fix fonts everywhere", "update the theme", "make all slides use Inter"
- "slide_delete" - Remove slides: "delete this slide", "remove slide 3"

COMPLEX EDITS (smart model needed):
- "slide_create" - Create new slide: "add a slide about X", "create an intro slide"
- "content_update" - Update with real data: "update the stats", "add current revenue numbers"
- "research_edit" - Research then edit: "research Tesla and update the slide", "add a chart with latest data"
- "image_ai_edit" - AI modify image: "make the image greener", "remove the background"
- "complex_edit" - Redesigns, multi-step, ambiguous: "redesign this", "make it better", "fix everything"

SCOPE DETECTION (critical for font/color changes):
- "slide" - Current slide only. DEFAULT for most edits. Use when:
  * No mention of "all", "every", "everywhere", "whole deck", "entire presentation"
  * Ambiguous requests like "change the font" (assume current slide)
  * Specific element references: "the title", "this text", "the background here"
- "deck" - All slides. Use ONLY when user explicitly says:
  * "all slides", "every slide", "everywhere", "whole deck", "entire presentation"
  * "fix the theme", "update typography globally"
  * Clear global intent: "change all fonts to X", "make everything use Y"

CONTEXT REQUIREMENTS:
- needs_deck: Does this need current slide data? (false only for pure chat)
- needs_screenshot: Does this need to SEE the slide visually? Be CONSERVATIVE - set TRUE ONLY for:
  * Visual descriptions of images: "the older woman", "guy in blue shirt", "the smiling one"
  * Layout changes: "move it left", "make it centered", "rearrange the layout"
  * Ambiguous visual references: "that image", "the big one", "the thing on the right"
  * Full redesigns: "redesign this", "make it look better"
  Set FALSE for (HTML context is sufficient):
  * Specific text changes: "change 'Hello' to 'Hi'", "fix the typo"
  * Specific colors: "make it red", "use #FF0000", "change to blue"
  * Named elements: "the title", "the subtitle", "the heading"
  * Size changes with clear targets: "make the title smaller", "bigger font"
- needs_history: Does this reference prior context? ("make it bigger", "do that again")
- needs_research: Does this need web data? ("latest stats", "current revenue", "2024 data")

RESPOND WITH JSON:
{
  "type": "chat|simple_edit|complex_edit",
  "skill": "<skill_name>",
  "scope": "slide|deck",
  "needs_deck": true/false,
  "needs_screenshot": true/false,
  "needs_history": true/false,
  "needs_research": true/false,
  "confidence": 0.0-1.0,
  "reasoning": "brief"
}

EXAMPLES:

"hey" → {"type": "chat", "skill": "chat", "scope": "slide", "needs_deck": false, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 1.0, "reasoning": "greeting"}

"make the title red" → {"type": "simple_edit", "skill": "color_edit", "scope": "slide", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 0.95, "reasoning": "single color change on current slide"}

"change the font to Comic Sans" → {"type": "simple_edit", "skill": "color_edit", "scope": "slide", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 0.9, "reasoning": "font change - no 'all' mentioned, assume current slide"}

"change all fonts to Poppins" → {"type": "simple_edit", "skill": "theme_change", "scope": "deck", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 0.95, "reasoning": "global font change - 'all' specified"}

"fix the ugly font everywhere" → {"type": "simple_edit", "skill": "theme_change", "scope": "deck", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 0.95, "reasoning": "font fix across all slides - 'everywhere' specified"}

"fix the font on this slide" → {"type": "simple_edit", "skill": "color_edit", "scope": "slide", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": false, "confidence": 0.95, "reasoning": "font fix - 'this slide' specified"}

"replace the logo with Tesla" → {"type": "simple_edit", "skill": "image_search", "scope": "slide", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "needs_research": false, "confidence": 0.95, "reasoning": "image replacement"}

"update with latest Tesla revenue" → {"type": "complex_edit", "skill": "content_update", "scope": "slide", "needs_deck": true, "needs_screenshot": false, "needs_history": false, "needs_research": true, "confidence": 0.95, "reasoning": "needs current data"}

"redesign this slide" → {"type": "complex_edit", "skill": "complex_edit", "scope": "slide", "needs_deck": true, "needs_screenshot": true, "needs_history": false, "needs_research": false, "confidence": 0.9, "reasoning": "full redesign"}

BE FAST. Pick the most specific skill. Default scope to "slide" unless user explicitly mentions "all"."""


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

        # Validate type (legacy field)
        msg_type = data.get("type", "complex_edit")
        if msg_type not in ["chat", "simple_edit", "complex_edit"]:
            msg_type = "complex_edit"

        # Get skill (new field) - default based on type if not provided
        skill = data.get("skill", "")
        if not skill:
            # Infer skill from legacy type
            if msg_type == "chat":
                skill = "chat"
            elif msg_type == "simple_edit":
                skill = "text_edit"  # Default simple skill
            else:
                skill = "complex_edit"

        # Validate skill is a known value
        valid_skills = [
            "chat", "text_edit", "color_edit", "image_search", "image_ai_edit",
            "theme_change", "content_update", "slide_create", "slide_delete",
            "complex_edit", "research_edit"
        ]
        if skill not in valid_skills:
            skill = "complex_edit"

        # Get scope - default to "slide" (current slide only)
        scope = data.get("scope", "slide")
        if scope not in ["slide", "deck"]:
            scope = "slide"

        return MessageClassification(
            type=msg_type,
            skill=skill,
            scope=scope,
            needs_deck=data.get("needs_deck", True),
            needs_screenshot=data.get("needs_screenshot", False),
            needs_history=data.get("needs_history", False),
            needs_research=data.get("needs_research", False),
            confidence=data.get("confidence", 0.8),
            reasoning=data.get("reasoning", ""),
        )

    except Exception as e:
        logger.warning(f"[Classifier] Parse error: {e}, text: {text[:100]}")
        return None


def _classify_fallback(message: str) -> MessageClassification:
    """
    Simple fallback when LLM classifier is unavailable.

    Just defaults to complex_edit with full context - let the orchestrator handle it.
    This is a last resort safety net, not the primary classification path.
    """
    # Check if message suggests deck-wide scope
    message_lower = message.lower()
    scope = "deck" if any(kw in message_lower for kw in ["all slides", "every slide", "everywhere", "whole deck", "entire", "all fonts"]) else "slide"

    return MessageClassification(
        type="complex_edit",
        skill="complex_edit",
        scope=scope,
        needs_deck=True,
        needs_screenshot=True,
        needs_history=True,
        needs_research=False,
        confidence=0.5,
        reasoning="fallback: LLM unavailable, defaulting to full context"
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
