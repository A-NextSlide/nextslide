import base64
import os
import sys

import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.generation.file_processor import FileProcessor
from services.outline.generator_flow import OutlineGeneratorFlowMixin
from services.outline.models import OutlineOptions
from services.outline import generator_flow as generator_flow_module


class _DummyFlow(OutlineGeneratorFlowMixin):
    pass


@pytest.mark.asyncio
async def test_file_processor_decodes_base64_text_and_includes_rich_excerpt():
    source_text = ("Key project requirement from source document.\n" * 500).strip()
    b64_text = base64.b64encode(source_text.encode("utf-8")).decode("utf-8")

    processor = FileProcessor()
    processed = await processor.process_files(
        [
            {
                "name": "requirements.txt",
                "type": "text/plain",
                "content": b64_text,
            }
        ],
        prompt="Create slides from uploaded notes only.",
    )

    assert len(processed["documents"]) == 1
    document = processed["documents"][0]
    assert document["full_length"] == len(source_text)
    assert document["content"].startswith("Key project requirement")

    file_context = processed["file_context"]
    assert "DOCUMENTS (PRIMARY SOURCE MATERIAL)" in file_context
    assert "Source excerpt:" in file_context
    assert file_context.count("Key project requirement") > 20


@pytest.mark.asyncio
async def test_research_decision_prefers_rich_user_context(monkeypatch):
    async def _mock_should_research(prompt, style_context):
        return True, ["latest trend"], "Model predicted research needed"

    monkeypatch.setattr(generator_flow_module, "should_research", _mock_should_research)

    options = OutlineOptions(
        prompt="A" * 1800,
        style_context="Use uploaded notes and keep factual.",
        files=[{"name": "notes.txt", "type": "text/plain"}],
    )
    processed_files = {
        "documents": [
            {
                "format": "text",
                "full_length": 9000,
                "content": "B" * 9000,
            }
        ]
    }

    enabled, queries, reason = await _DummyFlow()._resolve_research_decision(options, processed_files)
    assert enabled is False
    assert queries == []
    assert "Rich prompt/files" in reason


@pytest.mark.asyncio
async def test_research_decision_keeps_research_for_time_sensitive_requests(monkeypatch):
    async def _mock_should_research(prompt, style_context):
        return True, ["latest market share"], "Prompt is time-sensitive"

    monkeypatch.setattr(generator_flow_module, "should_research", _mock_should_research)

    options = OutlineOptions(
        prompt="Use these notes and include the latest market share numbers as of today.",
        style_context="Executive summary deck",
        files=[{"name": "notes.txt", "type": "text/plain"}],
    )
    processed_files = {
        "documents": [
            {
                "format": "text",
                "full_length": 9000,
                "content": "B" * 9000,
            }
        ]
    }

    enabled, queries, reason = await _DummyFlow()._resolve_research_decision(options, processed_files)
    assert enabled is True
    assert queries == ["latest market share"]
    assert "time-sensitive" in reason.lower() or "research" in reason.lower()
