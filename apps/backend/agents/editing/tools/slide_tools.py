"""
Slide tools - AI-powered slide editing and creation.

Philosophy:
- edit_slide handles EVERYTHING on a slide (empty, custom component, standard)
- create_slide creates NEW slides with full AI-generated content
- Simple, powerful, let AI do the work
"""

from agents.editing.tools.slide_tool_batch import edit_all_slides
from agents.editing.tools.slide_tool_custom_components import (
    component_prop_update,
    custom_component_rewrite,
    custom_component_str_replace,
    view_component,
)
from agents.editing.tools.slide_tool_generation import (
    create_slide,
    create_slide_variants,
    edit_slide,
)
from agents.editing.tools.slide_tool_ops import delete_slide, duplicate_slide, reorder_slides
from agents.editing.tools.slide_tool_theme import apply_theme_to_custom_components

__all__ = [
    "edit_slide",
    "create_slide",
    "create_slide_variants",
    "delete_slide",
    "duplicate_slide",
    "reorder_slides",
    "custom_component_rewrite",
    "custom_component_str_replace",
    "component_prop_update",
    "view_component",
    "apply_theme_to_custom_components",
    "edit_all_slides",
]
