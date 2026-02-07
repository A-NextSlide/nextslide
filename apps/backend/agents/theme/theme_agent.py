"""
ThemeAgent - Smart theme detection that understands context.

The agent decides:
1. Is this a REAL brand? → Fetch from Brandfetch
2. Is this INSPIRED by something? (Sonic, retro, etc.) → Generate contextual colors
3. Generic topic? → Generate nice complementary colors
4. User specified colors? → Use those

Simple. Agentic. Context-aware.
"""

import asyncio
import logging
import os
import json
import re
import sys
import aiohttp
from contextlib import asynccontextmanager
from difflib import SequenceMatcher
from typing import Dict, Any, Optional, List, Tuple, Literal

from pydantic import BaseModel, Field

from agents.application import get_event_bus, AGENT_EVENT

logger = logging.getLogger(__name__)

# Event bus for streaming status events
_event_bus = None

def _get_event_bus():
    global _event_bus
    if _event_bus is None:
        _event_bus = get_event_bus()
    return _event_bus

async def _emit_theme_status(phase: str, message: str, detail: Optional[str] = None) -> None:
    """Emit a status event for theme generation progress."""
    try:
        event_bus = _get_event_bus()
        await event_bus.emit(AGENT_EVENT, {
            "agent": "ThemeAgent",
            "phase": phase,
            "summary": message,
            "detail": detail,
            "type": "status",
            "status": phase,
            "message": message,
        })
    except Exception as e:
        logger.debug(f"[ThemeAgent] Failed to emit status event: {e}")


# Python 3.11+ has asyncio.timeout, but we need to support 3.9+
if sys.version_info >= (3, 11):
    from asyncio import timeout as async_timeout
else:
    @asynccontextmanager
    async def async_timeout(delay: float):
        """Compatibility wrapper for asyncio.timeout (Python 3.9+)."""
        async def _timeout_coro():
            await asyncio.sleep(delay)
            raise asyncio.TimeoutError(f"Operation timed out after {delay}s")

        timeout_task = asyncio.create_task(_timeout_coro())
        try:
            yield
        finally:
            timeout_task.cancel()
            try:
                await timeout_task
            except asyncio.CancelledError:
                pass

_font_service = None


class ThemeAnalysisResult(BaseModel):
    """Structured output for theme analysis to avoid JSON parsing issues."""
    type: Literal["real_brand", "inspired_by", "fictional_brand", "topic_based", "generic"] = "generic"
    brand: Optional[str] = None
    domain: Optional[str] = None
    inspiration: Optional[str] = None
    mood: Optional[str] = None
    color_hints: List[str] = Field(default_factory=list)
    brand_confidence: Optional[float] = None
    domain_confidence: Optional[float] = None

    def to_dict(self) -> Dict[str, Any]:
        if hasattr(self, "model_dump"):
            return self.model_dump()
        return self.dict()


def _get_font_service():
    global _font_service
    if _font_service is None:
        try:
            from services.enhanced_font_service import EnhancedFontService
            _font_service = EnhancedFontService()
        except Exception as e:
            logger.warning(f"[ThemeAgent] Failed to init EnhancedFontService: {e}")
            _font_service = None
    return _font_service


def _normalize_brand_token(value: Optional[str]) -> str:
    if not value:
        return ""
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _extract_domains_from_text(text: Optional[str]) -> List[str]:
    if not text:
        return []
    matches = re.findall(
        r"\b(?:https?://)?(?:www\.)?([a-z0-9.-]+\.[a-z]{2,})(?:/[^\s]*)?\b",
        str(text).lower(),
    )
    domains = []
    for match in matches:
        domain = match.split("/")[0].strip().strip(".")
        if domain and domain not in domains:
            domains.append(domain)
    return domains


def _normalize_domain(domain: Optional[str]) -> Optional[str]:
    if not domain:
        return None
    cleaned = str(domain).strip().lower()
    cleaned = re.sub(r"^https?://", "", cleaned)
    cleaned = cleaned.lstrip("www.")
    cleaned = cleaned.split("/")[0]
    cleaned = cleaned.split("?")[0]
    cleaned = cleaned.strip().strip(").,;:")
    if not cleaned:
        return None
    if not re.match(r"^[a-z0-9.-]+\.[a-z]{2,}$", cleaned):
        return None
    return cleaned


def _coerce_response_text(response: Any) -> str:
    if isinstance(response, dict):
        content = response.get("content")
        if isinstance(content, list):
            return " ".join(
                block.get("text", "")
                for block in content
                if isinstance(block, dict)
            ).strip()
        if content is not None:
            return str(content).strip()
        for key in ("text", "message", "output"):
            if key in response:
                return str(response.get(key) or "").strip()
        return str(response).strip()
    if isinstance(response, list):
        parts = []
        for item in response:
            if isinstance(item, dict):
                parts.append(item.get("text", ""))
            else:
                parts.append(str(item))
        return " ".join(parts).strip()
    return str(response).strip()


def _model_to_dict(value: Any) -> Dict[str, Any]:
    if isinstance(value, dict):
        return value
    if hasattr(value, "model_dump"):
        return value.model_dump()
    if hasattr(value, "dict"):
        return value.dict()
    return {}


def _extract_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text:
        return None
    cleaned = text.strip()

    # Handle markdown code fences (```json ... ``` or ``` ... ```)
    if "```" in cleaned:
        # Remove language specifier variations
        for lang in ["```json", "```JSON", "```Javascript", "```javascript"]:
            cleaned = cleaned.replace(lang, "```")
        parts = cleaned.split("```")
        # Take the first non-empty code block content
        for i, part in enumerate(parts):
            if i > 0 and part.strip():  # Skip the part before the first ```
                cleaned = part.strip()
                break

    # Find JSON object in the cleaned text
    match = re.search(r"\{[\s\S]*\}", cleaned)
    if match:
        json_str = match.group(0)
    elif "{" in cleaned:
        # Handle truncated JSON - find the opening brace and try to repair
        start_idx = cleaned.find("{")
        json_str = cleaned[start_idx:]
        # Count braces to determine how many closing braces we need
        open_braces = json_str.count("{") - json_str.count("}")
        open_brackets = json_str.count("[") - json_str.count("]")
        # Remove trailing comma if present
        json_str = json_str.rstrip().rstrip(",")
        # Close any open brackets/braces
        json_str += "]" * open_brackets + "}" * open_braces
        logger.info(f"[ThemeAgent] Attempting to repair truncated JSON (added {open_braces} braces, {open_brackets} brackets)")
    else:
        return None

    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.debug(f"[ThemeAgent] Initial JSON parse failed: {e}")
        # Best-effort cleanup of trailing commas
        fixed = re.sub(r",\s*([}\]])", r"\1", json_str)
        try:
            return json.loads(fixed)
        except json.JSONDecodeError as e2:
            logger.warning(f"[ThemeAgent] JSON parse failed after repair attempt: {e2}, json preview: {json_str[:200]}")
            return None


def _validate_font_against_registry(font_name: str) -> Optional[str]:
    """Validate that a font exists in the system registry."""
    if not font_name:
        return None

    try:
        font_service = _get_font_service()
        if font_service:
            match = font_service.match_font_name(font_name, include_remote=True)
            if match:
                return match

        from services.registry_fonts import RegistryFonts
        available_fonts = RegistryFonts.get_all_fonts_list(None)

        # Direct match
        if font_name in available_fonts:
            return font_name

        # Case-insensitive match
        font_lower = font_name.lower().strip()
        available_lower = {f.lower(): f for f in available_fonts}
        if font_lower in available_lower:
            return available_lower[font_lower]

        # Partial match
        for avail_font in available_fonts:
            if font_lower in avail_font.lower() or avail_font.lower() in font_lower:
                return avail_font

        return None
    except Exception as e:
        logger.warning(f"[ThemeAgent] Font validation error: {e}")
        return None


def _hex_to_rgb(color: str) -> Optional[tuple[int, int, int]]:
    if not isinstance(color, str):
        return None
    value = color.strip().lstrip('#')
    if len(value) == 3:
        value = ''.join(ch * 2 for ch in value)
    if len(value) != 6:
        return None
    try:
        return tuple(int(value[i:i + 2], 16) for i in (0, 2, 4))
    except ValueError:
        return None


def _color_distance(a: tuple[int, int, int], b: tuple[int, int, int]) -> float:
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2) ** 0.5


def _ensure_distinct_colors(colors: List[str], min_distance: float = 50) -> List[str]:
    """Filter out colors that are too close to each other in RGB space."""
    if not colors:
        return []
    distinct: List[str] = []
    for color in colors:
        rgb = _hex_to_rgb(color)
        if rgb is None:
            continue
        too_close = False
        for existing in distinct:
            existing_rgb = _hex_to_rgb(existing)
            if existing_rgb is None:
                continue
            if _color_distance(rgb, existing_rgb) < min_distance:
                too_close = True
                break
        if not too_close:
            distinct.append(color)
    return distinct


def _select_similar_font_for_brand(brand_name: str, available_fonts: Optional[List[str]] = None) -> Optional[str]:
    """Pick a font that loosely matches the brand name, when available."""
    if not brand_name:
        return None
    try:
        fonts = available_fonts
        if fonts is None:
            from services.registry_fonts import RegistryFonts
            fonts = RegistryFonts.get_all_fonts_list(None)
        brand_lower = brand_name.lower()
        for font in fonts:
            if brand_lower in font.lower():
                return font
    except Exception as e:
        logger.warning(f"[ThemeAgent] Font selection error: {e}")
    return None


class ThemeAgent:
    """
    Smart theme agent that understands context and makes appropriate decisions.
    """

    def __init__(self):
        pass

    def _normalize_domain(self, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        text = str(value).strip().lower()
        text = text.replace("https://", "").replace("http://", "")
        if text.startswith("www."):
            text = text[4:]
        if "/" in text:
            text = text.split("/")[0]
        if "?" in text:
            text = text.split("?")[0]
        return text.strip().strip(".") or None

    def _score_domain_for_brand(self, brand_name: Optional[str], domain: Optional[str]) -> float:
        brand_key = _normalize_brand_token(brand_name)
        domain_key = _normalize_brand_token(self._normalize_domain(domain))
        if not brand_key or not domain_key:
            return 0.0
        if brand_key == domain_key:
            return 1.0
        score = SequenceMatcher(None, brand_key, domain_key).ratio()
        if brand_key in domain_key or domain_key in brand_key:
            score += 0.2
        return min(score, 1.0)

    async def _search_brandfetch_candidates(self, brand_name: str) -> List[str]:
        if not brand_name:
            return []
        try:
            from services.brandfetch_service import BrandfetchService
            async with BrandfetchService() as service:
                results = await service.search_brands(brand_name, limit=6)
        except Exception as exc:
            logger.warning(f"[ThemeAgent] Brandfetch search failed: {exc}")
            return []

        candidates: List[str] = []
        for item in results or []:
            if not isinstance(item, dict):
                continue
            for key in ["domain", "dns", "website", "url"]:
                value = item.get(key)
                if isinstance(value, str) and value:
                    domain = self._normalize_domain(value)
                    if domain and domain not in candidates:
                        candidates.append(domain)
                    break
                if isinstance(value, list):
                    for candidate in value:
                        if isinstance(candidate, str) and candidate:
                            domain = self._normalize_domain(candidate)
                            if domain and domain not in candidates:
                                candidates.append(domain)
                            break
        return candidates

    async def _search_firecrawl_candidates(self, brand_name: str) -> List[str]:
        if not brand_name:
            return []
        try:
            from services.firecrawl_agent_service import FirecrawlAgentService, ExtractRequest
            service = FirecrawlAgentService()
            if not (service.is_configured() or service._perplexity_available()):
                return []
            req = ExtractRequest(
                query=f"official website for {brand_name}",
                max_chars=1200,
                timeout_seconds=40,
            )
            result = await service.extract(req)
            return _extract_domains_from_text(result.text or "")
        except Exception as exc:
            logger.warning(f"[ThemeAgent] Firecrawl domain search failed: {exc}")
            return []

    async def _resolve_brand_domain(
        self,
        brand_name: Optional[str],
        domain_hint: Optional[str],
        *,
        title: str,
        prompt: str,
        context: Optional[str],
    ) -> Tuple[Optional[str], List[str], float]:
        candidates: List[str] = []
        for source in [domain_hint, title, prompt, context]:
            for domain in _extract_domains_from_text(source):
                if domain not in candidates:
                    candidates.append(domain)

        if domain_hint:
            normalized_hint = self._normalize_domain(domain_hint)
            if normalized_hint and normalized_hint not in candidates:
                candidates.insert(0, normalized_hint)

        best_domain = None
        best_score = 0.0
        for domain in candidates:
            score = self._score_domain_for_brand(brand_name, domain)
            if score > best_score:
                best_score = score
                best_domain = domain
        if best_domain and best_score >= 0.75:
            return best_domain, candidates, best_score

        if brand_name:
            search_candidates = await self._search_brandfetch_candidates(brand_name)
            for domain in search_candidates:
                if domain not in candidates:
                    candidates.append(domain)

        best_domain = None
        best_score = 0.0
        for domain in candidates:
            score = self._score_domain_for_brand(brand_name, domain)
            if score > best_score:
                best_score = score
                best_domain = domain
        if best_domain and best_score >= 0.62:
            return best_domain, candidates, best_score

        if brand_name:
            firecrawl_candidates = await self._search_firecrawl_candidates(brand_name)
            for domain in firecrawl_candidates:
                if domain not in candidates:
                    candidates.append(domain)

        best_domain = None
        best_score = 0.0
        for domain in candidates:
            score = self._score_domain_for_brand(brand_name, domain)
            if score > best_score:
                best_score = score
                best_domain = domain
        if best_domain and best_score >= 0.62:
            return best_domain, candidates, best_score

        return None, candidates, best_score

    async def run(
        self,
        title: str,
        prompt: str,
        context: Optional[str] = None,
        include_videos: bool = False,
        include_brand_design: bool = False,
        available_videos: Optional[List[Dict[str, Any]]] = None,
        brand_domain: Optional[str] = None,
        brand_name: Optional[str] = None,
        domain_confirmed: Optional[bool] = None,
    ) -> Dict[str, Any]:
        """
        Run the theme agent to determine the best theme for the presentation.

        Returns:
            Dict with: colors, background, text, accent, accent2, fonts, logo_url, source
        """
        logger.info(f"[ThemeAgent] Starting for: {title[:50]}...")
        await _emit_theme_status("analyzing_theme", "Analyzing your presentation topic...")

        # Default result
        result = {
            "brand_name": None,
            "domain": None,
            "brand_domain_candidates": [],
            "needs_domain_confirmation": False,
            "brand_confidence": 0.0,
            "domain_confidence": 0.0,
            "colors": [],
            "background": "#FFFFFF",
            "text": "#1A1A1A",
            "accent": None,
            "accent2": None,
            "fonts": {"hero": "Inter", "body": "Inter"},
            "logo_url": None,
            "videos": [],  # List of video dicts from the brand's website
            "source": "default"
        }

        # FAST PATH: Check if we have curated brand data in cache
        # If brand_domain or brand_name is provided, try direct cache lookup first
        # This bypasses all AI analysis and uses admin-curated data directly
        try:
            if brand_domain or brand_name:
                from services.brand_cache_direct import get_cached_brand_direct
                lookup_key = brand_domain or brand_name
                cached_brand = get_cached_brand_direct(lookup_key)

                if cached_brand and cached_brand.get("found"):
                    colors = cached_brand.get("colors", {})
                    fonts = cached_brand.get("fonts", {})

                    # Only use cache if we have meaningful data (not all defaults)
                    has_colors = colors.get("accent") or colors.get("background") != "#FFFFFF"
                    has_fonts = fonts.get("hero") and fonts.get("hero") not in ("Montserrat", "Inter", "Open Sans")

                    if has_colors or has_fonts:
                        result["brand_name"] = cached_brand.get("brand_name")
                        result["domain"] = cached_brand.get("domain")
                        result["brand_domain_candidates"] = [cached_brand.get("domain")] if cached_brand.get("domain") else []
                        result["needs_domain_confirmation"] = False
                        result["brand_confidence"] = 1.0
                        result["domain_confidence"] = 1.0
                        result["background"] = colors.get("background") or "#FFFFFF"
                        result["text"] = colors.get("text") or "#1A1A1A"
                        result["accent"] = colors.get("accent")
                        result["accent2"] = colors.get("accent2")
                        result["colors"] = [c for c in [colors.get("accent"), colors.get("accent2"), colors.get("background")] if c]
                        result["logo_url"] = cached_brand.get("logo_url")
                        result["source"] = "cache_direct"

                        # Use cached fonts if available
                        if fonts.get("hero"):
                            result["fonts"]["hero"] = fonts["hero"]
                        if fonts.get("body"):
                            result["fonts"]["body"] = fonts["body"]

                        logger.info(
                            f"[ThemeAgent] FAST PATH: Using cached brand data for {lookup_key} - "
                            f"colors: bg={result['background']}, accent={result['accent']}, "
                            f"fonts: {result['fonts']}"
                        )

                        # Add videos if requested
                        if available_videos is not None:
                            result["videos"] = available_videos
                        elif include_videos and result.get("domain"):
                            try:
                                videos = await self._fetch_brand_videos(result["domain"])
                                result["videos"] = videos
                            except Exception:
                                pass

                        return result
        except Exception as e:
            logger.warning(f"[ThemeAgent] Fast path cache lookup failed: {e}")
            # Continue with normal flow

        try:
            explicit_domain = _normalize_domain(brand_domain)
            explicit_brand_name = (brand_name or "").strip() or None
            domain_is_confirmed = domain_confirmed if domain_confirmed is not None else bool(explicit_domain)

            # Step 1: Ask AI to analyze what kind of theme we need
            logger.info(f"[ThemeAgent] Step 1: Analyzing theme needs...")
            await _emit_theme_status("detecting_brand", f"Analyzing: {title[:60]}...")
            theme_analysis = await self._analyze_theme_needs(title, prompt, context)
            logger.info(f"[ThemeAgent] Analysis result: {theme_analysis}")

            # Emit the analysis result
            theme_type = theme_analysis.get("type", "generic") if theme_analysis else "generic"
            inspiration = theme_analysis.get("inspiration", "") if theme_analysis else ""
            mood = theme_analysis.get("mood", "") if theme_analysis else ""
            detail_parts = []
            if theme_type == "real_brand":
                detail_parts.append(f"Detected brand: {theme_analysis.get('brand', 'unknown')}")
            elif theme_type == "inspired_by" and inspiration:
                detail_parts.append(f"Style: {inspiration[:50]}")
            elif theme_type == "topic_based":
                detail_parts.append(f"Topic-based theme")
            if mood:
                detail_parts.append(f"Mood: {mood[:40]}")
            if detail_parts:
                await _emit_theme_status("analyzed", " | ".join(detail_parts))

            if not theme_analysis:
                logger.warning("[ThemeAgent] Analysis failed, using defaults")
                return result

            theme_type = theme_analysis.get("type", "generic")
            brand_name = explicit_brand_name or theme_analysis.get("brand")
            domain_hint = theme_analysis.get("domain")
            brand_confidence_raw = theme_analysis.get("brand_confidence")
            domain_confidence_raw = theme_analysis.get("domain_confidence")
            brand_confidence = float(brand_confidence_raw) if brand_confidence_raw is not None else None
            domain_confidence = float(domain_confidence_raw) if domain_confidence_raw is not None else None
            result["brand_confidence"] = brand_confidence or 0.0
            result["domain_confidence"] = domain_confidence or 0.0

            if theme_type == "real_brand" and brand_name and brand_confidence is not None and brand_confidence < 0.55:
                logger.info(
                    "[ThemeAgent] Brand confidence too low (%.2f) for '%s'; skipping brandfetch",
                    brand_confidence,
                    brand_name,
                )
                theme_analysis["inspiration"] = theme_analysis.get("inspiration") or brand_name
                theme_type = "inspired_by"

            resolved_domain = None
            domain_candidates: List[str] = []
            domain_score = 0.0
            if explicit_domain:
                if not domain_is_confirmed:
                    result["brand_name"] = brand_name or explicit_domain
                    result["brand_domain_candidates"] = [explicit_domain]
                    result["needs_domain_confirmation"] = True
                    theme_analysis["inspiration"] = theme_analysis.get("inspiration") or result["brand_name"]
                    theme_type = "inspired_by"
                else:
                    resolved_domain = explicit_domain
                    domain_candidates = [explicit_domain]
                    domain_score = 1.0
                    theme_type = "real_brand"
            elif theme_type == "real_brand" and brand_name:
                if domain_hint and domain_confidence is not None and domain_confidence < 0.6:
                    logger.info(
                        "[ThemeAgent] Domain confidence too low (%.2f) for '%s'; ignoring hint '%s'",
                        domain_confidence,
                        brand_name,
                        domain_hint,
                    )
                    domain_hint = None
                resolved_domain, domain_candidates, domain_score = await self._resolve_brand_domain(
                    brand_name,
                    domain_hint,
                    title=title,
                    prompt=prompt,
                    context=context,
                )

                if resolved_domain:
                    validation = await self._validate_domain_match(
                        brand_name=brand_name,
                        domain=resolved_domain,
                        title=title,
                        prompt=prompt,
                        context=context,
                    )
                    if validation and validation.get("match") is False:
                        logger.info(
                            "[ThemeAgent] Domain validation rejected '%s' for '%s': %s",
                            resolved_domain,
                            brand_name,
                            validation.get("reason", "mismatch"),
                        )
                        result["brand_name"] = brand_name
                        result["brand_domain_candidates"] = list(
                            dict.fromkeys([resolved_domain, *domain_candidates])
                        )
                        result["needs_domain_confirmation"] = True
                        theme_analysis["inspiration"] = theme_analysis.get("inspiration") or brand_name
                        theme_type = "inspired_by"
                        resolved_domain = None

                if not resolved_domain:
                    result["brand_name"] = brand_name
                    if domain_candidates:
                        result["brand_domain_candidates"] = domain_candidates
                        result["needs_domain_confirmation"] = True
                    # Fall back to inspired_by so we still use known colors without brandfetch
                    theme_analysis["inspiration"] = theme_analysis.get("inspiration") or brand_name
                    theme_type = "inspired_by"

            # Step 2: Handle based on theme type
            if theme_type == "real_brand" and resolved_domain:
                # Real brand - try Brandfetch
                domain = resolved_domain
                logger.info(f"[ThemeAgent] Real brand detected: {brand_name} → {domain} (score={domain_score:.2f})")
                await _emit_theme_status("fetching_brand_colors", f"Fetching brand colors from {domain}...")
                brand_data = await self._fetch_brandfetch(domain, brand_name=brand_name)

                if brand_data and brand_data.get("colors"):
                    result["brand_name"] = brand_name
                    result["domain"] = domain
                    result["colors"] = brand_data["colors"]

                    # Use categorized colors if available for intelligent theme assignment
                    categorized = brand_data.get("categorized") or {}
                    backgrounds = categorized.get("backgrounds", [])
                    accents = categorized.get("accent", [])
                    text_colors = categorized.get("text", [])

                    # Determine background: prefer light backgrounds from categorization, else white
                    if backgrounds:
                        # Pick the lightest background (usually better for presentations)
                        result["background"] = backgrounds[0]
                        logger.info(f"[ThemeAgent] Using categorized background: {result['background']}")
                    else:
                        result["background"] = "#FFFFFF"

                    # Determine accent colors: use categorized accents or fallback to raw colors
                    if accents:
                        result["accent"] = accents[0]
                        result["accent2"] = accents[1] if len(accents) > 1 else None
                        logger.info(f"[ThemeAgent] Using categorized accents: {result['accent']}, {result['accent2']}")
                    else:
                        result["accent"] = brand_data["colors"][0] if brand_data["colors"] else None
                        result["accent2"] = brand_data["colors"][1] if len(brand_data["colors"]) > 1 else None

                    # Determine text color: use categorized text WITH contrast validation
                    bg_rgb = _hex_to_rgb(result["background"])
                    bg_brightness = (bg_rgb[0] * 299 + bg_rgb[1] * 587 + bg_rgb[2] * 114) / 1000 if bg_rgb else 255

                    selected_text = None
                    if text_colors:
                        # Find a text color with sufficient contrast against the background
                        for txt_color in text_colors:
                            txt_rgb = _hex_to_rgb(txt_color)
                            if txt_rgb:
                                txt_brightness = (txt_rgb[0] * 299 + txt_rgb[1] * 587 + txt_rgb[2] * 114) / 1000
                                # Need significant brightness difference (at least 100) for readability
                                if abs(bg_brightness - txt_brightness) > 100:
                                    selected_text = txt_color
                                    logger.info(f"[ThemeAgent] Using categorized text with good contrast: {selected_text}")
                                    break
                        if not selected_text:
                            logger.info(f"[ThemeAgent] Categorized text colors {text_colors} have poor contrast with background {result['background']}")

                    if selected_text:
                        result["text"] = selected_text
                    else:
                        # Fallback: pick appropriate contrast based on background brightness
                        result["text"] = "#1A1A1A" if bg_brightness > 128 else "#FFFFFF"
                        logger.info(f"[ThemeAgent] Using computed text color for contrast: {result['text']}")

                    result["logo_url"] = brand_data.get("logo_url")
                    if not result["logo_url"]:
                        logo_url = await self._fetch_logo_from_website(domain)
                        if logo_url:
                            result["logo_url"] = logo_url
                    if not result["logo_url"]:
                        logo_url = await self._fetch_logo_fallback(domain, brand_name)
                        if logo_url:
                            result["logo_url"] = logo_url
                    result["source"] = "brandfetch"

                    # Get fonts
                    if brand_data.get("fonts"):
                        hero_font = brand_data["fonts"][0]
                        body_font = brand_data["fonts"][1] if len(brand_data["fonts"]) > 1 else None
                        validated_hero = _validate_font_against_registry(hero_font)
                        validated_body = _validate_font_against_registry(body_font) if body_font else None
                        if validated_hero:
                            result["fonts"]["hero"] = validated_hero
                        if validated_body:
                            result["fonts"]["body"] = validated_body
                        if not validated_hero or not validated_body:
                            applied_brand_fonts = False
                            if brand_name:
                                try:
                                    from agents.tools.theme.font_intelligence import select_fonts_for_brand

                                    brand_fonts = await select_fonts_for_brand(
                                        brand_name=brand_name,
                                        brand_domain=domain,
                                        content_topic=title,
                                    )
                                    if not validated_hero and brand_fonts.get("hero"):
                                        result["fonts"]["hero"] = brand_fonts["hero"]
                                    if not validated_body and brand_fonts.get("body"):
                                        if brand_fonts["body"] != result["fonts"]["hero"]:
                                            result["fonts"]["body"] = brand_fonts["body"]
                                    applied_brand_fonts = True
                                except Exception as exc:
                                    logger.warning(f"[ThemeAgent] Brand font intelligence failed: {exc}")
                            if not applied_brand_fonts:
                                font_service = _get_font_service()
                                if font_service:
                                    pair = font_service.select_font_pair(
                                        deck_title=title,
                                        vibe=theme_analysis.get("mood") or "modern",
                                        content_keywords=[brand_name] if brand_name else None,
                                        variety_seed=f"{title}-{brand_name}",
                                    )
                                    if pair:
                                        if not validated_hero and pair.get("hero"):
                                            result["fonts"]["hero"] = pair["hero"]
                                        if not validated_body and pair.get("body"):
                                            if pair["body"] != result["fonts"]["hero"]:
                                                result["fonts"]["body"] = pair["body"]

                    if available_videos is not None:
                        result["videos"] = available_videos
                        logger.info(f"[ThemeAgent] 🎬 Using pre-scraped videos: {len(available_videos)}")
                    elif include_videos:
                        # Fetch videos from the brand's website (parallel, non-blocking)
                        try:
                            videos = await self._fetch_brand_videos(domain)
                            result["videos"] = videos
                            if videos:
                                logger.info(f"[ThemeAgent] 🎬 Found {len(videos)} videos from {domain}")
                        except Exception as e:
                            logger.warning(f"[ThemeAgent] Video fetch error (non-blocking): {e}")
                    else:
                        logger.info("[ThemeAgent] 🎬 Skipping video fetch (instant theme mode)")

                    if include_brand_design:
                        # Also fetch brand design (screenshot + additional context) for visual reference
                        try:
                            brand_design = await self._fetch_brand_design(domain, include_screenshot=True)
                            if brand_design:
                                result["brand_design"] = brand_design
                                logger.info(f"[ThemeAgent] 🎨 Got brand design context for {domain}")
                        except Exception as e:
                            logger.warning(f"[ThemeAgent] Brand design fetch error (non-blocking): {e}")
                    else:
                        logger.info("[ThemeAgent] 🎨 Skipping brand design fetch (instant theme mode)")

                    logger.info(f"[ThemeAgent] ✅ Brandfetch success: {result['colors'][:3]}")
                    return result
                else:
                    # Brandfetch failed, optionally try Firecrawl brand design for colors/logo
                    brand_design = None
                    if include_brand_design:
                        logger.info("[ThemeAgent] Brandfetch failed, trying Firecrawl brand design...")
                        brand_design = await self._fetch_brand_design(domain, include_screenshot=False)
                    else:
                        logger.info("[ThemeAgent] 🎨 Skipping brand design fetch (instant theme mode)")

                    if brand_design:
                        result["brand_design"] = brand_design
                        result["domain"] = domain
                        result["brand_name"] = theme_analysis.get("brand")

                        # Extract colors from Firecrawl branding
                        fc_colors = brand_design.get("colors", {})
                        if fc_colors:
                            # Build color list from Firecrawl branding
                            color_list = []
                            for key in ["primary", "secondary", "accent", "background"]:
                                if fc_colors.get(key):
                                    color_list.append(fc_colors[key])

                            if color_list:
                                result["colors"] = color_list
                                result["accent"] = fc_colors.get("primary") or fc_colors.get("accent")
                                result["accent2"] = fc_colors.get("secondary") or fc_colors.get("accent")
                                result["background"] = fc_colors.get("background", "#FFFFFF")
                                result["text"] = fc_colors.get("textPrimary", "#1A1A1A")
                                result["source"] = "firecrawl_branding"
                                logger.info(f"[ThemeAgent] ✅ Firecrawl branding colors: {color_list[:3]}")

                        # Extract logo
                        if brand_design.get("logo"):
                            result["logo_url"] = brand_design["logo"]

                        # Extract fonts (Firecrawl returns dicts like {'family': 'Arial', 'count': 102})
                        fc_fonts = brand_design.get("fonts", [])
                        if fc_fonts:
                            first_font = fc_fonts[0]
                            font_name = first_font.get('family') if isinstance(first_font, dict) else first_font
                        if font_name:
                            validated = _validate_font_against_registry(font_name)
                            if validated:
                                result["fonts"]["hero"] = validated
                    elif include_brand_design:
                        # Full fallback - just try to get logo
                        logo_url = await self._fetch_logo_from_website(domain)
                        if logo_url:
                            result["logo_url"] = logo_url
                            result["domain"] = domain
                            result["brand_name"] = theme_analysis.get("brand")
                    else:
                        logger.info("[ThemeAgent] 🎨 Skipping logo fetch (instant theme mode)")
                        logo_url = await self._fetch_logo_fallback(domain, brand_name)
                        if logo_url:
                            result["logo_url"] = logo_url

                    if available_videos is not None:
                        result["videos"] = available_videos
                        logger.info(f"[ThemeAgent] 🎬 Using pre-scraped videos: {len(available_videos)}")
                    elif include_videos:
                        # Still try to fetch videos even if Brandfetch failed
                        try:
                            videos = await self._fetch_brand_videos(domain)
                            result["videos"] = videos
                            if videos:
                                logger.info(f"[ThemeAgent] 🎬 Found {len(videos)} videos from {domain}")
                        except Exception as e:
                            logger.warning(f"[ThemeAgent] Video fetch error (non-blocking): {e}")
                    else:
                        logger.info("[ThemeAgent] 🎬 Skipping video fetch (instant theme mode)")

            # Step 3: Generate contextual colors based on the theme
            # This handles: inspired_by, fictional_brand, topic_based, generic
            logger.info(f"[ThemeAgent] Step 3: Generating contextual theme (type={theme_type}, inspiration={theme_analysis.get('inspiration')})")
            inspiration_hint = theme_analysis.get('inspiration', '')[:40] if theme_analysis else ''
            await _emit_theme_status("generating_theme", f"Generating colors{' for ' + inspiration_hint if inspiration_hint else ''}...")
            contextual_theme = await self._generate_contextual_theme(
                title=title,
                prompt=prompt,
                context=context,
                inspiration=theme_analysis.get("inspiration"),
                mood=theme_analysis.get("mood"),
                theme_type=theme_type,
                color_hints=theme_analysis.get("color_hints"),
            )

            if contextual_theme:
                result["colors"] = contextual_theme.get("colors", [])
                result["background"] = contextual_theme.get("background", "#FFFFFF")
                result["text"] = contextual_theme.get("text", "#1A1A1A")
                result["accent"] = contextual_theme.get("accent")
                result["accent2"] = contextual_theme.get("accent2")
                result["fonts"] = contextual_theme.get("fonts", result["fonts"])
                result["source"] = contextual_theme.get("source", "ai_generated")

                logger.info(f"[ThemeAgent] Contextual theme: {result['colors'][:3]}, source={result['source']}")
                # Emit completion with actual color info
                bg = result.get('background', '#FFFFFF')
                accent = result.get('accent', '')
                fonts = result.get('fonts', {})
                hero_font = fonts.get('hero', 'Default')
                completion_msg = f"Colors: {bg}"
                if accent:
                    completion_msg += f", {accent}"
                completion_msg += f" | Font: {hero_font}"
                await _emit_theme_status("theme_complete", completion_msg)

            return result

        except Exception as e:
            logger.error(f"[ThemeAgent] Error: {e}")
            return result

    async def _validate_domain_match(
        self,
        *,
        brand_name: Optional[str],
        domain: str,
        title: str,
        prompt: str,
        context: Optional[str],
    ) -> Optional[Dict[str, Any]]:
        """Ask the model if a domain matches the user request."""
        try:
            from agents.ai.clients import get_client, invoke
            from agents.config import THEME_MODEL

            domain_clean = _normalize_domain(domain)
            if not domain_clean:
                return None

            validation_prompt = (
                "Decide if the domain belongs to the same entity described in the request. "
                "If uncertain, return match=false.\n\n"
                f"Title: {title}\n"
                f"Prompt: {prompt}\n"
                f"Context: {context or 'None'}\n"
                f"Brand name: {brand_name or 'Unknown'}\n"
                f"Domain: {domain_clean}\n\n"
                "Return JSON: {\"match\": true|false, \"confidence\": 0.0-1.0, \"reason\": \"...\"}"
            )

            client, actual_model = get_client(THEME_MODEL)
            if not client or not actual_model:
                return None

            response = await asyncio.to_thread(
                invoke,
                client,
                actual_model,
                [{"role": "user", "content": validation_prompt}],
                None,
                500,
                0.0,
            )
            parsed = _extract_json_object(_coerce_response_text(response))
            if isinstance(parsed, dict):
                return parsed
        except Exception as e:
            logger.warning("[ThemeAgent] Domain validation failed: %s", e)
        return None

    async def _analyze_theme_needs(self, title: str, prompt: str, context: Optional[str]) -> Optional[Dict[str, Any]]:
        """
        Use AI to analyze what kind of theme is needed.

        Returns:
            {
                "type": "real_brand" | "inspired_by" | "fictional_brand" | "topic_based" | "generic",
                "brand": str or None,
                "domain": str or None (for real brands),
                "inspiration": str or None (what it's inspired by - e.g., "Sonic the Hedgehog", "retro gaming"),
                "mood": str (e.g., "fun", "professional", "energetic", "calm"),
                "suggested_colors": list or None (if user mentioned colors)
            }
        """
        try:
            from agents.ai.clients import get_client, invoke
            from agents.config import THEME_MODEL

            analysis_prompt = f"""Analyze this presentation to determine the best theme approach.

Title: {title}
Prompt: {prompt}
Context: {context or 'None'}

Determine:
1. Is this about a REAL company/brand with a website? (e.g., Apple, Nike, McDonald's)
2. Is this INSPIRED BY something with known colors? (e.g., "Sonic the Hedgehog" = blue/red/gold, "retro gaming" = neon colors)
3. Is this a fictional brand that should look like something? (e.g., "SonicVerse" should look Sonic-inspired)
4. Is this topic-based where colors should match the subject? (e.g., "Ocean Conservation" = blues/greens)
5. Is this generic where any nice colors work?

        Return JSON:
{{
    "type": "real_brand" | "inspired_by" | "fictional_brand" | "topic_based" | "generic",
    "brand": "brand name if applicable",
    "domain": "domain.com if it's a real brand with a website, null otherwise",
    "inspiration": "what it's inspired by (e.g., 'Sonic the Hedgehog', 'retro arcade games', 'ocean/nature')",
    "mood": "fun/professional/energetic/calm/bold/playful/serious",
    "color_hints": ["any colors mentioned or implied, e.g., 'blue', 'Sonic blue', 'neon'"],
    "brand_confidence": 0.0,
    "domain_confidence": 0.0
}}

IMPORTANT:
- "real_brand" = companies/brands with websites (Apple, Nike, etc.) - we'll fetch their official colors
- "inspired_by" = inspired by something with recognizable colors (Sonic, Star Wars, retro gaming, etc.)
- For fictional variants like "SonicVerse" - type should be "inspired_by" with inspiration="Sonic the Hedgehog"
- Only include a domain if you are highly confident it is correct.
- If brand is ambiguous, set type to "topic_based" or "generic" and leave domain null.
- If a URL or domain is present in the title/prompt/context, treat it as a real brand and set domain to it.
- Always identify the core INSPIRATION so we can generate appropriate colors"""

            client, actual_model = get_client(THEME_MODEL)
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for {THEME_MODEL}")
                return None
            logger.info(f"[ThemeAgent] Using model: {actual_model}")
            try:
                analysis = invoke(
                    client=client,
                    model=actual_model,
                    messages=[{"role": "user", "content": analysis_prompt}],
                    response_model=ThemeAnalysisResult,
                    max_tokens=2000,
                    temperature=0,
                    theme_generation=True
                )
                analysis_dict = _model_to_dict(analysis)
                logger.info(f"[ThemeAgent] Analysis result: {analysis_dict}")
                if analysis_dict:
                    return analysis_dict
            except Exception as exc:
                logger.warning(f"[ThemeAgent] Structured analysis failed, falling back to JSON parse: {exc}")

            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": analysis_prompt}],
                max_tokens=2000,
                temperature=0,
                theme_generation=True
            )
            logger.info(f"[ThemeAgent] Analysis response type: {type(response)}, preview: {str(response)[:200]}")

            parsed = _extract_json_object(_coerce_response_text(response))
            if isinstance(parsed, dict):
                return parsed
            logger.warning("[ThemeAgent] Failed to parse analysis: %s", str(response)[:200])
            return None

        except Exception as e:
            import traceback
            logger.error(f"[ThemeAgent] Analysis error: {e}")
            logger.error(f"[ThemeAgent] Analysis traceback: {traceback.format_exc()}")
            return None

    async def _fetch_brandfetch(
        self,
        domain: str,
        brand_name: Optional[str] = None,
    ) -> Optional[Dict[str, Any]]:
        """Fetch brand data from Brandfetch with timeout."""
        try:
            from services.simple_brandfetch_cache import SimpleBrandfetchCache

            db_url = os.getenv('DATABASE_URL')
            if not db_url:
                logger.warning("[ThemeAgent] No DATABASE_URL")
                return None

            logger.info(f"[ThemeAgent] Fetching Brandfetch: {domain}")

            def _collect_hex_candidates(value: Any) -> List[str]:
                candidates: List[str] = []
                if value is None:
                    return candidates
                if isinstance(value, dict):
                    for key in ("hex", "color", "value"):
                        if key in value:
                            candidates.extend(_collect_hex_candidates(value.get(key)))
                    return candidates
                if isinstance(value, list):
                    for item in value:
                        candidates.extend(_collect_hex_candidates(item))
                    return candidates
                raw = str(value).strip()
                if not raw:
                    return candidates
                for match in re.findall(r"#(?:[0-9a-fA-F]{6}|[0-9a-fA-F]{3})", raw):
                    candidates.append(match.upper())
                if not candidates:
                    cleaned = raw.lstrip("#")
                    if re.match(r"^[0-9a-fA-F]{3}([0-9a-fA-F]{3})?$", cleaned):
                        candidates.append(f"#{cleaned.upper()}")
                return candidates

            def _extract_colors_from_brand_data(data: Dict[str, Any]) -> List[str]:
                colors_data = data.get('colors', {}) if isinstance(data, dict) else {}
                extracted: List[str] = []
                if isinstance(colors_data, dict):
                    labeled_keys = (
                        "accent",
                        "accent2",
                        "primary",
                        "secondary",
                        "background",
                        "text",
                        "textPrimary",
                    )
                    for key in labeled_keys:
                        extracted.extend(_collect_hex_candidates(colors_data.get(key)))
                    if extracted:
                        extracted = list(dict.fromkeys(extracted))
                        return extracted
                    for key in ("hex_list", "hex", "colors", "primary", "secondary", "accent", "all"):
                        extracted = _collect_hex_candidates(colors_data.get(key))
                        if extracted:
                            break
                else:
                    extracted = _collect_hex_candidates(colors_data)
                if extracted:
                    extracted = list(dict.fromkeys(extracted))
                return extracted

            def _colors_look_suspicious(values: List[str]) -> bool:
                if not values:
                    return True
                valid_six = [
                    c for c in values
                    if isinstance(c, str) and re.match(r"^#[0-9A-F]{6}$", c)
                ]
                if len(valid_six) >= 2:
                    return False
                if len(values) == 1 and isinstance(values[0], str) and re.match(r"^#[0-9A-F]{3}$", values[0]):
                    return True
                return True

            brand_data = None
            colors: List[str] = []
            categorized_colors: Dict[str, Any] = {}

            try:
                async with async_timeout(15):
                    async with SimpleBrandfetchCache(db_url) as cache:
                        brand_data = await cache.get_brand_data(domain)
                        if brand_data and not brand_data.get("error"):
                            def _attach_logo(data: Dict[str, Any]) -> None:
                                logo_url = None
                                try:
                                    logo_url = cache.get_best_logo(data)
                                except Exception:
                                    logo_url = None
                                data["logo_url"] = data.get("logo_url") or logo_url

                            _attach_logo(brand_data)

                            # Use intelligent color categorization from BrandfetchService
                            try:
                                categorized_colors = cache.get_categorized_colors(brand_data)
                                logger.info(
                                    "[ThemeAgent] Categorized colors for %s: backgrounds=%s, accent=%s, text=%s",
                                    domain,
                                    categorized_colors.get("backgrounds", [])[:2],
                                    categorized_colors.get("accent", [])[:2],
                                    categorized_colors.get("text", [])[:2],
                                )
                            except Exception as cat_err:
                                logger.warning("[ThemeAgent] Color categorization failed: %s", cat_err)
                                categorized_colors = {}

                            colors = _extract_colors_from_brand_data(brand_data)
                            if _colors_look_suspicious(colors):
                                logger.warning(
                                    "[ThemeAgent] Suspicious Brandfetch colors for %s: %s. Forcing refresh.",
                                    domain,
                                    colors[:3],
                                )
                                refreshed = await cache.get_brand_data(domain, force_refresh=True)
                                if refreshed and not refreshed.get("error"):
                                    _attach_logo(refreshed)
                                    brand_data = refreshed
                                    colors = _extract_colors_from_brand_data(brand_data)
                                    # Re-categorize after refresh
                                    try:
                                        categorized_colors = cache.get_categorized_colors(brand_data)
                                    except Exception:
                                        pass
                                    if colors:
                                        logger.info(
                                            "[ThemeAgent] Brandfetch refresh colors for %s: %s",
                                            domain,
                                            colors[:3],
                                        )
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Brandfetch timeout: {domain}")
                return None

            if brand_data and not brand_data.get('error'):
                if not colors:
                    colors = _extract_colors_from_brand_data(brand_data)
                if brand_name and colors:
                    if "instacart" in brand_name.lower():
                        def _green_score(hex_color: str) -> int:
                            rgb = _hex_to_rgb(hex_color)
                            if not rgb:
                                return -10_000
                            r, g, b = rgb
                            return g - max(r, b)

                        best_color = max(colors, key=_green_score)
                        if _green_score(best_color) > 0:
                            colors = [best_color] + [c for c in colors if c != best_color]

                # Extract fonts with type awareness (title/hero vs body)
                fonts_data = brand_data.get('fonts', {})
                hero_font = None
                body_font = None
                if isinstance(fonts_data, dict):
                    all_fonts = fonts_data.get('all', [])
                    for font_entry in all_fonts:
                        if isinstance(font_entry, dict):
                            font_name = font_entry.get('name', '')
                            font_type = font_entry.get('type', '').lower()
                            # Skip generic CSS fallbacks
                            if font_name.lower() in ('sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'):
                                continue
                            if font_type in ('title', 'heading', 'hero', 'display', 'primary'):
                                if not hero_font:
                                    hero_font = font_name
                            elif font_type in ('body', 'text', 'paragraph', 'secondary'):
                                if not body_font:
                                    body_font = font_name
                            elif not hero_font:
                                # Default: first non-generic font becomes hero
                                hero_font = font_name
                            elif not body_font:
                                body_font = font_name
                    # Fallback to names list if no typed fonts found
                    if not hero_font and not body_font:
                        names = fonts_data.get('names', [])
                        for name in names:
                            if name.lower() not in ('sans-serif', 'serif', 'monospace', 'cursive', 'fantasy'):
                                if not hero_font:
                                    hero_font = name
                                elif not body_font:
                                    body_font = name
                                    break
                fonts = [f for f in [hero_font, body_font] if f]

                # Extract logo
                logo_url = brand_data.get("logo_url")
                if not logo_url:
                    logos = brand_data.get('logos', {}) or {}
                    for logo_type in ['light', 'dark', 'icons', 'other']:
                        items = logos.get(logo_type, [])
                        if not items or not isinstance(items, list):
                            continue
                        for item in items:
                            if not isinstance(item, dict):
                                continue
                            formats = item.get('formats', [])
                            if not formats:
                                continue
                            for fmt in formats:
                                if not isinstance(fmt, dict):
                                    continue
                                candidate = fmt.get('url') or fmt.get('src')
                                if candidate:
                                    logo_url = candidate
                                    break
                            if logo_url:
                                break
                        if logo_url:
                            break
                if not logo_url:
                    logo_url = await self._fetch_logo_fallback(domain, brand_name)

                return {
                    "colors": [c.upper() if isinstance(c, str) else c for c in colors if c],
                    "fonts": fonts,
                    "logo_url": logo_url,
                    # Include categorized colors for intelligent theme assignment
                    "categorized": categorized_colors if categorized_colors else None,
                }

            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brandfetch error: {e}")
            return None

    async def _fetch_brand_videos(self, domain: str, max_videos: int = 5) -> List[Dict[str, Any]]:
        """
        Fetch videos from a brand's website.

        Args:
            domain: Brand domain (e.g., 'dyna.co')
            max_videos: Maximum number of videos to return

        Returns:
            List of video dictionaries with url, source_type, thumbnail, etc.
        """
        try:
            from services.video_scraper_service import get_brand_videos

            logger.info(f"[ThemeAgent] 🎬 Fetching videos from: {domain}")

            # Set timeout for video fetching (longer for browser-based scraping)
            try:
                async with async_timeout(30):
                    videos = await get_brand_videos(domain, max_videos, use_browser=True)
                    if videos:
                        logger.info(f"[ThemeAgent] 🎬 Found {len(videos)} videos from {domain}")
                    return videos
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Video fetch timeout for {domain}")
                return []

        except Exception as e:
            logger.warning(f"[ThemeAgent] Video fetch error for {domain}: {e}")
            return []

    async def _fetch_brand_design(self, domain: str, include_screenshot: bool = True) -> Optional[Dict[str, Any]]:
        """
        Fetch comprehensive brand design from website using Firecrawl.

        Returns colors, fonts, logo, AND screenshot for visual reference.
        This is used to give the custom component generator visual context.
        """
        try:
            from services.firecrawl_service import get_firecrawl_service

            firecrawl = get_firecrawl_service()
            if not firecrawl.is_configured():
                logger.warning("[ThemeAgent] Firecrawl not configured for brand design")
                return None

            url = f"https://{domain}"
            logger.info(f"[ThemeAgent] 🎨 Fetching brand design from {url}")

            # Run in executor since it's a blocking HTTP call
            loop = asyncio.get_event_loop()
            try:
                async with async_timeout(30):
                    result = await loop.run_in_executor(
                        None,
                        lambda: firecrawl.extract_brand_design(url, include_screenshot=include_screenshot)
                    )
            except asyncio.TimeoutError:
                logger.warning(f"[ThemeAgent] Brand design fetch timeout for {domain}")
                return None

            if not result.get("success"):
                logger.warning(f"[ThemeAgent] Brand design fetch failed: {result.get('error')}")
                return None

            brand_design = result.get("data", {})

            # Log what we got
            colors = brand_design.get("colors", {})
            fonts = brand_design.get("fonts", [])
            has_screenshot = bool(brand_design.get("screenshot"))
            has_logo = bool(brand_design.get("logo"))

            logger.info(f"[ThemeAgent] 🎨 Brand design extracted: "
                       f"{len(colors)} colors, {len(fonts)} fonts, "
                       f"screenshot={has_screenshot}, logo={has_logo}")

            return brand_design

        except Exception as e:
            logger.warning(f"[ThemeAgent] Brand design fetch error: {e}")
            return None

    async def _fetch_logo_from_website(self, domain: str) -> Optional[str]:
        """Fallback: Try to get logo from website using Firecrawl."""
        try:
            from services.firecrawl_service import get_firecrawl_service

            firecrawl = get_firecrawl_service()
            if not firecrawl.is_configured():
                logger.warning("[ThemeAgent] Firecrawl not configured")
                return None

            url = f"https://{domain}"
            logger.info(f"[ThemeAgent] Fetching logo from website via Firecrawl: {url}")

            # Scrape the website for metadata
            result = firecrawl.scrape(url, formats=["markdown"])

            if not result.get("success"):
                logger.warning(f"[ThemeAgent] Firecrawl scrape failed: {result.get('error')}")
                return None

            data = result.get("data", {})
            metadata = data.get("metadata", {})

            # Try different metadata fields for logo
            logo_url = None

            # Check for explicit logo field
            if metadata.get("logo"):
                logo_url = metadata["logo"]
            # Check for Open Graph image (often company logo or main branding)
            elif metadata.get("ogImage"):
                logo_url = metadata["ogImage"]
            # Check for favicon
            elif metadata.get("favicon"):
                logo_url = metadata["favicon"]
            # Check for icon
            elif metadata.get("icon"):
                logo_url = metadata["icon"]

            if logo_url:
                # Ensure it's an absolute URL
                if logo_url.startswith("//"):
                    logo_url = f"https:{logo_url}"
                elif logo_url.startswith("/"):
                    logo_url = f"https://{domain}{logo_url}"

                logger.info(f"[ThemeAgent] ✅ Found logo via Firecrawl: {logo_url}")
                return logo_url

            logger.info("[ThemeAgent] No logo found in website metadata")
            return None

        except Exception as e:
            logger.warning(f"[ThemeAgent] Firecrawl logo fetch error: {e}")
            return None

    async def _probe_logo_url(self, url: str) -> bool:
        """Check whether a logo URL is reachable."""
        if not url:
            return False
        try:
            timeout = aiohttp.ClientTimeout(total=5)
            async with aiohttp.ClientSession(timeout=timeout) as session:
                async with session.head(url, allow_redirects=True) as response:
                    return response.status == 200
        except Exception:
            return False

    async def _fetch_logo_fallback(
        self,
        domain: str,
        brand_name: Optional[str] = None,
    ) -> Optional[str]:
        """Fallback to external logo services when Brandfetch yields no logo."""
        normalized_domain = _normalize_domain(domain) if domain else None
        query_name = (brand_name or "").strip() or normalized_domain or ""

        # Try Logo.dev if configured
        try:
            from agents.tools.theme.logodev_service import LogoDevService

            service = LogoDevService()
            if service.public_key or service.private_key:
                async with service as logo_service:
                    result = await logo_service.search_logo(query_name, url=f"https://{normalized_domain}" if normalized_domain else None)
                    if result and result.get("logo_url"):
                        logger.info("[ThemeAgent] ✅ Logo.dev fallback success for %s", normalized_domain or query_name)
                        return result["logo_url"]
        except Exception as exc:
            logger.debug("[ThemeAgent] Logo.dev fallback failed: %s", exc)

        # Clearbit fallback (no API key)
        if normalized_domain:
            clearbit_url = f"https://logo.clearbit.com/{normalized_domain}"
            if await self._probe_logo_url(clearbit_url):
                logger.info("[ThemeAgent] ✅ Clearbit logo fallback for %s", normalized_domain)
                return clearbit_url

        return None

    async def _generate_contextual_theme(
        self,
        title: str,
        prompt: str,
        context: Optional[str],
        inspiration: Optional[str],
        mood: Optional[str],
        theme_type: str,
        color_hints: Optional[list] = None,
    ) -> Optional[Dict[str, Any]]:
        """
        Generate a contextually appropriate theme using AI.
        This is the smart part - it understands what colors make sense.
        """
        try:
            from agents.ai.clients import get_client, invoke
            from agents.config import THEME_MODEL

            # Build context for color generation
            hints_line = ""
            if color_hints and isinstance(color_hints, list) and len(color_hints) > 0:
                hints_line = f"\nColor direction: {', '.join(color_hints)}. Strongly prefer these colors in the palette."

            color_context = f"""Generate a color palette for: {title}
Inspiration: {inspiration or 'None'}
Mood: {mood or 'professional'}{hints_line}

Return ONLY this JSON (no explanation):
{{"background":"#HEX","text":"#HEX","accent":"#HEX","accent2":"#HEX","colors":["#HEX","#HEX"],"hero_font":"FontName","body_font":"FontName"}}

Use iconic colors for the inspiration (Sonic=blue/red, Star Wars=black/gold, etc). All values must be valid hex colors."""

            client, actual_model = get_client(THEME_MODEL)
            if not client or not actual_model:
                logger.error(f"[ThemeAgent] Failed to get client for {THEME_MODEL} in contextual theme")
                return None
            logger.info(f"[ThemeAgent] Generating contextual theme with model: {actual_model}")
            response = invoke(
                client=client,
                model=actual_model,
                messages=[{"role": "user", "content": color_context}],
                max_tokens=800,
                temperature=0.3,
                theme_generation=True
            )
            response_str = str(response) if response else ""
            logger.info(f"[ThemeAgent] Contextual response (len={len(response_str)}): {response_str[:400]}")

            theme_data = _extract_json_object(_coerce_response_text(response))
            if not isinstance(theme_data, dict):
                # Fallback: try to extract any colors from the raw response
                logger.warning("[ThemeAgent] JSON extraction failed, attempting color extraction from raw response")
                response_str = str(response)
                hex_colors = re.findall(r'#[0-9A-Fa-f]{6}', response_str)
                if hex_colors:
                    theme_data = {
                        "background": hex_colors[0] if len(hex_colors) > 0 else "#FFFFFF",
                        "text": "#1A1A1A",
                        "accent": hex_colors[1] if len(hex_colors) > 1 else hex_colors[0],
                        "accent2": hex_colors[2] if len(hex_colors) > 2 else None,
                        "colors": hex_colors[:5],
                    }
                    logger.info(f"[ThemeAgent] Extracted {len(hex_colors)} colors from raw response: {hex_colors[:5]}")
                else:
                    logger.warning("[ThemeAgent] No colors found in response, using defaults")
                    return None

            if isinstance(theme_data, dict):
                # Validate and extract fonts
                hero_font_raw = theme_data.get("hero_font")
                body_font_raw = theme_data.get("body_font")

                validated_hero = _validate_font_against_registry(hero_font_raw) if hero_font_raw else None
                validated_body = _validate_font_against_registry(body_font_raw) if body_font_raw else None

                font_service = _get_font_service()
                hero_font = validated_hero
                body_font = validated_body
                if font_service:
                    keyword_context = [k for k in [inspiration, mood, theme_type] if k]
                    pair = font_service.select_font_pair(
                        deck_title=title,
                        vibe=mood or "modern",
                        content_keywords=keyword_context,
                        variety_seed=f"{title}-{inspiration}-{mood}",
                    )
                    if not hero_font:
                        hero_font = pair.get("hero") if pair else None
                    if not body_font:
                        body_font = pair.get("body") if pair else None
                    if hero_font and body_font and hero_font == body_font:
                        body_font = pair.get("body") if pair else body_font

                return {
                    "background": theme_data.get("background", "#FFFFFF"),
                    "text": theme_data.get("text", "#1A1A1A"),
                    "accent": theme_data.get("accent"),
                    "accent2": theme_data.get("accent2"),
                    "colors": theme_data.get("colors", []),
                    "fonts": {
                        "hero": hero_font or "Inter",
                        "body": body_font or "Inter"
                    },
                    "source": "ai_contextual"
                }
            logger.warning("[ThemeAgent] Failed to parse theme JSON. Response preview: %s", str(response)[:400])

            return None

        except Exception as e:
            import traceback
            logger.error(f"[ThemeAgent] Contextual theme error: {e}")
            logger.error(f"[ThemeAgent] Contextual traceback: {traceback.format_exc()}")
            return None


async def run_theme_agent_parallel(
    title: str,
    prompt: str,
    context: Optional[str] = None,
    include_videos: bool = False,
    include_brand_design: bool = False,
    available_videos: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Convenience function to run the theme agent."""
    agent = ThemeAgent()
    return await agent.run(
        title=title,
        prompt=prompt,
        context=context,
        include_videos=include_videos,
        include_brand_design=include_brand_design,
        available_videos=available_videos,
    )
