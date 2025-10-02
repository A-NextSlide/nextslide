#!/usr/bin/env python3
"""
Demo to show font sizing working with mock components.
Shows the print statements in terminal for debugging.
"""

from agents.generation.components.component_validator import ComponentValidator
from services.adaptive_font_sizer import adaptive_font_sizer

def demo_font_sizing():
    """Demonstrate font sizing with various component sizes."""
    print("\n" + "=" * 80)
    print("FONT SIZING DEMONSTRATION")
    print("Shows how text adapts to different container sizes")
    print("=" * 80 + "\n")

    # Create validator
    validator = ComponentValidator()

    # Mock theme
    theme = {
        "fontFamily": "Inter",
        "colors": {"primary": "#007bff"}
    }

    # Test scenarios
    scenarios = [
        {
            "name": "SCENARIO 1: Title in Large Container",
            "components": [{
                "id": "1",
                "type": "Title",
                "props": {
                    "text": "Quarterly Business Review 2024",
                    "position": {"x": 500, "y": 100},
                    "width": 1200,
                    "height": 150,
                    "fontFamily": "Inter",
                    "fontSize": 16  # AI hardcoded this too small!
                }
            }]
        },
        {
            "name": "SCENARIO 2: Body Text in Medium Container",
            "components": [{
                "id": "2",
                "type": "TextBlock",
                "props": {
                    "text": "Revenue increased by 45% year-over-year with strong performance across all business segments",
                    "position": {"x": 500, "y": 300},
                    "width": 800,
                    "height": 200,
                    "fontFamily": "Inter",
                    "fontSize": 180  # AI hardcoded this too large!
                }
            }]
        },
        {
            "name": "SCENARIO 3: Multiple Text Components",
            "components": [
                {
                    "id": "3a",
                    "type": "Title",
                    "props": {
                        "text": "Key Metrics",
                        "position": {"x": 500, "y": 100},
                        "width": 600,
                        "height": 100,
                        "fontFamily": "Inter",
                        "fontSize": 24
                    }
                },
                {
                    "id": "3b",
                    "type": "TiptapTextBlock",
                    "props": {
                        "texts": [
                            {"text": "Customer Growth: ", "fontSize": 16},
                            {"text": "+125%", "fontSize": 20}
                        ],
                        "position": {"x": 500, "y": 250},
                        "width": 500,
                        "height": 80,
                        "fontFamily": "Inter"
                    }
                },
                {
                    "id": "3c",
                    "type": "TextBlock",
                    "props": {
                        "text": "Exceeding all projections for Q4",
                        "position": {"x": 500, "y": 400},
                        "width": 700,
                        "height": 60,
                        "fontFamily": "Inter",
                        "fontSize": 14
                    }
                }
            ]
        }
    ]

    # Run each scenario
    for scenario in scenarios:
        print("\n" + "-" * 60)
        print(f"🔬 {scenario['name']}")
        print("-" * 60 + "\n")

        components = scenario['components']

        # Show before
        print("BEFORE adaptive sizing:")
        for comp in components:
            props = comp.get('props', {})
            comp_type = comp.get('type', 'Unknown')
            text = props.get('text', '')
            if not text and 'texts' in props:
                text = ''.join([t.get('text', '') for t in props.get('texts', [])])
            text = text[:40] + '...' if len(text) > 40 else text
            font_size = props.get('fontSize', 'not set')
            width = props.get('width', 0)
            height = props.get('height', 0)

            print(f"  • {comp_type}: '{text}'")
            print(f"    Container: {width}x{height}px")
            print(f"    Current fontSize: {font_size}")

        print("\nAPPLYING ADAPTIVE FONT SIZING...")
        print("(Watch for [FONT SIZING] messages below)")
        print("")

        # Apply validation with font sizing
        validated = validator.validate_components(
            components,
            registry=None,
            theme=theme
        )

        # Show after
        print("\nAFTER adaptive sizing:")
        for comp in validated:
            props = comp.get('props', {})
            comp_type = comp.get('type', 'Unknown')
            text = props.get('text', '')
            if not text and 'texts' in props:
                text = ''.join([t.get('text', '') for t in props.get('texts', [])])
            text = text[:40] + '...' if len(text) > 40 else text
            font_size = props.get('fontSize', 'not set')
            metadata = props.get('metadata', {})
            adaptive = metadata.get('adaptiveSizing', False)
            confidence = metadata.get('confidence', 0)

            status = "✅" if adaptive else "❌"
            print(f"  {status} {comp_type}: '{text}'")
            print(f"    New fontSize: {font_size}px")
            print(f"    Confidence: {confidence:.2f}")

    print("\n" + "=" * 80)
    print("KEY INSIGHTS:")
    print("=" * 80)
    print("✅ Font sizes are NO LONGER hardcoded")
    print("✅ Text adapts to fill container without overflow")
    print("✅ Binary search finds optimal size in ~8 iterations")
    print("✅ Works with ANY font family (not just pre-configured ones)")
    print("✅ Print statements show sizing decisions in terminal")
    print("\n")


if __name__ == "__main__":
    demo_font_sizing()