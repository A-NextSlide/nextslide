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
            # JS keywords (matched by regex but not function calls)
            'if', 'else', 'for', 'while', 'do', 'switch', 'return', 'throw',
            'try', 'catch', 'finally', 'new', 'typeof', 'instanceof', 'async', 'await',
            # DOM/Browser APIs
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
            # Common inline utility functions
            'swap', 'toggle', 'update', 'render', 'init', 'reset',
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


def _check_hover_and_scale_issues(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for hover/scale issues that cause elements to bounce or avoid mouse.

    Common problems:
    - scale() on hover without overflow:visible on parent
    - transform on hover without pointer-events handling
    - Elements that scale larger but clip or cause layout shift
    """
    issues = []
    warnings = []

    # Extract all CSS (inline styles and style blocks)
    style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE)
    all_css = '\n'.join(style_blocks)

    # Check for hover:scale without proper containment
    has_hover_scale = bool(re.search(r'hover:scale-|:hover[^{]*{[^}]*scale\(', html, re.IGNORECASE))
    has_hover_transform = bool(re.search(r'hover:transform|:hover[^{]*{[^}]*transform:', html, re.IGNORECASE))

    if has_hover_scale or has_hover_transform:
        # Check if there's a group/parent with overflow handling
        has_overflow_visible = 'overflow-visible' in html or 'overflow:visible' in all_css or 'overflow: visible' in all_css
        has_group_hover = 'group-hover' in html or 'group ' in html

        if not has_overflow_visible and not has_group_hover:
            warnings.append(
                "Hover scale/transform detected without overflow-visible on parent. "
                "This can cause elements to 'bounce' or clip. Add overflow-visible to parent container."
            )

        # Check for pointer-events issues with overlapping transforms
        if 'pointer-events-none' not in html and has_hover_scale:
            # Check if scale is large enough to cause overlap issues
            large_scale = re.search(r'scale-1[1-9]|scale-[2-9]|scale\(1\.[2-9]|scale\([2-9]', html)
            if large_scale:
                warnings.append(
                    "Large hover scale detected (>1.1x). Ensure parent has enough padding/margin "
                    "to prevent hover flickering when elements overlap."
                )

    # Check for transition on transform that might cause jank
    if re.search(r'transition.*?all|transition-all', html, re.IGNORECASE):
        if has_hover_scale or has_hover_transform:
            warnings.append(
                "Using 'transition-all' with hover transforms can cause jank. "
                "Prefer 'transition-transform' for smoother animations."
            )

    return issues, warnings


def _check_chart_rendering(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for chart rendering issues (Chart.js, D3, etc.).

    Common problems:
    - Chart.js without proper canvas element
    - D3 without proper SVG container
    - Charts initialized before DOM ready
    - Missing chart library imports
    """
    issues = []
    warnings = []

    # Check for Chart.js usage
    has_chartjs = 'Chart(' in html or 'new Chart' in html or 'chart.js' in html.lower()
    if has_chartjs:
        # Must have a canvas element (static or dynamically created)
        has_canvas = '<canvas' in html.lower()
        has_dynamic_canvas = "createElement('canvas')" in html or 'createElement("canvas")' in html
        if not has_canvas and not has_dynamic_canvas:
            issues.append("Chart.js used but no <canvas> element found. Charts won't render.")

        # Check for proper initialization timing
        has_dom_ready = (
            'DOMContentLoaded' in html or
            'window.onload' in html or
            '</body>' in html and re.search(r'<script[^>]*>[^<]*new Chart', html)  # Script at end of body
        )
        if not has_dom_ready:
            warnings.append(
                "Chart.js initialization may run before canvas exists. "
                "Wrap in DOMContentLoaded or place script after canvas element."
            )

        # Check for Chart.js CDN
        has_chartjs_import = 'cdn' in html.lower() and 'chart' in html.lower()
        if not has_chartjs_import:
            issues.append("Chart.js used but CDN import not found. Add: <script src=\"https://cdn.jsdelivr.net/npm/chart.js\"></script>")

    # Check for D3.js usage
    has_d3 = 'd3.' in html or 'd3js' in html.lower()
    if has_d3:
        # Check for D3 CDN
        has_d3_import = re.search(r'cdn[^"]*d3|d3js\.org', html, re.IGNORECASE)
        if not has_d3_import:
            issues.append("D3.js used but CDN import not found. Add: <script src=\"https://cdn.jsdelivr.net/npm/d3@7\"></script>")

        # Check for SVG container for D3 charts
        if 'd3.select' in html and 'svg' not in html.lower():
            warnings.append("D3.js selection used but no SVG element found. Most D3 charts need an SVG container.")

    # Check for ApexCharts
    has_apex = 'ApexCharts' in html
    if has_apex:
        has_apex_import = 'apexcharts' in html.lower() and 'cdn' in html.lower()
        if not has_apex_import:
            issues.append("ApexCharts used but CDN import not found.")

    return issues, warnings


def _check_animation_bounds(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for animations that might exceed slide bounds.

    Common problems:
    - Keyframe animations that move elements off-screen
    - Transform translateY that pushes content below slide
    - Accordion/expand animations without max-height constraints
    - Scale animations that overflow container
    """
    issues = []
    warnings = []

    # Extract all CSS
    style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE)
    all_css = '\n'.join(style_blocks)

    # Check for animations that translate downward
    translate_down = re.findall(r'translateY\s*\(\s*(\d+)', all_css + html)
    for val in translate_down:
        if int(val) > 100:  # More than 100px down
            warnings.append(
                f"Animation translates element {val}px downward. "
                "Ensure this doesn't push content below the 1080px slide height."
            )

    # Check for accordion/expand patterns without max-height
    has_expand_animation = (
        'max-height' in all_css and
        ('transition' in all_css or 'animation' in all_css)
    )
    if has_expand_animation:
        # Check if max-height uses very large values
        large_max_height = re.search(r'max-height:\s*(\d{4,})', all_css)
        if large_max_height:
            warnings.append(
                f"Large max-height ({large_max_height.group(1)}px) in animation. "
                "For slide content, cap max-height to prevent overflow below slide bounds."
            )

    # Check for overflow:hidden on body/html (good practice for slides)
    has_body_overflow_hidden = re.search(
        r'(html|body)\s*{[^}]*overflow\s*:\s*hidden',
        all_css,
        re.IGNORECASE
    )
    if not has_body_overflow_hidden:
        # Check inline or Tailwind
        if 'overflow-hidden' not in html or not re.search(r'<(html|body)[^>]*overflow-hidden', html):
            warnings.append(
                "Consider adding overflow:hidden to html/body to prevent animated content "
                "from extending beyond the slide bounds."
            )

    # Check for keyframe animations with large movements
    keyframes = re.findall(r'@keyframes\s+\w+\s*{([^}]+(?:{[^}]*}[^}]*)*)}', all_css)
    for kf in keyframes:
        if re.search(r'translate[YX]?\s*\(\s*-?\d{3,}', kf):
            warnings.append(
                "Keyframe animation has large translate values. "
                "Ensure animated elements stay within 1920x1080 slide bounds."
            )

    return issues, warnings


def _check_button_functionality(html: str) -> Tuple[List[str], List[str]]:
    """
    Enhanced check for button functionality.

    Verifies buttons and interactive elements actually do something.
    """
    issues = []
    warnings = []

    # Find all buttons
    buttons = re.findall(r'<button[^>]*>(.*?)</button>', html, re.DOTALL | re.IGNORECASE)
    button_count = len(buttons)

    if button_count == 0:
        return issues, warnings

    # Check for event handlers
    has_onclick_attr = bool(re.search(r'onclick\s*=', html, re.IGNORECASE))
    has_addEventListener = 'addEventListener' in html
    has_jquery_click = bool(re.search(r'\$\([^)]+\)\.click|\$\([^)]+\)\.on\s*\(\s*[\'"]click', html))

    has_any_click_handler = has_onclick_attr or has_addEventListener or has_jquery_click

    if not has_any_click_handler:
        issues.append(
            f"Found {button_count} button(s) but no click handlers (onclick, addEventListener, or jQuery). "
            "Buttons won't do anything when clicked."
        )
        return issues, warnings

    # If we have handlers, check they're properly connected to buttons
    if has_addEventListener:
        # Check that addEventListener targets buttons or their containers
        button_targeting = re.search(
            r'(querySelector|getElementById|getElementsBy)[^;]*button|'
            r'button[^;]*addEventListener|'
            r'addEventListener\s*\(\s*[\'"]click[\'"]',
            html,
            re.IGNORECASE
        )
        if not button_targeting:
            warnings.append(
                "addEventListener found but may not be targeting buttons. "
                "Verify event listeners are attached to button elements."
            )

    # Check for buttons with cursor-pointer but no actual handler
    pointer_buttons = re.findall(r'<button[^>]*cursor-pointer[^>]*>', html, re.IGNORECASE)
    onclick_buttons = re.findall(r'<button[^>]*onclick[^>]*>', html, re.IGNORECASE)

    if len(pointer_buttons) > len(onclick_buttons) and not has_addEventListener:
        warnings.append(
            "Some buttons have cursor-pointer styling but no onclick handler. "
            "Add click handlers or use addEventListener."
        )

    return issues, warnings


def verify_slide_code(html: str, user_request: str = "") -> VerificationResult:
    """
    Comprehensive verification for slide generation.

    Includes all checks from verify_interactive_code plus slide-specific checks:
    - Hover/scale bounce issues
    - Chart rendering problems
    - Animation bounds
    - Button functionality

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

    # Run all standard checks
    js_issues, js_warnings = _analyze_javascript(html)
    issues.extend(js_issues)
    warnings.extend(js_warnings)

    interactive_elements = _find_interactive_elements(html)

    interactivity_issues, interactivity_suggestions = _check_interactivity(
        html, interactive_elements, user_request
    )
    issues.extend(interactivity_issues)
    suggestions.extend(interactivity_suggestions)

    html_issues = _check_html_structure(html)
    issues.extend(html_issues)

    # Run slide-specific checks
    hover_issues, hover_warnings = _check_hover_and_scale_issues(html)
    issues.extend(hover_issues)
    warnings.extend(hover_warnings)

    chart_issues, chart_warnings = _check_chart_rendering(html)
    issues.extend(chart_issues)
    warnings.extend(chart_warnings)

    anim_issues, anim_warnings = _check_animation_bounds(html)
    issues.extend(anim_issues)
    warnings.extend(anim_warnings)

    button_issues, button_warnings = _check_button_functionality(html)
    issues.extend(button_issues)
    warnings.extend(button_warnings)

    # Check for image issues (critical for preventing broken images)
    image_issues, image_warnings = _check_image_issues(html)
    issues.extend(image_issues)
    warnings.extend(image_warnings)

    # Check for overlay blocking issues (buttons not clickable)
    overlay_issues, overlay_warnings = _check_overlay_blocking(html)
    issues.extend(overlay_issues)
    warnings.extend(overlay_warnings)

    # Check for external resource issues (Tailwind CDN, bad @imports, missing fonts)
    resource_issues, resource_warnings = _check_external_resources(html)
    issues.extend(resource_issues)
    warnings.extend(resource_warnings)

    # Check for broken image-switching logic (alt changed without src)
    img_switch_issues, img_switch_warnings = _check_image_src_switching(html)
    issues.extend(img_switch_issues)
    warnings.extend(img_switch_warnings)

    # Check for slides with zero images
    zero_img_warnings = _check_zero_images(html)
    warnings.extend(zero_img_warnings)

    is_valid = len(issues) == 0

    return VerificationResult(
        is_valid=is_valid,
        issues=issues,
        warnings=warnings,
        interactive_elements=interactive_elements,
        suggestions=suggestions
    )


def _check_image_issues(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for image-related issues that will cause broken images.

    Common problems:
    - JavaScript arrays with src/image set to literal "placeholder" string
    - Images without proper sizing constraints
    - Missing alt text for image search
    - Images that might overflow bounds
    """
    issues = []
    warnings = []

    # Extract JavaScript from script tags
    script_pattern = r'<script[^>]*>(.*?)</script>'
    scripts = re.findall(script_pattern, html, re.DOTALL | re.IGNORECASE)

    for script in scripts:
        if not script.strip():
            continue

        # Check for JS objects with src/image set to "placeholder" - this is the #1 cause of broken images
        # Pattern matches: src: "placeholder", image: 'placeholder', imgSrc: "placeholder", etc.
        # Also matches placeholder with query string like 'placeholder?q=...'
        placeholder_in_js = re.findall(
            r'(\b(?:src|image|img|imgSrc|photo|picture|thumbnail|background)\s*:\s*)["\']placeholder(?:\?[^"\']*)?["\']',
            script,
            re.IGNORECASE
        )
        if placeholder_in_js:
            issues.append(
                f"Found {len(placeholder_in_js)} JavaScript property(ies) with literal 'placeholder' value. "
                "This BREAKS image loading. For JS data arrays, either:\n"
                "  1. Use the alt text as a property and render as <img src=\"placeholder\" alt=\"${item.alt}\">\n"
                "  2. Omit the image property entirely\n"
                "  3. Use actual image URLs from available images"
            )

        # Check for JS objects with image properties containing just descriptive text (not URLs)
        # This catches: { image: "rocket launch" } instead of proper handling
        non_url_images = re.findall(
            r'\b(?:src|image|img|imgSrc)\s*:\s*["\'](?!https?://|data:|placeholder)([^"\']{3,50})["\']',
            script,
            re.IGNORECASE
        )
        # Filter out variable references like ${varName}
        non_url_images = [img for img in non_url_images if not img.startswith('$')]
        if non_url_images:
            warnings.append(
                f"Found {len(non_url_images)} image properties with non-URL values in JavaScript. "
                "If these are search queries, they should be in 'alt' property instead, "
                "then render as: <img src=\"placeholder\" alt=\"${item.alt}\">"
            )

    # Check for img tags with empty or missing src
    empty_src_imgs = re.findall(r'<img[^>]*src\s*=\s*["\']["\'][^>]*>', html, re.IGNORECASE)
    if empty_src_imgs:
        issues.append(f"Found {len(empty_src_imgs)} <img> tag(s) with empty src attribute")

    # Check for img tags without alt text (needed for image search)
    imgs_without_alt = []
    img_tags = re.findall(r'<img[^>]*>', html, re.IGNORECASE)
    for img in img_tags:
        if 'alt=' not in img.lower():
            imgs_without_alt.append(img[:80])
    if imgs_without_alt:
        warnings.append(
            f"Found {len(imgs_without_alt)} <img> tag(s) without alt attribute. "
            "Alt text is used for image search - add descriptive alt text."
        )

    # Check for images without sizing constraints (can overflow)
    imgs_without_sizing = []
    for img in img_tags:
        has_sizing = any(prop in img.lower() for prop in [
            'width:', 'height:', 'w-', 'h-', 'max-w', 'max-h',
            'object-fit', 'object-cover', 'object-contain'
        ])
        if not has_sizing and 'style=' not in img.lower():
            imgs_without_sizing.append(img[:60])

    if imgs_without_sizing and len(imgs_without_sizing) > len(img_tags) // 2:
        warnings.append(
            f"{len(imgs_without_sizing)} images lack explicit sizing. "
            "Add width/height constraints and object-fit:cover to prevent overflow."
        )

    # Check for common bad alt text patterns
    bad_alts = re.findall(
        r'alt\s*=\s*["\'](?:image|photo|picture|placeholder|img|icon|background|figure)["\']',
        html,
        re.IGNORECASE
    )
    if bad_alts:
        warnings.append(
            f"Found {len(bad_alts)} images with generic alt text like 'image' or 'photo'. "
            "Alt text should be a specific search query like 'SpaceX Falcon 9 launch'."
        )

    return issues, warnings


def _check_external_resources(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for external resource issues that break slides.

    Detects:
    - Tailwind CDN or other external CSS frameworks (cause thumbnail + perf issues)
    - @import of non-CSS files (invalid, wastes network requests)
    - Missing font <link> tags when custom fonts are referenced in CSS
    """
    issues = []
    warnings = []

    # Extract CSS
    style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE)
    all_css = '\n'.join(style_blocks)

    # Check for Tailwind CDN (script tag loading tailwindcss)
    if re.search(r'<script[^>]*src=["\'][^"\']*tailwindcss[^"\']*["\']', html, re.IGNORECASE):
        issues.append(
            "Tailwind CSS CDN loaded via <script>. This adds massive overhead, "
            "breaks thumbnail rendering, and is never needed. Remove the Tailwind "
            "script tag and write all CSS in <style> tags."
        )

    # Check for @import of non-CSS files (images, etc.)
    import_urls = re.findall(
        r'@import\s+url\s*\(\s*["\']?([^"\')\s]+)["\']?\s*\)',
        all_css,
        re.IGNORECASE
    )
    for url in import_urls:
        # Allow font imports and CSS files
        if re.search(r'\.(css|woff2?|ttf|otf)(\?|$)', url, re.IGNORECASE):
            continue
        if 'fonts.googleapis.com' in url or 'fonts.gstatic.com' in url:
            continue
        # Flag non-CSS imports (images, etc.)
        if re.search(r'\.(jpg|jpeg|png|gif|svg|webp|avif|bmp|ico)(\?|$)', url, re.IGNORECASE):
            issues.append(
                f"@import used to load an image file ({url[-60:]}). "
                "@import is only for CSS stylesheets/fonts, not images. "
                "Use <img> tags for images instead."
            )
        else:
            warnings.append(
                f"@import loading a non-standard resource ({url[-60:]}). "
                "Verify this is a valid CSS file."
            )

    # Check for custom fonts referenced in CSS but not loaded via <link>
    font_families = re.findall(
        r"font-family\s*:\s*['\"]?([A-Z][A-Za-z\s]+)",
        all_css,
        re.IGNORECASE
    )
    # Also check CSS variables for font names
    font_vars = re.findall(
        r"--font-\w+\s*:\s*['\"]?([A-Z][A-Za-z\s]+)",
        all_css,
        re.IGNORECASE
    )
    custom_fonts = set()
    system_fonts = {
        'arial', 'helvetica', 'verdana', 'georgia', 'times', 'times new roman',
        'courier', 'courier new', 'serif', 'sans-serif', 'monospace', 'cursive',
        'fantasy', 'system-ui', 'ui-sans-serif', 'ui-serif', 'ui-monospace',
        'inherit', 'initial', 'unset', 'var',
    }
    for font in font_families + font_vars:
        font_clean = font.strip().strip("'\"")
        if font_clean.lower() not in system_fonts and len(font_clean) > 2:
            custom_fonts.add(font_clean)

    if custom_fonts:
        # Check if there are <link> tags for Google Fonts or similar
        has_font_link = bool(re.search(
            r'<link[^>]*(?:fonts\.googleapis\.com|fonts\.gstatic\.com|font)[^>]*>',
            html,
            re.IGNORECASE
        ))
        has_font_face = bool(re.search(r'@font-face', all_css, re.IGNORECASE))

        if not has_font_link and not has_font_face:
            font_list = ', '.join(list(custom_fonts)[:3])
            warnings.append(
                f"Custom fonts referenced ({font_list}) but no <link> or @font-face found. "
                "Add Google Fonts <link> tags in <head> or fonts will fall back to system defaults."
            )

    return issues, warnings


def _check_overlay_blocking(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for CSS overlays that might block button clicks.

    The #1 cause of non-functional buttons is decorative elements with
    position:absolute/fixed that sit on top of buttons without pointer-events:none.
    """
    issues = []
    warnings = []

    # Only relevant if buttons exist
    has_buttons = bool(re.search(r'<button[\s>]', html, re.IGNORECASE))
    has_onclick = bool(re.search(r'onclick\s*=', html, re.IGNORECASE))
    if not has_buttons and not has_onclick:
        return issues, warnings

    # Extract all CSS (inline styles and style blocks)
    style_blocks = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE)
    all_css = '\n'.join(style_blocks)

    # Check for user-select: none on universal selectors
    user_select_universal = re.search(
        r'(?:\*|html|body)\s*\{[^}]*user-select\s*:\s*none',
        all_css,
        re.IGNORECASE
    )
    if user_select_universal:
        issues.append(
            "user-select:none on *, html, or body breaks click handling on interactive elements. "
            "Remove it or apply only to specific non-interactive elements."
        )

    # Count position:absolute/fixed elements vs those with pointer-events:none
    # Look in both CSS and inline styles
    abs_fixed_count = len(re.findall(
        r'position\s*:\s*(?:absolute|fixed)',
        all_css + html,
        re.IGNORECASE
    ))
    pointer_none_count = len(re.findall(
        r'pointer-events\s*:\s*none',
        all_css + html,
        re.IGNORECASE
    ))

    # If there are many absolutely positioned elements but few with pointer-events:none,
    # some may be blocking buttons
    if abs_fixed_count > 3 and pointer_none_count < abs_fixed_count // 2:
        warnings.append(
            f"Found {abs_fixed_count} absolutely/fixed positioned elements but only "
            f"{pointer_none_count} have pointer-events:none. Decorative overlays "
            "(gradients, fog, textures, patterns) with position:absolute MUST have "
            "pointer-events:none or they will block button clicks."
        )

    # Check for common overlay patterns without pointer-events:none
    overlay_patterns = [
        (r'(?:class|style)\s*=\s*["\'][^"\']*(?:overlay|fog|vignette|gradient-overlay|texture|grain|noise)[^"\']*["\']', 'overlay/texture'),
        (r'(?:class|style)\s*=\s*["\'][^"\']*(?:before|after)[^"\']*position\s*:\s*absolute[^"\']*["\']', 'pseudo-element overlay'),
    ]
    for pattern, name in overlay_patterns:
        matches = re.findall(pattern, html, re.IGNORECASE)
        for match in matches:
            if 'pointer-events' not in match.lower():
                warnings.append(
                    f"Found {name} element without pointer-events:none. "
                    "This may block button clicks. Add pointer-events:none to decorative overlays."
                )
                break  # One warning per pattern type

    # Check for ::before/::after pseudo-elements with position:absolute in CSS
    pseudo_overlays = re.findall(
        r'::(?:before|after)\s*\{[^}]*position\s*:\s*absolute[^}]*\}',
        all_css,
        re.IGNORECASE
    )
    for pseudo in pseudo_overlays:
        if 'pointer-events' not in pseudo.lower():
            warnings.append(
                "CSS ::before/::after pseudo-element with position:absolute found without "
                "pointer-events:none. Add pointer-events:none to prevent blocking button clicks."
            )
            break  # One warning is enough

    # Check for clip-path on containers that might contain buttons
    if re.search(r'clip-path\s*:', all_css + html, re.IGNORECASE):
        # Only warn if there are also buttons
        if has_buttons:
            warnings.append(
                "clip-path detected alongside buttons. clip-path clips the clickable hit area "
                "and can prevent button clicks. Avoid clip-path on containers with interactive children."
            )

    return issues, warnings


def _check_image_src_switching(html: str) -> Tuple[List[str], List[str]]:
    """
    Check for broken image-switching logic in tab/button JS.

    The #1 pattern: Gemini generates tab-switching code that changes img.alt
    (or img.setAttribute('alt', ...)) but COMMENTS OUT or OMITS img.src assignment.
    The images are correctly stored in JS data arrays, but never applied.
    """
    issues = []
    warnings = []

    script_pattern = r'<script[^>]*>(.*?)</script>'
    scripts = re.findall(script_pattern, html, re.DOTALL | re.IGNORECASE)

    for script in scripts:
        if not script.strip():
            continue

        # --- Check 1: Commented-out img.src assignments ---
        # Matches patterns like:
        #   // img.src = images[type];
        #   // imgEl.src = data.image;
        #   /* mainImage.src = items[i].image; */
        commented_src = re.findall(
            r'(?://|/\*)\s*\w*\.src\s*=\s*[^;\n]+',
            script
        )
        if commented_src:
            issues.append(
                f"Found {len(commented_src)} commented-out img.src assignment(s). "
                "Image switching code is DISABLED — images won't change when tabs/buttons are clicked. "
                "UNCOMMENT the .src assignment: img.src = data.image;"
            )

        # --- Check 2: .alt set without .src in the same function ---
        # Find function bodies (named functions and arrows)
        func_pattern = r'(?:function\s+\w+\s*\([^)]*\)|(?:const|let|var)\s+\w+\s*=\s*(?:\([^)]*\)|[^=])\s*=>)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        functions = re.findall(func_pattern, script, re.DOTALL)
        # Also check DOMContentLoaded / event listener callbacks
        callback_pattern = r'(?:addEventListener|onclick)\s*[=(]\s*(?:function\s*\([^)]*\)|[^{]*=>)\s*\{([^{}]*(?:\{[^{}]*\}[^{}]*)*)\}'
        functions.extend(re.findall(callback_pattern, script, re.DOTALL))

        for func_body in functions:
            # Look for .alt = (setting alt text on an element)
            sets_alt = bool(re.search(r'\.\s*alt\s*=\s*(?!.*\.src\s*=)', func_body))
            sets_src = bool(re.search(r'(?<!//\s)(?<!/\*\s)\.\s*src\s*=', func_body))

            if not sets_alt:
                continue

            # Has alt assignment but no uncommented src assignment
            if not sets_src:
                # Check if this function also references image-like data
                has_image_data = bool(re.search(
                    r'\b(?:image|img|src|photo|picture|thumbnail)\b',
                    func_body,
                    re.IGNORECASE
                ))
                if has_image_data:
                    issues.append(
                        "A function sets img.alt but never sets img.src. "
                        "Images won't actually change — only the alt text updates. "
                        "Add: img.src = data.image; alongside every img.alt assignment."
                    )
                    break  # One issue per script block is enough

        # --- Check 3: "In a real environment" comments near image code ---
        # Gemini sometimes writes: "In a real environment, the src would be..."
        real_env_pattern = re.search(
            r'(?:real\s+environment|production|actual\s+app|real\s+app)[^.]*(?:src|image|url)',
            script,
            re.IGNORECASE
        )
        if real_env_pattern:
            issues.append(
                "Code contains a comment suggesting image switching is 'for a real environment'. "
                "This IS the real environment — img.src MUST be set. Remove the comment and "
                "uncomment/add the img.src = data.image assignment."
            )

        # --- Check 4: Placeholder service URLs in JS code ---
        # Gemini uses via.placeholder.com, placehold.co as "fallback" in JS assignments
        placeholder_svc_in_js = re.search(
            r'(?:via\.placeholder\.com|placehold\.co|dummyimage\.com)',
            script,
            re.IGNORECASE
        )
        if placeholder_svc_in_js:
            issues.append(
                "JavaScript uses placeholder service URLs (via.placeholder.com, placehold.co). "
                "Use data.image or the actual image property from the data array instead. "
                "NEVER use placeholder URLs — they show broken images."
            )

        # --- Check 5: .src = placeholder URL while .alt = data reference (inverted) ---
        # Pattern: img.src = `via.placeholder.com/...`; img.alt = data.image;
        inverted_pattern = re.search(
            r'\.src\s*=\s*[`"\']https?://(?:via\.placeholder|placehold\.co)',
            script,
            re.IGNORECASE
        )
        if inverted_pattern:
            issues.append(
                "img.src is set to a placeholder URL while the real image URL is likely in "
                "a data property. Use: img.src = data.image; (the actual data value, not a placeholder)."
            )

    return issues, warnings


def _check_zero_images(html: str) -> List[str]:
    """Check if a slide with card/container layouts has zero images.

    Flags slides that use cards, grids, or panels but don't include
    any images in them. Pure diagram/chart slides without containers
    are fine without images.
    """
    warnings = []

    # Count <img> tags (exclude logos)
    img_tags = re.findall(r'<img\b[^>]*>', html, re.IGNORECASE)
    content_imgs = 0
    for tag in img_tags:
        tag_lower = tag.lower()
        if 'logo' in tag_lower and ('max-height:40' in tag_lower or 'max-height: 40' in tag_lower):
            continue
        content_imgs += 1

    bg_imgs = len(re.findall(r'background-image\s*:', html, re.IGNORECASE))

    if content_imgs > 0 or bg_imgs > 0:
        return warnings  # Has images, all good

    # Only warn if the slide has card-like containers that should have images
    has_cards = bool(re.search(
        r'(?:display\s*:\s*(?:grid|flex)|class\s*=\s*["\'][^"\']*(?:card|grid|panel|tile))',
        html,
        re.IGNORECASE,
    ))
    has_data_arrays = bool(re.search(
        r'\[\s*\{[^}]*(?:title|name|label)\s*:',
        html,
        re.IGNORECASE,
    ))

    if has_cards or has_data_arrays:
        warnings.append(
            "Slide has cards/containers but ZERO images. Each card, panel, or "
            "grid item should have its own image. Add image properties to JS data "
            "arrays and <img> tags to card templates."
        )

    return warnings


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
