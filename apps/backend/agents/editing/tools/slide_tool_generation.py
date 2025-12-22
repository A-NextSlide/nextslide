"""Slide generation and editing tools."""

from typing import Any, Dict, List
import logging
import uuid
from datetime import datetime, timezone

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.config import CUSTOM_COMPONENT_EDIT_MODEL
from agents.editing.tools.async_utils import run_async
from agents.editing.tools.llm_utils import get_model_and_client, invoke_with_fallback
from agents.editing.tools.slide_tool_custom_components import (
    _generate_full_bleed_custom_component,
    _targeted_custom_component_edit,
    custom_component_rewrite,
)
from agents.editing.tools.slide_tool_debug import _dbg
from agents.editing.tools.slide_tool_helpers import (
    _build_attachment_context,
    _build_chat_context,
    _format_components_for_prompt,
    _gather_reference_images,
    _has_image_attachments,
    _build_uploaded_media_from_attachments,
    _build_tagged_media_from_attachments,
)
from agents.editing.tools.slide_tool_models import SlideContent
from agents.editing.tools.slide_tool_multimodal import _build_multimodal_content
from agents.editing.tools.slide_tool_prompts import SLIDE_EDIT_PROMPT, SLIDE_GENERATOR_PROMPT
from agents.editing.tools.struct_utils import get_attr as _get_attr
from agents.generation.image_processing import apply_tagged_media_to_images

logger = logging.getLogger(__name__)


def _current_date_note() -> str:
    """Return a short current-date note for prompt grounding."""
    return f"CURRENT DATE (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"


def edit_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    Edit a slide - AI decides what to change.

    CRITICAL LOGIC:
    1. If slide is empty/blank → GENERATE full content
    2. If slide has CustomComponent → REWRITE the HTML
    3. If slide has standard components → EDIT/REPLACE them

    Args:
        args: { "slide_id": str, "instruction": str }
        chat_history: Full chat history for context (user messages AND assistant responses)
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    instruction = args.get('instruction', '')
    use_attachments = bool(args.get("use_attachments"))
    available_videos = args.get("available_videos")
    if not isinstance(available_videos, list):
        available_videos = None

    components = _get_attr(current_slide, 'components', []) or []

    # Analyze slide state
    non_bg_components = [c for c in components if _get_attr(c, 'type') != 'Background']
    custom_component = next((c for c in components if _get_attr(c, 'type') == 'CustomComponent'), None)
    is_empty = len(non_bg_components) == 0

    instruction_l = (instruction or "").lower()
    rewrite_keywords = [
        # Explicit rewrite requests
        "redesign", "redo", "rebuild", "from scratch", "start over",
        "completely different", "entirely different", "make it totally different",
        "overhaul", "transform",
        "replace the current", "match the image", "like the image", "use the image",
        # Branding changes (always need full rewrite)
        "co-brand", "cobrand", "rebrand", "brand with", "branded with",
        "add their logo", "add the logo", "use their logo",
        # Significant visual changes
        "make it nicer", "make it better", "improve the design",
        "more professional", "more modern", "update the style",
        "change the look", "change the style", "different style",
        "make it look", "make this look",
    ]
    wants_rewrite = (
        any(k in instruction_l for k in rewrite_keywords)
        or ("img_" in instruction_l)
        or (".jpeg" in instruction_l)
        or (".png" in instruction_l)
    )

    logger.info(f"[edit_slide] slide={slide_id}, empty={is_empty}, has_custom={custom_component is not None}")
    _dbg(
        "B",
        "slide_tools.py:edit_slide",
        "branch_decision",
        {
            "slide_id": slide_id,
            "is_empty": is_empty,
            "has_custom": custom_component is not None,
            "wants_rewrite": wants_rewrite,
            "instruction_preview": (instruction or "")[:120],
        },
        runId="pre-fix",
    )

    # FORCE: For explicit redesign/rewrite requests, always produce a full-bleed CustomComponent.
    # This prevents the "NEW SLIDE" placeholder outcome when the slide has only standard components.
    if wants_rewrite and not custom_component:
        deck_diff = DeckDiff(DeckDiffBase())
        # remove non-background components
        for c in non_bg_components:
            cid = _get_attr(c, "id")
            if cid:
                deck_diff.remove_component(slide_id, cid)
        try:
            new_cc = _generate_full_bleed_custom_component(
                slide_id,
                instruction,
                deck_data,
                current_slide,
                attachments,
                use_attachments=use_attachments,
                available_videos=available_videos,
            )
            deck_diff.add_component(slide_id, new_cc)
            _dbg(
                "B",
                "slide_tools.py:edit_slide",
                "forced_full_bleed_custom_component",
                {
                    "slide_id": slide_id,
                    "new_component_id": new_cc.get("id"),
                    "render_len": len(((new_cc.get("props") or {}).get("render")) or ""),
                },
                runId="pre-fix",
            )
            return deck_diff
        except Exception as e:
            _dbg(
                "B",
                "slide_tools.py:edit_slide",
                "forced_full_bleed_custom_component_failed",
                {"slide_id": slide_id, "error": str(e)[:200]},
                runId="pre-fix",
            )
            # fall through to existing behavior as last resort

    # CASE 1: Empty slide → Generate full content
    if is_empty:
        return _generate_slide_content(
            slide_id,
            instruction,
            current_slide,
            attachments,
            use_attachments=use_attachments,
            available_videos=available_videos,
        )

    # CASE 2: Has CustomComponent → Rewrite HTML
    if custom_component:
        # Only do full rewrite if user explicitly asked for redesign/redo/etc.
        if wants_rewrite:
            return custom_component_rewrite(
                args={
                    "slide_id": slide_id,
                    "component_id": _get_attr(custom_component, "id"),
                    "instruction": instruction,
                    "use_attachments": use_attachments,
                    "available_videos": available_videos,
                },
                deck_data=deck_data,
                current_slide=current_slide,
                registry=registry,
                attachments=attachments,
                chat_history=chat_history,
            )
        # Otherwise: targeted edit attempt (Cursor-style) guided by AI to propose 1-3 exact replacements
        return _targeted_custom_component_edit(slide_id, custom_component, instruction, deck_data, attachments)

    # CASE 3: Standard components → Generate new slide content
    return _edit_standard_components(
        slide_id,
        components,
        instruction,
        attachments,
        use_attachments=use_attachments,
    )


def _generate_slide_content(
    slide_id: str,
    instruction: str,
    current_slide: Dict,
    attachments: List[Dict] = None,
    use_attachments: bool = False,
    available_videos: List[Dict] = None,
) -> DeckDiff:
    """Generate content for an empty slide."""
    logger.info(f"[_generate_slide_content] Generating content for empty slide")

    # Get existing background if any
    components = _get_attr(current_slide, 'components', []) or []
    background = next(
        (c for c in components if _get_attr(c, 'type') == 'Background'),
        None
    )

    prompt = f"""{_current_date_note()}

{SLIDE_GENERATOR_PROMPT}

EXISTING BACKGROUND: {_get_attr(background, 'props') if background else 'None - create a dark gradient background'}

USER REQUEST: {instruction}

Generate slide components. The slide is currently EMPTY.
Create visually appealing, professional content that fulfills the request.
Use CustomComponent for complex layouts (cards, grids, timelines, etc.)."""

    if use_attachments and attachments:
        prompt += "\n\nUPLOADS: Use the attached images as actual slide visuals. Prefer Image components that reference the attachment URLs."
    if available_videos:
        video_titles = []
        for video in available_videos[:5]:
            title = video.get("title") or video.get("url") or "video"
            url = video.get("embed_url") or video.get("url")
            if url:
                video_titles.append(f"{title} ({url})")
            else:
                video_titles.append(title)
        if video_titles:
            prompt += "\n\nAVAILABLE VIDEOS: " + "; ".join(video_titles) + ". Use a Video component or embed in a CustomComponent when requested."

    client, model = get_model_and_client("slide_generate", log_prefix="SLIDE_TOOLS")

    # Check if we have image attachments - use multimodal content if so
    has_images = _has_image_attachments(attachments)

    if has_images:
        # Build multimodal content with images for the AI to SEE
        logger.info(f"[_generate_slide_content] 🖼️ Building multimodal content with {len(attachments)} attachments")
        user_content = _build_multimodal_content(prompt, attachments)
        messages = [{"role": "user", "content": user_content}]
    else:
        # Text-only, include attachment URLs in text
        prompt += _build_attachment_context(attachments, "USER ATTACHMENTS (incorporate if relevant):")
        messages = [{"role": "user", "content": prompt}]

    response = invoke_with_fallback(
        client=client,
        model=model,
        messages=messages,
        response_model=SlideContent,
        max_tokens=32000,
        log_prefix="SLIDE_TOOLS",
    )

    components_out = []
    for component in response.components:
        if component.type == 'Background' and background:
            continue
        components_out.append({
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        })

    if use_attachments:
        tagged_media = _build_tagged_media_from_attachments(attachments or [])
        if tagged_media:
            slide_data = {"components": components_out}
            apply_tagged_media_to_images(slide_data, tagged_media)
            components_out = slide_data["components"]

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    for comp_dict in components_out:
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_generate_slide_content] Generated {len(response.components)} components")
    return deck_diff


def _edit_standard_components(
    slide_id: str,
    components: List[Dict],
    instruction: str,
    attachments: List[Dict] = None,
    use_attachments: bool = False,
) -> DeckDiff:
    """Edit standard components or replace with CustomComponent."""
    logger.info(f"[_edit_standard_components] Editing {len(components)} components")

    prompt = f"""{_current_date_note()}

{SLIDE_GENERATOR_PROMPT}

{SLIDE_EDIT_PROMPT.format(
    current_components=_format_components_for_prompt(components),
    instruction=instruction,
)}

Return ALL components for the slide (modified + unchanged).
Consider converting to a CustomComponent if the request requires complex layout."""

    if use_attachments and attachments:
        prompt += "\n\nUPLOADS: Use the attached images as actual slide visuals. Prefer Image components that reference the attachment URLs."

    client, model = get_model_and_client("slide_generate", log_prefix="SLIDE_TOOLS")

    # Check if we have image attachments - use multimodal content if so
    has_images = _has_image_attachments(attachments)

    if has_images:
        # Build multimodal content with images for the AI to SEE
        logger.info(f"[_edit_standard_components] 🖼️ Building multimodal content with {len(attachments)} attachments")
        user_content = _build_multimodal_content(prompt, attachments)
        messages = [{"role": "user", "content": user_content}]
    else:
        # Text-only, include attachment URLs in text
        prompt += _build_attachment_context(attachments, "USER ATTACHMENTS (incorporate if relevant):")
        messages = [{"role": "user", "content": prompt}]

    response = invoke_with_fallback(
        client=client,
        model=model,
        messages=messages,
        response_model=SlideContent,
        max_tokens=32000,
        log_prefix="SLIDE_TOOLS",
    )

    # Build diff - remove old components, add new ones
    deck_diff = DeckDiff(DeckDiffBase())

    # Remove all non-background components
    for c in components:
        if _get_attr(c, 'type') != 'Background':
            deck_diff.remove_component(slide_id, _get_attr(c, 'id'))

    components_out = []
    for component in response.components:
        if component.type == 'Background':
            # Update existing background instead of adding
            bg = next((c for c in components if _get_attr(c, 'type') == 'Background'), None)
            if bg:
                bg_id = _get_attr(bg, 'id')
                bg_diff = ComponentDiffBase(
                    id=bg_id,
                    type="Background",
                    props=component.props
                )
                deck_diff.update_component(slide_id, bg_id, bg_diff)
                continue
        components_out.append({
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        })

    if use_attachments:
        tagged_media = _build_tagged_media_from_attachments(attachments or [])
        if tagged_media:
            slide_data = {"components": components_out}
            apply_tagged_media_to_images(slide_data, tagged_media)
            components_out = slide_data["components"]

    for comp_dict in components_out:
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_edit_standard_components] Generated {len(response.components)} components")
    return deck_diff


def create_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    Create a brand new slide with AI-generated content using CustomComponentGenerator.

    Args:
        args: { "instruction": str, "insert_after": optional str }
        chat_history: Full chat history for context (user messages AND assistant responses)
    """
    from agents.generation.custom_component_generator import CustomComponentGenerator

    instruction = args.get('instruction', '')
    insert_after = args.get('insert_after')
    use_attachments = bool(args.get("use_attachments"))

    # CRITICAL: Default insert_after to current slide so new slides appear after current, not at end
    if not insert_after and current_slide:
        insert_after = _get_attr(current_slide, 'id')
        logger.info(f"[create_slide] Auto-setting insert_after to current slide: {insert_after}")

    logger.info(f"[create_slide] Creating new slide: {instruction[:50]}... (insert_after={insert_after})")

    # Extract theme from deck
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    bg_color = colors.get("primary_background", "#1e1e2e")

    # Gather reference images from attachments
    reference_images = _gather_reference_images("", attachments)
    uploaded_media = _build_uploaded_media_from_attachments(attachments or []) if use_attachments else None

    # Build chat context string for the generator (chronological: oldest first, newest last)
    chat_context, chat_count = _build_chat_context(chat_history, max_messages=10)
    if chat_count:
        logger.info(f"[create_slide] Including {chat_count} chat messages as context (chronological order)")

    # Build attachment context
    att_context = _build_attachment_context(attachments, "USER ATTACHMENTS (incorporate if relevant):")

    # Calculate slide index for context
    slides = (deck_data or {}).get("slides") or []
    slide_index = len(slides)  # New slide will be added at the end (or after insert_after)

    # Build slide context for CustomComponentGenerator
    slide_context = {
        "title": instruction[:80] if instruction else "New Slide",
        "slide_index": slide_index,
        "total_slides": len(slides) + 1,
        "slide_type": "content",
        "is_full_slide": True,
        "background_color": bg_color,
        "presentation_context": (deck_data or {}).get("name") or "",
        "slide_mode": "interactive",  # Default to interactive for new slides
        "chat_history": chat_history,  # Pass full chat history for context
        "use_uploaded_images": use_attachments,
    }

    # Generate using CustomComponentGenerator for high-quality output
    gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
    try:
        instruction_note = ""
        if use_attachments and attachments:
            instruction_note = "\n\nUPLOADS: Use the attached images as real assets in the slide."

        generated = run_async(
            gen.generate(
                content=f"""{_current_date_note()}

CREATE NEW SLIDE: {instruction}{att_context}{chat_context}{instruction_note}

IMPORTANT:
- Create a complete, beautiful slide that fills the entire 1920x1080 canvas.
- Use the conversation context above to understand what the user wants.
- If the user discussed specific preferences (colors, style, interactivity), apply them.
- Make it visually stunning and professional.""",
                theme=theme if isinstance(theme, dict) else {},
                slide_context=slide_context,
                component_purpose="visualize",
                width=1920,
                height=1080,
                position={"x": 0, "y": 0},
                reference_images=reference_images or None,
                uploaded_media=uploaded_media,
            )
        )

        html = ((generated or {}).get("props") or {}).get("render") or ""
        if not html:
            raise ValueError("CustomComponentGenerator returned empty render")

        logger.info(f"[create_slide] Generated CustomComponent with {len(html)} chars HTML")

        # Build the slide with the generated CustomComponent
        slide_id = str(uuid.uuid4())
        slide_title = (instruction or "").strip()
        if not slide_title:
            slide_title = "New Slide"
        if len(slide_title) > 80:
            slide_title = slide_title[:77].rstrip() + "..."

        # Create background component
        background_comp = {
            "id": str(uuid.uuid4()),
            "type": "Background",
            "props": {
                "backgroundType": "solid",
                "backgroundColor": bg_color.lstrip("#") if bg_color.startswith("#") else bg_color
            }
        }

        # Create CustomComponent with the generated HTML
        custom_comp = {
            "id": str(uuid.uuid4()),
            "type": "CustomComponent",
            "props": {
                "render": html,
                "position": {"x": 0, "y": 0},
                "width": 1920,
                "height": 1080
            }
        }

        slide = {
            "id": slide_id,
            "title": slide_title,
            "components": [background_comp, custom_comp]
        }

    except Exception as e:
        logger.warning(f"[create_slide] CustomComponentGenerator failed, falling back to basic generation: {e}")
        # Fallback to the original simple approach
        prompt = f"""{SLIDE_GENERATOR_PROMPT}
{att_context}

USER REQUEST: {instruction}

Generate a complete, beautiful slide. Include:
1. A Background component (dark gradient recommended)
2. Prefer ONE CustomComponent for the entire layout (cards/grids/illustrations/text), so the slide feels cohesive.
   Only add extra components if absolutely necessary.

Make it visually stunning and professional."""

        if use_attachments and attachments:
            prompt += "\n\nUPLOADS: Use the attached images as actual slide visuals. Prefer Image components that reference the attachment URLs."

        client, model = get_model_and_client("slide_generate", log_prefix="SLIDE_TOOLS")

        response = invoke_with_fallback(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_model=SlideContent,
            max_tokens=32000,
            log_prefix="SLIDE_TOOLS",
        )

        slide_id = str(uuid.uuid4())
        slide_title = (instruction or "").strip()
        if not slide_title:
            slide_title = "New Slide"
        if len(slide_title) > 80:
            slide_title = slide_title[:77].rstrip() + "..."

        slide = {
            "id": slide_id,
            "title": slide_title,
            "components": []
        }

        components_out = []
        for component in response.components:
            comp_dict = {
                "id": str(uuid.uuid4()),
                "type": component.type,
                "props": component.props,
            }
            components_out.append(comp_dict)

        if use_attachments:
            tagged_media = _build_tagged_media_from_attachments(attachments or [])
            if tagged_media:
                slide_data = {"components": components_out}
                apply_tagged_media_to_images(slide_data, tagged_media)
                components_out = slide_data["components"]

        slide["components"] = components_out

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(slide)

    # If insert_after provided, set slide_order to position new slide correctly
    if insert_after and deck_data:
        try:
            slides = (deck_data or {}).get("slides") or []
            ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]
            if insert_after in ids:
                idx = ids.index(insert_after) + 1
                ids.insert(idx, slide_id)
                deck_diff.deck_diff.slide_order = ids
                logger.info(f"[create_slide] Set slide_order: new slide at position {idx}")
        except Exception as e:
            logger.warning(f"[create_slide] Failed to set slide_order: {e}")

    logger.info(f"[create_slide] Created slide with {len(slide['components'])} components")
    return deck_diff


def create_slide_variants(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> Dict[str, Any]:
    """
    Create TWO different versions of a new slide for user to choose from.
    Returns a special response with variants instead of a DeckDiff.

    Args:
        args: { "instruction": str, "insert_after": optional str }
    """
    instruction = args.get('instruction', '')
    insert_after = args.get('insert_after')
    use_attachments = bool(args.get("use_attachments"))

    # CRITICAL: Default insert_after to current slide so new slides appear after current, not at end
    if not insert_after and current_slide:
        insert_after = _get_attr(current_slide, 'id')
        logger.info(f"[create_slide_variants] Auto-setting insert_after to current slide: {insert_after}")

    logger.info(
        f"[create_slide_variants] 🎯 CALLED - Creating 2 slide variants: {instruction[:50]}... (insert_after={insert_after})"
    )

    # Build attachment context
    att_context = _build_attachment_context(attachments, "USER ATTACHMENTS (incorporate if relevant):")

    # Extract theme context from deck
    theme_context = ""
    try:
        deck_theme = (deck_data or {}).get("theme") or {}
        if deck_theme:
            colors = deck_theme.get("color_palette") or {}
            bg_color = colors.get("primary_background", "#1e1e2e")
            text_color = colors.get("primary_text", "#ffffff")
            accent_colors = colors.get("colors", [])
            typography = deck_theme.get("typography") or {}
            title_font = typography.get("hero_title", {}).get("family", "Inter")
            body_font = typography.get("body_text", {}).get("family", "Inter")
            theme_context = f"""
DECK THEME (use these colors/fonts):
- Background: {bg_color}
- Text: {text_color}
- Accent colors: {', '.join(accent_colors[:3]) if accent_colors else 'blue, purple, green'}
- Title font: {title_font}
- Body font: {body_font}
"""
    except Exception:
        pass

    client, model = get_model_and_client("slide_generate", log_prefix="SLIDE_TOOLS")

    # Generate two different variants
    variants = []

    for variant_num in [1, 2]:
        style_hint = "clean and minimal" if variant_num == 1 else "bold and dynamic"
        prompt = f"""{SLIDE_GENERATOR_PROMPT}
{att_context}
{theme_context}

USER REQUEST: {instruction}

STYLE: Create a {style_hint} version.

Generate a complete, beautiful slide. Include:
1. A Background component (use theme colors if provided)
2. Prefer ONE CustomComponent for the entire layout
3. Make it visually stunning and professional
4. {"Use clean lines, whitespace, and subtle styling" if variant_num == 1 else "Use bold typography, strong colors, and dynamic composition"}
"""
        if use_attachments and attachments:
            prompt += "\nUPLOADS: Use the attached images as actual slide visuals."

        try:
            response = invoke_with_fallback(
                client=client,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_model=SlideContent,
                max_tokens=32000,
                log_prefix="SLIDE_TOOLS",
            )

            # Build slide
            slide_id = str(uuid.uuid4())
            slide_title = (instruction or "").strip()
            if not slide_title:
                slide_title = "New Slide"
            if len(slide_title) > 80:
                slide_title = slide_title[:77].rstrip() + "..."

            slide = {
                "id": slide_id,
                "title": slide_title,
                "components": [],
                "variant_style": style_hint
            }

            components_out = []
            for component in response.components:
                comp_dict = {
                    "id": str(uuid.uuid4()),
                    "type": component.type,
                    "props": component.props,
                }
                components_out.append(comp_dict)

            if use_attachments:
                tagged_media = _build_tagged_media_from_attachments(attachments or [])
                if tagged_media:
                    slide_data = {"components": components_out}
                    apply_tagged_media_to_images(slide_data, tagged_media)
                    components_out = slide_data["components"]

            slide["components"] = components_out

            variants.append({
                "slide": slide,
                "label": f"Option {variant_num}: {style_hint.title()}",
                "style": style_hint
            })

            logger.info(
                f"[create_slide_variants] Created variant {variant_num} with {len(slide['components'])} components"
            )
        except Exception as e:
            logger.warning(f"[create_slide_variants] Failed to create variant {variant_num}: {e}")
            continue

    if not variants:
        raise ValueError("Failed to create any slide variants")

    logger.info(f"[create_slide_variants] ✅ Returning {len(variants)} variants to orchestrator")
    return {
        "type": "slide_variants",
        "variants": variants,
        "instruction": instruction,
        "insert_after": insert_after
    }
