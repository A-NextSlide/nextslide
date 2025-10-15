#!/usr/bin/env python3
"""
Test script to verify proximity-based font normalization with median sizing.
"""

import sys
sys.path.insert(0, '/Users/ahmed/Documents/Dev/nextslide/apps/backend')

from agents.generation.components.component_validator import ComponentValidator

def test_proximity_based_normalization():
    """Test that nearby elements get normalized to median size."""
    print("\n" + "="*60)
    print("TEST 1: Proximity-Based Font Normalization (Median)")
    print("="*60)

    validator = ComponentValidator()

    # Create 5 bullet points at same x, close y positions, with varying sizes
    components = []
    base_x = 100
    base_y = 200
    sizes = [20, 22, 24, 23, 21]  # Median should be 22

    for i, size in enumerate(sizes):
        comp = {
            'type': 'TiptapTextBlock',
            'id': f'bullet-{i}',
            'props': {
                'fontSize': size,
                'position': {'x': base_x, 'y': base_y + (i * 70)},  # 70px apart vertically
                'width': 800,
                'height': 50,
                'texts': [{'text': f'Bullet point {i+1}', 'fontSize': size, 'style': {}}]
            }
        }
        components.append(comp)

    print(f"\n📝 Input sizes: {sizes}")
    print(f"📊 Expected median: 22px")
    print(f"\n🔍 Before normalization:")
    for comp in components:
        print(f"  {comp['id']}: {comp['props']['fontSize']}px at x={comp['props']['position']['x']}, y={comp['props']['position']['y']}")

    # Apply normalization
    normalized = validator._normalize_font_sizes_by_x_position(components)

    print(f"\n✨ After normalization:")
    final_sizes = []
    for comp in normalized:
        size = comp['props']['fontSize']
        final_sizes.append(size)
        print(f"  {comp['id']}: {size}px")

    # Verify all are the same (median)
    if len(set(final_sizes)) == 1:
        print(f"\n✅ All normalized to {final_sizes[0]}px (median: 22px expected)")
        if final_sizes[0] == 22:
            print("✅ Correctly using median size!")
        else:
            print(f"⚠️  Using {final_sizes[0]}px instead of median 22px")
    else:
        print(f"\n❌ ERROR: Sizes still different: {set(final_sizes)}")


def test_distant_elements_not_grouped():
    """Test that elements far apart don't get grouped together."""
    print("\n" + "="*60)
    print("TEST 2: Distant Elements NOT Grouped")
    print("="*60)

    validator = ComponentValidator()

    # Create 2 groups: one at top (y=200), one at bottom (y=500)
    components = []

    # Top group (3 elements)
    for i in range(3):
        comp = {
            'type': 'TiptapTextBlock',
            'id': f'top-{i}',
            'props': {
                'fontSize': 20 + i,  # 20, 21, 22 - median 21
                'position': {'x': 100, 'y': 200 + (i * 60)},
                'width': 800,
                'height': 50,
                'texts': [{'text': f'Top point {i+1}', 'style': {}}]
            }
        }
        components.append(comp)

    # Bottom group (3 elements) - far away (y=500+)
    for i in range(3):
        comp = {
            'type': 'TiptapTextBlock',
            'id': f'bottom-{i}',
            'props': {
                'fontSize': 28 + i,  # 28, 29, 30 - median 29
                'position': {'x': 100, 'y': 500 + (i * 60)},
                'width': 800,
                'height': 50,
                'texts': [{'text': f'Bottom point {i+1}', 'style': {}}]
            }
        }
        components.append(comp)

    print("\n🔍 Before normalization:")
    for comp in components:
        print(f"  {comp['id']}: {comp['props']['fontSize']}px at y={comp['props']['position']['y']}")

    # Apply normalization
    normalized = validator._normalize_font_sizes_by_x_position(components)

    print("\n✨ After normalization:")
    top_sizes = []
    bottom_sizes = []
    for comp in normalized:
        size = comp['props']['fontSize']
        y = comp['props']['position']['y']
        print(f"  {comp['id']}: {size}px at y={y}")
        if y < 400:
            top_sizes.append(size)
        else:
            bottom_sizes.append(size)

    # Verify groups are separate
    top_median = 21
    bottom_median = 29

    if len(set(top_sizes)) == 1 and len(set(bottom_sizes)) == 1:
        print(f"\n✅ Top group: {top_sizes[0]}px (expected median: {top_median}px)")
        print(f"✅ Bottom group: {bottom_sizes[0]}px (expected median: {bottom_median}px)")
        if top_sizes[0] != bottom_sizes[0]:
            print("✅ Groups correctly kept separate!")
        else:
            print("❌ ERROR: Groups incorrectly merged!")
    else:
        print(f"\n❌ ERROR: Groups not properly normalized")


def test_letter_spacing_in_sizing():
    """Test that letter spacing is accounted for in font calculations."""
    print("\n" + "="*60)
    print("TEST 3: Letter Spacing Accounted For")
    print("="*60)

    from services.adaptive_font_sizer import adaptive_font_sizer

    # Use a WIDTH-constrained container (tall but narrow single line)
    # This forces the font to be limited by width, making letter spacing critical
    text = "Short Test"  # 10 characters (short to fit on one line)

    # Test with no letter spacing - baseline
    result_no_spacing = adaptive_font_sizer.size_with_role_hint(
        text=text,
        container_width=150,  # Narrow width
        container_height=100,  # Tall height (so height isn't the constraint)
        font_family="Inter",
        role="body",
        padding_x=5,
        padding_y=5,
        letter_spacing=0
    )

    # Test with positive letter spacing (wider) - adds significant width
    # With 10 chars and +6px spacing, we add (10-1)*6 = 54px extra width
    result_positive_spacing = adaptive_font_sizer.size_with_role_hint(
        text=text,
        container_width=150,
        container_height=100,
        font_family="Inter",
        role="body",
        padding_x=5,
        padding_y=5,
        letter_spacing=6  # 6px between chars
    )

    # Test with negative letter spacing (tighter) - reduces width
    # With 10 chars and -2px spacing, we save (10-1)*2 = 18px
    result_negative_spacing = adaptive_font_sizer.size_with_role_hint(
        text=text,
        container_width=150,
        container_height=100,
        font_family="Inter",
        role="body",
        padding_x=5,
        padding_y=5,
        letter_spacing=-2  # Tighter
    )

    print(f"\n📏 Text: '{text}' ({len(text)} chars)")
    print(f"📦 Container: 150x100px (140x90 after padding) - WIDTH constrained")
    print(f"\n📏 No letter spacing: {result_no_spacing['fontSize']}px")
    print(f"📏 Positive spacing (+6px): {result_positive_spacing['fontSize']}px")
    print(f"   → Adds {(len(text)-1) * 6}px extra width, should reduce font")
    print(f"📏 Negative spacing (-2px): {result_negative_spacing['fontSize']}px")
    print(f"   → Saves {(len(text)-1) * 2}px width, should increase font")

    # With positive spacing, font should be smaller (to fit wider text)
    # With negative spacing, font should be larger (text is tighter)
    if result_positive_spacing['fontSize'] < result_no_spacing['fontSize']:
        diff = result_no_spacing['fontSize'] - result_positive_spacing['fontSize']
        print(f"\n✅ Positive letter spacing reduces font size by {diff}px (correct!)")
    else:
        print(f"\n❌ Expected positive spacing to reduce font size")

    if result_negative_spacing['fontSize'] > result_no_spacing['fontSize']:
        diff = result_negative_spacing['fontSize'] - result_no_spacing['fontSize']
        print(f"✅ Negative letter spacing increases font size by {diff}px (correct!)")
    else:
        print(f"❌ Expected negative spacing to increase font size")


if __name__ == '__main__':
    test_proximity_based_normalization()
    test_distant_elements_not_grouped()
    test_letter_spacing_in_sizing()

    # Quick manual test of letter spacing at low level
    print("\n" + "="*60)
    print("MANUAL TEST: Direct _test_size with letter spacing")
    print("="*60)

    from services.adaptive_font_sizer import adaptive_font_sizer

    text = "Test"
    font_size = 30
    font_family = "Inter"
    max_width = 100
    max_height = 50

    # Test without letter spacing
    fits1, lines1, width1, height1 = adaptive_font_sizer._test_size(
        text, font_size, font_family, max_width, max_height, letter_spacing=0
    )
    print(f"\nNo spacing: width={width1:.1f}px, fits={fits1}")

    # Test with positive letter spacing
    fits2, lines2, width2, height2 = adaptive_font_sizer._test_size(
        text, font_size, font_family, max_width, max_height, letter_spacing=5
    )
    print(f"+5px spacing: width={width2:.1f}px, fits={fits2}")
    print(f"  → Width increased by {width2 - width1:.1f}px (expected ~15px for 4 chars)")

    # Test with negative letter spacing
    fits3, lines3, width3, height3 = adaptive_font_sizer._test_size(
        text, font_size, font_family, max_width, max_height, letter_spacing=-2
    )
    print(f"-2px spacing: width={width3:.1f}px, fits={fits3}")
    print(f"  → Width decreased by {width1 - width3:.1f}px (expected ~6px for 4 chars)")

    print("\n" + "="*60)
    print("All Tests Complete!")
    print("="*60 + "\n")
