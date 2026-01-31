"""
Bridge between Slack and the existing deck generation pipeline.

Reuses the same outline + composition pipeline as api_public_v1.py.
Handles progress updates and completion messaging via response_url
(which always works) with chat.postMessage as optional fallback.
"""

import asyncio
import logging
import uuid
from typing import Any, Dict, List, Optional

from services.slack.slack_service import SlackService, get_slack_service
from services.slack.slack_block_kit import SlackBlockKit
from services.slack.slack_session_manager import SlackSessionManager, get_session_manager
from services.slack.slack_context_gatherer import SlackContext

logger = logging.getLogger(__name__)


class SlackGenerationBridge:
    """Orchestrates deck generation triggered from Slack."""

    def __init__(
        self,
        slack_service: Optional[SlackService] = None,
        session_manager: Optional[SlackSessionManager] = None,
    ):
        self.slack = slack_service or get_slack_service()
        self.sessions = session_manager or get_session_manager()

    async def _send_message(
        self,
        bot_token: str,
        channel_id: str,
        response_url: Optional[str],
        *,
        text: str = "",
        blocks: Optional[List[Dict]] = None,
        thread_ts: Optional[str] = None,
        replace_original: bool = False,
    ) -> Optional[str]:
        """
        Send a message via response_url first (always works),
        fall back to chat.postMessage. Returns the message ts if available.
        """
        if response_url:
            try:
                await self.slack.respond_to_url(
                    response_url,
                    text=text,
                    blocks=blocks,
                    replace_original=replace_original,
                    response_type="in_channel",
                )
                return None  # response_url doesn't return a ts
            except Exception as e:
                logger.debug(f"respond_to_url failed, trying postMessage: {e}")

        # Fallback to chat.postMessage
        try:
            resp = await self.slack.post_message(
                bot_token, channel_id,
                text=text, blocks=blocks, thread_ts=thread_ts,
            )
            return resp.get("ts")
        except Exception as e:
            logger.warning(f"chat.postMessage also failed: {e}")
            return None

    async def generate_deck(
        self,
        session_id: str,
        bot_token: str,
        channel_id: str,
        thread_ts: Optional[str],
        response_url: Optional[str],
        user_id: str,
        topic: str,
        context: SlackContext,
        additional_instructions: Optional[str] = None,
        num_slides: int = 15,
    ) -> None:
        """
        Run the full generation pipeline and post updates to Slack.
        This runs as a background task.
        """
        progress_ts: Optional[str] = None

        try:
            # Update session state
            await self.sessions.update_session(session_id, state="generating")

            # Post initial progress message
            progress_ts = await self._send_message(
                bot_token, channel_id, response_url,
                text="Generating your deck...",
                blocks=SlackBlockKit.generation_progress(0, num_slides, topic[:50]),
                thread_ts=thread_ts,
                replace_original=True,
            )

            # Create deck record + share links
            deck_uuid = str(uuid.uuid4())
            from services.deck_sharing_service import get_sharing_service
            from services.supabase import get_supabase_client

            sharing = get_sharing_service()

            # Create the share links
            view_result = sharing.create_share_link(deck_uuid, user_id, "view")
            edit_result = sharing.create_share_link(deck_uuid, user_id, "edit")

            import os
            frontend_url = os.getenv("FRONTEND_URL", "https://nextslide.ai")
            view_url = f"{frontend_url}/p/{view_result['short_code']}"
            edit_url = f"{frontend_url}/e/{edit_result['short_code']}"

            # Store deck_id in session
            await self.sessions.update_session(session_id, deck_id=deck_uuid)

            # Build combined instructions from context
            from services.slack.slack_context_gatherer import SlackContextGatherer
            combined_instructions = SlackContextGatherer.format_for_agent(context, topic)
            if additional_instructions:
                combined_instructions += f"\n\n{additional_instructions}"

            # Build context files for reference images
            context_files = []
            for img_url in context.reference_images:
                context_files.append({
                    "type": "image",
                    "url": img_url,
                    "name": "slack_reference",
                    "source": "slack_context",
                })

            # Run outline generation
            from services.outline import OutlineGenerator, OutlineOptions
            from models.registry import get_global_registry
            from models.requests import DeckOutline, SlideOutline
            from agents.config import USE_MODAL

            registry = get_global_registry()
            outline_result = None

            if USE_MODAL:
                try:
                    from services.modal_dispatch import generate_outline_via_modal
                    modal_result = await generate_outline_via_modal(
                        prompt=combined_instructions,
                        slide_count=num_slides,
                        style_context=None,
                        async_images=False,
                        files=context_files,
                    )
                    if modal_result and modal_result.get("slides"):
                        outline_result = modal_result
                except Exception as e:
                    logger.warning(f"Modal outline failed, falling back to local: {e}")

            if outline_result is None:
                generator = OutlineGenerator(registry)
                options = OutlineOptions(
                    prompt=combined_instructions,
                    slide_count=num_slides,
                    style_context=None,
                    async_images=False,
                    files=context_files,
                )
                local_result = await generator.generate(options)
                if not local_result or not local_result.slides:
                    raise Exception("Failed to generate outline")

                outline_result = {
                    "title": local_result.title,
                    "slides": [
                        {"title": s.title, "content": s.content or ""}
                        for s in local_result.slides
                    ],
                }

            # Build DeckOutline
            title = outline_result.get("title") or topic[:100]
            deck_outline = DeckOutline(
                id=deck_uuid,
                title=title,
                slides=[
                    SlideOutline(
                        id=str(uuid.uuid4()),
                        title=s["title"],
                        content=s.get("content", ""),
                    )
                    for s in outline_result["slides"]
                ],
            )

            total_slides = len(deck_outline.slides)

            # Set style preferences with reference images
            from models.requests import StylePreferencesItem
            style_data = {
                "initialIdea": topic,
                "vibeContext": topic,
            }
            if context.reference_images:
                style_data["referenceImages"] = context.reference_images
            deck_outline.stylePreferences = StylePreferencesItem(**style_data)

            # Build and upload initial deck
            from api.requests.deck_create import build_initial_deck_payload
            deck_data = build_initial_deck_payload(deck_outline, deck_uuid)
            deck_data["data"] = deck_data.get("data", {})
            deck_data["data"]["source"] = "slack"
            deck_data["data"]["slack_session_id"] = session_id

            from utils.supabase import upload_deck
            upload_deck(deck_data, deck_uuid, user_id)

            # Run composition with progress updates
            from agents.generation.deck_composer import compose_deck_stream
            from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES

            slides_generated = 0
            last_update_count = 0

            async for update in compose_deck_stream(
                deck_outline, registry, deck_uuid,
                max_parallel=MAX_PARALLEL_SLIDES,
                delay_between_slides=DELAY_BETWEEN_SLIDES,
                async_images=False,
                user_id=user_id,
            ):
                utype = update.get("type", "")
                if utype == "slide_generated":
                    slides_generated += 1
                    # Update progress every ~3 slides (only via postMessage if we have ts)
                    if progress_ts and slides_generated - last_update_count >= 3:
                        last_update_count = slides_generated
                        try:
                            await self.slack.update_message(
                                bot_token, channel_id, progress_ts,
                                text=f"Generating... {slides_generated}/{total_slides} slides",
                                blocks=SlackBlockKit.generation_progress(
                                    slides_generated, total_slides, title
                                ),
                            )
                        except Exception:
                            pass  # Non-critical
                elif utype in ("deck_complete", "composition_complete", "complete"):
                    break

            # Mark deck as completed
            client = get_supabase_client()
            client.table("decks").update(
                {"status": {"state": "completed"}}
            ).eq("uuid", deck_uuid).execute()

            # Get thumbnail URL if available
            deck_row = (
                client.table("decks")
                .select("thumbnail_url, slides")
                .eq("uuid", deck_uuid)
                .limit(1)
                .execute()
            )
            thumbnail_url = None
            final_count = total_slides
            if deck_row.data:
                thumbnail_url = deck_row.data[0].get("thumbnail_url")
                final_count = len(deck_row.data[0].get("slides") or []) or total_slides

            # Post completion message
            completion_blocks = SlackBlockKit.deck_complete(
                title=title,
                slide_count=final_count,
                view_url=view_url,
                edit_url=edit_url,
                thumbnail_url=thumbnail_url,
            )

            await self._send_message(
                bot_token, channel_id, response_url,
                text=f"Deck ready: {title}",
                blocks=completion_blocks,
                thread_ts=thread_ts,
                replace_original=True,
            )

            await self.sessions.update_session(session_id, state="completed")
            logger.info(f"Slack deck generation completed: {deck_uuid} ({final_count} slides)")

        except Exception as e:
            logger.error(f"Slack deck generation failed for session {session_id}: {e}", exc_info=True)
            await self.sessions.update_session(
                session_id, state="failed", error_message=str(e)
            )

            error_blocks = SlackBlockKit.error_message(
                f"Deck generation failed: {str(e)[:200]}"
            )
            try:
                await self._send_message(
                    bot_token, channel_id, response_url,
                    text="Generation failed",
                    blocks=error_blocks,
                    thread_ts=thread_ts,
                    replace_original=True,
                )
            except Exception:
                pass

    async def run_clarification(
        self,
        session_id: str,
        bot_token: str,
        channel_id: str,
        thread_ts: Optional[str],
        user_text: str,
        context: SlackContext,
    ) -> Optional[Dict[str, Any]]:
        """
        Run the outline agent to decide: clarify or generate.
        Returns the agent response dict.
        """
        from services.slack.slack_context_gatherer import SlackContextGatherer

        combined = SlackContextGatherer.format_for_agent(context, user_text)

        try:
            import os
            from google import genai
            from api.requests.outline_agent.streaming import (
                OUTLINE_AGENT_SYSTEM_PROMPT,
            )

            client = genai.Client(api_key=os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY"))
            prompt = (
                f"{OUTLINE_AGENT_SYSTEM_PROMPT}\n\n"
                f"USER REQUEST: {combined}\n\n"
                "Respond with a JSON object. If you need clarification, "
                "use action=clarify with message and clarification.fields. "
                "If you have enough info, use action=generate_outline."
            )

            response = client.models.generate_content(
                model="gemini-2.0-flash",
                contents=prompt,
            )

            text = response.text.strip() if response.text else ""

            # Parse JSON from response
            import json
            # Handle markdown code blocks
            if text.startswith("```"):
                text = text.split("```")[1]
                if text.startswith("json"):
                    text = text[4:]
                text = text.strip()

            result = json.loads(text)
            return result

        except Exception as e:
            logger.error(f"Outline agent failed for session {session_id}: {e}")
            # Default to generation if agent fails
            return {"action": "generate_outline"}
