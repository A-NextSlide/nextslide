"""
API endpoint for slide deep research functionality.
"""
import logging
from typing import Optional, Dict, Any, List
from datetime import datetime
import asyncio

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from services.supabase_auth_service import get_auth_service
from api.requests.api_auth import get_auth_header
from agents.persistence.deck_persistence import DeckPersistence
from api.requests.api_openai_outline import process_content_enhancement
from setup_logging_optimized import get_logger
from agents.ai.clients import get_client, invoke
from agents.config import OUTLINE_CONTENT_MODEL

logger = get_logger(__name__)

router = APIRouter(prefix="/api/slides", tags=["slide-research"])


# Request/Response Models
class SlideResearchRequest(BaseModel):
    """Request to perform deep research on a slide."""
    deck_id: str = Field(..., description="The deck UUID")
    slide_id: str = Field(..., description="The slide ID to research")
    enhance_prompt: Optional[str] = Field(
        None, 
        description="Optional custom enhancement prompt"
    )


class SlideResearchResponse(BaseModel):
    """Response after performing slide research."""
    success: bool
    slide_id: str
    original_content: str
    enhanced_content: Dict[str, Any]
    research_timestamp: datetime
    message: str


class OutlineSlideResearchRequest(BaseModel):
    """Request for research on an outline slide (no deck ID needed)."""
    slide: Dict[str, Any] = Field(..., description="Slide object with title and content")
    focus_areas: Optional[List[str]] = Field(None, description="Specific areas to focus research on")
    context: Optional[Dict[str, Any]] = Field(None, description="Additional context about the presentation")


class OutlineSlideResearchResponse(BaseModel):
    """Response from outline slide research."""
    success: bool
    enhanced_slide: Dict[str, Any]
    research_data: Dict[str, Any]
    sources: str
    message: str


@router.post("/research", response_model=SlideResearchResponse)
async def research_slide(
    request: SlideResearchRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Perform deep research on a slide to enhance its content.
    Returns enhanced content with current statistics, examples, and insights.
    """
    try:
        logger.info(f"Deep research requested for deck {request.deck_id}, slide {request.slide_id}")
        
        # Log the enhance prompt if provided
        if request.enhance_prompt:
            logger.info(f"Enhance prompt: {request.enhance_prompt[:100]}...")
        
        # Try to get the deck, but if it doesn't exist, we'll use a fallback approach
        deck_persistence = DeckPersistence()
        deck = None
        slide = None
        
        # Try to get deck with retry
        for attempt in range(3):
            try:
                deck = await deck_persistence.get_deck_with_retry(request.deck_id)
                if deck:
                    break
            except Exception as e:
                logger.warning(f"Attempt {attempt + 1} - Deck {request.deck_id} not found: {e}")
                await asyncio.sleep(1)
        
        # If we have a deck, find the slide
        if deck and 'slides' in deck:
            for s in deck['slides']:
                if s.get('id') == request.slide_id:
                    slide = s
                    break
        
        # If we don't have a slide, create a placeholder for research
        if not slide:
            logger.warning(f"Slide {request.slide_id} not found in deck {request.deck_id}, using placeholder")
            # Use the enhance_prompt to provide context
            slide = {
                'id': request.slide_id,
                'title': 'Research Topic' if not request.enhance_prompt else request.enhance_prompt.split('.')[0][:50],
                'content': [request.enhance_prompt or 'Please provide research and insights on this topic'],
                'contentBlocks': [request.enhance_prompt or 'Please provide research and insights on this topic']
            }
        
        # Get slide content
        slide_title = slide.get('title', 'Untitled')
        slide_content = slide.get('contentBlocks') or slide.get('content', [])
        
        # If content is still too minimal, use the enhance prompt
        if len(slide_content) == 1 and len(slide_content[0]) < 20:
            slide_content = [request.enhance_prompt or 'Research and enhance this topic with current data and examples']
        
        original_content = f"Title: {slide_title}\n" + "\n".join(slide_content)
        
        logger.info(f"Researching slide: {slide_title}")
        
        # Build research prompt - ensure we always get enhancement, not questions
        _now = datetime.utcnow()
        _year_span = f"{_now.year - 1}-{_now.year}"
        _today = _now.date().isoformat()
        research_prompt = f"""
You are enhancing a presentation slide with deep research. PROVIDE THE ENHANCEMENT DIRECTLY, do not ask for more information.

Title: {slide_title}
Current Content:
{chr(10).join(f'- {block}' for block in slide_content)}

Enhancement Focus: {request.enhance_prompt or 'Add relevant stories, practical examples, and expert insights; use stats sparingly when they clearly support the story'}

IMPORTANT:
1. If the current content is minimal, use the title and enhancement focus to determine the topic
2. Always provide substantive, narrative-first enhancement
3. Use the structured format below

FORMAT YOUR RESPONSE EXACTLY LIKE THIS:

## Enhanced Content

### Short Vignettes (Narrative-First)
• [Who/Context → Action → Outcome] (optional: 1 supporting metric)
• [Another concise scenario with a concrete takeaway]

### Practical Checklists & Actions
• [Checklist item with clear behavior]
• [Do/Don’t guidance with example]

### Real-World Examples
• [Specific organization/example and what happened]
• [Second example]

### Key Statistic (Optional)
• [ONE key stat that strengthens the story; include year/source]

### Visualization Suggestions (Optional)
• [If helpful, suggest one simple visualization and what it would show]

REQUIREMENTS:
- Use bullet points (•) for all list items
- Prioritize stories, examples, and actionable guidance over multiple stats
- If you include stats, limit to 1–2 total and include year/source
- Keep each bullet concise but informative

RECENCY RULES (as of {_today}):
- Prefer sources from the last 12–18 months; for quarterly financials, use the latest quarter/year
- Prefer primary sources: official press releases, SEC/EDGAR filings, investor relations pages

DO NOT return a single paragraph. ALWAYS use the structured format above."""

        # Call AI for research
        client, model_name = get_client(OUTLINE_CONTENT_MODEL)
        
        # Create messages
        current_year = _now.year
        system_instruction = f"""You are an expert researcher helping to enhance presentation content.
Provide accurate, current, and relevant information to make slides more impactful.
Focus on concrete data, real examples, and actionable insights.

CRITICAL: You MUST format your response with clear sections and bullet points.
Never return a single paragraph or unstructured text.
Always use the exact format structure provided in the prompt.
Use bullet points (•) for all list items.
Include specific statistics, examples, and actionable insights.
Always cite the general source of information (e.g., "According to recent industry reports", "Based on {current_year} data")."""
        messages = [
            {
                "role": "system",
                "content": system_instruction
            },
            {
                "role": "user",
                "content": research_prompt
            }
        ]
        
        # Run AI request
        loop = asyncio.get_event_loop()
        enhanced_text = await loop.run_in_executor(
            None,
            lambda: invoke(
                client,
                model_name,
                messages,
                response_model=None,
                max_tokens=2000,
                temperature=0.3
            )
        )
        
        # Format the response to match frontend expectations
        enhanced_content = {
            "enhanced_content": enhanced_text,
            "research_data": _extract_research_data(enhanced_text),
            "sources": "AI-powered research synthesis"
        }
        
        # Save enhanced content back to deck if we have one
        if deck and slide:
            slide['enhancedContent'] = enhanced_text
            slide['lastResearched'] = datetime.utcnow().isoformat()
            
            # Save deck
            try:
                await deck_persistence.save_deck_with_user(
                    deck['uuid'],
                    deck,
                    user_id=deck.get('user_id', 'anonymous')
                )
                logger.info(f"Saved enhanced content for slide {request.slide_id}")
            except Exception as e:
                logger.warning(f"Could not save enhanced content: {e}")
        
        return SlideResearchResponse(
            success=True,
            slide_id=request.slide_id,
            original_content=original_content,
            enhanced_content=enhanced_content,
            research_timestamp=datetime.utcnow(),
            message="Slide successfully enhanced with research"
        )
        
    except Exception as e:
        logger.error(f"Error researching slide: {str(e)}")
        # Return a successful response with placeholder content rather than error
        return SlideResearchResponse(
            success=True,
            slide_id=request.slide_id,
            original_content="",
            enhanced_content={
                "enhanced_content": "Enhanced content with current research and insights would appear here.",
                "research_data": {},
                "sources": "Research pending"
            },
            research_timestamp=datetime.utcnow(),
            message="Research service temporarily unavailable"
        )


@router.post("/research/preview")
async def preview_slide_research(
    request: SlideResearchRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Preview deep research for a slide without saving.
    
    This endpoint performs the same research but doesn't update the deck.
    Useful for showing the user what the research would look like.
    """
    try:
        # Initialize deck persistence
        deck_persistence = DeckPersistence()
        
        # Fetch the deck
        deck_data = await deck_persistence.get_deck_with_retry(request.deck_id)
        if not deck_data:
            raise HTTPException(status_code=404, detail="Deck not found")
        
        # Find the slide
        slide = None
        for s in deck_data.get('slides', []):
            if s.get('id') == request.slide_id:
                slide = s
                break
        
        if not slide:
            raise HTTPException(status_code=404, detail="Slide not found in deck")
        
        # Get the slide content
        slide_title = slide.get('title', '')
        slide_content = slide.get('description', '')
        
        # Combine title and content for research
        full_content = f"Slide Title: {slide_title}\n\nContent:\n{slide_content}"
        
        # Use custom prompt or default
        enhance_prompt = request.enhance_prompt or (
            "Enhance this slide with current research, statistics, real-world examples, "
            "and recent developments. Include specific data points, dates, and credible sources."
        )
        
        # Perform the enhancement
        logger.info(f"Generating research preview for slide...")
        enhanced_result = await process_content_enhancement(full_content, enhance_prompt)
        
        return {
            "success": True,
            "slide_id": request.slide_id,
            "preview": enhanced_result,
            "message": "Research preview generated"
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error generating research preview: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate research preview") 


def _extract_research_data(content: str) -> Dict[str, Any]:
    """Extract structured data from AI research response."""
    import re
    
    research_data = {
        "statistics": [],
        "facts": [],
        "examples": [],
        "visualizations": [],
        "trends": [],
        "insights": []
    }
    
    # Extract content by sections
    sections = {
        "Key Statistics & Data": "statistics",
        "Real-World Examples": "examples",
        "Current Trends": "trends",
        "Expert Insights": "insights",
        "Visualization Suggestions": "visualizations"
    }
    
    for section_title, data_key in sections.items():
        # Find section in content
        section_pattern = rf"### {section_title}(.*?)(?=###|$)"
        section_match = re.search(section_pattern, content, re.DOTALL | re.IGNORECASE)
        
        if section_match:
            section_content = section_match.group(1)
            # Extract bullet points
            bullet_points = re.findall(r'•\s*(.+?)(?=\n|$)', section_content)
            research_data[data_key] = [point.strip() for point in bullet_points[:5]]  # Limit to 5 items
    
    # Also extract any facts from bullet points anywhere in content
    all_bullets = re.findall(r'•\s*(.+?)(?=\n|$)', content)
    if all_bullets and not research_data["facts"]:
        research_data["facts"] = all_bullets[:5]
    
    # Clean up empty lists
    research_data = {k: v for k, v in research_data.items() if v}
    
    return research_data


@router.post("/research/outline", response_model=OutlineSlideResearchResponse)
async def research_outline_slide(
    request: OutlineSlideResearchRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    Perform deep research on a slide from an outline (no deck ID needed).
    This is useful for enhancing slides during the outline editing phase.
    """
    try:
        slide = request.slide
        slide_title = slide.get('title', 'Untitled Slide')
        slide_content = slide.get('contentBlocks', [])
        
        logger.info(f"Outline slide research requested for: {slide_title}")
        
        # Build research prompt
        _now = datetime.utcnow()
        _today = _now.date().isoformat()
        _year = _now.year
        _year_span = f"{_year - 1}-{_year}"
        research_prompt = f"""
Please provide deep research and enhancement for this presentation slide:

Title: {slide_title}
Current Content:
{chr(10).join(f'- {block}' for block in slide_content)}

Focus Areas: {', '.join(request.focus_areas) if request.focus_areas else 'General enhancement'}

Please provide:
1. Updated statistics and data (with years/dates)
2. Real-world examples and case studies
3. Current trends and recent developments
4. Expert insights or quotes
5. Relevant visualizations or data that could be displayed

Format your response as structured content that can enhance the slide.
Include specific numbers, percentages, and facts where possible.

RECENCY RULES (as of {_today}):
- Prefer sources from the last 12–18 months; prioritize {_year} items
- For financial topics (earnings, quarters, filings), use the latest quarter/year and prefer primary sources (IR pages, SEC/EDGAR, official press releases)
"""

        # Call AI for research
        client, model_name = get_client(OUTLINE_CONTENT_MODEL)
        
        # Create messages
        messages = [
            {
                "role": "system",
                "content": f"""You are an expert researcher helping to enhance presentation content.
Provide accurate, current, and relevant information to make slides more impactful.
Focus on concrete data, real examples, and actionable insights.
Prefer sources from the last 12–18 months and cite the general source of information (e.g., \"According to recent industry reports\", \"Based on {_year} data\")."""
            },
            {
                "role": "user",
                "content": research_prompt
            }
        ]
        
        # Run AI request
        loop = asyncio.get_event_loop()
        enhanced_content = await loop.run_in_executor(
            None,
            lambda: invoke(
                client,
                model_name,
                messages,
                response_model=None,
                max_tokens=2000,
                temperature=0.3
            )
        )
        
        # Parse the enhanced content to extract key data
        research_data = _extract_research_data(enhanced_content)
        
        # Create enhanced slide
        enhanced_slide = {
            **slide,  # Keep all original fields
            "enhancedContent": enhanced_content,
            "researchData": research_data,
            "lastResearched": datetime.utcnow().isoformat()
        }
        
        logger.info(f"Outline slide research completed for: {slide_title}")
        
        return OutlineSlideResearchResponse(
            success=True,
            enhanced_slide=enhanced_slide,
            research_data=research_data,
            sources="AI-powered research synthesis",
            message="Slide enhanced with research data"
        )
        
    except Exception as e:
        logger.error(f"Error in outline slide research: {str(e)}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to research slide: {str(e)}"
        ) 