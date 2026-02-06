"""HTML processing helpers for CustomComponent generation."""

from typing import Dict, Any, Optional, Tuple
import re

from setup_logging_optimized import get_logger
from services.image import (
    is_placeholder_src as unified_is_placeholder_src,
    BUCKET_DOMAINS,
    GENERIC_VAR_NAMES as GENERIC_JS_VARS,
)

logger = get_logger(__name__)


def _iter_js_objects(text: str):
    objects = []
    depth = 0
    start = None
    in_string = None
    escape = False
    idx = 0
    length = len(text)

    while idx < length:
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_string:
                in_string = None
        else:
            if ch in ("'", '"'):
                in_string = ch
            elif ch == "{":
                if depth == 0:
                    start = idx
                depth += 1
            elif ch == "}":
                if depth > 0:
                    depth -= 1
                    if depth == 0 and start is not None:
                        objects.append((start, idx + 1, text[start:idx + 1]))
                        start = None
        idx += 1

    return objects


def _object_is_image_like(obj_text: str) -> bool:
    """Check if a JS object should be treated as having image properties.

    Returns True if:
    - The object has no 'type' property (default case)
    - The object has a type related to images (img, image, photo, picture)
    - The object has image-related properties (image, src, img, photo, etc.) regardless of type
    - The object has properties containing 'image' in the name (imageStage, stageImage, etc.)
    """
    # If the object has image-related properties, treat it as image-like regardless of type
    # This handles cases like { type: 'event', image: 'placeholder', imageAlt: '...' }
    # Also match property names CONTAINING 'image' like imageStage, stageImage, backgroundImage
    # Pattern 1: Quoted values like image: "value"
    image_prop_pattern_quoted = r'\b\w*(?:image|img|photo|picture|thumbnail|src)\w*\s*:\s*["\']'
    if re.search(image_prop_pattern_quoted, obj_text, re.IGNORECASE):
        return True

    # Pattern 2: Unquoted placeholder values like image: placeholder
    image_prop_pattern_unquoted = r'\b\w*(?:image|img|photo|picture|thumbnail|src)\w*\s*:\s*(?:placeholder|null|undefined|none)\s*[,}\]]'
    if re.search(image_prop_pattern_unquoted, obj_text, re.IGNORECASE):
        return True

    # Also check for placeholder values directly - if object has 'placeholder' or 'placeholder?q=...' it needs replacement
    # Quoted placeholders
    if re.search(r':\s*["\']placeholder(?:\?[^"\']*)?["\']', obj_text, re.IGNORECASE):
        return True
    # Unquoted placeholders
    if re.search(r':\s*placeholder\s*[,}\]]', obj_text, re.IGNORECASE):
        return True

    # If no type property, assume it could be image-like
    type_match = re.search(r'\btype\s*:\s*([\'"])([^\'"]+)\1', obj_text, re.IGNORECASE)
    if not type_match:
        return True

    # Check if type is explicitly image-related
    type_value = type_match.group(2).strip().lower()
    return type_value in ("img", "image", "photo", "picture")


def _extract_js_object_label(obj_text: str) -> str:
    """Extract a label/alt text from a JS object.

    Looks for common label properties in priority order:
    1. Alt-related properties (thumbAlt, imgAlt, imageAlt, photoAlt, alt)
    2. Standard label properties (title, name, label, heading, description)
    """
    # First priority: explicit alt-related properties (these are search queries)
    alt_fields = ("thumbAlt", "imgAlt", "imageAlt", "photoAlt", "pictureAlt", "bgAlt", "backgroundAlt", "alt")
    for field in alt_fields:
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            value = match.group(2).strip()
            if value and len(value) > 3:
                return value

    # Second priority: standard label properties
    label_fields = ("title", "name", "label", "heading", "description")
    for field in label_fields:
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            value = match.group(2).strip()
            if value and len(value) > 3:
                return value

    return ""


def _is_placeholder_src(value: str) -> bool:
    """Check if a src value is a placeholder. Uses unified service implementation."""
    # Also treat "None" (string) as a placeholder - AI sometimes generates this
    if value and value.strip().lower() == "none":
        return True
    return unified_is_placeholder_src(value)


class CustomComponentHtmlProcessor:
    """Extracts and cleans HTML for CustomComponent rendering."""

    def extract_html(self, response: Any) -> Optional[str]:
        """Extract HTML from the AI response."""
        if isinstance(response, str):
            text = response
        elif isinstance(response, dict):
            text = response.get('content', str(response))
        else:
            text = str(response)

        if self._is_low_quality_output(text):
            return None

        html_content = None

        html_match = re.search(
            r'<!DOCTYPE html>[\s\S]*?</html>',
            text,
            re.IGNORECASE
        )
        if html_match:
            html_content = html_match.group(0)

        if not html_content:
            html_match = re.search(
                r'<html[\s\S]*?</html>',
                text,
                re.IGNORECASE
            )
            if html_match:
                html_content = f"<!DOCTYPE html>\n{html_match.group(0)}"

        if not html_content and ('```html' in text or '```HTML' in text):
            code_match = re.search(r'```(?:html|HTML)?\s*([\s\S]*?)```', text)
            if code_match:
                content = code_match.group(1).strip()
                if '<html' in content.lower():
                    if not content.lower().startswith('<!doctype'):
                        content = f"<!DOCTYPE html>\n{content}"
                    html_content = content

        if not html_content and ('<body' in text.lower() or '<div' in text.lower()):
            html_content = self._wrap_in_html(text)

        if not html_content:
            logger.warning("[CUSTOM_COMPONENT] Could not extract valid HTML from response")
            return None

        html_content = self._format_html(html_content)
        return html_content

    def inject_prefetched_images(self, html: str, prefetched_images: Dict[str, str]) -> str:
        """Replace placeholder/variable image sources with real URLs.

        Alt-text-aware: matches each placeholder to its correct image by
        comparing alt text / JS object labels against the search queries that
        produced each URL.  Falls back to sequential cycling when no query match.
        """
        if not html:
            return html

        prefetched_images = prefetched_images or {}

        def is_url_key(k: str) -> bool:
            """Check if key is a URL key (not metadata like _query, _width, _height)."""
            return not (k.endswith('_query') or k.endswith('_width') or k.endswith('_height'))

        def is_url_value(v) -> bool:
            """Check if value is a URL string."""
            return isinstance(v, str) and v.startswith('http')

        # Build list of all available image URLs (excluding query/dimension metadata)
        # Keep logos separate for logo-specific properties
        logo_urls = {k: v for k, v in prefetched_images.items()
                     if is_url_key(k) and is_url_value(v) and 'logo' in k.lower()}
        image_urls = [v for k, v in prefetched_images.items()
                      if is_url_key(k) and is_url_value(v) and 'logo' not in k.lower()]
        all_urls = [v for k, v in prefetched_images.items()
                    if is_url_key(k) and is_url_value(v)]

        if not all_urls:
            logger.warning("[IMAGE_INJECT] No prefetched images available")
            return html

        logger.info(f"[IMAGE_INJECT] Starting injection with {len(image_urls)} images, {len(logo_urls)} logos")

        # Build query-to-URL mapping for alt-text-aware injection
        # This ensures each image goes to its correct placeholder based on search query
        query_to_url: Dict[str, str] = {}
        for key, value in prefetched_images.items():
            if key.endswith('_query') and isinstance(value, str):
                url_key = key[:-6]  # Remove '_query' suffix
                url = prefetched_images.get(url_key)
                if url and isinstance(url, str) and url.startswith('http'):
                    query_to_url[value.lower().strip()] = url

        used_matched_urls: set = set()

        def find_url_for_query(text: str) -> str:
            """Find the correct image URL for given alt/label text.

            Exact matches always return the correct URL (even if already used by
            another phase), so that both JS-object and <img>-tag slots with the
            same alt text get the image that was searched for that text.

            Fuzzy matches (substring / token) still respect used_matched_urls to
            avoid stealing a URL that belongs to a different alt text.
            """
            if not text:
                return ""
            text_lower = text.lower().strip()
            if not text_lower:
                return ""

            # Exact match — always honour, even if the URL was already used.
            # This ensures Phase 2 <img> tags get the same correct image as
            # Phase 1 JS objects when they share the same alt text.
            if text_lower in query_to_url:
                url = query_to_url[text_lower]
                used_matched_urls.add(url)
                logger.info("[IMAGE_INJECT] Matched by query: '%s' -> %s", text[:40], url[:50])
                return url

            # Substring match (fuzzy — only claim unused URLs)
            for query, url in query_to_url.items():
                if url in used_matched_urls:
                    continue
                if query in text_lower or text_lower in query:
                    used_matched_urls.add(url)
                    logger.info("[IMAGE_INJECT] Matched by substring: '%s' ~ '%s'", text[:40], query[:40])
                    return url

            # Token overlap (best match with at least 2 common words, unused only)
            text_words = set(re.findall(r'[a-z0-9]+', text_lower))
            best_url = ""
            best_score = 0
            for query, url in query_to_url.items():
                if url in used_matched_urls:
                    continue
                query_words = set(re.findall(r'[a-z0-9]+', query))
                if not query_words:
                    continue
                overlap = len(text_words & query_words)
                threshold = max(2, len(query_words) // 2)
                if overlap >= threshold and overlap > best_score:
                    best_url = url
                    best_score = overlap

            if best_url:
                used_matched_urls.add(best_url)
                logger.info("[IMAGE_INJECT] Matched by tokens (%d words): '%s'", best_score, text[:40])
                return best_url

            return ""

        if query_to_url:
            logger.info("[IMAGE_INJECT] Query-to-URL mappings: %d", len(query_to_url))

        result = html
        images_injected = 0
        image_index = 0

        def is_our_url(url: str) -> bool:
            return any(domain in url.lower() for domain in BUCKET_DOMAINS)

        def get_next_image() -> str:
            """Get the next image URL, cycling through available images."""
            nonlocal image_index, images_injected
            if not image_urls:
                return all_urls[0] if all_urls else ""
            url = image_urls[image_index % len(image_urls)]
            image_index += 1
            images_injected += 1
            return url

        # PHASE 1: Replace JS object image properties (for dynamic content like tabs)
        def _replace_js_objects(script_content: str) -> str:
            nonlocal images_injected, image_index
            objects = _iter_js_objects(script_content)
            if not objects:
                return script_content

            parts = []
            cursor = 0

            # Pattern for image SOURCE properties (excluding alt/label properties)
            # Pattern 1: Quoted values — named image-like properties
            src_pattern_quoted = r'(\b\w*(?:src|image|img|photo|picture|thumbnail|background|url|link|href|icon|avatar|cover|poster|banner|media|visual)(?!Alt|Label|Text|Title|Name|Description|Caption)\w*\s*:\s*)(["\'])([^"\']*)\2'
            # Pattern 2: Unquoted placeholder values — named image-like properties
            src_pattern_unquoted = r'(\b\w*(?:src|image|img|photo|picture|thumbnail|background|url|link|href|icon|avatar|cover|poster|banner|media|visual)(?!Alt|Label|Text|Title|Name|Description|Caption)\w*\s*:\s*)(placeholder|null|undefined|none)(\s*[,}\]])'
            # Pattern 3: ANY property with a placeholder URL value (catch-all for unknown prop names)
            placeholder_url_pattern = r'(\b\w+\s*:\s*)(["\'])((?:https?://)?(?:via\.)?placeholder(?:\.\w+)*(?:/[^"\']*)?)\2'

            for start, end, obj_text in objects:
                if not _object_is_image_like(obj_text):
                    parts.append(script_content[cursor:end])
                    cursor = end
                    continue

                # Build per-position label map from inner objects so that
                # each array item gets its OWN alt-text label instead of all
                # sharing the first one found in a wrapping function body.
                obj_label = _extract_js_object_label(obj_text)
                inner_label_map = []
                if len(obj_text) > 50:
                    def _collect_labels(text, offset, depth):
                        if depth > 3 or len(text) < 10:
                            return
                        inner = _iter_js_objects(text[1:-1])
                        for istart, iend, itext in inner:
                            adj_s = istart + offset + 1
                            adj_e = iend + offset + 1
                            if _object_is_image_like(itext):
                                ilabel = _extract_js_object_label(itext)
                                if ilabel:
                                    inner_label_map.append((adj_s, adj_e, ilabel))
                            _collect_labels(itext, adj_s, depth + 1)
                    _collect_labels(obj_text, 0, 0)
                    # Sort smallest first so innermost objects match first
                    inner_label_map.sort(key=lambda x: x[1] - x[0])
                    if inner_label_map:
                        logger.info("[IMAGE_INJECT] Found %d inner objects with labels in wrapped script", len(inner_label_map))

                def _label_for_pos(pos, _inner=inner_label_map, _fallback=obj_label):
                    """Find the label from the innermost object enclosing pos."""
                    for s, e, lbl in _inner:
                        if s <= pos < e:
                            return lbl
                    return _fallback

                def replace_obj_src_quoted(match, _lfp=_label_for_pos):
                    nonlocal images_injected
                    prefix = match.group(1)
                    quote = match.group(2)
                    current_src = match.group(3)

                    # Skip if already our bucket URL
                    if current_src.startswith('http') and is_our_url(current_src):
                        return match.group(0)
                    if current_src.startswith('data:') or current_src.startswith('blob:'):
                        return match.group(0)

                    # Replace placeholder OR external URL (AI sometimes generates
                    # real Unsplash/Pexels URLs instead of 'placeholder')
                    needs_replace = (
                        _is_placeholder_src(current_src) or
                        (current_src.startswith('http') and not is_our_url(current_src))
                    )
                    if needs_replace:
                        _label = _lfp(match.start())
                        url = find_url_for_query(_label) if _label else ""
                        if not url:
                            url = get_next_image()
                        if url:
                            images_injected += 1
                            logger.info(f"[IMAGE_INJECT] JS object: '{current_src[:30]}' -> {url[:50]}... (label: '{_label[:30] if _label else ''}')")
                            return f"{prefix}{quote}{url}{quote}"
                    return match.group(0)

                def replace_obj_src_unquoted(match, _lfp=_label_for_pos):
                    nonlocal images_injected
                    prefix = match.group(1)
                    current_src = match.group(2)
                    suffix = match.group(3)

                    # Try alt-aware matching first
                    _label = _lfp(match.start())
                    url = find_url_for_query(_label) if _label else ""
                    if not url:
                        url = get_next_image()
                    if url:
                        images_injected += 1
                        logger.info(f"[IMAGE_INJECT] JS object (unquoted): '{current_src}' -> {url[:50]}... (label: '{_label[:30] if _label else ''}')")
                        return f"{prefix}'{url}'{suffix}"
                    return match.group(0)

                def replace_placeholder_url(match, _lfp=_label_for_pos):
                    """Catch-all: replace any property whose value is a placeholder URL."""
                    nonlocal images_injected
                    prefix = match.group(1)
                    quote = match.group(2)
                    current_src = match.group(3)

                    # Skip alt/label/text/title/name/description/caption properties
                    prop_name = prefix.strip().rstrip(':').strip().lower()
                    skip_props = ('alt', 'label', 'text', 'title', 'name', 'description',
                                  'caption', 'type', 'id', 'class', 'style', 'key',
                                  'thumbalt', 'imgalt', 'imagealt', 'photoalt', 'bgalt')
                    if prop_name in skip_props:
                        return match.group(0)

                    _label = _lfp(match.start())
                    url = find_url_for_query(_label) if _label else ""
                    if not url:
                        url = get_next_image()
                    if url:
                        images_injected += 1
                        logger.info(f"[IMAGE_INJECT] JS placeholder URL: '{current_src[:30]}' -> {url[:50]}... (prop: '{prop_name}', label: '{_label[:30] if _label else ''}')")
                        return f"{prefix}{quote}{url}{quote}"
                    return match.group(0)

                # First replace named image properties, then catch-all placeholder URLs
                new_obj = re.sub(src_pattern_quoted, replace_obj_src_quoted, obj_text, flags=re.IGNORECASE)
                new_obj = re.sub(src_pattern_unquoted, replace_obj_src_unquoted, new_obj, flags=re.IGNORECASE)
                # Catch-all: replace any remaining placeholder URLs missed by named patterns
                new_obj = re.sub(placeholder_url_pattern, replace_placeholder_url, new_obj, flags=re.IGNORECASE)
                parts.append(script_content[cursor:start])
                parts.append(new_obj)
                cursor = end

            parts.append(script_content[cursor:])
            return "".join(parts)

        # Process all script blocks
        script_pattern = re.compile(r'(<script[^>]*>)([\s\S]*?)(</script>)', re.IGNORECASE)

        def replace_script_block(match):
            start_tag, script_content, end_tag = match.groups()
            new_content = _replace_js_objects(script_content)
            return f"{start_tag}{new_content}{end_tag}"

        result = re.sub(script_pattern, replace_script_block, result)

        # PHASE 2: Replace all placeholder img src attributes in HTML
        # This is the simplified approach - find any placeholder src and replace it
        def replace_any_placeholder_img(match):
            nonlocal images_injected
            full_tag = match.group(0)

            # Skip if already has our URL
            if is_our_url(full_tag):
                return full_tag

            # Extract current src
            src_match = re.search(r'src=(["\'])([^"\']*)\1', full_tag, re.IGNORECASE)
            if not src_match:
                src_match = re.search(r'src=([^\s>]+)', full_tag, re.IGNORECASE)

            if src_match:
                current_src = src_match.group(2) if len(src_match.groups()) > 1 else src_match.group(1)
                # Skip valid URLs (already has real image)
                if current_src.startswith('http') and not 'placeholder' in current_src.lower():
                    if is_our_url(current_src):
                        return full_tag
                    # External URL - replace it
                if current_src.startswith('data:') or current_src.startswith('blob:'):
                    return full_tag
                # Skip template variables like ${item.image} - these are handled by JS
                if '${' in current_src and '.' in current_src:
                    return full_tag

            # This is a placeholder - try alt-text-aware matching first
            alt_match = re.search(r'alt=["\']([^"\']+)["\']', full_tag, re.IGNORECASE)
            alt_text = alt_match.group(1).strip() if alt_match else ""
            # Skip template variable alt text
            if alt_text and ('${' in alt_text or alt_text.startswith('{')):
                alt_text = ""
            url = find_url_for_query(alt_text) if alt_text else ""
            if not url:
                url = get_next_image()
            if not url:
                return full_tag

            # Replace the src attribute
            new_tag = re.sub(r'src=(["\'])[^"\']*\1', f'src="{url}"', full_tag, count=1, flags=re.IGNORECASE)
            if new_tag == full_tag:
                # Try unquoted src
                new_tag = re.sub(r'src=[^\s>]+', f'src="{url}"', full_tag, count=1, flags=re.IGNORECASE)
            if new_tag == full_tag:
                # No src at all - add one
                new_tag = full_tag.replace('<img', f'<img src="{url}"', 1)

            if new_tag != full_tag:
                images_injected += 1
                logger.info(f"[IMAGE_INJECT] Replaced placeholder img with {url[:50]}...")
            return new_tag

        # Match all img tags that need replacement
        # Criteria: placeholder, empty, local file, template var, or external URL
        img_pattern = r'<img[^>]*>'

        def should_replace_img(match):
            tag = match.group(0)
            # Already ours - skip
            if is_our_url(tag):
                return tag
            # Check src
            src_match = re.search(r'src=(["\'])([^"\']*)\1', tag, re.IGNORECASE)
            if not src_match:
                src_match = re.search(r'src=([^\s>]+)', tag, re.IGNORECASE)

            if src_match:
                src = src_match.group(2) if len(src_match.groups()) > 1 else src_match.group(1).strip('"\'')
                # Data/blob URLs - keep
                if src.startswith('data:') or src.startswith('blob:'):
                    return tag
                # Template variables with dots (e.g., ${item.image}) - keep, JS handles these
                if '${' in src and '.' in src:
                    return tag
                # Our URLs - keep
                if src.startswith('http') and is_our_url(src):
                    return tag
                # External URLs - replace
                if src.startswith('http') and not is_our_url(src):
                    return replace_any_placeholder_img(match)
                # Placeholder or local file - replace
                if _is_placeholder_src(src):
                    return replace_any_placeholder_img(match)
                # Simple template var like ${image} - replace
                if '${' in src:
                    return replace_any_placeholder_img(match)
                # Local file reference - replace
                if re.match(r'^[a-zA-Z0-9_\-\.]+\.(jpg|jpeg|png|gif|webp|svg|avif)$', src, re.IGNORECASE):
                    return replace_any_placeholder_img(match)
            else:
                # No src at all - add one
                return replace_any_placeholder_img(match)

            return tag

        result = re.sub(img_pattern, should_replace_img, result, flags=re.IGNORECASE)

        # PHASE 3: Replace background-image URLs
        def replace_bg_url(match):
            before = match.group(1)
            url_value = match.group(2)
            after = match.group(3)

            # Skip valid URLs
            if is_our_url(url_value):
                return match.group(0)
            if url_value.startswith('data:') or url_value.startswith('linear') or url_value.startswith('radial'):
                return match.group(0)

            # Replace placeholder or external URL
            new_url = get_next_image()
            if new_url:
                logger.info(f"[IMAGE_INJECT] Replaced background-image with {new_url[:50]}...")
                return f'{before}{new_url}{after}'
            return match.group(0)

        # CSS background-image
        bg_pattern = r'(background-image:\s*url\([\'"]?)([^\'")\s]+)([\'"]?\))'
        result = re.sub(bg_pattern, replace_bg_url, result, flags=re.IGNORECASE)

        # Inline style background-image
        inline_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'"]?)([^\'")\s]+)([\'"]?\)[^"\']*["\'])'
        result = re.sub(inline_bg_pattern, replace_bg_url, result, flags=re.IGNORECASE)

        logger.info(f"[IMAGE_INJECT] Finished with {images_injected} injections")
        return result

    def _format_javascript(self, code: str) -> str:
        if not code:
            return code
        formatted = code
        formatted = re.sub(r',(?=\s*[\'\"])', ',\n', formatted)
        formatted = re.sub(r'function\s+(\w+)\s*\(', r'function \1(', formatted)
        formatted = re.sub(r'\)\s*\{', ') {', formatted)
        formatted = re.sub(r'=>\s*\{', '=> {', formatted)
        formatted = re.sub(r'return\s+', 'return ', formatted)
        return formatted

    def _format_html(self, html: str) -> str:
        if not html:
            return html
        html = re.sub(r'\r\n', '\n', html)
        html = re.sub(r'\n{3,}', '\n\n', html)
        html = re.sub(r'(<!DOCTYPE html>)(<html)', r'\1\n\2', html, flags=re.IGNORECASE)
        html = self._inject_base_styles(html)
        html = self._prettify_css_in_html(html)
        return html

    def _inject_base_styles(self, html: str) -> str:
        if not html:
            return html

        # ALWAYS inject height constraint styles - this is critical for ensuring
        # content doesn't exceed the 1080px slide height. The !important flags
        # override any conflicting styles from AI-generated code.
        base_style = (
            "<style id='slide-constraints'>"
            "html, body { margin: 0 !important; padding: 0 !important; "
            "width: 1920px !important; height: 1080px !important; "
            "max-height: 1080px !important; overflow: hidden !important; }"
            "*, *::before, *::after { box-sizing: border-box; }"
            "</style>"
        )

        # Check if we already injected our constraint styles
        if "id='slide-constraints'" in html:
            return html

        if re.search(r'<head[^>]*>', html, re.IGNORECASE):
            return re.sub(r'(<head[^>]*>)', r'\1\n' + base_style, html, count=1, flags=re.IGNORECASE)
        if re.search(r'<html[^>]*>', html, re.IGNORECASE):
            return re.sub(r'(<html[^>]*>)', r'\1\n<head>' + base_style + '</head>', html, count=1, flags=re.IGNORECASE)
        return base_style + html

    def _prettify_css_in_html(self, html: str) -> str:
        if '<style' not in html:
            return html
        try:
            style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html, re.IGNORECASE)
            for style in style_blocks:
                # Extract @import statements first (they contain ; inside URLs that shouldn't be split)
                # Match @import url('...') or @import url("...") including content with semicolons
                imports = re.findall(r'@import\s+url\s*\(\s*[\'"][^\'"]*[\'"]\s*\)\s*;', style)
                # Replace imports with placeholders
                temp_style = style
                for i, imp in enumerate(imports):
                    temp_style = temp_style.replace(imp, f'__IMPORT_{i}__')
                # Prettify the rest
                pretty = temp_style.replace(';', ';\n').replace('{', '{\n').replace('}', '\n}\n')
                # Restore imports (without adding newlines inside them)
                for i, imp in enumerate(imports):
                    pretty = pretty.replace(f'__IMPORT_{i}__', imp + '\n')
                html = html.replace(style, pretty)
        except Exception:
            pass
        return html

    def _is_low_quality_output(self, text: str) -> bool:
        if not text:
            return True
        lowered = text.lower()
        return '<html' not in lowered and '<div' not in lowered

    def _wrap_in_html(self, content: str) -> str:
        return f"<!DOCTYPE html>\n<html>\n<head>\n<meta charset=\"utf-8\">\n</head>\n<body>\n{content}\n</body>\n</html>"
