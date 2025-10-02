"""
File Processing Module for Outline Generation

Handles various file types for both OpenAI and Gemini models:
- Images: Analyze, validate, assign to slides, detect logos
- Data files: Extract data, generate charts
- Documents: Extract content and style information
"""

import base64
import json
import logging
import re
from typing import List, Dict, Any, Optional, Tuple
from enum import Enum
import io
import csv
from PIL import Image

logger = logging.getLogger(__name__)


class FileType(Enum):
    """Categorization of file types"""
    IMAGE = "image"
    DATA = "data"
    DOCUMENT = "document"
    STYLE = "style"
    UNSUPPORTED = "unsupported"


class ImageCategory(Enum):
    """Categorization of images"""
    SLIDE_IMAGE = "slide_image"      # Regular content image for a slide
    LOGO = "logo"                     # Company/brand logo
    ICON = "icon"                     # Small icon/symbol
    BACKGROUND = "background"         # Background image
    CHART = "chart"                   # Screenshot of a chart
    REJECTED = "rejected"             # Low quality or inappropriate


class FileProcessor:
    """Handles file processing for outline generation"""
    
    def __init__(self, model_type: str = "gemini"):
        """
        Initialize file processor
        
        Args:
            model_type: "gemini" or "openai"
        """
        self.model_type = model_type
        self.supported_image_formats = ['image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp']
        self.supported_data_formats = ['text/csv', 'application/vnd.ms-excel', 
                                     'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
        self.supported_doc_formats = ['text/plain', 'application/pdf', 
                                    'application/vnd.ms-powerpoint',
                                    'application/vnd.openxmlformats-officedocument.presentationml.presentation']
    
    async def process_files(self, files: List[Dict[str, Any]], prompt: str) -> Dict[str, Any]:
        """
        Process all uploaded files and categorize them
        
        Returns:
            {
                'images': List of processed images with categories,
                'data_files': List of data files with extracted content,
                'documents': List of document files with extracted text,
                'style_files': List of files with style information,
                'unsupported': List of unsupported files,
                'file_context': Combined context string for prompt augmentation
            }
        """
        result = {
            'images': [],
            'data_files': [],
            'documents': [],
            'style_files': [],
            'unsupported': [],
            'file_context': ""
        }
        
        for file_info in files:
            file_type = self._categorize_file(file_info)
            
            if file_type == FileType.IMAGE:
                processed_image = await self._process_image(file_info)
                if processed_image:
                    result['images'].append(processed_image)
            
            elif file_type == FileType.DATA:
                processed_data = await self._process_data_file(file_info)
                if processed_data:
                    result['data_files'].append(processed_data)
            
            elif file_type == FileType.DOCUMENT:
                processed_doc = await self._process_document(file_info)
                if processed_doc:
                    result['documents'].append(processed_doc)
            
            elif file_type == FileType.STYLE:
                processed_style = await self._process_style_file(file_info)
                if processed_style:
                    result['style_files'].append(processed_style)
            
            else:
                result['unsupported'].append({
                    'filename': file_info.get('name', 'unknown'),
                    'type': file_info.get('type', 'unknown'),
                    'reason': 'File type not supported'
                })
        
        # Generate context string for prompt augmentation
        result['file_context'] = self._generate_file_context(result, prompt)
        
        return result
    
    def _categorize_file(self, file_info: Dict[str, Any]) -> FileType:
        """Categorize a file based on its type and name"""
        file_type = file_info.get('type', '')
        file_name = file_info.get('name', '').lower()
        
        # Check by MIME type first (more reliable)
        if file_type.startswith('image/'):
            return FileType.IMAGE
        elif file_type in self.supported_data_formats or \
             file_name.endswith(('.csv', '.xlsx', '.xls')):
            return FileType.DATA
        elif file_type in self.supported_doc_formats or \
             file_name.endswith(('.txt', '.pdf', '.ppt', '.pptx')):
            # Check if it's actually a style guide document
            if self._is_style_file(file_name) and not file_name.endswith('.txt'):
                print(f"[FILE PROCESSOR] 📋 Detected brand guideline file: {file_name}")
                return FileType.STYLE
            return FileType.DOCUMENT
        
        # Check for style files without proper MIME type
        if self._is_style_file(file_name):
            print(f"[FILE PROCESSOR] 📋 Detected brand guideline file: {file_name}")
            return FileType.STYLE
        
        return FileType.UNSUPPORTED
    
    def _is_style_file(self, filename: str) -> bool:
        """Check if file is likely a style/brand guideline"""
        style_keywords = ['brand', 'guideline', 'style', 'template', 'theme', 
                         'identity', 'standards', 'logo', 'color', 'palette']
        return any(keyword in filename.lower() for keyword in style_keywords)
    
    async def _process_image(self, file_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process an image file"""
        try:
            content = file_info.get('content')
            if not content:
                return None
            
            # Convert to base64 for analysis
            if isinstance(content, bytes):
                base64_data = base64.b64encode(content).decode('utf-8')
            else:
                base64_data = content
            
            # Analyze image dimensions and characteristics
            image_data = self._analyze_image_properties(content)
            
            # Categorize the image
            category = self._categorize_image(file_info, image_data)
            
            # Generate interpretation based on filename and properties
            interpretation = self._generate_image_interpretation(file_info, image_data, category)
            
            return {
                'filename': file_info.get('name', 'unknown'),
                'type': 'image',
                'category': category.value,
                'base64': f"data:{file_info.get('type', 'image/png')};base64,{base64_data}",
                'dimensions': image_data.get('dimensions'),
                'interpretation': interpretation,
                'properties': image_data,
                'should_use_everywhere': category in [ImageCategory.LOGO, ImageCategory.ICON],
                'suggested_slides': self._suggest_slides_for_image(category, interpretation)
            }
            
        except Exception as e:
            logger.error(f"Error processing image {file_info.get('name', 'unknown')}: {e}")
            return None
    
    def _analyze_image_properties(self, content: bytes) -> Dict[str, Any]:
        """Analyze image properties like dimensions, aspect ratio, etc."""
        try:
            if isinstance(content, str):
                # If it's base64, decode it
                content = base64.b64decode(content)
            
            image = Image.open(io.BytesIO(content))
            width, height = image.size
            aspect_ratio = width / height
            
            return {
                'dimensions': {'width': width, 'height': height},
                'aspect_ratio': aspect_ratio,
                'is_portrait': aspect_ratio < 1,
                'is_landscape': aspect_ratio > 1,
                'is_square': 0.9 <= aspect_ratio <= 1.1,
                'is_small': width < 200 or height < 200,
                'is_large': width > 2000 or height > 2000,
                'mode': image.mode,
                'format': image.format
            }
        except Exception as e:
            logger.error(f"Error analyzing image properties: {e}")
            return {}
    
    def _categorize_image(self, file_info: Dict[str, Any], image_data: Dict[str, Any]) -> ImageCategory:
        """Categorize an image based on its properties and filename"""
        filename = file_info.get('name', '').lower()
        dimensions = image_data.get('dimensions', {})
        
        # Check for logos
        if 'logo' in filename:
            return ImageCategory.LOGO
        
        # Check for icons
        if 'icon' in filename or (image_data.get('is_small') and image_data.get('is_square')):
            return ImageCategory.ICON
        
        # Check for backgrounds
        if 'background' in filename or 'bg' in filename:
            return ImageCategory.BACKGROUND
        
        # Check for charts
        if any(word in filename for word in ['chart', 'graph', 'plot', 'diagram']):
            return ImageCategory.CHART
        
        # Check for quality issues
        if self._is_low_quality_image(image_data):
            return ImageCategory.REJECTED
        
        # Default to slide image
        return ImageCategory.SLIDE_IMAGE
    
    def _is_low_quality_image(self, image_data: Dict[str, Any]) -> bool:
        """Check if image is low quality"""
        dims = image_data.get('dimensions', {})
        width = dims.get('width', 0)
        height = dims.get('height', 0)
        
        # Too small
        if width < 100 or height < 100:
            return True
        
        # Extreme aspect ratios
        aspect_ratio = image_data.get('aspect_ratio', 1)
        if aspect_ratio > 5 or aspect_ratio < 0.2:
            return True
        
        return False
    
    def _generate_image_interpretation(self, file_info: Dict[str, Any], 
                                     image_data: Dict[str, Any], 
                                     category: ImageCategory) -> str:
        """Generate interpretation of what the image might be"""
        filename = file_info.get('name', 'unknown')
        
        if category == ImageCategory.LOGO:
            return f"Company/brand logo from {filename}. Should be used on title and closing slides."
        elif category == ImageCategory.ICON:
            return f"Icon/symbol from {filename}. Can be used as decorative element."
        elif category == ImageCategory.BACKGROUND:
            return f"Background image from {filename}. Suitable for slide backgrounds."
        elif category == ImageCategory.CHART:
            return f"Chart/diagram from {filename}. Should be reflected accurately in data slides."
        elif category == ImageCategory.REJECTED:
            return f"Low quality image from {filename}. Not recommended for use."
        else:
            # Try to infer from filename
            clean_name = re.sub(r'[_-]', ' ', filename.rsplit('.', 1)[0])
            return f"Image '{clean_name}' suitable for content slides."
    
    def _suggest_slides_for_image(self, category: ImageCategory, interpretation: str) -> List[str]:
        """Suggest which slides should use this image"""
        if category == ImageCategory.LOGO:
            return ["title", "closing", "contact"]
        elif category == ImageCategory.ICON:
            return ["all"]  # Can be used anywhere
        elif category == ImageCategory.BACKGROUND:
            return ["title", "section"]
        elif category == ImageCategory.CHART:
            return ["data", "analysis", "results"]
        elif category == ImageCategory.REJECTED:
            return []
        else:
            # For regular images, suggest based on interpretation
            if any(word in interpretation.lower() for word in ['team', 'people', 'staff']):
                return ["team", "about"]
            elif any(word in interpretation.lower() for word in ['product', 'service']):
                return ["product", "solution", "features"]
            else:
                return ["content"]  # Generic content slides
    
    async def _process_data_file(self, file_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process data files (CSV, Excel)"""
        try:
            file_type = file_info.get('type', '')
            filename = file_info.get('name', '')
            content = file_info.get('content')
            
            if not content:
                return None
            
            # For CSV files, parse the data
            if file_type == 'text/csv' or filename.endswith('.csv'):
                data = self._parse_csv_data(content)
                if data:
                    chart_suggestion = self._suggest_chart_type(data, filename)
                    return {
                        'filename': filename,
                        'type': 'data',
                        'format': 'csv',
                        'data': data,
                        'chart_suggestion': chart_suggestion,
                        'interpretation': f"Data from {filename} with {len(data['rows'])} rows and {len(data['headers'])} columns."
                    }
            
            # For Excel files, we can't parse directly in Python without dependencies
            # So we'll just note it needs processing
            else:
                return {
                    'filename': filename,
                    'type': 'data',
                    'format': 'excel',
                    'interpretation': f"Excel file {filename} contains structured data. Recommend converting to chart.",
                    'chart_suggestion': self._suggest_chart_from_filename(filename)
                }
                
        except Exception as e:
            logger.error(f"Error processing data file {file_info.get('name', 'unknown')}: {e}")
            return None
    
    def _parse_csv_data(self, content: Any) -> Optional[Dict[str, Any]]:
        """Parse CSV data"""
        try:
            if isinstance(content, bytes):
                text = content.decode('utf-8')
            else:
                text = str(content)
            
            # Parse CSV
            reader = csv.reader(io.StringIO(text))
            rows = list(reader)
            
            if not rows:
                return None
            
            # First row as headers
            headers = rows[0] if rows else []
            data_rows = rows[1:] if len(rows) > 1 else []
            
            # Try to detect numeric columns
            numeric_columns = []
            for col_idx in range(len(headers)):
                is_numeric = True
                for row in data_rows[:10]:  # Check first 10 rows
                    if col_idx < len(row):
                        try:
                            float(row[col_idx].replace(',', '').replace('$', '').replace('%', ''))
                        except:
                            is_numeric = False
                            break
                if is_numeric:
                    numeric_columns.append(col_idx)
            
            return {
                'headers': headers,
                'rows': data_rows,
                'numeric_columns': numeric_columns,
                'row_count': len(data_rows),
                'column_count': len(headers)
            }
            
        except Exception as e:
            logger.error(f"Error parsing CSV: {e}")
            return None
    
    def _suggest_chart_type(self, data: Dict[str, Any], filename: str) -> Dict[str, Any]:
        """Suggest appropriate chart type based on data structure"""
        headers = data.get('headers', [])
        numeric_cols = data.get('numeric_columns', [])
        row_count = data.get('row_count', 0)
        
        # If we have time-series data (year, month, date in headers)
        time_patterns = ['year', 'month', 'date', 'time', 'quarter', 'q1', 'q2', 'q3', 'q4']
        has_time = any(any(pattern in header.lower() for pattern in time_patterns) for header in headers)
        
        # If we have percentage data
        has_percentages = any('%' in str(row) for row in data.get('rows', []))
        
        # Based on data characteristics
        if has_time and len(numeric_cols) >= 1:
            return {
                'type': 'line',
                'reason': 'Time series data detected',
                'title': f"{headers[numeric_cols[0]]} over time"
            }
        elif has_percentages and row_count < 10:
            return {
                'type': 'pie',
                'reason': 'Percentage/distribution data detected',
                'title': f"Distribution of {headers[0] if headers else 'data'}"
            }
        elif row_count < 20 and len(numeric_cols) == 1:
            return {
                'type': 'bar',
                'reason': 'Categorical comparison data',
                'title': f"Comparison of {headers[numeric_cols[0]] if numeric_cols and headers else 'values'}"
            }
        else:
            # Fallback based on filename
            return self._suggest_chart_from_filename(filename)
    
    def _suggest_chart_from_filename(self, filename: str) -> Dict[str, Any]:
        """Suggest chart type based on filename"""
        filename_lower = filename.lower()
        
        if any(word in filename_lower for word in ['revenue', 'sales', 'growth', 'trend']):
            return {'type': 'line', 'reason': 'Filename suggests trend data'}
        elif any(word in filename_lower for word in ['distribution', 'breakdown', 'percentage']):
            return {'type': 'pie', 'reason': 'Filename suggests distribution data'}
        elif any(word in filename_lower for word in ['comparison', 'versus', 'vs']):
            return {'type': 'bar', 'reason': 'Filename suggests comparison data'}
        else:
            return {'type': 'bar', 'reason': 'Default chart type for data visualization'}
    
    async def _process_document(self, file_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process document files (PDF, PPT, TXT)"""
        try:
            file_type = file_info.get('type', '')
            filename = file_info.get('name', '')
            content = file_info.get('content')
            
            if not content:
                return None
            
            # For text files, extract content
            if file_type == 'text/plain' or filename.endswith('.txt'):
                if isinstance(content, bytes):
                    text = content.decode('utf-8')
                else:
                    text = str(content)
                
                return {
                    'filename': filename,
                    'type': 'document',
                    'format': 'text',
                    'content': text[:5000],  # Limit to 5000 chars
                    'full_length': len(text),
                    'interpretation': f"Text document with {len(text)} characters. Content will be incorporated into relevant slides."
                }
            
            # For PDF/PPT, note they need special handling
            else:
                format_type = 'powerpoint' if 'presentation' in file_type or filename.endswith(('.ppt', '.pptx')) else 'pdf'
                return {
                    'filename': filename,
                    'type': 'document',
                    'format': format_type,
                    'interpretation': f"{format_type.upper()} document that may contain valuable content and styling information."
                }
                
        except Exception as e:
            logger.error(f"Error processing document {file_info.get('name', 'unknown')}: {e}")
            return None
    
    async def _process_style_file(self, file_info: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """Process style/brand guideline files"""
        try:
            filename = file_info.get('name', '')
            content = file_info.get('content')
            
            logger.info(f"[BRAND GUIDELINE] Processing potential brand guideline file: {filename}")
            
            # Initialize brand info extraction
            extracted_brand_info = {
                'colors': [],
                'fonts': [],
                'style': '',
                'logos': []
            }
            
            # If it's a text-based file, try to extract information
            if content and (filename.endswith('.txt') or file_info.get('type') == 'text/plain'):
                try:
                    if isinstance(content, bytes):
                        text_content = content.decode('utf-8')
                    else:
                        text_content = str(content)
                    
                    logger.info(f"[BRAND GUIDELINE] Extracting from text content ({len(text_content)} chars)")
                    
                    # Extract hex colors
                    import re
                    hex_pattern = r'#[0-9A-Fa-f]{6}\b'
                    hex_colors = re.findall(hex_pattern, text_content)
                    if hex_colors:
                        extracted_brand_info['colors'] = list(set(hex_colors))  # Unique colors
                        logger.info(f"[BRAND GUIDELINE] Found {len(extracted_brand_info['colors'])} hex colors: {extracted_brand_info['colors']}")
                    
                    # Extract RGB colors
                    rgb_pattern = r'rgb\s*\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)'
                    rgb_matches = re.findall(rgb_pattern, text_content, re.IGNORECASE)
                    for r, g, b in rgb_matches:
                        # Convert RGB to hex
                        hex_color = f"#{int(r):02x}{int(g):02x}{int(b):02x}"
                        extracted_brand_info['colors'].append(hex_color)
                    
                    if rgb_matches:
                        logger.info(f"[BRAND GUIDELINE] Found {len(rgb_matches)} RGB colors, converted to hex")
                    
                    # Look for font mentions
                    font_keywords = ['font:', 'typeface:', 'typography:', 'font-family:']
                    for line in text_content.split('\n'):
                        line_lower = line.lower()
                        for keyword in font_keywords:
                            if keyword in line_lower:
                                # Extract font name after the keyword
                                font_part = line.split(keyword, 1)[1].strip()
                                # Clean up common delimiters
                                font_name = font_part.split(',')[0].split(';')[0].strip(' "\';')
                                if font_name and len(font_name) < 50:  # Reasonable font name length
                                    extracted_brand_info['fonts'].append(font_name)
                    
                    if extracted_brand_info['fonts']:
                        logger.info(f"[BRAND GUIDELINE] Found {len(extracted_brand_info['fonts'])} fonts: {extracted_brand_info['fonts']}")
                    
                    # Look for style descriptors
                    style_keywords = ['style:', 'design:', 'aesthetic:', 'look:', 'feel:', 'tone:']
                    style_descriptors = []
                    for line in text_content.split('\n'):
                        line_lower = line.lower()
                        for keyword in style_keywords:
                            if keyword in line_lower:
                                style_part = line.split(keyword, 1)[1].strip()[:100]  # Limit length
                                if style_part:
                                    style_descriptors.append(style_part)
                    
                    if style_descriptors:
                        extracted_brand_info['style'] = ' | '.join(style_descriptors[:3])  # Max 3 descriptors
                        logger.info(f"[BRAND GUIDELINE] Found style descriptors: {extracted_brand_info['style']}")
                
                except Exception as e:
                    logger.warning(f"[BRAND GUIDELINE] Error extracting brand info from text content: {e}")
            
            # Log summary
            has_brand_info = any(extracted_brand_info.values())
            if has_brand_info:
                logger.info(f"[BRAND GUIDELINE] ✅ Successfully extracted brand information from {filename}")
            else:
                logger.info(f"[BRAND GUIDELINE] ℹ️ No brand information extracted from {filename}")
            
            return {
                'filename': filename,
                'type': 'style',
                'interpretation': f"Brand/style guideline document. Design elements should be extracted and applied to the presentation.",
                'guidance': {
                    'extract_colors': True,
                    'extract_fonts': True,
                    'extract_logos': True,
                    'extract_patterns': True
                },
                'extracted_brand_info': extracted_brand_info if any(extracted_brand_info.values()) else None
            }
            
        except Exception as e:
            logger.error(f"Error processing style file {file_info.get('name', 'unknown')}: {e}")
            return None
    
    def _generate_file_context(self, processed_files: Dict[str, Any], prompt: str) -> str:
        """Generate context string for prompt augmentation"""
        context_parts = []
        
        # Add image context
        if processed_files['images']:
            image_context = "\n\nUPLOADED IMAGES:"
            for img in processed_files['images']:
                if img['category'] != 'rejected':
                    image_context += f"\n- {img['filename']}: {img['interpretation']}"
                    if img['should_use_everywhere']:
                        image_context += " (USE ON ALL KEY SLIDES)"
            context_parts.append(image_context)
        
        # Add data file context
        if processed_files['data_files']:
            data_context = "\n\nDATA FILES:"
            for data in processed_files['data_files']:
                data_context += f"\n- {data['filename']}: {data['interpretation']}"
                if 'chart_suggestion' in data:
                    data_context += f" Suggested chart: {data['chart_suggestion']['type']}"
            context_parts.append(data_context)
        
        # Add document context
        if processed_files['documents']:
            doc_context = "\n\nDOCUMENTS:"
            for doc in processed_files['documents']:
                doc_context += f"\n- {doc['filename']}: {doc['interpretation']}"
                if doc['format'] == 'text' and 'content' in doc:
                    # Include a snippet of the content
                    snippet = doc['content'][:200] + "..." if len(doc['content']) > 200 else doc['content']
                    doc_context += f"\n  Content preview: {snippet}"
            context_parts.append(doc_context)
        
        # Add style file context
        if processed_files['style_files']:
            style_context = "\n\nSTYLE GUIDELINES:"
            for style in processed_files['style_files']:
                style_context += f"\n- {style['filename']}: {style['interpretation']}"
            context_parts.append(style_context)
        
        # Add unsupported files note
        if processed_files['unsupported']:
            unsupported_context = "\n\nUNSUPPORTED FILES:"
            for file in processed_files['unsupported']:
                unsupported_context += f"\n- {file['filename']} ({file['type']}): {file['reason']}"
            context_parts.append(unsupported_context)
        
        return ''.join(context_parts)


def create_file_processor(model_type: str = "gemini") -> FileProcessor:
    """Factory function to create a file processor"""
    return FileProcessor(model_type) 