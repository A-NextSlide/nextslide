"""
API endpoints for the Template Gallery.
Public endpoints for browsing templates + authenticated endpoint for using a template.
"""
import logging
import os
from typing import Optional, Dict, Any, List
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, Header
from pydantic import BaseModel
import httpx

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/templates", tags=["templates"])


# ============================================================================
# Response Models
# ============================================================================

class TemplateCard(BaseModel):
    id: str
    slug: str
    title: str
    description: Optional[str] = None
    category: str
    tags: List[str] = []
    thumbnail_url: Optional[str] = None
    use_count: int = 0
    created_at: Optional[str] = None


class TemplateDetail(TemplateCard):
    deck_data: dict = {}


class TemplatesListResponse(BaseModel):
    templates: List[TemplateCard]
    total: int
    page: int
    limit: int
    has_more: bool


class CategoryCount(BaseModel):
    name: str
    display_name: str
    count: int


class TemplateSeoMeta(BaseModel):
    title: str
    description: str
    canonical_url: str
    og_image: Optional[str] = None
    schema_type: str = "PresentationDigitalDocument"


# ============================================================================
# Auth Helpers
# ============================================================================

async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header."""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def get_current_user_optional(token: Optional[str] = Depends(get_auth_header)) -> Optional[Dict[str, Any]]:
    """Get current user if authenticated, returns None otherwise."""
    if not token:
        return None
    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}
        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0),
        )
        if resp.status_code == 200:
            user_json = resp.json()
            return {"id": user_json.get("id"), "email": user_json.get("email")}
        return None
    except Exception as e:
        logger.warning(f"Failed to get optional user: {e}")
        return None


async def get_current_user_required(token: Optional[str] = Depends(get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated."""
    user = await get_current_user_optional(token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


# ============================================================================
# Category mapping
# ============================================================================

CATEGORY_DISPLAY_NAMES = {
    "business": "Business",
    "education": "Education",
    "marketing": "Marketing",
    "sales": "Sales",
    "finance": "Finance",
    "technology": "Technology",
    "creative": "Creative",
    "consulting": "Consulting",
    "research": "Research",
    "hr": "HR & Training",
}


# ============================================================================
# Public Endpoints
# ============================================================================

@router.get("", response_model=TemplatesListResponse)
async def list_templates(
    category: Optional[str] = Query(None, description="Filter by category"),
    search: Optional[str] = Query(None, description="Search in title and description"),
    sort: Optional[str] = Query("popular", description="Sort: popular or newest"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(20, ge=1, le=50, description="Items per page"),
):
    """
    List active templates with optional filters. Public endpoint.
    """
    try:
        supabase = get_supabase_client()
        offset = (page - 1) * limit

        query = supabase.table("templates").select(
            "id, slug, title, description, category, tags, thumbnail_url, use_count, created_at",
            count="exact",
        ).eq("is_active", True)

        if category:
            query = query.eq("category", category)

        if search:
            query = query.or_(f"title.ilike.%{search}%,description.ilike.%{search}%")

        if sort == "newest":
            query = query.order("created_at", desc=True)
        else:
            query = query.order("use_count", desc=True)

        query = query.range(offset, offset + limit - 1)
        result = query.execute()

        total = result.count if result.count else 0
        templates = [
            TemplateCard(
                id=t["id"],
                slug=t["slug"],
                title=t["title"],
                description=t.get("description"),
                category=t["category"],
                tags=t.get("tags", []),
                thumbnail_url=t.get("thumbnail_url"),
                use_count=t.get("use_count", 0),
                created_at=t.get("created_at"),
            )
            for t in (result.data or [])
        ]

        return TemplatesListResponse(
            templates=templates,
            total=total,
            page=page,
            limit=limit,
            has_more=offset + limit < total,
        )

    except Exception as e:
        logger.error(f"Error listing templates: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch templates")


@router.get("/categories", response_model=List[CategoryCount])
async def get_template_categories():
    """
    Get list of categories with counts. Public endpoint.
    """
    try:
        supabase = get_supabase_client()
        result = supabase.table("templates").select("category").eq("is_active", True).execute()

        counts: Dict[str, int] = {}
        for t in (result.data or []):
            cat = t["category"]
            counts[cat] = counts.get(cat, 0) + 1

        categories = []
        for cat, display in CATEGORY_DISPLAY_NAMES.items():
            c = counts.get(cat, 0)
            if c > 0:
                categories.append(CategoryCount(name=cat, display_name=display, count=c))

        # Also include any categories present in data but not in the static map
        for cat, c in counts.items():
            if cat not in CATEGORY_DISPLAY_NAMES:
                categories.append(CategoryCount(name=cat, display_name=cat.replace("-", " ").title(), count=c))

        categories.sort(key=lambda x: x.count, reverse=True)
        return categories

    except Exception as e:
        logger.error(f"Error getting template categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


@router.get("/seo-meta/{slug}", response_model=TemplateSeoMeta)
async def get_template_seo_meta(slug: str):
    """
    Return SEO metadata for a template page. Used by SSR / prerender layer.
    """
    try:
        supabase = get_supabase_client()
        result = supabase.table("templates").select(
            "slug, title, description, category, thumbnail_url"
        ).eq("slug", slug).eq("is_active", True).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")

        t = result.data[0]
        category_label = CATEGORY_DISPLAY_NAMES.get(t["category"], t["category"].title())
        seo_title = f"Free {category_label} Presentation Template - {t['title']} | NextSlide"
        seo_desc = t.get("description") or f"Use this free {category_label.lower()} presentation template. Customize with AI in seconds using NextSlide."

        return TemplateSeoMeta(
            title=seo_title,
            description=seo_desc,
            canonical_url=f"https://nextslide.ai/templates/{slug}",
            og_image=t.get("thumbnail_url"),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template SEO meta: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch SEO meta")


@router.get("/{slug}", response_model=TemplateDetail)
async def get_template(slug: str):
    """
    Get a single template by slug with full deck_data. Public endpoint.
    """
    try:
        supabase = get_supabase_client()
        result = supabase.table("templates").select("*").eq("slug", slug).eq("is_active", True).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")

        t = result.data[0]

        return TemplateDetail(
            id=t["id"],
            slug=t["slug"],
            title=t["title"],
            description=t.get("description"),
            category=t["category"],
            tags=t.get("tags", []),
            thumbnail_url=t.get("thumbnail_url"),
            use_count=t.get("use_count", 0),
            created_at=t.get("created_at"),
            deck_data=t.get("deck_data", {}),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting template: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch template")


# ============================================================================
# Authenticated Endpoints
# ============================================================================

@router.post("/{slug}/use")
async def use_template(
    slug: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """
    Increment use count and return deck data for the editor. Requires auth.
    """
    try:
        supabase = get_supabase_client()

        result = supabase.table("templates").select(
            "id, slug, title, deck_data, use_count, category"
        ).eq("slug", slug).eq("is_active", True).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Template not found")

        t = result.data[0]

        # Increment use count (fire-and-forget style)
        try:
            supabase.table("templates").update(
                {"use_count": t.get("use_count", 0) + 1, "updated_at": datetime.utcnow().isoformat()}
            ).eq("id", t["id"]).execute()
        except Exception:
            pass  # Non-critical

        return {
            "success": True,
            "slug": t["slug"],
            "title": t["title"],
            "category": t["category"],
            "deck_data": t.get("deck_data", {}),
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error using template: {e}")
        raise HTTPException(status_code=500, detail="Failed to use template")
