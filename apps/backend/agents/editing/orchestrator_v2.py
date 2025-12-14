"""
Simple single-pass orchestrator for deck editing.

Philosophy:
- ONE LLM call to decide what tools to use
- Execute tools in order
- No complex multi-phase execution
- Trust the AI, fix output afterward
"""

from typing import Dict, List, Optional, Any, Union
import json
from pydantic import BaseModel, Field, create_model
import logging
import uuid

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK
from services.context_cache import get_deck_context_snapshot
from utils.summaries import summarize_chat_history

logger = logging.getLogger(__name__)

# region agent log
def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
    try:
        import json, time
        payload = {
            "sessionId": "debug-session",
            "runId": runId,
            "hypothesisId": hypothesisId,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open("/Users/ahmed/Documents/Dev/nextslide/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
# endregion


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER - Dict/Pydantic safe access
# ═══════════════════════════════════════════════════════════════════════════════

def _get_attr(obj, key, default=None):
    """Safely get attribute from dict or Pydantic model."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ═══════════════════════════════════════════════════════════════════════════════
# SYSTEM PROMPT - Keep it simple and direct
# ═══════════════════════════════════════════════════════════════════════════════

SYSTEM_PROMPT = """You are a helpful and friendly slide deck design assistant. Help users create beautiful presentations through conversation.

PERSONALITY:
- Be conversational and friendly - acknowledge what the user wants
- Explain what you're doing in simple terms (not technical jargon)
- If something is ambiguous, make a reasonable choice and mention it
- After making changes, briefly describe what you did

RULES:
1. Use tools to make changes. Never output raw HTML/code.
2. Be precise - if user says "red", use red (#FF0000 or similar)
3. For creative requests (like "make a slide about X"), use edit_slide or create_slide
4. You can and SHOULD call multiple tools in one response when needed
5. Always provide a conversational response with your tool calls

IMAGE REPLACEMENT (IMPORTANT):
- For "replace images", "fix images", "new images" → call search_images directly
- DON'T call view_component first - you can see the slide from the screenshot attachment
- Call search_images ONCE per image you need to replace
- Use image_index (0, 1, 2, ...) to target each image separately

GENERATING SEARCH QUERIES (CRITICAL FOR QUALITY):
1. UNDERSTAND THE SLIDE CONTEXT first:
   - What is the slide about? (topic, company, product, concept)
   - What would look GOOD visually, not just match the text literally
   - Is the current image chaotic/ugly? Replace with something clean and professional

2. SEARCH QUERY BEST PRACTICES:
   - Company-specific: Search "[Company Name] logo", "[Company Name] product", "[Company Name] office"
   - Abstract/aesthetic: For concepts like sustainability → "dense green forest landscape", "clean energy wind turbines blue sky"
   - Professional: For business slides → "modern office team meeting professional", "corporate handshake business deal"
   - Avoid generic: DON'T just search "business" or "technology" - be SPECIFIC
   - Design-first: Think about what image would make the slide LOOK beautiful

3. EXAMPLES OF GOOD VS BAD QUERIES:
   BAD: "company" → TOO VAGUE
   GOOD: "Apple headquarters Cupertino building" → SPECIFIC

   BAD: "technology" → GENERIC
   GOOD: "modern data center server racks blue lighting" → VISUALLY APPEALING

   BAD: "environment" → BORING
   GOOD: "aerial view lush green rainforest misty mountains" → BEAUTIFUL

4. WHEN TO USE ABSTRACT IMAGES:
   - For slide backgrounds or decorative elements
   - When the concept is abstract (innovation, growth, success)
   - When you need something that "looks good" more than "represents exactly"

EXAMPLE - "Replace all 4 company images":
Return 4 tool_calls in your response:
  {"tool_name": "search_images", "tool_args": {"query": "Apple vintage computer garage startup history", "image_index": 0}, "summary": "Replace Apple image"}
  {"tool_name": "search_images", "tool_args": {"query": "Oracle cloud database infrastructure modern", "image_index": 1}, "summary": "Replace Oracle image"}
  {"tool_name": "search_images", "tool_args": {"query": "Cisco networking equipment data center professional", "image_index": 2}, "summary": "Replace Cisco image"}
  {"tool_name": "search_images", "tool_args": {"query": "NVIDIA GPU AI computing technology futuristic", "image_index": 3}, "summary": "Replace NVIDIA image"}

CANVAS: 1920x1080 pixels. Origin (0,0) top-left.

⚠️ CRITICAL: TARGETED EDITS - DO NOT OVER-EDIT

When user asks for a SPECIFIC change, ONLY change that ONE thing:
- "Fix the logo" → Only fix the logo, keep everything else EXACTLY as-is
- "Make the title red" → Only change the title color, nothing else
- "Change 'Hello' to 'Hi'" → Only replace that text
- "Use Geisslers logo" → Only update the logo image/URL

DO NOT:
- Restructure the layout when user only asked for a text/color/logo change
- Change fonts, colors, or spacing that user didn't mention
- "Improve" or "clean up" things user didn't ask about
- Rewrite the entire component for a single-element fix

WHEN TO USE EACH TOOL:

custom_component_str_replace (SURGICAL - PREFERRED for single changes):
- ONE text change, ONE color, ONE URL, ONE image
- Pass the EXACT instruction to fix just that element
- Example: "Fix the logo" → instruction: "Replace the logo with [new logo URL]"

edit_slide (FULL REWRITE - only when necessary):
- User explicitly wants redesign/rebrand/overhaul
- User wants to change the overall theme/style
- User wants to add/remove MULTIPLE elements
- Slide is empty and needs content
- User says: "redesign", "redo", "rebuild", "from scratch"

STAY ON THEME (CRITICAL):
- ALWAYS check the 🎨 DECK THEME section in context for colors and typography
- Use those EXACT colors/fonts in any generated content
- When editing or creating, preserve the existing design language
- Only change theme colors if user EXPLICITLY asks to change them
- If user says "make it red", apply red while keeping other theme elements

TOOL SELECTION:
- custom_component_str_replace: ⭐ PREFERRED - Targeted edit for single changes (logo, color, text, image)
- edit_slide: Full rewrite (ONLY for major redesigns, NOT for single fixes)
- create_slide: Create a NEW slide
- delete_slide: Remove a slide
- edit_component: Edit a specific component by ID
- create_component: Add a component to a slide
- delete_component: Remove a component
- apply_theme: Change colors/fonts across deck
- component_prop_update: Mechanical prop update for an existing component
- view_component: Inspect a component's current props/HTML preview

NOTE: Visual context (screenshot) is automatically provided when relevant.
"""


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL CALL MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ToolCall(BaseModel):
    """A single tool invocation from the LLM."""
    tool_name: str = Field(description="Name of the tool to call")
    tool_args: Dict[str, Any] = Field(description="Arguments for the tool")
    summary: str = Field(description="Brief description of what this edit does")


class OrchestratorResponse(BaseModel):
    """LLM response containing tool calls and conversational message."""
    tool_calls: List[ToolCall] = Field(description="List of tools to execute")
    message: str = Field(default="", description="Friendly conversational response to the user explaining what was done")

def parse_selections_from_message(user_message: str) -> tuple[str, List[Dict[str, Any]]]:
    """
    Extract selections appended by upstream as:
      "... \n\n[USER_SELECTIONS] comp_id (Type)@slide_id, ..."
    Returns (clean_message, selections)
    selections: [{id, type, slide_id}]
    """
    if not user_message or "[USER_SELECTIONS]" not in user_message:
        return user_message, []

    try:
        parts = user_message.split("[USER_SELECTIONS]", 1)
        clean = parts[0].strip()
        sel_line = parts[1].split("\n", 1)[0].strip()
        selections: List[Dict[str, Any]] = []
        for raw in (sel_line.split(",") if sel_line else []):
            s = raw.strip()
            if not s:
                continue
            cid = None
            ctype = None
            sid = None
            # formats: "id (Type)@slide", "id (Type)", "id@slide"
            if "(" in s:
                cid = s.split("(", 1)[0].strip()
                inside = s.split("(", 1)[1]
                ctype = inside.split(")", 1)[0].strip() if ")" in inside else None
                after = inside.split(")", 1)[1] if ")" in inside else ""
                if "@" in after:
                    sid = after.split("@", 1)[1].strip()
            else:
                if "@" in s:
                    cid, sid = [p.strip() for p in s.split("@", 1)]
                else:
                    cid = s.strip()
            if cid:
                selections.append({"id": cid, "type": ctype, "slide_id": sid})
        return clean, selections
    except Exception:
        return user_message, []


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT BUILDER
# ═══════════════════════════════════════════════════════════════════════════════

def build_context(
    deck_data,
    current_slide,
    attachments: List[Dict] = None,
    chat_history: List = None,
    selections: List[Dict[str, Any]] = None,
) -> str:
    """Build concise context for LLM."""

    # Current slide info
    slide_id = _get_attr(current_slide, 'id', 'unknown')
    components = _get_attr(current_slide, 'components', []) or []

    # Extract theme for context
    theme = _get_attr(deck_data, 'theme', {}) or {}
    color_palette = theme.get('color_palette', {}) or theme.get('colors', {}) or {}
    typography = theme.get('typography', {}) or {}

    # Build theme context string with explicit color values
    theme_str = ""
    if color_palette or typography:
        theme_lines = ["🎨 DECK THEME (ALWAYS use these colors/fonts to stay on brand unless user asks otherwise):"]
        if color_palette:
            # Extract specific colors
            bg_color = color_palette.get('primary_background', '')
            text_color = color_palette.get('primary_text', '')
            accent_colors = color_palette.get('colors', [])
            colors_list = []
            if bg_color:
                colors_list.append(f"Background: {bg_color}")
            if text_color:
                colors_list.append(f"Text: {text_color}")
            if accent_colors and isinstance(accent_colors, list):
                colors_list.append(f"Accent colors: {', '.join(str(c) for c in accent_colors[:4])}")
            # Also include other palette values
            for k, v in list(color_palette.items())[:8]:
                if k not in ['primary_background', 'primary_text', 'colors'] and isinstance(v, str):
                    colors_list.append(f"{k}: {v}")
            if colors_list:
                theme_lines.append(f"  Colors: " + " | ".join(colors_list[:6]))
        if typography:
            fonts_list = []
            for k, v in list(typography.items())[:4]:
                if isinstance(v, dict) and 'family' in v:
                    fonts_list.append(f"{k}: {v['family']}")
                elif isinstance(v, str):
                    fonts_list.append(f"{k}: {v}")
            if fonts_list:
                theme_lines.append(f"  Fonts: " + " | ".join(fonts_list))
        theme_lines.append("  ⚠️ When editing, preserve these brand colors/fonts!")
        theme_str = "\n".join(theme_lines) + "\n\n"

    # Analyze what's on the slide
    non_bg_components = [c for c in components if _get_attr(c, 'type') != 'Background']
    has_custom = any(_get_attr(c, 'type') == 'CustomComponent' for c in components)
    is_empty = len(non_bg_components) == 0

    # Slide status
    if is_empty:
        slide_status = "⚠️ SLIDE IS EMPTY (only has background). Use edit_slide to add content."
    elif has_custom:
        slide_status = "Slide has CustomComponent - use custom_component_str_replace for targeted edits."
    else:
        slide_status = f"Slide has {len(non_bg_components)} components."

    # Component list
    component_list = []
    for c in components:
        ctype = _get_attr(c, 'type', 'Unknown')
        cid = _get_attr(c, 'id', 'no-id')
        props = _get_attr(c, 'props', {}) or {}

        # Helper to get props (might be dict or Pydantic)
        def get_prop(key, default=''):
            if isinstance(props, dict):
                return props.get(key, default)
            return getattr(props, key, default)

        if ctype == 'Background':
            component_list.append(f"  - Background")
        elif ctype == 'CustomComponent':
            html = str(get_prop('render', ''))[:200]
            component_list.append(f"  - CustomComponent [{cid}]: {len(str(get_prop('render', '')))} chars HTML")
        elif ctype == 'TiptapTextBlock':
            text = str(get_prop('text', ''))[:50]
            component_list.append(f"  - TiptapTextBlock [{cid}]: \"{text}...\"")
        elif ctype == 'Image':
            src = str(get_prop('src', ''))[:50]
            component_list.append(f"  - Image [{cid}]: {src}...")
        else:
            component_list.append(f"  - {ctype} [{cid}]")

    components_str = "\n".join(component_list) if component_list else "  (no components)"

    # Selections (critical for "this" references) - include FULL HTML for selected CustomComponents
    sel_str = ""
    full_html_str = ""
    if selections:
        sel_lines = []
        for sel in selections:
            sid = sel.get("slide_id")
            cid = sel.get("id")
            ctype = sel.get("type")
            # If selection is a slide, call it out explicitly
            if ctype == "Slide" or (cid and sid and cid == sid):
                sel_lines.append(f"  - Slide selected: {sid or cid}")
                continue
            # Otherwise try to find component details on current slide
            comp = next((c for c in components if _get_attr(c, "id") == cid), None)
            if comp:
                ctype2 = _get_attr(comp, "type", ctype or "Unknown")
                props = _get_attr(comp, "props", {}) or {}
                preview = ""
                if ctype2 == "CustomComponent":
                    # Get FULL HTML for selected CustomComponent (for targeted edits)
                    full_html = ""
                    if isinstance(props, dict):
                        full_html = str(props.get("render", ""))
                    else:
                        full_html = str(getattr(props, "render", ""))
                    preview = f" ({len(full_html)} chars)"
                    # Include full HTML so model can make targeted edits
                    if full_html:
                        full_html_str = f"\n\n📄 SELECTED COMPONENT FULL HTML (component_id={cid}):\n```html\n{full_html}\n```\n⚠️ For targeted edits, use custom_component_str_replace with specific instruction."
                elif ctype2 == "TiptapTextBlock":
                    t = props.get("text") if isinstance(props, dict) else getattr(props, "text", "")
                    preview = f" (text preview: {str(t)[:120]}...)"
                sel_lines.append(f"  - {ctype2} [{cid}] on slide {sid or slide_id}{preview}")
            else:
                sel_lines.append(f"  - Selection: {cid} ({ctype or 'Unknown'})@{sid or slide_id}")
        if sel_lines:
            sel_str = "\n\n🎯 SELECTED (user refers to this as 'this'):\n" + "\n".join(sel_lines) + full_html_str

    # Attachments
    att_str = ""
    if attachments:
        att_list = [f"  - {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_str = f"\n\nATTACHMENTS (user uploaded):\n" + "\n".join(att_list)

    # Chat history (brief)
    history_str = ""
    if chat_history:
        recent = chat_history[-3:]  # Last 3 messages
        history_lines = [f"  {m.get('role', 'user')}: {str(m.get('content', ''))[:100]}" for m in recent]
        history_str = f"\n\nRECENT CHAT:\n" + "\n".join(history_lines)

    context = f"""{theme_str}CURRENT SLIDE: {slide_id}
STATUS: {slide_status}

COMPONENTS:
{components_str}{sel_str}{att_str}{history_str}"""
    _dbg("A", "orchestrator_v2.py:build_context", "built_context", {"slide_id": slide_id, "has_selections": bool(selections), "selection_count": len(selections or []), "context_len": len(context)}, runId="pre-fix")
    return context


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS (for LLM to know what's available)
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DESCRIPTIONS = """
AVAILABLE TOOLS:

1. custom_component_str_replace ⭐ PREFERRED FOR TARGETED EDITS
   - Make a SINGLE targeted edit to a CustomComponent
   - ✅ USE FOR: fix logo, change one color, update one text, fix one image, adjust one element
   - Pass a clear instruction describing ONLY what to change
   - Args: { "slide_id": str, "component_id": str, "instruction": str }
   - Example: {"instruction": "Replace the logo with the Geisslers logo"}
   - Example: {"instruction": "Change the title color to red"}
   - Example: {"instruction": "Fix the cropped image by adjusting its size"}

2. edit_slide (FULL REWRITE - use sparingly)
   - Completely rewrites the slide content (AI regenerates everything)
   - ⚠️ ONLY use when user explicitly wants: redesign, rebrand, overhaul, "from scratch"
   - ⚠️ DO NOT use for single fixes like "fix the logo" or "change one color"
   - Args: { "slide_id": str, "instruction": str }
   - Example: {"instruction": "Redesign this slide with Nike branding throughout"}

3. create_slide ⭐ FOR NEW SLIDES
   - Create a new slide
   - ✅ USE THIS for any "add slide", "create slide", "new slide" request
   - ALWAYS set insert_after to the current slide ID so the new slide appears right after it
   - Args: { "instruction": str, "insert_after": str (REQUIRED - use current slide ID) }

4. delete_slide
   - Remove a slide from the deck
   - Args: { "slide_id": str }

5. duplicate_slide
   - Duplicate a slide (mechanical)
   - Args: { "slide_id": str, "insert_after": optional str }

6. reorder_slides
   - Reorder slides (mechanical)
   - Args: { "slide_id": str, "new_index": int } OR { "slide_order": [slide_id,...] }

7. edit_component
   - Edit a specific component by ID
   - Args: { "slide_id": str, "component_id": str, "instruction": str }

8. create_component
   - Add a new component to a slide
   - Args: { "slide_id": str, "component_type": str, "instruction": str }
   - component_type: TiptapTextBlock, Image, Chart, Shape, CustomComponent

9. delete_component
   - Remove a component from a slide
   - Args: { "slide_id": str, "component_id": str }

10. apply_theme
   - Apply colors/fonts to the deck
   - Args: { "instruction": str }

11. component_prop_update
   - Mechanical prop merge for a component (no AI)
   - WHEN: User wants to move/resize/change font size/color on a selected component
   - Args: { "slide_id": str, "component_id": str, "updates": { ... } }

13. view_component
   - Return a component's current props (and HTML preview for CustomComponent)
   - WHEN: Before a surgical edit so you can reference exact strings/classes
   - Args: { "slide_id": str, "component_id": str }

14. search_images ⭐ FOR IMAGE REPLACEMENT
   - Search Google Images and replace ONE image at a time
   - ✅ USE FOR: "replace the image", "find a better image", "fix the images"
   - Works with BOTH Image components AND CustomComponents (replaces <img> tags in HTML)
   - SMART MATCHING: Scores each image by alt text and surrounding context to find best match
   - ⚠️ CRITICAL: This tool replaces ONE image per call. For "replace ALL images":
     - Call search_images MULTIPLE TIMES with different queries
     - Use image_index to target specific images (0=first, 1=second, etc.)
   - Args: { "query": str, "image_index": optional int, "old_url": optional str, "orientation": "landscape"|"portrait"|"square" }

   🎯 QUERY QUALITY IS CRITICAL - Generate SPECIFIC, VISUAL queries:
   - For companies: "Tesla Model S electric car sleek", "Microsoft headquarters Redmond campus", "Amazon warehouse fulfillment center"
   - For concepts: "team collaboration modern office whiteboard brainstorming", "sustainable energy solar panels sunrise"
   - For aesthetics: "minimalist abstract blue gradient technology", "professional business handshake deal"
   - AVOID: "company", "business", "technology" (too generic!)
   - THINK: What image would make this slide look BEAUTIFUL and PROFESSIONAL?

   - Example: {"query": "Apple vintage Macintosh computer garage startup", "image_index": 0}
   - Example: {"query": "Oracle cloud infrastructure data center modern blue", "image_index": 1}

15. replace_image
   - Replace an Image component with a specific URL
   - WHEN: After search_images, or when user provides a URL
   - Args: { "component_id": str, "image_url": str, "alt": optional str }
"""


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════════════════════

def orchestrate(
    deck_data: Dict,
    current_slide: Dict,
    user_message: str,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List = None,
    event_cb: callable = None,
) -> Dict:
    """
    Single-pass orchestration.

    1. Build context
    2. Call LLM to get tool calls
    3. Execute tools sequentially
    4. Return deck_diff

    Args:
        deck_data: Full deck object
        current_slide: Currently selected slide
        user_message: User's edit request
        registry: Component registry (for validation)
        attachments: User-uploaded files
        chat_history: Previous messages
        event_cb: Callback for streaming events

    Returns:
        {"deck_diff": DeckDiff, "edit_summary": str}
    """
    from agents.editing.tools.tool_executor import execute_tool

    def _is_empty_deckdiff(dd: DeckDiff) -> bool:
        try:
            base = dd.deck_diff if hasattr(dd, "deck_diff") else dd
            if hasattr(base, "model_dump"):
                payload = base.model_dump()
            elif hasattr(base, "dict"):
                payload = base.dict()
            else:
                payload = base
            return (
                not (payload.get("slides_to_update") or [])
                and not (payload.get("slides_to_add") or [])
                and not (payload.get("slides_to_remove") or [])
                and not (payload.get("slide_order") or None)
            )
        except Exception:
            return False

    clean_message, selections = parse_selections_from_message(user_message or "")
    _dbg(
        "A",
        "orchestrator_v2.py:orchestrate",
        "parsed_selections",
        {"has_marker": "[USER_SELECTIONS]" in (user_message or ""), "selection_count": len(selections), "msg_len": len(user_message or ""), "clean_len": len(clean_message or "")},
        runId="pre-fix",
    )

    # Build context (include selection info)
    context = build_context(deck_data, current_slide, attachments, chat_history, selections=selections)

    # Full prompt
    prompt = f"""{context}

{TOOL_DESCRIPTIONS}

USER REQUEST: {clean_message}

Respond with the tool_calls to execute."""

    # Get client (use Haiku for orchestration - fast and smart enough)
    model = get_model("orchestrator")

    # Check for rate limits
    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[ORCHESTRATOR] Gemini in cooldown, using fallback: {model}")

    client, actual_model = get_client(model)

    # Single LLM call
    try:
        response = invoke(
            client=client,
            model=actual_model,
            messages=[
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": prompt}
            ],
            response_model=OrchestratorResponse,
            max_tokens=4096,
        )
    except Exception as e:
        error_str = str(e).lower()
        if '429' in error_str or 'rate' in error_str:
            # Try fallback
            logger.warning(f"[ORCHESTRATOR] Rate limited, trying fallback")
            mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            response = invoke(
                client=fallback_client,
                model=fallback_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": prompt}
                ],
                response_model=OrchestratorResponse,
                max_tokens=4096,
            )
        else:
            raise

    # Log LLM's tool call decisions
    if response.tool_calls:
        tool_names = [tc.tool_name for tc in response.tool_calls]
        logger.info(f"[ORCHESTRATOR] 📋 LLM decided to call tools: {tool_names}")
    else:
        logger.info(f"[ORCHESTRATOR] 📋 LLM returned no tool calls")
    if response.message:
        logger.info(f"[ORCHESTRATOR] 💬 LLM message: {response.message[:100]}...")

    # Emit plan if callback provided (with user-friendly titles)
    if event_cb and response.tool_calls:
        def _user_friendly_summary(summary: str, tool_name: str) -> str:
            """Convert technical summaries to user-friendly descriptions."""
            s = summary.lower()
            # Hide technical terms from users
            if "view_component" in tool_name or "view" in s and "component" in s:
                return "Analyzing the component"
            if "customcomponent" in s or "custom component" in s:
                return summary.replace("CustomComponent", "component").replace("customcomponent", "component")
            if "html" in s and ("div" in s or "element" in s):
                return "Updating the component"
            # Clean up common technical patterns
            cleaned = summary
            for tech_term in ["HTML", "div element", "div", "DOM", "props", "str_replace"]:
                cleaned = cleaned.replace(tech_term, "content")
            return cleaned

        plan = [{"title": _user_friendly_summary(tc.summary, tc.tool_name)} for tc in response.tool_calls]
        try:
            event_cb("agent.plan.update", {"plan": plan})
        except Exception:
            pass

    def _execute_tool_calls(tool_calls: List[ToolCall]) -> tuple[DeckDiff, List[str], List[Dict[str, Any]]]:
        """Execute tool calls and collect any attached observations."""
        dd = DeckDiff(DeckDiffBase())
        summaries: List[str] = []
        observations: List[Dict[str, Any]] = []

        # Track accumulated component updates so sequential str_replace ops see previous results
        # Key: component_id, Value: latest props dict (especially 'render' for CustomComponent)
        accumulated_props: Dict[str, Dict[str, Any]] = {}

        for tool_call in tool_calls or []:
            tool_name = tool_call.tool_name
            tool_args = tool_call.tool_args

            # Emit tool start
            if event_cb:
                try:
                    event_cb("agent.tool.start", {"tool": tool_name})
                except Exception:
                    pass

            logger.info(f"[ORCHESTRATOR] 🔧 Executing tool: {tool_name} with args: {list(tool_args.keys())}")

            # CRITICAL FIX: For tools that modify CustomComponent HTML, use accumulated HTML from previous ops
            # This prevents each operation from reading stale original HTML
            effective_slide = current_slide
            # Tools that modify CustomComponent HTML and should use accumulated state
            html_modifying_tools = {"custom_component_str_replace", "search_images", "custom_component_rewrite"}
            if tool_name in html_modifying_tools and accumulated_props:
                comp_id = tool_args.get("component_id")
                # CRITICAL: Auto-detect CustomComponent ID if not in tool_args
                # search_images auto-detects this, so we need to do the same here
                if not comp_id and current_slide:
                    for c in (current_slide.get("components") or []):
                        if isinstance(c, dict) and c.get("type") == "CustomComponent":
                            comp_id = c.get("id")
                            logger.info(f"[ORCHESTRATOR] Auto-detected CustomComponent for accumulated props: {comp_id}")
                            break
                if comp_id and comp_id in accumulated_props:
                    # Create a patched slide with the accumulated props
                    import copy
                    effective_slide = copy.deepcopy(current_slide)
                    for c in (effective_slide.get("components") or []):
                        if isinstance(c, dict) and c.get("id") == comp_id:
                            # Merge accumulated props with existing props (don't fully replace)
                            if isinstance(c.get("props"), dict):
                                c["props"] = {**c["props"], **accumulated_props[comp_id]}
                            else:
                                c["props"] = accumulated_props[comp_id]
                            break
                    logger.info(f"[ORCHESTRATOR] Using accumulated HTML for {comp_id} ({len(accumulated_props[comp_id].get('render', ''))} chars)")

            try:
                tool_diff = execute_tool(
                    tool_name=tool_name,
                    tool_args=tool_args,
                    deck_data=deck_data,
                    current_slide=effective_slide,
                    registry=registry,
                    attachments=attachments,
                )

                # Collect read-only observation payloads (e.g., view_component)
                try:
                    obs = getattr(tool_diff, "observation", None)
                    if isinstance(obs, dict) and obs:
                        observations.append({"tool": tool_name, "data": obs})
                except Exception:
                    pass

                if tool_diff:
                    # Ensure tool_diff is a DeckDiff object, not a dict
                    if isinstance(tool_diff, dict):
                        logger.warning(f"[ORCHESTRATOR] Tool {tool_name} returned dict instead of DeckDiff, skipping merge")
                    else:
                        # Log before merge for debugging
                        try:
                            inner = getattr(tool_diff, 'deck_diff', None)
                            if inner and hasattr(inner, 'slides_to_update'):
                                updates = inner.slides_to_update or []
                                logger.info(f"[ORCHESTRATOR] 🔧 Tool {tool_name} returned DeckDiff with {len(updates)} slide updates")
                                for su in updates:
                                    comp_updates = getattr(su, 'components_to_update', None) or []
                                    logger.info(f"[ORCHESTRATOR] 🔧   Slide {getattr(su, 'slide_id', '?')}: {len(comp_updates)} component updates")
                        except Exception:
                            pass
                        dd = dd.merge(tool_diff)

                        # CRITICAL: Track accumulated props for sequential operations
                        # Extract updated props from the diff so next operations see the changes
                        try:
                            # Safely access deck_diff - some DeckDiff wrappers may not have it
                            deck_diff_inner = getattr(tool_diff, 'deck_diff', None)
                            if deck_diff_inner and hasattr(deck_diff_inner, 'slides_to_update'):
                                for slide_diff in (deck_diff_inner.slides_to_update or []):
                                    for comp_diff in (getattr(slide_diff, 'components_to_update', None) or []):
                                        comp_id = getattr(comp_diff, 'id', None)
                                        comp_props = getattr(comp_diff, 'props', None)
                                        if comp_id and comp_props:
                                            # Get existing accumulated props and merge
                                            existing = accumulated_props.get(comp_id, {})
                                            if hasattr(comp_props, 'model_dump'):
                                                new_props = comp_props.model_dump(exclude_none=True)
                                            elif hasattr(comp_props, 'dict'):
                                                new_props = comp_props.dict(exclude_none=True)
                                            elif isinstance(comp_props, dict):
                                                new_props = comp_props
                                            else:
                                                new_props = {}
                                            accumulated_props[comp_id] = {**existing, **new_props}
                                            logger.info(f"[ORCHESTRATOR] Accumulated props for {comp_id}: {list(new_props.keys())}")
                        except Exception as e:
                            logger.warning(f"[ORCHESTRATOR] Failed to accumulate props: {e}")

                summaries.append(tool_call.summary)

                if event_cb:
                    try:
                        event_cb("agent.tool.finish", {"tool": tool_name, "summary": tool_call.summary})
                    except Exception:
                        pass

            except Exception as e:
                logger.error(f"[ORCHESTRATOR] Tool {tool_name} failed: {e}")
                if event_cb:
                    try:
                        event_cb("agent.tool.error", {"tool": tool_name, "error": str(e)})
                    except Exception:
                        pass
                continue

        return dd, summaries, observations

    # Pass 1: execute initial tool calls
    deck_diff, edit_summaries, observations = _execute_tool_calls(response.tool_calls)

    # Pass 2 (lightweight): if the agent only "looked" (e.g., view_component) and made no changes,
    # immediately feed the observation back in and ask for actionable tool calls.
    # This prevents the frustrating "we viewed it, now user must re-ask" loop.
    logger.info(f"[ORCHESTRATOR] Pass 2 check: observations={bool(observations)}, is_empty_deckdiff={_is_empty_deckdiff(deck_diff)}")
    if observations and _is_empty_deckdiff(deck_diff):
        logger.info(f"[ORCHESTRATOR] 🔄 Starting follow-up pass - agent only viewed, need actionable edits")
        try:
            followup_prompt = f"""{context}

{TOOL_DESCRIPTIONS}

USER REQUEST: {clean_message}

You already executed read-only tools and obtained these observations (JSON):
{json.dumps(observations, ensure_ascii=False)[:24000]}

Now propose the NEXT tool_calls needed to actually satisfy the user request.
- Do NOT call view_component again - you already have the component HTML in the observations above.
- For IMAGE REPLACEMENT requests ("replace images", "fix images", "new images"):
  → Use search_images tool - call it ONCE per image you need to replace
  → Use image_index (0, 1, 2...) to target specific images
  → Generate HIGH-QUALITY search queries based on slide context:
    * Look at the slide title and content - what is this slide ABOUT?
    * For companies: search "[Company] logo", "[Company] product", "[Company] headquarters"
    * For concepts: use VISUAL, AESTHETIC terms like "modern office sunrise glass building"
    * AVOID generic terms like "business", "technology", "image"
    * Think: what would make this slide look BEAUTIFUL and PROFESSIONAL?
- For TEXT edits: use custom_component_str_replace or component_prop_update.

Respond with the tool_calls to execute."""

            logger.info(f"[ORCHESTRATOR] 🔄 Invoking follow-up LLM call...")
            followup = invoke(
                client=client,
                model=actual_model,
                messages=[
                    {"role": "system", "content": SYSTEM_PROMPT},
                    {"role": "user", "content": followup_prompt},
                ],
                response_model=OrchestratorResponse,
                max_tokens=4096,
            )
            logger.info(f"[ORCHESTRATOR] 🔄 Follow-up response: tool_calls={[tc.tool_name for tc in (followup.tool_calls or [])]}")

            # Prevent redundant re-views in follow-up when we already have the observation.
            try:
                original_count = len(followup.tool_calls or [])
                followup.tool_calls = [
                    tc for tc in (followup.tool_calls or [])
                    if tc.tool_name != "view_component"
                ]
                filtered_count = len(followup.tool_calls or [])
                if original_count != filtered_count:
                    logger.info(f"[ORCHESTRATOR] 🔄 Filtered out {original_count - filtered_count} view_component calls")
            except Exception:
                pass

            if event_cb and followup.tool_calls:
                def _friendly(summary: str, tool_name: str) -> str:
                    s = summary.lower()
                    if "view_component" in tool_name or "view" in s and "component" in s:
                        return "Analyzing the component"
                    if "customcomponent" in s or "custom component" in s:
                        return summary.replace("CustomComponent", "component").replace("customcomponent", "component")
                    if "html" in s and ("div" in s or "element" in s):
                        return "Updating the component"
                    cleaned = summary
                    for tech_term in ["HTML", "div element", "div", "DOM", "props", "str_replace"]:
                        cleaned = cleaned.replace(tech_term, "content")
                    return cleaned
                plan = [{"title": _friendly(tc.summary, tc.tool_name)} for tc in followup.tool_calls]
                try:
                    event_cb("agent.plan.update", {"plan": plan})
                except Exception:
                    pass

            if followup.tool_calls:
                logger.info(f"[ORCHESTRATOR] 🔄 Executing {len(followup.tool_calls)} follow-up tool calls")
                dd2, summaries2, _obs2 = _execute_tool_calls(followup.tool_calls)
                deck_diff = deck_diff.merge(dd2)
                edit_summaries.extend(summaries2)
                logger.info(f"[ORCHESTRATOR] 🔄 Follow-up complete: {len(summaries2)} summaries, empty_diff={_is_empty_deckdiff(deck_diff)}")
            else:
                # Log debug info when no tool calls are returned
                obs_str = json.dumps(observations, ensure_ascii=False)
                followup_msg = getattr(followup, 'message', '') or ''
                logger.warning(f"[ORCHESTRATOR] 🔄 Follow-up returned NO tool calls - agent may need more guidance")
                logger.warning(f"[ORCHESTRATOR] 🔄 Observations length: {len(obs_str)} chars, followup message: {followup_msg[:200] if followup_msg else '(empty)'}")
        except Exception as e:
            logger.warning(f"[ORCHESTRATOR] Follow-up after observation failed: {e}")
            import traceback
            logger.warning(traceback.format_exc())

    # Extract the conversational message from the response
    agent_message = getattr(response, 'message', '') or ''

    # Emit the conversational message to the frontend
    if event_cb and agent_message:
        try:
            event_cb("assistant.message.delta", {"delta": agent_message})
        except Exception:
            pass

    return {"deck_diff": deck_diff, "edit_summary": "\n".join(edit_summaries), "message": agent_message}


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT (matches old edit_deck signature)
# ═══════════════════════════════════════════════════════════════════════════════

def edit_deck(
    deck_data,
    current_slide,
    registry,
    message: str,
    chat_history: List = None,
    run_uuid: str = None,
    event_cb: callable = None,
    attachments: List[Dict] = None,
) -> Dict:
    """
    Main entry point for deck editing.
    Signature matches the old orchestrator for drop-in replacement.
    """

    # Convert to dict if needed (handle both old .dict() and new .model_dump())
    if hasattr(deck_data, 'model_dump'):
        deck_data = deck_data.model_dump()
    elif hasattr(deck_data, 'dict'):
        deck_data = deck_data.dict()

    if hasattr(current_slide, 'model_dump'):
        current_slide = current_slide.model_dump()
    elif hasattr(current_slide, 'dict'):
        current_slide = current_slide.dict()

    result = orchestrate(
        deck_data=deck_data,
        current_slide=current_slide,
        user_message=message,
        registry=registry,
        attachments=attachments,
        chat_history=chat_history,
        event_cb=event_cb,
    )

    # Extract deck_diff_data for API compatibility
    deck_diff = result.get('deck_diff')
    deck_diff_data = None
    if deck_diff:
        if hasattr(deck_diff, 'deck_diff'):
            deck_diff_data = deck_diff.deck_diff
        else:
            deck_diff_data = deck_diff

    return {
        "deck_diff": deck_diff_data,
        "edit_summary": result.get('edit_summary', ''),
        "message": result.get('message', '')
    }
