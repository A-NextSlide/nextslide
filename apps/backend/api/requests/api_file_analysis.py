"""
File Analysis API using Anthropic Claude

This module provides file analysis capabilities using Claude's vision and text understanding.
Supports: images (PNG, JPG, GIF, WebP), PDFs (as text), Excel, CSV, and documents.
"""

import os
import base64
import logging
import mimetypes
from typing import List, Dict, Any, Optional
from pydantic import BaseModel, Field
from fastapi import APIRouter, HTTPException
from io import BytesIO

logger = logging.getLogger(__name__)

router = APIRouter()


class FileInput(BaseModel):
    """Input file for analysis"""
    id: str = Field(description="Unique file ID")
    name: str = Field(description="Original filename")
    type: str = Field(description="MIME type")
    content: Optional[str] = Field(default=None, description="Base64 encoded content")
    url: Optional[str] = Field(default=None, description="URL to the file")
    size: Optional[int] = Field(default=None, description="File size in bytes")


class FileAnalysisRequest(BaseModel):
    """Request for file analysis"""
    files: List[FileInput] = Field(description="Files to analyze")
    context: Optional[str] = Field(default=None, description="Additional context for analysis")
    chat_history: Optional[List[Dict[str, str]]] = Field(default=None, description="Chat history for context")


class FileAnalysisResult(BaseModel):
    """Result of file analysis"""
    file_id: str
    filename: str
    file_type: str
    analysis: str
    summary: str
    suggestions: List[str] = Field(default_factory=list)
    extracted_data: Optional[Dict[str, Any]] = None
    preview_url: Optional[str] = None


class FileAnalysisResponse(BaseModel):
    """Response from file analysis"""
    success: bool
    results: List[FileAnalysisResult]
    combined_analysis: str
    message: str


def _get_mime_type(filename: str, provided_type: str) -> str:
    """Get the MIME type from filename or provided type"""
    if provided_type and provided_type != 'application/octet-stream':
        return provided_type

    guessed, _ = mimetypes.guess_type(filename)
    return guessed or 'application/octet-stream'


def _is_image(mime_type: str) -> bool:
    """Check if the file is an image"""
    return mime_type.startswith('image/')


def _is_document(mime_type: str) -> bool:
    """Check if the file is a document (PDF, Word, etc.)"""
    doc_types = [
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'text/plain',
        'text/markdown',
        'text/html'
    ]
    return mime_type in doc_types


def _is_spreadsheet(mime_type: str, filename: str) -> bool:
    """Check if the file is a spreadsheet"""
    spreadsheet_types = [
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'text/csv'
    ]
    return mime_type in spreadsheet_types or filename.lower().endswith(('.csv', '.xlsx', '.xls'))


def _is_presentation(mime_type: str, filename: str) -> bool:
    """Check if the file is a presentation"""
    ppt_types = [
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'
    ]
    return mime_type in ppt_types or filename.lower().endswith(('.ppt', '.pptx'))


async def _analyze_image_with_claude(file_input: FileInput, context: str = "") -> FileAnalysisResult:
    """Analyze an image using Claude's vision capabilities"""
    from agents.ai.clients import get_client, invoke

    try:
        # Get Claude client
        client, model_name = get_client("claude-3-5-sonnet", wrap_with_instructor=False)

        # Prepare the image content
        mime_type = _get_mime_type(file_input.name, file_input.type)

        # Build the message with image
        content_blocks = []

        if file_input.content:
            # Base64 content provided
            content_blocks.append({
                "type": "image",
                "source": {
                    "type": "base64",
                    "media_type": mime_type,
                    "data": file_input.content
                }
            })
        elif file_input.url:
            # URL provided - fetch and convert to base64
            import httpx
            async with httpx.AsyncClient() as http_client:
                response = await http_client.get(file_input.url)
                if response.status_code == 200:
                    image_data = base64.b64encode(response.content).decode('utf-8')
                    content_blocks.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": mime_type,
                            "data": image_data
                        }
                    })
                else:
                    raise ValueError(f"Failed to fetch image from URL: {response.status_code}")

        # Add the analysis prompt
        analysis_prompt = f"""Analyze this image for use in a presentation. Provide:

1. **Description**: A concise description of what the image shows
2. **Key Elements**: Important elements, text, data, or subjects in the image
3. **Quality Assessment**: Image quality, resolution suitability for presentations
4. **Suggested Use**: How this image could be used in a presentation
5. **Extracted Text**: Any text visible in the image (OCR)
6. **Data/Charts**: If this contains charts/graphs/data, extract the key figures

{f"Additional context: {context}" if context else ""}

Be concise but thorough. Format your response clearly."""

        content_blocks.append({
            "type": "text",
            "text": analysis_prompt
        })

        messages = [{
            "role": "user",
            "content": content_blocks
        }]

        # Call Claude
        result = client.messages.create(
            model=model_name,
            messages=messages,
            max_tokens=1500
        )

        analysis_text = result.content[0].text if result.content else "No analysis available"

        # Extract a summary (first 200 chars or first paragraph)
        summary = analysis_text.split('\n\n')[0][:200] if analysis_text else "Image analyzed"

        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="image",
            analysis=analysis_text,
            summary=summary,
            suggestions=[
                "Use as slide background",
                "Add as supporting visual",
                "Use in image gallery"
            ],
            preview_url=file_input.url
        )

    except Exception as e:
        logger.error(f"Error analyzing image {file_input.name}: {e}")
        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="image",
            analysis=f"Error analyzing image: {str(e)}",
            summary="Analysis failed",
            suggestions=[]
        )


async def _analyze_document_with_claude(file_input: FileInput, context: str = "") -> FileAnalysisResult:
    """Analyze a document (PDF, text, etc.) using Claude"""
    from agents.ai.clients import get_client, invoke

    try:
        client, model_name = get_client("claude-3-5-haiku", wrap_with_instructor=False)

        # Extract text content
        text_content = ""
        mime_type = _get_mime_type(file_input.name, file_input.type)

        if file_input.content:
            # Decode base64 content
            try:
                raw_bytes = base64.b64decode(file_input.content)

                if mime_type == 'application/pdf':
                    # For PDFs, we'll use Claude's PDF understanding
                    # Note: Claude can analyze PDFs directly via base64
                    messages = [{
                        "role": "user",
                        "content": [
                            {
                                "type": "document",
                                "source": {
                                    "type": "base64",
                                    "media_type": "application/pdf",
                                    "data": file_input.content
                                }
                            },
                            {
                                "type": "text",
                                "text": f"""Analyze this document for creating a presentation. Provide:

1. **Summary**: Main topic and key points
2. **Key Facts**: Important statistics, dates, or figures
3. **Structure**: How the document is organized
4. **Presentation Suggestions**: Key slides that could be created from this content

{f"Additional context: {context}" if context else ""}

Be concise and focus on presentation-worthy content."""
                            }
                        ]
                    }]

                    result = client.messages.create(
                        model=model_name,
                        messages=messages,
                        max_tokens=2000
                    )

                    analysis_text = result.content[0].text if result.content else "No analysis available"

                else:
                    # Plain text documents
                    text_content = raw_bytes.decode('utf-8', errors='ignore')[:10000]  # Limit to 10k chars

                    messages = [{
                        "role": "user",
                        "content": f"""Analyze this document content for creating a presentation:

---
{text_content}
---

Provide:
1. **Summary**: Main topic and key points
2. **Key Facts**: Important statistics, dates, or figures
3. **Presentation Suggestions**: Key slides that could be created from this content

{f"Additional context: {context}" if context else ""}

Be concise."""
                    }]

                    result = client.messages.create(
                        model=model_name,
                        messages=messages,
                        max_tokens=1500
                    )

                    analysis_text = result.content[0].text if result.content else "No analysis available"

            except Exception as decode_err:
                logger.error(f"Error decoding document content: {decode_err}")
                analysis_text = f"Error decoding document: {str(decode_err)}"
        else:
            analysis_text = "No document content provided"

        summary = analysis_text.split('\n\n')[0][:200] if analysis_text else "Document analyzed"

        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="document",
            analysis=analysis_text,
            summary=summary,
            suggestions=[
                "Extract key points for slides",
                "Create outline from document",
                "Use as reference material"
            ]
        )

    except Exception as e:
        logger.error(f"Error analyzing document {file_input.name}: {e}")
        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="document",
            analysis=f"Error analyzing document: {str(e)}",
            summary="Analysis failed",
            suggestions=[]
        )


async def _analyze_spreadsheet_with_claude(file_input: FileInput, context: str = "") -> FileAnalysisResult:
    """Analyze a spreadsheet (CSV, Excel) using Claude"""
    from agents.ai.clients import get_client

    try:
        client, model_name = get_client("claude-3-5-haiku", wrap_with_instructor=False)

        data_preview = ""
        extracted_data = None

        if file_input.content:
            raw_bytes = base64.b64decode(file_input.content)
            filename_lower = file_input.name.lower()

            if filename_lower.endswith('.csv'):
                # Parse CSV
                import csv
                from io import StringIO
                text_content = raw_bytes.decode('utf-8', errors='ignore')
                reader = csv.reader(StringIO(text_content))
                rows = list(reader)[:20]  # First 20 rows

                if rows:
                    headers = rows[0] if rows else []
                    data_rows = rows[1:] if len(rows) > 1 else []
                    data_preview = f"Headers: {', '.join(headers)}\nSample data ({len(data_rows)} rows shown):\n"
                    for row in data_rows[:5]:
                        data_preview += f"  {', '.join(row[:5])}\n"

                    extracted_data = {
                        "headers": headers,
                        "sample_rows": data_rows[:10],
                        "total_rows": len(rows) - 1
                    }

            elif filename_lower.endswith(('.xlsx', '.xls')):
                # Try to read Excel
                try:
                    import openpyxl
                    from io import BytesIO

                    wb = openpyxl.load_workbook(BytesIO(raw_bytes), read_only=True)
                    sheet = wb.active

                    rows = []
                    for i, row in enumerate(sheet.iter_rows(values_only=True)):
                        if i >= 20:
                            break
                        rows.append([str(cell) if cell is not None else "" for cell in row])

                    if rows:
                        headers = rows[0]
                        data_rows = rows[1:]
                        data_preview = f"Headers: {', '.join(headers[:10])}\nSample data:\n"
                        for row in data_rows[:5]:
                            data_preview += f"  {', '.join(row[:5])}\n"

                        extracted_data = {
                            "headers": headers[:20],
                            "sample_rows": data_rows[:10],
                            "total_rows": sheet.max_row - 1 if sheet.max_row else 0
                        }

                    wb.close()
                except ImportError:
                    data_preview = "Excel file detected but openpyxl not available"
                except Exception as excel_err:
                    data_preview = f"Error reading Excel: {str(excel_err)}"

        # Analyze with Claude
        messages = [{
            "role": "user",
            "content": f"""Analyze this spreadsheet data for creating presentation charts/visualizations:

{data_preview}

Provide:
1. **Data Summary**: What does this data represent?
2. **Key Insights**: Notable trends, patterns, or statistics
3. **Chart Recommendations**: Best chart types for visualizing this data (bar, line, pie, etc.)
4. **Presentation Ideas**: How to present this data effectively

{f"Additional context: {context}" if context else ""}

Be specific about visualization recommendations."""
        }]

        result = client.messages.create(
            model=model_name,
            messages=messages,
            max_tokens=1500
        )

        analysis_text = result.content[0].text if result.content else "No analysis available"
        summary = analysis_text.split('\n\n')[0][:200] if analysis_text else "Data analyzed"

        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="spreadsheet",
            analysis=analysis_text,
            summary=summary,
            suggestions=[
                "Create bar chart",
                "Create line chart",
                "Create pie chart",
                "Add as data table"
            ],
            extracted_data=extracted_data
        )

    except Exception as e:
        logger.error(f"Error analyzing spreadsheet {file_input.name}: {e}")
        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="spreadsheet",
            analysis=f"Error analyzing spreadsheet: {str(e)}",
            summary="Analysis failed",
            suggestions=[]
        )


async def _analyze_presentation_with_claude(file_input: FileInput, context: str = "") -> FileAnalysisResult:
    """Analyze a PowerPoint file"""
    from agents.ai.clients import get_client

    try:
        client, model_name = get_client("claude-3-5-haiku", wrap_with_instructor=False)

        slides_info = ""

        if file_input.content:
            raw_bytes = base64.b64decode(file_input.content)

            try:
                from pptx import Presentation
                from io import BytesIO

                prs = Presentation(BytesIO(raw_bytes))

                slides_info = f"Total slides: {len(prs.slides)}\n\n"

                for i, slide in enumerate(prs.slides[:10]):  # First 10 slides
                    slides_info += f"Slide {i+1}:\n"
                    for shape in slide.shapes:
                        if hasattr(shape, "text") and shape.text.strip():
                            slides_info += f"  - {shape.text[:200]}\n"
                    slides_info += "\n"

            except ImportError:
                slides_info = "PowerPoint file detected but python-pptx not available"
            except Exception as pptx_err:
                slides_info = f"Error reading PowerPoint: {str(pptx_err)}"

        # Analyze with Claude
        messages = [{
            "role": "user",
            "content": f"""Analyze this PowerPoint presentation:

{slides_info}

Provide:
1. **Overview**: Main topic and purpose of the presentation
2. **Structure**: How the presentation is organized
3. **Key Points**: Main takeaways from the slides
4. **Suggestions**: How to improve or adapt this content

{f"Additional context: {context}" if context else ""}"""
        }]

        result = client.messages.create(
            model=model_name,
            messages=messages,
            max_tokens=1500
        )

        analysis_text = result.content[0].text if result.content else "No analysis available"
        summary = analysis_text.split('\n\n')[0][:200] if analysis_text else "Presentation analyzed"

        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="presentation",
            analysis=analysis_text,
            summary=summary,
            suggestions=[
                "Import slides",
                "Extract content for new deck",
                "Use as reference"
            ]
        )

    except Exception as e:
        logger.error(f"Error analyzing presentation {file_input.name}: {e}")
        return FileAnalysisResult(
            file_id=file_input.id,
            filename=file_input.name,
            file_type="presentation",
            analysis=f"Error analyzing presentation: {str(e)}",
            summary="Analysis failed",
            suggestions=[]
        )


async def analyze_files(request: FileAnalysisRequest) -> FileAnalysisResponse:
    """
    Analyze multiple files using Anthropic Claude.
    Routes each file to the appropriate analyzer based on type.
    """
    results = []

    for file_input in request.files:
        mime_type = _get_mime_type(file_input.name, file_input.type)
        context = request.context or ""

        logger.info(f"Analyzing file: {file_input.name} (type: {mime_type})")

        if _is_image(mime_type):
            result = await _analyze_image_with_claude(file_input, context)
        elif _is_spreadsheet(mime_type, file_input.name):
            result = await _analyze_spreadsheet_with_claude(file_input, context)
        elif _is_presentation(mime_type, file_input.name):
            result = await _analyze_presentation_with_claude(file_input, context)
        elif _is_document(mime_type):
            result = await _analyze_document_with_claude(file_input, context)
        else:
            # Generic analysis
            result = FileAnalysisResult(
                file_id=file_input.id,
                filename=file_input.name,
                file_type="unknown",
                analysis=f"File type '{mime_type}' - basic analysis only. This file type may not be fully supported.",
                summary=f"Uploaded: {file_input.name}",
                suggestions=["Try converting to a supported format"]
            )

        results.append(result)

    # Generate combined analysis if multiple files
    combined = ""
    if len(results) > 1:
        combined = f"Analyzed {len(results)} files:\n\n"
        for r in results:
            combined += f"**{r.filename}** ({r.file_type}): {r.summary}\n\n"
    elif results:
        combined = results[0].analysis

    return FileAnalysisResponse(
        success=True,
        results=results,
        combined_analysis=combined,
        message=f"Successfully analyzed {len(results)} file(s)"
    )


@router.post("/analyze", response_model=FileAnalysisResponse)
async def analyze_files_endpoint(request: FileAnalysisRequest):
    """
    Analyze uploaded files using Anthropic Claude.

    Supports:
    - Images: PNG, JPG, GIF, WebP (with vision analysis)
    - Documents: PDF, TXT, MD (text extraction and analysis)
    - Spreadsheets: CSV, XLSX (data analysis and chart recommendations)
    - Presentations: PPTX (slide content extraction)
    """
    try:
        return await analyze_files(request)
    except Exception as e:
        logger.error(f"Error in file analysis endpoint: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chat-with-files")
async def chat_with_files_endpoint(request: Dict[str, Any]):
    """
    Chat endpoint that can understand uploaded files.
    Combines file analysis with conversational AI.
    """
    from agents.ai.clients import get_client

    try:
        files = request.get("files", [])
        message = request.get("message", "")
        chat_history = request.get("chat_history", [])

        # First, analyze any new files
        file_analyses = []
        content_blocks = []

        for file_data in files:
            file_input = FileInput(**file_data)
            mime_type = _get_mime_type(file_input.name, file_input.type)

            if _is_image(mime_type) and file_input.content:
                # Add image directly to message for Claude
                content_blocks.append({
                    "type": "image",
                    "source": {
                        "type": "base64",
                        "media_type": mime_type,
                        "data": file_input.content
                    }
                })
                file_analyses.append(f"[Image: {file_input.name}]")
            else:
                # Analyze other file types and include summary
                analysis_request = FileAnalysisRequest(files=[file_input], context=message)
                analysis_result = await analyze_files(analysis_request)
                if analysis_result.results:
                    file_analyses.append(f"[{file_input.name}]: {analysis_result.results[0].analysis}")

        # Build the user message
        user_message = message
        if file_analyses and not any(_is_image(_get_mime_type(f.get("name", ""), f.get("type", ""))) for f in files):
            user_message = f"{message}\n\nAttached files analysis:\n" + "\n".join(file_analyses)

        # Add user text to content blocks
        content_blocks.append({
            "type": "text",
            "text": user_message or "Please analyze these files."
        })

        # Get Claude client
        client, model_name = get_client("claude-3-5-sonnet", wrap_with_instructor=False)

        # Build messages with history
        messages = []
        for msg in chat_history[-10:]:  # Last 10 messages for context
            messages.append({
                "role": msg.get("role", "user"),
                "content": msg.get("content", "")
            })

        # Add current message with files
        messages.append({
            "role": "user",
            "content": content_blocks
        })

        # Call Claude
        result = client.messages.create(
            model=model_name,
            system="You are a helpful presentation assistant. When analyzing files, provide clear, actionable insights for creating presentations. Be concise but thorough.",
            messages=messages,
            max_tokens=2000
        )

        response_text = result.content[0].text if result.content else "I couldn't analyze the files."

        return {
            "success": True,
            "response": response_text,
            "file_analyses": file_analyses
        }

    except Exception as e:
        logger.error(f"Error in chat-with-files: {e}")
        return {
            "success": False,
            "error": str(e),
            "response": f"Sorry, I encountered an error analyzing your files: {str(e)}"
        }
