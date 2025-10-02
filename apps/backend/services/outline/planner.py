"""Outline planning module"""

import json
import re
import logging
from typing import Dict, Any, List, Optional, Union
from pydantic import BaseModel, Field

from agents.ai.clients import get_client, invoke, get_max_tokens_for_model
from google.genai import Client as Gemini
from agents.prompts.generation.outline_prompts import get_outline_planning_prompt
from .models import OutlineOptions
from agents.config import OUTLINE_PLANNING_MODEL
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class EnhancedOutlinePlan(BaseModel):
    """Structured outline plan"""
    title: str
    slides: List[Union[str, Dict[str, Any]]]
    slide_types: List[str] = Field(default_factory=list, description="Types of slides")
    context: str = Field(default="business", description="Presentation context")


class OutlinePlanner:
    """Handles the planning phase of outline generation"""
    
    def __init__(self):
        self.default_slide_ranges = {
            "quick": (1, 3),
            "standard": (4, 8),
            # Use None for open-ended upper bound to express "8+" in prompts
            "detailed": (8, None)
        }
    
    async def create_plan(self, options: OutlineOptions, processed_files: Optional[Dict] = None) -> Dict[str, Any]:
        """Create outline plan with title slide and natural flow"""
        model = self._get_model("planning", options)
        client, model_name = get_client(model)
        
        logger.info(f"[PLAN] Creating plan with slide_count: {options.slide_count}, detail_level: {options.detail_level}")
        
        # Log the prompt to see if file context is included
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"[PLANNER] Prompt length: {len(options.prompt)} chars")
            if "Image Analysis Results:" in options.prompt:
                logger.debug("[PLANNER] ✓ Image analysis found in prompt")
            if "File Analysis Insights:" in options.prompt:
                logger.debug("[PLANNER] ✓ File analysis found in prompt")
            
            # Show a preview of the prompt
            logger.debug(f"[PLANNER] Prompt preview (last 500 chars):")
            logger.debug(options.prompt[-500:] if len(options.prompt) > 500 else options.prompt)
        
        prompt = get_outline_planning_prompt(
            options.prompt, 
            options.style_context, 
            options.detail_level,
            options.slide_count
        )
        
        try:
            temperature = 0.7 if not self._requires_default_temperature(model_name) else 1.0
            
            # Get model's max token capability
            model_max_tokens = get_max_tokens_for_model(model)
            plan_max_tokens = min(int(model_max_tokens * 0.15), 4000)
            
            # Handle Gemini models differently
            if "gemini" in model_name.lower():
                result = await self._handle_gemini_planning(
                    client, model_name, options, plan_max_tokens, temperature
                )
            else:
                # Provider-agnostic approach: request JSON and parse locally to avoid typed wrappers
                response_text = invoke(
                    client=client,
                    model=model_name,
                    messages=[{"role": "user", "content": prompt}],
                    response_model=None,
                    max_tokens=plan_max_tokens,
                    temperature=temperature
                )
                # Extract JSON payload
                m = re.search(r"\{[\s\S]*\}", response_text)
                try:
                    raw = json.loads(m.group(0) if m else response_text)
                except Exception:
                    raise ValueError("Planner received non-JSON response")
                # Coerce into EnhancedOutlinePlan shape with minimal validation
                if not isinstance(raw, dict):
                    raise ValueError("Planner JSON is not an object")
                if 'slides' not in raw or not isinstance(raw.get('slides'), list):
                    raise ValueError("Planner JSON missing slides array")
                if 'title' not in raw:
                    raw['title'] = 'Presentation Outline'
                if 'slide_types' not in raw or not isinstance(raw.get('slide_types'), list):
                    raw['slide_types'] = self._infer_slide_types(raw['slides'])
                if 'context' not in raw:
                    raw['context'] = 'business'
                result = raw
            
            # Do not adjust counts in code; rely on prompt compliance
            result = result
            
            # Ensure slide types are set
            if not result.get('slide_types'):
                result['slide_types'] = self._infer_slide_types(result['slides'])
            
            return result
            
        except Exception as e:
            logger.error(f"Planning failed: {e}")
            # Fallback plan
            return self._create_fallback_plan(options)
    
    async def _handle_gemini_planning(
        self, client, model_name: str, options: OutlineOptions, 
        max_tokens: int, temperature: float
    ) -> Dict[str, Any]:
        """Handle Gemini-specific planning"""
        slide_count_info = f" (exactly {options.slide_count} slides)" if options.slide_count else f" ({self._get_slide_range(options.detail_level)})"
        
        # Special instructions for small slide counts
        special_instruction = ""
        if options.slide_count == 1:
            special_instruction = "\nIMPORTANT: Generate EXACTLY 1 slide. It should be a content slide only - NO title or conclusion."
        elif options.slide_count == 2:
            special_instruction = "\nIMPORTANT: Generate EXACTLY 2 slides. Both should be content slides - NO title or conclusion slides."
        
        # Enforcement for specific slide counts
        enforcement = ""
        if options.slide_count:
            enforcement = f"""
CRITICAL REQUIREMENT: You MUST generate EXACTLY {options.slide_count} slides. 
The "slides" array in your JSON response MUST have EXACTLY {options.slide_count} items.
DO NOT generate more or fewer slides."""
        else:
            # Add explicit range enforcement when only detail level is provided
            if options.detail_level == 'quick':
                enforcement = "\nCRITICAL: Because detail level is 'quick', generate BETWEEN 1 and 3 slides total. Do NOT exceed 3."
            elif options.detail_level == 'standard':
                enforcement = "\nCRITICAL: Because detail level is 'standard', generate BETWEEN 4 and 8 slides total."
            elif options.detail_level == 'detailed':
                enforcement = "\nGUIDELINE: Because detail level is 'detailed', generate 8 or more slides as appropriate (aim 8-12 unless the topic clearly merits more)."
        
        simplified_prompt = f"""Create a presentation outline for: {options.prompt}
                    
Detail level: {options.detail_level}
Style: {options.style_context or 'Professional'}
Slides needed: {slide_count_info}{special_instruction}{enforcement}

Return JSON with EXACTLY {options.slide_count if options.slide_count else 'the appropriate number of'} slides:
- title: The presentation title
- slides: Array with EXACTLY {options.slide_count if options.slide_count else 'the right number of'} slide titles
- slide_types: Array with EXACTLY {options.slide_count if options.slide_count else 'the same number of'} types
- context: business, educational, personal, or informational

CRITICAL FLOW RULES:
{self._get_flow_rules(options.slide_count, options.detail_level)}

CONTEXT GUARDRAILS:
- If the topic is PERSONAL/CREATIVE or GENERAL/HOW-TO (e.g., recipes, hobbies, crafts, lifestyle):
  - AVOID statistics, market sizing, ROI, KPIs, or charts unless the user explicitly asks
  - Do NOT add agenda/team slides; keep it fun, story-driven, and practical
  - Focus on steps, tips, examples, anecdotes, flavors/textures/tools, and creative ideas
- Reserve stats/charts/financials for BUSINESS/DATA topics or when specific data is provided

Make it specific to the topic, not generic."""
        
        # Use raw Gemini client to avoid instructor typing issues
        try:
            gemini_raw = Gemini()
            result = gemini_raw.models.generate_content(
                model=f"models/{model_name}",
                contents=simplified_prompt
            )
            response_text = result.text
        except Exception:
            # Fallback to invoke if direct call fails
            response_text = invoke(
                client=client,
                model=model_name,
                messages=[{"role": "user", "content": simplified_prompt}],
                response_model=None,
                max_tokens=max_tokens,
                temperature=temperature
            )
        
        # Parse JSON from response
        json_match = re.search(r'\{[\s\S]*\}', response_text)
        if json_match:
            result = json.loads(json_match.group())
            
            # Ensure required fields
            if 'slides' not in result:
                raise ValueError("Missing slides in response")
            if 'title' not in result:
                result['title'] = "Presentation Outline"
            if 'slide_types' not in result:
                result['slide_types'] = self._infer_slide_types(result['slides'])
            else:
                # Normalize slide types to lowercase
                normalized_types = []
                for t in result['slide_types']:
                    # Handle dict slide types (convert to string first)
                    if isinstance(t, dict):
                        t = t.get('type', 'content') if 'type' in t else str(t)
                    
                    # Convert to lowercase and remove variations
                    normalized = str(t).lower().replace(' slide', '').replace('_', '').replace('slide', '')
                    
                    # Map common variations to standard types
                    if normalized in ['titleslide', 'title']:
                        normalized = 'title'
                    elif normalized in ['datavisualization', 'data', 'chart', 'charts', 'metrics', 'keymetrics', 'kpi', 'kpis', 'analytics']:
                        normalized = 'data'  # Keep 'data' type for chart generation
                    elif normalized in ['contentslide', 'content']:
                        normalized = 'content'
                    elif normalized in ['conclusionslide', 'conclusion', 'closing']:
                        normalized = 'conclusion'
                    elif normalized in ['teamslide', 'team', 'aboutus']:
                        normalized = 'team'
                    elif normalized in ['agendaslide', 'agenda', 'outline']:
                        normalized = 'agenda'
                    elif normalized in ['transitionslide', 'transition']:
                        normalized = 'transition'
                    else:
                        # Default to content for unknown types
                        normalized = 'content'
                    
                    normalized_types.append(normalized)
                
                result['slide_types'] = normalized_types
            
            return result
        else:
            raise ValueError("No JSON found in response")
    
    def _validate_slide_count(self, result: Dict[str, Any], options: OutlineOptions) -> Dict[str, Any]:
        """Deprecated: no code-based enforcement; keep model output as-is."""
        return result
    
    def _create_fallback_plan(self, options: OutlineOptions) -> Dict[str, Any]:
        """Create a fallback plan when AI fails"""
        title = "Presentation Outline"
        slides = []
        slide_types = []
        
        # Determine number of slides
        num_slides = options.slide_count or 6
        
        if num_slides == 1:
            slides = ["Key Information"]
            slide_types = ['content']
        elif num_slides == 2:
            slides = ["Overview", "Key Points"]
            slide_types = ['content', 'content']
        else:
            # Standard structure
            slides.append("Title Slide")
            slide_types.append('title')
            
            # Add content slides
            content_count = num_slides - 2
            for i in range(content_count):
                slides.append(f"Main Point {i+1}")
                slide_types.append('content')
            
            slides.append("Conclusion")
            slide_types.append('conclusion')
        
        return {
            "title": title,
            "slides": slides,
            "slide_types": slide_types,
            "context": "business"
        }
    
    def _infer_slide_types(self, slides: List[str]) -> List[str]:
        """Infer slide types based on titles"""
        types = []
        num_slides = len(slides)
        
        for i, slide in enumerate(slides):
            # Handle dict slide titles
            if isinstance(slide, dict):
                slide = slide.get('title', str(slide))
            title_lower = str(slide).lower()
            
            # For 1-2 slides, they're all content
            if num_slides <= 2:
                types.append('content')
            # For 3+ slides, use normal logic
            elif i == 0 and num_slides >= 3:
                # Only label first as title if it looks like an explicit title/cover
                title_text = str(slide).lower()
                is_explicit_title = any(word in title_text for word in ['title', 'cover', 'welcome'])
                is_very_short = len(title_text.split()) <= 3
                types.append('title' if (is_explicit_title or is_very_short) else 'content')
            # Transition slides (progress markers)
            elif '>>' in title_lower or '✓' in title_lower or 'progress' in title_lower:
                types.append('transition')
            # Divider slides
            elif any(word in title_lower for word in ['divider', 'section break', 'section divider', 'chapter']):
                types.append('divider')
            # Agenda/outline
            elif any(word in title_lower for word in ['agenda', 'outline', 'objectives']):
                types.append('agenda')
            # Team/about
            elif any(word in title_lower for word in ['team', 'about us', 'who we are']):
                types.append('team')
            # Quote slides (look for quotes or explicit tag)
            elif 'quote' in title_lower or '“' in slide or '”' in slide or '"' in slide:
                types.append('quote')
            # Stat slides (short numeric-heavy titles)
            elif any(ch.isdigit() for ch in str(slide)) and (
                str(slide).strip().startswith('$') or '%' in str(slide)
            ):
                # Keep stat slides only when clearly a single-metric title
                if len(str(slide).split()) <= 5:
                    types.append('stat')
                else:
                    types.append('content')
            # Conclusion/thanks
            elif any(word in title_lower for word in ['thank', 'questions', 'q&a', 'conclusion']):
                types.append('conclusion')
            elif any(word in title_lower for word in [
                'revenue', 'sales', 'growth', 'performance', 'metrics', 'kpi', 'roi',
                'profit', 'margin', 'cost', 'expense', 'budget', 'forecast', 'trend',
                'analysis', 'breakdown', 'comparison', 'statistics', 'data', 'results',
                'efficiency', 'productivity', 'conversion', 'rate', 'percentage',
                'quarter', 'q1', 'q2', 'q3', 'q4', 'ytd', 'yoy', 'mom', 'financial',
                'cash flow', 'balance', 'snapshot', 'overview', 'chart', 'graph'
            ]):
                # Prefer content; data charts will be decided later based on grounded data availability
                types.append('content')
            else:
                types.append('content')
        
        return types
    
    def _get_model(self, task: str, options: Optional[OutlineOptions] = None) -> str:
        """Select model for task"""
        if options and options.model:
            return options.model
        
        # Import here to avoid circular dependency
        return OUTLINE_PLANNING_MODEL
    
    def _requires_default_temperature(self, model_name: str) -> bool:
        """Check if model requires default temperature"""
        return "o3" in model_name or "o4" in model_name
    
    def _get_slide_range(self, detail_level: str) -> str:
        """Get slide range based on detail level"""
        min_slides, max_slides = self.default_slide_ranges.get(detail_level, (4, 8))
        if max_slides is None:
            return f"{min_slides}+ slides"
        return f"{min_slides}-{max_slides} slides"
    
    def _get_flow_rules(self, slide_count: Optional[int], detail_level: Optional[str] = None) -> str:
        """Get flow rules based on slide count or detail level when count is unknown"""
        if not slide_count:
            # Infer a nominal count midpoint when only detail level is known
            if detail_level == 'quick':
                slide_count = 2  # midpoint of 1-3
            elif detail_level == 'standard':
                slide_count = 6  # midpoint of 4-8
            else:
                slide_count = 10  # typical starting point for detailed
        
        rules = []
        
        if slide_count >= 8:
            rules.append("- Slide 2 MUST be an 'agenda' type showing the presentation roadmap")
            rules.append("- Add 'transition' slides every 4-5 content slides showing progress (e.g., 'Problem ✓ | >> Solution | Next Steps')")
            rules.append("- Include 'divider' slides for major section changes")
        
        if slide_count >= 12:
            rules.append("- Include at least 2-3 'stat' slides for key metrics")
            rules.append("- Add a 'quote' slide for testimonials or key insights")
            rules.append("- Include a summary/recap slide before the conclusion")
        
        if slide_count >= 20:
            rules.append("- Add sub-section dividers within major topics")
            rules.append("- Include multiple checkpoint transitions throughout")
            rules.append("- Consider breaking into chapters with intro/summary for each")
        
        if not rules:
            return "- Keep a logical flow from introduction to conclusion"
        
        return "\n".join(rules) 