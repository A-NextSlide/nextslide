"""Slide content generation module."""

from .chart_generator import ChartGenerator
from .slide_generator_flow import SlideGeneratorFlowMixin
from .slide_generator_context import SlideGeneratorContextMixin
from .slide_generator_prompt import SlideGeneratorPromptMixin
from .slide_generator_validation import SlideGeneratorValidationMixin
from .slide_generator_model import SlideGeneratorModelMixin
from .slide_generator_output import SlideGeneratorOutputMixin
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SlideGenerator(
    SlideGeneratorFlowMixin,
    SlideGeneratorContextMixin,
    SlideGeneratorPromptMixin,
    SlideGeneratorValidationMixin,
    SlideGeneratorModelMixin,
    SlideGeneratorOutputMixin,
):
    """Handles individual slide content generation."""

    def __init__(self, chart_generator: ChartGenerator):
        self.chart_generator = chart_generator
