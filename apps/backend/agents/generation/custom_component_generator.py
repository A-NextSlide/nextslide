"""
Dedicated CustomComponent generator using Gemini 3 Pro for creative HTML/CSS/JS generation.

This module generates visually stunning CustomComponents for slides using:
- Gemini 3 Pro's creative capabilities
- Full HTML document mode (iframe)
- Tailwind CSS for styling
- Context-aware design (theme, content, style)
"""

import asyncio
import re
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

from agents.ai.clients import get_client, invoke
from agents.config import (
    CUSTOM_COMPONENT_MODEL,
    CUSTOM_COMPONENT_TEMPERATURE,
    ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN
)
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def prefetch_images_for_content(
    content: str,
    slide_title: str,
    max_images: int = 5
) -> Dict[str, str]:
    """
    Pre-fetch images for slide content BEFORE generation.

    Searches for images via SerpAPI, uploads them to our Supabase bucket,
    and returns our own hosted URLs (reliable, no external dependencies).

    Args:
        content: The slide content to analyze
        slide_title: The slide title for additional context
        max_images: Maximum number of images to fetch

    Returns:
        Dict mapping prop names to our Supabase URLs, e.g.:
        {"image1": "https://auth.nextslide.ai/storage/...", ...}
        Also includes search term hints: {"image1_query": "Tesla", ...}
    """
    from services.serpapi_service import SerpAPIService
    from services.image_storage_service import ImageStorageService

    # Initialize SerpAPI
    try:
        serpapi = SerpAPIService()
        if not serpapi.is_available:
            logger.warning("[PREFETCH] SerpAPI not available (no API key)")
            print("[PREFETCH] ❌ SerpAPI not available")
            return {}
    except Exception as e:
        logger.warning(f"[PREFETCH] Could not init SerpAPI: {e}")
        return {}

    # Extract search terms
    search_terms = _extract_image_search_terms(content, slide_title)
    if not search_terms:
        print("[PREFETCH] ⚠️ No search terms extracted")
        return {}

    print(f"[PREFETCH] 🔍 Search terms: {search_terms[:max_images]}")
    search_terms = search_terms[:max_images]
    prefetched = {}

    # Use ImageStorageService to upload to our bucket
    async with ImageStorageService() as storage:

        async def search_and_upload(index: int, term: str) -> Tuple[int, str, Optional[str]]:
            """Search SerpAPI, upload first good result to our bucket."""
            try:
                # Search for images
                result = await serpapi.search_images(
                    query=f"{term} high quality",
                    per_page=5,
                    size="large"
                )

                photos = result.get('photos', [])

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

    count = len([k for k in prefetched if not k.endswith('_query')])
    print(f"[PREFETCH] 📸 Uploaded {count} images to our bucket")
    return prefetched


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


class CustomComponentGenerator:
    """
    Generates creative CustomComponents using Gemini 3 Pro.

    This generator creates visually impressive HTML/CSS/JS components that:
    - Match the presentation theme
    - Visualize content in engaging ways
    - Use modern web design patterns
    - Include animations and interactivity
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
        auto_prefetch: bool = True
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

        Returns:
            CustomComponent dict with type, props, position, etc.
        """
        if not ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN:
            logger.info("Dedicated CustomComponent generation disabled")
            return None

        start_time = datetime.now()

        try:
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
            # Skip for title slides (they typically don't need images)
            slide_title = slide_context.get('title', '')
            is_title_slide_check = self._is_title_slide(slide_context)

            if not prefetched_images and auto_prefetch and not is_title_slide_check and not external_media:
                logger.info("[CUSTOM_COMPONENT] Auto-prefetching images for content...")
                print("[CUSTOM_COMPONENT] 🔍 Pre-fetching images before generation...")
                try:
                    prefetched_images = await prefetch_images_for_content(
                        content=content,
                        slide_title=slide_title,
                        max_images=5
                    )
                    if prefetched_images:
                        logger.info(f"[CUSTOM_COMPONENT] Pre-fetched {len(prefetched_images)} images")
                        print(f"[CUSTOM_COMPONENT] ✅ Pre-fetched {len(prefetched_images)} images: {list(prefetched_images.keys())}")
                except Exception as e:
                    logger.warning(f"[CUSTOM_COMPONENT] Image prefetch failed: {e}")
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
                            max_images=5
                        )
                        if prefetched_images:
                            print(f"[CUSTOM_COMPONENT] ✅ Fallback prefetch got {len(prefetched_images)} images")
                    except Exception as e:
                        logger.warning(f"[CUSTOM_COMPONENT] Fallback prefetch failed: {e}")
                        prefetched_images = {}

            # Detect if this is a title slide
            is_title_slide = self._is_title_slide(slide_context)

            # Build the system prompt (specialized for title slides)
            if is_title_slide:
                system_prompt = self._build_title_slide_system_prompt(colors, typography, style_keywords)
            else:
                system_prompt = self._build_system_prompt(colors, typography, style_keywords)

            # Build the user prompt with full context
            if is_title_slide:
                user_prompt = self._build_title_slide_user_prompt(
                    content=content,
                    slide_context=slide_context,
                    colors=colors,
                    typography=typography,
                    width=width,
                    height=height
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
                    prefetched_images=prefetched_images
                )

            # Get client and generate
            client, model_name = get_client(self.model)

            logger.info(f"[CUSTOM_COMPONENT] Generating with {model_name}...")
            logger.info(f"[CUSTOM_COMPONENT] Content preview: {content[:100]}...")

            # Create messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]

            # Generate using AI model (no structured output - we want raw HTML)
            logger.info(f"[CUSTOM_COMPONENT] Calling {model_name} with temperature={self.temperature}")
            print(f"[CUSTOM_COMPONENT] 🎨 Using model: {model_name}")
            print(f"[CUSTOM_COMPONENT] 📝 Prompt length: system={len(system_prompt)}, user={len(user_prompt)}")

            loop = asyncio.get_event_loop()
            try:
                response = await asyncio.wait_for(
                    loop.run_in_executor(
                        None,
                        invoke,
                        client,
                        model_name,
                        messages,
                        None,  # No response model - raw text
                        16000,  # max_tokens
                        self.temperature
                    ),
                    timeout=self.generation_timeout
                )
                logger.info(f"[CUSTOM_COMPONENT] Got response: {type(response)}, length: {len(str(response)) if response else 0}")
                print(f"[CUSTOM_COMPONENT] ✅ Got response: {type(response)}, length: {len(str(response)) if response else 0}")
                if response:
                    response_str = str(response)
                    # Check if response has literal \n (escaped) vs actual newlines
                    has_escaped = '\\n' in response_str
                    has_actual = '\n' in response_str
                    print(f"[CUSTOM_COMPONENT] 🔍 Response check: escaped_newlines={has_escaped}, actual_newlines={has_actual}")
                    print(f"[CUSTOM_COMPONENT] 📄 Response preview (repr): {repr(response_str[:300])}")
            except Exception as invoke_error:
                logger.error(f"[CUSTOM_COMPONENT] Invoke failed: {invoke_error}")
                print(f"[CUSTOM_COMPONENT] ❌ Invoke failed: {invoke_error}")
                import traceback
                traceback.print_exc()
                raise

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

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(f"[CUSTOM_COMPONENT] Generated in {elapsed:.1f}s ({len(html_content)} chars)")

            # Build the component
            # Include prefetched images in props.props so frontend can inject them
            # Filter out the _query hints - only include actual image URLs
            image_props = {k: v for k, v in (prefetched_images or {}).items() if not k.endswith('_query')}
            if image_props:
                logger.info(f"[CUSTOM_COMPONENT] Including {len(image_props)} prefetched images in component props")
                print(f"[CUSTOM_COMPONENT] 📸 Storing {len(image_props)} image URLs in props: {list(image_props.keys())}")

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
                    # Store prefetched images - frontend will inject these into ${propName} placeholders
                    "props": image_props
                },
                "position": position or {"x": 80, "y": 240},
                "width": width,
                "height": height
            }

            return component

        except asyncio.TimeoutError:
            logger.error(f"[CUSTOM_COMPONENT] Generation timed out after {self.generation_timeout}s")
            return None
        except Exception as e:
            logger.error(f"[CUSTOM_COMPONENT] Generation failed: {e}")
            return None

    def _build_system_prompt(
        self,
        colors: Dict[str, str],
        typography: Dict[str, str],
        style_keywords: list
    ) -> str:
        """Build the system prompt for CustomComponent generation."""

        style_desc = ", ".join(style_keywords) if style_keywords else "modern, professional"

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        return f"""You are a WORLD-CLASS CREATIVE TECHNOLOGIST creating STUNNING interactive web experiences.

You have the FULL POWER of HTML, CSS, JavaScript, SVG, Canvas, and animations.
Create something that makes people say "WOW, how did they do that?!"

═══════════════════════════════════════════════════════════════
🎨 YOUR DESIGN SYSTEM (MANDATORY - USE THESE EXACT COLORS!)
═══════════════════════════════════════════════════════════════

:root {{
  --accent: {accent};
  --secondary: {secondary};
  --text: {text_color};
  --bg: {bg_color};
  --font-hero: '{hero_font}', sans-serif;
  --font-body: '{body_font}', sans-serif;
}}

COLORS: Use --accent and --secondary for all accent elements. These are MANDATORY.
FONTS: Default to {hero_font} for headings and {body_font} for body text.
       You may override fonts if a different font makes more design sense (e.g., monospace for code).
       Include Google Fonts link: https://fonts.googleapis.com/css2?family={hero_font.replace(' ', '+')}:wght@400;600;700;900&family={body_font.replace(' ', '+')}:wght@400;500;600&display=swap

STYLE: {style_desc}

📸 IMAGES: If pre-loaded images are listed in the prompt, USE image1, image2, image3, etc.
           Access them as: const image1 = props.image1 || '';
           Use in HTML as: <img src="${{image1}}" alt="...">
           DO NOT use custom prop names - only image1, image2, image3, etc.

═══════════════════════════════════════════════════════════════
🚀 CREATIVE ARSENAL - PICK THE RIGHT WEAPON
═══════════════════════════════════════════════════════════════

🎯 INTERACTIVE QUIZ (Multiple Choice)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Clickable options that highlight on selection
- Reveal correct/incorrect with animation
- Confetti explosion on correct answer
- Color feedback: green for right, red for wrong

🎯 TRUE/FALSE QUIZ
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Two big buttons: TRUE | FALSE
- Statement displayed prominently
- Animated reveal of answer with explanation
- Visual feedback with icons ✓ ✗

🎯 INTERACTIVE POLL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Clickable options
- Animated progress bars that fill
- Percentage displays that count up
- Visual hierarchy showing winner

🎯 ANIMATED STATISTICS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Numbers that COUNT UP with easing
- SVG circular progress rings
- Animated bar charts
- Glowing/pulsing effects

🎯 INTERACTIVE TIMELINE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Clickable nodes on a horizontal line
- Click to reveal details for each phase
- Animated connecting line that draws itself
- Active state with glow effect

🎯 PROCESS/FLOW DIAGRAM
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Step boxes connected by animated arrows
- Click to expand each step
- Progress indicator showing current step
- SVG arrows that animate

🎯 COMPARISON SLIDER
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Draggable divider between two views
- Before/After reveal
- Smooth drag interaction
- Visual contrast between states

🎯 ACCORDION/EXPANDABLE
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Click headers to expand/collapse
- Smooth height animation
- Icon rotation (+ to -)
- Only one open at a time

🎯 ANIMATED TEXT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Typewriter effect
- Word-by-word fade in
- Gradient text with animation
- Highlighted phrases with glow

🎯 CARD FLIP
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Click to flip card 180°
- Front shows question/term
- Back shows answer/definition
- 3D perspective transform

═══════════════════════════════════════════════════════════════
💎 VISUAL POLISH TECHNIQUES
═══════════════════════════════════════════════════════════════

GLASSMORPHISM:
background: rgba(255,255,255,0.1);
backdrop-filter: blur(10px);
border: 1px solid rgba(255,255,255,0.2);

GRADIENT TEXT:
background: linear-gradient(135deg, {accent}, {secondary});
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

GLOW EFFECT:
box-shadow: 0 0 30px {accent}40, 0 0 60px {accent}20;

SMOOTH HOVER:
transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
transform: translateY(-4px) scale(1.02);

PULSE ANIMATION:
@keyframes pulse {{
  0%, 100% {{ opacity: 1; transform: scale(1); }}
  50% {{ opacity: 0.8; transform: scale(1.05); }}
}}

STAGGER FADE IN:
animation: fadeIn 0.5s ease-out forwards;
animation-delay: calc(var(--i) * 0.1s);

═══════════════════════════════════════════════════════════════
🖼️ IMAGES - MAKE SLIDES VISUAL WITH SEARCHABLE IMAGES!
═══════════════════════════════════════════════════════════════

**ALWAYS ADD IMAGES when the content involves:**
- People, characters, celebrities, historical figures → USE THEIR NAME as search!
- Products, technology, objects → USE SPECIFIC PRODUCT/TECH NAME!
- Places, cities, landmarks → USE LOCATION NAME!
- Concepts that can be visualized → USE DESCRIPTIVE SEARCH TERM!
- Team slides, about pages → USE "professional headshot" or role-specific search!

**🎯 NAME YOUR PROPS WITH THE SEARCH QUERY!**
The prop name becomes the search query. Be SPECIFIC:

<script>
  // ✅ GOOD - Specific, searchable names:
  const elonMuskImage = props.elonMuskImage || 'placeholder';  // Searches "elon musk"
  const teslaModelSImage = props.teslaModelSImage || 'placeholder';  // Searches "tesla model s"
  const newYorkCityImage = props.newYorkCityImage || 'placeholder';  // Searches "new york city"
  const professionalHeadshotImage = props.professionalHeadshotImage || 'placeholder';
  const aiRobotImage = props.aiRobotImage || 'placeholder';  // Searches "ai robot"
  const steveJobsImage = props.steveJobsImage || 'placeholder';  // Searches "steve jobs"

  // ❌ BAD - Generic, unhelpful names:
  const image1 = props.image1 || 'placeholder';  // What should this show??
  const heroImage = props.heroImage || 'placeholder';  // Too vague!
</script>

**USE IMAGES EVERYWHERE - Including in interactive elements:**

<!-- In collapsible panels/accordions -->
<div class="panel" onclick="this.classList.toggle('open')">
  <div class="panel-header">
    <img src="${{steveJobsImage}}" class="avatar" style="width:60px;height:60px;border-radius:50%;object-fit:cover;">
    <span>Steve Jobs</span>
  </div>
  <div class="panel-content">Biography content here...</div>
</div>

<!-- In animated cards -->
<div class="card" style="animation: fadeIn 0.5s ease-out;">
  <img src="${{productImage}}" style="width:100%;height:200px;object-fit:cover;border-radius:12px;">
  <h3>Product Name</h3>
</div>

<!-- In timeline items -->
<div class="timeline-item">
  <img src="${{historicalEventImage}}" class="timeline-image">
  <div class="timeline-content">...</div>
</div>

<!-- In comparison layouts -->
<div class="compare-grid">
  <div class="option-a">
    <img src="${{option1Image}}" style="width:100%;height:150px;object-fit:cover;">
    <h4>Option A</h4>
  </div>
  <div class="option-b">
    <img src="${{option2Image}}" style="width:100%;height:150px;object-fit:cover;">
    <h4>Option B</h4>
  </div>
</div>

**IMAGE STYLING FOR INTERACTIVE ELEMENTS:**
```css
/* Smooth loading */
img {{ opacity: 0; transition: opacity 0.3s; }}
img[src]:not([src="placeholder"]) {{ opacity: 1; }}

/* Hover effects */
.card img {{ transition: transform 0.3s; }}
.card:hover img {{ transform: scale(1.05); }}

/* Circular avatars */
.avatar {{ border-radius: 50%; object-fit: cover; }}

/* Aspect ratio containers */
.image-container {{ aspect-ratio: 16/9; overflow: hidden; }}
.image-container img {{ width: 100%; height: 100%; object-fit: cover; }}
```

**WHEN TO ADD IMAGES:**
✅ Character/person slides → Use their name: `elonMuskImage`, `beyonceImage`
✅ Product showcases → Use product: `iphone15ProImage`, `teslaModelYImage`
✅ Location/travel → Use place: `parisEiffelTowerImage`, `tokyoSkylineImage`
✅ Team/about pages → Use role: `ceoHeadshotImage`, `professionalTeamImage`
✅ Concept explanations → Use visual: `aiNeuralNetworkImage`, `cloudComputingImage`
✅ Historical content → Use event/person: `moonLanding1969Image`, `martinLutherKingImage`
✅ Comparisons → Use each option: `macbookProImage`, `surfaceLaptopImage`

**REQUIRED IMAGE STYLES:**
- Set explicit width/height or use aspect-ratio container
- Add border-radius for modern look (8-16px for cards, 50% for avatars)
- Use transition for smooth hover effects

**SMART OBJECT-FIT SELECTION:**
- `object-fit: cover` (DEFAULT) - photos, headshots, backgrounds - fills space, may crop edges
- `object-fit: contain` - logos, icons, diagrams - shows complete image, may have gaps
- `object-fit: fill` - rarely use, stretches/distorts

```css
/* Headshots/portraits/photos - COVER */
.avatar, .headshot, .photo {{ object-fit: cover; }}

/* Logos/icons/diagrams - CONTAIN */
.logo, .icon, .diagram {{ object-fit: contain; }}
```

Examples:
```javascript
// Headshot (cover - fills circle, crops edges)
const ceoHeadshotImage = props.ceoHeadshotImage || 'placeholder';
<img src="${{ceoHeadshotImage}}" style="object-fit:cover; width:80px; height:80px; border-radius:50%;">

// Logo (contain - shows full logo)
const companyLogoImage = props.companyLogoImage || 'placeholder';
<img src="${{companyLogoImage}}" style="object-fit:contain; width:120px; height:60px;">

// Product photo (cover - fills card uniformly)
const iphone15Image = props.iphone15Image || 'placeholder';
<img src="${{iphone15Image}}" style="object-fit:cover; width:100%; height:200px; border-radius:12px;">
```

═══════════════════════════════════════════════════════════════
🚫 ABSOLUTELY FORBIDDEN
═══════════════════════════════════════════════════════════════

❌ Static colored cards in a grid (INSTANT FAIL)
❌ Bullet point lists (use visual layouts instead)
❌ Generic rounded rectangles with text
❌ Hardcoded colors (MUST use CSS variables)
❌ No interactivity (everything should respond to user)
❌ Default fonts (MUST use theme fonts)
❌ Tiny text (minimum 16px body, 24px+ headers)
❌ Empty space (fill the canvas beautifully)
❌ Basic flexbox columns of text (boring!)

⛔ CRITICAL: IMAGE URL RULES ⛔

**DEFAULT (no external media provided):**
- NEVER use direct URLs like "https://images.unsplash.com/..."
- ALWAYS use: const imageName = props.imageName || 'placeholder';
- ALWAYS use: <img src="${{imageName}}" alt="descriptive alt">
- The system will automatically fetch images based on the prop name!
- Example: props.elonMuskImage will auto-fetch an Elon Musk photo

**EXCEPTION - EXTERNAL MEDIA FROM FIRECRAWL:**
When the prompt includes "🌐 EXTERNAL MEDIA FROM WEBSITE" section:
- ✅ USE those URLs DIRECTLY in <img src="...">
- ✅ These are REAL, verified URLs from the scraped site
- ✅ Do NOT use props pattern for these - hardcode them!
- ✅ Feature these prominently - they are the main content!

═══════════════════════════════════════════════════════════════
🎯 CRITICAL: CONTENT MUST FIT IN SLIDE (1920×1080)
═══════════════════════════════════════════════════════════════

**SLIDE CANVAS RULES (MANDATORY):**
1. Content area after padding: ~1760×920px (with 80px body padding)
2. ALL content MUST be visible without scrolling
3. Use overflow: hidden on html,body - content that overflows is CUT OFF

**FONT SIZE CONSTRAINTS:**
- Main title (h1): MAX 56px (not 64px!) for slides with multiple sections
- Subtitle: 20-24px
- Card titles: 18-20px
- Body text: 14-16px
- Labels/metadata: 12-14px

**LAYOUT FITTING RULES:**
1. When using grids with multiple sections:
   - Use `grid-template-rows: auto 1fr auto` with `minHeight: 0` on flex children
   - Limit card/section heights - use `max-height` where needed
2. For multi-section slides, calculate:
   - Header area: ~100px max
   - Main content: ~680-720px
   - Footer/bottom bar: ~80-100px
3. Use `min-height: 0` on grid/flex children to allow proper shrinking

**CONTENT DENSITY:**
- If content has 3+ info cards: reduce padding (24px instead of 40px)
- If content has SVG/visualization + text: limit text to 2-3 cards max
- Truncate long text with `text-overflow: ellipsis` where appropriate

**TESTING CHECKLIST:**
✓ Does everything fit in 1920×1080 without scrolling?
✓ Is all content visible (no clipping)?
✓ Are font sizes readable but not oversized?
✓ Did you use `overflow: hidden` on html/body?

═══════════════════════════════════════════════════════════════
📐 OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family={hero_font.replace(' ', '+')}:wght@400;700;900&family={body_font.replace(' ', '+')}:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --accent: {accent};
      --secondary: {secondary};
      --text: {text_color};
      --bg: {bg_color};
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      font-family: '{body_font}', sans-serif;
      color: var(--text);
    }}
    body {{
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 80px;
    }}
    /* Your creative styles and animations */
  </style>
</head>
<body>
  <!-- YOUR STUNNING FULL-SLIDE CONTENT -->
  <script>
    // Your JavaScript for interactivity
  </script>
</body>
</html>"""

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
        prefetched_images: Optional[Dict[str, str]] = None
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

        # Analyze content to determine best component type
        content_analysis = self._analyze_content_for_component(content, slide_title)

        # Full-slide mode instructions
        full_slide_instructions = ""
        if is_full_slide:
            full_slide_instructions = f"""
═══════════════════════════════════════════════════════════════
🖥️ FULL-SLIDE MODE - THIS IS THE ENTIRE SLIDE!
═══════════════════════════════════════════════════════════════

You are creating the ENTIRE slide, not just a component within it.
- Dimensions: {width}x{height} (standard presentation slide)
- YOU handle the background (use --bg: {bg_color})
- Include proper margins/padding (60-80px from edges)
- This is a COMPLETE presentation slide design

⚠️ CRITICAL - ALL CONTENT MUST FIT (NO OVERFLOW):
- With 60px top/bottom + 80px left/right padding = content area is ~1760×960px
- Content WILL BE CUT OFF if it exceeds this - there is NO scrolling
- Plan your layout: Title (~80px) + Main (~700-750px) + Footer (~80px) = ~900px max

FONT SIZE LIMITS (for multi-section slides):
- Title: 48-56px max (NOT 64px)
- Subtitle: 20-24px
- Section headers: 18-22px
- Body/cards: 14-16px
- Small labels: 12-14px

LAYOUT SAFETY:
- Use min-height: 0 on flex/grid children to allow shrinking
- Use max-height on sections that could grow
- For 3+ cards: use smaller padding (20-24px instead of 40px)
- For visualization + cards: limit to 2-3 cards max

SLIDE STRUCTURE:
1. Background: Use the theme background color with optional gradients/patterns
2. Title Area: Prominent slide title at top (~80-100px)
3. Content Area: Main visualization/interaction in center (~700px)
4. Supporting Elements: Footer/takeaway bar (~80-100px)

CRITICAL: Make it look like a premium keynote/presentation slide.
Think Apple keynote, Stripe presentation, or TED talk quality.

"""

        # Build design context section if user provided design cues
        design_context_section = ""
        if presentation_context:
            design_context_section = f"""
═══════════════════════════════════════════════════════════════
🎨 USER'S DESIGN PREFERENCES (Review for style/design cues ONLY)
═══════════════════════════════════════════════════════════════

The user originally requested: "{presentation_context}"

⚠️ IMPORTANT: Review this ONLY for design/style hints such as:
- Visual style preferences (minimalist, bold, playful, corporate, etc.)
- Animation preferences (subtle, dramatic, none, etc.)
- Layout preferences (clean, dense, spacious, etc.)
- Mood/tone (professional, fun, serious, energetic, etc.)

DO NOT use this for content - the slide content is provided separately below.
"""

        # Build external media section if media URLs were provided (from Firecrawl scraping)
        external_media_section = ""
        if external_media:
            gifs = external_media.get('gifs', [])
            images = external_media.get('images', [])
            source_url = external_media.get('source_url', '')
            site_content = external_media.get('markdown', '')[:500] if external_media.get('markdown') else ''

            media_list = []
            if gifs:
                media_list.append(f"GIFs ({len(gifs)} found):\n" + "\n".join([f"  - {url}" for url in gifs[:10]]))
            if images:
                media_list.append(f"Images ({len(images)} found):\n" + "\n".join([f"  - {url}" for url in images[:10]]))

            external_media_section = f"""
═══════════════════════════════════════════════════════════════
🌐 EXTERNAL MEDIA FROM WEBSITE (USE THESE DIRECTLY!)
═══════════════════════════════════════════════════════════════

Source: {source_url}

{chr(10).join(media_list)}

⚠️ CRITICAL: These are REAL URLs from the source website!
- Use these URLs DIRECTLY in your HTML with <img src="URL">
- DO NOT use props.imageName pattern for these - use the actual URLs!
- These GIFs/images are the PRIMARY content for this component
- Create a stunning showcase, gallery, or interactive display featuring these

💡 DESIGN IDEAS FOR EXTERNAL MEDIA:
- Animated GIF showcase with auto-cycling carousel
- Interactive gallery with hover zoom effects
- Hero display with floating/animated GIFs
- Grid layout with staggered animations
- Click-to-expand lightbox viewer
- Parallax scrolling effect with multiple GIFs

{f"SITE CONTEXT (for design inspiration):{chr(10)}{site_content}" if site_content else ""}
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
═══════════════════════════════════════════════════════════════
📎 USER-UPLOADED MEDIA (IMPORTANT!)
═══════════════════════════════════════════════════════════════

{chr(10).join(sections)}

⚠️ KEY RULES FOR UPLOADED MEDIA:
1. REFERENCE IMAGES (drawings/mockups): Use for design inspiration ONLY. Don't place as images.
2. PHOTOS/GRAPHICS: Include these on the slide - they're the user's content!
3. DATA FILES: Visualize as charts/tables, don't show raw data.
"""

        # Build prefetched images section - these are REAL URLs we've already fetched!
        prefetched_images_section = ""
        if prefetched_images and len(prefetched_images) > 0:
            # Filter to just the image props (not the _query hints)
            image_props = {k: v for k, v in prefetched_images.items() if not k.endswith('_query')}

            if image_props:
                # Build list with descriptions
                image_lines = []
                for prop_name in sorted(image_props.keys()):
                    query = prefetched_images.get(f"{prop_name}_query", "image")
                    image_lines.append(f"  ✓ {prop_name} - shows: {query}")

                image_list = "\n".join(image_lines)
                prop_names = list(image_props.keys())

                prefetched_images_section = f"""
═══════════════════════════════════════════════════════════════
📸 PRE-LOADED IMAGES - USE THESE EXACT NAMES!
═══════════════════════════════════════════════════════════════

We have already fetched these images for you:

{image_list}

⚠️ CRITICAL - USE THESE EXACT PROP NAMES:
- image1, image2, image3, etc. - these are the ONLY image props that will work!
- Each has a REAL photo already loaded and ready to display
- DO NOT create custom prop names like "elonMuskImage" - use image1, image2, etc.

REQUIRED PATTERN - Copy this exactly:
```html
<script>
  const image1 = props.image1 || '';
  const image2 = props.image2 || '';
  const image3 = props.image3 || '';
</script>

<img src="${{image1}}" alt="{prefetched_images.get('image1_query', 'Image 1')}" style="object-fit:cover;">
<img src="${{image2}}" alt="{prefetched_images.get('image2_query', 'Image 2')}" style="object-fit:cover;">
```

✅ These images WILL display - use them for hero images, cards, backgrounds, etc.
"""

        return f"""{full_slide_instructions}═══════════════════════════════════════════════════════════════
🎯 YOUR MISSION
═══════════════════════════════════════════════════════════════

Create a STUNNING {"full presentation slide" if is_full_slide else "interactive component"} for:

SLIDE: "{slide_title}" (Slide {slide_index} of {total_slides})
{design_context_section}{external_media_section}{uploaded_media_section}{prefetched_images_section}
CONTENT:
{content}

DIMENSIONS: {width}px × {height}px (FILL THIS SPACE!)

═══════════════════════════════════════════════════════════════
🧠 CONTENT ANALYSIS
═══════════════════════════════════════════════════════════════

{content_analysis}

═══════════════════════════════════════════════════════════════
🎨 DESIGN TOKENS (USE THESE!)
═══════════════════════════════════════════════════════════════

--accent: {accent}
--secondary: {secondary}
--text: {text_color}
--font-hero: '{hero_font}'
--font-body: '{body_font}'

═══════════════════════════════════════════════════════════════
📋 FULL WORKING EXAMPLE - INTERACTIVE QUIZ
═══════════════════════════════════════════════════════════════

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    :root {{
      --accent: {accent};
      --secondary: {secondary};
      --text: {text_color};
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; overflow: hidden; background: transparent; font-family: '{body_font}', sans-serif; }}
    body {{ display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 48px; gap: 32px; }}

    .question {{ font-size: 32px; font-weight: 700; color: var(--text); text-align: center; max-width: 900px; line-height: 1.4; }}

    .options {{ display: flex; flex-direction: column; gap: 16px; width: 100%; max-width: 700px; }}

    .option {{
      padding: 20px 32px;
      border-radius: 16px;
      background: rgba(255,255,255,0.05);
      border: 2px solid rgba(255,255,255,0.1);
      color: var(--text);
      font-size: 20px;
      font-weight: 500;
      cursor: pointer;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      display: flex;
      align-items: center;
      gap: 16px;
    }}

    .option:hover {{
      background: rgba(255,255,255,0.1);
      border-color: var(--accent);
      transform: translateX(8px);
    }}

    .option.selected {{
      background: var(--accent);
      border-color: var(--accent);
      transform: scale(1.02);
    }}

    .option.correct {{
      background: rgba(16, 185, 129, 0.2);
      border-color: #10B981;
    }}

    .option.wrong {{
      background: rgba(239, 68, 68, 0.2);
      border-color: #EF4444;
    }}

    .letter {{
      width: 36px;
      height: 36px;
      border-radius: 50%;
      background: rgba(255,255,255,0.1);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 700;
      font-size: 16px;
    }}

    .option.selected .letter {{ background: rgba(255,255,255,0.3); }}
    .option.correct .letter {{ background: #10B981; }}
    .option.wrong .letter {{ background: #EF4444; }}

    .feedback {{
      font-size: 24px;
      font-weight: 600;
      padding: 16px 32px;
      border-radius: 12px;
      opacity: 0;
      transform: translateY(10px);
      transition: all 0.3s;
    }}

    .feedback.show {{
      opacity: 1;
      transform: translateY(0);
    }}

    .feedback.correct {{ background: rgba(16, 185, 129, 0.2); color: #10B981; }}
    .feedback.wrong {{ background: rgba(239, 68, 68, 0.2); color: #EF4444; }}

    @keyframes confetti {{
      0% {{ transform: translateY(0) rotate(0deg); opacity: 1; }}
      100% {{ transform: translateY(-200px) rotate(720deg); opacity: 0; }}
    }}

    .confetti {{
      position: fixed;
      width: 10px;
      height: 10px;
      border-radius: 2px;
      animation: confetti 1s ease-out forwards;
    }}
  </style>
</head>
<body>
  <div class="question">What programming language was Pokémon Red/Blue originally written in?</div>

  <div class="options">
    <div class="option" onclick="selectAnswer(this, 0)">
      <span class="letter">A</span>
      <span>C++</span>
    </div>
    <div class="option" onclick="selectAnswer(this, 1)">
      <span class="letter">B</span>
      <span>Assembly</span>
    </div>
    <div class="option" onclick="selectAnswer(this, 2)">
      <span class="letter">C</span>
      <span>Java</span>
    </div>
    <div class="option" onclick="selectAnswer(this, 3)">
      <span class="letter">D</span>
      <span>Python</span>
    </div>
  </div>

  <div id="feedback" class="feedback"></div>

  <script>
    const correctAnswer = 1; // Assembly
    let answered = false;

    function selectAnswer(el, index) {{
      if (answered) return;
      answered = true;

      const options = document.querySelectorAll('.option');
      const feedback = document.getElementById('feedback');

      el.classList.add('selected');

      setTimeout(() => {{
        options.forEach((opt, i) => {{
          if (i === correctAnswer) {{
            opt.classList.add('correct');
          }} else if (i === index && i !== correctAnswer) {{
            opt.classList.add('wrong');
          }}
        }});

        if (index === correctAnswer) {{
          feedback.textContent = '✓ Correct! Pokémon was coded in Assembly for the Game Boy.';
          feedback.className = 'feedback correct show';
          createConfetti();
        }} else {{
          feedback.textContent = '✗ Not quite! The answer is Assembly.';
          feedback.className = 'feedback wrong show';
        }}
      }}, 300);
    }}

    function createConfetti() {{
      const colors = ['{accent}', '{secondary}', '#10B981', '#F59E0B'];
      for (let i = 0; i < 50; i++) {{
        const confetti = document.createElement('div');
        confetti.className = 'confetti';
        confetti.style.left = Math.random() * 100 + '%';
        confetti.style.top = Math.random() * 50 + 50 + '%';
        confetti.style.background = colors[Math.floor(Math.random() * colors.length)];
        confetti.style.animationDelay = Math.random() * 0.5 + 's';
        document.body.appendChild(confetti);
        setTimeout(() => confetti.remove(), 1500);
      }}
    }}
  </script>
</body>
</html>

═══════════════════════════════════════════════════════════════
🚀 NOW CREATE YOUR COMPONENT!
═══════════════════════════════════════════════════════════════

Based on the content above, create an AMAZING interactive component.

REQUIREMENTS:
✓ Use the exact CSS variables (--accent, --secondary, --text)
✓ Include JavaScript interactivity (onclick, animations)
✓ Fill the full {width}x{height} space
✓ Make it visually stunning with animations
✓ Add hover effects and transitions

OUTPUT: Complete HTML document starting with <!DOCTYPE html>"""

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
        """
        import re

        if not html or not prefetched_images:
            return html

        # Get only actual image URLs (not the _query hints)
        image_urls = [v for k, v in prefetched_images.items() if not k.endswith('_query') and v.startswith('http')]

        if not image_urls:
            logger.warning("[IMAGE_INJECT] No valid image URLs to inject")
            return html

        logger.info(f"[IMAGE_INJECT] Starting guaranteed injection with {len(image_urls)} images")
        print(f"[IMAGE_INJECT] 🔧 Injecting {len(image_urls)} real URLs into HTML...")

        result = html
        images_injected = 0
        image_index = 0

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

        # PATTERN 3: Replace JavaScript variable assignments
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
        Tell the model to create a detailed creative vision before building.
        No hardcoded logic - the model decides everything.
        """
        return f"""
═══════════════════════════════════════════════════════════════
📋 CONTENT TO VISUALIZE
═══════════════════════════════════════════════════════════════

TITLE: {title}

CONTENT:
{content}

═══════════════════════════════════════════════════════════════
🧠 STEP 1: CREATE YOUR DETAILED CREATIVE BRIEF
═══════════════════════════════════════════════════════════════

Before writing ANY code, think deeply and write out your creative vision:

1. SUBJECT ANALYSIS
   - What is this content fundamentally about?
   - What are the key concepts, objects, or ideas?
   - What emotions should this evoke?

2. VISUAL METAPHOR
   - What real-world object or experience represents this content?
   - Examples of strong metaphors:
     * Watches/time → animated clock with sweeping hands
     * Growth/progress → rising bars, filling containers, climbing graphs
     * Journey/history → timeline with waypoints, path animation
     * Comparison → split screen, before/after slider, versus battle
     * Learning/quiz → interactive flashcards, clickable answers
     * Data/stats → counting numbers, progress rings, animated charts
     * Products → 3D showcase, exploded view, feature hotspots
     * Process → step-by-step flow, animated diagram, click-through guide

3. INTERACTION DESIGN
   - What should users DO with this? (click, hover, drag, scroll)
   - What happens when they interact? (reveal, animate, transform, celebrate)
   - What's the "delightful moment"? (confetti on success, smooth transitions, satisfying animations)

4. VISUAL STYLE
   - What's the mood? (playful, professional, dramatic, elegant, futuristic)
   - What animations bring it to life? (fade, slide, scale, rotate, morph, bounce, glow)
   - How do the theme colors enhance the experience?

5. DETAILED COMPONENT DESCRIPTION
   Write 2-3 sentences describing EXACTLY what you will build:
   "I will create a [type of visualization] that shows [content] through [visual metaphor].
   Users can [interaction] to [result]. The animation will [specific animation details]."

═══════════════════════════════════════════════════════════════
🚀 STEP 2: BUILD YOUR VISION
═══════════════════════════════════════════════════════════════

Now execute your creative brief with beautiful HTML/CSS/JS.

CRITICAL RULES:
- Your visualization must EMBODY the content, not just display text
- Include meaningful interactivity (onclick, hover states, animations)
- Use smooth CSS transitions and keyframe animations
- Fill the entire canvas with your creation
- Make it something people would screenshot and share

FORBIDDEN:
- Static colored cards in a grid
- Bullet points or plain text lists
- Generic rectangles with text inside
- Anything that looks like a boring PowerPoint slide

Think: "If Apple or Stripe built an interactive visualization for this content, what would it look like?"
"""

    def _is_title_slide(self, slide_context: Dict[str, Any]) -> bool:
        """Detect if this is a title/cover slide."""
        slide_index = slide_context.get('slide_index', 0)
        slide_type = slide_context.get('slide_type', '').lower()
        title = slide_context.get('title', '').lower()

        # First slide is always title
        if slide_index == 0:
            return True

        # Check slide type
        if any(t in slide_type for t in ['title', 'cover', 'intro', 'opening']):
            return True

        # Check title keywords
        if any(t in title for t in ['welcome', 'introduction', 'overview']):
            return True

        return False

    def _build_title_slide_system_prompt(
        self,
        colors: Dict[str, str],
        typography: Dict[str, str],
        style_keywords: list
    ) -> str:
        """Build specialized system prompt for stunning title slides."""

        style_desc = ", ".join(style_keywords) if style_keywords else "modern, professional"

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        return f"""You are a WORLD-CLASS MOTION GRAPHICS DESIGNER creating STUNNING ANIMATED TITLE SLIDES.

You create title slides that make audiences gasp - the kind you see at Apple keynotes, TED talks, and award shows.

═══════════════════════════════════════════════════════════════
🎨 DESIGN SYSTEM (USE THESE EXACT COLORS!)
═══════════════════════════════════════════════════════════════

:root {{
  --accent: {accent};
  --secondary: {secondary};
  --text: {text_color};
  --bg: {bg_color};
  --font-hero: '{hero_font}', sans-serif;
  --font-body: '{body_font}', sans-serif;
}}

STYLE: {style_desc}

═══════════════════════════════════════════════════════════════
🚀 TITLE SLIDE DESIGN PATTERNS - PICK ONE AND EXECUTE PERFECTLY
═══════════════════════════════════════════════════════════════

🎯 PATTERN 1: ANIMATED TEXT REVEAL
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Letters animate in one by one with bounce/fade
- Gradient text that shimmers with animation
- Subtitle fades in after title completes
- Minimal, elegant, Apple-style

🎯 PATTERN 2: PARTICLE BACKGROUND
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Floating particles/dots in accent colors
- Particles drift slowly, creating atmosphere
- Title sits prominently over the particles
- Feels dynamic and premium

🎯 PATTERN 3: GRADIENT MORPH
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Background gradient slowly animates/shifts
- Multiple color stops that smoothly transition
- Creates a "living" background effect
- Title uses glassmorphism or solid for contrast

🎯 PATTERN 4: SPOTLIGHT/GLOW EFFECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Subtle spotlight or radial glow behind title
- Animated pulse or breathing effect
- Creates dramatic focus on the title
- Premium, cinematic feel

🎯 PATTERN 5: GEOMETRIC ACCENTS
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- Animated lines, circles, or shapes
- Shapes orbit or draw themselves
- Creates visual interest without overwhelming
- Modern, tech-forward aesthetic

🎯 PATTERN 6: WAVE/RIPPLE EFFECT
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
- SVG wave animation at bottom
- Or ripple effect behind title
- Creates organic, flowing feel
- Works great with gradient backgrounds

═══════════════════════════════════════════════════════════════
💎 REQUIRED VISUAL TECHNIQUES
═══════════════════════════════════════════════════════════════

MASSIVE TYPOGRAPHY:
- Title: 80-160px font size (HUGE!)
- Use hero font: '{hero_font}'
- Letter-spacing: -0.02em to -0.04em for tightness
- Line-height: 0.95 to 1.1 for compact feel

GRADIENT TEXT (when appropriate):
background: linear-gradient(135deg, {accent}, {secondary});
-webkit-background-clip: text;
-webkit-text-fill-color: transparent;

GLOW EFFECTS:
text-shadow: 0 0 40px {accent}60, 0 0 80px {accent}30;
OR
box-shadow: 0 0 60px {accent}40;

SMOOTH ANIMATIONS:
- Use CSS animations with cubic-bezier easing
- Duration: 0.5s-2s for reveals
- animation-fill-mode: forwards for end states

STAGGER EFFECTS:
animation-delay: calc(var(--i) * 0.1s);

═══════════════════════════════════════════════════════════════
🚫 ABSOLUTELY FORBIDDEN ON TITLE SLIDES
═══════════════════════════════════════════════════════════════

❌ Static, boring layouts with no animation
❌ Bullet points or lists (this is a TITLE slide!)
❌ Multiple text blocks competing for attention
❌ Tiny fonts (minimum 48px for subtitle, 80px+ for title)
❌ Generic corporate template look
❌ Hardcoded colors (MUST use CSS variables)
❌ Cluttered designs - keep it CLEAN and IMPACTFUL
❌ Decorative icons or emojis

═══════════════════════════════════════════════════════════════
📐 OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family={hero_font.replace(' ', '+')}:wght@400;700;900&family={body_font.replace(' ', '+')}:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --accent: {accent};
      --secondary: {secondary};
      --text: {text_color};
      --bg: {bg_color};
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      font-family: '{hero_font}', sans-serif;
      color: var(--text);
    }}
    body {{
      display: flex;
      align-items: center;
      justify-content: center;
    }}
    /* Your stunning animations and styles */
  </style>
</head>
<body>
  <!-- STUNNING ANIMATED TITLE CONTENT -->
  <script>
    // Optional: JavaScript for complex animations
  </script>
</body>
</html>"""

    def _build_title_slide_user_prompt(
        self,
        content: str,
        slide_context: Dict[str, Any],
        colors: Dict[str, str],
        typography: Dict[str, str],
        width: int,
        height: int
    ) -> str:
        """Build user prompt specifically for title slides."""

        title = slide_context.get('title', 'Presentation Title')
        total_slides = slide_context.get('total_slides', 1)

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        # Get presentation context (user's original request) for design cues
        presentation_context = slide_context.get('presentation_context', '')

        # Parse content for subtitle/presenter info
        subtitle = ""
        presenter = ""
        if content:
            lines = content.strip().split('\n')
            if lines:
                subtitle = lines[0] if len(lines) > 0 else ""
                presenter = lines[1] if len(lines) > 1 else ""

        # Build design context section if user provided design cues
        design_context_section = ""
        if presentation_context:
            design_context_section = f"""
═══════════════════════════════════════════════════════════════
🎨 USER'S DESIGN PREFERENCES (Review for style/design cues ONLY)
═══════════════════════════════════════════════════════════════

The user originally requested: "{presentation_context}"

⚠️ IMPORTANT: Review this ONLY for design/style hints such as:
- Visual style preferences (minimalist, bold, playful, corporate, etc.)
- Animation preferences (subtle, dramatic, none, etc.)
- Layout preferences (clean, dense, spacious, etc.)
- Mood/tone (professional, fun, serious, energetic, etc.)

DO NOT use this for content - the title slide content is provided separately.
"""

        return f"""═══════════════════════════════════════════════════════════════
🎬 CREATE A STUNNING TITLE SLIDE
═══════════════════════════════════════════════════════════════

PRESENTATION TITLE: "{title}"
SUBTITLE/TAGLINE: "{subtitle}"
PRESENTER/INFO: "{presenter}"
TOTAL SLIDES: {total_slides}

DIMENSIONS: {width}px × {height}px (FILL THE ENTIRE SPACE!)
{design_context_section}

═══════════════════════════════════════════════════════════════
🎨 DESIGN TOKENS
═══════════════════════════════════════════════════════════════

--accent: {accent}
--secondary: {secondary}
--text: {text_color}
--font-hero: '{hero_font}'
--font-body: '{body_font}'

═══════════════════════════════════════════════════════════════
📋 EXAMPLE: ANIMATED TEXT REVEAL TITLE SLIDE
═══════════════════════════════════════════════════════════════

<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link href="https://fonts.googleapis.com/css2?family={hero_font.replace(' ', '+')}:wght@700;900&family={body_font.replace(' ', '+')}:wght@400;600&display=swap" rel="stylesheet">
  <style>
    :root {{
      --accent: {accent};
      --secondary: {secondary};
      --text: {text_color};
      --bg: {colors.get('primary_background', '#0a0e27')};
    }}
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: var(--bg);
      font-family: '{hero_font}', sans-serif;
    }}
    body {{
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 60px;
      position: relative;
    }}

    /* Animated gradient background */
    .bg-gradient {{
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: linear-gradient(135deg, var(--bg) 0%, color-mix(in srgb, var(--accent) 15%, var(--bg)) 50%, var(--bg) 100%);
      background-size: 200% 200%;
      animation: gradientShift 8s ease infinite;
    }}

    @keyframes gradientShift {{
      0%, 100% {{ background-position: 0% 50%; }}
      50% {{ background-position: 100% 50%; }}
    }}

    /* Floating particles */
    .particles {{
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      overflow: hidden;
      pointer-events: none;
    }}

    .particle {{
      position: absolute;
      width: 4px;
      height: 4px;
      border-radius: 50%;
      background: var(--accent);
      opacity: 0.3;
      animation: float 15s infinite ease-in-out;
    }}

    @keyframes float {{
      0%, 100% {{ transform: translateY(0) translateX(0); }}
      25% {{ transform: translateY(-20px) translateX(10px); }}
      50% {{ transform: translateY(-10px) translateX(-10px); }}
      75% {{ transform: translateY(-30px) translateX(5px); }}
    }}

    /* Main title container */
    .content {{
      position: relative;
      z-index: 10;
      text-align: center;
      max-width: 1600px;
    }}

    /* Animated title */
    .title {{
      font-size: 120px;
      font-weight: 900;
      letter-spacing: -0.03em;
      line-height: 1.0;
      background: linear-gradient(135deg, var(--text) 0%, var(--accent) 50%, var(--secondary) 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      animation: titleReveal 1.2s cubic-bezier(0.16, 1, 0.3, 1) forwards;
      opacity: 0;
      transform: translateY(40px);
    }}

    @keyframes titleReveal {{
      to {{
        opacity: 1;
        transform: translateY(0);
      }}
    }}

    /* Glow effect behind title */
    .title-glow {{
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      width: 600px;
      height: 300px;
      background: radial-gradient(ellipse, var(--accent) 0%, transparent 70%);
      opacity: 0.15;
      filter: blur(60px);
      animation: glowPulse 4s ease-in-out infinite;
    }}

    @keyframes glowPulse {{
      0%, 100% {{ opacity: 0.15; transform: translate(-50%, -50%) scale(1); }}
      50% {{ opacity: 0.25; transform: translate(-50%, -50%) scale(1.1); }}
    }}

    /* Subtitle */
    .subtitle {{
      font-family: '{body_font}', sans-serif;
      font-size: 32px;
      font-weight: 400;
      color: var(--text);
      opacity: 0;
      margin-top: 32px;
      animation: subtitleFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.6s forwards;
    }}

    @keyframes subtitleFade {{
      to {{ opacity: 0.8; }}
    }}

    /* Presenter info */
    .presenter {{
      font-family: '{body_font}', sans-serif;
      font-size: 20px;
      color: var(--accent);
      opacity: 0;
      margin-top: 48px;
      animation: subtitleFade 0.8s cubic-bezier(0.16, 1, 0.3, 1) 0.9s forwards;
    }}

    /* Decorative line */
    .line {{
      width: 120px;
      height: 3px;
      background: linear-gradient(90deg, var(--accent), var(--secondary));
      margin: 32px auto 0;
      border-radius: 2px;
      transform: scaleX(0);
      animation: lineGrow 0.6s cubic-bezier(0.16, 1, 0.3, 1) 1.2s forwards;
    }}

    @keyframes lineGrow {{
      to {{ transform: scaleX(1); }}
    }}
  </style>
</head>
<body>
  <div class="bg-gradient"></div>

  <div class="particles">
    <div class="particle" style="left: 10%; top: 20%; animation-delay: 0s;"></div>
    <div class="particle" style="left: 20%; top: 60%; animation-delay: 2s;"></div>
    <div class="particle" style="left: 35%; top: 30%; animation-delay: 4s;"></div>
    <div class="particle" style="left: 50%; top: 70%; animation-delay: 1s;"></div>
    <div class="particle" style="left: 65%; top: 25%; animation-delay: 3s;"></div>
    <div class="particle" style="left: 80%; top: 55%; animation-delay: 5s;"></div>
    <div class="particle" style="left: 90%; top: 40%; animation-delay: 2.5s;"></div>
  </div>

  <div class="content">
    <div class="title-glow"></div>
    <h1 class="title">The Future of AI</h1>
    <p class="subtitle">Transforming How We Work and Live</p>
    <div class="line"></div>
    <p class="presenter">John Smith • TechCorp • 2024</p>
  </div>
</body>
</html>

═══════════════════════════════════════════════════════════════
🚀 NOW CREATE YOUR TITLE SLIDE!
═══════════════════════════════════════════════════════════════

Create a STUNNING animated title slide for:
TITLE: "{title}"
{f'SUBTITLE: "{subtitle}"' if subtitle else ''}
{f'PRESENTER: "{presenter}"' if presenter else ''}

REQUIREMENTS:
✓ MASSIVE title (80-160px) with animation
✓ Use gradient text or solid with glow effect
✓ Include at least ONE animation (reveal, particles, gradient shift, etc.)
✓ Use exact CSS variables (--accent, --secondary, --text)
✓ Fill the full {width}x{height} space
✓ Keep it clean - title is the HERO, everything else supports it

Choose ONE of these approaches:
1. Animated text reveal with staggered letters
2. Particle background with floating dots
3. Morphing gradient background
4. Spotlight/glow focus effect
5. Geometric animated accents
6. Wave/ripple animation

OUTPUT: Complete HTML document starting with <!DOCTYPE html>"""

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
