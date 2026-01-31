"""
Redis / arq Queue Service for Developer API v1

Enqueues deck generation jobs into Redis via arq.
Falls back to FastAPI BackgroundTasks when REDIS_URL is not configured.
"""

import asyncio
import logging
import os
from typing import Any, Dict, Optional

logger = logging.getLogger(__name__)

# Lazy-loaded Redis pool (guarded by _redis_lock to avoid race conditions — Fix 10)
_redis_pool = None
_redis_available: Optional[bool] = None
_redis_lock = asyncio.Lock()


async def _get_redis_pool():
    """Get or create the arq Redis connection pool (thread-safe)."""
    global _redis_pool, _redis_available

    if _redis_available is False:
        return None

    if _redis_pool is not None:
        return _redis_pool

    async with _redis_lock:
        # Double-check after acquiring lock
        if _redis_available is False:
            return None
        if _redis_pool is not None:
            return _redis_pool

        redis_url = os.getenv("REDIS_URL")
        if not redis_url:
            _redis_available = False
            logger.info("REDIS_URL not set — queue service will use in-process background tasks")
            return None

        try:
            from arq.connections import create_pool
            from utils.redis_utils import parse_redis_settings

            settings = parse_redis_settings()
            _redis_pool = await create_pool(settings)
            _redis_available = True
            logger.info("arq Redis pool created successfully")
            return _redis_pool
        except Exception as e:
            logger.warning(f"Failed to connect to Redis — falling back to background tasks: {e}")
            _redis_available = False
            return None


def is_queue_available() -> bool:
    """Check if Redis queue is configured (without connecting)."""
    return bool(os.getenv("REDIS_URL"))


async def enqueue_deck_generation(
    deck_uuid: str,
    user_id: str,
    api_key_id: str,
    api_key_record_dict: Dict[str, Any],
    topic: str,
    num_slides: int,
    style: Optional[str],
    additional_instructions: Optional[str],
    view_url: str,
    edit_url: Optional[str],
    metadata: Optional[Dict[str, Any]],
) -> bool:
    """
    Enqueue a deck generation job.

    Returns True if the job was enqueued via Redis, False if caller
    should fall back to BackgroundTasks.
    """
    pool = await _get_redis_pool()
    if pool is None:
        return False

    try:
        job = await pool.enqueue_job(
            "generate_deck_job",
            deck_uuid=deck_uuid,
            user_id=user_id,
            api_key_id=api_key_id,
            api_key_record_dict=api_key_record_dict,
            topic=topic,
            num_slides=num_slides,
            style=style,
            additional_instructions=additional_instructions,
            view_url=view_url,
            edit_url=edit_url,
            metadata=metadata,
            _job_id=f"deck:{deck_uuid}",
        )
        logger.info(f"Enqueued deck generation job for {deck_uuid} (job_id={job.job_id})")
        return True
    except Exception as e:
        logger.error(f"Failed to enqueue job for {deck_uuid}: {e}")
        return False


async def close_pool():
    """Gracefully close the Redis pool on shutdown."""
    global _redis_pool
    if _redis_pool is not None:
        try:
            await _redis_pool.close()
        except Exception:
            pass
        _redis_pool = None
