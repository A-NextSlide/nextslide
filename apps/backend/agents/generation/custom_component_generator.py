"""
Dedicated CustomComponent generator using Gemini 3 Pro for creative HTML/CSS/JS generation.

This module generates visually stunning CustomComponents for slides using:
- Gemini 3 Pro's creative capabilities (optional Claude Opus 4.5 fallback)
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
    CUSTOM_COMPONENT_ALLOW_FALLBACK,
    CUSTOM_COMPONENT_FALLBACK_MODEL,
    CUSTOM_COMPONENT_RESPECT_GLOBAL_GEMINI_COOLDOWN,
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
from agents.generation.custom_component_prompts import (
    build_system_prompt,
    build_user_prompt,
)
from agents.generation.custom_component_html import CustomComponentHtmlProcessor

logger = get_logger(__name__)

from agents.config import MAX_API_CONCURRENT_CALLS

_AI_SEMAPHORE = asyncio.Semaphore(MAX_API_CONCURRENT_CALLS)


class CustomComponentGenerator:
    """
    Generates creative CustomComponents using Gemini 3 Pro (with optional Opus 4.5 fallback).

    This generator creates visually impressive HTML/CSS/JS components that:
    - Match the presentation theme
    - Visualize content in engaging ways
    - Use modern web design patterns
    - Include animations and interactivity

    Optionally falls back to Claude Opus 4.5 if Gemini rate limits are hit.
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

            slide_mode = slide_context.get("slide_mode") or "interactive"
            system_prompt = build_system_prompt(
                colors,
                typography,
                design_philosophy,
                logo_url,
                slide_mode=slide_mode,
            )
            user_prompt = build_user_prompt(
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

            component_position = position or {"x": 0, "y": 0}
            component = {
                "id": f"custom-{datetime.now().strftime('%H%M%S%f')}",
                "type": "CustomComponent",
                "props": {
                    "render": html_content,
                    "position": component_position,
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
                "position": component_position,
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
        allow_fallback = bool(CUSTOM_COMPONENT_ALLOW_FALLBACK and CUSTOM_COMPONENT_FALLBACK_MODEL)

        client, model_name = get_client(self.model)
        active_client, active_model = client, model_name

        if CUSTOM_COMPONENT_RESPECT_GLOBAL_GEMINI_COOLDOWN and is_provider_in_cooldown(GEMINI_PROVIDER):
            if allow_fallback:
                logger.info(
                    "[CUSTOM_COMPONENT] Gemini in cooldown, using fallback: %s",
                    CUSTOM_COMPONENT_FALLBACK_MODEL,
                )
                active_client, active_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                used_fallback = True
            else:
                logger.debug("[CUSTOM_COMPONENT] Gemini cooldown detected but fallback disabled")

        try:
            response = await self._invoke_model(loop, active_client, active_model, messages)
        except AIRateLimitError:
            if not used_fallback:
                mark_provider_rate_limited(GEMINI_PROVIDER)
                if allow_fallback:
                    fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                    response = await self._invoke_model(loop, fallback_client, fallback_model, messages)
                    used_fallback = True
                else:
                    raise
            else:
                raise
        except Exception as exc:
            if self._should_fallback_from_error(exc) and not used_fallback and allow_fallback:
                fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
                response = await self._invoke_model(loop, fallback_client, fallback_model, messages)
                used_fallback = True
            else:
                raise

        if self._is_empty_response(response) and not used_fallback and allow_fallback:
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

    # Prompt construction now lives in custom_component_prompts.py
