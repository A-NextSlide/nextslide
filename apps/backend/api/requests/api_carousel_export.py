"""
API endpoints for LinkedIn Carousel PDF export.
"""

import io
import logging
from typing import Optional, List, Literal

from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

from api.requests.api_auth import get_auth_header
from services.carousel_export_service import generate_carousel_pdf

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/export", tags=["Export"])


# ---------------------------------------------------------------------------
# Request / Response models
# ---------------------------------------------------------------------------

class CarouselExportRequest(BaseModel):
    deck_id: str
    slides: List[dict]  # Slide data (title, content, backgroundColor, etc.)
    title: str
    format: Literal["square", "portrait"] = "square"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

async def _is_free_plan(user_id: str) -> bool:
    """Check if the user is on the free plan (needs branding)."""
    try:
        from services.billing_service import get_billing_service
        billing = get_billing_service()
        balance = await billing.get_user_balance(user_id)
        if balance and balance.plan_id not in ("free", ""):
            return False
        return True
    except Exception as e:
        logger.warning(f"Could not check user plan for carousel branding: {e}")
        return True  # Default to branding if check fails


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------

@router.post("/linkedin-carousel")
async def export_linkedin_carousel(
    request: CarouselExportRequest,
    token: Optional[str] = Depends(get_auth_header),
):
    """
    Export a deck as a LinkedIn carousel PDF.

    Returns the PDF as a downloadable file.
    """
    if not request.slides:
        raise HTTPException(status_code=400, detail="No slides provided")

    # Determine branding: free users get "Made with NextSlide AI"
    add_branding = True
    user_id: Optional[str] = None

    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get("id")
                add_branding = await _is_free_plan(user_id)
        except Exception as e:
            logger.warning(f"Auth check failed for carousel export: {e}")

    try:
        pdf_bytes = await generate_carousel_pdf(
            slides=request.slides,
            title=request.title,
            format_type=request.format,
            add_branding=add_branding,
        )
    except Exception as e:
        logger.error(f"Carousel PDF generation failed: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail="Failed to generate carousel PDF")

    # Build a safe filename
    safe_title = "".join(
        c if c.isalnum() or c in " _-" else ""
        for c in request.title
    ).strip()[:80] or "carousel"
    filename = f"{safe_title}_linkedin_carousel.pdf"

    logger.info(
        f"Carousel export: deck_id={request.deck_id}, "
        f"slides={len(request.slides)}, format={request.format}, "
        f"user={user_id or 'anonymous'}, branding={add_branding}"
    )

    return StreamingResponse(
        io.BytesIO(pdf_bytes),
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"',
            "Content-Length": str(len(pdf_bytes)),
        },
    )
