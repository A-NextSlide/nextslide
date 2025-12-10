"""
Edit Composer - Haiku-based intelligent routing for CustomComponent edits.

Haiku analyzes the edit request and current HTML to decide:
1. SIMPLE - Haiku handles directly with targeted diff changes
2. CREATIVE - Delegates to Gemini 3 Pro for full rewrite
"""

from enum import Enum
from typing import List, Optional, Tuple
from pydantic import BaseModel, Field
import logging

from agents.ai.clients import get_client, invoke
from agents.config import CUSTOM_COMPONENT_COMPOSER

logger = logging.getLogger(__name__)


class EditIntent(Enum):
    """The type of edit to perform."""
    SIMPLE = "simple"      # Haiku handles with diff changes
    CREATIVE = "creative"  # Delegate to Gemini for full rewrite


class DiffChange(BaseModel):
    """A single diff change - what to find and replace."""
    old_string: str = Field(description="The exact string to find in the HTML")
    new_string: str = Field(description="The string to replace it with")
    reason: str = Field(description="Brief explanation of the change")


class ComposerResponse(BaseModel):
    """Response from the composer."""
    intent: str = Field(description="Either 'simple' or 'creative'")
    changes: Optional[List[DiffChange]] = Field(
        default=None,
        description="List of changes if intent is 'simple', null if 'creative'"
    )
    reasoning: str = Field(description="Brief explanation of the decision")


COMPOSER_SYSTEM_PROMPT = """You are a quick decision-maker for HTML edits. Your job is to analyze edit requests and decide the best approach.

## SIMPLE edits (you handle directly with find/replace changes):
- Text changes: "Change title to X" → find old text, replace
- Color changes: "Make it blue" → find color values, replace
- Size changes: "Make bigger" → find font-size/width/height, adjust
- Position changes: "Move to left" → find position styles, adjust
- Padding/margins: "Add more space" → find padding/margin values, adjust
- Simple additions: "Add a subtitle" → find location, insert

## CREATIVE edits (delegate to Gemini for full rewrite):
- Redesigns: "Redesign this", "Make it look different", "Redo this"
- Vague requests: "Make it nice", "Improve it", "Make it better", "Be creative"
- New visual concepts: "Add a chart", "Make it interactive", "Add animation"
- Complex structural changes: "Reorganize everything", "New layout"
- Anything unclear or ambitious

## Rules:
1. If you can express the edit as 1-5 find/replace changes, choose SIMPLE
2. If the request is vague or needs creative interpretation, choose CREATIVE
3. When in doubt, choose CREATIVE (it's safer)
4. For SIMPLE, include the EXACT strings to find (copy from the HTML)

## Output format:
- intent: "simple" or "creative"
- changes: List of {old_string, new_string, reason} if simple, null if creative
- reasoning: Brief explanation of your decision"""


async def compose_edit(
    request: str,
    html: str,
    has_attachments: bool = False
) -> Tuple[EditIntent, Optional[List[DiffChange]], str]:
    """
    Analyze an edit request and decide how to handle it.

    Args:
        request: The user's edit request
        html: Current HTML content
        has_attachments: Whether there are file attachments (images, etc.)

    Returns:
        (intent, changes, reasoning)
        - SIMPLE + list of changes: Haiku will handle directly
        - CREATIVE + None: Delegate to Gemini
    """
    # If there are attachments, always delegate to Gemini (needs vision)
    if has_attachments:
        logger.info("[Composer] Has attachments → CREATIVE (needs vision)")
        return EditIntent.CREATIVE, None, "Has attachments that need visual processing"

    # Quick check for obvious creative keywords
    request_lower = request.lower()
    creative_triggers = [
        'redesign', 'redo', 'recreate', 'overhaul', 'rebuild',
        'make it nice', 'make it better', 'improve it', 'be creative',
        'new layout', 'new design', 'transform', 'completely change',
        'add a chart', 'add animation', 'make interactive', 'infographic'
    ]

    for trigger in creative_triggers:
        if trigger in request_lower:
            logger.info(f"[Composer] Trigger '{trigger}' → CREATIVE")
            return EditIntent.CREATIVE, None, f"Request contains creative trigger: {trigger}"

    # Ask Haiku to analyze and decide
    try:
        client, model = get_client(CUSTOM_COMPONENT_COMPOSER)

        # Truncate HTML to avoid token limits (keep first 3000 chars)
        html_preview = html[:3000] if len(html) > 3000 else html

        user_prompt = f"""Edit Request: {request}

Current HTML:
```html
{html_preview}
```

Analyze this request. Can you express it as simple find/replace changes? Or does it need a creative rewrite?"""

        response = invoke(
            client=client,
            model=model,
            system=COMPOSER_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_prompt}],
            response_model=ComposerResponse,
            max_tokens=1500,
            temperature=0.3  # Low temperature for consistent decisions
        )

        if response.intent == "simple" and response.changes:
            logger.info(f"[Composer] SIMPLE with {len(response.changes)} changes: {response.reasoning}")
            return EditIntent.SIMPLE, response.changes, response.reasoning
        else:
            logger.info(f"[Composer] CREATIVE: {response.reasoning}")
            return EditIntent.CREATIVE, None, response.reasoning

    except Exception as e:
        # On any error, default to CREATIVE (safer)
        logger.warning(f"[Composer] Error: {e}, defaulting to CREATIVE")
        return EditIntent.CREATIVE, None, f"Composer error, defaulting to creative: {str(e)}"


def quick_classify(request: str) -> EditIntent:
    """
    Quick classification without AI call - use for pre-filtering.

    This is a fast heuristic check. For accurate decisions, use compose_edit().
    """
    request_lower = request.lower()

    # Obvious creative triggers
    creative_triggers = [
        'redesign', 'redo', 'recreate', 'overhaul', 'rebuild',
        'make it nice', 'make it better', 'improve', 'creative',
        'new layout', 'new design', 'transform', 'completely',
        'chart', 'animation', 'interactive', 'infographic'
    ]

    for trigger in creative_triggers:
        if trigger in request_lower:
            return EditIntent.CREATIVE

    # Obvious simple triggers
    simple_triggers = [
        'change the', 'update the', 'fix the', 'set the',
        'change color', 'change text', 'change title',
        'make bigger', 'make smaller', 'increase', 'decrease',
        'add padding', 'remove padding', 'bold', 'italic'
    ]

    for trigger in simple_triggers:
        if trigger in request_lower:
            return EditIntent.SIMPLE

    # Short, specific requests are likely simple
    if len(request.split()) < 10 and any(x in request_lower for x in ['to', '=', 'with']):
        return EditIntent.SIMPLE

    # Default to creative for ambiguous requests
    return EditIntent.CREATIVE
