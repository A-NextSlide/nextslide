"""Brand color search tool for finding official brand colors dynamically."""

import re
from typing import Dict, List, Optional, Tuple, Any
from setup_logging_optimized import get_logger
from agents.research.tools import WebSearcher, PageFetcher, WebPage
from agents.ai.clients import get_client
from agents.config import THEME_STYLE_MODEL
from .image_color_extractor import extract_logo_colors

logger = get_logger(__name__)


class BrandColorSearcher:
    """Tool for dynamically searching and extracting brand colors."""
    
    def __init__(self):
        self.web_searcher = WebSearcher()
        self.page_fetcher = PageFetcher()
    
    async def search_brand_colors(
        self,
        brand_name: str,
        url: Optional[str] = None
    ) -> Dict[str, Any]:
        """Search for brand colors using AI model knowledge and web search.
        
        Args:
            brand_name: Name of the brand to search for
            url: Optional specific URL to extract colors from
            
        Returns:
            Dict with:
            - colors: List of hex color codes
            - source: Where the colors came from
            - confidence: How confident we are in the colors
            - backgrounds: Suggested background colors
            - accents: Suggested accent colors
        """
        
        logger.info(f"Searching for {brand_name} colors dynamically")
        
        # PRIORITY 1: Check brandfetch cache database first (HIGHEST PRIORITY)
        db_result = None
        try:
            from agents.tools.theme.brand_colors_db import get_brand_colors
            db_result = get_brand_colors(brand_name)
        except Exception as e:
            logger.warning(f"Error accessing brandfetch cache for {brand_name}: {e}")
        
        if db_result and db_result.get('colors'):
            colors = db_result.get('colors', [])
            fonts = db_result.get('fonts', [])
            logo_url = db_result.get('logo_url')
            backgrounds, accents = self._analyze_brand_colors(colors)
            
            logger.info(f"✅ BRANDFETCH CACHE HIT for {brand_name}: {colors}")
            
            result = {
                "colors": colors,
                "source": "brandfetch_cache", 
                "confidence": 0.95,  # Highest confidence for cached brand data
                "backgrounds": backgrounds,
                "accents": accents,
                "brand_name": db_result.get('name', brand_name),
                "fonts": fonts,
                "logo_url": logo_url,
                "domain": db_result.get('domain', brand_name)
            }
            
            # IMMEDIATELY RETURN - No AI calls needed when we have brand cache data
            return result
        
        # Then try asking the AI model if it knows the brand colors
        model_colors = await self._query_model_for_colors(brand_name)
        if model_colors:
            backgrounds, accents = self._analyze_brand_colors(model_colors)
            return {
                "colors": model_colors,
                "source": "ai_model",
                "confidence": 0.8,
                "backgrounds": backgrounds,
                "accents": accents,
                "brand_name": brand_name
            }
        
        # If a specific URL is provided, try to extract colors and fonts from it
        if url:
            try:
                content = await self.page_fetcher.fetch(url)
                if content:
                    # Extract hex colors from the page
                    colors = self._extract_hex_colors(content)
                    fonts = self._extract_fonts(content)
                    
                    if colors:
                        backgrounds, accents = self._analyze_brand_colors(colors)
                        return {
                            "colors": colors[:6],  # Limit to 6 colors
                            "fonts": fonts[:6],
                            "source": "url_extraction",
                            "confidence": 0.7,
                            "backgrounds": backgrounds,
                            "accents": accents,
                            "brand_name": brand_name
                        }
            except Exception as e:
                logger.warning(f"Failed to extract colors from {url}: {e}")
        
        # Search the web for brand/school colors
        try:
            # If brand_name looks like a school, bias query toward school colors
            name_l = (brand_name or "").lower()
            is_school = any(k in name_l for k in ["high school", "school", "university", "college", "academy"])
            search_query = (
                f"{brand_name} school colors red black hex codes" if is_school else 
                f"{brand_name} official brand colors hex codes palette font family typography"
            )
            logger.info(f"Searching web for: {search_query}")
            
            # Use WebSearcher to find brand color information
            search_results = await self.web_searcher._search_with_model(search_query, per_query=5)
            
            # Try to extract colors from search results (hex or named colors like 'red', 'black')
            for page in search_results:
                # First check the snippet
                snippet = page.snippet or ""
                colors = self._extract_hex_colors(snippet)
                if not colors:
                    # Fallback to named colors if snippet mentions common school color pairs
                    named = self._extract_named_colors(snippet)
                    if named:
                        colors = self._map_named_to_hex(named)
                
                if colors and len(colors) >= 2:
                    backgrounds, accents = self._analyze_brand_colors(colors)
                    return {
                        "colors": colors[:6],  # Limit to 6 colors
                        "source": "web_search",
                        "confidence": 0.6,
                        "backgrounds": backgrounds,
                        "accents": accents,
                        "brand_name": brand_name
                    }
                
                # If no colors in snippet, try fetching the page
                if page.url and not colors:
                    try:
                        page_content = await self.page_fetcher.fetch(page.url)
                        if page_content:
                            colors = self._extract_hex_colors(page_content)
                            if not colors:
                                named = self._extract_named_colors(page_content)
                                if named:
                                    colors = self._map_named_to_hex(named)
                            fonts = self._extract_fonts(page_content)
                            if colors and len(colors) >= 2:
                                backgrounds, accents = self._analyze_brand_colors(colors)
                                return {
                                    "colors": colors[:6],
                                    "fonts": fonts[:6],
                                    "source": "web_page",
                                    "confidence": 0.5,
                                    "backgrounds": backgrounds,
                                    "accents": accents,
                                    "brand_name": brand_name
                                }
                    except Exception as e:
                        logger.warning(f"Failed to fetch {page.url}: {e}")
            
            # If no colors found from web search, try logo extraction
            logger.info(f"No colors found from web search, trying logo extraction for {brand_name}")
            
            try:
                logo_result = await extract_logo_colors(brand_name, num_colors=6)
                if logo_result.get("colors"):
                    colors = logo_result["colors"]
                    backgrounds, accents = self._analyze_brand_colors(colors)
                    return {
                        "colors": colors,
                        "source": "logo_extraction",
                        "confidence": 0.5,
                        "backgrounds": backgrounds,
                        "accents": accents,
                        "brand_name": brand_name,
                        "logo_url": logo_result.get("image_url")
                    }
            except Exception as e:
                logger.warning(f"Logo extraction failed for {brand_name}: {e}")
            
            # If still no colors found, return empty result
            logger.warning(f"No brand colors found for {brand_name}")
            return {
                "colors": [],
                "source": "not_found",
                "confidence": 0.0,
                "backgrounds": [],
                "accents": [],
                "brand_name": brand_name
            }
            
        except Exception as e:
            logger.error(f"Error searching brand colors: {e}")
            return {
                "colors": [],
                "source": "error",
                "confidence": 0.0,
                "backgrounds": [],
                "accents": [],
                "brand_name": brand_name
            }
        finally:
            # Ensure any shared sessions are closed to avoid warnings
            try:
                await self.page_fetcher.close()
            except Exception:
                pass
    
    async def _query_model_for_colors(self, brand_name: str) -> Optional[List[str]]:
        """Query the AI model for known brand colors."""
        try:
            prompt = f"""You are an expert on brand design and colors. Please provide the official brand colors for {brand_name}.

Return ONLY the hex color codes in a comma-separated list, nothing else. If you don't know the exact colors, return "UNKNOWN".

Example response for Google: #4285F4, #DB4437, #F4B400, #0F9D58
Example response for unknown: UNKNOWN"""
            
            # Get client and invoke
            from agents.ai.clients import get_client, invoke
            client, actual_model = get_client(THEME_STYLE_MODEL)
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": prompt}],
                max_tokens=100,
                temperature=0.1
            )
            
            response_text = response.strip()
            
            if response_text == "UNKNOWN" or "unknown" in response_text.lower():
                logger.info(f"AI model doesn't know colors for {brand_name}")
                return None
            
            # Extract hex colors from response
            colors = self._extract_hex_colors(response_text)
            
            if colors:
                logger.info(f"AI model provided colors for {brand_name}: {colors}")
                return colors
            
            return None
            
        except Exception as e:
            logger.error(f"Error querying AI model for brand colors: {e}")
            return None
    
    def _extract_named_colors(self, text: str) -> List[str]:
        """Extract basic named colors from text (useful for school colors pages)."""
        if not text:
            return []
        names = [
            'red','maroon','crimson','scarlet','garnet','cardinal','burgundy',
            'black','white','silver','gray','grey','charcoal',
            'blue','navy','royal','sky',
            'green','emerald','forest','kelly',
            'gold','yellow','orange','purple','violet'
        ]
        found: List[str] = []
        for n in names:
            if re.search(rf"\b{n}\b", text, re.IGNORECASE):
                found.append(n.lower())
        # Dedupe but preserve order
        seen = set()
        uniq = []
        for n in found:
            if n not in seen:
                seen.add(n)
                uniq.append(n)
        return uniq
    
    def _map_named_to_hex(self, names: List[str]) -> List[str]:
        """Map common color names to representative hex codes."""
        if not names:
            return []
        mapping = {
            'red': '#C62828', 'maroon': '#800000', 'crimson': '#DC143C', 'scarlet': '#FF2400', 'garnet': '#6E0B14', 'cardinal': '#C41E3A', 'burgundy': '#800020',
            'black': '#000000', 'white': '#FFFFFF', 'silver': '#C0C0C0', 'gray': '#757575', 'grey': '#757575', 'charcoal': '#333333',
            'blue': '#1E88E5', 'navy': '#001F3F', 'royal': '#4169E1', 'sky': '#87CEEB',
            'green': '#2E7D32', 'emerald': '#2E8B57', 'forest': '#0B6623', 'kelly': '#4CBB17',
            'gold': '#FFD700', 'yellow': '#FDD835', 'orange': '#FB8C00', 'purple': '#6A1B9A', 'violet': '#8F00FF'
        }
        hexes: List[str] = []
        for n in names:
            hex_code = mapping.get(n.lower())
            if hex_code and hex_code not in hexes:
                hexes.append(hex_code)
        # Prefer up to 6 colors
        return hexes[:6]
    
    def _extract_hex_colors(self, text: str) -> List[str]:
        """Extract hex color codes from text."""
        # Pattern to match hex colors
        hex_pattern = r'#[0-9A-Fa-f]{6}\b'
        
        # Find all matches
        matches = re.findall(hex_pattern, text)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_colors = []
        for color in matches:
            color_upper = color.upper()
            if color_upper not in seen:
                seen.add(color_upper)
                unique_colors.append(color_upper)
        
        return unique_colors
    
    async def _extract_colors_from_url(self, url: str) -> List[str]:
        """Extract color codes from a specific URL."""
        try:
            content = await self.page_fetcher.fetch(url)
            if content:
                return self._extract_hex_colors(content)
        except Exception as e:
            logger.error(f"Error extracting colors from {url}: {e}")
        
        return []

    def _extract_fonts(self, content: str) -> List[str]:
        """Extract likely font family names from HTML/CSS content.
        Similar to WebColorScraper._extract_fonts but localized to avoid import cycles.
        """
        fonts: List[str] = []
        if not content:
            return fonts
        try:
            # @font-face
            for block in re.findall(r"@font-face\s*\{[^}]*\}", content, re.DOTALL | re.IGNORECASE):
                m = re.search(r"font-family\s*:\s*(['\"]?)([^;]+?)\1\s*;", block, re.IGNORECASE)
                if m:
                    name = m.group(2).strip()
                    name = name.split(',')[0].strip().strip('"\'')
                    fonts.append(name)
            # font-family declarations
            for m in re.finditer(r"font-family\s*:\s*([^;]+);", content, re.IGNORECASE):
                val = m.group(1)
                family = val.split(',')[0].strip().strip('"\'')
                if family.lower() not in ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"]:
                    fonts.append(family)
            # Google Fonts
            for m in re.finditer(r"href=[\"']([^\"']*fonts\.googleapis\.com[^\"']*)[\"']", content, re.IGNORECASE):
                href = m.group(1)
                fam_match = re.search(r"[?&]family=([^&]+)", href)
                if fam_match:
                    fams = re.sub(r":.*$", "", fam_match.group(1))
                    for fam in fams.split("|"):
                        fam_name = fam.replace("+", " ").strip()
                        if fam_name:
                            fonts.append(fam_name)
        except Exception:
            pass
        # Dedupe/clean
        cleaned: List[str] = []
        seen = set()
        for f in fonts:
            name = re.sub(r"[^A-Za-z0-9\s\-]", "", f).strip()
            key = name.lower()
            if name and key not in seen:
                seen.add(key)
                cleaned.append(name)
        return cleaned[:20]
    
    def _analyze_brand_colors(self, colors: List[str]) -> Tuple[List[str], List[str]]:
        """Analyze brand colors to determine backgrounds and accents.
        
        Returns:
            Tuple of (background_colors, accent_colors)
        """
        if not colors:
            return [], []
        
        # Calculate brightness for each color
        color_brightness = []
        for color in colors:
            brightness = self._calculate_brightness(color)
            saturation = self._calculate_saturation(color)
            color_brightness.append((color, brightness, saturation))
        
        # Sort by brightness (darkest first)
        color_brightness.sort(key=lambda x: x[1])
        
        backgrounds = []
        accents = []
        
        # Logic for selecting backgrounds and accents
        for color, brightness, saturation in color_brightness:
            # Very dark colors are good for backgrounds
            if brightness < 0.3:
                backgrounds.append(color)
            # High saturation colors are good for accents
            elif saturation > 0.5:
                accents.append(color)
            # Medium brightness can be either
            elif brightness < 0.7:
                if len(backgrounds) < 2:
                    backgrounds.append(color)
                else:
                    accents.append(color)
            # Light colors are typically accents
            else:
                accents.append(color)
        
        # Ensure we have at least one of each
        if not backgrounds and colors:
            backgrounds = [colors[0]]
        if not accents and len(colors) > 1:
            accents = [colors[1]]
        
        return backgrounds[:2], accents[:3]
    
    def _calculate_brightness(self, hex_color: str) -> float:
        """Calculate perceived brightness of a color (0-1)."""
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Convert to RGB
        r = int(hex_color[0:2], 16) / 255
        g = int(hex_color[2:4], 16) / 255
        b = int(hex_color[4:6], 16) / 255
        
        # Calculate perceived brightness
        return (0.299 * r + 0.587 * g + 0.114 * b)
    
    def _calculate_saturation(self, hex_color: str) -> float:
        """Calculate saturation of a color (0-1)."""
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Convert to RGB
        r = int(hex_color[0:2], 16) / 255
        g = int(hex_color[2:4], 16) / 255
        b = int(hex_color[4:6], 16) / 255
        
        # Calculate saturation
        max_val = max(r, g, b)
        min_val = min(r, g, b)
        
        if max_val == 0:
            return 0
        
        return (max_val - min_val) / max_val