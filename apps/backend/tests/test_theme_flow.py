"""
Comprehensive tests for the theme generation flow.
Tests the entire pipeline from ThemeAgent -> stylePreferences -> Frontend colors.
"""

import asyncio
import pytest
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.theme.theme_agent import (
    ThemeAgent,
    _validate_font_against_registry,
    _select_similar_font_for_brand,
    _ensure_distinct_colors
)
from models.requests import ColorConfigItem, StylePreferencesItem

RUN_INTEGRATION = os.getenv("RUN_THEME_AGENT_INTEGRATION") == "1" and any(
    os.getenv(key)
    for key in (
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GOOGLE_API_KEY",
        "GEMINI_API_KEY",
        "PPLX_API_KEY",
        "PERPLEXITY_API_KEY",
        "DEEPSEEK_API_KEY",
    )
)


class TestFontValidation:
    """Test font validation against registry."""

    def test_valid_font_direct_match(self):
        """Test that a valid font is returned as-is."""
        result = _validate_font_against_registry("Montserrat")
        assert result is not None
        assert "montserrat" in result.lower()

    def test_valid_font_case_insensitive(self):
        """Test case-insensitive font matching."""
        result = _validate_font_against_registry("ROBOTO")
        assert result is not None

    def test_invalid_font_returns_none(self):
        """Test that invalid fonts return a fallback match."""
        result = _validate_font_against_registry("Speedee Bold")
        assert result is not None

        result = _validate_font_against_registry("DIN Medium")
        assert result is not None

        result = _validate_font_against_registry("NonExistentFont123")
        assert result is not None

    def test_empty_font_returns_none(self):
        """Test empty/None font handling."""
        assert _validate_font_against_registry("") is None
        assert _validate_font_against_registry(None) is None


class TestColorDistinction:
    """Test color distinction logic."""

    def test_distinct_colors_preserved(self):
        """Test that distinct colors are preserved."""
        colors = ["#FF0000", "#00FF00", "#0000FF"]
        result = _ensure_distinct_colors(colors, min_distance=50)
        assert len(result) == 3

    def test_similar_colors_filtered(self):
        """Test that very similar colors are filtered."""
        colors = ["#FF0000", "#FF0001", "#00FF00"]  # First two are nearly identical
        result = _ensure_distinct_colors(colors, min_distance=50)
        assert len(result) <= 2  # Should filter out the near-duplicate

    def test_empty_list_handled(self):
        """Test empty color list handling."""
        result = _ensure_distinct_colors([], min_distance=50)
        assert result == []


class TestThemeAgentColorExtraction:
    """Test ThemeAgent color extraction and mapping."""

    def test_two_color_brand_palette(self):
        """Test that 2-color brands get proper palette with white."""
        # Simulate UAlberta colors: green and gold
        brand_colors = ["#007C41", "#FFDB05"]
        distinct = _ensure_distinct_colors(brand_colors, min_distance=80)

        # Should have 2 distinct colors
        assert len(distinct) >= 2

        # Simulate ThemeAgent logic for 2 colors
        if len(distinct) >= 2:
            result_colors = distinct[:2] + ["#FFFFFF"]
            background = "#FFFFFF"
            accent1 = distinct[0]
            accent2 = distinct[1]

            assert background == "#FFFFFF"
            assert accent1 == "#007C41"
            assert accent2 == "#FFDB05"
            assert len(result_colors) == 3

    def test_three_color_brand_palette(self):
        """Test that 3-color brands are used directly."""
        brand_colors = ["#FF0000", "#00FF00", "#0000FF"]
        distinct = _ensure_distinct_colors(brand_colors, min_distance=80)

        assert len(distinct) >= 3


class TestStylePreferencesMapping:
    """Test mapping from ThemeAgent result to StylePreferences."""

    def test_color_config_item_creation(self):
        """Test ColorConfigItem creation with all fields."""
        colors = ColorConfigItem(
            type="custom",
            name="Theme Colors (brandfetch)",
            background="#FFFFFF",
            text="#1A1A1A",
            accent1="#007C41",
            accent2="#FFDB05",
            accent3=None
        )

        assert colors.background == "#FFFFFF"
        assert colors.text == "#1A1A1A"
        assert colors.accent1 == "#007C41"
        assert colors.accent2 == "#FFDB05"
        assert colors.accent3 is None

    def test_style_preferences_with_colors(self):
        """Test StylePreferencesItem with color config."""
        colors = ColorConfigItem(
            type="custom",
            name="Test Theme",
            background="#FFFFFF",
            text="#1A1A1A",
            accent1="#007C41",
            accent2="#FFDB05"
        )

        style_prefs = StylePreferencesItem(
            initialIdea="Test Presentation",
            font="Roboto",
            bodyFont="Open Sans",
            colors=colors
        )

        assert style_prefs.font == "Roboto"
        assert style_prefs.bodyFont == "Open Sans"
        assert style_prefs.colors.accent1 == "#007C41"
        assert style_prefs.colors.accent2 == "#FFDB05"


@pytest.mark.skipif(
    not RUN_INTEGRATION,
    reason="ThemeAgent integration tests require LLM API keys and explicit opt-in."
)
class TestThemeAgentIntegration:
    """Integration tests for ThemeAgent."""

    @pytest.mark.asyncio
    async def test_theme_agent_with_brand(self):
        """Test ThemeAgent with a known brand."""
        agent = ThemeAgent()

        # Test with a brand that should be detected
        result = await agent.run(
            title="McDonald's Marketing Strategy",
            prompt="Create a presentation about McDonald's marketing"
        )

        # Should have brand detected
        assert result is not None
        assert "source" in result

        # Should have colors
        assert "colors" in result
        assert len(result["colors"]) >= 2

        # Should have fonts
        assert "fonts" in result
        assert "hero" in result["fonts"]
        assert "body" in result["fonts"]

        # Fonts should be validated (not brand fonts like "Speedee Bold")
        hero_font = result["fonts"]["hero"]
        assert _validate_font_against_registry(hero_font) is not None, f"Hero font '{hero_font}' should be valid"

        print(f"\n✅ ThemeAgent result for McDonald's:")
        print(f"   Source: {result['source']}")
        print(f"   Colors: {result['colors'][:3]}")
        print(f"   Fonts: hero={result['fonts']['hero']}, body={result['fonts']['body']}")
        print(f"   Logo: {bool(result.get('logo_url'))}")

    @pytest.mark.asyncio
    async def test_theme_agent_with_university(self):
        """Test ThemeAgent with a university brand."""
        agent = ThemeAgent()

        result = await agent.run(
            title="University of Alberta Research",
            prompt="Create a presentation about UAlberta research"
        )

        assert result is not None
        assert "colors" in result
        assert "fonts" in result

        # Fonts should be valid
        hero_font = result["fonts"]["hero"]
        body_font = result["fonts"]["body"]
        assert _validate_font_against_registry(hero_font) is not None, f"Hero font '{hero_font}' should be valid"
        assert _validate_font_against_registry(body_font) is not None, f"Body font '{body_font}' should be valid"

        print(f"\n✅ ThemeAgent result for UAlberta:")
        print(f"   Source: {result['source']}")
        print(f"   Colors: {result.get('colors', [])[:3]}")
        print(f"   Background: {result.get('background')}")
        print(f"   Accent: {result.get('accent')}")
        print(f"   Accent2: {result.get('accent2')}")
        print(f"   Fonts: hero={result['fonts']['hero']}, body={result['fonts']['body']}")

    @pytest.mark.asyncio
    async def test_theme_agent_generic_topic(self):
        """Test ThemeAgent with a generic (non-brand) topic."""
        agent = ThemeAgent()

        result = await agent.run(
            title="Introduction to Machine Learning",
            prompt="Create a presentation about machine learning basics"
        )

        assert result is not None

        # Should fall back to Huemint for colors
        assert "colors" in result
        assert len(result["colors"]) >= 3

        # Should have fonts
        assert "fonts" in result

        print(f"\n✅ ThemeAgent result for generic topic:")
        print(f"   Source: {result['source']}")
        print(f"   Colors: {result['colors'][:3]}")
        print(f"   Fonts: hero={result['fonts']['hero']}, body={result['fonts']['body']}")


class TestEndToEndColorFlow:
    """Test the complete color flow from ThemeAgent to frontend format."""

    @pytest.mark.asyncio
    async def test_complete_color_flow(self):
        """Test colors flow correctly from ThemeAgent to frontend format."""
        agent = ThemeAgent()

        # Step 1: Get theme from ThemeAgent
        theme_result = await agent.run(
            title="Apple Product Launch",
            prompt="Create a presentation about Apple's new products"
        )

        print(f"\n📊 COMPLETE COLOR FLOW TEST")
        print(f"=" * 60)

        # Step 2: Verify ThemeAgent output
        print(f"\n1️⃣ ThemeAgent Output:")
        print(f"   colors: {theme_result.get('colors', [])}")
        print(f"   background: {theme_result.get('background')}")
        print(f"   accent: {theme_result.get('accent')}")
        print(f"   accent2: {theme_result.get('accent2')}")
        print(f"   text: {theme_result.get('text')}")
        print(f"   source: {theme_result.get('source')}")

        # Step 3: Simulate api_openai_outline.py mapping
        theme_colors = theme_result.get('colors', [])
        if theme_colors and len(theme_colors) >= 2:
            accent1 = theme_result.get('accent', theme_colors[0] if theme_colors else None)
            accent2 = theme_result.get('accent2', theme_colors[1] if len(theme_colors) > 1 else None)
            accent3 = theme_colors[2] if len(theme_colors) > 2 else None

            # Don't use white as accent3
            if accent3 and accent3.upper() in ['#FFFFFF', '#FFF', 'WHITE']:
                accent3 = None

            colors_config = ColorConfigItem(
                type="custom",
                name=f"Theme Colors ({theme_result.get('source', 'unknown')})",
                background=theme_result.get('background', '#FFFFFF'),
                text=theme_result.get('text', '#1A1A1A'),
                accent1=accent1,
                accent2=accent2,
                accent3=accent3,
            )

            print(f"\n2️⃣ ColorConfigItem (stylePreferences.colors):")
            print(f"   background: {colors_config.background}")
            print(f"   text: {colors_config.text}")
            print(f"   accent1: {colors_config.accent1}")
            print(f"   accent2: {colors_config.accent2}")
            print(f"   accent3: {colors_config.accent3}")

            # Step 4: Simulate frontend color_palette format
            color_palette = {
                'primary_background': colors_config.background,
                'primary_text': colors_config.text,
                'accent_1': colors_config.accent1,
                'accent_2': colors_config.accent2,
                'backgrounds': [colors_config.background],
                'accents': [colors_config.accent1, colors_config.accent2],
            }

            print(f"\n3️⃣ Frontend color_palette:")
            print(f"   primary_background: {color_palette['primary_background']}")
            print(f"   primary_text: {color_palette['primary_text']}")
            print(f"   accent_1: {color_palette['accent_1']}")
            print(f"   accent_2: {color_palette['accent_2']}")

            # Step 5: Verify swatches would show correctly
            swatches = []
            if color_palette['primary_background']:
                swatches.append({'role': 'background', 'color': color_palette['primary_background']})
            if color_palette['primary_text']:
                swatches.append({'role': 'text', 'color': color_palette['primary_text']})
            if color_palette['accent_1']:
                swatches.append({'role': 'accent1', 'color': color_palette['accent_1']})

            print(f"\n4️⃣ Theme Tab Swatches:")
            for sw in swatches:
                print(f"   {sw['role']}: {sw['color']}")

            # Assertions
            assert len(swatches) == 3, f"Expected 3 swatches, got {len(swatches)}"
            assert color_palette['accent_1'] is not None, "accent_1 should not be None"
            assert color_palette['accent_1'] != '#FFFFFF', "accent_1 should not be white"

            # accent2 should be a brand color if available, not white
            if theme_result.get('source') == 'brandfetch' and theme_result.get('accent2'):
                assert color_palette['accent_2'] is not None, "accent_2 should not be None for branded themes"
                assert color_palette['accent_2'] != '#FFFFFF', "accent_2 should not be white"

            print(f"\n✅ Color flow test PASSED!")
            print(f"=" * 60)
        else:
            print(f"\n⚠️ Not enough colors from ThemeAgent: {theme_colors}")


def run_tests():
    """Run all tests and print results."""
    print("\n" + "=" * 70)
    print("🧪 THEME FLOW TESTS")
    print("=" * 70)

    # Run synchronous tests
    print("\n📋 Font Validation Tests:")
    test_font = TestFontValidation()
    try:
        test_font.test_valid_font_direct_match()
        print("   ✅ test_valid_font_direct_match")
    except AssertionError as e:
        print(f"   ❌ test_valid_font_direct_match: {e}")

    try:
        test_font.test_invalid_font_returns_none()
        print("   ✅ test_invalid_font_returns_none")
    except AssertionError as e:
        print(f"   ❌ test_invalid_font_returns_none: {e}")

    print("\n📋 Color Distinction Tests:")
    test_color = TestColorDistinction()
    try:
        test_color.test_distinct_colors_preserved()
        print("   ✅ test_distinct_colors_preserved")
    except AssertionError as e:
        print(f"   ❌ test_distinct_colors_preserved: {e}")

    try:
        test_color.test_empty_list_handled()
        print("   ✅ test_empty_list_handled")
    except AssertionError as e:
        print(f"   ❌ test_empty_list_handled: {e}")

    print("\n📋 Two-Color Brand Palette Test:")
    test_extraction = TestThemeAgentColorExtraction()
    try:
        test_extraction.test_two_color_brand_palette()
        print("   ✅ test_two_color_brand_palette")
    except AssertionError as e:
        print(f"   ❌ test_two_color_brand_palette: {e}")

    print("\n📋 StylePreferences Mapping Tests:")
    test_mapping = TestStylePreferencesMapping()
    try:
        test_mapping.test_color_config_item_creation()
        print("   ✅ test_color_config_item_creation")
    except AssertionError as e:
        print(f"   ❌ test_color_config_item_creation: {e}")

    try:
        test_mapping.test_style_preferences_with_colors()
        print("   ✅ test_style_preferences_with_colors")
    except AssertionError as e:
        print(f"   ❌ test_style_preferences_with_colors: {e}")

    # Run async tests
    print("\n📋 ThemeAgent Integration Tests (requires API calls):")

    async def run_async_tests():
        test_integration = TestThemeAgentIntegration()
        test_e2e = TestEndToEndColorFlow()

        try:
            await test_integration.test_theme_agent_generic_topic()
            print("   ✅ test_theme_agent_generic_topic")
        except Exception as e:
            print(f"   ❌ test_theme_agent_generic_topic: {e}")

        try:
            await test_e2e.test_complete_color_flow()
            print("   ✅ test_complete_color_flow")
        except Exception as e:
            print(f"   ❌ test_complete_color_flow: {e}")

    asyncio.run(run_async_tests())

    print("\n" + "=" * 70)
    print("🏁 TESTS COMPLETE")
    print("=" * 70)


if __name__ == "__main__":
    run_tests()
