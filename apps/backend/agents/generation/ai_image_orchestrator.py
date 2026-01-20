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
import re
from typing import Dict, Any, List, Optional, Tuple
from io import BytesIO
from PIL import Image
import uuid

from agents.application.event_bus import get_event_bus, Events
from agents.config import IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_FULL, IMAGE_GENERATION_ENABLED
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from services.image_storage_service import ImageStorageService
from services.serpapi_service import SerpAPIService
from agents.generation.image_prompt_builder import ImageGenerationPromptBuilder
from agents.persistence.deck_persistence import DeckPersistence
from utils.chroma import chroma_key
from setup_logging_optimized import get_logger


logger = get_logger(__name__)

# Check if logo.dev is available
_LOGODEV_AVAILABLE = False
try:
    from agents.tools.theme.logodev_service import LogoDevService
    _LOGODEV_AVAILABLE = True
except ImportError:
    pass


class AIImageOrchestrator:
    """Background image generator and applier."""

    def __init__(self, deck_persistence: Optional[DeckPersistence] = None) -> None:
        self.event_bus = get_event_bus()
        self.provider = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        self.storage = ImageStorageService()
        self.persistence = deck_persistence or DeckPersistence()
        self._tasks: List[asyncio.Task] = []
        self._started: bool = False
        # Initialize SerpAPI for searching real photos for CustomComponent images
        try:
            self.serpapi = SerpAPIService()
            self._serpapi_available = self.serpapi.is_available
            if self._serpapi_available:
                logger.info("[AIImageOrchestrator] SerpAPI available for CustomComponent images")
            else:
                logger.warning("[AIImageOrchestrator] SerpAPI not available (no API key)")
        except Exception as e:
            logger.warning("[AIImageOrchestrator] SerpAPIService unavailable: %s", e)
            self.serpapi = None
            self._serpapi_available = False

    def start(self) -> None:
        # Subscribe once to slide.generated events
        # ALWAYS subscribe - even if AI image generation is disabled, we still want to
        # search for real photos for CustomComponent images using SerpAPI
        if self._started:
            return

        # Always subscribe to handle CustomComponent images via SerpAPI
        self.event_bus.subscribe(Events.SLIDE_GENERATED, self._on_slide_generated)
        self._started = True

        logger.info("[AIImageOrchestrator] Started (AI gen=%s, provider=%s, SerpAPI=%s)",
                    IMAGE_GENERATION_ENABLED,
                    IMAGE_PROVIDER,
                    self._serpapi_available)

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

            logger.info("[AIImageOrchestrator] Processing slide %s for deck %s", slide_index + 1, deck_uuid[:8])

            # Fire-and-forget task to handle this slide
            task = asyncio.create_task(self._process_slide(deck_uuid, slide_index, slide_data))
            self._tasks.append(task)
        except Exception:
            logger.debug("[AIImageOrchestrator] Failed to enqueue slide processing", exc_info=True)

    async def _process_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any]) -> None:
        try:
            logger.info("[AIImageOrchestrator] _process_slide started for slide %s", slide_index + 1)

            # FIRST: Process CustomComponent images in parallel (doesn't block AI image generation)
            # This searches for real photos using SerpAPI and applies them to placeholder images
            # This runs ALWAYS, even if AI image generation is disabled
            custom_comp_task = asyncio.create_task(
                self._search_and_apply_custom_component_images(deck_uuid, slide_index, slide_data)
            )

            # Check if AI image generation is enabled
            ai_gen_enabled = IMAGE_GENERATION_ENABLED and getattr(self.provider, 'is_available', False)
            if not ai_gen_enabled:
                logger.info("[AIImageOrchestrator] AI image generation disabled, only processing CustomComponent images")
                # Wait for CustomComponent processing to complete
                try:
                    custom_comp_updated = await custom_comp_task
                    if custom_comp_updated:
                        logger.info("[AIImageOrchestrator] Slide %s: CustomComponent images applied, persisting", slide_index + 1)
                        await self.persistence.update_slide(deck_uuid, slide_index, slide_data, force_immediate=True)
                except Exception as e:
                    logger.warning("[AIImageOrchestrator] CustomComponent image processing error: %s", e)
                return

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
                        components[idx]['props']['autoApplied'] = True  # Mark as auto-applied to prevent frontend replacement
                        meta = components[idx]['props'].setdefault('metadata', {})
                        meta['ai_generated'] = True
                        meta['model_used'] = res.get('model_used')
                        meta['prompt_used'] = plan.get('prompt')[:400]

                        # Extract searchQuery from component or use title/alt as fallback
                        component_search_query = components[idx]['props'].get('searchQuery', '').strip()
                        if not component_search_query:
                            component_search_query = components[idx]['props'].get('alt', '').strip()
                        search_query = component_search_query or title or 'Generated image'

                        meta['searchQuery'] = search_query
                        meta['topic'] = title or search_query

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

            # Wait for CustomComponent image processing to complete
            try:
                custom_comp_updated = await custom_comp_task
                if custom_comp_updated:
                    # CustomComponent images were updated - persist the slide again
                    logger.info("[AIImageOrchestrator] Slide %s: CustomComponent images applied, persisting", slide_index + 1)
                    await self.persistence.update_slide(deck_uuid, slide_index, slide_data, force_immediate=True)
                    try:
                        await self.event_bus.emit(Events.IMAGES_APPLIED, {
                            'deck_uuid': deck_uuid,
                            'slide_index': slide_index,
                            'source': 'custom_component'
                        })
                    except Exception:
                        pass
            except Exception as e:
                logger.debug("[AIImageOrchestrator] CustomComponent image processing error: %s", e)

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

    # ==================== CUSTOM COMPONENT IMAGE PROCESSING ====================

    def _extract_search_query_from_prop_name(self, prop_name: str) -> str:
        """Convert a prop name like 'elonMuskImage' to a search query 'elon musk'."""
        query = re.sub(
            r'(Image|Photo|Picture|Src|Url|Img|Thumbnail|Avatar|Icon|Logo|Banner)$',
            '',
            prop_name,
            flags=re.IGNORECASE,
        )
        query = re.sub(r'([a-z])([A-Z])', r'\1 \2', query)
        query = re.sub(r'([A-Z]+)([A-Z][a-z])', r'\1 \2', query)
        return query.strip().lower()

    def _extract_placeholder_images_from_html(self, html: str) -> List[Dict[str, str]]:
        """Extract placeholder images from CustomComponent HTML/JS and generate search queries."""
        placeholders = []

        # Pattern 1: Extract image prop names from JS (e.g., const img = props.elonMuskImage || 'placeholder')
        prop_pattern = re.compile(
            r'(?:const|let|var)\s+(\w+)\s*=\s*props\??\.(\w*[Ii]mage\w*|\w*[Pp]hoto\w*|\w*[Ll]ogo\w*|\w*[Ii]con\w*|\w*[Aa]vatar\w*|\w*[Bb]anner\w*|\w*[Hh]eadshot\w*)\s*(?:\|\||&&|\?\?)',
            re.IGNORECASE
        )
        prop_names_found = {}
        for match in prop_pattern.finditer(html):
            prop_name = match.group(2)
            search_query = self._extract_search_query_from_prop_name(prop_name)
            if search_query:
                prop_names_found[prop_name] = search_query
                logger.info("[AIImageOrchestrator] Found image prop from JS: %s -> '%s'", prop_name, search_query)

        # Pattern 2: Extract from img tags with placeholder or empty src
        img_pattern = re.compile(r'<img[^>]*>', re.IGNORECASE)
        for match in img_pattern.finditer(html):
            img_tag = match.group(0)

            # Extract src attribute
            src_match = re.search(r'src=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
            src = src_match.group(1) if src_match else ''

            # Check if it's a placeholder (not a real URL)
            is_placeholder = (
                not src or
                src == 'placeholder' or
                'placeholder' in src.lower() or
                '${' in src or  # Template variable like ${imageName}
                (not src.startswith('http') and not src.startswith('data:') and not src.startswith('blob:'))
            )

            if not is_placeholder:
                continue

            # Extract alt attribute
            alt_match = re.search(r'alt=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
            alt = alt_match.group(1) if alt_match else ''

            # Try to match to a prop name from src
            search_query = ''
            matched_prop = ''

            # Check if src references a variable (e.g., src="${googleCampusImage}")
            # CRITICAL: Extract the variable name and convert it to a search query
            var_match = re.search(r'\$\{+\s*(\w+)\s*\}+', src)
            if var_match:
                var_name = var_match.group(1)
                logger.info("[AIImageOrchestrator] Found template variable in src: ${%s}", var_name)

                # FIRST: Try to extract search query directly from the variable name
                # e.g., googleCampusImage -> "google campus"
                direct_query = self._extract_search_query_from_prop_name(var_name)
                if direct_query:
                    search_query = direct_query
                    matched_prop = var_name
                    logger.info("[AIImageOrchestrator] Extracted query from var name: %s -> '%s'", var_name, search_query)
                else:
                    # Try to find matching prop from JS declarations
                    for prop_name, query in prop_names_found.items():
                        if prop_name.lower() == var_name.lower() or var_name.lower() in prop_name.lower():
                            search_query = query
                            matched_prop = prop_name
                            break

            # Fallback to alt text if we still don't have a search query
            if not search_query and alt:
                search_query = alt.strip()
                if search_query:
                    logger.info("[AIImageOrchestrator] Using alt text as search query: '%s'", search_query)

            # If still no search query, try to use any unused prop
            if not search_query and prop_names_found:
                used_props = {p['prop_name'] for p in placeholders if p.get('prop_name')}
                for prop_name, query in prop_names_found.items():
                    if prop_name not in used_props:
                        search_query = query
                        matched_prop = prop_name
                        break

            if search_query:
                placeholders.append({
                    'alt': alt or search_query,
                    'search_query': search_query,
                    'prop_name': matched_prop,
                    'original_src': src
                })
                logger.info("[AIImageOrchestrator] Added placeholder: alt='%s' query='%s' prop='%s' src='%s'",
                           alt, search_query, matched_prop, src[:50] if src else '')
            else:
                logger.warning("[AIImageOrchestrator] Could not extract search query for img: alt='%s' src='%s'", alt, src[:50] if src else '')

        logger.info("[AIImageOrchestrator] Total placeholders found: %d", len(placeholders))
        return placeholders

    # Domains that are known to block hotlinking or have CORS issues
    BLOCKED_IMAGE_DOMAINS = {
        'instagram.com', 'lookaside.instagram.com', 'cdninstagram.com',
        'facebook.com', 'fbcdn.net',
        'twitter.com', 'twimg.com', 'x.com',
        'pinterest.com', 'pinimg.com',
        'tiktok.com',
        'linkedin.com',
        'reddit.com', 'redd.it',
    }

    def _is_blocked_domain(self, url: str) -> bool:
        """Check if URL is from a domain that blocks hotlinking."""
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            domain = parsed.netloc.lower()
            for blocked in self.BLOCKED_IMAGE_DOMAINS:
                if blocked in domain:
                    return True
            return False
        except Exception:
            return False

    async def _search_and_apply_custom_component_images(
        self,
        deck_uuid: str,
        slide_index: int,
        slide_data: Dict[str, Any]
    ) -> bool:
        """Search for images and apply them to CustomComponent placeholders."""
        logger.info("[AIImageOrchestrator] _search_and_apply_custom_component_images called for slide %s", slide_index + 1)

        if not self._serpapi_available or not self.serpapi:
            logger.warning("[AIImageOrchestrator] SerpAPI unavailable (available=%s), skipping CustomComponent images", self._serpapi_available)
            return False

        components = slide_data.get('components', []) or []
        custom_component_count = sum(1 for c in components if c.get('type') == 'CustomComponent')
        logger.info("[AIImageOrchestrator] Found %d components, %d are CustomComponent", len(components), custom_component_count)

        updated = False

        for comp_idx, component in enumerate(components):
            if component.get('type') != 'CustomComponent':
                continue

            props = component.get('props', {}) or {}
            render_html = props.get('render', '')
            if not render_html:
                continue

            # FIRST: Replace blocked external URLs (Instagram, Facebook, etc.)
            blocked_replaced = await self._replace_blocked_external_urls(render_html, component)
            if blocked_replaced:
                render_html = component['props']['render']  # Get updated HTML
                updated = True

            if not render_html:
                continue

            # Extract placeholder images from the HTML
            placeholders = self._extract_placeholder_images_from_html(render_html)
            if not placeholders:
                continue

            logger.info("[AIImageOrchestrator] Processing %d placeholder images in CustomComponent", len(placeholders))

            # Search for images concurrently
            search_tasks = []
            for placeholder in placeholders:
                search_tasks.append(
                    asyncio.create_task(
                        self._search_single_image(placeholder['search_query'])
                    )
                )

            search_results = await asyncio.gather(*search_tasks, return_exceptions=True)

            # Apply results to HTML
            current_html = render_html
            component_props = props.get('props', {}) or {}

            for placeholder, result in zip(placeholders, search_results):
                if isinstance(result, Exception) or not result:
                    logger.warning("[AIImageOrchestrator] Search failed for '%s'", placeholder['search_query'])
                    continue

                image_url = result.get('url')
                if not image_url:
                    continue

                logger.info("[AIImageOrchestrator] Found image for '%s': %s", placeholder['search_query'], image_url[:60])

                # Update the prop if we have a prop name
                if placeholder.get('prop_name'):
                    component_props[placeholder['prop_name']] = image_url
                    updated = True

                # Also update the HTML directly - replace placeholder src with actual URL
                original_src = placeholder.get('original_src', '')
                if original_src:
                    # Escape special regex characters in the original src
                    escaped_src = re.escape(original_src)
                    pattern = rf'(src=)(["\']?){escaped_src}\2'

                    def replace_src(match):
                        quote = match.group(2) or '"'
                        return f'src={quote}{image_url}{quote}'

                    current_html, replace_count = re.subn(
                        pattern,
                        replace_src,
                        current_html,
                        flags=re.IGNORECASE,
                    )
                    if replace_count:
                        logger.info("[AIImageOrchestrator] HTML replacement SUCCESS: %s -> %s", original_src[:30], image_url[:60])
                        updated = True
                    else:
                        logger.warning("[AIImageOrchestrator] HTML replacement FAILED - pattern not found: %s", pattern[:80])

                # Also try to replace by alt text matching
                alt = placeholder.get('alt', '')
                if alt:
                    # Find img tags with matching alt and placeholder src
                    def replace_by_alt(match):
                        img_tag = match.group(0)
                        img_alt_match = re.search(r'alt=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
                        if img_alt_match and img_alt_match.group(1).lower() == alt.lower():
                            img_src_match = re.search(r'src=["\']([^"\']*)["\']', img_tag, re.IGNORECASE)
                            if img_src_match:
                                img_src = img_src_match.group(1)
                                # Check if src is a placeholder
                                if not img_src or 'placeholder' in img_src.lower() or img_src.startswith('${') or (not img_src.startswith('http') and not img_src.startswith('data:')):
                                    return re.sub(r'src=["\'][^"\']*["\']', f'src="{image_url}"', img_tag, flags=re.IGNORECASE)
                        return img_tag

                    current_html = re.sub(r'<img[^>]*>', replace_by_alt, current_html, flags=re.IGNORECASE)

            # Update the component
            if updated:
                component['props']['render'] = current_html
                component['props']['props'] = component_props
                logger.info("[AIImageOrchestrator] Updated CustomComponent with %d images", len([r for r in search_results if r and not isinstance(r, Exception)]))

        return updated

    def _is_company_logo_query(self, query: str) -> Tuple[bool, str]:
        """Detect if a query is for a company logo and extract the company name."""
        q = query.lower().strip()

        # Skip generic logo queries (these return random vistaprint images)
        generic_terms = {'logo', 'company logo', 'brand logo', 'business logo', 'corporate logo'}
        if q in generic_terms:
            return False, ""

        # Patterns like "Apple logo", "Google Logo"
        logo_suffix_match = re.match(r'^(.+?)\s+logo$', q, re.IGNORECASE)
        if logo_suffix_match:
            company = logo_suffix_match.group(1).strip()
            if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
                return True, company

        # Patterns like "logo of Stripe", "logo for Netflix"
        logo_prefix_match = re.match(r'^logo\s+(?:of|for)\s+(.+)$', q, re.IGNORECASE)
        if logo_prefix_match:
            company = logo_prefix_match.group(1).strip()
            if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
                return True, company

        return False, ""

    async def _fetch_logo_from_logodev(self, company_name: str) -> Optional[str]:
        """Fetch company logo from logo.dev and upload to our storage."""
        if not _LOGODEV_AVAILABLE:
            return None

        try:
            async with LogoDevService() as logo_service:
                result = await logo_service.get_logo_with_fallback(company_name)
                if result.get("available") and result.get("logo_url"):
                    logo_url = result["logo_url"]
                    logger.info("[AIImageOrchestrator] Found logo via logo.dev for '%s'", company_name)

                    # Upload to our storage for CORS safety
                    upload_result = await self.storage.upload_image_from_url(
                        logo_url,
                        metadata={"alt": f"{company_name} logo", "source": "logodev"}
                    )
                    if upload_result and upload_result.get("url"):
                        return upload_result["url"]
                    return logo_url  # Fallback to direct URL
        except Exception as e:
            logger.warning("[AIImageOrchestrator] Logo.dev lookup failed for '%s': %s", company_name, e)

        return None

    async def _search_single_image(self, query: str) -> Optional[Dict[str, Any]]:
        """Search for a single image using SerpAPI (Google Images) or logo.dev for company logos."""
        try:
            # Check if this is a company logo query - route to logo.dev
            is_logo, company_name = self._is_company_logo_query(query)
            if is_logo and company_name:
                logger.info("[AIImageOrchestrator] Routing company logo to logo.dev: '%s'", company_name)
                logo_url = await self._fetch_logo_from_logodev(company_name)
                if logo_url:
                    return {'url': logo_url, 'source': 'logo.dev'}
                # If logo.dev failed, don't fall back to SerpAPI for logos
                logger.warning("[AIImageOrchestrator] Logo.dev failed for '%s', skipping", company_name)
                return None
            elif 'logo' in query.lower():
                # Skip generic logo queries - they return random vistaprint images
                logger.info("[AIImageOrchestrator] Skipping generic logo query: '%s'", query)
                return None

            if not self.serpapi:
                return None

            result = await asyncio.wait_for(
                self.serpapi.search_images(query=query, per_page=3, orientation='landscape'),
                timeout=15.0
            )

            photos = result.get('photos', [])
            if photos:
                # Try each photo until we find one we can upload
                for photo in photos[:3]:
                    # Get the original URL from SerpAPI result
                    url = photo.get('url') or photo.get('src', {}).get('original') or photo.get('src', {}).get('large')
                    if not url:
                        continue

                    logger.info("[AIImageOrchestrator] Found image URL: %s", url[:80])

                    # Upload to our storage for CORS safety
                    try:
                        uploaded = await asyncio.wait_for(
                            self.storage.upload_image_from_url(url),
                            timeout=10.0
                        )
                        if isinstance(uploaded, dict) and uploaded.get('url'):
                            return {'url': uploaded['url'], 'source': photo.get('photographer', 'Google Images')}
                    except Exception as e:
                        logger.debug("[AIImageOrchestrator] Upload failed for %s: %s", url[:50], e)
                        continue

                # If all uploads failed, try returning the first URL directly
                # (might work if not blocked by CORS)
                first_url = photos[0].get('url')
                if first_url:
                    logger.warning("[AIImageOrchestrator] Using direct URL (upload failed): %s", first_url[:60])
                    return {'url': first_url, 'source': photos[0].get('photographer', 'Google Images')}

            return None
        except asyncio.TimeoutError:
            logger.warning("[AIImageOrchestrator] SerpAPI search timed out for '%s'", query)
            return None
        except Exception as e:
            logger.warning("[AIImageOrchestrator] SerpAPI search error for '%s': %s", query, e)
            return None

    async def _replace_blocked_external_urls(self, html: str, component: Dict[str, Any]) -> bool:
        """Find and replace external image URLs from blocked domains (Instagram, Facebook, etc.)."""
        if not html:
            return False

        # Find all img tags with src URLs
        img_pattern = re.compile(r'<img[^>]*src=["\']([^"\']+)["\'][^>]*>', re.IGNORECASE)
        blocked_images = []

        for match in img_pattern.finditer(html):
            src = match.group(1)
            # Check if this is from a blocked domain
            if src.startswith('http') and self._is_blocked_domain(src):
                # Extract alt text for search
                alt_match = re.search(r'alt=["\']([^"\']*)["\']', match.group(0), re.IGNORECASE)
                alt = alt_match.group(1) if alt_match else ''
                blocked_images.append({
                    'original_url': src,
                    'alt': alt,
                    'full_match': match.group(0)
                })
                logger.info("[AIImageOrchestrator] Found blocked domain URL: %s (alt='%s')", src[:60], alt)

        if not blocked_images:
            return False

        logger.info("[AIImageOrchestrator] Replacing %d blocked external URLs", len(blocked_images))

        # Search for replacement images
        current_html = html
        replaced_count = 0

        for blocked in blocked_images:
            # Use alt text or generic search
            search_query = blocked['alt'] if blocked['alt'] and len(blocked['alt']) > 3 else 'professional business photo'

            # Skip if alt is too generic
            generic_alts = {'image', 'photo', 'picture', 'img', ''}
            if search_query.lower() in generic_alts:
                search_query = 'professional business photo'

            logger.info("[AIImageOrchestrator] Searching replacement for blocked URL: '%s'", search_query)

            try:
                result = await self._search_single_image(search_query)
                if result and result.get('url'):
                    new_url = result['url']
                    # Replace the URL in the HTML
                    original_url = blocked['original_url']
                    if original_url in current_html:
                        current_html = current_html.replace(original_url, new_url)
                        replaced_count += 1
                        logger.info("[AIImageOrchestrator] Replaced blocked URL with: %s", new_url[:60])
                    else:
                        logger.warning("[AIImageOrchestrator] Could not find original URL in HTML for replacement")
                else:
                    logger.warning("[AIImageOrchestrator] No replacement found for: %s", search_query)
            except Exception as e:
                logger.warning("[AIImageOrchestrator] Error replacing blocked URL: %s", e)

        if replaced_count > 0:
            component['props']['render'] = current_html
            logger.info("[AIImageOrchestrator] Replaced %d blocked external URLs", replaced_count)
            return True

        return False

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

    # _try_nudge_image_box removed - AI model handles image positioning directly
