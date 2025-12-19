"""Image search and injection helpers for CustomComponent generation."""

from __future__ import annotations

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
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

BUCKET_DOMAINS = ("nextslide.ai", "supabase.co", "supabase.com")


def _find_external_image_urls(html: str) -> List[str]:
    urls = re.findall(r'<img[^>]*src=["\']?(https?://[^\s"\'>]+)["\']?', html, re.IGNORECASE)
    return list({url for url in urls if not any(domain in url.lower() for domain in BUCKET_DOMAINS)})


def _needs_image_search(html: str) -> bool:
    if not html:
        return False
    has_placeholders = "placeholder" in html.lower() or "${" in html or 'src=""' in html
    if has_placeholders:
        return True
    return bool(_find_external_image_urls(html))


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
    if not image_props:
        return html, prefetched_images

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
        prefetched_images.update(serp_results or {})

    if prefetched_images:
        html = html_processor.inject_prefetched_images(html, prefetched_images)

    return html, prefetched_images


async def upload_external_urls_to_bucket(html: str) -> str:
    """Upload external image URLs to storage and replace them in HTML."""
    external_urls = _find_external_image_urls(html)
    if not external_urls:
        return html

    async with ImageStorageService() as storage:
        for url in external_urls:
            try:
                upload_result = await storage.upload_image_from_url(url, metadata={"source": "custom_component"})
                new_url = upload_result.get("url") if isinstance(upload_result, dict) else None
                if new_url:
                    html = html.replace(url, new_url)
            except Exception as exc:
                logger.warning("[CUSTOM_COMPONENT] Failed to upload external image %s: %s", url[:80], exc)

    return html
