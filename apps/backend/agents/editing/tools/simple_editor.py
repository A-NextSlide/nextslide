"""
Simple Editor - Applies diff changes to HTML.

Takes a list of DiffChange objects from the composer and applies them
using fuzzy matching to handle whitespace/formatting differences.
"""

from typing import List, Tuple, Optional
from dataclasses import dataclass
import logging

from .composer import DiffChange
from .fuzzy_matcher import find_text_in_html, apply_replacement
from .html_validator import validate_html, quick_validate

logger = logging.getLogger(__name__)


@dataclass
class EditResult:
    """Result of applying simple edits."""
    success: bool
    html: str
    changes_applied: int
    changes_failed: int
    errors: List[str]


def apply_simple_edit(changes: List[DiffChange], html: str) -> EditResult:
    """
    Apply a list of diff changes to HTML.

    Uses fuzzy matching to find strings even with whitespace differences.
    Applies changes sequentially, so later changes see earlier modifications.

    Args:
        changes: List of DiffChange objects (old_string → new_string)
        html: Current HTML content

    Returns:
        EditResult with success status and modified HTML
    """
    if not changes:
        return EditResult(
            success=False,
            html=html,
            changes_applied=0,
            changes_failed=0,
            errors=["No changes provided"]
        )

    modified_html = html
    changes_applied = 0
    changes_failed = 0
    errors = []

    for i, change in enumerate(changes):
        logger.info(f"[SimpleEditor] Applying change {i+1}/{len(changes)}: {change.reason}")

        # Try to apply this change
        success, new_html, message = apply_replacement(
            html=modified_html,
            old_string=change.old_string,
            new_string=change.new_string
        )

        if success:
            modified_html = new_html
            changes_applied += 1
            logger.info(f"[SimpleEditor] Change {i+1} applied successfully")
            if message:
                logger.debug(f"[SimpleEditor] Note: {message}")
        else:
            changes_failed += 1
            error_msg = f"Change {i+1} failed: {message or 'String not found'}"
            errors.append(error_msg)
            logger.warning(f"[SimpleEditor] {error_msg}")

    # Validate the result
    if changes_applied > 0 and not quick_validate(modified_html):
        validation = validate_html(modified_html)
        if not validation.ok:
            errors.extend(validation.errors)
            logger.warning(f"[SimpleEditor] Validation failed: {validation.errors}")
            return EditResult(
                success=False,
                html=html,  # Return original on validation failure
                changes_applied=changes_applied,
                changes_failed=changes_failed,
                errors=errors
            )

    # Consider success if at least one change was applied
    overall_success = changes_applied > 0 and changes_failed == 0

    return EditResult(
        success=overall_success,
        html=modified_html if changes_applied > 0 else html,
        changes_applied=changes_applied,
        changes_failed=changes_failed,
        errors=errors
    )


def apply_single_change(
    old_string: str,
    new_string: str,
    html: str
) -> Tuple[bool, str, Optional[str]]:
    """
    Apply a single string replacement.

    Convenience wrapper around apply_replacement.

    Returns: (success, modified_html, message)
    """
    return apply_replacement(html, old_string, new_string)
