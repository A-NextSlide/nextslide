import asyncio
from typing import Optional

from .models import OutlineOptions


class SlideGeneratorModelMixin:

    async def _call_progress(self, callback, slide_index: int, total_slides: int, slide_type: str):
        """Call progress callback"""
        from .models import ProgressUpdate
        
        update = ProgressUpdate(
            stage="generating",
            message=f"Generating {slide_type} slide {slide_index + 1} with chart...",
            progress=20 + (slide_index * 50 / total_slides)
        )
        
        if asyncio.iscoroutinefunction(callback):
            await callback(update)
        else:
            callback(update)

    def _get_model(self, task: str, options: Optional[OutlineOptions] = None) -> str:
        """Select model for task"""
        if options and options.model:
            return options.model
        
        # Import here to avoid circular dependency
        from agents.config import OUTLINE_CONTENT_MODEL
        return OUTLINE_CONTENT_MODEL

    def _requires_default_temperature(self, model_name: str) -> bool:
        """Check if model requires default temperature"""
        return "o3" in model_name or "o4" in model_name
