"""Shared helpers for safely reading dicts or Pydantic models."""

from typing import Any


def get_attr(obj: Any, key: str, default: Any = None) -> Any:
    """Safely get attribute from dict or Pydantic model."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)
