"""
Prompt builder for slide generation.
"""

from typing import Dict, Any, List, Optional, Tuple

from agents.domain.models import SlideGenerationContext
from services.outline.context_store import extract_grounding_context_from_notes
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
        def _truncate_static(text: str, limit: int = 4000) -> str:
            """Truncate with a higher limit for cached static context."""
            if len(text) <= limit:
                return text
            return text[:limit] + "\n[TRUNCATED]"

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
        grounding_context = extract_grounding_context_from_notes(notes if isinstance(notes, dict) else None)
        if grounding_context:
            research_context = grounding_context.get("research_context")
            scraped_context = grounding_context.get("scraped_context")
            content_context = grounding_context.get("content_context")
            file_context = grounding_context.get("file_context")
            file_intent = str(grounding_context.get("file_intent") or "").strip().lower()
            user_notes = grounding_context.get("user_notes")
            reference_sources = grounding_context.get("reference_sources")
            research_citations = grounding_context.get("research_citations")

            has_source_context = bool(
                (isinstance(content_context, str) and content_context.strip())
                or (isinstance(file_context, str) and file_context.strip())
            )
            source_only_mode = has_source_context and file_intent in {"use_content_only", "recreate_exact"}

            if has_source_context:
                sections.append("\n--- STRICT GROUNDING MODE ---")
                sections.append(
                    "SOURCE MATERIAL CONTEXT is the canonical factual source. "
                    "Do NOT introduce unsupported names (vendors, tools, people, places), numbers, dates, or claims. "
                    "If details are missing, keep wording generic or omit them."
                )

            if content_context:
                sections.append("\n--- SOURCE MATERIAL CONTEXT (uploaded files) ---")
                sections.append(_truncate_static(str(content_context), limit=5000))
            if file_context and (not content_context or file_context not in content_context):
                sections.append("\n--- FILE ANALYSIS CONTEXT ---")
                sections.append(_truncate_static(str(file_context), limit=3500))
            if file_intent:
                sections.append(f"SOURCE USAGE INTENT: {file_intent}")

            if research_context and not source_only_mode:
                sections.append("\n--- DECK-WIDE RESEARCH CONTEXT (secondary) ---")
                sections.append(_truncate_static(str(research_context), limit=4500))
            if scraped_context and not source_only_mode:
                sections.append("\n--- REFERENCE CONTEXT (secondary) ---")
                sections.append(_truncate_static(str(scraped_context), limit=4500))
            if source_only_mode and (research_context or scraped_context):
                sections.append(
                    "SOURCE-ONLY MODE: Ignore secondary research/reference context when adding factual details."
                )

            if user_notes:
                sections.append("\n--- USER NOTES (prioritize these preferences) ---")
                sections.append(_truncate_static(str(user_notes), limit=1800))
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
            sections.append("AVAILABLE VIDEOS (MUST USE):")
            for v in context.available_videos[:3]:
                title = v.get('title') or 'video'
                embed = v.get('embed_url')
                url = v.get('url')
                if embed:
                    sections.append(f"- {title}: embed with <iframe src=\"{embed}\" width=\"100%\" height=\"100%\" frameborder=\"0\" allowfullscreen></iframe>")
                elif url:
                    sections.append(f"- {title}: embed with <video src=\"{url}\" autoplay muted loop playsinline style=\"width:100%;height:100%;object-fit:cover\"></video>")
            sections.append(
                "MANDATORY: You MUST embed the first video above into this slide. "
                "Use an <iframe> for YouTube/Vimeo embed URLs, or <video> for direct URLs. "
                "Give the video prominent placement (at least 40% of the slide area). "
                "Do NOT replace it with an image placeholder."
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
