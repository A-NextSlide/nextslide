"""
Image generation prompt builder for AI images used inside slides.

Generates theme-aware, slide-aware prompts for two broad categories:
- Artistic/hero photography (dynamic angles, motion, imperfect aesthetics)
- Educational/diagrammatic visuals (clear, accurate, infographic-like)

Also supports programmatic chroma-key workflow by requesting a flat solid
background color for non-hero supporting assets that need transparency later.
"""

from __future__ import annotations

from typing import Dict, Any, List, Tuple


class ImageGenerationPromptBuilder:
    """Build prompts for AI image generation per image component.

    The builder returns a list of dicts describing each requested image:
    - prompt: str
    - size: str (e.g., "1536x1024")
    - needs_transparency: bool (True means we will chroma-key post process)
    - background_color: str hex (only used when needs_transparency True)
    - component_index: int (which component the prompt applies to)
    """

    # Color used for chroma-key background. Pick a vivid, unlikely color.
    DEFAULT_CHROMA_COLOR = "#00FD00"  # sharp green

    def __init__(self, theme: Dict[str, Any] | None = None) -> None:
        self.theme = theme or {}

    def build_for_slide(
        self,
        slide_data: Dict[str, Any],
        slide_title: str,
        slide_content: str,
        max_images: int = 3
    ) -> List[Dict[str, Any]]:
        """Create up to max_images prompts for placeholder components in a slide.

        Heuristics:
        - Prefer the largest placeholder as a hero/background candidate (no transparency)
        - For smaller placeholders, request assets with a flat chroma color background
          to be removed later via chroma key
        - If slide appears educational/diagrammatic, focus on clarity/infographics
        - If content suggests data/chart, reduce count to avoid clutter
        """
        components = slide_data.get("components", []) or []
        image_placeholders: List[Tuple[int, Dict[str, Any], int]] = []  # (index, comp, area)

        for idx, comp in enumerate(components):
            if comp.get("type") != "Image":
                continue
            props = comp.get("props", {}) or {}
            # Skip logo components entirely – they should remain as logo placeholders
            try:
                alt_text = (props.get("alt") or "").strip().lower()
                metadata_kind = ((props.get("metadata") or {}).get("kind") or "").strip().lower()
                if alt_text == "logo" or metadata_kind == "logo":
                    continue
            except Exception:
                pass
            src = (props.get("src") or "").strip().lower()
            if src not in ("", "placeholder"):
                continue
            w = int(props.get("width", 0) or 0)
            h = int(props.get("height", 0) or 0)
            area = max(0, w) * max(0, h)
            image_placeholders.append((idx, comp, area))

        if not image_placeholders:
            return []

        # Sort by area descending to find hero candidate first
        image_placeholders.sort(key=lambda t: t[2], reverse=True)

        # Determine educational vs artistic intent
        is_educational = self._is_educational_slide(slide_title, slide_content)
        has_heavy_data = self._has_heavy_data_keywords(slide_title, slide_content)
        # Detect narrative/biographical/historical topics to allow large hero imagery
        t = f"{(slide_title or '').lower()} {(slide_content or '').lower()}"
        is_narrative_topic = any(k in t for k in [
            'biography','biographical','historical','history','founder','inventor','timeline','era','revolution','enlightenment','renaissance'
        ])

        # Decide how many to generate (0–3)
        desired_count = min(max_images, len(image_placeholders))
        if has_heavy_data:
            # Data-heavy slides should not be cluttered; maybe a single small accent image
            desired_count = min(desired_count, 1)

        plans: List[Dict[str, Any]] = []
        if desired_count <= 0:
            return plans

        # First: hero candidate if the largest placeholder occupies a large area
        hero_candidate = image_placeholders[0]
        hero_is_large = self._is_large_area(hero_candidate[1])
        is_minimal = self._is_minimal_slide(slide_data)

        # If hero placeholder is large, prefer it on minimal or narrative slides
        if hero_is_large and (is_minimal or is_narrative_topic) and desired_count > 0:
            idx, comp, _ = hero_candidate
            prompt = self._build_hero_prompt(slide_title, slide_content, is_educational)
            size = self._infer_size(comp)
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": False,
                "background_color": None,
                "component_index": idx,
            })
            desired_count -= 1
        else:
            # Treat as non-hero; avoid full-bleed generation on busy slides
            hero_is_large = False

        # Remaining: supporting assets with chroma-key backgrounds
        for idx, comp, _ in image_placeholders[(1 if hero_is_large else 0): (1 if hero_is_large else 0) + desired_count]:
            prompt = self._build_supporting_prompt(slide_title, slide_content, is_educational)
            size = self._infer_size(comp)
            # Force flat background color to enable chroma key
            prompt += f" Use a flat, SOLID background of color {self.DEFAULT_CHROMA_COLOR}. No texture, no gradient, no shadow."
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": True,
                "background_color": self.DEFAULT_CHROMA_COLOR,
                "component_index": idx,
            })

        return plans

    # -------- Functional image modes (non-decorative) --------

    def _is_team_slide(self, title: str, content: str) -> bool:
        t = f"{(title or '').lower()} {(content or '').lower()}"
        keys = ["team", "our team", "meet the team", "speaker", "about us", "bios", "profile", "headshot"]
        return any(k in t for k in keys)

    def build_team_for_slide(
        self,
        slide_data: Dict[str, Any],
        slide_title: str,
        slide_content: str,
        max_images: int = 3
    ) -> List[Dict[str, Any]]:
        """Generate team headshot or group images for team slides.

        - Prefers 1–3 headshot-style assets for small placeholders
        - Uses chroma background for easy masking
        - No embedded text; clean, neutral lighting; slight vignette OK
        """
        components = slide_data.get("components", []) or []
        placeholders: List[Tuple[int, Dict[str, Any], int]] = []
        for idx, comp in enumerate(components):
            if comp.get("type") != "Image":
                continue
            props = comp.get("props", {}) or {}
            src = (props.get("src") or "").strip().lower()
            if src not in ("", "placeholder"):
                continue
            w = int(props.get("width", 0) or 0)
            h = int(props.get("height", 0) or 0)
            area = max(0, w) * max(0, h)
            placeholders.append((idx, comp, area))

        if not placeholders:
            return []

        placeholders.sort(key=lambda t: t[2], reverse=True)
        chosen = placeholders[: max(1, max_images)]

        theme_desc = self._theme_short()
        plans: List[Dict[str, Any]] = []
        for idx, comp, _ in chosen:
            size = self._infer_size(comp)
            prompt = (
                f"Create a professional portrait (head-and-shoulders) suitable for a team slide. "
                f"Neutral background, soft studio lighting, centered subject, no text. "
                f"Style aligns with {theme_desc}. The portrait should be generic, not a specific person, and suitable as a placeholder headshot. "
                f"Avoid watermarks; high-resolution; balanced contrast."
            )
            # Use chroma for easy cutout
            prompt += f" Use a flat SOLID background of color {self.DEFAULT_CHROMA_COLOR} so it can be removed."
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": True,
                "background_color": self.DEFAULT_CHROMA_COLOR,
                "component_index": idx,
            })

        return plans

    def build_hero_design_element_for_slide(
        self,
        slide_data: Dict[str, Any],
        slide_title: str,
        slide_content: str,
        max_images: int = 1
    ) -> List[Dict[str, Any]]:
        """Generate a functional hero/section image (non-decorative) tied to content.

        Used for large placeholders that occupy significant space. Focus on editorial,
        content-relevant imagery that supports the slide (not random patterns).
        """
        components = slide_data.get("components", []) or []
        candidates: List[Tuple[int, Dict[str, Any], int]] = []
        for idx, comp in enumerate(components):
            if comp.get("type") != "Image":
                continue
            props = comp.get("props", {}) or {}
            src = (props.get("src") or "").strip().lower()
            if src not in ("", "placeholder"):
                continue
            if not self._is_large_area(comp):
                continue
            w = int(props.get("width", 0) or 0)
            h = int(props.get("height", 0) or 0)
            area = max(0, w) * max(0, h)
            candidates.append((idx, comp, area))

        if not candidates:
            return []

        candidates.sort(key=lambda t: t[2], reverse=True)
        chosen = candidates[: max(1, max_images)]

        theme_desc = self._theme_short()
        # Simple, theme-driven prompt (no outline context)

        plans: List[Dict[str, Any]] = []
        for idx, comp, _ in chosen:
            size = self._infer_size(comp)
            prompt = (
                f"Create a simple, photorealistic editorial image that supports the section for '{slide_title}'. "
                f"Style strictly matches {theme_desc}. No embedded text, no random patterns, no UI frames, no background replacement. "
                f"Keep composition simple with safe margins; do not place important visual elements where slide text typically goes."
            )
            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": False,
                "background_color": None,
                "component_index": idx,
            })

        return plans

    def build_infographic_for_slide(
        self,
        slide_data: Dict[str, Any],
        slide_title: str,
        slide_content: str,
        max_images: int = 1
    ) -> List[Dict[str, Any]]:
        """Create infographic-focused prompts using theme + slide content.

        Always prefers a single, high-quality vector-style infographic. Uses
        theme colors; avoids embedded text; crisp lines; diagrammatic layout.
        """
        components = slide_data.get("components", []) or []
        image_placeholders: List[Tuple[int, Dict[str, Any], int]] = []

        for idx, comp in enumerate(components):
            if comp.get("type") != "Image":
                continue
            props = comp.get("props", {}) or {}
            src = (props.get("src") or "").strip().lower()
            if src not in ("", "placeholder"):
                continue
            w = int(props.get("width", 0) or 0)
            h = int(props.get("height", 0) or 0)
            area = max(0, w) * max(0, h)
            image_placeholders.append((idx, comp, area))

        if not image_placeholders:
            return []

        # Pick the best (largest) placeholder for an infographic
        image_placeholders.sort(key=lambda t: t[2], reverse=True)
        chosen = image_placeholders[: max(1, max_images)]

        theme_desc = self._theme_short()

        # Extract color palette for explicit guidance
        palette = (self.theme or {}).get("color_palette", {}) or {}
        bg = palette.get("primary_background") or "#FFFFFF"
        a1 = palette.get("accent_1") or "#10b981"
        a2 = palette.get("accent_2") or "#f97316"
        text_on_bg = palette.get("primary_text") or "#1A202C"

        # Build simple, theme-driven prompt (no outline context passed)

        plans: List[Dict[str, Any]] = []
        for idx, comp, _ in chosen:
            is_hero = self._is_large_area(comp)
            size = self._infer_size(comp)
            prompt = (
                f"Create a simple, clear vector infographic (no raster textures) about '{slide_title}'. "
                f"Style & palette must match {theme_desc}. Use colors: background {bg}, accents {a1}/{a2}, text {text_on_bg}. "
                f"Crisp strokes, high contrast, balanced composition. Prefer shapes/arrows/icons; leave clear negative space for text overlay. "
                f"No watermarks, no signatures, no UI frames."
            )

            # Suggest diagram type based on aspect ratio; encourage larger size
            try:
                props = comp.get("props", {}) or {}
                w = int(props.get("width", 0) or 0)
                h = int(props.get("height", 0) or 0)
                aspect = (w / max(1, h)) if (w and h) else 1.0
            except Exception:
                aspect = 1.0
            if aspect >= 1.6:
                prompt += " Prefer timelines/flows or comparative multi-column layouts."
            elif aspect <= 0.8:
                prompt += " Prefer stacked diagrams or layered process blocks."
            else:
                prompt += " Prefer central radial or cluster diagrams."
            prompt += " Make the infographic large within its box (e.g., 1080px height) and leave clear margin where slide text will appear."

            # Transparency only for smaller overlays
            needs_transparency = not is_hero
            if needs_transparency:
                prompt += f" Use a flat SOLID background of color {self.DEFAULT_CHROMA_COLOR} so it can be removed (no gradients, no texture)."

            plans.append({
                "prompt": prompt,
                "size": size,
                "needs_transparency": needs_transparency,
                "background_color": (self.DEFAULT_CHROMA_COLOR if needs_transparency else None),
                "component_index": idx,
            })

        return plans

    # --- Helpers ---

    def _is_large_area(self, comp: Dict[str, Any]) -> bool:
        w = int((comp.get("props", {}) or {}).get("width", 0) or 0)
        h = int((comp.get("props", {}) or {}).get("height", 0) or 0)
        # Consider large if occupies roughly >= 40% of 1920x1080 canvas
        area = w * h
        return area >= int(1920 * 1080 * 0.40)

    def _is_minimal_slide(self, slide_data: Dict[str, Any]) -> bool:
        """Rough heuristic: minimal slides have few content components and few words.
        We count text blocks, charts, custom components, icons.
        """
        try:
            components = slide_data.get('components', []) or []
            content_types = {"TiptapTextBlock", "TextBlock", "Title", "Chart", "CustomComponent", "Icon", "Table"}
            content_components = [c for c in components if c.get('type') in content_types]
            # Word count from text blocks
            words = 0
            for c in components:
                if c.get('type') in ("TiptapTextBlock", "TextBlock", "Title"):
                    props = c.get('props', {}) or {}
                    if isinstance(props.get('text'), str):
                        words += len(props['text'].split())
                    texts = props.get('texts') or []
                    if isinstance(texts, list):
                        for seg in texts:
                            t = seg.get('text') or seg.get('content')
                            if isinstance(t, str):
                                words += len(t.split())
            return len(content_components) <= 3 and words <= 40
        except Exception:
            return False

    def _infer_size(self, comp: Dict[str, Any]) -> str:
        props = comp.get("props", {}) or {}
        w = int(props.get("width", 0) or 0)
        h = int(props.get("height", 0) or 0)
        # Default widescreen size if unknown
        if w <= 0 or h <= 0:
            return "1536x1024"
        # Normalize to closest of a few supported buckets while preserving aspect
        aspect = (w / max(1, h))
        if aspect >= 1.4:  # landscape-ish
            return "1536x1024"
        elif aspect <= 0.8:  # portrait-ish
            return "1024x1536"
        else:
            return "1024x1024"

    def _is_educational_slide(self, title: str, content: str) -> bool:
        text = f"{(title or '').lower()} {(content or '').lower()}"
        educational_terms = [
            "diagram", "architecture", "flow", "process", "timeline", "infographic",
            "labeled", "step-by-step", "schematic", "map", "taxonomy", "chart"
        ]
        return any(t in text for t in educational_terms)

    def _has_heavy_data_keywords(self, title: str, content: str) -> bool:
        text = f"{(title or '').lower()} {(content or '').lower()}"
        return any(t in text for t in ["chart", "data", "graph", "metrics", "statistics", "kpi"])

    def _build_hero_prompt(self, title: str, content: str, educational: bool) -> str:
        theme_desc = self._theme_short()
        if educational:
            return (
                f"Create a content-relevant, photorealistic editorial image that matches '{theme_desc}'. "
                f"Keep composition simple and readable, no background replacement, no surreal elements. "
                f"Natural lighting, realistic lens (35–85mm look), gentle depth, no embedded text or labels."
            )
        return (
            f"Create a photorealistic editorial image that supports the section for '{title}', matching '{theme_desc}'. "
            f"Real-world setting or abstract-but-real materials (architecture, product, texture). No fantasy/surreal artifacts. "
            f"Natural lighting, realistic lens (35–85mm), minimal color grading aligned to theme, no embedded text."
        )

    def _build_supporting_prompt(self, title: str, content: str, educational: bool) -> str:
        theme_desc = self._theme_short()
        if educational:
            return (
                f"Create a clean supporting visual matching '{theme_desc}', suitable for overlay. "
                f"Think icon-like clarity, minimal shading, crisp edges. "
                f"Subject tied to '{title}'."
            )
        return (
            f"Create a small, photorealistic supporting image matching '{theme_desc}', suitable for overlay inside its box. "
            f"Subject tied to '{title}'. Simple, clean composition, neutral or shallow background, no dramatic effects, no embedded text."
        )

    def _theme_short(self) -> str:
        try:
            name = (self.theme or {}).get("theme_name") or "the deck's theme"
            cp = (self.theme or {}).get("color_palette", {}) or {}
            accent_1 = cp.get("accent_1") or "accent_1"
            accent_2 = cp.get("accent_2") or "accent_2"
            bg = cp.get("primary_background") or "background"
            return f"{name} (accents {accent_1}/{accent_2}, background {bg})"
        except Exception:
            return "the deck's theme"


