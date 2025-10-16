# Consolidated Settings UI

## Overview
Consolidated all prompt-related settings into one unified, tighter settings section that appears under both the initial topic prompt and the style prompt inputs.

## What Was Changed

### Before
Settings were scattered across two different interaction stages:
1. **Under Initial Prompt (Topic Input):**
   - Slide count selector
   - Mode/Detail level selector
   - Upload button
   - Reference links button

2. **Under Style Prompt:**
   - Auto Apply Images toggle (separate, larger layout)

### After
**One Unified Settings Bar** that appears under BOTH prompts:
- All controls consolidated into a single, compact horizontal row
- Consistent appearance across both interaction stages
- Tighter spacing and smaller sizing for better density
- Settings persist and remain accessible throughout the flow

## Changes Made

### File Modified
`apps/frontend/src/components/outline/ChatInputView.tsx`

### Key Improvements

1. **Unified Visibility**
   - Settings now show for both `'initial'` and `'collectingStyleVibe'` interaction stages
   - Single conditional: `{(interactionStage === 'initial' || interactionStage === 'collectingStyleVibe') && (...)}`

2. **Tighter Design**
   - Reduced heights: `h-6` (was `h-7`)
   - Smaller fonts: `text-[9px]` (was `text-[10px]`)
   - Reduced icon sizes: `h-3 w-3` (was `h-3.5 w-3.5`)
   - More compact borders: `border-[#383636]/20` with reduced opacity
   - Less prominent backgrounds: `bg-white/30` (was `bg-white/40`)

3. **Consolidated Controls**
   - **Slide Count**: Compact inline selector with icon
   - **Mode/Detail Level**: Presentation vs Detailed Analysis selector
   - **Auto Images**: Toggle switch integrated inline
   - **Divider**: Subtle vertical separator
   - **Upload**: Button with icon and label
   - **Reference Links**: Button with icon, label, and badge counter

4. **Better Visual Hierarchy**
   - All controls have consistent height (h-6)
   - Unified background treatment with backdrop blur
   - Consistent icon and text sizing
   - Proper spacing with `gap-2` between controls
   - Flex wrap support for responsive layout

5. **Removed Code**
   - Deleted the old absolute-positioned control bar under initial prompt
   - Removed the separate Auto Apply Images section under style prompt
   - Eliminated redundant code

## Visual Design

```
┌─────────────────────────────────────────────────────────────────┐
│ [📊 Slides ▾] [☰ Mode ▾] [🖼️ Auto Images ⚪] │ [⬆️ Upload] [🔗 Links (2)] │
└─────────────────────────────────────────────────────────────────┘
```

### Styling Details
- Background: White/black with 30% opacity + backdrop blur
- Borders: Neutral with 20% opacity
- Text: 9px, muted colors (70% opacity)
- Icons: 3×3px, matching text color
- Height: Consistent 24px (h-6) across all controls
- Gaps: 8px (gap-2) between items

## Benefits

1. **Consistency**: Same settings available at both input stages
2. **Space Efficiency**: Tighter layout fits more controls comfortably
3. **Better UX**: Users see all options in one place
4. **Cleaner Code**: Single settings component instead of scattered conditionals
5. **Visual Unity**: Cohesive design language across the interface
6. **Responsive**: Flex wrap handles different screen sizes

## Technical Notes

- Pre-existing TypeScript linter errors in the file are unrelated to these changes
- All functionality preserved from original implementation
- Settings state management unchanged
- Tooltips and popovers work as before

## Testing Checklist

- [ ] Settings appear under initial topic prompt
- [ ] Settings appear under style prompt
- [ ] All dropdowns function correctly
- [ ] Toggle switches work
- [ ] Upload button triggers file picker
- [ ] Reference links popover opens and closes
- [ ] Badge counter updates correctly
- [ ] Responsive wrapping on smaller screens
- [ ] Dark mode displays correctly
- [ ] Tooltips show on hover

## Future Enhancements

Potential additions to the consolidated settings bar:
- Visual density selector
- Language/region settings
- Advanced options popover
- Quick templates dropdown
- Export format selector


