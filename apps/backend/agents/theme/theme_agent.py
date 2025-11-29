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
                logger.info(f"[ThemeAgent] Real brand detected: {theme_analysis.get('brand')} → {theme_analysis.get('domain')}")
                brand_data = await self._fetch_brandfetch(theme_analysis["domain"])

                if brand_data and brand_data.get("colors"):
                    result["brand_name"] = theme_analysis.get("brand")
                    result["domain"] = theme_analysis.get("domain")
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

                    logger.info(f"[ThemeAgent] ✅ Brandfetch success: {result['colors'][:3]}")
                    return result
                else:
                    # Brandfetch failed, fall through to contextual generation
                    logger.info("[ThemeAgent] Brandfetch failed, generating contextual colors")

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
- For gaming/character brands like Sonic, Nintendo, Pokemon - these are REAL brands with domains
- For fictional variants like "SonicVerse" - type should be "inspired_by" with inspiration="Sonic the Hedgehog"
- Always try to identify the INSPIRATION even for fictional brands"""

            client, actual_model = get_client("claude-haiku-4-5")
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for claude-haiku-4-5")
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

            # Build context for color generation
            color_context = f"""Generate a color palette for this presentation.

Title: {title}
Inspiration: {inspiration or 'None specified'}
Mood: {mood or 'professional'}
Theme type: {theme_type}

IMPORTANT CONTEXT:
- If inspired by Sonic the Hedgehog: Use Sonic's iconic colors (bright blue #0066CC, red #CC0000, gold/yellow #FFD700)
- If retro/arcade gaming: Use vibrant neon colors (hot pink, electric blue, lime green)
- If professional/corporate: Use clean, modern colors (navy, white, accent color)
- If nature/environment: Use natural colors (greens, blues, earth tones)
- Match the MOOD and INSPIRATION, not random colors!

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

For Sonic-inspired themes, MUST use:
- Sonic Blue (#0066FF or similar bright blue)
- Sonic Red (#FF0000 or #CC0000)
- Ring Gold (#FFD700 or #FFC107)

Return ONLY the JSON, no explanation."""

            client, actual_model = get_client("claude-haiku-4-5")
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for claude-haiku-4-5 in contextual theme")
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
