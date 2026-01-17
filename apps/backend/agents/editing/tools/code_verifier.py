"""
Code verification utilities for CustomComponent HTML/JS.

Verifies that generated interactive code is syntactically valid and has
proper event handlers, providing feedback to the LLM for iteration.
"""

import re
import logging
from typing import Dict, List, Tuple, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class VerificationResult:
    """Result of code verification."""
    is_valid: bool
    issues: List[str]
    warnings: List[str]
    interactive_elements: List[Dict]
    suggestions: List[str]

    def to_feedback(self) -> str:
        """Convert to feedback string for LLM."""
        if self.is_valid and not self.issues:
            return ""

        lines = []
        if self.issues:
            lines.append("ISSUES FOUND (must fix):")
            for issue in self.issues:
                lines.append(f"  - {issue}")

        if self.warnings:
            lines.append("\nWARNINGS:")
            for warning in self.warnings:
                lines.append(f"  - {warning}")

        if self.suggestions:
            lines.append("\nSUGGESTIONS:")
            for suggestion in self.suggestions:
                lines.append(f"  - {suggestion}")

        return "\n".join(lines)


def verify_interactive_code(html: str, user_request: str = "") -> VerificationResult:
    """
    Verify that interactive HTML/JS code is syntactically valid and functional.

    Checks for:
    - JavaScript syntax errors (basic patterns)
    - Missing event handlers for interactive elements
    - Common issues like undefined functions, unclosed tags
    - Whether the code matches user's intent

    Args:
        html: The HTML/JS code to verify
        user_request: The original user request for context

    Returns:
        VerificationResult with issues, warnings, and suggestions
    """
    issues = []
    warnings = []
    suggestions = []
    interactive_elements = []

    if not html or len(html.strip()) < 50:
        return VerificationResult(
            is_valid=False,
            issues=["HTML content is empty or too short"],
            warnings=[],
            interactive_elements=[],
            suggestions=["Generate complete HTML content"]
        )

    # Extract and analyze JavaScript
    js_issues, js_warnings = _analyze_javascript(html)
    issues.extend(js_issues)
    warnings.extend(js_warnings)

    # Find interactive elements
    interactive_elements = _find_interactive_elements(html)

    # Check for common interactivity patterns
    interactivity_issues, interactivity_suggestions = _check_interactivity(
        html, interactive_elements, user_request
    )
    issues.extend(interactivity_issues)
    suggestions.extend(interactivity_suggestions)

    # Check HTML structure
    html_issues = _check_html_structure(html)
    issues.extend(html_issues)

    # Determine if valid
    is_valid = len(issues) == 0

    return VerificationResult(
        is_valid=is_valid,
        issues=issues,
        warnings=warnings,
        interactive_elements=interactive_elements,
        suggestions=suggestions
    )


def _analyze_javascript(html: str) -> Tuple[List[str], List[str]]:
    """Analyze JavaScript for common syntax issues."""
    issues = []
    warnings = []

    # Extract script content
    script_pattern = r'<script[^>]*>(.*?)</script>'
    scripts = re.findall(script_pattern, html, re.DOTALL | re.IGNORECASE)

    for script in scripts:
        if not script.strip():
            continue

        # Check for common syntax issues

        # Unclosed braces
        open_braces = script.count('{')
        close_braces = script.count('}')
        if open_braces != close_braces:
            issues.append(f"Mismatched braces in JavaScript: {open_braces} open, {close_braces} close")

        # Unclosed parentheses
        open_parens = script.count('(')
        close_parens = script.count(')')
        if open_parens != close_parens:
            issues.append(f"Mismatched parentheses in JavaScript: {open_parens} open, {close_parens} close")

        # Unclosed brackets
        open_brackets = script.count('[')
        close_brackets = script.count(']')
        if open_brackets != close_brackets:
            issues.append(f"Mismatched brackets in JavaScript: {open_brackets} open, {close_brackets} close")

        # Check for undefined function calls (common patterns)
        function_calls = re.findall(r'(\w+)\s*\(', script)
        function_defs = re.findall(r'function\s+(\w+)', script)
        builtin_funcs = {
            'addEventListener', 'querySelector', 'querySelectorAll', 'getElementById',
            'getElementsByClassName', 'getElementsByTagName', 'setTimeout', 'setInterval',
            'clearTimeout', 'clearInterval', 'console', 'alert', 'confirm', 'prompt',
            'parseInt', 'parseFloat', 'Math', 'JSON', 'Array', 'Object', 'String',
            'Number', 'Boolean', 'Date', 'RegExp', 'Error', 'Promise', 'fetch',
            'document', 'window', 'event', 'this', 'forEach', 'map', 'filter',
            'reduce', 'find', 'some', 'every', 'includes', 'indexOf', 'push',
            'pop', 'shift', 'unshift', 'splice', 'slice', 'concat', 'join',
            'split', 'replace', 'match', 'test', 'exec', 'toString', 'valueOf',
            'requestAnimationFrame', 'cancelAnimationFrame', 'getComputedStyle',
            'getBoundingClientRect', 'classList', 'style', 'setAttribute',
            'getAttribute', 'removeAttribute', 'appendChild', 'removeChild',
            'insertBefore', 'replaceChild', 'createElement', 'createTextNode',
            'DOMContentLoaded', 'load', 'click', 'mouseover', 'mouseout',
            'mouseenter', 'mouseleave', 'keydown', 'keyup', 'keypress',
            'submit', 'change', 'input', 'focus', 'blur', 'scroll', 'resize',
        }

        for func in function_calls:
            if func not in function_defs and func not in builtin_funcs:
                # Check if it's an arrow function or method
                if not re.search(rf'(const|let|var)\s+{func}\s*=', script):
                    if not re.search(rf'\.{func}\s*\(', script):
                        warnings.append(f"Function '{func}' may be undefined")

        # Check for common mistakes
        if 'onclick=' in html.lower() and 'addEventListener' not in script:
            warnings.append("Using inline onclick - consider addEventListener for better separation")

        # Check for syntax patterns that often cause issues
        if re.search(r'}\s*else\s*{', script) and not re.search(r'if\s*\(', script):
            issues.append("Found 'else' without preceding 'if' statement")

        # Check for common typos
        if 'fucntion' in script:
            issues.append("Typo: 'fucntion' should be 'function'")
        if 'retrun' in script:
            issues.append("Typo: 'retrun' should be 'return'")
        if 'varible' in script or 'varialbe' in script:
            issues.append("Typo in variable declaration")

    return issues, warnings


def _find_interactive_elements(html: str) -> List[Dict]:
    """Find elements that should be interactive."""
    elements = []

    # Buttons
    buttons = re.findall(r'<button[^>]*>(.*?)</button>', html, re.DOTALL | re.IGNORECASE)
    for i, btn in enumerate(buttons):
        text = re.sub(r'<[^>]+>', '', btn).strip()[:50]
        elements.append({
            'type': 'button',
            'index': i,
            'text': text,
            'tag': 'button'
        })

    # Elements with onclick
    onclick_elements = re.findall(r'<(\w+)[^>]*onclick=["\']([^"\']*)["\'][^>]*>', html, re.IGNORECASE)
    for tag, handler in onclick_elements:
        elements.append({
            'type': 'clickable',
            'tag': tag,
            'handler': handler[:50]
        })

    # Elements with cursor-pointer (Tailwind)
    pointer_elements = re.findall(r'<(\w+)[^>]*class="[^"]*cursor-pointer[^"]*"[^>]*>', html, re.IGNORECASE)
    for tag in pointer_elements:
        elements.append({
            'type': 'pointer-styled',
            'tag': tag
        })

    # Elements with hover effects
    hover_elements = re.findall(r'<(\w+)[^>]*class="[^"]*hover:[^"]*"[^>]*>', html, re.IGNORECASE)
    for tag in hover_elements:
        elements.append({
            'type': 'hover-effect',
            'tag': tag
        })

    return elements


def _check_interactivity(html: str, elements: List[Dict], user_request: str) -> Tuple[List[str], List[str]]:
    """Check if interactivity matches user intent."""
    issues = []
    suggestions = []

    request_lower = (user_request or "").lower()

    # Check if user asked for buttons/interactivity but none found
    wants_buttons = any(word in request_lower for word in ['button', 'click', 'interactive', 'work', 'functional'])
    buttons = [e for e in elements if e.get('type') == 'button' or e.get('tag') == 'button']
    clickables = [e for e in elements if e.get('type') in ('clickable', 'pointer-styled')]

    if wants_buttons and not buttons and not clickables:
        suggestions.append("User asked for interactive elements but no buttons or clickable elements found")

    # Check if buttons have event handlers
    if buttons:
        # Check for event handlers in script
        has_click_handlers = (
            'addEventListener' in html and 'click' in html.lower()
        ) or 'onclick' in html.lower()

        if not has_click_handlers:
            issues.append("Buttons exist but no click handlers found - buttons won't do anything when clicked")
            suggestions.append("Add addEventListener('click', ...) or onclick handler to make buttons functional")

    # Check for pointer-styled elements without handlers
    pointer_styled = [e for e in elements if e.get('type') == 'pointer-styled']
    if pointer_styled and 'onclick' not in html.lower() and 'addEventListener' not in html:
        warnings_text = "Elements styled as clickable (cursor-pointer) but no click handlers found"
        if warnings_text not in issues:
            suggestions.append(warnings_text)

    # Check for common interactivity patterns user might want
    if 'toggle' in request_lower or 'show' in request_lower or 'hide' in request_lower:
        if 'classList' not in html and 'style.display' not in html and 'hidden' not in html:
            suggestions.append("User wants toggle/show/hide but no visibility manipulation found")

    if 'expand' in request_lower or 'collapse' in request_lower or 'accordion' in request_lower:
        if 'height' not in html and 'maxHeight' not in html and 'classList' not in html:
            suggestions.append("User wants expand/collapse but no height animation found")

    return issues, suggestions


def _check_html_structure(html: str) -> List[str]:
    """Check HTML structure for common issues."""
    issues = []

    # Check for unclosed important tags
    important_tags = ['div', 'section', 'article', 'header', 'footer', 'main', 'aside', 'nav']
    for tag in important_tags:
        opens = len(re.findall(rf'<{tag}[\s>]', html, re.IGNORECASE))
        closes = len(re.findall(rf'</{tag}>', html, re.IGNORECASE))
        if opens != closes:
            issues.append(f"Mismatched <{tag}> tags: {opens} opening, {closes} closing")

    # Check for script tag issues
    script_opens = len(re.findall(r'<script', html, re.IGNORECASE))
    script_closes = len(re.findall(r'</script>', html, re.IGNORECASE))
    if script_opens != script_closes:
        issues.append(f"Mismatched <script> tags: {script_opens} opening, {script_closes} closing")

    # Check for style tag issues
    style_opens = len(re.findall(r'<style', html, re.IGNORECASE))
    style_closes = len(re.findall(r'</style>', html, re.IGNORECASE))
    if style_opens != style_closes:
        issues.append(f"Mismatched <style> tags: {style_opens} opening, {style_closes} closing")

    return issues


def create_verification_context(result: VerificationResult, user_request: str = "") -> str:
    """Create context for the LLM to fix issues."""
    if result.is_valid and not result.warnings:
        return ""

    lines = ["\n[CODE VERIFICATION RESULTS]"]

    if not result.is_valid:
        lines.append("STATUS: NEEDS FIXES")
    else:
        lines.append("STATUS: VALID (with warnings)")

    if result.issues:
        lines.append("\nCRITICAL ISSUES (must fix):")
        for issue in result.issues:
            lines.append(f"  ERROR: {issue}")

    if result.warnings:
        lines.append("\nWARNINGS:")
        for warning in result.warnings:
            lines.append(f"  WARN: {warning}")

    if result.suggestions:
        lines.append("\nSUGGESTIONS:")
        for suggestion in result.suggestions:
            lines.append(f"  - {suggestion}")

    if result.interactive_elements:
        lines.append(f"\nINTERACTIVE ELEMENTS FOUND: {len(result.interactive_elements)}")
        for elem in result.interactive_elements[:5]:  # Limit to 5
            lines.append(f"  - {elem.get('type')}: {elem.get('tag', 'unknown')} - {elem.get('text', '')[:30]}")

    if user_request:
        lines.append(f"\nORIGINAL USER REQUEST: {user_request[:200]}")
        lines.append("Please ensure the code fulfills this request.")

    return "\n".join(lines)
