"""Theme-specific tools for color selection and brand research."""

from .brand_color_tools import BrandColorSearcher
from .web_color_scraper import WebColorScraper
from .smart_color_selector import SmartColorSelector
from .image_color_extractor import ImageColorExtractor, extract_logo_colors
from .palette_tools import (
    search_palette_by_topic,
    search_palette_by_keywords,
    get_random_palette,
    filter_out_pink_colors,
    build_simple_gradients
)

__all__ = [
    "BrandColorSearcher",
    "WebColorScraper",
    "SmartColorSelector",
    "ImageColorExtractor",
    "extract_logo_colors",
    "search_palette_by_topic",
    "search_palette_by_keywords",
    "get_random_palette",
    "filter_out_pink_colors",
    "build_simple_gradients"
]