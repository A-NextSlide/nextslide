import logging
import os

# Modules whose INFO logs we suppress during startup (restored by startup_complete())
_STARTUP_NOISY_MODULES = [
    "services.enhanced_font_service",
    "agents.editing.fast_path",
    "agents.editing.classifier",
    "agents.editing.orchestrator_cache",
    "services.stripe_service",
    "services.api_rate_limiter",
]


def setup_logging(level: str = "INFO") -> None:
    """Minimal logging setup compatible with previous imports.

    - Sets root logger level
    - Ensures a basic StreamHandler is attached once
    - Silences noisy third-party loggers
    - Suppresses startup-noisy modules to WARNING (restored by startup_complete())
    """
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        env = os.getenv("ENV", os.getenv("ENVIRONMENT", "development")).lower()
        if env in ("development", "dev"):
            fmt = "%(asctime)s  %(levelname)-5s  %(message)s"
            datefmt = "%H:%M:%S"
        else:
            fmt = "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
            datefmt = None
        formatter = logging.Formatter(fmt, datefmt=datefmt)
        handler.setFormatter(formatter)
        root.addHandler(handler)
    try:
        root.setLevel(getattr(logging, level.upper()))
    except Exception:
        root.setLevel(logging.INFO)

    # Silence noisy third-party loggers
    logging.getLogger("httpx").setLevel(logging.WARNING)
    logging.getLogger("httpcore").setLevel(logging.WARNING)
    logging.getLogger("watchfiles").setLevel(logging.WARNING)
    # Silence very noisy server access logs (keeps errors)
    logging.getLogger("uvicorn.access").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.error").setLevel(logging.INFO)

    # Suppress startup-noisy modules (they log during import / warmup)
    for mod in _STARTUP_NOISY_MODULES:
        logging.getLogger(mod).setLevel(logging.WARNING)


def startup_complete() -> None:
    """Restore normal log levels after startup display is done."""
    for mod in _STARTUP_NOISY_MODULES:
        logging.getLogger(mod).setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Return a module logger after ensuring logging is initialized."""
    if not logging.getLogger().handlers:
        setup_logging()
    return logging.getLogger(name)
