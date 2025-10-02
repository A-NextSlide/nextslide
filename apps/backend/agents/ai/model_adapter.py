"""
Model adapter for handling different AI providers' schema requirements.
Now all providers use the full model with schema injection in prompts.
"""

from typing import Dict, Any, Type, Optional
from pydantic import BaseModel
from models.registry import ComponentRegistry
import logging

logger = logging.getLogger(__name__)

class ModelAdapter:
    """Adapts models based on AI provider capabilities"""
    
    # All providers now use the same approach with schema injection
    COMPLEX_SCHEMA_PROVIDERS = {"anthropic", "openai", "gemini", "groq"}
    
    @staticmethod
    def get_slide_model_for_provider(provider: str, registry: Optional[ComponentRegistry] = None) -> Type[BaseModel]:
        """
        Get the appropriate slide model based on the AI provider.
        Now all providers use the full model with schema injection.
        
        Args:
            provider: The AI provider type (e.g., "gemini", "anthropic", "openai")
            registry: Component registry for complex models
            
        Returns:
            The complex SlideModel from registry
        """
        if registry:
            return registry.SlideModel
        else:
            raise ValueError("Registry is required for slide generation")
    
    @staticmethod
    def get_provider_from_model(model_name: str) -> str:
        """
        Determine the provider type from the model name.
        
        Args:
            model_name: The model name (e.g., "gemini-2.5-flash", "gpt-4o-mini")
            
        Returns:
            The provider type
        """
        if model_name.startswith("gemini"):
            return "gemini"
        elif model_name.startswith("claude"):
            return "anthropic"
        elif model_name.startswith("gpt") or model_name.startswith("o3") or model_name.startswith("o4"):
            return "openai"
        elif model_name.startswith("llama") or model_name.startswith("mistral") or model_name.startswith("deepseek"):
            return "groq"
        else:
            # Default to simple schema for unknown providers
            return "unknown" 