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
from agents.config import OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL, FONT_SELECTION_MODEL
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

        # Explicitly ignore generic audience terms that might appear in styleContext
        # This list must be checked against ANY extracted candidate
        generic_terms = {
            'general audience', 'a general audience', 'everyone', 'kids', 'teens', 'adults',
            'students', 'teachers', 'investors', 'stakeholders', 'employees', 'team',
            'public', 'users', 'customers', 'clients', 'beginners', 'experts', 'pros',
            'audience', 'target audience', 'people', 'folks', 'guys', 'all', 'any',
            # Generic activity/context words that are NOT brand names
            'teaching', 'learning', 'training', 'coaching', 'presenting', 'working',
            'class', 'course', 'lesson', 'tutorial', 'workshop', 'seminar',
            'undefined', 'none', 'null', 'unknown', 'default', 'test'
        }

        def is_valid_candidate(c: str) -> bool:
            if not c: return False
            cl = c.lower().strip().strip('.,!?:')
            if cl in generic_terms: return False
            if cl in ['a', 'an', 'the', 'my', 'our', 'this', 'that']: return False
            return True

        # 1) If a domain appears, return it
        import re
        m = re.search(r"\b([a-z0-9][a-z0-9\-]+\.[a-z]{2,})(?:/[\w\-./?%&=]*)?\b", tl)
        if m:
            return m.group(1)
            
        # 2) Look for "for [Brand]" or "about [Brand]" or "[Brand] theme" patterns
        # Matches: "presentation for McDonald's", "deck about Nike", "McDonald's themed", "a mcdonalds theme"
        brand_patterns = [
            # "[Brand] branded" - HIGHEST priority for explicit branding requests (e.g., "first round branded")
            r"\b([a-zA-Z][a-zA-Z0-9'\-\s]{1,30}?)\s+branded\b",
            # "[Brand] theme/themed" - High priority for explicit theming requests
            r"\ba?\s*([a-zA-Z0-9'\-]+(?:'s)?)\s+theme[d]?\b",
            r"\b([a-zA-Z0-9'\-]+(?:'s)?)[- ]themed\b",
            # "for [Brand]" / "about [Brand]"
            r"\bfor\s+([a-zA-Z0-9'\-\s]{2,30})(?:\s+presentation|\s+deck|\s+slides|\s+org|\s+chart|\s+strategy)?",
            r"\babout\s+([a-zA-Z0-9'\-\s]{2,30})(?:\s+presentation|\s+deck|\s+slides|\s+org|\s+chart|\s+strategy)?",
            r"\bbrand\s+([a-zA-Z0-9'\-\s]{2,30})",
            r"\bstyle\s+of\s+([a-zA-Z0-9'\-\s]{2,30})",
            # Brand at START of text followed by business words (e.g., "Instacart UK Expansion", "Nike Market Strategy")
            r"^([A-Z][a-zA-Z0-9]+)(?:\s+(?:UK|US|EU|Asia|Europe|Global|Market|Expansion|Strategy|Integration|Analysis|Growth|Launch|Partnership|Quarterly|Annual|Overview|Presentation|Pitch))",
        ]
        
        for pattern in brand_patterns:
            m_brand = re.search(pattern, t, re.IGNORECASE) # Use original text to preserve case if possible
            if m_brand:
                candidate = m_brand.group(1).strip()
                # Clean up trailing punctuation
                candidate = candidate.strip('.,!?:')
                
                if is_valid_candidate(candidate):
                    # If it looks like a valid brand name (not too long, not a sentence)
                    if len(candidate) < 40 and len(candidate.split()) < 5:
                        return candidate

        # 3) Simple known brand shortcuts (legacy)
        if 'first round capital' in tl or 'first round' in tl or 'firstround' in tl:
            return 'firstround.com'
            
        # 4) Extract words preceding 'branding' or 'brand'
        m2 = re.search(r"use\s+([a-z0-9'\-\s]{2,})\s+branding", tl)
        if m2:
            name = m2.group(1).strip()
            candidate = ' '.join([w.capitalize() for w in name.split()])
            if is_valid_candidate(candidate):
                return candidate
            
        # 5) Fallback: If the prompt is short and looks like a brand name, use it
        # e.g. "McDonald's", "Nike strategy"
        if len(t) < 50 and len(t.split()) <= 4:
            # Remove common suffix words
            cleaned = re.sub(r'\b(presentation|deck|slides|pitch|strategy|report|analysis|chart|org chart)\b', '', t, flags=re.IGNORECASE).strip()
            
            if is_valid_candidate(cleaned):
                if len(cleaned) > 2:
                    return cleaned
                
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

    # Reject slide count patterns like "10 slides", "5 slide", etc.
    import re
    if re.match(r'^\d+\s*slides?$', cleaned, re.IGNORECASE):
        return False

    alpha_chars = sum(1 for c in cleaned if c.isalpha())
    return alpha_chars >= 2


def _is_entertainment_topic(title: str, vibe_context: Optional[str] = None) -> bool:
    """Check if this is an entertainment/fun topic that shouldn't have brand logo treatment.

    Entertainment topics like Pikachu, Pokemon, movies, games shouldn't have corporate logos.
    Colors and fonts can still be generated, but we skip brand logo fetching.

    IMPORTANT: Only check the TITLE, not the full vibe_context (which contains conversation history
    and could have false positive matches like 'fun' in 'fundraising' or 'fundamentals').
    """
    if not title:
        return False

    # Only check title (not vibe_context) to avoid false positives from conversation history
    title_lower = title.lower()

    # Business/corporate indicators that should NEVER be treated as entertainment
    # These override any entertainment keyword matches
    business_indicators = [
        'earnings', 'revenue', 'quarterly', 'annual', 'report', 'investor',
        'founding', 'founder', 'startup', 'company', 'business', 'strategy',
        'financial', 'growth', 'market', 'q1', 'q2', 'q3', 'q4', 'ipo', 'valuation',
        'pitch deck', 'board meeting', 'stakeholder', 'corporate', 'enterprise',
        'roi', 'kpi', 'metrics', 'analytics', 'sales', 'marketing', 'b2b', 'saas',
        'fundraising', 'series a', 'series b', 'series c', 'seed round', 'raise',
    ]

    for indicator in business_indicators:
        if indicator in title_lower:
            return False  # Definitely NOT entertainment

    # Entertainment/fun keywords that shouldn't have brand logos
    # Use word boundary matching to avoid false positives (e.g., 'fun' in 'fundraising')
    entertainment_keywords = [
        'pikachu', 'pokemon', 'pokémon', 'anime', 'cartoon', 'gaming',
        'movie', 'movies', 'film', 'tv show', 'series', 'superhero', 'marvel', 'dc comics',
        'disney', 'pixar', 'star wars', 'harry potter', 'lord of the rings', 'hobbit',
        'minecraft', 'fortnite', 'roblox', 'mario', 'zelda', 'playstation', 'xbox',
        'football', 'basketball', 'soccer', 'baseball', 'tennis', 'golf',
        'concert', 'festival', 'recipe', 'cooking',
        'vacation', 'holiday', 'birthday', 'party', 'wedding', 'celebration',
        'science project', 'school project', 'homework', 'kids', 'children',
        'hobby', 'hobbies', 'craft', 'crafts', 'diy', 'art project',
    ]

    # Use word boundary regex to avoid partial matches
    import re
    for keyword in entertainment_keywords:
        # Use word boundaries to match whole words only
        if re.search(rf'\b{re.escape(keyword)}\b', title_lower):
            return True

    return False


def _select_complementary_body_font(hero_font: str, is_fun_topic: bool = False) -> str:
    """Select a complementary body font for the given hero font.

    Uses pre-defined pairings for common fonts, with fallbacks for unknown fonts.
    """
    hero_lower = (hero_font or '').lower().strip()

    # Pre-defined font pairings (hero -> body)
    font_pairings = {
        # Display/Fun fonts
        'bebas neue': 'Nunito',
        'fredoka': 'Quicksand',
        'righteous': 'Poppins',
        'bungee': 'Asap',
        'bangers': 'Rubik',
        'titan one': 'Cabin',
        'pacifico': 'Comfortaa',
        'press start 2p': 'Space Mono',
        # Professional fonts
        'montserrat': 'Open Sans',
        'raleway': 'Lato',
        'oswald': 'Source Sans Pro',
        'playfair display': 'Lora',
        'roboto slab': 'Roboto',
        'merriweather': 'Source Sans Pro',
        'poppins': 'Inter',
        'inter': 'Roboto',
        'lato': 'Open Sans',
        'open sans': 'Lato',
        'roboto': 'Open Sans',
        'source sans pro': 'Lato',
        'nunito': 'Open Sans',
        'work sans': 'Inter',
        'dm sans': 'Inter',
        'ibm plex sans': 'Inter',
    }

    # Check for exact match
    if hero_lower in font_pairings:
        return font_pairings[hero_lower]

    # Check for partial match (e.g., "Bebas Neue Bold" matches "bebas neue")
    for key, value in font_pairings.items():
        if key in hero_lower or hero_lower in key:
            return value

    # Default fallbacks based on topic type
    if is_fun_topic:
        return 'Nunito'  # Friendly, readable body font for fun content
    return 'Open Sans'  # Clean, professional body font for business content


async def _ai_extract_brand(title: str, context: Optional[str] = None) -> Optional[Dict[str, str]]:
    """Use AI to intelligently extract brand information from a presentation title.

    This replaces regex-based brand detection with AI understanding of context.
    For example:
    - "Google Q3 2025 Earnings Breakdown" → {"brand": "Google", "domain": "google.com"}
    - "5 slides about marketing" → None (no brand)
    - "Amazon rainforest documentary" → None (not Amazon.com)
    - "Amazon Web Services tutorial" → {"brand": "Amazon Web Services", "domain": "aws.amazon.com"}

    Args:
        title: The presentation title
        context: Optional additional context (vibe, prompt, etc.)

    Returns:
        Dict with 'brand' and 'domain' keys, or None if no brand detected
    """
    if not title:
        return None

    try:
        from agents.ai.clients import get_client, invoke
        import json as json_module

        # Build the text to analyze
        text_to_analyze = title
        if context and len(context) < 200:  # Only add short context
            text_to_analyze = f"{title}. Context: {context}"

        brand_prompt = f"""Analyze this presentation title and extract brand information.

Title: "{text_to_analyze}"

Your task:
1. Determine if a real company/brand is the SUBJECT of this presentation
2. If yes, provide the brand's official website domain

Be smart about context - distinguish common words from brand references:
- "Google Q3 2025 Earnings" → YES, Google is a company → google.com
- "Apple Vision Pro review" → YES → apple.com
- "Apple pie recipe" → NO, just food → null
- "Amazon quarterly earnings" → YES → amazon.com
- "Amazon rainforest documentary" → NO, just a place → null
- "10 slides about marketing" → NO brand → null
- "Nike marketing strategy" → YES → nike.com
- "Target Q4 sales analysis" → YES, Target store → target.com
- "Target practice tips" → NO, not the store → null

Return ONLY valid JSON: {{"brand": "Brand Name", "domain": "brand.com"}} or {{"brand": null, "domain": null}}"""

        from agents.config import BRAND_DETECTION_MODEL
        client = get_client(BRAND_DETECTION_MODEL)
        response = invoke(
            client=client,
            model=BRAND_DETECTION_MODEL,
            messages=[{"role": "user", "content": brand_prompt}],
            max_tokens=100,
            temperature=0
        )

        # Parse JSON response - handle models that add extra text after JSON
        result_text = response.strip()
        if result_text.startswith("```"):
            result_text = result_text.split("```")[1]
            if result_text.startswith("json"):
                result_text = result_text[4:]
        result_text = result_text.strip()

        # Extract just the JSON object - stop at first closing brace
        # This handles cases where model adds "Reasoning:" after the JSON
        import re
        json_match = re.search(r'\{[^{}]*\}', result_text)
        if json_match:
            result_text = json_match.group(0)

        brand_info = json_module.loads(result_text)
        if brand_info.get('brand') and brand_info.get('domain'):
            logger.info(f"[AI BRAND] Detected brand from title: {brand_info['brand']} → {brand_info['domain']}")
            return brand_info
        else:
            logger.info(f"[AI BRAND] No brand detected in title: {title[:50]}...")
            return None

    except Exception as e:
        logger.warning(f"[AI BRAND] AI brand extraction failed: {e}")
        return None


async def _select_brand_appropriate_fonts(brand_name: str, brand_domain: Optional[str] = None) -> Dict[str, str]:
    """Use AI to select fonts that match a brand's personality when brand fonts aren't available.

    Args:
        brand_name: The brand name (e.g., "Starbucks", "Nike")
        brand_domain: Optional domain for additional context

    Returns:
        Dict with 'hero' and 'body' font names
    """
    try:
        from agents.ai.clients import get_client, invoke
        from services.registry_fonts import RegistryFonts

        # Get available fonts
        available_fonts = RegistryFonts.get_all_fonts_list(None)

        # Get font categories for better AI context
        try:
            font_categories = RegistryFonts.get_available_fonts()
            font_list_parts = []
            for category, fonts_in_cat in font_categories.items():
                if fonts_in_cat:
                    font_list_parts.append(f"**{category}**: {', '.join(fonts_in_cat[:25])}")
            available_fonts_str = "\n".join(font_list_parts)
        except Exception:
            available_fonts_str = ", ".join(available_fonts[:100])

        prompt = f"""Select appropriate fonts for a presentation about the brand "{brand_name}".

The brand's own fonts aren't available, so select fonts from our library that MATCH THE BRAND'S PERSONALITY and visual identity.

Consider the brand's characteristics:
- Industry/sector (tech, food, luxury, sports, etc.)
- Brand personality (modern, traditional, playful, sophisticated, etc.)
- Target audience (young, professional, mass market, premium, etc.)

Available fonts by category:
{available_fonts_str}

Return your selection as:
HERO: [font name]
BODY: [font name]

IMPORTANT:
- Hero font should reflect the brand's headline style (bold, impactful)
- Body font should be highly readable and complement the hero
- Hero and body MUST be DIFFERENT fonts
- Only use fonts from the list above"""

        client, actual_model = get_client(FONT_SELECTION_MODEL)
        response = invoke(
            client=client,
            model=actual_model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=100,
            temperature=0.3
        )

        # Parse response
        response_text = response.strip()
        hero_font = None
        body_font = None

        for line in response_text.split('\n'):
            line = line.strip()
            if line.upper().startswith('HERO:'):
                hero_font = line.split(':', 1)[1].strip().strip('"\'')
            elif line.upper().startswith('BODY:'):
                body_font = line.split(':', 1)[1].strip().strip('"\'')

        # Validate fonts exist in our registry
        available_lower = {f.lower(): f for f in available_fonts}

        if hero_font and hero_font.lower() in available_lower:
            hero_font = available_lower[hero_font.lower()]
        else:
            hero_font = 'Montserrat'  # Safe fallback

        if body_font and body_font.lower() in available_lower:
            body_font = available_lower[body_font.lower()]
        else:
            body_font = 'Open Sans'  # Safe fallback

        # Ensure hero != body
        if hero_font.lower() == body_font.lower():
            body_font = 'Open Sans' if hero_font != 'Open Sans' else 'Roboto'

        logger.info(f"[BRAND FONTS] AI selected fonts for {brand_name}: hero={hero_font}, body={body_font}")
        return {'hero': hero_font, 'body': body_font}

    except Exception as e:
        logger.warning(f"[BRAND FONTS] AI font selection failed for {brand_name}: {e}")
        # Fallback to sensible defaults
        return {'hero': 'Montserrat', 'body': 'Open Sans'}


async def _hydrate_style_preferences(style_prefs: Optional[StylePreferencesItem], domain_hint: Optional[str] = None, outline_title: Optional[str] = None) -> Optional[StylePreferencesItem]:
    """Ensure style preferences include brand colors, font, and logo by refetching brand data when needed."""
    if not style_prefs:
        logger.debug("[STYLE PREF HYDRATE] No style_prefs provided, returning None")
        return style_prefs

    try:
        colors = getattr(style_prefs, 'colors', None)
        has_colors = bool(colors and (colors.accent1 or colors.accent2 or colors.accent3 or colors.background or colors.text))
        has_logo = bool(getattr(style_prefs, 'logoUrl', None))
        has_font = bool(getattr(style_prefs, 'font', None))
        logger.info(f"[STYLE PREF HYDRATE] Status check: has_colors={has_colors}, has_logo={has_logo}, has_font={has_font}")
    except Exception as e:
        logger.warning(f"[STYLE PREF HYDRATE] Error checking status: {e}")
        has_colors = has_logo = has_font = False

    # CRITICAL: Even if font is set, override boring fonts for fun topics
    if has_colors and has_logo and has_font:
        current_font = getattr(style_prefs, 'font', None)
        current_body_font = getattr(style_prefs, 'bodyFont', None)
        boring_fonts = ['inter', 'roboto', 'arial', 'helvetica', 'open sans', 'lato', 'source sans']
        is_boring = current_font and current_font.lower() in boring_fonts

        if is_boring and _is_entertainment_topic(outline_title or '', getattr(style_prefs, 'vibeContext', None)):
            # Override boring font with playful font for fun topics - use pre-defined pairings
            import hashlib
            seed_hash = int(hashlib.md5((outline_title or 'fun').encode()).hexdigest(), 16)
            playful_combos = [
                {'hero': 'Bebas Neue', 'body': 'Nunito'},
                {'hero': 'Fredoka', 'body': 'Quicksand'},
                {'hero': 'Righteous', 'body': 'Poppins'},
                {'hero': 'Bungee', 'body': 'Asap'},
                {'hero': 'Bangers', 'body': 'Rubik'},
            ]
            selected = playful_combos[seed_hash % len(playful_combos)]
            style_prefs.font = selected['hero']
            style_prefs.bodyFont = selected['body']
            logger.info(f"[STYLE PREF HYDRATE] 🎮 Overriding boring font '{current_font}' with playful fonts: hero={selected['hero']}, body={selected['body']}")
        else:
            # Ensure bodyFont is set even when skipping brandfetch
            if not current_body_font:
                is_fun = _is_entertainment_topic(outline_title or '', getattr(style_prefs, 'vibeContext', None))
                style_prefs.bodyFont = _select_complementary_body_font(current_font, is_fun)
                logger.info(f"[STYLE PREF HYDRATE] Setting complementary body font: {style_prefs.bodyFont} for hero: {current_font}")
            logger.info("[STYLE PREF HYDRATE] All data present, skipping brandfetch")
        return style_prefs

    vibe_context = getattr(style_prefs, 'vibeContext', None)

    # Use AI to intelligently extract brand from the title
    # This replaces regex-based guessing with proper AI understanding
    logger.info(f"[STYLE PREF HYDRATE] 🤖 Using AI brand extraction for title: {outline_title}")

    domain = None
    brand_name = None

    # PRIORITY 1: AI-based brand extraction from title (most accurate)
    if outline_title:
        ai_brand = await _ai_extract_brand(outline_title)
        if ai_brand and ai_brand.get('domain'):
            domain = ai_brand['domain']
            brand_name = ai_brand.get('brand')
            logger.info(f"[STYLE PREF HYDRATE] ✅ AI detected brand: {brand_name} → {domain}")

    # PRIORITY 2: If domain_hint looks like an actual domain (e.g., google.com), use it
    if not domain and domain_hint and _looks_like_domain(domain_hint):
        domain = domain_hint.strip()
        logger.info(f"[STYLE PREF HYDRATE] ✅ Using domain_hint: {domain}")

    # PRIORITY 3: Fallback to regex extraction only if AI failed and domain_hint is reasonable
    if not domain and domain_hint and _is_reasonable_brand_term(domain_hint):
        domain = domain_hint.strip()
        logger.info(f"[STYLE PREF HYDRATE] ✅ Fallback to domain_hint: {domain}")

    if not domain:
        logger.warning("[STYLE PREF HYDRATE] ⚠️ No valid brand identifier found; skipping Brandfetch hydration")
        logger.warning(f"[STYLE PREF HYDRATE] Title: {outline_title}, domain_hint: {domain_hint}")

        # CRITICAL: Even without brand data, set appropriate font for fun topics
        current_font = getattr(style_prefs, 'font', None) if style_prefs else None
        boring_fonts = ['inter', 'roboto', 'arial', 'helvetica', 'open sans', 'lato', 'source sans']
        is_boring = not current_font or (current_font and current_font.lower() in boring_fonts)
        is_fun_topic = _is_entertainment_topic(outline_title or '', getattr(style_prefs, 'vibeContext', None) if style_prefs else None)

        if is_boring and is_fun_topic:
            import hashlib
            seed_hash = int(hashlib.md5((outline_title or 'fun').encode()).hexdigest(), 16)
            playful_combos = [
                {'hero': 'Bebas Neue', 'body': 'Nunito'},
                {'hero': 'Fredoka', 'body': 'Quicksand'},
                {'hero': 'Righteous', 'body': 'Poppins'},
                {'hero': 'Bungee', 'body': 'Asap'},
                {'hero': 'Bangers', 'body': 'Rubik'},
            ]
            selected = playful_combos[seed_hash % len(playful_combos)]
            if style_prefs:
                style_prefs.font = selected['hero']
                style_prefs.bodyFont = selected['body']
            logger.info(f"[STYLE PREF HYDRATE] 🎮 No domain but fun topic! Using playful fonts: hero={selected['hero']}, body={selected['body']}")
        elif is_boring and style_prefs:
            style_prefs.font = 'Montserrat'
            style_prefs.bodyFont = 'Open Sans'
            logger.info(f"[STYLE PREF HYDRATE] 📊 No domain, business topic - using fonts: hero=Montserrat, body=Open Sans")
        elif style_prefs:
            # Font is already set and not boring - just ensure bodyFont is set
            if not getattr(style_prefs, 'bodyFont', None):
                style_prefs.bodyFont = _select_complementary_body_font(current_font, is_fun_topic)
                logger.info(f"[STYLE PREF HYDRATE] Setting complementary body font: {style_prefs.bodyFont}")

        return style_prefs

    brand_data = None
    logger.info(f"[STYLE PREF HYDRATE] 🔍 Attempting to fetch brand data for: {domain}")
    try:
        from services.simple_brandfetch_cache import SimpleBrandfetchCache
        db_url = os.getenv('DATABASE_URL')
        if db_url:
            logger.info(f"[STYLE PREF HYDRATE] 📦 Checking SimpleBrandfetchCache for: {domain}")
            async with SimpleBrandfetchCache(db_url) as cache_service:
                brand_data = await cache_service.get_brand_data(domain)
                if brand_data and not brand_data.get('error'):
                    logger.info(f"[STYLE PREF HYDRATE] ✅ Found in cache: {domain}")
                else:
                    logger.info(f"[STYLE PREF HYDRATE] ❌ Not in cache: {domain}")
        else:
            logger.warning("[STYLE PREF HYDRATE] ⚠️ No DATABASE_URL, skipping cache check")
    except Exception as cache_error:
        logger.warning(f"[STYLE PREF HYDRATE] Cache fetch failed: {cache_error}")

    if not brand_data:
        try:
            logger.info(f"[STYLE PREF HYDRATE] 🌐 Calling BrandfetchService API for: {domain}")
            from services.brandfetch_service import BrandfetchService
            async with BrandfetchService() as service:
                # Use search-capable resolver to handle non-domain identifiers gracefully
                brand_data = await service.get_brand_data_with_search(domain)
                if brand_data:
                    logger.info(f"[STYLE PREF HYDRATE] ✅ BrandfetchService returned data for: {domain}")
                else:
                    logger.info(f"[STYLE PREF HYDRATE] ❌ BrandfetchService returned no data for: {domain}")
        except Exception as direct_error:
            logger.warning(f"[STYLE PREF HYDRATE] Direct Brandfetch fetch failed: {direct_error}")
            brand_data = None

    # FINAL FALLBACK: Use BrandColorSearcher to get basic brand colors/fonts/logo if Brandfetch fails
    if not brand_data and domain:
        try:
            logger.info(f"[STYLE PREF HYDRATE] 🔎 Trying BrandColorSearcher fallback for: {domain}")
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
                    logger.info(f"[STYLE PREF HYDRATE] ✅ BrandColorSearcher found logo: {sr['logo_url'][:60]}...")
                brand_data = {
                    'colors': colors_section,
                    'fonts': fonts_section,
                    'logos': logos_section
                }
                logger.info(f"[STYLE PREF HYDRATE] ✅ BrandColorSearcher provided fallback brand data for {domain}")
            else:
                logger.info(f"[STYLE PREF HYDRATE] ❌ BrandColorSearcher returned no data for: {domain}")
        except Exception as _search_err:
            logger.warning(f"[STYLE PREF HYDRATE] BrandColorSearcher fallback failed: {_search_err}")

    if not brand_data:
        logger.warning(f"[STYLE PREF HYDRATE] ⚠️ No brand data found for: {domain} (tried cache, API, and fallback)")
        return style_prefs
    
    logger.info(f"[STYLE PREF HYDRATE] ✅ Successfully retrieved brand data for: {domain}")
    logger.info(f"[STYLE PREF HYDRATE] 🔍 Brand data keys: {list(brand_data.keys()) if brand_data else 'None'}")
    logger.info(f"[STYLE PREF HYDRATE] 🔍 has_font={has_font}, has_colors={has_colors}, domain={domain}, brand_name={brand_name}")

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
            logger.info(f"[STYLE PREF HYDRATE] 🔤 Entering font selection section (has_font={has_font})")
            fonts = brand_data.get('fonts', {})
            font_names = fonts.get('names', []) if fonts else []
            logger.info(f"[STYLE PREF HYDRATE] 🔤 Font data from brand: fonts={bool(fonts)}, names={font_names}")
            font_set = False

            if font_names:
                scraped_font = font_names[0]
                # CRITICAL: Validate font is available locally before using it
                # Many brands use custom fonts (e.g., "Flexo-Medium") that we don't have
                try:
                    from services.registry_fonts import RegistryFonts
                    available_fonts = RegistryFonts.get_all_fonts_list(None)
                    font_lower = str(scraped_font).lower().strip()
                    is_available = any(str(f).lower().strip() == font_lower for f in available_fonts)
                    if is_available:
                        style_prefs.font = scraped_font
                        font_set = True
                        logger.info(f"[STYLE PREF HYDRATE] ✅ Using scraped font (available): {scraped_font}")
                    else:
                        logger.warning(f"[STYLE PREF HYDRATE] ⚠️ Scraped font '{scraped_font}' not available locally")
                except Exception as font_err:
                    logger.warning(f"[STYLE PREF HYDRATE] Font validation failed: {font_err}")
            
            # CRITICAL: If no valid font, select appropriate fallback based on topic or brand
            if not font_set:
                logger.info(f"[STYLE PREF HYDRATE] 🔤 No valid scraped font, checking fallbacks. domain={domain}, brand_name={brand_name}")
                vibe_ctx = getattr(style_prefs, 'vibeContext', None)
                is_entertainment = _is_entertainment_topic(outline_title or '', vibe_ctx)
                logger.info(f"[STYLE PREF HYDRATE] 🔤 is_entertainment={is_entertainment}, will use brand fonts={bool(domain and not is_entertainment)}")
                if is_entertainment:
                    # Use playful fonts for fun topics - pre-defined pairings
                    import hashlib
                    seed_hash = int(hashlib.md5((outline_title or 'fun').encode()).hexdigest(), 16)
                    playful_combos = [
                        {'hero': 'Bebas Neue', 'body': 'Nunito'},
                        {'hero': 'Fredoka', 'body': 'Quicksand'},
                        {'hero': 'Righteous', 'body': 'Poppins'},
                        {'hero': 'Bungee', 'body': 'Asap'},
                        {'hero': 'Bangers', 'body': 'Rubik'},
                    ]
                    selected = playful_combos[seed_hash % len(playful_combos)]
                    style_prefs.font = selected['hero']
                    style_prefs.bodyFont = selected['body']
                    logger.info(f"[STYLE PREF HYDRATE] 🎮 Fun topic! Using playful fonts: hero={selected['hero']}, body={selected['body']}")
                elif domain:
                    # THIS IS A BRAND - use AI to select brand-appropriate fonts
                    # Use the AI-detected brand name if available, otherwise clean from domain
                    brand_name_for_fonts = brand_name or domain.replace('.com', '').replace('.org', '').replace('.net', '').replace('.', ' ').title()
                    logger.info(f"[STYLE PREF HYDRATE] 🏷️ Brand detected ({brand_name_for_fonts}), selecting brand-appropriate fonts...")
                    try:
                        brand_fonts = await _select_brand_appropriate_fonts(brand_name_for_fonts, domain)
                        style_prefs.font = brand_fonts['hero']
                        style_prefs.bodyFont = brand_fonts['body']
                        logger.info(f"[STYLE PREF HYDRATE] 🎨 Brand fonts selected: hero={brand_fonts['hero']}, body={brand_fonts['body']}")
                    except Exception as brand_font_err:
                        logger.warning(f"[STYLE PREF HYDRATE] Brand font selection failed: {brand_font_err}")
                        style_prefs.font = 'Montserrat'
                        style_prefs.bodyFont = 'Open Sans'
                else:
                    # No brand, use professional defaults
                    style_prefs.font = 'Montserrat'
                    style_prefs.bodyFont = 'Open Sans'
                    logger.info(f"[STYLE PREF HYDRATE] 📊 Business topic - using professional fonts: hero=Montserrat, body=Open Sans")
            else:
                # Font was set from brand data - now select complementary body font
                hero_font = style_prefs.font
                body_font = _select_complementary_body_font(hero_font, _is_entertainment_topic(outline_title or '', getattr(style_prefs, 'vibeContext', None)))
                style_prefs.bodyFont = body_font
                logger.info(f"[STYLE PREF HYDRATE] 🎨 Selected complementary body font: {body_font} for hero: {hero_font}")

        if not has_logo:
            # CRITICAL: Skip logo for entertainment topics (Pikachu, games, movies, etc.)
            # These are NOT brands and shouldn't have corporate logos on every slide
            vibe_ctx = getattr(style_prefs, 'vibeContext', None)
            if _is_entertainment_topic(outline_title or '', vibe_ctx):
                logger.info(f"[STYLE PREF HYDRATE] 🎮 Skipping logo for entertainment topic: {outline_title}")
            else:
                logos = brand_data.get('logos', {})
                logger.info(f"[STYLE PREF HYDRATE] 🖼️ Extracting logo - logos data: {list(logos.keys()) if logos else 'None'}")
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
                                    logger.info(f"[STYLE PREF HYDRATE] ✅ Logo URL set from {logo_type}: {url[:60]}...")
                                    break
                            url = first_item.get('url')
                            if url:
                                style_prefs.logoUrl = url
                                logger.info(f"[STYLE PREF HYDRATE] ✅ Logo URL set from {logo_type} (direct): {url[:60]}...")
                                break
                        elif isinstance(first_item, str) and first_item.startswith('http'):
                            style_prefs.logoUrl = first_item
                            logger.info(f"[STYLE PREF HYDRATE] ✅ Logo URL set from {logo_type} (string): {first_item[:60]}...")
                            break
                            
                    if not getattr(style_prefs, 'logoUrl', None):
                        logger.warning(f"[STYLE PREF HYDRATE] ⚠️ No logo URL found in brand_data despite having logos: {logos}")
                except Exception as logo_err:
                    logger.warning(f"[STYLE PREF HYDRATE] Logo extraction failed: {logo_err}")

    except Exception as hydrate_error:
        logger.debug(f"[STYLE PREF HYDRATE] Failed to hydrate style preferences: {hydrate_error}")

    # FINAL CHECK: If we still don't have fonts set, select them based on topic
    # This handles cases where no brand_data was found (like Pikachu presentations)
    try:
        current_font = getattr(style_prefs, 'font', None) if style_prefs else None
        current_body_font = getattr(style_prefs, 'bodyFont', None) if style_prefs else None
        if style_prefs:
            vibe_ctx = getattr(style_prefs, 'vibeContext', None)
            is_fun = _is_entertainment_topic(outline_title or '', vibe_ctx)

            if not current_font:
                if is_fun:
                    # Use playful fonts for fun topics - pre-defined pairings
                    import hashlib
                    seed_hash = int(hashlib.md5((outline_title or 'fun').encode()).hexdigest(), 16)
                    playful_combos = [
                        {'hero': 'Bebas Neue', 'body': 'Nunito'},
                        {'hero': 'Fredoka', 'body': 'Quicksand'},
                        {'hero': 'Righteous', 'body': 'Poppins'},
                        {'hero': 'Bungee', 'body': 'Asap'},
                        {'hero': 'Bangers', 'body': 'Rubik'},
                    ]
                    selected = playful_combos[seed_hash % len(playful_combos)]
                    style_prefs.font = selected['hero']
                    style_prefs.bodyFont = selected['body']
                    logger.info(f"[STYLE PREF HYDRATE] 🎮 FINAL: Fun topic! Using playful fonts: hero={selected['hero']}, body={selected['body']}")
                else:
                    # Use professional font for business topics
                    style_prefs.font = 'Montserrat'
                    style_prefs.bodyFont = 'Open Sans'
                    logger.info(f"[STYLE PREF HYDRATE] 📊 FINAL: Business topic - using professional fonts: hero=Montserrat, body=Open Sans")
            elif not current_body_font:
                # Font is set but bodyFont is not - select complementary body font
                style_prefs.bodyFont = _select_complementary_body_font(current_font, is_fun)
                logger.info(f"[STYLE PREF HYDRATE] 🎨 FINAL: Setting complementary body font: {style_prefs.bodyFont} for hero: {current_font}")
    except Exception as font_final_err:
        logger.warning(f"[STYLE PREF HYDRATE] Final font selection failed: {font_final_err}")

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
    async_images: Optional[bool] = Field(default=True, description="If True, images are placeholders; if False, images are auto-applied (default: True = placeholders)")
    uploadedMedia: Optional[List[Dict[str, Any]]] = Field(default=None, description="Pre-processed uploaded media from OutlineAgent to include in deck")
    scraped_videos: Optional[List[Dict[str, Any]]] = Field(default=None, description="Videos scraped from website URLs to include in deck")

    @validator('async_images', pre=True, always=True)
    def debug_async_images(cls, v):
        """Validate async_images field - defaults to True (placeholder mode is safer default)"""
        # If None, default to True (placeholder mode - safer default, user can manually select)
        if v is None:
            return True
        # Ensure it's a boolean
        return bool(v)

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
            extractedData=extracted_data,
            citations=getattr(slide, 'citations', None),
            footnotes=getattr(slide, 'footnotes', None)
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
            visual_density=(request.visualDensity or None),
            async_images=request.async_images if request.async_images is not None else True
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

            # Log basic request info
            logger.info(f"Outline generation started (detail={request.detailLevel}, slides={request.slideCount}, async_images={request.async_images})")

            # Start ThemeAgent in parallel with outline generation
            # This detects brand/colors/fonts while outline is being generated
            from agents.theme import run_theme_agent_parallel
            theme_task = asyncio.create_task(
                run_theme_agent_parallel(
                    title=request.prompt[:100],  # Use prompt as initial title
                    prompt=request.prompt,
                    context=request.styleContext
                )
            )
            logger.info(f"[PARALLEL THEME] Started ThemeAgent in background")

            # Emit theme_loading event so frontend shows spinner in theme tab
            yield _sse({'type': 'theme_loading', 'message': 'Detecting brand and colors...'})
            await asyncio.sleep(0)

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
                visual_density=(request.visualDensity or None),
                async_images=request.async_images if request.async_images is not None else True
            )

            
            outline = None  # Store the outline for deck creation
            
            # Check if streaming is available
            if hasattr(generator, 'stream_generation'):
                async for update in generator.stream_generation(options):
                    # Forward agent-based research events explicitly for frontend streaming UI
                    # BUT DO NOT send research findings to frontend - they're only used internally for slide content
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
                        # CRITICAL: DO NOT send 'findings' to frontend
                        # Research findings are only for internal use in slide generation
                        # Sources will appear on slides only when content actually cites them
                        if update.metadata:
                            metadata_copy = update.metadata.copy()
                            # Remove findings from metadata before sending to frontend
                            if 'findings' in metadata_copy:
                                del metadata_copy['findings']
                            research_payload.update(metadata_copy)
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
                        logger.debug(f"[API] Slide {update.metadata['slide_index'] + 1} has {tm_count} taggedMedia items in slide_data")
                        if tm_count > 0:
                            logger.debug(f"[API] First tagged media: {slide_data['taggedMedia'][0].get('filename', 'unknown')}")
                        
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
                        logger.debug(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
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
                                'deepResearch': slide_data.get('deepResearch', False),  # Include deepResearch flag
                                'citations': slide_data.get('citations', []),  # Include citations for frontend
                                'footnotes': slide_data.get('footnotes', [])  # Include footnotes for Sources panel
                            },
                            'progress': update.progress,
                            'message': f"Generated slide {update.metadata['slide_index'] + 1}: {slide_data['title']}"
                        }
                        
                        # Final debug log before sending
                        logger.debug(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        logger.info(f"[API STREAM] Slide {update.metadata['slide_index'] + 1}: citations={len(response_data['slide'].get('citations', []))}, footnotes={len(response_data['slide'].get('footnotes', []))}")
                        
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
                                    deepResearch=False,
                                    citations=s.get('citations', []),
                                    footnotes=s.get('footnotes', []),
                                    extractedData=s.get('extractedData'),
                                    taggedMedia=s.get('taggedMedia', [])
                                ))
                        except Exception:
                            simple_slides = []

                        # CRITICAL: Generate UUID for outline - this becomes the deck UUID
                        outline_id = result_data.get('id') or str(uuid.uuid4())
                        logger.info(f"[UUID_FIX] Creating outline with ID: {outline_id}")

                        # Convert uploadedMedia dicts to TaggedMediaItem objects if provided
                        uploaded_media_items = None
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia = {request.uploadedMedia}")
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia is None: {request.uploadedMedia is None}")
                        logger.info(f"[OUTLINE] 📎 request.uploadedMedia length: {len(request.uploadedMedia) if request.uploadedMedia else 0}")
                        if request.uploadedMedia:
                            from models.requests import TaggedMediaItem
                            uploaded_media_items = []
                            for media in request.uploadedMedia:
                                try:
                                    uploaded_media_items.append(TaggedMediaItem(
                                        id=media.get('id', str(uuid.uuid4())),
                                        filename=media.get('filename') or media.get('name', 'uploaded_file'),
                                        type=media.get('type', 'image'),
                                        content=media.get('content'),
                                        previewUrl=media.get('previewUrl') or media.get('url'),
                                        interpretation=media.get('interpretation'),
                                        status=media.get('status', 'processed'),
                                        metadata=media.get('metadata', {})
                                    ))
                                except Exception as media_err:
                                    logger.warning(f"[OUTLINE] Failed to convert media item: {media_err}")
                            logger.info(f"[OUTLINE] 📎 Including {len(uploaded_media_items)} uploadedMedia items in outline")

                        outline = DeckOutline(
                            id=outline_id,
                            title=result_data.get('title', 'Untitled Presentation'),
                            slides=simple_slides,
                            uploadedMedia=uploaded_media_items,
                            stylePreferences=None,
                            notes=None
                        )
                        
                        # ========================================================================
                        # USE PARALLEL THEME AGENT RESULTS
                        # The ThemeAgent has been running in parallel - now collect its results
                        # ========================================================================

                        # DON'T store raw conversation history as vibeContext - only store actual style preferences
                        # vibeContext should be short style descriptions like "fun", "professional", not chat logs
                        raw_style_context = request.styleContext or detected_style_context
                        filtered_vibe_context = None
                        if raw_style_context:
                            # Only use as vibeContext if it's a short style description (not conversation history)
                            # Conversation history contains "Context from conversation:" or multiple "User:"/"Assistant:" lines
                            is_conversation_history = (
                                "Context from conversation:" in raw_style_context or
                                raw_style_context.count("User:") > 1 or
                                raw_style_context.count("Assistant:") > 1 or
                                len(raw_style_context) > 500  # Too long to be a simple vibe description
                            )
                            if not is_conversation_history:
                                filtered_vibe_context = raw_style_context
                            else:
                                logger.info("[PARALLEL THEME] Filtered out conversation history from vibeContext")

                        # Wait for ThemeAgent to complete (it's been running in parallel)
                        theme_result = None
                        try:
                            theme_result = await asyncio.wait_for(theme_task, timeout=10.0)
                            logger.info(f"[PARALLEL THEME] ✅ ThemeAgent completed: source={theme_result.get('source')}, colors={len(theme_result.get('colors', []))}")
                        except asyncio.TimeoutError:
                            logger.warning("[PARALLEL THEME] ⚠️ ThemeAgent timed out, using defaults")
                        except Exception as theme_err:
                            logger.warning(f"[PARALLEL THEME] ⚠️ ThemeAgent failed: {theme_err}")

                        # Build style preferences from ThemeAgent result
                        # Use the outline title as initialIdea (cleaner than the raw prompt)
                        from models.requests import ColorConfigItem
                        style_prefs = StylePreferencesItem(
                            vibeContext=filtered_vibe_context,
                            initialIdea=outline.title or request.prompt,  # Prefer clean title over raw prompt
                            font=request.fontPreference
                        )

                        # Apply theme result if available
                        if theme_result:
                            # Set fonts from theme agent
                            fonts = theme_result.get('fonts', {})
                            if fonts.get('hero') and not request.fontPreference:
                                style_prefs.font = fonts['hero']
                            if fonts.get('body'):
                                style_prefs.bodyFont = fonts['body']
                            logger.info(f"[PARALLEL THEME] 🔤 Fonts: hero={style_prefs.font}, body={style_prefs.bodyFont}")

                            # Set colors from theme agent
                            theme_colors = theme_result.get('colors', [])
                            if theme_colors and len(theme_colors) >= 2:  # Accept 2+ colors
                                color_source = theme_result.get('source', 'unknown')
                                # Use explicit accent/accent2 fields from ThemeAgent if available
                                accent1 = theme_result.get('accent', theme_colors[0] if theme_colors else None)
                                accent2 = theme_result.get('accent2', theme_colors[1] if len(theme_colors) > 1 else None)
                                accent3 = theme_colors[2] if len(theme_colors) > 2 else None
                                # Don't use white as accent3
                                if accent3 and accent3.upper() in ['#FFFFFF', '#FFF', 'WHITE']:
                                    accent3 = None
                                style_prefs.colors = ColorConfigItem(
                                    type="custom",
                                    name=f"Theme Colors ({color_source})",
                                    background=theme_result.get('background', '#FFFFFF'),
                                    text=theme_result.get('text', '#1A1A1A'),
                                    accent1=accent1,
                                    accent2=accent2,
                                    accent3=accent3,
                                )
                                logger.info(f"[PARALLEL THEME] 🎨 Colors ({color_source}): bg={theme_result.get('background')}, accent1={accent1}, accent2={accent2}")

                            # Set logo from theme agent
                            if theme_result.get('logo_url'):
                                style_prefs.logoUrl = theme_result['logo_url']
                                logger.info(f"[PARALLEL THEME] 🖼️ Logo URL set")

                        # User-provided colors override theme agent
                        if isinstance(request.colorPreference, dict) and request.colorPreference.get('accent1'):
                            style_prefs.colors = ColorConfigItem(
                                type=str(request.colorPreference.get('type') or 'custom'),
                                name=request.colorPreference.get('name'),
                                background=request.colorPreference.get('background'),
                                text=request.colorPreference.get('text'),
                                accent1=request.colorPreference.get('accent1'),
                                accent2=request.colorPreference.get('accent2'),
                                accent3=request.colorPreference.get('accent3'),
                            )
                            logger.info(f"[PARALLEL THEME] 📦 User colors override: {request.colorPreference.get('accent1')}")

                        outline.stylePreferences = style_prefs

                        # Log final theme result
                        final_colors = getattr(style_prefs.colors, 'accent1', None) if style_prefs.colors else None
                        logger.info(f"[PARALLEL THEME] ✅ Final: font={style_prefs.font}, accent={final_colors}, logo={bool(getattr(style_prefs, 'logoUrl', None))}")

                        # Emit theme_ready event so frontend can update theme tab
                        theme_ready_data = {
                            'type': 'theme_ready',
                            'theme': {
                                'font': style_prefs.font,
                                'bodyFont': getattr(style_prefs, 'bodyFont', None),
                                'logoUrl': getattr(style_prefs, 'logoUrl', None),
                                'colors': None
                            }
                        }
                        if style_prefs.colors:
                            theme_ready_data['theme']['colors'] = {
                                'background': getattr(style_prefs.colors, 'background', None),
                                'text': getattr(style_prefs.colors, 'text', None),
                                'accent1': getattr(style_prefs.colors, 'accent1', None),
                                'accent2': getattr(style_prefs.colors, 'accent2', None),
                                'accent3': getattr(style_prefs.colors, 'accent3', None),
                            }
                        yield _sse(theme_ready_data)
                        await asyncio.sleep(0)

                        # Skip the old ThemeDirector logic - ThemeAgent already handled everything
                        # Only run ThemeDirector as fallback if ThemeAgent completely failed
                        if not theme_result or not theme_result.get('colors'):
                            logger.info("[PARALLEL THEME] No theme result, falling back to ThemeDirector...")
                            try:
                                from agents.generation.theme_director import ThemeDirector
                                director = ThemeDirector()
                                suggestion = await director.generate_quick_palette(
                                    title=outline.title,
                                    context=request.styleContext or request.prompt
                                )
                                colors = (suggestion or {}).get('color_palette') or {}
                                bg_color = colors.get('primary_background', '#FFFFFF')
                                text_color = colors.get('primary_text', '#1A1A1A')
                                accent_color = colors.get('accent_1', '#3B82F6')

                                style_prefs.colors = ColorConfigItem(
                                    type="custom",
                                    name="AI Theme Colors",
                                    background=bg_color,
                                    text=text_color,
                                    accent1=accent_color,
                                    accent2=colors.get('accent_2'),
                                    accent3=colors.get('accent_3'),
                                )
                                logger.info(f"[PARALLEL THEME] 🎨 ThemeDirector fallback: bg={bg_color}, accent={accent_color}")
                            except Exception as td_err:
                                logger.warning(f"[PARALLEL THEME] ThemeDirector fallback failed: {td_err}")

                        # Old theme logic removed - ThemeAgent handles everything now

                        # Additional debug to verify it was actually set
                        logger.info(f"[API OUTLINE] After setting - stylePreferences is None: {outline.stylePreferences is None}")
                        if outline.stylePreferences:
                            logger.info(f"[API OUTLINE] StylePreferences vibe after setting: {outline.stylePreferences.vibeContext}")
                            logger.info(f"[API OUTLINE] 🎨 StylePreferences FONTS after setting: hero={outline.stylePreferences.font}, body={outline.stylePreferences.bodyFont}")
                        
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

                        # Add videos from ThemeAgent to notes (for brand presentations)
                        if theme_result and theme_result.get('videos'):
                            if outline.notes is None:
                                outline.notes = {}
                            outline.notes['videos'] = theme_result['videos']
                            logger.info(f"[VIDEO] Added {len(theme_result['videos'])} brand videos to outline.notes")

                        # Also add scraped videos from OutlineAgent if provided
                        if request.scraped_videos:
                            if outline.notes is None:
                                outline.notes = {}
                            # Merge with theme videos if both exist
                            existing_videos = outline.notes.get('videos', [])
                            # Add scraped videos that aren't already in the list (by URL)
                            existing_urls = {v.get('url') for v in existing_videos}
                            for video in request.scraped_videos:
                                if video.get('url') not in existing_urls:
                                    existing_videos.append(video)
                            outline.notes['videos'] = existing_videos
                            logger.info(f"[VIDEO] Added scraped videos to outline.notes, total: {len(existing_videos)}")
                        
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
                        
                        # Accumulate slides for early narrative flow generation AND final outline
                        accumulated_slides.append({
                            'id': slide_data['id'],
                            'title': slide_data['title'],
                            'content': slide_data['content'],
                            'speaker_notes': slide_data.get('speaker_notes', ''),
                            'citations': slide_data.get('citations', []),
                            'footnotes': slide_data.get('footnotes', []),
                            'extractedData': slide_data.get('extractedData'),
                            'taggedMedia': slide_data.get('taggedMedia', [])
                        })
                        
                        # Build response data separately to avoid multi-line f-string issues
                        # Prepare taggedMedia with debug logging
                        tagged_media = slide_data.get('taggedMedia', [])
                        logger.debug(f"[API] Building slide_complete for slide {update.metadata['slide_index'] + 1} with {len(tagged_media)} taggedMedia items")
                        
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
                        logger.debug(f"[API] Sending slide_complete with taggedMedia count: {len(response_data['slide']['taggedMedia'])}")
                        
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
                    # Filter out conversation history from vibeContext
                    raw_style_context = request.styleContext
                    filtered_vibe = None
                    if raw_style_context:
                        is_conversation_history = (
                            "Context from conversation:" in raw_style_context or
                            raw_style_context.count("User:") > 1 or
                            raw_style_context.count("Assistant:") > 1 or
                            len(raw_style_context) > 500
                        )
                        if not is_conversation_history:
                            filtered_vibe = raw_style_context

                    style_prefs = StylePreferencesItem(
                        vibeContext=filtered_vibe,
                        initialIdea=outline.title if hasattr(outline, 'title') else request.prompt,
                        font=request.fontPreference
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
        from agents.config import GEMINI_FLASH_LITE
        model_name = GEMINI_FLASH_LITE
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
