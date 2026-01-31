"""
Rate limit configuration for API calls.

Adjust these settings based on your API tier and usage patterns.
"""

# =============================================================================
# Public Developer API v1 Rate Limits
# =============================================================================

# Per-API-key concurrency: max simultaneous deck generations
API_MAX_CONCURRENT_PER_KEY = 20

# Per-API-key request rate: requests per minute
API_RATE_LIMIT = "60/minute"

# Stale generation cleanup: mark decks stuck in 'generating' as failed after N minutes
API_STALE_GENERATION_TIMEOUT_MINUTES = 15

# Periodic cleanup interval (seconds)
API_STALE_CLEANUP_INTERVAL_SECONDS = 300  # 5 minutes

# Request deduplication window (seconds)
API_DEDUP_WINDOW_SECONDS = 60

# Anthropic API rate limits (adjust based on your tier)
ANTHROPIC_RATE_LIMITS = {
    "input_tokens_per_minute": 400000,  # Default tier
    "output_tokens_per_minute": 80000,
    "requests_per_minute": 4000,
}

# Recommended settings for parallel generation to avoid rate limits
RATE_LIMIT_SAFE_SETTINGS = {
    "max_parallel": 6,  # Reduced from 3 to be safer
    "delay_between_slides": 1.0,  # 1 second delay between starting each slide
    "retry_delay": 5.0,  # Wait 5 seconds before retrying after rate limit
}

# Settings for different usage scenarios
USAGE_PROFILES = {
    "conservative": {
        "max_parallel": 1,
        "delay_between_slides": 2.0,
        "description": "Sequential generation with delays - slowest but safest"
    },
    "balanced": {
        "max_parallel": 2,
        "delay_between_slides": 1.0,
        "description": "Some parallelism with moderate delays - good balance"
    },
    "aggressive": {
        "max_parallel": 3,
        "delay_between_slides": 0.5,
        "description": "Maximum parallelism - fastest but may hit rate limits"
    },
    "custom": {
        "max_parallel": None,  # Use user-provided values
        "delay_between_slides": None,
        "description": "User-defined settings"
    }
} 