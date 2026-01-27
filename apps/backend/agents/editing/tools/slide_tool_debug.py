"""Debug logging helpers for slide tools."""

import os
from typing import Any, Dict

# Debug mode - set to True to save debug logs
DEBUG_SAVE_FILES = os.environ.get("DEBUG_SLIDE_EDIT", "").lower() == "true"


def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
    """Debug logger - only writes if DEBUG_SLIDE_EDIT env var is enabled."""
    if not DEBUG_SAVE_FILES:
        return
    try:
        import json
        import time

        payload = {
            "sessionId": "debug-session",
            "runId": runId,
            "hypothesisId": hypothesisId,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open("/tmp/slide_tools_debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
