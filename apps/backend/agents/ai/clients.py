import os
import hashlib
import instructor
from pydantic import BaseModel

# Optional provider SDK imports. These are only required if their provider is used.
try:
    from groq import Groq
except Exception:
    Groq = None
try:
    from anthropic import Anthropic
except Exception:
    Anthropic = None
try:
    from openai import OpenAI
except Exception:
    OpenAI = None
try:
    from google.genai import Client as Gemini
except Exception:
    Gemini = None

from agents.persistence.cache import instructor_cache
from agents.config import ENABLE_ANTHROPIC_PROMPT_CACHING, LOG_ANTHROPIC_CACHE_METRICS, ENABLE_CACHE_METRICS_PROBE
import langsmith as ls
import logging
import json
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

# Instructor patch removed - no longer needed

# Clients and their configuration
CLIENTS = {
    "anthropic": {
        "instructor_fn": getattr(instructor, "from_anthropic", None) or (lambda c, **kw: c),
        "client_class": Anthropic,
        "instructor_kwargs": {"mode": getattr(instructor, "Mode", object()).ANTHROPIC_JSON} if hasattr(instructor, "Mode") else {},
    },
    "groq": {
        "instructor_fn": getattr(instructor, "from_groq", None) or (lambda c, **kw: c),
        "client_class": Groq,
        "instructor_kwargs": {"mode": getattr(instructor, "Mode", object()).TOOLS} if hasattr(instructor, "Mode") else {},
    },
    "openai": {
        "instructor_fn": getattr(instructor, "from_openai", None) or (lambda c, **kw: c),
        "client_class": OpenAI,
        "instructor_kwargs": {"mode": getattr(instructor, "Mode", object()).TOOLS} if hasattr(instructor, "Mode") else {},
    },
    "gemini": {
        "instructor_fn": getattr(instructor, "from_genai", None) or (lambda c, **kw: c),
        "client_class": Gemini,
        "instructor_kwargs": {"mode": getattr(instructor, "Mode", object()).GENAI_TOOLS} if hasattr(instructor, "Mode") else {},
    },
    "samba": {
        "instructor_fn": instructor.from_openai,
        "client_class": OpenAI,
        "instructor_kwargs": {},
        "api_key": os.getenv("SAMBA_API_KEY"),
        "base_url": "https://api.sambanova.ai/v1"
    },
    "deepseek": {
        "instructor_fn": instructor.from_openai,
        "client_class": OpenAI,
        "instructor_kwargs": {"mode": instructor.Mode.TOOLS},
        "api_key": os.getenv("DEEPSEEK_API_KEY"),
        "base_url": "https://api.deepseek.com"
    },
    "perplexity": {
        "instructor_fn": instructor.from_openai,
        "client_class": OpenAI,
        "instructor_kwargs": {"mode": instructor.Mode.TOOLS},
        # Prefer PPLX_API_KEY, fallback to PERPLEXITY_API_KEY
        "api_key": os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY"),
        "base_url": "https://api.perplexity.ai"
    }
}

# Models, their client type, and their model_name
MODELS = {
    "Meta-Llama-3.1-405B-Instruct": ("samba", "Meta-Llama-3.1-405B-Instruct"),
    "Meta-Llama-3.2-1B-Instruct": ("samba", "Meta-Llama-3.2-1B-Instruct"),
    "claude-opus-4": ("anthropic", "claude-opus-4-20250514"),
    "claude-sonnet-4-5": ("anthropic", "claude-sonnet-4-5-20250929"),
    "claude-sonnet-4": ("anthropic", "claude-sonnet-4-20250514"),
    "claude-3-7-sonnet": ("anthropic", "claude-3-7-sonnet-20250219"),
    "claude-3-5-sonnet": ("anthropic", "claude-3-5-sonnet-20241022"),
    "claude-3-5-haiku": ("anthropic", "claude-3-5-haiku-20241022"),
    "deepseek-r1-distill-llama-70b": ("groq", "deepseek-r1-distill-llama-70b"),
    "mistral-saba-24b": ("groq", "mistral-saba-24b"),
    "llama3-8b-8192": ("groq", "llama3-8b-8192"),
    "distil-whisper-large-v3-en": ("groq", "distil-whisper-large-v3-en"),
    "gpt-4o-mini": ("openai", "gpt-4o-mini"),
    "gpt-4.1-mini": ("openai", "gpt-4.1-mini-2025-04-14"),
    "gpt-4.1": ("openai", "gpt-4.1-2025-04-14"),
    "o3‐mini": ("openai", "o3-mini-2025-01-31"),
    "o4-mini-2025-04-16": ("openai", "o4-mini-2025-04-16"),
    "o3-2025-04-16": ("openai", "o3-2025-04-16"),
    # GPT-5 family (aliases and snapshots)
    "gpt-5": ("openai", "gpt-5"),
    "gpt-5-2025-08-07": ("openai", "gpt-5-2025-08-07"),
    "gpt-5-mini": ("openai", "gpt-5-mini"),
    "gpt-5-mini-2025-08-07": ("openai", "gpt-5-mini-2025-08-07"),
    "gpt-5-nano": ("openai", "gpt-5-nano"),
    "gpt-5-nano-2025-08-07": ("openai", "gpt-5-nano-2025-08-07"),
    "gemini-2.5-pro": ("gemini", "gemini-2.5-pro-preview-06-05"),
    "gemini-2.5-flash": ("gemini", "gemini-2.5-flash-preview-05-20"),
    "gemini-2.5-flash-lite": ("gemini", "gemini-2.5-flash-lite-preview-06-17"),
    # DeepSeek models
    "deepseek-chat": ("deepseek", "deepseek-chat"),  # Non-thinking mode (DeepSeek-V3.1)
    "deepseek-reasoner": ("deepseek", "deepseek-reasoner"),  # Thinking mode (DeepSeek-V3.1)
    
    # Perplexity Sonar models
    "perplexity-sonar": ("perplexity", "sonar"),
    "perplexity-sonar-pro": ("perplexity", "sonar-pro"),
    "perplexity-sonar-reasoning": ("perplexity", "sonar-reasoning"),
}

# Max token param overrides for specific models
MAX_PARAM = {
    "o3-mini-2025-01-31": "max_completion_tokens",
    "o4-mini-2025-04-16": "max_completion_tokens",
    "o3-2025-04-16": "max_completion_tokens",
    # OpenAI GPT-5 family requires max_completion_tokens instead of max_tokens
    "gpt-5": "max_completion_tokens",
    "gpt-5-2025-08-07": "max_completion_tokens",
    "gpt-5-mini": "max_completion_tokens",
    "gpt-5-mini-2025-08-07": "max_completion_tokens",
    "gpt-5-nano": "max_completion_tokens",
    "gpt-5-nano-2025-08-07": "max_completion_tokens",
    "gemini-2.5-pro-preview-06-05": None,
    "gemini-2.5-flash-preview-05-20": None,
    "gemini-2.5-flash-lite-preview-06-17": None 
}

# Max token limits for each model (based on official documentation)
MODEL_MAX_TOKENS = {
    # Claude 4 models
    "claude-opus-4-20250514": 32000,      # Claude Opus 4 supports 32k output
    "claude-sonnet-4-5-20250929": 64000,  # Claude Sonnet 4.5 supports 64k output
    "claude-sonnet-4-20250514": 64000,    # Claude Sonnet 4 supports 64k output

    # Claude 3.7 models
    "claude-3-7-sonnet-20250219": 64000,  # Claude Sonnet 3.7 supports 64k output
    
    # Claude 3.5 models
    "claude-3-5-sonnet-20241022": 8192,   # Claude Sonnet 3.5 supports 8k output
    "claude-3-5-haiku-20241022": 8192,    # Claude Haiku 3.5 supports 8k output
    
    # Claude 3 models
    "claude-3-opus-20240229": 4096,       # Claude Opus 3 supports 4k output
    
    # OpenAI models
    "gpt-4o-mini": 16384,                 # GPT-4o mini supports 16k output
    "gpt-4.1-mini-2025-04-14": 16384,     # GPT-4.1 mini supports 16k output
    "gpt-4.1-2025-04-14": 32768,          # GPT-4.1 supports 32k output
    "o3-mini-2025-01-31": 65536,          # O3 mini supports 64k output
    "o4-mini-2025-04-16": 16384,          # O4 mini supports 16k output
    "o3-2025-04-16": 16384,
    # GPT-5 family supports up to 128k output tokens
    "gpt-5": 128000,
    "gpt-5-2025-08-07": 128000,
    "gpt-5-mini": 128000,
    "gpt-5-mini-2025-08-07": 128000,
    "gpt-5-nano": 128000,
    "gpt-5-nano-2025-08-07": 128000,
    
    # Groq models
    "deepseek-r1-distill-llama-70b": 8192,
    "mistral-saba-24b": 8192,
    "llama3-8b-8192": 8192,
    
    # Gemini models
    "gemini-2.5-pro-preview-06-05": 8192,
    "gemini-2.5-flash-preview-05-20": 8192,
    "gemini-2.5-flash-lite-preview-06-17": 65536,  # Gemini 2.5 Flash Lite supports 64k output
    
    # Samba models
    "Meta-Llama-3.1-405B-Instruct": 4096,
    "Meta-Llama-3.2-1B-Instruct": 4096,
    
    # DeepSeek models
    "deepseek-chat": 32768,         # DeepSeek-V3.1 non-thinking mode (conservative estimate)
    "deepseek-reasoner": 32768,     # DeepSeek-V3.1 thinking mode (conservative estimate)

    # Perplexity Sonar (conservative; provider can stream larger)
    "sonar": 65536,
    "sonar-pro": 65536,
    "sonar-reasoning": 65536,
}

# Default max tokens for slide generation (can be overridden)
DEFAULT_SLIDE_MAX_TOKENS = 10000  # Good default for Sonnet 4 while staying under limits

def get_max_tokens_for_model(model_name: str, default: int = None) -> int:
    """
    Get the maximum token limit for a specific model.
    
    Args:
        model_name: The model name (can be alias or full name)
        default: Default value if model not found (defaults to DEFAULT_SLIDE_MAX_TOKENS)
    
    Returns:
        Maximum tokens the model supports for output
    """
    # Get the actual model name if an alias was provided
    if model_name in MODELS:
        _, actual_model_name = MODELS[model_name]
    else:
        actual_model_name = model_name
    
    # Return the max tokens for the model, or the default
    return MODEL_MAX_TOKENS.get(actual_model_name, default or DEFAULT_SLIDE_MAX_TOKENS)

def _extract_anthropic_cache_metrics(result) -> tuple:
    """Best-effort extraction of Anthropic cache metrics from SDK result objects.
    Returns (cache_read_input_tokens, cache_creation_input_tokens) or (None, None).
    """
    try:
        usage = getattr(result, 'usage', None)
        if usage is not None:
            read = getattr(usage, 'cache_read_input_tokens', None)
            created = getattr(usage, 'cache_creation_input_tokens', None)
            # Some SDKs expose usage as dict-like
            if read is None and hasattr(usage, 'get'):
                read = usage.get('cache_read_input_tokens')
            if created is None and hasattr(usage, 'get'):
                created = usage.get('cache_creation_input_tokens')
            return read, created
        # Fallback to top-level
        read = getattr(result, 'cache_read_input_tokens', None)
        created = getattr(result, 'cache_creation_input_tokens', None)
        if read is not None or created is not None:
            return read, created

        # Instructor-wrapped responses may stash the raw SDK object
        raw = getattr(result, 'raw_response', None) or getattr(result, '_raw_response', None)
        if raw is not None and raw is not result:
            usage = getattr(raw, 'usage', None)
            if usage is not None:
                read = getattr(usage, 'cache_read_input_tokens', None)
                created = getattr(usage, 'cache_creation_input_tokens', None)
                if read is None and hasattr(usage, 'get'):
                    read = usage.get('cache_read_input_tokens')
                if created is None and hasattr(usage, 'get'):
                    created = usage.get('cache_creation_input_tokens')
                if read is not None or created is not None:
                    return read, created
            # Fall back to checking top-level on raw response too
            read = getattr(raw, 'cache_read_input_tokens', None)
            created = getattr(raw, 'cache_creation_input_tokens', None)
            if read is not None or created is not None:
                return read, created

        return None, None
    except Exception:
        return None, None

def get_client(model_name: str, api_key: str = None, base_url: str = None, wrap_with_instructor: bool = True):
    """
    Get a client for a given model. Accepts either a model alias (key in MODELS)
    or the provider's actual model name (value in MODELS mapping).

    If wrap_with_instructor is False, returns a raw provider client (unwrapped),
    which is necessary for free-form responses where no response_model is used.
    """
    # Determine client type and actual model name from either alias or actual name
    if model_name in MODELS:
        client_type, actual_model_name = MODELS[model_name]
    else:
        # Reverse lookup: try to find the client type by actual model name
        client_type = None
        actual_model_name = model_name
        for alias, (ct, actual_name) in MODELS.items():
            if actual_name == model_name:
                client_type = ct
                break
        if client_type is None:
            raise ValueError(f"Model {model_name} not supported")

    client_config = CLIENTS[client_type]
    
    # Prepare client initialization kwargs
    client_kwargs = {}
    
    # Only add api_key if provided
    if api_key is not None:
        client_kwargs["api_key"] = api_key
    elif "api_key" in client_config:
        # For clients that use environment variables, get the API key fresh from environment
        if client_type == "deepseek":
            deepseek_key = os.getenv("DEEPSEEK_API_KEY")
            if not deepseek_key:
                raise ValueError("DEEPSEEK_API_KEY environment variable is not set")
            client_kwargs["api_key"] = deepseek_key
        elif client_type == "samba":
            samba_key = os.getenv("SAMBA_API_KEY")
            if not samba_key:
                raise ValueError("SAMBA_API_KEY environment variable is not set")
            client_kwargs["api_key"] = samba_key
        elif client_type == "perplexity":
            pplx_key = os.getenv("PPLX_API_KEY") or os.getenv("PERPLEXITY_API_KEY")
            if not pplx_key:
                raise ValueError("PPLX_API_KEY or PERPLEXITY_API_KEY environment variable is not set")
            client_kwargs["api_key"] = pplx_key
        else:
            client_kwargs["api_key"] = client_config["api_key"]
    
    # Only add base_url if provided and client supports it
    if base_url is not None:
        client_kwargs["base_url"] = base_url
    elif "base_url" in client_config:
        client_kwargs["base_url"] = client_config["base_url"]
    
    # Enable Anthropic prompt caching beta headers on every client instance
    if client_type == "anthropic":
        headers = client_kwargs.get("default_headers", {}) or {}
        headers.setdefault("anthropic-beta", "prompt-caching-2024-07-31")
        client_kwargs["default_headers"] = headers

    # Special-case: Perplexity uses raw OpenAI-compatible client only when explicitly requested
    if client_type == "perplexity" and not wrap_with_instructor:
        return client_config["client_class"](**client_kwargs), actual_model_name
    
    # Allow callers to request an unwrapped/raw client (needed for response_model=None flows)
    if not wrap_with_instructor:
        return client_config["client_class"](**client_kwargs), actual_model_name
    
    return client_config["instructor_fn"](
        client_config["client_class"](**client_kwargs), 
        **client_config["instructor_kwargs"]
    ), actual_model_name

@instructor_cache
def invoke_with_cache(client, model, messages, response_model, invoke_kwargs) -> BaseModel:
    if hasattr(client, 'create') and not hasattr(client, 'chat'):
        # Instructor-wrapped Claude/other clients use create() directly
        res = client.create(
            model=model,
            messages=messages,
            response_model=response_model,
            **invoke_kwargs
        )
        # Best-effort cache metrics logging (may be None when wrapped)
        try:
            if LOG_ANTHROPIC_CACHE_METRICS and isinstance(model, str) and model.startswith("claude"):
                import logging as _logging
                _logger = _logging.getLogger(__name__)
                _read, _created = _extract_anthropic_cache_metrics(res)
                _logger.info(f"[CLAUDE CACHE] read={_read}, created={_created}")
                print(f"[CLAUDE CACHE] read={_read}, created={_created}")
        except Exception:
            pass
        return res
    else:
        # OpenAI-style clients use chat.completions.create
        return client.chat.completions.create(
            model=model,
            messages=messages,
            response_model=response_model,
            **invoke_kwargs
        )

def _separate_system_message(messages: List[Dict[str, str]], model: str):
    """
    Separate system message from messages for models that need it.
    Returns (system_content, filtered_messages)
    """
    system_content = None
    filtered_messages = []
    
    for msg in messages:
        if msg.get("role") == "system":
            # For Claude models, extract system content
            if model.startswith("claude"):
                system_content = msg.get("content", "")
            else:
                # For other models, keep system message in place
                filtered_messages.append(msg)
        else:
            filtered_messages.append(msg)
    
    return system_content, filtered_messages

def invoke(
    client,
    model: str,
    messages: List[Dict[str, str]],
    response_model=None,
    max_tokens: int = 8192,
    temperature: float = 0.7,
    deck_uuid: str = None,
    slide_generation: bool = False,
    slide_index: int = None,
    visual_analysis: bool = False,
    theme_generation: bool = False,
    **kwargs  # Accept additional kwargs for backward compatibility
):
    """Wrapper for instructor.patch() that handles both sync and async clients"""
    
    # Import exception types at the top of the function
    from agents.generation.exceptions import (
        AIOverloadedError, 
        AIRateLimitError, 
        AITimeoutError,
        AIGenerationError
    )
    
    # Extract our custom parameters for logging (support both styles)
    deck_uuid = deck_uuid or kwargs.pop('deck_uuid', None)
    slide_generation = slide_generation or kwargs.pop('slide_generation', False)
    slide_index = slide_index if slide_index is not None else kwargs.pop('slide_index', None)
    visual_analysis = visual_analysis or kwargs.pop('visual_analysis', False)
    theme_generation = theme_generation or kwargs.pop('theme_generation', False)
    
    # Handle temperature and max_tokens from kwargs if not explicitly passed
    temperature = kwargs.pop('temperature', temperature)
    max_tokens = kwargs.pop('max_tokens', max_tokens)
    
    # Calculate prompt size
    prompt_chars = sum(len(msg.get('content', '')) for msg in messages)
    approx_tokens = prompt_chars // 4
    
    # Save prompts for debugging - especially for Claude models
    if model.startswith("claude"):
        try:
            # Determine output directory based on deck_uuid
            if deck_uuid:
                output_dir = Path("test_output") / deck_uuid / "prompts"
            else:
                # Fallback to general prompts folder
                output_dir = Path("test_output/prompts")
            
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Generate filename with timestamp
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
            
            # Determine prompt type from context
            prompt_type = "general"
            if visual_analysis:
                prompt_type = "visual_analysis"
            elif slide_generation:
                prompt_type = "slide"
            elif theme_generation:
                prompt_type = "theme"
            
            prompt_file = output_dir / f"{prompt_type}_{model}_{timestamp}.json"
            
            # Calculate approximate token count for ALL messages
            total_chars = 0
            message_breakdown = []
            
            # Process messages to exclude image data
            cleaned_messages = []
            for msg in messages:
                cleaned_msg = {"role": msg["role"]}
                
                if isinstance(msg.get("content"), str):
                    # Simple string content
                    cleaned_msg["content"] = msg["content"]
                    char_count = len(msg["content"])
                    total_chars += char_count
                    message_breakdown.append(f"  - {msg['role']}: {char_count // 4} tokens")
                elif isinstance(msg.get("content"), list):
                    # Complex content (may include images)
                    cleaned_content = []
                    for item in msg["content"]:
                        if isinstance(item, dict):
                            if item.get("type") == "text":
                                cleaned_content.append(item)
                                text_len = len(item.get("text", ""))
                                total_chars += text_len
                            elif item.get("type") == "image":
                                # Replace image data with placeholder
                                cleaned_content.append({
                                    "type": "image",
                                    "source": {
                                        "type": item.get("source", {}).get("type", "unknown"),
                                        "media_type": item.get("source", {}).get("media_type", "unknown"),
                                        "data": "[IMAGE_BINARY_EXCLUDED]"
                                    }
                                })
                        else:
                            cleaned_content.append(item)
                    cleaned_msg["content"] = cleaned_content
                    # Calculate tokens for this message
                    text_chars = sum(len(item.get("text", "")) for item in cleaned_content 
                                   if isinstance(item, dict) and item.get("type") == "text")
                    message_breakdown.append(f"  - {msg['role']}: {text_chars // 4} tokens")
                else:
                    cleaned_msg["content"] = msg.get("content")
                
                cleaned_messages.append(cleaned_msg)
            
            approx_tokens = total_chars // 4  # Rough approximation
            
            # Log a warning for large prompts
            if approx_tokens > 5000:
                print(f"⚠️ LARGE PROMPT DETECTED: {approx_tokens} tokens for {model}")
            
            # Save to file with cleaned messages (sanitize any filesystem usage)
            prompt_data = {
                "timestamp": timestamp,
                "model": model,
                "prompt_type": prompt_type,
                "response_model": str(response_model) if response_model else None,
                "max_tokens": max_tokens,
                "approx_input_tokens": approx_tokens,
                "total_chars": total_chars,
                "messages": cleaned_messages
            }
            
            try:
                with open(prompt_file, "w") as f:
                    json.dump(prompt_data, f, indent=2)
            except Exception as _e1:
                # Fallback to a short hashed name on any OS error
                safe = hashlib.sha1(str(prompt_file).encode("utf-8")).hexdigest()
                safe_path = output_dir / f"{prompt_type}_{safe}.json"
                try:
                    with open(safe_path, "w") as f:
                        json.dump(prompt_data, f, indent=2)
                except Exception:
                    # Give up on writing prompt debug if filesystem is not cooperating
                    pass
            
            # Also save a human-readable version
            try:
                readable_file = output_dir / f"{prompt_type}_{model}_{timestamp}.txt"
                with open(readable_file, "w") as f:
                    f.write(f"Model: {model}\n")
                    f.write(f"Prompt Type: {prompt_type}\n")
                    f.write(f"Timestamp: {timestamp}\n")
                    f.write(f"Approx tokens: {approx_tokens}\n")
                    f.write(f"Total chars: {total_chars}\n")
                    f.write("\n" + "="*80 + "\n\n")
                    
                    for i, msg in enumerate(cleaned_messages):
                        f.write(f"Message {i+1} - Role: {msg['role']}\n")
                        f.write("-"*40 + "\n")
                        
                        if isinstance(msg.get("content"), str):
                            content = msg["content"].replace("\\n", "\n")
                            f.write(content)
                        elif isinstance(msg.get("content"), list):
                            for item in msg["content"]:
                                if isinstance(item, dict) and item.get("type") == "text":
                                    content = item.get("text", "").replace("\\n", "\n")
                                    f.write(content)
                                elif isinstance(item, dict) and item.get("type") == "image":
                                    f.write("[IMAGE EXCLUDED FROM LOG]")
                        
                        f.write("\n\n")
            except Exception:
                pass
            
            print(f"📝 PROMPT SAVED: {prompt_file}")
            print(f"   Model: {model}")
            print(f"   Type: {prompt_type}")
            print(f"   Total approx tokens: {approx_tokens}")
            print(f"   Total chars: {total_chars}")
            print(f"   Messages: {len(messages)}")
            for line in message_breakdown:
                print(line)
            
        except Exception as e:
            print(f"Error saving prompt: {e}")
    
    # get the invoke_kwargs
    invoke_kwargs = kwargs
    
    # Extract stream parameter
    stream = invoke_kwargs.pop('stream', False)
    
    # Filter out temperature for o3/o4 models if it's not 1.0
    if ("o3" in model or "o4" in model) and "temperature" in invoke_kwargs:
        if invoke_kwargs["temperature"] != 1.0:
            # Remove temperature parameter for o3/o4 models that don't support custom values
            invoke_kwargs.pop("temperature", None)
    
    if model in MAX_PARAM:
        if MAX_PARAM[model] is not None:
            invoke_kwargs[MAX_PARAM[model]] = max_tokens
    else:
        invoke_kwargs["max_tokens"] = max_tokens

    if stream:
        invoke_kwargs["stream"] = True
        
    # Note: Gemini handling is done by instructor library internally
    # We don't need to convert messages to contents manually when using instructor
    
    # Separate system message for Claude models
    system_content, filtered_messages = _separate_system_message(messages, model)
    
    # Convert user message with cache delimiter into Anthropic content blocks (for Claude)
    CACHE_DELIM = "\n<<<CACHE_BREAKPOINT>>>\n"
    cache_static_id = None
    if ENABLE_ANTHROPIC_PROMPT_CACHING and isinstance(model, str) and model.startswith("claude"):
        if deck_uuid:
            cache_static_id = f"deck:{deck_uuid}"
        else:
            try:
                import hashlib as _hashlib
                cache_static_id = "deck-hash:" + _hashlib.sha1(
                    json.dumps(messages, sort_keys=True).encode("utf-8")
                ).hexdigest()
            except Exception:
                cache_static_id = "deck:unknown"
        logger.info(f"[CLAUDE CACHE] using cache id {cache_static_id}")

    try:
        for _msg in filtered_messages:
            if _msg.get("role") == "user" and isinstance(_msg.get("content"), str) and CACHE_DELIM in _msg["content"]:
                if model.startswith("claude") and ENABLE_ANTHROPIC_PROMPT_CACHING:
                    pre, post = _msg["content"].split(CACHE_DELIM, 1)
                    cache_control = {"type": "ephemeral"}
                    _msg["content"] = [
                        {"type": "text", "text": pre, "cache_control": cache_control},
                        {"type": "text", "text": post}
                    ]
                else:
                    # Remove delimiter for non-Claude providers to avoid extra tokens
                    _msg["content"] = _msg["content"].replace(CACHE_DELIM, "\n")
    except Exception:
        pass
    
    # Start the trace
    with ls.trace(name="llm-invoke",
                  tags=["llm-invoke"],
                  inputs={
                      "messages": filtered_messages,
                      "system": system_content,
                      "response_model": response_model.model_json_schema() if response_model else None,
                  },
                  metadata={
                      "model": model,
                      "max_tokens": max_tokens,
                      "invoke_kwargs": invoke_kwargs
                }) as rt:
        
        try:
            # If no response_model, use a direct provider-specific call WITHOUT instructor wrappers
            if response_model is None:
                # Recreate a raw (unwrapped) client to avoid Instructor requiring response_model
                try:
                    raw_client, _actual_model = get_client(model, wrap_with_instructor=False)
                    freeform_client = raw_client
                except Exception:
                    # Fallback to the provided client if reconstruction fails
                    freeform_client = client

                # Prefer OpenAI-style chat.completions if available (OpenAI/Perplexity/Groq/Samba)
                if hasattr(freeform_client, 'chat') and hasattr(freeform_client.chat, 'completions'):
                    # Add Perplexity search limits for Perplexity models
                    if model.startswith("perplexity-") or "sonar" in model or model in ["sonar", "sonar-pro", "sonar-reasoning"]:
                        invoke_kwargs = invoke_kwargs.copy()
                        eb = invoke_kwargs.get("extra_body") or {"return_citations": True, "search_recency_filter": "month", "search_domain_filter": []}
                        # Clamp num_search_results to provider bounds [3, 20]
                        try:
                            nsr = int(eb.get("num_search_results", 10))
                            if nsr < 3:
                                nsr = 3
                            elif nsr > 20:
                                nsr = 20
                            eb["num_search_results"] = nsr
                        except Exception:
                            eb["num_search_results"] = 10
                        invoke_kwargs["extra_body"] = eb
                    
                    result = freeform_client.chat.completions.create(
                        model=model,
                        messages=filtered_messages,  # Use filtered messages
                        **invoke_kwargs
                    )
                    content = result.choices[0].message.content
                # Anthropic-style
                elif hasattr(freeform_client, 'messages') and hasattr(freeform_client.messages, 'create'):
                    # Handle system message for Anthropic (support prompt caching)
                    anthropic_kwargs = invoke_kwargs.copy()
                    if system_content:
                        if ENABLE_ANTHROPIC_PROMPT_CACHING and model.startswith("claude"):
                            # Use content blocks with cache_control to enable prompt caching for the system prefix
                            sys_cache = {"type": "ephemeral"}
                            anthropic_kwargs['system'] = [
                                {"type": "text", "text": system_content, "cache_control": sys_cache}
                            ]
                        else:
                            anthropic_kwargs['system'] = system_content
                    if ENABLE_ANTHROPIC_PROMPT_CACHING:
                        _ensure_anthropic_prompt_cache_headers(anthropic_kwargs)
                    result = freeform_client.messages.create(
                        model=model,
                        messages=filtered_messages,
                        **anthropic_kwargs
                    )
                    # Optional: log Anthropic cache metrics
                    try:
                        if LOG_ANTHROPIC_CACHE_METRICS and model.startswith("claude"):
                            logger.info(
                                f"[CLAUDE CACHE] read={getattr(result,'cache_read_input_tokens', None)}, "
                                f"created={getattr(result,'cache_creation_input_tokens', None)}"
                            )
                            print(
                                f"[CLAUDE CACHE] read={getattr(result,'cache_read_input_tokens', None)}, "
                                f"created={getattr(result,'cache_creation_input_tokens', None)}"
                            )
                    except Exception:
                        pass
                    # Extract text content
                    try:
                        content = result.content[0].text
                    except Exception:
                        content = str(result)
                # Gemini-style
                elif hasattr(freeform_client, 'models') and hasattr(freeform_client.models, 'generate_content'):
                    prompt = "\n".join([f"{msg['role']}: {msg['content']}" for msg in filtered_messages])
                    # Add system content if present
                    if system_content:
                        prompt = f"System: {system_content}\n{prompt}"
                    result = freeform_client.models.generate_content(
                        model=f"models/{model}",
                        contents=prompt
                    )
                    content = result.text
                else:
                    raise AttributeError(f"Unknown client type: {type(freeform_client)}")

                rt.end(outputs={"output": content})
                return content
            
            # Perplexity Sonar: avoid Instructor TOOLS mode (which adds unsupported tool_choice)
            # When a typed response is requested for Perplexity, call raw client and parse JSON locally
            if (
                response_model is not None and (
                    model.startswith("perplexity-") or "sonar" in model or model in ["sonar", "sonar-pro", "sonar-reasoning"]
                )
            ):
                try:
                    raw_client, _ = get_client(model, wrap_with_instructor=False)
                except Exception:
                    raw_client = client

                std_kwargs = invoke_kwargs.copy()
                eb2 = std_kwargs.get("extra_body") or {"return_citations": True, "search_recency_filter": "month", "search_domain_filter": []}
                # Ensure YouTube is excluded from Perplexity search domains
                try:
                    existing_filters = eb2.get("search_domain_filter") or []
                    if not isinstance(existing_filters, list):
                        existing_filters = [existing_filters]
                    youtube_exclusions = ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"]
                    merged = list({*existing_filters, *youtube_exclusions})
                    eb2["search_domain_filter"] = merged
                except Exception:
                    eb2["search_domain_filter"] = ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"]
                # Clamp num_search_results to provider bounds [3, 20]
                try:
                    nsr2 = int(eb2.get("num_search_results", 10))
                    if nsr2 < 3:
                        nsr2 = 3
                    elif nsr2 > 20:
                        nsr2 = 20
                    eb2["num_search_results"] = nsr2
                except Exception:
                    eb2["num_search_results"] = 10
                std_kwargs["extra_body"] = eb2

                result = raw_client.chat.completions.create(
                    model=model,
                    messages=filtered_messages,
                    **std_kwargs
                )
                # Parse JSON into the requested Pydantic model
                try:
                    content_text = result.choices[0].message.content
                except Exception:
                    content_text = str(result)
                try:
                    import re as _re
                    import json as _json
                    m = _re.search(r"\{[\s\S]*\}", content_text)
                    payload = _json.loads(m.group(0) if m else content_text)
                    model_obj = response_model(**payload)
                except Exception as _parse_e:
                    # If parsing fails, surface a clear error with a snippet for debugging
                    snippet = (content_text or "")[:500]
                    raise Exception(f"Perplexity typed parse failed: {_parse_e}; snippet: {snippet}")

                if not stream:
                    try:
                        rt.end(outputs={"output": model_obj.model_dump_json()})
                    except Exception:
                        try:
                            rt.end(outputs={"output": json.dumps(model_obj.model_dump())})
                        except Exception:
                            rt.end(outputs={"output": "<pydantic_model>"})
                return model_obj

            # Get the results with validation
            if os.getenv("USE_CACHE") == "true":
                # Update cached function to handle system message
                if system_content and model.startswith("claude"):
                    # Add system parameter to invoke_kwargs for Claude models
                    cache_kwargs = invoke_kwargs.copy()
                    if ENABLE_ANTHROPIC_PROMPT_CACHING:
                        cache_kwargs['system'] = [
                            {"type": "text", "text": system_content, "cache_control": {"type": "ephemeral"}}
                        ]
                    else:
                        cache_kwargs['system'] = system_content
                    result = invoke_with_cache(client, model, filtered_messages, response_model, cache_kwargs)
                else:
                    result = invoke_with_cache(client, model, filtered_messages, response_model, invoke_kwargs)
            else:
                # Check if this is a Gemini client (different API)
                if model.startswith("gemini"):
                    # Gemini doesn't support certain parameters like temperature
                    gemini_kwargs = {k: v for k, v in invoke_kwargs.items() 
                                   if k not in ["temperature", "max_tokens"]}
                    result = client.create(
                        model=model,
                        messages=filtered_messages,
                        response_model=response_model,
                        **gemini_kwargs
                    )
                elif hasattr(client, 'create') and not hasattr(client, 'chat'):
                    # For Claude models with instructor wrapper, add system parameter
                    if system_content and model.startswith("claude"):
                        claude_kwargs = invoke_kwargs.copy()
                        if ENABLE_ANTHROPIC_PROMPT_CACHING:
                            sys_cache = {"type": "ephemeral"}
                            claude_kwargs['system'] = [
                                {"type": "text", "text": system_content, "cache_control": sys_cache}
                            ]
                        else:
                            claude_kwargs['system'] = system_content
                        if ENABLE_ANTHROPIC_PROMPT_CACHING:
                            _ensure_anthropic_prompt_cache_headers(claude_kwargs)
                        # Proactively prewarm cache with raw Anthropic call using the exact content blocks
                        try:
                            raw_client, _ = get_client(model, wrap_with_instructor=False)
                            # Build prewarm system and user static block if available
                            prewarm_system = claude_kwargs.get('system') if ENABLE_ANTHROPIC_PROMPT_CACHING else (system_content or "")
                            prewarm_user = None
                            try:
                                for _m in filtered_messages:
                                    if _m.get('role') == 'user':
                                        c = _m.get('content')
                                        if isinstance(c, list) and len(c) > 0 and isinstance(c[0], dict) and c[0].get('cache_control'):
                                            # Use only the cached static block for prewarm
                                            prewarm_user = [c[0], {"type": "text", "text": "OK"}]
                                        break
                            except Exception:
                                pass
                            if prewarm_user is not None:
                                _ = raw_client.messages.create(
                                    model=model,
                                    system=prewarm_system,
                                    messages=[{"role": "user", "content": prewarm_user}],
                                    max_tokens=1,
                                    temperature=0
                                )
                        except Exception:
                            pass
                        result = client.create(
                            model=model,
                            messages=filtered_messages,
                            response_model=response_model,
                            **claude_kwargs
                        )
                        try:
                            if LOG_ANTHROPIC_CACHE_METRICS and model.startswith("claude"):
                                read, created = _extract_anthropic_cache_metrics(result)
                                logger.info(f"[CLAUDE CACHE] read={read}, created={created}")
                                print(f"[CLAUDE CACHE] read={read}, created={created}")
                        except Exception:
                            pass
                        # Optional: issue a tiny probe call to force cache metrics logging
                        try:
                            if ENABLE_CACHE_METRICS_PROBE and model.startswith("claude"):
                                raw_client, _ = get_client(model, wrap_with_instructor=False)
                                # Build system for probe
                                probe_system = None
                                if ENABLE_ANTHROPIC_PROMPT_CACHING and system_content:
                                    sys_cache = {"type": "ephemeral"}
                                    probe_system = [{"type": "text", "text": system_content, "cache_control": sys_cache}]
                                else:
                                    probe_system = system_content or ""
                                # Build user content: reuse static cached block if present
                                probe_user = [{"type": "text", "text": "OK"}]
                                try:
                                    # Find first user message and reuse its first block if list
                                    for _m in filtered_messages:
                                        if _m.get('role') == 'user':
                                            c = _m.get('content')
                                            if isinstance(c, list) and len(c) > 0 and isinstance(c[0], dict) and c[0].get('cache_control'):
                                                probe_user = [c[0], {"type": "text", "text": "OK"}]
                                            break
                                except Exception:
                                    pass
                                probe_res = raw_client.messages.create(
                                    model=model,
                                    system=probe_system,
                                    messages=[{"role": "user", "content": probe_user}],
                                    max_tokens=1,
                                    temperature=0
                                )
                                pr, pc = _extract_anthropic_cache_metrics(probe_res)
                                logger.info(f"[CLAUDE CACHE PROBE] read={pr}, created={pc}")
                                print(f"[CLAUDE CACHE PROBE] read={pr}, created={pc}")
                        except Exception:
                            pass
                    else:
                        # Other clients that use create() directly
                        if ENABLE_ANTHROPIC_PROMPT_CACHING:
                            _ensure_anthropic_prompt_cache_headers(invoke_kwargs)
                        result = client.create(
                            model=model,
                            messages=filtered_messages,
                            response_model=response_model,
                            **invoke_kwargs
                        )
                else:
                    # Standard OpenAI-style API
                    std_kwargs = invoke_kwargs.copy()
                    if model.startswith("perplexity-") or "sonar" in model or model in ["sonar", "sonar-pro", "sonar-reasoning"]:
                        eb2 = std_kwargs.get("extra_body") or {"return_citations": True, "search_recency_filter": "month", "search_domain_filter": []}
                        # Ensure YouTube is excluded from Perplexity search domains
                        try:
                            existing_filters = eb2.get("search_domain_filter") or []
                            # Normalize to list
                            if not isinstance(existing_filters, list):
                                existing_filters = [existing_filters]
                            youtube_exclusions = ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"]
                            # Merge while preserving any existing filters
                            merged = list({*existing_filters, *youtube_exclusions})
                            eb2["search_domain_filter"] = merged
                        except Exception:
                            eb2["search_domain_filter"] = ["-youtube.com", "-youtu.be", "-www.youtube.com", "-m.youtube.com"]
                        try:
                            nsr2 = int(eb2.get("num_search_results", 10))
                            if nsr2 < 3:
                                nsr2 = 3
                            elif nsr2 > 20:
                                nsr2 = 20
                            eb2["num_search_results"] = nsr2
                        except Exception:
                            eb2["num_search_results"] = 10
                        std_kwargs["extra_body"] = eb2
                    result = client.chat.completions.create(
                        model=model,
                        messages=filtered_messages,
                        response_model=response_model,
                        **std_kwargs
                    )

            if LOG_ANTHROPIC_CACHE_METRICS and isinstance(model, str) and model.startswith("claude"):
                try:
                    read, created = _extract_anthropic_cache_metrics(result)
                    logger.info(f"[CLAUDE CACHE] read={read}, created={created}")
                    print(f"[CLAUDE CACHE] read={read}, created={created}")
                except Exception:
                    pass

            if not stream:
                rt.end(outputs={"output": result.model_dump_json()})
            # For streaming, we can't log the final output here.
            # It could be logged chunk by chunk if necessary.
            return result
        except Exception as e:
            # Handle Anthropic-specific errors
            error_str = str(e)
            error_code = None
            
            # Try to extract error code from Anthropic errors
            if "Error code:" in error_str:
                try:
                    # Extract error code from string like "Error code: 529"
                    error_code = int(error_str.split("Error code:")[1].split()[0])
                except:
                    pass
            
            # Check if it's an HTTPStatusError with status_code
            if hasattr(e, 'response') and hasattr(e.response, 'status_code'):
                error_code = e.response.status_code
            elif hasattr(e, 'status_code'):
                error_code = e.status_code
            
            # Map error codes to our exception types
            if error_code == 529:
                logger.warning(f"Anthropic API overloaded (529): {error_str}")
                raise AIOverloadedError(
                    "AI service is temporarily overloaded",
                    cause=e,
                    context={'model': model, 'deck_uuid': deck_uuid}
                )
            elif error_code == 429:
                logger.warning(f"Rate limit exceeded (429): {error_str}")
                raise AIRateLimitError(
                    "Rate limit exceeded",
                    cause=e,
                    context={'model': model, 'deck_uuid': deck_uuid}
                )
            elif error_code == 504 or error_code == 502:
                logger.warning(f"Gateway timeout ({error_code}): {error_str}")
                raise AITimeoutError(
                    f"AI service timeout (HTTP {error_code})",
                    cause=e,
                    context={'model': model, 'deck_uuid': deck_uuid}
                )
            else:
                # Retry once without prompt caching if Anthropic rejects cache_control
                try:
                    should_retry_without_cache = (
                        (error_code == 400 or 'invalid_request' in error_str or 'invalid_request_error' in error_str)
                        and (
                            'cache_control' in error_str or 'Extra inputs are not permitted' in error_str
                            or 'ephemeral' in error_str
                        )
                        and isinstance(model, str) and model.startswith('claude')
                    )
                except Exception:
                    should_retry_without_cache = False

                if should_retry_without_cache:
                    try:
                        logger.warning("Anthropic rejected cache_control; retrying once without caching")

                        # Remove cache_control from any content blocks
                        def _strip_cache_from_messages(msgs):
                            sanitized = []
                            for m in msgs:
                                c = m.get('content')
                                if isinstance(c, list):
                                    new_list = []
                                    for b in c:
                                        if isinstance(b, dict) and 'cache_control' in b:
                                            bd = {k: v for k, v in b.items() if k != 'cache_control'}
                                            new_list.append(bd)
                                        else:
                                            new_list.append(b)
                                    sanitized.append({**m, 'content': new_list})
                                else:
                                    sanitized.append(m)
                            return sanitized

                        def _flatten_system(sys_content):
                            if isinstance(sys_content, list):
                                try:
                                    return "".join(
                                        [blk.get('text', '') for blk in sys_content if isinstance(blk, dict) and blk.get('type') == 'text']
                                    )
                                except Exception:
                                    return sys_content
                            return sys_content

                        sanitized_messages = _strip_cache_from_messages(filtered_messages)
                        sanitized_system = _flatten_system(system_content)

                        # Re-issue the request without any cache-related fields
                        if response_model is None:
                            try:
                                raw_client, _actual_model = get_client(model, wrap_with_instructor=False)
                                freeform_client = raw_client
                            except Exception:
                                freeform_client = client

                            if hasattr(freeform_client, 'chat') and hasattr(freeform_client.chat, 'completions'):
                                result2 = freeform_client.chat.completions.create(
                                    model=model,
                                    messages=sanitized_messages,
                                    **invoke_kwargs
                                )
                                content2 = result2.choices[0].message.content
                                rt.end(outputs={"output": content2})
                                return content2
                            elif hasattr(freeform_client, 'messages') and hasattr(freeform_client.messages, 'create'):
                                anthropic_kwargs2 = invoke_kwargs.copy()
                                anthropic_kwargs2.pop('system', None)
                                if sanitized_system:
                                    anthropic_kwargs2['system'] = sanitized_system
                                # Ensure no beta cache header is required; but keeping it is harmless
                                result2 = freeform_client.messages.create(
                                    model=model,
                                    messages=sanitized_messages,
                                    **anthropic_kwargs2
                                )
                                try:
                                    content2 = result2.content[0].text
                                except Exception:
                                    content2 = str(result2)
                                rt.end(outputs={"output": content2})
                                return content2
                            elif hasattr(freeform_client, 'models') and hasattr(freeform_client.models, 'generate_content'):
                                prompt2 = "\n".join([f"{msg['role']}: {msg['content']}" for msg in sanitized_messages])
                                if sanitized_system:
                                    prompt2 = f"System: {sanitized_system}\n{prompt2}"
                                result2 = freeform_client.models.generate_content(
                                    model=f"models/{model}",
                                    contents=prompt2
                                )
                                content2 = result2.text
                                rt.end(outputs={"output": content2})
                                return content2
                        else:
                            # Typed/Instructor path: call provider directly to avoid re-inserting cache_control
                            if model.startswith('gemini'):
                                gemini_kwargs2 = {k: v for k, v in invoke_kwargs.items() if k not in ["temperature", "max_tokens"]}
                                result2 = client.create(
                                    model=model,
                                    messages=sanitized_messages,
                                    response_model=response_model,
                                    **gemini_kwargs2
                                )
                                if not stream:
                                    try:
                                        rt.end(outputs={"output": result2.model_dump_json()})
                                    except Exception:
                                        try:
                                            rt.end(outputs={"output": json.dumps(result2.model_dump())})
                                        except Exception:
                                            rt.end(outputs={"output": "<pydantic_model>"})
                                return result2
                            elif hasattr(client, 'create') and not hasattr(client, 'chat'):
                                claude_kwargs2 = invoke_kwargs.copy()
                                if sanitized_system is not None:
                                    claude_kwargs2['system'] = sanitized_system
                                result2 = client.create(
                                    model=model,
                                    messages=sanitized_messages,
                                    response_model=response_model,
                                    **claude_kwargs2
                                )
                                if LOG_ANTHROPIC_CACHE_METRICS and model.startswith("claude"):
                                    try:
                                        read2, created2 = _extract_anthropic_cache_metrics(result2)
                                        logger.info(f"[CLAUDE CACHE RETRY DISABLED] read={read2}, created={created2}")
                                        print(f"[CLAUDE CACHE RETRY DISABLED] read={read2}, created={created2}")
                                    except Exception:
                                        pass
                                if not stream:
                                    try:
                                        rt.end(outputs={"output": result2.model_dump_json()})
                                    except Exception:
                                        try:
                                            rt.end(outputs={"output": json.dumps(result2.model_dump())})
                                        except Exception:
                                            rt.end(outputs={"output": "<pydantic_model>"})
                                return result2
                            elif hasattr(client, 'chat') and hasattr(client.chat, 'completions'):
                                result2 = client.chat.completions.create(
                                    model=model,
                                    messages=sanitized_messages,
                                    response_model=response_model,
                                    **invoke_kwargs
                                )
                                if not stream:
                                    try:
                                        rt.end(outputs={"output": result2.model_dump_json()})
                                    except Exception:
                                        try:
                                            rt.end(outputs={"output": json.dumps(result2.model_dump())})
                                        except Exception:
                                            rt.end(outputs={"output": "<pydantic_model>"})
                                return result2
                    except Exception:
                        # If retry fails, fall through to standard error handling below
                        pass

                # Standard error mapping
                # Log the full error for debugging
                logger.error(f"Error during LLM invocation: {e}")
                rt.end(outputs={"output": json.dumps({"error": f"LLM invocation failed: {str(e)}"})})
                # Re-raise as AIGenerationError for other errors
                raise AIGenerationError(
                    f"AI generation failed: {error_str}",
                    cause=e,
                    context={'model': model, 'deck_uuid': deck_uuid, 'error_code': error_code}
                )

# Export useful constants
__all__ = [
    'get_client',
    'invoke',
    'get_max_tokens_for_model',
    'MODEL_MAX_TOKENS',
    'DEFAULT_SLIDE_MAX_TOKENS',
    'MODELS',
    'CLIENTS',
    'MAX_PARAM'
]
ANTHROPIC_PROMPT_CACHE_BETA = "prompt-caching-2024-07-31"


def _ensure_anthropic_prompt_cache_headers(kwargs: Dict[str, Any]) -> None:
    """Attach Anthropic prompt caching beta header to request kwargs."""
    try:
        headers = kwargs.setdefault('extra_headers', {})
        if isinstance(headers, dict) and 'anthropic-beta' not in headers:
            headers['anthropic-beta'] = ANTHROPIC_PROMPT_CACHE_BETA
    except Exception:
        pass
