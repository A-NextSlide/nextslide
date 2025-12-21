"""
Tests for stylePreferences merge behavior in deck creation.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.requests.deck_create import merge_style_preferences_into_outline


def test_merge_sets_style_preferences_when_missing():
    outline = {"id": "deck-1"}
    request_style = {
        "font": "Inter",
        "slideMode": "outline",
        "referenceImages": ["img1"],
    }

    merge_style_preferences_into_outline(outline, request_style)

    assert outline["stylePreferences"] == request_style


def test_merge_fills_missing_keys_without_overwriting():
    outline = {
        "id": "deck-1",
        "stylePreferences": {
            "font": "Existing",
            "referenceImages": ["keep"],
            "slideMode": "text",
        },
    }
    request_style = {
        "font": "New",
        "bodyFont": "Body",
        "slideMode": "outline",
        "referenceImages": ["new"],
        "enableResearch": True,
        "logoUrlDark": "https://example.com/logo-dark.png",
        "deck_theme": {"name": "Theme"},
    }

    merge_style_preferences_into_outline(outline, request_style)

    style = outline["stylePreferences"]
    assert style["font"] == "Existing"
    assert style["referenceImages"] == ["keep"]
    assert style["slideMode"] == "text"
    assert style["bodyFont"] == "Body"
    assert style["enableResearch"] is True
    assert style["logoUrlDark"] == "https://example.com/logo-dark.png"
    assert style["deck_theme"] == {"name": "Theme"}


def test_merge_replaces_empty_values():
    outline = {
        "id": "deck-1",
        "stylePreferences": {
            "referenceImages": [],
            "colors": {},
            "bodyFont": "",
        },
    }
    request_style = {
        "referenceImages": ["img1"],
        "colors": {"background": "#ffffff"},
        "bodyFont": "Body",
    }

    merge_style_preferences_into_outline(outline, request_style)

    style = outline["stylePreferences"]
    assert style["referenceImages"] == ["img1"]
    assert style["colors"] == {"background": "#ffffff"}
    assert style["bodyFont"] == "Body"
