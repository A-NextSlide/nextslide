"""
Environment-specific logging configuration
"""
import os
from typing import Dict, Any


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
    import logging
    
    if config is None:
        config = get_logging_config()
    
    # Set default logging level
    logging.getLogger().setLevel(getattr(logging, config["default_level"]))
    
    # Configure console handler format
    console_handler = logging.StreamHandler()
    console_handler.setFormatter(logging.Formatter(config["console_format"]))
    
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