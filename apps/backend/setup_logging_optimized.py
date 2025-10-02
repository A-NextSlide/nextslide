import logging


def setup_logging(level: str = "INFO") -> None:
    """Minimal logging setup compatible with previous imports.

    - Sets root logger level
    - Ensures a basic StreamHandler is attached once
    """
    root = logging.getLogger()
    if not root.handlers:
        handler = logging.StreamHandler()
        formatter = logging.Formatter(
            "%(asctime)s - %(name)s - %(levelname)s - %(message)s"
        )
        handler.setFormatter(formatter)
        root.addHandler(handler)
    try:
        root.setLevel(getattr(logging, level.upper()))
    except Exception:
        root.setLevel(logging.INFO)


def get_logger(name: str) -> logging.Logger:
    """Return a module logger after ensuring logging is initialized."""
    if not logging.getLogger().handlers:
        setup_logging()
    return logging.getLogger(name)


