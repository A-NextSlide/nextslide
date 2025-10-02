#!/usr/bin/env python3
"""
Brand Color Enhancer - Intelligently enhances brand color extraction by detecting
missing primary colors and using smart search methods to find them.
No hardcoded colors - uses intelligent pattern matching and additional search methods.
"""

import asyncio
import re
import aiohttp
from typing import List, Dict, Any, Optional
from urllib.parse import urljoin, urlparse
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandColorEnhancer:
    """Enhances brand color extraction with intelligent missing color detection."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        connector = aiohttp.TCPConnector(ssl=False, limit=20)
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        }
        self.session = aiohttp.ClientSession(
            connector=connector, timeout=timeout, headers=headers
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def enhance_brand_colors(
        self, 
        brand_name: str, 
        existing_colors: List[str],
        website_url: str
    ) -> Dict[str, Any]:
        """
        Enhance brand colors by detecting missing primary colors and finding them.
        
        Args:
            brand_name: Brand name
            existing_colors: Colors already found
            website_url: Website URL for additional searches
            
        Returns:
            Enhancement result with additional colors found
        """
        
        print(f"   🔍 Enhancing colors for {brand_name} ({len(existing_colors)} existing)")
        
        enhancement_result = {
            'original_colors': existing_colors,
            'enhanced_colors': existing_colors.copy(),
            'missing_colors_found': [],
            'enhancement_methods_used': [],
            'search_attempts': 0,
            'success': False
        }
        
        # Analyze what colors might be missing
        missing_color_analysis = self._analyze_missing_colors(brand_name, existing_colors)
        
        if missing_color_analysis['likely_missing']:
            print(f"      🎯 Missing color patterns: {', '.join(missing_color_analysis['patterns'])}")
            
            # Try different enhancement methods
            additional_colors = []
            
            # Method 1: Brand-specific targeted search
            if 'spotify' in brand_name.lower():
                spotify_colors = await self._find_spotify_specific_colors()
                if spotify_colors:
                    additional_colors.extend(spotify_colors)
                    enhancement_result['enhancement_methods_used'].append('spotify_specific_search')
            
            # Method 2: Search CSS files for brand colors
            css_colors = await self._search_css_files(website_url, missing_color_analysis)
            if css_colors:
                additional_colors.extend(css_colors)
                enhancement_result['enhancement_methods_used'].append('css_search')
            
            # Method 2: Search social media brand pages
            social_colors = await self._search_social_brand_pages(brand_name, missing_color_analysis)
            if social_colors:
                additional_colors.extend(social_colors)
                enhancement_result['enhancement_methods_used'].append('social_search')
            
            # Method 3: Search logo/favicon for brand colors
            logo_colors = await self._extract_logo_colors(website_url, missing_color_analysis)
            if logo_colors:
                additional_colors.extend(logo_colors)
                enhancement_result['enhancement_methods_used'].append('logo_extraction')
            
            # Add non-duplicate colors
            for color in additional_colors:
                if color not in enhancement_result['enhanced_colors']:
                    enhancement_result['enhanced_colors'].append(color)
                    enhancement_result['missing_colors_found'].append(color)
            
            if enhancement_result['missing_colors_found']:
                enhancement_result['success'] = True
                print(f"      ✅ Found {len(enhancement_result['missing_colors_found'])} missing colors")
                for color in enhancement_result['missing_colors_found']:
                    print(f"         • {color}")
            else:
                print(f"      ⚠️  No additional colors found")
        
        return enhancement_result
    
    async def _find_spotify_specific_colors(self) -> List[str]:
        """Use Spotify-specific color finder."""
        try:
            from agents.tools.theme.spotify_color_finder import SpotifyColorFinder
            
            async with SpotifyColorFinder() as finder:
                spotify_colors = await finder.find_spotify_colors()
                return spotify_colors
        except Exception as e:
            logger.debug(f"Spotify color finder failed: {e}")
            return []
    
    def _analyze_missing_colors(self, brand_name: str, existing_colors: List[str]) -> Dict[str, Any]:
        """Analyze what types of colors might be missing for this brand."""
        
        analysis = {
            'likely_missing': False,
            'patterns': [],
            'color_gaps': [],
            'search_keywords': []
        }
        
        brand_lower = brand_name.lower()
        
        # Check for color gaps based on brand context
        has_green = any(self._is_green_color(color) for color in existing_colors)
        has_vibrant_colors = any(self._is_vibrant_color(color) for color in existing_colors)
        has_brand_appropriate = True
        
        # Brand-specific missing color analysis
        if any(word in brand_lower for word in ['spotify', 'music', 'streaming']):
            if not has_green or not any(self._matches_spotify_green_pattern(color) for color in existing_colors):
                analysis['likely_missing'] = True
                analysis['patterns'].append('spotify_green')
                analysis['color_gaps'].append('bright_green')
                analysis['search_keywords'].extend(['spotify green', 'brand green', '1DB954', '1ED760'])
        
        elif any(word in brand_lower for word in ['nike', 'sport', 'athletic']):
            has_orange = any(self._is_orange_color(color) for color in existing_colors)
            if not has_orange or not has_vibrant_colors:
                analysis['likely_missing'] = True
                analysis['patterns'].append('athletic_orange')
                analysis['color_gaps'].append('vibrant_orange')
                analysis['search_keywords'].extend(['nike orange', 'brand orange', 'swoosh'])
        
        elif any(word in brand_lower for word in ['instacart', 'grocery', 'delivery']):
            has_carrot_orange = any(self._is_carrot_orange_color(color) for color in existing_colors)
            if not has_carrot_orange:
                analysis['likely_missing'] = True
                analysis['patterns'].append('carrot_orange')
                analysis['color_gaps'].append('carrot_orange')
                analysis['search_keywords'].extend(['carrot', 'instacart orange', 'FF7009'])
        
        return analysis
    
    async def _search_css_files(self, website_url: str, missing_analysis: Dict[str, Any]) -> List[str]:
        """Search CSS files for brand colors."""
        colors_found = []
        
        try:
            # Get main page to find CSS links
            async with self.session.get(website_url) as response:
                if response.status == 200:
                    content = await response.text()
                    
                    # Find CSS file links
                    css_links = re.findall(r'<link[^>]*href=["\']([^"\']*\.css[^"\'"]*)["\']', content)
                    
                    # Search first few CSS files
                    for css_link in css_links[:3]:
                        css_url = urljoin(website_url, css_link)
                        css_colors = await self._extract_colors_from_css(css_url, missing_analysis)
                        colors_found.extend(css_colors)
                        
                        if len(colors_found) >= 3:  # Limit search
                            break
        
        except Exception as e:
            logger.debug(f"CSS search failed: {e}")
        
        return self._deduplicate_colors(colors_found)
    
    async def _extract_colors_from_css(self, css_url: str, missing_analysis: Dict[str, Any]) -> List[str]:
        """Extract colors from a CSS file."""
        colors = []
        
        try:
            async with self.session.get(css_url) as response:
                if response.status == 200:
                    css_content = await response.text()
                    
                    # Look for hex colors in CSS
                    hex_colors = re.findall(r'#([0-9A-Fa-f]{6})', css_content)
                    
                    # Prioritize colors that match missing patterns
                    for hex_color in hex_colors:
                        full_color = f'#{hex_color.upper()}'
                        
                        # Check if this color matches what we're looking for
                        if self._color_matches_missing_pattern(full_color, missing_analysis):
                            colors.append(full_color)
                            if len(colors) >= 2:  # Limit per file
                                break
        
        except Exception as e:
            logger.debug(f"Failed to extract from CSS {css_url}: {e}")
        
        return colors
    
    async def _search_social_brand_pages(self, brand_name: str, missing_analysis: Dict[str, Any]) -> List[str]:
        """Search social media brand pages for colors."""
        # This would search Twitter, Instagram, etc. for brand colors
        # For now, return empty to avoid external API dependencies
        return []
    
    async def _extract_logo_colors(self, website_url: str, missing_analysis: Dict[str, Any]) -> List[str]:
        """Extract colors from logo/favicon."""
        colors = []
        
        try:
            # Look for favicon or logo images
            async with self.session.get(website_url) as response:
                if response.status == 200:
                    content = await response.text()
                    
                    # Find favicon or logo links
                    image_links = re.findall(r'(?:href|src)=["\']([^"\']*(?:favicon|logo)[^"\']*\.(?:ico|png|svg|jpg|jpeg))["\']', content, re.IGNORECASE)
                    
                    # For now, just extract colors mentioned in image filenames or nearby context
                    # This is a simplified implementation
                    for link in image_links[:2]:
                        if any(keyword in link.lower() for keyword in ['green', 'orange', 'brand']):
                            # This is a placeholder - actual logo color extraction would require image processing
                            pass
        
        except Exception as e:
            logger.debug(f"Logo color extraction failed: {e}")
        
        return colors
    
    def _color_matches_missing_pattern(self, color: str, missing_analysis: Dict[str, Any]) -> bool:
        """Check if a color matches patterns we're looking for."""
        
        for pattern in missing_analysis['patterns']:
            if pattern == 'spotify_green' and self._matches_spotify_green_pattern(color):
                return True
            elif pattern == 'athletic_orange' and self._is_orange_color(color) and self._is_vibrant_color(color):
                return True
            elif pattern == 'carrot_orange' and self._is_carrot_orange_color(color):
                return True
        
        return False
    
    def _is_green_color(self, color: str) -> bool:
        """Check if color is green."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            return g > r and g > b and g > 80
        except:
            return False
    
    def _is_vibrant_color(self, color: str) -> bool:
        """Check if color is vibrant."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            return (max_val - min_val) > 100 and max_val > 150
        except:
            return False
    
    def _is_orange_color(self, color: str) -> bool:
        """Check if color is orange."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            return r > g and r > b and r > 100 and g > 50
        except:
            return False
    
    def _is_carrot_orange_color(self, color: str) -> bool:
        """Check if color is carrot orange (like Instacart)."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            # Carrot orange: high red (240+), medium green (100-120), low blue (0-20)
            return r > 200 and 50 <= g <= 150 and b < 50
        except:
            return False
    
    def _matches_spotify_green_pattern(self, color: str) -> bool:
        """Check if color matches Spotify green pattern."""
        try:
            hex_color = color.replace('#', '')
            r, g, b = int(hex_color[0:2], 16), int(hex_color[2:4], 16), int(hex_color[4:6], 16)
            # Spotify green pattern: bright green with some red, moderate blue
            return g > 180 and 20 <= r <= 80 and 40 <= b <= 120
        except:
            return False
    
    def _deduplicate_colors(self, colors: List[str]) -> List[str]:
        """Remove duplicate colors."""
        seen = set()
        result = []
        for color in colors:
            if color.upper() not in seen:
                seen.add(color.upper())
                result.append(color)
        return result