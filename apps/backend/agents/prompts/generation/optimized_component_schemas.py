"""
Optimized Component Schemas for AI Generation

PHILOSOPHY:
- Encourage CustomComponent for complex visualizations
- Encourage Icon usage for semantic meaning
- Minimize verbose schemas - only show what's needed
- Provide templates, not exhaustive prop lists
"""

def get_optimized_component_schemas() -> str:
    """
    Streamlined component schemas that encourage CustomComponent usage.
    
    Instead of passing ALL component props, we:
    1. Show CORE components (Background, TiptapTextBlock, Image) with full props
    2. Show SIMPLE components (Lines, Icon) with minimal guidance
    3. ENCOURAGE CustomComponent for everything else (stats, cards, layouts)
    4. DISCOURAGE complex components (Chart, Table) in favor of CustomComponent
    """
    return """
═══ CORE COMPONENTS (Use These) ═══

**Background** { backgroundType: "color"|"gradient"|"image", fill, gradient }
  • Use "color" for solid backgrounds (most common)
  • Use "gradient" for visual interest (angle: 135, stops with color/opacity)

**TiptapTextBlock** { position: {x, y}, width, height, texts: [{text, style}], fontSize, fontFamily, alignment, verticalAlignment, padding }
  • Main text component for ALL text content
  • texts array allows multi-color formatting: [{ text: "Revenue: ", style: {textColor: "{{primary}}"}}, { text: "$2.5M", style: {bold: true, textColor: "{{accent}}"}}]
  • Required: position, texts, fontSize, alignment, verticalAlignment
  • Heights: fontSize × 1.15 (tight fit)
  • ALWAYS set alignment ('left'|'center'|'right') and verticalAlignment ('top'|'middle'|'bottom')
  • padding: Always 0 (numeric)

**Image** { position, width, height, src: "placeholder", objectFit: "cover"|"contain", borderRadius, opacity }
  • Use src="placeholder" (system fills images)
  • objectFit="cover" for backgrounds, "contain" for logos
  • Creative borders: borderRadius can be "50%" (circle), "20px", asymmetric "20px 80px 20px 80px"

**Lines** { startPoint: {x, y}, endPoint: {x, y}, stroke: {color, width, opacity} }
  • Simple dividers and connectors
  • Calculate Y position: previousComponent.y + previousComponent.height + gap

**Shape** { position, width, height, shapeType: "rectangle"|"circle", fill, stroke, strokeWidth, borderRadius }
  • Use for: Callout boxes, badges, step numbers, highlighted sections
  • 🚨 **TEXT INSIDE SHAPES - MUST CENTER:**
    - Text alignment="center", verticalAlignment="middle"
    - Text zIndex > shape zIndex
    - Account for padding: textWidth = shapeWidth - (padding×2)
    - Example: 400×200 shape → text at 360×160 with 20px padding

═══ BANNED COMPONENTS (DO NOT USE) ═══

🚫 **SmartLayout** - BANNED. Too basic. Use CustomComponent with full HTML/Tailwind instead.
🚫 **StatCard** - BANNED. Use CustomComponent with Tailwind stat cards.
🚫 **BigTitle** - BANNED. Use CustomComponent with styled headings.
🚫 **SmartImage** - BANNED. Use Image or CustomComponent.

These "smart" components produce generic, boring designs. Always use CustomComponent (Iframe Mode) for unique, branded layouts!


═══ CUSTOMCOMPONENT (Preferred for Complex UI) ═══

**CustomComponent** { position, width, height, render: "HTML String OR Function", [custom props] }

🚨 **CRITICAL SIZE REQUIREMENTS:**
• **MINIMUM SIZE**: width=1200px, height=500px for main content
• **RECOMMENDED**: width=1760px (full width), height=700px
• **Position**: x=80, y=240 (after title area)
• **NEVER create tiny CustomComponents** - they look bad and waste space!

📏 **SIZE PRESETS:**
• Full-width: x=80, y=240, width=1760, height=700
• Left half: x=80, y=240, width=840, height=700
• Right half: x=1000, y=240, width=840, height=700

  🚀 **UNLIMITED CREATIVE FREEDOM (IFRAME MODE):**
  You can now output a **FULL HTML DOCUMENT** (starting with `<!DOCTYPE html>`).
  This runs in an **isolated IFRAME**, so you can use **Tailwind CSS**, **Framer Motion**, or ANY library via CDN!
  
  ✨ **RECOMMENDED FOR RICH UI:**
  1. Start with `<!DOCTYPE html><html><head>...`
  2. Add Tailwind: `<script src="https://cdn.tailwindcss.com"></script>`
  3. Add Fonts: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">`
  4. Write standard HTML/JS (no React complexity needed!)
  
  🎮 **INTERACTIVITY & DESIGN RULES:**
  • **HOVER EFFECTS**: MANDATORY! Use `hover:scale-105`, `hover:bg-white/10`, `transition-all duration-300`.
  • **CLICKABLE**: Make cards/buttons look clickable (`cursor-pointer`).
  • **CONTENT FITTING**: 🚨 CRITICAL! Text MUST fit the box. Use `truncate`, `line-clamp-2`, or keep text short.
  • **SCROLLING**: Avoid scrolling if possible. Fit content to the container height.

  🚫🚫🚫 **ABSOLUTELY BANNED - NEVER CREATE:** 🚫🚫🚫
  • ❌ **CARD GRIDS FOR TEXT** - NO grids of 3-6 colored cards with text! Use Icon+Text instead!
  • ❌ **RAINBOW COLORS** - NO blue/purple/red/orange/green card grids - looks TERRIBLE
  • ❌ **HARDCODED COLORS** - NO `from-indigo-500`, `text-cyan-400` - USE THEME PROPS!
  • ❌ **CONTENT IN CARDS** - Text content should be Icon+TiptapTextBlock, NOT CustomComponent!

  🎨🎨🎨 **MANDATORY: USE THEME COLORS IN CUSTOMCOMPONENT!** 🎨🎨🎨

  CustomComponent receives these props - YOU MUST USE THEM:
  ```
  props.primaryColor   = "{{accent}}"      // Main accent color
  props.secondaryColor = "{{secondary}}"   // Secondary color
  props.textColor      = "{{text}}"        // Text color
  props.fontFamily     = "{{bodyFont}}"    // Theme font
  ```

  **HOW TO USE IN IFRAME HTML:**
  ```html
  <style>
    :root {
      --accent: ${props.primaryColor || '#6366f1'};
      --text: ${props.textColor || '#1f2937'};
      --font: ${props.fontFamily || 'Inter'};
    }
    .accent-text { color: var(--accent); }
    .main-text { color: var(--text); font-family: var(--font); }
  </style>
  ```

  ✅ **WHEN TO USE CUSTOMCOMPONENT:**
  • Animated counters/stats with numbers counting up
  • Interactive elements (quizzes, calculators, polls)
  • Animated progress bars/gauges
  • Visual data displays (NOT for text lists!)

  ❌ **WHEN NOT TO USE CUSTOMCOMPONENT:**
  • Bullet point lists → Use Icon + TiptapTextBlock pairs
  • Feature descriptions → Use Icon + TiptapTextBlock pairs
  • Any text-heavy content → Use Icon + TiptapTextBlock pairs

  📦 **THEME-AWARE TEMPLATE - ANIMATED STAT COUNTER:**
  ```json
  "render": "<!DOCTYPE html><html><head><meta charset='UTF-8'><script src='https://cdn.tailwindcss.com'></script><style>:root{--accent:${props.primaryColor || '#6366f1'};--text:${props.textColor || '#1f2937'};--font:'${props.fontFamily || 'Inter'}',sans-serif}*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:transparent}body{font-family:var(--font);display:flex;align-items:center;justify-content:center}@keyframes countUp{from{opacity:0;transform:scale(0.5)}to{opacity:1;transform:scale(1)}}.stat{animation:countUp 0.8s ease-out forwards}</style></head><body><div class='text-center'><div class='stat text-8xl font-black' style='color:var(--accent)'>$2.5B</div><div class='mt-4 text-2xl font-medium' style='color:var(--text);opacity:0.8'>Annual Revenue</div></div></body></html>"
  ```

  📦 **THEME-AWARE TEMPLATE - PROGRESS GAUGE:**
  ```json
  "render": "<!DOCTYPE html><html><head><meta charset='UTF-8'><script src='https://cdn.tailwindcss.com'></script><style>:root{--accent:${props.primaryColor || '#6366f1'};--text:${props.textColor || '#1f2937'}}*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:transparent}.progress-ring{transform:rotate(-90deg)}.progress-ring circle{transition:stroke-dashoffset 1s ease-out}</style></head><body class='flex items-center justify-center h-full'><div class='text-center'><svg class='progress-ring w-48 h-48'><circle cx='96' cy='96' r='80' stroke='#e5e7eb' stroke-width='12' fill='none'/><circle cx='96' cy='96' r='80' stroke='var(--accent)' stroke-width='12' fill='none' stroke-dasharray='502' stroke-dashoffset='125' stroke-linecap='round'/></svg><div class='text-5xl font-bold mt-4' style='color:var(--text)'>75%</div><div class='text-xl mt-2' style='color:var(--text);opacity:0.7'>Completion Rate</div></div></body></html>"
  ```
  
  🔴 **CRITICAL - ALWAYS INCLUDE THESE STYLES:**
  `<style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:transparent}body{font-family:'Inter',sans-serif;display:flex;align-items:center;justify-content:center;padding:32px}</style>`
  
  This ensures:
  • Content fills 100% of the container (not tiny)
  • No unwanted margins/padding
  • Content is centered with padding
  • Background is transparent (shows slide background)
  
  🚨 **CRITICAL JSON FORMATTING RULES:**
  1. **NO REAL NEWLINES**: The `render` string must be a SINGLE LINE. Use `\n` for newlines if needed.
  2. **ESCAPE DOUBLE QUOTES**: If you use double quotes inside the HTML, you MUST escape them: `class=\"bg-blue-500\"`.
  3. **USE SINGLE QUOTES**: To avoid escaping hell, **USE SINGLE QUOTES** for all HTML attributes: `class='bg-blue-500'`.
  4. **VALID JSON**: The output must be valid JSON. Do not break the string with unescaped characters.

  🚫 **REACT MODE BANNED:**
  DO NOT use `React.createElement`. Designs are too limited.
  ALWAYS use full HTML documents with Tailwind CSS for maximum creative freedom.
  
  🛠️ **AVAILABLE LIBRARIES (Via CDN):**
  • **Tailwind CSS**: `<script src="https://cdn.tailwindcss.com"></script>`
  • **Google Fonts**: `<link href="..." rel="stylesheet">`
  • **Chart.js**: `<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>`
  • **Anime.js**: `<script src="https://cdnjs.cloudflare.com/ajax/libs/animejs/3.2.1/anime.min.js"></script>`
  • **Three.js**: `<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>`
  
  🎮 **INTERACTIVITY:**
  • Write standard JavaScript inside `<script>` tags.
  • Use `document.getElementById` to manipulate DOM.
  • Add event listeners normally.

  ⚠️ **CRITICAL JAVASCRIPT RULES:**
  • 🚨 **NEVER use `<` in JavaScript comparisons!** It can break HTML parsing.
    - ❌ BAD: `if (x < 10)` or `for (i < arr.length)`
    - ✅ GOOD: `if (x <= 9)` or `for (i <= arr.length - 1)`
    - ✅ GOOD: Use `>=` instead: `if (10 > x)` or flip the comparison
  • 🚨 **Place `<script>` tags BEFORE `</body>`** - never after!
  • Use `var` instead of `let`/`const` for maximum compatibility.
  • For loops: `for (var i = 0; i <= items.length - 1; i++)` instead of `i < items.length`

═══ BANNED COMPONENTS IN CREATIVE MODE ═══

**Chart** - 🚫 DO NOT USE IN CREATIVE MODE
  • In creative mode: USE CustomComponent for ALL data visualizations
  • In structured mode ONLY: If you have 15+ data points AND complex trends, Chart is acceptable
  • { position, width: ≤850, height: ≤600, chartType, data, colors, showLegend: false }
  • ALWAYS add title above (TiptapTextBlock, 28pt, 40px above)
  • Verify boundaries: x + width ≤ 1840, y + height ≤ 1020
  • 🎯 BETTER: CustomComponent with animated, branded visualization

**Table** - 🚫 Strongly discouraged - use CustomComponent instead
  • If you MUST use Table: { position, width, height, rows: [[{text, style}]], backgroundColor: null, borderWidth: 0 }
  • 🎯 BETTER: CustomComponent with styled card grid layout

═══ WHEN TO USE WHAT ═══

✅ **Use TiptapTextBlock for:**
  • All text content (headlines, body, bullets)
  • Multi-color formatted text

✅ **Use Icon + TiptapTextBlock PAIRS for:**
  • 📝 Bullet point lists (MOST RELIABLE!)
  • 📋 Feature descriptions
  • 📌 Step-by-step instructions
  • 🔖 Any content with 3+ text items

  WHY: This pattern ALWAYS works and never overflows!
  HOW: Icon (36px) at x=120, Text at x=172 (16px gap), repeat vertically with 80-100px spacing

✅ **Use CustomComponent ONLY for:**
  • 📊 Data visualizations (bars, lines, pies, gauges)
  • 📈 Stats/metrics with ANIMATIONS (counters, progress rings)
  • 🎴 Visual card layouts (NOT text lists!)
  • 📱 Dashboards (2+ metrics in a grid)
  • ⚡ Interactive elements (quizzes, polls, calculators)
  • 🎨 Creative visualizations that need custom styling

🚫 **DON'T use CustomComponent for:**
  • Simple text lists (use Icon + Text instead!)
  • Bullet points (use Icon + TiptapTextBlock!)
  • Feature descriptions (use Icon + Text pairs!)

  CustomComponent often BREAKS with text-heavy content - the text overflows!

✅ **Use Icon for:**
  • Dashboard metric icons (1-2 per slide MAX)
  • Critical semantic indicators
  • NEVER for bullets or decoration
  • 🚨 **CENTER-ALIGN with text:** iconY = textY + ((fontSize×1.15) - iconHeight)/2

✅ **Use Image for:**
  • Visual content (photos, diagrams, illustrations)
  • Logo placement (objectFit="contain")

🚫 **NEVER USE:**
  • Chart component in creative mode (use CustomComponent)
  • Decorative shapes (use CustomComponent backgrounds instead)
  • Tables (use CustomComponent card grids)
  • Multiple icons (keep it minimal - 0-2 max)

═══ COLOR UTILITIES (CustomComponent Only) ═══

Available functions in CustomComponent render:
  • getContrastTextColor(bgColor) → Returns '#000000' or '#ffffff' for optimal contrast
  • isLightColor(color) → Returns true if color is light
  • getThemeAppropriateChartColors(bgColor, count) → Returns array of theme-appropriate colors

🚨 ALWAYS use getContrastTextColor(bgColor) for text on colored backgrounds!

═══ EXAMPLE SLIDE (Preferred Approach) ═══

INSTEAD OF: Shape + TiptapTextBlock + Icon + Chart
USE: Background + TiptapTextBlock + CustomComponent

```json
[
  {"type": "Background", "props": {"backgroundType": "color", "fill": {"color": "{{primary}}"}}},
  {"type": "TiptapTextBlock", "props": {"position": {"x": 80, "y": 80}, "texts": [{"text": "Revenue Dashboard", "style": {"textColor": "{{secondary}}", "bold": true}}], "fontSize": 80, "width": 1760, "height": 100, "alignment": "left", "verticalAlignment": "top"}},
  {"type": "CustomComponent", "props": {
    "position": {"x": 80, "y": 240},
    "width": 1760,
    "height": 700,
    "primaryColor": "{{accent}}",
    "items": [
      {"label": "Q1 Revenue", "value": "$2.5M"},
      {"label": "Q2 Revenue", "value": "$3.1M"},
      {"label": "Growth", "value": "+24%"}
    ],
    "render": "function render({props}){var items=props.items||[];var pc=props.primaryColor||'#3B82F6';var tc=getContrastTextColor(pc);return React.createElement('div',{style:{display:'flex',gap:'60px',width:'100%',height:'100%'}},items.map(function(item,i){return React.createElement('div',{key:i,style:{flex:1,background:pc,padding:'48px',borderRadius:'20px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'}},[React.createElement('div',{style:{fontSize:'80px',fontWeight:'900',color:tc}},item.value),React.createElement('div',{style:{fontSize:'32px',color:tc,marginTop:'16px',opacity:0.9}},item.label)]);}));}"
  }}
]
```

This approach:
• Reduces component count (3 vs 10+)
• Better design control
• More maintainable
• Better visual consistency
• Smaller JSON output
"""

def get_customcomponent_emphasis() -> str:
    """Additional emphasis on CustomComponent usage"""
    return """
🎯 CUSTOMCOMPONENT PHILOSOPHY:

Think: "Can this be a CustomComponent?" (Answer is almost always YES!)

Stats? → CustomComponent
Cards? → CustomComponent  
Dashboard? → CustomComponent
Timeline? → CustomComponent
Comparison? → CustomComponent
Pricing? → CustomComponent

ONLY use primitive components (TiptapTextBlock, Image, Background, Lines) when they're genuinely the simplest solution.

For ANY visual complexity beyond plain text or images → USE CUSTOMCOMPONENT!
"""

