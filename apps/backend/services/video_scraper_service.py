#!/usr/bin/env python3
"""
Video Scraper Service - Extracts video URLs from websites.

Looks for:
- Direct video files (mp4, webm, mov, etc.)
- YouTube embeds/links
- Vimeo embeds/links
- HTML5 video elements
- Open Graph video meta tags
- Twitter video cards
"""

import asyncio
import aiohttp
import re
import json
from typing import List, Dict, Any, Optional, Set
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
from dataclasses import dataclass, field
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


@dataclass
class VideoInfo:
    """Represents extracted video information."""
    url: str
    source_type: str  # 'direct', 'youtube', 'vimeo', 'embed', 'meta'
    title: Optional[str] = None
    thumbnail: Optional[str] = None
    duration: Optional[int] = None  # seconds
    embed_url: Optional[str] = None
    video_id: Optional[str] = None
    score: int = 0

    def to_dict(self) -> Dict[str, Any]:
        return {
            'url': self.url,
            'source_type': self.source_type,
            'title': self.title,
            'thumbnail': self.thumbnail,
            'duration': self.duration,
            'embed_url': self.embed_url,
            'video_id': self.video_id,
            'score': self.score
        }


@dataclass
class VideoScraperResult:
    """Result of video scraping."""
    videos: List[VideoInfo] = field(default_factory=list)
    domain: Optional[str] = None
    success: bool = False
    error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            'videos': [v.to_dict() for v in self.videos],
            'domain': self.domain,
            'success': self.success,
            'error': self.error
        }


class VideoScraperService:
    """Service for extracting videos from websites."""

    # Regex patterns for video detection
    YOUTUBE_PATTERNS = [
        r'(?:youtube\.com/watch\?v=|youtu\.be/|youtube\.com/embed/)([a-zA-Z0-9_-]{11})',
        r'youtube\.com/v/([a-zA-Z0-9_-]{11})',
        r'youtube-nocookie\.com/embed/([a-zA-Z0-9_-]{11})',
    ]

    VIMEO_PATTERNS = [
        r'vimeo\.com/(\d+)',
        r'player\.vimeo\.com/video/(\d+)',
    ]

    VIDEO_EXTENSIONS = ['.mp4', '.webm', '.mov', '.m4v', '.avi', '.mkv', '.ogv']

    def __init__(self):
        self.session: Optional[aiohttp.ClientSession] = None

    async def __aenter__(self):
        """Async context manager entry."""
        connector = aiohttp.TCPConnector(ssl=False, limit=50)
        timeout = aiohttp.ClientTimeout(total=20, connect=5)
        headers = {
            'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
        }
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers=headers
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()

    async def scrape_videos(
        self,
        url: str,
        max_videos: int = 10,
        include_embeds: bool = True
    ) -> VideoScraperResult:
        """
        Scrape a website for videos.

        Args:
            url: Website URL to scrape
            max_videos: Maximum number of videos to return
            include_embeds: Whether to include YouTube/Vimeo embeds

        Returns:
            VideoScraperResult with found videos
        """
        result = VideoScraperResult(domain=urlparse(url).netloc)

        try:
            logger.info(f"🎬 [VideoScraper] Scraping videos from: {url}")

            # Fetch the webpage
            html_content = await self._fetch_webpage(url)
            if not html_content:
                result.error = "Failed to fetch webpage"
                return result

            videos: List[VideoInfo] = []
            seen_urls: Set[str] = set()

            soup = BeautifulSoup(html_content, 'html.parser')
            base_url = url

            # Strategy 1: HTML5 video elements
            video_elements = await self._extract_video_elements(soup, base_url)
            for video in video_elements:
                if video.url not in seen_urls:
                    seen_urls.add(video.url)
                    videos.append(video)

            # Strategy 2: Open Graph / Twitter video meta tags
            meta_videos = await self._extract_meta_videos(soup, base_url)
            for video in meta_videos:
                if video.url not in seen_urls:
                    seen_urls.add(video.url)
                    videos.append(video)

            # Strategy 3: YouTube embeds and links
            if include_embeds:
                youtube_videos = await self._extract_youtube_videos(soup, html_content)
                for video in youtube_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 4: Vimeo embeds and links
            if include_embeds:
                vimeo_videos = await self._extract_vimeo_videos(soup, html_content)
                for video in vimeo_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 5: Direct video file links
            direct_videos = await self._extract_direct_video_links(soup, base_url, html_content)
            for video in direct_videos:
                if video.url not in seen_urls:
                    seen_urls.add(video.url)
                    videos.append(video)

            # Strategy 6: JSON-LD structured data
            jsonld_videos = await self._extract_jsonld_videos(soup, base_url)
            for video in jsonld_videos:
                if video.url not in seen_urls:
                    seen_urls.add(video.url)
                    videos.append(video)

            # Score and sort videos
            for video in videos:
                video.score = self._score_video(video)

            videos.sort(key=lambda v: v.score, reverse=True)

            result.videos = videos[:max_videos]
            result.success = True

            logger.info(f"🎬 [VideoScraper] Found {len(result.videos)} videos from {url}")

        except Exception as e:
            logger.error(f"🎬 [VideoScraper] Error scraping {url}: {e}")
            result.error = str(e)

        return result

    async def _fetch_webpage(self, url: str) -> Optional[str]:
        """Fetch webpage content."""
        try:
            async with self.session.get(url, allow_redirects=True) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '').lower()
                    if 'text/html' in content_type:
                        return await response.text()
        except Exception as e:
            logger.debug(f"Failed to fetch {url}: {e}")
        return None

    async def _extract_video_elements(self, soup: BeautifulSoup, base_url: str) -> List[VideoInfo]:
        """Extract videos from HTML5 video elements."""
        videos = []

        for video_tag in soup.find_all('video'):
            # Get source from video element src attribute
            src = video_tag.get('src')
            if src:
                full_url = urljoin(base_url, src)
                poster = video_tag.get('poster')
                videos.append(VideoInfo(
                    url=full_url,
                    source_type='direct',
                    thumbnail=urljoin(base_url, poster) if poster else None
                ))

            # Get sources from nested source elements
            for source_tag in video_tag.find_all('source'):
                src = source_tag.get('src')
                if src:
                    full_url = urljoin(base_url, src)
                    media_type = source_tag.get('type', '')
                    poster = video_tag.get('poster')
                    videos.append(VideoInfo(
                        url=full_url,
                        source_type='direct',
                        thumbnail=urljoin(base_url, poster) if poster else None
                    ))

        return videos

    async def _extract_meta_videos(self, soup: BeautifulSoup, base_url: str) -> List[VideoInfo]:
        """Extract videos from meta tags (Open Graph, Twitter Cards)."""
        videos = []

        # Open Graph video
        og_video = soup.find('meta', property='og:video')
        og_video_url = soup.find('meta', property='og:video:url')
        og_video_secure = soup.find('meta', property='og:video:secure_url')
        og_title = soup.find('meta', property='og:title')
        og_image = soup.find('meta', property='og:image')

        video_url = None
        if og_video_secure:
            video_url = og_video_secure.get('content')
        elif og_video_url:
            video_url = og_video_url.get('content')
        elif og_video:
            video_url = og_video.get('content')

        if video_url:
            videos.append(VideoInfo(
                url=urljoin(base_url, video_url),
                source_type='meta',
                title=og_title.get('content') if og_title else None,
                thumbnail=og_image.get('content') if og_image else None
            ))

        # Twitter video card
        twitter_player = soup.find('meta', attrs={'name': 'twitter:player'})
        twitter_stream = soup.find('meta', attrs={'name': 'twitter:player:stream'})
        twitter_title = soup.find('meta', attrs={'name': 'twitter:title'})
        twitter_image = soup.find('meta', attrs={'name': 'twitter:image'})

        if twitter_stream:
            videos.append(VideoInfo(
                url=urljoin(base_url, twitter_stream.get('content', '')),
                source_type='meta',
                title=twitter_title.get('content') if twitter_title else None,
                thumbnail=twitter_image.get('content') if twitter_image else None
            ))
        elif twitter_player:
            videos.append(VideoInfo(
                url=urljoin(base_url, twitter_player.get('content', '')),
                source_type='embed',
                title=twitter_title.get('content') if twitter_title else None,
                thumbnail=twitter_image.get('content') if twitter_image else None
            ))

        return videos

    async def _extract_youtube_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract YouTube videos from embeds and links."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.YOUTUBE_PATTERNS:
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://www.youtube.com/watch?v={video_id}",
                            source_type='youtube',
                            video_id=video_id,
                            embed_url=f"https://www.youtube.com/embed/{video_id}",
                            thumbnail=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
                        ))

        # Search in links
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href', '')
            for pattern in self.YOUTUBE_PATTERNS:
                match = re.search(pattern, href)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        title = a_tag.get_text(strip=True) or None
                        videos.append(VideoInfo(
                            url=f"https://www.youtube.com/watch?v={video_id}",
                            source_type='youtube',
                            video_id=video_id,
                            title=title if title and len(title) > 3 else None,
                            embed_url=f"https://www.youtube.com/embed/{video_id}",
                            thumbnail=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
                        ))

        # Search in raw HTML for any YouTube references
        for pattern in self.YOUTUBE_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://www.youtube.com/watch?v={video_id}",
                        source_type='youtube',
                        video_id=video_id,
                        embed_url=f"https://www.youtube.com/embed/{video_id}",
                        thumbnail=f"https://img.youtube.com/vi/{video_id}/maxresdefault.jpg"
                    ))

        return videos

    async def _extract_vimeo_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Vimeo videos from embeds and links."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.VIMEO_PATTERNS:
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://vimeo.com/{video_id}",
                            source_type='vimeo',
                            video_id=video_id,
                            embed_url=f"https://player.vimeo.com/video/{video_id}"
                        ))

        # Search in links
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href', '')
            for pattern in self.VIMEO_PATTERNS:
                match = re.search(pattern, href)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        title = a_tag.get_text(strip=True) or None
                        videos.append(VideoInfo(
                            url=f"https://vimeo.com/{video_id}",
                            source_type='vimeo',
                            video_id=video_id,
                            title=title if title and len(title) > 3 else None,
                            embed_url=f"https://player.vimeo.com/video/{video_id}"
                        ))

        # Search in raw HTML
        for pattern in self.VIMEO_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://vimeo.com/{video_id}",
                        source_type='vimeo',
                        video_id=video_id,
                        embed_url=f"https://player.vimeo.com/video/{video_id}"
                    ))

        return videos

    async def _extract_direct_video_links(self, soup: BeautifulSoup, base_url: str, html_content: str) -> List[VideoInfo]:
        """Extract direct video file links."""
        videos = []
        seen_urls: Set[str] = set()

        # Find in link href attributes
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href', '')
            if any(ext in href.lower() for ext in self.VIDEO_EXTENSIONS):
                full_url = urljoin(base_url, href)
                if full_url not in seen_urls:
                    seen_urls.add(full_url)
                    title = a_tag.get_text(strip=True) or None
                    videos.append(VideoInfo(
                        url=full_url,
                        source_type='direct',
                        title=title if title and len(title) > 3 else None
                    ))

        # Find in img/video data attributes that might point to videos
        for tag in soup.find_all(['img', 'div', 'span', 'a']):
            for attr in ['data-video', 'data-video-src', 'data-video-url', 'data-mp4', 'data-webm']:
                value = tag.get(attr)
                if value:
                    full_url = urljoin(base_url, value)
                    if full_url not in seen_urls:
                        seen_urls.add(full_url)
                        videos.append(VideoInfo(
                            url=full_url,
                            source_type='direct'
                        ))

        # Search for video URLs in script tags and raw HTML
        video_url_pattern = r'https?://[^\s\'"<>]+\.(?:mp4|webm|mov|m4v)'
        for match in re.finditer(video_url_pattern, html_content, re.IGNORECASE):
            url = match.group(0)
            if url not in seen_urls:
                seen_urls.add(url)
                videos.append(VideoInfo(
                    url=url,
                    source_type='direct'
                ))

        return videos

    async def _extract_jsonld_videos(self, soup: BeautifulSoup, base_url: str) -> List[VideoInfo]:
        """Extract videos from JSON-LD structured data."""
        videos = []

        for script in soup.find_all('script', type='application/ld+json'):
            try:
                data = json.loads(script.string or '{}')

                # Handle both single objects and arrays
                items = [data] if isinstance(data, dict) else data if isinstance(data, list) else []

                for item in items:
                    if not isinstance(item, dict):
                        continue

                    item_type = item.get('@type', '')

                    # VideoObject type
                    if item_type == 'VideoObject' or 'Video' in str(item_type):
                        content_url = item.get('contentUrl') or item.get('embedUrl')
                        if content_url:
                            videos.append(VideoInfo(
                                url=urljoin(base_url, content_url),
                                source_type='jsonld',
                                title=item.get('name'),
                                thumbnail=item.get('thumbnailUrl'),
                                duration=self._parse_duration(item.get('duration'))
                            ))

                    # Check for video in other schemas
                    if 'video' in item:
                        video_data = item['video']
                        if isinstance(video_data, dict):
                            content_url = video_data.get('contentUrl') or video_data.get('embedUrl')
                            if content_url:
                                videos.append(VideoInfo(
                                    url=urljoin(base_url, content_url),
                                    source_type='jsonld',
                                    title=video_data.get('name'),
                                    thumbnail=video_data.get('thumbnailUrl')
                                ))

            except (json.JSONDecodeError, TypeError):
                continue

        return videos

    def _parse_duration(self, duration_str: Optional[str]) -> Optional[int]:
        """Parse ISO 8601 duration to seconds."""
        if not duration_str:
            return None

        # Match ISO 8601 duration format PT1H2M3S
        match = re.match(r'PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?', duration_str)
        if match:
            hours = int(match.group(1) or 0)
            minutes = int(match.group(2) or 0)
            seconds = int(match.group(3) or 0)
            return hours * 3600 + minutes * 60 + seconds

        return None

    def _score_video(self, video: VideoInfo) -> int:
        """Score a video based on quality indicators."""
        score = 0

        # Source type scoring
        source_scores = {
            'direct': 30,  # Direct video files are most reliable
            'youtube': 25,  # YouTube is well-supported
            'vimeo': 25,  # Vimeo is well-supported
            'meta': 20,  # Meta tags indicate official video
            'jsonld': 20,  # Structured data is reliable
            'embed': 15,  # Generic embeds
        }
        score += source_scores.get(video.source_type, 0)

        # Has thumbnail
        if video.thumbnail:
            score += 10

        # Has title
        if video.title:
            score += 5

        # Prefer certain file types
        url_lower = video.url.lower()
        if '.mp4' in url_lower:
            score += 10
        elif '.webm' in url_lower:
            score += 8

        # High quality indicators in URL
        if any(q in url_lower for q in ['1080', 'hd', 'high', 'full']):
            score += 5

        return score


async def scrape_website_videos(
    url: str,
    max_videos: int = 10,
    include_embeds: bool = True
) -> VideoScraperResult:
    """
    Convenience function to scrape videos from a website.

    Args:
        url: Website URL to scrape
        max_videos: Maximum number of videos to return
        include_embeds: Whether to include YouTube/Vimeo embeds

    Returns:
        VideoScraperResult with found videos
    """
    async with VideoScraperService() as scraper:
        return await scraper.scrape_videos(url, max_videos, include_embeds)


async def get_brand_videos(domain: str, max_videos: int = 5) -> List[Dict[str, Any]]:
    """
    Get videos from a brand's website.

    Args:
        domain: Brand domain (e.g., 'dyna.co')
        max_videos: Maximum number of videos to return

    Returns:
        List of video dictionaries
    """
    url = f"https://{domain}"
    result = await scrape_website_videos(url, max_videos)

    if result.success:
        return [v.to_dict() for v in result.videos]

    # Try www subdomain as fallback
    url = f"https://www.{domain}"
    result = await scrape_website_videos(url, max_videos)

    return [v.to_dict() for v in result.videos] if result.success else []
