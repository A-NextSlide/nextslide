"""HTML processing helpers for CustomComponent generation."""

from typing import Dict, Any, Optional
import re

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


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
        image_urls = [
            v for k, v in prefetched_images.items()
            if not k.endswith('_query') and v.startswith('http') and 'logo' not in k.lower()
        ]

        if not image_urls:
            external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', html, flags=re.IGNORECASE)
            if external_matches:
                bucket_domains = ['nextslide.ai', 'supabase.co', 'supabase.com']
                external_to_replace = [url for url in external_matches if not any(d in url.lower() for d in bucket_domains)]
                if external_to_replace:
                    logger.warning(f"[IMAGE_INJECT] No prefetched images but found {len(external_to_replace)} external URLs")
                    for url in external_to_replace[:3]:
                        logger.warning(f"[IMAGE_INJECT]   - UNREPLACED: {url[:70]}...")
            return html

        logger.info(f"[IMAGE_INJECT] Starting guaranteed injection with {len(image_urls)} images")

        result = html
        images_injected = 0
        image_index = 0
        bucket_domains = ['nextslide.ai', 'supabase.co', 'supabase.com']

        def is_our_url(url: str) -> bool:
            return any(domain in url.lower() for domain in bucket_domains)

        for key, url in prefetched_images.items():
            if not key.startswith('alt_') or not url.startswith('http'):
                continue
            alt_text = prefetched_images.get(f"{key}_query", key[4:].replace('_', ' '))
            if not alt_text:
                continue
            escaped_alt = re.escape(alt_text)

            def replace_by_alt_first(match, url=url, alt_text=alt_text):
                nonlocal images_injected
                full_tag = match.group(0)
                if is_our_url(full_tag):
                    return full_tag
                new_tag = re.sub(r'src=["\'][^"\']*["\']', f'src="{url}"', full_tag)
                if new_tag != full_tag:
                    images_injected += 1
                    logger.debug("[IMAGE_INJECT] ALT match: '%s' -> %s", alt_text, url[:40])
                return new_tag

            alt_pattern = rf'<img[^>]*alt=["\']({escaped_alt}[^"\']*)["\'][^>]*>'
            result = re.sub(alt_pattern, replace_by_alt_first, result, flags=re.IGNORECASE)

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

        js_prop_default_pattern = r'(const|let|var)\s+(\w+)\s*=\s*props\.(\w+)\s*\|\|\s*[\'"][^\'"]*[\'"]\s*;'
        result = re.sub(js_prop_default_pattern, replace_js_prop_default, result, flags=re.IGNORECASE)

        def replace_variable_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            var_name = match.group(2)
            after = match.group(3)

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

        var_pattern = r'<img\s+([^>]*?)src=["\']?\$\{+\s*(\w+)\s*\}+["\']?([^>]*?)>'
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

        props_ref_pattern = r'<img\s+([^>]*?)src=["\']props\.(\w+)["\']([^>]*?)>'
        result = re.sub(props_ref_pattern, replace_props_reference, result, flags=re.IGNORECASE)

        def replace_placeholder_src(match):
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

        placeholder_pattern = r'<img\s+([^>]*?)src=["\'](?:placeholder|)["\']([^>]*?)>'
        result = re.sub(placeholder_pattern, replace_placeholder_src, result, flags=re.IGNORECASE)

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

        local_file_pattern = r'<img\s+([^>]*?)src=["\']([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))["\']([^>]*?)>'
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

        external_url_pattern = r'<img\s+([^>]*?)src=["\'](https?://[^"\']+)["\']([^>]*?)>'
        result = re.sub(external_url_pattern, replace_external_img_src, result, flags=re.IGNORECASE)

        external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', result, flags=re.IGNORECASE)
        if external_matches:
            logger.warning(f"[IMAGE_INJECT] {len(external_matches)} external URLs remain after replacement")

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
        html = self._prettify_css_in_html(html)
        return html

    def _prettify_css_in_html(self, html: str) -> str:
        if '<style' not in html:
            return html
        try:
            style_blocks = re.findall(r'<style[^>]*>([\s\S]*?)</style>', html, re.IGNORECASE)
            for style in style_blocks:
                pretty = style.replace(';', ';\n').replace('{', '{\n').replace('}', '\n}\n')
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
