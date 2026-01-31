"""
Rate Limiter for Public Developer API v1

Uses slowapi (wraps the `limits` library) for per-API-key rate limiting.
Falls back to in-memory storage; uses Redis when REDIS_URL is set.
"""

import hashlib
import logging
import os
from typing import Optional

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from config.rate_limits import API_RATE_LIMIT

logger = logging.getLogger(__name__)


def _api_key_identifier(request: Request) -> str:
    """
    Extract the API key from the X-API-Key header and hash it for
    use as the rate-limit key.  Falls back to remote address for
    non-API requests so the limiter never gets a None key.
    """
    api_key = request.headers.get("x-api-key") or request.headers.get("X-API-Key")
    if api_key:
        return hashlib.sha256(api_key.encode()).hexdigest()[:16]
    return get_remote_address(request)


def _build_storage_uri() -> Optional[str]:
    """Return Redis URI if available, else None (in-memory)."""
    redis_url = os.getenv("REDIS_URL")
    if redis_url:
        logger.info("Rate limiter using Redis storage")
        return redis_url
    logger.info("Rate limiter using in-memory storage")
    return None


storage_uri = _build_storage_uri()

# Exposed for startup display
RATE_LIMITER_BACKEND = "redis" if storage_uri else "in-memory"

limiter = Limiter(
    key_func=_api_key_identifier,
    storage_uri=storage_uri or "memory://",
    default_limits=[],
)


def rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> JSONResponse:
    """Custom 429 handler with standard Retry-After header."""
    retry_after = exc.detail.split("per")[-1].strip() if "per" in str(exc.detail) else "60"
    # Extract the numeric window from the limit string (e.g. "60 per 1 minute")
    retry_after_seconds = "60"
    response = JSONResponse(
        status_code=429,
        content={
            "error": "rate_limit_exceeded",
            "message": f"Rate limit exceeded: {API_RATE_LIMIT}. Please slow down.",
            "retry_after_seconds": int(retry_after_seconds),
        },
    )
    response.headers["Retry-After"] = retry_after_seconds
    return response
