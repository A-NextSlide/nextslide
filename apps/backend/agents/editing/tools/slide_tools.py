"""
Slide tools - AI-powered slide editing and creation.

Philosophy:
- edit_slide handles EVERYTHING on a slide (empty, custom component, standard)
- create_slide creates NEW slides with full AI-generated content
- Simple, powerful, let AI do the work
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import logging
import uuid

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER - Dict/Pydantic safe access
# ═══════════════════════════════════════════════════════════════════════════════

def _get_attr(obj, key, default=None):
    """Safely get attribute from dict or Pydantic model."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ═══════════════════════════════════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ComponentProps(BaseModel):
    """Component properties."""
    class Config:
        extra = "allow"  # Allow any props


class GeneratedComponent(BaseModel):
    """A generated component."""
    type: str = Field(description="Component type: Background, TiptapTextBlock, Image, Chart, Shape, CustomComponent")
    props: Dict[str, Any] = Field(description="Component properties")


class SlideContent(BaseModel):
    """Generated slide content."""
    components: List[GeneratedComponent] = Field(description="List of components for the slide")


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

SLIDE_GENERATOR_PROMPT = """You are an expert slide designer. Generate beautiful, professional slide content.

CANVAS: 1920x1080 pixels. Origin (0,0) is top-left.

COMPONENT TYPES:

1. Background - Always include one
   props: { backgroundType: "gradient"|"solid", gradient?: {type, angle, stops}, backgroundColor?: hex color like FF0000 }

2. TiptapTextBlock - Text content
   props: { text: str, position: {x, y}, width, height, fontSize, fontWeight, textColor, alignment }

3. Image - Images
   props: { src: "url", position: {x, y}, width, height, objectFit: "cover"|"contain" }

4. Chart - Data visualization
   props: { chartType: "bar"|"line"|"pie", data: [{name, value, color}], position, width, height }

5. CustomComponent - Complex HTML/CSS (USE THIS for creative designs!)
   props: { render: "<!DOCTYPE html>...", position: {x, y}, width, height }
   The render prop should be a COMPLETE HTML document with Tailwind CSS.
   CRITICAL: Use SINGLE QUOTES in HTML, keep on ONE LINE.

DESIGN PRINCIPLES:
- Visual hierarchy (larger = more important)
- Breathing room (don't crowd)
- Professional, modern aesthetics
- Dark backgrounds with light text look great
- Use CustomComponent for anything fancy (timelines, cards, grids, etc.)

CUSTOMCOMPONENT TEMPLATE:
<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;overflow:hidden;background:transparent}}</style></head><body class='w-full h-full flex items-center justify-center p-8'>YOUR_CONTENT</body></html>
"""

SLIDE_EDIT_PROMPT = """You are an expert slide editor. Modify the slide based on the user's request.

CURRENT SLIDE COMPONENTS:
{current_components}

USER REQUEST: {instruction}

Return the COMPLETE updated slide components. Include ALL components (modified + unchanged).
If the slide only has a Background, generate new content based on the request.
"""

CUSTOM_COMPONENT_REWRITE_PROMPT = """You are an expert HTML/CSS designer. Modify this CustomComponent.

CURRENT HTML:
{current_html}

USER REQUEST: {instruction}

Return the COMPLETE updated HTML. Use Tailwind CSS classes.
Keep on ONE LINE, use SINGLE QUOTES for attributes.
"""


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_model_and_client(task: str = "slide_generate"):
    """Get model and client, handling rate limits."""
    model = get_model(task)

    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[SLIDE_TOOLS] Gemini in cooldown, using fallback: {model}")

    return get_client(model)


def _invoke_with_fallback(client, model, messages, response_model=None, max_tokens=16000):
    """Invoke LLM with automatic fallback on rate limit."""
    try:
        return invoke(
            client=client,
            model=model,
            messages=messages,
            response_model=response_model,
            max_tokens=max_tokens,
        )
    except Exception as e:
        error_str = str(e).lower()
        # Only fallback on actual rate limits, not other errors
        is_rate_limit = ('429' in error_str or 'rate limit' in error_str or 'quota exceeded' in error_str)
        is_not_filesystem = 'errno' not in error_str and 'file name' not in error_str

        if is_rate_limit and is_not_filesystem:
            logger.warning(f"[SLIDE_TOOLS] Rate limited, trying fallback")
            mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            return invoke(
                client=fallback_client,
                model=fallback_model,
                messages=messages,
                response_model=response_model,
                max_tokens=max_tokens,
            )
        raise


def _format_components_for_prompt(components: List) -> str:
    """Format components for inclusion in prompt."""
    lines = []
    for c in components:
        ctype = _get_attr(c, 'type', 'Unknown')
        cid = _get_attr(c, 'id', 'no-id')
        props = _get_attr(c, 'props', {}) or {}

        # Handle props that might be Pydantic model
        def get_prop(key, default=''):
            if isinstance(props, dict):
                return props.get(key, default)
            return getattr(props, key, default)

        if ctype == 'Background':
            lines.append(f"- Background: {get_prop('backgroundType', 'solid')}")
        elif ctype == 'CustomComponent':
            html = get_prop('render', '')
            lines.append(f"- CustomComponent [{cid}]: {len(html)} chars HTML")
            lines.append(f"  HTML preview: {html[:500]}...")
        elif ctype == 'TiptapTextBlock':
            text = str(get_prop('text', ''))[:100]
            lines.append(f"- TiptapTextBlock [{cid}]: \"{text}\"")
        elif ctype == 'Image':
            lines.append(f"- Image [{cid}]: {str(get_prop('src', ''))[:50]}")
        else:
            lines.append(f"- {ctype} [{cid}]")

    return "\n".join(lines) if lines else "(empty slide)"


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

def edit_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Edit a slide - AI decides what to change.

    CRITICAL LOGIC:
    1. If slide is empty/blank → GENERATE full content
    2. If slide has CustomComponent → REWRITE the HTML
    3. If slide has standard components → EDIT/REPLACE them

    Args:
        args: { "slide_id": str, "instruction": str }
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    instruction = args.get('instruction', '')

    components = _get_attr(current_slide, 'components', []) or []

    # Analyze slide state
    non_bg_components = [c for c in components if _get_attr(c, 'type') != 'Background']
    custom_component = next((c for c in components if _get_attr(c, 'type') == 'CustomComponent'), None)
    is_empty = len(non_bg_components) == 0

    logger.info(f"[edit_slide] slide={slide_id}, empty={is_empty}, has_custom={custom_component is not None}")

    # CASE 1: Empty slide → Generate full content
    if is_empty:
        return _generate_slide_content(slide_id, instruction, current_slide, attachments)

    # CASE 2: Has CustomComponent → Rewrite HTML
    if custom_component:
        return _rewrite_custom_component(slide_id, custom_component, instruction, attachments)

    # CASE 3: Standard components → Generate new slide content
    return _edit_standard_components(slide_id, components, instruction, attachments)


def _generate_slide_content(
    slide_id: str,
    instruction: str,
    current_slide: Dict,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Generate content for an empty slide."""
    logger.info(f"[_generate_slide_content] Generating content for empty slide")

    # Get existing background if any
    components = _get_attr(current_slide, 'components', []) or []
    background = next(
        (c for c in components if _get_attr(c, 'type') == 'Background'),
        None
    )

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_context = f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    prompt = f"""{SLIDE_GENERATOR_PROMPT}

EXISTING BACKGROUND: {_get_attr(background, 'props') if background else 'None - create a dark gradient background'}
{att_context}

USER REQUEST: {instruction}

Generate slide components. The slide is currently EMPTY.
Create visually appealing, professional content that fulfills the request.
Use CustomComponent for complex layouts (cards, grids, timelines, etc.)."""

    client, model = _get_model_and_client("slide_generate")

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=SlideContent,
        max_tokens=16000,
    )

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())

    for component in response.components:
        # Skip background if slide already has one
        if component.type == 'Background' and background:
            continue

        comp_dict = {
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        }
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_generate_slide_content] Generated {len(response.components)} components")
    return deck_diff


def _rewrite_custom_component(
    slide_id: str,
    custom_component: Dict,
    instruction: str,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Rewrite CustomComponent HTML based on instruction."""
    logger.info(f"[_rewrite_custom_component] Rewriting custom component")

    comp_id = _get_attr(custom_component, 'id')
    props = _get_attr(custom_component, 'props', {}) or {}
    current_html = props.get('render', '') if isinstance(props, dict) else getattr(props, 'render', '')

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = ["- " + a.get('name', 'file') + ": " + a.get('url', '') for a in attachments]
        att_context = "\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    # Build prompt without f-strings to avoid issues with # in HTML
    prompt = CUSTOM_COMPONENT_REWRITE_PROMPT.format(
        current_html=current_html[:30000],
        instruction=instruction,
    ) + att_context

    client, model = _get_model_and_client("custom_component_rewrite")

    # Get raw HTML response (no structured output)
    new_html = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=None,  # Raw output
        max_tokens=16000,
    )

    # Clean up response (extract HTML if wrapped in markdown)
    if '```html' in new_html:
        new_html = new_html.split('```html')[1].split('```')[0].strip()
    elif '```' in new_html:
        new_html = new_html.split('```')[1].split('```')[0].strip()

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    component_diff = ComponentDiffBase(
        id=comp_id,
        type="CustomComponent",
        props={"render": new_html}
    )
    deck_diff.update_component(slide_id, comp_id, component_diff)

    logger.info(f"[_rewrite_custom_component] Rewrote HTML ({len(current_html)} → {len(new_html)} chars)")
    return deck_diff


def _edit_standard_components(
    slide_id: str,
    components: List[Dict],
    instruction: str,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Edit standard components or replace with CustomComponent."""
    logger.info(f"[_edit_standard_components] Editing {len(components)} components")

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_context = f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    prompt = f"""{SLIDE_GENERATOR_PROMPT}

{SLIDE_EDIT_PROMPT.format(
    current_components=_format_components_for_prompt(components),
    instruction=instruction,
)}
{att_context}

Return ALL components for the slide (modified + unchanged).
Consider converting to a CustomComponent if the request requires complex layout."""

    client, model = _get_model_and_client("slide_generate")

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=SlideContent,
        max_tokens=16000,
    )

    # Build diff - remove old components, add new ones
    deck_diff = DeckDiff(DeckDiffBase())

    # Remove all non-background components
    for c in components:
        if _get_attr(c, 'type') != 'Background':
            deck_diff.remove_component(slide_id, _get_attr(c, 'id'))

    # Add new components
    for component in response.components:
        if component.type == 'Background':
            # Update existing background instead of adding
            bg = next((c for c in components if _get_attr(c, 'type') == 'Background'), None)
            if bg:
                bg_id = _get_attr(bg, 'id')
                bg_diff = ComponentDiffBase(
                    id=bg_id,
                    type="Background",
                    props=component.props
                )
                deck_diff.update_component(slide_id, bg_id, bg_diff)
                continue

        comp_dict = {
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        }
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_edit_standard_components] Generated {len(response.components)} components")
    return deck_diff


def create_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Create a brand new slide with AI-generated content.

    Args:
        args: { "instruction": str, "insert_after": optional str }
    """
    instruction = args.get('instruction', '')
    insert_after = args.get('insert_after')

    logger.info(f"[create_slide] Creating new slide: {instruction[:50]}...")

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_context = f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    prompt = f"""{SLIDE_GENERATOR_PROMPT}
{att_context}

USER REQUEST: {instruction}

Generate a complete, beautiful slide. Include:
1. A Background component (dark gradient recommended)
2. Content components (use CustomComponent for complex layouts)

Make it visually stunning and professional."""

    client, model = _get_model_and_client("slide_generate")

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=SlideContent,
        max_tokens=16000,
    )

    # Build slide
    slide_id = str(uuid.uuid4())
    slide = {
        "id": slide_id,
        "components": []
    }

    for component in response.components:
        comp_dict = {
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        }
        slide["components"].append(comp_dict)

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(slide)

    logger.info(f"[create_slide] Created slide with {len(slide['components'])} components")
    return deck_diff


def delete_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Delete a slide from the deck.

    Args:
        args: { "slide_id": str }
    """
    slide_id = args.get('slide_id')

    if not slide_id:
        raise ValueError("slide_id is required")

    logger.info(f"[delete_slide] Deleting slide: {slide_id}")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.remove_slide(slide_id)

    return deck_diff
