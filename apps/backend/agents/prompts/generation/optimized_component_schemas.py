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

═══ SMART COMPONENTS (Preferred for Layouts) ═══


**SmartLayout** { layout: "SplitRight"|"SplitLeft"|"GridLayout"|"HeroLayout"|"CenterLayout", slots: { [slotName]: { type, props } } }
  • USE ONLY FOR BASIC TEXT LAYOUTS.
  • layout="SplitRight": Left=content, Right=visual. Slots: "left", "right".
  • layout="SplitLeft": Left=visual, Right=content. Slots: "left", "right".
  • layout="GridLayout": Auto-grid for items. Slots: "item1", "item2", etc.
  • layout="HeroLayout": Centered title + subtitle. Slots: "title", "subtitle".
  • layout="CenterLayout": Centered content. Slots: "center".
  • Example:
    {
      "type": "SmartLayout",
      "props": {
        "layout": "SplitRight",
        "slots": {
          "left": { "type": "TiptapTextBlock", "props": { "texts": [{"text": "Title"}] } },
          "right": { "type": "CustomComponent", "props": { "render": "..." } }
        }
      }
    }

🚫 **StatCard** - DO NOT USE. Use CustomComponent to build your own card.
🚫 **BigTitle** - DO NOT USE. Use TiptapTextBlock with large font.
🚫 **SmartImage** - DO NOT USE. Use Image or CustomComponent.


═══ CUSTOMCOMPONENT (Preferred for Complex UI) ═══

**CustomComponent** { position, width, height, render: "HTML String OR Function", [custom props] }
  
  🚀 **UNLIMITED CREATIVE FREEDOM (IFRAME MODE):**
  You can now output a **FULL HTML DOCUMENT** (starting with `<!DOCTYPE html>`).
  This runs in an **isolated IFRAME**, so you can use **Tailwind CSS**, **Framer Motion**, or ANY library via CDN!
  
  ✨ **RECOMMENDED FOR RICH UI:**
  1. Start with `<!DOCTYPE html><html><head>...`
  2. Add Tailwind: `<script src="https://cdn.tailwindcss.com"></script>`
  3. Add Fonts: `<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;700&display=swap" rel="stylesheet">`
  4. Write standard HTML/JS (no React complexity needed!)
  
  📦 **EXAMPLE (Tailwind Card) - MUST BE A SINGLE LINE STRING:**
  ```json
  "render": "<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><link href='https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap' rel='stylesheet'><style>body{font-family:'Inter',sans-serif;background:transparent;overflow:hidden}</style></head><body class='flex items-center justify-center h-screen w-screen p-4'><div class='bg-white/90 backdrop-blur-xl rounded-3xl shadow-2xl p-8 w-full h-full flex flex-col border border-white/20'><div class='flex justify-between items-start mb-8'><div><h1 class='text-5xl font-extrabold text-slate-900 tracking-tight'>Revenue Growth</h1><p class='text-xl text-slate-500 mt-2 font-medium'>Year over Year Analysis</p></div><div class='bg-blue-600 text-white px-6 py-2 rounded-full font-bold text-lg shadow-lg shadow-blue-600/30'>+127%</div></div><div class='flex-1 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden group'><div class='absolute inset-0 flex items-center justify-center text-slate-400 font-medium'>Chart Visualization Here</div></div></div></body></html>"
  ```
  
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

✅ **Use CustomComponent for (MANDATORY FOR DATA):**
  • 📊 ALL data visualizations in creative mode (bars, lines, pies, etc.)
  • 📈 Stats/metrics (ALWAYS prefer over standalone numbers)
  • 🎴 Card layouts (features, pricing, team members)
  • 📱 Dashboards (2+ metrics in a grid)
  • 🎯 Any complex UI pattern
  • ⚡ Interactive elements, animations
  • 🎨 Unique, branded designs that stand out
  • 🔄 Processes, flows, timelines
  • 📚 Educational concepts and explanations

✅ **Use Icon for:**
  • Dashboard metric icons (1-2 per slide MAX)
  • Critical semantic indicators
  • NEVER for bullets or decoration

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

