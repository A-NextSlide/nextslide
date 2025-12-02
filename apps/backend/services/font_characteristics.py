"""
Font Characteristics Database for Intelligent Font Substitution

This module provides detailed characteristics for fonts to enable smart substitution
when a brand's fonts aren't available in our registry.

Font characteristics are based on:
- Style category (geometric, humanist, grotesque, neo-grotesque, slab, etc.)
- Personality traits (professional, playful, elegant, modern, classic, etc.)
- Use cases (headlines, body, display, technical, etc.)
- Visual weight perception (light, medium, heavy)
- x-height and readability characteristics
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
from enum import Enum


class FontStyle(Enum):
    """Primary font style classification."""
    GEOMETRIC = "geometric"           # Based on geometric shapes (circles, squares)
    HUMANIST = "humanist"             # Based on handwriting, organic
    GROTESQUE = "grotesque"           # Early sans-serifs, some quirks
    NEO_GROTESQUE = "neo_grotesque"   # Clean, neutral (Helvetica-like)
    SLAB_SERIF = "slab_serif"         # Bold serifs, strong presence
    TRANSITIONAL = "transitional"     # Between old-style and modern serifs
    MODERN_SERIF = "modern_serif"     # High contrast, thin serifs
    OLD_STYLE = "old_style"           # Classic, traditional serifs
    DISPLAY = "display"               # Decorative, attention-grabbing
    SCRIPT = "script"                 # Handwriting/calligraphy based
    MONOSPACE = "monospace"           # Fixed-width, technical


class FontPersonality(Enum):
    """Personality traits a font conveys."""
    PROFESSIONAL = "professional"
    CORPORATE = "corporate"
    MODERN = "modern"
    CLASSIC = "classic"
    ELEGANT = "elegant"
    FRIENDLY = "friendly"
    PLAYFUL = "playful"
    TECHNICAL = "technical"
    CREATIVE = "creative"
    NEUTRAL = "neutral"
    BOLD = "bold"
    SOPHISTICATED = "sophisticated"
    WARM = "warm"
    CLEAN = "clean"
    INDUSTRIAL = "industrial"
    ACADEMIC = "academic"


class FontUseCase(Enum):
    """Primary use cases for fonts."""
    HEADLINES = "headlines"
    BODY = "body"
    DISPLAY = "display"
    UI = "ui"
    TECHNICAL = "technical"
    BRANDING = "branding"


@dataclass
class FontCharacteristics:
    """Detailed characteristics of a font."""
    name: str
    style: FontStyle
    personalities: List[FontPersonality]
    use_cases: List[FontUseCase]
    similar_to: List[str]  # Fonts this is similar to (for substitution)
    weight_range: Tuple[int, int]  # e.g., (100, 900)
    x_height: str  # "low", "medium", "high"
    contrast: str  # "low", "medium", "high" (stroke contrast)
    description: str


# Comprehensive font characteristics database
# This maps font names to their characteristics for intelligent substitution
FONT_CHARACTERISTICS: Dict[str, FontCharacteristics] = {
    # ══════════════════════════════════════════════════════════════════════════
    # GEOMETRIC SANS-SERIFS (Clean, modern, based on geometric shapes)
    # ══════════════════════════════════════════════════════════════════════════

    "Inter": FontCharacteristics(
        name="Inter",
        style=FontStyle.NEO_GROTESQUE,
        personalities=[FontPersonality.MODERN, FontPersonality.CLEAN, FontPersonality.PROFESSIONAL, FontPersonality.NEUTRAL],
        use_cases=[FontUseCase.UI, FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Roboto", "SF Pro", "Helvetica Neue", "DIN", "Source Sans Pro"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Highly legible UI font, great for interfaces and body text"
    ),

    "Roboto": FontCharacteristics(
        name="Roboto",
        style=FontStyle.NEO_GROTESQUE,
        personalities=[FontPersonality.MODERN, FontPersonality.CLEAN, FontPersonality.NEUTRAL, FontPersonality.FRIENDLY],
        use_cases=[FontUseCase.UI, FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Inter", "Open Sans", "Source Sans Pro", "DIN", "Helvetica Neue"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Google's signature font, versatile and highly readable"
    ),

    "Poppins": FontCharacteristics(
        name="Poppins",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.MODERN, FontPersonality.FRIENDLY, FontPersonality.CLEAN],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.BODY, FontUseCase.BRANDING],
        similar_to=["Montserrat", "Nunito", "Quicksand", "Futura"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Geometric with friendly curves, modern and approachable"
    ),

    "Montserrat": FontCharacteristics(
        name="Montserrat",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.MODERN, FontPersonality.BOLD, FontPersonality.PROFESSIONAL],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.BRANDING, FontUseCase.DISPLAY],
        similar_to=["Poppins", "Raleway", "Gotham", "Futura", "DIN"],
        weight_range=(100, 900),
        x_height="medium",
        contrast="low",
        description="Bold geometric sans, excellent for headlines and branding"
    ),

    "Source Sans Pro": FontCharacteristics(
        name="Source Sans Pro",
        style=FontStyle.HUMANIST,
        personalities=[FontPersonality.PROFESSIONAL, FontPersonality.CLEAN, FontPersonality.NEUTRAL, FontPersonality.CORPORATE],
        use_cases=[FontUseCase.BODY, FontUseCase.UI, FontUseCase.TECHNICAL],
        similar_to=["Open Sans", "Roboto", "Inter", "DIN", "Fira Sans"],
        weight_range=(200, 900),
        x_height="high",
        contrast="low",
        description="Adobe's open source workhorse, professional and readable"
    ),

    "Open Sans": FontCharacteristics(
        name="Open Sans",
        style=FontStyle.HUMANIST,
        personalities=[FontPersonality.FRIENDLY, FontPersonality.CLEAN, FontPersonality.NEUTRAL, FontPersonality.WARM],
        use_cases=[FontUseCase.BODY, FontUseCase.UI, FontUseCase.HEADLINES],
        similar_to=["Source Sans Pro", "Roboto", "Lato", "Nunito"],
        weight_range=(300, 800),
        x_height="high",
        contrast="low",
        description="Friendly and highly legible, one of the most popular web fonts"
    ),

    "Lato": FontCharacteristics(
        name="Lato",
        style=FontStyle.HUMANIST,
        personalities=[FontPersonality.WARM, FontPersonality.PROFESSIONAL, FontPersonality.FRIENDLY],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES, FontUseCase.BRANDING],
        similar_to=["Open Sans", "Nunito", "Source Sans Pro", "Raleway"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Warm and stable, semi-rounded details give it personality"
    ),

    "Nunito": FontCharacteristics(
        name="Nunito",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.FRIENDLY, FontPersonality.WARM, FontPersonality.PLAYFUL],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES, FontUseCase.UI],
        similar_to=["Nunito Sans", "Poppins", "Quicksand", "Varela Round"],
        weight_range=(200, 900),
        x_height="high",
        contrast="low",
        description="Rounded terminals give a soft, friendly appearance"
    ),

    "Raleway": FontCharacteristics(
        name="Raleway",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.ELEGANT, FontPersonality.MODERN, FontPersonality.SOPHISTICATED],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY, FontUseCase.BRANDING],
        similar_to=["Montserrat", "Josefin Sans", "Quicksand", "Century Gothic"],
        weight_range=(100, 900),
        x_height="medium",
        contrast="low",
        description="Elegant geometric with distinctive 'W', great for fashion/luxury"
    ),

    "Quicksand": FontCharacteristics(
        name="Quicksand",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.FRIENDLY, FontPersonality.PLAYFUL, FontPersonality.MODERN],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY, FontUseCase.BRANDING],
        similar_to=["Nunito", "Varela Round", "Comfortaa", "Poppins"],
        weight_range=(300, 700),
        x_height="high",
        contrast="low",
        description="Rounded geometric, soft and approachable"
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # INDUSTRIAL / TECHNICAL SANS-SERIFS (DIN-like, German precision)
    # ══════════════════════════════════════════════════════════════════════════

    "DIN Alternate": FontCharacteristics(
        name="DIN Alternate",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.INDUSTRIAL, FontPersonality.TECHNICAL, FontPersonality.MODERN, FontPersonality.PROFESSIONAL],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.TECHNICAL, FontUseCase.BRANDING],
        similar_to=["Inter", "Roboto", "Source Sans Pro", "Barlow", "IBM Plex Sans"],
        weight_range=(300, 700),
        x_height="high",
        contrast="low",
        description="German industrial standard, clean and precise"
    ),

    "Barlow": FontCharacteristics(
        name="Barlow",
        style=FontStyle.NEO_GROTESQUE,
        personalities=[FontPersonality.INDUSTRIAL, FontPersonality.MODERN, FontPersonality.CLEAN],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.BODY, FontUseCase.TECHNICAL],
        similar_to=["DIN", "Interstate", "Roboto Condensed", "Oswald"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Slightly condensed, inspired by California highway signs"
    ),

    "IBM Plex Sans": FontCharacteristics(
        name="IBM Plex Sans",
        style=FontStyle.NEO_GROTESQUE,
        personalities=[FontPersonality.TECHNICAL, FontPersonality.PROFESSIONAL, FontPersonality.CORPORATE, FontPersonality.MODERN],
        use_cases=[FontUseCase.BODY, FontUseCase.UI, FontUseCase.TECHNICAL, FontUseCase.HEADLINES],
        similar_to=["Inter", "Roboto", "Source Sans Pro", "DIN", "Fira Sans"],
        weight_range=(100, 700),
        x_height="high",
        contrast="low",
        description="IBM's corporate typeface, technical yet approachable"
    ),

    "Fira Sans": FontCharacteristics(
        name="Fira Sans",
        style=FontStyle.HUMANIST,
        personalities=[FontPersonality.TECHNICAL, FontPersonality.MODERN, FontPersonality.PROFESSIONAL],
        use_cases=[FontUseCase.UI, FontUseCase.BODY, FontUseCase.TECHNICAL],
        similar_to=["Source Sans Pro", "IBM Plex Sans", "Roboto", "Open Sans"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Mozilla's UI font, designed for legibility on screens"
    ),

    "Work Sans": FontCharacteristics(
        name="Work Sans",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.MODERN, FontPersonality.PROFESSIONAL, FontPersonality.CLEAN],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.BODY, FontUseCase.UI],
        similar_to=["Inter", "Roboto", "Source Sans Pro", "DIN"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Optimized for on-screen text, clean and functional"
    ),

    "Exo 2": FontCharacteristics(
        name="Exo 2",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.TECHNICAL, FontPersonality.MODERN, FontPersonality.BOLD],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY, FontUseCase.TECHNICAL],
        similar_to=["Orbitron", "Rajdhani", "Barlow", "Michroma"],
        weight_range=(100, 900),
        x_height="high",
        contrast="low",
        description="Futuristic geometric, great for tech/sci-fi themes"
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # SERIF FONTS (Professional, academic, traditional)
    # ══════════════════════════════════════════════════════════════════════════

    "Merriweather": FontCharacteristics(
        name="Merriweather",
        style=FontStyle.TRANSITIONAL,
        personalities=[FontPersonality.PROFESSIONAL, FontPersonality.ACADEMIC, FontPersonality.CLASSIC, FontPersonality.WARM],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Georgia", "PT Serif", "Libre Baskerville", "Lora"],
        weight_range=(300, 900),
        x_height="high",
        contrast="medium",
        description="Designed for screen readability, warm and traditional"
    ),

    "Playfair Display": FontCharacteristics(
        name="Playfair Display",
        style=FontStyle.MODERN_SERIF,
        personalities=[FontPersonality.ELEGANT, FontPersonality.SOPHISTICATED, FontPersonality.CLASSIC],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY, FontUseCase.BRANDING],
        similar_to=["Cormorant Garamond", "Libre Baskerville", "Bodoni", "Didot"],
        weight_range=(400, 900),
        x_height="medium",
        contrast="high",
        description="High contrast transitional, elegant editorial style"
    ),

    "Lora": FontCharacteristics(
        name="Lora",
        style=FontStyle.TRANSITIONAL,
        personalities=[FontPersonality.ELEGANT, FontPersonality.WARM, FontPersonality.PROFESSIONAL],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Merriweather", "PT Serif", "Libre Baskerville"],
        weight_range=(400, 700),
        x_height="high",
        contrast="medium",
        description="Well-balanced contemporary serif, great for body text"
    ),

    "PT Serif": FontCharacteristics(
        name="PT Serif",
        style=FontStyle.TRANSITIONAL,
        personalities=[FontPersonality.PROFESSIONAL, FontPersonality.CLASSIC, FontPersonality.NEUTRAL],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Georgia", "Merriweather", "Lora", "Libre Baskerville"],
        weight_range=(400, 700),
        x_height="high",
        contrast="medium",
        description="Universal serif for both print and screen"
    ),

    "Libre Baskerville": FontCharacteristics(
        name="Libre Baskerville",
        style=FontStyle.TRANSITIONAL,
        personalities=[FontPersonality.CLASSIC, FontPersonality.PROFESSIONAL, FontPersonality.ACADEMIC],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES],
        similar_to=["Baskerville", "Merriweather", "PT Serif", "Lora"],
        weight_range=(400, 700),
        x_height="high",
        contrast="medium",
        description="Based on American Type Founders' Baskerville, classic elegance"
    ),

    "Cormorant Garamond": FontCharacteristics(
        name="Cormorant Garamond",
        style=FontStyle.OLD_STYLE,
        personalities=[FontPersonality.ELEGANT, FontPersonality.SOPHISTICATED, FontPersonality.CLASSIC],
        use_cases=[FontUseCase.DISPLAY, FontUseCase.HEADLINES, FontUseCase.BRANDING],
        similar_to=["EB Garamond", "Playfair Display", "Crimson Text"],
        weight_range=(300, 700),
        x_height="low",
        contrast="high",
        description="Elegant Garamond with display characteristics"
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # DISPLAY / BOLD FONTS (Headlines, attention-grabbing)
    # ══════════════════════════════════════════════════════════════════════════

    "Oswald": FontCharacteristics(
        name="Oswald",
        style=FontStyle.NEO_GROTESQUE,
        personalities=[FontPersonality.BOLD, FontPersonality.MODERN, FontPersonality.PROFESSIONAL],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY],
        similar_to=["Roboto Condensed", "Barlow Condensed", "Anton", "Bebas Neue"],
        weight_range=(200, 700),
        x_height="high",
        contrast="low",
        description="Condensed gothic, strong presence for headlines"
    ),

    "Anton": FontCharacteristics(
        name="Anton",
        style=FontStyle.GROTESQUE,
        personalities=[FontPersonality.BOLD, FontPersonality.MODERN, FontPersonality.INDUSTRIAL],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY],
        similar_to=["Bebas Neue", "Oswald", "Impact"],
        weight_range=(400, 400),
        x_height="high",
        contrast="low",
        description="Bold condensed display, high impact headlines"
    ),

    "Bebas Neue": FontCharacteristics(
        name="Bebas Neue",
        style=FontStyle.GROTESQUE,
        personalities=[FontPersonality.BOLD, FontPersonality.MODERN, FontPersonality.INDUSTRIAL],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY],
        similar_to=["Anton", "Oswald", "Impact", "League Gothic"],
        weight_range=(400, 400),
        x_height="high",
        contrast="low",
        description="All-caps display font, bold and impactful"
    ),

    # ══════════════════════════════════════════════════════════════════════════
    # PLAYFUL / CREATIVE FONTS (Use sparingly, only for actual fun content)
    # ══════════════════════════════════════════════════════════════════════════

    "Bangers": FontCharacteristics(
        name="Bangers",
        style=FontStyle.DISPLAY,
        personalities=[FontPersonality.PLAYFUL, FontPersonality.BOLD, FontPersonality.CREATIVE],
        use_cases=[FontUseCase.DISPLAY],
        similar_to=["Bungee", "Alfa Slab One", "Lilita One"],
        weight_range=(400, 400),
        x_height="high",
        contrast="low",
        description="Comic book style, ONLY for genuinely playful content like games, comics, kids"
    ),

    "Pacifico": FontCharacteristics(
        name="Pacifico",
        style=FontStyle.SCRIPT,
        personalities=[FontPersonality.PLAYFUL, FontPersonality.CREATIVE, FontPersonality.WARM],
        use_cases=[FontUseCase.DISPLAY, FontUseCase.BRANDING],
        similar_to=["Lobster", "Satisfy", "Dancing Script"],
        weight_range=(400, 400),
        x_height="medium",
        contrast="medium",
        description="Brush script, casual and fun - NOT for professional/academic"
    ),

    "Rubik": FontCharacteristics(
        name="Rubik",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.FRIENDLY, FontPersonality.MODERN, FontPersonality.CLEAN],
        use_cases=[FontUseCase.BODY, FontUseCase.HEADLINES, FontUseCase.UI],
        similar_to=["Nunito", "Poppins", "Varela Round"],
        weight_range=(300, 900),
        x_height="high",
        contrast="low",
        description="Rounded corners, friendly but still professional enough for most uses"
    ),

    "Comfortaa": FontCharacteristics(
        name="Comfortaa",
        style=FontStyle.GEOMETRIC,
        personalities=[FontPersonality.FRIENDLY, FontPersonality.PLAYFUL, FontPersonality.MODERN],
        use_cases=[FontUseCase.HEADLINES, FontUseCase.DISPLAY],
        similar_to=["Quicksand", "Varela Round", "Nunito"],
        weight_range=(300, 700),
        x_height="high",
        contrast="low",
        description="Rounded geometric, friendly and approachable"
    ),
}


# ══════════════════════════════════════════════════════════════════════════════
# COMMON BRAND FONTS → SUBSTITUTION MAPPING
# ══════════════════════════════════════════════════════════════════════════════

# Maps common brand fonts (that we don't have) to their best substitutes
BRAND_FONT_SUBSTITUTIONS: Dict[str, List[str]] = {
    # DIN family (German industrial standard, used by many brands)
    # Barlow is the BEST substitute - designed to match highway signage like DIN
    "din": ["Barlow", "Inter", "Roboto", "Source Sans Pro", "Work Sans", "IBM Plex Sans"],
    "din medium": ["Barlow", "Inter", "Roboto", "Source Sans Pro", "Work Sans"],
    "din bold": ["Barlow", "Inter", "Roboto", "Montserrat", "Work Sans"],
    "din alternate": ["Barlow", "Inter", "Roboto", "Source Sans Pro"],
    "din condensed": ["Barlow Condensed", "Roboto Condensed", "Oswald"],
    "din next": ["Barlow", "Inter", "Roboto", "Source Sans Pro"],
    "din pro": ["Barlow", "Inter", "Roboto", "Source Sans Pro"],

    # Helvetica family
    "helvetica": ["Inter", "Roboto", "Source Sans Pro", "Arial"],
    "helvetica neue": ["Inter", "Roboto", "Source Sans Pro"],
    "helvetica now": ["Inter", "Roboto"],

    # Futura (geometric)
    "futura": ["Poppins", "Montserrat", "Nunito", "Raleway"],
    "futura pt": ["Poppins", "Montserrat", "Nunito"],
    "futura bold": ["Montserrat", "Poppins"],

    # Avenir
    "avenir": ["Nunito", "Poppins", "Montserrat", "Lato"],
    "avenir next": ["Nunito", "Poppins", "Lato"],

    # Gotham (very popular brand font)
    "gotham": ["Montserrat", "Poppins", "Work Sans", "Inter"],
    "gotham bold": ["Montserrat", "Poppins"],
    "gotham book": ["Inter", "Roboto", "Source Sans Pro"],

    # Proxima Nova
    "proxima nova": ["Montserrat", "Poppins", "Inter", "Lato"],
    "proxima nova bold": ["Montserrat", "Poppins"],

    # Circular (Spotify, Airbnb)
    "circular": ["Inter", "Poppins", "Nunito"],
    "circular std": ["Inter", "Poppins"],

    # SF Pro (Apple)
    "sf pro": ["Inter", "Roboto", "Source Sans Pro"],
    "sf pro display": ["Inter", "Montserrat"],
    "sf pro text": ["Inter", "Roboto"],

    # Segoe (Microsoft)
    "segoe ui": ["Open Sans", "Roboto", "Source Sans Pro"],
    "segoe": ["Open Sans", "Roboto"],

    # Trade Gothic
    "trade gothic": ["Oswald", "Barlow", "Roboto Condensed"],
    "trade gothic next": ["Barlow", "Oswald"],

    # Akzidenz Grotesk
    "akzidenz grotesk": ["Inter", "Roboto", "Source Sans Pro"],
    "akzidenz": ["Inter", "Roboto"],

    # Univers
    "univers": ["Inter", "Roboto", "Source Sans Pro"],

    # Brandon Grotesque
    "brandon grotesque": ["Poppins", "Montserrat", "Nunito"],
    "brandon": ["Poppins", "Montserrat"],

    # Gill Sans
    "gill sans": ["Lato", "Open Sans", "Raleway"],

    # Myriad Pro (Adobe)
    "myriad pro": ["Source Sans Pro", "Open Sans", "Fira Sans"],
    "myriad": ["Source Sans Pro", "Open Sans"],

    # Gibson
    "gibson": ["Poppins", "Montserrat", "Work Sans"],

    # Graphik
    "graphik": ["Inter", "Roboto", "Source Sans Pro"],

    # Mark Pro
    "mark pro": ["Inter", "Roboto", "Poppins"],

    # Product Sans (Google)
    "product sans": ["Poppins", "Montserrat", "Inter"],
    "google sans": ["Poppins", "Montserrat", "Inter"],

    # Calibri
    "calibri": ["Open Sans", "Roboto", "Source Sans Pro"],

    # Arial
    "arial": ["Inter", "Roboto", "Open Sans"],

    # Verdana
    "verdana": ["Open Sans", "Roboto", "Source Sans Pro"],

    # Georgia (serif)
    "georgia": ["Merriweather", "PT Serif", "Lora"],

    # Times New Roman
    "times new roman": ["Merriweather", "Libre Baskerville", "PT Serif"],
    "times": ["Merriweather", "Libre Baskerville"],

    # Garamond
    "garamond": ["Cormorant Garamond", "EB Garamond", "Libre Baskerville"],
    "eb garamond": ["Cormorant Garamond", "Libre Baskerville"],

    # Bodoni
    "bodoni": ["Playfair Display", "Cormorant Garamond"],

    # Didot
    "didot": ["Playfair Display", "Cormorant Garamond"],
}


def get_font_substitute(brand_font: str, available_fonts: List[str]) -> Optional[str]:
    """
    Get the best substitute for a brand font that we don't have.

    Args:
        brand_font: The font name from the brand (e.g., "DIN Medium")
        available_fonts: List of fonts available in our registry

    Returns:
        Best matching substitute font, or None if no good match
    """
    brand_font_lower = brand_font.lower().strip()
    available_lower = {f.lower(): f for f in available_fonts}

    # First, check exact match (maybe we do have it)
    if brand_font_lower in available_lower:
        return available_lower[brand_font_lower]

    # Check our substitution mapping
    for key, substitutes in BRAND_FONT_SUBSTITUTIONS.items():
        if key in brand_font_lower or brand_font_lower in key:
            for sub in substitutes:
                if sub.lower() in available_lower:
                    return available_lower[sub.lower()]

    # If no direct mapping, try to match by characteristics
    # Extract base font name (e.g., "DIN Medium" → "DIN")
    base_name = brand_font_lower.split()[0] if ' ' in brand_font_lower else brand_font_lower

    for key, substitutes in BRAND_FONT_SUBSTITUTIONS.items():
        if base_name in key or key.startswith(base_name):
            for sub in substitutes:
                if sub.lower() in available_lower:
                    return available_lower[sub.lower()]

    return None


def get_font_characteristics(font_name: str) -> Optional[FontCharacteristics]:
    """Get characteristics for a font if we have them."""
    return FONT_CHARACTERISTICS.get(font_name)


def find_similar_fonts(font_name: str, available_fonts: List[str], count: int = 3) -> List[str]:
    """
    Find fonts similar to the given font from available fonts.

    Args:
        font_name: The font to find similar fonts for
        available_fonts: List of available fonts
        count: Maximum number of similar fonts to return

    Returns:
        List of similar font names
    """
    chars = FONT_CHARACTERISTICS.get(font_name)
    if not chars:
        return []

    available_set = {f.lower() for f in available_fonts}
    similar = []

    # First, check the explicitly defined similar fonts
    for sim in chars.similar_to:
        if sim.lower() in available_set:
            similar.append(sim)
            if len(similar) >= count:
                return similar

    # If we need more, find by matching characteristics
    for name, other_chars in FONT_CHARACTERISTICS.items():
        if name == font_name or name.lower() not in available_set:
            continue
        if name in similar:
            continue

        # Score similarity
        score = 0
        if other_chars.style == chars.style:
            score += 3

        common_personalities = set(chars.personalities) & set(other_chars.personalities)
        score += len(common_personalities)

        common_use_cases = set(chars.use_cases) & set(other_chars.use_cases)
        score += len(common_use_cases)

        if score >= 3:  # Reasonably similar
            similar.append(name)
            if len(similar) >= count:
                return similar

    return similar


def is_playful_font(font_name: str) -> bool:
    """Check if a font is considered playful/fun."""
    chars = FONT_CHARACTERISTICS.get(font_name)
    if not chars:
        return False
    return FontPersonality.PLAYFUL in chars.personalities


def is_professional_font(font_name: str) -> bool:
    """Check if a font is suitable for professional/corporate use."""
    chars = FONT_CHARACTERISTICS.get(font_name)
    if not chars:
        return True  # Assume professional if unknown

    playful_only = (
        FontPersonality.PLAYFUL in chars.personalities and
        FontPersonality.PROFESSIONAL not in chars.personalities and
        FontPersonality.CORPORATE not in chars.personalities and
        FontPersonality.ACADEMIC not in chars.personalities
    )
    return not playful_only


def get_professional_substitute(font_name: str, available_fonts: List[str]) -> str:
    """
    Get a professional substitute for any font.
    Used when the detected font is inappropriate for the context.

    Args:
        font_name: Original font name
        available_fonts: List of available fonts

    Returns:
        A professional font from available fonts
    """
    # Safe professional defaults in order of preference
    professional_fonts = [
        "Inter", "Roboto", "Source Sans Pro", "Open Sans", "Lato",
        "Montserrat", "Poppins", "Work Sans", "IBM Plex Sans"
    ]

    available_lower = {f.lower(): f for f in available_fonts}

    for font in professional_fonts:
        if font.lower() in available_lower:
            return available_lower[font.lower()]

    # Absolute fallback
    return "Inter" if "Inter" in available_fonts else available_fonts[0] if available_fonts else "Roboto"
