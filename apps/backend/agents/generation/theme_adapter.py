"""
Theme adapter to align backend theme structure with the frontend ThemePanel mapping
and apply theme properties to generated slide components.

This focuses on:
- Producing a simplified, frontend-friendly theme object (page, typography, accents)
- Applying that theme to component props in a consistent way prior to persistence
"""

from typing import Any, Dict, List
from agents.generation.color_contrast_manager import ColorContrastManager


class ThemeAdapter:
    """Converts the internal ThemeSpec/Dict to a simplified frontend theme model
    and provides utilities to apply that theme to slide components.
    """

    @staticmethod
    def _as_dict(theme: Any) -> Dict[str, Any]:
        if theme is None:
            return {}
        if hasattr(theme, 'to_dict'):
            return theme.to_dict()
        if isinstance(theme, dict):
            return theme
        # Unknown shape
        return {}

    @classmethod
    def build_frontend_theme(cls, theme: Any) -> Dict[str, Any]:
        """Build a minimal ThemePanel-like mapping used by the frontend.

        Returns keys:
        - page.backgroundColor
        - typography.paragraph.{fontFamily,color}
        - typography.heading.fontFamily
        - accents.accent1, accents.accent2
        - metadata.paletteSource (if available)
        """
        td = cls._as_dict(theme)
        colors = td.get('color_palette', {}) or {}
        typography = td.get('typography', {}) or {}

        primary_bg = (
            colors.get('primary_background')
            or colors.get('primary_bg')
            or colors.get('background')
            or '#FFFFFF'
        )
        primary_text = (
            colors.get('primary_text')
            or colors.get('text')
            or '#1A1A1A'
        )
        accent_1 = colors.get('accent_1') or colors.get('primary') or '#2563EB'
        accent_2 = colors.get('accent_2') or colors.get('secondary') or '#F59E0B'

        # Typography
        body = typography.get('body_text', {}) or typography.get('body', {}) or {}
        hero = typography.get('hero_title', {}) or typography.get('heading', {}) or {}
        body_family = body.get('family') or 'Poppins'
        hero_family = hero.get('family') or 'Montserrat'

        # Detect palette source if we have it (used to disable gradients)
        palette_source = colors.get('source') or td.get('palette_source')

        return {
            'page': {
                'backgroundColor': primary_bg
            },
            'typography': {
                'paragraph': {
                    'fontFamily': body_family,
                    'color': primary_text
                },
                'heading': {
                    'fontFamily': hero_family
                }
            },
            'accents': {
                'accent1': accent_1,
                'accent2': accent_2
            },
            'metadata': {
                'paletteSource': palette_source or 'unknown'
            }
        }

    @classmethod
    def apply_theme_to_components(
        cls,
        components: List[Dict[str, Any]],
        theme_panel: Dict[str, Any],
        original_theme: Any = None
    ) -> List[Dict[str, Any]]:
        """Apply theme values to components in-place and return the list.

        Rules:
        - Background: preserve gradients if present, otherwise use theme colors
        - TiptapTextBlock: set fontFamily and default text colors
        - Lines: default stroke to accent1 if missing
        - Icon: default color to accent1
        - Shape: default fill to accent1 when off-palette
        - Chart: set seriesColors if present
        - Table: set tableStyles if present
        """
        if not isinstance(components, list):
            return components

        page_bg = theme_panel.get('page', {}).get('backgroundColor', '#FFFFFF')
        paragraph_typo = theme_panel.get('typography', {}).get('paragraph', {})
        heading_typo = theme_panel.get('typography', {}).get('heading', {})
        body_family = paragraph_typo.get('fontFamily', 'Poppins')
        hero_family = heading_typo.get('fontFamily', 'Montserrat')
        text_color = paragraph_typo.get('color', '#1A1A1A')
        accent1 = theme_panel.get('accents', {}).get('accent1', '#2563EB')
        accent2 = theme_panel.get('accents', {}).get('accent2', '#F59E0B')
        palette_source = theme_panel.get('metadata', {}).get('paletteSource', 'unknown')

        # Derive a base readable text color against the page background
        try:
            contrast = ColorContrastManager().get_readable_text_color(str(page_bg))
            base_text_color = contrast.get('recommended') or text_color
        except Exception:
            base_text_color = text_color

        # Helpers for local background detection and safe color handling
        def _normalize_hex(color: Any) -> Any:
            if not isinstance(color, str):
                return color
            c = color.strip()
            # Normalize #RRGGBBAA → #RRGGBB (ignore alpha)
            if c.startswith('#') and len(c) == 9:
                return '#' + c[1:7]
            return c

        def _rect(props: Dict[str, Any]) -> tuple:
            pos = props.get('position') or {}
            try:
                x = int(pos.get('x', 0) or 0)
                y = int(pos.get('y', 0) or 0)
                w = int(props.get('width', 0) or 0)
                h = int(props.get('height', 0) or 0)
            except Exception:
                x, y, w, h = 0, 0, 0, 0
            return (x, y, w, h)

        def _intersects(a: tuple, b: tuple) -> bool:
            ax, ay, aw, ah = a
            bx, by, bw, bh = b
            if aw <= 0 or ah <= 0 or bw <= 0 or bh <= 0:
                return False
            return not (ax + aw <= bx or bx + bw <= ax or ay + ah <= by or by + bh <= ay)

        # Build a map of potential local backgrounds (background + filled shapes)
        contrast_mgr = ColorContrastManager()
        shape_layers: List[Dict[str, Any]] = []

        # Always include the page background as a layer
        shape_layers.append({
            'rect': (0, 0, 1920, 1080),
            'color': _normalize_hex(page_bg),
            'z': 0,
            'as_container': True
        })

        # Pre-scan shapes and normalize fills so we can reason about local contrast
        for comp in components:
            ctype = comp.get('type')
            props = comp.setdefault('props', {})

            if ctype == 'Background':
                # Ensure base props but preserve existing gradient if already set
                props.setdefault('position', {'x': 0, 'y': 0})
                props.setdefault('width', 1920)
                props.setdefault('height', 1080)
                existing_type = props.get('backgroundType')
                if existing_type not in ('color', 'gradient'):
                    # Default to color only when not already configured
                    props['backgroundType'] = 'color'
                    props['backgroundColor'] = page_bg if isinstance(page_bg, str) else '#FFFFFF'
                elif existing_type == 'color':
                    # Backfill color if missing
                    props.setdefault('backgroundColor', page_bg if isinstance(page_bg, str) else '#FFFFFF')

            if ctype == 'Shape':
                fill = props.get('fill')
                # If missing or extreme defaults, seed with accent1 for visibility
                if not isinstance(fill, str) or fill.lower() in ['#000', '#000000', '#fff', '#ffffff']:
                    props['fill'] = accent1
                    fill = accent1
                layer = {
                    'rect': _rect(props),
                    'color': _normalize_hex(fill),
                    'z': props.get('zIndex', 1) if isinstance(props.get('zIndex'), int) else 1,
                    'as_container': bool(props.get('asContainer', True))
                }
                shape_layers.append(layer)

        for comp in components:
            ctype = comp.get('type')
            props = comp.setdefault('props', {})

            # 1) Backgrounds
            if ctype == 'Background':
                # Backfill base props but do not clobber existing gradient settings
                props.setdefault('position', {'x': 0, 'y': 0})
                props.setdefault('width', 1920)
                props.setdefault('height', 1080)
                props.setdefault('opacity', 1)
                props.setdefault('rotation', 0)
                props.setdefault('zIndex', 0)
                existing_type = props.get('backgroundType')
                if existing_type not in ('color', 'gradient'):
                    props['backgroundType'] = 'color'
                    props['backgroundColor'] = page_bg if isinstance(page_bg, str) else '#FFFFFF'
                elif existing_type == 'color':
                    props.setdefault('backgroundColor', page_bg if isinstance(page_bg, str) else '#FFFFFF')

            # 2) Tiptap text blocks
            elif ctype == 'TiptapTextBlock':
                # Determine if heading by size; otherwise use body
                font_size = props.get('fontSize', 0)
                is_heading = font_size and font_size >= 60 or (props.get('position', {}).get('y', 999) < 200)
                props['fontFamily'] = hero_family if is_heading else body_family
                props.setdefault('textShadow', '0 4px 24px rgba(0,0,0,0.25)')
                # Ensure text color for segments
                texts = props.get('texts') or []
                if isinstance(texts, list) and texts:
                    max_size = max((t.get('fontSize', 0) for t in texts), default=0)
                    # Determine local background behind this text block
                    text_rect = _rect(props)
                    text_z = props.get('zIndex', 1) if isinstance(props.get('zIndex'), int) else 1
                    local_bg = page_bg
                    # Pick the topmost intersecting layer not above the text
                    candidates = [
                        L for L in shape_layers
                        if _intersects(text_rect, L['rect']) and L['z'] <= text_z and isinstance(L.get('color'), str)
                    ]
                    if candidates:
                        candidates.sort(key=lambda L: L['z'], reverse=True)
                        local_bg = candidates[0]['color']
                    local_bg = _normalize_hex(local_bg)
                    dominant_color = None
                    for t in texts:
                        if not t.get('color') or str(t.get('color')).lower() in ['#000', '#000000']:
                            # Emphasize the largest segment with accent1; others use readable base text color
                            t['color'] = accent1 if t.get('fontSize', 0) == max_size else base_text_color
                        # If color matches the local background or contrast is too low, adjust to readable
                        try:
                            current = _normalize_hex(t.get('color'))
                            if isinstance(current, str) and isinstance(local_bg, str):
                                same = current.lower() == local_bg.lower()
                                cr = contrast_mgr.get_contrast_ratio(local_bg, current)
                                if same or cr < 4.5:
                                    recommended = contrast_mgr.get_readable_text_color(local_bg).get('recommended')
                                    if isinstance(recommended, str):
                                        t['color'] = recommended
                        except Exception:
                            pass
                        # Ensure nested style structure is present for frontend
                        style = t.get('style') if isinstance(t.get('style'), dict) else {}
                        # Always mirror the adjusted readable color into style.textColor so renderers use it
                        style['textColor'] = t.get('color')
                        style.setdefault('backgroundColor', '#00000000')
                        t['style'] = style
                        # Track dominant (largest) segment color after adjustments
                        try:
                            if t.get('fontSize', 0) == max_size and isinstance(t.get('color'), str):
                                dominant_color = _normalize_hex(t.get('color'))
                        except Exception:
                            pass
                    # Also reflect a readable color at the root for renderers that use props.textColor
                    if isinstance(dominant_color, str):
                        props['textColor'] = dominant_color
                    else:
                        # Fall back to a readable color against local/page background
                        try:
                            props['textColor'] = contrast_mgr.get_readable_text_color(local_bg).get('recommended') or base_text_color
                        except Exception:
                            props['textColor'] = base_text_color
                else:
                    # Single color fallback
                    # Determine local background for single-color text block
                    text_rect = _rect(props)
                    text_z = props.get('zIndex', 1) if isinstance(props.get('zIndex'), int) else 1
                    local_bg = page_bg
                    candidates = [
                        L for L in shape_layers
                        if _intersects(text_rect, L['rect']) and L['z'] <= text_z and isinstance(L.get('color'), str)
                    ]
                    if candidates:
                        candidates.sort(key=lambda L: L['z'], reverse=True)
                        local_bg = candidates[0]['color']
                    local_bg = _normalize_hex(local_bg)
                    chosen = props.get('color') or base_text_color
                    chosen = _normalize_hex(chosen)
                    try:
                        if not isinstance(chosen, str) or contrast_mgr.get_contrast_ratio(local_bg, chosen) < 4.5:
                            chosen = contrast_mgr.get_readable_text_color(local_bg).get('recommended') or base_text_color
                    except Exception:
                        chosen = base_text_color
                    props['color'] = chosen
                    # Ensure root textColor mirrors the chosen readable color
                    props['textColor'] = chosen

            # 2b) Plain text components should also receive theme + contrast
            elif ctype in ('TextBlock', 'Title'):
                is_title = (ctype == 'Title') or (props.get('fontSize', 0) and props.get('fontSize', 0) >= 60)
                props.setdefault('fontFamily', hero_family if is_title else body_family)
                # Apply readable text color if missing/black
                tc = props.get('textColor') or props.get('color')
                # Determine local background for the text block
                text_rect = _rect(props)
                text_z = props.get('zIndex', 1) if isinstance(props.get('zIndex'), int) else 1
                local_bg = page_bg
                candidates = [
                    L for L in shape_layers
                    if _intersects(text_rect, L['rect']) and L['z'] <= text_z and isinstance(L.get('color'), str)
                ]
                if candidates:
                    candidates.sort(key=lambda L: L['z'], reverse=True)
                    local_bg = candidates[0]['color']
                local_bg = _normalize_hex(local_bg)
                chosen = tc if isinstance(tc, str) else base_text_color
                chosen = _normalize_hex(chosen)
                try:
                    if not isinstance(chosen, str) or contrast_mgr.get_contrast_ratio(local_bg, chosen) < 4.5:
                        chosen = contrast_mgr.get_readable_text_color(local_bg).get('recommended') or base_text_color
                except Exception:
                    chosen = base_text_color
                props['textColor'] = chosen
                props.setdefault('textShadow', '0 4px 24px rgba(0,0,0,0.25)')

            # 3) Lines
            elif ctype == 'Lines':
                # Check if this is a divider line
                metadata = props.get('metadata', {})
                is_divider = metadata.get('role') == 'divider'
                
                if is_divider:
                    # For dividers, use a more subtle color
                    if 'stroke' not in props or not isinstance(props.get('stroke'), str):
                        # Try to use a muted version of text color or accent
                        try:
                            # Use a semi-transparent version of the text color
                            props['stroke'] = text_color + '40'  # 25% opacity
                        except:
                            props['stroke'] = accent1
                    
                    # Dividers should be thinner and more subtle
                    props.setdefault('strokeWidth', 2)
                    props.setdefault('opacity', 0.5)
                else:
                    # For connectors/arrows, use accent color
                    if 'stroke' not in props or not isinstance(props.get('stroke'), str):
                        props['stroke'] = accent1
                    props.setdefault('strokeWidth', 4)

            # 4) Icons
            elif ctype == 'Icon':
                if 'color' not in props or not isinstance(props.get('color'), str):
                    props['color'] = accent1

            # 5) Shapes
            elif ctype == 'Shape':
                fill = props.get('fill')
                if not isinstance(fill, str) or fill.lower() in ['#000', '#000000', '#fff', '#ffffff']:
                    props['fill'] = accent1

            # 6) Charts
            elif ctype == 'Chart':
                # Respect existing seriesColors, or seed sensible defaults
                sc = props.get('seriesColors')
                if not isinstance(sc, list) or len(sc) == 0:
                    props['seriesColors'] = [accent1, accent2, text_color, '#A3A3A3']
                # Apply theme-aware text/background defaults expected by renderers
                try:
                    # textColor readable against page background
                    readable = contrast_mgr.get_readable_text_color(_normalize_hex(page_bg)).get('recommended') or text_color
                except Exception:
                    readable = text_color
                props.setdefault('textColor', readable)
                props.setdefault('backgroundColor', _normalize_hex(page_bg))
                # Provide a generic colors array if missing
                if 'colors' not in props or not isinstance(props.get('colors'), list):
                    props['colors'] = props.get('seriesColors', [accent1, accent2, text_color, '#A3A3A3'])
                # Light/dark theme hint
                try:
                    props.setdefault('theme', 'dark' if contrast_mgr.is_dark_color(_normalize_hex(page_bg)) else 'light')
                except Exception:
                    props.setdefault('theme', 'light')

            # 7) Tables
            elif ctype == 'Table':
                ts = props.get('tableStyles')
                if not isinstance(ts, dict):
                    ts = {}
                # Ensure frontend-consumed flat style keys with sensible defaults
                ts.setdefault('headerBackgroundColor', accent1)
                ts.setdefault('headerTextColor', '#FFFFFF')
                ts.setdefault('textColor', text_color)
                # Tighter default table cell padding to avoid excessive whitespace on slides
                ts.setdefault('cellPadding', 8)
                # Keep nested keys for forward-compat renderers that support them
                ts.setdefault('header', {})
                ts.setdefault('body', {})
                ts['header'].setdefault('backgroundColor', ts.get('headerBackgroundColor', accent1))
                ts['header'].setdefault('color', ts.get('headerTextColor', '#FFFFFF'))
                ts['body'].setdefault('color', ts.get('textColor', text_color))
                props['tableStyles'] = ts

            # 8) CustomComponent: pass theme hints
            elif ctype == 'CustomComponent':
                props.setdefault('primaryColor', accent1)
                props.setdefault('secondaryColor', accent2)
                props.setdefault('textColor', text_color)
                props.setdefault('fontFamily', hero_family)
                # New: seed alignment/emphasis defaults for big callouts matching page design
                if 'alignment' not in props:
                    # Prefer left alignment when there is strong left text presence; default center otherwise
                    try:
                        # Heuristic: if any heading/title is left-aligned near top-left, align custom component left
                        left_bias = False
                        for comp2 in components:
                            if comp2.get('type') in ('Title', 'TiptapTextBlock'):
                                p2 = comp2.get('props', {}) or {}
                                x = int((p2.get('position') or {}).get('x', 9999) or 9999)
                                if x <= 200 and (p2.get('alignment') in (None, 'left')):
                                    left_bias = True
                                    break
                        props['alignment'] = 'left' if left_bias else 'center'
                    except Exception:
                        props.setdefault('alignment', 'center')
                # Emphasis: default to 'hero' when value/label present (big callouts)
                if 'emphasis' not in props:
                    has_value = bool(props.get('value') or props.get('mainText') or props.get('text') or props.get('content'))
                    props['emphasis'] = 'hero' if has_value else 'normal'

            # 9) Images: ensure a default textColor for overlays/captions
            elif ctype == 'Image':
                try:
                    readable_img = contrast_mgr.get_readable_text_color(_normalize_hex(page_bg)).get('recommended') or text_color
                except Exception:
                    readable_img = text_color
                props.setdefault('textColor', readable_img)

            # Write back props
            comp['props'] = props

        return components


