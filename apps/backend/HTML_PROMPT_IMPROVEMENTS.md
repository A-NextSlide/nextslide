# HTML Prompt Improvements - Cleaner, More Professional Slides

## Changes Made

### 1. 🧹 Reduced "Boxy" Templates
**Problem:** Every text element was being wrapped in colored background boxes, creating cluttered, unprofessional slides.

**Solution:**
- **Primary approach:** TiptapTextBlock components directly on slide backgrounds (NO Shape wrappers)
- **Shape (hasText=true) usage:** ONLY for key stats, callout boxes, and critical highlights
- **Never** wrap regular body text, bullet points, or standard content in colored boxes
- Think Apple Keynote: clean typography and space, not boxes everywhere

**Updated Sections:**
- System prompt: Added "MINIMIZE BACKGROUND BOXES" critical rule
- Component guidance: Emphasized TiptapTextBlock as primary text method
- Slide patterns: Changed from "Shape (hasText=true) cards" to "TiptapTextBlock directly on background"

### 2. 🎨 Enforced Theme Colors Only
**Problem:** Shapes and CustomComponents were sometimes using default colors (#3B82F6, #8B5CF6) instead of the generated theme colors.

**Solution:**
- **Explicit theme color enforcement** in all critical sections
- CustomComponent render functions MUST use `props.primaryColor`, `props.secondaryColor` (auto-injected)
- Shape fills ONLY use provided theme colors (primary, secondary, accent)
- Added red fallbacks (#FF0000) in examples to make color errors obvious
- NEVER hardcode default blue/purple colors

**Updated Sections:**
- Critical rules: "THEME COLORS ONLY - NEVER DEFAULT COLORS" as rule #1
- CustomComponent examples: Emphasized props.primaryColor usage
- User prompt: Explicit theme colors listed with warnings
- Slide guidance: "theme colors ONLY!" repeated in each pattern

### 3. 🏢 Internal Company Docs - Consistent Structure
**Problem:** Internal presentations needed consistent, professional structure with headers, slide numbers, titles, sources in same positions.

**Solution:** Added comprehensive "INTERNAL COMPANY DOCS - CONSISTENT STRUCTURE" section

**Fixed Elements (same position on EVERY slide):**

1. **Slide Numbers:**
   - Position: Bottom-right (x: 1780, y: 1020, 120×40)
   - Size: 18-22pt
   - Color: 50% opacity of theme text color
   - Format: "Slide X of Y" or just "X"
   - Present on all slides except title

2. **Header Section (top 120px):**
   - Company logo: Top-left (x: 60, y: 40, 100×60)
   - Section name: Top-right (x: 1500, y: 50, 350×50, 20pt)
   - Horizontal Line divider: y: 120, full width, 2px, theme primary 20% opacity

3. **Title Area:**
   - Main title: ALWAYS at y: 160-180
   - Font size: 60-80pt for content slides (not 120pt+ for internal docs)
   - Width: 1600px, centered or left-aligned at x: 120
   - Subtitle: y: 240, 32-38pt

4. **Content Area:**
   - Starts at y: 300 (after title/subtitle)
   - Available space: y: 300 to y: 980 (680px height)
   - Left margin: x: 120, right margin: x: 1800

5. **Footer/Source:**
   - Position: y: 980-1020 (bottom 60px)
   - Font: 16-18pt, 50% opacity
   - Format: "Source: [citation]" or "Data as of [date]"
   - Left-aligned at x: 120 OR right-aligned before slide number

**Visual Consistency:**
- Background: Usually solid or subtle gradient (same style across deck)
- Minimal decorative elements - focus on content clarity
- Clean, professional layouts - no excessive decoration
- Sources/citations REQUIRED for data slides

## Key Improvements Summary

### Before:
- ❌ Every text element had a colored background box
- ❌ Default blue/purple colors used instead of theme colors
- ❌ Inconsistent slide structure for internal docs
- ❌ Cluttered, "PowerPoint 2010" look

### After:
- ✅ Clean, modern layouts with text directly on backgrounds
- ✅ Shapes only for emphasis and key highlights
- ✅ Strict theme color enforcement throughout
- ✅ Consistent structure for internal company docs
- ✅ Apple Keynote/Behance-style professional look

## Files Modified

1. **`apps/backend/agents/prompts/generation/html_inspired_system_prompt_dynamic.py`**
   - Updated web patterns to emphasize clean layouts
   - Added "MINIMIZE BACKGROUND BOXES" critical section
   - Enhanced theme color enforcement
   - Added comprehensive internal docs structure section
   - Updated critical rules with clear priorities

2. **`apps/backend/agents/generation/html_inspired_generator.py`**
   - Updated user prompt critical requirements
   - Modified content analysis guidance
   - Updated slide-type specific guidance
   - Added internal docs structure hints

## Usage Guidelines

### When to Use Shape (hasText=true):
- ✅ Key statistics that need emphasis (e.g., "$2.4M Revenue")
- ✅ Call-to-action boxes
- ✅ Critical highlights or callouts
- ❌ Regular body text
- ❌ Bullet point lists
- ❌ Standard content paragraphs

### Theme Colors:
- **Always** use the theme colors provided in the generation context
- **Never** hardcode #3B82F6, #8B5CF6, or any default colors
- CustomComponent: Use `props.primaryColor`, `props.secondaryColor`, `props.textColor`
- Shapes: Use theme primary, secondary, or accent colors for fills

### Internal Company Docs:
- Enable consistent structure mode for:
  - Internal reports
  - Company presentations
  - Documentation decks
  - Training materials
- Slide numbers, headers, and footers in fixed positions
- Professional, clean layouts
- Minimal decoration, focus on content

## Testing Recommendations

1. **Generate a standard presentation** - verify reduced boxes, clean layouts
2. **Check theme color usage** - ensure no default blue/purple colors appear
3. **Create internal doc** - verify consistent structure (headers, slide numbers, titles)
4. **Test CustomComponents** - confirm theme colors are used in render functions
5. **Review overall aesthetic** - should look like Apple Keynote, not PowerPoint 2010

## Expected Results

Slides should now be:
- **Cleaner** - Less cluttered with fewer background boxes
- **More structured** - Consistent positioning for internal docs
- **Theme-compliant** - Only using generated theme colors
- **Professional** - Modern presentation aesthetic
- **Readable** - Better use of whitespace and typography

