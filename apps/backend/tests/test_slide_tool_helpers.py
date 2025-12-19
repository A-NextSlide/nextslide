"""Tests for slide tool helper functions."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.editing.tools.slide_tool_helpers import (
    _build_attachment_context,
    _build_chat_context,
    _detect_slide_mode_from_html,
    _extract_content_from_html,
    _extract_slide_content_for_redesign,
    _format_components_for_prompt,
    _gather_reference_images,
)
from agents.editing.tools.slide_tool_multimodal import _build_multimodal_content


def test_extract_content_from_html_strips_script_and_style():
    html = """
    <html>
      <head>
        <style>.x { color: red; }</style>
        <script>alert('x');</script>
      </head>
      <body><h1>Title</h1><p>Body</p></body>
    </html>
    """
    text = _extract_content_from_html(html)
    assert "Title" in text
    assert "Body" in text
    assert "alert" not in text
    assert "color" not in text


def test_extract_slide_content_for_redesign_includes_title_and_text():
    current_slide = {
        "title": "Sample Slide",
        "description": "Slide description",
        "components": [
            {"type": "CustomComponent", "props": {"render": "<div>Hello World</div>"}},
            {"type": "TiptapTextBlock", "props": {"text": "More text here"}},
        ],
    }
    content = _extract_slide_content_for_redesign(current_slide)
    assert "Slide Title: Sample Slide" in content
    assert "Description: Slide description" in content
    assert "Current Content:" in content
    assert "Hello World" in content
    assert "Text: More text here" in content


def test_format_components_for_prompt_handles_custom_component():
    components = [
        {"id": "bg", "type": "Background", "props": {"backgroundType": "solid"}},
        {"id": "c1", "type": "CustomComponent", "props": {"render": "<div>abc</div>"}},
    ]
    formatted = _format_components_for_prompt(components)
    assert "- Background: solid" in formatted
    assert "- CustomComponent [c1]" in formatted
    assert "HTML preview" in formatted


def test_detect_slide_mode_from_html():
    assert _detect_slide_mode_from_html("<div>Static</div>") == "static"
    assert _detect_slide_mode_from_html("<script>console.log('x')</script>") == "interactive"


def test_gather_reference_images_dedupes_and_merges():
    html = "<img src='https://cdn.example.com/slide-media/abc.png'/>"
    attachments = [
        {"url": "https://cdn.example.com/slide-media/abc.png", "mimeType": "image/png"},
        {"url": "https://cdn.example.com/slide-media/def.png", "name": "def.png"},
    ]
    images = _gather_reference_images(html, attachments)
    assert "https://cdn.example.com/slide-media/abc.png" in images
    assert "https://cdn.example.com/slide-media/def.png" in images
    assert len(images) == 2


def test_build_attachment_context():
    attachments = [{"name": "file.png", "url": "https://example.com/file.png"}]
    context = _build_attachment_context(attachments, "USER ATTACHMENTS (incorporate if relevant):")
    assert context.startswith("\n\nUSER ATTACHMENTS")
    assert "- file.png: https://example.com/file.png" in context


def test_build_chat_context():
    chat_history = [
        {"role": "user", "content": "Hello"},
        {"role": "assistant", "content": "Hi"},
    ]
    context, count = _build_chat_context(chat_history, max_messages=10)
    assert count == 2
    assert "CONVERSATION HISTORY" in context
    assert "[USER]: Hello" in context
    assert "[ASSISTANT]: Hi" in context


def test_build_multimodal_content_with_data_url():
    # 1x1 transparent PNG
    png_b64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO0Yk2sAAAAASUVORK5CYII="
    data_url = f"data:image/png;base64,{png_b64}"
    attachments = [{"url": data_url, "name": "tiny.png", "mimeType": "image/png"}]
    content = _build_multimodal_content("Prompt", attachments)
    assert content[0]["type"] == "text"
    assert any(part.get("type") == "image" for part in content)
    assert any(
        part.get("type") == "text" and "ANALYZE THIS" in part.get("text", "")
        for part in content
    )
