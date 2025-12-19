"""Shared LLM helpers for tool modules."""

import logging
from typing import Any, List, Optional

from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK

logger = logging.getLogger(__name__)


def get_model_and_client(task: str, *, log_prefix: str = "TOOLS"):
    """Get model and client, handling rate limits."""
    model = get_model(task)

    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[{log_prefix}] Gemini in cooldown, using fallback: {model}")

    return get_client(model)


def invoke_with_fallback(
    client: Any,
    model: str,
    messages: List[dict],
    response_model: Optional[Any] = None,
    max_tokens: int = 8000,
    *,
    log_prefix: str = "TOOLS",
):
    """Invoke LLM with automatic fallback on rate limit."""
    try:
        return invoke(
            client=client,
            model=model,
            messages=messages,
            response_model=response_model,
            max_tokens=max_tokens,
        )
    except Exception as e:
        error_str = str(e).lower()
        # Only fallback on actual rate limits, not other errors
        is_rate_limit = ('429' in error_str or 'rate limit' in error_str or 'quota exceeded' in error_str)
        is_not_filesystem = 'errno' not in error_str and 'file name' not in error_str

        if is_rate_limit and is_not_filesystem:
            logger.warning(f"[{log_prefix}] Rate limited, trying fallback")
            mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            return invoke(
                client=fallback_client,
                model=fallback_model,
                messages=messages,
                response_model=response_model,
                max_tokens=max_tokens,
            )
        raise
