"""
Unified Image Service
---------------------
Single entry point for all image operations with proper retry/fallback logic.

This consolidates image search, logo fetching, placeholder detection, and
URL uploading into one clean API.
"""

import asyncio
import re
from typing import Any, Dict, List, Optional, Tuple

from setup_logging_optimized import get_logger

from .constants import GENERIC_IMAGE_TERMS, BUCKET_DOMAINS
from .placeholder_detector import (
    is_placeholder_src,
    is_bucket_url,
    needs_image_search,
    find_external_image_urls,
    extract_placeholder_images_from_html,
)
from .domain_filter import is_blocked_domain, sort_urls_by_reliability
from .query_builder import (
    extract_query_from_prop_name,
    is_generic_query,
    clean_query,
    enhance_query_with_ai,
    build_search_context,
)
from .logo_resolver import (
    is_company_logo_query,
    fetch_logo,
    resolve_logo_url,
    extract_brand_from_theme,
    is_logodev_available,
)

logger = get_logger(__name__)


class UnifiedImageService:
    """
    Single entry point for all image operations with retry/fallback logic.

    This service consolidates:
    - Placeholder detection
    - Query building and AI enhancement
    - Logo detection and fetching
    - Image search via SerpAPI
    - Upload to storage with retry
    - HTML image injection

    Usage:
        async with UnifiedImageService() as service:
            # Search and upload a single image
            url = await service.search_and_upload_image("Tesla Model S")

            # Resolve all images in HTML
            html, images = await service.resolve_images_for_html(html_content, context)
    """

    def __init__(self, deck_uuid: Optional[str] = None):
        """
        Initialize the service.

        Args:
            deck_uuid: Optional deck UUID for caching
        """
        self._deck_uuid = deck_uuid
        self._serpapi = None
        self._storage = None
        self._cache = None
        self._initialized = False

    async def __aenter__(self):
        await self._initialize()
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        await self._cleanup()

    async def _initialize(self):
        """Initialize services lazily."""
        if self._initialized:
            return

        try:
            from services.serpapi_service import SerpAPIService
            from services.image_storage_service import ImageStorageService
            from services.image_cache import ImageSearchCache

            self._serpapi = SerpAPIService()
            self._storage = ImageStorageService()
            self._cache = ImageSearchCache(self._deck_uuid) if self._deck_uuid else None

            self._initialized = True
            logger.debug("[UnifiedImageService] Initialized (SerpAPI=%s)", self._serpapi.is_available)

        except Exception as e:
            logger.warning("[UnifiedImageService] Initialization error: %s", e)

    async def _cleanup(self):
        """Cleanup resources."""
        if self._storage:
            try:
                await self._storage.__aexit__(None, None, None)
            except Exception:
                pass
        self._initialized = False

    @property
    def is_available(self) -> bool:
        """Check if the service is available."""
        return self._initialized and self._serpapi and self._serpapi.is_available

    # ==================== CORE METHODS ====================

    async def search_and_upload_image(
        self,
        query: str,
        slide_context: str = '',
        num_candidates: int = 5,
        orientation: Optional[str] = 'landscape',
    ) -> Optional[str]:
        """
        Search for an image, try to upload, fallback to next result if fails.

        This is the main entry point for getting a single image. It handles:
        1. Logo detection (routes to logo.dev)
        2. Generic query enhancement
        3. SerpAPI search with multiple candidates
        4. Upload with retry (tries next result on failure)

        Args:
            query: The search query (e.g., "SpaceX Falcon 9")
            slide_context: Optional context for AI query enhancement
            num_candidates: Number of search results to try
            orientation: Image orientation (landscape, portrait, square)

        Returns:
            Uploaded URL in our bucket, or None if all candidates failed
        """
        await self._initialize()

        if not query or not self._serpapi:
            return None

        original_query = query

        # Check cache first
        if self._cache:
            cached = self._cache.get(original_query)
            if cached:
                logger.debug("[UnifiedImageService] Cache hit: %s", original_query[:40])
                return cached

        # Check if it's a company logo query
        is_logo, company_name = is_company_logo_query(query)
        if is_logo and company_name:
            logger.info("[UnifiedImageService] Routing to logo.dev: %s", company_name)
            logo_url = await fetch_logo(company_name, self._cache)
            if logo_url:
                return logo_url
            # Don't fall back to SerpAPI for logos - they return bad results
            logger.warning("[UnifiedImageService] Logo.dev failed for %s", company_name)
            return None

        # Skip generic logo queries entirely
        if 'logo' in query.lower() and is_generic_query(query):
            logger.info("[UnifiedImageService] Skipping generic logo query: %s", query)
            return None

        # Enhance generic queries
        search_query = query
        if is_generic_query(query):
            if slide_context:
                logger.info("[UnifiedImageService] Enhancing generic query: %s", query[:40])
                context_hint = f"Generate image query from context (original was too generic: '{query}'). {slide_context}"
                search_query = await enhance_query_with_ai(query, context_hint)

                # If enhancement didn't help, skip
                if is_generic_query(search_query):
                    logger.warning("[UnifiedImageService] Could not enhance generic query: %s", query)
                    return None
            else:
                logger.warning("[UnifiedImageService] Skipping generic query (no context): %s", query)
                return None

        # Truncate long queries
        words = search_query.split()
        if len(words) > 6:
            search_query = ' '.join(words[:6])

        logger.info("[UnifiedImageService] Searching: '%s'", search_query[:50])

        # Search SerpAPI
        try:
            results = await self._serpapi.search_images(
                query=search_query,
                per_page=num_candidates,
                orientation=orientation,
            )
        except Exception as e:
            logger.warning("[UnifiedImageService] SerpAPI search failed: %s", e)
            return None

        photos = results.get('photos', []) if isinstance(results, dict) else []
        if not photos:
            logger.warning("[UnifiedImageService] No results for: %s", search_query[:40])
            return None

        # Try each candidate until one uploads successfully
        for i, photo in enumerate(photos[:num_candidates]):
            url = (
                photo.get('url') or
                photo.get('original') or
                photo.get('thumbnail_url') or
                photo.get('src', {}).get('original')
            )

            if not url:
                continue

            # Skip blocked domains
            if is_blocked_domain(url):
                logger.debug("[UnifiedImageService] Skipping blocked domain: %s", url[:50])
                continue

            try:
                upload_result = await self._storage.upload_image_from_url(url)

                if upload_result and 'error' not in upload_result and upload_result.get('url'):
                    our_url = upload_result['url']
                    logger.info("[UnifiedImageService] Uploaded image %d/%d: %s", i + 1, len(photos), our_url[:60])

                    # Cache the result
                    if self._cache:
                        self._cache.set(original_query, our_url)

                    return our_url

            except asyncio.TimeoutError:
                logger.debug("[UnifiedImageService] Upload timeout for %s, trying next", url[:50])
            except Exception as e:
                logger.debug("[UnifiedImageService] Upload failed for %s: %s", url[:50], e)

        logger.warning("[UnifiedImageService] All %d candidates failed for: %s", len(photos), search_query[:40])
        return None

    async def search_images_batch(
        self,
        queries: List[Tuple[str, str]],  # (prop_name, query)
        slide_context: str = '',
        max_concurrent: int = 8,
    ) -> Dict[str, str]:
        """
        Search multiple images in parallel with retry logic.

        Args:
            queries: List of (prop_name, query) tuples
            slide_context: Context for AI query enhancement
            max_concurrent: Maximum concurrent searches

        Returns:
            Dict mapping prop_name to uploaded URL
        """
        await self._initialize()

        if not queries:
            return {}

        results: Dict[str, str] = {}

        async def search_one(prop_name: str, query: str) -> Tuple[str, str, Optional[str]]:
            url = await self.search_and_upload_image(query, slide_context)
            return (prop_name, query, url)

        # Limit concurrency
        limited_queries = queries[:max_concurrent]

        tasks = [
            asyncio.create_task(search_one(prop_name, query))
            for prop_name, query in limited_queries
        ]

        completed = await asyncio.gather(*tasks, return_exceptions=True)

        for result in completed:
            if isinstance(result, tuple) and len(result) == 3 and result[2]:
                prop_name, query, url = result
                results[prop_name] = url
                results[f"{prop_name}_query"] = query

        logger.info("[UnifiedImageService] Batch search: %d/%d succeeded", len(results) // 2, len(queries))
        return results

    async def resolve_images_for_html(
        self,
        html: str,
        slide_context: str = '',
        theme: Optional[Dict[str, Any]] = None,
        available_images: Optional[Dict[str, str]] = None,
    ) -> Tuple[str, Dict[str, str]]:
        """
        Main method: Find placeholders, search images, inject into HTML.

        This is the high-level entry point for resolving all images in HTML.

        Steps:
        1. Check if HTML needs image resolution
        2. Extract placeholder images from HTML
        3. Match against available images (if provided)
        4. For remaining: detect logos vs regular images
        5. Fetch logos from logo.dev (with fallback)
        6. Search regular images via SerpAPI (with retry on failure)
        7. Upload all to storage
        8. Inject URLs into HTML

        Args:
            html: HTML content with placeholders
            slide_context: Context for AI enhancement
            theme: Optional theme dict with brandInfo
            available_images: Optional pre-resolved images

        Returns:
            Tuple of (resolved_html, prefetched_images_dict)
        """
        await self._initialize()

        if not html:
            return html, {}

        prefetched_images = dict(available_images or {})

        # Check if resolution is needed
        if not needs_image_search(html):
            logger.debug("[UnifiedImageService] No image resolution needed")
            return html, prefetched_images

        # Extract placeholders
        placeholders = extract_placeholder_images_from_html(html)
        logger.info("[UnifiedImageService] Found %d placeholders", len(placeholders))

        if not placeholders:
            return html, prefetched_images

        # Separate logo queries from regular queries
        logo_queries: List[Tuple[str, str, str]] = []  # (prop_name, query, company_name)
        regular_queries: List[Tuple[str, str]] = []

        for prop_name, query, original_src in placeholders:
            # Skip already resolved
            if prop_name in prefetched_images:
                continue

            # Check if logo query
            is_logo, company_name = is_company_logo_query(query)
            if is_logo and company_name:
                logo_queries.append((prop_name, query, company_name))
            elif 'logo' in query.lower():
                # Try to get logo from theme
                logo_url = await resolve_logo_url(query, theme, self._cache)
                if logo_url:
                    prefetched_images[prop_name] = logo_url
                    prefetched_images[f"{prop_name}_query"] = query
                # Skip generic logo queries
            else:
                regular_queries.append((prop_name, query))

        # Fetch logos in parallel
        if logo_queries and is_logodev_available():
            logger.info("[UnifiedImageService] Fetching %d logos", len(logo_queries))
            logo_tasks = [
                fetch_logo(company_name, self._cache)
                for _, _, company_name in logo_queries
            ]
            logo_results = await asyncio.gather(*logo_tasks, return_exceptions=True)

            for i, result in enumerate(logo_results):
                prop_name, query, company_name = logo_queries[i]
                if isinstance(result, str) and result:
                    prefetched_images[prop_name] = result
                    prefetched_images[f"{prop_name}_query"] = query
                elif not isinstance(result, Exception):
                    # Logo not found, don't fall back to SerpAPI
                    pass

        # Search regular images
        if regular_queries:
            logger.info("[UnifiedImageService] Searching %d images", len(regular_queries))
            search_results = await self.search_images_batch(regular_queries, slide_context)
            prefetched_images.update(search_results)

        # Inject images into HTML
        resolved_html = self._inject_images(html, prefetched_images)

        image_count = len([k for k in prefetched_images if not k.endswith('_query')])
        logger.info("[UnifiedImageService] Resolved %d images", image_count)

        return resolved_html, prefetched_images

    async def upload_external_urls(
        self,
        html: str,
        search_fallback: bool = True,
    ) -> str:
        """
        Upload external image URLs to storage and replace them in HTML.

        If any external URL fails to download, optionally falls back to
        searching for a replacement image using the alt text.

        Args:
            html: HTML content with external URLs
            search_fallback: Whether to search for replacement on failure

        Returns:
            HTML with external URLs replaced by bucket URLs
        """
        await self._initialize()

        if not html:
            return html

        external_urls = find_external_image_urls(html)
        if not external_urls:
            return html

        logger.info("[UnifiedImageService] Uploading %d external URLs", len(external_urls))

        for url in external_urls:
            # Skip blocked domains entirely
            if is_blocked_domain(url):
                if search_fallback:
                    alt = self._extract_alt_for_url(html, url)
                    if alt:
                        replacement = await self.search_and_upload_image(alt)
                        if replacement:
                            html = html.replace(url, replacement)
                continue

            try:
                upload_result = await self._storage.upload_image_from_url(url)

                if upload_result and 'error' not in upload_result:
                    bucket_url = upload_result.get('url')
                    if bucket_url and is_bucket_url(bucket_url):
                        html = html.replace(url, bucket_url)
                        continue

                # Upload failed - try fallback
                if search_fallback:
                    alt = self._extract_alt_for_url(html, url)
                    if alt:
                        replacement = await self.search_and_upload_image(alt)
                        if replacement:
                            html = html.replace(url, replacement)

            except Exception as e:
                logger.warning("[UnifiedImageService] Upload failed for %s: %s", url[:50], e)
                if search_fallback:
                    alt = self._extract_alt_for_url(html, url)
                    if alt:
                        replacement = await self.search_and_upload_image(alt)
                        if replacement:
                            html = html.replace(url, replacement)

        return html

    # ==================== HELPER METHODS ====================

    def _inject_images(self, html: str, images: Dict[str, str]) -> str:
        """Inject prefetched images into HTML placeholders."""
        if not html or not images:
            return html

        # Get image URLs (excluding _query keys)
        image_urls = [
            v for k, v in images.items()
            if not k.endswith('_query') and v.startswith('http')
        ]

        if not image_urls:
            return html

        result = html
        image_index = 0

        # Build alt -> URL mapping
        alt_url_map = {}
        for key, url in images.items():
            if key.startswith('alt_') and url.startswith('http'):
                query = images.get(f"{key}_query") or key[4:].replace('_', ' ')
                if query:
                    alt_url_map[query.strip().lower()] = url

        def match_alt_url(alt_text: str) -> Optional[str]:
            if not alt_text:
                return None
            alt_norm = alt_text.strip().lower()
            # Exact match
            if alt_norm in alt_url_map:
                return alt_url_map[alt_norm]
            # Substring match
            for query, url in alt_url_map.items():
                if query in alt_norm or alt_norm in query:
                    return url
            return None

        # Replace template variables: ${varName}
        def replace_template_var(match):
            nonlocal image_index
            before = match.group(1)
            var_name = match.group(2)
            after = match.group(3)

            if var_name in images and images[var_name].startswith('http'):
                url = images[var_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                return match.group(0)

            return f'<img {before}src="{url}"{after}>'

        result = re.sub(
            r'<img\s*([^>]*?)src=["\']?\$\{+\s*(\w+)\s*\}+["\']?([^>]*?)>',
            replace_template_var,
            result,
            flags=re.IGNORECASE
        )

        # Replace props references: props.varName
        def replace_props_ref(match):
            nonlocal image_index
            before = match.group(1)
            prop_name = match.group(2)
            after = match.group(3)

            if prop_name in images and images[prop_name].startswith('http'):
                url = images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                return match.group(0)

            return f'<img {before}src="{url}"{after}>'

        result = re.sub(
            r'<img\s*([^>]*?)src=["\']props\.(\w+)["\']([^>]*?)>',
            replace_props_ref,
            result,
            flags=re.IGNORECASE
        )

        # Replace placeholder src
        def replace_placeholder(match):
            nonlocal image_index
            before = match.group(1)
            after = match.group(3)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                return match.group(0)

            return f'<img {before}src="{url}"{after}>'

        result = re.sub(
            r'<img\s*([^>]*?)src=(["\'])(?:placeholder)?\2([^>]*?)>',
            replace_placeholder,
            result,
            flags=re.IGNORECASE
        )

        # Replace by alt text matching
        def replace_by_alt(match):
            img_tag = match.group(0)

            # Skip if already has our bucket URL
            if any(domain in img_tag.lower() for domain in BUCKET_DOMAINS):
                return img_tag

            # Extract alt text
            alt_match = re.search(r'alt=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
            if not alt_match:
                return img_tag

            alt_text = alt_match.group(1)
            url = match_alt_url(alt_text)

            if url:
                return re.sub(r'src=["\'][^"\']*["\']', f'src="{url}"', img_tag)

            return img_tag

        result = re.sub(r'<img[^>]+>', replace_by_alt, result, flags=re.IGNORECASE)

        return result

    def _extract_alt_for_url(self, html: str, url: str) -> Optional[str]:
        """Extract alt text from an img tag containing the given URL."""
        escaped_url = re.escape(url)

        # Try alt before src
        match = re.search(
            rf'<img[^>]*alt=["\']([^"\']+)["\'][^>]*src=["\']?{escaped_url}',
            html,
            re.IGNORECASE
        )
        if match:
            return match.group(1)

        # Try src before alt
        match = re.search(
            rf'<img[^>]*src=["\']?{escaped_url}["\']?[^>]*alt=["\']([^"\']+)["\']',
            html,
            re.IGNORECASE
        )
        if match:
            return match.group(1)

        return None


# ==================== CONVENIENCE FUNCTIONS ====================

async def search_and_upload_image(
    query: str,
    slide_context: str = '',
    deck_uuid: Optional[str] = None,
) -> Optional[str]:
    """
    Convenience function for one-off image searches.

    For multiple searches, use UnifiedImageService directly.
    """
    async with UnifiedImageService(deck_uuid) as service:
        return await service.search_and_upload_image(query, slide_context)


async def resolve_images_for_html(
    html: str,
    slide_context: str = '',
    theme: Optional[Dict[str, Any]] = None,
    deck_uuid: Optional[str] = None,
) -> Tuple[str, Dict[str, str]]:
    """
    Convenience function for resolving images in HTML.

    For multiple operations, use UnifiedImageService directly.
    """
    async with UnifiedImageService(deck_uuid) as service:
        return await service.resolve_images_for_html(html, slide_context, theme)
