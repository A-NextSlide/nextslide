import os
import logging
from PIL import ImageFont

logger = logging.getLogger(__name__)


class FontMixin:

    def get_font(self, family: str, size: int, weight: str = '400') -> ImageFont.FreeTypeFont:
        """Get font with caching"""
        cache_key = f"{family}_{size}_{weight}"
        
        if cache_key in self._font_cache:
            return self._font_cache[cache_key]
        
        # Try to find the font
        font_path = self.default_font_path
        
        if family in self.font_paths:
            for path in self.font_paths[family]:
                if '*' in path:
                    # Handle wildcards
                    import glob
                    matches = glob.glob(path)
                    if matches:
                        # Try to find best weight match
                        for match in matches:
                            if weight in ['700', '800', '900', 'bold'] and 'Bold' in match:
                                font_path = match
                                break
                            elif weight in ['300', '400', '500', 'normal'] and 'Regular' in match:
                                font_path = match
                                break
                        else:
                            font_path = matches[0]  # Use first match
                        break
                elif os.path.exists(path):
                    font_path = path
                    break
        
        try:
            font = ImageFont.truetype(font_path, size)
            self._font_cache[cache_key] = font
            return font
        except Exception as e:
            logger.warning(f"Failed to load font {family}: {e}, using default")
            font = ImageFont.load_default()
            self._font_cache[cache_key] = font
            return font

    def _parse_font_size(self, font_size_value: Any) -> int:
        """Parse font size value, handling strings with 'px' suffix"""
        if isinstance(font_size_value, str):
            # Remove 'px' suffix if present
            if font_size_value.endswith('px'):
                font_size_value = font_size_value[:-2]
            try:
                return int(font_size_value)
            except ValueError:
                logger.warning(f"Invalid font size value: {font_size_value}, using default 48")
                return 48
        elif isinstance(font_size_value, (int, float)):
            return int(font_size_value)
        else:
            logger.warning(f"Unexpected font size type: {type(font_size_value)}, using default 48")
            return 48
