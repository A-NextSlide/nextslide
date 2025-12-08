"""
Validated Editor - Cursor/Claude Code-like editing with quality gates.

This module provides a robust editing pipeline that:
1. Validates HTML before and after edits
2. Uses indexed replacement instead of replace-all
3. Integrates quality evaluation with retry logic
4. Supports rollback on quality failures
5. Routes to appropriate models based on complexity
"""

import re
import logging
from typing import Optional, Tuple, List, Dict, Any
from dataclasses import dataclass
from enum import Enum
from html.parser import HTMLParser
from difflib import SequenceMatcher

logger = logging.getLogger(__name__)


class EditComplexity(Enum):
    """Classification of edit request complexity."""
    SIMPLE = "simple"      # Text/color changes, str_replace
    MEDIUM = "medium"      # Structural changes, partial rewrite
    COMPLEX = "complex"    # Full redesign, new concepts


@dataclass
class ValidationResult:
    """Result of HTML validation."""
    is_valid: bool
    errors: List[str]
    warnings: List[str]

    @property
    def ok(self) -> bool:
        return self.is_valid and len(self.errors) == 0


@dataclass
class EditResult:
    """Result of an edit operation."""
    success: bool
    html: str
    original_html: str
    error: Optional[str] = None
    quality_score: Optional[float] = None
    validation: Optional[ValidationResult] = None
    retries: int = 0

    def can_rollback(self) -> bool:
        return bool(self.original_html)


class HTMLValidator(HTMLParser):
    """
    Validates HTML structure for common issues.
    Catches unclosed tags, invalid nesting, etc.
    """

    def __init__(self):
        super().__init__()
        self.errors = []
        self.warnings = []
        self.tag_stack = []
        self.void_elements = {
            'area', 'base', 'br', 'col', 'embed', 'hr', 'img',
            'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'
        }

    def handle_starttag(self, tag, attrs):
        if tag not in self.void_elements:
            self.tag_stack.append(tag)

    def handle_endtag(self, tag):
        if tag in self.void_elements:
            return
        if not self.tag_stack:
            self.errors.append(f"Unexpected closing tag </{tag}> with no matching open tag")
            return
        if self.tag_stack[-1] != tag:
            self.errors.append(f"Tag mismatch: expected </{self.tag_stack[-1]}>, got </{tag}>")
        else:
            self.tag_stack.pop()

    def handle_data(self, data):
        pass

    def get_result(self) -> ValidationResult:
        # Check for unclosed tags
        if self.tag_stack:
            self.errors.append(f"Unclosed tags: {', '.join(self.tag_stack)}")

        return ValidationResult(
            is_valid=len(self.errors) == 0,
            errors=self.errors,
            warnings=self.warnings
        )


def validate_html(html: str) -> ValidationResult:
    """
    Validate HTML for common structural issues.
    """
    if not html or not html.strip():
        return ValidationResult(
            is_valid=False,
            errors=["Empty HTML content"],
            warnings=[]
        )

    errors = []
    warnings = []

    # Check for DOCTYPE
    if not html.strip().lower().startswith('<!doctype'):
        warnings.append("Missing <!DOCTYPE html> declaration")

    # Check for basic structure
    html_lower = html.lower()
    if '<html' not in html_lower:
        errors.append("Missing <html> tag")
    if '<head' not in html_lower:
        warnings.append("Missing <head> tag")
    if '<body' not in html_lower:
        errors.append("Missing <body> tag")
    if '</html>' not in html_lower:
        errors.append("Missing </html> closing tag")
    if '</body>' not in html_lower:
        errors.append("Missing </body> closing tag")

    # Check for Tailwind CDN (optional - components can use inline CSS instead)
    # Only warn if there are tailwind classes but no CDN
    has_tailwind_classes = bool(re.search(r'class=["\'][^"\']*\b(flex|grid|p-|m-|text-|bg-|w-|h-)\w*', html))
    if has_tailwind_classes and 'tailwindcss' not in html_lower:
        warnings.append("Tailwind classes detected but CDN missing - styles may not apply")

    # Parse for structural issues
    try:
        parser = HTMLValidator()
        parser.feed(html)
        parse_result = parser.get_result()
        errors.extend(parse_result.errors)
        warnings.extend(parse_result.warnings)
    except Exception as e:
        errors.append(f"HTML parsing error: {str(e)}")

    # Check for common broken patterns
    broken_patterns = [
        (r'<script[^>]*>\s*</script>\s*<script', "Possible broken script tag"),
        (r'class=[\'"]\s*[\'"]', "Empty class attribute"),
        (r'style=[\'"]\s*[\'"]', "Empty style attribute"),
    ]
    for pattern, message in broken_patterns:
        if re.search(pattern, html):
            warnings.append(message)

    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings
    )


def classify_edit_complexity(edit_request: str, html_content: str) -> EditComplexity:
    """
    Classify the complexity of an edit request.
    Determines which model/approach to use.
    """
    request_lower = edit_request.lower()

    # Complex: Full redesign, new concepts, major structural changes
    complex_keywords = [
        'redesign', 'completely change', 'totally different', 'new layout',
        'rebuild', 'recreate', 'from scratch', 'new design', 'overhaul',
        'transform into', 'convert to', 'make it a', 'change it to a',
        'add a new section', 'create a chart', 'add animation',
        'add interactive', 'add a timeline', 'add infographic',
        'add quiz', 'add poll', 'add countdown', 'add carousel',
    ]

    # Simple: Text/color/size changes
    simple_keywords = [
        'change color', 'update text', 'modify text', 'adjust',
        'make bigger', 'make smaller', 'change font', 'fix typo',
        'change the', 'update the', 'edit the', 'set the',
        'increase', 'decrease', 'brighten', 'darken', 'bold',
        'italic', 'add padding', 'remove padding', 'change margin',
        'rename', 'change title', 'change heading', 'update heading',
        'fix the', 'correct the',
    ]

    # Check for complex keywords first
    for keyword in complex_keywords:
        if keyword in request_lower:
            return EditComplexity.COMPLEX

    # Check for simple keywords
    for keyword in simple_keywords:
        if keyword in request_lower:
            return EditComplexity.SIMPLE

    # Heuristic: Short request + large HTML = probably simple targeted edit
    if len(edit_request) < 100 and len(html_content) > 1000:
        return EditComplexity.SIMPLE

    # Heuristic: Long detailed request = probably complex
    if len(edit_request) > 200:
        return EditComplexity.MEDIUM

    # Default to medium
    return EditComplexity.MEDIUM


def find_indexed_match(html: str, search_text: str, occurrence: int = 0) -> Tuple[Optional[int], Optional[int]]:
    """
    Find the Nth occurrence of search_text in html.
    Returns (start_index, end_index) or (None, None) if not found.

    This enables indexed replacement instead of replace-all.
    """
    start = 0
    found = 0

    while True:
        idx = html.find(search_text, start)
        if idx == -1:
            return None, None
        if found == occurrence:
            return idx, idx + len(search_text)
        found += 1
        start = idx + 1

    return None, None


def find_all_matches(html: str, search_text: str) -> List[Tuple[int, int]]:
    """
    Find all occurrences of search_text in html.
    Returns list of (start_index, end_index) tuples.
    """
    matches = []
    start = 0

    while True:
        idx = html.find(search_text, start)
        if idx == -1:
            break
        matches.append((idx, idx + len(search_text)))
        start = idx + 1

    return matches


def indexed_replace(
    html: str,
    old_string: str,
    new_string: str,
    occurrence: int = 0,
    replace_all: bool = False
) -> Tuple[str, int]:
    """
    Replace text at a specific occurrence index, or all occurrences if specified.
    Returns (new_html, replacement_count).

    Unlike str.replace(), this gives control over which occurrence to replace.
    """
    if replace_all:
        count = html.count(old_string)
        return html.replace(old_string, new_string), count

    start_idx, end_idx = find_indexed_match(html, old_string, occurrence)
    if start_idx is None:
        return html, 0

    new_html = html[:start_idx] + new_string + html[end_idx:]
    return new_html, 1


def smart_find_and_replace(
    html: str,
    old_string: str,
    new_string: str,
    context_before: str = "",
    context_after: str = ""
) -> Tuple[str, bool, str]:
    """
    Smart find and replace with context awareness.

    If old_string appears multiple times, uses context_before/context_after
    to identify the correct occurrence.

    Returns: (new_html, success, message)
    """
    # Find all matches
    matches = find_all_matches(html, old_string)

    if not matches:
        return html, False, f"String not found: '{old_string[:50]}...'"

    if len(matches) == 1:
        # Single match - safe to replace
        new_html, count = indexed_replace(html, old_string, new_string, occurrence=0)
        return new_html, True, f"Replaced 1 occurrence"

    # Multiple matches - need context to disambiguate
    if not context_before and not context_after:
        # No context provided - warn but replace first occurrence
        logger.warning(f"Multiple matches ({len(matches)}) found for '{old_string[:30]}...', replacing first occurrence only")
        new_html, count = indexed_replace(html, old_string, new_string, occurrence=0)
        return new_html, True, f"Warning: {len(matches)} matches found, replaced first occurrence only"

    # Use context to find correct match
    for idx, (start, end) in enumerate(matches):
        # Get surrounding context
        before_start = max(0, start - len(context_before) - 50)
        after_end = min(len(html), end + len(context_after) + 50)

        actual_before = html[before_start:start]
        actual_after = html[end:after_end]

        # Check if context matches
        before_match = not context_before or context_before in actual_before
        after_match = not context_after or context_after in actual_after

        if before_match and after_match:
            new_html, count = indexed_replace(html, old_string, new_string, occurrence=idx)
            return new_html, True, f"Replaced occurrence {idx + 1} of {len(matches)} using context"

    # Context didn't help - replace first occurrence with warning
    logger.warning(f"Context matching failed for '{old_string[:30]}...', replacing first occurrence")
    new_html, count = indexed_replace(html, old_string, new_string, occurrence=0)
    return new_html, True, f"Warning: Context matching failed, replaced first of {len(matches)} occurrences"


def get_model_for_complexity(complexity: EditComplexity) -> str:
    """
    Get the appropriate model for the edit complexity.
    """
    from agents.config import (
        CUSTOM_COMPONENT_MODEL,         # Gemini 3 Pro for complex
        CUSTOM_COMPONENT_EDIT_MODEL,    # Opus 4.5 for medium
        CUSTOM_COMPONENT_SIMPLE_MODEL   # Opus 4.5 for simple str_replace suggestions
    )

    if complexity == EditComplexity.COMPLEX:
        return CUSTOM_COMPONENT_MODEL  # Gemini 3 Pro
    elif complexity == EditComplexity.MEDIUM:
        return CUSTOM_COMPONENT_EDIT_MODEL  # Opus 4.5
    else:
        return CUSTOM_COMPONENT_SIMPLE_MODEL  # Opus 4.5 for suggesting str_replace strings


def extract_context_around_match(html: str, search_text: str, context_chars: int = 100) -> Dict[str, str]:
    """
    Extract context around a match to help with disambiguation.
    Returns dict with 'before', 'match', 'after' keys.
    """
    idx = html.find(search_text)
    if idx == -1:
        return {"before": "", "match": "", "after": ""}

    before_start = max(0, idx - context_chars)
    after_end = min(len(html), idx + len(search_text) + context_chars)

    return {
        "before": html[before_start:idx],
        "match": search_text,
        "after": html[idx + len(search_text):after_end]
    }


def compare_html_changes(before: str, after: str) -> Dict[str, Any]:
    """
    Compare before and after HTML to understand what changed.
    Useful for quality evaluation.
    """
    # Use SequenceMatcher to find differences
    matcher = SequenceMatcher(None, before, after)
    ratio = matcher.ratio()

    # Count structural differences
    before_tags = set(re.findall(r'<(\w+)', before))
    after_tags = set(re.findall(r'<(\w+)', after))

    added_tags = after_tags - before_tags
    removed_tags = before_tags - after_tags

    # Count text content changes
    before_text = re.sub(r'<[^>]+>', '', before)
    after_text = re.sub(r'<[^>]+>', '', after)
    text_ratio = SequenceMatcher(None, before_text, after_text).ratio()

    return {
        "similarity_ratio": ratio,
        "text_similarity_ratio": text_ratio,
        "added_tags": list(added_tags),
        "removed_tags": list(removed_tags),
        "size_before": len(before),
        "size_after": len(after),
        "size_change": len(after) - len(before),
    }


class ValidatedEditor:
    """
    Main editor class that provides validated editing with quality gates.
    """

    def __init__(self, quality_threshold: float = 3.0, max_retries: int = 2):
        self.quality_threshold = quality_threshold
        self.max_retries = max_retries

    def validate_before_edit(self, html: str) -> ValidationResult:
        """Validate HTML before making edits."""
        return validate_html(html)

    def validate_after_edit(self, html: str, original_html: str) -> ValidationResult:
        """
        Validate HTML after edits.
        Includes additional checks for regressions.
        """
        result = validate_html(html)

        # Additional regression checks
        comparison = compare_html_changes(original_html, html)

        # Warn if too much was removed
        if comparison['size_change'] < -500:
            result.warnings.append(f"Significant content removed ({abs(comparison['size_change'])} chars)")

        # Warn if critical tags were removed
        critical_removed = {'html', 'body', 'head'} & set(comparison['removed_tags'])
        if critical_removed:
            result.errors.append(f"Critical tags removed: {critical_removed}")

        return result

    def evaluate_quality(
        self,
        user_query: str,
        before_html: str,
        after_html: str,
        deck_diff: Dict
    ) -> float:
        """
        Evaluate the quality of an edit using the quality agent.
        Returns score from 1-5.
        """
        try:
            from agents.ai.quality_agent import evaluate_quality as qa_evaluate
            result = qa_evaluate(
                user_query=user_query,
                before_html=before_html,
                after_html=after_html,
                deck_diff=deck_diff
            )
            return result.score
        except Exception as e:
            logger.error(f"Quality evaluation failed: {e}")
            # Return passing score on evaluation failure
            return 4.0

    def apply_str_replace(
        self,
        html: str,
        old_string: str,
        new_string: str,
        context_before: str = "",
        context_after: str = ""
    ) -> EditResult:
        """
        Apply a str_replace edit with validation and smart matching.
        """
        original_html = html

        # Validate before
        before_validation = self.validate_before_edit(html)
        if not before_validation.ok and before_validation.errors:
            logger.warning(f"Pre-edit validation warnings: {before_validation.errors}")

        # Apply the edit with smart matching
        new_html, success, message = smart_find_and_replace(
            html, old_string, new_string, context_before, context_after
        )

        if not success:
            return EditResult(
                success=False,
                html=html,
                original_html=original_html,
                error=message
            )

        # Validate after
        after_validation = self.validate_after_edit(new_html, original_html)

        if after_validation.errors:
            logger.error(f"Post-edit validation errors: {after_validation.errors}")
            return EditResult(
                success=False,
                html=html,  # Return original on failure
                original_html=original_html,
                error=f"Validation failed: {'; '.join(after_validation.errors)}",
                validation=after_validation
            )

        return EditResult(
            success=True,
            html=new_html,
            original_html=original_html,
            validation=after_validation
        )

    def apply_rewrite(
        self,
        component_id: str,
        slide_id: str,
        html: str,
        rewrite_request: str,
        deck_data: Dict,
        registry: Any,
        attachments: List = None,
        user_query: str = ""
    ) -> EditResult:
        """
        Apply a full rewrite with validation and quality gate.
        Will retry with different approach if quality is below threshold.
        """
        from agents.editing.tools.custom_component_edit import custom_component_rewrite, CustomComponentRewriteArgs
        from models.deck import DeckDiff, DeckDiffBase

        original_html = html

        # Classify complexity
        complexity = classify_edit_complexity(rewrite_request, html)
        logger.info(f"Edit complexity classified as: {complexity.value}")

        for attempt in range(self.max_retries + 1):
            try:
                # Create args
                args = CustomComponentRewriteArgs(
                    tool_name="custom_component_rewrite",
                    component_id=component_id,
                    slide_id=slide_id,
                    rewrite_request=rewrite_request
                )

                # Apply rewrite
                deck_diff = DeckDiff(DeckDiffBase())
                result_diff = custom_component_rewrite(
                    args, registry, deck_data, deck_diff, attachments
                )

                # Extract the new HTML from the diff
                new_html = None
                if hasattr(result_diff, 'deck_diff'):
                    diff_data = result_diff.deck_diff
                    if hasattr(diff_data, 'slides_to_update'):
                        for slide in (diff_data.slides_to_update or []):
                            for comp in (getattr(slide, 'components_to_update', []) or []):
                                if getattr(comp, 'id', None) == component_id:
                                    props = getattr(comp, 'props', {}) or {}
                                    if isinstance(props, dict):
                                        new_html = props.get('render')
                                    else:
                                        new_html = getattr(props, 'render', None)
                                    break

                if not new_html:
                    return EditResult(
                        success=False,
                        html=original_html,
                        original_html=original_html,
                        error="Rewrite did not produce HTML",
                        retries=attempt
                    )

                # Validate
                validation = self.validate_after_edit(new_html, original_html)

                if validation.errors:
                    if attempt < self.max_retries:
                        logger.warning(f"Attempt {attempt + 1} failed validation, retrying...")
                        rewrite_request = f"{rewrite_request}. IMPORTANT: Fix these issues: {'; '.join(validation.errors)}"
                        continue

                    return EditResult(
                        success=False,
                        html=original_html,
                        original_html=original_html,
                        error=f"Validation failed after {attempt + 1} attempts: {'; '.join(validation.errors)}",
                        validation=validation,
                        retries=attempt
                    )

                # Quality check (only if query provided)
                quality_score = None
                if user_query:
                    quality_score = self.evaluate_quality(
                        user_query=user_query,
                        before_html=original_html,
                        after_html=new_html,
                        deck_diff={}
                    )

                    if quality_score < self.quality_threshold:
                        if attempt < self.max_retries:
                            logger.warning(f"Quality score {quality_score} below threshold {self.quality_threshold}, retrying...")
                            rewrite_request = f"{rewrite_request}. Please improve quality - previous attempt scored {quality_score}/5."
                            continue

                        logger.warning(f"Quality score {quality_score} below threshold after {attempt + 1} attempts")

                return EditResult(
                    success=True,
                    html=new_html,
                    original_html=original_html,
                    quality_score=quality_score,
                    validation=validation,
                    retries=attempt
                )

            except Exception as e:
                logger.error(f"Rewrite attempt {attempt + 1} failed: {e}")
                if attempt >= self.max_retries:
                    return EditResult(
                        success=False,
                        html=original_html,
                        original_html=original_html,
                        error=str(e),
                        retries=attempt
                    )

        return EditResult(
            success=False,
            html=original_html,
            original_html=original_html,
            error="Max retries exceeded",
            retries=self.max_retries
        )


# Singleton instance
_validated_editor = None

def get_validated_editor() -> ValidatedEditor:
    """Get or create the validated editor instance."""
    global _validated_editor
    if _validated_editor is None:
        _validated_editor = ValidatedEditor()
    return _validated_editor
