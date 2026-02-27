"""Shared helpers for CustomComponent enhancement across slide generators."""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

from agents.domain.models import SlideGenerationContext
from agents.generation.custom_component_generator import CustomComponentGenerator
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

MAX_RESEARCH_CONTEXT_CHARS = 8000
MAX_SCRAPED_CONTEXT_CHARS = 5000


def _get_attr_or_key(obj: Any, key: str, default: Any = None) -> Any:
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


def _get_style_prefs(context: SlideGenerationContext) -> Any:
    if not hasattr(context, "deck_outline") or context.deck_outline is None:
        return None
    return _get_attr_or_key(context.deck_outline, "stylePreferences")


def _get_deck_theme(style_prefs: Any) -> Optional[Dict[str, Any]]:
    deck_theme = _get_attr_or_key(style_prefs, "deck_theme")
    return deck_theme if isinstance(deck_theme, dict) else None


def inject_theme_data(theme_dict: Dict[str, Any], context: SlideGenerationContext) -> Dict[str, Any]:
    """Inject logo, fonts, and colors from context into theme_dict."""
    if not theme_dict:
        theme_dict = {}

    style_prefs = _get_style_prefs(context)
    deck_theme = _get_deck_theme(style_prefs)

    # INJECT LOGO
    brand_info = theme_dict.get("brandInfo", {})
    if not brand_info.get("logoUrl"):
        logo_url = _get_attr_or_key(style_prefs, "logoUrl")
        logo_url_dark = _get_attr_or_key(style_prefs, "logoUrlDark")

        if not logo_url and isinstance(deck_theme, dict):
            logo_data = deck_theme.get("logo", {})
            if isinstance(logo_data, dict):
                logo_url = logo_data.get("url") or logo_url
                logo_url_dark = logo_data.get("url_dark") or logo_url_dark
            metadata = deck_theme.get("metadata", {})
            if isinstance(metadata, dict):
                logo_url = metadata.get("logo_url") or metadata.get("logo_url_light") or logo_url
                logo_url_dark = metadata.get("logo_url_dark") or logo_url_dark

        if not logo_url:
            metadata = theme_dict.get("color_palette", {}).get("metadata", {})
            if isinstance(metadata, dict):
                logo_url = metadata.get("logo_url") or metadata.get("logo_url_light")
                logo_url_dark = metadata.get("logo_url_dark") or logo_url_dark

        # Skip base64 data URLs - they're huge (50K+ chars) and shouldn't be in prompts
        if logo_url and isinstance(logo_url, str) and logo_url.strip():
            logo_url = logo_url.strip()
            if logo_url.startswith("data:"):
                logger.info("[THEME INJECT] Skipping base64 logo URL (too large for prompts)")
            else:
                theme_dict.setdefault("brandInfo", {})
                theme_dict["brandInfo"]["logoUrl"] = logo_url
                if logo_url_dark and not str(logo_url_dark).startswith("data:"):
                    theme_dict["brandInfo"]["logoUrlDark"] = str(logo_url_dark).strip()
                logger.info(f"[THEME INJECT] Logo injected: {logo_url[:60]}...")

    # INJECT BRAND NAME
    brand_info = theme_dict.get("brandInfo", {})
    if not brand_info.get("name"):
        brand_name = (
            _get_attr_or_key(style_prefs, "brandName")
            or _get_attr_or_key(style_prefs, "brandDomain")
        )
        if not brand_name and isinstance(deck_theme, dict):
            meta = deck_theme.get("metadata", {})
            if isinstance(meta, dict):
                brand_name = meta.get("brand_name") or meta.get("domain")
        if brand_name:
            theme_dict.setdefault("brandInfo", {})
            theme_dict["brandInfo"]["name"] = brand_name
            logger.info(f"[THEME INJECT] Brand name injected: {brand_name}")

    # INJECT FONTS
    typography = theme_dict.get("typography", {})
    if not typography.get("hero_title", {}).get("family") and not typography.get("hero_font"):
        hero_font = _get_attr_or_key(style_prefs, "font")
        body_font = _get_attr_or_key(style_prefs, "bodyFont")  # Don't fallback yet - check deck_theme first
        if isinstance(deck_theme, dict):
            deck_typo = deck_theme.get("typography", {})
            if not hero_font:
                hero_font = deck_typo.get("hero_title", {}).get("family") or deck_typo.get("hero_font")
            if not body_font:
                body_font = deck_typo.get("body_text", {}).get("family") or deck_typo.get("body_font")

        # Only fall back to hero_font as last resort
        if not body_font and hero_font:
            logger.warning(f"[THEME INJECT] No body font found, falling back to hero font: {hero_font}")
            body_font = hero_font

        if hero_font:
            theme_dict.setdefault("typography", {})
            theme_dict["typography"]["hero_title"] = {"family": hero_font}
            theme_dict["typography"]["body_text"] = {"family": body_font or hero_font}
            logger.info(f"[THEME INJECT] Fonts injected: hero={hero_font}, body={body_font}")

    # INJECT COLORS
    color_palette = theme_dict.get("color_palette", {})
    if not color_palette.get("accent_1") and not color_palette.get("colors"):
        colors_config = _get_attr_or_key(style_prefs, "colors")
        accent1 = _get_attr_or_key(colors_config, "accent1")
        if accent1:
            theme_dict.setdefault("color_palette", {})
            theme_dict["color_palette"]["accent_1"] = accent1
            theme_dict["color_palette"]["accent_2"] = _get_attr_or_key(colors_config, "accent2") or accent1
            theme_dict["color_palette"]["primary_background"] = _get_attr_or_key(colors_config, "background") or "#FFFFFF"
            theme_dict["color_palette"]["primary_text"] = _get_attr_or_key(colors_config, "text") or "#1A1A1A"
            logger.info(f"[THEME INJECT] Colors injected: accent1={accent1}")
        elif isinstance(deck_theme, dict):
            deck_palette = deck_theme.get("color_palette", {})
            if deck_palette:
                theme_dict["color_palette"] = deck_palette
                logger.info("[THEME INJECT] Color palette injected from deck_theme")

    return theme_dict


def extract_external_media(slide_outline: Any) -> Optional[Dict[str, Any]]:
    scraped = _get_attr_or_key(slide_outline, "scrapedMedia")
    if not scraped:
        return None
    if isinstance(scraped, dict):
        return {
            "gifs": scraped.get("gifs", []),
            "images": scraped.get("images", []),
            "all_media": scraped.get("all_media", []),
            "source_url": scraped.get("source_url", ""),
            "markdown": scraped.get("markdown", ""),
        }
    return None


def extract_uploaded_media(slide_outline: Any) -> Optional[List[Dict[str, Any]]]:
    tagged_media = _get_attr_or_key(slide_outline, "taggedMedia") or []
    if not tagged_media:
        return None
    uploaded = []
    for media in tagged_media:
        media_dict = media.model_dump() if hasattr(media, "model_dump") else media
        if isinstance(media_dict, dict):
            uploaded.append(media_dict)
    return uploaded or None


def _extract_chart_payload(slide_outline: Any) -> Tuple[Optional[Dict[str, Any]], Optional[List[Dict[str, Any]]]]:
    extracted = _get_attr_or_key(slide_outline, "extractedData")
    extracted_data = None
    if extracted:
        extracted_data = extracted.model_dump() if hasattr(extracted, "model_dump") else extracted

    manual = _get_attr_or_key(slide_outline, "manualCharts")
    manual_charts = None
    if manual:
        manual_charts = [
            chart.model_dump() if hasattr(chart, "model_dump") else chart
            for chart in manual
            if chart is not None
        ]

    return extracted_data, manual_charts


def _resolve_slide_mode(context: SlideGenerationContext) -> str:
    style_prefs = _get_style_prefs(context)
    explicit_mode = _get_attr_or_key(style_prefs, "slideMode")
    return explicit_mode or "interactive"


def _extract_style_context(context: SlideGenerationContext) -> Tuple[Optional[str], Optional[str]]:
    style_prefs = _get_style_prefs(context)
    initial_idea = _get_attr_or_key(style_prefs, "initialIdea")
    vibe_context = _get_attr_or_key(style_prefs, "vibeContext")
    return initial_idea, vibe_context


@dataclass(frozen=True)
class CustomComponentLayout:
    width: int
    height: int
    position: Dict[str, int]
    is_full_slide: bool


def resolve_custom_component_layout(
    context: SlideGenerationContext,
    *,
    full_slide: bool
) -> CustomComponentLayout:
    if full_slide:
        return CustomComponentLayout(
            width=1920,
            height=1080,
            position={"x": 0, "y": 0},
            is_full_slide=True,
        )

    return CustomComponentLayout(
        width=1920,
        height=1080,
        position={"x": 0, "y": 0},
        is_full_slide=False,
    )


def build_custom_component_context(
    context: SlideGenerationContext,
    *,
    layout: CustomComponentLayout,
    include_charts: bool
) -> Dict[str, Any]:
    slide_mode = _resolve_slide_mode(context)
    initial_idea, vibe_context = _extract_style_context(context)
    extracted_data, manual_charts = _extract_chart_payload(context.slide_outline)

    # Resolve brand name from stylePreferences
    style_prefs = _get_style_prefs(context)
    brand_name = (
        _get_attr_or_key(style_prefs, "brandName")
        or _get_attr_or_key(style_prefs, "brandDomain")
    )

    slide_context = {
        "title": _get_attr_or_key(context.slide_outline, "title"),
        "slide_index": context.slide_index,
        "total_slides": context.total_slides,
        "slide_type": _get_attr_or_key(context.slide_outline, "layout", "content"),
        "slide_mode": slide_mode,
        "presentation_context": context.presentation_context,
        "conversation_history": context.conversation_history,
        "initial_idea": initial_idea,
        "vibe_context": vibe_context,
        "brand_name": brand_name,
        "deck_title": _get_attr_or_key(context.deck_outline, "title"),
        "deck_uuid": context.deck_uuid,
        "is_full_slide": layout.is_full_slide,
        "use_uploaded_images": bool(getattr(context.deck_outline, "use_uploaded_images", False)),
        "has_assigned_video": bool(context.available_videos),
    }

    if include_charts:
        slide_context["extracted_data"] = extracted_data
        slide_context["manual_charts"] = manual_charts

    return slide_context


class CustomComponentEnhancer:
    """Reusable CustomComponent enhancement flow."""

    def __init__(self, generator: CustomComponentGenerator, *, full_slide: bool):
        self.generator = generator
        self.full_slide = full_slide

    def _enrich_content_with_research(self, content: str, context: SlideGenerationContext) -> str:
        """Enrich slide content with research context for more detailed generation.

        The outline content is often just a single line. This adds research context
        so the CustomComponent generator has more material to work with.
        """
        parts = [content] if content else []

        # Get research context from deck_outline.notes
        try:
            notes = None
            if hasattr(context, "deck_outline") and context.deck_outline:
                notes = getattr(context.deck_outline, "notes", None)

            if isinstance(notes, dict):
                # Add research context (truncated to avoid huge prompts)
                research_context = notes.get("research_context") or notes.get("researchContext")
                if research_context and isinstance(research_context, str):
                    truncated = (
                        research_context[:MAX_RESEARCH_CONTEXT_CHARS]
                        if len(research_context) > MAX_RESEARCH_CONTEXT_CHARS
                        else research_context
                    )
                    parts.append(f"\n\nRESEARCH CONTEXT (use relevant facts):\n{truncated}")

                # Add scraped context
                scraped_context = notes.get("scraped_context") or notes.get("scrapedContext")
                if scraped_context and isinstance(scraped_context, str):
                    truncated = (
                        scraped_context[:MAX_SCRAPED_CONTEXT_CHARS]
                        if len(scraped_context) > MAX_SCRAPED_CONTEXT_CHARS
                        else scraped_context
                    )
                    parts.append(f"\n\nREFERENCE MATERIAL:\n{truncated}")
        except Exception as e:
            logger.debug(f"[CUSTOM_COMPONENT] Could not extract research context: {e}")

        # Add presentation context if available
        if context.presentation_context:
            parts.append(f"\n\nPRESENTATION CONTEXT: {context.presentation_context}")

        enriched = "\n".join(parts)
        if len(enriched) > len(content) + 100:
            logger.info(f"[CUSTOM_COMPONENT] Enriched content: {len(content)} -> {len(enriched)} chars")

        return enriched

    async def enhance(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext,
        theme_dict: Dict[str, Any],
        predicted_components: List[str],
        *,
        include_charts: bool = True,
        component_purpose: str = "visualize",
        content_override: Optional[str] = None,
    ) -> Dict[str, Any]:
        if "CustomComponent" not in predicted_components:
            return slide_data

        theme_dict = inject_theme_data(theme_dict or {}, context)
        layout = resolve_custom_component_layout(context, full_slide=self.full_slide)
        slide_context = build_custom_component_context(
            context, layout=layout, include_charts=include_charts
        )
        external_media = extract_external_media(context.slide_outline)
        uploaded_media = extract_uploaded_media(context.slide_outline)

        content = content_override
        if content is None:
            content = _get_attr_or_key(context.slide_outline, "content") or ""

        # Enrich content with research context if available (for more detailed slides)
        content = self._enrich_content_with_research(content, context)

        enhanced = await self.generator.generate(
            content=content,
            theme=theme_dict,
            slide_context=slide_context,
            component_purpose=component_purpose,
            width=layout.width,
            height=layout.height,
            position=layout.position,
            external_media=external_media,
            uploaded_media=uploaded_media,
            available_images=context.available_images,
            reference_images=context.reference_images,
            available_videos=context.available_videos,
            deck_uuid=context.deck_uuid,
        )

        if not enhanced:
            logger.warning("[CUSTOM_COMPONENT] Generation returned None; keeping original components")
            return slide_data

        components = slide_data.get("components", [])
        if layout.is_full_slide and self.full_slide:
            slide_data["components"] = [enhanced]
            return slide_data

        background = next((c for c in components if c.get("type") == "Background"), None)
        new_components = []
        if background:
            new_components.append(background)
        else:
            colors = theme_dict.get("color_palette", {})
            new_components.append({
                "id": "bg-custom",
                "type": "Background",
                "props": {
                    "backgroundType": "color",
                    "backgroundColor": colors.get("primary_background", "#0a0e27"),
                },
            })
        new_components.append(enhanced)
        slide_data["components"] = new_components
        return slide_data
