"""
Core utilities for the editing system.
"""

from agents.editing.core.accessor import (
    get_attr,
    to_dict,
    find_slide,
    find_component,
    get_slide_components,
    get_component_ids,
    get_slide_ids,
    get_theme,
    get_color_palette,
    get_typography,
)

from agents.editing.core.errors import (
    EditorError,
    ComponentNotFoundError,
    SlideNotFoundError,
    InvalidComponentTypeError,
    ToolExecutionError,
    CustomComponentError,
    StrReplaceError,
)

__all__ = [
    # Accessor functions
    'get_attr',
    'to_dict',
    'find_slide',
    'find_component',
    'get_slide_components',
    'get_component_ids',
    'get_slide_ids',
    'get_theme',
    'get_color_palette',
    'get_typography',
    # Errors
    'EditorError',
    'ComponentNotFoundError',
    'SlideNotFoundError',
    'InvalidComponentTypeError',
    'ToolExecutionError',
    'CustomComponentError',
    'StrReplaceError',
]
