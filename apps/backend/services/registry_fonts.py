"""
Service to extract available fonts from the component registry
"""

import json
import os
from typing import Dict, List, Optional
from models.registry import ComponentRegistry

class RegistryFonts:
    """Manages font availability from the component registry"""
    
    _cached_fonts: Optional[Dict[str, List[str]]] = None
    _all_fonts: Optional[List[str]] = None
    
    @classmethod
    def get_available_fonts(cls, registry: Optional[ComponentRegistry] = None) -> Dict[str, List[str]]:
        """Get all available fonts grouped by category from the registry or schema file"""
        
        # Don't use cache if we haven't loaded PixelBuddha fonts yet
        if cls._cached_fonts and "PixelBuddha" in cls._cached_fonts:
            return cls._cached_fonts
        
        # Try to get from registry first
        if registry:
            try:
                schemas = registry.get_json_schemas()
                if schemas and 'TiptapTextBlock' in schemas:
                    font_data = schemas['TiptapTextBlock']['schema']['properties']['fontFamily']
                    if 'metadata' in font_data and 'controlProps' in font_data['metadata']:
                        groups = font_data['metadata']['controlProps'].get('enumGroups', {}) or {}
                        # Merge Designer fallback group so these fonts are discoverable even if registry lacks them
                        groups = cls._merge_designer_fonts(groups)
                        cls._cached_fonts = groups
                        return groups
            except Exception:
                pass
        
        # Fallback to schema file
        schema_path = os.path.join(os.path.dirname(__file__), '..', 'schemas', 'typebox_schemas_latest.json')
        if os.path.exists(schema_path):
            try:
                with open(schema_path, 'r') as f:
                    schemas = json.load(f)
                    if 'TiptapTextBlock' in schemas:
                        font_data = schemas['TiptapTextBlock']['schema']['properties']['fontFamily']
                        if 'metadata' in font_data and 'controlProps' in font_data['metadata']:
                            groups = font_data['metadata']['controlProps'].get('enumGroups', {}) or {}
                            groups = cls._merge_designer_fonts(groups)
                            cls._cached_fonts = groups
                            return groups
            except Exception:
                pass
        
        # Return a basic set if nothing else works
        pixelbuddha_fonts = cls._load_pixelbuddha_fonts()
        fallback_groups = {
            "Sans-Serif": ["Inter", "Poppins", "Montserrat", "Roboto", "Open Sans"],
            "Serif": ["Playfair Display", "Merriweather", "Lora", "Source Serif Pro"],
            "Script": ["Caveat", "Dancing Script", "Pacifico"],
            "Bold": ["Bebas Neue", "Oswald", "Anton"],
            "Designer": [
                # Curated (Google)
                "Baloo 2", "Eudoxus Sans", "Gloock", "Prata", "Staatliches",
                # Local Designer Fonts (cleaned names)
                "AV Galveria — Display Serif Font", "Acrona Display Font", "Acure - Display Font", "Alerio Sans Serif",
                "Delamot", "ElMariachi", "Felicidade", "Floriena Ligatures Sans", "Glorida — Sans Serif Family",
                "HFPensional", "HKGroteskWide", "Hiluna — Clean Sans Serif", "Marine Elmoure Sans Serif", "Maxmillion",
                "Newaves", "PORTANIC REGULAR", "PORTANIC TEXTURE", "Pink Zebra Quirky Four-Font Family", "PlumpPixel",
                "Qitella Modern Stylist Font", "Silvercrush", "SouthernClan", "Timeless Tourist", "TjoekilKajoe",
                "Upside Down - Outline", "Upside Down - Regular", "Vintage Brunch Retro Font Duo", "Web-TT",
                "avalar elegant display", "binary groove groovy 1980s typeface", "boho melody groovy typeface",
                "canyon slab wild west typeface", "cosmic hippie groovy font", "double bubble 3d typeface",
                "earthbound organic typeface", "eleanora medieval blackletter font", "freestyle graffiti display",
                "graffitopia urban graffiti font", "gridiron glory sport typeface", "hexaplex geometric typeface",
                "hunos display bold font", "hyperion sleek modern sans", "kaivalya culture font",
                "lonehope western slab serif display font", "lovage lane", "lovage lane (1)",
                "nebula swirl retro modern font", "new kids crew graffiti tag font", "razor titan halloween typeface",
                "synthetika futuristic typeface", "the rascals youth font", "thoth legacy egyptian typeface",
                "tropicalismo tropical font", "upside down 1980s retro typeface"
            ]
        }
        
        # Add PixelBuddha fonts if available
        if pixelbuddha_fonts:
            fallback_groups["PixelBuddha"] = pixelbuddha_fonts
            
        return fallback_groups

    @classmethod
    def _load_pixelbuddha_fonts(cls) -> Optional[List[str]]:
        """Load PixelBuddha font names from the JSON file."""
        try:
            font_list_path = os.path.join(os.path.dirname(__file__), '..', 'assets', 'fonts', 'pixelbuddha', 'font_list_simple.json')
            if os.path.exists(font_list_path):
                with open(font_list_path, 'r') as f:
                    fonts_data = json.load(f)
                    # Extract clean font names
                    font_names = []
                    for font in fonts_data:
                        name = font.get('name', '')
                        # Clean up the name - remove description after em dash
                        if '—' in name:
                            name = name.split('—')[0].strip()
                        if name:
                            font_names.append(name)
                    return font_names[:100]  # Limit to first 100 for performance
        except Exception as e:
            pass
        return None
    
    @classmethod
    def _merge_designer_fonts(cls, groups: Dict[str, List[str]]) -> Dict[str, List[str]]:
        """Ensure 'Designer' group includes all curated fonts and merge 'Designer Local' if present. Also load PixelBuddha fonts."""
        fallback_designer = [
            "Baloo 2", "Eudoxus Sans", "Gloock", "Prata", "Staatliches",
            "AV Galveria — Display Serif Font", "Acrona Display Font", "Acure - Display Font", "Alerio Sans Serif",
            "Delamot", "ElMariachi", "Felicidade", "Floriena Ligatures Sans", "Glorida — Sans Serif Family",
            "HFPensional", "HKGroteskWide", "Hiluna — Clean Sans Serif", "Marine Elmoure Sans Serif", "Maxmillion",
            "Newaves", "PORTANIC REGULAR", "PORTANIC TEXTURE", "Pink Zebra Quirky Four-Font Family", "PlumpPixel",
            "Qitella Modern Stylist Font", "Silvercrush", "SouthernClan", "Timeless Tourist", "TjoekilKajoe",
            "Upside Down - Outline", "Upside Down - Regular", "Vintage Brunch Retro Font Duo", "Web-TT",
            "avalar elegant display", "binary groove groovy 1980s typeface", "boho melody groovy typeface",
            "canyon slab wild west typeface", "cosmic hippie groovy font", "double bubble 3d typeface",
            "earthbound organic typeface", "eleanora medieval blackletter font", "freestyle graffiti display",
            "graffitopia urban graffiti font", "gridiron glory sport typeface", "hexaplex geometric typeface",
            "hunos display bold font", "hyperion sleek modern sans", "kaivalya culture font",
            "lonehope western slab serif display font", "lovage lane", "lovage lane (1)",
            "nebula swirl retro modern font", "new kids crew graffiti tag font", "razor titan halloween typeface",
            "synthetika futuristic typeface", "the rascals youth font", "thoth legacy egyptian typeface",
            "tropicalismo tropical font", "upside down 1980s retro typeface"
        ]
        
        # Load PixelBuddha fonts if available
        pixelbuddha_fonts = cls._load_pixelbuddha_fonts()
        if pixelbuddha_fonts:
            groups["PixelBuddha"] = pixelbuddha_fonts
        
        existing_designer = set(groups.get("Designer", []) or [])
        existing_designer_local = set(groups.get("Designer Local", []) or [])
        merged = sorted(list(existing_designer.union(existing_designer_local).union(fallback_designer)))
        groups["Designer"] = merged
        return groups
    
    @classmethod
    def get_all_fonts_list(cls, registry: Optional[ComponentRegistry] = None) -> List[str]:
        """Get a flat list of all available fonts"""
        if cls._all_fonts:
            return cls._all_fonts
        
        font_groups = cls.get_available_fonts(registry)
        all_fonts = []
        for group_fonts in font_groups.values():
            all_fonts.extend(group_fonts)
        
        cls._all_fonts = sorted(list(set(all_fonts)))  # Remove duplicates and sort
        return cls._all_fonts
    
    @classmethod
    def get_fonts_by_style(cls, style: str, registry: Optional[ComponentRegistry] = None) -> List[str]:
        """Get fonts appropriate for a specific style"""
        font_groups = cls.get_available_fonts(registry)
        
        style_mapping = {
            "classic": ["Serif", "Elegant"],
            "modern": ["Sans-Serif", "Premium", "Contemporary", "Modern"],
            "bold": ["Bold", "Unique"],
            "elegant": ["Elegant", "Serif", "Premium"],
            "technical": ["Monospace", "Sans-Serif", "Contemporary"],
            "creative": ["Script", "Unique", "Modern", "Design"]
        }
        
        relevant_groups = style_mapping.get(style.lower(), ["Sans-Serif", "Premium"])
        fonts = []
        
        for group_name in relevant_groups:
            if group_name in font_groups:
                fonts.extend(font_groups[group_name])
        
        # Remove duplicates and return
        return list(set(fonts))[:10]  # Limit to 10 options
    
    @classmethod
    def get_font_recommendations(cls, deck_category: str, formality: str, typography_style: str, 
                                registry: Optional[ComponentRegistry] = None) -> Dict[str, List[str]]:
        """Get font recommendations based on deck analysis"""
        font_groups = cls.get_available_fonts(registry)
        
        recommendations = {
            "heading": [],
            "body": [],
            "accent": []
        }
        
        # Heading fonts based on style
        if typography_style == "bold":
            recommendations["heading"] = font_groups.get("Bold", [])[:5]
        elif typography_style == "elegant":
            recommendations["heading"] = font_groups.get("Elegant", [])[:3] + font_groups.get("Serif", [])[:2]
        elif typography_style == "technical":
            recommendations["heading"] = (font_groups.get("Sans-Serif", [])[:3] + 
                                         font_groups.get("Contemporary", [])[:2])
        elif typography_style == "creative":
            recommendations["heading"] = (font_groups.get("Modern", [])[:3] + 
                                         font_groups.get("Unique", [])[:2])
        else:  # modern/default
            recommendations["heading"] = font_groups.get("Premium", [])[:5]
        
        # Body fonts - generally more readable
        if formality in ["formal", "High Professional"]:
            recommendations["body"] = (font_groups.get("Sans-Serif", [])[:3] + 
                                     font_groups.get("Premium", [])[:2])
        else:
            recommendations["body"] = (font_groups.get("Sans-Serif", [])[:3] + 
                                     font_groups.get("Design", [])[:2])
        
        # Accent fonts for special emphasis
        if typography_style in ["creative", "bold"]:
            recommendations["accent"] = font_groups.get("Script", [])[:3]
        elif typography_style == "elegant":
            recommendations["accent"] = font_groups.get("Serif", [])[:3]
        elif typography_style == "technical":
            recommendations["accent"] = font_groups.get("Monospace", [])[:3]
        else:
            recommendations["accent"] = (font_groups.get("Elegant", [])[:2] + 
                                       font_groups.get("Script", [])[:1])
        
        # Ensure unique recommendations
        for key in recommendations:
            recommendations[key] = list(dict.fromkeys(recommendations[key]))[:5]
        
        return recommendations 