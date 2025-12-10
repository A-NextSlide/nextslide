"""
Creative Editor - Gemini 3 Pro full HTML rewrite.

For complex edits that need creative interpretation:
- Redesigns, new layouts
- Vague requests ("make it nice")
- Adding new concepts (charts, animations)
- Anything the composer deems too complex for simple diffs
"""

import os
import json
import base64
import logging
from typing import Optional, List, Dict, Any

from pydantic import BaseModel, Field

from agents.config import (
    CUSTOM_COMPONENT_CREATIVE,
    CUSTOM_COMPONENT_FALLBACK,
)
from agents.ai.clients import get_client, invoke
from agents.editing.attachment_analyzer import build_multimodal_content
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from .html_validator import validate_html

logger = logging.getLogger(__name__)


class RewriteResponse(BaseModel):
    """Response from the creative rewrite."""
    html: str = Field(description="The complete HTML document starting with <!DOCTYPE html>")
    description: str = Field(description="Brief description of what was created/changed")


def _build_system_prompt(
    width: int,
    height: int,
    colors: Dict[str, str],
    typography: Dict[str, Any],
    has_attachments: bool = False,
    attachment_urls: List[str] = None
) -> str:
    """Build the creative rewrite system prompt."""
    # Extract design tokens
    accent = colors.get('accent_1', '#6366f1')
    secondary = colors.get('accent_2', '#8b5cf6')
    text_color = colors.get('primary_text', '#ffffff')
    bg_color = colors.get('primary_background', '#0a0e27')

    # Extract fonts
    hero_font = (
        typography.get('hero_font') or
        (typography.get('hero_title') or {}).get('family') or
        'Inter'
    )
    body_font = (
        typography.get('body_font') or
        (typography.get('body_text') or {}).get('family') or
        'Inter'
    )

    # Attachment section if present
    attachment_section = ""
    if has_attachments and attachment_urls:
        urls_list = "\n".join(f"- {url}" for url in attachment_urls)
        attachment_section = f"""
═══════════════════════════════════════════════════════════════
📎 USER ATTACHMENTS
═══════════════════════════════════════════════════════════════

The user uploaded images. USE THEM in your HTML:

{urls_list}

To embed: <img src='URL' alt='...' class='...' />
As background: style='background-image: url(URL)'
"""

    return f"""You are an elite creative technologist. Do EXACTLY what the user asks, by any means necessary.
{attachment_section}
YOUR MISSION:
- Understand the current slide's design, layout, and content
- Execute the user's request precisely
- If they say "keep the design" → preserve the visual style, only change what they ask
- If they say "redesign" or "redo" → create something completely new
- If they ask for a new feature → implement it while respecting the existing context
- NEVER ignore or partially fulfill requests - do it ALL

THEME: --accent: {accent}; --secondary: {secondary}; --text: {text_color}; --bg: {bg_color}
FONTS: {hero_font} / {body_font}

INTERACTIVE ARSENAL - use these:
• Animated diagrams that BUILD on click
• Interactive timelines - click nodes to reveal content
• Quizzes with clickable answers, feedback, confetti
• Animated counters that count up
• Before/after comparison sliders
• Hover-to-reveal cards that flip or expand
• Click-through step-by-step processes
• Expandable accordions
• Drag interactions
• SVG animations that draw themselves

EVERY INTERACTIVE ELEMENT MUST:
- Have working onclick/onmouseover handlers
- DO something visible when clicked/hovered
- Provide satisfying feedback (animations, state changes)
- Be discoverable and intuitive

Z-INDEX LAYERING (CRITICAL - titles must ALWAYS be visible):
- Background/decorative elements: z-index: 1-10
- Images and media: z-index: 20-30
- Content boxes/cards: z-index: 40-50
- TITLES AND HEADINGS: z-index: 100+ (ALWAYS on top)
- Interactive overlays/modals: z-index: 200+

Match the design to content:
- Quote? Beautiful typography, elegant entrance
- Data? Animated counters, interactive charts
- Process? Click-through steps
- Educational? Explorable, clickable, quiz-able

CANVAS: {width}x{height}px (content MUST fit, NO scrolling)
BACKGROUND: transparent (slide handles background)

OUTPUT: Complete interactive HTML/CSS/JS starting with <!DOCTYPE html>"""


async def apply_creative_rewrite(
    request: str,
    html: str,
    theme: Dict[str, Any],
    attachments: List[Any] = None,
    width: int = 1920,
    height: int = 1080
) -> str:
    """
    Apply a creative rewrite using Gemini 3 Pro.

    Falls back to Claude Opus if Gemini is rate limited.

    Args:
        request: The user's edit request
        html: Current HTML content
        theme: Theme with colors and typography
        attachments: Analyzed attachments (optional)
        width: Slide width
        height: Slide height

    Returns:
        New HTML content

    Raises:
        ValueError: If rewrite fails or produces invalid HTML
    """
    colors = theme.get('colors', {})
    typography = theme.get('typography', {})

    # Extract attachment URLs if present
    attachment_urls = []
    has_attachments = bool(attachments)
    if attachments:
        for att in attachments:
            if hasattr(att, 'processed_url') and att.processed_url:
                attachment_urls.append(att.processed_url)

    system_prompt = _build_system_prompt(
        width=width,
        height=height,
        colors=colors,
        typography=typography,
        has_attachments=has_attachments,
        attachment_urls=attachment_urls
    )

    user_prompt = f"""CURRENT HTML:
```html
{html}
```

REQUEST: {request}

Modify the HTML to fulfill this request. Output COMPLETE HTML starting with <!DOCTYPE html>."""

    # Check if Gemini is available
    gemini_available = not is_provider_in_cooldown("gemini")

    if gemini_available:
        try:
            result = await _call_gemini(system_prompt, user_prompt, attachments)
            if result:
                return result
        except Exception as e:
            error_str = str(e).lower()
            if '429' in error_str or 'rate' in error_str or 'quota' in error_str:
                mark_provider_rate_limited("gemini")
                logger.warning("[CreativeEditor] Gemini rate limited, trying Opus")
            else:
                logger.warning(f"[CreativeEditor] Gemini error: {e}, falling back to Opus")

    # Fallback to Claude Opus
    logger.info("[CreativeEditor] Using Claude Opus fallback")
    return await _call_opus(system_prompt, user_prompt, attachments)


async def _call_gemini(
    system_prompt: str,
    user_prompt: str,
    attachments: List[Any] = None
) -> Optional[str]:
    """Call Gemini 3 Pro for creative rewrite."""
    from google import genai
    from google.genai import types

    gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not gemini_key:
        raise ValueError("GOOGLE_API_KEY not set")

    client = genai.Client(api_key=gemini_key)

    # Build contents
    contents = []

    # Add images if present
    if attachments:
        for att in attachments:
            if hasattr(att, 'is_vision_content') and att.is_vision_content and hasattr(att, 'base64_data') and att.base64_data:
                contents.append(types.Part.from_bytes(
                    data=base64.b64decode(att.base64_data),
                    mime_type=att.mime_type or 'image/png'
                ))

    # Add text prompt
    contents.append(f"{system_prompt}\n\n{user_prompt}")

    response = client.models.generate_content(
        model=CUSTOM_COMPONENT_CREATIVE,
        contents=contents,
        config=types.GenerateContentConfig(
            response_mime_type="application/json",
            response_schema={
                "type": "object",
                "properties": {
                    "html": {"type": "string", "description": "Complete HTML document"},
                    "description": {"type": "string", "description": "Brief description"}
                },
                "required": ["html", "description"]
            }
        )
    )

    # Parse response
    response_text = response.text
    if not response_text:
        raise ValueError("Gemini returned empty response")

    try:
        data = json.loads(response_text)
        new_html = data.get('html', '')
    except json.JSONDecodeError:
        # Try to extract HTML directly if not JSON
        new_html = response_text

    # Validate
    validation = validate_html(new_html)
    if not validation.ok:
        logger.warning(f"[CreativeEditor] Gemini output validation failed: {validation.errors}")
        raise ValueError(f"Generated HTML has issues: {'; '.join(validation.errors)}")

    logger.info(f"[CreativeEditor] Gemini rewrite successful, {len(new_html)} chars")
    return new_html


async def _call_opus(
    system_prompt: str,
    user_prompt: str,
    attachments: List[Any] = None
) -> str:
    """Call Claude Opus as fallback."""
    client, model = get_client(CUSTOM_COMPONENT_FALLBACK)

    # Build content with images if present
    if attachments:
        user_content = build_multimodal_content(attachments, user_prompt, max_images=3)
    else:
        user_content = user_prompt

    response = invoke(
        client=client,
        model=model,
        system=system_prompt,
        messages=[{"role": "user", "content": user_content}],
        response_model=RewriteResponse,
        max_tokens=8000,
        temperature=0.8
    )

    new_html = response.html

    # Validate
    validation = validate_html(new_html)
    if not validation.ok:
        logger.warning(f"[CreativeEditor] Opus output validation failed: {validation.errors}")
        raise ValueError(f"Generated HTML has issues: {'; '.join(validation.errors)}")

    logger.info(f"[CreativeEditor] Opus rewrite successful, {len(new_html)} chars")
    return new_html
