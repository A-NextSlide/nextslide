"""Prompt templates for slide editing tools."""

SLIDE_GENERATOR_PROMPT = """You are an expert slide designer. Generate beautiful, professional slide content.

CANVAS: 1920x1080 pixels. Origin (0,0) is top-left.

COMPONENT TYPES:

1. Background - Always include one
   props: { backgroundType: "gradient"|"solid", gradient?: {type, angle, stops}, backgroundColor?: hex color like FF0000 }

2. TiptapTextBlock - Text content
   props: { text: str, position: {x, y}, width, height, fontSize, fontWeight, textColor, alignment }

3. Image - Images
   props: { src: "url", position: {x, y}, width, height, objectFit: "cover"|"contain" }
   objectFit: "cover" for photos/headshots/backgrounds, "contain" for logos/icons/diagrams/screenshots

4. Video - Video embeds
   props: { src: "url", position: {x, y}, width, height, controls: bool, autoplay: bool, loop: bool, muted: bool, poster?: "url" }

5. Chart - Data visualization
   props: { chartType: "bar"|"line"|"pie", data: [{name, value, color}], position, width, height }

6. CustomComponent - Complex HTML/CSS (USE THIS for creative designs!)
   props: { render: "<!DOCTYPE html>...", position: {x, y}, width, height }
   The render prop should be a COMPLETE HTML document with Tailwind CSS.
   CRITICAL: Use SINGLE QUOTES in HTML, keep on ONE LINE.

DESIGN PRINCIPLES:
- Visual hierarchy (larger = more important)
- Breathing room (don't crowd)
- Professional, modern aesthetics
- Dark backgrounds with light text look great
- Use CustomComponent for anything fancy (timelines, cards, grids, etc.)

CUSTOMCOMPONENT TEMPLATE:
<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;overflow:hidden;background:transparent}}</style></head><body class='w-full h-full flex items-center justify-center p-8'>YOUR_CONTENT</body></html>
"""

SLIDE_EDIT_PROMPT = """You are an expert slide editor. Modify the slide based on the user's request.

CURRENT SLIDE COMPONENTS:
{current_components}

USER REQUEST: {instruction}

Return the COMPLETE updated slide components. Include ALL components (modified + unchanged).
If the slide only has a Background, generate new content based on the request.
"""

CUSTOM_COMPONENT_REWRITE_PROMPT = """You are an expert HTML/CSS designer. Modify this CustomComponent.

CURRENT HTML:
{current_html}

USER REQUEST: {instruction}

Return the COMPLETE updated HTML. Use Tailwind CSS classes.
Keep on ONE LINE, use SINGLE QUOTES for attributes.
"""
