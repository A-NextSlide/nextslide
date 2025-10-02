"""
Dynamic Font Analyzer for calculating metrics of unknown fonts.
Uses actual rendering to measure font characteristics.
"""

from typing import Dict, Optional, Tuple
from dataclasses import dataclass
import logging
from functools import lru_cache
from PIL import Image, ImageDraw, ImageFont
import os
import string

logger = logging.getLogger(__name__)


@dataclass
class DynamicFontMetrics:
    """Dynamically calculated font metrics."""
    family: str
    x_height: float  # Actual pixel height of 'x'
    cap_height: float  # Actual pixel height of 'H'
    ascent: float  # Maximum ascent
    descent: float  # Maximum descent
    avg_char_width: float  # Average width across common characters
    space_width: float  # Width of space character

    # Calculated ratios
    x_height_ratio: float = 0
    cap_height_ratio: float = 0
    avg_char_width_ratio: float = 0
    line_height_ratio: float = 0
    space_width_ratio: float = 0

    def __post_init__(self):
        """Calculate ratios based on a standard size."""
        if self.cap_height > 0:
            # Use cap height as reference
            self.x_height_ratio = self.x_height / self.cap_height * 0.72
            self.cap_height_ratio = 0.72  # Standard ratio
            self.avg_char_width_ratio = self.avg_char_width / self.cap_height * 0.72
            self.space_width_ratio = self.space_width / self.cap_height * 0.72
            self.line_height_ratio = (self.ascent + self.descent) / self.cap_height


class DynamicFontAnalyzer:
    """Analyzes fonts dynamically to extract metrics."""

    # Sample text for measurements
    SAMPLE_LOWERCASE = "abcdefghijklmnopqrstuvwxyz"
    SAMPLE_UPPERCASE = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    SAMPLE_NUMBERS = "0123456789"
    SAMPLE_COMMON = "the quick brown fox jumps over the lazy dog"

    def __init__(self):
        self._metrics_cache = {}
        self._font_cache = {}

    @lru_cache(maxsize=100)
    def analyze_font(self, font_family: str, font_path: Optional[str] = None) -> DynamicFontMetrics:
        """
        Analyze a font and extract its metrics.

        Args:
            font_family: Font family name
            font_path: Optional path to font file

        Returns:
            DynamicFontMetrics with calculated values
        """
        cache_key = f"{font_family}:{font_path}"
        if cache_key in self._metrics_cache:
            return self._metrics_cache[cache_key]

        try:
            # Load font at standard size for measurement
            test_size = 100  # Use 100px for accurate measurements
            font = self._load_font(font_family, font_path, test_size)

            if font is None:
                # Fallback to default metrics
                return self._get_default_metrics(font_family)

            # Measure various aspects
            x_height = self._measure_x_height(font)
            cap_height = self._measure_cap_height(font)
            ascent, descent = self._measure_vertical_bounds(font)
            avg_char_width = self._measure_avg_width(font)
            space_width = self._measure_space_width(font)

            # Create metrics object
            metrics = DynamicFontMetrics(
                family=font_family,
                x_height=x_height,
                cap_height=cap_height,
                ascent=ascent,
                descent=descent,
                avg_char_width=avg_char_width,
                space_width=space_width
            )

            # Cache the result
            self._metrics_cache[cache_key] = metrics
            logger.info(f"Analyzed font {font_family}: x_height_ratio={metrics.x_height_ratio:.3f}")

            return metrics

        except Exception as e:
            logger.warning(f"Failed to analyze font {font_family}: {e}")
            return self._get_default_metrics(font_family)

    def _load_font(self, font_family: str, font_path: Optional[str], size: int):
        """Load a font for analysis."""
        try:
            if font_path and os.path.exists(font_path):
                return ImageFont.truetype(font_path, size)

            # Try common font paths
            common_paths = self._get_common_font_paths(font_family)
            for path in common_paths:
                if os.path.exists(path):
                    return ImageFont.truetype(path, size)

            # Try system font
            return ImageFont.truetype(font_family, size)

        except Exception as e:
            logger.debug(f"Could not load font {font_family}: {e}")
            return None

    def _measure_x_height(self, font) -> float:
        """Measure the x-height of a font."""
        img = Image.new('RGB', (200, 200), 'white')
        draw = ImageDraw.Draw(img)

        # Measure lowercase 'x'
        bbox = draw.textbbox((0, 0), 'x', font=font)
        return float(bbox[3] - bbox[1])

    def _measure_cap_height(self, font) -> float:
        """Measure the cap height of a font."""
        img = Image.new('RGB', (200, 200), 'white')
        draw = ImageDraw.Draw(img)

        # Measure uppercase 'H'
        bbox = draw.textbbox((0, 0), 'H', font=font)
        return float(bbox[3] - bbox[1])

    def _measure_vertical_bounds(self, font) -> Tuple[float, float]:
        """Measure ascent and descent."""
        img = Image.new('RGB', (500, 200), 'white')
        draw = ImageDraw.Draw(img)

        # Use full character set to find extremes
        test_text = "HgjpqyÁÇÉ"
        bbox = draw.textbbox((0, 100), test_text, font=font)

        # Ascent is from baseline up, descent is from baseline down
        baseline = 100
        ascent = baseline - bbox[1]
        descent = bbox[3] - baseline

        return float(ascent), float(descent)

    def _measure_avg_width(self, font) -> float:
        """Measure average character width."""
        img = Image.new('RGB', (2000, 200), 'white')
        draw = ImageDraw.Draw(img)

        # Measure common characters
        test_chars = self.SAMPLE_LOWERCASE + self.SAMPLE_UPPERCASE + self.SAMPLE_NUMBERS
        total_width = 0

        for char in test_chars:
            bbox = draw.textbbox((0, 0), char, font=font)
            total_width += (bbox[2] - bbox[0])

        return float(total_width / len(test_chars))

    def _measure_space_width(self, font) -> float:
        """Measure space character width."""
        img = Image.new('RGB', (200, 200), 'white')
        draw = ImageDraw.Draw(img)

        # Measure text with and without space
        bbox1 = draw.textbbox((0, 0), 'XX', font=font)
        bbox2 = draw.textbbox((0, 0), 'X X', font=font)

        width1 = bbox1[2] - bbox1[0]
        width2 = bbox2[2] - bbox2[0]

        return float(width2 - width1)

    def _get_common_font_paths(self, font_family: str) -> list:
        """Get common paths where font might be located."""
        font_name = font_family.replace(' ', '')

        paths = []

        # macOS paths
        if os.path.exists('/System/Library/Fonts'):
            paths.extend([
                f'/System/Library/Fonts/{font_name}.ttf',
                f'/System/Library/Fonts/{font_name}.ttc',
                f'/Library/Fonts/{font_name}.ttf',
                f'/Library/Fonts/{font_name}.ttc',
                f'~/Library/Fonts/{font_name}.ttf',
            ])

        # Linux paths
        if os.path.exists('/usr/share/fonts'):
            paths.extend([
                f'/usr/share/fonts/truetype/{font_name.lower()}/{font_name}.ttf',
                f'/usr/local/share/fonts/{font_name}.ttf',
                f'~/.fonts/{font_name}.ttf',
            ])

        # Windows paths
        if os.path.exists('C:\\Windows\\Fonts'):
            paths.extend([
                f'C:\\Windows\\Fonts\\{font_name}.ttf',
                f'C:\\Windows\\Fonts\\{font_name}.ttc',
            ])

        # Expand user paths
        paths = [os.path.expanduser(p) for p in paths]

        return paths

    def _get_default_metrics(self, font_family: str) -> DynamicFontMetrics:
        """Get default metrics based on font classification."""
        # Classify font based on name
        family_lower = font_family.lower()

        # Serif fonts tend to have lower x-height
        if any(serif in family_lower for serif in ['serif', 'times', 'georgia', 'palatino', 'book']):
            return DynamicFontMetrics(
                family=font_family,
                x_height=45,
                cap_height=70,
                ascent=80,
                descent=20,
                avg_char_width=50,
                space_width=25
            )

        # Monospace fonts have uniform width
        elif any(mono in family_lower for mono in ['mono', 'code', 'courier', 'consolas']):
            return DynamicFontMetrics(
                family=font_family,
                x_height=52,
                cap_height=70,
                ascent=80,
                descent=20,
                avg_char_width=60,
                space_width=60
            )

        # Display/decorative fonts
        elif any(display in family_lower for display in ['display', 'script', 'hand', 'comic']):
            return DynamicFontMetrics(
                family=font_family,
                x_height=55,
                cap_height=75,
                ascent=85,
                descent=25,
                avg_char_width=55,
                space_width=25
            )

        # Default to sans-serif metrics
        else:
            return DynamicFontMetrics(
                family=font_family,
                x_height=52,
                cap_height=72,
                ascent=80,
                descent=20,
                avg_char_width=55,
                space_width=27
            )

    def analyze_web_font(self, font_url: str, font_family: str) -> DynamicFontMetrics:
        """
        Analyze a web font by downloading and measuring it.

        Args:
            font_url: URL to the font file
            font_family: Font family name

        Returns:
            DynamicFontMetrics for the web font
        """
        import tempfile
        import requests

        try:
            # Download font to temp file
            response = requests.get(font_url, timeout=10)
            response.raise_for_status()

            with tempfile.NamedTemporaryFile(suffix='.ttf', delete=False) as tmp_file:
                tmp_file.write(response.content)
                tmp_path = tmp_file.name

            # Analyze the downloaded font
            metrics = self.analyze_font(font_family, tmp_path)

            # Clean up temp file
            os.unlink(tmp_path)

            return metrics

        except Exception as e:
            logger.warning(f"Failed to analyze web font {font_url}: {e}")
            return self._get_default_metrics(font_family)


# Singleton instance
dynamic_font_analyzer = DynamicFontAnalyzer()