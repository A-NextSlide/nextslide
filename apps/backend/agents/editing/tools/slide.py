from typing import Literal, Union, List, Dict, Any, Optional
import asyncio
from pydantic import Field, create_model
from models.tools import ToolModel
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff, DeckDiffBase
import json

from agents.prompts.editing.editor_notes import get_editor_notes
from agents.ai.clients import get_client, invoke
from agents.editing.tools.component import get_edit_component_model, edit_component
from utils.deck import find_current_slide, get_all_component_ids, get_all_slide_ids
from utils.summaries import get_slide_summary

from agents.prompts.editing.layout_guidelines import layout_guidelines as default_layout_guidelines
from agents.prompts.editing.style_guidelines import style_guidelines as default_style_guidelines
# NOTE: Avoid heavy template/embedding lookups for styling; keep prompt concise and fast

from agents.config import SLIDE_STYLE_MODEL
from concurrent.futures import ThreadPoolExecutor
from agents.rag.slide_context_retriever import SlideContextRetriever
from models.requests import SlideOutline as OutlineSlide, DeckOutline as OutlineDeck

class StyleSlideArgs(ToolModel):
    tool_name: Literal["style_slide"] = Field(description="Tool to style the slide according to the style and layout guidelines. No new components will be created, only existing ones will be styled.")
    slide_id: str = Field(description="The id of the slide to style")

def style_slide(slide_style_args: StyleSlideArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    editor_notes = get_editor_notes((1920, 1080))
    
    # Extract optional theme/style context from deck (persisted by generation)
    def _extract_theme_context(deck: DeckBase) -> Optional[str]:
        try:
            theme: Optional[Dict[str, Any]] = None
            style_spec: Optional[Dict[str, Any]] = None
            # Handle typed or dict-like deck
            if hasattr(deck, 'theme'):
                theme = getattr(deck, 'theme')
            if hasattr(deck, 'style_spec'):
                style_spec = getattr(deck, 'style_spec')
            if theme is None and isinstance(deck, dict):
                theme = deck.get('theme') or (deck.get('data', {}) or {}).get('theme')
            if style_spec is None and isinstance(deck, dict):
                style_spec = deck.get('style_spec') or (deck.get('data', {}) or {}).get('style_spec')

            if not isinstance(theme, dict) and theme is not None:
                # Try to coerce pydantic-like to dict
                try:
                    theme = theme.model_dump()
                except Exception:
                    theme = None
            if not isinstance(style_spec, dict) and style_spec is not None:
                try:
                    style_spec = style_spec.model_dump()
                except Exception:
                    style_spec = None

            if not theme and not style_spec:
                return None

            # Build a compact theme context to keep tokens small
            summary: Dict[str, Any] = {}
            if isinstance(theme, dict):
                palette = (theme.get('color_palette') or {}) if isinstance(theme.get('color_palette'), dict) else {}
                typography = (theme.get('typography') or {}) if isinstance(theme.get('typography'), dict) else {}
                visual_style = (theme.get('visual_style') or {}) if isinstance(theme.get('visual_style'), dict) else {}
                summary['theme'] = {
                    'theme_name': theme.get('theme_name'),
                    'color_palette': {
                        k: palette.get(k) for k in [
                            'primary_background', 'secondary_background',
                            'primary_text', 'secondary_text',
                            'accent_1', 'accent_2', 'accent_3',
                            'background_gradient'
                        ] if k in palette
                    },
                    'typography': {
                        'hero_title': (typography.get('hero_title') or {}).get('family'),
                        'section_title': (typography.get('section_title') or {}).get('family'),
                        'body_text': (typography.get('body_text') or {}).get('family')
                    },
                    'visual_style': {
                        k: visual_style.get(k) for k in [
                            'background_style', 'gradient_type', 'image_effects'
                        ] if k in visual_style
                    }
                }
            if isinstance(style_spec, dict):
                # Include only high-value keys
                summary['style_spec'] = {
                    k: style_spec.get(k) for k in [
                        'design_approach', 'color_palette', 'typography', 'spacing'
                    ] if k in style_spec
                }
            # Pretty but compact JSON
            return json.dumps(summary, ensure_ascii=False, indent=2)
        except Exception:
            return None

    theme_context = _extract_theme_context(deck_data)

    # Build raw theme dict and palette for RAG (used by generation)
    def _get_theme_dict(deck: DeckBase) -> Dict[str, Any]:
        try:
            theme: Optional[Dict[str, Any]] = None
            if hasattr(deck, 'theme'):
                theme = getattr(deck, 'theme')
            if theme is None and isinstance(deck, dict):
                theme = deck.get('theme') or (deck.get('data', {}) or {}).get('theme')
            if theme is not None and not isinstance(theme, dict):
                try:
                    theme = theme.model_dump()
                except Exception:
                    theme = None
            return theme or {}
        except Exception:
            return {}

    def _get_palette_from_theme(theme: Dict[str, Any]) -> Dict[str, Any]:
        try:
            palette = theme.get('color_palette') if isinstance(theme, dict) else None
            if not isinstance(palette, dict):
                return {}
            colors: List[str] = []
            for key, value in palette.items():
                if isinstance(value, str) and value.startswith('#'):
                    colors.append(value)
                elif isinstance(value, dict):
                    # e.g., gradient object
                    pass
            primary = palette.get('accent_1') or palette.get('primary_text') or palette.get('secondary_text')
            return {
                'colors': colors,
                'primary': primary
            }
        except Exception:
            return {}

    # Get slide data
    slide_summary = get_slide_summary(deck_data, slide_style_args.slide_id)
    slide_data = find_current_slide(deck_data, slide_style_args.slide_id)
    
    # Determine slide index within deck
    def _get_slide_index(deck: DeckBase, slide_id: str) -> int:
        try:
            slides_iter = []
            if hasattr(deck, 'slides'):
                slides_iter = list(getattr(deck, 'slides', []) or [])
            elif isinstance(deck, dict):
                slides_iter = list(deck.get('slides', []) or [])
            for idx, s in enumerate(slides_iter):
                sid = getattr(s, 'id', None)
                if sid is None and isinstance(s, dict):
                    sid = s.get('id')
                if sid == slide_style_args.slide_id:
                    return idx
        except Exception:
            pass
        return 0

    # Extract rough text content from a slide's components for Outline content
    def _extract_slide_text(slide_obj: Any) -> str:
        try:
            components = []
            if hasattr(slide_obj, 'components'):
                components = list(getattr(slide_obj, 'components', []) or [])
            elif isinstance(slide_obj, dict):
                components = list(slide_obj.get('components', []) or [])
            texts: List[str] = []
            for comp in components:
                ctype = getattr(comp, 'type', None)
                props = getattr(comp, 'props', None)
                if ctype is None and isinstance(comp, dict):
                    ctype = comp.get('type')
                    props = comp.get('props', {})
                if isinstance(props, dict):
                    # Common text fields
                    if 'text' in props and isinstance(props.get('text'), str):
                        texts.append(str(props.get('text')))
                    elif 'content' in props and isinstance(props.get('content'), str):
                        texts.append(str(props.get('content')))
            # Include slide title as part of content context
            title_val = getattr(slide_obj, 'title', None)
            if title_val is None and isinstance(slide_obj, dict):
                title_val = slide_obj.get('title')
            if isinstance(title_val, str) and title_val:
                texts.insert(0, title_val)
            combined = "\n".join([t for t in texts if isinstance(t, str)])
            return combined[:2000]
        except Exception:
            return ""

    # Construct minimal DeckOutline/SlideOutline for RAG retrieval
    theme_dict = _get_theme_dict(deck_data)
    palette_dict = _get_palette_from_theme(theme_dict)
    
    deck_title = None
    try:
        deck_title = getattr(deck_data, 'title', None) or getattr(deck_data, 'name', None)
    except Exception:
        deck_title = None
    if deck_title is None and isinstance(deck_data, dict):
        deck_title = deck_data.get('title') or deck_data.get('name') or 'Untitled'

    # Build outlines list (keep light)
    outlines: List[OutlineSlide] = []
    try:
        slides_iter = []
        if hasattr(deck_data, 'slides'):
            slides_iter = list(getattr(deck_data, 'slides', []) or [])
        elif isinstance(deck_data, dict):
            slides_iter = list(deck_data.get('slides', []) or [])
        for s in slides_iter:
            sid = getattr(s, 'id', None)
            if sid is None and isinstance(s, dict):
                sid = s.get('id')
            stitle = getattr(s, 'title', None)
            if stitle is None and isinstance(s, dict):
                stitle = s.get('title') or ''
            outlines.append(OutlineSlide(id=str(sid or ""), title=str(stitle or ''), content=_extract_slide_text(s)))
    except Exception:
        # Fallback to at least current slide
        outlines = [OutlineSlide(id=str(slide_style_args.slide_id), title=str((slide_summary or {}).get('title', 'Slide')), content=_extract_slide_text(slide_data))]

    deck_outline = OutlineDeck(id="temp", title=str(deck_title or 'Untitled'), slides=outlines)
    current_index = _get_slide_index(deck_data, slide_style_args.slide_id)

    rag_context: Optional[Dict[str, Any]] = None
    try:
        retriever = SlideContextRetriever()
        current_outline = None
        for s in outlines:
            if s.id == str(slide_style_args.slide_id):
                current_outline = s
                break
        if current_outline is None and outlines:
            current_outline = outlines[min(max(current_index, 0), len(outlines) - 1)]
        rag_context = retriever.get_slide_context(current_outline, current_index, deck_outline, theme_dict, palette_dict) if current_outline else None
    except Exception:
        rag_context = None
    
    # Compact summary to keep prompts small
    def _compact_slide_summary(summary: dict, limit: int = 10) -> str:
        if not isinstance(summary, dict):
            return str(summary)[:400]
        parts = []
        parts.append(f"id: {summary.get('id')}")
        parts.append(f"title: {summary.get('title')}")
        parts.append(f"components: {summary.get('component_count')}")
        comp_items = summary.get('components') or []
        brief = []
        for comp in comp_items[:limit]:
            cid = comp.get('id')
            ctype = comp.get('type')
            brief.append(f"{cid}:{ctype}")
        if len(comp_items) > limit:
            brief.append(f"+{len(comp_items)-limit} more")
        if brief:
            parts.append("elements: " + ", ".join(brief))
        return " | ".join(parts)
    compact_summary = _compact_slide_summary(slide_summary)
    
    # Prefer RAG context when available; otherwise fall back to static guidelines
    layout_guidelines = ""
    style_guidelines = ""
    rag_context_str = ""
    if rag_context:
        try:
            rag_context_str = json.dumps(rag_context, ensure_ascii=False, indent=2)
        except Exception:
            rag_context_str = str(rag_context)
    else:
        layout_guidelines = default_layout_guidelines
        style_guidelines = default_style_guidelines
    
    system_prompt = f"""
    You are a helpful assistant that helps with deck and presentation styling.
    You will be given a slide data in the <slide> tag.
    You will then make the changes to the slide data to make the slide more aesthetically pleasing and in line with the presentation style.
    You will respect the rules in the <editor_notes> tag.
    Your job will be to call the update component tool to update the slide data. For each component that needs modification, you will call the tool once with clear instructions on what to change
    Do not be afriad to make many changes, and ensure that your instrcutions to the tool calls are very clear, as the editior will not have full context
    {"RAG design context is provided in <rag_context> and should be treated as PRIMARY guidance for layout/style." if rag_context_str else "Guidelines for layout and style will be provided in the <layout_guidelines> and <style_guidelines> tags."}

    CRITICAL THEME CONSISTENCY:
    - If <theme_context> is provided, you MUST follow its palette (colors), typography, and visual style. It OVERRIDES generic guidelines.
    - Use the theme's primary/secondary backgrounds and accents to drive color choices for text, shapes, and charts.
    - Use the theme's typography families when changing fontFamily for text components.
    - Keep coherence with theme across all edits.
    """
    
    prompt = f"""
    <editor_notes>
    {editor_notes}
    </editor_notes>

    {f"<theme_context>\n{theme_context}\n</theme_context>" if theme_context else ""}

    {f"<rag_context>\n{rag_context_str}\n</rag_context>" if rag_context_str else f"<layout_guidelines>\n{layout_guidelines}\n</layout_guidelines>\n\n<style_guidelines>\n{style_guidelines}\n</style_guidelines>"}

    <slide_summary_compact>
    {compact_summary}
    </slide_summary_compact>
    """
    
    client, model = get_client(SLIDE_STYLE_MODEL)

    EditComponentArgs = get_edit_component_model(deck_data=deck_data,
                                component_types=registry.get_component_types(),
                                component_ids=get_all_component_ids(deck_data, slide_style_args.slide_id), 
                                slide_ids=get_all_slide_ids(deck_data))

    # Dynamically create the EditRequest model based on the available ids and types
    EditRequest = create_model("EditRequest", 
        edit_request_summary=(str, Field(description="A succinct description of the edit request")),
        tool=(EditComponentArgs, Field(description="The tool call to use to edit the deck"))
    )

    ToolsCalls = create_model("ToolsCalls", 
        tool_calls=(List[EditRequest], Field(description="The list of tool calls to use to edit the deck"))
    )

    response = invoke(
        client=client,
        model=model,
        # Allow more room for structured tool calls while staying within safe bounds
        max_tokens=4000,
        response_model=ToolsCalls,
        messages=[
            {
                "role": "system",
                "content": system_prompt
            },
            {
                "role": "user", 
                "content": prompt
            }
        ]
    )

    for tool_call in response.tool_calls:
        print(f"    DEBUG: Tool call: {tool_call}")

    edit_summaries = []
    
    # Define a function to process a single tool call
    def process_tool_call(tool_call):
        tool_diff = edit_component(tool_call.tool, registry, deck_data, DeckDiff(DeckDiffBase()))
        return (tool_diff, tool_call.edit_request_summary)
    
    # Process tool calls in parallel
    with ThreadPoolExecutor() as executor:
        # Submit all tool calls to the executor
        future_results = [executor.submit(process_tool_call, tool_call) for tool_call in response.tool_calls]
        
        # Collect results as they complete
        for future in future_results:
            tool_diff, summary = future.result()
            # Merge the tool diff into the main deck diff
            deck_diff = deck_diff.merge(tool_diff)
            edit_summaries.append(summary)

    
    return deck_diff