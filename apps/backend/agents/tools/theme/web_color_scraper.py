"""Advanced web scraping tools for extracting brand colors from various sources."""

import re
import json
from typing import Dict, List, Optional, Tuple, Any
from urllib.parse import urlparse, urljoin
from setup_logging_optimized import get_logger
from agents.research.tools import WebSearcher, PageFetcher

logger = get_logger(__name__)


class WebColorScraper:
    """Advanced web scraper for extracting brand colors from various sources."""
    
    def __init__(self):
        self.web_searcher = WebSearcher()
        self.page_fetcher = PageFetcher()
    
    async def close(self) -> None:
        """Close underlying HTTP session(s)."""
        try:
            await self.page_fetcher.close()
        except Exception:
            pass
    
    async def scrape_brand_website(self, brand_name: str, url: Optional[str] = None) -> Dict[str, Any]:
        """Scrape a brand's website for colors from CSS, style guides, and design systems.
        
        Returns:
            Dict with extracted colors, CSS variables, and design tokens
        """
        # If no URL provided, search for the brand's website
        if not url:
            search_query = f"{brand_name} official website"
            async for result in self.web_searcher.search(search_query, num_results=3):
                if result.get("type") == "search_result":
                    # Try to find official website
                    result_url = result.get("url", "")
                    if brand_name.lower() in result_url.lower():
                        url = result_url
                        break
            
            if not url:
                logger.warning(f"Could not find official website for {brand_name}")
                return {"colors": [], "source": "not_found"}
        
        logger.info(f"Scraping {url} for brand colors...")
        
        # Fetch the main page
        main_raw = await self.page_fetcher.fetch_raw(url)
        main_content = await self._fetch_page_content(url)
        main_colors = self._extract_all_color_formats(main_content or "")
        main_fonts = self._extract_fonts(main_content or "")
        logo_candidates = self._extract_logo_candidates(main_raw or main_content or "", base_url=url)
        
        # Try to find and scrape additional resources
        resources_to_check = [
            "/css/main.css",
            "/css/style.css", 
            "/assets/css/main.css",
            "/dist/css/app.css",
            "/styleguide",
            "/brand",
            "/design-system",
            "/about/brand",
            "/press",
            "/media-kit"
        ]
        
        all_colors = set(main_colors)
        css_variables = {}
        design_tokens = {}
        found_fonts = set(main_fonts)
        
        # Parse base URL
        parsed_url = urlparse(url)
        base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"
        
        # Discover linked stylesheets
        stylesheet_urls = self._extract_stylesheet_hrefs(main_raw or main_content or "", base_url)
        discovered = list(dict.fromkeys(stylesheet_urls + [urljoin(base_url, r) for r in resources_to_check]))

        # Check additional resources
        for resource_url in discovered:
            try:
                logger.debug(f"Checking {resource_url}...")
                content = await self._fetch_page_content(resource_url)
                
                if content:
                    # Extract colors
                    colors = self._extract_all_color_formats(content)
                    all_colors.update(colors)
                    
                    # Extract CSS variables
                    vars = self._extract_css_variables(content)
                    css_variables.update(vars)
                    
                    # Extract design tokens
                    tokens = self._extract_design_tokens(content)
                    design_tokens.update(tokens)

                    # Extract fonts
                    fonts_here = self._extract_fonts(content)
                    for f in fonts_here:
                        found_fonts.add(f)
                    
            except Exception as e:
                logger.debug(f"Failed to fetch {resource_url}: {e}")
        
        # Analyze and categorize colors
        categorized = self._categorize_brand_colors(list(all_colors), css_variables)
        
        # Pick a logo URL
        logo_url = None
        if logo_candidates:
            def _score(u: str) -> int:
                ul = (u or "").lower()
                if ul.endswith(".svg"):
                    return 3
                if ul.endswith(".png"):
                    return 2
                if ul.endswith(".ico") or "favicon" in ul:
                    return 1
                return 0
            logo_candidates.sort(key=_score, reverse=True)
            logo_url = logo_candidates[0]
        else:
            logo_url = urljoin(base_url, "/favicon.ico")

        result = {
            "brand_name": brand_name,
            "url": url,
            "colors": list(all_colors)[:20],  # Limit to 20 colors
            "css_variables": css_variables,
            "design_tokens": design_tokens,
            "categorized": categorized,
            "fonts": list(dict.fromkeys(list(found_fonts)))[:10],
            "logo_url": logo_url,
            "source": "website_scrape"
        }
        try:
            # Log concise summary for terminal visibility
            sample_cols = ", ".join(list(result["colors"])[:6])
            logger.info(f"[SCRAPER] {brand_name} | url={url} | colors={len(result['colors'])} ({sample_cols}) | fonts={len(result['fonts'])} | css_vars={len(css_variables)}")
        except Exception:
            pass
        return result

    def _extract_stylesheet_hrefs(self, content: str, base_url: str) -> List[str]:
        try:
            hrefs = re.findall(r"<link[^>]+rel=[\"']stylesheet[\"'][^>]+href=[\"']([^\"']+)[\"']", content, re.IGNORECASE)
            return [urljoin(base_url, h) for h in hrefs]
        except Exception:
            return []

    def _extract_logo_candidates(self, content: str, base_url: str) -> List[str]:
        candidates: List[str] = []
        try:
            # Common logo selectors
            imgs = re.findall(r"<img[^>]+src=[\"']([^\"']+)[\"'][^>]*>", content, re.IGNORECASE)
            for src in imgs:
                sl = src.lower()
                if any(k in sl for k in ["logo", "brandmark", "wordmark", "favicon"]):
                    candidates.append(urljoin(base_url, src))
            svgs = re.findall(r"<svg[^>]*>(.*?)</svg>", content, re.IGNORECASE | re.DOTALL)
            if svgs:
                # Embedded SVG present; we won't inline it, but note favicon fallback will handle
                pass
        except Exception:
            pass
        return list(dict.fromkeys(candidates))[:10]
    
    async def search_brand_guidelines(self, brand_name: str) -> Dict[str, Any]:
        """Search for brand guidelines PDFs or pages.
        
        Returns:
            Dict with brand guideline information and extracted colors
        """
        search_queries = [
            f"{brand_name} brand guidelines PDF filetype:pdf",
            f"{brand_name} visual identity guidelines",
            f"{brand_name} style guide colors",
            f"{brand_name} brand book download"
        ]
        
        guidelines_found = []
        
        for query in search_queries:
            async for result in self.web_searcher.search(query, num_results=3):
                if result.get("type") == "search_result":
                    url = result.get("url", "")
                    title = result.get("title", "")
                    
                    # Check if it's a PDF or brand guideline page
                    if any(keyword in url.lower() or keyword in title.lower() 
                          for keyword in ["guideline", "brand", "identity", "style", ".pdf"]):
                        guidelines_found.append({
                            "url": url,
                            "title": title,
                            "type": "pdf" if ".pdf" in url else "webpage"
                        })
        
        # Extract colors from guidelines pages
        all_colors = []
        found_fonts: List[str] = []
        for guideline in guidelines_found[:3]:  # Check top 3 results
            if guideline["type"] == "webpage":
                content = await self._fetch_page_content(guideline["url"])
                if content:
                    colors = self._extract_all_color_formats(content)
                    all_colors.extend(colors)
                    fonts = self._extract_fonts(content)
                    found_fonts.extend(fonts)
        
        return {
            "brand_name": brand_name,
            "guidelines_found": guidelines_found,
            "colors": list(set(all_colors))[:15],
            "fonts": list(dict.fromkeys(found_fonts))[:10],
            "source": "brand_guidelines"
        }
    
    async def extract_from_css_framework(self, framework_url: str) -> Dict[str, Any]:
        """Extract colors from CSS frameworks like Bootstrap, Tailwind, etc.
        
        Returns:
            Dict with framework color palette
        """
        content = await self._fetch_page_content(framework_url)
        
        if not content:
            return {"colors": [], "source": "framework_not_found"}
        
        # Extract CSS variables and color classes
        css_vars = self._extract_css_variables(content)
        color_classes = self._extract_color_classes(content)
        all_colors = self._extract_all_color_formats(content)
        
        # Organize by color family
        color_families = self._organize_color_families(all_colors)
        
        return {
            "url": framework_url,
            "css_variables": css_vars,
            "color_classes": color_classes,
            "colors": list(all_colors)[:30],
            "color_families": color_families,
            "source": "css_framework"
        }
    
    async def _extract_colors_from_url(self, url: str) -> List[str]:
        """Extract colors from a specific URL."""
        content = await self._fetch_page_content(url)
        
        if not content:
            return []
        
        return self._extract_all_color_formats(content)
    
    async def _fetch_page_content(self, url: str) -> Optional[str]:
        """Fetch page content using PageFetcher."""
        try:
            # PageFetcher.fetch returns a string directly
            content = await self.page_fetcher.fetch(url)
            return content if content else None
        except Exception as e:
            logger.error(f"Error fetching {url}: {e}")
            return None
    
    def _extract_all_color_formats(self, content: str) -> List[str]:
        """Extract colors in various formats: hex, rgb, rgba, hsl, hsla."""
        colors = set()
        
        # Hex colors
        hex_pattern = r'#(?:[0-9a-fA-F]{3}){1,2}\b'
        hex_colors = re.findall(hex_pattern, content)
        colors.update(self._normalize_hex_colors(hex_colors))
        
        # RGB/RGBA colors
        rgb_pattern = r'rgba?\s*\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)(?:\s*,\s*[\d.]+)?\s*\)'
        rgb_matches = re.findall(rgb_pattern, content)
        for match in rgb_matches:
            try:
                r, g, b = int(match[0]), int(match[1]), int(match[2])
                if 0 <= r <= 255 and 0 <= g <= 255 and 0 <= b <= 255:
                    hex_color = f"#{r:02X}{g:02X}{b:02X}"
                    colors.add(hex_color)
            except Exception:
                pass
        
        # HSL colors (convert to hex)
        hsl_pattern = r'hsl\s*\(\s*(\d+)\s*,\s*(\d+)%\s*,\s*(\d+)%\s*\)'
        hsl_matches = re.findall(hsl_pattern, content)
        for match in hsl_matches:
            try:
                h, s, l = int(match[0]), int(match[1]), int(match[2])
                hex_color = self._hsl_to_hex(h, s, l)
                if hex_color:
                    colors.add(hex_color)
            except Exception:
                pass
        
        return list(colors)

    def _extract_fonts(self, content: str) -> List[str]:
        """Extract likely font family names from HTML/CSS content.
        Looks for:
        - @font-face blocks with font-family
        - CSS font-family declarations
        - Google Fonts and other font provider links
        - Common typography sections mentioning primary/secondary fonts
        """
        if not content:
            return []

        fonts: List[str] = []

        # @font-face font-family
        try:
            ff_blocks = re.findall(r"@font-face\s*\{[^}]*\}", content, re.DOTALL | re.IGNORECASE)
            for block in ff_blocks:
                m = re.search(r"font-family\s*:\s*(['\"]?)([^;]+?)\1\s*;", block, re.IGNORECASE)
                if m:
                    name = m.group(2).strip()
                    name = name.split(',')[0].strip().strip('"\'')
                    fonts.append(name)
        except Exception:
            pass

        # CSS font-family declarations
        try:
            for m in re.finditer(r"font-family\s*:\s*([^;]+);", content, re.IGNORECASE):
                val = m.group(1)
                family = val.split(',')[0].strip().strip('"\'')
                # Skip generic family names
                low = family.lower()
                if low in ["sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui"]:
                    continue
                fonts.append(family)
        except Exception:
            pass

        # Google Fonts and other providers
        try:
            for m in re.finditer(r"href=[\"']([^\"']*fonts\.googleapis\.com[^\"']*)[\"']", content, re.IGNORECASE):
                href = m.group(1)
                fam_match = re.search(r"[?&]family=([^&]+)", href)
                if fam_match:
                    fams = fam_match.group(1)
                    fams = re.sub(r":.*$", "", fams)  # strip weights/styles
                    for fam in fams.split("|"):
                        fam_name = fam.replace("+", " ").strip()
                        if fam_name:
                            fonts.append(fam_name)
        except Exception:
            pass

        # Typography mentions (simple heuristic)
        try:
            for m in re.finditer(r"(?:Primary|Secondary)\s+(?:font|typeface)\s*[:\-]\s*([A-Za-z0-9\s\-]+)", content, re.IGNORECASE):
                name = m.group(1).strip()
                if name:
                    fonts.append(name)
        except Exception:
            pass

        # Normalize and dedupe
        cleaned: List[str] = []
        seen = set()
        for f in fonts:
            name = f.strip()
            name = re.sub(r"[^A-Za-z0-9\s\-]", "", name)
            name = re.sub(r"\s+", " ", name).strip()
            if not name:
                continue
            key = name.lower()
            if key not in seen:
                seen.add(key)
                cleaned.append(name)
        return cleaned[:20]
    
    def _extract_css_variables(self, content: str) -> Dict[str, str]:
        """Extract CSS custom properties (variables)."""
        variables = {}
        
        # Find :root or other CSS variable declarations
        var_pattern = r'--([a-zA-Z0-9-]+)\s*:\s*([^;]+);'
        matches = re.findall(var_pattern, content)
        
        for name, value in matches:
            # Clean up the value
            value = value.strip()
            
            # Check if it's a color
            if any(keyword in name.lower() for keyword in ['color', 'bg', 'background', 'primary', 'secondary', 'accent']):
                # Try to extract color from value
                if value.startswith('#'):
                    variables[f"--{name}"] = value
                elif 'rgb' in value:
                    # Extract RGB and convert to hex
                    rgb_match = re.search(r'(\d+)\s*,\s*(\d+)\s*,\s*(\d+)', value)
                    if rgb_match:
                        r, g, b = int(rgb_match.group(1)), int(rgb_match.group(2)), int(rgb_match.group(3))
                        variables[f"--{name}"] = f"#{r:02X}{g:02X}{b:02X}"
        
        return variables
    
    def _extract_design_tokens(self, content: str) -> Dict[str, Any]:
        """Extract design tokens from JSON or JavaScript objects."""
        tokens = {}
        
        # Look for JSON objects that might contain design tokens
        json_pattern = r'\{[^{}]*"(?:color|palette|theme)"[^{}]*\}'
        json_matches = re.findall(json_pattern, content, re.DOTALL)
        
        for match in json_matches:
            try:
                data = json.loads(match)
                if isinstance(data, dict):
                    tokens.update(self._flatten_design_tokens(data))
            except Exception:
                pass
        
        return tokens
    
    def _extract_color_classes(self, content: str) -> Dict[str, str]:
        """Extract color utility classes (like Tailwind/Bootstrap)."""
        classes = {}
        
        # Common patterns for color classes
        patterns = [
            r'\.([a-zA-Z]+-(?:50|100|200|300|400|500|600|700|800|900))\s*\{[^}]*color:\s*([^;]+);',
            r'\.text-([a-zA-Z]+)\s*\{[^}]*color:\s*([^;]+);',
            r'\.bg-([a-zA-Z]+)\s*\{[^}]*background-color:\s*([^;]+);',
        ]
        
        for pattern in patterns:
            matches = re.findall(pattern, content)
            for class_name, color_value in matches:
                # Clean and normalize color value
                color_value = color_value.strip()
                if color_value.startswith('#'):
                    classes[class_name] = color_value
        
        return classes
    
    def _categorize_brand_colors(self, colors: List[str], css_vars: Dict[str, str]) -> Dict[str, List[str]]:
        """Categorize colors into primary, secondary, accent, etc."""
        categorized = {
            "primary": [],
            "secondary": [],
            "accent": [],
            "background": [],
            "text": [],
            "success": [],
            "warning": [],
            "error": [],
            "neutral": []
        }
        
        # Use CSS variable names to help categorize
        for var_name, color in css_vars.items():
            var_lower = var_name.lower()
            
            if 'primary' in var_lower:
                categorized["primary"].append(color)
            elif 'secondary' in var_lower:
                categorized["secondary"].append(color)
            elif 'accent' in var_lower:
                categorized["accent"].append(color)
            elif any(bg in var_lower for bg in ['background', 'bg']):
                categorized["background"].append(color)
            elif 'text' in var_lower:
                categorized["text"].append(color)
            elif 'success' in var_lower or 'green' in var_lower:
                categorized["success"].append(color)
            elif 'warning' in var_lower or 'yellow' in var_lower:
                categorized["warning"].append(color)
            elif 'error' in var_lower or 'danger' in var_lower or 'red' in var_lower:
                categorized["error"].append(color)
            elif any(n in var_lower for n in ['gray', 'grey', 'neutral']):
                categorized["neutral"].append(color)
        
        # For remaining colors, categorize by brightness/saturation
        for color in colors:
            if color not in [c for cats in categorized.values() for c in cats]:
                brightness = self._calculate_brightness(color)
                saturation = self._calculate_saturation(color)
                
                if brightness > 0.9:
                    categorized["background"].append(color)
                elif brightness < 0.2:
                    categorized["text"].append(color)
                elif saturation > 0.7:
                    if len(categorized["accent"]) < 3:
                        categorized["accent"].append(color)
                    else:
                        categorized["secondary"].append(color)
                else:
                    categorized["neutral"].append(color)
        
        # Remove duplicates and limit each category
        for category in categorized:
            categorized[category] = list(dict.fromkeys(categorized[category]))[:5]
        
        return categorized
    
    def _organize_color_families(self, colors: List[str]) -> Dict[str, List[str]]:
        """Organize colors into families based on hue."""
        families = {
            "red": [],
            "orange": [],
            "yellow": [],
            "green": [],
            "blue": [],
            "purple": [],
            "pink": [],
            "gray": []
        }
        
        for color in colors:
            hue = self._get_color_hue(color)
            saturation = self._calculate_saturation(color)
            
            if saturation < 0.1:  # Grayscale
                families["gray"].append(color)
            elif 0 <= hue < 30 or hue >= 330:
                families["red"].append(color)
            elif 30 <= hue < 60:
                families["orange"].append(color)
            elif 60 <= hue < 150:
                families["green"].append(color)
            elif 150 <= hue < 210:
                families["blue"].append(color)
            elif 210 <= hue < 270:
                families["blue"].append(color)
            elif 270 <= hue < 330:
                if self._is_pink_color(color):
                    families["pink"].append(color)
                else:
                    families["purple"].append(color)
        
        # Remove empty families
        return {k: v for k, v in families.items() if v}
    
    def _normalize_hex_colors(self, colors: List[str]) -> List[str]:
        """Normalize hex colors to 6-digit uppercase format."""
        normalized = []
        for color in colors:
            if len(color) == 4:  # #RGB
                color = f"#{color[1]}{color[1]}{color[2]}{color[2]}{color[3]}{color[3]}"
            normalized.append(color.upper())
        return normalized
    
    def _hsl_to_hex(self, h: int, s: int, l: int) -> Optional[str]:
        """Convert HSL to hex color."""
        try:
            s = s / 100.0
            l = l / 100.0
            
            c = (1 - abs(2 * l - 1)) * s
            x = c * (1 - abs((h / 60) % 2 - 1))
            m = l - c / 2
            
            if 0 <= h < 60:
                r, g, b = c, x, 0
            elif 60 <= h < 120:
                r, g, b = x, c, 0
            elif 120 <= h < 180:
                r, g, b = 0, c, x
            elif 180 <= h < 240:
                r, g, b = 0, x, c
            elif 240 <= h < 300:
                r, g, b = x, 0, c
            else:
                r, g, b = c, 0, x
            
            r = int((r + m) * 255)
            g = int((g + m) * 255)
            b = int((b + m) * 255)
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return None
    
    def _flatten_design_tokens(self, obj: Dict[str, Any], prefix: str = "") -> Dict[str, Any]:
        """Flatten nested design token objects."""
        flattened = {}
        
        for key, value in obj.items():
            full_key = f"{prefix}.{key}" if prefix else key
            
            if isinstance(value, dict):
                flattened.update(self._flatten_design_tokens(value, full_key))
            elif isinstance(value, str) and (value.startswith('#') or 'rgb' in value):
                flattened[full_key] = value
        
        return flattened
    
    def _calculate_brightness(self, hex_color: str) -> float:
        """Calculate perceived brightness of a color (0-1)."""
        try:
            hex_color = hex_color.lstrip('#')
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            return 0.299 * r + 0.587 * g + 0.114 * b
        except Exception:
            return 0.5
    
    def _calculate_saturation(self, hex_color: str) -> float:
        """Calculate saturation of a color (0-1)."""
        try:
            hex_color = hex_color.lstrip('#')
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            
            if max_val == 0:
                return 0
            
            return (max_val - min_val) / max_val
        except Exception:
            return 0.5
    
    def _get_color_hue(self, hex_color: str) -> int:
        """Get the hue of a color (0-360 degrees)."""
        try:
            hex_color = hex_color.lstrip('#')
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            
            if max_val == min_val:
                return 0
            
            delta = max_val - min_val
            
            if max_val == r:
                hue = ((g - b) / delta) % 6
            elif max_val == g:
                hue = (b - r) / delta + 2
            else:
                hue = (r - g) / delta + 4
            
            return int(hue * 60)
        except Exception:
            return 0
    
    def _is_pink_color(self, hex_color: str) -> bool:
        """Check if a color is pink."""
        try:
            hue = self._get_color_hue(hex_color)
            saturation = self._calculate_saturation(hex_color)
            brightness = self._calculate_brightness(hex_color)
            
            # Pink is typically high brightness, medium saturation, red-purple hue
            return (280 <= hue <= 340 and saturation > 0.3 and brightness > 0.5)
        except Exception:
            return False
