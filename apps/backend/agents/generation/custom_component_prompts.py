"""Prompt helpers for CustomComponent generation."""

from typing import Dict, Any, Optional, List
import json

from agents.generation.custom_component_helpers import _extract_fonts_from_typography


def build_system_prompt(
    colors: Dict[str, str],
    typography: Dict[str, str],
    design_philosophy: str = "",
    logo_url: Optional[str] = None,
    slide_mode: str = "interactive",
) -> str:
    """Build the system prompt for CustomComponent generation."""
    design_guidance = design_philosophy or (
        "Create visually compelling, professional slides appropriate for the content and audience."
    )

    accent = colors.get("accent_1") or colors.get("accent_2")
    secondary = colors.get("accent_2") or colors.get("accent_1")
    text_color = colors.get("primary_text")
    bg_color = colors.get("primary_background")
    has_palette = bool(accent and text_color and bg_color)
    hero_font, body_font = _extract_fonts_from_typography(typography)

    logo_line = (
        "LOGO: Available at props.logoUrl - place small (max 48px height) in a corner, never center or dominate."
        if logo_url
        else "LOGO: If props.logoUrl is provided, place small (max 48px height) in a corner, never center or dominate."
    )

    if has_palette:
        theme_info = (
            "THEME: --accent: {accent}; --secondary: {secondary}; --text: {text}; --bg: {bg}\n"
            "FONTS (MUST USE): Title/Hero font: '{hero}', sans-serif | Body font: '{body}', sans-serif\n"
            "  - ALWAYS apply: h1,h2,h3,.title {{ font-family: '{hero}', sans-serif; }}\n"
            "  - ALWAYS apply: p,.body-text {{ font-family: '{body}', sans-serif; }}\n"
            "COLOR USE: Only use the palette values above (plus white/black for legibility).\n"
            "IMAGES: Use <img src=\"placeholder\" alt=\"SPECIFIC DESCRIPTIVE SEARCH QUERY\">.\n"
            "  - ALT TEXT MUST describe exactly what you want shown (e.g., \"Tesla Model S electric car\" not \"car image\")\n"
            "  - Include proper nouns, brands, specific objects (e.g., \"Apple iPhone 15 Pro\" not \"smartphone\")\n"
            "  - Add visual context: \"aerial view of Manhattan skyline at sunset\" not \"city\"\n"
            "  - For people/professions: \"female doctor with stethoscope in hospital\" not \"healthcare professional\"\n"
            "  - NEVER use generic terms like \"image\", \"photo\", \"picture\", \"illustration\" in alt text\n"
            "  - MULTIPLE IMAGES: Each image MUST have a UNIQUE alt text - never duplicate alt texts\n"
            "  - IMAGE SIZING: Always use object-fit:cover or object-fit:contain to prevent overflow\n"
            f"{logo_line}"
        ).format(
            accent=accent,
            secondary=secondary,
            text=text_color,
            bg=bg_color,
            hero=hero_font,
            body=body_font,
        )
    else:
        theme_info = (
            "THEME: No fixed palette provided. Choose a cohesive palette and define "
            "--accent, --secondary, --text, --bg. Use them consistently.\n"
            "FONTS (MUST USE): Title/Hero font: '{hero}', sans-serif | Body font: '{body}', sans-serif\n"
            "  - ALWAYS apply: h1,h2,h3,.title {{ font-family: '{hero}', sans-serif; }}\n"
            "  - ALWAYS apply: p,.body-text {{ font-family: '{body}', sans-serif; }}\n"
            "IMAGES: Use <img src=\"placeholder\" alt=\"SPECIFIC DESCRIPTIVE SEARCH QUERY\">.\n"
            "  - ALT TEXT MUST describe exactly what you want shown (e.g., \"Tesla Model S electric car\" not \"car image\")\n"
            "  - Include proper nouns, brands, specific objects (e.g., \"Apple iPhone 15 Pro\" not \"smartphone\")\n"
            "  - Add visual context: \"aerial view of Manhattan skyline at sunset\" not \"city\"\n"
            "  - For people/professions: \"female doctor with stethoscope in hospital\" not \"healthcare professional\"\n"
            "  - NEVER use generic terms like \"image\", \"photo\", \"picture\", \"illustration\" in alt text\n"
            "  - MULTIPLE IMAGES: Each image MUST have a UNIQUE alt text - never duplicate alt texts\n"
            "  - IMAGE SIZING: Always use object-fit:cover or object-fit:contain to prevent overflow\n"
            f"{logo_line}"
        ).format(
            hero=hero_font,
            body=body_font,
        )

    if slide_mode == "static":
        return (
            "You create premium, still presentation slides like Keynote or consulting decks.\n"
            "TRADITIONAL MODE: no interactivity or scripts.\n\n"
            f"{theme_info}\n\n"
            "DESIGN PRINCIPLES:\n"
            "- Bold, precise typography; clear hierarchy\n"
            "- Generous whitespace; balanced composition\n"
            "- Bespoke visuals/diagrams that explain the idea\n"
            "- Everything visible without interaction; show final values\n\n"
            "LAYOUT & CANVAS:\n"
            "- Fill the 1920x1080 canvas; no max-width containers\n"
            "- Set html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; }\n"
            "- No implicit body margin/padding; use explicit layout containers for spacing\n"
            "- ALL content must fit within bounds - nothing cut off or extending below 1080px\n\n"
            "ELEMENT POSITIONS (use these when the element appears for cross-slide consistency):\n"
            "- Title: top-left (x:80px, y:50px), 48-56px font\n"
            "- Logo: bottom-left (x:60px, y:1020px), max 40px height\n"
            "- Source/footnote: bottom-right (right-aligned to x:1860px, y:1050px), 12px muted\n\n"
            "LAYERING:\n"
            "- Background/decorative: z-index 1-10\n"
            "- Media: 20-30\n"
            "- Cards/containers: 40-50\n"
            "- Titles/headings: 100+\n\n"
            "MOTION:\n"
            "- Subtle entrance only if it helps (fade/slide, short durations)\n"
            "- Entrance animations must keep elements within 1920x1080 bounds\n"
            "- No hover/click behavior, counters, or looping animations\n\n"
            "CRITICAL CSS RULES (MUST FOLLOW):\n"
            "- NEVER use `user-select: none` on universal selectors (*) - it completely breaks text selection\n"
            "- ALL content containers must have `overflow: hidden` to prevent content escaping bounds\n\n"
            "IMAGE RULES:\n"
            "- ALWAYS use object-fit:cover or object-fit:contain on images to prevent overflow\n"
            "- Set explicit width/height on image containers, not just the img tag\n\n"
            "OUTPUT: Complete HTML/CSS starting with <!DOCTYPE html>"
        )

    return (
        f"You are a professional slide designer. {design_guidance}\n\n"
        f"{theme_info}\n\n"
        "DESIGN PRINCIPLES:\n"
        "- Bold, creative visuals/diagrams that explain the idea\n"
        "- Clear hierarchy and strong composition\n"
        "- Fill the full canvas; keep content inside bounds\n"
        "- Maps: Use D3.js + TopoJSON (cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json for world, us-atlas for US). Style all land/water/borders with theme colors - never use external map tiles.\n\n"
        "INTERACTION (use when appropriate):\n"
        "- Animated diagrams that build on click\n"
        "- Interactive timelines or step-throughs\n"
        "- Hover-to-reveal cards or accordions\n"
        "- Counters, SVG draw animations\n\n"
        "HOVER/SCALE RULES (critical - prevents shaking/flickering):\n"
        "- NEVER use hover effects on items in a grid/list that could trigger neighbor re-layout\n"
        "- Keep scale values tiny (1.01-1.03 max) - larger causes flickering\n"
        "- Use transform: scale() with transition: transform 0.2s, NOT transition: all\n"
        "- Add generous gap (20px+) between hoverable items\n"
        "- Parent containers MUST use overflow: visible when children scale\n"
        "- If hover causes shaking, REMOVE the hover effect entirely\n\n"
        "CHART RULES (Chart.js, D3, ApexCharts):\n"
        "- Give charts FIXED dimensions in pixels, never % or flex-grow\n"
        "- Wrap in a fixed-size container to prevent infinite growth\n"
        "- Always include CDN script tags BEFORE your code\n"
        "- Wrap initialization in DOMContentLoaded or place script at end of body\n"
        "- Chart.js needs <canvas> with explicit width/height attributes\n"
        "- D3 needs <svg> with explicit width/height attributes\n\n"
        "BUTTON RULES:\n"
        "- Every <button> MUST have a working onclick handler with actual JS logic\n"
        "- NEVER use <a href=\"#\"> or navigation links - they break the iframe\n"
        "- Tab/category buttons: hide ALL content panels first, then show the selected one\n\n"
        "SLIDER/RANGE INPUT RULES:\n"
        "- Use <input type=\"range\"> with oninput handler, NOT custom drag implementations\n"
        "- Always set min, max, value attributes explicitly\n"
        "- Handler must update visible UI: oninput=\"document.getElementById('output').textContent = this.value\"\n"
        "- For before/after image sliders, use a proven CSS clip-path approach with fixed positioning\n\n"
        "LAYOUT RULES (CRITICAL - prevents content spill):\n"
        "- Set html, body { margin:0; padding:0; width:1920px; height:1080px; overflow:hidden; }\n"
        "- Use FIXED pixel dimensions, not percentages or vh/vw units\n"
        "- Root container: position:relative; width:1920px; height:1080px; overflow:hidden;\n"
        "- ALL child elements must fit within 1920x1080 - calculate positions to ensure nothing exceeds bounds\n"
        "- For expandable content (accordions): max-height:200px with overflow:hidden, NOT max-height:9999px\n"
        "- Flexbox/grid: always set explicit max-width/max-height to prevent growth\n"
        "- Pick 1-2 interactions max; must support the story\n"
        "- Titles always on top; avoid website chrome/navigation\n\n"
        "CRITICAL CSS RULES (MUST FOLLOW):\n"
        "- NEVER use `user-select: none` on universal selectors (*) - it completely breaks text selection\n"
        "- ALL expandable/accordion panels MUST have `overflow: hidden` on BOTH the panel container AND the content-overlay/description wrapper to prevent content escaping bounds\n"
        "- For JS data arrays (sections, cards, tabs with different content): EVERY image src must be a REAL image URL - NEVER use literal string 'placeholder' as the src value in JavaScript. Use the actual image URLs from the available images, or use <img src=\"placeholder\" alt=\"...\"> in HTML only (the system replaces these)\n\n"
        "IMAGE RULES:\n"
        "- ALWAYS use object-fit:cover or object-fit:contain on images to prevent overflow\n"
        "- Set explicit width/height on image containers, not just the img tag\n"
        "- For JS arrays with images: each item MUST have a UNIQUE alt/title - never reuse the same description\n"
        "- In JavaScript data arrays, NEVER set imgSrc to 'placeholder' - either use a real URL or omit the image\n\n"
        "LAYERING:\n"
        "- Background 1-10; media 20-30; cards 40-50; titles 100+; overlays 200+\n\n"
        "OUTPUT: Complete interactive HTML/CSS/JS starting with <!DOCTYPE html>"
    )


def _format_extracted_data_for_prompt(extracted_data: Dict[str, Any]) -> str:
    """Format extractedData payload for prompt readability."""
    if not isinstance(extracted_data, dict):
        return ""

    data = extracted_data.get("data") or []
    data_preview = data
    truncated = False
    if isinstance(data, list) and len(data) > 12:
        data_preview = data[:12]
        truncated = True

    payload = {
        "chartType": extracted_data.get("chartType") or extracted_data.get("chart_type"),
        "title": extracted_data.get("title"),
        "data": data_preview,
    }
    metadata = extracted_data.get("metadata")
    if metadata:
        payload["metadata"] = metadata

    text = json.dumps(payload, ensure_ascii=True, indent=2)
    if truncated:
        text += "\n... data truncated after 12 points"
    return text


def _format_manual_charts_for_prompt(manual_charts: List[Any]) -> str:
    """Format manualCharts payload for prompt readability."""
    if not isinstance(manual_charts, list):
        return ""

    blocks = []
    for idx, chart in enumerate(manual_charts[:3]):
        chart_dict = chart.model_dump() if hasattr(chart, "model_dump") else chart
        if not isinstance(chart_dict, dict):
            continue
        data = chart_dict.get("data") or []
        data_preview = data
        truncated = False
        if isinstance(data, list) and len(data) > 12:
            data_preview = data[:12]
            truncated = True
        payload = {
            "id": chart_dict.get("id"),
            "chartType": chart_dict.get("chartType"),
            "title": chart_dict.get("title"),
            "data": data_preview,
        }
        text = json.dumps(payload, ensure_ascii=True, indent=2)
        if truncated:
            text += "\n... data truncated after 12 points"
        blocks.append(f"Chart {idx + 1}:\n{text}")
    return "\n\n".join(blocks)


def _truncate_text(text: str, max_chars: int) -> str:
    if not text:
        return ""
    if len(text) <= max_chars:
        return text
    return text[:max_chars] + " [TRUNCATED]"


def _format_conversation_history(history: Dict[str, Any]) -> str:
    """Format conversation history for prompt readability."""
    if not isinstance(history, dict):
        return ""
    trimmed: Dict[str, Any] = {}

    initial_request = history.get("initial_request")
    if isinstance(initial_request, str) and initial_request.strip():
        trimmed["initial_request"] = _truncate_text(initial_request.strip(), 800)

    messages = history.get("messages")
    if isinstance(messages, list):
        trimmed_messages: List[Dict[str, Any]] = []
        for msg in messages[-6:]:
            if not isinstance(msg, dict):
                continue
            content = msg.get("content")
            if content is None:
                continue
            trimmed_messages.append({
                "role": msg.get("role"),
                "content": _truncate_text(str(content), 800),
            })
        if trimmed_messages:
            trimmed["messages"] = trimmed_messages

    context = history.get("context")
    if isinstance(context, dict):
        trimmed_context: Dict[str, Any] = {}
        reference_sources = context.get("reference_sources")
        if isinstance(reference_sources, list) and reference_sources:
            trimmed_context["reference_sources"] = reference_sources[:5]
        citations = context.get("research_citations")
        if isinstance(citations, list) and citations:
            trimmed_context["research_citations"] = [str(c) for c in citations[:5] if c]
        if trimmed_context:
            trimmed["context"] = trimmed_context

    if not trimmed:
        return ""
    return json.dumps(trimmed, ensure_ascii=True, indent=2)


def build_user_prompt(
    *,
    content: str,
    slide_context: Dict[str, Any],
    width: int,
    height: int,
    component_purpose: str = "visualize",
    external_media: Optional[Dict[str, Any]] = None,
    uploaded_media: Optional[list] = None,
    prefetched_images: Optional[Dict[str, str]] = None,
    reference_images: Optional[List[str]] = None,
    logo_url: Optional[str] = None,
    available_videos: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Build a minimal user prompt with relevant context."""
    slide_title = slide_context.get("title", "Slide")
    slide_index = slide_context.get("slide_index", 0) + 1
    total_slides = slide_context.get("total_slides", 1)
    is_full_slide = slide_context.get("is_full_slide", False)
    slide_mode = slide_context.get("slide_mode")

    sections: List[str] = [
        f'SLIDE: "{slide_title}" (Slide {slide_index} of {total_slides})',
        f"SIZE: {width}x{height}px",
    ]
    if component_purpose:
        sections.append(f"PURPOSE: {component_purpose}")
    if is_full_slide:
        sections.append("FULL SLIDE: You control the entire canvas.")
        sections.append("LAYOUT: Fill the 1920x1080 canvas. Content must fit without scrolling - nothing cut off at bottom.")
        sections.append("TYPE SCALE: Title 48-56px, body 14-18px unless content demands otherwise.")
    if slide_mode:
        sections.append(f"MOTION: {slide_mode}")

    presentation_context = slide_context.get("presentation_context")
    vibe_context = slide_context.get("vibe_context") or slide_context.get("initial_idea")
    deck_title = slide_context.get("deck_title")
    context_parts = [p for p in [presentation_context, vibe_context, deck_title] if p]
    if context_parts:
        sections.append("CONTEXT: " + " | ".join(context_parts))

    extracted_data = slide_context.get("extracted_data") or slide_context.get("extractedData")
    manual_charts = slide_context.get("manual_charts") or slide_context.get("manualCharts")
    if manual_charts:
        formatted_manual = _format_manual_charts_for_prompt(manual_charts)
        if formatted_manual:
            sections.append("MANUAL DATA:")
            sections.append(formatted_manual)
    if extracted_data:
        formatted_extracted = _format_extracted_data_for_prompt(extracted_data)
        if formatted_extracted:
            sections.append("EXTRACTED DATA:")
            sections.append(formatted_extracted)
    if manual_charts or extracted_data:
        sections.append("DATA USE: Use what helps; omit the rest.")

    if reference_images:
        sections.append(
            "DESIGN REFERENCES: Match their layout, typography, and visual tone closely (slides, not webpages)."
        )
        refs = "\n".join(f"- {url}" for url in reference_images[:5])
        sections.append("REFERENCE IMAGES (style only):")
        sections.append(refs)

    if external_media:
        media_list = []
        gifs = external_media.get("gifs") or []
        images = external_media.get("images") or []
        if gifs:
            media_list.append("GIFs: " + ", ".join(gifs[:5]))
        if images:
            media_list.append("Images: " + ", ".join(images[:5]))
        if media_list:
            sections.append("EXTERNAL MEDIA:")
            sections.append("\n".join(media_list))

    if uploaded_media:
        filenames = [
            m.get("filename") or m.get("name")
            for m in uploaded_media
            if isinstance(m, dict)
        ]
        filenames = [n for n in filenames if n]
        if filenames:
            sections.append("USER UPLOADS:")
            sections.append("- " + ", ".join(filenames[:8]))
            if slide_context.get("use_uploaded_images"):
                sections.append(
                    "UPLOADS POLICY: Use the uploaded images as real assets. "
                    "Add <img src=\"placeholder\" alt=\"...\"> elements so the system can apply them."
                )

    if prefetched_images:
        image_props = {
            k: v for k, v in prefetched_images.items() if not k.endswith("_query")
        }
        if image_props:
            entries = [f"{k}: {v}" for k, v in sorted(image_props.items())]
            sections.append("AVAILABLE IMAGES:")
            sections.append("\n".join(entries[:6]))

    if available_videos:
        entries = []
        for video in available_videos[:5]:
            title = video.get("title") or "video"
            url = video.get("embed_url") or video.get("url")
            if url:
                entries.append(f"{title} ({url})")
            else:
                entries.append(str(title))
        if entries:
            sections.append("AVAILABLE VIDEOS:")
            sections.append("- " + ", ".join(entries))
            if slide_context.get("has_assigned_video"):
                sections.append(
                    "VIDEO USE: A video has been assigned to this slide. Embed the first available video. "
                    "Prefer embed_url for YouTube/Vimeo; otherwise use <video src='...'> with muted autoplay loop "
                    "for background and controls for demos."
                )
            else:
                sections.append(
                    "VIDEO USE: If the request calls for a video, embed the first available video. "
                    "Prefer embed_url for YouTube/Vimeo; otherwise use <video src='...'> with muted autoplay loop "
                    "for background and controls for demos."
                )

    # Skip base64 data URLs - they're too large for prompts (can be 50K+ chars)
    if logo_url and not logo_url.startswith("data:"):
        sections.append(f"LOGO URL: {logo_url}")

    conversation_history = slide_context.get("conversation_history")
    formatted_history = _format_conversation_history(conversation_history)
    if formatted_history:
        sections.append("CONVERSATION HISTORY (use explicit customization requests):")
        sections.append(formatted_history)

    if content:
        sections.append("NOTE: Ignore any webpage boilerplate in the content (nav, headers, terms).")
        sections.append("CONTENT:")
        sections.append(content)

    sections.append("OUTPUT: Complete HTML starting with <!DOCTYPE html>.")
    return "\n".join(sections)
