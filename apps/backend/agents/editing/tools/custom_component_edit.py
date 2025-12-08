"""
CustomComponent str_replace-based editing tool.

Following Anthropic's recommended approach for targeted surgical edits:
- str_replace: Find exact string, replace with new string
- view: View current HTML content
- rewrite: Full rewrite for broad changes

This enables fast, targeted edits without regenerating entire components.
"""

from typing import List, Union, Literal, Optional, Tuple
from pydantic import BaseModel, Field, create_model
from html import unescape
from difflib import SequenceMatcher
import logging
import re

from models.tools import ToolModel
from models.deck import DeckBase, DeckDiff
from utils.deck import find_component_by_id

logger = logging.getLogger(__name__)


def strip_html_tags(html: str) -> str:
    """Remove HTML tags to get plain text content."""
    # Remove script and style content
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', html)
    # Unescape HTML entities
    text = unescape(text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def normalize_whitespace(text: str) -> str:
    """Collapse all whitespace to single spaces."""
    return re.sub(r'\s+', ' ', text).strip()


def normalize_whitespace_aggressive(text: str) -> str:
    """Remove ALL whitespace for matching purposes."""
    return re.sub(r'\s+', '', text)


def find_fuzzy_match(html: str, search_text: str, threshold: float = 0.85) -> Tuple[Optional[str], float]:
    """
    Find the best fuzzy match for search_text in html using sliding window.

    Uses SequenceMatcher (similar to Aider's approach) to find approximate matches.
    Returns: (matched_string, similarity_ratio)
    """
    if not search_text or not html:
        return None, 0.0

    search_len = len(search_text)
    best_match = None
    best_ratio = 0.0
    best_pos = -1

    # Optimization: if search text is very long, use larger step size
    step = 1 if search_len < 100 else max(1, search_len // 20)

    # Try exact length first
    for i in range(0, len(html) - search_len + 1, step):
        candidate = html[i:i + search_len]
        ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = candidate
            best_pos = i

    # If we found a good match with stepping, refine around that position
    if best_pos >= 0 and step > 1:
        start = max(0, best_pos - step)
        end = min(len(html) - search_len + 1, best_pos + step)
        for i in range(start, end):
            candidate = html[i:i + search_len]
            ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = candidate
                best_pos = i

    # Also try varying lengths (±15%) to handle whitespace differences
    for length_mult in [0.9, 1.1, 0.85, 1.15]:
        adj_len = int(search_len * length_mult)
        if adj_len < 5 or adj_len > len(html):
            continue
        for i in range(0, len(html) - adj_len + 1, step):
            candidate = html[i:i + adj_len]
            ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = candidate

    if best_ratio >= threshold:
        return best_match, best_ratio

    return None, best_ratio


def find_whitespace_normalized_match(html: str, search_text: str) -> Optional[str]:
    """
    Find match by normalizing whitespace in both strings.

    Returns the actual HTML substring that matches when whitespace is normalized.
    """
    normalized_search = normalize_whitespace(search_text)
    if not normalized_search:
        return None

    # Build a mapping of normalized positions to original positions
    # This lets us find the original substring after matching normalized versions

    # Strategy: slide through HTML, normalize each window, compare
    search_len = len(search_text)

    # Try windows of varying sizes (whitespace can expand or contract)
    for window_mult in [1.0, 1.2, 1.5, 0.8, 2.0]:
        window_size = int(search_len * window_mult)
        if window_size < 5 or window_size > len(html):
            continue

        for i in range(len(html) - window_size + 1):
            candidate = html[i:i + window_size]
            normalized_candidate = normalize_whitespace(candidate)

            if normalized_candidate == normalized_search:
                return candidate

            # Also try aggressive normalization (remove all whitespace)
            if normalize_whitespace_aggressive(candidate) == normalize_whitespace_aggressive(search_text):
                return candidate

    return None


def find_text_in_html(html: str, search_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Find text in HTML and return the actual HTML substring to replace.

    Uses multiple strategies (inspired by Aider and Cursor):
    1. Exact match
    2. Whitespace-normalized match
    3. Case-insensitive match
    4. Fuzzy match using SequenceMatcher
    5. Partial match suggestions

    Returns: (found, actual_html_string, suggestion)
    """
    logger.debug(f"find_text_in_html: searching for '{search_text[:100]}...' (len={len(search_text)})")

    # 1. First try exact match (fastest)
    if search_text in html:
        logger.debug("find_text_in_html: exact match found")
        return True, search_text, None

    # 2. Try whitespace-normalized match
    normalized_match = find_whitespace_normalized_match(html, search_text)
    if normalized_match:
        logger.debug(f"find_text_in_html: whitespace-normalized match found")
        return True, normalized_match, "Matched with normalized whitespace"

    # 3. Try case-insensitive exact match
    lower_html = html.lower()
    lower_search = search_text.lower()
    if lower_search in lower_html:
        idx = lower_html.find(lower_search)
        actual = html[idx:idx + len(search_text)]
        logger.debug(f"find_text_in_html: case-insensitive match found")
        return True, actual, f"Found with different case: '{actual[:50]}...'"

    # 4. Try whitespace-normalized + case-insensitive
    normalized_search = normalize_whitespace(search_text).lower()
    for window_mult in [1.0, 1.2, 1.5, 0.8, 2.0]:
        window_size = int(len(search_text) * window_mult)
        if window_size < 5 or window_size > len(html):
            continue
        for i in range(len(html) - window_size + 1):
            candidate = html[i:i + window_size]
            if normalize_whitespace(candidate).lower() == normalized_search:
                logger.debug(f"find_text_in_html: normalized+case-insensitive match found")
                return True, candidate, "Matched with normalized whitespace and case"

    # 5. Try fuzzy matching (SequenceMatcher) - most flexible
    fuzzy_match, ratio = find_fuzzy_match(html, search_text, threshold=0.85)
    if fuzzy_match:
        logger.info(f"find_text_in_html: fuzzy match found (similarity={ratio:.2%})")
        return True, fuzzy_match, f"Fuzzy match (similarity={ratio:.2%})"

    # 6. Try matching just the text content (strip HTML tags from search)
    plain_search = strip_html_tags(search_text)
    if plain_search and len(plain_search) > 10:
        # Look for this plain text in the HTML
        escaped_search = re.escape(plain_search)
        # Allow for HTML tags and whitespace between words
        pattern = escaped_search.replace(r'\ ', r'(?:\s|<[^>]+>)*')
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            logger.debug(f"find_text_in_html: plain text pattern match found")
            return True, match.group(0), "Matched plain text content with flexible whitespace"

    # 7. Generate helpful suggestions for debugging
    suggestion = None

    # Check if partial match exists
    if len(search_text) > 30:
        partial = search_text[:30]
        if partial in html:
            idx = html.find(partial)
            context = html[max(0, idx-20):idx+50]
            suggestion = f"Partial match at position {idx}. Context: ...{context}..."
        else:
            # Try even shorter prefix
            short_partial = search_text[:15]
            if short_partial in html:
                idx = html.find(short_partial)
                suggestion = f"Very short partial match at position {idx}. Search text may have significant differences."

    # Check if the content exists but is structured differently
    plain_text = strip_html_tags(html)
    plain_search = strip_html_tags(search_text) if '<' in search_text else search_text
    if plain_search and plain_search in plain_text:
        suggestion = "Text content exists but HTML structure differs significantly. Try searching for just the text without HTML tags."

    # Report best fuzzy match even if below threshold
    if ratio > 0.5:
        if suggestion:
            suggestion += f" Best fuzzy match had {ratio:.0%} similarity."
        else:
            suggestion = f"Best fuzzy match had {ratio:.0%} similarity (threshold is 85%)."

    logger.debug(f"find_text_in_html: no match found. Best fuzzy ratio: {ratio:.2%}")
    return False, None, suggestion


class StrReplaceEdit(BaseModel):
    """A single str_replace operation."""
    old_string: str = Field(description="The exact string to find and replace. Must match exactly (including whitespace).")
    new_string: str = Field(description="The string to replace it with.")


class CustomComponentStrReplaceArgs(ToolModel):
    """
    Targeted str_replace editing for CustomComponent HTML.

    Use this for SURGICAL edits like:
    - Changing a color: old_string="color: #333" new_string="color: #ff0000"
    - Updating text: old_string=">Old Title<" new_string=">New Title<"
    - Modifying a class: old_string="class='text-lg'" new_string="class='text-2xl font-bold'"

    For BROAD changes (complete redesign, new layout), use replace_component instead.
    """
    tool_name: Literal["custom_component_str_replace"] = Field(
        description="Make targeted surgical edits to CustomComponent HTML using str_replace. Use for small, specific changes like colors, text, sizes. For complete redesigns, use replace_component."
    )
    component_id: str = Field(description="The id of the CustomComponent to edit")
    slide_id: str = Field(description="The id of the slide containing the component")
    # Simplified: single edit at a time to avoid nested List[Object] schema issues with Gemini
    old_string: str = Field(description="The exact string to find in the HTML. Must match exactly (including whitespace).")
    new_string: str = Field(description="The string to replace it with.")
    description: str = Field(description="Brief description of what this edit accomplishes")


def custom_component_str_replace(
    args: CustomComponentStrReplaceArgs,
    registry,  # Used to get proper diff model
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Apply str_replace edits to a CustomComponent's HTML.

    This is much faster than full regeneration for targeted changes.
    Uses INDEXED replacement to avoid replacing all occurrences.
    """
    from agents.editing.validated_editor import (
        get_validated_editor,
        smart_find_and_replace,
        validate_html
    )

    # Find the component
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent (type: {component.get('type')})")

    # Get the current HTML
    props = component.get('props', {}) or {}
    current_html = props.get('render', '')

    if not current_html:
        raise ValueError(f"CustomComponent {args.component_id} has no render HTML")

    # Store original for potential rollback
    original_html = current_html
    updated_html = current_html

    # Use smart matching to find the text
    found, actual_string, suggestion = find_text_in_html(updated_html, args.old_string)

    if found and actual_string:
        # Count occurrences - use indexed replacement if multiple
        count = updated_html.count(actual_string)

        if count > 1:
            # INDEXED REPLACEMENT: Only replace first occurrence, not all
            # This prevents breaking other instances of similar text
            logger.warning(f"str_replace: '{actual_string[:50]}...' found {count} times - replacing FIRST occurrence only (indexed replacement)")

            # Use smart_find_and_replace for context-aware replacement
            updated_html, success, message = smart_find_and_replace(
                updated_html,
                actual_string,
                args.new_string,
                context_before="",  # Could be enhanced with LLM-provided context
                context_after=""
            )

            if not success:
                raise ValueError(message)

            logger.info(f"str_replace: {message}")
        else:
            # Single occurrence - safe to replace directly
            updated_html = updated_html.replace(actual_string, args.new_string)
            logger.info(f"str_replace: Applied edit (1 occurrence)")

        if suggestion:
            logger.info(f"str_replace: {suggestion}")

        # VALIDATION: Check HTML structure after edit
        validation = validate_html(updated_html)
        if validation.errors:
            logger.error(f"str_replace validation failed: {validation.errors}")
            # Rollback to original
            raise ValueError(f"Edit would break HTML structure: {'; '.join(validation.errors)}")

        if validation.warnings:
            logger.warning(f"str_replace warnings: {validation.warnings}")

    else:
        # Provide helpful error with suggestions
        searched_preview = args.old_string[:100] + "..." if len(args.old_string) > 100 else args.old_string
        error_msg = f"Could not find old_string in HTML.\n\nSearched for: '{searched_preview}'"
        if suggestion:
            error_msg += f"\n\nSuggestion: {suggestion}"

        # Also provide a snippet of the HTML to help debugging
        plain_text = strip_html_tags(current_html)
        if len(plain_text) > 500:
            plain_text = plain_text[:500] + "..."
        error_msg += f"\n\nVisible text content: {plain_text}"

        logger.warning(f"str_replace failed: searched for '{searched_preview}'")

        raise ValueError(error_msg)

    # Get the proper component diff model from registry
    component_diff_model = registry.get_component_diff_model('CustomComponent')

    # Create the diff using the proper model
    component_diff = component_diff_model(
        id=args.component_id,
        type='CustomComponent',
        props={
            "render": updated_html
        }
    )

    deck_diff.update_component(args.slide_id, args.component_id, component_diff)

    logger.info(f"CustomComponent str_replace: Applied edit. Description: {args.description}")

    return deck_diff


class CustomComponentViewArgs(ToolModel):
    """View the current HTML of a CustomComponent before editing."""
    tool_name: Literal["custom_component_view"] = Field(
        description="View the current HTML content of a CustomComponent. Use this to see what to edit before using str_replace."
    )
    component_id: str = Field(description="The id of the CustomComponent to view")
    slide_id: str = Field(description="The id of the slide containing the component")


def custom_component_view(
    args: CustomComponentViewArgs,
    registry,  # Unused, but needed for consistent signature
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    View the HTML content of a CustomComponent.
    This is a no-op tool that logs the HTML for debugging.
    The actual HTML viewing should happen through context, not this tool.
    """
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    props = component.get('props', {}) or {}
    html = props.get('render', '')

    logger.info(f"CustomComponent view: {args.component_id}")
    logger.info(f"HTML length: {len(html)}")
    logger.info(f"HTML preview: {html[:500]}...")

    # Return unchanged deck_diff (view is read-only)
    return deck_diff


# Utility function to determine if a request needs full rewrite or str_replace
def should_use_str_replace(edit_request: str, html_content: str) -> bool:
    """
    Determine if an edit request should use str_replace (targeted) or full rewrite.

    Returns True for targeted edits, False for broad rewrites.
    """
    # Keywords indicating full rewrite needed
    rewrite_keywords = [
        'redesign', 'completely change', 'totally different', 'new layout',
        'rebuild', 'recreate', 'from scratch', 'new design', 'overhaul',
        'transform into', 'convert to', 'make it a', 'change it to a',
        'replace with', 'switch to'
    ]

    # Keywords indicating targeted edit
    targeted_keywords = [
        'change color', 'update text', 'modify', 'adjust', 'tweak',
        'make bigger', 'make smaller', 'change font', 'fix', 'correct',
        'change the', 'update the', 'edit the', 'set the', 'increase',
        'decrease', 'brighten', 'darken', 'bold', 'italic', 'add padding',
        'remove padding', 'change margin', 'rename', 'change title',
        'change heading', 'update heading'
    ]

    request_lower = edit_request.lower()

    # Check for rewrite keywords first
    for keyword in rewrite_keywords:
        if keyword in request_lower:
            return False

    # Check for targeted keywords
    for keyword in targeted_keywords:
        if keyword in request_lower:
            return True

    # Default: if the HTML is large and request is short/simple, prefer str_replace
    if len(html_content) > 1000 and len(edit_request) < 100:
        return True

    # Default to str_replace for small edits
    return True


# =============================================================================
# GEMINI-COMPATIBLE CUSTOMCOMPONENT REWRITE
# =============================================================================
# Simplified models that work with Gemini's structured output (no complex Unions)

class CustomComponentRewriteArgs(ToolModel):
    """
    Full rewrite of a CustomComponent's HTML using AI.
    Use this for broad changes like redesigns, new layouts, or major overhauls.
    For targeted edits (color, text, size), use custom_component_str_replace instead.
    """
    tool_name: Literal["custom_component_rewrite"] = Field(
        description="Completely rewrite a CustomComponent's HTML. Use for redesigns or major changes."
    )
    component_id: str = Field(description="The id of the CustomComponent to rewrite")
    slide_id: str = Field(description="The id of the slide containing the component")
    rewrite_request: str = Field(description="What changes to make to the component")


class SimpleCustomComponentResponse(BaseModel):
    """
    Gemini-compatible response model with NO Union types.
    Just the essential fields for a CustomComponent.
    """
    html: str = Field(description="The complete HTML document starting with <!DOCTYPE html>")
    description: str = Field(description="Brief description of what was created/changed")


def _build_rewrite_system_prompt(
    width: int,
    height: int,
    colors: dict,
    typography: dict,
    attachment_context: str = ""
) -> str:
    """
    Build a rich system prompt for CustomComponent rewriting.

    Uses the same creative patterns as the generator for full capability.
    """
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

    return f"""You are a WORLD-CLASS CREATIVE TECHNOLOGIST modifying presentation components.
{attachment_context}

═══════════════════════════════════════════════════════════════
🎨 DESIGN SYSTEM (USE THESE EXACT COLORS!)
═══════════════════════════════════════════════════════════════

:root {{
  --accent: {accent};
  --secondary: {secondary};
  --text: {text_color};
  --bg: {bg_color};
  --font-hero: '{hero_font}', sans-serif;
  --font-body: '{body_font}', sans-serif;
}}

COLORS: Use --accent and --secondary for accents. MANDATORY.
FONTS: {hero_font} for headings, {body_font} for body.
Google Fonts: https://fonts.googleapis.com/css2?family={hero_font.replace(' ', '+')}:wght@400;600;700;900&family={body_font.replace(' ', '+')}:wght@400;500;600&display=swap

═══════════════════════════════════════════════════════════════
🚀 CREATIVE ARSENAL
═══════════════════════════════════════════════════════════════

🎯 INTERACTIVE: Quiz, True/False, Poll, Accordion, Card Flip
🎯 DATA VIZ: Animated counters, progress rings, bar charts, timelines
🎯 EFFECTS: Typewriter, word fade-in, gradient text, glow

═══════════════════════════════════════════════════════════════
💎 VISUAL POLISH
═══════════════════════════════════════════════════════════════

GLASSMORPHISM:
background: rgba(255,255,255,0.1);
backdrop-filter: blur(10px);
border: 1px solid rgba(255,255,255,0.2);

GRADIENT TEXT:
background: linear-gradient(135deg, {accent}, {secondary});
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

GLOW: box-shadow: 0 0 30px {accent}40;
HOVER: transition: all 0.3s ease; transform: translateY(-4px);

═══════════════════════════════════════════════════════════════
📐 CONSTRAINTS
═══════════════════════════════════════════════════════════════

- Dimensions: {width}x{height} pixels (NO scrolling, content MUST fit)
- Background: transparent (slide handles background)
- Include Tailwind: <script src='https://cdn.tailwindcss.com'></script>
- Output: Complete HTML document starting with <!DOCTYPE html>
"""


def custom_component_rewrite(
    args: CustomComponentRewriteArgs,
    registry,
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    attachments: Optional[List] = None
) -> DeckDiff:
    """
    Rewrite a CustomComponent's HTML using smart model routing.

    Uses different models based on edit complexity:
    - COMPLEX (new concepts, redesigns): Gemini 3 Pro (best quality)
    - MEDIUM (partial rewrites): Gemini Flash (fast, good)

    Includes validation and quality checks.
    """
    from agents.ai.clients import get_client, invoke
    from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
    from agents.config import CUSTOM_COMPONENT_MODEL, CUSTOM_COMPONENT_EDIT_MODEL, CUSTOM_COMPONENT_FALLBACK_MODEL
    from agents.editing.attachment_analyzer import (
        analyze_attachments,
        build_multimodal_content,
        get_attachment_context_summary,
        FileType
    )
    from agents.editing.validated_editor import classify_edit_complexity, EditComplexity

    # Find the component
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    # Get current HTML and properties
    props = component.get('props', {}) or {}
    current_html = props.get('render', '')
    width = props.get('width', 1760)
    height = props.get('height', 800)

    # Get theme from deck
    deck_dict = deck_data if isinstance(deck_data, dict) else deck_data.model_dump() if hasattr(deck_data, 'model_dump') else {}
    theme = deck_dict.get('theme', {}) or {}
    colors = theme.get('color_palette', {}) or {}
    typography = theme.get('typography', {}) or {}

    # Analyze attachments
    analyzed_attachments = analyze_attachments(attachments or [])
    attachment_context = get_attachment_context_summary(analyzed_attachments)

    # Check for reference images
    has_reference = any(att.is_vision_content for att in analyzed_attachments)
    reference_note = ""
    if has_reference:
        reference_note = """
🎯 REFERENCE IMAGES PROVIDED - MATCH THIS STYLE!
Analyze the uploaded images and replicate the design style, colors, and layout.
"""

    # Build rich system prompt with full creative capability
    system_prompt = _build_rewrite_system_prompt(
        width=width,
        height=height,
        colors=colors,
        typography=typography,
        attachment_context=attachment_context
    )

    # User prompt with FULL current HTML (raw Gemini API has no filename issues)
    user_prompt = f"""CURRENT HTML:
{current_html}

MODIFICATION REQUEST:
{args.rewrite_request}
{reference_note}
Apply the requested changes. Output the complete modified HTML starting with <!DOCTYPE html>."""

    # SMART MODEL ROUTING: Choose model based on edit complexity
    complexity = classify_edit_complexity(args.rewrite_request, current_html)

    # Check if Gemini is in cooldown
    gemini_in_cooldown = is_provider_in_cooldown("gemini")

    if complexity == EditComplexity.COMPLEX:
        if gemini_in_cooldown:
            # Gemini in cooldown, use fallback directly
            selected_model = CUSTOM_COMPONENT_FALLBACK_MODEL
            use_gemini = False
            logger.info(f"Smart routing: COMPLEX edit, but Gemini in cooldown - using fallback: {selected_model}")
        else:
            selected_model = CUSTOM_COMPONENT_MODEL  # Gemini 3 Pro for complex edits
            use_gemini = selected_model.startswith('gemini')
            logger.info(f"Smart routing: COMPLEX edit detected, using {selected_model}")
    else:
        selected_model = CUSTOM_COMPONENT_EDIT_MODEL  # Claude Haiku 4.5 for medium edits
        use_gemini = selected_model.startswith('gemini')
        logger.info(f"Smart routing: MEDIUM edit detected, using {selected_model}")

    import os
    import json as json_module

    try:
        if use_gemini:
            # Use raw Gemini API to avoid instructor's caching issues (filename too long errors)
            from google import genai
            from google.genai import types

            gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
            if not gemini_key:
                raise ValueError("GOOGLE_API_KEY not set")

            gemini_client = genai.Client(api_key=gemini_key)

            # Combine prompts for Gemini
            full_prompt = f"{system_prompt}\n\n{user_prompt}"

            # Add reference images if available
            contents = []
            if analyzed_attachments:
                for att in analyzed_attachments:
                    if att.is_vision_content and att.base64_data:
                        contents.append(types.Part.from_bytes(
                            data=__import__('base64').b64decode(att.base64_data),
                            mime_type=att.mime_type or 'image/png'
                        ))
            contents.append(full_prompt)

            # Make raw API call with smart-selected model (with fallback on rate limit)
            gemini_rate_limited = False
            try:
                response_raw = gemini_client.models.generate_content(
                    model=selected_model,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        response_mime_type="application/json",
                        response_schema={
                            "type": "object",
                            "properties": {
                                "html": {"type": "string", "description": "The complete HTML document"},
                                "description": {"type": "string", "description": "Brief description"}
                            },
                            "required": ["html", "description"]
                        }
                    )
                )
                response_text = response_raw.text
            except Exception as gemini_err:
                # Check for rate limit error (429)
                error_str = str(gemini_err).lower()
                if '429' in error_str or 'rate' in error_str or 'quota' in error_str or 'limit' in error_str:
                    # Mark Gemini as rate limited for 5 minutes cooldown
                    mark_provider_rate_limited("gemini")
                    logger.warning(f"[CUSTOM_COMPONENT_EDIT] Gemini rate limited, falling back to {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                    gemini_rate_limited = True
                else:
                    raise

            # If Gemini rate limited, use fallback model (Claude Opus 4.5)
            if gemini_rate_limited:
                logger.info(f"[CUSTOM_COMPONENT_EDIT] Using fallback model: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)

                # Build multimodal content if attachments present
                if analyzed_attachments:
                    user_content = build_multimodal_content(analyzed_attachments, user_prompt, max_images=3)
                else:
                    user_content = user_prompt

                response = invoke(
                    client=fallback_client,
                    model=fallback_model,
                    max_tokens=16384,
                    response_model=SimpleCustomComponentResponse,
                    messages=[
                        {"role": "system", "content": system_prompt},
                        {"role": "user", "content": user_content}
                    ],
                    temperature=0.7
                )
                # Skip the normal Gemini response parsing - we already have the response
                return ToolResult(
                    success=True,
                    message=f"CustomComponent rewritten successfully using fallback model (Gemini rate limited)",
                    data={
                        "component_id": args.component_id,
                        "new_html": response.html,
                        "description": response.description,
                        "used_fallback": True
                    }
                )

            # Parse response - handle malformed JSON from Gemini
            try:
                response_data = json_module.loads(response_text)
            except json_module.JSONDecodeError as json_err:
                # Gemini sometimes returns malformed JSON when HTML contains special chars
                # Try to extract HTML directly from the response
                logger.warning(f"JSON parse failed, attempting to extract HTML: {json_err}")

                # Try to find HTML in the response (common patterns)
                html_match = re.search(r'<!DOCTYPE html>.*?</html>', response_text, re.DOTALL | re.IGNORECASE)
                if html_match:
                    response_data = {
                        'html': html_match.group(0),
                        'description': 'Rewritten component (extracted from response)'
                    }
                else:
                    # Try to find just the html field value
                    html_field_match = re.search(r'"html"\s*:\s*"(.*?)"(?:\s*,|\s*})', response_text, re.DOTALL)
                    if html_field_match:
                        # Unescape the JSON string
                        html_escaped = html_field_match.group(1)
                        html_unescaped = html_escaped.encode().decode('unicode_escape')
                        response_data = {
                            'html': html_unescaped,
                            'description': 'Rewritten component (extracted from response)'
                        }
                    else:
                        # Last resort: if response looks like HTML, use it directly
                        if '<!doctype' in response_text.lower() or '<html' in response_text.lower():
                            response_data = {
                                'html': response_text.strip(),
                                'description': 'Rewritten component (raw response)'
                            }
                        else:
                            raise ValueError(f"Could not parse Gemini response: {json_err}")

            response = SimpleCustomComponentResponse(
                html=response_data.get('html', ''),
                description=response_data.get('description', 'Rewritten component')
            )
        else:
            # Use Claude (Haiku 4.5) for medium edits via instructor
            logger.info(f"Using Claude model: {selected_model}")
            client, model = get_client(selected_model)

            # Build multimodal content if attachments present
            if analyzed_attachments:
                user_content = build_multimodal_content(analyzed_attachments, user_prompt, max_images=3)
            else:
                user_content = user_prompt

            response = invoke(
                client=client,
                model=model,
                max_tokens=16384,
                response_model=SimpleCustomComponentResponse,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                max_retries=2
            )

    except ImportError as e:
        # Fallback to instructor-wrapped client if google.genai not available
        logger.warning(f"Import error ({e}), falling back to instructor with {selected_model}")
        client, model = get_client(selected_model)

        # Build multimodal content if attachments present
        if analyzed_attachments:
            user_content = build_multimodal_content(analyzed_attachments, user_prompt, max_images=3)
        else:
            user_content = user_prompt

        response = invoke(
            client=client,
            model=model,
            max_tokens=16384,
            response_model=SimpleCustomComponentResponse,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            max_retries=2
        )
    except Exception as e:
        logger.error(f"CustomComponent rewrite failed: {e}")
        raise

    # Validate the HTML starts correctly
    html = response.html.strip()
    if not html.lower().startswith('<!doctype'):
        # Try to fix common issues
        if '<html' in html.lower():
            html = '<!DOCTYPE html>' + html
        else:
            raise ValueError("Generated HTML doesn't start with <!DOCTYPE html>")

    # VALIDATION: Check HTML structure before applying
    from agents.editing.validated_editor import validate_html, compare_html_changes

    validation = validate_html(html)
    if validation.errors:
        logger.error(f"Rewrite validation failed: {validation.errors}")
        raise ValueError(f"Generated HTML has structural issues: {'; '.join(validation.errors)}")

    if validation.warnings:
        logger.warning(f"Rewrite validation warnings: {validation.warnings}")

    # Compare changes to detect potential issues
    comparison = compare_html_changes(current_html, html)
    logger.info(f"Rewrite comparison: similarity={comparison['similarity_ratio']:.2%}, size_change={comparison['size_change']}")

    # Warn if significant content was removed
    if comparison['size_change'] < -1000:
        logger.warning(f"Significant content removed during rewrite ({abs(comparison['size_change'])} chars)")

    # Get the proper component diff model from registry
    component_diff_model = registry.get_component_diff_model('CustomComponent')

    # Create the diff
    component_diff = component_diff_model(
        id=args.component_id,
        type='CustomComponent',
        props={
            "render": html
        }
    )

    deck_diff.update_component(args.slide_id, args.component_id, component_diff)

    logger.info(f"CustomComponent rewrite complete: {response.description}")

    return deck_diff
