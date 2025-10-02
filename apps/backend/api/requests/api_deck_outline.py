import logging
# from agents.generation.deck_composer import compose_deck_content # compose_deck_content was part of the old agent logic
from models.registry import ComponentRegistry
from models.requests import DeckOutline, DeckOutlineResponse, SlideOutline
from models.deck import DeckBase
from utils.supabase import upload_deck
import asyncio
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

async def process_deck_outline(deck_outline: DeckOutline, registry: ComponentRegistry, user_id: Optional[str] = None):
    """
    Process the deck outline - creates deck immediately in Supabase and returns
    
    This function:
    1. Creates a deck placeholder in Supabase immediately
    2. Returns the deck data so the API can respond quickly
    3. Deck composition will happen separately via streaming endpoint
    
    Args:
        deck_outline: The deck outline
        registry: The component registry
        user_id: Optional user ID to associate with the deck
    """
    if registry is None:
        raise ValueError("Registry is not set")
    
    # Use the outline ID as the deck UUID (consistent IDs)
    deck_uuid = deck_outline.id
    
    logger.info("=== CREATING DECK PLACEHOLDER ===")
    logger.info(f"Deck UUID (from outline): {deck_uuid}")
    logger.info(f"Title: {deck_outline.title}")
    logger.info(f"Number of slides: {len(deck_outline.slides)}")
    logger.info(f"User: {user_id or 'anonymous'}")
    
    # Debug stylePreferences
    if hasattr(deck_outline, 'stylePreferences'):
        logger.info(f"StylePreferences present: {deck_outline.stylePreferences is not None}")
        if deck_outline.stylePreferences:
            logger.info(f"StylePreferences vibe: {getattr(deck_outline.stylePreferences, 'vibeContext', 'NOT SET')}")
    else:
        logger.warning(f"⚠️ NO stylePreferences attribute in deck_outline!")
    
    # Create initial deck structure with placeholder slides
    initial_slides = []
    for i, slide_outline in enumerate(deck_outline.slides):
        # Create placeholder slide with title and preserve chart data
        placeholder_slide = {
            "id": slide_outline.id,
            "title": slide_outline.title,
            "components": [],
            "status": "pending",
            "extractedData": slide_outline.extractedData.model_dump() if slide_outline.extractedData else None
        }
        initial_slides.append(placeholder_slide)
    
    # Create initial deck in database
    initial_deck = DeckBase(
        uuid=deck_uuid,
        name=deck_outline.title,
        slides=initial_slides,
        size={"width": 1920, "height": 1080},
        status={
            "state": "pending",
            "currentSlide": 0,
            "totalSlides": len(deck_outline.slides),
            "message": "Deck created. Ready for generation.",
            "createdAt": datetime.now().isoformat(),
            "progress": 0
        }
    )
    
    # Upload initial deck structure
    try:
        initial_deck_data = initial_deck.model_dump()
        # Add the outline to the deck data before uploading
        initial_deck_data["outline"] = deck_outline.model_dump()
        
        # Extract notes (narrative flow) if present in the outline
        outline_dict = deck_outline.model_dump()
        if 'notes' in outline_dict and outline_dict['notes']:
            initial_deck_data["notes"] = outline_dict['notes']
            logger.info(f"[DECK SAVE] Including narrative flow notes in deck")
        else:
            logger.info(f"[DECK SAVE] No narrative flow notes in outline (will be generated asynchronously)")
        
        # Debug what's being saved
        logger.info(f"[DECK SAVE] Outline being saved has keys: {list(outline_dict.keys())}")
        if 'stylePreferences' in outline_dict:
            logger.info(f"[DECK SAVE] StylePreferences in saved outline: {outline_dict['stylePreferences']}")
        else:
            logger.warning(f"[DECK SAVE] ⚠️ NO stylePreferences in outline being saved!")
        
        uploaded_deck = upload_deck(initial_deck_data, deck_uuid, user_id)
        logger.info(f"✓ Created deck placeholder with UUID: {deck_uuid} for user: {user_id or 'anonymous'}")
        
        # Return the deck data immediately
        return {
            'deck_data': uploaded_deck,
            'deck_uuid': deck_uuid,
            'message': f"Deck '{deck_outline.title}' created successfully"
        }
        
    except Exception as e:
        logger.error(f"ERROR: Failed to create deck placeholder: {str(e)}")
        import traceback
        traceback.print_exc()
        raise

    return DeckOutlineResponse(message="Deck outline processed successfully", deck_outline_id=deck_outline.id, timestamp=datetime.now())

# @router.post("/compose-content", response_model=DeckOutlineResponse) # Assuming this used compose_deck_content
# async def compose_deck_content_endpoint(deck_outline: DeckOutline, registry: ComponentRegistry = Depends(get_registry)):
#     """
#     Endpoint to compose content for an existing deck based on an outline.
#     This was using the non-streaming agent logic.
#     """
#     logger.info(f"Received request to compose content for deck outline: {deck_outline.title}")
#     try:
#         # This function is no longer in the refactored deck_composer.py
#         # end_state = compose_deck_content(deck_outline, registry, deck_outline.id) 
#         # if end_state and end_state.get('deck_data'):
#         #     logger.info(f"Content composition completed for deck: {end_state['deck_data'].get('name')}")
#         #     return DeckOutlineResponse(message="Deck content composition initiated", deck_outline_id=deck_outline.id, timestamp=datetime.now())
#         # else:
#         #     raise HTTPException(status_code=500, detail="Deck content composition failed to return valid state.")
#         logger.warning("compose_deck_content functionality is currently disabled due to refactoring.")
#         raise HTTPException(status_code=501, detail="compose_deck_content functionality is currently disabled.")
#     except Exception as e:
#         logger.error(f"Error in compose_deck_content_endpoint: {str(e)}", exc_info=True)
#         raise HTTPException(status_code=500, detail=str(e))