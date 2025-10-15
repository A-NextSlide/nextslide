# Font Loading Integration Guide

## Quick Start

The new exquisite font selection system is now **fully integrated** into theme generation. Here's how to use it:

## Backend (Already Integrated ✓)

Theme generation in `theme_director.py` now automatically:
1. Analyzes deck context (title, vibe, keywords, audience)
2. Uses EnhancedFontService to score 900+ fonts based on metadata
3. Applies variety penalties to avoid repetition
4. Selects intelligent font pairs with `select_font_pair()`

**No changes needed** - it works automatically.

## Frontend Integration

### Option 1: Automatic (Recommended)

When a theme is generated and received from the backend, the fonts will be in the theme object:

```typescript
const theme = {
  typography: {
    heading: {
      fontFamily: "Sophistik Sans - Modern Sans Typeface"
    },
    paragraph: {
      fontFamily: "Hyperion - Sleek Modern Sans"
    }
  }
};
```

The `FontLoadingService` will automatically load these fonts when needed through the existing `loadFont()` mechanism.

### Option 2: Explicit Loading (For Better UX)

To preload fonts immediately after theme generation for instant rendering:

```typescript
import { FontLoadingService } from '@/services/FontLoadingService';

// After receiving theme from backend
const heroFont = theme.typography.heading.fontFamily;
const bodyFont = theme.typography.paragraph.fontFamily;

// Preload both fonts in parallel
await FontLoadingService.loadThemeFonts(heroFont, bodyFont);

// Now fonts are ready for rendering
```

### Where to Add Font Preloading

**Recommended locations:**

1. **Theme Generation Handler** (when user creates/generates theme):
```typescript
// In your theme generation handler
async function handleGenerateTheme(context: ThemeContext) {
  const theme = await api.generateTheme(context);
  
  // Preload fonts for instant rendering
  await FontLoadingService.loadThemeFonts(
    theme.typography.heading.fontFamily,
    theme.typography.paragraph.fontFamily
  );
  
  applyTheme(theme);
}
```

2. **Theme Switcher** (when user switches themes):
```typescript
// When switching themes
async function handleThemeChange(newTheme: Theme) {
  // Preload fonts before applying
  await FontLoadingService.loadThemeFonts(
    newTheme.typography.heading.fontFamily,
    newTheme.typography.paragraph.fontFamily
  );
  
  setCurrentTheme(newTheme);
}
```

3. **Deck Loader** (when loading existing deck):
```typescript
// When loading a deck
async function loadDeck(deckId: string) {
  const deck = await api.loadDeck(deckId);
  
  // Preload deck's theme fonts
  if (deck.theme) {
    await FontLoadingService.loadThemeFonts(
      deck.theme.typography.heading.fontFamily,
      deck.theme.typography.paragraph.fontFamily
    );
  }
  
  setCurrentDeck(deck);
}
```

## API Reference

### FontLoadingService.loadThemeFonts()

```typescript
loadThemeFonts: async (heroFont: string, bodyFont: string): Promise<void>
```

**Parameters:**
- `heroFont`: Font name for headings/titles (typically bold weight)
- `bodyFont`: Font name for body text (typically regular weight)

**Returns:** Promise that resolves when both fonts are loaded

**Example:**
```typescript
await FontLoadingService.loadThemeFonts(
  'Sophistik Sans - Modern Sans Typeface',
  'Hyperion - Sleek Modern Sans'
);
```

### FontLoadingService.syncDesignerFonts()

```typescript
syncDesignerFonts: async (): Promise<void>
```

**Purpose:** Syncs metadata for all 900+ fonts from backend

**When to call:** 
- On app initialization (already done in `FontPreloader.tsx`)
- After font library updates

**Note:** Only syncs metadata (~500KB), not font files

**Example:**
```typescript
// In app initialization
useEffect(() => {
  FontLoadingService.syncDesignerFonts();
}, []);
```

## Performance Notes

### What Gets Loaded When

1. **App Start:**
   - System fonts (20 fonts) - instant
   - Metadata for 900+ fonts (~500KB JSON) - 300ms
   - Common web fonts (100 fonts) - background loading

2. **Theme Generation:**
   - Only the 2-3 fonts picked by theme generator
   - Parallel loading (~400ms total for both fonts)

3. **Font Rendering:**
   - Fonts load on-demand if not preloaded
   - Browser caching after first load

### Best Practices

✅ **DO:**
- Preload theme fonts after generation for instant rendering
- Let common fonts load in background on idle
- Use `loadThemeFonts()` for explicit font pairs

❌ **DON'T:**
- Load all 900 fonts upfront
- Block UI while loading fonts
- Load fonts synchronously

## Troubleshooting

### Fonts Not Loading

**Problem:** Font shows as fallback (Arial, sans-serif)

**Solutions:**
1. Check if font name matches exactly (case-sensitive)
2. Verify backend is returning correct font names
3. Check browser console for font loading errors
4. Try calling `loadThemeFonts()` explicitly

**Debug:**
```typescript
console.log('Available fonts:', FontLoadingService.getAllFontNames());
console.log('Loaded fonts:', FontLoadingService.getLoadedFonts());
```

### Slow Font Loading

**Problem:** Fonts take too long to load

**Solutions:**
1. Ensure fonts are being preloaded in parallel
2. Check network tab for font file sizes
3. Verify CDN/backend is responding quickly
4. Consider adding font-display: swap to CSS

### Font Variety Issues

**Problem:** Same fonts appearing repeatedly

**Solution:** The backend variety mechanism handles this automatically. If you still see repetition:
1. Clear backend cache/restart server
2. Verify variety_seed is different for each generation
3. Check `test_font_variety.py` results

## Examples

### Complete Integration Example

```typescript
// ThemeGenerator.tsx
import { FontLoadingService } from '@/services/FontLoadingService';
import { generateTheme } from '@/api/themes';

export function ThemeGenerator() {
  const [isGenerating, setIsGenerating] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(null);

  async function handleGenerate() {
    setIsGenerating(true);
    
    try {
      // Generate theme from backend
      const theme = await generateTheme({
        title: 'Tech Startup Pitch Deck',
        vibe: 'modern',
        keywords: ['technology', 'software']
      });
      
      // Preload fonts for instant rendering
      await FontLoadingService.loadThemeFonts(
        theme.typography.heading.fontFamily,
        theme.typography.paragraph.fontFamily
      );
      
      // Apply theme
      setCurrentTheme(theme);
      
      console.log('Theme generated with fonts:', {
        hero: theme.typography.heading.fontFamily,
        body: theme.typography.paragraph.fontFamily
      });
      
    } catch (error) {
      console.error('Theme generation failed:', error);
    } finally {
      setIsGenerating(false);
    }
  }
  
  return (
    <button onClick={handleGenerate} disabled={isGenerating}>
      {isGenerating ? 'Generating...' : 'Generate Theme'}
    </button>
  );
}
```

## Testing

### Manual Testing

1. Generate a theme
2. Check browser console for font loading messages:
   ```
   [FontLoadingService] Loading theme fonts: Sophistik Sans (hero), Hyperion (body)
   [FontLoadingService] Theme fonts loaded successfully
   ```
3. Inspect element and verify computed font-family
4. Generate multiple themes and verify variety

### Automated Testing

Run the backend test:
```bash
cd apps/backend
python3 test_font_variety.py
```

Should show:
- ✓ 100% unique font pairs
- ✓ No boring default fonts
- ✓ Context-appropriate selections

## Summary

The new font system is **fully integrated** and works automatically. For best UX:

1. ✅ Backend automatically selects intelligent, varied fonts
2. ✅ Frontend syncs metadata on startup (already done)
3. ✅ Optionally call `loadThemeFonts()` for instant rendering
4. ✅ Lazy loading prevents performance issues

**That's it!** The system handles the complexity automatically while giving you control when needed.


