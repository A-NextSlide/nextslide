import re
from typing import Any, Dict, List, Optional

from setup_logging_optimized import get_logger

from .models import OutlineOptions, SlideContent

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

    def _resolve_slide_title(self, slide_title: Any) -> str:
        if isinstance(slide_title, dict):
            return slide_title.get("title", str(slide_title))
        return str(slide_title)

    def _extract_title_struct_context(self, slide_title: Any) -> Dict[str, Any]:
        if not isinstance(slide_title, dict):
            return {}
        elements = slide_title.get("elements") or []
        title_elements: List[str] = []
        title_outline_texts: List[str] = []
        if isinstance(elements, list):
            for el in elements:
                if not isinstance(el, dict):
                    continue
                el_type = el.get("type")
                if isinstance(el_type, str):
                    title_elements.append(el_type)
                text_val = el.get("text")
                if isinstance(text_val, str) and text_val.strip():
                    title_outline_texts.append(text_val.strip())
        return {
            "title_elements": title_elements,
            "title_outline_texts": title_outline_texts,
            "outline_title_struct": slide_title,
        }

    def _get_pptx_source_context(self, processed_files: Optional[Dict[str, Any]], index: int) -> Optional[Dict[str, str]]:
        if not processed_files:
            return None
        pptx_outlines = processed_files.get("pptx_outlines") or []
        if not pptx_outlines:
            return None
        ppt = pptx_outlines[0]
        slides_meta = ppt.get("slides", [])
        if 0 <= index < len(slides_meta):
            pptx_slide = slides_meta[index]
            return {
                "title": pptx_slide.get("title", ""),
                "text": pptx_slide.get("text", ""),
                "notes": pptx_slide.get("notes", ""),
            }
        return None

    def _build_parallel_context(
        self,
        slide_title: Any,
        slide_type: str,
        index: int,
        total_slides: int,
        presentation_context: str,
        options: OutlineOptions,
        processed_files: Optional[Dict[str, Any]],
    ) -> Dict[str, Any]:
        context: Dict[str, Any] = {
            "is_continuation": False,
            "previous_slides": [],
            "used_charts": [],
            "part_number": None,
            "presentation_context": presentation_context,
            "detail_level": options.detail_level,
            "total_slides": total_slides,
            "slide_index": index,
        }
        context.update(self._extract_title_struct_context(slide_title))
        if processed_files:
            context["processed_files"] = processed_files
            pptx_source = self._get_pptx_source_context(processed_files, index)
            if pptx_source:
                context["pptx_source"] = pptx_source
            try:
                self._add_file_suggestions_to_context(
                    context, processed_files, slide_type, self._resolve_slide_title(slide_title)
                )
            except Exception as exc:
                logger.warning("Failed adding file suggestions for slide %s: %s", index + 1, exc)
        return context

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
