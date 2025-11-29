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
        model_name: str = "gemini-2.5-flash-lite"
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
        prompt = f"""You are an expert at matching images to presentation slides. Analyze the following images and slides, then assign each image to the most appropriate slides.

IMAGES:
{json.dumps(images_data, indent=2)}

SLIDES:
{json.dumps(slides_data, indent=2)}

ASSIGNMENT RULES:
1. Logos and icons that have 'should_use_everywhere': true should be assigned to title and conclusion slides
2. Chart images should go to slides that discuss data, metrics, or analysis
3. Background images work well on title, section header, or conclusion slides
4. Regular content images should match the slide's topic and content
5. IMPORTANT: Regular content images (photos) should only be assigned to ONE slide each - choose the BEST match
6. Only logos, icons, or images marked as 'should_use_everywhere' can appear on multiple slides
7. Some images might not match any slide well - that's okay, leave them unassigned
8. Consider the slide type and content when making assignments
9. Prioritize unique visual storytelling - avoid repetition unless the image is a branding element

Return a JSON object with this exact structure:
{{
  "assignments": [
    {{
      "image_index": 0,
      "slide_ids": ["slide-id-1", "slide-id-2"],
      "confidence": 0.9,
      "reasoning": "Brief explanation"
    }}
  ]
}}

Only include images that have good matches. Be thoughtful and strategic about assignments."""

        try:
            # Get AI client
            client, actual_model = get_client(model_name)
            
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
            # Fall back to simple assignment
            self.assign_media_to_slides(slides, processed_files)
    
    def assign_media_to_slides(self, slides: List[SlideContent], processed_files: Dict[str, Any]) -> None:
        """Simple fallback assignment when AI assignment fails"""
        if not processed_files:
            return
        
        # Process images with simple rules
        for img in processed_files.get('images', []):
            if img['category'] == 'rejected':
                continue
            
            # Logos/icons go to title and conclusion
            if img.get('should_use_everywhere'):
                for slide in slides:
                    if slide.slide_type in ['title', 'conclusion']:
                        interpretation = f"{img['interpretation']} | Auto-assigned to {slide.slide_type} slide"
                        tagged_media = {
                            'id': str(uuid.uuid4()),
                            'filename': img['filename'],
                            'type': self._get_media_type(img['category'], img['filename']),
                            'previewUrl': img.get('url', '') or img.get('base64', ''),
                            'url': img.get('url', '') or img.get('base64', ''),  # Add url field
                            'interpretation': interpretation,
                            'slideId': slide.id,
                            'status': 'processed',
                            'metadata': {
                                'componentType': 'Image',
                                'confidence': 0.9,
                                'category': img['category'],
                                'auto_assigned': True
                            }
                        }
                        slide.taggedMedia.append(tagged_media)
            
            # Chart images to data slides
            elif img['category'] == 'chart':
                for slide in slides:
                    if slide.slide_type in ['data', 'comparison', 'timeline']:
                        interpretation = f"{img['interpretation']} | Auto-assigned to {slide.slide_type} slide with data content"
                        tagged_media = {
                            'id': str(uuid.uuid4()),
                            'filename': img['filename'],
                            'type': self._get_media_type(img['category'], img['filename']),
                            'previewUrl': img.get('url', '') or img.get('base64', ''),
                            'url': img.get('url', '') or img.get('base64', ''),  # Add url field
                            'interpretation': interpretation,
                            'slideId': slide.id,
                            'status': 'processed',
                            'metadata': {
                                'componentType': 'Image',
                                'confidence': 0.8,
                                'category': img['category'],
                                'auto_assigned': True
                            }
                        }
                        slide.taggedMedia.append(tagged_media)
                        break  # Only assign to first matching slide
            
            # Background images to title/section slides  
            elif img['category'] == 'background':
                for slide in slides:
                    if slide.slide_type in ['title', 'section', 'conclusion']:
                        interpretation = f"{img['interpretation']} | Auto-assigned as background for {slide.slide_type} slide"
                        tagged_media = {
                            'id': str(uuid.uuid4()),
                            'filename': img['filename'],
                            'type': self._get_media_type(img['category'], img['filename']),
                            'previewUrl': img.get('url', '') or img.get('base64', ''),
                            'url': img.get('url', '') or img.get('base64', ''),  # Add url field
                            'interpretation': interpretation,
                            'slideId': slide.id,
                            'status': 'processed',
                            'metadata': {
                                'componentType': 'Image',
                                'confidence': 0.7,
                                'category': img['category'],
                                'auto_assigned': True
                            }
                        }
                        slide.taggedMedia.append(tagged_media)
                        break
    
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
    
    def _extract_keywords(self, text: str) -> List[str]:
        """Extract meaningful keywords from text for matching"""
        # Common words to ignore
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
            'of', 'with', 'by', 'from', 'up', 'about', 'into', 'through', 'during',
            'before', 'after', 'above', 'below', 'between', 'under', 'again',
            'further', 'then', 'once', 'is', 'are', 'was', 'were', 'been', 'be',
            'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
            'should', 'may', 'might', 'must', 'can', 'this', 'that', 'these',
            'those', 'i', 'you', 'he', 'she', 'it', 'we', 'they', 'them', 'their',
            'what', 'which', 'who', 'when', 'where', 'why', 'how', 'all', 'each',
            'every', 'some', 'any', 'many', 'much', 'most', 'several', 'no', 'not',
            'only', 'own', 'same', 'so', 'than', 'too', 'very', 'just', 'image',
            'photo', 'picture', 'showing', 'shows', 'depicts', 'featuring'
        }
        
        # Extract words and filter
        words = text.lower().split()
        keywords = []
        
        for word in words:
            # Clean punctuation
            cleaned = word.strip('.,!?;:"\'()[]{}')
            # Keep if it's meaningful (not a stop word, length > 3)
            if cleaned and len(cleaned) > 3 and cleaned not in stop_words:
                keywords.append(cleaned)
        
        return keywords
    
    def _calculate_relevance_score(
        self, 
        img_keywords: List[str], 
        slide_title: str, 
        slide_content: str,
        suggested_slide_types: List[str],
        actual_slide_type: str
    ) -> float:
        """Calculate relevance score between an image and a slide"""
        score = 0.0
        
        # Combine slide text
        slide_text = f"{slide_title} {slide_content}".lower()
        slide_keywords = self._extract_keywords(slide_text)
        
        # 1. Check for keyword matches
        matching_keywords = set(img_keywords) & set(slide_keywords)
        if matching_keywords:
            # Score based on percentage of matching keywords
            keyword_score = len(matching_keywords) / max(len(img_keywords), 1)
            score += keyword_score * 0.5  # Keywords are 50% of score
            
            # Bonus for title matches (more important)
            title_keywords = self._extract_keywords(slide_title)
            title_matches = set(img_keywords) & set(title_keywords)
            if title_matches:
                score += 0.2  # 20% bonus for title matches
        
        # 2. Check if slide type matches suggestions
        if suggested_slide_types and actual_slide_type in suggested_slide_types:
            score += 0.2  # 20% for matching suggested type
        
        # 3. Look for specific topic indicators
        # Solar/energy specific keywords
        energy_keywords = {'solar', 'energy', 'renewable', 'power', 'electricity', 
                          'panel', 'wind', 'turbine', 'sustainable', 'green'}
        
        # Data/chart keywords
        data_keywords = {'growth', 'trend', 'data', 'analysis', 'statistics', 
                        'chart', 'graph', 'metrics', 'performance', 'results'}
        
        # Check for topic-specific matches
        img_energy = any(kw in img_keywords for kw in energy_keywords)
        slide_energy = any(kw in slide_keywords for kw in energy_keywords)
        
        img_data = any(kw in img_keywords for kw in data_keywords)
        slide_data = any(kw in slide_keywords for kw in data_keywords)
        
        # Bonus for matching topics
        if img_energy and slide_energy:
            score += 0.1
        if img_data and slide_data:
            score += 0.1
        
        # Cap score at 1.0
        return min(score, 1.0) 