#!/usr/bin/env python3
"""
Semantic Color Analyzer - Analyzes the actual semantic roles of colors on websites
(background, text, accent, highlight) based on CSS usage patterns.
"""

import re
from typing import Dict, List, Optional, Tuple
from bs4 import BeautifulSoup
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SemanticColorAnalyzer:
    """Analyzes semantic color roles based on actual CSS usage."""
    
    def __init__(self):
        # CSS patterns that indicate semantic roles
        self.role_patterns = {
            'background': [
                'background-color', 'background:', 'background-image',
                'bg-', 'body', 'page', 'container', 'wrapper'
            ],
            'text': [
                'color:', 'text-color', 'font-color',
                'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span', 'text-'
            ],
            'accent': [
                'accent-color', 'highlight', 'primary', 'brand',
                'button', 'link', 'cta', 'call-to-action'
            ],
            'border': [
                'border-color', 'border:', 'outline-color', 'outline:'
            ],
            'interactive': [
                'hover', 'focus', 'active', 'visited',
                'button', 'input', 'select', 'textarea'
            ]
        }
    
    async def analyze_color_semantics(self, html_content: str, base_url: str) -> Dict[str, Any]:
        """
        Analyze the semantic roles of colors on a webpage.
        
        Args:
            html_content: HTML content of the page
            base_url: Base URL for resolving relative URLs
            
        Returns:
            Dictionary with color roles and their semantic meanings
        """
        
        try:
            soup = BeautifulSoup(html_content, 'html.parser')
            
            # Extract color usage from different sources
            css_colors = self._extract_colors_from_css(soup)
            inline_colors = self._extract_colors_from_inline_styles(soup)
            computed_colors = self._analyze_element_colors(soup)
            
            # Combine and analyze semantic roles
            color_roles = self._categorize_color_roles(css_colors, inline_colors, computed_colors)
            
            # Analyze color frequency and prominence
            color_prominence = self._analyze_color_prominence(soup)
            
            # Create final semantic mapping
            result = {
                'backgrounds': color_roles.get('background', []),
                'text_colors': color_roles.get('text', []),
                'accents': color_roles.get('accent', []),
                'interactive': color_roles.get('interactive', []),
                'borders': color_roles.get('border', []),
                'color_prominence': color_prominence,
                'dominant_background': self._find_dominant_background(soup),
                'primary_text_color': self._find_primary_text_color(soup)
            }
            
            print(f"   🎨 Semantic analysis:")
            print(f"      Backgrounds: {result['backgrounds'][:3]}")
            print(f"      Text colors: {result['text_colors'][:3]}")
            print(f"      Accents: {result['accents'][:3]}")
            print(f"      Dominant BG: {result['dominant_background']}")
            
            return result
            
        except Exception as e:
            logger.error(f"Semantic color analysis failed: {e}")
            return {
                'backgrounds': [],
                'text_colors': [],
                'accents': [],
                'interactive': [],
                'borders': [],
                'color_prominence': {},
                'dominant_background': None,
                'primary_text_color': None
            }
    
    def _extract_colors_from_css(self, soup: BeautifulSoup) -> Dict[str, List[Tuple[str, str]]]:
        """Extract colors from CSS with their context."""
        css_colors = {
            'background': [],
            'text': [],
            'accent': [],
            'border': [],
            'interactive': []
        }
        
        # Find all style tags
        for style_tag in soup.find_all('style'):
            css_content = style_tag.get_text()
            
            # Extract CSS rules with colors
            css_rules = re.findall(r'([^{]+)\s*\{([^}]+)\}', css_content)
            
            for selector, properties in css_rules:
                colors = re.findall(r'#([0-9A-Fa-f]{6})', properties)
                
                for color in colors:
                    color_hex = f'#{color.upper()}'
                    role = self._determine_color_role(selector.lower(), properties.lower())
                    if role:
                        css_colors[role].append((color_hex, selector.strip()))
        
        return css_colors
    
    def _extract_colors_from_inline_styles(self, soup: BeautifulSoup) -> Dict[str, List[Tuple[str, str]]]:
        """Extract colors from inline styles."""
        inline_colors = {
            'background': [],
            'text': [],
            'accent': [],
            'border': [],
            'interactive': []
        }
        
        # Find all elements with style attributes
        for element in soup.find_all(attrs={'style': True}):
            style = element.get('style', '')
            colors = re.findall(r'#([0-9A-Fa-f]{6})', style)
            
            for color in colors:
                color_hex = f'#{color.upper()}'
                role = self._determine_color_role(element.name or '', style.lower())
                if role:
                    inline_colors[role].append((color_hex, element.name or 'unknown'))
        
        return inline_colors
    
    def _analyze_element_colors(self, soup: BeautifulSoup) -> Dict[str, List[str]]:
        """Analyze colors based on element types and classes."""
        element_colors = {
            'background': [],
            'text': [],
            'accent': [],
            'border': [],
            'interactive': []
        }
        
        # Analyze body background
        body = soup.find('body')
        if body and body.get('style'):
            bg_colors = re.findall(r'background-color:\s*#([0-9A-Fa-f]{6})', body.get('style', ''))
            for color in bg_colors:
                element_colors['background'].append(f'#{color.upper()}')
        
        # Analyze common semantic elements
        semantic_elements = {
            'background': ['body', 'main', 'section', 'div.container', 'div.wrapper'],
            'text': ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'span'],
            'accent': ['button', 'a.button', '.cta', '.highlight'],
            'interactive': ['a', 'button', 'input', '.link']
        }
        
        for role, selectors in semantic_elements.items():
            for selector in selectors:
                elements = soup.select(selector)
                for element in elements[:5]:  # Limit to first 5 of each type
                    if element.get('style'):
                        colors = re.findall(r'#([0-9A-Fa-f]{6})', element.get('style', ''))
                        for color in colors:
                            element_colors[role].append(f'#{color.upper()}')
        
        return element_colors
    
    def _determine_color_role(self, selector: str, properties: str) -> Optional[str]:
        """Determine the semantic role of a color based on CSS context."""
        
        # Check background patterns
        if any(pattern in properties for pattern in ['background-color', 'background:']):
            return 'background'
        if any(pattern in selector for pattern in ['body', 'page', 'container', 'wrapper', 'bg-']):
            return 'background'
        
        # Check text patterns
        if any(pattern in properties for pattern in ['color:', 'text-color']):
            return 'text'
        if any(pattern in selector for pattern in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'p', 'text']):
            return 'text'
        
        # Check accent/brand patterns
        if any(pattern in selector for pattern in ['primary', 'brand', 'accent', 'highlight']):
            return 'accent'
        if any(pattern in selector for pattern in ['button', 'cta', 'call-to-action']):
            return 'accent'
        
        # Check interactive patterns
        if any(pattern in properties for pattern in ['hover', 'focus', 'active']):
            return 'interactive'
        if any(pattern in selector for pattern in ['hover', 'focus', 'active', 'visited']):
            return 'interactive'
        
        # Check border patterns
        if any(pattern in properties for pattern in ['border-color', 'border:', 'outline']):
            return 'border'
        
        return None
    
    def _categorize_color_roles(self, css_colors: Dict, inline_colors: Dict, computed_colors: Dict) -> Dict[str, List[str]]:
        """Combine and deduplicate colors by role."""
        
        combined_roles = {}
        
        for role in ['background', 'text', 'accent', 'border', 'interactive']:
            colors = set()
            
            # Add colors from CSS
            for color, _ in css_colors.get(role, []):
                colors.add(color)
            
            # Add colors from inline styles
            for color, _ in inline_colors.get(role, []):
                colors.add(color)
            
            # Add colors from computed analysis
            for color in computed_colors.get(role, []):
                colors.add(color)
            
            combined_roles[role] = list(colors)
        
        return combined_roles
    
    def _analyze_color_prominence(self, soup: BeautifulSoup) -> Dict[str, int]:
        """Analyze how prominent each color is on the page."""
        color_count = {}
        
        # Count color occurrences in styles
        all_text = str(soup)
        hex_colors = re.findall(r'#([0-9A-Fa-f]{6})', all_text)
        
        for color in hex_colors:
            color_hex = f'#{color.upper()}'
            color_count[color_hex] = color_count.get(color_hex, 0) + 1
        
        return color_count
    
    def _find_dominant_background(self, soup: BeautifulSoup) -> Optional[str]:
        """Find the most likely dominant background color."""
        
        # Check body background first
        body = soup.find('body')
        if body and body.get('style'):
            bg_match = re.search(r'background-color:\s*#([0-9A-Fa-f]{6})', body.get('style', ''))
            if bg_match:
                return f'#{bg_match.group(1).upper()}'
        
        # Look for CSS body background
        for style_tag in soup.find_all('style'):
            css_content = style_tag.get_text()
            body_bg_match = re.search(r'body\s*\{[^}]*background-color:\s*#([0-9A-Fa-f]{6})', css_content)
            if body_bg_match:
                return f'#{body_bg_match.group(1).upper()}'
        
        return None
    
    def _find_primary_text_color(self, soup: BeautifulSoup) -> Optional[str]:
        """Find the primary text color."""
        
        # Look for body text color
        body = soup.find('body')
        if body and body.get('style'):
            color_match = re.search(r'color:\s*#([0-9A-Fa-f]{6})', body.get('style', ''))
            if color_match:
                return f'#{color_match.group(1).upper()}'
        
        # Look for CSS body color
        for style_tag in soup.find_all('style'):
            css_content = style_tag.get_text')
            body_color_match = re.search(r'body\s*\{[^}]*color:\s*#([0-9A-Fa-f]{6})', css_content)
            if body_color_match:
                return f'#{body_color_match.group(1).upper()}'
        
        return None