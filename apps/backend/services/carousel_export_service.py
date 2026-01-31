"""
LinkedIn Carousel Export Service

Generates a PDF optimized for LinkedIn carousel format.
Supports Square (1080x1080) and Portrait (1080x1350) dimensions.
Uses reportlab for PDF generation.
"""

import io
import logging
import math
import re
import textwrap
from typing import List, Dict, Any, Optional, Literal

import httpx
from reportlab.lib.pagesizes import landscape
from reportlab.lib.units import mm
from reportlab.lib.colors import HexColor, white, black, Color
from reportlab.pdfgen import canvas
from reportlab.lib.utils import ImageReader

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

# Carousel format dimensions (in points, 1pt = 1/72 inch)
# We use mm for clarity, then convert

FORMATS: Dict[str, Dict[str, float]] = {
    "square": {
        "width": 1080,   # pixels
        "height": 1080,
        "width_pt": 270 * mm,   # ~1080px at 96dpi -> 285.75mm, we use 270mm for clean PDF
        "height_pt": 270 * mm,
    },
    "portrait": {
        "width": 1080,
        "height": 1350,
        "width_pt": 270 * mm,
        "height_pt": 337.5 * mm,
    },
}

# Typography
TITLE_FONT_SIZE = 36
BODY_FONT_SIZE = 24
BULLET_FONT_SIZE = 22
BRANDING_FONT_SIZE = 14
SLIDE_NUMBER_FONT_SIZE = 12

# Spacing
MARGIN = 40  # points
TITLE_TOP_OFFSET = 0.18  # fraction of page height from top
BODY_TOP_OFFSET = 0.35   # fraction of page height from top
LINE_SPACING = 1.5

# Branding text
BRANDING_TEXT = "Made with NextSlide AI"
BRANDING_URL = "https://nextslide.ai"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _hex_to_color(hex_str: Optional[str]) -> Color:
    """Convert a hex colour string to a reportlab Color. Falls back to dark grey."""
    if not hex_str:
        return HexColor("#1a1a2e")
    try:
        cleaned = hex_str.strip()
        if not cleaned.startswith("#"):
            cleaned = f"#{cleaned}"
        return HexColor(cleaned)
    except Exception:
        return HexColor("#1a1a2e")


def _contrast_text_color(bg_hex: Optional[str]) -> Color:
    """Return white or black depending on background luminance."""
    if not bg_hex:
        return white
    try:
        cleaned = bg_hex.strip().lstrip("#")
        if len(cleaned) == 3:
            cleaned = "".join(c * 2 for c in cleaned)
        r, g, b = int(cleaned[0:2], 16), int(cleaned[2:4], 16), int(cleaned[4:6], 16)
        luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
        return black if luminance > 0.6 else white
    except Exception:
        return white


def _parse_content_to_bullets(content: Optional[str]) -> List[str]:
    """Parse slide content into bullet points."""
    if not content:
        return []

    bullets = []
    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue
        # Strip markdown-style bullets
        line = re.sub(r"^[-*+]\s*", "", line)
        # Strip numbered list prefixes
        line = re.sub(r"^\d+[.)]\s*", "", line)
        line = line.strip()
        if line:
            bullets.append(line)
    return bullets


def _wrap_text(text: str, max_chars: int) -> List[str]:
    """Wrap a text string into lines of at most max_chars."""
    return textwrap.wrap(text, width=max_chars) or [text]


async def _download_image(url: str) -> Optional[ImageReader]:
    """Download an image from a URL and return an ImageReader, or None on failure."""
    try:
        async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
            resp = await client.get(url)
            if resp.status_code == 200:
                return ImageReader(io.BytesIO(resp.content))
    except Exception as e:
        logger.warning(f"Failed to download image for carousel: {e}")
    return None


# ---------------------------------------------------------------------------
# PDF Generation
# ---------------------------------------------------------------------------

async def generate_carousel_pdf(
    slides: List[Dict[str, Any]],
    title: str,
    format_type: Literal["square", "portrait"] = "square",
    add_branding: bool = True,
) -> bytes:
    """
    Generate a LinkedIn carousel PDF from slide data.

    Args:
        slides: List of slide dicts with keys like title, content,
                backgroundColor, backgroundImage, etc.
        title: Deck title (used as PDF metadata).
        format_type: 'square' (1080x1080) or 'portrait' (1080x1350).
        add_branding: If True, last slide gets "Made with NextSlide AI" watermark.

    Returns:
        PDF bytes.
    """
    fmt = FORMATS.get(format_type, FORMATS["square"])
    page_w = fmt["width_pt"]
    page_h = fmt["height_pt"]

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(page_w, page_h))
    c.setTitle(title)
    c.setAuthor("NextSlide AI")
    c.setSubject("LinkedIn Carousel")

    total_slides = len(slides)

    for idx, slide in enumerate(slides):
        is_last = idx == total_slides - 1

        # --- Background ---
        bg_color_hex = slide.get("backgroundColor") or slide.get("background_color") or "#1a1a2e"
        bg_color = _hex_to_color(bg_color_hex)
        text_color = _contrast_text_color(bg_color_hex)

        # Fill background
        c.setFillColor(bg_color)
        c.rect(0, 0, page_w, page_h, fill=True, stroke=False)

        # Background image (if provided)
        bg_image_url = slide.get("backgroundImage") or slide.get("background_image")
        if bg_image_url:
            img = await _download_image(bg_image_url)
            if img:
                try:
                    c.drawImage(
                        img, 0, 0, width=page_w, height=page_h,
                        preserveAspectRatio=True, anchor="c",
                        mask="auto",
                    )
                    # Add a semi-transparent overlay for text readability
                    c.setFillColor(Color(0, 0, 0, alpha=0.45))
                    c.rect(0, 0, page_w, page_h, fill=True, stroke=False)
                    text_color = white
                except Exception as e:
                    logger.warning(f"Failed to draw background image on slide {idx}: {e}")

        # --- Slide number ---
        c.setFillColor(Color(
            text_color.red, text_color.green, text_color.blue, alpha=0.4,
        ))
        c.setFont("Helvetica", SLIDE_NUMBER_FONT_SIZE)
        c.drawRightString(page_w - MARGIN, page_h - MARGIN, f"{idx + 1}/{total_slides}")

        # --- Title ---
        slide_title = slide.get("title") or ""
        if slide_title:
            c.setFillColor(text_color)
            c.setFont("Helvetica-Bold", TITLE_FONT_SIZE)

            title_y = page_h - (page_h * TITLE_TOP_OFFSET)
            max_title_chars = int((page_w - 2 * MARGIN) / (TITLE_FONT_SIZE * 0.52))
            title_lines = _wrap_text(slide_title, max_title_chars)

            for i, line in enumerate(title_lines[:3]):  # max 3 lines for title
                c.drawCentredString(
                    page_w / 2,
                    title_y - i * (TITLE_FONT_SIZE * LINE_SPACING),
                    line,
                )

        # --- Content / Bullets ---
        content = slide.get("content") or slide.get("body") or ""
        bullets = _parse_content_to_bullets(content)

        if bullets:
            c.setFont("Helvetica", BODY_FONT_SIZE)
            c.setFillColor(text_color)

            body_y = page_h - (page_h * BODY_TOP_OFFSET)
            max_body_chars = int((page_w - 2 * MARGIN - 30) / (BODY_FONT_SIZE * 0.52))
            available_height = body_y - MARGIN - (80 if (add_branding and is_last) else 20)
            line_height = BODY_FONT_SIZE * LINE_SPACING
            max_lines = int(available_height / line_height)
            line_count = 0

            for bullet in bullets:
                if line_count >= max_lines:
                    break
                wrapped = _wrap_text(bullet, max_body_chars)
                for j, wline in enumerate(wrapped):
                    if line_count >= max_lines:
                        break
                    x = MARGIN + 30
                    y = body_y - line_count * line_height
                    prefix = "\u2022  " if j == 0 else "   "
                    c.drawString(x, y, f"{prefix}{wline}")
                    line_count += 1
                # Small gap between bullets
                line_count += 0.3

        # --- Branding on last slide ---
        if add_branding and is_last:
            c.setFillColor(Color(
                text_color.red, text_color.green, text_color.blue, alpha=0.6,
            ))
            c.setFont("Helvetica-Oblique", BRANDING_FONT_SIZE)
            c.drawCentredString(page_w / 2, MARGIN + 20, BRANDING_TEXT)
            c.setFont("Helvetica", BRANDING_FONT_SIZE - 2)
            c.drawCentredString(page_w / 2, MARGIN + 4, BRANDING_URL)

        c.showPage()

    c.save()
    pdf_bytes = buf.getvalue()
    buf.close()

    logger.info(
        f"Generated carousel PDF: {len(slides)} slides, "
        f"format={format_type}, size={len(pdf_bytes)} bytes"
    )
    return pdf_bytes
