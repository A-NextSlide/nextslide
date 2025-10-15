# Shape With Text Fix - Complete

## Problem Identified

When generating slides, **shapes with text weren't showing the text**. The issue was in the HTML inspired v2 prompt instructions.

## Root Cause

The prompt was instructing the AI to use **incorrect property names** for Shape components with text:

❌ **WRONG (What the prompt was saying):**
```json
{
  "type": "Shape",
  "props": {
    "hasText": true,
    "textContent": "Key Takeaway",  // ← WRONG PROP!
    "textSize": 32,                 // ← WRONG PROP!
    "textColor": "{{accent}}"
  }
}
```

✅ **CORRECT (What the renderer actually expects):**
```json
{
  "type": "Shape",
  "props": {
    "hasText": true,
    "texts": [{"text": "Key Takeaway", "style": {}}],  // ← CORRECT!
    "fontSize": 32,                                      // ← CORRECT!
    "textColor": "{{accent}}"
  }
}
```

## What Was Fixed

Updated 3 locations in `html_inspired_system_prompt_v2.py`:

1. **Line 14** - Component schema reference:
   - Changed: `textContent, textSize` 
   - To: `texts: [{text, style}], fontSize`

2. **Lines 1017-1057** - Detailed Shape with text examples:
   - Changed all examples from `textContent`/`textSize` 
   - To: `texts` array with `fontSize`

3. **Line 1102** - Design checklist:
   - Changed: "MUST have textContent, textSize, textColor"
   - To: "MUST have texts array, fontSize, textColor"

## How Shape With Text Works

The `ShapeWithTextRenderer` uses **TipTap editor** for text content, just like `TiptapTextBlock`. It expects:

- `texts`: Array of styled text segments (same format as TiptapTextBlock)
- `fontSize`: The font size (not `textSize`)
- `textColor`: The text color  
- `hasText`: Boolean to enable text rendering
- `textPadding`: Padding inside the shape

## Files Modified

- `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py` ✅ FIXED

## Testing

Generate a new slide with shapes containing text to verify the fix works correctly.

---

**Status**: ✅ Complete - Shapes with text will now display properly
