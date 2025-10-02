#!/usr/bin/env python3
"""
Logo Search Tool - Add multiple brand logos to slides with smart positioning
Searches database first, then Brandfetch, automatically caches results.
"""

import asyncio
import os
from typing import List, Dict, Any, Optional, Literal
from pydantic import Field, BaseModel
from models.tools import ToolModel
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase

from services.simple_brandfetch_cache import SimpleBrandfetchCache
from agents.tools.theme.logodev_service import LogoDevService
from services.database_config import get_database_connection_string
from setup_logging_optimized import get_logger
from utils.deck import find_current_slide, get_all_slide_ids

logger = get_logger(__name__)


def _as_typed_component(component: Dict[str, Any], registry: ComponentRegistry):
    """Attempt to instantiate a typed component from the registry to avoid serialization warnings."""
    try:
        if not registry:
            return component
        type_name = (component or {}).get("type")
        if not type_name:
            return component
        Model = registry.get_component_model(type_name)
        if not Model:
            return component
        return Model(**component)
    except Exception:
        return component


class LogoSearchArgs(ToolModel):
    tool_name: Literal["add_logos"] = Field(description="Tool to search for and add multiple brand logos to a slide")
    slide_id: str = Field(description="The ID of the slide to add logos to")
    brand_names: List[str] = Field(
        description="List of brand names or domains to search for logos (e.g., ['apple', 'nike', 'spotify.com', 'mcdonalds'])"
    )
    layout: Optional[Literal["horizontal", "vertical", "grid"]] = Field(
        default="horizontal", 
        description="How to arrange multiple logos: horizontal row, vertical column, or grid layout"
    )
    size: Optional[Literal["small", "medium", "large"]] = Field(
        default="medium",
        description="Size of the logos: small (50px), medium (100px), large (150px)"
    )
    position: Optional[str] = Field(
        default="center",
        description="Where to place the logos: 'center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top-center', 'bottom-center'"
    )


class LogoData(BaseModel):
    brand_name: str
    logo_url_light: Optional[str] = None
    logo_url_dark: Optional[str] = None
    success: bool = False
    error: Optional[str] = None


def add_logos(
    logo_search_args: LogoSearchArgs, 
    registry: ComponentRegistry, 
    deck_data: DeckBase, 
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Add multiple brand logos to a slide with smart positioning and DB-first search.
    """
    return asyncio.run(_add_logos_async(logo_search_args, registry, deck_data, deck_diff))


async def _add_logos_async(
    logo_search_args: LogoSearchArgs, 
    registry: ComponentRegistry, 
    deck_data: DeckBase, 
    deck_diff: DeckDiff
) -> DeckDiff:
    """
    Async implementation of logo search and placement.
    """
    
    logger.info(f"🔍 Starting logo search for brands: {logo_search_args.brand_names}")
    
    # Initialize Brandfetch cache service
    db_url = get_database_connection_string()
    if not db_url:
        logger.error("Database URL not configured")
        return deck_diff
    
    # Try to detect localized person logo placeholders to anchor per-person logos
    localized_logo_slots: list[dict] = []
    try:
        slides = getattr(deck_data, 'slides', []) if not isinstance(deck_data, dict) else deck_data.get('slides', [])
        target_slide = None
        for s in slides:
            sid = getattr(s, 'id', None) if not isinstance(s, dict) else s.get('id')
            if sid == logo_search_args.slide_id:
                target_slide = s
                break
        comps = getattr(target_slide, 'components', []) if target_slide and not isinstance(target_slide, dict) else ((target_slide or {}).get('components', []) if target_slide else [])
        for c in comps:
            ctype = getattr(c, 'type', None) if not isinstance(c, dict) else c.get('type')
            props = getattr(c, 'props', None) if not isinstance(c, dict) else c.get('props', {})
            meta = (props or {}).get('metadata', {}) if isinstance(props, dict) else {}
            if ctype == 'Image' and isinstance(meta, dict) and meta.get('kind') == 'person_logo':
                pos = (props or {}).get('position', {})
                localized_logo_slots.append({
                    'x': float(pos.get('x', 0)),
                    'y': float(pos.get('y', 0)),
                    'width': float((props or {}).get('width', 32)),
                    'height': float((props or {}).get('height', 32))
                })
        if localized_logo_slots:
            logger.info(f"📎 Found {len(localized_logo_slots)} localized person logo placeholders; will prefer localized placement")
    except Exception as e:
        logger.info(f"⚠️ Unable to detect localized person logo placeholders: {e}")
    
    logos_found: List[LogoData] = []
    
    # Search for all logos (DB first, then Brandfetch)
    async with SimpleBrandfetchCache(db_url) as cache:
        # Prepare Logo.dev fallback service (opened lazily on first need)
        logodev_service: Optional[LogoDevService] = None
        try:
            for brand_name in logo_search_args.brand_names:
                try:
                    logger.info(f"🔍 Searching for logo: {brand_name}")
                    brand_data = await cache.get_brand_data(brand_name)

                    # If Brandfetch timed out or not found, try smart domain variants before giving up
                    if brand_data.get('error'):
                        error_type = brand_data.get('error')
                        logger.warning(f"❌ Primary lookup failed for {brand_name}: {error_type}")

                        # Remove explicit .edu fallback; keep behavior to allow Logo.dev fallback below
                        tried_variant = False

                        # If still failing, try Logo.dev fallback
                        if brand_data.get('error'):
                            if logodev_service is None:
                                logodev_service = await LogoDevService().__aenter__()
                            try:
                                # Prefer domain if we already tried a variant
                                query_for_fallback = brand_data.get('identifier') or brand_name
                                logger.info(f"🛟 Falling back to Logo.dev for {brand_name} (query: {query_for_fallback})")
                                fallback = await logodev_service.get_logo_with_fallback(query_for_fallback)
                                if fallback and fallback.get('available') and fallback.get('logo_url'):
                                    # Treat as success with a generic single URL (no theme distinction)
                                    logos_found.append(LogoData(
                                        brand_name=brand_name,
                                        logo_url_light=fallback.get('logo_url'),
                                        logo_url_dark=fallback.get('logo_url'),
                                        success=True
                                    ))
                                    logger.info(f"✅ Logo.dev provided a logo for {brand_name}")
                                    continue
                                else:
                                    logger.warning(f"❌ Logo.dev fallback failed for {brand_name}: {fallback and fallback.get('error')}")
                            except Exception as fe:
                                logger.warning(f"Logo.dev fallback error for {brand_name}: {fe}")

                        # If we reach here and still have an error, record failure
                        if brand_data.get('error'):
                            logos_found.append(LogoData(
                                brand_name=brand_name,
                                success=False,
                                error=brand_data.get('error', 'Unknown error')
                            ))
                            logger.warning(f"❌ Logo not found for: {brand_name} - {brand_data.get('error')}")
                            continue

                    # Extract light and dark logo variants using smart selection
                    logo_light = cache.get_best_logo(brand_data, prefer_theme="light")
                    logo_dark = cache.get_best_logo(brand_data, prefer_theme="dark")

                    if logo_light or logo_dark:
                        logos_found.append(LogoData(
                            brand_name=brand_data.get('brand_name', brand_name),
                            logo_url_light=logo_light,
                            logo_url_dark=logo_dark,
                            success=True
                        ))
                        logger.info(f"✅ Logo found for: {brand_name} (light: {bool(logo_light)}, dark: {bool(logo_dark)})")
                    else:
                        # If Brandfetch returned data but no logos, try Logo.dev as last resort
                        if logodev_service is None:
                            logodev_service = await LogoDevService().__aenter__()
                        try:
                            query_for_fallback = brand_data.get('domain') or brand_data.get('brand_name') or brand_name
                            logger.info(f"🛟 No logos in API data; trying Logo.dev for {brand_name} (query: {query_for_fallback})")
                            fallback = await logodev_service.get_logo_with_fallback(query_for_fallback)
                            if fallback and fallback.get('available') and fallback.get('logo_url'):
                                logos_found.append(LogoData(
                                    brand_name=brand_name,
                                    logo_url_light=fallback.get('logo_url'),
                                    logo_url_dark=fallback.get('logo_url'),
                                    success=True
                                ))
                                logger.info(f"✅ Logo.dev provided a logo for {brand_name}")
                            else:
                                logos_found.append(LogoData(
                                    brand_name=brand_name,
                                    success=False,
                                    error="No logos available"
                                ))
                                logger.warning(f"❌ No logos available for: {brand_name}")
                        except Exception as fe:
                            logger.warning(f"Logo.dev fallback error for {brand_name}: {fe}")
                            logos_found.append(LogoData(
                                brand_name=brand_name,
                                success=False,
                                error="No logos available"
                            ))

                except Exception as e:
                    logger.error(f"Error searching for {brand_name}: {e}")
                    logos_found.append(LogoData(
                        brand_name=brand_name,
                        success=False,
                        error=str(e)
                    ))
        finally:
            if logodev_service is not None:
                try:
                    await logodev_service.__aexit__(None, None, None)
                except Exception:
                    pass
    
    # Filter successful logos
    successful_logos = [logo for logo in logos_found if logo.success]
    
    if not successful_logos:
        logger.warning("❌ No logos found for any of the requested brands")
        return deck_diff
    
    logger.info(f"✅ Found {len(successful_logos)}/{len(logo_search_args.brand_names)} logos")
    
    # If localized slots are available and at least one logo, map logos to slots (truncate/exact)
    if localized_logo_slots:
        limit = min(len(successful_logos), len(localized_logo_slots))
        for i in range(limit):
            logo = successful_logos[i]
            position = localized_logo_slots[i]
            selected_logo_url = logo.logo_url_dark or logo.logo_url_light
            if not selected_logo_url:
                continue
            normalized_name = logo.brand_name.lower().replace('.com', '').replace('.org', '').replace('.net', '').replace(' ', '-').replace("'", "")
            component_id = f"logo-{normalized_name}-{i}"
            image_component = {
                "id": component_id,
                "type": "Image",
                "props": {
                    "src": selected_logo_url,
                    "alt": "Brand Logo",
                    "position": {"x": float(position["x"]), "y": float(position["y"])},
                    "width": float(position["width"]),
                    "height": float(position["height"]),
                    "objectFit": "contain",
                    "zIndex": 10,
                    "metadata": {"kind": "logo"}
                }
            }
            slide_diff = deck_diff._find_or_create_slide_diff(logo_search_args.slide_id)
            if not hasattr(slide_diff, "components_to_add"):
                slide_diff.components_to_add = []
            slide_diff.components_to_add.append(image_component)
            logger.info(f"✅ Added {logo.brand_name} logo to localized slot at ({position['x']}, {position['y']})")
        return deck_diff
    
    # Fallback to global positioning if no localized slots
    # Calculate positioning based on layout and slide dimensions  
    slide_width, slide_height = 1920, 1080  # Standard slide dimensions
    
    # Smart positioning: avoid crowded areas if position is center/bottom-center
    smart_position = logo_search_args.position
    logger.info(f"📍 Initial position request: {logo_search_args.position}")
    if logo_search_args.position in ["center", "bottom-center"]:
        # For content-heavy slides, prefer bottom-right to avoid text overlap
        has_center_content = _has_content_in_center_area(deck_data, logo_search_args.slide_id)
        logger.info(f"📊 Center content check result: {has_center_content}")
        if has_center_content:
            smart_position = "bottom-right"
            logger.info(f"🧠 Smart positioning: Detected center content, using bottom-right instead of {logo_search_args.position}")
        else:
            logger.info(f"📍 Center area clear, keeping original position: {logo_search_args.position}")
    
    positions = _calculate_logo_positions(
        successful_logos, 
        logo_search_args.layout,
        smart_position,
        logo_search_args.size,
        slide_width,
        slide_height
    )
    
    # Add logo components to the slide
    for i, (logo, position) in enumerate(zip(successful_logos, positions)):
        # Use dark logo as default, light as fallback (most slides have light backgrounds)
        selected_logo_url = logo.logo_url_dark or logo.logo_url_light
        
        if not selected_logo_url:
            continue
            
        # Create image component with normalized brand name for consistent IDs
        # Normalize brand name by removing domains and special chars for ID generation
        normalized_name = logo.brand_name.lower().replace('.com', '').replace('.org', '').replace('.net', '').replace(' ', '-').replace("'", "")
        component_id = f"logo-{normalized_name}-{i}"
        logger.info(f"🆔 Generated component ID: {component_id} (from brand_name: '{logo.brand_name}')")
        image_component = {
            "id": component_id,
            "type": "Image",
            "props": {
                "src": selected_logo_url,
                "alt": "Brand Logo",
                "position": {"x": float(position["x"]), "y": float(position["y"])},
                "width": float(position["width"]),
                "height": float(position["height"]),
                "objectFit": "contain",  # Perfect for logos to maintain aspect ratio
                "zIndex": 10,  # Ensure logos appear above other content
                "metadata": {"kind": "logo"}
            }
        }
        
        # Use direct slide diff approach to bypass registry conversion entirely
        # This avoids ALL Pydantic serialization issues that break real-time updates
        logger.info(f"🔧 Using direct slide diff approach (bypassing registry)")
        slide_diff = deck_diff._find_or_create_slide_diff(logo_search_args.slide_id)
        if not hasattr(slide_diff, "components_to_add"):
            slide_diff.components_to_add = []
        
        # Add plain dict component directly (no registry conversion, no ComponentBase)
        slide_diff.components_to_add.append(image_component)
        logger.info(f"✅ Added plain dict component directly to slide diff")
        
        logger.info(f"➕ Added {logo.brand_name} logo at ({position['x']}, {position['y']})")
    
    # Log results summary
    failed_brands = [logo.brand_name for logo in logos_found if not logo.success]
    if failed_brands:
        logger.info(f"ℹ️  Could not find logos for: {', '.join(failed_brands)}")
    
    return deck_diff


def _calculate_logo_positions(
    logos: List[LogoData], 
    layout: str, 
    position: str, 
    size: str,
    slide_width: int, 
    slide_height: int
) -> List[Dict[str, int]]:
    """
    Calculate positions for multiple logos based on layout preferences.
    """
    
    # Define logo sizes
    size_map = {
        "small": {"width": 80, "height": 80},
        "medium": {"width": 120, "height": 120}, 
        "large": {"width": 180, "height": 180}
    }
    
    logo_size = size_map.get(size, size_map["medium"])
    logo_count = len(logos)
    
    positions = []
    
    if layout == "horizontal":
        # Arrange logos in a horizontal row
        total_width = logo_count * logo_size["width"] + (logo_count - 1) * 20  # 20px spacing
        start_x = _get_start_position(position, slide_width, slide_height, total_width, logo_size["height"])[0]
        y = _get_start_position(position, slide_width, slide_height, total_width, logo_size["height"])[1]
        
        for i in range(logo_count):
            x = start_x + i * (logo_size["width"] + 20)
            positions.append({
                "x": x,
                "y": y,
                "width": logo_size["width"],
                "height": logo_size["height"]
            })
    
    elif layout == "vertical":
        # Arrange logos in a vertical column
        total_height = logo_count * logo_size["height"] + (logo_count - 1) * 20  # 20px spacing
        x = _get_start_position(position, slide_width, slide_height, logo_size["width"], total_height)[0]
        start_y = _get_start_position(position, slide_width, slide_height, logo_size["width"], total_height)[1]
        
        for i in range(logo_count):
            y = start_y + i * (logo_size["height"] + 20)
            positions.append({
                "x": x,
                "y": y,
                "width": logo_size["width"],
                "height": logo_size["height"]
            })
    
    elif layout == "grid":
        # Arrange logos in a grid
        cols = min(3, logo_count)  # Max 3 columns
        rows = (logo_count + cols - 1) // cols  # Calculate rows needed
        
        total_width = cols * logo_size["width"] + (cols - 1) * 20
        total_height = rows * logo_size["height"] + (rows - 1) * 20
        
        start_x, start_y = _get_start_position(position, slide_width, slide_height, total_width, total_height)
        
        for i in range(logo_count):
            row = i // cols
            col = i % cols
            x = start_x + col * (logo_size["width"] + 20)
            y = start_y + row * (logo_size["height"] + 20)
            positions.append({
                "x": x,
                "y": y,
                "width": logo_size["width"],
                "height": logo_size["height"]
            })
    
    return positions


def _get_start_position(
    position: str, 
    slide_width: int, 
    slide_height: int, 
    content_width: int, 
    content_height: int
) -> tuple[int, int]:
    """
    Get starting position based on alignment preference.
    """
    
    margin = 50  # Margin from slide edges
    
    position_map = {
        "center": (
            (slide_width - content_width) // 2,
            (slide_height - content_height) // 2
        ),
        "top-left": (margin, margin),
        "top-right": (slide_width - content_width - margin, margin),
        "top-center": ((slide_width - content_width) // 2, margin),
        "bottom-left": (margin, slide_height - content_height - margin),
        "bottom-right": (slide_width - content_width - margin, slide_height - content_height - margin),
        "bottom-center": ((slide_width - content_width) // 2, slide_height - content_height - margin)
    }
    
    return position_map.get(position, position_map["center"])


def _has_content_in_center_area(deck_data: DeckBase, slide_id: str) -> bool:
    """
    Check if the slide has significant content in the center area that might overlap with logos.
    """
    try:
        logger.info(f"🔍 Checking center content for slide: {slide_id}")
        # Find the target slide
        slides = []
        if hasattr(deck_data, 'slides'):
            slides = getattr(deck_data, 'slides', []) or []
        elif isinstance(deck_data, dict):
            slides = deck_data.get('slides', []) or []
            
        target_slide = None
        for slide in slides:
            slide_id_val = getattr(slide, 'id', None)
            if slide_id_val is None and isinstance(slide, dict):
                slide_id_val = slide.get('id')
            if slide_id_val == slide_id:
                target_slide = slide
                break
                
        if not target_slide:
            return False
            
        # Get slide components
        components = []
        if hasattr(target_slide, 'components'):
            components = getattr(target_slide, 'components', []) or []
        elif isinstance(target_slide, dict):
            components = target_slide.get('components', []) or []
            
        # Extract team brands metadata for logging/diagnostics
        try:
            for component in components:
                ctype = component.get('type') if isinstance(component, dict) else getattr(component, 'type', None)
                props = component.get('props') if isinstance(component, dict) else getattr(component, 'props', {})
                meta = (props or {}).get('metadata', {}) if isinstance(props, dict) else {}
                if ctype == 'Shape' and isinstance(meta, dict) and meta.get('kind') == 'team_brands':
                    logger.info(f"🧩 Detected team brands for this slide: {meta.get('brands')}")
                    break
        except Exception:
            pass

        # Check for text components in center area
        center_content_count = 0
        center_area_x = (400, 1520)  # Center 70% of slide width (1920px)
        center_area_y = (200, 880)   # Center 70% of slide height (1080px)
        
        for component in components:
            comp_type = getattr(component, 'type', None)
            props = getattr(component, 'props', None)
            
            if comp_type is None and isinstance(component, dict):
                comp_type = component.get('type')
                props = component.get('props', {})
                
            logger.info(f"🔍 Component: type={comp_type}, props_keys={list(props.keys()) if isinstance(props, dict) else 'none'}")
            
            # Skip background and decorative elements
            if comp_type in ['Background', 'Lines']:
                continue
                
            # Check if component is in center area
            if isinstance(props, dict) and 'position' in props:
                pos = props['position']
                if isinstance(pos, dict):
                    x = pos.get('x', 0)
                    y = pos.get('y', 0)
                    
                    logger.info(f"📍 Component {comp_type} at ({x}, {y})")
                    
                    # Check if position overlaps with center area
                    if (center_area_x[0] <= x <= center_area_x[1] and 
                        center_area_y[0] <= y <= center_area_y[1]):
                        center_content_count += 1
                        logger.info(f"✅ Component {comp_type} IS in center area")
                    else:
                        logger.info(f"❌ Component {comp_type} NOT in center area")
                else:
                    logger.info(f"⚠️ Component {comp_type} has non-dict position: {pos}")
            else:
                logger.info(f"⚠️ Component {comp_type} missing position in props")
                        
        # If there are 3+ components in center area, consider it crowded
        logger.info(f"📊 Found {center_content_count} components in center area")
        is_crowded = center_content_count >= 3
        logger.info(f"📊 Center area crowded: {is_crowded} (threshold: 3)")
        return is_crowded
        
    except Exception as e:
        logger.warning(f"❌ Error checking center content: {e}")
        return False  # Default to not crowded if we can't determine