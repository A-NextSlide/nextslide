import os
import re
from typing import Any, Dict, List, Optional, Tuple

from agents.ai.clients import get_client
from agents.config import PERPLEXITY_IMAGE_MODEL
from services.image_validator import ImageValidator


class PerplexityImageService:
    """Service for retrieving image results using Perplexity Sonar (OpenAI-compatible API).

    This uses Perplexity's `return_images` capability plus optional filters to fetch
    web image results relevant to a textual query. Results are normalized to match
    the structure produced by `SerpAPIService.search_images` for drop-in use.
    """

    def __init__(self) -> None:
        # Prefer PPLX_API_KEY, fallback to PERPLEXITY_API_KEY
        self.api_key = os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY")
        self.is_available = bool(self.api_key)

        # Pre-compile simple URL matcher as a last-resort extractor
        self._url_regex = re.compile(r"https?://[^\s)\]]+\.(?:png|jpe?g|gif|webp)(?:\?[^\s)\]]*)?", re.IGNORECASE)

    # --- Public API -----------------------------------------------------------------

    async def search_images(
        self,
        query: str,
        per_page: int = 10,
        page: int = 1,
        orientation: Optional[str] = None,  # Not currently supported by Perplexity filters
        size: Optional[str] = None,         # Not currently supported by Perplexity filters
        color: Optional[str] = None,        # Not currently supported by Perplexity filters
        locale: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Find images matching `query` using Perplexity.

        Returns a dict with keys: {'photos': List[Dict], 'total_results': int}
        matching the SerpAPI service shape.
        """
        if not self.is_available or not query:
            return {"photos": [], "total_results": 0}

        try:
            client, model = get_client(PERPLEXITY_IMAGE_MODEL)

            # Build a concise prompt; retrieval is handled by Sonar
            messages = [
                {
                    "role": "system",
                    "content": (
                        "You are an image finder. Return relevant, high-quality images for the user's topic."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Find approximately {per_page} high-quality, presentation-appropriate images for: {query}."
                    ),
                },
            ]

            # Conservative defaults: exclude stock watermarked providers
            image_domain_filter: List[str] = [
                "-gettyimages.com",
                "-istockphoto.com",
                "-shutterstock.com",
                "-alamy.com",
                "-pinterest.com",
                "-facebook.com",
                "-x.com",
                "-twitter.com",
                # Exclude YouTube from image results as well
                "-youtube.com",
                "-youtu.be",
                "-www.youtube.com",
                "-m.youtube.com",
            ]

            # Call Perplexity (OpenAI-compatible)
            result = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=800,
                temperature=0.0,
                top_p=0.1,
                # Perplexity-specific fields go in extra_body for OpenAI SDK compatibility
                extra_body={
                    "return_images": True,
                    "image_domain_filter": image_domain_filter,
                },
            )

            # Convert result to raw dict to access provider-specific fields
            try:
                raw: Dict[str, Any] = result.model_dump()  # OpenAI >=1.0 returns pydantic models
            except Exception:
                # Fallback in case of different SDK behavior
                import json
                raw = json.loads(getattr(result, "model_dump_json", lambda: "{}")())

            images = self._extract_images_from_response(raw)
            normalized = [self._normalize_image(item, default_alt=query) for item in images]

            # Filter out invalid/inaccessible images
            if normalized:
                normalized = await ImageValidator.filter_valid_images(normalized)

            if normalized:
                return {"photos": normalized[:per_page], "total_results": len(normalized)}

            # Fallback: prompt for direct URLs if provider images not present
            fallback_messages = [
                {
                    "role": "system",
                    "content": (
                        "Return ONLY direct image URLs, one per line, no descriptions, for the user's topic."
                    ),
                },
                {
                    "role": "user",
                    "content": (
                        f"Provide {per_page} direct image links (ending with .jpg .jpeg .png .webp) for: {query}.\n"
                        "Exclude watermarked stock sites like gettyimages, istockphoto, shutterstock, alamy."
                    ),
                },
            ]
            fallback = client.chat.completions.create(
                model=model,
                messages=fallback_messages,
                max_tokens=400,
                temperature=0.0,
                top_p=0.1,
            )
            content = fallback.choices[0].message.content if getattr(fallback, "choices", None) else ""
            urls = self._url_regex.findall(content or "")
            norm2 = [self._normalize_image(u, default_alt=query) for u in urls]
            if norm2:
                norm2 = await ImageValidator.filter_valid_images(norm2)
            return {"photos": norm2[:per_page], "total_results": len(norm2)}

        except Exception:
            return {"photos": [], "total_results": 0}

    async def search_images_for_slide(
        self,
        slide_content: str,
        slide_title: str,
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 6,
        search_query: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        """Slide-aware image search using richer context sent to Perplexity."""
        query = (search_query or self._simple_keyword_extraction(slide_title, slide_content) or slide_title or "").strip()
        if not query:
            return []

        # Provide richer context to Perplexity to influence relevance
        try:
            client, model = get_client(PERPLEXITY_IMAGE_MODEL)
            vibe = ''
            try:
                if isinstance(style_preferences, dict):
                    vibe = style_preferences.get('vibeContext') or ''
            except Exception:
                vibe = ''
            messages = [
                {"role": "system", "content": "You select highly relevant images for slides given title and content."},
                {"role": "user", "content": (
                    f"Slide Title: {slide_title}\n"
                    f"Slide Type: {slide_type}\n"
                    f"Style/Vibe: {vibe}\n"
                    f"Content (excerpt): {(slide_content or '')[:280]}\n\n"
                    f"Find {num_images * 3} high-quality images matching this slide."
                )},
            ]
            result = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=600,
                temperature=0.0,
                top_p=0.1,
                extra_body={
                    "return_images": True,
                    "image_domain_filter": ["-gettyimages.com", "-istockphoto.com", "-shutterstock.com", "-alamy.com"],
                },
            )
            try:
                raw: Dict[str, Any] = result.model_dump()
            except Exception:
                import json
                raw = json.loads(getattr(result, "model_dump_json", lambda: "{}")())
            images = self._extract_images_from_response(raw)
            normalized = [self._normalize_image(item, default_alt=slide_title or query) for item in images]
            if normalized:
                normalized = await ImageValidator.filter_valid_images(normalized)
            if normalized:
                return normalized[: num_images]
        except Exception:
            pass

        # Fallback to simple query search if the contextual call fails
        results = await self.search_images(query=query, per_page=num_images * 3)
        photos = results.get("photos", [])
        # As a small diversification step, return up to requested count
        return photos[:num_images]

    async def search_gifs(
        self,
        query: str,
        per_page: int = 20,
        page: int = 1,
    ) -> Dict[str, Any]:
        """Search for animated GIFs using Perplexity's image filters."""
        if not self.is_available or not query:
            return {"photos": [], "total_results": 0}

        try:
            client, model = get_client(PERPLEXITY_IMAGE_MODEL)

            messages = [
                {"role": "system", "content": "Return relevant animated GIF images only."},
                {"role": "user", "content": f"Find {per_page} animated GIFs for: {query}"},
            ]

            result = client.chat.completions.create(
                model=model,
                messages=messages,
                max_tokens=400,
                temperature=0.0,
                top_p=0.1,
                extra_body={
                    "return_images": True,
                    "image_format_filter": ["gif"],
                },
            )

            try:
                raw: Dict[str, Any] = result.model_dump()
            except Exception:
                import json
                raw = json.loads(getattr(result, "model_dump_json", lambda: "{}")())

            images = self._extract_images_from_response(raw)
            # Ensure only GIF links
            images = [img for img in images if isinstance(img, (str, dict)) and str((img.get('url') if isinstance(img, dict) else img)).lower().endswith('.gif')]
            normalized = [self._normalize_image(item, default_alt=query) for item in images]
            if normalized:
                normalized = await ImageValidator.filter_valid_images(normalized)
            if normalized and len(normalized) > 0:
                return {"photos": normalized[:per_page], "total_results": len(normalized)}

            # Fallback: text-only query for GIF URLs
            fb = client.chat.completions.create(
                model=model,
                messages=[
                    {"role": "system", "content": "Return ONLY direct .gif URLs, one per line."},
                    {"role": "user", "content": f"Find {per_page} animated GIF links for: {query}"},
                ],
                max_tokens=200,
                temperature=0.0,
                top_p=0.1,
            )
            content = fb.choices[0].message.content if getattr(fb, "choices", None) else ""
            urls = [u for u in self._url_regex.findall(content or "") if u.lower().endswith('.gif')]
            norm2 = [self._normalize_image(u, default_alt=query) for u in urls]
            if norm2:
                norm2 = await ImageValidator.filter_valid_images(norm2)
            return {"photos": norm2[:per_page], "total_results": len(norm2)}
        except Exception:
            return {"photos": [], "total_results": 0}

    # --- Helpers --------------------------------------------------------------------

    def _extract_images_from_response(self, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract image entries from Perplexity response.

        The API is OpenAI-compatible and may include a provider-specific `images` collection
        either at the top-level or nested under choices/message metadata. We search common
        locations and fall back to URL extraction from message content.
        """
        # 1) Direct top-level
        if isinstance(data.get("images"), list):
            return data["images"]

        # 2) First choice level
        choices = data.get("choices") or []
        if choices:
            first = choices[0]
            if isinstance(first.get("images"), list):
                return first["images"]
            message = first.get("message") or {}
            if isinstance(message.get("images"), list):
                return message["images"]

            # Fallback: scan message content for direct image URLs
            content = message.get("content") or ""
            urls = self._url_regex.findall(content)
            return [{"url": u} for u in urls]

        return []

    def _normalize_image(self, item: Any, default_alt: str = "") -> Dict[str, Any]:
        """Normalize Perplexity image item to our internal photo format."""
        if isinstance(item, str):
            url = item
            title = default_alt
            thumbnail = url
            width = None
            height = None
            source = self._extract_domain(url)
        elif isinstance(item, dict):
            url = item.get("url") or item.get("src") or item.get("image_url") or ""
            title = item.get("title") or default_alt
            thumbnail = item.get("thumbnail") or url
            width = item.get("width")
            height = item.get("height")
            source = item.get("source") or self._extract_domain(url)
        else:
            return {}

        if not url:
            return {}

        return {
            "id": f"perplexity_{abs(hash(url)) % 100000}",
            "photographer": source or "",
            "photographer_url": "",
            "page_url": url,
            "url": url,
            "alt": title or default_alt,
            "width": width,
            "height": height,
            "src": {
                "original": url,
                "large": url,
                "medium": thumbnail or url,
                "small": thumbnail or url,
                "thumbnail": thumbnail or url,
            },
            "source": "perplexity",
        }

    def _extract_domain(self, url: str) -> str:
        try:
            from urllib.parse import urlparse
            parsed = urlparse(url)
            host = (parsed.netloc or "").lower()
            return host.replace("www.", "")
        except Exception:
            return ""

    def _simple_keyword_extraction(self, title: str, content: str) -> str:
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'being', 'have',
            'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should',
        }
        words = (title or "").split()
        keywords = [w for w in words if w.lower() not in stop_words and len(w) > 2]
        return ' '.join(keywords[:3]) if keywords else (title or "")[:30]


