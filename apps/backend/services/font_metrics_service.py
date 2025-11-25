"""
Font Metrics Service
Provides approximate character width measurements for font sizing calculations.
"""

import logging
from typing import Dict, Optional
from dataclasses import dataclass

logger = logging.getLogger(__name__)


@dataclass
class FontMetrics:
    """Metrics for a font at a given size"""
    avg_char_width: float  # Average character width in pixels
    line_height: float     # Line height in pixels
    cap_height: float      # Height of capital letters


class FontMetricsService:
    """
    Service for calculating approximate text dimensions.

    Uses average character width ratios for common fonts.
    This is an approximation - actual rendering may vary slightly.
    """

    # Character width ratios relative to font size
    # These are empirically determined averages
    FONT_WIDTH_RATIOS = {
        # Sans-serif fonts (narrower)
        'inter': 0.50,
        'roboto': 0.48,
        'open sans': 0.50,
        'lato': 0.49,
        'montserrat': 0.55,
        'poppins': 0.52,
        'raleway': 0.50,
        'nunito': 0.52,
        'work sans': 0.50,
        'dm sans': 0.50,
        'arial': 0.50,
        'helvetica': 0.50,

        # Serif fonts (slightly wider)
        'playfair display': 0.52,
        'merriweather': 0.55,
        'lora': 0.52,
        'georgia': 0.55,
        'times new roman': 0.50,

        # Display fonts (wider)
        'bebas neue': 0.45,  # Condensed
        'oswald': 0.42,      # Condensed
        'anton': 0.48,

        # Monospace (fixed width)
        'jetbrains mono': 0.60,
        'fira code': 0.60,
        'source code pro': 0.60,
        'courier': 0.60,
    }

    DEFAULT_WIDTH_RATIO = 0.50
    DEFAULT_LINE_HEIGHT_RATIO = 1.2
    DEFAULT_CAP_HEIGHT_RATIO = 0.72

    def __init__(self):
        logger.info("✅ FontMetricsService initialized")

    def get_metrics(self, font_family: str, font_size: float) -> FontMetrics:
        """
        Get font metrics for a given font and size.

        Args:
            font_family: Font family name
            font_size: Font size in pixels

        Returns:
            FontMetrics with calculated dimensions
        """
        # Normalize font name for lookup
        font_key = font_family.lower().strip()

        # Get width ratio (or default)
        width_ratio = self.FONT_WIDTH_RATIOS.get(font_key, self.DEFAULT_WIDTH_RATIO)

        return FontMetrics(
            avg_char_width=font_size * width_ratio,
            line_height=font_size * self.DEFAULT_LINE_HEIGHT_RATIO,
            cap_height=font_size * self.DEFAULT_CAP_HEIGHT_RATIO
        )

    def estimate_text_width(
        self,
        text: str,
        font_family: str,
        font_size: float,
        letter_spacing: float = 0
    ) -> float:
        """
        Estimate the width of text in pixels.

        Args:
            text: The text to measure
            font_family: Font family name
            font_size: Font size in pixels
            letter_spacing: Additional letter spacing in pixels

        Returns:
            Estimated width in pixels
        """
        if not text:
            return 0

        metrics = self.get_metrics(font_family, font_size)

        # Basic estimation: avg char width * character count
        char_count = len(text)
        base_width = metrics.avg_char_width * char_count

        # Add letter spacing
        spacing_width = letter_spacing * (char_count - 1) if char_count > 1 else 0

        return base_width + spacing_width

    def estimate_text_height(
        self,
        text: str,
        font_family: str,
        font_size: float,
        container_width: float,
        padding_x: float = 0
    ) -> float:
        """
        Estimate the height of text that will wrap within a container.

        Args:
            text: The text to measure
            font_family: Font family name
            font_size: Font size in pixels
            container_width: Available width for text
            padding_x: Horizontal padding on each side

        Returns:
            Estimated height in pixels
        """
        if not text:
            return 0

        metrics = self.get_metrics(font_family, font_size)

        # Available width after padding
        available_width = container_width - (padding_x * 2)
        if available_width <= 0:
            return metrics.line_height

        # Estimate how many lines the text will take
        text_width = self.estimate_text_width(text, font_family, font_size)
        num_lines = max(1, text_width / available_width)

        # Account for word wrapping (text doesn't wrap mid-word usually)
        # Add a small buffer for word breaks
        num_lines = num_lines * 1.1

        return metrics.line_height * num_lines

    def estimate_lines_for_text(
        self,
        text: str,
        font_family: str,
        font_size: float,
        container_width: float,
        padding_x: float = 0
    ) -> int:
        """
        Estimate how many lines text will take when wrapped.

        Returns:
            Estimated number of lines
        """
        if not text:
            return 0

        metrics = self.get_metrics(font_family, font_size)
        available_width = container_width - (padding_x * 2)

        if available_width <= 0:
            return 1

        # Simple word-based line estimation
        words = text.split()
        lines = 1
        current_line_width = 0

        for word in words:
            word_width = self.estimate_text_width(word, font_family, font_size)
            space_width = metrics.avg_char_width

            if current_line_width + word_width > available_width:
                lines += 1
                current_line_width = word_width + space_width
            else:
                current_line_width += word_width + space_width

        return lines


# Singleton instance
font_metrics_service = FontMetricsService()
