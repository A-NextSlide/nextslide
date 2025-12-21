"""Media and file management for outline generation"""

import uuid
import json
from typing import List, Dict, Any, Optional

from .models import SlideContent
from agents.ai.clients import get_client, invoke
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class MediaManager:
    """Handles media assignment and file processing integration"""
    
    def _get_media_type(self, category: str, filename: str = "") -> str:
        """Map file category to TaggedMedia type field"""
        # Map categories to frontend types: 'image' | 'chart' | 'data' | 'pdf' | 'other'
        category_to_type = {
            'logo': 'image',
            'icon': 'image',
            'slide_image': 'image',
            'background': 'image',
            'chart': 'chart',
            'data': 'data',
            'pdf': 'pdf'
        }
        
        # Check file extension as fallback
        if filename.lower().endswith('.pdf'):
            return 'pdf'
        elif filename.lower().endswith(('.csv', '.xlsx', '.xls')):
            return 'data'
        
        return category_to_type.get(category, 'other')

    def _build_images_payload(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        payload = []
        for idx, img in enumerate(images):
            payload.append({
                "index": idx,
                "filename": img.get("filename"),
                "category": img.get("category"),
                "interpretation": img.get("interpretation"),
                "should_use_everywhere": img.get("should_use_everywhere", False),
            })
        return payload

    def _build_slides_payload(self, slides: List[SlideContent]) -> List[Dict[str, Any]]:
        payload = []
        for slide in slides:
            content = slide.content
            payload.append({
                "id": slide.id,
                "title": slide.title,
                "content": content[:200] + "..." if len(content) > 200 else content,
                "slide_type": slide.slide_type,
            })
        return payload

    def _build_assignment_prompt(self, images_data: List[Dict[str, Any]], slides_data: List[Dict[str, Any]]) -> str:
        return (
            "Assign images to the slides where they best support the content. "
            "Leave images unassigned if the match is weak. "
            "If should_use_everywhere is true, you may assign to multiple slides; otherwise prefer a single best match. "
            "Return JSON: {\"assignments\": [{\"image_index\": 0, \"slide_ids\": [\"slide-id\"], "
            "\"confidence\": 0.9, \"reasoning\": \"...\"}]}.\n\n"
            f"IMAGES:\n{json.dumps(images_data, indent=2)}\n\n"
            f"SLIDES:\n{json.dumps(slides_data, indent=2)}"
        )

    def _strip_json_fence(self, text: str) -> str:
        if "```json" in text:
            return text.split("```json")[1].split("```")[0]
        if "```" in text:
            return text.split("```")[1].split("```")[0]
        return text

    def _parse_assignments(self, response_text: str) -> Optional[Dict[str, Any]]:
        cleaned = self._strip_json_fence(response_text).strip()
        if not cleaned:
            return None
        try:
            parsed = json.loads(cleaned)
        except json.JSONDecodeError as exc:
            logger.error("Failed to parse media assignments JSON: %s", exc)
            return None
        if isinstance(parsed, list):
            return {"assignments": parsed}
        if isinstance(parsed, dict):
            return parsed
        logger.error("Unexpected assignments payload type: %s", type(parsed))
        return None

    def _build_tagged_media(
        self,
        img: Dict[str, Any],
        slide_id: str,
        assignment: Dict[str, Any],
    ) -> Dict[str, Any]:
        preview_url = img.get("url") or img.get("base64", "")
        interpretation = img.get("interpretation", "")
        reasoning = assignment.get("reasoning")
        if reasoning:
            interpretation = f"{interpretation} | AI Assignment: {reasoning}"
        return {
            "id": str(uuid.uuid4()),
            "filename": img.get("filename"),
            "type": self._get_media_type(img.get("category", ""), img.get("filename", "")),
            "previewUrl": preview_url,
            "url": preview_url,
            "interpretation": interpretation,
            "slideId": slide_id,
            "status": "processed",
            "metadata": {
                "componentType": "Image",
                "confidence": assignment.get("confidence", 0.8),
                "category": img.get("category"),
                "ai_assigned": True,
            },
        }

    def _apply_assignments(
        self,
        assignments: Dict[str, Any],
        slides: List[SlideContent],
        images: List[Dict[str, Any]],
    ) -> None:
        slide_map = {slide.id: slide for slide in slides}
        for assignment in assignments.get("assignments", []):
            image_index = assignment.get("image_index")
            if not isinstance(image_index, int) or image_index >= len(images):
                continue
            img = images[image_index]
            slide_ids = assignment.get("slide_ids") or []
            for slide_id in slide_ids:
                slide = slide_map.get(slide_id)
                if not slide:
                    continue
                tagged_media = self._build_tagged_media(img, slide.id, assignment)
                slide.taggedMedia.append(tagged_media)

    async def assign_media_to_slides_with_ai(
        self,
        slides: List[SlideContent],
        processed_files: Dict[str, Any],
        model_name: str = None
    ) -> None:
        """Use AI to intelligently assign media files to appropriate slides"""
        if not processed_files or not processed_files.get('images'):
            return
        
        # Filter out rejected images
        valid_images = [img for img in processed_files.get('images', []) if img['category'] != 'rejected']
        if not valid_images:
            return
        
        logger.info("[MEDIA] Assigning %s images to %s slides", len(valid_images), len(slides))

        images_data = self._build_images_payload(valid_images)
        slides_data = self._build_slides_payload(slides)
        prompt = self._build_assignment_prompt(images_data, slides_data)

        try:
            # Get AI client
            from agents.config import GEMINI_FLASH_LITE
            client, actual_model = get_client(model_name or GEMINI_FLASH_LITE)
            
            # Make the API call without response_model for raw JSON response
            messages = [{"role": "user", "content": prompt}]
            
            response = invoke(
                client=client,
                model=actual_model,
                messages=messages,
                response_model=None,  # Get raw response
                max_tokens=2000,
                temperature=0.7
            )
            
            assignments = self._parse_assignments(response.strip() if isinstance(response, str) else str(response))
            if not assignments:
                return
            self._apply_assignments(assignments, slides, valid_images)
            
        except Exception as e:
            logger.error(f"Error in AI-based media assignment: {e}")
            return
    
    def assign_media_to_slides(self, slides: List[SlideContent], processed_files: Dict[str, Any]) -> None:
        """Deprecated fallback; keep API stable without heuristic assignment."""
        _ = slides
        _ = processed_files
        return
    
    def generate_file_summary(self, processed_files: Dict[str, Any]) -> str:
        """Generate a user-friendly summary of processed files"""
        summary_parts = []
        
        # Images summary
        if processed_files['images']:
            valid_images = [img for img in processed_files['images'] if img['category'] != 'rejected']
            rejected_images = [img for img in processed_files['images'] if img['category'] == 'rejected']
            
            if valid_images:
                image_types = {}
                for img in valid_images:
                    category = img['category']
                    if category not in image_types:
                        image_types[category] = []
                    image_types[category].append(img['filename'])
                
                image_summary = f"Found {len(valid_images)} usable images:"
                if 'logo' in image_types:
                    image_summary += f" {len(image_types['logo'])} logo(s)"
                if 'slide_image' in image_types:
                    image_summary += f" {len(image_types['slide_image'])} content images"
                if 'chart' in image_types:
                    image_summary += f" {len(image_types['chart'])} chart screenshots"
                if 'background' in image_types:
                    image_summary += f" {len(image_types['background'])} background images"
                
                summary_parts.append(image_summary)
                
            if rejected_images:
                summary_parts.append(f"Rejected {len(rejected_images)} low-quality images")
        
        # Data files summary
        if processed_files['data_files']:
            data_summary = f"Found {len(processed_files['data_files'])} data files"
            chart_types = [df['chart_suggestion']['type'] for df in processed_files['data_files'] if 'chart_suggestion' in df]
            if chart_types:
                unique_types = list(set(chart_types))
                data_summary += f" (suggested charts: {', '.join(unique_types)})"
            summary_parts.append(data_summary)
        
        # Documents summary
        if processed_files['documents']:
            doc_types = {}
            for doc in processed_files['documents']:
                format_type = doc.get('format', 'unknown')
                if format_type not in doc_types:
                    doc_types[format_type] = 0
                doc_types[format_type] += 1
            
            doc_summary = f"Found {len(processed_files['documents'])} documents"
            if doc_types:
                doc_details = [f"{count} {fmt}" for fmt, count in doc_types.items()]
                doc_summary += f" ({', '.join(doc_details)})"
            summary_parts.append(doc_summary)
        
        # Style files summary
        if processed_files['style_files']:
            summary_parts.append(f"Found {len(processed_files['style_files'])} brand/style guidelines")
        
        # Unsupported files
        if processed_files['unsupported']:
            summary_parts.append(f"{len(processed_files['unsupported'])} files couldn't be processed")
        
        if not summary_parts:
            return "No files were processed"
        
        return ". ".join(summary_parts) + "."
    
    def count_processed_files(self, processed_files: Dict[str, Any]) -> int:
        """Count successfully processed files"""
        return sum([
            len([img for img in processed_files['images'] if img.get('category') != 'rejected']),
            len(processed_files['data_files']),
            len(processed_files['documents']),
            len(processed_files['style_files'])
        ])
