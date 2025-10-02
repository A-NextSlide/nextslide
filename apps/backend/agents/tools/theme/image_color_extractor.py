"""Image color extraction tool for extracting colors from logos and brand images."""

import io
import logging
from typing import List, Dict, Any, Optional, Tuple
from urllib.parse import urlparse
import aiohttp
from PIL import Image

from collections import Counter

logger = logging.getLogger(__name__)


class ImageColorExtractor:
    """Extract dominant colors from images, particularly brand logos."""
    
    def __init__(self):
        self.session = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        self.session = aiohttp.ClientSession()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    async def extract_colors_from_url(
        self,
        image_url: str,
        num_colors: int = 5,
        exclude_background: bool = True
    ) -> Dict[str, Any]:
        """
        Extract dominant colors from an image URL.
        
        Args:
            image_url: URL of the image to analyze
            num_colors: Number of dominant colors to extract
            exclude_background: Whether to try to exclude background colors
            
        Returns:
            Dictionary containing extracted colors and metadata
        """
        try:
            # Download image
            image_data = await self._download_image(image_url)
            if not image_data:
                return {"error": "Failed to download image", "colors": []}
            
            # Extract colors
            colors = await self._extract_colors(
                image_data,
                num_colors=num_colors,
                exclude_background=exclude_background
            )
            
            return {
                "source": "image_extraction",
                "image_url": image_url,
                "colors": colors,
                "num_colors": len(colors)
            }
            
        except Exception as e:
            logger.error(f"Error extracting colors from {image_url}: {e}")
            return {"error": str(e), "colors": []}
    
    async def extract_colors_from_logo_search(
        self,
        brand_name: str,
        num_colors: int = 5
    ) -> Dict[str, Any]:
        """
        Search for a brand logo and extract colors from it.
        
        Args:
            brand_name: Name of the brand
            num_colors: Number of colors to extract
            
        Returns:
            Dictionary containing extracted colors and metadata
        """
        try:
            # Search for logo using image search
            # For now, we'll construct common logo URL patterns
            logo_urls = self._generate_logo_urls(brand_name)
            
            for url in logo_urls:
                result = await self.extract_colors_from_url(
                    url,
                    num_colors=num_colors,
                    exclude_background=True
                )
                
                if result.get("colors"):
                    result["brand_name"] = brand_name
                    return result
            
            return {
                "error": f"No logo found for {brand_name}",
                "colors": [],
                "brand_name": brand_name
            }
            
        except Exception as e:
            logger.error(f"Error searching logo for {brand_name}: {e}")
            return {"error": str(e), "colors": [], "brand_name": brand_name}
    
    async def _download_image(self, url: str) -> Optional[bytes]:
        """Download image from URL."""
        try:
            if not self.session:
                self.session = aiohttp.ClientSession()
                
            async with self.session.get(url, timeout=10) as response:
                if response.status == 200:
                    return await response.read()
                logger.warning(f"Failed to download image: {response.status}")
                return None
                
        except Exception as e:
            logger.error(f"Error downloading image: {e}")
            return None
    
    async def _extract_colors(
        self,
        image_data: bytes,
        num_colors: int = 5,
        exclude_background: bool = True
    ) -> List[str]:
        """
        Extract dominant colors from image data.
        
        Uses PIL's quantization and color palette extraction.
        """
        try:
            # Open image
            image = Image.open(io.BytesIO(image_data))
            
            # Convert to RGB if necessary
            if image.mode != 'RGB':
                if image.mode == 'RGBA':
                    # Handle transparency
                    background = Image.new('RGB', image.size, (255, 255, 255))
                    background.paste(image, mask=image.split()[3])
                    image = background
                else:
                    image = image.convert('RGB')
            
            # Resize for faster processing
            image.thumbnail((200, 200))
            
            # Use PIL's quantize to reduce colors
            quantized = image.quantize(colors=num_colors * 2 if exclude_background else num_colors)
            
            # Get the color palette
            palette = quantized.getpalette()
            if not palette:
                return []
            
            # Count color occurrences
            color_counts = Counter()
            for pixel in quantized.getdata():
                color_counts[pixel] += 1
            
            # Extract RGB values from palette
            colors_with_counts = []
            for color_index, count in color_counts.most_common():
                # Get RGB values from palette
                rgb = tuple(palette[color_index * 3:(color_index + 1) * 3])
                colors_with_counts.append((rgb, count))
            
            # Sort by frequency
            colors_with_counts.sort(key=lambda x: x[1], reverse=True)
            
            # Convert to hex and filter
            hex_colors = []
            for rgb, count in colors_with_counts:
                hex_color = self._rgb_to_hex(rgb)
                
                # Skip if too close to white/black/gray (likely background)
                if exclude_background and self._is_background_color(hex_color):
                    continue
                    
                hex_colors.append(hex_color)
                
                if len(hex_colors) >= num_colors:
                    break
            
            # If we don't have enough colors after filtering, use simple color extraction
            if len(hex_colors) < num_colors:
                hex_colors.extend(self._extract_top_colors(image, num_colors - len(hex_colors), hex_colors))
            
            return hex_colors[:num_colors]
            
        except Exception as e:
            logger.error(f"Error extracting colors from image: {e}")
            return []
    
    def _extract_top_colors(
        self,
        image: Image.Image,
        num_needed: int,
        existing_colors: List[str]
    ) -> List[str]:
        """
        Extract additional colors using a simple histogram approach.
        """
        try:
            # Get color data
            pixels = list(image.getdata())
            color_counter = Counter(pixels)
            
            # Get most common colors
            additional_colors = []
            for rgb, count in color_counter.most_common(50):  # Check top 50 colors
                hex_color = self._rgb_to_hex(rgb)
                
                # Skip if already in list or too similar to existing
                if hex_color in existing_colors:
                    continue
                    
                # Skip background colors
                if self._is_background_color(hex_color):
                    continue
                    
                # Check if too similar to existing colors
                too_similar = False
                for existing in existing_colors + additional_colors:
                    if self._colors_similar(hex_color, existing, threshold=40):
                        too_similar = True
                        break
                        
                if not too_similar:
                    additional_colors.append(hex_color)
                    
                if len(additional_colors) >= num_needed:
                    break
                    
            return additional_colors
            
        except Exception:
            return []
    

    
    def _rgb_to_hex(self, rgb: Tuple[int, int, int]) -> str:
        """Convert RGB to hex color."""
        return f"#{int(rgb[0]):02x}{int(rgb[1]):02x}{int(rgb[2]):02x}"
    
    def _hex_to_rgb(self, hex_color: str) -> Tuple[int, int, int]:
        """Convert hex to RGB."""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    def _is_background_color(self, hex_color: str) -> bool:
        """Check if color is likely a background color."""
        rgb = self._hex_to_rgb(hex_color)
        
        # Check if too close to white
        if all(c > 240 for c in rgb):
            return True
            
        # Check if too close to black
        if all(c < 20 for c in rgb):
            return True
            
        # Check if gray (similar R, G, B values)
        if max(rgb) - min(rgb) < 20:
            # It's grayish, check if it's too light or dark
            avg = sum(rgb) / 3
            if avg > 230 or avg < 30:
                return True
                
        return False
    
    def _colors_similar(
        self,
        color1: str,
        color2: str,
        threshold: int = 30
    ) -> bool:
        """Check if two colors are similar within a threshold."""
        rgb1 = self._hex_to_rgb(color1)
        rgb2 = self._hex_to_rgb(color2)
        
        # Calculate Euclidean distance
        distance = sum((c1 - c2) ** 2 for c1, c2 in zip(rgb1, rgb2)) ** 0.5
        
        return distance < threshold
    
    def _generate_logo_urls(self, brand_name: str) -> List[str]:
        """
        Generate potential logo URLs for a brand.
        
        This is a simple heuristic approach. In production, you'd want to use
        a proper image search API.
        """
        # Clean brand name
        clean_name = brand_name.lower().replace(' ', '').replace('-', '')
        
        # Common logo URL patterns
        patterns = [
            f"https://logo.clearbit.com/{clean_name}.com",
            f"https://logo.clearbit.com/{clean_name}.io",
            f"https://logo.clearbit.com/{clean_name}.co",
            f"https://www.{clean_name}.com/logo.png",
            f"https://www.{clean_name}.com/logo.svg",
            f"https://cdn.{clean_name}.com/logo.png",
        ]
        
        return patterns


# Utility functions for external use
async def extract_logo_colors(
    brand_name: str,
    image_url: Optional[str] = None,
    num_colors: int = 5
) -> Dict[str, Any]:
    """
    Extract colors from a brand logo.
    
    Args:
        brand_name: Name of the brand
        image_url: Optional direct URL to logo image
        num_colors: Number of colors to extract
        
    Returns:
        Dictionary with extracted colors
    """
    async with ImageColorExtractor() as extractor:
        if image_url:
            return await extractor.extract_colors_from_url(
                image_url,
                num_colors=num_colors,
                exclude_background=True
            )
        else:
            return await extractor.extract_colors_from_logo_search(
                brand_name,
                num_colors=num_colors
            )
