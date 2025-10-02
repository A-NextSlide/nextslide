"""
Exception hierarchy for generation system.

Provides specific exceptions for different failure scenarios
to enable proper error handling and recovery.
"""

from typing import Optional, Dict, Any


class GenerationError(Exception):
    """Base exception for all generation errors"""
    
    def __init__(
        self,
        message: str,
        cause: Optional[Exception] = None,
        context: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.cause = cause
        self.context = context or {}
        
    def __str__(self):
        parts = [super().__str__()]
        if self.cause:
            parts.append(f" (caused by: {type(self.cause).__name__}: {str(self.cause)})")
        if self.context:
            parts.append(f" Context: {self.context}")
        return "".join(parts)


# === AI-related exceptions ===

class AIGenerationError(GenerationError):
    """AI model failed to generate content"""
    pass


class AITimeoutError(AIGenerationError):
    """AI generation timed out"""
    pass


class AIRateLimitError(AIGenerationError):
    """AI API rate limit exceeded"""
    pass


class AIOverloadedError(AIGenerationError):
    """AI service is overloaded (HTTP 529)"""
    pass


class AIInvalidResponseError(AIGenerationError):
    """AI returned invalid or unparseable response"""
    pass


# === Validation exceptions ===

class ValidationError(GenerationError):
    """Content validation failed"""
    pass


class ComponentValidationError(ValidationError):
    """Component failed validation"""
    
    def __init__(self, component_type: str, message: str, **kwargs):
        super().__init__(message, **kwargs)
        self.component_type = component_type


class SchemaValidationError(ValidationError):
    """Schema validation failed"""
    pass


# === Media exceptions ===

class MediaProcessingError(GenerationError):
    """Media processing failed"""
    pass


class ImageUploadError(MediaProcessingError):
    """Failed to upload image"""
    pass


class ImageFormatError(MediaProcessingError):
    """Unsupported or invalid image format"""
    pass


class ImageSizeError(MediaProcessingError):
    """Image exceeds size limits"""
    pass


# === RAG exceptions ===

class RAGError(GenerationError):
    """RAG system error"""
    pass


class RAGContextError(RAGError):
    """Failed to retrieve RAG context"""
    pass


class RAGKnowledgeBaseError(RAGError):
    """Knowledge base error"""
    pass


# === Orchestration exceptions ===

class OrchestrationError(GenerationError):
    """Orchestration error"""
    pass


class SlideGenerationError(OrchestrationError):
    """Single slide generation failed"""
    
    def __init__(self, slide_index: int, slide_title: str, message: str, **kwargs):
        super().__init__(message, **kwargs)
        self.slide_index = slide_index
        self.slide_title = slide_title
        self.context.update({
            'slide_index': slide_index,
            'slide_title': slide_title
        })


class DeckGenerationError(OrchestrationError):
    """Deck generation failed"""
    
    def __init__(self, deck_id: str, message: str, failed_slides: Optional[list] = None, **kwargs):
        super().__init__(message, **kwargs)
        self.deck_id = deck_id
        self.failed_slides = failed_slides or []
        self.context.update({
            'deck_id': deck_id,
            'failed_slides': self.failed_slides
        })


# === Persistence exceptions ===

class PersistenceError(GenerationError):
    """Data persistence error"""
    pass


class SaveError(PersistenceError):
    """Failed to save data"""
    pass


class LoadError(PersistenceError):
    """Failed to load data"""
    pass


# === Configuration exceptions ===

class ConfigurationError(GenerationError):
    """Configuration error"""
    pass


class InvalidConfigError(ConfigurationError):
    """Invalid configuration value"""
    pass


class MissingConfigError(ConfigurationError):
    """Required configuration missing"""
    pass


# === Recovery helpers ===

def is_retryable(error: Exception) -> bool:
    """Check if error is retryable"""
    retryable_types = (
        AITimeoutError,
        AIRateLimitError,
        AIOverloadedError,  # Add 529 errors as retryable
        ImageUploadError,
        SaveError,
    )
    return isinstance(error, retryable_types)


def get_retry_delay(error: Exception, attempt: int) -> float:
    """Get retry delay for error"""
    if isinstance(error, AIOverloadedError):
        # For 529 errors, use exponential backoff with jitter
        base_delay = 10.0  # Increased from 5.0 to 10.0
        max_delay = 120.0  # Increased from 60.0 to 120.0
        delay = min(max_delay, base_delay * (2 ** attempt))
        # Add jitter to prevent thundering herd
        import random
        jitter = random.uniform(0, delay * 0.2)  # Increased jitter from 0.1 to 0.2
        return delay + jitter
    elif isinstance(error, AIRateLimitError):
        # Longer delay for rate limits
        return min(60.0, 10.0 * (2 ** attempt))
    elif isinstance(error, AITimeoutError):
        # Exponential backoff for timeouts
        return min(30.0, 2.0 * (2 ** attempt))
    else:
        # Default exponential backoff
        return min(10.0, 1.0 * (2 ** attempt))


def should_skip_slide(error: Exception) -> bool:
    """Check if we should skip the slide and continue"""
    skippable_types = (
        ComponentValidationError,
        ImageFormatError,
        ImageSizeError,
    )
    return isinstance(error, skippable_types) 