"""
Simple Font Fitter - Detect overflow and resize down

This is the ONLY font sizing service you need. It:
1. Measures text dimensions using PIL
2. Detects if it overflows the container
3. Reduces font size until it fits
4. Uses standard font sizes
5. That's it!

No complex algorithms, no saved states, no pre-calculations.
"""

import logging
from typing import Dict, Any, Optional, List, Tuple
from PIL import Image, ImageDraw, ImageFont
import os

logger = logging.getLogger(__name__)

# Standard font sizes to use (matches frontend)
STANDARD_FONT_SIZES = [
    8, 9, 10, 11, 12, 14, 16, 18, 20, 22, 24, 28, 32, 36,
    40, 44, 48, 54, 60, 66, 72, 80, 88, 96
]


class SimpleFontFitter:
    """Simple font fitter - just detect overflow and resize down."""

    def __init__(self):
        """Initialize with font path for common fonts."""
        # Try to find system fonts
        self.font_cache = {}

        # Get the base directory (where this file is located)
        import pathlib
        backend_dir = pathlib.Path(__file__).parent.parent.resolve()
        custom_fonts_dir = backend_dir / "assets" / "fonts"

        self.system_font_paths = [
            str(custom_fonts_dir),  # Backend custom fonts - CHECK FIRST
            "/System/Library/Fonts",  # macOS
            "/usr/share/fonts",  # Linux
            "C:\\Windows\\Fonts",  # Windows
        ]

    def _get_font_path(self, font_family: str) -> Optional[str]:
        """Get the path to a font file, searching backend fonts first."""
        import pathlib

        # OPTIMIZATION: Skip search if font is in metrics database
        # These are web fonts that don't need local files
        if font_family in self.FONT_METRICS:
            # Font is in database, no need to search for files
            return None

        # Check case-insensitive
        for known_font in self.FONT_METRICS.keys():
            if known_font.lower() == font_family.lower():
                return None

        family_lower = font_family.lower()

        # Generate possible font filenames
        # Try exact name, regular variant, and without spaces
        font_name_clean = font_family.replace(" ", "")
        possible_names = [
            f"{font_family}.ttf",
            f"{font_family}.otf",
            f"{font_name_clean}.ttf",
            f"{font_name_clean}.otf",
            f"{font_family}-Regular.ttf",
            f"{font_name_clean}-Regular.ttf",
        ]

        # Map for common system fonts
        system_font_map = {
            "inter": ["Inter-Regular.ttf", "Inter.ttc"],
            "arial": ["Arial.ttf", "arial.ttf"],
            "helvetica": ["Helvetica.ttc", "HelveticaNeue.ttc", "Arial.ttf"],
            "georgia": ["Georgia.ttf", "georgia.ttf"],
            "roboto": ["Roboto-Regular.ttf"],
            "open sans": ["OpenSans-Regular.ttf"],
        }

        if family_lower in system_font_map:
            possible_names.extend(system_font_map[family_lower])

        # Search in each font directory
        for font_dir in self.system_font_paths:
            if not os.path.exists(font_dir):
                continue

            font_dir_path = pathlib.Path(font_dir)

            # For backend fonts directory, search recursively
            if "assets/fonts" in str(font_dir_path):
                print(f"🔍 Searching for '{font_family}' in {font_dir_path}...")
                found_files = []

                # Recursively search for font files
                for ext in ['.ttf', '.otf']:
                    for font_file in font_dir_path.rglob(f"*{ext}"):
                        # Skip macOS resource fork files
                        if '._' in font_file.name or '__MACOSX' in str(font_file):
                            continue

                        found_files.append(str(font_file))
                        file_stem = font_file.stem.lower()

                        # Remove common suffixes like -regular, -bold, -light, -medium, -semibold, etc.
                        file_stem_base = file_stem
                        for suffix in ['-regular', '-bold', '-light', '-medium', '-semibold', '-extrabold',
                                       '-black', '-thin', '-extralight', '-heavy', '-oblique', '-slant',
                                       'regular', 'bold', 'light', 'medium']:
                            file_stem_base = file_stem_base.replace(suffix, '')

                        # Clean up any remaining hyphens/numbers at start (like "403absently" -> "absently")
                        file_stem_base = file_stem_base.lstrip('0123456789-')

                        # Get first word of font family (for multi-word fonts like "Alerio Sans Serif" -> "alerio")
                        family_first_word = family_lower.split()[0] if ' ' in family_lower else family_lower

                        # Try multiple matching strategies
                        # 1. Exact match (full font name)
                        if file_stem == family_lower:
                            print(f"✅ Found font '{font_family}' at: {font_file} (exact match)")
                            return str(font_file)

                        # 2. Match with hyphens converted to spaces
                        if file_stem.replace("-", " ") == family_lower:
                            print(f"✅ Found font '{font_family}' at: {font_file} (hyphen match)")
                            return str(font_file)

                        # 3. Match without spaces/hyphens (full name)
                        if file_stem.replace("-", "").replace(" ", "") == font_name_clean.lower():
                            print(f"✅ Found font '{font_family}' at: {font_file} (no-space match)")
                            return str(font_file)

                        # 4. Match base name (without variant suffix) against full name
                        if file_stem_base.replace("-", "").replace(" ", "") == font_name_clean.lower():
                            print(f"✅ Found font '{font_family}' at: {font_file} (base name match)")
                            return str(font_file)

                        # 5. Match file stem base against FIRST WORD of font family (e.g., "alerio" matches "Alerio Sans Serif")
                        if file_stem_base.replace("-", "").replace(" ", "") == family_first_word.replace(" ", ""):
                            print(f"✅ Found font '{font_family}' at: {font_file} (first word match)")
                            return str(font_file)

                        # 6. Check if font family first word starts with file stem base (partial match)
                        stem_clean = file_stem_base.replace("-", "").replace(" ", "")
                        if len(stem_clean) > 3 and family_first_word.replace(" ", "").startswith(stem_clean):
                            print(f"✅ Found font '{font_family}' at: {font_file} (prefix match)")
                            return str(font_file)

                # If not found, show what we searched
                print(f"❌ Font '{font_family}' not found in {font_dir_path}")
                if found_files:
                    print(f"   📂 Searched {len(found_files)} font files")
                    print(f"   💡 Looking for: '{family_lower}' or first word: '{family_first_word}'")
            else:
                # For system fonts, just check top level
                for font_name in possible_names:
                    font_path = os.path.join(font_dir, font_name)
                    if os.path.exists(font_path):
                        return font_path

        return None

    def _load_font(self, font_family: str, font_size: int) -> ImageFont.FreeTypeFont:
        """Load a PIL font."""
        cache_key = f"{font_family}:{font_size}"
        if cache_key in self.font_cache:
            return self.font_cache[cache_key]

        font_path = self._get_font_path(font_family)

        try:
            if font_path:
                font = ImageFont.truetype(font_path, font_size)
            else:
                # Fallback to default font
                logger.warning(f"Font {font_family} not found, using default")
                font = ImageFont.load_default()
        except Exception as e:
            logger.warning(f"Failed to load font {font_family}: {e}, using default")
            font = ImageFont.load_default()

        self.font_cache[cache_key] = font
        return font

    # Intelligent font metrics database for common web fonts
    # These are empirically measured ratios: (avg char width) / (font size)
    FONT_METRICS = {
        # Google Fonts - Sans Serif
        'Inter': 0.57, 'Roboto': 0.55, 'Open Sans': 0.56, 'Lato': 0.54,
        'Montserrat': 0.52, 'Poppins': 0.53, 'Source Sans Pro': 0.55,
        'Raleway': 0.52, 'Work Sans': 0.55, 'Nunito': 0.56, 'Mulish': 0.55,
        'DM Sans': 0.56, 'Outfit': 0.53, 'Manrope': 0.56, 'Plus Jakarta Sans': 0.55,
        'Space Grotesk': 0.58, 'Archivo': 0.54, 'Lexend': 0.57, 'Sora': 0.56,
        'Rubik': 0.56, 'Karla': 0.55, 'Josefin Sans': 0.54, 'Quicksand': 0.58,

        # Google Fonts - Serif
        'Playfair Display': 0.48, 'Merriweather': 0.54, 'Lora': 0.52,
        'PT Serif': 0.54, 'Crimson Text': 0.51, 'Libre Baskerville': 0.52,
        'Cormorant': 0.46, 'EB Garamond': 0.48, 'Vollkorn': 0.53,
        'Spectral': 0.52, 'Fraunces': 0.51,

        # Google Fonts - Display
        'Bebas Neue': 0.45, 'Righteous': 0.58, 'Abril Fatface': 0.52,
        'Fredoka One': 0.60, 'Anton': 0.46, 'Alfa Slab One': 0.58,
        'Russo One': 0.56, 'Bungee': 0.60, 'Monoton': 0.65,

        # Google Fonts - Monospace
        'Roboto Mono': 0.60, 'Source Code Pro': 0.60, 'JetBrains Mono': 0.60,
        'Fira Code': 0.60, 'Space Mono': 0.60, 'IBM Plex Mono': 0.60,
        'PT Mono': 0.60, 'Inconsolata': 0.60,

        # Google Fonts - Script
        'Pacifico': 0.52, 'Lobster': 0.55, 'Dancing Script': 0.48,
        'Satisfy': 0.50, 'Caveat': 0.48, 'Shadows Into Light': 0.52,

        # Fontshare Fonts
        'Satoshi': 0.55, 'Cabinet Grotesk': 0.54, 'General Sans': 0.56,
        'Clash Display': 0.52, 'Switzer': 0.55, 'Synonym': 0.54,
        'Chillax': 0.54, 'Melodrama': 0.48,

        # System Fonts
        'Arial': 0.55, 'Helvetica': 0.55, 'Times New Roman': 0.50,
        'Georgia': 0.52, 'Courier New': 0.60, 'Verdana': 0.58,
        'Trebuchet MS': 0.55, 'Impact': 0.45, 'Palatino': 0.51,
        'Garamond': 0.48, 'Tahoma': 0.56, 'Avenir': 0.54, 'Futura': 0.53,
    }

    def measure_char_width_ratio(self, font_family: str, font_size: int = 24) -> float:
        """
        Get character width ratio for a font.
        First tries database, then attempts measurement, then uses intelligent fallback.
        Returns the ratio of (average character width) / (font size).
        """
        # 1. Try exact match in database
        if font_family in self.FONT_METRICS:
            ratio = self.FONT_METRICS[font_family]
            print(f"  📏 Measured ratio {ratio:.3f} for {font_family}")
            return ratio

        # 2. Try case-insensitive match
        for font_name, ratio in self.FONT_METRICS.items():
            if font_name.lower() == font_family.lower():
                print(f"  📏 Measured ratio {ratio:.3f} for {font_family}")
                return ratio

        # 3. Try to measure from actual font file
        try:
            font = self._load_font(font_family, font_size)
            font_path = self._get_font_path(font_family)

            if font_path:
                # Use PIL to measure a sample text
                sample_text = 'The quick brown fox jumps over the lazy dog 0123456789'
                temp_img = Image.new('RGB', (1000, 100), color='white')
                draw = ImageDraw.Draw(temp_img)
                bbox = draw.textbbox((0, 0), sample_text, font=font)
                text_width = bbox[2] - bbox[0]
                char_count = len(sample_text)
                char_width_ratio = (text_width / char_count) / font_size

                # Sanity check: ratios should be between 0.3 and 0.8 for real fonts
                if 0.3 <= char_width_ratio <= 0.8:
                    print(f"  📏 Measured ratio {char_width_ratio:.3f} for {font_family}")
                    return char_width_ratio
        except Exception as e:
            logger.debug(f"Could not measure font {font_family}: {e}")

        # 4. Use intelligent fallback based on font name
        font_lower = font_family.lower()

        # Check for keywords in font name
        if any(kw in font_lower for kw in ['mono', 'code', 'courier', 'console']):
            print(f"  💡 Using monospace ratio 0.60 for {font_family}")
            return 0.60

        if any(kw in font_lower for kw in ['condensed', 'narrow', 'compressed']):
            print(f"  💡 Using condensed ratio 0.47 for {font_family}")
            return 0.47

        if any(kw in font_lower for kw in ['expanded', 'extended', 'wide']):
            print(f"  💡 Using wide ratio 0.62 for {font_family}")
            return 0.62

        if any(kw in font_lower for kw in ['serif']) and 'sans' not in font_lower:
            print(f"  💡 Using serif ratio 0.51 for {font_family}")
            return 0.51

        if any(kw in font_lower for kw in ['script', 'handwriting', 'handwritten']):
            print(f"  💡 Using script ratio 0.49 for {font_family}")
            return 0.49

        if any(kw in font_lower for kw in ['display', 'headline', 'decorative']):
            print(f"  💡 Using display ratio 0.53 for {font_family}")
            return 0.53

        # Default: sans-serif ratio (most common)
        print(f"  💡 Using default sans-serif ratio 0.55 for {font_family}")
        return 0.55

    def _standardize_font_size(self, size: float, prefer_round_down: bool = False) -> int:
        """Round to nearest standard font size."""
        if size < STANDARD_FONT_SIZES[0]:
            return STANDARD_FONT_SIZES[0]

        if size >= STANDARD_FONT_SIZES[-1]:
            return STANDARD_FONT_SIZES[-1]

        # Find closest standard size
        for i in range(len(STANDARD_FONT_SIZES) - 1):
            lower = STANDARD_FONT_SIZES[i]
            upper = STANDARD_FONT_SIZES[i + 1]

            if lower <= size <= upper:
                if prefer_round_down:
                    return lower
                else:
                    # Round to nearest
                    diff_lower = size - lower
                    diff_upper = upper - size
                    return lower if diff_lower < diff_upper else upper

        return STANDARD_FONT_SIZES[-1]

    def _wrap_text(
        self,
        text: str,
        font,
        max_width: float,
        draw
    ) -> List[str]:
        """Wrap text to fit within max_width."""
        words = text.split()
        lines = []
        current_line = []

        for word in words:
            test_line = ' '.join(current_line + [word])
            bbox = draw.textbbox((0, 0), test_line, font=font)
            line_width = bbox[2] - bbox[0]

            if line_width <= max_width:
                current_line.append(word)
            else:
                if current_line:
                    lines.append(' '.join(current_line))
                    current_line = [word]
                else:
                    # Word is too long for one line
                    lines.append(word)

        if current_line:
            lines.append(' '.join(current_line))

        return lines if lines else ['']

    def _measure_text_dimensions(
        self,
        text: str,
        font_size: int,
        font_family: str,
        available_width: float,
        line_height: float = 1.5,  # Match frontend default (TiptapTextBlockRenderer.tsx:51)
        letter_spacing: float = 0.0,
        char_width_ratio: Optional[float] = None
    ) -> Tuple[float, float]:
        """
        Measure text dimensions using character-width estimation.
        Uses actual measured ratio from frontend if available, otherwise falls back to default.
        Returns (width, height) in pixels.
        """
        # Use measured ratio from frontend if available, otherwise use default
        # 0.55 is empirically tuned for typical sans-serif and serif fonts
        if char_width_ratio is not None:
            CHAR_WIDTH_RATIO = char_width_ratio
        else:
            CHAR_WIDTH_RATIO = 0.55

        avg_char_width = font_size * CHAR_WIDTH_RATIO

        # Simulate text wrapping word by word
        words = text.split()
        lines = []
        current_line = []
        current_width = 0

        for word in words:
            # Estimate word width (characters * avg width)
            word_width = len(word) * avg_char_width
            space_width = avg_char_width  # Space character

            # Check if adding this word would exceed available width
            test_width = current_width + (space_width if current_line else 0) + word_width

            if test_width <= available_width or not current_line:
                # Word fits on current line
                current_line.append(word)
                current_width = test_width
            else:
                # Start new line
                if current_line:
                    lines.append(' '.join(current_line))
                current_line = [word]
                current_width = word_width

        # Add last line
        if current_line:
            lines.append(' '.join(current_line))

        if not lines:
            lines = ['']

        # Calculate dimensions
        num_lines = len(lines)
        line_height_px = font_size * line_height

        # Width is the longest line
        max_line_width = 0
        for line in lines:
            line_width = len(line) * avg_char_width
            max_line_width = max(max_line_width, line_width)

        total_height = num_lines * line_height_px

        # Add letter spacing if specified
        if letter_spacing > 0:
            max_chars = max(len(line) for line in lines) if lines else 0
            max_line_width += letter_spacing * max_chars

        return (max_line_width, total_height)

    def fit_text_to_container(
        self,
        text: str,
        container_width: float,
        container_height: float,
        font_family: str = 'Inter',
        padding_x: float = 10,
        padding_y: float = 5,
        line_height: float = 1.5,  # Match frontend default (TiptapTextBlockRenderer.tsx:51)
        letter_spacing: float = 0.0,
        initial_font_size: int = 96,  # Start big, shrink down
        char_width_ratio: Optional[float] = None  # Actual measured ratio from frontend
    ) -> Dict[str, Any]:
        """
        Fit text to container by detecting overflow and reducing font size.

        Args:
            text: The text content to fit
            container_width: Container width in pixels
            container_height: Container height in pixels
            font_family: Font family name
            padding_x: Horizontal padding
            padding_y: Vertical padding
            line_height: Line height multiplier
            letter_spacing: Letter spacing
            initial_font_size: Starting font size (will shrink from here)

        Returns:
            Dict with 'fontSize' and metadata about the fitting process
        """
        if not text or not text.strip():
            return {
                'fontSize': 16,
                'fits': True,
                'iterations': 0,
                'overflowed': False
            }

        # Available space after padding
        available_width = max(container_width - (padding_x * 2), 50)
        available_height = max(container_height - (padding_y * 2), 20)

        # Log if using measured ratio vs default
        if char_width_ratio is not None:
            logger.debug(f"[FONT FITTER] Using measured char width ratio {char_width_ratio:.3f} for {font_family}")
        else:
            logger.debug(f"[FONT FITTER] Using default char width ratio 0.55 for {font_family}")

        # Start from initial size and work down
        current_size = self._standardize_font_size(initial_font_size)
        min_size = STANDARD_FONT_SIZES[0]

        iterations = 0
        max_iterations = len(STANDARD_FONT_SIZES)

        # IMPROVED ALGORITHM: Binary search for better utilization
        # First, find the range where the text fits
        best_size = min_size
        best_util = 0

        for size_idx in range(len(STANDARD_FONT_SIZES) - 1, -1, -1):
            size = STANDARD_FONT_SIZES[size_idx]
            iterations += 1

            # Measure text at this size
            text_width, text_height = self._measure_text_dimensions(
                text=text,
                font_size=size,
                font_family=font_family,
                available_width=available_width,
                line_height=line_height,
                letter_spacing=letter_spacing,
                char_width_ratio=char_width_ratio
            )

            # Check if it fits - NO TOLERANCE, must fit exactly
            # Even 1px overflow is visible and breaks the layout
            width_fits = text_width <= available_width
            height_fits = text_height <= available_height

            if width_fits and height_fits:
                # Calculate utilization - aim for 85-95% to fill container well
                width_util = (text_width / available_width * 100) if available_width > 0 else 0
                height_util = (text_height / available_height * 100) if available_height > 0 else 0
                avg_util = (width_util + height_util) / 2

                # Update best size
                if avg_util > best_util:
                    best_size = size
                    best_util = avg_util

                # If we have great utilization (>80%), use it immediately
                if avg_util >= 80:
                    text_preview = text[:40] + "..." if len(text) > 40 else text
                    print(f"  ✅ FONT FIT: {size}px | \"{text_preview}\" | {container_width:.0f}x{container_height:.0f} | utilization: {width_util:.0f}%w {height_util:.0f}%h")
                    logger.debug(
                        f"[SIMPLE FONT FITTER] Fitted text to {size}px "
                        f"(container: {container_width}x{container_height}, "
                        f"text: {text_width:.1f}x{text_height:.1f}, "
                        f"iterations: {iterations})"
                    )
                    return {
                        'fontSize': size,
                        'fits': True,
                        'iterations': iterations,
                        'overflowed': False,
                        'text_dimensions': {
                            'width': text_width,
                            'height': text_height
                        },
                        'available_dimensions': {
                            'width': available_width,
                            'height': available_height
                        }
                    }

        # Use the best size found (highest utilization)
        if best_size > min_size:
            # Remeasure at best size for accurate dimensions
            text_width, text_height = self._measure_text_dimensions(
                text=text,
                font_size=best_size,
                font_family=font_family,
                available_width=available_width,
                line_height=line_height,
                letter_spacing=letter_spacing,
                char_width_ratio=char_width_ratio
            )

            text_preview = text[:40] + "..." if len(text) > 40 else text
            width_util = (text_width / available_width * 100) if available_width > 0 else 0
            height_util = (text_height / available_height * 100) if available_height > 0 else 0
            print(f"  ✅ FONT FIT: {best_size}px | \"{text_preview}\" | {container_width:.0f}x{container_height:.0f} | utilization: {width_util:.0f}%w {height_util:.0f}%h")

            return {
                'fontSize': best_size,
                'fits': True,
                'iterations': iterations,
                'overflowed': False,
                'text_dimensions': {
                    'width': text_width,
                    'height': text_height
                },
                'available_dimensions': {
                    'width': available_width,
                    'height': available_height
                }
            }

        # If we get here, even the minimum size overflows
        text_preview = text[:40] + "..." if len(text) > 40 else text
        print(f"  ⚠️  OVERFLOW: {min_size}px (min) | \"{text_preview}\" | {container_width:.0f}x{container_height:.0f} | Text too long!")
        logger.warning(
            f"[SIMPLE FONT FITTER] Text still overflows at minimum size {min_size}px "
            f"(container: {container_width}x{container_height})"
        )
        return {
            'fontSize': min_size,
            'fits': False,
            'iterations': iterations,
            'overflowed': True,
            'available_dimensions': {
                'width': available_width,
                'height': available_height
            }
        }
