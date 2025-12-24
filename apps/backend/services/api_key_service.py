"""
API Key Service

Handles API key generation, validation, and management for the Developer API.
Keys are stored as SHA256 hashes - the actual key is only shown once on creation.
"""

import hashlib
import secrets
import logging
from typing import Optional, Dict, Any, List, Tuple
from datetime import datetime
from dataclasses import dataclass

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)


@dataclass
class ApiKeyRecord:
    """Represents an API key record from the database."""
    id: str
    user_id: str
    key_prefix: str
    name: str
    context_instructions: Optional[str]
    context_images: List[str]
    webhook_url: Optional[str]
    include_edit_link: bool
    created_at: str
    last_used_at: Optional[str]
    request_count: int
    is_active: bool


class ApiKeyService:
    """Service for managing API keys."""

    KEY_PREFIX = "ns_live_"
    KEY_LENGTH = 32  # Characters after prefix

    def __init__(self):
        self._client = None

    def _get_client(self):
        if self._client is None:
            self._client = get_supabase_client()
        return self._client

    def generate_api_key(self) -> Tuple[str, str, str]:
        """
        Generate a new API key.

        Returns:
            Tuple of (full_key, prefix, hash)
            - full_key: The complete API key to show to user ONCE
            - prefix: The visible prefix for UI display (e.g., "ns_live_abc1...")
            - hash: SHA256 hash for storage
        """
        # Generate cryptographically secure random bytes
        random_part = secrets.token_urlsafe(self.KEY_LENGTH)[:self.KEY_LENGTH]
        full_key = f"{self.KEY_PREFIX}{random_part}"

        # Create prefix for display (first 16 chars visible)
        prefix = full_key[:16] + "..."

        # Hash for storage
        key_hash = hashlib.sha256(full_key.encode()).hexdigest()

        return full_key, prefix, key_hash

    async def validate_api_key(self, key: str) -> Optional[Tuple[str, ApiKeyRecord]]:
        """
        Validate an API key and return the user_id and key record.

        Args:
            key: The full API key from the request header

        Returns:
            Tuple of (user_id, ApiKeyRecord) if valid, None otherwise
        """
        if not key or not key.startswith(self.KEY_PREFIX):
            return None

        key_hash = hashlib.sha256(key.encode()).hexdigest()

        try:
            client = self._get_client()
            result = client.table("api_keys") \
                .select("*") \
                .eq("key_hash", key_hash) \
                .eq("is_active", True) \
                .single() \
                .execute()

            if not result.data:
                return None

            record = self._parse_record(result.data)

            # Update usage stats asynchronously (fire and forget)
            self._increment_usage_sync(key_hash)

            return record.user_id, record

        except Exception as e:
            logger.error(f"Error validating API key: {e}")
            return None

    def _increment_usage_sync(self, key_hash: str):
        """Increment usage counter and update last_used_at."""
        try:
            client = self._get_client()
            client.table("api_keys") \
                .update({
                    "last_used_at": datetime.utcnow().isoformat(),
                    "request_count": client.table("api_keys")
                        .select("request_count")
                        .eq("key_hash", key_hash)
                        .single()
                        .execute()
                        .data.get("request_count", 0) + 1
                }) \
                .eq("key_hash", key_hash) \
                .execute()
        except Exception as e:
            # Don't fail the request if usage tracking fails
            logger.warning(f"Failed to increment API key usage: {e}")

    async def increment_usage(self, key_hash: str):
        """Increment usage counter and update last_used_at."""
        try:
            client = self._get_client()

            # Get current count
            current = client.table("api_keys") \
                .select("request_count") \
                .eq("key_hash", key_hash) \
                .single() \
                .execute()

            current_count = current.data.get("request_count", 0) if current.data else 0

            # Update
            client.table("api_keys") \
                .update({
                    "last_used_at": datetime.utcnow().isoformat(),
                    "request_count": current_count + 1
                }) \
                .eq("key_hash", key_hash) \
                .execute()

        except Exception as e:
            logger.warning(f"Failed to increment API key usage: {e}")

    async def create_api_key(
        self,
        user_id: str,
        name: str = "Default",
        context_instructions: Optional[str] = None,
        context_images: Optional[List[str]] = None,
        webhook_url: Optional[str] = None,
        include_edit_link: bool = False
    ) -> Tuple[str, ApiKeyRecord]:
        """
        Create a new API key for a user.

        Args:
            user_id: The user's ID
            name: A name/label for the key
            context_instructions: Custom instructions for deck generation
            context_images: List of image URLs for context
            webhook_url: URL to call when deck generation completes
            include_edit_link: Whether to include edit link in responses

        Returns:
            Tuple of (full_key, ApiKeyRecord)
            The full_key should be shown to the user ONCE and never stored.
        """
        full_key, prefix, key_hash = self.generate_api_key()

        try:
            client = self._get_client()

            data = {
                "user_id": user_id,
                "key_prefix": prefix,
                "key_hash": key_hash,
                "name": name,
                "context_instructions": context_instructions,
                "context_images": context_images or [],
                "webhook_url": webhook_url,
                "include_edit_link": include_edit_link,
                "is_active": True,
                "request_count": 0
            }

            result = client.table("api_keys") \
                .insert(data) \
                .execute()

            if not result.data:
                raise Exception("Failed to create API key")

            record = self._parse_record(result.data[0])
            logger.info(f"Created API key {record.id} for user {user_id}")

            return full_key, record

        except Exception as e:
            logger.error(f"Error creating API key: {e}")
            raise

    async def list_api_keys(self, user_id: str) -> List[ApiKeyRecord]:
        """
        List all API keys for a user.

        Args:
            user_id: The user's ID

        Returns:
            List of ApiKeyRecord (without the actual key, only prefix)
        """
        try:
            client = self._get_client()

            result = client.table("api_keys") \
                .select("*") \
                .eq("user_id", user_id) \
                .order("created_at", desc=True) \
                .execute()

            return [self._parse_record(row) for row in (result.data or [])]

        except Exception as e:
            logger.error(f"Error listing API keys: {e}")
            return []

    async def get_api_key(self, key_id: str, user_id: str) -> Optional[ApiKeyRecord]:
        """
        Get a single API key by ID.

        Args:
            key_id: The key's UUID
            user_id: The user's ID (for authorization)

        Returns:
            ApiKeyRecord if found and owned by user, None otherwise
        """
        try:
            client = self._get_client()

            result = client.table("api_keys") \
                .select("*") \
                .eq("id", key_id) \
                .eq("user_id", user_id) \
                .single() \
                .execute()

            if not result.data:
                return None

            return self._parse_record(result.data)

        except Exception as e:
            logger.error(f"Error getting API key: {e}")
            return None

    async def update_api_key(
        self,
        key_id: str,
        user_id: str,
        updates: Dict[str, Any]
    ) -> Optional[ApiKeyRecord]:
        """
        Update an API key's settings.

        Args:
            key_id: The key's UUID
            user_id: The user's ID (for authorization)
            updates: Dict of fields to update

        Returns:
            Updated ApiKeyRecord if successful, None otherwise
        """
        # Allowed fields to update
        allowed_fields = {
            "name", "context_instructions", "context_images",
            "webhook_url", "include_edit_link"
        }

        # Filter to only allowed fields
        filtered_updates = {k: v for k, v in updates.items() if k in allowed_fields}

        if not filtered_updates:
            return await self.get_api_key(key_id, user_id)

        try:
            client = self._get_client()

            result = client.table("api_keys") \
                .update(filtered_updates) \
                .eq("id", key_id) \
                .eq("user_id", user_id) \
                .execute()

            if not result.data:
                return None

            logger.info(f"Updated API key {key_id}")
            return self._parse_record(result.data[0])

        except Exception as e:
            logger.error(f"Error updating API key: {e}")
            return None

    async def revoke_api_key(self, key_id: str, user_id: str) -> bool:
        """
        Revoke (soft delete) an API key.

        Args:
            key_id: The key's UUID
            user_id: The user's ID (for authorization)

        Returns:
            True if successful, False otherwise
        """
        try:
            client = self._get_client()

            result = client.table("api_keys") \
                .update({"is_active": False}) \
                .eq("id", key_id) \
                .eq("user_id", user_id) \
                .execute()

            if result.data:
                logger.info(f"Revoked API key {key_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error revoking API key: {e}")
            return False

    async def delete_api_key(self, key_id: str, user_id: str) -> bool:
        """
        Permanently delete an API key.

        Args:
            key_id: The key's UUID
            user_id: The user's ID (for authorization)

        Returns:
            True if successful, False otherwise
        """
        try:
            client = self._get_client()

            result = client.table("api_keys") \
                .delete() \
                .eq("id", key_id) \
                .eq("user_id", user_id) \
                .execute()

            if result.data:
                logger.info(f"Deleted API key {key_id}")
                return True
            return False

        except Exception as e:
            logger.error(f"Error deleting API key: {e}")
            return False

    def _parse_record(self, data: Dict[str, Any]) -> ApiKeyRecord:
        """Parse a database row into an ApiKeyRecord."""
        return ApiKeyRecord(
            id=data["id"],
            user_id=data["user_id"],
            key_prefix=data["key_prefix"],
            name=data.get("name", "Default"),
            context_instructions=data.get("context_instructions"),
            context_images=data.get("context_images") or [],
            webhook_url=data.get("webhook_url"),
            include_edit_link=data.get("include_edit_link", False),
            created_at=data["created_at"],
            last_used_at=data.get("last_used_at"),
            request_count=data.get("request_count", 0),
            is_active=data.get("is_active", True)
        )


# Singleton instance
_api_key_service: Optional[ApiKeyService] = None


def get_api_key_service() -> ApiKeyService:
    """Get the singleton ApiKeyService instance."""
    global _api_key_service
    if _api_key_service is None:
        _api_key_service = ApiKeyService()
    return _api_key_service
