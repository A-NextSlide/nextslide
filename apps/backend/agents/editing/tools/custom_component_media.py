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
    Add images to a CustomComponent by injecting them into its HTML.

    This tool is FLEXIBLE - it can:
    1. Use user-uploaded images directly (type="uploaded")
    2. Analyze uploaded images and incorporate them intelligently (type="analyze")
    3. Search for logos (type="logo")
    4. Generate AI images (type="generated")
    5. Find stock photos (type="stock")

    The AI injection understands context and will position/style images appropriately.
    """
    tool_name: Literal["custom_component_add_media"] = Field(
        description="Flexibly add images to a CustomComponent. Can use uploaded files, analyze images, search logos, generate AI images, or find stock photos."
    )
    component_id: str = Field(description="The ID of the CustomComponent to modify")
    slide_id: str = Field(description="The ID of the slide containing the component")
    media_requests: List[Dict[str, str]] = Field(
        description="""List of media items to add. Each item should have:
        - type: One of:
          * "uploaded" - Use user's uploaded file directly as an image
          * "analyze" - Analyze the uploaded file and decide how to incorporate it (extract data, match style, etc.)
          * "logo" - Search for a brand logo
          * "generated" - Generate an AI image from a prompt
          * "stock" - Search for a stock photo
        - query: Context for the media:
          * For uploaded/analyze: filename or what to do with it (e.g., "user's logo", "analyze and recreate as chart")
          * For logo: brand name (e.g., "Apple", "Nike")
          * For generated: image description (e.g., "futuristic city skyline")
          * For stock: search terms (e.g., "team collaboration")
        - placement: Where to put it (e.g., "top-left", "hero-section", "replace-title", "background", "alongside-content")
        - intent: Optional - describe what you want to achieve (e.g., "replace the title text with this logo", "add as a decorative element")

        Examples:
        - [{"type": "uploaded", "query": "logo.png", "placement": "top-left", "intent": "use as brand logo"}]
        - [{"type": "analyze", "query": "chart screenshot", "intent": "recreate this chart with our data"}]
        - [{"type": "logo", "query": "Stripe", "placement": "footer"}]"""
    )


def custom_component_add_media(
    args: CustomComponentAddMediaArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    attachments: Optional[List[Dict[str, Any]]] = None
) -> DeckDiff:
    """
    Add media to a CustomComponent by acquiring images and injecting into HTML.

    Supports user-uploaded attachments via type="uploaded" in media_requests.
    When attachments are provided, they take priority over searching/generating.
    """
    return asyncio.run(_add_media_async(args, registry, deck_data, deck_diff, attachments))


async def _add_media_async(
    args: CustomComponentAddMediaArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff,
    attachments: Optional[List[Dict[str, Any]]] = None
) -> DeckDiff:
    """
    Async implementation of media addition.

    Supports user-uploaded attachments via type="uploaded".
    """
    from services.image_storage_service import ImageStorageService

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

    # Build a map of user-uploaded attachments for quick lookup
    attachment_map: Dict[str, str] = {}
    if attachments:
        for i, att in enumerate(attachments):
            url = att.get('url') or att.get('publicUrl')
            name = att.get('name') or att.get('fileName') or f'attachment_{i}'
            if url:
                attachment_map[name.lower()] = url
                # Also map by index for easy access
                attachment_map[f'attachment_{i}'] = url
                attachment_map[str(i)] = url
        logger.info(f"[CUSTOM_COMPONENT_MEDIA] Available user attachments: {list(attachment_map.keys())}")

    # Acquire all requested images in parallel
    acquired_media = []

    async def acquire_single(request: Dict[str, str]) -> Dict[str, Any]:
        media_type = request.get('type', 'stock')
        query = request.get('query', '')
        placement = request.get('placement', '')
        intent = request.get('intent', '')  # What the user wants to achieve

        url = None
        analysis_context = None  # For "analyze" type - contains extracted info

        if media_type in ('uploaded', 'analyze'):
            # Use user-uploaded attachment
            # Try to match by query (filename) or use first available
            query_lower = query.lower() if query else ''

            # Try exact match first
            if query_lower in attachment_map:
                url = attachment_map[query_lower]
            else:
                # Try partial match
                for name, att_url in attachment_map.items():
                    if query_lower in name or name in query_lower:
                        url = att_url
                        break

            # If still no match, use first attachment
            if not url and attachments:
                first_att = attachments[0]
                url = first_att.get('url') or first_att.get('publicUrl')

            if url:
                # Re-upload to our storage to ensure persistence and consistent URL format
                try:
                    async with ImageStorageService() as storage:
                        upload_result = await storage.upload_image_from_url(url)
                        if 'error' not in upload_result and upload_result.get('url'):
                            url = upload_result['url']
                            logger.info(f"✅ User attachment uploaded: {url[:60]}...")
                except Exception as e:
                    logger.warning(f"Failed to re-upload user attachment, using original URL: {e}")
                    # Keep original URL if re-upload fails

                # For "analyze" type, we pass extra context to the AI injection
                if media_type == 'analyze':
                    analysis_context = f"ANALYZE this image and {intent or query}. Extract relevant information and incorporate appropriately."
            else:
                logger.warning(f"No user attachment found matching '{query}'")

        elif media_type == 'logo':
            url = await acquire_logo(query)
        elif media_type == 'generated':
            url = await acquire_generated_image(query)
        elif media_type == 'stock':
            url = await acquire_stock_image(query)

        return {
            'type': media_type,
            'query': query,
            'placement': placement,
            'intent': intent,
            'url': url,
            'analysis_context': analysis_context,
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

    # Build rich media context for AI injection - include intent and analysis instructions
    media_lines = []
    for m in acquired_media:
        line = f"- {m['type'].upper()}: {m['url']}"
        if m.get('placement'):
            line += f" | Placement: {m['placement']}"
        if m.get('intent'):
            line += f" | Intent: {m['intent']}"
        if m.get('analysis_context'):
            line += f" | {m['analysis_context']}"
        if m.get('query'):
            line += f" | Query: {m['query']}"
        media_lines.append(line)
    media_context = "\n".join(media_lines)

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

        prompt = f"""Modify this CustomComponent HTML to incorporate the following media.

CURRENT HTML:
{current_html}

MEDIA TO INCORPORATE:
{media_context}

**UNDERSTAND THE INTENT:**
Read each media item's intent/query carefully. The user may want to:
- Simply ADD an image at a location
- REPLACE existing content (like a title) with an image
- Use the image as a BACKGROUND or decorative element
- ANALYZE the image and extract information to display

**FLEXIBLE PLACEMENT OPTIONS:**
- "top-left", "top-right", "bottom-left", "bottom-right" → Position in that corner
- "hero-section", "header", "footer" → Add to that semantic area
- "replace-title", "replace-content" → Remove text and put image in its place
- "background" → Make it a background image
- "alongside-content" → Place next to existing content
- "auto" → Use your judgment based on the design

**STYLING GUIDELINES:**
- For logos: reasonable size (80-150px width), object-fit: contain, appropriate padding
- For photos: integrate naturally, use rounded corners and shadows as appropriate
- For replacements: match the size/position of what's being replaced
- Match the existing design aesthetic

**REQUIREMENTS:**
1. Execute the user's intent for each media item
2. Maintain the overall layout coherence
3. Use Tailwind classes for styling
4. Keep background transparent (unless background image requested)
5. Output a complete HTML document starting with <!DOCTYPE html>

IMAGE TAG PATTERN:
<img src='IMAGE_URL' alt='description' class='...' />

Return the modified HTML that fulfills the user's intent."""

        from agents.config import GEMINI_FLASH
        response_raw = gemini_client.models.generate_content(
            model=GEMINI_FLASH,
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
