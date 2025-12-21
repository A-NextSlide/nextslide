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
    sequence: Optional[int] = None

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
        if self.sequence is not None:
            event["sequence"] = self.sequence
        return event


def envelope_event(raw: Dict[str, Any]) -> Dict[str, Any]:
    """Ensure payloads include a structured event envelope without breaking compatibility."""
    timestamp = raw.get("timestamp") or datetime.now(timezone.utc).isoformat()

    meta_keys = {"type", "timestamp", "progress", "phase", "event"}
    deck_uuid = raw.get("deck_uuid") or raw.get("deck_id") or raw.get("deckId")
    slide_index = raw.get("slide_index")
    if slide_index is None:
        slide_index = raw.get("slideIndex")
    payload = raw.get("data")
    if payload is None:
        payload = {k: v for k, v in raw.items() if k not in meta_keys}
    if isinstance(payload, dict):
        payload = dict(payload)
        if raw.get("progress") is not None and "progress" not in payload:
            payload["progress"] = raw.get("progress")
        if raw.get("phase") and "phase" not in payload:
            payload["phase"] = raw.get("phase")
        if deck_uuid and "deck_uuid" not in payload:
            payload["deck_uuid"] = deck_uuid
        if slide_index is not None and "slide_index" not in payload:
            payload["slide_index"] = slide_index

    event = DeckEvent(
        schema=SCHEMA_VERSION,
        type=str(raw.get("type", "message")),
        timestamp=timestamp,
        payload=payload if isinstance(payload, dict) else {"value": payload},
        progress=raw.get("progress"),
        phase=raw.get("phase"),
        deck_uuid=deck_uuid,
        slide_index=slide_index,
        sequence=raw.get("sequence"),
    )

    raw_with_ts = dict(raw)
    raw_with_ts["timestamp"] = timestamp
    raw_with_ts.setdefault("data", event.payload)
    raw_with_ts.setdefault("schema", SCHEMA_VERSION)
    if deck_uuid:
        raw_with_ts.setdefault("deck_uuid", deck_uuid)
        raw_with_ts.setdefault("deck_id", deck_uuid)
    if slide_index is not None:
        raw_with_ts.setdefault("slide_index", slide_index)
    raw_with_ts["event"] = event.to_dict()
    return raw_with_ts


def sse_encode(event: Dict[str, Any]) -> bytes:
    """Serialize an event dict into SSE bytes with a structured envelope."""
    payload = envelope_event(event)
    return f"data: {json.dumps(payload)}\n\n".encode("utf-8")
