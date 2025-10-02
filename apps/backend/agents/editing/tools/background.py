from copy import deepcopy
from typing import List, Literal, Dict, Any, Optional
from pydantic import Field, create_model

from models.tools import ToolModel
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase
from agents.ai.clients import get_client, invoke
from agents.config import DECK_EDITOR_MODEL
from agents.prompts.editing.editor_notes import get_editor_notes
from utils.deck import get_all_slide_ids, find_component_by_id
import json

class UpdateBackgroundArgs(ToolModel):
    tool_name: Literal["update_background"] = Field(description="Update ALL slide backgrounds to match a specified style. Do not use if you are updating a single slide background.")
    background_request: str = Field(description="The detailed description of how the background should look")

def get_background_components(deck_data: DeckBase) -> List[dict]:
    """Get all background components from the deck (typed or dict)."""
    background_components: List[dict] = []
    # Normalize slides
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])
    else:
        slides_iter = []

    for slide in slides_iter:
        # Resolve slide id
        slide_id = getattr(slide, 'id', None)
        if slide_id is None and isinstance(slide, dict):
            slide_id = slide.get('id')

        # Resolve components list
        if hasattr(slide, 'components'):
            components_iter = list(getattr(slide, 'components', []) or [])
        elif isinstance(slide, dict):
            components_iter = list(slide.get('components', []) or [])
        else:
            components_iter = []

        for component in components_iter:
            ctype = getattr(component, 'type', None)
            if ctype is None and isinstance(component, dict):
                ctype = component.get('type')
            if ctype == "Background":
                background_components.append({
                    "slide_id": slide_id,
                    "component": component
                })
    return background_components

def update_background(update_args: UpdateBackgroundArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    """Update all slide backgrounds to match the specified style"""
    editor_notes = get_editor_notes((1920, 1080))

    # Extract theme/palette if available to bias background generation (reuse generation context)
    def _extract_theme_context(deck: DeckBase) -> Optional[str]:
        try:
            theme: Optional[Dict[str, Any]] = None
            if hasattr(deck, 'theme'):
                theme = getattr(deck, 'theme')
            if theme is None and isinstance(deck, dict):
                theme = deck.get('theme') or (deck.get('data', {}) or {}).get('theme')
            if not isinstance(theme, dict) and theme is not None:
                try:
                    theme = theme.model_dump()
                except Exception:
                    theme = None
            if not theme:
                return None
            palette = (theme.get('color_palette') or {}) if isinstance(theme.get('color_palette'), dict) else {}
            visual_style = (theme.get('visual_style') or {}) if isinstance(theme.get('visual_style'), dict) else {}
            compact = {
                'theme_name': theme.get('theme_name'),
                'color_palette': {
                    k: palette.get(k) for k in [
                        'primary_background', 'secondary_background',
                        'primary_text', 'secondary_text',
                        'accent_1', 'accent_2', 'accent_3',
                        'background_gradient'
                    ] if k in palette
                },
                'visual_style': {k: visual_style.get(k) for k in ['background_style', 'gradient_type'] if k in visual_style}
            }
            return json.dumps(compact, ensure_ascii=False, indent=2)
        except Exception:
            return None

    theme_context = _extract_theme_context(deck_data)
    system_prompt = f"""
    You are a creative designer creating stunning presentation backgrounds.
    You will be given a background request in the <background_request> tag.
    You will then create a background component that matches this request.
    You will respect the rules in the <editor_notes> tag.
    The background should be a full-screen component that covers the entire slide (1920x1080).
    
    CRITICAL: Create clean, high-contrast backgrounds that elevate the presentation:

    1. SOLID COLOR BACKGROUNDS (default):
       - Use the theme/page backgroundColor from palette/theme
       - Ensure strong text contrast; prefer light backgrounds unless the theme is dark
       - Optional: subtle overlays using blurred solid-color blobs (low opacity)

    2. CREATIVE PATTERNS (optional):
       - Geometric patterns with very low opacity (8-12%)
       - Dot grids for tech presentations (very subtle)
       - Abstract shapes used sparingly (blurred, low opacity)

    3. NO GRADIENTS:
       - Do not use gradient backgrounds; use solid color fills only
       - Overlays must also avoid gradient CSS; use solid colors with opacity/blur

    COLOR SELECTION:
    - Choose backgroundColor from palette DB or theme model
    - Maintain readability by ensuring text contrast on the selected background
    - Think like a motion designer, not a PowerPoint template
    
    Ensure that you assign the correct properties to the background component. Including fields that should be set to None.
    Note that your goal is to only produce a background component, that will be applied to all slides, do not concern yourself with the id
    """
    
    prompt = f"""
    <editor_notes>
    {editor_notes}
    </editor_notes>

    {f"<theme_context>\n{theme_context}\n</theme_context>" if theme_context else ""}

    <background_request>
    {update_args.background_request}
    </background_request>
    """

    # Get the background component model from registry
    background_model = registry.get_component_diff_model("Background")
    
    # Create response model
    BackgroundResponse = create_model(
        "BackgroundResponse",
        background=(
            background_model,
            Field(description="The background component that matches the request")
        ),
        description=(
            str,
            Field(description="A succinct description of the background changes")
        )
    )
    
    client, model = get_client(DECK_EDITOR_MODEL)

    # Get the background design from the LLM
    response = invoke(
        client=client,
        model=model,
        max_tokens=2048,
        response_model=BackgroundResponse,
        messages=[
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
        ],
        max_retries=2,
    )

    # Get all background components
    background_components = get_background_components(deck_data)
    
    # Update each background component with the new design
    for bg_info in background_components:
        background_diff = deepcopy(response.background)
        component_obj = bg_info.get("component")
        # Support typed component objects and plain dicts
        comp_id = getattr(component_obj, "id", None)
        if comp_id is None and isinstance(component_obj, dict):
            comp_id = component_obj.get("id")
        if not comp_id:
            # Skip if we cannot resolve a valid component id
            continue
        background_diff.id = comp_id
        deck_diff.update_component(
            bg_info["slide_id"],
            comp_id,
            background_diff
        )
    
    return deck_diff
