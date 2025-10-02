"""
Application services and event handling.
"""

from agents.application.event_bus import EventBus, get_event_bus, Events

# Agent-streaming event type constants (for UI streaming of reasoning/tool steps)
AGENT_EVENT = "agent_event"
TOOL_CALL_EVENT = "tool_call"
TOOL_RESULT_EVENT = "tool_result"
ARTIFACT_EVENT = "artifact"

__all__ = ['EventBus', 'get_event_bus', 'Events', 'AGENT_EVENT', 'TOOL_CALL_EVENT', 'TOOL_RESULT_EVENT', 'ARTIFACT_EVENT']