# Title Slide Font Size Improvements

## Changes Made

Significantly increased font sizes across all title slide layouts to create more impactful, professional-looking presentations.

### Updated Font Sizes

#### Main Title (Hero Text)
- **Before**: 180-220pt
- **After**: 260-300pt
- **Increase**: +40-80pt (~30-40% larger)

#### Subtitle
- **Before**: 48-52pt
- **After**: 64-68pt  
- **Increase**: +16pt (~33% larger)

#### Presenter/Author
- **Before**: 30pt
- **After**: 36pt
- **Increase**: +6pt (20% larger)

#### Metadata/Footer
- **Before**: 20-24pt
- **After**: 26-28pt
- **Increase**: +4-6pt (20-25% larger)

### Files Modified

**Primary File:**
- `/apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

### Specific Updates

#### 1. Design Philosophy (Lines 1780-1787)
Updated to emphasize MASSIVE, IMPACTFUL typography:
- Title: 260-300pt for maximum visual impact
- Subtitle: 64-80pt for strong hierarchy
- Metadata: 26-30pt for readability

#### 2. Option 1: CLASSIC CENTER
- Title fontSize: **180pt → 280pt**
- Subtitle fontSize: **52pt → 68pt**
- Position adjustments for better spacing

#### 3. Option 2: FULL-HEIGHT IMAGE  
- Title fontSize: **220pt → 300pt**
- Subtitle fontSize: **48pt → 64pt**
- Metadata fontSize: **22pt → 26pt**
- Enhanced text shadow for better readability over images

#### 4. Option 3: MINIMAL ELEGANCE
- Title fontSize: **160pt → 260pt**
- Metadata fontSize: **20pt → 26pt**

#### 5. LEFT-ALIGNED LAYOUT (Detailed Mode)
- Main Title: **220pt → 280pt**
- Subtitle: **48pt → 68pt**
- Presenter: **30pt → 36pt**
- Metadata: **24pt → 28pt**

### Visual Improvements

1. **Stronger Hierarchy**: The dramatic size increase creates better visual hierarchy
2. **More Professional**: Larger fonts appear more polished and magazine-quality
3. **Better Readability**: Text is easier to read from a distance
4. **Modern Look**: Matches contemporary design trends with bold typography
5. **Impactful First Impression**: Title slides now command immediate attention

### Typography Best Practices Applied

- **Line Height**: Reduced to 1.0-1.05 for large titles (was 1.1)
- **Letter Spacing**: Tightened to -0.03 for large fonts (negative tracking)
- **Font Weight**: Maintained at 800-900 for maximum impact
- **Text Shadows**: Enhanced on image overlays for better contrast

### Expected Results

When generating new presentations:
- Title slides will have much larger, more commanding titles
- Better visual balance with images and backgrounds
- More professional, polished appearance
- Stronger brand impression

### Backward Compatibility

- Existing presentations are not affected
- Only new generations will use the updated sizes
- All layout options remain available

## Testing

To test the improvements:
1. Generate a new presentation
2. Observe the title slide
3. Font sizes should be dramatically larger and more impactful
4. Hierarchy should be clear: Title >> Subtitle >> Presenter >> Metadata

## Related Guidelines

Also check:
- `apps/backend/agents/prompts/editing/style_guidelines.py` - Hero Titles: 80-120pt (general)
- `apps/backend/agents/prompts/editing/layout_guidelines.py` - Title slides: 250-300pt
- Now aligned with layout guidelines!

