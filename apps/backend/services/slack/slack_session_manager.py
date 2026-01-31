"""
Slack session, workspace, and user mapping CRUD.

All database operations go through the Supabase service-role client.
"""

import logging
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

from services.supabase import get_supabase_client
from services.slack.slack_auth import encrypt_token, decrypt_token

logger = logging.getLogger(__name__)

_instance: Optional["SlackSessionManager"] = None


def get_session_manager() -> "SlackSessionManager":
    global _instance
    if _instance is None:
        _instance = SlackSessionManager()
    return _instance


@dataclass
class SlackWorkspace:
    team_id: str
    team_name: str
    bot_token: str  # Decrypted
    bot_user_id: str
    installer_user_id: Optional[str]
    scopes: List[str]
    is_active: bool


@dataclass
class SlackUserMapping:
    slack_user_id: str
    slack_team_id: str
    nextslide_user_id: str
    slack_email: Optional[str]


class SlackSessionManager:
    """Manages Slack workspaces, user mappings, and generation sessions."""

    # ── Workspaces ──────────────────────────────────────────────────────

    async def upsert_workspace(
        self,
        team_id: str,
        team_name: str,
        bot_token: str,
        bot_user_id: str,
        installer_user_id: Optional[str],
        scopes: List[str],
    ) -> None:
        client = get_supabase_client()
        encrypted = encrypt_token(bot_token)
        client.table("slack_workspaces").upsert(
            {
                "team_id": team_id,
                "team_name": team_name,
                "bot_token": encrypted,
                "bot_user_id": bot_user_id,
                "installer_user_id": installer_user_id,
                "scopes": scopes,
                "is_active": True,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="team_id",
        ).execute()
        logger.info(f"Upserted workspace {team_id} ({team_name})")

    async def get_workspace(self, team_id: str) -> Optional[SlackWorkspace]:
        client = get_supabase_client()
        result = (
            client.table("slack_workspaces")
            .select("*")
            .eq("team_id", team_id)
            .eq("is_active", True)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        row = rows[0]
        return SlackWorkspace(
            team_id=row["team_id"],
            team_name=row["team_name"],
            bot_token=decrypt_token(row["bot_token"]),
            bot_user_id=row["bot_user_id"],
            installer_user_id=row.get("installer_user_id"),
            scopes=row.get("scopes", []),
            is_active=row["is_active"],
        )

    async def deactivate_workspace(self, team_id: str) -> None:
        client = get_supabase_client()
        client.table("slack_workspaces").update(
            {"is_active": False, "updated_at": datetime.now(timezone.utc).isoformat()}
        ).eq("team_id", team_id).execute()

    # ── User mappings ───────────────────────────────────────────────────

    async def get_user_mapping(
        self, slack_user_id: str, slack_team_id: str
    ) -> Optional[SlackUserMapping]:
        client = get_supabase_client()
        result = (
            client.table("slack_user_mappings")
            .select("*")
            .eq("slack_user_id", slack_user_id)
            .eq("slack_team_id", slack_team_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        row = rows[0]
        return SlackUserMapping(
            slack_user_id=row["slack_user_id"],
            slack_team_id=row["slack_team_id"],
            nextslide_user_id=row["nextslide_user_id"],
            slack_email=row.get("slack_email"),
        )

    async def upsert_user_mapping(
        self,
        slack_user_id: str,
        slack_team_id: str,
        nextslide_user_id: str,
        slack_email: Optional[str] = None,
    ) -> None:
        client = get_supabase_client()
        client.table("slack_user_mappings").upsert(
            {
                "slack_user_id": slack_user_id,
                "slack_team_id": slack_team_id,
                "nextslide_user_id": nextslide_user_id,
                "slack_email": slack_email,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            },
            on_conflict="slack_user_id,slack_team_id",
        ).execute()

    async def auto_link_by_email(
        self, slack_email: str, slack_user_id: str, slack_team_id: str
    ) -> Optional[str]:
        """
        Try to find a NextSlide user whose email matches the Slack user's email.
        Returns the nextslide_user_id if linked, else None.
        """
        client = get_supabase_client()
        # Look up by email in the profiles or auth table
        result = (
            client.table("profiles")
            .select("user_id")
            .eq("email", slack_email)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None

        ns_user_id = rows[0]["user_id"]
        await self.upsert_user_mapping(
            slack_user_id, slack_team_id, ns_user_id, slack_email
        )
        logger.info(f"Auto-linked Slack {slack_user_id} to NextSlide {ns_user_id} via email")
        return ns_user_id

    async def get_mapping_by_nextslide_user(
        self, nextslide_user_id: str
    ) -> Optional[SlackUserMapping]:
        client = get_supabase_client()
        result = (
            client.table("slack_user_mappings")
            .select("*")
            .eq("nextslide_user_id", nextslide_user_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        if not rows:
            return None
        row = rows[0]
        return SlackUserMapping(
            slack_user_id=row["slack_user_id"],
            slack_team_id=row["slack_team_id"],
            nextslide_user_id=row["nextslide_user_id"],
            slack_email=row.get("slack_email"),
        )

    async def delete_mapping_by_nextslide_user(self, nextslide_user_id: str) -> None:
        client = get_supabase_client()
        client.table("slack_user_mappings").delete().eq(
            "nextslide_user_id", nextslide_user_id
        ).execute()

    async def get_workspace_for_user(
        self, nextslide_user_id: str
    ) -> Optional[SlackWorkspace]:
        """Get the workspace connected to a NextSlide user (via their mapping)."""
        mapping = await self.get_mapping_by_nextslide_user(nextslide_user_id)
        if not mapping:
            return None
        return await self.get_workspace(mapping.slack_team_id)

    # ── Generation sessions ─────────────────────────────────────────────

    async def create_session(
        self,
        slack_team_id: str,
        slack_channel_id: str,
        slack_user_id: str,
        *,
        slack_thread_ts: Optional[str] = None,
        slack_response_url: Optional[str] = None,
        nextslide_user_id: Optional[str] = None,
    ) -> str:
        """Create a new generation session. Returns the session id."""
        client = get_supabase_client()
        result = (
            client.table("slack_generation_sessions")
            .insert(
                {
                    "slack_team_id": slack_team_id,
                    "slack_channel_id": slack_channel_id,
                    "slack_user_id": slack_user_id,
                    "slack_thread_ts": slack_thread_ts,
                    "slack_response_url": slack_response_url,
                    "nextslide_user_id": nextslide_user_id,
                    "state": "gathering_context",
                }
            )
            .execute()
        )
        session_id = result.data[0]["id"]
        return session_id

    async def get_session(self, session_id: str) -> Optional[Dict[str, Any]]:
        client = get_supabase_client()
        result = (
            client.table("slack_generation_sessions")
            .select("*")
            .eq("id", session_id)
            .limit(1)
            .execute()
        )
        rows = result.data or []
        return rows[0] if rows else None

    async def update_session(self, session_id: str, **fields: Any) -> None:
        client = get_supabase_client()
        fields["updated_at"] = datetime.now(timezone.utc).isoformat()
        client.table("slack_generation_sessions").update(fields).eq(
            "id", session_id
        ).execute()
