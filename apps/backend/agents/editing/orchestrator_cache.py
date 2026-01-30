"""
Gemini context caching for the orchestrator.

Caches the static parts of the orchestrator prompt:
- System prompt (~3.7k tokens)
- Tool descriptions (~2.7k tokens)
Total: ~6.4k tokens cached, sent only once

This provides:
- 75-90% cost reduction on cached tokens
- Faster response times (less to process)
"""

import os
import logging
import hashlib
from typing import Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Import the static prompts (agents.md or legacy)
from agents.config import USE_AGENTS_MD
from agents.editing.orchestrator_v2 import SYSTEM_PROMPT, TOOL_DESCRIPTIONS

if USE_AGENTS_MD:
    from agents.editing.orchestrator_v2 import AGENTS_MD_PROMPT, TOOLS_REFERENCE

# ═══════════════════════════════════════════════════════════════════════════════
# CACHE CONFIGURATION
# ═══════════════════════════════════════════════════════════════════════════════

# Cache TTL: 24 hours (prompts rarely change)
ORCHESTRATOR_CACHE_TTL = 86400

# Combined static content to cache (uses agents.md prompt when enabled)
if USE_AGENTS_MD:
    ORCHESTRATOR_STATIC_CONTENT = f"""{AGENTS_MD_PROMPT}

{TOOLS_REFERENCE}"""
else:
    ORCHESTRATOR_STATIC_CONTENT = f"""{SYSTEM_PROMPT}

{TOOL_DESCRIPTIONS}"""


# ═══════════════════════════════════════════════════════════════════════════════
# CACHE STATE
# ═══════════════════════════════════════════════════════════════════════════════

_orchestrator_cache_name: Optional[str] = None
_cache_created_at: Optional[datetime] = None


def _get_cache_key() -> str:
    """Generate a cache key based on the static content."""
    return hashlib.md5(ORCHESTRATOR_STATIC_CONTENT.encode()).hexdigest()[:12]


# ═══════════════════════════════════════════════════════════════════════════════
# CACHE MANAGEMENT
# ═══════════════════════════════════════════════════════════════════════════════

def get_or_create_orchestrator_cache() -> Optional[str]:
    """
    Get or create a Gemini context cache for the orchestrator.

    Returns the cache name if successful, None otherwise.
    The cache contains SYSTEM_PROMPT + TOOL_DESCRIPTIONS.
    """
    global _orchestrator_cache_name, _cache_created_at

    # Return existing cache if valid
    if _orchestrator_cache_name and _cache_created_at:
        age = (datetime.now(timezone.utc) - _cache_created_at).total_seconds()
        if age < ORCHESTRATOR_CACHE_TTL - 300:  # 5 min buffer
            return _orchestrator_cache_name

    try:
        from google.genai import Client as Gemini
        from google.genai import types as genai_types

        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        if not api_key:
            logger.warning("[OrchestratorCache] No Gemini API key found")
            return None

        client = Gemini(api_key=api_key)
        cache_key = _get_cache_key()
        display_name = f"nextslide_orchestrator_{cache_key}"

        # Check for existing cache
        try:
            for existing_cache in client.caches.list():
                if existing_cache.display_name == display_name:
                    _orchestrator_cache_name = existing_cache.name
                    _cache_created_at = datetime.now(timezone.utc)
                    logger.info(f"[OrchestratorCache] Reusing existing cache: {_orchestrator_cache_name}")
                    return _orchestrator_cache_name
        except Exception as e:
            logger.debug(f"[OrchestratorCache] Error listing caches: {e}")

        # Create new cache with system instruction
        cache = client.caches.create(
            model="models/gemini-3-flash",  # Must match orchestrator model
            config=genai_types.CreateCachedContentConfig(
                display_name=display_name,
                system_instruction=ORCHESTRATOR_STATIC_CONTENT,
                ttl=f"{ORCHESTRATOR_CACHE_TTL}s",
            )
        )

        _orchestrator_cache_name = cache.name
        _cache_created_at = datetime.now(timezone.utc)

        logger.info(f"[OrchestratorCache] Created new cache: {_orchestrator_cache_name}")
        return _orchestrator_cache_name

    except Exception as e:
        logger.error(f"[OrchestratorCache] Failed to create cache: {e}")
        return None


def invalidate_orchestrator_cache():
    """Invalidate the orchestrator cache (e.g., after prompt changes)."""
    global _orchestrator_cache_name, _cache_created_at
    _orchestrator_cache_name = None
    _cache_created_at = None
    logger.info("[OrchestratorCache] Cache invalidated")


def warmup_orchestrator_cache():
    """Pre-create the orchestrator cache on startup."""
    try:
        cache_name = get_or_create_orchestrator_cache()
        if cache_name:
            logger.info(f"[OrchestratorCache] Warmed up: {cache_name}")
        else:
            logger.warning("[OrchestratorCache] Warmup failed")
    except Exception as e:
        logger.error(f"[OrchestratorCache] Warmup error: {e}")


# ═══════════════════════════════════════════════════════════════════════════════
# CACHED INVOKE
# ═══════════════════════════════════════════════════════════════════════════════

def invoke_with_cache(
    user_content,
    response_model,
    max_tokens: int = 4096,
    temperature: float = 0.7,
):
    """
    Invoke the orchestrator LLM using the cached system prompt.

    Args:
        user_content: The dynamic user content (context + message)
        response_model: Pydantic model for structured output
        max_tokens: Max output tokens
        temperature: Sampling temperature

    Returns:
        Parsed response_model instance, or None if cache unavailable
    """
    import json

    cache_name = get_or_create_orchestrator_cache()
    if not cache_name:
        return None

    try:
        from google.genai import Client as Gemini
        from google.genai import types as genai_types

        api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
        client = Gemini(api_key=api_key)

        # Handle multimodal content (screenshot)
        if isinstance(user_content, list):
            # Convert to Gemini format
            parts = []
            for item in user_content:
                if item.get("type") == "image":
                    source = item.get("source", {})
                    if source.get("type") == "base64":
                        parts.append({
                            "inline_data": {
                                "mime_type": source.get("media_type", "image/jpeg"),
                                "data": source.get("data")
                            }
                        })
                elif item.get("type") == "text":
                    parts.append({"text": item.get("text", "")})
            contents = parts
        else:
            contents = user_content

        # Get schema for structured output
        schema = None
        try:
            schema = response_model.model_json_schema()
        except Exception:
            pass

        # Build config
        config = genai_types.GenerateContentConfig(
            cached_content=cache_name,
            response_mime_type="application/json",
            temperature=temperature,
            max_output_tokens=max_tokens,
        )

        # Add schema hint to prompt if we have it
        if schema and isinstance(contents, str):
            contents = f"{contents}\n\nRespond with JSON matching this schema:\n{json.dumps(schema, ensure_ascii=False)}"

        response = client.models.generate_content(
            model="models/gemini-3-flash",
            contents=contents,
            config=config,
        )

        # Log cache usage
        if hasattr(response, 'usage_metadata'):
            cached_tokens = getattr(response.usage_metadata, 'cached_content_token_count', 0)
            total_tokens = getattr(response.usage_metadata, 'prompt_token_count', 0)
            if cached_tokens > 0:
                logger.info(f"[OrchestratorCache] Used {cached_tokens}/{total_tokens} cached tokens")

        # Parse response
        text = response.text.strip()

        # Clean up JSON
        if text.startswith("```"):
            text = text.split("```")[1]
            if text.startswith("json"):
                text = text[4:]
            text = text.strip()

        try:
            return response_model.model_validate_json(text)
        except Exception:
            return response_model.parse_raw(text)

    except Exception as e:
        logger.error(f"[OrchestratorCache] Invoke error: {e}")
        return None
