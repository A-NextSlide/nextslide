"""
Slack context gatherer.

Reads channel/thread history, analyses shared files, and scrapes mentioned URLs
to build rich context for the outline agent.
"""

import logging
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from services.slack.slack_service import SlackService, get_slack_service

logger = logging.getLogger(__name__)

# URL pattern: match http(s) links but skip Slack internal (<...>) formatted links
_URL_RE = re.compile(r"https?://[^\s>]+")
# Slack internal links look like <http://...|label>
_SLACK_INTERNAL_HOSTS = {"slack.com", "files.slack.com", "a]"}

SUPPORTED_FILE_TYPES = {
    "pdf", "docx", "doc", "xlsx", "xls", "csv", "pptx", "ppt",
    "png", "jpg", "jpeg", "gif", "webp", "svg",
}

MAX_CONTEXT_CHARS = 3000  # Summarize if raw messages exceed this


@dataclass
class SlackContext:
    """Gathered context from a Slack channel/thread."""

    messages_summary: str = ""
    file_analyses: List[Dict[str, Any]] = field(default_factory=list)
    scraped_urls: List[Dict[str, Any]] = field(default_factory=list)
    reference_images: List[str] = field(default_factory=list)
    raw_message_count: int = 0
    file_count: int = 0


class SlackContextGatherer:
    """Gathers context from Slack conversations for the outline agent."""

    def __init__(self, slack_service: Optional[SlackService] = None):
        self.slack = slack_service or get_slack_service()

    async def gather_context(
        self,
        bot_token: str,
        channel_id: str,
        thread_ts: Optional[str] = None,
        user_text: Optional[str] = None,
    ) -> SlackContext:
        """
        Main entry point. Fetches messages, files, and URLs from the channel/thread.
        """
        ctx = SlackContext()

        # 1. Fetch messages
        messages = await self._gather_messages(bot_token, channel_id, thread_ts)
        ctx.raw_message_count = len(messages)

        # 2. Summarize messages
        if messages:
            ctx.messages_summary = await self._summarize_messages(messages, user_text)

        # 3. Collect file references from messages
        file_refs = self._collect_file_refs(messages)
        if file_refs:
            analyses, ref_images = await self._extract_files(bot_token, file_refs)
            ctx.file_analyses = analyses
            ctx.reference_images = ref_images
            ctx.file_count = len(file_refs)

        # 4. Extract and scrape URLs
        urls = self._extract_urls(messages)
        if urls:
            ctx.scraped_urls = await self._scrape_urls(urls[:3])

        return ctx

    # ── Messages ────────────────────────────────────────────────────────

    async def _gather_messages(
        self,
        bot_token: str,
        channel_id: str,
        thread_ts: Optional[str],
        limit: int = 30,
    ) -> List[Dict[str, Any]]:
        """Fetch recent messages, filtering out bot and system messages."""
        try:
            if thread_ts:
                raw = await self.slack.get_conversations_replies(
                    bot_token, channel_id, thread_ts, limit=limit
                )
            else:
                raw = await self.slack.get_conversations_history(
                    bot_token, channel_id, limit=limit
                )
        except Exception as e:
            logger.warning(f"Failed to fetch messages for channel {channel_id}: {e}")
            return []

        # Filter: keep human messages only
        filtered = []
        for msg in raw:
            # Skip bot messages, join/leave messages, etc.
            if msg.get("subtype") in (
                "bot_message", "channel_join", "channel_leave",
                "channel_topic", "channel_purpose",
            ):
                continue
            if msg.get("bot_id"):
                continue
            filtered.append({
                "user": msg.get("user", "unknown"),
                "text": msg.get("text", ""),
                "ts": msg.get("ts", ""),
                "files": msg.get("files", []),
                "attachments": msg.get("attachments", []),
            })

        return filtered

    async def _summarize_messages(
        self,
        messages: List[Dict[str, Any]],
        user_text: Optional[str],
    ) -> str:
        """Build a context summary from messages. Uses AI if text is long."""
        # Build raw transcript
        lines = []
        for msg in reversed(messages):  # chronological order
            user = msg.get("user", "someone")
            text = msg.get("text", "").strip()
            if text:
                lines.append(f"- <@{user}>: \"{text}\"")

        raw = "\n".join(lines)

        if len(raw) <= MAX_CONTEXT_CHARS:
            return raw

        # Summarize with a fast model
        try:
            import os
            from google import genai

            client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))
            prompt = (
                f"Summarize the following Slack conversation into a concise context "
                f"(max 500 words) relevant to creating a presentation"
                f"{' about: ' + user_text if user_text else ''}.\n\n"
                f"CONVERSATION:\n{raw[:6000]}"
            )
            response = client.models.generate_content(
                model="gemini-2.0-flash-lite",
                contents=prompt,
            )
            return response.text.strip() if response.text else raw[:MAX_CONTEXT_CHARS]
        except Exception as e:
            logger.warning(f"AI summarization failed, using truncated text: {e}")
            return raw[:MAX_CONTEXT_CHARS]

    # ── Files ───────────────────────────────────────────────────────────

    def _collect_file_refs(self, messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Extract file metadata from messages."""
        seen_ids = set()
        refs = []
        for msg in messages:
            for f in msg.get("files", []):
                fid = f.get("id")
                if fid and fid not in seen_ids:
                    seen_ids.add(fid)
                    filetype = (f.get("filetype") or "").lower()
                    if filetype in SUPPORTED_FILE_TYPES:
                        refs.append(f)
        return refs[:10]  # cap to avoid overload

    async def _extract_files(
        self,
        bot_token: str,
        file_refs: List[Dict[str, Any]],
    ) -> tuple[List[Dict[str, Any]], List[str]]:
        """Download files and analyse via the existing interpret-media pipeline."""
        analyses = []
        ref_images = []

        for fref in file_refs:
            try:
                url = fref.get("url_private_download") or fref.get("url_private")
                if not url:
                    continue

                filetype = (fref.get("filetype") or "").lower()
                filename = fref.get("name", f"file.{filetype}")

                # Images: just pass as reference images
                if filetype in ("png", "jpg", "jpeg", "gif", "webp", "svg"):
                    # Download and upload to temp storage for the pipeline
                    content = await self.slack.download_file(bot_token, url)
                    img_url = await self._upload_temp_file(content, filename, filetype)
                    if img_url:
                        ref_images.append(img_url)
                    continue

                # Documents: download + analyse
                content = await self.slack.download_file(bot_token, url)
                analysis = await self._analyse_document(content, filename, filetype)
                if analysis:
                    analyses.append(analysis)

            except Exception as e:
                logger.warning(f"Failed to process file {fref.get('name')}: {e}")

        return analyses, ref_images

    async def _upload_temp_file(
        self, content: bytes, filename: str, filetype: str
    ) -> Optional[str]:
        """Upload file to Supabase temp storage and return public URL."""
        try:
            import uuid
            from services.supabase import get_supabase_client

            ext = filetype if filetype else "bin"
            path = f"slack-files/{uuid.uuid4()}.{ext}"
            mime_map = {
                "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
                "gif": "image/gif", "webp": "image/webp", "svg": "image/svg+xml",
                "pdf": "application/pdf",
            }
            mime = mime_map.get(filetype, "application/octet-stream")

            client = get_supabase_client()
            client.storage.from_("api-context-images").upload(
                path=path, file=content, file_options={"content-type": mime}
            )
            return client.storage.from_("api-context-images").get_public_url(path)
        except Exception as e:
            logger.warning(f"Failed to upload temp file {filename}: {e}")
            return None

    async def _analyse_document(
        self, content: bytes, filename: str, filetype: str
    ) -> Optional[Dict[str, Any]]:
        """Analyse a document using the existing file_design_extractor."""
        try:
            import base64
            from services.file_design_extractor import FileDesignExtractor

            b64_content = base64.b64encode(content).decode("utf-8")

            extractor = FileDesignExtractor()
            analysis = await extractor.analyze_file(
                file_content=b64_content,
                filename=filename,
                file_type=filetype,
                user_message=f"Analyze this {filetype} file for presentation content",
            )
            return {
                "filename": filename,
                "file_type": filetype,
                "content_summary": analysis.content.summary if analysis.content else "",
                "main_points": analysis.content.main_points if analysis.content else [],
                "data_points": analysis.content.data_points if analysis.content else [],
            }

        except Exception as e:
            logger.warning(f"Document analysis failed for {filename}: {e}")
            return None

    # ── URLs ────────────────────────────────────────────────────────────

    def _extract_urls(self, messages: List[Dict[str, Any]]) -> List[str]:
        """Pull external URLs from message text."""
        seen = set()
        urls = []
        for msg in messages:
            for match in _URL_RE.findall(msg.get("text", "")):
                # Clean trailing punctuation
                clean = match.rstrip(".,;:!?)")
                # Skip Slack-internal
                try:
                    from urllib.parse import urlparse
                    host = urlparse(clean).hostname or ""
                    if any(h in host for h in ("slack.com", "slack-edge.com")):
                        continue
                except Exception:
                    continue
                if clean not in seen:
                    seen.add(clean)
                    urls.append(clean)
        return urls

    async def _scrape_urls(self, urls: List[str]) -> List[Dict[str, Any]]:
        """Scrape URLs using the existing Firecrawl integration."""
        results = []
        for url in urls:
            try:
                from services.firecrawl_service import get_firecrawl_service

                fc = get_firecrawl_service()
                result = fc.scrape(url, formats=["markdown"])
                if result.get("success"):
                    markdown = (result.get("data") or {}).get("markdown", "")
                    if markdown:
                        results.append({
                            "url": url,
                            "content": markdown[:3000],  # cap
                        })
            except Exception as e:
                logger.debug(f"Failed to scrape {url}: {e}")
        return results

    # ── Format for outline agent ────────────────────────────────────────

    @staticmethod
    def format_for_agent(ctx: SlackContext, user_text: str) -> str:
        """
        Build the combined prompt string that gets passed to the outline agent
        as additional_instructions / context.
        """
        parts = [user_text]

        if ctx.messages_summary:
            parts.append(
                f"\n\nSLACK CHANNEL CONTEXT (last {ctx.raw_message_count} messages):\n"
                f"{ctx.messages_summary}"
            )

        if ctx.file_analyses:
            file_parts = []
            for fa in ctx.file_analyses:
                summary = fa.get("content_summary", "")
                points = fa.get("main_points", [])
                fp = f"- {fa['filename']} ({fa['file_type']})"
                if summary:
                    fp += f": {summary[:200]}"
                if points:
                    fp += "\n  Key points: " + "; ".join(str(p) for p in points[:5])
                file_parts.append(fp)
            parts.append(
                "\n\nATTACHED FILES FROM SLACK:\n" + "\n".join(file_parts)
            )

        if ctx.scraped_urls:
            url_parts = []
            for su in ctx.scraped_urls:
                url_parts.append(f"- {su['url']}: {su['content'][:300]}")
            parts.append(
                "\n\nREFERENCED URLS:\n" + "\n".join(url_parts)
            )

        return "\n".join(parts)
