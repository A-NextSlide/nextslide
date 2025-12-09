"""Centralized configuration - ALL model names and settings in one place."""

import os
from dotenv import load_dotenv
load_dotenv()

# ═══════════════════════════════════════════════════════════════════════════════
# GEMINI MODELS
# ═══════════════════════════════════════════════════════════════════════════════
GEMINI_FLASH = "gemini-2.5-flash"           # Fast, cheap, good quality
GEMINI_FLASH_LITE = "gemini-2.5-flash-lite" # Fastest, cheapest
GEMINI_PRO = "gemini-2.5-pro"               # Higher quality
GEMINI_3_PRO = "gemini-3-pro-preview"       # Best quality (expensive) - NOTE: preview model
GEMINI_IMAGE = "gemini-2.0-flash-exp"  # Image generation (native image output)

# ═══════════════════════════════════════════════════════════════════════════════
# CLAUDE MODELS (aliases for get_client())
# ═══════════════════════════════════════════════════════════════════════════════
CLAUDE_OPUS = "claude-opus-4-5"
CLAUDE_SONNET = "claude-sonnet-4-5"
CLAUDE_SONNET_4 = "claude-sonnet-4"  # Legacy Sonnet 4
CLAUDE_HAIKU = "claude-haiku-4-5"

# Full model IDs for raw Anthropic API calls
CLAUDE_OPUS_ID = "claude-opus-4-5-20251101"
CLAUDE_SONNET_ID = "claude-sonnet-4-5-20250929"
CLAUDE_SONNET_4_ID = "claude-sonnet-4-20250514"  # Legacy Sonnet 4
CLAUDE_HAIKU_ID = "claude-haiku-4-5-20251001"

# ═══════════════════════════════════════════════════════════════════════════════
# OPENAI MODELS
# ═══════════════════════════════════════════════════════════════════════════════
GPT_4O_MINI = "gpt-4o-mini"                 # Fast, cheap
GPT_4_1 = "gpt-4.1"                         # Better quality
OPENAI_IMAGE = "gpt-image-1"                # Image generation
OPENAI_EMBEDDINGS = "text-embedding-3-small"

# ═══════════════════════════════════════════════════════════════════════════════
# PERPLEXITY MODELS
# ═══════════════════════════════════════════════════════════════════════════════
PERPLEXITY_SONAR = "perplexity-sonar"       # Standard search
PERPLEXITY_SONAR_PRO = "perplexity-sonar-pro"  # Better search

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL ASSIGNMENTS - What model does what
# ═══════════════════════════════════════════════════════════════════════════════

# Deck Generation
THEME_MODEL = CLAUDE_HAIKU
COMPOSER_MODEL = CLAUDE_HAIKU
VISUAL_ANALYZER_MODEL = CLAUDE_HAIKU

# Outline Generation
OUTLINE_MODEL = PERPLEXITY_SONAR_PRO        # Research/detailed mode
OUTLINE_PRESENTATION_MODEL = CLAUDE_HAIKU   # Presentation mode (narrative)
OUTLINE_RESEARCH_MODEL = CLAUDE_HAIKU
OUTLINE_AGENT_MODEL = CLAUDE_SONNET         # Conversational outline/editing agent

# Deck Editing - All use Gemini 3 Pro (with Opus 4.5 fallback on rate limits)
ORCHESTRATOR_MODEL = CLAUDE_OPUS            # Complex editing decisions (keeps tool-calling stable)
DECK_EDITOR_MODEL = GEMINI_3_PRO            # Component editing
CONTEXT_BUILDER_MODEL = CLAUDE_HAIKU        # Context extraction (fast, simple task)
SLIDE_STYLE_MODEL = GEMINI_3_PRO            # Styling

# Custom Components - Smart Model Routing
# COMPLEX edits (new concepts, redesigns, new sections) → Gemini 3 Pro (best quality, fallback to Opus 4.5)
# MEDIUM edits (partial rewrites, structural changes) → Gemini 2.5 Pro (fast, good quality)
# SIMPLE edits (text/color changes) → str_replace (no AI needed)
CUSTOM_COMPONENT_MODEL = GEMINI_3_PRO              # Complex: new concepts, full redesigns
CUSTOM_COMPONENT_FALLBACK_MODEL = CLAUDE_OPUS      # Fallback when Gemini rate limited
CUSTOM_COMPONENT_EDIT_MODEL = GEMINI_PRO           # Medium: partial rewrites (Gemini 2.5 Pro)
CUSTOM_COMPONENT_SIMPLE_MODEL = CLAUDE_HAIKU       # Simple: suggest str_replace strings
CUSTOM_COMPONENT_TEMPERATURE = 0.8

# Editing Quality Control
EDIT_QUALITY_THRESHOLD = 3.0                       # Minimum quality score (1-5) to accept
EDIT_MAX_RETRIES = 2                               # Max retries on quality/validation failure
EDIT_VALIDATE_HTML = True                          # Validate HTML structure after edits

# Vision/Import
VISION_IMPORT_MODEL = GEMINI_FLASH_LITE     # PPTX slide recreation (fast, cheap)
FILE_ANALYSIS_MODEL = GPT_4_1               # File content analysis

# Image Generation
IMAGE_PROVIDER = "gemini"                   # "gemini" or "openai"
IMAGE_MODEL_GEMINI = GEMINI_IMAGE
IMAGE_MODEL_OPENAI = OPENAI_IMAGE

# Quality/Validation
QUALITY_EVALUATOR_MODEL = CLAUDE_HAIKU
VISUAL_VALIDATION_MODEL = CLAUDE_HAIKU

# Fast/Cheap AI Tasks (file analysis, image search, entity extraction, chat)
FAST_AI_MODEL = CLAUDE_HAIKU                  # Fast tasks where speed > quality
CHAT_MODEL = CLAUDE_HAIKU                     # General chat responses
FILE_ANALYSIS_MODEL_FAST = CLAUDE_HAIKU       # Quick file analysis
IMAGE_SEARCH_MODEL = CLAUDE_HAIKU             # Image query generation
BRAND_DETECTION_MODEL = CLAUDE_HAIKU          # Detect brand names in prompts for theme colors
FONT_SELECTION_MODEL = CLAUDE_HAIKU           # AI font pairing

# ═══════════════════════════════════════════════════════════════════════════════
# FEATURE FLAGS
# ═══════════════════════════════════════════════════════════════════════════════
ENABLE_DEDICATED_CUSTOM_COMPONENT_GEN = True
ENABLE_STREAMING = True
ENABLE_VISUAL_VALIDATION = True
ENABLE_ANTHROPIC_PROMPT_CACHING = True
ENABLE_PROMPT_CACHE_PREWARM = True
LOG_ANTHROPIC_CACHE_METRICS = True
ENABLE_CACHE_METRICS_PROBE = True

USE_PERPLEXITY_FOR_OUTLINE = True
USE_PERPLEXITY_FOR_RESEARCH = True
USE_HYBRID_RESEARCH_MODE = True
USE_AGENT_THEMER = os.getenv('USE_AGENT_THEMER', 'true').lower() == 'true'

IMAGE_GENERATION_ENABLED = False            # Use placeholders during generation
AUTO_APPLY_PENDING_IMAGES = False
IMAGE_TRANSPARENT_DEFAULT_FULL = False
IMAGE_TRANSPARENT_DEFAULT_SUPPORTING = True

# ═══════════════════════════════════════════════════════════════════════════════
# PERFORMANCE & LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
MAX_WORKERS = int(os.getenv('MAX_WORKERS', '10'))
MAX_PARALLEL_SLIDES = int(os.getenv('MAX_PARALLEL_SLIDES', '10'))
DELAY_BETWEEN_SLIDES = float(os.getenv('DELAY_BETWEEN_SLIDES', '0.1'))
AI_THREAD_TIMEOUT = int(os.getenv('AI_THREAD_TIMEOUT', '60'))

STREAMING_UPDATE_INTERVAL = 5.0
STREAMING_MIN_COMPONENTS_UPDATE = 2

# Global limits
MAX_GLOBAL_CONCURRENT_SLIDES = 50
MAX_API_CONCURRENT_CALLS = 10
MAX_SLIDES_PER_USER = 10
MAX_DECKS_PER_USER = 4
API_CALLS_PER_MINUTE = 60
API_CALLS_PER_HOUR = 1000

# Timeouts
SLIDE_GENERATION_TIMEOUT = 300
DECK_GENERATION_TIMEOUT = 600
CONTINUE_GENERATION_ON_DISCONNECT = True
CLEANUP_COMPLETED_AFTER = 3600

# ═══════════════════════════════════════════════════════════════════════════════
# CACHE
# ═══════════════════════════════════════════════════════════════════════════════
CACHE_DIR = "/tmp/chat-api-cache"
USE_CACHE = False

# ═══════════════════════════════════════════════════════════════════════════════
# DEPRECATED - Keep for backwards compatibility, remove later
# ═══════════════════════════════════════════════════════════════════════════════
THEME_STYLE_MODEL = THEME_MODEL
VISUAL_LAYOUT_ANALYZER_MODEL = VISUAL_ANALYZER_MODEL
OUTLINE_PLANNING_MODEL = OUTLINE_MODEL
OUTLINE_CONTENT_MODEL = OUTLINE_MODEL
OUTLINE_OPENAI_SEARCH_MODEL = GPT_4O_MINI
PERPLEXITY_OUTLINE_MODEL = PERPLEXITY_SONAR_PRO
PERPLEXITY_RESEARCH_MODEL = PERPLEXITY_SONAR
PRESENTATION_OUTLINE_MODEL = OUTLINE_PRESENTATION_MODEL
IMAGE_SEARCH_PROVIDER = 'serpapi'
PERPLEXITY_IMAGE_MODEL = PERPLEXITY_SONAR
GEMINI_OUTLINE_MODEL = GEMINI_FLASH_LITE
USE_GEMINI_FOR_OUTLINE = False
GEMINI_ENABLE_URL_SEARCH = True
GEMINI_STRUCTURED_OUTPUT_ONLY = True
STRICT_MODE = os.getenv('STRICT_MODE', 'false').lower() == 'true'
ENABLE_VISUAL_ANALYSIS = os.getenv('ENABLE_VISUAL_ANALYSIS', 'false').lower() == 'true'
GEMINI_IMAGE_MODEL = GEMINI_IMAGE
OPENAI_IMAGE_MODEL = OPENAI_IMAGE
OPENAI_EMBEDDINGS_MODEL = OPENAI_EMBEDDINGS

# Startup log
print(f"[CONFIG] Custom components: {CUSTOM_COMPONENT_MODEL} | Editing: {ORCHESTRATOR_MODEL} | Vision: {VISION_IMPORT_MODEL}")
