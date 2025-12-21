import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.outline.file_processing_utils import (
    append_pptx_titles_to_prompt,
    filter_assistant_files,
    scan_files,
)


def test_scan_files_detects_pptx_images_and_assistant_eligibility():
    files = [
        {"name": "deck.pptx", "type": "application/vnd.ms-powerpoint"},
        {"name": "photo.png", "type": "image/png"},
        {"name": "data.csv", "type": "text/csv"},
        {"name": "report.pdf", "type": "application/pdf"},
    ]

    scan = scan_files(files)

    assert scan.has_images is True
    assert len(scan.pptx_files) == 1
    assert scan.assistant_eligible is True


def test_filter_assistant_files_excludes_images_and_pptx():
    files = [
        {"name": "deck.pptx", "type": "application/vnd.ms-powerpoint"},
        {"name": "photo.png", "type": "image/png"},
        {"name": "data.csv", "type": "text/csv"},
        {"name": "report.pdf", "type": "application/pdf"},
    ]

    filtered = filter_assistant_files(files)
    names = {f["name"] for f in filtered}

    assert "photo.png" not in names
    assert "deck.pptx" not in names
    assert "data.csv" in names
    assert "report.pdf" in names


def test_append_pptx_titles_to_prompt():
    prompt = "Build a deck"
    outlines = [{"slides": [{"title": "Intro"}, {"title": "Agenda"}]}]

    updated = append_pptx_titles_to_prompt(prompt, outlines)

    assert "PPTX Slides Detected" in updated
    assert "- Intro" in updated
    assert "- Agenda" in updated
