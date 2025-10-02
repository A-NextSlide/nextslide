import json

from utils.deck import create_grid_layout, create_overlap_matrix
from utils.numbers import round_numbers
from utils.images import image_exists


def build_deck_digest(deck_data, current_slide_id=None):
    """Produce a lightweight deck digest used for caching/prompting."""

    if not deck_data:
        return {
            "summary_text": "Deck unavailable",
            "slides": [],
            "meta": {"slide_count": 0},
        }

    title = getattr(deck_data, "name", None)
    if title is None and isinstance(deck_data, dict):
        title = deck_data.get("title") or deck_data.get("name")
    title = title or "Untitled Deck"

    if hasattr(deck_data, "slides"):
        slides_iter = list(getattr(deck_data, "slides", []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get("slides", []) or [])
    else:
        slides_iter = []

    slides_meta = []
    for index, slide in enumerate(slides_iter):
        slide_id = getattr(slide, "id", None)
        if slide_id is None and isinstance(slide, dict):
            slide_id = slide.get("id")

        slide_title = getattr(slide, "title", None)
        if slide_title is None and isinstance(slide, dict):
            slide_title = slide.get("title")
        slide_title = slide_title or f"Slide {index + 1}"

        if hasattr(slide, "components"):
            components = list(getattr(slide, "components", []) or [])
        elif isinstance(slide, dict):
            components = list(slide.get("components", []) or [])
        else:
            components = []

        component_types = []
        for comp in components:
            ctype = getattr(comp, "type", None)
            if ctype is None and isinstance(comp, dict):
                ctype = comp.get("type")
            if ctype:
                component_types.append(str(ctype))

        slides_meta.append(
            {
                "id": slide_id,
                "title": slide_title,
                "index": index,
                "componentCount": len(components),
                "componentTypes": component_types[:6],
                "isCurrent": bool(current_slide_id and slide_id == current_slide_id),
            }
        )

    summary_lines = [f"Deck: {title}"]
    summary_lines.append(f"Slides: {len(slides_meta)}")
    for slide in slides_meta[:12]:
        prefix = "*" if slide["isCurrent"] else "-"
        types_preview = ", ".join(slide["componentTypes"]) or "no components"
        summary_lines.append(
            f"{prefix} Slide {slide['index'] + 1}: {slide['title']} "
            f"({slide['componentCount']} components: {types_preview})"
        )

    summary_text = "\n".join(summary_lines)

    return {
        "summary_text": summary_text,
        "slides": slides_meta,
        "meta": {"title": title, "slide_count": len(slides_meta)},
    }

def summarize_chat_history(chat_history):
    chat_history_str = ""
    for message in chat_history:
        # support dict or typed ChatMessage
        role = getattr(message, 'role', None)
        content = getattr(message, 'content', None)
        if role is None and isinstance(message, dict):
            role = message.get('role')
            content = message.get('content')
        chat_history_str += f"""
        {role}: {content}
        """
    return chat_history_str

def summarize_registry(registry):
    output = "Registry Summary:\n"

    for component_type, schema in registry.get_json_schemas().items():
        # THIS IT THE GLOBAL PROPERTY
        output += f"    Component Type: {component_type}\n"
        props = ""
        for prop, prop_schema in schema["schema"]["properties"].items():

            if 'type' in prop_schema:
                props += f"    - {prop}: {prop_schema['type']}\n"
            elif 'anyOf' in prop_schema:
                if "const" in prop_schema['anyOf'][0]:
                    # This is an enum
                    props += f"    - {prop}: {[p['const'] for p in prop_schema['anyOf']]} \n"
                else:
                    # This if a more complex type
                    if 'type' in prop_schema['anyOf'][0]:
                        props += f"    - {prop}: Optional({[p['type'] for p in prop_schema['anyOf']]}) \n"
                    else:
                        # idk
                        props += f"    - {prop}: \n"
                        pass
            else:
                props += f"    - {prop}: {prop_schema['type']}\n"

        output += f"    Properties: \n"
        output += props + "\n"
    return output


def summarize_deck(deck_data, current_slide_id=None):
    """Backward-compatible wrapper that returns a concise summary string."""

    digest = build_deck_digest(deck_data, current_slide_id=current_slide_id)
    summary_text = digest.get("summary_text") or "" 
    slides_meta = digest.get("slides", [])

    deck_summary = {
        "title": digest.get("meta", {}).get("title"),
        "slide_count": digest.get("meta", {}).get("slide_count"),
        "slides": slides_meta,
        "current_slide_id": current_slide_id,
    }

    deck_summary = round_numbers(deck_summary)
    return summary_text or json.dumps(deck_summary)


def get_slide_summary(deck_data, slide_id):
    """
    Get a summary of a slide by its ID.
    
    Args:
        deck_data: The full deck data object
        slide_id: The ID of the slide to summarize
        
    Returns:
        A dictionary containing summary information about the slide:
        - id: Slide ID
        - title: Slide title
        - component_count: Number of components on the slide
        - components: List of component summaries (type, id, position)
        - grid_layout: Grid-based visualization of component positions
        - overlap_matrix: Matrix showing component overlaps
        Or None if the slide is not found
    """
    if not deck_data or not slide_id:
        return None
    
    # Resolve slides for typed/dict
    slides_iter = []
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])

    # Find the slide with the matching ID
    target_slide = None
    for slide in slides_iter:
        sid = getattr(slide, 'id', None)
        if sid is None and isinstance(slide, dict):
            sid = slide.get('id')
        if sid == slide_id:
            target_slide = slide
            break
    
    if not target_slide:
        return None
    
    # Create the summary
    # Resolve components list
    components_iter = []
    if hasattr(target_slide, 'components'):
        components_iter = list(getattr(target_slide, 'components', []) or [])
    elif isinstance(target_slide, dict):
        components_iter = list(target_slide.get('components', []) or [])

    # Resolve slide title
    slide_title = getattr(target_slide, 'title', None)
    if slide_title is None and isinstance(target_slide, dict):
        slide_title = target_slide.get('title', '')

    summary = {
        "id": slide_id,
        "title": slide_title,
        "component_count": len(components_iter),
        "components": [],
        "warnings": []
    }
    
    # Add component summaries
    for component in components_iter:
        cid = getattr(component, 'id', None)
        ctype = getattr(component, 'type', None)
        cprops = getattr(component, 'props', None)
        if cid is None and isinstance(component, dict):
            cid = component.get('id')
            ctype = component.get('type')
            cprops = component.get('props')

        comp_summary = {"id": cid, "type": ctype}

        # Add position if available
        if isinstance(cprops, dict) and "position" in cprops:
            comp_summary["position"] = cprops["position"]

        # Add size if available
        if isinstance(cprops, dict) and "width" in cprops and "height" in cprops:
            comp_summary["width"] = cprops["width"]
            comp_summary["height"] = cprops["height"]

        # Add type-specific properties
        if ctype == "TextBlock" and isinstance(cprops, dict) and "text" in cprops:
            text_val = cprops.get("text", "")
            comp_summary["text_preview"] = (text_val[:50] + "...") if isinstance(text_val, str) and len(text_val) > 50 else text_val

        if ctype == "Image" and isinstance(cprops, dict) and "src" in cprops:
            if not image_exists(cprops["src"]):
                summary["warnings"].append(f"Component {cid} with Image {cprops['src']} does not exist")

        summary["components"].append(comp_summary)
    
    # Add grid layout visualization
    # For layout helpers, expect dict slide structure
    layout_slide = target_slide
    if not isinstance(layout_slide, dict):
        layout_slide = {"components": []}
    summary["grid_layout"] = create_grid_layout(layout_slide)
    
    # Add overlap matrix
    summary["overlap_matrix"] = create_overlap_matrix(layout_slide)
    
    return summary
