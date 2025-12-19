"""In-memory cache for image search results."""

import threading
from typing import Dict, Optional


class ImageSearchCache:
    """Cache image URLs per deck to avoid repeated SERP searches."""

    _lock = threading.Lock()
    _cache: Dict[str, Dict[str, str]] = {}

    def __init__(self, deck_uuid: Optional[str] = None):
        self.deck_uuid = deck_uuid or "global"

    def get(self, query: str) -> Optional[str]:
        if not query:
            return None
        key = query.strip().lower()
        with self._lock:
            return self._cache.get(self.deck_uuid, {}).get(key)

    def set(self, query: str, url: str) -> None:
        if not query or not url:
            return
        key = query.strip().lower()
        with self._lock:
            bucket = self._cache.setdefault(self.deck_uuid, {})
            bucket[key] = url
