"""
API endpoint for searching and managing image options for deck slides.
"""
import logging
from typing import Dict, List, Any, Optional
from pydantic import BaseModel, Field
from datetime import datetime

from models.requests import DeckOutline
from services.combined_image_service import CombinedImageService
from agents.persistence.deck_persistence import DeckPersistence
from models.registry import ComponentRegistry

logger = logging.getLogger(__name__)


class ImageOptionsRequest(BaseModel):
    """Request to search for image options for a deck"""
    deck_id: str = Field(..., description="The deck ID")
    deck_outline: DeckOutline = Field(..., description="The deck outline")
    images_per_topic: int = Field(default=20, description="Number of images per search topic")
    max_topics_per_slide: int = Field(default=5, description="Maximum topics to search per slide")


class ApplyImagesRequest(BaseModel):
    """Request to apply selected images to a deck"""
    deck_uuid: str = Field(..., description="The deck UUID")
    image_selections: Dict[str, List[str]] = Field(
        ..., 
        description="Map of slide_id to list of selected image URLs"
    )


class ImageOptionsResponse(BaseModel):
    """Response containing image options for slides"""
    topics: Dict[str, List[Dict[str, Any]]] = Field(
        default_factory=dict,
        description="Map of search topics to available images"
    )
    slides: Dict[str, Dict[str, Any]] = Field(
        default_factory=dict,
        description="Map of slide IDs to their image options"
    )
    metadata: Dict[str, Any] = Field(
        default_factory=dict,
        description="Search metadata and statistics"
    )
    deck_info: Dict[str, Any] = Field(
        default_factory=dict,
        description="Deck information"
    )


class ApplyImagesResponse(BaseModel):
    """Response for applying images to deck"""
    success: bool = Field(..., description="Whether the operation was successful")
    slides_updated: int = Field(default=0, description="Number of slides updated")
    message: str = Field(default="", description="Status message")


async def search_image_options(request: ImageOptionsRequest, registry: ComponentRegistry) -> ImageOptionsResponse:
    """
    Search for multiple image options per topic for user selection.
    
    This endpoint searches for images based on slide content and returns
    multiple options for each search topic, allowing users to choose
    which images to use.
    
    Args:
        request: The image options request
        registry: The component registry
        
    Returns:
        ImageOptionsResponse with available images organized by topic
    """
    try:
        logger.info(f"Searching image options for deck {request.deck_id}")
        
        # Initialize image service directly
        image_service = CombinedImageService()
        
        # Search for image options
        image_options = await image_service.search_image_options_for_deck(
            deck_outline=request.deck_outline,
            images_per_topic=request.images_per_topic,
            max_topics_per_slide=request.max_topics_per_slide
        )
        
        # Log results
        metadata = image_options.get('metadata', {})
        logger.info(
            f"Image search complete for deck {request.deck_id}: "
            f"Found {metadata.get('total_images_found', 0)} images across "
            f"{metadata.get('total_topics_searched', 0)} topics"
        )
        
        # Add deck_info if not present
        if "deck_info" not in image_options:
            image_options["deck_info"] = {
                "deck_id": request.deck_id,
                "title": request.deck_outline.title,
                "slide_count": len(request.deck_outline.slides)
            }
        
        # Create response
        return ImageOptionsResponse(
            topics=image_options.get('topics', {}),
            slides=image_options.get('slides', {}),
            metadata=metadata,
            deck_info=image_options.get('deck_info', {})
        )
        
    except Exception as e:
        logger.error(f"Error searching image options: {str(e)}", exc_info=True)
        # Return error response
        return ImageOptionsResponse(
            metadata={
                'error': str(e),
                'total_topics_searched': 0,
                'successful_searches': 0,
                'failed_searches': 0,
                'total_images_found': 0
            },
            deck_info={
                'deck_id': request.deck_id,
                'error': True
            }
        )


async def apply_selected_images(request: ApplyImagesRequest, registry: ComponentRegistry) -> ApplyImagesResponse:
    """
    Apply user-selected images to deck slides.
    
    This endpoint takes the user's image selections and applies them
    to the appropriate image placeholders in the deck slides.
    
    Args:
        request: The apply images request
        registry: The component registry
        
    Returns:
        ApplyImagesResponse indicating success/failure
    """
    try:
        logger.info(
            f"Applying selected images to deck {request.deck_uuid}: "
            f"{len(request.image_selections)} slides"
        )
        
        # Initialize persistence directly
        persistence = DeckPersistence()
        
        # Get current deck data
        deck_data = await persistence.get_deck_with_retry(request.deck_uuid)
        if not deck_data:
            logger.error(f"Could not retrieve deck {request.deck_uuid}")
            return ApplyImagesResponse(
                success=False,
                slides_updated=0,
                message=f"Deck {request.deck_uuid} not found"
            )
        
        slides_updated = 0
        
        # Apply images to each slide
        for slide_id, image_urls in request.image_selections.items():
            # Find slide index by ID
            slide_index = next(
                (i for i, slide in enumerate(deck_data.get('slides', [])) 
                 if slide.get('id') == slide_id),
                None
            )
            
            if slide_index is None:
                logger.warning(f"Slide {slide_id} not found in deck")
                continue
            
            slide_data = deck_data['slides'][slide_index]
            
            # Find Image components
            image_components = [
                (i, comp) for i, comp in enumerate(slide_data.get('components', []))
                if comp.get('type') == 'Image'
            ]
            
            if not image_components:
                logger.warning(f"No Image components in slide {slide_id}")
                continue
            
            # Apply selected images to components
            for idx, (comp_idx, component) in enumerate(image_components):
                if idx < len(image_urls):
                    component['props']['src'] = image_urls[idx]
                    component['props']['alt'] = f"Selected image {idx + 1}"
                    logger.info(f"Applied image {idx + 1} to slide {slide_id}")
            
            # Save updated slide
            await persistence.update_slide(request.deck_uuid, slide_index, slide_data)
            slides_updated += 1
        
        logger.info(f"Successfully updated {slides_updated} slides with selected images")
        
        # Update deck status
        try:
            from utils.supabase import get_supabase_client
            supabase = get_supabase_client()
            
            status_update = {
                "status": {
                    "state": "completed",
                    "progress": 100,
                    "message": "Images applied successfully"
                }
            }
            
            supabase.table("decks").update(status_update).eq("uuid", request.deck_uuid).execute()
        except Exception:
            pass
        
        return ApplyImagesResponse(
            success=True,
            slides_updated=slides_updated,
            message=f"Successfully applied images to {slides_updated} slides"
        )
        
    except Exception as e:
        logger.error(f"Error applying selected images: {str(e)}", exc_info=True)
        return ApplyImagesResponse(
            success=False,
            slides_updated=0,
            message=f"Error: {str(e)}"
        )


async def search_additional_images(
    topic: str,
    num_images: int = 20,
    deck_id: Optional[str] = None
) -> List[Dict[str, Any]]:
    """
    Search for additional images for a specific topic.
    
    This can be used when users want more options for a particular topic.
    
    Args:
        topic: The search topic
        num_images: Number of images to return
        deck_id: Optional deck ID for tracking
        
    Returns:
        List of image options
    """
    try:
        logger.info(f"Searching additional images for topic: {topic}")
        
        # Initialize image service
        image_service = CombinedImageService()
        
        # Search for images
        images = await image_service._search_images_for_topic_with_options(
            topic=topic,
            deck_id=deck_id or "additional-search",
            num_images=num_images
        )
        
        # Upload to Supabase
        uploaded_images = await image_service._upload_images_to_supabase(images)
        
        logger.info(f"Found {len(uploaded_images)} additional images for topic: {topic}")
        return uploaded_images
        
    except Exception as e:
        logger.error(f"Error searching additional images: {str(e)}", exc_info=True)
        return [] 