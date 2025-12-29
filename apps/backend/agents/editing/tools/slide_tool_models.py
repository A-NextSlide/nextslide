"""Pydantic models used by slide tools."""

from typing import Any, Dict, List
from pydantic import BaseModel, Field


class ComponentProps(BaseModel):
    """Component properties."""

    class Config:
        extra = "allow"  # Allow any props


class GeneratedComponent(BaseModel):
    """A generated component."""
    type: str = Field(description="Component type: Background, TiptapTextBlock, Image, Chart, Shape, CustomComponent")
    props: Dict[str, Any] = Field(description="Component properties")


class SlideContent(BaseModel):
    """Generated slide content."""
    components: List[GeneratedComponent] = Field(description="List of components for the slide")


class _ReplaceOp(BaseModel):
    old_string: str = Field(description="Exact string to find in the HTML (must exist verbatim).")
    new_string: str = Field(default="", description="Replacement string (empty string to delete).")


class _ReplacePlan(BaseModel):
    ops: List[_ReplaceOp] = Field(default_factory=list, description="1-3 replacement operations to apply in order.")
    note: str = Field(default="", description="Brief note about what will change.")
