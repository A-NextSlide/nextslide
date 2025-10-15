#!/usr/bin/env python3
"""
Test script to verify adaptive font sizing and normalization.
"""

import sys
sys.path.insert(0, '/Users/ahmed/Documents/Dev/nextslide/apps/backend')

from agents.generation.components.component_validator import ComponentValidator
from services.adaptive_font_sizer import adaptive_font_sizer

def test_adaptive_sizing():
    """Test adaptive font sizing for a 840x60 box."""
    print("\n" + "="*60)
    print("TEST 1: Adaptive Font Sizing for 840x60 Box")
    print("="*60)

    # Test similar to user's example: 840x60 box
    result = adaptive_font_sizer.size_with_role_hint(
        text="Investment Strategy Overview",
        container_width=840,
        container_height=60,
        font_family="Inter",
        role="body",
        padding_x=10,
        padding_y=5
    )

    print(f"\n📏 Container: 840x60px")
    print(f"📝 Text: 'Investment Strategy Overview'")
    print(f"🎯 Calculated Font Size: {result['fontSize']}px")
    print(f"📊 Confidence: {result['confidence']:.2f}")
    print(f"📄 Estimated Lines: {result['estimatedLines']}")
    print(f"✅ Fits: {result['fits']}")
    print(f"🔄 Iterations: {result['iterations']}")

    # Expected: Should be much larger than 24px for this size box
    if result['fontSize'] < 30:
        print(f"\n⚠️  WARNING: Font size seems too small! Expected >30px, got {result['fontSize']}px")
    else:
        print(f"\n✅ Font size looks good!")


def test_bullet_point_normalization():
    """Test that bullet points at same x position get normalized to same size."""
    print("\n" + "="*60)
    print("TEST 2: Bullet Point Font Size Normalization")
    print("="*60)

    # Simulate 3 bullet points at same x position with different calculated sizes
    components = [
        {
            'type': 'TiptapTextBlock',
            'id': 'bullet1',
            'props': {
                'fontSize': 22,
                'position': {'x': 100, 'y': 200},
                'width': 800,
                'height': 50,
                'texts': [{'text': 'First point', 'fontSize': 22}]
            }
        },
        {
            'type': 'TiptapTextBlock',
            'id': 'bullet2',
            'props': {
                'fontSize': 24,  # Different size
                'position': {'x': 100, 'y': 270},  # Same x
                'width': 800,
                'height': 50,
                'texts': [{'text': 'Second point', 'fontSize': 24}]
            }
        },
        {
            'type': 'TiptapTextBlock',
            'id': 'bullet3',
            'props': {
                'fontSize': 20,  # Different size
                'position': {'x': 100, 'y': 340},  # Same x
                'width': 800,
                'height': 50,
                'texts': [{'text': 'Third point', 'fontSize': 20}]
            }
        },
        {
            'type': 'TiptapTextBlock',
            'id': 'title',
            'props': {
                'fontSize': 48,
                'position': {'x': 100, 'y': 50},
                'width': 800,
                'height': 80,
                'texts': [{'text': 'Title', 'fontSize': 48}],
                'metadata': {'role': 'title'}
            }
        }
    ]

    print("\n📝 BEFORE Normalization:")
    for comp in components:
        if comp['id'] != 'title':
            print(f"  {comp['id']}: {comp['props']['fontSize']}px at x={comp['props']['position']['x']}")

    # Apply normalization
    validator = ComponentValidator()
    normalized = validator._normalize_font_sizes_by_x_position(components)

    print("\n📝 AFTER Normalization:")
    bullet_sizes = []
    for comp in normalized:
        if comp['id'] != 'title':
            size = comp['props']['fontSize']
            bullet_sizes.append(size)
            print(f"  {comp['id']}: {size}px at x={comp['props']['position']['x']}")

    # Check if all bullets have same size
    if len(set(bullet_sizes)) == 1:
        print(f"\n✅ All bullet points normalized to {bullet_sizes[0]}px")
    else:
        print(f"\n❌ ERROR: Bullet points have different sizes: {set(bullet_sizes)}")
        print("   Normalization failed!")


def test_multiple_columns():
    """Test that different columns maintain different sizes."""
    print("\n" + "="*60)
    print("TEST 3: Multiple Columns (Different X Positions)")
    print("="*60)

    components = [
        # Left column bullets
        {
            'type': 'TiptapTextBlock',
            'id': 'left1',
            'props': {
                'fontSize': 22,
                'position': {'x': 100, 'y': 200},
                'width': 400,
                'height': 50,
                'texts': [{'text': 'Left point 1', 'fontSize': 22}]
            }
        },
        {
            'type': 'TiptapTextBlock',
            'id': 'left2',
            'props': {
                'fontSize': 24,
                'position': {'x': 100, 'y': 270},  # Same x as left1
                'width': 400,
                'height': 50,
                'texts': [{'text': 'Left point 2', 'fontSize': 24}]
            }
        },
        # Right column bullets (different x)
        {
            'type': 'TiptapTextBlock',
            'id': 'right1',
            'props': {
                'fontSize': 18,
                'position': {'x': 550, 'y': 200},  # Different x
                'width': 400,
                'height': 50,
                'texts': [{'text': 'Right point 1', 'fontSize': 18}]
            }
        },
        {
            'type': 'TiptapTextBlock',
            'id': 'right2',
            'props': {
                'fontSize': 20,
                'position': {'x': 550, 'y': 270},  # Same x as right1
                'width': 400,
                'height': 50,
                'texts': [{'text': 'Right point 2', 'fontSize': 20}]
            }
        }
    ]

    print("\n📝 BEFORE Normalization:")
    for comp in components:
        print(f"  {comp['id']}: {comp['props']['fontSize']}px at x={comp['props']['position']['x']}")

    # Apply normalization
    validator = ComponentValidator()
    normalized = validator._normalize_font_sizes_by_x_position(components)

    print("\n📝 AFTER Normalization:")
    left_sizes = []
    right_sizes = []
    for comp in normalized:
        size = comp['props']['fontSize']
        x = comp['props']['position']['x']
        print(f"  {comp['id']}: {size}px at x={x}")
        if x < 300:
            left_sizes.append(size)
        else:
            right_sizes.append(size)

    # Check if columns are normalized separately
    left_same = len(set(left_sizes)) == 1
    right_same = len(set(right_sizes)) == 1
    columns_different = left_sizes[0] != right_sizes[0]

    if left_same and right_same and columns_different:
        print(f"\n✅ Left column normalized to {left_sizes[0]}px")
        print(f"✅ Right column normalized to {right_sizes[0]}px")
        print(f"✅ Columns maintain different sizes")
    else:
        print(f"\n❌ ERROR: Normalization issue!")
        print(f"   Left same: {left_same}, Right same: {right_same}, Different: {columns_different}")


if __name__ == '__main__':
    test_adaptive_sizing()
    test_bullet_point_normalization()
    test_multiple_columns()
    print("\n" + "="*60)
    print("Tests Complete!")
    print("="*60 + "\n")
