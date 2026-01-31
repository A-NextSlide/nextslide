"""
Shared Redis URL parsing utilities.

Used by both the arq worker and the API queue service to avoid
duplicating the URL → RedisSettings conversion logic.
"""

import os
from urllib.parse import urlparse


def parse_redis_settings():
    """
    Parse REDIS_URL into an arq ``RedisSettings`` instance.

    Returns ``None`` when REDIS_URL is not set.
    """
    from arq.connections import RedisSettings

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379")
    parsed = urlparse(redis_url)
    return RedisSettings(
        host=parsed.hostname or "localhost",
        port=parsed.port or 6379,
        password=parsed.password,
        database=int(parsed.path.lstrip("/") or 0) if parsed.path else 0,
        ssl=parsed.scheme == "rediss",
    )
