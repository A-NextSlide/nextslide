import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.generation.custom_component_image_pipeline import _ensure_containers_have_images
from agents.generation.custom_component_image_pipeline import _should_skip_auto_image_resolution
from agents.generation.custom_component_image_pipeline import _replace_literal_placeholders_with_transparent_pixel
from agents.generation.ai_image_orchestrator import AIImageOrchestrator
from agents.generation import ai_image_orchestrator as orchestrator_module


class _DummyProvider:
    def __init__(self) -> None:
        self.is_available = True
        self.calls = 0

    async def generate_image(self, *args, **kwargs):
        self.calls += 1
        return {}


class _DummyPersistence:
    def __init__(self) -> None:
        self.updates = []

    async def update_slide(self, deck_uuid, slide_index, slide_data, force_immediate=False):
        self.updates.append((deck_uuid, slide_index, force_immediate))


def test_container_layout_without_images_stays_unchanged():
    html = """
    <!DOCTYPE html>
    <html><body>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:20px">
        <div class="card">A</div>
        <div class="card">B</div>
      </div>
    </body></html>
    """
    output = _ensure_containers_have_images(
        html,
        slide_context={"slide_index": 2, "title": "Architecture Overview"},
        content="Explain the architecture using a component diagram.",
    )
    assert output == html
    assert "src=\"placeholder\"" not in output


def test_component_first_slide_skips_auto_resolution():
    should_skip = _should_skip_auto_image_resolution(
        slide_context={
            "slide_index": 2,
            "title": "Architecture and KPI Breakdown",
            "slide_type": "content",
            "extracted_data": {"data": [{"label": "A", "value": 10}]},
        },
        content="Explain the process and compare metrics in a structured layout.",
        uploaded_media=None,
    )
    assert should_skip is True


def test_explicit_image_request_does_not_skip_auto_resolution():
    should_skip = _should_skip_auto_image_resolution(
        slide_context={
            "slide_index": 2,
            "title": "Product Launch Visuals",
            "slide_type": "content",
        },
        content="Use photos and screenshots of the product UI.",
        uploaded_media=None,
    )
    assert should_skip is False


def test_placeholder_values_can_be_neutralized_without_search():
    html = (
        '<img src="placeholder" alt="search: market chart"/>'
        "<script>const items=[{image:'placeholder'}];</script>"
    )
    updated = _replace_literal_placeholders_with_transparent_pixel(html)
    assert "placeholder" not in updated
    assert "data:image/gif;base64" in updated


@pytest.mark.asyncio
async def test_orchestrator_does_not_force_hero_image_without_placeholders(monkeypatch):
    persistence = _DummyPersistence()
    orchestrator = AIImageOrchestrator(deck_persistence=persistence)
    provider = _DummyProvider()
    orchestrator.provider = provider

    monkeypatch.setattr(orchestrator_module, "IMAGE_GENERATION_ENABLED", True)

    async def _no_custom_component_updates(*args, **kwargs):
        return False

    monkeypatch.setattr(
        orchestrator,
        "_search_and_apply_custom_component_images",
        _no_custom_component_updates,
    )

    slide_data = {
        "deck_uuid": "deck-123",
        "title": "Market Structure",
        "components": [
            {"id": "txt-1", "type": "TiptapTextBlock", "props": {"text": "Compare segments"}},
            {"id": "shape-1", "type": "Shape", "props": {"shapeType": "rect"}},
        ],
    }

    await orchestrator._process_slide("deck-123", 1, slide_data)

    assert provider.calls == 0
    assert all(component.get("type") != "Image" for component in slide_data["components"])
    assert persistence.updates == []
