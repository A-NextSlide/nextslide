"""
Deck sharing service for creating and managing share links with short URLs.
"""
import logging
from typing import Dict, Any, Optional, List
from datetime import datetime, timedelta
import secrets
import string
import os

from utils.supabase import get_supabase_client

logger = logging.getLogger(__name__)


class DuplicateCollaboratorError(Exception):
    """Raised when attempting to add a duplicate collaborator to a deck."""


class DeckSharingService:
    """Service for creating and managing deck share links."""
    
    # Characters to use in short codes (excluding similar looking ones)
    SHORT_CODE_CHARS = string.ascii_letters + string.digits
    # Remove ambiguous characters
    SHORT_CODE_CHARS = SHORT_CODE_CHARS.replace('0', '').replace('O', '').replace('l', '').replace('I', '')
    
    def __init__(self):
        self.supabase = get_supabase_client()
    
    def generate_short_code(self, length: int = 8) -> str:
        """Generate a random short code for URLs."""
        return ''.join(secrets.choice(self.SHORT_CODE_CHARS) for _ in range(length))
    
    def create_share_link(
        self,
        deck_uuid: str,
        user_id: str,
        share_type: str = 'view',
        expires_in_hours: Optional[int] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> Dict[str, Any]:
        """
        Create a new share link for a deck.

        Args:
            deck_uuid: The UUID of the deck to share
            user_id: The ID of the user creating the share
            share_type: 'view' for read-only, 'edit' for collaboration
            expires_in_hours: Optional expiration time in hours
            metadata: Optional metadata (e.g., password protection settings)

        Returns:
            Dict containing the share link details
        """
        try:
            # Generate a unique short code
            short_code = self.generate_short_code()

            # Ensure short code is unique (retry if collision)
            for _ in range(5):
                existing = self.supabase.table('deck_shares').select('id').eq('short_code', short_code).execute()
                if not existing.data:
                    break
                short_code = self.generate_short_code()

            # Calculate expiration if provided
            expires_at = None
            if expires_in_hours:
                expires_at = (datetime.utcnow() + timedelta(hours=expires_in_hours)).isoformat()

            # Insert directly into deck_shares table
            insert_data = {
                'deck_uuid': deck_uuid,
                'short_code': short_code,
                'share_type': share_type,
                'created_by': user_id,
                'is_active': True,
                'access_count': 0
            }

            if expires_at:
                insert_data['expires_at'] = expires_at

            if metadata:
                insert_data['metadata'] = metadata

            result = self.supabase.table('deck_shares').insert(insert_data).execute()

            if result.data and len(result.data) > 0:
                share_data = result.data[0]
                logger.info(f"Created share link for deck {deck_uuid}: {short_code}")
                return {
                    'id': share_data['id'],
                    'short_code': short_code,
                    'share_type': share_type,
                    'expires_at': share_data.get('expires_at'),
                    'share_url': f"/p/{short_code}" if share_type == 'view' else f"/e/{short_code}"
                }
            else:
                raise Exception("Failed to create share link - no data returned")

        except Exception as e:
            logger.error(f"Error creating share link: {str(e)}")
            raise
    
    def get_deck_by_share_code(self, short_code: str) -> Optional[Dict[str, Any]]:
        """
        Get deck information using a share code.
        Records the access and returns deck data if valid.

        Args:
            short_code: The short code from the share URL

        Returns:
            Deck data if valid share code, None otherwise
        """
        try:
            # Get the share link and verify it's active
            share_response = self.supabase.table('deck_shares').select(
                'id, deck_uuid, share_type, created_by, metadata, expires_at, is_active, access_count'
            ).eq('short_code', short_code).execute()

            if not share_response.data or len(share_response.data) == 0:
                logger.warning(f"Share code not found: {short_code}")
                return None

            share_info = share_response.data[0]

            # Check if share is active
            if not share_info.get('is_active', False):
                logger.warning(f"Share link is inactive: {short_code}")
                return None

            # Check if share has expired
            if share_info.get('expires_at'):
                expires_at = datetime.fromisoformat(share_info['expires_at'].replace('Z', '+00:00'))
                if datetime.now(expires_at.tzinfo) > expires_at:
                    logger.warning(f"Share link has expired: {short_code}")
                    return None

            deck_uuid = share_info['deck_uuid']

            # Update access count and last_accessed_at
            try:
                self.supabase.table('deck_shares').update({
                    'access_count': (share_info.get('access_count', 0) or 0) + 1,
                    'last_accessed_at': datetime.utcnow().isoformat()
                }).eq('id', share_info['id']).execute()
            except Exception as e:
                logger.warning(f"Failed to update access count: {e}")

            # Get the deck data
            deck_response = self.supabase.table('decks').select('*').eq('uuid', deck_uuid).execute()

            if deck_response.data and len(deck_response.data) > 0:
                deck = deck_response.data[0]
                deck['share_info'] = {
                    'share_type': share_info['share_type'],
                    'is_editable': share_info['share_type'] == 'edit',
                    'metadata': share_info.get('metadata')
                }
                return deck

            return None

        except Exception as e:
            logger.error(f"Error accessing deck by share code: {str(e)}")
            return None
    
    def get_user_share_links(self, user_id: str, deck_uuid: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Get all share links created by a user.
        
        Args:
            user_id: The user ID
            deck_uuid: Optional deck UUID to filter by specific deck
            
        Returns:
            List of share link records
        """
        try:
            query = self.supabase.table('active_deck_shares').select('*').eq('created_by', user_id)
            
            if deck_uuid:
                query = query.eq('deck_uuid', deck_uuid)
            
            result = query.order('created_at', desc=True).execute()
            
            return result.data if result.data else []
            
        except Exception as e:
            logger.error(f"Error getting user share links: {str(e)}")
            return []
    
    def revoke_share_link(self, share_id: str, user_id: str) -> bool:
        """
        Revoke (deactivate) a share link.
        
        Args:
            share_id: The ID of the share link
            user_id: The ID of the user (must be creator)
            
        Returns:
            True if successful, False otherwise
        """
        try:
            result = self.supabase.table('deck_shares').update(
                {'is_active': False}
            ).eq('id', share_id).eq('created_by', user_id).execute()
            
            if result.data:
                logger.info(f"Revoked share link {share_id}")
                return True
            
            return False
            
        except Exception as e:
            logger.error(f"Error revoking share link: {str(e)}")
            return False
    
    def update_share_link(
        self,
        share_id: str,
        user_id: str,
        updates: Dict[str, Any]
    ) -> Optional[Dict[str, Any]]:
        """
        Update a share link (e.g., change expiration, metadata).
        
        Args:
            share_id: The ID of the share link
            user_id: The ID of the user (must be creator)
            updates: Dict of fields to update
            
        Returns:
            Updated share link data or None
        """
        try:
            # Only allow updating certain fields
            allowed_updates = {}
            if 'expires_at' in updates:
                allowed_updates['expires_at'] = updates['expires_at']
            if 'metadata' in updates:
                allowed_updates['metadata'] = updates['metadata']
            
            if not allowed_updates:
                return None
            
            result = self.supabase.table('deck_shares').update(
                allowed_updates
            ).eq('id', share_id).eq('created_by', user_id).execute()
            
            return result.data[0] if result.data else None
            
        except Exception as e:
            logger.error(f"Error updating share link: {str(e)}")
            return None
    
    def get_share_stats(self, share_id: str, user_id: str) -> Optional[Dict[str, Any]]:
        """
        Get usage statistics for a share link.

        Args:
            share_id: The ID of the share link
            user_id: The ID of the user (must be creator)

        Returns:
            Share statistics or None
        """
        try:
            result = self.supabase.table('deck_shares').select(
                'short_code, share_type, created_at, expires_at, access_count, last_accessed_at'
            ).eq('id', share_id).eq('created_by', user_id).execute()

            return result.data[0] if result.data else None

        except Exception as e:
            logger.error(f"Error getting share stats: {str(e)}")
            return None

    def user_has_deck_access(self, deck_uuid: str, user_id: str) -> bool:
        """
        Check if a user has access to a deck (as owner or collaborator).

        Args:
            deck_uuid: The deck UUID
            user_id: The user ID to check

        Returns:
            True if user has access, False otherwise
        """
        try:
            # Check if user is the deck owner
            deck_result = self.supabase.table('decks').select('user_id').eq('uuid', deck_uuid).execute()
            if deck_result.data and len(deck_result.data) > 0:
                if deck_result.data[0].get('user_id') == user_id:
                    return True

            # Check if user is a collaborator
            collab_result = self.supabase.table('deck_collaborators').select('id').eq(
                'deck_uuid', deck_uuid
            ).eq('user_id', user_id).neq('status', 'revoked').execute()

            if collab_result.data and len(collab_result.data) > 0:
                return True

            # Check user_decks junction table (for decks associated with user)
            user_deck_result = self.supabase.table('user_decks').select('id').eq(
                'deck_uuid', deck_uuid
            ).eq('user_id', user_id).execute()

            if user_deck_result.data and len(user_deck_result.data) > 0:
                return True

            return False

        except Exception as e:
            logger.error(f"Error checking deck access: {str(e)}")
            return False

    def add_collaborator(
        self,
        deck_uuid: str,
        owner_id: str,
        collaborator_email: str,
        permissions: List[str] = ['view', 'edit']
    ) -> Dict[str, Any]:
        """
        Add a collaborator to a deck using their email.
        This creates an edit share link and sends an invitation email if user doesn't exist.
        
        Args:
            deck_uuid: The deck UUID
            owner_id: The deck owner's user ID
            collaborator_email: Email of the person to add as collaborator
            permissions: List of permissions to grant
            
        Returns:
            Share link details
        """
        try:
            # Normalize email
            email_normalized = (collaborator_email or '').strip().lower()
            if not email_normalized:
                raise ValueError("Invalid email")

            # Check if collaborator already exists as a user
            user_id: Optional[str] = None
            try:
                user_lookup = self.supabase.table("users").select("id").eq("email", email_normalized).execute()
                if user_lookup.data and len(user_lookup.data) > 0:
                    user_id = user_lookup.data[0].get("id")
            except Exception as e:
                logger.warning(f"User lookup failed for {email_normalized}: {e}")

            # Duplicate check (active or invited and not revoked)
            dup_query = self.supabase.table("deck_collaborators").select("id,status").eq("deck_uuid", deck_uuid)
            if user_id:
                dup_query = dup_query.eq("user_id", user_id)
            else:
                dup_query = dup_query.eq("email", email_normalized)
            dup_query = dup_query.neq("status", "revoked")
            dup = dup_query.execute()
            if dup.data and len(dup.data) > 0:
                # Signal duplicate to API layer
                raise DuplicateCollaboratorError("Collaborator already exists for this deck")

            # Create an edit share link to provide FE with fallback when email delivery isn't set up
            share_link = self.create_share_link(
                deck_uuid=deck_uuid,
                user_id=owner_id,
                share_type='edit',
                metadata={
                    'collaborator_email': email_normalized,
                    'permissions': permissions,
                    'invitation_initiated_at': datetime.utcnow().isoformat()
                }
            )

            # Insert/Upsert collaborator record
            now_iso = datetime.utcnow().isoformat()
            collaborator_record: Dict[str, Any] = {
                "deck_uuid": deck_uuid,
                "email": email_normalized,
                "user_id": user_id,
                "invited_by": owner_id,
                "invited_at": now_iso,
                "status": "active" if user_id else "invited",
                "permissions": permissions or ['view', 'edit'],
                "share_link_id": share_link.get('id'),
                "updated_at": now_iso
            }
            # If existing user, mark accepted_at as now
            if user_id:
                collaborator_record["accepted_at"] = now_iso

            try:
                self.supabase.table("deck_collaborators").insert(collaborator_record).execute()
            except Exception as e:
                logger.warning(f"Failed to create deck_collaborators row: {e}")

            # Try to send invitation email for non-users (Best-effort)
            invitation_sent = False
            invitation_error: Optional[str] = None
            collaborator_exists = bool(user_id)
            if not collaborator_exists:
                service_key = os.getenv("SUPABASE_SERVICE_KEY")
                if service_key:
                    try:
                        from supabase import create_client
                        admin_client = create_client(os.getenv("SUPABASE_URL"), service_key)
                        # Kick off invite; Supabase will email the user
                        admin_client.auth.admin.invite_user_by_email(email_normalized)
                        invitation_sent = True
                    except Exception as e:
                        invitation_error = str(e)
                        logger.warning(f"Could not send invitation email via Supabase: {invitation_error}")
                        # Fallback: use Resend if configured
                        try:
                            # Fetch deck name for nicer email
                            deck_response = self.supabase.table('decks').select('name').eq('uuid', deck_uuid).single().execute()
                            deck_title = deck_response.data.get('name', 'Untitled Deck') if deck_response.data else 'Untitled Deck'
                            base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
                            share_url = f"{base_url}/e/{share_link['short_code']}"
                            from services.email_service import send_collaborator_invite_email
                            if send_collaborator_invite_email(email_normalized, deck_title, share_url):
                                invitation_sent = True
                                invitation_error = None
                        except Exception as e2:
                            logger.warning(f"Resend fallback failed: {e2}")
                else:
                    logger.warning("SUPABASE_SERVICE_KEY not set - cannot send invitation emails")
                    # Try Resend only path as fallback
                    try:
                        deck_response = self.supabase.table('decks').select('name').eq('uuid', deck_uuid).single().execute()
                        deck_title = deck_response.data.get('name', 'Untitled Deck') if deck_response.data else 'Untitled Deck'
                        base_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
                        share_url = f"{base_url}/e/{share_link['short_code']}"
                        from services.email_service import send_collaborator_invite_email
                        if send_collaborator_invite_email(email_normalized, deck_title, share_url):
                            invitation_sent = True
                    except Exception as e3:
                        logger.warning(f"Resend-only invite failed: {e3}")

            # Enrich share link for FE expectations
            share_link['access_count'] = 0
            share_link['last_accessed_at'] = None
            share_link['is_active'] = True

            # Attach collaborator info to return
            share_link['invitation_sent'] = invitation_sent
            share_link['invitation_error'] = invitation_error
            share_link['collaborator_exists'] = collaborator_exists
            share_link['user_id'] = user_id
            share_link['collaborator_email'] = email_normalized

            return share_link

        except DuplicateCollaboratorError:
            # Bubble up for proper HTTP 409 handling
            raise
        except Exception as e:
            logger.error(f"Error adding collaborator: {str(e)}")
            raise


# Singleton instance
_sharing_service = None

def get_sharing_service() -> DeckSharingService:
    """Get or create the sharing service instance."""
    global _sharing_service
    if _sharing_service is None:
        _sharing_service = DeckSharingService()
    return _sharing_service 