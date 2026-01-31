"""
Growth Config Service

Centralized configuration for all PLG features.
Reads from the growth_config table with in-memory caching (60s TTL).
"""

import json
import time
import logging
from typing import Optional, Any, Dict, List

from services.supabase import get_supabase_client

logger = logging.getLogger(__name__)

_CACHE_TTL = 60  # seconds


class GrowthConfigService:
    """Service for reading/writing growth configuration."""

    def __init__(self):
        self._cache: Dict[str, Any] = {}
        self._cache_ts: float = 0

    def _get_client(self):
        return get_supabase_client()

    def _is_cache_valid(self) -> bool:
        return bool(self._cache) and (time.time() - self._cache_ts) < _CACHE_TTL

    def _refresh_cache(self) -> None:
        try:
            client = self._get_client()
            result = client.table("growth_config").select("key, value").execute()
            self._cache = {}
            for row in (result.data or []):
                self._cache[row["key"]] = row["value"]
            self._cache_ts = time.time()
        except Exception as e:
            logger.error(f"Failed to refresh growth config cache: {e}")

    def get_config(self, key: str, default: Any = None) -> Any:
        """Get a config value by key. Returns parsed JSON value."""
        if not self._is_cache_valid():
            self._refresh_cache()
        raw = self._cache.get(key)
        if raw is None:
            return default
        # Values are stored as JSONB, so they come back as native Python types
        # But simple values like 'true' or '5' may be strings
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except (json.JSONDecodeError, ValueError):
                return raw
        return raw

    def get_int(self, key: str, default: int = 0) -> int:
        """Get a config value as an integer."""
        val = self.get_config(key, default)
        try:
            return int(val)
        except (TypeError, ValueError):
            return default

    def get_bool(self, key: str, default: bool = True) -> bool:
        """Get a config value as a boolean."""
        val = self.get_config(key, default)
        if isinstance(val, bool):
            return val
        if isinstance(val, str):
            return val.lower() in ("true", "1", "yes")
        return bool(val)

    def get_all_configs(self) -> Dict[str, Any]:
        """Get all config key-value pairs."""
        if not self._is_cache_valid():
            self._refresh_cache()
        result = {}
        for k, v in self._cache.items():
            if isinstance(v, str):
                try:
                    result[k] = json.loads(v)
                except (json.JSONDecodeError, ValueError):
                    result[k] = v
            else:
                result[k] = v
        return result

    def update_config(self, key: str, value: Any, admin_id: Optional[str] = None) -> bool:
        """Update a config value. Invalidates cache."""
        try:
            client = self._get_client()
            # Store as JSON string for consistency
            json_value = json.dumps(value) if not isinstance(value, str) else value
            client.table("growth_config").upsert({
                "key": key,
                "value": json_value,
                "updated_by": admin_id,
            }, on_conflict="key").execute()
            # Invalidate cache
            self._cache_ts = 0
            logger.info(f"Growth config updated: {key} = {json_value} (by {admin_id})")
            return True
        except Exception as e:
            logger.error(f"Failed to update growth config {key}: {e}")
            return False

    def get_configs_with_metadata(self) -> List[Dict[str, Any]]:
        """Get all configs with descriptions and update info."""
        try:
            client = self._get_client()
            result = client.table("growth_config").select("*").order("key").execute()
            rows = []
            for row in (result.data or []):
                val = row.get("value")
                if isinstance(val, str):
                    try:
                        val = json.loads(val)
                    except (json.JSONDecodeError, ValueError):
                        pass
                rows.append({
                    "key": row["key"],
                    "value": val,
                    "description": row.get("description", ""),
                    "updated_by": row.get("updated_by"),
                    "updated_at": row.get("updated_at"),
                })
            return rows
        except Exception as e:
            logger.error(f"Failed to get growth configs with metadata: {e}")
            return []


# ---------------------------------------------------------------------------
# Singleton
# ---------------------------------------------------------------------------
_growth_config: Optional[GrowthConfigService] = None


def get_growth_config() -> GrowthConfigService:
    global _growth_config
    if _growth_config is None:
        _growth_config = GrowthConfigService()
    return _growth_config
