"""
arq Worker Entry Point

Standalone worker process that dequeues and runs deck generation jobs.
Start with:  arq worker.WorkerSettings
"""

import logging
import os
import sys
from typing import Any, Dict, Optional
from arq.cron import cron

# Ensure the backend package is on the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from dotenv import load_dotenv
load_dotenv(override=True)

from setup_logging_optimized import setup_logging
setup_logging()

logger = logging.getLogger(__name__)


async def generate_deck_job(
    ctx: dict,
    *,
    deck_uuid: str,
    user_id: str,
    api_key_id: str,
    api_key_record_dict: Dict[str, Any],
    topic: str,
    num_slides: int,
    style: Optional[str],
    additional_instructions: Optional[str],
    slide_mode: str,
    view_url: str,
    edit_url: Optional[str],
    requested_outputs: Optional[Dict[str, Any]],
    metadata: Optional[Dict[str, Any]],
):
    """
    Worker function that runs generate_deck_background.

    Reconstructs the ApiKeyRecord from a plain dict so the existing
    generation code works unchanged.

    NOTE: imports _compose_deck_stream_local directly to prevent the
    worker from re-dispatching to Modal (Fix 5).
    """
    from services.api_key_service import ApiKeyRecord
    from api.requests.api_public_v1 import generate_deck_background

    # Reconstruct dataclass from serialised dict
    api_key_record = ApiKeyRecord(**api_key_record_dict)

    logger.info(f"[worker] Starting deck generation for {deck_uuid}")
    await generate_deck_background(
        deck_uuid=deck_uuid,
        user_id=user_id,
        api_key_record=api_key_record,
        topic=topic,
        num_slides=num_slides,
        style=style,
        additional_instructions=additional_instructions,
        slide_mode=slide_mode,
        view_url=view_url,
        edit_url=edit_url,
        requested_outputs=requested_outputs,
        metadata=metadata,
    )
    logger.info(f"[worker] Finished deck generation for {deck_uuid}")


async def process_email_campaigns(ctx: dict):
    """Check for scheduled email campaigns that are due and execute them."""
    from services.email_campaign_service import check_and_execute_scheduled_campaigns
    logger.info("[worker] Checking for scheduled email campaigns")
    await check_and_execute_scheduled_campaigns()


async def startup(ctx: dict):
    """Called once when the worker boots."""
    logger.info("[worker] arq worker starting up")

    # Force local execution — the worker IS the offloaded process (Fix 5)
    os.environ["USE_MODAL"] = "false"

    # Load registry so generation code can use it
    from models.registry import ComponentRegistry, set_global_registry
    import json

    schemas_path = os.environ.get("SCHEMAS_PATH")
    if not schemas_path:
        schemas_path = os.path.join(os.path.dirname(__file__), "schemas/typebox_schemas_latest.json")

    if os.path.exists(schemas_path):
        with open(schemas_path, "r") as f:
            schemas = json.load(f)
        registry = ComponentRegistry(schemas)
        set_global_registry(registry)
        logger.info(f"[worker] Registry loaded ({len(schemas)} schemas)")


async def shutdown(ctx: dict):
    """Called when the worker shuts down."""
    logger.info("[worker] arq worker shutting down")


def _redis_settings():
    """Build RedisSettings from REDIS_URL (delegates to shared util)."""
    from utils.redis_utils import parse_redis_settings
    return parse_redis_settings()


class WorkerSettings:
    """arq worker configuration."""

    functions = [generate_deck_job]
    cron_jobs = [
        # Check for due email campaigns every 5 minutes
        cron(process_email_campaigns, minute={0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55}),
    ]
    on_startup = startup
    on_shutdown = shutdown
    redis_settings = _redis_settings()
    max_jobs = 3               # Max concurrent generations
    job_timeout = 600          # 10 minute timeout per job
    max_tries = 2              # 1 retry on failure
    retry_defer = 30           # 30s delay before retry
    health_check_interval = 30
