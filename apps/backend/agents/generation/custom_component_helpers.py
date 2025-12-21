"""Helper utilities for CustomComponent generation."""

import asyncio
import re
from typing import Dict, Any, Optional, List, Tuple

from agents.ai.clients import get_client, invoke
from agents.config import IMAGE_SEARCH_MODEL
from services.image_cache import ImageSearchCache
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Maximum dimensions for reference images (to prevent token explosion)
MAX_IMAGE_DIMENSION = 384
MAX_IMAGE_BYTES = 150_000
JPEG_QUALITY = 60


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


def _extract_image_props_from_html(html: str) -> List[Tuple[str, str]]:
    """Extract image prop names and their search queries from generated HTML."""
    results: List[Tuple[str, str]] = []
    seen_props = set()

    pattern1 = re.findall(r'<img[^>]*src=["\']?\$\{(\w+)\}["\']?', html, re.IGNORECASE)
    for prop in pattern1:
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
        src_match = re.search(r'src=["\']?(placeholder|data:|about:blank|)["\']?', img_tag, re.IGNORECASE)
        if src_match or 'src=""' in img_tag or "src=''" in img_tag:
            alt_match = re.search(r'alt=["\']([^"\']+)["\']', img_tag, re.IGNORECASE)
            if alt_match:
                alt = alt_match.group(1).strip()
                if alt and alt.lower() not in seen_props:
                    results.append((f"alt_{alt.replace(' ', '_')[:30]}", alt))
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
    """Use AI to refine a search query."""
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

        prompt = f"""Write a concise Google Images search query.

DESCRIPTION: {query}
CONTEXT: {slide_context[:500] if slide_context else 'Presentation slide'}
{f"BRAND/COMPANY: {brand_match}" if brand_match else ""}

Return ONLY the query (2-6 words)."""

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
    if brandfetch_logo:
        prefetched['logoUrl'] = brandfetch_logo
        prefetched['logoUrl_query'] = 'brand logo'
        logger.info("[POST_SEARCH] Using Brandfetch logo")

    if not prop_queries:
        logger.debug("[POST_SEARCH] No prop queries to search")
        return prefetched

    try:
        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("[POST_SEARCH] SerpAPI not available")
            return prefetched
    except Exception as e:
        logger.warning("[POST_SEARCH] Could not init SerpAPI: %s", e)
        return prefetched

    logger.info("[POST_SEARCH] Searching SERP API for %s image props", len(prop_queries))

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
                if len(query.split()) <= 2:
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

        tasks = [search_and_pick_best(prop, query) for prop, query in prop_queries[:8]]
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
            content_b64 = media.get("content")
            if content_b64:
                mime = media.get("type") or "image/png"
                reference_images.append(f"data:{mime};base64,{content_b64}")
            elif media.get("previewUrl"):
                reference_images.append(media["previewUrl"])
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
