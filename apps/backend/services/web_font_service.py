"""
Web Font Service - Checks if fonts are available online and provides loading URLs.

This service knows which fonts are available on:
- Google Fonts (free, most popular)
- Bunny Fonts (privacy-focused Google Fonts alternative)
- Adobe Fonts (requires subscription - we provide info only)
- Other CDNs

For brand fonts from Brandfetch, we check if they're available as web fonts
and return the proper CSS import/link URL.
"""

from typing import Dict, List, Optional, Tuple
from dataclasses import dataclass
import logging

logger = logging.getLogger(__name__)


@dataclass
class WebFontInfo:
    """Information about a web-available font."""
    name: str
    source: str  # "google", "bunny", "adobe", "cdnfonts", etc.
    css_url: str
    weights: List[str]
    is_free: bool
    notes: Optional[str] = None


# ══════════════════════════════════════════════════════════════════════════════
# GOOGLE FONTS - Complete list of available fonts (updated Dec 2024)
# These are all FREE and can be loaded via fonts.googleapis.com
# ══════════════════════════════════════════════════════════════════════════════

GOOGLE_FONTS: Dict[str, Dict] = {
    # Popular Sans-Serif
    "inter": {"name": "Inter", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "roboto": {"name": "Roboto", "weights": ["100", "300", "400", "500", "700", "900"]},
    "open sans": {"name": "Open Sans", "weights": ["300", "400", "500", "600", "700", "800"]},
    "lato": {"name": "Lato", "weights": ["100", "300", "400", "700", "900"]},
    "montserrat": {"name": "Montserrat", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "poppins": {"name": "Poppins", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "source sans pro": {"name": "Source Sans Pro", "weights": ["200", "300", "400", "600", "700", "900"]},
    "source sans 3": {"name": "Source Sans 3", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "raleway": {"name": "Raleway", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "nunito": {"name": "Nunito", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "nunito sans": {"name": "Nunito Sans", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "work sans": {"name": "Work Sans", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "dm sans": {"name": "DM Sans", "weights": ["400", "500", "700"]},
    "plus jakarta sans": {"name": "Plus Jakarta Sans", "weights": ["200", "300", "400", "500", "600", "700", "800"]},
    "manrope": {"name": "Manrope", "weights": ["200", "300", "400", "500", "600", "700", "800"]},
    "outfit": {"name": "Outfit", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "space grotesk": {"name": "Space Grotesk", "weights": ["300", "400", "500", "600", "700"]},
    "quicksand": {"name": "Quicksand", "weights": ["300", "400", "500", "600", "700"]},
    "ubuntu": {"name": "Ubuntu", "weights": ["300", "400", "500", "700"]},
    "rubik": {"name": "Rubik", "weights": ["300", "400", "500", "600", "700", "800", "900"]},
    "karla": {"name": "Karla", "weights": ["200", "300", "400", "500", "600", "700", "800"]},
    "josefin sans": {"name": "Josefin Sans", "weights": ["100", "200", "300", "400", "500", "600", "700"]},
    "cabin": {"name": "Cabin", "weights": ["400", "500", "600", "700"]},
    "asap": {"name": "Asap", "weights": ["400", "500", "600", "700"]},
    "varela round": {"name": "Varela Round", "weights": ["400"]},
    "comfortaa": {"name": "Comfortaa", "weights": ["300", "400", "500", "600", "700"]},
    "catamaran": {"name": "Catamaran", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "archivo": {"name": "Archivo", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "mulish": {"name": "Mulish", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "lexend": {"name": "Lexend", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "figtree": {"name": "Figtree", "weights": ["300", "400", "500", "600", "700", "800", "900"]},
    "sora": {"name": "Sora", "weights": ["100", "200", "300", "400", "500", "600", "700", "800"]},
    "red hat display": {"name": "Red Hat Display", "weights": ["300", "400", "500", "600", "700", "800", "900"]},
    "overpass": {"name": "Overpass", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},

    # DIN-like / Industrial
    "barlow": {"name": "Barlow", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "barlow condensed": {"name": "Barlow Condensed", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "barlow semi condensed": {"name": "Barlow Semi Condensed", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "ibm plex sans": {"name": "IBM Plex Sans", "weights": ["100", "200", "300", "400", "500", "600", "700"]},
    "ibm plex sans condensed": {"name": "IBM Plex Sans Condensed", "weights": ["100", "200", "300", "400", "500", "600", "700"]},
    "fira sans": {"name": "Fira Sans", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "fira sans condensed": {"name": "Fira Sans Condensed", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "pathway gothic one": {"name": "Pathway Gothic One", "weights": ["400"]},
    "fjalla one": {"name": "Fjalla One", "weights": ["400"]},

    # Condensed/Display Sans
    "oswald": {"name": "Oswald", "weights": ["200", "300", "400", "500", "600", "700"]},
    "roboto condensed": {"name": "Roboto Condensed", "weights": ["300", "400", "700"]},
    "anton": {"name": "Anton", "weights": ["400"]},
    "bebas neue": {"name": "Bebas Neue", "weights": ["400"]},
    "teko": {"name": "Teko", "weights": ["300", "400", "500", "600", "700"]},
    "kanit": {"name": "Kanit", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "exo 2": {"name": "Exo 2", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "titillium web": {"name": "Titillium Web", "weights": ["200", "300", "400", "600", "700", "900"]},
    "yanone kaffeesatz": {"name": "Yanone Kaffeesatz", "weights": ["200", "300", "400", "500", "600", "700"]},
    "russo one": {"name": "Russo One", "weights": ["400"]},
    "big shoulders display": {"name": "Big Shoulders Display", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},

    # Serif
    "playfair display": {"name": "Playfair Display", "weights": ["400", "500", "600", "700", "800", "900"]},
    "merriweather": {"name": "Merriweather", "weights": ["300", "400", "700", "900"]},
    "lora": {"name": "Lora", "weights": ["400", "500", "600", "700"]},
    "pt serif": {"name": "PT Serif", "weights": ["400", "700"]},
    "crimson text": {"name": "Crimson Text", "weights": ["400", "600", "700"]},
    "libre baskerville": {"name": "Libre Baskerville", "weights": ["400", "700"]},
    "cormorant garamond": {"name": "Cormorant Garamond", "weights": ["300", "400", "500", "600", "700"]},
    "eb garamond": {"name": "EB Garamond", "weights": ["400", "500", "600", "700", "800"]},
    "dm serif display": {"name": "DM Serif Display", "weights": ["400"]},
    "dm serif text": {"name": "DM Serif Text", "weights": ["400"]},
    "spectral": {"name": "Spectral", "weights": ["200", "300", "400", "500", "600", "700", "800"]},
    "source serif pro": {"name": "Source Serif Pro", "weights": ["200", "300", "400", "600", "700", "900"]},
    "source serif 4": {"name": "Source Serif 4", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "noto serif": {"name": "Noto Serif", "weights": ["400", "700"]},
    "bitter": {"name": "Bitter", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},
    "vollkorn": {"name": "Vollkorn", "weights": ["400", "500", "600", "700", "800", "900"]},
    "old standard tt": {"name": "Old Standard TT", "weights": ["400", "700"]},
    "libre caslon text": {"name": "Libre Caslon Text", "weights": ["400", "700"]},
    "cardo": {"name": "Cardo", "weights": ["400", "700"]},
    "fraunces": {"name": "Fraunces", "weights": ["100", "200", "300", "400", "500", "600", "700", "800", "900"]},

    # Display/Decorative
    "abril fatface": {"name": "Abril Fatface", "weights": ["400"]},
    "righteous": {"name": "Righteous", "weights": ["400"]},
    "fredoka one": {"name": "Fredoka One", "weights": ["400"]},
    "fredoka": {"name": "Fredoka", "weights": ["300", "400", "500", "600", "700"]},
    "bangers": {"name": "Bangers", "weights": ["400"]},
    "bungee": {"name": "Bungee", "weights": ["400"]},
    "pacifico": {"name": "Pacifico", "weights": ["400"]},
    "lobster": {"name": "Lobster", "weights": ["400"]},
    "lobster two": {"name": "Lobster Two", "weights": ["400", "700"]},
    "alfa slab one": {"name": "Alfa Slab One", "weights": ["400"]},
    "titan one": {"name": "Titan One", "weights": ["400"]},
    "passion one": {"name": "Passion One", "weights": ["400", "700", "900"]},
    "monoton": {"name": "Monoton", "weights": ["400"]},
    "graduate": {"name": "Graduate", "weights": ["400"]},
    "press start 2p": {"name": "Press Start 2P", "weights": ["400"]},
    "orbitron": {"name": "Orbitron", "weights": ["400", "500", "600", "700", "800", "900"]},
    "audiowide": {"name": "Audiowide", "weights": ["400"]},
    "black ops one": {"name": "Black Ops One", "weights": ["400"]},
    "creepster": {"name": "Creepster", "weights": ["400"]},
    "special elite": {"name": "Special Elite", "weights": ["400"]},
    "permanent marker": {"name": "Permanent Marker", "weights": ["400"]},
    "rock salt": {"name": "Rock Salt", "weights": ["400"]},
    "gloria hallelujah": {"name": "Gloria Hallelujah", "weights": ["400"]},
    "indie flower": {"name": "Indie Flower", "weights": ["400"]},
    "shadows into light": {"name": "Shadows Into Light", "weights": ["400"]},
    "amatic sc": {"name": "Amatic SC", "weights": ["400", "700"]},
    "concert one": {"name": "Concert One", "weights": ["400"]},
    "staatliches": {"name": "Staatliches", "weights": ["400"]},
    "share tech mono": {"name": "Share Tech Mono", "weights": ["400"]},
    "vt323": {"name": "VT323", "weights": ["400"]},
    "major mono display": {"name": "Major Mono Display", "weights": ["400"]},

    # Script/Handwriting
    "dancing script": {"name": "Dancing Script", "weights": ["400", "500", "600", "700"]},
    "great vibes": {"name": "Great Vibes", "weights": ["400"]},
    "satisfy": {"name": "Satisfy", "weights": ["400"]},
    "sacramento": {"name": "Sacramento", "weights": ["400"]},
    "cookie": {"name": "Cookie", "weights": ["400"]},
    "kaushan script": {"name": "Kaushan Script", "weights": ["400"]},
    "allura": {"name": "Allura", "weights": ["400"]},
    "alex brush": {"name": "Alex Brush", "weights": ["400"]},
    "tangerine": {"name": "Tangerine", "weights": ["400", "700"]},
    "pinyon script": {"name": "Pinyon Script", "weights": ["400"]},
    "mrs saint delafield": {"name": "Mrs Saint Delafield", "weights": ["400"]},
    "mr dafoe": {"name": "Mr Dafoe", "weights": ["400"]},

    # Monospace
    "roboto mono": {"name": "Roboto Mono", "weights": ["100", "200", "300", "400", "500", "600", "700"]},
    "source code pro": {"name": "Source Code Pro", "weights": ["200", "300", "400", "500", "600", "700", "900"]},
    "jetbrains mono": {"name": "JetBrains Mono", "weights": ["100", "200", "300", "400", "500", "600", "700", "800"]},
    "fira code": {"name": "Fira Code", "weights": ["300", "400", "500", "600", "700"]},
    "fira mono": {"name": "Fira Mono", "weights": ["400", "500", "700"]},
    "ibm plex mono": {"name": "IBM Plex Mono", "weights": ["100", "200", "300", "400", "500", "600", "700"]},
    "space mono": {"name": "Space Mono", "weights": ["400", "700"]},
    "inconsolata": {"name": "Inconsolata", "weights": ["200", "300", "400", "500", "600", "700", "800", "900"]},
    "ubuntu mono": {"name": "Ubuntu Mono", "weights": ["400", "700"]},
    "anonymous pro": {"name": "Anonymous Pro", "weights": ["400", "700"]},
    "cousine": {"name": "Cousine", "weights": ["400", "700"]},
    "dm mono": {"name": "DM Mono", "weights": ["300", "400", "500"]},
}


# ══════════════════════════════════════════════════════════════════════════════
# COMMERCIAL FONTS - Info only (not free, but commonly used by brands)
# ══════════════════════════════════════════════════════════════════════════════

COMMERCIAL_FONTS: Dict[str, Dict] = {
    # DIN Family
    "din": {"name": "DIN", "provider": "Various (Linotype, ParaType)", "substitute": "Barlow"},
    "din medium": {"name": "DIN Medium", "provider": "Various", "substitute": "Barlow"},
    "din bold": {"name": "DIN Bold", "provider": "Various", "substitute": "Barlow"},
    "din condensed": {"name": "DIN Condensed", "provider": "Various", "substitute": "Barlow Condensed"},
    "ff din": {"name": "FF DIN", "provider": "FontFont", "substitute": "Barlow"},
    "din next": {"name": "DIN Next", "provider": "Monotype", "substitute": "Barlow"},
    "din pro": {"name": "DIN Pro", "provider": "ParaType", "substitute": "Barlow"},

    # Helvetica Family
    "helvetica": {"name": "Helvetica", "provider": "Monotype/Linotype", "substitute": "Inter"},
    "helvetica neue": {"name": "Helvetica Neue", "provider": "Linotype", "substitute": "Inter"},
    "helvetica now": {"name": "Helvetica Now", "provider": "Monotype", "substitute": "Inter"},

    # Futura
    "futura": {"name": "Futura", "provider": "Various", "substitute": "Poppins"},
    "futura pt": {"name": "Futura PT", "provider": "ParaType", "substitute": "Poppins"},

    # Gotham
    "gotham": {"name": "Gotham", "provider": "Hoefler&Co", "substitute": "Montserrat"},
    "gotham bold": {"name": "Gotham Bold", "provider": "Hoefler&Co", "substitute": "Montserrat"},
    "gotham book": {"name": "Gotham Book", "provider": "Hoefler&Co", "substitute": "Inter"},

    # Proxima Nova
    "proxima nova": {"name": "Proxima Nova", "provider": "Mark Simonson", "substitute": "Montserrat"},

    # Avenir
    "avenir": {"name": "Avenir", "provider": "Linotype", "substitute": "Nunito"},
    "avenir next": {"name": "Avenir Next", "provider": "Linotype", "substitute": "Nunito"},

    # Circular
    "circular": {"name": "Circular", "provider": "Lineto", "substitute": "Inter"},
    "circular std": {"name": "Circular Std", "provider": "Lineto", "substitute": "Inter"},

    # SF Pro (Apple)
    "sf pro": {"name": "SF Pro", "provider": "Apple", "substitute": "Inter"},
    "sf pro display": {"name": "SF Pro Display", "provider": "Apple", "substitute": "Inter"},
    "sf pro text": {"name": "SF Pro Text", "provider": "Apple", "substitute": "Inter"},

    # Segoe (Microsoft)
    "segoe ui": {"name": "Segoe UI", "provider": "Microsoft", "substitute": "Open Sans"},

    # Trade Gothic
    "trade gothic": {"name": "Trade Gothic", "provider": "Linotype", "substitute": "Oswald"},
    "trade gothic next": {"name": "Trade Gothic Next", "provider": "Linotype", "substitute": "Barlow"},

    # Akzidenz Grotesk
    "akzidenz grotesk": {"name": "Akzidenz Grotesk", "provider": "Berthold", "substitute": "Inter"},

    # Brandon Grotesque
    "brandon grotesque": {"name": "Brandon Grotesque", "provider": "HVD Fonts", "substitute": "Poppins"},

    # Graphik
    "graphik": {"name": "Graphik", "provider": "Commercial Type", "substitute": "Inter"},

    # Product Sans (Google's brand font - not public)
    "product sans": {"name": "Product Sans", "provider": "Google (internal)", "substitute": "Poppins"},
    "google sans": {"name": "Google Sans", "provider": "Google (internal)", "substitute": "Poppins"},
}


def get_google_fonts_url(font_name: str, weights: Optional[List[str]] = None) -> str:
    """Generate Google Fonts CSS URL for a font."""
    # Default weights if not specified
    if not weights:
        weights = ["400", "500", "600", "700"]

    # Format: family=Font+Name:wght@400;500;600;700
    font_param = font_name.replace(' ', '+')
    weights_param = ';'.join(weights)

    return f"https://fonts.googleapis.com/css2?family={font_param}:wght@{weights_param}&display=swap"


def is_google_font(font_name: str) -> bool:
    """Check if a font is available on Google Fonts."""
    return font_name.lower().strip() in GOOGLE_FONTS


def get_web_font_info(font_name: str) -> Optional[WebFontInfo]:
    """
    Get web font loading information for a font.

    Returns WebFontInfo if the font is available online, None otherwise.
    """
    font_lower = font_name.lower().strip()

    # Check Google Fonts first (free)
    if font_lower in GOOGLE_FONTS:
        font_data = GOOGLE_FONTS[font_lower]
        return WebFontInfo(
            name=font_data["name"],
            source="google",
            css_url=get_google_fonts_url(font_data["name"], font_data["weights"]),
            weights=font_data["weights"],
            is_free=True
        )

    # Check if it's a commercial font (provide substitute info)
    if font_lower in COMMERCIAL_FONTS:
        font_data = COMMERCIAL_FONTS[font_lower]
        substitute = font_data.get("substitute", "Inter")

        # Return info about the substitute instead
        if substitute.lower() in GOOGLE_FONTS:
            sub_data = GOOGLE_FONTS[substitute.lower()]
            return WebFontInfo(
                name=sub_data["name"],
                source="google",
                css_url=get_google_fonts_url(sub_data["name"], sub_data["weights"]),
                weights=sub_data["weights"],
                is_free=True,
                notes=f"Original font '{font_data['name']}' is commercial ({font_data['provider']}). Using free substitute."
            )

    return None


def get_font_css_link(font_name: str, fallback_font: str = "Inter") -> Tuple[str, str]:
    """
    Get the CSS link tag and actual font name to use.

    Args:
        font_name: The font name from Brandfetch or user request
        fallback_font: Font to use if the requested font isn't available

    Returns:
        Tuple of (css_link_tag, actual_font_name)
    """
    font_info = get_web_font_info(font_name)

    if font_info:
        css_link = f'<link href="{font_info.css_url}" rel="stylesheet">'
        return css_link, font_info.name

    # Fall back to the fallback font
    fallback_info = get_web_font_info(fallback_font)
    if fallback_info:
        css_link = f'<link href="{fallback_info.css_url}" rel="stylesheet">'
        return css_link, fallback_info.name

    # Ultimate fallback
    return f'<link href="{get_google_fonts_url("Inter")}" rel="stylesheet">', "Inter"


def get_brand_fonts_css(brand_fonts: List[str]) -> Tuple[str, str, str]:
    """
    Get CSS links and font names for brand fonts.

    Args:
        brand_fonts: List of font names from Brandfetch (e.g., ["DIN Medium", "DIN Bold"])

    Returns:
        Tuple of (css_links, hero_font_name, body_font_name)
    """
    hero_font = "Montserrat"  # Default
    body_font = "Inter"  # Default
    css_links = []

    fonts_processed = []

    for font in brand_fonts[:2]:  # Take first 2 fonts (hero and body)
        font_info = get_web_font_info(font)
        if font_info and font_info.name not in fonts_processed:
            css_links.append(f'<link href="{font_info.css_url}" rel="stylesheet">')
            fonts_processed.append(font_info.name)

            if font_info.notes:
                logger.info(f"[WEB FONTS] {font_info.notes}")

    # Assign hero and body fonts
    if len(fonts_processed) >= 1:
        hero_font = fonts_processed[0]
    if len(fonts_processed) >= 2:
        body_font = fonts_processed[1]
    elif len(fonts_processed) == 1:
        # Use a complementary body font
        body_font = "Inter" if hero_font != "Inter" else "Roboto"
        body_info = get_web_font_info(body_font)
        if body_info:
            css_links.append(f'<link href="{body_info.css_url}" rel="stylesheet">')

    # Ensure we have at least default fonts loaded
    if not css_links:
        css_links.append(f'<link href="{get_google_fonts_url("Montserrat")}" rel="stylesheet">')
        css_links.append(f'<link href="{get_google_fonts_url("Inter")}" rel="stylesheet">')

    return "\n".join(css_links), hero_font, body_font


# Quick lookup function for theme_director
def resolve_brand_font(font_name: str, available_fonts: List[str]) -> Tuple[str, Optional[str]]:
    """
    Resolve a brand font to either:
    1. The same font if it's a free web font (Google Fonts)
    2. A substitute from our registry if it's commercial

    Args:
        font_name: Font name from Brandfetch
        available_fonts: List of fonts in our registry

    Returns:
        Tuple of (resolved_font_name, css_url_if_web_font)
    """
    font_info = get_web_font_info(font_name)

    if font_info:
        # It's available as a web font!
        return font_info.name, font_info.css_url

    # Not available - fall back to registry
    from services.font_characteristics import get_font_substitute
    substitute = get_font_substitute(font_name, available_fonts)

    if substitute:
        sub_info = get_web_font_info(substitute)
        if sub_info:
            return substitute, sub_info.css_url
        return substitute, None

    return "Inter", get_google_fonts_url("Inter")
