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
import os
from pydantic import BaseModel, Field, create_model
import logging
import uuid
from datetime import datetime, timezone

import re

# Debug mode - set to True to save HTML/screenshots to /tmp for debugging
DEBUG_SAVE_FILES = os.environ.get("DEBUG_SLIDE_EDIT", "").lower() == "true"

from models.deck import DeckDiff, DeckDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK, GEMINI_3_FLASH, GEMINI_3_PRO, MODEL_SMART, EDIT_TYPE_MODELS, USE_AGENTS_MD, AGENT_MODEL
from services.context_cache import get_deck_context_snapshot
from utils.summaries import summarize_chat_history
from agents.editing.tools.code_verifier import verify_interactive_code, create_verification_context
from agents.editing.tool_descriptions import TOOL_DESCRIPTIONS_MAP

if not USE_AGENTS_MD:
    from agents.editing.skill_prompts import get_skill_prompt, get_skill_tools, BASE_SYSTEM_PROMPT

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# HTML UTILITIES - Imported from tools/html_utils.py
# Re-exported here for backwards compatibility
# ═══════════════════════════════════════════════════════════════════════════════

from agents.editing.tools.html_utils import (
    apply_theme_to_custom_component_html,
    strip_frontend_editing_scripts,
)

# region agent log
def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
    """Debug logger - only writes if DEBUG_SAVE_FILES is enabled."""
    if not DEBUG_SAVE_FILES:
        return
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
        with open("/tmp/orchestrator_debug.log", "a", encoding="utf-8") as f:
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


def _current_date_str() -> str:
    """Return current date in UTC for prompt grounding."""
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")




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
5. Always provide a conversational response in your message field
6. For CHAT-ONLY messages (questions, thanks, acknowledgments, ideas, brainstorming), respond with JUST a message and NO tool_calls
   - "What do you think about..." → chat only, no tools
   - "Tell me more about..." → chat only, no tools
   - "Thanks!" or "Perfect!" → chat only, no tools
   - "I'm not sure what to do with this slide" → chat only, offer suggestions
7. ⚠️ CRITICAL: Always edit the CURRENT SLIDE (shown in context) unless user explicitly names a different slide
   - The CURRENT SLIDE ID is provided in the context - USE IT for all tool calls
   - Never assume or pick a different slide - the user is viewing and expects changes on the current one
   - If user says "this slide" or just describes an edit, apply it to the CURRENT SLIDE

DATA ACCURACY:
- If user asks for "latest", "current", "most recent", or "as of" data, you MUST call web_search first
- Use ONLY numbers from research results; do not guess or use stale seasons/years
- If research is missing required metrics, ask a clarifying question or run another web_search
- Use the CURRENT DATE (UTC) provided in context when interpreting "latest/current"
- When user asks for "latest/current", include the CURRENT DATE in the web_search query (e.g., "as of 2025-12-21")
- Do NOT include a specific year/season in a web_search query unless the user explicitly asks for that year/season
- Ignore any season/year mentioned in earlier assistant messages or slide text if it conflicts with the CURRENT DATE and the user asked for "latest/current"

CONVERSATION CONTINUITY (RECENT CHAT):
- The RECENT CHAT section shows the last few messages in this conversation
- USE THIS to understand vague or contextual references like:
  * "make it bigger" → what did you just edit? Make THAT bigger
  * "actually, use blue instead" → change the color you just set to blue
  * "do the same for the other one" → repeat the last action on another element
  * "undo that" or "go back" → revert the last change you made
  * "yes" or "perfect" → user is happy, no action needed - just acknowledge
  * "no" or "not that" → user wants something different, ask for clarification
- If the user's message is vague but chat history provides context, USE that context
- If still unclear after checking history, ask a clarifying question instead of guessing wrong
- Continue the conversation naturally - you're having an ongoing dialogue, not isolated requests

⚠️ HANDLING FOLLOW-UP COMPLAINTS ("it doesn't work", "can't click", "buttons don't work"):
When user says something "doesn't work", "can't click", or "isn't working":
1. CHECK RECENT CHAT to understand what "it" or "they" refers to
2. LOOK AT THE SCREENSHOT to see the current state
3. USE custom_component_rewrite to fix - it will regenerate with proper interactivity
4. In your instruction to custom_component_rewrite, TELL IT what to fix specifically

⚠️ CSS ISSUES THAT BREAK CLICKS (diagnose these in the HTML via view_component):
When buttons/tabs visually appear but don't respond to clicks, the cause is almost always CSS, NOT JavaScript. Look for these in the HTML:
- DECORATIVE OVERLAYS BLOCKING CLICKS: Any element with position:absolute that does NOT have pointer-events:none will block clicks on elements behind it. Look for: fog layers, gradient overlays, corner decorations, watermarks, paperclips, stamps, texture overlays, ribbons
- INVERTED Z-INDEX: If a content panel has HIGHER z-index than the buttons/tabs above it, the panel steals clicks. Buttons/tabs should ALWAYS have the highest z-index (9999)
- transform:translateX/translateY ON HOVER: This moves buttons out from under the cursor causing a jitter loop that makes clicking impossible
- clip-path ON BUTTONS: Clips the clickable hit area so parts of the button can't be clicked
- user-select:none ON * OR body: Can interfere with click handling
- Elements with NEGATIVE top/left (e.g. top:-20px) that extend into button/tab areas without pointer-events:none

5. COMMON FIXES for "buttons don't work":
   - Add pointer-events:none to ALL decorative/absolute-positioned non-interactive elements
   - Set z-index:9999 on button/tab containers
   - Remove transform:translateX/translateY from hover states
   - Remove clip-path from interactive elements
   - Remove user-select:none from universal selectors
   - Ensure the DOM elements exist when the script runs (use DOMContentLoaded)
   - Make sure button IDs match what the JavaScript is selecting
6. When fixing, be SPECIFIC about what you're changing - don't just say "fixed it"
   - Say: "I fixed the click handling - decorative overlays were blocking the buttons. I've added pointer-events:none to all decorative elements and set the button container to z-index:9999"

VISUAL CONTEXT (screenshot + HTML):
- For complex/visual requests, a screenshot of the current slide is included as an image
- USE THIS to see what the slide ACTUALLY looks like before making changes
- You can SEE: colors, layout, spacing, text rendering, images, icons, positioning
- The screenshot shows the REAL rendered state (not just code/data)

UPLOADED FILES (attachments):
- If the user explicitly asks to use uploaded images, you MUST place them in the slide
- Use attachment URLs from the ATTACHMENTS list in context
- Recommended tools: create_component (Image) for exact placement, or edit_slide/custom_component_rewrite when redesigning
- When using edit_slide/create_slide/custom_component_rewrite for uploads, set use_attachments: true in tool_args
- If the user says files are for reference only, do not insert them

IMAGE REPLACEMENT (search_images):
- For "replace images", "fix images", "new images", "find a different image" → call search_images
- DON'T call view_component first - you can see the slide from the screenshot (if included)
- Call search_images ONCE per image you need to replace

⚠️ JAVASCRIPT-MANAGED IMAGES - DO NOT USE search_images:
If the HTML contains template variables like `${item.imageAlt}`, `${item.image}`, or JavaScript arrays with image data:
- This means images are DYNAMICALLY MANAGED by JavaScript, not static img tags
- search_images will only find ONE img element and replace it repeatedly (wrong!)
- USE custom_component_rewrite instead with instruction like "fix the images for each section"
- The rewrite will properly search for ALL needed images and wire them into the JavaScript

⚠️ EXCEPTION for multi-image interactive scenarios:
When MULTIPLE sections/tabs/buttons each need their own image:
  → DO NOT use search_images multiple times (it just replaces the same element)
  → USE custom_component_rewrite with a clear instruction about what each element needs

⚠️ AMBIGUOUS ELEMENT REFERENCES - ASK FOR CLARIFICATION:
When the user says "this button", "this one", "add image here", or similar vague references:
1. LOOK at the screenshot to count how many similar elements exist
2. If there are MULTIPLE similar elements (e.g., 4 buttons, 3 image placeholders):
   → DO NOT guess which one they mean
   → ASK the user: "I see [N] similar [elements] on this slide. Could you describe which one you mean? For example: the first one on the left, the one with [specific text], or the one at the bottom."
3. Only proceed when the user's description uniquely identifies ONE element:
   - Position: "top left", "first one", "third from left"
   - Content: "the one that says 'Subscribe'", "the button with the arrow"
   - Context: "the one next to the logo", "under the title"

🎯 HOW TO IDENTIFY WHICH IMAGE (use screenshot!):
- LOOK at the screenshot to COUNT images/buttons/elements in READING ORDER (left-to-right, top-to-bottom)
- Images are 0-indexed: first=0, second=1, third=2, etc.

COUNTING EXAMPLES from screenshot:
  [Image 0] [Image 1] [Image 2]   ← Row 1: positions 0, 1, 2
  [Image 3] [Image 4] [Image 5]   ← Row 2: positions 3, 4, 5

HOW TO TARGET SPECIFIC IMAGES:
1. User provides POSITION ("first image", "third button", "2nd from left"):
   → Convert to 0-indexed: 1st=0, 2nd=1, 3rd=2
   → Use image_index=N

2. User provides VISUAL description ("the older woman", "guy in blue shirt"):
   → LOOK at screenshot, identify the element visually
   → COUNT its position (0-indexed)
   → Use image_index=N

3. User provides CONTENT description ("the logo", "hero image", "the Costco one"):
   → Use target_image="description" - let LLM match by content

EXAMPLE: Slide has 6 headshots in 2 rows:
- User: "replace the older woman's photo" (she's top-left)
  → You see her in position 0 on screenshot
  → Use: {"query": "professional headshot", "image_index": 0}

- User: "change the third image"
  → 3rd = position 2
  → Use: {"query": "...", "image_index": 2}

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

EXAMPLE - "Replace all 4 company images" or "logos next to Costco, Sephora, Aldi":
Return one tool_call PER company/image - use target_image to specify WHICH logo to replace:
  {"tool_name": "search_images", "tool_args": {"query": "Costco logo", "target_image": "Costco"}, "summary": "Replace Costco logo"}
  {"tool_name": "search_images", "tool_args": {"query": "Sephora logo", "target_image": "Sephora"}, "summary": "Replace Sephora logo"}
  {"tool_name": "search_images", "tool_args": {"query": "Aldi logo", "target_image": "Aldi"}, "summary": "Replace Aldi logo"}
The target_image parameter tells the tool which image to replace (matches by nearby text/company name).
The query parameter is what to search for (the replacement image).

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

⚠️ CONTENT IMPROVEMENT FLOW (CRITICAL - FOLLOW THIS EXACTLY):

When user asks to "improve", "update", "replace", or "fix" CONTENT (text, statistics, facts):
1. FIRST: If the user provides a URL or site-specific request, call deep_extract
2. OTHERWISE: Call web_search to get real, current data
3. THEN: Choose the right tool based on user intent:
   - "update the stats" / "fix the numbers" → custom_component_str_replace (text edit only)
   - "rewrite this slide with real data" / "redesign with accurate info" → edit_slide (full rewrite OK)
4. DEFAULT to str_replace unless user explicitly wants a redesign

Examples - TEXT EDIT (use str_replace):
- "improve the statistics" → web_search → str_replace
- "update the market data" → web_search → str_replace
- "fix the numbers" → web_search → str_replace
- "make the content more accurate" → web_search → str_replace

Examples - FULL REWRITE OK (use edit_slide):
- "rewrite this slide with real data" → web_search → edit_slide
- "redesign this with accurate stats" → web_search → edit_slide
- "rebuild the content section" → web_search → edit_slide

⚠️ VIDEO REQUEST FLOW (CRITICAL):
When the user asks to use a video from a website or mentions a domain/URL:
1. FIRST: Call deep_extract with include_videos: true and the provided URL/domain
2. THEN: Use edit_slide or custom_component_rewrite to embed the video
3. If videos are available, embed the first one (prefer embed_url if present)

⚠️ NEW SLIDE CREATION FLOW:

When user asks to CREATE A NEW SLIDE with factual content:
1. FIRST: If a URL/domain is provided, call deep_extract for site-specific data
2. OTHERWISE: Call web_search IF the topic needs current data (company info, statistics, market data, etc.)
3. THEN: Call create_slide - the research data will automatically be injected

Examples - NEEDS RESEARCH:
- "Create a slide about Tesla's Q4 earnings" → web_search("Tesla Q4 earnings revenue as of today") → create_slide
- "Add a slide about AI market trends" → web_search("AI market size growth current") → create_slide
- "Make a slide about Apple's product lineup" → web_search("Apple current products") → create_slide

Examples - NO RESEARCH NEEDED (simple slides):
- "Add a title slide" → create_slide directly
- "Create an agenda slide" → create_slide directly
- "Add a thank you slide" → create_slide directly
- "Make a team intro slide" → create_slide directly (unless specific people need research)

WHEN TO USE EACH TOOL:

custom_component_str_replace (SURGICAL - PREFERRED for single changes):
- ONE text change, ONE color, ONE URL, ONE image
- Pass a clear instruction describing what to change
- The tool will find and replace the right CSS/HTML automatically

⚠️ DO NOT use custom_component_str_replace for:
- JavaScript logic changes (use custom_component_rewrite instead)
- Changes affecting multiple elements at once (use edit_slide or custom_component_rewrite)
- Interactive behavior fixes ("make buttons work", "fix click handlers")
- Structural changes to HTML layout

custom_component_rewrite (FOR COMPLEX CHANGES):
- JavaScript/interactive behavior fixes
- Changes affecting multiple elements
- Complex logic updates ("each button shows different image")
- Restructuring HTML layout
- Full slide redesigns

⚠️ MULTI-IMAGE INTERACTIVE SCENARIOS - USE custom_component_rewrite, NOT search_images:
When the user wants MULTIPLE images to be associated with buttons/tabs (e.g., "each button shows its own image"):
- ❌ DO NOT call search_images multiple times - this just replaces the SAME image element repeatedly
- ✅ USE custom_component_rewrite with instruction explaining the requirement
- The rewrite will pre-search all needed images and wire them up correctly in JavaScript
- Example: "fix the buttons so each club (lob wedge, driver, etc.) shows its own image when clicked"
  → custom_component_rewrite(instruction="Fix buttons so each golf club shows its respective image when clicked")

edit_slide (FULL REWRITE - only when necessary):
- User explicitly wants redesign/rebrand/overhaul
- User wants to change the overall theme/style
- User wants to add/remove MULTIPLE elements
- Slide is empty and needs content
- User says: "redesign", "redo", "rebuild", "from scratch", "rewrite"
- ✅ OK after web_search IF user wants full rewrite (e.g., "rewrite with real data")

deep_extract (SITE-SPECIFIC DATA):
- User provides a URL or domain to pull data from
- Multi-page extraction: case studies, customers, pricing, investors, videos
- Use before edit_slide/create_slide when content depends on a specific site

STAY ON THEME (CRITICAL):
- ALWAYS check the 🎨 DECK THEME section in context for colors and typography
- Use those EXACT colors/fonts in any generated content
- When editing or creating, preserve the existing design language
- Only change theme colors if user EXPLICITLY asks to change them
- If user says "make it red", apply red while keeping other theme elements

⚡ GLOBAL STYLE CHANGES (FONTS, COLORS, THEME) - AUTO-APPLY TO ALL SLIDES:

When user asks about fonts, colors, or theme changes WITHOUT specifying a single slide, ALWAYS apply to ALL slides:
- "Change the font" / "Use Poppins" / "Make the fonts bigger" → apply_theme_to_custom_components (ALL slides)
- "Change the colors" / "Use blue theme" / "Make it darker" → apply_theme_to_custom_components (ALL slides)
- "Update the theme" / "Change the style" / "Make it more professional" → apply_theme_to_custom_components (ALL slides)

⚠️ CRITICAL: User does NOT need to say "all slides" - font/color/theme requests are GLOBAL by default!

How to use apply_theme_to_custom_components:
- For font changes: {"typography": {"heading": {"family": "Poppins"}, "body": {"family": "Inter"}}}
- For color changes: {"colors": {"accent_1": "#FF5733", "primary_text": "#1A1A1A", "primary_background": "#FFFFFF"}}
- For both: include both typography and colors in the args

This tool updates CSS variables in :root across ALL slides, making changes instant and consistent.

ONLY use custom_component_str_replace for font/color when user explicitly targets ONE element:
- "Make THIS title red" → str_replace on current slide
- "Change the font on slide 3 only" → str_replace on that slide

TOOL SELECTION:
- apply_theme_to_custom_components: 🎨 GLOBAL STYLE - For font/color/theme changes across entire deck
- custom_component_str_replace: ⭐ PREFERRED - Targeted edit for single changes (logo, color, text, image URL)
- edit_slide: Full rewrite (ONLY for major redesigns, NOT for single fixes)
- create_slide: Create a NEW slide
- delete_slide: Remove a slide
- edit_component: Edit a specific component by ID
- create_component: Add a component to a slide
- delete_component: Remove a component
- apply_theme: Change colors/fonts across deck (alternative to apply_theme_to_custom_components)
- component_prop_update: Mechanical prop update for an existing component
- view_component: Inspect a component BEFORE complex edits
- search_images: Find and REPLACE images with different ones from the web
- edit_image_with_ai: MODIFY an existing image with AI (color changes, effects, background removal)
- deep_extract: Pull site-specific data from URLs or multi-page sites (case studies, pricing, videos)
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

NOTE: For complex/visual requests, a screenshot is included as vision content - USE IT to see the slide!
"""


# ═══════════════════════════════════════════════════════════════════════════════
# AGENTS.MD PROMPT - Compressed single-prompt architecture
# Replaces classifier + 11 skill prompts + per-skill model routing
# One model, one LLM call, full context always present
# ═══════════════════════════════════════════════════════════════════════════════

AGENTS_MD_PROMPT = """You are a slide deck design assistant. Speak in PAST TENSE ("I updated...", "I replaced..."). No emojis. No technical terms (HTML, CSS, component, props, render). Say "slide", "design", "layout", "style" instead.

DEFAULT: EDIT IN PLACE. Use str_replace DIRECT to surgically modify existing content.
Only use edit_slide/custom_component_rewrite when user explicitly says "redesign", "rebuild", "redo", "from scratch", or the change requires JS logic fixes.

TOOL MATRIX (request pattern → tool → key args):
(str_replace = custom_component_str_replace tool)
text/typo/wording              → custom_component_str_replace DIRECT → old_string, new_string
color/style/spacing            → custom_component_str_replace DIRECT → old_string, new_string
visibility/contrast/can't see  → custom_component_str_replace DIRECT → old_string, new_string (fix the color value)
add/remove CSS property        → custom_component_str_replace DIRECT → old_string, new_string
font THIS slide only           → component_prop_update    → overrideBodyFont, overrideHeroFont
font/color ALL slides          → apply_theme_to_custom_components → typography, colors
JS logic/event handlers broken → custom_component_rewrite → instruction (ONLY for JS logic bugs)
redesign/rebuild/redo          → edit_slide               → instruction (ONLY when user asks to recreate)
new slide                      → create_slide             → instruction, insert_after (= current slide ID)
replace image                  → search_images            → query (2-4 words), image_index OR target_image
AI edit image                  → edit_image_with_ai       → instruction, image_index
data/stats needed              → web_search THEN custom_component_str_replace (NOT edit_slide unless user says rewrite)
site-specific URL              → deep_extract THEN custom_component_str_replace or edit tool
@linkedin Name                 → linkedin_lookup          → name, company
edit ALL slides                → edit_all_slides          → instruction
improve/make better/enhance    → custom_component_rewrite → instruction (rewrite the selected block with improvements)
delete slide                   → delete_slide             → slide_id
duplicate slide                → duplicate_slide          → slide_id
chat/question/thanks           → NO tools, message only (ONLY when nothing is selected)

DIRECT EDIT MODE (REQUIRED when SLIDE HTML is in context):
  Pass old_string and new_string with EXACT text from the HTML. Examples:
  color:       old_string="color: #FF0000"           new_string="color: #0066CC"
  visibility:  old_string="color: #1a1a2e"           new_string="color: #FFFFFF"  (light text on dark bg)
  text:        old_string=">Old Title<"               new_string=">New Title<"
  css add:     old_string=".overlay {"                 new_string=".overlay { pointer-events: none;"
  svg:         old_string=".vector-arrow {"            new_string=".vector-arrow { transform: scale(0.7); transform-origin: center;"

  For MULTIPLE changes: emit MULTIPLE tool_calls, each with its own old_string/new_string.
  Example "make all unselected text white": one tool_call per CSS rule that sets the text color.

  DIRECT mode = instant (string replacement, no LLM call). instruction mode = slow (needs extra LLM call, can fail).
  ONLY use instruction mode when SLIDE HTML is NOT present in the context.

  WARNING: custom_component_rewrite REGENERATES THE ENTIRE SLIDE from scratch (slow, loses layout).
  NEVER use it for color, text, visibility, spacing, or CSS changes. Those are ALL str_replace DIRECT.

CSS FIX PATTERNS (buttons/clicks broken):
  - Decorative overlays blocking clicks → add pointer-events:none
  - Low z-index on buttons → set z-index:9999 on button containers
  - Jitter on hover → remove transform:translate from :hover
  - Clipped hit area → remove clip-path from interactive elements

RULES:
1. Tools only - never output raw code
2. Current slide ID from context unless user says otherwise
3. Past tense responses always
4. EDIT, DON'T REPLACE. Always use str_replace DIRECT to modify the specific thing the user asked about. Do NOT use edit_slide or custom_component_rewrite unless user explicitly asks to redesign/rebuild/redo or the fix requires JS logic changes. "Make the title red" = str_replace the color value. "Add a border" = str_replace to insert the CSS. "Fix the text" = str_replace the text. Never rewrite the whole slide for a surgical change.
5. SELECTION = ALWAYS EDIT. When the user has selected an element (🎯 SELECTED in context), you MUST make an edit — never respond with chat only. Even vague requests like "make this better", "improve this", "fix this", "enhance this" should trigger an edit on the selected block. Use custom_component_rewrite with a clear instruction to improve the selected element's design, content, and visual quality. The user clicked on it for a reason — act on it.
6. Chat-only messages (thanks, questions, ideas with NO selection) → message only, NO tool_calls
7. Research before factual content - call web_search first, use ONLY those numbers
8. Short image queries: 2-4 words max ("Tesla logo", "office meeting")
9. Canvas: 1920x1080, origin top-left
10. Multiple tools OK in one response
11. Preserve theme unless user asks to change it
12. Font/color requests without "this slide" → apply_theme_to_custom_components (global)
13. Follow-up complaints → check chat history first. "can't see"/"invisible"/"contrast" = str_replace DIRECT to fix color. "can't click"/"buttons broken"/"doesn't respond" = custom_component_rewrite (JS logic only)
14. For "latest/current" data requests, include current date in web_search query
15. Do NOT add a specific year/season unless user explicitly says one

ATTACHMENTS: If user uploaded files and asks to use them, set use_attachments:true in tool args. If reference only, don't insert.

@LINKEDIN: Only call linkedin_lookup when @linkedin is explicitly in the message. Pass company from context. One lookup per person. If [SELECTED_LINKEDIN_PROFILE] is in message, use that data directly - do NOT search again.

IMAGE TARGETING (use screenshot to count):
  Position: "first image" → image_index=0, "third" → image_index=2
  Visual: Look at screenshot, count position, use image_index
  Content: "the logo" → target_image="logo"
  Multiple replacements: use target_image (stable) not image_index (shifts)
  JS-managed images (template vars like ${item.image}): use custom_component_rewrite, NOT search_images

AMBIGUOUS REFERENCES: If user says "this one" and multiple similar elements exist, ask for clarification.

VIDEO REQUESTS: If user mentions video + URL → deep_extract with include_videos:true, then embed.

NEW SLIDE WITH DATA: web_search first if factual content needed, then create_slide. Simple slides (title, agenda, thanks) → create_slide directly.

CONTENT IMPROVEMENT: web_search → ALWAYS default to str_replace DIRECT to swap in the new data. Only use edit_slide if user explicitly says "rewrite"/"redesign"/"rebuild". Updating stats or text = str_replace, NOT a full slide rewrite.

VISUAL CONTEXT: Screenshot shows real rendered state. Use it to identify elements, count images, see colors/layout.

CONVERSATION CONTINUITY: Check RECENT CHAT for context on vague references ("make it bigger" = what you just edited). Continue dialogue naturally.
"""


TOOLS_REFERENCE = """TOOLS REFERENCE (args only):

custom_component_str_replace:
  DIRECT (ALWAYS USE THIS when HTML is in context - instant, no extra LLM call):
    { slide_id, component_id, old_string, new_string }
  INSTRUCTION (ONLY when HTML is NOT in context - slower, needs extra LLM call):
    { slide_id, component_id, instruction }

custom_component_rewrite: { slide_id, component_id, instruction }
edit_slide: { slide_id, instruction, use_attachments? }
create_slide: { instruction, insert_after }
delete_slide: { slide_id }
duplicate_slide: { slide_id, insert_after? }
reorder_slides: { slide_id, new_index } OR { slide_order: [ids] }
edit_all_slides: { instruction }
edit_component: { slide_id, component_id, instruction }
create_component: { slide_id, component_type, instruction }
delete_component: { slide_id, component_id }
apply_theme: { instruction }
apply_theme_to_custom_components: { colors?, typography? }
  colors: { accent_1, primary_text, primary_background, ... }
  typography: { heading: { family }, body: { family } }
component_prop_update: { slide_id, component_id, updates: { overrideBodyFont?, overrideHeroFont?, ... } }
view_component: { slide_id, component_id }
view_slide: { slide_id }
search_images: { query, image_index?, target_image? }
replace_image: { image_url, image_index?, old_url? }
edit_image_with_ai: { instruction, image_index? }
web_search: { query }
deep_extract: { query, url?, urls?, include_videos?, schema? }
linkedin_lookup: { name, company?, title? }
"""


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL CALL MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ToolCall(BaseModel):
    """A single tool invocation from the LLM."""
    tool_name: str = Field(description="Name of the tool to call")
    tool_args: Dict[str, Any] = Field(description="Arguments for the tool")
    summary: str = Field(default="", description="Brief description of what this edit does")


class OrchestratorResponse(BaseModel):
    """LLM response containing tool calls and conversational message."""
    tool_calls: List[ToolCall] = Field(default=[], description="List of tools to execute (can be empty for chat-only responses)")
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


_VIDEO_KEYWORDS = ("video", "demo", "footage", "clip", "mp4", "webm", "vimeo", "youtube", "wistia", "loom", "mux")


def _looks_like_url_or_domain(text: str) -> bool:
    if not text:
        return False
    if re.search(r'https?://\S+', text, re.IGNORECASE):
        return True
    return bool(re.search(r'\b[a-z0-9.-]+\.[a-z]{2,}\b', text, re.IGNORECASE))


def _should_hint_video_extract(text: str) -> bool:
    lower = (text or "").lower()
    if not any(k in lower for k in _VIDEO_KEYWORDS):
        return False
    return _looks_like_url_or_domain(text)


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
    """Build comprehensive context for LLM - includes deck overview, outline, and full presentation understanding."""

    # Current slide info
    slide_id = _get_attr(current_slide, 'id', 'unknown')
    components = _get_attr(current_slide, 'components', []) or []

    # ══════════════════════════════════════════════════════════════════════
    # PRESENTATION OVERVIEW (gives assistant full understanding like Claude Code)
    # ══════════════════════════════════════════════════════════════════════
    deck_name = _get_attr(deck_data, 'name', 'Untitled Presentation')
    all_slides = _get_attr(deck_data, 'slides', []) or []
    outline = _get_attr(deck_data, 'outline', {}) or {}

    # Build presentation overview
    overview_lines = [f"📊 PRESENTATION: {deck_name}"]
    overview_lines.append(f"   Total slides: {len(all_slides)}")

    # Find current slide position
    current_slide_idx = -1
    for i, s in enumerate(all_slides):
        if _get_attr(s, 'id') == slide_id:
            current_slide_idx = i
            break
    if current_slide_idx >= 0:
        overview_lines.append(f"   Viewing: Slide {current_slide_idx + 1} of {len(all_slides)}")

    # Add outline if available (gives the assistant understanding of presentation flow)
    if outline:
        outline_title = outline.get('title', '')
        outline_slides = outline.get('slides', [])
        if outline_title or outline_slides:
            overview_lines.append(f"\n📝 OUTLINE (presentation structure):")
            if outline_title:
                overview_lines.append(f"   Topic: {outline_title}")
            if outline_slides:
                for i, slide_outline in enumerate(outline_slides[:15]):  # Max 15 for context window
                    slide_title = slide_outline.get('title', f'Slide {i+1}')
                    slide_points = slide_outline.get('talking_points', []) or slide_outline.get('points', [])
                    marker = "→ " if i == current_slide_idx else "  "
                    overview_lines.append(f"   {marker}{i+1}. {slide_title[:60]}")
                    # Show first 2 talking points for current slide
                    if i == current_slide_idx and slide_points:
                        for pt in slide_points[:2]:
                            pt_text = pt if isinstance(pt, str) else pt.get('point', str(pt))
                            overview_lines.append(f"        • {str(pt_text)[:80]}")
                if len(outline_slides) > 15:
                    overview_lines.append(f"   ... and {len(outline_slides) - 15} more slides")

    # Build slide overview (quick reference for all slides)
    overview_lines.append(f"\n📑 ALL SLIDES (quick reference):")
    for i, s in enumerate(all_slides[:20]):  # Max 20 for context
        s_id = _get_attr(s, 'id', f'slide-{i}')
        s_comps = _get_attr(s, 'components', []) or []
        # Try to extract title from first text component
        s_title = ""
        for c in s_comps:
            if _get_attr(c, 'type') in ['TiptapTextBlock', 'Text', 'CustomComponent']:
                props = _get_attr(c, 'props', {}) or {}
                text = props.get('text', '') or props.get('content', '') if isinstance(props, dict) else getattr(props, 'text', '')
                if text and len(str(text)) > 3:
                    # Strip HTML tags for display
                    import re
                    clean_text = re.sub(r'<[^>]+>', '', str(text))[:50]
                    if clean_text.strip():
                        s_title = clean_text.strip()
                        break
        marker = "→ " if s_id == slide_id else "  "
        s_title_display = f": {s_title}" if s_title else ""
        overview_lines.append(f"   {marker}{i+1}. [{s_id[:20]}]{s_title_display}")

    if len(all_slides) > 20:
        overview_lines.append(f"   ... and {len(all_slides) - 20} more slides")

    presentation_overview = "\n".join(overview_lines) + "\n\n"

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

    current_date_line = (
        f"CURRENT DATE (UTC): {_current_date_str()}\n"
        f"RECENCY RULE: If the user asks for latest/current data, treat this date as 'today' and do not reuse older season/year text unless the user explicitly requests it."
    )

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
                        full_html_str = f"\n\n📄 SELECTED COMPONENT FULL HTML (component_id={cid}):\n```html\n{full_html}\n```\n⚠️ For targeted edits, use custom_component_str_replace with EXACT old_string/new_string from this HTML."
                elif ctype2 == "TiptapTextBlock":
                    t = props.get("text") if isinstance(props, dict) else getattr(props, "text", "")
                    preview = f" (text preview: {str(t)[:120]}...)"
                sel_lines.append(f"  - {ctype2} [{cid}] on slide {sid or slide_id}{preview}")
            else:
                sel_lines.append(f"  - Selection: {cid} ({ctype or 'Unknown'})@{sid or slide_id}")
        if sel_lines:
            sel_str = "\n\n🎯 SELECTED (user refers to this as 'this'):\n" + "\n".join(sel_lines) + full_html_str

    # If no selection but slide has CustomComponent, include ALL CustomComponent HTMLs (budget: 40k chars)
    if not full_html_str and has_custom:
        html_parts = []
        html_budget = 40000
        html_used = 0
        for c in components:
            if _get_attr(c, 'type') == 'CustomComponent':
                cid = _get_attr(c, 'id', 'no-id')
                props = _get_attr(c, 'props', {}) or {}
                if isinstance(props, dict):
                    full_html = str(props.get("render", ""))
                else:
                    full_html = str(getattr(props, "render", ""))
                if full_html:
                    if html_used + len(full_html) > html_budget:
                        html_parts.append(f"\n(remaining components omitted - budget exceeded)")
                        break
                    html_parts.append(f"\n\nSLIDE HTML (component_id={cid}, use for DIRECT old_string/new_string edits):\n```html\n{full_html}\n```")
                    html_used += len(full_html)
        if html_parts:
            full_html_str = "".join(html_parts)

    # Attachments
    att_str = ""
    if attachments:
        att_list = [f"  - {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_str = f"\n\nATTACHMENTS (user uploaded):\n" + "\n".join(att_list)

    # Chat history
    history_str = ""
    if chat_history:
        recent = chat_history[-10:]  # Last 10 messages
        # Handle both dict and Pydantic ChatMessage objects
        def get_msg_field(m, field, default=''):
            if hasattr(m, field):
                return getattr(m, field, default)
            elif isinstance(m, dict):
                return m.get(field, default)
            return default
        history_lines = [f"  {get_msg_field(m, 'role', 'user')}: {str(get_msg_field(m, 'content', ''))[:250]}" for m in recent]
        history_str = f"\n\nRECENT CHAT:\n" + "\n".join(history_lines)

    # If we have full HTML but no selection string to attach it to, add it separately
    html_context_str = full_html_str if (full_html_str and not sel_str) else ""

    context = f"""{presentation_overview}{theme_str}{current_date_line}

═══════════════════════════════════════════════════════════════════════
CURRENT SLIDE DETAILS (slide_id: {slide_id})
═══════════════════════════════════════════════════════════════════════
STATUS: {slide_status}

COMPONENTS:
{components_str}{sel_str}{html_context_str}{att_str}{history_str}"""
    _dbg("A", "orchestrator_v2.py:build_context", "built_context", {"slide_id": slide_id, "has_selections": bool(selections), "selection_count": len(selections or []), "context_len": len(context)}, runId="pre-fix")
    return context


# ═══════════════════════════════════════════════════════════════════════════════
# TOOL DEFINITIONS (for LLM to know what's available)
# ═══════════════════════════════════════════════════════════════════════════════

TOOL_DESCRIPTIONS = """
AVAILABLE TOOLS:

⚠️ IMPORTANT: Always use the CURRENT SLIDE ID from context for slide_id parameter unless user explicitly names a different slide!

SCOPE:
- If [CONTEXT] indicates scope=deck or apply_to_all_slides=true, apply the change across all slides
- Use view_slide to inspect other slides, then edit each relevant slide

1. custom_component_str_replace ⭐ PREFERRED FOR SIMPLE TARGETED EDITS
   - Make a SINGLE targeted edit to a CustomComponent
   - ✅ USE FOR: fix logo, change one color, update one text, fix one image, adjust font size
   - ❌ DO NOT use for: JavaScript logic, multi-element changes, interactive behavior
   - ⚠️ slide_id MUST match the CURRENT SLIDE from context
   - Args: { "slide_id": str, "component_id": str, "instruction": str }
   - Example: {"instruction": "make the D smaller"} or {"instruction": "change title to red"}

1b. custom_component_rewrite 🔧 FOR COMPLEX/LOGIC CHANGES
   - Regenerate entire CustomComponent HTML
   - ✅ USE FOR: JavaScript fixes, button behavior, interactive elements, multi-element changes
   - ✅ USE FOR: "each button should show different image", "fix click handlers", "make X work when clicked"
   - Args: { "slide_id": str, "component_id": str, "instruction": str }
   - Example: {"instruction": "fix the buttons so each one displays its own club image when clicked"}

2. edit_slide (FULL REWRITE - use sparingly)
   - Completely rewrites the slide content (AI regenerates everything)
   - ⚠️ ONLY use when user explicitly wants: redesign, rebrand, overhaul, "from scratch"
   - ⚠️ DO NOT use for single fixes like "fix the logo" or "change one color"
   - ⚠️ slide_id MUST match the CURRENT SLIDE from context
   - Args: { "slide_id": str, "instruction": str }
   - Optional: use_attachments: true when user explicitly asks to use uploaded images
   - Example: {"instruction": "Redesign this slide with Nike branding throughout"}

3. create_slide ⭐ FOR NEW SLIDES
   - Create a new slide
   - ✅ USE THIS for any "add slide", "create slide", "new slide" request
   - ALWAYS set insert_after to the current slide ID so the new slide appears right after it
   - ⚠️ RESEARCH FIRST: If the slide needs factual content (statistics, company data, market info), call web_search BEFORE create_slide
     * Example: "Create a slide about Apple's Q4 earnings" → web_search FIRST, then create_slide with the data
     * Example: "Add a slide about market trends in AI" → web_search FIRST for current data
     * Simple slides (intro, agenda, title, thank you) do NOT need research
   - Args: { "instruction": str, "insert_after": str (REQUIRED - use current slide ID) }
   - Optional: use_attachments: true when user explicitly asks to use uploaded images

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
   - component_type: TiptapTextBlock, Image, Video, Chart, Shape, CustomComponent
   - For uploaded images: use component_type "Image" and set src to an attachment URL

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
   - If no args provided, uses deck's existing theme (from deck.theme.typography)
   - Example colors: {"colors": {"accent_1": "#FF0000", "primary_text": "#333333"}}
   - Example typography: {"typography": {"heading": "Press Start 2P", "body": "VT323"}}

11. component_prop_update
   - Mechanical prop merge for a component (no AI)
   - WHEN: User wants to move/resize/change font size/color on a selected component
   - Args: { "slide_id": str, "component_id": str, "updates": { ... } }

13. view_component
   - Return a component's current props (and HTML preview for CustomComponent)
   - WHEN: Before a surgical edit so you can reference exact strings/classes
   - Args: { "slide_id": str, "component_id": str }

14. search_images ⭐ FOR IMAGE REPLACEMENT IN CUSTOMCOMPONENT HTML
   - Search Google Images and replace ONE <img> tag in the CustomComponent HTML
   - ✅ USE FOR: "replace the image", "find a better image", "fix the images"
   - Edits the CustomComponent HTML to replace image URLs - does NOT create Image components
   - SMART MATCHING: The tool has AI that matches your query to the correct image!
   - ⚠️ CRITICAL: This tool replaces ONE image per call.
   - Args: { "query": str, "image_index": optional int, "target_image": optional str }

   🎯 HOW TO TARGET THE RIGHT IMAGE (use screenshot!):

   METHOD 1 - User describes image VISUALLY (by appearance):
   - User says: "replace the older woman's photo" or "the guy in blue shirt"
   - LOOK at the screenshot, COUNT images left-to-right (0-indexed)
   - Use: {"query": "professional headshot", "image_index": 0}  // She's first in row

   METHOD 2 - User says ORDINAL position (first, second, 3rd, etc.):
   - User says: "replace the 2nd image with a dog"
   - Use: {"query": "dog", "image_index": 1}  // 0-indexed, so 2nd = index 1

   METHOD 3 - User describes image by CONTENT/ROLE:
   - User says: "replace the ingest image with a cat" or "change the logo"
   - Use: {"query": "cat", "target_image": "ingest"}
   - The tool's AI will match "ingest" to the correct image based on alt text

   ⚠️ For VISUAL descriptions, use the screenshot to determine image_index!

   ⚠️ MULTIPLE IMAGE REPLACEMENTS - DO NOT use image_index for batch operations!
   When replacing multiple images, indices SHIFT after each replacement.
   Instead, use `target_image` to identify images by their content/role:
   - WRONG: {"image_index": 0}, {"image_index": 1}  // Indices shift!
   - RIGHT: {"target_image": "hero"}, {"target_image": "logo"}  // Stable identifiers

   🎯 KEEP QUERIES SHORT (2-4 words):
   - For companies: "Tesla car", "Microsoft logo", "Amazon warehouse"
   - For concepts: "team meeting", "solar panels", "office workspace"

   - Example: {"query": "cat photo", "target_image": "ingest"}  ← User said "ingest image"
   - Example: {"query": "Apple logo", "target_image": "logo"}   ← User said "the logo"
   - Example: {"query": "dog", "image_index": 2}                ← User said "3rd image"

15. replace_image
   - Replace an image URL in the CustomComponent HTML with a specific URL
   - WHEN: User provides a specific image URL to use
   - Edits the HTML to replace an existing image URL - does NOT create Image components
   - Args: { "image_url": str, "image_index": optional int, "old_url": optional str }

16. edit_image_with_ai ⚠️ SPECIFIC USE CASE - AI IMAGE MODIFICATION
   - ONLY use when user explicitly wants to MODIFY/EDIT an EXISTING IMAGE using AI
   - ✅ USE FOR: "make this image green/blue/red", "remove the background", "add effects"
   - ✅ USE FOR: "make the image look more X", "change image colors", "edit the photo"
   - ❌ DO NOT USE FOR: replacing images (use search_images), changing text colors, general edits
   - Edits an <img> in the CustomComponent HTML - downloads, AI edits, uploads, replaces URL in HTML
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

18. deep_extract ⭐ FOR SITE-SPECIFIC DATA + VIDEOS
   - Use when the user provides a URL/domain or asks for media from a site
   - Include videos when requested (set include_videos: true)
   - Args: { "query": str, "url": optional str, "urls": optional [str], "schema": optional object, "include_videos": optional bool, "route_hint": optional str }
   - Example: {"query": "Find the product video on the homepage", "url": "https://dyna.co", "include_videos": true}

19. web_search ⭐ FOR CONTENT IMPROVEMENT WITH REAL DATA
   - Search the web for current information, facts, statistics, and data
   - ✅ USE FOR CONTENT UPDATES - ALWAYS search before updating text with real data:
     * "improve the statistics" → web_search("current [topic] statistics as of today")
     * "update the market data" → web_search("[industry] market size revenue current")
     * "replace with real numbers" → web_search("[specific topic] statistics facts")
     * "make it more accurate" → web_search("[slide topic] current data")
     * "add real facts" → web_search("[topic] key facts statistics")
   - Returns researched content with citations from Perplexity
   - AFTER web_search completes - choose based on user intent:
     * Default: custom_component_str_replace (targeted text edit)
     * If user says "rewrite"/"redesign"/"rebuild": edit_slide is OK
   - Args: { "query": str }
   - query: What to search for (be specific, use CURRENT DATE from context when user asks for latest/current)
   - For "latest/current" requests, DO NOT add a season/year unless the user explicitly specifies one
   - Example: {"query": "AI market size revenue growth as of today"}
   - Example: {"query": "Tesla quarterly earnings Q3 as of today"}
   - Example: {"query": "renewable energy adoption statistics Europe current"}

20. edit_all_slides ⭐ FOR CROSS-SLIDE EDITS
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
    slide_screenshot: Dict = None,
    classification = None,  # MessageClassification from fast_path
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
        slide_screenshot: Optional dict with 'data' (base64) and 'media_type' for vision
        classification: Optional MessageClassification for model selection

    Returns:
        {"deck_diff": DeckDiff, "edit_summary": str}
    """
    from agents.editing.tools.tool_executor import execute_tool

    # Log which slide we're processing for debugging slide mismatch issues
    slide_id = _get_attr(current_slide, "id", "unknown")
    slide_title = ""
    comps = _get_attr(current_slide, "components", [])
    for c in (comps or []):
        if _get_attr(c, "type") == "CustomComponent":
            html = (_get_attr(_get_attr(c, "props", {}), "render", "") or "")[:300]
            if "<title>" in html:
                import re
                m = re.search(r"<title>([^<]+)</title>", html)
                if m:
                    slide_title = m.group(1)[:50]
                    break
    logger.info(f"[ORCHESTRATE] Processing slide_id={slide_id}, title_hint={slide_title!r}, message={user_message[:100]!r}")

    # Save screenshot to temp file for debugging (only if DEBUG_SAVE_FILES is enabled)
    if DEBUG_SAVE_FILES and slide_screenshot and slide_screenshot.get("data"):
        import base64
        try:
            img_data = base64.b64decode(slide_screenshot["data"])
            with open("/tmp/orchestrator_screenshot.jpg", "wb") as f:
                f.write(img_data)
            logger.info(f"[ORCHESTRATE] Saved screenshot ({len(img_data)} bytes) to /tmp/orchestrator_screenshot.jpg")
        except Exception as e:
            logger.warning(f"[ORCHESTRATE] Failed to save screenshot: {e}")

    # Log screenshot status
    if slide_screenshot and slide_screenshot.get("data"):
        logger.info(f"[ORCHESTRATE] Screenshot provided ({len(slide_screenshot.get('data', ''))} base64 chars)")
    else:
        logger.info(f"[ORCHESTRATE] No screenshot provided")

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
    video_hint = ""
    if _should_hint_video_extract(clean_message):
        video_hint = (
            "\n\nVIDEO REQUEST DETECTED:\n"
            "- Call deep_extract with include_videos: true using the provided URL/domain\n"
            "- Then embed the video in the slide (prefer embed_url if available)\n"
        )

    # ═══════════════════════════════════════════════════════════════════════════
    # ROUTING: agents.md (single prompt) vs skill-based (classifier)
    # ═══════════════════════════════════════════════════════════════════════════

    if USE_AGENTS_MD:
        # agents.md mode: one model, one prompt, no classifier needed
        model = AGENT_MODEL
        system_prompt = AGENTS_MD_PROMPT
        tool_section = TOOLS_REFERENCE

        logger.info(f"[ORCHESTRATOR] agents.md mode -> Model: {model}")

        if event_cb:
            try:
                event_cb("agent.thinking", {"model": model})
            except Exception:
                pass

        # Full prompt
        prompt = f"""{context}

{video_hint}
{tool_section}

USER REQUEST: {clean_message}

Respond with the tool_calls to execute."""
    else:
        # Legacy skill-based routing (kept for rollback)
        from agents.editing.skill_prompts import get_skill_prompt, get_skill_tools

        # Get skill and scope from classification for model selection and prompt
        skill = "complex_edit"  # Default
        scope = "slide"  # Default to current slide only
        if classification:
            skill = getattr(classification, 'skill', None) or getattr(classification, 'type', 'complex_edit')
            scope = getattr(classification, 'scope', 'slide')
            if skill == "simple_edit":
                skill = "text_edit"  # Map legacy type to skill

        # SCOPE-BASED ROUTING: If scope is "slide" but skill is "theme_change", use color_edit instead
        if scope == "slide" and skill == "theme_change":
            logger.info(f"[ORCHESTRATOR] Rerouting theme_change to color_edit (scope=slide)")
            skill = "color_edit"

        # Get model based on skill
        model = EDIT_TYPE_MODELS.get(skill, GEMINI_3_FLASH)

        logger.info(f"[ORCHESTRATOR] Skill: {skill}, Scope: {scope} -> Model: {model}")

        if event_cb:
            try:
                event_cb("agent.thinking", {"skill": skill, "scope": scope, "model": model})
            except Exception:
                pass

        # Get skill-specific tool descriptions
        skill_tools = get_skill_tools(skill)
        skill_tool_descriptions = "\n\n".join(
            f"- {TOOL_DESCRIPTIONS_MAP[t]}" for t in skill_tools if t in TOOL_DESCRIPTIONS_MAP
        )

        # Use skill-specific system prompt for simple skills, full prompt for complex
        if skill in ["text_edit", "color_edit", "image_search", "theme_change", "slide_delete"]:
            system_prompt = get_skill_prompt(skill)
            tool_section = f"TOOLS:\n{skill_tool_descriptions}" if skill_tool_descriptions else ""
        else:
            system_prompt = SYSTEM_PROMPT
            tool_section = TOOL_DESCRIPTIONS

        # Scope hint for the LLM
        scope_hint = ""
        if scope == "slide":
            scope_hint = "SCOPE: Current slide only. Do NOT apply changes to all slides."
        elif scope == "deck":
            scope_hint = "SCOPE: All slides. Apply changes globally across the entire deck."

        # Full prompt
        prompt = f"""{context}

{video_hint}
{scope_hint}
{tool_section}

USER REQUEST: {clean_message}

Respond with the tool_calls to execute."""

    # Check for rate limits
    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[ORCHESTRATOR] Gemini in cooldown, using fallback: {model}")

    client, actual_model = get_client(model)

    # Build user message - multimodal if screenshot provided
    if slide_screenshot and slide_screenshot.get("data"):
        # Include screenshot as vision content for the model to "see" the slide
        user_content = [
            {
                "type": "image",
                "source": {
                    "type": "base64",
                    "data": slide_screenshot["data"],
                    "media_type": slide_screenshot.get("media_type", "image/jpeg")
                }
            },
            {"type": "text", "text": f"[CURRENT SLIDE SCREENSHOT - Use this to see what the slide looks like]\n\n{prompt}"}
        ]
        logger.info(f"[ORCHESTRATOR] 📸 Including slide screenshot as vision content")
    else:
        user_content = prompt

    # Single LLM call with skill-specific system prompt
    try:
        response = invoke(
            client=client,
            model=actual_model,
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_content}
            ],
            response_model=OrchestratorResponse,
            max_tokens=16384,
        )
    except Exception as e:
        error_str = str(e).lower()
        is_rate_limit = '429' in error_str or 'rate' in error_str
        is_json_error = (
            'json_invalid' in error_str or
            'jsondecode' in error_str or
            'expecting' in error_str or
            'validation error' in error_str or
            'invalid json' in error_str
        )
        if is_rate_limit or is_json_error:
            # Try fallback
            reason = "rate limited" if is_rate_limit else "JSON parse error from Gemini"
            logger.warning(f"[ORCHESTRATOR] {reason}, trying fallback model")
            if is_rate_limit:
                mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            response = invoke(
                client=fallback_client,
                model=fallback_model,
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content}
                ],
                response_model=OrchestratorResponse,
                max_tokens=16384,
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

    # Emit actions as individual inline steps (not a bubble)
    if event_cb and response.tool_calls:
        def _user_friendly_action(summary: str, tool_name: str) -> str:
            """Convert tool calls to user-friendly action descriptions."""
            # Clean up technical terms in summary to make it user-friendly
            cleaned = summary if summary else ""

            # Remove raw context patterns that shouldn't be shown to users
            import re
            cleaned = re.sub(r'\[USER_SELECTIONS?\]?[^\n]*', '', cleaned)  # Match [USER_SELECTION] or [USER_SELECTIONS] and everything after
            cleaned = re.sub(r'\[SLIDE_CONTEXT[^\]]*\]?', '', cleaned)
            cleaned = re.sub(r'\[CONTEXT[^\]]*\]?', '', cleaned)
            cleaned = re.sub(r'@slide-[a-zA-Z0-9-]+', '', cleaned)

            for tech_term in ["CustomComponent", "HTML", "div", "DOM", "props", "str_replace", "component", "custom_component"]:
                cleaned = cleaned.replace(tech_term, "").replace(tech_term.lower(), "")
            cleaned = " ".join(cleaned.split()).strip()  # Collapse whitespace

            # Only use the summary if it has meaningful content after cleaning
            if cleaned and len(cleaned) > 3:
                return cleaned

            # Fallback to tool-friendly names only if summary is empty
            tool_labels = {
                "web_search": "Searching the web",
                "search_images": "Finding images",
                "edit_slide": "Updating slide",
                "create_slide": "Creating slide",
                "delete_slide": "Removing slide",
                "custom_component_str_replace": "Editing",
                "apply_theme_to_custom_components": "Applying theme",
                "edit_image_with_ai": "Editing image",
                "view_component": "Analyzing",
                "deep_extract": "Extracting data",
                "linkedin_lookup": "Looking up profile",
            }
            return tool_labels.get(tool_name, tool_name.replace("_", " ").title())

        # Emit each action as an inline step
        for tc in response.tool_calls:
            action = _user_friendly_action(tc.summary, tc.tool_name)
            try:
                event_cb("agent.action", {"action": action, "tool": tc.tool_name})
            except Exception:
                pass

    # Track integration data from lookup tools to inject into subsequent slide creation
    # IMPORTANT: This is OUTSIDE _execute_tool_calls so it persists across all passes (initial + follow-ups)
    # Generic structure: { "integration_name": { "type": "profiles|files|items", "data": [...], "source": "..." } }
    # Examples: linkedin -> profiles, figma -> designs, salesforce -> contacts, hubspot -> deals, web_search -> research
    integration_context: Dict[str, Dict[str, Any]] = {}

    def _execute_tool_calls(tool_calls: List[ToolCall]) -> tuple[DeckDiff, List[str], List[Dict[str, Any]], bool]:
        """Execute tool calls and collect any attached observations.

        Returns:
            tuple: (deck_diff, summaries, observations, needs_user_confirmation)
            - needs_user_confirmation: True if we paused for user to select from multiple options
        """
        nonlocal integration_context  # Access the outer integration_context

        dd = DeckDiff(DeckDiffBase())
        summaries: List[str] = []
        observations: List[Dict[str, Any]] = []

        # Track accumulated component updates so sequential str_replace ops see previous results
        # Key: component_id, Value: latest props dict (especially 'render' for CustomComponent)
        accumulated_props: Dict[str, Dict[str, Any]] = {}

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
                    logger.info(f"[ORCHESTRATOR] 📡 Emitting agent.tool.start for: {tool_name}")
                    event_cb("agent.tool.start", {"tool": tool_name})
                except Exception as e:
                    logger.warning(f"[ORCHESTRATOR] ⚠️ Failed to emit tool start: {e}")
            else:
                logger.warning(f"[ORCHESTRATOR] ⚠️ event_cb is None - cannot emit tool start for: {tool_name}")

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
            # This allows data from web_search, linkedin_lookup, figma_import, etc. to be used in slides
            if integration_context and tool_name in ("create_slide", "edit_slide", "custom_component_rewrite", "custom_component_str_replace"):
                instruction = tool_args.get("instruction", "")
                if instruction:
                    context_blocks = []

                    for integration_name, ctx in integration_context.items():
                        data_type = ctx.get("type", "items")
                        items = ctx.get("data", [])
                        videos = ctx.get("videos") or []

                        if not items and not videos:
                            continue

                        # Format data based on integration type
                        item_lines = []
                        for item in items:
                            if data_type == "research":
                                # Research data from web_search (Perplexity)
                                content = item.get("content", "")
                                citations = item.get("citations", [])
                                if content:
                                    item_lines.append(f"Research findings:\n{content}")
                                if citations:
                                    item_lines.append(f"Sources: {', '.join(citations[:3])}")
                                logger.info(f"[ORCHESTRATOR] 💉 Injecting web_search research ({len(content)} chars) into {tool_name}")

                            elif data_type == "profiles":
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
                                if item.get("phone"):
                                    parts.append(f"Phone: {item['phone']}")
                                if item.get("location"):
                                    parts.append(f"Location: {item['location']}")
                                item_lines.append(" | ".join(parts))

                                # Add employment history as separate lines for better readability
                                employment_history = item.get("employment_history")
                                if employment_history and len(employment_history) > 0:
                                    history_lines = ["Employment History:"]
                                    for job in employment_history[:5]:  # Limit to 5 most recent
                                        job_title = job.get("title", "Unknown Role")
                                        job_company = job.get("company", "Unknown Company")
                                        start = job.get("start_date", "")
                                        end = job.get("end_date", "Present") if not job.get("current") else "Present"
                                        date_range = f" ({start} - {end})" if start else ""
                                        history_lines.append(f"  - {job_title} at {job_company}{date_range}")
                                    item_lines.append("\n".join(history_lines))

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
                            if data_type == "research":
                                header = f"[{integration_name.upper()} RESEARCH - USE ONLY THESE FACTS/NUMBERS; DO NOT INVENT]:"
                            context_blocks.append(header + "\n" + "\n".join(item_lines))
                            logger.info(f"[ORCHESTRATOR] 💉 Injected {len(items)} {data_type} from {integration_name} into {tool_name} instruction")

                        if videos:
                            if tool_name in ("create_slide", "edit_slide", "custom_component_rewrite"):
                                existing = tool_args.get("available_videos")
                                merged: List[Dict[str, Any]] = []
                                seen = set()
                                for v in (existing if isinstance(existing, list) else []) + videos:
                                    if not isinstance(v, dict):
                                        continue
                                    url = (v.get("embed_url") or v.get("url") or "").strip()
                                    if not url or url in seen:
                                        continue
                                    seen.add(url)
                                    merged.append(v)
                                if merged:
                                    tool_args["available_videos"] = merged

                            video_lines = []
                            for v in videos[:5]:
                                title = v.get("title") or v.get("url") or "video"
                                url = v.get("embed_url") or v.get("url")
                                if url:
                                    video_lines.append(f"- {title} ({url})")
                                else:
                                    video_lines.append(f"- {title}")
                            if video_lines:
                                header = "[AVAILABLE VIDEOS - EMBED ONE WHEN REQUESTED]:"
                                context_blocks.append(header + "\n" + "\n".join(video_lines))
                                logger.info(f"[ORCHESTRATOR] 🎬 Injected {len(video_lines)} video(s) from {integration_name} into {tool_name} instruction")

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
                    chat_history=chat_history,
                    slide_screenshot=slide_screenshot,
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
                                "videos": obs.get("videos", []) or [],
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
                    # Handle ThemeUpdateResult which contains both DeckDiff and theme_updates
                    from agents.editing.tools.slide_tool_theme import ThemeUpdateResult
                    if isinstance(tool_diff, ThemeUpdateResult):
                        logger.info(f"[ORCHESTRATOR] 🎨 Tool {tool_name} returned ThemeUpdateResult with theme_updates: {list(tool_diff.theme_updates.keys()) if tool_diff.theme_updates else 'None'}")
                        # Extract theme_updates for inclusion in final result
                        if not hasattr(dd, '_theme_updates'):
                            dd._theme_updates = {}
                        if tool_diff.theme_updates:
                            dd._theme_updates.update(tool_diff.theme_updates)
                        # Use the inner deck_diff for merging
                        tool_diff = tool_diff.deck_diff

                    # Ensure tool_diff is a DeckDiff object, not a dict
                    if isinstance(tool_diff, dict):
                        logger.warning(f"[ORCHESTRATOR] Tool {tool_name} returned dict instead of DeckDiff, skipping merge")
                    else:
                        # CRITICAL: Check if editing tool returned empty diff (no actual changes made)
                        # This prevents the model from claiming success when nothing was modified
                        editing_tools = {
                            "search_images", "replace_image", "edit_image_with_ai",
                            "edit_slide", "custom_component_rewrite", "custom_component_str_replace",
                            "create_slide", "delete_slide", "duplicate_slide",
                            "component_prop_update", "edit_component", "create_component", "delete_component"
                        }
                        if tool_name in editing_tools and _is_empty_deckdiff(tool_diff):
                            logger.warning(f"[ORCHESTRATOR] ⚠️ Tool {tool_name} returned EMPTY diff - no changes made!")
                            # Add feedback observation so model knows the operation failed
                            observations.append({
                                "tool": tool_name,
                                "data": {
                                    "status": "no_changes",
                                    "message": f"Tool {tool_name} completed but made NO changes. The slide was not modified.",
                                    "reason": "The tool could not find a suitable component to edit, or the edit operation failed."
                                }
                            })
                            # Don't count this as a successful edit summary
                            summaries.append(f"⚠️ {tool_name}: No changes made - operation did not modify the slide")
                            if event_cb:
                                try:
                                    event_cb("agent.tool.finish", {"tool": tool_name, "summary": f"No changes made", "warning": True})
                                except Exception:
                                    pass
                            continue  # Skip the rest of the processing for this tool

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

                # VERIFICATION STEP: For HTML-generating tools, verify the code is valid
                # This catches issues like missing event handlers, syntax errors, etc.
                if tool_name in ("edit_slide", "custom_component_rewrite", "custom_component_str_replace"):
                    try:
                        # Emit verification event so frontend shows "Verifying code..."
                        if event_cb:
                            event_cb("agent.verifying", {"tool": tool_name, "step": "checking_code"})

                        # Extract the generated HTML from the diff
                        generated_html = None
                        try:
                            deck_diff_inner = getattr(tool_diff, 'deck_diff', None)
                            if deck_diff_inner and hasattr(deck_diff_inner, 'slides_to_update'):
                                for slide_diff in (deck_diff_inner.slides_to_update or []):
                                    for comp_diff in (getattr(slide_diff, 'components_to_update', None) or []):
                                        comp_props = getattr(comp_diff, 'props', None)
                                        if comp_props:
                                            render = comp_props.render if hasattr(comp_props, 'render') else (comp_props.get('render') if isinstance(comp_props, dict) else None)
                                            if render:
                                                generated_html = render
                                                break
                                    if generated_html:
                                        break
                        except Exception:
                            pass

                        if generated_html:
                            # Verify the code
                            verification = verify_interactive_code(
                                generated_html,
                                user_request=clean_message
                            )

                            if not verification.is_valid or verification.issues:
                                logger.warning(f"[ORCHESTRATOR] ⚠️ Code verification found issues: {verification.issues}")
                                # Add verification feedback to observations so the model can see what went wrong
                                verification_feedback = create_verification_context(verification, clean_message)
                                if verification_feedback:
                                    observations.append({
                                        "tool": "code_verification",
                                        "data": {
                                            "issues": verification.issues,
                                            "warnings": verification.warnings,
                                            "suggestions": verification.suggestions,
                                            "interactive_elements": len(verification.interactive_elements),
                                            "feedback": verification_feedback
                                        }
                                    })
                                    logger.info(f"[ORCHESTRATOR] 📋 Added verification feedback: {len(verification.issues)} issues, {len(verification.warnings)} warnings")

                                    # Emit verification warning event
                                    if event_cb:
                                        event_cb("agent.verification_warning", {
                                            "tool": tool_name,
                                            "issues_count": len(verification.issues),
                                            "warnings_count": len(verification.warnings)
                                        })
                            else:
                                logger.info(f"[ORCHESTRATOR] ✅ Code verification passed: {len(verification.interactive_elements)} interactive elements found")

                    except Exception as verify_error:
                        logger.warning(f"[ORCHESTRATOR] Code verification failed (non-fatal): {verify_error}")

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
    all_observations = list(observations or [])

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
    if all_observations and _is_empty_deckdiff(deck_diff):
        logger.info(f"[ORCHESTRATOR] 🔄 Starting follow-up pass - agent only viewed, need actionable edits")
        try:
            followup_tool_section = tool_section if USE_AGENTS_MD else TOOL_DESCRIPTIONS
            followup_prompt = f"""{context}

{video_hint}
{followup_tool_section}

USER REQUEST: {clean_message}

You already executed read-only tools and obtained these observations (JSON):
{json.dumps(all_observations, ensure_ascii=False)[:24000]}

Now propose the NEXT tool_calls needed to actually satisfy the user request.
- If research data is provided above, ONLY use those numbers (do not invent or assume older seasons/years)
- If required metrics are missing, run web_search again with a focused query
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
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": followup_prompt},
                ],
                response_model=OrchestratorResponse,
                max_tokens=16384,
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
                if _obs2:
                    all_observations.extend(_obs2)
                logger.info(f"[ORCHESTRATOR] 🔄 Follow-up complete: {len(summaries2)} summaries, empty_diff={_is_empty_deckdiff(deck_diff)}")
                # Use follow-up message if provided
                followup_msg = getattr(followup, 'message', '') or ''
                if followup_msg:
                    response.message = followup_msg
                if all_observations and _is_empty_deckdiff(deck_diff):
                    logger.info("[ORCHESTRATOR] 🔄 Starting second follow-up - observations only, forcing edits")
                    followup_prompt_2 = f"""{context}

{video_hint}
{followup_tool_section}

USER REQUEST: {clean_message}

You already have the observations below (JSON). APPLY THEM NOW:
{json.dumps(all_observations, ensure_ascii=False)[:24000]}

Now propose tool_calls that UPDATE the slide(s) using the observed data.
- Do NOT call web_search or view_component
- Use custom_component_str_replace or edit_slide to apply the updated metrics
- Use ONLY numbers from the observations; do not invent any values

Respond with the tool_calls to execute."""

                    followup2 = invoke(
                        client=client,
                        model=actual_model,
                        messages=[
                            {"role": "system", "content": system_prompt},
                            {"role": "user", "content": followup_prompt_2},
                        ],
                        response_model=OrchestratorResponse,
                        max_tokens=16384,
                    )
                    if followup2.tool_calls:
                        logger.info(f"[ORCHESTRATOR] 🔄 Executing {len(followup2.tool_calls)} second follow-up tool calls")
                        dd3, summaries3, _obs3, _needs_confirm = _execute_tool_calls(followup2.tool_calls)
                        deck_diff = deck_diff.merge(dd3)
                        edit_summaries.extend(summaries3)
                        if _obs3:
                            all_observations.extend(_obs3)
                        logger.info(f"[ORCHESTRATOR] 🔄 Second follow-up complete: {len(summaries3)} summaries, empty_diff={_is_empty_deckdiff(deck_diff)}")
                        followup2_msg = getattr(followup2, 'message', '') or ''
                        if followup2_msg:
                            response.message = followup2_msg
            else:
                # Log debug info when no tool calls are returned
                obs_str = json.dumps(all_observations, ensure_ascii=False)
                followup_msg = getattr(followup, 'message', '') or ''
                logger.warning(f"[ORCHESTRATOR] 🔄 Follow-up returned NO tool calls - agent may need more guidance")
                logger.warning(f"[ORCHESTRATOR] 🔄 Observations length: {len(obs_str)} chars, followup message: {followup_msg[:200] if followup_msg else '(empty)'}")
                # Use follow-up message if provided, otherwise PRESERVE original message
                # Don't overwrite a good original message with a generic fallback
                if followup_msg:
                    response.message = followup_msg
                elif not response.message:
                    # Only use fallback if original message was also empty
                    response.message = "I looked at the slide but I'm not sure what specific changes you'd like. Could you tell me more about what you want to change?"
        except Exception as e:
            logger.warning(f"[ORCHESTRATOR] Follow-up after observation failed: {e}")
            import traceback
            logger.warning(traceback.format_exc())

    # Extract the conversational message from the response
    agent_message = getattr(response, 'message', '') or ''
    logger.info(f"[ORCHESTRATOR] 💬 Extracted message from response: '{agent_message[:100]}...' (len={len(agent_message)})" if agent_message else "[ORCHESTRATOR] 💬 No message in response object")

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
            logger.info(f"[ORCHESTRATOR] 📤 Emitting assistant.message.delta: '{agent_message[:100]}...'")
            event_cb("assistant.message.delta", {"delta": agent_message})
        except Exception as e:
            logger.warning(f"[ORCHESTRATOR] Failed to emit message: {e}")
    else:
        logger.warning(f"[ORCHESTRATOR] ⚠️ No message emitted - event_cb={bool(event_cb)}, agent_message='{agent_message[:50] if agent_message else 'EMPTY'}'")

    # Extract theme_updates if they were set by ThemeUpdateResult tools
    theme_updates = getattr(deck_diff, '_theme_updates', None)
    if theme_updates:
        logger.info(f"[ORCHESTRATOR] 🎨 Including theme_updates in result: {list(theme_updates.keys())}")

    logger.info(f"[ORCHESTRATOR] ✅ Returning result with message: '{agent_message[:100]}...' (len={len(agent_message)})" if agent_message else "[ORCHESTRATOR] ⚠️ Returning with EMPTY message")

    result = {"deck_diff": deck_diff, "edit_summary": "\n".join(edit_summaries), "message": agent_message}
    if theme_updates:
        result["theme_updates"] = theme_updates
    return result


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
    slide_screenshot: Dict = None,
    classification = None,  # MessageClassification from fast_path
) -> Dict:
    """
    Main entry point for deck editing.
    Signature matches the old orchestrator for drop-in replacement.

    Args:
        slide_screenshot: Optional dict with 'data' (base64) and 'media_type' for vision
        classification: Optional MessageClassification for model selection
    """
    # DEBUG: Log entry to track event_cb
    import traceback
    logger.info(f"[EDIT_DECK] Entry - event_cb={bool(event_cb)} (callable={callable(event_cb) if event_cb else False})")
    if not event_cb:
        logger.warning(f"[EDIT_DECK] ⚠️ event_cb is None! Call stack:\n{''.join(traceback.format_stack()[-5:-1])}")

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
        slide_screenshot=slide_screenshot,
        classification=classification,
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

    # Build return dict, preserving theme_updates if present
    return_data = {
        "deck_diff": deck_diff_data,
        "edit_summary": result.get('edit_summary', ''),
        "message": result.get('message', '')
    }
    if result.get('theme_updates'):
        return_data['theme_updates'] = result['theme_updates']
    return return_data


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