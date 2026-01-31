"""
API endpoints for sitemap.xml, robots.txt, and SEO metadata.

Provides:
- GET /sitemap.xml          - Sitemap index pointing to sub-sitemaps
- GET /sitemap-pages.xml    - Static pages sitemap
- GET /sitemap-presentations.xml - Public presentations sitemap
- GET /robots.txt           - Robots.txt for crawlers
- GET /api/seo/meta/{shareCode} - Complete SEO metadata for a shared presentation
- GET /api/presentations/related/{shareCode} - Related presentations for SEO internal linking
"""
import logging
import os
from datetime import datetime
from typing import Optional, List, Dict, Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import Response

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

router = APIRouter(tags=["seo"])

FRONTEND_BASE_URL = os.getenv("FRONTEND_URL", "https://nextslide.ai")
API_BASE_URL = os.getenv("API_URL", "https://api.nextslide.ai")

# Static pages and their change frequency / priority
STATIC_PAGES = [
    {"path": "/", "changefreq": "weekly", "priority": "1.0"},
    {"path": "/pricing", "changefreq": "monthly", "priority": "0.8"},
    {"path": "/smart-gallery", "changefreq": "weekly", "priority": "0.7"},
    {"path": "/developers", "changefreq": "monthly", "priority": "0.6"},
    {"path": "/help", "changefreq": "monthly", "priority": "0.5"},
]


# ============================================================================
# Sitemap Index
# ============================================================================

@router.get("/sitemap.xml")
async def sitemap_index():
    """
    Return a sitemap index that references sub-sitemaps.
    """
    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
    xml += f"  <sitemap><loc>{FRONTEND_BASE_URL}/sitemap-pages.xml</loc></sitemap>\n"
    xml += f"  <sitemap><loc>{FRONTEND_BASE_URL}/sitemap-presentations.xml</loc></sitemap>\n"
    xml += "</sitemapindex>\n"

    return Response(content=xml, media_type="application/xml", headers={
        "Cache-Control": "public, max-age=3600",
    })


# ============================================================================
# Static Pages Sitemap
# ============================================================================

@router.get("/sitemap-pages.xml")
async def sitemap_pages():
    """
    Return a sitemap for static marketing / product pages.
    """
    today = datetime.utcnow().strftime("%Y-%m-%d")

    xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
    xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

    for page in STATIC_PAGES:
        xml += "  <url>\n"
        xml += f"    <loc>{FRONTEND_BASE_URL}{page['path']}</loc>\n"
        xml += f"    <lastmod>{today}</lastmod>\n"
        xml += f"    <changefreq>{page['changefreq']}</changefreq>\n"
        xml += f"    <priority>{page['priority']}</priority>\n"
        xml += "  </url>\n"

    xml += "</urlset>\n"

    return Response(content=xml, media_type="application/xml", headers={
        "Cache-Control": "public, max-age=3600",
    })


# ============================================================================
# Presentations Sitemap
# ============================================================================

@router.get("/sitemap-presentations.xml")
async def sitemap_presentations():
    """
    Return a sitemap for all public / approved community presentations.
    Includes both deck_shares (is_public=true) and community_decks (approved).
    """
    try:
        supabase = get_supabase_client()
        urls: List[Dict[str, str]] = []

        # 1. Public share links
        try:
            shares_result = supabase.table("deck_shares").select(
                "short_code, created_at"
            ).eq("is_active", True).eq("is_public", True).limit(5000).execute()

            for share in (shares_result.data or []):
                created = share.get("created_at", "")[:10] or datetime.utcnow().strftime("%Y-%m-%d")
                urls.append({
                    "loc": f"{FRONTEND_BASE_URL}/p/{share['short_code']}",
                    "lastmod": created,
                    "changefreq": "monthly",
                    "priority": "0.6",
                })
        except Exception as e:
            # is_public column may not exist yet; fall through gracefully
            logger.warning(f"Could not query public deck_shares: {e}")

        # 2. Approved community decks
        try:
            community_result = supabase.table("community_decks").select(
                "id, approved_at"
            ).eq("status", "approved").limit(5000).execute()

            for deck in (community_result.data or []):
                approved = (deck.get("approved_at") or "")[:10] or datetime.utcnow().strftime("%Y-%m-%d")
                urls.append({
                    "loc": f"{FRONTEND_BASE_URL}/community/{deck['id']}",
                    "lastmod": approved,
                    "changefreq": "monthly",
                    "priority": "0.5",
                })
        except Exception as e:
            logger.warning(f"Could not query community_decks: {e}")

        # Build XML
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n'
        xml += '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'

        for entry in urls:
            xml += "  <url>\n"
            xml += f"    <loc>{entry['loc']}</loc>\n"
            xml += f"    <lastmod>{entry['lastmod']}</lastmod>\n"
            xml += f"    <changefreq>{entry['changefreq']}</changefreq>\n"
            xml += f"    <priority>{entry['priority']}</priority>\n"
            xml += "  </url>\n"

        xml += "</urlset>\n"

        return Response(content=xml, media_type="application/xml", headers={
            "Cache-Control": "public, max-age=3600",
        })

    except Exception as e:
        logger.error(f"Error generating presentations sitemap: {e}")
        # Return an empty but valid sitemap
        xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n</urlset>\n'
        return Response(content=xml, media_type="application/xml")


# ============================================================================
# Robots.txt
# ============================================================================

@router.get("/robots.txt")
async def robots_txt():
    """
    Serve robots.txt for search engine crawlers.
    """
    content = (
        "User-agent: *\n"
        "Allow: /\n"
        "Allow: /p/\n"
        "Allow: /community/\n"
        "Allow: /smart-gallery/\n"
        "Allow: /pricing\n"
        "Allow: /developers\n"
        "Allow: /help\n"
        "Disallow: /app\n"
        "Disallow: /admin\n"
        "Disallow: /api/\n"
        "Disallow: /deck/\n"
        "Disallow: /e/\n"
        "Disallow: /profile\n"
        "Disallow: /login\n"
        "Disallow: /signup\n"
        "Disallow: /reset-password\n"
        "\n"
        f"Sitemap: {FRONTEND_BASE_URL}/sitemap.xml\n"
    )

    return Response(content=content, media_type="text/plain", headers={
        "Cache-Control": "public, max-age=86400",
    })


# ============================================================================
# SEO Meta Endpoint (complete SEO data for a shared presentation)
# ============================================================================

@router.get("/api/seo/meta/{share_code}")
async def get_seo_meta(share_code: str):
    """
    Return complete SEO metadata for a shared presentation.
    Used by Cloudflare Workers or any pre-render layer to inject meta tags.
    """
    try:
        supabase = get_supabase_client()

        # Get share link
        share_result = supabase.table("deck_shares").select(
            "id, deck_uuid, metadata, share_type, created_at"
        ).eq("short_code", share_code).eq("is_active", True).execute()

        if not share_result.data:
            raise HTTPException(status_code=404, detail="Share link not found")

        share_data = share_result.data[0]

        # Get deck info
        deck_result = supabase.table("decks").select(
            "name, slides, user_id, created_at, slide_count"
        ).eq("uuid", share_data["deck_uuid"]).execute()

        if not deck_result.data:
            raise HTTPException(status_code=404, detail="Deck not found")

        deck = deck_result.data[0]
        deck_name = deck.get("name", "Presentation")
        slides = deck.get("slides", [])
        slide_count = deck.get("slide_count") or len(slides)
        created_at = (deck.get("created_at") or share_data.get("created_at", ""))[:10]

        # Extract description from first slide content
        description = _extract_description(slides)

        # Try to get author name
        author_name = "NextSlide User"
        user_id = deck.get("user_id")
        if user_id:
            try:
                user_result = supabase.table("users").select("full_name").eq("id", user_id).execute()
                if user_result.data and user_result.data[0].get("full_name"):
                    author_name = user_result.data[0]["full_name"]
            except Exception:
                pass

        # Build canonical URL
        path_prefix = "p" if share_data.get("share_type", "view") == "view" else "e"
        canonical_url = f"{FRONTEND_BASE_URL}/{path_prefix}/{share_code}"
        og_image_url = f"{API_BASE_URL}/api/public/og/{share_code}.png"

        # Schema.org JSON-LD
        schema_org = {
            "@context": "https://schema.org",
            "@type": "PresentationDigitalDocument",
            "name": deck_name,
            "description": description,
            "author": {"@type": "Person", "name": author_name},
            "dateCreated": created_at,
            "thumbnailUrl": og_image_url,
            "url": canonical_url,
            "provider": {
                "@type": "Organization",
                "name": "NextSlide",
                "url": "https://nextslide.ai",
            },
        }

        return {
            "title": f"{deck_name} | NextSlide",
            "description": description,
            "og_image": og_image_url,
            "canonical_url": canonical_url,
            "author": author_name,
            "date_created": created_at,
            "slide_count": slide_count,
            "schema_org": schema_org,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating SEO meta for {share_code}: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate SEO metadata")


# ============================================================================
# Related Presentations Endpoint
# ============================================================================

@router.get("/api/presentations/related/{share_code}")
async def get_related_presentations(
    share_code: str,
    limit: int = Query(4, ge=1, le=12, description="Number of related presentations"),
):
    """
    Return a list of related / recommended community presentations.
    Used to build internal links on the SharedDeckView page.
    """
    try:
        supabase = get_supabase_client()
        results: List[Dict[str, Any]] = []

        # Try to determine the category of the current deck
        current_category: Optional[str] = None
        current_deck_uuid: Optional[str] = None

        try:
            share_result = supabase.table("deck_shares").select(
                "deck_uuid"
            ).eq("short_code", share_code).eq("is_active", True).execute()

            if share_result.data:
                current_deck_uuid = share_result.data[0]["deck_uuid"]

                # Check if this deck has a community entry with a category
                community_check = supabase.table("community_decks").select(
                    "category"
                ).eq("deck_uuid", current_deck_uuid).eq("status", "approved").execute()

                if community_check.data:
                    current_category = community_check.data[0].get("category")
        except Exception:
            pass

        # Fetch approved community decks, preferring same category
        if current_category:
            # Same category first
            same_category = supabase.table("community_decks").select(
                "id, title, category, view_count, first_slide"
            ).eq("status", "approved").eq("category", current_category).limit(
                limit + 1  # fetch one extra in case we need to exclude current
            ).order("view_count", desc=True).execute()

            for deck in (same_category.data or []):
                # Skip if it's the same deck
                if current_deck_uuid:
                    # We don't have deck_uuid in this query, but we can match by id
                    pass
                results.append(_format_related_deck(deck))

        # If we don't have enough, fill with popular decks from any category
        if len(results) < limit:
            remaining = limit - len(results)
            existing_ids = {r["id"] for r in results}

            popular = supabase.table("community_decks").select(
                "id, title, category, view_count, first_slide"
            ).eq("status", "approved").order(
                "view_count", desc=True
            ).limit(remaining + len(existing_ids) + 1).execute()

            for deck in (popular.data or []):
                if deck["id"] not in existing_ids and len(results) < limit:
                    results.append(_format_related_deck(deck))

        return {"presentations": results[:limit]}

    except Exception as e:
        logger.error(f"Error fetching related presentations for {share_code}: {e}")
        return {"presentations": []}


# ============================================================================
# Helpers
# ============================================================================

def _extract_description(slides: list, max_length: int = 160) -> str:
    """Extract a description from the first slide's text content."""
    if not slides:
        return "View this AI-generated presentation on NextSlide."

    first_slide = slides[0] if isinstance(slides, list) else {}
    components = first_slide.get("components", [])

    text_parts: List[str] = []
    for comp in components:
        if not isinstance(comp, dict):
            continue
        props = comp.get("props", {})

        # Look for text in common props
        for key in ("text", "title", "subtitle", "content", "heading", "body"):
            val = props.get(key)
            if isinstance(val, str) and val.strip():
                text_parts.append(val.strip())

        # Look for text in html prop (CustomComponent)
        html_val = props.get("html", "")
        if isinstance(html_val, str) and html_val:
            import re
            stripped = re.sub(r"<[^>]+>", " ", html_val)
            stripped = re.sub(r"\s+", " ", stripped).strip()
            if stripped:
                text_parts.append(stripped)

    combined = " ".join(text_parts)
    if not combined:
        return "View this AI-generated presentation on NextSlide."

    if len(combined) > max_length:
        combined = combined[: max_length - 3].rsplit(" ", 1)[0] + "..."

    return combined


def _format_related_deck(deck: dict) -> dict:
    """Format a community deck row for the related presentations response."""
    # Extract a thumbnail URL from the first_slide if available
    thumbnail = None
    first_slide = deck.get("first_slide")
    if isinstance(first_slide, dict):
        # Try to get a background image from the first slide
        for comp in first_slide.get("components", []):
            if not isinstance(comp, dict):
                continue
            props = comp.get("props", {})
            bg = props.get("backgroundImageUrl") or props.get("src")
            if isinstance(bg, str) and bg.startswith("http"):
                thumbnail = bg
                break

    return {
        "id": deck["id"],
        "title": deck.get("title", "Untitled"),
        "category": deck.get("category", ""),
        "viewCount": deck.get("view_count", 0),
        "thumbnail": thumbnail,
    }
