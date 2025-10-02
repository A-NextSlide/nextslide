"""Research agent and tools for outline generation.

This package provides agent-style research primitives to:
- decompose a prompt into research questions
- search the web
- fetch and summarize pages
- synthesize findings into outline-ready insights

Streaming-friendly: tools yield progress dicts that can be forwarded as SSE.
"""

from .tools import (
    ResearchQuery, ResearchFinding, WebPage, QueryDecomposer,
    WebSearcher, PageFetcher, Summarizer
)
from .outline_research_agent import OutlineResearchAgent

__all__ = [
    "ResearchQuery",
    "ResearchFinding",
    "WebPage",
    "QueryDecomposer",
    "WebSearcher",
    "PageFetcher",
    "Summarizer",
    "OutlineResearchAgent",
]



