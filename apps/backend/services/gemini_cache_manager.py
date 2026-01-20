"""
Gemini Context Caching Manager for deck-wide content caching.

Uses Google's Gemini API context caching to cache deck-wide context (research, theme, etc.)
once and reuse it across all slide generations. This provides:
- 90% cost reduction on cached tokens
- Faster generation (no repeated context processing)
- Lower latency for parallel slide generation

Minimum token requirements:
- Gemini 3 Flash Preview: 1024 tokens
- Gemini 3 Pro Preview: 4096 tokens

Reference: https://ai.google.dev/gemini-api/docs/caching
"""

import os
import threading
import time
from typing import Dict, Any, Optional, Tuple
from dataclasses import dataclass
from datetime import datetime, timezone, timedelta

from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Minimum tokens required for caching by model
MIN_CACHE_TOKENS = {
    "gemini-3-flash-preview": 1024,
    "gemini-3-pro-preview": 4096,
    "gemini-2.5-flash": 1024,
    "gemini-2.5-pro": 4096,
}

# Default TTL for caches (10 minutes - enough for deck generation)
DEFAULT_CACHE_TTL = "600s"

# In-memory cache of active Gemini caches by deck_uuid
_active_caches: Dict[str, "GeminiCacheEntry"] = {}
_cache_lock = threading.Lock()


@dataclass
class GeminiCacheEntry:
    """Represents an active Gemini cache."""
    cache_name: str  # The Gemini cache resource name
    deck_uuid: str
    model: str
    created_at: datetime
    static_block: str  # The cached content (for reference/logging)
    token_estimate: int


class GeminiCacheManager:
    """Manages Gemini context caches for deck generation."""

    def __init__(self):
        self._client = None
        self._enabled = os.getenv("ENABLE_GEMINI_CONTEXT_CACHING", "true").lower() == "true"

    def _get_client(self):
        """Get or create the Gemini client."""
        if self._client is None:
            try:
                from google import genai
                self._client = genai.Client()
                logger.info("[GeminiCache] Client initialized")
            except Exception as e:
                logger.warning(f"[GeminiCache] Failed to initialize client: {e}")
                self._enabled = False
        return self._client

    def is_enabled(self) -> bool:
        """Check if Gemini caching is enabled and available."""
        return self._enabled and self._get_client() is not None

    def estimate_tokens(self, text: str) -> int:
        """Estimate token count (~4 chars per token for English text)."""
        return len(text) // 4

    def should_cache(self, model: str, static_block: str) -> bool:
        """Determine if the static block is large enough to benefit from caching."""
        if not self.is_enabled():
            return False

        # Get minimum tokens for model
        min_tokens = MIN_CACHE_TOKENS.get(model, 4096)
        estimated_tokens = self.estimate_tokens(static_block)

        # Only cache if we meet the minimum and have substantial content
        should = estimated_tokens >= min_tokens

        if should:
            logger.info(
                f"[GeminiCache] Content eligible for caching: "
                f"~{estimated_tokens} tokens (min: {min_tokens})"
            )
        else:
            logger.info(
                f"[GeminiCache] Content too small for caching: "
                f"~{estimated_tokens} tokens (min: {min_tokens} for {model})"
            )

        return should

    def get_or_create_cache(
        self,
        deck_uuid: str,
        model: str,
        system_prompt: str,
        static_block: str,
        ttl: str = DEFAULT_CACHE_TTL,
    ) -> Optional[str]:
        """
        Get existing cache or create a new one for the deck.

        Args:
            deck_uuid: Unique identifier for the deck
            model: Gemini model name (e.g., "gemini-3-pro-preview")
            system_prompt: System instructions
            static_block: Deck-wide context to cache

        Returns:
            Cache name if successful, None otherwise
        """
        if not self.is_enabled():
            return None

        # Check if we already have a cache for this deck
        with _cache_lock:
            existing = _active_caches.get(deck_uuid)
            if existing and existing.model == model:
                logger.info(f"[GeminiCache] Using existing cache for deck {deck_uuid[:8]}")
                return existing.cache_name

        # Check if content is large enough to cache
        if not self.should_cache(model, static_block):
            return None

        try:
            client = self._get_client()
            if not client:
                return None

            from google.genai import types

            # Create the cache with system instruction and static content
            cache = client.caches.create(
                model=f"models/{model}",
                config=types.CreateCachedContentConfig(
                    display_name=f"nextslide-deck-{deck_uuid[:8]}",
                    system_instruction=system_prompt,
                    contents=[static_block],
                    ttl=ttl,
                )
            )

            cache_name = cache.name
            token_estimate = self.estimate_tokens(static_block)

            # Store in active caches
            with _cache_lock:
                _active_caches[deck_uuid] = GeminiCacheEntry(
                    cache_name=cache_name,
                    deck_uuid=deck_uuid,
                    model=model,
                    created_at=datetime.now(timezone.utc),
                    static_block=static_block[:200] + "...",  # Truncate for logging
                    token_estimate=token_estimate,
                )

            logger.info(
                f"[GeminiCache] Created cache '{cache_name}' for deck {deck_uuid[:8]} "
                f"(~{token_estimate} tokens, TTL: {ttl})"
            )

            return cache_name

        except Exception as e:
            logger.warning(f"[GeminiCache] Failed to create cache: {e}")
            return None

    def get_cache_name(self, deck_uuid: str) -> Optional[str]:
        """Get the cache name for a deck if it exists."""
        with _cache_lock:
            entry = _active_caches.get(deck_uuid)
            return entry.cache_name if entry else None

    def delete_cache(self, deck_uuid: str) -> bool:
        """Delete the cache for a deck."""
        with _cache_lock:
            entry = _active_caches.pop(deck_uuid, None)

        if not entry:
            return False

        try:
            client = self._get_client()
            if client:
                client.caches.delete(name=entry.cache_name)
                logger.info(f"[GeminiCache] Deleted cache for deck {deck_uuid[:8]}")
                return True
        except Exception as e:
            logger.warning(f"[GeminiCache] Failed to delete cache: {e}")

        return False

    def cleanup_expired_caches(self, max_age_seconds: int = 900) -> int:
        """Clean up caches older than max_age_seconds."""
        now = datetime.now(timezone.utc)
        cutoff = now - timedelta(seconds=max_age_seconds)

        expired_uuids = []
        with _cache_lock:
            for deck_uuid, entry in _active_caches.items():
                if entry.created_at < cutoff:
                    expired_uuids.append(deck_uuid)

        for deck_uuid in expired_uuids:
            self.delete_cache(deck_uuid)

        if expired_uuids:
            logger.info(f"[GeminiCache] Cleaned up {len(expired_uuids)} expired caches")

        return len(expired_uuids)

    def get_stats(self) -> Dict[str, Any]:
        """Get cache statistics."""
        with _cache_lock:
            return {
                "enabled": self._enabled,
                "active_caches": len(_active_caches),
                "caches": [
                    {
                        "deck_uuid": entry.deck_uuid[:8],
                        "model": entry.model,
                        "created_at": entry.created_at.isoformat(),
                        "token_estimate": entry.token_estimate,
                    }
                    for entry in _active_caches.values()
                ]
            }


# Singleton instance
_manager: Optional[GeminiCacheManager] = None


def get_gemini_cache_manager() -> GeminiCacheManager:
    """Get the singleton GeminiCacheManager instance."""
    global _manager
    if _manager is None:
        _manager = GeminiCacheManager()
    return _manager
