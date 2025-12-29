"""API endpoint for generating personalized follow-up messages after deck generation."""

import logging
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel
from typing import List, Optional, Dict, Any

from agents.ai.clients import get_client, invoke

logger = logging.getLogger(__name__)

router = APIRouter()

class SlideInfo(BaseModel):
    """Minimal slide info for analysis."""
    title: Optional[str] = None
    type: Optional[str] = None  # e.g., "title", "content", "team", "chart", "quote"
    has_images: bool = False
    has_chart: bool = False
    element_count: int = 0

class FollowUpRequest(BaseModel):
    """Request body for follow-up message generation."""
    slides: List[SlideInfo]
    deck_title: Optional[str] = None
    topic: Optional[str] = None

class FollowUpResponse(BaseModel):
    """Response with personalized follow-up message."""
    message: str

SYSTEM_PROMPT = """You are a friendly, helpful presentation assistant. The user just finished generating a presentation and you want to help them make it perfect.

Based on the slides in their presentation, write a SHORT (2-3 sentences max) personalized follow-up message that:
1. Acknowledges their presentation is ready in a warm, friendly way
2. Suggests ONE specific, actionable improvement based on what you see in their slides

Focus on common areas that often need human input:
- Team slides: often need real team member names, photos, or roles
- Logo/branding: might need company logos added
- Data/charts: might need real numbers or data
- Images: might benefit from custom images or screenshots
- Contact info: often needs real contact details

Be specific to THEIR presentation. Don't be generic.

Examples of good suggestions:
- "Your team slide could really shine with actual team photos - want me to help you add them?"
- "I noticed you have a data slide - shall I update it with your real numbers?"
- "The intro looks great! Want to add your company logo to make it yours?"

Keep it conversational and helpful, not salesy. One short paragraph only."""

@router.post("/generate-followup", response_model=FollowUpResponse)
async def generate_followup_message(request: FollowUpRequest):
    """Generate a personalized follow-up message based on the deck slides."""
    try:
        # Build a description of the slides for the AI
        slide_descriptions = []
        for i, slide in enumerate(request.slides):
            desc_parts = [f"Slide {i+1}"]
            if slide.title:
                desc_parts.append(f'"{slide.title}"')
            if slide.type:
                desc_parts.append(f"(type: {slide.type})")
            features = []
            if slide.has_images:
                features.append("has images")
            if slide.has_chart:
                features.append("has chart/data")
            if features:
                desc_parts.append(f"[{', '.join(features)}]")
            slide_descriptions.append(" ".join(desc_parts))

        slides_summary = "\n".join(slide_descriptions) if slide_descriptions else "No slide details available"

        user_prompt = f"""The user just generated a presentation{f' about "{request.topic}"' if request.topic else ''}{f' titled "{request.deck_title}"' if request.deck_title else ''}.

Here are the slides:
{slides_summary}

Write a short, friendly follow-up message suggesting how you can help them improve it. Focus on ONE specific thing based on what you see."""

        # Use Gemini Flash for fast generation
        client, model = get_client("gemini-2.5-flash")

        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": user_prompt}
        ]

        response = invoke(
            client=client,
            model=model,
            messages=messages,
            max_tokens=256,
            temperature=0.8
        )

        message = response.strip() if isinstance(response, str) else str(response).strip()

        # Fallback if empty
        if not message:
            message = "Your presentation is ready! I can help you refine any slide - just let me know what you'd like to tweak."

        return FollowUpResponse(message=message)

    except Exception as e:
        logger.error(f"Error generating follow-up message: {e}")
        # Return a friendly fallback instead of failing
        return FollowUpResponse(
            message="Your presentation is ready! I can refine, redesign, or fix anything here. Try: 'Make this cleaner,' 'Redesign this slide,' or 'Add a chart from this data.'"
        )
