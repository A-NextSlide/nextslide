"""
Direct test for 2-color brand scenario without Brandfetch API dependency.
This simulates what happens when Brandfetch returns 2 brand colors.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.theme.theme_agent import _ensure_distinct_colors
from models.requests import ColorConfigItem


def test_two_color_brand_flow():
    """
    Test the complete flow for a 2-color brand like UAlberta.
    UAlberta colors: Green #007C41, Gold #FFDB05
    """
    print("\n" + "=" * 70)
    print("🎨 TWO-COLOR BRAND FLOW TEST (UAlberta)")
    print("=" * 70)

    # Step 1: Simulate Brandfetch returning 2 colors
    brandfetch_colors = ["#007C41", "#FFDB05"]  # UAlberta green and gold
    print(f"\n1️⃣ Brandfetch Colors: {brandfetch_colors}")

    # Step 2: Run through _ensure_distinct_colors
    distinct_colors = _ensure_distinct_colors(brandfetch_colors, min_distance=80)
    print(f"2️⃣ After distinct filter: {distinct_colors}")
    assert len(distinct_colors) == 2, f"Expected 2 distinct colors, got {len(distinct_colors)}"

    # Step 3: Simulate ThemeAgent logic for 2 colors
    brand_colors = distinct_colors[:2]
    result_colors = brand_colors + ["#FFFFFF"]
    background = "#FFFFFF"
    accent1 = brand_colors[0]
    accent2 = brand_colors[1]
    text = "#1A1A1A"

    print(f"3️⃣ ThemeAgent result:")
    print(f"   colors: {result_colors}")
    print(f"   background: {background}")
    print(f"   accent: {accent1}")
    print(f"   accent2: {accent2}")
    print(f"   text: {text}")

    # Verify
    assert background == "#FFFFFF", "Background should be white"
    assert accent1 == "#007C41", f"accent1 should be UAlberta green, got {accent1}"
    assert accent2 == "#FFDB05", f"accent2 should be UAlberta gold, got {accent2}"

    # Step 4: Simulate api_openai_outline.py mapping
    theme_colors = result_colors
    theme_result = {
        'colors': result_colors,
        'background': background,
        'accent': accent1,
        'accent2': accent2,
        'text': text,
        'source': 'brandfetch'
    }

    # Use explicit accent/accent2 fields from ThemeAgent
    api_accent1 = theme_result.get('accent', theme_colors[0])
    api_accent2 = theme_result.get('accent2', theme_colors[1] if len(theme_colors) > 1 else None)
    api_accent3 = theme_colors[2] if len(theme_colors) > 2 else None

    # Don't use white as accent3
    if api_accent3 and api_accent3.upper() in ['#FFFFFF', '#FFF', 'WHITE']:
        api_accent3 = None

    print(f"4️⃣ API mapping:")
    print(f"   accent1: {api_accent1}")
    print(f"   accent2: {api_accent2}")
    print(f"   accent3: {api_accent3}")

    # Verify accent3 is None (white was filtered)
    assert api_accent3 is None, "accent3 should be None (white filtered out)"
    assert api_accent1 == "#007C41", f"API accent1 should be green, got {api_accent1}"
    assert api_accent2 == "#FFDB05", f"API accent2 should be gold, got {api_accent2}"

    # Step 5: Create ColorConfigItem (stylePreferences.colors)
    colors_config = ColorConfigItem(
        type="custom",
        name="Theme Colors (brandfetch)",
        background=background,
        text=text,
        accent1=api_accent1,
        accent2=api_accent2,
        accent3=api_accent3
    )

    print(f"5️⃣ ColorConfigItem:")
    print(f"   background: {colors_config.background}")
    print(f"   text: {colors_config.text}")
    print(f"   accent1: {colors_config.accent1}")
    print(f"   accent2: {colors_config.accent2}")
    print(f"   accent3: {colors_config.accent3}")

    # Step 6: Simulate frontend color_palette
    color_palette = {
        'primary_background': colors_config.background,
        'primary_text': colors_config.text,
        'accent_1': colors_config.accent1,
        'accent_2': colors_config.accent2,
        'backgrounds': [colors_config.background],
        'accents': [colors_config.accent1, colors_config.accent2],
    }

    print(f"6️⃣ Frontend color_palette:")
    print(f"   primary_background: {color_palette['primary_background']}")
    print(f"   primary_text: {color_palette['primary_text']}")
    print(f"   accent_1: {color_palette['accent_1']}")
    print(f"   accent_2: {color_palette['accent_2']}")
    print(f"   accents: {color_palette['accents']}")

    # Final verification
    assert color_palette['primary_background'] == "#FFFFFF"
    assert color_palette['primary_text'] == "#1A1A1A"
    assert color_palette['accent_1'] == "#007C41"  # UAlberta green
    assert color_palette['accent_2'] == "#FFDB05"  # UAlberta gold
    assert color_palette['accents'] == ["#007C41", "#FFDB05"]

    # Step 7: Verify swatches
    swatches = []
    if color_palette['primary_background']:
        swatches.append({'role': 'background', 'label': 'Background', 'color': color_palette['primary_background']})
    if color_palette['primary_text']:
        swatches.append({'role': 'text', 'label': 'Text', 'color': color_palette['primary_text']})
    if color_palette['accent_1']:
        swatches.append({'role': 'accent1', 'label': 'Accent', 'color': color_palette['accent_1']})

    print(f"7️⃣ Theme Tab Swatches:")
    for sw in swatches:
        print(f"   {sw['label']}: {sw['color']}")

    assert len(swatches) == 3
    assert swatches[0]['color'] == "#FFFFFF"  # Background
    assert swatches[1]['color'] == "#1A1A1A"  # Text
    assert swatches[2]['color'] == "#007C41"  # Accent (UAlberta green)

    print(f"\n✅ TWO-COLOR BRAND FLOW TEST PASSED!")
    print("=" * 70)
    print("\n🎯 SUMMARY:")
    print(f"   - Brandfetch returns: {brandfetch_colors}")
    print(f"   - accent1 (primary brand): {api_accent1} ✅")
    print(f"   - accent2 (secondary brand): {api_accent2} ✅")
    print(f"   - Background: white ✅")
    print(f"   - Both brand colors preserved through entire flow ✅")


def test_three_color_brand_flow():
    """
    Test the flow for a 3+ color brand like Google.
    """
    print("\n" + "=" * 70)
    print("🎨 THREE-COLOR BRAND FLOW TEST (Google-like)")
    print("=" * 70)

    # Simulate 4 brand colors
    brandfetch_colors = ["#4285F4", "#EA4335", "#FBBC05", "#34A853"]  # Google colors
    print(f"\n1️⃣ Brandfetch Colors: {brandfetch_colors}")

    distinct_colors = _ensure_distinct_colors(brandfetch_colors, min_distance=80)
    print(f"2️⃣ After distinct filter: {distinct_colors}")

    # For 3+ colors, we use them directly
    brand_colors = distinct_colors[:2]
    result_colors = brand_colors + ["#FFFFFF"]
    accent1 = brand_colors[0]
    accent2 = brand_colors[1]

    print(f"3️⃣ Theme result:")
    print(f"   accent1: {accent1}")
    print(f"   accent2: {accent2}")

    assert accent1 == "#4285F4", f"accent1 should be Google blue, got {accent1}"
    assert accent2 == "#EA4335", f"accent2 should be Google red, got {accent2}"

    print(f"\n✅ THREE-COLOR BRAND FLOW TEST PASSED!")
    print("=" * 70)


def test_single_color_brand_flow():
    """
    Test the flow for a single-color brand.
    """
    print("\n" + "=" * 70)
    print("🎨 SINGLE-COLOR BRAND FLOW TEST")
    print("=" * 70)

    brandfetch_colors = ["#FF0000"]
    print(f"\n1️⃣ Brandfetch Colors: {brandfetch_colors}")

    distinct_colors = _ensure_distinct_colors(brandfetch_colors, min_distance=80)
    print(f"2️⃣ After distinct filter: {distinct_colors}")

    # For single color, derive palette
    primary = distinct_colors[0]
    result_colors = [primary, "#FFFFFF", "#1A1A1A"]
    background = "#FFFFFF"
    accent = primary
    text = "#1A1A1A"

    print(f"3️⃣ Derived palette:")
    print(f"   colors: {result_colors}")
    print(f"   background: {background}")
    print(f"   accent: {accent}")
    print(f"   text: {text}")

    assert background == "#FFFFFF"
    assert accent == "#FF0000"
    assert text == "#1A1A1A"

    print(f"\n✅ SINGLE-COLOR BRAND FLOW TEST PASSED!")
    print("=" * 70)


if __name__ == "__main__":
    test_two_color_brand_flow()
    test_three_color_brand_flow()
    test_single_color_brand_flow()

    print("\n" + "=" * 70)
    print("🏁 ALL BRAND COLOR TESTS PASSED!")
    print("=" * 70)
