"""Single source of truth for placeholder detection logic."""

import re
from typing import List, Tuple

from .constants import BUCKET_DOMAINS


def is_placeholder_src(src: str) -> bool:
    """
    Determine if an image src value is a placeholder that needs replacement.

    This is the single source of truth for placeholder detection across the codebase.

    Returns True if:
    - src is empty or None
    - src equals "placeholder" (case-insensitive)
    - src contains "placeholder" anywhere
    - src is a template variable (${...} or props....)
    - src is not a valid URL (doesn't start with http, data:, or blob:)

    Returns False if:
    - src is a valid HTTP(S) URL
    - src is a data URL
    - src is a blob URL
    """
    if not src:
        return True

    stripped = src.strip()
    lowered = stripped.lower()

    # Single character or very short values are placeholders (AI generates "Z", "X", etc.)
    if len(stripped) <= 2 and stripped.isalpha():
        return True

    # Common invalid values AI generates
    invalid_values = {'none', 'null', 'undefined', 'n/a', 'tbd', 'todo', 'image', 'z', 'x'}
    if lowered in invalid_values:
        return True

    # Exact placeholder match
    if lowered == 'placeholder':
        return True

    # Contains placeholder in path
    if 'placeholder' in lowered:
        return True

    # Template variables
    if lowered.startswith('${') or lowered.startswith('props.'):
        return True

    # Check for valid URL schemes
    valid_schemes = ('http://', 'https://', 'data:', 'blob:')
    if any(lowered.startswith(scheme) for scheme in valid_schemes):
        # Localhost URLs are placeholders — AI sometimes generates these
        if 'localhost' in lowered or '127.0.0.1' in lowered:
            return True
        # URLs with /undefined or /null in path are broken references
        if '/undefined' in lowered or '/null' in lowered:
            return True
        # Placeholder image services — AI generates these instead of literal "placeholder"
        placeholder_services = (
            'placehold.co/', 'placeholder.com/', 'via.placeholder.com/',
            'placekitten.com/', 'placebear.com/', 'dummyimage.com/',
            'fakeimg.pl/', 'picsum.photos/', 'loremflickr.com/',
        )
        if any(svc in lowered for svc in placeholder_services):
            return True
        return False

    # Anything else is considered a placeholder (local paths, etc.)
    return True


def is_bucket_url(url: str) -> bool:
    """Check if URL is from our storage bucket (already uploaded)."""
    if not url:
        return False
    url_lower = url.lower()
    return any(domain in url_lower for domain in BUCKET_DOMAINS)


def needs_image_search(html: str) -> bool:
    """
    Determine if HTML content needs image search/replacement.

    Returns True if:
    - Contains "placeholder" (case-insensitive)
    - Contains template variables (${)
    - Contains empty src attributes
    - Contains short invalid values like "Z", "None", etc.
    - Contains external URLs not from our bucket
    """
    if not html:
        return False

    html_lower = html.lower()

    # Check for obvious placeholders
    if 'placeholder' in html_lower:
        return True

    # Check for placeholder image services (AI generates these instead of "placeholder")
    if 'placehold.co/' in html_lower or 'via.placeholder.com/' in html_lower or 'dummyimage.com/' in html_lower:
        return True

    # Check for template variables
    if '${' in html:
        return True

    # Check for empty src
    if 'src=""' in html or "src=''" in html:
        return True

    # Check for short invalid src values (single letters, "None", "Z", etc.)
    # These are common AI-generated placeholder values
    import re
    invalid_src_pattern = r'src=["\']([A-Za-z]{1,2}|None|null|undefined|N/A|TBD|TODO)["\']'
    if re.search(invalid_src_pattern, html, re.IGNORECASE):
        return True

    # Check for external image URLs
    external_urls = find_external_image_urls(html)
    if external_urls:
        return True

    return False


def find_external_image_urls(html: str) -> List[str]:
    """
    Find all external image URLs in HTML that need to be uploaded to our bucket.

    Searches in:
    - <img src="..."> tags
    - CSS background-image: url(...)
    - data-src and other data attributes
    - JavaScript strings containing image URLs
    - Common image CDN URLs
    """
    if not html:
        return []

    urls = set()

    # Pattern 1: <img src="..."> tags
    img_urls = re.findall(
        r'<img[^>]*src=["\']?(https?://[^\s"\'>]+)["\']?',
        html,
        re.IGNORECASE
    )
    urls.update(img_urls)

    # Pattern 2: CSS background-image: url(...)
    css_urls = re.findall(
        r'url\(["\']?(https?://[^"\'\)]+)["\']?\)',
        html,
        re.IGNORECASE
    )
    urls.update(css_urls)

    # Pattern 3: data-src, data-image, etc.
    data_urls = re.findall(
        r'data-(?:src|image|bg|background)["\s]*=["\s]*["\']?(https?://[^\s"\'>]+)["\']?',
        html,
        re.IGNORECASE
    )
    urls.update(data_urls)

    # Pattern 4: JavaScript strings with image URLs
    js_urls = re.findall(
        r'["\']+(https?://[^"\']+\.(?:jpg|jpeg|png|gif|webp|svg|avif)(?:\?[^"\']*)?)["\']',
        html,
        re.IGNORECASE
    )
    urls.update(js_urls)

    # Pattern 5: Common image CDNs
    cdn_urls = re.findall(
        r'(https?://(?:images\.unsplash\.com|images\.pexels\.com|cdn\.pixabay\.com|res\.cloudinary\.com)[^\s"\'<>\)]+)',
        html,
        re.IGNORECASE
    )
    urls.update(cdn_urls)

    # Filter to only external URLs (not our bucket)
    external_urls = [
        url for url in urls
        if not is_bucket_url(url)
    ]

    # Clean up URLs - remove trailing punctuation
    cleaned_urls = []
    for url in external_urls:
        url = url.rstrip('"\',;)]}>').rstrip()
        if url.startswith('http'):
            cleaned_urls.append(url)

    # Deduplicate while preserving order
    seen = set()
    unique_urls = []
    for url in cleaned_urls:
        if url not in seen:
            seen.add(url)
            unique_urls.append(url)

    return unique_urls


def extract_placeholder_images_from_html(html: str) -> List[Tuple[str, str, str]]:
    """
    Extract placeholder images from HTML and generate search queries.

    Returns list of tuples: (prop_name, search_query, original_src)
    """
    if not html:
        return []

    placeholders = []
    seen_queries = set()

    # Find all img tags
    img_pattern = re.compile(r'<img[^>]*>', re.IGNORECASE)

    for match in img_pattern.finditer(html):
        img_tag = match.group(0)

        # Extract src attribute
        src_match = re.search(r'src=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
        if not src_match:
            src_match = re.search(r'src=([^\s"\'>]+)', img_tag, re.IGNORECASE)
        src = src_match.group(1) if src_match else ''

        # Check if it's a placeholder
        if not is_placeholder_src(src):
            continue

        # Extract alt text
        alt_match = re.search(r'alt=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
        alt = alt_match.group(1).strip() if alt_match else ''

        # Skip template variables in alt text
        if alt and ('${' in alt or alt.startswith('{') or 'props.' in alt):
            continue

        # Try to extract prop name from src template variable
        prop_name = ''
        search_query = ''

        var_match = re.search(r'\$\{+\s*(\w+)\s*\}+', src)
        if var_match:
            var_name = var_match.group(1)
            prop_name = var_name
            search_query = _extract_query_from_prop_name(var_name)

        # Fall back to alt text if no query from prop name
        if not search_query and alt:
            search_query = alt
            if not prop_name:
                prop_name = f"alt_{alt.replace(' ', '_').replace('-', '_')[:30]}"

        # Skip if no query or duplicate
        if not search_query:
            continue
        query_key = search_query.lower()
        if query_key in seen_queries:
            continue
        seen_queries.add(query_key)

        placeholders.append((prop_name, search_query, src))

    return placeholders


def _extract_query_from_prop_name(prop_name: str) -> str:
    """Convert a camelCase prop name to a search query."""
    if not prop_name:
        return ''

    # Remove common suffixes
    clean_name = re.sub(
        r'(Image|Photo|Pic|Picture|Img|Src|Url|Background|Bg|Thumbnail|Avatar|Icon|Logo|Banner)$',
        '',
        prop_name,
        flags=re.IGNORECASE
    )

    # Convert camelCase to spaces
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', clean_name)
    spaced = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', spaced)
    spaced = re.sub(r'(\d)([a-zA-Z])', r'\1 \2', spaced)

    return spaced.strip().lower()
