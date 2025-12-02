"""
Unified accessor for deck/slide/component data.

Eliminates the repeated dict/Pydantic dual-access pattern throughout the codebase.
All code should use these helpers instead of direct attribute/dict access.
"""

from typing import Any, Dict, List, Optional, TypeVar, Union
from pydantic import BaseModel

T = TypeVar('T')


def get_attr(obj: Any, key: str, default: T = None) -> T:
    """
    Get an attribute from an object, handling both Pydantic models and dicts.

    Usage:
        slide_id = get_attr(slide, 'id')
        components = get_attr(slide, 'components', [])
    """
    if obj is None:
        return default

    # Try attribute access first (Pydantic models)
    try:
        value = getattr(obj, key, None)
        if value is not None:
            return value
    except Exception:
        pass

    # Fall back to dict access
    if isinstance(obj, dict):
        return obj.get(key, default)

    return default


def to_dict(obj: Any) -> Dict[str, Any]:
    """
    Convert an object to a dict, handling Pydantic models.

    Usage:
        data = to_dict(deck_data)
    """
    if obj is None:
        return {}

    if isinstance(obj, dict):
        return obj

    # Pydantic v2
    if hasattr(obj, 'model_dump'):
        try:
            return obj.model_dump()
        except Exception:
            pass

    # Pydantic v1
    if hasattr(obj, 'dict'):
        try:
            return obj.dict()
        except Exception:
            pass

    return {}


def find_slide(deck_data: Any, slide_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a slide by ID in deck data.

    Returns the slide as a dict, or None if not found.
    """
    if not slide_id:
        return None

    slides = get_attr(deck_data, 'slides', [])

    for slide in slides:
        if get_attr(slide, 'id') == slide_id:
            return to_dict(slide) if not isinstance(slide, dict) else slide

    return None


def find_component(deck_data: Any, component_id: str) -> Optional[Dict[str, Any]]:
    """
    Find a component by ID across all slides.

    Returns dict with 'component', 'slide_id', 'component_type'.
    """
    if not component_id:
        return None

    slides = get_attr(deck_data, 'slides', [])

    for slide in slides:
        slide_id = get_attr(slide, 'id')
        components = get_attr(slide, 'components', [])

        for comp in components:
            if get_attr(comp, 'id') == component_id:
                comp_dict = to_dict(comp) if not isinstance(comp, dict) else comp
                return {
                    'component': comp_dict,
                    'slide_id': slide_id,
                    'component_type': get_attr(comp, 'type')
                }

    return None


def get_slide_components(slide: Any) -> List[Dict[str, Any]]:
    """
    Get all components from a slide as dicts.
    """
    components = get_attr(slide, 'components', [])
    return [to_dict(c) if not isinstance(c, dict) else c for c in components]


def get_component_ids(slide: Any) -> List[str]:
    """
    Get all component IDs from a slide.
    """
    components = get_attr(slide, 'components', [])
    return [get_attr(c, 'id') for c in components if get_attr(c, 'id')]


def get_slide_ids(deck_data: Any) -> List[str]:
    """
    Get all slide IDs from deck data.
    """
    slides = get_attr(deck_data, 'slides', [])
    return [get_attr(s, 'id') for s in slides if get_attr(s, 'id')]


def get_theme(deck_data: Any) -> Dict[str, Any]:
    """
    Get theme from deck data.
    """
    theme = get_attr(deck_data, 'theme', {})
    if not theme:
        # Try nested in data
        data = get_attr(deck_data, 'data', {})
        theme = get_attr(data, 'theme', {})
    return to_dict(theme) if not isinstance(theme, dict) else theme


def get_color_palette(deck_data: Any) -> Dict[str, str]:
    """
    Get color palette from deck theme.
    """
    theme = get_theme(deck_data)
    return theme.get('color_palette', {}) or {}


def get_typography(deck_data: Any) -> Dict[str, Any]:
    """
    Get typography from deck theme.
    """
    theme = get_theme(deck_data)
    return theme.get('typography', {}) or {}
