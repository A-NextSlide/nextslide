"""Domain filtering utilities for image URLs."""

from urllib.parse import urlparse

from .constants import BLOCKED_DOMAINS, PREFERRED_DOMAINS, BUCKET_DOMAINS


def is_blocked_domain(url: str) -> bool:
    """
    Check if URL is from a domain that blocks hotlinking or has CORS issues.

    These domains will always fail when trying to fetch images directly.
    """
    if not url:
        return False

    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        for blocked in BLOCKED_DOMAINS:
            if blocked in domain:
                return True

        return False
    except Exception:
        return False


def is_preferred_domain(url: str) -> bool:
    """
    Check if URL is from a domain known to be reliable for direct image access.

    These domains generally have good uptime and don't block hotlinking.
    """
    if not url:
        return False

    try:
        parsed = urlparse(url)
        domain = parsed.netloc.lower()

        for preferred in PREFERRED_DOMAINS:
            if preferred in domain:
                return True

        return False
    except Exception:
        return False


def is_bucket_url(url: str) -> bool:
    """Check if URL is from our storage bucket (already uploaded)."""
    if not url:
        return False

    url_lower = url.lower()
    return any(domain in url_lower for domain in BUCKET_DOMAINS)


def get_domain_priority(url: str) -> int:
    """
    Get priority score for URL based on domain reliability.

    Lower score = higher priority (more reliable).

    Returns:
        0: Our bucket (already uploaded)
        1: Preferred domain (Unsplash, Pexels, etc.)
        2: Unknown domain (might work)
        3: Blocked domain (will fail)
    """
    if is_bucket_url(url):
        return 0
    if is_preferred_domain(url):
        return 1
    if is_blocked_domain(url):
        return 3
    return 2


def sort_urls_by_reliability(urls: list) -> list:
    """Sort URLs by domain reliability, most reliable first."""
    return sorted(urls, key=get_domain_priority)
