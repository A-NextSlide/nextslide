import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from api.requests.deck_create.outline_prep import attach_uploaded_media_to_slides


def _make_outline(use_uploaded_images: bool):
    return {
        "uploadedMedia": [
            {
                "id": "m1",
                "name": "sample.png",
                "type": "image/png",
                "content": "abc123",
            }
        ],
        "use_uploaded_images": use_uploaded_images,
        "slides": [{"id": "s1", "title": "Slide 1"}],
    }


def test_attach_uploaded_media_skips_when_flag_false():
    outline = _make_outline(False)
    attach_uploaded_media_to_slides(outline)
    assert "taggedMedia" not in outline["slides"][0]


def test_attach_uploaded_media_applies_when_flag_true():
    outline = _make_outline(True)
    attach_uploaded_media_to_slides(outline)
    tagged = outline["slides"][0].get("taggedMedia") or []
    assert len(tagged) == 1
    assert tagged[0]["filename"] == "sample.png"
    assert tagged[0]["previewUrl"].startswith("data:image/png;base64,")
