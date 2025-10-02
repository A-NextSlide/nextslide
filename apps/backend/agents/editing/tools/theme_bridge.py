from __future__ import annotations

from typing import Optional, List, Dict, Any, Literal
from pydantic import Field
import asyncio
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

from models.tools import ToolModel
from models.deck import DeckBase, DeckDiff
from models.registry import ComponentRegistry

# Theme utilities
from agents.tools.theme.smart_color_selector import SmartColorSelector
from agents.editing.tools.background import get_background_components

# Extended theme sources
from agents.tools.theme.brand_color_tools import BrandColorSearcher
from agents.tools.theme.web_color_scraper import WebColorScraper
from utils.json_safe import to_json_safe
from agents.tools.theme.palette_tools import (
    search_palette_by_keywords,
    get_random_palette,
)

# Holistic extractor (website + guidelines + Brandfetch API)
from agents.tools.theme.holistic_brand_extractor import HolisticBrandExtractor

# Brandfetch service for direct API access
try:
    from services.simple_brandfetch_cache import SimpleBrandfetchCache
    from services.database_config import get_database_connection_string, is_database_caching_enabled
    from services.brandfetch_service import BrandfetchService
    CACHE_AVAILABLE = is_database_caching_enabled()
    BRANDFETCH_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False
    BRANDFETCH_AVAILABLE = False

# Font services
from services.unified_font_service import UnifiedFontService
from services.registry_fonts import RegistryFonts


class ApplyThemePaletteArgs(ToolModel):
    tool_name: Literal["apply_theme_palette"] = Field(description="Select and apply a theme color palette to the deck. Updates Background components with a high-contrast, non-white background color.")
    user_prompt: Optional[str] = Field(default=None, description="User prompt or theme/color request to guide palette selection (brand, mood, keywords).")
    prefer_dark: Optional[bool] = Field(default=None, description="Hint: prefer dark backgrounds.")
    prefer_light: Optional[bool] = Field(default=None, description="Hint: prefer light backgrounds.")


def _fallback_palette() -> Dict[str, Any]:
    return {
        "colors": ["#0A0E27", "#1A1F3A", "#2563EB", "#7C3AED", "#F59E0B", "#10B981"],
        "backgrounds": ["#0A0E27", "#1A1F3A"],
    }


def apply_theme_palette(args: ApplyThemePaletteArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    """Apply a selected theme palette to the deck by updating Background components.

    Strategy:
    - Use SmartColorSelector to derive colors/backgrounds from the user prompt and deck title
    - Choose a primary non-white background color
    - Update all Background components to use a solid color background
    """
    title = getattr(deck_data, "name", None)
    prompt_text = args.user_prompt or ""

    result: Dict[str, Any] = {}
    try:
        selector = SmartColorSelector()
        # style preferences hint
        style_prefs = {}
        if args.prefer_dark is True:
            style_prefs["modeHint"] = "dark"
        if args.prefer_light is True:
            style_prefs["modeHint"] = "light"
        result = selector._post_process_colors(
            # Select core colors (async path internally; exposed via async API). For simplicity, run minimal analysis here.
            {
                "colors": selector._create_default_palette_colors() if hasattr(selector, "_create_default_palette_colors") else _fallback_palette()["colors"],
                "backgrounds": [],
                "source": "default",
            },
            selector._analyze_color_request(prompt_text, str(title or ""), style_prefs or None),
        )
        # If SmartColorSelector returns nothing, fall back
        if not isinstance(result, dict) or not result.get("backgrounds"):
            result = _fallback_palette()
    except Exception:
        result = _fallback_palette()

    backgrounds: List[str] = result.get("backgrounds") or []
    primary_bg: str = backgrounds[0] if backgrounds and isinstance(backgrounds[0], str) else "#0A0E27"

    # Update every Background component to a solid color using the chosen background
    background_components = get_background_components(deck_data)
    background_diff_model = registry.get_component_diff_model("Background")

    for bg_info in background_components:
        comp_obj = bg_info.get("component")
        slide_id = bg_info.get("slide_id")
        try:
            comp_id = getattr(comp_obj, "id", None)
            if comp_id is None and isinstance(comp_obj, dict):
                comp_id = comp_obj.get("id")
            if not comp_id or not slide_id:
                continue
            # Provide minimal props update; rely on diff model for validation
            background_diff = background_diff_model(
                id=comp_id,
                type="Background",
                props={
                    "backgroundType": "color",
                    "backgroundColor": primary_bg,
                    # Clear gradient/image related props if they exist
                    "gradient": None,
                    "backgroundImageUrl": None,
                },
            )
            deck_diff.update_component(slide_id, comp_id, background_diff)
        except Exception:
            # Skip invalid backgrounds gracefully
            continue

    return deck_diff


# ------------------------------
# Extended theme editing tools
# ------------------------------

def _run_async(coro):
    try:
        return asyncio.run(coro)
    except RuntimeError:
        # If there's an existing loop (e.g., in tests), create and use a new one
        loop = asyncio.new_event_loop()
        try:
            asyncio.set_event_loop(loop)
            return loop.run_until_complete(coro)
        finally:
            try:
                loop.close()
            except Exception:
                pass


def _fallback_palette() -> Dict[str, Any]:
    return {
        "colors": ["#0A0E27", "#1A1F3A", "#2563EB", "#7C3AED", "#F59E0B", "#10B981"],
        "backgrounds": ["#0A0E27", "#1A1F3A"],
    }


def _choose_background_color(candidates: List[str], prefer_dark: Optional[bool], prefer_light: Optional[bool]) -> str:
    if not candidates:
        return "#0A0E27"
    # Normalize
    colors = [c for c in candidates if isinstance(c, str) and c.startswith("#")]
    if not colors:
        return "#0A0E27"

    # Always use the first brand color directly - no filtering or preferences
    return colors[0]


def _apply_background_color_to_all_slides(primary_bg: str, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> None:
    background_components = get_background_components(deck_data)
    logger.info(f"🖼️  Found {len(background_components)} background components to update")
    
    background_diff_model = registry.get_component_diff_model("Background")
    if not background_diff_model:
        logger.warning("❌ No Background diff model found in registry")
        return
        
    updates_made = 0
    for bg_info in background_components:
        comp_obj = bg_info.get("component")
        slide_id = bg_info.get("slide_id")
        try:
            comp_id = getattr(comp_obj, "id", None)
            if comp_id is None and isinstance(comp_obj, dict):
                comp_id = comp_obj.get("id")
            if not comp_id or not slide_id:
                logger.debug(f"   Skipping background: comp_id={comp_id}, slide_id={slide_id}")
                continue
                
            # Force clear all background types and set solid color
            # Try complete background props reset to ensure no gradient interference
            props_to_set = {
                "backgroundType": "color",
                "backgroundColor": primary_bg,
                "backgroundImageUrl": None,
                "backgroundImageSize": "cover",
                "backgroundImageRepeat": "no-repeat", 
                "backgroundImageOpacity": 1,
                "patternColor": None,
                "patternOpacity": None,
                "patternScale": None,
                "isAnimated": False,
                "animationSpeed": 1,
            }
            
            # Force complete background replacement approach
            # Get existing component properties first
            current_props = {}
            if hasattr(comp_obj, 'props'):
                current_props = getattr(comp_obj, 'props', {})
            elif isinstance(comp_obj, dict):
                current_props = comp_obj.get('props', {})
            
            # Create complete diff props with explicit gradient clearing
            diff_props = {
                "backgroundType": "color",
                "backgroundColor": primary_bg,
                # Set gradient to None (validation requires None, not empty object)
                "gradient": None,
                "gradientType": None,
                "gradientAngle": None,
                "gradientStops": None,
                "gradientEnabled": None,
                "gradientDirection": None,
                "gradientStartColor": None,
                "gradientStopColor": None,
                # Clear other background types
                "backgroundImageUrl": None,
                "patternColor": None,
            }
            
            # DATABASE DELETION APPROACH: Create valid diff that forces database to delete gradient
            # Problem: Frontend prioritizes gradient over backgroundType, so gradient must be NULL in DB
            
            # Create diff with gradient=None explicitly included
            diff_props = {
                "backgroundType": "color", 
                "backgroundColor": primary_bg,
                "gradient": None,  # Explicit null to clear existing gradient
                "backgroundImageUrl": None,
                "patternColor": None,
            }
            
            # Create diff normally - let pydantic handle None values
            try:
                background_diff = background_diff_model.model_validate({
                    "id": comp_id,
                    "type": "Background", 
                    "props": diff_props
                })
                
                # Use JSON-safe conversion instead of manual model_dump patching
                # This avoids serialization issues and ensures consistent behavior
                
            except Exception as e:
                logger.warning(f"   ⚠️ Model validation failed: {e}, creating minimal diff")
                # Fallback to minimal diff if validation fails
                diff_props = {"backgroundType": "color", "backgroundColor": primary_bg}
                background_diff = background_diff_model.model_validate({
                    "id": comp_id, "type": "Background", "props": diff_props
                })
            
            logger.debug(f"   🗑️ PATCHED SERIALIZATION: diff with gradient=None and patched model_dump")
            logger.debug(f"   🗑️ PATCHED SERIALIZATION: backgroundType={diff_props.get('backgroundType')}, backgroundColor={diff_props.get('backgroundColor')}, gradient={diff_props.get('gradient')}")
            logger.debug(f"   🗑️ PATCHED SERIALIZATION: model_dump method overridden to force exclude_none=False")
            
            deck_diff.update_component(slide_id, comp_id, background_diff)
            updates_made += 1
            
            # Debug: show exactly what we're trying to set
            logger.info(f"   ✅ Updated background {comp_id} in slide {slide_id} to {primary_bg}")
            logger.info(f"   📋 Applied props: backgroundType={diff_props.get('backgroundType')}, backgroundColor={diff_props.get('backgroundColor')}")
            logger.info(f"   📋 IMPORTANT: Patched serialization approach - gradient=None with forced exclude_none=False")
            logger.debug(f"   📋 Full diff props: {diff_props}")
            
        except Exception as e:
            logger.warning(f"   ❌ Failed to update background {comp_id}: {e}")
            continue
    
    logger.info(f"🖼️  Applied background color {primary_bg} to {updates_made} components")


def _get_text_component_types(registry: ComponentRegistry) -> List[str]:
    types: List[str] = []
    try:
        schemas = registry.get_json_schemas() or {}
        for tname, schema in schemas.items():
            props = (schema or {}).get('schema', {}).get('properties', {}) or {}
            # Heuristic: text components usually have text-related fields and fontFamily
            if 'fontFamily' in props or 'text' in props or 'content' in props:
                types.append(tname)
    except Exception:
        types = ["TiptapTextBlock", "TextBlock", "Title"]
    return types


def _apply_text_color_to_all_text_components(text_color: str, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> None:
    text_types = set(_get_text_component_types(registry))
    # Iterate slides/components and update text color
    try:
        if hasattr(deck_data, 'slides'):
            slides_iter = list(getattr(deck_data, 'slides', []) or [])
        elif isinstance(deck_data, dict):
            slides_iter = list(deck_data.get('slides', []) or [])
        else:
            slides_iter = []

        for slide in slides_iter:
            slide_id = getattr(slide, 'id', None)
            if slide_id is None and isinstance(slide, dict):
                slide_id = slide.get('id')
            if hasattr(slide, 'components'):
                comps_iter = list(getattr(slide, 'components', []) or [])
            elif isinstance(slide, dict):
                comps_iter = list(slide.get('components', []) or [])
            else:
                comps_iter = []

            for comp in comps_iter:
                ctype = getattr(comp, 'type', None)
                if ctype is None and isinstance(comp, dict):
                    ctype = comp.get('type')
                if ctype not in text_types:
                    continue
                comp_id = getattr(comp, 'id', None)
                if comp_id is None and isinstance(comp, dict):
                    comp_id = comp.get('id')
                if not comp_id or not slide_id:
                    continue
                try:
                    diff_model = registry.get_component_diff_model(ctype)
                    if not diff_model:
                        continue
                    # Try 'textColor' then fallback to 'color'
                    props = {"textColor": text_color}
                    diff = diff_model(
                        id=comp_id,
                        type=ctype,
                        props=props
                    )
                    deck_diff.update_component(slide_id, comp_id, diff)
                except Exception:
                    # Fallback to 'color' property name if schema rejects 'textColor'
                    try:
                        diff_model = registry.get_component_diff_model(ctype)
                        diff = diff_model(
                            id=comp_id,
                            type=ctype,
                            props={"color": text_color}
                        )
                        deck_diff.update_component(slide_id, comp_id, diff)
                    except Exception:
                        continue
    except Exception:
        pass


def _contrast_ratio(hex1: str, hex2: str) -> float:
    def _luminance(h: str) -> float:
        try:
            h = h.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            def _lin(c: float) -> float:
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            R = _lin(r); G = _lin(g); B = _lin(b)
            return 0.2126 * R + 0.7152 * G + 0.0722 * B
        except Exception:
            return 0.5
    L1 = _luminance(hex1)
    L2 = _luminance(hex2)
    hi, lo = (max(L1, L2), min(L1, L2))
    return (hi + 0.05) / (lo + 0.05)


def _pick_text_color_for_background(background: str, candidates: List[str]) -> str:
    # Always consider pure white/black as candidates to guarantee contrast
    base = ["#000000", "#FFFFFF"]
    pool = list(dict.fromkeys((candidates or []) + base))
    best = pool[0]
    best_ratio = -1.0
    for c in pool:
        try:
            r = _contrast_ratio(background, c)
            if r > best_ratio:
                best_ratio = r
                best = c
        except Exception:
            continue
    return best


def _resolve_brand_url(brand_name: Optional[str]) -> Optional[str]:
    if not brand_name:
        return None
    
    # Clean the brand name more thoroughly
    clean_name = (brand_name or '').lower().strip()
    clean_name = clean_name.replace(' ', '').replace('&', '').replace('.', '').replace('-', '').replace('_', '')
    
    # Remove common suffixes
    for suffix in ['inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd']:
        if clean_name.endswith(suffix):
            clean_name = clean_name[:-len(suffix)]
    
    clean_name = clean_name.strip()
    
    if not clean_name or len(clean_name) < 2:
        return None
    
    # Try common URL patterns
    return f"https://www.{clean_name}.com"


def _extract_site_theme(brand_name: Optional[str], url: Optional[str]) -> Dict[str, Any]:
    """Run holistic extraction with Brandfetch API priority to get backgrounds, text colors, and fonts.
    Uses Brandfetch API first, then falls back to website extraction and agents for brand search.
    Returns dict: {backgrounds:[], text:[], colors:[], fonts:[]}
    """
    extraction_flow = []
    
    # Step 1: Try Brandfetch API first if we have brand name or URL
    if BRANDFETCH_AVAILABLE and (brand_name or url):
        try:
            async def _brandfetch_extraction():
                # Use cache if available, otherwise fallback to regular service
                if CACHE_AVAILABLE:
                    db_connection_string = get_database_connection_string()
                    async with SimpleBrandfetchCache(db_connection_string) as service:
                        identifier = url if url else brand_name
                        return await service.get_brand_data(identifier)
                else:
                    async with BrandfetchService() as service:
                        identifier = url if url else brand_name
                        return await service.get_brand_data(identifier)
            
            brandfetch_data = _run_async(_brandfetch_extraction())
            extraction_flow.append("brandfetch_cached" if CACHE_AVAILABLE else "brandfetch_api")
            
            # Check if Brandfetch was successful
            if (not brandfetch_data.get("error") and 
                (brandfetch_data.get("colors", {}).get("hex_list") or 
                 brandfetch_data.get("fonts", {}).get("names") or 
                 brandfetch_data.get("logos"))):
                
                # Extract properly categorized colors from Brandfetch response
                if CACHE_AVAILABLE:
                    service = SimpleBrandfetchCache(get_database_connection_string()).brandfetch_service
                else:
                    service = BrandfetchService()
                categorized_colors = service.get_categorized_colors(brandfetch_data)
                fonts = brandfetch_data.get("fonts", {}).get("names", [])
                
                # Use intelligent categorization
                backgrounds = categorized_colors.get("backgrounds", [])
                text_colors = categorized_colors.get("text", [])
                accent_colors = categorized_colors.get("accent", [])
                all_colors = categorized_colors.get("all", [])
                
                # If specific background colors found, get optimal text colors for them
                if backgrounds:
                    optimal_text = service.get_text_colors(brandfetch_data, backgrounds[0])
                    if optimal_text:
                        text_colors = optimal_text
                
                out = {
                    "backgrounds": backgrounds,
                    "text": text_colors,
                    "colors": all_colors,
                    "accent": accent_colors,
                    "primary": categorized_colors.get("primary", []),
                    "secondary": categorized_colors.get("secondary", []),
                    "fonts": fonts,
                    "extraction_flow": extraction_flow + ["brandfetch_success"],
                    "confidence_score": brandfetch_data.get("confidence_score", 90),
                    "total_elements_analyzed": len(all_colors) + len(fonts),
                    "website_logo_url": None,  # Will be set below
                    "used_url": brandfetch_data.get("domain", url or ""),
                    "brandfetch_data": brandfetch_data,
                    "color_categorization": "intelligent_brandfetch"
                }
                
                # Try to get best logo (synchronous since we already have the data)
                try:
                    if CACHE_AVAILABLE:
                        service = SimpleBrandfetchCache(get_database_connection_string()).brandfetch_service
                    else:
                        service = BrandfetchService()
                    logo_url = service.get_best_logo(brandfetch_data)
                    if logo_url:
                        out["website_logo_url"] = logo_url
                except Exception:
                    pass
                
                logger.info(f"Brandfetch extraction successful: {len(all_colors)} colors, {len(fonts)} fonts")
                return out
            else:
                logger.warning(f"Brandfetch API failed: {brandfetch_data.get('error', 'No data returned')}")
                
        except Exception as e:
            logger.warning(f"Brandfetch extraction failed: {e}")
            extraction_flow.append("brandfetch_failed")
    
    # Step 2: Fallback to original holistic extraction method
    extraction_flow.append("fallback_to_holistic")
    
    # Determine URL - use direct URL if provided, otherwise use agents to search
    if url and url.startswith("http"):
        site_url = url
        extraction_flow.append("direct_url")
    elif brand_name:
        # Use agent-based brand search to find the official website
        site_url = _resolve_brand_url(brand_name)
        extraction_flow.append("agent_search")
        
        # If agent search fails, try brand color searcher
        if not site_url or not site_url.startswith("http"):
            try:
                async def _search_with_agent():
                    searcher = BrandColorSearcher()
                    result = await searcher.search_brand_colors(brand_name)
                    if result.get('official_url'):
                        return result['official_url']
                    return None
                agent_url = _run_async(_search_with_agent())
                if agent_url:
                    site_url = agent_url
                    extraction_flow.append("brand_agent_url")
            except Exception as e:
                logger.warning(f"Agent brand search failed: {e}")
    else:
        return {"extraction_flow": extraction_flow + ["no_brand_info"], "error": "No brand name or URL provided"}
    
    # Validate final URL
    try:
        if not site_url or not isinstance(site_url, str) or not site_url.startswith("http"):
            return {"extraction_flow": extraction_flow + ["invalid_url"], "error": "Could not resolve valid URL"}
    except Exception:
        return {"extraction_flow": extraction_flow + ["url_validation_error"], "error": "URL validation failed"}
    
    # Step 3: Run holistic extraction
    try:
        async def _run():
            async with HolisticBrandExtractor() as ex:
                return await ex.extract_complete_brand(str(brand_name or ''), site_url)
        data = _run_async(_run())
        if not isinstance(data, dict):
            return {"extraction_flow": extraction_flow + ["extraction_failed"], "error": "Extraction returned invalid data"}
        
        # Add flow information to result
        data['extraction_flow'] = extraction_flow + ["holistic_extraction"]
        out: Dict[str, Any] = {
            "backgrounds": list(data.get("website_backgrounds") or []),
            "text": list(data.get("website_text") or []),
            "colors": list(data.get("final_colors") or (data.get("website_colors") or [])),
            "fonts": list(data.get("final_fonts") or (data.get("website_fonts") or [])),
            "extraction_flow": data.get("extraction_flow", extraction_flow + ["holistic_extraction"]),
            "confidence_score": data.get("confidence_score", 0),
            "total_elements_analyzed": data.get("total_elements_analyzed", 0),
            "website_logo_url": data.get("website_logo_url"),
            "used_url": site_url
        }
        # Try categories if present
        cats = data.get("color_categories") or {}
        if isinstance(cats, dict):
            bg_c = list(cats.get("background") or [])
            tx_c = list(cats.get("text") or [])
            if bg_c:
                out["backgrounds"] = list(dict.fromkeys(bg_c + out["backgrounds"]))
            if tx_c:
                out["text"] = list(dict.fromkeys(tx_c + out["text"]))
        return out
    except Exception as e:
        logger.error(f"Site theme extraction failed: {e}")
        return {"extraction_flow": extraction_flow + ["extraction_error"], "error": str(e)}


class ApplyBrandColorsArgs(ToolModel):
    tool_name: Literal["apply_brand_colors"] = Field(description="Search official brand colors (web/AI/logo) and apply a background color across slides.")
    brand_name: Optional[str] = Field(default=None, description="Brand or organization name.")
    url: Optional[str] = Field(default=None, description="Optional brand/site URL to extract colors from.")
    prefer_dark: Optional[bool] = Field(default=None, description="Hint: prefer dark backgrounds.")
    prefer_light: Optional[bool] = Field(default=None, description="Hint: prefer light backgrounds.")


def apply_brand_colors(args: ApplyBrandColorsArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    """
    Apply brand colors with optimized performance for real-time updates.
    Prioritizes immediate visual feedback over comprehensive brand extraction.
    """
    
    # Step 1: Try fast Brandfetch API first (if available)
    backgrounds: List[str] = []
    text_candidates: List[str] = []
    fonts: List[str] = []
    
    if BRANDFETCH_AVAILABLE and (args.brand_name or args.url):
        try:
            # Use timeout to prevent blocking real-time updates
            async def _quick_brandfetch():
                # Use cache if available, otherwise fallback to regular service
                if CACHE_AVAILABLE:
                    db_connection_string = get_database_connection_string()
                    async with SimpleBrandfetchCache(db_connection_string) as service:
                        identifier = args.url if args.url else args.brand_name
                        brand_data = await service.get_brand_data(identifier)
                        return service, brand_data
                else:
                    async with BrandfetchService() as service:
                        identifier = args.url if args.url else args.brand_name
                        # Use search-capable resolver for non-domain identifiers
                        brand_data = await service.get_brand_data_with_search(identifier)
                        return service, brand_data
            
            # Quick timeout for real-time responsiveness
            service_and_data = _run_async(asyncio.wait_for(_quick_brandfetch(), timeout=3.0))
            
            if CACHE_AVAILABLE:
                service, brandfetch_data = service_and_data
            else:
                # We returned (service, data) above even when cache is disabled
                service, brandfetch_data = service_and_data
            
            if not brandfetch_data.get("error"):
                categorized_colors = service.get_categorized_colors(brandfetch_data)
                
                backgrounds = categorized_colors.get("backgrounds", [])
                text_candidates = categorized_colors.get("text", [])
                fonts = brandfetch_data.get("fonts", {}).get("names", [])
                
                logger.info(f"Brand colors applied via Brandfetch API: {len(backgrounds)} backgrounds, {len(text_candidates)} text colors")
                logger.info(f"   Backgrounds: {backgrounds}")
                logger.info(f"   Text colors: {text_candidates}")
                
        except asyncio.TimeoutError:
            logger.warning("Brandfetch API timeout (3s) - using fallback for real-time performance")
        except Exception as e:
            logger.warning(f"Brandfetch API failed: {e} - using fallback")
    
    # Step 2: Quick fallback if no colors found yet
    if not backgrounds:
        try:
            # Use basic brand color extraction with short timeout
            searcher = BrandColorSearcher()
            result = _run_async(asyncio.wait_for(
                searcher.search_brand_colors(args.brand_name or "", url=args.url), 
                timeout=2.0
            ))
            if isinstance(result, dict):
                backgrounds = list(result.get("backgrounds") or []) or list(result.get("colors") or [])
                if not fonts:
                    fonts = list(result.get("fonts") or [])
        except (asyncio.TimeoutError, Exception) as e:
            logger.debug(f"Brand color search fallback failed or timed out: {e}")
    
    # Step 3: Use fallback palette if still no colors (ensures immediate response)
    if not backgrounds:
        backgrounds = _fallback_palette().get("backgrounds", [])
        logger.info("Using fallback palette for immediate response")

    # Step 4: Apply colors immediately (same as apply_theme_fonts for consistency)
    primary_bg = _choose_background_color(backgrounds, args.prefer_dark, args.prefer_light)
    logger.info(f"🎨 Selected primary background: {primary_bg} from {backgrounds}")
    _apply_background_color_to_all_slides(primary_bg, registry, deck_data, deck_diff)

    # Step 5: Apply optimal text color 
    text_color = _pick_text_color_for_background(primary_bg, text_candidates)
    logger.info(f"📝 Selected text color: {text_color} for background {primary_bg}")
    _apply_text_color_to_all_text_components(text_color, registry, deck_data, deck_diff)

    # Step 6: Apply fonts if available (same logic as fonts tool for consistency)
    if fonts:
        try:
            body_font = fonts[0]
            text_types = set(_get_text_component_types(registry))
            
            if hasattr(deck_data, 'slides'):
                slides_iter = list(getattr(deck_data, 'slides', []) or [])
            elif isinstance(deck_data, dict):
                slides_iter = list(deck_data.get('slides', []) or [])
            else:
                slides_iter = []
            
            for slide in slides_iter:
                slide_id = getattr(slide, 'id', None) or (slide.get('id') if isinstance(slide, dict) else None)
                comps = list(getattr(slide, 'components', []) or (slide.get('components', []) if isinstance(slide, dict) else []))
                for comp in comps:
                    ctype = getattr(comp, 'type', None) or (comp.get('type') if isinstance(comp, dict) else None)
                    if ctype not in text_types:
                        continue
                    comp_id = getattr(comp, 'id', None) or (comp.get('id') if isinstance(comp, dict) else None)
                    if not comp_id or not slide_id:
                        continue
                    diff_model = registry.get_component_diff_model(ctype)
                    if not diff_model:
                        continue
                    try:
                        diff = diff_model(id=comp_id, type=ctype, props={"fontFamily": body_font})
                        deck_diff.update_component(slide_id, comp_id, diff)
                    except Exception:
                        continue
        except Exception:
            pass

    return deck_diff


class ApplyWebsitePaletteArgs(ToolModel):
    tool_name: Literal["apply_website_palette"] = Field(description="Scrape a website/brand page to extract colors and apply a suitable background color across slides.")
    brand_name: Optional[str] = Field(default=None, description="Brand or organization name (for discovery if URL missing).")
    url: Optional[str] = Field(default=None, description="Website or brand page URL.")
    prefer_dark: Optional[bool] = Field(default=None, description="Hint: prefer dark backgrounds.")
    prefer_light: Optional[bool] = Field(default=None, description="Hint: prefer light backgrounds.")


def apply_website_palette(args: ApplyWebsitePaletteArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    site = _extract_site_theme(args.brand_name, args.url)
    backgrounds: List[str] = list(site.get("backgrounds") or [])
    text_candidates: List[str] = list(site.get("text") or [])
    fonts: List[str] = list(site.get("fonts") or [])

    if not backgrounds:
        # Fallback to direct scraper if needed
        scraper = WebColorScraper()
        try:
            result: Dict[str, Any] = _run_async(scraper.scrape_brand_website(args.brand_name or "", url=args.url))
        except Exception:
            result = {}
        finally:
            try:
                _run_async(scraper.close())
            except Exception:
                pass
        if isinstance(result, dict):
            cats = result.get("categorized") or {}
            if isinstance(cats, dict):
                backgrounds = list(cats.get("background") or [])
            if not backgrounds:
                backgrounds = list(result.get("colors") or [])
            if not fonts:
                fonts = list(result.get("fonts") or [])

    if not backgrounds:
        backgrounds = _fallback_palette().get("backgrounds", [])

    primary_bg = _choose_background_color(backgrounds, args.prefer_dark, args.prefer_light)
    _apply_background_color_to_all_slides(primary_bg, registry, deck_data, deck_diff)

    text_color = _pick_text_color_for_background(primary_bg, text_candidates)
    _apply_text_color_to_all_text_components(text_color, registry, deck_data, deck_diff)

    if fonts:
        try:
            body_font = fonts[0]
            text_types = set(_get_text_component_types(registry))
            if hasattr(deck_data, 'slides'):
                slides_iter = list(getattr(deck_data, 'slides', []) or [])
            elif isinstance(deck_data, dict):
                slides_iter = list(deck_data.get('slides', []) or [])
            else:
                slides_iter = []
            for slide in slides_iter:
                slide_id = getattr(slide, 'id', None) or (slide.get('id') if isinstance(slide, dict) else None)
                comps = list(getattr(slide, 'components', []) or (slide.get('components', []) if isinstance(slide, dict) else []))
                for comp in comps:
                    ctype = getattr(comp, 'type', None) or (comp.get('type') if isinstance(comp, dict) else None)
                    if ctype not in text_types:
                        continue
                    comp_id = getattr(comp, 'id', None) or (comp.get('id') if isinstance(comp, dict) else None)
                    if not comp_id or not slide_id:
                        continue
                    diff_model = registry.get_component_diff_model(ctype)
                    if not diff_model:
                        continue
                    try:
                        diff = diff_model(id=comp_id, type=ctype, props={"fontFamily": body_font})
                        deck_diff.update_component(slide_id, comp_id, diff)
                    except Exception:
                        continue
        except Exception:
            pass
    return deck_diff


class ApplyKeywordPaletteArgs(ToolModel):
    tool_name: Literal["apply_keyword_palette"] = Field(description="Search palette DB by keywords and apply a background color across slides.")
    keywords: List[str] = Field(description="Keywords describing desired palette (e.g., 'calm', 'tech', 'vibrant').")
    prefer_dark: Optional[bool] = Field(default=None, description="Hint: prefer dark backgrounds.")
    prefer_light: Optional[bool] = Field(default=None, description="Hint: prefer light backgrounds.")


def apply_keyword_palette(args: ApplyKeywordPaletteArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    try:
        palettes = search_palette_by_keywords(args.keywords or [], limit=5) or []
    except Exception:
        palettes = []

    colors: List[str] = []
    if palettes:
        first = palettes[0] or {}
        colors = list(first.get("colors") or [])
        # Prefer any declared backgrounds array if present
        bgs = list(first.get("backgrounds") or [])
        backgrounds = bgs or colors
    else:
        backgrounds = _fallback_palette().get("backgrounds", [])

    primary_bg = _choose_background_color(backgrounds, args.prefer_dark, args.prefer_light)
    _apply_background_color_to_all_slides(primary_bg, registry, deck_data, deck_diff)
    return deck_diff


class ApplyRandomPaletteArgs(ToolModel):
    tool_name: Literal["apply_random_palette"] = Field(description="Pick a high-contrast random palette from DB and apply a background color across slides.")
    prefer_dark: Optional[bool] = Field(default=None, description="Hint: prefer dark backgrounds.")
    prefer_light: Optional[bool] = Field(default=None, description="Hint: prefer light backgrounds.")


def apply_random_palette(args: ApplyRandomPaletteArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    try:
        pal = get_random_palette(exclude_pink=True)
    except Exception:
        pal = None
    backgrounds = []
    if isinstance(pal, dict):
        backgrounds = list(pal.get("backgrounds") or []) or list(pal.get("colors") or [])
    if not backgrounds:
        backgrounds = _fallback_palette().get("backgrounds", [])
    primary_bg = _choose_background_color(backgrounds, args.prefer_dark, args.prefer_light)
    _apply_background_color_to_all_slides(primary_bg, registry, deck_data, deck_diff)
    return deck_diff


class ApplyThemeFontsArgs(ToolModel):
    tool_name: Literal["apply_theme_fonts"] = Field(description="Select and apply presentation fonts across text components using the unified font service.")
    vibe: Optional[str] = Field(default=None, description="Presentation vibe/style hint (e.g., professional, modern, playful, elegant).")
    heading_font_name: Optional[str] = Field(default=None, description="Explicit heading/hero font family to use (overrides recommendation).")
    body_font_name: Optional[str] = Field(default=None, description="Explicit body font family to use (overrides recommendation).")


def apply_theme_fonts(args: ApplyThemeFontsArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff) -> DeckDiff:
    # Determine deck title for context
    try:
        deck_title = getattr(deck_data, 'title', None) or getattr(deck_data, 'name', None)
    except Exception:
        deck_title = None
    if deck_title is None and isinstance(deck_data, dict):
        deck_title = (deck_data.get('title') or deck_data.get('name'))

    # Choose fonts
    body_font = args.body_font_name
    heading_font = args.heading_font_name
    if not (body_font and heading_font):
        try:
            ufs = UnifiedFontService()
            rec = ufs.get_fonts_for_theme(str(deck_title or ""), str(args.vibe or "balanced"))
            # Prefer names in recommendations if explicit not provided
            if not heading_font:
                hero = (rec.get('hero') or [])
                if hero:
                    heading_font = hero[0].get('name') or hero[0].get('id')
            if not body_font:
                body = (rec.get('body') or [])
                if body:
                    body_font = body[0].get('name') or body[0].get('id')
        except Exception:
            pass

    # Last resort body font
    if not body_font:
        # Use first available from registry fonts
        try:
            fonts = RegistryFonts.get_all_fonts_list(registry)
            body_font = fonts[0] if fonts else "Inter"
        except Exception:
            body_font = "Inter"

    # Build set of component types that support fontFamily
    font_types: List[str] = []
    try:
        schemas = registry.get_json_schemas() or {}
        for tname, schema in schemas.items():
            try:
                props = (schema or {}).get('schema', {}).get('properties', {}) or {}
                if 'fontFamily' in props:
                    font_types.append(tname)
            except Exception:
                continue
    except Exception:
        # Fallback: common text types
        font_types = ["TiptapTextBlock", "TextBlock", "Title"]

    # Iterate slides/components and update fontFamily
    try:
        # Gather slides
        if hasattr(deck_data, 'slides'):
            slides_iter = list(getattr(deck_data, 'slides', []) or [])
        elif isinstance(deck_data, dict):
            slides_iter = list(deck_data.get('slides', []) or [])
        else:
            slides_iter = []

        for slide in slides_iter:
            slide_id = getattr(slide, 'id', None)
            if slide_id is None and isinstance(slide, dict):
                slide_id = slide.get('id')
            # Components
            if hasattr(slide, 'components'):
                comps_iter = list(getattr(slide, 'components', []) or [])
            elif isinstance(slide, dict):
                comps_iter = list(slide.get('components', []) or [])
            else:
                comps_iter = []

            for comp in comps_iter:
                ctype = getattr(comp, 'type', None)
                if ctype is None and isinstance(comp, dict):
                    ctype = comp.get('type')
                if ctype not in font_types:
                    continue
                comp_id = getattr(comp, 'id', None)
                if comp_id is None and isinstance(comp, dict):
                    comp_id = comp.get('id')
                if not comp_id or not slide_id:
                    continue
                try:
                    diff_model = registry.get_component_diff_model(ctype)
                    if not diff_model:
                        continue
                    # Use body font for all supported text components for consistency
                    diff = diff_model(
                        id=comp_id,
                        type=ctype,
                        props={
                            "fontFamily": body_font
                        }
                    )
                    deck_diff.update_component(slide_id, comp_id, diff)
                except Exception:
                    continue
    except Exception:
        pass

    return deck_diff

