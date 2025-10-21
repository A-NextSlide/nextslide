# Theme Font Display Fix

## Problem
When loading a theme in the outline tab, the font display did not update immediately. Users had to click on the text for the font to render properly.

## Root Cause

The theme panel in `OutlineDisplayView.tsx` was using **non-reactive** theme access in the inline styles:

```tsx
// ❌ BEFORE: Non-reactive - doesn't trigger re-render on theme change
style={{ 
  fontFamily: useThemeStore.getState().getWorkspaceTheme().typography.heading?.fontFamily || 'Inter',
  color: useThemeStore.getState().getWorkspaceTheme().typography.heading?.color || '#1f2937'
}}
```

While the component had a reactive `workspaceTheme` variable (line 192):
```tsx
const workspaceTheme = useThemeStore(state => state.getWorkspaceTheme());
```

...it wasn't being used in the font display elements.

### Why This Happened
- `useThemeStore(state => state.something)` → Creates a subscription, re-renders on change ✅
- `useThemeStore.getState().something` → One-time read, no subscription, no re-render ❌

## Solution

### 1. Use Reactive Theme Variable
Replaced all instances of `useThemeStore.getState().getWorkspaceTheme()` in inline styles with the reactive `workspaceTheme` variable:

```tsx
// ✅ AFTER: Reactive - re-renders when theme changes
style={{ 
  fontFamily: workspaceTheme.typography.heading?.fontFamily || 'Inter',
  color: workspaceTheme.typography.heading?.color || '#1f2937',
  borderBottom: `2px solid ${workspaceTheme.accent1 || '#FF4301'}`
}}
```

**Changed in 3 locations:**
1. Background color (line 1705)
2. Heading font display (lines 1741-1743)
3. Body font display (line 1752)

### 2. Added Font Loading on Theme Change
Added robust `useEffect` hooks to automatically load fonts when the theme changes:

```tsx
// Track current font values
const currentHeadingFont = workspaceTheme?.typography?.heading?.fontFamily || '';
const currentBodyFont = workspaceTheme?.typography?.paragraph?.fontFamily || '';

// Load fonts when theme changes - with proper async handling
useEffect(() => {
  if (!currentHeadingFont) return;
  
  let cancelled = false;
  
  (async () => {
    try {
      await FontLoadingService.syncDesignerFonts?.();
      await FontLoadingService.loadFont(currentHeadingFont);
      
      // Small delay to ensure browser has processed the font
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Force verification that font is actually loaded
      if (!cancelled && 'fonts' in document) {
        await document.fonts.load(`24px "${currentHeadingFont}"`);
      }
    } catch (err) {
      console.warn('Failed to load heading font:', currentHeadingFont, err);
    }
  })();
  
  return () => { cancelled = true; };
}, [currentHeadingFont]);

// Similar for body font with 14px size
useEffect(() => {
  if (!currentBodyFont) return;
  
  let cancelled = false;
  
  (async () => {
    try {
      await FontLoadingService.syncDesignerFonts?.();
      await FontLoadingService.loadFont(currentBodyFont);
      await new Promise(resolve => setTimeout(resolve, 50));
      
      if (!cancelled && 'fonts' in document) {
        await document.fonts.load(`14px "${currentBodyFont}"`);
      }
    } catch (err) {
      console.warn('Failed to load body font:', currentBodyFont, err);
    }
  })();
  
  return () => { cancelled = true; };
}, [currentBodyFont]);
```

### 3. Improved Font Selection Handler
Enhanced the font dropdown onChange handler to load fonts BEFORE applying them to the theme:

```tsx
onChange={async (value) => {
  const fontName = String(value);
  
  // Load font FIRST before applying to theme
  try {
    await FontLoadingService.syncDesignerFonts?.();
    await FontLoadingService.loadFont(fontName);
    // Small delay to ensure font is rendered
    await new Promise(resolve => setTimeout(resolve, 100));
  } catch (err) {
    console.warn('Font loading error:', err);
  }
  
  // Now apply the theme update
  if (fontEditor.type === 'heading') {
    applyThemeUpdate((t) => ({ ...t, typography: { ...t.typography, heading: { ...t.typography?.heading, fontFamily: fontName } } }));
  } else {
    applyThemeUpdate((t) => ({ ...t, typography: { ...t.typography, paragraph: { ...t.typography?.paragraph, fontFamily: fontName } } }));
  }
  setFontEditor(null);
}}
```

## How It Works Now

### Before Fix:
```
1. Theme loads with new fonts
2. workspaceTheme state updates ✅
3. Component re-renders ✅
4. Inline styles use useThemeStore.getState() → reads OLD cached value ❌
5. Font doesn't display → user clicks text
6. Click triggers some other update → font finally renders
```

### After Fix:
```
1. Theme loads with new fonts
2. workspaceTheme state updates ✅
3. useEffect triggers on currentHeadingFont/currentBodyFont change ✅
4. Font files are loaded asynchronously:
   - syncDesignerFonts() ensures backend fonts are available
   - loadFont() loads the specific font file
   - 50ms delay for browser processing
   - document.fonts.load() verifies font is ready
5. Component re-renders ✅
6. Inline styles use workspaceTheme → uses NEW reactive value ✅
7. Font displays immediately with correct typeface ✅
```

### Manual Font Selection:
```
1. User clicks heading/body text
2. Dropdown opens
3. User selects "Press Start 2P"
4. onChange handler triggered:
   - Awaits font loading (syncDesignerFonts + loadFont)
   - Waits 100ms for font to be processed
   - THEN applies theme update
5. Font displays immediately in correct typeface ✅
6. Dropdown closes
```

## Files Changed
- `apps/frontend/src/components/outline/OutlineDisplayView.tsx`

## Testing

1. **Load a theme in outline tab**
   - Open outline editor
   - Switch to "Theme" tab
   - Navigate between themes using arrows
   - **Expected**: Font displays immediately in correct typeface without needing to click

2. **Change fonts manually - especially pixel/display fonts**
   - Click on "Heading Sample" or "Body sample text"  
   - Select "Press Start 2P" or other Google font
   - **Expected**: 
     - Font loads (brief moment)
     - Preview updates with actual typeface
     - No fallback font shown
     - Dropdown shows correct selection

3. **Test with various font types**
   - Google fonts: "Press Start 2P", "Roboto"
   - Designer fonts: Custom uploaded fonts
   - System fonts: "Arial", "Times New Roman"
   - **Expected**: All font types render correctly

4. **Theme cycling with different fonts**
   - Generate multiple themes with different fonts
   - Cycle through them quickly
   - **Expected**: 
     - Each theme's fonts load and display correctly
     - No FOUC (Flash of Unstyled Content)
     - Smooth transitions

## Impact

### Immediate Benefits
- ✅ Fonts display immediately in correct typeface when theme loads
- ✅ No need to click text to trigger font rendering
- ✅ No more fallback fonts showing instead of selected font
- ✅ Smooth theme transitions with proper font loading
- ✅ Better user experience - WYSIWYG works correctly

### Technical Improvements
- ✅ Reactive theme subscription (workspaceTheme instead of getState())
- ✅ Async font loading before theme application
- ✅ Font verification using document.fonts.load()
- ✅ Proper cleanup with useEffect cancellation
- ✅ Consistent with how colors update (both now reactive)

### Fixed Edge Cases
- ✅ Google fonts with spaces/numbers ("Press Start 2P")
- ✅ Designer fonts requiring backend API calls
- ✅ Fast theme switching (proper cancellation)
- ✅ Font loading failures (graceful fallback)

## Specific Fix: "Press Start 2P" and Similar Fonts

### The Problem
User reported: "Press Start 2P" was selected in dropdown but not rendering on the heading text.

### Why It Happened
1. Font selection updated `workspaceTheme.typography.heading.fontFamily = "Press Start 2P"`
2. Component re-rendered with new fontFamily in inline style
3. **BUT** the font file wasn't loaded yet from Google Fonts
4. Browser fell back to default font while font was loading
5. User saw the fallback font instead of "Press Start 2P"

### The Fix
Two-part solution:

**Part 1: Pre-load on theme change**
```tsx
useEffect(() => {
  // When font changes in theme, load it immediately
  await FontLoadingService.loadFont(currentHeadingFont);
  // Verify it's ready
  await document.fonts.load(`24px "${currentHeadingFont}"`);
}, [currentHeadingFont]);
```

**Part 2: Load before applying on manual selection**
```tsx
onChange={async (value) => {
  // Load font FIRST
  await FontLoadingService.loadFont(fontName);
  await new Promise(resolve => setTimeout(resolve, 100));
  // THEN update theme
  applyThemeUpdate(...);
}}
```

### Result
- Font files load **before** or **immediately when** applied to theme
- Browser has font available when it tries to render the text
- No fallback font displayed
- "Press Start 2P" shows correctly in pixel font style

## Technical Notes

### React Zustand Store Patterns

**Reactive (subscribes to changes):**
```tsx
const theme = useThemeStore(state => state.getWorkspaceTheme());
// Re-renders when getWorkspaceTheme() returns different value
```

**Non-reactive (one-time read):**
```tsx
const theme = useThemeStore.getState().getWorkspaceTheme();
// Only reads once, never updates
```

**In useEffect/callbacks:**
```tsx
useEffect(() => {
  const theme = useThemeStore.getState().getWorkspaceTheme();
  // This is fine - we want the current value at effect time
}, [dependency]);
```

**In render (JSX):**
```tsx
// ❌ BAD: Won't update on changes
<div style={{ color: useThemeStore.getState().theme.color }} />

// ✅ GOOD: Updates reactively
const theme = useThemeStore(state => state.theme);
<div style={{ color: theme.color }} />
```

## Related Issues

This same pattern should be checked elsewhere:
- Other components using `useThemeStore.getState()` in JSX
- Any inline styles reading from zustand stores
- Other theme-dependent visual elements

## Summary

**Problem**: Non-reactive theme access in inline styles  
**Solution**: Use reactive zustand hook subscription + auto-load fonts on change  
**Result**: Immediate font rendering when themes load

