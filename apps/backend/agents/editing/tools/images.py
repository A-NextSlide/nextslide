"""
Image tools - LLM-based image search and replacement.

All image selection decisions are made by the LLM, not hardcoded rules.
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

# Logo.dev service for company logos
try:
    from agents.tools.theme.logodev_service import LogoDevService
    LOGODEV_AVAILABLE = True
except ImportError:
    LOGODEV_AVAILABLE = False
    logger.warning("[IMAGES] Logo.dev service not available")


# =============================================================================
# LOGO.DEV INTEGRATION
# =============================================================================

def _is_company_logo_query(query: str) -> Tuple[bool, str]:
    """
    Detect if a query is for a company logo and extract the company name.

    Returns:
        Tuple of (is_logo_query, company_name)
    """
    if not query:
        return False, ""

    q = query.lower().strip()

    # Skip generic logo queries
    generic_terms = {'logo', 'company logo', 'brand logo', 'business logo', 'corporate logo'}
    if q in generic_terms:
        return False, ""

    # Patterns like "Apple logo", "Google Logo", "Microsoft logo"
    logo_suffix_match = re.match(r'^(.+?)\s+logo\s*$', q, re.IGNORECASE)
    if logo_suffix_match:
        company = logo_suffix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    # Patterns like "logo of Apple", "logo for Google"
    logo_prefix_match = re.match(r'^logo\s+(?:of|for)\s+(.+)$', q, re.IGNORECASE)
    if logo_prefix_match:
        company = logo_prefix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    return False, ""


async def _fetch_logo_from_logodev(company_name: str) -> Optional[str]:
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
                logger.debug(f"[IMAGES] Logo.dev: No logo found for '{company_name}'")
                return None

            logo_url = result['logo_url']
            logger.info(f"[IMAGES] Logo.dev: Found logo for '{company_name}'")

            # Upload to our storage for consistent delivery
            async with ImageStorageService() as storage:
                upload_result = await storage.upload_image_from_url(
                    logo_url,
                    metadata={"source": "logodev", "company": company_name}
                )
                if upload_result and upload_result.get('url'):
                    logger.info(f"[IMAGES] Logo.dev: Uploaded {company_name} logo to storage")
                    return upload_result['url']

    except Exception as e:
        logger.warning(f"[IMAGES] Logo.dev error for '{company_name}': {e}")

    return None


# =============================================================================
# MODELS
# =============================================================================

class ImageInfo(BaseModel):
    """Information about an image for LLM selection."""
    index: int
    url: str
    description: str  # Combined alt, label, context


class ImageSelectionResponse(BaseModel):
    """LLM response for image selection."""
    selected_index: int = Field(description="Index of the image to replace (0-based)")
    reasoning: str = Field(description="Why this image was selected")


# =============================================================================
# IMAGE EXTRACTION
# =============================================================================

def _extract_all_images(props: Dict[str, Any], html: str) -> List[ImageInfo]:
    """
    Extract all images from a CustomComponent.
    Combines metadata (if available) with HTML extraction.

    IMPORTANT: Only uses imageMetadata URLs if they actually exist in the HTML.
    This prevents stale metadata from causing replacement failures after edits.
    """
    images = []
    seen_urls = set()

    # Source 1: imageMetadata (new slides have this)
    # CRITICAL: Only use metadata URLs that actually exist in the current HTML
    # After image replacements, metadata may be stale (contains old URLs)
    image_metadata = props.get("imageMetadata", {})
    for prop_name, meta in image_metadata.items():
        if not isinstance(meta, dict):
            continue
        url = meta.get("url", "")
        if not url or url in seen_urls:
            continue

        # VALIDATION: Skip metadata entries whose URLs are not in the HTML
        # This handles the case where an image was replaced but metadata wasn't updated
        if url not in html:
            logger.info(f"[IMAGES] Skipping stale metadata URL (not in HTML): {url[:60]}...")
            continue

        seen_urls.add(url)

        # Build description from metadata
        label = meta.get("label", "")
        role = meta.get("role", "")
        query = meta.get("query", "")
        desc_parts = []
        if role:
            desc_parts.append(f"role: {role}")
        if label:
            desc_parts.append(f"label: {label}")
        if query:
            desc_parts.append(f"search query: {query}")

        images.append(ImageInfo(
            index=len(images),
            url=url,
            description=" | ".join(desc_parts) if desc_parts else prop_name
        ))

    # Source 2: HTML extraction (for images not in metadata)
    # <img src="..." alt="...">
    for match in re.finditer(r'<img[^>]*src=["\']([^"\']+)["\'][^>]*>', html):
        url = match.group(1)
        if not url.startswith('http') or url in seen_urls:
            continue
        seen_urls.add(url)

        # Extract alt and surrounding context
        full_tag = match.group(0)
        alt_match = re.search(r'alt=["\']([^"\']*)["\']', full_tag)
        alt = alt_match.group(1) if alt_match else ""

        # Get surrounding text with LARGER window to capture nearby labels/company names
        # This helps when the company name is in a sibling element (e.g., <img/><span>Costco</span>)
        start = max(0, match.start() - 300)
        end = min(len(html), match.end() + 300)
        context_raw = html[start:end]
        # Extract just text content (remove HTML tags)
        context = re.sub(r'<[^>]+>', ' ', context_raw)
        context = ' '.join(context.split())[:150]

        # Build description: include alt text AND context for better matching
        desc_parts = []
        if alt:
            desc_parts.append(f"alt: {alt}")
        if context:
            desc_parts.append(f"nearby text: {context}")

        img_desc = " | ".join(desc_parts) if desc_parts else f"image at position {len(images)}"
        logger.info(f"[IMAGES] Extracted image [{len(images)}]: {img_desc[:100]}...")

        images.append(ImageInfo(
            index=len(images),
            url=url,
            description=img_desc
        ))

    # Source 3: CSS background images
    for match in re.finditer(r'background(?:-image)?:\s*[^;]*url\(["\']?([^"\')\s]+)["\']?\)', html):
        url = match.group(1)
        if not url.startswith('http') or url in seen_urls:
            continue
        seen_urls.add(url)

        start = max(0, match.start() - 100)
        end = min(len(html), match.end() + 100)
        context = re.sub(r'<[^>]+>', ' ', html[start:end])
        context = ' '.join(context.split())[:80]

        images.append(ImageInfo(
            index=len(images),
            url=url,
            description=f"background image, context: {context}"
        ))

    return images


# =============================================================================
# LLM IMAGE SELECTION
# =============================================================================

async def _select_image_with_llm(
    user_request: str,
    images: List[ImageInfo],
) -> int:
    """
    Use LLM to select which image the user wants to replace.

    Args:
        user_request: What the user said (e.g., "replace the chicken wing image")
        images: List of images with descriptions

    Returns:
        Index of selected image
    """
    if len(images) == 1:
        return 0

    from agents.ai.clients import get_client, invoke
    from agents.config import IMAGE_SEARCH_MODEL

    # Build image list for LLM
    image_list = "\n".join([
        f"[{img.index}] {img.description}"
        for img in images
    ])

    prompt = f"""You are selecting which image to replace based on the user's request.

USER REQUEST: "{user_request}"

AVAILABLE IMAGES:
{image_list}

Select the image that best matches what the user wants to change.
- If user mentions a company name (e.g., "Costco", "Sephora", "Google") → find the image with that name in its context/description
- If user says "logo next to X" or "X logo" → find the image whose context contains "X"
- If user says "main image", "hero", or just "the image" → pick the primary content image, NOT logos
- If user says "logo" or "brand" (generic) → pick the first logo-type image
- If user mentions specific content (like "chicken wings") → pick the image with matching description
- Match company names case-insensitively (costco = Costco = COSTCO)
- When in doubt, prefer content images over logos/icons

Respond with ONLY the index number (0, 1, 2, etc.) of the image to replace.
Just the number, nothing else."""

    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)
        loop = asyncio.get_event_loop()

        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            10,  # Short response
            0.0  # Deterministic
        )

        result = str(response).strip()
        # Extract number
        numbers = re.findall(r'\d+', result)
        if numbers:
            idx = int(numbers[0])
            if 0 <= idx < len(images):
                logger.info(f"[IMAGE_SELECT] LLM selected [{idx}] {images[idx].description[:50]}")
                return idx

        logger.warning(f"[IMAGE_SELECT] Invalid LLM response: {result}, defaulting to 0")
    except Exception as e:
        logger.error(f"[IMAGE_SELECT] LLM failed: {e}, defaulting to 0")

    return 0


# =============================================================================
# IMAGE UPLOAD
# =============================================================================

async def _upload_to_supabase(image_url: str) -> Tuple[str, bool]:
    """Upload external image to Supabase. Returns (url, success)."""
    from services.image_storage_service import ImageStorageService

    # Skip if already in our bucket
    if any(d in image_url.lower() for d in ['nextslide.ai', 'supabase.co', 'supabase.com']):
        return image_url, True

    try:
        async with ImageStorageService() as storage:
            result = await storage.upload_image_from_url(image_url)
            if 'error' not in result and result.get('url'):
                logger.info(f"[IMAGES] Uploaded: {image_url[:40]}...")
                return result['url'], True
            logger.warning(f"[IMAGES] Upload failed: {result.get('error')}")
            return image_url, False
    except Exception as e:
        logger.error(f"[IMAGES] Upload error: {e}")
        return image_url, False


# =============================================================================
# MAIN TOOL: SEARCH AND REPLACE IMAGE
# =============================================================================

def search_images(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry=None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Search for an image and replace an <img> tag in the CustomComponent HTML.

    This tool ONLY works with CustomComponents - it edits the HTML to replace image URLs.
    It does NOT create or modify Image components.

    Args:
        query: str - What to search for
        image_index: Optional[int] - Which image to replace (0-based). If provided, skips LLM selection.
        component_id: Optional[str] - CustomComponent to update (auto-detected if not provided)
        slide_id: Optional[str] - Target slide
    """
    query = args.get("query", "")
    component_id = args.get("component_id")
    slide_id = args.get("slide_id") or (current_slide.get("id") if current_slide else None)
    # image_index: Explicit index when user says "1st image", "2nd image", etc.
    image_index = args.get("image_index")
    # target_image: Description when user describes image by content ("the logo", "ingest image")
    # When provided, we use LLM to match this against image descriptions
    target_image = args.get("target_image")

    # CRITICAL DEBUG: Log full current_slide structure to diagnose issues
    logger.info(f"[IMAGES] === SEARCH_IMAGES START ===")
    logger.info(f"[IMAGES] Args: query='{query}', target_image='{target_image}', image_index={image_index}")

    if current_slide:
        logger.info(f"[IMAGES] current_slide keys: {list(current_slide.keys())}")
        logger.info(f"[IMAGES] current_slide.id: {current_slide.get('id')}")
        components = current_slide.get("components", [])
        logger.info(f"[IMAGES] current_slide has {len(components)} components:")
        for i, c in enumerate(components):
            comp_type = c.get("type") if isinstance(c, dict) else type(c).__name__
            comp_id = c.get("id") if isinstance(c, dict) else "N/A"
            has_render = "render" in (c.get("props", {}) if isinstance(c, dict) else {})
            logger.info(f"[IMAGES]   [{i}] type='{comp_type}', id='{comp_id}', has_render={has_render}")
    else:
        logger.warning("[IMAGES] current_slide is None or empty!")
        logger.warning(f"[IMAGES] current_slide value: {current_slide}")

    if not query:
        logger.warning("[IMAGES] No query")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Auto-detect CustomComponent - this is the ONLY component type we work with
    # All slides use CustomComponents with HTML containing <img> tags
    # Use case-insensitive matching to handle any casing variations
    if not component_id and current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict):
                comp_type = c.get("type", "")
                # Case-insensitive match for CustomComponent
                if comp_type.lower() == "customcomponent":
                    component_id = c.get("id")
                    logger.info(f"[IMAGES] Auto-detected CustomComponent: {component_id} (type='{comp_type}')")
                    break

    logger.info(f"[IMAGES] Final: query='{query}', component={component_id}, image_index={image_index}")

    # Get event loop
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Check if this is a company logo query - route to logo.dev first
    is_logo_query, company_name = _is_company_logo_query(query)
    new_url = None
    new_alt = query

    if is_logo_query and company_name and LOGODEV_AVAILABLE:
        logger.info(f"[IMAGES] Detected company logo query, trying logo.dev for '{company_name}'")
        new_url = loop.run_until_complete(_fetch_logo_from_logodev(company_name))
        if new_url:
            new_alt = f"{company_name} logo"
            logger.info(f"[IMAGES] Got logo from logo.dev: {new_url[:60]}...")

    # Fall back to SerpAPI if not a logo or logo.dev failed
    if not new_url:
        try:
            from services.serpapi_service import SerpAPIService
            serpapi = SerpAPIService()

            if not serpapi.is_available:
                logger.warning("[IMAGES] SERP API not available")
                return DeckDiff(DeckDiffBase(slides_to_update=[]))

            async def do_search():
                results = await serpapi.search_images(query=query, per_page=5, size="large")
                photos = results.get("photos", [])
                for p in photos:
                    url = p.get("original") or p.get("url")
                    if url and url.startswith("http") and "placeholder" not in url.lower():
                        return url, p.get("alt", query)
                return None, None

            new_url, new_alt = loop.run_until_complete(do_search())

            if not new_url:
                logger.warning("[IMAGES] No search results")
                return DeckDiff(DeckDiffBase(slides_to_update=[]))

            # Upload to Supabase
            new_url, _ = loop.run_until_complete(_upload_to_supabase(new_url))
            logger.info(f"[IMAGES] New image: {new_url[:60]}...")

        except Exception as e:
            logger.error(f"[IMAGES] Search error: {e}")
            return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # If no CustomComponent, check for standalone Image component
    image_component_id = None
    if not component_id and current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict):
                comp_type = c.get("type", "")
                # Case-insensitive match for Image component
                if comp_type.lower() == "image":
                    image_component_id = c.get("id")
                    logger.info(f"[IMAGES] Found standalone Image component: {image_component_id}")
                    break

    # Handle standalone Image component - just update props.src directly
    if image_component_id and not component_id:
        logger.info(f"[IMAGES] Updating standalone Image component {image_component_id} with new URL")
        return DeckDiff(DeckDiffBase(
            slides_to_update=[
                SlideDiffBase(
                    slide_id=slide_id,
                    components_to_update=[
                        ComponentDiffBase(
                            id=image_component_id,
                            props={"src": new_url}
                        )
                    ]
                )
            ]
        ))

    # Find and replace in component
    if not component_id:
        # Provide helpful error with what components ARE available
        if current_slide:
            available = [f"{c.get('type')}:{c.get('id')}" for c in current_slide.get("components", []) if isinstance(c, dict)]
            logger.warning(f"[IMAGES] No CustomComponent or Image component found. Available components: {available}")
        else:
            logger.warning("[IMAGES] No component to update - current_slide is empty")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Find target slide
    target_slide = current_slide
    if current_slide and current_slide.get("id") != slide_id:
        for s in deck_data.get("slides", []):
            if s.get("id") == slide_id:
                target_slide = s
                break

    if not target_slide:
        logger.warning("[IMAGES] Slide not found")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Find component
    target_component = None
    for c in target_slide.get("components", []):
        if c.get("id") == component_id:
            target_component = c
            break

    if not target_component:
        logger.warning("[IMAGES] Component not found")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    comp_type = target_component.get("type", "")
    logger.info(f"[IMAGES] Target component type: '{comp_type}'")

    # ONLY handle CustomComponent - we edit <img> tags in HTML
    # We do NOT support Image components - all slides use CustomComponents
    # Use case-insensitive matching for robustness
    if comp_type.lower() != "customcomponent":
        logger.warning(f"[IMAGES] Component {component_id} is type '{comp_type}', not CustomComponent. Skipping.")
        logger.warning(f"[IMAGES] This tool only works with CustomComponents that contain HTML with <img> tags.")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Handle CustomComponent - edit HTML to replace image URL
    # (We already validated this is a CustomComponent above via case-insensitive check)
    props = target_component.get("props", {})
    html = props.get("render", "")

    if not html:
        logger.warning("[IMAGES] CustomComponent has no 'render' HTML content")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Strip frontend scripts
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    html = strip_frontend_editing_scripts(html)

    # Extract all images
    images = _extract_all_images(props, html)

    if not images:
        logger.warning("[IMAGES] No images found in component HTML")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    logger.info(f"[IMAGES] Found {len(images)} images:")
    for img in images:
        logger.info(f"  [{img.index}] {img.description[:60]}")
        logger.info(f"       URL: {img.url[:80]}...")

    # Select which image to replace
    # PRIORITY ORDER:
    # 1. image_index (user said "1st image", "2nd image", etc.)
    # 2. target_image (user described image by content like "ingest image", "the logo")
    # 3. Fall back to LLM selection based on search query

    if image_index is not None:
        # Orchestrator specified exact index (e.g., user said "3rd image" -> index=2)
        selected_idx = image_index
        if selected_idx < 0 or selected_idx >= len(images):
            logger.warning(f"[IMAGES] image_index {selected_idx} out of range (0-{len(images)-1}), clamping")
            selected_idx = max(0, min(selected_idx, len(images) - 1))
        logger.info(f"[IMAGES] Using explicit image_index={selected_idx}")
    elif target_image:
        # User described which image by content - use LLM to match target_image to image descriptions
        logger.info(f"[IMAGES] Using target_image='{target_image}' to find matching image")
        try:
            # Use target_image as the selection query - it describes WHICH image to replace
            selected_idx = loop.run_until_complete(_select_image_with_llm(target_image, images))
            logger.info(f"[IMAGES] LLM matched target_image '{target_image}' to index={selected_idx}")
        except Exception as e:
            logger.warning(f"[IMAGES] LLM selection failed: {e}, defaulting to first image")
            selected_idx = 0
    else:
        # No explicit index or target - use LLM to select based on search query
        try:
            selected_idx = loop.run_until_complete(_select_image_with_llm(query, images))
            logger.info(f"[IMAGES] LLM selected index={selected_idx} based on query")
        except Exception as e:
            # SLIDE-BACKEND-28A: Handle LLM selection failures gracefully
            logger.warning(f"[IMAGES] LLM selection failed: {e}, defaulting to first image")
            selected_idx = 0

    old_url = images[selected_idx].url
    logger.info(f"[IMAGES] Replacing old_url: {old_url}")
    logger.info(f"[IMAGES] With new_url: {new_url}")

    # Verify old_url exists in HTML before attempting replace
    if old_url not in html:
        logger.error(f"[IMAGES] CRITICAL: old_url NOT found in HTML!")
        logger.error(f"[IMAGES] old_url length: {len(old_url)}")
        logger.error(f"[IMAGES] HTML length: {len(html)}")
        # Try to find similar URLs
        import difflib
        for img in images:
            if img.url in html:
                logger.info(f"[IMAGES] URL at index {img.index} IS in HTML: {img.url[:60]}...")
            else:
                logger.warning(f"[IMAGES] URL at index {img.index} NOT in HTML: {img.url[:60]}...")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Replace in HTML
    new_html = html.replace(old_url, new_url, 1)

    if new_html == html:
        logger.warning("[IMAGES] Replacement failed - URL not found in HTML (unexpected)")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    logger.info(f"[IMAGES] Replaced image [{selected_idx}]: {old_url[:40]}... -> {new_url[:40]}...")

    return DeckDiff(DeckDiffBase(
        slides_to_update=[
            SlideDiffBase(
                slide_id=slide_id,
                components_to_update=[
                    ComponentDiffBase(
                        id=component_id,
                        props={"render": new_html}
                    )
                ]
            )
        ]
    ))


# =============================================================================
# REPLACE IMAGE (specific URL)
# =============================================================================

def replace_image_from_search(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry=None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Replace an image URL in a CustomComponent with a specific new URL.

    This tool ONLY works with CustomComponents - it finds an image in the HTML
    and replaces its URL with the new one.

    Args:
        component_id: CustomComponent ID (required)
        image_url: New image URL to use
        old_url: URL to replace (optional - if not provided, uses image_index)
        image_index: Which image to replace (0-based, optional)
    """
    component_id = args.get("component_id")
    image_url = args.get("image_url")
    old_url = args.get("old_url")
    image_index = args.get("image_index", 0)
    slide_id = args.get("slide_id") or (current_slide.get("id") if current_slide else None)

    if not image_url:
        logger.warning("[REPLACE_IMAGE] Missing image_url")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Find CustomComponent - case-insensitive matching
    if not component_id and current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict) and c.get("type", "").lower() == "customcomponent":
                component_id = c.get("id")
                logger.info(f"[REPLACE_IMAGE] Auto-detected CustomComponent: {component_id}")
                break

    # If no CustomComponent, check for standalone Image component
    image_component_id = None
    if not component_id and current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict) and c.get("type", "").lower() == "image":
                image_component_id = c.get("id")
                logger.info(f"[REPLACE_IMAGE] Found standalone Image component: {image_component_id}")
                break

    # Upload to Supabase first (needed for both paths)
    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    image_url, _ = loop.run_until_complete(_upload_to_supabase(image_url))

    # Handle standalone Image component - just update props.src directly
    if image_component_id and not component_id:
        logger.info(f"[REPLACE_IMAGE] Updating standalone Image component {image_component_id}")
        return DeckDiff(DeckDiffBase(
            slides_to_update=[
                SlideDiffBase(
                    slide_id=slide_id,
                    components_to_update=[
                        ComponentDiffBase(
                            id=image_component_id,
                            props={"src": image_url}
                        )
                    ]
                )
            ]
        ))

    if not component_id:
        if current_slide:
            available = [f"{c.get('type')}:{c.get('id')}" for c in current_slide.get("components", []) if isinstance(c, dict)]
            logger.warning(f"[REPLACE_IMAGE] No CustomComponent or Image component found. Available: {available}")
        else:
            logger.warning("[REPLACE_IMAGE] No component found - current_slide is empty")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Find target component
    target_component = None
    for c in current_slide.get("components", []):
        if isinstance(c, dict) and c.get("id") == component_id:
            target_component = c
            break

    if not target_component:
        logger.warning(f"[REPLACE_IMAGE] Component {component_id} not found")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    comp_type = target_component.get("type", "")
    if comp_type.lower() != "customcomponent":
        logger.warning(f"[REPLACE_IMAGE] Component is type '{comp_type}', not CustomComponent. Skipping.")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    props = target_component.get("props", {})
    html = props.get("render", "")

    if not html:
        logger.warning("[REPLACE_IMAGE] No HTML in CustomComponent")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Find URL to replace
    if not old_url:
        # Extract images and use image_index
        images = _extract_all_images(props, html)
        if not images:
            logger.warning("[REPLACE_IMAGE] No images found in HTML")
            return DeckDiff(DeckDiffBase(slides_to_update=[]))
        idx = min(image_index, len(images) - 1)
        old_url = images[idx].url

    # Replace in HTML
    new_html = html.replace(old_url, image_url, 1)

    if new_html == html:
        logger.warning("[REPLACE_IMAGE] URL replacement failed - old_url not found in HTML")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    logger.info(f"[REPLACE_IMAGE] Replaced {old_url[:40]}... -> {image_url[:40]}...")

    return DeckDiff(DeckDiffBase(
        slides_to_update=[
            SlideDiffBase(
                slide_id=slide_id,
                components_to_update=[
                    ComponentDiffBase(
                        id=component_id,
                        props={"render": new_html}
                    )
                ]
            )
        ]
    ))


# =============================================================================
# EDIT IMAGE WITH AI (Gemini)
# =============================================================================

async def _download_image(url: str) -> Optional[bytes]:
    """Download image bytes."""
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
                if resp.status == 200:
                    return await resp.read()
        return None
    except Exception as e:
        logger.error(f"[EDIT_IMAGE] Download error: {e}")
        return None


def edit_image_with_ai(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry=None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Edit an image using Gemini AI.

    Args:
        instruction: What to do (e.g., "make it blue", "remove background")
        image_index: Which image to edit (0-based)
    """
    instruction = args.get("instruction", "")
    image_index = args.get("image_index", 0)
    slide_id = args.get("slide_id") or (current_slide.get("id") if current_slide else None)

    if not instruction:
        logger.warning("[EDIT_IMAGE] No instruction")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    logger.info(f"[EDIT_IMAGE] Instruction: '{instruction}', index: {image_index}")

    # Find CustomComponent - case-insensitive matching
    # All slides use CustomComponents with HTML containing <img> tags
    component_id = None
    if current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict) and c.get("type", "").lower() == "customcomponent":
                component_id = c.get("id")
                logger.info(f"[EDIT_IMAGE] Auto-detected CustomComponent: {component_id}")
                break

    # If no CustomComponent, check for standalone Image component
    image_component_id = None
    if not component_id and current_slide:
        for c in current_slide.get("components", []):
            if isinstance(c, dict) and c.get("type", "").lower() == "image":
                image_component_id = c.get("id")
                logger.info(f"[EDIT_IMAGE] Found standalone Image component: {image_component_id}")
                break

    if not component_id and not image_component_id:
        if current_slide:
            available = [f"{c.get('type')}:{c.get('id')}" for c in current_slide.get("components", []) if isinstance(c, dict)]
            logger.warning(f"[EDIT_IMAGE] No CustomComponent or Image component found. Available: {available}")
        else:
            logger.warning("[EDIT_IMAGE] No component found - current_slide is empty")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    try:
        loop = asyncio.get_event_loop()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

    # Handle standalone Image component
    if image_component_id and not component_id:
        # Find the Image component
        image_component = None
        for c in current_slide.get("components", []):
            if isinstance(c, dict) and c.get("id") == image_component_id:
                image_component = c
                break

        if not image_component:
            logger.warning(f"[EDIT_IMAGE] Image component {image_component_id} not found")
            return DeckDiff(DeckDiffBase(slides_to_update=[]))

        old_url = image_component.get("props", {}).get("src", "")
        if not old_url:
            logger.warning("[EDIT_IMAGE] Image component has no src")
            return DeckDiff(DeckDiffBase(slides_to_update=[]))

        # Download, edit, upload
        async def process_image():
            from services.gemini_image_service import GeminiImageService
            from services.image_storage_service import ImageStorageService

            gemini = GeminiImageService()
            if not gemini.is_available:
                logger.error("[EDIT_IMAGE] Gemini not available")
                return None

            img_bytes = await _download_image(old_url)
            if not img_bytes:
                return None

            result = await gemini.edit_image(instruction, img_bytes)
            if "error" in result:
                logger.error(f"[EDIT_IMAGE] Gemini error: {result['error']}")
                return None

            b64_data = result.get("b64_json")
            if not b64_data:
                return None

            async with ImageStorageService() as storage:
                import uuid
                filename = f"ai-edit-{uuid.uuid4().hex[:8]}.png"
                upload = await storage.upload_image_from_base64(b64_data, filename, "image/png")
                if "error" in upload:
                    return None
                return upload.get("url")

        new_url = loop.run_until_complete(process_image())
        if not new_url:
            return DeckDiff(DeckDiffBase(slides_to_update=[]))

        logger.info(f"[EDIT_IMAGE] Image component success: {old_url[:40]}... -> {new_url[:40]}...")

        return DeckDiff(DeckDiffBase(
            slides_to_update=[
                SlideDiffBase(
                    slide_id=slide_id,
                    components_to_update=[
                        ComponentDiffBase(id=image_component_id, props={"src": new_url})
                    ]
                )
            ]
        ))

    # Handle CustomComponent
    target_component = None
    for c in current_slide.get("components", []):
        if isinstance(c, dict) and c.get("id") == component_id:
            target_component = c
            break

    if not target_component:
        logger.warning(f"[EDIT_IMAGE] Component {component_id} not found in slide")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    comp_type = target_component.get("type", "")
    props = target_component.get("props", {})

    # Verify this is a CustomComponent - case-insensitive
    if comp_type.lower() != "customcomponent":
        logger.warning(f"[EDIT_IMAGE] Component is type '{comp_type}', not CustomComponent. Skipping.")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Get image URL from CustomComponent HTML
    html = props.get("render", "")
    images = _extract_all_images(props, html)
    if not images:
        logger.warning("[EDIT_IMAGE] No images found in CustomComponent HTML")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))
    idx = min(image_index, len(images) - 1)
    old_url = images[idx].url

    if not old_url:
        logger.warning("[EDIT_IMAGE] No URL found for selected image")
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    # Download, edit, upload
    async def process():
        from services.gemini_image_service import GeminiImageService
        from services.image_storage_service import ImageStorageService

        gemini = GeminiImageService()
        if not gemini.is_available:
            logger.error("[EDIT_IMAGE] Gemini not available")
            return None

        img_bytes = await _download_image(old_url)
        if not img_bytes:
            return None

        result = await gemini.edit_image(instruction, img_bytes)
        if "error" in result:
            logger.error(f"[EDIT_IMAGE] Gemini error: {result['error']}")
            return None

        b64_data = result.get("b64_json")
        if not b64_data:
            return None

        async with ImageStorageService() as storage:
            import uuid
            filename = f"ai-edit-{uuid.uuid4().hex[:8]}.png"
            upload = await storage.upload_image_from_base64(b64_data, filename, "image/png")
            if "error" in upload:
                return None
            return upload.get("url")

    new_url = loop.run_until_complete(process())
    if not new_url:
        return DeckDiff(DeckDiffBase(slides_to_update=[]))

    logger.info(f"[EDIT_IMAGE] Success: {old_url[:40]}... -> {new_url[:40]}...")

    # Replace image URL in CustomComponent HTML
    new_html = html.replace(old_url, new_url, 1)
    return DeckDiff(DeckDiffBase(
        slides_to_update=[
            SlideDiffBase(
                slide_id=slide_id,
                components_to_update=[
                    ComponentDiffBase(id=component_id, props={"render": new_html})
                ]
            )
        ]
    ))


# =============================================================================
# VALIDATE IMAGE
# =============================================================================

class ValidateImageArgs(ToolModel):
    tool_name: Literal["validate_image"] = Field(description="Validate image URL")
    image_url: str = Field(description="URL to validate")


def validate_image(edit_args: ValidateImageArgs, **kwargs):
    return image_exists(edit_args.image_url)
