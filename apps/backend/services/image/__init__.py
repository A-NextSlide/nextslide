"""
Unified Image Service Module
----------------------------
Consolidated image search, logo fetching, and placeholder resolution.

This module provides a single, clean API for all image-related operations
in the application.

Main Entry Points:
    UnifiedImageService - Main service class with retry/fallback logic
    search_and_upload_image - Convenience function for one-off searches
    resolve_images_for_html - Convenience function for HTML image resolution

Utility Modules:
    constants - Domain lists and configuration
    placeholder_detector - Placeholder detection logic
    domain_filter - URL domain filtering
    query_builder - Query extraction and AI enhancement
    logo_resolver - Logo detection and fetching
"""

from .unified_image_service import (
    UnifiedImageService,
    search_and_upload_image,
    resolve_images_for_html,
)

from .placeholder_detector import (
    is_placeholder_src,
    is_bucket_url,
    needs_image_search,
    find_external_image_urls,
    extract_placeholder_images_from_html,
)

from .domain_filter import (
    is_blocked_domain,
    is_preferred_domain,
    get_domain_priority,
    sort_urls_by_reliability,
)

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

from .constants import (
    BLOCKED_DOMAINS,
    PREFERRED_DOMAINS,
    BUCKET_DOMAINS,
    GENERIC_IMAGE_TERMS,
    IMAGE_PROP_TOKENS,
    GENERIC_VAR_NAMES,
)

__all__ = [
    # Main service
    'UnifiedImageService',
    'search_and_upload_image',
    'resolve_images_for_html',
    # Placeholder detection
    'is_placeholder_src',
    'is_bucket_url',
    'needs_image_search',
    'find_external_image_urls',
    'extract_placeholder_images_from_html',
    # Domain filtering
    'is_blocked_domain',
    'is_preferred_domain',
    'get_domain_priority',
    'sort_urls_by_reliability',
    # Query building
    'extract_query_from_prop_name',
    'is_generic_query',
    'clean_query',
    'enhance_query_with_ai',
    'build_search_context',
    # Logo resolution
    'is_company_logo_query',
    'fetch_logo',
    'resolve_logo_url',
    'extract_brand_from_theme',
    'is_logodev_available',
    # Constants
    'BLOCKED_DOMAINS',
    'PREFERRED_DOMAINS',
    'BUCKET_DOMAINS',
    'GENERIC_IMAGE_TERMS',
    'IMAGE_PROP_TOKENS',
    'GENERIC_VAR_NAMES',
]
