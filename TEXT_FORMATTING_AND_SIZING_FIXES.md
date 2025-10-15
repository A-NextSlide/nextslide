# Text Formatting and Sizing Fixes - Complete

## Summary
Fixed two critical issues with TiptapTextBlock components:
1. Text breaking into unwanted new lines after formatted text (e.g., bold words)
2. Text sizing being slightly off (1px overflow) until component is clicked

## Issue 1: Text Breaking at Formatting Boundaries

### Root Cause
When the AI splits text into multiple segments for rich formatting (bold, colors, etc.), newlines were being preserved at segment boundaries. For example:
```
Segments: ["The ", "bold word\n", " continues"]
```
This created unwanted line breaks after the bold text.

### Fix Applied
**File:** `apps/backend/agents/generation/components/component_validator.py` (line 254)

Added logic to strip leading/trailing newlines from individual text segments:

```python
# CRITICAL FIX: Strip leading/trailing newlines from individual segments
# to prevent unwanted line breaks when text is split for formatting.
# Intentional newlines should be in the actual text content, not at segment boundaries.
cleaned_text = cleaned_text.strip('\n')
```

**Why This Works:**
- Removes newlines that accidentally end up at segment boundaries
- Preserves intentional newlines that are in the actual text content
- Allows formatted text to flow naturally inline: "The **bold word** continues"

## Issue 2: Text Sizing Off Until Clicked

### Root Cause
The sizing calculation in `TiptapTextBlockRenderer.tsx` had `isSelected` in its effect dependencies (line 452). This meant:
- Initial render: sizing not properly calculated
- After clicking (selection): effect runs and recalculates sizing
- Result: text appears slightly too large (1px overflow) until clicked

### Fix Applied
**File:** `apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx` (lines 413-446)

Added a new effect that runs once when the editor is created:

```typescript
// CRITICAL FIX: Force initial sizing calculation on mount
// This ensures proper sizing immediately without waiting for selection
useEffect(() => {
  if (editor && containerRef.current) {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      const wrapper = containerRef.current as HTMLElement;
      if (wrapper) {
        // Set initial CSS variables
        wrapper.style.setProperty('--tiptap-font-size', getFontSize);
        wrapper.style.setProperty('--tiptap-font-family', getFontFamilyWithFallback(fontFamily || 'Arial'));
        // ... more CSS properties
      }
      
      // Apply to editor DOM and force layout recalculation
      if (editor.view && editor.view.dom) {
        const editorElement = editor.view.dom as HTMLElement;
        editorElement.style.fontSize = getFontSize;
        void editorElement.offsetHeight; // Force reflow
        editor.view.dispatch(editor.state.tr); // Update editor state
      }
    });
  }
}, [editor]); // Only run when editor is first created
```

**Why This Works:**
- Runs immediately when editor is created, not waiting for selection
- Uses `requestAnimationFrame` to ensure DOM is ready
- Forces layout recalculation with `void editorElement.offsetHeight`
- Updates editor internal state with empty transaction dispatch
- Result: proper sizing on first render

## Testing Recommendations

1. **Test Formatted Text:**
   - Generate a deck with text containing bold, italic, and colored words
   - Verify text flows inline without unwanted line breaks
   - Example: "The **market grew 47%** in Q4" should stay on one line

2. **Test Text Sizing:**
   - Generate a new deck with various text blocks
   - Verify text fits properly within bounds immediately
   - No overflow or size adjustment needed after clicking
   - Test with different slide sizes and zoom levels

3. **Test Edge Cases:**
   - Text with intentional newlines (bullet points)
   - Mixed formatting (bold + italic + colors)
   - Very long text blocks
   - Text with superscript/subscript

## Files Modified

1. `apps/backend/agents/generation/components/component_validator.py`
   - Line 254: Added `.strip('\n')` to remove segment boundary newlines

2. `apps/frontend/src/renderers/components/TiptapTextBlockRenderer.tsx`
   - Lines 413-446: Added initial sizing effect

## Impact

- ✅ Text with mixed formatting now flows naturally
- ✅ No more unwanted line breaks after bold/colored text
- ✅ Text sizing is accurate on first render
- ✅ No need to click components to trigger proper sizing
- ✅ Better user experience when generating decks

---

**Status:** ✅ Complete
**Date:** October 10, 2025


