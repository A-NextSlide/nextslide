"""
Fast-path utilities for message classification.

IMPORTANT: We NO LONGER bypass the orchestrator for any messages.
All messages (chat and edit) go through the full orchestrator with tools.
Classification is used ONLY for model selection (Flash vs Pro).

This provides the ChatGPT/Claude Code experience where the assistant:
- Always has full presentation context
- Can chat AND edit in the same conversation
- Uses tools intelligently based on user intent
- Understands conversation history
"""

import logging
from typing import Optional

from agents.editing.classifier import MessageClassification

logger = logging.getLogger(__name__)


def should_include_screenshot(classification: MessageClassification) -> bool:
    """Determine if screenshot should be included based on classification."""
    return classification.needs_screenshot


def should_include_full_context(classification: MessageClassification) -> bool:
    """Determine if full deck context should be included."""
    # Always include full context now - the orchestrator needs it
    return True


# ═══════════════════════════════════════════════════════════════════════════════
# WARMUP
# ═══════════════════════════════════════════════════════════════════════════════

def warmup_fast_path():
    """Warmup caches on server startup."""
    from agents.editing.classifier import warmup_classifier_cache
    from agents.editing.orchestrator_cache import warmup_orchestrator_cache

    logger.info("[FastPath] Warming up caches...")
    warmup_classifier_cache()
    warmup_orchestrator_cache()
    logger.info("[FastPath] Cache warmup complete")
