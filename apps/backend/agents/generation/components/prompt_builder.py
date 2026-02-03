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
            "Follow MODE for motion/interaction (interactive may use subtle motion or micro-interactions when helpful). "
            "Return ONLY valid JSON matching the slide schema."
        )

    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        brand_logo_url: Optional[str] = None,
    ) -> str:
        """Build a minimal user prompt."""
        static_block, slide_block = self.build_user_prompt_blocks(
            context, brand_logo_url
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
        brand_logo_url: Optional[str] = None,
    ) -> Tuple[str, str]:
        """Build deck-static and per-slide prompt blocks separately."""
        cache_key = self._get_static_block_key(context)
        static_block = self._static_block_cache.get(cache_key)
        if static_block is None:
            static_block = self._build_static_block(context, brand_logo_url)
            self._static_block_cache[cache_key] = static_block

        slide_block = self._build_slide_block(context)
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

        has_palette = any(
            colors.get(key)
            for key in ("primary_background", "primary_text", "accent_1", "accent_2")
        )
        if has_palette:
            sections.append("THEME COLORS:")
            if colors.get("primary_background"):
                sections.append(f"- background: {colors.get('primary_background')}")
            if colors.get("primary_text"):
                sections.append(f"- text: {colors.get('primary_text')}")
            if colors.get("accent_1"):
                sections.append(f"- accent_1: {colors.get('accent_1')}")
            if colors.get("accent_2"):
                sections.append(f"- accent_2: {colors.get('accent_2')}")
            sections.append(
                "COLOR USE: Use only the palette colors above (plus white/black for legibility). "
                "Do not introduce new brand colors."
            )
        else:
            sections.append(
                "THEME COLORS: None provided. Choose a cohesive palette that matches the topic and keep it consistent."
            )

        if hero_font or body_font:
            sections.append("FONTS:")
            if hero_font:
                sections.append(f"- heading: {hero_font}")
            if body_font:
                sections.append(f"- body: {body_font}")

        # Skip base64 data URLs - they're too large for prompts (can be 50K+ chars)
        if brand_logo_url and not brand_logo_url.startswith("data:"):
            sections.append(f"LOGO: {brand_logo_url}")
            sections.append(
                "LOGO PLACEMENT: bottom-left (x:60, y:1020), max 40px height. Same position on every slide."
            )
        sections.append(
            "PAGE NUMBER: bottom-right (x:1820, y:1040), just the slide number (e.g. '3'), 13px, muted. Same position on every slide."
        )

        sections.extend(
            [
                "DESIGN: Premium slide layout with clear hierarchy, clean grid, and balanced whitespace. Avoid webpage UI elements.",
                "CANVAS: 1920x1080.",
                "OUTPUT: JSON with fields {id, title, components}.",
                "Each component must include {id, type, props}.",
                "VALID COMPONENT TYPES (use ONLY these): Background, TiptapTextBlock, Image, Video, Chart, Shape, CustomComponent, Lines, Group, Icon, Table, Math, Diagram.",
                "No extra text outside JSON.",
                "If you need images, use Image components or CustomComponent HTML with placeholder src and descriptive alt text.",
            ]
        )

        # Add deck-wide research context to static block (cached once, not per-slide)
        # This reduces prompt size from ~29K per slide to ~3K per slide + ~20K cached once
        notes = getattr(context.deck_outline, "notes", None) if hasattr(context, "deck_outline") else None
        if isinstance(notes, dict):
            def _truncate_static(text: str, limit: int = 4000) -> str:
                """Truncate with slightly higher limit for cached static context."""
                if len(text) <= limit:
                    return text
                return text[:limit] + "\n[TRUNCATED]"

            research_context = notes.get("research_context") or notes.get("researchContext")
            scraped_context = notes.get("scraped_context") or notes.get("scrapedContext")
            reference_sources = notes.get("reference_sources") or notes.get("referenceSources")
            research_citations = notes.get("research_citations") or notes.get("researchCitations")

            if research_context:
                sections.append("\n--- DECK-WIDE RESEARCH CONTEXT (use for all slides) ---")
                sections.append(_truncate_static(str(research_context)))
            if scraped_context:
                sections.append("\n--- REFERENCE CONTEXT (use for all slides) ---")
                sections.append(_truncate_static(str(scraped_context)))
            if isinstance(reference_sources, list) and reference_sources:
                sources = [
                    f"{s.get('title') or 'Source'} ({s.get('url') or 'n/a'})"
                    for s in reference_sources
                    if isinstance(s, dict)
                ]
                if sources:
                    sections.append("REFERENCE SOURCES:")
                    sections.append("- " + "; ".join(sources[:8]))
            if isinstance(research_citations, list) and research_citations:
                sections.append("RESEARCH CITATIONS:")
                sections.append("- " + "; ".join(str(c) for c in research_citations[:8]))

        # Add presentation context to static block too (it's deck-wide)
        if context.presentation_context:
            sections.append(f"\nPRESENTATION CONTEXT: {context.presentation_context}")

        return "\n".join(sections)

    def _build_slide_block(
        self,
        context: SlideGenerationContext,
    ) -> str:
        """Build per-slide prompt content."""
        sections: List[str] = []

        sections.append(
            f"SLIDE {context.slide_index + 1} of {context.total_slides}"
        )
        sections.append(f"TITLE: {context.slide_outline.title}")
        sections.append("CONTENT:")
        sections.append(context.slide_outline.content or "")

        slide_mode = None
        style_prefs = getattr(context.deck_outline, "stylePreferences", None)
        if style_prefs:
            if isinstance(style_prefs, dict):
                slide_mode = style_prefs.get("slideMode")
            else:
                slide_mode = getattr(style_prefs, "slideMode", None)
        if slide_mode:
            sections.append(f"MODE: {slide_mode}")

        # NOTE: Research context, scraped context, reference sources, and citations
        # have been moved to the STATIC block (_build_static_block) to enable caching.
        # This reduces per-slide prompt size significantly for large research prompts.

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
            use_uploaded_images = bool(getattr(context.deck_outline, "use_uploaded_images", False))
            if use_uploaded_images:
                sections.append(
                    "MEDIA INSTRUCTIONS: Use these tagged images in the slide. "
                    "Include Image components or <img src=\"placeholder\" alt=\"...\"> "
                    "so the system can auto-apply the uploaded assets."
                )

        if context.available_videos:
            sections.append("AVAILABLE VIDEOS:")
            sections.append(
                "- "
                + ", ".join(
                    (
                        f"{(v.get('title') or 'video')} ({v.get('embed_url') or v.get('url')})"
                        if (v.get("embed_url") or v.get("url"))
                        else (v.get("title") or "video")
                    )
                    for v in context.available_videos[:5]
                )
            )
            sections.append(
                "VIDEO USE: A video has been assigned to this slide. Embed the first available video "
                "(Video component or <video>/<iframe> inside a CustomComponent)."
            )

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
