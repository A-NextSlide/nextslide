"""
CustomComponent editing tool - Clean, focused entry point.

Architecture:
- Haiku analyzes request and decides: SIMPLE (diff-based) or CREATIVE (full rewrite)
- SIMPLE: Haiku generates changes, we apply them with fuzzy matching
- CREATIVE: Gemini 3 Pro does full rewrite (fallback to Opus on rate limit)

This replaces the old 1,200+ line file with focused, single-responsibility modules.
"""

from typing import List, Optional, Literal
from pydantic import BaseModel, Field
import logging

from models.tools import ToolModel
from models.deck import DeckBase, DeckDiff
from utils.deck import find_component_by_id

from .composer import compose_edit, EditIntent
from .simple_editor import apply_simple_edit
from .creative_editor import apply_creative_rewrite
from .html_validator import validate_html, quick_validate

logger = logging.getLogger(__name__)


# =============================================================================
# TOOL DEFINITIONS (API CONTRACT)
# =============================================================================

class CustomComponentRewriteArgs(ToolModel):
    """
    Intelligent rewrite of a CustomComponent's HTML using AI.

    This tool is POWERFUL and FLEXIBLE. The AI can:
    - See and analyze uploaded images/files
    - Extract information from screenshots, charts, or documents
    - Incorporate user-uploaded images into the design
    - Match styles from reference images
    - Recreate layouts shown in uploaded screenshots
    - Replace content with uploaded images

    Describe what you want in natural language - the AI will figure out how to do it.
    """
    tool_name: Literal["custom_component_rewrite"] = Field(
        description="Intelligently rewrite a CustomComponent. Can analyze uploaded images, extract data, incorporate user files, match styles from references, and more. Describe your intent in natural language."
    )
    component_id: str = Field(description="The id of the CustomComponent to rewrite")
    slide_id: str = Field(description="The id of the slide containing the component")
    rewrite_request: str = Field(description="Natural language description of what to do. Examples: 'Add the uploaded logo to the top-left corner', 'Analyze the uploaded chart and recreate it with animations', 'Replace the title text with the uploaded image', 'Match the style from the uploaded screenshot'")


class CustomComponentStrReplaceArgs(ToolModel):
    """
    Targeted str_replace editing for CustomComponent HTML.

    Use this for SURGICAL edits like:
    - Changing a color: old_string="color: #333" new_string="color: #ff0000"
    - Updating text: old_string=">Old Title<" new_string=">New Title<"
    - Modifying a class: old_string="class='text-lg'" new_string="class='text-2xl font-bold'"
    """
    tool_name: Literal["custom_component_str_replace"] = Field(
        description="Make targeted surgical edits to CustomComponent HTML using str_replace."
    )
    component_id: str = Field(description="The id of the CustomComponent to edit")
    slide_id: str = Field(description="The id of the slide containing the component")
    old_string: str = Field(description="The exact string to find in the HTML.")
    new_string: str = Field(description="The string to replace it with.")
    description: str = Field(description="Brief description of what this edit accomplishes")


class CustomComponentViewArgs(ToolModel):
    """View the current HTML of a CustomComponent before editing."""
    tool_name: Literal["custom_component_view"] = Field(
        description="View the current HTML content of a CustomComponent."
    )
    component_id: str = Field(description="The id of the CustomComponent to view")
    slide_id: str = Field(description="The id of the slide containing the component")


# =============================================================================
# MAIN ENTRY POINT
# =============================================================================

def _run_async(coro):
    """Run an async coroutine in a sync context, handling nested event loops."""
    import asyncio
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None

    if loop and loop.is_running():
        # If we're already in an async context, use nest_asyncio or create a new thread
        import concurrent.futures
        with concurrent.futures.ThreadPoolExecutor() as executor:
            future = executor.submit(asyncio.run, coro)
            return future.result()
    else:
        return asyncio.run(coro)


def custom_component_rewrite(
    args: CustomComponentRewriteArgs,
    registry,
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    attachments: Optional[List] = None
) -> DeckDiff:
    """
    Rewrite a CustomComponent's HTML using smart routing.

    Architecture:
    1. Haiku (composer) analyzes request and decides: SIMPLE or CREATIVE
    2. SIMPLE: Haiku generates diff changes, we apply them programmatically
    3. CREATIVE: Gemini 3 Pro does full rewrite (Opus fallback on rate limit)
    """
    from agents.editing.attachment_analyzer import analyze_attachments, analyze_attachments_smart

    # 1. Find the component
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    # 2. Get current HTML and context
    props = component.get('props', {}) or {}
    current_html = props.get('render', '')
    width = props.get('width', 1760)
    height = props.get('height', 800)

    if not current_html:
        raise ValueError(f"CustomComponent {args.component_id} has no render HTML")

    # 3. Get theme from deck
    deck_dict = deck_data if isinstance(deck_data, dict) else deck_data.model_dump() if hasattr(deck_data, 'model_dump') else {}
    theme = deck_dict.get('theme', {}) or {}

    # 4. Analyze attachments with smart extraction for documents
    # This uses Haiku to extract only relevant sections, saving tokens
    analyzed_attachments = _run_async(analyze_attachments_smart(
        attachments or [],
        args.rewrite_request,  # Pass user request for smart extraction
        max_doc_chars=20000    # ~5k tokens for document content
    ))
    has_attachments = len(analyzed_attachments) > 0

    logger.info(f"[CustomComponent] Editing {args.component_id}: '{args.rewrite_request[:80]}...'")

    # 5. Ask Haiku to compose (decide SIMPLE vs CREATIVE)
    # Run async function in sync context
    intent, changes, reasoning = _run_async(compose_edit(
        request=args.rewrite_request,
        html=current_html,
        has_attachments=has_attachments
    ))

    logger.info(f"[CustomComponent] Composer decision: {intent.value} - {reasoning}")

    # 6. Execute based on decision
    new_html = None

    if intent == EditIntent.SIMPLE and changes:
        # Try SIMPLE edit (Haiku's diff changes)
        logger.info(f"[CustomComponent] Applying {len(changes)} diff changes...")
        result = apply_simple_edit(changes, current_html)

        if result.success:
            new_html = result.html
            logger.info(f"[CustomComponent] Simple edit success: {result.changes_applied} changes applied")
        else:
            # Simple edit failed, fall back to creative
            logger.warning(f"[CustomComponent] Simple edit failed ({result.errors}), falling back to creative")

    if new_html is None:
        # CREATIVE rewrite (Gemini 3 Pro → Opus fallback)
        logger.info("[CustomComponent] Using creative rewrite (Gemini 3 Pro)...")
        # Run async function in sync context
        new_html = _run_async(apply_creative_rewrite(
            request=args.rewrite_request,
            html=current_html,
            theme=theme,
            attachments=analyzed_attachments,
            width=width,
            height=height
        ))

    # 7. Validate size (prevent catastrophic content loss)
    # Note: Creative rewrites can legitimately produce very different sizes
    # Only reject if the output is suspiciously small (likely truncated/error)
    original_size = len(current_html)
    new_size = len(new_html)
    size_ratio = new_size / original_size if original_size > 0 else 1.0

    # Only reject if output is tiny (< 15% of original AND < 3000 chars absolute)
    # This catches truncated/error responses while allowing legitimate redesigns
    if original_size > 2000 and new_size < 3000 and size_ratio < 0.15:
        logger.error(f"[CustomComponent] Suspicious content loss: {size_ratio:.1%} of original ({new_size:,} vs {original_size:,} chars)")
        raise ValueError(
            f"Generated HTML appears truncated ({size_ratio:.1%} of original). "
            "Try again or use a more specific edit request."
        )
    elif size_ratio < 0.5:
        logger.info(f"[CustomComponent] Size changed significantly: {size_ratio:.1%} of original ({new_size:,} vs {original_size:,} chars) - allowing for creative rewrite")

    # 8. Update the component
    component_diff_model = registry.get_component_diff_model('CustomComponent')
    component_diff = component_diff_model(
        id=args.component_id,
        type='CustomComponent',
        props={"render": new_html}
    )
    deck_diff.update_component(args.slide_id, args.component_id, component_diff)

    logger.info(f"[CustomComponent] Edit complete ({len(new_html):,} chars)")
    return deck_diff


# =============================================================================
# LEGACY TOOL HANDLERS (kept for backwards compatibility)
# =============================================================================

def custom_component_str_replace(
    args: CustomComponentStrReplaceArgs,
    registry,
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Apply a single str_replace edit to a CustomComponent's HTML.

    Uses fuzzy matching to handle whitespace differences.
    """
    from .fuzzy_matcher import apply_replacement

    # Find the component
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    props = component.get('props', {}) or {}
    current_html = props.get('render', '')

    if not current_html:
        raise ValueError(f"CustomComponent {args.component_id} has no render HTML")

    # Apply the replacement
    success, new_html, message = apply_replacement(current_html, args.old_string, args.new_string)

    if not success:
        raise ValueError(f"Could not find old_string: {message}")

    # Validate HTML structure
    if not quick_validate(new_html):
        validation = validate_html(new_html)
        if not validation.ok:
            raise ValueError(f"Edit would break HTML: {'; '.join(validation.errors)}")

    # Update the component
    component_diff_model = registry.get_component_diff_model('CustomComponent')
    component_diff = component_diff_model(
        id=args.component_id,
        type='CustomComponent',
        props={"render": new_html}
    )
    deck_diff.update_component(args.slide_id, args.component_id, component_diff)

    logger.info(f"[str_replace] Applied: {args.description}")
    return deck_diff


def custom_component_view(
    args: CustomComponentViewArgs,
    registry,
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    View the HTML content of a CustomComponent.
    This is a no-op tool that logs the HTML for debugging.
    """
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    props = component.get('props', {}) or {}
    html = props.get('render', '')

    logger.info(f"[view] Component {args.component_id}: {len(html)} chars")
    logger.debug(f"[view] Preview: {html[:500]}...")

    return deck_diff
