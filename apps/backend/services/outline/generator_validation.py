import asyncio
from typing import Optional

from agents.config import OUTLINE_CONTENT_MODEL, OUTLINE_PLANNING_MODEL, OUTLINE_RESEARCH_MODEL

from .models import OutlineOptions, SlideContent


class OutlineGeneratorValidationMixin:

    def _validate_slide_count(self, outline_plan: dict, options: OutlineOptions) -> dict:
        """Deprecated: do not adjust counts in code. Kept for compatibility."""
        return outline_plan

    def _final_validation(self, slides: list[SlideContent], options: OutlineOptions) -> list[SlideContent]:
        """No code-based enforcement of slide counts; return slides as generated."""
        return slides

    async def _call_progress(self, callback, update):
        """Call progress callback safely"""
        if asyncio.iscoroutinefunction(callback):
            await callback(update)
        else:
            callback(update)

    def _get_model(self, task: str, options: Optional[OutlineOptions] = None) -> str:
        """Select model for task with per-phase overrides."""
        # Per-phase explicit overrides take precedence
        if options:
            if task == "planning" and getattr(options, "planning_model", None):
                return options.planning_model
            if task == "content" and getattr(options, "content_model", None):
                return options.content_model
            if task == "research" and getattr(options, "research_model", None):
                return options.research_model
            # Legacy global override applies to all tasks if set
            if getattr(options, "model", None):
                return options.model
        
        models = {
            "planning": OUTLINE_PLANNING_MODEL,
            "content": OUTLINE_CONTENT_MODEL,
            "research": OUTLINE_RESEARCH_MODEL
        }
        return models.get(task, OUTLINE_CONTENT_MODEL)

    def _enforce_word_limits_presentation(self, content: str, slide_title: str, slide_type: str = 'content') -> str:
        """No code-based word trimming; defer to the model."""
        _ = slide_title
        _ = slide_type
        return content
