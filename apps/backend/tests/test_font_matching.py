"""
Tests for font name matching and availability in EnhancedFontService.
"""

import os
import sys

# Add backend to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.enhanced_font_service import EnhancedFontService


def test_match_font_name_remote_exact():
    service = EnhancedFontService()
    match = service.match_font_name("Inter", include_remote=True)
    assert match is not None
    assert "inter" in match.lower()


def test_match_font_name_empty_returns_none():
    service = EnhancedFontService()
    assert service.match_font_name("") is None
    assert service.match_font_name(None) is None


def test_available_font_ids_include_google_when_remote():
    service = EnhancedFontService()
    available = service.get_available_font_ids(include_remote=True)
    assert "inter" in available or "roboto" in available
