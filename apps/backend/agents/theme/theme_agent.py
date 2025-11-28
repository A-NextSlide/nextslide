"""
ThemeAgent - Agentic theme detection that runs in parallel with outline generation.

Uses tool calls to:
1. Detect brand from title/prompt
2. Fetch brand colors/fonts/logo from Brandfetch
3. Generate colors via Huemint for generic content
4. Select appropriate fonts

Ensures 3 distinct colors (not too similar) for all palettes.
"""

import asyncio
import logging
import os
import json
import colorsys
from typing import Dict, Any, Optional, List, Tuple

logger = logging.getLogger(__name__)


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    """Convert hex color to RGB tuple."""
    hex_color = hex_color.lstrip('#')
    return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))


def _rgb_to_hex(r: int, g: int, b: int) -> str:
    """Convert RGB to hex."""
    return f"#{r:02X}{g:02X}{b:02X}"


def _color_distance(c1: str, c2: str) -> float:
    """Calculate perceptual color distance between two hex colors.

    Uses LAB-like distance for better perceptual accuracy.
    Returns value 0-100+ where higher = more different.
    """
    try:
        r1, g1, b1 = _hex_to_rgb(c1)
        r2, g2, b2 = _hex_to_rgb(c2)

        # Use weighted Euclidean distance (accounts for human perception)
        # Red is perceived less than green, blue in between
        rmean = (r1 + r2) / 2
        dr = r1 - r2
        dg = g1 - g2
        db = b1 - b2

        # Weighted formula for perceptual difference
        return ((2 + rmean/256) * dr**2 + 4 * dg**2 + (2 + (255-rmean)/256) * db**2) ** 0.5
    except Exception:
        return 0


def _ensure_distinct_colors(colors: List[str], min_distance: float = 80) -> List[str]:
    """Filter colors to ensure they're visually distinct.

    Args:
        colors: List of hex colors
        min_distance: Minimum perceptual distance between colors (0-442)

    Returns:
        List of distinct colors (at least 3 if possible)
    """
    if not colors:
        return []

    distinct = [colors[0]]

    for color in colors[1:]:
        # Check distance from all already-selected colors
        is_distinct = all(
            _color_distance(color, existing) >= min_distance
            for existing in distinct
        )
        if is_distinct:
            distinct.append(color)

    return distinct


class ThemeAgent:
    """Agentic theme detection with parallel tool execution."""

    def __init__(self):
        self.tools = {
            "detect_brand": self._tool_detect_brand,
            "fetch_brand_data": self._tool_fetch_brand_data,
            "generate_huemint_palette": self._tool_generate_huemint_palette,
            "select_fonts": self._tool_select_fonts,
        }

    async def run(self, title: str, prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
        """Run the theme agent to detect brand/colors/fonts.

        This is designed to run in parallel with outline generation.

        Args:
            title: Presentation title
            prompt: User's original prompt
            context: Optional additional context

        Returns:
            Dict with: brand_name, domain, colors, fonts, logo_url
        """
        logger.info(f"[ThemeAgent] Starting parallel theme detection for: {title[:50]}...")

        result = {
            "brand_name": None,
            "domain": None,
            "colors": [],
            "background": "#FFFFFF",
            "text": "#1A1A1A",
            "accent": None,
            "fonts": {"hero": "Montserrat", "body": "Open Sans"},
            "logo_url": None,
            "source": "default"
        }

        try:
            # Step 1: Try to detect brand
            brand_info = await self._tool_detect_brand(title, prompt)

            if brand_info and brand_info.get("brand"):
                result["brand_name"] = brand_info["brand"]
                result["domain"] = brand_info.get("domain")
                logger.info(f"[ThemeAgent] Brand detected: {result['brand_name']} → {result['domain']}")

                # Step 2: Fetch brand data if we have a domain
                if result["domain"]:
                    brand_data = await self._tool_fetch_brand_data(result["domain"])

                    if brand_data and not brand_data.get("error"):
                        # Extract colors
                        colors = brand_data.get("colors", [])
                        if colors:
                            distinct_colors = _ensure_distinct_colors(colors, min_distance=80)
                            if len(distinct_colors) >= 3:
                                result["colors"] = distinct_colors[:5]
                                result["background"] = distinct_colors[0]
                                result["accent"] = distinct_colors[1] if len(distinct_colors) > 1 else None
                                result["source"] = "brandfetch"
                                logger.info(f"[ThemeAgent] Got {len(distinct_colors)} distinct brand colors")

                        # Extract logo
                        if brand_data.get("logo_url"):
                            result["logo_url"] = brand_data["logo_url"]
                            logger.info(f"[ThemeAgent] Got logo URL")

                        # Extract fonts
                        if brand_data.get("fonts"):
                            result["fonts"]["hero"] = brand_data["fonts"][0] if brand_data["fonts"] else "Montserrat"

                # Step 3: Select brand-appropriate fonts if not from Brandfetch
                if result["source"] != "brandfetch" or not brand_data.get("fonts"):
                    fonts = await self._tool_select_fonts(result["brand_name"], result["domain"])
                    if fonts:
                        result["fonts"] = fonts

            # Step 4: If no brand or insufficient colors, use Huemint
            if not result["colors"] or len(result["colors"]) < 3:
                logger.info(f"[ThemeAgent] No brand colors, generating Huemint palette...")
                huemint_result = await self._tool_generate_huemint_palette(title, prompt)

                if huemint_result and huemint_result.get("colors"):
                    distinct_colors = _ensure_distinct_colors(huemint_result["colors"], min_distance=80)
                    if len(distinct_colors) >= 3:
                        result["colors"] = distinct_colors[:5]
                        result["background"] = huemint_result.get("background", distinct_colors[0])
                        result["text"] = huemint_result.get("text", "#1A1A1A")
                        result["accent"] = huemint_result.get("accent", distinct_colors[1] if len(distinct_colors) > 1 else None)
                        result["source"] = "huemint"
                        logger.info(f"[ThemeAgent] Generated {len(distinct_colors)} distinct Huemint colors")

                # Also select fonts for non-brand content
                if not result.get("brand_name"):
                    fonts = await self._tool_select_fonts(title, None)
                    if fonts:
                        result["fonts"] = fonts

            # Final validation: ensure we have at least 3 distinct colors
            if len(result["colors"]) < 3:
                logger.warning(f"[ThemeAgent] Only {len(result['colors'])} colors, adding defaults")
                defaults = ["#3B82F6", "#10B981", "#F59E0B", "#8B5CF6", "#EF4444"]
                for default in defaults:
                    if len(result["colors"]) >= 3:
                        break
                    if all(_color_distance(default, c) >= 80 for c in result["colors"]):
                        result["colors"].append(default)

            logger.info(f"[ThemeAgent] Complete: {len(result['colors'])} colors, source={result['source']}")
            return result

        except Exception as e:
            logger.error(f"[ThemeAgent] Error: {e}")
            # Return safe defaults
            result["colors"] = ["#3B82F6", "#10B981", "#F59E0B"]
            result["accent"] = "#3B82F6"
            result["source"] = "default"
            return result

    async def _tool_detect_brand(self, title: str, prompt: str) -> Optional[Dict[str, str]]:
        """Detect brand from title/prompt using AI."""
        try:
            from agents.ai.clients import get_client, invoke

            text = f"{title}. {prompt}"[:300]

            brand_prompt = f"""Analyze this text and extract brand information.

Text: "{text}"

Determine if a real company/brand is the SUBJECT. If yes, provide the domain.

Examples:
- "Google Q3 Earnings" → {{"brand": "Google", "domain": "google.com"}}
- "Nike marketing strategy" → {{"brand": "Nike", "domain": "nike.com"}}
- "How to cook pasta" → {{"brand": null, "domain": null}}
- "Amazon rainforest" → {{"brand": null, "domain": null}}
- "Amazon Web Services" → {{"brand": "Amazon Web Services", "domain": "aws.amazon.com"}}

Return ONLY JSON: {{"brand": "Name", "domain": "domain.com"}} or {{"brand": null, "domain": null}}"""

            client = get_client("claude-3-5-haiku-20241022")
            response = invoke(
                client=client,
                model="claude-3-5-haiku-20241022",
                messages=[{"role": "user", "content": brand_prompt}],
                max_tokens=100,
                temperature=0
            )

            # Parse JSON - extract just the object
            import re
            json_match = re.search(r'\{[^{}]*\}', response)
            if json_match:
                return json.loads(json_match.group(0))
            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brand detection failed: {e}")
            return None

    async def _tool_fetch_brand_data(self, domain: str) -> Optional[Dict[str, Any]]:
        """Fetch brand colors/fonts/logo from Brandfetch."""
        try:
            from services.simple_brandfetch_cache import SimpleBrandfetchCache

            db_url = os.getenv('DATABASE_URL')
            if not db_url:
                return None

            async with SimpleBrandfetchCache(db_url) as cache:
                brand_data = await cache.get_brand_data(domain)

                if brand_data and not brand_data.get('error'):
                    # Extract colors
                    colors_data = brand_data.get('colors', {})
                    colors = []
                    if isinstance(colors_data, dict):
                        colors = colors_data.get('hex_list', [])
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
                                if formats and isinstance(formats, list):
                                    logo_url = formats[0].get('url')
                                    break

                    return {
                        "colors": [c.upper() if isinstance(c, str) else c for c in colors if c],
                        "fonts": fonts,
                        "logo_url": logo_url
                    }

            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brandfetch fetch failed: {e}")
            return None

    async def _tool_generate_huemint_palette(self, title: str, prompt: str) -> Optional[Dict[str, Any]]:
        """Generate a nice palette using Huemint for generic content."""
        try:
            from agents.tools.theme.huemint_palette_generator import HuemintPaletteGenerator

            generator = HuemintPaletteGenerator()

            # Generate multiple palettes and pick the best one with distinct colors
            palettes = await generator.generate_palette(
                num_colors=5,
                temperature=1.2,  # More creative
                num_results=10
            )

            if not palettes:
                return None

            # Find palette with most distinct colors
            best_palette = None
            best_distinct_count = 0

            for palette in palettes:
                colors = palette.get("colors", [])
                distinct = _ensure_distinct_colors(colors, min_distance=80)
                if len(distinct) > best_distinct_count:
                    best_distinct_count = len(distinct)
                    best_palette = palette
                    if best_distinct_count >= 4:
                        break  # Good enough

            if best_palette and best_palette.get("colors"):
                colors = best_palette["colors"]
                distinct = _ensure_distinct_colors(colors, min_distance=80)

                # Determine background (lightest), text (darkest), accent (most vibrant)
                def brightness(hex_c):
                    r, g, b = _hex_to_rgb(hex_c)
                    return (r * 299 + g * 587 + b * 114) / 1000

                def saturation(hex_c):
                    r, g, b = _hex_to_rgb(hex_c)
                    h, l, s = colorsys.rgb_to_hls(r/255, g/255, b/255)
                    return s

                sorted_by_brightness = sorted(distinct, key=brightness, reverse=True)
                background = sorted_by_brightness[0] if sorted_by_brightness else "#FFFFFF"
                text = sorted_by_brightness[-1] if sorted_by_brightness else "#1A1A1A"

                # Accent is most saturated (excluding bg and text)
                remaining = [c for c in distinct if c not in [background, text]]
                accent = max(remaining, key=saturation) if remaining else distinct[1] if len(distinct) > 1 else "#3B82F6"

                return {
                    "colors": distinct,
                    "background": background,
                    "text": text,
                    "accent": accent
                }

            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Huemint generation failed: {e}")
            return None

    async def _tool_select_fonts(self, name: str, domain: Optional[str]) -> Optional[Dict[str, str]]:
        """Select appropriate fonts using AI."""
        try:
            from agents.ai.clients import get_client, invoke

            font_prompt = f"""Select fonts for: "{name}"

Choose from these categories:
- Modern Tech: Inter, Space Grotesk, JetBrains Mono
- Professional: Montserrat, Open Sans, Lato
- Creative: Poppins, Nunito, Quicksand
- Bold: Bebas Neue, Oswald, Anton
- Elegant: Playfair Display, Merriweather, Lora

Return ONLY: HERO: [font name]
BODY: [font name]"""

            client = get_client("claude-3-5-haiku-20241022")
            response = invoke(
                client=client,
                model="claude-3-5-haiku-20241022",
                messages=[{"role": "user", "content": font_prompt}],
                max_tokens=50,
                temperature=0
            )

            # Parse response
            hero = "Montserrat"
            body = "Open Sans"

            for line in response.split('\n'):
                if 'HERO:' in line.upper():
                    hero = line.split(':')[-1].strip()
                elif 'BODY:' in line.upper():
                    body = line.split(':')[-1].strip()

            return {"hero": hero, "body": body}

        except Exception as e:
            logger.warning(f"[ThemeAgent] Font selection failed: {e}")
            return {"hero": "Montserrat", "body": "Open Sans"}


async def run_theme_agent_parallel(title: str, prompt: str, context: Optional[str] = None) -> Dict[str, Any]:
    """Convenience function to run theme agent.

    This is designed to be called in parallel with outline generation.
    """
    agent = ThemeAgent()
    return await agent.run(title, prompt, context)
