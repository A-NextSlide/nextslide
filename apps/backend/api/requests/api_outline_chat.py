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
    chart_data: Optional[Dict[str, Any]] = None


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
        )

        tools = [
            UpdateSlideContentArgs,
            AddSlideArgs,
            RemoveSlideArgs,
            MoveSlideArgs,
            ResearchSlideArgs,
            FirecrawlOutlineArgs,
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

        tool_system = f"""You are an outline editor. Choose tool calls to modify the outline based on the user's message.\n\nAvailable tools:\n{descriptions}\n\nRules:\n- Keep edits minimal and targeted\n- Maintain all required slide fields\n- When research or external data/images are requested, prefer firecrawl_outline_fetch\n- When research is requested, you may also use research_slide_outline to add supporting bullets or chart data\n- If the user asks to add/remove/reorder slides, pick the appropriate tool\n- If the user asks to change a specific slide, prefer update_slide_content\n"""

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
                claude_client, claude_model = get_client("claude-3-7-sonnet")
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
                    # Ensure slides exist
                    if not isinstance(merged.get('slides'), list):
                        merged['slides'] = original.get('slides') or []
                    return OutlineData(**merged)
                except Exception:
                    return OutlineData(**(original_model.model_dump() if hasattr(original_model, 'model_dump') else dict(original_model)))

            updated = _ensure_outline_shape(updated_outline_dict, request.outline)
            changes = OutlineChanges(
                summary="; ".join(applied_summaries) or "Applied outline edits",
                modifiedSlides=[]
            )
            return EditOutlineResponse(
                updatedOutline=updated,
                changes=changes,
                updatedNarrativeFlow=None,
                narrativeChanges=None
            )
            
            # Log the raw response for debugging
            logger.info(f"AI raw response: {response[:500]}...")
            
            # Parse the response
            updated_data = _parse_ai_response(response)

            # Normalize potential AI fields (e.g., chartData -> extractedData)
            try:
                if isinstance(updated_data, dict) and 'updatedOutline' in updated_data:
                    uo = updated_data['updatedOutline']
                    if isinstance(uo, dict) and 'slides' in uo and isinstance(uo['slides'], list):
                        for s in uo['slides']:
                            if not isinstance(s, dict):
                                continue
                            # Promote chartData to extractedData if present
                            if 'chartData' in s and s['chartData']:
                                cd = s.get('chartData') or {}
                                transformed = []
                                for item in (cd.get('data') or []):
                                    if isinstance(item, dict):
                                        if 'id' in item and 'value' in item:
                                            transformed.append({
                                                'label': item.get('id'),
                                                'value': item.get('value')
                                            })
                                        elif 'label' in item and 'value' in item:
                                            transformed.append({
                                                'label': item.get('label'),
                                                'value': item.get('value')
                                            })
                                        elif 'name' in item and 'value' in item:
                                            transformed.append({
                                                'label': item.get('name'),
                                                'value': item.get('value')
                                            })
                                s['extractedData'] = {
                                    'source': 'outline_edit_ai',
                                    'chartType': cd.get('chart_type') or cd.get('chartType') or 'bar',
                                    'data': transformed,
                                    'title': cd.get('title') or s.get('title'),
                                    'metadata': cd.get('metadata') or {}
                                }
                                # Also keep a normalized snake_case for downstream if needed
                                s['chart_data'] = {
                                    'chart_type': s['extractedData']['chartType'],
                                    'data': [{ 'name': d.get('label'), 'value': d.get('value') } for d in s['extractedData']['data'] if isinstance(d, dict)],
                                    'title': s['extractedData']['title'],
                                    'metadata': s['extractedData']['metadata']
                                }
                                # Remove original chartData to avoid confusion
                                del s['chartData']
            except Exception as _norm_e:
                logger.warning(f"Failed to normalize chartData to extractedData: {_norm_e}")
            
            # Log parsed data structure
            logger.info(f"Parsed data keys: {list(updated_data.keys())}")
            if 'updatedOutline' in updated_data:
                outline_keys = list(updated_data['updatedOutline'].keys())
                logger.info(f"Updated outline keys: {outline_keys}")
                if 'slides' in updated_data['updatedOutline'] and updated_data['updatedOutline']['slides']:
                    first_slide = updated_data['updatedOutline']['slides'][0]
                    logger.info(f"First slide keys: {list(first_slide.keys())}")
            
            # Validate the response has required fields
            if 'updatedOutline' not in updated_data or 'changes' not in updated_data:
                raise ValueError("AI response missing required fields")
            
            # Convert to response models
            updated_outline = OutlineData(**updated_data['updatedOutline'])
            changes = OutlineChanges(**updated_data['changes'])
            
            # IMPORTANT: Preserve the original outline ID - AI returns example IDs
            updated_outline.id = request.outline.id
            logger.info(f"Preserved original outline ID: {updated_outline.id}")
            
            # Log the changes
            logger.info(f"Outline edited successfully: {changes.summary}")

            # If the user asked for a chart but the AI did not include one, try to create
            # an extractedData object from the ORIGINAL slide content as a fallback.
            try:
                if _is_chart_request(request.message):
                    # Build index map for slide ids
                    id_to_index = {s.id: idx for idx, s in enumerate(updated_outline.slides)}
                    candidate_indexes: List[int] = []
                    if request.target_slide_index is not None:
                        candidate_indexes.append(int(request.target_slide_index))
                    elif changes and getattr(changes, 'modifiedSlides', None):
                        for sid in changes.modifiedSlides:
                            if sid in id_to_index:
                                candidate_indexes.append(id_to_index[sid])
                    # Fallback: if nothing identified, use first slide
                    if not candidate_indexes and updated_outline.slides:
                        candidate_indexes.append(0)

                    for idx in candidate_indexes:
                        if idx < 0 or idx >= len(updated_outline.slides):
                            continue
                        slide_obj = updated_outline.slides[idx]
                        already_has_chart = bool(getattr(slide_obj, 'extractedData', None) or getattr(slide_obj, 'chart_data', None))
                        if already_has_chart:
                            continue
                        candidate = _extract_chart_extractedData_from_content(slide_obj.content or "", slide_obj.title or "")
                        if candidate:
                            # Attach as extractedData to slide
                            slide_obj.extractedData = candidate
                            logger.info(f"Added extractedData to slide '{slide_obj.title}' based on original content")
            except Exception as _chart_e:
                logger.warning(f"Chart fallback generation failed: {_chart_e}")
            
            # Check if narrative flow needs updating
            updated_narrative_flow = None
            narrative_changes = None
            
            try:
                flow_analyzer = NarrativeFlowAnalyzer()
                
                # Detect if changes warrant narrative update
                original_outline_dict = request.outline.model_dump()
                updated_outline_dict = updated_outline.model_dump()
                
                needs_update, flow_adjustments = await flow_analyzer.detect_narrative_changes(
                    original_outline_dict,
                    updated_outline_dict
                )
                
                if needs_update:
                    # Analyze the new narrative flow
                    updated_narrative_flow = await flow_analyzer.analyze_narrative_flow(
                        updated_outline_dict,
                        context=request.message  # Use the edit message as context
                    )
                    
                    # Determine impact level
                    impact = "high" if len(flow_adjustments) >= 3 else "medium" if len(flow_adjustments) >= 2 else "low"
                    
                    narrative_changes = NarrativeFlowChanges(
                        narrative_impact=impact,
                        flow_adjustments=flow_adjustments
                    )
                    
                    logger.info(f"Narrative flow updated with {impact} impact: {flow_adjustments}")
                    
                    # Save updated narrative flow to deck if we have a deck_id
                    if hasattr(request, 'deck_id') and request.deck_id:
                        try:
                            from utils.supabase import get_supabase_client
                            supabase = get_supabase_client()
                            
                            # Update deck with new narrative flow notes
                            update_result = supabase.table("decks").update({
                                "notes": updated_narrative_flow.model_dump()
                            }).eq("uuid", request.deck_id).execute()
                            
                            if update_result.data:
                                logger.info(f"Updated deck {request.deck_id} with new narrative flow notes")
                        except Exception as save_error:
                            logger.warning(f"Failed to save narrative flow to deck: {save_error}")
                else:
                    logger.info("No narrative flow update needed for these changes")
                    
            except Exception as e:
                logger.warning(f"Failed to analyze narrative flow changes: {e}")
                # Continue without narrative flow updates
            
            return EditOutlineResponse(
                updatedOutline=updated_outline,
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


def _is_chart_request(message: str) -> bool:
    """Heuristic to detect if the user is asking to add a chart."""
    if not message:
        return False
    text = message.lower()
    keywords = [
        "add a chart", "add chart", "insert chart", "chart", "graph",
        "visualize", "visualization", "make a chart", "include a chart"
    ]
    return any(k in text for k in keywords)


def _extract_chart_extractedData_from_content(content: str, slide_title: str) -> Optional[Dict[str, Any]]:
    """Parse the slide content to build an extractedData payload if possible.

    Looks for lines containing a label and a numeric value, e.g.:
    - "North America: 4.5M"
    - "Online - 62%"
    - "Q1 2024: $1,200,000"
    Returns None if insufficient comparable series is found.
    """
    if not content:
        return None

    lines = [l.strip() for l in content.split("\n") if l.strip()]
    data_points: List[Dict[str, Any]] = []
    percent_points = []

    # Regex patterns for label:value pairs with optional units/symbols
    # Examples captured:
    #  - Label: 1,234 or $1,234 or 45% or 1.2M
    #  - Label - 1,234
    #  - Label (45%)
    pair_pattern = re.compile(r"^[-•*\d\.)\s]*([A-Za-z0-9][^:–—\-\(]{0,100}?)\s*[:\-–—]\s*\$?([\d,\.]+)\s*%?\s*$")
    paren_pct_pattern = re.compile(r"^[-•*\d\.)\s]*([^\(]{1,100}?)\s*\(\s*([\d,\.]+)\s*%\s*\)\s*$")
    # Also capture trailing percentage after text, e.g., "Online sales 62%"
    trailing_pct_pattern = re.compile(r"^[-•*\d\.)\s]*([^\d]{1,100}?)\s+([\d,\.]+)\s*%\s*$")

    def _to_number(s: str) -> Optional[float]:
        try:
            clean = s.replace(",", "").replace("$", "")
            # Handle shorthand like 1.2M or 3.4k
            match = re.match(r"^([\d\.]+)\s*([kKmMbB])?$", clean)
            if match:
                val = float(match.group(1))
                suffix = match.group(2)
                if suffix:
                    if suffix.lower() == 'k':
                        val *= 1_000
                    elif suffix.lower() == 'm':
                        val *= 1_000_000
                    elif suffix.lower() == 'b':
                        val *= 1_000_000_000
                return float(val)
            return float(clean)
        except Exception:
            return None

    for line in lines:
        m = pair_pattern.match(line)
        if m:
            label = m.group(1).strip()
            val = _to_number(m.group(2))
            if label and val is not None:
                data_points.append({"label": label, "value": val})
                continue
        m = paren_pct_pattern.match(line)
        if m:
            label = m.group(1).strip()
            val = _to_number(m.group(2))
            if label and val is not None:
                data_points.append({"label": label, "value": val})
                percent_points.append(val)
                continue
        m = trailing_pct_pattern.match(line)
        if m:
            label = m.group(1).strip()
            val = _to_number(m.group(2))
            if label and val is not None:
                data_points.append({"label": label, "value": val})
                percent_points.append(val)

    # Require minimum 3 points for a meaningful chart
    if len(data_points) < 3:
        return None

    # Decide chartType: if mostly percentages -> pie, else column
    pct_sum = sum(percent_points) if percent_points else 0.0
    chart_type = "pie" if percent_points and len(percent_points) >= len(data_points) * 0.6 and 90 <= pct_sum <= 110 else "column"

    # If pie, normalize to 100
    if chart_type == "pie":
        total = sum(p['value'] for p in data_points)
        if total > 0:
            # Scale values to sum to 100 and round to 1 decimal (adjust last to fix rounding)
            scaled = []
            running = 0.0
            for i, p in enumerate(data_points):
                if i < len(data_points) - 1:
                    v = round(p['value'] * 100.0 / total, 1)
                    running += v
                    scaled.append({"label": p['label'], "value": v})
                else:
                    scaled.append({"label": p['label'], "value": round(100.0 - running, 1)})
            data_points = scaled

    # Limit to a reasonable number of points
    data_points = data_points[:12]

    return {
        "source": "outline_edit",
        "chartType": chart_type,
        "title": f"{slide_title} {('Distribution' if chart_type == 'pie' else 'Comparison')}",
        "data": data_points,
        "metadata": {}
    }