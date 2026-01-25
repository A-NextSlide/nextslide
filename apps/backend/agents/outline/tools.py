from __future__ import annotations

from typing import Literal, Optional, Dict, Any, List, Tuple
import os
import asyncio
from pydantic import Field

from models.tools import ToolModel


def _find_slide_index(outline: Dict[str, Any], slide_id: Optional[str], slide_index: Optional[int]) -> Optional[int]:
    slides = (outline or {}).get("slides") or []
    if slide_index is not None and 0 <= slide_index < len(slides):
        return slide_index
    if slide_id:
        for i, s in enumerate(slides):
            if (s or {}).get("id") == slide_id:
                return i
    return None


class UpdateSlideContentArgs(ToolModel):
    tool_name: Literal["update_slide_content"] = Field(description="Update the title/content/notes for a specific slide.")
    slide_id: Optional[str] = Field(default=None, description="Slide id to update")
    slide_index: Optional[int] = Field(default=None, description="Slide index to update")
    title: Optional[str] = Field(default=None, description="New title if provided")
    content: Optional[str] = Field(default=None, description="New content if provided")
    speaker_notes: Optional[str] = Field(default=None, description="New speaker notes if provided")


def update_slide_content(args: UpdateSlideContentArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    if idx is None:
        return outline, "No-op: slide not found"
    slides = outline.get("slides", [])
    slide = slides[idx]
    if args.title is not None:
        slide["title"] = args.title
    if args.content is not None:
        slide["content"] = args.content
    if args.speaker_notes is not None:
        slide["speaker_notes"] = args.speaker_notes
    return outline, f"Updated slide {slide.get('id') or idx}"


class AddSlideArgs(ToolModel):
    tool_name: Literal["add_slide"] = Field(description="Add a new slide after a given index.")
    after_index: Optional[int] = Field(default=None, description="Insert after this index (append if None)")
    title: str = Field(description="Title of the new slide")
    content: str = Field(description="Body content")


def add_slide(args: AddSlideArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    slides: List[Dict[str, Any]] = outline.setdefault("slides", [])
    import uuid as _uuid
    new_slide = {
        "id": str(_uuid.uuid4()),
        "title": args.title,
        "content": args.content,
        "slide_type": "content",
        "narrative_role": "supporting",
        "speaker_notes": "",
        "deepResearch": False,
        "taggedMedia": []
    }
    if args.after_index is None or args.after_index < 0 or args.after_index >= len(slides):
        slides.append(new_slide)
    else:
        slides.insert(args.after_index + 1, new_slide)
    return outline, f"Added slide '{args.title}'"


class RemoveSlideArgs(ToolModel):
    tool_name: Literal["remove_slide_outline"] = Field(description="Remove a slide by id or index (outline editing).")
    slide_id: Optional[str] = Field(default=None, description="Slide id to remove")
    slide_index: Optional[int] = Field(default=None, description="Slide index to remove")


def remove_slide_outline(args: RemoveSlideArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    slides = outline.get("slides", [])
    if idx is not None and 0 <= idx < len(slides):
        removed = slides.pop(idx)
        return outline, f"Removed slide {removed.get('id') or idx}"
    return outline, "No-op: slide not found"


class MoveSlideArgs(ToolModel):
    tool_name: Literal["move_slide_outline"] = Field(description="Reorder a slide from one position to another.")
    from_index: int = Field(description="Current index")
    to_index: int = Field(description="New index")


def move_slide_outline(args: MoveSlideArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    slides = outline.get("slides", [])
    if not (0 <= args.from_index < len(slides) and 0 <= args.to_index < len(slides)):
        return outline, "No-op: invalid indices"
    s = slides.pop(args.from_index)
    slides.insert(args.to_index, s)
    return outline, f"Moved slide {s.get('id') or args.from_index} to {args.to_index}"


class ResearchSlideArgs(ToolModel):
    tool_name: Literal["research_slide_outline"] = Field(description="Research the slide topic and add supporting bullets or data (extractedData) to the slide.")
    slide_id: Optional[str] = Field(default=None, description="Slide id to enrich")
    slide_index: Optional[int] = Field(default=None, description="Slide index to enrich")
    query_override: Optional[str] = Field(default=None, description="Custom query (defaults to slide title)")
    add_chart: bool = Field(default=False, description="If true and data found, add extractedData with chart suggestion")


def research_slide_outline(args: ResearchSlideArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    if idx is None:
        return outline, "No-op: slide not found"
    slide = outline.get("slides", [])[idx]
    topic = (args.query_override or slide.get("title") or "").strip()
    if not topic:
        return outline, "No-op: empty topic"

    # Use existing research pipeline
    from agents.research.tools import stream_research

    findings: List[Dict[str, Any]] = []

    async def _run() -> List[Dict[str, Any]]:
        out: List[Dict[str, Any]] = []
        async for ev in stream_research(topic, style_context=None, per_query_results=4):
            if ev.get("type") == "research_complete":
                out = ev.get("findings") or []
        return out

    try:
        findings = asyncio.run(_run()) or []
    except Exception:
        findings = []

    # Append concise bullets to content
    bullets = []
    for f in findings[:6]:
        title = (f or {}).get("title") or ""
        summary = (f or {}).get("summary") or ""
        if title and summary:
            bullets.append(f"• {title}: {summary}")
    if bullets:
        body = slide.get("content") or ""
        sep = "\n" if body.endswith("\n") or body == "" else "\n"
        slide["content"] = (body + sep + "\n".join(bullets)).strip()
        slide["deepResearch"] = True

    # Optional: add a simple extractedData structure
    if args.add_chart and findings:
        # Very simple synthesis: count mentions per finding title
        items = []
        for f in findings[:5]:
            t = (f or {}).get("title") or "Item"
            items.append({"name": t[:40], "value": 1})
        if items:
            slide["extractedData"] = {
                "source": "outline_research",
                "chartType": "bar",
                "title": f"Key findings on {topic}",
                "data": items,
                "metadata": {}
            }

    return outline, f"Enriched slide {slide.get('id') or idx} with research findings"


# ---------------------------------------------
# Firecrawl outline tool: fetch context/images
# ---------------------------------------------
class FirecrawlOutlineArgs(ToolModel):
    tool_name: Literal["firecrawl_outline_fetch"] = Field(
        description=(
            "Use Firecrawl to fetch web data or images and update the slide's content. "
            "When users request external data or images, use this tool."
        )
    )
    slide_id: Optional[str] = Field(default=None, description="Slide id to update")
    slide_index: Optional[int] = Field(default=None, description="Slide index to update")
    operation: Literal["search", "scrape"] = Field(default="search", description="Firecrawl operation")
    query: Optional[str] = Field(default=None, description="Search query")
    url: Optional[str] = Field(default=None, description="URL to scrape")
    mode: Literal["append", "replace"] = Field(default="append", description="How to apply fetched text to content")
    add_image: bool = Field(default=False, description="If true, insert the first found image as tagged media placeholder")


def firecrawl_outline_fetch(args: FirecrawlOutlineArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    if idx is None:
        return outline, "No-op: slide not found"
    slides = outline.get("slides", [])
    slide = slides[idx]

    # Use shared Firecrawl service
    try:
        from services.firecrawl_service import get_firecrawl_service
        svc = get_firecrawl_service()
        if not svc.is_configured():
            return outline, "No-op: Firecrawl not configured"
        if args.operation == "scrape" and args.url:
            res = svc.scrape(args.url, formats=["markdown", "html"]) or {}
            data = (res or {}).get("data") or res
            text = (data or {}).get("markdown") or (data or {}).get("metadata", {}).get("title") or ""
        else:
            res = svc.search(query=args.query or (args.url or ""), limit=3) or {}
            data = (res or {}).get("data") or res
            items = (data or {}).get("web") or []
            lines = []
            for it in items[:3]:
                title = (it or {}).get("title") or ""
                desc = (it or {}).get("description") or ""
                url = (it or {}).get("url") or ""
                if title or desc:
                    lines.append(f"• {title}: {desc} ({url})".strip())
            text = "\n".join(lines)
    except Exception:
        text = ""

    if text:
        body = slide.get("content") or ""
        if args.mode == "replace":
            slide["content"] = text.strip()
        else:
            sep = "\n" if body.endswith("\n") or body == "" else "\n"
            slide["content"] = (body + sep + text).strip()

    if args.add_image:
        # Append a taggedMedia entry with placeholder URL if an image is found in search
        try:
            images = (data or {}).get("images") or []  # type: ignore[name-defined]
            if images:
                first = images[0]
                url = first.get("imageUrl") or first.get("url")
                if url:
                    tm = slide.setdefault("taggedMedia", [])
                    tm.append({
                        "type": "image",
                        "url": url,
                        "source": "firecrawl"
                    })
        except Exception:
            pass

    return outline, f"Updated slide {(slide or {}).get('id') or idx} with Firecrawl results"


# ---------------------------------------------
# Firecrawl agent tool: deep extract
# ---------------------------------------------
class DeepExtractArgs(ToolModel):
    tool_name: Literal["deep_extract"] = Field(
        description=(
            "Use Firecrawl Agent or Scrape to deeply extract structured data from a website. "
            "Best for multi-page or site-specific extraction like case studies, investors, or pricing details."
        )
    )
    slide_id: Optional[str] = Field(default=None, description="Slide id to update")
    slide_index: Optional[int] = Field(default=None, description="Slide index to update")
    query: Optional[str] = Field(default=None, description="Extraction goal or question")
    url: Optional[str] = Field(default=None, description="Primary URL to focus on")
    urls: Optional[List[str]] = Field(default=None, description="Optional list of URLs to scope the extraction")
    mode: Literal["append", "replace"] = Field(default="append", description="How to apply extracted text to content")
    max_credits: Optional[int] = Field(default=60, description="Max Firecrawl agent credits")
    include_videos: bool = Field(default=False, description="If true, include videos via fallback scraping")
    schema: Optional[Dict[str, Any]] = Field(default=None, description="Optional schema hint for structured extraction")


def deep_extract(args: DeepExtractArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    if idx is None:
        return outline, "No-op: slide not found"

    slides = outline.get("slides", [])
    slide = slides[idx]

    try:
        from services.firecrawl_agent_service import get_firecrawl_agent_service, ExtractRequest
        svc = get_firecrawl_agent_service()
        if not svc.is_configured() and not os.getenv("PPLX_API_KEY") and not os.getenv("PERPLEXITY_API_KEY"):
            return outline, "No-op: Firecrawl and Perplexity not configured"

        query = (args.query or "").strip()
        if not query:
            query = f"Extract key information from {args.url or (args.urls[0] if args.urls else 'the site')}"

        req = ExtractRequest(
            query=query,
            url=args.url,
            urls=args.urls,
            schema=args.schema,
            max_credits=args.max_credits or 60,
            include_videos=args.include_videos,
        )
        result = svc.extract_sync(req)
        if not result.success:
            return outline, f"No-op: Deep extract failed: {result.error or 'Unknown error'}"

        text = result.text or ""
        if result.citations:
            text = (text + "\n\nSources:\n" + "\n".join(result.citations[:5])).strip()

        if text:
            body = slide.get("content") or ""
            if args.mode == "replace":
                slide["content"] = text.strip()
            else:
                sep = "\n" if body.endswith("\n") or body == "" else "\n"
                slide["content"] = (body + sep + text).strip()
            slide["deepResearch"] = True

        # Attach videos if found
        if result.videos:
            tm = slide.setdefault("taggedMedia", [])
            for video in result.videos[:3]:
                url = video.get("url") or video.get("embed_url")
                if not url:
                    continue
                tm.append({
                    "type": "video",
                    "url": url,
                    "source": result.route,
                })

        return outline, f"Deep extracted content for slide {(slide or {}).get('id') or idx}"

    except Exception as e:
        return outline, f"No-op: Deep extract error: {str(e)}"


# ---------------------------------------------
# Scrape media for custom component generation
# ---------------------------------------------
class ScrapeMediaForSlideArgs(ToolModel):
    tool_name: Literal["scrape_media_for_slide"] = Field(
        description=(
            "Scrape images, GIFs, and media from a website URL to use in slide generation. "
            "Use this when users want to pull content from a specific website (e.g., 'pull GIFs from dyna.co'). "
            "The scraped media will be used by the custom component generator to create interactive displays."
        )
    )
    slide_id: Optional[str] = Field(default=None, description="Slide id to attach media to")
    slide_index: Optional[int] = Field(default=None, description="Slide index to attach media to")
    url: str = Field(description="Website URL to scrape for media")
    media_filter: Optional[str] = Field(
        default=None,
        description="Filter for specific media types: 'gifs', 'images', 'all'. Defaults to 'all'"
    )
    content_context: Optional[str] = Field(
        default=None,
        description="Additional context about how to use this media (e.g., 'product showcase', 'demo reel')"
    )


def scrape_media_for_slide(args: ScrapeMediaForSlideArgs, outline: Dict[str, Any]) -> Tuple[Dict[str, Any], str]:
    """
    Scrape media from a URL and store it in the slide for custom component generation.
    """
    idx = _find_slide_index(outline, args.slide_id, args.slide_index)
    if idx is None:
        return outline, "No-op: slide not found"

    slides = outline.get("slides", [])
    slide = slides[idx]

    try:
        from services.firecrawl_service import get_firecrawl_service
        svc = get_firecrawl_service()
        if not svc.is_configured():
            return outline, "No-op: Firecrawl not configured"

        # Use the new extract_site_content method
        result = svc.extract_site_content(args.url)
        if not result.get("success"):
            return outline, f"No-op: Failed to scrape {args.url}: {result.get('error', 'Unknown error')}"

        data = result.get("data", {})

        # Filter media based on user preference
        media_filter = (args.media_filter or "all").lower()
        if media_filter == "gifs":
            media_urls = data.get("gifs", [])
            media_type = "gifs"
        elif media_filter == "images":
            media_urls = data.get("images", [])
            media_type = "images"
        else:
            media_urls = data.get("all_media", [])
            media_type = "all"

        if not media_urls:
            return outline, f"No-op: No {media_type} found at {args.url}"

        # Store scraped media in slide metadata for custom component generation
        scraped_media = {
            "source_url": args.url,
            "gifs": data.get("gifs", []),
            "images": data.get("images", []),
            "all_media": data.get("all_media", []),
            "markdown": data.get("markdown", "")[:1000],  # Truncate for context
            "metadata": data.get("metadata", {}),
            "content_context": args.content_context or "",
            "media_filter": media_filter,
        }

        # Store in slide's scrapedMedia field
        slide["scrapedMedia"] = scraped_media

        # Also add to taggedMedia for visibility
        for url in media_urls[:5]:  # Limit to first 5
            is_gif = ".gif" in url.lower()
            tm = slide.setdefault("taggedMedia", [])
            tm.append({
                "type": "gif" if is_gif else "image",
                "url": url,
                "source": "firecrawl_scrape",
                "source_url": args.url
            })

        # Update slide content to mention the scraped media
        media_note = f"\n[Scraped {len(media_urls)} {media_type} from {args.url}]"
        body = slide.get("content") or ""
        if media_note not in body:
            slide["content"] = (body + media_note).strip()

        return outline, f"Scraped {len(media_urls)} {media_type} from {args.url} for slide {slide.get('id') or idx}"

    except Exception as e:
        return outline, f"No-op: Error scraping media: {str(e)}"
