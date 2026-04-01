"""
Developer API export service.

Preferred behavior is a screenshot-backed PDF built from the actual slide HTML
via Playwright so CustomComponent decks preserve their visual design. If that
render path is unavailable, the service falls back to a deploy-safe text/image
reconstruction PDF.
"""

from __future__ import annotations

import asyncio
import base64
import io
import logging
import re
from html import unescape
from typing import Any, Awaitable, Callable, Dict, Iterable, List, Optional, Tuple

import httpx
from bs4 import BeautifulSoup
from reportlab.lib.colors import Color, HexColor, black, white
from reportlab.lib.units import inch
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.pdfgen import canvas

from services.thumbnail_dispatch import capture_slide_png_via_modal

logger = logging.getLogger(__name__)

DEFAULT_PAGE_WIDTH = 13.333 * inch
DEFAULT_ASPECT_RATIO = 16 / 9
PAGE_MARGIN = 32
TITLE_FONT = "Helvetica-Bold"
BODY_FONT = "Helvetica"
SMALL_FONT = "Helvetica"
TITLE_SIZE = 26
SUBTITLE_SIZE = 14
BODY_SIZE = 15
FOOTER_SIZE = 10
LINE_HEIGHT = 1.4
MAX_BODY_LINES = 14

_HEX_RE = re.compile(r"#([0-9a-fA-F]{3,8})")
_RGBA_RE = re.compile(
    r"rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:[\s,/]+([0-9.]+))?\s*\)",
    re.IGNORECASE,
)
_IMG_SRC_RE = re.compile(r"<img[^>]+src=[\"']([^\"']+)[\"']", re.IGNORECASE)
_TAG_TEXT_RE = re.compile(r">\s*([^<>{}][^<>{}]*)\s*<")

SlideRenderer = Callable[[str, Dict[str, Any], Dict[str, Any], Optional[Dict[str, Any]], int], Awaitable[bytes]]


def safe_pdf_filename(title: Optional[str]) -> str:
    """Create a safe download filename for a deck PDF."""
    cleaned = "".join(c if c.isalnum() or c in " _-" else "" for c in (title or "deck")).strip()
    cleaned = cleaned[:80] or "deck"
    return f"{cleaned}.pdf"


def safe_image_filename(title: Optional[str], slide_index: int = 0) -> str:
    """Create a safe download filename for a slide screenshot."""
    cleaned = "".join(c if c.isalnum() or c in " _-" else "" for c in (title or "deck")).strip()
    cleaned = cleaned[:80] or "deck"
    return f"{cleaned}-slide-{slide_index + 1}.png"


def _clean_text(value: Any) -> Optional[str]:
    if not isinstance(value, str):
        return None
    cleaned = unescape(value)
    cleaned = re.sub(r"\s+", " ", cleaned).strip()
    if not cleaned:
        return None
    if cleaned.lower().startswith(("http://", "https://", "data:")):
        return None
    if cleaned in {"return", "null", "undefined"}:
        return None
    return cleaned


def _dedupe_preserve_order(values: Iterable[str]) -> List[str]:
    seen = set()
    result: List[str] = []
    for value in values:
        if not value:
            continue
        key = value.casefold()
        if key in seen:
            continue
        seen.add(key)
        result.append(value)
    return result


def _normalize_hex(value: Optional[str], default: str = "#FFFFFF") -> str:
    if not value:
        return default

    match = _HEX_RE.search(value)
    if match:
        hex_value = match.group(1)
        if len(hex_value) == 3:
            return "#" + "".join(ch * 2 for ch in hex_value)
        if len(hex_value) >= 6:
            return "#" + hex_value[:6]

    rgba = _RGBA_RE.search(value)
    if rgba:
        r = max(0, min(255, int(rgba.group(1))))
        g = max(0, min(255, int(rgba.group(2))))
        b = max(0, min(255, int(rgba.group(3))))
        return f"#{r:02X}{g:02X}{b:02X}"

    return default


def _as_color(value: Optional[str], default: str = "#FFFFFF") -> Color:
    try:
        return HexColor(_normalize_hex(value, default))
    except Exception:
        return HexColor(default)


def _contrast_text_color(bg_hex: Optional[str]) -> Color:
    hex_value = _normalize_hex(bg_hex, "#FFFFFF").lstrip("#")
    r = int(hex_value[0:2], 16)
    g = int(hex_value[2:4], 16)
    b = int(hex_value[4:6], 16)
    luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return black if luminance > 0.65 else white


def _extract_texts_from_render(render_html: Optional[str]) -> List[str]:
    if not render_html or not isinstance(render_html, str):
        return []

    render_html = render_html.strip()
    if not render_html:
        return []

    if render_html.lower().startswith("<!doctype") or "<html" in render_html.lower():
        soup = BeautifulSoup(render_html, "html.parser")
        for tag in soup(["script", "style", "svg", "noscript"]):
            tag.decompose()
        text = soup.get_text("\n")
        return _dedupe_preserve_order(
            cleaned
            for cleaned in (_clean_text(line) for line in text.splitlines())
            if cleaned
        )

    # JSX / function-string fallback: prefer only literal text nodes between tags.
    tag_texts = [_clean_text(match) for match in _TAG_TEXT_RE.findall(render_html)]
    tag_texts = [text for text in tag_texts if text]
    if tag_texts:
        return _dedupe_preserve_order(tag_texts)

    stripped = re.sub(r"<[^>]+>", " ", render_html)
    cleaned = _clean_text(stripped)
    return [cleaned] if cleaned else []


def _extract_bg_color_from_render(render_html: Optional[str]) -> Optional[str]:
    if not render_html or not isinstance(render_html, str):
        return None
    match = re.search(
        r"background(?:-color)?\s*:\s*(#[0-9a-fA-F]{3,8}|rgba?\([^)]+\))",
        render_html,
        re.IGNORECASE,
    )
    if match:
        return _normalize_hex(match.group(1))
    return None


def _extract_image_sources_from_render(render_html: Optional[str]) -> List[str]:
    if not render_html or not isinstance(render_html, str):
        return []
    return _dedupe_preserve_order(
        src for src in _IMG_SRC_RE.findall(render_html) if src and not src.startswith("blob:")
    )


def _get_component_background(component: Dict[str, Any]) -> Optional[str]:
    props = component.get("props", {}) or {}
    for key in ("backgroundColor", "color", "fill", "background"):
        value = props.get(key)
        if isinstance(value, str):
            normalized = _normalize_hex(value, "")
            if normalized:
                return normalized
    return None


def _get_component_image_sources(component: Dict[str, Any]) -> List[str]:
    props = component.get("props", {}) or {}
    sources: List[str] = []
    for key in ("src", "url", "image", "backgroundImage", "imageUrl"):
        value = props.get(key)
        if isinstance(value, str) and value and not value.startswith("blob:"):
            sources.append(value)
    if component.get("type") == "CustomComponent":
        sources.extend(_extract_image_sources_from_render(props.get("render")))
    return _dedupe_preserve_order(sources)


def _extract_component_texts(component: Dict[str, Any]) -> List[str]:
    props = component.get("props", {}) or {}
    texts: List[str] = []

    for key in ("title", "subtitle", "text", "content", "label", "caption", "description", "body", "value"):
        cleaned = _clean_text(props.get(key))
        if cleaned:
            texts.append(cleaned)

    for key in ("texts", "items"):
        value = props.get(key)
        if isinstance(value, list):
            for item in value:
                if isinstance(item, dict):
                    for nested_key in ("text", "title", "subtitle", "label", "value", "description"):
                        cleaned = _clean_text(item.get(nested_key))
                        if cleaned:
                            texts.append(cleaned)
                else:
                    cleaned = _clean_text(item)
                    if cleaned:
                        texts.append(cleaned)

    if component.get("type") == "CustomComponent":
        texts.extend(_extract_texts_from_render(props.get("render")))

    return _dedupe_preserve_order(texts)


def _extract_slide_texts(slide: Dict[str, Any]) -> Tuple[str, Optional[str], List[str]]:
    title = _clean_text(slide.get("title")) or ""
    subtitle = _clean_text(slide.get("subtitle"))
    body: List[str] = []

    content = slide.get("content")
    if isinstance(content, list):
        for block in content:
            if isinstance(block, dict):
                cleaned = _clean_text(block.get("text"))
                if cleaned:
                    if block.get("type") == "subtitle" and not subtitle:
                        subtitle = cleaned
                    else:
                        body.append(cleaned)
            else:
                cleaned = _clean_text(block)
                if cleaned:
                    body.append(cleaned)
    elif isinstance(content, str):
        cleaned = _clean_text(content)
        if cleaned:
            body.append(cleaned)

    components = slide.get("components", []) or []
    component_texts: List[str] = []
    for component in components:
        if isinstance(component, dict):
            component_texts.extend(_extract_component_texts(component))

    component_texts = _dedupe_preserve_order(component_texts)
    if not title and component_texts:
        title = component_texts[0]
        component_texts = component_texts[1:]

    for text in component_texts:
        if text != title and text != subtitle:
            body.append(text)

    body = _dedupe_preserve_order(body)
    if not title:
        title = f"Slide {slide.get('index', 0) + 1}"

    return title, subtitle, body


def _extract_slide_background(slide: Dict[str, Any]) -> str:
    for component in slide.get("components", []) or []:
        if isinstance(component, dict) and component.get("type") == "Background":
            bg = _get_component_background(component)
            if bg:
                return bg

    for component in slide.get("components", []) or []:
        if not isinstance(component, dict):
            continue
        if component.get("type") == "CustomComponent":
            bg = _extract_bg_color_from_render((component.get("props", {}) or {}).get("render"))
            if bg:
                return bg

    return "#FFFFFF"


def _extract_slide_images(slide: Dict[str, Any]) -> List[str]:
    sources: List[str] = []
    for component in slide.get("components", []) or []:
        if isinstance(component, dict):
            sources.extend(_get_component_image_sources(component))
    return _dedupe_preserve_order(sources)


def _wrap_lines(text: str, font_name: str, font_size: int, max_width: float) -> List[str]:
    words = text.split()
    if not words:
        return []

    lines: List[str] = []
    current = words[0]
    for word in words[1:]:
        candidate = f"{current} {word}"
        if stringWidth(candidate, font_name, font_size) <= max_width:
            current = candidate
        else:
            lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


async def _load_image_reader(
    sources: List[str],
    client: httpx.AsyncClient,
    cache: Dict[str, Optional[ImageReader]],
) -> Optional[ImageReader]:
    for source in sources:
        if source in cache:
            if cache[source] is not None:
                return cache[source]
            continue

        try:
            reader: Optional[ImageReader] = None
            if source.startswith("data:image/") and "," in source:
                _, encoded = source.split(",", 1)
                reader = ImageReader(io.BytesIO(base64.b64decode(encoded)))
            elif source.startswith("http://") or source.startswith("https://"):
                response = await client.get(source, timeout=8.0, follow_redirects=True)
                if response.status_code == 200:
                    reader = ImageReader(io.BytesIO(response.content))
            cache[source] = reader
            if reader is not None:
                return reader
        except Exception as exc:
            logger.debug("Skipping PDF image source %s: %s", source[:120], exc)
            cache[source] = None

    return None


def _draw_text_block(
    c: canvas.Canvas,
    lines: List[str],
    x: float,
    y: float,
    max_width: float,
    text_color: Color,
) -> None:
    c.setFillColor(text_color)
    c.setFont(BODY_FONT, BODY_SIZE)

    cursor_y = y
    rendered_lines = 0
    for entry in lines:
        wrapped = _wrap_lines(entry, BODY_FONT, BODY_SIZE, max_width - 18)
        if not wrapped:
            continue
        first = True
        for line in wrapped:
            if rendered_lines >= MAX_BODY_LINES:
                return
            prefix = "• " if first else "  "
            c.drawString(x, cursor_y, f"{prefix}{line}")
            cursor_y -= BODY_SIZE * LINE_HEIGHT
            rendered_lines += 1
            first = False
            cursor_y -= 4


def _get_deck_slides(deck: Dict[str, Any]) -> List[Dict[str, Any]]:
    slides = deck.get("slides") or []
    if not isinstance(slides, list) or not slides:
        raise ValueError("Deck does not contain any slides")
    return [slide if isinstance(slide, dict) else {} for slide in slides]


def _get_deck_render_context(deck: Dict[str, Any]) -> Tuple[str, str, List[Dict[str, Any]], Dict[str, Any], float, Optional[Dict[str, Any]]]:
    slides = _get_deck_slides(deck)
    deck_title = _clean_text(deck.get("name")) or _clean_text(deck.get("title")) or "NextSlide Deck"
    deck_uuid = str(deck.get("uuid") or deck.get("id") or "deck-export")

    size = deck.get("size") or {}
    width = size.get("width") or 1920
    height = size.get("height") or 1080
    aspect_ratio = width / height if width and height else DEFAULT_ASPECT_RATIO

    theme_data = None
    deck_data = deck.get("data")
    if isinstance(deck_data, dict):
        theme_data = deck_data.get("theme")

    if not isinstance(theme_data, dict):
        notes = deck.get("notes")
        if isinstance(notes, dict) and isinstance(notes.get("theme"), dict):
            theme_data = notes.get("theme")
        elif isinstance(deck.get("theme"), dict):
            theme_data = deck.get("theme")
        else:
            theme_data = None

    return deck_uuid, deck_title, slides, size, aspect_ratio, theme_data


async def _render_slide_png(
    deck_uuid: str,
    slide_data: Dict[str, Any],
    slide_size: Dict[str, Any],
    theme_data: Optional[Dict[str, Any]],
    slide_index: int,
) -> bytes:
    png_bytes = await capture_slide_png_via_modal(
        deck_uuid=deck_uuid,
        slide_data=slide_data,
        slide_size=slide_size,
        theme_data=theme_data,
        slide_index=slide_index,
    )
    if not png_bytes:
        raise RuntimeError(f"PNG render returned no data for slide {slide_index + 1}")
    return png_bytes


async def generate_slide_png(
    deck: Dict[str, Any],
    slide_index: int = 0,
    slide_renderer: Optional[SlideRenderer] = None,
) -> bytes:
    """Render a single deck slide to PNG bytes using the real slide HTML."""
    deck_uuid, _, slides, size, _, theme_data = _get_deck_render_context(deck)
    if slide_index < 0 or slide_index >= len(slides):
        raise ValueError(f"Slide index {slide_index} is out of range for deck with {len(slides)} slides")

    renderer = slide_renderer or _render_slide_png
    return await renderer(deck_uuid, slides[slide_index], size, theme_data, slide_index)


def _build_pdf_from_slide_images(
    deck_title: str,
    slide_images: List[bytes],
    aspect_ratio: float,
) -> bytes:
    page_width = DEFAULT_PAGE_WIDTH
    page_height = page_width / aspect_ratio

    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=(page_width, page_height))
    pdf.setAuthor("NextSlide AI")
    pdf.setTitle(deck_title)
    pdf.setSubject("Presentation PDF export")

    for png_bytes in slide_images:
        image_reader = ImageReader(io.BytesIO(png_bytes))
        pdf.drawImage(
            image_reader,
            0,
            0,
            width=page_width,
            height=page_height,
            preserveAspectRatio=True,
            anchor="c",
            mask="auto",
        )
        pdf.showPage()

    pdf.save()
    pdf_bytes = output.getvalue()
    output.close()
    return pdf_bytes


async def _generate_screenshot_pdf(
    deck: Dict[str, Any],
    slide_renderer: Optional[SlideRenderer] = None,
) -> bytes:
    deck_uuid, deck_title, slides, size, aspect_ratio, theme_data = _get_deck_render_context(deck)
    renderer = slide_renderer or _render_slide_png

    semaphore = asyncio.Semaphore(4)

    async def _render(index: int, slide: Dict[str, Any]) -> bytes:
        async with semaphore:
            return await renderer(deck_uuid, slide, size, theme_data, index)

    slide_images = await asyncio.gather(
        *(_render(index, slide) for index, slide in enumerate(slides))
    )
    pdf_bytes = _build_pdf_from_slide_images(deck_title, slide_images, aspect_ratio)
    logger.info(
        "Generated screenshot-backed deck PDF for '%s' with %d slides (%d bytes)",
        deck_title,
        len(slides),
        len(pdf_bytes),
    )
    return pdf_bytes


async def _generate_deck_pdf_legacy(deck: Dict[str, Any]) -> bytes:
    """
    Generate a landscape PDF for a stored deck payload.

    The deck is expected to follow the same shape returned by the public deck
    endpoints: top-level name/title, slides, and optional size metadata.
    """
    slides = deck.get("slides") or []
    if not isinstance(slides, list) or not slides:
        raise ValueError("Deck does not contain any slides")

    deck_title = _clean_text(deck.get("name")) or _clean_text(deck.get("title")) or "NextSlide Deck"
    size = deck.get("size") or {}
    width = size.get("width") or 1920
    height = size.get("height") or 1080
    aspect_ratio = width / height if width and height else DEFAULT_ASPECT_RATIO

    page_width = DEFAULT_PAGE_WIDTH
    page_height = page_width / aspect_ratio

    output = io.BytesIO()
    pdf = canvas.Canvas(output, pagesize=(page_width, page_height))
    pdf.setAuthor("NextSlide AI")
    pdf.setTitle(deck_title)
    pdf.setSubject("Presentation PDF export")

    image_cache: Dict[str, Optional[ImageReader]] = {}

    async with httpx.AsyncClient() as client:
        for index, raw_slide in enumerate(slides):
            slide = raw_slide if isinstance(raw_slide, dict) else {}
            slide["index"] = index

            title, subtitle, body_lines = _extract_slide_texts(slide)
            background_hex = _extract_slide_background(slide)
            background_color = _as_color(background_hex, "#FFFFFF")
            text_color = _contrast_text_color(background_hex)
            image_reader = await _load_image_reader(_extract_slide_images(slide), client, image_cache)

            pdf.setFillColor(background_color)
            pdf.rect(0, 0, page_width, page_height, fill=True, stroke=False)

            pdf.setFillColor(Color(text_color.red, text_color.green, text_color.blue, alpha=0.35))
            pdf.setFont(SMALL_FONT, FOOTER_SIZE)
            pdf.drawRightString(page_width - PAGE_MARGIN, page_height - PAGE_MARGIN + 4, f"{index + 1}/{len(slides)}")

            image_width = 0.0
            image_height = 0.0
            image_x = page_width - PAGE_MARGIN
            image_y = PAGE_MARGIN
            if image_reader is not None:
                max_image_width = max(120.0, page_width * 0.34)
                max_image_height = page_height - (PAGE_MARGIN * 2) - 40
                img_w, img_h = image_reader.getSize()
                scale = min(max_image_width / img_w, max_image_height / img_h)
                image_width = img_w * scale
                image_height = img_h * scale
                image_x = page_width - PAGE_MARGIN - image_width
                image_y = max(PAGE_MARGIN, (page_height - image_height) / 2)

                pdf.setFillColor(Color(1, 1, 1, alpha=0.24) if text_color == white else Color(0, 0, 0, alpha=0.08))
                pdf.roundRect(image_x - 10, image_y - 10, image_width + 20, image_height + 20, 12, fill=True, stroke=False)
                try:
                    pdf.drawImage(
                        image_reader,
                        image_x,
                        image_y,
                        width=image_width,
                        height=image_height,
                        preserveAspectRatio=True,
                        anchor="c",
                        mask="auto",
                    )
                except Exception as exc:
                    logger.debug("Skipping PDF image draw on slide %d: %s", index + 1, exc)
                    image_reader = None

            text_right = image_x - 26 if image_reader is not None else page_width - PAGE_MARGIN
            text_width = max(220.0, text_right - PAGE_MARGIN)
            title_y = page_height - PAGE_MARGIN - 28

            pdf.setFillColor(text_color)
            pdf.setFont(TITLE_FONT, TITLE_SIZE)
            title_lines = _wrap_lines(title, TITLE_FONT, TITLE_SIZE, text_width)
            for line in title_lines[:3]:
                pdf.drawString(PAGE_MARGIN, title_y, line)
                title_y -= TITLE_SIZE * 1.15

            pdf.setStrokeColor(Color(text_color.red, text_color.green, text_color.blue, alpha=0.22))
            pdf.setLineWidth(1)
            pdf.line(PAGE_MARGIN, title_y - 4, text_right, title_y - 4)
            title_y -= 20

            if subtitle:
                pdf.setFillColor(Color(text_color.red, text_color.green, text_color.blue, alpha=0.78))
                pdf.setFont(BODY_FONT, SUBTITLE_SIZE)
                subtitle_lines = _wrap_lines(subtitle, BODY_FONT, SUBTITLE_SIZE, text_width)
                for line in subtitle_lines[:3]:
                    pdf.drawString(PAGE_MARGIN, title_y, line)
                    title_y -= SUBTITLE_SIZE * 1.3
                title_y -= 8

            _draw_text_block(
                pdf,
                body_lines,
                PAGE_MARGIN,
                title_y,
                text_width,
                text_color,
            )

            pdf.showPage()

    pdf.save()
    pdf_bytes = output.getvalue()
    output.close()

    logger.info(
        "Generated legacy deck PDF for '%s' with %d slides (%d bytes)",
        deck_title,
        len(slides),
        len(pdf_bytes),
    )
    return pdf_bytes


async def generate_deck_pdf(
    deck: Dict[str, Any],
    slide_renderer: Optional[SlideRenderer] = None,
) -> bytes:
    """
    Generate a PDF for a stored deck payload.

    Preferred path is screenshot-backed rendering using the actual slide HTML
    so CustomComponent decks preserve their visual design. If that render path
    fails, a legacy text/image reconstruction fallback is still returned.
    """
    try:
        return await _generate_screenshot_pdf(deck, slide_renderer=slide_renderer)
    except Exception as exc:
        logger.warning(
            "Screenshot-backed PDF generation failed, falling back to legacy layout: %s",
            exc,
            exc_info=True,
        )
        return await _generate_deck_pdf_legacy(deck)
