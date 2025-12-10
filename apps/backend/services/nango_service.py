"""
Nango Integration Service

Unified integration platform for connecting to 500+ external APIs.
Handles OAuth, token management, and proxied API requests.

Docs: https://docs.nango.dev
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from dataclasses import dataclass
from enum import Enum

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class IntegrationCategory(str, Enum):
    """Categories of available integrations"""
    CRM = "crm"
    SOCIAL = "social"
    EMAIL = "email"
    CALENDAR = "calendar"
    STORAGE = "storage"
    DOCS = "docs"
    COMMUNICATION = "communication"
    PROJECT = "project"
    DEV_TOOLS = "dev_tools"
    HR = "hr"
    ACCOUNTING = "accounting"
    MARKETING = "marketing"
    SUPPORT = "support"
    ANALYTICS = "analytics"
    VIDEO = "video"


@dataclass
class IntegrationConfig:
    """Configuration for a supported integration"""
    id: str
    name: str
    category: IntegrationCategory
    icon: str
    description: str
    scopes: List[str]
    capabilities: List[str]


# Pre-configured integrations with their capabilities
SUPPORTED_INTEGRATIONS: Dict[str, IntegrationConfig] = {
    # CRM
    "salesforce": IntegrationConfig(
        id="salesforce",
        name="Salesforce",
        category=IntegrationCategory.CRM,
        icon="salesforce",
        description="Access contacts, deals, accounts, and activities",
        scopes=["api", "refresh_token"],
        capabilities=["contacts", "deals", "accounts", "activities", "search"]
    ),
    "hubspot": IntegrationConfig(
        id="hubspot",
        name="HubSpot",
        category=IntegrationCategory.CRM,
        icon="hubspot",
        description="Access contacts, companies, deals, and engagements",
        scopes=["crm.objects.contacts.read", "crm.objects.companies.read", "crm.objects.deals.read"],
        capabilities=["contacts", "companies", "deals", "engagements", "search"]
    ),
    "pipedrive": IntegrationConfig(
        id="pipedrive",
        name="Pipedrive",
        category=IntegrationCategory.CRM,
        icon="pipedrive",
        description="Access deals, contacts, and organizations",
        scopes=["deals:read", "persons:read", "organizations:read"],
        capabilities=["deals", "contacts", "organizations", "activities"]
    ),

    # Social
    "linkedin": IntegrationConfig(
        id="linkedin",
        name="LinkedIn",
        category=IntegrationCategory.SOCIAL,
        icon="linkedin",
        description="Look up profiles, companies, and connections",
        scopes=["r_liteprofile", "r_emailaddress"],
        capabilities=["profile_lookup", "company_info", "connections"]
    ),
    "twitter": IntegrationConfig(
        id="twitter",
        name="X (Twitter)",
        category=IntegrationCategory.SOCIAL,
        icon="twitter",
        description="Access tweets, profiles, and trends",
        scopes=["tweet.read", "users.read"],
        capabilities=["tweets", "profiles", "search", "trends"]
    ),

    # Email
    "gmail": IntegrationConfig(
        id="google-mail",
        name="Gmail",
        category=IntegrationCategory.EMAIL,
        icon="gmail",
        description="Search and read emails, threads, and attachments",
        scopes=["https://www.googleapis.com/auth/gmail.readonly"],
        capabilities=["search", "read_emails", "threads", "attachments"]
    ),
    "outlook": IntegrationConfig(
        id="microsoft-outlook",
        name="Outlook",
        category=IntegrationCategory.EMAIL,
        icon="outlook",
        description="Search and read emails and calendar",
        scopes=["Mail.Read", "Calendars.Read"],
        capabilities=["search", "read_emails", "calendar", "contacts"]
    ),

    # Calendar
    "google-calendar": IntegrationConfig(
        id="google-calendar",
        name="Google Calendar",
        category=IntegrationCategory.CALENDAR,
        icon="google-calendar",
        description="Access events, attendees, and availability",
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        capabilities=["events", "attendees", "availability"]
    ),

    # Storage
    "google-drive": IntegrationConfig(
        id="google-drive",
        name="Google Drive",
        category=IntegrationCategory.STORAGE,
        icon="google-drive",
        description="Access files, docs, sheets, and folders",
        scopes=["https://www.googleapis.com/auth/drive.readonly"],
        capabilities=["files", "docs", "sheets", "search", "export"]
    ),
    "dropbox": IntegrationConfig(
        id="dropbox",
        name="Dropbox",
        category=IntegrationCategory.STORAGE,
        icon="dropbox",
        description="Access files and folders",
        scopes=["files.metadata.read", "files.content.read"],
        capabilities=["files", "folders", "search", "download"]
    ),
    "onedrive": IntegrationConfig(
        id="microsoft-onedrive",
        name="OneDrive",
        category=IntegrationCategory.STORAGE,
        icon="onedrive",
        description="Access files and Office documents",
        scopes=["Files.Read"],
        capabilities=["files", "search", "download"]
    ),

    # Docs
    "notion": IntegrationConfig(
        id="notion",
        name="Notion",
        category=IntegrationCategory.DOCS,
        icon="notion",
        description="Access pages, databases, and content",
        scopes=["read_content"],
        capabilities=["pages", "databases", "search", "blocks"]
    ),
    "confluence": IntegrationConfig(
        id="confluence",
        name="Confluence",
        category=IntegrationCategory.DOCS,
        icon="confluence",
        description="Access pages and spaces",
        scopes=["read:confluence-content.all"],
        capabilities=["pages", "spaces", "search"]
    ),

    # Communication
    "slack": IntegrationConfig(
        id="slack",
        name="Slack",
        category=IntegrationCategory.COMMUNICATION,
        icon="slack",
        description="Search messages and access channels",
        scopes=["channels:read", "search:read"],
        capabilities=["messages", "channels", "search", "files"]
    ),
    "discord": IntegrationConfig(
        id="discord",
        name="Discord",
        category=IntegrationCategory.COMMUNICATION,
        icon="discord",
        description="Access servers and messages",
        scopes=["identify", "guilds"],
        capabilities=["servers", "channels", "messages"]
    ),
    "teams": IntegrationConfig(
        id="microsoft-teams",
        name="Microsoft Teams",
        category=IntegrationCategory.COMMUNICATION,
        icon="teams",
        description="Access chats, channels, and meetings",
        scopes=["Chat.Read", "Channel.ReadBasic.All"],
        capabilities=["chats", "channels", "messages", "meetings"]
    ),

    # Project Management
    "asana": IntegrationConfig(
        id="asana",
        name="Asana",
        category=IntegrationCategory.PROJECT,
        icon="asana",
        description="Access tasks, projects, and workspaces",
        scopes=["default"],
        capabilities=["tasks", "projects", "workspaces", "search"]
    ),
    "linear": IntegrationConfig(
        id="linear",
        name="Linear",
        category=IntegrationCategory.PROJECT,
        icon="linear",
        description="Access issues, projects, and cycles",
        scopes=["read"],
        capabilities=["issues", "projects", "cycles", "search"]
    ),
    "jira": IntegrationConfig(
        id="jira",
        name="Jira",
        category=IntegrationCategory.PROJECT,
        icon="jira",
        description="Access issues, projects, and sprints",
        scopes=["read:jira-work"],
        capabilities=["issues", "projects", "sprints", "search"]
    ),
    "trello": IntegrationConfig(
        id="trello",
        name="Trello",
        category=IntegrationCategory.PROJECT,
        icon="trello",
        description="Access boards, cards, and lists",
        scopes=["read"],
        capabilities=["boards", "cards", "lists"]
    ),

    # Dev Tools
    "github": IntegrationConfig(
        id="github",
        name="GitHub",
        category=IntegrationCategory.DEV_TOOLS,
        icon="github",
        description="Access repos, issues, and PRs",
        scopes=["repo", "read:user"],
        capabilities=["repos", "issues", "pull_requests", "search"]
    ),
    "figma": IntegrationConfig(
        id="figma",
        name="Figma",
        category=IntegrationCategory.DEV_TOOLS,
        icon="figma",
        description="Access designs and export assets",
        scopes=["file_read"],
        capabilities=["files", "images", "export"]
    ),

    # Analytics
    "google-analytics": IntegrationConfig(
        id="google-analytics",
        name="Google Analytics",
        category=IntegrationCategory.ANALYTICS,
        icon="google-analytics",
        description="Access website analytics and metrics",
        scopes=["https://www.googleapis.com/auth/analytics.readonly"],
        capabilities=["reports", "metrics", "dimensions"]
    ),

    # Video
    "zoom": IntegrationConfig(
        id="zoom",
        name="Zoom",
        category=IntegrationCategory.VIDEO,
        icon="zoom",
        description="Access meetings and recordings",
        scopes=["meeting:read"],
        capabilities=["meetings", "recordings", "participants"]
    ),
    "youtube": IntegrationConfig(
        id="youtube",
        name="YouTube",
        category=IntegrationCategory.VIDEO,
        icon="youtube",
        description="Access videos and channel data",
        scopes=["https://www.googleapis.com/auth/youtube.readonly"],
        capabilities=["videos", "channels", "search"]
    ),
}


class NangoService:
    """Service for managing Nango integrations"""

    def __init__(self):
        # Nango uses a single secret key for backend operations
        # The key format follows: NANGO_SECRET_KEY or NANGO_SECRET_KEY_DEV based on environment
        self.secret_key = (
            os.getenv("NANGO_SECRET_KEY") or
            os.getenv("NANGO_SECRET_KEY_DEV")
        )
        self.base_url = os.getenv("NANGO_BASE_URL", "https://api.nango.dev")
        self._client = None
        self._sdk_available = False

        try:
            from nango import Nango
            self._SDK = Nango
            self._sdk_available = True
        except ImportError:
            self._SDK = None
            logger.warning("Nango SDK not installed. Install with: pip install nango")

    def is_configured(self) -> bool:
        """Check if Nango is properly configured"""
        return bool(self.secret_key)

    def _get_client(self):
        """Get or create Nango client"""
        if not self.is_configured():
            raise ValueError("NANGO_SECRET_KEY not configured")

        if self._sdk_available and self._client is None:
            self._client = self._SDK(secret_key=self.secret_key)

        return self._client

    def _make_request(
        self,
        method: str,
        endpoint: str,
        json_data: Optional[Dict] = None,
        params: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """Make HTTP request to Nango API (fallback when SDK unavailable)"""
        import requests

        headers = {
            "Authorization": f"Bearer {self.secret_key}",
            "Content-Type": "application/json"
        }

        url = f"{self.base_url}{endpoint}"

        response = requests.request(
            method=method,
            url=url,
            headers=headers,
            json=json_data,
            params=params,
            timeout=30
        )
        response.raise_for_status()
        return response.json()

    # ==================
    # Session Management
    # ==================

    def create_connect_session(
        self,
        user_id: str,
        allowed_integrations: Optional[List[str]] = None,
        organization_id: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Create a session token for the Connect UI.

        Args:
            user_id: Your internal user identifier
            allowed_integrations: List of integration IDs to show (None = all)
            organization_id: Optional org/team identifier

        Returns:
            Dict with 'token' for frontend use
        """
        if not self.is_configured():
            raise ValueError("NANGO_SECRET_KEY not configured")

        end_user = {"id": user_id}
        if organization_id:
            end_user["organization_id"] = organization_id

        payload = {"end_user": end_user}
        if allowed_integrations:
            payload["allowed_integrations"] = allowed_integrations

        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.create_connect_session(**payload)
                return {"token": result.token if hasattr(result, 'token') else result.get('token')}
            else:
                result = self._make_request("POST", "/connect/sessions", json_data=payload)
                return {"token": result.get("token")}
        except Exception as e:
            logger.error(f"Failed to create connect session: {e}")
            raise

    # ==================
    # Connection Management
    # ==================

    def list_connections(self, user_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        List all connections, optionally filtered by user.

        Args:
            user_id: Filter by end user ID

        Returns:
            List of connection objects
        """
        if not self.is_configured():
            return []

        try:
            params = {}
            if user_id:
                params["end_user_id"] = user_id

            if self._sdk_available:
                client = self._get_client()
                result = client.list_connections(**params) if params else client.list_connections()
                # Handle both SDK response types
                if hasattr(result, 'connections'):
                    connections = result.connections
                elif isinstance(result, dict):
                    connections = result.get('connections', [])
                else:
                    connections = result if isinstance(result, list) else []

                return [self._normalize_connection(c) for c in connections]
            else:
                result = self._make_request("GET", "/connections", params=params)
                connections = result.get("connections", [])
                return [self._normalize_connection(c) for c in connections]
        except Exception as e:
            logger.error(f"Failed to list connections: {e}")
            return []

    def get_connection(self, provider: str, connection_id: str) -> Optional[Dict[str, Any]]:
        """
        Get a specific connection with credentials.

        Args:
            provider: Integration provider key (e.g., 'linkedin', 'salesforce')
            connection_id: The connection ID

        Returns:
            Connection object with credentials, or None
        """
        if not self.is_configured():
            return None

        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.get_connection(provider, connection_id)
                return self._normalize_connection(result)
            else:
                result = self._make_request(
                    "GET",
                    f"/connection/{connection_id}",
                    params={"provider_config_key": provider}
                )
                return self._normalize_connection(result)
        except Exception as e:
            logger.error(f"Failed to get connection: {e}")
            return None

    def delete_connection(self, provider: str, connection_id: str) -> bool:
        """
        Delete a connection.

        Args:
            provider: Integration provider key
            connection_id: The connection ID

        Returns:
            True if successful
        """
        if not self.is_configured():
            return False

        try:
            if self._sdk_available:
                client = self._get_client()
                client.delete_connection(provider, connection_id)
                return True
            else:
                self._make_request(
                    "DELETE",
                    f"/connection/{connection_id}",
                    params={"provider_config_key": provider}
                )
                return True
        except Exception as e:
            logger.error(f"Failed to delete connection: {e}")
            return False

    def _normalize_connection(self, conn: Any) -> Dict[str, Any]:
        """Normalize connection object to dict"""
        if isinstance(conn, dict):
            return {
                "id": conn.get("id") or conn.get("connection_id"),
                "provider": conn.get("provider") or conn.get("provider_config_key"),
                "created_at": conn.get("created_at") or conn.get("created"),
                "end_user_id": conn.get("end_user_id") or (conn.get("end_user") or {}).get("id"),
                "credentials": conn.get("credentials"),
                "metadata": conn.get("metadata", {})
            }
        else:
            # Handle SDK response object
            return {
                "id": getattr(conn, "id", None) or getattr(conn, "connection_id", None),
                "provider": getattr(conn, "provider", None) or getattr(conn, "provider_config_key", None),
                "created_at": getattr(conn, "created_at", None) or getattr(conn, "created", None),
                "end_user_id": getattr(conn, "end_user_id", None),
                "credentials": getattr(conn, "credentials", None),
                "metadata": getattr(conn, "metadata", {})
            }

    # ==================
    # Proxy Requests
    # ==================

    def proxy(
        self,
        method: str,
        endpoint: str,
        provider: str,
        connection_id: str,
        data: Optional[Dict] = None,
        params: Optional[Dict] = None,
        headers: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Make an authenticated API request through Nango's proxy.
        Nango automatically injects the user's credentials.

        Args:
            method: HTTP method (GET, POST, etc.)
            endpoint: API endpoint path
            provider: Integration provider key
            connection_id: The connection ID
            data: Request body (for POST/PUT)
            params: Query parameters
            headers: Additional headers

        Returns:
            API response data
        """
        if not self.is_configured():
            raise ValueError("NANGO_SECRET_KEY not configured")

        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.proxy(
                    method=method,
                    endpoint=endpoint,
                    provider_config_key=provider,
                    connection_id=connection_id,
                    data=data,
                    params=params,
                    headers=headers
                )
                return result.json() if hasattr(result, 'json') else result
            else:
                # Build proxy request manually
                import requests

                proxy_headers = {
                    "Authorization": f"Bearer {self.secret_key}",
                    "Connection-Id": connection_id,
                    "Provider-Config-Key": provider,
                }
                if headers:
                    proxy_headers.update(headers)

                url = f"{self.base_url}/proxy{endpoint}"

                response = requests.request(
                    method=method,
                    url=url,
                    headers=proxy_headers,
                    json=data,
                    params=params,
                    timeout=60
                )
                response.raise_for_status()
                return response.json()
        except Exception as e:
            logger.error(f"Proxy request failed: {e}")
            raise

    # ==================
    # Trigger Actions
    # ==================

    def trigger_action(
        self,
        action_name: str,
        provider: str,
        connection_id: str,
        input_data: Optional[Dict] = None
    ) -> Dict[str, Any]:
        """
        Trigger a Nango action.

        Args:
            action_name: Name of the action to trigger
            provider: Integration provider key
            connection_id: The connection ID
            input_data: Input parameters for the action

        Returns:
            Action result
        """
        if not self.is_configured():
            raise ValueError("NANGO_SECRET_KEY not configured")

        try:
            if self._sdk_available:
                client = self._get_client()
                result = client.trigger_action(
                    provider_config_key=provider,
                    connection_id=connection_id,
                    action_name=action_name,
                    input=input_data or {}
                )
                return result
            else:
                payload = {
                    "action_name": action_name,
                    "input": input_data or {}
                }
                result = self._make_request(
                    "POST",
                    f"/action/trigger",
                    json_data=payload,
                    params={
                        "provider_config_key": provider,
                        "connection_id": connection_id
                    }
                )
                return result
        except Exception as e:
            logger.error(f"Failed to trigger action: {e}")
            raise

    # ==================
    # Helper Methods
    # ==================

    def get_supported_integrations(
        self,
        category: Optional[IntegrationCategory] = None
    ) -> List[IntegrationConfig]:
        """Get list of supported integrations, optionally filtered by category"""
        integrations = list(SUPPORTED_INTEGRATIONS.values())
        if category:
            integrations = [i for i in integrations if i.category == category]
        return integrations

    def get_integration_config(self, integration_id: str) -> Optional[IntegrationConfig]:
        """Get configuration for a specific integration"""
        return SUPPORTED_INTEGRATIONS.get(integration_id)

    def get_user_integrations(self, user_id: str) -> List[Dict[str, Any]]:
        """
        Get all integrations for a user with connection status.

        Returns list of integrations with 'connected' status and connection details.
        """
        connections = self.list_connections(user_id=user_id)
        connected_providers = {c["provider"]: c for c in connections}

        result = []
        for integration_id, config in SUPPORTED_INTEGRATIONS.items():
            connection = connected_providers.get(config.id)
            result.append({
                "id": config.id,
                "name": config.name,
                "category": config.category.value,
                "icon": config.icon,
                "description": config.description,
                "capabilities": config.capabilities,
                "connected": connection is not None,
                "connection_id": connection["id"] if connection else None,
                "connected_at": connection["created_at"] if connection else None
            })

        return result


# Singleton instance
_singleton: Optional[NangoService] = None


def get_nango_service() -> NangoService:
    """Get the Nango service singleton"""
    global _singleton
    if _singleton is None:
        _singleton = NangoService()
    return _singleton
