"""
Test adaptive font sizing - NO HARDCODED LIMITS.
Verifies that text sizes to fill containers properly.
"""

from services.adaptive_font_sizer import adaptive_font_sizer
from services.font_metrics_service import font_metrics_service
from utils.font_sizing_debug import FontSizingDebugger, check_font_sizing_issues
import json


def test_adaptive_sizing():
    """Test that adaptive sizing fills containers without hardcoded limits."""
    print("\n=== TESTING ADAPTIVE FONT SIZING ===\n")

    test_cases = [
        {
            "name": "Small container with short text",
            "text": "Hello",
            "container": (100, 50),
            "expected": "Should fill most of container"
        },
        {
            "name": "Large container with short text",
            "text": "Welcome",
            "container": (800, 200),
            "expected": "Should be large to fill space"
        },
        {
            "name": "Title in typical container",
            "text": "Quarterly Business Review",
            "container": (800, 150),
            "expected": "Should be large and readable"
        },
        {
            "name": "Long text in small container",
            "text": "This is a very long piece of text that needs to fit in a small container and will likely wrap to multiple lines",
            "container": (300, 100),
            "expected": "Should wrap and use smaller size"
        },
        {
            "name": "Single word in square container",
            "text": "SUCCESS",
            "container": (200, 200),
            "expected": "Should be very large"
        },
        {
            "name": "Paragraph in body container",
            "text": "Our company has achieved remarkable growth this quarter. Revenue is up 45% year-over-year, and we've expanded into three new markets.",
            "container": (600, 300),
            "expected": "Should be readable body size"
        }
    ]

    results = []

    for test in test_cases:
        result = adaptive_font_sizer.find_optimal_size(
            text=test["text"],
            container_width=test["container"][0],
            container_height=test["container"][1],
            font_family="Inter",
            padding_x=10,
            padding_y=5
        )

        print(f"{test['name']}:")
        print(f"  Text: '{test['text'][:40]}...'")
        print(f"  Container: {test['container'][0]}x{test['container'][1]}px")
        print(f"  Calculated size: {result.font_size}px")
        print(f"  Iterations: {result.iterations}")
        print(f"  Lines: {result.estimated_lines}")
        print(f"  Confidence: {result.confidence:.2f}")
        print(f"  Expected: {test['expected']}")

        # Check for issues
        issues = []
        if result.font_size == 16:
            issues.append("⚠️ Size is exactly 16 (possible hardcoded default)")
        if result.font_size < 8:
            issues.append("⚠️ Very small size")
        if result.iterations == 0:
            issues.append("⚠️ No iterations (not adapting)")

        if issues:
            print(f"  Issues: {', '.join(issues)}")
        else:
            print(f"  ✅ No issues detected")

        print()

        results.append({
            "test": test["name"],
            "size": result.font_size,
            "iterations": result.iterations,
            "confidence": result.confidence
        })

    return results


def test_no_hardcoded_limits():
    """Verify there are no hardcoded min/max limits."""
    print("\n=== TESTING FOR HARDCODED LIMITS ===\n")

    # Test extremely small container
    tiny_result = adaptive_font_sizer.find_optimal_size(
        text="Test",
        container_width=20,
        container_height=10,
        font_family="Inter",
        padding_x=2,
        padding_y=1
    )

    print(f"Tiny container (20x10): {tiny_result.font_size}px")
    if tiny_result.font_size >= 12:
        print("  ⚠️ WARNING: Size seems to have a minimum limit of 12px")
    else:
        print("  ✅ No minimum limit detected")

    # Test extremely large container
    huge_result = adaptive_font_sizer.find_optimal_size(
        text="BIG",
        container_width=2000,
        container_height=1000,
        font_family="Inter",
        padding_x=20,
        padding_y=10
    )

    print(f"Huge container (2000x1000): {huge_result.font_size}px")
    if huge_result.font_size <= 72:
        print("  ⚠️ WARNING: Size seems to have a maximum limit of 72px")
    else:
        print("  ✅ No maximum limit detected")

    # Test that different containers get different sizes
    sizes = []
    for height in [50, 100, 200, 400, 800]:
        result = adaptive_font_sizer.find_optimal_size(
            text="Test Text",
            container_width=600,
            container_height=height,
            font_family="Inter"
        )
        sizes.append(result.font_size)

    print(f"\nSizes for different heights: {sizes}")
    if len(set(sizes)) == 1:
        print("  ⚠️ WARNING: All containers got the same size!")
    else:
        print(f"  ✅ Sizes adapt to container: {min(sizes):.1f} - {max(sizes):.1f}px")


def test_role_hints():
    """Test that role hints don't create hard limits."""
    print("\n=== TESTING ROLE HINTS ===\n")

    text = "Sample Text Content"
    container = (400, 100)

    roles = ["title", "body", "caption", None]
    results = {}

    for role in roles:
        result = adaptive_font_sizer.size_with_role_hint(
            text=text,
            container_width=container[0],
            container_height=container[1],
            font_family="Inter",
            role=role
        )
        results[role or "none"] = result["fontSize"]
        print(f"Role '{role or 'none'}': {result['fontSize']}px")

    # All should be the same for the same container
    unique_sizes = len(set(results.values()))
    if unique_sizes == 1:
        print("  ✅ Role hints don't affect sizing (good!)")
    else:
        print(f"  ⚠️ Role hints creating different sizes: {results}")


def test_real_world_scenario():
    """Test with real slide component data."""
    print("\n=== TESTING REAL WORLD SCENARIO ===\n")

    # Simulate real components
    components = [
        {
            "type": "Title",
            "props": {
                "text": "2024 Annual Report",
                "width": 900,
                "height": 120,
                "fontFamily": "Inter"
            }
        },
        {
            "type": "TextBlock",
            "props": {
                "text": "Revenue increased by 45% year-over-year",
                "width": 600,
                "height": 80,
                "fontFamily": "Inter"
            }
        },
        {
            "type": "TextBlock",
            "props": {
                "text": "We have successfully expanded our operations to 15 new markets across North America and Europe, establishing partnerships with over 200 local businesses.",
                "width": 700,
                "height": 200,
                "fontFamily": "Inter"
            }
        }
    ]

    # Process components
    for comp in components:
        props = comp["props"]
        result = adaptive_font_sizer.size_with_role_hint(
            text=props["text"],
            container_width=props["width"],
            container_height=props["height"],
            font_family=props["fontFamily"],
            role=comp["type"].lower()
        )

        props["fontSize"] = result["fontSize"]
        props["metadata"] = result

    # Analyze results
    print("Component sizes:")
    for comp in components:
        props = comp["props"]
        print(f"  {comp['type']}: {props['fontSize']}px")
        print(f"    Text: '{props['text'][:50]}...'")
        print(f"    Container: {props['width']}x{props['height']}")
        print(f"    Confidence: {props['metadata']['confidence']:.2f}")
        print()

    # Check for issues
    issues = check_font_sizing_issues({"components": components})
    if issues:
        print("Issues found:")
        for issue in issues:
            print(f"  - {issue}")
    else:
        print("✅ No issues found!")


def main():
    """Run all tests."""
    print("=" * 60)
    print("ADAPTIVE FONT SIZING TEST SUITE")
    print("NO HARDCODED LIMITS - PURE CONTAINER ADAPTATION")
    print("=" * 60)

    # Enable debug logging
    import logging
    logging.basicConfig(level=logging.INFO)

    test_adaptive_sizing()
    test_no_hardcoded_limits()
    test_role_hints()
    test_real_world_scenario()

    print("\n" + "=" * 60)
    print("✅ ADAPTIVE SIZING TESTS COMPLETE")
    print("=" * 60)


if __name__ == "__main__":
    main()