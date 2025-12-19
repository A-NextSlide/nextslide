"""Centralized configuration - ALL model names and settings in one place."""

import os
from dotenv import load_dotenv
load_dotenv()

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL DEFINITIONS
# ═══════════════════════════════════════════════════════════════════════════════

# Gemini Models
GEMINI_FLASH = "gemini-2.5-flash"
GEMINI_FLASH_LITE = "gemini-2.5-flash-lite"
GEMINI_PRO = "gemini-2.5-pro"
GEMINI_3_PRO = "gemini-3-pro-preview"
GEMINI_3_FLASH = "gemini-3-flash-preview"  # Available but not used yet
GEMINI_IMAGE = "gemini-2.0-flash-exp"

# Claude Models
CLAUDE_OPUS = "claude-opus-4-5"
CLAUDE_SONNET = "claude-sonnet-4-5"
CLAUDE_HAIKU = "claude-haiku-4-5"

# Full IDs for raw API calls
CLAUDE_OPUS_ID = "claude-opus-4-5-20251101"
CLAUDE_SONNET_ID = "claude-sonnet-4-5-20250929"
CLAUDE_HAIKU_ID = "claude-haiku-4-5-20251001"

# OpenAI Models
GPT_4O_MINI = "gpt-4o-mini"
GPT_4_1 = "gpt-4.1"
OPENAI_IMAGE = "gpt-image-1"
OPENAI_EMBEDDINGS = "text-embedding-3-small"

# Perplexity Models
PERPLEXITY_SONAR = "perplexity-sonar"
PERPLEXITY_SONAR_PRO = "perplexity-sonar-pro"

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL STRATEGY
# ═══════════════════════════════════════════════════════════════════════════════

# HARD should be the highest-quality model for creative + reasoning work.
# We want Gemini 3 Pro for slide/design generation & editing.
MODEL_HARD = GEMINI_3_PRO
MODEL_EASY = CLAUDE_HAIKU      # Fast/simple tasks
MODEL_FALLBACK = CLAUDE_OPUS   # Rate limit fallback
MODEL_RESEARCH = PERPLEXITY_SONAR_PRO  # Web search

def get_model(task: str) -> str:
    """Get model for a task. Single source of truth."""
    return TASK_MODELS.get(task, MODEL_EASY)

# ═══════════════════════════════════════════════════════════════════════════════
# TASK → MODEL MAPPING
# ═══════════════════════════════════════════════════════════════════════════════

TASK_MODELS = {
    # Orchestration (tool routing) - Haiku is fast and smart enough
    "orchestrator": MODEL_EASY,

    # Generation (creative) - Gemini 3 Pro
    "slide_generate": MODEL_HARD,
    "component_create": MODEL_HARD,
    "component_edit": MODEL_HARD,
    "custom_component_rewrite": GEMINI_3_FLASH,
    "theme_generate": MODEL_HARD,
    "slide_style": MODEL_HARD,

    # Simple tasks - Haiku
    "composer_route": MODEL_EASY,
    "validation": MODEL_EASY,
    "context_build": MODEL_EASY,
    "brand_detect": MODEL_EASY,
    "font_select": MODEL_EASY,
    "image_search": MODEL_EASY,
    "chat": MODEL_EASY,
    "file_analysis_fast": MODEL_EASY,
    "vision_import": GEMINI_FLASH_LITE,

    # Research - Perplexity
    "outline_research": MODEL_RESEARCH,

    # Fallback
    "fallback": MODEL_FALLBACK,
}

# ═══════════════════════════════════════════════════════════════════════════════
# LEGACY ALIASES (for backwards compatibility - will be removed)
# ═══════════════════════════════════════════════════════════════════════════════

# Deck Generation
THEME_MODEL = MODEL_EASY
COMPOSER_MODEL = MODEL_EASY
VISUAL_ANALYZER_MODEL = MODEL_EASY

# Outline Generation
OUTLINE_MODEL = MODEL_RESEARCH
OUTLINE_PRESENTATION_MODEL = MODEL_EASY
OUTLINE_RESEARCH_MODEL = MODEL_EASY
OUTLINE_AGENT_MODEL = GEMINI_3_FLASH  # Fast Gemini model with function calling

# Deck Editing
ORCHESTRATOR_MODEL = MODEL_EASY  # Changed from Opus to Haiku
DECK_EDITOR_MODEL = MODEL_HARD
CONTEXT_BUILDER_MODEL = MODEL_EASY
SLIDE_STYLE_MODEL = MODEL_HARD

# Custom Components
CUSTOM_COMPONENT_COMPOSER = MODEL_EASY
CUSTOM_COMPONENT_CREATIVE = MODEL_HARD
CUSTOM_COMPONENT_FALLBACK = MODEL_FALLBACK
# Prefer Gemini 3 Pro for CustomComponentGenerator (raw HTML generation works well even when structured output is finicky)
CUSTOM_COMPONENT_MODEL = GEMINI_3_PRO
CUSTOM_COMPONENT_FALLBACK_MODEL = MODEL_FALLBACK
CUSTOM_COMPONENT_EDIT_MODEL = GEMINI_3_FLASH
CUSTOM_COMPONENT_SIMPLE_MODEL = MODEL_EASY
CUSTOM_COMPONENT_TEMPERATURE = 0.8

# Editing Quality Control
EDIT_QUALITY_THRESHOLD = 3.0
EDIT_MAX_RETRIES = 2
EDIT_VALIDATE_HTML = True

# Vision/Import
VISION_IMPORT_MODEL = GEMINI_FLASH_LITE
FILE_ANALYSIS_MODEL = GPT_4_1

# Image Generation
IMAGE_PROVIDER = "gemini"
IMAGE_MODEL_GEMINI = GEMINI_IMAGE
IMAGE_MODEL_OPENAI = OPENAI_IMAGE

# Quality/Validation
QUALITY_EVALUATOR_MODEL = MODEL_EASY
VISUAL_VALIDATION_MODEL = MODEL_EASY

# Fast/Cheap AI Tasks
FAST_AI_MODEL = MODEL_EASY
CHAT_MODEL = MODEL_EASY
FILE_ANALYSIS_MODEL_FAST = MODEL_EASY
IMAGE_SEARCH_MODEL = MODEL_EASY
BRAND_DETECTION_MODEL = MODEL_EASY
FONT_SELECTION_MODEL = MODEL_EASY

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

IMAGE_GENERATION_ENABLED = False
AUTO_APPLY_PENDING_IMAGES = False
IMAGE_TRANSPARENT_DEFAULT_FULL = False
IMAGE_TRANSPARENT_DEFAULT_SUPPORTING = True

# ═══════════════════════════════════════════════════════════════════════════════
# PERFORMANCE & LIMITS
# ═══════════════════════════════════════════════════════════════════════════════

MAX_WORKERS = int(os.getenv('MAX_WORKERS', '50'))
MAX_PARALLEL_SLIDES = int(os.getenv('MAX_PARALLEL_SLIDES', '50'))
DELAY_BETWEEN_SLIDES = float(os.getenv('DELAY_BETWEEN_SLIDES', '0.05'))
AI_THREAD_TIMEOUT = int(os.getenv('AI_THREAD_TIMEOUT', '120'))

STREAMING_UPDATE_INTERVAL = 5.0
STREAMING_MIN_COMPONENTS_UPDATE = 2

MAX_GLOBAL_CONCURRENT_SLIDES = 200
MAX_API_CONCURRENT_CALLS = 25
MAX_SLIDES_PER_USER = 50
MAX_DECKS_PER_USER = 10
API_CALLS_PER_MINUTE = 2000
API_CALLS_PER_HOUR = 100000

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
# DEPRECATED ALIASES (keeping for backwards compatibility)
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
CLAUDE_SONNET_4 = "claude-sonnet-4"
CLAUDE_SONNET_4_ID = "claude-sonnet-4-20250514"

# Startup log
print(f"[CONFIG] Strategy: HARD={MODEL_HARD} | EASY={MODEL_EASY} | FALLBACK={MODEL_FALLBACK}")
