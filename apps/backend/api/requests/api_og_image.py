"""
API endpoint for serving OG (Open Graph) images for shared decks.
Applies NextSlide branding watermark to slide thumbnails.
"""
import json as json_module
import logging
import io
import re
import httpx
import html
from pathlib import Path
from typing import Optional

from fastapi import APIRouter, HTTPException, Response, Request
from fastapi.responses import RedirectResponse, JSONResponse
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont

from utils.supabase import get_supabase_client
from fastapi.responses import HTMLResponse

logger = logging.getLogger(__name__)

# Base URL for the frontend (used in OG tags)
# These can be overridden via environment variables
import os
FRONTEND_BASE_URL = os.getenv("FRONTEND_URL", "https://nextslide.ai")
API_BASE_URL = os.getenv("API_URL", "https://api.nextslide.ai")

router = APIRouter(prefix="/api/public", tags=["og-image"])

# Separate router for share routes (no prefix - these go at root level)
share_router = APIRouter(tags=["share-routes"])

# Bot detection patterns - includes messaging app crawlers
BOT_PATTERNS = [
    'bot', 'crawl', 'spider', 'facebook', 'twitter', 'linkedin',
    'slack', 'discord', 'whatsapp', 'telegram', 'preview', 'fetch',
    'applebot', 'facebookexternalhit', 'twitterbot', 'linkedinbot',
    'slackbot', 'discordbot', 'telegrambot', 'whatsapp', 'pinterest',
    'redditbot', 'embedly', 'quora', 'outbrain', 'vkshare', 'skype',
    'viber', 'tumblr', 'bitly', 'flipboard', 'nuzzel', 'pocket',
]


def is_bot_request(user_agent: str) -> bool:
    """Check if the request is from a bot/crawler."""
    ua_lower = user_agent.lower()
    return any(pattern in ua_lower for pattern in BOT_PATTERNS)

# OG Image dimensions
OG_WIDTH = 1200
OG_HEIGHT = 630

# Brand colors
BRAND_ORANGE = (255, 67, 1)  # #FF4301
BRAND_DARK = (56, 54, 54)    # #383636

# Cache for the logo image
_logo_cache: Optional[Image.Image] = None


def get_brand_logo() -> Optional[Image.Image]:
    """Load and cache the NextSlide X logo."""
    global _logo_cache

    if _logo_cache is not None:
        return _logo_cache

    # Try to load from assets directory
    assets_dir = Path(__file__).resolve().parent.parent.parent / "assets"
    logo_path = assets_dir / "nextslide-x.png"

    if logo_path.exists():
        try:
            _logo_cache = Image.open(logo_path).convert("RGBA")
            return _logo_cache
        except Exception as e:
            logger.warning(f"Failed to load logo from {logo_path}: {e}")

    # Fallback: Create a simple X logo programmatically
    try:
        size = 64
        logo = Image.new("RGBA", (size, size), (0, 0, 0, 0))
        draw = ImageDraw.Draw(logo)

        # Draw X shape
        stroke_width = 8
        padding = 8
        draw.line(
            [(padding, padding), (size - padding, size - padding)],
            fill=BRAND_ORANGE,
            width=stroke_width
        )
        draw.line(
            [(size - padding, padding), (padding, size - padding)],
            fill=BRAND_ORANGE,
            width=stroke_width
        )

        _logo_cache = logo
        return _logo_cache
    except Exception as e:
        logger.error(f"Failed to create fallback logo: {e}")
        return None


def create_brand_watermark(width: int = 200, height: int = 60) -> Image.Image:
    """
    Create the NextSlide brand watermark: NE + X + TSLIDE
    This mimics the BrandWordmark component styling.
    """
    watermark = Image.new("RGBA", (width, height), (0, 0, 0, 0))
    draw = ImageDraw.Draw(watermark)

    # Try to load a font, fall back to default
    try:
        # Try common system fonts
        font_size = 24
        font = None
        font_paths = [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
            "/System/Library/Fonts/Helvetica.ttc",
            "/Library/Fonts/Arial Bold.ttf",
            "C:\\Windows\\Fonts\\arialbd.ttf",
        ]
        for path in font_paths:
            if Path(path).exists():
                font = ImageFont.truetype(path, font_size)
                break

        if font is None:
            font = ImageFont.load_default()
            font_size = 12
    except Exception:
        font = ImageFont.load_default()
        font_size = 12

    # Calculate positions
    text_y = (height - font_size) // 2

    # Draw "NE" text
    draw.text((0, text_y), "NE", fill=BRAND_DARK, font=font)

    # Get logo and draw it
    logo = get_brand_logo()
    if logo:
        # Scale logo to fit
        logo_height = int(font_size * 1.5)
        logo_width = int(logo_height * (logo.width / logo.height))
        scaled_logo = logo.resize((logo_width, logo_height), Image.Resampling.LANCZOS)

        # Position after "NE"
        ne_width = draw.textlength("NE", font=font) if hasattr(draw, 'textlength') else font_size * 2
        logo_x = int(ne_width) + 2
        logo_y = (height - logo_height) // 2

        watermark.paste(scaled_logo, (logo_x, logo_y), scaled_logo)

        # Draw "TSLIDE" after logo
        text_x = logo_x + logo_width + 2
        draw.text((text_x, text_y), "TSLIDE", fill=BRAND_DARK, font=font)
    else:
        # Fallback without logo
        draw.text((0, text_y), "NEXTSLIDE", fill=BRAND_DARK, font=font)

    return watermark


async def fetch_image_from_url(url: str) -> Optional[Image.Image]:
    """Fetch an image from a URL and return as PIL Image."""
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url)
            response.raise_for_status()

            image_data = io.BytesIO(response.content)
            return Image.open(image_data).convert("RGB")
    except Exception as e:
        logger.error(f"Failed to fetch image from {url}: {e}")
        return None


def apply_watermark(
    base_image: Image.Image,
    watermark: Image.Image,
    position: str = "bottom-right",
    margin: int = 20,
    opacity: float = 0.9
) -> Image.Image:
    """Apply a watermark to the base image at the specified position."""
    # Convert to RGBA for compositing
    result = base_image.convert("RGBA")

    # Adjust watermark opacity
    if opacity < 1.0:
        watermark = watermark.copy()
        alpha = watermark.split()[3]
        alpha = alpha.point(lambda x: int(x * opacity))
        watermark.putalpha(alpha)

    # Calculate position
    if position == "bottom-right":
        x = result.width - watermark.width - margin
        y = result.height - watermark.height - margin
    elif position == "bottom-left":
        x = margin
        y = result.height - watermark.height - margin
    elif position == "top-right":
        x = result.width - watermark.width - margin
        y = margin
    elif position == "top-left":
        x = margin
        y = margin
    else:  # center
        x = (result.width - watermark.width) // 2
        y = (result.height - watermark.height) // 2

    # Paste watermark
    result.paste(watermark, (x, y), watermark)

    return result.convert("RGB")


def get_font(size: int) -> ImageFont.FreeTypeFont:
    """Get a font, trying multiple system paths."""
    font_paths = [
        "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
        "/usr/share/fonts/TTF/DejaVuSans-Bold.ttf",
        "/usr/share/fonts/dejavu/DejaVuSans-Bold.ttf",
        "/System/Library/Fonts/Helvetica.ttc",  # macOS
        "/usr/share/fonts/truetype/freefont/FreeSansBold.ttf",
    ]

    for path in font_paths:
        try:
            return ImageFont.truetype(path, size)
        except Exception:
            continue

    # Last resort: use default but warn
    logger.warning("No system fonts found, using Pillow default (will be small)")
    return ImageFont.load_default()


def create_fallback_og_image(title: str = "NextSlide Presentation") -> Image.Image:
    """Create a fallback OG image when no thumbnail is available."""
    # Dark gradient background for better visual appeal
    image = Image.new("RGB", (OG_WIDTH, OG_HEIGHT), (30, 30, 35))
    draw = ImageDraw.Draw(image)

    # Draw gradient from dark to slightly lighter
    for y in range(OG_HEIGHT):
        progress = y / OG_HEIGHT
        r = int(30 + progress * 15)
        g = int(30 + progress * 15)
        b = int(35 + progress * 20)
        draw.line([(0, y), (OG_WIDTH, y)], fill=(r, g, b))

    # Add a subtle accent line at top
    draw.rectangle([(0, 0), (OG_WIDTH, 4)], fill=BRAND_ORANGE)

    # Get fonts
    title_font = get_font(52)
    subtitle_font = get_font(24)

    # Draw title (white text on dark background)
    title_color = (255, 255, 255)

    # Truncate title if too long
    display_title = title[:45] + "..." if len(title) > 45 else title

    # Center the title
    if hasattr(draw, 'textbbox'):
        bbox = draw.textbbox((0, 0), display_title, font=title_font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]
    else:
        text_width = len(display_title) * 26
        text_height = 52

    x = (OG_WIDTH - text_width) // 2
    y = (OG_HEIGHT - text_height) // 2 - 30

    draw.text((x, y), display_title, fill=title_color, font=title_font)

    # Add subtitle
    subtitle = "Shared via NextSlide"
    if hasattr(draw, 'textbbox'):
        sub_bbox = draw.textbbox((0, 0), subtitle, font=subtitle_font)
        sub_width = sub_bbox[2] - sub_bbox[0]
    else:
        sub_width = len(subtitle) * 12

    draw.text(
        ((OG_WIDTH - sub_width) // 2, y + text_height + 20),
        subtitle,
        fill=(180, 180, 180),
        font=subtitle_font
    )

    # Add branding watermark
    watermark = create_brand_watermark(200, 45)
    image = apply_watermark(image, watermark, "bottom-right", margin=30, opacity=0.9)

    return image


def resize_cover(image: Image.Image, target_width: int, target_height: int) -> Image.Image:
    """Resize image to cover target dimensions (center-crop, no white bars or distortion)."""
    src_w, src_h = image.size
    scale = max(target_width / src_w, target_height / src_h)
    new_w = round(src_w * scale)
    new_h = round(src_h * scale)
    resized = image.resize((new_w, new_h), Image.Resampling.LANCZOS)
    left = (new_w - target_width) // 2
    top = (new_h - target_height) // 2
    return resized.crop((left, top, left + target_width, top + target_height))


def extract_first_slide_image(deck_data: dict) -> Optional[str]:
    """
    Extract the first usable image URL from the first slide of a deck.

    Looks for:
    1. Background image on the first slide
    2. Image components in the first slide
    3. CustomComponent backgroundImageUrl prop
    4. Image URLs embedded in CustomComponent HTML
    """
    slides = deck_data.get('slides', [])
    if not slides:
        return None

    first_slide = slides[0]

    # Check for background image
    props = first_slide.get('props', {})
    bg_url = props.get('backgroundImageUrl')
    if bg_url and bg_url.startswith('http'):
        return bg_url

    # Check components for Image type
    components = first_slide.get('components', [])
    for comp in components:
        if comp.get('type') == 'Image':
            src = comp.get('props', {}).get('src', '')
            if src and src.startswith('http') and 'placeholder' not in src.lower():
                return src

    # Check for CustomComponent with background image prop
    for comp in components:
        comp_props = comp.get('props', {})
        bg_url = comp_props.get('backgroundImageUrl')
        if bg_url and bg_url.startswith('http'):
            return bg_url

    # Check for image URLs embedded in CustomComponent HTML
    for comp in components:
        if comp.get('type') == 'CustomComponent':
            comp_html = comp.get('props', {}).get('html', '')
            if not comp_html:
                continue
            # Look for img src attributes
            src_matches = re.findall(r'src=["\']?(https?://[^"\'>\s]+)', comp_html)
            for url in src_matches:
                if 'placeholder' not in url.lower() and not url.endswith(('.js', '.css')):
                    return url
            # Look for CSS background-image urls
            bg_matches = re.findall(r'url\(["\']?(https?://[^"\')\s]+)', comp_html)
            for url in bg_matches:
                if 'placeholder' not in url.lower():
                    return url

    return None


@router.get("/og/{short_code}.png")
async def get_og_image(short_code: str):
    """
    Serve an OG image for a shared deck.

    This endpoint:
    1. Fetches the share link metadata to get the OG image URL
    2. If not found, extracts an image from the first slide of the deck
    3. If a thumbnail exists, downloads it and applies the NextSlide watermark
    4. If no thumbnail, generates a fallback branded image
    5. Returns the image with proper caching headers
    """
    try:
        supabase = get_supabase_client()

        # Get share link by short_code
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        metadata = share_data.get('metadata') or {}
        og_image_url = metadata.get('og_image_url')

        # Get deck data (name, slides, and pre-rendered thumbnail for image extraction)
        deck_result = supabase.table('decks').select('name, slides, thumbnail_url').eq(
            'uuid', share_data['deck_uuid']
        ).execute()

        deck_name = "Presentation"
        deck_data = {}
        if deck_result.data:
            deck_data = deck_result.data[0]
            deck_name = deck_data.get('name', 'Presentation')

        # Build a list of candidate image URLs to try in priority order
        candidate_urls = []

        # Pre-rendered Playwright thumbnail is highest priority (pixel-perfect)
        deck_thumbnail = deck_data.get("thumbnail_url")
        if deck_thumbnail:
            candidate_urls.append(deck_thumbnail)

        if og_image_url:
            candidate_urls.append(og_image_url)

        # Always extract from slide data as a fallback candidate
        slide_image_url = extract_first_slide_image(deck_data)
        if slide_image_url and slide_image_url != og_image_url:
            candidate_urls.append(slide_image_url)

        if not candidate_urls:
            logger.info(f"No OG image found for {short_code}, will use fallback")

        # Try each candidate URL until one succeeds
        final_image = None
        for url in candidate_urls:
            base_image = await fetch_image_from_url(url)
            if base_image:
                logger.info(f"Fetched OG image from: {url[:100]}...")
                # Cover-crop to OG dimensions (no white bars, no distortion)
                if base_image.size != (OG_WIDTH, OG_HEIGHT):
                    base_image = resize_cover(base_image, OG_WIDTH, OG_HEIGHT)

                # Apply watermark
                watermark = create_brand_watermark(180, 45)
                final_image = apply_watermark(
                    base_image,
                    watermark,
                    position="bottom-right",
                    margin=25,
                    opacity=0.95
                )
                break
            else:
                logger.warning(f"Failed to fetch OG image from: {url[:100]}")

        # Fallback to generated image
        if final_image is None:
            final_image = create_fallback_og_image(deck_name[:50])

        # Convert to bytes
        img_byte_arr = io.BytesIO()
        final_image.save(img_byte_arr, format='PNG', optimize=True)
        img_byte_arr.seek(0)

        return Response(
            content=img_byte_arr.getvalue(),
            media_type="image/png",
            headers={
                "Cache-Control": "public, max-age=3600",  # Cache for 1 hour
                "Content-Disposition": f"inline; filename=\"{short_code}-og.png\""
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating OG image: {str(e)}")
        # Return a basic fallback image on error
        try:
            fallback = create_fallback_og_image("NextSlide")
            img_byte_arr = io.BytesIO()
            fallback.save(img_byte_arr, format='PNG')
            img_byte_arr.seek(0)

            return Response(
                content=img_byte_arr.getvalue(),
                media_type="image/png",
                headers={"Cache-Control": "public, max-age=60"}
            )
        except Exception:
            raise HTTPException(status_code=500, detail="Failed to generate OG image")


@router.get("/meta/{short_code}")
async def get_share_meta_html(short_code: str):
    """
    Return a minimal HTML page with proper OG meta tags for social media crawlers.

    This endpoint is designed to be used by:
    - Reverse proxy/edge functions that detect bot user agents
    - Prerender services
    - Direct embedding where full SPA isn't needed

    The HTML includes a redirect to the actual SPA for regular browsers.
    """
    try:
        supabase = get_supabase_client()

        # Get share link info
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata, share_type'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        share_type = share_data.get('share_type', 'view')

        # Get deck info
        deck_result = supabase.table('decks').select('name').eq(
            'uuid', share_data['deck_uuid']
        ).execute()

        deck_name = "Presentation"
        if deck_result.data:
            deck_name = deck_result.data[0].get('name', 'Presentation')

        # Escape deck name for HTML safety
        deck_name_escaped = html.escape(deck_name[:100])

        # Build URLs
        path_prefix = "p" if share_type == "view" else "e"
        canonical_url = f"{FRONTEND_BASE_URL}/{path_prefix}/{short_code}"
        og_image_url = f"{API_BASE_URL}/api/public/og/{short_code}.png"

        # Build HTML with proper OG tags
        html_content = f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{deck_name_escaped} | NextSlide</title>

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="{canonical_url}">
    <meta property="og:title" content="{deck_name_escaped}">
    <meta property="og:description" content="View this presentation on NextSlide - AI-Powered Presentation Builder">
    <meta property="og:image" content="{og_image_url}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:site_name" content="NextSlide">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="{canonical_url}">
    <meta name="twitter:title" content="{deck_name_escaped}">
    <meta name="twitter:description" content="View this presentation on NextSlide - AI-Powered Presentation Builder">
    <meta name="twitter:image" content="{og_image_url}">

    <!-- Canonical URL -->
    <link rel="canonical" href="{canonical_url}">

    <!-- Redirect for browsers (crawlers won't follow this) -->
    <meta http-equiv="refresh" content="0;url={canonical_url}">
    <script>window.location.href = "{canonical_url}";</script>
</head>
<body>
    <p>Redirecting to <a href="{canonical_url}">{deck_name_escaped}</a>...</p>
</body>
</html>"""

        return HTMLResponse(
            content=html_content,
            status_code=200,
            headers={
                "Cache-Control": "public, max-age=3600",
            }
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating meta HTML: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate meta page")


# =============================================================================
# OG Meta JSON API + Schema.org JSON-LD
# =============================================================================

def _extract_slide_text(deck_data: dict, max_length: int = 160) -> str:
    """
    Extract a plain-text description from the first few slides.
    Used as the OG description for social previews.
    """
    slides = deck_data.get('slides', [])
    texts: list[str] = []

    for slide in slides[:3]:  # Only look at first 3 slides
        components = slide.get('components', [])
        for comp in components:
            comp_type = comp.get('type', '')
            props = comp.get('props', {})

            # Text / Heading / Paragraph components
            text = props.get('text', '') or props.get('content', '') or ''
            if text:
                # Strip HTML tags if present
                clean = re.sub(r'<[^>]+>', ' ', str(text)).strip()
                if clean:
                    texts.append(clean)

            # CustomComponent - try to extract visible text from HTML
            if comp_type == 'CustomComponent':
                comp_html = props.get('html', '')
                if comp_html:
                    clean = re.sub(r'<[^>]+>', ' ', comp_html)
                    clean = re.sub(r'\s+', ' ', clean).strip()
                    if clean and len(clean) > 10:
                        texts.append(clean)

    combined = ' '.join(texts).strip()
    if len(combined) > max_length:
        combined = combined[:max_length - 3].rsplit(' ', 1)[0] + '...'
    return combined or "View this presentation on NextSlide - AI-Powered Presentation Builder"


@router.get("/og-meta/{short_code}")
async def get_og_meta_json(short_code: str):
    """
    Return OG metadata as JSON for the frontend DynamicMeta component.

    Response:
    {
        "title": "Deck Name | NextSlide",
        "description": "First ~160 chars of slide content",
        "image_url": "/api/public/og/{short_code}.png",
        "type": "article",
        "url": "https://nextslide.ai/p/{short_code}",
        "json_ld": { ... Schema.org PresentationDigitalDocument ... }
    }
    """
    try:
        supabase = get_supabase_client()

        # Fetch share link
        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata, share_type'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        share_type = share_data.get('share_type', 'view')

        # Fetch deck info (name + slides for description extraction)
        deck_result = supabase.table('decks').select('name, slides').eq(
            'uuid', share_data['deck_uuid']
        ).execute()

        deck_name = "Presentation"
        deck_data: dict = {}
        slide_count = 0
        if deck_result.data:
            deck_data = deck_result.data[0]
            deck_name = deck_data.get('name', 'Presentation')
            slides = deck_data.get('slides', [])
            slide_count = len(slides) if isinstance(slides, list) else 0

        title = f"{deck_name} | NextSlide"
        description = _extract_slide_text(deck_data)
        path_prefix = "p" if share_type == "view" else "e"
        canonical_url = f"{FRONTEND_BASE_URL}/{path_prefix}/{short_code}"
        og_image_url = f"{API_BASE_URL}/api/public/og/{short_code}.png"

        # Schema.org JSON-LD for PresentationDigitalDocument
        json_ld = {
            "@context": "https://schema.org",
            "@type": "PresentationDigitalDocument",
            "name": deck_name,
            "description": description,
            "url": canonical_url,
            "thumbnailUrl": og_image_url,
            "provider": {
                "@type": "Organization",
                "name": "NextSlide",
                "url": "https://nextslide.ai",
            },
        }

        if slide_count > 0:
            json_ld["numberOfPages"] = slide_count

        return JSONResponse(
            content={
                "title": title,
                "description": description,
                "image_url": og_image_url,
                "type": "article",
                "url": canonical_url,
                "json_ld": json_ld,
            },
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating OG meta JSON: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate OG metadata")


# =============================================================================
# Enhanced Meta HTML with Schema.org JSON-LD
# =============================================================================

# Enhance the existing meta HTML endpoint to include JSON-LD.
# We do this by patching get_share_meta_html to inject Schema.org markup.
# The original function is kept as-is above; the share_router handlers
# call it directly so the injection happens via the new _build_meta_html helper.

def _extract_all_slide_texts(slides: list) -> list:
    """
    Extract text content from ALL slides for the bot-served transcript.
    Returns a list of dicts with slide_number, title, and texts.
    """
    result = []
    for idx, slide in enumerate(slides or []):
        if not isinstance(slide, dict):
            continue
        components = slide.get("components", [])
        title = None
        texts = []

        for comp in components:
            if not isinstance(comp, dict):
                continue
            props = comp.get("props", {})
            if not isinstance(props, dict):
                continue

            # Extract title
            if not title:
                title_val = props.get("title") or props.get("heading")
                if isinstance(title_val, str) and title_val.strip():
                    title = title_val.strip()

            # Extract text from common props
            for key in ("text", "content", "subtitle", "body"):
                val = props.get(key)
                if isinstance(val, str) and val.strip():
                    texts.append(val.strip())

            # Extract from HTML (CustomComponent)
            html_val = props.get("html", "")
            if isinstance(html_val, str) and html_val:
                stripped = re.sub(r"<style[^>]*>[\s\S]*?</style>", "", html_val, flags=re.IGNORECASE)
                stripped = re.sub(r"<script[^>]*>[\s\S]*?</script>", "", stripped, flags=re.IGNORECASE)
                stripped = re.sub(r"<[^>]+>", " ", stripped)
                stripped = re.sub(r"\s+", " ", stripped).strip()
                if stripped:
                    texts.append(stripped)

            # Extract list items
            items = props.get("items") or props.get("bullets") or props.get("listItems")
            if isinstance(items, list):
                for item in items:
                    if isinstance(item, str) and item.strip():
                        texts.append(item.strip())
                    elif isinstance(item, dict) and item.get("text"):
                        texts.append(item["text"])

        if title or texts:
            result.append({
                "slide_number": idx + 1,
                "title": title,
                "texts": texts,
            })

    return result


def _build_transcript_html(slides: list, deck_name_escaped: str) -> str:
    """Build semantic HTML transcript of all slide content for crawlers."""
    slide_texts = _extract_all_slide_texts(slides)
    if not slide_texts:
        return ""

    sections = []
    sections.append(f'<article><h1>{deck_name_escaped}</h1>')
    sections.append('<h2>Slide Content Transcript</h2>')

    for slide in slide_texts:
        title = html.escape(slide["title"]) if slide["title"] else f'Slide {slide["slide_number"]}'
        sections.append(f'<section><h3>{title}</h3>')
        for text in slide["texts"]:
            sections.append(f'<p>{html.escape(text[:500])}</p>')
        sections.append('</section>')

    sections.append('</article>')
    return "\n    ".join(sections)


def _build_meta_html(
    deck_name: str,
    short_code: str,
    share_type: str = "view",
    description: str = "",
    slide_count: int = 0,
    slides: list | None = None,
) -> str:
    """Build the full OG meta HTML including Schema.org JSON-LD and slide transcript."""
    deck_name_escaped = html.escape(deck_name[:100])
    desc_escaped = html.escape(description[:300]) if description else \
        "View this presentation on NextSlide - AI-Powered Presentation Builder"

    path_prefix = "p" if share_type == "view" else "e"
    canonical_url = f"{FRONTEND_BASE_URL}/{path_prefix}/{short_code}"
    og_image_url = f"{API_BASE_URL}/api/public/og/{short_code}.png"

    # Schema.org JSON-LD
    json_ld = {
        "@context": "https://schema.org",
        "@type": "PresentationDigitalDocument",
        "name": deck_name,
        "description": desc_escaped,
        "url": canonical_url,
        "thumbnailUrl": og_image_url,
        "provider": {
            "@type": "Organization",
            "name": "NextSlide",
            "url": "https://nextslide.ai",
        },
    }
    if slide_count > 0:
        json_ld["numberOfPages"] = slide_count

    json_ld_str = json_module.dumps(json_ld, ensure_ascii=False)

    # Build transcript HTML for crawlers
    transcript_html = _build_transcript_html(slides or [], deck_name_escaped) if slides else ""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{deck_name_escaped} | NextSlide</title>

    <!-- Open Graph / Facebook -->
    <meta property="og:type" content="article">
    <meta property="og:url" content="{canonical_url}">
    <meta property="og:title" content="{deck_name_escaped}">
    <meta property="og:description" content="{desc_escaped}">
    <meta property="og:image" content="{og_image_url}">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta property="og:image:type" content="image/png">
    <meta property="og:site_name" content="NextSlide">

    <!-- Twitter Card -->
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:url" content="{canonical_url}">
    <meta name="twitter:title" content="{deck_name_escaped}">
    <meta name="twitter:description" content="{desc_escaped}">
    <meta name="twitter:image" content="{og_image_url}">

    <!-- Schema.org JSON-LD -->
    <script type="application/ld+json">{json_ld_str}</script>

    <!-- Canonical URL -->
    <link rel="canonical" href="{canonical_url}">

    <!-- Redirect for browsers (crawlers won't follow this) -->
    <meta http-equiv="refresh" content="0;url={canonical_url}">
    <script>window.location.href = "{canonical_url}";</script>
</head>
<body>
    {transcript_html if transcript_html else f'<p>Redirecting to <a href="{canonical_url}">{deck_name_escaped}</a>...</p>'}
</body>
</html>"""


# =============================================================================
# Share Route Handlers (mounted at root level for /p/ and /e/ routes)
# =============================================================================

async def _serve_bot_meta_html(short_code: str, share_type_override: str = "view") -> HTMLResponse:
    """
    Serve enhanced meta HTML (with JSON-LD) for bot/crawler requests.
    Reuses the same DB queries as get_share_meta_html but includes
    Schema.org markup and a richer description.
    """
    try:
        supabase = get_supabase_client()

        share_result = supabase.table('deck_shares').select(
            'id, deck_uuid, metadata, share_type'
        ).eq('short_code', short_code).eq('is_active', True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]
        share_type = share_data.get('share_type', share_type_override)

        deck_result = supabase.table('decks').select('name, slides').eq(
            'uuid', share_data['deck_uuid']
        ).execute()

        deck_name = "Presentation"
        deck_data: dict = {}
        slide_count = 0
        slides_data: list = []
        if deck_result.data:
            deck_data = deck_result.data[0]
            deck_name = deck_data.get('name', 'Presentation')
            slides_data = deck_data.get('slides', [])
            slide_count = len(slides_data) if isinstance(slides_data, list) else 0

        description = _extract_slide_text(deck_data)
        html_content = _build_meta_html(
            deck_name=deck_name,
            short_code=short_code,
            share_type=share_type,
            description=description,
            slide_count=slide_count,
            slides=slides_data,
        )

        return HTMLResponse(
            content=html_content,
            status_code=200,
            headers={"Cache-Control": "public, max-age=3600"},
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating enhanced meta HTML: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate meta page")


@share_router.get("/p/{short_code}")
async def handle_view_share(short_code: str, request: Request):
    """
    Handle view share routes.
    - Bots/crawlers get meta HTML with OG tags + Schema.org JSON-LD
    - Regular browsers get redirected to the frontend SPA
    """
    user_agent = request.headers.get('user-agent', '')

    if is_bot_request(user_agent):
        logger.info(f"Bot detected for /p/{short_code}: {user_agent[:100]}")
        return await _serve_bot_meta_html(short_code, "view")

    # Redirect to frontend for regular browsers
    return RedirectResponse(
        url=f"{FRONTEND_BASE_URL}/p/{short_code}",
        status_code=302
    )


@share_router.get("/e/{short_code}")
async def handle_edit_share(short_code: str, request: Request):
    """
    Handle edit share routes.
    - Bots/crawlers get meta HTML with OG tags + Schema.org JSON-LD
    - Regular browsers get redirected to the frontend SPA
    """
    user_agent = request.headers.get('user-agent', '')

    if is_bot_request(user_agent):
        logger.info(f"Bot detected for /e/{short_code}: {user_agent[:100]}")
        return await _serve_bot_meta_html(short_code, "edit")

    # Redirect to frontend for regular browsers
    return RedirectResponse(
        url=f"{FRONTEND_BASE_URL}/e/{short_code}",
        status_code=302
    )
