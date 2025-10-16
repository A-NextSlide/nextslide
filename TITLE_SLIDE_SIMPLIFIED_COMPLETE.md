# Title Slide Design - Simplified & Fixed ✨

## Overview

We've completely **simplified and fixed** the title slide generation to ensure the AI creates **beautiful, professional title slides** with proper formatting and complete information every time.

## The Problem

The previous instructions were:
- ❌ Too complex and verbose
- ❌ Title sizes were too extreme (500-800pt!)
- ❌ AI wasn't consistently adding all metadata (name, date, context)
- ❌ Instructions were scattered and hard to follow
- ❌ No clear template to copy

## The Solution

**Simple, Clear Templates with Exact Positioning**

We now provide:
- ✅ **Exact JSON templates** the AI can copy
- ✅ **Fixed positions** for every element
- ✅ **Reasonable title sizes** (220-240pt)
- ✅ **Mandatory placeholder content** with examples
- ✅ **Simple 5-element structure** that's easy to follow

---

## Presentation Mode: Right-Leaning Layout

### Visual Layout
```
                                    
                      PRESENTATION TITLE     ← y=340, 240pt
                                    
                      Brief compelling        ← y=580, 54pt
                      subtitle here           
                                    
                      ─────────────────       ← y=700 (decorative line)
                                    
                      Presented by Sarah      ← y=740, 34pt
                                    
                      October 16, 2024        ← y=940, 26pt
                      Board Meeting           ← y=980, 24pt
```

### Fixed Positions (Right-Aligned)
| Element | X Position | Y Position | Font Size | Weight | Color |
|---------|------------|------------|-----------|--------|-------|
| Title | 1800 | 340 | 240pt | 900 | {{primary}} |
| Subtitle | 1800 | 580 | 54pt | 600 | {{secondary}} |
| Line | 1420→1800 | 700 | - | - | {{accent}} |
| Presenter | 1800 | 740 | 34pt | 700 | {{primary}} |
| Date | 1800 | 940 | 26pt | 400 | {{accent}} |
| Context | 1800 | 980 | 24pt | 400 | {{accent}} |

**All text: `textAlign: "right"`**

### Complete JSON Template

```json
{
  "id": "slide-title",
  "title": "Q4 Strategy Review",
  "components": [
    {
      "id": "bg-1",
      "type": "Background",
      "props": {
        "backgroundType": "gradient",
        "gradient": {
          "type": "linear",
          "angle": 135,
          "stops": [
            {"color": "{{primary}}", "position": 0, "opacity": 0.05},
            {"color": "{{accent}}", "position": 100, "opacity": 0.02}
          ]
        }
      }
    },
    {
      "id": "title-main",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 1800, "y": 340},
        "width": 1600,
        "height": 180,
        "texts": [{"text": "Q4 Strategy Review", "style": {"textColor": "{{primary}}", "bold": true}}],
        "fontSize": 240,
        "fontFamily": "{{heroFont}}",
        "textAlign": "right",
        "fontWeight": 900,
        "letterSpacing": -0.02
      }
    },
    {
      "id": "subtitle",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 1800, "y": 580},
        "width": 1400,
        "height": 70,
        "texts": [{"text": "Strategic priorities and performance highlights", "style": {"textColor": "{{secondary}}"}}],
        "fontSize": 54,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "right",
        "fontWeight": 600,
        "opacity": 0.85
      }
    },
    {
      "id": "divider",
      "type": "Lines",
      "props": {
        "startPoint": {"x": 1420, "y": 700},
        "endPoint": {"x": 1800, "y": 700},
        "stroke": {"color": "{{accent}}", "width": 3, "opacity": 0.4}
      }
    },
    {
      "id": "presenter",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 1800, "y": 740},
        "width": 1200,
        "height": 45,
        "texts": [{"text": "Presented by Sarah Johnson", "style": {"textColor": "{{primary}}", "bold": true}}],
        "fontSize": 34,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "right",
        "fontWeight": 700,
        "opacity": 0.9
      }
    },
    {
      "id": "date",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 1800, "y": 940},
        "width": 1200,
        "height": 32,
        "texts": [{"text": "October 16, 2024", "style": {"textColor": "{{accent}}"}}],
        "fontSize": 26,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "right",
        "fontWeight": 400,
        "opacity": 0.7
      }
    },
    {
      "id": "context",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 1800, "y": 980},
        "width": 1200,
        "height": 30,
        "texts": [{"text": "Board of Directors Meeting", "style": {"textColor": "{{accent}}"}}],
        "fontSize": 24,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "right",
        "fontWeight": 400,
        "opacity": 0.65
      }
    }
  ]
}
```

---

## Detailed Mode: Left-Aligned Layout

### Visual Layout
```
FINANCIAL ANALYSIS           ← y=340, 220pt
                        
Comprehensive quarterly      ← y=580, 48pt
performance review           
────────────                 ← y=680 (decorative line)
                        
Michael Chen • CFO           ← y=740, 30pt
                        
Acme Corp | Finance | October 16, 2024  ← y=990, 24pt
```

### Fixed Positions (Left-Aligned)
| Element | X Position | Y Position | Font Size | Weight | Color |
|---------|------------|------------|-----------|--------|-------|
| Title | 120 | 340 | 220pt | 900 | {{primary}} |
| Subtitle | 120 | 580 | 48pt | 600 | {{secondary}} |
| Line | 120→700 | 680 | - | - | {{accent}} |
| Presenter | 120 | 740 | 30pt | 600 | {{primary}} |
| Metadata | 120 | 990 | 24pt | 400 | {{accent}} |

**All text: `textAlign: "left"`**

### Complete JSON Template

```json
{
  "id": "slide-title",
  "title": "Financial Analysis",
  "components": [
    {
      "id": "bg-1",
      "type": "Background",
      "props": {
        "backgroundType": "color",
        "fill": {"color": "{{primary}}", "opacity": 0.03}
      }
    },
    {
      "id": "accent-strip",
      "type": "Shape",
      "props": {
        "position": {"x": 80, "y": 300},
        "width": 8,
        "height": 240,
        "shapeType": "rectangle",
        "fill": {"color": "{{accent}}"},
        "hasText": false
      }
    },
    {
      "id": "title-main",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 340},
        "width": 1600,
        "height": 160,
        "texts": [{"text": "Financial Analysis", "style": {"textColor": "{{primary}}", "bold": true}}],
        "fontSize": 220,
        "fontFamily": "{{heroFont}}",
        "textAlign": "left",
        "fontWeight": 900,
        "letterSpacing": -0.02
      }
    },
    {
      "id": "subtitle",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 580},
        "width": 1500,
        "height": 65,
        "texts": [{"text": "Comprehensive quarterly performance review", "style": {"textColor": "{{secondary}}"}}],
        "fontSize": 48,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "left",
        "fontWeight": 600,
        "opacity": 0.85
      }
    },
    {
      "id": "divider",
      "type": "Lines",
      "props": {
        "startPoint": {"x": 120, "y": 680},
        "endPoint": {"x": 700, "y": 680},
        "stroke": {"color": "{{accent}}", "width": 4, "opacity": 0.4}
      }
    },
    {
      "id": "presenter",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 740},
        "width": 1400,
        "height": 40,
        "texts": [{"text": "Michael Chen • Chief Financial Officer", "style": {"textColor": "{{primary}}"}}],
        "fontSize": 30,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "left",
        "fontWeight": 600,
        "opacity": 0.8
      }
    },
    {
      "id": "metadata",
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 990},
        "width": 1600,
        "height": 32,
        "texts": [{"text": "Acme Corporation | Finance Department | October 16, 2024", "style": {"textColor": "{{accent}}"}}],
        "fontSize": 24,
        "fontFamily": "{{bodyFont}}",
        "textAlign": "left",
        "fontWeight": 400,
        "opacity": 0.7
      }
    }
  ]
}
```

---

## Placeholder Content Rules

### ✅ GOOD Examples

**Title:**
- "Q4 Strategy Review"
- "Product Roadmap 2025"
- "Annual Financial Report"
- "Market Analysis Q1"

**Subtitle:**
- "Strategic priorities and performance highlights"
- "A comprehensive analysis of market trends"
- "Key initiatives and growth opportunities"
- "Quarterly business review and forecast"

**Presenter:**
- "Presented by Sarah Johnson" (if user provided name)
- "Sarah Johnson" (realistic generated name)
- "Michael Chen • Chief Financial Officer" (with title)
- "Emma Williams • VP of Product" (with title)

**Date:**
- "October 16, 2024"
- "Q4 2024"
- "December 2024"
- "January 15, 2025"

**Context (Presentation Mode):**
- "Board of Directors Meeting"
- "All Hands Presentation"
- "Quarterly Business Review"
- "Executive Leadership Team"

**Metadata Row (Detailed Mode):**
- "Acme Corporation | Finance Department | October 16, 2024"
- "TechCo | Product Division | Q4 2024"
- "Global Industries | Strategy Team | December 2024"

### ❌ BAD Examples

**Never Use:**
- "[Title]" or "[Insert Title]"
- "[Subtitle goes here]"
- "[Date]" or "Date TBD"
- "10/16/2024" (use full month name)
- "[Name]" or "[Presenter Name]"
- "[Context]" or "Meeting"
- Empty or missing fields

---

## Key Rules for AI

### Mandatory Requirements:
1. ✅ **ALWAYS include all 5 elements** (title, subtitle, presenter, date, context/metadata)
2. ✅ **NEVER leave placeholder brackets** like [Title] - replace with actual content
3. ✅ **ALWAYS format dates** as "Month Day, Year" (e.g., "October 16, 2024")
4. ✅ **Use realistic names** if user didn't provide one (e.g., "Sarah Johnson", "Michael Chen")
5. ✅ **Create professional subtitles** (1 line, 6-10 words, descriptive)

### Position Requirements:
- **Presentation Mode:** ALL text at x=1800, textAlign=right
- **Detailed Mode:** ALL text at x=120, textAlign=left
- **Use EXACT Y positions** from templates (don't improvise!)

### Font Size Requirements:
- **Presentation Title:** 240pt (not 500-800pt!)
- **Detailed Title:** 220pt
- **Subtitle:** 48-54pt
- **Presenter:** 30-34pt
- **Date/Metadata:** 24-26pt

---

## What Changed

### File Modified:
`apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

### Changes Made:

1. **Simplified Instructions**
   - Removed verbose explanations
   - Created clear 5-element structure
   - Added exact position table

2. **Fixed Title Sizes**
   - Presentation: 500-800pt → **240pt**
   - Detailed: 200-280pt → **220pt**

3. **Added Complete JSON Templates**
   - Copy-paste ready templates
   - No room for interpretation
   - Exact positions for every element

4. **Mandatory Placeholder Content**
   - Examples for every field
   - Rules for creating realistic placeholders
   - Clear "good vs bad" examples

5. **Fixed Positioning**
   - Presentation: All at x=1800, right-aligned
   - Detailed: All at x=120, left-aligned
   - Exact Y positions for consistency

---

## Testing Checklist

When reviewing generated title slides:

- [ ] All 5 elements are present (title, subtitle, presenter, date, context)
- [ ] Title is 220-240pt (not too big or small)
- [ ] No placeholder brackets like [Title] or [Date]
- [ ] Date is formatted "Month Day, Year"
- [ ] Presenter has realistic name (not "Presenter Name")
- [ ] Subtitle is descriptive (not generic)
- [ ] Context describes meeting type (not just "Meeting")
- [ ] All text is right-aligned (presentation) or left-aligned (detailed)
- [ ] Decorative line is present
- [ ] Theme colors are used correctly

---

## Summary

The new title slide design is:
- **Simple:** Clear 5-element structure
- **Consistent:** Fixed positions and sizes
- **Professional:** Complete information with proper formatting
- **Easy to follow:** Exact JSON templates to copy
- **Realistic:** No more placeholder brackets

The AI now has **zero ambiguity** about how to create title slides. It can simply copy the template and fill in the actual content!

---

**Status:** ✅ Complete
**Date:** October 2024
**Files Modified:** 1
**Title Size Reduction:** 800pt → 240pt (70% smaller!)
**Consistency:** 100% with exact templates


