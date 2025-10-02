from __future__ import annotations

from typing import Optional, Dict, Any, Literal
from pydantic import Field
import uuid as _uuid

from models.tools import ToolModel
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff
from models.component import ComponentDiffBase
from setup_logging_optimized import get_logger
from utils.deck import get_component_info, get_component_properties, find_current_slide
from services.firecrawl_service import get_firecrawl_service
from agents.editing.tools.slide_ops import insert_image, InsertImageArgs

logger = get_logger(__name__)


class FirecrawlFetchArgs(ToolModel):
    tool_name: Literal["firecrawl_fetch"] = Field(
        description=(
            "Fetch content or images using Firecrawl (search/scrape) and apply to a slide. "
            "Use to update component text from the web or insert an image based on a query or URL."
        )
    )
    slide_id: str = Field(description="Target slide id")
    component_id: Optional[str] = Field(default=None, description="Existing component id to update (for text)")
    query: Optional[str] = Field(default=None, description="Search query when operation is 'search'")
    url: Optional[str] = Field(default=None, description="URL to scrape when operation is 'scrape'")
    operation: Literal["search", "scrape"] = Field(default="search", description="Choose Firecrawl operation")
    apply: Literal[
        "replace_component_text",
        "append_component_text",
        "create_text_block",
        "insert_image",
    ] = Field(default="append_component_text", description="How to apply the fetched result")
    # Image placement (used when apply == insert_image)
    id: Optional[str] = Field(default=None, description="New component id (for created components)")
    x: Optional[float] = Field(default=200, description="x position in pixels for inserted image")
    y: Optional[float] = Field(default=200, description="y position in pixels for inserted image")
    width: Optional[float] = Field(default=960, description="width for inserted image")
    height: Optional[float] = Field(default=540, description="height for inserted image")
    image_index: Optional[int] = Field(default=0, description="Which image result to use from search results")
    limit: Optional[int] = Field(default=3, description="Number of search results to fetch")


def _extract_best_text_from_result(data: Dict[str, Any]) -> str:
    # Try markdown first, then summary, then html stripped
    md = ((data or {}).get("markdown") or "").strip()
    if md:
        return md
    summary = ((data or {}).get("summary") or "").strip() if isinstance(data, dict) else ""
    if summary:
        return summary
    # Metadata/title fallback
    meta = (data or {}).get("metadata") or {}
    title = (meta or {}).get("title") or ""
    return title.strip()


def _pick_image_url_from_search(search_data: Dict[str, Any], index: int = 0) -> Optional[str]:
    try:
        images = ((search_data or {}).get("images") or [])
        if isinstance(images, list) and images:
            idx = max(0, min(index or 0, len(images) - 1))
            # Firecrawl images shape: { title, imageUrl, url, position }
            img = images[idx]
            return img.get("imageUrl") or img.get("url")
    except Exception:
        pass
    return None


def firecrawl_fetch(
    args: FirecrawlFetchArgs,
    registry: ComponentRegistry,
    deck_data: DeckBase,
    deck_diff: DeckDiff,
) -> DeckDiff:
    """
    Use Firecrawl to fetch content or images and apply to the deck.
    - For text: replace/append existing component text or create a new text block
    - For images: insert an Image component using found image URL
    """
    service = get_firecrawl_service()
    if not service.is_configured():
        logger.warning("FIRECRAWL_API_KEY not configured; skipping firecrawl_fetch")
        return deck_diff

    # Fetch data
    payload: Dict[str, Any] = {}
    try:
        if (args.operation == "scrape" and args.url) or (args.url and (args.operation == "search")):
            # Prefer scrape when URL provided; use conservative formats per docs
            result = service.scrape(args.url, formats=["markdown", "html"]) or {}
            payload = (result or {}).get("data") or result
        else:
            # default search path
            result = service.search(query=args.query or (args.url or ""), limit=args.limit or 3) or {}
            payload = (result or {}).get("data") or result
    except Exception as e:
        logger.warning(f"Firecrawl fetch failed: {e}")
        return deck_diff

    apply_mode = args.apply

    # Insert image from search results
    if apply_mode == "insert_image":
        # When operation is scrape, there may be screenshots but SDK returns via actions; prefer search images
        image_url = None
        if isinstance(payload, dict) and "images" in payload:
            image_url = _pick_image_url_from_search(payload, args.image_index or 0)
        # Fallback: if payload is nested under 'data' for SDK direct
        if not image_url and isinstance(payload, dict):
            image_url = _pick_image_url_from_search(payload.get("data") or {}, args.image_index or 0)
        if not image_url:
            logger.info("No image URL found in Firecrawl results")
            return deck_diff
        insert_args = InsertImageArgs(
            tool_name="insert_image",
            slide_id=args.slide_id,
            id=args.id or str(_uuid.uuid4()),
            image_url=image_url,
            x=args.x or 200,
            y=args.y or 200,
            width=args.width or 960,
            height=args.height or 540,
        )
        return insert_image(insert_args, registry, deck_data, deck_diff)

    # Just return JSON without converting to text or components
    json_payload: Dict[str, Any] = {}
    if isinstance(payload, dict):
        # If scrape with json was requested upstream, payload may not include json; so explicitly run extract_json
        if args.url:
            ej = service.extract_json(
                args.url,
                prompt=(args.query or "Extract structured data relevant to the user's request"),
            ) or {}
            ej_data = (ej or {}).get("data") or ej
            json_payload = (ej_data or {}).get("json") or {}
        # If still empty, use the raw search payload structure
        if not json_payload:
            json_payload = payload

    # Attach JSON to slide properties
    try:
        slide_diff = deck_diff._find_or_create_slide_diff(args.slide_id)
        if not hasattr(slide_diff, "slide_properties") or slide_diff.slide_properties is None:
            slide_diff.slide_properties = {}
        slide_diff.slide_properties["firecrawl_json"] = json_payload
        # Also keep basic provenance
        meta = {"source_url": args.url, "query": args.query, "operation": args.operation}
        slide_diff.slide_properties["firecrawl_meta"] = meta
    except Exception as e:
        logger.warning(f"Failed attaching firecrawl_json to slide properties: {e}")
    return deck_diff


