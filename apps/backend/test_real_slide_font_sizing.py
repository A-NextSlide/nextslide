#!/usr/bin/env python3
"""
Test font sizing with real slide generation.
This will show font sizing in action with actual AI-generated components.
"""

import asyncio
import json
from agents.generation.slide_generator import SlideGeneratorV2
from agents.generation.theme_director import ThemeDirector
from agents.ai.clients import get_client
from utils.registry import ComponentRegistry
from dataclasses import dataclass
from typing import Optional, Dict, Any

# Enable terminal output
import logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')


@dataclass
class MockContext:
    """Mock context for testing."""
    theme: Optional[Dict[str, Any]] = None
    outline: Optional[Dict[str, Any]] = None
    user_id: str = "test-user"
    session_id: str = "test-session"


async def test_real_generation():
    """Test font sizing with real slide generation."""
    print("\n" + "=" * 80)
    print("REAL SLIDE FONT SIZING TEST")
    print("=" * 80 + "\n")

    # Create theme
    print("Creating theme...")
    theme_director = ThemeDirector(
        ai_client=get_client(provider="anthropic"),
        brand="TechCorp"
    )

    theme_data = {
        "brand": "TechCorp",
        "colors": {
            "primary": "#007bff",
            "secondary": "#28a745",
            "background": "#ffffff",
            "text": "#333333"
        },
        "fontFamily": "Inter",
        "mood": "professional"
    }

    theme = await theme_director.create_theme(theme_data)
    print(f"✅ Theme created with font: {theme.font_family}\n")

    # Create slide generator
    print("Creating slide generator...")
    slide_generator = SlideGeneratorV2(
        ai_client=get_client(provider="anthropic"),
        component_registry=ComponentRegistry()
    )

    # Create context
    context = MockContext(theme=theme)

    # Test slide data with components that should be resized
    test_slide = {
        "title": "Q4 2024 Results",
        "content": "Strong quarterly performance with record revenue",
        "template": "content_slide"
    }

    print(f"Generating slide: '{test_slide['title']}'")
    print("Watch for [FONT SIZING] messages...\n")
    print("-" * 60)

    # Generate slide
    try:
        result = await slide_generator.generate_slide(
            slide_data=test_slide,
            context=context,
            slide_index=0
        )

        print("-" * 60)
        print("\n✅ Slide generated successfully!")

        # Show component font sizes
        if result and 'components' in result:
            print(f"\nGenerated {len(result['components'])} components:")
            for i, comp in enumerate(result['components']):
                comp_type = comp.get('type', 'Unknown')
                props = comp.get('props', {})
                font_size = props.get('fontSize', 'N/A')
                metadata = props.get('metadata', {})
                adaptive = metadata.get('adaptiveSizing', False)

                print(f"  {i+1}. {comp_type}:")
                print(f"     fontSize: {font_size}px")
                print(f"     adaptiveSizing: {adaptive}")

                if adaptive:
                    print(f"     confidence: {metadata.get('confidence', 'N/A')}")
                    print(f"     container: {metadata.get('containerSize', 'N/A')}")
                    print(f"     iterations: {metadata.get('iterations', 'N/A')}")
        else:
            print("\n⚠️ No components in result")

    except Exception as e:
        print(f"\n❌ Error generating slide: {e}")
        import traceback
        traceback.print_exc()

    print("\n" + "=" * 80)
    print("TEST COMPLETE")
    print("=" * 80)

    # Summary
    print("\nWhat to look for in the logs above:")
    print("  ✅ [COMPONENT VALIDATOR] messages showing components being processed")
    print("  ✅ [FONT SIZING] messages showing size calculations")
    print("  ✅ Font sizes that adapt to container (not hardcoded 16px)")
    print("  ✅ 'adaptiveSizing: True' in component metadata")


if __name__ == "__main__":
    asyncio.run(test_real_generation())