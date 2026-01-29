"""Outline generation service package"""

from .generator import OutlineGenerator
from .models import (
    OutlineOptions,
    OutlineResult,
    SlideContent,
    ChartData,
    ProgressUpdate
)
from .research_decision import should_research, get_current_date_context

__all__ = [
    'OutlineGenerator',
    'OutlineOptions',
    'OutlineResult',
    'SlideContent',
    'ChartData',
    'ProgressUpdate',
    'should_research',
    'get_current_date_context'
] 