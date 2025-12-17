"""
Integration Registry Service

Central registry for managing system-wide integration activation.
Determines which integrations are available to users and their data providers.
"""

from __future__ import annotations

import os
from typing import Any, Dict, List, Optional
from dataclasses import dataclass, field
from enum import Enum

from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class IntegrationProvider(str, Enum):
    """Data providers for integrations"""
    APOLLO = "apollo"      # Apollo.io API (company/people data)
    NANGO = "nango"        # Nango OAuth (direct API access)
    SYSTEM = "system"      # System API key (no user auth needed)


@dataclass
class IntegrationConfig:
    """Configuration for a registered integration"""
    id: str
    name: str
    description: str
    icon: str
    provider: IntegrationProvider
    requires_user_connection: bool = False  # True if user needs to OAuth
    default_enabled: bool = False
    capabilities: List[str] = field(default_factory=list)
    # Provider-specific config
    provider_config: Dict[str, Any] = field(default_factory=dict)


# System-wide integration registry
# Add new integrations here to make them available
INTEGRATION_REGISTRY: Dict[str, IntegrationConfig] = {
    # LinkedIn via Apollo - no user OAuth needed
    "linkedin": IntegrationConfig(
        id="linkedin",
        name="LinkedIn",
        description="Look up professional profiles and company information",
        icon="linkedin",
        provider=IntegrationProvider.APOLLO,
        requires_user_connection=False,  # Uses system Apollo API key
        default_enabled=True,
        capabilities=["profile_lookup", "company_lookup", "search_people"],
        provider_config={
            "api_endpoint": "mixed_people/search",
        }
    ),

    # Future integrations can be added here:
    # "salesforce": IntegrationConfig(
    #     id="salesforce",
    #     name="Salesforce",
    #     description="Access CRM contacts, accounts, and deals",
    #     icon="salesforce",
    #     provider=IntegrationProvider.NANGO,
    #     requires_user_connection=True,
    #     default_enabled=False,
    #     capabilities=["contacts", "accounts", "deals", "search"],
    # ),
}


class IntegrationRegistryService:
    """Service for managing integration registry and settings"""

    def __init__(self):
        self._db_initialized = False
        self._settings_cache: Dict[str, Dict[str, Any]] = {}

    async def _ensure_db(self):
        """Lazy load database connection"""
        if not self._db_initialized:
            try:
                from services.supabase import get_supabase_client
                self._supabase = get_supabase_client()
                self._db_initialized = True
            except Exception as e:
                logger.warning(f"Database not available for integration settings: {e}")
                self._supabase = None

    def get_all_integrations(self) -> List[IntegrationConfig]:
        """Get all registered integrations"""
        return list(INTEGRATION_REGISTRY.values())

    def get_integration(self, integration_id: str) -> Optional[IntegrationConfig]:
        """Get a specific integration config"""
        return INTEGRATION_REGISTRY.get(integration_id)

    def is_registered(self, integration_id: str) -> bool:
        """Check if an integration is registered"""
        return integration_id in INTEGRATION_REGISTRY

    async def get_enabled_integrations(self) -> List[IntegrationConfig]:
        """Get all enabled integrations (checking database settings)"""
        await self._ensure_db()

        enabled = []
        for integration_id, config in INTEGRATION_REGISTRY.items():
            if await self.is_enabled(integration_id):
                enabled.append(config)

        return enabled

    async def is_enabled(self, integration_id: str) -> bool:
        """Check if an integration is enabled"""
        config = INTEGRATION_REGISTRY.get(integration_id)
        if not config:
            return False

        # Check database override first
        await self._ensure_db()
        if self._supabase:
            try:
                result = self._supabase.table("integration_settings") \
                    .select("enabled") \
                    .eq("integration_id", integration_id) \
                    .maybe_single() \
                    .execute()

                if result.data:
                    return result.data.get("enabled", config.default_enabled)
            except Exception as e:
                logger.debug(f"Could not fetch integration setting: {e}")

        # Fall back to default
        return config.default_enabled

    async def set_enabled(self, integration_id: str, enabled: bool) -> bool:
        """Enable or disable an integration"""
        if integration_id not in INTEGRATION_REGISTRY:
            return False

        await self._ensure_db()
        if not self._supabase:
            logger.error("Database not available to update integration settings")
            return False

        try:
            # Upsert the setting
            self._supabase.table("integration_settings").upsert({
                "integration_id": integration_id,
                "enabled": enabled,
            }, on_conflict="integration_id").execute()

            # Clear cache
            self._settings_cache.pop(integration_id, None)
            return True
        except Exception as e:
            logger.error(f"Failed to update integration setting: {e}")
            return False

    async def get_integration_settings(self, integration_id: str) -> Dict[str, Any]:
        """Get settings for a specific integration"""
        await self._ensure_db()

        config = INTEGRATION_REGISTRY.get(integration_id)
        if not config:
            return {}

        settings = {
            "id": config.id,
            "name": config.name,
            "description": config.description,
            "icon": config.icon,
            "provider": config.provider.value,
            "requires_user_connection": config.requires_user_connection,
            "capabilities": config.capabilities,
            "enabled": await self.is_enabled(integration_id),
            "config": {},
        }

        # Get custom config from database
        if self._supabase:
            try:
                result = self._supabase.table("integration_settings") \
                    .select("config") \
                    .eq("integration_id", integration_id) \
                    .maybe_single() \
                    .execute()

                if result.data and result.data.get("config"):
                    settings["config"] = result.data["config"]
            except Exception as e:
                logger.debug(f"Could not fetch integration config: {e}")

        return settings

    async def update_integration_config(
        self,
        integration_id: str,
        config: Dict[str, Any]
    ) -> bool:
        """Update custom configuration for an integration"""
        if integration_id not in INTEGRATION_REGISTRY:
            return False

        await self._ensure_db()
        if not self._supabase:
            return False

        try:
            self._supabase.table("integration_settings").upsert({
                "integration_id": integration_id,
                "config": config,
            }, on_conflict="integration_id").execute()
            return True
        except Exception as e:
            logger.error(f"Failed to update integration config: {e}")
            return False

    def get_provider(self, integration_id: str) -> Optional[IntegrationProvider]:
        """Get the data provider for an integration"""
        config = INTEGRATION_REGISTRY.get(integration_id)
        return config.provider if config else None

    def requires_user_connection(self, integration_id: str) -> bool:
        """Check if integration requires user OAuth connection"""
        config = INTEGRATION_REGISTRY.get(integration_id)
        return config.requires_user_connection if config else True


# Singleton instance
_registry_service: Optional[IntegrationRegistryService] = None


def get_integration_registry() -> IntegrationRegistryService:
    """Get the integration registry singleton"""
    global _registry_service
    if _registry_service is None:
        _registry_service = IntegrationRegistryService()
    return _registry_service


# Convenience functions for synchronous access to registry data
def get_registered_integrations() -> List[str]:
    """Get list of all registered integration IDs"""
    return list(INTEGRATION_REGISTRY.keys())


def get_integration_config(integration_id: str) -> Optional[IntegrationConfig]:
    """Get configuration for a specific integration"""
    return INTEGRATION_REGISTRY.get(integration_id)


def is_integration_registered(integration_id: str) -> bool:
    """Check if an integration is registered in the system"""
    return integration_id in INTEGRATION_REGISTRY
