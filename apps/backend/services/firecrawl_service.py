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
                # SDK returns a Document object with attributes, convert to dict
                if hasattr(result, 'markdown'):
                    data = {
                        "markdown": getattr(result, 'markdown', ''),
                        "html": getattr(result, 'html', ''),
                        "metadata": getattr(result, 'metadata', {}) if hasattr(result, 'metadata') else {},
                    }
                    return {"success": True, "data": data}
                elif isinstance(result, dict):
                    return {"success": True, "data": result.get("data") or result}
                else:
                    # Try to convert to dict if possible
                    return {"success": True, "data": dict(result) if hasattr(result, '__dict__') else {"raw": str(result)}}
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

    def extract_media(
        self,
        url: str,
        media_types: Optional[List[str]] = None,
        include_markdown: bool = True,
    ) -> Dict[str, Any]:
        """
        Extract media URLs (images, GIFs, videos) from a website.

        Args:
            url: The URL to scrape
            media_types: Filter for specific types like ['gif', 'png', 'jpg', 'mp4', 'webm']
                        If None, returns all media
            include_markdown: Also return markdown content for context

        Returns:
            Dict with 'images' (list of URLs), 'markdown' (optional), and 'metadata'
        """
        media_types = media_types or []
        formats = ["images"]
        if include_markdown:
            formats.append("markdown")

        try:
            result = self.scrape(url, formats=formats)
            if not result.get("success"):
                return result

            data = result.get("data", {})

            # Extract image URLs from the response
            images = []

            # Handle different response shapes from Firecrawl
            if isinstance(data, dict):
                # Direct images array
                raw_images = data.get("images", [])
                if not raw_images:
                    # Try nested under 'data'
                    raw_images = (data.get("data") or {}).get("images", [])

                for img in raw_images:
                    img_url = None
                    if isinstance(img, str):
                        img_url = img
                    elif isinstance(img, dict):
                        img_url = img.get("src") or img.get("url") or img.get("imageUrl")
                    else:
                        # Pydantic model from SDK
                        img_url = getattr(img, "src", None) or getattr(img, "url", None) or getattr(img, "imageUrl", None)

                    if img_url:
                        # Filter by media type if specified
                        if media_types:
                            img_lower = img_url.lower()
                            if any(f".{mt}" in img_lower or f"/{mt}" in img_lower for mt in media_types):
                                images.append(img_url)
                        else:
                            images.append(img_url)

            return {
                "success": True,
                "data": {
                    "images": images,
                    "markdown": data.get("markdown", ""),
                    "metadata": data.get("metadata", {}),
                    "source_url": url,
                }
            }
        except Exception as e:
            logger.warning(f"Firecrawl extract_media error: {e}")
            return {"success": False, "error": str(e)}

    def extract_gifs(self, url: str) -> Dict[str, Any]:
        """
        Convenience method to extract only GIF URLs from a website.

        Args:
            url: The URL to scrape

        Returns:
            Dict with 'gifs' list and metadata
        """
        result = self.extract_media(url, media_types=["gif"])
        if result.get("success"):
            result["data"]["gifs"] = result["data"].pop("images", [])
        return result

    def extract_site_content(
        self,
        url: str,
        extract_prompt: Optional[str] = None,
    ) -> Dict[str, Any]:
        """
        Extract rich content from a site including media and structured data.
        Useful for pulling content to use in presentations.

        Args:
            url: The URL to scrape
            extract_prompt: Optional prompt for AI-powered extraction

        Returns:
            Dict with images, gifs, markdown, and optionally extracted JSON
        """
        try:
            # Get media and markdown
            media_result = self.extract_media(url, include_markdown=True)
            if not media_result.get("success"):
                return media_result

            data = media_result.get("data", {})

            # Separate GIFs from other images
            all_images = data.get("images", [])
            gifs = [img for img in all_images if ".gif" in img.lower()]
            static_images = [img for img in all_images if ".gif" not in img.lower()]

            result_data = {
                "images": static_images,
                "gifs": gifs,
                "all_media": all_images,
                "markdown": data.get("markdown", ""),
                "metadata": data.get("metadata", {}),
                "source_url": url,
            }

            # If a prompt is provided, also do AI extraction
            if extract_prompt:
                json_result = self.extract_json(url, extract_prompt)
                if json_result.get("success"):
                    result_data["extracted"] = json_result.get("data", {}).get("json", {})

            return {"success": True, "data": result_data}

        except Exception as e:
            logger.warning(f"Firecrawl extract_site_content error: {e}")
            return {"success": False, "error": str(e)}

    def extract_brand_design(
        self,
        url: str,
        include_screenshot: bool = True,
    ) -> Dict[str, Any]:
        """
        Extract comprehensive brand design system from a website.

        Uses Firecrawl's branding format to get colors, fonts, logos, spacing,
        and optionally a screenshot for visual reference.

        Args:
            url: The website URL to analyze
            include_screenshot: Whether to capture a full-page screenshot

        Returns:
            Dict with:
            - colors: {primary, secondary, accent, background, textPrimary, textSecondary}
            - fonts: List of font families used
            - typography: {fontFamilies, fontSizes, fontWeights}
            - logo: URL to primary logo
            - favicon: URL to favicon
            - screenshot: Base64 encoded screenshot (if requested)
            - colorScheme: "light" or "dark"
            - spacing: {baseUnit, borderRadius}
            - personality: {tone, energy, targetAudience}
            - source_url: The analyzed URL
        """
        formats = ["branding"]
        if include_screenshot:
            formats.append("screenshot@fullPage")

        try:
            # Use HTTP request directly for more control over response parsing
            import requests
            headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "url": url,
                "formats": formats,
                "timeout": 60000,
            }

            logger.info(f"[BRAND_DESIGN] Fetching brand design from {url} with formats={formats}")

            resp = requests.post(
                f"{self.base_url}/v1/scrape",
                json=payload,
                headers=headers,
                timeout=90
            )
            resp.raise_for_status()
            result = resp.json()

            if not result.get("success"):
                logger.warning(f"[BRAND_DESIGN] Firecrawl returned success=false: {result}")
                return {"success": False, "error": result.get("error", "Unknown error")}

            data = result.get("data", {})
            branding = data.get("branding", {})

            # Extract and normalize the brand design data
            brand_design = {
                "source_url": url,
                "colorScheme": branding.get("colorScheme", "light"),

                # Colors - normalize to consistent structure
                "colors": {
                    "primary": branding.get("colors", {}).get("primary"),
                    "secondary": branding.get("colors", {}).get("secondary"),
                    "accent": branding.get("colors", {}).get("accent"),
                    "background": branding.get("colors", {}).get("background"),
                    "textPrimary": branding.get("colors", {}).get("textPrimary"),
                    "textSecondary": branding.get("colors", {}).get("textSecondary"),
                    # Semantic colors if available
                    "success": branding.get("colors", {}).get("success"),
                    "warning": branding.get("colors", {}).get("warning"),
                    "error": branding.get("colors", {}).get("error"),
                },

                # Fonts
                "fonts": branding.get("fonts", []),
                "typography": branding.get("typography", {}),

                # Logo and images
                "logo": branding.get("logo") or branding.get("images", {}).get("logo"),
                "favicon": branding.get("images", {}).get("favicon"),
                "ogImage": branding.get("images", {}).get("og:image"),

                # Design system details
                "spacing": branding.get("spacing", {}),
                "components": branding.get("components", {}),

                # Brand personality
                "personality": branding.get("personality", {}),
            }

            # Add screenshot if requested and available
            if include_screenshot:
                screenshot = data.get("screenshot")
                if screenshot:
                    brand_design["screenshot"] = screenshot
                    logger.info(f"[BRAND_DESIGN] Got screenshot ({len(screenshot)} chars)")
                else:
                    logger.warning("[BRAND_DESIGN] Screenshot requested but not returned")

            # Filter out None values from colors
            brand_design["colors"] = {
                k: v for k, v in brand_design["colors"].items() if v is not None
            }

            logger.info(f"[BRAND_DESIGN] Extracted: {len(brand_design['colors'])} colors, "
                       f"{len(brand_design['fonts'])} fonts, logo={bool(brand_design['logo'])}")

            return {"success": True, "data": brand_design}

        except requests.exceptions.HTTPError as e:
            logger.warning(f"[BRAND_DESIGN] HTTP error: {e}")
            return {"success": False, "error": f"HTTP error: {e}"}
        except Exception as e:
            logger.warning(f"[BRAND_DESIGN] Error extracting brand design: {e}")
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



