"""Simple in-process cache for deck/theme context snapshots.

The goal is to avoid recomputing verbose deck summaries on every agent turn
and to provide lightweight digests that can be attached to prompts without
re-sending the full deck payload.
"""

from __future__ import annotations

import hashlib
import json
import threading
import time
from typing import Any, Dict, Optional

from utils.summaries import build_deck_digest


_CACHE_LOCK = threading.Lock()
_CACHE: Dict[str, Dict[str, Any]] = {}
_DEFAULT_TTL = 60.0  # seconds


def _json_hash(data: Any) -> str:
    """Compute a stable hash for arbitrary deck structures."""

    def _default(obj: Any) -> Any:
        if hasattr(obj, "model_dump"):
            return obj.model_dump()
        if hasattr(obj, "dict"):
            return obj.dict()
        if isinstance(obj, set):
            return sorted(list(obj))
        raise TypeError(f"Object of type {type(obj)} is not JSON serializable")

    payload = json.dumps(data, sort_keys=True, default=_default)
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def get_deck_context_snapshot(
    deck_id: Optional[str],
    deck_data: Any,
    current_slide_id: Optional[str] = None,
    ttl: float = _DEFAULT_TTL,
) -> Dict[str, Any]:
    """Return a cached deck digest (hash + lightweight summary).

    Args:
        deck_id: Persistent deck identifier (if absent we fall back to hash).
        deck_data: Full deck payload.
        current_slide_id: Current slide identifier for highlighting.
        ttl: Cache expiry window in seconds.
    """

    deck_hash = _json_hash(deck_data)
    cache_key = deck_id or deck_hash

    now = time.time()
    with _CACHE_LOCK:
        snapshot = _CACHE.get(cache_key)
        if (
            snapshot
            and snapshot.get("hash") == deck_hash
            and (now - snapshot.get("stored_at", 0)) <= ttl
        ):
            # Refresh timestamp to keep frequently used decks warm.
            snapshot["stored_at"] = now
            return snapshot["payload"]  # type: ignore[return-value]

    digest = build_deck_digest(deck_data, current_slide_id=current_slide_id)
    payload = {
        "hash": deck_hash,
        "summary_text": digest.get("summary_text"),
        "slides": digest.get("slides", []),
        "meta": digest.get("meta", {}),
    }

    with _CACHE_LOCK:
        _CACHE[cache_key] = {
            "hash": deck_hash,
            "payload": payload,
            "stored_at": now,
        }

        # Opportunistic pruning of stale entries.
        stale_keys = [
            key
            for key, entry in _CACHE.items()
            if (now - entry.get("stored_at", 0)) > (ttl * 4)
        ]
        for key in stale_keys:
            _CACHE.pop(key, None)

    return payload


def clear_cache() -> None:
    """Utility for tests to flush cached snapshots."""

    with _CACHE_LOCK:
        _CACHE.clear()

