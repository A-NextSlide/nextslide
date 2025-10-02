"""
Text Measurement Engine using skia-python for accurate text metrics.
Provides server-side text rendering and measurement without a browser.
"""

from typing import Dict, List, Tuple, Optional, Any
from dataclasses import dataclass
import logging
from functools import lru_cache
import json

# Try to import skia-python for accurate text measurement
# If not available, fall back to PIL
try:
    import skia
    SKIA_AVAILABLE = True
except ImportError:
    SKIA_AVAILABLE = False
    logger = logging.getLogger(__name__)
    logger.warning("skia-python not available, using PIL fallback")

from services.font_metrics_service import (
    FontMetricsService,
    TextBox,
    TextMeasurement,
    FitStrategy
)


@dataclass
class MeasuredText:
    """Result of accurate text measurement."""
    text: str
    font_size: float
    font_family: str
    font_weight: int
    measured_width: float
    measured_height: float
    line_breaks: List[int]  # Character indices where lines break
    line_heights: List[float]
    ascent: float
    descent: float
    fits_container: bool


class TextMeasurementEngine:
    """
    High-accuracy text measurement engine for server-side rendering.
    Uses Skia for accurate metrics matching browser rendering.
    """

    def __init__(self):
        self.font_metrics_service = FontMetricsService()
        self._font_cache = {}
        self._typeface_cache = {}

        # Initialize Skia if available
        if SKIA_AVAILABLE:
            self._init_skia()

    def _init_skia(self):
        """Initialize Skia rendering context."""
        self.surface = skia.Surface(1920, 1080)  # Standard slide size
        self.canvas = self.surface.getCanvas()

    @lru_cache(maxsize=100)
    def _get_typeface(self, font_family: str, font_weight: int = 400) -> Any:
        """Get or create a Skia typeface for the font."""
        if not SKIA_AVAILABLE:
            return None

        # Map weight to Skia weight
        weight_map = {
            100: skia.FontStyle.Weight.kThin_Weight,
            200: skia.FontStyle.Weight.kExtraLight_Weight,
            300: skia.FontStyle.Weight.kLight_Weight,
            400: skia.FontStyle.Weight.kNormal_Weight,
            500: skia.FontStyle.Weight.kMedium_Weight,
            600: skia.FontStyle.Weight.kSemiBold_Weight,
            700: skia.FontStyle.Weight.kBold_Weight,
            800: skia.FontStyle.Weight.kExtraBold_Weight,
            900: skia.FontStyle.Weight.kBlack_Weight
        }

        skia_weight = weight_map.get(font_weight, skia.FontStyle.Weight.kNormal_Weight)
        font_style = skia.FontStyle(skia_weight, skia.FontStyle.Width.kNormal_Width,
                                    skia.FontStyle.Slant.kUpright_Slant)

        # Try to find the font
        typeface = skia.Typeface(font_family, font_style)
        if not typeface:
            # Fallback to default
            typeface = skia.Typeface('Arial', font_style)

        return typeface

    def measure_text_accurate(self,
                             text: str,
                             font_size: float,
                             font_family: str,
                             font_weight: int = 400,
                             max_width: Optional[float] = None,
                             line_height_multiplier: float = 1.5) -> MeasuredText:
        """
        Accurately measure text using Skia rendering engine.

        Args:
            text: Text to measure
            font_size: Font size in points
            font_family: Font family name
            font_weight: Font weight (100-900)
            max_width: Maximum width for line wrapping
            line_height_multiplier: Line height as multiple of font size

        Returns:
            MeasuredText with accurate measurements
        """
        if SKIA_AVAILABLE:
            return self._measure_with_skia(
                text, font_size, font_family, font_weight,
                max_width, line_height_multiplier
            )
        else:
            return self._measure_with_fallback(
                text, font_size, font_family, font_weight,
                max_width, line_height_multiplier
            )

    def _measure_with_skia(self,
                          text: str,
                          font_size: float,
                          font_family: str,
                          font_weight: int,
                          max_width: Optional[float],
                          line_height_multiplier: float) -> MeasuredText:
        """Measure text using Skia."""
        typeface = self._get_typeface(font_family, font_weight)
        font = skia.Font(typeface, font_size)
        paint = skia.Paint()

        # Get font metrics
        metrics = font.getMetrics()
        ascent = abs(metrics.fAscent)
        descent = metrics.fDescent
        line_height = (ascent + descent) * line_height_multiplier

        if max_width is None:
            # Single line measurement
            text_blob = skia.TextBlob(text, font)
            bounds = text_blob.bounds()

            return MeasuredText(
                text=text,
                font_size=font_size,
                font_family=font_family,
                font_weight=font_weight,
                measured_width=bounds.width(),
                measured_height=line_height,
                line_breaks=[],
                line_heights=[line_height],
                ascent=ascent,
                descent=descent,
                fits_container=True
            )
        else:
            # Multi-line with wrapping
            lines, line_breaks = self._wrap_text_skia(text, font, max_width)
            total_height = len(lines) * line_height
            max_line_width = max(font.measureText(line) for line in lines) if lines else 0

            return MeasuredText(
                text=text,
                font_size=font_size,
                font_family=font_family,
                font_weight=font_weight,
                measured_width=min(max_line_width, max_width),
                measured_height=total_height,
                line_breaks=line_breaks,
                line_heights=[line_height] * len(lines),
                ascent=ascent,
                descent=descent,
                fits_container=True
            )

    def _wrap_text_skia(self, text: str, font: Any, max_width: float) -> Tuple[List[str], List[int]]:
        """Wrap text to fit within max_width using Skia measurements."""
        words = text.split()
        lines = []
        line_breaks = []
        current_line = []
        current_width = 0
        space_width = font.measureText(" ")

        for i, word in enumerate(words):
            word_width = font.measureText(word)

            if current_width == 0:
                # First word on line
                current_line.append(word)
                current_width = word_width
            elif current_width + space_width + word_width <= max_width:
                # Word fits on current line
                current_line.append(word)
                current_width += space_width + word_width
            else:
                # Start new line
                lines.append(" ".join(current_line))
                if i < len(words) - 1:
                    line_breaks.append(len(" ".join(lines)))
                current_line = [word]
                current_width = word_width

        # Add last line
        if current_line:
            lines.append(" ".join(current_line))

        return lines, line_breaks

    def _measure_with_fallback(self,
                              text: str,
                              font_size: float,
                              font_family: str,
                              font_weight: int,
                              max_width: Optional[float],
                              line_height_multiplier: float) -> MeasuredText:
        """Fallback measurement using font metrics estimation."""
        metrics = self.font_metrics_service.get_font_metrics(font_family)

        # Estimate dimensions
        text_width = self.font_metrics_service.estimate_text_width(text, font_size, font_family)
        line_height = font_size * line_height_multiplier
        ascent = font_size * metrics.cap_height_ratio
        descent = font_size * 0.25  # Approximate

        if max_width and text_width > max_width:
            line_count = self.font_metrics_service.estimate_text_lines(
                text, font_size, font_family, max_width
            )
            measured_height = line_count * line_height
            measured_width = min(text_width, max_width)
        else:
            line_count = 1
            measured_height = line_height
            measured_width = text_width

        return MeasuredText(
            text=text,
            font_size=font_size,
            font_family=font_family,
            font_weight=font_weight,
            measured_width=measured_width,
            measured_height=measured_height,
            line_breaks=[],
            line_heights=[line_height] * line_count,
            ascent=ascent,
            descent=descent,
            fits_container=True
        )

    def find_optimal_size_binary_search(self,
                                       text: str,
                                       container: TextBox,
                                       font_family: str,
                                       font_weight: int = 400,
                                       min_size: float = 8,
                                       max_size: float = 72,
                                       max_lines: Optional[int] = None,
                                       precision: float = 0.5) -> Dict[str, Any]:
        """
        Use binary search to find optimal font size with high accuracy.

        Returns:
            Dictionary with optimal fontSize and metadata
        """
        low, high = min_size, max_size
        optimal_size = min_size
        optimal_measurement = None

        iterations = 0
        max_iterations = int((max_size - min_size) / precision) + 1

        while low <= high and iterations < max_iterations:
            mid = (low + high) / 2
            iterations += 1

            # Measure text at this size
            measurement = self.measure_text_accurate(
                text=text,
                font_size=mid,
                font_family=font_family,
                font_weight=font_weight,
                max_width=container.content_width
            )

            # Check if it fits
            fits_width = measurement.measured_width <= container.content_width
            fits_height = measurement.measured_height <= container.content_height
            fits_lines = max_lines is None or len(measurement.line_heights) <= max_lines

            if fits_width and fits_height and fits_lines:
                optimal_size = mid
                optimal_measurement = measurement
                low = mid + precision
            else:
                high = mid - precision

        # Final measurement at optimal size
        if optimal_measurement is None:
            optimal_measurement = self.measure_text_accurate(
                text=text,
                font_size=optimal_size,
                font_family=font_family,
                font_weight=font_weight,
                max_width=container.content_width
            )

        return {
            "fontSize": round(optimal_size, 1),
            "fontWeight": font_weight,
            "measuredWidth": optimal_measurement.measured_width,
            "measuredHeight": optimal_measurement.measured_height,
            "lineCount": len(optimal_measurement.line_heights),
            "iterations": iterations,
            "fits": optimal_measurement.fits_container
        }

    def batch_measure_components(self,
                                components: List[Dict[str, Any]],
                                theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """
        Batch measure multiple components for optimal performance.

        Args:
            components: List of component dictionaries with text content
            theme: Theme dictionary with font settings

        Returns:
            Components with added sizing information
        """
        measured_components = []

        for component in components:
            if component.get("type") not in ["text", "heading", "bullet"]:
                measured_components.append(component)
                continue

            # Extract component details
            text = component.get("content", "")
            element_type = component.get("elementType", "body")
            bounds = component.get("bounds", {})

            # Create container from bounds
            container = TextBox(
                width=bounds.get("width", 400),
                height=bounds.get("height", 100),
                padding_x=bounds.get("paddingX", 20),
                padding_y=bounds.get("paddingY", 10)
            )

            # Get font settings from theme
            font_family = theme.get("fontFamily", "Inter")
            font_weight = self._get_weight_for_element(element_type)

            # Calculate optimal size
            sizing_result = self.font_metrics_service.calculate_size_with_strategy(
                text=text,
                container=container,
                font_family=font_family,
                element_type=element_type,
                fit_strategy=FitStrategy.SHRINK_TO_FIT
            )

            # Add sizing to component
            component["fontSize"] = sizing_result["fontSize"]
            component["fontSizeMin"] = sizing_result["fontSizeMin"]
            component["fontSizeMax"] = sizing_result["fontSizeMax"]
            component["lineClamp"] = sizing_result["lineClamp"]
            component["fitStrategy"] = sizing_result["fitStrategy"]

            measured_components.append(component)

        return measured_components

    def _get_weight_for_element(self, element_type: str) -> int:
        """Get appropriate font weight for element type."""
        weight_map = {
            "title": 700,
            "heading": 600,
            "subtitle": 500,
            "body": 400,
            "caption": 400,
            "bullet": 400,
            "label": 500
        }
        return weight_map.get(element_type, 400)

    def validate_text_fit(self,
                         text: str,
                         font_size: float,
                         container: TextBox,
                         font_family: str,
                         font_weight: int = 400) -> Tuple[bool, Optional[float]]:
        """
        Validate if text fits in container, suggest alternative size if not.

        Returns:
            Tuple of (fits: bool, suggested_size: Optional[float])
        """
        measurement = self.measure_text_accurate(
            text=text,
            font_size=font_size,
            font_family=font_family,
            font_weight=font_weight,
            max_width=container.content_width
        )

        fits = (measurement.measured_width <= container.content_width and
                measurement.measured_height <= container.content_height)

        if fits:
            return True, None

        # Find better size
        optimal = self.find_optimal_size_binary_search(
            text=text,
            container=container,
            font_family=font_family,
            font_weight=font_weight,
            max_size=font_size  # Don't go larger than requested
        )

        return False, optimal["fontSize"]


# Singleton instance
text_measurement_engine = TextMeasurementEngine()