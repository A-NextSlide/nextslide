"""Smart color selector that combines multiple strategies for finding the perfect colors."""

import re
from typing import Dict, List, Optional, Any, Tuple
from setup_logging_optimized import get_logger
from .brand_color_tools import BrandColorSearcher
from .web_color_scraper import WebColorScraper
from .palette_tools import (
    search_palette_by_topic,
    search_palette_by_keywords,
    get_random_palette,
    filter_out_pink_colors
)
from agents.research.tools import WebSearcher

logger = get_logger(__name__)


class SmartColorSelector:
    """Intelligent color selection combining multiple data sources and strategies."""
    
    def __init__(self):
        self.brand_searcher = BrandColorSearcher()
        self.web_scraper = WebColorScraper()
    
    async def select_colors_for_request(
        self,
        prompt: str,
        title: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        variety_seed: Optional[str] = None
    ) -> Dict[str, Any]:
        """Select the best colors based on the request context.
        
        Returns a comprehensive color scheme with:
        - Primary colors
        - Background colors (non-white preferred)
        - Accent colors
        - Text colors
        - Gradients
        - Source information
        """
        
        # Analyze the request
        request_analysis = self._analyze_color_request(prompt, title, style_preferences)
        
        # Gather all possible color sources
        color_sources = {}
        
        # Always check for explicit color requests (highest priority)
        if request_analysis['has_specific_colors']:
            specific_result = await self._get_specific_colors(request_analysis)
            if specific_result and specific_result.get('colors'):
                color_sources['specific'] = specific_result
        
        # Check style preferences for color guidance (second priority)
        style_colors = self._extract_style_colors(style_preferences)
        if style_colors:
            style_result = await self._get_colors_for_style(style_colors)
            if style_result and style_result.get('colors'):
                color_sources['style'] = style_result
        
        # Check for brand colors (third priority)
        if request_analysis['is_brand_request']:
            brand_result = await self._get_brand_colors(request_analysis)
            if brand_result and brand_result.get('colors'):
                color_sources['brand'] = brand_result
        
        # Check theme keywords (fourth priority)
        if request_analysis['has_theme_keywords']:
            theme_result = await self._get_theme_colors(request_analysis)
            if theme_result and theme_result.get('colors'):
                color_sources['theme'] = theme_result
        
        # Apply priority logic to select the best color source
        result = self._apply_color_priority(color_sources, request_analysis)
        
        # If still no colors, use topic-based fallback
        if not result or not result.get('colors'):
            result = await self._get_topic_colors(title, style_preferences, variety_seed)
        
        # Post-process the result
        result = self._post_process_colors(result, request_analysis)
        
        return result
    
    def _analyze_color_request(
        self,
        prompt: str,
        title: str,
        style_preferences: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """Analyze the request to determine color selection strategy."""
        
        # Analyze prompt, title, and style context (vibe) for better priority handling
        prompt_lower = (prompt or "").lower()
        title_lower = (title or "").lower()
        vibe_lower = ""
        if style_preferences and isinstance(style_preferences, dict):
            vibe_lower = (style_preferences.get('vibeContext') or "").lower()
        full_text = f"{prompt_lower} {title_lower} {vibe_lower}".strip()
        
        analysis = {
            'is_brand_request': False,
            'brand_name': None,
            'brand_url': None,
            'has_specific_colors': False,
            'specific_colors': [],
            'specific_colors_in_prompt': [],  # Track where colors came from
            'has_theme_keywords': False,
            'theme_keywords': [],
            'wants_pink': self._check_wants_pink(full_text),
            'prefers_dark': self._check_prefers_dark(full_text),
            'prefers_light': self._check_prefers_light(full_text),
            'wants_gradients': self._check_wants_gradients(full_text),
            'style_keywords': []
        }
        
        # Check for brand/school requests (include style preferences/vibe text)
        brand_info = self._detect_brand_request(f"{prompt} {title} {style_preferences.get('vibeContext') if style_preferences else ''}")
        if brand_info:
            analysis.update(brand_info)
        
        # Check for specific color requests in prompt (highest priority)
        prompt_colors = self._extract_specific_colors(prompt_lower)
        if prompt_colors:
            analysis['has_specific_colors'] = True
            analysis['specific_colors'] = prompt_colors
            analysis['specific_colors_in_prompt'] = prompt_colors
        
        # Also check title for colors
        title_colors = self._extract_specific_colors(title_lower)
        for color in title_colors:
            if color not in analysis['specific_colors']:
                analysis['specific_colors'].append(color)
        
        # Check for theme keywords
        theme_keywords = self._extract_theme_keywords(full_text)
        if theme_keywords:
            analysis['has_theme_keywords'] = True
            analysis['theme_keywords'] = theme_keywords
        
        # Extract style keywords
        analysis['style_keywords'] = self._extract_style_keywords(full_text)
        
        return analysis
    
    async def _get_brand_colors(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Get colors for a brand request."""
        brand_name = analysis['brand_name']
        brand_url = analysis.get('brand_url')
        
        # First try BrandColorSearcher
        result = await self.brand_searcher.search_brand_colors(brand_name, brand_url)
        
        if result['colors']:
            return self._format_color_result(result, f"{brand_name} brand colors")
        
        # If no colors found, try web scraping
        if brand_url or brand_name:
            scrape_result = await self.web_scraper.scrape_brand_website(brand_name, brand_url)
            if scrape_result.get('colors'):
                return self._format_color_result(scrape_result, f"{brand_name} (scraped)")
        
        # Try searching for brand guidelines
        guidelines = await self.web_scraper.search_brand_guidelines(brand_name)
        if guidelines.get('colors'):
            return self._format_color_result(guidelines, f"{brand_name} guidelines")
        
        return {'colors': [], 'source': 'brand_not_found'}
    
    async def _get_specific_colors(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Get colors based on specific color requests."""
        requested_colors = analysis['specific_colors']
        
        # Search palette DB for palettes containing these colors
        results = search_palette_by_keywords(requested_colors, limit=10)
        
        # Filter to find best matches
        best_match = None
        best_score = 0
        
        for palette in results:
            colors = palette.get('colors', [])
            # Score based on how many requested colors are present
            score = sum(1 for req_color in requested_colors 
                       if any(self._colors_match(req_color, pal_color) for pal_color in colors))
            
            if score > best_score:
                best_score = score
                best_match = palette
        
        if best_match:
            # Ensure requested colors are prominently featured
            result = self._format_color_result(best_match, "user color preference")
            result['requested_colors'] = requested_colors
            return result
        
        # If no good palette match, create a custom palette
        return self._create_custom_palette(requested_colors)
    
    async def _get_theme_colors(self, analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Get colors based on theme keywords."""
        keywords = analysis['theme_keywords']
        
        # Search for palettes matching theme
        results = search_palette_by_keywords(keywords, limit=5)
        
        if results:
            # Pick the most appropriate based on style preferences
            selected = self._select_best_palette(results, analysis)
            return self._format_color_result(selected, "theme match")
        
        return {'colors': [], 'source': 'theme_not_found'}
    
    async def _get_topic_colors(
        self,
        title: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        variety_seed: Optional[str] = None
    ) -> Dict[str, Any]:
        """Get colors based on the topic."""
        # Try topic-based search
        results = search_palette_by_topic(title, style_preferences, limit=5)
        
        if results:
            # Filter out pink if not wanted
            if style_preferences and not self._check_wants_pink(str(style_preferences)):
                results = [p for p in results if not self._palette_has_pink(p)]
            
            if results:
                # Use variety_seed to deterministically pick among candidates for diversity
                try:
                    idx = 0
                    if variety_seed is not None and len(results) > 1:
                        idx = abs(hash(str(variety_seed))) % len(results)
                    selected = results[idx]
                except Exception:
                    selected = results[0]
                return self._format_color_result(selected, "topic match")
        
        # Fallback to random palette
        random_palette = get_random_palette(exclude_pink=True)
        if random_palette:
            return self._format_color_result(random_palette, "random selection")
        
        # Ultimate fallback
        return self._get_default_palette()
    
    def _post_process_colors(
        self,
        result: Dict[str, Any],
        analysis: Dict[str, Any],
        preserve_brand_backgrounds: bool = False
    ) -> Dict[str, Any]:
        """Post-process colors to ensure they meet requirements."""
        
        if not result.get('colors'):
            return result
        
        colors = result['colors']
        
        # Filter out pink if not wanted
        if not analysis['wants_pink']:
            colors = filter_out_pink_colors(colors)
        
        # Choose backgrounds with a sensible default: light by default, dark only if requested
        backgrounds = result.get('backgrounds', [])
        if not isinstance(backgrounds, list):
            backgrounds = []
        
        prefers_dark = bool(analysis.get('prefers_dark'))
        prefers_light = bool(analysis.get('prefers_light'))

        # If we already have dark or overly neutral backgrounds but the user didn't ask for dark, recompute using light colored scheme
        if backgrounds and not prefers_dark:
            try:
                dark_count = sum(1 for bg in backgrounds[:2] if self._calculate_brightness(bg) < 0.45)
                neutral_count = sum(1 for bg in backgrounds[:2] if self._calculate_saturation(bg) < 0.12)
                if dark_count >= 1 or (len(backgrounds[:2]) > 0 and neutral_count == len(backgrounds[:2])):
                    backgrounds = []
            except Exception:
                pass

        if not backgrounds or (not preserve_brand_backgrounds and all(self._is_near_white(bg) for bg in backgrounds)):
            
            # Build candidates with brightness/saturation for robust selection
            def brightness(c: str) -> float:
                return self._calculate_brightness(c)
            
            def saturation(c: str) -> float:
                return self._calculate_saturation(c)
            
            non_white = [c for c in colors if not self._is_near_white(c)]
            if not non_white:
                # If all colors are near-white, create better alternatives from the best available color
                if colors:
                    # Pick the darkest available color and make it suitable for backgrounds
                    darkest = min(colors, key=self._calculate_brightness)
                    if self._calculate_brightness(darkest) > 0.7:
                        # If even the darkest is too light, darken it significantly
                        non_white = [self._darken_color(darkest, 0.6)]
                    else:
                        non_white = [darkest]
                else:
                    # Ultimate fallback to a good default palette
                    non_white = ['#0A0E27', '#1A1F3A']
            
            # Dark mode: keep earlier behavior (pick darker non-white)
            if prefers_dark:
                backgrounds = sorted(non_white, key=brightness)[:2]
            else:
                # Light/default mode: prefer light, non-neutral backgrounds when available
                light_candidates = sorted(non_white, key=brightness, reverse=True)
                # Prefer light but not pure white; bias toward colored (non-neutral) options
                primary_bg = None
                # 1) Try truly light colored candidates
                for c in light_candidates:
                    if brightness(c) >= 0.82 and self._calculate_saturation(c) >= 0.18 and not self._is_near_white(c):
                        primary_bg = c
                        break
                # 2) If none, synthesize a light variant from a medium-bright saturated color
                if primary_bg is None:
                    for c in sorted(non_white, key=brightness, reverse=True):
                        if 0.55 <= brightness(c) <= 0.82 and self._calculate_saturation(c) >= 0.35:
                            primary_bg = self._lighten_color(c, 0.22)
                            break
                # 3) Fallback to the lightest non-white candidate (may be neutral/gray)
                if primary_bg is None and light_candidates:
                    primary_bg = light_candidates[0]
                
                # Secondary: a slightly darker companion to create depth
                secondary_bg = None
                if primary_bg:
                    # Choose a different color close in lightness OR synthesize by darkening
                    for c in light_candidates:
                        if c != primary_bg and 0.65 <= brightness(c) <= brightness(primary_bg):
                            secondary_bg = c
                            break
                    if secondary_bg is None:
                        secondary_bg = self._darken_color(primary_bg, 0.12)
                    backgrounds = [primary_bg, secondary_bg]
                else:
                    # Fallback: synthesize a light scheme from the lightest color
                    if colors:
                        base = sorted(colors, key=brightness, reverse=True)[0]
                        backgrounds = [base, self._darken_color(base, 0.12)]
                    else:
                        backgrounds = ['#F5F7FA', '#FFFFFF']
        
        result['backgrounds'] = backgrounds
        
        # Ensure good text contrast
        primary_bg = backgrounds[0] if backgrounds else '#0A0E27'
        result['text_colors'] = self._calculate_text_colors(primary_bg, colors)
        
        # Ensure accents exist, are distinct from backgrounds, and provide contrast
        accents = result.get('accents', []) or []
        def _too_dark(c: str) -> bool:
            try:
                return self._calculate_brightness(c) < 0.35
            except Exception:
                return False
        def _too_light(c: str) -> bool:
            try:
                return self._calculate_brightness(c) > 0.95
            except Exception:
                return False
        
        # Recompute accents when missing, duplicated, or unusable
        invalid_accents = (
            len(accents) < 2
            or any(c in backgrounds for c in accents)
            or any(_too_dark(c) or _too_light(c) for c in accents)
        )
        if invalid_accents:
            # Rank by saturation and then by distance from background brightness
            ranked = sorted(
                [c for c in colors if c not in backgrounds],
                key=lambda c: (
                    self._calculate_saturation(c),
                    abs(self._calculate_brightness(c) - (1.0 - self._calculate_brightness(primary_bg)))
                ),
                reverse=True
            )
            # Filter extremes and low-saturation neutrals
            filtered = [
                c for c in ranked
                if not _too_dark(c) and not _too_light(c) and self._calculate_saturation(c) >= 0.15
            ]
            # Ensure at least one accent; fallback to a warm highlight
            if not filtered and ranked:
                filtered = ranked[:2]
            accents = (filtered[:2] if filtered else ['#FFA400', '#2563EB'])
            # Final safety: ensure unique from backgrounds
            accents = [c for c in accents if c not in backgrounds][:2] or accents[:2]
            result['accents'] = accents
        
        # Add gradient suggestions only if user requested them
        if analysis.get('wants_gradients', False):
            result['gradients'] = self._create_gradient_suggestions(backgrounds, colors)
        else:
            result['gradients'] = []
        
        # Apply style preferences
        if analysis['prefers_dark']:
            result['style_hint'] = 'dark_mode'
        elif analysis['prefers_light']:
            result['style_hint'] = 'light_mode'
        
        return result
    
    def _detect_brand_request(self, text: str) -> Optional[Dict[str, Any]]:
        """Detect if this is a brand color request."""
        patterns = [
            # General brand patterns
            r'\b(?:colors?\s+of|like|similar\s+to|brand\s+colors?|official\s+colors?)\s+([\w\-\s\.]+?)\b',
            r'\b([\w\-\s\.]+)\s+(?:brand\s+)?colors?\b',
            r'\bmake\s+it\s+(?:look\s+)?like\s+([\w\-\s\.]+)\b',
            r'\b([\w\-]+\.[a-z]{2,}(?:\.[a-z]{2,})?)\b',
            # School-specific phrasing
            r'\bschool\s+colors?\s*(?:are|:)?\s*([\w\-\s\.]+?)\b',
            r'\bcolors?\s*(?:are|:)?\s*([\w\-\s]+?\s+(?:high\s+school|university|college))\b',
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text, re.IGNORECASE)
            if match:
                brand_name = match.group(1).strip()
                # Normalize common noise like plural 'schools' -> 'school'
                brand_name = re.sub(r"\bschools\b", "school", brand_name, flags=re.IGNORECASE)
                # Collapse whitespace
                brand_name = re.sub(r"\s+", " ", brand_name).strip()
                
                # Check if it's a URL
                url = None
                if re.search(r'\.[a-z]{2,}(?:\.[a-z]{2,})?\b', brand_name, re.IGNORECASE):
                    url = f"https://{brand_name}" if not brand_name.startswith('http') else brand_name
                    brand_name = brand_name.split('.')[0]
                
                return {
                    'is_brand_request': True,
                    'brand_name': brand_name,
                    'brand_url': url
                }
        
        return None
    
    def _extract_specific_colors(self, text: str) -> List[str]:
        """Extract specific color requests from text."""
        color_names = [
            'red', 'blue', 'green', 'yellow', 'orange', 'purple', 'pink',
            'black', 'white', 'gray', 'grey', 'brown', 'cyan', 'magenta',
            'teal', 'navy', 'coral', 'crimson', 'violet', 'indigo', 'lime',
            'gold', 'silver', 'bronze', 'emerald', 'ruby', 'sapphire',
            'turquoise', 'aqua', 'maroon', 'olive', 'beige', 'cream'
        ]
        
        found_colors = []
        for color in color_names:
            if re.search(rf'\b{color}\b', text, re.IGNORECASE):
                found_colors.append(color)
        
        # Also look for hex colors
        hex_colors = re.findall(r'#(?:[0-9a-fA-F]{3}){1,2}\b', text)
        found_colors.extend(hex_colors)
        
        return found_colors
    
    def _extract_theme_keywords(self, text: str) -> List[str]:
        """Extract theme-related keywords."""
        theme_words = [
            'modern', 'classic', 'minimal', 'bold', 'elegant', 'playful',
            'professional', 'creative', 'tech', 'corporate', 'startup',
            'vintage', 'retro', 'futuristic', 'organic', 'natural',
            'luxury', 'premium', 'casual', 'formal', 'artistic'
        ]
        
        found_themes = []
        for theme in theme_words:
            if theme in text:
                found_themes.append(theme)
        
        return found_themes
    
    def _extract_style_keywords(self, text: str) -> List[str]:
        """Extract style-related keywords."""
        style_words = [
            'vibrant', 'muted', 'bright', 'dark', 'light', 'pastel',
            'neon', 'metallic', 'gradient', 'flat', 'monochrome',
            'colorful', 'subtle', 'bold', 'soft', 'sharp'
        ]
        
        return [style for style in style_words if style in text]
    
    def _check_wants_pink(self, text: str) -> bool:
        """Check if user wants pink colors."""
        pink_words = ['pink', 'magenta', 'rose', 'fuchsia', 'blush']
        return any(word in text for word in pink_words)

    def _check_wants_gradients(self, text: str) -> bool:
        """Check if user specifically wants gradients."""
        gradient_words = ['gradient', 'gradients', 'fade', 'blend', 'ombre', 'transition']
        return any(word in text for word in gradient_words)
    
    def _check_prefers_dark(self, text: str) -> bool:
        """Check if user prefers dark theme.
        Broaden detection to include space-themed contexts where dark backgrounds are desirable.
        """
        dark_words = [
            'dark', 'night', 'midnight', 'black', 'shadow',
            # Space-themed contexts
            'outer space', 'space-themed', 'space theme', 'galaxy', 'cosmos', 'nebula',
            'astronomy', 'universe', 'night sky', 'stars', 'starry', 'deep space',
            'starlight', 'solar system'
        ]
        return any(word in text for word in dark_words)
    
    def _check_prefers_light(self, text: str) -> bool:
        """Check if user prefers light theme.
        Note: Do NOT treat 'bright' as a light-mode signal (bright visuals ≠ white background).
        """
        light_words = ['light', 'white', 'clean', 'airy', 'light mode', 'light theme']
        return any(word in text for word in light_words)
    
    def _colors_match(self, color_name: str, hex_color: str) -> bool:
        """Check if a color name matches a hex color."""
        # Simple heuristic based on hue ranges
        color_hue_ranges = {
            'red': (0, 30, 330, 360),
            'orange': (30, 60),
            'yellow': (60, 90),
            'green': (90, 150),
            'blue': (150, 270),
            'purple': (270, 330),
            'pink': (280, 340)
        }
        
        if color_name.lower() in color_hue_ranges:
            hue = self._get_color_hue(hex_color)
            ranges = color_hue_ranges[color_name.lower()]
            
            if len(ranges) == 2:
                return ranges[0] <= hue <= ranges[1]
            else:  # For red which wraps around
                return (ranges[0] <= hue <= ranges[1]) or (ranges[2] <= hue <= ranges[3])
        
        return False
    
    def _create_custom_palette(self, requested_colors: List[str]) -> Dict[str, Any]:
        """Create a custom palette based on requested colors."""
        # Map color names to hex values
        color_map = {
            'red': '#E53935',
            'blue': '#1E88E5',
            'green': '#43A047',
            'yellow': '#FDD835',
            'orange': '#FB8C00',
            'purple': '#8E24AA',
            'pink': '#E91E63',
            'black': '#212121',
            'white': '#FFFFFF',
            'gray': '#757575',
            'grey': '#757575',
            'teal': '#00897B',
            'navy': '#1A237E',
            'gold': '#FFD700',
            'silver': '#C0C0C0'
        }
        
        colors = []
        for req_color in requested_colors:
            if req_color.startswith('#'):
                colors.append(req_color.upper())
            elif req_color.lower() in color_map:
                colors.append(color_map[req_color.lower()])
        
        # Add complementary colors
        while len(colors) < 5:
            # Add variations of existing colors
            if colors:
                base_color = colors[0]
                colors.append(self._lighten_color(base_color, 0.3))
                colors.append(self._darken_color(base_color, 0.3))
        
        return {
            'colors': colors,
            'source': 'custom_palette',
            'requested_colors': requested_colors
        }
    
    def _select_best_palette(
        self,
        palettes: List[Dict[str, Any]],
        analysis: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Select the best palette from options based on analysis."""
        if not palettes:
            return {}
        
        # Score each palette
        scored = []
        for palette in palettes:
            score = 0
            
            # Prefer non-white backgrounds
            colors = palette.get('colors', [])
            non_white_count = sum(1 for c in colors if not self._is_near_white(c))
            score += non_white_count * 2
            
            # Match style keywords (guard against None)
            try:
                raw_name = palette.get('name')
            except Exception:
                raw_name = None
            name = str(raw_name or '').lower()
            for keyword in analysis.get('style_keywords', []):
                if keyword in name:
                    score += 3
            
            # Avoid pink if not wanted
            if not analysis['wants_pink'] and self._palette_has_pink(palette):
                score -= 10
            
            scored.append((score, palette))
        
        # Return highest scoring
        scored.sort(key=lambda x: x[0], reverse=True)
        return scored[0][1]
    
    def _format_color_result(
        self,
        source_data: Dict[str, Any],
        source_name: str
    ) -> Dict[str, Any]:
        """Format color data into standard result format."""
        colors = source_data.get('colors', [])
        
        # Extract or calculate backgrounds and accents
        backgrounds = source_data.get('backgrounds', [])
        accents = source_data.get('accents', [])
        
        if not backgrounds and colors:
            # Prefer light backgrounds by default (brightest first)
            sorted_by_brightness = sorted(colors, key=self._calculate_brightness, reverse=True)
            backgrounds = [c for c in sorted_by_brightness if not self._is_near_white(c)][:2] or sorted_by_brightness[:2]
        
        if not accents and colors:
            # Pick most saturated colors
            sorted_by_saturation = sorted(colors, key=self._calculate_saturation, reverse=True)
            accents = sorted_by_saturation[:2]
        
        return {
            'colors': colors,
            'backgrounds': backgrounds,
            'accents': accents,
            'source': source_name,
            'confidence': source_data.get('confidence', 0.8),
            'metadata': source_data
        }
    
    def _get_default_palette(self) -> Dict[str, Any]:
        """Get a default palette as last resort."""
        return {
            'colors': ['#0A0E27', '#1A1F3A', '#2563EB', '#7C3AED', '#F59E0B', '#10B981'],
            'backgrounds': ['#0A0E27', '#1A1F3A'],
            'accents': ['#2563EB', '#F59E0B'],
            'source': 'default',
            'confidence': 0.5
        }
    
    def _palette_has_pink(self, palette: Dict[str, Any]) -> bool:
        """Check if palette contains pink colors."""
        colors = palette.get('colors', [])
        filtered = filter_out_pink_colors(colors)
        return len(filtered) < len(colors)
    
    def _calculate_text_colors(
        self,
        background: str,
        palette_colors: List[str]
    ) -> Dict[str, str]:
        """Calculate appropriate text colors for given background using WCAG contrast ratios."""
        def _hex_to_rgb(hex_color: str) -> tuple:
            h = hex_color.lstrip('#')
            return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

        def _channel_to_linear(c: float) -> float:
            c = c / 255.0
            return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

        def _relative_luminance(hex_color: str) -> float:
            try:
                r, g, b = _hex_to_rgb(hex_color)
                R = _channel_to_linear(r)
                G = _channel_to_linear(g)
                B = _channel_to_linear(b)
                return 0.2126 * R + 0.7152 * G + 0.0722 * B
            except Exception:
                return 0.5

        def _contrast_ratio(c1: str, c2: str) -> float:
            L1 = _relative_luminance(c1)
            L2 = _relative_luminance(c2)
            lighter = max(L1, L2)
            darker = min(L1, L2)
            return (lighter + 0.05) / (darker + 0.05)

        # Choose between black and white for primary text by highest contrast
        cr_white = _contrast_ratio('#FFFFFF', background)
        cr_black = _contrast_ratio('#000000', background)
        primary_text = '#FFFFFF' if cr_white >= cr_black else '#1A1A1A'

        # Ensure minimum readable contrast (aim for WCAG AA 4.5:1)
        # If both are below 4.5, still choose the higher-contrast option (already done above)
        secondary_text = '#E0E0E0' if primary_text == '#FFFFFF' else '#424242'

        # Accent text: pick first palette color that meets 4.5:1; else fallback to primary text
        accent_text = None
        for color in palette_colors:
            try:
                if _contrast_ratio(color, background) >= 4.5:
                    accent_text = color
                    break
            except Exception:
                continue

        return {
            'primary': primary_text,
            'secondary': secondary_text,
            'accent': accent_text or primary_text
        }
    
    def _create_gradient_suggestions(
        self,
        backgrounds: List[str],
        colors: List[str]
    ) -> List[Dict[str, Any]]:
        """Create gradient suggestions using subtle variations of single colors only."""
        gradients = []
        
        # Background gradient - subtle variations of the primary background
        if backgrounds:
            primary_bg = backgrounds[0]
            gradients.append({
                'name': 'background_gradient',
                'type': 'radial',
                'position': 'top-right',
                'colors': [
                    self._lighten_color(primary_bg, 0.08),
                    self._lighten_color(primary_bg, 0.04),
                    primary_bg
                ]
            })
        
        # Accent gradient - subtle variations of a single accent color
        accents = sorted(colors, key=self._calculate_saturation, reverse=True)
        if accents:
            primary_accent = accents[0]
            gradients.append({
                'name': 'accent_gradient',
                'type': 'linear',
                'angle': 45,
                'colors': [
                    primary_accent,
                    self._darken_color(primary_accent, 0.05)
                ]
            })
        
        # Subtle gradient - very minimal variation for backgrounds
        if backgrounds:
            primary_bg = backgrounds[0]
            gradients.append({
                'name': 'subtle_gradient',
                'type': 'radial',
                'colors': [
                    self._lighten_color(primary_bg, 0.05),
                    primary_bg
                ]
            })
        
        return gradients
    
    def _is_near_white(self, color: str) -> bool:
        """Check if color is near white."""
        return self._calculate_brightness(color) > 0.95
    
    def _has_good_contrast(self, color1: str, color2: str) -> bool:
        """Check if two colors meet WCAG AA contrast (>= 4.5:1)."""
        try:
            def _hex_to_rgb(hex_color: str) -> tuple:
                h = hex_color.lstrip('#')
                return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

            def _channel_to_linear(c: float) -> float:
                c = c / 255.0
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

            def _relative_luminance(hex_color: str) -> float:
                r, g, b = _hex_to_rgb(hex_color)
                R = _channel_to_linear(r)
                G = _channel_to_linear(g)
                B = _channel_to_linear(b)
                return 0.2126 * R + 0.7152 * G + 0.0722 * B

            L1 = _relative_luminance(color1)
            L2 = _relative_luminance(color2)
            lighter = max(L1, L2)
            darker = min(L1, L2)
            ratio = (lighter + 0.05) / (darker + 0.05)
            return ratio >= 4.5
        except Exception:
            return abs(self._calculate_brightness(color1) - self._calculate_brightness(color2)) > 0.5
    
    def _calculate_brightness(self, hex_color: str) -> float:
        """Calculate perceived brightness."""
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            return 0.299 * r + 0.587 * g + 0.114 * b
        except Exception:
            return 0.5
    
    def _calculate_saturation(self, hex_color: str) -> float:
        """Calculate color saturation."""
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            
            max_val = max(r, g, b)
            min_val = min(r, g, b)
            
            if max_val == 0:
                return 0
            
            return (max_val - min_val) / max_val
        except Exception:
            return 0.5
    
    def _get_color_hue(self, hex_color: str) -> int:
        """Get color hue in degrees."""
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16) / 255.0
            g = int(h[2:4], 16) / 255.0
            b = int(h[4:6], 16) / 255.0
            
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
    
    def _lighten_color(self, hex_color: str, factor: float) -> str:
        """Lighten a color by factor."""
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            
            r = int(r + (255 - r) * factor)
            g = int(g + (255 - g) * factor)
            b = int(b + (255 - b) * factor)
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return hex_color
    
    def _darken_color(self, hex_color: str, factor: float) -> str:
        """Darken a color by factor."""
        try:
            h = hex_color.lstrip('#')
            r = int(h[0:2], 16)
            g = int(h[2:4], 16)
            b = int(h[4:6], 16)
            
            r = int(r * (1 - factor))
            g = int(g * (1 - factor))
            b = int(b * (1 - factor))
            
            return f"#{r:02X}{g:02X}{b:02X}"
        except Exception:
            return hex_color
    
    def _extract_style_colors(self, style_preferences: Optional[Dict[str, Any]]) -> List[str]:
        """Extract color requests from style preferences."""
        if not style_preferences:
            return []
        
        colors = []
        
        # Check vibeContext for colors (guard against None)
        try:
            vibe_raw = style_preferences.get('vibeContext') if isinstance(style_preferences, dict) else None
            vibe = (vibe_raw or '').lower()
        except Exception:
            vibe = ''
        if vibe:
            colors.extend(self._extract_specific_colors(vibe))
        
        # Check any color-related fields
        for key, value in (style_preferences.items() if isinstance(style_preferences, dict) else []):
            if isinstance(value, str):
                # Look for color keywords in any style field
                try:
                    key_lower = key.lower()
                except Exception:
                    key_lower = str(key).lower()
                if any(color_word in key_lower for color_word in ['color', 'theme', 'palette']):
                    try:
                        val_lower = value.lower()
                    except Exception:
                        val_lower = str(value).lower()
                    colors.extend(self._extract_specific_colors(val_lower))
        
        return list(set(colors))  # Remove duplicates
    
    async def _get_colors_for_style(self, style_colors: List[str]) -> Dict[str, Any]:
        """Get colors based on style preference colors."""
        # Similar to _get_specific_colors but with different source
        results = search_palette_by_keywords(style_colors, limit=10)
        
        best_match = None
        best_score = 0
        
        for palette in results:
            colors = palette.get('colors', [])
            score = sum(1 for req_color in style_colors 
                       if any(self._colors_match(req_color, pal_color) for pal_color in colors))
            
            if score > best_score:
                best_score = score
                best_match = palette
        
        if best_match:
            result = self._format_color_result(best_match, "style preference")
            result['requested_colors'] = style_colors
            return result
        
        return self._create_custom_palette(style_colors)
    
    def _apply_color_priority(
        self, 
        color_sources: Dict[str, Dict[str, Any]], 
        request_analysis: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """Apply priority logic to select the best color source.
        
        Priority order:
        1. Explicit user color requests in prompt (highest)
        2. Style preference colors
        3. Brand colors (if brand mentioned)
        4. Theme-based colors
        5. Topic-based colors (lowest)
        """
        
        # Priority 1: Explicit colors in prompt
        if 'specific' in color_sources:
            result = color_sources['specific']
            # If we also have brand colors, mention it in metadata
            if 'brand' in color_sources:
                result['metadata'] = result.get('metadata', {})
                result['metadata']['overrode_brand'] = request_analysis['brand_name']
                result['source'] = f"user colors (overriding {request_analysis['brand_name']} brand)"
            return result
        
        # Priority 2: Style preference colors
        if 'style' in color_sources:
            result = color_sources['style']
            # If we also have brand colors, mention it
            if 'brand' in color_sources:
                result['metadata'] = result.get('metadata', {})
                result['metadata']['overrode_brand'] = request_analysis['brand_name']
                result['source'] = f"style colors (overriding {request_analysis['brand_name']} brand)"
            return result
        
        # Priority 3: Brand colors
        if 'brand' in color_sources:
            return color_sources['brand']
        
        # Priority 4: Theme colors
        if 'theme' in color_sources:
            return color_sources['theme']
        
        # No valid source found
        return None
