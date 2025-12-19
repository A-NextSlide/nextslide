"""
ThemeResolver - resolves theme from available sources without keyword heuristics.
"""

from typing import Dict, Any, Optional
from dataclasses import dataclass

from agents.domain.models import ThemeSpec
from models.requests import DeckOutline
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


@dataclass
class ThemeResolutionResult:
    """Result of theme resolution with metadata about source."""

    theme: Optional[ThemeSpec]
    palette: Optional[Dict[str, Any]]
    search_terms: Optional[Dict[str, Any]]
    source: str
    should_regenerate: bool = False
    regenerate_reason: Optional[str] = None


class ThemeResolver:
    """Resolves themes from multiple sources with a simple fallback order."""

    def __init__(self, theme_manager=None):
        self.theme_manager = theme_manager

    async def resolve(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        force_regenerate: bool = False,
    ) -> ThemeResolutionResult:
        title = deck_outline.title or ""

        if force_regenerate:
            logger.info("[THEME RESOLVER] Force regenerate requested")
            return ThemeResolutionResult(
                theme=None,
                palette=None,
                search_terms=None,
                source="force_regenerate",
                should_regenerate=True,
                regenerate_reason="Force regenerate requested",
            )

        result = self._resolve_from_outline_notes(deck_outline)
        if result and result.theme:
            return result

        result = self._resolve_from_database(deck_uuid)
        if result and result.theme:
            return result

        result = self._resolve_from_style_preferences(deck_outline)
        if result and result.theme:
            return result

        return ThemeResolutionResult(
            theme=None,
            palette=None,
            search_terms=None,
            source="needs_generation",
            should_regenerate=True,
            regenerate_reason="No cached theme found",
        )

    def _resolve_from_outline_notes(
        self, deck_outline: DeckOutline
    ) -> Optional[ThemeResolutionResult]:
        try:
            outline_notes = getattr(deck_outline, "notes", None)
            if not isinstance(outline_notes, dict):
                return None

            theme_data = outline_notes.get("theme")
            if not isinstance(theme_data, dict) or not theme_data:
                return None

            theme = ThemeSpec.from_dict(theme_data)
            palette = self._extract_palette(theme_data)

            logger.info("[THEME RESOLVER] Using theme from outline.notes")
            return ThemeResolutionResult(
                theme=theme,
                palette=palette,
                search_terms=None,
                source="outline_notes",
                should_regenerate=False,
            )
        except Exception as e:
            logger.warning(f"[THEME RESOLVER] Outline notes error: {e}")
            return None

    def _resolve_from_database(
        self, deck_uuid: str
    ) -> Optional[ThemeResolutionResult]:
        try:
            from utils.supabase import get_deck_theme, get_deck

            theme_data = get_deck_theme(deck_uuid)
            if not isinstance(theme_data, dict) or not theme_data:
                return None

            theme = ThemeSpec.from_dict(theme_data)
            palette = None
            search_terms = None

            try:
                existing_deck = get_deck(deck_uuid)
                if existing_deck and isinstance(existing_deck.get("data"), dict):
                    deck_data = existing_deck["data"]
                    palette = deck_data.get("style_spec", {}).get("palette")
                    search_terms = deck_data.get("search_terms")
            except Exception:
                pass

            if not palette:
                palette = self._extract_palette(theme_data)

            logger.info("[THEME RESOLVER] Using theme from database")
            return ThemeResolutionResult(
                theme=theme,
                palette=palette,
                search_terms=search_terms,
                source="database",
                should_regenerate=False,
            )
        except Exception as e:
            logger.warning(f"[THEME RESOLVER] Database theme error: {e}")
            return None

    def _resolve_from_style_preferences(
        self, deck_outline: DeckOutline
    ) -> Optional[ThemeResolutionResult]:
        try:
            style_prefs = getattr(deck_outline, "stylePreferences", None)
            if not style_prefs:
                return None

            deck_theme = None
            if hasattr(style_prefs, "deck_theme"):
                deck_theme = style_prefs.deck_theme
            elif isinstance(style_prefs, dict):
                deck_theme = style_prefs.get("deck_theme")

            if isinstance(deck_theme, dict) and deck_theme:
                theme = ThemeSpec.from_dict(deck_theme)
                palette = self._extract_palette(deck_theme)
                logger.info("[THEME RESOLVER] Using theme from stylePreferences.deck_theme")
                return ThemeResolutionResult(
                    theme=theme,
                    palette=palette,
                    search_terms=None,
                    source="style_preferences",
                    should_regenerate=False,
                )

            colors_config = getattr(style_prefs, "colors", None)
            if colors_config:
                theme_data = {
                    "theme_name": "StylePreferences",
                    "design_philosophy": "",
                    "color_palette": {
                        "primary_background": getattr(colors_config, "background", None),
                        "primary_text": getattr(colors_config, "text", None),
                        "accent_1": getattr(colors_config, "accent1", None),
                        "accent_2": getattr(colors_config, "accent2", None),
                    },
                    "typography": {},
                    "layout_style": "grid",
                    "visual_effects": {},
                    "image_treatment": {},
                }
                theme = ThemeSpec.from_dict(theme_data)
                palette = self._extract_palette(theme_data)
                logger.info("[THEME RESOLVER] Using theme from stylePreferences.colors")
                return ThemeResolutionResult(
                    theme=theme,
                    palette=palette,
                    search_terms=None,
                    source="style_preferences",
                    should_regenerate=False,
                )

            return None
        except Exception as e:
            logger.warning(f"[THEME RESOLVER] StylePreferences error: {e}")
            return None

    def _extract_palette(self, theme_data: Dict[str, Any]) -> Dict[str, Any]:
        color_palette = theme_data.get("color_palette", {}) if isinstance(theme_data, dict) else {}
        return {
            "primary_background": color_palette.get("primary_background"),
            "primary_text": color_palette.get("primary_text"),
            "accent_1": color_palette.get("accent_1"),
            "accent_2": color_palette.get("accent_2"),
            "colors": color_palette.get("colors", []),
            "backgrounds": color_palette.get("backgrounds", []),
            "accents": color_palette.get("accents", []),
        }
