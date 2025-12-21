"""Agent-driven ThemeDirector with minimal heuristics and compact prompts."""

from dataclasses import dataclass
from typing import Any, Dict, Optional, List
import uuid

from setup_logging_optimized import get_logger
from agents.application import get_event_bus, AGENT_EVENT
from agents.domain.models import ThemeDocument
from agents.theme.theme_agent import ThemeAgent

logger = get_logger(__name__)


@dataclass
class ThemeDirectorOptions:
    max_duration_seconds: float = 45.0
    per_slide_theming: bool = False
    variety_seed: Optional[str] = None


class ThemeDirector:
    """Minimal theme director that delegates to ThemeAgent."""

    def __init__(self) -> None:
        self.event_bus = get_event_bus()
        self.theme_agent = ThemeAgent()

    async def generate_quick_palette(
        self,
        title: str,
        context: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Generate a small palette using SmartColorSelector when available."""
        try:
            from agents.tools.theme import SmartColorSelector

            selector = SmartColorSelector()
            result = await selector.select_colors_for_request(
                prompt=context or "",
                title=title,
                variety_seed=str(uuid.uuid4()),
            )
            if result and result.get("colors"):
                bg = (result.get("backgrounds") or result["colors"])[0]
                accent = (result.get("accents") or result["colors"][1:2] or result["colors"][:1])[0]
                text = result.get("text_colors", {}).get("primary") or "#111111"
                return {
                    "color_palette": {
                        "primary_background": bg,
                        "primary_text": text,
                        "accent_1": accent,
                        "colors": result.get("colors", []),
                    }
                }
        except Exception as e:
            logger.debug(f"[ThemeDirector] Quick palette selector failed: {e}")

        # Fallback to ThemeAgent
        agent = await self.theme_agent.run(
            title=title,
            prompt=context or "",
            context=context or "",
            include_videos=False,
            include_brand_design=False,
        )
        return {
            "color_palette": {
                "primary_background": agent.get("background") or "#FFFFFF",
                "primary_text": agent.get("text") or "#111111",
                "accent_1": agent.get("accent") or "#2563EB",
                "colors": agent.get("colors") or [],
            }
        }

    async def generate_theme_document(
        self,
        deck_outline: Any,
        options: Optional[ThemeDirectorOptions] = None,
    ) -> ThemeDocument:
        opts = options or ThemeDirectorOptions()
        if not opts.variety_seed:
            opts.variety_seed = str(uuid.uuid4())

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

        await self._emit_agent("start", f"Generating theme for '{title}'")
        available_videos = None
        try:
            notes = getattr(deck_outline, "notes", None) or {}
            if isinstance(notes, dict):
                available_videos = notes.get("videos")
        except Exception:
            available_videos = None

        agent_result = await self.theme_agent.run(
            title=title,
            prompt=prompt,
            context=context,
            include_videos=False,
            include_brand_design=False,
            available_videos=available_videos,
            brand_domain=brand_domain,
            brand_name=brand_name,
            domain_confirmed=False if needs_confirmation else None,
        )

        theme_spec = self._build_theme_spec(agent_result, style_prefs)
        theme_doc = ThemeDocument(
            deck_theme=theme_spec,
            slide_themes={},
            search_terms=agent_result.get("search_terms", []),
            agent_trace=[],
        )

        await self._emit_agent("complete", "Theme generated")
        return theme_doc

    async def _emit_agent(self, phase: str, summary: str) -> None:
        try:
            await self.event_bus.emit(AGENT_EVENT, {
                "agent": "ThemeDirector",
                "phase": phase,
                "summary": summary,
            })
        except Exception:
            pass

    def _build_theme_spec(self, agent_result: Dict[str, Any], style_prefs: Any) -> Dict[str, Any]:
        colors = agent_result.get("colors", []) or []
        theme = {
            "theme_name": agent_result.get("brand_name") or "Agentic Theme",
            "design_philosophy": "Create cohesive, on-brand slides with clear hierarchy.",
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
            "visual_style": {},
            "background_variations": [],
            "slide_templates": {},
            "design_rules": {},
            "slide_themes": {},
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
