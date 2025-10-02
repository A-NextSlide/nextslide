"""
API endpoint for slide reordering with narrative flow recalculation
"""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from typing import List, Optional
import logging
from models.narrative_flow import NarrativeFlow
from services.narrative_flow_analyzer import NarrativeFlowAnalyzer

logger = logging.getLogger(__name__)
router = APIRouter()


class SlideReorderRequest(BaseModel):
    """Request to reorder slides in an outline"""
    deck_id: str = Field(..., description="ID of the deck")
    outline: dict = Field(..., description="Current outline data")
    new_order: List[str] = Field(..., description="New order of slide IDs")


class SlideReorderResponse(BaseModel):
    """Response after reordering slides"""
    success: bool
    updatedNarrativeFlow: Optional[NarrativeFlow] = None
    message: str


@router.post("/api/slides/reorder")
async def reorder_slides(request: SlideReorderRequest) -> SlideReorderResponse:
    """
    Reorder slides and recalculate narrative flow
    """
    try:
        logger.info(f"Reordering slides for deck {request.deck_id}")
        
        # Validate the new order
        current_slide_ids = [slide.get('id') for slide in request.outline.get('slides', [])]
        if set(request.new_order) != set(current_slide_ids):
            raise HTTPException(
                status_code=400,
                detail="Invalid slide order - IDs don't match current slides"
            )
        
        # Create reordered outline
        slide_map = {slide['id']: slide for slide in request.outline.get('slides', [])}
        reordered_slides = [slide_map[slide_id] for slide_id in request.new_order]
        
        reordered_outline = request.outline.copy()
        reordered_outline['slides'] = reordered_slides
        
        # Analyze narrative flow for new order
        try:
            flow_analyzer = NarrativeFlowAnalyzer()
            updated_narrative_flow = await flow_analyzer.analyze_narrative_flow(
                reordered_outline,
                context=f"Slides reordered for {request.outline.get('title', 'presentation')}"
            )
            
            logger.info("Narrative flow recalculated after reorder")
            
            return SlideReorderResponse(
                success=True,
                updatedNarrativeFlow=updated_narrative_flow,
                message="Slides reordered and narrative flow updated"
            )
            
        except Exception as e:
            logger.error(f"Failed to analyze narrative flow after reorder: {e}")
            return SlideReorderResponse(
                success=True,
                updatedNarrativeFlow=None,
                message="Slides reordered but narrative flow update failed"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error reordering slides: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to reorder slides: {str(e)}"
        ) 