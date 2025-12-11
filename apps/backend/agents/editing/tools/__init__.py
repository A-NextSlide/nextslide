"""
Editing Tools - Clean, simple tools for slide editing.

Core tools:
- slide_tools: edit_slide, create_slide, delete_slide
- component_tools: edit_component, create_component, delete_component
- theme_tools: apply_theme

Utilities:
- tool_executor: Routes tool calls to implementations
- html_validator: Validates CustomComponent HTML
- fuzzy_matcher: Finds components by description
- images: Image processing utilities
"""

from agents.editing.tools.tool_executor import execute_tool

from agents.editing.tools.slide_tools import (
    edit_slide,
    create_slide,
    delete_slide,
)

from agents.editing.tools.component_tools import (
    edit_component,
    create_component,
    delete_component,
)

from agents.editing.tools.theme_tools import apply_theme

__all__ = [
    'execute_tool',
    'edit_slide',
    'create_slide',
    'delete_slide',
    'edit_component',
    'create_component',
    'delete_component',
    'apply_theme',
]
