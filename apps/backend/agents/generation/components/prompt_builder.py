"""
Prompt builder for slide generation.
"""

from typing import Dict, Any, List, Optional, Tuple

from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SlidePromptBuilder:
    """Builds lightweight prompts for slide generation."""

    MAX_CONTEXT_CHARS = 32000  # ~8,000 tokens

    def __init__(self) -> None:
        # Memoize deck-wide static prompt blocks so every slide reuses identical cached content
        self._static_block_cache: Dict[str, str] = {}

    def build_system_prompt(self) -> str:
        """Build a minimal system prompt."""
        return (
            "You are a presentation slide generator. Use the provided content and theme. "
            "Return ONLY valid JSON matching the slide schema."
        )

    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        component_hints: Optional[List[str]] = None,
        brand_logo_url: Optional[str] = None,
    ) -> str:
        """Build a minimal user prompt."""
        static_block, slide_block = self.build_user_prompt_blocks(
            context, component_hints, brand_logo_url
        )
        prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
        if len(prompt) > self.MAX_CONTEXT_CHARS:
            logger.warning("Prompt exceeds limit; truncating slide block for safety")
            prompt = (
                prompt[: self.MAX_CONTEXT_CHARS - 200]
                + "\n\n[TRUNCATED]"
            )
        return prompt

    def build_user_prompt_blocks(
        self,
        context: SlideGenerationContext,
        component_hints: Optional[List[str]] = None,
        brand_logo_url: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Build deck-static and per-slide prompt blocks separately."""
        cache_key = self._get_static_block_key(context)
        static_block = self._static_block_cache.get(cache_key)
        if static_block is None:
            static_block = self._build_static_block(context, brand_logo_url)
            self._static_block_cache[cache_key] = static_block

        slide_block = self._build_slide_block(context, component_hints)
        return static_block, slide_block

    def _build_static_block(
        self,
        context: SlideGenerationContext,
        brand_logo_url: Optional[str],
    ) -> str:
        """Build minimal deck-static instructions."""
        sections: List[str] = []

        theme = (
            context.theme.to_dict()
            if hasattr(context.theme, "to_dict")
            else (context.theme or {})
        )
        colors = context.palette or theme.get("color_palette", {})
        typography = theme.get("typography", {}) or {}

        hero_font = (
            (typography.get("hero_title") or {}).get("family")
            or typography.get("hero_font")
            or ""
        )
        body_font = (
            (typography.get("body_text") or {}).get("family")
            or typography.get("body_font")
            or ""
        )

        sections.extend(
            [
                "THEME:",
                f"- background: {colors.get('primary_background', '#FFFFFF')}",
                f"- text: {colors.get('primary_text', '#111111')}",
                f"- accent_1: {colors.get('accent_1', '#2563EB')}",
                f"- accent_2: {colors.get('accent_2', '#F59E0B')}",
            ]
        )

        if hero_font or body_font:
            sections.append("FONTS:")
            if hero_font:
                sections.append(f"- heading: {hero_font}")
            if body_font:
                sections.append(f"- body: {body_font}")

        if brand_logo_url:
            sections.append(f"LOGO: {brand_logo_url}")

        sections.extend(
            [
                "CANVAS: 1920x1080.",
                "OUTPUT: JSON with fields {id, title, components}.",
                "Each component must include {id, type, props}.",
                "No extra text outside JSON.",
                "If you need images, use Image components or CustomComponent HTML with placeholder src and descriptive alt text.",
            ]
        )

        return "\n".join(sections)

    def _build_slide_block(
        self,
        context: SlideGenerationContext,
        component_hints: Optional[List[str]],
    ) -> str:
        """Build per-slide prompt content."""
        sections: List[str] = []

        sections.append(
            f"SLIDE {context.slide_index + 1} of {context.total_slides}"
        )
        sections.append(f"TITLE: {context.slide_outline.title}")
        sections.append("CONTENT:")
        sections.append(context.slide_outline.content or "")

        if context.presentation_context:
            sections.append(
                f"PRESENTATION CONTEXT: {context.presentation_context}"
            )

        if context.reference_images:
            refs = "\n".join(
                f"- {url}" for url in context.reference_images[:5]
            )
            sections.append("REFERENCE IMAGES (style only):")
            sections.append(refs)

        if context.available_images:
            sections.append("AVAILABLE IMAGES:")
            sections.append(
                "- "
                + ", ".join(
                    str(img)[:80] for img in context.available_images[:5]
                )
            )

        if context.tagged_media:
            names = [m.get("filename") or m.get("name") for m in context.tagged_media]
            names = [n for n in names if n]
            if names:
                sections.append("TAGGED MEDIA:")
                sections.append("- " + ", ".join(names[:8]))

        if context.available_videos:
            sections.append("AVAILABLE VIDEOS:")
            sections.append(
                "- "
                + ", ".join(
                    v.get("title") or v.get("url") or "video"
                    for v in context.available_videos[:5]
                )
            )

        if component_hints:
            filtered = [
                comp for comp in component_hints
                if str(comp).strip().lower() != "chart"
            ]
            if filtered:
                sections.append("SUGGESTED COMPONENTS: " + ", ".join(filtered))

        return "\n".join(sections)

    def _get_static_block_key(self, context: SlideGenerationContext) -> str:
        """Build a cache key for deck-static prompt content."""
        try:
            if getattr(context, "deck_uuid", None):
                return f"deck:{context.deck_uuid}"
        except Exception:
            pass

        try:
            deck_outline = getattr(context, "deck_outline", None)
            if deck_outline and getattr(deck_outline, "deckId", None):
                return f"deck-outline:{deck_outline.deckId}"
        except Exception:
            pass

        return "deck:unknown"
