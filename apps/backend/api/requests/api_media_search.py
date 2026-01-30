"""
Media search endpoint for finding images, videos, and gifs using SerpAPI.
"""

import logging
from typing import Dict, Any, List, Literal
from pydantic import BaseModel, Field
from services.combined_image_service import CombinedImageService
from urllib.parse import quote_plus
import re
import httpx

logger = logging.getLogger(__name__)


class MediaSearchRequest(BaseModel):
    """Request model for media search endpoint"""
    query: str = Field(..., description="Search query term")
    type: Literal["images", "videos", "gifs"] = Field(..., description="Type of media to search for")
    limit: int = Field(20, description="Maximum number of results to return", ge=1, le=100)


class MediaSearchResult(BaseModel):
    """Individual media search result"""
    title: str = Field(..., description="Title of the media")
    link: str = Field(..., description="Direct link to the media")
    thumbnail: str = Field(..., description="Thumbnail URL")
    source: str = Field(default="", description="Source of the media")
    width: int = Field(default=0, description="Width of the media")
    height: int = Field(default=0, description="Height of the media")


class MediaSearchResponse(BaseModel):
    """Response model for media search endpoint"""
    results: List[MediaSearchResult] = Field(default_factory=list)
    total: int = Field(0, description="Total number of results found")
    query: str = Field(..., description="The search query used")
    type: str = Field(..., description="The media type searched")


async def process_media_search(request: MediaSearchRequest) -> MediaSearchResponse:
    """
    Process media search request using SerpAPI for real image results.
    """
    try:
        results: List[MediaSearchResult] = []
        total = 0

        if request.type == "images":
            # Use SerpAPI for real image search
            from services.serpapi_service import SerpAPIService
            serpapi = SerpAPIService()
            
            if serpapi.is_available:
                raw_results = await serpapi.search_images(
                    query=request.query,
                    per_page=request.limit
                )
                
                # SerpAPI returns results in "photos" key after processing
                photos = raw_results.get("photos", [])
                for idx, img in enumerate(photos[:request.limit]):
                    results.append(MediaSearchResult(
                        title=img.get("alt", request.query),
                        link=img.get("url", img.get("src", {}).get("original", "")),
                        thumbnail=img.get("src", {}).get("small", img.get("url", "")),
                        source=img.get("photographer", "google"),
                        width=img.get("width") or 0,
                        height=img.get("height") or 0,
                    ))
                total = len(results)
            else:
                logger.warning("SerpAPI not available, using fallback placeholder images")
                # Fallback to picsum if SerpAPI unavailable
                count = max(1, min(request.limit, 20))
                for i in range(count):
                    seed = abs(hash(request.query + str(i))) % 1000
                    full = f"https://picsum.photos/seed/{seed}/1024/768"
                    thumb = f"https://picsum.photos/seed/{seed}/320/240"
                    results.append(MediaSearchResult(
                        title=f"{request.query} #{i+1}",
                        link=full,
                        thumbnail=thumb,
                        source="picsum",
                        width=1024,
                        height=768,
                    ))
                total = len(results)
        elif request.type == "videos":
            # Use SerpAPI for video search or fallback to website scraping
            from services.serpapi_service import SerpAPIService
            serpapi = SerpAPIService()

            if serpapi.is_available:
                try:
                    # SerpAPI can search YouTube videos via google search
                    raw_results = await serpapi.search_videos(
                        query=request.query,
                        per_page=request.limit
                    )

                    videos = raw_results.get("videos", [])
                    for video in videos[:request.limit]:
                        results.append(MediaSearchResult(
                            title=video.get("title", request.query),
                            link=video.get("link", video.get("url", "")),
                            thumbnail=video.get("thumbnail", ""),
                            source=video.get("source", "youtube"),
                            width=video.get("width", 1920),
                            height=video.get("height", 1080),
                        ))
                    total = len(results)
                except Exception as e:
                    logger.warning(f"SerpAPI video search failed: {e}, trying website scraping")
                    # Fallback: try to scrape videos from a relevant website
                    from services.video_scraper_service import scrape_website_videos

                    # Search for company website based on query
                    domain = request.query.lower().replace(" ", "").replace(".", "") + ".com"
                    scrape_result = await scrape_website_videos(f"https://{domain}", max_videos=request.limit, use_browser=True)

                    if scrape_result.success:
                        for video in scrape_result.videos:
                            results.append(MediaSearchResult(
                                title=video.title or request.query,
                                link=video.embed_url or video.url,
                                thumbnail=video.thumbnail or "",
                                source=video.source_type,
                                width=1920,
                                height=1080,
                            ))
                    total = len(results)
            else:
                # No video search available - return empty
                logger.warning("Video search not available - SerpAPI not configured")
                results = []
                total = 0
        else:
            # GIFs not implemented
            results = []
            total = 0

        logger.debug(f"Media search completed: {request.type} query='{request.query}' found {len(results)} results")

        return MediaSearchResponse(
            results=results,
            total=total,
            query=request.query,
            type=request.type
        )
            
    except Exception as e:
        logger.error(f"Error in media search: {str(e)}", exc_info=True)
        return MediaSearchResponse(
            results=[],
            total=0,
            query=request.query,
            type=request.type
        ) 