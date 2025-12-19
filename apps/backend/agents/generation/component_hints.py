"""Component hints for slide generation."""

from typing import List

from agents.domain.models import SlideGenerationContext


def infer_component_hints(context: SlideGenerationContext) -> List[str]:
    """Infer lightweight component hints from available data."""
    hints: List[str] = []
    if context.has_tabular_data:
        hints.append("Table")
    if context.has_chart_data:
        hints.append("Chart")
    return hints
