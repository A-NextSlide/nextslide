"""
Configuration management for generation system.

Centralized configuration with:
- Type safety
- Environment variable support
- Validation
- Documentation
"""

import os
from dataclasses import dataclass, field
from typing import Optional, Dict, Any
from functools import lru_cache
from agents.config import ENABLE_VISUAL_ANALYSIS

# Import global config for fallback values
try:
    from agents import config as global_config
except ImportError:
    global_config = None


@dataclass
class AIConfig:
    """AI model configuration"""
    model: str = field(default_factory=lambda: os.getenv('AI_MODEL', 'gpt-4-0125-preview'))
    temperature: float = field(default_factory=lambda: float(os.getenv('AI_TEMPERATURE', '0.7')))
    max_tokens: int = field(default_factory=lambda: int(os.getenv('AI_MAX_TOKENS', '4000')))
    timeout_seconds: int = field(default_factory=lambda: int(os.getenv('AI_TIMEOUT', '60')))
    max_retries: int = field(default_factory=lambda: int(os.getenv('AI_MAX_RETRIES', '3')))
    retry_delay: float = field(default_factory=lambda: float(os.getenv('AI_RETRY_DELAY', '1.0')))


@dataclass
class GenerationConfig:
    """Configuration for slide generation."""
    
    # Resource limits
    max_workers: int = field(default_factory=lambda: int(os.getenv('MAX_WORKERS', '4')))
    ai_thread_timeout: int = field(default_factory=lambda: int(os.getenv('AI_THREAD_TIMEOUT', '60')))
    
    # Parallelization settings
    max_parallel_slides: int = field(default_factory=lambda: int(os.getenv('MAX_PARALLEL_SLIDES', '4')))
    delay_between_slides: float = field(default_factory=lambda: float(os.getenv('DELAY_BETWEEN_SLIDES', '0.5')))
    enable_concurrent_images: bool = field(default_factory=lambda: os.getenv('ENABLE_CONCURRENT_IMAGES', 'true').lower() == 'true')
    
    # Async settings
    async_images: bool = field(default_factory=lambda: os.getenv('ASYNC_IMAGES', 'true').lower() == 'true')
    prefetch_images: bool = field(default_factory=lambda: os.getenv('PREFETCH_IMAGES', 'false').lower() == 'true')
    
    # Retry configuration
    max_retries: int = field(default_factory=lambda: int(os.getenv('MAX_RETRIES', '2')))
    retry_delay: float = field(default_factory=lambda: float(os.getenv('RETRY_DELAY', '1.0')))
    
    # Quality settings
    strict_mode: bool = field(default_factory=lambda: os.getenv('STRICT_MODE', 'false').lower() == 'true')
    enable_visual_analysis: bool = field(default_factory=lambda: ENABLE_VISUAL_ANALYSIS)


@dataclass
class RAGConfig:
    """RAG system configuration"""
    max_context_chars: int = field(default_factory=lambda: int(os.getenv('RAG_MAX_CONTEXT', '32000')))
    min_relevance_score: float = field(default_factory=lambda: float(os.getenv('RAG_MIN_RELEVANCE', '0.7')))
    max_components_predicted: int = field(default_factory=lambda: int(os.getenv('RAG_MAX_COMPONENTS', '30')))
    enable_compression: bool = field(default_factory=lambda: os.getenv('RAG_COMPRESSION', 'true').lower() == 'true')


@dataclass
class MediaConfig:
    """Media processing configuration"""
    max_image_size_mb: int = field(default_factory=lambda: int(os.getenv('MAX_IMAGE_SIZE_MB', '10')))
    supported_image_formats: list = field(default_factory=lambda: ['png', 'jpg', 'jpeg', 'gif', 'webp'])
    image_quality: int = field(default_factory=lambda: int(os.getenv('IMAGE_QUALITY', '85')))
    enable_image_optimization: bool = field(default_factory=lambda: os.getenv('OPTIMIZE_IMAGES', 'true').lower() == 'true')
    supabase_bucket: str = field(default_factory=lambda: os.getenv('SUPABASE_BUCKET', 'deck-assets'))


@dataclass
class LogConfig:
    """Logging configuration"""
    level: str = field(default_factory=lambda: os.getenv('LOG_LEVEL', 'INFO'))
    format: str = field(default_factory=lambda: os.getenv('LOG_FORMAT', 'json'))
    enable_performance_logging: bool = field(default_factory=lambda: os.getenv('LOG_PERFORMANCE', 'true').lower() == 'true')
    enable_ai_logging: bool = field(default_factory=lambda: os.getenv('LOG_AI_CALLS', 'false').lower() == 'true')


@dataclass
class Config:
    """Master configuration"""
    ai: AIConfig = field(default_factory=AIConfig)
    generation: GenerationConfig = field(default_factory=GenerationConfig)
    rag: RAGConfig = field(default_factory=RAGConfig)
    media: MediaConfig = field(default_factory=MediaConfig)
    logging: LogConfig = field(default_factory=LogConfig)
    
    # Feature flags
    use_new_generator: bool = field(default_factory=lambda: os.getenv('USE_NEW_GENERATOR', 'true').lower() == 'true')
    enable_caching: bool = field(default_factory=lambda: os.getenv('ENABLE_CACHING', 'true').lower() == 'true')
    enable_metrics: bool = field(default_factory=lambda: os.getenv('ENABLE_METRICS', 'false').lower() == 'true')
    
    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary for serialization"""
        return {
            'ai': {
                'model': self.ai.model,
                'temperature': self.ai.temperature,
                'max_tokens': self.ai.max_tokens,
                'timeout_seconds': self.ai.timeout_seconds,
                'max_retries': self.ai.max_retries
            },
            'generation': {
                'max_parallel_slides': self.generation.max_parallel_slides,
                'slide_timeout_seconds': self.generation.slide_timeout_seconds,
                'delay_between_slides': self.generation.delay_between_slides,
                'enable_visual_analysis': self.generation.enable_visual_analysis,
                'async_images': self.generation.async_images
            },
            'rag': {
                'max_context_chars': self.rag.max_context_chars,
                'min_relevance_score': self.rag.min_relevance_score,
                'max_components_predicted': self.rag.max_components_predicted
            },
            'media': {
                'max_image_size_mb': self.media.max_image_size_mb,
                'supported_formats': self.media.supported_image_formats,
                'image_quality': self.media.image_quality
            },
            'logging': {
                'level': self.logging.level,
                'format': self.logging.format
            },
            'features': {
                'use_new_generator': self.use_new_generator,
                'enable_caching': self.enable_caching,
                'enable_metrics': self.enable_metrics
            }
        }
    
    def validate(self) -> None:
        """Validate configuration values"""
        # AI validation
        if self.ai.temperature < 0 or self.ai.temperature > 2:
            raise ValueError(f"AI temperature must be between 0 and 2, got {self.ai.temperature}")
        
        if self.ai.max_tokens < 100:
            raise ValueError(f"AI max_tokens must be at least 100, got {self.ai.max_tokens}")
        
        # Generation validation
        if self.generation.max_parallel_slides < 1:
            raise ValueError(f"max_parallel_slides must be at least 1, got {self.generation.max_parallel_slides}")
        
        if self.generation.slide_timeout_seconds < 10:
            raise ValueError(f"slide_timeout_seconds must be at least 10, got {self.generation.slide_timeout_seconds}")
        
        # RAG validation
        if self.rag.min_relevance_score < 0 or self.rag.min_relevance_score > 1:
            raise ValueError(f"min_relevance_score must be between 0 and 1, got {self.rag.min_relevance_score}")
        
        # Media validation
        if self.media.max_image_size_mb < 1:
            raise ValueError(f"max_image_size_mb must be at least 1, got {self.media.max_image_size_mb}")
        
        if self.media.image_quality < 1 or self.media.image_quality > 100:
            raise ValueError(f"image_quality must be between 1 and 100, got {self.media.image_quality}")


@lru_cache(maxsize=1)
def get_config() -> Config:
    """Get singleton configuration instance"""
    config = Config()
    config.validate()
    return config


def get_config_dict() -> Dict[str, Any]:
    """Get configuration as dictionary"""
    return get_config().to_dict()


# Convenience functions for common config access
def get_ai_config() -> AIConfig:
    """Get AI configuration"""
    return get_config().ai


def get_generation_config() -> GenerationConfig:
    """Get generation configuration"""
    return get_config().generation


def get_rag_config() -> RAGConfig:
    """Get RAG configuration"""
    return get_config().rag


def get_media_config() -> MediaConfig:
    """Get media configuration"""
    return get_config().media 