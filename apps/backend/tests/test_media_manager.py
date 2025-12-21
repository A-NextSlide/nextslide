import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.outline.media_manager import MediaManager
from services.outline.models import SlideContent


def test_parse_assignments_handles_code_fence():
    manager = MediaManager()
    response = """```json
{"assignments":[{"image_index":0,"slide_ids":["s1"],"confidence":0.9}]}
```"""

    parsed = manager._parse_assignments(response)

    assert parsed is not None
    assert parsed["assignments"][0]["image_index"] == 0
    assert parsed["assignments"][0]["slide_ids"] == ["s1"]


def test_apply_assignments_tags_media():
    manager = MediaManager()
    slide = SlideContent(id="s1", title="Slide 1", content="Content")
    slides = [slide]
    images = [
        {
            "filename": "photo.png",
            "category": "slide_image",
            "interpretation": "A photo",
            "url": "https://example.com/photo.png",
        }
    ]
    assignments = {
        "assignments": [
            {"image_index": 0, "slide_ids": ["s1"], "confidence": 0.95}
        ]
    }

    manager._apply_assignments(assignments, slides, images)

    assert len(slide.taggedMedia) == 1
    tagged = slide.taggedMedia[0]
    assert tagged["filename"] == "photo.png"
    assert tagged["slideId"] == "s1"
    assert tagged["url"] == "https://example.com/photo.png"
