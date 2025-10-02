#!/usr/bin/env python3
"""
Enhanced logo extraction system with multiple high-quality sources.
Gets proper brand logos instead of low-quality favicons.
"""

import asyncio
import aiohttp
import json
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urljoin, urlparse
import re
import base64
from PIL import Image
import io
from collections import Counter
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class EnhancedLogoExtractor:
    """Advanced logo extraction with multiple high-quality sources."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def extract_high_quality_logo(
        self,
        brand_name: str,
        website_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract highest quality logo available using multiple strategies.
        
        Priority order:
        1. Website press kit / media assets  
        2. Clearbit Logo API (high-res)
        3. Website logo parsing (SVG preferred)
        4. Brand kit / design system assets
        5. Social media profile images
        """
        
        result = {
            'brand_name': brand_name,
            'logo_url': None,
            'logo_urls': [],  # All found logos
            'source': None,
            'quality': 'unknown',
            'format': 'unknown',
            'dimensions': None,
            'colors': []
        }
        
        # Strategy 1: Press Kit / Media Assets
        press_kit_logo = await self._extract_from_press_kit(brand_name, website_url)
        if press_kit_logo['logo_url']:
            result.update(press_kit_logo)
            result['source'] = 'press_kit'
            result['quality'] = 'high'
            return result
        
        # Strategy 2: Enhanced Clearbit API
        clearbit_logo = await self._extract_from_clearbit_enhanced(brand_name, website_url)
        if clearbit_logo['logo_url']:
            result.update(clearbit_logo)
            result['source'] = 'clearbit_api'
            result['quality'] = 'high'
            return result
        
        # Strategy 3: Website Logo Parsing (SVG priority)
        website_logo = await self._extract_from_website_advanced(brand_name, website_url)
        if website_logo['logo_url']:
            result.update(website_logo)
            result['source'] = 'website_parsing'
            result['quality'] = 'medium_high' if website_logo.get('format') == 'svg' else 'medium'
            return result
        
        # Strategy 4: Brand Kit / Design System
        brand_kit_logo = await self._extract_from_brand_kit(brand_name, website_url)
        if brand_kit_logo['logo_url']:
            result.update(brand_kit_logo)
            result['source'] = 'brand_kit'
            result['quality'] = 'high'
            return result
        
        # Strategy 5: Social Media Fallback
        social_logo = await self._extract_from_social_media(brand_name)
        if social_logo['logo_url']:
            result.update(social_logo)
            result['source'] = 'social_media'
            result['quality'] = 'medium'
            return result
        
        # Last resort: Favicon (but warn about quality)
        favicon_url = urljoin(website_url or f"https://{brand_name.lower()}.com", "/favicon.ico")
        result.update({
            'logo_url': favicon_url,
            'source': 'favicon_fallback',
            'quality': 'low',
            'format': 'ico'
        })
        
        return result
    
    async def _extract_from_press_kit(self, brand_name: str, website_url: Optional[str]) -> Dict[str, Any]:
        """Extract logos from company press kits and media assets."""
        if not website_url:
            website_url = f"https://{brand_name.lower().replace(' ', '')}.com"
        
        # Common press kit URLs
        press_paths = [
            "/press",
            "/media", 
            "/press-kit",
            "/media-kit",
            "/brand",
            "/brand-assets",
            "/about/press",
            "/company/press",
            "/newsroom",
            "/brand-center",
            "/brand-guidelines",
            "/resources/press-kit"
        ]
        
        for path in press_paths:
            try:
                press_url = urljoin(website_url, path)
                content = await self._fetch_page_content(press_url)
                if not content:
                    continue
                    
                # Look for high-res logo downloads
                logo_patterns = [
                    r'href=["\']([^"\']*\.(?:svg|png|jpg|jpeg))["\'][^>]*(?:logo|brand|wordmark)',
                    r'(?:logo|brand|wordmark)[^>]*href=["\']([^"\']*\.(?:svg|png|jpg|jpeg))["\']',
                    r'<a[^>]*download[^>]*href=["\']([^"\']*logo[^"\']*\.(?:svg|png|jpg|jpeg))["\']'
                ]
                
                for pattern in logo_patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    for match in matches:
                        full_url = urljoin(press_url, match)
                        # Prioritize SVG and high-res indicators
                        if any(quality in match.lower() for quality in ['svg', 'vector', 'high', 'hires', '2x', '4x', '512', '1024']):
                            logo_info = await self._analyze_logo_quality(full_url)
                            if logo_info['is_valid']:
                                return {
                                    'logo_url': full_url,
                                    'format': logo_info['format'],
                                    'dimensions': logo_info['dimensions'],
                                    'colors': logo_info['colors']
                                }
                        
            except Exception as e:
                logger.debug(f"Press kit extraction failed for {press_url}: {e}")
                continue
        
        return {'logo_url': None}
    
    async def _extract_from_clearbit_enhanced(self, brand_name: str, website_url: Optional[str]) -> Dict[str, Any]:
        """Enhanced Clearbit API with multiple domain attempts."""
        if not website_url:
            # Try multiple TLDs
            domains = [
                f"{brand_name.lower().replace(' ', '')}.com",
                f"{brand_name.lower().replace(' ', '')}.io", 
                f"{brand_name.lower().replace(' ', '')}.co",
                f"{brand_name.lower().replace(' ', '')}.net"
            ]
        else:
            parsed = urlparse(website_url)
            domains = [parsed.netloc.replace('www.', '')]
        
        for domain in domains:
            try:
                # Clearbit provides high-res logos
                clearbit_url = f"https://logo.clearbit.com/{domain}"
                
                # Test if logo exists and get info
                logo_info = await self._analyze_logo_quality(clearbit_url)
                if logo_info['is_valid']:
                    return {
                        'logo_url': clearbit_url,
                        'format': logo_info['format'],
                        'dimensions': logo_info['dimensions'],
                        'colors': logo_info['colors']
                    }
                    
            except Exception as e:
                logger.debug(f"Clearbit extraction failed for {domain}: {e}")
                continue
        
        return {'logo_url': None}
    
    async def _extract_from_website_advanced(self, brand_name: str, website_url: Optional[str]) -> Dict[str, Any]:
        """Advanced website parsing prioritizing SVG and high-quality logos."""
        if not website_url:
            website_url = f"https://{brand_name.lower().replace(' ', '')}.com"
        
        try:
            content = await self._fetch_page_content(website_url)
            if not content:
                return {'logo_url': None}
            
            # Priority 1: SVG logos (vector, scalable)
            svg_patterns = [
                r'<img[^>]+src=["\']([^"\']*\.svg)["\'][^>]*(?:logo|brand|wordmark)',
                r'<svg[^>]*class=["\'][^"\']*(?:logo|brand|wordmark)[^"\']*["\']',
                r'href=["\']([^"\']*\.svg)["\'][^>]*(?:logo|brand)'
            ]
            
            for pattern in svg_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches:
                    if isinstance(match, str) and match.endswith('.svg'):
                        full_url = urljoin(website_url, match)
                        logo_info = await self._analyze_logo_quality(full_url)
                        if logo_info['is_valid']:
                            return {
                                'logo_url': full_url,
                                'format': 'svg',
                                'dimensions': logo_info['dimensions'],
                                'colors': logo_info['colors']
                            }
            
            # Priority 2: High-res PNG/JPG logos
            img_patterns = [
                r'<img[^>]+src=["\']([^"\']*(?:logo|brand|wordmark)[^"\']*\.(?:png|jpg|jpeg))["\']',
                r'<img[^>]+src=["\']([^"\']*\.(?:png|jpg|jpeg))["\'][^>]*alt=["\'][^"\']*(?:logo|brand|wordmark)',
                r'background-image:\s*url\(["\']?([^"\'()]*(?:logo|brand)[^"\'()]*\.(?:png|jpg|jpeg))["\']?\)'
            ]
            
            candidates = []
            for pattern in img_patterns:
                matches = re.findall(pattern, content, re.IGNORECASE)
                for match in matches:
                    full_url = urljoin(website_url, match)
                    # Score based on URL quality indicators
                    score = 0
                    if any(quality in match.lower() for quality in ['2x', '4x', 'high', 'hires', '512', '1024']):
                        score += 3
                    if 'logo' in match.lower():
                        score += 2
                    if any(dim in match.lower() for dim in ['200', '300', '400', '500']):
                        score += 1
                    candidates.append((score, full_url, match))
            
            # Try highest scored candidates first
            candidates.sort(key=lambda x: x[0], reverse=True)
            for score, full_url, match in candidates[:5]:  # Try top 5
                logo_info = await self._analyze_logo_quality(full_url)
                if logo_info['is_valid'] and logo_info.get('dimensions'):
                    width, height = logo_info['dimensions']
                    if width >= 100 and height >= 50:  # Minimum quality threshold
                        format_type = match.split('.')[-1].lower()
                        return {
                            'logo_url': full_url,
                            'format': format_type,
                            'dimensions': logo_info['dimensions'],
                            'colors': logo_info['colors']
                        }
            
        except Exception as e:
            logger.debug(f"Website parsing failed for {website_url}: {e}")
        
        return {'logo_url': None}
    
    async def _extract_from_brand_kit(self, brand_name: str, website_url: Optional[str]) -> Dict[str, Any]:
        """Extract from design systems and brand kits."""
        if not website_url:
            website_url = f"https://{brand_name.lower().replace(' ', '')}.com"
        
        # Design system paths
        design_paths = [
            "/design-system",
            "/design",
            "/style-guide", 
            "/styleguide",
            "/brand-guide",
            "/brand-guidelines",
            "/assets",
            "/static/assets",
            "/img/brand",
            "/images/brand",
            "/cdn/assets",
        ]
        
        for path in design_paths:
            try:
                design_url = urljoin(website_url, path)
                content = await self._fetch_page_content(design_url)
                if not content:
                    continue
                
                # Look for logo assets in design systems
                logo_patterns = [
                    r'(?:primary|main|horizontal|default|full)[-_]?logo[^"\']*\.(?:svg|png)',
                    r'logo[-_](?:primary|main|horizontal|default|full)[^"\']*\.(?:svg|png)',
                    r'brandmark[^"\']*\.(?:svg|png)',
                    r'wordmark[^"\']*\.(?:svg|png)'
                ]
                
                for pattern in logo_patterns:
                    matches = re.findall(pattern, content, re.IGNORECASE)
                    for match in matches:
                        full_url = urljoin(design_url, match)
                        logo_info = await self._analyze_logo_quality(full_url)
                        if logo_info['is_valid']:
                            return {
                                'logo_url': full_url,
                                'format': logo_info['format'],
                                'dimensions': logo_info['dimensions'],
                                'colors': logo_info['colors']
                            }
                        
            except Exception as e:
                logger.debug(f"Brand kit extraction failed for {design_url}: {e}")
                continue
        
        return {'logo_url': None}
    
    async def _extract_from_social_media(self, brand_name: str) -> Dict[str, Any]:
        """Extract from social media profile images as fallback."""
        # This would require social media APIs
        # For now, return empty - could be enhanced with Twitter/LinkedIn APIs
        return {'logo_url': None}
    
    async def _analyze_logo_quality(self, logo_url: str) -> Dict[str, Any]:
        """Analyze logo URL to determine quality and extract basic info."""
        try:
            if not self.session:
                return {'is_valid': False}
                
            async with self.session.head(logo_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status != 200:
                    return {'is_valid': False}
                
                content_type = response.headers.get('content-type', '').lower()
                content_length = int(response.headers.get('content-length', 0))
                
                # Basic quality checks
                is_image = any(img_type in content_type for img_type in ['image/', 'svg'])
                is_reasonable_size = 1000 < content_length < 5000000  # 1KB - 5MB
                
                if not (is_image and is_reasonable_size):
                    return {'is_valid': False}
                
                # Determine format
                format_type = 'unknown'
                if 'svg' in content_type:
                    format_type = 'svg'
                elif 'png' in content_type:
                    format_type = 'png'
                elif 'jpeg' in content_type or 'jpg' in content_type:
                    format_type = 'jpg'
                elif 'webp' in content_type:
                    format_type = 'webp'
                
                # For raster images, try to get dimensions
                dimensions = None
                colors = []
                
                if format_type in ['png', 'jpg', 'webp'] and content_length < 1000000:  # < 1MB
                    try:
                        # Download and analyze small images
                        async with self.session.get(logo_url, timeout=aiohttp.ClientTimeout(total=10)) as img_response:
                            if img_response.status == 200:
                                image_data = await img_response.read()
                                image = Image.open(io.BytesIO(image_data))
                                dimensions = image.size
                                
                                # Extract dominant colors
                                colors = self._extract_dominant_colors(image, max_colors=5)
                                
                    except Exception as e:
                        logger.debug(f"Failed to analyze image {logo_url}: {e}")
                
                return {
                    'is_valid': True,
                    'format': format_type,
                    'dimensions': dimensions,
                    'size_bytes': content_length,
                    'colors': colors
                }
                
        except Exception as e:
            logger.debug(f"Quality analysis failed for {logo_url}: {e}")
            return {'is_valid': False}
    
    def _extract_dominant_colors(self, image: Image.Image, max_colors: int = 5) -> List[str]:
        """Extract dominant colors from logo image."""
        try:
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                image = image.convert('RGB')
            
            # Resize for performance
            image.thumbnail((150, 150))
            
            # Get color data
            pixels = list(image.getdata())
            
            # Filter out near-white/transparent colors
            filtered_pixels = []
            for pixel in pixels:
                if len(pixel) >= 3:
                    r, g, b = pixel[:3]
                    # Skip very light colors (likely background)
                    if not (r > 240 and g > 240 and b > 240):
                        # Skip very dark colors if they dominate (likely background)
                        brightness = (r + g + b) / 3
                        if brightness > 20:  # Not pure black
                            filtered_pixels.append(pixel)
            
            if not filtered_pixels:
                return []
            
            # Get most common colors
            color_counter = Counter(filtered_pixels)
            dominant_colors = []
            
            for (r, g, b), count in color_counter.most_common(max_colors * 2):
                hex_color = f"#{r:02X}{g:02X}{b:02X}"
                
                # Avoid very similar colors
                is_similar = False
                for existing_color in dominant_colors:
                    if self._colors_similar(hex_color, existing_color):
                        is_similar = True
                        break
                
                if not is_similar:
                    dominant_colors.append(hex_color)
                
                if len(dominant_colors) >= max_colors:
                    break
            
            return dominant_colors
            
        except Exception as e:
            logger.debug(f"Color extraction failed: {e}")
            return []
    
    def _colors_similar(self, color1: str, color2: str, threshold: int = 40) -> bool:
        """Check if two hex colors are similar."""
        try:
            # Convert hex to RGB
            def hex_to_rgb(hex_color):
                hex_color = hex_color.lstrip('#')
                return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            
            rgb1 = hex_to_rgb(color1)
            rgb2 = hex_to_rgb(color2)
            
            # Calculate Euclidean distance
            distance = sum((c1 - c2) ** 2 for c1, c2 in zip(rgb1, rgb2)) ** 0.5
            return distance < threshold
            
        except Exception:
            return False
    
    async def _fetch_page_content(self, url: str) -> Optional[str]:
        """Fetch page content with proper error handling."""
        try:
            if not self.session:
                return None
                
            headers = {
                'User-Agent': 'Mozilla/5.0 (compatible; LogoExtractor/1.0)',
                'Accept': 'text/html,application/xhtml+xml,*/*'
            }
            
            async with self.session.get(
                url, 
                headers=headers,
                timeout=aiohttp.ClientTimeout(total=15)
            ) as response:
                if response.status == 200:
                    return await response.text()
                return None
                
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
            return None


# Helper function for easy import
async def extract_high_quality_logo(
    brand_name: str, 
    website_url: Optional[str] = None
) -> Dict[str, Any]:
    """Extract highest quality logo for a brand."""
    async with EnhancedLogoExtractor() as extractor:
        return await extractor.extract_high_quality_logo(brand_name, website_url)