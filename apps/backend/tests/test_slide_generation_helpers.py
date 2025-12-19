"""
Tests for shared slide-generation helpers and generator variants.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest

from agents.domain.models import SlideGenerationContext, ThemeSpec
from agents.generation.custom_component_enhancer import (
    CustomComponentEnhancer,
    build_custom_component_context,
    inject_theme_data,
    resolve_custom_component_layout,
)
from agents.generation.component_hints import infer_component_hints
from agents.generation.image_processing import apply_tagged_media_to_images
from models.requests import (
    ColorConfigItem,
    DeckOutline,
    ExtractedDataItem,
    ManualChartItem,
    SlideOutline,
    StylePreferencesItem,
)


def _make_context(
    *,
    extracted_data=None,
    manual_charts=None,
    style_prefs=None,
    title="Slide",
    content="Content",
):
    slide = SlideOutline(
        id="slide-1",
        title=title,
        content=content,
        extractedData=extracted_data,
        manualCharts=manual_charts,
        taggedMedia=[],
    )
    deck = DeckOutline(
        id="deck-1",
        title="Deck",
        slides=[slide],
        stylePreferences=style_prefs,
    )
    theme = ThemeSpec.from_dict({
        "color_palette": {
            "primary_background": "#FFFFFF",
            "primary_text": "#111111",
            "accent_1": "#FF0000",
            "accent_2": "#00FF00",
        },
        "typography": {
            "hero_title": {"family": "Montserrat"},
            "body_text": {"family": "Open Sans"},
        },
    })
    return SlideGenerationContext(
        slide_outline=slide,
        slide_index=0,
        deck_outline=deck,
        theme=theme,
        palette={},
        style_manifesto="",
        deck_uuid="deck-1",
    )


def test_inject_theme_data_from_style_preferences():
    colors = ColorConfigItem(
        type="custom",
        background="#FFFFFF",
        text="#111111",
        accent1="#FF0000",
        accent2="#00FF00",
    )
    style_prefs = StylePreferencesItem(
        font="Bebas Neue",
        bodyFont="Roboto",
        colors=colors,
        logoUrl="https://example.com/logo.png",
        logoUrlDark="https://example.com/logo-dark.png",
    )
    context = _make_context(style_prefs=style_prefs)

    theme_dict = inject_theme_data({}, context)
    assert theme_dict["brandInfo"]["logoUrl"] == "https://example.com/logo.png"
    assert theme_dict["brandInfo"]["logoUrlDark"] == "https://example.com/logo-dark.png"
    assert theme_dict["typography"]["hero_title"]["family"] == "Bebas Neue"
    assert theme_dict["typography"]["body_text"]["family"] == "Roboto"
    assert theme_dict["color_palette"]["accent_1"] == "#FF0000"
    assert theme_dict["color_palette"]["accent_2"] == "#00FF00"


def test_resolve_custom_component_layout_full_slide():
    context = _make_context()
    layout = resolve_custom_component_layout(context, full_slide=True)
    assert layout.width == 1920
    assert layout.height == 1080
    assert layout.position == {"x": 0, "y": 0}
    assert layout.is_full_slide is True


def test_resolve_custom_component_layout_standard_slide():
    context = _make_context()
    layout = resolve_custom_component_layout(context, full_slide=False)
    assert layout.width == 1920
    assert layout.height == 1080
    assert layout.position == {"x": 0, "y": 0}
    assert layout.is_full_slide is False


def test_build_custom_component_context_includes_charts():
    extracted_data = ExtractedDataItem(
        source="test",
        chartType="bar",
        data=[{"label": "A", "value": 1}],
    )
    manual_charts = [ManualChartItem(id="m1", chartType="line", data=[{"label": "Jan", "value": 2}])]
    context = _make_context(extracted_data=extracted_data, manual_charts=manual_charts)

    layout = resolve_custom_component_layout(context, full_slide=False)
    slide_context = build_custom_component_context(context, layout=layout, include_charts=True)
    assert slide_context["extracted_data"]["chartType"] == "bar"
    assert slide_context["manual_charts"][0]["chartType"] == "line"


@pytest.mark.asyncio
async def test_custom_component_enhancer_partial_preserves_background():
    class StubGenerator:
        def __init__(self):
            self.last_content = None

        async def generate(self, **kwargs):
            self.last_content = kwargs.get("content")
            return {"type": "CustomComponent", "props": {"render": "<div />"}}

    context = _make_context()
    slide_data = {
        "components": [
            {"type": "Background", "props": {"backgroundType": "color", "backgroundColor": "#FFFFFF"}},
            {"type": "TiptapTextBlock", "props": {"text": "Hello"}},
        ]
    }
    theme_dict = context.theme.to_dict()
    enhancer = CustomComponentEnhancer(StubGenerator(), full_slide=False)

    updated = await enhancer.enhance(
        slide_data,
        context,
        theme_dict,
        predicted_components=["CustomComponent"],
        content_override="Override content",
    )

    assert updated["components"][0]["type"] == "Background"
    assert updated["components"][1]["type"] == "CustomComponent"


@pytest.mark.asyncio
async def test_custom_component_enhancer_full_slide_replaces_all():
    class StubGenerator:
        async def generate(self, **kwargs):
            return {"type": "CustomComponent", "props": {"render": "<div />"}}

    context = _make_context()
    slide_data = {
        "components": [
            {"type": "Background", "props": {"backgroundType": "color"}},
            {"type": "TiptapTextBlock", "props": {"text": "Hello"}},
        ]
    }
    theme_dict = context.theme.to_dict()
    enhancer = CustomComponentEnhancer(StubGenerator(), full_slide=True)

    updated = await enhancer.enhance(
        slide_data,
        context,
        theme_dict,
        predicted_components=["CustomComponent"],
    )

    assert updated["components"] == [{"type": "CustomComponent", "props": {"render": "<div />"}}]


def test_apply_tagged_media_to_images_replaces_placeholder():
    slide_data = {
        "components": [
            {"type": "Image", "props": {"src": "placeholder", "alt": "test"}},
        ]
    }
    tagged_media = [
        {
            "id": "m1",
            "filename": "photo.png",
            "type": "image",
            "previewUrl": "https://example.com/photo.png",
            "interpretation": "A sample photo",
        }
    ]

    apply_tagged_media_to_images(slide_data, tagged_media)
    assert slide_data["components"][0]["props"]["src"] == "https://example.com/photo.png"
    assert slide_data["components"][0]["props"]["autoApplied"] is True


def test_component_hints_for_tabular_chart():
    extracted_data = ExtractedDataItem(
        source="test",
        chartType="bar",
        data=[{"label": "A", "value": 1, "series": "2024"}],
    )
    context = _make_context(extracted_data=extracted_data)

    hints = infer_component_hints(context)

    assert "Table" in hints
