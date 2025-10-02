#!/usr/bin/env python3
"""
Brand Colors Database - Integration with SimpleBrandfetchCache
This module provides brand color lookup from the brandfetch_cache database.
"""

import os
import asyncio
from typing import Dict, Any, Optional, List
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

def get_brand_colors(brand_name: str) -> Optional[Dict[str, Any]]:
    """
    Synchronous wrapper for getting brand colors from brandfetch cache.
    This function is called by BrandColorSearcher.search_brand_colors()
    
    Args:
        brand_name: Brand name to search for (e.g., "McDonald's", "mcdonalds.com")
        
    Returns:
        Dict with brand data or None if not found
        Expected format:
        {
            "colors": ["#FFBC0D", "#DB0007", "#FFFFFF"],
            "name": "McDonald's",
            "fonts": ["Speedee Bold", "Speedee"],
            "logo_url": "https://...",
            "source": "brandfetch_cache"
        }
    """
    try:
        # Run the async function in the current event loop or create a new one
        loop = None
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            pass
        
        if loop and loop.is_running():
            # We're already in an async context, but need to run sync
            # Create a new thread to run the async function
            import concurrent.futures
            import threading
            
            def run_in_thread():
                new_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(new_loop)
                try:
                    return new_loop.run_until_complete(_get_brand_colors_async(brand_name))
                finally:
                    new_loop.close()
            
            with concurrent.futures.ThreadPoolExecutor() as executor:
                future = executor.submit(run_in_thread)
                return future.result(timeout=10)  # 10 second timeout
        else:
            # No running loop, we can use asyncio.run
            return asyncio.run(_get_brand_colors_async(brand_name))
    
    except Exception as e:
        logger.error(f"Error getting brand colors for {brand_name}: {e}")
        return None

async def _get_brand_colors_async(brand_name: str) -> Optional[Dict[str, Any]]:
    """
    Async function to get brand colors from SimpleBrandfetchCache.
    """
    try:
        from services.simple_brandfetch_cache import SimpleBrandfetchCache
        
        # Get database URL
        db_url = os.getenv('DATABASE_URL')
        if not db_url:
            logger.warning("No DATABASE_URL available for brand color lookup")
            return None
        
        # Prefer search-first: use domain if explicitly present, otherwise use the brand name as-is
        identifier = _extract_domain_or_name(brand_name)
        
        logger.info(f"[BRANDFETCH DB] Looking up brand colors for {brand_name} -> {identifier}")
        
        # Use SimpleBrandfetchCache to get brand data (search-first when identifier is not a domain)
        async with SimpleBrandfetchCache(db_url) as cache_service:
            brand_data = await cache_service.get_brand_data(identifier)
            
            # If the first attempt fails, try a conservative domain heuristic once
            if (not brand_data) or brand_data.get('error'):
                try_domain = _brand_name_to_domain(brand_name)
                if try_domain and try_domain != identifier:
                    brand_data = await cache_service.get_brand_data(try_domain)
            
            if not brand_data:
                logger.info(f"[BRANDFETCH DB] No brand data found for {domain}")
                return None
            
            # Extract colors, fonts, and logo from brand data
            colors_data = brand_data.get('colors', {})
            fonts_data = brand_data.get('fonts', [])
            logos_data = brand_data.get('logos', {})
            
            # Extract color list
            colors = []
            if colors_data:
                if isinstance(colors_data, dict) and colors_data.get('hex_list'):
                    colors = colors_data['hex_list']
                elif isinstance(colors_data, list):
                    # Handle legacy format where colors might be a list
                    colors = [c.get('hex') for c in colors_data if isinstance(c, dict) and c.get('hex')]
            
            # Extract font list  
            fonts = []
            if fonts_data:
                if isinstance(fonts_data, list):
                    # Format 1: Direct list of font objects [{"name": "Playfair Display", ...}, ...]
                    fonts = [f.get('name') for f in fonts_data if isinstance(f, dict) and f.get('name')]
                elif isinstance(fonts_data, dict):
                    # Format 2: Dict with nested structure
                    if fonts_data.get('names'):
                        # Format 2a: {"names": ["Segoe UI", ...], ...}
                        fonts = fonts_data['names']
                    elif fonts_data.get('all'):
                        # Format 2b: {"all": [{"name": "Segoe UI", ...}, ...], ...}
                        all_fonts = fonts_data.get('all', [])
                        fonts = [f.get('name') for f in all_fonts if isinstance(f, dict) and f.get('name')]
            
            # Extract logo URL
            logo_url = None
            if logos_data:
                # Try to get best logo URL from the actual data structure
                for logo_type in ['light', 'dark', 'icons', 'other']:
                    if logo_type in logos_data and logos_data[logo_type]:
                        logo_items = logos_data[logo_type]
                        if isinstance(logo_items, list) and logo_items:
                            # Each item has formats array with actual URLs
                            logo_item = logo_items[0]
                            if isinstance(logo_item, dict) and 'formats' in logo_item:
                                formats = logo_item['formats']
                                if formats and isinstance(formats, list):
                                    # Get the first format's URL
                                    logo_url = formats[0]['url'] if formats[0] else None
                                    if logo_url:
                                        logger.info(f"[BRANDFETCH DB] Found logo URL ({logo_type}): {logo_url}")
                                        break
            
            if colors:
                result = {
                    "colors": colors,
                    "name": brand_data.get('company_name', brand_name),
                    "fonts": fonts,
                    "logo_url": logo_url,
                    "source": "brandfetch_cache",
                    "domain": brand_data.get('domain') or identifier
                }
                
                logger.info(f"[BRANDFETCH DB] ✅ Found brand data for {brand_name}: {len(colors)} colors, {len(fonts)} fonts, logo: {bool(logo_url)}")
                return result
            else:
                logger.info(f"[BRANDFETCH DB] Brand data found but no colors for {domain}")
                return None
                
    except Exception as e:
        logger.error(f"Error in _get_brand_colors_async for {brand_name}: {e}")
        return None

def _brand_name_to_domain(brand_name: str) -> str:
    """
    Convert brand name to likely domain format.
    """
    if not brand_name:
        return ""
    
    # If it already looks like a domain, use it
    if '.' in brand_name and not brand_name.startswith('www.'):
        return brand_name.lower()
    
    # Clean up brand name and convert to domain
    clean_name = brand_name.lower().strip()
    
    # Remove common prefixes/suffixes
    clean_name = clean_name.replace("'", "")  # McDonald's -> McDonalds
    clean_name = clean_name.replace(" ", "")   # Remove spaces
    clean_name = clean_name.replace("-", "")   # Remove hyphens
    
    # Remove common business suffixes
    suffixes = ['inc', 'corp', 'corporation', 'company', 'co', 'llc', 'ltd']
    for suffix in suffixes:
        if clean_name.endswith(suffix):
            clean_name = clean_name[:-len(suffix)].strip()
    
    # Append .com if no domain extension
    if '.' not in clean_name:
        clean_name += '.com'
    
    return clean_name


def _extract_domain_or_name(brand_name: str) -> str:
    """Return an identifier suitable for search-first cache lookup.
    - If input already looks like a domain, return it
    - Otherwise return the original brand_name (so cache layer can do search)
    """
    if not brand_name:
        return ""
    bn = brand_name.strip()
    if '.' in bn and ' ' not in bn:
        return bn.lower()
    return bn