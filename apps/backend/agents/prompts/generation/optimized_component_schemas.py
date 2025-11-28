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
  
  📦 **PREMIUM DESIGN TEMPLATES - USE THESE AS INSPIRATION:**

  🔥 **GLASSMORPHISM STATS GRID (Dark Theme):**
  ```json
  "render": "<!DOCTYPE html><html><head><meta charset='UTF-8'><script src='https://cdn.tailwindcss.com'></script><link href='https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap' rel='stylesheet'><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden;background:transparent}body{font-family:'Inter',sans-serif}@keyframes glow{0%,100%{box-shadow:0 0 20px rgba(99,102,241,0.3)}50%{box-shadow:0 0 40px rgba(99,102,241,0.6)}}@keyframes countUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}.stat-card{animation:countUp 0.6s ease-out forwards;opacity:0;transition:all 0.3s ease}.stat-card:hover{transform:translateY(-5px) scale(1.02);background:rgba(255,255,255,0.1);cursor:pointer}.stat-card:nth-child(1){animation-delay:0.1s}.stat-card:nth-child(2){animation-delay:0.2s}.stat-card:nth-child(3){animation-delay:0.3s}.glow{animation:glow 2s ease-in-out infinite}</style></head><body class='w-full h-full p-8 flex items-center justify-center bg-gradient-to-br from-slate-900 via-purple-900 to-slate-900'><div class='grid grid-cols-3 gap-6 w-full max-w-5xl'><div class='stat-card bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10 glow'><div class='text-indigo-400 text-sm font-semibold uppercase tracking-wider mb-2'>Market Cap</div><div class='text-5xl font-black text-white mb-1'>$2.4T</div><div class='text-emerald-400 text-lg font-medium'>+18.5% YoY</div></div><div class='stat-card bg-white/5 backdrop-blur-xl rounded-3xl p-8 border border-white/10'><div class='text-pink-400 text-sm font-semibold uppercase tracking-wider mb-2'>Growth Rate</div><div class='text-5xl font-black text-white mb-1'>127%</div><div class='text-white/60 text-lg'>vs 89% industry avg</div></div><div class='stat-card bg-gradient-to-br from-indigo-500 to-purple-600 rounded-3xl p-8 shadow-2xl shadow-indigo-500/30'><div class='text-white/80 text-sm font-semibold uppercase tracking-wider mb-2'>Projection</div><div class='text-5xl font-black text-white mb-1'>$8.1T</div><div class='text-white/80 text-lg font-medium'>by 2034</div></div></div></body></html>"
  ```
  
  🌈 **GRADIENT HERO STATS (Light Theme):**
  ```json
  "render": "<!DOCTYPE html><html><head><meta charset='UTF-8'><script src='https://cdn.tailwindcss.com'></script><link href='https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap' rel='stylesheet'><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{font-family:'Plus Jakarta Sans',sans-serif;background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);display:flex;align-items:center;justify-content:center;padding:40px}</style></head><body><div class='w-full h-full flex flex-col items-center justify-center text-center'><h1 class='text-7xl font-extrabold text-white mb-4 drop-shadow-2xl'>$1.74 Trillion</h1><p class='text-2xl text-white/90 font-medium mb-8'>2025 Global Market Size</p><div class='flex gap-8'><div class='bg-white/20 backdrop-blur-md rounded-2xl px-8 py-4 border border-white/30'><div class='text-4xl font-bold text-white'>17.2%</div><div class='text-white/80 text-sm'>CAGR</div></div><div class='bg-white/20 backdrop-blur-md rounded-2xl px-8 py-4 border border-white/30'><div class='text-4xl font-bold text-white'>4.2x</div><div class='text-white/80 text-sm'>Growth by 2034</div></div></div></div></body></html>"
  ```
  
  ⚡ **NEON METRICS (Cyberpunk Style):**
  ```json
  "render": "<!DOCTYPE html><html><head><meta charset='UTF-8'><script src='https://cdn.tailwindcss.com'></script><style>*{margin:0;padding:0;box-sizing:border-box}html,body{width:100%;height:100%;overflow:hidden}body{font-family:system-ui;background:#0a0a0f}@keyframes neon{0%,100%{text-shadow:0 0 10px #0ff,0 0 20px #0ff,0 0 30px #0ff}50%{text-shadow:0 0 20px #0ff,0 0 40px #0ff,0 0 60px #0ff}}.neon-text{animation:neon 2s ease-in-out infinite}</style></head><body class='w-full h-full p-10 flex items-center justify-center'><div class='grid grid-cols-2 gap-8 w-full'><div class='bg-gradient-to-br from-cyan-500/10 to-blue-500/10 rounded-3xl p-8 border border-cyan-500/30'><div class='text-cyan-400 text-xs uppercase tracking-[0.3em] mb-4'>Market Size 2025</div><div class='text-6xl font-black text-white neon-text'>$1.74T</div></div><div class='bg-gradient-to-br from-purple-500/10 to-pink-500/10 rounded-3xl p-8 border border-purple-500/30'><div class='text-purple-400 text-xs uppercase tracking-[0.3em] mb-4'>Growth Rate</div><div class='text-6xl font-black text-white' style='text-shadow:0 0 30px #f0f'>17.23%</div></div><div class='col-span-2 bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 rounded-3xl p-8 border border-emerald-500/20'><div class='flex justify-between items-center'><div><div class='text-emerald-400 text-xs uppercase tracking-[0.3em] mb-2'>Asia Pacific Dominance</div><div class='text-4xl font-bold text-white'>40.71% Market Share</div></div><div class='text-right'><div class='text-3xl font-black text-emerald-400'>$2.96T</div><div class='text-white/60'>by 2034</div></div></div></div></div></body></html>"
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

