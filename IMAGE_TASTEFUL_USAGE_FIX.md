# Tasteful Image Usage Fix - Complete Summary

## Problem
Images weren't loading in the HTML inspired v2 prompt, and there was no clear guidance on using images tastefully and strategically in presentations.

## Solution Implemented

### 1. Updated Optimized Component Schemas
**File:** `apps/backend/agents/prompts/generation/optimized_component_schemas.py`

**Changes:**
- Added comprehensive image usage guidance to the Image component schema (lines 34-45)
- Clarified that images should only be used on 30-40% of content slides
- Added clear examples of good vs bad alt text:
  - ✅ Good: `alt="Tesla car in factory"`, `alt="solar panels on roof"`
  - ❌ Bad: `alt="image"`, `alt="photo"`
- Added when-to-use and when-not-to-use guidelines
- Updated "Use Image for" section (lines 194-200) with specific use cases

### 2. Enhanced HTML Inspired System Prompt V2
**File:** `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

**Changes Made:**

#### A. Main Image Rules Section (lines 540-648)
- Added critical image rules emphasizing descriptive alt text
- Provided examples of good vs bad alt text
- Added complete example Image component showing the correct pattern
- Emphasized that alt text drives image search

#### B. Presentation Mode Guidance (lines 3563-3583)
- Restructured image guidance with clear sections:
  - **WHEN TO USE:** Product showcases, visual explanations, data storytelling, hero slides, technical concepts
  - **WHEN NOT TO USE:** Title slides, simple text slides, conclusion slides, overcrowded slides
  - **IMAGE COMPONENT REQUIREMENTS:** Always use `src="placeholder"` and descriptive alt text
- Added specific examples of good alt text for different contexts

#### C. Detailed Mode Guidance (lines 3545-3548)
- Added minimal image usage guidance (10-20% of slides)
- Specified only essential technical images should be used
- Skip decorative images, stock photos, generic illustrations
- Require descriptive alt text when images are used

### 3. Updated Slide Generator to Use Alt Text
**File:** `apps/backend/agents/generation/slide_generator.py`

**Changes:**
- Modified `_apply_available_images_to_placeholders` method (lines 3424-3433)
- Now uses alt text as a fallback for searchQuery:
  ```python
  component_search_query = img_comp.get('props', {}).get('searchQuery', '').strip().lower()
  # Fallback to alt text if searchQuery not provided
  if not component_search_query:
      component_search_query = img_comp.get('props', {}).get('alt', '').strip().lower()
  ```
- This allows the AI to use alt text for image search, making it easier to generate proper Image components

## How It Works Now

### 1. AI Generation
When the AI generates an Image component, it should now include:
```json
{
  "type": "Image",
  "props": {
    "src": "placeholder",
    "alt": "Tesla electric car in modern factory",
    "position": {"x": 960, "y": 200},
    "width": 800,
    "height": 600,
    "objectFit": "cover",
    "borderRadius": "20px",
    "opacity": 1.0,
    "zIndex": 5
  }
}
```

### 2. Image Search
- The system extracts the `alt` text from the Image component
- Uses it to search for relevant images via SerpAPI/Perplexity
- Matches images based on descriptive keywords in the alt text

### 3. Tasteful Usage
The AI now knows to:
- Only use images on 30-40% of slides (presentation mode)
- Only use images on 10-20% of slides (detailed mode)
- Skip images on title slides, simple text slides, and conclusions
- Use images for: product showcases, visual explanations, data storytelling, technical diagrams

## Key Benefits

1. **Better Image Search:** Alt text provides specific, searchable keywords
2. **Tasteful Design:** Clear guidelines prevent overuse of images
3. **Strategic Placement:** Images only appear where they add value
4. **Improved User Experience:** Users get relevant images that match slide content
5. **Mode-Aware:** Different image usage for presentation vs detailed modes

## Testing

To verify the fix works:
1. Generate a presentation in the HTML inspired v2 mode
2. Check that Image components have descriptive alt text
3. Verify images only appear on appropriate slides (not every slide)
4. Confirm image search returns relevant results based on alt text

## Example Slides

### Good Image Usage ✅
**Product Showcase Slide:**
```json
{
  "type": "Image",
  "props": {
    "src": "placeholder",
    "alt": "Tesla Model S electric car in production line",
    "position": {"x": 100, "y": 200},
    "width": 800,
    "height": 600,
    "objectFit": "cover"
  }
}
```

### Bad Image Usage ❌
**Title Slide with Generic Image:**
```json
// DON'T DO THIS - title slides should use typography, not images
{
  "type": "Image",
  "props": {
    "src": "placeholder",
    "alt": "background image",  // Also: bad alt text!
    "position": {"x": 0, "y": 0},
    "width": 1920,
    "height": 1080
  }
}
```

## Files Changed
1. `apps/backend/agents/prompts/generation/optimized_component_schemas.py`
2. `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
3. `apps/backend/agents/generation/slide_generator.py`

All changes are backward compatible and no breaking changes were introduced.

