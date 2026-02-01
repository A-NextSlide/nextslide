"""
Rate limit configuration for API calls.

Adjust these settings based on your API tier and usage patterns.
"""

# =============================================================================
# Tool Page Generation Rate Limits (unauthenticated)
# =============================================================================

TOOL_GENERATION_RATE_LIMIT = "5/hour"
TOOL_GENERATION_BURST_LIMIT = "2/minute"

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

# =============================================================================
# Authenticated Endpoint Rate Limits
# =============================================================================

# Chat / streaming generation endpoints
CHAT_RATE_LIMIT = "30/minute"
CHAT_BURST_LIMIT = "5/10seconds"

# Deck creation / composition
DECK_CREATION_RATE_LIMIT = "10/minute"

# File upload and analysis
FILE_UPLOAD_RATE_LIMIT = "20/minute"
FILE_ANALYSIS_RATE_LIMIT = "15/minute"

# Authentication endpoints (login, signup, password reset)
AUTH_RATE_LIMIT = "10/minute"
AUTH_SIGNUP_RATE_LIMIT = "5/hour"
AUTH_PASSWORD_RESET_RATE_LIMIT = "3/hour"

# Admin endpoints
ADMIN_RATE_LIMIT = "60/minute"

# Sharing and collaboration
SHARING_RATE_LIMIT = "30/minute"

# Public/unauthenticated endpoints
PUBLIC_DECK_VIEW_RATE_LIMIT = "60/minute"
PUBLIC_SEARCH_RATE_LIMIT = "20/minute"

# =============================================================================
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