#!/usr/bin/env python3
"""
Holistic Brand Extractor - Enhanced with Brandfetch API integration:
1. Primary: Use Brandfetch API for comprehensive brand data (logos, colors, fonts)
2. Fallback: Visit actual website and extract colors from UI elements (headers, backgrounds, titles, etc.)
3. Supplement with brand guidelines if available
4. No hardcoding - everything from APIs and live websites
"""

import asyncio
import aiohttp
import re
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urljoin, urlparse
from bs4 import BeautifulSoup
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Import Brandfetch service for primary brand data extraction
try:
    from services.simple_brandfetch_cache import SimpleBrandfetchCache
    from services.database_config import get_database_connection_string, is_database_caching_enabled
    from services.brandfetch_service import extract_complete_brand_brandfetch
    CACHE_AVAILABLE = is_database_caching_enabled()
    BRANDFETCH_AVAILABLE = True
except ImportError:
    CACHE_AVAILABLE = False
    BRANDFETCH_AVAILABLE = False
    logger.warning("Brandfetch service not available - using fallback extraction")

# Import Logo.dev service for fallback logo extraction
try:
    from agents.tools.theme.logodev_service import LogoDevService
    LOGODEV_AVAILABLE = True
except ImportError:
    LOGODEV_AVAILABLE = False
    logger.warning("Logo.dev service not available - install logodev_service.py")


class HolisticBrandExtractor:
    """Complete brand extraction from live websites + brand guidelines."""
    
    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        # Use default SSL handling to avoid handshake quirks on some hosts
        # More permissive SSL for broader site compatibility  
        connector = aiohttp.TCPConnector(
            ssl=False,  # Disable SSL verification for broader compatibility
            limit=10,   # Reduce connection pool for faster startup
            ttl_dns_cache=300,  # Cache DNS for 5 minutes
            use_dns_cache=True
        )
        # Balanced timeouts - not too aggressive, not too slow
        timeout = aiohttp.ClientTimeout(total=20, connect=8)  # Increased timeouts
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.9',
            'Accept-Encoding': 'gzip, deflate',  # Removed 'br' to avoid brotli issues
            'Cache-Control': 'no-cache',
            'Pragma': 'no-cache',
            'Sec-Fetch-Dest': 'document',
            'Sec-Fetch-Mode': 'navigate',
            'Sec-Fetch-Site': 'none',
            'Sec-Fetch-User': '?1',
            'Upgrade-Insecure-Requests': '1',
        }
        self.session = aiohttp.ClientSession(
            connector=connector, timeout=timeout, headers=headers
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def extract_complete_brand(self, brand_name: str, website_url: str) -> Dict[str, Any]:
        """
        Complete brand extraction with Brandfetch API priority:
        1. Primary: Brandfetch API (comprehensive brand data)
        2. Fallback: Website UI elements extraction
        3. Supplement: Brand guidelines
        """
        
        print(f"🔍 HOLISTIC EXTRACTION: {brand_name}")
        print(f"   🌐 Website: {website_url}")
        
        # Step 1: Try Brandfetch API first (highest quality data)
        if BRANDFETCH_AVAILABLE:
            print("   🚀 Attempting Brandfetch API extraction...")
            try:
                # Use cache service if available, otherwise fallback to regular service
                if CACHE_AVAILABLE:
                    print("   💾 Using cached Brandfetch service...")
                    db_connection_string = get_database_connection_string()
                    async with SimpleBrandfetchCache(db_connection_string) as service:
                        identifier = website_url if website_url else brand_name
                        brand_data = await service.get_brand_data(identifier)
                        
                        # Convert to format compatible with existing interface (same as regular brandfetch)
                        if brand_data.get("error"):
                            brandfetch_result = {
                                "brand_name": brand_name,
                                "website_url": website_url,
                                "final_colors": [],
                                "final_fonts": [],
                                "website_logo_url": None,
                                "confidence_score": 0,
                                "extraction_method": "brandfetch_cached_failed",
                                "error": brand_data.get("error"),
                                "source": "brandfetch_cached"
                            }
                        else:
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
                            
                            brandfetch_result = {
                                "brand_name": brand_data.get("brand_name", brand_name),
                                "website_url": website_url or brand_data.get("domain", ""),
                                "final_colors": colors[:12],
                                "final_fonts": fonts,
                                "website_logo_url": logo_url,
                                "website_logo_url_dark": logo_url_dark,
                                "website_colors": colors,
                                "website_fonts": fonts,
                                "website_backgrounds": backgrounds,
                                "website_headers": accent_colors[:2] if accent_colors else colors[:2],
                                "website_buttons": accent_colors if accent_colors else colors[1:3] if len(colors) > 1 else colors[:1],
                                "website_text": text_colors,
                                "color_categories": {
                                    "primary": categorized_colors.get("primary", []),
                                    "secondary": categorized_colors.get("secondary", []),
                                    "accent": accent_colors,
                                    "background": backgrounds,
                                    "text": text_colors
                                },
                                "company_info": brand_data.get("company_info", {}),
                                "social_links": brand_data.get("social_links", {}),
                                "confidence_score": brand_data.get("confidence_score", 90),
                                "extraction_method": "brandfetch_cached",
                                "total_elements_analyzed": len(colors) + len(fonts) + (1 if logo_url else 0),
                                "source": "brandfetch_cached",
                                "quality_score": brand_data.get("quality_score", False),
                                "color_categorization": "intelligent_brandfetch_cached"
                            }
                else:
                    print("   🌐 Using direct Brandfetch service...")
                    brandfetch_result = await extract_complete_brand_brandfetch(brand_name, website_url)
                
                # Check if Brandfetch was successful
                if (not brandfetch_result.get("error") and 
                    (brandfetch_result.get("final_colors") or 
                     brandfetch_result.get("final_fonts") or 
                     brandfetch_result.get("website_logo_url"))):
                    
                    print(f"   ✅ Brandfetch API success: {len(brandfetch_result.get('final_colors', []))} colors, {len(brandfetch_result.get('final_fonts', []))} fonts")
                    print(f"   📊 Confidence: {brandfetch_result.get('confidence_score', 0):.0f}%")
                    
                    # Add color categorization for compatibility
                    if brandfetch_result.get('final_colors'):
                        try:
                            from agents.tools.theme.color_categorizer import ColorCategorizer
                            categorizer = ColorCategorizer()
                            
                            color_contexts = {
                                'headers': brandfetch_result.get('website_headers', []),
                                'buttons': brandfetch_result.get('website_buttons', []),
                                'backgrounds': brandfetch_result.get('website_backgrounds', []),
                                'titles': brandfetch_result.get('website_titles', []),
                                'text': brandfetch_result.get('website_text', [])
                            }
                            
                            brandfetch_result['color_categories'] = categorizer.categorize_colors(
                                brandfetch_result['final_colors'], 
                                brand_name, 
                                color_contexts
                            )
                        except Exception:
                            pass  # Color categorization is not critical
                    
                    return brandfetch_result
                else:
                    print(f"   ⚠️  Brandfetch API failed: {brandfetch_result.get('error', 'No data returned')}")
                    
            except Exception as e:
                print(f"   ❌ Brandfetch API error: {e}")
                logger.warning(f"Brandfetch extraction failed for {brand_name}: {e}")
        else:
            print("   ⚠️  Brandfetch API not available - using fallback extraction")
        
        # Step 2: Fallback to original website extraction method
        print("   🌐 Falling back to website extraction...")
        
        result = {
            'brand_name': brand_name,
            'website_url': website_url,
            
            # Website extraction (primary)
            'website_colors': [],
            'website_backgrounds': [],
            'website_headers': [],
            'website_fonts': [],
            'website_titles': [],
            'website_buttons': [],
            'website_logo_url': None,
            
            # Brand guidelines (supplementary)
            'guidelines_colors': [],
            'guidelines_found': False,
            
            # Final combined results
            'final_colors': [],
            'final_fonts': [],
            'confidence_score': 0,
            'extraction_method': 'holistic_fallback',
            'total_elements_analyzed': 0
        }
        
        # Step 2a and 2b in parallel: website elements and brand guidelines
        website_task = asyncio.create_task(self._extract_website_elements(website_url))
        guidelines_task = asyncio.create_task(self._find_brand_guidelines(brand_name, website_url))

        website_data = {}
        guidelines_data = None
        
        # Allow reasonable time for website extraction
        try:
            website_data = await asyncio.wait_for(website_task, timeout=12)
        except asyncio.TimeoutError:
            print("   ⏱️  Website extraction timed out (12s) - proceeding without")
            try:
                website_task.cancel()
            except Exception:
                pass
        except Exception as e:
            # Any error should already be logged inside the task; continue
            try:
                website_task.cancel()
            except Exception:
                pass

        # Try guidelines with reasonable timeout
        try:
            guidelines_data = await asyncio.wait_for(guidelines_task, timeout=8)
        except asyncio.TimeoutError:
            print("   ⏱️  Guidelines search timed out (8s) - proceeding without")
            try:
                guidelines_task.cancel()
            except Exception:
                pass
        except Exception:
            # Non-fatal; continue without guidelines
            try:
                guidelines_task.cancel()
            except Exception:
                pass

        if website_data:
            result.update(website_data)
            result['total_elements_analyzed'] = website_data.get('elements_analyzed', 0)
            print(f"   ✅ Website analysis: {result['total_elements_analyzed']} elements")

        if guidelines_data:
            result['guidelines_colors'] = guidelines_data.get('colors', [])
            # Merge fonts from guidelines when available
            g_fonts = guidelines_data.get('fonts') or []
            if g_fonts:
                result['website_fonts'] = list(dict.fromkeys((result.get('website_fonts') or []) + g_fonts))
            result['guidelines_found'] = True
            print(f"   📋 Guidelines: +{len(result['guidelines_colors'])} colors, +{len(g_fonts)} fonts")
        
        # Step 3: Combine and finalize
        result['final_colors'] = self._combine_colors(
            result['website_colors'], 
            result['guidelines_colors']
        )
        result['final_fonts'] = result['website_fonts']
        
        # Step 4: Categorize colors into primary, secondary, accent, etc.
        if result['final_colors']:
            try:
                from agents.tools.theme.color_categorizer import ColorCategorizer
                categorizer = ColorCategorizer()
                
                # Build context for categorization
                color_contexts = {
                    'headers': result.get('website_headers', []),
                    'buttons': result.get('website_buttons', []),
                    'backgrounds': result.get('website_backgrounds', []),
                    'titles': result.get('website_titles', []),
                    'text': result.get('website_text', [])
                }
                
                result['color_categories'] = categorizer.categorize_colors(
                    result['final_colors'], 
                    brand_name, 
                    color_contexts
                )
            except Exception:
                pass  # Color categorization is not critical
        
        # Step 5: Process logo
        if result['website_logo_url']:
            result['logo_data'] = await self._process_logo(result['website_logo_url'])
        
        # Step 6: Calculate confidence
        result['confidence_score'] = self._calculate_confidence(result)
        
        print(f"   🎨 Final: {len(result['final_colors'])} colors, {len(result['final_fonts'])} fonts")
        print(f"   📊 Confidence: {result['confidence_score']:.0f}%")
        
        return result
    
    async def _extract_website_elements(self, website_url: str) -> Dict[str, Any]:
        """Extract colors, fonts, and elements from actual website."""
        
        print("   🌐 Step 1: Analyzing website elements...")
        # Guard against invalid/missing URLs
        try:
            if not website_url or not isinstance(website_url, str) or not website_url.startswith("http"):
                print("   ⚠️  No valid website URL provided; skipping website extraction")
                return {}
        except Exception:
            return {}
        
        try:
            # Add small delay to be respectful to websites
            await asyncio.sleep(0.5)
            
            # Try with redirects allowed and better error handling
            async with self.session.get(website_url, allow_redirects=True, max_redirects=3) as response:
                if response.status not in [200, 301, 302]:
                    print(f"   ❌ Failed to load {website_url} (status: {response.status})")
                    return {}
                
                # Handle different content types
                content_type = response.headers.get('Content-Type', '').lower()
                if 'text/html' not in content_type and 'text/plain' not in content_type:
                    print(f"   ❌ Unexpected content type: {content_type}")
                    return {}
                
                html_content = await response.text(errors='ignore')  # Ignore encoding errors
                if not html_content or len(html_content) < 100:
                    print(f"   ❌ Empty or very small response ({len(html_content)} chars)")
                    return {}
                
                soup = BeautifulSoup(html_content, 'html.parser')
                
                extraction_data = {
                    'website_colors': [],
                    'website_backgrounds': [],
                    'website_headers': [],
                    'website_fonts': [],
                    'website_titles': [],
                    'website_buttons': [],
                    'website_text': [],
                    'website_logo_url': None,
                    'elements_analyzed': 0
                }
                
                # Extract from different UI elements with error handling
                try:
                    await self._extract_header_elements(soup, extraction_data, website_url)
                    await self._extract_background_colors(soup, extraction_data, website_url)
                    await self._extract_typography(soup, extraction_data)
                    await self._extract_button_colors(soup, extraction_data)
                    await self._extract_brand_elements(soup, extraction_data, website_url)
                    await self._extract_css_colors_and_fonts(html_content, website_url, extraction_data)
                    await self._extract_web_fonts(soup, extraction_data)
                except Exception as parse_error:
                    import traceback
                    print(f"   ⚠️  Parsing error (continuing): {parse_error}")
                    logger.debug(f"Full parsing error traceback: {traceback.format_exc()}")
                
                # Deduplicate and prioritize
                extraction_data['website_colors'] = self._deduplicate_colors(extraction_data['website_colors'])
                extraction_data['website_fonts'] = self._deduplicate_fonts(extraction_data['website_fonts'])
                
                print(f"      🎨 Colors: {len(extraction_data['website_colors'])}")
                print(f"      ✏️  Fonts: {len(extraction_data['website_fonts'])}")
                
                return extraction_data
                
        except Exception as e:
            # Log rich error details and try a fallback path using requests
            try:
                err_type = type(e).__name__
                print(f"   ❌ Website extraction failed: {err_type}: {e}")
            except Exception:
                print("   ❌ Website extraction failed: unknown error")

            # Fallback: use requests to fetch raw HTML, then reuse the same parsers
            try:
                return await self._extract_with_requests_fallback(website_url)
            except Exception as e2:
                logger.debug(f"Requests fallback failed: {e2}")

            return {}

    async def _extract_with_requests_fallback(self, website_url: str) -> Dict[str, Any]:
        try:
            import requests
            headers = {
                'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',
            }
            print("   ↪️  Using fallback HTTP fetch for website analysis")
            if not website_url or not isinstance(website_url, str) or not website_url.startswith("http"):
                return {}
            resp = requests.get(website_url, headers=headers, timeout=10, verify=False)
            if resp.status_code == 200:
                html_content = resp.text
                soup = BeautifulSoup(html_content, 'html.parser')

                extraction_data = {
                    'website_colors': [],
                    'website_backgrounds': [],
                    'website_headers': [],
                    'website_fonts': [],
                    'website_titles': [],
                    'website_buttons': [],
                    'website_text': [],
                    'website_logo_url': None,
                    'elements_analyzed': 0
                }

                await self._extract_header_elements(soup, extraction_data, website_url)
                await self._extract_background_colors(soup, extraction_data, website_url)
                await self._extract_typography(soup, extraction_data)
                await self._extract_button_colors(soup, extraction_data)
                await self._extract_brand_elements(soup, extraction_data, website_url)
                await self._extract_css_colors_and_fonts(html_content, website_url, extraction_data)
                await self._extract_web_fonts(soup, extraction_data)

                extraction_data['website_colors'] = self._deduplicate_colors(extraction_data['website_colors'])
                extraction_data['website_fonts'] = self._deduplicate_fonts(extraction_data['website_fonts'])

                print(f"      🎨 Colors: {len(extraction_data['website_colors'])}")
                print(f"      ✏️  Fonts: {len(extraction_data['website_fonts'])}")

                return extraction_data
            else:
                logger.debug(f"Requests fallback got status {resp.status_code} for {website_url}")
        except Exception as e2:
            logger.debug(f"Requests fallback failed: {e2}")
        return {}
    
    async def _extract_header_elements(self, soup: BeautifulSoup, data: Dict[str, Any], base_url: str):
        """Extract colors and fonts from headers, navigation, hero sections."""
        
        # Find header/navigation elements
        header_selectors = [
            'header', 'nav', '.header', '.navigation', '.navbar', '.nav',
            '.hero', '.hero-section', '.banner', '.top-bar'
        ]
        
        for selector in header_selectors:
            elements = soup.select(selector)
            for element in elements:
                data['elements_analyzed'] += 1
                
                # Extract colors from styles
                colors = self._extract_colors_from_element(element)
                data['website_colors'].extend(colors)
                data['website_headers'].extend(colors)
                
                # Extract fonts
                fonts = self._extract_fonts_from_element(element)
                data['website_fonts'].extend(fonts)
    
    async def _extract_background_colors(self, soup: BeautifulSoup, data: Dict[str, Any], base_url: str):
        """Extract background colors from main sections."""
        
        # Look for main content areas
        bg_selectors = [
            'body', 'main', '.main', '.container', '.content', 
            '.section', '.hero', '.banner', '.footer', 'footer'
        ]
        
        for selector in bg_selectors:
            elements = soup.select(selector)
            for element in elements:
                data['elements_analyzed'] += 1
                
                # Get background colors specifically
                bg_colors = self._extract_background_colors_from_element(element)
                data['website_colors'].extend(bg_colors)
                data['website_backgrounds'].extend(bg_colors)
    
    async def _extract_typography(self, soup: BeautifulSoup, data: Dict[str, Any]):
        """Extract fonts and colors from typography elements."""
        
        # Typography elements
        typography_selectors = ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', '.title', '.heading']
        
        for selector in typography_selectors:
            elements = soup.select(selector)
            for element in elements[:5]:  # Limit per selector
                data['elements_analyzed'] += 1
                
                # Extract text colors and fonts
                colors = self._extract_colors_from_element(element)
                fonts = self._extract_fonts_from_element(element)
                
                data['website_colors'].extend(colors)
                data['website_fonts'].extend(fonts)
                
                # Categorize colors by their context
                if selector in ['h1', 'h2', '.title', '.heading']:
                    data['website_titles'].extend(colors)
                elif selector in ['p']:
                    data['website_text'].extend(colors)
                else:
                    data['website_text'].extend(colors)  # Default text context
    
    async def _extract_button_colors(self, soup: BeautifulSoup, data: Dict[str, Any]):
        """Extract colors from buttons and interactive elements."""
        
        button_selectors = [
            'button', '.button', '.btn', 'a.button', '.cta', '.call-to-action',
            'input[type="submit"]', '.primary-button', '.secondary-button'
        ]
        
        for selector in button_selectors:
            elements = soup.select(selector)
            for element in elements[:8]:  # Limit buttons
                data['elements_analyzed'] += 1
                
                colors = self._extract_colors_from_element(element)
                data['website_colors'].extend(colors)
                data['website_buttons'].extend(colors)
    
    async def _extract_brand_elements(self, soup: BeautifulSoup, data: Dict[str, Any], base_url: str):
        """Extract logo and brand-specific elements with enhanced detection."""
        
        # Enhanced logo selectors - more comprehensive detection including modern patterns
        logo_selectors = [
            # Explicit logo selectors
            'img[alt*="logo" i]', 'img[src*="logo" i]', 'img[title*="logo" i]',
            'img[class*="logo" i]', 'img[id*="logo" i]',
            'svg[class*="logo" i]', 'svg[id*="logo" i]', 'svg[aria-label*="logo" i]', 'svg[title*="logo" i]',
            
            # Container-based logo detection
            '.logo img', '.brand img', '.header img', '.navbar img',
            '.logo svg', '.brand svg', '.header svg', '.navbar svg',
            '.logo', '.brand', '.header-logo', '.navbar-brand',
            
            # Modern website patterns
            '[data-testid*="logo" i]', '[aria-label*="logo" i]', '[role="img"][aria-label*="logo" i]',
            'a[href="/"] img', 'a[href="/"] svg',  # Home link images often logos
            
            # Header/navigation first images (often logos)
            'header img:first-of-type', 'nav img:first-of-type', '.header img:first-of-type',
            'header svg:first-of-type', 'nav svg:first-of-type', '.header svg:first-of-type',
            
            # Top-level images that might be logos
            'body > header img', 'body > nav img', 'body > .header img',
            'body > header svg', 'body > nav svg', 'body > .header svg',
            
            # Common brand/company name patterns
            'img[alt*="brand" i]', 'img[alt*="company" i]', 'svg[aria-label*="brand" i]',
            
            # Fallback: any image in first 3 positions of header/nav
            'header img:nth-child(-n+3)', 'nav img:nth-child(-n+3)',
            'header svg:nth-child(-n+3)', 'nav svg:nth-child(-n+3)'
        ]
        
        logos_found = []
        total_candidates = 0
        
        for selector in logo_selectors:
            elements = soup.select(selector)
            total_candidates += len(elements)
            
            for element in elements:
                logo_url = None
                
                # Extract from img src
                if element.name == 'img':
                    logo_url = element.get('src')
                # Extract from SVG
                elif element.name == 'svg':
                    # Try to find nested image or use SVG itself
                    img = element.find('image')
                    if img:
                        logo_url = img.get('href') or img.get('xlink:href')
                    else:
                        # For SVG, we'll note it but can't easily extract URL
                        logo_url = f"data:image/svg+xml,{str(element)[:100]}..."
                # Extract from CSS background (check style attribute)
                elif element.get('style'):
                    style = element.get('style', '')
                    bg_match = re.search(r'background(?:-image)?:\s*url\(["\']?([^"\'\\)]+)["\']?\)', style)
                    if bg_match:
                        logo_url = bg_match.group(1)
                # Check if element contains an img
                else:
                    child_img = element.find('img')
                    if child_img:
                        logo_url = child_img.get('src')
                
                if logo_url:
                    full_url = urljoin(base_url, logo_url)
                    # Score logos by selector specificity and position
                    score = self._score_logo_candidate(selector, element, logo_url)
                    logos_found.append({'url': full_url, 'score': score, 'selector': selector})
        
        # Pick the best logo based on scoring
        if logos_found:
            best_logo = max(logos_found, key=lambda x: x['score'])
            if best_logo['score'] > 0:  # Only use if score is positive
                data['website_logo_url'] = best_logo['url']
                print(f"      🖼️  Logo: {data['website_logo_url']} (via {best_logo['selector']}, score: {best_logo['score']})")
                
                # Store additional logo candidates
                data['logo_candidates'] = [{'url': l['url'], 'score': l['score']} for l in sorted(logos_found, key=lambda x: x['score'], reverse=True)[:3]]
                return  # Logo found, exit early
        
        # If no good logo found, try Logo.dev API first (highest quality)
        if LOGODEV_AVAILABLE:
            print(f"      🌟 Initial search found {len(logos_found)} candidates, trying Logo.dev API...")
            logodev_logo = await self._get_logodev_logo(data.get('brand_name', ''), base_url)
            
            if logodev_logo and logodev_logo.get('available'):
                data['website_logo_url'] = logodev_logo['logo_url']
                print(f"      🖼️  Logo: {logodev_logo['logo_url']} (via Logo.dev: {logodev_logo['quality']})")
                data['logo_candidates'] = [{'url': logodev_logo['logo_url'], 'score': 100, 'method': f"logodev_{logodev_logo['method']}"}]
                
                # Extract brand colors from Logo.dev logo
                await self._extract_colors_from_logodev_logo(logodev_logo, data)
                return  # High-quality logo found, exit early
        
        # If Logo.dev fails, try comprehensive site search
        print(f"      🔍 Logo.dev search complete, trying comprehensive site search...")
        comprehensive_logo = await self._comprehensive_logo_search(soup, base_url, data.get('brand_name', ''))
        
        if comprehensive_logo:
            data['website_logo_url'] = comprehensive_logo['url']
            print(f"      🖼️  Logo: {comprehensive_logo['url']} (via comprehensive search: {comprehensive_logo['method']})")
            data['logo_candidates'] = [comprehensive_logo]
        else:
            print(f"      🖼️  No logos found from {len(logo_selectors)} selectors ({total_candidates} candidates examined), trying favicon fallback...")
            # Final fallback: favicon
            favicon_logo = await self._get_favicon_logo(base_url)
            if favicon_logo:
                data['website_logo_url'] = favicon_logo
                print(f"      🖼️  Logo: {favicon_logo} (via favicon fallback)")
                data['logo_candidates'] = [{'url': favicon_logo, 'score': 1, 'method': 'favicon'}]
            else:
                print(f"      ❌ No logo found despite Logo.dev, comprehensive search, and favicon fallback")
    
    def _score_logo_candidate(self, selector: str, element, logo_url: str) -> int:
        """Score logo candidates to pick the best one."""
        score = 0
        
        # Higher scores for more specific selectors
        if 'logo' in selector.lower():
            score += 10
        if 'brand' in selector.lower():
            score += 8
        if 'header' in selector.lower() or 'navbar' in selector.lower():
            score += 5
        
        # Check element attributes for logo indicators
        for attr in ['alt', 'title', 'class', 'id']:
            value = element.get(attr, '').lower()
            if 'logo' in value:
                score += 5
            if 'brand' in value:
                score += 3
        
        # Prefer images in likely logo locations
        if element.name == 'img' and selector.endswith(':first-child'):
            score += 3
        
        # NEGATIVE SCORING: Filter out product images and unwanted content
        if logo_url:
            url_lower = logo_url.lower()
            
            # Heavily penalize product images, Amazon images, and ads
            unwanted_patterns = [
                'amazon.com', 'media-amazon.com', 'amazonaws.com',
                'product', 'item', 'listing', 'ad', 'ads', 'banner',
                'promo', 'promotion', 'offer', 'deal', 'sale',
                'gallery', 'carousel', 'slideshow', 'hero',
                'thumbnail', 'thumb', 'preview'
            ]
            
            for pattern in unwanted_patterns:
                if pattern in url_lower:
                    score -= 20  # Heavy penalty for unwanted patterns
            
            # Check element attributes for unwanted indicators
            for attr in ['alt', 'title', 'class', 'id', 'data-*']:
                value = element.get(attr, '').lower() if element.get(attr) else ''
                unwanted_attr_patterns = [
                    'product', 'item', 'ad', 'banner', 'promo', 'hero',
                    'carousel', 'slide', 'gallery', 'thumbnail'
                ]
                for pattern in unwanted_attr_patterns:
                    if pattern in value:
                        score -= 10  # Penalty for unwanted attributes
            
            # Positive scoring for good file types and patterns
            if any(ext in url_lower for ext in ['.svg', '.png', '.jpg', '.jpeg', '.webp']):
                score += 2
            if '.svg' in url_lower:  # SVGs often used for logos
                score += 1
            
            # Bonus for common logo paths
            logo_paths = ['/logo', '/brand', '/assets/logo', '/img/logo', '/images/logo']
            for path in logo_paths:
                if path in url_lower:
                    score += 5
        
        return max(score, -50)  # Minimum score cap to avoid overly negative scores
    
    async def _comprehensive_logo_search(self, soup: BeautifulSoup, base_url: str, brand_name: str) -> Optional[Dict[str, Any]]:
        """Comprehensive logo search across the entire site."""
        
        # Search for brand name in image alt text and filenames
        brand_keywords = []
        if brand_name:
            brand_keywords = [brand_name.lower(), brand_name.lower().replace(' ', ''), brand_name.lower().replace(' ', '-')]
        
        domain = urlparse(base_url).netloc.replace('www.', '').split('.')[0]
        brand_keywords.append(domain)
        
        candidates = []
        
        # 1. Search all images for brand name in alt, src, or title
        all_images = soup.find_all('img')
        for img in all_images:
            img_url = img.get('src')
            if not img_url:
                continue
                
            full_url = urljoin(base_url, img_url)
            
            # Check if image contains brand name
            alt_text = (img.get('alt') or '').lower()
            title_text = (img.get('title') or '').lower()
            src_text = img_url.lower()
            
            score = 0
            method = "brand_name_search"
            
            for keyword in brand_keywords:
                if keyword in alt_text:
                    score += 15
                    method = f"alt_text_match_{keyword}"
                if keyword in title_text:
                    score += 12
                if keyword in src_text:
                    score += 10
                    method = f"filename_match_{keyword}"
            
            # Bonus for logo-like paths
            logo_indicators = ['logo', 'brand', 'header', 'nav']
            for indicator in logo_indicators:
                if indicator in src_text:
                    score += 5
            
            # Penalty for clearly non-logo images
            if any(bad in src_text for bad in ['product', 'thumbnail', 'gallery', 'ad']):
                score -= 10
            
            if score > 5:  # Only consider decent matches
                candidates.append({'url': full_url, 'score': score, 'method': method})
        
        # 2. Try common logo URL patterns
        common_logo_paths = [
            f'/logo.svg', f'/logo.png', f'/assets/logo.svg', f'/assets/logo.png',
            f'/img/logo.svg', f'/img/logo.png', f'/images/logo.svg', f'/images/logo.png',
            f'/{domain}-logo.svg', f'/{domain}-logo.png',
            f'/brand/{domain}.svg', f'/brand/{domain}.png'
        ]
        
        for path in common_logo_paths:
            try:
                test_url = urljoin(base_url, path)
                async with self.session.head(test_url, timeout=aiohttp.ClientTimeout(total=3)) as response:
                    if response.status == 200:
                        candidates.append({'url': test_url, 'score': 20, 'method': f'common_path_{path}'})
            except:
                continue  # Path doesn't exist
        
        # 3. Check for logo in metadata
        try:
            meta_logo = soup.find('meta', property='og:logo') or soup.find('meta', attrs={'name': 'logo'})
            if meta_logo:
                logo_url = meta_logo.get('content')
                if logo_url:
                    full_url = urljoin(base_url, logo_url)
                    candidates.append({'url': full_url, 'score': 25, 'method': 'meta_logo'})
        except Exception as e:
            # Continue without meta logo if parsing fails
            pass
        
        # Return best candidate
        if candidates:
            return max(candidates, key=lambda x: x['score'])
        
        return None
    
    async def _get_favicon_logo(self, base_url: str) -> Optional[str]:
        """Get favicon as fallback logo."""
        
        favicon_paths = [
            '/favicon.svg',
            '/favicon.png', 
            '/favicon.ico',
            '/apple-touch-icon.png',
            '/apple-touch-icon-152x152.png',
            '/assets/favicon.svg',
            '/assets/favicon.png'
        ]
        
        # Also check HTML for favicon links
        try:
            async with self.session.get(base_url, timeout=aiohttp.ClientTimeout(total=5)) as response:
                if response.status == 200:
                    html = await response.text()
                    soup = BeautifulSoup(html, 'html.parser')
                    
                    # Look for favicon links in HTML - handle different rel attribute formats
                    try:
                        favicon_links = []
                        # Try individual searches to avoid parsing conflicts
                        favicon_links.extend(soup.find_all('link', attrs={'rel': 'icon'}))
                        favicon_links.extend(soup.find_all('link', attrs={'rel': 'shortcut icon'}))
                        favicon_links.extend(soup.find_all('link', attrs={'rel': 'apple-touch-icon'}))
                        
                        for link in favicon_links:
                            href = link.get('href')
                            if href:
                                favicon_paths.insert(0, href)  # Prioritize HTML-declared favicons
                    except Exception:
                        # If specific parsing fails, continue with default paths
                        pass
        except:
            pass  # Continue with default paths if HTML parsing fails
        
        # Test each favicon path
        for path in favicon_paths:
            try:
                favicon_url = urljoin(base_url, path)
                async with self.session.head(favicon_url, timeout=aiohttp.ClientTimeout(total=3)) as response:
                    if response.status == 200:
                        # Check if it's actually an image
                        content_type = response.headers.get('content-type', '')
                        if any(img_type in content_type for img_type in ['image/', 'svg']):
                            return favicon_url
            except:
                continue  # Try next path
        
        return None
    
    async def _get_logodev_logo(self, brand_name: str, base_url: str) -> Optional[Dict[str, Any]]:
        """Get high-quality logo from Logo.dev API."""
        if not LOGODEV_AVAILABLE:
            return None
        
        try:
            # Initialize Logo.dev service
            logodev = LogoDevService()
            logodev.session = self.session  # Reuse existing session
            
            # Try Logo.dev search with brand name and URL
            result = await logodev.get_logo_with_fallback(
                brand_name,
                base_url,
                size=300,  # High resolution
                format='png',
                retina=True
            )
            
            if result and result.get('available'):
                logger.info(f"Logo.dev found {result['quality']} logo for {brand_name}")
                return result
            else:
                logger.debug(f"Logo.dev found no logo for {brand_name}: {result.get('error', 'Unknown error')}")
                return None
                
        except Exception as e:
            logger.warning(f"Logo.dev lookup failed for {brand_name}: {e}")
            return None
    
    async def _extract_colors_from_logodev_logo(self, logodev_logo: Dict[str, Any], data: Dict[str, Any]) -> None:
        """Extract brand colors from Logo.dev logo image."""
        try:
            logo_url = logodev_logo.get('logo_url')
            if not logo_url:
                return
            
            # Download and analyze logo image for dominant colors
            logo_data = await self._process_logo(logo_url)
            
            if logo_data and logo_data.get('dominant_colors'):
                logo_colors = logo_data['dominant_colors']
                
                # Add logo colors to website colors
                if 'website_colors' not in data:
                    data['website_colors'] = []
                
                # Add colors with Logo.dev attribution
                for color in logo_colors:
                    if color not in data['website_colors']:
                        data['website_colors'].append(color)
                
                print(f"      🎨 Extracted {len(logo_colors)} colors from Logo.dev logo: {logo_colors[:3]}...")
                
                # Store logo-specific brand info
                if 'logodev_data' not in data:
                    data['logodev_data'] = {}
                
                data['logodev_data'].update({
                    'logo_colors': logo_colors,
                    'logo_quality': logodev_logo.get('quality'),
                    'logo_method': logodev_logo.get('method'),
                    'colors_source': 'logodev_logo_analysis'
                })
                
        except Exception as e:
            logger.warning(f"Failed to extract colors from Logo.dev logo: {e}")
    
    async def _extract_css_colors_and_fonts(self, html_content: str, base_url: str, data: Dict[str, Any]):
        """Extract colors and fonts from CSS files and inline styles."""
        
        # Extract from inline styles first
        style_colors = re.findall(r'style=["\'][^"\']*color:\s*#([0-9A-Fa-f]{6})', html_content)
        bg_colors = re.findall(r'style=["\'][^"\']*background[^:]*:\s*#([0-9A-Fa-f]{6})', html_content)
        
        for color in style_colors + bg_colors:
            data['website_colors'].append(f'#{color.upper()}')
        
        # Extract inline fonts
        inline_fonts = re.findall(r'style=["\'][^"\']*font-family:\s*([^;"\']+)', html_content, re.IGNORECASE)
        for font_family in inline_fonts:
            fonts = self._parse_font_family(font_family)
            data['website_fonts'].extend(fonts)
        
        # Extract CSS file links - enhance to get more CSS files
        css_links = re.findall(r'<link[^>]*href=["\']([^"\']*\.css[^"\']*)["\']', html_content)
        
        # Check first 5 CSS files (increased from 3)
        for css_link in css_links[:5]:
            try:
                css_url = urljoin(base_url, css_link)
                async with self.session.get(css_url) as response:
                    if response.status == 200:
                        css_content = await response.text()
                        
                        # Extract colors - enhanced patterns
                        css_colors = re.findall(r'#([0-9A-Fa-f]{6})', css_content)
                        # Also extract 3-digit hex colors
                        css_colors_short = re.findall(r'#([0-9A-Fa-f]{3})(?![0-9A-Fa-f])', css_content)
                        
                        for color in css_colors:
                            data['website_colors'].append(f'#{color.upper()}')
                        
                        # Convert 3-digit to 6-digit hex
                        for color in css_colors_short:
                            expanded = f'#{color[0]*2}{color[1]*2}{color[2]*2}'.upper()
                            data['website_colors'].append(expanded)
                        
                        # Extract RGB colors
                        rgb_colors = re.findall(r'rgb\(\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*,\s*([0-9]{1,3})\s*\)', css_content)
                        for r, g, b in rgb_colors:
                            try:
                                hex_color = f'#{int(r):02X}{int(g):02X}{int(b):02X}'
                                data['website_colors'].append(hex_color)
                            except ValueError:
                                continue
                        
                        # Extract fonts from CSS - enhanced patterns
                        font_families = re.findall(r'font-family:\s*([^;{}\n]+)', css_content, re.IGNORECASE)
                        # Also check for @import font statements
                        font_imports = re.findall(r'@import\s+url\([^)]*googleapis[^)]*family=([^&)]+)', css_content, re.IGNORECASE)
                        
                        for font_family in font_families:
                            fonts = self._parse_font_family(font_family)
                            data['website_fonts'].extend(fonts)
                        
                        # Process font imports
                        for font_import in font_imports:
                            import urllib.parse
                            try:
                                decoded = urllib.parse.unquote_plus(font_import)
                                fonts = decoded.replace('+', ' ').split('|')
                                for font in fonts:
                                    font_name = font.split(':')[0]
                                    if font_name and len(font_name) > 1:
                                        data['website_fonts'].append(font_name)
                            except Exception:
                                continue
                        
                        data['elements_analyzed'] += 1
            except Exception:
                continue
    
    async def _extract_web_fonts(self, soup: BeautifulSoup, data: Dict[str, Any]):
        """Extract web fonts from font service links with enhanced detection."""
        
        try:
            # Find all font-related links and preconnects
            font_links = soup.find_all('link', href=True)
            
            for link in font_links:
                href = link.get('href', '')
                rel = link.get('rel', '')
                
                # Google Fonts - multiple detection patterns
                if ('fonts.googleapis.com' in href or 'fonts.gstatic.com' in href or 
                    'fonts.google.com' in href):
                    
                    # Extract family parameter from Google Fonts URL
                    if 'family=' in href:
                        import urllib.parse
                        try:
                            parsed_url = urllib.parse.urlparse(href)
                            query_params = urllib.parse.parse_qs(parsed_url.query)
                            
                            if 'family' in query_params:
                                for family_param in query_params['family']:
                                    # Parse Google Fonts family format
                                    # e.g., "Roboto:wght@300;400;500" -> ["Roboto"]
                                    # e.g., "Inter:wght@400;500|Open+Sans:wght@300;400" -> ["Inter", "Open Sans"]
                                    fonts = family_param.replace('+', ' ').split('|')
                                    for font in fonts:
                                        font_name = font.split(':')[0]  # Remove weight specifications
                                        font_name = font_name.replace('%20', ' ')  # Handle URL encoding
                                        if font_name and len(font_name) > 1:
                                            data['website_fonts'].append(font_name)
                                            print(f"        ✏️  Google Font: {font_name}")
                        except Exception:
                            # Try regex fallback
                            font_match = re.findall(r'family=([^&]+)', href)
                            if font_match:
                                family_str = urllib.parse.unquote_plus(font_match[0])
                                fonts = family_str.split('|')
                                for font in fonts:
                                    font_name = font.split(':')[0].replace('+', ' ')
                                    if font_name and len(font_name) > 1:
                                        data['website_fonts'].append(font_name)
                
                # Adobe Fonts (Typekit) - enhanced detection
                elif ('use.typekit.net' in href or 'typekit.net' in href or 
                      'use.fontawesome.com' in href):
                    # Extract kit ID and try to get font info
                    kit_match = re.search(r'/([a-zA-Z0-9]+)\.js', href)
                    if kit_match:
                        # Note: We can't easily get font names without API call
                        print(f"        ✏️  Adobe Fonts kit detected: {kit_match.group(1)}")
                        # Common Adobe fonts (fallback)
                        data['website_fonts'].extend(['Source Sans Pro', 'Proxima Nova'])
                
                # Font Awesome
                elif 'fontawesome' in href.lower():
                    print(f"        ✏️  Font Awesome detected")
                    # Font Awesome doesn't provide text fonts, skip
                    
                # Custom font files - enhanced detection
                elif any(ext in href.lower() for ext in ['.woff', '.woff2', '.ttf', '.otf', '.eot']):
                    import os
                    try:
                        # Extract font name from filename
                        filename = os.path.basename(href.split('?')[0])  # Remove query params
                        font_name = os.path.splitext(filename)[0]
                        
                        # Clean up filename to get likely font name
                        font_name = font_name.replace('-', ' ').replace('_', ' ')
                        font_name = re.sub(r'\b(regular|normal|medium|bold|light|thin|black|italic)\b', '', font_name, flags=re.IGNORECASE)
                        font_name = ' '.join(font_name.split())  # Remove extra spaces
                        
                        if font_name and len(font_name) > 2:
                            clean_name = font_name.title()
                            data['website_fonts'].append(clean_name)
                            print(f"        ✏️  Custom Font: {clean_name}")
                    except Exception:
                        continue
            
            # Also check for @font-face declarations in inline styles
            style_tags = soup.find_all('style')
            for style_tag in style_tags:
                if style_tag.string:
                    font_face_matches = re.findall(r'@font-face\s*{[^}]*font-family:\s*["\']?([^;"\'\\}]+)["\']?', 
                                                 style_tag.string, re.IGNORECASE)
                    for font_name in font_face_matches:
                        font_name = font_name.strip()
                        if font_name and len(font_name) > 1:
                            data['website_fonts'].append(font_name)
                            print(f"        ✏️  @font-face: {font_name}")
            
        except Exception as e:
            logger.debug(f"Web font extraction failed: {e}")
    
    def _extract_colors_from_element(self, element) -> List[str]:
        """Extract colors from a specific element."""
        colors = []
        
        try:
            # Check inline styles
            style_attr = element.get('style', '')
            if style_attr:
                # Color property
                color_matches = re.findall(r'color:\s*#([0-9A-Fa-f]{6})', style_attr, re.IGNORECASE)
                # Background color
                bg_matches = re.findall(r'background(?:-color)?:\s*#([0-9A-Fa-f]{6})', style_attr, re.IGNORECASE)
                # Border color
                border_matches = re.findall(r'border(?:-color)?:\s*#([0-9A-Fa-f]{6})', style_attr, re.IGNORECASE)
                
                for match in color_matches + bg_matches + border_matches:
                    colors.append(f'#{match.upper()}')
            
            # Check computed styles from class names (common patterns)
            class_attr = ' '.join(element.get('class', []))
            if any(keyword in class_attr.lower() for keyword in ['primary', 'brand', 'accent', 'highlight']):
                # This element likely has brand colors - we already extracted from CSS
                pass
                
        except Exception:
            pass
        
        return colors
    
    def _extract_background_colors_from_element(self, element) -> List[str]:
        """Extract specifically background colors."""
        colors = []
        
        try:
            style_attr = element.get('style', '')
            if style_attr:
                bg_matches = re.findall(r'background(?:-color)?:\s*#([0-9A-Fa-f]{6})', style_attr, re.IGNORECASE)
                for match in bg_matches:
                    colors.append(f'#{match.upper()}')
        except Exception:
            pass
        
        return colors
    
    def _extract_fonts_from_element(self, element) -> List[str]:
        """Extract fonts from element style attributes and computed styles."""
        fonts = []
        
        try:
            # Extract from inline style attribute
            style_attr = element.get('style', '')
            if style_attr:
                font_matches = re.findall(r'font-family:\s*([^;]+)', style_attr, re.IGNORECASE)
                for match in font_matches:
                    extracted_fonts = self._parse_font_family(match)
                    fonts.extend(extracted_fonts)
            
            # Extract from class-based styling (check common font classes)
            class_attr = element.get('class', [])
            if isinstance(class_attr, list):
                class_names = class_attr
            else:
                class_names = class_attr.split() if class_attr else []
            
            # Look for common font class patterns
            for class_name in class_names:
                class_name = class_name.lower()
                if any(font_word in class_name for font_word in ['font', 'typeface', 'text']):
                    # Extract font names from class names (e.g., 'font-helvetica', 'text-roboto')
                    font_parts = class_name.replace('-', ' ').replace('_', ' ').split()
                    for part in font_parts[1:]:  # Skip the first part (font/text/etc)
                        if len(part) > 2 and part not in ['bold', 'italic', 'light', 'regular', 'medium', 'thin', 'black']:
                            fonts.append(part.capitalize())
                            
        except Exception:
            pass
        
        return fonts
    
    def _parse_font_family(self, font_family_value: str) -> List[str]:
        """Parse font-family value and extract font names with enhanced cleaning."""
        fonts = []
        
        try:
            # Clean up the font family string
            font_family_value = font_family_value.strip().rstrip(';').rstrip()
            
            # Handle CSS variables and functions
            if 'var(' in font_family_value or 'calc(' in font_family_value:
                # Skip CSS variables/functions as they don't give us actual font names
                return fonts
            
            # Split by commas and clean each font
            font_names = [f.strip().strip('"\'') for f in font_family_value.split(',')]
            
            for font in font_names:
                font = font.strip()
                
                # Skip generic font families, empty strings, and CSS keywords
                if font and font.lower() not in [
                    'serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 
                    'system-ui', 'inherit', 'initial', 'unset', 'auto', 'none',
                    # Skip common CSS font stacks that aren't real font names
                    '-apple-system', 'blinkmacsystemfont', 'segoe ui', 'helvetica neue'
                ]:
                    # Remove any remaining quotes or special characters
                    font = re.sub(r'["\']', '', font)
                    # Clean up common CSS prefixes
                    font = re.sub(r'^-webkit-|-moz-|-ms-|-o-', '', font)
                    
                    if font and len(font) > 1:
                        # Normalize font names
                        if font.lower() == 'arial':
                            font = 'Arial'
                        elif font.lower() == 'helvetica':
                            font = 'Helvetica'
                        elif font.lower().startswith('roboto'):
                            font = 'Roboto'
                        elif font.lower().startswith('open sans'):
                            font = 'Open Sans'
                        
                        fonts.append(font)
        
        except Exception:
            pass
            
        return fonts
    
    async def _find_brand_guidelines(self, brand_name: str, website_url: str) -> Optional[Dict[str, Any]]:
        """Look for brand guidelines to supplement website colors."""
        
        print("   📋 Step 2: Looking for brand guidelines...")
        
        try:
            from agents.tools.theme.brand_guidelines_agent import BrandGuidelinesAgent
            
            async with BrandGuidelinesAgent() as guidelines_agent:
                guidelines_result = await guidelines_agent.find_brand_guidelines(brand_name, website_url)
                
                if guidelines_result and guidelines_result.get('colors'):
                    return guidelines_result
                    
        except Exception as e:
            logger.debug(f"Brand guidelines search failed: {e}")
        
        return None
    
    def _combine_colors(self, website_colors: List[str], guidelines_colors: List[str]) -> List[str]:
        """Combine website and guidelines colors, prioritizing website colors."""
        
        combined = []
        seen = set()
        
        # Priority 1: Website colors (most important - actual usage)
        for color in website_colors:
            if color.upper() not in seen:
                combined.append(color)
                seen.add(color.upper())
        
        # Priority 2: Guidelines colors (supplementary)
        for color in guidelines_colors:
            if color.upper() not in seen and len(combined) < 15:  # Limit total
                combined.append(color)
                seen.add(color.upper())
        
        return combined[:12]  # Final limit
    
    def _calculate_confidence(self, result: Dict[str, Any]) -> float:
        """Calculate extraction confidence score."""
        score = 0.0
        
        # Check if this was a fallback extraction
        extraction_method = result.get('extraction_method', 'holistic')
        
        # Base score for successful website extraction
        if result['website_colors']:
            score += 60.0
        
        # Bonus for different types of elements found
        if result['website_backgrounds']:
            score += 10.0
        if result['website_headers']:
            score += 10.0
        if result['website_buttons']:
            score += 5.0
        if result['website_fonts']:
            score += 10.0
        if result['website_logo_url']:
            score += 15.0
        
        # Bonus for guidelines
        if result['guidelines_found']:
            score += 15.0
        
        # Bonus for comprehensive analysis
        elements_bonus = min(10.0, result.get('total_elements_analyzed', 0) * 0.5)
        score += elements_bonus
        
        return min(100.0, score)
    
    def _deduplicate_colors(self, colors: List[str]) -> List[str]:
        """Remove duplicate colors."""
        seen = set()
        result = []
        
        for color in colors:
            if color and len(color) == 7 and color.startswith('#'):
                if color.upper() not in seen:
                    seen.add(color.upper())
                    result.append(color)
        
        return result
    
    def _deduplicate_fonts(self, fonts: List[str]) -> List[str]:
        """Remove duplicate fonts."""
        seen = set()
        result = []
        
        for font in fonts:
            # Handle case where font might be a list
            if isinstance(font, list):
                for f in font:
                    if isinstance(f, str) and f and f.lower() not in seen:
                        seen.add(f.lower())
                        result.append(f)
            elif isinstance(font, str) and font and font.lower() not in seen:
                seen.add(font.lower())
                result.append(font)
        
        return result
    
    
    async def _process_logo(self, logo_url: str) -> Dict[str, Any]:
        """Process and analyze logo with enhanced capabilities."""
        logo_data = {
            'url': logo_url,
            'accessible': False,
            'size': None,
            'content_type': None,
            'base64': None,
            'dominant_colors': [],
            'format': None,
            'dimensions': None
        }
        
        try:
            # Skip data URLs for now
            if logo_url.startswith('data:'):
                logo_data['accessible'] = True
                logo_data['format'] = 'svg' if 'svg' in logo_url else 'embedded'
                return logo_data
            
            async with self.session.head(logo_url) as response:
                if response.status == 200:
                    logo_data['accessible'] = True
                    content_type = response.headers.get('Content-Type', '').lower()
                    logo_data['content_type'] = content_type
                    logo_data['size'] = response.headers.get('Content-Length', '0')
                    
                    # Determine format from content type or URL
                    if 'svg' in content_type or logo_url.lower().endswith('.svg'):
                        logo_data['format'] = 'svg'
                    elif 'png' in content_type or logo_url.lower().endswith('.png'):
                        logo_data['format'] = 'png'
                    elif any(fmt in content_type for fmt in ['jpeg', 'jpg']) or any(logo_url.lower().endswith(ext) for ext in ['.jpg', '.jpeg']):
                        logo_data['format'] = 'jpeg'
                    elif 'webp' in content_type or logo_url.lower().endswith('.webp'):
                        logo_data['format'] = 'webp'
                    else:
                        logo_data['format'] = 'unknown'
                    
                    # If it's a small image, get it for processing
                    size = int(logo_data['size']) if logo_data['size'].isdigit() else 0
                    should_fetch = (0 < size < 100000 or  # Less than 100KB
                                  logo_data['format'] == 'svg')  # Always fetch SVGs
                    
                    if should_fetch:
                        async with self.session.get(logo_url) as img_response:
                            if img_response.status == 200:
                                img_data = await img_response.read()
                                
                                # For small images, create base64
                                if len(img_data) < 50000:  # Less than 50KB for base64
                                    import base64
                                    logo_data['base64'] = base64.b64encode(img_data).decode('utf-8')
                                
                                # Try to extract dominant colors for raster images
                                if logo_data['format'] in ['png', 'jpeg', 'webp']:
                                    try:
                                        logo_data['dominant_colors'] = await self._extract_logo_colors(img_data)
                                    except Exception:
                                        pass
                                
                                # For SVG, try to extract colors from the markup
                                elif logo_data['format'] == 'svg':
                                    try:
                                        svg_text = img_data.decode('utf-8')
                                        svg_colors = re.findall(r'(?:fill|stroke)=["\']?#([0-9A-Fa-f]{6})["\']?', svg_text)
                                        logo_data['dominant_colors'] = [f'#{c.upper()}' for c in svg_colors[:5]]
                                    except Exception:
                                        pass
        
        except Exception as e:
            logger.debug(f"Logo processing failed: {e}")
        
        return logo_data
    
    async def _extract_logo_colors(self, img_data: bytes) -> List[str]:
        """Extract dominant colors from logo image data."""
        try:
            # This would require PIL/Pillow for proper implementation
            # For now, return empty list since we don't want to add heavy dependencies
            # In a full implementation, you'd use PIL to:
            # 1. Open the image
            # 2. Resize to small size for performance
            # 3. Get color histogram
            # 4. Return most common colors
            return []
        except Exception:
            return []