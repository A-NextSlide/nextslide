# Chart Types Reference

## Overview

The system now informs the model about **ALL 17+ available chart types** with specific use cases and data schemas.

## ⚠️ CRITICAL: When to Use Charts vs Custom Components

### ✅ USE CHARTS ONLY FOR:
- **Numerical/statistical data** from search results (Perplexity)
- **Quantitative comparisons** that need axis visualization (revenue trends, market share percentages)
- **Time series with numbers** (quarterly sales, stock prices over time)
- **Percentage distributions** that total 100%
- **Real data points** from research, not placeholder/example data

### ❌ NEVER USE CHARTS FOR:
- **Org charts** (people hierarchy) → Use `CustomComponent` with `decision_tree` or card layout
- **Timelines** (events/milestones) → Use `CustomComponent` with `interactive_timeline`
- **Process flows** (steps/stages) → Use `CustomComponent` with `decision_tree`
- **Before/after text comparisons** → Use `CustomComponent` with `comparison_bars`
- **Lists of roles/people/names** → Use `CustomComponent` with card grids
- **Non-numerical hierarchies** → `CustomComponent`, NOT treemap/sunburst charts

### 🎯 Rule of Thumb:
**If it's not NUMBERS on axes, it's NOT a chart - use CustomComponent instead!**

---

## Available Chart Types

### Common Charts (Use 90% of the time)

#### 1. **Column / Bar**
- **Use for**: Category comparisons (no time element)
- **Examples**: Sales by region, product comparison, feature comparison
- **Data format**:
```json
{
  "chartType": "column",
  "title": "Sales by Region",
  "data": [
    {"name": "North", "value": 450},
    {"name": "South", "value": 380},
    {"name": "East", "value": 520}
  ]
}
```

#### 2. **Line**
- **Use for**: Time-based trends, continuous progression
- **Examples**: Revenue over quarters, user growth, stock prices
- **Data format**:
```json
{
  "chartType": "line",
  "title": "Revenue Growth",
  "data": [
    {"name": "Q1", "value": 450},
    {"name": "Q2", "value": 480},
    {"name": "Q3", "value": 520}
  ]
}
```

#### 3. **Pie / Donut**
- **Use for**: Parts-of-whole, percentages, distribution
- **Examples**: Market share, budget allocation, user demographics
- **Data format**:
```json
{
  "chartType": "pie",
  "title": "Market Share",
  "data": [
    {"name": "Company A", "value": 35},
    {"name": "Company B", "value": 28},
    {"name": "Company C", "value": 22},
    {"name": "Others", "value": 15}
  ]
}
```

#### 4. **Area**
- **Use for**: Cumulative trends over time, stacked data
- **Examples**: Product lines growth, revenue streams over time
- **Data format**:
```json
{
  "chartType": "area",
  "title": "Product Growth",
  "data": [
    {"name": "Q1", "value": 100, "series": "Product A"},
    {"name": "Q1", "value": 80, "series": "Product B"},
    {"name": "Q2", "value": 120, "series": "Product A"},
    {"name": "Q2", "value": 95, "series": "Product B"}
  ]
}
```

---

### Advanced Charts (Use strategically for variety)

#### 5. **Waterfall**
- **Use for**: Sequential changes, step-by-step progression
- **Examples**: Revenue bridge, cost breakdown, P&L walkthrough
- **Data format**:
```json
{
  "chartType": "waterfall",
  "title": "Revenue Bridge Q1 to Q2",
  "data": [
    {"name": "Q1 Revenue", "value": 1000},
    {"name": "New Sales", "value": 250},
    {"name": "Churn", "value": -150},
    {"name": "Expansion", "value": 100},
    {"name": "Q2 Revenue", "value": 1200}
  ]
}
```

#### 6. **Radar**
- **Use for**: Multi-dimensional comparison
- **Examples**: Competitor analysis, skill assessment, product features
- **Data format**:
```json
{
  "chartType": "radar",
  "title": "Product Comparison",
  "data": [
    {"name": "Features", "value": 85, "series": "Our Product"},
    {"name": "Price", "value": 70, "series": "Our Product"},
    {"name": "Support", "value": 90, "series": "Our Product"},
    {"name": "Features", "value": 75, "series": "Competitor"},
    {"name": "Price", "value": 85, "series": "Competitor"},
    {"name": "Support", "value": 65, "series": "Competitor"}
  ]
}
```

#### 7. **Scatter / Bubble**
- **Use for**: Correlation between variables, x-y relationships
- **Examples**: Price vs quality, risk vs return, size vs complexity
- **Data format**:
```json
{
  "chartType": "scatter",
  "title": "Price vs Quality Analysis",
  "data": [
    {"x": "Product A", "y": 85},
    {"x": "Product B", "y": 72},
    {"x": "Product C", "y": 91},
    {"x": "Product D", "y": 68}
  ]
}
```

#### 8. **Gauge**
- **Use for**: Single metric display, progress indicator
- **Examples**: Completion rate, KPI status, target achievement
- **Data format**:
```json
{
  "chartType": "gauge",
  "title": "Target Achievement",
  "data": [
    {"name": "Progress", "value": 87}
  ]
}
```

#### 9. **Treemap**
- **Use for**: Hierarchical data as nested rectangles
- **Examples**: Budget breakdown, portfolio allocation, file sizes
- **Data format**:
```json
{
  "chartType": "treemap",
  "title": "Budget Allocation",
  "data": [
    {"name": "Marketing", "value": 500, "series": "Sales"},
    {"name": "Events", "value": 200, "series": "Sales"},
    {"name": "R&D", "value": 800, "series": "Product"},
    {"name": "Engineering", "value": 600, "series": "Product"}
  ]
}
```

#### 10. **Sankey**
- **Use for**: Flow between categories, process visualization
- **Examples**: User journey, revenue streams, conversion funnel
- **Data format**:
```json
{
  "chartType": "sankey",
  "title": "User Conversion Flow",
  "data": [
    {"from": "Visitors", "to": "Sign ups", "value": 1000},
    {"from": "Sign ups", "to": "Active", "value": 600},
    {"from": "Sign ups", "to": "Inactive", "value": 400},
    {"from": "Active", "to": "Paying", "value": 350}
  ]
}
```

#### 11. **Sunburst**
- **Use for**: Multi-level hierarchy, radial visualization
- **Examples**: Org structure, taxonomy, nested categories
- **Data format**:
```json
{
  "chartType": "sunburst",
  "title": "Organization Structure",
  "data": [
    {"name": "Sales", "value": 45, "series": "Company"},
    {"name": "Product", "value": 55, "series": "Company"},
    {"name": "Enterprise", "value": 30, "series": "Sales"},
    {"name": "SMB", "value": 15, "series": "Sales"}
  ]
}
```

#### 12. **Boxplot**
- **Use for**: Statistical distribution, quartiles
- **Examples**: Salary ranges, performance variation, test scores
- **Data format**:
```json
{
  "chartType": "boxplot",
  "title": "Salary Distribution",
  "data": [
    {"name": "Engineering", "value": 85000},
    {"name": "Sales", "value": 72000},
    {"name": "Marketing", "value": 68000}
  ]
}
```

#### 13. **Histogram**
- **Use for**: Frequency distribution
- **Examples**: Age groups, response times, score distribution
- **Data format**:
```json
{
  "chartType": "histogram",
  "title": "Age Distribution",
  "data": [
    {"name": "18-25", "value": 150},
    {"name": "26-35", "value": 320},
    {"name": "36-45", "value": 280},
    {"name": "46-55", "value": 180},
    {"name": "56+", "value": 90}
  ]
}
```

---

## Chart Selection Guide

### For CATEGORY COMPARISONS (static, no time):
✅ **Use**: column, bar, treemap (hierarchical)  
❌ **Don't use**: line, area (these are for trends over time)

### For TIME-BASED TRENDS (progression):
✅ **Use**: line, area, spline  
❌ **Don't use**: column/bar for time (unless comparing specific periods)

### For PARTS OF WHOLE (percentages):
✅ **Use**: pie, donut, treemap, sunburst

### For RELATIONSHIPS & FLOW:
✅ **Use**: sankey (flows), scatter/bubble (correlation), radar (multi-dimensional)

### For STATISTICAL DATA:
✅ **Use**: boxplot (distribution), histogram (frequency), waterfall (sequential changes)

### For SINGLE METRICS:
✅ **Use**: gauge (progress/status)

---

## Multi-Series Charts

Use the `series` field to compare multiple datasets:

```json
{
  "chartType": "column",
  "title": "Revenue vs Cost by Quarter",
  "data": [
    {"name": "Q1", "value": 450, "series": "Revenue"},
    {"name": "Q1", "value": 320, "series": "Cost"},
    {"name": "Q2", "value": 480, "series": "Revenue"},
    {"name": "Q2", "value": 340, "series": "Cost"},
    {"name": "Q3", "value": 520, "series": "Revenue"},
    {"name": "Q3", "value": 380, "series": "Cost"}
  ]
}
```

**When to use multi-series**:
- Comparing metrics (Revenue vs Cost, Actual vs Budget)
- Comparing segments (Product A vs Product B vs Product C)
- Comparing time periods (This Year vs Last Year)

---

## Chart vs Stat Slide Decision

| Scenario | Use Chart | Use Stat Slide |
|----------|-----------|----------------|
| ONE big number | ❌ | ✅ |
| 2-3 numbers | Maybe | ✅ |
| 5+ related numbers | ✅ | ❌ |
| Trend over time | ✅ | ❌ |
| Comparison across categories | ✅ | ❌ |
| Parts of a whole | ✅ | ❌ |

**Examples**:
- "87% satisfaction" → **STAT SLIDE** (full-slide giant "87%")
- Satisfaction by 5 products → **BAR CHART**
- Revenue over 4 quarters → **LINE CHART**
- "$2.5B market" → **STAT SLIDE** (giant "$2.5B")

---

## Variety Strategy

### ❌ Bad (Repetitive):
- Slide 3: Column chart
- Slide 5: Column chart
- Slide 7: Column chart

### ✅ Good (Varied):
- Slide 3: Column chart (category comparison)
- Slide 5: Line chart (trend over time)
- Slide 7: Stat slide (one big number)
- Slide 9: Pie chart (market share)
- Slide 11: Waterfall (revenue bridge)

---

## Summary

✅ **Model now knows about**:
- 17+ chart types (not just 6)
- Specific use cases for each
- Data schemas for each type
- When to use vs when to use stat slide
- How to create multi-series charts
- Importance of variety

✅ **Result**: 
- More engaging presentations
- Better chart selection
- Proper data representation
- Strategic variety

