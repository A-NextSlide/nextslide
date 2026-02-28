import json
import os
import sys
from types import SimpleNamespace

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.requests import api_deck_compose_stream as compose_stream_module


class _DummySlide:
    def __init__(self, slide_id: str, title: str):
        self.id = slide_id
        self.title = title
        self.taggedMedia = []


class _DummyOutline:
    def __init__(self):
        self.title = "Test Deck"
        self.stylePreferences = None
        self.slides = [_DummySlide("slide-1", "Slide 1")]
        self.notes = {}

    def model_dump(self):
        return {
            "title": self.title,
            "slides": [{"id": s.id, "title": s.title} for s in self.slides],
            "notes": self.notes,
        }


def _decode_sse_chunk(chunk):
    text = chunk.decode("utf-8") if isinstance(chunk, bytes) else str(chunk)
    events = []
    for line in text.splitlines():
        if line.startswith("data:"):
            payload = line[5:].strip()
            if payload:
                events.append(json.loads(payload))
    return events


async def _collect_events(stream):
    events = []
    async for chunk in stream:
        events.extend(_decode_sse_chunk(chunk))
    return events


def _patch_common_deps(monkeypatch, released_locks):
    def fake_get_deck(_deck_id):
        return {
            "status": {"state": "creating"},
            "slides": [{"status": "pending"}],
            "outline": {"notes": {}},
        }

    async def fake_acquire_lock(_deck_id):
        return True

    def fake_release_lock(deck_id):
        released_locks.append(deck_id)

    async def fake_thumbnail_render(_deck_id):
        return None

    monkeypatch.setattr(compose_stream_module, "get_deck", fake_get_deck)
    monkeypatch.setattr(compose_stream_module.concurrency_manager, "acquire_deck_lock", fake_acquire_lock)
    monkeypatch.setattr(compose_stream_module.concurrency_manager, "release_deck_lock", fake_release_lock)
    monkeypatch.setattr(compose_stream_module, "_fire_thumbnail_render", fake_thumbnail_render)


@pytest.mark.asyncio
async def test_compose_stream_emits_single_end_and_completion_when_upstream_lacks_completion(monkeypatch):
    released_locks = []
    _patch_common_deps(monkeypatch, released_locks)

    async def fake_compose_deck_stream(*_args, **_kwargs):
        yield {"type": "progress", "message": "Generating"}

    monkeypatch.setattr(compose_stream_module, "compose_deck_stream", fake_compose_deck_stream)

    request = SimpleNamespace(
        deck_id="deck-test-1",
        outline=_DummyOutline(),
        force_restart=False,
        delay_between_slides=0.0,
        async_images=True,
        prefetch_images=False,
    )

    stream = compose_stream_module.create_deck_compose_stream(request, registry=SimpleNamespace(), user_id="user-1")
    events = await _collect_events(stream)
    event_types = [event.get("type") for event in events]

    assert event_types.count("composition_complete") == 1
    assert event_types.count("end") == 1
    assert released_locks == ["deck-test-1"]


@pytest.mark.asyncio
async def test_compose_stream_does_not_duplicate_upstream_completion(monkeypatch):
    released_locks = []
    _patch_common_deps(monkeypatch, released_locks)

    async def fake_compose_deck_stream(*_args, **_kwargs):
        yield {"type": "progress", "message": "Generating"}
        yield {"type": "composition_complete", "message": "Upstream complete"}

    monkeypatch.setattr(compose_stream_module, "compose_deck_stream", fake_compose_deck_stream)

    request = SimpleNamespace(
        deck_id="deck-test-2",
        outline=_DummyOutline(),
        force_restart=False,
        delay_between_slides=0.0,
        async_images=True,
        prefetch_images=False,
    )

    stream = compose_stream_module.create_deck_compose_stream(request, registry=SimpleNamespace(), user_id="user-2")
    events = await _collect_events(stream)
    event_types = [event.get("type") for event in events]

    assert event_types.count("composition_complete") == 1
    assert event_types.count("end") == 1
    assert released_locks == ["deck-test-2"]
