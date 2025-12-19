"""
API endpoint for outline chat editing functionality.
"""
import logging
import re
from typing import Dict, Any, List, Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from agents.ai.clients import get_client, invoke
from agents.config import OUTLINE_CONTENT_MODEL
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header
from setup_logging_optimized import get_logger
from models.narrative_flow import NarrativeFlow, NarrativeFlowChanges
from services.narrative_flow_analyzer import NarrativeFlowAnalyzer
from services.outline.chart_normalization import normalize_slide_chart_fields

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outline", tags=["outline-chat"])


# Request/Response Models
class SlideData(BaseModel):
    """Individual slide data from frontend."""
    id: str
    title: str
    content: str  # Changed from contentBlocks
    slide_type: Optional[str] = "content"
    narrative_role: Optional[str] = "supporting"
    speaker_notes: Optional[str] = ""
    deepResearch: Optional[bool] = False
    taggedMedia: Optional[List[Any]] = Field(default_factory=list)
    # Optional chart fields that may be added during outline edits
    extractedData: Optional[Dict[str, Any]] = None
    manualCharts: Optional[List[Dict[str, Any]]] = None


class OutlineMetadata(BaseModel):
    """Outline metadata."""
    depth: Optional[str] = "standard"
    generation_time: Optional[str] = None
    slide_count: Optional[int] = None


class OutlineData(BaseModel):
    """Complete outline data from frontend."""
    id: str
    title: str
    topic: Optional[str] = None
    tone: Optional[str] = "professional"
    narrative_arc: Optional[str] = "standard"
    slides: List[SlideData]
    metadata: Optional[OutlineMetadata] = None


class OutlineContext(BaseModel):
    """Context information for outline editing."""
    initialIdea: Optional[str] = None
    vibeContext: Optional[str] = None
    font: Optional[str] = None
    colors: Optional[Dict[str, Any]] = None


class EditOutlineRequest(BaseModel):
    """Request to edit an outline via chat - matches frontend format."""
    message: str = Field(..., description="User's chat message with edit instructions")
    outline: OutlineData = Field(..., description="Current outline to edit")
    target_slide_index: Optional[int] = Field(None, description="Index of specific slide to edit (underscore format)")  # Changed from targetSlideIndex
    context: Optional[OutlineContext] = None  # Made optional since frontend might not send it
    chatHistory: Optional[List[Dict[str, Any]]] = Field(default=None, description="Optional prior messages (role/content) to provide context like original request")


class OutlineChanges(BaseModel):
    """Summary of changes made to the outline."""
    summary: str
    modifiedSlides: List[str]  # List of slide IDs that were modified


class EditOutlineResponse(BaseModel):
    """Response after editing an outline."""
    updatedOutline: OutlineData
    changes: OutlineChanges
    updatedNarrativeFlow: Optional[NarrativeFlow] = None  # Only included if narrative changes
    narrativeChanges: Optional[NarrativeFlowChanges] = None  # Track what changed


@router.post("/edit")
async def edit_outline_chat(
    request: EditOutlineRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Edit an outline based on user's chat message.
    Uses AI to intelligently apply the requested changes.
    """
    try:
        # Optional: Get authenticated user (can work without auth too)
        user = None
        if token:
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
        
        logger.info(f"Outline chat edit request: {request.message[:100]}...")
        
        # Build context for AI
        context_prompt = _build_context_prompt(request)
        
        # Create the AI prompt
        system_prompt = """You are an expert presentation outline editor. Your job is to modify presentation outlines based on user requests while maintaining quality and coherence.

When editing outlines:
1. Make specific changes requested by the user
2. Maintain consistency in tone and style
3. Preserve the overall flow and structure unless asked to change it
4. Keep content concise and impactful
5. Ensure each slide has a clear purpose
6. IMPORTANT: Apply edits to the ORIGINAL content. Do not rewrite slides from scratch when the user asks to "make more detailed", "remove this", or "change this" — modify the existing content in place.

CRITICAL RULE: When instructed to edit a specific slide number, you MUST:
- ONLY modify the specified slide
- Keep ALL other slides EXACTLY as they are
- Do NOT make any changes to slides that are not targeted
- Return ALL slides in the outline (both modified and unmodified)

You must respond with a valid JSON object containing:
- updatedOutline: The modified outline with all slides (including ALL original fields)
- changes: Summary of what was changed

The updatedOutline must include ALL slides from the original outline, not just the modified ones.
Each slide MUST have ALL these fields:
- id: string (use the original slide ID)
- title: string
- content: string (formatted with bullet points or paragraphs)
- slide_type: string (preserve original or use "content")
- narrative_role: string (preserve original or use "supporting")
- speaker_notes: string (preserve original or use empty string)
- deepResearch: boolean (preserve original or false)
- taggedMedia: array (preserve original or empty array)
Optional (when adding charts):
- extractedData: object with keys { source, chartType, title, data, metadata }

The outline must also include:
- id: string (MUST preserve the original outline ID from the input - DO NOT use example IDs)
- title: string
- topic: string (preserve original)
- tone: string (preserve original)
- narrative_arc: string (preserve original)
- metadata: object (preserve original)

Example response format (NOTE: this is just an example - use the actual IDs from the input):
{
  "updatedOutline": {
    "id": "outline-1234567890",  // <-- This is an EXAMPLE - use the actual ID from input
    "title": "Presentation Title",
    "topic": "Topic",
    "tone": "professional",
    "narrative_arc": "standard",
    "slides": [
      {
        "id": "slide-0",
        "title": "Updated Slide Title",
        "content": "• Point 1\\n• Point 2\\n• Point 3",
        "slide_type": "content",
        "narrative_role": "supporting",
        "speaker_notes": "",
        "deepResearch": false,
        "taggedMedia": []
      }
    ],
    "metadata": {
      "depth": "standard",
      "generation_time": "2024-01-09T12:34:56.789Z",
      "slide_count": 1
    }
  },
  "changes": {
    "summary": "Made the content more concise",
    "modifiedSlides": ["slide-0"]
  }
}

Important: Return ONLY the JSON response, no additional text.

ADDITIONAL CHART RULES:
When the user requests a chart (keywords: chart, graph, visualize, visualization), you MUST add an 'extractedData' object to the relevant slide(s) with this exact shape:

extractedData: {
  "source": "outline_edit",
  "chartType": "bar" | "column" | "pie" | "line" | "area" | "waterfall" | "radar" | "treemap" | "sankey" | "gauge",
  "title": "Descriptive chart title",
  "data": [ { "name": string, "value": number }, ... ],
  "metadata": {}
}

DATA REQUIREMENTS:
- Use REAL numeric values extracted from the slide's existing content when possible (percentages, counts, currency, etc.).
- NEVER use placeholders like "Category A" or 0 values.
- Keep one consistent unit of measure across all points; if using percentages, they MUST sum to 100 (adjust last value if needed).
- 5-12 data points preferred where appropriate; labels must be contextual (non-generic).
- If the content has no comparable metrics to visualize, omit extractedData rather than inventing arbitrary data.
"""

        # Build a compact chat history block to provide original message context
        history_lines: List[str] = []
        try:
            if request.chatHistory:
                for msg in request.chatHistory[-6:]:
                    role = (msg.get('role') or '').lower()
                    text = (msg.get('content') or '').strip()
                    if role in ("user", "assistant") and text:
                        history_lines.append(f"[{role}] {text}")
        except Exception:
            pass
        chat_history_block = ("\n\nChat history (most recent last):\n" + "\n".join(history_lines)) if history_lines else ""

        user_prompt = f"""Current outline:
{_format_outline_for_prompt(request.outline)}

User request: "{request.message}"
{chat_history_block}

{context_prompt}

{"=" * 80}
CRITICAL INSTRUCTION - TARGET SLIDE ENFORCEMENT:
{f'''You are ONLY allowed to edit Slide {request.target_slide_index + 1} (index {request.target_slide_index}).
- DO NOT modify ANY other slide
- Return ALL slides in their ORIGINAL form except Slide {request.target_slide_index + 1}
- Even if the request sounds global (e.g., "make all bullet points concise"), apply it ONLY to Slide {request.target_slide_index + 1}
- Ignore the word "all" if a specific slide is targeted
- This is MANDATORY - edits to other slides will be rejected''' if request.target_slide_index is not None else "Edit any relevant slides as needed based on the user's request."}
{"=" * 80}

Target slide: {f"Slide {request.target_slide_index + 1} ONLY - NO EXCEPTIONS" if request.target_slide_index is not None else "Any relevant slides"}

Please apply the requested changes and return the updated outline with ALL slides (both modified and unmodified)."""

        # Tool-powered outline editing
        from pydantic import create_model
        from typing import Union
        from models.tools import get_tools_descriptions
        from agents.outline.tools import (
            UpdateSlideContentArgs, update_slide_content,
            AddSlideArgs, add_slide,
            RemoveSlideArgs, remove_slide_outline,
            MoveSlideArgs, move_slide_outline,
            ResearchSlideArgs, research_slide_outline,
            FirecrawlOutlineArgs, firecrawl_outline_fetch,
            DeepExtractArgs, deep_extract,
        )

        tools = [
            UpdateSlideContentArgs,
            AddSlideArgs,
            RemoveSlideArgs,
            MoveSlideArgs,
            ResearchSlideArgs,
            FirecrawlOutlineArgs,
            DeepExtractArgs,
        ]

        descriptions = get_tools_descriptions(tools)
        ToolCall = create_model(
            "OutlineToolCall",
            tool=(Union[tuple(tools)], Field(description="The tool call for outline editing")),
            summary=(str, Field(description="What this tool call does"))
        )
        ToolPlan = create_model(
            "OutlineToolPlan",
            tool_calls=(List[ToolCall], Field(description="List of tool calls to apply"))
        )

        tool_system = f"""You are an outline editor. Choose tool calls to modify the outline based on the user's message.\n\nAvailable tools:\n{descriptions}\n\nRules:\n- Keep edits minimal and targeted\n- Maintain all required slide fields\n- When research or external data/images are requested, prefer firecrawl_outline_fetch for quick single-page grabs\n- When the user requests deep, multi-page, or site-specific extraction, use deep_extract\n- When research is requested, you may also use research_slide_outline to add supporting bullets or chart data\n- If the user asks to add/remove/reorder slides, pick the appropriate tool\n- If the user asks to change a specific slide, prefer update_slide_content\n"""

        client, model_name = get_client(OUTLINE_CONTENT_MODEL)
        try:
            plan = invoke(
                client=client,
                model=model_name,
                max_tokens=2000,
                response_model=ToolPlan,
                messages=[
                    {"role": "system", "content": tool_system},
                    {"role": "user", "content": user_prompt},
                ],
            )
        except Exception as typed_err:
            # Perplexity often returns unstructured text for typed prompts. Fallback to Claude for tool planning.
            logger.warning(f"Typed tool plan generation failed on {model_name}: {typed_err}. Falling back to Claude.")
            try:
                from agents.config import OUTLINE_AGENT_MODEL
                claude_client, claude_model = get_client(OUTLINE_AGENT_MODEL)
                plan = invoke(
                    client=claude_client,
                    model=claude_model,
                    max_tokens=1500,
                    response_model=ToolPlan,
                    messages=[
                        {"role": "system", "content": tool_system},
                        {"role": "user", "content": user_prompt},
                    ],
                )
            except Exception as claude_err:
                # Final fallback: request JSON plan freeform and parse manually
                logger.warning(f"Claude fallback for tool planning also failed: {claude_err}. Using freeform JSON fallback.")
                try:
                    freeform_system = tool_system + "\nReturn ONLY a valid JSON object matching the OutlineToolPlan schema."
                    response = await _invoke_ai_with_retry(
                        client,
                        model_name,
                        freeform_system,
                        user_prompt,
                        max_retries=2
                    )
                    parsed = _parse_ai_response(response)
                    # Try to coerce into ToolPlan model if possible
                    plan = ToolPlan(**parsed)
                except Exception as last_err:
                    logger.error(f"All tool planning strategies failed: {last_err}")
                    raise

            updated_outline_dict = request.outline.model_dump() if hasattr(request.outline, 'model_dump') else dict(request.outline)
            applied_summaries: List[str] = []
            for call in getattr(plan, 'tool_calls', []) or []:
                tool = getattr(call, 'tool', None)
                if not tool:
                    continue
                tname = getattr(tool, 'tool_name', '')
                try:
                    if tname == 'update_slide_content':
                        updated_outline_dict, s = update_slide_content(tool, updated_outline_dict)
                    elif tname == 'add_slide':
                        updated_outline_dict, s = add_slide(tool, updated_outline_dict)
                    elif tname == 'remove_slide_outline':
                        updated_outline_dict, s = remove_slide_outline(tool, updated_outline_dict)
                    elif tname == 'move_slide_outline':
                        updated_outline_dict, s = move_slide_outline(tool, updated_outline_dict)
                    elif tname == 'research_slide_outline':
                        updated_outline_dict, s = research_slide_outline(tool, updated_outline_dict)
                    elif tname == 'firecrawl_outline_fetch':
                        updated_outline_dict, s = firecrawl_outline_fetch(tool, updated_outline_dict)
                    elif tname == 'deep_extract':
                        updated_outline_dict, s = deep_extract(tool, updated_outline_dict)
                    else:
                        s = f"Skipped unknown tool {tname}"
                    applied_summaries.append(getattr(call, 'summary', None) or s)
                except Exception as _:
                    applied_summaries.append(f"Failed {tname}")

            # Normalize and return in the existing response shape
            # Ensure required outline fields are present using the original as fallback
            def _ensure_outline_shape(updated: Dict[str, Any], original_model) -> OutlineData:
                try:
                    merged = dict(updated or {})
                    # Preserve original outline id and metadata fields when missing
                    if hasattr(original_model, 'model_dump'):
                        original = original_model.model_dump()
                    else:
                        original = dict(original_model)
                    merged.setdefault('id', original.get('id'))
                    merged.setdefault('title', original.get('title'))
                    merged.setdefault('topic', original.get('topic'))
                    merged.setdefault('tone', original.get('tone'))
                    merged.setdefault('narrative_arc', original.get('narrative_arc'))
                    merged.setdefault('metadata', original.get('metadata') or {})
                    # Ensure slides exist and normalize chart fields
                    if not isinstance(merged.get('slides'), list):
                        merged['slides'] = original.get('slides') or []
                    normalized_slides: List[Any] = []
                    for slide in merged.get('slides', []):
                        slide_dict = (
                            slide.model_dump() if hasattr(slide, 'model_dump')
                            else slide.dict() if hasattr(slide, 'dict')
                            else slide
                        )
                        if isinstance(slide_dict, dict):
                            normalize_slide_chart_fields(slide_dict)
                        normalized_slides.append(slide_dict)
                    merged['slides'] = normalized_slides
                    return OutlineData(**merged)
                except Exception:
                    return OutlineData(**(original_model.model_dump() if hasattr(original_model, 'model_dump') else dict(original_model)))

            updated = _ensure_outline_shape(updated_outline_dict, request.outline)
            changes = OutlineChanges(
                summary="; ".join(applied_summaries) or "Applied outline edits",
                modifiedSlides=[]
            )

            updated_narrative_flow = None
            narrative_changes = None
            try:
                flow_analyzer = NarrativeFlowAnalyzer()
                original_outline_dict = (
                    request.outline.model_dump() if hasattr(request.outline, 'model_dump') else dict(request.outline)
                )
                updated_outline_dict = updated.model_dump() if hasattr(updated, 'model_dump') else dict(updated)
                needs_update, flow_adjustments = await flow_analyzer.detect_narrative_changes(
                    original_outline_dict,
                    updated_outline_dict
                )
                if needs_update:
                    updated_narrative_flow = await flow_analyzer.analyze_narrative_flow(
                        updated_outline_dict,
                        context=request.message
                    )
                    impact = "high" if len(flow_adjustments) >= 3 else "medium" if len(flow_adjustments) >= 2 else "low"
                    narrative_changes = NarrativeFlowChanges(
                        narrative_impact=impact,
                        flow_adjustments=flow_adjustments
                    )
                    logger.info(f"Narrative flow updated with {impact} impact: {flow_adjustments}")

                    deck_id = getattr(request, "deck_id", None)
                    if deck_id:
                        try:
                            from utils.supabase import get_supabase_client
                            supabase = get_supabase_client()
                            supabase.table("decks").update({
                                "notes": updated_narrative_flow.model_dump()
                            }).eq("uuid", deck_id).execute()
                            logger.info(f"Updated deck {deck_id} with new narrative flow notes")
                        except Exception as save_error:
                            logger.warning(f"Failed to save narrative flow to deck: {save_error}")
                else:
                    logger.info("No narrative flow update needed for these changes")
            except Exception as e:
                logger.warning(f"Failed to analyze narrative flow changes: {e}")

            return EditOutlineResponse(
                updatedOutline=updated,
                changes=changes,
                updatedNarrativeFlow=updated_narrative_flow,
                narrativeChanges=narrative_changes
            )
            
        except Exception as e:
            logger.error(f"AI processing error: {str(e)}")
            raise HTTPException(
                status_code=500,
                detail=f"Failed to process outline edit: {str(e)}"
            )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing outline: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to edit outline")


def _build_context_prompt(request: EditOutlineRequest) -> str:
    """Build context information for the AI prompt."""
    context_parts = []
    
    # Include outline metadata
    if request.outline.topic:
        context_parts.append(f"Topic: {request.outline.topic}")
    if request.outline.tone:
        context_parts.append(f"Tone: {request.outline.tone}")
    if request.outline.narrative_arc:
        context_parts.append(f"Narrative arc: {request.outline.narrative_arc}")
    
    # Include additional context if provided
    if request.context:
        if request.context.initialIdea:
            context_parts.append(f"Initial idea: {request.context.initialIdea}")
        
        if request.context.vibeContext:
            context_parts.append(f"Vibe/Style: {request.context.vibeContext}")
        
        if request.context.font:
            context_parts.append(f"Font preference: {request.context.font}")
        
        if request.context.colors:
            context_parts.append(f"Color scheme: {request.context.colors}")
    
    return "\n".join(context_parts) if context_parts else "No additional context provided"


def _format_outline_for_prompt(outline: OutlineData) -> str:
    """Format the outline in a readable way for the AI."""
    lines = [f"Title: {outline.title}"]
    if outline.topic:
        lines.append(f"Topic: {outline.topic}")
    lines.append("")
    
    for i, slide in enumerate(outline.slides):
        lines.append(f"Slide {i + 1} (ID: {slide.id}): {slide.title}")
        # Handle content as a string with bullet points
        if slide.content:
            # Split by newlines and format each line
            content_lines = slide.content.split('\n')
            for line in content_lines:
                if line.strip():
                    lines.append(f"  {line}")
        if slide.speaker_notes and slide.speaker_notes.strip():
            lines.append(f"  Speaker notes: {slide.speaker_notes}")
        lines.append("")
    
    return "\n".join(lines)


async def _invoke_ai_with_retry(
    client,
    model_name: str,
    system_prompt: str,
    user_prompt: str,
    max_retries: int = 3
) -> str:
    """Invoke AI with retry logic."""
    import asyncio
    
    for attempt in range(max_retries):
        try:
            # Create messages
            messages = [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt}
            ]
            
            # Run in executor to avoid blocking
            loop = asyncio.get_event_loop()
            response = await loop.run_in_executor(
                None,
                lambda: invoke(
                    client,
                    model_name,
                    messages,
                    response_model=None,  # We want raw text for JSON parsing
                    max_tokens=4000,
                    temperature=0.7
                )
            )
            
            return response
            
        except Exception as e:
            if attempt < max_retries - 1:
                logger.warning(f"AI invocation attempt {attempt + 1} failed: {str(e)}")
                await asyncio.sleep(2 ** attempt)  # Exponential backoff
            else:
                raise


def _parse_ai_response(response: str) -> Dict[str, Any]:
    """Parse the AI response to extract JSON data."""
    import json
    import re
    
    # Try to extract JSON from the response
    # Sometimes AI wraps it in markdown code blocks
    json_match = re.search(r'```(?:json)?\s*(\{.*?\})\s*```', response, re.DOTALL)
    if json_match:
        json_str = json_match.group(1)
    else:
        # Try to find raw JSON
        json_match = re.search(r'(\{.*\})', response, re.DOTALL)
        if json_match:
            json_str = json_match.group(1)
        else:
            # Last resort - assume entire response is JSON
            json_str = response.strip()
    
    try:
        return json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.error(f"Failed to parse AI response as JSON: {e}")
        logger.error(f"Response was: {response[:500]}...")
        
        # Try to extract key parts manually as fallback
        # This is a basic fallback - in production you'd want more robust parsing
        raise ValueError("Invalid JSON response from AI") 
