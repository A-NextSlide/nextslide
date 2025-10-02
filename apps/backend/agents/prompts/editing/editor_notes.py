from typing import Tuple

def get_editor_notes(canvas_size: Tuple[int, int]) -> str:
    width, height = canvas_size
    
    # Component guidelines are now in slide_generation_prompts.py
    
    return f"""
Editor's notes on coordinate system:
- Canvas size: {width}x{height} pixels
- Origin (0,0) is at the top-left corner
- X increases rightward, Y increases downward
- All positions are in pixels
- Component position refers to its top-left corner
- Ensure components stay within canvas bounds

[Detailed component guidelines are in slide_generation_prompts.py]

CRITICAL POSITIONING RULES:
1. PREVENT OVERLAPPING:
   - Calculate bounding boxes: x, y, x+width, y+height
   - Ensure no component's bounding box intersects another's
   - Minimum spacing between components: 20px
   - For stacked components: previous.y + previous.height + 20px

2. VERTICAL STACKING FORMULA (MANDATORY):
   - First component: Y = 120 (standard title position)
   - Each next component: Y = Previous.Y + Previous.Height + 60
   - Example calculation:
     * Component 1: Y=120, Height=140 → Bottom=260
     * Component 2: Y=320 (260 + 60 gap)
     * Component 3: Y=520 (if Comp2 height=140, bottom=460, +60)
   - NEVER skip the cumulative calculation!
   - Minimum vertical gap: 40px

3. DIVIDER LINES AND SHAPES:
   - ALWAYS position dividers BELOW text with proper gap
   - Divider Y = text.y + text.height + 20px minimum
   - Never place dividers on top of or overlapping text
   - Use consistent divider styling (2-4px height, subtle color)

4. LIST FORMATTING IN TIPTAPTEXTBLOCK:
   - For bullet points, prefix each item with "• " (bullet + space)
   - For numbered lists, prefix with "1. ", "2. ", etc.
   - Each list item should be on a new line within the text
   - Indent sub-items with spaces: "  • Sub-item"
   - Example: "• First point\\n• Second point\\n• Third point"

5. SHAPE AND LINE ALIGNMENT:
   - Align shapes WITH text baselines, not arbitrary positions
   - For underlines: y = text.y + text.height - 5
   - For background shapes: 
     * x = text.x - 10
     * y = text.y - 10
     * width = text.width + 20
     * height = text.height + 20
   - For divider lines between sections:
     * x = container.x
     * y = previousComponent.y + previousComponent.height + 30
     * width = container.width

6. RESPONSIVE SIZING:
   - Text blocks should resize based on content
   - Don't use fixed heights that cut off text
   - Width should be proportional to canvas: 
     * Full width text: canvas.width - 200px
     * Half width: (canvas.width - 300px) / 2
     * Third width: (canvas.width - 400px) / 3

Example positioning:
- Title at (100, 100) with width={width-200} ensures centered appearance with margins
- Body text at (100, 250) leaves room for title
- Ensure each subsequent element's Y position accounts for previous element's height

In terms of the coordinate system: the canvas is size {width}x{height}
The position of the components (x, y) reference the location of the top left of the component.
The dimensions of the components (width, height) reference the width and height of the element.
Therefore, the position of the bottom right of the component is (x + width, y + height).
DO NOT USE PERCENTAGES FOR POSITION, WIDTH, OR HEIGHT. 
USE PIXELS FROM (x=0,y=0)->(x=1920,y=1080) FOR POSITION, WIDTH, OR HEIGHT.
WHAT YOU ARE EDITING ARE PROPERTIES FOR ELEMENT IN A WEB ENVIRONMENT

THE TOP LEFT OF COORDINATE SYSTEM IS (x=0, y=0)
MIDDLE OF COORDINATE SYSTEM IS (x=960, y=540)
THE BOTTOM RIGHT OF COORDINATE SYSTEM IS (x=1920, y=1080)
THE TOP IS y=0
THE BOTTOM IS y=1080
THE LEFT IS x=0
THE RIGHT IS x=1920

THE PROPS (x, y) ON A COMPONENT REFERENCE THE TOP LEFT OF THE COMPONENT
THE CENTER OF THE COMPONENT IS (x + width/2, y + height/2)

THE PROPERTIES ("position", "width", and "height") ARE ALL SPECIFIED IN THIS REFERENCE FRAME; YOUR RESPONSE SHOULD BE TOO
IF YOU ARE CONFUSED ABOUT THE COORDINATE SYSTEM, PLEASE INDICATE IN YOUR RESPONSE

When editing components, you have available to you the Types and Properties from the registry

IMPORTANT COMPONENT CREATION RULES:
- CREATE AS MANY COMPONENTS AS NECESSARY to display all content properly
- Don't try to fit all content into a few components - use more components for better design
- For detailed content, create separate TextBlocks for each major point or paragraph
- Add visual elements (shapes, lines, images) to create professional layouts
- The goal is a visually appealing slide, not minimal component count

CREATIVE DESIGN FREEDOM:
- NO LIMITS: Use 1 shape or 1000 - whatever serves your vision
- BREAK RULES: Typography can be tiny or massive
- EXPERIMENT: Shapes can be letters, backgrounds, or pure art
- MIX EVERYTHING: Layer components in unexpected ways
- BE BOLD: Safe design is forgotten, brave design is remembered
- TRUST YOUR INSTINCTS: If it feels right, it probably is

SOME CREATIVE POSSIBILITIES:
- Shapes creating letterforms
- Text as texture, repeated 100 times
- Charts that look like abstract art
- Images sliced by shapes
- Components overlapping in "wrong" ways
- Empty space that speaks volumes
- Chaos that somehow makes perfect sense

CREATIVE TECHNIQUES TO EXPLORE:

1. DATA AS ART:
   - Build charts with shapes if it looks amazing
   - Use Chart component in unexpected ways
   - Make data emotional, not just informational
   - Let numbers dance across the slide
   
2. PROGRESS AS STORY:
   - Stack rectangles into a cityscape
   - Use CustomComponents for living, breathing progress
   - Make progress bars that aren't bars at all
   - Show progress through color, size, position, rotation
   
3. COMPARISONS AS DRAMA:
   - Overlap everything if it creates tension
   - Use typography as weapons in a visual battle
   - "87%" crushing "45%" with sheer size
   - Or make them dance together in harmony
   
4. EMPHASIS THROUGH SURPRISE:
   - Hide important numbers in unexpected places
   - Make them TINY to force attention
   - Or SO BIG they break the slide boundaries
   - Use every component type for emphasis
   
5. HIERARCHY THROUGH CHAOS:
   - Sometimes organized chaos IS the hierarchy
   - Use ALL the shapes if they guide the eye
   - Break sections with color explosions
   - Or use absolute silence (empty space)

REMEMBER: There are no rules. Only choices. Make brave ones.
"""