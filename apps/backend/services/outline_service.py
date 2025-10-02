"""
Outline generation service - wrapper for backward compatibility
"""

# Import everything from the refactored modules
from services.outline import (
    OutlineGenerator,
    OutlineOptions,
    OutlineResult,
    SlideContent,
    ChartData,
    ProgressUpdate
)

# For backward compatibility, also expose the async generate function
async def generate_outline(options: OutlineOptions, registry=None) -> OutlineResult:
    """Convenience function for backward compatibility"""
    generator = OutlineGenerator(registry)
    return await generator.generate(options) 