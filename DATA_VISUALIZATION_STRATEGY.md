# Data Visualization Strategy

## Overview

The system now has an optimized strategy for presenting data in presentations, emphasizing **visual hierarchy** and **variety** over repetition.

## Current Data Sources by Mode

### Standard/Quick Mode (Current)
- **Model**: Claude Haiku 4.5 only
- **Data Source**: Haiku's knowledge (no web research)
- **Best for**: General topics, narratives, educational content
- **Pros**: Fast, excellent structure, digestible content
- **Cons**: Limited to Haiku's training data

### Detailed Mode (Research-Heavy)
- **Models**: Perplexity Pro (research) → Haiku 4.5 (structure)
- **Data Source**: Live web research via Perplexity
- **Best for**: Business analysis, market research, data-driven topics
- **Pros**: Current data, statistics, comprehensive research
- **Cons**: Slower, more expensive

## ✅ Recommendation: Use Detailed Mode for Data-Rich Topics

To get Perplexity research data while maintaining excellent presentation structure:

```javascript
// Frontend API call
POST /api/openai/generate-outline-stream
{
  "prompt": "AI market analysis with revenue trends and adoption rates",
  "detail_level": "detailed",  // ← This triggers hybrid mode
  "slide_count": 10
}
```

### What Happens in Detailed Mode:
1. **Phase 1**: Perplexity Pro researches the topic
   - Gathers current statistics
   - Finds market data
   - Collects trends and metrics
   
2. **Phase 2**: Haiku 4.5 structures it
   - Transforms research into digestible slides
   - Creates visual data hierarchy
   - Adds stat slides and charts
   - Maintains presentation-friendly format

**Result**: Best of both worlds - deep research + excellent narrative!

## Data Presentation Hierarchy

The prompts now guide the model to choose the RIGHT format for each type of data:

### 1. STAT SLIDE (Full-Slide Highlight)
**When to use**: Single BIG number that deserves spotlight

**Format**:
```
┌─────────────────────────┐
│                         │
│       87%               │  ← Giant, eye-catching number
│   of users prefer       │  ← Brief context (2-5 words)
│   our product           │
│                         │
└─────────────────────────┘
```

**Examples**:
- `$2.5B` + "market size by 2025"
- `87%` + "customer satisfaction"
- `10M` + "active users worldwide"

**Visual Impact**: Number breaks out of bullets, fills the slide like a billboard

---

### 2. CHART (Multiple Related Numbers)
**When to use**: Comparing or showing trends across multiple data points

**Format**:
- Chart takes center stage
- 5-15 data points
- Minimal supporting bullets

**Chart Types** (use variety!):
- **Column/Bar**: Category comparisons (revenue by region)
- **Line**: Time-based trends (growth over quarters)
- **Pie**: Parts-of-whole (market share distribution)
- **Area**: Multiple trends (product lines over time)
- **Waterfall**: Sequential changes (revenue bridge)
- **Radar**: Multi-dimensional (competitor comparison)

**Target**: 20-30% of content slides (e.g., 2-3 charts in 10-slide deck)

---

### 3. BULLETS (Supporting Context)
**When to use**: General content with inline data

**Format**:
```
• Revenue grew **42%** to **$2.3B** in Q3
• Launched in **5 markets**, reaching **12M users**
• **Tesla** leads with **65%** market share
```

**Key**: Short bullets (8-15 words) with **bold** emphasis on key numbers

---

## Chart vs Stat Slide Decision Matrix

| Data Type | Use Stat Slide | Use Chart |
|-----------|---------------|-----------|
| One big number | ✅ YES | ❌ No |
| 2-3 numbers | ✅ YES | Maybe |
| 5+ related numbers | ❌ No | ✅ YES |
| Trend over time | ❌ No | ✅ YES |
| Comparison across categories | ❌ No | ✅ YES |
| Parts of a whole | ❌ No | ✅ YES |

### Examples:

**Stat Slide** ✅:
- "87% satisfaction rate" → Full slide with giant "87%"
- "$2.5B market by 2025" → Full slide with "$2.5B"

**Chart** ✅:
- Satisfaction by product (5 products) → Bar chart
- Revenue over 4 quarters → Line chart
- Market share of 6 competitors → Pie chart

**Bad** ❌:
- Creating a chart for one number (use stat slide instead)
- Using same chart type on every slide (vary the types!)

---

## Chart Variety Strategy

### ❌ Before (Repetitive):
```
Slide 3: Column chart
Slide 5: Column chart
Slide 7: Column chart
Slide 9: Column chart
```

### ✅ After (Varied):
```
Slide 3: Column chart (category comparison)
Slide 5: Line chart (trend over time)
Slide 7: STAT slide (one big number)
Slide 9: Pie chart (market share)
```

**Target Mix** for a 10-slide deck:
- 1-2 stat slides (big numbers)
- 2-3 charts (varied types)
- 5-6 regular content slides (bullets with inline data)

---

## Prompt Updates Applied

### 1. **Stat Slide Emphasis**
```
STAT SLIDES are for BIG, VISUAL NUMBERS that deserve their own slide
• Format: ONE large number + brief context (2-5 words)
• Think billboard-style: HUGE number that grabs attention
• Stat slides BREAK OUT of bullets - they're full-slide visual highlights!
```

### 2. **Chart Strategy**
```
🎯 CHART STRATEGY - BE SELECTIVE AND VARIED:
- Use charts for COMPARISONS and TRENDS (not single stats)
- Target: 20-30% of content slides
- VARY chart types - don't repeat the same chart type!
- Single numbers → use STAT slide (full-slide highlight)
- Multiple numbers → use chart (visual comparison)
```

### 3. **Data Presentation Hierarchy**
```
💡 DATA PRESENTATION HIERARCHY (choose the RIGHT format):
  1. STAT SLIDE: Single BIG number → full-slide spotlight
  2. CHART: Multiple related numbers → comparison/trends
  3. BULLETS: Supporting details → inline numbers with **bold**
```

---

## How to Get Perplexity Research Data

### Option 1: Use Detailed Mode (Recommended)
```javascript
{
  "detail_level": "detailed"  // Triggers Perplexity + Haiku hybrid
}
```

**Pros**:
- Current research data
- Statistics and metrics
- Market trends
- Comprehensive information

**When to use**:
- Business analysis
- Market research
- Technical deep-dives
- Data-driven presentations

### Option 2: Manual Research Addition
For standard mode, you can add research context to your prompt:
```
"Create a presentation about AI market. Include these stats:
- Market size: $150B by 2025
- Growth rate: 42% CAGR
- Top players: OpenAI, Google, Anthropic..."
```

---

## Testing the New Strategy

### Test Case 1: Business Presentation
```
Prompt: "AI market analysis with revenue trends"
Detail Level: "detailed"
Expected Output:
- Stat slide: "$150B" + "AI market by 2025"
- Line chart: Revenue growth over 5 years
- Bar chart: Market share by company
- Pie chart: Revenue by segment
- Regular bullets: Supporting context
```

### Test Case 2: Product Pitch
```
Prompt: "Product launch pitch with user growth"
Detail Level: "standard" or "detailed"
Expected Output:
- Stat slide: "10M" + "users in first year"
- Line chart: User growth over 12 months
- Bar chart: Feature adoption rates
- Regular bullets: Product benefits
```

---

## Summary

✅ **What's Fixed**:
1. Stat slides emphasized for single big numbers
2. Charts used strategically (20-30% of slides)
3. Chart variety encouraged (no repetition)
4. Clear hierarchy: Stat → Chart → Bullets
5. Data breaks out of bullets when appropriate

✅ **To Get Perplexity Data**:
- Use `detail_level: "detailed"` for hybrid mode
- System automatically uses Perplexity for research
- Haiku structures it into digestible presentation

✅ **Visual Impact**:
- Large numbers get full-slide treatment
- Charts are varied and strategic
- Data is highlighted, not buried in bullets
- Presentations are visually engaging

🎯 **Result**: Data-rich presentations that are both informative AND presentation-ready!

