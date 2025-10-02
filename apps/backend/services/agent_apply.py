from __future__ import annotations

from typing import Dict, Any, List, Tuple, Optional
from datetime import datetime

from utils.supabase import get_deck
from agents.persistence.deck_persistence import DeckPersistence


def _find_component(slide: Dict[str, Any], component_id: str) -> Optional[Dict[str, Any]]:
    for comp in slide.get("components", []) or []:
        if comp.get("id") == component_id:
            return comp
    return None


def _find_slide_and_index(deck: Dict[str, Any], slide_id: str) -> Tuple[Optional[Dict[str, Any]], Optional[int]]:
    slides = deck.get("slides", []) or []
    for idx, slide in enumerate(slides):
        if slide.get("id") == slide_id:
            return slide, idx
    return None, None


def _normalize_gradient_payload(gradient_payload: Dict[str, Any] | None) -> Dict[str, Any]:
    """Normalize gradient payload into { type, angle, stops: [{color, position}], colors }."""
    try:
        payload = gradient_payload or {}
        if not isinstance(payload, dict):
            payload = {}
        gtype = payload.get("type") or "linear"
        angle = payload.get("angle") if isinstance(payload.get("angle"), (int, float)) else 135
        stops: list[Dict[str, Any]] = []
        colors: list[str] = []
        if isinstance(payload.get("stops"), list) and payload.get("stops"):
            raw = payload.get("stops")
            for i, st in enumerate(raw):
                color = None
                pos = None
                if isinstance(st, dict):
                    color = st.get("color") or st.get("fill")
                    if "position" in st:
                        pos = float(st.get("position"))
                    elif "offset" in st:
                        try:
                            pos = float(st.get("offset")) * 100.0
                        except Exception:
                            pos = None
                else:
                    color = st
                if pos is None:
                    pos = (float(i) / float(max(1, len(raw) - 1))) * 100.0
                if color:
                    stops.append({"color": color, "position": pos})
            colors = [s.get("color") for s in stops if s.get("color")]
        else:
            colors_in: list[str] = []
            if isinstance(payload.get("colors"), list):
                colors_in = [c for c in payload.get("colors") if isinstance(c, str)]
            elif payload.get("from") and payload.get("to"):
                colors_in = [payload.get("from"), payload.get("to")]
            n = len(colors_in)
            for i, c in enumerate(colors_in):
                pos = (float(i) / float(max(1, n - 1))) * 100.0
                stops.append({"color": c, "position": pos})
            colors = colors_in
        return {"type": gtype, "angle": angle, "stops": stops, "colors": colors}
    except Exception:
        return {"type": "linear", "angle": 135, "stops": []}


def _apply_update_component_style(slide: Dict[str, Any], component_id: str, style: Dict[str, Any]) -> bool:
    comp = _find_component(slide, component_id)
    if not comp:
        # Only consider slide-level fallbacks when targeting the actual slide id
        if component_id != slide.get("id"):
            return False
        # Fallback: if targeting a slide, apply to ALL Background components when present
        background_components: List[Dict[str, Any]] = []
        for c in (slide.get("components", []) or []):
            if c.get("type") == "Background" or (isinstance(c.get("props"), dict) and c["props"].get("kind") == "background"):
                background_components.append(c)
        if background_components:
            applied_any = False
            background_payload = style.get("background") if isinstance(style, dict) else None
            # Apply background normalization to all background components if a background payload provided
            if background_payload is not None:
                for bc in background_components:
                    bprops = bc.setdefault("props", {})
                    btype = (background_payload or {}).get("type")
                    if btype == "solid":
                        color = background_payload.get("color") or background_payload.get("backgroundColor")
                        if color:
                            bprops["backgroundType"] = "color"
                            bprops["backgroundColor"] = color
                            if "gradient" in bprops:
                                try:
                                    del bprops["gradient"]
                                except Exception:
                                    pass
                            applied_any = True
                    elif btype == "gradient":
                        bprops["backgroundType"] = "gradient"
                        grad_src = background_payload.get("gradient") if isinstance(background_payload.get("gradient"), dict) else background_payload
                        bprops["gradient"] = _normalize_gradient_payload(grad_src)
                        if "backgroundColor" in bprops:
                            try:
                                del bprops["backgroundColor"]
                            except Exception:
                                pass
                        applied_any = True
                    else:
                        # Unknown type - write legacy field for compatibility
                        bprops["background"] = background_payload
                        applied_any = True
            # If only textColor present at slide level, propagate to text components
            elif isinstance(style, dict) and style.get("textColor"):
                color_to_apply = style.get("textColor")
                for c in (slide.get("components", []) or []):
                    cprops = c.setdefault("props", {})
                    ctype = c.get("type")
                    if ctype in ["TextBlock", "Title"]:
                        cprops["textColor"] = color_to_apply
                        applied_any = True
                    elif ctype == "TiptapTextBlock":
                        _apply_tiptap_text_color(slide, c.get("id"), color_to_apply)
                        applied_any = True
            return applied_any
        # No matching component and no backgrounds to update
        return False
    props = comp.setdefault("props", {})
    # Normalize backgrounds: prefer props.background for Background component, else props.style.background
    comp_type = (comp or {}).get("type")
    is_background = (comp_type == "Background") or (props.get("kind") == "background")
    background_payload = style.get("background") if isinstance(style, dict) else None
    if background_payload is not None:
        if is_background:
            # Normalize to renderer-expected fields
            btype = (background_payload or {}).get("type")
            if btype == "solid":
                color = background_payload.get("color") or background_payload.get("backgroundColor")
                if color:
                    props["backgroundType"] = "color"
                    props["backgroundColor"] = color
                    # Remove any gradient remnants if present
                    if "gradient" in props:
                        try:
                            del props["gradient"]
                        except Exception:
                            pass
                else:
                    # Fallback to legacy field if no color present
                    props["background"] = background_payload
            elif btype == "gradient":
                props["backgroundType"] = "gradient"
                grad_src = background_payload.get("gradient") if isinstance(background_payload.get("gradient"), dict) else background_payload
                props["gradient"] = _normalize_gradient_payload(grad_src)
                # Remove plain backgroundColor if set from prior state to avoid conflicts
                if "backgroundColor" in props:
                    try:
                        del props["backgroundColor"]
                    except Exception:
                        pass
            else:
                # Unknown type: keep legacy field for compatibility
                props["background"] = background_payload
        else:
            style_target = props.setdefault("style", {})
            style_target["background"] = background_payload
    else:
        # Shallow merge any other style keys
        # Do NOT attach textColor to Background component style; instead propagate to text comps on the same slide
        desired_color = None
        desired_font = None
        if isinstance(style, dict):
            desired_color = style.get("textColor")
            desired_font = style.get("fontFamily")

        if comp_type == "Background":
            changed_any = False
            if desired_color:
                for c in (slide.get("components", []) or []):
                    cprops = c.setdefault("props", {})
                    ctype = c.get("type")
                    if ctype in ["TextBlock", "Title"]:
                        cprops["textColor"] = desired_color
                        changed_any = True
                    elif ctype == "TiptapTextBlock":
                        _apply_tiptap_text_color(slide, c.get("id"), desired_color)
                        changed_any = True
            # Do not set Background.props.style for text-only changes
            return changed_any
        else:
            style_target = props.setdefault("style", {})
            style_target.update(style or {})
            # Promote text-related fields appropriately
            if desired_color:
                if comp_type == "TiptapTextBlock":
                    _apply_tiptap_text_color(slide, comp.get("id"), desired_color)
                elif comp_type in ["TextBlock", "Title"]:
                    props["textColor"] = desired_color
            if desired_font and comp_type in ["TiptapTextBlock", "TextBlock", "Title"]:
                props["fontFamily"] = desired_font

    # If the op targeted a slide-level selection and no component was found initially,
    # we may have selected the slide id. In that case, we applied background above by
    # falling back to Background component when present. If textColor was requested at
    # slide level, propagate to all text components on that slide to give visible effect.
    if component_id == slide.get("id") and isinstance(style, dict):
        # Propagate textColor across text components
        if style.get("textColor"):
            color_to_apply = style.get("textColor")
            for c in (slide.get("components", []) or []):
                cprops = c.setdefault("props", {})
                ctype = c.get("type")
                if ctype in ["TextBlock", "Title"]:
                    cprops["textColor"] = color_to_apply
                elif ctype == "TiptapTextBlock":
                    _apply_tiptap_text_color(slide, c.get("id"), color_to_apply)
        # Apply background to all background components
        bg_payload = style.get("background")
        if bg_payload is not None:
            for bc in (slide.get("components", []) or []):
                if bc.get("type") == "Background" or (isinstance(bc.get("props"), dict) and bc["props"].get("kind") == "background"):
                    bprops = bc.setdefault("props", {})
                    btype = (bg_payload or {}).get("type")
                    if btype == "solid":
                        color = bg_payload.get("color") or bg_payload.get("backgroundColor")
                        if color:
                            bprops["backgroundType"] = "color"
                            bprops["backgroundColor"] = color
                            if "gradient" in bprops:
                                try:
                                    del bprops["gradient"]
                                except Exception:
                                    pass
                    elif btype == "gradient":
                        bprops["backgroundType"] = "gradient"
                        grad_src = bg_payload.get("gradient") if isinstance(bg_payload.get("gradient"), dict) else bg_payload
                        bprops["gradient"] = _normalize_gradient_payload(grad_src)
                        if "backgroundColor" in bprops:
                            try:
                                del bprops["backgroundColor"]
                            except Exception:
                                pass
    return True


def _apply_replace_text(slide: Dict[str, Any], component_id: str, text: str) -> bool:
    comp = _find_component(slide, component_id)
    if not comp:
        return False
    props = comp.setdefault("props", {})
    props["text"] = text
    return True

def _apply_tiptap_text_color_in_doc(doc: Dict[str, Any], color: str) -> None:
    if not isinstance(doc, dict):
        return
    content = doc.get("content")
    if isinstance(content, list):
        for node in content:
            # Recurse into child nodes
            _apply_tiptap_text_color_in_doc(node, color)
    # If this is a text leaf with style dict, set textColor
    if doc.get("type") == "text":
        style = doc.setdefault("style", {}) if isinstance(doc, dict) else {}
        if isinstance(style, dict):
            style["textColor"] = color

def _apply_tiptap_text_color(slide: Dict[str, Any], component_id: str, color: str) -> bool:
    comp = _find_component(slide, component_id)
    if not comp:
        return False
    props = comp.setdefault("props", {})
    # Set top-level convenience in case renderer reads it
    props["textColor"] = color
    texts = props.get("texts")
    if isinstance(texts, dict):
        _apply_tiptap_text_color_in_doc(texts, color)
        return True
    if isinstance(texts, list):
        applied = False
        for node in texts:
            if isinstance(node, dict):
                style = node.setdefault("style", {})
                if isinstance(style, dict):
                    style["textColor"] = color
                    applied = True
        return applied
    return True
def _prune_nones(value):
    if isinstance(value, dict):
        return {k: _prune_nones(v) for k, v in value.items() if v is not None}
    if isinstance(value, list):
        return [_prune_nones(v) for v in value]
    return value

def _deep_merge_dict(target: Dict[str, Any], updates: Dict[str, Any]) -> Dict[str, Any]:
    """Deep merge updates into target, pruning None values.

    Use explicit assignment on `target` for keys that need to be cleared (set to None)
    BEFORE calling this helper.
    """
    if not isinstance(updates, dict):
        return target
    updates = _prune_nones(updates or {})
    for key, value in updates.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            _deep_merge_dict(target[key], value)
        else:
            target[key] = value
    return target



def _apply_move_component(slide: Dict[str, Any], component_id: str, dx: float = 0, dy: float = 0) -> bool:
    comp = _find_component(slide, component_id)
    if not comp:
        return False
    props = comp.setdefault("props", {})
    position = props.setdefault("position", {"x": 960, "y": 540})
    # Apply delta
    new_x = position.get("x", 960) + float(dx)
    new_y = position.get("y", 540) + float(dy)

    # Clamp to canvas bounds using margins; preserve component size if available
    try:
        CANVAS_W, CANVAS_H = 1920, 1080
        MARGIN = 80
        width = float(props.get("width", 0) or 0)
        height = float(props.get("height", 0) or 0)
        # Use top-left semantics: clamp so top-left (x,y) stays within margins and
        # right/bottom edges respect margins given current width/height.
        # Horizontal clamp
        min_x = MARGIN
        max_x = CANVAS_W - (width if width > 0 else 0) - MARGIN
        if max_x < min_x:
            max_x = CANVAS_W - MARGIN
        new_x = max(min_x, min(new_x, max_x))
        # Vertical clamp: prevent bottom overflow
        min_y = MARGIN
        max_y = CANVAS_H - (height if height > 0 else 0) - MARGIN
        if max_y < min_y:
            max_y = CANVAS_H - MARGIN
        new_y = max(min_y, min(new_y, max_y))
    except Exception:
        pass

    position["x"] = new_x
    position["y"] = new_y

    # If this component is part of an icon-text pair, move its partner(s) by the same delta
    try:
        props = comp.get("props", {}) or {}
        meta = props.get("metadata") or {}
        pair_id = meta.get("pairId")
        paired_text_id = meta.get("pairedTextId")
        paired_icon_ids = []
        if isinstance(meta.get("pairedIconIds"), list):
            paired_icon_ids = [pid for pid in meta.get("pairedIconIds") if isinstance(pid, str)]
        # Build an id->component map for quick lookup
        id_to_comp = {c.get("id"): c for c in (slide.get("components", []) or [])}

        def _move_target(target_comp: Dict[str, Any]):
            if not isinstance(target_comp, dict):
                return
            tp = target_comp.setdefault("props", {})
            tpos = tp.setdefault("position", {"x": 960, "y": 540})
            tpos["x"] = float(tpos.get("x", 960)) + float(dx)
            tpos["y"] = float(tpos.get("y", 540)) + float(dy)

        if pair_id:
            # If moving an icon with pairedTextId, move that text
            if paired_text_id and isinstance(paired_text_id, str):
                tcomp = id_to_comp.get(paired_text_id)
                _move_target(tcomp)
            # If moving a text with pairedIconIds, move each icon
            if paired_icon_ids:
                for pid in paired_icon_ids:
                    icomp = id_to_comp.get(pid)
                    _move_target(icomp)
    except Exception:
        pass

    return True


def _apply_align_components(slide: Dict[str, Any], component_ids: List[str], alignment: str) -> bool:
    comps: List[Dict[str, Any]] = []
    for cid in component_ids:
        comp = _find_component(slide, cid)
        if comp:
            comps.append(comp)
    if len(comps) < 2:
        return False

    # Compute target depending on alignment (simple heuristic)
    if alignment == "center":
        # Force align to canvas center X=960 for deterministic behavior
        target_x = 960
        for c in comps:
            pos = c.setdefault("props", {}).setdefault("position", {"x": 960, "y": 540})
            pos["x"] = target_x
        return True

    # Additional alignments can be added as needed
    return False


async def apply_fast_operations(deck_id: str, operations: List[Dict[str, Any]], user_id: Optional[str] = None) -> Optional[str]:
    """Apply a list of simple operations directly to deck and persist updated slides.

    Returns the new deck version (revision) if available, otherwise None.
    """
    deck = get_deck(deck_id)
    if not deck:
        return None

    # Group operations by slide_id when provided; otherwise we must locate by component across slides
    # For simplicity we require caller to pass slide context per op when possible.
    changed_slide_ids: set[str] = set()

    # Attempt to infer slide_id per operation by scanning once if missing
    slide_index_map: Dict[str, int] = {}
    id_to_slide_idx: Dict[str, int] = {}
    slides = deck.get("slides", []) or []
    for idx, slide in enumerate(slides):
        sid = slide.get("id")
        if sid:
            slide_index_map[sid] = idx
        for comp in slide.get("components", []) or []:
            cid = comp.get("id")
            if cid:
                id_to_slide_idx[cid] = idx

    for op in operations:
        op_type = op.get("op")
        slide_id = op.get("slideId")
        component_id = op.get("componentId")
        slide: Optional[Dict[str, Any]] = None
        sidx: Optional[int] = None

        if slide_id and slide_id in slide_index_map:
            sidx = slide_index_map[slide_id]
            slide = slides[sidx]
        elif component_id and component_id in id_to_slide_idx:
            sidx = id_to_slide_idx[component_id]
            slide = slides[sidx]
        elif op_type == "align_components":
            # Derive slide from the first component in the list
            comp_ids = op.get("componentIds", []) or []
            if comp_ids:
                first = comp_ids[0]
                sidx = id_to_slide_idx.get(first)
                if sidx is not None:
                    slide = slides[sidx]

        if slide is None or sidx is None:
            continue

        applied = False
        if op_type == "update_component_style":
            applied = _apply_update_component_style(slide, component_id, op.get("style", {}))
        elif op_type == "replace_text":
            applied = _apply_replace_text(slide, component_id, op.get("text", ""))
        elif op_type == "move_component":
            applied = _apply_move_component(slide, component_id, op.get("x", 0), op.get("y", 0))
        elif op_type == "align_components":
            applied = _apply_align_components(slide, op.get("componentIds", []), op.get("alignment", "center"))
        elif op_type == "update_chart":
            # Chart-specific simple updates (e.g., barColor)
            comp = _find_component(slide, component_id)
            if comp and comp.get("type") == "Chart":
                cprops = comp.setdefault("props", {})
                chart_style = op.get("style", {}) or {}
                # Accept barColor/lineColor/palette
                if "barColor" in chart_style:
                    cprops["barColor"] = chart_style.get("barColor")
                if "lineColor" in chart_style:
                    cprops["lineColor"] = chart_style.get("lineColor")
                if "palette" in chart_style:
                    cprops["palette"] = chart_style.get("palette")
                applied = True
        elif op_type == "update_component_style":
            # Map Icon style.color to props.color for native Icon component
            comp = _find_component(slide, component_id)
            if comp and comp.get("type") == "Icon":
                cprops = comp.setdefault("props", {})
                style = op.get("style", {}) or {}
                icon_color = None
                if isinstance(style, dict):
                    icon_color = style.get("color") or style.get("textColor")
                    bg = style.get("background") if isinstance(style.get("background"), dict) else None
                    if bg and (not icon_color):
                        icon_color = bg.get("color") or bg.get("backgroundColor")
                if icon_color:
                    cprops["color"] = icon_color
                    applied = True

        if applied:
            # Debug logging of applied changes for diagnostics
            try:
                import logging as _logging
                _logging.getLogger(__name__).info(
                    "[FastPath] Applied op=%s on slide=%s component=%s style=%s",
                    op_type,
                    slide.get("id"),
                    component_id,
                    (op.get("style") if isinstance(op, dict) else None),
                )
            except Exception:
                pass
            changed_slide_ids.add(slide.get("id"))

    # Persist changed slides
    if not changed_slide_ids:
        return None

    persistence = DeckPersistence()
    # Apply updates one by one; DeckPersistence will update version/last_modified
    for sid in changed_slide_ids:
        sidx = slide_index_map.get(sid)
        if sidx is None:
            continue
        slide_data = slides[sidx]
        await persistence.update_slide_with_user(deck_id, sidx, slide_data, user_id=user_id, force_immediate=True)

    # Re-fetch deck to get updated version
    updated = get_deck(deck_id)
    return updated.get("version") if updated else None


async def apply_deckdiff(deck_id: str, deck_diff: Dict[str, Any], user_id: Optional[str] = None) -> Optional[str]:
    """Apply our internal DeckDiff schema (slides_to_update/add/remove with component diffs)."""
    deck = get_deck(deck_id)
    if not deck:
        return None

    slides = deck.get("slides", []) or []
    changed_slide_ids: set[str] = set()

    # Remove slides first
    if deck_diff.get("slides_to_remove"):
        # Build map before removals
        slide_index_map_rm: Dict[str, int] = {s.get("id"): idx for idx, s in enumerate(slides) if s.get("id")}
        for sid in deck_diff.get("slides_to_remove", []) or []:
            if sid in slide_index_map_rm:
                idx = slide_index_map_rm[sid]
                slides.pop(idx)
                changed_slide_ids.add(sid)
        # No need to maintain map consistency during removals; we'll rebuild below

    # Add slides
    for slide in deck_diff.get("slides_to_add", []) or []:
        # Ensure slide has components list
        if isinstance(slide, dict) and "components" not in slide:
            slide["components"] = []
        slides.append(slide)
        if isinstance(slide, dict) and slide.get("id"):
            changed_slide_ids.add(slide.get("id"))

    # Rebuild index map AFTER add/remove so updates target correct indices
    slide_index_map: Dict[str, int] = {s.get("id"): idx for idx, s in enumerate(slides) if isinstance(s, dict) and s.get("id")}

    # Update slides (components and slide properties)
    for sd in deck_diff.get("slides_to_update", []) or []:
        sid = sd.get("slide_id")
        if not sid:
            continue
        idx = slide_index_map.get(sid)
        if idx is None:
            # Ignore updates for non-existent slides
            continue
        slide = slides[idx]
        # components_to_remove
        for cid in sd.get("components_to_remove", []) or []:
            comps = slide.get("components", []) or []
            slide["components"] = [c for c in comps if c.get("id") != cid]
        # components_to_add
        for comp in sd.get("components_to_add", []) or []:
            slide.setdefault("components", []).append(comp)
        # components_to_update
        for cdiff in sd.get("components_to_update", []) or []:
            cid = cdiff.get("id")
            comp = _find_component(slide, cid)
            if not comp:
                continue
            props = comp.setdefault("props", {})
            # Special handling: Tiptap text color changes should be applied inside editor doc
            desired_color = None
            new_props = cdiff.get("props") or {}
            # Accept several possible keys
            if isinstance(new_props, dict):
                if isinstance(new_props.get("style"), dict) and "textColor" in new_props.get("style", {}):
                    desired_color = new_props["style"].get("textColor")
                if "textColor" in new_props:
                    desired_color = new_props.get("textColor") or desired_color
            # Background-specific normalization to avoid conflicting fields
            try:
                if (comp.get("type") == "Background") and isinstance(new_props, dict):
                    # If switching to solid color, ensure gradient is explicitly cleared
                    if new_props.get("backgroundType") == "color":
                        # If caller didn't include gradient in diff, add explicit null to clear it
                        if "gradient" not in new_props:
                            new_props["gradient"] = None
                    # If switching to gradient, remove plain color to avoid renderer conflicts
                    if new_props.get("backgroundType") == "gradient":
                        if "backgroundColor" not in new_props:
                            new_props["backgroundColor"] = None
                    # If gradient is explicitly set to None, keep it (do not drop) so DB stores null
            except Exception:
                pass
            if comp.get("type") == "TiptapTextBlock" and desired_color:
                _apply_tiptap_text_color(slide, cid, desired_color)
            # Apply updates with cautious None handling (avoid nuking fields)
            if comp.get("type") == "Background" and isinstance(new_props, dict):
                # Ensure exclusivity based on requested backgroundType
                try:
                    if new_props.get("backgroundType") == "color":
                        # If gradient not present in update, add an explicit clear
                        if "gradient" not in new_props:
                            new_props["gradient"] = None
                    elif new_props.get("backgroundType") == "gradient":
                        if "backgroundColor" not in new_props:
                            new_props["backgroundColor"] = None
                except Exception:
                    pass

                # Explicit clears: set on target before pruning/merge so they persist
                try:
                    if "gradient" in new_props and new_props.get("gradient") is None:
                        props["gradient"] = None
                    if "backgroundColor" in new_props and new_props.get("backgroundColor") is None:
                        props["backgroundColor"] = None
                except Exception:
                    pass

                # Now prune None from updates and deep-merge the rest
                _deep_merge_dict(props, new_props or {})

                # Post-merge enforcement of exclusivity (idempotent)
                try:
                    if props.get("backgroundType") == "color":
                        props["gradient"] = None
                    elif props.get("backgroundType") == "gradient":
                        props["backgroundColor"] = None
                except Exception:
                    pass
            else:
                # Non-background: merge pruned updates normally
                _deep_merge_dict(props, new_props or {})
        # slide_properties
        for k, v in (sd.get("slide_properties") or {}).items():
            slide[k] = v
        changed_slide_ids.add(sid)

    persistence = DeckPersistence()

    # If slides were added or removed, persist the entire deck once (ensures new slides are saved)
    has_adds = bool(deck_diff.get("slides_to_add"))
    has_removes = bool(deck_diff.get("slides_to_remove"))
    if has_adds or has_removes:
        # Save full deck to include structure changes and then return new version
        # Ensure deck object contains our updated slides list
        deck["slides"] = slides
        await persistence.save_deck_with_user(deck_id, deck, user_id=user_id)
        updated = get_deck(deck_id)
        return updated.get("version") if updated else None

    # Otherwise, persist only changed slides
    if not changed_slide_ids:
        return None
    # Recompute index map in case slide list changed during updates
    slide_index_map = {s.get("id"): idx for idx, s in enumerate(slides) if isinstance(s, dict) and s.get("id")}
    for sid in changed_slide_ids:
        idx = slide_index_map.get(sid)
        if idx is None or idx >= len(slides):
            continue
        await persistence.update_slide_with_user(deck_id, idx, slides[idx], user_id=user_id, force_immediate=True)

    updated = get_deck(deck_id)
    return updated.get("version") if updated else None


