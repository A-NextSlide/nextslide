"""
Chroma key utilities: convert a solid background color to transparency.

We assume AI-generated assets for overlay come with a perfectly flat
background color (e.g., #00FD00). We then replace that color with full
transparency. Tolerance is included to account for minor compression artifacts.
"""

from __future__ import annotations

from typing import Tuple
from PIL import Image


def _hex_to_rgb(hex_color: str) -> Tuple[int, int, int]:
    s = hex_color.strip().lstrip('#')
    if len(s) == 3:
        s = ''.join([c * 2 for c in s])
    r = int(s[0:2], 16)
    g = int(s[2:4], 16)
    b = int(s[4:6], 16)
    return r, g, b


def chroma_key(image: Image.Image, color_hex: str, tolerance: int = 6) -> Image.Image:
    """Return a copy of the image with color_hex made fully transparent.

    Args:
        image: PIL Image (RGB or RGBA)
        color_hex: e.g., "#00FD00"
        tolerance: per-channel tolerance (0–255)
    """
    if image.mode not in ("RGB", "RGBA"):
        image = image.convert("RGBA")
    else:
        image = image.copy()

    r_key, g_key, b_key = _hex_to_rgb(color_hex)

    pixels = image.load()
    width, height = image.size

    for y in range(height):
        for x in range(width):
            if image.mode == "RGBA":
                r, g, b, a = pixels[x, y]
            else:
                r, g, b = pixels[x, y]
                a = 255

            if (
                abs(r - r_key) <= tolerance and
                abs(g - g_key) <= tolerance and
                abs(b - b_key) <= tolerance
            ):
                pixels[x, y] = (r, g, b, 0)
            else:
                pixels[x, y] = (r, g, b, a)

    return image


