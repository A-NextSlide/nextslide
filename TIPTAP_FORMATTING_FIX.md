# Tiptap Multi-Line Formatting Fix

## Problem

The HTML Inspired v2 generator was producing text that ran together without proper line breaks. For example:

**Before (WRONG):**
```
Key MetricsSNES: 49 million unitsGenesis: 30-35 million units
```

This happened because the prompt didn't clearly explain how to format multi-line content within a single TiptapTextBlock.

## Root Cause

TiptapTextBlock's `texts` property supports **two formats**:

1. **Simple Array Format** - For single-line text with inline formatting:
   ```json
   "texts": [{"text": "Revenue: ", "style": {}}, {"text": "$4.2M", "style": {"bold": true}}]
   ```

2. **CustomDoc Format** - For multi-line text with line breaks:
   ```json
   "texts": {
     "type": "doc",
     "content": [
       {
         "type": "paragraph",
         "content": [{"type": "text", "text": "Line 1", "style": {}}]
       },
       {
         "type": "paragraph", 
         "content": [{"type": "text", "text": "Line 2", "style": {}}]
       }
     ]
   }
   ```

The prompt lacked clear guidance on when and how to use the CustomDoc format for multi-line content.

## Solution

Updated `html_inspired_system_prompt_v2.py` with comprehensive guidance on Tiptap text formatting:

### 1. **Clear Format Distinction**
Added a section explaining when to use each format:
- Simple array → single-line text only
- CustomDoc → multi-line text with line breaks

### 2. **Practical Examples**
Added three common patterns with full CustomDoc structure:

**Pattern 1 - Key Metrics List:**
```json
{
  "texts": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "SNES: ", "style": { "textColor": "{{primary}}" } },
          { "type": "text", "text": "49 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "Genesis: ", "style": { "textColor": "{{primary}}" } },
          { "type": "text", "text": "30-35 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
        ]
      }
    ]
  }
}
```

**Pattern 2 - Bullet List with Formatting:**
Shows how to format checkmarks/bullets with mixed styling per line

**Pattern 3 - Timeline Entries:**
Demonstrates date labels with descriptions, properly formatted

### 3. **Critical Rules Highlighted**

Added a "CRITICAL FORMATTING RULES" section emphasizing:
1. **NEVER use `\n` in text** - it won't create line breaks!
2. Each line must be a separate paragraph object
3. Simple array = single line, CustomDoc = multi-line
4. Proper height calculation: `height ≈ fontSize × N × 1.3` for N lines

### 4. **Decision Guide**

Quick reference for choosing the right format:
- Single line with formatting? → Simple array
- Multiple lines/list items? → CustomDoc
- Different sections entirely? → Separate TiptapTextBlock components

### 5. **Wrong vs. Right Examples**

Explicitly showed the common mistake and the correct solution:

❌ **WRONG:**
```json
{
  "texts": [
    { "text": "SNES: 49 million unitsGenesis: 30-35 million units", "style": {} }
  ]
}
```

✅ **CORRECT:**
```json
{
  "texts": {
    "type": "doc",
    "content": [
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "SNES: ", "style": { "textColor": "{{primary}}" } },
          { "type": "text", "text": "49 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
        ]
      },
      {
        "type": "paragraph",
        "content": [
          { "type": "text", "text": "Genesis: ", "style": { "textColor": "{{primary}}" } },
          { "type": "text", "text": "30-35 million units", "style": { "bold": true, "textColor": "{{accent}}" } }
        ]
      }
    ]
  }
}
```

## Expected Results

With these prompt improvements, the AI will now:

1. ✅ **Properly structure multi-line content** with CustomDoc format
2. ✅ **Use rich formatting** (bold, colors, highlights) on each line
3. ✅ **Create readable lists** with proper line breaks between items
4. ✅ **Calculate heights correctly** for multi-line text blocks
5. ✅ **Choose the right format** based on content structure

## Files Modified

- `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

## Testing

To verify the fix works:

1. Generate a presentation with key metrics or lists
2. Check that multi-line content in TiptapTextBlocks displays with proper line breaks
3. Verify formatting (bold, colors) is applied correctly per line
4. Confirm text doesn't run together like "Item1Item2Item3"

## Technical Details

The CustomDoc structure matches Tiptap's internal document model:
- `doc` - root document node
- `paragraph` - block-level node for each line
- `text` - inline text nodes with marks (bold, color, etc.)

The frontend's `tiptapUtils.ts` handles both formats with backward compatibility:
- Simple array → automatically converted to single paragraph
- CustomDoc → directly transformed to Tiptap JSON

## Additional Benefits

Beyond fixing the line break issue, this update also:
- Enables more sophisticated text formatting within blocks
- Makes it clearer when to use multiple blocks vs. multi-line in one block
- Provides reusable patterns for common content types
- Improves consistency across generated presentations

