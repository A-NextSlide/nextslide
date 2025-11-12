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

═══ ACCENT COMPONENTS (Use Sparingly) ═══

**Icon** { position, width: 24-40, height: 24-40, iconLibrary: "lucide", iconName, color: "{{accent}}" }
  🚨 USE SPARINGLY! Most slides need 0 icons.
  ✅ USE for: Dashboard metrics (1-2 MAX), critical data points
  ❌ DON'T use for: Bullets, headers, decoration
  📚 Available: 5000+ icons (lucide default)
  💡 Naming: kebab-case ("dollar-sign", "trending-up", "users", "chart-bar")
  🎯 Semantic selection:
    • Money/Revenue: "dollar-sign", "coins", "banknote"
    • Growth: "trending-up", "arrow-up-right", "line-chart"
    • Users: "users", "user-plus", "user-check"
    • Time: "clock", "calendar", "timer"
    • Success: "check-circle", "thumbs-up"

**Shape** { position, width, height, shapeType: "rectangle"|"roundedRectangle"|"circle", fill, hasText, texts, fontSize, textColor }
  ❌ NEVER use decorative shapes (NO circles/triangles for decoration!)
  ✅ ONLY use when hasText=true for callout boxes with content
  • When hasText=true: MUST include texts, fontSize, textColor

═══ CUSTOMCOMPONENT (Preferred for Complex UI) ═══

**CustomComponent** { position, width, height, render: "function render({props, state, updateState}){...}", [custom props] }
  
  🎨 USE CUSTOMCOMPONENT FOR:
  • Stats/metrics dashboards
  • Card layouts (pricing, features, team)
  • Progress indicators (radial, funnel, timeline)
  • Interactive elements (quizzes, polls, steppers)
  • ANY complex layout or visualization

  🚨 CODING RULES:
  1. Function signature: function render({props, state, updateState, id, isThumbnail, containerWidth, containerHeight}) {
  2. Declare variables ONCE at top (INSIDE function body): var value = props.value || 'default';
  3. NEVER redeclare variables (no const, no let, just var)
  4. Use React.createElement('div', {style: {...}}, children)
  5. Escape apostrophes in text: 'it\\'s', 'don\\'t', 'user\\'s'
  6. Colors: ALWAYS use getContrastTextColor(bgColor) for text on colored backgrounds
  
  📦 COMMON PATTERNS:

  **Stat Card:**
  ```javascript
  function render({props}) {
    var value = props.value || '92%';
    var label = props.label || 'Growth';
    var bg = props.primaryColor || '#3B82F6';
    var textColor = getContrastTextColor(bg);
    
    return React.createElement('div', {
      style: {
        width: '100%', height: '100%', display: 'flex', 
        flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        background: bg, borderRadius: '24px', padding: '48px'
      }
    }, [
      React.createElement('div', {style: {fontSize: '120px', fontWeight: '900', color: textColor}}, value),
      React.createElement('div', {style: {fontSize: '32px', color: textColor, marginTop: '16px', opacity: 0.85}}, label)
    ]);
  }
  ```

  **Multi-Card Grid:**
  ```javascript
  function render({props}) {
    var items = props.items || [{label: 'Revenue', value: '$2.5M'}, {label: 'Users', value: '45K'}];
    var primaryColor = props.primaryColor || '#3B82F6';
    var textColor = getContrastTextColor(primaryColor);
    
    return React.createElement('div', {
      style: {width: '100%', height: '100%', display: 'flex', gap: '40px'}
    }, items.map(function(item, i) {
      return React.createElement('div', {
        key: i,
        style: {
          flex: 1, background: primaryColor, padding: '48px',
          borderRadius: '20px', display: 'flex', flexDirection: 'column',
          justifyContent: 'center', alignItems: 'center'
        }
      }, [
        React.createElement('div', {style: {fontSize: '80px', fontWeight: '900', color: textColor}}, item.value),
        React.createElement('div', {style: {fontSize: '24px', color: textColor, marginTop: '12px', opacity: 0.8}}, item.label)
      ]);
    }));
  }
  ```

  **Icon + Text Component:**
  ```javascript
  function render({props}) {
    var text = props.text || 'Insight';
    var iconName = props.iconName || 'trending-up';
    var color = props.color || '#10b981';
    var textColor = getContrastTextColor(color);
    
    return React.createElement('div', {
      style: {
        width: '100%', height: '100%', display: 'flex',
        alignItems: 'center', gap: '24px', padding: '32px',
        background: color + '15', borderRadius: '16px'
      }
    }, [
      React.createElement('div', {
        style: {fontSize: '48px', color: color}
      }, '💡'), // Icon placeholder (frontend will render actual icon)
      React.createElement('div', {
        style: {fontSize: '36px', fontWeight: '600', color: textColor}
      }, text)
    ]);
  }
  ```

═══ BANNED COMPONENTS IN PRESENTATION MODE ═══

**Chart** - 🚫 DO NOT USE IN PRESENTATION MODE
  • In presentation mode: USE CustomComponent for ALL data visualizations
  • In detailed mode ONLY: If you have 15+ data points AND complex trends, Chart is acceptable
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
  • 📊 ALL data visualizations in presentation mode (bars, lines, pies, etc.)
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
  • Chart component in presentation mode (use CustomComponent)
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
  {"type": "TiptapTextBlock", "props": {"position": {"x": 120, "y": 120}, "texts": [{"text": "Revenue Dashboard", "style": {"textColor": "{{secondary}}", "bold": true}}], "fontSize": 48, "width": 800, "height": 55}},
  {"type": "CustomComponent", "props": {
    "position": {"x": 120, "y": 220},
    "width": 1680,
    "height": 700,
    "primaryColor": "{{accent}}",
    "items": [
      {"label": "Q1 Revenue", "value": "$2.5M"},
      {"label": "Q2 Revenue", "value": "$3.1M"},
      {"label": "Growth", "value": "+24%"}
    ],
    "render": "function render({props}){var items=props.items||[];var pc=props.primaryColor||'#3B82F6';var tc=getContrastTextColor(pc);return React.createElement('div',{style:{display:'flex',gap:'40px',width:'100%',height:'100%'}},items.map(function(item,i){return React.createElement('div',{key:i,style:{flex:1,background:pc,padding:'48px',borderRadius:'20px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'}},[React.createElement('div',{style:{fontSize:'72px',fontWeight:'900',color:tc}},item.value),React.createElement('div',{style:{fontSize:'24px',color:tc,marginTop:'12px',opacity:0.85}},item.label)]);}));}"
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

