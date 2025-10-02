"""
Deck Style Analyzer Service

This service analyzes deck content to determine the appropriate design style,
typography choices, layout patterns, and visual treatment.
"""

import logging
from typing import Dict, List, Optional, Tuple, Any
from pydantic import BaseModel
from models.requests import DeckOutline
from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL
from services.registry_fonts import RegistryFonts
import json

logger = logging.getLogger(__name__)

class DeckStyleProfile(BaseModel):
    """Represents the analyzed style profile for a deck"""
    # Primary characteristics
    deck_category: str  # e.g., "executive_presentation", "brand_guidelines", "educational", etc.
    formality_level: str  # "formal", "semi-formal", "casual", "playful"
    visual_density: str  # "minimal", "moderate", "rich", "data-heavy"
    
    # Typography recommendations
    typography_style: str  # "classic", "modern", "bold", "elegant", "technical", "creative"
    font_recommendations: Dict[str, List[str]]  # heading, body, accent fonts with multiple options
    size_guidance: Dict[str, str]  # "dramatic", "conservative", "variable"
    
    # Layout preferences
    layout_style: str  # "structured", "asymmetric", "centered", "magazine", "dashboard"
    content_treatment: str  # "cards", "flowing", "sections", "infographic"
    whitespace_preference: str  # "generous", "balanced", "compact"
    
    # Visual elements
    background_strategy: str  # "solid_colors", "subtle_gradients", "geometric_patterns", "strategic_images", "minimal"
    image_usage: str  # "hero_only", "supporting", "decorative", "data_viz", "none"
    visual_accents: List[str]  # ["shapes", "lines", "icons", "charts", "illustrations"]
    
    # Color mood
    color_mood: str  # "professional", "vibrant", "muted", "monochrome", "bold"
    contrast_preference: str  # "high", "medium", "subtle"
    
    # Specific recommendations
    design_principles: List[str]  # Key principles to follow
    avoid_elements: List[str]  # Things to avoid for this deck type
    special_considerations: List[str]  # Context-specific considerations


class DeckStyleAnalyzer:
    """Analyzes deck content to determine appropriate design style"""
    
    def __init__(self):
        self.model = COMPOSER_MODEL
    
    async def analyze_deck_style(self, deck_outline: DeckOutline, registry=None) -> DeckStyleProfile:
        """
        Analyze the deck outline to determine appropriate design style.
        Uses AI to interpret content and context rather than hardcoded rules.
        """
        # Get available fonts from registry
        available_fonts = RegistryFonts.get_available_fonts(registry)
        # Ensure Designer group is included if present in registry fallback
        if "Designer" in available_fonts:
            pass
        all_fonts_list = RegistryFonts.get_all_fonts_list(registry)
        
        # Prepare content summary
        content_summary = self._prepare_content_summary(deck_outline)
        
        # Handle style preferences safely to avoid format string issues
        style_prefs_str = "None specified"
        if deck_outline.stylePreferences:
            try:
                style_prefs_str = json.dumps(deck_outline.stylePreferences.model_dump(), indent=2)
            except Exception as e:
                logger.warning(f"Error serializing style preferences: {e}")
                style_prefs_str = str(deck_outline.stylePreferences.model_dump())
        
        # Build analysis prompt
        analysis_prompt = f"""
Analyze this presentation deck and determine the appropriate design style. 
DO NOT use hardcoded categories - interpret the content and context to understand what kind of deck this is.

DECK INFORMATION:
Title: {deck_outline.title}
Style Preferences: {style_prefs_str}

SLIDE CONTENT SUMMARY:
{content_summary}

Based on this analysis, determine:

1. DECK CATEGORY: What type of presentation is this? (Don't limit to predefined types - describe what you see)
   - Consider: Is it educational? Corporate? Creative? Technical? Marketing? Financial? 
   - Look for clues in the content, structure, and stated purpose

2. FORMALITY LEVEL: How formal should the design be?
   - Consider the audience, content tone, and purpose
   - Range from very formal to playful

3. VISUAL DENSITY: How much visual information should be on each slide?
   - Consider content complexity, audience expectations, and deck purpose
   - Range from minimal to data-heavy

4. TYPOGRAPHY STYLE: What font personality matches this content?
   - Classic: Traditional, timeless (Garamond, Georgia, Baskerville)
   - Modern: Clean, contemporary (Inter, Helvetica, Arial)
   - Bold: Strong, impactful (Montserrat, Bebas Neue, Oswald)
   - Elegant: Sophisticated, refined (Playfair Display, Didot, Bodoni)
   - Technical: Precise, data-focused (Space Grotesk, JetBrains Mono, Roboto Mono)
   - Creative: Unique, expressive (Bricolage Grotesque, Clash Display, DM Serif)

5. FONT RECOMMENDATIONS: Select 3-5 specific font names for each category FROM THE AVAILABLE FONTS ONLY:
   - Heading fonts: For titles and major headings
   - Body fonts: For content and descriptions
   - Accent fonts: For special emphasis or quotes
   
   AVAILABLE FONTS BY CATEGORY:
{json.dumps(available_fonts, indent=3)}
   
   IMPORTANT: You MUST ONLY choose fonts from the above list. Return actual font names as lists.
   Example format:
   - heading: ["Montserrat", "Raleway", "Oswald"]
   - body: ["Inter", "Roboto", "Source Sans Pro"]
   - accent: ["Playfair Display", "Merriweather", "Crimson Text"]

6. SIZE GUIDANCE:
   - Dramatic: Very large titles (80-150pt), high contrast in sizes
   - Conservative: Traditional sizing (40-60pt titles)
   - Variable: Different approaches for different slides

7. LAYOUT STYLE:
   - Structured: Grid-based, organized sections
   - Asymmetric: Dynamic, off-center compositions
   - Centered: Classic, balanced layouts
   - Magazine: Editorial-style with mixed layouts
   - Dashboard: Data-focused, widget-based

8. CONTENT TREATMENT:
   - Cards: Information in distinct containers
   - Flowing: Continuous, narrative style
   - Sections: Clear divisions between content areas
   - Infographic: Visual storytelling approach

9. BACKGROUND STRATEGY:
   - Solid colors: Clean, focused
   - Subtle gradients: Soft depth
   - Geometric patterns: Modern, structured
   - Strategic images: Only where they add significant value
   - Minimal: Almost no background elements

10. IMAGE USAGE:
    - Hero only: Just on title/section slides
    - Supporting: Images that reinforce content
    - Decorative: Aesthetic enhancement
    - Data viz: Charts and diagrams focus
    - None: Text and shapes only

11. DESIGN PRINCIPLES: 3-5 key principles for this specific deck

12. AVOID ELEMENTS: What would be inappropriate for this deck?

13. SPECIAL CONSIDERATIONS: Any context-specific design needs?

Provide thoughtful, nuanced recommendations based on the actual content and purpose, not generic templates.
"""
        
        try:
            client, model = get_client(self.model)
            
            response = invoke(
                client=client,
                model=model,
                response_model=DeckStyleProfile,
                messages=[
                    {"role": "system", "content": "You are an expert presentation designer who creates beautiful, context-appropriate slide designs."},
                    {"role": "user", "content": analysis_prompt}
                ],
                max_tokens=2000
            )
            
            logger.info(f"Deck style analysis complete: {response.deck_category} - {response.typography_style}")
            return response
            
        except Exception as e:
            logger.error(f"Error analyzing deck style: {e}")
            # Return sensible defaults
            return DeckStyleProfile(
                deck_category="general_presentation",
                formality_level="semi-formal",
                visual_density="moderate",
                typography_style="modern",
                font_recommendations={
                    "heading": ["Montserrat", "Inter", "Helvetica"],
                    "body": ["Inter", "Arial", "Helvetica"],
                    "accent": ["Playfair Display", "Georgia"]
                },
                size_guidance={"titles": "conservative", "body": "readable", "emphasis": "moderate"},
                layout_style="structured",
                content_treatment="flowing",
                whitespace_preference="balanced",
                background_strategy="minimal",
                image_usage="supporting",
                visual_accents=["shapes", "lines"],
                color_mood="professional",
                contrast_preference="medium",
                design_principles=[
                    "Maintain visual hierarchy",
                    "Ensure readability",
                    "Use consistent spacing"
                ],
                avoid_elements=["Cluttered layouts", "Too many fonts"],
                special_considerations=[]
            )
    
    def _prepare_content_summary(self, deck_outline: DeckOutline) -> str:
        """Prepare a summary of slide content for analysis"""
        summary_parts = []
        
        for i, slide in enumerate(deck_outline.slides[:10]):  # Analyze first 10 slides
            content_preview = slide.content[:200] + "..." if len(slide.content) > 200 else slide.content
            summary_parts.append(f"Slide {i+1} - {slide.title}: {content_preview}")
        
        if len(deck_outline.slides) > 10:
            summary_parts.append(f"... and {len(deck_outline.slides) - 10} more slides")
        
        return "\n".join(summary_parts)
    
    def get_font_pairing_suggestions(self, style_profile: DeckStyleProfile) -> List[Dict[str, str]]:
        """Generate specific font pairing suggestions based on the style profile"""
        suggestions = []
        
        # Create 3-5 complete font pairings
        for i in range(min(3, len(style_profile.font_recommendations.get("heading", [])))):
            heading_fonts = style_profile.font_recommendations.get("heading", ["Montserrat"])
            body_fonts = style_profile.font_recommendations.get("body", ["Inter"]) 
            accent_fonts = style_profile.font_recommendations.get("accent", [])
            
            pairing = {
                "name": f"Option {i+1}",
                "heading": heading_fonts[i] if i < len(heading_fonts) else heading_fonts[0],
                "body": body_fonts[i] if i < len(body_fonts) else body_fonts[0],
                "accent": accent_fonts[i] if i < len(accent_fonts) and accent_fonts else None,
                "description": self._get_pairing_description(style_profile.typography_style, i)
            }
            suggestions.append(pairing)
        
        return suggestions
    
    def _get_pairing_description(self, typography_style: str, index: int) -> str:
        """Get description for font pairing based on style"""
        descriptions = {
            "classic": ["Timeless and professional", "Traditional with modern touch", "Elegant and readable"],
            "modern": ["Clean and contemporary", "Minimalist and sharp", "Fresh and professional"],
            "bold": ["Strong and impactful", "Commanding presence", "Dynamic and energetic"],
            "elegant": ["Sophisticated and refined", "Luxurious feel", "Graceful and polished"],
            "technical": ["Precise and clear", "Data-friendly", "Systematic approach"],
            "creative": ["Unique personality", "Expressive and memorable", "Artistic flair"]
        }
        
        style_descriptions = descriptions.get(typography_style, ["Balanced and versatile"])
        return style_descriptions[index % len(style_descriptions)] 