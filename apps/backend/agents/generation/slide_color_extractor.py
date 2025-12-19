"""Minimal slide color extractor (no keyword heuristics)."""

from typing import Dict, Any


class SlideColorExtractor:
    """Pass-through color extractor that returns no overrides."""

    def extract(self, slide_data: Dict[str, Any], title: str = "", content: str = "") -> Dict[str, Any]:
        return {}
