"""
Slack Web API client.

Thin httpx wrapper for the Slack endpoints we need.
No third-party Slack SDK -- keeps things consistent with the rest of the codebase.
"""

import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api"

_instance: Optional["SlackService"] = None


def get_slack_service() -> "SlackService":
    global _instance
    if _instance is None:
        _instance = SlackService()
    return _instance


class SlackService:
    """Async Slack Web API client using httpx."""

    def __init__(self):
        self._client = httpx.AsyncClient(timeout=30.0)

    async def _api(
        self,
        method: str,
        token: str,
        *,
        json_body: Optional[Dict[str, Any]] = None,
        params: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """Call a Slack Web API method and return the JSON response."""
        headers = {"Authorization": f"Bearer {token}"}
        resp = await self._client.post(
            f"{SLACK_API}/{method}",
            headers=headers,
            json=json_body or {},
            params=params,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            error = data.get("error", "unknown_error")
            logger.warning(f"Slack API {method} failed: {error}")
            raise SlackAPIError(method, error, data)
        return data

    # ── Messaging ────────────────────────────────────────────────────────

    async def post_message(
        self,
        token: str,
        channel: str,
        *,
        text: str = "",
        blocks: Optional[List[Dict]] = None,
        thread_ts: Optional[str] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"channel": channel, "text": text}
        if blocks:
            body["blocks"] = blocks
        if thread_ts:
            body["thread_ts"] = thread_ts
        return await self._api("chat.postMessage", token, json_body=body)

    async def update_message(
        self,
        token: str,
        channel: str,
        ts: str,
        *,
        text: str = "",
        blocks: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"channel": channel, "ts": ts, "text": text}
        if blocks:
            body["blocks"] = blocks
        return await self._api("chat.update", token, json_body=body)

    async def post_ephemeral(
        self,
        token: str,
        channel: str,
        user: str,
        *,
        text: str = "",
        blocks: Optional[List[Dict]] = None,
    ) -> Dict[str, Any]:
        body: Dict[str, Any] = {"channel": channel, "user": user, "text": text}
        if blocks:
            body["blocks"] = blocks
        return await self._api("chat.postEphemeral", token, json_body=body)

    async def respond_to_url(
        self,
        response_url: str,
        *,
        text: str = "",
        blocks: Optional[List[Dict]] = None,
        replace_original: bool = False,
        response_type: str = "ephemeral",
    ) -> None:
        """Post to a Slack response_url (slash commands / interactions)."""
        body: Dict[str, Any] = {
            "text": text,
            "response_type": response_type,
            "replace_original": replace_original,
        }
        if blocks:
            body["blocks"] = blocks
        await self._client.post(response_url, json=body)

    async def unfurl_link(
        self,
        token: str,
        channel: str,
        ts: str,
        unfurls: Dict[str, Any],
    ) -> Dict[str, Any]:
        return await self._api(
            "chat.unfurl",
            token,
            json_body={"channel": channel, "ts": ts, "unfurls": unfurls},
        )

    # ── Users ────────────────────────────────────────────────────────────

    async def get_user_info(self, token: str, user_id: str) -> Dict[str, Any]:
        data = await self._api("users.info", token, json_body={"user": user_id})
        return data.get("user", {})

    # ── Conversations (history / replies) ────────────────────────────────

    async def get_conversations_history(
        self,
        token: str,
        channel: str,
        *,
        limit: int = 100,
        latest: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        body: Dict[str, Any] = {"channel": channel, "limit": limit}
        if latest:
            body["latest"] = latest
        data = await self._api("conversations.history", token, json_body=body)
        return data.get("messages", [])

    async def get_conversations_replies(
        self,
        token: str,
        channel: str,
        thread_ts: str,
        *,
        limit: int = 100,
    ) -> List[Dict[str, Any]]:
        body = {"channel": channel, "ts": thread_ts, "limit": limit}
        data = await self._api("conversations.replies", token, json_body=body)
        return data.get("messages", [])

    # ── Files ────────────────────────────────────────────────────────────

    async def get_file_info(self, token: str, file_id: str) -> Dict[str, Any]:
        data = await self._api("files.info", token, json_body={"file": file_id})
        return data.get("file", {})

    async def download_file(self, token: str, url: str) -> bytes:
        """Download a file from a Slack-provided URL using bot token auth."""
        resp = await self._client.get(
            url, headers={"Authorization": f"Bearer {token}"}, follow_redirects=True
        )
        resp.raise_for_status()
        return resp.content

    # ── OAuth ────────────────────────────────────────────────────────────

    async def oauth_v2_access(
        self,
        client_id: str,
        client_secret: str,
        code: str,
        redirect_uri: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Exchange an OAuth code for tokens."""
        body: Dict[str, Any] = {
            "client_id": client_id,
            "client_secret": client_secret,
            "code": code,
        }
        if redirect_uri:
            body["redirect_uri"] = redirect_uri
        resp = await self._client.post(f"{SLACK_API}/oauth.v2.access", data=body)
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise SlackAPIError("oauth.v2.access", data.get("error", "unknown"), data)
        return data


class SlackAPIError(Exception):
    """Raised when Slack returns ok=false."""

    def __init__(self, method: str, error: str, raw: Dict[str, Any]):
        self.method = method
        self.error = error
        self.raw = raw
        super().__init__(f"Slack API {method}: {error}")
