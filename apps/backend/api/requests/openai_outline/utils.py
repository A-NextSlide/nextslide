import re
from typing import Optional, List, Dict, Any


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
    """Defer slide-count intent to the model and explicit inputs."""
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
