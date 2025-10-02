#!/usr/bin/env python3
"""
Smart brand color extractor that gets actual brand colors.
Uses comprehensive extraction + intelligent brand-aware filtering.
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


class SmartBrandColorExtractor:
    """Extract actual brand colors using comprehensive extraction + smart filtering."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        
        # Known brand colors for validation and guidance
        self.known_brand_colors = {
            'youtube': ['#FF0000', '#CC0000', '#FFFFFF', '#000000', '#212121', '#0F0F0F'],
            'nike': ['#FF6900', '#000000', '#FFFFFF', '#111111', '#1A1A1A'],
            'olympics': ['#0085C3', '#FFD100', '#009F3D', '#F4831F', '#EE334E'],
            'pornhub': ['#FF9900', '#000000', '#FFFFFF', '#FFA500'],
            'calgary': ['#0066CC', '#003366', '#FFFFFF', '#004080', '#002050'],
            'spotify': ['#1DB954', '#191414', '#FFFFFF', '#000000'],
            'facebook': ['#1877F2', '#FFFFFF', '#F0F2F5', '#E4E6EA'],
            'instagram': ['#E4405F', '#833AB4', '#F77737', '#FCAF45'],
            'twitter': ['#1DA1F2', '#FFFFFF', '#14171A', '#657786'],
            'apple': ['#000000', '#FFFFFF', '#F5F5F7', '#1D1D1F']
        }
        
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
        Extract brand colors using comprehensive approach + smart filtering.
        
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
            'all_colors_found': [],
            'filtered_colors': [],
            'brand_matched_colors': [],
            'total_colors_found': 0,
            'extraction_method': 'comprehensive'
        }
        
        try:
            print(f"🎨 Extracting brand colors for {brand_name}")
            
            # Step 1: Get the webpage content
            html_content = await self._fetch_webpage(website_url)
            if not html_content:
                print(f"   ❌ Could not fetch {website_url}")
                return result
            
            # Step 2: Extract ALL colors from the page (comprehensive)
            all_colors = await self._extract_all_colors_comprehensive(html_content, website_url)
            result['all_colors_found'] = list(all_colors.keys())
            result['total_colors_found'] = len(all_colors)
            
            print(f"   🔍 Found {len(all_colors)} total colors on page")
            
            # Step 3: Apply smart brand-aware filtering
            brand_colors = self._filter_for_brand_colors(all_colors, brand_name)
            
            # Step 4: Final prioritization and selection
            final_colors = self._prioritize_final_colors(brand_colors, brand_name)
            
            result.update({
                'colors': final_colors['selected'],
                'primary_colors': final_colors['primary'],
                'filtered_colors': final_colors['filtered'],
                'brand_matched_colors': final_colors['brand_matched']
            })
            
            print(f"   ✅ Selected {len(final_colors['selected'])} brand colors")
            if final_colors['selected']:
                print(f"   🎨 Top colors: {', '.join(final_colors['selected'][:5])}")
            
            return result
            
        except Exception as e:
            print(f"   ❌ Error extracting colors for {brand_name}: {e}")
            logger.error(f"Smart brand color extraction failed: {e}")
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
    
    async def _extract_all_colors_comprehensive(
        self, 
        html_content: str, 
        base_url: str
    ) -> Dict[str, int]:
        """Extract ALL colors from the page with frequency counts."""
        
        color_counts = Counter()
        
        try:
            # Method 1: Extract from HTML attributes and inline styles
            hex_colors = re.findall(r'#([0-9A-Fa-f]{3,6})', html_content)
            for hex_color in hex_colors:
                if len(hex_color) == 3:
                    # Convert 3-digit hex to 6-digit
                    expanded = ''.join([c*2 for c in hex_color])
                    color_counts[f'#{expanded.upper()}'] += 1
                elif len(hex_color) == 6:
                    color_counts[f'#{hex_color.upper()}'] += 1
            
            # Method 2: Extract RGB colors
            rgb_pattern = r'rgb\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)'
            rgb_matches = re.findall(rgb_pattern, html_content)
            for r, g, b in rgb_matches:
                try:
                    hex_color = f'#{int(r):02X}{int(g):02X}{int(b):02X}'
                    color_counts[hex_color] += 1
                except ValueError:
                    pass
            
            # Method 3: Extract RGBA colors (ignore alpha)
            rgba_pattern = r'rgba\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*[\d.]+\s*\)'
            rgba_matches = re.findall(rgba_pattern, html_content)
            for r, g, b in rgba_matches:
                try:
                    hex_color = f'#{int(r):02X}{int(g):02X}{int(b):02X}'
                    color_counts[hex_color] += 1
                except ValueError:
                    pass
            
            # Method 4: Parse CSS from style tags and extract colors
            soup = BeautifulSoup(html_content, 'html.parser')
            style_tags = soup.find_all('style')
            for style_tag in style_tags:
                if style_tag.string:
                    css_colors = self._extract_colors_from_css_text(style_tag.string)
                    for color in css_colors:
                        color_counts[color] += 2  # Give CSS colors higher weight
            
            # Method 5: Look for linked stylesheets and fetch them
            link_tags = soup.find_all('link', {'rel': 'stylesheet'})
            for link in link_tags[:3]:  # Limit to first 3 stylesheets
                href = link.get('href')
                if href:
                    stylesheet_url = urljoin(base_url, href)
                    css_content = await self._fetch_stylesheet(stylesheet_url)
                    if css_content:
                        css_colors = self._extract_colors_from_css_text(css_content)
                        for color in css_colors:
                            color_counts[color] += 3  # External CSS gets even higher weight
                            
        except Exception as e:
            logger.error(f"Error in comprehensive color extraction: {e}")
        
        return dict(color_counts)
    
    def _extract_colors_from_css_text(self, css_text: str) -> List[str]:
        """Extract colors from CSS text."""
        colors = []
        
        # Hex colors
        hex_colors = re.findall(r'#([0-9A-Fa-f]{3,6})', css_text)
        for hex_color in hex_colors:
            if len(hex_color) == 3:
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
        
        return colors
    
    async def _fetch_stylesheet(self, url: str) -> Optional[str]:
        """Fetch external stylesheet content."""
        try:
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    if 'css' in content_type or 'text' in content_type:
                        return await response.text()
        except Exception as e:
            logger.debug(f"Failed to fetch stylesheet {url}: {e}")
        return None
    
    def _filter_for_brand_colors(self, all_colors: Dict[str, int], brand_name: str) -> Dict[str, int]:
        """Filter colors to find likely brand colors."""
        
        filtered_colors = {}
        brand_key = brand_name.lower()
        
        # Get known colors for this brand if we have them
        known_colors = self.known_brand_colors.get(brand_key, [])
        
        for color, count in all_colors.items():
            score = 0
            
            # Skip completely transparent or invalid colors
            if color in ['#000000', '#FFFFFF']:
                # Keep black and white but with lower score initially
                score = count * 0.5
            elif self._is_likely_brand_color(color, count):
                score = count
                
                # Bonus if this matches a known brand color
                if known_colors:
                    for known_color in known_colors:
                        if self._colors_similar(color, known_color, threshold=40):
                            score += 50  # Big bonus for matching known brand colors
                            break
                
                # Bonus for colors that appear frequently (likely important)
                if count >= 5:
                    score += 10
                elif count >= 3:
                    score += 5
                
                # Bonus for vibrant colors (more likely to be brand colors)
                if self._is_vibrant_color(color):
                    score += 15
                    
                filtered_colors[color] = int(score)
        
        # Always include black and white if they appeared
        for basic_color in ['#000000', '#FFFFFF']:
            if basic_color in all_colors and basic_color not in filtered_colors:
                filtered_colors[basic_color] = all_colors[basic_color]
        
        return filtered_colors
    
    def _is_likely_brand_color(self, color: str, count: int) -> bool:
        """Determine if a color is likely to be a brand color."""
        
        # Very common web colors that are unlikely to be brand-specific
        common_web_colors = {
            '#F8F9FA', '#E9ECEF', '#DEE2E6', '#CED4DA', '#ADB5BD',
            '#6C757D', '#495057', '#343A40', '#212529', '#F8F8F8',
            '#EEEEEE', '#DDDDDD', '#CCCCCC', '#BBBBBB', '#AAAAAA',
            '#999999', '#888888', '#777777', '#666666', '#555555',
            '#444444', '#333333', '#222222', '#F0F0F0', '#E0E0E0'
        }
        
        # Skip very common colors unless they appear very frequently
        if color in common_web_colors and count < 10:
            return False
        
        # Skip colors that are too similar to common grays
        if self._is_generic_gray(color):
            return count >= 5  # Only keep grays if they appear often
        
        return True
    
    def _is_generic_gray(self, color: str) -> bool:
        """Check if a color is a generic gray."""
        try:
            hex_color = color.lstrip('#')
            if len(hex_color) != 6:
                return False
                
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)
            b = int(hex_color[4:6], 16)
            
            # Check if it's a gray (R, G, B are similar)
            max_diff = max(abs(r-g), abs(g-b), abs(r-b))
            
            # It's a gray if the RGB values are very close
            return max_diff <= 20
            
        except:
            return False
    
    def _is_vibrant_color(self, color: str) -> bool:
        """Check if a color is vibrant/saturated."""
        try:
            hex_color = color.lstrip('#')
            if len(hex_color) != 6:
                return False
                
            r = int(hex_color[0:2], 16)
            g = int(hex_color[2:4], 16)  
            b = int(hex_color[4:6], 16)
            
            # Calculate saturation
            max_rgb = max(r, g, b)
            min_rgb = min(r, g, b)
            
            if max_rgb == 0:
                return False
                
            saturation = (max_rgb - min_rgb) / max_rgb
            
            # Vibrant colors have high saturation
            return saturation > 0.6
            
        except:
            return False
    
    def _colors_similar(self, color1: str, color2: str, threshold: int = 30) -> bool:
        """Check if two colors are similar."""
        try:
            c1 = color1.lstrip('#')
            c2 = color2.lstrip('#')
            
            if len(c1) != 6 or len(c2) != 6:
                return False
            
            r1, g1, b1 = int(c1[0:2], 16), int(c1[2:4], 16), int(c1[4:6], 16)
            r2, g2, b2 = int(c2[0:2], 16), int(c2[2:4], 16), int(c2[4:6], 16)
            
            # Calculate Euclidean distance
            distance = ((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) ** 0.5
            
            return distance <= threshold
        except:
            return color1.upper() == color2.upper()
    
    def _prioritize_final_colors(self, filtered_colors: Dict[str, int], brand_name: str) -> Dict[str, List[str]]:
        """Final prioritization and selection of brand colors."""
        
        # Sort by score (highest first)
        sorted_colors = sorted(filtered_colors.items(), key=lambda x: x[1], reverse=True)
        
        # Select top colors
        selected_colors = []
        primary_colors = []
        brand_matched_colors = []
        
        brand_key = brand_name.lower()
        known_colors = self.known_brand_colors.get(brand_key, [])
        
        # First, add any colors that match known brand colors
        for color, score in sorted_colors:
            if known_colors:
                for known_color in known_colors:
                    if self._colors_similar(color, known_color, threshold=40):
                        if color not in selected_colors:
                            selected_colors.append(color)
                            primary_colors.append(color)
                            brand_matched_colors.append(color)
                        break
        
        # Then add other high-scoring colors
        for color, score in sorted_colors:
            if len(selected_colors) >= 8:  # Limit total colors
                break
                
            if color not in selected_colors:
                selected_colors.append(color)
                
                # Top 3 non-matched colors become primary candidates
                if len(primary_colors) < 3 and color not in brand_matched_colors:
                    primary_colors.append(color)
        
        # Ensure we have at least some colors even if no brand match
        if not selected_colors and sorted_colors:
            # Take top 5 colors by score
            selected_colors = [color for color, score in sorted_colors[:5]]
            primary_colors = selected_colors[:3]
        
        return {
            'selected': selected_colors,
            'primary': primary_colors,
            'filtered': [color for color, score in sorted_colors],
            'brand_matched': brand_matched_colors
        }