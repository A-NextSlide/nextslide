"""
Environment-specific logging configuration
"""
import os
import re
import logging
from typing import Dict, Any


# =============================================================================
# PII REDACTION FILTER
# =============================================================================
# This filter automatically scrubs sensitive data from log messages in
# production to prevent PII leakage. It catches anything that slips through
# manual redaction as a safety net.

class PIIRedactionFilter(logging.Filter):
    """
    Logging filter that redacts Personally Identifiable Information (PII)
    and sensitive credentials from log messages.

    Redacts:
      - Email addresses         -> [EMAIL_REDACTED]
      - Bearer / JWT tokens     -> [TOKEN_REDACTED]
      - Long base64-ish strings -> [TOKEN_REDACTED]
      - API keys (sk-*, pk_*, ns_live_*, key-*) -> [KEY_REDACTED]
    """

    # Pre-compiled patterns for performance
    _EMAIL_RE = re.compile(
        r'[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\.[a-zA-Z0-9-.]+'
    )
    _BEARER_RE = re.compile(
        r'(?i)(bearer\s+)[A-Za-z0-9\-_\.]+',
    )
    _JWT_RE = re.compile(
        r'eyJ[A-Za-z0-9\-_]+\.eyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+'
    )
    _BASE64_LONG_RE = re.compile(
        r'[A-Za-z0-9\-_]{40,}'
    )
    _API_KEY_RE = re.compile(
        r'(?:sk-|pk_|ns_live_|key-)[A-Za-z0-9\-_]{8,}'
    )

    def filter(self, record: logging.LogRecord) -> bool:
        """Redact PII from the log record message and args, then allow it."""
        if isinstance(record.msg, str):
            record.msg = self._redact(record.msg)
        # Also redact any string arguments that get formatted into the message
        if record.args:
            if isinstance(record.args, dict):
                record.args = {
                    k: self._redact(v) if isinstance(v, str) else v
                    for k, v in record.args.items()
                }
            elif isinstance(record.args, tuple):
                record.args = tuple(
                    self._redact(a) if isinstance(a, str) else a
                    for a in record.args
                )
        return True

    def _redact(self, text: str) -> str:
        """Apply all redaction patterns to a string."""
        # Order matters: JWT before generic base64 to get a cleaner match
        text = self._API_KEY_RE.sub('[KEY_REDACTED]', text)
        text = self._BEARER_RE.sub(r'\1[TOKEN_REDACTED]', text)
        text = self._JWT_RE.sub('[TOKEN_REDACTED]', text)
        text = self._EMAIL_RE.sub('[EMAIL_REDACTED]', text)
        text = self._BASE64_LONG_RE.sub('[TOKEN_REDACTED]', text)
        return text


def get_logging_config() -> Dict[str, Any]:
    """Get logging configuration based on environment"""
    
    # Detect environment
    is_production = os.getenv("RENDER") is not None or os.getenv("ENV") == "production"
    is_development = not is_production
    is_debug = os.getenv("DEBUG", "false").lower() == "true"
    
    # Base configuration
    config = {
        "production": {
            # Production: Minimal logging
            "default_level": "WARNING",
            "console_format": "%(levelname)s - %(message)s",
            "show_timestamps": False,
            "log_requests": False,  # Don't log every request
            "log_images": False,    # Don't log image searches
            "log_outlines": True,   # Keep outline generation logs
            "dedup_window": 300,    # 5 minutes deduplication
            "progress_thresholds": [0, 50, 100],  # Only log 0%, 50%, 100%
            "suppress_modules": [   # Modules to suppress in production
                "agents.generation.image_manager",
                "services.combined_image_service",
                "agents.generation.adapters",
                "agents.persistence.deck_persistence",
                "services.serpapi_service",
                "services.image_storage_service"
            ]
        },
        "development": {
            # Development: More verbose but organized
            "default_level": "INFO",
            "console_format": "%(asctime)s - %(levelname)s - %(message)s",
            "show_timestamps": True,
            "log_requests": True,
            "log_images": True,
            "log_outlines": True,
            "dedup_window": 60,     # 1 minute deduplication
            "progress_thresholds": [0, 25, 50, 75, 100],
            "suppress_modules": []  # Don't suppress any modules in dev
        },
        "debug": {
            # Debug: Everything
            "default_level": "DEBUG",
            "console_format": "%(asctime)s - %(name)s - %(levelname)s - [%(filename)s:%(lineno)d] - %(message)s",
            "show_timestamps": True,
            "log_requests": True,
            "log_images": True,
            "log_outlines": True,
            "dedup_window": 0,      # No deduplication in debug
            "progress_thresholds": [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100],
            "suppress_modules": []  # Don't suppress any modules in debug
        }
    }
    
    # Select appropriate config
    if is_debug:
        selected_config = config["debug"]
    elif is_production:
        selected_config = config["production"]
    else:
        selected_config = config["development"]
    
    # Add environment indicator
    selected_config["environment"] = "debug" if is_debug else ("production" if is_production else "development")
    
    return selected_config


def apply_logging_config(config: Dict[str, Any] = None):
    """Apply logging configuration to Python's logging system"""

    if config is None:
        config = get_logging_config()

    # Set default logging level
    logging.getLogger().setLevel(getattr(logging, config["default_level"]))

    # Configure console handler format
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(config["console_format"]))

    # Attach PII redaction filter in production so any accidentally logged
    # emails, tokens, or API keys are scrubbed before they hit the log sink.
    if config.get("environment") == "production":
        console_handler.addFilter(PIIRedactionFilter())

    # Remove existing handlers and add new one
    root_logger = logging.getLogger()
    root_logger.handlers = []
    root_logger.addHandler(console_handler)
    
    # Suppress verbose modules in production
    for module in config.get("suppress_modules", []):
        logging.getLogger(module).setLevel(logging.WARNING)
    
    # Special handling for specific loggers
    if config["environment"] == "production":
        # Suppress image search details
        logging.getLogger("services.combined_image_service").setLevel(logging.WARNING)
        logging.getLogger("agents.generation.image_manager").setLevel(logging.WARNING)
        logging.getLogger("services.serpapi_service").setLevel(logging.WARNING)
        
        # Reduce verbosity of deck persistence
        logging.getLogger("agents.persistence.deck_persistence").setLevel(logging.WARNING)
        
        # Only show important theme messages
        logging.getLogger("agents.generation.theme_style_manager").setLevel(logging.INFO)
    
    return config 