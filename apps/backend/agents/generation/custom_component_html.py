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
    type_match = re.search(r'\btype\s*:\s*([\'"])([^\'"]+)\1', obj_text, re.IGNORECASE)
    if not type_match:
        return True
    type_value = type_match.group(2).strip().lower()
    return type_value in ("img", "image", "photo", "picture")


def _extract_js_object_label(obj_text: str) -> str:
    for field in ("alt", "title", "name", "label", "heading"):
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(2).strip()
    return ""


def _is_placeholder_src(value: str) -> bool:
    """Check if a src value is a placeholder. Uses unified service implementation."""
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
        """Replace placeholder/variable image sources with real URLs."""
        if not html:
            return html

        prefetched_images = prefetched_images or {}

        # Build list of non-logo images for fallback use (logos should only be used for logo props)
        image_urls = [
            v for k, v in prefetched_images.items()
            if not k.endswith('_query') and v.startswith('http') and 'logo' not in k.lower()
        ]

        # Check if we have ANY prefetched images (including logos)
        all_urls = [v for k, v in prefetched_images.items() if not k.endswith('_query') and v.startswith('http')]

        if not all_urls:
            # Check if we have placeholder images that need replacement
            has_placeholders = (
                'src="placeholder"' in html.lower() or
                "src='placeholder'" in html.lower() or
                'src=""' in html or
                "src=''" in html
            )

            if has_placeholders:
                logger.warning("[IMAGE_INJECT] No prefetched images but found placeholders - attempting inline search")
                # Extract alt texts from placeholder images for searching
                placeholder_alts = []
                for match in re.finditer(r'<img[^>]*src=["\']?(?:placeholder)?["\']?[^>]*alt=["\']([^"\']+)["\']', html, re.IGNORECASE):
                    alt_text = match.group(1).strip()
                    if alt_text and len(alt_text) > 3:
                        placeholder_alts.append(alt_text)
                # Also check reverse order (alt before src)
                for match in re.finditer(r'<img[^>]*alt=["\']([^"\']+)["\'][^>]*src=["\']?(?:placeholder)?["\']?', html, re.IGNORECASE):
                    alt_text = match.group(1).strip()
                    if alt_text and len(alt_text) > 3 and alt_text not in placeholder_alts:
                        placeholder_alts.append(alt_text)

                if placeholder_alts:
                    logger.info(f"[IMAGE_INJECT] Found {len(placeholder_alts)} placeholder images with alt text to search")
                    # Try to search for these images synchronously (this is a fallback)
                    try:
                        import asyncio
                        from services.combined_image_service import CombinedImageService

                        async def search_fallback_images():
                            service = CombinedImageService()
                            found_images = []
                            for alt in placeholder_alts[:5]:  # Limit to 5 searches
                                try:
                                    result = await service.search_images(query=alt, per_page=1, page=1)
                                    photos = result.get("photos", []) or result.get("results", [])
                                    if photos:
                                        img_url = (
                                            photos[0].get("url") or
                                            photos[0].get("src", {}).get("large") or
                                            photos[0].get("src", {}).get("original")
                                        )
                                        if img_url:
                                            found_images.append((alt, img_url))
                                            logger.info(f"[IMAGE_INJECT] Fallback search found image for: {alt[:40]}...")
                                except Exception as e:
                                    logger.debug(f"[IMAGE_INJECT] Fallback search failed for '{alt[:30]}': {e}")
                            return found_images

                        # Run the async search
                        loop = asyncio.get_event_loop()
                        if loop.is_running():
                            # We're already in an async context, create a task
                            import concurrent.futures
                            with concurrent.futures.ThreadPoolExecutor() as pool:
                                fallback_images = pool.submit(
                                    lambda: asyncio.run(search_fallback_images())
                                ).result(timeout=30)
                        else:
                            fallback_images = loop.run_until_complete(search_fallback_images())

                        # Replace placeholders with found images
                        if fallback_images:
                            for alt, img_url in fallback_images:
                                # Replace the placeholder src with the found image URL
                                escaped_alt = re.escape(alt)
                                # Pattern for alt before src
                                pattern1 = rf'(<img[^>]*alt=["\']){escaped_alt}(["\'][^>]*src=["\'])(?:placeholder)?(["\'][^>]*>)'
                                html = re.sub(pattern1, rf'\g<1>{alt}\g<2>{img_url}\g<3>', html, flags=re.IGNORECASE)
                                # Pattern for src before alt
                                pattern2 = rf'(<img[^>]*src=["\'])(?:placeholder)?(["\'][^>]*alt=["\']){escaped_alt}(["\'][^>]*>)'
                                html = re.sub(pattern2, rf'\g<1>{img_url}\g<2>{alt}\g<3>', html, flags=re.IGNORECASE)
                            logger.info(f"[IMAGE_INJECT] Fallback replaced {len(fallback_images)} placeholder images")
                    except Exception as e:
                        logger.warning(f"[IMAGE_INJECT] Fallback image search failed: {e}")

            external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', html, flags=re.IGNORECASE)
            if external_matches:
                external_to_replace = [url for url in external_matches if not any(d in url.lower() for d in BUCKET_DOMAINS)]
                if external_to_replace:
                    logger.warning(f"[IMAGE_INJECT] No prefetched images but found {len(external_to_replace)} external URLs")
                    for url in external_to_replace[:3]:
                        logger.warning(f"[IMAGE_INJECT]   - UNREPLACED: {url[:70]}...")
            return html

        # Log what we have for debugging
        logo_urls = [k for k in prefetched_images.keys() if 'logo' in k.lower() and not k.endswith('_query')]
        if logo_urls:
            logger.info(f"[IMAGE_INJECT] Found {len(logo_urls)} logo URLs to inject: {logo_urls}")

        logger.info(f"[IMAGE_INJECT] Starting guaranteed injection with {len(image_urls)} images")

        result = html
        images_injected = 0
        image_index = 0
        has_js_objects = False

        def is_our_url(url: str) -> bool:
            return any(domain in url.lower() for domain in BUCKET_DOMAINS)

        for key, url in prefetched_images.items():
            if not key.startswith('alt_') or not url.startswith('http'):
                continue
            alt_text = prefetched_images.get(f"{key}_query", key[4:].replace('_', ' '))
            if not alt_text:
                continue
            escaped_alt = re.escape(alt_text)

            logger.info("[IMAGE_INJECT] Attempting to match alt text: '%s' (key=%s)", alt_text[:60], key)

            def replace_by_alt_first(match, url=url, alt_text=alt_text):
                nonlocal images_injected
                full_tag = match.group(0)
                if is_our_url(full_tag):
                    logger.debug("[IMAGE_INJECT] Skipping already-replaced tag")
                    return full_tag
                new_tag = re.sub(r'src=["\'][^"\']*["\']', f'src="{url}"', full_tag)
                if new_tag != full_tag:
                    images_injected += 1
                    logger.info("[IMAGE_INJECT] ALT match SUCCESS: '%s' -> %s", alt_text[:40], url[:60])
                return new_tag

            alt_pattern = rf'<img[^>]*alt=["\']({escaped_alt}[^"\']*)["\'][^>]*>'
            old_result = result
            result = re.sub(alt_pattern, replace_by_alt_first, result, flags=re.IGNORECASE)
            if result == old_result:
                logger.debug("[IMAGE_INJECT] No match found for alt pattern: %s...", alt_pattern[:80])

        alt_url_map = {}
        for key, url in prefetched_images.items():
            if not key.startswith('alt_') or not url.startswith('http'):
                continue
            query = prefetched_images.get(f"{key}_query") or key[4:].replace('_', ' ')
            if query:
                alt_url_map[query.strip().lower()] = url

        # Track URLs that have been used to ensure each image is only used once
        used_alt_urls = set()

        def _match_alt_url(alt_text: str) -> Optional[str]:
            if not alt_text:
                return None
            alt_norm = alt_text.strip().lower()
            # Exact match first
            if alt_norm in alt_url_map:
                url = alt_url_map[alt_norm]
                if url not in used_alt_urls:
                    used_alt_urls.add(url)
                    return url
            # Substring match
            for query, url in alt_url_map.items():
                if url in used_alt_urls:
                    continue  # Skip already used URLs
                if query and (query in alt_norm or alt_norm in query):
                    used_alt_urls.add(url)
                    return url
            return None

        def _replace_src_in_object(obj_text: str, url: str) -> Tuple[str, bool]:
            src_pattern = r'(\bsrc\s*:\s*)(?:(["\'])(?P<src>.*?)\2|(?P<src_unquoted>[^,\n}]+))'

            def replace_src(match):
                prefix = match.group(1)
                quote = match.group(2) or '"'
                return f"{prefix}{quote}{url}{quote}"

            new_obj, count = re.subn(src_pattern, replace_src, obj_text, count=1, flags=re.IGNORECASE | re.DOTALL)
            return new_obj, count > 0

        def _replace_js_objects(script_content: str) -> Tuple[str, bool, bool]:
            nonlocal images_injected, image_index
            objects = _iter_js_objects(script_content)
            if not objects:
                return script_content, False, False

            updated = False
            found_images = False
            parts = []
            cursor = 0

            for start, end, obj_text in objects:
                new_obj = obj_text
                if _object_is_image_like(obj_text) and re.search(r'\bsrc\s*:', obj_text, re.IGNORECASE):
                    label_text = _extract_js_object_label(obj_text)
                    src_match = re.search(r'\bsrc\s*:\s*(?:(["\'])(?P<src>.*?)\1|(?P<src_unquoted>[^,\n}]+))', obj_text, re.IGNORECASE | re.DOTALL)
                    if src_match and label_text:
                        found_images = True
                        src_value = (src_match.group('src') or src_match.group('src_unquoted') or "").strip()
                        target_url = _match_alt_url(label_text)
                        if not target_url and image_urls and _is_placeholder_src(src_value):
                            target_url = image_urls[image_index % len(image_urls)]
                            image_index += 1
                        if target_url:
                            new_obj, replaced = _replace_src_in_object(obj_text, target_url)
                            if replaced:
                                images_injected += 1
                                updated = True
                parts.append(script_content[cursor:start])
                parts.append(new_obj)
                cursor = end

            parts.append(script_content[cursor:])
            return "".join(parts), updated, found_images

        script_pattern = re.compile(r'(<script[^>]*>)([\s\S]*?)(</script>)', re.IGNORECASE)

        def replace_script_block(match):
            nonlocal has_js_objects
            start_tag, script_content, end_tag = match.groups()
            new_content, updated, found_any = _replace_js_objects(script_content)
            if found_any:
                has_js_objects = True
            return f"{start_tag}{new_content}{end_tag}"

        result = re.sub(script_pattern, replace_script_block, result)

        def replace_js_prop_default(match):
            nonlocal images_injected, image_index
            decl = match.group(1)
            var_name = match.group(2)
            prop_name = match.group(3)

            if prop_name in prefetched_images and prefetched_images[prop_name].startswith('http'):
                url = prefetched_images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced JS props.{prop_name} with {url[:50]}...")
            return f"{decl} {var_name} = '{url}';"

        js_prop_default_pattern = r'(const|let|var)\s+(\w+)\s*=\s*props\.(\w+)\s*(?:\|\||\?\?)\s*[\'"][^\'"]*[\'"]\s*;'
        result = re.sub(js_prop_default_pattern, replace_js_prop_default, result, flags=re.IGNORECASE)

        def replace_variable_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            var_name = match.group(2)
            after = match.group(3)

            if has_js_objects and var_name.lower() in GENERIC_JS_VARS:
                return match.group(0)

            prop_key = var_name
            if prop_key in prefetched_images and prefetched_images[prop_key].startswith('http'):
                url = prefetched_images[prop_key]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced ${{{var_name}}} with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        # Pattern handles both <img src=... and <img alt="..." src=...
        var_pattern = r'<img\s*([^>]*?)src=["\']?\$\{+\s*(\w+)\s*\}+["\']?([^>]*?)>'
        result = re.sub(var_pattern, replace_variable_src, result, flags=re.IGNORECASE)

        def replace_props_reference(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            prop_name = match.group(2)
            after = match.group(3)

            if prop_name in prefetched_images and prefetched_images[prop_name].startswith('http'):
                url = prefetched_images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced props.{prop_name} with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        props_ref_pattern = r'<img\s*([^>]*?)src=["\']props\.(\w+)["\']([^>]*?)>'
        result = re.sub(props_ref_pattern, replace_props_reference, result, flags=re.IGNORECASE)

        def replace_placeholder_src_quoted(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            after = match.group(3)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced placeholder with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        # Match exact src="" or src="placeholder"
        quoted_placeholder_pattern = r'<img\s*([^>]*?)src=(["\'])(?:placeholder)?\2([^>]*?)>'
        result = re.sub(
            quoted_placeholder_pattern,
            replace_placeholder_src_quoted,
            result,
            flags=re.IGNORECASE,
        )

        # Match any src containing "placeholder" in the path (e.g., src="/deck/placeholder")
        def replace_placeholder_path_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            src_value = match.group(3)
            after = match.group(4)

            # Skip if it's already one of our bucket URLs
            if is_our_url(src_value):
                return match.group(0)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced placeholder path '{src_value}' with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        placeholder_path_pattern = r'<img\s*([^>]*?)src=(["\'])([^"\']*placeholder[^"\']*)\2([^>]*?)>'
        result = re.sub(
            placeholder_path_pattern,
            replace_placeholder_path_src,
            result,
            flags=re.IGNORECASE,
        )

        def replace_placeholder_src_unquoted(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            after = match.group(2)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced placeholder with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        unquoted_placeholder_pattern = r'<img\s*([^>]*?)src=(?:placeholder)?(?=[\s>])([^>]*?)>'
        result = re.sub(
            unquoted_placeholder_pattern,
            replace_placeholder_src_unquoted,
            result,
            flags=re.IGNORECASE,
        )

        # Match unquoted src containing "placeholder" path (e.g., src=/deck/placeholder)
        def replace_unquoted_placeholder_path(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            src_value = match.group(2)
            after = match.group(3)

            if is_our_url(src_value):
                return match.group(0)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced unquoted placeholder path '{src_value}' with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        unquoted_placeholder_path_pattern = r'<img\s*([^>]*?)src=([^\s"\'<>]*placeholder[^\s"\'<>]*)(?=[\s>])([^>]*?)>'
        result = re.sub(
            unquoted_placeholder_path_pattern,
            replace_unquoted_placeholder_path,
            result,
            flags=re.IGNORECASE,
        )

        def replace_local_file_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            local_path = match.group(2)
            after = match.group(3)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced local file '{local_path}' with {url[:50]}...")
            return f'<img {before}src="{url}"{after}>'

        local_file_pattern = r'<img\s*([^>]*?)src=["\']([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))["\']([^>]*?)>'
        result = re.sub(local_file_pattern, replace_local_file_src, result, flags=re.IGNORECASE)

        def replace_local_bg_image(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            local_path = match.group(2)
            after = match.group(3)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced local BG file '{local_path}' with {url[:50]}...")
            return f'{before}{url}{after}'

        local_bg_pattern = r'(background-image:\s*url\([\'\"]?)([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))([\'\"]?\))'
        result = re.sub(local_bg_pattern, replace_local_bg_image, result, flags=re.IGNORECASE)

        inline_local_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'\"]?)([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))([\'\"]?\)[^"\']*["\'])'
        result = re.sub(inline_local_bg_pattern, replace_local_bg_image, result, flags=re.IGNORECASE)

        def replace_props_bg_image(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            prop_name = match.group(2)
            after = match.group(3)

            if prop_name in prefetched_images and prefetched_images[prop_name].startswith('http'):
                url = prefetched_images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced BG props.{prop_name} with {url[:50]}...")
            return f'{before}{url}{after}'

        props_bg_pattern = r'(background-image:\s*url\([\'\"]?)props\.(\w+)([\'\"]?\))'
        result = re.sub(props_bg_pattern, replace_props_bg_image, result, flags=re.IGNORECASE)

        inline_props_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'\"]?)props\.(\w+)([\'\"]?\)[^"\']*["\'])'
        result = re.sub(inline_props_bg_pattern, replace_props_bg_image, result, flags=re.IGNORECASE)

        def replace_external_img_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            external_url = match.group(2)
            after = match.group(3)

            if is_our_url(external_url) or external_url.startswith('data:') or external_url in image_urls:
                return match.group(0)

            if not image_urls:
                logger.warning(f"[IMAGE_INJECT] No images to replace external URL: {external_url[:50]}...")
                return match.group(0)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced external URL {external_url[:40]}... with {url[:40]}...")
            return f'<img {before}src="{url}"{after}>'

        external_url_pattern = r'<img\s*([^>]*?)src=["\'](https?://[^"\']+)["\']([^>]*?)>'
        result = re.sub(external_url_pattern, replace_external_img_src, result, flags=re.IGNORECASE)

        def replace_background_image_url(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            external_url = match.group(2)
            after = match.group(3)

            if is_our_url(external_url):
                return match.group(0)
            if external_url.startswith('data:') or external_url.startswith('linear') or external_url.startswith('radial'):
                return match.group(0)
            if not image_urls:
                return match.group(0)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info("[IMAGE_INJECT] Replaced background-image URL %s... with %s...", external_url[:40], url[:40])
            return f'{before}{url}{after}'

        bg_image_pattern = r'(background-image:\s*url\([\'"]?)(https?://[^\'")\s]+)([\'"]?\))'
        result = re.sub(bg_image_pattern, replace_background_image_url, result, flags=re.IGNORECASE)

        inline_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'"]?)(https?://[^\'")\s]+)([\'"]?\)[^"\']*["\'])'
        result = re.sub(inline_bg_pattern, replace_background_image_url, result, flags=re.IGNORECASE)

        external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', result, flags=re.IGNORECASE)
        # Filter out our bucket URLs - those are successfully replaced images
        truly_external = [url for url in external_matches if not is_our_url(url)]
        if truly_external:
            logger.warning(f"[IMAGE_INJECT] {len(truly_external)} external URLs remain after replacement")
            for url in truly_external[:3]:
                logger.warning(f"[IMAGE_INJECT]   - {url[:80]}...")

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
        if re.search(r'html\s*,\s*body\s*\{[^}]*margin\s*:\s*0', html, re.IGNORECASE):
            return html
        base_style = (
            "<style>"
            "html, body { margin: 0 !important; padding: 0 !important; width: 1920px; height: 1080px; overflow: hidden; }"
            "*, *::before, *::after { box-sizing: border-box; }"
            "</style>"
        )
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
