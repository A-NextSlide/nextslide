"""
Minimal Slide Model for RAG-based generation with schema injection
This model has minimal validation to allow flexible component generation
"""

from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field


class MinimalComponent(BaseModel):
    """Minimal component model with basic validation"""
    id: Optional[str] = Field(default=None)
    type: str = Field(..., description="Component type (e.g., Background, TiptapTextBlock, etc.)")
    props: Dict[str, Any] = Field(default_factory=dict, description="Component properties")
    
    class Config:
        extra = "allow"  # Allow additional fields


class MinimalSlide(BaseModel):
    """Minimal slide model for AI generation with schema injection"""
    id: str = Field(..., description="Unique slide identifier")
    title: str = Field(..., description="Slide title")
    components: List[MinimalComponent] = Field(
        default_factory=list,
        description="List of components on the slide"
    )
    
    class Config:
        extra = "allow"  # Allow additional fields like metadata 