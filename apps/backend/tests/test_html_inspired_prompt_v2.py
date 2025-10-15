"""
Tests for HTML-Inspired System Prompt V2 - Mode-Specific Design

Tests verify:
1. Overlap prevention section exists
2. Y-coordinate positioning formulas
3. Mode-specific spacing guidelines
4. Height estimation guide
5. Design checklist includes overlap verification
6. Mode-specific guidance includes overlap reminders
"""

import pytest
import re
from agents.prompts.generation.html_inspired_system_prompt_v2 import (
    get_html_inspired_system_prompt_v2,
    get_condensed_component_schemas,
    get_mode_specific_guidance
)


class TestOverlapPreventionSection:
    """Test the overlap prevention section is comprehensive"""

    def test_overlap_section_exists(self):
        """Verify Y-coordinate positioning section exists"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "Y-COORDINATE POSITIONING" in prompt
        assert "PREVENT OVERLAPS" in prompt
        assert "CRITICAL" in prompt

    def test_positioning_formula_present(self):
        """Verify the formula for non-overlapping layout is documented"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "Component N+1 Y position MUST be" in prompt
        assert "Component N Y position + Component N height + minimum gap" in prompt
        assert "POSITIONING FORMULA" in prompt or "Next Component Y = Current Component Y + Current Component Height + Gap" in prompt
        assert "Next Component Y = Current Component Y + Current Component Height + Gap" in prompt

    def test_minimum_gaps_specified(self):
        """Verify minimum gaps are specified for both modes"""
        prompt = get_html_inspired_system_prompt_v2()

        # Presentation mode gaps
        assert "PRESENTATION MODE" in prompt
        assert "60-80px" in prompt  # Between sections
        assert "40-60px" in prompt  # Between bullets

        # Detailed mode gaps
        assert "DETAILED MODE" in prompt
        assert "24-32px" in prompt  # Between bullets
        assert "40-60px" in prompt  # Between sections

    def test_height_estimation_guide(self):
        """Verify height estimation guide exists"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "HEIGHT ESTIMATION GUIDE" in prompt or "HEIGHT FORMULA" in prompt
        assert "fontSize 24: height" in prompt or "fontSize × 1.2" in prompt
        assert "fontSize 200" in prompt
        assert "lineHeight" in prompt

    def test_overlap_examples_present(self):
        """Verify overlap examples (right and wrong) are documented"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "EXAMPLES - PROPER VERTICAL STACKING" in prompt or "EXAMPLE CALCULATION" in prompt
        assert "NO OVERLAP" in prompt
        assert "COMMON OVERLAP MISTAKES TO AVOID" in prompt or "MISTAKE" in prompt
        assert "❌" in prompt  # Has wrong examples with X emoji
        assert "✅" in prompt  # Has correct examples with checkmark


class TestOverlapExamples:
    """Test the overlap examples are correct and comprehensive"""

    def test_presentation_mode_example(self):
        """Verify presentation mode example shows proper spacing"""
        prompt = get_html_inspired_system_prompt_v2()

        # Should have example with calculations
        assert "Example 1 - Presentation Mode Bullets (NO OVERLAP)" in prompt
        assert "340 + 48 + 50 = 438" in prompt or "Gap: 50px" in prompt
        assert "Gap:" in prompt

    def test_detailed_mode_example(self):
        """Verify detailed mode example shows tight spacing"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "Example 2 - Detailed Mode Tight Stacking (NO OVERLAP)" in prompt
        assert "Gap: 24px" in prompt or "Gap: 28px" in prompt

    def test_multi_component_example(self):
        """Verify multi-component layout example exists"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "Example 3 - Multi-Component Layout (NO OVERLAP)" in prompt
        # Should show title → chart → insights flow
        assert "Chart" in prompt
        assert "Insights" in prompt or "insights" in prompt

    def test_wrong_vs_correct_examples(self):
        """Verify wrong vs correct examples are clearly marked"""
        prompt = get_html_inspired_system_prompt_v2()

        # Should have at least 2 wrong examples and 2 correct examples
        # Now using "MISTAKE" format instead of "WRONG"
        wrong_count = prompt.count("❌ **MISTAKE") + prompt.count("❌ WRONG")
        correct_count = prompt.count("✅ **CORRECT") + prompt.count("✅ CORRECT")

        assert wrong_count >= 2, f"Should have at least 2 wrong examples, found {wrong_count}"
        assert correct_count >= 2, f"Should have at least 2 correct examples, found {correct_count}"


class TestDesignChecklistOverlaps:
    """Test design checklist includes overlap verification"""

    def test_checklist_has_overlap_section(self):
        """Verify design checklist includes overlap check"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "DESIGN CHECKLIST" in prompt
        assert "NO Y-COORDINATE OVERLAPS" in prompt or "NO OVERLAPS" in prompt

    def test_checklist_overlap_details(self):
        """Verify checklist provides specific overlap checks"""
        prompt = get_html_inspired_system_prompt_v2()

        # Should mention specific component pairs
        assert "Title + line" in prompt or "title and line" in prompt
        assert "Bullets" in prompt or "bullets" in prompt
        assert "don't overlap" in prompt or "no overlap" in prompt

    def test_checklist_mentions_height_guide(self):
        """Verify checklist references height estimation guide"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "height estimation guide" in prompt.lower() or "HEIGHT ESTIMATION" in prompt


class TestModeSpecificGuidanceOverlaps:
    """Test mode-specific guidance includes overlap reminders"""

    def test_detailed_mode_guidance_has_overlap_reminder(self):
        """Verify detailed mode guidance mentions overlaps"""
        guidance = get_mode_specific_guidance("detailed")

        assert "NO OVERLAPS" in guidance
        assert "24-32px" in guidance  # Detailed mode gap

    def test_presentation_mode_guidance_has_overlap_reminder(self):
        """Verify presentation mode guidance mentions overlaps"""
        guidance = get_mode_specific_guidance("presentation")

        assert "NO OVERLAPS" in guidance
        assert "40-60px" in guidance  # Presentation mode gap

    def test_guidance_includes_formula(self):
        """Verify mode guidance includes positioning formula"""
        detailed_guidance = get_mode_specific_guidance("detailed")
        presentation_guidance = get_mode_specific_guidance("presentation")

        # Both should have the formula or reference
        assert "Next Y" in detailed_guidance or "Current Y + Current Height" in detailed_guidance
        assert "Next Y" in presentation_guidance or "Current Y + Current Height" in presentation_guidance


class TestVerificationChecklist:
    """Test verification checklist is comprehensive"""

    def test_verification_checklist_exists(self):
        """Verify verification checklist section exists"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "VERIFICATION CHECKLIST" in prompt
        assert "Before finalizing slide layout" in prompt

    def test_checklist_has_three_step_process(self):
        """Verify checklist provides step-by-step verification"""
        prompt = get_html_inspired_system_prompt_v2()

        assert "1." in prompt  # Step 1
        assert "2." in prompt  # Step 2
        assert "3." in prompt  # Step 3
        assert "Component N ends at" in prompt
        assert "Component N+1 starts" in prompt
        assert "Adjust Component N+1 Y position" in prompt


class TestPromptStructure:
    """Test overall prompt structure and completeness"""

    def test_v2_prompt_is_comprehensive(self):
        """Verify V2 prompt is detailed enough"""
        prompt = get_html_inspired_system_prompt_v2()

        # Should be substantial with overlap section added
        assert len(prompt) >= 15000, "Prompt should be comprehensive with overlap prevention"

    def test_v2_prompt_has_all_major_sections(self):
        """Verify all major sections exist"""
        prompt = get_html_inspired_system_prompt_v2()

        required_sections = [
            "MODE-SPECIFIC DESIGN PHILOSOPHY",
            "PRESENTATION MODE",
            "DETAILED MODE",
            "THEME COLOR SYSTEM",
            "TYPOGRAPHY SYSTEM",
            "TABLE DESIGN",
            "CHART SIZING",
            "TITLE SLIDE MASTERY",
            "LAYOUT VARIETY",
            "Y-COORDINATE POSITIONING",  # New section!
            "COMPONENT-SPECIFIC RULES",
            "DESIGN CHECKLIST"
        ]

        for section in required_sections:
            assert section in prompt, f"Missing section: {section}"

    def test_condensed_schemas_are_concise(self):
        """Verify condensed schemas are actually condensed"""
        schemas = get_condensed_component_schemas()

        # Should be under 2KB for efficient caching
        assert len(schemas) < 2000, "Condensed schemas should be concise"
        assert "TypeBox Reference" in schemas
        assert "Background" in schemas
        assert "Chart" in schemas


class TestModeSpecificGuidance:
    """Test mode-specific guidance function"""

    def test_detailed_mode_guidance(self):
        """Verify detailed mode guidance is correct"""
        guidance = get_mode_specific_guidance("detailed")

        assert "DETAILED MODE ACTIVE" in guidance
        assert "Analyst Approach" in guidance
        assert "500-700px width" in guidance  # Compact charts
        assert "24-32px" in guidance  # Tight spacing
        assert "backgroundColor=null" in guidance  # Clean tables

    def test_presentation_mode_guidance(self):
        """Verify presentation mode guidance is correct"""
        guidance = get_mode_specific_guidance("presentation")

        assert "PRESENTATION MODE ACTIVE" in guidance
        assert "Behance Approach" in guidance
        assert "700-900px width" in guidance  # Medium charts
        assert "200-350pt" in guidance  # HUGE titles
        assert "Wild, creative" in guidance

    def test_mode_detection_case_insensitive(self):
        """Verify mode detection works regardless of case"""
        detailed_lower = get_mode_specific_guidance("detailed")
        detailed_upper = get_mode_specific_guidance("DETAILED")
        detailed_mixed = get_mode_specific_guidance("Detailed")

        assert detailed_lower == detailed_upper == detailed_mixed


if __name__ == "__main__":
    # Run tests
    pytest.main([__file__, "-v", "--tb=short"])
