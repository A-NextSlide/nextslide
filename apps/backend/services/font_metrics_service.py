"""
Font Metrics Service for accurate text sizing in slide generation.
Provides text measurement and optimal font size calculation.
"""

from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
from enum import Enum
import math
from PIL import Image, ImageDraw, ImageFont
import os
from functools import lru_cache
import logging

logger = logging.getLogger(__name__)

# Try to import dynamic font analyzer
try:
    from services.dynamic_font_analyzer import dynamic_font_analyzer
    DYNAMIC_ANALYSIS_AVAILABLE = True
except ImportError:
    DYNAMIC_ANALYSIS_AVAILABLE = False
    logger.debug("Dynamic font analyzer not available")

# Try to import font registry
try:
    from services.font_registry_service import font_registry
    FONT_REGISTRY_AVAILABLE = True
except ImportError:
    FONT_REGISTRY_AVAILABLE = False
    logger.debug("Font registry not available")


class TextAlignment(Enum):
    LEFT = "left"
    CENTER = "center"
    RIGHT = "right"


class FitStrategy(Enum):
    SHRINK_TO_FIT = "shrink-to-fit"
    TRUNCATE = "truncate"
    WRAP = "wrap"
    SCALE_UNIFORM = "scale-uniform"


@dataclass
class FontMetrics:
    """Stores pre-calculated metrics for a font family."""
    family: str
    x_height_ratio: float  # Ratio of x-height to font size
    cap_height_ratio: float  # Ratio of cap height to font size
    avg_char_width_ratio: float  # Average character width relative to font size
    line_height_ratio: float  # Optimal line height relative to font size
    space_width_ratio: float  # Width of space character relative to font size

    # Character width multipliers for common characters (relative to avg)
    char_width_factors: Dict[str, float] = None

    def __post_init__(self):
        if self.char_width_factors is None:
            # Default character width factors
            self.char_width_factors = {
                'i': 0.4, 'l': 0.4, 'I': 0.4, '1': 0.6,
                'w': 1.3, 'W': 1.5, 'M': 1.5, 'm': 1.3,
                ' ': self.space_width_ratio / self.avg_char_width_ratio
            }


@dataclass
class TextBox:
    """Represents a text container with dimensions."""
    width: float
    height: float
    padding_x: float = 0
    padding_y: float = 0

    @property
    def content_width(self) -> float:
        return self.width - (2 * self.padding_x)

    @property
    def content_height(self) -> float:
        return self.height - (2 * self.padding_y)


@dataclass
class TextMeasurement:
    """Result of measuring text with specific font settings."""
    text: str
    font_size: float
    font_family: str
    width: float
    height: float
    line_count: int
    fits: bool
    suggested_size: Optional[float] = None


class FontMetricsService:
    """Service for measuring text and calculating optimal font sizes."""

    # Pre-defined font metrics for common fonts
    FONT_METRICS_DB = {
        "Inter": FontMetrics(
            family="Inter",
            x_height_ratio=0.52,
            cap_height_ratio=0.73,
            avg_char_width_ratio=0.55,
            line_height_ratio=1.5,
            space_width_ratio=0.25
        ),
        "Helvetica": FontMetrics(
            family="Helvetica",
            x_height_ratio=0.52,
            cap_height_ratio=0.72,
            avg_char_width_ratio=0.56,
            line_height_ratio=1.45,
            space_width_ratio=0.28
        ),
        "Arial": FontMetrics(
            family="Arial",
            x_height_ratio=0.52,
            cap_height_ratio=0.72,
            avg_char_width_ratio=0.56,
            line_height_ratio=1.45,
            space_width_ratio=0.28
        ),
        "Roboto": FontMetrics(
            family="Roboto",
            x_height_ratio=0.52,
            cap_height_ratio=0.71,
            avg_char_width_ratio=0.54,
            line_height_ratio=1.5,
            space_width_ratio=0.25
        ),
        "Open Sans": FontMetrics(
            family="Open Sans",
            x_height_ratio=0.54,
            cap_height_ratio=0.72,
            avg_char_width_ratio=0.55,
            line_height_ratio=1.5,
            space_width_ratio=0.26
        ),
        "Montserrat": FontMetrics(
            family="Montserrat",
            x_height_ratio=0.52,
            cap_height_ratio=0.70,
            avg_char_width_ratio=0.58,
            line_height_ratio=1.5,
            space_width_ratio=0.27
        ),
        "Poppins": FontMetrics(
            family="Poppins",
            x_height_ratio=0.55,
            cap_height_ratio=0.72,
            avg_char_width_ratio=0.57,
            line_height_ratio=1.5,
            space_width_ratio=0.26
        ),
        "Playfair Display": FontMetrics(
            family="Playfair Display",
            x_height_ratio=0.47,
            cap_height_ratio=0.69,
            avg_char_width_ratio=0.52,
            line_height_ratio=1.4,
            space_width_ratio=0.22
        ),
        "Lato": FontMetrics(
            family="Lato",
            x_height_ratio=0.51,
            cap_height_ratio=0.73,
            avg_char_width_ratio=0.54,
            line_height_ratio=1.5,
            space_width_ratio=0.24
        ),
        "Source Sans Pro": FontMetrics(
            family="Source Sans Pro",
            x_height_ratio=0.49,
            cap_height_ratio=0.66,
            avg_char_width_ratio=0.53,
            line_height_ratio=1.5,
            space_width_ratio=0.25
        )
    }

    def __init__(self):
        self._font_cache = {}
        self._measurement_cache = {}

    def get_font_metrics(self, font_family: str) -> FontMetrics:
        """Get font metrics for a given font family."""
        # Normalize font family name
        normalized = font_family.replace("-", " ").title()

        # Check if we have pre-calculated metrics
        if normalized in self.FONT_METRICS_DB:
            return self.FONT_METRICS_DB[normalized]

        # Try dynamic analysis if available
        if DYNAMIC_ANALYSIS_AVAILABLE:
            try:
                logger.debug(f"Dynamically analyzing font: {font_family}")
                dynamic_metrics = dynamic_font_analyzer.analyze_font(font_family)

                # Convert dynamic metrics to our FontMetrics format
                font_metrics = FontMetrics(
                    family=font_family,
                    x_height_ratio=dynamic_metrics.x_height_ratio,
                    cap_height_ratio=dynamic_metrics.cap_height_ratio,
                    avg_char_width_ratio=dynamic_metrics.avg_char_width_ratio,
                    line_height_ratio=dynamic_metrics.line_height_ratio,
                    space_width_ratio=dynamic_metrics.space_width_ratio
                )

                # Cache it for future use
                self.FONT_METRICS_DB[normalized] = font_metrics
                return font_metrics

            except Exception as e:
                logger.warning(f"Dynamic analysis failed for {font_family}: {e}")

        # Last resort: Use intelligent fallback based on font classification
        return self._get_fallback_metrics(font_family)

    def _get_fallback_metrics(self, font_family: str) -> FontMetrics:
        """Get fallback metrics based on font classification."""
        family_lower = font_family.lower()

        # Use font registry to find similar fonts if available
        if FONT_REGISTRY_AVAILABLE:
            # Check if font is registered
            font_info = font_registry.get_font_info(font_family)
            if font_info:
                # Try to use the registered fallback
                if font_info.fallback and font_info.fallback in self.FONT_METRICS_DB:
                    logger.info(f"Using registered fallback {font_info.fallback} for {font_family}")
                    return self.FONT_METRICS_DB[font_info.fallback]

                # Use category-based metrics
                if font_info.category:
                    return self._get_category_metrics(font_family, font_info.category)

            # Get suggestions for similar fonts
            suggestions = font_registry.suggest_similar_fonts(font_family, 3)
            for suggestion in suggestions:
                if suggestion in self.FONT_METRICS_DB:
                    logger.info(f"Using similar font {suggestion} for {font_family}")
                    return self.FONT_METRICS_DB[suggestion]

        # Check for similar fonts in our database
        for known_font, metrics in self.FONT_METRICS_DB.items():
            if known_font.lower() in family_lower or family_lower in known_font.lower():
                logger.info(f"Using similar font {known_font} for {font_family}")
                return metrics

        # Classify and return appropriate defaults
        if any(serif in family_lower for serif in ['serif', 'times', 'georgia', 'book']):
            return self._get_category_metrics(font_family, "serif")
        elif any(mono in family_lower for mono in ['mono', 'code', 'courier', 'consolas']):
            return self._get_category_metrics(font_family, "monospace")
        elif any(display in family_lower for display in ['display', 'headline', 'script']):
            return self._get_category_metrics(font_family, "display")
        else:
            # Default to Inter (sans-serif) as the safest fallback
            logger.warning(f"Font metrics not found for {font_family}, using Inter as default")
            return self.FONT_METRICS_DB["Inter"]

    def _get_category_metrics(self, font_family: str, category: str) -> FontMetrics:
        """Get metrics based on font category."""
        category_metrics = {
            "serif": FontMetrics(
                family=font_family,
                x_height_ratio=0.45,
                cap_height_ratio=0.69,
                avg_char_width_ratio=0.52,
                line_height_ratio=1.4,
                space_width_ratio=0.22
            ),
            "monospace": FontMetrics(
                family=font_family,
                x_height_ratio=0.52,
                cap_height_ratio=0.70,
                avg_char_width_ratio=0.60,
                line_height_ratio=1.5,
                space_width_ratio=0.60
            ),
            "display": FontMetrics(
                family=font_family,
                x_height_ratio=0.55,
                cap_height_ratio=0.75,
                avg_char_width_ratio=0.58,
                line_height_ratio=1.3,
                space_width_ratio=0.25
            ),
            "sans-serif": FontMetrics(
                family=font_family,
                x_height_ratio=0.52,
                cap_height_ratio=0.72,
                avg_char_width_ratio=0.55,
                line_height_ratio=1.5,
                space_width_ratio=0.26
            )
        }

        logger.info(f"Using {category} defaults for {font_family}")
        return category_metrics.get(category, self.FONT_METRICS_DB["Inter"])

    @lru_cache(maxsize=1000)
    def estimate_text_width(self, text: str, font_size: float, font_family: str) -> float:
        """
        Estimate text width using font metrics without rendering.
        Fast approximation suitable for initial sizing.
        """
        metrics = self.get_font_metrics(font_family)

        # Calculate base width
        char_count = len(text)
        avg_char_width = font_size * metrics.avg_char_width_ratio

        # Adjust for character composition
        width = 0
        for char in text:
            if char in metrics.char_width_factors:
                width += avg_char_width * metrics.char_width_factors[char]
            elif char.isupper():
                width += avg_char_width * 1.2
            else:
                width += avg_char_width

        return width

    def estimate_text_lines(self, text: str, font_size: float, font_family: str,
                          max_width: float) -> int:
        """Estimate number of lines text will occupy when wrapped."""
        metrics = self.get_font_metrics(font_family)
        words = text.split()

        if not words:
            return 0

        lines = 1
        current_line_width = 0
        space_width = font_size * metrics.space_width_ratio

        for word in words:
            word_width = self.estimate_text_width(word, font_size, font_family)

            if current_line_width == 0:
                # First word on line
                current_line_width = word_width
            elif current_line_width + space_width + word_width <= max_width:
                # Word fits on current line
                current_line_width += space_width + word_width
            else:
                # Need new line
                lines += 1
                current_line_width = word_width

        return lines

    def calculate_optimal_font_size(self,
                                  text: str,
                                  container: TextBox,
                                  font_family: str,
                                  min_size: float = 8,
                                  max_size: float = 72,
                                  max_lines: Optional[int] = None,
                                  target_fill: float = 0.9) -> float:
        """
        Calculate optimal font size using binary search.

        Args:
            text: Text to fit
            container: Container dimensions
            font_family: Font family name
            min_size: Minimum allowed font size
            max_size: Maximum allowed font size
            max_lines: Maximum number of lines allowed
            target_fill: Target percentage of container to fill (0.9 = 90%)

        Returns:
            Optimal font size
        """
        metrics = self.get_font_metrics(font_family)

        # Quick check for empty text
        if not text.strip():
            return min_size

        # Binary search for optimal size
        low, high = min_size, max_size
        optimal_size = min_size

        # Maximum 10 iterations for convergence
        for _ in range(10):
            if high - low < 0.5:
                break

            mid = (low + high) / 2

            # Estimate dimensions at this size
            text_width = self.estimate_text_width(text, mid, font_family)
            line_count = self.estimate_text_lines(text, mid, font_family, container.content_width)
            line_height = mid * metrics.line_height_ratio
            text_height = line_count * line_height

            # Check constraints - prioritize readability over perfect fill
            fits_width = text_width <= container.content_width or line_count > 1
            fits_height = text_height <= container.content_height
            fits_lines = max_lines is None or line_count <= max_lines

            if fits_width and fits_height and fits_lines:
                optimal_size = mid
                low = mid
            else:
                high = mid

        return round(optimal_size, 1)

    def calculate_size_with_strategy(self,
                                    text: str,
                                    container: TextBox,
                                    font_family: str,
                                    element_type: str,
                                    fit_strategy: FitStrategy = FitStrategy.SHRINK_TO_FIT) -> Dict[str, Any]:
        """
        Calculate font size with specific fitting strategy.

        Returns:
            Dictionary with fontSize, lineClamp, fitStrategy, and other metadata
        """
        # Define size constraints by element type
        SIZE_CONSTRAINTS = {
            "title": {"min": 24, "max": 48, "max_lines": 2, "target_fill": 0.85},
            "subtitle": {"min": 18, "max": 32, "max_lines": 2, "target_fill": 0.85},
            "heading": {"min": 20, "max": 36, "max_lines": 2, "target_fill": 0.85},
            "body": {"min": 14, "max": 20, "max_lines": None, "target_fill": 0.9},
            "caption": {"min": 10, "max": 14, "max_lines": 3, "target_fill": 0.9},
            "bullet": {"min": 14, "max": 18, "max_lines": 3, "target_fill": 0.9},
            "label": {"min": 10, "max": 16, "max_lines": 1, "target_fill": 0.85}
        }

        constraints = SIZE_CONSTRAINTS.get(element_type, {
            "min": 12, "max": 24, "max_lines": None, "target_fill": 0.9
        })

        # Calculate optimal size
        optimal_size = self.calculate_optimal_font_size(
            text=text,
            container=container,
            font_family=font_family,
            min_size=constraints["min"],
            max_size=constraints["max"],
            max_lines=constraints["max_lines"],
            target_fill=constraints["target_fill"]
        )

        # Estimate final metrics
        metrics = self.get_font_metrics(font_family)
        line_count = self.estimate_text_lines(text, optimal_size, font_family, container.content_width)

        return {
            "fontSize": optimal_size,
            "fontSizeMin": constraints["min"],
            "fontSizeMax": constraints["max"],
            "lineClamp": constraints["max_lines"],
            "estimatedLines": line_count,
            "fitStrategy": fit_strategy.value,
            "lineHeight": metrics.line_height_ratio,
            "letterSpacing": 0 if element_type != "title" else 0.5
        }

    def measure_text_with_pil(self, text: str, font_size: float, font_family: str,
                             max_width: Optional[float] = None) -> TextMeasurement:
        """
        Accurate text measurement using PIL for validation.
        This is slower but more accurate than estimation.
        """
        try:
            # Try to load system font
            font_path = self._get_font_path(font_family)
            if font_path and os.path.exists(font_path):
                font = ImageFont.truetype(font_path, int(font_size))
            else:
                # Fallback to default
                font = ImageFont.load_default()
        except Exception as e:
            logger.warning(f"Could not load font {font_family}: {e}")
            font = ImageFont.load_default()

        # Create temporary image for measurement
        img = Image.new('RGB', (1, 1))
        draw = ImageDraw.Draw(img)

        # Get text bounding box
        bbox = draw.textbbox((0, 0), text, font=font)
        text_width = bbox[2] - bbox[0]
        text_height = bbox[3] - bbox[1]

        # Calculate lines if max_width provided
        line_count = 1
        if max_width and text_width > max_width:
            # Simple line wrapping estimation
            line_count = math.ceil(text_width / max_width)
            text_height = text_height * line_count
            text_width = min(text_width, max_width)

        return TextMeasurement(
            text=text,
            font_size=font_size,
            font_family=font_family,
            width=text_width,
            height=text_height,
            line_count=line_count,
            fits=True
        )

    def _get_font_path(self, font_family: str) -> Optional[str]:
        """Get system font path for a font family."""
        # This is platform-specific and simplified
        # In production, use a proper font resolver
        font_paths = {
            "Inter": "/System/Library/Fonts/Helvetica.ttc",  # Fallback
            "Helvetica": "/System/Library/Fonts/Helvetica.ttc",
            "Arial": "/System/Library/Fonts/Helvetica.ttc",
            # Add more mappings as needed
        }
        return font_paths.get(font_family)

    def get_template_sizing_rules(self, template_type: str) -> Dict[str, Dict[str, Any]]:
        """
        Get pre-defined sizing rules for common slide templates.
        These are battle-tested combinations that work well.
        """
        TEMPLATE_RULES = {
            "title_slide": {
                "title": {"base_size": 48, "weight": 700, "max_chars": 50},
                "subtitle": {"base_size": 24, "weight": 400, "max_chars": 100}
            },
            "content_slide": {
                "heading": {"base_size": 32, "weight": 600, "max_chars": 60},
                "body": {"base_size": 18, "weight": 400, "max_chars": 300},
                "bullet": {"base_size": 16, "weight": 400, "max_chars": 80}
            },
            "comparison_slide": {
                "heading": {"base_size": 28, "weight": 600, "max_chars": 50},
                "column_header": {"base_size": 20, "weight": 500, "max_chars": 30},
                "column_text": {"base_size": 14, "weight": 400, "max_chars": 150}
            },
            "data_slide": {
                "heading": {"base_size": 28, "weight": 600, "max_chars": 50},
                "metric_value": {"base_size": 36, "weight": 700, "max_chars": 10},
                "metric_label": {"base_size": 14, "weight": 400, "max_chars": 30},
                "caption": {"base_size": 12, "weight": 400, "max_chars": 100}
            },
            "image_slide": {
                "heading": {"base_size": 32, "weight": 600, "max_chars": 50},
                "caption": {"base_size": 14, "weight": 400, "max_chars": 150}
            }
        }

        return TEMPLATE_RULES.get(template_type, TEMPLATE_RULES["content_slide"])


# Singleton instance
font_metrics_service = FontMetricsService()