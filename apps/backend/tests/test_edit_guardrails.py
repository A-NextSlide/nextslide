"""Regression tests for edit-orchestrator guardrails."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.editing.orchestrator_v2 import (  # noqa: E402
    _message_explicitly_requests_global_scope,
    _message_explicitly_requests_rewrite,
    _message_reports_interactivity_bug,
)
from agents.editing.tools.slide_tool_generation import (  # noqa: E402
    _instruction_requests_full_rewrite,
)


def test_rewrite_detection_requires_explicit_language():
    assert _message_explicitly_requests_rewrite("redesign this slide")
    assert _message_explicitly_requests_rewrite("rebuild from scratch")
    assert not _message_explicitly_requests_rewrite("fix this")
    assert not _message_explicitly_requests_rewrite("make it better")


def test_global_scope_requires_explicit_scope_words():
    assert _message_explicitly_requests_global_scope("change font on all slides")
    assert _message_explicitly_requests_global_scope("update colors across the deck")
    assert not _message_explicitly_requests_global_scope("change the font")
    assert not _message_explicitly_requests_global_scope("make this title blue")


def test_interactivity_bug_detection():
    assert _message_reports_interactivity_bug("buttons don't work")
    assert _message_reports_interactivity_bug("can't click this tab")
    assert not _message_reports_interactivity_bug("change the title text")


def test_slide_tool_full_rewrite_detection_is_strict():
    assert _instruction_requests_full_rewrite("redesign this section")
    assert _instruction_requests_full_rewrite("use this reference image.png")
    assert not _instruction_requests_full_rewrite("make it better")
    assert not _instruction_requests_full_rewrite("improve the design")

