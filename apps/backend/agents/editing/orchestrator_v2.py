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

import re

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK
from services.context_cache import get_deck_context_snapshot
from utils.summaries import summarize_chat_history

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# HTML CLEANUP - Strip frontend editing scripts before saving
# ═══════════════════════════════════════════════════════════════════════════════

def apply_theme_to_custom_component_html(
    html: str,
    colors: Dict[str, str] = None,
    typography: Dict[str, Any] = None
) -> str:
    """
    Apply theme colors and fonts to CustomComponent HTML.

    This updates CSS custom properties in :root blocks and font-family declarations.
    Safe for "hotswapping" since it's just CSS value replacement.

    Args:
        html: The CustomComponent HTML
        colors: Dict with keys like 'accent_1', 'primary_text', 'primary_background', etc.
        typography: Dict with keys like 'heading', 'body' containing font info

    Returns:
        Updated HTML with theme applied
    """
    if not html or not isinstance(html, str):
        return html

    updated = html

    # Apply color updates to CSS custom properties
    if colors:
        # Common CSS variable name mappings
        color_var_mappings = {
            'accent_1': ['--accent', '--accent-1', '--primary', '--accent-color'],
            'accent_2': ['--secondary', '--accent-2', '--secondary-color'],
            'primary_text': ['--text', '--text-color', '--primary-text', '--foreground'],
            'primary_background': ['--bg', '--background', '--bg-color', '--primary-background'],
            'accent_3': ['--accent-3', '--highlight'],
        }

        for color_key, css_vars in color_var_mappings.items():
            color_value = colors.get(color_key)
            if not color_value:
                continue

            for css_var in css_vars:
                # Match CSS variable declaration like: --accent: #007354;
                pattern = rf'({re.escape(css_var)}\s*:\s*)([^;]+)(;)'
                updated = re.sub(pattern, rf'\g<1>{color_value}\g<3>', updated)

    # Apply typography updates
    if typography:
        # Get font families from typography config
        heading_font = None
        body_font = None

        if isinstance(typography.get('heading'), dict):
            heading_font = typography['heading'].get('family')
        elif isinstance(typography.get('heading'), str):
            heading_font = typography['heading']

        if isinstance(typography.get('body'), dict):
            body_font = typography['body'].get('family')
        elif isinstance(typography.get('body'), str):
            body_font = typography['body']

        # Update Google Fonts import if present
        if heading_font or body_font:
            fonts_to_import = []
            if heading_font:
                fonts_to_import.append(heading_font.replace(' ', '+'))
            if body_font and body_font != heading_font:
                fonts_to_import.append(body_font.replace(' ', '+'))

            if fonts_to_import:
                new_font_import = f'https://fonts.googleapis.com/css2?family={":wght@300;400;500;600;700&family=".join(fonts_to_import)}:wght@300;400;500;600;700&display=swap'
                # Replace existing Google Fonts import
                updated = re.sub(
                    r'https://fonts\.googleapis\.com/css2\?[^"\'>\s]+',
                    new_font_import,
                    updated
                )

        # Update font-family declarations for headings (h1-h6)
        if heading_font:
            # Match h1, h2, etc. selectors and their font-family
            for tag in ['h1', 'h2', 'h3', 'h4', 'h5', 'h6', '.title', '.heading', '.company-name']:
                pattern = rf'({re.escape(tag)}[^{{]*{{[^}}]*font-family\s*:\s*)([^;]+)(;)'
                replacement = rf"\g<1>'{heading_font}', sans-serif\g<3>"
                updated = re.sub(pattern, replacement, updated, flags=re.IGNORECASE)

        # Update body font-family
        if body_font:
            # Update body selector
            pattern = r'(body[^{]*{[^}]*font-family\s*:\s*)([^;]+)(;)'
            replacement = rf"\g<1>'{body_font}', sans-serif\g<3>"
            updated = re.sub(pattern, replacement, updated, flags=re.IGNORECASE)

    return updated


def strip_frontend_editing_scripts(html: str) -> str:
    """
    Remove frontend editing scripts that get injected during live editing.
    These should NOT be saved to the database - they're runtime-only.

    Strips:
    - <!-- NEXTSLIDE EDIT MODE V2 --> markers
    - .ns-image-processing-overlay styles and scripts
    - .ns-placeholder-wrapper styles and scripts
    """
    if not html or not isinstance(html, str):
        return html

    original_len = len(html)
    cleaned = html

    # Remove NEXTSLIDE EDIT MODE markers
    cleaned = cleaned.replace('<!-- NEXTSLIDE EDIT MODE V2 -->', '')

    # Remove ns-image-processing-overlay style+script blocks
    # Pattern: <style>.ns-image-processing-overlay...styles...</style> followed by <script>...overlay code...</script>
    overlay_pattern = re.compile(
        r'<style>\s*\.ns-image-processing-overlay[\s\S]*?</style>\s*'
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-image-processing-overlay[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = overlay_pattern.sub('', cleaned)

    # Remove ns-placeholder-wrapper style+script blocks
    placeholder_pattern = re.compile(
        r'<style>\s*\.ns-placeholder-wrapper[\s\S]*?</style>\s*'
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-placeholder-wrapper[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = placeholder_pattern.sub('', cleaned)

    # Also catch any stray individual blocks that might be duplicated
    # Individual overlay script pattern
    single_overlay_script = re.compile(
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-image-processing-overlay[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = single_overlay_script.sub('', cleaned)

    # Individual placeholder script pattern
    single_placeholder_script = re.compile(
        r'<script>\s*\(function\s*\(\)\s*\{\s*["\']use strict["\'];?\s*'
        r'[\s\S]*?ns-placeholder-wrapper[\s\S]*?</script>',
        re.IGNORECASE
    )
    cleaned = single_placeholder_script.sub('', cleaned)

    # Clean up any leftover orphaned style blocks
    orphan_overlay_style = re.compile(
        r'<style>\s*\.ns-image-processing-overlay[\s\S]*?</style>',
        re.IGNORECASE
    )
    cleaned = orphan_overlay_style.sub('', cleaned)

    orphan_placeholder_style = re.compile(
        r'<style>\s*\.ns-placeholder-wrapper[\s\S]*?</style>',
        re.IGNORECASE
    )
    cleaned = orphan_placeholder_style.sub('', cleaned)

    # Clean up multiple consecutive newlines that might result
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    cleaned = cleaned.strip()

    if len(cleaned) < original_len:
        logger.info(f"[ORCHESTRATOR] Stripped frontend scripts: {original_len} -> {len(cleaned)} chars (saved {original_len - len(cleaned)} bytes)")

    return cleaned

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
- Be conversational and friendly
- ALWAYS speak in PAST TENSE - the edits are already done when user sees your message
- Say "I've enhanced..." "I updated..." "I replaced..." NOT "I'm going to..." or "I'll..."
- NEVER use emojis in your responses
- NEVER say technical terms like "CustomComponent", "HTML", "CSS", "component", "element", "props", "render"
- Instead say "slide", "design", "layout", "style", "section" etc.
- If something is ambiguous, make a reasonable choice and mention it
- Briefly describe what you DID (past tense), not what you WILL do

RULES:
1. Use tools to make changes. Never output raw HTML/code.
2. Be precise - if user says "red", use red (#FF0000 or similar)
3. For creative requests (like "make a slide about X"), use edit_slide or create_slide
4. You can and SHOULD call multiple tools in one response when needed
5. Always provide a conversational response with your tool calls

VISUAL CONTEXT (screenshot attachment):
- A screenshot of the current slide is automatically attached when a slide/component is selected
- USE THIS to understand what the slide currently looks like before making changes
- Especially important for:
  * Fixing issues - see what's actually wrong
  * Major redesigns - understand current layout/design before changing
  * Visual edits - colors, spacing, sizing, positioning
  * Element-specific changes - locate the exact element to modify
- The screenshot shows the REAL rendered state, not just the code

IMAGE REPLACEMENT (search_images):
- For "replace images", "fix images", "new images", "find a different image" → call search_images
- DON'T call view_component first - you can see the slide from the screenshot attachment
- Call search_images ONCE per image you need to replace
- Use image_index (0, 1, 2, ...) to target each image separately

AI IMAGE EDITING (edit_image_with_ai) - VERY SPECIFIC USE CASE:
⚠️ ONLY use edit_image_with_ai when user explicitly asks to MODIFY/EDIT an EXISTING IMAGE with AI:
- "Make this image green" → edit_image_with_ai
- "Remove the background from this image" → edit_image_with_ai
- "Add a gradient to the image" → edit_image_with_ai
- "Make the image look more professional" → edit_image_with_ai

❌ DO NOT use edit_image_with_ai for:
- Replacing images with different ones → use search_images instead
- Changing colors of text/elements → use custom_component_str_replace
- General slide edits → use other tools

⚠️ Each edit_image_with_ai call edits ONE image. Be specific with image_index if multiple images exist.

ANALYZING SLIDES BEFORE COMPLEX EDITS:
- For COMPLEX edits (restructuring, multiple changes), call view_component FIRST to understand the slide
- For SIMPLE edits (single color change, single text edit), you can proceed directly
- Simple = changing ONE thing (color, text, single image)
- Complex = anything involving multiple elements, layout changes, or structural modifications

GENERATING SEARCH QUERIES (KEEP IT SIMPLE):
⚠️ CRITICAL: Use SHORT, SIMPLE queries (2-4 words MAX). Long queries get worse results!

1. QUERY FORMAT:
   - For companies: "[Company] logo" or "[Company] product" (2-3 words)
   - For concepts: "[noun] [adjective]" or "[thing] [setting]" (2-3 words)
   - NEVER use 5+ word queries - they return poor results

2. EXAMPLES:
   ✅ GOOD (short & specific):
   - "Google logo"
   - "YouTube interface"
   - "PayPal app"
   - "LinkedIn profile"
   - "solar panels"
   - "office meeting"

   ❌ BAD (too long):
   - "Google search homepage interface blue colorful tech" → WAY TOO LONG
   - "modern data center server racks blue lighting professional" → VERBOSE
   - "LinkedIn professional network connections business" → WORDY

3. SIMPLE RULE: If your query is more than 4 words, shorten it!

EXAMPLE - "Replace all 4 company images":
Return 4 tool_calls in your response:
  {"tool_name": "search_images", "tool_args": {"query": "Google logo", "image_index": 0}, "summary": "Replace Google image"}
  {"tool_name": "search_images", "tool_args": {"query": "YouTube player", "image_index": 1}, "summary": "Replace YouTube image"}
  {"tool_name": "search_images", "tool_args": {"query": "PayPal app", "image_index": 2}, "summary": "Replace PayPal image"}
  {"tool_name": "search_images", "tool_args": {"query": "LinkedIn profile", "image_index": 3}, "summary": "Replace LinkedIn image"}

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
- custom_component_str_replace: ⭐ PREFERRED - Targeted edit for single changes (logo, color, text, image URL)
- edit_slide: Full rewrite (ONLY for major redesigns, NOT for single fixes)
- create_slide: Create a NEW slide
- delete_slide: Remove a slide
- edit_component: Edit a specific component by ID
- create_component: Add a component to a slide
- delete_component: Remove a component
- apply_theme: Change colors/fonts across deck
- component_prop_update: Mechanical prop update for an existing component
- view_component: Inspect a component BEFORE complex edits
- search_images: Find and REPLACE images with different ones from the web
- edit_image_with_ai: MODIFY an existing image with AI (color changes, effects, background removal)
- linkedin_lookup: Look up professional profiles on LinkedIn (use for @linkedin mentions or people lookup)

@ MENTIONS (INTEGRATION TRIGGERS):
When user includes @integration mentions in their message, use the corresponding tool:
- @linkedin [Name] → Call linkedin_lookup with the person's name AND company if mentioned anywhere
- ALWAYS extract company from context - look for company names mentioned ANYWHERE in the message
- If message mentions a company (e.g., "Caper", "Disney", "Tesla"), pass it as company parameter
- Example: "@linkedin Bob Iger" → linkedin_lookup(name="Bob Iger", company="Disney") // Disney inferred from context
- Example: "@linkedin Ahmed at Anthropic" → linkedin_lookup(name="Ahmed", company="Anthropic")
- CRITICAL: Company helps find the RIGHT person - without it you may get wrong profiles!

MULTIPLE PEOPLE - Call linkedin_lookup ONCE PER PERSON:
- "create team slide with @linkedin Ahmed and @linkedin Jason" → Call linkedin_lookup TWICE (once for Ahmed, once for Jason)
- DO NOT try to combine multiple names in one lookup
- Each lookup will return the best matching profile automatically

⚠️ SELECTED PROFILE - DO NOT SEARCH AGAIN (CRITICAL):
- FIRST CHECK: Does the message contain [SELECTED_LINKEDIN_PROFILE]?
- If YES: The user ALREADY selected a profile from search results
  → DO NOT call linkedin_lookup - you already have the profile data!
  → Extract Name, Title, Company, Photo URL from the [SELECTED_LINKEDIN_PROFILE] block
  → Use this data directly in your create_slide/edit_slide instruction
  → Example: "Create slide with profile: Name=Ahmed Beshry, Title=Co-founder, Company=Caper, Photo=https://..."
- If NO: Then you can call linkedin_lookup to search for profiles

PROFILE SELECTION FLOW:
1. User mentions @linkedin → call linkedin_lookup
2. Profiles are shown to user → WAIT for user to Select or Skip
3. User clicks Select → You receive message with [SELECTED_LINKEDIN_PROFILE] → USE THIS DATA, don't search again
4. User clicks Skip → Continue without profile data

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
   - Apply colors/fonts to standard components in the deck
   - Args: { "instruction": str }
   - NOTE: Does NOT affect CustomComponents - use apply_theme_to_custom_components for those

10b. apply_theme_to_custom_components ⭐ FOR THEME UPDATES ON CUSTOM COMPONENTS
   - Apply theme colors and fonts to ALL CustomComponents in the deck
   - Hotswaps CSS custom properties (--accent, --text, --bg, etc.) and font-family declarations
   - Safe operation - just updates CSS values, doesn't restructure HTML
   - USE THIS when user says "change all colors to X" or "update fonts across the deck"
   - Args: { "colors": optional dict, "typography": optional dict }
   - If no args provided, uses deck's existing theme
   - Example: {"colors": {"accent_1": "#FF0000", "primary_text": "#333333"}}

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

   🎯 KEEP QUERIES SHORT (2-4 words):
   - For companies: "Tesla car", "Microsoft logo", "Amazon warehouse"
   - For concepts: "team meeting", "solar panels", "office workspace"
   - AVOID long queries - they return worse results!

   - Example: {"query": "Apple logo", "image_index": 0}
   - Example: {"query": "Oracle database", "image_index": 1}

15. replace_image
   - Replace an Image component with a specific URL
   - WHEN: After search_images, or when user provides a URL
   - Args: { "component_id": str, "image_url": str, "alt": optional str }

16. edit_image_with_ai ⚠️ SPECIFIC USE CASE - AI IMAGE MODIFICATION
   - ONLY use when user explicitly wants to MODIFY/EDIT an EXISTING IMAGE using AI
   - ✅ USE FOR: "make this image green/blue/red", "remove the background", "add effects"
   - ✅ USE FOR: "make the image look more X", "change image colors", "edit the photo"
   - ❌ DO NOT USE FOR: replacing images (use search_images), changing text colors, general edits
   - Works with BOTH Image components AND images inside CustomComponents
   - Downloads image → AI edits it → uploads new version → replaces URL in HTML
   - Args: { "instruction": str, "image_index": optional int }
   - instruction: What to do to the image (e.g., "change colors to green", "remove background")
   - image_index: REQUIRED if multiple images - which image to edit (0=first, 1=second, etc.)
   - ⚠️ IMPORTANT: Only edits ONE image per call. Use image_index to target specific images.
   - Example: {"instruction": "change the blue colors to green", "image_index": 0}
   - Example: {"instruction": "make it look more vibrant", "image_index": 1}

17. linkedin_lookup ⭐ FOR LINKEDIN/PEOPLE LOOKUP
   - Look up professional profiles using LinkedIn data
   - ✅ USE WHEN: User mentions @linkedin, asks about a person's professional info, or needs presenter/speaker details
   - ✅ USE FOR: "@linkedin John Smith", "find info on Bob Iger", "who is the CEO of Disney"
   - AUTO-SELECTS the best matching profile when there's a clear match (high confidence)
   - For multiple people: Call linkedin_lookup SEPARATELY for each person
   - Returns profile cards with name, title, company, photo, and LinkedIn URL
   - Args: { "name": str, "company": optional str, "title": optional str }
   - name: Person's name to search for (REQUIRED)
   - company: Company name to narrow search (HIGHLY RECOMMENDED - improves match accuracy)
   - title: Job title to narrow search (optional)
   - Example: {"name": "Bob Iger", "company": "Disney"}
   - Example: {"name": "Ahmed Beshry", "company": "Caper"}
   - Example: {"name": "Satya Nadella", "company": "Microsoft", "title": "CEO"}

   ⚠️ IMPORTANT: If [SELECTED_LINKEDIN_PROFILE] is in the message, DON'T call linkedin_lookup - use that data directly!

18. edit_all_slides ⭐ FOR CROSS-SLIDE EDITS
   - Apply the SAME edit to ALL slides in the deck at once
   - ⚠️ ONLY use when user EXPLICITLY mentions cross-slide scope:
     * "all slides", "every slide", "across the deck", "on all pages"
     * "make everything...", "change all...", "update the whole deck"
   - ❌ DO NOT use for single-slide edits (use edit_slide or custom_component_str_replace instead)
   - ✅ USE FOR:
     * "Make all text larger across all slides"
     * "Change the font on every slide"
     * "Update the footer on all slides"
     * "Make all titles blue across the deck"
     * "Increase font size on all slides"
   - Args: { "instruction": str }
   - Example: {"instruction": "Make all titles 20% larger"}
   - Example: {"instruction": "Change all body text to use Inter font"}
   - Example: {"instruction": "Add a page number in the bottom right of every slide"}
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

    def _execute_tool_calls(tool_calls: List[ToolCall]) -> tuple[DeckDiff, List[str], List[Dict[str, Any]], bool]:
        """Execute tool calls and collect any attached observations.

        Returns:
            tuple: (deck_diff, summaries, observations, needs_user_confirmation)
            - needs_user_confirmation: True if we paused for user to select from multiple options
        """
        dd = DeckDiff(DeckDiffBase())
        summaries: List[str] = []
        observations: List[Dict[str, Any]] = []

        # Track accumulated component updates so sequential str_replace ops see previous results
        # Key: component_id, Value: latest props dict (especially 'render' for CustomComponent)
        accumulated_props: Dict[str, Dict[str, Any]] = {}

        # Track integration data from lookup tools to inject into subsequent slide creation
        # Generic structure: { "integration_name": { "type": "profiles|files|items", "data": [...], "source": "..." } }
        # Examples: linkedin -> profiles, figma -> designs, salesforce -> contacts, hubspot -> deals
        integration_context: Dict[str, Dict[str, Any]] = {}

        # SEQUENTIAL LINKEDIN HANDLING: Only allow ONE linkedin_lookup per pass
        # This ensures we handle multiple people one at a time (user selects first person, then we show second)
        linkedin_lookup_executed = False

        for tool_call in tool_calls or []:
            tool_name = tool_call.tool_name
            tool_args = tool_call.tool_args

            # CRITICAL: Only allow linkedin_lookup if @linkedin is explicitly in the message
            # This prevents the LLM from calling LinkedIn lookup without user intent
            if tool_name == "linkedin_lookup":
                # Check if @linkedin is in the original user message (clean_message is available via closure)
                if "@linkedin" not in (clean_message or "").lower():
                    logger.warning(f"[ORCHESTRATOR] ⛔ BLOCKING linkedin_lookup - @linkedin not in message: '{clean_message[:100]}...'")
                    # Skip this tool call entirely
                    continue

                # SEQUENTIAL: Only allow ONE linkedin_lookup per pass
                # If we've already executed one, skip additional ones
                if linkedin_lookup_executed:
                    person_name = tool_args.get("name", "unknown")
                    logger.info(f"[ORCHESTRATOR] ⏭️ DEFERRING linkedin_lookup for '{person_name}' - one lookup already executed this pass")
                    continue

                # Mark that we're executing a linkedin lookup
                linkedin_lookup_executed = True

            # Emit tool start
            if event_cb:
                try:
                    event_cb("agent.tool.start", {"tool": tool_name})
                except Exception:
                    pass

            logger.info(f"[ORCHESTRATOR] 🔧 Executing tool: {tool_name} with args: {list(tool_args.keys())}")

            # INTEGRATION CONFIRMATION: If this is a lookup tool and there are more tools after it,
            # we should pause and wait for user to select a profile before continuing
            # Check if we need to pause for user confirmation
            remaining_tools = tool_calls[tool_calls.index(tool_call) + 1:] if tool_call in tool_calls else []
            needs_confirmation = (
                tool_name in ("linkedin_lookup", "salesforce_lookup", "hubspot_lookup") and
                len(remaining_tools) > 0  # There are more tools to execute after this
            )

            # Inject integration context into slide creation/editing tools
            # This allows data from linkedin_lookup, figma_import, salesforce_search, etc. to be used in slides
            if integration_context and tool_name in ("create_slide", "edit_slide", "custom_component_rewrite"):
                instruction = tool_args.get("instruction", "")
                if instruction:
                    context_blocks = []

                    for integration_name, ctx in integration_context.items():
                        data_type = ctx.get("type", "items")
                        items = ctx.get("data", [])

                        if not items:
                            continue

                        # Format data based on integration type
                        item_lines = []
                        for item in items:
                            if data_type == "profiles":
                                # People/profile data (LinkedIn, Salesforce contacts, etc.)
                                parts = [item.get("name", "Unknown")]
                                if item.get("title"):
                                    parts.append(f"Title: {item['title']}")
                                if item.get("company"):
                                    parts.append(f"Company: {item['company']}")
                                if item.get("photo_url"):
                                    parts.append(f"Photo URL: {item['photo_url']}")
                                if item.get("linkedin_url"):
                                    parts.append(f"LinkedIn: {item['linkedin_url']}")
                                if item.get("email"):
                                    parts.append(f"Email: {item['email']}")
                                item_lines.append(" | ".join(parts))

                            elif data_type == "files" or data_type == "designs":
                                # File/design data (Figma, Google Drive, etc.)
                                parts = [item.get("name", item.get("title", "Untitled"))]
                                if item.get("url"):
                                    parts.append(f"URL: {item['url']}")
                                if item.get("thumbnail_url"):
                                    parts.append(f"Thumbnail: {item['thumbnail_url']}")
                                if item.get("preview_url"):
                                    parts.append(f"Preview: {item['preview_url']}")
                                item_lines.append(" | ".join(parts))

                            else:
                                # Generic items - just dump key fields
                                parts = []
                                for key in ["name", "title", "url", "photo_url", "image_url", "thumbnail_url"]:
                                    if item.get(key):
                                        parts.append(f"{key}: {item[key]}")
                                if parts:
                                    item_lines.append(" | ".join(parts))

                        if item_lines:
                            header = f"[{integration_name.upper()} DATA - USE THESE DETAILS AND URLs IN THE SLIDE]:"
                            context_blocks.append(header + "\n" + "\n".join(item_lines))
                            logger.info(f"[ORCHESTRATOR] 💉 Injected {len(items)} {data_type} from {integration_name} into {tool_name} instruction")

                    if context_blocks:
                        tool_args["instruction"] = instruction + "\n\n" + "\n\n".join(context_blocks)

            # CRITICAL FIX: For tools that modify CustomComponent HTML, use accumulated HTML from previous ops
            # This prevents each operation from reading stale original HTML
            effective_slide = current_slide
            # Tools that modify CustomComponent HTML and should use accumulated state
            html_modifying_tools = {"custom_component_str_replace", "search_images", "custom_component_rewrite", "edit_image_with_ai"}
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
                    event_cb=event_cb,
                )

                # Collect read-only observation payloads (e.g., view_component, integration lookups)
                try:
                    obs = getattr(tool_diff, "observation", None)
                    if isinstance(obs, dict) and obs:
                        observations.append({"tool": tool_name, "data": obs})

                        # Generic integration context collection
                        # Integration tools should return observations with "integration" key
                        # Format: { "integration": "linkedin|figma|salesforce|...", "type": "profiles|files|items", "data": [...] }
                        integration_name = obs.get("integration")
                        if integration_name:
                            integration_context[integration_name] = {
                                "type": obs.get("type", "items"),
                                "data": obs.get("data", []),
                                "source": obs.get("source", "unknown"),
                                "query": obs.get("query", "")
                            }
                            logger.info(f"[ORCHESTRATOR] 📋 Collected {len(obs.get('data', []))} {obs.get('type', 'item')}(s) from {integration_name} for context injection")

                        # Legacy support: handle linkedin_profiles directly (will migrate to generic format)
                        elif "linkedin_profiles" in obs:
                            integration_context["linkedin"] = {
                                "type": "profiles",
                                "data": obs.get("linkedin_profiles", []),
                                "source": obs.get("source", "unknown"),
                                "query": obs.get("query", "")
                            }
                            logger.info(f"[ORCHESTRATOR] 📋 Collected {len(obs.get('linkedin_profiles', []))} LinkedIn profile(s) for context injection")

                        # PAUSE FOR USER CONFIRMATION: Wait for user to select/skip IF we have good matches
                        # If no_confident_match is True, don't pause - let agent respond in chat
                        if needs_confirmation:
                            profile_count = len(obs.get("data", []) or obs.get("linkedin_profiles", []))
                            no_confident_match = obs.get("no_confident_match", False)

                            if profile_count > 0 and not no_confident_match:
                                logger.info(f"[ORCHESTRATOR] ⏸️ PAUSING: Found {profile_count} profile(s), waiting for user to Select or Skip")
                                # Return early with just the lookup results - don't execute remaining tools
                                return dd, summaries, observations, True  # True = needs_user_confirmation
                            elif no_confident_match:
                                logger.info(f"[ORCHESTRATOR] No confident match found, agent will respond in chat")
                            else:
                                logger.info(f"[ORCHESTRATOR] No profiles found, continuing without profile data")
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
                                            # CRITICAL: Clean HTML before accumulating to prevent script buildup
                                            if 'render' in new_props and isinstance(new_props.get('render'), str):
                                                new_props['render'] = strip_frontend_editing_scripts(new_props['render'])
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

        return dd, summaries, observations, False  # False = no user confirmation needed

    # Pass 1: execute initial tool calls
    deck_diff, edit_summaries, observations, needs_user_confirmation = _execute_tool_calls(response.tool_calls)

    # PAUSE FOR USER SELECTION: If we found multiple profiles and need user to pick one
    # Don't emit a message - just return silently and let frontend handle the UX
    # Frontend will show profile cards with Select buttons and a Skip option
    if needs_user_confirmation:
        logger.info(f"[ORCHESTRATOR] ⏸️ Pausing silently - waiting for user to select a profile (or skip)")
        # Return with a special flag so frontend knows to wait for selection
        # NO message emitted - the profile cards ARE the response
        return {
            "deck_diff": deck_diff,
            "edit_summary": "\n".join(edit_summaries),
            "message": "",  # Empty message - profile cards speak for themselves
            "awaiting_selection": True  # Flag for frontend to know we're waiting
        }

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
  → KEEP QUERIES SHORT (2-4 words MAX):
    * For companies: "[Company] logo" or "[Company] product"
    * For concepts: "[noun] [adjective]" like "office meeting" or "solar panels"
    * NEVER use 5+ word queries - they return poor results!
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
                dd2, summaries2, _obs2, _needs_confirm = _execute_tool_calls(followup.tool_calls)
                deck_diff = deck_diff.merge(dd2)
                edit_summaries.extend(summaries2)
                logger.info(f"[ORCHESTRATOR] 🔄 Follow-up complete: {len(summaries2)} summaries, empty_diff={_is_empty_deckdiff(deck_diff)}")
                # Use follow-up message if provided
                followup_msg = getattr(followup, 'message', '') or ''
                if followup_msg:
                    response.message = followup_msg
            else:
                # Log debug info when no tool calls are returned
                obs_str = json.dumps(observations, ensure_ascii=False)
                followup_msg = getattr(followup, 'message', '') or ''
                logger.warning(f"[ORCHESTRATOR] 🔄 Follow-up returned NO tool calls - agent may need more guidance")
                logger.warning(f"[ORCHESTRATOR] 🔄 Observations length: {len(obs_str)} chars, followup message: {followup_msg[:200] if followup_msg else '(empty)'}")
                # Use follow-up message if provided, otherwise ask for clarification
                if followup_msg:
                    response.message = followup_msg
                else:
                    response.message = "I looked at the slide but I'm not sure what specific changes you'd like. Could you tell me more about what you want to change?"
        except Exception as e:
            logger.warning(f"[ORCHESTRATOR] Follow-up after observation failed: {e}")
            import traceback
            logger.warning(traceback.format_exc())

    # Extract the conversational message from the response
    agent_message = getattr(response, 'message', '') or ''

    # CRITICAL: Ensure there's ALWAYS a response message - never leave user hanging
    if not agent_message and not edit_summaries:
        # No tool calls and no message - generate a helpful response
        if _is_empty_deckdiff(deck_diff):
            agent_message = "I'm not sure what changes you'd like me to make. Could you give me more details? For example, you can ask me to change colors, replace images, edit text, or redesign the slide."
        else:
            agent_message = "I've made the requested changes to your slide."
    elif not agent_message and edit_summaries:
        # Tools executed but no message - summarize what was done
        agent_message = f"Done! I've {edit_summaries[0].lower() if edit_summaries else 'updated the slide'}."

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

    # CRITICAL: Clean all HTML in the deck_diff before returning
    # This catches any HTML that bypassed the accumulation path
    deck_diff_data = _clean_deckdiff_html(deck_diff_data)

    return {
        "deck_diff": deck_diff_data,
        "edit_summary": result.get('edit_summary', ''),
        "message": result.get('message', '')
    }


def _clean_deckdiff_html(deck_diff_data) -> Any:
    """
    Recursively clean all 'render' HTML props in a DeckDiff to remove frontend editing scripts.
    Works with both Pydantic models and dicts.
    """
    if deck_diff_data is None:
        return None

    # Convert Pydantic to dict for easier manipulation
    if hasattr(deck_diff_data, 'model_dump'):
        data = deck_diff_data.model_dump()
    elif hasattr(deck_diff_data, 'dict'):
        data = deck_diff_data.dict()
    elif isinstance(deck_diff_data, dict):
        data = deck_diff_data
    else:
        return deck_diff_data

    def clean_components(components_list):
        if not components_list or not isinstance(components_list, list):
            return components_list
        for comp in components_list:
            if isinstance(comp, dict):
                props = comp.get('props')
                if isinstance(props, dict) and 'render' in props:
                    if isinstance(props['render'], str):
                        props['render'] = strip_frontend_editing_scripts(props['render'])
        return components_list

    def clean_slide_diff(slide_diff):
        if not isinstance(slide_diff, dict):
            return slide_diff
        # Clean components_to_update
        if 'components_to_update' in slide_diff:
            clean_components(slide_diff['components_to_update'])
        # Clean components_to_add
        if 'components_to_add' in slide_diff:
            clean_components(slide_diff['components_to_add'])
        return slide_diff

    # Clean slides_to_update
    if 'slides_to_update' in data and isinstance(data['slides_to_update'], list):
        for slide_diff in data['slides_to_update']:
            clean_slide_diff(slide_diff)

    # Clean slides_to_add (full slides with components)
    if 'slides_to_add' in data and isinstance(data['slides_to_add'], list):
        for slide in data['slides_to_add']:
            if isinstance(slide, dict) and 'components' in slide:
                clean_components(slide['components'])

    return data
