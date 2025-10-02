"""
Test font sizing integration in the slide generation pipeline.
"""

import asyncio
from agents.generation.components.component_validator import ComponentValidator
from services.adaptive_font_sizer import adaptive_font_sizer
import logging

# Enable logging
logging.basicConfig(level=logging.INFO, format='%(levelname)s:%(name)s:%(message)s')


async def test_integration():
    """Test that font sizing is applied through the validator."""
    print("\n=== TESTING FONT SIZING INTEGRATION ===\n")

    # Create validator
    validator = ComponentValidator()

    # Test components as they would come from AI
    test_components = [
        {
            "id": "1",
            "type": "Title",
            "props": {
                "text": "Quarterly Business Review 2024",
                "position": {"x": 500, "y": 100},
                "width": 800,
                "height": 120,
                "fontFamily": "Inter",
                "fontSize": 16  # Wrong size!
            }
        },
        {
            "id": "2",
            "type": "TiptapTextBlock",
            "props": {
                "texts": [
                    {"text": "Revenue grew by ", "fontSize": 16},
                    {"text": "45%", "fontSize": 20},
                    {"text": " this quarter", "fontSize": 16}
                ],
                "position": {"x": 500, "y": 300},
                "width": 700,
                "height": 150,
                "fontFamily": "Inter"
            }
        },
        {
            "id": "3",
            "type": "TextBlock",
            "props": {
                "text": "Small text in large container that should be sized up",
                "position": {"x": 500, "y": 500},
                "width": 900,
                "height": 200,
                "fontFamily": "Inter",
                "fontSize": 12  # Too small!
            }
        }
    ]

    # Mock theme
    theme = {
        "fontFamily": "Inter",
        "colors": {
            "primary": "#007bff"
        }
    }

    print("BEFORE validation and sizing:")
    for comp in test_components:
        props = comp.get("props", {})
        print(f"  {comp['type']}: fontSize = {props.get('fontSize', 'N/A')}")

    # Validate with theme (this should apply font sizing)
    validated = validator.validate_components(
        test_components,
        registry=None,
        theme=theme
    )

    print("\nAFTER validation and sizing:")
    for comp in validated:
        props = comp.get("props", {})
        metadata = props.get("metadata", {})
        print(f"  {comp['type']}:")
        print(f"    fontSize = {props.get('fontSize', 'N/A')}px")
        print(f"    adaptiveSizing = {metadata.get('adaptiveSizing', False)}")
        print(f"    container = {metadata.get('containerSize', 'N/A')}")
        print(f"    confidence = {metadata.get('confidence', 'N/A')}")
        print(f"    iterations = {metadata.get('iterations', 'N/A')}")

    # Check if sizing was actually applied
    success = True
    for comp in validated:
        props = comp.get("props", {})
        metadata = props.get("metadata", {})

        if comp['type'] in ['Title', 'TiptapTextBlock', 'TextBlock']:
            if not metadata.get('adaptiveSizing'):
                print(f"\n❌ ERROR: {comp['type']} missing adaptive sizing!")
                success = False

            font_size = props.get('fontSize', 0)
            if font_size == 16 and comp['type'] == 'Title':
                print(f"\n❌ ERROR: Title still has default size 16!")
                success = False

    if success:
        print("\n✅ Font sizing integration working correctly!")
    else:
        print("\n⚠️ Font sizing integration has issues!")

    return success


def test_direct_sizing():
    """Test the adaptive font sizer directly."""
    print("\n=== TESTING DIRECT FONT SIZING ===\n")

    test_cases = [
        ("Title", "Q4 2024 Results", 800, 120),
        ("Body", "Revenue increased by 45% year-over-year with strong growth in all segments", 600, 150),
        ("Caption", "Source: Internal Analytics", 400, 60)
    ]

    for role, text, width, height in test_cases:
        result = adaptive_font_sizer.size_with_role_hint(
            text=text,
            container_width=width,
            container_height=height,
            font_family="Inter",
            role=role.lower()
        )

        print(f"{role}:")
        print(f"  Text: '{text[:40]}...'")
        print(f"  Container: {width}x{height}")
        print(f"  Calculated: {result['fontSize']}px")
        print(f"  Iterations: {result['iterations']}")
        print(f"  Confidence: {result['confidence']:.2f}")
        print()


async def main():
    """Run all tests."""
    print("=" * 60)
    print("FONT SIZING INTEGRATION TEST")
    print("=" * 60)

    # Test direct sizing
    test_direct_sizing()

    # Test integration
    success = await test_integration()

    print("\n" + "=" * 60)
    if success:
        print("✅ ALL TESTS PASSED")
    else:
        print("⚠️ SOME TESTS FAILED - Check logs above")
    print("=" * 60)

    # Check what logs we're seeing
    print("\n\nTo see detailed logs, look for:")
    print("  [FONT SIZING] - Font sizing operations")
    print("  INFO:services.adaptive_font_sizer - Sizing decisions")
    print("  INFO:agents.generation.components.component_validator - Validation")


if __name__ == "__main__":
    asyncio.run(main())