"""
CustomComponent Media Injection Tool

Acquires images (logos, AI-generated, stock) and injects them into CustomComponent HTML.
Unlike add_logos/insert_image which create separate Image components, this tool
modifies the CustomComponent HTML directly with <img> tags.
"""

import asyncio
import os
import logging
from typing import List, Dict, Any, Optional, Literal
from pydantic import Field, BaseModel

from models.tools import ToolModel
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase

from utils.deck import find_component_by_id
from agents.editing.core import get_attr, to_dict

logger = logging.getLogger(__name__)


# =============================================================================
# IMAGE ACQUISITION FUNCTIONS (return URLs, don't create components)
# =============================================================================

async def acquire_logo(brand_name: str) -> Optional[str]:
    """
    Search for a brand logo and return the URL.
    Uses Brandfetch cache → Logo.dev fallback.
    """
    from services.simple_brandfetch_cache import SimpleBrandfetchCache
    from agents.tools.theme.logodev_service import LogoDevService
    from services.database_config import get_database_connection_string

    db_url = get_database_connection_string()
    if not db_url:
        logger.error("Database URL not configured for logo search")
        return None

    try:
        async with SimpleBrandfetchCache(db_url) as cache:
            brand_data = await cache.get_brand_data(brand_name)

            if not brand_data.get('error'):
                # Get best logo (prefer dark theme for visibility)
                logo_url = cache.get_best_logo(brand_data, prefer_theme="dark")
                if logo_url:
                    logger.info(f"✅ Logo found for {brand_name}: {logo_url[:60]}...")
                    return logo_url

            # Fallback to Logo.dev
            async with LogoDevService() as logodev:
                fallback = await logodev.get_logo_with_fallback(brand_name)
                if fallback and fallback.get('available') and fallback.get('logo_url'):
                    logger.info(f"✅ Logo.dev fallback for {brand_name}")
                    return fallback.get('logo_url')

    except Exception as e:
        logger.error(f"Logo acquisition failed for {brand_name}: {e}")

    return None


async def acquire_generated_image(prompt: str, style_hint: str = "") -> Optional[str]:
    """
    Generate an AI image and return the uploaded Supabase URL.
    """
    from agents.config import IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_SUPPORTING
    from services.gemini_image_service import GeminiImageService
    from services.openai_image_service import OpenAIImageService
    from services.image_storage_service import ImageStorageService

    try:
        # Select provider
        service = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()

        # Build full prompt with style
        full_prompt = f"{prompt}. {style_hint}" if style_hint else prompt
        full_prompt += ". No text or lettering in the image. High quality, professional."

        # Generate
        result = await service.generate_image(
            prompt=full_prompt,
            size="1536x1024",
            transparent_background=IMAGE_TRANSPARENT_DEFAULT_SUPPORTING
        )

        if not isinstance(result, dict) or 'error' in result:
            logger.error(f"Image generation failed: {result}")
            return None

        b64 = result.get('b64_json')
        if not b64:
            return None

        # Upload to Supabase
        async with ImageStorageService() as storage:
            upload = await storage.upload_image_from_base64(
                b64,
                filename="generated-for-component.png",
                content_type="image/png"
            )
            if isinstance(upload, dict) and upload.get('url'):
                logger.info(f"✅ Generated image uploaded: {upload['url'][:60]}...")
                return upload.get('url')

    except Exception as e:
        logger.error(f"Image generation failed: {e}")

    return None


async def acquire_stock_image(query: str) -> Optional[str]:
    """
    Search for a stock image and return the uploaded Supabase URL.
    Uses SerpAPI for search, uploads to our storage for reliability.
    """
    from services.serpapi_service import SerpAPIService
    from services.image_storage_service import ImageStorageService

    try:
        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("SerpAPI not available")
            return None

        result = await serpapi.search_images(
            query=f"{query} high quality",
            per_page=5,
            size="large"
        )

        photos = result.get('photos', [])
        if not photos:
            return None

        # Try each result until one uploads successfully
        async with ImageStorageService() as storage:
            for photo in photos:
                url = photo.get('original') or photo.get('url') or photo.get('src', {}).get('original')
                if not url or url.startswith('data:'):
                    continue

                try:
                    upload_result = await storage.upload_image_from_url(url)
                    if 'error' not in upload_result and upload_result.get('url'):
                        logger.info(f"✅ Stock image uploaded: {upload_result['url'][:60]}...")
                        return upload_result['url']
                except Exception:
                    continue

    except Exception as e:
        logger.error(f"Stock image search failed: {e}")

    return None


# =============================================================================
# TOOL DEFINITION
# =============================================================================

class CustomComponentAddMediaArgs(ToolModel):
    """
    Add images to a CustomComponent by injecting <img> tags into its HTML.

    This tool:
    1. Acquires images (logos, AI-generated, or stock photos)
    2. Uses AI to intelligently inject them into the CustomComponent HTML
    3. Positions them appropriately based on the existing layout

    Use this instead of add_logos/insert_image when the slide is a CustomComponent.
    """
    tool_name: Literal["custom_component_add_media"] = Field(
        description="Add images (logos, generated, stock) to a CustomComponent by injecting into its HTML"
    )
    component_id: str = Field(description="The ID of the CustomComponent to modify")
    slide_id: str = Field(description="The ID of the slide containing the component")
    media_requests: List[Dict[str, str]] = Field(
        description="""List of media items to add. Each item should have:
        - type: "logo", "generated", or "stock"
        - query: Brand name for logos, prompt for generated, search query for stock
        - placement: Optional hint like "top-right", "hero-section", "footer", "alongside-title"
        Example: [{"type": "logo", "query": "Apple"}, {"type": "generated", "query": "futuristic city skyline", "placement": "hero-section"}]"""
    )


def custom_component_add_media(
    args: CustomComponentAddMediaArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Add media to a CustomComponent by acquiring images and injecting into HTML.
    """
    return asyncio.run(_add_media_async(args, registry, deck_data, deck_diff))


async def _add_media_async(
    args: CustomComponentAddMediaArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Async implementation of media addition.
    """
    # Find the component
    component_info = find_component_by_id(deck_data, args.component_id)
    if not component_info:
        raise ValueError(f"Component {args.component_id} not found")

    component = component_info.get('component', {})
    if component.get('type') != 'CustomComponent':
        raise ValueError(f"Component {args.component_id} is not a CustomComponent")

    # Get current HTML
    props = component.get('props', {}) or {}
    current_html = props.get('render', '')
    width = props.get('width', 1760)
    height = props.get('height', 800)

    if not current_html:
        raise ValueError(f"CustomComponent {args.component_id} has no HTML content")

    # Acquire all requested images in parallel
    acquired_media = []

    async def acquire_single(request: Dict[str, str]) -> Dict[str, Any]:
        media_type = request.get('type', 'stock')
        query = request.get('query', '')
        placement = request.get('placement', '')

        url = None
        if media_type == 'logo':
            url = await acquire_logo(query)
        elif media_type == 'generated':
            url = await acquire_generated_image(query)
        elif media_type == 'stock':
            url = await acquire_stock_image(query)

        return {
            'type': media_type,
            'query': query,
            'placement': placement,
            'url': url,
            'success': url is not None
        }

    # Run acquisitions in parallel
    tasks = [acquire_single(req) for req in args.media_requests]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, dict) and result.get('success'):
            acquired_media.append(result)
        elif isinstance(result, Exception):
            logger.error(f"Media acquisition error: {result}")

    if not acquired_media:
        logger.warning("No media was successfully acquired")
        return deck_diff

    logger.info(f"✅ Acquired {len(acquired_media)} media items")

    # Build media context for AI injection
    media_context = "\n".join([
        f"- {m['type'].upper()}: {m['query']} → {m['url']} (placement hint: {m['placement'] or 'auto'})"
        for m in acquired_media
    ])

    # Use Gemini to inject images into HTML
    try:
        from google import genai
        from google.genai import types
        import json as json_module

        gemini_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not gemini_key:
            raise ValueError("GOOGLE_API_KEY not set")

        gemini_client = genai.Client(api_key=gemini_key)

        # Get theme colors for styling
        deck_dict = to_dict(deck_data)
        theme = deck_dict.get('theme', {}) or {}
        colors = theme.get('color_palette', {}) or {}

        prompt = f"""Modify this CustomComponent HTML to add the following images.

CURRENT HTML:
{current_html}

IMAGES TO ADD:
{media_context}

REQUIREMENTS:
1. Add <img> tags for each image URL provided
2. Position them according to the placement hints (or intelligently if no hint)
3. Style the images appropriately:
   - For logos: reasonable size (80-150px), object-fit: contain
   - For hero images: larger, can be background or prominent
   - For stock photos: integrate naturally into the layout
4. Maintain the existing layout and content
5. Use Tailwind classes for styling (rounded-lg, shadow-lg, etc.)
6. Keep background transparent
7. Output a complete HTML document starting with <!DOCTYPE html>

IMAGE TAG PATTERN:
<img src='IMAGE_URL' alt='description' class='w-32 h-32 object-contain' />

Return the modified HTML."""

        from agents.config import CUSTOM_COMPONENT_EDIT_MODEL
        response_raw = gemini_client.models.generate_content(
            model=CUSTOM_COMPONENT_EDIT_MODEL,
            contents=[prompt],
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
                response_schema={
                    "type": "object",
                    "properties": {
                        "html": {"type": "string", "description": "The modified HTML with images injected"},
                        "images_added": {"type": "integer", "description": "Number of images added"}
                    },
                    "required": ["html", "images_added"]
                }
            )
        )

        response_data = json_module.loads(response_raw.text)
        new_html = response_data.get('html', '')
        images_added = response_data.get('images_added', 0)

        if not new_html:
            raise ValueError("Gemini returned empty HTML")

        # Validate HTML
        if not new_html.lower().strip().startswith('<!doctype'):
            if '<html' in new_html.lower():
                new_html = '<!DOCTYPE html>' + new_html
            else:
                raise ValueError("Invalid HTML returned")

        logger.info(f"✅ Injected {images_added} images into CustomComponent")

        # Update the component
        component_diff_model = registry.get_component_diff_model('CustomComponent')
        component_diff = component_diff_model(
            id=args.component_id,
            type='CustomComponent',
            props={"render": new_html}
        )

        deck_diff.update_component(args.slide_id, args.component_id, component_diff)

    except ImportError:
        logger.error("google.genai not available for HTML injection")
        raise
    except Exception as e:
        logger.error(f"HTML injection failed: {e}")
        raise

    return deck_diff


# =============================================================================
# SIMPLIFIED SINGLE-IMAGE TOOL (for quick additions)
# =============================================================================

class CustomComponentAddLogoArgs(ToolModel):
    """
    Quick tool to add a single logo to a CustomComponent.
    Simpler than custom_component_add_media for single logo requests.
    """
    tool_name: Literal["custom_component_add_logo"] = Field(
        description="Add a brand logo to a CustomComponent's HTML"
    )
    component_id: str = Field(description="The ID of the CustomComponent")
    slide_id: str = Field(description="The ID of the slide")
    brand_name: str = Field(description="Brand name to search for (e.g., 'Apple', 'nike.com', 'Spotify')")
    placement: Optional[str] = Field(
        default="auto",
        description="Where to place the logo: 'auto', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'header', 'footer'"
    )


def custom_component_add_logo(
    args: CustomComponentAddLogoArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Add a single logo to a CustomComponent.
    """
    # Delegate to the main media tool
    media_args = CustomComponentAddMediaArgs(
        tool_name="custom_component_add_media",
        component_id=args.component_id,
        slide_id=args.slide_id,
        media_requests=[{
            "type": "logo",
            "query": args.brand_name,
            "placement": args.placement or "auto"
        }]
    )
    return custom_component_add_media(media_args, registry, deck_data, deck_diff)
