"""
API endpoint for outline chat editing functionality.
"""
import logging
from typing import Dict, Any, List, Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from agents.ai.clients import get_client, invoke
from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header
from setup_logging_optimized import get_logger
from models.narrative_flow import NarrativeFlow, NarrativeFlowChanges

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

        # Route through Modal (with built-in local fallback) or run locally
        from agents.config import USE_MODAL
        if USE_MODAL:
            from services.modal_dispatch import edit_outline_via_modal
            result_dict = await edit_outline_via_modal(request.model_dump())
        else:
            from services.outline.outline_editing import edit_outline_core
            result_dict = await edit_outline_core(request)

        # Convert dict result → response models
        updated = OutlineData(**(result_dict.get("updatedOutline") or {}))
        changes = OutlineChanges(
            **(result_dict.get("changes") or {"summary": "Applied outline edits", "modifiedSlides": []})
        )
        updated_narrative_flow = None
        narrative_changes = None
        if result_dict.get("updatedNarrativeFlow"):
            updated_narrative_flow = NarrativeFlow(**result_dict["updatedNarrativeFlow"])
        if result_dict.get("narrativeChanges"):
            narrative_changes = NarrativeFlowChanges(**result_dict["narrativeChanges"])

        # Save narrative flow to deck if applicable
        deck_id = getattr(request, "deck_id", None)
        if deck_id and updated_narrative_flow:
            try:
                from utils.supabase import get_supabase_client
                supabase = get_supabase_client()
                supabase.table("decks").update({
                    "notes": updated_narrative_flow.model_dump()
                }).eq("uuid", deck_id).execute()
            except Exception:
                pass

        return EditOutlineResponse(
            updatedOutline=updated,
            changes=changes,
            updatedNarrativeFlow=updated_narrative_flow,
            narrativeChanges=narrative_changes,
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
