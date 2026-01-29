"""Image search and injection helpers for CustomComponent generation."""

from __future__ import annotations

import html
import re
from typing import Any, Dict, List, Tuple

from agents.generation.custom_component_helpers import (
    _extract_image_props_from_html,
    _normalize_available_images,
    _match_available_images_to_props,
    _search_images_for_props,
)
from agents.generation.custom_component_html import CustomComponentHtmlProcessor
from services.image_cache import ImageSearchCache
from services.image_storage_service import ImageStorageService
from services.image import (
    BUCKET_DOMAINS,
    needs_image_search as unified_needs_image_search,
    find_external_image_urls,
    is_bucket_url,
)
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


# Use unified service for finding external image URLs and placeholder detection
# These functions are imported from services.image


def _needs_image_search(html: str) -> bool:
    """Check if HTML needs image search/resolution."""
    return unified_needs_image_search(html)


async def resolve_images(
    html: str,
    *,
    theme: Dict[str, Any],
    slide_context: Dict[str, Any],
    content: str,
    available_images: List[Any] | None,
    uploaded_media: List[Any] | None,
    prefetched_images: Dict[str, str] | None,
    auto_prefetch: bool,
    deck_uuid: str | None,
    html_processor: CustomComponentHtmlProcessor,
) -> Tuple[str, Dict[str, str]]:
    """Populate prefetched images and inject them into HTML when needed."""
    prefetched_images = dict(prefetched_images or {})

    # First, clean up any invalid values ("Z", "None", etc.) so they become "placeholder"
    # This ensures needs_image_search correctly detects them
    html = _cleanup_invalid_image_values(html)

    if not _needs_image_search(html):
        if prefetched_images:
            html = html_processor.inject_prefetched_images(html, prefetched_images)
        return html, prefetched_images

    image_props = _extract_image_props_from_html(html)
    logger.info(f"[IMAGE_PIPELINE] Extracted {len(image_props)} image props from HTML")
    if image_props:
        for prop, query in image_props[:5]:  # Log first 5
            logger.info(f"[IMAGE_PIPELINE]   - {prop}: {query[:50]}...")
    if not image_props:
        logger.warning("[IMAGE_PIPELINE] No image props found in HTML - skipping image resolution")
        return html, prefetched_images

    brand_info = theme.get("brandInfo", {}) if isinstance(theme, dict) else {}
    color_palette = theme.get("color_palette", {}) if isinstance(theme, dict) else {}
    logo_url = (
        brand_info.get("logoUrl")
        or brand_info.get("logo_url")
        or color_palette.get("metadata", {}).get("logo_url")
        or color_palette.get("metadata", {}).get("logo_url_light")
    )
    if isinstance(logo_url, str) and logo_url.endswith("?"):
        logo_url = logo_url[:-1]
    # Skip base64 data URLs - they're too large (50K+ chars)
    if isinstance(logo_url, str) and logo_url.startswith("data:"):
        logger.info("[IMAGE_PIPELINE] Skipping base64 logo URL, will use logo.dev")
        logo_url = None

    # Find logo-related image props
    logo_props = [(prop, query) for prop, query in image_props if "logo" in prop.lower() or "logo" in query.lower()]

    if logo_url:
        # Use theme logo URL for logo props
        for prop_name, query in logo_props:
            prefetched_images[prop_name] = logo_url
            prefetched_images[f"{prop_name}_query"] = query
        image_props = [(prop, query) for prop, query in image_props if prop not in prefetched_images]
    elif logo_props:
        # No valid logo URL - try logo.dev
        brand_name = brand_info.get("name") or brand_info.get("domain")
        if not brand_name:
            metadata = color_palette.get("metadata", {}) if isinstance(color_palette, dict) else {}
            brand_name = metadata.get("brand_name") or metadata.get("domain")

        if brand_name:
            try:
                from agents.tools.theme.logodev_service import LogoDevService
                async with LogoDevService() as logo_service:
                    result = await logo_service.get_logo_with_fallback(brand_name)
                    if result.get("available") and result.get("logo_url"):
                        fetched_logo = result["logo_url"]
                        logger.info(f"[IMAGE_PIPELINE] Fetched logo from logo.dev for {brand_name}")
                        for prop_name, query in logo_props:
                            prefetched_images[prop_name] = fetched_logo
                            prefetched_images[f"{prop_name}_query"] = query
                        image_props = [(prop, query) for prop, query in image_props if prop not in prefetched_images]
            except Exception as e:
                logger.warning(f"[IMAGE_PIPELINE] logo.dev lookup failed for {brand_name}: {e}")
        else:
            logger.info("[IMAGE_PIPELINE] No brand name available for logo.dev lookup")
            # Remove logo props from search - generic "Logo" searches return random images
            image_props = [(prop, query) for prop, query in image_props if prop not in [p for p, _ in logo_props]]

    available_assets = _normalize_available_images(available_images, uploaded_media)
    if available_assets:
        matched, remaining = _match_available_images_to_props(image_props, available_assets)
        prefetched_images.update(matched)
    else:
        remaining = image_props

    if remaining and auto_prefetch:
        brand_info = theme.get("brandInfo", {}) if isinstance(theme, dict) else {}
        brand_name = brand_info.get("name", "") or brand_info.get("domain", "")
        if not brand_name:
            metadata = theme.get("color_palette", {}).get("metadata", {}) if isinstance(theme, dict) else {}
            brand_name = metadata.get("brand_name", "") or metadata.get("domain", "")

        presentation_context = slide_context.get("presentation_context", "") if slide_context else ""
        deck_title = slide_context.get("deck_title", "") if slide_context else ""
        slide_title = slide_context.get("title", "") if slide_context else ""

        context_parts = []
        if brand_name:
            context_parts.append(f"BRAND: {brand_name}")
        if deck_title and deck_title != brand_name:
            context_parts.append(f"Deck: {deck_title}")
        if presentation_context:
            context_parts.append(f"Topic: {presentation_context[:150]}")
        if slide_title:
            context_parts.append(f"Slide: {slide_title}")
        if content:
            context_parts.append(content[:200])

        slide_search_context = " | ".join([part for part in context_parts if part])
        logger.info(f"[IMAGE_PIPELINE] Built search context: {slide_search_context[:200]}...")
        cache = ImageSearchCache(deck_uuid or slide_context.get("deck_uuid"))
        serp_results = await _search_images_for_props(
            remaining,
            theme,
            slide_search_context,
            cache=cache,
        )
        logger.info(f"[IMAGE_PIPELINE] SERP search returned {len(serp_results) if serp_results else 0} results")
        if serp_results:
            for k, v in list(serp_results.items())[:3]:
                if not k.endswith('_query') and not k.endswith('_width') and not k.endswith('_height') and isinstance(v, str):
                    logger.info(f"[IMAGE_PIPELINE]   - {k}: {v[:60]}...")
        prefetched_images.update(serp_results or {})

    image_count = len([k for k in prefetched_images.keys() if not k.endswith('_query') and not k.endswith('_width') and not k.endswith('_height') and isinstance(prefetched_images[k], str) and prefetched_images[k].startswith('http')])
    logger.info(f"[IMAGE_PIPELINE] Total prefetched images before injection: {image_count}")

    if prefetched_images:
        html = html_processor.inject_prefetched_images(html, prefetched_images)
        # Apply correct object-fit based on image dimensions
        html = _apply_object_fit_from_dimensions(html, prefetched_images)
    else:
        logger.warning("[IMAGE_PIPELINE] No prefetched images available for injection - placeholders will remain")

    return html, prefetched_images


def _cleanup_invalid_image_values(html: str) -> str:
    """Clean up invalid placeholder values that AI might have generated for images.

    This handles cases where the AI generates:
    - image: "None" or image: 'None' in JS objects
    - image: "Z" or single-letter placeholders
    - src="None" or src="Z" in img tags
    - Other invalid image property values

    Replaces them with "placeholder" so they get caught by normal placeholder detection.
    """
    if not html:
        return html

    # Count replacements for logging
    replacements = 0

    # Invalid values that AI sometimes generates as placeholders
    # These are single letters, "None", or other non-URL values
    invalid_values = ['None', 'Z', 'X', 'null', 'undefined', 'N/A', 'TBD', 'TODO', 'IMAGE', 'PLACEHOLDER']

    # Replace invalid values in JS object image properties
    def replace_invalid_in_js(match):
        nonlocal replacements
        prefix = match.group(1)
        quote = match.group(2)
        value = match.group(3)
        # Check if it's an invalid value (case-insensitive)
        if value.upper() in [v.upper() for v in invalid_values] or (len(value) == 1 and value.isalpha()):
            replacements += 1
            logger.debug(f"[IMAGE_PIPELINE] Replacing invalid JS value: {value}")
            return f'{prefix}{quote}placeholder{quote}'
        return match.group(0)

    # Pattern for image-related properties with any short/invalid value
    js_pattern = r'(\b\w*(?:src|image|img|photo|picture|thumbnail|background)\w*\s*:\s*)(["\'])([^"\']{1,15})\2'
    html = re.sub(js_pattern, replace_invalid_in_js, html, flags=re.IGNORECASE)

    # Replace invalid src values in img tags
    def replace_invalid_src(match):
        nonlocal replacements
        value = match.group(1)
        if value.upper() in [v.upper() for v in invalid_values] or (len(value) == 1 and value.isalpha()):
            replacements += 1
            logger.debug(f"[IMAGE_PIPELINE] Replacing invalid src: {value}")
            return 'src="placeholder"'
        return match.group(0)

    # Match src with short/invalid values (not URLs)
    html = re.sub(r'src=["\']([^"\']{1,15})["\'](?![^<]*(?:http|data:|blob:))', replace_invalid_src, html, flags=re.IGNORECASE)

    if replacements > 0:
        logger.info(f"[IMAGE_PIPELINE] Cleaned up {replacements} invalid image values in HTML")

    return html


def _should_contain_by_alt_text(alt_text: str) -> bool:
    """Check if alt text suggests the image content needs to be fully visible (contain)."""
    if not alt_text:
        return False
    alt_lower = alt_text.lower()
    # Keywords that indicate the full image content must be visible
    contain_keywords = [
        'logo', 'diagram', 'chart', 'infographic', 'screenshot', 'map',
        'poster', 'book cover', 'album cover', 'album art', 'movie poster',
        'product', 'blueprint', 'schematic', 'floor plan', 'floorplan',
        'illustration', 'comic', 'manga', 'anime character',
        'portrait', 'headshot', 'profile photo', 'mugshot',
        'icon', 'badge', 'emblem', 'crest', 'coat of arms',
        'certificate', 'diploma', 'document', 'newspaper',
        'jersey', 'uniform', 'trophy',
    ]
    return any(kw in alt_lower for kw in contain_keywords)


def _apply_object_fit_from_dimensions(html: str, prefetched_images: Dict[str, Any]) -> str:
    """Post-process HTML to apply correct object-fit based on image dimensions and content type.

    Uses contain when:
    - Portrait images (aspect < 0.8) or panoramic images (aspect > 2.5)
    - Alt text indicates content that must be fully visible (logos, diagrams, posters, etc.)
    Uses cover for standard landscape/square background/atmospheric images.
    """
    if not html or not prefetched_images:
        return html

    # Build URL -> (width, height) mapping
    url_to_dimensions: Dict[str, Tuple[int, int]] = {}
    for key, value in prefetched_images.items():
        if key.endswith('_query') or key.endswith('_width') or key.endswith('_height'):
            continue
        if not isinstance(value, str) or not value.startswith('http'):
            continue

        width = prefetched_images.get(f"{key}_width")
        height = prefetched_images.get(f"{key}_height")
        if width is not None and height is not None:
            try:
                w = int(width) if not isinstance(width, int) else width
                h = int(height) if not isinstance(height, int) else height
                if w > 0 and h > 0:
                    url_to_dimensions[value] = (w, h)
            except (ValueError, TypeError):
                pass

    if not url_to_dimensions:
        logger.info("[IMAGE_PIPELINE] No images with dimensions to apply object-fit")
        return html

    logger.info(f"[IMAGE_PIPELINE] Applying object-fit for {len(url_to_dimensions)} images with dimensions")
    for url, (w, h) in list(url_to_dimensions.items())[:3]:
        logger.info(f"[IMAGE_PIPELINE]   URL: {url[:60]}... dims: {w}x{h}")

    # Find all img tags and update object-fit where needed
    def replace_object_fit(match: re.Match) -> str:
        full_tag = match.group(0)

        # Find the src URL
        src_match = re.search(r'src=["\']([^"\']+)["\']', full_tag, re.IGNORECASE)
        if not src_match:
            return full_tag

        url = src_match.group(1)

        # Try exact match first, then try without query params
        if url not in url_to_dimensions:
            # Try matching base URL without query params
            base_url = url.split('?')[0]
            matching_url = None
            for stored_url in url_to_dimensions:
                if stored_url.split('?')[0] == base_url:
                    matching_url = stored_url
                    break
            if not matching_url:
                return full_tag
            url = matching_url

        width, height = url_to_dimensions[url]
        aspect_ratio = width / height

        # Extract alt text for content-type check
        alt_match = re.search(r'alt=["\']([^"\']+)["\']', full_tag, re.IGNORECASE)
        alt_text = alt_match.group(1) if alt_match else ""
        content_needs_contain = _should_contain_by_alt_text(alt_text)

        # Determine suggested object-fit based on BOTH dimensions and content type
        if content_needs_contain or aspect_ratio < 0.8 or aspect_ratio > 2.5:
            suggested_fit = "contain"
            reason = f"alt='{alt_text[:30]}'" if content_needs_contain else f"aspect={aspect_ratio:.2f}"
        else:
            suggested_fit = "cover"
            reason = f"aspect={aspect_ratio:.2f}"

        # If already has object-fit in the tag
        if 'object-fit' in full_tag.lower():
            # Only change if currently cover and we want contain
            if suggested_fit == "contain" and 'object-fit:cover' in full_tag.replace(' ', '').lower():
                new_tag = re.sub(
                    r'object-fit\s*:\s*cover',
                    'object-fit:contain',
                    full_tag,
                    flags=re.IGNORECASE
                )
                logger.info(f"[IMAGE_PIPELINE] Changed object-fit to contain for {url[:60]}... ({reason})")
                return new_tag
            # If AI already set contain and we agree, or AI set cover and we agree, keep it
            return full_tag

        # No object-fit in tag - add it if we want contain (images default to cover anyway)
        if suggested_fit == "contain":
            # Check if tag has style attribute
            if 'style=' in full_tag.lower():
                # Append to existing style
                new_tag = re.sub(
                    r'(style=["\'])([^"\']*)',
                    rf'\1object-fit:contain; \2',
                    full_tag,
                    count=1,
                    flags=re.IGNORECASE
                )
            else:
                # Add style attribute
                new_tag = full_tag.replace('<img', '<img style="object-fit:contain;"', 1)
            logger.info(f"[IMAGE_PIPELINE] Added object-fit:contain for {url[:60]}... ({reason})")
            return new_tag

        return full_tag

    # Match img tags (with or without space after <img)
    result = re.sub(r'<img\s*[^>]+>', replace_object_fit, html, flags=re.IGNORECASE)

    # Also handle CSS background-image - replace background-size: cover with contain for portrait images
    def replace_bg_size(match: re.Match) -> str:
        full_style = match.group(0)

        # Find the URL in background-image
        url_match = re.search(r'background-image\s*:\s*url\(["\']?([^"\')\s]+)["\']?\)', full_style, re.IGNORECASE)
        if not url_match:
            return full_style

        url = url_match.group(1)

        # Try to find matching URL
        if url not in url_to_dimensions:
            base_url = url.split('?')[0]
            matching_url = None
            for stored_url in url_to_dimensions:
                if stored_url.split('?')[0] == base_url:
                    matching_url = stored_url
                    break
            if not matching_url:
                return full_style
            url = matching_url

        width, height = url_to_dimensions[url]
        aspect_ratio = width / height

        # If portrait/panoramic, change background-size to contain
        if aspect_ratio < 0.8 or aspect_ratio > 2.5:
            if 'background-size' in full_style.lower():
                new_style = re.sub(
                    r'background-size\s*:\s*cover',
                    'background-size:contain',
                    full_style,
                    flags=re.IGNORECASE
                )
                if new_style != full_style:
                    logger.info(f"[IMAGE_PIPELINE] Changed background-size to contain for {url[:60]}... (aspect={aspect_ratio:.2f})")
                    return new_style
            else:
                # Add background-size: contain
                new_style = full_style.rstrip(';') + '; background-size:contain;'
                logger.info(f"[IMAGE_PIPELINE] Added background-size:contain for {url[:60]}... (aspect={aspect_ratio:.2f})")
                return new_style

        return full_style

    # Find style attributes with background-image
    result = re.sub(r'style=["\'][^"\']*background-image[^"\']*["\']', replace_bg_size, result, flags=re.IGNORECASE)

    return result


def _extract_alt_for_url(html_content: str, url: str) -> str | None:
    """Extract the alt text from an img tag containing the given URL."""
    # Escape special regex chars in URL
    escaped_url = re.escape(url)
    # Try to find img tag with this URL and extract alt text
    # Pattern 1: alt comes before src
    match = re.search(rf'<img[^>]*alt=["\']([^"\']+)["\'][^>]*src=["\']?{escaped_url}', html_content, re.IGNORECASE)
    if match:
        return match.group(1)
    # Pattern 2: src comes before alt
    match = re.search(rf'<img[^>]*src=["\']?{escaped_url}["\']?[^>]*alt=["\']([^"\']+)["\']', html_content, re.IGNORECASE)
    if match:
        return match.group(1)
    return None


async def _search_fallback_image(alt_text: str, storage: ImageStorageService) -> str | None:
    """Search for an image using alt text and upload to bucket. Returns bucket URL or None."""
    if not alt_text or len(alt_text) <= 5:
        return None

    logger.info("[UPLOAD_EXTERNAL] Searching fallback image for: '%s'", alt_text[:50])
    try:
        from services.serpapi_service import SerpAPIService
        async with SerpAPIService() as serpapi:
            # Truncate query to first 6 words for better results
            search_query = " ".join(alt_text.split()[:5])  # Keep topic context
            results = await serpapi.search_images(search_query)
            photos = results.get('photos', []) if isinstance(results, dict) else results

            if not photos or not isinstance(photos, list):
                logger.warning("[UPLOAD_EXTERNAL] No fallback results for: '%s'", search_query[:40])
                return None

            # Try multiple results in case some fail
            for photo in photos[:3]:
                fallback_url = photo.get('url') or photo.get('original') or photo.get('thumbnail')
                if not fallback_url:
                    continue

                fallback_result = await storage.upload_image_from_url(fallback_url)
                if isinstance(fallback_result, dict) and "error" not in fallback_result:
                    bucket_url = fallback_result.get("url")
                    if bucket_url:
                        logger.info("[UPLOAD_EXTERNAL] FALLBACK SUCCESS -> %s", bucket_url[:80])
                        return bucket_url

            logger.warning("[UPLOAD_EXTERNAL] All fallback URLs failed for: '%s'", search_query[:40])
            return None

    except Exception as exc:
        logger.warning("[UPLOAD_EXTERNAL] Fallback search failed: %s", exc)
        return None


async def upload_external_urls_to_bucket(html_content: str) -> str:
    """Upload external image URLs to storage and replace them in HTML.

    If any external URL fails to download, falls back to searching for a
    replacement image using the alt text.
    """
    logger.info("[UPLOAD_EXTERNAL] Checking HTML for external URLs to upload...")
    external_urls = find_external_image_urls(html_content)
    if not external_urls:
        logger.info("[UPLOAD_EXTERNAL] No external URLs found - all images already use our bucket or placeholders")
        return html_content

    logger.info("[UPLOAD_EXTERNAL] Found %d external URLs to upload", len(external_urls))

    async with ImageStorageService() as storage:
        for raw_url in external_urls:
            # Decode HTML entities (e.g., &amp; -> &) for the actual HTTP request
            decoded_url = html.unescape(raw_url)
            logger.info("[UPLOAD_EXTERNAL] Processing: %s", decoded_url[:100])

            bucket_url = None
            upload_failed = False

            try:
                upload_result = await storage.upload_image_from_url(
                    decoded_url,
                    metadata={"source": "custom_component"}
                )
                if isinstance(upload_result, dict) and "error" not in upload_result:
                    bucket_url = upload_result.get("url")
                    if bucket_url and bucket_url != decoded_url:
                        logger.info("[UPLOAD_EXTERNAL] SUCCESS: Uploaded -> %s", bucket_url[:80])
                    else:
                        # Upload returned same URL or no URL - treat as failure
                        upload_failed = True
                        logger.warning("[UPLOAD_EXTERNAL] Upload returned invalid result for: %s", decoded_url[:60])
                else:
                    upload_failed = True
                    error_msg = upload_result.get("error", "Unknown error") if isinstance(upload_result, dict) else "Invalid result"
                    logger.warning("[UPLOAD_EXTERNAL] FAILED: %s - %s", decoded_url[:60], error_msg)
            except Exception as exc:
                upload_failed = True
                logger.warning("[UPLOAD_EXTERNAL] EXCEPTION: %s - %s", decoded_url[:60], exc)

            # Only try fallback if upload actually failed
            if upload_failed:
                alt_text = _extract_alt_for_url(html_content, raw_url)
                bucket_url = await _search_fallback_image(alt_text, storage)

            # Replace URL in HTML only if we got a valid bucket URL
            if bucket_url and any(domain in bucket_url for domain in BUCKET_DOMAINS):
                html_content = html_content.replace(raw_url, bucket_url)
            elif not bucket_url:
                logger.warning("[UPLOAD_EXTERNAL] No replacement found for: %s", decoded_url[:60])

    return html_content


def _find_placeholder_images(html_content: str) -> List[Tuple[str, str]]:
    """Find all img tags with src="placeholder" and return (full_img_tag, alt_text) tuples.

    Skips images with template variable alt text (e.g., alt="${item.thumbAlt}") since those
    can't be used as search queries - they should have been resolved earlier in the pipeline.
    """
    from urllib.parse import unquote
    placeholders = []
    # Match img tags with src="placeholder" or "placeholder?q=..." (case insensitive)
    pattern = r'<img\s*[^>]*src\s*=\s*["\']?placeholder(?:\?[^"\'>\s]*)?["\']?[^>]*>'
    for match in re.finditer(pattern, html_content, re.IGNORECASE):
        img_tag = match.group(0)
        # Extract alt text from the img tag
        alt_match = re.search(r'alt\s*=\s*["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
        alt_text = alt_match.group(1) if alt_match else None

        # If no alt text, try to extract query from placeholder?q=... URL
        if not alt_text or len(alt_text) <= 5:
            src_match = re.search(r'src\s*=\s*["\']?placeholder\?q=([^"\'>\s]+)', img_tag, re.IGNORECASE)
            if src_match:
                alt_text = unquote(src_match.group(1))
                logger.info("[PLACEHOLDER_CLEANUP] Extracted query from placeholder URL: '%s'", alt_text[:50])

        if alt_text and len(alt_text) > 5:
            # Skip template variable alt text - these can't be used as search queries
            # They should have been resolved by _extract_template_variable_alt_queries earlier
            if '${' in alt_text:
                logger.debug("[PLACEHOLDER_CLEANUP] Skipping template variable alt: '%s'", alt_text[:50])
                continue
            placeholders.append((img_tag, alt_text))
    return placeholders


def _find_js_placeholder_images(html_content: str) -> List[Tuple[str, str, str]]:
    """Find JS objects with image/src: 'placeholder' and return (obj_text, prop_name, label) tuples.

    Uses proper brace-matching iteration to handle nested objects correctly.
    """
    from agents.generation.custom_component_helpers import _iter_js_objects

    placeholders = []

    # Match property names CONTAINING src, image, img, photo, picture, thumbnail, background
    # This catches names like imageStage, stageImage, backgroundImage, etc.
    # Also matches placeholder with query string like 'placeholder?q=...'
    # Also match unquoted placeholder values
    placeholder_pattern_quoted = r'\b(\w*(?:src|image|img|photo|picture|thumbnail|background)\w*)\s*:\s*["\']placeholder(?:\?[^"\']*)?["\']'
    placeholder_pattern_unquoted = r'\b(\w*(?:src|image|img|photo|picture|thumbnail|background)\w*)\s*:\s*placeholder\s*[,}\]]'

    for script_match in re.finditer(r'<script[^>]*>([\s\S]*?)</script>', html_content, re.IGNORECASE):
        script_content = script_match.group(1)

        # Use proper brace-matching to find all JS objects (handles nested objects correctly)
        for start, end, obj_text in _iter_js_objects(script_content):
            # Check if this object has a placeholder image property (quoted or unquoted)
            placeholder_match = re.search(placeholder_pattern_quoted, obj_text, re.IGNORECASE)
            if not placeholder_match:
                placeholder_match = re.search(placeholder_pattern_unquoted, obj_text, re.IGNORECASE)

            if not placeholder_match:
                continue

            prop_name = placeholder_match.group(1)

            # Try to extract a label from the object
            # First priority: alt-related properties (these are meant to be image search queries)
            # Second priority: standard label properties
            label = ""
            alt_fields = ("thumbAlt", "imgAlt", "imageAlt", "photoAlt", "pictureAlt", "bgAlt", "backgroundAlt", "alt")
            label_fields = ("title", "name", "label", "heading", "description")

            for field in alt_fields:
                label_match = re.search(rf'\b{field}\s*:\s*(["\'])(.*?)\1', obj_text, re.IGNORECASE)
                if label_match:
                    label = label_match.group(2).strip()
                    if label and len(label) > 3:
                        break

            if not label:
                for field in label_fields:
                    label_match = re.search(rf'\b{field}\s*:\s*(["\'])(.*?)\1', obj_text, re.IGNORECASE)
                    if label_match:
                        label = label_match.group(2).strip()
                        if label and len(label) > 3:
                            break

            if label and len(label) > 3:
                placeholders.append((obj_text, prop_name, label))
                logger.info("[JS_PLACEHOLDER] Found JS placeholder: %s: 'placeholder' with label: '%s'", prop_name, label[:50])

    return placeholders


async def resolve_remaining_placeholders(html_content: str) -> str:
    """Find and resolve any remaining src="placeholder" images using their alt text.

    This is the final safety net - if any placeholders survived the earlier pipeline,
    search for images using the alt text and replace them.

    Also handles JavaScript object placeholders like: { image: 'placeholder' }
    """
    # First handle HTML img tag placeholders
    placeholders = _find_placeholder_images(html_content)
    js_placeholders = _find_js_placeholder_images(html_content)

    # Note: We don't early return here anymore - the final cleanup pass at the end
    # catches edge cases where the detection patterns didn't match but placeholders exist

    if placeholders or js_placeholders:
        logger.info("[PLACEHOLDER_CLEANUP] Found %d HTML placeholders and %d JS placeholders to resolve",
                    len(placeholders), len(js_placeholders))

        async with ImageStorageService() as storage:
            # Handle HTML img tag placeholders
            for img_tag, alt_text in placeholders:
                logger.info("[PLACEHOLDER_CLEANUP] Resolving HTML placeholder with alt: '%s'", alt_text[:50])

                # Search for an image using the alt text
                bucket_url = await _search_fallback_image(alt_text, storage)

                if bucket_url and any(domain in bucket_url for domain in BUCKET_DOMAINS):
                    # Create new img tag with the bucket URL
                    # Handle placeholder with optional query string like placeholder?q=...
                    new_img_tag = re.sub(
                        r'src\s*=\s*["\']?placeholder(?:\?[^"\'>\s]*)?["\']?',
                        f'src="{bucket_url}"',
                        img_tag,
                        flags=re.IGNORECASE
                    )
                    html_content = html_content.replace(img_tag, new_img_tag)
                    logger.info("[PLACEHOLDER_CLEANUP] SUCCESS: Replaced HTML placeholder -> %s", bucket_url[:80])
                else:
                    logger.warning("[PLACEHOLDER_CLEANUP] Could not find image for HTML: '%s' - removing placeholder", alt_text[:50])
                    # Remove the broken placeholder - replace img tag with empty string or a subtle gradient div
                    # Use a subtle gradient placeholder that won't look broken
                    fallback_div = (
                        '<div style="width:100%;height:100%;background:linear-gradient(135deg,rgba(99,102,241,0.1) 0%,rgba(139,92,246,0.1) 100%);'
                        'border-radius:8px;"></div>'
                    )
                    html_content = html_content.replace(img_tag, fallback_div)
                    logger.info("[PLACEHOLDER_CLEANUP] Replaced unresolved placeholder with gradient fallback")

            # Handle JavaScript object placeholders
            for obj_text, prop_name, label in js_placeholders:
                logger.info("[PLACEHOLDER_CLEANUP] Resolving JS placeholder %s with label: '%s'", prop_name, label[:50])

                # Search for an image using the label
                bucket_url = await _search_fallback_image(label, storage)

                if bucket_url and any(domain in bucket_url for domain in BUCKET_DOMAINS):
                    # Replace the placeholder value in the JS object
                    # First try: quoted placeholder like image: "placeholder" or image: 'placeholder'
                    pattern_quoted = rf'(\b{re.escape(prop_name)}\s*:\s*)(["\'])placeholder(?:\?[^"\']*)?(\2)'
                    new_obj_text = re.sub(pattern_quoted, rf'\1\2{bucket_url}\3', obj_text, flags=re.IGNORECASE)

                    # Second try: unquoted placeholder like image: placeholder (no quotes)
                    if new_obj_text == obj_text:
                        pattern_unquoted = rf'(\b{re.escape(prop_name)}\s*:\s*)placeholder(\s*[,}}\]])'
                        new_obj_text = re.sub(pattern_unquoted, rf'\1"{bucket_url}"\2', obj_text, flags=re.IGNORECASE)

                    if new_obj_text != obj_text:
                        html_content = html_content.replace(obj_text, new_obj_text)
                        logger.info("[PLACEHOLDER_CLEANUP] SUCCESS: Replaced JS %s placeholder -> %s", prop_name, bucket_url[:80])
                else:
                    logger.warning("[PLACEHOLDER_CLEANUP] Could not find image for JS %s: '%s' - using transparent fallback", prop_name, label[:50])
                    # Replace with transparent 1x1 pixel to prevent broken image display
                    transparent_pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

                    # First try: quoted placeholder
                    pattern_quoted = rf'(\b{re.escape(prop_name)}\s*:\s*)(["\'])placeholder(?:\?[^"\']*)?(\2)'
                    new_obj_text = re.sub(pattern_quoted, rf'\1\2{transparent_pixel}\3', obj_text, flags=re.IGNORECASE)

                    # Second try: unquoted placeholder
                    if new_obj_text == obj_text:
                        pattern_unquoted = rf'(\b{re.escape(prop_name)}\s*:\s*)placeholder(\s*[,}}\]])'
                        new_obj_text = re.sub(pattern_unquoted, rf'\1"{transparent_pixel}"\2', obj_text, flags=re.IGNORECASE)

                    if new_obj_text != obj_text:
                        html_content = html_content.replace(obj_text, new_obj_text)
                        logger.info("[PLACEHOLDER_CLEANUP] Replaced JS placeholder with transparent fallback")

    # Final pass: catch any remaining placeholders that slipped through
    # This handles edge cases where the regex patterns above didn't match
    transparent_pixel = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7"

    # Pattern 1: src="placeholder" or src='placeholder' (quoted in HTML)
    pattern_html_quoted = r'src\s*=\s*["\']placeholder(?:\?[^"\']*)?["\']'
    if re.search(pattern_html_quoted, html_content, re.IGNORECASE):
        logger.warning("[PLACEHOLDER_CLEANUP] Found remaining quoted src=placeholder - replacing with transparent pixel")
        html_content = re.sub(
            pattern_html_quoted,
            f'src="{transparent_pixel}"',
            html_content,
            flags=re.IGNORECASE
        )

    # Pattern 2: src=placeholder (unquoted in HTML - rare but possible)
    pattern_html_unquoted = r'src\s*=\s*placeholder(?:\s|>|/)'
    if re.search(pattern_html_unquoted, html_content, re.IGNORECASE):
        logger.warning("[PLACEHOLDER_CLEANUP] Found remaining unquoted src=placeholder - replacing with transparent pixel")
        html_content = re.sub(
            r'(src\s*=\s*)placeholder(\s|>|/)',
            rf'\1"{transparent_pixel}"\2',
            html_content,
            flags=re.IGNORECASE
        )

    # Pattern 3: image: "placeholder" in JS objects (quoted)
    pattern_js_quoted = r'(\b(?:src|image|img|photo|picture|thumbnail|background)\w*\s*:\s*)["\']placeholder(?:\?[^"\']*)?["\']'
    if re.search(pattern_js_quoted, html_content, re.IGNORECASE):
        logger.warning("[PLACEHOLDER_CLEANUP] Found remaining JS quoted placeholder - replacing with transparent pixel")
        html_content = re.sub(
            pattern_js_quoted,
            rf'\1"{transparent_pixel}"',
            html_content,
            flags=re.IGNORECASE
        )

    # Pattern 4: image: placeholder in JS objects (unquoted)
    pattern_js_unquoted = r'(\b(?:src|image|img|photo|picture|thumbnail|background)\w*\s*:\s*)placeholder(\s*[,}\]])'
    if re.search(pattern_js_unquoted, html_content, re.IGNORECASE):
        logger.warning("[PLACEHOLDER_CLEANUP] Found remaining JS unquoted placeholder - replacing with transparent pixel")
        html_content = re.sub(
            pattern_js_unquoted,
            rf'\1"{transparent_pixel}"\2',
            html_content,
            flags=re.IGNORECASE
        )

    return html_content
