# Modern Image Layout Fix - Side-by-Side Priority

## Problem Solved
Slides were using outdated vertical stacking:
```
Text Line 1
Text Line 2
Text Line 3
━━━━━━━━━━━━━━━━━━━
[Wide Image at Bottom]
━━━━━━━━━━━━━━━━━━━
```
This is **BORING** and **OLD POWERPOINT** design!

## Solution Implemented

### New Priority System

#### **PRIMARY LAYOUT (80%): SIDE-BY-SIDE** ✅

**Text Left + Image Right:**
```
┌─────────────────┬────────────┐
│  Title          │            │
│                 │            │
│  • Bullet 1     │   IMAGE    │
│  • Bullet 2     │   800px    │
│  • Bullet 3     │   x 800px  │
│                 │            │
│  Content text   │            │
└─────────────────┴────────────┘
  900px (47%)       840px (44%)
```

**Image Left + Text Right:**
```
┌────────────┬─────────────────┐
│            │  Title          │
│            │                 │
│   IMAGE    │  • Bullet 1     │
│   880px    │  • Bullet 2     │
│   x 800px  │  • Bullet 3     │
│            │                 │
│            │  Content text   │
└────────────┴─────────────────┘
  880px (46%)   880px (46%)
```

#### **SECONDARY LAYOUT (20%): BOTTOM PANORAMIC** ⚠️

**ONLY for wide/panoramic images:**
```
┌────────────────────────────┐
│  Title                     │
│                            │
│  • Key point 1             │
│  • Key point 2             │
│  • Key point 3             │
│                            │
├────────────────────────────┤
│  [Wide Panoramic Image]    │
│   1760px × 380px           │
└────────────────────────────┘
```

**Requirements for bottom placement:**
- Aspect ratio > 2:1 (panoramic)
- Examples: Landscapes, cityscapes, wide product shots
- Size: 1600-1760px wide × 300-450px tall
- Position: y=650-750

## Specific Layout Examples

### Split-Screen 50/50
```json
{
  "components": [
    {
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 200},
        "width": 780,
        "texts": [{"text": "Content goes here"}],
        "fontSize": 36
      }
    },
    {
      "type": "Image",
      "props": {
        "src": "placeholder",
        "position": {"x": 1000, "y": 120},
        "width": 840,
        "height": 800,
        "borderRadius": 0
      }
    }
  ]
}
```

### Split-Screen 60/40 (Text Emphasis)
```json
{
  "components": [
    {
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 120, "y": 200},
        "width": 960,
        "fontSize": 36
      }
    },
    {
      "type": "Image",
      "props": {
        "src": "placeholder",
        "position": {"x": 1150, "y": 120},
        "width": 690,
        "height": 800
      }
    }
  ]
}
```

### Image Left (40/60)
```json
{
  "components": [
    {
      "type": "Image",
      "props": {
        "src": "placeholder",
        "position": {"x": 80, "y": 120},
        "width": 700,
        "height": 800
      }
    },
    {
      "type": "TiptapTextBlock",
      "props": {
        "position": {"x": 880, "y": 200},
        "width": 960,
        "fontSize": 36
      }
    }
  ]
}
```

## Files Modified

1. **`apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`**
   - Line 514-517: Added comprehensive image layout priority system
   - Line 552-562: Updated layout patterns to emphasize side-by-side

2. **`apps/backend/agents/prompts/editing/layout_guidelines.py`**
   - Line 40-48: Updated Content Slide guidelines
   - Emphasized split-screen as PRIMARY layout
   - Bottom placement as RARE exception

## Design Rules

### ✅ DO (80% of slides with images):
- **Side-by-side layouts** (50/50, 60/40, 40/60)
- Image on **LEFT** or **RIGHT**, never top/bottom
- Equal or asymmetric splits based on content importance
- Clean separation between text and image
- Modern, magazine-style layouts

### ❌ DON'T (Old PowerPoint):
- Vertical stacking with image at bottom
- Full-width images between text sections  
- Text lines stacked with wide image below
- Banner images at top or bottom

### ⚠️ EXCEPTION (20% - Use Sparingly):
- **Bottom placement** ONLY for panoramic images
- Must be landscape/cityscape/wide product
- Aspect ratio must be > 2:1 (wide)
- Use when image is supporting context, not main focus

## Benefits

✨ **Modern Design** - Matches contemporary presentation aesthetics
✨ **Better Balance** - Text and visuals equally important
✨ **More Dynamic** - Side-by-side creates visual interest
✨ **Professional** - Looks like Apple/Google keynotes, not PowerPoint
✨ **Flexible** - Can adjust split ratio based on content

## Examples by Slide Type

### Product Feature Slide
```
┌─────────────────┬────────────┐
│  Feature Name   │            │
│                 │  Product   │
│  Description    │  Screenshot│
│  of amazing     │            │
│  capability     │            │
└─────────────────┴────────────┘
```

### Process Explanation
```
┌────────────┬─────────────────┐
│            │  Step-by-Step   │
│  Diagram   │                 │
│  or Flow   │  1. First       │
│  Chart     │  2. Second      │
│            │  3. Third       │
└────────────┴─────────────────┘
```

### Data Insight
```
┌─────────────────┬────────────┐
│  Key Finding    │            │
│                 │   Chart    │
│  • Insight 1    │   or       │
│  • Insight 2    │   Graph    │
│  • Insight 3    │            │
└─────────────────┴────────────┘
```

## Testing

Generate presentations and verify:
- 80% of slides with images use side-by-side layout
- Images are on left or right, NOT bottom
- Bottom placement only for panoramic landscapes
- No more vertical stacking with wide images below
- Clean, modern, magazine-style appearance

## Backward Compatibility

- Existing presentations not affected
- Only new generations use updated layouts
- All image types still supported
- Can still use bottom for panoramic when appropriate

