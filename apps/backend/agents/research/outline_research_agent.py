import asyncio
from typing import Any, Dict, List, Optional, AsyncIterator

from .tools import stream_research, ResearchFinding


class OutlineResearchAgent:
    """Streams research for an outline topic and returns synthesized insights.

    Usage:
        async for event in agent.run(topic, style_context):
            yield event  # events suitable for forwarding via SSE
    """

    def __init__(self, per_query_results: int = 5) -> None:
        self.per_query_results = per_query_results

    async def run(
        self,
        topic: str,
        style_context: Optional[str] = None,
        seed_urls: Optional[list[str]] = None,
        allowed_domains: Optional[list[str]] = None,
    ) -> AsyncIterator[Dict[str, Any]]:
        # If seed URLs are provided, use them to prime allowed_domains
        domains = list(allowed_domains or [])
        try:
            if seed_urls:
                from urllib.parse import urlparse
                for u in seed_urls:
                    try:
                        host = urlparse(u).netloc
                        if host:
                            h = host.lower()
                            if h.startswith('www.'):
                                h = h[4:]
                            if h not in domains:
                                domains.append(h)
                    except Exception:
                        continue
        except Exception:
            pass

        async for event in stream_research(
            topic,
            style_context,
            per_query_results=self.per_query_results,
            allowed_domains=domains or None,
        ):
            yield event



