"""Data models for outline generation"""

import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator


class OutlineOptions(BaseModel):
    """Options for outline generation"""
    prompt: str
    detail_level: str = "standard"  # quick, standard, detailed
    enable_research: bool = True  # Will be auto-set based on detail_level
    style_context: Optional[str] = None
    font_preference: Optional[str] = None
    color_scheme: Optional[Any] = None
    files: List[Dict[str, Any]] = Field(default_factory=list)
    # Global override for both planning and content (legacy behavior)
    model: Optional[str] = None
    # Fine-grained overrides per phase (take precedence over `model` when provided)
    planning_model: Optional[str] = None
    content_model: Optional[str] = None
    research_model: Optional[str] = None
    slide_count: Optional[int] = Field(None, description="Specific number of slides requested (1-20)")
    # New: visual density preference to support information-dense decks
    visual_density: Optional[str] = Field(None, description="Visual density preference: minimal | moderate | rich | dense")
    # Image auto-application control
    async_images: bool = Field(False, description="If True, images are placeholders; if False, images are auto-applied")

    @validator('slide_count')
    def validate_slide_count(cls, v):
        if v is not None:
            if v < 1:
                return 1
            elif v > 50:
                # Increased max to 50 to support comprehensive tutorials and complex topics
                # Most presentations stay under 20, but some educational/technical content needs more
                return 50
        return v

    @validator('enable_research', always=True)
    def auto_set_research_based_on_detail_level(cls, v, values):
        """Auto-enable research for detailed mode, disable for presentation modes"""
        detail_level = values.get('detail_level', 'standard')
        # Detailed mode = research enabled (comprehensive analysis)
        # Presentation modes (standard/quick) = research disabled (hero content focus)
        if detail_level == 'detailed':
            return True
        else:
            return False


class ChartData(BaseModel):
    """Data for charts and visualizations"""
    chart_type: str
    data: List[Dict[str, Any]]
    title: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None


class SlideContent(BaseModel):
    """Slide content structure"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    slide_type: str = "content"  # Type of slide: title, transition, content, or conclusion
    # Internal-only chart data; excluded from API serialization.
    chart_data: Optional[ChartData] = Field(default=None, exclude=True)
    research_notes: Optional[str] = None
    images: List[Dict[str, Any]] = Field(default_factory=list)  # Images assigned to this slide
    # Additional fields for frontend compatibility
    deepResearch: bool = False
    extractedData: Optional[Dict[str, Any]] = None  # For charts in frontend format (single chart - legacy)
    # ✅ Support for multiple charts per slide
    manualCharts: Optional[List[Dict[str, Any]]] = Field(None, description="Array of charts for this slide")
    taggedMedia: List[Dict[str, Any]] = Field(default_factory=list)  # Media files tagged to this slide
    citations: List[Dict[str, Any]] = Field(default_factory=list)  # Citations from research/Perplexity
    footnotes: List[Dict[str, Any]] = Field(default_factory=list)  # Numbered footnotes for citation panel
    # New: optional footer spec for rendering citations at the bottom in small text
    citationsFooter: Optional[Dict[str, Any]] = None  # { showThinDivider: bool, sources: [{index: int, title: string, url: string}] }
    # New: structured two-column comparison content (for side-by-side layout)
    comparison: Optional[Dict[str, Any]] = None  # { layout?: string, leftLabel?: string, rightLabel?: string, leftBullets: string[], rightBullets: string[] }
    # AI-suggested image prompt extracted from [IMAGE: ...] tags in outline
    suggestedImagePrompt: Optional[str] = None


class OutlineResult(BaseModel):
    """Outline result structure"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    slides: List[SlideContent]
    metadata: Dict[str, Any] = Field(default_factory=dict)
    generation_time: float = 0


class ProgressUpdate(BaseModel):
    """Progress update for streaming"""
    stage: str
    message: str
    progress: float
    timestamp: datetime = Field(default_factory=datetime.now)
    metadata: Optional[Dict[str, Any]] = None


class ChartDataPoint(BaseModel):
    """Individual chart data point - flexible for all chart types"""
    # For bar/pie charts
    name: str = Field(default="", description="Name for bar/pie charts")
    value: float = Field(default=0.0, description="Value for bar/pie charts")
    
    # For line/scatter charts  
    x: str = Field(default="", description="X-axis value (e.g., year as string)")
    y: float = Field(default=0.0, description="Y-axis numeric value")
    
    # For multi-series support (IMPORTANT: Add series/group/dataset to enable multi-series charts)
    series: Optional[str] = Field(default=None, description="Series name for multi-series charts (e.g., 'Revenue', 'Cost', 'Actual', 'Budget')")
    group: Optional[str] = Field(default=None, description="Alternative grouping field for multi-series")
    dataset: Optional[str] = Field(default=None, description="Alternative dataset field for multi-series")
    
    # For complex nested data (legacy support)
    id: str = Field(default="", description="Unique identifier")


class StructuredSlideOutput(BaseModel):
    """Structured output from Perplexity with clean chart data"""
    content: str = Field(description="Clean bullet points only, no metadata headers")
    chartData: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="""OPTIONAL: Provide ONLY when you have numerical data that benefits from axis-based comparison.

WHEN TO PROVIDE chartData:
✅ You have quantitative data from research/search results
✅ Values are in consistent units (all $, all %, all counts)
✅ Data shows patterns better visualized on axes than as text
✅ The deck is data-driven/analytical/scientific or explicitly requests charts

WHEN TO OMIT chartData:
❌ Content is about people/roles/hierarchies (use text/CustomComponent instead)
❌ Content is event timeline/roadmap (use text/CustomComponent instead)
❌ Data is too sparse to show a clear pattern
❌ Mixed units that can't be dual-axis

FORMAT: [{"name": "Category", "value": 123.45}, ...]
For dual-axis: [{"name": "Q1", "value": 2500, "series": "Revenue ($M)"}, {"name": "Q1", "value": 35, "series": "Growth (%)"}]

CRITICAL RULES:
- ALL values in same series MUST be same unit
- Maximum 2 different units (dual-axis)
- Use enough points to show a meaningful pattern; include as many as the domain supports
- Use REAL research data only"""
    )
    chartType: Optional[str] = Field(
        default=None,
        description="""Chart type to match your data pattern. Available types:
        
COMMON TYPES (use most often):
- "bar" or "column": Numerical comparisons across categories
- "line" or "area": Numerical trends over time  
- "pie": Percentage distribution totaling ~100%

SPECIALIZED TYPES (use for variety and specific patterns):
- "waterfall": Sequential numerical changes/cumulative flow
- "sankey": Quantitative flows between stages
- "radar": Multi-dimensional numerical comparison
- "treemap": Numerical hierarchies (market cap by sector/company, storage by folder/file)
- "sunburst": Multi-level numerical breakdown (budget by dept/subdept/category)
- "scatter": Correlation between two numerical variables
- "bubble": 3D numerical data (x, y, size)

Choose the type that best reveals the pattern. Use variety across presentation!"""
    )
    dualAxis: Optional[bool] = Field(
        default=False,
        description="True if using 2 series with different units (creates dual Y-axes)"
    )


class TypedSlideResponse(BaseModel):
    """Slide response adapted for different slide types (legacy - for non-Perplexity models)"""
    content: str = Field(description="Slide content appropriate for the slide type")
    slide_type: str = Field(description="Type of slide: title, transition, content, or conclusion")
    has_statistics: bool = Field(description="True if content mentions quantitative data that would benefit from visualization")
    requires_chart: bool = Field(default=False, description="True if the slide contains categories, distributions, comparisons, trends, or any data that would be clearer with visualization. Examples: market segments, process steps, time series, percentages, rankings, or any numbered list that represents data")
    chart_type: str = Field(default="", description="Chart type if requires_chart is true")
    chart_data: List[ChartDataPoint] = Field(
        default_factory=list, 
        description="""Chart data with REAL category names and values from the content. Use actual names like 'Q1 Revenue', 'Mobile Devices', 'North America' NOT generic labels like 'Category A'.
        
        FOR SINGLE-SERIES CHARTS (bar, pie, single line):
        Use simple format: [{"name": "Category", "value": 450}, ...]
        
        FOR MULTI-SERIES CHARTS (multi-line, multi-bar/column, area):
        Add 'series' field to group data points: [{"name": "Q1 2023", "value": 450, "series": "Revenue"}, {"name": "Q1 2023", "value": 320, "series": "Cost"}, ...]
        OR use 'x' and 'y' with 'series': [{"x": "Q1 2023", "y": 450, "series": "Actual"}, {"x": "Q1 2023", "y": 420, "series": "Budget"}, ...]
        
        Multi-series examples:
        - Revenue vs Cost by Region: Use 'series' to distinguish metrics
        - Actual vs Budget trends: Use 'series' to compare scenarios
        - Multi-product performance: Use 'series' for each product line
        """
    )
    chart_title: str = Field(default="", description="Chart title that describes what the data shows") 
