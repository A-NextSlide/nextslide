"""
Narrative Flow Analyzer Service
Analyzes presentation structure and provides storytelling guidance
"""
import logging
from typing import List, Dict, Any, Optional, Tuple
import asyncio
from models.narrative_flow import (
    NarrativeFlow, StoryArc, NarrativePhase, KeyTheme, 
    FlowRecommendation, ToneAndStyle, PresentationTip
)
from services.openai_service import OpenAIService
from agents.config import OUTLINE_PLANNING_MODEL
import json
import re

logger = logging.getLogger(__name__)

# Use the same model as outline planning for consistency and speed
NARRATIVE_FLOW_MODEL = OUTLINE_PLANNING_MODEL


class NarrativeFlowAnalyzer:
    """Analyzes presentation content to generate narrative flow insights"""
    
    def __init__(self):
        self.openai_service = OpenAIService()
        
    async def analyze_narrative_flow(
        self, 
        outline: Dict[str, Any],
        context: Optional[str] = None
    ) -> NarrativeFlow:
        """
        Analyze the narrative flow of a presentation outline
        """
        try:
            # Import the model adapter
            from agents.ai.clients import get_client, MODELS, CLIENTS
            from google.genai import Client as Gemini
            
            # Prepare content for analysis
            outline_text = self._format_outline_for_analysis(outline)
            
            # Build the analysis prompt
            analysis_prompt = self._build_analysis_prompt(outline_text, context)
            
            # For Gemini, we need to use raw client due to instructor issues
            if NARRATIVE_FLOW_MODEL in MODELS and MODELS[NARRATIVE_FLOW_MODEL][0] == "gemini":
                # Use raw Gemini client
                client = Gemini()
                model_name = MODELS[NARRATIVE_FLOW_MODEL][1]
            else:
                # Get the instructor-patched client for other models
                client, model_name = get_client(NARRATIVE_FLOW_MODEL)
            
            messages = [
                {
                    "role": "system",
                    "content": """You are an expert presentation coach and storytelling analyst.
Analyze presentations to identify narrative structure, themes, and flow.
Provide actionable insights for improving presentation impact.
Always return valid JSON in the exact format requested."""
                },
                {
                    "role": "user",
                    "content": analysis_prompt
                }
            ]
            
            # For Gemini and Perplexity, use direct JSON generation due to instructor compatibility issues
            is_gemini = "gemini" in model_name
            is_perplexity = "sonar" in model_name or "perplexity" in model_name
            logger.info(f"Using model: {model_name}, is Gemini: {is_gemini}, is Perplexity: {is_perplexity}")
            
            if is_gemini or is_perplexity:
                logger.info(f"Using direct JSON generation for {'Gemini' if is_gemini else 'Perplexity'}")
                
                if is_gemini:
                    # Format messages for Gemini
                    prompt = ""
                    for msg in messages:
                        if msg["role"] == "system":
                            prompt += f"System: {msg['content']}\n\n"
                        elif msg["role"] == "user":
                            prompt += f"User: {msg['content']}\n\n"
                    
                    # Use Gemini's generate_content method
                    response = await client.aio.models.generate_content(
                        model=model_name,
                        contents=prompt,
                        config={
                            "temperature": 0.7,
                            "response_mime_type": "application/json"
                        }
                    )
                    
                    # Extract content from response
                    content = response.text if hasattr(response, 'text') else response.content
                else:
                    # Perplexity path - use raw OpenAI-style client without instructor
                    from agents.ai.clients import get_client
                    raw_client, _ = get_client(NARRATIVE_FLOW_MODEL, wrap_with_instructor=False)
                    
                    response = await asyncio.to_thread(
                        lambda: raw_client.chat.completions.create(
                            model=model_name,
                            messages=messages,
                            temperature=0.7,
                            max_tokens=4096
                        )
                    )
                    
                    content = response.choices[0].message.content
                
                # Parse the response
                narrative_data = self._parse_narrative_response(content, outline)
            else:
                # Use instructor for other models
                from agents.ai.clients import invoke
                # invoke() is synchronous and returns the result directly; do not await
                narrative_data = await asyncio.to_thread(
                    lambda: invoke(
                        client=client,
                        model=model_name,
                        messages=messages,
                        response_model=NarrativeFlow,
                        temperature=0.7,
                        max_tokens=4096
                    )
                )
            
            return narrative_data
            
        except Exception as e:
            logger.error(f"Error analyzing narrative flow: {e}")
            # Return a basic narrative flow on error
            return self._generate_fallback_narrative(outline)
    
    def _format_outline_for_analysis(self, outline: Dict[str, Any]) -> str:
        """Format outline for AI analysis"""
        lines = [
            f"Title: {outline.get('title', 'Untitled')}",
            f"Topic: {outline.get('topic', '')}",
            f"Number of slides: {len(outline.get('slides', []))}",
            "\nSlides:"
        ]
        
        for i, slide in enumerate(outline.get('slides', [])):
            lines.append(f"\nSlide {i+1}: {slide.get('title', 'Untitled')}")
            lines.append(f"Type: {slide.get('slide_type', 'content')}")
            lines.append(f"Content: {slide.get('content', '')[:200]}...")
            if slide.get('speaker_notes'):
                lines.append(f"Notes: {slide.get('speaker_notes', '')[:100]}...")
        
        return "\n".join(lines)
    
    def _build_analysis_prompt(self, outline_text: str, context: Optional[str]) -> str:
        """Build the prompt for narrative analysis"""
        context_line = f"Additional context: {context}" if context else ""
        
        # Use raw string to avoid f-string formatting issues
        json_template = """{
  "story_arc": {
    "type": "problem-solution|chronological|persuasive|educational|comparative",
    "description": "Brief description of the narrative structure",
    "phases": [
      {
        "name": "Phase name",
        "slides": ["slide-id-1", "slide-id-2"],
        "purpose": "What this phase accomplishes",
        "suggested_duration": 120
      }
    ]
  },
  "key_themes": [
    {
      "theme": "Main theme",
      "description": "How this theme is developed",
      "related_slides": ["slide-id"],
      "importance": "high|medium|low"
    }
  ],
  "flow_recommendations": [
    {
      "type": "transition|pacing|emphasis|structure",
      "between_slides": ["from-slide-id", "to-slide-id"],
      "recommendation": "Specific actionable advice",
      "priority": "high|medium|low"
    }
  ],
  "tone_and_style": {
    "overall_tone": "professional|conversational|inspirational|educational|persuasive",
    "language_level": "technical|general|executive|beginner",
    "engagement_techniques": ["technique1", "technique2"]
  },
  "presentation_tips": [
    {
      "slide_id": "slide-id",
      "tip": "Specific presenting advice",
      "category": "delivery|content|visual|interaction"
    }
  ]
}"""
        
        return f"""Analyze this presentation outline for narrative flow and storytelling structure.

{outline_text}

{context_line}

Analyze the narrative flow and provide your response in JSON format with the following structure:

{json_template}

Ensure:
1. Use actual slide IDs from the outline
2. Provide 2-4 narrative phases
3. Include 2-3 key themes
4. Give 3-5 flow recommendations
5. Add 3-5 presentation tips
6. Focus on actionable, specific insights"""
    
    def _parse_narrative_response(
        self, 
        response: str, 
        outline: Dict[str, Any]
    ) -> NarrativeFlow:
        """Parse AI response into NarrativeFlow model"""
        try:
            # Extract JSON from response
            json_match = re.search(r'\{.*\}', response, re.DOTALL)
            if json_match:
                data = json.loads(json_match.group())
            else:
                data = json.loads(response)
            
            # Get slide IDs for validation
            slide_ids = [slide.get('id', f'slide-{i}') 
                        for i, slide in enumerate(outline.get('slides', []))]
            
            # Validate and fix slide references
            data = self._validate_slide_references(data, slide_ids)
            
            # Create NarrativeFlow object
            return NarrativeFlow(
                story_arc=StoryArc(**data['story_arc']),
                key_themes=[KeyTheme(**theme) for theme in data['key_themes']],
                flow_recommendations=[
                    FlowRecommendation(**rec) for rec in data['flow_recommendations']
                ],
                tone_and_style=ToneAndStyle(**data['tone_and_style']),
                presentation_tips=[
                    PresentationTip(**tip) for tip in data['presentation_tips']
                ]
            )
            
        except Exception as e:
            logger.error(f"Error parsing narrative response: {e}")
            return self._generate_fallback_narrative(outline)
    
    def _validate_slide_references(
        self, 
        data: Dict[str, Any], 
        valid_slide_ids: List[str]
    ) -> Dict[str, Any]:
        """Ensure all slide references are valid"""
        # Fix story arc phases
        for phase in data.get('story_arc', {}).get('phases', []):
            phase['slides'] = [
                sid for sid in phase.get('slides', []) 
                if sid in valid_slide_ids
            ][:3]  # Limit to 3 slides per phase
            
            # Ensure at least one slide
            if not phase['slides'] and valid_slide_ids:
                phase['slides'] = [valid_slide_ids[0]]
        
        # Fix key themes
        for theme in data.get('key_themes', []):
            theme['related_slides'] = [
                sid for sid in theme.get('related_slides', [])
                if sid in valid_slide_ids
            ]
        
        # Fix flow recommendations
        for rec in data.get('flow_recommendations', []):
            if rec.get('between_slides'):
                slides = rec['between_slides']
                if len(slides) >= 2:
                    if slides[0] not in valid_slide_ids or slides[1] not in valid_slide_ids:
                        rec['between_slides'] = None
        
        # Fix presentation tips
        allowed_tip_categories = {"delivery", "content", "visual", "interaction"}
        category_aliases = {
            "structure": "content",
            "organisation": "content",
            "organization": "content",
            "design": "visual",
            "style": "visual",
            "aesthetics": "visual",
            "engagement": "interaction",
            "story": "delivery",
            "narrative": "delivery",
            "pacing": "delivery"
        }
        for tip in data.get('presentation_tips', []):
            if tip.get('slide_id') and tip['slide_id'] not in valid_slide_ids:
                tip['slide_id'] = None
            # Normalize invalid or unknown categories to allowed set
            category = tip.get('category')
            if isinstance(category, str):
                lower = category.lower()
                if lower not in allowed_tip_categories:
                    tip['category'] = category_aliases.get(lower, "content")
            else:
                # Default to content if missing or wrong type
                tip['category'] = "content"
        
        return data
    
    def _generate_fallback_narrative(self, outline: Dict[str, Any]) -> NarrativeFlow:
        """Generate a basic narrative flow as fallback"""
        slides = outline.get('slides', [])
        slide_ids = [slide.get('id', f'slide-{i}') for i, slide in enumerate(slides)]
        
        # Determine basic story arc
        slide_count = len(slides)
        if slide_count <= 3:
            arc_type = "educational"
        elif any('problem' in str(slide.get('title', '')).lower() for slide in slides[:2]):
            arc_type = "problem-solution"
        else:
            arc_type = "chronological"
        
        # Create phases
        phases = []
        if slide_count >= 3:
            phases = [
                NarrativePhase(
                    name="Introduction",
                    slides=slide_ids[:1],
                    purpose="Set context and grab attention",
                    suggested_duration=60
                ),
                NarrativePhase(
                    name="Main Content",
                    slides=slide_ids[1:-1] if slide_count > 3 else slide_ids[1:2],
                    purpose="Deliver core message and details",
                    suggested_duration=180
                ),
                NarrativePhase(
                    name="Conclusion",
                    slides=slide_ids[-1:],
                    purpose="Summarize and call to action",
                    suggested_duration=60
                )
            ]
        else:
            phases = [
                NarrativePhase(
                    name="Overview",
                    slides=slide_ids,
                    purpose="Present key information",
                    suggested_duration=120
                )
            ]
        
        return NarrativeFlow(
            story_arc=StoryArc(
                type=arc_type,
                description=f"A {arc_type} presentation structure",
                phases=phases
            ),
            key_themes=[
                KeyTheme(
                    theme=outline.get('topic', 'Main Topic'),
                    description="The central topic of the presentation",
                    related_slides=slide_ids,
                    importance="high"
                )
            ],
            flow_recommendations=[
                FlowRecommendation(
                    type="pacing",
                    recommendation="Maintain consistent pacing throughout",
                    priority="medium"
                )
            ],
            tone_and_style=ToneAndStyle(
                overall_tone="professional",
                language_level="general",
                engagement_techniques=["clear structure", "logical flow"]
            ),
            presentation_tips=[
                PresentationTip(
                    tip="Start with a strong opening to capture attention",
                    category="delivery"
                ),
                PresentationTip(
                    slide_id=slide_ids[-1] if slide_ids else None,
                    tip="End with a clear call to action",
                    category="content"
                )
            ]
        )
    
    async def detect_narrative_changes(
        self,
        original_outline: Dict[str, Any],
        updated_outline: Dict[str, Any],
        original_flow: Optional[NarrativeFlow] = None
    ) -> Tuple[bool, List[str]]:
        """
        Detect if narrative flow needs updating after an edit
        Returns (needs_update, list_of_changes)
        """
        changes = []
        
        # Check for structural changes
        if len(original_outline.get('slides', [])) != len(updated_outline.get('slides', [])):
            changes.append("Number of slides changed")
            return True, changes
        
        # Check for slide order changes
        original_ids = [s.get('id') for s in original_outline.get('slides', [])]
        updated_ids = [s.get('id') for s in updated_outline.get('slides', [])]
        if original_ids != updated_ids:
            changes.append("Slide order changed")
            return True, changes
        
        # Check for significant content changes
        for i, (orig, upd) in enumerate(zip(
            original_outline.get('slides', []), 
            updated_outline.get('slides', [])
        )):
            # Title changes
            if orig.get('title', '') != upd.get('title', ''):
                changes.append(f"Slide {i+1} title changed")
            
            # Content length changes (>30% difference)
            orig_len = len(orig.get('content', ''))
            upd_len = len(upd.get('content', ''))
            if abs(orig_len - upd_len) / max(orig_len, 1) > 0.3:
                changes.append(f"Slide {i+1} content significantly changed")
            
            # Slide type changes
            if orig.get('slide_type') != upd.get('slide_type'):
                changes.append(f"Slide {i+1} type changed")
        
        # Determine if changes warrant narrative update
        needs_update = len(changes) >= 2 or any(
            'order' in change or 'type' in change 
            for change in changes
        )
        
        return needs_update, changes 