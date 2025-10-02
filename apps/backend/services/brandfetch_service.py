#!/usr/bin/env python3
"""
Brandfetch Service - Unified brand data extraction using Brandfetch Brand API
Replaces existing logo/brand extraction with comprehensive Brandfetch integration.
"""

import asyncio
import aiohttp
import os
from typing import Dict, Any, Optional, List
from urllib.parse import quote, urlparse
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandfetchService:
    """Service for fetching comprehensive brand data from Brandfetch API."""
    
    def __init__(self, brand_api_key: Optional[str] = None, logo_api_key: Optional[str] = None):
        self.brand_api_key = brand_api_key or os.getenv('BRANDFETCH_BRAND_API_KEY', 'dgRlli7Uvwe07jhUZTdaGfZfJOiqSwlxkM7rje3ZyzE=')
        self.logo_api_key = logo_api_key or os.getenv('BRANDFETCH_LOGO_API_KEY', '1idvSUbEOW-TPQW5G_y')
        self.base_url = "https://api.brandfetch.io/v2"
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        self.session = aiohttp.ClientSession(timeout=timeout)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    def _get_headers(self, use_logo_api: bool = False) -> Dict[str, str]:
        """Get authorization headers for API requests."""
        api_key = self.logo_api_key if use_logo_api else self.brand_api_key
        return {
            'Authorization': f'Bearer {api_key}',
            'Content-Type': 'application/json',
            'User-Agent': 'SlideBackend/1.0'
        }
    
    async def get_brand_data(self, identifier: str) -> Dict[str, Any]:
        """
        Get comprehensive brand data using Brandfetch Brand API.
        
        Args:
            identifier: Domain (nike.com), brand ID, ISIN, or stock ticker
            
        Returns:
            Dict with brand data including logos, colors, fonts, company info
        """
        if not self.session:
            raise RuntimeError("Service must be used as async context manager")
        
        # Clean identifier - handle various input formats
        clean_identifier = self._clean_identifier(identifier)
        
        url = f"{self.base_url}/brands/{quote(clean_identifier)}"
        headers = self._get_headers(use_logo_api=False)
        
        try:
            print(f"🔍 Fetching brand data from Brandfetch: {clean_identifier}")
            
            async with self.session.get(url, headers=headers) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._process_brand_response(data, clean_identifier)
                elif response.status == 404:
                    logger.warning(f"Brand not found in Brandfetch: {clean_identifier}")
                    return {"error": "brand_not_found", "identifier": clean_identifier}
                else:
                    error_text = await response.text()
                    logger.error(f"Brandfetch API error {response.status}: {error_text}")
                    return {"error": f"api_error_{response.status}", "message": error_text}
                    
        except asyncio.TimeoutError:
            logger.error(f"Timeout fetching brand data for: {clean_identifier}")
            return {"error": "timeout", "identifier": clean_identifier}
        except Exception as e:
            logger.error(f"Error fetching brand data: {e}")
            return {"error": "fetch_error", "message": str(e)}

    async def search_brands(self, query: str, limit: int = 5) -> List[Dict[str, Any]]:
        """Search Brandfetch for brands by name and return results (first match first).

        Tries both /search/{query} and /search?query= paths for robustness.
        """
        if not self.session:
            raise RuntimeError("Service must be used as async context manager")

        headers = self._get_headers(use_logo_api=False)
        results: List[Dict[str, Any]] = []

        # Candidate endpoints (some SDKs use path param, others query param)
        endpoint_variants = [
            f"{self.base_url}/search/{quote(query)}",
            f"{self.base_url}/search?query={quote(query)}"
        ]

        for idx, url in enumerate(endpoint_variants):
            try:
                per_req_timeout = aiohttp.ClientTimeout(total=5)
                async with self.session.get(url, headers=headers, timeout=per_req_timeout) as response:
                    if response.status == 200:
                        data = await response.json()
                        # Results may be list or wrapped; normalize to list
                        if isinstance(data, list):
                            results = data
                        elif isinstance(data, dict):
                            # Common shapes: {"results": [...] } or similar
                            if isinstance(data.get("results"), list):
                                results = data.get("results", [])
                            else:
                                # Fallback to any list-like value
                                for v in data.values():
                                    if isinstance(v, list):
                                        results = v
                                        break
                        break
                    elif response.status in (404, 400):
                        # Try next variant
                        continue
                    else:
                        err = await response.text()
                        logger.debug(f"Brandfetch search API {response.status}: {err}")
                        continue
            except asyncio.TimeoutError:
                logger.debug(f"Brandfetch search timeout for variant {idx+1}: {url}")
                continue
            except Exception as e:
                logger.debug(f"Brandfetch search error for variant {idx+1}: {e}")
                continue

        if limit and len(results) > limit:
            return results[:limit]
        return results

    async def get_brand_data_with_search(self, identifier: str) -> Dict[str, Any]:
        """Resolve brand data; if identifier is a name, use Brandfetch Search and pick the first match.

        Falls back to domain heuristics when search yields nothing.
        """
        if not self.session:
            raise RuntimeError("Service must be used as async context manager")

        raw = (identifier or "").strip()
        looks_like_domain = "." in raw and " " not in raw

        # If already a domain/id, fetch directly
        if looks_like_domain:
            return await self.get_brand_data(raw)

        # Otherwise, try Brandfetch search first
        search_results = await self.search_brands(raw, limit=5)
        candidate_identifiers: List[str] = []

        for item in search_results:
            # Prefer explicit domain fields
            for key in ["domain", "dns", "website", "url"]:
                v = item.get(key)
                if isinstance(v, str) and v:
                    candidate_identifiers.append(v)
                    break
                if isinstance(v, list) and v:
                    # Some results may contain multiple websites
                    for vv in v:
                        if isinstance(vv, str) and vv:
                            candidate_identifiers.append(vv)
                            break
            # If no domain found, try Brandfetch brand id
            for key in ["id", "brandId", "brand_id"]:
                v = item.get(key)
                if isinstance(v, str) and v:
                    candidate_identifiers.append(v)
                    break

        # Deduplicate while preserving order
        seen = set()
        unique_candidates = []
        for cid in candidate_identifiers:
            if cid not in seen:
                unique_candidates.append(cid)
                seen.add(cid)

        # Try candidates in order
        for cid in unique_candidates:
            result = await self.get_brand_data(cid)
            if not result.get("error"):
                return result

        # Fallback: use heuristics (.com/.org/.net/.edu) if search failed
        return await self.search_by_name(raw)
    
    def _clean_identifier(self, identifier: str) -> str:
        """Clean and prepare identifier for API call."""
        if not identifier:
            return ""
        
        # Remove common prefixes/protocols
        clean = identifier.lower().strip()
        clean = clean.replace('https://', '').replace('http://', '')
        clean = clean.replace('www.', '')
        
        # If it looks like a URL, extract domain
        if '/' in clean:
            clean = clean.split('/')[0]
        
        # Remove trailing slash or query params
        clean = clean.split('?')[0].split('#')[0]
        
        # Remove symbols and apostrophes from brand names (e.g., "mcdonald's" -> "mcdonalds")
        if '.' not in clean:  # Only for brand names, not existing domains
            import re
            # Remove all non-alphanumeric characters except existing dots
            clean = re.sub(r"[^a-zA-Z0-9.]", "", clean)
        
        # Auto-append .com for brand names without domains
        if '.' not in clean and clean.isalpha() and len(clean) > 1:
            logger.info(f"🔄 Auto-appending .com to brand name: {clean}")
            clean = f"{clean}.com"
        
        return clean
    
    def _process_brand_response(self, data: Dict[str, Any], identifier: str) -> Dict[str, Any]:
        """Process Brandfetch brand API response into standardized format."""
        
        result = {
            "identifier": identifier,
            "brand_name": data.get("name", ""),
            "domain": data.get("domain", ""),
            "description": data.get("description", ""),
            "quality_score": data.get("claimed", False),  # Brandfetch's quality indicator
            
            # Logos with themes and formats
            "logos": self._extract_logos(data.get("logos", [])),
            
            # Color palette
            "colors": self._extract_colors(data.get("colors", [])),
            
            # Typography
            "fonts": self._extract_fonts(data.get("fonts", [])),
            
            # Company information
            "company_info": self._extract_company_info(data),
            
            # Social links
            "social_links": self._extract_social_links(data.get("links", [])),
            
            # Quality and metadata
            "extraction_method": "brandfetch_api",
            "confidence_score": 95 if data.get("claimed") else 80,  # High confidence for API data
            "source": "brandfetch"
        }
        
        return result
    
    def _extract_logos(self, logos_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract and organize logo data by theme and type."""
        logos = {
            "light": [],
            "dark": [],
            "icons": [],
            "other": []
        }
        
        for logo_item in logos_data:
            theme = logo_item.get("theme", "other")
            logo_type = logo_item.get("type", "logo")
            formats = logo_item.get("formats", [])
            
            processed_formats = []
            for format_data in formats:
                processed_formats.append({
                    "url": format_data.get("src", ""),
                    "format": format_data.get("format", ""),
                    "width": format_data.get("width"),
                    "height": format_data.get("height"),
                    "size": format_data.get("size"),
                    "background": format_data.get("background", "transparent")
                })
            
            logo_entry = {
                "type": logo_type,
                "theme": theme,
                "formats": processed_formats,
                "tags": logo_item.get("tags", [])
            }
            
            # Organize by theme and type
            if logo_type == "icon":
                logos["icons"].append(logo_entry)
            elif theme in ["light", "dark"]:
                logos[theme].append(logo_entry)
            else:
                logos["other"].append(logo_entry)
        
        return logos
    
    def _extract_colors(self, colors_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract and categorize brand colors."""
        colors = {
            "primary": [],
            "secondary": [],
            "accent": [],
            "all": [],
            "hex_list": []  # Simple list for backward compatibility
        }
        
        for color_item in colors_data:
            hex_color = color_item.get("hex", "")
            color_type = color_item.get("type", "primary")
            brightness = color_item.get("brightness")
            
            if hex_color and hex_color.startswith("#"):
                color_entry = {
                    "hex": hex_color.upper(),
                    "type": color_type,
                    "brightness": brightness,
                    "name": color_item.get("name", "")
                }
                
                colors["all"].append(color_entry)
                colors["hex_list"].append(hex_color.upper())
                
                # Categorize by type
                if color_type in colors:
                    colors[color_type].append(color_entry)
        
        return colors
    
    def _extract_fonts(self, fonts_data: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Extract typography information."""
        fonts = {
            "primary": [],
            "secondary": [],
            "all": [],
            "names": []  # Simple list for backward compatibility
        }
        
        for font_item in fonts_data:
            font_name = font_item.get("name", "")
            font_type = font_item.get("type", "primary")
            
            if font_name:
                font_entry = {
                    "name": font_name,
                    "type": font_type,
                    "weight": font_item.get("weight"),
                    "style": font_item.get("style", "normal"),
                    "origin": font_item.get("origin", "")
                }
                
                fonts["all"].append(font_entry)
                fonts["names"].append(font_name)
                
                # Categorize by type
                if font_type in fonts:
                    fonts[font_type].append(font_entry)
        
        return fonts
    
    def _extract_company_info(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Extract company information."""
        return {
            "name": data.get("name", ""),
            "domain": data.get("domain", ""),
            "description": data.get("description", ""),
            "industry": data.get("industry", ""),
            "company_type": data.get("companyType", ""),
            "claimed": data.get("claimed", False),
            "verified": data.get("verified", False)
        }
    
    def _extract_social_links(self, links_data: List[Dict[str, Any]]) -> Dict[str, str]:
        """Extract social media links."""
        social_links = {}
        
        for link_item in links_data:
            name = link_item.get("name", "")
            url = link_item.get("url", "")
            
            if name and url:
                social_links[name.lower()] = url
        
        return social_links
    
    def get_best_logo(self, brand_data: Dict[str, Any], prefer_theme: str = "light", prefer_format: str = "svg") -> Optional[str]:
        """
        Get the best logo URL from brand data.
        
        Args:
            brand_data: Processed brand data from get_brand_data()
            prefer_theme: "light" or "dark"
            prefer_format: "svg", "png", "webp", etc.
            
        Returns:
            Best logo URL or None
        """
        logos = brand_data.get("logos", {})
        
        # Try preferred theme first
        theme_logos = logos.get(prefer_theme, [])
        if theme_logos:
            for logo in theme_logos:
                url = self._get_best_format_url(logo.get("formats", []), prefer_format)
                if url:
                    return url
        
        # Try other theme
        other_theme = "dark" if prefer_theme == "light" else "light"
        other_logos = logos.get(other_theme, [])
        if other_logos:
            for logo in other_logos:
                url = self._get_best_format_url(logo.get("formats", []), prefer_format)
                if url:
                    return url
        
        # Try icons as fallback
        icon_logos = logos.get("icons", [])
        if icon_logos:
            for logo in icon_logos:
                url = self._get_best_format_url(logo.get("formats", []), prefer_format)
                if url:
                    return url
        
        # Try any other logos
        other_logos = logos.get("other", [])
        if other_logos:
            for logo in other_logos:
                url = self._get_best_format_url(logo.get("formats", []), prefer_format)
                if url:
                    return url
        
        return None
    
    def _get_best_format_url(self, formats: List[Dict[str, Any]], prefer_format: str) -> Optional[str]:
        """Get the best URL from available formats."""
        if not formats:
            return None
        
        # Try preferred format first
        for format_data in formats:
            if format_data.get("format", "").lower() == prefer_format.lower():
                return format_data.get("url", "")
        
        # Fallback priority: SVG > PNG > WebP > others
        format_priority = ["svg", "png", "webp", "jpeg", "jpg"]
        
        for preferred in format_priority:
            for format_data in formats:
                if format_data.get("format", "").lower() == preferred:
                    return format_data.get("url", "")
        
        # Return first available
        return formats[0].get("url", "") if formats else None
    
    def get_primary_colors(self, brand_data: Dict[str, Any], max_colors: int = 8) -> List[str]:
        """Get primary brand colors as hex list."""
        colors = brand_data.get("colors", {})
        
        # Try primary colors first
        primary = colors.get("primary", [])
        if primary:
            return [c["hex"] for c in primary[:max_colors]]
        
        # Fallback to all colors
        all_colors = colors.get("hex_list", [])
        return all_colors[:max_colors]
    
    def get_categorized_colors(self, brand_data: Dict[str, Any]) -> Dict[str, List[str]]:
        """Get colors categorized by their intended use (background, accent, text, etc.)."""
        colors = brand_data.get("colors", {})
        
        # Extract colors by type from Brandfetch
        primary_colors = [c["hex"] for c in colors.get("primary", [])]
        secondary_colors = [c["hex"] for c in colors.get("secondary", [])]
        accent_colors = [c["hex"] for c in colors.get("accent", [])]
        all_colors = colors.get("hex_list", [])
        
        # Intelligent categorization based on color properties
        backgrounds = []
        text_colors = []
        accent_final = []
        
        # Analyze colors for background suitability (darker colors generally work better)
        for color_hex in all_colors:
            luminance = self._calculate_luminance(color_hex)
            
            # Dark colors (low luminance) are good for backgrounds
            if luminance < 0.3:
                backgrounds.append(color_hex)
            # Very light colors might also work as backgrounds
            elif luminance > 0.85:
                backgrounds.append(color_hex)
            # Mid-range colors are good for accents
            else:
                accent_final.append(color_hex)
        
        # Generate appropriate text colors based on background colors
        if backgrounds:
            # For each background, determine best contrasting text color
            for bg_color in backgrounds[:3]:  # Check first 3 backgrounds
                bg_luminance = self._calculate_luminance(bg_color)
                
                # Light background needs dark text, dark background needs light text
                if bg_luminance > 0.5:
                    # Light background - use dark text
                    if "#333333" not in text_colors:
                        text_colors.append("#333333")
                    if "#000000" not in text_colors:
                        text_colors.append("#000000")
                else:
                    # Dark background - use light text  
                    if "#FFFFFF" not in text_colors:
                        text_colors.append("#FFFFFF")
                    if "#F5F5F5" not in text_colors:
                        text_colors.append("#F5F5F5")
        else:
            # Default text colors if no backgrounds found
            text_colors = ["#333333", "#666666", "#FFFFFF"]
        
        # For presentations, prioritize light backgrounds first, then dark backgrounds
        light_backgrounds = [c for c in backgrounds if self._calculate_luminance(c) > 0.7]
        dark_backgrounds = [c for c in backgrounds if self._calculate_luminance(c) < 0.3]
        ordered_backgrounds = light_backgrounds + dark_backgrounds
        
        # Use Brandfetch categories if available, otherwise use our intelligent categorization
        result = {
            "primary": primary_colors or all_colors[:2],
            "secondary": secondary_colors or all_colors[2:4] if len(all_colors) > 2 else [],
            "accent": accent_colors or accent_final[:3],
            "backgrounds": ordered_backgrounds[:4],  # Light backgrounds first for slides
            "text": text_colors[:4],          # Top 4 text colors
            "all": all_colors
        }
        
        return result
    
    def _calculate_luminance(self, hex_color: str) -> float:
        """Calculate relative luminance of a color (0 = black, 1 = white)."""
        try:
            # Remove # if present
            hex_color = hex_color.lstrip('#')
            
            # Convert to RGB
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0  
            b = int(hex_color[4:6], 16) / 255.0
            
            # Apply gamma correction
            def linearize(c):
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
            
            r_lin = linearize(r)
            g_lin = linearize(g)
            b_lin = linearize(b)
            
            # Calculate luminance using ITU-R BT.709 coefficients
            return 0.2126 * r_lin + 0.7152 * g_lin + 0.0722 * b_lin
            
        except (ValueError, IndexError):
            # Return middle luminance for invalid colors
            return 0.5
    
    def get_background_colors(self, brand_data: Dict[str, Any], max_colors: int = 4) -> List[str]:
        """Get colors suitable for backgrounds."""
        categorized = self.get_categorized_colors(brand_data)
        return categorized["backgrounds"][:max_colors]
    
    def get_text_colors(self, brand_data: Dict[str, Any], background_color: str = None) -> List[str]:
        """Get colors suitable for text, optionally optimized for a specific background."""
        categorized = self.get_categorized_colors(brand_data)
        
        if background_color:
            # Generate optimal text colors for the specific background
            bg_luminance = self._calculate_luminance(background_color)
            
            if bg_luminance > 0.5:
                # Light background - prioritize dark text colors
                dark_texts = ["#333333", "#000000", "#2C2C2C", "#444444"]
                return [t for t in dark_texts if self._contrast_ratio(background_color, t) >= 4.5][:4]
            else:
                # Dark background - prioritize light text colors  
                light_texts = ["#FFFFFF", "#F5F5F5", "#EEEEEE", "#DDDDDD"]
                return [t for t in light_texts if self._contrast_ratio(background_color, t) >= 4.5][:4]
        
        return categorized["text"]
    
    def get_accent_colors(self, brand_data: Dict[str, Any], max_colors: int = 3) -> List[str]:
        """Get colors suitable for accents, buttons, highlights."""
        categorized = self.get_categorized_colors(brand_data)
        return categorized["accent"][:max_colors]
    
    def _contrast_ratio(self, color1: str, color2: str) -> float:
        """Calculate contrast ratio between two colors (1-21, where 21 is highest contrast)."""
        lum1 = self._calculate_luminance(color1)
        lum2 = self._calculate_luminance(color2)
        
        # Ensure the lighter color is in numerator
        lighter = max(lum1, lum2)
        darker = min(lum1, lum2)
        
        return (lighter + 0.05) / (darker + 0.05)
    
    def get_brand_fonts(self, brand_data: Dict[str, Any]) -> List[str]:
        """Get brand fonts as simple name list."""
        fonts = brand_data.get("fonts", {})
        return fonts.get("names", [])
    
    async def search_by_domain(self, domain: str) -> Dict[str, Any]:
        """Search for brand by domain (convenience method)."""
        return await self.get_brand_data(domain)
    
    async def search_by_name(self, brand_name: str) -> Dict[str, Any]:
        """
        Search for brand by name.
        Note: Brandfetch works best with domains, so this tries to guess domain.
        """
        # Try to construct domain from brand name
        clean_name = brand_name.lower().replace(' ', '').replace('&', '').replace('.', '')
        
        # Remove common suffixes
        for suffix in ['inc', 'llc', 'corp', 'corporation', 'company', 'co', 'ltd']:
            if clean_name.endswith(suffix):
                clean_name = clean_name[:-len(suffix)]
        
        # Try common TLDs
        potential_domains = [
            f"{clean_name}.com",
            f"{clean_name}.org",
            f"{clean_name}.net",
        ]
        
        # Try each domain
        for domain in potential_domains:
            result = await self.get_brand_data(domain)
            if not result.get("error"):
                return result
        
        # If no domain works, return error
        return {
            "error": "domain_not_found",
            "message": f"Could not find domain for brand: {brand_name}",
            "tried_domains": potential_domains
        }


# Utility functions for backward compatibility with existing code

async def get_brand_logo_and_colors(brand_identifier: str) -> Dict[str, Any]:
    """
    Convenience function to get logo and colors for a brand.
    
    Args:
        brand_identifier: Domain, brand name, or URL
        
    Returns:
        Dict with logo_url, colors, fonts, and metadata
    """
    async with BrandfetchService() as service:
        brand_data = await service.get_brand_data(brand_identifier)
        
        if brand_data.get("error"):
            return brand_data
        
        # Extract key data
        result = {
            "logo_url": service.get_best_logo(brand_data),
            "logo_url_dark": service.get_best_logo(brand_data, prefer_theme="dark"),
            "colors": service.get_primary_colors(brand_data),
            "fonts": service.get_brand_fonts(brand_data),
            "brand_name": brand_data.get("brand_name", ""),
            "domain": brand_data.get("domain", ""),
            "confidence_score": brand_data.get("confidence_score", 0),
            "source": "brandfetch"
        }
        
        return result


async def extract_complete_brand_brandfetch(brand_name: str, website_url: Optional[str] = None) -> Dict[str, Any]:
    """
    Extract complete brand data using Brandfetch - replacement for HolisticBrandExtractor.
    
    Args:
        brand_name: Brand name
        website_url: Optional website URL (will be used as identifier if provided)
        
    Returns:
        Dict with comprehensive brand data compatible with existing interfaces
    """
    identifier = website_url if website_url else brand_name
    
    async with BrandfetchService() as service:
        brand_data = await service.get_brand_data(identifier)
        
        if brand_data.get("error"):
            # Return compatible error format
            return {
                "brand_name": brand_name,
                "website_url": website_url,
                "final_colors": [],
                "final_fonts": [],
                "website_logo_url": None,
                "confidence_score": 0,
                "extraction_method": "brandfetch_failed",
                "error": brand_data.get("error"),
                "source": "brandfetch"
            }
        
        # Convert to format compatible with existing HolisticBrandExtractor interface
        # Use intelligent color categorization
        categorized_colors = service.get_categorized_colors(brand_data)
        colors = categorized_colors.get("all", [])
        backgrounds = categorized_colors.get("backgrounds", [])
        text_colors = categorized_colors.get("text", [])
        accent_colors = categorized_colors.get("accent", [])
        
        fonts = service.get_brand_fonts(brand_data)
        logo_url = service.get_best_logo(brand_data, prefer_theme="light")
        logo_url_dark = service.get_best_logo(brand_data, prefer_theme="dark")
        
        # Generate optimal text colors based on primary background
        if backgrounds:
            optimal_text = service.get_text_colors(brand_data, backgrounds[0])
            if optimal_text:
                text_colors = optimal_text
        
        return {
            "brand_name": brand_data.get("brand_name", brand_name),
            "website_url": website_url or brand_data.get("domain", ""),
            
            # Main results (compatible with existing code)
            "final_colors": colors[:12],  # Limit to 12 colors
            "final_fonts": fonts,
            "website_logo_url": logo_url,
            "website_logo_url_dark": logo_url_dark,
            
            # Properly categorized colors (enhanced from simple fallback)
            "website_colors": colors,
            "website_fonts": fonts,
            "website_backgrounds": backgrounds,
            "website_headers": accent_colors[:2] if accent_colors else colors[:2],
            "website_buttons": accent_colors if accent_colors else colors[1:3] if len(colors) > 1 else colors[:1],
            "website_text": text_colors,
            
            # Additional categorized color data
            "color_categories": {
                "primary": categorized_colors.get("primary", []),
                "secondary": categorized_colors.get("secondary", []),
                "accent": accent_colors,
                "background": backgrounds,
                "text": text_colors
            },
            
            # Brand data from Brandfetch
            "brandfetch_data": brand_data,
            "company_info": brand_data.get("company_info", {}),
            "social_links": brand_data.get("social_links", {}),
            
            # Metadata
            "confidence_score": brand_data.get("confidence_score", 90),
            "extraction_method": "brandfetch_api",
            "total_elements_analyzed": len(colors) + len(fonts) + (1 if logo_url else 0),
            "source": "brandfetch",
            "quality_score": brand_data.get("quality_score", False),
            "color_categorization": "intelligent_brandfetch"
        }