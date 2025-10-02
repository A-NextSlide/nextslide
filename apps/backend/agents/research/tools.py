import asyncio
from dataclasses import dataclass
from typing import List, Dict, Any, AsyncIterator, Optional, Iterable
from pydantic import BaseModel
import re

import json
from urllib.parse import urlparse

from agents.ai.clients import get_client, invoke
import logging

logger = logging.getLogger(__name__)
from agents.config import OUTLINE_OPENAI_SEARCH_MODEL, GEMINI_OUTLINE_MODEL, GEMINI_ENABLE_URL_SEARCH, USE_PERPLEXITY_FOR_RESEARCH, PERPLEXITY_RESEARCH_MODEL


@dataclass
class ResearchQuery:
    question: str
    rationale: str = ""


@dataclass
class WebPage:
    url: str
    title: str
    snippet: str


@dataclass
class ResearchFinding:
    title: str
    summary: str
    url: Optional[str] = None
    source: Optional[str] = None


class QueryDecomposer:
    """LLM-powered query decomposition tool."""

    def __init__(self, model: str = OUTLINE_OPENAI_SEARCH_MODEL) -> None:
        self.model = model

    async def decompose(self, topic: str, style_context: Optional[str] = None) -> List[ResearchQuery]:
        system = "You are a senior research strategist. Decompose topics into concrete fact-finding questions."

        # Detect educational/school context to avoid business/market questions
        topic_l = (topic or "").lower()
        style_l = (style_context or "").lower()
        educational_markers = [
            "school", "class", "teacher", "students", "student", "lesson", "lecture",
            "homework", "curriculum", "syllabus", "university", "college", "high school",
            "middle school", "elementary", "classroom", "grade"
        ]
        is_educational = any(m in topic_l for m in educational_markers) or any(m in style_l for m in educational_markers)

        if is_educational:
            user = f"""
Topic: {topic}
Style Context: {style_context or 'educational'}

Return 6-8 student-friendly research questions focused on learning outcomes. Cover:
- Definitions and key characteristics of ionic, covalent, metallic, hydrogen bonds; polar vs. nonpolar
- How bonding works (electron transfer/sharing), simple Lewis dot structures, periodic trends affecting bonding
- Properties explained by bond type (melting point, conductivity, solubility, hardness) with typical examples
- Real-world examples and everyday materials explained by these bonds (e.g., NaCl, H2O, metals, polymers)
- Visual/diagram ideas to illustrate concepts (particle models, lattices, electron pairs)
- Common misconceptions and how to address them correctly
- A simple, classroom-safe demonstration or simulation idea (with safety note if relevant)
- Short review questions to check understanding (no answers, just the questions)
""".strip()
        else:
            user = f"""
Topic: {topic}
Style Context: {style_context or 'generic'}

Return 5-8 focused questions covering:
- definitions and essentials
- notable examples/case studies
- strengths/limitations and comparisons
- recent developments and applications (2024-2025)
- risks/challenges
- best-practice frameworks or heuristics
""".strip()
        client, model_name = get_client(self.model)
        text = invoke(client, model_name, [{"role": "system", "content": system}, {"role": "user", "content": user}], response_model=None, max_tokens=600, temperature=0.3)

        # Parse lines into queries
        queries: List[ResearchQuery] = []
        for line in text.splitlines():
            line = line.strip(" -•\t")
            if not line:
                continue
            queries.append(ResearchQuery(question=line))
        # Clamp
        return queries[:8]


class WebSearcher:
    """Performs web searches via an AI model (no external SerpAPI dependency)."""

    def __init__(self, model: Optional[str] = None) -> None:
        # Prefer Perplexity when enabled and key present; else Gemini when URL search grounding is enabled; otherwise OpenAI search model
        if model:
            self.model = model
            return
        try:
            import os as _os
            has_pplx = bool(_os.getenv('PPLX_API_KEY') or _os.getenv('PERPLEXITY_API_KEY'))
        except Exception:
            has_pplx = False
        if USE_PERPLEXITY_FOR_RESEARCH and has_pplx:
            self.model = PERPLEXITY_RESEARCH_MODEL
        else:
            # Avoid choosing providers that lack API keys by preferring OpenAI search model first
            self.model = OUTLINE_OPENAI_SEARCH_MODEL

    # Pydantic schema for reliable structured outputs
    class SearchItemModel(BaseModel):
        title: str
        url: str
        snippet: str = ""

    class SearchResultsModel(BaseModel):
        items: List["WebSearcher.SearchItemModel"]

    def _normalize_allowed_domains(self, allowed_domains: Optional[Iterable[str]]) -> List[str]:
        domains: List[str] = []
        if not allowed_domains:
            return domains
        for d in allowed_domains:
            try:
                d = (d or "").strip()
                if not d:
                    continue
                # If a full URL was provided, extract hostname
                if d.startswith("http://") or d.startswith("https://"):
                    host = urlparse(d).netloc.lower()
                else:
                    host = d.lower()
                if host.startswith("www."):
                    host = host[4:]
                # Strip path if accidentally included
                host = host.split("/")[0]
                if host:
                    domains.append(host)
            except Exception:
                continue
        # Dedupe preserving order
        seen = set()
        out: List[str] = []
        for h in domains:
            if h not in seen:
                seen.add(h)
                out.append(h)
        return out

    def _host_matches_allowed(self, host: str, allowed: List[str]) -> bool:
        if not allowed:
            return True
        try:
            host = (host or "").lower()
            if host.startswith("www."):
                host = host[4:]
            for dom in allowed:
                if host == dom or host.endswith("." + dom):
                    return True
        except Exception:
            pass
        return False

    async def _search_with_model(self, query: str, per_query: int, allowed_domains: Optional[Iterable[str]] = None) -> List[WebPage]:
        try:
            client, model_name = get_client(self.model)
        except Exception:
            # If no client available (missing API keys), return no results and let callers fallback
            return []
        system = (
            "You are a web research assistant. When possible, use live web knowledge/search. "
            "Return only verifiable links and concise snippets."
        )
        normalized_allowed = self._normalize_allowed_domains(allowed_domains)
        domain_hint = (
            " Only return links whose host is in any of: " + ", ".join(normalized_allowed) + 
            ". If no results from those domains, return an empty JSON array."
        ) if normalized_allowed else ""
        user = (
            f"Find the top {per_query} recent, credible web results for: {query}.\n\n" 
            f"Respond with JSON only, no prose." + domain_hint
        )

        # Use unstructured generation and parse output to avoid provider-side file naming issues
        pages: List[WebPage] = []
        try:
            text = invoke(
                client,
                model_name,
                [{"role": "system", "content": system}, {"role": "user", "content": user + " Return a JSON array of {title, url, snippet}."}],
                response_model=None,
                max_tokens=800,
                temperature=0.2,
            )
        except Exception:
            # If the primary invocation fails (e.g., provider filesystem issue), return empty
            return []

        # Try JSON parse first
        try:
            data = json.loads(text)
            if isinstance(data, list):
                for item in data[: per_query]:
                    url = (item or {}).get("url")
                    if not url:
                        continue
                    pages.append(
                        WebPage(
                            url=url,
                            title=(item or {}).get("title", ""),
                            snippet=(item or {}).get("snippet", ""),
                        )
                    )
                if pages:
                    # Domain filter if requested
                    if normalized_allowed:
                        filtered = []
                        for p in pages:
                            try:
                                host = urlparse(p.url).netloc
                            except Exception:
                                host = ""
                            if self._host_matches_allowed(host, normalized_allowed):
                                filtered.append(p)
                        return filtered
                    return pages
        except Exception:
            pass

        # Heuristic fallback: parse lines like "- Title | URL | snippet"
        for line in text.splitlines():
            line = line.strip(" -\t")
            if not line:
                continue
            parts = [p.strip() for p in line.split("|")]
            if len(parts) >= 2 and parts[1].startswith("http"):
                title = parts[0]
                url = parts[1]
                snippet = parts[2] if len(parts) > 2 else ""
                pages.append(WebPage(url=url, title=title, snippet=snippet))
            if len(pages) >= per_query:
                break
        if pages:
            if normalized_allowed:
                filtered = []
                for p in pages:
                    try:
                        host = urlparse(p.url).netloc
                    except Exception:
                        host = ""
                    if self._host_matches_allowed(host, normalized_allowed):
                        filtered.append(p)
                return filtered
            return pages

        # Last-resort: regex extract URLs and synthesize titles/snippets
        url_matches = re.findall(r"https?://[^\s)\]\}]+", text)
        for u in url_matches[: per_query]:
            pages.append(WebPage(url=u, title="", snippet=""))
        if pages:
            return pages

        # Provider fallback: if primary model produced nothing, try OpenAI search model once
        if self.model != OUTLINE_OPENAI_SEARCH_MODEL:
            try:
                backup_client, backup_model = get_client(OUTLINE_OPENAI_SEARCH_MODEL)
                try:
                    backup_text = invoke(
                        backup_client,
                        backup_model,
                        [{"role": "system", "content": system}, {"role": "user", "content": user + " Return a JSON array of {title, url, snippet}."}],
                        response_model=None,
                        max_tokens=800,
                        temperature=0.2,
                    )
                except Exception:
                    backup_text = "[]"
                try:
                    data = json.loads(backup_text)
                    if isinstance(data, list):
                        for item in data[: per_query]:
                            url = (item or {}).get("url")
                            if not url:
                                continue
                            pages.append(WebPage(
                                url=url,
                                title=(item or {}).get("title", ""),
                                snippet=(item or {}).get("snippet", ""),
                            ))
                        if pages:
                            if normalized_allowed:
                                filtered = []
                                for p in pages:
                                    try:
                                        host = urlparse(p.url).netloc
                                    except Exception:
                                        host = ""
                                    if self._host_matches_allowed(host, normalized_allowed):
                                        filtered.append(p)
                                return filtered
                            return pages
                except Exception:
                    pass
            except Exception:
                pass

        return pages

    async def search_many(self, queries: List[ResearchQuery], per_query: int = 5, allowed_domains: Optional[Iterable[str]] = None) -> Dict[str, List[WebPage]]:
        async def run_one(q: ResearchQuery) -> tuple[str, List[WebPage]]:
            pages = await self._search_with_model(q.question, per_query, allowed_domains=allowed_domains)
            return q.question, pages

        coros = [run_one(q) for q in queries]
        pairs = await asyncio.gather(*coros, return_exceptions=False)
        return {k: v for k, v in pairs}

    async def search(self, query: str, num_results: int = 5, allowed_domains: Optional[Iterable[str]] = None):
        """Async generator API for compatibility with existing scrapers.

        Yields dicts like {"type": "search_result", "url": ..., "title": ..., "snippet": ...}
        """
        pages = await self._search_with_model(query, num_results, allowed_domains=allowed_domains)
        for p in pages:
            yield {
                "type": "search_result",
                "url": p.url,
                "title": p.title,
                "snippet": p.snippet,
            }


class PageFetcher:
    """Fetches and lightly cleans web pages (best-effort)."""

    def __init__(self) -> None:
        self._session: Optional[Any] = None

    async def _get_session(self):
        import aiohttp
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def fetch(self, url: str) -> str:
        try:
            session = await self._get_session()
            async with session.get(url, headers={"User-Agent": "slide-agent/1.0"}) as resp:
                if resp.status != 200:
                    return ""
                html = await resp.text(errors="ignore")
        except Exception:
            return ""

        # Light extraction
        try:
            from bs4 import BeautifulSoup
            soup = BeautifulSoup(html, "html.parser")
            for tag in soup(["script", "style", "noscript"]):
                tag.decompose()
            text = "\n".join(t.strip() for t in soup.get_text("\n").splitlines() if t.strip())
            return text[:20000]
        except Exception:
            return html[:10000]

    async def fetch_raw(self, url: str) -> str:
        """Fetch raw HTML without stripping tags/scripts/styles."""
        try:
            session = await self._get_session()
            async with session.get(url, headers={"User-Agent": "slide-agent/1.0"}) as resp:
                if resp.status != 200:
                    return ""
                html = await resp.text(errors="ignore")
                return html[:200000]
        except Exception:
            return ""

    async def close(self) -> None:
        if self._session and not self._session.closed:
            await self._session.close()
            self._session = None


class Summarizer:
    """LLM summarizer that extracts slide-ready facts from raw texts."""

    def __init__(self, model: str = OUTLINE_OPENAI_SEARCH_MODEL) -> None:
        self.model = model

    async def summarize(self, topic: str, docs: List[tuple[str, str]]) -> List[ResearchFinding]:
        """Summarize a set of (url, text) documents into findings."""
        if not docs:
            return []
        # Compact input
        joined = []
        budget = 16000
        total = 0
        for url, text in docs:
            chunk = (text or "")[:4000]
            total += len(chunk)
            if total > budget:
                break
            joined.append(f"SOURCE: {url}\n{chunk}")
        corpus = "\n\n".join(joined)

        system = "You extract concise, factual, slide-ready bullets. Cite years and sources when present."
        user = f"""
Topic: {topic}

From the sources below, extract 6-10 distinct findings as short bullets.
Each finding must include: a concrete fact/stat/example, year if present, and source origin (domain or publication).
Avoid duplication; prefer recent (2024-2025) info.

SOURCES:\n{corpus[:15500]}

Return as lines in the format: "- <title>: <1-2 sentence summary> (Source: <domain>)"
""".strip()
        client, model_name = get_client(self.model)
        text = invoke(client, model_name, [{"role": "system", "content": system}, {"role": "user", "content": user}], response_model=None, max_tokens=900, temperature=0.2)

        findings: List[ResearchFinding] = []
        for line in text.splitlines():
            line = line.strip()
            if not line or not line.startswith("-"):
                continue
            body = line.lstrip("- ")
            title, summary = (body.split(":", 1) + [""])[:2]
            src = None
            if "(Source:" in summary:
                try:
                    src = summary.split("(Source:", 1)[1].split(")", 1)[0].strip()
                except Exception:
                    pass
            findings.append(ResearchFinding(title=title.strip(), summary=summary.strip(), source=src))
        return findings


async def stream_research(
    topic: str,
    style_context: Optional[str],
    per_query_results: int = 5,
    allowed_domains: Optional[List[str]] = None,
) -> AsyncIterator[Dict[str, Any]]:
    """High-level streaming pipeline that yields progress updates.

    Yields dict events with type in {research_started, research_plan, research_search_results,
    research_page_fetched, research_synthesis, research_complete, research_error}.
    """
    decomposer = QueryDecomposer()
    searcher = WebSearcher()
    fetcher = PageFetcher()
    summarizer = Summarizer()

    try:
        yield {"type": "research_started", "message": "Analyzing topic and planning research"}
        queries = await decomposer.decompose(topic, style_context)
        logger.info(f"[RESEARCH] Decomposed into {len(queries)} queries")
        yield {"type": "research_plan", "queries": [q.question for q in queries]}

        results_by_query = await searcher.search_many(queries, per_query=per_query_results, allowed_domains=allowed_domains)
        total_results = sum(len(pages) for pages in results_by_query.values())
        logger.info(f"[RESEARCH] Search produced {total_results} results across {len(results_by_query)} queries")
        # Verbose terminal logging of results per query
        for q, pages in results_by_query.items():
            safe_q = (q or "").strip()
            logger.info(f"[RESEARCH] Results for: {safe_q[:160]}" + ("…" if len(safe_q) > 160 else ""))
            for idx, p in enumerate(pages):
                title = (p.title or "").strip()
                url = (p.url or "").strip()
                snippet = (p.snippet or "").replace("\n", " ").strip()
                if len(snippet) > 200:
                    snippet = snippet[:200] + "…"
                logger.info(f"  {idx+1}. {title} | {url}")
                if snippet:
                    logger.info(f"     ↳ {snippet}")
        yield {"type": "research_search_results", "results": {
            q: [{"title": p.title, "url": p.url, "snippet": p.snippet} for p in pages]
            for q, pages in results_by_query.items()
        }}

        # Fetch top pages (limit total to control bandwidth)
        fetch_pairs: List[tuple[str, str]] = []
        max_pages = 12
        for pages in results_by_query.values():
            for p in pages[:2]:  # top 2 per query
                if len(fetch_pairs) >= max_pages:
                    break
                text = await fetcher.fetch(p.url)
                if text:
                    fetch_pairs.append((p.url, text))
                    yield {"type": "research_page_fetched", "url": p.url, "chars": len(text)}
            if len(fetch_pairs) >= max_pages:
                break

        # Fallback: if fetch failed or returned empty, synthesize from search snippets/titles
        if not fetch_pairs:
            logger.info("[RESEARCH] No pages fetched; falling back to snippet-based synthesis")
            synthesized_docs: List[tuple[str, str]] = []
            # Flatten results and take up to 12 items
            flat: List[WebPage] = []
            for lst in results_by_query.values():
                flat.extend(lst)
            for p in flat[:12]:
                # Combine title + snippet to provide some substance for summarization
                snippet_text = (p.title or "").strip()
                if p.snippet:
                    snippet_text += "\n" + p.snippet.strip()
                if snippet_text:
                    synthesized_docs.append((p.url, snippet_text))
            fetch_pairs = synthesized_docs

        findings = await summarizer.summarize(topic, fetch_pairs)
        logger.info(f"[RESEARCH] Synthesized {len(findings)} findings")
        yield {"type": "research_synthesis", "count": len(findings)}
        yield {"type": "research_complete", "findings": [f.__dict__ for f in findings]}
    except Exception as e:
        yield {"type": "research_error", "error": str(e)}
    finally:
        try:
            await fetcher.close()
        except Exception:
            pass


