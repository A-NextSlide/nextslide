from models.requests import RegistryUpdateRequest
from models.registry import ComponentRegistry
import os
import json
import logging
import time

logger = logging.getLogger(__name__)

# Track last registry update to avoid duplicate logging
_last_registry_update = 0
_registry_update_count = 0

# Check if we should be quiet about registry updates
QUIET_REGISTRY = os.environ.get("QUIET_REGISTRY", "true").lower() == "true"

async def api_registry(request: RegistryUpdateRequest):
    """
    Receive and store registry data from the frontend
    """
    global _last_registry_update, _registry_update_count

    # Check if this is a duplicate update within 5 seconds
    current_time = time.time()
    is_duplicate = (current_time - _last_registry_update) < 5
    _last_registry_update = current_time
    _registry_update_count += 1

    # Only log verbosely if not quiet mode and not a duplicate
    should_log = not QUIET_REGISTRY and (not is_duplicate or _registry_update_count <= 2)

    if should_log:
        logger.info(f"Registry update from {request.source}: {len(request.schemas or {})} schemas")
    elif _registry_update_count == 1:
        schema_count = len(request.schemas) if request.schemas else 0
        logger.info(f"Registry initialized from {request.source} ({schema_count} schemas)")

    if request.schemas:
        schemas_dir = os.path.join(os.path.dirname(__file__), '../../schemas')
        os.makedirs(schemas_dir, exist_ok=True)

        with open(os.path.join(schemas_dir, 'typebox_schemas_latest.json'), 'w') as f:
            json.dump(request.schemas, f, indent=2)

    # Create registry with TypeBox schemas if available
    return ComponentRegistry(
        request.schemas
    )

 
