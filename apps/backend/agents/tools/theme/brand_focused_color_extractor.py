#!/usr/bin/env python3
"""
Brand-focused color extractor that targets actual brand colors.
Filters out random UI elements and ads to get core brand identity colors.
"""

import asyncio
import aiohttp
import re
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from collections import Counter
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandFocusedColorExtractor:
    """Extract actual brand colors by focusing on brand elements."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        connector = aiohttp.TCPConnector(ssl=False, limit=100)
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        }
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=headers
        )
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def extract_brand_colors(
        self,
        brand_name: str,
        website_url: str
    ) -> Dict[str, Any]:
        """
        Extract brand colors by focusing on brand elements.
        
        Args:
            brand_name: Name of the brand
            website_url: URL to scrape
            
        Returns:
            Dictionary with extracted brand colors
        """
        
        result = {
            'brand_name': brand_name,
            'url': website_url,
            'colors': [],
            'primary_colors': [],
            'brand_context_colors': [],
            'header_colors': [],
            'logo_colors': [],
            'css_brand_colors': [],
            'total_colors_found': 0,
            'sources': []
        }
        
        try:
            print(f"🎨 Extracting brand colors for {brand_name}")
            
            # Step 1: Get the webpage content
            html_content = await self._fetch_webpage(website_url)
            if not html_content:
                print(f"   ❌ Could not fetch {website_url}")
                return result
            
            # Step 2: Extract colors from brand-focused areas
            brand_colors = await self._extract_brand_focused_colors(
                html_content, website_url, brand_name
            )
            
            # Step 3: Deduplicate and prioritize colors
            final_colors = self._prioritize_brand_colors(brand_colors, brand_name)
            
            result.update({
                'colors': final_colors['all_colors'],
                'primary_colors': final_colors['primary'],
                'brand_context_colors': final_colors['brand_context'],
                'header_colors': final_colors['header'],
                'logo_colors': final_colors['logo'],
                'css_brand_colors': final_colors['css_brand'],
                'total_colors_found': len(final_colors['all_colors']),
                'sources': final_colors['sources']
            })
            
            print(f"   ✅ Found {len(final_colors['all_colors'])} brand colors")
            if final_colors['all_colors']:
                print(f"   🎨 Top colors: {', '.join(final_colors['all_colors'][:5])}")
            
            return result
            
        except Exception as e:
            print(f"   ❌ Error extracting colors for {brand_name}: {e}")
            logger.error(f"Brand color extraction failed: {e}")
            return result
    
    async def _fetch_webpage(self, url: str) -> Optional[str]:
        """Fetch webpage content."""
        try:
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    if 'text/html' in content_type:
                        return await response.text()
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
        return None
    
    async def _extract_brand_focused_colors(
        self, 
        html_content: str, 
        base_url: str,
        brand_name: str
    ) -> Dict[str, List[str]]:
        """Extract colors from brand-focused areas of the page."""
        
        colors_by_source = {
            'header': [],
            'logo_area': [],
            'brand_context': [],
            'css_brand': [],
            'navigation': [],
            'footer': []
        }
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Strategy 1: Extract from header/navigation (primary brand area)
            header_selectors = [
                'header', '.header', '#header',
                'nav', '.nav', '.navbar', '.navigation',
                '.site-header', '.main-header', '.top-bar'
            ]
            
            for selector in header_selectors:
                elements = soup.select(selector)
                for element in elements[:2]:  # Limit to avoid too many
                    colors = self._extract_colors_from_element(element, base_url)
                    colors_by_source['header'].extend(colors)
            
            # Strategy 2: Extract from logo and brand areas
            logo_selectors = [
                '.logo', '#logo', '.brand', '.site-logo',
                '.company-logo', '[class*="logo"]', '[id*="logo"]',
                '.wordmark', '.brand-mark'
            ]
            
            for selector in logo_selectors:
                elements = soup.select(selector)
                for element in elements[:3]:
                    colors = self._extract_colors_from_element(element, base_url)
                    colors_by_source['logo_area'].extend(colors)
            
            # Strategy 3: Look for brand-specific CSS classes/IDs
            brand_keywords = [
                brand_name.lower(),
                brand_name.lower().replace(' ', ''),
                brand_name.lower().replace(' ', '-')
            ]
            
            for keyword in brand_keywords:
                brand_elements = soup.select(f'[class*="{keyword}"], [id*="{keyword}"]')
                for element in brand_elements[:5]:
                    colors = self._extract_colors_from_element(element, base_url)
                    colors_by_source['brand_context'].extend(colors)
            
            # Strategy 4: Extract CSS custom properties (brand colors)
            css_colors = self._extract_css_brand_variables(html_content, brand_name)
            colors_by_source['css_brand'].extend(css_colors)
            
            # Strategy 5: Look in style tags for brand colors
            style_tags = soup.find_all('style')
            for style_tag in style_tags:
                if style_tag.string:
                    style_colors = self._extract_colors_from_css(style_tag.string)
                    # Filter for likely brand colors (used multiple times)
                    color_counts = Counter(style_colors)
                    frequent_colors = [color for color, count in color_counts.items() if count >= 2]
                    colors_by_source['css_brand'].extend(frequent_colors)
            
            # Strategy 6: Footer colors (often contain brand colors)
            footer_selectors = ['footer', '.footer', '#footer', '.site-footer']
            for selector in footer_selectors:
                elements = soup.select(selector)
                for element in elements[:1]:
                    colors = self._extract_colors_from_element(element, base_url)
                    colors_by_source['footer'].extend(colors)
            
        except Exception as e:
            logger.error(f"Error extracting brand-focused colors: {e}")
        
        return colors_by_source
    
    def _extract_colors_from_element(self, element, base_url: str) -> List[str]:
        """Extract colors from a specific DOM element."""
        colors = []
        
        try:
            # Get element's computed style-like attributes
            style_attr = element.get('style', '')
            if style_attr:
                colors.extend(self._extract_colors_from_css(style_attr))
            
            # Get class-based styles (look for color in class names)
            class_names = element.get('class', [])
            if isinstance(class_names, list):
                for class_name in class_names:
                    if any(color_word in class_name.lower() 
                          for color_word in ['color', 'bg', 'background', 'text']):
                        # This might indicate a color class, but we need actual color values
                        pass
            
            # Look for data attributes that might contain colors
            for attr_name, attr_value in element.attrs.items():
                if 'color' in attr_name.lower() and isinstance(attr_value, str):
                    if attr_value.startswith('#') and len(attr_value) in [4, 7]:
                        colors.append(attr_value.upper())
            
            # Extract colors from child elements' styles
            child_elements_with_style = element.find_all(attrs={'style': True})
            for child in child_elements_with_style[:5]:  # Limit to avoid too many
                style_colors = self._extract_colors_from_css(child.get('style', ''))
                colors.extend(style_colors)
                
        except Exception as e:
            logger.debug(f"Error extracting colors from element: {e}")
        
        return colors
    
    def _extract_colors_from_css(self, css_text: str) -> List[str]:
        """Extract color values from CSS text."""
        colors = []
        
        # Hex colors
        hex_colors = re.findall(r'#([0-9A-Fa-f]{3,6})', css_text)
        for hex_color in hex_colors:
            if len(hex_color) == 3:
                # Convert 3-digit hex to 6-digit
                expanded = ''.join([c*2 for c in hex_color])
                colors.append(f'#{expanded.upper()}')
            elif len(hex_color) == 6:
                colors.append(f'#{hex_color.upper()}')
        
        # RGB colors
        rgb_colors = re.findall(r'rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)', css_text)
        for r, g, b in rgb_colors:
            try:
                hex_color = f'#{int(r):02X}{int(g):02X}{int(b):02X}'
                colors.append(hex_color)
            except ValueError:
                pass
        
        # RGBA colors (ignore alpha for now)
        rgba_colors = re.findall(r'rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)', css_text)
        for r, g, b in rgba_colors:
            try:
                hex_color = f'#{int(r):02X}{int(g):02X}{int(b):02X}'
                colors.append(hex_color)
            except ValueError:
                pass
        
        return colors
    
    def _extract_css_brand_variables(self, html_content: str, brand_name: str) -> List[str]:
        """Extract CSS custom properties that might be brand colors."""
        colors = []
        
        # Look for CSS custom properties (CSS variables)
        css_var_pattern = r'--[\w-]*(?:color|brand|primary|secondary|accent)[\w-]*\s*:\s*([^;]+)'
        matches = re.findall(css_var_pattern, html_content, re.IGNORECASE)
        
        for match in matches:
            # Extract color from the value
            value_colors = self._extract_colors_from_css(match)
            colors.extend(value_colors)
        
        return colors
    
    def _prioritize_brand_colors(self, colors_by_source: Dict[str, List[str]], brand_name: str) -> Dict[str, Any]:
        """Prioritize and deduplicate colors based on brand relevance."""
        
        # Flatten and count color occurrences across sources
        all_colors_with_weight = []
        source_weights = {
            'logo_area': 10,      # Highest priority
            'css_brand': 8,       # CSS variables are usually brand colors
            'header': 6,          # Header often contains brand colors
            'brand_context': 5,   # Elements with brand name
            'navigation': 3,      # Navigation might have brand colors
            'footer': 2           # Footer often has brand colors but lower priority
        }
        
        color_scores = {}
        color_sources = {}
        
        for source, colors in colors_by_source.items():
            weight = source_weights.get(source, 1)
            for color in colors:
                if color and color != '#000000' and color != '#FFFFFF':  # Exclude pure black/white initially
                    color_scores[color] = color_scores.get(color, 0) + weight
                    if color not in color_sources:
                        color_sources[color] = []
                    color_sources[color].append(source)
        
        # Filter out very common colors that are likely not brand-specific
        common_web_colors = {
            '#F8F9FA', '#E9ECEF', '#DEE2E6', '#CED4DA', '#ADB5BD',
            '#6C757D', '#495057', '#343A40', '#212529', '#F8F8F8',
            '#EEEEEE', '#DDDDDD', '#CCCCCC', '#BBBBBB', '#AAAAAA'
        }
        
        # Keep high-scoring colors and remove common web colors (unless they have very high scores)
        filtered_colors = {}
        for color, score in color_scores.items():
            if color not in common_web_colors or score >= 15:
                filtered_colors[color] = score
        
        # Sort colors by score
        sorted_colors = sorted(filtered_colors.items(), key=lambda x: x[1], reverse=True)
        
        # Categorize colors
        result = {
            'all_colors': [color for color, score in sorted_colors],
            'primary': [color for color, score in sorted_colors[:3]],  # Top 3 as primary
            'brand_context': list(set(colors_by_source.get('brand_context', []))),
            'header': list(set(colors_by_source.get('header', []))),
            'logo': list(set(colors_by_source.get('logo_area', []))),
            'css_brand': list(set(colors_by_source.get('css_brand', []))),
            'sources': [f"{color}: {color_sources.get(color, [])}" for color, score in sorted_colors[:10]]
        }
        
        # Add back black and white if we have room and they appeared in brand contexts
        if len(result['all_colors']) < 10:
            for color in ['#000000', '#FFFFFF']:
                if color in color_scores and color not in result['all_colors']:
                    result['all_colors'].append(color)
        
        return result