"""
Tool descriptions for the editing orchestrator.

Each tool has a concise description that can be filtered per skill.
"""

TOOL_DESCRIPTIONS_MAP = {
    "custom_component_str_replace": """custom_component_str_replace - Targeted edit to a component
   TWO MODES:
   1. DIRECT (preferred when you can see the slide): { "old_string": "exact text to find", "new_string": "replacement" }
   2. INSTRUCTION (fallback): { "instruction": "what to change" }

   For visual changes (size, color, spacing), ALWAYS use DIRECT mode with exact CSS/HTML from the slide.
   Example: {"old_string": "font-size: 120px", "new_string": "font-size: 48px"}
   Example: {"old_string": "color: #FF0000", "new_string": "color: #0066CC"}

   SVG ELEMENTS: Use CSS transform, NOT viewBox changes!
   Example: {"old_string": ".vector-arrow {", "new_string": ".vector-arrow { transform: scale(0.7); transform-origin: center;"}
   ⚠️ NEVER use empty new_string to delete CSS rules - always provide a replacement""",

    "edit_slide": """edit_slide - Full slide rewrite/redesign
   Args: { "slide_id": str, "instruction": str }
   Use for: redesigns, major changes, rebuilding content""",

    "create_slide": """create_slide - Create a new slide
   Args: { "instruction": str, "insert_after": str }
   ALWAYS set insert_after to current slide ID""",

    "delete_slide": """delete_slide - Remove a slide
   Args: { "slide_id": str }""",

    "duplicate_slide": """duplicate_slide - Copy a slide
   Args: { "slide_id": str, "insert_after": str (optional) }""",

    "reorder_slides": """reorder_slides - Reorder slides
   Args: { "slide_id": str, "new_index": int } OR { "slide_order": [slide_ids] }""",

    "edit_all_slides": """edit_all_slides - Apply same edit to ALL slides
   Args: { "instruction": str }
   Use for: "all slides", "every slide", "across the deck" requests""",

    "edit_component": """edit_component - Edit a specific component by ID
   Args: { "slide_id": str, "component_id": str, "instruction": str }""",

    "create_component": """create_component - Add a new component
   Args: { "slide_id": str, "component_type": str, "instruction": str }
   Types: TiptapTextBlock, Image, Video, Chart, Shape, CustomComponent""",

    "delete_component": """delete_component - Remove a component
   Args: { "slide_id": str, "component_id": str }""",

    "apply_theme": """apply_theme - Apply theme to standard components
   Args: { "instruction": str }
   Note: Does NOT affect CustomComponents""",

    "apply_theme_to_custom_components": """apply_theme_to_custom_components - Apply theme to ALL CustomComponents
   Args: { "colors": dict (optional), "typography": dict (optional) }
   Example: {"typography": {"heading": {"family": "Poppins"}, "body": {"family": "Inter"}}}
   Example: {"colors": {"accent_1": "#FF0000", "primary_text": "#333"}}""",

    "component_prop_update": """component_prop_update - Direct property update (no AI)
   Args: { "slide_id": str, "component_id": str, "updates": {...} }
   Use for: move, resize, font size, SLIDE-SPECIFIC FONT CHANGES

   FONT OVERRIDES (for slide-specific font changes):
   - {"updates": {"overrideBodyFont": "Comic Sans MS"}} - body text font
   - {"updates": {"overrideHeroFont": "Poppins"}} - heading/title font
   - {"updates": {"overrideBodyFont": "Arial", "overrideHeroFont": "Arial"}} - all fonts on slide""",

    "view_component": """view_component - Inspect component before editing
   Args: { "slide_id": str, "component_id": str }
   Returns: Component's current props and HTML preview""",

    "view_slide": """view_slide - Inspect another slide
   Args: { "slide_id": str }""",

    "search_images": """search_images - Find and replace an image
   Args: { "query": str, "image_index": int (optional), "target_image": str (optional) }
   KEEP QUERIES SHORT (2-4 words): "Tesla logo", "office meeting", "dog photo"
   image_index: Position (0=first, 1=second)
   target_image: Match by content ("logo", "hero image")""",

    "replace_image": """replace_image - Replace with a specific URL
   Args: { "image_url": str, "image_index": int (optional), "old_url": str (optional) }""",

    "edit_image_with_ai": """edit_image_with_ai - AI-modify an existing image
   Args: { "instruction": str, "image_index": int (optional) }
   Use for: color changes, effects, background removal
   NOT for: replacing with different images (use search_images)""",

    "web_search": """web_search - Search for current data/information
   Args: { "query": str }
   Use for: statistics, company data, market info, current facts
   IMPORTANT: Use current date when searching for "latest" data""",

    "deep_extract": """deep_extract - Extract data from specific websites
   Args: { "query": str, "url": str (optional), "urls": list (optional), "include_videos": bool }
   Use for: site-specific data, case studies, pricing, videos""",

    "linkedin_lookup": """linkedin_lookup - Look up LinkedIn profiles
   Args: { "name": str, "company": str (optional), "title": str (optional) }
   ONLY use when @linkedin is in the message""",
}


def get_all_tool_descriptions() -> str:
    """Get descriptions for all tools."""
    return "AVAILABLE TOOLS:\n\n" + "\n\n".join(
        f"{i+1}. {desc}" for i, desc in enumerate(TOOL_DESCRIPTIONS_MAP.values())
    )
