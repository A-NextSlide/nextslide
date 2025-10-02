"""Data models for outline generation"""

import uuid
from typing import Optional, List, Dict, Any
from datetime import datetime
from pydantic import BaseModel, Field, validator


class OutlineOptions(BaseModel):
    """Options for outline generation"""
    prompt: str
    detail_level: str = "standard"  # quick, standard, detailed
    enable_research: bool = False
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
    
    @validator('slide_count')
    def validate_slide_count(cls, v):
        if v is not None:
            if v < 1:
                return 1
            elif v > 20:
                return 20
        return v


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
    chart_data: Optional[ChartData] = None
    research_notes: Optional[str] = None
    images: List[Dict[str, Any]] = Field(default_factory=list)  # Images assigned to this slide
    # Additional fields for frontend compatibility
    deepResearch: bool = False
    extractedData: Optional[Dict[str, Any]] = None  # For charts in frontend format
    taggedMedia: List[Dict[str, Any]] = Field(default_factory=list)  # Media files tagged to this slide
    citations: List[Dict[str, Any]] = Field(default_factory=list)  # Citations from research/Perplexity
    footnotes: List[Dict[str, Any]] = Field(default_factory=list)  # Numbered footnotes for citation panel
    # New: optional footer spec for rendering citations at the bottom in small text
    citationsFooter: Optional[Dict[str, Any]] = None  # { showThinDivider: bool, urls: string[] }
    # New: structured two-column comparison content (for side-by-side layout)
    comparison: Optional[Dict[str, Any]] = None  # { layout?: string, leftLabel?: string, rightLabel?: string, leftBullets: string[], rightBullets: string[] }


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
    
    # For complex nested data (legacy support)
    id: str = Field(default="", description="Unique identifier")


class TypedSlideResponse(BaseModel):
    """Slide response adapted for different slide types"""
    content: str = Field(description="Slide content appropriate for the slide type")
    slide_type: str = Field(description="Type of slide: title, transition, content, or conclusion")
    has_statistics: bool = Field(description="True if content mentions quantitative data that would benefit from visualization")
    requires_chart: bool = Field(default=False, description="True if the slide contains categories, distributions, comparisons, trends, or any data that would be clearer with visualization. Examples: market segments, process steps, time series, percentages, rankings, or any numbered list that represents data")
    chart_type: str = Field(default="", description="Chart type if requires_chart is true")
    chart_data: List[ChartDataPoint] = Field(default_factory=list, description="Chart data with REAL category names and values from the content. Use actual names like 'Q1 Revenue', 'Mobile Devices', 'Photosynthesis Rate' NOT generic labels like 'Category A'")
    chart_title: str = Field(default="", description="Chart title that describes what the data shows") 