"""Logo detection and fetching from logo.dev."""

import re
from typing import Optional, Tuple

from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Check if logo.dev service is available
_LOGODEV_AVAILABLE = False
try:
    from agents.tools.theme.logodev_service import LogoDevService
    _LOGODEV_AVAILABLE = True
except ImportError:
    logger.debug("[LOGO_RESOLVER] logo.dev service not available")


def is_company_logo_query(query: str) -> Tuple[bool, str]:
    """
    Detect if a query is for a company logo and extract the company name.

    Recognized patterns:
    - "Apple logo" -> (True, "Apple")
    - "logo of Google" -> (True, "Google")
    - "logo for Netflix" -> (True, "Netflix")
    - "logo" -> (False, "") # Too generic
    - "company logo" -> (False, "") # Too generic

    Returns:
        Tuple of (is_logo_query, company_name)
    """
    if not query:
        return False, ''

    q = query.lower().strip()

    # Skip generic logo queries that produce random vistaprint results
    generic_terms = {
        'logo', 'company logo', 'brand logo',
        'business logo', 'corporate logo'
    }
    if q in generic_terms:
        return False, ''

    # Pattern 1: "Apple logo", "Google Logo", "Microsoft logo"
    logo_suffix_match = re.match(r'^(.+?)\s+logo\s*$', q, re.IGNORECASE)
    if logo_suffix_match:
        company = logo_suffix_match.group(1).strip()
        # Filter out generic terms
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    # Pattern 2: "logo of Apple", "logo for Google"
    logo_prefix_match = re.match(r'^logo\s+(?:of|for)\s+(.+)$', q, re.IGNORECASE)
    if logo_prefix_match:
        company = logo_prefix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    return False, ''


async def fetch_logo(
    company_name: str,
    cache: Optional['ImageSearchCache'] = None,
) -> Optional[str]:
    """
    Fetch a company logo from logo.dev and upload to our storage.

    This is the preferred method for getting company logos, as it
    returns clean, high-quality logo images without watermarks.

    Args:
        company_name: The company name to fetch logo for
        cache: Optional cache to check/store results

    Returns:
        URL of uploaded logo in our bucket, or None if not found
    """
    if not _LOGODEV_AVAILABLE:
        logger.debug("[LOGO_RESOLVER] logo.dev service not available")
        return None

    if not company_name:
        return None

    # Check cache first
    cache_key = f"{company_name.lower()} logo"
    if cache:
        cached = cache.get(cache_key)
        if cached:
            logger.debug("[LOGO_RESOLVER] Cache hit for %s logo", company_name)
            return cached

    try:
        from services.image_storage_service import ImageStorageService

        async with LogoDevService() as logo_service:
            result = await logo_service.get_logo_with_fallback(company_name)

            if not result.get('available') or not result.get('logo_url'):
                logger.debug("[LOGO_RESOLVER] No logo found for: %s", company_name)
                return None

            logo_url = result['logo_url']
            logger.info("[LOGO_RESOLVER] Found logo for %s: %s", company_name, logo_url[:60])

            # Upload to our storage for consistent delivery
            async with ImageStorageService() as storage:
                upload_result = await storage.upload_image_from_url(
                    logo_url,
                    metadata={'source': 'logodev', 'company': company_name}
                )

                if upload_result and upload_result.get('url'):
                    final_url = upload_result['url']
                    logger.info("[LOGO_RESOLVER] Uploaded %s logo to storage", company_name)

                    # Cache the result
                    if cache:
                        cache.set(cache_key, final_url)

                    return final_url

    except Exception as e:
        logger.warning("[LOGO_RESOLVER] Error fetching logo for %s: %s", company_name, e)

    return None


async def resolve_logo_url(
    query: str,
    theme: Optional[dict] = None,
    cache: Optional['ImageSearchCache'] = None,
) -> Optional[str]:
    """
    Resolve a logo URL from various sources.

    Priority:
    1. Theme logo (from Brandfetch)
    2. logo.dev lookup

    Args:
        query: The search query (e.g., "Apple logo")
        theme: Optional theme dict with brandInfo
        cache: Optional cache

    Returns:
        Logo URL or None
    """
    # Check if it's actually a logo query
    is_logo, company_name = is_company_logo_query(query)

    if not is_logo:
        return None

    # Try theme logo first
    if theme:
        brand_info = theme.get('brandInfo', {})
        color_palette = theme.get('color_palette', {})

        theme_logo = (
            brand_info.get('logoUrl') or
            brand_info.get('logo_url') or
            color_palette.get('metadata', {}).get('logo_url') or
            color_palette.get('metadata', {}).get('logo_url_light')
        )

        # Skip base64 data URLs - they're too large
        if theme_logo and not theme_logo.startswith('data:'):
            # Clean up trailing ?
            if theme_logo.endswith('?'):
                theme_logo = theme_logo[:-1]
            logger.info("[LOGO_RESOLVER] Using theme logo for %s", company_name)
            return theme_logo

    # Try logo.dev
    logo_url = await fetch_logo(company_name, cache)
    if logo_url:
        return logo_url

    return None


def extract_brand_from_theme(theme: dict) -> Optional[str]:
    """Extract brand name from theme dictionary."""
    if not theme:
        return None

    brand_info = theme.get('brandInfo', {})
    color_palette = theme.get('color_palette', {})

    brand_name = (
        brand_info.get('name') or
        brand_info.get('domain') or
        color_palette.get('metadata', {}).get('brand_name') or
        color_palette.get('metadata', {}).get('domain')
    )

    return brand_name


def is_logodev_available() -> bool:
    """Check if logo.dev service is available."""
    return _LOGODEV_AVAILABLE
