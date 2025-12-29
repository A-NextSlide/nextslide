"""AI Client management - provider connections and model routing."""

import os
import json
import re
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
    "claude-sonnet-4-5": ("anthropic", "claude-sonnet-4-5-20250929"),
    "claude-sonnet-4": ("anthropic", "claude-sonnet-4-20250514"),  # Legacy
    "claude-haiku-4-5": ("anthropic", "claude-haiku-4-5-20251001"),

    # Gemini
    "gemini-2.5-flash": ("gemini", "gemini-2.5-flash"),
    "gemini-2.5-flash-lite": ("gemini", "gemini-2.5-flash-lite"),
    "gemini-2.5-pro": ("gemini", "gemini-2.5-pro"),
    "gemini-3-pro": ("gemini", "gemini-3-pro-preview"),
    "gemini-3-pro-preview": ("gemini", "gemini-3-pro-preview"),
    "gemini-3-flash": ("gemini", "gemini-3-flash-preview"),
    "gemini-3-flash-preview": ("gemini", "gemini-3-flash-preview"),

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
    "claude-sonnet-4-5-20250929": 64000,
    "claude-sonnet-4-20250514": 64000,  # Legacy
    "claude-haiku-4-5-20251001": 64000,
    "gemini-2.5-flash": 8192,
    "gemini-2.5-flash-lite": 65536,
    "gemini-2.5-pro": 8192,
    "gemini-3-pro-preview": 65536,
    "gemini-3-flash-preview": 65536,
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

    # Extract custom params (not passed to underlying APIs)
    deck_uuid = kwargs.pop('deck_uuid', None)
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
                return _invoke_freeform(client, model, filtered_messages, system_content, invoke_kwargs)

            # Structured output
            return _invoke_structured(client, model, filtered_messages, system_content, response_model, invoke_kwargs, max_retries)

        except Exception as e:
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
                    else:
                        # Fallback to text part
                        if content:
                            parts.append({"text": f"{role}: {content}"})

                result = raw_client.models.generate_content(model=model, contents=parts, **kwargs)
                return result.text

            # Text-only
            prompt = "\n".join([f"{m['role']}: {m['content']}" for m in messages])
            if system:
                prompt = f"System: {system}\n{prompt}"
            result = raw_client.models.generate_content(model=model, contents=prompt, **kwargs)
            return result.text
        except Exception:
            # Last-resort fallback: stringify everything
            prompt = "\n".join([f"{m.get('role')}: {m.get('content')}" for m in messages])
            if system:
                prompt = f"System: {system}\n{prompt}"
            result = raw_client.models.generate_content(model=model, contents=prompt, **kwargs)
            return result.text

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

        gk = {k: v for k, v in kwargs.items() if k not in ["temperature", "max_tokens", "config"]}
        gk["config"] = genai_types.GenerateContentConfig(**config_dict)

        last_err = None
        last_raw_text = None
        for _attempt in range(max_retries):
            try:
                result = raw_client.models.generate_content(model=model, contents=prompt, **gk)
                text = getattr(result, "text", None) or str(result)
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
__all__ = ['get_client', 'invoke', 'get_max_tokens_for_model', 'MODELS', 'MODEL_MAX_TOKENS']
