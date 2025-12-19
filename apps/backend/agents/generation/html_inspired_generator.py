"""
HTML-inspired slide generator wrapper.

This is now a thin pass-through to the base generator to keep prompting minimal
and avoid heuristic branching.
"""

from typing import AsyncIterator, Dict, Any
from agents.core import ISlideGenerator
from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class HTMLInspiredSlideGenerator(ISlideGenerator):
    """Thin wrapper that delegates to the base generator."""

    def __init__(self, base_generator: ISlideGenerator):
        self.base_generator = base_generator

    async def generate_slide(
        self,
        context: SlideGenerationContext,
    ) -> AsyncIterator[Dict[str, Any]]:
        async for update in self.base_generator.generate_slide(context):
            yield update

    async def complete_generation(self, context: SlideGenerationContext) -> None:
        if hasattr(self.base_generator, "complete_generation"):
            await self.base_generator.complete_generation(context)
