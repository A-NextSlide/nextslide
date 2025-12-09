"""
ThemeResolver - Handles theme resolution from multiple sources with cascading fallbacks.

This class extracts and consolidates the complex theme resolution logic from SimpleDeckComposer.
It implements a priority-based resolution strategy:
1. outline.notes.theme (from outline generation)
2. Database theme (persisted from previous generation)
3. stylePreferences reconstruction (from frontend onboarding)
4. Generate new theme (via ThemeDirector)
"""

from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
import re

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
    source: str  # 'outline_notes', 'database', 'style_preferences', 'generated', 'default'
    should_regenerate: bool = False
    regenerate_reason: Optional[str] = None


class ThemeValidator:
    """Validates themes and determines if regeneration is needed."""

    # Known frontend fallback defaults that indicate no brand detection happened
    DEFAULT_ACCENTS = {'#ff4301', '#3b82f6', '#3b4cca', '#f59e0b'}
    DEFAULT_BACKGROUNDS = {'#ffffff', '#ffdc00'}

    # Generic theme names that should always regenerate
    GENERIC_THEME_NAMES = {
        "Modern", "Modern Professional", "Default Theme",
        "Default", "Standard", "Generic", "Huemint Fallback"
    }

    # Boring fonts that should be overridden for fun topics
    BORING_FONTS = {
        'roboto', 'inter', 'lato', 'raleway', 'montserrat',
        'open sans', 'arial', 'helvetica', 'poppins'
    }

    # Fun topic keywords (use word boundary matching)
    FUN_KEYWORDS = [
        'pikachu', 'pokemon', 'mario', 'luigi', 'gaming', 'arcade', 'retro',
        'game', 'nintendo', 'kids', 'children', 'party', 'cartoon',
        'sega', 'playstation', 'zelda', 'sonic', 'fortnite', 'minecraft',
        'roblox', 'lego', 'disney', 'marvel', 'dc', 'superhero', 'batman',
        'spiderman', 'anime', 'manga', 'movie', 'film', 'show', 'tv'
    ]

    @classmethod
    def is_fun_topic(cls, title: str) -> bool:
        """Check if title indicates a fun/playful topic."""
        title_lower = title.lower()
        return any(
            re.search(rf'\b{re.escape(kw)}\b', title_lower)
            for kw in cls.FUN_KEYWORDS
        )

    @classmethod
    def has_boring_fonts(cls, theme_data: Dict[str, Any]) -> bool:
        """Check if theme has boring/generic fonts."""
        hero = theme_data.get('typography', {}).get('hero_title', {}).get('family', '')
        body = theme_data.get('typography', {}).get('body_text', {}).get('family', '')
        return hero.lower() in cls.BORING_FONTS or body.lower() in cls.BORING_FONTS

    @classmethod
    def has_default_colors(cls, theme_data: Dict[str, Any]) -> bool:
        """Check if theme has frontend default colors (not real brand colors)."""
        colors = theme_data.get('color_palette', {})
        accent1 = colors.get('accent_1', '').lower()
        accent2 = colors.get('accent_2', '').lower()
        bg = colors.get('primary_background', '').lower()

        return (
            accent1 in cls.DEFAULT_ACCENTS or
            accent2 in cls.DEFAULT_ACCENTS or
            (bg in cls.DEFAULT_BACKGROUNDS and accent1 in cls.DEFAULT_ACCENTS)
        )

    @classmethod
    def has_bad_default_colors(cls, theme_data: Dict[str, Any]) -> bool:
        """Check for known bad default colors from failed generations."""
        colors = theme_data.get('color_palette', {}).get('colors', [])
        bad_defaults = ['#f59e0b', '#fe1e1c']
        return any(c.lower() in bad_defaults for c in colors)

    @classmethod
    def is_generic_theme(cls, theme_data: Dict[str, Any]) -> bool:
        """Check if theme has a generic/fallback name."""
        name = theme_data.get('theme_name', '')
        return name in cls.GENERIC_THEME_NAMES

    @classmethod
    def should_regenerate(cls, theme_data: Dict[str, Any], title: str) -> Tuple[bool, Optional[str]]:
        """
        Determine if a theme should be regenerated.

        Returns:
            Tuple of (should_regenerate, reason)
        """
        is_fun = cls.is_fun_topic(title)
        has_boring = cls.has_boring_fonts(theme_data)
        has_default = cls.has_default_colors(theme_data)
        has_bad = cls.has_bad_default_colors(theme_data)
        is_generic = cls.is_generic_theme(theme_data)

        if is_generic:
            return True, f"Generic theme '{theme_data.get('theme_name')}' detected"

        if is_fun and has_boring:
            hero = theme_data.get('typography', {}).get('hero_title', {}).get('family', '')
            body = theme_data.get('typography', {}).get('body_text', {}).get('family', '')
            return True, f"Fun topic with boring fonts ({hero}/{body})"

        if has_bad:
            return True, "Detected persistent default colors"

        if has_default:
            colors = theme_data.get('color_palette', {})
            return True, f"Default colors detected (accent1={colors.get('accent_1')}, accent2={colors.get('accent_2')}) - regenerating to detect brand"

        return False, None


class ThemeResolver:
    """
    Resolves themes from multiple sources with cascading fallbacks.

    Priority order:
    1. outline.notes.theme - from outline generation stage
    2. Database theme - persisted from previous generation
    3. stylePreferences - from frontend onboarding
    4. Generate new - via ThemeDirector
    """

    def __init__(self, theme_manager=None):
        """
        Initialize ThemeResolver.

        Args:
            theme_manager: Optional ThemeManagerAdapter for generating new themes
        """
        self.theme_manager = theme_manager
        self.validator = ThemeValidator()

    async def resolve(
        self,
        deck_outline: DeckOutline,
        deck_uuid: str,
        force_regenerate: bool = False
    ) -> ThemeResolutionResult:
        """
        Resolve theme from available sources.

        Args:
            deck_outline: The deck outline containing theme hints
            deck_uuid: UUID of the deck for database lookup
            force_regenerate: If True, skip cache and generate new theme

        Returns:
            ThemeResolutionResult with theme, palette, and metadata
        """
        title = deck_outline.title or ''

        if force_regenerate:
            logger.info("[THEME RESOLVER] Force regenerate requested - skipping cache")
            return ThemeResolutionResult(
                theme=None,
                palette=None,
                search_terms=None,
                source='force_regenerate',
                should_regenerate=True,
                regenerate_reason="Force regenerate requested"
            )

        # Try each source in priority order

        # 1. Check outline.notes.theme
        result = self._resolve_from_outline_notes(deck_outline, title)
        if result and not result.should_regenerate:
            return result

        # 2. Check database
        result = self._resolve_from_database(deck_uuid, title)
        if result and not result.should_regenerate:
            return result

        # 3. Check stylePreferences
        result = await self._resolve_from_style_preferences(deck_outline, title)
        if result and not result.should_regenerate:
            return result

        # 4. Need to generate new theme
        return ThemeResolutionResult(
            theme=None,
            palette=None,
            search_terms=None,
            source='needs_generation',
            should_regenerate=True,
            regenerate_reason="No valid cached theme found"
        )

    def _resolve_from_outline_notes(
        self,
        deck_outline: DeckOutline,
        title: str
    ) -> Optional[ThemeResolutionResult]:
        """Try to resolve theme from outline.notes.theme."""
        try:
            outline_notes = getattr(deck_outline, 'notes', None)
            if not isinstance(outline_notes, dict):
                return None

            theme_data = outline_notes.get('theme')
            if not theme_data or not isinstance(theme_data, dict):
                logger.info("[THEME RESOLVER] No theme in outline.notes")
                return None

            logger.info(f"[THEME RESOLVER] Found theme in outline.notes")

            # Validate the theme
            should_regen, reason = self.validator.should_regenerate(theme_data, title)

            if should_regen:
                logger.info(f"[THEME RESOLVER] outline.notes theme rejected: {reason}")
                return ThemeResolutionResult(
                    theme=None,
                    palette=None,
                    search_terms=None,
                    source='outline_notes',
                    should_regenerate=True,
                    regenerate_reason=reason
                )

            # Theme is valid - use it
            theme = ThemeSpec.from_dict(theme_data)
            palette = self._extract_palette(theme_data)

            logger.info(f"[THEME RESOLVER] ✅ Using theme from outline.notes")
            return ThemeResolutionResult(
                theme=theme,
                palette=palette,
                search_terms=None,
                source='outline_notes',
                should_regenerate=False
            )

        except Exception as e:
            logger.warning(f"[THEME RESOLVER] Error reading outline.notes theme: {e}")
            return None

    def _resolve_from_database(
        self,
        deck_uuid: str,
        title: str
    ) -> Optional[ThemeResolutionResult]:
        """Try to resolve theme from database."""
        try:
            from utils.supabase import get_deck_theme, get_deck

            theme_data = get_deck_theme(deck_uuid)
            if not theme_data:
                logger.info("[THEME RESOLVER] No theme in database")
                return None

            logger.info(f"[THEME RESOLVER] Found theme in database")

            # Validate the theme
            should_regen, reason = self.validator.should_regenerate(theme_data, title)

            if should_regen:
                logger.info(f"[THEME RESOLVER] Database theme rejected: {reason}")
                return ThemeResolutionResult(
                    theme=None,
                    palette=None,
                    search_terms=None,
                    source='database',
                    should_regenerate=True,
                    regenerate_reason=reason
                )

            # Theme is valid - extract additional data
            theme = ThemeSpec.from_dict(theme_data)
            palette = None
            search_terms = None

            # Try to get palette and search_terms from deck data
            try:
                existing_deck = get_deck(deck_uuid)
                if existing_deck and isinstance(existing_deck.get('data'), dict):
                    deck_data = existing_deck['data']

                    if deck_data.get('style_spec', {}).get('palette'):
                        palette = deck_data['style_spec']['palette']
                        logger.info(f"[THEME RESOLVER] Found existing palette in database")

                    if deck_data.get('search_terms'):
                        search_terms = deck_data['search_terms']
                        logger.info(f"[THEME RESOLVER] Found {len(search_terms)} search terms in database")
            except Exception:
                pass

            if not palette:
                palette = self._extract_palette(theme_data)

            logger.info(f"[THEME RESOLVER] ✅ Using theme from database")
            return ThemeResolutionResult(
                theme=theme,
                palette=palette,
                search_terms=search_terms,
                source='database',
                should_regenerate=False
            )

        except Exception as e:
            logger.warning(f"[THEME RESOLVER] Error reading database theme: {e}")
            return None

    async def _resolve_from_style_preferences(
        self,
        deck_outline: DeckOutline,
        title: str
    ) -> Optional[ThemeResolutionResult]:
        """Try to resolve theme from stylePreferences."""
        try:
            style_prefs = getattr(deck_outline, 'stylePreferences', None)
            if not style_prefs:
                return None

            # Check for pre-generated deck_theme from frontend
            deck_theme = None
            if hasattr(style_prefs, 'deck_theme'):
                deck_theme = style_prefs.deck_theme
            elif isinstance(style_prefs, dict):
                deck_theme = style_prefs.get('deck_theme')

            if deck_theme and isinstance(deck_theme, dict):
                logger.info("[THEME RESOLVER] Found deck_theme in stylePreferences")

                # Validate
                should_regen, reason = self.validator.should_regenerate(deck_theme, title)
                if should_regen:
                    logger.info(f"[THEME RESOLVER] stylePreferences theme rejected: {reason}")
                    return ThemeResolutionResult(
                        theme=None,
                        palette=None,
                        search_terms=None,
                        source='style_preferences',
                        should_regenerate=True,
                        regenerate_reason=reason
                    )

                theme = ThemeSpec.from_dict(deck_theme)
                palette = self._extract_palette(deck_theme)

                logger.info(f"[THEME RESOLVER] ✅ Using theme from stylePreferences.deck_theme")
                return ThemeResolutionResult(
                    theme=theme,
                    palette=palette,
                    search_terms=None,
                    source='style_preferences',
                    should_regenerate=False
                )

            # Check for ColorConfigItem that can be used to reconstruct
            colors_config = getattr(style_prefs, 'colors', None)
            if colors_config:
                # Check if these are just defaults
                user_accent1 = getattr(colors_config, 'accent1', None)
                user_accent2 = getattr(colors_config, 'accent2', None)
                user_bg = getattr(colors_config, 'background', None)

                all_accents = [c for c in [user_accent1, user_accent2] if c]
                is_default_accents = all(
                    c.lower() in ThemeValidator.DEFAULT_ACCENTS
                    for c in all_accents
                ) if all_accents else True
                is_default_bg = (
                    user_bg.lower() in ThemeValidator.DEFAULT_BACKGROUNDS
                ) if user_bg else True

                if is_default_accents and is_default_bg:
                    logger.info(f"[THEME RESOLVER] stylePreferences has default colors - needs regeneration")
                    return ThemeResolutionResult(
                        theme=None,
                        palette=None,
                        search_terms=None,
                        source='style_preferences',
                        should_regenerate=True,
                        regenerate_reason=f"Default colors (accent1={user_accent1}, bg={user_bg})"
                    )

            return None

        except Exception as e:
            logger.warning(f"[THEME RESOLVER] Error reading stylePreferences: {e}")
            return None

    def _extract_palette(self, theme_data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract palette dict from theme data."""
        color_palette = theme_data.get('color_palette', {})
        return {
            'primary_background': color_palette.get('primary_background'),
            'primary_text': color_palette.get('primary_text'),
            'accent_1': color_palette.get('accent_1'),
            'accent_2': color_palette.get('accent_2'),
            'colors': color_palette.get('colors', []),
            'backgrounds': color_palette.get('backgrounds', []),
            'accents': color_palette.get('accents', []),
        }
