"""
ThemeAgent - Smart theme detection that understands context.

The agent decides:
1. Is this a REAL brand? → Fetch from Brandfetch
2. Is this INSPIRED by something? (Sonic, retro, etc.) → Generate contextual colors
3. Generic topic? → Generate nice complementary colors
4. User specified colors? → Use those

Simple. Agentic. Context-aware.
"""

import asyncio
import logging
import os
import json
from typing import Dict, Any, Optional, List

logger = logging.getLogger(__name__)


def _validate_font_against_registry(font_name: str) -> Optional[str]:
    """Validate that a font exists in the system registry."""
    if not font_name:
        return None

    try:
        from services.registry_fonts import RegistryFonts
        available_fonts = RegistryFonts.get_all_fonts_list(None)

        # Direct match
        if font_name in available_fonts:
            return font_name

        # Case-insensitive match
        font_lower = font_name.lower().strip()
        available_lower = {f.lower(): f for f in available_fonts}
        if font_lower in available_lower:
            return available_lower[font_lower]

        # Partial match
        for avail_font in available_fonts:
            if font_lower in avail_font.lower() or avail_font.lower() in font_lower:
                return avail_font

        return None
    except Exception as e:
        logger.warning(f"[ThemeAgent] Font validation error: {e}")
        return None


class ThemeAgent:
    """
    Smart theme agent that understands context and makes appropriate decisions.
    """

    def __init__(self):
        pass

    async def run(self, title: str, prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
        """
        Run the theme agent to determine the best theme for the presentation.

        Returns:
            Dict with: colors, background, text, accent, accent2, fonts, logo_url, source
        """
        logger.info(f"[ThemeAgent] Starting for: {title[:50]}...")

        # Default result
        result = {
            "brand_name": None,
            "domain": None,
            "colors": [],
            "background": "#FFFFFF",
            "text": "#1A1A1A",
            "accent": None,
            "accent2": None,
            "fonts": {"hero": "Montserrat", "body": "Open Sans"},
            "logo_url": None,
            "videos": [],  # List of video dicts from the brand's website
            "source": "default"
        }

        try:
            # Step 1: Ask AI to analyze what kind of theme we need
            logger.info(f"[ThemeAgent] Step 1: Analyzing theme needs...")
            theme_analysis = await self._analyze_theme_needs(title, prompt, context)
            logger.info(f"[ThemeAgent] Analysis result: {theme_analysis}")

            if not theme_analysis:
                logger.warning("[ThemeAgent] Analysis failed, using defaults")
                return result

            theme_type = theme_analysis.get("type", "generic")

            # Step 2: Handle based on theme type
            if theme_type == "real_brand" and theme_analysis.get("domain"):
                # Real brand - try Brandfetch
                domain = theme_analysis["domain"]
                logger.info(f"[ThemeAgent] Real brand detected: {theme_analysis.get('brand')} → {domain}")
                brand_data = await self._fetch_brandfetch(domain)

                if brand_data and brand_data.get("colors"):
                    result["brand_name"] = theme_analysis.get("brand")
                    result["domain"] = domain
                    result["colors"] = brand_data["colors"]
                    result["background"] = "#FFFFFF"
                    result["accent"] = brand_data["colors"][0] if brand_data["colors"] else None
                    result["accent2"] = brand_data["colors"][1] if len(brand_data["colors"]) > 1 else None
                    result["text"] = "#1A1A1A"
                    result["logo_url"] = brand_data.get("logo_url")
                    result["source"] = "brandfetch"

                    # Get fonts
                    if brand_data.get("fonts"):
                        font = brand_data["fonts"][0]
                        validated = _validate_font_against_registry(font)
                        if validated:
                            result["fonts"]["hero"] = validated

                    # Fetch videos from the brand's website (parallel, non-blocking)
                    try:
                        videos = await self._fetch_brand_videos(domain)
                        result["videos"] = videos
                        if videos:
                            logger.info(f"[ThemeAgent] 🎬 Found {len(videos)} videos from {domain}")
                    except Exception as e:
                        logger.warning(f"[ThemeAgent] Video fetch error (non-blocking): {e}")

                    # Also fetch brand design (screenshot + additional context) for custom component gen
                    # This runs in parallel and augments the result with visual reference
                    try:
                        brand_design = await self._fetch_brand_design(domain)
                        if brand_design:
                            result["brand_design"] = brand_design
                            logger.info(f"[ThemeAgent] 🎨 Got brand design context for {domain}")
                    except Exception as e:
                        logger.warning(f"[ThemeAgent] Brand design fetch error (non-blocking): {e}")

                    logger.info(f"[ThemeAgent] ✅ Brandfetch success: {result['colors'][:3]}")
                    return result
                else:
                    # Brandfetch failed, try Firecrawl brand design for colors, logo, AND screenshot
                    logger.info("[ThemeAgent] Brandfetch failed, trying Firecrawl brand design...")
                    brand_design = await self._fetch_brand_design(domain)

                    if brand_design:
                        result["brand_design"] = brand_design
                        result["domain"] = domain
                        result["brand_name"] = theme_analysis.get("brand")

                        # Extract colors from Firecrawl branding
                        fc_colors = brand_design.get("colors", {})
                        if fc_colors:
                            # Build color list from Firecrawl branding
                            color_list = []
                            for key in ["primary", "secondary", "accent", "background"]:
                                if fc_colors.get(key):
                                    color_list.append(fc_colors[key])

                            if color_list:
                                result["colors"] = color_list
                                result["accent"] = fc_colors.get("primary") or fc_colors.get("accent")
                                result["accent2"] = fc_colors.get("secondary") or fc_colors.get("accent")
                                result["background"] = fc_colors.get("background", "#FFFFFF")
                                result["text"] = fc_colors.get("textPrimary", "#1A1A1A")
                                result["source"] = "firecrawl_branding"
                                logger.info(f"[ThemeAgent] ✅ Firecrawl branding colors: {color_list[:3]}")

                        # Extract logo
                        if brand_design.get("logo"):
                            result["logo_url"] = brand_design["logo"]

                        # Extract fonts (Firecrawl returns dicts like {'family': 'Arial', 'count': 102})
                        fc_fonts = brand_design.get("fonts", [])
                        if fc_fonts:
                            first_font = fc_fonts[0]
                            font_name = first_font.get('family') if isinstance(first_font, dict) else first_font
                            if font_name:
                                validated = _validate_font_against_registry(font_name)
                                if validated:
                                    result["fonts"]["hero"] = validated
                    else:
                        # Full fallback - just try to get logo
                        logo_url = await self._fetch_logo_from_website(domain)
                        if logo_url:
                            result["logo_url"] = logo_url
                            result["domain"] = domain
                            result["brand_name"] = theme_analysis.get("brand")

                    # Still try to fetch videos even if Brandfetch failed
                    try:
                        videos = await self._fetch_brand_videos(domain)
                        result["videos"] = videos
                        if videos:
                            logger.info(f"[ThemeAgent] 🎬 Found {len(videos)} videos from {domain}")
                    except Exception as e:
                        logger.warning(f"[ThemeAgent] Video fetch error (non-blocking): {e}")

            # Step 3: Generate contextual colors based on the theme
            # This handles: inspired_by, fictional_brand, topic_based, generic
            logger.info(f"[ThemeAgent] Step 3: Generating contextual theme (type={theme_type}, inspiration={theme_analysis.get('inspiration')})")
            contextual_theme = await self._generate_contextual_theme(
                title=title,
                prompt=prompt,
                context=context,
                inspiration=theme_analysis.get("inspiration"),
                mood=theme_analysis.get("mood"),
                theme_type=theme_type
            )

            if contextual_theme:
                result["colors"] = contextual_theme.get("colors", [])
                result["background"] = contextual_theme.get("background", "#FFFFFF")
                result["text"] = contextual_theme.get("text", "#1A1A1A")
                result["accent"] = contextual_theme.get("accent")
                result["accent2"] = contextual_theme.get("accent2")
                result["fonts"] = contextual_theme.get("fonts", result["fonts"])
                result["source"] = contextual_theme.get("source", "ai_generated")

                logger.info(f"[ThemeAgent] ✅ Contextual theme: {result['colors'][:3]}, source={result['source']}")

            return result

        except Exception as e:
            logger.error(f"[ThemeAgent] Error: {e}")
            return result

    async def _analyze_theme_needs(self, title: str, prompt: str, context: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Use AI to analyze what kind of theme is needed.

        Returns:
            {
                "type": "real_brand" | "inspired_by" | "fictional_brand" | "topic_based" | "generic",
                "brand": str or None,
                "domain": str or None (for real brands),
                "inspiration": str or None (what it's inspired by - e.g., "Sonic the Hedgehog", "retro gaming"),
                "mood": str (e.g., "fun", "professional", "energetic", "calm"),
                "suggested_colors": list or None (if user mentioned colors)
            }
        """
        try:
            from agents.ai.clients import get_client, invoke
            from agents.config import THEME_MODEL

            analysis_prompt = f"""Analyze this presentation to determine the best theme approach.

Title: {title}
Prompt: {prompt}
Context: {context or 'None'}

Determine:
1. Is this about a REAL company/brand with a website? (e.g., Apple, Nike, McDonald's)
2. Is this INSPIRED BY something with known colors? (e.g., "Sonic the Hedgehog" = blue/red/gold, "retro gaming" = neon colors)
3. Is this a fictional brand that should look like something? (e.g., "SonicVerse" should look Sonic-inspired)
4. Is this topic-based where colors should match the subject? (e.g., "Ocean Conservation" = blues/greens)
5. Is this generic where any nice colors work?

Return JSON:
{{
    "type": "real_brand" | "inspired_by" | "fictional_brand" | "topic_based" | "generic",
    "brand": "brand name if applicable",
    "domain": "domain.com if it's a real brand with a website, null otherwise",
    "inspiration": "what it's inspired by (e.g., 'Sonic the Hedgehog', 'retro arcade games', 'ocean/nature')",
    "mood": "fun/professional/energetic/calm/bold/playful/serious",
    "color_hints": ["any colors mentioned or implied, e.g., 'blue', 'Sonic blue', 'neon'"]
}}

IMPORTANT:
- "real_brand" = companies/brands with websites (Apple, Nike, etc.) - we'll fetch their official colors
- "inspired_by" = inspired by something with recognizable colors (Sonic, Star Wars, retro gaming, etc.)
- For fictional variants like "SonicVerse" - type should be "inspired_by" with inspiration="Sonic the Hedgehog"
- Always identify the core INSPIRATION so we can generate appropriate colors"""

            client, actual_model = get_client(THEME_MODEL)
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for {THEME_MODEL}")
                return None
            logger.info(f"[ThemeAgent] Using model: {actual_model}")
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": analysis_prompt}],
                max_tokens=300,
                temperature=0,
                theme_generation=True
            )
            logger.info(f"[ThemeAgent] Analysis response type: {type(response)}, preview: {str(response)[:200]}")

            # Parse JSON from response
            try:
                # Handle both string and dict responses
                response_text = response.get("content") if isinstance(response, dict) else response
                # Find JSON in response
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = response_text[json_start:json_end]
                    return json.loads(json_str)
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning(f"[ThemeAgent] Failed to parse analysis: {str(response)[:200]}, error: {e}")
                return None

        except Exception as e:
            import traceback
            logger.error(f"[ThemeAgent] Analysis error: {e}")
            logger.error(f"[ThemeAgent] Analysis traceback: {traceback.format_exc()}")
            return None

    async def _fetch_brandfetch(self, domain: str) -> Optional[Dict[str, Any]]:
        """Fetch brand data from Brandfetch with timeout."""
        try:
            from services.simple_brandfetch_cache import SimpleBrandfetchCache

            db_url = os.getenv('DATABASE_URL')
            if not db_url:
                logger.warning("[ThemeAgent] No DATABASE_URL")
                return None

            logger.info(f"[ThemeAgent] Fetching Brandfetch: {domain}")

            try:
                async with asyncio.timeout(15):
                    async with SimpleBrandfetchCache(db_url) as cache:
                        brand_data = await cache.get_brand_data(domain)
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Brandfetch timeout: {domain}")
                return None

            if brand_data and not brand_data.get('error'):
                # Extract colors
                colors_data = brand_data.get('colors', {})
                colors = []
                if isinstance(colors_data, dict):
                    colors = colors_data.get('hex_list', []) or colors_data.get('hex', []) or colors_data.get('colors', [])
                elif isinstance(colors_data, list):
                    colors = [c.get('hex') if isinstance(c, dict) else c for c in colors_data]

                # Extract fonts
                fonts_data = brand_data.get('fonts', {})
                fonts = fonts_data.get('names', []) if isinstance(fonts_data, dict) else []

                # Extract logo
                logos = brand_data.get('logos', {})
                logo_url = None
                for logo_type in ['light', 'dark', 'icons']:
                    items = logos.get(logo_type, [])
                    if items and isinstance(items, list) and items[0]:
                        item = items[0]
                        if isinstance(item, dict):
                            formats = item.get('formats', [])
                            if formats:
                                logo_url = formats[0].get('url')
                                break

                return {
                    "colors": [c.upper() if isinstance(c, str) else c for c in colors if c],
                    "fonts": fonts,
                    "logo_url": logo_url
                }

            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brandfetch error: {e}")
            return None

    async def _fetch_brand_videos(self, domain: str, max_videos: int = 5) -> List[Dict[str, Any]]:
        """
        Fetch videos from a brand's website.

        Args:
            domain: Brand domain (e.g., 'dyna.co')
            max_videos: Maximum number of videos to return

        Returns:
            List of video dictionaries with url, source_type, thumbnail, etc.
        """
        try:
            from services.video_scraper_service import get_brand_videos

            logger.info(f"[ThemeAgent] 🎬 Fetching videos from: {domain}")

            # Set timeout for video fetching
            try:
                async with asyncio.timeout(10):
                    videos = await get_brand_videos(domain, max_videos)
                    return videos
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Video fetch timeout for {domain}")
                return []

        except Exception as e:
            logger.warning(f"[ThemeAgent] Video fetch error for {domain}: {e}")
            return []

    async def _fetch_brand_design(self, domain: str) -> Optional[Dict[str, Any]]:
        """
        Fetch comprehensive brand design from website using Firecrawl.

        Returns colors, fonts, logo, AND screenshot for visual reference.
        This is used to give the custom component generator visual context.
        """
        try:
            from services.firecrawl_service import get_firecrawl_service

            firecrawl = get_firecrawl_service()
            if not firecrawl.is_configured():
                logger.warning("[ThemeAgent] Firecrawl not configured for brand design")
                return None

            url = f"https://{domain}"
            logger.info(f"[ThemeAgent] 🎨 Fetching brand design from {url}")

            # Run in executor since it's a blocking HTTP call
            loop = asyncio.get_event_loop()
            try:
                async with asyncio.timeout(30):
                    result = await loop.run_in_executor(
                        None,
                        lambda: firecrawl.extract_brand_design(url, include_screenshot=True)
                    )
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Brand design fetch timeout for {domain}")
                return None

            if not result.get("success"):
                logger.warning(f"[ThemeAgent] Brand design fetch failed: {result.get('error')}")
                return None

            brand_design = result.get("data", {})

            # Log what we got
            colors = brand_design.get("colors", {})
            fonts = brand_design.get("fonts", [])
            has_screenshot = bool(brand_design.get("screenshot"))
            has_logo = bool(brand_design.get("logo"))

            logger.info(f"[ThemeAgent] 🎨 Brand design extracted: "
                       f"{len(colors)} colors, {len(fonts)} fonts, "
                       f"screenshot={has_screenshot}, logo={has_logo}")

            return brand_design

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brand design fetch error: {e}")
            return None

    async def _fetch_logo_from_website(self, domain: str) -> Optional[str]:
        """Fallback: Try to get logo from website using Firecrawl."""
        try:
            from services.firecrawl_service import get_firecrawl_service

            firecrawl = get_firecrawl_service()
            if not firecrawl.is_configured():
                logger.warning("[ThemeAgent] Firecrawl not configured")
                return None

            url = f"https://{domain}"
            logger.info(f"[ThemeAgent] Fetching logo from website via Firecrawl: {url}")

            # Scrape the website for metadata
            result = firecrawl.scrape(url, formats=["markdown"])

            if not result.get("success"):
                logger.warning(f"[ThemeAgent] Firecrawl scrape failed: {result.get('error')}")
                return None

            data = result.get("data", {})
            metadata = data.get("metadata", {})

            # Try different metadata fields for logo
            logo_url = None

            # Check for explicit logo field
            if metadata.get("logo"):
                logo_url = metadata["logo"]
            # Check for Open Graph image (often company logo or main branding)
            elif metadata.get("ogImage"):
                logo_url = metadata["ogImage"]
            # Check for favicon
            elif metadata.get("favicon"):
                logo_url = metadata["favicon"]
            # Check for icon
            elif metadata.get("icon"):
                logo_url = metadata["icon"]

            if logo_url:
                # Ensure it's an absolute URL
                if logo_url.startswith("//"):
                    logo_url = f"https:{logo_url}"
                elif logo_url.startswith("/"):
                    logo_url = f"https://{domain}{logo_url}"

                logger.info(f"[ThemeAgent] ✅ Found logo via Firecrawl: {logo_url}")
                return logo_url

            logger.info("[ThemeAgent] No logo found in website metadata")
            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Firecrawl logo fetch error: {e}")
            return None

    async def _generate_contextual_theme(
        self,
        title: str,
        prompt: str,
        context: Optional[str],
        inspiration: Optional[str],
        mood: Optional[str],
        theme_type: str
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a contextually appropriate theme using AI.
        This is the smart part - it understands what colors make sense.
        """
        try:
            from agents.ai.clients import get_client, invoke
            from agents.config import THEME_MODEL

            # Build context for color generation
            color_context = f"""Generate a color palette for this presentation.

Title: {title}
Inspiration: {inspiration or 'None specified'}
Mood: {mood or 'professional'}
Theme type: {theme_type}

You know the official/iconic colors for brands, games, movies, TV shows, and cultural properties.
Use that knowledge - if this is inspired by Sonic, use Sonic's blue/red/gold. If it's Star Wars, use black/gold/white. Etc.

Return JSON with EXACTLY this format:
{{
    "background": "#FFFFFF or appropriate background color",
    "text": "#1A1A1A or appropriate text color",
    "accent": "primary accent color hex",
    "accent2": "secondary accent color hex",
    "colors": ["all colors as hex array"],
    "hero_font": "suggested hero font name",
    "body_font": "suggested body font name"
}}

Use the REAL colors you know for the inspiration. Return ONLY the JSON."""

            client, actual_model = get_client(THEME_MODEL)
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for {THEME_MODEL} in contextual theme")
                return None
            logger.info(f"[ThemeAgent] Generating contextual theme with model: {actual_model}")
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": color_context}],
                max_tokens=300,
                temperature=0.3,
                theme_generation=True
            )
            logger.info(f"[ThemeAgent] Contextual response type: {type(response)}, preview: {str(response)[:200]}")

            # Parse JSON
            try:
                # Handle both string and dict responses
                response_text = response.get("content") if isinstance(response, dict) else response
                json_start = response_text.find('{')
                json_end = response_text.rfind('}') + 1
                if json_start >= 0 and json_end > json_start:
                    json_str = response_text[json_start:json_end]
                    theme_data = json.loads(json_str)

                    # Validate and extract fonts
                    hero_font = theme_data.get("hero_font", "Montserrat")
                    body_font = theme_data.get("body_font", "Open Sans")

                    # Validate fonts against registry
                    validated_hero = _validate_font_against_registry(hero_font)
                    validated_body = _validate_font_against_registry(body_font)

                    return {
                        "background": theme_data.get("background", "#FFFFFF"),
                        "text": theme_data.get("text", "#1A1A1A"),
                        "accent": theme_data.get("accent"),
                        "accent2": theme_data.get("accent2"),
                        "colors": theme_data.get("colors", []),
                        "fonts": {
                            "hero": validated_hero or "Montserrat",
                            "body": validated_body or "Open Sans"
                        },
                        "source": "ai_contextual"
                    }
            except (json.JSONDecodeError, AttributeError) as e:
                logger.warning(f"[ThemeAgent] Failed to parse theme: {str(response)[:200]}, error: {e}")

            return None

        except Exception as e:
            import traceback
            logger.error(f"[ThemeAgent] Contextual theme error: {e}")
            logger.error(f"[ThemeAgent] Contextual traceback: {traceback.format_exc()}")
            return None


async def run_theme_agent_parallel(title: str, prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
    """Convenience function to run the theme agent."""
    agent = ThemeAgent()
    return await agent.run(title, prompt, context)
