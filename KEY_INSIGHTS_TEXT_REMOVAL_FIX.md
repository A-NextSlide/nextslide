# Key Insights Text Removal Fix

## Problem
The HTML inspired v2 system was adding massive "Key Insight" and "Key Findings" text blocks to slides, making them cluttered and verbose.

## Root Cause
Found in `html_inspired_system_prompt_v2.py`:
1. **Line 841**: Example instructing to add "KEY FINDINGS" section headers
2. **Line 859**: Example instructing to add "Insights below: x=120, y=610 (220+350+40 gap), bullet list with key findings"

These instructions were telling the AI to automatically add large explanatory text blocks about insights and findings on slides.

## Solution

### 1. Removed Problematic Instructions
- Changed "KEY FINDINGS" example to use "use slide title" instead (line 846)
- Removed the "Insights below" instruction from the multi-chart layout example (line 913)

### 2. Added Clear Warnings (Both Modes)

**Presentation Mode (after line 558):**
```
❌ **CRITICAL: DO NOT ADD "KEY INSIGHTS" OR "KEY FINDINGS" TEXT BLOCKS!**
• DON'T add massive explanatory text paragraphs about insights
• DON'T add "Key Takeaway" or "Key Findings" sections
• DON'T add summary/conclusion text blocks on content slides
• Content should be concise - use the actual slide title, not generic insight labels
```

**Detailed Mode (after line 866):**
```
❌ **CRITICAL: DO NOT ADD "KEY INSIGHTS" OR "KEY FINDINGS" TEXT BLOCKS!**
• DON'T add massive explanatory text paragraphs about insights
• DON'T add "Key Takeaway" or "Key Findings" sections below charts
• DON'T add summary/conclusion text blocks on content slides
• Content should be concise - use the actual slide title, not generic insight labels
```

## Result
The AI will no longer add:
- "Key Insights" sections
- "Key Findings" headers
- "Key Takeaway" text blocks
- Large explanatory paragraphs about insights/findings/conclusions on content slides

## Files Modified
- `/Users/ahmed/Documents/Dev/nextslide/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

## Testing
Generate presentations and verify that slides no longer contain:
1. Massive "Key Insight" text blocks
2. "Key Findings" section headers on data slides
3. Long explanatory text below charts about insights
4. Generic takeaway/conclusion paragraphs on content slides

The slides should now be cleaner and more concise, using only the slide title and essential bullet points.

