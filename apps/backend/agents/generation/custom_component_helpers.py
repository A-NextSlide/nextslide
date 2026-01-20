"""Helper utilities for CustomComponent generation."""

import asyncio
import re
from typing import Dict, Any, Optional, List, Tuple

from agents.ai.clients import get_client, invoke
from agents.config import IMAGE_SEARCH_MODEL
from services.image_cache import ImageSearchCache
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Logo.dev service for company logos in content
try:
    from agents.tools.theme.logodev_service import LogoDevService
    LOGODEV_AVAILABLE = True
except ImportError:
    LOGODEV_AVAILABLE = False
    logger.warning("[CUSTOM_COMPONENT] Logo.dev service not available")

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


def _is_company_logo_query(query: str) -> Tuple[bool, str]:
    """
    Detect if a query is for a company logo and extract the company name.

    Returns:
        Tuple of (is_logo_query, company_name)
    """
    if not query:
        return False, ""

    q = query.lower().strip()

    # Patterns like "Apple logo", "Google Logo", "Microsoft logo"
    logo_suffix_match = re.match(r'^(.+?)\s+logo\s*$', q, re.IGNORECASE)
    if logo_suffix_match:
        company = logo_suffix_match.group(1).strip()
        # Filter out generic terms
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    # Patterns like "logo of Apple", "logo for Google"
    logo_prefix_match = re.match(r'^logo\s+(?:of|for)\s+(.+)$', q, re.IGNORECASE)
    if logo_prefix_match:
        company = logo_prefix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    return False, ""


async def _fetch_logo_from_logodev(company_name: str, cache: Optional[ImageSearchCache] = None) -> Optional[str]:
    """
    Fetch a company logo from logo.dev and upload to our storage.

    Returns:
        URL of uploaded logo, or None if not found
    """
    if not LOGODEV_AVAILABLE:
        return None

    try:
        from services.image_storage_service import ImageStorageService

        async with LogoDevService() as logo_service:
            result = await logo_service.get_logo_with_fallback(company_name)

            if not result.get('available') or not result.get('logo_url'):
                logger.debug(f"[LOGODEV] No logo found for: {company_name}")
                return None

            logo_url = result['logo_url']
            logger.info(f"[LOGODEV] Found logo for {company_name}: {logo_url[:60]}...")

            # Upload to our storage for consistent delivery
            async with ImageStorageService() as storage:
                upload_result = await storage.upload_image_from_url(
                    logo_url,
                    metadata={"source": "logodev", "company": company_name}
                )
                if upload_result and upload_result.get('url'):
                    final_url = upload_result['url']
                    logger.info(f"[LOGODEV] Uploaded {company_name} logo to storage")

                    # Cache the result
                    if cache:
                        cache.set(f"{company_name} logo", final_url)

                    return final_url

    except Exception as e:
        logger.warning(f"[LOGODEV] Error fetching logo for {company_name}: {e}")

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


# Generic terms that produce poor image search results - should be enhanced or skipped
GENERIC_IMAGE_TERMS = {
    'image', 'photo', 'picture', 'pic', 'illustration', 'graphic', 'icon',
    'placeholder', 'background', 'bg', 'banner', 'hero', 'visual',
    'concept', 'abstract', 'decorative', 'default', 'sample',
    'stock', 'generic', 'filler', 'random',
}


def _is_generic_query(query: str) -> bool:
    """Check if a query is too generic to produce good image search results."""
    if not query:
        return True
    q_lower = query.lower().strip()
    words = set(re.findall(r'[a-z]+', q_lower))
    # If all words are generic terms, it's a generic query
    if words and words.issubset(GENERIC_IMAGE_TERMS):
        return True
    # Single generic word
    if q_lower in GENERIC_IMAGE_TERMS:
        return True
    # Very short queries without specific content
    if len(q_lower) <= 3:
        return True
    return False


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
    escape = False
    idx = 0
    length = len(text)

    while idx < length:
        ch = text[idx]
        if in_string:
            if escape:
                escape = False
            elif ch == "\\":
                escape = True
            elif ch == in_string:
                in_string = None
        else:
            if ch in ("'", '"'):
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
    type_match = re.search(r'\btype\s*:\s*([\'"])([^\'"]+)\1', obj_text, re.IGNORECASE)
    if not type_match:
        return True
    type_value = type_match.group(2).strip().lower()
    return type_value in ("img", "image", "photo", "picture")


def _extract_js_object_label(obj_text: str) -> str:
    for field in ("alt", "title", "name", "label", "heading"):
        match = re.search(rf'\b{field}\s*:\s*([\'"])(.*?)\1', obj_text, re.IGNORECASE | re.DOTALL)
        if match:
            return match.group(2).strip()
    return ""


def _extract_js_object_image_queries(html: str) -> List[str]:
    if not html:
        return []
    queries: List[str] = []
    seen = set()
    for script_content in re.findall(r'<script[^>]*>([\s\S]*?)</script>', html, re.IGNORECASE):
        for _, _, obj_text in _iter_js_objects(script_content):
            if not _object_is_image_like(obj_text):
                continue
            if not re.search(r'\bsrc\s*:', obj_text, re.IGNORECASE):
                continue
            label = _extract_js_object_label(obj_text)
            cleaned = _simple_clean_query(label)
            if not cleaned:
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

    js_image_queries = _extract_js_object_image_queries(html)
    for query in js_image_queries:
        key = f"alt_{query.replace(' ', '_').replace('-', '_')[:30]}"
        if query.lower() not in seen_props:
            results.append((key, query))
            seen_props.add(query.lower())

    has_js_alt_queries = bool(js_image_queries)

    pattern1 = re.findall(r'<img[^>]*src=["\']?\$\{(\w+)\}["\']?', html, re.IGNORECASE)
    for prop in pattern1:
        if has_js_alt_queries and not _looks_like_image_prop(prop):
            continue
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                results.append((prop, query))
                seen_props.add(prop)

    pattern2 = re.findall(r'<img[^>]*src=["\']props\.(\w+)["\']', html, re.IGNORECASE)
    for prop in pattern2:
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                results.append((prop, query))
                seen_props.add(prop)

    pattern3 = re.findall(r'(?:const|let|var)\s+(\w*(?:image|photo|pic|img|src)\w*)\s*=', html, re.IGNORECASE)
    for prop in pattern3:
        if prop not in seen_props:
            query = _simple_clean_query(_extract_search_query_from_prop_name(prop))
            if query:
                results.append((prop, query))
                seen_props.add(prop)

    all_img_tags = re.findall(r'<img[^>]+>', html, re.IGNORECASE)
    for img_tag in all_img_tags:
        src_match = re.search(r'src=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
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
                if alt and alt.lower() not in seen_props:
                    results.append((f"alt_{alt.replace(' ', '_').replace('-', '_')[:30]}", alt))
                    seen_props.add(alt.lower())

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


async def _enhance_image_query_with_ai(query: str, slide_context: str = "") -> str:
    """Use AI to refine a search query into a specific, concrete image search term."""
    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        brand_match = ""
        if "BRAND:" in slide_context:
            brand_search = re.search(r'BRAND:\s*([^\|]+)', slide_context)
            if brand_search:
                brand_match = brand_search.group(1).strip()
        if not brand_match and "Topic:" in slide_context:
            topic_search = re.search(r'Topic:\s*([^\|]+)', slide_context)
            if topic_search:
                topic = topic_search.group(1).strip()
                if '.com' in topic or '.ai' in topic or '.io' in topic:
                    brand_match = topic.split('.')[0].title()
                else:
                    brand_match = topic
        if not brand_match and "Deck:" in slide_context:
            deck_search = re.search(r'Deck:\s*([^\|]+)', slide_context)
            if deck_search:
                brand_match = deck_search.group(1).strip()

        prompt = f"""Convert this into a SPECIFIC, concrete Google Images search query.

DESCRIPTION: {query}
CONTEXT: {slide_context[:500] if slide_context else 'Presentation slide'}
{f"BRAND/COMPANY: {brand_match}" if brand_match else ""}

RULES:
- Be SPECIFIC: "Tesla Model S white sedan" not "electric car"
- Include proper nouns when relevant (brands, places, products)
- Add visual details: "aerial drone photo of Tokyo skyline night" not "city"
- For people: specify profession + context ("surgeon performing operation" not "doctor")
- NEVER use generic words like: image, photo, picture, illustration, concept, abstract

Return ONLY the search query (3-6 words)."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            100,
            0.3,
        )

        enhanced = str(response).strip().strip('"\'')
        if enhanced and len(enhanced) < 60 and "cannot" not in enhanced.lower() and "I " not in enhanced:
            logger.debug("[POST_SEARCH] AI optimized query: '%s' -> '%s'", query, enhanced)
            return enhanced
    except Exception as e:
        logger.debug("[POST_SEARCH] AI enhancement failed: %s", e)

    cleaned = query.strip()
    logger.debug("[POST_SEARCH] Fallback cleaned query: '%s' -> '%s'", query, cleaned)
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

        # Skip generic logo queries entirely
        if q_lower in generic_logo_terms:
            logger.debug(f"[POST_SEARCH] Skipping generic logo query: {query}")
            continue

        # Skip completely generic image queries that won't produce useful results
        if _is_generic_query(query):
            logger.debug(f"[POST_SEARCH] Skipping generic query: {query}")
            continue

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

    async with ImageStorageService() as storage:

        async def search_and_pick_best(prop_name: str, query: str) -> Tuple[str, str, Optional[str]]:
            try:
                original_query = query

                if cache:
                    cached = cache.get(original_query)
                    if cached:
                        logger.debug("[POST_SEARCH] Cache hit for '%s'", original_query)
                        return (prop_name, original_query, cached)

                search_query = query
                # Enhance short queries or queries that contain mostly generic words
                words = query.lower().split()
                generic_word_count = sum(1 for w in words if w in GENERIC_IMAGE_TERMS)
                needs_enhancement = (
                    len(words) <= 2 or
                    generic_word_count >= len(words) // 2  # Half or more words are generic
                )
                if needs_enhancement:
                    search_query = await _enhance_image_query_with_ai(query, slide_context)

                # Ensure query is concise
                words = search_query.split()
                if len(words) > 6:
                    search_query = " ".join(words[:6])

                results = await serpapi.search_images(search_query)
                if asyncio.iscoroutine(results):
                    results = await results
                if not isinstance(results, (dict, list)):
                    logger.warning("[POST_SEARCH] Unexpected results type for '%s': %s", search_query, type(results))
                    return (prop_name, original_query, None)
                if not results:
                    logger.warning("[POST_SEARCH] No results for: %s", search_query)
                    return (prop_name, original_query, None)

                photos = results.get('photos', []) if isinstance(results, dict) else results
                if not isinstance(photos, list):
                    logger.warning("[POST_SEARCH] Unexpected photos type for '%s': %s", search_query, type(photos))
                    return (prop_name, original_query, None)
                if not photos:
                    logger.warning("[POST_SEARCH] No image candidates for: %s", search_query)
                    return (prop_name, original_query, None)

                valid_urls = [
                    r.get('url') or r.get('original') or r.get('thumbnail')
                    for r in photos
                    if isinstance(r, dict)
                ]
                valid_urls = [u for u in valid_urls if u]
                if not valid_urls:
                    logger.warning("[POST_SEARCH] No valid URLs for: %s", search_query)
                    return (prop_name, original_query, None)

                for url in valid_urls:
                    try:
                        upload_result = await storage.upload_image_from_url(url)
                        if 'error' not in upload_result and upload_result.get('url'):
                            our_url = upload_result['url']
                            logger.debug("[POST_SEARCH] Uploaded image for %s (%s)", prop_name, search_query)
                            if cache:
                                cache.set(original_query, our_url)
                            return (prop_name, original_query, our_url)
                    except Exception as e:
                        logger.debug(f"[POST_SEARCH] Upload failed: {e}")
                        continue

                logger.warning("[POST_SEARCH] All uploads failed for: %s", search_query)
                return (prop_name, original_query, None)

            except Exception as e:
                logger.warning("[POST_SEARCH] Error for '%s': %s", query, e)
                return (prop_name, original_query, None)

        tasks = [search_and_pick_best(prop, query) for prop, query in regular_queries[:8]]
        results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple) and len(result) == 3 and result[2]:
            prop_name, query, url = result
            prefetched[prop_name] = url
            prefetched[f"{prop_name}_query"] = query

    image_count = len([k for k in prefetched if not k.endswith('_query') and not k.startswith('logo')])
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
