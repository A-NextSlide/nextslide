"""Outline generation service with streaming support."""

import os
from dotenv import load_dotenv

from .planner import OutlinePlanner
from .slide_generator import SlideGenerator
from .chart_generator import ChartGenerator
from .media_manager import MediaManager
from .generator_flow import OutlineGeneratorFlowMixin
from .generator_streaming import OutlineGeneratorStreamingMixin
from .generator_files import OutlineGeneratorFileMixin
from .generator_research import OutlineGeneratorResearchMixin
from .generator_validation import OutlineGeneratorValidationMixin
from .generator_pptx import OutlineGeneratorPptxMixin
from .models import OutlineOptions, OutlineResult
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Load environment variables from .env file, overriding existing ones
load_dotenv(override=True)

# Initialize the assistant ID once
_assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
if _assistant_id:
    logger.debug(f"[STARTUP] Assistant configured: {_assistant_id[:8]}...")
else:
    logger.warning("[STARTUP] No OpenAI Assistant ID configured")


class OutlineGenerator(
    OutlineGeneratorFlowMixin,
    OutlineGeneratorStreamingMixin,
    OutlineGeneratorFileMixin,
    OutlineGeneratorResearchMixin,
    OutlineGeneratorValidationMixin,
    OutlineGeneratorPptxMixin,
):
    """Main orchestrator for outline generation."""

    def __init__(self, registry=None):
        self.registry = registry
        self.chart_generator = ChartGenerator(registry)
        self.slide_generator = SlideGenerator(self.chart_generator)
        self.planner = OutlinePlanner()
        self.media_manager = MediaManager()

        logger.info(
            "OutlineGenerator initialized with %s chart types",
            len(self.chart_generator.chart_types),
        )


async def generate_outline(options: OutlineOptions, registry=None) -> OutlineResult:
    """Backward-compatible convenience wrapper for outline generation."""
    generator = OutlineGenerator(registry)
    return await generator.generate(options)
