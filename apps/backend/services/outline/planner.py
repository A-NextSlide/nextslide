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
        # These are now guidelines, not strict limits - AI should adjust based on topic complexity
        self.default_slide_ranges = {
            "quick": (1, 6),      # Expanded: simple topics 1-3, multi-part topics 4-6
            "standard": (4, 10),  # Expanded: typical 4-8, complex topics can go to 10
            "detailed": (8, 20)   # Expanded: comprehensive coverage, split content properly
        }
    
    async def create_plan(self, options: OutlineOptions, processed_files: Optional[Dict] = None) -> Dict[str, Any]:
        """Create outline plan with title slide and natural flow"""
        model = self._get_model("planning", options)
        client, model_name = get_client(model)
        
        logger.info(f"[PLAN] Creating plan with slide_count: {options.slide_count}, detail_level: {options.detail_level}")
        
        # Let the AI model infer the presentation context naturally
        # No hardcoded keyword detection - the model understands context better than rules
        
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

        # Debug: Log the prompt to understand what's being sent
        logger.info(f"[PLANNER DEBUG] Generated prompt (first 1000 chars):\n{prompt[:1000]}")
        logger.info(f"[PLANNER DEBUG] Prompt contains slide count guidance")

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
                    raw['context'] = "business"  # Default context, AI will override if appropriate
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
        # Only show count if explicitly requested
        if options.slide_count:
            slide_count_info = f" (exactly {options.slide_count} slides)"
            special_instruction = ""
            if options.slide_count == 1:
                special_instruction = "\nIMPORTANT: Generate EXACTLY 1 slide. It should be a content slide only - NO title or conclusion."
            elif options.slide_count == 2:
                special_instruction = "\nIMPORTANT: Generate EXACTLY 2 slides. Both should be content slides - NO title or conclusion slides."
        else:
            slide_count_info = " (you decide)"
            special_instruction = ""

        # Enforcement for specific slide counts
        enforcement = ""
        if options.slide_count:
            enforcement = f"""
CRITICAL REQUIREMENT: You MUST generate EXACTLY {options.slide_count} slides.
The "slides" array in your JSON response MUST have EXACTLY {options.slide_count} items.
DO NOT generate more or fewer slides."""
        else:
            # Let AI decide - minimal guidance
            enforcement = "\nDecide the optimal number of slides based on what the topic needs. Each slide should focus on one clear concept."

        simplified_prompt = f"""Create a presentation outline for: {options.prompt}

Detail level: {options.detail_level}
Style: {options.style_context or 'Professional'}
Slides needed: {slide_count_info}{special_instruction}{enforcement}

Return JSON with EXACTLY {options.slide_count if options.slide_count else 'the appropriate number of'} slides:
- title: The presentation title
- slides: Array with EXACTLY {options.slide_count if options.slide_count else 'the right number of'} slide titles
- slide_types: Array with EXACTLY {options.slide_count if options.slide_count else 'the same number of'} types
- context: Infer the appropriate context (business/educational/personal/informational) based on the topic

CRITICAL FLOW RULES:
{self._get_flow_rules(options.slide_count, options.detail_level)}

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
            if 'context' not in result:
                result['context'] = "business"  # Default context, AI will override if appropriate
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
            "context": "business"  # Default fallback context
        }
    
    def _infer_slide_types(self, slides: List[str]) -> List[str]:
        """Default to content types; defer type specialization to the model."""
        return ['content' for _ in slides]
    
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
        """Get flow rules with minimal guidance."""
        _ = slide_count
        _ = detail_level
        return "- Logical flow"
