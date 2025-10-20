# Multi-Item Slides Fix - Complete Implementation

## Problem Statement

When creating slides about multiple distinct items (e.g., planets, products, team members), the system was:
- Grouping all items together with just 1 generic image
- Not providing individual images for each item
- Not creating separate, nicely styled sections for each item

## Solution Overview

Implemented a comprehensive multi-item detection and handling system that:
1. **Detects** when slide content is about multiple distinct items
2. **Extracts** each item name individually
3. **Searches** for images specific to each item
4. **Generates** separate sections with individual styling for each item
5. **Matches** images to components using metadata

## Changes Made

### 1. Generation Prompts (`html_inspired_system_prompt_v2.py`)

**Location:** Lines 502-843

Added comprehensive multi-item slide guidance including:

- **Detection triggers**: When to use multi-item layouts
  - Slides about planets, products, people, locations, features, etc.
  - Any slide listing multiple distinct entities

- **Layout patterns**:
  - **Pattern A**: Horizontal sections (2-3 items in columns)
  - **Pattern B**: Vertical stack (alternating image/text rows)
  - **Pattern C**: Grid layout (2x3 or 3x2 for 4-6 items)

- **Critical metadata requirement**: Each Image component must include:
  ```json
  {
    "metadata": {
      "topic": "Item name",
      "searchQuery": "Item name context"
    }
  }
  ```

- **Example layouts** with exact positioning, sizing, and spacing guidelines

**Key sections:**
- When to use multi-item layout (line 513-519)
- Layout patterns with code examples (line 521-784)
- Metadata requirements (line 786-811)
- Spacing and text sizing guidelines (line 813-828)
- Do's and Don'ts checklist (line 830-841)

### 2. Image Search Service (`combined_image_service.py`)

**New Function:** `_extract_multi_item_entities()` (Lines 2209-2311)

Detects and extracts multiple items from slide content using:

**Pattern Detection:**
1. **List delimiters**: Bullets (-, •, *), numbers (1., 2., 3.)
2. **Comma-separated lists**: "Mercury, Venus, Earth, and Mars"
3. **Versus patterns**: "X vs Y", "X and Y"

**Smart Extraction:**
- Extracts first 1-3 capitalized words per line as item names
- Filters out common stop words and vague terms
- Deduplicates while preserving distinct items
- Adds deck subject as context (e.g., "Mercury" → "Mercury planet")

**Returns:**
- Empty list if < 2 distinct items found (not multi-item)
- List of contextualized item names if 2+ items found

**Modified Function:** `_extract_topics_from_slide()` (Lines 1165-1260)

Now prioritizes multi-item detection:
```python
# Check for multi-item content FIRST
multi_items = self._extract_multi_item_entities(title, content, deck_outline)
if multi_items:
    logger.info(f"🎯 Multi-item slide detected! Found {len(multi_items)} items: {multi_items}")
    return list(multi_items)[:10]  # Allow up to 10 items
```

**Modified Function:** `_extract_comprehensive_topics()` (Lines 1262-1276)

Allows more topics (up to 10) for multi-item slides:
```python
if len(topics) >= 2:
    return topic_list[:max(max_topics, 10)]  # Allow more topics for multi-item slides
```

### 3. Dynamic Slide Generation (`html_inspired_generator.py`)

**Location:** Lines 297-371

Added multi-item detection in the dynamic prompt builder:

**Detection Logic:**
- Count list indicators (`\n-`, `\n•`, `\n*`)
- Count unique capitalized words
- Check for keyword triggers (planets, products, features, members, etc.)
- Check for specific examples (planet names)

**When Detected:**
Injects a special guidance section into the prompt with:
- Number of items and their names
- Layout recommendations based on item count
- Required metadata structure for each image
- Example metadata for first 2 items

**Benefits:**
- Model sees exactly which items to create sections for
- Gets specific layout guidance (3 items → horizontal sections, 4+ → grid)
- Receives concrete examples with actual item names from the slide

### 4. Frontend Image Picker (`slideImageUpdater.ts`)

**Modified Function:** `selectBestImage()` (Lines 233-304)

Enhanced image matching priority:

**New Priority 1: Component Metadata** (Lines 240-267)
```typescript
if (component.props.metadata) {
  // Try metadata.topic first (exact match)
  if (metadata.topic && images_by_topic?.[metadata.topic]) {
    return topicImages[0];
  }
  
  // Try metadata.searchQuery (fuzzy match)
  if (metadata.searchQuery) {
    // Match search terms against image topic/description
    return matchedImage;
  }
}
```

**Matching Strategy:**
1. **Exact topic match**: Check `metadata.topic` against `images_by_topic`
2. **Fuzzy search match**: Match `metadata.searchQuery` terms against image descriptions
3. **Legacy support**: Fall back to `props.topic`, `props.keywords`
4. **Slide-level topic**: Use primary slide topic
5. **Sequential fallback**: Use images in order

**Benefits:**
- Each Image component gets the right image for its specific item
- Multi-item slides have properly matched images per section
- Backwards compatible with existing image assignment

## How It Works End-to-End

### Example: "The Planets" Slide

**1. Outline Generation**
User creates presentation about "The Solar System Planets"

**2. Slide Content**
```
Title: The Inner Planets
Content:
- Mercury: Smallest planet, no atmosphere
- Venus: Hottest planet, thick clouds
- Earth: Only known life, 71% water
- Mars: Red planet, polar ice caps
```

**3. Multi-Item Detection (Backend)**

`_extract_multi_item_entities()` detects:
- List delimiters: 4 bullet points
- Capitalized names: Mercury, Venus, Earth, Mars
- Returns: `["Mercury planet", "Venus planet", "Earth planet", "Mars planet"]`

**4. Image Search (Backend)**

`search_images_for_deck_streaming()` searches for each:
- Topic 1: "Mercury planet" → 12 images
- Topic 2: "Venus planet" → 12 images
- Topic 3: "Earth planet" → 12 images
- Topic 4: "Mars planet" → 12 images

Result: `images_by_topic` with 4 separate image sets

**5. Slide Generation (Backend)**

Dynamic prompt includes:
```
🎯 MULTI-ITEM SLIDE DETECTED - BREAK APART INTO SECTIONS!

THIS SLIDE IS ABOUT 4 DISTINCT ITEMS: Mercury, Venus, Earth, Mars

Layout: Grid layout (2x2)

Each item needs:
- Title + Facts
- Individual Image with metadata: {"topic": "Mercury planet", "searchQuery": "Mercury planet"}
```

Model generates 4 sections in grid layout, each with:
```json
{
  "type": "Image",
  "props": {
    "src": "placeholder",
    "alt": "Mercury planet surface close-up",
    "metadata": {
      "topic": "Mercury planet",
      "searchQuery": "Mercury planet surface"
    },
    "position": {"x": 100, "y": 220},
    "width": 560,
    "height": 320
  }
}
```

**6. Image Matching (Frontend)**

`selectBestImage()` for each Image component:
1. Checks `metadata.topic = "Mercury planet"`
2. Looks up `images_by_topic["Mercury planet"]`
3. Returns first Mercury-specific image
4. Repeats for Venus, Earth, Mars components

**Result:**
- Mercury section: Mercury image
- Venus section: Venus image
- Earth section: Earth image
- Mars section: Mars image

## Key Features

### Smart Detection
- ✅ Handles bullets, numbers, commas
- ✅ Recognizes vs/and patterns
- ✅ Filters out vague terms
- ✅ Contextualizes with deck subject

### Flexible Layouts
- ✅ 2-3 items: Horizontal sections or vertical stack
- ✅ 4-6 items: Grid layout (2x2, 2x3, 3x2)
- ✅ Responsive spacing based on item count
- ✅ Consistent styling with theme colors

### Precise Image Matching
- ✅ Per-item topics extracted
- ✅ Individual image searches per item
- ✅ Metadata-based component matching
- ✅ Fallback to fuzzy matching
- ✅ Backwards compatible

### Comprehensive Guidance
- ✅ Clear layout examples in prompts
- ✅ Exact positioning coordinates
- ✅ Metadata structure requirements
- ✅ Do's and Don'ts checklist

## Testing

To test the multi-item slides feature:

1. **Create a presentation about planets:**
   - Title: "The Solar System"
   - Add slide: "The Planets"
   - Content should list multiple planets

2. **Expected behavior:**
   - Each planet gets its own section
   - Each planet has 2-4 facts
   - Each planet has its own image (Mercury image for Mercury, etc.)
   - Layout is grid or horizontal sections based on count

3. **Check logs for:**
   ```
   🎯 Multi-item slide detected! Found 8 items: [Mercury planet, Venus planet, ...]
   🎯 [MULTI-ITEM DETECTED] Slide 2 has 8 items: [Mercury, Venus, ...]
   ```

4. **Verify in UI:**
   - Open slide in editor
   - Check Image components have `metadata.topic` and `metadata.searchQuery`
   - Verify each image matches its item (not all the same image)

## Benefits

### For Users
- 🎯 Better visual storytelling with per-item images
- 🎨 Professional, organized multi-item layouts
- 📸 Relevant images for each specific item
- ⚡ Automatic detection and handling

### For Developers
- 🔧 Modular, reusable extraction logic
- 📊 Logging for debugging multi-item detection
- 🔄 Backwards compatible with existing slides
- 🧪 Easy to extend with new patterns

## Files Modified

1. **Backend - Prompts**
   - `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`
   - Added 340+ lines of multi-item layout guidance

2. **Backend - Image Service**
   - `apps/backend/services/combined_image_service.py`
   - Added `_extract_multi_item_entities()` function
   - Modified `_extract_topics_from_slide()` to prioritize multi-item
   - Modified `_extract_comprehensive_topics()` to allow more topics

3. **Backend - Generator**
   - `apps/backend/agents/generation/html_inspired_generator.py`
   - Added multi-item detection in dynamic prompt builder
   - Injects item-specific guidance when detected

4. **Frontend - Image Picker**
   - `apps/frontend/src/utils/slideImageUpdater.ts`
   - Enhanced `selectBestImage()` to prioritize metadata matching
   - Added logging for debugging image assignments

## Future Enhancements

Potential improvements:
- AI-powered item extraction for more complex content
- User customization of layout patterns
- Template library for common multi-item scenarios
- Automatic item ordering/prioritization
- Support for nested multi-item structures

## Summary

This comprehensive fix transforms how multi-item content is handled:

**Before:**
- All items grouped together
- 1 generic image for entire slide
- No individual styling per item

**After:**
- Each item in separate section
- Individual image per item with smart matching
- Beautiful layouts (grid, columns, stack)
- Automatic detection and handling
- Professional, scannable design

The system now delivers exactly what users expect: **each thing gets its own section, facts, and image**.

