from typing import List, Dict, Any, Optional, Tuple
import re
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def extract_citations_from_content(content: str) -> Tuple[List[Dict[str, Any]], Dict[str, int]]:
    """Extract citations from content containing markers and a SOURCES section."""
    citations = []
    marker_map = {}
    citation_markers = set(re.findall(r'\[(\d+)\]', content))
    if not citation_markers:
        return citations, marker_map

    sources_match = re.search(r'(?:^|\n)SOURCES?:\s*\n((?:.+\n?)+)', content, re.IGNORECASE | re.MULTILINE)
    if sources_match:
        sources_text = sources_match.group(1)
        lines = sources_text.strip().split('\n')

        for line in lines:
            line = line.strip()
            if not line:
                continue

            marker_match = re.match(r'\[(\d+)\]\s*(.+)', line)
            if not marker_match:
                marker_match = re.match(r'(\d+)\.\s*(.+)', line)

            if marker_match:
                marker = marker_match.group(1)
                source_text = marker_match.group(2)
                parts = source_text.split(' - ', 1)
                title = parts[0].strip()
                url = parts[1].strip() if len(parts) > 1 else ''
                citation = {
                    'marker': int(marker),
                    'title': title,
                    'url': url
                }
                citations.append(citation)
                marker_map[marker] = len(citations) - 1

    return citations, marker_map


def _is_narrative_topic(prompt: str, slide_title: str) -> bool:
    """Defer narrative detection to the model instead of keyword rules."""
    return False
