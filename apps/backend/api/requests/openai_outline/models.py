from typing import Optional, List, Dict, Any
import logging
from pydantic import BaseModel, Field, validator

from models.requests import DeckOutline
from models.narrative_flow import NarrativeFlow

logger = logging.getLogger(__name__)



class OutlineRequest(BaseModel):
    """Request for outline generation"""
    prompt: str = Field(description="User's presentation idea or topic")
    files: List[Dict[str, Any]] = Field(default_factory=list, description="Uploaded files data")
    detailLevel: Optional[str] = Field('standard', description="Detail level: 'quick', 'detailed', or 'standard'")
    styleContext: Optional[str] = Field(None, description="Style context or vibe description")
    fontPreference: Optional[str] = Field(None, description="Preferred font name")
    colorPreference: Optional[Any] = Field(None, description="Color preferences")
    # Important: leave default as None so per-task defaults apply
    # If explicitly provided by the client, this overrides BOTH planning and content
    model: Optional[str] = Field(None, description="Global override model for BOTH planning and content (optional)")
    slideCount: Optional[int] = Field(None, description="Specific number of slides requested (1-20)")
    visualDensity: Optional[str] = Field(None, description="Visual density preference: minimal | moderate | rich | dense")
    enableResearch: Optional[bool] = Field(None, description="Enable web research (Thinking) during outline creation")
    async_images: Optional[bool] = Field(default=True, description="If True, images are placeholders; if False, images are auto-applied (default: True = placeholders)")
    uploadedMedia: Optional[List[Dict[str, Any]]] = Field(default=None, description="Pre-processed uploaded media from OutlineAgent to include in deck")
    scraped_videos: Optional[List[Dict[str, Any]]] = Field(default=None, description="Videos scraped from website URLs to include in deck")

    @validator('async_images', pre=True, always=True)
    def debug_async_images(cls, v):
        """Validate async_images field - defaults to True (placeholder mode is safer default)"""
        # If None, default to True (placeholder mode - safer default, user can manually select)
        if v is None:
            return True
        # Ensure it's a boolean
        return bool(v)

    # Workaround: Also accept slide_count (snake_case)
    slide_count: Optional[int] = Field(None, description="Alternative field name for slide count")
    
    @validator('slideCount', always=True)
    def merge_slide_count(cls, v, values):
        """If slideCount is None, check for slide_count as fallback"""
        if v is None and 'slide_count' in values and values['slide_count'] is not None:
            logger.info(f"[WORKAROUND] Using slide_count ({values['slide_count']}) as slideCount was None")
            return values['slide_count']
        return v
    
    @validator('colorPreference', pre=True)
    def validate_color_preference(cls, v):
        """Handle colorPreference as either dict or list"""
        if v is None:
            return None
        
        # If it's already a dict, return as-is
        if isinstance(v, dict):
            return v
        
        # If it's a list, try to extract the first dict element
        if isinstance(v, list):
            logger.warning(f"colorPreference received as list: {v}")
            # Look for first dict in the list
            for item in v:
                if isinstance(item, dict):
                    return item
            # If no dict found, return None
            return None
        
        # For any other type, log and return None
        logger.warning(f"colorPreference received as unexpected type {type(v)}: {v}")
        return None

class ContentEnhancementRequest(BaseModel):
    """Request for content enhancement"""
    content: str = Field(description="Content to enhance")
    systemPrompts: Optional[Dict[str, str]] = Field(default_factory=dict, description="System prompts")
    enhancePrompt: Optional[str] = Field(None, description="Legacy field for enhancement prompt")

class ContentEnhancementResponse(BaseModel):
    """Response for content enhancement"""
    enhancedContent: str = Field(description="The enhanced content")
    extractedData: Optional[Dict[str, Any]] = Field(None, description="Any extracted data for visualization")
    sources: Optional[str] = Field(None, description="Sources used for enhancement")

class OutlineResponse(BaseModel):
    """Response containing the generated outline"""
    success: bool
    hasResult: bool
    outline: Optional[DeckOutline] = None
    narrative_flow: Optional[NarrativeFlow] = None
    error: Optional[str] = None
    message: str
