from models.requests import RegistryUpdateRequest
from models.registry import ComponentRegistry
import os
import json
import time

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
    
    # Only log if not quiet mode and not a duplicate
    should_log = not QUIET_REGISTRY and (not is_duplicate or _registry_update_count <= 2)
    
    if should_log:
        print("\n===== REGISTRY DATA RECEIVED =====")
        print(f"Source: {request.source}")
        
        if request.schemas:
            print(f"Received {len(request.schemas)} TypeBox schemas")
            # Format info about received schemas
            for schema_type, schema_data in request.schemas.items():
                print(f"  - {schema_type}: {schema_data.get('name', 'Unnamed')} ({schema_data.get('category', 'uncategorized')})")
    elif not QUIET_REGISTRY and _registry_update_count % 10 == 0:
        # Log every 10th duplicate to show it's still working
        print(f"[Registry] Received duplicate update #{_registry_update_count} from {request.source}")
    elif _registry_update_count == 1 and QUIET_REGISTRY:
        # In quiet mode, just log once that registry was received
        print(f"✅ Registry initialized from {request.source}")
        
    if request.schemas:
        schemas_dir = os.path.join(os.path.dirname(__file__), '../../schemas')
        os.makedirs(schemas_dir, exist_ok=True)
        
        if should_log:
            print(f"Writing schemas to {schemas_dir}")
            
        with open(os.path.join(schemas_dir, 'typebox_schemas_latest.json'), 'w') as f:
            json.dump(request.schemas, f, indent=2)

    # Create registry with TypeBox schemas if available
    return ComponentRegistry(
        request.schemas
    )

 
