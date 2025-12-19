"""Tests for custom component editing helpers."""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from agents.editing.tools.slide_tool_custom_components import custom_component_str_replace


def test_custom_component_str_replace_updates_render():
    current_slide = {
        "id": "slide-1",
        "components": [
            {
                "id": "comp-1",
                "type": "CustomComponent",
                "props": {"render": "<div>Old Text</div>"},
            }
        ],
    }

    diff = custom_component_str_replace(
        args={
            "slide_id": "slide-1",
            "component_id": "comp-1",
            "old_string": "Old Text",
            "new_string": "New Text",
        },
        deck_data={},
        current_slide=current_slide,
        attachments=None,
    )

    assert diff.deck_diff.slides_to_update
    slide_diff = diff.deck_diff.slides_to_update[0]
    assert slide_diff.slide_id == "slide-1"
    assert slide_diff.components_to_update
    comp_update = slide_diff.components_to_update[0]
    assert comp_update.id == "comp-1"
    assert "New Text" in comp_update.props["render"]
    assert "Old Text" not in comp_update.props["render"]
