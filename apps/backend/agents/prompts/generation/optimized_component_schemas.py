"""
Optimized Component Schemas - SIMPLIFIED VERSION

Focus on 5 core components with clear, minimal instructions.
"""

def get_optimized_component_schemas() -> str:
    """
    Streamlined component schemas - ONLY what you need.
    """
    return """
═══════════════════════════════════════════════════════════════════════════════
📦 COMPONENT REFERENCE (5 Core Components)
═══════════════════════════════════════════════════════════════════════════════

**1. Background** (ALWAYS FIRST)
```json
{"type": "Background", "props": {"backgroundType": "color", "fill": {"color": "{{background}}"}}}
```

**2. TiptapTextBlock** (All text content)
```json
{
  "type": "TiptapTextBlock",
  "props": {
    "position": {"x": 120, "y": 160},
    "width": 800,
    "height": 80,
    "texts": [{"text": "Your text", "style": {"textColor": "{{text}}", "bold": true}}],
    "fontSize": 48,
    "fontFamily": "Inter",
    "alignment": "left",
    "verticalAlignment": "top",
    "padding": 0
  }
}
```
RULES:
- ALWAYS include: alignment, verticalAlignment, padding=0
- Calculate height: fontSize × 1.15
- Font sizes: titles ≥48pt, body ≥32pt, never below 28pt

**3. Image** (Use on 20-30% of slides)
```json
{
  "type": "Image",
  "props": {
    "position": {"x": 1000, "y": 160},
    "width": 840,
    "height": 760,
    "src": "placeholder",
    "objectFit": "cover",
    "borderRadius": 12
  }
}
```
RULES:
- Aspect ratio: height should be 50-100% of width
- Minimum size: 400×300px
- Use "cover" for photos, "contain" for logos

**4. Chart** (Only when you have quantitative data)
```json
{
  "type": "Chart",
  "props": {
    "position": {"x": 80, "y": 280},
    "width": 800,
    "height": 540,
    "chartType": "bar",
    "data": [{"name": "Q1", "value": 100}, {"name": "Q2", "value": 150}],
    "margin": {"top": 20, "right": 20, "bottom": 60, "left": 80},
    "showLegend": false,
    "backgroundColor": "#00000000"
  }
}
```
RULES:
- Minimum size: 500×400px
- Chart OR Image per slide, never both
- Use accent color for bars/lines

**5. CustomComponent** (For complex visualizations)
```json
{
  "type": "CustomComponent",
  "props": {
    "position": {"x": 120, "y": 280},
    "width": 1680,
    "height": 600,
    "primaryColor": "{{accent}}",
    "items": [{"label": "Revenue", "value": "$2.5M"}],
    "render": "function render({props}){var items=props.items||[];var pc=props.primaryColor||'#3B82F6';var tc=getContrastTextColor(pc);return React.createElement('div',{style:{display:'flex',gap:'40px',width:'100%',height:'100%'}},items.map(function(item,i){return React.createElement('div',{key:i,style:{flex:1,background:pc,padding:'48px',borderRadius:'20px',display:'flex',flexDirection:'column',justifyContent:'center',alignItems:'center'}},[React.createElement('div',{style:{fontSize:'72px',fontWeight:'900',color:tc}},item.value),React.createElement('div',{style:{fontSize:'24px',color:tc,marginTop:'12px'}},item.label)]);}));}"
  }
}
```
USE FOR: stat cards, dashboards, comparisons, timelines
RULES:
- Use var (not const/let)
- Use React.createElement()
- Use getContrastTextColor(bgColor) for text

═══════════════════════════════════════════════════════════════════════════════
🚨 CRITICAL RULES
═══════════════════════════════════════════════════════════════════════════════

**ANTI-OVERLAP:**
nextY = currentY + currentHeight + 60
- Calculate for EVERY component
- Minimum gap: 60px between elements

**BOUNDS:**
- x: 80 to 1840
- y: 80 to 1000
- Verify: x + width ≤ 1840, y + height ≤ 1000

**COLORS:**
- {{background}} → Background only
- {{text}} → All text (TiptapTextBlock.textColor)
- {{accent}} → Accents (shapes, icons, lines)

**FONTS:**
- Titles: ≥48pt
- Body: ≥32pt (never below 28pt)
- Height: fontSize × 1.15
"""


def get_customcomponent_emphasis() -> str:
    """Additional emphasis on CustomComponent usage"""
    return """
USE CUSTOMCOMPONENT FOR:
- Stat cards with multiple metrics
- Dashboards and KPI displays
- Timelines and process flows
- Comparison layouts
- Any visual that needs custom styling

RULES:
- Use var (not const/let)
- Use React.createElement()
- Use getContrastTextColor(bgColor) for text on colored backgrounds
"""
