from typing import Any, Dict, Optional

from agents.prompts.generation.outline_prompts import get_fallback_content, get_slide_content_prompt
from setup_logging_optimized import get_logger

from .models import OutlineOptions

logger = get_logger(__name__)


class SlideGeneratorPromptMixin:

    def _create_slide_prompt(
        self,
        slide_title: str,
        slide_type: str,
        options: OutlineOptions,
        presentation_title: str,
        context: Dict[str, Any] = None
    ) -> str:
        """Create prompt for slide generation"""
        # Get available chart types
        chart_descriptions = self.chart_generator.get_chart_type_descriptions()
        
        # Log what context we have
        if context and context.get('processed_files') and context['processed_files'].get('extracted_data'):
            logger.info(f"[SLIDE PROMPT] Creating prompt for '{slide_title}' with extracted data available")
            for data_item in context['processed_files']['extracted_data']:
                if isinstance(data_item, dict) and 'summary' in data_item:
                    logger.info(f"[SLIDE PROMPT] Data available: {data_item['summary']}")
        else:
            logger.warning(f"[SLIDE PROMPT] No extracted data in context for slide: {slide_title}")
        
        # Attach web citations into context so the prompt can include sources
        if context and context.get('web_citations'):
            try:
                cites = context['web_citations']
                logger.info(f"[SLIDE PROMPT] Citations for '{slide_title}': {', '.join([c.get('source') or c.get('url','') for c in cites])}")
            except Exception:
                pass

        return get_slide_content_prompt(
            slide_title,
            slide_type,
            options.prompt,
            presentation_title,
            slide_title,  # Use slide_title as formatted_slide_title
            context,
            chart_descriptions
        )

    def _create_fallback_content(self, slide_title: str, slide_type: str, topic: str) -> str:
        """Create fallback content when generation fails"""
        return get_fallback_content(slide_title, slide_type, topic)
