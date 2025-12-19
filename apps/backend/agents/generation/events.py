"""Structured event schema for deck generation SSE payloads."""

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import json

SCHEMA_VERSION = "deck_generation.v1"


@dataclass
class DeckEvent:
    """Structured event envelope for SSE."""

    schema: str
    type: str
    timestamp: str
    payload: Dict[str, Any]
    progress: Optional[float] = None
    phase: Optional[str] = None
    deck_uuid: Optional[str] = None
    slide_index: Optional[int] = None

    def to_dict(self) -> Dict[str, Any]:
        event: Dict[str, Any] = {
            "schema": self.schema,
            "type": self.type,
            "timestamp": self.timestamp,
            "payload": self.payload,
            "data": self.payload,
        }
        if self.progress is not None:
            event["progress"] = self.progress
        if self.phase:
            event["phase"] = self.phase
        if self.deck_uuid:
            event["deck_uuid"] = self.deck_uuid
        if self.slide_index is not None:
            event["slide_index"] = self.slide_index
        return event


def envelope_event(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure payloads include a structured event envelope without breaking compatibility."""
    timestamp = raw.get("timestamp") or datetime.now(timezone.utc).isoformat()

    meta_keys = {"type", "timestamp", "progress", "phase", "event"}
    payload = raw.get("data")
    if payload is None:
        payload = {k: v for k, v in raw.items() if k not in meta_keys}

    event = DeckEvent(
        schema=SCHEMA_VERSION,
        type=str(raw.get("type", "message")),
        timestamp=timestamp,
        payload=payload if isinstance(payload, dict) else {"value": payload},
        progress=raw.get("progress"),
        phase=raw.get("phase"),
        deck_uuid=raw.get("deck_uuid"),
        slide_index=raw.get("slide_index"),
    )

    raw_with_ts = dict(raw)
    raw_with_ts["timestamp"] = timestamp
    raw_with_ts.setdefault("data", event.payload)
    raw_with_ts["event"] = event.to_dict()
    return raw_with_ts


def sse_encode(event: Dict[str, Any]) -> bytes:
    """Serialize an event dict into SSE bytes with a structured envelope."""
    payload = envelope_event(event)
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")
