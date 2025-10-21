# Image Usage & Topic Grouping Refinement

## Problem Identified
The prompt was too prescriptive about using images on multi-item slides, leading to:
- Every slide following a repetitive "bucketed pattern" with individual images per item
- Overuse of images (exceeding the strategic 30-40% guideline)
- Topics being unnecessarily split across slides just to add images
- Cluttered designs with too many small images instead of clean typography

## Changes Made to `html_inspired_system_prompt_v2.py`

### 1. **Refined MULTI-ITEM SLIDES Section** (Lines 436-451)

**Before:**
```
🎯 **MULTI-ITEM SLIDES:** When listing items (planets, products, people):
- Each item gets: Title + Facts + Image with metadata: {"topic": "Item name", "searchQuery": "Item name"}
- Layout: Horizontal sections or grid based on count
- Example: 3 planets → 3 sections side-by-side, each with its own image
```

**After:**
```
🎯 **MULTI-ITEM SLIDES:** When listing items (planets, products, people):
- **DEFAULT (Most slides):** Present items as clean text groups/cards WITHOUT individual images
  * Use typography hierarchy, spacing, and ReactBits components for visual interest
  * Layout: Horizontal sections or grid based on count (2-3 columns, 1-2 rows max)
  * Focus on content clarity with bold headers, bullet points, and color accents
  
- **WITH IMAGES (Only when visual differentiation adds real value):**
  * Use selectively: When items are visually distinct and images aid understanding
  * Examples: Comparing product designs, showing different animal species, geographic locations
  * Each item CAN get: Title + Facts + Image with metadata: {"topic": "Item name", "searchQuery": "Item name"}
  * DON'T use per-item images for: Abstract concepts, similar items, text-heavy comparisons
  
- **SINGLE HERO IMAGE (Alternative):** Instead of multiple images, use ONE powerful image:
  * Place 1 impactful split-screen image that represents the overall topic
  * Items presented as clean text sections on the opposite side
  * Better design than cluttered multi-image layouts
```

### 2. **Added GROUPING vs. SPLITTING ITEMS Section** (Lines 453-467)

New guidance on when to keep items together vs. split across slides:

```
📋 **GROUPING vs. SPLITTING ITEMS ACROSS SLIDES:**

**KEEP TOGETHER ON ONE SLIDE (Default - 80% of cases):**
✅ When items are closely related and meant to be compared (Benefits 1-3, Features A-D)
✅ When each item is concise (1-3 bullet points per item)
✅ When showing an overview or summary (Top 5 Products, Key Metrics, Team Members)
✅ When the relationship between items is the main point
→ Design as: Grid layout (2-3 columns), horizontal sections, or card groups

**SPLIT ACROSS SLIDES (Only when necessary - 20% of cases):**
✅ When each item needs deep explanation (3+ paragraphs or complex data per item)
✅ When items represent distinct phases/chapters (Step 1 detailed → Step 2 detailed)
✅ When each item has its own chart, diagram, or substantial visual component
✅ When the presentation narrative requires building up one item at a time
→ This creates focus but use sparingly - don't artificially inflate slide count!
```

## Expected Improvements

### Image Usage
- **Before:** 60-80% of slides with images (often multiple per slide)
- **After:** 30-40% of slides with strategic, purposeful images

### Multi-Item Slides
- **Before:** 
  - List of 3 planets → 3 separate sections, each with individual planet image
  - List of 5 benefits → 5 cards, each trying to find a unique image
  
- **After:**
  - List of 3 planets → Clean grid of 3 text sections OR single space image with 3 text sections
  - List of 5 benefits → 5 cards with typography hierarchy, bold colors, ReactBits animations (no images)
  - Only add per-item images when items are visually distinct (e.g., comparing actual product designs)

### Topic Grouping
- **Before:** Tendency to split items across slides unnecessarily
- **After:** Default to keeping related items together (80%), only split when items need deep individual focus

## Design Philosophy

The refined approach emphasizes:
1. **Clean typography** and **spacing** over decorative images
2. **Strategic image use** - only when images add real value
3. **Unified layouts** for related items (comparison, not separation)
4. **Quality over quantity** - one powerful image beats three mediocre ones
5. **Content focus** - let the message drive design decisions, not the other way around

## Alignment with Overall Guidelines

These changes strengthen alignment with existing guidance:
- "IMAGES - STRATEGIC DESIGN ELEMENTS (USE WITH PURPOSE!)" (Line 514)
- "WHEN TO USE IMAGES (Strategic - 30-40% of slides)" (Line 552-558)
- "WHEN NOT TO USE IMAGES" (Line 560-565)
- Split-screen as PRIMARY layout (80%) for cleaner, more modern designs

## Testing Recommendations

Test with presentations containing:
1. Lists of similar items (benefits, features, steps)
2. Lists of visually distinct items (products, animals, locations)
3. Abstract concepts (strategies, principles, values)
4. Technical topics (processes, methodologies, frameworks)

Expected behavior:
- Most lists presented as clean text/card grids without images
- Images used only when they genuinely enhance understanding
- Fewer, better-designed slides with stronger visual hierarchy

