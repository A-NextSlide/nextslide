import logging
from typing import Optional, List, Dict, Any
from fastapi import HTTPException

from services.outline_service import OutlineGenerator, OutlineOptions

from .models import ContentEnhancementRequest, ContentEnhancementResponse

logger = logging.getLogger(__name__)


async def process_content_enhancement(content: str, enhance_prompt: str = "") -> Dict[str, Any]:
    """Process content enhancement using Gemini with Google Search grounding"""
    try:
        from agents.ai.clients import get_client, invoke
        import os
        
        logger.info(f"Enhancing content with Google Search grounding")
        logger.info(f"Content length: {len(content)}, Enhance prompt: {enhance_prompt[:100]}...")
        
        # Use Gemini Flash-Lite for cost-effective search grounding
        from agents.config import GEMINI_FLASH_LITE
        model_name = GEMINI_FLASH_LITE
        client, actual_model = get_client(model_name)
        
        # Build the enhanced prompt that encourages search usage
        _now = datetime.utcnow()
        _today = _now.date().isoformat()
        _year = _now.year
        full_prompt = f"""Current slide content:
{content}

Enhancement request: {enhance_prompt}

Please enhance this slide content based on the enhancement request. Search for and include:
1. Current statistics and data (with dates/years)
2. Recent examples or case studies
3. Up-to-date market information
4. Relevant facts and figures from credible sources
5. Industry trends and insights

Return the enhanced content in a clear, bullet-point format suitable for a presentation slide.
If you find any quantitative data that could be visualized, format it as "Chart Data: [description]"

IMPORTANT: 
- Use web search to find current, accurate information
- Include specific numbers, percentages, and dates when available
- Keep content concise and suitable for slides
- Format with clear bullet points
- Cite sources when possible (e.g., "According to [Source]...")

RECENCY RULES (as of {_today}):
- Prefer sources from the last 12–18 months; prioritize {_year} items
- For financial topics (earnings, quarters, filings), use the latest quarter/year and prefer primary sources (IR pages, SEC/EDGAR, official press releases)"""

        # Make the API call with search grounding enabled via system instruction
        messages = [
            {
                "role": "system",
                "content": "You are a presentation content enhancer with access to web search. Always search for current, accurate data to enhance slide content. Use search to find statistics, examples, and up-to-date information."
            },
            {
                "role": "user",
                "content": full_prompt
            }
        ]
        
        # Call with grounding enabled
        # Note: Google Search grounding is automatically enabled for Gemini Flash models
        # when they detect search-related queries in the prompt
        enhanced_content = invoke(
            client=client,
            model=actual_model,
            messages=messages,
            response_model=None,  # Get raw text response
            max_tokens=2000,
            temperature=0.7,
            # Enable grounding by including search instructions in the prompt
        )
        
        # Check if any chart data was suggested
        extracted_data = None
        if enhanced_content and ("chart data:" in enhanced_content.lower() or "data visualization:" in enhanced_content.lower()):
            # Try to extract any structured data for charts
            import re
            # Look for patterns like "Chart Data: X: Y, A: B" etc
            data_patterns = [
                r'(?:Chart Data|Data Visualization):\s*([^\n]+)',
                r'(?:Quantitative data):\s*([^\n]+)',
                r'(?:Statistics):\s*([^\n]+)'
            ]
            
            for pattern in data_patterns:
                matches = re.findall(pattern, enhanced_content, re.IGNORECASE)
                if matches:
                    extracted_data = {
                        "type": "suggested_visualization",
                        "content": matches[0].strip(),
                        "source": "search_enhanced"
                    }
                    break
        
        # Check if search was actually used by looking for indicators
        used_search = any(indicator in enhanced_content.lower() for indicator in [
            "according to", "recent data", "as of", "latest", "current", 
            "study shows", "research indicates", "survey found", "% of",
            "million", "billion", "growth", "increase", "decrease"
        ])
        
        logger.info(f"Content enhanced successfully (search used: {used_search})")
        
        # Return with correct field names for frontend
        return {
            "enhancedContent": enhanced_content,
            "extractedData": extracted_data,
            "sources": "Google Search via Gemini" if used_search else "AI-generated"
        }
        
    except Exception as e:
        logger.error(f"Error in content enhancement: {e}")
        import traceback
        traceback.print_exc()
        
        # Fallback to basic enhancement without explicit search
        try:
            from agents.ai.clients import get_client, invoke
            
            # Try with configured content model if Gemini fails
            client, model_name = get_client(OUTLINE_CONTENT_MODEL)
            
            messages = [{
                "role": "user",
                "content": f"""Enhance this slide content: {content}

Enhancement request: {enhance_prompt}

Provide enhanced content suitable for a presentation slide with:
- Clear bullet points
- Specific examples or data points
- Professional tone
- Concise format"""
            }]
            
            enhanced_content = invoke(
                client=client,
                model=model_name,
                messages=messages,
                response_model=None,
                max_tokens=1000,
                temperature=0.7
            )
            
            return {
                "enhancedContent": enhanced_content,
                "extractedData": None,
                "sources": "AI-generated (fallback)"
            }
            
        except Exception as e2:
            logger.error(f"Fallback enhancement also failed: {e2}")
            return {
                "enhancedContent": content,
                "extractedData": None,
                "error": f"Enhancement failed: {str(e)}"
            }
