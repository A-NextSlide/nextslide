"""
Server-side slide thumbnail renderer using Playwright + Chromium.

Renders the first slide of a deck as a PNG screenshot and uploads it to
Supabase Storage. Used by Modal serverless functions and local fallback.
"""

import logging
import os
import re
from datetime import datetime, timezone
from typing import Optional, Set
from urllib.parse import quote

logger = logging.getLogger(__name__)

THUMBNAIL_WIDTH = 1920
THUMBNAIL_HEIGHT = 1080
THUMBNAIL_BUCKET = "thumbnails"

_bucket_verified = False

# ---------------------------------------------------------------------------
# Font registry – mirrors apps/frontend/src/registry/library/fonts.ts
# Any font NOT in FONTSHARE_FONTS / CDN_FONTS / SYSTEM_FONTS is assumed
# to be a Google Font (the vast majority).
# ---------------------------------------------------------------------------

FONTSHARE_FONTS: Set[str] = {
    "Satoshi", "Cabinet Grotesk", "General Sans", "Clash Display",
    "Switzer", "Ranade", "Panchang", "Melodrama", "Erode", "Sentient",
    "Synonym", "Supreme", "Array", "Bonny", "Pilcrow Rounded", "Britney",
    "Chillax", "Boska", "Gambarino", "Author", "Bespoke Serif",
    "Stardom", "Nippo", "Zodiak", "Khand", "Telma", "Plein", "Sharpie",
    "Tanker", "Wremena", "Kola", "Roobert", "Azeret", "Hoover",
}

CDN_FONTS: dict = {
    "Geist": "https://geistfont.vercel.app/geist.css",
}

SYSTEM_FONTS: Set[str] = {
    "Arial", "Helvetica", "Times New Roman", "Courier New", "Georgia",
    "Verdana", "Impact", "Tahoma", "Trebuchet MS", "Comic Sans MS",
    "HK Grotesk Wide",
}

GENERIC_CSS_FAMILIES: Set[str] = {
    "system-ui", "sans-serif", "serif", "monospace", "cursive",
    "inherit", "initial", "unset", "default", "auto",
    "-apple-system", "BlinkMacSystemFont", "Segoe UI",
}

# Pre-compute lowercase sets for case-insensitive lookups
_SYSTEM_LOWER = {f.lower() for f in SYSTEM_FONTS}
_GENERIC_LOWER = {f.lower() for f in GENERIC_CSS_FAMILIES}
_FONTSHARE_LOOKUP = {f.lower(): f for f in FONTSHARE_FONTS}
_CDN_LOOKUP = {f.lower(): f for f in CDN_FONTS}

# Regex to extract font-family values from inline CSS
_FONT_FAMILY_RE = re.compile(r'font-family\s*:\s*([^;"}]+)[;"}]', re.IGNORECASE)

# Regex to find url() values with embedded newlines (invalid CSS that breaks parsers)
_CSS_URL_RE = re.compile(r'url\s*\(([^)]*)\)', re.DOTALL)


def _sanitize_css_urls(html: str) -> str:
    """Remove newlines/carriage-returns inside CSS url() values.

    Some stored HTML contains url('data:image/svg+xml;\\nutf8,...') with
    literal newlines which is invalid CSS.  The browser's CSS parser silently
    drops the entire rule *and all subsequent rules in the same <style> block*,
    causing massive layout breakage.  This function collapses those newlines
    so the CSS parses correctly.
    """
    def _fix(m: re.Match) -> str:
        inner = m.group(1)
        if "\n" in inner or "\r" in inner:
            inner = inner.replace("\r\n", "").replace("\n", "").replace("\r", "")
        return f"url({inner})"
    return _CSS_URL_RE.sub(_fix, html)


def _normalize_family(raw: str) -> str:
    """Take the first font-family token and strip quotes/whitespace."""
    family = raw.split(",")[0].strip()
    return family.strip("'\"").strip()


def _extract_fonts_from_html(html: str) -> Set[str]:
    """Extract all non-generic font-family names from CSS in HTML."""
    families: Set[str] = set()
    for match in _FONT_FAMILY_RE.finditer(html):
        raw = match.group(1)
        if not raw or "var(" in raw:
            continue
        for part in raw.split(","):
            cleaned = _normalize_family(part)
            if not cleaned:
                continue
            lower = cleaned.lower()
            if lower in _SYSTEM_LOWER or lower in _GENERIC_LOWER:
                continue
            families.add(cleaned)
    return families


def _build_font_tag(family: str) -> Optional[str]:
    """Build the appropriate <link> tag for a font family, or None if system."""
    lower = family.lower()

    if lower in _SYSTEM_LOWER or lower in _GENERIC_LOWER:
        return None

    if lower in _FONTSHARE_LOOKUP:
        canonical = _FONTSHARE_LOOKUP[lower]
        encoded = quote(canonical)
        return f'<link rel="stylesheet" href="https://api.fontshare.com/v2/css?f[]={encoded}@300,400,500,600,700,800,900&display=swap">'

    if lower in _CDN_LOOKUP:
        canonical = _CDN_LOOKUP[lower]
        url = CDN_FONTS[canonical]
        return f'<link rel="stylesheet" href="{url}">'

    # Default: Google Fonts
    encoded = quote(family)
    return f'<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family={encoded}:wght@300;400;500;600;700;800;900&display=swap">'


def _build_font_injection(html: str, theme_data: Optional[dict] = None) -> str:
    """
    Build all font <link> tags needed for the HTML.

    Extracts font-family references from the HTML itself and also
    includes theme fonts (bodyFont / heroFont / headingFont).
    """
    all_fonts: Set[str] = _extract_fonts_from_html(html)

    # Add theme fonts
    if theme_data:
        for key in ("bodyFont", "heroFont", "headingFont"):
            font = theme_data.get(key)
            if font and isinstance(font, str):
                cleaned = _normalize_family(font)
                if cleaned and cleaned.lower() not in _SYSTEM_LOWER and cleaned.lower() not in _GENERIC_LOWER:
                    all_fonts.add(cleaned)

    if not all_fonts:
        return ""

    seen_lower: Set[str] = set()
    tags: list = []
    # Preconnect to font CDNs so the browser starts TLS handshake early
    needs_google = False
    needs_fontshare = False
    for family in sorted(all_fonts):
        lower = family.lower()
        if lower in seen_lower:
            continue
        seen_lower.add(lower)
        tag = _build_font_tag(family)
        if tag:
            tags.append(tag)
            if "fonts.googleapis.com" in tag:
                needs_google = True
            elif "fontshare.com" in tag:
                needs_fontshare = True

    preconnects: list = []
    if needs_google:
        preconnects.append('<link rel="preconnect" href="https://fonts.googleapis.com">')
        preconnects.append('<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>')
    if needs_fontshare:
        preconnects.append('<link rel="preconnect" href="https://api.fontshare.com">')
        preconnects.append('<link rel="preconnect" href="https://cdn.fontshare.com" crossorigin>')

    return "\n".join(preconnects + tags)


def _extract_custom_component_html(slide_data: Optional[dict]) -> Optional[str]:
    """Extract the full HTML document from a CustomComponent render prop."""
    if not slide_data:
        return None
    components = slide_data.get("components", [])
    for comp in components:
        if comp.get("type") == "CustomComponent":
            props = comp.get("props", {})
            render_html = props.get("render")
            if render_html and isinstance(render_html, str) and "<" in render_html:
                return render_html
    return None


def build_slide_html(
    slide_data: dict,
    slide_size: Optional[dict] = None,
    theme_data: Optional[dict] = None,
) -> str:
    """
    Build a self-contained HTML document for a single slide.

    Extracts the CustomComponent render HTML (which is already a full document)
    and injects font loading tags for all referenced fonts (Google, Fontshare,
    CDN) based on font-family declarations in the HTML and the theme.
    """
    width = (slide_size or {}).get("width", THUMBNAIL_WIDTH)
    height = (slide_size or {}).get("height", THUMBNAIL_HEIGHT)

    custom_html = _extract_custom_component_html(slide_data)

    if custom_html:
        # Sanitize invalid CSS (e.g. newlines inside url() values) that would
        # break the browser's CSS parser and drop subsequent rules.
        custom_html = _sanitize_css_urls(custom_html)

        # The render prop is already a full HTML document.
        # Scan the HTML for font-family references and inject loading tags.
        font_tags = _build_font_injection(custom_html, theme_data)
        if font_tags:
            if "<head>" in custom_html:
                custom_html = custom_html.replace("<head>", f"<head>\n{font_tags}", 1)
            elif "</head>" in custom_html:
                custom_html = custom_html.replace("</head>", f"{font_tags}\n</head>", 1)
        return custom_html

    # Fallback: build a simple HTML page from text/image components
    font_tags = _build_font_injection("", theme_data)
    bg_color = (theme_data or {}).get("backgroundColor", "#1a1a2e")
    text_color = (theme_data or {}).get("textColor", "#ffffff")
    body_font = (theme_data or {}).get("bodyFont", "system-ui")

    components = slide_data.get("components", [])
    content_parts = []

    for comp in components:
        comp_type = comp.get("type", "")
        props = comp.get("props", {})

        if comp_type == "Background":
            bg = props.get("backgroundColor") or props.get("color")
            if bg:
                bg_color = bg

        elif comp_type in ("Text", "Title", "Heading"):
            text = props.get("text") or props.get("content", "")
            font_size = props.get("fontSize", "2em")
            content_parts.append(
                f'<div style="font-size:{font_size};padding:0.5em 1em;">{text}</div>'
            )

        elif comp_type == "Image":
            src = props.get("src") or props.get("url", "")
            if src:
                content_parts.append(
                    f'<img src="{src}" style="max-width:80%;max-height:60%;object-fit:contain;" />'
                )

    body_content = "\n".join(content_parts) if content_parts else (
        f'<div style="font-size:2em;">{slide_data.get("title", "")}</div>'
    )

    return f"""<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
{font_tags}
<style>
  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  body {{
    width: {width}px;
    height: {height}px;
    overflow: hidden;
    background: {bg_color};
    color: {text_color};
    font-family: {body_font}, system-ui, sans-serif;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
  }}
</style>
</head>
<body>
{body_content}
</body>
</html>"""


async def capture_slide_screenshot(
    html: str,
    width: int = THUMBNAIL_WIDTH,
    height: int = THUMBNAIL_HEIGHT,
) -> bytes:
    """
    Launch headless Chromium via Playwright, render the HTML, and capture a PNG.

    Returns the PNG bytes.
    """
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        try:
            page = await browser.new_page(viewport={"width": width, "height": height})
            await page.set_content(html, wait_until="networkidle")
            # Force-load every registered font face and block until done.
            # 1. Explicitly call .load() on every face (display:swap leaves
            #    unused weights as "unloaded" and fonts.ready resolves early).
            # 2. Wait for the network to settle again (woff2 fetches).
            # 3. Re-check fonts.ready after forced loads complete.
            # 4. Long settle for swap reflows + any late paints.
            try:
                await page.evaluate("""async () => {
                    // Force-load every registered font face.
                    // display:swap means the browser shows fallback immediately;
                    // we must explicitly trigger .load() on each face AND wait
                    // for the woff2 files to arrive before screenshotting.
                    const loads = [];
                    document.fonts.forEach(f => loads.push(f.load().catch(() => null)));
                    await Promise.all(loads);
                    await document.fonts.ready;

                    // Poll until all font faces report 'loaded' status.
                    // This catches cases where fonts.ready resolves early due
                    // to display:swap before the actual swap completes.
                    for (let i = 0; i < 20; i++) {
                        let allLoaded = true;
                        document.fonts.forEach(f => {
                            if (f.status !== 'loaded') allLoaded = false;
                        });
                        if (allLoaded) break;
                        await new Promise(r => setTimeout(r, 150));
                    }

                    // Force all CSS animations to their final frame.
                    // Elements often start at opacity:0 with animation forwards;
                    // setting a huge negative delay makes them jump to the end.
                    const style = document.createElement('style');
                    style.textContent = `
                        *, *::before, *::after {
                            animation-delay: -10s !important;
                            transition-delay: 0s !important;
                            transition-duration: 0s !important;
                        }
                    `;
                    document.head.appendChild(style);
                    // Force reflow so the browser applies the overridden animations
                    document.body.offsetHeight;
                }""")
            except Exception:
                pass
            # Wait for font swap reflows + any late paints to settle
            await page.wait_for_timeout(1500)
            png_bytes = await page.screenshot(type="png")
            return png_bytes
        finally:
            await browser.close()


async def render_and_upload_thumbnail(
    deck_uuid: str,
    slide_data: dict,
    slide_size: Optional[dict] = None,
    theme_data: Optional[dict] = None,
    slide_index: int = 0,
) -> dict:
    """
    Build HTML, capture screenshot, upload to Supabase Storage, update DB.

    Returns {"url": "...", "path": "..."} on success, None if slide_data is empty.
    """
    if not slide_data:
        logger.warning("render_and_upload_thumbnail called with empty slide_data for deck %s", deck_uuid)
        return None

    html = build_slide_html(slide_data, slide_size, theme_data)

    width = (slide_size or {}).get("width", THUMBNAIL_WIDTH)
    height = (slide_size or {}).get("height", THUMBNAIL_HEIGHT)
    png_bytes = await capture_slide_screenshot(html, width, height)

    logger.info(
        "Captured thumbnail for deck %s slide %d (%d bytes)",
        deck_uuid, slide_index, len(png_bytes),
    )

    # Upload to Supabase Storage
    from services.supabase import get_supabase_client

    supabase = get_supabase_client()
    storage_path = f"thumbnails/{deck_uuid}_s{slide_index}.png"

    # Ensure the storage bucket exists (once per process)
    global _bucket_verified
    if not _bucket_verified:
        try:
            supabase.storage.get_bucket(THUMBNAIL_BUCKET)
            _bucket_verified = True
        except Exception:
            try:
                supabase.storage.create_bucket(
                    THUMBNAIL_BUCKET, options={"public": True}
                )
                logger.info("Created storage bucket: %s", THUMBNAIL_BUCKET)
            except Exception as bucket_err:
                if "already exists" in str(bucket_err).lower():
                    pass
                else:
                    logger.error("Failed to create bucket %s: %s", THUMBNAIL_BUCKET, bucket_err)
                    raise
            _bucket_verified = True

    try:
        supabase.storage.from_(THUMBNAIL_BUCKET).upload(
            path=storage_path,
            file=png_bytes,
            file_options={"content-type": "image/png", "upsert": "true"},
        )
    except Exception as upload_err:
        # If duplicate and upsert didn't work, remove then re-upload
        if "Duplicate" in str(upload_err):
            logger.debug("Removing existing thumbnail before re-upload: %s", storage_path)
            supabase.storage.from_(THUMBNAIL_BUCKET).remove([storage_path])
            supabase.storage.from_(THUMBNAIL_BUCKET).upload(
                path=storage_path,
                file=png_bytes,
                file_options={"content-type": "image/png"},
            )
        else:
            raise

    public_url = supabase.storage.from_(THUMBNAIL_BUCKET).get_public_url(storage_path)
    # Strip trailing '?' that Supabase sometimes adds
    if public_url and public_url.endswith("?"):
        public_url = public_url[:-1]

    # Update decks table
    now = datetime.now(timezone.utc).isoformat()
    try:
        supabase.table("decks").update({
            "thumbnail_url": public_url,
            "thumbnail_rendered_at": now,
        }).eq("uuid", deck_uuid).execute()
        logger.info("Updated thumbnail_url for deck %s", deck_uuid)
    except Exception as db_err:
        logger.error("Failed to update thumbnail_url for deck %s: %s", deck_uuid, db_err)

    return {"url": public_url, "path": storage_path}
