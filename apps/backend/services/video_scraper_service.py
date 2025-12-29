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
from typing import List, Dict, Any, Optional, Set, Tuple
from urllib.parse import urljoin, urlparse, parse_qs
from bs4 import BeautifulSoup
from dataclasses import dataclass, field
from setup_logging_optimized import get_logger

# Optional Playwright import for JS-rendered sites
try:
    from playwright.async_api import async_playwright
    PLAYWRIGHT_AVAILABLE = True
except ImportError:
    PLAYWRIGHT_AVAILABLE = False

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

    # Wistia patterns
    WISTIA_PATTERNS = [
        r'wistia\.(?:com|net)/(?:medias|embed)/([a-zA-Z0-9]+)',
        r'fast\.wistia\.(?:com|net)/embed/(?:medias|iframe)/([a-zA-Z0-9]+)',
        r'wistia_async_([a-zA-Z0-9]+)',
        r'"hashedId"\s*:\s*"([a-zA-Z0-9]+)"',
        r'wistia-player.*?media-id="([a-zA-Z0-9]+)"',
    ]

    # Loom patterns
    LOOM_PATTERNS = [
        r'loom\.com/share/([a-zA-Z0-9]+)',
        r'loom\.com/embed/([a-zA-Z0-9]+)',
    ]

    # Mux patterns
    MUX_PATTERNS = [
        r'stream\.mux\.com/([a-zA-Z0-9]+)',
        r'mux-player.*?playback-id="([a-zA-Z0-9]+)"',
        r'"playbackId"\s*:\s*"([a-zA-Z0-9]+)"',
    ]

    # Cloudflare Stream patterns
    CLOUDFLARE_STREAM_PATTERNS = [
        r'cloudflarestream\.com/([a-zA-Z0-9]+)',
        r'videodelivery\.net/([a-zA-Z0-9]+)',
        r'iframe\.videodelivery\.net/([a-zA-Z0-9]+)',
    ]

    # Vidyard patterns
    VIDYARD_PATTERNS = [
        r'vidyard\.com/watch/([a-zA-Z0-9]+)',
        r'play\.vidyard\.com/([a-zA-Z0-9]+)',
        r'vidyard-player.*?uuid="([a-zA-Z0-9-]+)"',
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
            self.session = None

    def __del__(self):
        """Cleanup session when object is garbage collected."""
        if self.session and not self.session.closed:
            try:
                import asyncio
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    asyncio.create_task(self.session.close())
                else:
                    loop.run_until_complete(self.session.close())
            except Exception:
                pass

    async def scrape_videos(
        self,
        url: str,
        max_videos: int = 10,
        include_embeds: bool = True,
        use_browser: bool = False
    ) -> VideoScraperResult:
        """
        Scrape a website for videos.

        Args:
            url: Website URL to scrape
            max_videos: Maximum number of videos to return
            include_embeds: Whether to include YouTube/Vimeo embeds
            use_browser: Whether to use a headless browser for JS-rendered sites

        Returns:
            VideoScraperResult with found videos
        """
        result = VideoScraperResult(domain=urlparse(url).netloc)

        try:
            logger.info(f"🎬 [VideoScraper] Scraping videos from: {url} (browser={use_browser}, playwright_available={PLAYWRIGHT_AVAILABLE})")

            # Fetch the webpage
            html_content = await self._fetch_webpage(url)
            html_len = len(html_content) if html_content else 0
            logger.debug(f"🎬 [VideoScraper] Initial fetch got {html_len} chars")

            # Try browser-based scraping if requested and available
            used_browser = False
            if use_browser and PLAYWRIGHT_AVAILABLE:
                logger.info(f"🎬 [VideoScraper] Attempting browser-based scraping for {url}")

                # Try up to 2 times with browser
                for attempt in range(2):
                    browser_html = await self._fetch_with_browser(url)
                    if browser_html:
                        browser_len = len(browser_html)
                        logger.info(f"🎬 [VideoScraper] Browser fetch got {browser_len} chars (vs {html_len} from HTTP) on attempt {attempt + 1}")
                        if browser_len > html_len:
                            html_content = browser_html
                            used_browser = True
                        break
                    else:
                        if attempt == 0:
                            logger.warning(f"🎬 [VideoScraper] Browser fetch attempt 1 failed for {url}, retrying...")
                            await asyncio.sleep(1)  # Brief pause before retry
                        else:
                            logger.warning(f"🎬 [VideoScraper] Browser fetch returned nothing for {url} after 2 attempts")
            elif use_browser and not PLAYWRIGHT_AVAILABLE:
                logger.warning(f"🎬 [VideoScraper] Browser scraping requested but Playwright not installed. Run: pip install playwright && playwright install chromium")

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

            # Strategy 4b: Wistia videos
            if include_embeds:
                wistia_videos = await self._extract_wistia_videos(soup, html_content)
                for video in wistia_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 4c: Loom videos
            if include_embeds:
                loom_videos = await self._extract_loom_videos(soup, html_content)
                for video in loom_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 4d: Mux videos
            if include_embeds:
                mux_videos = await self._extract_mux_videos(soup, html_content)
                for video in mux_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 4e: Cloudflare Stream videos
            if include_embeds:
                cf_videos = await self._extract_cloudflare_videos(soup, html_content)
                for video in cf_videos:
                    if video.url not in seen_urls and video.video_id:
                        seen_urls.add(video.url)
                        videos.append(video)

            # Strategy 4f: Vidyard videos
            if include_embeds:
                vidyard_videos = await self._extract_vidyard_videos(soup, html_content)
                for video in vidyard_videos:
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

            # Strategy 7: Extract from inline scripts and Next.js data
            script_videos = await self._extract_from_scripts(soup, html_content, base_url)
            for video in script_videos:
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

    async def _fetch_with_browser(self, url: str, wait_time: int = 5000) -> Optional[str]:
        """Fetch webpage content using headless browser for JS-rendered sites."""
        if not PLAYWRIGHT_AVAILABLE:
            logger.warning("🎬 [VideoScraper] Playwright not available for browser-based fetching")
            return None

        browser = None
        try:
            async with async_playwright() as p:
                browser = await p.chromium.launch(headless=True)
                context = await browser.new_context(
                    user_agent='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    viewport={'width': 1920, 'height': 1080}
                )
                page = await context.new_page()

                try:
                    # Try with domcontentloaded first, then wait for network to settle
                    logger.debug(f"🎬 [VideoScraper] Navigating to {url}...")
                    await page.goto(url, wait_until='domcontentloaded', timeout=20000)

                    # Wait for network to be idle (no requests for 500ms)
                    try:
                        await page.wait_for_load_state('networkidle', timeout=10000)
                    except Exception as e:
                        logger.debug(f"🎬 [VideoScraper] Network idle timeout (continuing): {e}")

                    # Additional wait for JS to render content
                    await page.wait_for_timeout(wait_time)

                    # Scroll to trigger any lazy loading
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight / 2)")
                    await page.wait_for_timeout(1000)
                    await page.evaluate("window.scrollTo(0, document.body.scrollHeight)")
                    await page.wait_for_timeout(1000)

                    html_content = await page.content()

                    if html_content and len(html_content) > 1000:
                        logger.debug(f"🎬 [VideoScraper] Successfully fetched {len(html_content)} chars from {url}")
                        return html_content
                    else:
                        logger.warning(f"🎬 [VideoScraper] Page content too short ({len(html_content) if html_content else 0} chars) for {url}")
                        return None

                except Exception as e:
                    logger.warning(f"🎬 [VideoScraper] Browser navigation failed for {url}: {type(e).__name__}: {e}")
                finally:
                    if browser:
                        await browser.close()
        except Exception as e:
            logger.warning(f"🎬 [VideoScraper] Playwright error for {url}: {type(e).__name__}: {e}")

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

    async def _extract_wistia_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Wistia videos from embeds, scripts, and custom elements."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.WISTIA_PATTERNS[:2]:  # URL-based patterns
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                            source_type='wistia',
                            video_id=video_id,
                            embed_url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                            thumbnail=f"https://fast.wistia.net/embed/medias/{video_id}/swatch"
                        ))

        # Search for wistia-player custom elements
        for player in soup.find_all(['wistia-player', 'div', 'span']):
            media_id = player.get('media-id') or player.get('data-wistia-id')
            if media_id and media_id not in found_ids:
                found_ids.add(media_id)
                videos.append(VideoInfo(
                    url=f"https://fast.wistia.net/embed/iframe/{media_id}",
                    source_type='wistia',
                    video_id=media_id,
                    embed_url=f"https://fast.wistia.net/embed/iframe/{media_id}",
                    thumbnail=f"https://fast.wistia.net/embed/medias/{media_id}/swatch"
                ))

        # Search for wistia_async_ class pattern
        for div in soup.find_all('div', class_=re.compile(r'wistia_async_')):
            classes = div.get('class', [])
            for cls in classes:
                if cls.startswith('wistia_async_'):
                    video_id = cls.replace('wistia_async_', '')
                    if video_id and video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                            source_type='wistia',
                            video_id=video_id,
                            embed_url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                            thumbnail=f"https://fast.wistia.net/embed/medias/{video_id}/swatch"
                        ))

        # Search in raw HTML for all patterns
        for pattern in self.WISTIA_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids and len(video_id) >= 8:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                        source_type='wistia',
                        video_id=video_id,
                        embed_url=f"https://fast.wistia.net/embed/iframe/{video_id}",
                        thumbnail=f"https://fast.wistia.net/embed/medias/{video_id}/swatch"
                    ))

        return videos

    async def _extract_loom_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Loom videos from embeds and links."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.LOOM_PATTERNS:
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://www.loom.com/share/{video_id}",
                            source_type='loom',
                            video_id=video_id,
                            embed_url=f"https://www.loom.com/embed/{video_id}"
                        ))

        # Search in links
        for a_tag in soup.find_all('a', href=True):
            href = a_tag.get('href', '')
            for pattern in self.LOOM_PATTERNS:
                match = re.search(pattern, href)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        title = a_tag.get_text(strip=True) or None
                        videos.append(VideoInfo(
                            url=f"https://www.loom.com/share/{video_id}",
                            source_type='loom',
                            video_id=video_id,
                            title=title if title and len(title) > 3 else None,
                            embed_url=f"https://www.loom.com/embed/{video_id}"
                        ))

        # Search in raw HTML
        for pattern in self.LOOM_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://www.loom.com/share/{video_id}",
                        source_type='loom',
                        video_id=video_id,
                        embed_url=f"https://www.loom.com/embed/{video_id}"
                    ))

        return videos

    async def _extract_mux_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Mux videos from stream URLs and mux-player elements."""
        videos = []
        found_ids: Set[str] = set()

        # Search for mux-player custom elements
        for player in soup.find_all('mux-player'):
            playback_id = player.get('playback-id') or player.get('data-playback-id')
            if playback_id and playback_id not in found_ids:
                found_ids.add(playback_id)
                videos.append(VideoInfo(
                    url=f"https://stream.mux.com/{playback_id}.m3u8",
                    source_type='mux',
                    video_id=playback_id,
                    embed_url=f"https://stream.mux.com/{playback_id}.m3u8",
                    thumbnail=f"https://image.mux.com/{playback_id}/thumbnail.jpg"
                ))

        # Search in raw HTML for all patterns
        for pattern in self.MUX_PATTERNS:
            for match in re.finditer(pattern, html_content):
                playback_id = match.group(1)
                if playback_id not in found_ids and len(playback_id) >= 8:
                    found_ids.add(playback_id)
                    videos.append(VideoInfo(
                        url=f"https://stream.mux.com/{playback_id}.m3u8",
                        source_type='mux',
                        video_id=playback_id,
                        embed_url=f"https://stream.mux.com/{playback_id}.m3u8",
                        thumbnail=f"https://image.mux.com/{playback_id}/thumbnail.jpg"
                    ))

        return videos

    async def _extract_cloudflare_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Cloudflare Stream videos."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.CLOUDFLARE_STREAM_PATTERNS:
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://iframe.videodelivery.net/{video_id}",
                            source_type='cloudflare',
                            video_id=video_id,
                            embed_url=f"https://iframe.videodelivery.net/{video_id}",
                            thumbnail=f"https://videodelivery.net/{video_id}/thumbnails/thumbnail.jpg"
                        ))

        # Search in raw HTML
        for pattern in self.CLOUDFLARE_STREAM_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids and len(video_id) >= 8:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://iframe.videodelivery.net/{video_id}",
                        source_type='cloudflare',
                        video_id=video_id,
                        embed_url=f"https://iframe.videodelivery.net/{video_id}",
                        thumbnail=f"https://videodelivery.net/{video_id}/thumbnails/thumbnail.jpg"
                    ))

        return videos

    async def _extract_vidyard_videos(self, soup: BeautifulSoup, html_content: str) -> List[VideoInfo]:
        """Extract Vidyard videos from embeds and links."""
        videos = []
        found_ids: Set[str] = set()

        # Search in iframes
        for iframe in soup.find_all('iframe'):
            src = iframe.get('src', '') or iframe.get('data-src', '')
            for pattern in self.VIDYARD_PATTERNS[:2]:
                match = re.search(pattern, src)
                if match:
                    video_id = match.group(1)
                    if video_id not in found_ids:
                        found_ids.add(video_id)
                        videos.append(VideoInfo(
                            url=f"https://play.vidyard.com/{video_id}",
                            source_type='vidyard',
                            video_id=video_id,
                            embed_url=f"https://play.vidyard.com/{video_id}"
                        ))

        # Search for vidyard-player elements
        for player in soup.find_all(['vidyard-player', 'div']):
            uuid = player.get('uuid') or player.get('data-uuid') or player.get('data-vidyard-uuid')
            if uuid and uuid not in found_ids:
                found_ids.add(uuid)
                videos.append(VideoInfo(
                    url=f"https://play.vidyard.com/{uuid}",
                    source_type='vidyard',
                    video_id=uuid,
                    embed_url=f"https://play.vidyard.com/{uuid}"
                ))

        # Search in raw HTML
        for pattern in self.VIDYARD_PATTERNS:
            for match in re.finditer(pattern, html_content):
                video_id = match.group(1)
                if video_id not in found_ids:
                    found_ids.add(video_id)
                    videos.append(VideoInfo(
                        url=f"https://play.vidyard.com/{video_id}",
                        source_type='vidyard',
                        video_id=video_id,
                        embed_url=f"https://play.vidyard.com/{video_id}"
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

    async def _extract_from_scripts(self, soup: BeautifulSoup, html_content: str, base_url: str) -> List[VideoInfo]:
        """Extract video URLs from inline scripts, Next.js data, and JS bundles."""
        videos = []
        seen_urls: Set[str] = set()

        # Look for Next.js __NEXT_DATA__ script
        next_data_script = soup.find('script', id='__NEXT_DATA__')
        if next_data_script and next_data_script.string:
            try:
                next_data = json.loads(next_data_script.string)
                # Recursively search for video URLs in the data
                video_urls = self._find_video_urls_in_json(next_data, base_url)
                for url, source_type, video_id in video_urls:
                    if url not in seen_urls:
                        seen_urls.add(url)
                        videos.append(VideoInfo(
                            url=url,
                            source_type=source_type,
                            video_id=video_id
                        ))
            except json.JSONDecodeError:
                pass

        # Look for Nuxt.js __NUXT__ data
        nuxt_patterns = [
            r'window\.__NUXT__\s*=\s*(\{[\s\S]*?\});?\s*(?:</script>|$)',
            r'__NUXT__\s*:\s*(\{[\s\S]*?\})\s*[,}]',
        ]
        for pattern in nuxt_patterns:
            match = re.search(pattern, html_content)
            if match:
                try:
                    # Try to parse as JSON (may not always work if it's JS)
                    nuxt_data = json.loads(match.group(1))
                    video_urls = self._find_video_urls_in_json(nuxt_data, base_url)
                    for url, source_type, video_id in video_urls:
                        if url not in seen_urls:
                            seen_urls.add(url)
                            videos.append(VideoInfo(
                                url=url,
                                source_type=source_type,
                                video_id=video_id
                            ))
                except (json.JSONDecodeError, TypeError):
                    pass

        # Look for video URLs in all script tags
        for script in soup.find_all('script'):
            script_content = script.string or ''
            if not script_content:
                continue

            # Look for JSON objects with video-related keys
            json_patterns = [
                r'\{[^{}]*"(?:video|videoUrl|videoSrc|mp4|webm|playbackId|hashedId|mediaId)"[^{}]*\}',
                r'\{[^{}]*"(?:src|url)":\s*"[^"]*\.(?:mp4|webm|m4v)"[^{}]*\}',
            ]
            for pattern in json_patterns:
                for match in re.finditer(pattern, script_content, re.IGNORECASE):
                    try:
                        obj = json.loads(match.group(0))
                        video_urls = self._find_video_urls_in_json(obj, base_url)
                        for url, source_type, video_id in video_urls:
                            if url not in seen_urls:
                                seen_urls.add(url)
                                videos.append(VideoInfo(
                                    url=url,
                                    source_type=source_type,
                                    video_id=video_id
                                ))
                    except json.JSONDecodeError:
                        pass

        # Look for HLS/DASH streaming URLs
        streaming_patterns = [
            r'(https?://[^\s\'"<>]+\.m3u8)',
            r'(https?://[^\s\'"<>]+\.mpd)',
        ]
        for pattern in streaming_patterns:
            for match in re.finditer(pattern, html_content):
                url = match.group(1)
                if url not in seen_urls:
                    seen_urls.add(url)
                    videos.append(VideoInfo(
                        url=url,
                        source_type='direct'
                    ))

        return videos

    def _find_video_urls_in_json(self, data: Any, base_url: str) -> List[tuple]:
        """Recursively find video URLs in JSON data. Returns list of (url, source_type, video_id) tuples."""
        results = []

        if isinstance(data, dict):
            # Check for direct video URL keys
            video_keys = ['video', 'videoUrl', 'videoSrc', 'video_url', 'src', 'url', 'mp4', 'webm', 'source']
            for key in video_keys:
                if key in data:
                    value = data[key]
                    if isinstance(value, str) and self._is_video_url(value):
                        results.append((urljoin(base_url, value), 'direct', None))

            # Check for platform-specific IDs
            if 'playbackId' in data or 'playback_id' in data:
                pid = data.get('playbackId') or data.get('playback_id')
                if pid and isinstance(pid, str):
                    results.append((
                        f"https://stream.mux.com/{pid}.m3u8",
                        'mux',
                        pid
                    ))

            if 'hashedId' in data or 'hashed_id' in data:
                hid = data.get('hashedId') or data.get('hashed_id')
                if hid and isinstance(hid, str):
                    results.append((
                        f"https://fast.wistia.net/embed/iframe/{hid}",
                        'wistia',
                        hid
                    ))

            # Recurse into all values
            for value in data.values():
                results.extend(self._find_video_urls_in_json(value, base_url))

        elif isinstance(data, list):
            for item in data:
                results.extend(self._find_video_urls_in_json(item, base_url))

        elif isinstance(data, str):
            # Check if this string is a video URL
            if self._is_video_url(data):
                results.append((urljoin(base_url, data), 'direct', None))
            # Check for embedded platform URLs
            for pattern in self.YOUTUBE_PATTERNS:
                match = re.search(pattern, data)
                if match:
                    vid = match.group(1)
                    results.append((f"https://www.youtube.com/watch?v={vid}", 'youtube', vid))
            for pattern in self.VIMEO_PATTERNS:
                match = re.search(pattern, data)
                if match:
                    vid = match.group(1)
                    results.append((f"https://vimeo.com/{vid}", 'vimeo', vid))
            for pattern in self.WISTIA_PATTERNS[:2]:
                match = re.search(pattern, data)
                if match:
                    vid = match.group(1)
                    results.append((f"https://fast.wistia.net/embed/iframe/{vid}", 'wistia', vid))
            for pattern in self.MUX_PATTERNS[:1]:
                match = re.search(pattern, data)
                if match:
                    vid = match.group(1)
                    results.append((f"https://stream.mux.com/{vid}.m3u8", 'mux', vid))

        return results

    def _is_video_url(self, url: str) -> bool:
        """Check if a URL looks like a video URL."""
        if not isinstance(url, str):
            return False
        url_lower = url.lower()
        # Check for video file extensions
        if any(ext in url_lower for ext in self.VIDEO_EXTENSIONS):
            return True
        # Check for streaming URLs
        if '.m3u8' in url_lower or '.mpd' in url_lower:
            return True
        return False

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
            'wistia': 25,  # Wistia is well-supported for marketing
            'loom': 24,  # Loom is common for demos
            'mux': 24,  # Mux is modern video platform
            'cloudflare': 24,  # Cloudflare Stream
            'vidyard': 23,  # Vidyard for B2B
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
    include_embeds: bool = True,
    use_browser: bool = False
) -> VideoScraperResult:
    """
    Convenience function to scrape videos from a website.

    Args:
        url: Website URL to scrape
        max_videos: Maximum number of videos to return
        include_embeds: Whether to include YouTube/Vimeo embeds
        use_browser: Whether to use headless browser for JS-rendered sites

    Returns:
        VideoScraperResult with found videos
    """
    async with VideoScraperService() as scraper:
        return await scraper.scrape_videos(url, max_videos, include_embeds, use_browser)


async def get_brand_videos(domain: str, max_videos: int = 5, use_browser: bool = True) -> List[Dict[str, Any]]:
    """
    Get videos from a brand's website.

    Args:
        domain: Brand domain (e.g., 'dyna.co')
        max_videos: Maximum number of videos to return
        use_browser: Whether to use headless browser (recommended for JS-rendered sites)

    Returns:
        List of video dictionaries
    """
    url = f"https://{domain}"
    result = await scrape_website_videos(url, max_videos, use_browser=use_browser)

    if result.success and result.videos:
        return [v.to_dict() for v in result.videos]

    # Try www subdomain as fallback
    url = f"https://www.{domain}"
    result = await scrape_website_videos(url, max_videos, use_browser=use_browser)

    return [v.to_dict() for v in result.videos] if result.success else []
