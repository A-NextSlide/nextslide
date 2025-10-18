#!/usr/bin/env python3
"""
Test script to verify shape text sizing fixes.
"""

import sys
sys.path.insert(0, '/Users/ahmed/Documents/Dev/nextslide/apps/backend')

from agents.generation.components.component_validator import ComponentValidator

def test_shape_text_padding_scaling():
    """Test that textPadding scales appropriately with box size."""
    print("\n" + "="*60)
    print("TEST 1: TextPadding Scaling for Different Box Sizes")
    print("="*60)

    validator = ComponentValidator()

    # Test case 1: Small box (840x60) - user's example
    small_shape = {
        'type': 'Shape',
        'props': {
            'width': 840,
            'height': 60,
            'hasText': True,
            'shapeType': 'rectangle',
            'texts': [{'text': 'Investment Strategy Overview', 'style': {}}]
        }
    }

    # Normalize will set appropriate textPadding
    normalized_small = validator._normalize_shape_props(small_shape)
    small_padding = normalized_small['props']['textPadding']
    small_available_height = 60 - (small_padding * 2)

    print(f"\n📦 Small Shape (840x60):")
    print(f"  textPadding: {small_padding}px")
    print(f"  Available height: {small_available_height}px (60 - {small_padding*2})")
    print(f"  Max font size possible: ~{small_available_height}px")

    # Test case 2: Large box (800x400)
    large_shape = {
        'type': 'Shape',
        'props': {
            'width': 800,
            'height': 400,
            'hasText': True,
            'shapeType': 'rectangle',
            'texts': [{'text': 'Large box text', 'style': {}}]
        }
    }

    normalized_large = validator._normalize_shape_props(large_shape)
    large_padding = normalized_large['props']['textPadding']
    large_available_height = 400 - (large_padding * 2)

    print(f"\n📦 Large Shape (800x400):")
    print(f"  textPadding: {large_padding}px")
    print(f"  Available height: {large_available_height}px (400 - {large_padding*2})")
    print(f"  Max font size possible: ~{large_available_height}px")

    # Verify scaling
    assert small_padding <= large_padding, "Small box should have <= padding than large box"
    assert small_available_height >= 40, f"Small box should have >=40px available height, got {small_available_height}px"

    print(f"\n✅ Padding scales correctly: small={small_padding}px, large={large_padding}px")
    print(f"✅ Small box has sufficient space: {small_available_height}px available")


def test_shape_font_sizing_integration():
    """Test complete font sizing for shape with text."""
    print("\n" + "="*60)
    print("TEST 2: Complete Shape Font Sizing")
    print("="*60)

    validator = ComponentValidator()

    # User's example: 840x60 box
    shape = {
        'type': 'Shape',
        'id': 'test-shape',
        'props': {
            'width': 840,
            'height': 60,
            'hasText': True,
            'shapeType': 'rectangle',
            'texts': [{'text': 'Investment Strategy Overview', 'style': {}}]
        }
    }

    # Step 1: Normalize shape props (sets textPadding)
    normalized = validator._normalize_shape_props(shape)
    text_padding = normalized['props']['textPadding']

    print(f"\n📐 Box dimensions: 840x60px")
    print(f"📦 Auto-calculated textPadding: {text_padding}px")

    # Step 2: Apply intelligent font sizing
    sized = validator._apply_intelligent_font_sizing(normalized)
    calculated_font_size = sized['props']['fontSize']

    print(f"🎯 Calculated font size: {calculated_font_size}px")

    # Verify reasonable size
    available_height = 60 - (text_padding * 2)
    print(f"📏 Available space: {available_height}px height")

    # Font size should be close to available height (with some margin for line height)
    min_expected = available_height * 0.7  # Allow for line height
    max_expected = available_height

    if min_expected <= calculated_font_size <= max_expected:
        print(f"✅ Font size is appropriate: {calculated_font_size}px (expected {min_expected:.0f}-{max_expected:.0f}px)")
    else:
        print(f"⚠️  Font size may be too {'small' if calculated_font_size < min_expected else 'large'}: {calculated_font_size}px")
        print(f"    Expected range: {min_expected:.0f}-{max_expected:.0f}px")

    # Check metadata
    metadata = sized['props'].get('metadata', {})
    print(f"\n📊 Sizing metadata:")
    print(f"  Font sizing applied: {metadata.get('fontSizingApplied', False)}")
    print(f"  Adaptive sizing: {metadata.get('adaptiveSizing', False)}")
    print(f"  Estimated lines: {metadata.get('estimatedLines', 'N/A')}")
    print(f"  Confidence: {metadata.get('confidence', 'N/A')}")

    return sized


def test_multiple_text_points_normalization():
    """Test that text points at same x position get same size."""
    print("\n" + "="*60)
    print("TEST 3: Text Point Size Normalization")
    print("="*60)

    validator = ComponentValidator()

    # Create 3 text blocks at same x position with different sizes
    components = []
    for i, (text, initial_size) in enumerate([
        ("First bullet point here", 20),
        ("Second bullet point here", 24),
        ("Third bullet point here", 22)
    ]):
        comp = {
            'type': 'TiptapTextBlock',
            'id': f'bullet-{i}',
            'props': {
                'fontSize': initial_size,
                'position': {'x': 100, 'y': 200 + (i * 70)},
                'width': 840,
                'height': 60,
                'texts': [{'text': text, 'fontSize': initial_size, 'style': {}}]
            }
        }
        components.append(comp)

    print("\n📝 Before normalization:")
    for comp in components:
        print(f"  {comp['id']}: {comp['props']['fontSize']}px")

    # Apply normalization
    normalized = validator._normalize_font_sizes_by_x_position(components)

    print("\n📝 After normalization:")
    sizes = []
    for comp in normalized:
        size = comp['props']['fontSize']
        sizes.append(size)
        print(f"  {comp['id']}: {size}px")

    # All should be same size (the maximum)
    if len(set(sizes)) == 1:
        print(f"\n✅ All bullet points normalized to {sizes[0]}px")
    else:
        print(f"\n❌ ERROR: Sizes still different: {set(sizes)}")


if __name__ == '__main__':
    test_shape_text_padding_scaling()
    test_shape_font_sizing_integration()
    test_multiple_text_points_normalization()

    print("\n" + "="*60)
    print("All Tests Complete!")
    print("="*60 + "\n")
