"""
Slack Block Kit message builders.

Translates NextSlide clarification fields and status updates into
Slack Block Kit JSON structures.
"""

import os
import re
from typing import Any, Dict, List, Optional

FRONTEND_URL = os.getenv("FRONTEND_URL", "https://nextslide.ai")


class SlackBlockKit:
    """Static builders for Block Kit message payloads."""

    # ── Clarification form ──────────────────────────────────────────────

    @staticmethod
    def clarification_form(
        session_id: str,
        message: str,
        fields: List[Dict[str, Any]],
    ) -> List[Dict]:
        """
        Convert the outline agent's clarification fields into a Block Kit form.

        Field types supported:
          - text / textarea  -> plain_text_input
          - select / dropdown -> static_select
          - number           -> plain_text_input (with hint)
        """
        blocks: List[Dict] = [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": message},
            },
            {"type": "divider"},
        ]

        for field in fields:
            key = field.get("key", "unknown")
            label = field.get("label", key)
            # Strip markdown bold (*text*) since Slack input labels are plain_text
            label = re.sub(r"\*([^*]+)\*", r"\1", label)
            ftype = field.get("type", "text")
            placeholder = field.get("placeholder", "")
            default_value = field.get("value", "")
            options = field.get("options")

            block_id = f"field_{key}"
            action_id = f"input_{key}"

            if ftype in ("select", "dropdown") and options:
                # static_select
                select_options = [
                    {
                        "text": {"type": "plain_text", "text": str(opt)[:75]},
                        "value": str(opt)[:75],
                    }
                    for opt in options[:100]  # Slack limit
                ]
                element: Dict[str, Any] = {
                    "type": "static_select",
                    "action_id": action_id,
                    "placeholder": {"type": "plain_text", "text": placeholder[:150] or "Choose..."},
                    "options": select_options,
                }
                if default_value:
                    matching = [o for o in select_options if o["value"] == str(default_value)]
                    if matching:
                        element["initial_option"] = matching[0]
            else:
                # plain_text_input
                element = {
                    "type": "plain_text_input",
                    "action_id": action_id,
                    "placeholder": {"type": "plain_text", "text": placeholder[:150] or f"Enter {label.lower()}..."},
                }
                if default_value:
                    element["initial_value"] = str(default_value)
                if ftype == "number":
                    element["dispatch_action_config"] = {"trigger_actions_on": ["on_character_entered"]}

            blocks.append({
                "type": "input",
                "block_id": block_id,
                "label": {"type": "plain_text", "text": label[:2000]},
                "element": element,
                "optional": True,
            })

        # Submit button
        blocks.append({"type": "divider"})
        blocks.append({
            "type": "actions",
            "block_id": "submit_block",
            "elements": [
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Generate Deck"},
                    "style": "primary",
                    "action_id": "generate_deck",
                    "value": session_id,
                },
                {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Cancel"},
                    "action_id": "cancel_generation",
                    "value": session_id,
                },
            ],
        })

        return blocks

    # ── Context gathering status ────────────────────────────────────────

    @staticmethod
    def context_gathering(
        topic: str,
        message_count: int = 0,
        file_count: int = 0,
    ) -> List[Dict]:
        parts = [f"*Topic:* {topic}"]
        if message_count:
            parts.append(f"Reading {message_count} recent messages...")
        if file_count:
            parts.append(f"Analyzing {file_count} shared file{'s' if file_count != 1 else ''}...")
        parts.append("_Gathering context from this conversation..._")

        return [
            {
                "type": "section",
                "text": {"type": "mrkdwn", "text": "\n".join(parts)},
            }
        ]

    # ── Progress ────────────────────────────────────────────────────────

    @staticmethod
    def generation_progress(
        slides_done: int,
        slides_total: int,
        title: Optional[str] = None,
    ) -> List[Dict]:
        pct = int((slides_done / max(slides_total, 1)) * 100)
        bar_filled = pct // 10
        bar = "\u2588" * bar_filled + "\u2591" * (10 - bar_filled)

        header = f"*Generating{' ' + title if title else ''}...*"
        status = f"`{bar}` {pct}%  \u2022  {slides_done}/{slides_total} slides"

        return [
            {"type": "section", "text": {"type": "mrkdwn", "text": header}},
            {"type": "section", "text": {"type": "mrkdwn", "text": status}},
        ]

    # ── Completion ──────────────────────────────────────────────────────

    @staticmethod
    def deck_complete(
        title: str,
        slide_count: int,
        view_url: str,
        edit_url: Optional[str] = None,
        thumbnail_url: Optional[str] = None,
    ) -> List[Dict]:
        blocks: List[Dict] = []

        text = f"*{title}*\n{slide_count} slide{'s' if slide_count != 1 else ''} \u2022 Ready to present"

        if thumbnail_url:
            blocks.append({
                "type": "image",
                "image_url": thumbnail_url,
                "alt_text": title,
            })

        blocks.append({
            "type": "section",
            "text": {"type": "mrkdwn", "text": text},
        })

        buttons: List[Dict] = [
            {
                "type": "button",
                "text": {"type": "plain_text", "text": "View Presentation"},
                "url": view_url,
                "style": "primary",
                "action_id": "view_deck",
            },
        ]
        if edit_url:
            buttons.append({
                "type": "button",
                "text": {"type": "plain_text", "text": "Edit in NextSlide"},
                "url": edit_url,
                "action_id": "edit_deck",
            })

        blocks.append({"type": "actions", "elements": buttons})

        blocks.append({
            "type": "context",
            "elements": [
                {"type": "mrkdwn", "text": f"Created with <{FRONTEND_URL}|NextSlide>"},
            ],
        })

        return blocks

    # ── Error ───────────────────────────────────────────────────────────

    @staticmethod
    def error_message(message: str) -> List[Dict]:
        return [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": f":warning: {message}",
                },
            }
        ]

    # ── Account linking prompt ──────────────────────────────────────────

    @staticmethod
    def account_link_prompt(install_url: str) -> List[Dict]:
        return [
            {
                "type": "section",
                "text": {
                    "type": "mrkdwn",
                    "text": (
                        "Your Slack account isn't linked to a NextSlide account yet.\n"
                        "Link your account to start generating decks."
                    ),
                },
                "accessory": {
                    "type": "button",
                    "text": {"type": "plain_text", "text": "Link Account"},
                    "url": f"{FRONTEND_URL}/profile?tab=integrations",
                    "action_id": "link_account",
                },
            }
        ]

    # ── Link unfurl ─────────────────────────────────────────────────────

    @staticmethod
    def link_unfurl(
        title: str,
        slide_count: int,
        thumbnail_url: Optional[str] = None,
        author_name: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Build an unfurl attachment for a nextslide.ai/p/* URL."""
        unfurl: Dict[str, Any] = {
            "title": title,
            "text": f"{slide_count} slide{'s' if slide_count != 1 else ''}",
            "color": "#6366f1",
        }
        if thumbnail_url:
            unfurl["image_url"] = thumbnail_url
        if author_name:
            unfurl["author_name"] = author_name
        return unfurl
