import uuid
from typing import List

from setup_logging_optimized import get_logger

from .chart_normalization import normalize_slide_chart_fields
from .generator_utils import extract_image_prompt_from_content
from .models import SlideContent

logger = get_logger(__name__)


class OutlineGeneratorPptxMixin:

    def _create_slides_from_pptx(self, pptx_outline: dict, outline_plan: dict) -> List[SlideContent]:
        """Create slides directly from PPTX content without regenerating."""
        slides = []
        pptx_slides = pptx_outline.get('slides', [])
        
        for i, pptx_slide in enumerate(pptx_slides):
            if i >= len(outline_plan['slides']):
                break
                
            # Extract slide content from PPTX
            title = pptx_slide.get('title', f'Slide {i+1}')
            text_items = pptx_slide.get('text_items', [])
            
            # Format content with bullet points
            content_lines = []
            for item in text_items:
                if item.strip():
                    # Add bullet point if not already present
                    if not item.strip().startswith('•'):
                        content_lines.append(f"• {item.strip()}")
                    else:
                        content_lines.append(item.strip())
            
            content = '\n'.join(content_lines) if content_lines else pptx_slide.get('text', '')
            
            # Extract [IMAGE: ...] tag if present
            cleaned_content, image_prompt = extract_image_prompt_from_content(content)
            
            # Create SlideContent object
            slide = SlideContent(
                id=str(uuid.uuid4()),
                title=title,
                content=cleaned_content,
                slide_type='content',
                deepResearch=False,
                extractedData=None,
                taggedMedia=[],
                suggestedImagePrompt=image_prompt
            )
            
            slides.append(slide)
            
        logger.info(f"[PPTX] Created {len(slides)} slides directly from PPTX content")
        return slides

    def _should_preserve_pptx_content(self, prompt: str) -> bool:
        """
        Defer preservation intent to the model instead of keyword rules.
        """
        return False

    def _slide_to_dict(self, slide: SlideContent) -> dict:
        """Convert slide to dictionary format"""
        # Debug log taggedMedia and citations
        tm_count = len(slide.taggedMedia) if hasattr(slide, 'taggedMedia') and slide.taggedMedia else 0
        cit_count = len(slide.citations) if hasattr(slide, 'citations') and slide.citations else 0
        fn_count = len(slide.footnotes) if hasattr(slide, 'footnotes') and slide.footnotes else 0
        logger.debug(f"[SLIDE_TO_DICT] Converting slide '{slide.title}' - taggedMedia={tm_count}, citations={cit_count}, footnotes={fn_count}")
        
        # Convert taggedMedia to ensure it's properly serialized
        tagged_media_list = []
        if slide.taggedMedia:
            for media in slide.taggedMedia:
                if isinstance(media, dict):
                    tagged_media_list.append(media)
                elif hasattr(media, 'model_dump'):
                    tagged_media_list.append(media.model_dump())
                else:
                    tagged_media_list.append(media)
        
        slide_dict = {
            "id": slide.id,
            "title": slide.title,
            "content": slide.content,
            "slide_type": slide.slide_type,
            "deepResearch": slide.deepResearch,
            "extractedData": slide.extractedData,
            "manualCharts": getattr(slide, 'manualCharts', None),  # ✅ Support multiple charts
            "citationsFooter": getattr(slide, 'citationsFooter', None),
            "citations": getattr(slide, 'citations', []),
            "footnotes": getattr(slide, 'footnotes', []),  # Add footnotes for numbered citations
            "taggedMedia": tagged_media_list
        }

        normalize_slide_chart_fields(slide_dict)
        
        # Debug extractedData
        if slide.extractedData:
            logger.debug(f"[SLIDE_TO_DICT] Slide '{slide.title}' has extractedData: {slide.extractedData.get('chart_type', 'unknown')} chart")

        # Include structured comparison when present
        try:
            comparison = getattr(slide, 'comparison', None)
            if comparison and isinstance(comparison, dict):
                # Basic validation to ensure arrays exist
                left_bullets = comparison.get('leftBullets') or []
                right_bullets = comparison.get('rightBullets') or []
                slide_dict["comparison"] = {
                    "layout": comparison.get('layout'),
                    "leftLabel": comparison.get('leftLabel'),
                    "rightLabel": comparison.get('rightLabel'),
                    "leftBullets": left_bullets,
                    "rightBullets": right_bullets
                }
        except Exception:
            pass
        
        # Include research_notes if available
        if hasattr(slide, 'research_notes') and slide.research_notes:
            slide_dict["research_notes"] = slide.research_notes
            
        return slide_dict
