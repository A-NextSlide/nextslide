"""AI Client management - provider connections and model routing."""

import os
import json
import re
import logging
import hashlib
from typing import List, Dict, Any
from datetime import datetime
from pathlib import Path
from contextvars import ContextVar
from pydantic import BaseModel
import instructor
import langsmith as ls

logger = logging.getLogger(__name__)

# ═══════════════════════════════════════════════════════════════════════════════
# USER CONTEXT FOR LLM TRACKING
# ═══════════════════════════════════════════════════════════════════════════════
_current_user_id: ContextVar[str] = ContextVar('current_user_id', default=None)

def set_current_user(user_id: str):
    """Set the current user ID for LLM tracking. Call this at request start."""
    _current_user_id.set(user_id)

def get_current_user() -> str:
    """Get the current user ID for LLM tracking."""
    return _current_user_id.get()

# ═══════════════════════════════════════════════════════════════════════════════
# POSTHOG LLM ANALYTICS
# ═══════════════════════════════════════════════════════════════════════════════
_posthog_client = None

def _get_posthog_client():
    """Get or create the PostHog client for LLM analytics."""
    global _posthog_client
    if _posthog_client is None:
        try:
            from posthog import Posthog
            api_key = os.getenv("POSTHOG_API_KEY")
            if api_key:
                _posthog_client = Posthog(
                    api_key,
                    host=os.getenv("POSTHOG_HOST", "https://us.i.posthog.com")
                )
                logger.info("[LLM Analytics] PostHog client initialized")
            else:
                logger.debug("[LLM Analytics] POSTHOG_API_KEY not set, LLM tracking disabled")
        except Exception as e:
            logger.warning(f"[LLM Analytics] Failed to initialize PostHog: {e}")
    return _posthog_client

# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER IMPORTS
# ═══════════════════════════════════════════════════════════════════════════════
try:
    from anthropic import Anthropic
except ImportError:
    Anthropic = None
try:
    from openai import OpenAI
except ImportError:
    OpenAI = None
try:
    from google.genai import Client as Gemini
except ImportError:
    Gemini = None
try:
    from groq import Groq
except ImportError:
    Groq = None

from agents.config import ENABLE_ANTHROPIC_PROMPT_CACHING, LOG_ANTHROPIC_CACHE_METRICS, ENABLE_CACHE_METRICS_PROBE

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL REGISTRY - Maps aliases to (provider, actual_model_name)
# ═══════════════════════════════════════════════════════════════════════════════
MODELS = {
    # Claude
    "claude-opus-4-5": ("anthropic", "claude-opus-4-5-20251101"),
    "claude-sonnet-4-6": ("anthropic", "claude-sonnet-4-6-20260217"),
    "claude-sonnet-4-5": ("anthropic", "claude-sonnet-4-5-20250929"),
    "claude-sonnet-4": ("anthropic", "claude-sonnet-4-20250514"),  # Legacy
    "claude-haiku-4-5": ("anthropic", "claude-haiku-4-5-20251001"),

    # Gemini
    "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
    "gemini-2.5-flash-lite": ("gemini", "gemini-2.5-flash-lite"),
    "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
    "gemini-3-pro": ("gemini", "gemini-3.1-pro-preview"),
    "gemini-3-pro-preview": ("gemini", "gemini-3.1-pro-preview"),
    "gemini-3.1-pro": ("gemini", "gemini-3.1-pro-preview"),
    "gemini-3.1-pro-preview": ("gemini", "gemini-3.1-pro-preview"),
    "gemini-3-flash": ("gemini", "gemini-3-flash-preview"),
    "gemini-3-flash-preview": ("gemini", "gemini-3-flash-preview"),
    "gemini-3.1-flash-image-preview": ("gemini", "gemini-3.1-flash-image-preview"),

    # OpenAI
    "gpt-4o-mini": ("openai", "gpt-4o-mini"),
    "gpt-4.1": ("openai", "gpt-4.1-2025-04-14"),
    "gpt-4.1-mini": ("openai", "gpt-4.1-mini-2025-04-14"),
    "gpt-5": ("openai", "gpt-5"),
    "gpt-5-mini": ("openai", "gpt-5-mini"),
    "gpt-5.2-codex": ("openai", "gpt-5.2-codex"),

    "gpt-5.2": ("openai", "gpt-5.2"),

    # Claude (additional)
    "claude-opus-4-6": ("anthropic", "claude-opus-4-6"),

    # xAI
    "grok-4": ("xai", "grok-4"),
    "grok-4-fast": ("xai", "grok-4-fast"),

    # DeepSeek (additional)
    "deepseek-reasoner": ("deepseek", "deepseek-reasoner"),

    # Perplexity
    "perplexity-sonar": ("perplexity", "sonar"),
    "perplexity-sonar-pro": ("perplexity", "sonar-pro"),

    # DeepSeek
    "deepseek-chat": ("deepseek", "deepseek-chat"),

    # Groq
    "deepseek-r1-distill-llama-70b": ("groq", "deepseek-r1-distill-llama-70b"),
}

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL TOKEN LIMITS
# ═══════════════════════════════════════════════════════════════════════════════
MODEL_MAX_TOKENS = {
    "claude-opus-4-5-20251101": 32000,
    "claude-sonnet-4-6-20260217": 64000,
    "claude-sonnet-4-5-20250929": 64000,
    "claude-sonnet-4-20250514": 64000,  # Legacy
    "claude-haiku-4-5-20251001": 64000,
    "gemini-2.5-flash": 8192,
    "gemini-2.5-flash-lite": 65536,
    "gemini-2.5-pro": 8192,
    "gemini-3-pro-preview": 65536,
    "gemini-3.1-pro-preview": 65536,
    "gemini-3-flash-preview": 65536,
    "gemini-3.1-flash-image-preview": 65536,
    "gpt-4o-mini": 16384,
    "gpt-4.1-2025-04-14": 32768,
    "claude-opus-4-6": 128000,
    "gpt-5": 32768,
    "gpt-5-mini": 16384,
    "gpt-5.2-codex": 32768,
    "gpt-5.2": 32768,
    "grok-4": 32768,
    "grok-4-fast": 32768,
    "deepseek-reasoner": 64000,
}

DEFAULT_SLIDE_MAX_TOKENS = 10000

# Models that need max_completion_tokens instead of max_tokens
MAX_COMPLETION_TOKEN_MODELS = {"o3-mini", "o4-mini", "gpt-5", "gpt-5-mini", "gpt-5.2-codex", "gpt-5.2"}

# ═══════════════════════════════════════════════════════════════════════════════
# MODEL PRICING (USD per 1M tokens) - Updated Jan 2025
# ═══════════════════════════════════════════════════════════════════════════════
MODEL_PRICING = {
    # Anthropic Claude
    "claude-opus-4-5-20251101": {"input": 15.0, "output": 75.0},
    "claude-sonnet-4-6-20260217": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-5-20250929": {"input": 3.0, "output": 15.0},
    "claude-sonnet-4-20250514": {"input": 3.0, "output": 15.0},
    "claude-haiku-4-5-20251001": {"input": 0.80, "output": 4.0},
    # Google Gemini
    "gemini-2.5-flash": {"input": 0.15, "output": 0.60},
    "gemini-2.5-flash-lite": {"input": 0.075, "output": 0.30},
    "gemini-2.5-pro": {"input": 1.25, "output": 10.0},
    "gemini-3-pro-preview": {"input": 1.25, "output": 10.0},
    "gemini-3.1-pro-preview": {"input": 1.25, "output": 10.0},
    "gemini-3-flash-preview": {"input": 0.15, "output": 0.60},
    "gemini-3.1-flash-image-preview": {"input": 0.15, "output": 0.60},
    # OpenAI
    "gpt-4o-mini": {"input": 0.15, "output": 0.60},
    "gpt-4.1-2025-04-14": {"input": 2.0, "output": 8.0},
    "gpt-4.1-mini-2025-04-14": {"input": 0.40, "output": 1.60},
    "gpt-5": {"input": 2.0, "output": 8.0},
    "gpt-5-mini": {"input": 0.40, "output": 1.60},
    "gpt-5.2-codex": {"input": 3.0, "output": 15.0},
    "gpt-5.2": {"input": 2.0, "output": 8.0},
    "claude-opus-4-6": {"input": 5.0, "output": 25.0},
    # xAI
    "grok-4": {"input": 3.0, "output": 15.0},
    "grok-4-fast": {"input": 0.60, "output": 3.0},
    # Mistral
    # DeepSeek
    "deepseek-reasoner": {"input": 0.28, "output": 0.42},
    # Perplexity
    "sonar": {"input": 1.0, "output": 1.0},
    "sonar-pro": {"input": 3.0, "output": 15.0},
    # DeepSeek
    "deepseek-chat": {"input": 0.14, "output": 0.28},
    # Groq
    "deepseek-r1-distill-llama-70b": {"input": 0.75, "output": 0.99},
}

_ANALYTICS_MAX_TEXT_CHARS = 4000
_ANALYTICS_MAX_LIST_ITEMS = 8
_ANALYTICS_MAX_DEPTH = 6


def _sanitize_for_analytics(value: Any, depth: int = 0) -> Any:
    """Strip large/binary payloads (especially base64) from analytics payloads."""
    if depth > _ANALYTICS_MAX_DEPTH:
        return "[truncated-depth]"

    if isinstance(value, str):
        # Detect raw/base64-like long strings
        if len(value) > 512 and re.fullmatch(r"[A-Za-z0-9+/=\s]+", value):
            return f"[omitted-base64:{len(value)} chars]"
        if len(value) > _ANALYTICS_MAX_TEXT_CHARS:
            return value[:_ANALYTICS_MAX_TEXT_CHARS] + f"... [truncated {len(value) - _ANALYTICS_MAX_TEXT_CHARS} chars]"
        return value

    if isinstance(value, dict):
        sanitized: Dict[str, Any] = {}
        for k, v in value.items():
            key_l = str(k).lower()
            if key_l in {"data", "base64", "binary", "bytes"} and isinstance(v, str):
                sanitized[k] = f"[omitted-binary:{len(v)} chars]"
                continue
            if key_l == "source" and isinstance(v, dict):
                src = dict(v)
                if isinstance(src.get("data"), str):
                    src["data"] = f"[omitted-binary:{len(src['data'])} chars]"
                sanitized[k] = _sanitize_for_analytics(src, depth + 1)
                continue
            if key_l == "inline_data" and isinstance(v, dict):
                inline = dict(v)
                if isinstance(inline.get("data"), str):
                    inline["data"] = f"[omitted-binary:{len(inline['data'])} chars]"
                sanitized[k] = _sanitize_for_analytics(inline, depth + 1)
                continue
            sanitized[k] = _sanitize_for_analytics(v, depth + 1)
        return sanitized

    if isinstance(value, list):
        trimmed = value[:_ANALYTICS_MAX_LIST_ITEMS]
        out = [_sanitize_for_analytics(v, depth + 1) for v in trimmed]
        if len(value) > _ANALYTICS_MAX_LIST_ITEMS:
            out.append(f"[{len(value) - _ANALYTICS_MAX_LIST_ITEMS} more items omitted]")
        return out

    return value


def _sanitize_messages_for_analytics(messages: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Return a compact/safe view of chat messages for analytics capture."""
    if not messages:
        return []
    safe_messages: List[Dict[str, Any]] = []
    for msg in messages[:3]:
        if not isinstance(msg, dict):
            safe_messages.append({"role": "unknown", "content": _sanitize_for_analytics(str(msg))})
            continue
        safe_messages.append({
            "role": msg.get("role", "user"),
            "content": _sanitize_for_analytics(msg.get("content")),
        })
    return safe_messages


def _estimate_input_tokens_for_analytics(system_content: Any, messages: List[Dict[str, Any]]) -> int:
    """Estimate token count while excluding huge binary payloads."""
    safe = {
        "system": _sanitize_for_analytics(system_content),
        "messages": _sanitize_messages_for_analytics(messages or []),
    }
    try:
        text = json.dumps(safe, ensure_ascii=False)
    except Exception:
        text = str(safe)
    return max(1, len(text) // 4)


def _calculate_cost(model: str, input_tokens: int, output_tokens: int) -> float:
    """Calculate the cost in USD for a model call."""
    pricing = MODEL_PRICING.get(model, {"input": 0, "output": 0})
    input_cost = (input_tokens / 1_000_000) * pricing["input"]
    output_cost = (output_tokens / 1_000_000) * pricing["output"]
    return input_cost + output_cost

def _track_llm_generation(
    model: str,
    input_tokens: int,
    output_tokens: int,
    latency_seconds: float,
    messages: list = None,
    output: str = None,
    user_id: str = None,
    error: str = None,
    trace_id: str = None,
):
    """Track an LLM generation event in PostHog."""
    posthog = _get_posthog_client()
    if not posthog:
        return

    try:
        cost = _calculate_cost(model, input_tokens, output_tokens)

        # Determine provider from model name
        provider = "unknown"
        if "claude" in model:
            provider = "anthropic"
        elif "gemini" in model:
            provider = "google"
        elif "gpt" in model:
            provider = "openai"
        elif "sonar" in model:
            provider = "perplexity"
        elif "deepseek" in model:
            provider = "deepseek"

        # Generate trace ID if not provided (required for LLM analytics)
        if not trace_id:
            import uuid
            trace_id = str(uuid.uuid4())

        # Get user_id from context if not explicitly provided
        effective_user_id = user_id or get_current_user() or "anonymous"

        safe_messages = _sanitize_messages_for_analytics(messages or [])
        safe_output = _sanitize_for_analytics(str(output) if output else "")
        if isinstance(safe_output, str) and len(safe_output) > 1000:
            safe_output = safe_output[:1000] + "... [truncated]"

        properties = {
            "$ai_trace_id": trace_id,  # Required for PostHog LLM Analytics
            "$ai_model": model,
            "$ai_provider": provider,
            "$ai_input_tokens": input_tokens,
            "$ai_output_tokens": output_tokens,
            "$ai_total_cost_usd": round(cost, 6),
            "$ai_latency": round(latency_seconds, 3),
            "$ai_input": safe_messages,
            "$ai_output_choices": [{"role": "assistant", "content": safe_output[:500] if isinstance(safe_output, str) else str(safe_output)[:500]}],
        }

        if error:
            properties["$ai_is_error"] = True
            properties["$ai_error"] = error

        posthog.capture(
            distinct_id=effective_user_id,
            event="$ai_generation",
            properties=properties
        )

        # Flush immediately to ensure event is sent
        posthog.flush()
    except Exception as e:
        logger.debug(f"[LLM Analytics] Failed to track: {e}")

# ═══════════════════════════════════════════════════════════════════════════════
# PROVIDER CONFIGURATIONS
# ═══════════════════════════════════════════════════════════════════════════════
def _get_provider_config(provider: str) -> dict:
    """Get provider-specific configuration."""
    configs = {
        "anthropic": {
            "client_class": Anthropic,
            "instructor_fn": getattr(instructor, "from_anthropic", lambda c, **kw: c),
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "ANTHROPIC_JSON", None)} if hasattr(instructor, "Mode") else {},
        },
        "gemini": {
            "client_class": Gemini,
            "instructor_fn": getattr(instructor, "from_genai", lambda c, **kw: c),
            # Use GENAI_STRUCTURED_OUTPUTS instead of GENAI_TOOLS to avoid file caching issues
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "GENAI_STRUCTURED_OUTPUTS", None)} if hasattr(instructor, "Mode") else {},
            "api_key_env": ["GOOGLE_API_KEY", "GEMINI_API_KEY"],
        },
        "openai": {
            "client_class": OpenAI,
            "instructor_fn": getattr(instructor, "from_openai", lambda c, **kw: c),
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "TOOLS", None)} if hasattr(instructor, "Mode") else {},
        },
        "perplexity": {
            "client_class": OpenAI,
            "instructor_fn": instructor.from_openai,
            "instructor_kwargs": {"mode": instructor.Mode.TOOLS},
            "api_key_env": ["PPLX_API_KEY", "PERPLEXITY_API_KEY"],
            "base_url": "https://api.perplexity.ai",
        },
        "deepseek": {
            "client_class": OpenAI,
            "instructor_fn": instructor.from_openai,
            "instructor_kwargs": {"mode": instructor.Mode.TOOLS},
            "api_key_env": ["DEEPSEEK_API_KEY"],
            "base_url": "https://api.deepseek.com",
        },
        "xai": {
            "client_class": OpenAI,
            "instructor_fn": getattr(instructor, "from_openai", lambda c, **kw: c),
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "TOOLS", None)} if hasattr(instructor, "Mode") else {},
            "api_key_env": ["XAI_API_KEY"],
            "base_url": "https://api.x.ai/v1",
        },
        "groq": {
            "client_class": Groq,
            "instructor_fn": getattr(instructor, "from_groq", lambda c, **kw: c),
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "TOOLS", None)} if hasattr(instructor, "Mode") else {},
        },
    }
    return configs.get(provider, {})

def _get_api_key(provider: str) -> str:
    """Get API key for provider from environment."""
    config = _get_provider_config(provider)
    env_vars = config.get("api_key_env", [f"{provider.upper()}_API_KEY"])
    for var in env_vars:
        key = os.getenv(var)
        if key:
            return key
    return None

# ═══════════════════════════════════════════════════════════════════════════════
# CLIENT FACTORY
# ═══════════════════════════════════════════════════════════════════════════════
def get_client(model_name: str, wrap_with_instructor: bool = True):
    """Get a client for a model. Returns (client, actual_model_name)."""

    # Resolve model alias to provider and actual name
    if model_name in MODELS:
        provider, actual_model = MODELS[model_name]
    else:
        # Try reverse lookup
        provider = None
        actual_model = model_name
        for alias, (p, actual) in MODELS.items():
            if actual == model_name:
                provider = p
                break
        if not provider:
            raise ValueError(f"Unknown model: {model_name}")

    config = _get_provider_config(provider)
    if not config.get("client_class"):
        raise ValueError(f"Provider {provider} not available")

    # Build client kwargs
    kwargs = {}
    api_key = _get_api_key(provider)
    if api_key:
        kwargs["api_key"] = api_key
    if "base_url" in config:
        kwargs["base_url"] = config["base_url"]

    # Add timeout for HTTP clients
    if provider in ["openai", "anthropic", "perplexity", "deepseek", "groq", "xai"]:
        try:
            import httpx
            kwargs["timeout"] = httpx.Timeout(connect=60.0, read=180.0, write=30.0, pool=10.0)
        except ImportError:
            pass

    # Add Anthropic prompt caching header
    if provider == "anthropic":
        kwargs["default_headers"] = {"anthropic-beta": "prompt-caching-2024-07-31"}

    client = config["client_class"](**kwargs)

    if not wrap_with_instructor:
        return client, actual_model

    return config["instructor_fn"](client, **config["instructor_kwargs"]), actual_model

def get_model_id(model_name: str) -> str:
    """
    Get the full model ID from a model alias.
    For raw API calls (like client.messages.create), use this to get the full model ID.
    """
    if model_name in MODELS:
        _, actual = MODELS[model_name]
        return actual
    return model_name

def get_max_tokens_for_model(model_name: str, default: int = None) -> int:
    """Get max token limit for a model."""
    if model_name in MODELS:
        _, actual = MODELS[model_name]
    else:
        actual = model_name
    return MODEL_MAX_TOKENS.get(actual, default or DEFAULT_SLIDE_MAX_TOKENS)

# ═══════════════════════════════════════════════════════════════════════════════
# INVOKE - Main entry point for LLM calls
# ═══════════════════════════════════════════════════════════════════════════════
def invoke(
    client,
    model: str,
    messages: List[Dict[str, str]],
    response_model=None,
    max_tokens: int = 8192,
    temperature: float = 0.7,
    max_retries: int = 3,
    **kwargs
):
    """Invoke an LLM with messages and optional structured output.

    Args:
        max_retries: Number of retries for structured output parsing failures (default: 3)
    """

    from agents.generation.exceptions import AIGenerationError, AIOverloadedError, AIRateLimitError, AITimeoutError

    import time as _time
    _start_time = _time.time()

    # Extract custom params (not passed to underlying APIs)
    deck_uuid = kwargs.pop('deck_uuid', None)
    user_id = kwargs.pop('user_id', None)  # For PostHog tracking
    stream = kwargs.pop('stream', False)
    kwargs.pop('theme_generation', None)  # Used for tracing only
    kwargs.pop('slide_generation', None)  # Used for tracing only
    kwargs.pop('slide_index', None)  # Used for tracing only

    # Build invoke kwargs
    invoke_kwargs = {k: v for k, v in kwargs.items()}

    # Handle max_tokens param name based on provider
    if any(m in model for m in MAX_COMPLETION_TOKEN_MODELS):
        invoke_kwargs["max_completion_tokens"] = max_tokens
    elif model.startswith("gemini"):
        # Gemini uses generation config with max_output_tokens
        from google.genai import types as genai_types
        invoke_kwargs["config"] = genai_types.GenerateContentConfig(
            temperature=temperature,
            max_output_tokens=max_tokens,
        )
    else:
        invoke_kwargs["max_tokens"] = max_tokens

    if stream:
        invoke_kwargs["stream"] = True

    # Separate system message for Claude
    system_content, filtered_messages = _separate_system_message(messages, model)

    with ls.trace(name="llm-invoke", inputs={"messages": filtered_messages}):
        try:
            # Freeform (no response_model)
            if response_model is None:
                result = _invoke_freeform(client, model, filtered_messages, system_content, invoke_kwargs)
                # Track LLM usage in PostHog
                _latency = _time.time() - _start_time
                _input_tokens = _estimate_input_tokens_for_analytics(system_content, filtered_messages)
                _output_text = str(result) if result else ""
                _track_llm_generation(
                    model=model,
                    input_tokens=_input_tokens,
                    output_tokens=len(_output_text) // 4,
                    latency_seconds=_latency,
                    user_id=user_id,
                    messages=filtered_messages,
                    output=_output_text,
                )
                return result

            # Structured output
            result = _invoke_structured(client, model, filtered_messages, system_content, response_model, invoke_kwargs, max_retries)
            # Track LLM usage in PostHog
            _latency = _time.time() - _start_time
            _input_tokens = _estimate_input_tokens_for_analytics(system_content, filtered_messages)
            _output_text = str(result) if result else ""
            _track_llm_generation(
                model=model,
                input_tokens=_input_tokens,
                output_tokens=len(_output_text) // 4,
                latency_seconds=_latency,
                user_id=user_id,
                messages=filtered_messages,
                output=_output_text,
            )
            return result

        except Exception as e:
            # Track error in PostHog
            _latency = _time.time() - _start_time
            _input_tokens = _estimate_input_tokens_for_analytics(system_content, filtered_messages)
            _track_llm_generation(
                model=model,
                input_tokens=_input_tokens,
                output_tokens=0,
                latency_seconds=_latency,
                user_id=user_id,
                error=str(e)[:500],  # Truncate error message
            )

            error_code = getattr(getattr(e, 'response', None), 'status_code', None) or getattr(e, 'status_code', None)
            error_str = str(e).lower()

            if error_code == 529:
                raise AIOverloadedError("AI service overloaded", cause=e)
            elif error_code == 429:
                raise AIRateLimitError("Rate limit exceeded", cause=e)
            elif error_code in [502, 504]:
                raise AITimeoutError(f"AI timeout (HTTP {error_code})", cause=e)
            elif "max_tokens" in error_str or "length limit" in error_str or "incomplete" in error_str:
                # max_tokens truncation - provide a specific error message
                logger.error(f"LLM max_tokens exceeded: {e}")
                raise AIGenerationError(
                    f"AI generation failed: The output is incomplete due to a max_tokens length limit. "
                    f"Try simplifying the request or breaking it into smaller parts.",
                    cause=e
                )

            logger.error(f"LLM error: {e}")
            raise AIGenerationError(f"AI generation failed: {e}", cause=e)

def _separate_system_message(messages: List[Dict], model: str):
    """Extract system message from messages for Claude models."""
    system = None
    filtered = []
    for msg in messages:
        if msg.get("role") == "system" and model.startswith("claude"):
            system = msg.get("content", "")
        else:
            filtered.append(msg)
    return system, filtered

def _invoke_freeform(client, model: str, messages: List[Dict], system: str, kwargs: dict):
    """Invoke without structured output."""
    raw_client, _ = get_client(model, wrap_with_instructor=False)

    # OpenAI-style
    if hasattr(raw_client, 'chat') and hasattr(raw_client.chat, 'completions'):
        result = raw_client.chat.completions.create(model=model, messages=messages, **kwargs)
        return result.choices[0].message.content

    # Anthropic-style
    if hasattr(raw_client, 'messages'):
        ak = {**kwargs}
        if system:
            ak['system'] = system
        result = raw_client.messages.create(model=model, messages=messages, **ak)
        return result.content[0].text

    # Gemini-style
    if hasattr(raw_client, 'models'):
        def _extract_gemini_text(result) -> str:
            """Extract text from Gemini response with robust error handling."""
            text = None
            finish_reason = None

            # Try to get finish_reason for debugging
            try:
                if hasattr(result, 'candidates') and result.candidates:
                    candidate = result.candidates[0]
                    finish_reason = getattr(candidate, 'finish_reason', None)
                    if finish_reason and str(finish_reason) not in ['STOP', 'FinishReason.STOP', '1']:
                        logger.warning(f"Gemini finish_reason: {finish_reason}")
            except Exception:
                pass

            # Try primary accessor
            try:
                text = result.text
                if text:
                    return text
            except Exception as e:
                logger.debug(f"Gemini result.text failed: {e}")

            # Fallback: extract from candidates
            try:
                if hasattr(result, 'candidates') and result.candidates:
                    candidate = result.candidates[0]
                    if hasattr(candidate, 'content') and candidate.content:
                        parts = getattr(candidate.content, 'parts', [])
                        if parts:
                            text_parts = []
                            for part in parts:
                                if hasattr(part, 'text') and part.text:
                                    text_parts.append(part.text)
                            if text_parts:
                                return "".join(text_parts)
            except Exception as e:
                logger.debug(f"Gemini candidate extraction failed: {e}")

            return text or ""

        # If any message content is multimodal (list of parts), convert to Gemini inline_data parts
        try:
            has_parts = any(isinstance(m.get("content"), list) for m in messages)
            if has_parts:
                parts: List[Dict[str, Any]] = []
                if system:
                    parts.append({"text": system})
                for m in messages:
                    role = m.get("role", "user")
                    content = m.get("content")
                    # Treat explicit system messages as text parts
                    if role == "system" and isinstance(content, str) and content.strip():
                        parts.append({"text": content})
                        continue
                    if isinstance(content, list):
                        for p in content:
                            ptype = (p or {}).get("type")
                            if ptype == "text":
                                txt = (p or {}).get("text", "")
                                if txt:
                                    parts.append({"text": txt})
                            elif ptype == "image":
                                src = (p or {}).get("source") or {}
                                if src.get("type") == "base64":
                                    data = src.get("data")
                                    mime = src.get("media_type") or "image/png"
                                    if data:
                                        parts.append({"inline_data": {"mime_type": mime, "data": data}})
                            elif ptype == "document":
                                src = (p or {}).get("source") or {}
                                if src.get("type") == "base64":
                                    data = src.get("data")
                                    mime = src.get("media_type") or "application/pdf"
                                    if data:
                                        parts.append({"inline_data": {"mime_type": mime, "data": data}})
                    else:
                        # Fallback to text part
                        if content:
                            parts.append({"text": f"{role}: {content}"})

                result = raw_client.models.generate_content(model=model, contents=parts, **kwargs)
                return _extract_gemini_text(result)

            # Text-only
            prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
            if system:
                prompt = f"System: {system}\n{prompt}"
            result = raw_client.models.generate_content(model=model, contents=prompt, **kwargs)
            return _extract_gemini_text(result)
        except Exception:
            # Last-resort fallback: stringify everything
            prompt = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in messages])
            if system:
                prompt = f"System: {system}\n{prompt}"
            result = raw_client.models.generate_content(model=model, contents=prompt, **kwargs)
            return _extract_gemini_text(result)

    raise ValueError(f"Unknown client type: {type(raw_client)}")

def _repair_json(text: str) -> str:
    """Attempt to repair common JSON syntax errors from LLM output.

    Common issues:
    - Missing commas between object properties or array elements
    - Trailing commas before closing brackets
    - Truncated strings (EOF while parsing a string)
    - Truncated objects/arrays
    """
    if not text:
        return text

    # First, try to parse as-is - if valid, return immediately
    try:
        json.loads(text)
        return text
    except json.JSONDecodeError:
        pass

    repaired = text

    # Fix missing comma after closing brace followed by opening brace (array of objects)
    # Handles: }{ , }\n{ , }  { , }\n  { etc.
    repaired = re.sub(r'(\})(\s*)(\{)', r'\1,\2\3', repaired)

    # Fix missing comma after closing bracket followed by opening bracket (nested arrays)
    repaired = re.sub(r'(\])(\s*)(\[)', r'\1,\2\3', repaired)

    # Fix missing comma after string value followed by string key: "value" "key" or "value"\n"key"
    # But NOT after : (that's key-value separator)
    repaired = re.sub(r'(")\s*\n(\s*")', r'\1,\n\2', repaired)
    repaired = re.sub(r'(")(\s{2,})(")', r'\1,\2\3', repaired)

    # Fix missing comma after value followed by string key: value\n"key" or value "key"
    repaired = re.sub(r'(\d)(\s*\n\s*)(")', r'\1,\2\3', repaired)
    repaired = re.sub(r'(true|false|null)(\s*\n\s*)(")', r'\1,\2\3', repaired)

    # Fix missing comma after closing brace/bracket followed by string (array of strings/mixed)
    repaired = re.sub(r'(\})(\s*\n\s*)(")', r'\1,\2\3', repaired)
    repaired = re.sub(r'(\])(\s*\n\s*)(")', r'\1,\2\3', repaired)

    # Remove trailing commas before closing brackets
    repaired = re.sub(r',(\s*\])', r'\1', repaired)
    repaired = re.sub(r',(\s*\})', r'\1', repaired)

    # Try parsing to see if repair worked; if not, try truncation repair
    try:
        json.loads(repaired)
        logger.debug("JSON repair successful")
        return repaired
    except json.JSONDecodeError as e:
        # Try to fix truncated JSON (common with long HTML content)
        repaired = _repair_truncated_json(repaired)

    # Final check
    try:
        json.loads(repaired)
        logger.debug("JSON truncation repair successful")
        return repaired
    except json.JSONDecodeError:
        return repaired


def _repair_truncated_json(text: str) -> str:
    """Fix truncated JSON by closing open strings, arrays, and objects."""
    if not text:
        return text

    # Track the order of opening brackets/braces to close in reverse order
    in_string = False
    escape = False
    stack = []  # Track order: '{' or '['

    for c in text:
        if escape:
            escape = False
            continue
        if c == '\\' and in_string:
            escape = True
            continue
        if c == '"' and not escape:
            in_string = not in_string
            continue
        if not in_string:
            if c == '{':
                stack.append('{')
            elif c == '}':
                if stack and stack[-1] == '{':
                    stack.pop()
            elif c == '[':
                stack.append('[')
            elif c == ']':
                if stack and stack[-1] == '[':
                    stack.pop()

    repaired = text

    # If we ended inside a string, close it
    if in_string:
        # Escape any trailing backslash and close the string
        if repaired.endswith('\\'):
            repaired = repaired[:-1]
        repaired += '"'

    # Close any open brackets/braces in reverse order
    while stack:
        opener = stack.pop()
        if opener == '{':
            repaired += '}'
        elif opener == '[':
            repaired += ']'

    return repaired

def _extract_json(text: str) -> str:
    """Extract valid JSON from text that may have markdown fences or trailing garbage."""
    if not isinstance(text, str):
        text = str(text)
    t = text.strip()
    # Strip ```json fences if present
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()
    # If it's already a JSON object/array, keep
    if (t.startswith("{") and t.endswith("}")) or (t.startswith("[") and t.endswith("]")):
        # Try to repair common issues
        return _repair_json(t)

    # Try to find matching braces/brackets for objects starting with {
    if t.startswith("{"):
        depth = 0
        in_string = False
        escape = False
        for i, c in enumerate(t):
            if escape:
                escape = False
                continue
            if c == '\\' and in_string:
                escape = True
                continue
            if c == '"' and not escape:
                in_string = not in_string
                continue
            if not in_string:
                if c == '{':
                    depth += 1
                elif c == '}':
                    depth -= 1
                    if depth == 0:
                        return _repair_json(t[:i+1])

    # Best-effort: grab first {...} or [...]
    m = re.search(r"(\{[\s\S]*\}|\[[\s\S]*\])", t)
    if m:
        return _repair_json(m.group(1).strip())
    return t

def _invoke_structured(client, model: str, messages: List[Dict], system: str, response_model, kwargs: dict, max_retries: int = 3):
    """Invoke with structured output (Pydantic model).

    Args:
        max_retries: Number of retries for validation/parsing failures
    """

    # Gemini
    if model.startswith("gemini"):
        # Use Gemini's native JSON mode with response_mime_type for guaranteed JSON output
        from google.genai import types as genai_types

        raw_client, _ = get_client(model, wrap_with_instructor=False)

        # Build the prompt
        def _build_prompt() -> str:
            base = "\n".join([f"{m.get('role', 'user')}: {m.get('content')}" for m in messages])
            if system:
                base = f"System: {system}\n{base}"
            return base

        prompt = _build_prompt()

        # Get schema for structured output
        schema = None
        try:
            schema = response_model.model_json_schema()
        except Exception:
            try:
                schema = response_model.schema()
            except Exception:
                pass

        # Extract config from kwargs or create new one with JSON mode
        existing_config = kwargs.get("config")
        if existing_config:
            # Merge with existing config - add JSON mode
            config_dict = {
                "temperature": getattr(existing_config, "temperature", 0.7),
                "max_output_tokens": getattr(existing_config, "max_output_tokens", 8192),
                "response_mime_type": "application/json",  # FORCE JSON OUTPUT
            }
        else:
            config_dict = {
                "temperature": 0.3,  # Lower temperature for structured output
                "max_output_tokens": 8192,
                "response_mime_type": "application/json",  # FORCE JSON OUTPUT
            }

        # Add schema hint to prompt since response_schema can be finicky
        if schema:
            prompt = f"{prompt}\n\nRespond with JSON matching this schema:\n{json.dumps(schema, ensure_ascii=False)}"

        gk = {k: v for k, v in kwargs.items() if k not in ["temperature", "max_tokens", "config", "thinking_budget", "thinking_config"]}
        gk["config"] = genai_types.GenerateContentConfig(**config_dict)

        last_err = None
        last_raw_text = None
        for _attempt in range(max_retries):
            try:
                result = raw_client.models.generate_content(model=model, contents=prompt, **gk)
                # Properly extract text from Gemini response
                text = None
                try:
                    text = result.text  # Primary accessor
                except Exception:
                    # Fallback: try to get text from candidates
                    if hasattr(result, 'candidates') and result.candidates:
                        candidate = result.candidates[0]
                        if hasattr(candidate, 'content') and candidate.content:
                            parts = getattr(candidate.content, 'parts', [])
                            if parts and hasattr(parts[0], 'text'):
                                text = parts[0].text
                if not text:
                    logger.warning(f"Gemini attempt {_attempt + 1}: No text in response")
                    continue
                last_raw_text = text
                payload = _extract_json(text)
                # Validate/parse into response_model
                try:
                    return response_model.model_validate_json(payload)
                except Exception as e1:
                    # Try parse_raw as fallback
                    try:
                        return response_model.parse_raw(payload)
                    except Exception as e2:
                        # Log for debugging and continue to retry
                        logger.warning(f"Gemini JSON parse attempt {_attempt + 1} failed: {e1}")
                        raise e1
            except Exception as e:
                last_err = e
                logger.warning(f"Gemini attempt {_attempt + 1} error: {e}")
                continue

        # All retries failed - try one more aggressive repair as last resort
        if last_raw_text:
            try:
                payload = _extract_json(last_raw_text)
                payload = _repair_json(payload)
                return response_model.model_validate_json(payload)
            except Exception:
                pass

        # Re-raise with the final error context
        if last_err:
            raise last_err
        raise ValueError("Gemini structured invocation failed")

    # Claude (with system)
    if hasattr(client, 'create') and not hasattr(client, 'chat'):
        ck = {**kwargs}
        if system:
            if ENABLE_ANTHROPIC_PROMPT_CACHING:
                ck['system'] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
            else:
                ck['system'] = system
        try:
            return client.create(model=model, messages=messages, response_model=response_model, max_retries=max_retries, **ck)
        except Exception as e:
            # Check if this is a JSON validation error (trailing characters, malformed JSON, missing delimiters)
            error_str = str(e).lower()
            is_json_error = (
                "trailing characters" in error_str or
                "invalid json" in error_str or
                "json_invalid" in error_str or
                "expecting" in error_str or  # Catches "Expecting ',' delimiter" etc.
                "jsondecode" in error_str
            )
            if is_json_error:
                logger.warning(f"Claude instructor JSON parse failed, attempting manual extraction: {e}")
                # Fall back to raw Anthropic client + manual JSON extraction
                raw_client, _ = get_client(model, wrap_with_instructor=False)
                raw_ck = {k: v for k, v in ck.items() if k not in ["response_model"]}
                raw_ck["max_tokens"] = kwargs.get("max_tokens", 4096)
                result = raw_client.messages.create(model=model, messages=messages, **raw_ck)
                text = result.content[0].text if result.content else ""
                payload = _extract_json(text)
                try:
                    return response_model.model_validate_json(payload)
                except Exception:
                    return response_model.parse_raw(payload)
            raise

    # OpenAI-style
    try:
        return client.chat.completions.create(model=model, messages=messages, response_model=response_model, max_retries=max_retries, **kwargs)
    except Exception as e:
        # Check if this is a JSON validation error (trailing characters, malformed JSON, missing delimiters)
        error_str = str(e).lower()
        is_json_error = (
            "trailing characters" in error_str or
            "invalid json" in error_str or
            "json_invalid" in error_str or
            "expecting" in error_str or  # Catches "Expecting ',' delimiter" etc.
            "jsondecode" in error_str
        )
        if is_json_error:
            logger.warning(f"OpenAI instructor JSON parse failed, attempting manual extraction: {e}")
            # Fall back to raw OpenAI client + manual JSON extraction
            raw_client, _ = get_client(model, wrap_with_instructor=False)
            raw_kwargs = {k: v for k, v in kwargs.items() if k not in ["response_model"]}
            raw_kwargs["max_tokens"] = kwargs.get("max_tokens", 4096)
            result = raw_client.chat.completions.create(model=model, messages=messages, **raw_kwargs)
            text = result.choices[0].message.content if result.choices else ""
            payload = _extract_json(text)
            try:
                return response_model.model_validate_json(payload)
            except Exception:
                return response_model.parse_raw(payload)
        raise

# ═══════════════════════════════════════════════════════════════════════════════
# EXPORTS
# ═══════════════════════════════════════════════════════════════════════════════
__all__ = ['get_client', 'invoke', 'get_max_tokens_for_model', 'MODELS', 'MODEL_MAX_TOKENS', 'set_current_user', 'get_current_user']
