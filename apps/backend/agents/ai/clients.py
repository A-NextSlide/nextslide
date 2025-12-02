"""AI Client management - provider connections and model routing."""

import os
import json
import logging
import hashlib
from typing import List, Dict, Any
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel
import instructor
import langsmith as ls

logger = logging.getLogger(__name__)

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
    "claude-sonnet-4": ("anthropic", "claude-sonnet-4-20250514"),
    "claude-haiku-4-5": ("anthropic", "claude-haiku-4-5-20251001"),

    # Gemini
    "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
    "gemini-2.5-flash-lite": ("gemini", "gemini-2.5-flash-lite"),
    "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
    "gemini-3-pro": ("gemini", "gemini-3-pro-preview"),

    # OpenAI
    "gpt-4o-mini": ("openai", "gpt-4o-mini"),
    "gpt-4.1": ("openai", "gpt-4.1-2025-04-14"),
    "gpt-4.1-mini": ("openai", "gpt-4.1-mini-2025-04-14"),

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
    "claude-sonnet-4-20250514": 64000,
    "claude-haiku-4-5-20251001": 64000,
    "gemini-2.5-flash": 8192,
    "gemini-2.5-flash-lite": 65536,
    "gemini-2.5-pro": 8192,
    "gemini-3-pro-preview": 65536,
    "gpt-4o-mini": 16384,
    "gpt-4.1-2025-04-14": 32768,
}

DEFAULT_SLIDE_MAX_TOKENS = 10000

# Models that need max_completion_tokens instead of max_tokens
MAX_COMPLETION_TOKEN_MODELS = {"o3-mini", "o4-mini", "gpt-5"}

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
            "instructor_kwargs": {"mode": getattr(instructor.Mode, "GENAI_TOOLS", None)} if hasattr(instructor, "Mode") else {},
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
    if provider in ["openai", "anthropic", "perplexity", "deepseek", "groq"]:
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
    **kwargs
):
    """Invoke an LLM with messages and optional structured output."""

    from agents.generation.exceptions import AIGenerationError, AIOverloadedError, AIRateLimitError, AITimeoutError

    # Extract custom params (not passed to underlying APIs)
    deck_uuid = kwargs.pop('deck_uuid', None)
    stream = kwargs.pop('stream', False)
    kwargs.pop('theme_generation', None)  # Used for tracing only
    kwargs.pop('slide_generation', None)  # Used for tracing only
    kwargs.pop('slide_index', None)  # Used for tracing only

    # Build invoke kwargs
    invoke_kwargs = {k: v for k, v in kwargs.items()}

    # Handle max_tokens param name
    if any(m in model for m in MAX_COMPLETION_TOKEN_MODELS):
        invoke_kwargs["max_completion_tokens"] = max_tokens
    elif not model.startswith("gemini"):
        invoke_kwargs["max_tokens"] = max_tokens

    if stream:
        invoke_kwargs["stream"] = True

    # Separate system message for Claude
    system_content, filtered_messages = _separate_system_message(messages, model)

    with ls.trace(name="llm-invoke", inputs={"messages": filtered_messages}):
        try:
            # Freeform (no response_model)
            if response_model is None:
                return _invoke_freeform(client, model, filtered_messages, system_content, invoke_kwargs)

            # Structured output
            return _invoke_structured(client, model, filtered_messages, system_content, response_model, invoke_kwargs)

        except Exception as e:
            error_code = getattr(getattr(e, 'response', None), 'status_code', None) or getattr(e, 'status_code', None)

            if error_code == 529:
                raise AIOverloadedError("AI service overloaded", cause=e)
            elif error_code == 429:
                raise AIRateLimitError("Rate limit exceeded", cause=e)
            elif error_code in [502, 504]:
                raise AITimeoutError(f"AI timeout (HTTP {error_code})", cause=e)

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
        prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
        if system:
            prompt = f"System: {system}\n{prompt}"
        result = raw_client.models.generate_content(model=model, contents=prompt)
        return result.text

    raise ValueError(f"Unknown client type: {type(raw_client)}")

def _invoke_structured(client, model: str, messages: List[Dict], system: str, response_model, kwargs: dict):
    """Invoke with structured output (Pydantic model)."""

    # Gemini
    if model.startswith("gemini"):
        gk = {k: v for k, v in kwargs.items() if k not in ["temperature", "max_tokens"]}
        return client.create(model=model, messages=messages, response_model=response_model, **gk)

    # Claude (with system)
    if hasattr(client, 'create') and not hasattr(client, 'chat'):
        ck = {**kwargs}
        if system:
            if ENABLE_ANTHROPIC_PROMPT_CACHING:
                ck['system'] = [{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}]
            else:
                ck['system'] = system
        return client.create(model=model, messages=messages, response_model=response_model, **ck)

    # OpenAI-style
    return client.chat.completions.create(model=model, messages=messages, response_model=response_model, **kwargs)

# ═══════════════════════════════════════════════════════════════════════════════
# EXPORTS
# ═══════════════════════════════════════════════════════════════════════════════
__all__ = ['get_client', 'invoke', 'get_max_tokens_for_model', 'MODELS', 'MODEL_MAX_TOKENS']
