"""
Dedicated CustomComponent generator using Gemini 3 Pro for creative HTML/CSS/JS generation.

This module generates visually stunning CustomComponents for slides using:
- Gemini 3 Pro's creative capabilities (with Claude Opus 4.5 fallback on rate limits)
- Full HTML document mode (iframe)
- Tailwind CSS for styling
- Context-aware design (theme, content, style)
"""

import asyncio
import re
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import (
    CUSTOM_COMPONENT_MODEL,
    CUSTOM_COMPONENT_FALLBACK_MODEL,
    CUSTOM_COMPONENT_TEMPERATURE,
    ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN,
    IMAGE_SEARCH_MODEL
)
from agents.generation.exceptions import AIRateLimitError

# Provider name for rate limit tracking
GEMINI_PROVIDER = "gemini"
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Global semaphore to limit concurrent AI calls (prevents rate limiting)
# Uses config value - Gemini Tier 3 has 2000+ RPM, so we can run many in parallel
from agents.config import MAX_API_CONCURRENT_CALLS
_AI_SEMAPHORE = asyncio.Semaphore(MAX_API_CONCURRENT_CALLS)

def _reference_images_from_uploaded_media(uploaded_media: Optional[list]) -> List[str]:
    """
    Convert user-uploaded media (taggedMedia) into reference image URLs/data-URLs
    so the model can SEE them as multimodal design references.
    """
    if not uploaded_media:
        return []

    refs: List[str] = []
    for m in uploaded_media:
        if not isinstance(m, dict):
            continue
        # Prefer previewUrl/url if present
        url = m.get("previewUrl") or m.get("url")
        if not url:
            # Fall back to data URL if we have base64 content + a type
            content_b64 = m.get("content") or ""
            mime = m.get("type") or m.get("mimeType") or "image/png"
            if content_b64 and isinstance(content_b64, str):
                url = f"data:{mime};base64,{content_b64}"
        if not url or not isinstance(url, str):
            continue

        # Only include image-like references (skip PDFs/etc.)
        mt = (m.get("type") or m.get("mimeType") or "").lower()
        fn = (m.get("filename") or m.get("name") or "").lower()
        if mt and mt.startswith("image/"):
            refs.append(url)
        elif any(fn.endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg", ".avif"]):
            refs.append(url)
        elif url.startswith("data:image/"):
            refs.append(url)

    # Deduplicate while preserving order
    seen = set()
    out: List[str] = []
    for r in refs:
        if r not in seen:
            seen.add(r)
            out.append(r)
    return out


async def prefetch_images_for_content(
    content: str,
    slide_title: str,
    max_images: int = 5,
    slide_context: Optional[Dict[str, Any]] = None,
    theme: Optional[Dict[str, Any]] = None
) -> Dict[str, str]:
    """
    Pre-fetch images for slide content BEFORE generation.

    Searches for images via SerpAPI, uploads them to our Supabase bucket,
    and returns our own hosted URLs (reliable, no external dependencies).

    If Brandfetch logos are available in theme, includes them automatically.

    Args:
        content: The slide content to analyze
        slide_title: The slide title for additional context
        max_images: Maximum number of images to fetch
        slide_context: Full slide context including presentation_context, slide_type, etc.
        theme: Theme dict that may contain Brandfetch logos in brandInfo or color_palette.metadata

    Returns:
        Dict mapping prop names to our Supabase URLs, e.g.:
        {"image1": "https://auth.nextslide.ai/storage/...", ...}
        Also includes search term hints: {"image1_query": "Tesla", ...}
        May include "logoUrl" if Brandfetch provided one.
    """
    from services.serpapi_service import SerpAPIService
    from services.image_storage_service import ImageStorageService

    prefetched = {}
    theme = theme or {}

    # FIRST: Check if we have Brandfetch logos available - include them as pre-fetched
    brand_info = theme.get('brandInfo', {})
    color_palette = theme.get('color_palette', {})
    brandfetch_logo = (
        brand_info.get('logoUrl') or
        brand_info.get('logo_url') or
        color_palette.get('metadata', {}).get('logo_url') or
        color_palette.get('metadata', {}).get('logo_url_light')
    )
    brandfetch_logo_dark = (
        brand_info.get('logoUrlDark') or
        brand_info.get('logo_url_dark') or
        color_palette.get('metadata', {}).get('logo_url_dark')
    )

    if brandfetch_logo:
        prefetched['logoUrl'] = brandfetch_logo
        prefetched['logoUrl_query'] = 'brand logo'
        print(f"[PREFETCH] ✅ Using Brandfetch logo: {brandfetch_logo[:60]}...")
    if brandfetch_logo_dark:
        prefetched['logoUrlDark'] = brandfetch_logo_dark
        prefetched['logoUrlDark_query'] = 'brand logo dark'

    # Initialize SerpAPI
    try:
        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("[PREFETCH] SerpAPI not available (no API key)")
            print("[PREFETCH] ❌ SerpAPI not available")
            return prefetched  # Return Brandfetch logos if we have them
    except Exception as e:
        logger.warning(f"[PREFETCH] Could not init SerpAPI: {e}")
        return prefetched  # Return Brandfetch logos if we have them

    # Extract search terms using AI with FULL CONTEXT for better quality
    # Pass theme so AI knows if we already have logos (won't search for them)
    search_terms = await _extract_image_search_terms_with_ai(content, slide_title, slide_context, theme)
    if not search_terms:
        print("[PREFETCH] ⚠️ No search terms extracted")
        return prefetched  # Return Brandfetch logos if we have them

    print(f"[PREFETCH] 🔍 Search terms: {search_terms[:max_images]}")
    search_terms = search_terms[:max_images]
    # NOTE: Don't reset prefetched - it may already have Brandfetch logos

    # Use ImageStorageService to upload to our bucket
    async with ImageStorageService() as storage:

        async def search_and_upload(index: int, term: str) -> Tuple[int, str, Optional[str]]:
            """Search SerpAPI, upload first good result to our bucket."""
            try:
                # Log the exact query being sent
                print(f"[PREFETCH] 🔎 Searching: '{term}'")

                # Search for images - use the term directly, no modifiers
                result = await serpapi.search_images(
                    query=term,
                    per_page=5,
                    size="large"
                )

                photos = result.get('photos', [])
                print(f"[PREFETCH] 📷 Got {len(photos)} results for '{term}'")

                # Try each result until one uploads successfully
                for photo in photos:
                    url = photo.get('original') or photo.get('url') or photo.get('src', {}).get('original')
                    if not url or url.startswith('data:'):
                        continue

                    # Upload to our Supabase bucket
                    try:
                        upload_result = await storage.upload_image_from_url(url)
                        if 'error' not in upload_result and upload_result.get('url'):
                            our_url = upload_result['url']
                            print(f"[PREFETCH] ✅ image{index + 1} ({term}) -> uploaded")
                            return (index, term, our_url)
                    except Exception as e:
                        logger.debug(f"[PREFETCH] Upload failed: {e}")
                        continue

                print(f"[PREFETCH] ⚠️ No image for: {term}")
                return (index, term, None)

            except Exception as e:
                print(f"[PREFETCH] ❌ Error for '{term}': {e}")
                return (index, term, None)

        # Run all searches in parallel
        tasks = [search_and_upload(i, term) for i, term in enumerate(search_terms)]
        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Build result dict
        for result in results:
            if isinstance(result, tuple) and len(result) == 3 and result[2]:
                index, term, url = result
                prefetched[f"image{index + 1}"] = url
                prefetched[f"image{index + 1}_query"] = term

    # Count images (exclude _query metadata keys)
    image_keys = [k for k in prefetched if not k.endswith('_query')]
    searched_count = len([k for k in image_keys if k.startswith('image')])
    brand_count = len([k for k in image_keys if k.startswith('logo')])
    print(f"[PREFETCH] 📸 Total images: {len(image_keys)} ({searched_count} searched, {brand_count} from Brandfetch)")
    return prefetched


async def _extract_image_search_terms_with_ai(
    content: str,
    slide_title: str,
    slide_context: Optional[Dict[str, Any]] = None,
    theme: Optional[Dict[str, Any]] = None
) -> List[str]:
    """
    Use AI to generate PRECISE Google Image search queries for SPECIFIC visual elements.

    This function:
    1. Analyzes what visual elements the slide needs (hero image, icons, backgrounds, etc.)
    2. Generates precise, disambiguated search queries for each element
    3. Handles ambiguous terms (e.g., "Apple" → "Apple company logo" not apple fruit)
    4. Avoids searching for logos if Brandfetch already provided them
    """
    from agents.ai.clients import get_client, invoke

    # Extract all available context
    slide_context = slide_context or {}
    theme = theme or {}
    presentation_context = slide_context.get('presentation_context', '')
    presentation_topic = slide_context.get('presentation_topic', '')
    slide_type = slide_context.get('slide_type', '')
    slide_index = slide_context.get('slide_index', 0)
    total_slides = slide_context.get('total_slides', 1)
    deck_title = slide_context.get('deck_title', '')
    industry = slide_context.get('industry', '')
    audience = slide_context.get('audience', '')
    vibe_context = slide_context.get('vibe_context', '') or slide_context.get('initial_idea', '')

    # Check if we already have brand logos from Brandfetch (don't search for logos then)
    has_brand_logo = False
    brand_name = ""
    brand_info = theme.get('brandInfo', {})
    color_palette = theme.get('color_palette', {})
    if brand_info.get('logoUrl') or brand_info.get('logo_url'):
        has_brand_logo = True
    if color_palette.get('metadata', {}).get('logo_url'):
        has_brand_logo = True

    # Try to extract brand name from various sources
    if vibe_context:
        brand_name = vibe_context
    elif deck_title:
        brand_name = deck_title

    # Build rich context string
    context_parts = []
    if presentation_context:
        context_parts.append(f"PRESENTATION TOPIC: {presentation_context}")
    if deck_title and deck_title != slide_title:
        context_parts.append(f"DECK TITLE: {deck_title}")
    if presentation_topic:
        context_parts.append(f"MAIN SUBJECT: {presentation_topic}")
    if vibe_context:
        context_parts.append(f"BRAND/VIBE: {vibe_context}")
    if industry:
        context_parts.append(f"INDUSTRY: {industry}")
    if audience:
        context_parts.append(f"AUDIENCE: {audience}")
    if slide_type:
        context_parts.append(f"SLIDE TYPE: {slide_type}")

    context_block = "\n".join(context_parts) if context_parts else "No additional context"

    # Instruction about logos if we already have them
    logo_instruction = ""
    if has_brand_logo:
        logo_instruction = f"""
IMPORTANT: We already have the brand logo for this presentation. Do NOT search for:
- "{brand_name} logo" or any company logos
- Brand marks, wordmarks, or company symbols
Instead, focus on OTHER visual content the slide needs (products, people, concepts, etc.)."""

    try:
        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        # Log what we're searching for
        print(f"[PREFETCH] 📝 Generating search terms for: '{slide_title}'")
        if has_brand_logo:
            print(f"[PREFETCH] ✅ Has Brandfetch logo - will skip logo searches")

        prompt = f"""Extract image search terms for this slide.

SLIDE TITLE: {slide_title}
CONTENT: {content[:1200]}
{logo_instruction}

EXTRACT SEARCH TERMS FOR:
- Named people → "Elon Musk CEO portrait"
- Named products → "iPhone 15 Pro"
- Named characters → "Pikachu Pokemon"
- Named brands/companies → "Instacart grocery app"
- Industry context → "grocery delivery", "electric vehicle", "mobile shopping"

MAKE TERMS SPECIFIC:
- "Apple" → "Apple Inc company" (not fruit)
- "Profit Performance" → "business profit chart" or "financial growth"
- "Order Frequency" → "online shopping orders"

SKIP images only for:
- Pure quote slides with just text
- Slides listing only numbers/stats with no context

Return JSON array with 2-4 relevant terms:
["term1", "term2"]"""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            500,
            0.3
        )

        # Parse JSON array from response
        import json
        response_str = str(response).strip()
        # Find JSON array in response
        match = re.search(r'\[.*?\]', response_str, re.DOTALL)
        if match:
            terms = json.loads(match.group())
            print(f"[PREFETCH] 🧠 AI raw response: {terms}")

            # Filter out obvious local filenames / uploads
            cleaned: List[str] = []
            for t in terms:
                if not isinstance(t, str):
                    continue
                tl = t.strip().lower()
                if not tl:
                    continue
                if tl.startswith("img_") or tl.endswith((".png", ".jpg", ".jpeg", ".webp", ".gif")):
                    print(f"[PREFETCH] ⏭️ Skipping filename: '{t}'")
                    continue
                # Skip logo queries if we already have brand logo
                if has_brand_logo and ("logo" in tl or "wordmark" in tl or "brandmark" in tl):
                    print(f"[PREFETCH] ⏭️ Skipping '{t}' - already have brand logo")
                    continue
                cleaned.append(t)

            if len(cleaned) == 0:
                print(f"[PREFETCH] ⚠️ No valid search terms after filtering")
                return []

            print(f"[PREFETCH] ✅ Search terms: {cleaned[:8]}")
            return cleaned[:8]
    except Exception as e:
        logger.warning(f"[PREFETCH] AI search term extraction failed: {e}, falling back to regex")
        print(f"[PREFETCH] ⚠️ AI extraction failed: {e}, using fallback")

    # Fallback to regex-based extraction
    return _extract_image_search_terms_fallback(content, slide_title)


def _extract_image_search_terms_fallback(content: str, slide_title: str) -> List[str]:
    """Fallback regex-based extraction if AI fails."""
    return _extract_image_search_terms(content, slide_title)


def _extract_image_search_terms(content: str, slide_title: str) -> List[str]:
    """
    Extract HIGH QUALITY, SPECIFIC image search terms from slide content.

    Focuses on:
    - Named entities (people, places, products, companies)
    - Specific brands, products, and organizations
    - Concrete, visualizable concepts (NOT abstract terms)

    Avoids:
    - Generic business buzzwords (synergy, strategy, alignment)
    - Abstract concepts (success, growth, innovation)
    - Common verbs and adjectives

    Returns list of search terms, most specific first.
    """
    terms = []
    combined_text = f"{slide_title}\n{content}"

    # Words to NEVER use as search terms (too generic, produce bad results)
    BLACKLIST = {
        # Abstract business terms
        'team', 'teamwork', 'alignment', 'strategy', 'synergy', 'growth', 'success',
        'innovation', 'collaboration', 'partnership', 'leadership', 'excellence',
        'solution', 'solutions', 'approach', 'methodology', 'framework', 'process',
        'efficiency', 'productivity', 'performance', 'optimization', 'transformation',
        'digital', 'agile', 'scalable', 'robust', 'seamless', 'holistic', 'proactive',
        'stakeholder', 'stakeholders', 'initiative', 'initiatives', 'deliverable',
        'leverage', 'synergize', 'streamline', 'optimize', 'maximize', 'minimize',
        'empower', 'enable', 'facilitate', 'implement', 'integrate', 'execute',
        # Generic slide terms
        'overview', 'introduction', 'summary', 'agenda', 'conclusion', 'questions',
        'thank', 'thanks', 'slide', 'presentation', 'deck', 'section', 'chapter',
        # Common words
        'the', 'and', 'for', 'with', 'about', 'your', 'our', 'their', 'this', 'that',
        'new', 'key', 'main', 'important', 'critical', 'essential', 'top', 'best',
        'next', 'steps', 'action', 'items', 'point', 'points', 'benefit', 'benefits',
        'feature', 'features', 'advantage', 'advantages', 'goal', 'goals', 'objective',
        'meeting', 'meetings', 'discussion', 'review', 'update', 'status', 'progress',
    }

    # 1. Extract company/product names (capitalized multi-word phrases)
    # Match: "Tesla Motors", "Google Cloud", "Microsoft Azure", "Elon Musk"
    proper_nouns = re.findall(r'\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)\b', combined_text)
    for noun in proper_nouns:
        # Only add if none of the words are blacklisted
        words = noun.lower().split()
        if not any(w in BLACKLIST for w in words):
            terms.append(noun)

    # 2. Extract quoted terms (usually specific names/products)
    quoted = re.findall(r'"([^"]{3,40})"', combined_text)
    for q in quoted:
        if q.lower() not in BLACKLIST and len(q.split()) <= 4:
            terms.append(q)

    # 3. Extract specific technology/product patterns
    tech_patterns = [
        r'\b(GPT-\d+|ChatGPT|Claude|Gemini|DALL-E|Midjourney|Stable Diffusion)\b',
        r'\b(iPhone \d+|iPad Pro|MacBook|Apple Watch|AirPods)\b',
        r'\b(Tesla Model [SXY3]|Cybertruck|Roadster)\b',
        r'\b(AWS|Azure|Google Cloud|GCP|Kubernetes|Docker|Terraform)\b',
        r'\b(React|Vue|Angular|Next\.js|Node\.js|Python|TypeScript)\b',
        r'\b(OpenAI|Anthropic|Google DeepMind|Meta AI)\b',
        r'\b(Netflix|Spotify|Uber|Airbnb|Stripe|Shopify)\b',
        r'\b(CEO|CTO|CFO)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)\b',  # "CEO Tim Cook"
    ]
    for pattern in tech_patterns:
        matches = re.findall(pattern, combined_text, re.IGNORECASE)
        for match in matches:
            if isinstance(match, tuple):
                terms.extend([m for m in match if m])
            else:
                terms.append(match)

    # 4. Extract single capitalized words that are likely brands/names
    # These appear mid-sentence (not at start)
    single_caps = re.findall(r'(?<=[a-z]\s)([A-Z][a-z]{2,})\b', combined_text)
    for cap in single_caps:
        if cap.lower() not in BLACKLIST and len(cap) >= 4:
            terms.append(cap)

    # 5. Extract terms from bold/emphasized text (often important)
    bold = re.findall(r'\*\*([^*]{3,30})\*\*', combined_text)
    for b in bold:
        words = b.lower().split()
        if not all(w in BLACKLIST for w in words):
            terms.append(b)

    # 6. Use slide title ONLY if it contains specific terms
    if slide_title:
        title_words = slide_title.split()
        # Check if title has any non-blacklisted words
        specific_words = [w for w in title_words if w.lower() not in BLACKLIST and len(w) > 3]
        if specific_words:
            # Use just the specific words from title
            terms.append(' '.join(specific_words[:3]))

    # 7. If we still don't have good terms, extract nouns from content
    if len(terms) < 2:
        # Look for concrete nouns (things you can photograph)
        concrete_nouns = re.findall(r'\b(office|building|computer|laptop|phone|car|robot|factory|warehouse|store|restaurant|hospital|school|university|city|mountain|ocean|forest|desert)\b', combined_text, re.IGNORECASE)
        terms.extend(list(set(concrete_nouns)))

    # Deduplicate while preserving order (most specific first)
    seen = set()
    unique_terms = []
    for term in terms:
        term_clean = term.strip()
        term_lower = term_clean.lower()
        if term_lower and term_lower not in seen and term_lower not in BLACKLIST:
            # Skip if too short or too long
            if len(term_clean) < 3 or len(term_clean) > 50:
                continue
            seen.add(term_lower)
            unique_terms.append(term_clean)

    # If we have very few terms, add the title as a last resort
    if len(unique_terms) < 2 and slide_title:
        # Clean the title of blacklisted words
        clean_title = ' '.join([w for w in slide_title.split() if w.lower() not in BLACKLIST])
        if clean_title and clean_title not in seen:
            unique_terms.append(clean_title)

    return unique_terms


def _term_to_prop_name(term: str) -> str:
    """
    Convert a search term to a valid JavaScript prop name.

    "Elon Musk" -> "elonMuskImage"
    "Tesla Model S" -> "teslaModelSImage"
    """
    # Remove special characters, keep alphanumeric and spaces
    clean = re.sub(r'[^a-zA-Z0-9\s]', '', term)

    # Split into words
    words = clean.split()

    if not words:
        return "imageDefault"

    # CamelCase: first word lowercase, rest capitalized
    prop = words[0].lower()
    for word in words[1:]:
        prop += word.capitalize()

    # Add "Image" suffix if not already present
    if not prop.lower().endswith('image'):
        prop += 'Image'

    return prop


def _extract_fonts_from_typography(typography: Dict[str, Any]) -> Tuple[str, str]:
    """
    Extract hero and body fonts from typography dict.

    Handles multiple possible structures:
    - Flat: typography.hero_font, typography.body_font
    - Nested: typography.hero_title.family, typography.body_text.family
    - Alternative: typography.heading.family, typography.body.family

    Returns (hero_font, body_font) tuple with 'Inter' as fallback.
    """
    if not typography:
        logger.debug("[FONTS] No typography dict provided, using defaults")
        return ('Inter', 'Inter')

    # Debug: log what we received
    logger.debug(f"[FONTS] Typography keys: {list(typography.keys())}")

    hero_font = (
        typography.get('hero_font') or
        (typography.get('hero_title') or {}).get('family') or
        (typography.get('heading') or {}).get('family') or
        (typography.get('title') or {}).get('family') or
        'Inter'
    )
    body_font = (
        typography.get('body_font') or
        (typography.get('body_text') or {}).get('family') or
        (typography.get('body') or {}).get('family') or
        (typography.get('paragraph') or {}).get('family') or
        'Inter'
    )

    logger.debug(f"[FONTS] Extracted: hero={hero_font}, body={body_font}")
    return (hero_font, body_font)


def _get_luminance(hex_color: str) -> float:
    """Calculate relative luminance of a hex color (0.0 = black, 1.0 = white)."""
    try:
        hex_color = hex_color.lstrip('#')
        if len(hex_color) == 3:
            hex_color = ''.join(c * 2 for c in hex_color)

        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0

        # Apply gamma correction
        r = r / 12.92 if r <= 0.03928 else ((r + 0.055) / 1.055) ** 2.4
        g = g / 12.92 if g <= 0.03928 else ((g + 0.055) / 1.055) ** 2.4
        b = b / 12.92 if b <= 0.03928 else ((b + 0.055) / 1.055) ** 2.4

        return 0.2126 * r + 0.7152 * g + 0.0722 * b
    except Exception:
        return 0.5  # Default to middle if parsing fails


def _extract_logo_from_theme(theme: Dict[str, Any], background_color: Optional[str] = None) -> tuple[Optional[str], bool]:
    """
    Extract logo URL from theme dict, selecting light/dark variant based on background.

    Handles multiple possible structures:
    - theme.brandInfo.logoUrl / logoUrlDark
    - theme.color_palette.metadata.logo_url / logo_url_dark / logo_url_light
    - theme.logo.url
    - theme.logo (direct URL string)

    Args:
        theme: Theme dictionary
        background_color: Optional hex color of the background (e.g. "#FFFFFF")
                         Used to select light vs dark logo variant

    Returns:
        Tuple of (logo_url, needs_inversion):
        - logo_url: Best logo URL for the background, or None if not found
        - needs_inversion: True if CSS filter:invert(1) should be applied for contrast
    """
    if not theme:
        logger.debug("[LOGO] No theme dict provided")
        return None, False

    # Log theme structure for debugging logo extraction
    logger.info(f"[LOGO] Checking theme for logo - keys: {list(theme.keys())}")
    if theme.get('brandInfo'):
        logger.info(f"[LOGO] brandInfo keys: {list(theme['brandInfo'].keys()) if isinstance(theme.get('brandInfo'), dict) else 'not a dict'}")
    if theme.get('color_palette', {}).get('metadata'):
        logger.info(f"[LOGO] color_palette.metadata keys: {list(theme['color_palette']['metadata'].keys())}")

    # IMPORTANT: Logo naming convention from Brandfetch:
    # - "logo_for_light_bg" = logo designed FOR light backgrounds = typically DARK colored
    # - "logo_for_dark_bg" = logo designed FOR dark backgrounds = typically LIGHT/WHITE colored
    logo_for_light_bg = None  # Dark colored logo, use on light backgrounds
    logo_for_dark_bg = None   # Light/white colored logo, use on dark backgrounds

    # Try brandInfo.logoUrl / logoUrlDark (from frontend)
    # Note: logoUrl = logo FOR light backgrounds (dark colored)
    #       logoUrlDark = logo FOR dark backgrounds (light colored) - confusing name!
    brand_info = theme.get('brandInfo', {})
    if isinstance(brand_info, dict):
        logo_for_light_bg = brand_info.get('logoUrl') or brand_info.get('logoUrlLight')
        logo_for_dark_bg = brand_info.get('logoUrlDark')
        if logo_for_light_bg or logo_for_dark_bg:
            logger.debug(f"[LOGO] Found in brandInfo - for_light_bg: {bool(logo_for_light_bg)}, for_dark_bg: {bool(logo_for_dark_bg)}")

    # Try color_palette.metadata.logo_url_light / logo_url_dark
    if not logo_for_light_bg and not logo_for_dark_bg:
        color_palette = theme.get('color_palette', {})
        if isinstance(color_palette, dict):
            metadata = color_palette.get('metadata', {})
            if isinstance(metadata, dict):
                logo_for_light_bg = metadata.get('logo_url_light') or metadata.get('logo_url')
                logo_for_dark_bg = metadata.get('logo_url_dark')
                if logo_for_light_bg or logo_for_dark_bg:
                    logger.debug(f"[LOGO] Found in color_palette.metadata - for_light_bg: {bool(logo_for_light_bg)}, for_dark_bg: {bool(logo_for_dark_bg)}")

    # Try theme.logo.url or theme.logo (direct string) - assume it's for light backgrounds
    if not logo_for_light_bg and not logo_for_dark_bg:
        logo = theme.get('logo')
        if isinstance(logo, dict):
            logo_for_light_bg = logo.get('url')
        elif isinstance(logo, str) and logo.startswith('http'):
            logo_for_light_bg = logo
        if logo_for_light_bg:
            logger.debug(f"[LOGO] Found direct logo URL (assuming for light backgrounds)")

    # If no logos found at all
    if not logo_for_light_bg and not logo_for_dark_bg:
        logger.debug("[LOGO] No logo URL found in theme")
        return None, False

    # Determine background luminance if provided
    bg_is_light = True  # Default assumption
    if background_color:
        luminance = _get_luminance(background_color)
        bg_is_light = luminance > 0.5
        logger.info(f"[LOGO] Background {background_color} has luminance {luminance:.2f} ({'light' if bg_is_light else 'dark'})")

    # If only one variant available, use it but INVERT if needed for contrast
    if logo_for_light_bg and not logo_for_dark_bg:
        # We have logo for light backgrounds (dark colored logo)
        # If background is DARK, we need to INVERT to make it light/white
        needs_invert = not bg_is_light if background_color else False
        if needs_invert:
            logger.info(f"[LOGO] Only dark logo available but bg is dark -> will INVERT")
        logger.debug(f"[LOGO] Using 'for light bg' variant: {logo_for_light_bg[:60]}... (invert={needs_invert})")
        return logo_for_light_bg, needs_invert

    if logo_for_dark_bg and not logo_for_light_bg:
        # We have logo for dark backgrounds (light/white colored logo)
        # If background is LIGHT, we need to INVERT to make it dark
        needs_invert = bg_is_light if background_color else False
        if needs_invert:
            logger.info(f"[LOGO] Only light logo available but bg is light -> will INVERT")
        logger.debug(f"[LOGO] Using 'for dark bg' variant: {logo_for_dark_bg[:60]}... (invert={needs_invert})")
        return logo_for_dark_bg, needs_invert

    # Both variants available - select based on background luminance (no inversion needed)
    if bg_is_light:
        # Light background - use the logo designed FOR light backgrounds (dark colored logo)
        selected = logo_for_light_bg
        logger.info(f"[LOGO] Light background -> using logo FOR light bg (dark colored)")
    else:
        # Dark background - use the logo designed FOR dark backgrounds (light colored logo)
        selected = logo_for_dark_bg
        logger.info(f"[LOGO] Dark background -> using logo FOR dark bg (light colored)")

    if selected:
        logger.debug(f"[LOGO] Selected: {selected[:60]}... (no inversion needed)")
        return selected, False

    # Fallback: prefer logo for light backgrounds
    selected = logo_for_light_bg or logo_for_dark_bg
    logger.debug(f"[LOGO] Fallback to: {selected[:60] if selected else 'None'}...")
    return selected, False


class CustomComponentGenerator:
    """
    Generates creative CustomComponents using Gemini 3 Pro (with Opus 4.5 fallback).

    This generator creates visually impressive HTML/CSS/JS components that:
    - Match the presentation theme
    - Visualize content in engaging ways
    - Use modern web design patterns
    - Include animations and interactivity

    Falls back to Claude Opus 4.5 if Gemini rate limits are hit.
    """

    def __init__(self, model: str = CUSTOM_COMPONENT_MODEL):
        self.model = model
        self.temperature = CUSTOM_COMPONENT_TEMPERATURE
        self.generation_timeout = 120.0

    async def generate(
        self,
        content: str,
        theme: Dict[str, Any],
        slide_context: Dict[str, Any],
        component_purpose: str = "visualize",
        width: int = 1760,
        height: int = 700,
        position: Dict[str, int] = None,
        external_media: Optional[Dict[str, Any]] = None,
        uploaded_media: Optional[list] = None,
        prefetched_images: Optional[Dict[str, str]] = None,
        auto_prefetch: bool = True,
        reference_images: Optional[List[str]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a creative CustomComponent.

        Args:
            content: The content to visualize/present
            theme: Theme dict with colors, fonts, style
            slide_context: Context about the slide (title, index, total, type)
            component_purpose: What the component should do (visualize, explain, emphasize, engage)
            width: Component width in pixels
            height: Component height in pixels
            position: Optional dict with x, y coordinates
            external_media: Optional dict with media from external sources (Firecrawl):
                - 'images': List of image URLs
                - 'gifs': List of GIF URLs
                - 'source_url': The source website
                - 'markdown': Content extracted from the site
            uploaded_media: Optional list of user-uploaded files (taggedMedia):
                - Each item has: id, filename, type, content (base64), previewUrl, interpretation
                - Types: 'image' (photos/graphics), 'drawing' (mockups/sketches), 'data' (charts/tables)
                - For drawings: use as design reference, don't place directly
                - For photos: can be placed as images on the slide
            prefetched_images: Optional dict of {propName: imageUrl} pre-fetched images
            auto_prefetch: If True and no prefetched_images, automatically fetch images
            reference_images: Optional list of design reference image URLs (e.g., PPT screenshots)
                - These are NOT for placing on the slide
                - AI should analyze these to match the design style, layout, and visual patterns

        Returns:
            CustomComponent dict with type, props, position, etc.
        """
        if not ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN:
            logger.info("Dedicated CustomComponent generation disabled")
            return None

        start_time = datetime.now()

        try:
            # If the user uploaded images during conversational onboarding (taggedMedia),
            # treat them as design reference images by default so the model can SEE them.
            if (not reference_images) and uploaded_media:
                reference_images = _reference_images_from_uploaded_media(uploaded_media) or None

            # Extract theme information
            colors = theme.get('color_palette', {})
            typography = theme.get('typography', {})
            style_keywords = theme.get('style_keywords', [])

            # Debug: Log what typography we received
            logger.info(f"[CUSTOM_COMPONENT] Theme typography keys: {list(typography.keys()) if typography else 'None'}")
            print(f"[CUSTOM_COMPONENT] 🎨 Theme typography: {list(typography.keys()) if typography else 'EMPTY'}")
            if typography:
                # Show nested structure if present
                for key in ['hero_title', 'body_text', 'hero_font', 'body_font']:
                    if key in typography:
                        val = typography[key]
                        if isinstance(val, dict):
                            print(f"[CUSTOM_COMPONENT]   {key}: {val.get('family', 'no family')}")
                        else:
                            print(f"[CUSTOM_COMPONENT]   {key}: {val}")

            # PRE-FETCH IMAGES if not already provided and auto_prefetch enabled
            # Note: We now prefetch for ALL slides including title slides because
            # Gemini often generates HTML with images even for title/cover slides
            slide_title = slide_context.get('title', '')

            # Debug: Log why prefetch might be skipped
            logger.info(f"[CUSTOM_COMPONENT] Prefetch check: prefetched={bool(prefetched_images)}, auto_prefetch={auto_prefetch}, external_media={bool(external_media)}")
            print(f"[CUSTOM_COMPONENT] 🔍 Prefetch check: prefetched={bool(prefetched_images)}, auto={auto_prefetch}, ext_media={bool(external_media)}")

            # ALWAYS prefetch if we don't have images, regardless of external_media
            # (external_media may exist but be empty, and we still need images)
            if not prefetched_images and auto_prefetch:
                logger.info("[CUSTOM_COMPONENT] Auto-prefetching images for content...")
                print("[CUSTOM_COMPONENT] 🔍 Pre-fetching images before generation...")
                try:
                    prefetched_images = await prefetch_images_for_content(
                        content=content,
                        slide_title=slide_title,
                        max_images=8,  # Only for specific named entities (Pokémon, people, products)
                        slide_context=slide_context,  # Pass full context for smarter search terms!
                        theme=theme  # Pass theme for Brandfetch logos and context
                    )
                    if prefetched_images:
                        logger.info(f"[CUSTOM_COMPONENT] Pre-fetched {len(prefetched_images)} images")
                        print(f"[CUSTOM_COMPONENT] ✅ Pre-fetched {len(prefetched_images)} images: {list(prefetched_images.keys())}")
                    else:
                        logger.warning("[CUSTOM_COMPONENT] Prefetch returned empty/None!")
                        print("[CUSTOM_COMPONENT] ⚠️ Prefetch returned empty - no images found")
                except Exception as e:
                    logger.error(f"[CUSTOM_COMPONENT] Image prefetch EXCEPTION: {e}", exc_info=True)
                    print(f"[CUSTOM_COMPONENT] ❌ Prefetch exception: {e}")
                    prefetched_images = {}

            # CRITICAL: Convert external_media images to prefetched_images format for injection
            # This ensures images from Firecrawl/external sources are also injected into HTML
            if not prefetched_images and external_media:
                external_images = external_media.get('images', [])
                if external_images:
                    logger.info(f"[CUSTOM_COMPONENT] Converting {len(external_images)} external_media images for injection")
                    print(f"[CUSTOM_COMPONENT] 📸 Using {len(external_images)} images from external_media for injection")
                    prefetched_images = {}
                    for i, img_url in enumerate(external_images[:5], 1):  # Max 5 images
                        prefetched_images[f"image{i}"] = img_url
                        prefetched_images[f"image{i}_query"] = "external media"
                    print(f"[CUSTOM_COMPONENT] ✅ Converted external images: {list(prefetched_images.keys())}")
                else:
                    # external_media exists but has no images - try auto-prefetch as fallback
                    logger.info("[CUSTOM_COMPONENT] external_media has no images, trying auto-prefetch...")
                    print("[CUSTOM_COMPONENT] ⚠️ external_media has no images, falling back to auto-prefetch...")
                    try:
                        prefetched_images = await prefetch_images_for_content(
                            content=content,
                            slide_title=slide_title,
                            max_images=8,  # Only for specific named entities
                            slide_context=slide_context,  # Pass full context for smarter search terms!
                            theme=theme  # Pass theme for Brandfetch logos and context
                        )
                        if prefetched_images:
                            print(f"[CUSTOM_COMPONENT] ✅ Fallback prefetch got {len(prefetched_images)} images")
                    except Exception as e:
                        logger.warning(f"[CUSTOM_COMPONENT] Fallback prefetch failed: {e}")
                        prefetched_images = {}

            # Detect if this is a title slide
            is_title_slide = self._is_title_slide(slide_context)

            # Get slide_mode from context: 'interactive' (NextGen) or 'static' (Traditional PPT)
            slide_mode = slide_context.get('slide_mode', 'interactive')
            is_educational = slide_context.get('is_educational', False)
            mode_desc = 'Traditional PPT' if slide_mode == 'static' else ('NextGen Educational' if is_educational else 'NextGen Interactive')
            logger.info(f"[CUSTOM_COMPONENT] 🎛️ Mode: {slide_mode} ({mode_desc})")
            print(f"[CUSTOM_COMPONENT] 🎛️ Mode: {slide_mode} ({mode_desc})")

            # Extract logo URL from theme - pass background color for light/dark selection
            background_color = colors.get('primary_background') or colors.get('primary_bg') or colors.get('backgrounds', [None])[0]
            logo_url, logo_needs_invert = _extract_logo_from_theme(theme, background_color=background_color)
            if logo_url:
                invert_msg = " [WILL INVERT]" if logo_needs_invert else ""
                logger.info(f"[CUSTOM_COMPONENT] 🖼️ Logo URL found: {logo_url[:60]}...{invert_msg}")
                print(f"[CUSTOM_COMPONENT] 🖼️ Logo: {logo_url[:60]}... (bg: {background_color}){invert_msg}")
            else:
                logger.debug("[CUSTOM_COMPONENT] No logo URL in theme")

            # Build the system prompt (specialized for title slides)
            if is_title_slide:
                system_prompt = self._build_title_slide_system_prompt(colors, typography, style_keywords, logo_url, slide_mode, logo_needs_invert)
            else:
                system_prompt = self._build_system_prompt(colors, typography, style_keywords, slide_mode, logo_url, logo_needs_invert, is_educational)

            # Build the user prompt with full context
            if is_title_slide:
                user_prompt = self._build_title_slide_user_prompt(
                    content=content,
                    slide_context=slide_context,
                    colors=colors,
                    typography=typography,
                    width=width,
                    height=height,
                    logo_url=logo_url,
                    logo_needs_invert=logo_needs_invert
                )
            else:
                user_prompt = self._build_user_prompt(
                    content=content,
                    slide_context=slide_context,
                    component_purpose=component_purpose,
                    colors=colors,
                    typography=typography,
                    width=width,
                    height=height,
                    external_media=external_media,
                    uploaded_media=uploaded_media,
                    prefetched_images=prefetched_images,
                    reference_images=reference_images,
                    logo_url=logo_url,
                    logo_needs_invert=logo_needs_invert
                )

            # Get client and generate
            client, model_name = get_client(self.model)

            logger.info(f"[CUSTOM_COMPONENT] Generating with {model_name}...")
            logger.info(f"[CUSTOM_COMPONENT] Content preview: {content[:100]}...")

            # Create messages - potentially multimodal if reference images provided
            user_content = user_prompt

            # If reference images are provided, make the user message multimodal
            # so Gemini can actually SEE the design references
            if reference_images and len(reference_images) > 0:
                import requests
                import base64 as b64_module

                user_content_parts = []

                # Add instruction about the reference images
                user_content_parts.append({
                    "type": "text",
                    "text": "🎨 DESIGN REFERENCE - Study these images and extract everything relevant to create beautiful slides:\n- Colors, fonts, spacing, layout structure\n- How they use imagery, icons, visual hierarchy\n- Their design personality and brand feel\n- Any patterns, textures, or stylistic choices\nUse whatever you find most useful to make the output stunning.\n"
                })

                # Process each reference image (limit to 3)
                for idx, img_url in enumerate(reference_images[:3]):
                    try:
                        # Handle data URLs (base64 encoded images)
                        if img_url.startswith('data:'):
                            # Parse data URL: data:image/png;base64,XXXXX
                            import re
                            match = re.match(r'data:([^;]+);base64,(.+)', img_url)
                            if match:
                                media_type = match.group(1)
                                img_b64 = match.group(2)
                                user_content_parts.append({
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": img_b64
                                    }
                                })
                                user_content_parts.append({
                                    "type": "text",
                                    "text": f"[Design Reference {idx + 1} - MATCH THIS STYLE EXACTLY]"
                                })
                                logger.info(f"[CUSTOM_COMPONENT] ✅ Added base64 reference image {idx + 1}")
                            else:
                                logger.warning(f"[CUSTOM_COMPONENT] Invalid data URL format for reference {idx + 1}")
                        else:
                            # Handle regular URLs - download and encode
                            resp = requests.get(img_url, timeout=10)
                            if resp.status_code == 200:
                                img_b64 = b64_module.b64encode(resp.content).decode('utf-8')
                                # Determine media type from content-type header or URL
                                content_type = resp.headers.get('content-type', 'image/png')
                                if 'jpeg' in content_type or 'jpg' in content_type:
                                    media_type = 'image/jpeg'
                                elif 'gif' in content_type:
                                    media_type = 'image/gif'
                                elif 'webp' in content_type:
                                    media_type = 'image/webp'
                                else:
                                    media_type = 'image/png'

                                user_content_parts.append({
                                    "type": "image",
                                    "source": {
                                        "type": "base64",
                                        "media_type": media_type,
                                        "data": img_b64
                                    }
                                })
                                user_content_parts.append({
                                    "type": "text",
                                    "text": f"[Design Reference {idx + 1} - MATCH THIS STYLE EXACTLY]"
                                })
                                logger.info(f"[CUSTOM_COMPONENT] ✅ Added URL reference image {idx + 1}: {img_url[:60]}...")
                    except Exception as e:
                        logger.warning(f"[CUSTOM_COMPONENT] Failed to load reference image {img_url[:50]}: {e}")

                # Add the main prompt text
                user_content_parts.append({
                    "type": "text",
                    "text": user_prompt
                })

                user_content = user_content_parts
                logger.info(f"[CUSTOM_COMPONENT] Created multimodal message with {len([p for p in user_content_parts if p.get('type') == 'image'])} images")

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ]

            # Generate using AI model (no structured output - we want raw HTML)
            print(f"[CUSTOM_COMPONENT] 📝 Prompt length: system={len(system_prompt)}, user={len(user_prompt)}")

            loop = asyncio.get_event_loop()
            response = None
            used_fallback = False

            # Check if Gemini is in cooldown - if so, skip directly to fallback
            use_fallback_directly = is_provider_in_cooldown(GEMINI_PROVIDER)

            if use_fallback_directly:
                logger.info(f"[CUSTOM_COMPONENT] Gemini in cooldown, using fallback: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                print(f"[CUSTOM_COMPONENT] ⏭️ Gemini in cooldown, using {CUSTOM_COMPONENT_FALLBACK_MODEL} directly")
                active_client, active_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                used_fallback = True
            else:
                active_client, active_model = client, model_name

            logger.info(f"[CUSTOM_COMPONENT] Calling {active_model} with temperature={self.temperature}")
            print(f"[CUSTOM_COMPONENT] 🎨 Using model: {active_model}")

            async with _AI_SEMAPHORE:
                try:
                    response = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            invoke,
                            active_client,
                            active_model,
                            messages,
                            None,  # No response model - raw text
                            16000,  # max_tokens
                            self.temperature
                        ),
                        timeout=self.generation_timeout
                    )
                except AIRateLimitError as rate_err:
                    # If this was Gemini, mark cooldown and immediately try fallback
                    if not used_fallback:
                        mark_provider_rate_limited(GEMINI_PROVIDER)
                        logger.warning(f"[CUSTOM_COMPONENT] Gemini rate limited, immediately switching to {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                        print(f"[CUSTOM_COMPONENT] 🔄 Gemini rate limited! Switching to {CUSTOM_COMPONENT_FALLBACK_MODEL}")

                        try:
                            fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                            response = await asyncio.wait_for(
                                loop.run_in_executor(
                                    None,
                                    invoke,
                                    fallback_client,
                                    fallback_model,
                                    messages,
                                    None,  # No response model - raw text
                                    16000,  # max_tokens
                                    self.temperature
                                ),
                                timeout=self.generation_timeout
                            )
                            used_fallback = True
                            logger.info(f"[CUSTOM_COMPONENT] Fallback to {CUSTOM_COMPONENT_FALLBACK_MODEL} succeeded")
                            print(f"[CUSTOM_COMPONENT] ✅ Fallback succeeded!")
                        except Exception as fallback_err:
                            logger.error(f"[CUSTOM_COMPONENT] Fallback also failed: {fallback_err}")
                            print(f"[CUSTOM_COMPONENT] ❌ Fallback also failed: {fallback_err}")
                            raise rate_err
                    else:
                        # Fallback model also rate limited - nothing we can do
                        raise
                except Exception as invoke_error:
                    logger.error(f"[CUSTOM_COMPONENT] Invoke failed: {invoke_error}")
                    print(f"[CUSTOM_COMPONENT] ❌ Invoke failed: {invoke_error}")

                    # Check if this is a timeout or server error - both should trigger fallback
                    error_str = str(invoke_error).lower()
                    is_timeout = isinstance(invoke_error, (TimeoutError, asyncio.TimeoutError))
                    is_server_error = any(x in error_str for x in ['503', '500', '502', '504', 'unavailable', 'overloaded', 'server error'])
                    should_fallback = (is_timeout or is_server_error) and not used_fallback

                    if should_fallback:
                        error_type = "timeout" if is_timeout else "server error"
                        logger.warning(f"[CUSTOM_COMPONENT] {error_type.title()} detected, switching to fallback: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                        print(f"[CUSTOM_COMPONENT] 🔄 {error_type.title()}! Switching to {CUSTOM_COMPONENT_FALLBACK_MODEL}")

                        try:
                            fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                            response = await asyncio.wait_for(
                                loop.run_in_executor(
                                    None,
                                    invoke,
                                    fallback_client,
                                    fallback_model,
                                    messages,
                                    None,  # No response model - raw text
                                    16000,  # max_tokens
                                    self.temperature
                                ),
                                timeout=self.generation_timeout
                            )
                            used_fallback = True
                            logger.info(f"[CUSTOM_COMPONENT] Fallback to {CUSTOM_COMPONENT_FALLBACK_MODEL} succeeded after {error_type}")
                            print(f"[CUSTOM_COMPONENT] ✅ Fallback succeeded!")
                        except Exception as fallback_err:
                            logger.error(f"[CUSTOM_COMPONENT] Fallback also failed: {fallback_err}")
                            print(f"[CUSTOM_COMPONENT] ❌ Fallback also failed: {fallback_err}")
                            import traceback
                            traceback.print_exc()
                            raise invoke_error
                    else:
                        import traceback
                        traceback.print_exc()
                        raise

            # Check for None/empty response from Gemini - fallback if needed
            if (response is None or (isinstance(response, str) and len(response.strip()) < 100)) and not used_fallback:
                logger.warning(f"[CUSTOM_COMPONENT] Empty/None response from {active_model}, switching to fallback: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
                print(f"[CUSTOM_COMPONENT] 🔄 Empty response! Switching to {CUSTOM_COMPONENT_FALLBACK_MODEL}")

                try:
                    fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                    response = await asyncio.wait_for(
                        loop.run_in_executor(
                            None,
                            invoke,
                            fallback_client,
                            fallback_model,
                            messages,
                            None,  # No response model - raw text
                            16000,  # max_tokens
                            self.temperature
                        ),
                        timeout=self.generation_timeout
                    )
                    used_fallback = True
                    logger.info(f"[CUSTOM_COMPONENT] Fallback to {CUSTOM_COMPONENT_FALLBACK_MODEL} succeeded after empty response")
                    print(f"[CUSTOM_COMPONENT] ✅ Fallback succeeded!")
                except Exception as fallback_err:
                    logger.error(f"[CUSTOM_COMPONENT] Fallback also failed: {fallback_err}")
                    print(f"[CUSTOM_COMPONENT] ❌ Fallback also failed: {fallback_err}")

            if used_fallback:
                print(f"[CUSTOM_COMPONENT] 📊 Used fallback model (Opus 4.5) for this generation")

            logger.info(f"[CUSTOM_COMPONENT] Got response: {type(response)}, length: {len(str(response)) if response else 0}")
            print(f"[CUSTOM_COMPONENT] ✅ Got response: {type(response)}, length: {len(str(response)) if response else 0}")
            if response:
                response_str = str(response)
                # Check if response has literal \n (escaped) vs actual newlines
                has_escaped = '\\n' in response_str
                has_actual = '\n' in response_str
                print(f"[CUSTOM_COMPONENT] 🔍 Response check: escaped_newlines={has_escaped}, actual_newlines={has_actual}")
                print(f"[CUSTOM_COMPONENT] 📄 Response preview (repr): {repr(response_str[:300])}")

            # Extract HTML from response
            html_content = self._extract_html(response)

            if not html_content:
                logger.warning("[CUSTOM_COMPONENT] Failed to extract HTML from response")
                print(f"[CUSTOM_COMPONENT] ❌ HTML extraction failed!")
                print(f"[CUSTOM_COMPONENT] 📄 Full response for debugging: {str(response)[:2000]}")
                return None

            print(f"[CUSTOM_COMPONENT] ✅ HTML extracted: {len(html_content)} chars")

            # GUARANTEED IMAGE INJECTION - Post-process HTML to inject real URLs
            # This runs AFTER generation to ensure images appear regardless of what AI generated
            print(f"[CUSTOM_COMPONENT] 🔍 Checking for image injection: prefetched_images={'available with ' + str(len(prefetched_images)) + ' keys' if prefetched_images else 'NONE'}")

            # Check if HTML has placeholders that need injection
            has_placeholders = 'placeholder' in html_content.lower() or '${' in html_content or 'src=""' in html_content
            if has_placeholders:
                print(f"[CUSTOM_COMPONENT] ⚠️ HTML has placeholders that need injection!")

            if prefetched_images:
                print(f"[CUSTOM_COMPONENT] 🔧 Running image injection with keys: {list(prefetched_images.keys())}")
                html_content = self._inject_prefetched_images_into_html(html_content, prefetched_images)
            elif has_placeholders:
                print(f"[CUSTOM_COMPONENT] ❌ NO IMAGES TO INJECT but HTML has placeholders!")

            # CRITICAL FALLBACK: Upload any external URLs still in HTML to our bucket
            # This catches cases where prefetch failed or AI generated unexpected URLs
            html_content = await self._upload_external_urls_to_bucket(html_content)

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"[CUSTOM_COMPONENT] Generated in {elapsed:.1f}s ({len(html_content)} chars)")

            # Build the component
            # Include prefetched images in props.props so frontend can inject them
            # Filter out the _query hints - only include actual image URLs
            image_props = {k: v for k, v in (prefetched_images or {}).items() if not k.endswith('_query')}
            if image_props:
                logger.info(f"[CUSTOM_COMPONENT] Including {len(image_props)} prefetched images in component props")
                print(f"[CUSTOM_COMPONENT] 📸 Storing {len(image_props)} image URLs in props: {list(image_props.keys())}")

            # Add logo to props if available
            if logo_url:
                image_props['logoUrl'] = logo_url
                logger.info(f"[CUSTOM_COMPONENT] Including logo URL in component props")
                print(f"[CUSTOM_COMPONENT] 🖼️ Storing logo URL in props")

            # Extract fonts using the helper
            hero_font, body_font = _extract_fonts_from_typography(typography)
            logger.info(f"[CUSTOM_COMPONENT] Using fonts: hero={hero_font}, body={body_font}")
            print(f"[CUSTOM_COMPONENT] 🔤 Fonts: hero={hero_font}, body={body_font}")

            component = {
                "id": f"custom-{datetime.now().strftime('%H%M%S%f')}",
                "type": "CustomComponent",
                "props": {
                    "render": html_content,
                    "width": width,
                    "height": height,
                    "primaryColor": colors.get('accent_1', '#6366f1'),
                    "secondaryColor": colors.get('accent_2', colors.get('accent_1', '#8b5cf6')),
                    "textColor": colors.get('primary_text', '#ffffff'),
                    "fontFamily": body_font,
                    "heroFont": hero_font,
                    "logoUrl": logo_url,  # Store logo URL directly in props
                    # Store prefetched images - frontend will inject these into ${propName} placeholders
                    "props": image_props
                },
                "position": position or {"x": 80, "y": 240},
                "width": width,
                "height": height
            }

            return component

        except asyncio.TimeoutError:
            # This only triggers if BOTH primary AND fallback timed out
            logger.error(f"[CUSTOM_COMPONENT] Generation timed out after {self.generation_timeout}s (including fallback attempt)")
            print(f"[CUSTOM_COMPONENT] ❌ Both primary and fallback models timed out")
            return None
        except Exception as e:
            # This only triggers if BOTH primary AND fallback failed
            logger.error(f"[CUSTOM_COMPONENT] Generation failed (including fallback): {e}")
            print(f"[CUSTOM_COMPONENT] ❌ Both primary and fallback models failed: {e}")
            return None

    def _build_system_prompt(
        self,
        colors: Dict[str, str],
        typography: Dict[str, str],
        style_keywords: list,
        slide_mode: str = 'interactive',
        logo_url: Optional[str] = None,
        logo_needs_invert: bool = False,
        is_educational: bool = False
    ) -> str:
        """Build the system prompt for CustomComponent generation."""

        style_desc = ", ".join(style_keywords) if style_keywords else "modern, professional"

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        # Logo instructions if available
        logo_info = ""
        if logo_url:
            if logo_needs_invert:
                logo_info = f"\nLOGO: Available at props.logoUrl - place in corner or header. IMPORTANT: Apply CSS filter: invert(1) to the logo img for proper contrast against the background!"
            else:
                logo_info = f"\nLOGO: Available at props.logoUrl - place in corner or header when appropriate"

        # Base theme info (same for all modes)
        theme_info = f"""THEME: --accent: {accent}; --secondary: {secondary}; --text: {text_color}; --bg: {bg_color}
FONTS: {hero_font} / {body_font}

IMAGE PHILOSOPHY - LESS IS MORE:
- Use images ONLY for SPECIFIC things (named people, products, characters, places)
- Do NOT use images for abstract concepts (innovation, growth, teamwork, success)
- Prefer: bold typography, icons, shapes, gradients, data visualizations
- Generic stock photos make slides look cheap - avoid them!
- If you must use an image, use ONLY the exact URLs provided (never unsplash/pexels){logo_info}"""

        if slide_mode == 'static':
            # Traditional PPT - beautiful, clean, professional (static but elegant with entrance animations)
            return f"""You create stunning presentation slides like Apple Keynote or premium PowerPoint templates.
THIS IS TRADITIONAL MODE - designed to be STILL and BEAUTIFUL like a premium PPTX.

{theme_info}

DESIGN PRINCIPLES:
- Bold, impactful typography (titles 56-80px, big hero numbers)
- Generous whitespace, elegant layouts
- Beautiful charts and data visualizations (bar, pie, donut) - drawn with pure HTML/CSS
- Clean iconography (SVG icons, emoji, CSS shapes) - NOT stock photos
- Professional color usage with gradients and accent highlights
- Clean visual hierarchy - let typography do the heavy lifting
- Everything FULLY VISIBLE after entrance - no interaction needed to see content

Z-INDEX LAYERING (CRITICAL - titles must ALWAYS be visible):
- Background/decorative elements: z-index: 1-10
- Images and media: z-index: 20-30
- Content boxes/cards: z-index: 40-50
- TITLES AND HEADINGS: z-index: 100+ (ALWAYS on top)

CONTENT STYLE:
- BIG stats and numbers displayed prominently ("87%", "$2.4M", "+42%") - show FINAL values immediately
- Minimal text - let typography and layout tell the story
- Short punchy bullet points (max 5-7 words each)
- Icons paired with key points (use SVG/emoji, not photos)
- CSS shapes, gradients, and geometric patterns for visual interest

✅ ALLOWED - Elegant entrance animations ONLY:
- fadeIn: @keyframes fadeIn {{ from {{ opacity: 0; }} to {{ opacity: 1; }} }}
- slideInFromBottom: @keyframes slideIn {{ from {{ opacity: 0; transform: translateY(30px); }} to {{ opacity: 1; transform: translateY(0); }} }}
- slideInFromLeft/Right: similar with translateX
- Use animation-fill-mode: forwards so elements stay visible
- Stagger entrance delays for polish: animation-delay: 0.1s, 0.2s, 0.3s...
- Keep animations SHORT: 0.4s-0.8s duration, ease-out timing

⛔ STRICTLY FORBIDDEN:
- NO <script> tags or JavaScript
- NO onclick, onmouseover, onload, or ANY event handlers
- NO hover effects (:hover pseudo-class) - no interaction required
- NO interactive elements (quizzes, accordions, sliders, expandable sections)
- NO animated counters or counting-up numbers - show FINAL values immediately
- NO looping/infinite animations - entrance only, then STILL
- NO transitions on user interaction (transition property with :hover/:focus)
- NO elements hidden until clicked/hovered

Think: Premium consulting deck, investor pitch, executive presentation.
The slide should look complete and professional even as a static screenshot.
Every slide should be screenshot-worthy and PPTX-export ready.

OUTPUT: Complete HTML/CSS starting with <!DOCTYPE html>"""

        else:  # interactive (default) - NextGen with FULL CREATIVE POWER
            # Special educational mode - teaching-focused interactive components
            educational_section = ""
            if is_educational:
                educational_section = """
📚 EDUCATIONAL MODE - TEACHING-FOCUSED COMPONENTS:
This is educational content! Create LEARNING experiences, not just presentations.

TEACHING COMPONENTS TO USE:
• Interactive concept explorers - click parts to learn more
• Step-by-step walkthroughs with "Next" buttons
• Knowledge check quizzes with instant feedback
• Flip cards for term/definition pairs
• Drag-and-drop matching exercises
• Fill-in-the-blank activities
• Interactive diagrams with labeled hotspots
• Progress trackers showing what's been learned
• "Try it yourself" interactive examples
• Before/after concept comparisons
• Memory games for reinforcement
• Sortable lists for sequencing lessons

EDUCATIONAL DESIGN PRINCIPLES:
- Break complex concepts into digestible chunks
- Use visual metaphors to explain abstract ideas
- Provide immediate feedback on interactions
- Include "check your understanding" elements
- Make learning feel like play, not work
- Use consistent visual language for navigation

"""

            return f"""You are an elite creative technologist. Build INTERACTIVE experiences that make people say "WOW!"

{theme_info}
{educational_section}
INTERACTIVE ARSENAL - use these:
• Animated diagrams that BUILD on click
• Interactive timelines - click nodes to reveal content
• Quizzes with clickable answers, feedback, confetti
• Animated counters that count up
• Before/after comparison sliders
• Hover-to-reveal cards that flip or expand
• Click-through step-by-step processes
• Expandable accordions
• Drag interactions
• SVG animations that draw themselves

EVERY INTERACTIVE ELEMENT MUST:
- Have working onclick/onmouseover handlers
- DO something visible when clicked/hovered
- Provide satisfying feedback (animations, state changes)
- Be discoverable and intuitive

Z-INDEX LAYERING (CRITICAL - titles must ALWAYS be visible):
- Background/decorative elements: z-index: 1-10
- Images and media: z-index: 20-30
- Content boxes/cards: z-index: 40-50
- TITLES AND HEADINGS: z-index: 100+ (ALWAYS on top)
- Interactive overlays/modals: z-index: 200+

Match the design to content:
- Quote? Beautiful typography, elegant entrance
- Data? Animated counters, interactive charts
- Process? Click-through steps
- Educational? Explorable, clickable, quiz-able

OUTPUT: Complete interactive HTML/CSS/JS starting with <!DOCTYPE html>"""

    def _build_user_prompt(
        self,
        content: str,
        slide_context: Dict[str, Any],
        component_purpose: str,
        colors: Dict[str, str],
        typography: Dict[str, str],
        width: int,
        height: int,
        external_media: Optional[Dict[str, Any]] = None,
        uploaded_media: Optional[list] = None,
        prefetched_images: Optional[Dict[str, str]] = None,
        reference_images: Optional[List[str]] = None,
        logo_url: Optional[str] = None,
        logo_needs_invert: bool = False
    ) -> str:
        """Build the user prompt with full context."""

        slide_title = slide_context.get('title', 'Slide')
        slide_index = slide_context.get('slide_index', 0) + 1
        total_slides = slide_context.get('total_slides', 1)
        slide_type = slide_context.get('slide_type', 'content')
        is_full_slide = slide_context.get('is_full_slide', False)
        background_color = slide_context.get('background_color', colors.get('primary_background', '#0a0e27'))

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = background_color
        hero_font, body_font = _extract_fonts_from_typography(typography)

        # Get presentation context (user's original request) for design cues
        presentation_context = slide_context.get('presentation_context', '')
        vibe_context = slide_context.get('vibe_context', '') or slide_context.get('initial_idea', '')
        industry = slide_context.get('industry', '')
        audience = slide_context.get('audience', '')
        deck_title = slide_context.get('deck_title', '')

        # Full-slide mode instructions
        full_slide_instructions = ""
        if is_full_slide:
            full_slide_instructions = f"""FULL SLIDE: {width}x{height}px - you control everything including background.
Content must fit without scrolling. Use padding ~60-80px from edges.

Font sizes: Title 48-56px, Body 14-16px

"""

        # Build rich design context section with all available context
        design_context_parts = []
        if presentation_context:
            design_context_parts.append(f'Topic: "{presentation_context}"')
        if vibe_context and vibe_context != presentation_context:
            design_context_parts.append(f'Brand/Style: "{vibe_context}"')
        if deck_title and deck_title != slide_title and deck_title != presentation_context:
            design_context_parts.append(f'Deck: "{deck_title}"')
        if industry:
            design_context_parts.append(f'Industry: {industry}')
        if audience:
            design_context_parts.append(f'Audience: {audience}')

        design_context_section = ""
        if design_context_parts:
            design_context_section = f"""
CONTEXT: {' | '.join(design_context_parts)}
"""

        # Build design reference images section (e.g., PPT screenshots to match style)
        design_reference_section = ""
        if reference_images and len(reference_images) > 0:
            # Include ALL reference URLs in text context (even if we only embed the first few as multimodal images)
            ref_urls = "\n".join([f"  - {url[:100]}..." if len(url) > 100 else f"  - {url}" for url in reference_images])
            design_reference_section = f"""
DESIGN REFERENCES (study for inspiration - extract colors, layout, typography, imagery style):
{ref_urls}
"""

        # Build external media section if media URLs were provided (from Firecrawl scraping)
        external_media_section = ""
        if external_media:
            gifs = external_media.get('gifs', [])
            images = external_media.get('images', [])
            source_url = external_media.get('source_url', '')

            media_list = []
            if gifs:
                media_list.append(f"GIFs: " + ", ".join(gifs[:5]))
            if images:
                media_list.append(f"Images: " + ", ".join(images[:5]))

            external_media_section = f"""
EXTERNAL MEDIA (use these URLs directly):
{chr(10).join(media_list)}
"""

        # Build uploaded media section for user-uploaded files
        uploaded_media_section = ""
        if uploaded_media and len(uploaded_media) > 0:
            # Categorize uploaded media
            reference_images = []  # Drawings, mockups, screenshots for design guidance
            photos_to_place = []   # Actual photos/graphics to place on slide
            data_files = []        # Charts, tables, data to extract

            for media in uploaded_media:
                if isinstance(media, dict):
                    filename = media.get('filename', media.get('name', 'file'))
                    media_type = media.get('type', 'image')
                    interpretation = media.get('interpretation', '')
                    content_b64 = media.get('content', '')
                    preview_url = media.get('previewUrl', '')
                    metadata = media.get('metadata', {})
                    source = metadata.get('source', '') if metadata else ''

                    # Detect if it's a reference/drawing vs actual photo
                    is_drawing = any(kw in filename.lower() for kw in ['sketch', 'drawing', 'mockup', 'wireframe', 'draft', 'layout', 'design'])
                    is_screenshot = any(kw in filename.lower() for kw in ['screenshot', 'screen', 'capture'])
                    is_data = media_type in ['data', 'chart'] or any(kw in filename.lower() for kw in ['chart', 'table', 'data', 'csv', 'excel'])

                    if is_data:
                        data_files.append({
                            'filename': filename,
                            'interpretation': interpretation
                        })
                    elif is_drawing or is_screenshot:
                        reference_images.append({
                            'filename': filename,
                            'interpretation': interpretation,
                            'content': content_b64[:100] + '...' if content_b64 else None  # Truncate for prompt
                        })
                    else:
                        # It's a photo/graphic to potentially place on the slide
                        photos_to_place.append({
                            'filename': filename,
                            'interpretation': interpretation,
                            'preview_url': preview_url,
                            'content': content_b64  # Full content for placement
                        })

            # Build the prompt section
            sections = []

            if reference_images:
                refs = "\n".join([f"  - {r['filename']}: {r['interpretation'] or 'No description'}" for r in reference_images])
                sections.append(f"""📐 DESIGN REFERENCES (use as inspiration, DON'T place these directly):
{refs}

These are sketches/mockups/screenshots the user provided as design inspiration.
Use their layout, structure, and style as a GUIDE for your design.""")

            if photos_to_place:
                photos = "\n".join([f"  - {p['filename']}: {p['interpretation'] or 'Photo/graphic'}" for p in photos_to_place])
                sections.append(f"""📷 PHOTOS/GRAPHICS TO INCLUDE (place these on the slide):
{photos}

These are actual images the user wants displayed on this slide.
Include them prominently in your design using the props pattern:
  const image = props.uploadedImage_FILENAME || 'placeholder';
  <img src="${{image}}" ...>""")

            if data_files:
                data = "\n".join([f"  - {d['filename']}: {d['interpretation'] or 'Data file'}" for d in data_files])
                sections.append(f"""📊 DATA TO VISUALIZE (extract and display as charts/tables):
{data}

Create appropriate visualizations (charts, tables, graphs) for this data.""")

            if sections:
                uploaded_media_section = f"""
USER UPLOADS:
{chr(10).join(sections)}
"""

        # Build prefetched images section - these are REAL URLs we've already fetched!
        # CRITICAL: Tell the AI the ACTUAL URLS to use, not props.imageX placeholders
        prefetched_images_section = ""
        if prefetched_images and len(prefetched_images) > 0:
            # Filter to just the image props (not the _query hints)
            image_props = {k: v for k, v in prefetched_images.items() if not k.endswith('_query')}

            if image_props:
                # Build EXPLICIT image assignments with FULL URLs
                image_assignments = []
                for i, prop_name in enumerate(sorted(image_props.keys()), 1):
                    url = image_props[prop_name]
                    query = prefetched_images.get(f"{prop_name}_query", "image")
                    # Give FULL URL, no truncation!
                    image_assignments.append(f'IMAGE_{i} ({query}): src="{url}"')

                image_block = "\n".join(image_assignments)

                prefetched_images_section = f"""
AVAILABLE IMAGES (use ONLY if the slide genuinely needs photos of these specific things):
{image_block}

RULES:
- Only use these if showing a SPECIFIC person/product/character/place
- Do NOT force images into slides about abstract concepts
- If the slide is about data, processes, or ideas - skip images entirely
- Prefer typography, icons, and CSS visuals over stock photos
- If you DO use an image, copy the EXACT URL above (never unsplash/pexels)
"""

        # Build logo section if logo URL is available
        logo_section = ""
        if logo_url:
            # Check for potential white logo on white background issue
            bg_luminance = _get_luminance(bg_color) if bg_color else 0.5
            is_light_bg = bg_luminance > 0.5

            # Detect if logo URL suggests it might be white/light colored
            logo_is_potentially_white = (
                'logo.svg' in logo_url.lower() or
                'logo_light' in logo_url.lower() or
                'for_dark' in logo_url.lower() or
                '_white' in logo_url.lower()
            )

            contrast_warning = ""
            if is_light_bg and logo_is_potentially_white:
                contrast_warning = """ ⚠️ Note: If the logo appears invisible (white on white), apply: filter: invert(1) or add a dark background behind it."""

            logo_section = f"""
BRAND LOGO (include if there's space): {logo_url}
Position: corner placement, 40-60px height, no overlap with content.{contrast_warning}
"""

        # Add tone guidance only if no explicit style hint was provided
        tone_guidance = " Match the content tone." if not design_context_section else ""

        return f"""{full_slide_instructions}SLIDE: "{slide_title}" (Slide {slide_index} of {total_slides})
{design_reference_section}{design_context_section}{external_media_section}{uploaded_media_section}{prefetched_images_section}{logo_section}
CONTENT:
{content}

SIZE: {width}x{height}px

Design something beautiful. You have complete creative freedom.{tone_guidance}
OUTPUT: Complete HTML starting with <!DOCTYPE html>"""

    def _extract_html(self, response: Any) -> Optional[str]:
        """Extract HTML from the AI response."""

        # Handle different response types
        if isinstance(response, str):
            text = response
        elif isinstance(response, dict):
            text = response.get('content', str(response))
        else:
            text = str(response)

        # Pre-validation: check if response is too simple or lacks interactivity
        if self._is_low_quality_output(text):
            return None

        # Try to extract HTML document
        import re

        html_content = None

        # Look for complete HTML document
        html_match = re.search(
            r'<!DOCTYPE html>[\s\S]*?</html>',
            text,
            re.IGNORECASE
        )

        if html_match:
            html_content = html_match.group(0)

        # Try to find just the HTML tag
        if not html_content:
            html_match = re.search(
                r'<html[\s\S]*?</html>',
                text,
                re.IGNORECASE
            )
            if html_match:
                html_content = f"<!DOCTYPE html>\n{html_match.group(0)}"

        # If response looks like it starts with code fence, extract it
        if not html_content and ('```html' in text or '```HTML' in text):
            code_match = re.search(r'```(?:html|HTML)?\s*([\s\S]*?)```', text)
            if code_match:
                content = code_match.group(1).strip()
                if '<html' in content.lower():
                    if not content.lower().startswith('<!doctype'):
                        content = f"<!DOCTYPE html>\n{content}"
                    html_content = content

        # Last resort - if it has body tags, wrap it
        if not html_content and ('<body' in text.lower() or '<div' in text.lower()):
            html_content = self._wrap_in_html(text)

        if not html_content:
            logger.warning("[CUSTOM_COMPONENT] Could not extract valid HTML from response")
            return None

        # Format/clean up the HTML
        html_content = self._format_html(html_content)
        return html_content

    def _inject_prefetched_images_into_html(self, html: str, prefetched_images: Dict[str, str]) -> str:
        """
        GUARANTEED image injection - directly replaces placeholder/variable image sources
        with real URLs from prefetched images.

        This runs AFTER AI generation to ensure images appear regardless of what the AI generated.
        Also replaces external URLs (Unsplash, etc.) that AI might have hardcoded.
        """
        import re

        if not html:
            return html

        # Ensure prefetched_images is at least an empty dict
        prefetched_images = prefetched_images or {}

        # Get only actual image URLs (not the _query hints)
        image_urls = [v for k, v in prefetched_images.items() if not k.endswith('_query') and v.startswith('http')]

        if not image_urls:
            # Even without prefetched images, we should log any external URLs found
            # so we can diagnose issues
            external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', html, flags=re.IGNORECASE)
            if external_matches:
                OUR_BUCKET_DOMAINS = ['nextslide.ai', 'supabase.co', 'supabase.com']
                external_to_replace = [url for url in external_matches if not any(d in url.lower() for d in OUR_BUCKET_DOMAINS)]
                if external_to_replace:
                    logger.warning(f"[IMAGE_INJECT] No prefetched images but found {len(external_to_replace)} external URLs that need replacement!")
                    for url in external_to_replace[:3]:
                        logger.warning(f"[IMAGE_INJECT]   - UNREPLACED: {url[:70]}...")
                    print(f"[IMAGE_INJECT] ⚠️ Found {len(external_to_replace)} external URLs but no images to replace them!")
            return html

        logger.info(f"[IMAGE_INJECT] Starting guaranteed injection with {len(image_urls)} images")
        print(f"[IMAGE_INJECT] 🔧 Injecting {len(image_urls)} real URLs into HTML...")

        result = html
        images_injected = 0
        image_index = 0

        # Our bucket domain - images from here should NOT be replaced
        OUR_BUCKET_DOMAINS = ['nextslide.ai', 'supabase.co', 'supabase.com']

        def is_our_url(url: str) -> bool:
            """Check if URL is from our storage bucket."""
            return any(domain in url.lower() for domain in OUR_BUCKET_DOMAINS)

        # PATTERN 1: Replace ${propName} patterns with real URLs
        # Matches: src="${image1}" or src="${anyPropName}"
        def replace_variable_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            var_name = match.group(2)
            after = match.group(3)

            # Check if we have this exact prop
            prop_key = var_name
            if prop_key in prefetched_images and prefetched_images[prop_key].startswith('http'):
                url = prefetched_images[prop_key]
            elif image_index < len(image_urls):
                # Use next available image
                url = image_urls[image_index]
                image_index += 1
            else:
                # Cycle through images
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced ${{{var_name}}} with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ ${{{var_name}}} -> {url[:40]}...")
            return f'<img {before}src="{url}"{after}>'

        var_pattern = r'<img\s+([^>]*?)src=["\']?\$\{+\s*(\w+)\s*\}+["\']?([^>]*?)>'
        result = re.sub(var_pattern, replace_variable_src, result, flags=re.IGNORECASE)

        # PATTERN 1.5: Replace props.imageX references (e.g., src="props.image1")
        def replace_props_reference(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            prop_name = match.group(2)  # e.g., "image1"
            after = match.group(3)

            # Check if we have this exact prop
            if prop_name in prefetched_images and prefetched_images[prop_name].startswith('http'):
                url = prefetched_images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced props.{prop_name} with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ props.{prop_name} -> {url[:40]}...")
            return f'<img {before}src="{url}"{after}>'

        # Match: src="props.image1" or src='props.image2'
        props_ref_pattern = r'<img\s+([^>]*?)src=["\']props\.(\w+)["\']([^>]*?)>'
        result = re.sub(props_ref_pattern, replace_props_reference, result, flags=re.IGNORECASE)

        # PATTERN 2: Replace empty or placeholder src with real URLs
        # Matches: src="" or src="placeholder" or src='placeholder'
        def replace_placeholder_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            after = match.group(2)

            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced placeholder with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ placeholder -> {url[:40]}...")
            return f'<img {before}src="{url}"{after}>'

        placeholder_pattern = r'<img\s+([^>]*?)src=["\'](?:placeholder|)["\']([^>]*?)>'
        result = re.sub(placeholder_pattern, replace_placeholder_src, result, flags=re.IGNORECASE)

        # PATTERN 2.5: Replace relative/local image paths (image1.jpg, img.png, etc.) with our bucket URLs
        # This catches AI that outputs local file paths expecting them to be replaced
        def replace_local_file_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            local_path = match.group(2)
            after = match.group(3)

            # Get the next available image
            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced local file '{local_path}' with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ LOCAL: {local_path} -> {url[:40]}...")
            return f'<img {before}src="{url}"{after}>'

        # Match img tags with relative paths like image1.jpg, photo.png, img-hero.webp, etc.
        # Excludes: http://, https://, data:, blob:, ${, and our bucket URLs
        local_file_pattern = r'<img\s+([^>]*?)src=["\']([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))["\']([^>]*?)>'
        result = re.sub(local_file_pattern, replace_local_file_src, result, flags=re.IGNORECASE)

        # PATTERN 2.6: Replace local file paths in background-image CSS (e.g., url("image2.jpg"))
        def replace_local_bg_image(match):
            nonlocal images_injected, image_index
            before = match.group(1)  # Everything before the URL (e.g., "background-image: url(")
            local_path = match.group(2)  # The local file path (e.g., "image2.jpg")
            after = match.group(3)  # Everything after (e.g., ")")

            # Get the next available image
            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced local BG file '{local_path}' with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ LOCAL-BG: {local_path} -> {url[:40]}...")
            return f'{before}{url}{after}'

        # Match background-image: url('image.jpg') or url("image.png") - local files only
        local_bg_pattern = r'(background-image:\s*url\([\'"]?)([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))([\'"]?\))'
        result = re.sub(local_bg_pattern, replace_local_bg_image, result, flags=re.IGNORECASE)

        # Also match inline style with local background-image
        inline_local_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'"]?)([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|gif|webp|svg|avif))([\'"]?\)[^"\']*["\'])'
        result = re.sub(inline_local_bg_pattern, replace_local_bg_image, result, flags=re.IGNORECASE)

        # PATTERN 2.7: Replace props.imageX references in background-image CSS
        def replace_props_bg_image(match):
            nonlocal images_injected, image_index
            before = match.group(1)
            prop_name = match.group(2)  # e.g., "image1"
            after = match.group(3)

            # Check if we have this exact prop
            if prop_name in prefetched_images and prefetched_images[prop_name].startswith('http'):
                url = prefetched_images[prop_name]
            elif image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced BG props.{prop_name} with {url[:50]}...")
            print(f"[IMAGE_INJECT] ✅ BG-props.{prop_name} -> {url[:40]}...")
            return f'{before}{url}{after}'

        # Match background-image: url('props.image1') or url("props.image2")
        props_bg_pattern = r'(background-image:\s*url\([\'"]?)props\.(\w+)([\'"]?\))'
        result = re.sub(props_bg_pattern, replace_props_bg_image, result, flags=re.IGNORECASE)

        # Also inline style
        inline_props_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'"]?)props\.(\w+)([\'"]?\)[^"\']*["\'])'
        result = re.sub(inline_props_bg_pattern, replace_props_bg_image, result, flags=re.IGNORECASE)

        # PATTERN 3: Replace EXTERNAL image URLs (Unsplash, Pexels, etc.) with our bucket URLs
        # This catches AI that hardcodes stock photo URLs instead of using props
        def replace_external_img_src(match):
            nonlocal images_injected, image_index
            before = match.group(1)  # attributes before src=
            external_url = match.group(2)  # the URL
            after = match.group(3)  # attributes after src="..."

            # Skip if it's already from our bucket
            if is_our_url(external_url):
                logger.debug(f"[IMAGE_INJECT] Skipping our bucket URL: {external_url[:50]}...")
                return match.group(0)

            # Skip data URLs
            if external_url.startswith('data:'):
                logger.debug(f"[IMAGE_INJECT] Skipping data URL")
                return match.group(0)

            # Check if we have images available
            if not image_urls:
                logger.warning(f"[IMAGE_INJECT] No images available to replace external URL: {external_url[:50]}...")
                return match.group(0)

            # Replace with our prefetched image
            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced external URL {external_url[:40]}... with {url[:40]}...")
            print(f"[IMAGE_INJECT] ✅ EXTERNAL: {external_url[:30]}... -> {url[:30]}...")
            return f'<img {before}src="{url}"{after}>'

        # Match img tags with http/https URLs that are NOT from our bucket
        # DEBUG: Count external URLs before replacement
        external_matches = re.findall(r'<img[^>]+src=["\']?(https?://[^\s"\'>]+)["\']?', result, flags=re.IGNORECASE)
        if external_matches:
            external_to_replace = [url for url in external_matches if not is_our_url(url)]
            logger.info(f"[IMAGE_INJECT] Found {len(external_matches)} URLs in img tags, {len(external_to_replace)} are external")
            for url in external_to_replace[:5]:  # Log first 5 external
                logger.info(f"[IMAGE_INJECT]   - [EXTERNAL] {url[:70]}...")
        else:
            logger.info(f"[IMAGE_INJECT] No URLs found in img tags")

        # Pattern: <img ...before_attrs... src="https://external.url" ...after_attrs...>
        # Groups: (1) attrs before src, (2) URL, (3) attrs after src value
        # NOTE: Pattern must match the structure used in replace function: <img {before}src="{url}"{after}>
        external_url_pattern = r'<img\s+([^>]*?)src=["\']+(https?://[^\s"\'>]+)["\']([^>]*)>'
        result = re.sub(external_url_pattern, replace_external_img_src, result, flags=re.IGNORECASE)

        # PATTERN 4: Replace background-image: url(...) CSS with our bucket URLs
        # This catches divs with background images (Unsplash, etc.)
        def replace_background_image_url(match):
            nonlocal images_injected, image_index
            before = match.group(1)  # Everything before the URL
            external_url = match.group(2)  # The URL itself
            after = match.group(3)  # Everything after the URL

            # Skip if it's already from our bucket
            if is_our_url(external_url):
                return match.group(0)

            # Skip data URLs and gradients
            if external_url.startswith('data:') or external_url.startswith('linear') or external_url.startswith('radial'):
                return match.group(0)

            # Replace with our prefetched image
            if image_index < len(image_urls):
                url = image_urls[image_index]
                image_index += 1
            else:
                url = image_urls[images_injected % len(image_urls)]

            images_injected += 1
            logger.info(f"[IMAGE_INJECT] Replaced background-image URL {external_url[:40]}... with {url[:40]}...")
            print(f"[IMAGE_INJECT] ✅ BG-IMAGE: {external_url[:30]}... -> {url[:30]}...")
            return f'{before}{url}{after}'

        # Match background-image: url('...') or url("...") or url(...)
        bg_image_pattern = r'(background-image:\s*url\([\'"]?)(https?://[^\'")\s]+)([\'"]?\))'
        result = re.sub(bg_image_pattern, replace_background_image_url, result, flags=re.IGNORECASE)

        # Also match inline style background-image
        inline_bg_pattern = r'(style=["\'][^"\']*background-image:\s*url\([\'"]?)(https?://[^\'")\s]+)([\'"]?\)[^"\']*["\'])'
        result = re.sub(inline_bg_pattern, replace_background_image_url, result, flags=re.IGNORECASE)

        # PATTERN 5: Replace JavaScript variable assignments
        # const image1 = props.image1 || 'placeholder' -> const image1 = 'https://...'
        for key, url in prefetched_images.items():
            if key.endswith('_query') or not url.startswith('http'):
                continue

            # Replace: const propName = props.propName || 'placeholder'
            js_pattern = rf"const\s+{re.escape(key)}\s*=\s*props\.{re.escape(key)}\s*\|\|\s*['\"][^'\"]*['\"]"
            replacement = f"const {key} = '{url}'"
            if re.search(js_pattern, result):
                result = re.sub(js_pattern, replacement, result)
                logger.info(f"[IMAGE_INJECT] Replaced JS variable {key}")
                print(f"[IMAGE_INJECT] ✅ JS: {key} = '{url[:40]}...'")

        if images_injected > 0:
            logger.info(f"[IMAGE_INJECT] Successfully injected {images_injected} images")
            print(f"[IMAGE_INJECT] 🎉 Injected {images_injected} images into HTML")
        else:
            # No placeholders found - try to add images to the first suitable container
            logger.warning("[IMAGE_INJECT] No placeholders found - adding images to content")
            print("[IMAGE_INJECT] ⚠️ No placeholders found, attempting to add images...")

        return result

    async def _upload_external_urls_to_bucket(self, html: str) -> str:
        """
        CRITICAL FALLBACK: Find any external image URLs in HTML and upload them to our bucket.

        This ensures that even if prefetching failed or AI generated unexpected URLs,
        the final HTML will always use our bucket URLs.
        """
        import re
        from services.image_storage_service import ImageStorageService

        if not html:
            logger.warning("[BUCKET_UPLOAD] No HTML provided")
            return html

        # Our bucket domains - URLs from these should NOT be re-uploaded
        OUR_BUCKET_DOMAINS = ['nextslide.ai', 'supabase.co', 'supabase.com']

        def is_our_url(url: str) -> bool:
            return any(domain in url.lower() for domain in OUR_BUCKET_DOMAINS)

        # Find all external image URLs in img tags - simpler, more robust pattern
        # Match: <img ... src="URL" ...> or <img ... src='URL' ...>
        img_pattern = r'<img\s+[^>]*?src=(["\'])(https?://[^"\']+)\1[^>]*>'
        matches = list(re.finditer(img_pattern, html, flags=re.IGNORECASE))

        logger.info(f"[BUCKET_UPLOAD] Scanning HTML ({len(html)} chars), found {len(matches)} img tags with http(s) URLs")
        print(f"[BUCKET_UPLOAD] 🔍 Found {len(matches)} img tags with URLs")

        external_urls = []
        for match in matches:
            url = match.group(2)
            if not is_our_url(url) and not url.startswith('data:'):
                external_urls.append((match, url))
                logger.info(f"[BUCKET_UPLOAD] External URL found: {url[:70]}...")

        if not external_urls:
            logger.debug("[BUCKET_UPLOAD] No external URLs to upload")
            print("[BUCKET_UPLOAD] ✅ No external URLs found - all images already using bucket URLs")
            return html

        logger.info(f"[BUCKET_UPLOAD] Found {len(external_urls)} external URLs to upload")
        print(f"[BUCKET_UPLOAD] 🔄 Uploading {len(external_urls)} external images to bucket...")

        # Upload each external URL to our bucket
        result = html
        uploaded_count = 0

        try:
            async with ImageStorageService() as storage:
                for match, external_url in external_urls:
                    try:
                        logger.info(f"[BUCKET_UPLOAD] Uploading: {external_url[:70]}...")
                        # Upload to our bucket
                        upload_result = await storage.upload_image_from_url(external_url)

                        if 'error' not in upload_result and upload_result.get('url'):
                            bucket_url = upload_result['url']

                            # Simply replace the URL in the matched img tag
                            old_tag = match.group(0)
                            new_tag = old_tag.replace(external_url, bucket_url)

                            # Replace in result
                            result = result.replace(old_tag, new_tag, 1)
                            uploaded_count += 1

                            logger.info(f"[BUCKET_UPLOAD] ✅ Uploaded: {external_url[:40]}... -> {bucket_url[:40]}...")
                            print(f"[BUCKET_UPLOAD] ✅ {external_url[:30]}... -> bucket")
                        else:
                            error_msg = upload_result.get('error', 'Unknown error')
                            logger.warning(f"[BUCKET_UPLOAD] Failed to upload: {external_url[:50]}... - {error_msg}")
                            print(f"[BUCKET_UPLOAD] ⚠️ Failed: {external_url[:30]}... - {error_msg}")

                    except Exception as e:
                        logger.error(f"[BUCKET_UPLOAD] Exception uploading {external_url[:50]}: {e}", exc_info=True)
                        print(f"[BUCKET_UPLOAD] ❌ Error: {external_url[:30]}... - {e}")
        except Exception as e:
            logger.error(f"[BUCKET_UPLOAD] Failed to create ImageStorageService: {e}", exc_info=True)
            print(f"[BUCKET_UPLOAD] ❌ Storage service error: {e}")

        # Also handle background-image URLs
        bg_url_pattern = r'(background-image:\s*url\([\'"]?)(https?://[^\'")\s]+)([\'"]?\))'
        bg_matches = list(re.finditer(bg_url_pattern, result, flags=re.IGNORECASE))

        for match in bg_matches:
            url = match.group(2)
            if not is_our_url(url) and not url.startswith('data:'):
                try:
                    async with ImageStorageService() as storage:
                        upload_result = await storage.upload_image_from_url(url)

                        if 'error' not in upload_result and upload_result.get('url'):
                            bucket_url = upload_result['url']
                            before = match.group(1)
                            after = match.group(3)
                            old_css = match.group(0)
                            new_css = f'{before}{bucket_url}{after}'
                            result = result.replace(old_css, new_css, 1)
                            uploaded_count += 1
                            logger.info(f"[BUCKET_UPLOAD] ✅ BG uploaded: {url[:40]}...")

                except Exception as e:
                    logger.error(f"[BUCKET_UPLOAD] Exception uploading BG {url[:50]}: {e}")

        if uploaded_count > 0:
            logger.info(f"[BUCKET_UPLOAD] Successfully uploaded {uploaded_count} images to bucket")
            print(f"[BUCKET_UPLOAD] 🎉 Uploaded {uploaded_count} images to bucket!")
        else:
            logger.warning("[BUCKET_UPLOAD] No images were successfully uploaded")

        return result

    def _format_javascript(self, code: str) -> str:
        """
        Format JavaScript/HTML code with proper indentation and line breaks.
        This mirrors the frontend's formatJavaScript() function to ensure
        consistency between generation and what users see in the editor.
        """
        if not code:
            return ''

        try:
            formatted = code

            # First, detect if it's minified (all on one line or very few lines)
            lines = code.split('\n')
            if len(lines) < 3:
                # Add line breaks after common patterns
                formatted = formatted.replace('{', '{\n')
                formatted = formatted.replace('}', '\n}')
                formatted = formatted.replace(';', ';\n')
                # Add line breaks after commas in objects (when followed by quotes)
                import re
                formatted = re.sub(r',(?=\s*[\'"])', ',\n', formatted)
                # Fix function declarations
                formatted = re.sub(r'function\s+(\w+)\s*\(', r'function \1(', formatted)
                formatted = re.sub(r'\)\s*\{', ') {', formatted)
                # Fix arrow functions
                formatted = re.sub(r'=>\s*\{', '=> {', formatted)
                # Fix return statements
                formatted = re.sub(r'return\s+', 'return ', formatted)

            # Now apply indentation
            lines = formatted.split('\n')
            indent_level = 0
            indent_size = 2

            formatted_lines = []
            for line in lines:
                trimmed_line = line.strip()

                # Skip empty lines
                if not trimmed_line:
                    continue

                # Decrease indent for closing braces
                if trimmed_line.startswith('}') or trimmed_line.startswith(')'):
                    indent_level = max(0, indent_level - 1)

                # Apply indentation
                indented_line = ' ' * (indent_level * indent_size) + trimmed_line

                # Increase indent after opening braces
                if trimmed_line.endswith('{') or trimmed_line.endswith('('):
                    indent_level += 1

                # Handle inline braces
                open_braces = trimmed_line.count('{')
                close_braces = trimmed_line.count('}')

                if open_braces > close_braces:
                    indent_level += open_braces - close_braces
                elif close_braces > open_braces and not trimmed_line.startswith('}'):
                    indent_level = max(0, indent_level - (close_braces - open_braces))

                formatted_lines.append(indented_line)

            return '\n'.join(formatted_lines)
        except Exception as e:
            print(f"[FORMAT_JS] Error formatting: {e}")
            return code  # Return original code if formatting fails

    def _format_html(self, html: str) -> str:
        """Format and clean up HTML for proper rendering."""
        import re

        # CRITICAL: Fix escaped sequences FIRST (before any other processing)
        # This happens when the AI returns JSON-escaped strings
        if '\\n' in html or '\\t' in html or '\\"' in html:
            print(f"[FORMAT_HTML] Fixing escaped sequences...")
            html = html.replace('\\n', '\n')
            html = html.replace('\\t', '\t')
            html = html.replace('\\"', '"')
            html = html.replace("\\'", "'")
            html = html.replace('\\\\', '\\')

        # CRITICAL: Ensure blank line after <html> tag - required for iframe rendering
        html = re.sub(r'(<html[^>]*>)\s*\n?\s*', r'\1\n\n', html, flags=re.IGNORECASE)

        # Remove any leading/trailing whitespace
        html = html.strip()

        # Fix common issues that break rendering:

        # 1. Remove any BOM or weird unicode characters at the start
        html = html.lstrip('\ufeff\u200b\u200c\u200d')

        # 2. Ensure proper DOCTYPE
        if not html.lower().startswith('<!doctype'):
            html = '<!DOCTYPE html>\n' + html

        # 3. Fix script tags that might have been escaped
        html = html.replace('&lt;script', '<script')
        html = html.replace('&lt;/script', '</script')
        html = html.replace('script&gt;', 'script>')

        # 4. Fix style tags that might have been escaped
        html = html.replace('&lt;style', '<style')
        html = html.replace('&lt;/style', '</style')
        html = html.replace('style&gt;', 'style>')

        # 5. Normalize line endings
        html = html.replace('\r\n', '\n').replace('\r', '\n')

        # 6. Remove excessive blank lines (more than 2 consecutive)
        html = re.sub(r'\n{3,}', '\n\n', html)

        # 7. Ensure there's a newline after DOCTYPE
        html = re.sub(r'(<!DOCTYPE html>)(<html)', r'\1\n\2', html, flags=re.IGNORECASE)

        # 8. PRETTIFY CSS - expand compact rules onto multiple lines
        html = self._prettify_css_in_html(html)

        return html

    def _prettify_css_in_html(self, html: str) -> str:
        """Properly format CSS and JS in HTML using beautifier libraries."""
        import re

        try:
            import cssbeautifier
            import jsbeautifier

            print("[BEAUTIFY] Starting HTML prettification...")

            # Beautify CSS blocks
            css_count = 0
            def beautify_css(match):
                nonlocal css_count
                css_count += 1
                opening = match.group(1)
                css_content = match.group(2)
                closing = match.group(3)

                try:
                    opts = cssbeautifier.default_options()
                    opts.indent_size = 2
                    opts.indent_char = ' '
                    beautified = cssbeautifier.beautify(css_content, opts)
                    print(f"[BEAUTIFY] CSS block {css_count}: {len(css_content)} chars -> {len(beautified)} chars")
                    return f"{opening}\n{beautified}\n{closing}"
                except Exception as e:
                    print(f"[BEAUTIFY] CSS error: {e}")
                    return match.group(0)

            html = re.sub(
                r'(<style[^>]*>)(.*?)(</style>)',
                beautify_css,
                html,
                flags=re.DOTALL | re.IGNORECASE
            )

            # Beautify JS blocks (skip external scripts)
            js_count = 0
            def beautify_js(match):
                nonlocal js_count
                opening = match.group(1)
                js_content = match.group(2)
                closing = match.group(3)

                # Skip empty or very short scripts (likely external src tags)
                if len(js_content.strip()) < 10:
                    return match.group(0)

                js_count += 1
                try:
                    opts = jsbeautifier.default_options()
                    opts.indent_size = 2
                    opts.indent_char = ' '
                    beautified = jsbeautifier.beautify(js_content, opts)
                    print(f"[BEAUTIFY] JS block {js_count}: {len(js_content)} chars -> {len(beautified)} chars")
                    return f"{opening}\n{beautified}\n{closing}"
                except Exception as e:
                    print(f"[BEAUTIFY] JS error: {e}")
                    return match.group(0)

            html = re.sub(
                r'(<script[^>]*>)(.*?)(</script>)',
                beautify_js,
                html,
                flags=re.DOTALL | re.IGNORECASE
            )

            print(f"[BEAUTIFY] Done: {css_count} CSS blocks, {js_count} JS blocks")

        except ImportError as e:
            print(f"[BEAUTIFY] ImportError: {e}")
            logger.warning("[CUSTOM_COMPONENT] cssbeautifier/jsbeautifier not installed, skipping prettification")
        except Exception as e:
            print(f"[BEAUTIFY] Unexpected error: {e}")
            import traceback
            traceback.print_exc()

        return html

    def _is_low_quality_output(self, text: str) -> bool:
        """Check if the output is too simple or lacks interactivity."""
        import re

        text_lower = text.lower()

        # Extract just the body content
        body_match = re.search(r'<body[^>]*>(.*?)</body>', text_lower, re.DOTALL | re.IGNORECASE)
        if not body_match:
            return False

        body_content = body_match.group(1).strip()

        # Check for bare image patterns
        body_stripped = re.sub(r'\s+', '', body_content)
        bare_image_patterns = [
            r'^<img[^>]+/?>$',
            r'^<img[^>]+/?>\s*$',
            r'^<div[^>]*><img[^>]+/?></div>$',
        ]

        for pattern in bare_image_patterns:
            if re.match(pattern, body_stripped):
                logger.warning("[CUSTOM_COMPONENT] Rejected: bare image output")
                return True

        # Check if body has very little text content
        text_only = re.sub(r'<[^>]+>', '', body_content)
        text_only = text_only.strip()

        if len(text_only) < 20:
            element_count = len(re.findall(r'<(div|span|p|h[1-6]|section|article)', body_content, re.IGNORECASE))
            if element_count < 3:
                logger.warning("[CUSTOM_COMPONENT] Rejected: too little content")
                return True

        # Check for interactivity indicators
        has_script = '<script' in text_lower
        has_onclick = 'onclick' in text_lower
        has_onmouse = 'onmouse' in text_lower
        has_keyframes = '@keyframes' in text_lower
        has_transition = 'transition' in text_lower
        has_animation = 'animation' in text_lower
        has_hover = ':hover' in text_lower

        interactivity_score = sum([
            has_script,
            has_onclick,
            has_onmouse,
            has_keyframes,
            has_transition,
            has_animation,
            has_hover
        ])

        # Require at least 1 interactivity feature (relaxed for debugging)
        if interactivity_score < 1:
            logger.warning(f"[CUSTOM_COMPONENT] Rejected: low interactivity score ({interactivity_score}/7)")
            return True
        else:
            logger.info(f"[CUSTOM_COMPONENT] Interactivity score: {interactivity_score}/7 - PASSED")

        # Check for boring card patterns
        boring_patterns = [
            r'rounded-lg.*bg-.*p-\d',  # Generic card styling
            r'grid.*gap-\d.*rounded',   # Basic grid of cards
        ]

        card_count = len(re.findall(r'rounded-(lg|xl|2xl|md)', body_content))
        if card_count > 3 and interactivity_score < 3:
            logger.warning(f"[CUSTOM_COMPONENT] Rejected: too many static cards ({card_count})")
            return True

        return False

    def _analyze_content_for_component(self, content: str, title: str) -> str:
        """
        Encourage unique, creative design for each slide.
        Focus on variety and avoiding repetitive patterns.
        """
        return f"""
═══════════════════════════════════════════════════════════════
📋 CONTENT ANALYSIS
═══════════════════════════════════════════════════════════════

TITLE: {title}

Before designing, consider:
1. What is the CORE MESSAGE of this slide?
2. What visual approach would make this content memorable?
3. How can you present this DIFFERENTLY from typical slides?

DESIGN PRINCIPLES:
• Lead with the most important information
• Use visual hierarchy to guide the eye
• Let the content breathe with whitespace
• Make one element the hero/focal point
• Add subtle motion to bring it to life

AVOID THESE COMMON PATTERNS:
✗ Grid of equal-sized cards (overused, boring)
✗ Image row at top + text cards below (repetitive)
✗ Centered bullet list (not a presentation, it's a document)
✗ Generic icon + text columns (template-looking)

THINK LIKE A DESIGNER:
"What layout would make this specific content shine?"
"How would Apple or Stripe present this?"
"What's unexpected but appropriate for this message?"
"""

    def _is_title_slide(self, slide_context: Dict[str, Any]) -> bool:
        """Detect if this is a title/cover slide."""
        slide_index = slide_context.get('slide_index', 0)
        slide_type = slide_context.get('slide_type', '').lower()
        total_slides = slide_context.get('total_slides', 1)

        # Explicit title/cover layout
        if any(t in slide_type for t in ['title', 'cover']):
            return True

        # For single-slide decks, user wants content, not just a title
        if total_slides == 1:
            return False

        # First slide of multi-slide decks is the title slide
        if slide_index == 0:
            return True

        return False

    def _build_title_slide_system_prompt(
        self,
        colors: Dict[str, str],
        typography: Dict[str, str],
        style_keywords: list,
        logo_url: Optional[str] = None,
        slide_mode: str = 'interactive',
        logo_needs_invert: bool = False
    ) -> str:
        """Build specialized system prompt for stunning title slides."""

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        # Logo instructions for title slides
        logo_info = ""
        if logo_url:
            invert_note = " Apply CSS filter: invert(1) to the <img> for contrast!" if logo_needs_invert else ""
            logo_info = f"\n🏢 LOGO (MANDATORY): Include the brand logo in a corner or header area (height: 40-60px, z-index: 100).{invert_note} THE LOGO IS NON-NEGOTIABLE!"

        # Mode-specific instructions
        if slide_mode == 'static':
            mode_instruction = """✅ TRADITIONAL MODE - Elegant entrance animations ONLY:
- Entrance animations ALLOWED: fadeIn, slideIn (from any direction), scale reveal
- Use @keyframes with animation-fill-mode: forwards (element stays after animation)
- Stagger delays for polish: 0.1s, 0.2s, 0.3s...
- Keep animations SHORT: 0.4s-0.8s, ease-out

⛔ FORBIDDEN:
- NO <script> tags, onclick, onmouseover, or event handlers
- NO hover effects or :hover pseudo-class
- NO looping/infinite animations - entrance only, then STILL
- NO animated particles or continuous motion

OUTPUT: Complete HTML/CSS starting with <!DOCTYPE html>"""
        else:
            mode_instruction = """✨ INTERACTIVE MODE - Add elegant animations:
- Entrance animations (fade, slide, reveal, scale)
- Floating particles and light streaks
- Smooth CSS transitions

OUTPUT: Complete HTML/CSS/JS starting with <!DOCTYPE html>
Use smooth animations (cubic-bezier)."""

        return f"""You are an award-winning designer. Create BREATHTAKING title slides.

THEME: --accent: {accent}; --secondary: {secondary}; --text: {text_color}; --bg: {bg_color}
FONTS: {hero_font} (hero) / {body_font} (body){logo_info}

DESIGN PHILOSOPHY:
- Cinematic, editorial, high-fashion quality
- Dramatic typography as the hero (120-200px titles)
- Atmospheric backgrounds (gradients, glows, blur effects)
- REQUIRED elements: brand logo (corner or header), title, optional subtitle, optional accent

TYPOGRAPHY CRAFT:
- Tight letter-spacing (-0.02em to -0.05em)
- Gradient text or dramatic shadows for depth
- Strategic use of font weights (light vs black contrast)

ATMOSPHERE (vary each slide - never repeat the same style):
- Geometric shapes, diagonal lines, or grid patterns
- Noise/grain textures, duotone overlays
- Gradient meshes, aurora effects
- Minimalist negative space, typography-only designs
- Abstract shapes (NOT always corner blobs)

Z-INDEX LAYERING (CRITICAL - title must ALWAYS be visible):
- Background gradients/effects: z-index: 1-5
- Decorative elements: z-index: 10-30
- TITLE TEXT: z-index: 100+ (ALWAYS on top, never obscured)
- Subtitle/presenter: z-index: 90+
- Logo: z-index: 80+

{mode_instruction}
Use CSS variables. Fill 1920x1080."""

    def _build_title_slide_user_prompt(
        self,
        content: str,
        slide_context: Dict[str, Any],
        colors: Dict[str, str],
        typography: Dict[str, str],
        width: int,
        height: int,
        logo_url: Optional[str] = None,
        logo_needs_invert: bool = False
    ) -> str:
        """Build user prompt specifically for title slides."""

        title = slide_context.get('title', 'Presentation Title')
        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        # Parse content for subtitle/presenter info
        subtitle = ""
        presenter = ""
        if content:
            lines = content.strip().split('\n')
            if lines:
                subtitle = lines[0] if len(lines) > 0 else ""
                presenter = lines[1] if len(lines) > 1 else ""

        # Build logo section for title slides
        logo_section = ""
        if logo_url:
            invert_style = ' style="filter: invert(1);"' if logo_needs_invert else ''
            invert_note = " (with filter: invert(1) for contrast)" if logo_needs_invert else ""

            logo_section = f"""
🏢 BRAND LOGO (REQUIRED - DO NOT SKIP):
URL: {logo_url}
HTML example: <img src="{logo_url}" alt="Logo"{invert_style} style="height: 50px; position: absolute; top: 30px; z-index: 100;">
Position: Any corner or header area that fits the design{invert_note}
⚠️ THIS LOGO MUST APPEAR ON THE SLIDE - IT IS THE BRAND'S IDENTITY!
"""

        return f"""TITLE SLIDE: "{title}"
{f'Subtitle: "{subtitle}"' if subtitle else ''}
{f'Presenter: "{presenter}"' if presenter else ''}

SIZE: {width}x{height}px

COLORS: accent={accent}, secondary={secondary}, text={text_color}, bg={bg_color}
FONTS: {hero_font} / {body_font}
{logo_section}
Create a cinematic, editorial-quality title slide. Think movie poster, fashion magazine, Apple keynote.

Be creative with:
- Dramatic typography (150px+, tight tracking, gradient or shadow)
- Elegant animations (reveals, fades, subtle motion)
- Unique backgrounds: geometric, textured, gradient mesh, minimal, or bold color blocks

Keep it minimal - the title is everything. Maximum {4 if logo_url else 3} visual elements total."""

    def _wrap_in_html(self, content: str) -> str:
        """Wrap partial HTML in a complete document."""
        return f"""<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; overflow: hidden; background: transparent; }}
  </style>
</head>
<body class="bg-transparent overflow-hidden flex items-center justify-center">
  {content}
</body>
</html>"""


# Convenience function for quick generation
async def generate_custom_component(
    content: str,
    theme: Dict[str, Any],
    slide_context: Dict[str, Any],
    purpose: str = "visualize",
    external_media: Optional[Dict[str, Any]] = None,
    **kwargs
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to generate a CustomComponent.

    Args:
        content: Content to visualize
        theme: Theme dictionary
        slide_context: Slide context info
        purpose: What the component should do
        external_media: Optional dict with media from external sources (Firecrawl):
            - 'images': List of image URLs
            - 'gifs': List of GIF URLs
            - 'source_url': The source website
            - 'markdown': Content extracted from the site
        **kwargs: Additional args (width, height, position)

    Returns:
        CustomComponent dict or None
    """
    generator = CustomComponentGenerator()
    return await generator.generate(
        content=content,
        theme=theme,
        slide_context=slide_context,
        component_purpose=purpose,
        external_media=external_media,
        **kwargs
    )


async def generate_custom_component_from_url(
    url: str,
    content: str,
    theme: Dict[str, Any],
    slide_context: Dict[str, Any],
    purpose: str = "showcase",
    media_types: Optional[list] = None,
    **kwargs
) -> Optional[Dict[str, Any]]:
    """
    Convenience function to scrape a URL and generate a CustomComponent from its media.

    Args:
        url: Website URL to scrape for media
        content: Additional content/context for the component
        theme: Theme dictionary
        slide_context: Slide context info
        purpose: What the component should do (default: showcase)
        media_types: Optional filter for media types (e.g., ['gif', 'png'])
        **kwargs: Additional args (width, height, position)

    Returns:
        CustomComponent dict or None
    """
    from services.firecrawl_service import get_firecrawl_service

    # Scrape media from URL
    service = get_firecrawl_service()
    if not service.is_configured():
        logger.warning("Firecrawl not configured, cannot scrape URL for media")
        return None

    result = service.extract_site_content(url)
    if not result.get("success"):
        logger.warning(f"Failed to extract media from {url}: {result.get('error')}")
        return None

    external_media = result.get("data", {})

    # Filter by media types if specified
    if media_types:
        all_media = external_media.get("all_media", [])
        filtered = [
            img for img in all_media
            if any(f".{mt}" in img.lower() for mt in media_types)
        ]
        if "gif" in media_types:
            external_media["gifs"] = [img for img in filtered if ".gif" in img.lower()]
        external_media["images"] = [img for img in filtered if ".gif" not in img.lower()]

    generator = CustomComponentGenerator()
    return await generator.generate(
        content=content,
        theme=theme,
        slide_context=slide_context,
        component_purpose=purpose,
        external_media=external_media,
        **kwargs
    )
