"""Tests for preserving existing CustomComponent theme values."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.editing.tools.html_utils import (  # noqa: E402
    apply_theme_to_custom_component_html,
    extract_theme_from_custom_component_html,
)


def test_extract_theme_from_custom_component_html():
    html = """
    <style>
      :root {
        --accent: #123456;
        --text: #f3f3f3;
        --bg: #101010;
        --font-heading: 'Sora', sans-serif;
        --font-body: 'DM Sans', sans-serif;
      }
    </style>
    """
    colors, typography = extract_theme_from_custom_component_html(html, {})

    assert colors.get("accent_1") == "#123456"
    assert colors.get("primary_text") == "#f3f3f3"
    assert colors.get("primary_background") == "#101010"
    assert typography.get("heading", {}).get("family") == "Sora"
    assert typography.get("body", {}).get("family") == "DM Sans"


def test_reapply_extracted_theme_to_rewrite_output():
    original_html = """
    <style>
      :root {
        --accent: #123456;
        --text: #f3f3f3;
        --bg: #101010;
        --font-heading: 'Sora', sans-serif;
        --font-body: 'DM Sans', sans-serif;
      }
    </style>
    <h1 style="font-family: 'Sora', sans-serif;">Title</h1>
    """
    rewritten_html = """
    <style>
      :root {
        --accent: #ff0000;
        --text: #222222;
        --bg: #ffffff;
        --font-heading: 'Poppins', sans-serif;
        --font-body: 'Inter', sans-serif;
      }
    </style>
    <h1 style="font-family: 'Poppins', sans-serif;">Title</h1>
    """

    colors, typography = extract_theme_from_custom_component_html(original_html, {})
    locked = apply_theme_to_custom_component_html(rewritten_html, colors, typography)

    assert "--accent: #123456;" in locked
    assert "--text: #f3f3f3;" in locked
    assert "--bg: #101010;" in locked
    assert "'Sora', sans-serif" in locked
    assert "'DM Sans', sans-serif" in locked

