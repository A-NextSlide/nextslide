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
        
        logger.debug(f"[MEDIA ALLOCATION] Starting allocation for {len(valid_images)} images")
        for i, img in enumerate(valid_images[:2]):  # Log first 2 images
            logger.debug(f"[MEDIA ALLOCATION] Image: {img['filename']} - has URL: {'yes' if img.get('url') else 'no'}, has base64: {'yes' if img.get('base64') else 'no'}")
        
        # Prepare data for AI
        images_data = []
        for idx, img in enumerate(valid_images):
            images_data.append({
                'index': idx,
                'filename': img['filename'],
                'category': img['category'],
                'interpretation': img['interpretation'],
                'should_use_everywhere': img.get('should_use_everywhere', False)
            })
        
        slides_data = []
        for slide in slides:
            slides_data.append({
                'id': slide.id,
                'title': slide.title,
                'content': slide.content[:200] + "..." if len(slide.content) > 200 else slide.content,
                'slide_type': slide.slide_type
            })
        
        # Create prompt for AI
        prompt = (
            "Assign images to the slides where they best support the content. "
            "Leave images unassigned if the match is weak. "
            "If should_use_everywhere is true, you may assign to multiple slides; otherwise prefer a single best match. "
            "Return JSON: {\"assignments\": [{\"image_index\": 0, \"slide_ids\": [\"slide-id\"], \"confidence\": 0.9, \"reasoning\": \"...\"}]}."
            "\n\nIMAGES:\n"
            f"{json.dumps(images_data, indent=2)}\n\n"
            "SLIDES:\n"
            f"{json.dumps(slides_data, indent=2)}"
        )

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
            
            # Parse response
            response_text = response.strip()
            # Extract JSON from response
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0]
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0]
            
            assignments = json.loads(response_text)
            
            # Ensure assignments is a dictionary
            if isinstance(assignments, list):
                logger.warning(f"AI returned assignments as list instead of dict: {assignments}")
                # Try to wrap it in expected format
                assignments = {'assignments': assignments}
            elif not isinstance(assignments, dict):
                logger.error(f"AI returned unexpected type for assignments: {type(assignments)}")
                return
            
            # Apply assignments
            for assignment in assignments.get('assignments', []):
                img_idx = assignment['image_index']
                if img_idx >= len(valid_images):
                    continue
                    
                img = valid_images[img_idx]
                assigned_slides = []
                
                for slide_id in assignment['slide_ids']:
                    # Find the slide
                    slide = next((s for s in slides if s.id == slide_id), None)
                    if slide:
                        # Combine original interpretation with AI reasoning
                        combined_interpretation = img['interpretation']
                        if assignment.get('reasoning'):
                            combined_interpretation = f"{img['interpretation']} | AI Assignment: {assignment['reasoning']}"
                        
                        # Get the base64 content or URL
                        base64_content = img.get('base64', '')
                        preview_url = img.get('url', '') or base64_content  # Use URL if available, fallback to base64
                        
                        logger.info(f"[MEDIA ALLOCATION] Creating tagged media for {img['filename']}:")
                        logger.info(f"  - Has base64 content: {'yes' if base64_content else 'no'}")
                        logger.info(f"  - Has URL: {'yes' if img.get('url') else 'no'}")
                        logger.info(f"  - Using: {'URL' if img.get('url') else 'base64'}")
                        
                        tagged_media = {
                            'id': str(uuid.uuid4()),
                            'filename': img['filename'],
                            'type': self._get_media_type(img['category'], img['filename']),
                            'previewUrl': preview_url,
                            'url': preview_url,  # Add url field for frontend compatibility
                            'interpretation': combined_interpretation,  # AI reasoning goes here
                            'slideId': slide.id,
                            'status': 'processed',
                            'metadata': {
                                'componentType': 'Image',
                                'confidence': assignment.get('confidence', 0.8),
                                'category': img['category'],  # Include original category
                                'ai_assigned': True  # Flag to indicate AI assignment
                            }
                        }
                        slide.taggedMedia.append(tagged_media)
                        assigned_slides.append(slide.title)
                        logger.info(f"[MEDIA ALLOCATION] ✓ Tagged media created for slide: {slide.title}")
                        logger.info(f"[MEDIA ALLOCATION]   - Slide now has {len(slide.taggedMedia)} tagged media items")
                        logger.info(f"[MEDIA ALLOCATION]   - Media URL: {preview_url[:100]}...")
                
                if assigned_slides:
                    logger.info(f"AI assigned {img['filename']} to: {', '.join(assigned_slides)}")
            
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
    
    def generate_chart_from_data_file(self, data_file: Dict[str, Any], slide_title: str) -> Optional[Dict[str, Any]]:
        """Generate chart data from an uploaded data file"""
        try:
            if data_file.get('format') != 'csv' or 'data' not in data_file:
                return None
            
            csv_data = data_file['data']
            headers = csv_data.get('headers', [])
            rows = csv_data.get('rows', [])
            numeric_cols = csv_data.get('numeric_columns', [])
            
            if not headers or not rows or not numeric_cols:
                return None
            
            # Get chart suggestion
            chart_suggestion = data_file.get('chart_suggestion', {})
            chart_type = chart_suggestion.get('type', 'bar')
            
            # Extract data based on chart type
            chart_data_points = []
            
            if chart_type == 'pie':
                # For pie charts, use first column as labels and first numeric column as values
                label_col = 0
                value_col = numeric_cols[0] if numeric_cols else 1
                
                for row in rows[:10]:  # Limit to 10 items for pie charts
                    if len(row) > max(label_col, value_col):
                        try:
                            value = float(row[value_col].replace(',', '').replace('$', '').replace('%', ''))
                            chart_data_points.append({
                                'name': row[label_col],
                                'value': value
                            })
                        except:
                            pass
            
            elif chart_type == 'line':
                # For line charts, look for time column and numeric data
                x_col = 0  # Assume first column is time/category
                y_col = numeric_cols[0] if numeric_cols else 1
                
                for row in rows:
                    if len(row) > max(x_col, y_col):
                        try:
                            value = float(row[y_col].replace(',', '').replace('$', '').replace('%', ''))
                            chart_data_points.append({
                                'x': row[x_col],
                                'y': value
                            })
                        except:
                            pass
            
            else:  # Default to bar chart
                # Use first column as categories and first numeric column as values
                label_col = 0
                value_col = numeric_cols[0] if numeric_cols else 1
                
                for row in rows[:15]:  # Limit items for bar charts
                    if len(row) > max(label_col, value_col):
                        try:
                            value = float(row[value_col].replace(',', '').replace('$', '').replace('%', ''))
                            chart_data_points.append({
                                'name': row[label_col],
                                'value': value
                            })
                        except:
                            pass
            
            if not chart_data_points:
                return None
            
            # Generate chart title
            title = chart_suggestion.get('title', '')
            if not title and headers and numeric_cols:
                value_header = headers[numeric_cols[0]] if numeric_cols[0] < len(headers) else 'Values'
                title = f"{value_header} Analysis"
            
            return {
                'chart_type': chart_type,
                'data': chart_data_points,
                'title': title,
                'metadata': {'source': data_file['filename']}
            }
            
        except Exception as e:
            logger.error(f"Error generating chart from data file: {e}")
            return None
    
