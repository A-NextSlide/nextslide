import asyncio
import json
import re
from typing import Dict, Any, List

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def scrape_media_from_url(url: str, media_filter: str = "all") -> Dict[str, Any]:
    """
    Scrape media (GIFs, images, videos) from a website URL.
    Uses Firecrawl for images/GIFs and VideoScraperService for videos.
    Returns structured media data for use in slide generation.
    """
    results = {
        "success": False,
        "gifs": [],
        "images": [],
        "videos": [],
        "all_media": [],
        "markdown": "",
        "source_url": url,
        "error": None
    }

    try:
        # 1. Scrape videos using our Playwright-based video scraper
        try:
            from services.video_scraper_service import scrape_website_videos
            logger.info(f"[OutlineAgent] 🎬 Scraping videos from: {url}")
            video_result = await scrape_website_videos(url, max_videos=10, use_browser=True)
            if video_result.success and video_result.videos:
                results["videos"] = [v.to_dict() for v in video_result.videos]
                logger.info(f"[OutlineAgent] 🎬 Found {len(results['videos'])} videos")
        except Exception as video_err:
            logger.warning(f"[OutlineAgent] Video scraping failed: {video_err}")

        # 2. Scrape images/GIFs using Firecrawl
        from services.firecrawl_service import get_firecrawl_service
        svc = get_firecrawl_service()

        if svc.is_configured():
            logger.info(f"[OutlineAgent] Scraping images from URL: {url}, filter: {media_filter}")

            # Use the new extract_site_content method
            result = svc.extract_site_content(url)

            if result.get("success"):
                data = result.get("data", {})
                results["gifs"] = data.get("gifs", [])
                results["images"] = data.get("images", [])
                results["all_media"] = data.get("all_media", [])
                results["markdown"] = data.get("markdown", "")[:2000]  # Truncate for context
                results["metadata"] = data.get("metadata", {})

                logger.info(f"[OutlineAgent] Scraped media: {len(results['gifs'])} GIFs, {len(results['images'])} images")
            else:
                logger.warning(f"[OutlineAgent] Firecrawl scrape failed: {result.get('error')}")
        else:
            logger.warning("[OutlineAgent] Firecrawl not configured, skipping image scrape")

        # Apply filter
        if media_filter == "gifs":
            results["filtered_media"] = results["gifs"]
        elif media_filter == "images":
            results["filtered_media"] = results["images"]
        elif media_filter == "videos":
            results["filtered_media"] = results["videos"]
        else:
            # "all" - combine everything
            results["filtered_media"] = results["all_media"] + results["videos"]

        # Mark success if we got ANY media
        if results["videos"] or results["gifs"] or results["images"]:
            results["success"] = True

    except Exception as e:
        logger.error(f"[OutlineAgent] Media scraping error: {e}")
        results["error"] = str(e)

    return results

async def assign_videos_to_slides(slides: List[Dict], videos: List[Dict], presentation_topic: str = "") -> List[Dict]:
    """
    Use AI to intelligently assign videos to appropriate slides.
    First evaluates if videos are worth using, then assigns if quality is good.

    Args:
        slides: List of slide outlines with title, content, key_points
        videos: List of video dicts with url, title, source_type, thumbnail
        presentation_topic: Optional topic for better relevance matching

    Returns:
        Updated slides list with 'assignedVideo' field on appropriate slides
    """
    if not videos or not slides:
        return slides

    # Parse video titles and gather quality signals
    video_info = []
    for i, video in enumerate(videos):
        url = video.get('url', '')
        title = video.get('title', '')
        source_type = video.get('source_type', 'unknown')

        # Parse title from URL if not provided
        if not title and url:
            filename = url.split('/')[-1].split('?')[0]
            title = filename.rsplit('.', 1)[0]
            title = title.replace('-Compressed', '').replace('-compressed', '')
            title = title.replace('-1080', '').replace('-720', '').replace('-480', '')
            title = title.replace('-', ' ').replace('_', ' ')

        video_info.append({
            "index": i,
            "title": title or f"Video {i+1}",
            "url": url,
            "source_type": source_type,  # youtube, vimeo, wistia, etc.
            "thumbnail": video.get('thumbnail', '')
        })

    # Build slide summaries
    slide_info = []
    for i, slide in enumerate(slides):
        slide_info.append({
            "index": i,
            "title": slide.get('title', f'Slide {i+1}'),
            "content": slide.get('content', '')[:200],  # Truncate for prompt size
            "key_points": slide.get('key_points', [])[:3]
        })

    # Infer topic from slides if not provided
    if not presentation_topic:
        presentation_topic = slides[0].get('title', '') if slides else 'Unknown'

    # Create the prompt for video evaluation AND assignment (single call for efficiency)
    prompt = (
        "Assign at most two videos total, only when the match is obvious. "
        "Prefer a hero/title or product/demo slide. "
        "If nothing is clearly relevant, set use_videos=false. "
        "Never assign a video just to fill space. "
        "Return JSON: {\"use_videos\": bool, \"assignments\": {slide_index: video_index}, "
        "\"reasoning\": \"...\"}.\\n\\n"
        f"Topic: {presentation_topic}\\n\\n"
        f"Videos: {json.dumps(video_info, indent=2)}\\n\\n"
        f"Slides: {json.dumps(slide_info, indent=2)}"
    )

    try:
        # Use Gemini Flash for fast, cheap evaluation and assignment
        from google import genai

        client = genai.Client()
        response = await asyncio.wait_for(
            asyncio.to_thread(
                client.models.generate_content,
                model="gemini-2.0-flash-lite",
                contents=prompt,
                config=genai.types.GenerateContentConfig(
                    temperature=0.1,  # Low temperature for consistent decisions
                    max_output_tokens=300,
                )
            ),
            timeout=20.0,
        )

        result_text = response.text.strip()

        # Extract JSON from response
        if '```' in result_text:
            # Extract from code block
            match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', result_text, re.DOTALL)
            if match:
                result_text = match.group(1)

        # Parse the evaluation result
        result = json.loads(result_text)

        use_videos = result.get('use_videos', False)
        assignments = result.get('assignments', {})
        reasoning = result.get('reasoning', 'No reason provided')

        logger.info(f"[OutlineAgent] 🎬 Video evaluation: use_videos={use_videos}, reasoning='{reasoning}'")

        # If videos aren't worth using, return slides unchanged
        if not use_videos:
            logger.info(f"[OutlineAgent] 🎬 Skipping video assignment - {reasoning}")
            return slides

        if isinstance(assignments, dict):
            ordered = sorted(
                assignments.items(),
                key=lambda item: int(item[0]) if str(item[0]).isdigit() else 10**9,
            )
            if len(ordered) > 2:
                logger.info("[OutlineAgent] 🎬 Limiting video assignments to 2 per deck")
            assignments = dict(ordered[:2])

        logger.info(f"[OutlineAgent] 🎬 Video assignments: {assignments}")

        # Apply assignments to slides
        used_videos = set()
        for slide_idx_str, video_idx in assignments.items():
            if len(used_videos) >= 2:
                break
            slide_idx = int(slide_idx_str)
            if 0 <= slide_idx < len(slides) and 0 <= video_idx < len(videos):
                if video_idx not in used_videos:  # Prevent duplicates
                    slides[slide_idx]['assignedVideo'] = videos[video_idx]
                    used_videos.add(video_idx)
                    logger.info(f"[OutlineAgent] 🎬 Assigned video '{video_info[video_idx]['title']}' to slide {slide_idx}: '{slides[slide_idx].get('title')}'")

        return slides

    except asyncio.TimeoutError:
        logger.warning("[OutlineAgent] Video assignment timed out")
        return slides
    except Exception as e:
        logger.warning(f"[OutlineAgent] Video assignment failed: {e}")
        # On failure, don't assign any videos (conservative approach)
        return slides

async def scrape_reference_links(urls: List[str], include_videos: bool = True) -> Dict[str, Any]:
    """
    Scrape content from reference links using Firecrawl and video scraper.
    Also extracts videos from the websites.
    """
    results = {
        "success": False,
        "scraped_content": [],
        "videos": [],  # Videos found on the websites
        "error": None
    }

    try:
        from services.firecrawl_service import get_firecrawl_service
        svc = get_firecrawl_service()

        if not svc.is_configured():
            logger.warning("[OutlineAgent] Firecrawl not configured, skipping URL scraping")
            results["error"] = "Firecrawl not configured"
            return results

        scraped_items = []
        all_videos = []

        for url in urls[:3]:  # Limit to 3 URLs
            try:
                logger.info(f"[OutlineAgent] Scraping URL: {url}")
                video_task = None
                if include_videos:
                    try:
                        from services.video_scraper_service import scrape_website_videos
                        video_task = asyncio.create_task(scrape_website_videos(url, max_videos=5, use_browser=True))
                    except Exception as video_err:
                        logger.warning(f"[OutlineAgent] Video scraping init failed for {url}: {video_err}")

                try:
                    res = await asyncio.to_thread(svc.scrape, url, formats=["markdown"])
                except Exception as scrape_err:
                    logger.warning(f"[OutlineAgent] Firecrawl scrape failed for {url}: {scrape_err}")
                    res = {"success": False, "error": str(scrape_err)}

                if res.get("success"):
                    data = res.get("data") or res
                    markdown_content = data.get("markdown") or "" if isinstance(data, dict) else getattr(data, 'markdown', '')
                    # Try to get title from metadata if available
                    title = url
                    metadata = data.get("metadata") if isinstance(data, dict) else getattr(data, 'metadata', None)
                    if metadata:
                        if isinstance(metadata, dict):
                            title = metadata.get("title") or metadata.get("ogTitle") or url
                        elif hasattr(metadata, 'title'):
                            title = getattr(metadata, 'title', None) or getattr(metadata, 'ogTitle', None) or url
                    scraped_items.append({
                        "url": url,
                        "content": markdown_content[:8000] if markdown_content else "",
                        "title": title,
                    })
                    logger.info(f"[OutlineAgent] Scraped {url}: {len(markdown_content) if markdown_content else 0} chars")

                # Also scrape videos from the URL (use browser for JS-rendered sites)
                if include_videos and video_task is not None:
                    try:
                        video_result = await video_task
                        if video_result.success and video_result.videos:
                            for video in video_result.videos:
                                all_videos.append(video.to_dict())
                            logger.info(f"[OutlineAgent] 🎬 Found {len(video_result.videos)} videos from {url}")
                    except Exception as video_err:
                        logger.warning(f"[OutlineAgent] Video scraping failed for {url}: {video_err}")

            except Exception as e:
                logger.warning(f"[OutlineAgent] Failed to scrape {url}: {e}")
                continue

        if scraped_items:
            results["success"] = True
            results["scraped_content"] = scraped_items

        if all_videos:
            results["videos"] = all_videos
            logger.info(f"[OutlineAgent] 🎬 Total videos scraped: {len(all_videos)}")

    except Exception as e:
        logger.error(f"[OutlineAgent] URL scraping failed: {e}")
        results["error"] = str(e)

    return results


async def scrape_reference_videos(urls: List[str]) -> Dict[str, Any]:
    """
    Scrape videos from reference URLs using the Playwright-based video scraper.
    Returns a dict with success flag and collected videos.
    """
    results = {
        "success": False,
        "videos": [],
        "error": None,
    }

    if not urls:
        return results

    all_videos: List[Dict[str, Any]] = []

    for url in urls[:3]:
        try:
            from services.video_scraper_service import scrape_website_videos
            logger.info(f"[OutlineAgent] 🎬 Scraping videos from: {url}")
            video_result = await scrape_website_videos(url, max_videos=5, use_browser=True)
            if video_result.success and video_result.videos:
                for video in video_result.videos:
                    all_videos.append(video.to_dict())
                logger.info(f"[OutlineAgent] 🎬 Found {len(video_result.videos)} videos from {url}")
        except Exception as video_err:
            logger.warning(f"[OutlineAgent] Video scraping failed for {url}: {video_err}")

    if all_videos:
        results["success"] = True
        deduped: Dict[str, Dict[str, Any]] = {}
        for video in all_videos:
            key = video.get("url") or video.get("embed_url") or str(len(deduped))
            if key not in deduped:
                deduped[key] = video
        results["videos"] = list(deduped.values())

    return results
