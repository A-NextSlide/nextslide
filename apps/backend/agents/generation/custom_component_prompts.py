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

    logo_instruction = (
        "- Logo: Render props.logoUrl as a SMALL brand mark (max-height:40px; width:auto; object-fit:contain). position:absolute; left:60px; bottom:30px; pointer-events:none. Never enlarge, center, or dominate — logo sizing rules override image sizing rules."
        if logo_url
        else "- Logo: If props.logoUrl is provided, render SMALL (max-height:40px; width:auto; object-fit:contain). position:absolute; left:60px; bottom:30px; pointer-events:none. Never enlarge, center, or dominate."
    )
    element_positions = (
        "\n\nFIXED ELEMENT POSITIONS (MUST follow on EVERY slide for consistency across the deck):\n"
        f"{logo_instruction}\n"
        "- Page number: ALWAYS render the slide number (from the SLIDE info). position:absolute; right:60px; bottom:30px; font-size:13px; color:var(--text); opacity:0.4; pointer-events:none.\n"
        "  Format: just the number (e.g. \"3\"), no \"Slide\" prefix, no \"of N\".\n"
        "- These two elements must be in IDENTICAL positions on every slide. Never move, center, enlarge, or omit them."
    )

    # Visual toolkit guidance - both built components and images
    visual_component_guidance = (
        "VISUAL TOOLKIT - You have TWO powerful tools. Use BOTH:\n\n"
        "1. BUILT COMPONENTS (HTML/CSS/SVG/JS) - great for explaining concepts visually:\n"
        "  - Flowcharts & process diagrams → SVG arrows, boxes, and connectors\n"
        "  - Timelines → CSS/SVG timeline with nodes, dates, and labels\n"
        "  - Comparisons → Side-by-side cards, feature matrices, vs layouts\n"
        "  - Data & metrics → Chart.js/D3 charts, animated counters, gauge meters\n"
        "  - Hierarchies & org charts → SVG tree diagrams with connecting lines\n"
        "  - Mockups & wireframes → HTML/CSS device frames with UI elements inside\n"
        "  - Maps & geography → D3.js + TopoJSON rendered maps\n"
        "  - Architecture diagrams → SVG boxes with labeled arrows showing data flow\n"
        "  - Funnels & pipelines → CSS/SVG funnel shapes with stages\n"
        "  - Quadrant/matrix layouts → 2x2 grids with labeled axes\n"
        "  - Icon grids & feature lists → CSS grid with SVG icons + text\n"
        "  - Progress & status → CSS progress bars, step indicators, checklists\n\n"
        "2. IMAGES - great for grounding slides in the real world:\n"
        "  Use <img src=\"placeholder\" alt=\"VISUAL SEARCH QUERY\">.\n"
        "  - Each image needs UNIQUE alt text. ALWAYS use fixed-size container with overflow:hidden.\n"
        "  - Use tastefully and creatively to enhance the slide's message.\n"
        "  - Choose specific, descriptive alt text so the search returns high-quality results.\n\n"
        "Mix both tools freely. A slide can have a built SVG diagram AND a photograph.\n"
        "Choose whichever best communicates the content for each part of the slide.\n"
    )

    if has_palette:
        theme_info = (
            "THEME CSS VARIABLES (MUST DEFINE IN :root):\n"
            "  :root {{\n"
            "    --accent: {accent};\n"
            "    --secondary: {secondary};\n"
            "    --text: {text};\n"
            "    --bg: {bg};\n"
            "    --font-heading: '{hero}', sans-serif;\n"
            "    --font-body: '{body}', sans-serif;\n"
            "  }}\n"
            "FONTS (USE CSS VARIABLES - enables easy global changes):\n"
            "  - ALWAYS apply: h1,h2,h3,.title {{ font-family: var(--font-heading); }}\n"
            "  - ALWAYS apply: p,.body-text {{ font-family: var(--font-body); }}\n"
            "  - NEVER hard-code font names directly in CSS rules - ALWAYS use var(--font-heading) or var(--font-body)\n"
            "COLOR USE: Only use the CSS variables above (plus white/black for legibility).\n"
            f"{visual_component_guidance}"
            f"{element_positions}"
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
            "THEME CSS VARIABLES (MUST DEFINE IN :root):\n"
            "  :root {{\n"
            "    --accent: #your-accent-color;\n"
            "    --secondary: #your-secondary-color;\n"
            "    --text: #your-text-color;\n"
            "    --bg: #your-background-color;\n"
            "    --font-heading: '{hero}', sans-serif;\n"
            "    --font-body: '{body}', sans-serif;\n"
            "  }}\n"
            "Choose a cohesive palette and define the color variables above. Use them consistently.\n"
            "FONTS (USE CSS VARIABLES - enables easy global changes):\n"
            "  - ALWAYS apply: h1,h2,h3,.title {{ font-family: var(--font-heading); }}\n"
            "  - ALWAYS apply: p,.body-text {{ font-family: var(--font-body); }}\n"
            "  - NEVER hard-code font names directly in CSS rules - ALWAYS use var(--font-heading) or var(--font-body)\n"
            f"{visual_component_guidance}"
            f"{element_positions}"
        ).format(
            hero=hero_font,
            body=body_font,
        )

    if slide_mode == "static":
        return (
            "You create premium, still presentation slides like Keynote or consulting decks.\n"
            "TRADITIONAL MODE: no interactivity or scripts.\n\n"
            "⚠️ CRITICAL HEIGHT CONSTRAINT - READ FIRST ⚠️\n"
            "The slide is EXACTLY 1920x1080 pixels. Your content MUST fit within this.\n"
            "- MAXIMUM usable height: 1080px total, ~950px after title/header\n"
            "- BEFORE designing: Calculate total height = sum of all elements + gaps\n"
            "- If total > 950px: Use FEWER items, SMALLER cards, or MULTI-COLUMN layout\n"
            "- Content that extends below 1080px is INVISIBLE and BROKEN\n\n"
            f"{theme_info}\n\n"
            "DESIGN PRINCIPLES:\n"
            "- Use both built visuals (HTML/CSS/SVG diagrams, flowcharts, infographics) and images where each fits best\n"
            "- Bold, precise typography; clear hierarchy\n"
            "- Generous whitespace; balanced composition\n"
            "- Bespoke visuals/diagrams that explain the idea\n"
            "- Everything visible without interaction; show final values\n\n"
            "LAYOUT & CANVAS:\n"
            "- Fill the 1920x1080 canvas; no max-width containers\n"
            "- Set html, body { margin:0; padding:0; width:100%; height:100%; overflow:hidden; }\n"
            "- No implicit body margin/padding; use explicit layout containers for spacing\n"
            "- ALL content must fit within bounds - nothing cut off or extending below 1080px\n\n"
            "VERTICAL LAYOUT BUDGET (CRITICAL - prevents bottom overflow):\n"
            "- Available height after header (title ~100px + padding): ~950px max for body content\n"
            "- When stacking items vertically, CALCULATE FIRST: N × item_height + (N-1) × gap ≤ available_height\n"
            "- SAFE LIMITS for vertical stacks:\n"
            "  * 2 cards: max 400px each with 24px gap = 824px ✓\n"
            "  * 3 cards: max 280px each with 16px gap = 872px ✓\n"
            "  * 4+ cards: use 180-200px height OR switch to 2-column grid\n"
            "- If content doesn't fit: use smaller cards, fewer items, or multi-column layout\n"
            "- NEVER let flex/grid children auto-grow beyond available space - set explicit max-heights\n\n"
            "FIXED ELEMENT POSITIONS (MUST follow on EVERY slide for consistency across the deck):\n"
            "- Title: top-left (position:absolute; left:80px; top:50px), 48-56px font\n"
            "- Logo: bottom-left (position:absolute; left:60px; bottom:30px), max-height:40px; width:auto; object-fit:contain, pointer-events:none. Never enlarge, center, or dominate.\n"
            "- Page number: bottom-right (position:absolute; right:60px; bottom:30px), 13px, var(--text) at 40% opacity, pointer-events:none. Just the number (e.g. \"3\").\n"
            "- Source/footnote: bottom-right above page number if both present (right:60px; bottom:54px), 12px muted\n"
            "- These elements must be in IDENTICAL positions on every slide. Never move, center, enlarge, or omit them.\n\n"
            "LAYERING & POINTER EVENTS:\n"
            "- Background/decorative: z-index 1-10\n"
            "- Media: 20-30\n"
            "- Cards/containers: 40-50\n"
            "- Titles/headings: 100+\n"
            "- ⚠️ ALL decorative overlays (fog, gradients, corner decorations, watermarks) MUST have `pointer-events: none`\n"
            "- If an element is purely visual and not interactive, add `pointer-events: none` to prevent blocking text selection\n\n"
            "MOTION:\n"
            "- Subtle entrance only if it helps (fade/slide, short durations)\n"
            "- Entrance animations must keep elements within 1920x1080 bounds\n"
            "- No hover/click behavior, counters, or looping animations\n\n"
            "CRITICAL CSS RULES (MUST FOLLOW):\n"
            "- NEVER use `user-select: none` on universal selectors (*) - it completely breaks text selection\n"
            "- ALL content containers must have `overflow: hidden` to prevent content escaping bounds\n\n"
            "**IMAGE RULES**:\n"
            "- Use <img src=\"placeholder\" alt=\"VISUAL SEARCH QUERY\"> — system auto-replaces with real images.\n"
            "- Each image needs UNIQUE alt text. Choose specific, descriptive queries for good search results.\n"
            "- **SIZING (MUST FOLLOW TO PREVENT OVERFLOW)** — these rules apply to content images, NOT logos:\n"
            "  1. ALWAYS wrap images in a container with FIXED width AND height in PIXELS\n"
            "  2. Container MUST have: overflow:hidden; position:relative;\n"
            "  3. Image MUST have: width:100%; height:100%; object-fit:cover; position:absolute; top:0; left:0;\n"
            "  4. NEVER use width:auto or height:auto - images will expand and break the layout\n"
            "  5. NEVER let the image determine its container size - set container size FIRST\n"
            "  6. Example: <div style=\"width:400px;height:300px;overflow:hidden;position:relative;\"><img src=\"placeholder\" alt=\"aerial ocean waves turquoise\" style=\"width:100%;height:100%;object-fit:cover;position:absolute;top:0;left:0;\"></div>\n"
            "  7. EXCEPTION: Logos use max-height:40px; width:auto; object-fit:contain — do NOT wrap logos in sized containers\n"
            "- NEVER let images extend beyond 1920x1080 slide bounds\n\n"
            "OUTPUT: Complete HTML/CSS starting with <!DOCTYPE html>"
        )

    return (
        f"You are a professional slide designer. {design_guidance}\n\n"
        "🚨 #1 RULE - BUTTONS AND INTERACTIVE ELEMENTS MUST ALWAYS WORK 🚨\n"
        "This is the MOST IMPORTANT rule. Every button, tab, slider, and clickable element MUST be clickable and functional.\n"
        "The #1 cause of broken buttons is DECORATIVE OVERLAYS blocking clicks. Follow these rules STRICTLY:\n\n"
        "LAYERING & POINTER EVENTS (READ FIRST - buttons must be clickable):\n"
        "- ⚠️ EVERY element with position:absolute or position:fixed that is NOT interactive MUST have `pointer-events: none`\n"
        "  * This includes: gradient overlays, fog layers, background gradients, texture overlays, watermarks,\n"
        "    patterns, corner decorations, stamps, badges, paperclips, ribbons, tape effects, image gradient fades,\n"
        "    decorative shapes, glow effects, shadow overlays, vignette effects, film grain, noise textures,\n"
        "    data labels (.bar-value, .value-label), badges (.badge, .uplift-badge), progress bars (.progress-fill),\n"
        "    logo corners (.logo-corner), source notes (.source-note), ANY positioned text or shape overlays\n"
        "  * If it's NOT a button/tab/link/slider/input, add `pointer-events: none` to it\n"
        "  * Elements with negative top/left that extend into other areas are especially dangerous\n"
        "- ⚠️ CSS ::before and ::after pseudo-elements with position:absolute MUST have `pointer-events: none`\n"
        "  * Example: .tab-btn.active::before { position:absolute; pointer-events:none; }\n"
        "  * Pseudo-elements render ON TOP of their parent and will block clicks if not pointer-events:none\n"
        "- ⚠️ Interactive elements (buttons, tabs, sliders) MUST be at the TOP of the z-index stack\n"
        "  * The DIRECT parent <div> wrapping <button> elements MUST have `position: relative; z-index: 9999;`\n"
        "  * NOT a grandparent or ancestor - the IMMEDIATE wrapper div\n"
        "  * Example: <div class=\"tabs-nav\" style=\"position:relative; z-index:9999;\"><button>Tab 1</button>...</div>\n"
        "  * Example: <div class=\"controls\" style=\"position:relative; z-index:9999;\"><button>Btn</button>...</div>\n"
        "- Z-INDEX HIERARCHY: Background: 1-10; media: 20-30; content panels: 40-50; titles: 100+; INTERACTIVE: 9999\n"
        "- ⚠️ AFTER writing your HTML, mentally scan through EVERY element with position:absolute/fixed.\n"
        "  Ask: \"Is this element interactive?\" If NO → it MUST have pointer-events: none.\n"
        "- ⚠️ ABSOLUTELY NEVER use `user-select: none` on *, body, html, or any broad selector.\n"
        "  This is the #1 PROVEN cause of broken buttons. Even the comment 'prevents text selection during interaction'\n"
        "  is WRONG — user-select:none BREAKS click handling in iframe contexts. NEVER use it. ZERO exceptions.\n"
        "- ⚠️ NEVER use `clip-path` on containers that have interactive children - it clips the clickable hit area\n\n"
        "BUTTON/TAB RULES (CRITICAL):\n"
        "- ⚠️ ALWAYS use <button> elements for clickable items, NOT <div> or <span> with onclick\n"
        "- <button> has built-in accessibility, keyboard support, and reliable click handling\n"
        "- Every <button> MUST have a working onclick handler with actual JS logic\n"
        "- NEVER use <a href=\"#\"> or navigation links - they break the iframe\n"
        "- Tab/category buttons: hide ALL content panels first, then show the selected one\n"
        "- ⚠️ PANEL IMAGE SWITCHING (CRITICAL): When tabs/buttons switch content panels:\n"
        "  * Each panel/section MUST have its OWN unique image that matches its content\n"
        "  * The main display image MUST CHANGE when switching panels\n"
        "  * Store image URL/alt per item: items = [{title: 'X', image: 'placeholder', imageAlt: 'X visual'},...]\n"
        "  * On tab click: update BOTH the text content AND the displayed image\n"
        "  * Example: mainImage.src = items[index].image; mainImage.alt = items[index].imageAlt;\n"
        "  * WRONG: One static image for all tabs. RIGHT: Each tab shows its own relevant image.\n\n"
        "⚠️ CRITICAL HEIGHT CONSTRAINT ⚠️\n"
        "The slide is EXACTLY 1920x1080 pixels. Your content MUST fit within this.\n"
        "- MAXIMUM usable height: 1080px total, ~950px after title/header\n"
        "- BEFORE designing: Calculate total height = sum of all elements + gaps\n"
        "- If total > 950px: Use FEWER items, SMALLER cards, or MULTI-COLUMN layout\n"
        "- Content that extends below 1080px is INVISIBLE and BROKEN\n\n"
        f"{theme_info}\n\n"
        "DESIGN PRINCIPLES:\n"
        "- Use built visuals AND images — whichever fits the content best\n"
        "- Bold, creative visuals/diagrams that explain the idea\n"
        "- Clear hierarchy and strong composition\n"
        "- Fill the full canvas; keep content inside bounds\n"
        "- Maps: Use D3.js + TopoJSON (cdn.jsdelivr.net/npm/world-atlas@2/countries-110m.json for world, us-atlas for US). Style all land/water/borders with theme colors - never use external map tiles. Data points/dots MUST be positioned on the actual map geometry (use projection coordinates), not as random absolute-positioned overlays.\n\n"
        "BUILT COMPONENT IDEAS (use when they fit the content):\n"
        "- Process flows → SVG boxes with arrows and labels\n"
        "- Timelines → CSS/SVG timeline with milestones\n"
        "- Data → Chart.js/D3 charts, animated counters, gauges\n"
        "- Comparisons → Side-by-side cards or feature matrices\n"
        "- Architectures → SVG diagram with connected nodes\n"
        "- Mockups → HTML/CSS device frames with UI inside\n"
        "- Hierarchies → Tree diagrams, org charts\n"
        "- Funnels → SVG/CSS funnel stages\n"
        "- Cycles → Circular SVG diagrams with steps\n\n"
        "INTERACTION (use when appropriate):\n"
        "- Animated diagrams that build on click\n"
        "- Interactive timelines or step-throughs\n"
        "- Hover-to-reveal cards or accordions\n"
        "- Counters, SVG draw animations\n\n"
        "HOVER/INTERACTION RULES (CRITICAL - prevents jittering/shaking):\n"
        "- ⚠️ JITTER BUG: If hover effect changes element size/position, cursor enters/exits repeatedly = shaking\n"
        "- SAFE hover effects: opacity change, color change, box-shadow, border-color, background-color\n"
        "- DANGEROUS hover effects: scale > 1.02, padding change, margin change, width/height change\n"
        "- ⚠️ NEVER use transform: translateX() or translateY() on hover for buttons/tabs - it moves the element out from under the cursor causing a jitter loop that makes clicking impossible\n"
        "- ⚠️ NEVER use clip-path on buttons or interactive elements - it clips the clickable hit area and prevents clicks\n"
        "- If you MUST scale on hover:\n"
        "  * Use transform: scale(1.01) MAX - anything larger causes jitter\n"
        "  * Add padding/margin BUFFER around element so scaled size doesn't exceed hover zone\n"
        "  * Use will-change: transform for GPU acceleration\n"
        "  * transition: transform 0.15s ease-out (short duration reduces jitter visibility)\n"
        "- For clickable elements: use <button> with cursor:pointer, NOT custom div with hover\n"
        "- NEVER use hover to show/hide overlays that cover the trigger element\n"
        "- If ANY jittering occurs during testing, REMOVE the hover effect entirely\n"
        "- Prefer click interactions over hover - they're more reliable\n\n"
        "CHART RULES (Chart.js, D3, ApexCharts):\n"
        "- Give charts FIXED dimensions in pixels, never % or flex-grow\n"
        "- Wrap in a fixed-size container to prevent infinite growth\n"
        "- Always include CDN script tags BEFORE your code\n"
        "- Wrap initialization in DOMContentLoaded or place script at end of body\n"
        "- Chart.js needs <canvas> with explicit width/height attributes\n"
        "- D3 needs <svg> with explicit width/height attributes\n\n"
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
        "VERTICAL LAYOUT BUDGET (CRITICAL - prevents bottom overflow):\n"
        "- Available height after header (title ~100px + padding): ~950px max for body content\n"
        "- When stacking items vertically, CALCULATE FIRST: N × item_height + (N-1) × gap ≤ available_height\n"
        "- SAFE LIMITS for vertical stacks:\n"
        "  * 2 cards: max 400px each with 24px gap = 824px ✓\n"
        "  * 3 cards: max 280px each with 16px gap = 872px ✓\n"
        "  * 4+ cards: use 180-200px height OR switch to 2-column grid\n"
        "- If content doesn't fit: use smaller cards, fewer items, or multi-column layout\n"
        "- NEVER let flex/grid children auto-grow beyond available space - set explicit max-heights\n\n"
        "CRITICAL CSS RULES (MUST FOLLOW):\n"
        "- ALL expandable/accordion panels MUST have `overflow: hidden` on BOTH the panel container AND the content-overlay/description wrapper to prevent content escaping bounds\n\n"
        "EXTERNAL RESOURCES (CRITICAL - prevents broken slides):\n"
        "- ⚠️ NEVER load Tailwind CSS CDN (<script src=\"cdn.tailwindcss.com\">) — it adds massive overhead, breaks thumbnail rendering, and is NEVER needed. Write ALL CSS in <style> tags.\n"
        "- ⚠️ NEVER use CSS @import to load images or non-CSS files — @import is ONLY for CSS stylesheets and fonts\n"
        "- ⚠️ Write ALL custom styles in <style> tags inside <head>. No external CSS frameworks.\n"
        "- ALLOWED external scripts: Chart.js, D3.js, ApexCharts, TopoJSON CDNs (chart/data libraries ONLY)\n"
        "- ⚠️ FONT LOADING REQUIRED: If your CSS references custom fonts (Google Fonts, etc.), you MUST include <link> tags in <head>:\n"
        "  * Example: <link href=\"https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap\" rel=\"stylesheet\">\n"
        "  * Without <link> tags, fonts silently fall back to ugly system defaults\n\n"
        "**IMAGE RULES**:\n"
        "1. STATIC HTML IMAGES: <img src=\"placeholder\" alt=\"VISUAL SEARCH QUERY\">\n"
        "   - System auto-replaces placeholder with real image from search.\n"
        "   - Each image needs UNIQUE, specific alt text for good search results.\n"
        "2. JAVASCRIPT ARRAYS (tabs, cards, sliders with multiple images):\n"
        "   - EVERY item in your data array MUST have its own image property and imageAlt:\n"
        "   - JS: const items = [\n"
        "       { title: 'Mountains', image: 'placeholder', imageAlt: 'snow capped mountain peak sunrise' },\n"
        "       { title: 'Ocean', image: 'placeholder', imageAlt: 'turquoise ocean waves aerial view' }\n"
        "     ]\n"
        "   - On tab click, update both text AND image: mainImage.src = items[i].image;\n"
        "3. **SIZING (MUST FOLLOW TO PREVENT OVERFLOW)** — these rules apply to content images, NOT logos:\n"
        "   - ALWAYS wrap images in a container with FIXED width AND height in PIXELS\n"
        "   - Container MUST have: overflow:hidden; position:relative;\n"
        "   - Image MUST have: width:100%; height:100%; position:absolute; top:0; left:0;\n"
        "   - NEVER use width:auto or height:auto - images WILL expand and break the slide layout\n"
        "   - **object-fit**: Use `cover` for atmospheric/background, `contain` for logos/products/screenshots\n"
        "   - EXCEPTION: Logos use max-height:40px; width:auto; object-fit:contain — do NOT wrap logos in sized containers\n\n"
        "**INTERACTIVITY RULES (CRITICAL - ALL INTERACTIONS MUST WORK)**:\n"
        "1. EVERY interactive element MUST have a working handler that DOES something visible:\n"
        "   - Buttons: onclick must change content, toggle visibility, or update state\n"
        "   - Tabs: clicking a tab MUST show its content and hide others\n"
        "   - Sliders: sliding MUST update a visible value or change something on screen\n"
        "   - Accordions: clicking MUST expand/collapse content\n"
        "2. If tabs have images, each tab must switch its own image on click.\n"
        "3. TEST YOUR LOGIC: mentally trace each interaction — if nothing visible happens, it's broken.\n"
        "4. COMMON MISTAKES TO AVOID:\n"
        "   - Empty onclick handlers\n"
        "   - Buttons styled to look clickable but with no handler\n"
        "   - Tabs that don't actually switch content\n"
        "5. USE SIMPLE, PROVEN PATTERNS:\n"
        "   - Sliders: oninput=\"document.getElementById('output').textContent = this.value\"\n\n"
        "🚨 FINAL CHECKLIST - VERIFY BEFORE OUTPUT 🚨\n"
        "Before outputting your HTML, verify ALL of these:\n"
        "□ Every <button> has a working onclick handler with real JS logic\n"
        "□ The DIRECT parent div of <button> elements has position:relative; z-index:9999\n"
        "□ Every element with position:absolute/fixed that is NOT interactive has pointer-events:none\n"
        "□ Every ::before/::after pseudo-element with position:absolute has pointer-events:none\n"
        "□ Data labels, badges, value overlays, progress bars, logo corners all have pointer-events:none\n"
        "□ No gradient overlays, fog layers, or decorative elements blocking buttons\n"
        "□ ZERO instances of `user-select: none` anywhere — search your code and DELETE any\n"
        "□ No `clip-path` on containers that hold interactive elements\n"
        "□ All content fits within 1920x1080 - nothing cut off at bottom\n"
        "□ Each tab/panel has its own unique image that switches on click\n"
        "□ No Tailwind CDN or external CSS frameworks — all styles written in <style> tags\n"
        "□ All referenced fonts have <link> tags in <head> for loading (e.g. Google Fonts)\n"
        "□ No @import for images or non-CSS resources\n\n"
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

    # Title slide (slide 1) gets special treatment
    is_title_slide = slide_context.get("slide_index", 0) == 0
    if is_title_slide:
        sections.append(
            "⚠️ TITLE SLIDE: This is the OPENING slide. Design a visually striking title page that sets the tone for the deck.\n"
            "  - Keep it SIMPLE: title + optional subtitle/tagline. No bullet points, no paragraphs, no content blocks\n"
            "  - No tabs, no cards, no lists, no interactive elements, no explore/CTA buttons. Just the title page.\n"
            "  - Optional: metadata row (presenter, date, org) if relevant"
        )

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
            k: v for k, v in prefetched_images.items()
            if not k.endswith("_query") and not k.endswith("_width") and not k.endswith("_height")
            and isinstance(v, str)
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

    sections.append("REMINDER: You can build diagrams, flows, charts, and infographics with HTML/CSS/SVG, and use images where they enhance the slide. Use both tools.")
    sections.append("OUTPUT: Complete HTML starting with <!DOCTYPE html>.")
    return "\n".join(sections)
