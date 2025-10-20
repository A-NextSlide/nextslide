# Component Schema Optimization Summary

## Overview
Optimized the component schemas passed to the AI model to:
1. **Encourage CustomComponent usage** for complex UI patterns
2. **Promote Icon usage** for semantic meaning (but sparingly - 0-2 per slide)
3. **Reduce token usage** by removing verbose component schemas
4. **Simplify AI decision-making** with clear templates and patterns

## Changes Made

### 1. Created New Optimized Schema System
**File:** `apps/backend/agents/prompts/generation/optimized_component_schemas.py`

**Key Changes:**
- **Core Components** (Background, TiptapTextBlock, Image, Lines) - Full schemas with all props
- **Accent Components** (Icon, Shape) - Minimal guidance, discouraged decorative use
- **CustomComponent** - HEAVILY emphasized with multiple templates
- **Discouraged Components** (Chart, Table) - Suggest CustomComponent alternatives

**Philosophy:**
```
BEFORE: "Here are 10+ components with all their props"
AFTER: "Here are 4 core components. For everything else, use CustomComponent!"
```

### 2. Updated System Prompt Integration
**File:** `apps/backend/agents/prompts/generation/html_inspired_system_prompt_v2.py`

Modified `get_condensed_component_schemas()` to use the new optimized schemas.

### 3. Added More CustomComponent Templates
**File:** `apps/backend/services/elite_components.py`

Added 5 new reusable templates:
- **StatDashboard** - Multi-card metrics grid
- **SimpleStatCard** - Single large metric
- **IconText** - Icon paired with text
- **FeatureCard** - Feature showcase with icon
- **ProgressBar** - Horizontal progress indicator

## Benefits

### Before (Old Approach)
```json
// AI had to decide between:
// - Shape + TiptapTextBlock + Icon
// - Chart component
// - Table component
// - CustomComponent
// = 15+ component schemas to learn, 100+ props to remember
```

### After (Optimized Approach)
```json
// AI focuses on:
// - Background (for slides)
// - TiptapTextBlock (for text)
// - Image (for visuals)
// - CustomComponent (for EVERYTHING else)
// = 4 core components + CustomComponent templates
```

## Icon Usage Guidelines

Icons are now clearly defined as **semantic enhancers**, not decorations:

✅ **GOOD Icon Use:**
- Dashboard metric indicators (1-2 per slide MAX)
- Critical data points with semantic meaning
- Example: Dollar sign icon next to "$2.5M Revenue"

❌ **BAD Icon Use:**
- Bullet points (just use text!)
- Section headers (text is enough)
- Decorative backgrounds
- Every text element

**Available Icons:** 5000+ from Lucide library
**Naming Convention:** Kebab-case (e.g., "dollar-sign", "trending-up", "users")

## CustomComponent Templates

### When to Use CustomComponent
Ask: "Is this more than just text or an image?"
- YES → Use CustomComponent
- NO → Use TiptapTextBlock or Image

### Common Patterns Provided

1. **Stat Card** - Single metric with large number
2. **Multi-Card Dashboard** - Grid of metrics
3. **Icon + Text** - Semantic icon with description
4. **Feature Card** - Icon, title, description layout
5. **Progress Bar** - Visual progress indicator

### Example: Stat Dashboard
```javascript
// Instead of: 3 Shapes + 3 TiptapTextBlocks + 3 Icons
// Use: 1 CustomComponent
{
  "type": "CustomComponent",
  "props": {
    "position": {"x": 120, "y": 220},
    "width": 1680,
    "height": 600,
    "items": [
      {"label": "Revenue", "value": "$2.5M"},
      {"label": "Users", "value": "45K"},
      {"label": "Growth", "value": "+24%"}
    ],
    "primaryColor": "{{accent}}",
    "render": "..." // Template provided in prompt
  }
}
```

## Token Savings

**Estimated Savings:**
- Old schema size: ~5,000 chars (~1,250 tokens)
- New schema size: ~3,000 chars (~750 tokens)
- **Savings: ~500 tokens per slide** (~40% reduction)

**Quality Improvements:**
- Clearer decision-making (fewer component options)
- Better design consistency (CustomComponent templates)
- More semantic Icon usage (explicit guidelines)
- Reduced JSON output size (fewer component types used)

## Migration Notes

### For Developers
No migration needed! The changes are backward compatible:
- Existing slides continue to work
- New slides use optimized schemas
- CustomComponent renderer unchanged

### For AI Model
The model now receives:
1. Condensed core component schemas
2. CustomComponent templates (copy-paste ready)
3. Clear "use this, not that" guidance
4. Semantic Icon selection rules

## Testing Recommendations

Test scenarios to verify improvements:
1. **Stat slide** - Should use CustomComponent, not Chart
2. **Dashboard slide** - Should use CustomComponent grid, not multiple Shapes
3. **Icon usage** - Should be 0-2 icons max, not decorative
4. **Text-heavy slide** - Should use TiptapTextBlock, minimal components

## Future Enhancements

Potential optimizations:
1. Add more CustomComponent templates (timeline, comparison, pricing)
2. Create template "families" (e.g., "card family" with variants)
3. Add template auto-selection based on slide content
4. Generate CustomComponent code from natural language descriptions

---

**Summary:** We've shifted from "here's everything you can use" to "here's what you SHOULD use." This reduces complexity, improves quality, and saves tokens.

