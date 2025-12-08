"""
Global rate limit cooldown tracker for AI providers.

When a provider hits rate limits, we track the timestamp and skip that provider
for a cooldown period, falling back to alternatives immediately.

This avoids making users wait through retries when we know the provider is unavailable.
"""

import time
import threading
from typing import Dict, Optional
from dataclasses import dataclass
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Cooldown duration in seconds (5 minutes)
DEFAULT_COOLDOWN_SECONDS = 300


@dataclass
class RateLimitState:
    """Tracks rate limit state for a provider."""
    last_rate_limited: float = 0.0  # Unix timestamp
    cooldown_seconds: float = DEFAULT_COOLDOWN_SECONDS


class RateLimitTracker:
    """
    Thread-safe tracker for provider rate limit cooldowns.

    Usage:
        tracker = get_rate_limit_tracker()

        if tracker.is_in_cooldown("gemini"):
            # Skip Gemini, use fallback directly
            use_fallback()
        else:
            try:
                call_gemini()
            except RateLimitError:
                tracker.mark_rate_limited("gemini")
                use_fallback()
    """

    def __init__(self):
        self._states: Dict[str, RateLimitState] = {}
        self._lock = threading.Lock()

    def is_in_cooldown(self, provider: str) -> bool:
        """Check if a provider is currently in cooldown."""
        with self._lock:
            state = self._states.get(provider)
            if not state:
                return False

            elapsed = time.time() - state.last_rate_limited
            in_cooldown = elapsed < state.cooldown_seconds

            if in_cooldown:
                remaining = state.cooldown_seconds - elapsed
                logger.debug(f"[RATE_LIMIT] {provider} in cooldown, {remaining:.0f}s remaining")

            return in_cooldown

    def mark_rate_limited(self, provider: str, cooldown_seconds: Optional[float] = None) -> None:
        """Mark a provider as rate limited, starting the cooldown period."""
        with self._lock:
            cooldown = cooldown_seconds or DEFAULT_COOLDOWN_SECONDS
            self._states[provider] = RateLimitState(
                last_rate_limited=time.time(),
                cooldown_seconds=cooldown
            )
            logger.warning(f"[RATE_LIMIT] {provider} rate limited, cooldown for {cooldown}s")
            print(f"[RATE_LIMIT] ⚠️ {provider} rate limited, using fallback for {cooldown/60:.0f} minutes")

    def clear_cooldown(self, provider: str) -> None:
        """Manually clear cooldown for a provider (e.g., after successful call)."""
        with self._lock:
            if provider in self._states:
                del self._states[provider]
                logger.info(f"[RATE_LIMIT] {provider} cooldown cleared")

    def get_cooldown_remaining(self, provider: str) -> float:
        """Get remaining cooldown time in seconds (0 if not in cooldown)."""
        with self._lock:
            state = self._states.get(provider)
            if not state:
                return 0.0

            elapsed = time.time() - state.last_rate_limited
            remaining = state.cooldown_seconds - elapsed
            return max(0.0, remaining)

    def get_status(self) -> Dict[str, Dict]:
        """Get status of all tracked providers."""
        with self._lock:
            status = {}
            for provider, state in self._states.items():
                elapsed = time.time() - state.last_rate_limited
                remaining = max(0.0, state.cooldown_seconds - elapsed)
                status[provider] = {
                    "in_cooldown": remaining > 0,
                    "remaining_seconds": remaining,
                    "cooldown_duration": state.cooldown_seconds
                }
            return status


# Singleton instance
_tracker: Optional[RateLimitTracker] = None
_tracker_lock = threading.Lock()


def get_rate_limit_tracker() -> RateLimitTracker:
    """Get the singleton rate limit tracker instance."""
    global _tracker
    if _tracker is None:
        with _tracker_lock:
            if _tracker is None:
                _tracker = RateLimitTracker()
    return _tracker


# Convenience functions
def is_provider_in_cooldown(provider: str) -> bool:
    """Check if a provider is in cooldown."""
    return get_rate_limit_tracker().is_in_cooldown(provider)


def mark_provider_rate_limited(provider: str, cooldown_seconds: Optional[float] = None) -> None:
    """Mark a provider as rate limited."""
    get_rate_limit_tracker().mark_rate_limited(provider, cooldown_seconds)


def clear_provider_cooldown(provider: str) -> None:
    """Clear cooldown for a provider."""
    get_rate_limit_tracker().clear_cooldown(provider)
