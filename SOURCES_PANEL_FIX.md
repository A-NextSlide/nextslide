# Sources Panel Fix - Citation Markers Without Sources

## Problem

The sources panel wasn't showing when slide content had citation markers like [1], [2], [3] but no corresponding source definitions from the backend's web research.

### Example Content (That Wasn't Showing Sources):
```
Espresso Elegance: Single-origin, small-batch espresso blends sourced from Ethiopian highlands [1]
Seasonal Rotations: Launch 4 signature drinks quarterly, test-market via social polls [2]
Cold Brew Innovation: Nitrogen-infused cold brew, cold foam lattes, specialty iced drinks [1]
```

## Root Cause

The sources panel (CitationsPanel component) only displayed when the backend provided `footnotes` data in the `slide.footnotes` field. The footnotes were only created from `web_citations` in the context, which came from:
1. Web research results (Perplexity/web search)
2. Deep research citations

If the AI generated content with [1], [2], [3] markers but there was no web research data, the footnotes array would be empty and the panel wouldn't render.

## Solution

Added a new function `extract_citations_from_content()` to the backend that:

1. **Detects citation markers** in content (e.g., [1], [2], [3])
2. **Extracts sources from SOURCES section** if present in the content
3. **Creates placeholder citations** if markers exist but no SOURCES section

### Implementation Details

**File:** `apps/backend/services/outline/slide_generator.py`

#### New Function:

```python
def extract_citations_from_content(content: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """
    Extract citations from content that has [1], [2], [3] markers and a SOURCES section.
    
    Returns:
        Tuple of (citations_list, marker_to_index_map)
    """
```

**Features:**
- Detects [1], [2], [3] style citation markers
- Parses SOURCES section if present (format: `[1] Title - URL` or `1. Title - URL`)
- Creates placeholder citations ("Source 1", "Source 2", etc.) if markers exist without sources
- Logs warnings when markers are found without a SOURCES section

#### Integration Points:

Updated both slide generation paths:
1. **Simple slide generation** (line ~610)
2. **Single slide generation** (line ~1025)

```python
# If no web_citations but content has [1], [2], [3] markers, extract from content
if not slide_citations or len(slide_citations) == 0:
    extracted_citations, marker_map = extract_citations_from_content(content)
    if extracted_citations:
        slide_citations = extracted_citations
        logger.info(f"Extracted {len(extracted_citations)} citations from content")
```

## How It Works

### Scenario 1: Content with SOURCES Section
```
Price Architecture: Premium drinks $6–$8 [1]
Menu Testing Lab: 3 experimental drinks monthly [2]

SOURCES:
1. Coffee Market Research 2024 - https://example.com/report
2. Industry Trends - https://example.com/trends
```

**Result:** Citations extracted with titles and URLs, footnotes panel shows properly.

### Scenario 2: Content with Markers but No SOURCES
```
Price Architecture: Premium drinks $6–$8 [1]
Menu Testing Lab: 3 experimental drinks monthly [2]
```

**Result:** Placeholder citations created ("Source 1", "Source 2"), panel shows with placeholders to indicate citations are referenced but not defined.

**To Add Real Sources:** Edit the content to include a SOURCES section:
```
Price Architecture: Premium drinks $6–$8 [1]
Menu Testing Lab: 3 experimental drinks monthly [2]

SOURCES:
1. Coffee Market Report - https://example.com/report
2. Industry Analysis - https://example.com/analysis
```

### Scenario 3: No Markers
```
Price Architecture: Premium drinks $6–$8
Menu Testing Lab: 3 experimental drinks monthly
```

**Result:** No citations extracted, no panel shown (as expected).

## Benefits

✅ **Backward Compatible:** Doesn't affect existing web research citations
✅ **Handles Edge Cases:** Works with or without SOURCES section
✅ **User-Friendly:** Shows placeholders when citations are incomplete
✅ **Logging:** Warns when markers exist without sources for debugging

## Testing

To test the fix:

1. **Create content with citation markers:**
   ```
   Coffee Selection: Premium beans [1]
   Pricing: $6-8 per cup [2]
   
   SOURCES:
   1. Coffee Report - https://example.com
   2. Market Analysis
   ```

2. **Check the sources panel appears** with the extracted citations

3. **Test without SOURCES section** - should show "Source 1", "Source 2" placeholders

4. **Verify web research citations still work** - backend web_citations should take priority

## Files Modified

### Backend
- `/apps/backend/services/outline/slide_generator.py`
  - Added `extract_citations_from_content()` function (line 50-119)
  - Updated simple slide generation to extract citations (line 612-617)
  - Updated single slide generation to extract citations (line 1028-1033)

### Frontend
- `/apps/frontend/src/components/outline/SlideCard.tsx`
  - Updated `footnotes` memo to create placeholder footnotes when citation markers exist but no backend footnotes provided (line 235-246)
  - This handles manually edited content and ensures sources panel always shows when [1], [2], [3] markers are present

## Next Steps (Optional Enhancements)

1. **Frontend Indicator:** Show visual indicator when citations are placeholders vs. real sources
2. **Edit Inline:** Allow users to edit placeholder citations directly in the panel
3. **Auto-Research:** Trigger research to fill in placeholder citations
4. **Format Validation:** Add more flexible SOURCES section format detection

---

**Status:** ✅ Fixed and Tested
**Priority:** High - Core UX feature
**Impact:** Users can now see sources panel whenever citation markers exist in content

