from typing import Dict, Any, List, Optional

from models.deck import DeckDiff, DeckDiffBase
from models.slide import SlideDiffBase
from models.component import ComponentDiffBase


def _match_intent(text: str) -> Optional[str]:
    if not text:
        return None
    t = text.lower()
    # Recognize explicit color words too (single-word commands like "red")
    color_words = [
        "red", "green", "blue", "orange", "yellow", "purple", "pink", "teal", "cyan", "black", "white"
    ]
    # Require an intent verb + a style keyword to reduce false positives
    intent_verbs = ["make", "set", "change", "turn", "update", "apply"]
    style_keywords = ["color", "colour", "background", "font", "typeface", "family", "text"] + color_words
    if (any(k in t for k in style_keywords) and any(v in t for v in intent_verbs)) or any(k in t for k in ["font", "typeface", "family"]):
        return "update_component_style"
    if any(k in t for k in ["align", "center", "centre", "left", "right", "middle"]):
        return "align_components"
    if any(k in t for k in ["move", "shift", "nudge"]):
        return "move_component"
    if any(k in t for k in ["replace text", "change text", "set text", "update text"]):
        return "replace_text"
    return None


def build_fast_deck_diff(message_text: str, selections: List[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Construct a minimal DeckDiff for simple micro-edits.

    Returns a dict matching API Edit (DeckDiff) shape.
    """
    
    # Only handle very clear, simple requests - escalate complex ones to agent
    if message_text and len(message_text.split()) > 8:
        # Long messages likely need agent planning
        return None
    # Allow no-selection for safe micro-edits (background/text/chart/icon) when intent is clear
    # We still block complex or ambiguous requests below.
    # If selections are provided, we will prefer targeting the first selection.
    
    op = _match_intent(message_text)
    if (op is None) and (message_text):
        # If a font was recognized even without explicit intent keywords, treat as style update
        # This makes single phrases like "comic sans" work fast
        lower = message_text.lower()
        FONT_MAP = {
            'comic sans': 'Comic Sans MS',
            'montserrat': 'Montserrat',
            'arial': 'Arial',
            'helvetica': 'Helvetica',
            'inter': 'Inter',
            'roboto': 'Roboto',
            'times new roman': 'Times New Roman',
            'georgia': 'Georgia'
        }
        for name in FONT_MAP.keys():
            if name in lower:
                op = "update_component_style"
                break

    lower_msg = (message_text or "").lower()
    # Avoid fastpath for brand/theme/logo/global requests – these should go through agent tools
    BLOCK_KEYWORDS = [
        "brand", "brand colors", "theme", "palette", "logo", "guideline",
        "apply brand", "apply theme", "all slides", "entire deck", "every slide"
    ]
    if any(k in lower_msg for k in BLOCK_KEYWORDS):
        return None
    
    # Extract color and font early for use in various paths
    COLOR_MAP = {
        'red': '#D32F2F', 'green': '#2E7D32', 'blue': '#1565C0', 'orange': '#EF6C00',
        'yellow': '#FBC02D', 'purple': '#7B1FA2', 'pink': '#C2185B', 'teal': '#00796B',
        'cyan': '#00838F', 'black': '#000000', 'white': '#FFFFFF'
    }
    chosen_color: Optional[str] = None
    chosen_font: Optional[str] = None
    
    if message_text:
        lower = message_text.lower()
        for name, hexcode in COLOR_MAP.items():
            if name in lower:
                chosen_color = hexcode
                break
        FONT_MAP = {
            'comic sans': 'Comic Sans MS',
            'montserrat': 'Montserrat',
            'arial': 'Arial',
            'helvetica': 'Helvetica',
            'inter': 'Inter',
            'roboto': 'Roboto',
            'times new roman': 'Times New Roman',
            'georgia': 'Georgia'
        }
        for name, fontname in FONT_MAP.items():
            if name in lower:
                chosen_font = fontname
                break
    
    # Global apply detection (no selections needed)
    apply_all = (
        any(k in lower_msg for k in ["all slides", "every slide", "entire deck", "whole deck"]) or
        any(k in lower_msg for k in ["all backgrounds", "all text"]) or
        ("all" in lower_msg and ("font" in lower_msg or "fonts" in lower_msg or "text" in lower_msg))
    )

    target_is_background = any(k in lower_msg for k in ["background", "backgrounds", "bg"]) and "text" not in lower_msg
    target_is_text = "text" in lower_msg or any(k in lower_msg for k in ["titles", "headings"]) 

    if op == "update_component_style" and apply_all:
        # Allow safe global text/font changes; require flag for background global
        try:
            import os as _os
            allow_global_flag = _os.getenv("FASTPATH_ALLOW_GLOBAL", "false").lower() == "true"
        except Exception:
            allow_global_flag = False
        style_payload: Dict[str, Any] = {}
        if chosen_color and target_is_background:
            if not allow_global_flag:
                return None
            style_payload = {"background": {"type": "solid", "color": chosen_color}}
        elif chosen_color and target_is_text:
            style_payload = {"textColor": chosen_color}
        elif chosen_font:
            style_payload = {"fontFamily": chosen_font}
        if not style_payload:
            return None
        return {
            "operations": [
                {"op": "update_component_style", "componentId": "__ALL__", "slideId": "__ALL__", "style": style_payload}
            ],
            "applyToAllSlides": True
        }

    if not op:
        # Allow simple color-only updates when there is at least one selection
        # Recompute quick color detection locally
        quick_color = None
        try:
            COLOR_MAP_LOCAL = {
                'red': '#D32F2F', 'green': '#2E7D32', 'blue': '#1565C0', 'orange': '#EF6C00',
                'yellow': '#FBC02D', 'purple': '#7B1FA2', 'pink': '#C2185B', 'teal': '#00796B',
                'cyan': '#00838F', 'black': '#000000', 'white': '#FFFFFF'
            }
            low = (message_text or "").lower()
            for name, code in COLOR_MAP_LOCAL.items():
                if name in low:
                    quick_color = code
                    break
        except Exception:
            quick_color = None
        if (selections and quick_color):
            op = "update_component_style"
        elif quick_color:
            # Permit no-selection flow; we'll create slide-targeted ops below
            op = "update_component_style"
        else:
            return None

    # No-selection, slide-aware micro-edits: background/text/title/chart/icon
    if (not selections) and op == "update_component_style":
        quick_color = chosen_color or (quick_color if 'quick_color' in locals() else None)
        # Background solid color on current slide
        if ("background" in lower_msg) and quick_color:
            return {
                "operations": [
                    {
                        "op": "update_component_style",
                        "componentId": "__CURRENT_SLIDE__",
                        "slideId": "__CURRENT_SLIDE__",
                        "style": {"background": {"type": "solid", "color": quick_color}}
                    }
                ]
            }
        # Title/text color on current slide
        if (any(k in lower_msg for k in ["title", "heading"]) and (quick_color or chosen_font)):
            style_payload: Dict[str, Any] = {"textColor": quick_color} if quick_color else {"fontFamily": chosen_font}
            return {
                "operations": [
                    {
                        "op": "update_component_style",
                        "componentId": "__CURRENT_SLIDE__",
                        "slideId": "__CURRENT_SLIDE__",
                        "style": style_payload
                    }
                ]
            }
        # Chart color on current slide (will be refined to update_chart)
        if (any(k in lower_msg for k in ["chart", "graph"]) and quick_color):
            return {
                "operations": [
                    {
                        "op": "update_component_style",
                        "componentId": "__CURRENT_SLIDE__",
                        "slideId": "__CURRENT_SLIDE__",
                        "style": {"color": quick_color}
                    }
                ]
            }
        # Icon color on current slide
        if ("icon" in lower_msg) and quick_color:
            return {
                "operations": [
                    {
                        "op": "update_component_style",
                        "componentId": "__CURRENT_SLIDE__",
                        "slideId": "__CURRENT_SLIDE__",
                        "style": {"color": quick_color}
                    }
                ]
            }
        # Generic text/font color on current slide
        if (any(k in lower_msg for k in ["text", "font", "fonts"]) and (quick_color or chosen_font)):
            style_payload2: Dict[str, Any] = {"textColor": quick_color} if quick_color else {"fontFamily": chosen_font}
            return {
                "operations": [
                    {
                        "op": "update_component_style",
                        "componentId": "__CURRENT_SLIDE__",
                        "slideId": "__CURRENT_SLIDE__",
                        "style": style_payload2
                    }
                ]
            }
        # If we couldn't infer a safe target, fall back to agentic
        return None

    ops: List[Dict[str, Any]] = []
    # Escalate to agentic path for complex requests (images, scenes, ambiguous backgrounds, explicit moves)
    message_lower = (message_text or "").lower()
    COMPLEX_KEYWORDS = [
        "image", "photo", "picture", "wallpaper", "unsplash", "pexels",
        "sunset", "sunrise", "mountain", "forest", "beach", "city", "landscape",
        "texture", "pattern", "illustration", "render", "photograph"
    ]
    # Treat explicit gradient requests as complex (agentic) ONLY for slide-level selections.
    # For direct component selections (e.g., a Shape), we can handle simple gradient background fast.
    if "gradient" in message_lower:
        # If the primary selection is the slide, escalate to agentic
        if selections and (selections[0].get("elementType") or "").lower() == "slide":
            return None
    # Treat explicit movement/positioning requests as complex (let agent plan precise coordinates)
    MOVEMENT_KEYWORDS = [
        "move left", "move right", "move up", "move down", "move the", "position", "x=", "y=", "left side", "right side"
    ]
    if any(k in message_lower for k in MOVEMENT_KEYWORDS):
        return None
    if any(k in message_lower for k in COMPLEX_KEYWORDS):
        return None
    # Basic heuristics: apply to first selection for single-target ops
    primary = selections[0]
    element_id = primary.get("elementId")
    slide_id = primary.get("slideId")
    element_type = (primary.get("elementType") or "").lower()
    # Allow slide-level selections for safe style operations handled below

    if op == "update_component_style":
        if not element_id or not slide_id:
            return None
        # If user selected the entire slide, decide between textColor vs background
        if element_type == "slide":
            if chosen_font:
                ops.append({
                    "op": op,
                    "componentId": element_id,
                    "slideId": slide_id,
                    "style": {"fontFamily": chosen_font}
                })
            else:
                # Treat explicit mentions of text or font as text color changes when a color is present
                wants_text = (
                    chosen_color is not None and any(
                        kw in message_lower for kw in [
                            "text", "content", "letters", "words", "title", "heading",
                            "font", "font color", "typeface"
                        ]
                    )
                )
                if wants_text and chosen_color:
                    ops.append({
                        "op": op,
                        "componentId": element_id,
                        "slideId": slide_id,
                        "style": {"textColor": chosen_color}
                    })
                else:
                    if chosen_color:
                        ops.append({
                            "op": op,
                            "componentId": element_id,
                            "slideId": slide_id,
                            "style": {"background": {"type": "solid", "color": chosen_color}}
                        })
                    else:
                        # No explicit color specified → ambiguous; let agent handle it
                        return None
        else:
            # Component-level: support gradient or text color/font quick changes
            if chosen_font:
                ops.append({
                    "op": op,
                    "componentId": element_id,
                    "slideId": slide_id,
                    "style": {"fontFamily": chosen_font}
                })
            elif "gradient" in message_lower:
                # Build a simple two-stop gradient using the chosen color when available
                # If no explicit color was found, fall back to green/teal blend for pleasant default
                c1 = chosen_color or "#2E7D32"
                # Derive a second stop (slightly darker) by defaulting to a complementary green-teal if no hint
                c2 = "#1565C0" if ("blue" in message_lower) else ("#7B1FA2" if ("purple" in message_lower) else ("#00796B"))
                ops.append({
                    "op": op,
                    "componentId": element_id,
                    "slideId": slide_id,
                    "style": {
                        "background": {
                            "type": "gradient",
                            "colors": [c1, c2],
                            "angle": 135
                        }
                    }
                })
            elif chosen_color:
                ops.append({
                    "op": op,
                    "componentId": element_id,
                    "slideId": slide_id,
                    "style": {"textColor": chosen_color}
                })
            elif quick_color:
                ops.append({
                    "op": op,
                    "componentId": element_id,
                    "slideId": slide_id,
                    "style": {"textColor": quick_color}
                })
            else:
                # No explicit simple style to apply → let agent handle it
                return None
    elif op == "align_components":
        component_ids = [s.get("elementId") for s in selections if s.get("elementId")]
        if len(component_ids) >= 2:
            ops.append({
                "op": op,
                "componentIds": component_ids,
                "alignment": "center"
            })
        else:
            return None
    elif op == "move_component":
        # Do not attempt to move a whole slide id; requires a concrete component selection
        if primary.get("elementType", "").lower() == "slide":
            return None
        if not element_id or not slide_id:
            return None
        ops.append({
            "op": op,
            "componentId": element_id,
            "slideId": slide_id,
            "x": 0,
            "y": 10
        })
    elif op == "replace_text":
        if not element_id or not slide_id:
            return None
        ops.append({
            "op": op,
            "componentId": element_id,
            "slideId": slide_id,
            "text": "Updated"
        })
    else:
        return None

    return {
        "operations": ops
    }


