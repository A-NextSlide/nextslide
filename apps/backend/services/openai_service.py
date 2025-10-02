"""
OpenAI Service - Simplified Version

This service handles file processing and outline generation using OpenAI's APIs.
All logic is handled through prompts, not code.
"""

import os
import json
import asyncio
import base64
import uuid
from typing import List, Dict, Any, Optional, Literal, Callable, Tuple
import aiohttp
from datetime import datetime
from io import BytesIO
from dotenv import load_dotenv

from openai import AsyncOpenAI
from pydantic import BaseModel, Field

from services.image_storage_service import ImageStorageService
from setup_logging_optimized import get_logger
from agents.config import FILE_ANALYSIS_MODEL, OUTLINE_OPENAI_SEARCH_MODEL
from agents.ai.clients import MODELS

logger = get_logger(__name__)

# Load environment variables
load_dotenv()

# Configure logging
# logger = logging.getLogger(__name__) # This line is removed as per the new_code

# Type definitions
DetailLevel = Literal['quick', 'detailed']
RunStatus = Literal['completed', 'failed', 'cancelled', 'expired', 'requires_action']


class ExtractedData(BaseModel):
    """Data extracted for visualization"""
    source: str = Field(..., description="Descriptive source name")
    chartType: str = Field(..., description="Chart type: bar, line, pie, scatter, etc.")
    compatibleChartTypes: List[str] = Field(default_factory=list)
    data: List[Dict[str, Any]] = Field(..., description="Nivo-compatible data array")


class SlideOutline(BaseModel):
    """Individual slide in the outline"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    content: str
    deepResearch: bool = False
    extractedData: Optional[ExtractedData] = None


class DeckOutline(BaseModel):
    """Complete deck outline"""
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    title: str
    slides: List[SlideOutline]
    brandGuidelineExtracted: Optional[Dict[str, Any]] = None


class GenerateOutlineOptions(BaseModel):
    """Options for outline generation"""
    prompt: str
    files: List[Dict[str, Any]] = Field(default_factory=list)
    detailLevel: DetailLevel = 'detailed'
    styleContext: Optional[Dict[str, Any]] = None
    fontPreference: Optional[str] = None
    colorPreference: Optional[Dict[str, Any]] = None


class OpenAIService:
    """Simplified OpenAI service - sends files, gets results"""
    
    def __init__(self):
        """Initialize the OpenAI service"""
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.assistant_id = os.getenv('OPENAI_ASSISTANT_ID')
        self.base_url = os.getenv('OPENAI_BASE_URL', 'https://api.openai.com/v1')
        
        if FILE_ANALYSIS_MODEL not in MODELS:
            raise ValueError(f"Model {FILE_ANALYSIS_MODEL} not configured")
        _, self.model = MODELS[FILE_ANALYSIS_MODEL]
        
        self.search_model = os.getenv('OPENAI_SEARCH_MODEL', OUTLINE_OPENAI_SEARCH_MODEL)
        
        # API endpoints
        self.chat_completions_url = f"{self.base_url}/chat/completions"
        self.assistants_url = f"{self.base_url}/assistants"
        self.threads_url = f"{self.base_url}/threads"
        self.files_url = f"{self.base_url}/files"
    
    async def _fetch_openai_api(self, url: str, method: str = 'POST', 
                                json_data: Optional[Dict] = None, 
                                headers: Optional[Dict[str, str]] = None,
                                data: Optional[Any] = None) -> Optional[Dict]:
        """Make API call to OpenAI"""
        if not self.api_key:
            raise Exception("OpenAI API key is not set")
            
        default_headers = {'Authorization': f'Bearer {self.api_key}'}
        
        if json_data and not data:
            default_headers['Content-Type'] = 'application/json'
        
        if headers:
            default_headers.update(headers)
            
        async with aiohttp.ClientSession() as session:
            kwargs = {
                'headers': default_headers,
                'timeout': aiohttp.ClientTimeout(total=300)
            }
            
            if json_data:
                kwargs['json'] = json_data
            elif data:
                kwargs['data'] = data
            
            async with session.request(method, url, **kwargs) as response:
                response_text = await response.text()
                
                if response.status == 200:
                    return json.loads(response_text)
                else:
                    raise Exception(f"OpenAI API error: {response.status} - {response_text}")
    
    async def _process_files_with_assistant(
        self, 
        files: List[Dict[str, Any]], 
        prompt: str,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """Process files using OpenAI Assistant"""
        if not self.api_key or not self.assistant_id:
            logger.error("OpenAI API key or Assistant ID not configured")
            return {
                'images': [],
                'data_files': [],
                'documents': [],
                'style_files': [],
                'unsupported': [],
                'file_context': '',
                'extracted_data': []
            }
        
        logger.info(f"[ASSISTANT] Processing {len(files)} files")
        
        try:
            # Create thread
            thread_response = await self._fetch_openai_api(
                self.threads_url, 'POST', {},
                headers={'OpenAI-Beta': 'assistants=v2'}
            )
            
            if not thread_response or 'id' not in thread_response:
                raise Exception("Failed to create thread")
            
            thread_id = thread_response['id']
            
            # Upload files
            uploaded_files = []
            logger.info(f"[ASSISTANT] Preparing to upload {len(files)} files")
            
            for file_info in files:
                file_name = file_info.get('name', '')
                file_content = file_info.get('content', b'')
                file_type = file_info.get('type', 'application/octet-stream')
                
                # Convert base64 string to bytes if needed
                if isinstance(file_content, str):
                    # Remove data URL prefix if present
                    if file_content.startswith('data:'):
                        file_content = file_content.split(',', 1)[1]
                    # Decode base64
                    file_content = base64.b64decode(file_content)
                
                logger.info(f"[ASSISTANT] Uploading file: {file_name} ({file_type}), size: {len(file_content)} bytes")
                
                # Upload file
                form_data = aiohttp.FormData()
                form_data.add_field('file', file_content, filename=file_name, content_type=file_type)
                form_data.add_field('purpose', 'assistants')
                
                upload_response = await self._fetch_openai_api(
                    self.files_url, 'POST', data=form_data
                )
                
                if upload_response and 'id' in upload_response:
                    logger.info(f"[ASSISTANT] Successfully uploaded {file_name} with ID: {upload_response['id']}")
                    uploaded_files.append({
                        'id': upload_response['id'],
                        'name': file_name,
                        'type': file_type
                    })
                else:
                    logger.error(f"[ASSISTANT] Failed to upload {file_name}: {upload_response}")
            
            if not uploaded_files:
                logger.error("[ASSISTANT] No files were successfully uploaded!")
                return {
                    'images': [],
                    'data_files': [],
                    'documents': [],
                    'style_files': [],
                    'unsupported': [],
                    'file_context': 'Failed to upload files to OpenAI Assistant',
                    'extracted_data': []
                }
            
            logger.info(f"[ASSISTANT] Successfully uploaded {len(uploaded_files)} files")
            
            # Create prompt with extraction instructions
            extraction_prompt = f"""
{prompt}

CRITICAL: You MUST extract ALL data from the uploaded files, especially Excel files.

For Excel files:
1. Use code interpreter to read ALL sheets
2. Extract ACTUAL numeric values and data
3. Look for stock symbols, prices, dates, shares, portfolios
4. If you see price history data, extract specific dates and prices
5. If you see portfolio/watchlist data, extract share counts and values

For Image files:
1. Analyze the visual content, composition, and style
2. Identify key elements, subjects, and themes
3. Describe colors, mood, and atmosphere
4. Note any text, logos, or identifiable objects
5. Suggest how the image could be used in presentations
6. Describe the overall message or story the image conveys

⚠️ IMPORTANT: Extract the MAIN data, not sample/demo/placeholder rows!
- Look for the PRIMARY portfolio holdings (not test data)
- If you see multiple rows, find the ACTUAL holdings (usually larger values)
- Skip rows that look like examples or have very small values (< $10)
- For portfolio data: Look for realistic share counts (1-1000 shares) not fractions

Required response format:

=== EXTRACTED DATA START ===
List the ACTUAL data found, for example:
- [Symbol] Stock: [X] shares @ $[price] = $[total] total
- Price History: [N] rows from [start date] to [end date]
- Price Range: $[low] (low) to $[high] (high)
- Recent Price: $[price] (most recent)
- Any other relevant data found in the file

For images:
- Subject: [Main subject or theme]
- Style: [Visual style, e.g., modern, minimalist, corporate]
- Colors: [Dominant colors and mood]
- Suggested use: [How this could enhance a presentation]
- Key elements: [Important visual elements]
=== EXTRACTED DATA END ===

=== CHART DATA START ===
For time series data (prices, dates), use LINE chart format:
LINE CHART - [Title]:
Date: [date], Price: [value]
Date: [date], Price: [value]
[Include 10-20 actual data points from the file]

For categorical data (portfolios, allocations), use PIE chart format:
PIE CHART - [Title]:
[Category]: [value]
[Category]: [value]
[Include all categories found]
=== CHART DATA END ===

IMPORTANT: Extract REAL numbers from the Excel file. Do NOT say "no data detected" unless the file is truly empty or corrupted!

For Brand Guideline Documents:
1. Extract ALL color values (hex codes, RGB values, color names)
2. Extract font specifications (typefaces, font families, sizes)
3. Extract style descriptors (modern, minimal, bold, etc.)
4. Note any logo usage guidelines
5. Identify spacing and layout rules

=== BRAND GUIDELINES START ===
If this is a brand guideline document, extract:
- Primary Colors: [List hex codes]
- Secondary Colors: [List hex codes]
- Typography: [Font names and usage]
- Style: [Design style descriptors]
- Logo Guidelines: [Any logo rules]
=== BRAND GUIDELINES END ===
"""
            
            # Add message with files
            # Note: OpenAI Assistant API has limitations with image files
            # Images cannot use file_search (not supported) but attachments require at least one tool
            # This is a current limitation of the Assistant API
            message_payload = {
                'role': 'user',
                'content': extraction_prompt,
                'attachments': [
                    {
                        'file_id': f['id'],
                        'tools': [{'type': 'code_interpreter'}] if f['name'].endswith(('.xlsx', '.xls', '.csv')) else [{'type': 'file_search'}]
                    }
                    for f in uploaded_files
                ]
            }
            
            await self._fetch_openai_api(
                f"{self.threads_url}/{thread_id}/messages", 'POST',
                message_payload, headers={'OpenAI-Beta': 'assistants=v2'}
            )
            
            # Run assistant
            run_response = await self._fetch_openai_api(
                f"{self.threads_url}/{thread_id}/runs", 'POST',
                {'assistant_id': self.assistant_id, 'model': self.model},
                headers={'OpenAI-Beta': 'assistants=v2'}
            )
            
            if not run_response or 'id' not in run_response:
                raise Exception("Failed to create run")
            
            run_id = run_response['id']
            
            # Poll for completion
            max_attempts = 80
            for _ in range(max_attempts):
                await asyncio.sleep(1.5)
                
                run = await self._fetch_openai_api(
                    f"{self.threads_url}/{thread_id}/runs/{run_id}", 'GET',
                    headers={'OpenAI-Beta': 'assistants=v2'}
                )
                
                if run and run.get('status') in ['completed', 'failed']:
                    if run.get('status') == 'failed':
                        raise Exception("Assistant run failed")
                    break
            
            # Get messages
            messages = await self._fetch_openai_api(
                f"{self.threads_url}/{thread_id}/messages?order=desc&limit=1", 'GET',
                headers={'OpenAI-Beta': 'assistants=v2'}
            )
            
            if not messages or not messages.get('data'):
                raise Exception("No assistant response found")
            
            # Extract response
            raw_output = messages['data'][0]['content'][0]['text']['value']
            logger.info(f"[ASSISTANT] Raw response length: {len(raw_output)} chars")
            
            # Log first 500 chars of response for debugging
            logger.info(f"[ASSISTANT] Response preview: {raw_output[:500]}...")
            
            # Simple extraction using markers
            file_context = ""
            extracted_data = []
            
            # Extract data between markers - NO PARSING, just pass through
            if "=== EXTRACTED DATA START ===" in raw_output and "=== EXTRACTED DATA END ===" in raw_output:
                start = raw_output.find("=== EXTRACTED DATA START ===") + len("=== EXTRACTED DATA START ===")
                end = raw_output.find("=== EXTRACTED DATA END ===")
                extracted_text = raw_output[start:end].strip()
                
                logger.info(f"[ASSISTANT] Extracted text length: {len(extracted_text)} chars")
                
                # Check for chart data section
                chart_text = ""
                if "=== CHART DATA START ===" in raw_output and "=== CHART DATA END ===" in raw_output:
                    chart_start = raw_output.find("=== CHART DATA START ===") + len("=== CHART DATA START ===")
                    chart_end = raw_output.find("=== CHART DATA END ===")
                    chart_text = raw_output[chart_start:chart_end].strip()
                    
                    file_context = f"EXTRACTED DATA:\n{extracted_text}\nCHART DATA:\n{chart_text}"
                else:
                    file_context = f"EXTRACTED DATA:\n{extracted_text}"
                
                # Just pass the raw extracted data - NO PARSING
                # The model output is what we use, not parsed values
                extracted_data = [{
                    'source': 'Extracted from uploaded file',
                    'raw_text': extracted_text,
                    'chart_text': chart_text if chart_text else None
                }]
                
                logger.info(f"[ASSISTANT] Passing through raw extracted data")
            else:
                # Fallback to full output if markers not found
                file_context = raw_output[:3000]  # Limit to 3000 chars
                logger.info(f"[ASSISTANT] No extraction markers found, using raw output")
            
            logger.info(f"[ASSISTANT] Final context length: {len(file_context)} chars")
            
            # Extract brand guideline information if present
            brand_guidelines = None
            if "=== BRAND GUIDELINES START ===" in raw_output and "=== BRAND GUIDELINES END ===" in raw_output:
                logger.info(f"[ASSISTANT] Found BRAND GUIDELINES section in response")
                brand_start = raw_output.find("=== BRAND GUIDELINES START ===") + len("=== BRAND GUIDELINES START ===")
                brand_end = raw_output.find("=== BRAND GUIDELINES END ===")
                brand_text = raw_output[brand_start:brand_end].strip()
                
                if brand_text:
                    logger.info(f"[ASSISTANT] Extracting brand guidelines from {len(brand_text)} chars of text")
                    # Parse brand guideline text into structured format
                    brand_guidelines = {
                        'colors': [],
                        'fonts': [],
                        'style': '',
                        'source': 'OpenAI Assistant extraction'
                    }
                    
                    # Simple parsing of the extracted text
                    lines = brand_text.split('\n')
                    current_section = None
                    
                    for line in lines:
                        line = line.strip()
                        if not line:
                            continue
                            
                        if 'colors:' in line.lower():
                            current_section = 'colors'
                            # Extract colors from the same line if present
                            color_part = line.split(':', 1)[1].strip()
                            if color_part:
                                # Extract hex colors
                                import re
                                hex_colors = re.findall(r'#[0-9A-Fa-f]{6}\b', color_part)
                                brand_guidelines['colors'].extend(hex_colors)
                        elif 'typography:' in line.lower() or 'fonts:' in line.lower():
                            current_section = 'fonts'
                            font_part = line.split(':', 1)[1].strip()
                            if font_part:
                                brand_guidelines['fonts'].append(font_part)
                        elif 'style:' in line.lower():
                            current_section = 'style'
                            style_part = line.split(':', 1)[1].strip()
                            if style_part:
                                brand_guidelines['style'] = style_part
                        elif current_section == 'colors' and line.startswith('-'):
                            # Extract hex colors from bullet points
                            import re
                            hex_colors = re.findall(r'#[0-9A-Fa-f]{6}\b', line)
                            brand_guidelines['colors'].extend(hex_colors)
                        elif current_section == 'fonts' and line.startswith('-'):
                            font_name = line.strip('- ').strip()
                            if font_name:
                                brand_guidelines['fonts'].append(font_name)
                    
                    logger.info(f"[ASSISTANT] ✅ Extracted brand guidelines: {len(brand_guidelines['colors'])} colors, {len(brand_guidelines['fonts'])} fonts")
                    if brand_guidelines['colors']:
                        logger.info(f"[ASSISTANT] Brand colors: {brand_guidelines['colors']}")
                    if brand_guidelines['fonts']:
                        logger.info(f"[ASSISTANT] Brand fonts: {brand_guidelines['fonts']}")
                    if brand_guidelines['style']:
                        logger.info(f"[ASSISTANT] Brand style: {brand_guidelines['style']}")
            
            # If extracted_text was defined earlier, optionally append chart data section
            # Guard to avoid referencing an undefined variable when markers were absent
            if 'extracted_text' in locals() and extracted_text:
                chart_text = ""
                if "=== CHART DATA START ===" in raw_output and "=== CHART DATA END ===" in raw_output:
                    chart_start = raw_output.find("=== CHART DATA START ===") + len("=== CHART DATA START ===")
                    chart_end = raw_output.find("=== CHART DATA END ===")
                    chart_text = raw_output[chart_start:chart_end].strip()
                    file_context = f"EXTRACTED DATA:\n{extracted_text}\nCHART DATA:\n{chart_text}"
                else:
                    file_context = f"EXTRACTED DATA:\n{extracted_text}"
            
            return {
                'images': [],
                'data_files': [],
                'documents': [],
                'style_files': [],
                'unsupported': [],
                'file_context': file_context,
                'extracted_data': extracted_data,
                'brand_guidelines': brand_guidelines
            }
            
        except Exception as e:
            logger.error(f"Error processing files with assistant: {e}")
            return {
                'images': [],
                'data_files': [],
                'documents': [],
                'style_files': [],
                'unsupported': [],
                'file_context': '',
                'extracted_data': []
            }
    
    async def _process_images_with_vision(
        self,
        files: List[Dict[str, Any]],
        prompt: str,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> Dict[str, Any]:
        """Process images using Chat Completions API with vision"""
        logger.info(f"[VISION] Processing {len(files)} images with vision API")
        
        # First, upload images to Supabase to avoid timeout issues
        print(f"[VISION] Starting upload of {len(files)} images to Supabase...")
        from services.image_storage_service import ImageStorageService
        storage_service = ImageStorageService()
        
        uploaded_files = []
        async with storage_service as storage:
            for file_info in files:
                print(f"[VISION] Processing file: {file_info.get('name', 'unknown')}")
                file_name = file_info.get('name', '')
                file_content = file_info.get('content', '')
                file_type = file_info.get('type', 'image/jpeg')
                
                print(f"[VISION] File {file_name} - has content: {bool(file_content)}, content length: {len(file_content) if file_content else 0}")
                
                # If content is base64, upload to Supabase
                if file_content and not file_content.startswith('http'):
                    try:
                        # Remove data URL prefix if present
                        if file_content.startswith('data:'):
                            parts = file_content.split(',', 1)
                            if len(parts) == 2:
                                file_content = parts[1]
                        
                        print(f"[VISION] Uploading {file_name} to Supabase...")
                        logger.info(f"[VISION] Uploading {file_name} to Supabase...")
                        result = await storage.upload_image_from_base64(
                            base64_data=file_content,
                            filename=file_name,
                            content_type=file_type
                        )
                        
                        file_info_copy = file_info.copy()
                        file_info_copy['url'] = result['url']
                        uploaded_files.append(file_info_copy)
                        print(f"[VISION] ✓ Uploaded {file_name} to: {result['url']}")
                        logger.info(f"[VISION] Uploaded {file_name} to: {result['url']}")
                    except Exception as e:
                        print(f"[VISION] ✗ Failed to upload {file_name}: {e}")
                        logger.error(f"[VISION] Failed to upload {file_name}: {e}")
                        uploaded_files.append(file_info)
                else:
                    print(f"[VISION] Skipping upload for {file_name} - already has URL or no content")
                    uploaded_files.append(file_info)
        
        image_analyses = []
        
        for file_info in uploaded_files:
            file_name = file_info.get('name', '')
            file_content = file_info.get('content', '')
            file_type = file_info.get('type', 'image/jpeg')
            
            logger.info(f"[VISION] Processing file: {file_name}, type: {file_type}")
            logger.info(f"[VISION] Content preview: {file_content[:100] if file_content else 'empty'}")
            
            # Ensure content is properly formatted for vision API
            if not file_content.startswith('data:'):
                # If it's base64, add the data URL prefix
                if file_content:
                    file_content = f"data:{file_type};base64,{file_content}"
            
            logger.info(f"[VISION] Analyzing image: {file_name}")
            
            try:
                # Use Chat Completions API with vision
                response = await self._fetch_openai_api(
                    self.chat_completions_url,
                    json_data={
                        "model": "gpt-4o",
                        "messages": [
                            {
                                "role": "user",
                                "content": [
                                    {
                                        "type": "text",
                                        "text": f"""Analyze this image and provide:
- Subject: Main subject or theme
- Style: Visual style (e.g., modern, minimalist, corporate)
- Colors: Dominant colors and mood
- Suggested use: How this could enhance a presentation
- Key elements: Important visual elements
- Overall message: What story or message the image conveys

Image filename: {file_name}"""
                                    },
                                    {
                                        "type": "image_url",
                                        "image_url": {
                                            "url": file_content
                                        }
                                    }
                                ]
                            }
                        ],
                        "max_tokens": 500
                    }
                )
                
                if response and 'choices' in response and response['choices']:
                    analysis = response['choices'][0]['message']['content']
                    image_analyses.append({
                        'filename': file_name,
                        'analysis': analysis
                    })
                    logger.info(f"[VISION] Successfully analyzed {file_name}")
                else:
                    logger.error(f"[VISION] Failed to analyze {file_name}")
                    
            except Exception as e:
                logger.error(f"[VISION] Error analyzing {file_name}: {e}")
        
        # Format the analyses as file context
        file_context = ""
        if image_analyses:
            file_context = "IMAGE ANALYSIS RESULTS:\n\n"
            for idx, analysis in enumerate(image_analyses, 1):
                file_context += f"Image {idx}: {analysis['filename']}\n"
                file_context += f"{analysis['analysis']}\n\n"
        
        # Build images list with interpretations from analyses
        images_with_interpretations = []
        for f in uploaded_files:  # Use uploaded_files which have URLs
            # Find the corresponding analysis
            analysis_text = ""
            for analysis in image_analyses:
                if analysis['filename'] == f['name']:
                    analysis_text = analysis['analysis']
                    break
            
            # Prefer URL over base64 to avoid database timeout
            url = f.get('url', '')
            
            # Only include base64 if no URL available (fallback)
            base64_content = ''
            if not url:
                file_content = f.get('content', '')
                file_type = f.get('type', 'image/jpeg')
                if file_content and not file_content.startswith('data:'):
                    base64_content = f"data:{file_type};base64,{file_content}"
                else:
                    base64_content = file_content
            
            logger.info(f"[VISION] Adding image {f['name']} - URL: {'yes' if url else 'no'}, base64: {'yes' if base64_content else 'no'}")
            
            image_data = {
                'filename': f['name'],
                'category': 'photo',
                'interpretation': analysis_text or f"Image '{f['name']}' suitable for visual content.",
                'suggested_slides': ['all']  # Vision-analyzed images can be used anywhere
            }
            
            # Add URL if available (preferred)
            if url:
                image_data['url'] = url
            
            # Only add base64 if no URL (to avoid large data in database)
            if base64_content and not url:
                image_data['base64'] = base64_content
                
            images_with_interpretations.append(image_data)
        
        return {
            'images': images_with_interpretations,
            'data_files': [],
            'documents': [],
            'style_files': [],
            'unsupported': [],
            'file_context': file_context,
            'extracted_data': []
        }
    
    def _build_system_prompt(self, base_prompt: str) -> str:
        """Build system prompt with JSON formatting instructions"""
        return f"""{base_prompt}

You must return a JSON object with this EXACT structure:
{{
  "title": "Presentation Title",
  "slides": [
    {{
      "title": "Slide Title",
      "content": "Slide content",
      "deepResearch": false,
      "extractedData": null or {{
        "source": "descriptive_source_name",
        "chartType": "line|bar|pie|scatter",
        "compatibleChartTypes": ["line", "bar"],
        "data": [/* Nivo-compatible data */]
      }}
    }}
  ],
  "brandGuidelineExtracted": null
}}

CRITICAL RULES:
1. If EXTRACTED DATA is provided, use REAL values in slide content
2. For stock price history: use LINE chart, not PIE chart
3. LINE chart format: [{{"x": "date", "y": value}}]
4. PIE chart format: [{{"name": "category", "value": number}}]
5. Return ONLY JSON, no explanatory text
"""
    
    async def generate_slide_outline(
        self,
        options: GenerateOutlineOptions,
        chat_completion_system_prompt: str,
        assistant_system_prompt: str,
        on_progress: Optional[Callable[[str], None]] = None
    ) -> DeckOutline:
        """Generate a slide outline"""
        # Format style preferences
        style_prefs = ""
        if options.fontPreference:
            style_prefs += f"\nFont preference: {options.fontPreference}"
        if options.colorPreference:
            style_prefs += f"\nColor scheme: {options.colorPreference.get('type', 'default')}"
        
        prompt = f"{options.prompt}{style_prefs}"
        
        # Process files if any
        file_context = ""
        if options.files:
            # Check if we should use assistant
            has_complex_files = any(
                f.get('type', '').startswith(('application/vnd.ms-excel', 
                                             'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                                             'text/csv'))
                for f in options.files
            )
            
            has_images = any(
                f.get('type', '').startswith('image/')
                for f in options.files
            )
            
            if has_complex_files and self.assistant_id:
                if on_progress:
                    on_progress("Processing files with Assistant...")
                
                result = await self._process_files_with_assistant(
                    options.files, assistant_system_prompt, on_progress
                )
                file_context = result.get('file_context', '')
            
            elif has_images:
                # Process images with vision API
                if on_progress:
                    on_progress("Analyzing images...")
                
                # Filter out only image files
                image_files = [f for f in options.files if f.get('type', '').startswith('image/')]
                
                result = await self._process_images_with_vision(
                    image_files, options.prompt, on_progress
                )
                file_context = result.get('file_context', '')
                
            if file_context:
                prompt = f"{prompt}\n\n{file_context}"
        
        # Generate outline using chat completion
        if on_progress:
            on_progress("Generating outline...")
        
        system_prompt = self._build_system_prompt(chat_completion_system_prompt)
        
        response = await self._fetch_openai_api(
            self.chat_completions_url,
            json_data={
                "model": self.model,
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": prompt}
                ],
                "temperature": 0.7,
                "response_format": {"type": "json_object"}
            }
        )
        
        if not response or 'choices' not in response:
            raise Exception("Invalid response from OpenAI API")
        
        content = response['choices'][0]['message']['content']
        outline_data = json.loads(content)
        
        # Convert to DeckOutline
        slides = []
        for slide_data in outline_data.get('slides', []):
            slide = SlideOutline(
                title=slide_data.get('title', 'Untitled'),
                content=slide_data.get('content', ''),
                deepResearch=slide_data.get('deepResearch', False),
                extractedData=ExtractedData(**slide_data['extractedData']) if slide_data.get('extractedData') else None
            )
            slides.append(slide)
        
        outline = DeckOutline(
            title=outline_data.get('title', 'Untitled Presentation'),
            slides=slides,
            brandGuidelineExtracted=outline_data.get('brandGuidelineExtracted')
        )
        
        if on_progress:
            on_progress("Outline generated successfully!")
        
        return outline


# Create singleton instance
openai_service = OpenAIService() 