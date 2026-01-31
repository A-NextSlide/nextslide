"""
Webpage Publishing Service
Handles publishing presentations as scrollable single-page websites.
"""
import re
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


def validate_slug(slug: str) -> Dict[str, Any]:
    """
    Validate slug format and check availability.
    Rules: lowercase, alphanumeric + hyphens, 3-60 chars, must start/end with alphanumeric.
    """
    # Check format
    if not slug:
        return {"valid": False, "error": "Slug is required"}

    if len(slug) < 3:
        return {"valid": False, "error": "Slug must be at least 3 characters"}

    if len(slug) > 60:
        return {"valid": False, "error": "Slug must be 60 characters or less"}

    if not re.match(r'^[a-z0-9][a-z0-9-]*[a-z0-9]$', slug) and len(slug) >= 3:
        return {"valid": False, "error": "Slug must contain only lowercase letters, numbers, and hyphens, and start/end with a letter or number"}

    if '--' in slug:
        return {"valid": False, "error": "Slug cannot contain consecutive hyphens"}

    # Check reserved slugs
    reserved = {'admin', 'api', 'app', 'login', 'signup', 'profile', 'settings', 'help', 'about', 'pricing', 'blog'}
    if slug in reserved:
        return {"valid": False, "error": "This slug is reserved"}

    # Check availability
    try:
        supabase = get_supabase_client()
        existing = supabase.table('published_webpages').select('id').eq('slug', slug).execute()
        if existing.data:
            return {"valid": False, "error": "This slug is already taken", "available": False}
    except Exception as e:
        logger.error(f"Error checking slug availability: {e}")
        return {"valid": False, "error": "Could not verify slug availability"}

    return {"valid": True, "available": True}


def publish_webpage(
    user_id: str,
    deck_id: str,
    slug: str,
    title: str,
    description: Optional[str],
    slides_data: list,
    settings: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Create or update a published webpage from a deck.
    If the deck already has a published webpage, update it; otherwise create a new one.
    """
    try:
        supabase = get_supabase_client()

        # Check if this deck already has a published webpage by this user
        existing = supabase.table('published_webpages').select('id, slug').eq(
            'deck_id', deck_id
        ).eq('user_id', user_id).execute()

        webpage_data = {
            'deck_id': deck_id,
            'user_id': user_id,
            'slug': slug,
            'title': title,
            'description': description,
            'slides_data': slides_data,
            'settings': settings or {},
            'is_published': True,
            'updated_at': datetime.utcnow().isoformat(),
        }

        if existing.data:
            # Update existing
            webpage_id = existing.data[0]['id']
            result = supabase.table('published_webpages').update(
                webpage_data
            ).eq('id', webpage_id).execute()
        else:
            # Create new
            webpage_data['created_at'] = datetime.utcnow().isoformat()
            result = supabase.table('published_webpages').insert(webpage_data).execute()

        if not result.data:
            return {"error": "Failed to publish webpage"}

        return {"success": True, "webpage": result.data[0]}

    except Exception as e:
        logger.error(f"Error publishing webpage: {e}")
        return {"error": str(e)}


def get_webpage_by_slug(slug: str) -> Optional[Dict[str, Any]]:
    """Fetch a published webpage by its slug (public access)."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('published_webpages').select('*').eq(
            'slug', slug
        ).eq('is_published', True).execute()

        if not result.data:
            return None

        return result.data[0]

    except Exception as e:
        logger.error(f"Error fetching webpage by slug: {e}")
        return None


def get_user_webpages(user_id: str) -> List[Dict[str, Any]]:
    """List all webpages published by a user."""
    try:
        supabase = get_supabase_client()
        result = supabase.table('published_webpages').select(
            'id, deck_id, slug, title, description, settings, is_published, '
            'view_count, lead_count, created_at, updated_at'
        ).eq('user_id', user_id).order('created_at', desc=True).execute()

        return result.data or []

    except Exception as e:
        logger.error(f"Error listing user webpages: {e}")
        return []


def update_webpage(
    user_id: str,
    webpage_id: str,
    data: Dict[str, Any],
) -> Dict[str, Any]:
    """Update a webpage's settings, slug, title, etc. Owner only."""
    try:
        supabase = get_supabase_client()

        # Verify ownership
        existing = supabase.table('published_webpages').select('id, user_id').eq(
            'id', webpage_id
        ).execute()

        if not existing.data:
            return {"error": "Webpage not found"}

        if existing.data[0]['user_id'] != user_id:
            return {"error": "Not authorized"}

        # Build update dict from allowed fields
        allowed_fields = {'slug', 'title', 'description', 'settings', 'slides_data', 'is_published'}
        update_data = {k: v for k, v in data.items() if k in allowed_fields}

        if not update_data:
            return {"error": "No valid fields to update"}

        update_data['updated_at'] = datetime.utcnow().isoformat()

        result = supabase.table('published_webpages').update(
            update_data
        ).eq('id', webpage_id).execute()

        if not result.data:
            return {"error": "Failed to update webpage"}

        return {"success": True, "webpage": result.data[0]}

    except Exception as e:
        logger.error(f"Error updating webpage: {e}")
        return {"error": str(e)}


def unpublish_webpage(user_id: str, webpage_id: str) -> Dict[str, Any]:
    """Set is_published to false. Owner only."""
    try:
        supabase = get_supabase_client()

        # Verify ownership
        existing = supabase.table('published_webpages').select('id, user_id').eq(
            'id', webpage_id
        ).execute()

        if not existing.data:
            return {"error": "Webpage not found"}

        if existing.data[0]['user_id'] != user_id:
            return {"error": "Not authorized"}

        result = supabase.table('published_webpages').update({
            'is_published': False,
            'updated_at': datetime.utcnow().isoformat(),
        }).eq('id', webpage_id).execute()

        if not result.data:
            return {"error": "Failed to unpublish webpage"}

        return {"success": True}

    except Exception as e:
        logger.error(f"Error unpublishing webpage: {e}")
        return {"error": str(e)}


def record_webpage_view(webpage_id: str) -> bool:
    """Increment the view count for a webpage."""
    try:
        supabase = get_supabase_client()

        # Get current count
        current = supabase.table('published_webpages').select('view_count').eq(
            'id', webpage_id
        ).execute()

        if not current.data:
            return False

        new_count = (current.data[0].get('view_count') or 0) + 1
        supabase.table('published_webpages').update({
            'view_count': new_count,
        }).eq('id', webpage_id).execute()

        return True

    except Exception as e:
        logger.error(f"Error recording webpage view: {e}")
        return False


def submit_lead(webpage_id: str, email: str, name: Optional[str] = None) -> Dict[str, Any]:
    """Capture a lead (email + optional name) for a webpage."""
    try:
        supabase = get_supabase_client()

        # Insert lead
        lead_data = {
            'webpage_id': webpage_id,
            'email': email,
            'name': name,
            'created_at': datetime.utcnow().isoformat(),
        }
        result = supabase.table('webpage_leads').insert(lead_data).execute()

        if not result.data:
            return {"error": "Failed to submit lead"}

        # Increment lead count on the webpage
        try:
            current = supabase.table('published_webpages').select('lead_count').eq(
                'id', webpage_id
            ).execute()
            if current.data:
                new_count = (current.data[0].get('lead_count') or 0) + 1
                supabase.table('published_webpages').update({
                    'lead_count': new_count,
                }).eq('id', webpage_id).execute()
        except Exception:
            pass  # Don't fail if count update fails

        return {"success": True, "lead_id": result.data[0]['id']}

    except Exception as e:
        logger.error(f"Error submitting lead: {e}")
        return {"error": str(e)}


def get_webpage_leads(user_id: str, webpage_id: str) -> Dict[str, Any]:
    """Get all leads for a webpage. Owner only."""
    try:
        supabase = get_supabase_client()

        # Verify ownership
        existing = supabase.table('published_webpages').select('id, user_id').eq(
            'id', webpage_id
        ).execute()

        if not existing.data:
            return {"error": "Webpage not found"}

        if existing.data[0]['user_id'] != user_id:
            return {"error": "Not authorized"}

        # Get leads
        result = supabase.table('webpage_leads').select(
            'id, email, name, created_at'
        ).eq('webpage_id', webpage_id).order('created_at', desc=True).execute()

        return {"success": True, "leads": result.data or []}

    except Exception as e:
        logger.error(f"Error getting webpage leads: {e}")
        return {"error": str(e)}
