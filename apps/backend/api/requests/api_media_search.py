"""
Media search endpoint for finding images, videos, and gifs using SerpAPI.
"""

import logging
from typing import Dict, Any, List, Literal
from pydantic import BaseModel, Field
from services.serpapi_service import SerpAPIService
from services.combined_image_service import CombinedImageService
from services.perplexity_image_service import PerplexityImageService

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
    Process media search request using configured provider.
    - images: Per provider flag (Perplexity or SerpAPI) via CombinedImageService
    - videos/gifs: SerpAPI
    """
    try:
        async with SerpAPIService() as serpapi_service:
            if not serpapi_service.is_available:
                logger.error("SerpAPI service is not available - API key not set")
                return MediaSearchResponse(
                    results=[],
                    total=0,
                    query=request.query,
                    type=request.type
                )
            
            # Call the appropriate search method based on media type
            if request.type == "videos":
                raw_results = await serpapi_service.search_videos(
                    query=request.query,
                    per_page=request.limit
                )
            elif request.type == "gifs":
                # Prefer Perplexity for GIFs; fallback to SerpAPI
                pplx = PerplexityImageService()
                if pplx.is_available:
                    raw_results = await pplx.search_gifs(query=request.query, per_page=request.limit)
                else:
                    raw_results = await serpapi_service.search_gifs(
                        query=request.query,
                        per_page=request.limit
                    )
            else:  # images
                # Use combined image service to honor IMAGE_SEARCH_PROVIDER
                async with CombinedImageService() as image_service:
                    # Request more results to give UI ample choices
                    raw_results = await image_service.search_images(
                        query=request.query,
                        per_page=max(40, request.limit)
                    )
            
            # Transform results to our response format
            results = []
            
            if request.type == "videos":
                # Process video results
                for video in raw_results.get("videos", []):
                    results.append(MediaSearchResult(
                        title=video.get("title", ""),
                        link=video.get("link", ""),
                        thumbnail=video.get("thumbnail", ""),
                        source=video.get("source", ""),
                        width=0,  # Videos don't have dimensions in search results
                        height=0
                    ))
            else:
                # Process image/gif results
                for photo in raw_results.get("photos", []):
                    results.append(MediaSearchResult(
                        title=photo.get("alt", ""),
                        link=photo.get("url", ""),
                        thumbnail=photo.get("src", {}).get("thumbnail", photo.get("url", "")),
                        source=photo.get("photographer", ""),
                        width=photo.get("width", 0),
                        height=photo.get("height", 0)
                    ))
            
            logger.info(f"Media search completed: {request.type} query='{request.query}' found {len(results)} results")
            
            return MediaSearchResponse(
                results=results,
                total=raw_results.get("total_results", len(results)),
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