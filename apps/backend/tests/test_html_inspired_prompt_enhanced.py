"""
Tests for Enhanced HTML-Inspired Prompt System

Tests verify:
1. Theme color usage (primary, secondary, accent)
2. Spacing rules (tight bullets, proper margins)
3. Icon integration
4. Component usage
5. Caching effectiveness
6. Section organization
"""

import pytest
import json
import re
from agents.prompts.generation.html_inspired_system_prompt_enhanced import (
    get_html_inspired_system_prompt_enhanced
)


class TestEnhancedPromptStructure:
    """Test the enhanced prompt has all required sections"""

    def test_prompt_contains_theme_color_section(self):
        """Verify theme color system section exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "THEME COLOR SYSTEM" in prompt
        assert "primary" in prompt.lower()
        assert "secondary" in prompt.lower()
        assert "accent" in prompt.lower()
        assert "NEVER HARDCODED COLORS" in prompt

    def test_prompt_contains_spacing_rules(self):
        """Verify spacing rules section exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "SPACING & LAYOUT RULES" in prompt
        assert "24-32px" in prompt  # Tight bullet spacing
        assert "60-80px" not in prompt or "was 60-80px" in prompt.lower()  # Old spacing removed or marked

    def test_prompt_contains_icon_guidance(self):
        """Verify icon usage section exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "ICON USAGE" in prompt
        assert "Icon" in prompt  # Icon component
        assert "check-circle" in prompt or "arrow-right" in prompt  # Icon examples

    def test_prompt_contains_all_components(self):
        """Verify all component types are documented"""
        prompt = get_html_inspired_system_prompt_enhanced()

        required_components = [
            "Background",
            "TiptapTextBlock",
            "Lines",
            "Shape",
            "Image",
            "Chart",
            "CustomComponent",
            "ReactBits",
            "Icon"
        ]

        for component in required_components:
            assert component in prompt, f"Missing component: {component}"

    def test_prompt_has_section_hierarchy(self):
        """Verify proper section organization with visual separators"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Check for section separators
        assert "═══" in prompt  # Main section separators
        assert "━━━" in prompt  # Sub-section separators

        # Count major sections (should have multiple)
        major_sections = prompt.count("═══════")
        assert major_sections >= 5, "Should have at least 5 major sections"


class TestThemeColorUsage:
    """Test theme color guidelines are comprehensive"""

    def test_color_placeholder_syntax(self):
        """Verify theme color placeholders are documented"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should show {{primary}}, {{secondary}}, {{accent}} syntax
        assert "{{primary}}" in prompt
        assert "{{secondary}}" in prompt
        assert "{{accent}}" in prompt

    def test_tiptap_color_examples(self):
        """Verify TiptapTextBlock color usage examples"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should have example of rich text formatting with colors
        assert '"textColor"' in prompt
        assert '"highlight"' in prompt
        assert '"backgroundColor"' in prompt

    def test_forbids_hardcoded_colors(self):
        """Verify prompt explicitly forbids hardcoded colors"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "#3B82F6" in prompt  # Should mention as example of what NOT to do
        assert "NEVER" in prompt or "❌" in prompt

    def test_customcomponent_theme_props(self):
        """Verify CustomComponent uses theme props"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "props.primaryColor" in prompt
        assert "props.secondaryColor" in prompt
        assert "props.accentColor" in prompt or "props.textColor" in prompt


class TestSpacingAndLayout:
    """Test spacing rules are clearly defined"""

    def test_bullet_spacing_reduced(self):
        """Verify bullet spacing is 24-32px, not 60-80px"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should specify tight spacing
        assert "24-32px" in prompt or "24px" in prompt or "32px" in prompt

        # Should NOT recommend loose spacing without context
        if "60px" in prompt or "80px" in prompt:
            # If mentioned, should be in context of sections, not bullets
            assert "between sections" in prompt.lower() or "edge margins" in prompt.lower()

    def test_indentation_hierarchy(self):
        """Verify indentation levels are specified"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "120px" in prompt  # Level 1
        assert "160px" in prompt  # Level 2
        assert "200px" in prompt  # Level 3
        assert "indent" in prompt.lower() or "indentation" in prompt.lower()

    def test_positioning_examples(self):
        """Verify positioning examples show Y-coordinate spacing"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should have examples showing tight stacking
        # Looking for patterns like y=300, y=332, y=364
        y_coordinates = re.findall(r'"y":\s*(\d+)', prompt)
        assert len(y_coordinates) >= 3, "Should have multiple Y-coordinate examples"


class TestIconIntegration:
    """Test icon usage is well-documented"""

    def test_icon_component_structure(self):
        """Verify Icon component structure is documented"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert '"type": "Icon"' in prompt
        assert '"icon":' in prompt
        assert '"color":' in prompt

    def test_icon_use_cases(self):
        """Verify icon use cases are specified"""
        prompt = get_html_inspired_system_prompt_enhanced()

        use_cases = [
            "bullet point",
            "section",
            "status",
            "indicator"
        ]

        # At least some use cases should be mentioned
        found = sum(1 for case in use_cases if case in prompt.lower())
        assert found >= 2, "Should mention at least 2 icon use cases"

    def test_icon_sizes(self):
        """Verify icon sizing guidelines"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should mention icon sizes like 24px, 32px, 40px
        assert "24" in prompt or "32" in prompt or "40" in prompt


class TestComponentExamples:
    """Test all components have clear examples"""

    def test_lines_use_start_end_points(self):
        """Verify Lines component uses startPoint/endPoint"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "startPoint" in prompt
        assert "endPoint" in prompt
        assert '"x":' in prompt and '"y":' in prompt

        # Should explicitly say NOT to use position/width
        if "position" in prompt and "Lines" in prompt:
            # Should have warning context
            assert "NOT" in prompt or "NEVER" in prompt or "❌" in prompt

    def test_tiptap_rich_formatting_example(self):
        """Verify TiptapTextBlock has rich formatting example"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert '"texts"' in prompt  # Array of text segments
        assert '"style"' in prompt
        assert '"bold"' in prompt or '"italic"' in prompt

    def test_customcomponent_react_create_element(self):
        """Verify CustomComponent uses React.createElement"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "React.createElement" in prompt
        assert "MANDATORY" in prompt or "MUST" in prompt

        # Should warn against JSX or HTML strings
        assert "NO JSX" in prompt or "NO HTML" in prompt or prompt.count("❌") > 0


class TestSlideTypePatterns:
    """Test slide type patterns are comprehensive"""

    def test_has_title_slide_pattern(self):
        """Verify title slide pattern exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "TITLE SLIDE" in prompt.upper() or "TITLE:" in prompt.upper()
        assert "200-300pt" in prompt or "200-350pt" in prompt  # Hero size

    def test_has_content_slide_pattern(self):
        """Verify content slide pattern exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "CONTENT SLIDE" in prompt.upper() or "CONTENT:" in prompt.upper()
        assert "bullet" in prompt.lower()

    def test_has_stat_slide_pattern(self):
        """Verify stat slide pattern exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "STAT SLIDE" in prompt.upper() or "STAT:" in prompt.upper()
        assert "count-up" in prompt or "ReactBits" in prompt

    def test_has_chart_slide_pattern(self):
        """Verify chart/data slide pattern exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "CHART" in prompt or "DATA" in prompt
        assert "Chart" in prompt  # Component name


class TestDesignQuality:
    """Test design quality guidelines"""

    def test_has_design_checklist(self):
        """Verify design checklist exists"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "checklist" in prompt.lower() or "verify" in prompt.lower()
        assert "✅" in prompt  # Checkmarks for checklist items

    def test_emphasizes_professional_design(self):
        """Verify professional design emphasis"""
        prompt = get_html_inspired_system_prompt_enhanced()

        quality_terms = ["Apple", "Behance", "professional", "stunning", "elite"]
        found = sum(1 for term in quality_terms if term.lower() in prompt.lower())
        assert found >= 2, "Should emphasize high-quality design"

    def test_minimal_boxes_philosophy(self):
        """Verify minimal boxes design philosophy"""
        prompt = get_html_inspired_system_prompt_enhanced()

        assert "minimal" in prompt.lower() or "sparingly" in prompt.lower()
        assert "Shape" in prompt  # Should mention when to use Shape
        assert "callout" in prompt.lower() or "highlight" in prompt.lower()


class TestPromptLength:
    """Test prompt is comprehensive but not excessive"""

    def test_prompt_is_substantial(self):
        """Verify prompt is detailed enough"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should be at least 10KB for comprehensive guidance
        assert len(prompt) >= 10000, "Prompt should be comprehensive"

    def test_prompt_is_not_excessive(self):
        """Verify prompt is not too long for caching"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should be under 50KB to be reasonable for caching
        assert len(prompt) <= 50000, "Prompt should not be excessive"

    def test_prompt_is_cacheable(self):
        """Verify prompt structure is suitable for caching"""
        prompt = get_html_inspired_system_prompt_enhanced()

        # Should be well-structured with clear sections
        major_sections = prompt.count("═══════")
        assert major_sections >= 5, "Should have multiple major sections for organization"


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])
