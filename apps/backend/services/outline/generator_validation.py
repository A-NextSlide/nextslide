import asyncio
import json
import time
import uuid
import os
import re
from typing import Dict, Any, Optional, List, AsyncGenerator, Tuple

from dotenv import load_dotenv

from .models import (
    OutlineOptions, OutlineResult, SlideContent,
    ProgressUpdate, ChartData
)
from .planner import OutlinePlanner
from .slide_generator import SlideGenerator
from .chart_generator import ChartGenerator
from .media_manager import MediaManager
from .chart_normalization import normalize_slide_chart_fields
from agents.ai.clients import get_client, invoke
from agents.config import (
    OUTLINE_PLANNING_MODEL, OUTLINE_CONTENT_MODEL,
    OUTLINE_RESEARCH_MODEL,
    USE_PERPLEXITY_FOR_OUTLINE, PERPLEXITY_OUTLINE_MODEL,
    PRESENTATION_OUTLINE_MODEL, USE_HYBRID_RESEARCH_MODE
)
from agents.research import OutlineResearchAgent
from agents import config as agents_config
from agents.ai.clients import get_max_tokens_for_model
from services.openai_service import OpenAIService
from agents.generation.file_processor import create_file_processor
from setup_logging_optimized import get_logger
from services.pptx_text_extractor import extract_pptx_text_from_bytes
from .generator_utils import extract_image_prompt_from_content

logger = get_logger(__name__)


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

    def _slide_needs_data(self, title: str, content: str) -> bool:
        """Defer data/graph detection to the model instead of keyword rules."""
        return False

    def _enforce_word_limits_presentation(self, content: str, slide_title: str, slide_type: str = 'content') -> str:
        """No code-based word trimming; defer to the model."""
        _ = slide_title
        _ = slide_type
        return content
