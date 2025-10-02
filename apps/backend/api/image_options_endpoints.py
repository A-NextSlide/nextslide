"""
FastAPI endpoints for image options functionality.
"""
from fastapi import APIRouter, HTTPException, Body
from typing import Dict, List, Any, Optional
import logging

from api.requests.api_image_options import (
    ImageOptionsRequest,
    ImageOptionsResponse,
    ApplyImagesRequest,
    ApplyImagesResponse,
    search_image_options,
    apply_selected_images,
    search_additional_images
)

logger = logging.getLogger(__name__)

# Create router for image options endpoints
router = APIRouter(prefix="/api/image-options", tags=["image-options"])


@router.post("/search", response_model=ImageOptionsResponse)
async def search_image_options_endpoint(
    request: ImageOptionsRequest = Body(...)
) -> ImageOptionsResponse:
    """
    Search for multiple image options per topic for user selection.
    
    This endpoint searches for images based on slide content and returns
    multiple options for each search topic, allowing users to choose
    which images to use for their slides.
    
    Args:
        request: The image options request containing deck outline and settings
        
    Returns:
        ImageOptionsResponse with available images organized by topic and slide
    """
    try:
        # Get the global registry (imported from chat_server)
        from api.chat_server import REGISTRY
        
        if REGISTRY is None:
            raise HTTPException(
                status_code=500,
                detail="Registry not initialized. Please ensure the frontend has sent component schemas."
            )
        
        logger.info(f"Searching image options for deck {request.deck_id}")
        response = await search_image_options(request, REGISTRY)
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in search_image_options_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/apply", response_model=ApplyImagesResponse)
async def apply_selected_images_endpoint(
    request: ApplyImagesRequest = Body(...)
) -> ApplyImagesResponse:
    """
    Apply user-selected images to deck slides.
    
    This endpoint takes the user's image selections and applies them
    to the appropriate image placeholders in the deck slides.
    
    Args:
        request: The apply images request with deck UUID and image selections
        
    Returns:
        ApplyImagesResponse indicating success/failure and number of slides updated
    """
    try:
        # Get the global registry (imported from chat_server)
        from api.chat_server import REGISTRY
        
        if REGISTRY is None:
            raise HTTPException(
                status_code=500,
                detail="Registry not initialized. Please ensure the frontend has sent component schemas."
            )
        
        logger.info(f"Applying selected images to deck {request.deck_uuid}")
        response = await apply_selected_images(request, REGISTRY)
        return response
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error in apply_selected_images_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/search-additional")
async def search_additional_images_endpoint(
    topic: str = Body(..., embed=True),
    num_images: int = Body(20, embed=True),
    deck_id: Optional[str] = Body(None, embed=True)
) -> List[Dict[str, Any]]:
    """
    Search for additional images for a specific topic.
    
    This endpoint can be used when users want more image options
    for a particular search topic.
    
    Args:
        topic: The search topic
        num_images: Number of images to return (default: 20)
        deck_id: Optional deck ID for tracking
        
    Returns:
        List of additional image options
    """
    try:
        logger.info(f"Searching additional images for topic: {topic}")
        images = await search_additional_images(topic, num_images, deck_id)
        return images
    except Exception as e:
        logger.error(f"Error in search_additional_images_endpoint: {str(e)}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to search additional images: {str(e)}") 