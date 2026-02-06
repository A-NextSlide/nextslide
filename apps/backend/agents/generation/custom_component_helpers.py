"""Helper utilities for CustomComponent generation."""

import asyncio
import re
from typing import Dict, Any, Optional, List, Tuple

from agents.ai.clients import get_client, invoke
from agents.config import IMAGE_SEARCH_MODEL
from services.image_cache import ImageSearchCache
from services.image import (
    is_company_logo_query as unified_is_company_logo_query,
    fetch_logo as unified_fetch_logo,
    is_generic_query as unified_is_generic_query,
    is_placeholder_src,
    is_logodev_available,
    GENERIC_IMAGE_TERMS,
)
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Use unified service for logo.dev availability
LOGODEV_AVAILABLE = is_logodev_available()

# Maximum dimensions for reference images (to prevent token explosion)
MAX_IMAGE_DIMENSION = 384
MAX_IMAGE_BYTES = 150_000
JPEG_QUALITY = 60

IMAGE_PROP_TOKENS = (
    "image",
    "photo",
    "pic",
    "picture",
    "img",
    "avatar",
    "logo",
    "bg",
    "background",
    "banner",
    "thumb",
    "thumbnail",
    "icon",
    "poster",
    "cover",
)
GENERIC_VAR_NAMES = {
    "obj",
    "item",
    "data",
    "entry",
    "row",
    "card",
    "element",
    "node",
}


def _is_garbage_image_query(query: str) -> bool:
    """Reject queries that are clearly JS variable names, not image descriptions.

    Returns True if the query looks like a camelCase variable name or generic
    JS identifier rather than a meaningful image search term.

    Examples of garbage: "img trad", "bg images", "image alts", "photo el",
                         "imgAi", "bgImage", "thumb alt"
    Examples of valid:   "Tesla office building", "mountain landscape sunset"
    """
    if not query:
        return True

    q = query.strip().lower()
    words = q.split()

    # Single word that's just a generic image token → garbage
    if len(words) == 1:
        if q in {'image', 'img', 'photo', 'pic', 'bg', 'background', 'src',
                 'thumbnail', 'thumb', 'icon', 'banner', 'cover', 'poster',
                 'avatar', 'picture'}:
            return True

    # 1-2 word query where every word is a generic image/JS token → garbage
    if len(words) <= 2:
        garbage_tokens = {
            'image', 'images', 'img', 'imgs', 'photo', 'photos', 'pic', 'pics',
            'bg', 'background', 'src', 'thumbnail', 'thumb', 'icon', 'banner',
            'cover', 'poster', 'avatar', 'picture', 'pictures',
            # Common JS suffixes that leak through camelCase splitting
            'el', 'alt', 'alts', 'url', 'urls', 'trad', 'ai', 'default',
            'main', 'primary', 'secondary', 'item', 'items', 'data',
            'card', 'cards', 'hero', 'featured', 'stage',
        }
        if all(w in garbage_tokens for w in words):
            return True

    # Detect camelCase variable names that got space-separated
    # e.g., "imgTrad" → after splitting becomes "img trad"
    # Original was likely a camelCase prop name with no real description
    joined = ''.join(words)
    if len(joined) <= 12 and not any(c == ' ' for c in query.strip()):
        # Original query had no spaces — it's a raw variable name
        if re.match(r'^[a-z]+[A-Z][a-zA-Z]*$', query.strip()):
            return True

    return False


def _is_company_logo_query(query: str) -> Tuple[bool, str]:
    """
    Detect if a query is for a company logo and extract the company name.

    Uses unified service implementation.

    Returns:
        Tuple of (is_logo_query, company_name)
    """
    return unified_is_company_logo_query(query)


async def _fetch_logo_from_logodev(company_name: str, cache: Optional[ImageSearchCache] = None) -> Optional[str]:
    """
    Fetch a company logo from logo.dev and upload to our storage.

    Uses unified service implementation.

    Returns:
        URL of uploaded logo, or None if not found
    """
    return await unified_fetch_logo(company_name, cache)


async def _fetch_image_dimensions(image_url: str) -> Optional[Tuple[int, int]]:
    """Fetch image dimensions by downloading and reading the image header.

    Uses PIL to read just enough of the image to get dimensions without loading full image.
    Returns (width, height) or None if unable to determine.
    """
    if not image_url or not image_url.startswith('http'):
        return None

    try:
        import aiohttp
        from PIL import Image
        from io import BytesIO

        async with aiohttp.ClientSession() as session:
            # Only fetch first 64KB - enough for most image headers
            headers = {
                'User-Agent': 'Mozilla/5.0 (compatible; ImageBot/1.0)',
                'Range': 'bytes=0-65535'
            }
            async with session.get(image_url, headers=headers, timeout=10) as response:
                if response.status in (200, 206):
                    content = await response.read()
                    img = Image.open(BytesIO(content))
                    width, height = img.size
                    logger.debug(f"[IMAGE_DIMS] Got dimensions for {image_url[:50]}...: {width}x{height}")
                    return (width, height)
    except Exception as e:
        logger.debug(f"[IMAGE_DIMS] Failed to get dimensions: {e}")

    return None


def _extract_search_query_from_prop_name(prop_name: str) -> str:
    """Convert a camelCase prop name to a search query."""
    if not prop_name:
        return ""

    clean_name = re.sub(r'(Image|Photo|Pic|Picture|Img|Src|Url|Background|Bg)$', '', prop_name, flags=re.IGNORECASE)
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', clean_name)
    spaced = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', spaced)
    spaced = re.sub(r'(\d)([a-zA-Z])', r'\1 \2', spaced)

    result = spaced.strip().lower()
    return result


def _simple_clean_query(query: str) -> str:
    """Simple cleanup of search query - just strip whitespace and check for empty."""
    if not query:
        return ""
    cleaned = query.strip()
    if not cleaned or cleaned.startswith('${') or cleaned.startswith('props.'):
        return ""
    return cleaned


# GENERIC_IMAGE_TERMS is now imported from services.image


def _is_generic_query(query: str) -> bool:
    """Check if a query is too generic to produce good image search results.

    Uses unified service implementation.
    """
    return unified_is_generic_query(query)


def _looks_like_image_prop(prop_name: str) -> bool:
    if not prop_name:
        return False
    lowered = prop_name.lower()
    if lowered in GENERIC_VAR_NAMES:
        return False
    return any(token in lowered for token in IMAGE_PROP_TOKENS)


def _iter_js_objects(text: str) -> List[Tuple[int, int, str]]:
    """Yield JS object literals from text, ignoring braces inside strings."""
    objects: List[Tuple[int, int, str]] = []
    depth = 0
    start = None
    in_string = None
    in_template_literal = False
    template_brace_depth = 0
    escape = False
    idx = 0
    length = len(text)

    while idx < length:
        ch = text[idx]
        if escape:
            escape = False
            idx += 1
            continue

        if ch == "\\":
            escape = True
            idx += 1
            continue

        # Handle template literals (backticks) which can contain ${...}
        if in_template_literal:
            if ch == "`":
                in_template_literal = False
            elif ch == "$" and idx + 1 < length and text[idx + 1] == "{":
                template_brace_depth += 1
                idx += 2
                continue
            elif ch == "}" and template_brace_depth > 0:
                template_brace_depth -= 1
            idx += 1
            continue

        if in_string:
            if ch == in_string:
                in_string = None
        else:
            if ch == "`":
                in_template_literal = True
            elif ch in ("'", '"'):
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
    """Check if a JS object should be treated as having image properties.

    Returns True if:
    - The object has no 'type' property (default case)
    - The object has a type related to images (img, image, photo, picture)
    - The object has image-related properties (image, src, img, photo, etc.) regardless of type
    - The object has properties containing 'image' in the name (imageStage, stageImage, etc.)
    """
    # If the object has image-related properties, treat it as image-like regardless of type
    # This handles cases like { type: 'event', image: 'placeholder', imageAlt: '...' }
    # Match property names CONTAINING 'image' like imageStage, stageImage, backgroundImage
    image_prop_pattern = r'\b\w*(?:image|img|photo|picture|thumbnail|src)\w*\s*:\s*["\']'
    if re.search(image_prop_pattern, obj_text, re.IGNORECASE):
        return True

    # Also check for placeholder values directly
    if re.search(r':\s*["\']placeholder["\']', obj_text, re.IGNORECASE):
        return True

    # If no type property, assume it could be image-like
    type_match = re.search(r'\btype\s*:\s*([\'"])([^\'"]+)\1', obj_text, re.IGNORECASE)
    if not type_match:
        return True

    # Check if type is explicitly image-related
    type_value = type_match.group(2).strip().lower()
    return type_value in ("img", "image", "photo", "picture")


def _iter_all_js_objects(text: str) -> List[Tuple[int, int, str]]:
    """Find ALL JS objects at all nesting levels, leaf objects first.

    Unlike _iter_js_objects which only returns top-level objects, this
    recursively descends into each object to find nested ones (e.g., array
    items inside a DOMContentLoaded callback body).  Objects are returned
    smallest-first so that callers processing labels get the most specific
    (innermost) object before its enclosing wrapper.
    """
    all_objs: List[Tuple[int, int, str]] = []

    def _collect(txt: str, offset: int = 0, depth: int = 0):
        if depth > 4 or len(txt) < 5:
            return
        for start, end, obj_text in _iter_js_objects(txt):
            all_objs.append((start + offset, end + offset, obj_text))
            if len(obj_text) > 20:
                _collect(obj_text[1:-1], start + offset + 1, depth + 1)

    _collect(text)
    # Sort smallest first so leaf objects come before their parents
    all_objs.sort(key=lambda x: x[1] - x[0])
    return all_objs


def _extract_js_object_label(obj_text: str) -> str:
    """Extract a label/alt text from a JS object.

    Looks for common label properties in priority order:
    1. Alt-related properties (thumbAlt, imgAlt, imageAlt, photoAlt, alt)
    2. Standard label properties (title, name, label, heading, description)
    """
    # First priority: explicit alt-related properties (these are search queries)
    alt_fields = ("thumbAlt", "imgAlt", "imageAlt", "photoAlt", "pictureAlt", "bgAlt", "backgroundAlt", "alt")
    for field in alt_fields:
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            value = match.group(2).strip()
            if value and len(value) > 3:
                return value

    # Second priority: standard label properties
    label_fields = ("title", "name", "label", "heading", "description")
    for field in label_fields:
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            value = match.group(2).strip()
            if value and len(value) > 3:
                return value

    return ""


def _extract_js_object_alt_property(obj_text: str, prop_name: str) -> str:
    """Extract a specific alt/image-related property from a JS object."""
    match = re.search(rf'\b{re.escape(prop_name)}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
    if match:
        return match.group(2).strip()
    return ""


def _extract_template_variable_alt_queries(html: str) -> List[str]:
    """
    Extract actual alt text values from JS arrays when template variables are used.

    When HTML contains: <img src="placeholder" alt="${item.thumbAlt}">
    This function finds the JS objects with 'thumbAlt' property and extracts their values.
    """
    if not html:
        return []

    queries: List[str] = []
    seen = set()

    # Find template variable alt attributes: alt="${something.propName}" or alt="${propName}"
    template_alts = re.findall(r'alt=["\']?\$\{(?:\w+\.)?(\w+)\}["\']?', html, re.IGNORECASE)
    if not template_alts:
        return []

    # Common alt property names the model might use
    alt_prop_names = set(template_alts)
    # Also add common variations
    for prop in list(alt_prop_names):
        lower_prop = prop.lower()
        if 'alt' in lower_prop or 'img' in lower_prop or 'image' in lower_prop:
            alt_prop_names.add(prop)

    logger.debug("[IMAGE_EXTRACT] Looking for template alt properties: %s", alt_prop_names)

    # Extract script content — use recursive iteration to find array items
    # inside wrapping functions (DOMContentLoaded, IIFEs, etc.)
    for script_content in re.findall(r'<script[^>]*>([\s\S]*?)</script>', html, re.IGNORECASE):
        for _, _, obj_text in _iter_all_js_objects(script_content):
            # Look for any of the alt property names in this object
            for prop_name in alt_prop_names:
                value = _extract_js_object_alt_property(obj_text, prop_name)
                if value:
                    cleaned = _simple_clean_query(value)
                    if cleaned and cleaned.lower() not in seen:
                        seen.add(cleaned.lower())
                        queries.append(cleaned)
                        logger.info("[IMAGE_EXTRACT] Found template alt value from JS object: '%s' = '%s'", prop_name, cleaned[:50])

    return queries


def _extract_js_object_image_queries(html: str) -> List[str]:
    if not html:
        return []
    queries: List[str] = []
    seen = set()
    # Match property names CONTAINING src, image, img, photo, picture, thumbnail, background
    # This catches names like imageStage, stageImage, backgroundImage, etc.
    image_prop_pattern = r'\b\w*(?:src|image|img|photo|picture|thumbnail|background)\w*\s*:'
    # Also match alt-related properties that indicate image search queries
    alt_prop_pattern = r'\b\w*(?:thumbAlt|imgAlt|imageAlt|photoAlt|pictureAlt|bgAlt|backgroundAlt)\w*\s*:'

    for script_content in re.findall(r'<script[^>]*>([\s\S]*?)</script>', html, re.IGNORECASE):
        # Use recursive iteration to find array items inside wrapping
        # functions (DOMContentLoaded, IIFEs, etc.) — not just top-level objects
        for _, _, obj_text in _iter_all_js_objects(script_content):
            if not _object_is_image_like(obj_text):
                continue
            # Check if object has either image properties or alt-related properties
            has_image_prop = bool(re.search(image_prop_pattern, obj_text, re.IGNORECASE))
            has_alt_prop = bool(re.search(alt_prop_pattern, obj_text, re.IGNORECASE))
            if not has_image_prop and not has_alt_prop:
                continue
            label = _extract_js_object_label(obj_text)
            cleaned = _simple_clean_query(label)
            if not cleaned:
                continue
            # Skip labels that are generic variable names, not real descriptions
            if _is_garbage_image_query(cleaned):
                logger.debug("[IMAGE_EXTRACT] Skipping garbage JS label: '%s'", cleaned)
                continue
            key = cleaned.lower()
            if key in seen:
                continue
            seen.add(key)
            queries.append(cleaned)
    return queries


def _extract_image_props_from_html(html: str) -> List[Tuple[str, str]]:
    """Extract image prop names and their search queries from generated HTML."""
    results: List[Tuple[str, str]] = []
    seen_props = set()

    # First, extract queries from template variable alt attributes (e.g., alt="${item.thumbAlt}")
    # This finds the actual values in the JS arrays
    template_alt_queries = _extract_template_variable_alt_queries(html)
    for query in template_alt_queries:
        key = f"alt_{query.replace(' ', '_').replace('-', '_')[:30]}"
        if query.lower() not in seen_props:
            results.append((key, query))
            seen_props.add(query.lower())
            logger.info("[IMAGE_EXTRACT] Added template variable alt query: '%s'", query[:50])

    js_image_queries = _extract_js_object_image_queries(html)
    for query in js_image_queries:
        key = f"alt_{query.replace(' ', '_').replace('-', '_')[:30]}"
        if query.lower() not in seen_props:
            results.append((key, query))
            seen_props.add(query.lower())

    has_js_alt_queries = bool(js_image_queries)
    has_descriptive_queries = bool(results)  # Already found alt-text queries

    # Patterns 1-3: Extract queries from prop NAMES (e.g., mainImage → "main").
    # These are fallbacks — skip generic ones when we already have descriptive alt text.
    pattern1 = re.findall(r'<img[^>]*src=["\']?\$\{(\w+)\}["\']?', html, re.IGNORECASE)
    for prop in pattern1:
        if has_js_alt_queries and not _looks_like_image_prop(prop):
            continue
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                if has_descriptive_queries and _is_generic_query(query):
                    logger.debug("[IMAGE_EXTRACT] Skipping generic prop-derived query: '%s' (from %s)", query, prop)
                    continue
                results.append((prop, query))
                seen_props.add(prop)

    pattern2 = re.findall(r'<img[^>]*src=["\']props\.(\w+)["\']', html, re.IGNORECASE)
    for prop in pattern2:
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                if has_descriptive_queries and _is_generic_query(query):
                    logger.debug("[IMAGE_EXTRACT] Skipping generic prop-derived query: '%s' (from %s)", query, prop)
                    continue
                results.append((prop, query))
                seen_props.add(prop)

    pattern3 = re.findall(r'(?:const|let|var)\s+(\w*(?:image|photo|pic|img|src)\w*)\s*=', html, re.IGNORECASE)
    for prop in pattern3:
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                if has_descriptive_queries and _is_generic_query(query):
                    logger.debug("[IMAGE_EXTRACT] Skipping generic prop-derived query: '%s' (from %s)", query, prop)
                    continue
                results.append((prop, query))
                seen_props.add(prop)

    all_img_tags = re.findall(r'<img[^>]+>', html, re.IGNORECASE)
    logger.debug("[IMAGE_EXTRACT] Found %d img tags in HTML", len(all_img_tags))
    for img_tag in all_img_tags:
        # Try quoted src first, then unquoted
        src_match = re.search(r'src=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
        if not src_match:
            # Try unquoted src (e.g., src=/path/placeholder or src=http://...)
            src_match = re.search(r'src=([^\s"\'<>]+)', img_tag, re.IGNORECASE)
        src = src_match.group(1) if src_match else ""
        is_placeholder = (
            not src
            or src == "placeholder"
            or "placeholder" in src.lower()
            or src.startswith("${")
            or src.startswith("props.")
            or (not src.startswith("http") and not src.startswith("data:") and not src.startswith("blob:"))
        )
        if is_placeholder or 'src=""' in img_tag or "src=''" in img_tag:
            alt_match = re.search(r'alt=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
            if alt_match:
                alt = alt_match.group(1).strip()
                # Skip template variables like ${item.alt} or {props.alt}
                if alt.startswith("${") or alt.startswith("{") or "${" in alt:
                    logger.debug("[IMAGE_EXTRACT] Skipping template variable alt: %s", alt[:50])
                    continue
                if alt and alt.lower() not in seen_props:
                    prop_key = f"alt_{alt.replace(' ', '_').replace('-', '_')[:30]}"
                    results.append((prop_key, alt))
                    seen_props.add(alt.lower())
                    logger.info("[IMAGE_EXTRACT] Found placeholder img with alt: '%s' -> key '%s'", alt[:60], prop_key)
                elif alt and alt.lower() in seen_props:
                    logger.debug("[IMAGE_EXTRACT] Skipping duplicate alt: %s", alt[:50])
            else:
                logger.debug("[IMAGE_EXTRACT] Placeholder img without alt text: %s", img_tag[:100])

    our_bucket_domains = ['nextslide.ai', 'supabase.co', 'supabase.com']
    external_imgs = re.findall(r'<img\s*[^>]*alt=["\']([^"\']+)["\'][^>]*src=["\']?(https?://[^\s"\'<>]+)["\']?[^>]*>', html, re.IGNORECASE)
    external_imgs += re.findall(r'<img\s*[^>]*src=["\']?(https?://[^\s"\'<>]+)["\']?[^>]*alt=["\']([^"\']+)["\']?[^>]*>', html, re.IGNORECASE)

    for match in external_imgs:
        if isinstance(match, tuple):
            alt, url = match if not match[0].startswith('http') else (match[1], match[0])
        else:
            continue
        if any(domain in url.lower() for domain in our_bucket_domains):
            continue
        alt = alt.strip()
        # Skip template variables like ${item.alt} or {props.alt}
        if alt.startswith("${") or alt.startswith("{") or "${" in alt:
            continue
        if alt and alt.lower() not in seen_props:
            results.append((f"alt_{alt.replace(' ', '_').replace('-', '_')[:30]}", alt))
            seen_props.add(alt.lower())
            logger.debug("[IMAGE_EXTRACT] External URL alt text queued: %s", alt)

    logger.debug("[IMAGE_EXTRACT] Found %s image props from HTML", len(results))
    return results


def _normalize_available_images(
    available_images: Optional[List[Any]],
    uploaded_media: Optional[List[Dict[str, Any]]],
) -> List[Dict[str, str]]:
    """Normalize available assets into a list of {url,label,source} dicts."""
    assets: List[Dict[str, str]] = []
    seen = set()

    def add_asset(url: Optional[str], label: Optional[str], source: str) -> None:
        if not url or url in seen:
            return
        assets.append({"url": url, "label": label or "", "source": source})
        seen.add(url)

    for item in available_images or []:
        if isinstance(item, str):
            add_asset(item, None, "available")
        elif isinstance(item, dict):
            url = item.get("url") or item.get("previewUrl") or item.get("src") or item.get("imageUrl")
            add_asset(url, item.get("label") or item.get("alt") or item.get("name"), "available")

    for media in uploaded_media or []:
        if not isinstance(media, dict):
            continue
        media_type = str(media.get("type") or "")
        if not media_type.startswith("image") and media_type != "image":
            continue
        url = media.get("previewUrl") or media.get("url")
        if not url and media.get("content"):
            mime = media_type if media_type.startswith("image/") else "image/png"
            url = f"data:{mime};base64,{media.get('content')}"
        label = media.get("interpretation") or media.get("filename") or media.get("name")
        add_asset(url, label, "uploaded")

    return assets


def _match_available_images_to_props(
    prop_queries: List[Tuple[str, str]],
    assets: List[Dict[str, str]],
) -> Tuple[Dict[str, str], List[Tuple[str, str]]]:
    """Assign available assets to image props based on query matching."""
    if not prop_queries or not assets:
        return {}, prop_queries

    def _tokens(text: str) -> List[str]:
        return re.findall(r"[a-z0-9]+", text.lower()) if text else []

    matches: Dict[str, str] = {}
    used_urls = set()

    for prop_name, query in prop_queries:
        query_tokens = set(_tokens(query))
        if not query_tokens:
            continue
        best = None
        best_score = 0
        for asset in assets:
            if asset["url"] in used_urls:
                continue
            asset_tokens = set(_tokens(asset.get("label", "")))
            score = len(query_tokens & asset_tokens)
            if score > best_score:
                best = asset
                best_score = score
        if best and best_score > 0:
            matches[prop_name] = best["url"]
            matches[f"{prop_name}_query"] = query
            used_urls.add(best["url"])

    for prop_name, query in prop_queries:
        if prop_name in matches:
            continue
        for asset in assets:
            if asset["url"] in used_urls:
                continue
            matches[prop_name] = asset["url"]
            matches[f"{prop_name}_query"] = query
            used_urls.add(asset["url"])
            break

    remaining = [(prop, query) for prop, query in prop_queries if prop not in matches]
    return matches, remaining


def _extract_topic_from_context(slide_context: str) -> str:
    """Extract the main topic/brand from slide context for image search."""
    if not slide_context:
        return ""

    # Priority order: BRAND > Topic > Deck > Slide
    topic = ""
    if "BRAND:" in slide_context:
        brand_search = re.search(r'BRAND:\s*([^\|]+)', slide_context)
        if brand_search:
            topic = brand_search.group(1).strip()
    if not topic and "Topic:" in slide_context:
        topic_search = re.search(r'Topic:\s*([^\|]+)', slide_context)
        if topic_search:
            t = topic_search.group(1).strip()
            # Clean up URL-like topics
            if '.com' in t or '.ai' in t or '.io' in t:
                topic = t.split('.')[0].title()
            else:
                topic = t[:50]  # Truncate long topics
    if not topic and "Deck:" in slide_context:
        deck_search = re.search(r'Deck:\s*([^\|]+)', slide_context)
        if deck_search:
            topic = deck_search.group(1).strip()[:50]
    if not topic and "Slide:" in slide_context:
        slide_search = re.search(r'Slide:\s*([^\|]+)', slide_context)
        if slide_search:
            topic = slide_search.group(1).strip()[:30]

    return topic


async def _batch_enhance_image_queries_with_ai(
    queries: List[Tuple[str, str]],
    slide_context: str = "",
) -> Dict[str, str]:
    """Batch-enhance multiple generic image queries in a single AI call.

    Args:
        queries: List of (prop_name, query) tuples that need enhancement
        slide_context: Slide context string (BRAND, Deck, Topic, Slide)

    Returns:
        Dict mapping prop_name -> enhanced_query
    """
    if not queries:
        return {}

    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        # Build a numbered list of queries for the AI
        query_lines = []
        for i, (prop_name, query) in enumerate(queries, 1):
            query_lines.append(f"{i}. prop=\"{prop_name}\" original=\"{query}\"")

        prompt = f"""Generate Google Images search queries for these slide image placeholders.

SLIDE CONTEXT: {slide_context[:400] if slide_context else 'Presentation slide'}

IMAGE PLACEHOLDERS TO RESOLVE:
{chr(10).join(query_lines)}

RULES:
- Each query should be 2-6 words, specific and searchable
- Search for CLEAN PHOTOGRAPHS of real objects, products, people, or places
- NEVER search for charts, graphs, diagrams, infographics, dashboards, or data visualizations
- If the presentation is ABOUT a brand/company, search for THEIR actual products, services, offices
- For "background"/"bg" props: search for a clean photo related to the topic (e.g., "Tesla factory interior")
- For "hero"/"banner" props: use the main subject (e.g., "Tesla Model S")
- IGNORE the original query if it's generic (like "image", "photo", "bg", "main")
- DO NOT repeat the same query for different props

Return ONLY a numbered list matching the input, one query per line:
1. specific search query
2. specific search query
..."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            300,  # Enough for ~15 queries
            0.3,
        )

        if not response:
            logger.warning("[BATCH_ENHANCE] AI returned empty response")
            return {}

        # Parse numbered responses
        result_map: Dict[str, str] = {}
        lines = str(response).strip().split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue
            # Match "1. query text" or "1: query text"
            match = re.match(r'(\d+)[.:\-)\s]+(.+)', line)
            if match:
                idx = int(match.group(1)) - 1
                enhanced = match.group(2).strip().strip('"\'')
                if 0 <= idx < len(queries) and enhanced and len(enhanced) < 70:
                    prop_name = queries[idx][0]
                    # Validate: not a refusal, not too long
                    if ('cannot' not in enhanced.lower() and
                        'sorry' not in enhanced.lower() and
                        'I ' not in enhanced and
                        enhanced.lower() != 'none'):
                        result_map[prop_name] = enhanced

        logger.info(
            "[BATCH_ENHANCE] Enhanced %d/%d queries in single AI call",
            len(result_map), len(queries)
        )
        for prop, enhanced in result_map.items():
            original = next((q for p, q in queries if p == prop), "?")
            logger.info("[BATCH_ENHANCE]   '%s': '%s' -> '%s'", prop, original, enhanced)

        return result_map

    except Exception as e:
        logger.warning("[BATCH_ENHANCE] Batch enhancement failed: %s", e)
        return {}


async def _enhance_image_query_with_ai(query: str, slide_context: str = "") -> str:
    """Use AI to refine a search query into a visually striking image search term."""
    topic = _extract_topic_from_context(slide_context)

    # Check if original query is generic/meaningless (outside try so available in fallback)
    generic_terms = {'main', 'visual', 'content', 'item', 'hero', 'featured', 'primary',
                    'secondary', 'background', 'image', 'photo', 'picture', 'img',
                    'cover', 'banner', 'thumbnail', 'card', 'stage', 'phase', 'scene',
                    'boss', 'level', 'frame', 'default', 'sample', 'placeholder'}
    query_words = set(query.lower().split())
    is_meaningless = len(query_words) <= 2 and query_words.issubset(generic_terms)

    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        if is_meaningless:
            # For meaningless queries, generate entirely from context
            prompt = f"""Generate an image search query based on the slide context below.
The original prop name was "{query}" which is meaningless - IGNORE IT COMPLETELY.

SLIDE CONTEXT: {slide_context[:400] if slide_context else 'Presentation slide'}

YOUR TASK:
1. Identify the MAIN SUBJECT of this slide (product, person, place, object, etc.)
2. Search for a CLEAN PHOTOGRAPH — never a chart, graph, diagram, or infographic
3. If the presentation is about a brand/company, search for their actual products or services

OUTPUT: A 2-6 word image search query for a clean photograph.
Return ONLY the search query, nothing else."""
        else:
            # For meaningful queries, refine without adding extraneous terms
            query_word_count = len(query.split())
            if query_word_count > 6:
                # Query is already long - simplify it, don't add more
                prompt = f"""Simplify this image search query to its essential terms.

ORIGINAL QUERY: {query}

RULES:
1. Extract the 3-5 MOST IMPORTANT words that describe the visual subject
2. DO NOT add any new words or concepts
3. Remove generic terms like "image", "photo", "render", "full body", etc.
4. Keep character names, franchises, and specific descriptors

Return ONLY the simplified search query (3-5 words max)."""
            else:
                # Short query - can enhance with context
                prompt = f"""Refine this image search query.

ORIGINAL QUERY: {query}
SLIDE CONTEXT: {slide_context[:600] if slide_context else 'Presentation slide'}

RULES:
1. Keep the EXACT subject from the original query
2. If the presentation is about a brand/company, tie the query to their products or services
3. Only add context if it clarifies the SAME subject (e.g., brand name for a product)
4. Make it a searchable 3-6 word phrase

Return ONLY the refined search query."""

        # Log what we're sending to AI for debugging
        logger.info("[POST_SEARCH] Enhancing query '%s' (meaningless=%s)", query, is_meaningless)
        logger.info("[POST_SEARCH] Context preview: %s", slide_context[:150] if slide_context else "NONE")

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            50,  # Short response for concise queries
            0.3,
        )

        if response is None:
            logger.warning("[POST_SEARCH] AI returned None for query: '%s'", query)
        else:
            enhanced = str(response).strip().strip('"\'')
            # Reject if too long (more than ~7 words), contains refusal language, or is literal "None"
            word_count = len(enhanced.split())
            is_valid = (
                enhanced
                and enhanced.lower() != "none"
                and word_count <= 8  # Allow slightly longer for context
                and len(enhanced) < 70
                and "cannot" not in enhanced.lower()
                and "I " not in enhanced
                and "sorry" not in enhanced.lower()
            )
            if is_valid:
                logger.info("[POST_SEARCH] ✅ AI enhanced: '%s' -> '%s'", query, enhanced)
                return enhanced
            else:
                logger.warning("[POST_SEARCH] AI returned invalid response: '%s' (len=%d, words=%d)",
                             enhanced[:50], len(enhanced), word_count)
    except Exception as e:
        logger.warning("[POST_SEARCH] AI enhancement failed: %s", e)

    # Fallback: For generic queries, use topic alone if we have it
    cleaned = query.strip()
    if topic:
        if is_meaningless:
            # For meaningless queries, just use the topic
            logger.info("[POST_SEARCH] Fallback: using topic alone: '%s' -> '%s'", query, topic)
            return topic
        elif _is_generic_query(cleaned):
            # For semi-generic queries, prepend topic
            enhanced_fallback = f"{topic} {cleaned}"
            logger.info("[POST_SEARCH] Fallback: prepended topic: '%s' -> '%s'", query, enhanced_fallback)
            return enhanced_fallback

    logger.warning("[POST_SEARCH] No enhancement possible for: '%s' (topic='%s')", query, topic)
    return cleaned if cleaned else query


async def _search_images_for_props(
    prop_queries: List[Tuple[str, str]],
    theme: Optional[Dict[str, Any]] = None,
    slide_context: str = "",
    cache: Optional[ImageSearchCache] = None,
) -> Dict[str, str]:
    """Search SERP API for images using prop queries."""
    from services.serpapi_service import SerpAPIService
    from services.image_storage_service import ImageStorageService

    prefetched: Dict[str, str] = {}
    theme = theme or {}

    brand_info = theme.get('brandInfo', {})
    color_palette = theme.get('color_palette', {})
    brandfetch_logo = (
        brand_info.get('logoUrl') or
        brand_info.get('logo_url') or
        color_palette.get('metadata', {}).get('logo_url') or
        color_palette.get('metadata', {}).get('logo_url_light')
    )
    # Skip base64 data URLs - they're too large (50K+ chars)
    if brandfetch_logo and brandfetch_logo.startswith("data:"):
        logger.info("[POST_SEARCH] Skipping base64 logo, will try logo.dev")
        brandfetch_logo = None
    if brandfetch_logo:
        prefetched['logoUrl'] = brandfetch_logo
        prefetched['logoUrl_query'] = 'brand logo'
        logger.info("[POST_SEARCH] Using Brandfetch logo")

    # Separate company logo queries from regular image queries
    # Company logos (e.g., "Apple logo", "Google logo") go to logo.dev
    # Generic "Logo" queries are skipped, regular images go to SerpAPI
    company_logo_queries: List[Tuple[str, str, str]] = []  # (prop, query, company_name)
    regular_queries: List[Tuple[str, str]] = []
    generic_logo_terms = {'logo', 'company logo', 'brand logo', 'business logo', 'corporate logo'}

    for prop, query in prop_queries:
        q_lower = query.lower().strip()

        # Skip garbage queries (JS variable names, not real descriptions)
        if _is_garbage_image_query(query):
            logger.info(f"[POST_SEARCH] Skipping garbage query: '{query}' (prop: {prop})")
            continue

        # Skip generic logo queries entirely
        if q_lower in generic_logo_terms:
            logger.debug(f"[POST_SEARCH] Skipping generic logo query: {query}")
            continue

        # For generic image queries, try to enhance with slide context instead of skipping
        if _is_generic_query(query):
            logger.info(f"[POST_SEARCH] Generic query detected: '{query}' - will enhance with context")
            # Don't skip - let the enhancement happen in search_and_pick_best
            # The query will be enhanced with slide context via _enhance_image_query_with_ai

        # Check if it's a company logo query (e.g., "Apple logo")
        is_logo, company_name = _is_company_logo_query(query)
        if is_logo and company_name:
            company_logo_queries.append((prop, query, company_name))
        else:
            regular_queries.append((prop, query))

    # Fetch company logos from logo.dev
    if company_logo_queries and LOGODEV_AVAILABLE:
        logger.info(f"[POST_SEARCH] Fetching {len(company_logo_queries)} company logos from logo.dev")
        logo_tasks = []
        for prop, query, company_name in company_logo_queries:
            # Check cache first
            if cache:
                cached = cache.get(f"{company_name} logo")
                if cached:
                    prefetched[prop] = cached
                    prefetched[f"{prop}_query"] = query
                    logger.debug(f"[POST_SEARCH] Cache hit for {company_name} logo")
                    continue
            logo_tasks.append((prop, query, company_name, _fetch_logo_from_logodev(company_name, cache)))

        # Run logo fetches in parallel
        if logo_tasks:
            results = await asyncio.gather(*[t[3] for t in logo_tasks], return_exceptions=True)
            for i, result in enumerate(results):
                prop, query, company_name, _ = logo_tasks[i]
                if isinstance(result, str) and result:
                    prefetched[prop] = result
                    prefetched[f"{prop}_query"] = query
                    logger.info(f"[POST_SEARCH] Got {company_name} logo from logo.dev")
                elif isinstance(result, Exception):
                    logger.warning(f"[POST_SEARCH] Logo.dev error for {company_name}: {result}")
                    # Fall back to SerpAPI for this one
                    regular_queries.append((prop, query))
                else:
                    # Not found in logo.dev, try SerpAPI
                    regular_queries.append((prop, query))

    if not regular_queries:
        logger.debug("[POST_SEARCH] No regular image queries to search")
        return prefetched

    try:
        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("[POST_SEARCH] SerpAPI not available")
            return prefetched
    except Exception as e:
        logger.warning("[POST_SEARCH] Could not init SerpAPI: %s", e)
        return prefetched

    logger.info("[POST_SEARCH] Searching SERP API for %s image props", len(regular_queries))

    # ── BATCH AI ENHANCEMENT ──────────────────────────────────────────────
    # Collect all queries that need AI enhancement and process them in ONE call
    # instead of N individual calls (saves 3-5s × N)
    queries_needing_enhancement: List[Tuple[str, str]] = []
    for prop, query in regular_queries:
        words = query.lower().split()
        generic_word_count = sum(1 for w in words if w in GENERIC_IMAGE_TERMS)
        is_entirely_generic = _is_generic_query(query)
        needs_enhancement = (
            is_entirely_generic or
            len(words) <= 2 or
            generic_word_count >= len(words) // 2
        )
        if needs_enhancement:
            queries_needing_enhancement.append((prop, query))

    # Run single batch AI call for all generic queries
    batch_enhanced: Dict[str, str] = {}
    if queries_needing_enhancement and slide_context:
        batch_enhanced = await _batch_enhance_image_queries_with_ai(
            queries_needing_enhancement, slide_context
        )

    async with ImageStorageService() as storage:

        async def search_and_pick_best(prop_name: str, query: str) -> Tuple[str, str, Optional[str], Optional[int], Optional[int]]:
            """Returns (prop_name, query, url, width, height) - dimensions may be None for cache hits."""
            try:
                original_query = query

                if cache:
                    cached = cache.get(original_query)
                    if cached:
                        logger.debug("[POST_SEARCH] Cache hit for '%s'", original_query)
                        return (prop_name, original_query, cached, None, None)

                search_query = query
                logger.info(f"[POST_SEARCH] Processing query for '{prop_name}': '{query[:60]}...'")

                # Use batch-enhanced query if available, otherwise fall back to individual enhancement
                if prop_name in batch_enhanced:
                    search_query = batch_enhanced[prop_name]
                    logger.info(f"[POST_SEARCH] ✓ Batch-enhanced: '{query}' -> '{search_query}'")
                    # Validate the batch result
                    if _is_generic_query(search_query):
                        logger.warning(f"[POST_SEARCH] Batch enhancement still generic: '{search_query}', skipping")
                        return (prop_name, original_query, None, None, None)
                else:
                    # Check if individual enhancement is needed (for queries not in the batch)
                    words = query.lower().split()
                    generic_word_count = sum(1 for w in words if w in GENERIC_IMAGE_TERMS)
                    is_entirely_generic = _is_generic_query(query)
                    needs_enhancement = (
                        is_entirely_generic or
                        len(words) <= 2 or
                        generic_word_count >= len(words) // 2
                    )
                    if needs_enhancement:
                        # Batch missed this one - fall back to individual call
                        context_for_enhancement = slide_context
                        if is_entirely_generic and slide_context:
                            context_for_enhancement = f"Generate image query from context (original was too generic: '{query}'). {slide_context}"
                        search_query = await _enhance_image_query_with_ai(query, context_for_enhancement)
                        if not search_query or search_query.lower() == "none":
                            return (prop_name, original_query, None, None, None)
                        if is_entirely_generic and _is_generic_query(search_query):
                            return (prop_name, original_query, None, None, None)

                # Ensure query is concise (allow up to 8 words for more context)
                words = search_query.split()
                if len(words) > 8:
                    search_query = " ".join(words[:8])

                async def try_search(q: str):
                    """Helper to perform search and extract photos."""
                    logger.info(f"[POST_SEARCH] 🔍 SEARCHING SERPAPI: '{q}'")
                    res = await serpapi.search_images(q)
                    if asyncio.iscoroutine(res):
                        res = await res
                    if not isinstance(res, (dict, list)):
                        return []
                    photos_list = res.get('photos', []) if isinstance(res, dict) else res
                    return photos_list if isinstance(photos_list, list) else []

                photos = await try_search(search_query)

                # If no results, try a simplified fallback query (first 3-4 meaningful words)
                if not photos and len(words) > 4:
                    # Keep the first few words which usually contain the main subject
                    fallback_query = " ".join(words[:4])
                    logger.info(f"[POST_SEARCH] No results for '{search_query}', trying fallback: '{fallback_query}'")
                    photos = await try_search(fallback_query)

                # If still no results for person/celebrity queries, try with "photo" suffix
                if not photos and any(word[0].isupper() for word in words[:2]):
                    # Likely a person name - try simpler query
                    name_query = " ".join(words[:2]) + " photo"
                    logger.info(f"[POST_SEARCH] Trying name-based fallback: '{name_query}'")
                    photos = await try_search(name_query)

                if not photos:
                    logger.warning("[POST_SEARCH] No image candidates for: %s (all fallbacks failed)", search_query)
                    return (prop_name, original_query, None, None, None)

                # Keep full photo objects to preserve width/height metadata
                valid_photos = [
                    r for r in photos
                    if isinstance(r, dict) and (r.get('url') or r.get('original') or r.get('thumbnail'))
                ]
                if not valid_photos:
                    logger.warning("[POST_SEARCH] No valid URLs for: %s", search_query)
                    return (prop_name, original_query, None, None, None)

                for photo in valid_photos:
                    url = photo.get('url') or photo.get('original') or photo.get('thumbnail')
                    width = photo.get('width') or photo.get('original_width')
                    height = photo.get('height') or photo.get('original_height')
                    try:
                        upload_result = await storage.upload_image_from_url(url)
                        if 'error' not in upload_result and upload_result.get('url'):
                            our_url = upload_result['url']

                            # If SerpAPI didn't provide dimensions, try to fetch them
                            if width is None or height is None:
                                fetched_dims = await _fetch_image_dimensions(our_url)
                                if fetched_dims:
                                    width, height = fetched_dims
                                    logger.info(f"[POST_SEARCH] Fetched dimensions for {prop_name}: {width}x{height}")

                            logger.debug("[POST_SEARCH] Uploaded image for %s (%s) - dimensions: %sx%s", prop_name, search_query, width, height)
                            if cache:
                                cache.set(original_query, our_url)
                            return (prop_name, original_query, our_url, width, height)
                    except Exception as e:
                        logger.debug(f"[POST_SEARCH] Upload failed: {e}")
                        continue

                logger.warning("[POST_SEARCH] All uploads failed for: %s", search_query)
                return (prop_name, original_query, None, None, None)

            except Exception as e:
                logger.warning("[POST_SEARCH] Error for '%s': %s", query, e)
                return (prop_name, original_query, None, None, None)

        # Cap at 8 image queries per slide to limit SerpAPI usage
        tasks = [search_and_pick_best(prop, query) for prop, query in regular_queries[:8]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple) and len(result) == 5 and result[2]:
            prop_name, query, url, width, height = result
            prefetched[prop_name] = url
            prefetched[f"{prop_name}_query"] = query
            if width is not None and height is not None:
                prefetched[f"{prop_name}_width"] = width
                prefetched[f"{prop_name}_height"] = height
                aspect = width / height if height > 0 else 0
                logger.info(f"[POST_SEARCH] Stored dimensions for {prop_name}: {width}x{height} (aspect={aspect:.2f})")
            elif width is not None:
                prefetched[f"{prop_name}_width"] = width
            elif height is not None:
                prefetched[f"{prop_name}_height"] = height

    image_count = len([k for k in prefetched if not k.endswith('_query') and not k.endswith('_width') and not k.endswith('_height') and not k.startswith('logo')])
    logger.info("[POST_SEARCH] Total images found: %s", image_count)
    return prefetched


def _compress_image_for_multimodal(
    image_data: bytes,
    max_dimension: int = MAX_IMAGE_DIMENSION,
    max_bytes: int = MAX_IMAGE_BYTES,
) -> Tuple[bytes, str]:
    """Compress and resize an image for multimodal messages."""
    try:
        from PIL import Image
        from io import BytesIO

        if image_data[:100].lower().find(b'<svg') != -1 or image_data[:100].lower().find(b'<?xml') != -1:
            logger.info("[IMAGE_COMPRESS] SVG detected, skipping compression")
            return image_data, 'image/svg+xml'

        if image_data[:100].lower().find(b'<!doctype') != -1 or image_data[:100].lower().find(b'<html') != -1:
            logger.warning("[IMAGE_COMPRESS] HTML content detected instead of image, skipping")
            return image_data, 'text/html'

        img_stream = BytesIO(image_data)
        img_stream.seek(0)
        img = Image.open(img_stream)
        img.load()
        original_size = len(image_data)
        original_dims = img.size

        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        width, height = img.size
        if width > max_dimension or height > max_dimension:
            ratio = min(max_dimension / width, max_dimension / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)
            logger.info(f"[IMAGE_COMPRESS] Resized from {original_dims} to {new_size}")

        quality = JPEG_QUALITY
        output = BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)

        while output.tell() > max_bytes and quality > 30:
            quality -= 10
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)

        compressed_data = output.getvalue()
        final_size = len(compressed_data)

        reduction = ((original_size - final_size) / original_size * 100) if original_size > 0 else 0
        logger.info(f"[IMAGE_COMPRESS] {original_size:,} -> {final_size:,} bytes ({reduction:.1f}% reduction, quality={quality})")

        return compressed_data, 'image/jpeg'

    except ImportError:
        logger.warning("[IMAGE_COMPRESS] PIL not available, using original image")
        return image_data, 'image/png'
    except Exception as e:
        header = image_data[:50] if len(image_data) > 50 else image_data
        logger.warning(f"[IMAGE_COMPRESS] Compression failed: {e}. First bytes: {header[:30]!r}...")
        if image_data[:4] == b'\x89PNG':
            return image_data, 'image/png'
        if image_data[:2] == b'\xff\xd8':
            return image_data, 'image/jpeg'
        if image_data[:4] == b'GIF8':
            return image_data, 'image/gif'
        if image_data[:4] == b'RIFF' and image_data[8:12] == b'WEBP':
            return image_data, 'image/webp'
        return image_data, 'image/png'


def _estimate_token_count(base64_data: str) -> int:
    return len(base64_data) // 4


def _reference_images_from_uploaded_media(uploaded_media: Optional[list]) -> List[str]:
    if not uploaded_media:
        return []

    reference_images: List[str] = []
    for media in uploaded_media:
        if not isinstance(media, dict):
            continue
        filename = media.get("filename") or media.get("name") or ""
        is_drawing = any(kw in filename.lower() for kw in ["sketch", "drawing", "mockup", "wireframe", "draft", "layout", "design"]) if filename else False
        is_screenshot = any(kw in filename.lower() for kw in ["screenshot", "screen", "capture"]) if filename else False
        if is_drawing or is_screenshot:
            preview_url = media.get("previewUrl") or media.get("url")
            if isinstance(preview_url, str) and preview_url.startswith(("http://", "https://")):
                reference_images.append(preview_url)
    return reference_images


def _term_to_prop_name(term: str) -> str:
    """Convert a search term into a camelCase prop name ending with 'Image'."""
    words = re.findall(r"[A-Za-z0-9]+", term)
    if not words:
        return "image"
    cleaned = [w.lower() for w in words]
    camel = cleaned[0] + "".join(w.capitalize() for w in cleaned[1:])
    return f"{camel}Image"


def _extract_fonts_from_typography(typography: Dict[str, Any]) -> Tuple[str, str]:
    hero_font = (typography.get('hero_title') or {}).get('family') or typography.get('hero_font') or 'Montserrat'
    body_font = (typography.get('body_text') or {}).get('family') or typography.get('body_font') or 'Open Sans'
    return hero_font, body_font
