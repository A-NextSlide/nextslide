"""HTML manipulation utilities for CustomComponent editing.

These are shared helper functions used by multiple tools for:
- Cleaning frontend-injected scripts
- Applying theme colors/fonts to CSS
"""

import re
import logging
from typing import Dict, Any, Optional, Tuple, List

logger = logging.getLogger(__name__)


_GENERIC_FONTS = {
    "inherit",
    "initial",
    "unset",
    "sans-serif",
    "serif",
    "monospace",
    "system-ui",
    "ui-sans-serif",
    "ui-serif",
    "ui-monospace",
}


def _normalize_css_var_name(name: str) -> str:
    return (name or "").strip().lower().replace("-", "_")


def _clean_color_value(value: str) -> Optional[str]:
    """Keep only concrete color values; ignore unresolved vars."""
    v = (value or "").strip().strip('"').strip("'")
    if not v or "var(" in v:
        return None
    return v


def _clean_font_value(value: str) -> Optional[str]:
    """Extract primary font family from CSS font-family-like values."""
    if not value:
        return None
    v = value.strip().strip('"').strip("'")
    if not v or "var(" in v:
        return None
    primary = v.split(",")[0].strip().strip('"').strip("'")
    if not primary:
        return None
    if primary.lower() in _GENERIC_FONTS:
        return None
    return primary


def _extract_css_variables(html: str) -> Dict[str, str]:
    """Extract CSS custom properties from the HTML stylesheet content."""
    if not html:
        return {}
    matches = re.findall(
        r'--([a-zA-Z0-9_-]+)\s*:\s*([^;}{]+);',
        html,
        flags=re.IGNORECASE,
    )
    out: Dict[str, str] = {}
    for raw_name, raw_value in matches:
        key = _normalize_css_var_name(raw_name)
        value = raw_value.strip()
        if key and value and key not in out:
            out[key] = value
    return out


def _pick_first_var_value(var_map: Dict[str, str], candidate_names: List[str]) -> Optional[str]:
    for name in candidate_names:
        v = var_map.get(_normalize_css_var_name(name))
        if v:
            return v
    return None


def extract_theme_from_custom_component_html(
    html: str,
    component_props: Optional[Dict[str, Any]] = None,
) -> Tuple[Dict[str, str], Dict[str, Any]]:
    """
    Extract the active theme (colors + typography) from existing CustomComponent HTML.

    Returns:
        (colors, typography)
        colors keys: accent_1, accent_2, accent_3, primary_text, primary_background
        typography keys: heading/body with {family}
    """
    var_map = _extract_css_variables(html)

    colors: Dict[str, str] = {}
    color_candidates = {
        "accent_1": ["accent", "accent_1", "primary", "accent_color"],
        "accent_2": ["secondary", "accent_2", "secondary_color"],
        "accent_3": ["accent_3", "highlight"],
        "primary_text": ["text", "text_color", "primary_text", "foreground"],
        "primary_background": ["bg", "background", "bg_color", "primary_background"],
    }
    for key, names in color_candidates.items():
        raw = _pick_first_var_value(var_map, names)
        cleaned = _clean_color_value(raw or "")
        if cleaned:
            colors[key] = cleaned

    props = component_props if isinstance(component_props, dict) else {}

    heading_font = _clean_font_value(
        str(
            props.get("heroFont")
            or props.get("overrideHeroFont")
            or props.get("headingFont")
            or ""
        )
    )
    body_font = _clean_font_value(
        str(
            props.get("bodyFont")
            or props.get("overrideBodyFont")
            or props.get("fontFamily")
            or ""
        )
    )

    if not heading_font:
        heading_font = _clean_font_value(
            _pick_first_var_value(
                var_map,
                ["font_heading", "font_hero", "heading_font", "ns_hero_font", "hero_font"],
            )
            or ""
        )
    if not body_font:
        body_font = _clean_font_value(
            _pick_first_var_value(
                var_map,
                ["font_body", "font_text", "body_font", "ns_body_font", "font_main"],
            )
            or ""
        )

    # Last-resort fallback from explicit font-family declarations.
    if not heading_font or not body_font:
        seen_fonts: List[str] = []
        for m in re.finditer(r'font-family\s*:\s*([^;}{]+);', html or "", re.IGNORECASE):
            font_name = _clean_font_value(m.group(1))
            if font_name and font_name not in seen_fonts:
                seen_fonts.append(font_name)
            if len(seen_fonts) >= 3:
                break
        if seen_fonts:
            if not heading_font:
                heading_font = seen_fonts[0]
            if not body_font:
                body_font = seen_fonts[1] if len(seen_fonts) > 1 else seen_fonts[0]

    typography: Dict[str, Any] = {}
    if heading_font:
        typography["heading"] = {"family": heading_font}
    if body_font:
        typography["body"] = {"family": body_font}

    return colors, typography


def strip_frontend_editing_scripts(html: str) -> str:
    """
    Remove frontend editing scripts that get injected during live editing.
    These should NOT be saved to the database - they're runtime-only.

    Strips:
    - <!-- NEXTSLIDE EDIT MODE V2 --> markers
    - .ns-image-processing-overlay styles and scripts
    - .ns-placeholder-wrapper styles and scripts
    """
    if not html or not isinstance(html, str):
        return html

    original_len = len(html)
    cleaned = html

    # Remove NEXTSLIDE EDIT MODE markers
    cleaned = cleaned.replace('<!-- NEXTSLIDE EDIT MODE V2 -->', '')

    # Remove ns-image-processing-overlay style+script blocks
    # Pattern: <style>.ns-image-processing-overlay...styles...</style> followed by <script>...overlay code...</script>
    overlay_pattern = re.compile(
        r'<style>\s*\.ns-image-processing-overlay[\s\S]*?</style>\s*'
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-image-processing-overlay[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = overlay_pattern.sub('', cleaned)

    # Remove ns-placeholder-wrapper style+script blocks
    placeholder_pattern = re.compile(
        r'<style>\s*\.ns-placeholder-wrapper[\s\S]*?</style>\s*'
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-placeholder-wrapper[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = placeholder_pattern.sub('', cleaned)

    # Also catch any stray individual blocks that might be duplicated
    # Individual overlay script pattern
    single_overlay_script = re.compile(
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-image-processing-overlay[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = single_overlay_script.sub('', cleaned)

    # Individual placeholder script pattern
    single_placeholder_script = re.compile(
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-placeholder-wrapper[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = single_placeholder_script.sub('', cleaned)

    # Clean up any leftover orphaned style blocks
    orphan_overlay_style = re.compile(
        r'<style>\s*\.ns-image-processing-overlay[\s\S]*?</style>',
        re.IGNORECASE
    )
    cleaned = orphan_overlay_style.sub('', cleaned)

    orphan_placeholder_style = re.compile(
        r'<style>\s*\.ns-placeholder-wrapper[\s\S]*?</style>',
        re.IGNORECASE
    )
    cleaned = orphan_placeholder_style.sub('', cleaned)

    # Strip Tailwind CDN script tag (render-blocking, never needed)
    cleaned = re.sub(
        r'<script[^>]*src=["\'][^"\']*tailwindcss[^"\']*["\'][^>]*>\s*</script>',
        '',
        cleaned,
        flags=re.IGNORECASE
    )

    # Clean up multiple consecutive newlines that might result
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    cleaned = cleaned.strip()

    if len(cleaned) < original_len:
        logger.debug(f"[HTML_UTILS] Stripped frontend scripts: {original_len} -> {len(cleaned)} chars")

    return cleaned


def apply_theme_to_custom_component_html(
    html: str,
    colors: Dict[str, str] = None,
    typography: Dict[str, Any] = None
) -> str:
    """
    Apply theme colors and fonts to CustomComponent HTML.

    This updates CSS custom properties in :root blocks and font-family declarations.
    Safe for "hotswapping" since it's just CSS value replacement.

    Args:
        html: The CustomComponent HTML
        colors: Dict with keys like 'accent_1', 'primary_text', 'primary_background', etc.
        typography: Dict with keys like 'heading', 'body' containing font info

    Returns:
        Updated HTML with theme applied
    """
    if not html or not isinstance(html, str):
        return html

    logger.debug(f"[apply_theme_html] Input typography: {typography}")
    logger.debug(f"[apply_theme_html] Input colors: {colors}")
    logger.debug(f"[apply_theme_html] HTML length: {len(html)}, has :root: {':root' in html}")

    updated = html

    # Apply color updates to CSS custom properties
    if colors:
        # Common CSS variable name mappings
        color_var_mappings = {
            'accent_1': ['--accent', '--accent-1', '--primary', '--accent-color'],
            'accent_2': ['--secondary', '--accent-2', '--secondary-color'],
            'primary_text': ['--text', '--text-color', '--primary-text', '--foreground'],
            'primary_background': ['--bg', '--background', '--bg-color', '--primary-background'],
            'accent_3': ['--accent-3', '--highlight'],
        }

        for color_key, css_vars in color_var_mappings.items():
            color_value = colors.get(color_key)
            if not color_value:
                continue

            for css_var in css_vars:
                # Match CSS variable declaration like: --accent: #007354;
                pattern = rf'({re.escape(css_var)}\s*:\s*)([^;]+)(;)'
                updated = re.sub(pattern, rf'\g<1>{color_value}\g<3>', updated)

    # Apply typography updates
    if typography:
        # Get font families from typography config
        # Support multiple key formats: heading/body (LLM), hero_title/body_text (deck theme)
        heading_font = None
        body_font = None

        # Try heading keys (LLM format)
        if isinstance(typography.get('heading'), dict):
            heading_font = typography['heading'].get('family')
        elif isinstance(typography.get('heading'), str):
            heading_font = typography['heading']
        # Fallback to deck theme format (hero_title/hero_font)
        if not heading_font:
            if isinstance(typography.get('hero_title'), dict):
                heading_font = typography['hero_title'].get('family')
            elif isinstance(typography.get('hero_font'), str):
                heading_font = typography['hero_font']

        # Try body keys (LLM format)
        if isinstance(typography.get('body'), dict):
            body_font = typography['body'].get('family')
        elif isinstance(typography.get('body'), str):
            body_font = typography['body']
        # Fallback to deck theme format (body_text/body_font)
        if not body_font:
            if isinstance(typography.get('body_text'), dict):
                body_font = typography['body_text'].get('family')
            elif isinstance(typography.get('body_font'), str):
                body_font = typography['body_font']

        logger.info(f"[apply_theme_html] Extracted fonts - heading: {heading_font}, body: {body_font}")

        # Log existing fonts in HTML for debugging
        existing_fonts = re.findall(r'font-family\s*:\s*([^;"\'\}]+)', updated, re.IGNORECASE)
        if existing_fonts:
            unique_fonts = list(set(f.strip()[:50] for f in existing_fonts[:20]))
            logger.info(f"[apply_theme_html] Existing fonts in HTML: {unique_fonts}")

        # Update or ADD Google Fonts import
        if heading_font or body_font:
            fonts_to_import = []
            if heading_font:
                fonts_to_import.append(heading_font.replace(' ', '+'))
            if body_font and body_font != heading_font:
                fonts_to_import.append(body_font.replace(' ', '+'))

            if fonts_to_import:
                new_font_import = f'https://fonts.googleapis.com/css2?family={":wght@300;400;500;600;700&family=".join(fonts_to_import)}:wght@300;400;500;600;700&display=swap'

                # Check if Google Fonts import already exists
                if re.search(r'https://fonts\.googleapis\.com/css2\?[^"\'>\s]+', updated):
                    # Replace existing Google Fonts import
                    updated = re.sub(
                        r'https://fonts\.googleapis\.com/css2\?[^"\'>\s]+',
                        new_font_import,
                        updated
                    )
                else:
                    # ADD Google Fonts import - insert after <head> or at start of <style>
                    google_fonts_link = f'<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="{new_font_import}" rel="stylesheet">'

                    # Try to insert after <head>
                    if '<head>' in updated:
                        updated = updated.replace('<head>', f'<head>\n    {google_fonts_link}', 1)
                    elif '<HEAD>' in updated:
                        updated = updated.replace('<HEAD>', f'<HEAD>\n    {google_fonts_link}', 1)
                    # Fallback: insert before first <style>
                    elif '<style>' in updated:
                        updated = updated.replace('<style>', f'{google_fonts_link}\n<style>', 1)
                    elif '<style ' in updated:
                        # Handle <style type="text/css"> etc
                        updated = re.sub(r'(<style\s)', f'{google_fonts_link}\n\\1', updated, count=1)

        # PRIORITY 1: Update CSS variable font declarations in :root (new slides use these)
        # This is the fast path - just updating a single variable changes all usages
        if heading_font:
            # Match --font-heading CSS variable declaration
            # Include all known heading font variable names used in the codebase
            for var_name in ['--font-heading', '--font-hero', '--heading-font', '--ns-hero-font', '--hero-font']:
                pattern = rf'({re.escape(var_name)}\s*:\s*)([^;]+)(;)'
                replacement = rf"\g<1>'{heading_font}', sans-serif\g<3>"
                updated = re.sub(pattern, replacement, updated)

        if body_font:
            # Match --font-body CSS variable declaration
            # Include all known body font variable names used in the codebase
            for var_name in ['--font-body', '--font-text', '--body-font', '--ns-body-font', '--font-main']:
                pattern = rf'({re.escape(var_name)}\s*:\s*)([^;]+)(;)'
                replacement = rf"\g<1>'{body_font}', sans-serif\g<3>"
                updated = re.sub(pattern, replacement, updated)

        # PRIORITY 2: Replace hard-coded font-family declarations by selector type
        # Heading selectors get heading font, body selectors get body font

        if heading_font:
            # Replace fonts in heading selectors (h1-h6, .title, .heading)
            heading_selectors = r'(h[1-6]|\.title|\.heading|\.hero|\.headline)'

            def replace_heading_font(match):
                full_block = match.group(0)
                # Replace font-family declarations in this block (skip var())
                def inner_replace(m):
                    if 'var(' in m.group(2):
                        return m.group(0)
                    return f"{m.group(1)}'{heading_font}', sans-serif{m.group(3)}"
                return re.sub(r'(font-family\s*:\s*)([^;]+)(;)', inner_replace, full_block)

            # Match heading selector followed by its rule block
            pattern = rf'({heading_selectors}[^{{]*\{{[^}}]*\}})'
            updated = re.sub(pattern, replace_heading_font, updated, flags=re.IGNORECASE | re.DOTALL)

        if body_font:
            # Replace fonts in body/paragraph selectors
            # Note: Use \b word boundary for 'p' to avoid matching inside words like 'Poppins'
            body_selectors = r'(body|html|\bp\b|\.body|\.text|\.content|\.description|\.paragraph)'

            def replace_body_font(match):
                full_block = match.group(0)
                def inner_replace(m):
                    if 'var(' in m.group(2):
                        return m.group(0)
                    return f"{m.group(1)}'{body_font}', sans-serif{m.group(3)}"
                return re.sub(r'(font-family\s*:\s*)([^;]+)(;)', inner_replace, full_block)

            pattern = rf'({body_selectors}[^{{]*\{{[^}}]*\}})'
            updated = re.sub(pattern, replace_body_font, updated, flags=re.IGNORECASE | re.DOTALL)

        # PRIORITY 3: Replace any remaining hard-coded fonts with body font
        # Skip fonts that are already set to our target fonts (don't overwrite heading fonts)
        if body_font:
            def replace_remaining_css(match):
                """Replace font-family in CSS rules (font-family: VALUE;)"""
                font_value = match.group(2)
                # Skip if it's a CSS variable
                if 'var(' in font_value:
                    return match.group(0)
                # Skip if it's already set to our heading or body font
                if heading_font and heading_font.lower() in font_value.lower():
                    return match.group(0)
                if body_font.lower() in font_value.lower():
                    return match.group(0)
                return f"{match.group(1)}'{body_font}', sans-serif;"

            # Match font-family in CSS rules: font-family: VALUE;
            # VALUE can contain quotes and commas, ends with semicolon
            css_pattern = r'(font-family\s*:\s*)([^;]+)(;)'
            updated = re.sub(css_pattern, replace_remaining_css, updated, flags=re.IGNORECASE)

            def replace_remaining_inline(match):
                """Replace font-family in inline styles (style="font-family: VALUE")"""
                font_value = match.group(2)
                quote = match.group(3)
                # Skip if it's a CSS variable
                if 'var(' in font_value:
                    return match.group(0)
                # Skip if it's already set to our heading or body font
                if heading_font and heading_font.lower() in font_value.lower():
                    return match.group(0)
                if body_font.lower() in font_value.lower():
                    return match.group(0)
                return f"{match.group(1)}'{body_font}', sans-serif{quote}"

            # Match font-family at END of inline style (font-family: VALUE" or VALUE')
            # Use negative lookbehind to avoid matching CSS rules
            # Pattern: font-family: VALUE followed by closing quote (not semicolon)
            inline_pattern = r'(font-family\s*:\s*)([^;"]+)(["\'])'
            updated = re.sub(inline_pattern, replace_remaining_inline, updated, flags=re.IGNORECASE)

        # PRIORITY 4: Handle inline styles where font-family is followed by another property
        # e.g., style="font-family: 'DM Sans', sans-serif; color: red"
        # The pattern above handles this, but also handle the CSS variable case in inline styles
        if heading_font or body_font:
            # Replace var() calls with actual fonts if the variables aren't defined
            target_font = body_font or heading_font
            if target_font:
                # Replace var(--font-*) or var(--ns-*-font) that might not be resolving
                def replace_var_fallback(match):
                    var_name = match.group(1)
                    if 'heading' in var_name.lower() or 'hero' in var_name.lower():
                        return f"'{heading_font or target_font}', sans-serif"
                    return f"'{target_font}', sans-serif"

                # Only replace if there's no :root definition (vars won't resolve)
                if ':root' not in updated or ('--font-' not in updated and '--ns-' not in updated):
                    # Match various font variable patterns: --font-*, --ns-*-font, --*-font
                    updated = re.sub(
                        r'var\s*\(\s*(--(?:font-[a-zA-Z-]+|ns-[a-zA-Z]+-font|[a-zA-Z]+-font))\s*\)',
                        replace_var_fallback,
                        updated,
                        flags=re.IGNORECASE
                    )

    return updated
