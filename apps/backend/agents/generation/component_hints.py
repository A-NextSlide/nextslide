"""Component hints for slide generation.

Deprecated: Keep empty to avoid heuristic steering in prompts.
"""

from typing import List

from agents.domain.models import SlideGenerationContext


def infer_component_hints(context: SlideGenerationContext) -> List[str]:
    """Return no hints to keep prompting agent-led and non-heuristic."""
    return []
