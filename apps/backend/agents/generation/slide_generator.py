"""
Refactored slide generator with better separation of concerns.
"""

import asyncio
import os
from typing import Dict, Any, List, Optional, AsyncIterator
from datetime import datetime
import uuid
import logging

from agents.core import ISlideGenerator, IRAGRepository
from agents.domain.models import SlideGenerationContext, SlideComponent, SlideGeneratedEvent
from agents.generation.components.prompt_builder import SlidePromptBuilder
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from agents.application.event_bus import get_event_bus, Events
from models.slide_minimal import MinimalSlide
from setup_logging_optimized import get_logger
from agents.generation.theme_adapter import ThemeAdapter
from agents.generation.components.layout_integrator import LayoutIntegrator
from services.user_info_service import get_user_info_service

logger = get_logger(__name__)


class SlideGeneratorV2(ISlideGenerator):
    """Refactored RAG-based slide generator."""
    
    def __init__(
        self,
        rag_repository: IRAGRepository,
        ai_generator: AISlideGenerator,
        component_validator: ComponentValidator,
        registry: Any,
        theme_system: Any
    ):
        self.rag_repository = rag_repository
        self.ai_generator = ai_generator
        self.component_validator = component_validator
        self.registry = registry
        self.theme_system = theme_system
        self.prompt_builder = SlidePromptBuilder()
        self.event_bus = get_event_bus()
        # Model-only mode disables all post-processing and structured layout integrations
        self.MODEL_ONLY_MODE = os.getenv("MODEL_ONLY_MODE", "false").lower() == "true"
        # Structured layout integration removed for model-only refactor
        self.layout_integrator = None
        self._enhanced_layout_cache = {}
        
        logger.info("✅ SlideGeneratorV2 initialized - improved architecture")
    
    async def generate_slide(
        self,
        context: SlideGenerationContext
    ) -> AsyncIterator[Dict[str, Any]]:
        """Generate a single slide using RAG-enhanced context."""
        
        logger.info(f"🚀 Generating slide {context.slide_index + 1}: {context.slide_outline.title}")
        if logger.isEnabledFor(logging.DEBUG) and context.tagged_media:
            logger.debug(f"[DEBUG] Slide generation context - tagged_media count: {len(context.tagged_media)}")
            for i, media in enumerate(context.tagged_media[:2]):  # First 2
                logger.debug(f"[DEBUG]   Media {i+1}: {media.get('filename', 'unknown')} - URL: {media.get('previewUrl', '')[:100] if media.get('previewUrl') else 'NO URL'}")
        generation_start = datetime.now()
        
        # Emit slide started event
        await self.event_bus.emit(Events.SLIDE_STARTED, {
            'slide_index': context.slide_index,
            'slide_title': context.slide_outline.title,
            'deck_uuid': context.deck_uuid
        })
        
        try:
            # Step 1: Retrieve RAG context
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'rag_lookup',
                'message': f'Finding design patterns for slide {context.slide_index + 1}'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event  # Also yield for direct consumption
            
            rag_context = await self._retrieve_rag_context(context)
            
            # Step 2: Build prompts
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'preparing_context',
                'message': f'Preparing content for slide {context.slide_index + 1}'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event
            
            system_prompt, user_prompt = await self._build_prompts(context, rag_context)
            
            # Step 3: Generate with AI
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'ai_generation',
                'message': f'Generating slide {context.slide_index + 1} content'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event
            
            slide_data = await self._generate_with_ai(
                system_prompt, user_prompt, context, rag_context
            )
            
            # Step 4: Post-process and validate
            substep_event = {
                'type': 'slide_substep',
                'slide_index': context.slide_index,
                'substep': 'saving',
                'message': f'Saving slide {context.slide_index + 1}'
            }
            await self.event_bus.emit(Events.SLIDE_SUBSTEP, substep_event)
            yield substep_event
            
            slide_data = await self._post_process_slide(slide_data, context)
            
            # Calculate timing
            total_elapsed = (datetime.now() - generation_start).total_seconds()
            logger.info(f"✅ Slide {context.slide_index + 1} complete in {total_elapsed:.1f}s")
            
            # Create event
            event = SlideGeneratedEvent(
                slide_index=context.slide_index,
                slide_data=slide_data,
                deck_uuid=context.deck_uuid
            )
            
            # Debug: Check if availableImages is in slide_data
            if logger.isEnabledFor(logging.DEBUG):
                if 'availableImages' in slide_data:
                    logger.debug(f"[SLIDE EVENT] Slide {context.slide_index} has {len(slide_data['availableImages'])} availableImages in event")
                else:
                    logger.debug(f"[SLIDE EVENT] Slide {context.slide_index} has NO availableImages in event")
            
            # Emit event
            await self.event_bus.emit(Events.SLIDE_GENERATED, event.to_dict())
            
            # Yield for compatibility
            yield event.to_dict()
            
        except Exception as e:
            logger.error(f"Error generating slide {context.slide_index + 1}: {str(e)}")
            
            # Emit error event
            await self.event_bus.emit(Events.SLIDE_ERROR, {
                'slide_index': context.slide_index,
                'error': str(e),
                'deck_uuid': context.deck_uuid
            })
            
            # Re-raise for proper error handling
            raise
    
    async def _retrieve_rag_context(self, context: SlideGenerationContext) -> Dict[str, Any]:
        """Retrieve relevant context using RAG."""
        logger.info(f"  [Step 1/4] Retrieving RAG context for slide {context.slide_index + 1}...")
        rag_start = datetime.now()
        
        # Run synchronous RAG retrieval in executor to avoid blocking
        import asyncio
        from concurrent.futures import ThreadPoolExecutor
        
        with ThreadPoolExecutor(max_workers=1) as executor:
            loop = asyncio.get_event_loop()
            rag_context = await loop.run_in_executor(
                executor,
                self.rag_repository.get_slide_context,
                context.slide_outline,
                context.slide_index,
                context.deck_outline,
                context.theme.to_dict(),
                context.palette
            )
        
        rag_elapsed = (datetime.now() - rag_start).total_seconds()
        logger.info(
            f"  [Step 1/4] ✓ RAG context retrieved in {rag_elapsed:.1f}s - "
            f"{len(rag_context.get('predicted_components', []))} components"
        )
        
        return rag_context
    
    async def _build_prompts(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> tuple[str, str]:
        """Build system and user prompts."""
        logger.info(f"  [Step 2/4] Building prompts for slide {context.slide_index + 1}...")
        prompt_start = datetime.now()
        
        # Extract brand logo URL from context
        brand_logo_url = self._get_brand_logo_url(context)
        if brand_logo_url:
            logger.info(f"  [Step 2/4] Brand logo found: {brand_logo_url}")
        
        system_prompt = self.prompt_builder.build_system_prompt()
        # Build split user prompt blocks (deck-static vs per-slide)
        try:
            static_block, slide_block = self.prompt_builder.build_user_prompt_blocks(
                context,
                rag_context,
                brand_logo_url=brand_logo_url
            )
            # Insert an Anthropic cache breakpoint delimiter so the client can convert to content blocks
            user_prompt = f"{static_block}\n<<<CACHE_BREAKPOINT>>>\n{slide_block}"
        except Exception:
            # Fallback to original single-block prompt
            user_prompt = self.prompt_builder.build_user_prompt(
                context,
                rag_context,
                brand_logo_url=brand_logo_url
            )

        # Structured layout enhancement disabled in model-only refactor
        
        prompt_elapsed = (datetime.now() - prompt_start).total_seconds()
        logger.info(
            f"  [Step 2/4] ✓ Prompts built in {prompt_elapsed:.1f}s - "
            f"{len(user_prompt)} chars"
        )
        
        return system_prompt, user_prompt
    
    def _get_brand_logo_url(self, context: SlideGenerationContext) -> Optional[str]:
        """Extract brand logo URL from context."""
        try:
            # Check stylePreferences.logoUrl first (set by ThemeDirector)
            if (hasattr(context, 'deck_outline') and 
                context.deck_outline and 
                hasattr(context.deck_outline, 'stylePreferences') and
                context.deck_outline.stylePreferences and
                hasattr(context.deck_outline.stylePreferences, 'logoUrl')):
                logo_url = context.deck_outline.stylePreferences.logoUrl
                if logo_url and logo_url.strip():
                    return logo_url.strip()
            
            # Fallback: check theme data if available
            if hasattr(context, 'theme') and context.theme:
                theme_data = context.theme
                if isinstance(theme_data, dict):
                    # Check various possible locations in theme
                    logo_url = (theme_data.get('brand_logo_url') or 
                               theme_data.get('logo_url') or
                               theme_data.get('brand', {}).get('logo_url'))
                    if logo_url and logo_url.strip():
                        return logo_url.strip()
            
            return None
            
        except Exception as e:
            logger.warning(f"Error extracting brand logo URL: {e}")
            return None
    
    async def _generate_with_ai(
        self,
        system_prompt: str,
        user_prompt: str,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Generate slide with AI."""
        logger.info(f"  [Step 3/4] Calling AI for slide {context.slide_index + 1}...")
        ai_start = datetime.now()
        
        predicted_components = rag_context.get('predicted_components', [])
        
        slide_data = await self.ai_generator.generate(
            system_prompt=system_prompt,
            user_prompt=user_prompt,
            response_model=MinimalSlide,
            context=context,
            predicted_components=predicted_components
        )
        
        ai_elapsed = (datetime.now() - ai_start).total_seconds()
        logger.info(f"  [Step 3/4] ✓ AI generation completed in {ai_elapsed:.1f}s")
        
        return slide_data
    
    async def _post_process_slide(
        self,
        slide_data: Dict[str, Any],
        context: SlideGenerationContext
    ) -> Dict[str, Any]:
        """
        Post-process slide with validation, font sizing, and theme application.

        Includes:
        - Component ID assignment
        - Background component injection
        - Adaptive font sizing (NO hardcoded limits)
        - Theme consistency enforcement
        - Component validation
        """
        logger.info(f"  [Step 4/4] Post-processing slide {context.slide_index + 1}...")
        try:
            for component in slide_data.get('components', []):
                if not component.get('id'):
                    component['id'] = str(uuid.uuid4())
        except Exception:
            pass
        try:
            if not slide_data.get('theme_panel') and context.theme:
                slide_data['theme_panel'] = ThemeAdapter.build_frontend_theme(context.theme)
        except Exception:
            pass
        # REMOVED EARLY RETURN - Font sizing code is after this!

        # Ensure we always have a background component and backfill its base props
        try:
            components = slide_data.get('components', []) or []
            has_background = any(c.get('type') == 'Background' for c in components)
            if not has_background:
                theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme or {})
                colors = (theme_dict or {}).get('color_palette', {})
                # Choose background from DB palette if present, else theme
                def _estimate_brightness(hex_color: str) -> float:
                    try:
                        h = hex_color.lstrip('#')
                        r = int(h[0:2], 16) / 255.0
                        g = int(h[2:4], 16) / 255.0
                        b = int(h[4:6], 16) / 255.0
                        return (0.299 * r + 0.587 * g + 0.114 * b)
                    except Exception:
                        return 0.5
                db_palette = context.palette or {}
                bg_from_db = None
                try:
                    if db_palette.get('source') == 'database' and isinstance(db_palette.get('colors'), list) and db_palette['colors']:
                        bg_from_db = sorted(db_palette['colors'], key=lambda c: _estimate_brightness(c), reverse=True)[0]
                except Exception:
                    bg_from_db = None
                bg_color_final = bg_from_db or colors.get('primary_background', '#FFFFFF')
                components.insert(0, {
                    'id': 'bg-fallback',
                    'type': 'Background',
                    'props': {
                        'position': {'x': 0, 'y': 0},
                        'width': 1920,
                        'height': 1080,
                        'opacity': 1,
                        'rotation': 0,
                        'zIndex': 0,
                        'backgroundType': 'color',
                        'backgroundColor': bg_color_final
                    }
                })
                slide_data['components'] = components
                logger.info("[SLIDE GENERATOR] Injected fallback Background component")
            else:
                for comp in components:
                    if comp.get('type') == 'Background':
                        props = comp.setdefault('props', {})
                        props.setdefault('position', {'x': 0, 'y': 0})
                        props.setdefault('width', 1920)
                        props.setdefault('height', 1080)
                        props.setdefault('opacity', 1)
                        props.setdefault('rotation', 0)
                        props.setdefault('zIndex', 0)
                        # Preserve gradient if present and on-palette; otherwise ensure a sensible background
                        if 'backgroundType' not in props:
                            props['backgroundType'] = 'gradient'
                        def _normalize_hex_no_alpha(c: str) -> str:
                            try:
                                v = (c or '').strip()
                                if v.startswith('#') and len(v) == 9:
                                    return v[:7]
                                return v
                            except Exception:
                                return c
                        
                        def _darken_color_subtly(hex_color: str) -> str:
                            """Create a barely noticeable darker version of the same color (5% darker)."""
                            try:
                                hex_color = hex_color.replace('#', '')
                                if len(hex_color) != 6:
                                    return hex_color
                                
                                r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
                                # Darken by only 5% (barely noticeable)
                                factor = 0.95  # 5% darker
                                r_dark = max(0, int(r * factor))
                                g_dark = max(0, int(g * factor))  
                                b_dark = max(0, int(b * factor))
                                
                                return f"#{r_dark:02x}{g_dark:02x}{b_dark:02x}"
                            except Exception:
                                return hex_color
                        
                        def _gradient_on_palette(grad: Dict[str, Any], palette_colors: List[str]) -> bool:
                            try:
                                allowed = set(_normalize_hex_no_alpha(x).lower() for x in (palette_colors or []) if isinstance(x, str))
                                stops = grad.get('stops') or []
                                cols = [(_normalize_hex_no_alpha(s.get('color')) or '').lower() for s in stops if isinstance(s, dict)]
                                cols = [c for c in cols if c]
                                # Consider on-palette if at least one stop matches allowed
                                return any(c in allowed for c in cols)
                            except Exception:
                                return False
                        if props.get('backgroundType') == 'gradient' and isinstance(props.get('gradient'), dict):
                            # Replace gradient if it is off-palette (e.g., raw red/blue), or normalize stops
                            theme_dict2 = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme or {})
                            colors2 = (theme_dict2 or {}).get('color_palette', {})
                            palette_colors_allowed: List[str] = []
                            if isinstance(colors2.get('colors'), list):
                                palette_colors_allowed.extend(colors2.get('colors'))
                            for key in ['primary_background','secondary_background','accent_1','accent_2','primary_text','secondary_text']:
                                v = colors2.get(key)
                                if isinstance(v, str):
                                    palette_colors_allowed.append(v)
                            if not _gradient_on_palette(props.get('gradient'), palette_colors_allowed):
                                # Force replace with theme gradient
                                stops: List[Dict[str, Any]] = []
                                theme_grads = colors2.get('gradients') or []
                                if isinstance(theme_grads, list) and theme_grads:
                                    g0 = theme_grads[0] or {}
                                    gcolors = g0.get('colors') or []
                                    if isinstance(gcolors, list) and len(gcolors) >= 2:
                                        c1, c2 = gcolors[0], gcolors[1]
                                        stops = [{'color': _normalize_hex_no_alpha(c1), 'position': 0}, {'color': _normalize_hex_no_alpha(c2), 'position': 100}]
                                if not stops:
                                    # fallback from backgrounds - use SINGLE color with barely noticeable corner fade
                                    c1 = colors2.get('primary_background', '#0A0E27')
                                    c2 = _darken_color_subtly(c1)  # Create barely noticeable darker version
                                    # Create subtle corner gradient: same color → barely darker → back to same color
                                    stops = [
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 0},    # Corner start
                                        {'color': _normalize_hex_no_alpha(c2), 'position': 60},   # Subtle fade
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 100}   # Back to original
                                    ]
                                props['backgroundType'] = 'gradient'
                                props['gradient'] = {'type': 'radial', 'position': 'top-right', 'stops': stops}
                                # Ensure backgroundColor does not override gradient
                                if 'backgroundColor' in props:
                                    try:
                                        del props['backgroundColor']
                                    except Exception:
                                        pass
                            else:
                                # Normalize: ensure stops exist when only colors are provided
                                try:
                                    grad = props.get('gradient') or {}
                                    stops_in = grad.get('stops') or []
                                    colors_in = grad.get('colors') or []
                                    if (not stops_in) and isinstance(colors_in, list) and colors_in:
                                        n = len(colors_in)
                                        stops_norm: List[Dict[str, Any]] = []
                                        for i, c in enumerate(colors_in):
                                            pos = (float(i) / float(max(1, n - 1))) * 100.0
                                            stops_norm.append({'color': _normalize_hex_no_alpha(c), 'position': pos})
                                        grad['stops'] = stops_norm
                                        props['gradient'] = grad
                                        if 'backgroundColor' in props:
                                            try:
                                                del props['backgroundColor']
                                            except Exception:
                                                pass
                                except Exception:
                                    pass
                        else:
                            # Create a simple gradient from palette backgrounds or accents
                            def _estimate_brightness(hex_color: str) -> float:
                                try:
                                    h = hex_color.lstrip('#')
                                    r = int(h[0:2], 16) / 255.0
                                    g = int(h[2:4], 16) / 255.0
                                    b = int(h[4:6], 16) / 255.0
                                    return (0.299 * r + 0.587 * g + 0.114 * b)
                                except Exception:
                                    return 0.5
                            theme_dict2 = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme or {})
                            colors2 = (theme_dict2 or {}).get('color_palette', {})
                            db_palette2 = context.palette or {}
                            stops: List[Dict[str, Any]] = []
                            try:
                                if isinstance(db_palette2.get('backgrounds'), list) and len(db_palette2['backgrounds']) >= 1:
                                    c1 = db_palette2['backgrounds'][0]  # Use first background color
                                    c2 = _darken_color_subtly(c1)  # Create barely noticeable darker version
                                    stops = [
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 0},
                                        {'color': _normalize_hex_no_alpha(c2), 'position': 60},
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 100}
                                    ]
                                elif isinstance(db_palette2.get('colors'), list) and len(db_palette2['colors']) >= 1:
                                    # Use first available color with subtle corner fade
                                    c1 = db_palette2['colors'][0]
                                    c2 = _darken_color_subtly(c1)
                                    stops = [
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 0},
                                        {'color': _normalize_hex_no_alpha(c2), 'position': 60},
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 100}
                                    ]
                                else:
                                    # Fallback to theme background only - subtle corner fade
                                    c1 = colors2.get('primary_background', '#0A0E27')
                                    c2 = _darken_color_subtly(c1)  # Barely darken the same color
                                    stops = [
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 0},
                                        {'color': _normalize_hex_no_alpha(c2), 'position': 60}, 
                                        {'color': _normalize_hex_no_alpha(c1), 'position': 100}
                                    ]
                            except Exception:
                                c1 = colors2.get('primary_background', '#0A0E27')
                                c2 = _darken_color_subtly(c1)  # Use same color, barely darkened
                                # Create subtle corner gradient
                                stops = [
                                    {'color': _normalize_hex_no_alpha(c1), 'position': 0},
                                    {'color': _normalize_hex_no_alpha(c2), 'position': 60},
                                    {'color': _normalize_hex_no_alpha(c1), 'position': 100}
                                ]
                            props['backgroundType'] = 'gradient'
                            props['gradient'] = {'type': 'radial', 'position': 'top-right', 'stops': stops}
                            # Remove backgroundColor if present to avoid overriding gradient downstream
                            if 'backgroundColor' in props:
                                try:
                                    del props['backgroundColor']
                                except Exception:
                                    pass
        except Exception as e:
            logger.warning(f"[SLIDE GENERATOR] Failed to ensure background defaults: {e}")
        
        # Model-only: skip interactive injections

        # ThemeOverlay removed

        # Theme-guided placement for mature (non-creative) decks: keep title/subtitle/logo consistent
        try:
            # Load per-slide structure from theme if available
            def _get_slide_structure_from_theme_local() -> Dict[str, Any]:
                try:
                    theme_obj = context.theme
                    slide_themes = None
                    if hasattr(theme_obj, 'slide_themes'):
                        slide_themes = theme_obj.slide_themes
                    elif isinstance(theme_obj, dict):
                        slide_themes = theme_obj.get('slide_themes', {})
                    
                    logger.info(f"Theme object type: {type(theme_obj)}, has slide_themes: {bool(slide_themes)}")
                    if slide_themes:
                        logger.info(f"Available slide theme keys: {list(slide_themes.keys())}")
                    
                    if not slide_themes:
                        logger.warning("No slide_themes found in theme object")
                        return {}
                    
                    slide_id = getattr(context.slide_outline, 'id', str(context.slide_index))
                    logger.info(f"Looking for slide_id: '{slide_id}' (slide_index: {context.slide_index})")
                    
                    if slide_id in slide_themes:
                        structure = slide_themes[slide_id].get('structure') or {}
                        logger.info(f"Found structure for slide_id '{slide_id}': {structure.keys() if structure else 'empty'}")
                        return structure
                    
                    slide_index_str = str(context.slide_index)
                    if slide_index_str in slide_themes:
                        structure = slide_themes[slide_index_str].get('structure') or {}
                        logger.info(f"Found structure for slide_index_str '{slide_index_str}': {structure.keys() if structure else 'empty'}")
                        return structure
                    
                    logger.warning(f"No theme structure found for slide_id '{slide_id}' or index '{slide_index_str}'")
                except Exception as e:
                    logger.error(f"Error getting slide structure from theme: {e}")
                    return {}
                return {}

            theme_structure = _get_slide_structure_from_theme_local()
            logger.info(f"Slide {context.slide_index} theme_structure: {theme_structure.keys() if theme_structure else 'None'}")
            if theme_structure and 'elements_to_include' in theme_structure:
                logger.info(f"Slide {context.slide_index} elements_to_include: {theme_structure['elements_to_include']}")

            theme_panel = slide_data.get('theme_panel')
            if not theme_panel and context.theme:
                theme_panel = ThemeAdapter.build_frontend_theme(context.theme)
                slide_data['theme_panel'] = theme_panel
            # Model-only refactor: do not hardcode Title/Subtitle/Logo positions here

            # Apply theme-driven structural layout (titles, subtitles, logo, slide number)
            try:
                self._apply_theme_structural_layout(slide_data, context, theme_structure)
            except Exception:
                pass

            # Model-only refactor: skip any code-driven stacking/clamping here

            # Keep divider/line placement per theme (allowed in model-only)
            try:
                self._normalize_dividers_and_lines(slide_data, theme_structure)
            except Exception:
                pass

            # Model-only refactor: do not clamp text blocks
        except Exception:
            pass

        # Model-only refactor: skip auto centering/balancing

        # Normalize component dimensions/positions for reliable overlap detection
        try:
            comps = slide_data.get('components', []) or []
            def _parse_to_int(value, default_val=0):
                try:
                    if isinstance(value, (int, float)):
                        return int(value)
                    if isinstance(value, str):
                        s = value.strip().lower()
                        if s.endswith('px'):
                            s = s[:-2]
                        return int(float(s))
                except Exception:
                    return default_val
            for comp in comps:
                t = comp.get('type')
                if t == 'Background' or t == 'Lines':
                    continue
                props = comp.setdefault('props', {})
                pos = props.setdefault('position', {})
                pos['x'] = _parse_to_int(pos.get('x', 0), 0)
                pos['y'] = _parse_to_int(pos.get('y', 0), 0)
                # Coerce width/height (fallbacks by type)
                w = props.get('width')
                h = props.get('height')
                wv = _parse_to_int(w, None) if w is not None else None
                hv = _parse_to_int(h, None) if h is not None else None
                if t == 'Icon':
                    size = _parse_to_int(props.get('size', 24), 24)
                    if not wv or wv <= 0:
                        wv = size
                    if not hv or hv <= 0:
                        hv = size
                elif t in ('TiptapTextBlock','TextBlock','Title','Subtitle','Heading'):
                    if not hv or hv <= 0:
                        hv = 120
                    if not wv or wv <= 0:
                        wv = props.get('width') or 1760
                        wv = _parse_to_int(wv, 1760)
                elif t == 'Image':
                    if not wv or wv <= 0:
                        wv = 800
                    if not hv or hv <= 0:
                        hv = 600
                elif t in ('CustomComponent','Chart','Table','Shape'):
                    if not wv or wv <= 0:
                        wv = 600
                    if not hv or hv <= 0:
                        hv = 300
                # Apply back
                if wv is not None:
                    props['width'] = int(wv)
                if hv is not None:
                    props['height'] = int(hv)
                comp['props'] = props
            slide_data['components'] = comps
        except Exception:
            pass

        # Post-processing: overlap enforcement DISABLED - AI model handles positioning directly

        # Ensure icons remain adjacent to their corresponding text blocks
        try:
            self._enforce_icon_text_adjacency(slide_data)
        except Exception:
            pass

        # Model-only: skip title slide enhancements

        # Handle images - either apply tagged media or attach available images for frontend selection
        # Model-only: skip image replacements/attachments; keep placeholders

        # Construct slide_info from context for logo injection
        slide_info = {
            'type': getattr(context.slide_outline, 'type', 'content') if hasattr(context, 'slide_outline') and context.slide_outline else 'content',
            'title': getattr(context.slide_outline, 'title', '') if hasattr(context, 'slide_outline') and context.slide_outline else '',
            'slide_number': context.slide_index if hasattr(context, 'slide_index') else 0
        }

        # Prepare theme dict for logo injection
        theme_dict_for_logo = context.theme.to_dict() if context.theme and hasattr(context.theme, 'to_dict') else (context.theme if context.theme else {})

        # Intelligent logo injection - create logo components if AI didn't include them
        slide_data = self._inject_intelligent_logo(slide_data, slide_info, theme_dict_for_logo)

        # Model-only: skip auto chart/table labels
        
        # Model-only: skip user placeholder replacements
        
        # Ensure a Background component exists so theme background applies
        try:
            comps = slide_data.get('components', []) or []
            has_bg = any(isinstance(c, dict) and c.get('type') == 'Background' for c in comps)
            if not has_bg:
                page_bg = '#FFFFFF'
                try:
                    theme_panel = ThemeAdapter.build_frontend_theme(context.theme) if context.theme else {}
                    page_bg = theme_panel.get('page', {}).get('backgroundColor', page_bg)
                except Exception:
                    pass
                import uuid as _uuid
                bg_comp = {
                    'id': str(_uuid.uuid4()),
                    'type': 'Background',
                    'props': {
                        'position': {'x': 0, 'y': 0},
                        'width': 1920,
                        'height': 1080,
                        'opacity': 1,
                        'rotation': 0,
                        'zIndex': 0,
                        'backgroundType': 'color',
                        'backgroundColor': page_bg
                    }
                }
                comps.insert(0, bg_comp)
                slide_data['components'] = comps
        except Exception:
            pass

        # Apply adaptive font sizing and validate components
        theme_dict = None
        if context.theme:
            theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
            logger.info(f"[FONT SIZING] Applying adaptive font sizing to slide {context.slide_index + 1}")

        components = slide_data.get('components', [])
        validated_components = self.component_validator.validate_components(
            components,
            self.registry,
            theme=theme_dict  # Pass theme for font sizing
        )

        slide_data['components'] = validated_components
        logger.info(f"✅ Validated {len(validated_components)} components")
        slide_data['generated_at'] = datetime.now().isoformat()
        
        # Add theme data to slide
        if context.theme:
            theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
            slide_data['theme'] = theme_dict
            # Provide a frontend-aligned theme mapping as well
            try:
                theme_panel = ThemeAdapter.build_frontend_theme(context.theme)
                slide_data['theme_panel'] = theme_panel
            except Exception:
                theme_panel = None
            logger.info(f"[SLIDE GENERATOR] Added theme data to slide {context.slide_index + 1}")
        else:
            logger.warning(f"[SLIDE GENERATOR] No theme available for slide {context.slide_index + 1}")
        
        # Add palette data to slide
        if context.palette:
            slide_data['palette'] = context.palette
            logger.info(f"[SLIDE GENERATOR] Added palette data to slide {context.slide_index + 1}")
        
        # Enforce theme consistency and fonts (only if theme exists)
        if context.theme:
            self._enforce_theme_consistency(slide_data, context.theme)
            self._enforce_theme_fonts(slide_data, context.theme)
            # Final pass: apply frontend-style theme mapping to components
            try:
                if 'theme_panel' not in slide_data:
                    theme_panel = ThemeAdapter.build_frontend_theme(context.theme)
                else:
                    theme_panel = slide_data['theme_panel']
                updated = ThemeAdapter.apply_theme_to_components(slide_data.get('components', []), theme_panel, original_theme=context.theme)
                slide_data['components'] = updated
            except Exception as e:
                logger.warning(f"[SLIDE GENERATOR] ThemeAdapter apply failed: {e}")
        else:
            logger.warning(f"[SLIDE GENERATOR] Skipping theme enforcement - no theme available")
        
        # Inject outline-derived values into CustomComponents (value/label/outline chips)
        try:
            self._inject_outline_values_into_custom_components(slide_data, context)
        except Exception as e:
            logger.warning(f"[SLIDE GENERATOR] Outline value injection skipped due to error: {e}")

        logger.info(
            f"  [Step 4/4] ✓ Post-processing complete - "
            f"{len(validated_components)} components validated"
        )
        
        return slide_data

    def _final_text_flow_pass(self, slide_data: Dict[str, Any], context: SlideGenerationContext, theme_structure: Dict[str, Any]) -> None:
        return

    def _limit_hero_and_stack_heavy_components(self, slide_data: Dict[str, Any]) -> None:
        """Keep at most one hero-scale visual; resize/stack the rest.

        - Hero candidates: Image/CustomComponent with very large width/height or metadata role 'hero'.
        - Keep the largest hero; convert others to supporting visuals (<= 880px width).
        - Stack heavy visuals vertically with 40px gaps to prevent overlap.
        """
        components: List[Dict[str, Any]] = slide_data.get('components', []) or []
        if not components:
            return

        CANVAS_W, CANVAS_H = 1920, 1080
        GAP = 40

        def _ctype(c: Dict[str, Any]) -> str:
            return str(c.get('type') or '')

        def _props(c: Dict[str, Any]) -> Dict[str, Any]:
            return c.setdefault('props', {})

        def _pos(c: Dict[str, Any]) -> Tuple[int, int]:
            p = _props(c)
            position = p.setdefault('position', {})
            return int((position.get('x') or 0) or 0), int((position.get('y') or 0) or 0)

        def _size(c: Dict[str, Any]) -> Tuple[int, int]:
            p = _props(c)
            return int((p.get('width') or 0) or 0), int((p.get('height') or 0) or 0)

        def _set_pos(c: Dict[str, Any], x: int, y: int) -> None:
            p = _props(c)
            position = p.setdefault('position', {})
            position['x'] = int(x)
            position['y'] = int(y)
            p['position'] = position

        def _set_size(c: Dict[str, Any], w: int, h: int) -> None:
            p = _props(c)
            p['width'] = int(max(1, w))
            p['height'] = int(max(1, h))

        def _bbox(c: Dict[str, Any]) -> Tuple[int, int, int, int]:
            x, y = _pos(c)  # center-based semantics
            w, h = _size(c)
            if w <= 0:
                w = 800
            if h <= 0:
                h = 400
            left = int(x - w / 2)
            top = int(y - h / 2)
            right = left + w
            bottom = top + h
            return left, top, right, bottom

        def _area(c: Dict[str, Any]) -> int:
            w, h = _size(c)
            if w <= 0 or h <= 0:
                w = max(w, 800)
                h = max(h, 400)
            return int(w * h)

        heavy_types = {'Image', 'CustomComponent'}
        heavy: List[int] = [i for i, c in enumerate(components) if _ctype(c) in heavy_types]
        if not heavy:
            return

        # Identify hero candidates
        hero_idxs: List[int] = []
        for idx in heavy:
            c = components[idx]
            p = _props(c)
            meta = p.get('metadata') or {}
            role = str(meta.get('role', '') or '').lower()
            w, h = _size(c)
            is_hero_dim = (w >= 1200 or h >= 500)
            is_cover = str(p.get('objectFit', '') or '').lower() == 'cover'
            if role == 'hero' or is_cover or is_hero_dim:
                hero_idxs.append(idx)

        # Keep only the largest hero
        if len(hero_idxs) > 1:
            # Pick the hero with max area
            keep_idx = max(hero_idxs, key=lambda i: _area(components[i]))
            for idx in hero_idxs:
                if idx == keep_idx:
                    continue
                c = components[idx]
                p = _props(c)
                # Downgrade to supporting visual
                p.setdefault('metadata', {})['role'] = 'supporting_visual'
                # Resize to half-column width
                w, h = _size(c)
                target_w = min(max(600, w or 880), 880)
                target_h = h or 400
                _set_size(c, target_w, target_h)
                # Ensure within canvas
                x, y = _pos(c)
                if x <= 0:
                    x = 80 + target_w // 2
                if y <= 0:
                    y = 540
                _set_pos(c, x, y)
                # Lower zIndex beneath text
                p.setdefault('zIndex', 1)

        # Stack heavy visuals to avoid overlap
        # Sort by current center y; if missing, default to middle
        heavy_sorted: List[int] = sorted(heavy, key=lambda i: _pos(components[i])[1] or 540)
        last_bottom = None
        for idx in heavy_sorted:
            c = components[idx]
            # Ensure sane size defaults
            w, h = _size(c)
            if w <= 0:
                w = 880 if len(heavy_sorted) > 1 else 1200
                _set_size(c, w, h or 400)
                w, h = _size(c)
            if h <= 0:
                _set_size(c, w, 400)
                w, h = _size(c)
            # Compute bbox and stack if overlapping previous heavy
            left, top, right, bottom = _bbox(c)
            if last_bottom is None:
                last_bottom = bottom
                continue
            if top < last_bottom + GAP:
                # Move this component down just below last_bottom
                new_top = last_bottom + GAP
                new_center_y = int(new_top + h / 2)
                x, _ = _pos(c)
                # Keep inside canvas
                max_center_y = CANVAS_H - int(h / 2) - 40
                new_center_y = min(new_center_y, max_center_y)
                _set_pos(c, x if x > 0 else int(CANVAS_W / 2), new_center_y)
                # Recompute bbox
                _, top2, _, bottom2 = _bbox(c)
                last_bottom = bottom2
            else:
                last_bottom = bottom

    def _apply_layering_and_alignment_rules(self, slide_data: Dict[str, Any]) -> None:
        components: List[Dict[str, Any]] = slide_data.get('components', []) or []
        if not components:
            return
        # Ensure Background is behind; text above shapes/images by default
        for comp in components:
            props = comp.setdefault('props', {})
            z = props.get('zIndex')
            ctype = comp.get('type')
            if ctype == 'Background':
                props.setdefault('zIndex', 0)
            elif ctype in {'Shape', 'Image', 'Chart', 'Table'}:
                # Base visuals layer
                if z is None or z < 1:
                    props['zIndex'] = 1
            elif ctype in {'TiptapTextBlock', 'TextBlock', 'Title', 'Subtitle'}:
                # Text should sit above visuals
                if z is None or z < 2:
                    props['zIndex'] = 2
                # Default alignment for readability
                props.setdefault('alignment', 'left')
                props.setdefault('verticalAlignment', 'top')
            comp['props'] = props

    def _enforce_typography_defaults(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        # Extract theme typography and colors
        theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme or {})
        typography = (theme_dict.get('typography') or {}) if isinstance(theme_dict, dict) else {}
        hero_font = (typography.get('hero_title') or {}).get('family') or 'Montserrat'
        body_font = (typography.get('body_text') or {}).get('family') or 'Poppins'
        color_palette = (theme_dict.get('color_palette') or {}) if isinstance(theme_dict, dict) else {}
        text_primary = color_palette.get('primary_text') or color_palette.get('text') or '#1A1A1A'

        components: List[Dict[str, Any]] = slide_data.get('components', []) or []
        for comp in components:
            ctype = comp.get('type')
            if ctype in {'TiptapTextBlock', 'TextBlock', 'Title', 'Subtitle'}:
                props = comp.setdefault('props', {})
                # Do not override explicit font-size; just enforce families/colors/weights when missing
                if ctype in {'Title', 'Subtitle'}:
                    props.setdefault('fontFamily', hero_font if ctype == 'Title' else body_font)
                else:
                    props.setdefault('fontFamily', body_font)
                props.setdefault('textColor', text_primary)
                # Ensure texts array styles inherit sensible defaults
                texts = props.get('texts') if isinstance(props.get('texts'), list) else []
                new_texts = []
                for seg in texts:
                    seg = seg or {}
                    style = seg.get('style') if isinstance(seg.get('style'), dict) else {}
                    style.setdefault('textColor', props.get('textColor'))
                    # Avoid numeric fontWeight values; normalize to strings
                    fw = style.get('fontWeight')
                    if isinstance(fw, (int, float)):
                        style['fontWeight'] = 'bold' if int(fw) >= 600 else 'normal'
                    seg['style'] = style
                    new_texts.append(seg)
                if new_texts:
                    props['texts'] = new_texts
                comp['props'] = props

    def _ensure_interactive_elements(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        try:
            title_text = getattr(context.slide_outline, 'title', '') or ''
            content_text = getattr(context.slide_outline, 'content', '') or ''
            outline_text = f"{title_text}\n{content_text}".lower()
        except Exception:
            outline_text = ''

        components: List[Dict[str, Any]] = slide_data.get('components', []) or []

        def _has_interactive(kind_markers: List[str]) -> bool:
            for c in components:
                if c.get('type') != 'CustomComponent':
                    continue
                props = c.get('props', {}) or {}
                render_str = (props.get('render') or props.get('data') or '')
                rs = str(render_str).lower()
                if any(m in rs for m in kind_markers):
                    return True
            return False

        def _load_enhanced_library() -> Dict[str, Any]:
            import json
            from pathlib import Path
            kb_path = Path('agents/rag/knowledge_base/custom_component_library_enhanced.json')
            if not kb_path.exists():
                kb_path = Path(__file__).parent.parent.parent / 'agents' / 'rag' / 'knowledge_base' / 'custom_component_library_enhanced.json'
            with open(kb_path, 'r') as f:
                return json.load(f)

        def _insert_component(example_obj: Dict[str, Any]) -> None:
            try:
                props = example_obj.setdefault('props', {})
                pos = props.setdefault('position', {})
                width = int(props.get('width') or 1600)
                height = int(props.get('height') or 680)
                width = max(600, min(width, 1760))
                height = max(360, min(height, 920))
                x = max(60, int((1920 - width) / 2))
                y = int(props.get('position', {}).get('y') or 200)
                pos['x'] = x
                pos['y'] = y
                props['width'] = width
                props['height'] = height
                example_obj['props'] = props
            except Exception:
                pass
            if not example_obj.get('id'):
                example_obj['id'] = str(uuid.uuid4())
            components.append(example_obj)

        need_quiz = any(k in outline_text for k in ['quiz', 'test', 'assessment', 'knowledge check'])
        need_poll = any(k in outline_text for k in ['poll', 'vote', 'survey', 'feedback'])
        need_game = any(k in outline_text for k in ['game', 'play', 'challenge'])

        if (need_quiz and not _has_interactive(['quiz', 'question'])) or (need_poll and not _has_interactive(['poll', 'vote'])) or (need_game and not _has_interactive(['decision', 'framework'])):
            try:
                lib = _load_enhanced_library()
                interactive = lib.get('interactive_components', {}) or {}
                if need_quiz and not _has_interactive(['quiz', 'question']):
                    quiz = (interactive.get('quiz_component') or {}).get('example')
                    if isinstance(quiz, dict):
                        try:
                            question, opts = self._derive_quiz_from_text(components)
                            if question:
                                qp = quiz.setdefault('props', {})
                                qp['question'] = question
                                for i, opt in enumerate(opts[:4], start=1):
                                    qp[f'option{i}'] = opt
                                qp.setdefault('correctAnswer', min(3, max(0, len(opts)-1)))
                        except Exception:
                            pass
                        _insert_component(quiz)
                if need_poll and not _has_interactive(['poll', 'vote']):
                    poll = (interactive.get('interactive_poll') or {}).get('example')
                    if isinstance(poll, dict):
                        _insert_component(poll)
                if need_game and not _has_interactive(['decision', 'framework']):
                    decision = (lib.get('content_enhancers', {}).get('decision_tree') or {}).get('example')
                    if isinstance(decision, dict):
                        _insert_component(decision)
            except Exception:
                pass

        if components is not slide_data.get('components'):
            slide_data['components'] = components

    def _derive_quiz_from_text(self, components: List[Dict[str, Any]]) -> tuple[Optional[str], List[str]]:
        try:
            for c in components:
                if c.get('type') in ('TiptapTextBlock', 'TextBlock'):
                    texts = (c.get('props', {}) or {}).get('texts') or []
                    lines: List[str] = []
                    for t in texts:
                        val = str((t or {}).get('text') or '').strip()
                        if val:
                            lines.append(val)
                    if len(lines) >= 3:
                        q = lines[0]
                        opts = lines[1:5]
                        return q, opts
        except Exception:
            pass
        return None, []

    def _auto_center_and_balance_components(self, slide_data: Dict[str, Any]) -> None:
        components: List[Dict[str, Any]] = slide_data.get('components', []) or []
        if not components:
            return

        def _ctype(c: Dict[str, Any]) -> str:
            return str(c.get('type') or '')

        def _pos(c: Dict[str, Any]) -> tuple[int, int]:
            p = (c.get('props') or {}).get('position') or {}
            return int((p.get('x') or 0) or 0), int((p.get('y') or 0) or 0)

        def _size(c: Dict[str, Any]) -> tuple[int, int]:
            p = (c.get('props') or {})
            return int((p.get('width') or 0) or 0), int((p.get('height') or 0) or 0)

        heavy_types = {'CustomComponent', 'Image'}
        banned_center = {'Chart', 'Table'}
        non_bg = [c for c in components if _ctype(c) != 'Background']
        heavy = [c for c in non_bg if _ctype(c) in heavy_types]

        text_blocks = [c for c in non_bg if _ctype(c) in {'TiptapTextBlock', 'TextBlock'}]
        left_text = None
        right_text = None
        for t in text_blocks:
            x, _ = _pos(t)
            w, _ = _size(t)
            if w >= 720:
                if x <= 200:
                    left_text = t
                elif x >= 940:
                    right_text = t

        def _set_pos(c: Dict[str, Any], x: int, y: Optional[int] = None):
            p = c.setdefault('props', {})
            pos = p.setdefault('position', {})
            pos['x'] = int(x)
            if y is not None:
                pos['y'] = int(y)
            p['position'] = pos
            c['props'] = p

        def _set_size(c: Dict[str, Any], w: int, h: Optional[int] = None):
            p = c.setdefault('props', {})
            p['width'] = int(w)
            if h is not None:
                p['height'] = int(h)
            c['props'] = p

        def _center_x_for_width(w: int) -> int:
            return max(60, int((1920 - w) / 2))

        # Skip centering when slide appears text-heavy (many/wide text blocks)
        def _is_text_heavy_slide() -> bool:
            try:
                wide_blocks = [t for t in text_blocks if _size(t)[0] >= 600]
                total_wide = sum(_size(t)[0] for t in wide_blocks)
                return len(wide_blocks) >= 2 or total_wide >= 1200
            except Exception:
                return False

        text_heavy = _is_text_heavy_slide()

        if len(heavy) == 1 and not text_heavy:
            hc = heavy[0]
            if _ctype(hc) not in banned_center:
                w, h = _size(hc)
                w = max(600, min(w or 0, 1760)) or 1200
                _set_size(hc, w, h or 600)
                _set_pos(hc, _center_x_for_width(w))
                return

        for c in heavy:
            if _ctype(c) != 'CustomComponent':
                continue
            props = c.get('props', {}) or {}
            rs = str((props.get('render') or props.get('data') or '')).lower()
            if any(k in rs for k in ['quiz', 'poll', 'question', 'slider', 'timeline', 'decision']):
                w, h = _size(c)
                w = max(600, min(w or 0, 1760)) or 1200
                _set_size(c, w, h or 600)
                if not text_heavy:
                    _set_pos(c, _center_x_for_width(w))

        for c in heavy:
            w, h = _size(c)
            target_w = min(max(600, w or 880), 880)
            if left_text is not None:
                _set_size(c, target_w, h)
                _set_pos(c, 960)
            elif right_text is not None:
                _set_size(c, target_w, h)
                _set_pos(c, 80)

    def _apply_theme_structural_layout(self, slide_data: Dict[str, Any], context: SlideGenerationContext, theme_structure: Dict[str, Any]) -> None:
        """Apply theme-driven placement for header elements (title, subtitle, logo, slide number).

        Uses theme_structure.positioning.content_area when present to align x/width and compute vertical flow.
        Falls back to sane defaults when missing.
        """
        if not isinstance(theme_structure, dict):
            return

        positioning = theme_structure.get('positioning', {}) or {}
        content_area = positioning.get('content_area', {}) or {}

        cx = int(content_area.get('x', 80) or 80)
        cy = int(content_area.get('y', 220) or 220)
        cw = int(content_area.get('width', 1760) or 1760)
        # Title should typically sit above content area. Use a safe top band baseline.
        # If content area is very low, keep title near the top; never below 220.
        title_y_default = 96 if cy >= 180 else max(60, min(160, cy - 120))

        elements: List[str] = []
        try:
            elements = list(theme_structure.get('elements_to_include', []) or [])
            logger.info(f"Theme structure elements_to_include: {elements}")
        except Exception as e:
            logger.warning(f"Failed to get elements_to_include: {e}")
            elements = []

        components: List[Dict[str, Any]] = slide_data.get('components', []) or []

        # Helper to read text content and font size
        def _first_text_and_size(comp: Dict[str, Any]) -> Tuple[str, int]:
            props = comp.get('props', {}) or {}
            # texts array preferred
            texts_arr = props.get('texts') or []
            if isinstance(texts_arr, list) and texts_arr:
                t0 = texts_arr[0] if isinstance(texts_arr[0], dict) else {}
                return str(t0.get('text', '') or ''), int((t0.get('fontSize') or props.get('fontSize') or 0) or 0)
            # fallback
            return str(props.get('text', '') or ''), int((props.get('fontSize') or 0) or 0)

        # Identify title/subtitle candidates
        title_idx = None
        subtitle_idx = None
        largest_size = -1

        for i, comp in enumerate(components):
            if comp.get('type') not in {'TiptapTextBlock', 'TextBlock', 'Title', 'Subtitle'}:
                continue
            props = comp.get('props', {}) or {}
            meta = props.get('metadata') or {}
            role = str(meta.get('role', '') or '').lower()
            text_val, size_val = _first_text_and_size(comp)

            if role == 'title' or comp.get('type') == 'Title':
                title_idx = i
                largest_size = max(largest_size, size_val or 0)
                continue
            if role == 'subtitle' or comp.get('type') == 'Subtitle':
                if subtitle_idx is None:
                    subtitle_idx = i
                continue

            # Heuristic: largest text block is likely title when no explicit role
            if title_idx is None and (size_val or 0) > largest_size:
                title_idx = i
                largest_size = size_val or 0

        # Place title
        last_header_bottom = title_y_default
        if title_idx is not None:
            t_comp = components[title_idx]
            t_props = t_comp.setdefault('props', {})
            t_pos = t_props.setdefault('position', {})
            t_props['width'] = cw
            t_pos['x'] = cx
            # Keep existing height if available; fallback to estimated 100
            t_height = int(t_props.get('height', 0) or 100)
            # Respect existing title y when present but clamp to a top header band
            existing_y = t_pos.get('y')
            if isinstance(existing_y, (int, float)) and existing_y > 0:
                t_pos['y'] = int(max(60, min(existing_y, 200)))
            else:
                t_pos['y'] = title_y_default
            last_header_bottom = title_y_default + t_height
            # Add role metadata to stabilize downstream logic
            t_meta = t_props.setdefault('metadata', {})
            if not t_meta.get('role'):
                t_meta['role'] = 'title'
            t_comp['props'] = t_props

            # Ensure title text is never underlined
            try:
                if t_comp.get('type') == 'TiptapTextBlock':
                    texts_arr = t_props.get('texts') or []
                    if isinstance(texts_arr, list):
                        for seg in texts_arr:
                            if isinstance(seg, dict):
                                style = seg.get('style') if isinstance(seg.get('style'), dict) else {}
                                style['underline'] = False
                                seg['style'] = style
                        t_props['texts'] = texts_arr
                        t_comp['props'] = t_props
            except Exception:
                pass

        # Place subtitle relative to title if requested in theme
        sub_conf = (positioning.get('subtitle') or {}) if isinstance(positioning, dict) else {}
        gap_below_title = int((sub_conf.get('gap_below_title') if isinstance(sub_conf, dict) else 0) or 30)
        if subtitle_idx is not None and title_idx is not None:
            s_comp = components[subtitle_idx]
            s_props = s_comp.setdefault('props', {})
            s_pos = s_props.setdefault('position', {})
            s_props['width'] = cw
            s_pos['x'] = cx
            s_height = int(s_props.get('height', 0) or 60)
            s_pos['y'] = last_header_bottom + gap_below_title
            last_header_bottom = s_pos['y'] + s_height
            s_meta = s_props.setdefault('metadata', {})
            if not s_meta.get('role'):
                s_meta['role'] = 'subtitle'
            s_comp['props'] = s_props

        # Apply theme logo positioning if specified
        if 'logo' in elements:
            logo_positioning = positioning.get('logo', {}) or {}
            if isinstance(logo_positioning, dict) and logo_positioning:
                logo_comp = self._find_or_create_logo_component(components, logo_positioning)
                if logo_comp:
                    logo_props = logo_comp.setdefault('props', {})
                    logo_pos = logo_props.setdefault('position', {})
                    
                    # Apply theme-specified logo position
                    if 'position' in logo_positioning:
                        pos_config = logo_positioning['position']
                        logo_pos['x'] = int(pos_config.get('x', 120) or 120)
                        logo_pos['y'] = int(pos_config.get('y', 1010) or 1010)
                    
                    # Apply theme-specified logo size with safer defaults that are a bit larger
                    # and avoid elongated boxes for square logos
                    if 'size' in logo_positioning:
                        size_config = logo_positioning['size']
                        default_w = 180
                        default_h = 60
                        # If theme passed aspect hint, honor it
                        aspect_hint = (logo_positioning.get('aspect') or '').strip().lower() if isinstance(logo_positioning.get('aspect'), str) else None
                        if aspect_hint == 'square':
                            default_w = 130
                            default_h = 130
                        logo_props['width'] = int(size_config.get('width', default_w) or default_w)
                        logo_props['height'] = int(size_config.get('height', default_h) or default_h)
                    
                    # Apply theme-specified logo source
                    if 'src' in logo_positioning:
                        logo_props['src'] = logo_positioning['src']
                        
                    logger.info(f"Applied theme logo positioning: {logo_pos}")

        # Apply theme slide number positioning if specified
        if 'slide_number' in elements:
            slide_num_positioning = positioning.get('slide_number', {}) or {}
            if isinstance(slide_num_positioning, dict) and slide_num_positioning:
                slide_num_comp = self._find_or_create_slide_number_component(components, slide_num_positioning, context)
                if slide_num_comp:
                    slide_num_props = slide_num_comp.setdefault('props', {})
                    slide_num_pos = slide_num_props.setdefault('position', {})
                    
                    # Apply theme-specified slide number position  
                    if 'position' in slide_num_positioning:
                        pos_config = slide_num_positioning['position']
                        slide_num_pos['x'] = int(pos_config.get('x', 80) or 80)
                        slide_num_pos['y'] = int(pos_config.get('y', 1020) or 1020)
                    
                    # Apply theme-specified slide number text and style
                    if 'text' in slide_num_positioning:
                        slide_num_props['text'] = slide_num_positioning['text']
                    
                    if 'style' in slide_num_positioning:
                        style_config = slide_num_positioning['style']
                        slide_num_props['fontSize'] = int(style_config.get('fontSize', 20) or 20)
                        slide_num_props['opacity'] = float(style_config.get('opacity', 0.6) or 0.6)
                        
                    logger.info(f"Applied theme slide number positioning: {slide_num_pos}")

        # Apply sources footer positioning — always bottom-left if present/requested
        try:
            need_sources = ('sources' in elements)
            if not need_sources:
                # Detect existing sources component by metadata role
                for comp in components:
                    meta = ((comp.get('props') or {}).get('metadata') or {})
                    if str(meta.get('role', '') or '').lower() in {'sources', 'citations'}:
                        need_sources = True
                        break

            if need_sources:
                CANVAS_H = 1080
                EDGE = 80
                sources_positioning = positioning.get('sources', {}) or {}
                sources_comp = self._find_or_create_sources_component(components, sources_positioning, context)
                if sources_comp:
                    s_props = sources_comp.setdefault('props', {})
                    s_pos = s_props.setdefault('position', {})
                    # Width and height defaults
                    s_width = int((sources_positioning.get('width') or 1680) or 1680)
                    s_height = int((sources_positioning.get('height') or 40) or 40)
                    s_props['width'] = s_width
                    s_props['height'] = s_height
                    # Style defaults
                    style_conf = (sources_positioning.get('style') or {}) if isinstance(sources_positioning, dict) else {}
                    s_props['fontSize'] = int(style_conf.get('fontSize', s_props.get('fontSize', 18)) or 18)
                    try:
                        s_props['opacity'] = float(style_conf.get('opacity', s_props.get('opacity', 0.7)) or 0.7)
                    except Exception:
                        s_props['opacity'] = 0.7
                    # Position: bottom-left; prefer theme explicit position when provided
                    pos_conf = (sources_positioning.get('position') or {}) if isinstance(sources_positioning, dict) else {}
                    if isinstance(pos_conf, dict) and pos_conf:
                        s_pos['x'] = int(pos_conf.get('x', 80) or 80)
                        s_pos['y'] = int(pos_conf.get('y', CANVAS_H - EDGE - s_height) or (CANVAS_H - EDGE - s_height))
                    else:
                        s_pos['x'] = cx if isinstance(cx, int) else 80
                        s_pos['y'] = CANVAS_H - EDGE - s_height
                    # Ensure role metadata
                    s_meta = s_props.setdefault('metadata', {})
                    s_meta['role'] = 'sources'
                    sources_comp['props'] = s_props
                    logger.info(f"Applied sources footer positioning: {s_pos}")
        except Exception as e:
            logger.warning(f"Failed to apply sources footer positioning: {e}")


        slide_data['components'] = components
    
    def _find_or_create_logo_component(self, components: List[Dict[str, Any]], logo_positioning: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Find existing logo component or create new one based on theme positioning."""
        # First, try to find existing logo component
        for comp in components:
            if comp.get('type') == 'Image':
                props = comp.get('props', {})
                metadata = props.get('metadata', {})
                alt_text = str(props.get('alt', '')).lower()
                kind = str(metadata.get('kind', '')).lower()
                
                if alt_text == 'logo' or kind == 'logo' or 'logo' in alt_text:
                    return comp
        
        # If no existing logo found and theme specifies a logo src, create one
        if 'src' in logo_positioning:
            new_logo_comp = {
                'type': 'Image',
                'id': f'logo-{uuid.uuid4()}',
                'props': {
                    'src': logo_positioning['src'],
                    'alt': 'logo',
                    'objectFit': 'contain',
                    'metadata': {'kind': 'logo', 'role': 'logo'}
                }
            }
            components.append(new_logo_comp)
            return new_logo_comp
            
        return None
    
    def _inject_intelligent_logo(self, slide_data: Dict[str, Any], slide_info: Dict[str, Any], theme: Dict[str, Any]) -> Dict[str, Any]:
        """Intelligently inject logo based on slide type and context if AI didn't create one."""
        
        try:
            # Get logo URL from theme
            logo_url = None
            if theme:
                logo_url = theme.get('metadata', {}).get('logo_url')
                if not logo_url:
                    # Try alternative paths
                    style_prefs = theme.get('stylePreferences', {})
                    if style_prefs:
                        logo_url = style_prefs.get('logoUrl')
            
            if not logo_url:
                logger.debug("[INTELLIGENT LOGO] No logo URL found in theme")
                return slide_data
            
            # Check if logo component already exists
            components = slide_data.get('components', [])
            has_logo = False
            for comp in components:
                if comp.get('type') == 'Image':
                    props = comp.get('props', {})
                    metadata = props.get('metadata', {})
                    alt_text = str(props.get('alt', '')).lower()
                    kind = str(metadata.get('kind', '')).lower()
                    src = props.get('src', '')
                    
                    if (alt_text == 'logo' or kind == 'logo' or 'logo' in alt_text or 
                        ('brandfetch.io' in src and 'logo' in src)):
                        has_logo = True
                        logger.info(f"[INTELLIGENT LOGO] Logo component already exists in slide")
                        break
            
            if has_logo:
                return slide_data
            
            # Determine if this slide should have a logo based on intelligent theming
            slide_type = slide_info.get('type', 'content').lower()
            slide_title = slide_info.get('title', '').lower()
            
            # Intelligence rules based on user requirements
            should_add_logo = True
            logo_position = {'x': 1650, 'y': 60}
            logo_size = {'width': 180, 'height': 60}  # larger default per new policy
            # Determine aspect from theme metadata if available
            theme_meta = (theme.get('color_palette', {}).get('metadata') if isinstance(theme, dict) else {}) or {}
            brand_info = theme.get('brandInfo', {}) if isinstance(theme, dict) else {}
            logo_aspect = (brand_info.get('logoAspect') or theme_meta.get('logo_aspect') or '').strip().lower()
            
            if 'title' in slide_type or slide_info.get('slide_number', 0) == 0:
                # Title slides: Optional small logo in corner
                logo_position = {'x': 1600, 'y': 80}
                if logo_aspect == 'square':
                    logo_size = {'width': 140, 'height': 140}
                else:
                    logo_size = {'width': 240, 'height': 80}
            elif any(keyword in slide_title for keyword in ['statistic', 'data', 'number', 'revenue', 'performance']):
                # Statistics slides: Small logo, let numbers be the hero
                logo_position = {'x': 1700, 'y': 950}
                if logo_aspect == 'square':
                    logo_size = {'width': 100, 'height': 100}
                else:
                    logo_size = {'width': 130, 'height': 44}
            elif 'conclusion' in slide_type or any(keyword in slide_title for keyword in ['conclusion', 'summary', 'thank', 'contact']):
                # Conclusion slides: Larger logo near call-to-action
                logo_position = {'x': 1550, 'y': 80}
                if logo_aspect == 'square':
                    logo_size = {'width': 150, 'height': 150}
                else:
                    logo_size = {'width': 260, 'height': 90}
            elif any(keyword in slide_title for keyword in ['process', 'step', 'how']):
                # Process slides: Small logo only
                logo_position = {'x': 1650, 'y': 60}
                if logo_aspect == 'square':
                    logo_size = {'width': 110, 'height': 110}
                else:
                    logo_size = {'width': 140, 'height': 46}
            else:
                # Content slides: Micro logo in header
                logo_position = {'x': 1650, 'y': 60}
                if logo_aspect == 'square':
                    logo_size = {'width': 120, 'height': 120}
                else:
                    logo_size = {'width': 180, 'height': 60}
            
            if should_add_logo:
                # Create intelligent logo component
                logo_component = {
                    'type': 'Image',
                    'id': f'logo-intelligent-{uuid.uuid4().hex[:8]}',
                    'props': {
                        'src': logo_url,
                        'alt': 'Brand Logo',
                        'objectFit': 'contain',
                        'position': logo_position,
                        'width': logo_size['width'],
                        'height': logo_size['height'],
                        'opacity': 0.9,
                        'zIndex': 10,
                        'metadata': {
                            'kind': 'logo',
                            'role': 'brand_logo',
                            'intelligent_placement': True
                        }
                    }
                }
                
                components.append(logo_component)
                slide_data['components'] = components
                
                logger.info(f"[INTELLIGENT LOGO] Added logo component to {slide_type} slide at {logo_position}")
            
            return slide_data
            
        except Exception as e:
            logger.error(f"[INTELLIGENT LOGO] Error injecting logo: {e}")
            return slide_data
    
    def _find_or_create_slide_number_component(self, components: List[Dict[str, Any]], slide_num_positioning: Dict[str, Any], context: SlideGenerationContext) -> Optional[Dict[str, Any]]:
        """Find existing slide number component or create new one based on theme positioning."""
        # First, try to find existing slide number component
        for comp in components:
            if comp.get('type') in ['TextBlock', 'TiptapTextBlock']:
                props = comp.get('props', {})
                metadata = props.get('metadata', {})
                role = str(metadata.get('role', '')).lower()
                text = str(props.get('text', ''))
                
                if role == 'slide_number' or role == 'slidenumber':
                    return comp
                
                # Check if text looks like a slide number
                if text.isdigit() or (len(text) <= 3 and any(c.isdigit() for c in text)):
                    # This might be a slide number, update its metadata
                    metadata['role'] = 'slide_number'
                    props['metadata'] = metadata
                    return comp
        
        # If no existing slide number found, create one
        slide_number_text = slide_num_positioning.get('text', f"{context.slide_index + 1:02d}")
        new_slide_num_comp = {
            'type': 'TextBlock',
            'id': f'slide-number-{uuid.uuid4()}',
            'props': {
                'text': slide_number_text,
                'metadata': {'role': 'slide_number'},
                'fontSize': 20,
                'opacity': 0.6
            }
        }
        components.append(new_slide_num_comp)
        return new_slide_num_comp
    
    def _find_or_create_sources_component(self, components: List[Dict[str, Any]], sources_positioning: Dict[str, Any], context: SlideGenerationContext) -> Optional[Dict[str, Any]]:
        """Find existing sources component or create new one based on theme positioning."""
        # First, try to find existing sources component (any type) and coerce to text
        for comp in components:
            props = comp.get('props', {}) or {}
            metadata = props.get('metadata', {}) or {}
            role = str(metadata.get('role', '')).lower()
            text_val = str(props.get('text', '')).strip()

            looks_like_sources = False
            try:
                low = text_val.lower()
                if (low.startswith('[') and any(c.isdigit() for c in low[:5])) or low.startswith('sources:'):
                    looks_like_sources = True
            except Exception:
                looks_like_sources = False

            if role in {'sources', 'citations'} or looks_like_sources:
                # Ensure text component type
                if comp.get('type') not in ['TextBlock', 'TiptapTextBlock']:
                    # Coerce to TextBlock with safe defaults
                    comp['type'] = 'TextBlock'
                    if not text_val:
                        comp.setdefault('props', {})['text'] = 'Sources: [1][2][3]'
                # Ensure metadata role
                comp.setdefault('props', {}).setdefault('metadata', {})['role'] = 'sources'
                # Ensure minimal styling defaults
                p = comp.setdefault('props', {})
                if 'fontSize' not in p:
                    p['fontSize'] = int((sources_positioning.get('style', {}) or {}).get('fontSize', 18) or 18)
                if 'opacity' not in p:
                    try:
                        p['opacity'] = float((sources_positioning.get('style', {}) or {}).get('opacity', 0.7) or 0.7)
                    except Exception:
                        p['opacity'] = 0.7
                return comp
        
        # If no existing sources found, create one (empty placeholder for now)
        sources_text = "Sources: [1][2][3]"
        new_sources_comp = {
            'type': 'TextBlock',
            'id': f'sources-{uuid.uuid4()}',
            'props': {
                'text': sources_text,
                'metadata': {'role': 'sources'},
                'fontSize': 18,
                'opacity': 0.7
            }
        }
        components.append(new_sources_comp)
        return new_sources_comp

    def _normalize_dividers_and_lines(self, slide_data: Dict[str, Any], theme_structure: Dict[str, Any]) -> None:
        """Ensure Lines components follow theme rules and are correctly positioned as dividers.

        - Convert any line using position/width/height to startPoint/endPoint.
        - If theme requests a divider_line, ensure one exists directly below the header with proper gap.
        - Align divider to content_area width when present.
        """
        components: List[Dict[str, Any]] = slide_data.get('components', []) or []
        if not components:
            return

        posn = (theme_structure.get('positioning') or {}) if isinstance(theme_structure, dict) else {}
        logger.info(f"_normalize_dividers_and_lines called with {len(components)} components")
        styling = (theme_structure.get('styling') or {}) if isinstance(theme_structure, dict) else {}
        style_colors = (styling.get('colors') or {}) if isinstance(styling, dict) else {}
        theme_divider_color = style_colors.get('divider_color') if isinstance(style_colors, dict) else None
        ca = (posn.get('content_area') or {}) if isinstance(posn, dict) else {}
        cx = int(ca.get('x', 80) or 80)
        cy = int(ca.get('y', 220) or 220)
        cw = int(ca.get('width', 1760) or 1760)

        # Find header bottom from components (title/subtitle)
        header_bottom = 0
        for comp in components:
            if comp.get('type') not in {'TiptapTextBlock', 'TextBlock', 'Title', 'Subtitle'}:
                continue
            props = comp.get('props', {}) or {}
            meta = props.get('metadata') or {}
            role = str(meta.get('role', '') or '').lower()
            if role in {'title', 'subtitle'} or comp.get('type') in {'Title', 'Subtitle'}:
                pos = props.get('position') or {}
                y = int((pos.get('y') or 0) or 0)
                h = int((props.get('height') or 0) or 0)
                # If height is missing, estimate from present font sizes
                if h <= 0:
                    est = 0
                    try:
                        if comp.get('type') == 'TiptapTextBlock':
                            texts = props.get('texts') or []
                            if isinstance(texts, list) and texts:
                                max_size = max((int(t.get('fontSize') or 0) for t in texts if isinstance(t, dict)), default=0)
                                # Assume ~1.2 line-height and at least one line
                                est = int(max(60, max_size * 1.2))
                        else:
                            fs = int(props.get('fontSize') or 0)
                            est = int(max(60, fs * 1.2)) if fs > 0 else 100
                    except Exception:
                        est = 100
                    h = est
                header_bottom = max(header_bottom, y + h)

        # Transform existing Lines to use startPoint/endPoint
        for comp in components:
            if comp.get('type') != 'Lines':
                continue
            props = comp.setdefault('props', {})
            sp = props.get('startPoint')
            ep = props.get('endPoint')
            if not (isinstance(sp, dict) and isinstance(ep, dict)):
                # Try converting from position/width/height for horizontal lines
                pos = props.get('position') or {}
                width = int((props.get('width') or 0) or 0)
                height = int((props.get('height') or 0) or 0)
                x = int((pos.get('x') or 0) or 0)
                y = int((pos.get('y') or 0) or 0)
                if width > 0:
                    y_line = y + max(1, height) // 2
                    props['startPoint'] = {'x': x, 'y': y_line}
                    props['endPoint'] = {'x': x + width, 'y': y_line}
                    # Remove ambiguous properties to avoid confusion downstream
                    for k in ('position', 'width', 'height'):
                        if k in props:
                            try:
                                del props[k]
                            except Exception:
                                pass
                    comp['props'] = props

        requests_divider = False
        try:
            # Check if theme explicitly includes divider_line in elements_to_include
            elements_to_include = (theme_structure.get('elements_to_include') or []) if isinstance(theme_structure, dict) else []
            logger.info(f"Checking divider_line in elements_to_include: {elements_to_include}")
            if 'divider_line' in elements_to_include:
                requests_divider = True
                logger.info(f"✅ Theme requests divider line for slide")
            else:
                logger.info(f"❌ Theme does NOT request divider line for slide (elements: {elements_to_include})")
        except Exception as e:
            logger.warning(f"Error checking divider_line: {e}")
            requests_divider = False

        # If divider requested, ensure one exists and is placed correctly below header
        if requests_divider:
            divider = None
            for comp in components:
                if comp.get('type') != 'Lines':
                    continue
                meta = (comp.get('props', {}) or {}).get('metadata') or {}
                if str(meta.get('role', '') or '').lower() == 'divider':
                    divider = comp
                    break

            # Detect any near-title lines (likely underlines) and repurpose the first one as the divider
            def _line_y(c: Dict[str, Any]) -> int:
                try:
                    p = c.get('props', {}) or {}
                    sp = p.get('startPoint') or {}
                    ep = p.get('endPoint') or {}
                    y1 = int(sp.get('y', 0) or 0)
                    y2 = int(ep.get('y', 0) or 0)
                    return int((y1 + y2) / 2)
                except Exception:
                    return 0

            near_title_lines: List[Dict[str, Any]] = []
            for comp in components:
                if comp.get('type') != 'Lines':
                    continue
                props = comp.get('props', {}) or {}
                sp = props.get('startPoint')
                ep = props.get('endPoint')
                if not (isinstance(sp, dict) and isinstance(ep, dict)):
                    continue
                # Only consider plain horizontal lines (no arrowheads) that sit very close to the title bottom
                start_shape = str(props.get('startShape', 'none') or 'none').lower()
                end_shape = str(props.get('endShape', 'none') or 'none').lower()
                if start_shape != 'none' or end_shape != 'none':
                    continue
                y_line = _line_y(comp)
                if y_line <= header_bottom + 24:
                    near_title_lines.append(comp)

            # Prefer reusing an existing near-title line as divider if none explicitly marked
            if divider is None and near_title_lines:
                divider = near_title_lines[0]

            if divider is None:
                divider = {
                    'type': 'Lines',
                    'props': {
                        'startPoint': {'x': cx, 'y': cy - 20},
                        'endPoint': {'x': cx + cw, 'y': cy - 20},
                        # Do not hardcode stroke; theme will be applied below or by ThemeAdapter later
                        'strokeWidth': int((posn.get('divider_line') or {}).get('stroke_width', 2) if isinstance(posn.get('divider_line'), dict) else 2),
                        'metadata': {'role': 'divider'}
                    }
                }
                components.append(divider)

            # Use theme-specified divider position if available, otherwise compute
            props = divider.setdefault('props', {})
            div_conf = (posn.get('divider_line') or {}) if isinstance(posn, dict) else {}
            
            if isinstance(div_conf, dict) and 'startPoint' in div_conf and 'endPoint' in div_conf:
                # Use exact theme positioning
                theme_start = div_conf['startPoint']
                theme_end = div_conf['endPoint']
                if isinstance(theme_start, dict) and isinstance(theme_end, dict):
                    props['startPoint'] = {
                        'x': int(theme_start.get('x', cx) or cx),
                        'y': int(theme_start.get('y', cy - 20) or cy - 20)
                    }
                    props['endPoint'] = {
                        'x': int(theme_end.get('x', cx + cw) or cx + cw),
                        'y': int(theme_end.get('y', cy - 20) or cy - 20)
                    }
                    logger.info(f"Applied theme divider positioning: {props['startPoint']} to {props['endPoint']}")
                else:
                    # Fallback: compute target Y
                    min_gap = 40
                    target_y = max(header_bottom + min_gap, cy - 20)
                    props['startPoint'] = {'x': cx, 'y': target_y}
                    props['endPoint'] = {'x': cx + cw, 'y': target_y}
            else:
                # Fallback: compute target Y  
                min_gap = 40
                target_y = max(header_bottom + min_gap, cy - 20)
                props['startPoint'] = {'x': cx, 'y': target_y}
                props['endPoint'] = {'x': cx + cw, 'y': target_y}
            # Apply theme stroke/opacity when provided
            div_conf = (posn.get('divider_line') or {}) if isinstance(posn, dict) else {}
            if isinstance(div_conf, dict):
                if 'stroke_width' in div_conf:
                    try:
                        props['strokeWidth'] = int(div_conf.get('stroke_width') or 2)
                    except Exception:
                        props['strokeWidth'] = 2
                if 'opacity' in div_conf:
                    props['opacity'] = float(div_conf.get('opacity') or 0.3)
            # Use smart line color resolution for proper theming
            try:
                # Try theme structure color first
                if isinstance(theme_divider_color, str) and theme_divider_color:
                    props['stroke'] = theme_divider_color
                else:
                    # Use smart color resolution as fallback
                    from agents.generation.components.smart_line_styler import SmartLineStyler
                    line_styler = SmartLineStyler()
                    
                    # Create style config from positioning data
                    style_config = {
                        'theme_colors': div_conf.get('theme_colors', {}),
                        'color_priority': div_conf.get('color_priority', ['accent_1'])
                    }
                    
                    # Resolve color using smart styler
                    resolved_color = line_styler.resolve_line_color(style_config, fallback_color='#2563EB')
                    props['stroke'] = resolved_color
            except Exception as e:
                # Final fallback to blue instead of leaving unset
                logger.warning(f"Line color resolution failed: {e}, using blue fallback")
                props['stroke'] = '#2563EB'
            meta = props.setdefault('metadata', {})
            meta['role'] = 'divider'
            divider['props'] = props

            # Remove any extra lines to avoid duplicates
            # Keep only the designated divider line
            try:
                new_components: List[Dict[str, Any]] = []
                divider_added = False
                
                for c in components:
                    if c.get('type') != 'Lines':
                        new_components.append(c)
                        continue
                    
                    # Check if this is a horizontal line (potential divider)
                    props = c.get('props', {}) or {}
                    sp = props.get('startPoint', {})
                    ep = props.get('endPoint', {})
                    
                    # Skip if not a horizontal line
                    if not (isinstance(sp, dict) and isinstance(ep, dict)):
                        new_components.append(c)
                        continue
                    
                    # Check if it's a plain horizontal line (no arrows)
                    start_shape = str(props.get('startShape', 'none') or 'none').lower()
                    end_shape = str(props.get('endShape', 'none') or 'none').lower()
                    is_horizontal = abs(sp.get('y', 0) - ep.get('y', 0)) < 5
                    is_plain = start_shape == 'none' and end_shape == 'none'
                    
                    # If it's a horizontal divider-like line
                    if is_horizontal and is_plain:
                        # Only keep the first divider we've designated
                        if c is divider and not divider_added:
                            new_components.append(c)
                            divider_added = True
                        # Skip all other horizontal lines near the header
                        elif _line_y(c) <= header_bottom + 60:
                            logger.info(f"Removing duplicate divider line at y={_line_y(c)}")
                            continue
                        else:
                            # Keep lines that are further down (might be content separators)
                            new_components.append(c)
                    else:
                        # Keep non-divider lines (arrows, connectors, etc.)
                        new_components.append(c)
                
                components = new_components
            except Exception as e:
                logger.warning(f"Error removing duplicate lines: {e}")
        else:
            # No divider requested: remove any near-title lines (title underlines)
            try:
                def _line_y_rm(c: Dict[str, Any]) -> int:
                    try:
                        p = c.get('props', {}) or {}
                        sp = p.get('startPoint') or {}
                        return int(sp.get('y', 0) or 0)
                    except Exception:
                        return 0
                pruned: List[Dict[str, Any]] = []
                for c in components:
                    if c.get('type') != 'Lines':
                        pruned.append(c)
                        continue
                    p = c.get('props', {}) or {}
                    sp = p.get('startPoint')
                    ep = p.get('endPoint')
                    start_shape = str(p.get('startShape', 'none') or 'none').lower()
                    end_shape = str(p.get('endShape', 'none') or 'none').lower()
                    is_plain = (start_shape == 'none' and end_shape == 'none')
                    if (isinstance(sp, dict) and isinstance(ep, dict)) and is_plain:
                        y_line = _line_y_rm(c)
                        if y_line <= header_bottom + 24:
                            # Drop this underline
                            continue
                    pruned.append(c)
                components = pruned
            except Exception:
                pass

        slide_data['components'] = components

    def _clamp_text_blocks_to_content_area(self, slide_data: Dict[str, Any], theme_structure: Dict[str, Any]) -> None:
        return

    def _enforce_icon_text_adjacency(self, slide_data: Dict[str, Any]) -> None:
        """Anchor Icon components to sit next to their nearest text block and mark them as paired.

        Rules:
        - Prefer icons adjacent to list-like text (bullets/labels/steps) with a 16–20px gap.
        - Support both left and right adjacency based on metadata or current relative position.
        - Icon vertical position should align with the associated text block region when paired.
        - If multiple icons map to the same text block, stack them with 36px spacing starting at text top.
        - Add pairing metadata so subsequent edits can preserve adjacency.
        - Do NOT force adjacency for non-list layouts (pull quotes, hero stats, sidebars, card grids) unless
          metadata explicitly opts in.
        """
        try:
            components: List[Dict[str, Any]] = slide_data.get('components', []) or []
            if not components:
                return

            # Separate icons and text blocks
            icon_indices: List[int] = [i for i, c in enumerate(components) if c.get('type') == 'Icon']
            text_indices: List[int] = [i for i, c in enumerate(components) if c.get('type') in {'TiptapTextBlock', 'TextBlock'}]
            if not icon_indices or not text_indices:
                return

            # Helper to read position safely (use center of text for vertical anchor)
            def _pos(comp: Dict[str, Any]) -> Tuple[int, int]:
                p = (comp.get('props') or {})
                pos = p.get('position') or {}
                x = int((pos.get('x') or 0) or 0)
                y = int((pos.get('y') or 0) or 0)
                # For text, prefer center-y (already stored). For icons (top-left), approximate center using size
                if comp.get('type') == 'Icon':
                    size = int((p.get('size') or p.get('height') or 24) or 24)
                    y = y + size // 2
                return x, y

            # Compute map from icon idx -> best text idx by vertical proximity
            def _distance_score(ix: int, tx: int) -> int:
                _, iy = _pos(components[ix])
                _, ty = _pos(components[tx])
                return abs(iy - ty)

            # Build a mapping from target text id to icons to place beside it
            text_to_icons: Dict[str, List[int]] = {}
            for ii in icon_indices:
                # Choose text with smallest vertical distance
                best_ti = min(text_indices, key=lambda ti: _distance_score(ii, ti))
                text_comp = components[best_ti]
                text_id = text_comp.get('id') or str(best_ti)
                text_to_icons.setdefault(text_id, []).append(ii)

            # Slide canvas and margins
            CANVAS_W, CANVAS_H = 1920, 1080
            MARGIN = 80
            GAP = 20

            # Helper to decide whether an icon should pair with a text block and which side
            def _should_pair_with_text(icon_comp: Dict[str, Any], text_comp: Dict[str, Any], tx: int, ty: int, theight: int, twidth: int) -> tuple[bool, str]:
                try:
                    iprops = icon_comp.get('props', {}) or {}
                    imeta = iprops.get('metadata', {}) or {}
                    tprops = text_comp.get('props', {}) or {}
                    tmeta = tprops.get('metadata', {}) or {}

                    # Explicit opt-out
                    if str(imeta.get('pairing', '') or '').lower() in {'none', 'off'} or bool(imeta.get('decorative', False)):
                        return (False, 'left')
                    if str(tmeta.get('acceptIconAdjacency', '') or '').lower() in {'false', 'no'}:
                        return (False, 'left')

                    # Explicit opt-in or explicit target
                    if bool(imeta.get('forceAdjacency', False)) or bool(tmeta.get('forceIconAdjacency', False)):
                        side = str(imeta.get('placement', '') or '').lower()
                        side = side if side in {'left', 'right'} else 'left'
                        return (True, side)
                    if str(imeta.get('pairedTextId', '') or '') == (text_comp.get('id') or ''):
                        side = str(imeta.get('placement', '') or '').lower()
                        side = side if side in {'left', 'right'} else 'left'
                        return (True, side)

                    # Text role suggests list-like content
                    role = str((tmeta.get('role', '') or '')).lower()
                    if role in {'list', 'bullets', 'bullet', 'labels', 'label', 'step', 'steps', 'feature', 'features', 'kpi_list'}:
                        side = str(imeta.get('placement', '') or '').lower()
                        side = side if side in {'left', 'right'} else 'left'
                        return (True, side)

                    # Heuristic: adjacency only when icon is already near the text block region
                    orig_cx, orig_cy = _pos(icon_comp)
                    text_top = ty - (theight // 2)
                    text_bottom = ty + (theight // 2)
                    within_vertical = (text_top - 40) <= orig_cy <= (text_bottom + 40)

                    # Determine side by current relative position and proximity to text edge
                    left_edge_x = tx - (twidth // 2)
                    right_edge_x = tx + (twidth // 2)
                    side = 'left' if orig_cx <= tx else 'right'
                    # Distance threshold from nearest text edge
                    if side == 'left':
                        dx = abs(orig_cx - left_edge_x)
                    else:
                        dx = abs(orig_cx - right_edge_x)
                    near_horizontal = dx <= 400

                    return (within_vertical and near_horizontal, side)
                except Exception:
                    return (False, 'left')

            # Apply placement for each text block group
            for text_id, icon_list in text_to_icons.items():
                # Resolve text component by id
                t_idx = None
                for ti in text_indices:
                    if (components[ti].get('id') or str(ti)) == text_id:
                        t_idx = ti
                        break
                if t_idx is None:
                    continue
                t_comp = components[t_idx]
                t_props = t_comp.setdefault('props', {})
                t_meta = t_props.setdefault('metadata', {})
                t_pos = t_props.setdefault('position', {})
                tx = int((t_pos.get('x') or 0) or 0)
                ty = int((t_pos.get('y') or 0) or 0)
                theight = int((t_props.get('height') or 0) or 120)

                # Sort icons by their current Y to preserve relative order
                icon_list_sorted = sorted(icon_list, key=lambda ii: _pos(components[ii])[1])
                current_y = ty
                for ii in icon_list_sorted:
                    icon_comp = components[ii]
                    iprops = icon_comp.setdefault('props', {})
                    ipos = iprops.setdefault('position', {})
                    imeta = iprops.setdefault('metadata', {})
                    size = int((iprops.get('size') or 24) or 24)

                    # Text width/edges for precise adjacency
                    twidth = int((t_props.get('width') or 600) or 600)
                    left_edge_x = tx - (twidth // 2)
                    right_edge_x = tx + (twidth // 2)

                    # Decide if we should pair and which side
                    should_pair, side = _should_pair_with_text(icon_comp, t_comp, tx, ty, theight, twidth)
                    if not should_pair:
                        # Skip moving this icon; leave its creative placement untouched
                        continue

                    # Compute target X to sit next to text with gap, clamped to margin
                    if side == 'right':
                        target_x = right_edge_x + GAP
                    else:
                        target_x = left_edge_x - size - GAP

                    # Stack vertically near the text region, within text bounds when possible
                    # Align icon vertically relative to the text block region
                    orig_cx, orig_cy = _pos(icon_comp)
                    text_top = ty - (theight // 2)
                    text_bottom = ty + (theight // 2)
                    if text_top <= orig_cy <= text_bottom:
                        rel = orig_cy - text_top
                        target_y = text_top + max(0, min(rel, max(0, theight - size)))
                    else:
                        target_y = ty

                    # Clamp inside canvas
                    target_x = max(MARGIN, min(target_x, CANVAS_W - MARGIN - size))
                    target_y = max(MARGIN, min(target_y, CANVAS_H - MARGIN - size))

                    # Apply width/height for overlap math compatibility in other passes
                    iprops['width'] = size
                    iprops['height'] = size
                    ipos['x'] = int(target_x)
                    ipos['y'] = int(target_y)

                    # Pair metadata to keep them linked
                    icon_id = icon_comp.get('id') or f"icon-{ii}"
                    pair_id = '|'.join(sorted([str(text_id), str(icon_id)]))
                    imeta['pairedTextId'] = str(text_id)
                    imeta['pairId'] = pair_id
                    imeta['placement'] = side
                    # Track on text side as list
                    paired_list = t_meta.setdefault('pairedIconIds', [])
                    if icon_id not in paired_list:
                        paired_list.append(icon_id)
                    t_meta['pairId'] = t_meta.get('pairId') or pair_id

                    # Advance stacking Y relative to text top
                    current_y = ty + max(28, size) + 12  # ~36px row height

                    # Write back
                    icon_comp['props'] = iprops
                t_comp['props'] = t_props

            slide_data['components'] = components
        except Exception:
            # Best-effort only; do not crash generation
            return
    def _should_treat_as_title(self, context: SlideGenerationContext, slide_data: Dict[str, Any]) -> bool:
        """Decide whether the first slide should be treated as a minimal title.

        Heuristics:
        - If title contains explicit markers (title/cover/welcome) → True
        - Else if title has <= 3 words AND content is very short (<= 40 chars) → True
        - Else if there are many text components (>= 2 non-empty blocks) or content length is long → False
        """
        try:
            title = (getattr(context.slide_outline, 'title', '') or '').strip()
            content = (getattr(context.slide_outline, 'content', '') or '').strip()
            title_lower = title.lower()
            if any(k in title_lower for k in ['title', 'cover', 'welcome']):
                return True
            title_word_count = len([w for w in title.split() if w])
            if title_word_count <= 3 and len(content) <= 40:
                return True

            # Inspect generated components: if we already have multiple text blocks with content, keep as content
            components = slide_data.get('components', []) or []
            text_blocks = [c for c in components if c.get('type') == 'TiptapTextBlock']
            non_empty_blocks = 0
            for tb in text_blocks:
                props = tb.get('props', {}) or {}
                if isinstance(props.get('text'), str) and props.get('text').strip():
                    non_empty_blocks += 1
                texts_arr = props.get('texts') or []
                if isinstance(texts_arr, list):
                    if any(isinstance(t.get('text'), str) and t.get('text').strip() for t in texts_arr if isinstance(t, dict)):
                        non_empty_blocks += 1
            if non_empty_blocks >= 2:
                return False

            # Long descriptive title or content → treat as content
            if title_word_count >= 6 or len(content) >= 120:
                return False
        except Exception:
            # Default to safe: treat as content when uncertain
            return False
        # Default: not a strict title
        return False
    
    def _enforce_theme_fonts(self, slide_data: Dict[str, Any], theme: Any):
        """Ensure all text components use theme fonts."""
        # Handle both dict and object themes
        if isinstance(theme, dict):
            typography = theme.get('typography', {})
            color_palette = theme.get('color_palette', {})
        elif hasattr(theme, 'typography'):
            typography = theme.typography
            # Access color palette for enforcement
            color_palette = getattr(theme, 'color_palette', {})
        else:
            # If theme is None or doesn't have typography, use defaults
            logger.warning(f"[FONT ENFORCEMENT] Theme missing or has no typography. Theme type: {type(theme)}")
            typography = {}
            color_palette = {}
        
        hero_font = typography.get('hero_title', {}).get('family', 'Montserrat')
        body_font = typography.get('body_text', {}).get('family', 'Poppins')

        # Normalize font names to title case for validator compatibility
        # e.g., "BEBAS NEUE" -> "Bebas Neue", "POPPINS" -> "Poppins"
        def normalize_font_name(font_name):
            if not font_name:
                return font_name
            # Title case each word, but preserve specific casing patterns
            return ' '.join(word.capitalize() for word in str(font_name).split())

        hero_font = normalize_font_name(hero_font)
        body_font = normalize_font_name(body_font)
        # Colors from palette
        primary_text = color_palette.get('primary_text', '#1A1A1A')
        accent_1 = color_palette.get('accent_1', '#0066CC')
        accent_2 = color_palette.get('accent_2', '#FF6B6B')
        # If a generic database palette is attached to the slide, prefer its accents/text
        try:
            palette = slide_data.get('palette') if isinstance(slide_data, dict) else None
            source = str((palette or {}).get('source', '')).lower() if isinstance(palette, dict) else ''
            if palette and source in ('database', 'palette_db', 'topic match'):
                pal_colors = palette.get('colors') or []
                if isinstance(pal_colors, list) and pal_colors:
                    def _rgb_tuple(hex_str: str):
                        s = str(hex_str).lstrip('#')
                        return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
                    def _colorfulness(hex_str: str) -> float:
                        r, g, b = _rgb_tuple(hex_str)
                        return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
                    def _estimate_brightness(hex_color: str) -> float:
                        try:
                            h = hex_color.lstrip('#')
                            r = int(h[0:2], 16) / 255.0
                            g = int(h[2:4], 16) / 255.0
                            b = int(h[4:6], 16) / 255.0
                            return (0.299 * r + 0.587 * g + 0.114 * b)
                        except Exception:
                            return 0.5
                    def _is_extreme_brightness(hex_str: str) -> bool:
                        try:
                            val = _estimate_brightness(hex_str)
                            return val < 0.12 or val > 0.92
                        except Exception:
                            return False
                    scored = [(
                        _colorfulness(c),
                        -abs(_estimate_brightness(c) - 0.5),
                        c
                    ) for c in pal_colors if isinstance(c, str) and not _is_extreme_brightness(c)]
                    if not scored:
                        scored = [(
                            _colorfulness(c),
                            -abs(_estimate_brightness(c) - 0.5),
                            c
                        ) for c in pal_colors if isinstance(c, str)]
                    scored.sort(reverse=True)
                    if scored:
                        accent_1 = scored[0][2]
                        accent_2 = scored[1][2] if len(scored) > 1 else scored[0][2]
                # Prefer palette-provided readable text color
                tc = palette.get('text_colors') or {}
                if isinstance(tc, dict) and isinstance(tc.get('primary'), str):
                    primary_text = tc['primary']
        except Exception:
            pass
        
        # Log what fonts we're using
        logger.info(f"[FONT ENFORCEMENT] Theme fonts - Hero: {hero_font}, Body: {body_font}")
        
        for component in slide_data.get('components', []):
            if component.get('type') in ('TiptapTextBlock', 'TextBlock', 'Title'):
                props = component.get('props', {})
                current_font = props.get('fontFamily', 'not set')
                
                # Check if it's a title based on position/size
                position_y = props.get('position', {}).get('y') if props.get('position') else None
                is_title = (
                    component.get('type') == 'Title' or
                    (props.get('fontSize') or 0) > 60 or
                    (position_y or 999) < 200
                )
                
                # ALWAYS set the font from theme, don't check for Inter
                new_font = hero_font if is_title else body_font
                if current_font != new_font:
                    logger.info(f"[FONT ENFORCEMENT] Updating font from '{current_font}' to '{new_font}'")
                props['fontFamily'] = new_font
                
                # Ensure padding defaults
                if component.get('type') == 'TiptapTextBlock':
                    props['padding'] = 0
                else:
                    props.setdefault('padding', 16)

                # Provide sensible defaults for rich text styling if missing
                # Small negative tracking for big headings
                if 'letterSpacing' not in props:
                    # If any text is very large, tighten tracking
                    texts = props.get('texts', []) or []
                    try:
                        max_size = max((t.get('fontSize', 0) or 0 for t in texts), default=(props.get('fontSize') or 0) or 0)
                    except Exception:
                        max_size = (props.get('fontSize') or 0) or 0
                    props['letterSpacing'] = -0.02 if (max_size and max_size >= 80) else -0.01
                else:
                    # Coerce letterSpacing to numeric if provided as string
                    ls = props.get('letterSpacing')
                    if isinstance(ls, str):
                        try:
                            if ls.endswith('em'):
                                props['letterSpacing'] = float(ls.replace('em', '').strip())
                            elif ls.endswith('px'):
                                props['letterSpacing'] = float(ls.replace('px', '').strip()) / 16.0
                            else:
                                props['letterSpacing'] = float(ls)
                        except Exception:
                            props['letterSpacing'] = -0.01
                if 'lineHeight' not in props:
                    props['lineHeight'] = 1.1 if is_title else 1.2
                else:
                    # Clamp to a maximum of 1.2 (titles may use smaller values)
                    try:
                        lh_raw = props.get('lineHeight')
                        lh_val = float(str(lh_raw).replace('px', '').replace('em', '').strip()) if isinstance(lh_raw, str) else float(lh_raw)
                        if lh_val > 1.2:
                            props['lineHeight'] = 1.2
                        else:
                            props['lineHeight'] = lh_val
                    except Exception:
                        props['lineHeight'] = 1.2
                if 'textShadow' not in props:
                    props['textShadow'] = '0 4px 24px rgba(0,0,0,0.25)'

                # Enforce palette colors on text segments if colors are missing or default black
                texts = props.get('texts', []) or []
                if texts:
                    # Determine the biggest text segment as emphasis (None-safe)
                    try:
                        max_size = max((t.get('fontSize', 0) or 0 for t in texts), default=(props.get('fontSize') or 0) or 0)
                    except Exception:
                        max_size = (props.get('fontSize') or 0) or 0
                    for t in texts:
                        color = t.get('color')
                        # If missing color or plain black, assign from palette
                        if not color or str(color).lower() in ['#000', '#000000']:
                            if t.get('fontSize', 0) == max_size and accent_1:
                                t['color'] = accent_1
                            else:
                                t['color'] = primary_text
                        # Ensure style maps color for frontend consumption
                        style = t.get('style') if isinstance(t.get('style'), dict) else {}
                        style.setdefault('textColor', t.get('color'))
                        style.setdefault('backgroundColor', '#00000000')
                        t['style'] = style

    def _enforce_theme_consistency(self, slide_data: Dict[str, Any], theme: Any) -> None:
        """Enforce consistent use of the deck theme across key visual components.
        - Background: enforce solid backgroundColor from theme/palette
        - CustomComponent: backfill theme color/font props if missing
        - Icon/Shape: coerce colors to theme accents when off-palette
        """
        try:
            # Normalize theme structure to plain dict
            theme_dict = theme.to_dict() if hasattr(theme, 'to_dict') else (theme if isinstance(theme, dict) else {})
            if not theme_dict:
                return
            colors = theme_dict.get('color_palette', {}) or {}
            typography = theme_dict.get('typography', {}) or {}
            primary_bg = colors.get('primary_background', '#0A0E27')
            secondary_bg = colors.get('secondary_background', '#1A1F3A')
            primary_text = colors.get('primary_text', '#FFFFFF')
            accent_1 = colors.get('accent_1', '#00F0FF')
            accent_2 = colors.get('accent_2', '#FF5722')
            # If a generic database palette is attached, prefer its accents/text for enforcement
            try:
                palette = slide_data.get('palette') if isinstance(slide_data, dict) else None
                source = str((palette or {}).get('source', '')).lower() if isinstance(palette, dict) else ''
                theme_source = str((((theme or {}).get('color_palette') or {}).get('source', ''))).lower() if isinstance(theme, dict) else ''
                # Do not allow DB palettes to override brand-sourced themes
                if palette and source in ('database', 'palette_db', 'topic match') and ('brand' not in theme_source and 'brandfetch' not in theme_source):
                    pal_colors = palette.get('colors') or []
                    if isinstance(pal_colors, list) and pal_colors:
                        def _rgb_tuple(hex_str: str):
                            s = str(hex_str).lstrip('#')
                            return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
                        def _colorfulness(hex_str: str) -> float:
                            r, g, b = _rgb_tuple(hex_str)
                            return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
                        def _estimate_brightness(hex_color: str) -> float:
                            try:
                                h = hex_color.lstrip('#')
                                r = int(h[0:2], 16) / 255.0
                                g = int(h[2:4], 16) / 255.0
                                b = int(h[4:6], 16) / 255.0
                                return (0.299 * r + 0.587 * g + 0.114 * b)
                            except Exception:
                                return 0.5
                        def _is_extreme_brightness(hex_str: str) -> bool:
                            try:
                                val = _estimate_brightness(hex_str)
                                return val < 0.12 or val > 0.92
                            except Exception:
                                return False
                        scored = [(
                            _colorfulness(c),
                            -abs(_estimate_brightness(c) - 0.5),
                            c
                        ) for c in pal_colors if isinstance(c, str) and not _is_extreme_brightness(c)]
                        if not scored:
                            scored = [(
                                _colorfulness(c),
                                -abs(_estimate_brightness(c) - 0.5),
                                c
                            ) for c in pal_colors if isinstance(c, str)]
                        scored.sort(reverse=True)
                        if scored:
                            accent_1 = scored[0][2]
                            accent_2 = scored[1][2] if len(scored) > 1 else scored[0][2]
                    tc = palette.get('text_colors') or {}
                    if isinstance(tc, dict) and isinstance(tc.get('primary'), str):
                        primary_text = tc['primary']
            except Exception:
                pass
            hero_font = (typography.get('hero_title', {}) or {}).get('family', 'Montserrat')

            # Allowable color sets for quick validation
            allowed_text_colors = set(c for c in [primary_text, '#FFFFFF', '#000000'] if isinstance(c, str))
            allowed_fill_colors = set(c for c in [accent_1, accent_2, primary_bg, primary_text] if isinstance(c, str))

            for component in slide_data.get('components', []) or []:
                ctype = component.get('type')
                props = component.get('props', {}) or {}

                # 1) Background: preserve gradients if present, otherwise use theme colors
                if ctype == 'Background':
                    # Only update if not already a gradient
                    if props.get('backgroundType') != 'gradient':
                        # Prefer palette database choice when available for consistency with selected palette
                        page_bg = primary_bg
                        try:
                            palette = slide_data.get('palette') if isinstance(slide_data, dict) else None
                            # Only allow brand-sourced palettes to override theme backgrounds
                            if palette and palette.get('source') in ('brand_database', 'web_scrape'):
                                backgrounds = palette.get('backgrounds') or []
                                if isinstance(backgrounds, list) and backgrounds:
                                    page_bg = backgrounds[0]
                                else:
                                    # Fallback to choosing a light color from colors list
                                    colors_list = palette.get('colors') or []
                                    if colors_list:
                                        def _estimate_brightness(hex_color: str) -> float:
                                            try:
                                                h = hex_color.lstrip('#')
                                                r = int(h[0:2], 16) / 255.0
                                                g = int(h[2:4], 16) / 255.0
                                                b = int(h[4:6], 16) / 255.0
                                                return (0.299 * r + 0.587 * g + 0.114 * b)
                                            except Exception:
                                                return 0.5
                                        page_bg = sorted(colors_list, key=lambda c: _estimate_brightness(c), reverse=True)[0]
                        except Exception:
                            page_bg = primary_bg

                        props['backgroundType'] = 'color'
                        props['backgroundColor'] = page_bg
                    
                    component['props'] = props

                # 2) CustomComponent: inject theme props when missing
                elif ctype == 'CustomComponent':
                    props.setdefault('primaryColor', accent_1)
                    props.setdefault('secondaryColor', accent_2)
                    props.setdefault('textColor', primary_text)
                    props.setdefault('fontFamily', hero_font)
                    component['props'] = props

                # 3) Icon: coerce off-palette colors to accent_1
                elif ctype == 'Icon':
                    color = props.get('color')
                    if not isinstance(color, str) or (color not in allowed_fill_colors and color not in allowed_text_colors):
                        props['color'] = accent_1
                        component['props'] = props

                # 4) Shape: coerce gradient/fill to theme accents
                elif ctype == 'Shape':
                    grad = props.get('gradient')
                    if isinstance(grad, dict):
                        gtype = grad.get('type', 'linear')
                        angle = grad.get('angle', 90)
                        props['gradient'] = {
                            'type': gtype,
                            'angle': angle,
                            'stops': [
                                {'color': accent_1, 'position': 0},
                                {'color': accent_2, 'position': 100}
                            ]
                        }
                        component['props'] = props
                    else:
                        fill = props.get('fill')
                        if not isinstance(fill, str) or fill not in allowed_fill_colors:
                            props['fill'] = accent_1
                            component['props'] = props
        except Exception as e:
            logger.warning(f"[THEME ENFORCEMENT] Skipped due to error: {e}")
        


    def _enhance_title_slide(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        """Enhance the title slide for maximum impact while preserving rich elements.

        Rules enforced:
        - Keep the hero title prominent; allow kicker/subtitle/quote/metadata if present
        - Position hero title centered or off-center based on theme template
        - Make hero title large; metadata small and subtle
        - Use theme fonts (hero for title, body for metadata)
        - Preserve TiptapTextBlocks and Lines; allow ONE small logo image
        """
        try:
            components: List[Dict[str, Any]] = slide_data.get('components', []) or []

            # Resolve theme data
            theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme if isinstance(context.theme, dict) else {})
            colors = (theme_dict or {}).get('color_palette', {}) or {}
            typography = (theme_dict or {}).get('typography', {}) or {}
            slide_templates = (theme_dict or {}).get('slide_templates', {}) or {}

            primary_text = colors.get('primary_text', '#FFFFFF')
            secondary_text = colors.get('secondary_text', '#E0E0E0') or primary_text
            hero_font = (typography.get('hero_title') or {}).get('family', 'Montserrat')
            body_font = (typography.get('body_text') or {}).get('family', 'Poppins')

            # Determine layout preference from theme template
            title_template = (slide_templates.get('title') or {})
            layout_pref = str(title_template.get('layout', 'centered_hero')).lower()
            is_centered = layout_pref == 'centered_hero'

            # Keep only essential background + overlay; collect text blocks
            kept_components: List[Dict[str, Any]] = []
            text_blocks: List[Dict[str, Any]] = []
            line_components: List[Dict[str, Any]] = []
            logo_image: Optional[Dict[str, Any]] = None

            for comp in components:
                ctype = comp.get('type')
                if ctype == 'Background':
                    kept_components.append(comp)
                # Preserve rich text blocks on title
                elif ctype == 'TiptapTextBlock':
                    text_blocks.append(comp)
                # Preserve divider lines if any
                elif ctype == 'Lines':
                    line_components.append(comp)
                elif ctype == 'Image' and logo_image is None:
                    # Keep ONE image as a logo candidate; we'll normalize props later
                    logo_image = comp
                # Drop charts/icons/shapes by default on title (unless Lines)

            # Choose or create hero title block
            def _block_font_size(block: Dict[str, Any]) -> float:
                props = block.get('props', {}) or {}
                size = props.get('fontSize', 0) or 0
                # Consider segment sizes if present
                texts = props.get('texts') or []
                if isinstance(texts, list) and texts:
                    try:
                        size = max(size, max((t.get('fontSize', 0) or 0) for t in texts))
                    except Exception:
                        pass
                return float(size) if isinstance(size, (int, float)) else 0.0

            hero_block: Optional[Dict[str, Any]] = None
            if text_blocks:
                hero_block = max(text_blocks, key=_block_font_size)
            else:
                # Create a new hero block if none exist
                hero_block = {
                    'id': str(uuid.uuid4()),
                    'type': 'TiptapTextBlock',
                    'props': {}
                }

            # Compute hero text content
            deck_title = ''
            try:
                deck_title = str(context.deck_outline.title or '')
            except Exception:
                deck_title = ''
            if not deck_title:
                deck_title = str(context.slide_outline.title or 'Title')

            # Decide hero size based on title length (points) — scale up
            title_len = len(deck_title)
            if title_len <= 10:
                hero_size_pt = 300  # Slide-wide impact for short titles
            elif title_len <= 20:
                hero_size_pt = 250  # Still impactful
            else:
                hero_size_pt = 120  # Standard title size for longer text

            # Layout geometry
            if is_centered:
                hero_position = {'x': 160, 'y': 240}
                hero_width = 1600
                hero_height = 640
                alignment = 'center'
            else:
                hero_position = {'x': 160, 'y': 260}
                hero_width = 1440
                hero_height = 620
                alignment = 'left'

            # Apply hero props (without overwriting existing rich content)
            hero_props = hero_block.setdefault('props', {})
            hero_props.setdefault('position', hero_position)
            hero_props.setdefault('width', hero_width)
            hero_props.setdefault('height', hero_height)
            hero_props.setdefault('alignment', alignment)
            hero_props.setdefault('verticalAlignment', 'middle')
            hero_props.setdefault('fontFamily', hero_font)
            # Only set fontSize if missing; otherwise respect generated sizing
            hero_props.setdefault('fontSize', hero_size_pt)
            hero_props.setdefault('fontWeight', 'bold')
            hero_props.setdefault('lineHeight', 1.05)
            hero_props.setdefault('letterSpacing', -0.02)
            hero_props.setdefault('textColor', primary_text)
            hero_props.setdefault('padding', 0)
            hero_props.setdefault('zIndex', 2)
            # Do NOT override text/texts content set by the generator

            # Build optional metadata: prefer blocks that look like metadata (presenter/org/date), not kickers
            metadata_block: Optional[Dict[str, Any]] = None
            try:
                import re as _re
                def _extract_text(_b: Dict[str, Any]) -> str:
                    _p = (_b.get('props') or {})
                    if isinstance(_p.get('text'), str):
                        return _p.get('text') or ''
                    if isinstance(_p.get('texts'), list):
                        texts_list = []
                        for seg in _p['texts']:
                            t = seg.get('text') or seg.get('content') or ''
                            if isinstance(t, str):
                                texts_list.append(t)
                        return ' '.join(texts_list)
                    return ''

                # Anything that is not the hero
                candidates = [b for b in text_blocks if b is not hero_block]

                def _looks_like_metadata(txt: str) -> bool:
                    t = (txt or '').strip().lower()
                    if not t:
                        return False
                    # Likely metadata indicators
                    month_pat = r"jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec"
                    has_date = bool(_re.search(rf"\b(\d{{1,2}}[\/-]\d{{1,2}}[\/-]\d{{2,4}}|{month_pat}\s+\d{{1,2}}|\d{{4}})\b", t))
                    has_bullets = ('•' in t) or ('|' in t) or ('—' in t) or (' - ' in t)
                    has_contact = ('@' in t)
                    has_by = (' by ' in f' {t} ')
                    # Avoid short kicker-like phrases
                    word_count = len([w for w in t.split() if w])
                    is_short = word_count <= 6
                    return (has_date or has_bullets or has_contact or has_by) and not is_short

                # Choose the smallest block that looks like metadata
                meta_candidates = []
                for b in candidates:
                    txt = _extract_text(b)
                    if _looks_like_metadata(txt):
                        meta_candidates.append(b)
                if meta_candidates:
                    # Prefer smaller typography for metadata
                    metadata_block = min(meta_candidates, key=_block_font_size)
                else:
                    metadata_block = None
            except Exception:
                metadata_block = None

            # Create a metadata block if missing
            if metadata_block is None:
                import uuid as _uuid
                meta_text = self._build_title_metadata_text(context)
                metadata_block = {
                    'id': str(_uuid.uuid4()),
                    'type': 'TiptapTextBlock',
                    'props': {
                        'text': meta_text
                    }
                }
                # Append created metadata to text blocks collection
                text_blocks.append(metadata_block)
            # If metadata exists, shrink and position bottom-left/right
            if metadata_block is not None:
                meta_props = metadata_block.setdefault('props', {})
                meta_props['position'] = {'x': 160, 'y': 920}
                meta_props['width'] = 1600
                meta_props['height'] = 80
                meta_props['alignment'] = 'left' if not is_centered else 'center'
                meta_props['verticalAlignment'] = 'middle'
                meta_props['fontFamily'] = body_font
                # Use 24-28pt for sources/metadata
                meta_props['fontSize'] = 26
                meta_props['fontWeight'] = 'normal'
                meta_props['letterSpacing'] = 0.02
                # Muted color
                meta_props['textColor'] = secondary_text if isinstance(secondary_text, str) else '#A3A3A3'
                meta_props['padding'] = 0
                meta_props['zIndex'] = 3

            # Normalize or create a small logo image in a corner
            if logo_image is None:
                import uuid as _uuid
                logo_image = {
                    'id': str(_uuid.uuid4()),
                    'type': 'Image',
                    'props': {
                        'src': 'placeholder',
                        'alt': 'Logo',
                        'objectFit': 'contain',
                        'metadata': {'kind': 'logo'}
                    }
                }
            if logo_image is not None:
                logo_props = logo_image.setdefault('props', {})
                # Horizontal logo near corner with small margin
                margin = 24
                width = max(int(logo_props.get('width', 0) or 0), 320)
                height = max(int(logo_props.get('height', 0) or 0), 96)
                if is_centered:
                    # Prefer top-left when centered title
                    logo_props['position'] = {'x': margin, 'y': margin}
                else:
                    # Prefer top-right when left-aligned title
                    logo_props['position'] = {'x': 1920 - width - margin, 'y': margin}
                logo_props['width'] = width
                logo_props['height'] = height
                logo_props['zIndex'] = 4
                logo_props['objectFit'] = 'contain'

            # Pairing logic: ensure kicker/subtitle are ordered (kicker ABOVE hero, subtitle BELOW)
            try:
                import re as _re
                # Gather non-hero, non-metadata text blocks for pairing
                pairing_candidates = [b for b in text_blocks if b is not hero_block and b is not metadata_block]

                def _size_of(block: Dict[str, Any]) -> float:
                    props = block.get('props', {}) or {}
                    texts = props.get('texts') or []
                    base = float(props.get('fontSize', 0) or 0)
                    if isinstance(texts, list) and texts:
                        try:
                            base = max(base, max(float(t.get('fontSize', 0) or 0) for t in texts))
                        except Exception:
                            pass
                    return base

                def _extract_text(_b: Dict[str, Any]) -> str:
                    _p = (_b.get('props') or {})
                    if isinstance(_p.get('text'), str):
                        return _p.get('text') or ''
                    if isinstance(_p.get('texts'), list):
                        texts_list = []
                        for seg in _p['texts']:
                            t = seg.get('text') or seg.get('content') or ''
                            if isinstance(t, str):
                                texts_list.append(t)
                        return ' '.join(texts_list)
                    return ''

                def _looks_like_kicker(txt: str) -> bool:
                    t = (txt or '').strip().lower()
                    if not t:
                        return False
                    kicker_phrases = [
                        'introduction to', 'intro to', 'intro', 'welcome to', 'about',
                        'chapter', 'lesson', 'part', 'section', 'module', 'series'
                    ]
                    words = [w for w in _re.split(r"\s+", t) if w]
                    return t.startswith(tuple(kicker_phrases)) or (len(words) <= 6 and any(p in t for p in kicker_phrases))

                kicker_block = None
                subtitle_block = None
                if pairing_candidates:
                    # Prefer a textually identified kicker if present
                    for b in pairing_candidates:
                        if _looks_like_kicker(_extract_text(b)):
                            kicker_block = b
                            break
                    # Subtitle is the largest among remaining
                    remaining = [b for b in pairing_candidates if b is not kicker_block]
                    if remaining:
                        subtitle_block = max(remaining, key=_size_of)
                    # If no textual kicker and multiple remain, use smallest as kicker
                    if kicker_block is None and len(pairing_candidates) > 1:
                        kicker_block = min(pairing_candidates, key=_size_of)

                    hx = int(hero_props.get('position', {}).get('x', 160))
                    hy = int(hero_props.get('position', {}).get('y', 240))
                    hw = int(hero_props.get('width', 1600))
                    hh = int(hero_props.get('height', 640))

                    # Align subtitle just below hero
                    if subtitle_block is not None:
                        sub_props = subtitle_block.setdefault('props', {})
                        sub_pos = sub_props.get('position') or {}
                        target_sub_y = hy + hh + 24
                        current_sub_y = int(sub_pos.get('y', 0) or 0)
                        if abs(current_sub_y - target_sub_y) > 60:
                            sub_props['position'] = {'x': hx + (16 if alignment == 'left' else 0), 'y': target_sub_y}
                            sub_props['width'] = hw
                            sub_props['height'] = max(int(sub_props.get('height', 120) or 120), 100)
                            sub_props.setdefault('alignment', alignment)
                            sub_props.setdefault('verticalAlignment', 'top')
                            sub_props.setdefault('fontFamily', body_font)
                            # Size ~40% of hero, clamped
                            sub_size = max(28, min(int(hero_props.get('fontSize', 200) * 0.4), 120))
                            if 'texts' in sub_props and isinstance(sub_props['texts'], list) and sub_props['texts']:
                                for t in sub_props['texts']:
                                    t.setdefault('fontSize', sub_size)
                                    style = t.get('style') if isinstance(t.get('style'), dict) else {}
                                    style.setdefault('textColor', sub_props.get('textColor', secondary_text))
                                    t['style'] = style
                            else:
                                sub_props.setdefault('fontSize', sub_size)
                                sub_props.setdefault('textColor', secondary_text)
                            sub_props.setdefault('opacity', 0.92)
                            sub_props.setdefault('letterSpacing', -0.005)

                    # Align kicker just above hero
                    if kicker_block is not None and kicker_block is not subtitle_block:
                        kick_props = kicker_block.setdefault('props', {})
                        kick_pos = kick_props.get('position') or {}
                        kick_height = int(kick_props.get('height', 60) or 60)
                        target_kick_y = max(80, hy - kick_height - 24)
                        current_kick_y = int(kick_pos.get('y', 0) or 0)
                        if abs(current_kick_y - target_kick_y) > 60:
                            kick_props['position'] = {'x': hx, 'y': target_kick_y}
                            kick_props['width'] = hw
                            kick_props['height'] = max(kick_height, 60)
                            kick_props.setdefault('alignment', alignment)
                            kick_props.setdefault('verticalAlignment', 'bottom')
                            kick_props.setdefault('fontFamily', body_font)
                            # Size ~20% of hero, clamped
                            kick_size = max(24, min(int(hero_props.get('fontSize', 200) * 0.22), 96))
                            if 'texts' in kick_props and isinstance(kick_props['texts'], list) and kick_props['texts']:
                                for t in kick_props['texts']:
                                    t.setdefault('fontSize', kick_size)
                                    style = t.get('style') if isinstance(t.get('style'), dict) else {}
                                    style.setdefault('textColor', secondary_text)
                                    t['style'] = style
                            else:
                                kick_props.setdefault('fontSize', kick_size)
                                kick_props.setdefault('textColor', secondary_text)
                            kick_props.setdefault('opacity', 0.85)
                            kick_props.setdefault('letterSpacing', 0.02)
            except Exception as _e:
                logger.debug(f"[TITLE ENHANCE] Pairing logic skipped: {_e}")

            # Assemble final components: Background(s) + Lines + ALL title text blocks + optional logo
            final_components: List[Dict[str, Any]] = []
            # Ensure background exists; if not, kept_components may be empty and upstream will inject fallback
            final_components.extend(kept_components)
            final_components.extend(line_components)
            # Keep text blocks in their current order (hero may already be included)
            for tb in text_blocks:
                if tb not in final_components:
                    final_components.append(tb)
            if logo_image is not None and logo_image not in final_components:
                final_components.append(logo_image)

            slide_data['components'] = final_components
            logger.info("[TITLE ENHANCE] Applied enhanced title layout (preserved all title text blocks)")
        except Exception as e:
            logger.warning(f"[TITLE ENHANCE] Skipped due to error: {e}")

    def _build_title_metadata_text(self, context: SlideGenerationContext) -> str:
        """Construct a simple metadata line for the title slide."""
        try:
            # First try to get user info if user_id is available
            if context.user_id:
                user_info_service = get_user_info_service()
                user_info = user_info_service.get_user_info(context.user_id)
                
                # Use actual user data
                presenter = user_info.get('name', '')
                organization = user_info.get('organization', '')
                date_str = user_info.get('formatted_date', '')
                
                # If we have good user data, use it
                if presenter and presenter != 'Presenter':
                    return user_info_service.format_metadata_line(user_info)
            
            # Fallback to heuristic extraction from slide content
            import re
            content = getattr(context.slide_outline, 'content', '') or ''
            text = f"{getattr(context.slide_outline, 'title', '')}\n{content}"
            presenter = None
            organization = None
            date_str = None
            m = re.search(r"(?:presented by|by|speaker|presenter)[:\s]+([A-Za-z][A-Za-z\-\.'\s]{2,60})", text, re.IGNORECASE)
            if m:
                presenter = m.group(1).strip()
            m = re.search(r"(?:organization|organisation|company|org|at)[:\s]+([A-Za-z0-9&\-\.'\s]{2,80})", text, re.IGNORECASE)
            if m:
                organization = m.group(1).strip()
            date_patterns = [
                r"\b\d{4}-\d{1,2}-\d{1,2}\b",
                r"\b\d{1,2}/\d{1,2}/\d{2,4}\b",
                r"\b(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\s+\d{1,2},?\s+\d{2,4}\b",
                r"\b\d{1,2}\s+(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*,?\s+\d{2,4}\b",
            ]
            for pat in date_patterns:
                dm = re.search(pat, text, re.IGNORECASE)
                if dm:
                    date_str = dm.group(0).strip()
                    break
            
            # If user_id was provided, use actual user data for missing fields
            if context.user_id:
                user_info_service = get_user_info_service()
                user_info = user_info_service.get_user_info(context.user_id)
                presenter = presenter or user_info.get('name', 'Presenter')
                organization = organization or user_info.get('organization', 'Your Organization')
                date_str = date_str or user_info.get('formatted_date', datetime.now().strftime('%B %Y'))
            else:
                presenter = presenter or "[Your Name]"
                organization = organization or "[Organization]"
                date_str = date_str or "[Date]"
            
            return f"{presenter} — {organization} — {date_str}"
        except Exception:
            return "[Your Name] — [Organization] — [Date]"

    def _replace_user_placeholders(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        """Replace placeholder text with actual user information."""
        try:
            user_info_service = get_user_info_service()
            user_info = user_info_service.get_user_info(context.user_id)
            
            # Replace placeholders in all text components
            for component in slide_data.get('components', []):
                if component.get('type') == 'TiptapTextBlock':
                    props = component.get('props', {})
                    
                    # Handle text property
                    if 'text' in props and isinstance(props['text'], str):
                        props['text'] = user_info_service.replace_placeholders(props['text'], user_info)
                    
                    # Handle texts array
                    if 'texts' in props and isinstance(props['texts'], list):
                        for text_item in props['texts']:
                            if isinstance(text_item, dict) and 'text' in text_item:
                                text_item['text'] = user_info_service.replace_placeholders(text_item['text'], user_info)
                
                # Also check CustomComponent labels/values
                elif component.get('type') == 'CustomComponent':
                    props = component.get('props', {})
                    if 'label' in props and isinstance(props['label'], str):
                        props['label'] = user_info_service.replace_placeholders(props['label'], user_info)
                    if 'value' in props and isinstance(props['value'], str):
                        props['value'] = user_info_service.replace_placeholders(props['value'], user_info)
                
                # Check Table headers and cells
                elif component.get('type') == 'Table':
                    props = component.get('props', {})
                    if 'data' in props and isinstance(props['data'], list):
                        for row in props['data']:
                            if isinstance(row, dict):
                                for key, value in row.items():
                                    if isinstance(value, str):
                                        row[key] = user_info_service.replace_placeholders(value, user_info)
            
            # Replace placeholders in title and subtitle
            if 'title' in slide_data and isinstance(slide_data['title'], str):
                slide_data['title'] = user_info_service.replace_placeholders(slide_data['title'], user_info)
            if 'subtitle' in slide_data and isinstance(slide_data['subtitle'], str):
                slide_data['subtitle'] = user_info_service.replace_placeholders(slide_data['subtitle'], user_info)
            
        except Exception as e:
            logger.warning(f"[USER PERSONALIZATION] Failed to replace placeholders: {e}")
    
    def _inject_outline_values_into_custom_components(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        """Derive props.value/label/outline chips for CustomComponents from the slide outline text.

        - Populate props.value from the first prominent metric in title/content (currency, % or large number)
        - Populate props.label from a nearby keyword or the slide title
        - Populate props.previous/props.target when phrases indicate prior/goal values
        - Populate props.outline with up to 6 short keywords from the title/content
        Only fills when these props are missing or obviously placeholder-like.
        """
        try:
            import re
            title_text = (getattr(context.slide_outline, 'title', '') or '').strip()
            content_text = (getattr(context.slide_outline, 'content', '') or '').strip()
            combined = f"{title_text}\n{content_text}".strip()

            def find_metric(text: str) -> Dict[str, str]:
                # Preserve original token string when possible
                # 1) Currency with optional suffix
                m = re.search(r"([\$€£])\s?(\d[\d,]*(?:\.\d+)?)([kKmMbB])?", text)
                if m:
                    return {
                        'value': (m.group(1) + (m.group(2) or '') + (m.group(3) or '')).replace(' ', ''),
                        'span': m.span()
                    }
                # 2) Percentage
                m = re.search(r"(\d+(?:\.\d+)?)\s?%", text)
                if m:
                    return {'value': m.group(0).replace(' ', ''), 'span': m.span()}
                # 3) Large integer with suffix words (k/m/b) or > 999
                m = re.search(r"\b(\d[\d,]{3,})(?:\s?(?:k|m|b))?\b", text, flags=re.IGNORECASE)
                if m:
                    return {'value': m.group(0), 'span': m.span()}
                return {'value': '', 'span': (0, 0)}

            def find_previous(text: str) -> str:
                # Phrases like: "up from $11k", "from 10% to 12%"
                m = re.search(r"(?:up|down)?\s*from\s+([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)", text, flags=re.IGNORECASE)
                if m:
                    return m.group(1).replace(' ', '')
                m = re.search(r"last\s+(?:year|month|quarter)\s*[:\-]?\s*([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)", text, flags=re.IGNORECASE)
                return (m.group(1).replace(' ', '') if m else '')

            def find_target(text: str) -> str:
                m = re.search(r"(?:target|goal|aim)\s*(?:of|:)\s*([\$€£]?\s?\d[\d,]*(?:\.\d+)?(?:[kKmMbB])?|\d+(?:\.\d+)?\s?%)", text, flags=re.IGNORECASE)
                return (m.group(1).replace(' ', '') if m else '')

            def derive_label(text: str, metric_span: tuple[int, int]) -> str:
                keywords = [
                    'revenue','sales','users','customers','conversion','retention','roi','cost','profit','margin',
                    'growth','churn','nps','leads','mrr','arr','arpu','cac','ltv','sessions','traffic','ctr',
                    'open rate','latency','response time','engagement','activation','pipeline','bookings','gmv'
                ]
                text_lower = text.lower()
                # search window around metric
                start = max(0, metric_span[0] - 80)
                window = text_lower[start:metric_span[1] + 80]
                best = None
                for kw in keywords:
                    if kw in window:
                        best = kw
                        break
                if best:
                    return best.title()
                return title_text or 'Metric'

            def extract_outline_chips(title: str, content: str) -> list[str]:
                # Simple token extraction, dedupe, short list
                stop = {
                    'the','and','for','with','from','that','this','are','our','your','their','of','to','in','on','a','an',
                    'by','as','at','is','be','or','vs','we','it','into','over','under','per','more','less','than','vs.'
                }
                raw = f"{title} {content}".replace('\n', ' ')
                tokens = re.split(r"[^A-Za-z0-9%$]+", raw)
                chips: list[str] = []
                for tok in tokens:
                    if not tok:
                        continue
                    t = tok.strip()
                    tl = t.lower()
                    if tl in stop or len(t) < 3:
                        continue
                    if t not in chips:
                        chips.append(t)
                    if len(chips) >= 6:
                        break
                return chips

            metric = find_metric(combined)
            prev = find_previous(combined)
            targ = find_target(combined)
            label_text = derive_label(combined, metric.get('span', (0, 0))) if metric.get('value') else (title_text or '')
            chips = extract_outline_chips(title_text, content_text)

            # Apply to CustomComponents
            for comp in slide_data.get('components', []) or []:
                if comp.get('type') != 'CustomComponent':
                    continue
                props = comp.setdefault('props', {})
                # Only set when missing or placeholder-like
                def is_placeholder(val: Any) -> bool:
                    try:
                        s = (val or '').strip().lower()
                        return s == '' or s == 'value' or s == 'label'
                    except Exception:
                        return True

                if metric.get('value') and (('value' not in props) or is_placeholder(props.get('value'))):
                    props['value'] = metric['value']
                if label_text and (('label' not in props) or is_placeholder(props.get('label'))):
                    props['label'] = label_text
                # Emphasis for big callouts and a subtle backdrop color following theme
                try:
                    if 'emphasis' not in props and props.get('value'):
                        props['emphasis'] = 'hero'
                    # Leave backdrop transparent by default; only apply if explicitly requested upstream
                except Exception:
                    pass
                # Optional previous/target if found and not already set
                if prev and not props.get('previous'):
                    props['previous'] = prev
                if targ and not (props.get('target') or props.get('max')):
                    props['target'] = targ
                # Outline chips
                if chips and not props.get('outline'):
                    props['outline'] = chips
        except Exception as e:
            logger.debug(f"_inject_outline_values_into_custom_components skipped: {e}")

    def _apply_tagged_media_to_images(self, slide_data: Dict[str, Any], tagged_media: List[Dict[str, Any]]):
        """Replace placeholder images with actual tagged media URLs."""
        logger.info(f"[IMAGE REPLACEMENT] Starting image replacement process")
        logger.info(f"[IMAGE REPLACEMENT] Tagged media count: {len(tagged_media)}")
        
        image_components = []
        for comp in slide_data.get('components', []) or []:
            if comp.get('type') != 'Image':
                continue
            props = comp.get('props', {}) or {}
            # Skip logos from media replacement
            try:
                alt_text = (props.get('alt') or '').strip().lower()
                metadata_kind = ((props.get('metadata') or {}).get('kind') or '').strip().lower()
                if alt_text == 'logo' or metadata_kind == 'logo':
                    continue
            except Exception:
                pass
            if props.get('src') in ['placeholder', '']:
                image_components.append(comp)
        
        logger.info(f"[IMAGE REPLACEMENT] Found {len(image_components)} placeholder image components")

        if not image_components:
            logger.warning("[IMAGE REPLACEMENT] No placeholder images found to replace")
            return
        
        # Filter for media with previewUrl (images can have type 'image' or 'other')
        image_media = [
            media for media in tagged_media 
            if media.get('previewUrl') and (media.get('type') in ['image', 'other'])
        ]
        
        logger.info(f"[IMAGE REPLACEMENT] Found {len(image_media)} image media items with previewUrl")
        
        # Apply tagged media to image components
        for i, img_comp in enumerate(image_components):
            if i < len(image_media):
                media = image_media[i]
                
                # Use previewUrl which could be a base64 data URL or regular URL
                preview_url = media.get('previewUrl', '')
                
                logger.info(f"[IMAGE REPLACEMENT] Processing component {i+1}:")
                logger.info(f"  - Media filename: {media.get('filename')}")
                logger.info(f"  - Preview URL length: {len(preview_url)}")
                logger.info(f"  - Preview URL prefix: {preview_url[:50] if preview_url else 'empty'}")
                
                # If it's a base64 data URL or a valid URL, use it
                if preview_url and (preview_url.startswith('data:') or preview_url.startswith('http')):
                    img_comp['props']['src'] = preview_url
                    logger.info(f"[IMAGE REPLACEMENT] ✓ Successfully replaced placeholder with {media.get('filename')}")
                else:
                    # Fallback to placeholder if URL is invalid
                    img_comp['props']['src'] = 'placeholder'
                    logger.warning(f"[IMAGE REPLACEMENT] ✗ Invalid preview URL for media '{media.get('filename')}', keeping placeholder")
                
                img_comp['props']['alt'] = media.get('interpretation', media.get('filename', ''))
                
                # Add metadata for tracking
                img_comp['props']['metadata'] = {
                    'taggedMediaId': media.get('id'),
                    'filename': media.get('filename'),
                    'type': media.get('type'),
                    'originalUrl': media.get('previewUrl')
                }
                
                logger.info(f"[IMAGE REPLACEMENT] Completed processing for '{media.get('filename')}'")
        
        # Log if we have more image media than image components
        if len(image_media) > len(image_components):
            logger.warning(
                f"Slide has {len(image_media)} image media items but only {len(image_components)} image components. "
                f"Extra media not used: {[m.get('filename') for m in image_media[len(image_components):]]}"
            )
        
        # Log if we have non-image media that wasn't used
        non_image_media = [m for m in tagged_media if m.get('type') != 'image']
        if non_image_media:
            details = ", ".join([f"{m.get('filename')} ({m.get('type')})" for m in non_image_media])
            logger.info(
                f"Slide has {len(non_image_media)} non-image media items that were not applied: {details}"
            )

    def _apply_available_images_to_placeholders(self, slide_data: Dict[str, Any], available_images: List[Dict[str, Any]]):
        """Replace placeholder images with actual available images."""
        logger.info(f"[IMAGE REPLACEMENT] Starting available image replacement process")
        logger.info(f"[IMAGE REPLACEMENT] Available images count: {len(available_images)}")

        image_components = []
        for comp in slide_data.get('components', []) or []:
            if comp.get('type') != 'Image':
                continue
            props = comp.get('props', {}) or {}
            # Skip logos from available-image replacement
            try:
                alt_text = (props.get('alt') or '').strip().lower()
                metadata_kind = ((props.get('metadata') or {}).get('kind') or '').strip().lower()
                if alt_text == 'logo' or metadata_kind == 'logo':
                    continue
            except Exception:
                pass
            if props.get('src') == 'placeholder':
                image_components.append(comp)

        logger.info(f"[IMAGE REPLACEMENT] Found {len(image_components)} placeholder image components")

        if not image_components:
            logger.warning("[IMAGE REPLACEMENT] No placeholder images found to replace")
            return

        # Apply images to image components
        for i, img_comp in enumerate(image_components):
            if i < len(available_images):
                media = available_images[i]
                
                # Use url field (not previewUrl) based on the format from _format_images_for_streaming
                image_url = media.get('url', '')
                
                if logger.isEnabledFor(logging.DEBUG):
                    logger.debug(f"[IMAGE REPLACEMENT] Processing component {i+1}:")
                    logger.debug(f"  - Image ID: {media.get('id')}")
                    logger.debug(f"  - URL length: {len(image_url)}")
                    logger.debug(f"  - URL prefix: {image_url[:50] if image_url else 'empty'}")
                    logger.debug(f"  - Photographer: {media.get('photographer')}")
                
                # If it's a valid URL, use it
                if image_url and (image_url.startswith('data:') or image_url.startswith('http')):
                    img_comp['props']['src'] = image_url
                    logger.info(f"[IMAGE REPLACEMENT] ✓ Successfully replaced placeholder with image")
                else:
                    # Fallback to placeholder if URL is invalid
                    img_comp['props']['src'] = 'placeholder'
                    logger.warning(f"[IMAGE REPLACEMENT] ✗ Invalid URL for image, keeping placeholder")
                
                img_comp['props']['alt'] = media.get('alt', '')
                
                # Add metadata for tracking
                img_comp['props']['metadata'] = {
                    'imageId': media.get('id'),
                    'photographer': media.get('photographer'),
                    'ai_generated': media.get('ai_generated', False)
                }
                
                logger.debug(f"[IMAGE REPLACEMENT] Completed processing for image {i+1}")
        
        # Log if we have more images than components
        if len(available_images) > len(image_components):
            logger.info(
                f"Slide has {len(available_images)} available images but only {len(image_components)} image components. "
                f"Extra images not used."
            )

    def _emergency_fix_custom_component(self, component_data: str) -> str:
        """Emergency fix for truncated CustomComponent render functions."""
        # Check if it's a truncated function
        if 'function render' in component_data and component_data.strip().endswith('/'):
            logger.warning("[EMERGENCY FIX] Detected CustomComponent truncated with '/'")
            
            # Find the last complete statement before the truncation
            lines = component_data.split('\n')
            
            # Look for the last helper function or complete statement
            last_valid_line = -1
            for i in range(len(lines) - 1, -1, -1):
                line = lines[i].strip()
                # Skip empty lines and the truncation
                if not line or line == '/':
                    continue
                # Found a complete statement or closing brace
                if line.endswith(';') or line.endswith('}') or line.endswith(')'):
                    last_valid_line = i
                    break
            
            if last_valid_line >= 0:
                # Keep everything up to the last valid line
                component_data = '\n'.join(lines[:last_valid_line + 1])
                
                # Ensure we close any open helper functions
                helper_depth = 0
                for line in lines[:last_valid_line + 1]:
                    helper_depth += line.count('{') - line.count('}')
                
                # Close any unclosed braces from helper functions
                while helper_depth > 1:  # 1 for the main render function
                    component_data += '\n  }'
                    helper_depth -= 1
                
                # Ensure the render function returns something
                if 'return' not in component_data.split('function render')[-1]:
                    component_data += '\n\n  // Emergency completion\n  return <div>Content generated</div>;\n}'
                else:
                    # Just close the render function
                    component_data += '\n}'
            else:
                # Fallback: complete the function with a basic return
                component_data = component_data.rstrip('/')
                component_data += '\n  return <div>Content generated</div>;\n}'
        
        # Also check for functions ending with incomplete helper functions
        elif 'function render' in component_data:
            lines = component_data.split('\n')
            
            # Count open/close braces
            open_braces = component_data.count('{')
            close_braces = component_data.count('}')
            
            if open_braces > close_braces:
                logger.warning(f"[EMERGENCY FIX] Detected unclosed braces: {open_braces} open, {close_braces} closed")
                
                # Check if we're in the middle of a helper function
                last_lines = '\n'.join(lines[-5:])  # Last 5 lines
                in_helper = False
                
                # Common patterns for helper functions
                helper_patterns = [
                    'const safe', 'function safe', 'const format', 'function format',
                    'const get', 'function get', 'const calc', 'function calc'
                ]
                
                for pattern in helper_patterns:
                    if pattern in last_lines and 'return' not in last_lines:
                        in_helper = True
                        break
                
                if in_helper:
                    # Complete the helper function
                    component_data += '\n    return null; // Emergency completion\n  }'
                
                # Now ensure the main render function is complete
                if 'return' not in component_data.split('function render')[-1]:
                    component_data += '\n\n  return <div>Content generated</div>;'
                
                # Close remaining braces
                while component_data.count('{') > component_data.count('}'):
                    component_data += '\n}'
        
        return component_data

    def _add_titles_and_axis_text(self, slide_data: Dict[str, Any], context: SlideGenerationContext) -> None:
        """Add Tiptap titles above Charts/Tables and optional axis labels when available.

        Heuristics:
        - Chart/Table title: insert a centered TiptapTextBlock above the component if there isn't one already.
        - Axis labels: only when chart props provide xAxisLabel/yAxisLabel. Place them near axes.
        - Keep within canvas bounds and avoid duplicates using metadata.autoLabel.
        """
        try:
            components: List[Dict[str, Any]] = slide_data.get('components', []) or []

            # Theme-derived defaults
            try:
                theme_dict = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else (context.theme or {})
            except Exception:
                theme_dict = {}
            colors = (theme_dict or {}).get('color_palette', {}) or {}
            typography = (theme_dict or {}).get('typography', {}) or {}
            primary_text = colors.get('primary_text', '#1A1A1A')
            hero_font = (typography.get('hero_title') or {}).get('family', 'Montserrat')
            body_font = (typography.get('body_text') or {}).get('family', 'Poppins')

            CANVAS_WIDTH = 1920
            CANVAS_HEIGHT = 1080

            def rect_of(props: Dict[str, Any]) -> tuple[int, int, int, int]:
                pos = props.get('position') or {}
                try:
                    return (
                        int(pos.get('x', 0) or 0),
                        int(pos.get('y', 0) or 0),
                        int(props.get('width', 0) or 0),
                        int(props.get('height', 0) or 0),
                    )
                except Exception:
                    return (0, 0, 0, 0)

            def intersects(a: tuple[int, int, int, int], b: tuple[int, int, int, int]) -> bool:
                ax, ay, aw, ah = a
                bx, by, bw, bh = b
                if aw <= 0 or ah <= 0 or bw <= 0 or bh <= 0:
                    return False
                return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)

            def add_tiptap(text: str, x: int, y: int, w: int, h: int, size: int, weight: str, align: str, meta_kind: str) -> None:
                # Clamp within canvas
                x_clamped = max(0, min(x, CANVAS_WIDTH - max(1, w)))
                y_clamped = max(0, min(y, CANVAS_HEIGHT - max(1, h)))
                block = {
                    'type': 'TiptapTextBlock',
                    'props': {
                        'position': {'x': x_clamped, 'y': y_clamped},
                        'width': max(80, w),
                        'height': max(28, h),
                        'alignment': align,
                        'verticalAlignment': 'middle',
                        'fontFamily': hero_font if weight == 'bold' and size >= 40 else body_font,
                        'fontSize': size,
                        'fontWeight': weight,
                        'letterSpacing': -0.01,
                        'lineHeight': 1.2,
                        'textColor': primary_text,
                        'backgroundColor': '#00000000',
                        'zIndex': 6,
                        'texts': [
                            {
                                'text': text,
                                'fontSize': size,
                                'style': {
                                    'textColor': primary_text,
                                    'backgroundColor': '#00000000',
                                    'bold': (weight == 'bold'),
                                }
                            }
                        ],
                        'metadata': {'autoLabel': meta_kind}
                    }
                }
                components.append(block)

            # Gather existing auto labels to avoid duplicates
            existing_auto_labels: List[Dict[str, Any]] = [
                c for c in components if c.get('type') == 'TiptapTextBlock' and isinstance(c.get('props'), dict)
                and isinstance(c['props'].get('metadata'), dict) and c['props']['metadata'].get('autoLabel')
            ]

            for comp in list(components):
                ctype = comp.get('type')
                if ctype not in ('Chart', 'Table'):
                    continue
                props = comp.get('props', {}) or {}
                x, y, w, h = rect_of(props)
                if w <= 0 or h <= 0:
                    continue

                # Title above component
                title_meta = f"{ctype.lower()}_title"
                has_title_already = any(
                    t for t in existing_auto_labels
                    if t['props']['metadata'].get('autoLabel') == title_meta and intersects(
                        (t['props']['position']['x'], t['props']['position']['y'], t['props']['width'], t['props']['height']),
                        (x, max(0, y - 120), w, 120)
                    )
                )
                if not has_title_already:
                    # Prefer component's own title if present; fallback to slide title
                    comp_title = str(props.get('title') or '').strip()
                    slide_title = str(getattr(context.slide_outline, 'title', '') or '').strip()
                    title_text = comp_title or slide_title
                    if title_text:
                        size = max(28, min(64, int(w / 24)))
                        title_y = max(80, y - (size + 12))
                        add_tiptap(title_text, x, title_y, w, size + 12, size, 'bold', 'center', title_meta)

                if ctype == 'Chart':
                    # Optional axis labels only if provided by props
                    x_label = str(props.get('xAxisLabel') or '').strip()
                    y_label = str(props.get('yAxisLabel') or '').strip()

                    # X-axis label below chart
                    if x_label:
                        meta = 'x_axis'
                        has_x = any(
                            t for t in existing_auto_labels
                            if t['props']['metadata'].get('autoLabel') == meta and intersects(
                                (t['props']['position']['x'], t['props']['position']['y'], t['props']['width'], t['props']['height']),
                                (x, y + h, w, 80)
                            )
                        )
                        if not has_x:
                            size = max(16, min(24, int(w / 48)))
                            label_y = min(CANVAS_HEIGHT - 80, y + h + 8)
                            add_tiptap(x_label, x, label_y, w, size + 10, size, 'normal', 'center', meta)

                    # Y-axis label rotated, placed left of chart when room exists
                    if y_label and x >= 120 and h >= 200:
                        meta = 'y_axis'
                        has_y = any(
                            t for t in existing_auto_labels
                            if t['props']['metadata'].get('autoLabel') == meta and intersects(
                                (t['props']['position']['x'], t['props']['position']['y'], t['props']['width'], t['props']['height']),
                                (max(0, x - 120), y, 120, h)
                            )
                        )
                        if not has_y:
                            size = max(16, min(24, int(h / 24)))
                            # Vertical label approximation: add rotation for y-axis
                            add_block_x = max(0, x - 80)
                            add_block_y = max(80, y + int(h / 2) - 40)
                            block_width = 60
                            block_height = 80
                            x_clamped = max(0, min(add_block_x, CANVAS_WIDTH - block_width))
                            y_clamped = max(0, min(add_block_y, CANVAS_HEIGHT - block_height))
                            block = {
                                'type': 'TiptapTextBlock',
                                'props': {
                                    'position': {'x': x_clamped, 'y': y_clamped},
                                    'width': block_width,
                                    'height': block_height,
                                    'alignment': 'center',
                                    'verticalAlignment': 'middle',
                                    'fontFamily': body_font,
                                    'fontSize': size,
                                    'fontWeight': 'normal',
                                    'letterSpacing': -0.01,
                                    'lineHeight': 1.2,
                                    'textColor': primary_text,
                                    'backgroundColor': '#00000000',
                                    'zIndex': 6,
                                    'rotation': -90,
                                    'texts': [
                                        {
                                            'text': y_label,
                                            'fontSize': size,
                                            'style': {
                                                'textColor': primary_text,
                                                'backgroundColor': '#00000000',
                                                'bold': False,
                                            }
                                        }
                                    ],
                                    'metadata': {'autoLabel': meta}
                                }
                            }
                            components.append(block)

            slide_data['components'] = components
        except Exception as e:
            logger.debug(f"_add_titles_and_axis_text skipped: {e}")