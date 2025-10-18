#!/usr/bin/env python3
"""
Quick test to see what components look like when they come from the AI.
"""

import asyncio
import json
from agents.generation.components.ai_generator import AISlideGenerator
from agents.ai.clients import get_client

async def check_component_structure():
    """Generate a test slide to see component structure."""
    print("Generating test slide to check component structure...")

    ai_generator = AISlideGenerator(
        ai_client=get_client(provider="anthropic")
    )

    # Simple test prompt
    test_prompt = """
    Generate a simple title slide with:
    - Title: "Test Slide"
    - Subtitle: "Component Structure Check"

    Return as JSON with components array.
    """

    try:
        result = await ai_generator.generate_components_only(test_prompt)

        print("\n" + "=" * 60)
        print("COMPONENT STRUCTURE ANALYSIS")
        print("=" * 60)

        if 'components' in result:
            components = result['components']
            print(f"\nFound {len(components)} components")

            for i, comp in enumerate(components[:3]):  # First 3
                print(f"\nComponent {i}:")
                print(f"  Keys: {list(comp.keys())}")
                print(f"  Type: {comp.get('type', 'NO TYPE KEY')}")

                if 'props' in comp:
                    props = comp['props']
                    print(f"  Props keys: {list(props.keys())[:5]}...")  # First 5 keys

                    # Check for text content
                    if 'text' in props:
                        print(f"  Has 'text': {props['text'][:50]}...")
                    if 'texts' in props:
                        print(f"  Has 'texts': {len(props['texts'])} segments")

                    # Check for font properties
                    print(f"  fontSize: {props.get('fontSize', 'NOT SET')}")
                    print(f"  fontFamily: {props.get('fontFamily', 'NOT SET')}")
                else:
                    print("  NO PROPS KEY")
        else:
            print("No components in result")
            print(f"Result keys: {list(result.keys())}")

    except Exception as e:
        print(f"Error: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(check_component_structure())