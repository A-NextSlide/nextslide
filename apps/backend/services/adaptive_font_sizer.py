"""
Adaptive Font Sizer
Calculates optimal font sizes to fit text within containers.
"""

import logging
from typing import Optional
from dataclasses import dataclass
from services.font_metrics_service import FontMetricsService

logger = logging.getLogger(__name__)


@dataclass
class SizingResult:
    """Result of font size calculation"""
    font_size: float           # Optimal font size in pixels
    fits: bool                 # Whether text fits in container
    estimated_lines: int       # Estimated number of lines
    confidence: float          # Confidence in the estimation (0-1)
    original_size: float       # Original font size before optimization
    reduction_percentage: float # How much the font was reduced


class AdaptiveFontSizer:
    """
    Calculates optimal font sizes to fit text within containers.

    Uses binary search to find the largest font size that fits,
    with configurable min/max bounds and safety margins.
    """

    # Configuration
    MIN_FONT_SIZE = 14        # Never go below this
    MAX_FONT_SIZE = 800       # Never go above this
    SAFETY_MARGIN = 0.80      # Leave 20% margin for safety (was 5%, too tight)
    LINE_HEIGHT = 1.2         # Default line height multiplier

    def __init__(self, metrics_service: FontMetricsService):
        self.metrics = metrics_service
        logger.info("✅ AdaptiveFontSizer initialized")

    def find_optimal_size(
        self,
        text: str,
        container_width: float,
        container_height: float,
        font_family: str = 'Inter',
        padding_x: float = 0,
        padding_y: float = 0,
        letter_spacing: float = 0,
        min_size: Optional[float] = None,
        max_size: Optional[float] = None
    ) -> SizingResult:
        """
        Find the optimal font size to fit text within a container.

        Args:
            text: The text content to fit
            container_width: Width of container in pixels
            container_height: Height of container in pixels
            font_family: Font family name
            padding_x: Horizontal padding (each side)
            padding_y: Vertical padding (each side)
            letter_spacing: Additional letter spacing
            min_size: Minimum font size (default: MIN_FONT_SIZE)
            max_size: Maximum font size (default: MAX_FONT_SIZE)

        Returns:
            SizingResult with optimal font size and metadata
        """
        if not text or not text.strip():
            return SizingResult(
                font_size=max_size or 48,
                fits=True,
                estimated_lines=0,
                confidence=1.0,
                original_size=max_size or 48,
                reduction_percentage=0
            )

        # Set bounds
        min_font = min_size or self.MIN_FONT_SIZE
        max_font = max_size or self.MAX_FONT_SIZE

        # Available space after padding
        available_width = (container_width - padding_x * 2) * self.SAFETY_MARGIN
        available_height = (container_height - padding_y * 2) * self.SAFETY_MARGIN

        if available_width <= 0 or available_height <= 0:
            logger.warning(f"Invalid container dimensions: {container_width}x{container_height}")
            return SizingResult(
                font_size=min_font,
                fits=False,
                estimated_lines=1,
                confidence=0.5,
                original_size=max_font,
                reduction_percentage=100 * (max_font - min_font) / max_font
            )

        # HARD CAP: Font can never exceed height / line_height (ensures at least 1 line fits)
        # This is a simple rule that guarantees the font won't overflow vertically
        height_based_max = available_height / self.LINE_HEIGHT
        max_font = min(max_font, height_based_max)

        # Also cap based on width for single-line text (rough estimate)
        # For short text, font shouldn't exceed width / (chars * 0.6)
        char_count = len(text.strip())
        if char_count > 0:
            width_based_max = available_width / (char_count * 0.6)  # Conservative char width
            max_font = min(max_font, width_based_max)

        # Ensure max_font is still above min_font
        if max_font < min_font:
            max_font = min_font

        # Binary search for optimal size
        optimal_size = self._binary_search_size(
            text=text,
            font_family=font_family,
            available_width=available_width,
            available_height=available_height,
            letter_spacing=letter_spacing,
            min_size=min_font,
            max_size=max_font
        )

        # Verify fit and get line count
        estimated_lines = self.metrics.estimate_lines_for_text(
            text=text,
            font_family=font_family,
            font_size=optimal_size,
            container_width=available_width
        )

        text_height = self.metrics.estimate_text_height(
            text=text,
            font_family=font_family,
            font_size=optimal_size,
            container_width=available_width
        )

        fits = text_height <= available_height

        # Calculate confidence based on how much we had to reduce
        reduction = max_font - optimal_size
        reduction_pct = (reduction / max_font) * 100 if max_font > 0 else 0

        # Confidence decreases as we reduce more
        confidence = max(0.5, 1.0 - (reduction_pct / 100))

        return SizingResult(
            font_size=optimal_size,
            fits=fits,
            estimated_lines=estimated_lines,
            confidence=confidence,
            original_size=max_font,
            reduction_percentage=reduction_pct
        )

    def _binary_search_size(
        self,
        text: str,
        font_family: str,
        available_width: float,
        available_height: float,
        letter_spacing: float,
        min_size: float,
        max_size: float
    ) -> float:
        """
        Binary search for the largest font size that fits.
        """
        # Early exit: check if max size already fits
        if self._text_fits(text, font_family, max_size, available_width, available_height, letter_spacing):
            return max_size

        # Early exit: check if even min size doesn't fit
        if not self._text_fits(text, font_family, min_size, available_width, available_height, letter_spacing):
            return min_size

        # Binary search
        precision = 1.0  # Search precision in pixels
        low, high = min_size, max_size

        while high - low > precision:
            mid = (low + high) / 2

            if self._text_fits(text, font_family, mid, available_width, available_height, letter_spacing):
                low = mid  # Can try larger
            else:
                high = mid  # Need smaller

        # Round to reasonable precision
        return round(low, 1)

    def _text_fits(
        self,
        text: str,
        font_family: str,
        font_size: float,
        available_width: float,
        available_height: float,
        letter_spacing: float
    ) -> bool:
        """
        Check if text at given size fits within available space.
        """
        # Get estimated height with wrapping
        text_height = self.metrics.estimate_text_height(
            text=text,
            font_family=font_family,
            font_size=font_size,
            container_width=available_width
        )

        return text_height <= available_height

    def suggest_font_size_for_layout(
        self,
        text: str,
        layout_type: str,
        container_width: float,
        container_height: float,
        font_family: str = 'Inter'
    ) -> float:
        """
        Suggest font size based on layout type and content.

        Args:
            text: Text content
            layout_type: 'title', 'heading', 'body', 'caption'
            container_width: Available width
            container_height: Available height
            font_family: Font family

        Returns:
            Suggested font size
        """
        # Default sizes by layout type
        default_sizes = {
            'title': 450,
            'heading': 64,
            'body': 36,
            'caption': 24,
            'stat': 120,
        }

        max_size = default_sizes.get(layout_type, 36)

        result = self.find_optimal_size(
            text=text,
            container_width=container_width,
            container_height=container_height,
            font_family=font_family,
            max_size=max_size
        )

        return result.font_size
