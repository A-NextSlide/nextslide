"""
Theme tools - Apply colors, fonts, and branding to slides.

Uses existing services:
- ThemeAgent for smart brand detection
- SimpleBrandfetchCache for official brand colors
- AI generation for custom palettes
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import logging

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import invoke
from agents.editing.tools.async_utils import run_async
from agents.editing.tools.llm_utils import get_model_and_client
from agents.editing.tools.struct_utils import get_attr as _get_attr

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ThemePalette(BaseModel):
    """Color palette for a theme."""
    primary: str = Field(description="Primary brand color (hex)")
    secondary: str = Field(description="Secondary color (hex)")
    accent: str = Field(description="Accent/highlight color (hex)")
    background: str = Field(description="Background color (hex)")
    text: str = Field(description="Text color (hex)")


class ThemeResponse(BaseModel):
    """AI-generated theme."""
    palette: ThemePalette = Field(description="Color palette")
    reasoning: str = Field(description="Brief explanation of color choices")


async def _fetch_brand_from_services(brand_or_domain: str) -> Optional[Dict]:
    """
    Try to fetch brand data from our existing services.
    Uses SimpleBrandfetchCache which checks DB first, then Brandfetch API.
    """
    try:
        import os
        from services.simple_brandfetch_cache import SimpleBrandfetchCache
        from services.database_config import get_database_connection_string

        db_url = get_database_connection_string()
        brandfetch_key = os.getenv("BRANDFETCH_API_KEY")

        async with SimpleBrandfetchCache(db_url, brandfetch_key) as cache:
            brand_data = await cache.get_brand_data(brand_or_domain)

            if brand_data and brand_data.get("colors"):
                colors = brand_data["colors"]
                # Handle both dict and list formats
                if isinstance(colors, dict):
                    hex_list = colors.get("hex_list", [])
                    if not hex_list and colors.get("primary"):
                        hex_list = [c.get("hex") for c in colors.get("primary", []) if c.get("hex")]
                else:
                    hex_list = colors if isinstance(colors, list) else []

                return {
                    "colors": hex_list,
                    "logo_url": brand_data.get("logos", {}).get("light", [{}])[0].get("formats", [{}])[0].get("url") if brand_data.get("logos") else None,
                    "fonts": brand_data.get("fonts", {}).get("names", []),
                    "source": "brandfetch"
                }
    except Exception as e:
        logger.warning(f"[THEME] Brandfetch service error: {e}")

    return None


async def _fetch_theme_from_agent(title: str, instruction: str) -> Optional[Dict]:
    """
    Use ThemeAgent for smart theme detection.
    Handles real brands, inspired-by themes, and contextual colors.
    """
    try:
        from agents.theme.theme_agent import ThemeAgent

        agent = ThemeAgent()
        result = await agent.run(
            title=title or "Presentation",
            prompt=instruction,
            context=None,
            include_videos=False,
            include_brand_design=False,
        )

        if result and result.get("colors"):
            return {
                "colors": result["colors"],
                "background": result.get("background", "#FFFFFF"),
                "text": result.get("text", "#1A1A1A"),
                "accent": result.get("accent"),
                "logo_url": result.get("logo_url"),
                "fonts": result.get("fonts", {}),
                "source": result.get("source", "ai_generated")
            }
    except Exception as e:
        logger.warning(f"[THEME] ThemeAgent error: {e}")

    return None


def _generate_palette_with_ai(instruction: str) -> ThemePalette:
    """Generate a color palette using AI when services fail."""
    prompt = f"""You are an expert color designer. Generate a professional color palette.

USER REQUEST: {instruction}

Consider:
- If a brand is mentioned, use colors that match that brand's identity
- If a mood is mentioned (professional, playful, etc.), choose appropriate colors
- Ensure good contrast between background and text
- Use hex color codes (e.g., #FF5733)

Return a cohesive 5-color palette."""

    try:
        client, model = get_model_and_client("brand_detect", log_prefix="THEME_TOOLS")
        response = invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_model=ThemeResponse,
            max_tokens=1000,
        )
        return response.palette
    except Exception as e:
        logger.warning(f"[THEME] AI generation failed: {e}, using default")
        return ThemePalette(
            primary="#1E40AF",
            secondary="#3B82F6",
            accent="#F59E0B",
            background="#FFFFFF",
            text="#1A1A1A",
        )


def _apply_palette_to_slide(
    slide_id: str,
    slide,
    palette: ThemePalette,
    deck_diff: DeckDiff,
) -> None:
    """Apply palette to a single slide's Background component."""
    components = _get_attr(slide, 'components', []) or []
    logger.info(f"[THEME] _apply_palette_to_slide: slide_id={slide_id}, components count={len(components)}")

    for i, component in enumerate(components):
        comp_type = _get_attr(component, 'type')
        logger.debug(f"[THEME] Component {i}: type={comp_type}, obj_type={type(component)}")
        if comp_type == 'Background':
            comp_id = _get_attr(component, 'id')
            logger.info(f"[THEME] Found Background component: id={comp_id}")
            if not comp_id:
                continue

            # Update to gradient using palette colors
            new_props = {
                "backgroundType": "gradient",
                "gradient": {
                    "type": "linear",
                    "angle": 135,
                    "stops": [
                        {"color": palette.background, "position": 0},
                        {"color": palette.primary, "position": 100},
                    ]
                }
            }

            # Create proper ComponentDiffBase object
            component_diff = ComponentDiffBase(
                id=comp_id,
                type="Background",
                props=new_props
            )
            deck_diff.update_component(slide_id, comp_id, component_diff)
            logger.info(f"[THEME] Updated background on slide {slide_id}")


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TOOL
# ═══════════════════════════════════════════════════════════════════════════════

def apply_theme(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Apply a color theme to the deck.

    Uses existing services:
    1. SimpleBrandfetchCache - for real brands (checks DB cache first)
    2. ThemeAgent - for smart brand/context detection
    3. AI generation - fallback for custom palettes

    Args:
        args: { "instruction": str, "scope": "deck"|"slide" (optional) }

    Examples:
        {"instruction": "Use Instacart branding"}
        {"instruction": "Make it look like Sonic the Hedgehog"}
        {"instruction": "Professional dark theme"}
        {"instruction": "Ocean vibes with blues and greens"}
    """
    instruction = args.get('instruction', '')
    scope = args.get('scope', 'deck')  # 'deck' or 'slide'

    logger.info(f"[apply_theme] Applying theme: {instruction[:50]}...")

    deck_diff = DeckDiff(DeckDiffBase())
    palette = None

    # Try to extract a domain/brand from the instruction
    domain_hints = []
    instruction_lower = instruction.lower()

    # Common brand domain patterns
    brand_domains = {
        "instacart": "instacart.com",
        "apple": "apple.com",
        "google": "google.com",
        "microsoft": "microsoft.com",
        "amazon": "amazon.com",
        "netflix": "netflix.com",
        "spotify": "spotify.com",
        "uber": "uber.com",
        "airbnb": "airbnb.com",
        "stripe": "stripe.com",
        "slack": "slack.com",
        "notion": "notion.so",
        "figma": "figma.com",
        "twitter": "twitter.com",
        "meta": "meta.com",
        "facebook": "facebook.com",
        "nike": "nike.com",
        "adidas": "adidas.com",
    }

    for brand, domain in brand_domains.items():
        if brand in instruction_lower:
            domain_hints.append(domain)
            break

    # Step 1: Try Brandfetch service for known brands
    if domain_hints:
        logger.info(f"[apply_theme] Trying Brandfetch for: {domain_hints[0]}")
        try:
            brand_data = run_async(_fetch_brand_from_services(domain_hints[0]))
            if brand_data and brand_data.get("colors"):
                colors = brand_data["colors"]
                palette = ThemePalette(
                    primary=colors[0] if len(colors) > 0 else "#1E40AF",
                    secondary=colors[1] if len(colors) > 1 else "#3B82F6",
                    accent=colors[2] if len(colors) > 2 else "#F59E0B",
                    background="#FFFFFF",
                    text="#1A1A1A",
                )
                logger.info(f"[apply_theme] Got palette from Brandfetch: {palette.primary}")
        except Exception as e:
            logger.warning(f"[apply_theme] Brandfetch failed: {e}")

    # Step 2: Try ThemeAgent for smart detection
    if not palette:
        logger.info(f"[apply_theme] Trying ThemeAgent...")
        try:
            deck_title = _get_attr(deck_data, 'name') or _get_attr(deck_data, 'title') or "Presentation"
            theme_data = run_async(_fetch_theme_from_agent(deck_title, instruction))
            if theme_data and theme_data.get("colors"):
                colors = theme_data["colors"]
                palette = ThemePalette(
                    primary=colors[0] if len(colors) > 0 else "#1E40AF",
                    secondary=colors[1] if len(colors) > 1 else "#3B82F6",
                    accent=colors[2] if len(colors) > 2 else "#F59E0B",
                    background=theme_data.get("background", "#FFFFFF"),
                    text=theme_data.get("text", "#1A1A1A"),
                )
                logger.info(f"[apply_theme] Got palette from ThemeAgent: {palette.primary}")
        except Exception as e:
            logger.warning(f"[apply_theme] ThemeAgent failed: {e}")

    # Step 3: Fall back to AI generation
    if not palette:
        logger.info(f"[apply_theme] Falling back to AI generation...")
        palette = _generate_palette_with_ai(instruction)

    logger.info(f"[apply_theme] Final palette: primary={palette.primary}, bg={palette.background}")

    # Apply to slides
    if scope == 'slide':
        # Apply to current slide only
        slide_id = _get_attr(current_slide, 'id')
        logger.info(f"[apply_theme] Applying to single slide: {slide_id}")
        if slide_id:
            _apply_palette_to_slide(slide_id, current_slide, palette, deck_diff)
    else:
        # Apply to all slides in deck
        slides = _get_attr(deck_data, 'slides', []) or []
        logger.info(f"[apply_theme] Applying to {len(slides)} slides in deck")
        for i, slide in enumerate(slides):
            try:
                slide_id = _get_attr(slide, 'id')
                logger.info(f"[apply_theme] Processing slide {i}: id={slide_id}, type={type(slide)}")
                if slide_id:
                    _apply_palette_to_slide(slide_id, slide, palette, deck_diff)
            except Exception as e:
                logger.error(f"[apply_theme] Error processing slide {i}: {e}, slide type: {type(slide)}")
                raise

    logger.info(f"[apply_theme] Applied theme to {'slide' if scope == 'slide' else 'deck'}")
    return deck_diff
