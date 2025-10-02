import asyncio
from typing import Dict, Any, Optional


class AgentStreamBus:
    """Lightweight per-session async event bus for WS/SSE broadcasting."""

    def __init__(self) -> None:
        self._session_queues: Dict[str, asyncio.Queue] = {}

    def _get_or_create_queue(self, session_id: str) -> asyncio.Queue:
        if session_id not in self._session_queues:
            self._session_queues[session_id] = asyncio.Queue(maxsize=1000)
        return self._session_queues[session_id]

    async def publish(self, session_id: str, event: Dict[str, Any]) -> None:
        queue = self._get_or_create_queue(session_id)
        try:
            await queue.put(event)
            try:
                import logging
                logging.getLogger(__name__).info(
                    "[AgentStreamBus] published type=%s session=%s keys=%s",
                    (event or {}).get("type"),
                    session_id,
                    list((event or {}).keys()),
                )
            except Exception:
                pass
        except asyncio.CancelledError:
            raise
        except Exception:
            # Best-effort: if queue is full, drop oldest
            try:
                _ = queue.get_nowait()
            except Exception:
                pass
            await queue.put(event)

    def subscribe(self, session_id: str) -> asyncio.Queue:
        return self._get_or_create_queue(session_id)


# Global singleton
agent_stream_bus = AgentStreamBus()


