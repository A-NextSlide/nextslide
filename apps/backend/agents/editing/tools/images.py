"""
Image tools - search and manage images in slides.
"""
import asyncio
import logging
import re
from typing import Literal, Optional, List, Dict, Any, Tuple
from pydantic import Field, BaseModel

from models.tools import ToolModel
from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.slide import SlideDiffBase
from utils.images import image_exists

logger = logging.getLogger(__name__)


async def _upload_image_to_supabase(image_url: str) -> Tuple[str, bool]:
    """
    Upload an external image to Supabase storage.
    Returns (url, success) - either the Supabase URL or original URL on failure.
    """
    from services.image_storage_service import ImageStorageService

    # Skip if already our bucket URL
    OUR_BUCKET_DOMAINS = ['nextslide.ai', 'supabase.co', 'supabase.com']
    if any(domain in image_url.lower() for domain in OUR_BUCKET_DOMAINS):
        logger.info(f"[SEARCH_IMAGES] Image already in our bucket: {image_url[:50]}...")
        return image_url, True

    try:
        async with ImageStorageService() as storage:
            result = await storage.upload_image_from_url(image_url)
            if 'error' not in result and result.get('url'):
                uploaded_url = result['url']
                logger.info(f"[SEARCH_IMAGES] ✅ Uploaded to Supabase: {image_url[:40]}... -> {uploaded_url[:50]}...")
                return uploaded_url, True
            else:
                logger.warning(f"[SEARCH_IMAGES] Upload failed, using original: {result.get('error', 'Unknown error')}")
                return image_url, False
    except Exception as e:
        logger.error(f"[SEARCH_IMAGES] Upload exception: {e}")
        return image_url, False


# Generic/vague terms that need AI enhancement
VAGUE_QUERY_TERMS = {
    'image', 'picture', 'photo', 'graphic', 'visual', 'icon',
    'business', 'technology', 'professional', 'corporate', 'modern',
    'abstract', 'concept', 'idea', 'strategy', 'innovation', 'success',
    'growth', 'teamwork', 'collaboration', 'excellence', 'quality'
}


def _extract_slide_context(current_slide: Dict, render_html: str = None) -> Dict[str, str]:
    """Extract slide title and content for context-aware image search."""
    title = ""
    content = ""

    # Try to get title from slide properties
    title = current_slide.get("title", "") or current_slide.get("name", "")

    # Extract from HTML if available
    if render_html:
        # Extract title from h1, h2, or prominent text
        title_match = re.search(r'<h[12][^>]*>([^<]+)</h[12]>', render_html)
        if title_match:
            title = title_match.group(1).strip()

        # Extract text content (strip HTML tags)
        text_content = re.sub(r'<[^>]+>', ' ', render_html)
        text_content = ' '.join(text_content.split())[:500]
        content = text_content

    return {"title": title, "content": content}


def _is_query_vague(query: str) -> bool:
    """Check if the query is too vague/generic."""
    words = set(query.lower().split())
    vague_count = len(words & VAGUE_QUERY_TERMS)
    # If more than half the words are vague, or it's a single vague word
    return vague_count > len(words) / 2 or (len(words) == 1 and vague_count == 1)


async def _enhance_query_with_ai(query: str, slide_context: Dict[str, str]) -> str:
    """Use AI to enhance a vague query into something specific and visual."""
    from agents.ai.clients import get_client, invoke
    from agents.config import IMAGE_SEARCH_MODEL

    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        prompt = f"""Transform this vague image search query into a SPECIFIC, VISUAL query.

ORIGINAL QUERY: {query}
SLIDE TITLE: {slide_context.get('title', 'Unknown')}
SLIDE CONTENT: {slide_context.get('content', '')[:300]}

RULES:
1. Return ONE specific, photographable scene (3-6 words)
2. Describe a REAL scene: "person doing X", "object in Y setting"
3. Include specific details: "data analyst reviewing dashboard on monitor" NOT "analytics"
4. For companies/products, be specific: "Tesla charging station" NOT "electric car"
5. For concepts like sustainability: "wind turbines on hillside" NOT "sustainability"

GOOD EXAMPLES:
- "software developer coding on laptop"
- "warehouse robots moving packages"
- "modern office conference room meeting"
- "solar panels on rooftop building"
- "business handshake close-up"

Return ONLY the enhanced query (3-6 words), nothing else."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            100,
            0.3
        )

        enhanced = str(response).strip().strip('"\'')
        if enhanced and len(enhanced) < 100:
            logger.info(f"[SEARCH_IMAGES] Enhanced query: '{query}' -> '{enhanced}'")
            return enhanced
    except Exception as e:
        logger.warning(f"[SEARCH_IMAGES] Query enhancement failed: {e}")

    return query


async def _validate_image_url(url: str) -> bool:
    """Check if an image URL is valid and accessible."""
    import aiohttp

    try:
        async with aiohttp.ClientSession() as session:
            async with session.head(url, timeout=aiohttp.ClientTimeout(total=5), allow_redirects=True) as resp:
                if resp.status != 200:
                    return False
                content_type = resp.headers.get('Content-Type', '')
                return 'image' in content_type.lower()
    except Exception:
        return False


class ValidateImageArgs(ToolModel):
    tool_name: Literal["validate_image"] = Field(description="Validate the image url")
    image_url: str = Field(description="The url of the image to validate")


def validate_image(edit_args: ValidateImageArgs, **kwargs):
    return image_exists(edit_args.image_url)


def search_images(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry=None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Search for images using SERP API (Google Images).

    Can be used to:
    1. Just search and return results (component_id=None)
    2. Search and replace an existing Image component (component_id provided)

    Args in dict:
        query: str - What to search for (e.g., "modern office teamwork", "technology abstract")
        component_id: Optional[str] - If provided, replace this Image component with the best result
        slide_id: Optional[str] - Slide containing the component (defaults to current slide)
        num_results: int - Number of results to return (default 5)
        orientation: Optional[str] - "landscape", "portrait", or "square"
    """
    query = args.get("query", "")
    component_id = args.get("component_id")
    slide_id = args.get("slide_id") or (current_slide.get("id") if current_slide else None)
    num_results = args.get("num_results", 5)
    orientation = args.get("orientation", "landscape")

    if not query:
        logger.warning("[SEARCH_IMAGES] No query provided")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Auto-detect CustomComponent if no component_id provided
    # This handles the common case where the slide IS a CustomComponent with embedded images
    render_html = ""
    if not component_id and current_slide:
        components = current_slide.get("components", [])
        for c in components:
            if c.get("type") == "CustomComponent":
                component_id = c.get("id")
                render_html = c.get("props", {}).get("render", "")
                logger.info(f"[SEARCH_IMAGES] Auto-detected CustomComponent: {component_id}")
                break
            elif c.get("type") == "Image":
                # Also auto-detect Image components
                component_id = c.get("id")
                logger.info(f"[SEARCH_IMAGES] Auto-detected Image component: {component_id}")
                break

    # Run async operations in sync context
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Extract slide context for AI-enhanced queries
    slide_context = _extract_slide_context(current_slide or {}, render_html)

    # Enhance vague queries with AI for better results
    original_query = query
    if _is_query_vague(query):
        logger.info(f"[SEARCH_IMAGES] Query '{query}' is vague, enhancing with AI...")
        try:
            query = loop.run_until_complete(_enhance_query_with_ai(query, slide_context))
        except Exception as e:
            logger.warning(f"[SEARCH_IMAGES] AI enhancement failed: {e}")

    logger.info(f"[SEARCH_IMAGES] Searching for: '{query}' (original='{original_query}', component_id={component_id}, orientation={orientation})")

    try:
        from services.serpapi_service import SerpAPIService

        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("[SEARCH_IMAGES] SERP API not available (no API key)")
            return DeckDiff(DeckDiffBase(slides_to_update=[]))

        # Search for images with validation
        async def do_search_with_validation():
            results = await serpapi.search_images(
                query=query,
                per_page=num_results * 3,  # Get extra in case some are invalid
                orientation=orientation
            )
            photos = results.get("photos", [])

            # Validate URLs and return first valid ones
            valid_photos = []
            for photo in photos:
                if len(valid_photos) >= num_results:
                    break
                url = photo.get("url") or photo.get("src", {}).get("large")
                if url:
                    # Quick validation - check if URL looks valid
                    if url.startswith("http") and not any(x in url.lower() for x in ['placeholder', 'dummy', 'example.com']):
                        valid_photos.append(photo)
            return valid_photos

        photos = loop.run_until_complete(do_search_with_validation())

        logger.info(f"[SEARCH_IMAGES] Found {len(photos)} valid images for '{query}'")

        # Get the best image URL and upload to Supabase
        best_image_url = None
        best_image_alt = query
        for photo in photos:
            url = photo.get("url") or photo.get("src", {}).get("large")
            if url:
                # CRITICAL: Upload to Supabase first, like slide generation does
                # This ensures images are in our bucket and won't break/expire
                logger.info(f"[SEARCH_IMAGES] Uploading image to Supabase: {url[:60]}...")
                uploaded_url, success = loop.run_until_complete(_upload_image_to_supabase(url))
                if success:
                    best_image_url = uploaded_url
                    best_image_alt = photo.get("alt", query)
                    logger.info(f"[SEARCH_IMAGES] Using Supabase URL: {best_image_url[:60]}...")
                    break
                else:
                    # Try next image if upload failed
                    logger.warning(f"[SEARCH_IMAGES] Upload failed for {url[:40]}..., trying next image")
                    continue

        # If component_id provided and we found an image, replace it
        if component_id and best_image_url:
            # Find the target slide
            target_slide_id = slide_id
            if not target_slide_id and current_slide:
                target_slide_id = current_slide.get("id")

            logger.info(f"[SEARCH_IMAGES] Looking up: component_id={component_id}, target_slide_id={target_slide_id}")

            if target_slide_id:
                # Find the component
                # CRITICAL: Prefer current_slide if it matches target_slide_id
                # The orchestrator patches current_slide with accumulated props from previous tool calls
                # This ensures sequential search_images calls build on each other's changes
                target_slide = None

                # First check if current_slide IS the target (this has accumulated props!)
                if current_slide and current_slide.get("id") == target_slide_id:
                    target_slide = current_slide
                    logger.info(f"[SEARCH_IMAGES] Using current_slide (with accumulated props) for {target_slide_id}")
                else:
                    # Fall back to deck_data lookup
                    all_slide_ids = [s.get("id") for s in deck_data.get("slides", [])]
                    logger.info(f"[SEARCH_IMAGES] Looking in deck_data for {target_slide_id}. Available: {all_slide_ids}")

                    for s in deck_data.get("slides", []):
                        if s.get("id") == target_slide_id:
                            target_slide = s
                            break

                if not target_slide:
                    logger.warning(f"[SEARCH_IMAGES] Slide {target_slide_id} not found, using current_slide as fallback")
                    target_slide = current_slide

                if target_slide:
                    components = target_slide.get("components", [])
                    all_component_ids = [(c.get("id"), c.get("type")) for c in components]
                    logger.info(f"[SEARCH_IMAGES] Components on slide: {all_component_ids}")

                    target_component = None
                    for c in components:
                        if c.get("id") == component_id:
                            target_component = c
                            break

                    if not target_component:
                        logger.warning(f"[SEARCH_IMAGES] Component {component_id} not found in slide {target_slide_id}")

                    if target_component:
                        comp_type = target_component.get("type")

                        if comp_type == "Image":
                            # Standard Image component - update src prop
                            logger.info(f"[SEARCH_IMAGES] Replacing Image {component_id} with: {best_image_url[:80]}...")
                            return DeckDiff(DeckDiffBase(
                                slides_to_update=[
                                    SlideDiffBase(
                                        slide_id=target_slide_id,
                                        components_to_update=[
                                            ComponentDiffBase(
                                                id=component_id,
                                                props={
                                                    "src": best_image_url,
                                                    "alt": best_image_alt
                                                }
                                            )
                                        ]
                                    )
                                ]
                            ))
                        elif comp_type == "CustomComponent":
                            # CustomComponent - find and replace image URL in HTML
                            props = target_component.get("props", {})
                            render_html = props.get("render", "")

                            # CRITICAL: Strip frontend editing scripts from HTML before processing
                            # These can accumulate if frontend sends back HTML with injected scripts
                            from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
                            render_html = strip_frontend_editing_scripts(render_html)

                            if render_html:
                                import re
                                old_url = args.get("old_url")  # Optional: specific URL to replace
                                image_index = args.get("image_index")  # Optional: 0-based index of image to replace

                                if old_url:
                                    # Replace specific URL
                                    new_html = render_html.replace(old_url, best_image_url)
                                else:
                                    # Find all images: both <img> tags AND CSS background-image URLs
                                    # Pattern 1: <img src="...">
                                    img_pattern = r'<img[^>]*src=["\']([^"\']+)["\'][^>]*>'
                                    # Pattern 2: background-image: url('...') or url("...")
                                    bg_pattern = r'background-image:\s*url\(["\']?([^"\')\s]+)["\']?\)'
                                    # Pattern 3: style="...background-image: url('...')..." inline
                                    inline_bg_pattern = r'style=["\'][^"\']*background-image:\s*url\(["\']?([^"\')\s]+)["\']?\)[^"\']*["\']'

                                    img_matches = list(re.finditer(img_pattern, render_html))
                                    bg_matches = list(re.finditer(bg_pattern, render_html))
                                    inline_bg_matches = list(re.finditer(inline_bg_pattern, render_html))

                                    # Combine all matches, keeping track of their positions
                                    # CRITICAL: Deduplicate by URL to avoid double-counting
                                    # bg_pattern and inline_bg_pattern can match the same URL
                                    all_matches = []
                                    seen_urls = set()

                                    # Add img matches first (these are unique - <img> tags)
                                    for m in img_matches:
                                        url = m.group(1)
                                        if url not in seen_urls:
                                            all_matches.append((m.start(), m, 'img'))
                                            seen_urls.add(url)

                                    # For background images, prefer inline_bg matches (more context)
                                    # over bare bg_pattern matches
                                    for m in inline_bg_matches:
                                        url = m.group(1)
                                        if url not in seen_urls:
                                            all_matches.append((m.start(), m, 'inline_bg'))
                                            seen_urls.add(url)

                                    # Only add bg_pattern matches if not already seen
                                    for m in bg_matches:
                                        url = m.group(1)
                                        if url not in seen_urls:
                                            all_matches.append((m.start(), m, 'bg'))
                                            seen_urls.add(url)

                                    # Sort by position to maintain order
                                    all_matches.sort(key=lambda x: x[0])
                                    matches = [m[1] for m in all_matches]

                                    logger.info(f"[SEARCH_IMAGES] Found {len(matches)} unique images ({len(img_matches)} <img> tags, {len(bg_matches)} CSS bg, {len(inline_bg_matches)} inline bg - deduplicated)")

                                    if not matches:
                                        logger.warning(f"[SEARCH_IMAGES] No images found in CustomComponent HTML (checked <img> tags and CSS background-images)")
                                        return DeckDiff(DeckDiffBase(slides_to_update=[]))

                                    # Log what each image index maps to (helpful for debugging)
                                    for idx, m in enumerate(matches):
                                        url = m.group(1)
                                        # Get surrounding context for logging
                                        ctx_start = max(0, m.start() - 100)
                                        ctx_end = min(len(render_html), m.end() + 100)
                                        ctx = re.sub(r'<[^>]+>', ' ', render_html[ctx_start:ctx_end])
                                        ctx = ' '.join(ctx.split())[:80]
                                        logger.info(f"[SEARCH_IMAGES] Index {idx}: {url[:60]}... context: '{ctx}'")

                                    # If only one image, just replace it
                                    if len(matches) == 1:
                                        old_url = matches[0].group(1)
                                        new_html = render_html.replace(old_url, best_image_url, 1)
                                        logger.info(f"[SEARCH_IMAGES] Replacing only image: {old_url[:50]}... -> {best_image_url[:50]}...")
                                    else:
                                        # ALWAYS use smart scoring for multiple images
                                        # The LLM's image_index guesses are often wrong (it doesn't know
                                        # that index 0 might be a logo, not a card background)
                                        # image_index is used as a hint/tiebreaker, not an override
                                        # Multiple images - score each by relevance to query
                                        query_words = set(query.lower().split())
                                        # Identify generic words that shouldn't dominate scoring
                                        generic_words = {'logo', 'image', 'photo', 'picture', 'icon', 'img', 'graphic'}
                                        specific_words = query_words - generic_words

                                        best_match_idx = 0
                                        best_score = -1

                                        for idx, match in enumerate(matches):
                                            full_tag = match.group(0)
                                            img_url = match.group(1)
                                            score = 0
                                            specific_word_matched = False

                                            # Extract alt text
                                            alt_match = re.search(r'alt=["\']([^"\']*)["\']', full_tag)
                                            alt_text = alt_match.group(1).lower() if alt_match else ""

                                            # Extract class names
                                            class_match = re.search(r'class=["\']([^"\']*)["\']', full_tag)
                                            class_text = class_match.group(1).lower() if class_match else ""

                                            # Get WIDE surrounding context (500 chars before/after to catch titles)
                                            start = max(0, match.start() - 500)
                                            end = min(len(render_html), match.end() + 500)
                                            context = render_html[start:end].lower()

                                            # Also extract visible text content from context (strip HTML tags)
                                            text_content = re.sub(r'<[^>]+>', ' ', context)
                                            text_content = ' '.join(text_content.split()).lower()

                                            # Score based on query word matches
                                            for word in query_words:
                                                if len(word) < 3:
                                                    continue

                                                is_specific = word in specific_words
                                                word_score = 0

                                                if word in alt_text:
                                                    word_score += 5 if is_specific else 2  # Specific words in alt are gold
                                                    if is_specific:
                                                        specific_word_matched = True
                                                if word in class_text:
                                                    word_score += 2 if is_specific else 1
                                                if word in text_content:
                                                    word_score += 4 if is_specific else 1  # Text content (like card titles)
                                                    if is_specific:
                                                        specific_word_matched = True
                                                if word in img_url.lower():
                                                    word_score += 3 if is_specific else 1

                                                score += word_score

                                            # Bonus if we matched a specific (non-generic) word
                                            if specific_word_matched:
                                                score += 5

                                            # Small tiebreaker bonus if LLM's image_index matches
                                            # This shouldn't override strong matches but helps when scores are equal
                                            if image_index is not None and idx == image_index:
                                                score += 0.5  # Small bonus, not enough to override real matches

                                            logger.info(f"[SEARCH_IMAGES] Image {idx}: score={score}, specific_match={specific_word_matched}, alt='{alt_text[:30]}', text_near='{text_content[:50]}...'")

                                            if score > best_score:
                                                best_score = score
                                                best_match_idx = idx

                                        old_url = matches[best_match_idx].group(1)
                                        new_html = render_html.replace(old_url, best_image_url, 1)
                                        logger.info(f"[SEARCH_IMAGES] Best match (idx={best_match_idx}, score={best_score}): {old_url[:50]}... -> {best_image_url[:50]}...")

                                if new_html != render_html:
                                    logger.info(f"[SEARCH_IMAGES] ✅ RETURNING DeckDiff: slide_id={target_slide_id}, component_id={component_id}, html_len={len(new_html)}")
                                    diff = DeckDiff(DeckDiffBase(
                                        slides_to_update=[
                                            SlideDiffBase(
                                                slide_id=target_slide_id,
                                                components_to_update=[
                                                    ComponentDiffBase(
                                                        id=component_id,
                                                        props={"render": new_html}
                                                    )
                                                ]
                                            )
                                        ]
                                    ))
                                    return diff
                                else:
                                    logger.warning(f"[SEARCH_IMAGES] ⚠️ HTML unchanged after replacement! old_url may not exist in HTML")
                        else:
                            logger.warning(f"[SEARCH_IMAGES] Component {component_id} is type {comp_type}, not Image or CustomComponent")
                    else:
                        logger.warning(f"[SEARCH_IMAGES] Component {component_id} not found")

        # Return empty diff if just searching or no component to replace
        logger.info(f"[SEARCH_IMAGES] Search complete. Best image: {best_image_url[:80] if best_image_url else 'None'}")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    except Exception as e:
        logger.error(f"[SEARCH_IMAGES] Error: {e}")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))


def replace_image_from_search(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry=None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Replace an Image component with a specific image URL (typically from search results).

    Args in dict:
        component_id: str - The Image component to replace
        image_url: str - The URL of the new image
        alt: Optional[str] - Alt text for the image
        slide_id: Optional[str] - Slide containing the component (defaults to current slide)
    """
    component_id = args.get("component_id")
    image_url = args.get("image_url")
    alt = args.get("alt", "")
    slide_id = args.get("slide_id") or (current_slide.get("id") if current_slide else None)

    if not component_id:
        logger.warning("[REPLACE_IMAGE] No component_id provided")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    if not image_url:
        logger.warning("[REPLACE_IMAGE] No image_url provided")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Validate the image URL (optional - log warning but proceed)
    if not image_exists(image_url):
        logger.warning(f"[REPLACE_IMAGE] Image URL may not be accessible: {image_url[:80]}")

    # CRITICAL: Upload to Supabase first, like slide generation does
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    logger.info(f"[REPLACE_IMAGE] Uploading image to Supabase: {image_url[:60]}...")
    uploaded_url, success = loop.run_until_complete(_upload_image_to_supabase(image_url))
    if success:
        image_url = uploaded_url
        logger.info(f"[REPLACE_IMAGE] Using Supabase URL: {image_url[:60]}...")
    else:
        logger.warning(f"[REPLACE_IMAGE] Upload failed, using original URL")

    logger.info(f"[REPLACE_IMAGE] Replacing {component_id} with {image_url[:80]}...")

    return DeckDiff(DeckDiffBase(
        slides_to_update=[
            SlideDiffBase(
                slide_id=slide_id,
                components_to_update=[
                    ComponentDiffBase(
                        id=component_id,
                        props={
                            "src": image_url,
                            "alt": alt
                        }
                    )
                ]
            )
        ]
    ))
