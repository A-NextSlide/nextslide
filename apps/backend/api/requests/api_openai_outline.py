"""
Clean API endpoint for AI-powered slide outline generation.
"""
# Force rebuild - deployment cache fix

import asyncio
import json
import re
import logging
import time
import uuid
import os
from typing import Optional, List, Dict, Any
from fastapi import HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, validator
from datetime import datetime

from services.outline_service import OutlineGenerator, OutlineOptions
from models.requests import DeckOutline, SlideOutline, ExtractedDataItem, TaggedMediaItem
from api.requests.api_deck_outline import process_deck_outline
from agents.config import OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL
from models.requests import StylePreferencesItem
from models.narrative_flow import NarrativeFlow
from services.narrative_flow_analyzer import NarrativeFlowAnalyzer

logger = logging.getLogger(__name__)


def _sanitize_request_for_logging(request_dict: dict) -> dict:
    """Remove or truncate sensitive/large data from request for logging"""
    sanitized = request_dict.copy()
    
    # Handle files array - remove content field
    if 'files' in sanitized and isinstance(sanitized['files'], list):
        sanitized_files = []
        for file in sanitized['files']:
            sanitized_file = file.copy() if isinstance(file, dict) else {}
            # Remove content but keep metadata
            if 'content' in sanitized_file:
                content_size = len(str(sanitized_file['content']))
                sanitized_file['content'] = f"<truncated {content_size} chars>"
            sanitized_files.append(sanitized_file)
        sanitized['files'] = sanitized_files
    
    return sanitized


def _infer_requested_slide_count_from_prompt(prompt: Optional[str]) -> Optional[int]:
    """Best-effort parse of requested slide/page count from a natural-language prompt.

    Recognizes patterns like:
    - "2 slides", "4 pages", "10 slide"
    - "one slide", "three pages", etc.
    - "a slide", "a page", "single slide/page"
    Returns an integer count if detected, otherwise None.
    """
    try:
        if not prompt or not isinstance(prompt, str):
            return None
        text = prompt.lower()
        # 1) Numeric forms: "3 slides", "12 pages"
        m = re.search(r"\b(\d{1,3})\s*(slide|slides|page|pages)\b", text)
        if m:
            try:
                return int(m.group(1))
            except Exception:
                pass

        # 2) Spelled-out numbers up to 20
        number_words = {
            "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
            "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
            "eleven": 11, "twelve": 12, "thirteen": 13, "fourteen": 14,
            "fifteen": 15, "sixteen": 16, "seventeen": 17, "eighteen": 18,
            "nineteen": 19, "twenty": 20
        }
        for word, val in number_words.items():
            if re.search(fr"\b{word}\s*(slide|slides|page|pages)\b", text):
                return val

        # 3) Articles/qualifiers implying 1
        if re.search(r"\b(a|single)\s*(slide|page)\b", text):
            return 1
    except Exception:
        # Be resilient; silently ignore parsing errors
        return None
    return None


def _normalize_hex_color(value: Optional[str]) -> Optional[str]:
    """Normalize a color string to #RRGGBB hex when possible."""
    try:
        if not value or not isinstance(value, str):
            return None
        s = value.strip()
        # Extract nested value if given as 'hex: #AABBCC' etc.
        import re
        m = re.search(r"#([0-9a-fA-F]{6})", s)
        if m:
            return f"#{m.group(1).upper()}"
        # Short hex like #ABC
        m3 = re.search(r"#([0-9a-fA-F]{3})\b", s)
        if m3:
            h = m3.group(1)
            return f"#{h[0]*2}{h[1]*2}{h[2]*2}".upper()
    except Exception:
        return None
    return None


def _extract_hex_colors(colors_data: Any) -> List[str]:
    """Best-effort extraction of hex colors from a brandfetch-like colors structure."""
    found: List[str] = []
    try:
        def add_color(c: Optional[str]):
            c2 = _normalize_hex_color(c)
            if c2 and c2 not in found:
                found.append(c2)

        if isinstance(colors_data, dict):
            # Common keys: all, accents, background(s), text, primary_* etc.
            for key in [
                'all', 'accents', 'primary', 'secondary', 'brand', 'palette',
                'background', 'backgrounds', 'text', 'primary_background', 'primary_text'
            ]:
                val = colors_data.get(key)
                if isinstance(val, list):
                    for item in val:
                        if isinstance(item, str):
                            add_color(item)
                        elif isinstance(item, dict):
                            add_color(item.get('hex') or item.get('value') or item.get('color'))
                elif isinstance(val, str):
                    add_color(val)
                elif isinstance(val, dict):
                    # Nested dict may include hex/value
                    add_color(val.get('hex') or val.get('value') or val.get('color'))
            # Also scan all values for hex-like strings
            import json as _json
            text_blob = _json.dumps(colors_data)
            import re
            for m in re.findall(r"#([0-9a-fA-F]{6})", text_blob):
                add_color(f"#{m}")
        elif isinstance(colors_data, list):
            for item in colors_data:
                if isinstance(item, str):
                    add_color(item)
                elif isinstance(item, dict):
                    add_color(item.get('hex') or item.get('value') or item.get('color'))
        elif isinstance(colors_data, str):
            add_color(colors_data)
    except Exception:
        pass
    return found


def _pick_color_by_brightness(colors: Any, prefer_light: bool = True) -> Optional[str]:
    """Choose a color by perceived brightness from a candidate list/structure."""
    try:
        candidates = _extract_hex_colors(colors)
        if not candidates:
            return None

        def brightness(hex_color: str) -> float:
            try:
                h = hex_color.lstrip('#')
                r = int(h[0:2], 16)
                g = int(h[2:4], 16)
                b = int(h[4:6], 16)
                # Perceived brightness (ITU-R BT.601)
                return 0.299 * r + 0.587 * g + 0.114 * b
            except Exception:
                return 0.0

        sorted_colors = sorted(candidates, key=brightness, reverse=prefer_light)
        return sorted_colors[0] if sorted_colors else None
    except Exception:
        return None


def _sanitize_extracted_data(ed: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Normalize extractedData for charts.

    - Normalizes data -> [{label,name,value,y}]
    - Accepts series -> [{ name, data: [{name|x, y}] }]; preserves xType when provided
    - Coerces numeric strings to floats
    - Drops generic/empty labels
    - Requires at least 2 usable points overall unless citations-only
    """
    if not isinstance(ed, dict):
        return None
    citations: List[Dict[str, Any]] = []
    try:
        citations = ((ed.get('metadata') or {}).get('citations') or [])
    except Exception:
        citations = []

    def _to_float(val: Any) -> Optional[float]:
        try:
            if isinstance(val, str):
                return float(val.replace(',', '').replace('%', ''))
            if isinstance(val, (int, float)):
                return float(val)
        except Exception:
            return None
        return None

    def _is_bad_label(s: str) -> bool:
        l = s.strip().lower()
        return (
            l == '' or l in {"unknown", "n/a", "na", "none", "label", "value"} or
            l.startswith("category ") or l.startswith("item ") or l.startswith("data point")
        )

    # Normalize flat data
    data = ed.get('data')
    normalized: List[Dict[str, Any]] = []
    if isinstance(data, list):
        for item in data:
            if not isinstance(item, dict):
                continue
            label = item.get('label') or item.get('name') or item.get('id') or item.get('x')
            value = item.get('value') if 'value' in item else item.get('y')
            v = _to_float(value)
            label_str = str(label).strip() if label is not None else ''
            if _is_bad_label(label_str) or v is None:
                continue
            normalized.append({"label": label_str, "name": label_str, "value": v, "y": v})

    # Normalize series if present
    x_type = ed.get('xType') if ed.get('xType') in ('category', 'time') else None
    series_in = ed.get('series') if isinstance(ed.get('series'), list) else None
    sanitized_series: List[Dict[str, Any]] = []
    if series_in:
        for s in series_in:
            if not isinstance(s, dict):
                continue
            s_name = str(s.get('name') or 'Series')
            points = []
            for p in (s.get('data') or []):
                if not isinstance(p, dict):
                    continue
                x_val = p.get('x')
                name_val = p.get('name') or p.get('label') or x_val
                y_val = _to_float(p.get('y') if 'y' in p else p.get('value'))
                if y_val is None:
                    continue
                if x_type == 'time' and x_val is not None:
                    points.append({"x": x_val, "y": y_val})
                else:
                    lbl = str(name_val).strip() if name_val is not None else ''
                    if _is_bad_label(lbl):
                        continue
                    points.append({"name": lbl, "y": y_val})
            if len(points) >= 2:
                sanitized_series.append({"name": s_name, "data": points})

    # Decide if we have enough data overall
    total_points = len(normalized)
    if not total_points and sanitized_series:
        total_points = max((len(s.get('data') or []) for s in sanitized_series), default=0)

    if total_points < 2:
        if citations:
            out = dict(ed)
            out.setdefault('chartType', 'annotations')
            meta = dict(out.get('metadata') or {})
            meta['citations'] = citations
            out['metadata'] = meta
            out['data'] = []
            out.pop('series', None)
            return out
        return None

    out = dict(ed)
    if normalized:
        out['data'] = normalized
    elif sanitized_series and not out.get('data'):
        # Provide a simple fallback data from first series for older clients
        first = sanitized_series[0]
        fallback = []
        for dp in first.get('data') or []:
            if 'name' in dp:
                fallback.append({"label": dp['name'], "name": dp['name'], "value": float(dp['y']), "y": float(dp['y'])})
            else:
                fallback.append({"label": str(dp.get('x')), "name": str(dp.get('x')), "value": float(dp['y']), "y": float(dp['y'])})
        out['data'] = fallback
    if sanitized_series:
        out['series'] = sanitized_series
    if x_type:
        out['xType'] = x_type
    return out


def _guess_brand_identifier(text: Optional[str]) -> Optional[str]:
    """Heuristic to guess a brand identifier (domain or name) from free-text prompt."""
    if not text or not isinstance(text, str):
        return None
    try:
        t = text.strip()
        tl = t.lower()
        # 1) If a domain appears, return it
        import re
        m = re.search(r"\b([a-z0-9][a-z0-9\-]+\.[a-z]{2,})(?:/[\w\-./?%&=]*)?\b", tl)
        if m:
            return m.group(1)
        # 2) Simple known brand shortcuts
        if 'first round capital' in tl or 'first round' in tl or 'firstround' in tl:
            return 'firstround.com'
        # 3) Extract words preceding 'branding' or 'brand'
        m2 = re.search(r"use\s+([a-z0-9'\-\s]{2,})\s+branding", tl)
        if m2:
            name = m2.group(1).strip()
            # Title-case it for a better search identifier
            return ' '.join([w.capitalize() for w in name.split()])
    except Exception:
        return None
    return None


def _looks_like_domain(identifier: str) -> bool:
    """Return True when the value resembles a domain like example.com."""
    if not identifier or not isinstance(identifier, str):
        return False
    candidate = identifier.strip().lower()
    if " " in candidate:
        return False
    # Allow simple multi-level domains but require at least one dot and 2+ letter TLD
    import re
    return bool(re.match(r"^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$", candidate))


def _is_reasonable_brand_term(identifier: str) -> bool:
    """Filter out huge prompts before sending them to Brandfetch search."""
    if not identifier or not isinstance(identifier, str):
        return False
    cleaned = identifier.strip()
    if not cleaned:
        return False
    # Skip full prompt strings – keep short names/domains only
    if len(cleaned) > 64:
        return False
    # Avoid multi-sentence fragments
    if cleaned.count(" ") >= 6:
        return False
    alpha_chars = sum(1 for c in cleaned if c.isalpha())
    return alpha_chars >= 2


async def _hydrate_style_preferences(style_prefs: Optional[StylePreferencesItem], domain_hint: Optional[str] = None) -> Optional[StylePreferencesItem]:
    """Ensure style preferences include brand colors, font, and logo by refetching brand data when needed."""
    if not style_prefs:
        return style_prefs

    try:
        colors = getattr(style_prefs, 'colors', None)
        has_colors = bool(colors and (colors.accent1 or colors.accent2 or colors.accent3 or colors.background or colors.text))
        has_logo = bool(getattr(style_prefs, 'logoUrl', None))
        has_font = bool(getattr(style_prefs, 'font', None))
    except Exception:
        has_colors = has_logo = has_font = False

    if has_colors and has_logo and has_font:
        return style_prefs

    vibe_context = getattr(style_prefs, 'vibeContext', None)
    candidate_chain: List[str] = []
    if domain_hint:
        candidate_chain.append(domain_hint)
    if vibe_context:
        candidate_chain.append(vibe_context)
        # If vibe context is verbose, try to extract a cleaner identifier from it
        guessed = _guess_brand_identifier(vibe_context)
        if guessed:
            candidate_chain.append(guessed)

    domain = None
    for candidate in candidate_chain:
        if not candidate:
            continue
        if _looks_like_domain(candidate):
            domain = candidate.strip()
            break
        if _is_reasonable_brand_term(candidate):
            domain = candidate.strip()
            break

    if not domain:
        logger.debug("[STYLE PREF HYDRATE] No valid brand identifier found; skipping Brandfetch hydration")
        return style_prefs

    brand_data = None
    try:
        from services.simple_brandfetch_cache import SimpleBrandfetchCache
        db_url = os.getenv('DATABASE_URL')
        if db_url:
            async with SimpleBrandfetchCache(db_url) as cache_service:
                brand_data = await cache_service.get_brand_data(domain)
    except Exception as cache_error:
        logger.debug(f"[STYLE PREF HYDRATE] Cache fetch failed: {cache_error}")

    if not brand_data:
        try:
            from services.brandfetch_service import BrandfetchService
            async with BrandfetchService() as service:
                # Use search-capable resolver to handle non-domain identifiers gracefully
                brand_data = await service.get_brand_data_with_search(domain)
        except Exception as direct_error:
            logger.debug(f"[STYLE PREF HYDRATE] Direct Brandfetch fetch failed: {direct_error}")
            brand_data = None

    # FINAL FALLBACK: Use BrandColorSearcher to get basic brand colors/fonts/logo if Brandfetch fails
    if not brand_data and domain:
        try:
            from agents.tools.theme.brand_color_tools import BrandColorSearcher
            searcher = BrandColorSearcher()
            sr = await searcher.search_brand_colors(domain)
            if sr and (sr.get('colors') or sr.get('fonts') or sr.get('logo_url')):
                # Map to a brandfetch-like structure expected downstream
                colors_section = {'hex_list': sr.get('colors', [])}
                fonts_section = {'names': sr.get('fonts', [])}
                logos_section = {}
                if sr.get('logo_url'):
                    logos_section = {
                        'light': [{ 'formats': [{'url': sr['logo_url']}]}]
                    }
                brand_data = {
                    'colors': colors_section,
                    'fonts': fonts_section,
                    'logos': logos_section
                }
                logger.info(f"[STYLE PREF HYDRATE] BrandColorSearcher provided fallback brand data for {domain}")
        except Exception as _search_err:
            logger.debug(f"[STYLE PREF HYDRATE] BrandColorSearcher fallback failed: {_search_err}")

    if not brand_data:
        return style_prefs

    try:
        colors_data = brand_data.get('colors', {})
        brand_colors = _extract_hex_colors(colors_data)[:8]
        background_color = None
        text_color = None
        if isinstance(colors_data, dict):
            background_color = (
                _normalize_hex_color(colors_data.get('background') or colors_data.get('primary_background'))
                or _pick_color_by_brightness(colors_data.get('all'), prefer_light=True)
            )
            text_color = (
                _normalize_hex_color(colors_data.get('text') or colors_data.get('primary_text'))
                or _pick_color_by_brightness(colors_data.get('all'), prefer_light=False)
            )

        # Treat black/white-only palettes as insufficient so we can fall back to AI palette
        def _hex_to_rgb(h: str):
            try:
                hs = h.lstrip('#')
                return int(hs[0:2], 16), int(hs[2:4], 16), int(hs[4:6], 16)
            except Exception:
                return None

        def _is_neutral(h: str) -> bool:
            try:
                rgb = _hex_to_rgb(h)
                if not rgb:
                    return False
                r, g, b = rgb
                # Near-white or near-black
                if (r + g + b) >= (3 * 240):
                    return True
                if (r + g + b) <= (3 * 20):
                    return True
                # Low chroma greys (small channel deltas)
                maxc, minc = max(r, g, b), min(r, g, b)
                return (maxc - minc) <= 8
            except Exception:
                return False

        def _dedupe(seq: List[str]) -> List[str]:
            seen = set()
            out: List[str] = []
            for x in seq:
                xx = (x or '').upper()
                if xx and xx not in seen:
                    seen.add(xx)
                    out.append(xx)
            return out

        meaningful_colors = _dedupe([c for c in (brand_colors or []) if not _is_neutral(c)])
        ordered_brand_colors = _dedupe(brand_colors or [])

        if not has_colors and ordered_brand_colors:
            from models.requests import ColorConfigItem

            accent1 = ordered_brand_colors[0]
            accent2 = ordered_brand_colors[1] if len(ordered_brand_colors) > 1 else None
            accent3 = ordered_brand_colors[2] if len(ordered_brand_colors) > 2 else None

            background = background_color or (next((c for c in ordered_brand_colors if _is_neutral(c)), None))
            if not background:
                background = '#FFFFFF'

            color_config = ColorConfigItem(
                type="custom",
                name="Brand Colors",
                background=background,
                text=text_color,
                accent1=accent1,
                accent2=accent2,
                accent3=accent3
            )
            style_prefs.colors = color_config

        if not has_font:
            fonts = brand_data.get('fonts', {})
            if fonts and fonts.get('names'):
                style_prefs.font = fonts['names'][0]

        if not has_logo:
            logos = brand_data.get('logos', {})
            try:
                for logo_type in ['light', 'dark', 'icons', 'other']:
                    items = logos.get(logo_type)
                    if not items:
                        continue
                    first_item = items[0] if isinstance(items, list) and items else None
                    if isinstance(first_item, dict):
                        formats = first_item.get('formats')
                        if isinstance(formats, list) and formats:
                            url = formats[0].get('url')
                            if url:
                                style_prefs.logoUrl = url
                                break
                        url = first_item.get('url')
                        if url:
                            style_prefs.logoUrl = url
                            break
                    elif isinstance(first_item, str) and first_item.startswith('http'):
                        style_prefs.logoUrl = first_item
                        break
            except Exception:
                pass

    except Exception as hydrate_error:
        logger.debug(f"[STYLE PREF HYDRATE] Failed to hydrate style preferences: {hydrate_error}")

    return style_prefs

class OutlineRequest(BaseModel):
    """Request for outline generation"""
    prompt: str = Field(description="User's presentation idea or topic")
    files: List[Dict[str, Any]] = Field(default_factory=list, description="Uploaded files data")
    detailLevel: Optional[str] = Field('standard', description="Detail level: 'quick', 'detailed', or 'standard'")
    styleContext: Optional[str] = Field(None, description="Style context or vibe description")
    fontPreference: Optional[str] = Field(None, description="Preferred font name")
    colorPreference: Optional[Any] = Field(None, description="Color preferences")
    # Important: leave default as None so per-task defaults apply
    # If explicitly provided by the client, this overrides BOTH planning and content
    model: Optional[str] = Field(None, description="Global override model for BOTH planning and content (optional)")
    slideCount: Optional[int] = Field(None, description="Specific number of slides requested (1-20)")
    visualDensity: Optional[str] = Field(None, description="Visual density preference: minimal | moderate | rich | dense")
    enableResearch: Optional[bool] = Field(None, description="Enable web research (Thinking) during outline creation")
    
    # Workaround: Also accept slide_count (snake_case)
    slide_count: Optional[int] = Field(None, description="Alternative field name for slide count")
    
    @validator('slideCount', always=True)
    def merge_slide_count(cls, v, values):
        """If slideCount is None, check for slide_count as fallback"""
        if v is None and 'slide_count' in values and values['slide_count'] is not None:
            logger.info(f"[WORKAROUND] Using slide_count ({values['slide_count']}) as slideCount was None")
            return values['slide_count']
        return v
    
    @validator('colorPreference', pre=True)
    def validate_color_preference(cls, v):
        """Handle colorPreference as either dict or list"""
        if v is None:
            return None
        
        # If it's already a dict, return as-is
        if isinstance(v, dict):
            return v
        
        # If it's a list, try to extract the first dict element
        if isinstance(v, list):
            logger.warning(f"colorPreference received as list: {v}")
            # Look for first dict in the list
            for item in v:
                if isinstance(item, dict):
                    return item
            # If no dict found, return None
            return None
        
        # For any other type, log and return None
        logger.warning(f"colorPreference received as unexpected type {type(v)}: {v}")
        return None


class ContentEnhancementRequest(BaseModel):
    """Request for content enhancement"""
    content: str = Field(description="Content to enhance")
    systemPrompts: Optional[Dict[str, str]] = Field(default_factory=dict, description="System prompts")
    enhancePrompt: Optional[str] = Field(None, description="Legacy field for enhancement prompt")


class ContentEnhancementResponse(BaseModel):
    """Response for content enhancement"""
    enhancedContent: str = Field(description="The enhanced content")
    extractedData: Optional[Dict[str, Any]] = Field(None, description="Any extracted data for visualization")
    sources: Optional[str] = Field(None, description="Sources used for enhancement")


class OutlineResponse(BaseModel):
    """Response containing the generated outline"""
    success: bool
    hasResult: bool
    outline: Optional[DeckOutline] = None
    narrative_flow: Optional[NarrativeFlow] = None
    error: Optional[str] = None
    message: str


def _convert_to_api_format(result) -> DeckOutline:
    """Convert service result to API format"""
    slides = []
    for slide in result.slides:
        # Handle extractedData - either from slide.extractedData or convert from chart_data
        extracted_data = None
        if hasattr(slide, 'extractedData') and slide.extractedData:
            # Use existing extractedData if available, but sanitize first
            cleaned = _sanitize_extracted_data(slide.extractedData)
            if cleaned:
                extracted_data = ExtractedDataItem(
                    source=cleaned.get('source', 'generated_data'),
                    chartType=cleaned.get('chartType'),
                    data=cleaned.get('data', []),
                    title=cleaned.get('title', ''),
                    metadata=cleaned.get('metadata', {})
                )
        elif slide.chart_data:
            # Transform data to use 'label' instead of 'name' for frontend compatibility
            transformed_data = []
            for item in slide.chart_data.data:
                if 'name' in item:
                    transformed_data.append({
                        "label": item['name'],
                        "value": item['value']
                    })
                else:
                    transformed_data.append(item)
            # Filter out generic/empty labels
            filtered = []
            for dp in transformed_data:
                if not isinstance(dp, dict):
                    continue
                lbl = (str(dp.get('label', '')).strip()).lower()
                if not lbl or lbl in {"unknown", "n/a", "na", "none", "label", "value"}:
                    continue
                if lbl.startswith("category ") or lbl.startswith("item ") or lbl.startswith("data point"):
                    continue
                filtered.append(dp)
            transformed_data = filtered
            
            extracted_data = ExtractedDataItem(
                source="generated_data",
                chartType=slide.chart_data.chart_type,
                data=transformed_data,
                title=slide.chart_data.title,
                metadata=slide.chart_data.metadata
            )
        
        # Convert taggedMedia to proper format
        tagged_media = []
        if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
            for media in slide.taggedMedia:
                if isinstance(media, dict):
                    tagged_media.append(TaggedMediaItem(
                        id=media.get('id', ''),
                        filename=media.get('filename', ''),
                        type=media.get('type', 'image'),
                        previewUrl=media.get('previewUrl', ''),
                        interpretation=media.get('interpretation', ''),
                        slideId=media.get('slideId', slide.id),
                        status=media.get('status', 'processed'),
                        metadata=media.get('metadata', {})
                    ))
        
        slides.append(SlideOutline(
            id=slide.id,
            title=slide.title,
            content=slide.content,
            deepResearch=bool(slide.research_notes) if hasattr(slide, 'research_notes') else slide.deepResearch,
            taggedMedia=tagged_media,
            extractedData=extracted_data
        ))
    
    return DeckOutline(
        id=result.id,
        title=result.title,
        slides=slides,
        notes=None,  # Notes will be set by the caller if narrative flow is analyzed
        # Note: stylePreferences are added separately in the streaming path
        # For non-streaming, we don't have access to the request here
        stylePreferences=None
    )


async def process_outline(request: OutlineRequest, registry=None) -> OutlineResponse:
    """Process outline generation request"""
    try:
        generator = OutlineGenerator(registry)
        
        # Infer slide/page count from prompt when not explicitly provided
        inferred_slide_count = request.slideCount
        if inferred_slide_count is None:
            inferred_slide_count = _infer_requested_slide_count_from_prompt(request.prompt)

        options = OutlineOptions(
            prompt=request.prompt,
            detail_level=request.detailLevel or "standard",
            enable_research=(request.enableResearch if request.enableResearch is not None else True),
            style_context=request.styleContext,
            font_preference=request.fontPreference,
            color_scheme=request.colorPreference,  # Pass the full colorPreference object
            files=request.files,
            model=request.model,
            slide_count=inferred_slide_count,
            visual_density=(request.visualDensity or None)
        )
        
        result = await generator.generate(options)
        outline = _convert_to_api_format(result)
        
        # Generate narrative flow but don't wait for saving
        narrative_flow = None
        try:
            flow_analyzer = NarrativeFlowAnalyzer()
            outline_dict = outline.model_dump()
            narrative_flow = await flow_analyzer.analyze_narrative_flow(
                outline_dict,
                context=request.prompt
            )
            logger.info("Narrative flow analysis completed successfully")
            
            # Add narrative flow to outline for deck creation
            outline.notes = narrative_flow.model_dump()
            logger.info("Added narrative flow as 'notes' to outline for deck creation")
            
        except Exception as e:
            logger.warning(f"Failed to analyze narrative flow: {e}")
            # Continue without narrative flow
        
        return OutlineResponse(
            success=True,
            hasResult=True,
            outline=outline,
            narrative_flow=narrative_flow,  # Include it in response
            message=f"Generated {len(outline.slides)} slides"
        )
        
    except Exception as e:
        logger.error(f"Outline generation failed: {e}")
        return OutlineResponse(
            success=False,
            hasResult=False,
            error=str(e),
            message=f"Failed to generate outline: {str(e)}"
        )


async def process_outline_stream(request: OutlineRequest, registry=None):
    """Process outline generation request and return streaming response"""
    logger.info(f"Outline generation started for model: {request.model}")
    logger.info(f"Returning streaming response (model: {request.model})")
    
    # Create a task holder that persists beyond the stream
    narrative_flow_task_holder = {"task": None, "outline_id": None}
    
    async def complete_narrative_flow_if_needed():
        """Helper to complete narrative flow generation and save it"""
        try:
            logger.info(f"[NARRATIVE FLOW COMPLETE] Task holder state: task={narrative_flow_task_holder['task'] is not None}, outline_id={narrative_flow_task_holder['outline_id']}")
            
            if narrative_flow_task_holder["task"]:
                logger.info(f"[NARRATIVE FLOW COMPLETE] Waiting for narrative flow generation to complete for outline {narrative_flow_task_holder['outline_id']}")
                try:
                    result = await narrative_flow_task_holder["task"]
                    if result:
                        logger.info(f"[NARRATIVE FLOW COMPLETE] Narrative flow generation completed for outline {narrative_flow_task_holder['outline_id']}")
                        # Don't save to deck here - outline ID is not deck UUID!
                        # The deck creation process will handle saving the narrative flow
                        logger.info(f"[NARRATIVE FLOW COMPLETE] Narrative flow will be saved when deck is created")
                    else:
                        logger.warning(f"[NARRATIVE FLOW COMPLETE] Narrative flow generation returned None for outline {narrative_flow_task_holder['outline_id']}")
                except Exception as e:
                    logger.error(f"[NARRATIVE FLOW COMPLETE] Error waiting for narrative flow: {e}")
            else:
                logger.info(f"[NARRATIVE FLOW COMPLETE] No narrative flow task to wait for")
        except Exception as e:
            logger.error(f"[NARRATIVE FLOW COMPLETE] Error in complete_narrative_flow_if_needed: {e}")
    
    def _sse(event: Dict[str, Any]) -> bytes:
        try:
            return f"data: {json.dumps(event)}\n\n".encode("utf-8")
        except Exception:
            return b"data: {\"type\": \"error\", \"error\": \"serialization_failed\"}\n\n"
    
    async def event_stream():
        # Initialize variables
        outline = None
        outline_dict = None
        detected_style_context = None  # ensure defined for downstream conditionals
        
        # Initialize narrative flow variables
        narrative_flow_task = None
        narrative_flow_result = None
        narrative_flow_started = False
        
        # Track if we sent outline_ready
        outline_ready_sent = False
        accumulated_slides = []
        
        try:
            # Emit an immediate connection event to open the stream in clients and proxies
            yield _sse({'type': 'connection_established', 'message': 'SSE stream open'})
            await asyncio.sleep(0)
            # Extract user_id if available
            user_id = getattr(request, '_user_id', None)
            if user_id:
                logger.info(f"Processing outline for authenticated user: {user_id}")
            
            # Debug log the incoming request
            logger.info(f"[OUTLINE DEBUG] Received request with slideCount: {request.slideCount}")
            logger.info(f"[OUTLINE DEBUG] Request detail level: {request.detailLevel}")
            logger.info(f"[OUTLINE DEBUG] colorPreference type: {type(request.colorPreference)}")
            logger.info(f"[OUTLINE DEBUG] colorPreference value: {request.colorPreference}")
            
            # Enhanced style preference logging
            if logger.isEnabledFor(logging.DEBUG):
                logger.debug(f"[STYLE PREFERENCES] 📋 Frontend Request Received:")
                logger.debug(f"  - Style Context: {request.styleContext}")
                logger.debug(f"  - Font Preference: {request.fontPreference}")
                logger.debug(f"  - Color Preference: {request.colorPreference}")
                logger.debug(f"  - Detail Level: {request.detailLevel}")
                if request.colorPreference:
                    if isinstance(request.colorPreference, dict):
                        logger.debug(f"  - Color Type: {request.colorPreference.get('type')}")
                        logger.debug(f"  - Specific Colors: {request.colorPreference.get('specificColors')}")
                        logger.debug(f"  - Brand Colors: {request.colorPreference.get('brandColors')}")
                    elif isinstance(request.colorPreference, str):
                        logger.debug(f"  - Color String: '{request.colorPreference}'")
            
            # Add sanitized request debug
            sanitized_request = _sanitize_request_for_logging(request.dict())
            logger.info(f"[OUTLINE DEBUG] Request (sanitized): {sanitized_request}")
            
            generator = OutlineGenerator(registry)
            
            # Normalize colorPreference: allow dict input and map into color_scheme string or structured dict
            normalized_color = request.colorPreference
            try:
                if isinstance(request.colorPreference, dict):
                    # Prefer a concise string for OutlineOptions if model requires, otherwise pass dict through
                    name = request.colorPreference.get('name') or request.colorPreference.get('type') or 'custom'
                    bg = request.colorPreference.get('background')
                    text = request.colorPreference.get('text')
                    a1 = request.colorPreference.get('accent1')
                    # Keep dict form for downstream generator which expects colorPreference=dict
                    normalized_color = {
                        'type': request.colorPreference.get('type', 'custom'),
                        'name': name,
                        'background': bg,
                        'text': text,
                        'accent1': a1,
                        'specificColors': request.colorPreference.get('specificColors')
                    }
            except Exception:
                normalized_color = request.colorPreference

            # Infer slide/page count from prompt when not explicitly provided
            inferred_slide_count = request.slideCount
            if inferred_slide_count is None:
                inferred_slide_count = _infer_requested_slide_count_from_prompt(request.prompt)

            options = OutlineOptions(
                prompt=request.prompt,
                detail_level=request.detailLevel or "standard",
                enable_research=(request.enableResearch if request.enableResearch is not None else True),
                style_context=request.styleContext,
                font_preference=request.fontPreference,
                color_scheme=normalized_color,
                files=request.files,
                model=request.model,
                slide_count=inferred_slide_count,
                visual_density=(request.visualDensity or None)
            )
            
            # Debug log the options being passed
            print(f"[OUTLINE OPTIONS] Created with:")
            print(f"  - style_context: {options.style_context}")
            print(f"  - font_preference: {options.font_preference}")
            print(f"  - color_scheme: {options.color_scheme}")
            print("")
            
            outline = None  # Store the outline for deck creation
            
            # Check if streaming is available
            if hasattr(generator, 'stream_generation'):
                async for update in generator.stream_generation(options):
                    # Forward agent-based research events explicitly for frontend streaming UI
                    if update.stage in {
                        "research_started",
                        "research_plan",
                        "research_search_results",
                        "research_page_fetched",
                        "research_synthesis",
                        "research_complete",
                        "research_error",
                    }:
                        research_payload = {
                            'type': update.stage,
                            'message': update.message,
                            'progress': update.progress,
                        }
                        if update.metadata:
                            research_payload.update(update.metadata)
                        yield _sse(research_payload)
                        await asyncio.sleep(0)  # ensure flush
                        continue
                    if update.stage == "outline_ready":
                        outline_data = {
                            'type': 'outline_structure',
                            'title': update.metadata['title'],
                            'slideCount': update.metadata['slide_count'],
                            'slideTitles': update.metadata['slide_titles'],
                            'progress': update.progress
                        }
                        
                        # Include slide types if available
                        if 'slide_types' in update.metadata:
                            outline_data['slideTypes'] = update.metadata['slide_types']
                        
                        yield _sse(outline_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
                    
                    elif update.stage == "slide_ready":
                        slide_data = update.metadata['slide']
                        
                        # Debug log tagged media
                        tm_count = len(slide_data.get('taggedMedia', []))
                        logger.info(f"[API] Slide {update.metadata['slide_index'] + 1} has {tm_count} taggedMedia items in slide_data")
                        if tm_count > 0:
                            logger.info(f"[API] First tagged media: {slide_data['taggedMedia'][0].get('filename', 'unknown')}")
                        
                        # Convert chart data to proper format for frontend
                        chart_data = None
                        if slide_data.get('chart_data'):
                            # Transform points to include label/name/value, and map x/y as needed
                            transformed_data = []
                            for item in slide_data['chart_data']['data']:
                                if not isinstance(item, dict):
                                    continue
                                label = item.get('label') or item.get('name') or item.get('x') or item.get('id')
                                value = item.get('value', item.get('y'))
                                if isinstance(value, str):
                                    try:
                                        value = float(value.replace(',', '').replace('%', ''))
                                    except Exception:
                                        value = None
                                if label is None or value is None:
                                    continue
                                label_str = str(label).strip()
                                transformed_data.append({
                                    "label": label_str,
                                    "name": label_str,
                                    "value": float(value),
                                    "y": float(value)
                                })
                            # Filter out generic/empty labels
                            filtered = []
                            for dp in transformed_data:
                                if not isinstance(dp, dict):
                                    continue
                                lbl = (str(dp.get('label', '')).strip()).lower()
                                if not lbl or lbl in {"unknown", "n/a", "na", "none", "label", "value"}:
                                    continue
                                if lbl.startswith("category ") or lbl.startswith("item ") or lbl.startswith("data point"):
                                    continue
                                filtered.append(dp)
                            transformed_data = filtered
                            
                            # Build Highcharts-friendly series for downstream renderers
                            # Single-series from transformed_data; xType heuristic
                            labels = [dp.get('label') or dp.get('name') for dp in transformed_data]
                            def _looks_time_like(lbls):
                                months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
                                for l in (str(x).lower() for x in lbls if x):
                                    if any(m in l for m in months):
                                        return True
                                    if any(ch in l for ch in ("-","/")) and any(c.isdigit() for c in l):
                                        return True
                                    if any(str(y) in l for y in range(1990, 2051)):
                                        return True
                                return False
                            is_time = slide_data['chart_data']['chart_type'] in ("line","area","spline","areaspline") and _looks_time_like(labels)
                            if is_time:
                                series_data = [{"x": dp.get('label') or dp.get('name'), "y": dp['y']} for dp in transformed_data]
                            elif slide_data['chart_data']['chart_type'] == 'pie':
                                series_data = [{"name": dp.get('label') or dp.get('name'), "y": dp['y']} for dp in transformed_data]
                            else:
                                series_data = [{"name": dp.get('label') or dp.get('name'), "y": dp['y']} for dp in transformed_data]

                            chart_data = {
                                "chart_type": slide_data['chart_data']['chart_type'],
                                "data": transformed_data,
                                "series": [{"name": slide_data['chart_data'].get('title') or "Series 1", "data": series_data}],
                                "xType": "time" if is_time else "category",
                                "title": slide_data['chart_data'].get('title', ''),
                                "metadata": slide_data['chart_data'].get('metadata', {})
                            }
                        
                        # Build response data separately to avoid multi-line f-string issues
                        # Prepare taggedMedia with debug logging
                        tagged_media = slide_data.get('taggedMedia', [])
                        logger.info(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
                        # Sanitize extractedData before sending
                        sanitized_ed = _sanitize_extracted_data(slide_data.get('extractedData'))
                        response_data = {
                            'type': 'slide_complete',
                            'slideIndex': update.metadata['slide_index'],
                            'slide': {
                                'id': slide_data['id'],
                                'title': slide_data['title'],
                                'content': slide_data['content'],
                                'chartData': chart_data,  # Changed from 'extractedData' to 'chartData'
                                'extractedData': sanitized_ed,  # Include sanitized extractedData
                                'taggedMedia': tagged_media,  # Include taggedMedia
                                'deepResearch': slide_data.get('deepResearch', False)  # Include deepResearch flag
                            },
                            'progress': update.progress,
                            'message': f"Generated slide {update.metadata['slide_index'] + 1}: {slide_data['title']}"
                        }
                        
                        # Final debug log before sending
                        logger.info(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        
                        yield _sse(response_data)
                        # No artificial delay - we want real streaming timing
                        await asyncio.sleep(0.01)  # Minimal flush delay
                    
                    elif update.stage == "complete":
                        # Fast-path: avoid heavy reconstruction; build outline from accumulated slides
                        result_data = update.metadata['result']
                        simple_slides = []
                        try:
                            for s in accumulated_slides:
                                simple_slides.append(SlideOutline(
                                    id=s.get('id'),
                                    title=s.get('title'),
                                    content=s.get('content', ''),
                                    deepResearch=False
                                ))
                        except Exception:
                            simple_slides = []

                        outline = DeckOutline(
                            id=result_data.get('id', str(uuid.uuid4())),
                            title=result_data.get('title', 'Untitled Presentation'),
                            slides=simple_slides,
                            stylePreferences=None,
                            notes=None
                        )
                        
                        # Always construct and hydrate style preferences for outline_complete
                        # Build style_prefs even when request provides no explicit context
                        # Try to infer a brand identifier from prompt or context
                        style_context_value = request.styleContext or detected_style_context or _guess_brand_identifier(request.prompt)
                        # Derive a clean brand/domain hint from either styleContext or prompt for Brandfetch hydration
                        brand_hint = _guess_brand_identifier(request.styleContext) or _guess_brand_identifier(request.prompt)
                        style_prefs = StylePreferencesItem(
                            vibeContext=style_context_value,
                            initialIdea=request.prompt,
                            font=request.fontPreference
                        )
                        # If user provided colorPreference as dict, try to map minimal fields
                        try:
                            if isinstance(request.colorPreference, dict):
                                from models.requests import ColorConfigItem
                                outline_colors = ColorConfigItem(
                                    type=str(request.colorPreference.get('type') or 'custom'),
                                    name=request.colorPreference.get('name'),
                                    background=request.colorPreference.get('background'),
                                    text=request.colorPreference.get('text'),
                                    accent1=request.colorPreference.get('accent1'),
                                    accent2=request.colorPreference.get('accent2'),
                                    accent3=request.colorPreference.get('accent3'),
                                )
                                style_prefs.colors = outline_colors
                        except Exception:
                            pass

                        try:
                            hydrated = await _hydrate_style_preferences(style_prefs, brand_hint)
                            outline.stylePreferences = hydrated or style_prefs
                        except Exception as hydrate_error:
                            logger.debug(f"[BRAND STYLEPREFS] Hydration failed: {hydrate_error}")
                            outline.stylePreferences = style_prefs

                        # If we still lack colors and no brand was found, ask ThemeDirector to suggest colors
                        try:
                            if not getattr(outline.stylePreferences, 'colors', None):
                                logger.info("[API OUTLINE] No brand colors found; requesting AI color suggestions")
                                # Reuse theme generation service to propose a palette from outline/title
                                from agents.generation.theme_director import ThemeDirector
                                director = ThemeDirector()
                                suggestion = await director.generate_quick_palette(
                                    title=outline.title,
                                    context=style_context_value or request.prompt
                                )
                                colors = (suggestion or {}).get('color_palette') or {}
                                palette_colors = []
                                try:
                                    palette_colors = colors.get('colors') or []
                                except Exception:
                                    palette_colors = []
                                if palette_colors or colors.get('primary_background') or colors.get('primary_text'):
                                    from models.requests import ColorConfigItem
                                    outline.stylePreferences.colors = ColorConfigItem(
                                        type="custom",
                                        name="AI Suggested",
                                        background=colors.get('primary_background') or (palette_colors[0] if palette_colors else None) or "#FFFFFF",
                                        text=colors.get('primary_text') or "#111827",
                                        accent1=palette_colors[0] if len(palette_colors) > 0 else None,
                                        accent2=palette_colors[1] if len(palette_colors) > 1 else None,
                                        accent3=palette_colors[2] if len(palette_colors) > 2 else None,
                                    )
                        except Exception as e:
                            logger.debug(f"[API OUTLINE] AI color suggestion failed: {e}")

                        # Additional debug to verify it was actually set
                        logger.info(f"[API OUTLINE] After setting - stylePreferences is None: {outline.stylePreferences is None}")
                        if outline.stylePreferences:
                            logger.info(f"[API OUTLINE] StylePreferences vibe after setting: {outline.stylePreferences.vibeContext}")
                        
                        # Start narrative flow generation in parallel as soon as outline is ready
                        if not narrative_flow_started and outline:
                            narrative_flow_started = True
                            logger.info("[NARRATIVE FLOW] Starting parallel narrative flow generation")
                            
                            async def generate_narrative_flow_async():
                                try:
                                    flow_analyzer = NarrativeFlowAnalyzer()
                                    outline_dict_for_analysis = outline.dict()
                                    result = await flow_analyzer.analyze_narrative_flow(
                                        outline_dict_for_analysis,
                                        context=request.prompt
                                    )
                                    logger.info("[NARRATIVE FLOW] Parallel generation completed")
                                    return result
                                except Exception as e:
                                    logger.warning(f"[NARRATIVE FLOW] Failed in parallel generation: {e}")
                                    return None
                            
                            # Start the task but don't await it yet
                            narrative_flow_task = asyncio.create_task(generate_narrative_flow_async())
                            # Store in the holder so it persists
                            narrative_flow_task_holder["task"] = narrative_flow_task
                            narrative_flow_task_holder["outline_id"] = outline.id
                        
                        # Don't wait for narrative flow - let it complete in background
                        narrative_flow_result = None
                        if narrative_flow_task and narrative_flow_task.done():
                            logger.info("[NARRATIVE FLOW] Taking completed narrative flow result")
                            try:
                                narrative_flow_result = await narrative_flow_task
                            except Exception as e:
                                logger.warning(f"[NARRATIVE FLOW] Error getting completed result: {e}")
                                narrative_flow_result = None
                        elif narrative_flow_task and not narrative_flow_task.done():
                            logger.info("[NARRATIVE FLOW] Narrative flow still running - will complete in background")
                        
                        # Add narrative flow to outline for persistence
                        if narrative_flow_result:
                            outline.notes = narrative_flow_result.model_dump()
                            logger.info("Added narrative flow as 'notes' to outline for persistence")
                        
                        # Build response data with narrative flow
                        outline_dict = outline.dict()
                        try:
                            if outline.stylePreferences:
                                outline_dict['stylePreferences'] = outline.stylePreferences.model_dump(exclude_none=True)
                        except Exception:
                            pass
                        
                        # Debug log to check if notes is in the serialized outline
                        logger.info(f"[OUTLINE RESPONSE] Outline dict keys: {list(outline_dict.keys())}")
                        if 'notes' in outline_dict:
                            logger.info(f"[OUTLINE RESPONSE] Notes field present in outline dict")
                        if 'stylePreferences' in outline_dict:
                            logger.info(f"[OUTLINE RESPONSE] StylePreferences included: {outline_dict['stylePreferences']}")
                        else:
                            logger.info(f"[OUTLINE RESPONSE] NO stylePreferences in outline dict")
                        
                        response_data = {
                            'type': 'outline_complete',
                            'success': True,
                            'hasResult': True,
                            'outline': outline_dict,  # Use the updated dict with notes
                            'outline_structure': outline_dict,  # Frontend expects this field
                            'message': f"Generated {len(outline.slides)} slides",
                            'progress': 100
                        }
                        
                        # Add narrative flow to response if generated
                        if narrative_flow_result:
                            response_data['narrative_flow'] = narrative_flow_result.model_dump()
                        
                        # IMPORTANT: actually emit the outline_complete event before narrative flow updates
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Flush

                        # Never await narrative flow inline; let it complete fully in background
                        # (No 'narrative_flow_started' or 'pending' inline events)

                        # Create deck after outline is complete
                        if outline and registry:
                            # Remove automatic deck creation - decks should only be created when user clicks generate
                            # The deck will be created when user initiates deck generation from the outline
                            logger.info(f"Outline complete, deck will be created when user initiates generation")
                            
                            # However, if this outline is being used for a deck that's already created,
                            # we should save the narrative flow to it
                            if narrative_flow_result and outline.id:
                                # Don't save to deck here - outline ID is not deck UUID!
                                # The deck creation process will handle saving the narrative flow
                                logger.info(f"[NARRATIVE FLOW] Narrative flow included in outline, will be saved when deck is created")
                            
                            # Just send the outline ready event
                            outline_ready_data = {
                                'type': 'outline_ready',
                                'success': True,
                                'outline_id': outline.id,
                                'message': f"Outline '{outline.title}' created successfully!"
                            }
                            yield _sse(outline_ready_data)
                            await asyncio.sleep(0)  # Ensure event is flushed
                            # Immediately end the outline stream to allow navigation
                            return
                    
                    elif update.stage == "slide_complete":
                        slide_data = update.metadata['slide']
                        chart_data = slide_data.get('chartData')
                        
                        # Debug log to check taggedMedia persistence
                        tagged_media_count = len(slide_data.get('taggedMedia', []))
                        logger.info(f"[API OUTLINE] slide_complete stage - Slide {update.metadata['slide_index'] + 1} has {tagged_media_count} taggedMedia items")
                        
                        # Accumulate slides for early narrative flow generation
                        accumulated_slides.append({
                            'id': slide_data['id'],
                            'title': slide_data['title'],
                            'content': slide_data['content'],
                            'speaker_notes': slide_data.get('speaker_notes', '')
                        })
                        
                        # Build response data separately to avoid multi-line f-string issues
                        # Prepare taggedMedia with debug logging
                        tagged_media = slide_data.get('taggedMedia', [])
                        logger.info(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
                        response_data = {
                            'type': 'slide_complete',
                            'slideIndex': update.metadata['slide_index'],
                            'slide': {
                                'id': slide_data['id'],
                                'title': slide_data['title'],
                                'content': slide_data['content'],
                                'chartData': chart_data,  # Changed from 'extractedData' to 'chartData'
                                'extractedData': slide_data.get('extractedData'),  # Include extractedData
                                'taggedMedia': tagged_media,  # Include taggedMedia
                                'deepResearch': slide_data.get('deepResearch', False)  # Include deepResearch flag
                            },
                            'progress': update.progress,
                            'message': f"Generated slide {update.metadata['slide_index'] + 1}: {slide_data['title']}"
                        }
                        
                        # Final debug log before sending
                        logger.info(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        
                        yield _sse(response_data)
                        # No artificial delay - we want real streaming timing
                        await asyncio.sleep(0.01)  # Minimal flush delay
                    
                    elif update.stage == "files_processed":
                        # Forward the file processing summary
                        response_data = {
                            'type': 'files_processed',
                            'message': update.message,
                            'progress': update.progress,
                            'file_summary': update.metadata.get('file_summary', ''),
                            'file_count': update.metadata.get('file_count', 0),
                            'processed_count': update.metadata.get('processed_count', 0)
                        }
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
                    
                    elif update.stage == "error":
                        error_message = update.metadata.get('error', 'Unknown error during outline generation')
                        logger.error(f"Outline generation stream error: {error_message}")
                        yield _sse({'type': 'error', 'success': False, 'error': error_message, 'progress': update.progress})
                        await asyncio.sleep(0)  # Ensure event is flushed
                        return # Stop stream on error
                    
                    else:
                        # Build response data separately to avoid multi-line f-string issues
                        response_data = {
                            'type': 'progress',
                            'message': update.message,
                            'stage': update.stage,
                            'progress': update.progress
                        }
                        yield _sse(response_data)
                        await asyncio.sleep(0)  # Ensure event is flushed
            
            else:
                # Fallback to non-streaming
                result = await generator.generate(options)
                outline = _convert_to_api_format(result)
                
                # Add style preferences for non-streaming path
                if request.styleContext or request.fontPreference or request.colorPreference:
                    style_prefs = StylePreferencesItem(
                        vibeContext=request.styleContext,
                        initialIdea=request.prompt,
                        font=request.fontPreference  # Changed from fontPreference to font
                    )
                    
                    # Handle color preferences
                    if request.colorPreference:
                        if isinstance(request.colorPreference, dict):
                            # For now, we'll skip setting colors as it expects ColorConfigItem
                            # This needs to be properly mapped to ColorConfigItem structure
                            pass
                        else:
                            # String color preference - also skip for now
                            pass
                    
                    outline.stylePreferences = style_prefs
                    logger.info(f"[NON-STREAMING] Added stylePreferences to outline")
                
                # Try to create deck even in fallback mode
                if outline and registry:
                    # Remove automatic deck creation in fallback mode too
                    logger.info(f"Fallback outline complete, deck will be created when user initiates generation")
                    
                    # Just send the outline ready event
                    outline_ready_data = {
                        'type': 'outline_ready',
                        'success': True,
                        'outline_id': outline.id,
                        'message': f"Outline '{outline.title}' created successfully!"
                    }
                    yield _sse(outline_ready_data)
                else:
                    # Build response data separately to avoid multi-line f-string issues
                    response_data = {
                        'type': 'outline_only',
                        'success': True,
                        'outline': outline.dict(),
                        'message': f"Generated {len(outline.slides)} slides"
                    }
                    yield _sse(response_data)
            
        except asyncio.CancelledError:
            logger.info("Client disconnected during outline stream; cancelling gracefully")
            return
        except Exception as e:
            logger.error(f"Error in outline stream: {e}")
            import traceback
            logger.error(f"Traceback: {traceback.format_exc()}")
            yield _sse({'type': 'error', 'error': str(e)})
        finally:
            # Ensure explicit end marker so ASGI considers the response complete
            try:
                yield _sse({'type': 'end', 'message': 'Stream complete'})
            except Exception:
                pass
    
    # Start the stream
    response = StreamingResponse(
        event_stream(), 
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache, no-store, must-revalidate",
            "Connection": "keep-alive",
            "Access-Control-Allow-Origin": "*",
            "X-Accel-Buffering": "no",
            "X-Content-Type-Options": "nosniff"
        }
    )
    
    # Schedule the narrative flow completion to run after response is sent
    asyncio.create_task(complete_narrative_flow_if_needed())

    # Optionally close the outline stream early to unblock UI immediately
    try:
        from agents.config import OUTLINE_STREAM_EARLY_CLOSE
        if OUTLINE_STREAM_EARLY_CLOSE:
            # Fast path: rely on the 'end' event inside event_stream to close promptly.
            # Nothing extra needed here, just return the response.
            pass
    except Exception:
        pass
    
    return response


async def process_media_interpretation(files: List[Dict[str, Any]], slides: List[SlideOutline], media_prompt: str = "") -> List[TaggedMediaItem]:
    """Process media interpretation - simplified implementation"""
    try:
        # Simple implementation that returns basic tagged media items
        tagged_media = []
        
        for i, file_data in enumerate(files):
            media_item = TaggedMediaItem(
                id=f"media_{i}",
                filename=file_data.get("name", f"file_{i}"),
                type=file_data.get("type", "other"),
                content=file_data.get("content"),
                interpretation=f"Media file: {file_data.get('name', 'Unknown')}",
                status="processed",
                metadata={"processed_by": "simplified_interpreter"}
            )
            tagged_media.append(media_item)
        
        return tagged_media
        
    except Exception as e:
        logger.error(f"Error in media interpretation: {e}")
        return []


async def process_content_enhancement(content: str, enhance_prompt: str = "") -> Dict[str, Any]:
    """Process content enhancement using Gemini with Google Search grounding"""
    try:
        from agents.ai.clients import get_client, invoke
        import os
        
        logger.info(f"Enhancing content with Google Search grounding")
        logger.info(f"Content length: {len(content)}, Enhance prompt: {enhance_prompt[:100]}...")
        
        # Use Gemini Flash-Lite for cost-effective search grounding
        model_name = "gemini-2.5-flash-lite"
        client, actual_model = get_client(model_name)
        
        # Build the enhanced prompt that encourages search usage
        _now = datetime.utcnow()
        _today = _now.date().isoformat()
        _year = _now.year
        full_prompt = f"""Current slide content:
{content}

Enhancement request: {enhance_prompt}

Please enhance this slide content based on the enhancement request. Search for and include:
1. Current statistics and data (with dates/years)
2. Recent examples or case studies
3. Up-to-date market information
4. Relevant facts and figures from credible sources
5. Industry trends and insights

Return the enhanced content in a clear, bullet-point format suitable for a presentation slide.
If you find any quantitative data that could be visualized, format it as "Chart Data: [description]"

IMPORTANT: 
- Use web search to find current, accurate information
- Include specific numbers, percentages, and dates when available
- Keep content concise and suitable for slides
- Format with clear bullet points
- Cite sources when possible (e.g., "According to [Source]...")

RECENCY RULES (as of {_today}):
- Prefer sources from the last 12–18 months; prioritize {_year} items
- For financial topics (earnings, quarters, filings), use the latest quarter/year and prefer primary sources (IR pages, SEC/EDGAR, official press releases)"""

        # Make the API call with search grounding enabled via system instruction
        messages = [
            {
                "role": "system",
                "content": "You are a presentation content enhancer with access to web search. Always search for current, accurate data to enhance slide content. Use search to find statistics, examples, and up-to-date information."
            },
            {
                "role": "user",
                "content": full_prompt
            }
        ]
        
        # Call with grounding enabled
        # Note: Google Search grounding is automatically enabled for Gemini Flash models
        # when they detect search-related queries in the prompt
        enhanced_content = invoke(
            client=client,
            model=actual_model,
            messages=messages,
            response_model=None,  # Get raw text response
            max_tokens=2000,
            temperature=0.7,
            # Enable grounding by including search instructions in the prompt
        )
        
        # Check if any chart data was suggested
        extracted_data = None
        if enhanced_content and ("chart data:" in enhanced_content.lower() or "data visualization:" in enhanced_content.lower()):
            # Try to extract any structured data for charts
            import re
            # Look for patterns like "Chart Data: X: Y, A: B" etc
            data_patterns = [
                r'(?:Chart Data|Data Visualization):\s*([^\n]+)',
                r'(?:Quantitative data):\s*([^\n]+)',
                r'(?:Statistics):\s*([^\n]+)'
            ]
            
            for pattern in data_patterns:
                matches = re.findall(pattern, enhanced_content, re.IGNORECASE)
                if matches:
                    extracted_data = {
                        "type": "suggested_visualization",
                        "content": matches[0].strip(),
                        "source": "search_enhanced"
                    }
                    break
        
        # Check if search was actually used by looking for indicators
        used_search = any(indicator in enhanced_content.lower() for indicator in [
            "according to", "recent data", "as of", "latest", "current", 
            "study shows", "research indicates", "survey found", "% of",
            "million", "billion", "growth", "increase", "decrease"
        ])
        
        logger.info(f"Content enhanced successfully (search used: {used_search})")
        
        # Return with correct field names for frontend
        return {
            "enhancedContent": enhanced_content,
            "extractedData": extracted_data,
            "sources": "Google Search via Gemini" if used_search else "AI-generated"
        }
        
    except Exception as e:
        logger.error(f"Error in content enhancement: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to basic enhancement without explicit search
        try:
            from agents.ai.clients import get_client, invoke
            
            # Try with configured content model if Gemini fails
            client, model_name = get_client(OUTLINE_CONTENT_MODEL)
            
            messages = [{
                "role": "user",
                "content": f"""Enhance this slide content: {content}

Enhancement request: {enhance_prompt}

Provide enhanced content suitable for a presentation slide with:
- Clear bullet points
- Specific examples or data points
- Professional tone
- Concise format"""
            }]
            
            enhanced_content = invoke(
                client=client,
                model=model_name,
                messages=messages,
                response_model=None,
                max_tokens=1000,
                temperature=0.7
            )
            
            return {
                "enhancedContent": enhanced_content,
                "extractedData": None,
                "sources": "AI-generated (fallback)"
            }
            
        except Exception as e2:
            logger.error(f"Fallback enhancement also failed: {e2}")
            return {
                "enhancedContent": content,
                "extractedData": None,
                "error": f"Enhancement failed: {str(e)}"
            }


# Legacy compatibility
async def process_openai_outline(request: OutlineRequest) -> OutlineResponse:
    """Legacy function name - redirects to process_outline"""
    return await process_outline(request)


async def process_openai_outline_stream(request: OutlineRequest, registry=None):
    """Legacy function name - redirects to process_outline_stream"""
    return await process_outline_stream(request, registry)


# Legacy aliases
OpenAIOutlineRequest = OutlineRequest
OpenAIOutlineResponse = OutlineResponse 
