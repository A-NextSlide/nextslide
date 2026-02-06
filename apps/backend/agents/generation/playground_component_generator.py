"""
Playground-specific slide generator.

Subclasses the production CustomComponentGenerator. Uses the same
production prompts so models get full creative freedom with context —
no verbatim restrictions. The full pipeline (AI invocation, fallback,
image resolution, code verification) is inherited.
"""

from agents.generation.custom_component_generator import CustomComponentGenerator


class PlaygroundComponentGenerator(CustomComponentGenerator):
    """CustomComponentGenerator for the playground.

    Uses production prompts — models get the original user context and
    compete on both visual design quality and content interpretation.
    """
    pass
