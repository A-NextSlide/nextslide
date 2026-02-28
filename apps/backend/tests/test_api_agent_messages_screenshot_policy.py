"""Tests for screenshot inclusion fallback policy in agent message API."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.requests.api_agent_messages import (  # noqa: E402
    _compress_screenshot_payload,
    _needs_visual_context_fallback,
)


def test_visual_context_fallback_skips_simple_text_and_style_edits():
    assert not _needs_visual_context_fallback("change title to Q4 Results")
    assert not _needs_visual_context_fallback("fix typo in subtitle")
    assert not _needs_visual_context_fallback("change font to Poppins")
    assert not _needs_visual_context_fallback("make the title color #ffffff")


def test_visual_context_fallback_includes_layout_and_visibility_issues():
    assert _needs_visual_context_fallback("move the chart to the right")
    assert _needs_visual_context_fallback("this looks misaligned")
    assert _needs_visual_context_fallback("text is cropped and I can't see it")


def test_visual_context_fallback_ambiguous_reference_depends_on_selection():
    assert _needs_visual_context_fallback("change this one") is True
    assert (
        _needs_visual_context_fallback(
            "change this one",
            selections=[{"elementId": "title-1"}],
        )
        is False
    )


def test_visual_context_fallback_image_replace_with_selection_skips_screenshot():
    assert _needs_visual_context_fallback("replace image with a skyline") is True
    assert (
        _needs_visual_context_fallback(
            "replace image with a skyline",
            selections=[{"elementId": "image-1"}],
        )
        is False
    )


def test_compress_screenshot_payload_keeps_small_payload_unchanged():
    payload = {"data": "abcd", "media_type": "image/jpeg"}
    out = _compress_screenshot_payload(payload)
    assert out == payload


def test_compress_screenshot_payload_handles_invalid_large_payload_gracefully():
    payload = {"data": "x" * 300_000, "media_type": "image/jpeg"}
    out = _compress_screenshot_payload(payload)
    assert out == payload
