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
                if not k.endswith('_query'):
                    logger.info(f"[IMAGE_PIPELINE]   - {k}: {v[:60]}...")
        prefetched_images.update(serp_results or {})

    image_count = len([k for k in prefetched_images.keys() if not k.endswith('_query') and prefetched_images[k].startswith('http')])
    logger.info(f"[IMAGE_PIPELINE] Total prefetched images before injection: {image_count}")

    if prefetched_images:
        html = html_processor.inject_prefetched_images(html, prefetched_images)
    else:
        logger.warning("[IMAGE_PIPELINE] No prefetched images available for injection - placeholders will remain")

    return html, prefetched_images


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
            search_query = " ".join(alt_text.split()[:6])
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
