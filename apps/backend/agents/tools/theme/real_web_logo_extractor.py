#!/usr/bin/env python3
"""
Real web logo extractor that actually scrapes websites.
Focuses on robust web scraping rather than hardcoded URLs.
"""

import asyncio
import aiohttp
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urljoin, urlparse
import re
from bs4 import BeautifulSoup
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class RealWebLogoExtractor:
    """Real website logo extraction with robust scraping."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        connector = aiohttp.TCPConnector(ssl=False, limit=100)
        timeout = aiohttp.ClientTimeout(total=15, connect=5)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
            'Upgrade-Insecure-Requests': '1',
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
    
    async def extract_high_quality_logo(
        self,
        brand_name: str,
        website_url: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract best available logo by actually scraping the website.
        
        Args:
            brand_name: Name of the brand/company
            website_url: Website URL to scrape (will generate if not provided)
            
        Returns:
            Dictionary with logo information
        """
        
        result = {
            'brand_name': brand_name,
            'logo_url': None,
            'logo_urls': [],
            'source': None,
            'quality': 'unknown',
            'format': 'unknown',
            'dimensions': None,
            'colors': [],
            'candidates_found': 0,
            'score': 0
        }
        
        # Generate website URL if not provided
        if not website_url:
            website_url = f"https://www.{brand_name.lower().replace(' ', '').replace('&', '').replace('.', '')}.com"
        
        print(f"🎯 Extracting best logo for {brand_name}")
        
        try:
            # Step 1: Get the webpage content
            html_content = await self._fetch_webpage(website_url)
            if not html_content:
                print(f"   ❌ Could not fetch {website_url}")
                return result
            
            # Step 2: Parse and find all potential logos
            logo_candidates = await self._find_logo_candidates(html_content, website_url)
            result['candidates_found'] = len(logo_candidates)
            result['logo_urls'] = [candidate['url'] for candidate in logo_candidates]
            
            if not logo_candidates:
                print(f"   ❌ No logo candidates found on {website_url}")
                return result
            
            print(f"   ✅ Found {len(logo_candidates)} candidates")
            
            # Step 3: Score and rank candidates
            scored_candidates = []
            for candidate in logo_candidates:
                score = await self._score_logo_candidate(candidate, brand_name)
                candidate['score'] = score
                scored_candidates.append(candidate)
            
            # Sort by score (highest first)
            scored_candidates.sort(key=lambda x: x['score'], reverse=True)
            
            # Step 4: Return best candidate
            if scored_candidates:
                best_candidate = scored_candidates[0]
                result.update({
                    'logo_url': best_candidate['url'],
                    'source': best_candidate.get('source', 'website'),
                    'quality': self._determine_quality(best_candidate),
                    'format': best_candidate.get('format', 'unknown'),
                    'dimensions': best_candidate.get('dimensions'),
                    'score': best_candidate['score']
                })
                
                print(f"   🏆 Best: {best_candidate['url'][:60]}... (score: {best_candidate['score']}, size: {best_candidate.get('dimensions', 'unknown')})")
                return result
        
        except Exception as e:
            print(f"   ❌ Error extracting logo for {brand_name}: {e}")
            logger.error(f"Logo extraction failed for {brand_name}: {e}")
        
        return result
    
    async def _fetch_webpage(self, url: str) -> Optional[str]:
        """Fetch webpage content with proper error handling."""
        try:
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    if 'text/html' in content_type:
                        return await response.text()
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
        return None
    
    async def _find_logo_candidates(self, html_content: str, base_url: str) -> List[Dict[str, Any]]:
        """Find all potential logo elements on the page."""
        candidates = []
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Strategy 1: Look for img tags with logo-related attributes
            img_selectors = [
                'img[alt*="logo" i]',
                'img[src*="logo" i]',
                'img[class*="logo" i]',
                'img[id*="logo" i]',
                'img[alt*="brand" i]',
                'img[src*="brand" i]',
                'img[class*="brand" i]',
                'img[data-src*="logo" i]',
                'img[title*="logo" i]'
            ]
            
            for selector in img_selectors:
                imgs = soup.select(selector)
                for img in imgs:
                    src = img.get('src') or img.get('data-src') or img.get('data-lazy-src')
                    if src:
                        full_url = urljoin(base_url, src)
                        candidates.append({
                            'url': full_url,
                            'source': 'img_tag',
                            'element': 'img',
                            'alt': img.get('alt', ''),
                            'class': ' '.join(img.get('class', [])),
                            'format': self._get_format_from_url(src)
                        })
            
            # Strategy 2: Look for SVG elements with logo classes
            svg_selectors = [
                'svg[class*="logo" i]',
                'svg[id*="logo" i]',
                '.logo svg',
                '.brand svg',
                'header svg',
                '.header svg'
            ]
            
            for selector in svg_selectors:
                svgs = soup.select(selector)
                for svg in svgs:
                    # Try to get SVG content or linked href
                    href = svg.get('href')
                    if href:
                        full_url = urljoin(base_url, href)
                        candidates.append({
                            'url': full_url,
                            'source': 'svg_element',
                            'element': 'svg',
                            'format': 'svg'
                        })
            
            # Strategy 3: Look in common logo locations
            common_selectors = [
                'header img',
                '.header img', 
                '.navbar img',
                '.nav img',
                '.logo img',
                '.brand img',
                '.site-logo img',
                '.company-logo img',
                '[data-testid*="logo" i] img'
            ]
            
            for selector in common_selectors:
                imgs = soup.select(selector)
                for img in imgs[:3]:  # Limit to first 3 per selector
                    src = img.get('src') or img.get('data-src')
                    if src:
                        full_url = urljoin(base_url, src)
                        candidates.append({
                            'url': full_url,
                            'source': 'common_location',
                            'element': 'img',
                            'alt': img.get('alt', ''),
                            'class': ' '.join(img.get('class', [])),
                            'format': self._get_format_from_url(src)
                        })
            
            # Strategy 4: Look for Open Graph images
            og_image = soup.find('meta', property='og:image')
            if og_image:
                og_url = og_image.get('content')
                if og_url:
                    candidates.append({
                        'url': urljoin(base_url, og_url),
                        'source': 'og_image',
                        'element': 'meta',
                        'format': self._get_format_from_url(og_url)
                    })
            
            # Strategy 5: Look for Apple touch icons (often high-res logos)
            apple_icons = soup.find_all('link', rel=lambda x: x and 'apple-touch-icon' in x.lower())
            for icon in apple_icons:
                href = icon.get('href')
                if href:
                    candidates.append({
                        'url': urljoin(base_url, href),
                        'source': 'apple_touch_icon',
                        'element': 'link',
                        'format': self._get_format_from_url(href)
                    })
            
            # Strategy 6: Look for any link rel="icon" with larger sizes
            icons = soup.find_all('link', rel=lambda x: x and 'icon' in x.lower())
            for icon in icons:
                href = icon.get('href')
                sizes = icon.get('sizes', '')
                if href and ('192' in sizes or '256' in sizes or '512' in sizes):
                    candidates.append({
                        'url': urljoin(base_url, href),
                        'source': 'large_icon',
                        'element': 'link',
                        'format': self._get_format_from_url(href),
                        'sizes': sizes
                    })
            
            # Strategy 7: Fallback - get any favicon if nothing else found
            favicon_selectors = [
                'link[rel="shortcut icon"]',
                'link[rel="icon"]',
                'link[href="/favicon.ico"]'
            ]
            
            for selector in favicon_selectors:
                icons = soup.select(selector)
                for icon in icons[:1]:  # Just take first favicon as fallback
                    href = icon.get('href')
                    if href:
                        candidates.append({
                            'url': urljoin(base_url, href),
                            'source': 'favicon_fallback',
                            'element': 'link',
                            'format': self._get_format_from_url(href)
                        })
            
            # Remove duplicates while preserving order
            seen_urls = set()
            unique_candidates = []
            for candidate in candidates:
                if candidate['url'] not in seen_urls:
                    seen_urls.add(candidate['url'])
                    unique_candidates.append(candidate)
            
            return unique_candidates
            
        except Exception as e:
            logger.error(f"Error parsing HTML for logo candidates: {e}")
            return []
    
    async def _score_logo_candidate(self, candidate: Dict[str, Any], brand_name: str) -> int:
        """Score a logo candidate based on various factors."""
        score = 0
        url = candidate['url'].lower()
        alt = candidate.get('alt', '').lower()
        class_names = candidate.get('class', '').lower()
        
        # URL-based scoring
        if 'logo' in url:
            score += 20
        if 'brand' in url:
            score += 15
        if brand_name.lower() in url:
            score += 10
        if 'svg' in url:
            score += 15  # Vector graphics preferred
        if any(size in url for size in ['512', '256', '200', 'large', 'big']):
            score += 10
        if any(bad in url for bad in ['icon', 'favicon', '16x16', '32x32', 'small']):
            score -= 10
        
        # Alt text scoring
        if 'logo' in alt:
            score += 10
        if brand_name.lower() in alt:
            score += 15
        
        # Class name scoring
        if 'logo' in class_names:
            score += 10
        if 'brand' in class_names:
            score += 5
        
        # Source preference
        source_scores = {
            'img_tag': 5,
            'svg_element': 10,
            'common_location': 8,
            'og_image': 6,
            'apple_touch_icon': 12,
            'large_icon': 8,
            'favicon_fallback': 2
        }
        score += source_scores.get(candidate.get('source', ''), 0)
        
        # Format preference
        format_scores = {
            'svg': 15,
            'png': 10,
            'jpg': 5,
            'jpeg': 5,
            'webp': 8,
            'gif': 2
        }
        score += format_scores.get(candidate.get('format', ''), 0)
        
        return max(0, score)  # Ensure non-negative
    
    def _determine_quality(self, candidate: Dict[str, Any]) -> str:
        """Determine quality rating for a logo candidate."""
        score = candidate.get('score', 0)
        format_type = candidate.get('format', '')
        
        if score >= 40:
            return 'high'
        elif score >= 25:
            return 'medium'
        elif format_type == 'svg':
            return 'medium'
        else:
            return 'low'
    
    def _get_format_from_url(self, url: str) -> str:
        """Extract format from URL."""
        if not url:
            return 'unknown'
        
        url_lower = url.lower()
        if '.svg' in url_lower:
            return 'svg'
        elif '.png' in url_lower:
            return 'png'
        elif '.jpg' in url_lower or '.jpeg' in url_lower:
            return 'jpeg'
        elif '.webp' in url_lower:
            return 'webp'
        elif '.gif' in url_lower:
            return 'gif'
        else:
            return 'unknown'