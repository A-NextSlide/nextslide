"""
Dedicated CustomComponent generator using Gemini 3 Pro for creative HTML/CSS/JS generation.

This module generates visually stunning CustomComponents for slides using:
- Gemini 3 Pro's creative capabilities (with Claude Opus 4.5 fallback on rate limits)
- Full HTML document mode (iframe)
- Tailwind CSS for styling
- Context-aware design (theme, content, style)
"""

import asyncio
import logging
from typing import Dict, Any, Optional, List, Tuple
from datetime import datetime

from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import (
    CUSTOM_COMPONENT_MODEL,
    CUSTOM_COMPONENT_FALLBACK_MODEL,
    CUSTOM_COMPONENT_TEMPERATURE,
    ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN
)
from agents.generation.exceptions import AIRateLimitError
from utils.logo_extractor import get_logo_with_inversion
from agents.generation.custom_component_multimodal import build_multimodal_user_content
from agents.generation.custom_component_image_pipeline import resolve_images, upload_external_urls_to_bucket

# Provider name for rate limit tracking
GEMINI_PROVIDER = "gemini"
from setup_logging_optimized import get_logger

from agents.generation.custom_component_helpers import (
    _reference_images_from_uploaded_media,
    _extract_fonts_from_typography,
)
from agents.generation.custom_component_html import CustomComponentHtmlProcessor

logger = get_logger(__name__)

from agents.config import MAX_API_CONCURRENT_CALLS

_AI_SEMAPHORE = asyncio.Semaphore(MAX_API_CONCURRENT_CALLS)


class CustomComponentGenerator:
    """
    Generates creative CustomComponents using Gemini 3 Pro (with Opus 4.5 fallback).

    This generator creates visually impressive HTML/CSS/JS components that:
    - Match the presentation theme
    - Visualize content in engaging ways
    - Use modern web design patterns
    - Include animations and interactivity

    Falls back to Claude Opus 4.5 if Gemini rate limits are hit.
    """

    def __init__(self, model: str = CUSTOM_COMPONENT_MODEL):
        self.model = model
        self.temperature = CUSTOM_COMPONENT_TEMPERATURE
        self.generation_timeout = 120.0
        self._html_processor = CustomComponentHtmlProcessor()

    def _inject_prefetched_images_into_html(self, html: str, prefetched_images: Dict[str, str]) -> str:
        """Backward-compatible wrapper for HTML image injection."""
        return self._html_processor.inject_prefetched_images(html, prefetched_images)

    async def generate(
        self,
        content: str,
        theme: Dict[str, Any],
        slide_context: Dict[str, Any],
        component_purpose: str = "visualize",
        width: int = 1920,
        height: int = 1080,
        position: Dict[str, int] = None,
        external_media: Optional[Dict[str, Any]] = None,
        uploaded_media: Optional[list] = None,
        available_images: Optional[List[Any]] = None,
        prefetched_images: Optional[Dict[str, str]] = None,
        auto_prefetch: bool = True,
        reference_images: Optional[List[str]] = None,
        available_videos: Optional[List[Dict[str, Any]]] = None,
        deck_uuid: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a creative CustomComponent.

        Args:
            content: The content to visualize/present
            theme: Theme dict with colors, fonts, style
            slide_context: Context about the slide (title, index, total, type)
            component_purpose: What the component should do (visualize, explain, emphasize, engage)
            width: Component width in pixels
            height: Component height in pixels
            position: Optional dict with x, y coordinates
            external_media: Optional dict with media from external sources (Firecrawl)
            uploaded_media: Optional list of user-uploaded files (taggedMedia)
            available_images: Optional list of already-available images (extracted/prefetched)
            prefetched_images: Optional dict of {propName: imageUrl} pre-fetched images
            auto_prefetch: If True, search for missing image props
            reference_images: Optional list of design reference image URLs
            available_videos: Optional list of scraped video dicts from VideoScraper
            deck_uuid: Optional deck UUID for image search caching

        Returns:
            CustomComponent dict with type, props, position, etc.
        """
        if not ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN:
            logger.info("Dedicated CustomComponent generation disabled")
            return None

        start_time = datetime.now()

        try:
            if (not reference_images) and uploaded_media:
                reference_images = _reference_images_from_uploaded_media(uploaded_media) or None

            colors = theme.get('color_palette', {})
            typography = theme.get('typography', {})
            design_philosophy = theme.get('design_philosophy', '')

            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(
                    "[CUSTOM_COMPONENT] Theme typography keys: %s",
                    list(typography.keys()) if typography else "None",
                )

            logo_url, _ = get_logo_with_inversion(theme)
            if logo_url:
                logger.info("[CUSTOM_COMPONENT] Logo URL found: %s", logo_url[:60])

            system_prompt = self._build_system_prompt(colors, typography, design_philosophy, logo_url)
            user_prompt = self._build_user_prompt(
                content=content,
                slide_context=slide_context,
                width=width,
                height=height,
                component_purpose=component_purpose,
                external_media=external_media,
                uploaded_media=uploaded_media,
                prefetched_images=prefetched_images,
                reference_images=reference_images,
                logo_url=logo_url,
                available_videos=available_videos,
            )

            user_content, image_count = await build_multimodal_user_content(user_prompt, reference_images or [])
            if isinstance(user_content, list):
                logger.info(
                    "[CUSTOM_COMPONENT] Using multimodal prompt with %s reference images",
                    image_count,
                )

            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content},
            ]

            response, used_fallback = await self._invoke_with_fallback(messages)
            if used_fallback:
                logger.info("[CUSTOM_COMPONENT] Used fallback model for this generation")

            html_content = self._html_processor.extract_html(response)
            if not html_content:
                logger.warning("[CUSTOM_COMPONENT] Failed to extract HTML from response")
                return None

            html_content, prefetched_images = await resolve_images(
                html_content,
                theme=theme,
                slide_context=slide_context or {},
                content=content or "",
                available_images=available_images,
                uploaded_media=uploaded_media,
                prefetched_images=prefetched_images,
                auto_prefetch=auto_prefetch,
                deck_uuid=deck_uuid,
                html_processor=self._html_processor,
            )

            html_content = await upload_external_urls_to_bucket(html_content)

            elapsed = (datetime.now() - start_time).total_seconds()
            logger.info(
                "[CUSTOM_COMPONENT] Generated in %.1fs (%s chars)",
                elapsed,
                len(html_content),
            )

            image_props = {
                k: v
                for k, v in (prefetched_images or {}).items()
                if not k.endswith('_query')
            }

            if logo_url:
                image_props['logoUrl'] = logo_url

            hero_font, body_font = _extract_fonts_from_typography(typography)
            logger.info("[CUSTOM_COMPONENT] Using fonts: hero=%s, body=%s", hero_font, body_font)

            component = {
                "id": f"custom-{datetime.now().strftime('%H%M%S%f')}",
                "type": "CustomComponent",
                "props": {
                    "render": html_content,
                    "width": width,
                    "height": height,
                    "primaryColor": colors.get('accent_1', '#6366f1'),
                    "secondaryColor": colors.get('accent_2', colors.get('accent_1', '#8b5cf6')),
                    "textColor": colors.get('primary_text', '#ffffff'),
                    "fontFamily": body_font,
                    "heroFont": hero_font,
                    "logoUrl": logo_url,
                    "props": image_props,
                },
                "position": position or {"x": 0, "y": 0},
                "width": width,
                "height": height,
            }

            return component

        except asyncio.TimeoutError:
            logger.error(
                "[CUSTOM_COMPONENT] Generation timed out after %ss (including fallback attempt)",
                self.generation_timeout,
            )
            return None
        except Exception as exc:
            logger.error("[CUSTOM_COMPONENT] Generation failed (including fallback): %s", exc)
            return None

    async def _invoke_with_fallback(self, messages: List[Dict[str, Any]]) -> Tuple[Any, bool]:
        loop = asyncio.get_event_loop()
        used_fallback = False

        client, model_name = get_client(self.model)
        active_client, active_model = client, model_name

        if is_provider_in_cooldown(GEMINI_PROVIDER):
            logger.info("[CUSTOM_COMPONENT] Gemini in cooldown, using fallback: %s", CUSTOM_COMPONENT_FALLBACK_MODEL)
            active_client, active_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
            used_fallback = True

        try:
            response = await self._invoke_model(loop, active_client, active_model, messages)
        except AIRateLimitError:
            if not used_fallback:
                mark_provider_rate_limited(GEMINI_PROVIDER)
                fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                response = await self._invoke_model(loop, fallback_client, fallback_model, messages)
                used_fallback = True
            else:
                raise
        except Exception as exc:
            if self._should_fallback_from_error(exc) and not used_fallback:
                fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                response = await self._invoke_model(loop, fallback_client, fallback_model, messages)
                used_fallback = True
            else:
                raise

        if self._is_empty_response(response) and not used_fallback:
            try:
                fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                response = await self._invoke_model(loop, fallback_client, fallback_model, messages)
                used_fallback = True
            except Exception as exc:
                logger.warning("[CUSTOM_COMPONENT] Fallback failed after empty response: %s", exc)

        return response, used_fallback

    async def _invoke_model(
        self,
        loop: asyncio.AbstractEventLoop,
        client: Any,
        model: str,
        messages: List[Dict[str, Any]],
    ) -> Any:
        logger.info("[CUSTOM_COMPONENT] Calling %s with temperature=%s", model, self.temperature)
        return await asyncio.wait_for(
            loop.run_in_executor(
                None,
                invoke,
                client,
                model,
                messages,
                None,
                32000,
                self.temperature,
            ),
            timeout=self.generation_timeout,
        )

    @staticmethod
    def _should_fallback_from_error(error: Exception) -> bool:
        if isinstance(error, (TimeoutError, asyncio.TimeoutError)):
            return True
        error_str = str(error).lower()
        return any(
            term in error_str
            for term in ['503', '500', '502', '504', 'unavailable', 'overloaded', 'server error']
        )

    @staticmethod
    def _is_empty_response(response: Any) -> bool:
        if response is None:
            return True
        if isinstance(response, str):
            return len(response.strip()) < 100
        return False

    def _build_system_prompt(
        self,
        colors: Dict[str, str],
        typography: Dict[str, str],
        design_philosophy: str = '',
        logo_url: Optional[str] = None
    ) -> str:
        """Build a minimal system prompt for CustomComponent generation."""

        design_guidance = design_philosophy or "Create a clear, on-brand visual for the slide content."

        accent = colors.get('accent_1', '#6366f1')
        secondary = colors.get('accent_2', '#8b5cf6')
        text_color = colors.get('primary_text', '#ffffff')
        bg_color = colors.get('primary_background', '#0a0e27')
        hero_font, body_font = _extract_fonts_from_typography(typography)

        logo_info = ""
        if logo_url:
            logo_info = f" Logo available at props.logoUrl."

        lines = [
            f"You generate a CustomComponent as a full HTML document. {design_guidance}",
            "Interactivity: use simple interactions (click/hover/reveal/animated counters) when it clarifies the story.",
            f"Theme colors: accent {accent}, secondary {secondary}, text {text_color}, background {bg_color}.",
            f"Fonts: {hero_font} / {body_font}.{logo_info}",
            (
                "Rules: Output a complete HTML document starting with <!DOCTYPE html>. "
                "Use inline CSS. No external libraries or assets. "
                "If you use images, use <img src=\"placeholder\" alt=\"descriptive query\">."
            ),
        ]
        return "\n".join(lines)

    def _format_extracted_data_for_prompt(self, extracted_data: Dict[str, Any]) -> str:
        """Format extractedData payload for prompt readability."""
        if not isinstance(extracted_data, dict):
            return ""

        data = extracted_data.get("data") or []
        data_preview = data
        truncated = False
        if isinstance(data, list) and len(data) > 12:
            data_preview = data[:12]
            truncated = True

        payload = {
            "chartType": extracted_data.get("chartType") or extracted_data.get("chart_type"),
            "title": extracted_data.get("title"),
            "data": data_preview,
        }
        metadata = extracted_data.get("metadata")
        if metadata:
            payload["metadata"] = metadata

        import json
        text = json.dumps(payload, ensure_ascii=True, indent=2)
        if truncated:
            text += "\n... data truncated after 12 points"
        return text

    def _format_manual_charts_for_prompt(self, manual_charts: List[Any]) -> str:
        """Format manualCharts payload for prompt readability."""
        if not isinstance(manual_charts, list):
            return ""

        import json
        blocks = []
        for idx, chart in enumerate(manual_charts[:3]):
            chart_dict = chart.model_dump() if hasattr(chart, "model_dump") else chart
            if not isinstance(chart_dict, dict):
                continue
            data = chart_dict.get("data") or []
            data_preview = data
            truncated = False
            if isinstance(data, list) and len(data) > 12:
                data_preview = data[:12]
                truncated = True
            payload = {
                "id": chart_dict.get("id"),
                "chartType": chart_dict.get("chartType"),
                "title": chart_dict.get("title"),
                "data": data_preview,
            }
            text = json.dumps(payload, ensure_ascii=True, indent=2)
            if truncated:
                text += "\n... data truncated after 12 points"
            blocks.append(f"Chart {idx + 1}:\n{text}")
        return "\n\n".join(blocks)

    def _build_user_prompt(
        self,
        content: str,
        slide_context: Dict[str, Any],
        width: int,
        height: int,
        component_purpose: str = "visualize",
        external_media: Optional[Dict[str, Any]] = None,
        uploaded_media: Optional[list] = None,
        prefetched_images: Optional[Dict[str, str]] = None,
        reference_images: Optional[List[str]] = None,
        logo_url: Optional[str] = None,
        available_videos: Optional[List[Dict[str, Any]]] = None,
    ) -> str:
        """Build a minimal user prompt with relevant context."""

        slide_title = slide_context.get("title", "Slide")
        slide_index = slide_context.get("slide_index", 0) + 1
        total_slides = slide_context.get("total_slides", 1)
        is_full_slide = slide_context.get("is_full_slide", False)

        sections: List[str] = [
            f'SLIDE: \"{slide_title}\" (Slide {slide_index} of {total_slides})',
            f"SIZE: {width}x{height}px",
        ]
        if component_purpose:
            sections.append(f"PURPOSE: {component_purpose}")

        if is_full_slide:
            sections.append("FULL SLIDE: You control the entire canvas.")

        presentation_context = slide_context.get("presentation_context")
        vibe_context = slide_context.get("vibe_context") or slide_context.get("initial_idea")
        deck_title = slide_context.get("deck_title")
        context_parts = [p for p in [presentation_context, vibe_context, deck_title] if p]
        if context_parts:
            sections.append("CONTEXT: " + " | ".join(context_parts))

        extracted_data = slide_context.get("extracted_data") or slide_context.get("extractedData")
        manual_charts = slide_context.get("manual_charts") or slide_context.get("manualCharts")
        if manual_charts:
            formatted_manual = self._format_manual_charts_for_prompt(manual_charts)
            if formatted_manual:
                sections.append("MANUAL DATA:")
                sections.append(formatted_manual)
        if extracted_data:
            formatted_extracted = self._format_extracted_data_for_prompt(extracted_data)
            if formatted_extracted:
                sections.append("EXTRACTED DATA:")
                sections.append(formatted_extracted)
        if manual_charts or extracted_data:
            sections.append("DATA USE: Use any subset (none/some/all) if useful.")

        if reference_images:
            refs = "\n".join(f"- {url}" for url in reference_images[:5])
            sections.append("REFERENCE IMAGES (style only):")
            sections.append(refs)

        if external_media:
            media_list = []
            gifs = external_media.get("gifs") or []
            images = external_media.get("images") or []
            if gifs:
                media_list.append("GIFs: " + ", ".join(gifs[:5]))
            if images:
                media_list.append("Images: " + ", ".join(images[:5]))
            if media_list:
                sections.append("EXTERNAL MEDIA:")
                sections.append("\n".join(media_list))

        if uploaded_media:
            filenames = [
                m.get("filename") or m.get("name")
                for m in uploaded_media
                if isinstance(m, dict)
            ]
            filenames = [n for n in filenames if n]
            if filenames:
                sections.append("USER UPLOADS:")
                sections.append("- " + ", ".join(filenames[:8]))

        if prefetched_images:
            image_props = {
                k: v
                for k, v in prefetched_images.items()
                if not k.endswith("_query")
            }
            if image_props:
                entries = [f"{k}: {v}" for k, v in sorted(image_props.items())]
                sections.append("AVAILABLE IMAGES:")
                sections.append("\n".join(entries[:6]))

        if available_videos:
            entries = []
            for video in available_videos[:5]:
                title = video.get("title") or video.get("url") or "video"
                entries.append(str(title))
            if entries:
                sections.append("AVAILABLE VIDEOS:")
                sections.append("- " + ", ".join(entries))

        if logo_url:
            sections.append(f"LOGO URL: {logo_url}")

        if content:
            sections.append("CONTENT:")
            sections.append(content)

        sections.append("OUTPUT: Complete HTML starting with <!DOCTYPE html>.")
        return "\n".join(sections)
