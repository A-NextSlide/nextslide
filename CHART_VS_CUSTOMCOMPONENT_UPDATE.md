# Chart vs CustomComponent Intelligence Update (v2 - Capability-Based)

## Problem
1. System was generating bar charts for org chart requests
2. Prompts were too prescriptive with hard-coded rules
3. Limited chart variety - mostly just bar/line charts
4. AI wasn't making intelligent decisions about component choice

## Solution  
**Removed hard-coded rules** and instead gave the AI the **capabilities** of each component type, letting it decide based on content. Also encouraged chart type variety.

## Changes Made

### 1. **slide_generator.py** (Lines 465-504)
**Replaced prescriptive rules with capability descriptions:**

Before: ❌ "DO NOT USE CHARTS FOR: Org charts → Use CustomComponent..."  
After: ✅ Describes what each component CAN do, lets AI decide

```
📊 COMPONENT CAPABILITIES - Choose based on what you need to communicate:

CHARTS (Chart component):
- Strength: Visualizing numerical data on axes for comparison and pattern recognition
- Requires: Quantitative values in consistent units
- Best for: Statistical data from research, metrics, time series, distributions
- Limitation: Cannot effectively show text hierarchies, non-numerical relationships

CUSTOM COMPONENTS (CustomComponent):
- Strength: Structured layouts, hierarchies, interactions, qualitative relationships
- Can create: Org trees, timelines, comparison cards, interactive elements, decision flows
- Best for: People/roles, event sequences, before/after, processes, engagement
- Limitation: Not ideal for quantitative data that benefits from axis-based comparison

YOUR TASK: Look at the content. Does it need axis-based numerical comparison? Use Chart. 
Does it need structured layout or qualitative relationships? Use CustomComponent.
```

**Added chart variety encouragement:**
- "Don't default to bar/line! Match chart type to data structure"
- Includes full chart type descriptions
- "Use variety across slides!"

### 2. **models.py** (Lines 124-167) - StructuredSlideOutput schema
**Removed prescriptive examples, added capability-focused guidance:**

Before: ❌ Listed specific scenarios (org chart → treemap)  
After: ✅ Describes when to provide chartData based on content type

```python
chartData: Optional[List[Dict[str, Any]]] = Field(
    description="""OPTIONAL: Provide ONLY when you have numerical data that benefits from axis-based comparison.

WHEN TO PROVIDE chartData:
✅ You have quantitative data from research/search results
✅ Values are in consistent units
✅ Data shows patterns better visualized on axes than as text

WHEN TO OMIT chartData:
❌ Content is about people/roles/hierarchies (use text/CustomComponent instead)
❌ Content is event timeline/roadmap (use text/CustomComponent instead)
❌ Less than 5 data points
❌ Mixed units that can't be dual-axis
```

**chartType field now encourages variety:**
```python
chartType: Optional[str] = Field(
    description="""Chart type to match your data pattern. Available types:
    
COMMON TYPES (use most often):
- "bar" or "column": Numerical comparisons across categories
- "line" or "area": Numerical trends over time  
- "pie": Percentage distribution totaling ~100%

SPECIALIZED TYPES (use for variety and specific patterns):
- "waterfall", "sankey", "radar", "treemap", "sunburst", "scatter", "bubble"

Choose the type that best reveals the pattern. Use variety across presentation!"""
)
```

### 3. **chart_generator.py** (Lines 60-84, 146-201)
**Updated chart descriptions to emphasize numerical data:**
- All descriptions now include "numerical" qualifier
- Examples focus on numerical use cases (market cap, file sizes, budget breakdowns)
- Removed misleading "org chart" reference

**Simplified fallback logic (Lines 146-201):**
- Reduced from 100+ lines to ~50 lines
- Now trusts AI's choice, only provides simple fallback
- Encourages variety when fallback is used

### 4. **critical_rules.json** (Lines 926-941)
**Replaced prescriptive rules with capability descriptions:**

Before: ❌ Long list of "DO THIS, DON'T DO THAT"  
After: ✅ Brief capability summary

```json
"chart_enforcement": [
  "📊 CHART COMPONENT CAPABILITIES:",
  "- Strength: Axis-based numerical comparison and pattern visualization",
  "- Variety: Don't default to bar/line - use pie, waterfall, radar based on data pattern",
  
  "🎨 CUSTOM COMPONENT CAPABILITIES:",
  "- Strength: Structured layouts, hierarchies, interactions",
  "- Can create: Org structures, timelines, comparison cards, decision flows",
  
  "Let content guide your choice. Numbers on axes? Chart. Structure/relationships? CustomComponent."
]
```

### 5. **components.json** (Lines 345-354)
**Replaced specific use-case list with capability overview:**

Before: ❌ Prescriptive "timelines → interactive_timeline, org_charts → decision_tree"  
After: ✅ Capability-based description

```json
"capabilities": {
  "structured_layouts": "Create cards, grids when content doesn't need axis visualization",
  "hierarchies_and_flows": "Build org structures, decision trees, process flows",
  "time_and_events": "Show event sequences, roadmaps, milestones",
  "metrics_display": "Present numbers with cards and progress rings",
  ...
}
```

## Key Philosophy Change

**Before:** Prescriptive rules telling AI what to do  
**After:** Capability descriptions letting AI decide

This makes the system more intelligent and adaptable. The AI understands **what each tool can do** and chooses based on the content, rather than following hard-coded rules.

## Impact

The AI now:
1. ✅ **Understands component capabilities** - knows what each tool is good/bad at
2. ✅ **Makes intelligent decisions** - chooses based on content needs, not rules
3. ✅ **Uses chart variety** - encouraged to use pie, waterfall, radar, scatter, not just bar/line
4. ✅ **Handles edge cases better** - can reason about when charts don't make sense
5. ✅ **Generates appropriate components** for org charts (CustomComponent with structure) vs market data (Chart with axes)

## Chart Variety Improvements

- **Removed hard defaults** to bar/line in fallback logic
- **Added variety encouragement** in prompts: "Use variety across slides!"
- **Listed all chart types** with clear descriptions: bar, column, line, area, pie, waterfall, sankey, radar, treemap, sunburst, scatter, bubble
- **Simplified fallback logic** (100+ lines → 50 lines) to trust AI more

## Testing Recommendations

Test these scenarios to verify intelligent decision-making:
1. **"Show org chart"** → CustomComponent with decision_tree or cards (not bar chart)
2. **"Timeline of milestones"** → CustomComponent with interactive_timeline (not line chart)
3. **"Market share breakdown"** → Pie chart (numerical %, totals 100%)
4. **"Revenue growth over quarters"** → Line/area chart (numerical time series)
5. **"Compare features"** → Varied charts (radar, column, bar) based on data structure
6. **Multiple data slides** → Should see variety (not all bar/line)

## No Breaking Changes

All changes are **prompt and schema-level only**:
- No code logic changes
- No API changes
- No breaking changes to existing functionality
- AI makes smarter choices with same infrastructure

