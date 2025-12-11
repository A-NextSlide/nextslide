"""
Component tools - Edit, create, delete individual components.

For most edits, use edit_slide instead (it handles everything).
These tools are for targeted component-level operations.
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

class ComponentUpdate(BaseModel):
    """Updated component properties."""
    props: Dict[str, Any] = Field(description="Updated properties for the component")


class NewComponent(BaseModel):
    """A new component to create."""
    type: str = Field(description="Component type")
    props: Dict[str, Any] = Field(description="Component properties")


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

COMPONENT_EDIT_PROMPT = """You are an expert slide component editor.

COMPONENT TO EDIT:
Type: {component_type}
Current Props: {current_props}

USER REQUEST: {instruction}

Return the updated props object. Only include props that should change.
Keep positioning (x, y, width, height) unless specifically asked to change.

CANVAS: 1920x1080 pixels."""

COMPONENT_CREATE_PROMPT = """You are an expert slide component creator.

CANVAS: 1920x1080 pixels. Origin (0,0) is top-left.

COMPONENT TYPE TO CREATE: {component_type}

COMPONENT SPECS:
- TiptapTextBlock: text, position {x,y}, width, height, fontSize, fontWeight, textColor, alignment
- Image: src (url), position {x,y}, width, height, objectFit
- Chart: chartType (bar/line/pie), data [{name, value, color}], position, width, height
- Shape: shapeType, backgroundColor, position, width, height, borderRadius
- CustomComponent: render (HTML string), position, width, height

USER REQUEST: {instruction}

Generate the component props. Position it nicely on the canvas (avoid top-left corner unless requested)."""


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_model_and_client(task: str = "component_edit"):
    """Get model and client, handling rate limits."""
    model = get_model(task)

    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[COMPONENT_TOOLS] Gemini in cooldown, using fallback: {model}")

    return get_client(model)


def _invoke_with_fallback(client, model, messages, response_model, max_tokens=8000):
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
            logger.warning(f"[COMPONENT_TOOLS] Rate limited, trying fallback")
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


def _find_component(slide, component_id: str) -> Optional[Dict]:
    """Find a component by ID in a slide."""
    components = _get_attr(slide, 'components', []) or []
    for c in components:
        if _get_attr(c, 'id') == component_id:
            return c
    return None


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

def edit_component(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Edit a specific component by ID.

    Args:
        args: { "slide_id": str, "component_id": str, "instruction": str }
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    component_id = args.get('component_id')
    instruction = args.get('instruction', '')

    if not component_id:
        raise ValueError("component_id is required")

    # Find the component
    component = _find_component(current_slide, component_id)
    if not component:
        raise ValueError(f"Component {component_id} not found")

    component_type = _get_attr(component, 'type', 'Unknown')
    current_props = _get_attr(component, 'props', {}) or {}

    logger.info(f"[edit_component] Editing {component_type} component: {component_id}")

    # Build prompt
    prompt = COMPONENT_EDIT_PROMPT.format(
        component_type=component_type,
        current_props=current_props,
        instruction=instruction,
    )

    # Add attachment context if any
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        prompt += f"\n\nUSER ATTACHMENTS:\n" + "\n".join(att_list)

    client, model = _get_model_and_client("component_edit")

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=ComponentUpdate,
        max_tokens=8000,
    )

    # Merge with existing props (ensure current_props is a dict)
    if not isinstance(current_props, dict):
        current_props = dict(current_props) if hasattr(current_props, '__iter__') else {}
    updated_props = {**current_props, **response.props}

    # Build diff with proper ComponentDiffBase
    deck_diff = DeckDiff(DeckDiffBase())
    component_diff = ComponentDiffBase(
        id=component_id,
        type=component_type,
        props=updated_props
    )
    deck_diff.update_component(slide_id, component_id, component_diff)

    logger.info(f"[edit_component] Updated props: {list(response.props.keys())}")
    return deck_diff


def create_component(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Create a new component on a slide.

    Args:
        args: { "slide_id": str, "component_type": str, "instruction": str }
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    component_type = args.get('component_type', 'TiptapTextBlock')
    instruction = args.get('instruction', '')

    logger.info(f"[create_component] Creating {component_type} on slide {slide_id}")

    # Build prompt
    prompt = COMPONENT_CREATE_PROMPT.format(
        component_type=component_type,
        instruction=instruction,
    )

    # Add attachment context if any
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        prompt += f"\n\nUSER ATTACHMENTS (use if relevant):\n" + "\n".join(att_list)

    client, model = _get_model_and_client("component_create")

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=NewComponent,
        max_tokens=8000,
    )

    # Build component
    new_component = {
        "id": str(uuid.uuid4()),
        "type": response.type or component_type,
        "props": response.props,
    }

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.add_component(slide_id, new_component)

    logger.info(f"[create_component] Created {new_component['type']} component")
    return deck_diff


def delete_component(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Delete a component from a slide.

    Args:
        args: { "slide_id": str, "component_id": str }
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    component_id = args.get('component_id')

    if not component_id:
        raise ValueError("component_id is required")

    logger.info(f"[delete_component] Deleting component {component_id} from slide {slide_id}")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.remove_component(slide_id, component_id)

    return deck_diff
