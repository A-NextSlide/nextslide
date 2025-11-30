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


def find_text_in_html(html: str, search_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Find text in HTML and return the actual HTML substring to replace.

    Returns: (found, actual_html_string, suggestion)
    """
    # First try exact match
    if search_text in html:
        return True, search_text, None

    # Normalize the search text
    normalized_search = re.sub(r'\s+', ' ', search_text).strip()

    # Try to find in plain text content
    plain_text = strip_html_tags(html)

    if normalized_search in plain_text:
        # The text exists but might be wrapped in HTML tags
        # Try to find a close match in the original HTML

        # Escape special regex characters in search text
        escaped_search = re.escape(normalized_search)
        # Allow for HTML tags between words
        pattern = escaped_search.replace(r'\ ', r'(?:\s|<[^>]+>)*')

        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return True, match.group(0), None

    # Try case-insensitive match
    lower_html = html.lower()
    lower_search = search_text.lower()
    if lower_search in lower_html:
        # Find the actual case in original
        idx = lower_html.find(lower_search)
        actual = html[idx:idx + len(search_text)]
        return True, actual, f"Found with different case: '{actual}'"

    # Try to find partial match (first 30 chars)
    if len(search_text) > 30:
        partial = search_text[:30]
        if partial in html:
            # Find where it actually ends in the HTML
            idx = html.find(partial)
            # Look for the rest of the content
            return False, None, f"Partial match found at position {idx}. The text may be split across HTML elements."

    return False, None, None


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
    """
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

    # Apply the str_replace edit (simplified: single edit per call)
    updated_html = current_html

    # Use smart matching to find the text
    found, actual_string, suggestion = find_text_in_html(updated_html, args.old_string)

    if found and actual_string:
        # Count occurrences
        count = updated_html.count(actual_string)
        if count > 1:
            logger.warning(f"str_replace: '{actual_string[:50]}...' found {count} times, replacing all")

        updated_html = updated_html.replace(actual_string, args.new_string)
        logger.info(f"str_replace: Applied edit ({count} occurrences)")
        if suggestion:
            logger.info(f"str_replace: {suggestion}")
    else:
        # Provide helpful error with suggestions
        error_msg = f"Could not find old_string in HTML."
        if suggestion:
            error_msg += f" Suggestion: {suggestion}"

        # Also provide a snippet of the HTML to help debugging
        plain_text = strip_html_tags(current_html)
        if len(plain_text) > 500:
            plain_text = plain_text[:500] + "..."
        error_msg += f"\n\nVisible text content: {plain_text}"

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
