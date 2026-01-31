"""
API endpoints for community slides feature.
Includes public endpoints, authenticated user endpoints, and admin endpoints.
"""
import logging
import os
import uuid
from typing import Optional, Dict, Any, List
from datetime import datetime, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query, Header, Request
from pydantic import BaseModel
import httpx

from services.supabase import get_supabase_client
from utils.supabase import upload_deck, get_deck
from models.requests import (
    SubmitToCommunityRequest,
    CommunityDeckResponse,
    CommunityDeckDetailResponse,
    CommunityDecksListResponse,
    CommunitySubmissionResponse,
    CommunityCategoryCount,
    RejectCommunitySubmissionRequest,
    ShowcaseDeckResponse,
    ShowcaseListResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/community", tags=["community"])

# Category display names
CATEGORY_DISPLAY_NAMES = {
    'business': 'Business',
    'education': 'Education',
    'marketing': 'Marketing',
    'creative': 'Creative',
    'technology': 'Technology',
    'personal': 'Personal',
}


# ============================================================================
# Auth Helpers
# ============================================================================

async def get_auth_header(authorization: Optional[str] = Header(None)) -> Optional[str]:
    """Extract JWT token from Authorization header"""
    if authorization and authorization.startswith("Bearer "):
        return authorization.replace("Bearer ", "")
    return None


async def get_current_user_optional(token: Optional[str] = Depends(get_auth_header)) -> Optional[Dict[str, Any]]:
    """Get current user if authenticated, returns None otherwise"""
    if not token:
        return None

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=5.0, pool=2.0)
        )

        if resp.status_code == 200:
            user_json = resp.json()
            return {
                "id": user_json.get("id"),
                "email": user_json.get("email"),
                "user_metadata": user_json.get("user_metadata", {})
            }
        return None
    except Exception as e:
        logger.warning(f"Failed to get optional user: {e}")
        return None


async def get_current_user_required(token: Optional[str] = Depends(get_auth_header)) -> Dict[str, Any]:
    """Get current user, raises 401 if not authenticated"""
    user = await get_current_user_optional(token)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    return user


async def verify_admin_role(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Verify that the user has admin role"""
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="No authorization token provided")

    token = authorization.replace("Bearer ", "")

    try:
        supabase_url = os.getenv("SUPABASE_URL")
        api_key = os.getenv("SUPABASE_ANON_KEY") or os.getenv("SUPABASE_KEY")
        headers = {"Authorization": f"Bearer {token}", "apikey": api_key}

        resp = httpx.get(
            f"{supabase_url}/auth/v1/user",
            headers=headers,
            timeout=httpx.Timeout(connect=1.5, read=2.0, write=2.0, pool=1.0)
        )

        if not resp or resp.status_code != 200:
            raise HTTPException(status_code=401, detail="Invalid token")

        user_json = resp.json()
        user_id = user_json.get("id")
        user_email = user_json.get("email")

        # Check admin role in users table
        supabase = get_supabase_client()
        user_data = supabase.table("users").select("role, permissions").eq("id", user_id).single().execute()

        if not user_data.data or user_data.data.get("role") != "admin":
            raise HTTPException(status_code=403, detail="Admin access required")

        return {
            "id": user_id,
            "email": user_email,
            "role": user_data.data.get("role"),
            "permissions": user_data.data.get("permissions", [])
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Admin verification error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error")


# ============================================================================
# Public Endpoints (No Auth Required)
# ============================================================================

@router.get("/decks", response_model=CommunityDecksListResponse)
async def list_community_decks(
    search: Optional[str] = Query(None, description="Search in title and description"),
    category: Optional[str] = Query(None, description="Filter by category"),
    tag: Optional[str] = Query(None, description="Filter by tag"),
    page: int = Query(1, ge=1, description="Page number"),
    limit: int = Query(12, ge=1, le=50, description="Items per page"),
):
    """
    List approved community decks. Public endpoint - no auth required.
    """
    try:
        supabase = get_supabase_client()
        offset = (page - 1) * limit

        # Build query - only approved decks
        query = supabase.table('community_decks').select(
            'id, title, description, category, tags, slide_count, first_slide, '
            'author_name, remix_count, view_count, approved_at, submitted_at',
            count='exact'
        ).eq('status', 'approved')

        # Apply filters
        if category:
            query = query.eq('category', category)

        if tag:
            query = query.contains('tags', [tag])

        if search:
            # Use full-text search
            query = query.or_(f"title.ilike.%{search}%,description.ilike.%{search}%")

        # Order by approved_at descending (newest first)
        query = query.order('approved_at', desc=True)

        # Paginate
        query = query.range(offset, offset + limit - 1)

        result = query.execute()

        total = result.count if result.count else 0

        decks = [
            CommunityDeckResponse(
                id=deck['id'],
                title=deck['title'],
                description=deck.get('description'),
                category=deck['category'],
                tags=deck.get('tags', []),
                slide_count=deck.get('slide_count', 0),
                first_slide=deck.get('first_slide'),
                author_name=deck.get('author_name'),
                remix_count=deck.get('remix_count', 0),
                view_count=deck.get('view_count', 0),
                approved_at=deck.get('approved_at'),
                submitted_at=deck.get('submitted_at'),
            )
            for deck in (result.data or [])
        ]

        return CommunityDecksListResponse(
            decks=decks,
            total=total,
            page=page,
            limit=limit,
            has_more=offset + limit < total
        )

    except Exception as e:
        logger.error(f"Error listing community decks: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch community decks")


@router.get("/decks/{deck_id}", response_model=CommunityDeckDetailResponse)
async def get_community_deck(deck_id: str):
    """
    Get a single community deck with full slide data. Public endpoint.
    Also increments view count.
    """
    try:
        supabase = get_supabase_client()

        # Get the deck
        result = supabase.table('community_decks').select('*').eq('id', deck_id).eq('status', 'approved').execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Community deck not found")

        deck = result.data[0]

        # Increment view count (fire and forget)
        try:
            supabase.table('community_decks').update({
                'view_count': deck.get('view_count', 0) + 1
            }).eq('id', deck_id).execute()
        except Exception:
            pass  # Don't fail request if view count update fails

        return CommunityDeckDetailResponse(
            id=deck['id'],
            title=deck['title'],
            description=deck.get('description'),
            category=deck['category'],
            tags=deck.get('tags', []),
            slide_count=deck.get('slide_count', 0),
            first_slide=deck.get('first_slide'),
            author_name=deck.get('author_name'),
            remix_count=deck.get('remix_count', 0),
            view_count=deck.get('view_count', 0) + 1,
            approved_at=deck.get('approved_at'),
            submitted_at=deck.get('submitted_at'),
            slides=deck.get('slides_snapshot', []),
            theme=deck.get('theme_snapshot'),
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting community deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch community deck")


@router.get("/categories", response_model=List[CommunityCategoryCount])
async def get_categories():
    """
    Get list of categories with counts. Public endpoint.
    """
    try:
        supabase = get_supabase_client()

        # Get count per category for approved decks
        result = supabase.table('community_decks').select(
            'category'
        ).eq('status', 'approved').execute()

        # Count manually
        counts: Dict[str, int] = {}
        for deck in (result.data or []):
            cat = deck['category']
            counts[cat] = counts.get(cat, 0) + 1

        # Return all categories, even with 0 count
        categories = [
            CommunityCategoryCount(
                name=cat,
                display_name=CATEGORY_DISPLAY_NAMES.get(cat, cat.title()),
                count=counts.get(cat, 0)
            )
            for cat in CATEGORY_DISPLAY_NAMES.keys()
        ]

        return categories

    except Exception as e:
        logger.error(f"Error getting categories: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch categories")


# ============================================================================
# Authenticated User Endpoints
# ============================================================================

@router.post("/submit")
async def submit_to_community(
    request: SubmitToCommunityRequest,
    user: Dict[str, Any] = Depends(get_current_user_required)
):
    """
    Submit a deck to the community. Requires authentication.
    The deck will be pending until approved by an admin.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        # Verify user owns the deck
        deck_result = supabase.table('decks').select(
            'uuid, name, slides, data, user_id, slide_count, first_slide'
        ).eq('uuid', request.deck_uuid).execute()

        if not deck_result.data:
            raise HTTPException(status_code=404, detail="Deck not found")

        deck = deck_result.data[0]

        if deck['user_id'] != user_id:
            raise HTTPException(status_code=403, detail="You can only submit your own decks")

        # Check if deck already submitted
        existing = supabase.table('community_decks').select('id, status').eq('deck_uuid', request.deck_uuid).execute()

        if existing.data:
            status = existing.data[0]['status']
            if status == 'pending':
                raise HTTPException(status_code=400, detail="This deck is already pending approval")
            elif status == 'approved':
                raise HTTPException(status_code=400, detail="This deck is already in the community")
            # If rejected, allow resubmission by deleting old record
            elif status == 'rejected':
                supabase.table('community_decks').delete().eq('id', existing.data[0]['id']).execute()

        # Get user info for author name
        user_profile = supabase.table('users').select('full_name, email').eq('id', user_id).execute()
        author_name = None
        author_email = None
        if user_profile.data:
            author_name = user_profile.data[0].get('full_name') or user['email'].split('@')[0]
            author_email = user_profile.data[0].get('email') or user['email']

        # Create community deck submission
        submission_data = {
            'deck_uuid': request.deck_uuid,
            'user_id': user_id,
            'title': request.title,
            'description': request.description,
            'category': request.category,
            'tags': request.tags[:10],  # Limit to 10 tags
            'status': 'pending',
            'slide_count': deck.get('slide_count') or len(deck.get('slides', [])),
            'first_slide': deck.get('first_slide') or (deck.get('slides', [{}])[0] if deck.get('slides') else None),
            'author_name': author_name,
            'author_email': author_email,
            'submitted_at': datetime.utcnow().isoformat(),
        }

        result = supabase.table('community_decks').insert(submission_data).execute()

        if not result.data:
            raise HTTPException(status_code=500, detail="Failed to submit to community")

        logger.info(f"Community submission created: {result.data[0]['id']} by user {user_id}")

        return {
            "success": True,
            "message": "Your deck has been submitted for review",
            "submission_id": result.data[0]['id'],
            "status": "pending"
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error submitting to community: {e}")
        raise HTTPException(status_code=500, detail="Failed to submit to community")


@router.post("/decks/{deck_id}/remix")
async def remix_community_deck(
    deck_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required)
):
    """
    Remix (duplicate) a community deck to the user's account.
    Creates a copy of the deck that the user can edit.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        # Get the community deck
        result = supabase.table('community_decks').select('*').eq('id', deck_id).eq('status', 'approved').execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Community deck not found")

        community_deck = result.data[0]

        # Create a new deck UUID
        new_deck_uuid = str(uuid.uuid4())

        # Prepare the new deck data from snapshot
        slides = community_deck.get('slides_snapshot', [])
        theme = community_deck.get('theme_snapshot', {})

        new_deck = {
            'uuid': new_deck_uuid,
            'name': f"{community_deck['title']} (Remix)",
            'slides': slides,
            'size': {'width': 1920, 'height': 1080},
            'data': {'theme': theme} if theme else None,
            'version': str(uuid.uuid4()),
            'status': {
                'state': 'completed',
                'message': f'Remixed from community deck by {community_deck.get("author_name", "Unknown")}'
            },
            'slide_count': len(slides),
            'first_slide': slides[0] if slides else None,
        }

        # Upload the new deck
        uploaded_deck = upload_deck(new_deck, new_deck_uuid, user_id)

        if not uploaded_deck:
            raise HTTPException(status_code=500, detail="Failed to create remixed deck")

        # Increment remix count on community deck
        try:
            supabase.table('community_decks').update({
                'remix_count': community_deck.get('remix_count', 0) + 1
            }).eq('id', deck_id).execute()
        except Exception:
            pass  # Don't fail if count update fails

        logger.info(f"Remixed community deck {deck_id} to new deck {new_deck_uuid} for user {user_id}")

        return {
            "success": True,
            "message": "Deck remixed successfully",
            "deck_uuid": new_deck_uuid,
            "deck_name": new_deck['name']
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error remixing community deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to remix deck")


@router.get("/my-submissions", response_model=List[CommunitySubmissionResponse])
async def get_my_submissions(
    user: Dict[str, Any] = Depends(get_current_user_required)
):
    """
    Get the current user's community submissions.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        result = supabase.table('community_decks').select(
            'id, deck_uuid, title, description, category, tags, status, '
            'rejection_reason, submitted_at, reviewed_at'
        ).eq('user_id', user_id).order('submitted_at', desc=True).execute()

        return [
            CommunitySubmissionResponse(
                id=sub['id'],
                deck_uuid=sub['deck_uuid'],
                title=sub['title'],
                description=sub.get('description'),
                category=sub['category'],
                tags=sub.get('tags', []),
                status=sub['status'],
                rejection_reason=sub.get('rejection_reason'),
                submitted_at=sub['submitted_at'],
                reviewed_at=sub.get('reviewed_at'),
            )
            for sub in (result.data or [])
        ]

    except Exception as e:
        logger.error(f"Error getting user submissions: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch submissions")


@router.delete("/submissions/{submission_id}")
async def withdraw_submission(
    submission_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required)
):
    """
    Withdraw a pending submission. Only pending submissions can be withdrawn.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        # Verify ownership and status
        result = supabase.table('community_decks').select(
            'id, user_id, status'
        ).eq('id', submission_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        submission = result.data[0]

        if submission['user_id'] != user_id:
            raise HTTPException(status_code=403, detail="You can only withdraw your own submissions")

        if submission['status'] != 'pending':
            raise HTTPException(status_code=400, detail="Only pending submissions can be withdrawn")

        # Delete the submission
        supabase.table('community_decks').delete().eq('id', submission_id).execute()

        logger.info(f"User {user_id} withdrew submission {submission_id}")

        return {"success": True, "message": "Submission withdrawn"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error withdrawing submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to withdraw submission")


@router.get("/submission-status/{deck_uuid}")
async def get_submission_status(
    deck_uuid: str,
    user: Dict[str, Any] = Depends(get_current_user_required)
):
    """
    Check if a deck has been submitted to the community and its status.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        result = supabase.table('community_decks').select(
            'id, status, rejection_reason, submitted_at, reviewed_at'
        ).eq('deck_uuid', deck_uuid).eq('user_id', user_id).execute()

        if not result.data:
            return {"submitted": False}

        submission = result.data[0]
        return {
            "submitted": True,
            "id": submission['id'],
            "status": submission['status'],
            "rejection_reason": submission.get('rejection_reason'),
            "submitted_at": submission['submitted_at'],
            "reviewed_at": submission.get('reviewed_at'),
        }

    except Exception as e:
        logger.error(f"Error checking submission status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check submission status")


# ============================================================================
# Showcase Endpoints
# ============================================================================

def _build_showcase_deck(deck: Dict[str, Any], has_upvoted: bool = False) -> ShowcaseDeckResponse:
    """Build a ShowcaseDeckResponse from a raw deck dict."""
    return ShowcaseDeckResponse(
        id=deck['id'],
        title=deck['title'],
        description=deck.get('description'),
        category=deck['category'],
        tags=deck.get('tags', []),
        slide_count=deck.get('slide_count', 0),
        first_slide=deck.get('first_slide'),
        author_name=deck.get('author_name'),
        remix_count=deck.get('remix_count', 0),
        view_count=deck.get('view_count', 0),
        upvote_count=deck.get('upvote_count', 0),
        is_featured=deck.get('is_featured', False),
        has_upvoted=has_upvoted,
        approved_at=deck.get('approved_at'),
        submitted_at=deck.get('submitted_at'),
    )


@router.get("/showcase", response_model=ShowcaseListResponse)
async def get_showcase(
    category: Optional[str] = Query(None, description="Filter by category"),
    sort: Optional[str] = Query("trending", description="Sort: trending, newest, most_popular, most_remixed"),
    tab: Optional[str] = Query(None, description="Tab filter: featured, trending, new"),
    search: Optional[str] = Query(None, description="Search in title, description, tags"),
    limit: int = Query(12, ge=1, le=50, description="Items per page"),
    offset: int = Query(0, ge=0, description="Offset for pagination"),
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Enhanced showcase listing with filtering, sorting, and upvote status.
    Public endpoint - auth optional for upvote status.
    """
    try:
        supabase = get_supabase_client()

        # Build query - only approved decks
        select_fields = (
            'id, title, description, category, tags, slide_count, first_slide, '
            'author_name, remix_count, view_count, upvote_count, is_featured, '
            'approved_at, submitted_at'
        )

        query = supabase.table('community_decks').select(
            select_fields, count='exact'
        ).eq('status', 'approved')

        # Tab filter
        if tab == 'featured':
            query = query.eq('is_featured', True)
        elif tab == 'new':
            # New = approved in last 14 days
            two_weeks_ago = (datetime.utcnow() - timedelta(days=14)).isoformat()
            query = query.gte('approved_at', two_weeks_ago)

        # Category filter
        if category:
            query = query.eq('category', category)

        # Search filter
        if search:
            query = query.or_(
                f"title.ilike.%{search}%,description.ilike.%{search}%"
            )

        # Sorting
        if sort == 'newest':
            query = query.order('approved_at', desc=True)
        elif sort == 'most_popular':
            query = query.order('view_count', desc=True)
        elif sort == 'most_remixed':
            query = query.order('remix_count', desc=True)
        else:
            # trending = upvote_count desc (default)
            query = query.order('upvote_count', desc=True).order('approved_at', desc=True)

        # Pagination
        query = query.range(offset, offset + limit - 1)

        result = query.execute()
        total = result.count if result.count else 0

        # Get upvote status for current user
        user_upvoted_ids: set = set()
        if user and result.data:
            deck_ids = [d['id'] for d in result.data]
            try:
                upvotes = supabase.table('showcase_upvotes').select(
                    'community_deck_id'
                ).eq('user_id', user['id']).in_('community_deck_id', deck_ids).execute()
                user_upvoted_ids = {u['community_deck_id'] for u in (upvotes.data or [])}
            except Exception as e:
                logger.warning(f"Failed to get upvote status: {e}")

        decks = [
            _build_showcase_deck(deck, has_upvoted=deck['id'] in user_upvoted_ids)
            for deck in (result.data or [])
        ]

        return ShowcaseListResponse(
            decks=decks,
            total=total,
            limit=limit,
            offset=offset,
            has_more=offset + limit < total,
        )

    except Exception as e:
        logger.error(f"Error fetching showcase: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch showcase")


@router.get("/showcase/weekly-top", response_model=List[ShowcaseDeckResponse])
async def get_weekly_top(
    user: Optional[Dict[str, Any]] = Depends(get_current_user_optional),
):
    """
    Get top 5 most upvoted decks this week.
    Public endpoint - auth optional for upvote status.
    """
    try:
        supabase = get_supabase_client()
        one_week_ago = (datetime.utcnow() - timedelta(days=7)).isoformat()

        # Get upvotes from this week grouped by deck
        upvotes_result = supabase.table('showcase_upvotes').select(
            'community_deck_id'
        ).gte('created_at', one_week_ago).execute()

        # Count upvotes per deck
        deck_upvote_counts: Dict[str, int] = {}
        for row in (upvotes_result.data or []):
            did = row['community_deck_id']
            deck_upvote_counts[did] = deck_upvote_counts.get(did, 0) + 1

        if not deck_upvote_counts:
            # Fallback: return top 5 by total upvote_count
            fallback = supabase.table('community_decks').select(
                'id, title, description, category, tags, slide_count, first_slide, '
                'author_name, remix_count, view_count, upvote_count, is_featured, '
                'approved_at, submitted_at'
            ).eq('status', 'approved').order('upvote_count', desc=True).limit(5).execute()

            user_upvoted_ids: set = set()
            if user and fallback.data:
                deck_ids = [d['id'] for d in fallback.data]
                try:
                    uv = supabase.table('showcase_upvotes').select(
                        'community_deck_id'
                    ).eq('user_id', user['id']).in_('community_deck_id', deck_ids).execute()
                    user_upvoted_ids = {u['community_deck_id'] for u in (uv.data or [])}
                except Exception:
                    pass

            return [
                _build_showcase_deck(d, has_upvoted=d['id'] in user_upvoted_ids)
                for d in (fallback.data or [])
            ]

        # Sort by weekly count, take top 5
        top_ids = sorted(deck_upvote_counts.keys(), key=lambda x: deck_upvote_counts[x], reverse=True)[:5]

        # Fetch deck details
        decks_result = supabase.table('community_decks').select(
            'id, title, description, category, tags, slide_count, first_slide, '
            'author_name, remix_count, view_count, upvote_count, is_featured, '
            'approved_at, submitted_at'
        ).eq('status', 'approved').in_('id', top_ids).execute()

        # Get user upvote status
        user_upvoted_ids = set()
        if user and decks_result.data:
            try:
                uv = supabase.table('showcase_upvotes').select(
                    'community_deck_id'
                ).eq('user_id', user['id']).in_('community_deck_id', top_ids).execute()
                user_upvoted_ids = {u['community_deck_id'] for u in (uv.data or [])}
            except Exception:
                pass

        # Sort by weekly count
        decks_map = {d['id']: d for d in (decks_result.data or [])}
        sorted_decks = [decks_map[did] for did in top_ids if did in decks_map]

        return [
            _build_showcase_deck(d, has_upvoted=d['id'] in user_upvoted_ids)
            for d in sorted_decks
        ]

    except Exception as e:
        logger.error(f"Error fetching weekly top: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch weekly top")


@router.post("/{deck_id}/upvote")
async def toggle_upvote(
    deck_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """
    Toggle upvote on a community deck.
    If already upvoted, removes the upvote. Otherwise adds one.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        # Verify deck exists and is approved
        deck = supabase.table('community_decks').select(
            'id, upvote_count'
        ).eq('id', deck_id).eq('status', 'approved').execute()

        if not deck.data:
            raise HTTPException(status_code=404, detail="Community deck not found")

        current_count = deck.data[0].get('upvote_count', 0)

        # Check if already upvoted
        existing = supabase.table('showcase_upvotes').select('id').eq(
            'community_deck_id', deck_id
        ).eq('user_id', user_id).execute()

        if existing.data:
            # Remove upvote
            supabase.table('showcase_upvotes').delete().eq(
                'community_deck_id', deck_id
            ).eq('user_id', user_id).execute()
            new_count = max(0, current_count - 1)
            upvoted = False
        else:
            # Add upvote
            supabase.table('showcase_upvotes').insert({
                'community_deck_id': deck_id,
                'user_id': user_id,
            }).execute()
            new_count = current_count + 1
            upvoted = True

        # Update count on deck
        try:
            supabase.table('community_decks').update({
                'upvote_count': new_count
            }).eq('id', deck_id).execute()
        except Exception:
            pass  # Don't fail if count sync fails

        return {
            "success": True,
            "upvoted": upvoted,
            "upvote_count": new_count,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error toggling upvote: {e}")
        raise HTTPException(status_code=500, detail="Failed to toggle upvote")


@router.get("/{deck_id}/upvote-status")
async def get_upvote_status(
    deck_id: str,
    user: Dict[str, Any] = Depends(get_current_user_required),
):
    """
    Check if the current user has upvoted a specific deck.
    """
    try:
        supabase = get_supabase_client()
        user_id = user['id']

        existing = supabase.table('showcase_upvotes').select('id').eq(
            'community_deck_id', deck_id
        ).eq('user_id', user_id).execute()

        return {
            "has_upvoted": bool(existing.data),
        }

    except Exception as e:
        logger.error(f"Error checking upvote status: {e}")
        raise HTTPException(status_code=500, detail="Failed to check upvote status")


# ============================================================================
# Admin Endpoints
# ============================================================================

@router.get("/admin/queue")
async def get_admin_queue(
    status: Optional[str] = Query("pending", description="Filter by status"),
    category: Optional[str] = Query(None, description="Filter by category"),
    page: int = Query(1, ge=1),
    limit: int = Query(20, ge=1, le=100),
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get community submissions queue for admin review.
    """
    try:
        supabase = get_supabase_client()
        offset = (page - 1) * limit

        query = supabase.table('community_decks').select(
            'id, deck_uuid, title, description, category, tags, status, '
            'slide_count, first_slide, author_name, author_email, user_id, '
            'submitted_at, reviewed_at, reviewed_by, rejection_reason',
            count='exact'
        )

        if status:
            query = query.eq('status', status)

        if category:
            query = query.eq('category', category)

        query = query.order('submitted_at', desc=True).range(offset, offset + limit - 1)

        result = query.execute()

        return {
            "submissions": result.data or [],
            "total": result.count or 0,
            "page": page,
            "limit": limit,
            "has_more": offset + limit < (result.count or 0)
        }

    except Exception as e:
        logger.error(f"Error getting admin queue: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch queue")


@router.post("/admin/{submission_id}/approve")
async def approve_submission(
    submission_id: str,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Approve a community submission.
    Creates a snapshot of the deck at approval time.
    """
    try:
        supabase = get_supabase_client()

        # Get the submission
        result = supabase.table('community_decks').select(
            'id, deck_uuid, status'
        ).eq('id', submission_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        submission = result.data[0]

        if submission['status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Submission is already {submission['status']}")

        # Get the current deck data to snapshot
        deck = get_deck(submission['deck_uuid'])

        if not deck:
            raise HTTPException(status_code=404, detail="Associated deck not found")

        # Extract theme from deck data
        theme = None
        if deck.get('data') and deck['data'].get('theme'):
            theme = deck['data']['theme']
        elif deck.get('theme'):
            theme = deck['theme']

        # Update to approved with snapshot
        update_data = {
            'status': 'approved',
            'reviewed_by': admin['id'],
            'reviewed_at': datetime.utcnow().isoformat(),
            'approved_at': datetime.utcnow().isoformat(),
            'slides_snapshot': deck.get('slides', []),
            'theme_snapshot': theme,
            'slide_count': len(deck.get('slides', [])),
            'first_slide': deck.get('slides', [{}])[0] if deck.get('slides') else None,
        }

        supabase.table('community_decks').update(update_data).eq('id', submission_id).execute()

        logger.info(f"Admin {admin['email']} approved submission {submission_id}")

        return {"success": True, "message": "Submission approved"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error approving submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to approve submission")


@router.post("/admin/{submission_id}/reject")
async def reject_submission(
    submission_id: str,
    request: RejectCommunitySubmissionRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Reject a community submission with a reason.
    """
    try:
        supabase = get_supabase_client()

        # Get the submission
        result = supabase.table('community_decks').select('id, status').eq('id', submission_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        submission = result.data[0]

        if submission['status'] != 'pending':
            raise HTTPException(status_code=400, detail=f"Submission is already {submission['status']}")

        # Update to rejected
        update_data = {
            'status': 'rejected',
            'reviewed_by': admin['id'],
            'reviewed_at': datetime.utcnow().isoformat(),
            'rejection_reason': request.reason,
        }

        supabase.table('community_decks').update(update_data).eq('id', submission_id).execute()

        logger.info(f"Admin {admin['email']} rejected submission {submission_id}: {request.reason}")

        return {"success": True, "message": "Submission rejected"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error rejecting submission: {e}")
        raise HTTPException(status_code=500, detail="Failed to reject submission")


@router.delete("/admin/{submission_id}")
async def remove_community_deck(
    submission_id: str,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Remove an approved deck from the community.
    """
    try:
        supabase = get_supabase_client()

        # Delete the submission
        result = supabase.table('community_decks').delete().eq('id', submission_id).execute()

        logger.info(f"Admin {admin['email']} removed community deck {submission_id}")

        return {"success": True, "message": "Community deck removed"}

    except Exception as e:
        logger.error(f"Error removing community deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to remove deck")


class UpdateCommunityDeckRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    tags: Optional[List[str]] = None


@router.patch("/admin/{submission_id}")
async def update_community_deck(
    submission_id: str,
    request: UpdateCommunityDeckRequest,
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Update a community deck's metadata (title, description, category, tags).
    Admin only.
    """
    try:
        supabase = get_supabase_client()

        # Build update data from non-None fields
        update_data = {}
        if request.title is not None:
            update_data['title'] = request.title
        if request.description is not None:
            update_data['description'] = request.description
        if request.category is not None:
            update_data['category'] = request.category
        if request.tags is not None:
            update_data['tags'] = request.tags

        if not update_data:
            raise HTTPException(status_code=400, detail="No fields to update")

        update_data['updated_at'] = datetime.utcnow().isoformat()

        result = supabase.table('community_decks').update(update_data).eq('id', submission_id).execute()

        if not result.data:
            raise HTTPException(status_code=404, detail="Submission not found")

        logger.info(f"Admin {admin['email']} updated community deck {submission_id}")

        return {"success": True, "message": "Community deck updated", "data": result.data[0]}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error updating community deck: {e}")
        raise HTTPException(status_code=500, detail="Failed to update deck")


@router.get("/admin/stats")
async def get_community_stats(
    admin: Dict[str, Any] = Depends(verify_admin_role)
):
    """
    Get community statistics for admin dashboard.
    """
    try:
        supabase = get_supabase_client()

        # Get counts by status
        all_submissions = supabase.table('community_decks').select('status').execute()

        stats = {
            'pending': 0,
            'approved': 0,
            'rejected': 0,
            'total': 0
        }

        for sub in (all_submissions.data or []):
            status = sub['status']
            stats[status] = stats.get(status, 0) + 1
            stats['total'] += 1

        # Get total remixes
        remix_result = supabase.table('community_decks').select('remix_count').eq('status', 'approved').execute()
        stats['total_remixes'] = sum(d.get('remix_count', 0) for d in (remix_result.data or []))

        # Get total views
        view_result = supabase.table('community_decks').select('view_count').eq('status', 'approved').execute()
        stats['total_views'] = sum(d.get('view_count', 0) for d in (view_result.data or []))

        return stats

    except Exception as e:
        logger.error(f"Error getting community stats: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch stats")
