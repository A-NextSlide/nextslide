"""
Configuration settings for the agents package.
"""

import os
from typing import Optional

# Model configurations
################################
# Model Configuration
################################

#==============================================================================
# DECK GENERATION MODELS
#==============================================================================

# Prefer stronger model for theme quality; fallback remains available via clients map
THEME_STYLE_MODEL = "claude-sonnet-4-5"
COMPOSER_MODEL = "claude-sonnet-4-5"
VISUAL_LAYOUT_ANALYZER_MODEL = "claude-3-7-sonnet"
OUTLINE_PLANNING_MODEL = "perplexity-sonar"
OUTLINE_CONTENT_MODEL = "perplexity-sonar"
OUTLINE_RESEARCH_MODEL = "claude-sonnet-4-5"
OUTLINE_OPENAI_SEARCH_MODEL = "gpt-4o-mini"

#==============================================================================
# PERPLEXITY CONFIGURATION
#==============================================================================

# Toggle to enable Perplexity for single-pass outline generation (no env dependency)
USE_PERPLEXITY_FOR_OUTLINE = True
PERPLEXITY_OUTLINE_MODEL = 'perplexity-sonar-pro'

# Toggle to prefer Perplexity for research/search (no env dependency)
USE_PERPLEXITY_FOR_RESEARCH = True
PERPLEXITY_RESEARCH_MODEL = 'perplexity-sonar'

# Image search provider switch: "serpapi" or "perplexity"
IMAGE_SEARCH_PROVIDER = 'serpapi'

# Perplexity model to use when IMAGE_SEARCH_PROVIDER == "perplexity"
# Accepts aliases defined in agents.ai.clients.MODELS (e.g., "perplexity-sonar", "perplexity-sonar-pro")
PERPLEXITY_IMAGE_MODEL = 'perplexity-sonar'

#==============================================================================
# DECK EDITING MODELS
#==============================================================================

ORCHESTRATOR_MODEL = "claude-3-7-sonnet"
DECK_EDITOR_MODEL = "claude-3-7-sonnet"
CONTEXT_BUILDER_MODEL = "claude-3-7-sonnet"
SLIDE_STYLE_MODEL = "claude-3-7-sonnet"

#==============================================================================
# SPECIALIZED MODELS
#==============================================================================

QUALITY_EVALUATOR_MODEL = "claude-3-7-sonnet"
FILE_ANALYSIS_MODEL = "gpt-4.1"
OPENAI_IMAGE_MODEL = "gpt-image-1"
GEMINI_IMAGE_MODEL = "gemini-2.5-flash-image-preview"

#==============================================================================
# IMAGE GENERATION PROVIDER SWITCH
#==============================================================================

# Select which provider handles ALL image generation: "gemini" or "openai"
IMAGE_PROVIDER = 'gemini'

# Default transparency behavior (can be overridden per-call)
# - FULL images in slides generally should NOT be transparent
# - SUPPORTING assets (icons/overlays) often SHOULD be transparent
IMAGE_TRANSPARENT_DEFAULT_FULL = False
IMAGE_TRANSPARENT_DEFAULT_SUPPORTING = True
OPENAI_EMBEDDINGS_MODEL = "text-embedding-3-small"

#==============================================================================
# IMAGE GENERATION TOGGLES
#==============================================================================

# Disable AI image generation during slide generation; use placeholders instead
IMAGE_GENERATION_ENABLED = False

# Do not auto-apply pending searched images to placeholders on the backend
AUTO_APPLY_PENDING_IMAGES = False

#==============================================================================
# STREAMING CONFIGURATION
#==============================================================================

# Enable streaming for slide generation (solves token limit issues)
ENABLE_STREAMING = True

# How often to update Supabase during streaming (in seconds)
STREAMING_UPDATE_INTERVAL = 5.0

# Minimum components before updating Supabase
STREAMING_MIN_COMPONENTS_UPDATE = 2

#==============================================================================
# GEMINI CONFIGURATION (Still needed by outline service)
#==============================================================================

USE_GEMINI_FOR_OUTLINE = False
GEMINI_OUTLINE_MODEL = "gemini-2.5-flash-lite"
GEMINI_ENABLE_URL_SEARCH = True  # Enable Google Search grounding for content enhancement
GEMINI_STRUCTURED_OUTPUT_ONLY = True

# Override models when Gemini is enabled
if USE_GEMINI_FOR_OUTLINE:
    OUTLINE_PLANNING_MODEL = GEMINI_OUTLINE_MODEL
    OUTLINE_CONTENT_MODEL = GEMINI_OUTLINE_MODEL

#==============================================================================
# THEME GENERATION SWITCHES
#==============================================================================

# Use the new agent-based theming system (ThemeDirector). Falls back to legacy
# ThemeStyleManager when disabled or on failure. Default ON.
USE_AGENT_THEMER = os.getenv('USE_AGENT_THEMER', 'true').lower() == 'true'

#==============================================================================
# CACHE CONFIGURATION (Still needed by cache.py)
#==============================================================================

CACHE_DIR = "/tmp/chat-api-cache"
USE_CACHE = False

# Enable Anthropic prompt caching for Claude models (5-minute TTL via ephemeral cache blocks)
# When enabled, Claude calls send system as content blocks with cache_control
ENABLE_ANTHROPIC_PROMPT_CACHING = True

# Prewarm the Anthropic prompt cache (writes the static prefix once before fan-out)
ENABLE_PROMPT_CACHE_PREWARM = True

# Log Anthropic cache metrics (cache_read_input_tokens, cache_creation_input_tokens)
LOG_ANTHROPIC_CACHE_METRICS = True

# Emit a tiny Anthropic probe call after typed Claude calls to log cache metrics
# This adds a minimal extra request per slide when Claude is used
ENABLE_CACHE_METRICS_PROBE = True

#==============================================================================
# RATE LIMIT & PARALLELISM CONFIGURATION
#==============================================================================

# Generation configuration
MAX_WORKERS = int(os.getenv('MAX_WORKERS', '10'))
MAX_PARALLEL_SLIDES = int(os.getenv('MAX_PARALLEL_SLIDES', '10'))
DELAY_BETWEEN_SLIDES = float(os.getenv('DELAY_BETWEEN_SLIDES', '0.1'))  # Reduced to minimize delays
STRICT_MODE = os.getenv('STRICT_MODE', 'false').lower() == 'true'
AI_THREAD_TIMEOUT = int(os.getenv('AI_THREAD_TIMEOUT', '60'))  # Default 60 seconds

# Visual analysis configuration
ENABLE_VISUAL_ANALYSIS = os.getenv('ENABLE_VISUAL_ANALYSIS', 'false').lower() == 'true'  # Default to False for testing

# Image handling

#==============================================================================
# VISUAL VALIDATION CONFIGURATION
#==============================================================================

# Enable visual layout validation using frontend renderer + Claude
# When enabled, each generated slide is rendered and analyzed for:
# - Text overflow/cropping issues
# - Elements too close to edges
# - Overlapping components
# - Poor spacing/alignment
ENABLE_VISUAL_VALIDATION = True  # Set to False to disable visual validation API calls

#==============================================================================
# PRODUCTION CONCURRENCY CONFIGURATION
#==============================================================================

# Global system-wide limits
MAX_GLOBAL_CONCURRENT_SLIDES = 50  # Total slides generating across ALL users
MAX_API_CONCURRENT_CALLS = 10      # Concurrent calls to OpenAI/Claude APIs

# Per-user limits
MAX_SLIDES_PER_USER = 10            # Max slides one user can generate in parallel
MAX_DECKS_PER_USER = 4             # Max concurrent deck generations per user

# Rate limiting
API_CALLS_PER_MINUTE = 60          # API calls per minute (global)
API_CALLS_PER_HOUR = 1000          # API calls per hour (global)

# Timeouts
SLIDE_GENERATION_TIMEOUT = 300      # Timeout for single slide generation (seconds)
DECK_GENERATION_TIMEOUT = 600      # Timeout for full deck generation (seconds)

# Background generation
CONTINUE_GENERATION_ON_DISCONNECT = True  # Continue generating even if user leaves
CLEANUP_COMPLETED_AFTER = 3600     # Clean up completed generations after 1 hour (seconds)
