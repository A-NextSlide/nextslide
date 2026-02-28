"""Tests for analytics sanitization in AI client tracking."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.ai.clients import (  # noqa: E402
    _estimate_input_tokens_for_analytics,
    _sanitize_for_analytics,
    _sanitize_messages_for_analytics,
)


def test_sanitize_for_analytics_omits_binary_dict_values():
    payload = {"data": "a" * 2000, "ok": "value"}
    out = _sanitize_for_analytics(payload)
    assert out["data"].startswith("[omitted-binary:")
    assert out["ok"] == "value"


def test_sanitize_messages_for_analytics_omits_inline_image_data():
    messages = [
        {
            "role": "user",
            "content": [
                {"type": "text", "text": "hello"},
                {
                    "type": "image",
                    "source": {"type": "base64", "media_type": "image/jpeg", "data": "b" * 10000},
                },
            ],
        }
    ]
    out = _sanitize_messages_for_analytics(messages)
    image_part = out[0]["content"][1]
    assert image_part["source"]["data"].startswith("[omitted-binary:")


def test_estimated_tokens_ignore_large_base64_payloads():
    huge = "x" * 400_000
    messages = [
        {
            "role": "user",
            "content": [{"type": "image", "source": {"type": "base64", "data": huge}}],
        }
    ]
    est = _estimate_input_tokens_for_analytics("system", messages)
    assert est < 500
