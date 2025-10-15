# Outline Generation & Design Improvements

## Summary
Comprehensive improvements to outline generation, design considerations, and UI/UX for presentation detail level selection.

---

## 1. Enhanced Outline Generation Prompts with Design Considerations

### Location
- `apps/backend/agents/prompts/generation/outline_prompts.py`

### Changes
Added comprehensive design and layout guidance to outline generation:

#### Text Hierarchy & Structure
- **Title**: Main slide heading (40-80pt) - 3-8 words
- **Subtitle/Kicker**: Supporting line (20-30pt) - provides context
- **Body Text**: Main content (24-36pt) - bullets, NOT paragraphs
- **Caption/Label**: Descriptive text (16-22pt) - chart labels, sources, footnotes

#### Text Placement & Components
- **Above Charts**: Short title + optional subtitle
- **Below Charts**: Caption for sources/dates
- **Inside Shapes/Callouts**: Key metrics or highlights
- **Standalone Text Blocks**: Main content with bullets

#### Component-Specific Text Structure
Now specifies how to structure content for different components:
- `TITLE:` - Main slide title
- `SUBTITLE:` - Supporting kicker text
- `BULLET:` - Regular bullet point
- `CALLOUT:` - Highlighted box/shape text
- `CHART TITLE:` - Text above chart
- `CHART LABEL:` - Axis or data labels
- `CAPTION:` - Small text (source, date)
- `QUOTE:` - Large quote display
- `STAT:` - Large statistic display

#### Detail Level Differentiation

**DETAILED ANALYSIS presentations include:**
- More comprehensive bullet points (20-35 words each)
- Rich context and detailed explanations
- Multiple supporting data points and evidence
- Granular breakdowns with sub-bullets
- Extensive metadata (subtitles, captions, sources, dates)
- Target: 250-400 words per content slide

**PRESENTATION MODE keeps:**
- Focused bullets (8-15 words each)
- Essential information with clarity
- Moderate supporting text
- Clear, actionable points
- Target: 100-150 words per content slide

---

## 2. Frontend: Simple/Detailed Presentation Mode Selection

### Location
- `apps/frontend/src/components/outline/OutlineEditor.tsx`
- `apps/frontend/src/components/outline/ChatInputView.tsx`

### Changes

#### New Interaction Stage
Added `'selectingDetailLevel'` to the interaction flow:
```typescript
export type InteractionStage =
  | 'initial'
  | 'collectingStyleVibe'
  | 'selectingDetailLevel'  // NEW
  | 'typingMessage'
  | 'showOptions';
```

#### UI Components
Created beautiful selection cards:
- **Simple Option**: Blue gradient icon, shows slide with minimal details
- **Detailed Option**: Purple gradient icon, shows slide with rich details
- Modern hover effects with scale and shadow animations
- Visual representations using bar charts to show content density

#### Flow Integration
- Appears after style/vibe input
- Before "Let's perfect your content" message
- Clicking either option triggers `handleDetailLevelSelected(level)`
- Proceeds to typing message stage

#### Props Added
- `handleDetailLevelSelected: (level: 'quick' | 'standard' | 'detailed') => void`

---

## 3. Fixed Shape Color Defaults

### Location
- `apps/backend/agents/generation/html_inspired_generator.py`
- `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`

### Changes

#### Updated Shape Examples
Changed from hardcoded `#3B82F6` to theme colors:

**Before:**
```json
{
  "fill": "#3B82F6"
}
```

**After:**
```json
{
  "fill": "{theme_colors['primary']}"  // USE THEME COLOR
}
```

#### Added Explicit Warnings
- `❌ NEVER #3B82F6! Use theme color!`
- Examples now show `<USE_THEME_PRIMARY_OR_ACCENT>` placeholder
- Reinforced in multiple sections of prompts

---

## 4. Fixed Shape Text Structure

### Location
- `apps/backend/agents/generation/html_inspired_generator.py`
- `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`

### Changes

#### Proper Tiptap Structure for Shape Text
Added complete example with all required fields:

```json
{
  "type": "Shape",
  "props": {
    "fill": "{theme_colors['primary']}",
    "fontSize": 24,
    "fontFamily": "{theme_dict.get('body_font', 'Inter')}",
    "texts": [{
      "text": "Key Insight",
      "style": {
        "textColor": "#FFFFFF",
        "backgroundColor": "transparent",
        "bold": true,
        "italic": false,
        "underline": false
      }
    }]
  }
}
```

#### Key Improvements
- **Theme Font**: Uses `theme_dict.get('body_font', 'Inter')`
- **Complete Style Object**: All required fields (textColor, backgroundColor, bold, italic, underline)
- **Proper Text Color**: White text for visibility on colored backgrounds
- **Transparent Background**: No background on text itself

---

## 5. Backend: Detail Level Integration

### Location
- `apps/backend/services/outline/generator.py`

### Changes

Added detail level guidance to Perplexity outline generation:

```python
"DETAIL LEVEL GUIDANCE (CRITICAL):\n"
f"- Current detail level: {options.detail_level}\n"
f"- {'SIMPLE/STANDARD: Keep bullets concise (6-12 words). Focus on essential points only. Target 60-100 words per content slide.' 
   if options.detail_level in ['quick', 'standard'] 
   else 'DETAILED: Use comprehensive bullets (12-18 words). Include rich context, supporting data, and granular explanations. Target 120-160 words per content slide. Add more subtitles, captions, and contextual information.'}\n\n"
```

---

## Impact & Benefits

### For Users
1. **Better Content Structure**: Outlines now consider the entire slide design, not just text content
2. **Clear Choice**: Visual selection between Simple and Detailed presentation modes
3. **Consistent Theming**: Shapes now properly use theme colors instead of default blue
4. **Professional Text**: Shape text uses proper formatting with theme fonts

### For AI Generation
1. **Better Guidance**: AI now understands text hierarchy and component placement
2. **Design Context**: Knows when to use callouts, captions, subtitles, etc.
3. **Detail Control**: Can generate appropriate content density based on user selection
4. **Theme Compliance**: Explicit instructions to use theme colors and fonts

### For Slides
1. **Improved Layout**: Text placement considers component types
2. **Better Hierarchy**: Clear distinction between titles, subtitles, body, and captions
3. **Theme Consistency**: All shapes and text use theme colors
4. **Proper Structure**: Tiptap text structure with all required fields

---

## Testing Recommendations

1. **Test Simple Mode**: Generate a presentation with Simple mode selected
   - Verify concise bullets (6-10 words)
   - Check 60-90 words per slide target

2. **Test Detailed Mode**: Generate a presentation with Detailed mode selected
   - Verify comprehensive bullets (12-18 words)
   - Check 120-150 words per slide target
   - Verify additional captions and subtitles

3. **Test Shape Colors**: Generate slides with shapes
   - Verify shapes use theme primary/secondary/accent colors
   - Verify NO default #3B82F6 colors appear

4. **Test Shape Text**: Generate slides with text in shapes
   - Verify proper tiptap structure
   - Verify theme fonts are used
   - Verify text color provides good contrast

---

## Files Modified

### Backend
1. `apps/backend/agents/prompts/generation/outline_prompts.py`
2. `apps/backend/agents/generation/html_inspired_generator.py`
3. `apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`
4. `apps/backend/services/outline/generator.py`

### Frontend
1. `apps/frontend/src/components/outline/OutlineEditor.tsx`
2. `apps/frontend/src/components/outline/ChatInputView.tsx`

---

## Next Steps

1. Monitor generated presentations for adherence to new guidelines
2. Collect user feedback on Simple vs Detailed distinction
3. Fine-tune word count targets based on real usage
4. Consider adding a "Custom" mode for advanced users

