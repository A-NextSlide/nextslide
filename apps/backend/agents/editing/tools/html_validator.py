"""
HTML validation utilities for CustomComponent editing.

Validates HTML structure to catch common issues before saving.
"""

import re
from typing import List
from dataclasses import dataclass
from html.parser import HTMLParser


@dataclass
class ValidationResult:
    """Result of HTML validation."""
    is_valid: bool
    errors: List[str]
    warnings: List[str]

    @property
    def ok(self) -> bool:
        return self.is_valid and len(self.errors) == 0


class HTMLStructureParser(HTMLParser):
    """Validates HTML structure for unclosed tags and nesting issues."""

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

    def get_result(self) -> ValidationResult:
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

    Checks:
    - Empty content
    - Missing <html>, <body> tags
    - Missing closing tags
    - Unclosed tags
    - Tailwind CDN presence (warning only)
    """
    if not html or not html.strip():
        return ValidationResult(
            is_valid=False,
            errors=["Empty HTML content"],
            warnings=[]
        )

    errors = []
    warnings = []
    html_lower = html.lower()

    # Check for basic structure
    if '<html' not in html_lower:
        errors.append("Missing <html> tag")
    if '<body' not in html_lower:
        errors.append("Missing <body> tag")
    if '</html>' not in html_lower:
        errors.append("Missing </html> closing tag")
    if '</body>' not in html_lower:
        errors.append("Missing </body> closing tag")

    # Check for DOCTYPE (warning only)
    if not html.strip().lower().startswith('<!doctype'):
        warnings.append("Missing <!DOCTYPE html> declaration")

    # Check for Tailwind CDN if Tailwind classes are used
    has_tailwind_classes = bool(re.search(
        r'class=["\'][^"\']*\b(flex|grid|p-|m-|text-|bg-|w-|h-)\w*',
        html
    ))
    if has_tailwind_classes and 'tailwindcss' not in html_lower:
        warnings.append("Tailwind classes detected but CDN missing")

    # Parse for structural issues
    try:
        parser = HTMLStructureParser()
        parser.feed(html)
        parse_result = parser.get_result()
        errors.extend(parse_result.errors)
        warnings.extend(parse_result.warnings)
    except Exception as e:
        errors.append(f"HTML parsing error: {str(e)}")

    return ValidationResult(
        is_valid=len(errors) == 0,
        errors=errors,
        warnings=warnings
    )


def quick_validate(html: str) -> bool:
    """
    Quick validation check - just returns True/False.

    Use this for fast checks where you don't need detailed errors.
    """
    if not html or not html.strip():
        return False

    html_lower = html.lower()
    return (
        '<html' in html_lower and
        '</html>' in html_lower and
        '<body' in html_lower and
        '</body>' in html_lower
    )
