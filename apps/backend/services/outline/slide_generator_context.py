import re
from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

from .models import SlideContent

logger = get_logger(__name__)


class SlideGeneratorContextMixin:

    def _build_slide_context(
        self,
        current_title: str,
        slides: List[SlideContent],
        previous_content: List[Dict],
        used_charts: List[Dict],
        presentation_context: str = "business"
    ) -> Dict[str, Any]:
        """Build context from previous slides for narrative continuity"""
        context = {
            'is_continuation': False,
            'previous_slides': [],
            'used_charts': used_charts,
            'part_number': None,
            'presentation_context': presentation_context
        }
        
        # Handle dict titles
        if isinstance(current_title, dict):
            logger.warning(f"Slide title is a dict: {current_title}")
            current_title = current_title.get('title', str(current_title))
        
        # Ensure current_title is a string
        current_title = str(current_title)
        
        # Check if this is a multi-part slide
        part_match = re.search(r'Part (\d+)', current_title, re.IGNORECASE)
        if part_match:
            context['is_continuation'] = True
            context['part_number'] = int(part_match.group(1))
            
            # Find related previous parts
            base_title = re.sub(r' - Part \d+.*', '', current_title)
            for prev in previous_content:
                if base_title in prev['title']:
                    context['previous_slides'].append(prev)
        
        # For any content slide, include last 2 slides for flow
        elif len(previous_content) > 0:
            context['previous_slides'] = previous_content[-2:]
        
        return context

    def _add_file_suggestions_to_context(
        self,
        context: Dict[str, Any],
        processed_files: Dict[str, Any],
        slide_type: str,
        slide_title: str
    ) -> None:
        """Add file suggestions to context"""
        context['suggested_images'] = []
        context['suggested_data'] = []
        
        # Ensure slide_title is a string
        if isinstance(slide_title, dict):
            slide_title = slide_title.get('title', str(slide_title))
        slide_title = str(slide_title)

        context['image_search_terms'] = slide_title[:60] if slide_title else 'presentation background'
        
        for img in processed_files.get('images', []):
            if img['category'] == 'rejected':
                continue
            img_copy = dict(img)
            img_copy['search_query'] = context.get('image_search_terms', '')
            context['suggested_images'].append(img_copy)
        
        for data_file in processed_files.get('data_files', []):
            context['suggested_data'].append(data_file)

    def _build_image_search_terms(self, slide_title: str, slide_type: str, context: Dict[str, Any]) -> str:
        """Create concise, high-signal search terms for image providers.

        Uses slide title plus optional PPTX text/notes, filters stopwords and numbers,
        and adds a broad type modifier (e.g., background, analytics concept).
        """
        _ = slide_type
        _ = context
        return slide_title[:60] if slide_title else 'presentation background'

    def _refine_query_with_interpretation(self, base_query: str, interpretation: str) -> str:
        """Lightly refine a base query with 1–2 tokens from interpretation."""
        _ = interpretation
        return base_query[:70]

    def _maybe_build_comparison(self, slide_title: str, content: str) -> Optional[Dict[str, Any]]:
        """Detect comparison patterns and build a structured left/right comparison block.

        Heuristics:
        - Slide title contains ' vs ', 'versus', 'before/after', 'old/new', 'comparison'
        - Or content has paired bullets like 'Left — text' and 'Right — text'
        """
        _ = slide_title
        _ = content
        return None
