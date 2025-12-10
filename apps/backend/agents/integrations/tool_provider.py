"""
Dynamic tool provider for integrations.

Provides tools to the AI agent based on user's connected integrations.
Tools are injected at runtime based on what the user has access to.
"""

from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Callable
from dataclasses import dataclass

from services.nango_service import get_nango_service, SUPPORTED_INTEGRATIONS
from services.supabase import get_supabase_client
from agents.integrations.tools import (
    BaseIntegrationTool,
    IntegrationToolResult,
    create_tool,
    get_apollo_tools,
    TOOL_CLASSES
)

logger = logging.getLogger(__name__)


@dataclass
class UserConnection:
    """A user's connection to an integration"""
    provider: str
    connection_id: str
    status: str
    capabilities: List[str]


class IntegrationToolProvider:
    """
    Provides integration tools dynamically based on user's connections.

    Usage:
        provider = IntegrationToolProvider(user_id="...")
        tools = provider.get_tools()  # Returns Claude-compatible tool definitions
        result = provider.execute_tool("linkedin_lookup", {...})  # Execute a tool
    """

    def __init__(self, user_id: str):
        self.user_id = user_id
        self._connections: Optional[List[UserConnection]] = None
        self._tools: Optional[Dict[str, BaseIntegrationTool]] = None

    def _load_connections(self) -> List[UserConnection]:
        """Load user's active connections from database"""
        if self._connections is not None:
            return self._connections

        try:
            supabase = get_supabase_client()
            result = supabase.table("user_integrations") \
                .select("provider, connection_id, status") \
                .eq("user_id", self.user_id) \
                .eq("status", "active") \
                .execute()

            self._connections = []
            for row in result.data or []:
                # Get capabilities from config
                config = SUPPORTED_INTEGRATIONS.get(row["provider"])
                capabilities = config.capabilities if config else []

                self._connections.append(UserConnection(
                    provider=row["provider"],
                    connection_id=row["connection_id"],
                    status=row["status"],
                    capabilities=capabilities
                ))

            return self._connections
        except Exception as e:
            logger.error(f"Failed to load connections: {e}")
            return []

    def _build_tools(self) -> Dict[str, Any]:
        """Build tool instances for each connection + always-available tools"""
        if self._tools is not None:
            return self._tools

        self._tools = {}

        # 1. Add Apollo tools (always available - no user OAuth needed)
        for apollo_tool in get_apollo_tools():
            instance = apollo_tool["instance"]
            self._tools[instance.name] = instance

        # 2. Add user's OAuth-connected tools via Nango
        connections = self._load_connections()
        for conn in connections:
            tool = create_tool(conn.provider, conn.connection_id, self.user_id)
            if tool:
                self._tools[tool.name] = tool

        return self._tools

    def get_tools(self) -> List[Dict[str, Any]]:
        """
        Get Claude-compatible tool definitions for all connected integrations.

        Returns:
            List of tool definitions in Claude's expected format
        """
        tools = self._build_tools()
        return [tool.get_tool_definition() for tool in tools.values()]

    def get_tool_names(self) -> List[str]:
        """Get names of all available tools"""
        tools = self._build_tools()
        return list(tools.keys())

    def has_tool(self, tool_name: str) -> bool:
        """Check if a tool is available"""
        tools = self._build_tools()
        return tool_name in tools

    def execute_tool(self, tool_name: str, **kwargs) -> IntegrationToolResult:
        """
        Execute a tool by name with given parameters.

        Args:
            tool_name: Name of the tool to execute
            **kwargs: Parameters for the tool

        Returns:
            IntegrationToolResult with success status and data/error
        """
        tools = self._build_tools()
        tool = tools.get(tool_name)

        if not tool:
            return IntegrationToolResult(
                success=False,
                error=f"Tool '{tool_name}' not available. User may need to connect the integration."
            )

        try:
            # Get provider (Apollo tools don't have .provider attribute)
            provider = getattr(tool, 'provider', tool_name.split('_')[0])

            # Log usage
            self._log_usage(tool_name, provider)

            # Execute
            return tool.execute(**kwargs)
        except Exception as e:
            logger.error(f"Tool execution failed: {e}")
            return IntegrationToolResult(success=False, error=str(e))

    def _log_usage(self, tool_name: str, provider: str):
        """Log tool usage for analytics"""
        try:
            supabase = get_supabase_client()
            supabase.table("integration_usage_logs").insert({
                "user_id": self.user_id,
                "provider": provider,
                "action": tool_name,
                "success": True
            }).execute()

            # Update last_used_at
            supabase.table("user_integrations") \
                .update({"last_used_at": "now()"}) \
                .eq("user_id", self.user_id) \
                .eq("provider", provider) \
                .execute()
        except Exception as e:
            logger.warning(f"Failed to log usage: {e}")

    def get_connected_providers(self) -> List[str]:
        """Get list of connected provider names"""
        connections = self._load_connections()
        return [c.provider for c in connections]

    def get_capabilities(self) -> Dict[str, List[str]]:
        """Get capabilities by provider"""
        connections = self._load_connections()
        return {c.provider: c.capabilities for c in connections}

    def refresh(self):
        """Clear cache and reload connections"""
        self._connections = None
        self._tools = None


def get_integration_tools(user_id: str) -> List[Dict[str, Any]]:
    """
    Convenience function to get integration tools for a user.

    Args:
        user_id: The user's ID

    Returns:
        List of Claude-compatible tool definitions
    """
    provider = IntegrationToolProvider(user_id)
    return provider.get_tools()


def get_integration_context(user_id: str) -> str:
    """
    Get a context string describing user's available integrations.
    This can be added to the system prompt to inform the AI what's available.

    Args:
        user_id: The user's ID

    Returns:
        A string describing available integrations and their capabilities
    """
    lines = []

    # Apollo tools (always available)
    apollo_tools = get_apollo_tools()
    if apollo_tools:
        lines.append("You have access to the following business intelligence tools:")
        lines.append("- apollo_company_lookup: Look up company information (industry, size, description, LinkedIn) by domain or name")
        lines.append("- apollo_person_lookup: Look up professional profiles (requires paid plan for full access)")
        lines.append("")

    # User's OAuth-connected integrations
    provider = IntegrationToolProvider(user_id)
    connections = provider._load_connections()

    if connections:
        lines.append("The user has connected the following integrations:")
        for conn in connections:
            config = SUPPORTED_INTEGRATIONS.get(conn.provider)
            if config:
                caps = ", ".join(conn.capabilities[:3])
                lines.append(f"- {config.name}: {caps}")
        lines.append("")

    if lines:
        lines.append("Use these tools to fetch real data when creating personalized content.")
        lines.append("When the user mentions a company name, LinkedIn profile, or domain, use the appropriate tool to enrich the content.")

    return "\n".join(lines)
