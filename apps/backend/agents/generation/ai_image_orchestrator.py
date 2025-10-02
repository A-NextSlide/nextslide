"""
AI Image Orchestrator
---------------------
Generates and applies AI images for slides asynchronously without blocking slide generation.

Flow:
- Subscribe to slide.generated events
- For each slide, find up to 0–3 placeholder Image components
- Build prompts using ImageGenerationPromptBuilder
- Generate images via configured provider (Gemini/OpenAI)
- For supporting assets, enforce flat chroma color background, then chroma-key to transparency
- Upload to storage and update the slide via persistence
"""

from __future__ import annotations

import asyncio
import base64
from typing import Dict, Any, List, Optional
from io import BytesIO
from PIL import Image
import uuid

from agents.application.event_bus import get_event_bus, Events
from agents.config import IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_FULL, IMAGE_GENERATION_ENABLED
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from services.image_storage_service import ImageStorageService
from agents.generation.image_prompt_builder import ImageGenerationPromptBuilder
from agents.persistence.deck_persistence import DeckPersistence
from utils.chroma import chroma_key
from setup_logging_optimized import get_logger


logger = get_logger(__name__)


class AIImageOrchestrator:
    """Background image generator and applier."""

    def __init__(self, deck_persistence: Optional[DeckPersistence] = None) -> None:
        self.event_bus = get_event_bus()
        self.provider = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        self.storage = ImageStorageService()
        self.persistence = deck_persistence or DeckPersistence()
        self._tasks: List[asyncio.Task] = []
        self._started: bool = False

    def start(self) -> None:
        # Subscribe once to slide.generated events (only if enabled)
        if self._started:
            return
        if IMAGE_GENERATION_ENABLED:
            self.event_bus.subscribe(Events.SLIDE_GENERATED, self._on_slide_generated)
        self._started = True
        logger.info("[AIImageOrchestrator] %s (provider=%s, available=%s)",
                    ("Subscribed" if IMAGE_GENERATION_ENABLED else "Disabled"),
                    IMAGE_PROVIDER, getattr(self.provider, 'is_available', False))

    def stop(self) -> None:
        try:
            self.event_bus.unsubscribe(Events.SLIDE_GENERATED, self._on_slide_generated)
        except Exception:
            pass

    def _get_slide_context_texts(self, slide_data: Dict[str, Any]) -> str:
        title = slide_data.get('title') or ''
        # Optionally collect some text content from text components
        texts = []
        for c in slide_data.get('components', []) or []:
            if c.get('type') in ('Title', 'TextBlock', 'TiptapTextBlock'):
                props = c.get('props', {}) or {}
                if isinstance(props.get('text'), str):
                    texts.append(props['text'])
                elif isinstance(props.get('texts'), list):
                    for seg in props['texts']:
                        t = seg.get('text') or seg.get('content')
                        if isinstance(t, str):
                            texts.append(t)
        content = ' '.join(texts)[:600]
        return title, content

    def _pick_theme_for_slide(self, slide_data: Dict[str, Any]) -> Dict[str, Any]:
        theme = {}
        try:
            if isinstance(slide_data.get('theme'), dict):
                theme = slide_data['theme']
        except Exception:
            pass
        return theme

    async def _on_slide_generated(self, data: Dict[str, Any]):
        try:
            slide_data = data.get('slide_data') or {}
            slide_index = data.get('slide_index', 0)
            deck_uuid = (slide_data.get('deck_uuid') or '') or data.get('deck_uuid')
            # If not present on slide_data, we cannot persist; skip quietly
            if not deck_uuid:
                logger.debug("[AIImageOrchestrator] No deck_uuid on slide; skipping")
                return

            # Provider guard
            if not getattr(self.provider, 'is_available', False):
                logger.warning("[AIImageOrchestrator] Provider '%s' unavailable; set API key or switch provider.", IMAGE_PROVIDER)
                return

            # Fire-and-forget task to handle this slide
            task = asyncio.create_task(self._process_slide(deck_uuid, slide_index, slide_data))
            self._tasks.append(task)
        except Exception:
            logger.debug("[AIImageOrchestrator] Failed to enqueue slide processing", exc_info=True)

    async def _process_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any]) -> None:
        try:
            # Limit to 0–3 images per slide
            title, content = self._get_slide_context_texts(slide_data)
            theme = self._pick_theme_for_slide(slide_data)

            # Identify placeholder images
            components = slide_data.get('components', []) or []
            placeholder_indices = [i for i, c in enumerate(components)
                                   if c.get('type') == 'Image' and (c.get('props', {}) or {}).get('src') in ('', 'placeholder')]
            if not placeholder_indices:
                # Create a temporary full-bleed hero placeholder plan
                logger.info("[AIImageOrchestrator] Slide %s: no placeholders; creating hero image plan", slide_index + 1)
                temp_slide = dict(slide_data)
                temp_components = list(components)
                temp_components.append({
                    'id': str(uuid.uuid4()),
                    'type': 'Image',
                    'props': {
                        'src': 'placeholder',
                        'position': {'x': 0, 'y': 0},
                        'width': 1920,
                        'height': 1080,
                        'objectFit': 'cover',
                        'opacity': 1,
                        'rotation': 0,
                        'zIndex': 1,
                        'alt': title or 'Hero image'
                    }
                })
                temp_slide['components'] = temp_components
                builder = ImageGenerationPromptBuilder(theme)
                plans = builder.build_for_slide(temp_slide, title, content, max_images=1)
                # After generation succeeds we will append the new component with the generated URL
                generate_into_new_component = True
                new_component_index = len(components)  # index where we'll append
            else:
                builder = ImageGenerationPromptBuilder(theme)
                plans = builder.build_for_slide(slide_data, title, content, max_images=3)
                generate_into_new_component = False
                new_component_index = -1
            if not plans:
                logger.info("[AIImageOrchestrator] Slide %s: plan produced 0 images", slide_index + 1)
                return

            # Prefer functional modes based on slide intent (non-decorative)
            def _is_infoy(text: str) -> bool:
                t = (text or '').lower()
                return any(k in t for k in [
                    'diagram','process','flow','timeline','structure','components','how it works','factors','rate','steps','architecture','overview'
                ])

            builder_for_modes = ImageGenerationPromptBuilder(theme)
            infoy = _is_infoy(title) or _is_infoy(content)
            if infoy:
                info_plans = builder_for_modes.build_infographic_for_slide(slide_data, title, "", max_images=1)
                if info_plans:
                    plans = info_plans
            else:
                # Team slide detection
                if builder_for_modes._is_team_slide(title, content):
                    team_plans = builder_for_modes.build_team_for_slide(slide_data, title, "", max_images=3)
                    if team_plans:
                        plans = team_plans
                else:
                    # Large design element (non-decorative) for hero areas
                    hero_plans = builder_for_modes.build_hero_design_element_for_slide(slide_data, title, "", max_images=1)
                    if hero_plans:
                        plans = hero_plans

            # Generate images concurrently (but with small fan-out)
            gen_tasks: List[asyncio.Task] = []
            for plan in plans:
                logger.info("[AIImageOrchestrator] Gen plan: comp=%s size=%s needs_trans=%s", plan['component_index'], plan['size'], plan['needs_transparency'])
                gen_tasks.append(asyncio.create_task(self._generate_one(plan)))

            results = await asyncio.gather(*gen_tasks, return_exceptions=True)

            # Apply results to slide_data (fill src only; no repositioning or new components)
            updated = False
            for plan, res in zip(plans, results):
                if isinstance(res, dict) and 'url' in res and res['url']:
                    # Respect the original plan target; do not create or move components
                    idx = plan['component_index']
                    if idx < 0 or idx >= len(components):
                        logger.info("[AIImageOrchestrator] Invalid component index %s; skipping apply", idx)
                        continue
                    try:
                        components[idx]['props']['src'] = res['url']
                        components[idx]['props']['alt'] = components[idx]['props'].get('alt') or title or 'Generated image'
                        meta = components[idx]['props'].setdefault('metadata', {})
                        meta['ai_generated'] = True
                        meta['model_used'] = res.get('model_used')
                        meta['prompt_used'] = plan.get('prompt')[:400]
                        updated = True
                        logger.info("[AIImageOrchestrator] Slide %s: applied AI image to component %s", slide_index + 1, idx)
                    except Exception:
                        pass

            if updated:
                slide_data['components'] = components
                # Persist slide update without throttling (force immediate)
                await self.persistence.update_slide(deck_uuid, slide_index, slide_data, force_immediate=True)
                # Emit event for observability
                try:
                    await self.event_bus.emit(Events.IMAGES_APPLIED, {
                        'deck_uuid': deck_uuid,
                        'slide_index': slide_index,
                        'count': len([r for r in results if isinstance(r, dict) and r.get('url')])
                    })
                except Exception:
                    pass
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.debug("[AIImageOrchestrator] Error processing slide", exc_info=True)

    async def _generate_one(self, plan: Dict[str, Any]) -> Dict[str, Any]:
        prompt: str = plan['prompt']
        size: str = plan['size']
        needs_transparency: bool = bool(plan.get('needs_transparency'))
        # Provider transparent flag only for full images when supported; for chroma-key path we force flat bg in prompt
        transparent = (IMAGE_TRANSPARENT_DEFAULT_FULL and not needs_transparency)

        try:
            logger.info("[AIImageOrchestrator] Generating image: size=%s transparent=%s", size, transparent)
            try:
                result = await asyncio.wait_for(
                    self.provider.generate_image(
                        prompt=prompt,
                        size=size,
                        transparent_background=transparent,
                        n=1
                    ),
                    timeout=60.0
                )
            except asyncio.TimeoutError:
                logger.warning("[AIImageOrchestrator] Provider generation timed out")
                return {}

            if not result:
                logger.warning("[AIImageOrchestrator] Provider returned empty result")
                return {}

            if 'error' in result:
                logger.warning("[AIImageOrchestrator] Provider error: %s", str(result.get('error'))[:200])
                return {}

            if ('b64_json' not in result and 'url' not in result):
                logger.warning("[AIImageOrchestrator] Provider returned no image fields")
                return {}

            # If provider returned URL directly, try to proxy/upload to storage for CORS safety
            if result.get('url'):
                # Upload remote URL through storage to unify handling
                uploaded = await self.storage.upload_image_from_url(result['url'])
                if isinstance(uploaded, dict) and uploaded.get('url'):
                    out = {
                        'url': uploaded['url'],
                        'model_used': result.get('model_used')
                    }
                    return out
                # Fallback to using the provider URL directly if storage upload failed
                try:
                    url_str = str(result.get('url'))
                    if url_str:
                        logger.warning("[AIImageOrchestrator] Using provider URL directly (storage upload failed)")
                        return {
                            'url': url_str,
                            'model_used': result.get('model_used')
                        }
                except Exception:
                    pass
                return {}

            b64 = result.get('b64_json')
            if not b64:
                return {}

            if needs_transparency and plan.get('background_color'):
                # Apply chroma key locally before upload
                try:
                    raw = base64.b64decode(b64)
                    img = Image.open(BytesIO(raw))
                    keyed = chroma_key(img, str(plan['background_color']))
                    buf = BytesIO()
                    keyed.save(buf, format='PNG')
                    buf.seek(0)
                    b64 = base64.b64encode(buf.read()).decode('utf-8')
                except Exception:
                    # Fallback: keep original
                    pass

            upload = await self.storage.upload_image_from_base64(
                base64_data=b64,
                filename="ai-image.png",
                content_type="image/png"
            )
            if isinstance(upload, dict) and upload.get('url'):
                return {
                    'url': upload['url'],
                    'model_used': result.get('model_used')
                }
            # Fallback to data URL if storage upload failed
            try:
                data_url = f"data:image/png;base64,{b64}"
                logger.warning("[AIImageOrchestrator] Using data URL fallback (storage upload failed)")
                return {
                    'url': data_url,
                    'model_used': result.get('model_used')
                }
            except Exception:
                pass
            return {}
        except Exception:
            logger.debug("[AIImageOrchestrator] Generation failed", exc_info=True)
            return {}

    def _is_safe_placement(self, image_index: int, components: List[Dict[str, Any]]) -> bool:
        try:
            def rect(c):
                p = (c.get('props') or {})
                pos = p.get('position') or {}
                x = int(pos.get('x', 0) or 0)
                y = int(pos.get('y', 0) or 0)
                w = int(p.get('width', 0) or 0)
                h = int(p.get('height', 0) or 0)
                return (x, y, x + w, y + h)
            def intersect(a, b):
                return not (a[2] <= b[0] or a[0] >= b[2] or a[3] <= b[1] or a[1] >= b[3])

            img = components[image_index]
            if img.get('type') != 'Image':
                return True
            r_img = rect(img)
            text_types = {"TiptapTextBlock", "TextBlock", "Title", "Chart", "Table", "CustomComponent"}
            for i, c in enumerate(components):
                if i == image_index:
                    continue
                if c.get('type') in text_types:
                    if intersect(r_img, rect(c)):
                        return False
            return True
        except Exception:
            return True

    def _find_alternate_image_index(self, current_index: int, components: List[Dict[str, Any]]) -> Optional[int]:
        try:
            for i, c in enumerate(components):
                if i == current_index:
                    continue
                if c.get('type') != 'Image':
                    continue
                src = ((c.get('props') or {}).get('src') or '').strip().lower()
                if src not in ('', 'placeholder'):
                    continue
                return i
        except Exception:
            pass
        return None

    def _try_nudge_image_box(self, image_index: int, components: List[Dict[str, Any]]) -> bool:
        """Attempt to reposition or slightly shrink the image box to avoid overlap.
        Returns True if box was adjusted to a safe placement.
        """
        try:
            img = components[image_index]
            if img.get('type') != 'Image':
                return False
            props = img.setdefault('props', {})
            pos = props.setdefault('position', {})
            x = int(pos.get('x', 0) or 0)
            y = int(pos.get('y', 0) or 0)
            w = int(props.get('width', 0) or 0)
            h = int(props.get('height', 0) or 0)
            # Candidate positions (left/center/right with margins)
            candidates = [
                (80, y),
                (1920 - w - 80, y),
                (160, y),
                (1920 - w - 160, y),
                (960 - max(0, w // 2), y)
            ]
            for nx, ny in candidates:
                pos['x'] = max(0, min(1920 - max(1, w), nx))
                pos['y'] = max(0, min(1080 - max(1, h), ny))
                if self._is_safe_placement(image_index, components):
                    return True
            # Try shrinking a bit and test again
            for _ in range(2):
                w = int(w * 0.9)
                h = int(h * 0.9)
                props['width'] = max(80, w)
                props['height'] = max(80, h)
                for nx, ny in candidates:
                    pos['x'] = max(0, min(1920 - max(1, w), nx))
                    pos['y'] = max(0, min(1080 - max(1, h), ny))
                    if self._is_safe_placement(image_index, components):
                        return True
            return False
        except Exception:
            return False


