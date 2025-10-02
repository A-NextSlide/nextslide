#!/usr/bin/env python3
"""Debug why images are not being assigned to slides"""

import asyncio
import sys
from pathlib import Path
import logging

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

# Set up logging
logging.basicConfig(level=logging.DEBUG, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

from models.requests import DeckOutline, StylePreferencesItem, SlideOutline
from services.combined_image_service import CombinedImageService
import uuid

async def test_image_assignment():
    """Test image assignment to slides"""
    print("=" * 80)
    print("TESTING IMAGE ASSIGNMENT")
    print("=" * 80)
    
    # Create test slides with IDs
    slides = [
        SlideOutline(
            id=str(uuid.uuid4()),
            title="Pikachu: The Electric Icon",
            content="A cultural phenomenon"
        ),
        SlideOutline(
            id=str(uuid.uuid4()),
            title="The Enduring Appeal",
            content="Why Pikachu remains popular after 25 years"
        ),
        SlideOutline(
            id=str(uuid.uuid4()),
            title="Mastering Electric Powers",
            content="Pikachu's electric abilities and characteristics"
        )
    ]
    
    # Create deck outline
    deck_outline = DeckOutline(
        id=str(uuid.uuid4()),
        title="Pikachu: The Electric Icon",
        slides=slides,
        stylePreferences=StylePreferencesItem(
            colorScheme="vibrant",
            fontStyle="modern"
        )
    )
    
    print(f"Created deck with {len(slides)} slides:")
    for i, slide in enumerate(slides):
        print(f"  Slide {i+1}: '{slide.title}' (ID: {slide.id})")
    
    # Create image service
    image_service = CombinedImageService()
    
    # Track callback events
    events = []
    
    async def callback(event):
        events.append(event)
        event_type = event.get('type', 'unknown')
        print(f"\nEVENT: {event_type}")
        
        if event_type == 'topic_images_found':
            data = event.get('data', {})
            print(f"  Topic: {data.get('topic')}")
            print(f"  Images: {data.get('images_count')}")
            print(f"  For slides: {data.get('slides_using_topic', [])}")
        
        elif event_type == 'slide_images_found':
            data = event.get('data', {})
            print(f"  Slide: {data.get('slide_title')} (index {data.get('slide_index')})")
            print(f"  Slide ID: {data.get('slide_id')}")
            print(f"  Images: {data.get('images_count')}")
            print(f"  Topics: {data.get('topics_used', [])}")
    
    # Run image search
    deck_uuid = str(uuid.uuid4())
    
    print(f"\nStarting image search for deck {deck_uuid}...")
    
    try:
        task = await image_service.search_images_background(
            deck_outline=deck_outline,
            deck_uuid=deck_uuid,
            callback=callback,
            max_images_per_slide=6
        )
        
        # Wait for task to complete
        await task
        
    except Exception as e:
        print(f"\nERROR: {e}")
        import traceback
        traceback.print_exc()
    
    # Analyze results
    print("\n" + "=" * 80)
    print("ANALYSIS:")
    print(f"Total events: {len(events)}")
    
    topic_events = [e for e in events if e.get('type') == 'topic_images_found']
    slide_events = [e for e in events if e.get('type') == 'slide_images_found']
    
    print(f"Topic events: {len(topic_events)}")
    print(f"Slide events: {len(slide_events)}")
    
    # Check if slide IDs match
    print("\nSlide ID verification:")
    for slide in slides:
        print(f"  Original slide ID: {slide.id}")
        matching_events = [e for e in slide_events if e.get('data', {}).get('slide_id') == slide.id]
        print(f"  Matching events: {len(matching_events)}")
    
    return events

def main():
    """Run the test"""
    events = asyncio.run(test_image_assignment())
    
    print("\n" + "=" * 80)
    print("SUMMARY:")
    if not events:
        print("❌ NO EVENTS RECEIVED - Image search failed completely")
    else:
        slide_events = [e for e in events if e.get('type') == 'slide_images_found']
        if not slide_events:
            print("❌ NO SLIDE EVENTS - Images found but not assigned to slides")
        else:
            print(f"✅ {len(slide_events)} slides received images")

if __name__ == "__main__":
    main()
