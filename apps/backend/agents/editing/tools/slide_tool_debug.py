"""Debug logging helpers for slide tools."""

from typing import Any, Dict


def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
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
        with open("/Users/ahmed/Documents/Dev/nextslide/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
