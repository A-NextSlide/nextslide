"""
Firecrawl service wrapper.

Provides simple helpers around Firecrawl Cloud SDK to:
- scrape a single URL (markdown/html/json/screenshot)
- search the web (web/images/news)
- crawl a site (optional)

If the Python SDK is unavailable, falls back to HTTP requests.

Docs: https://docs.firecrawl.dev/introduction
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class _FirecrawlService:
    def __init__(self, api_key: Optional[str] = None, base_url: Optional[str] = None):
        self.api_key = api_key or os.getenv("FIRECRAWL_API_KEY")
        # Note: Firecrawl Cloud uses a fixed base; keep for future self-hosted configs
        self.base_url = base_url or os.getenv("FIRECRAWL_API_BASE_URL") or "https://api.firecrawl.dev"
        self._sdk_available = False
        self._client = None
        try:
            from firecrawl import Firecrawl  # type: ignore
            self._SDK = Firecrawl
            self._sdk_available = True
        except Exception:
            self._SDK = None
            self._sdk_available = False

    def is_configured(self) -> bool:
        return bool(self.api_key)

    def _get_client(self):
        if not self.is_configured():
            raise ValueError("FIRECRAWL_API_KEY not configured")
        if self._sdk_available:
            if self._client is None:
                # SDK does not require base_url here for cloud
                self._client = self._SDK(api_key=self.api_key)
            return self._client
        return None

    # ----------------------------
    # High-level API
    # ----------------------------
    def scrape(self, url: str, formats: Optional[List[str]] = None, **kwargs) -> Dict[str, Any]:
        formats = formats or ["markdown"]
        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.scrape(url, formats=formats, **kwargs)
                # SDK returns a dict-like object already
                return {"success": True, "data": result.get("data") or result}
            else:
                import requests
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {"url": url, "formats": formats}
                payload.update(kwargs or {})
                resp = requests.post(f"{self.base_url}/v2/scrape", json=payload, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, dict) else {"success": True, "data": data}
        except Exception as e:
            logger.warning(f"Firecrawl scrape error: {e}")
            return {"success": False, "error": str(e)}

    def search(
        self,
        query: str,
        limit: int = 3,
        sources: Optional[List[str]] = None,
        **kwargs,
    ) -> Dict[str, Any]:
        sources = sources or ["web", "images", "news"]
        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.search(query=query, limit=limit, **kwargs)
                return {"success": True, "data": result.get("data") or result}
            else:
                import requests
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {"query": query, "limit": limit, "sources": sources}
                payload.update(kwargs or {})
                resp = requests.post(f"{self.base_url}/v2/search", json=payload, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, dict) else {"success": True, "data": data}
        except Exception as e:
            logger.warning(f"Firecrawl search error: {e}")
            return {"success": False, "error": str(e)}

    def crawl(self, url: str, limit: int = 10, **kwargs) -> Dict[str, Any]:
        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.crawl(url=url, limit=limit, **kwargs)
                return {"success": True, "data": result.get("data") or result}
            else:
                import requests
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {"url": url, "limit": limit}
                payload.update(kwargs or {})
                resp = requests.post(f"{self.base_url}/v2/crawl", json=payload, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, dict) else {"success": True, "data": data}
        except Exception as e:
            logger.warning(f"Firecrawl crawl error: {e}")
            return {"success": False, "error": str(e)}

    def extract_json(self, url: str, prompt: str, timeout: int = 120000) -> Dict[str, Any]:
        """Extract without schema using a prompt.
        See: Extracting without schema in Firecrawl docs.
        """
        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.scrape(
                    url,
                    formats=[{
                        "type": "json",
                        "prompt": prompt,
                    }],
                    timeout=timeout,
                    only_main_content=False,
                )
                return {"success": True, "data": result.get("data") or result}
            else:
                import requests
                headers = {
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                }
                payload = {
                    "url": url,
                    "formats": [{"type": "json", "prompt": prompt}],
                    "timeout": timeout,
                    "only_main_content": False,
                }
                resp = requests.post(f"{self.base_url}/v2/scrape", json=payload, headers=headers, timeout=60)
                resp.raise_for_status()
                data = resp.json()
                return data if isinstance(data, dict) else {"success": True, "data": data}
        except Exception as e:
            logger.warning(f"Firecrawl extract error: {e}")
            return {"success": False, "error": str(e)}


_singleton: Optional[_FirecrawlService] = None


def get_firecrawl_service() -> _FirecrawlService:
    global _singleton
    if _singleton is None:
        _singleton = _FirecrawlService()
    return _singleton



