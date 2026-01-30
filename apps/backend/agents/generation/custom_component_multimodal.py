"""Multimodal helpers for CustomComponent generation."""

from __future__ import annotations

import base64
from typing import Any, Dict, List, Tuple, Union

import requests

from agents.generation.custom_component_helpers import (
    _compress_image_for_multimodal,
    _estimate_token_count,
)
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

MAX_TOTAL_IMAGE_TOKENS = 200_000
MAX_REFERENCE_IMAGES = 3


async def build_multimodal_user_content(
    user_prompt: str,
    reference_images: List[str] | None,
) -> Tuple[Union[str, List[Dict[str, Any]]], int]:
    """Build a user message payload with optional multimodal reference images."""
    if not reference_images:
        return user_prompt, 0

    user_content_parts: List[Dict[str, Any]] = [
        {
            "type": "text",
            "text": "Design references for style guidance. Match the overall look and layout cues.",
        }
    ]

    total_image_tokens = 0
    images_added = 0

    for idx, img_url in enumerate(reference_images[:MAX_REFERENCE_IMAGES]):
        if total_image_tokens >= MAX_TOTAL_IMAGE_TOKENS:
            logger.warning(
                "[CUSTOM_COMPONENT] Skipping reference images; token budget exhausted (%s tokens)",
                total_image_tokens,
            )
            break

        try:
            if img_url.startswith("data:"):
                logger.info(
                    "[CUSTOM_COMPONENT] Skipping data URL reference image %s to avoid prompt bloat",
                    idx + 1,
                )
                continue

            resp = requests.get(
                img_url,
                timeout=10,
                headers={
                    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
                    "Accept": "image/*",
                },
            )
            if resp.status_code != 200:
                logger.warning(
                    "[CUSTOM_COMPONENT] Failed to download reference image %s: HTTP %s",
                    idx + 1,
                    resp.status_code,
                )
                continue

            compressed_data, media_type = _compress_image_for_multimodal(resp.content)
            img_b64 = base64.b64encode(compressed_data).decode("utf-8")
            new_tokens = _estimate_token_count(img_b64)

            if total_image_tokens + new_tokens > MAX_TOTAL_IMAGE_TOKENS:
                logger.warning(
                    "[CUSTOM_COMPONENT] Skipping image %s; would exceed token budget",
                    idx + 1,
                )
                continue

            total_image_tokens += new_tokens
            user_content_parts.append(
                {
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": media_type,
                        "data": img_b64,
                    },
                }
            )
            user_content_parts.append(
                {
                    "type": "text",
                    "text": f"[Design Reference {idx + 1} - MATCH THIS STYLE EXACTLY]",
                }
            )
            images_added += 1
            logger.info(
                "[CUSTOM_COMPONENT] Added URL reference image %s (%s tokens)",
                idx + 1,
                new_tokens,
            )
        except Exception as exc:
            logger.warning("[CUSTOM_COMPONENT] Failed to load reference image %s: %s", img_url[:50], exc)

    user_content_parts.append({"type": "text", "text": user_prompt})

    if images_added == 0:
        return user_prompt, 0

    logger.info(
        "[CUSTOM_COMPONENT] Created multimodal message with %s images (%s tokens)",
        images_added,
        total_image_tokens,
    )
    return user_content_parts, images_added
