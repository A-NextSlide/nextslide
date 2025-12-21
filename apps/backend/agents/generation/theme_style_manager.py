"""Minimal ThemeStyleManager that delegates to ThemeDirector/ThemeAgent."""

from typing import Dict, Any, Optional, List

from agents.domain.models import ThemeSpec
from agents.theme.theme_agent import ThemeAgent
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class ThemeStyleManager:
    """Lightweight theme manager with agent-driven decisions."""

    def __init__(self, available_fonts: List[str], all_fonts_list: Optional[List[str]] = None) -> None:
        self.available_fonts = available_fonts or []
        self.all_fonts_list = all_fonts_list or list(self.available_fonts)
        self._theme_agent = ThemeAgent()

    async def analyze_theme_and_style(self, deck_outline, progress_callback=None) -> Dict[str, Any]:
        """Generate a theme for the deck outline using agentic theme selection."""
        title = getattr(deck_outline, "title", "") or ""
        prompt = getattr(deck_outline, "prompt", "") or ""
        style_prefs = getattr(deck_outline, "stylePreferences", None)
        vibe_context = None
        initial_idea = None
        brand_domain = None
        brand_name = None
        needs_confirmation = None
        if style_prefs is not None:
            if isinstance(style_prefs, dict):
                vibe_context = style_prefs.get("vibeContext")
                initial_idea = style_prefs.get("initialIdea")
                brand_domain = style_prefs.get("brandDomain")
                brand_name = style_prefs.get("brandName")
                needs_confirmation = style_prefs.get("needsBrandDomainConfirmation")
            else:
                vibe_context = getattr(style_prefs, "vibeContext", None) if hasattr(style_prefs, "vibeContext") else None
                initial_idea = getattr(style_prefs, "initialIdea", None) if hasattr(style_prefs, "initialIdea") else None
                brand_domain = getattr(style_prefs, "brandDomain", None) if hasattr(style_prefs, "brandDomain") else None
                brand_name = getattr(style_prefs, "brandName", None) if hasattr(style_prefs, "brandName") else None
                needs_confirmation = getattr(style_prefs, "needsBrandDomainConfirmation", None) if hasattr(style_prefs, "needsBrandDomainConfirmation") else None
        context = " | ".join([c for c in [initial_idea, vibe_context] if c])

        logger.info("[THEME] Generating theme via ThemeAgent")
        agent_result = await self._theme_agent.run(
            title=title,
            prompt=prompt,
            context=context,
            include_videos=False,
            include_brand_design=False,
            brand_domain=brand_domain,
            brand_name=brand_name,
            domain_confirmed=False if needs_confirmation else None,
        )

        theme_dict = self._build_theme_spec(agent_result, style_prefs)
        style_spec = {"palette": theme_dict.get("color_palette", {})}

        return {
            "theme": theme_dict,
            "search_terms": agent_result.get("search_terms", []),
            "style_spec": style_spec,
        }

    async def generate_theme(self, deck_outline, global_theme: Dict[str, Any]) -> ThemeSpec:
        """Compatibility wrapper for async callers."""
        result = await self.analyze_theme_and_style(deck_outline)
        return ThemeSpec.from_dict(result.get("theme", {}))

    async def generate_palette(self, deck_outline, theme: Dict[str, Any]) -> Dict[str, Any]:
        """Return the palette from the theme without heuristic adjustments."""
        if isinstance(theme, ThemeSpec):
            theme = theme.to_dict()
        return (theme or {}).get("color_palette", {})

    def create_style_manifesto(self, style_spec: Dict[str, Any]) -> str:
        """Create a minimal style manifesto string."""
        palette = style_spec.get("palette") or {}
        accents = [palette.get("accent_1"), palette.get("accent_2")]
        accents = ", ".join([a for a in accents if a])
        return f"Use the theme palette consistently. Accents: {accents or 'theme accents'}."

    def extract_slide_colors(self, slide_data: Dict[str, Any]) -> Dict[str, Any]:
        """Return a minimal color summary for a slide (best-effort)."""
        components = slide_data.get("components", []) or []
        for comp in components:
            if comp.get("type") == "Background":
                props = comp.get("props", {}) or {}
                return {
                    "background": props.get("backgroundColor") or props.get("background")
                }
        return {}

    def _build_theme_spec(self, agent_result: Dict[str, Any], style_prefs: Any) -> Dict[str, Any]:
        colors = agent_result.get("colors", []) or []
        theme = {
            "theme_name": agent_result.get("brand_name") or "Agentic Theme",
            "design_philosophy": "Cohesive, professional slides with clear hierarchy.",
            "color_palette": {
                "primary_background": agent_result.get("background") or "#FFFFFF",
                "primary_text": agent_result.get("text") or "#111111",
                "accent_1": agent_result.get("accent") or (colors[0] if colors else "#2563EB"),
                "accent_2": agent_result.get("accent2") or (colors[1] if len(colors) > 1 else None),
                "colors": colors,
            },
            "typography": {
                "hero_title": {
                    "family": agent_result.get("fonts", {}).get("hero", "Montserrat"),
                    "weight": "700"
                },
                "body_text": {
                    "family": agent_result.get("fonts", {}).get("body", "Open Sans"),
                    "weight": "400"
                },
            },
            "layout_style": "grid",
            "visual_effects": {},
            "image_treatment": {},
            "brandInfo": {},
            "reference_images": [],
        }

        brand_info: Dict[str, Any] = {}
        logo_url = agent_result.get("logo_url")
        if logo_url:
            brand_info["logoUrl"] = logo_url
            theme["color_palette"].setdefault("metadata", {})["logo_url"] = logo_url
        if agent_result.get("brand_name"):
            brand_info["brandName"] = agent_result.get("brand_name")
        if agent_result.get("domain"):
            brand_info["brandDomain"] = agent_result.get("domain")
        if agent_result.get("brand_domain_candidates"):
            brand_info["brandDomainCandidates"] = agent_result.get("brand_domain_candidates")
        if agent_result.get("needs_domain_confirmation"):
            brand_info["needsBrandDomainConfirmation"] = True
        if brand_info:
            theme["brandInfo"] = brand_info

        brand_design = agent_result.get("brand_design") or {}
        screenshot = brand_design.get("screenshot")
        if screenshot:
            theme["reference_images"].append(screenshot)

        return theme
