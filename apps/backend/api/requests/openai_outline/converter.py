from typing import Dict, Any

from models.requests import DeckOutline, SlideOutline, ExtractedDataItem, TaggedMediaItem


def _convert_to_api_format(result) -> DeckOutline:
    """Convert service result to API format"""
    slides = []
    for slide in result.slides:
        # Handle extractedData - normalize legacy chart_data into extractedData
        extracted_data = None
        raw_extracted = None
        if hasattr(slide, 'extractedData') and slide.extractedData:
            raw_extracted = slide.extractedData
        elif getattr(slide, 'chart_data', None):
            raw_extracted = slide.chart_data.dict() if hasattr(slide.chart_data, 'dict') else slide.chart_data

        if raw_extracted:
            normalized = normalize_extracted_data(raw_extracted, slide.title, source="generated_data")
            cleaned = normalized or _sanitize_extracted_data(raw_extracted)
            if cleaned:
                extracted_data = ExtractedDataItem(
                    source=cleaned.get('source', 'generated_data'),
                    chartType=cleaned.get('chartType'),
                    data=cleaned.get('data', []),
                    title=cleaned.get('title', ''),
                    metadata=cleaned.get('metadata', {})
                )
        
        # Convert taggedMedia to proper format
        tagged_media = []
        if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
            for media in slide.taggedMedia:
                if isinstance(media, dict):
                    tagged_media.append(TaggedMediaItem(
                        id=media.get('id', ''),
                        filename=media.get('filename', ''),
                        type=media.get('type', 'image'),
                        previewUrl=media.get('previewUrl', ''),
                        interpretation=media.get('interpretation', ''),
                        slideId=media.get('slideId', slide.id),
                        status=media.get('status', 'processed'),
                        metadata=media.get('metadata', {})
                    ))
        
        slides.append(SlideOutline(
            id=slide.id,
            title=slide.title,
            content=slide.content,
            deepResearch=bool(slide.research_notes) if hasattr(slide, 'research_notes') else slide.deepResearch,
            taggedMedia=tagged_media,
            extractedData=extracted_data,
            citations=getattr(slide, 'citations', None),
            footnotes=getattr(slide, 'footnotes', None)
        ))
    
    return DeckOutline(
        id=result.id,
        title=result.title,
        slides=slides,
        notes=None,  # Notes will be set by the caller if narrative flow is analyzed
        # Note: stylePreferences are added separately in the streaming path
        # For non-streaming, we don't have access to the request here
        stylePreferences=None
    )
