"""
Firecrawl Agent Service

Routes extraction requests to:
- Perplexity (research/synthesis)
- Firecrawl Agent (multi-page/search/navigation)
- Firecrawl Scrape (single-page extraction)

Also supports optional video scraping fallback after agent runs.
"""

from __future__ import annotations

import asyncio
import json
import os
import threading
import time
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Literal, Tuple

import requests

from setup_logging_optimized import get_logger
from services.firecrawl_service import get_firecrawl_service

logger = get_logger(__name__)

RouteType = Literal["perplexity", "firecrawl_agent", "firecrawl_scrape"]


@dataclass
class ExtractRequest:
    query: str
    url: Optional[str] = None
    urls: Optional[List[str]] = None
    schema: Optional[Dict[str, Any]] = None
    max_credits: int = 60
    include_videos: bool = False
    route_hint: Optional[RouteType] = None
    max_chars: int = 3000
    timeout_seconds: int = 120


@dataclass
class ExtractResult:
    success: bool
    route: RouteType
    reason: str
    text: str = ""
    data: Any = None
    citations: List[str] = field(default_factory=list)
    source_urls: List[str] = field(default_factory=list)
    credits_used: Optional[int] = None
    error: Optional[str] = None
    videos: List[Dict[str, Any]] = field(default_factory=list)


@dataclass
class RouteDecision:
    route: RouteType
    reason: str


class FirecrawlAgentService:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None) -> None:
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY")
        self.base_url = (base_url or os.getenv("FIRECRAWL_API_BASE_URL") or "https://api.firecrawl.dev").rstrip("/")

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _perplexity_available(self) -> bool:
        return bool(os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY"))

    def _normalize_query(self, query: str) -> str:
        return (query or "").strip().lower()

    def _coerce_urls(self, url: Optional[str], urls: Optional[List[str]]) -> List[str]:
        out: List[str] = []
        if url:
            out.append(url)
        if urls:
            out.extend([u for u in urls if u])
        # Dedupe preserving order
        seen = set()
        deduped: List[str] = []
        for u in out:
            if u not in seen:
                seen.add(u)
                deduped.append(u)
        return deduped

    def _contains_any(self, text: str, keywords: List[str]) -> bool:
        return any(k in text for k in keywords)

    def _looks_like_multi_page(self, query: str) -> bool:
        multi_page_keywords = [
            "case study", "case studies", "customer", "customers", "testimonials",
            "reviews", "press", "newsroom", "blog", "posts", "articles",
            "careers", "jobs", "team", "leadership", "partners",
            "resources", "guides", "docs", "documentation",
            "pricing", "plans", "tiers", "compare", "comparison", "vs", "versus",
            "investors", "funding", "youtube", "channel", "videos",
        ]
        return self._contains_any(query, multi_page_keywords)

    def _looks_like_search_task(self, query: str) -> bool:
        search_keywords = [
            "find", "lookup", "search for", "get investors", "investor",
            "youtube channel", "official channel", "crunchbase",
            "compare", "comparison", "vs", "versus", "pricing",
            "customer stories", "case studies", "press", "newsroom",
        ]
        return self._contains_any(query, search_keywords)

    def _looks_like_research(self, query: str) -> bool:
        research_keywords = [
            "overview", "explain", "what is", "how does", "history",
            "trends", "market", "report", "analysis", "current", "latest",
            "news", "synthesis", "education", "lesson", "curriculum",
        ]
        return self._contains_any(query, research_keywords)

    def route_request(self, req: ExtractRequest) -> RouteDecision:
        query = self._normalize_query(req.query)
        urls = self._coerce_urls(req.url, req.urls)
        has_url = bool(urls)

        if req.route_hint:
            return RouteDecision(route=req.route_hint, reason="Route hint provided")

        if has_url:
            if self._looks_like_multi_page(query):
                route: RouteType = "firecrawl_agent"
                reason = "URL provided with multi-page intent"
            else:
                route = "firecrawl_scrape"
                reason = "URL provided (single-page extraction)"
        else:
            if self._looks_like_search_task(query):
                route = "firecrawl_agent"
                reason = "Search/navigation task"
            elif self._looks_like_research(query):
                route = "perplexity"
                reason = "General research/synthesis"
            else:
                route = "perplexity"
                reason = "Default to research/synthesis"

        has_firecrawl = self.is_configured()
        has_perplexity = self._perplexity_available()

        if route in ("firecrawl_agent", "firecrawl_scrape") and not has_firecrawl and has_perplexity:
            return RouteDecision(route="perplexity", reason=f"{reason} (Firecrawl unavailable)")

        if route == "perplexity" and not has_perplexity and has_firecrawl:
            fallback = "firecrawl_scrape" if has_url and not self._looks_like_multi_page(query) else "firecrawl_agent"
            return RouteDecision(route=fallback, reason=f"{reason} (Perplexity unavailable)")

        return RouteDecision(route=route, reason=reason)

    async def extract(self, req: ExtractRequest) -> ExtractResult:
        decision = self.route_request(req)
        route = decision.route
        reason = decision.reason

        if route == "perplexity":
            result = await self._extract_with_perplexity(req, reason)
        elif route == "firecrawl_scrape":
            result = await self._extract_with_scrape(req, reason)
        else:
            result = await self._extract_with_agent(req, reason)

        if req.include_videos and result.videos:
            result.text = self._append_videos(result.text, result.videos, req.max_chars)

        if req.include_videos and not result.videos:
            video_url = self._pick_video_url(req, result.data)
            if video_url:
                videos = await self._fetch_videos(video_url)
                if videos:
                    result.videos = videos
                    result.text = self._append_videos(result.text, videos, req.max_chars)

        return result

    def extract_sync(self, req: ExtractRequest) -> ExtractResult:
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            return asyncio.run(self.extract(req))

        result: Dict[str, ExtractResult] = {}

        def runner() -> None:
            result["value"] = asyncio.run(self.extract(req))

        thread = threading.Thread(target=runner, daemon=True)
        thread.start()
        thread.join()
        return result.get("value") or ExtractResult(
            success=False,
            route="firecrawl_agent",
            reason="Async execution failed",
            error="Failed to run async extraction",
        )

    async def _extract_with_agent(self, req: ExtractRequest, reason: str) -> ExtractResult:
        if not self.is_configured():
            return ExtractResult(
                success=False,
                route="firecrawl_agent",
                reason=reason,
                error="FIRECRAWL_API_KEY not configured",
            )

        urls = self._coerce_urls(req.url, req.urls)
        prompt = req.query or "Extract key information."
        if req.schema:
            prompt += "\nReturn JSON that matches the provided schema."

        def run_agent_sync() -> Dict[str, Any]:
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload: Dict[str, Any] = {
                "prompt": prompt,
                "maxCredits": req.max_credits,
            }
            if urls:
                payload["urls"] = urls
            if req.schema:
                payload["schema"] = req.schema

            start_resp = requests.post(
                f"{self.base_url}/v2/agent",
                json=payload,
                headers=headers,
                timeout=30,
            )
            if start_resp.status_code != 200:
                return {"success": False, "error": f"Start failed: {start_resp.status_code} - {start_resp.text}"}

            start_data = start_resp.json()
            if not start_data.get("success"):
                return {"success": False, "error": start_data.get("error", "Unknown error")}

            job_id = start_data.get("id")
            if not job_id:
                return {"success": False, "error": "Missing job id"}

            poll_interval = 3
            deadline = time.time() + max(30, req.timeout_seconds)
            while time.time() < deadline:
                time.sleep(poll_interval)
                status_resp = requests.get(
                    f"{self.base_url}/v2/agent/{job_id}",
                    headers=headers,
                    timeout=30,
                )
                if status_resp.status_code != 200:
                    continue
                status = status_resp.json()
                state = status.get("status", "unknown")
                if state == "completed":
                    return {
                        "success": True,
                        "data": status.get("data"),
                        "creditsUsed": status.get("creditsUsed"),
                        "sources": status.get("sources") or status.get("urls") or status.get("links"),
                    }
                if state == "failed":
                    return {"success": False, "error": status.get("error", "Agent failed")}

            return {"success": False, "error": "Timeout waiting for agent"}

        raw = await asyncio.to_thread(run_agent_sync)
        if not raw.get("success"):
            return ExtractResult(
                success=False,
                route="firecrawl_agent",
                reason=reason,
                error=raw.get("error", "Agent failed"),
            )

        data = raw.get("data")
        videos = self._extract_videos_from_data(data)
        text = self._coerce_to_text(data)
        text = self._truncate(text, req.max_chars)
        citations = self._coerce_citations(raw.get("sources"))
        if urls and not citations:
            citations = urls

        return ExtractResult(
            success=True,
            route="firecrawl_agent",
            reason=reason,
            text=text,
            data=data,
            citations=citations,
            source_urls=urls,
            credits_used=raw.get("creditsUsed"),
            videos=videos,
        )

    async def _extract_with_scrape(self, req: ExtractRequest, reason: str) -> ExtractResult:
        svc = get_firecrawl_service()
        if not svc.is_configured():
            return ExtractResult(
                success=False,
                route="firecrawl_scrape",
                reason=reason,
                error="FIRECRAWL_API_KEY not configured",
            )

        urls = self._coerce_urls(req.url, req.urls)
        if not urls:
            return ExtractResult(
                success=False,
                route="firecrawl_scrape",
                reason=reason,
                error="No URL provided for scrape",
            )
        url = urls[0]

        if req.schema:
            prompt = req.query or "Extract key information."
            prompt += "\nReturn JSON that matches the provided schema."
            json_res = await asyncio.to_thread(svc.extract_json, url, prompt)
            if json_res.get("success"):
                data = json_res.get("data", {})
                text = self._coerce_to_text(data)
                text = self._truncate(text, req.max_chars)
                return ExtractResult(
                    success=True,
                    route="firecrawl_scrape",
                    reason=reason,
                    text=text,
                    data=data,
                    citations=[url],
                    source_urls=[url],
                )

        scrape_res = await asyncio.to_thread(svc.scrape, url, ["markdown", "metadata"])
        if not scrape_res.get("success"):
            return ExtractResult(
                success=False,
                route="firecrawl_scrape",
                reason=reason,
                error=scrape_res.get("error", "Scrape failed"),
            )

        data = scrape_res.get("data") or scrape_res
        videos = self._extract_videos_from_data(data)
        markdown = ""
        title = ""
        if isinstance(data, dict):
            markdown = data.get("markdown") or ""
            metadata = data.get("metadata") or {}
            if isinstance(metadata, dict):
                title = metadata.get("title") or metadata.get("ogTitle") or ""

        text = (title + "\n\n" + markdown).strip() if title else markdown
        text = self._truncate(text, req.max_chars)

        return ExtractResult(
            success=True,
            route="firecrawl_scrape",
            reason=reason,
            text=text,
            data=data,
            citations=[url],
            source_urls=[url],
            videos=videos,
        )

    async def _extract_with_perplexity(self, req: ExtractRequest, reason: str) -> ExtractResult:
        if not self._perplexity_available():
            return ExtractResult(
                success=False,
                route="perplexity",
                reason=reason,
                error="Perplexity API key not configured",
            )

        from agents.ai.clients import get_client

        prompt = req.query or "Provide a concise, sourced summary."
        system_prompt = (
            "You are a research assistant. Provide accurate, current information with clear facts. "
            "Include citations where possible."
        )

        def run_perplexity_sync() -> Tuple[str, List[str]]:
            client, _model = get_client("perplexity-sonar", wrap_with_instructor=False)
            response = client.chat.completions.create(
                model="sonar",
                messages=[
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt},
                ],
                max_tokens=3000,
                extra_body={
                    "return_citations": True,
                    "search_recency_filter": "month",
                },
            )
            content = response.choices[0].message.content
            citations: List[str] = []
            if hasattr(response, "citations"):
                for cit in response.citations:
                    if isinstance(cit, str):
                        citations.append(cit)
                    elif isinstance(cit, dict):
                        citations.append(cit.get("url", str(cit)))
            return content, citations

        try:
            content, citations = await asyncio.to_thread(run_perplexity_sync)
        except Exception as e:
            return ExtractResult(
                success=False,
                route="perplexity",
                reason=reason,
                error=str(e),
            )

        text = self._truncate(content, req.max_chars)
        return ExtractResult(
            success=True,
            route="perplexity",
            reason=reason,
            text=text,
            data={"content": content, "citations": citations},
            citations=citations,
        )

    def _coerce_citations(self, sources: Any) -> List[str]:
        if not sources:
            return []
        if isinstance(sources, list):
            return [s for s in sources if isinstance(s, str)]
        if isinstance(sources, str):
            return [sources]
        return []

    def _coerce_to_text(self, data: Any) -> str:
        if data is None:
            return ""
        if isinstance(data, str):
            return data.strip()
        if isinstance(data, dict):
            for key in ("text", "content", "markdown", "summary", "description"):
                val = data.get(key)
                if isinstance(val, str) and val.strip():
                    return val.strip()
            items = self._extract_items(data)
            if items:
                return self._format_items(items)
            return json.dumps(data, indent=2, ensure_ascii=True)
        if isinstance(data, list):
            return self._format_items(data)
        return str(data)

    def _extract_videos_from_data(self, data: Any) -> List[Dict[str, Any]]:
        videos: List[Dict[str, Any]] = []
        if isinstance(data, dict):
            for key in ("videos", "video_urls", "videoUrls", "video_links", "videoLinks"):
                val = data.get(key)
                if isinstance(val, list):
                    for item in val:
                        if isinstance(item, str):
                            videos.append({"url": item})
                        elif isinstance(item, dict):
                            url = item.get("url") or item.get("link") or item.get("embed_url")
                            if url:
                                payload = dict(item)
                                payload.setdefault("url", url)
                                videos.append(payload)
            items = self._extract_items(data) or []
            for item in items:
                if isinstance(item, dict):
                    url = item.get("video_url") or item.get("video") or item.get("embed_url")
                    if url:
                        videos.append({"url": url, "title": item.get("title")})
        elif isinstance(data, list):
            for item in data:
                if isinstance(item, dict):
                    url = item.get("video_url") or item.get("video") or item.get("embed_url")
                    if url:
                        videos.append({"url": url, "title": item.get("title")})
        return videos

    def _extract_items(self, data: Dict[str, Any]) -> Optional[List[Any]]:
        for key in ("items", "results", "entries", "case_studies", "videos", "data"):
            val = data.get(key)
            if isinstance(val, list):
                return val
        return None

    def _format_items(self, items: List[Any]) -> str:
        lines: List[str] = []
        for item in items[:10]:
            if isinstance(item, dict):
                title = item.get("title") or item.get("name") or item.get("label") or ""
                desc = item.get("summary") or item.get("description") or item.get("details") or ""
                url = item.get("url") or item.get("link") or ""
                parts = [p for p in [title, desc] if p]
                if not parts:
                    parts = [json.dumps(item, ensure_ascii=True)]
                line = "• " + ": ".join(parts[:2])
                if url:
                    line += f" ({url})"
                lines.append(line)
            else:
                lines.append(f"• {item}")
        return "\n".join(lines).strip()

    def _truncate(self, text: str, max_chars: int) -> str:
        if not text or max_chars <= 0:
            return text
        if len(text) <= max_chars:
            return text
        return text[:max_chars].rstrip() + "\n\n[Truncated]"

    def _pick_video_url(self, req: ExtractRequest, data: Any) -> Optional[str]:
        urls = self._coerce_urls(req.url, req.urls)
        if urls:
            return urls[0]
        if isinstance(data, dict):
            for key in ("source_url", "url", "site", "domain"):
                val = data.get(key)
                if isinstance(val, str) and val:
                    return val
            items = self._extract_items(data) or []
            for item in items:
                if isinstance(item, dict):
                    url = item.get("url") or item.get("link")
                    if url:
                        return url
        return None

    async def _fetch_videos(self, url: str) -> List[Dict[str, Any]]:
        try:
            from services.video_scraper_service import scrape_website_videos
            result = await scrape_website_videos(url, max_videos=5, use_browser=True)
            if result.success and result.videos:
                return [v.to_dict() for v in result.videos]
        except Exception as e:
            logger.warning(f"[FirecrawlAgent] Video fallback failed: {e}")
        return []

    def _append_videos(self, text: str, videos: List[Dict[str, Any]], max_chars: int) -> str:
        if not videos:
            return text
        lines = ["Videos:"]
        for video in videos[:5]:
            title = video.get("title") or "Untitled"
            url = video.get("url") or video.get("embed_url") or ""
            line = f"- {title}"
            if url:
                line += f" ({url})"
            lines.append(line)
        combined = (text + "\n\n" + "\n".join(lines)).strip() if text else "\n".join(lines)
        return self._truncate(combined, max_chars)


_singleton: Optional[FirecrawlAgentService] = None


def get_firecrawl_agent_service() -> FirecrawlAgentService:
    global _singleton
    if _singleton is None:
        _singleton = FirecrawlAgentService()
    return _singleton
