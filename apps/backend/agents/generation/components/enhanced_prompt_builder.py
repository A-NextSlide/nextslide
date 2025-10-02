"""
Enhanced Prompt Builder with Structured Layout Integration

This builder:
1. Integrates with the structured layout engine
2. Provides deck-type specific prompts
3. Enforces consistent spacing and positioning
4. Prevents overlap issues through intelligent guidance
"""

import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass
import json

from agents.generation.structured_layout_engine import (
    StructuredLayoutEngine, DeckType, LayoutTemplate, LayoutPattern
)
from agents.generation.components.prompt_builder import SlidePromptBuilder

logger = logging.getLogger(__name__)

@dataclass
class EnhancedSlideContext:
    """Enhanced context with structured layout information"""
    slide_outline: Any
    slide_index: int
    deck_outline: Any
    theme: Dict[str, Any]
    deck_type: DeckType
    layout_template: LayoutTemplate
    layout_data: Dict[str, Any]
    predicted_components: List[str]
    is_title_slide: bool = False
    is_comparison_slide: bool = False
    has_repeated_structure: bool = False

class EnhancedPromptBuilder(SlidePromptBuilder):
    """Enhanced prompt builder with structured layout support"""
    
    def __init__(self):
        super().__init__()
        self.layout_engine = StructuredLayoutEngine()
        self.deck_type_prompts = self._initialize_deck_type_prompts()
    
    def build_enhanced_user_prompt(self, context: EnhancedSlideContext, rag_context: Dict[str, Any]) -> str:
        """Build user prompt with structured layout guidance"""
        
        # Detect deck type if not provided
        if not context.deck_type:
            context.deck_type = self.layout_engine.detect_deck_type(
                context.deck_outline, {'slide_content': context.slide_outline.content}
            )
        
        # Get appropriate template
        if not context.layout_template:
            context.layout_template = self.layout_engine.get_layout_template(
                context.deck_type, context.slide_index, 
                context.slide_outline.content, context.is_title_slide
            )
        
        # Generate structured layout
        if not context.layout_data:
            context.layout_data = self.layout_engine.generate_structured_layout(
                context.layout_template, context.slide_outline, 
                context.theme, context.predicted_components
            )
        
        # Build prompt sections
        prompt_sections = []
        
        # Add deck-specific context
        prompt_sections.extend(self._build_deck_type_guidance(context))
        
        # Add layout structure guidance  
        prompt_sections.extend(self._build_layout_structure_guidance(context))
        
        # Add anti-overlap rules
        prompt_sections.extend(self._build_anti_overlap_rules(context))
        
        # Add spacing and positioning guidance
        prompt_sections.extend(self._build_spacing_guidance(context))
        
        # Add consistency rules for repeated structures
        if context.has_repeated_structure:
            prompt_sections.extend(self._build_consistency_rules(context))
        
        # Add theme integration
        prompt_sections.extend(self._build_theme_integration(context))
        
        # Add final component requirements
        prompt_sections.extend(self._build_component_requirements(context, rag_context))
        
        return "\n".join(prompt_sections)
    
    def _build_deck_type_guidance(self, context: EnhancedSlideContext) -> List[str]:
        """Build deck-type specific design guidance"""
        
        deck_type = context.deck_type
        guidance = [
            f"\n🎯 DECK TYPE: {deck_type.value.upper()}",
            f"Template: {context.layout_template.name}",
            ""
        ]
        
        # Add deck-specific guidance
        if deck_type in self.deck_type_prompts:
            guidance.extend(self.deck_type_prompts[deck_type])
        
        return guidance
    
    def _build_layout_structure_guidance(self, context: EnhancedSlideContext) -> List[str]:
        """Build layout structure guidance from template"""
        
        template = context.layout_template
        layout_data = context.layout_data
        
        guidance = [
            f"\n📐 LAYOUT STRUCTURE - {template.name.upper()}:",
            f"Description: {template.description}",
            ""
        ]
        
        # Add zone information
        if layout_data.get('zones'):
            guidance.append("ZONES DEFINED:")
            for zone_name, zone_info in layout_data['zones'].items():
                bounds = zone_info['bounds']
                guidance.append(
                    f"  - {zone_name}: x={bounds['x']}, y={bounds['y']}, "
                    f"w={bounds['width']}, h={bounds['height']}"
                )
            guidance.append("")
        
        # Add suggested components
        if template.suggested_components:
            guidance.append("SUGGESTED COMPONENTS:")
            for comp in template.suggested_components:
                guidance.append(f"  - {comp}")
            guidance.append("")
        
        # Team gallery specific structure cue for logos under names
        try:
            title_text = getattr(context.slide_outline, 'title', '') or ''
            content_text = getattr(context.slide_outline, 'content', '') or ''
            if any(k in f"{title_text} {content_text}".lower() for k in ['team', 'about us', 'who we are', 'speakers', 'speaker', 'bios', 'headshot']):
                guidance.extend([
                    "TEAM CARD STRUCTURE:",
                    "- 3-column grid of square headshots (borderRadius: 999)",
                    "- Under each image: stack lines for Name, Title, Description",
                    "- Leave a small row directly under Name to place brand logos (as Image components with objectFit 'contain')",
                    "- Use 'src': 'placeholder' for both headshots and logos; system fills actual URLs later",
                    ""
                ])
        except Exception:
            pass
        
        return guidance
    
    def _build_anti_overlap_rules(self, context: EnhancedSlideContext) -> List[str]:
        """Build comprehensive anti-overlap rules"""
        
        return [
            "\n🚫 ANTI-OVERLAP RULES (CRITICAL):",
            "",
            "POSITIONING HIERARCHY (top to bottom):",
            "1. Title/Header (y: 60-120)",
            "2. Subtitle (y: 180-240) - ONLY if title height + 40px gap",
            "3. Main content (y: 280+) - NEVER above 280px",
            "4. Secondary content (y: 450+)",
            "5. Footer/Actions (y: 950+)",
            "",
            "SPACING REQUIREMENTS:",
            "- Text to Text: minimum 40px vertical gap",
            "- Text to Shape: minimum 60px gap",
            "- Text to Chart: minimum 80px gap", 
            "- Shape to Shape: minimum 60px gap",
            "- Component edges to slide edges: minimum 80px",
            "",
            "OVERLAP PREVENTION:",
            "- Calculate component height BEFORE positioning",
            "- Use y = previousComponent.y + previousComponent.height + gap",
            "- Text height = (estimatedLines × fontSize × 1.4) + padding",
            "- NEVER hardcode y positions without considering above components",
            "",
            "CRITICAL VIOLATIONS TO AVOID:",
            "- Text overlapping shapes (especially circles)",
            "- Charts overlapping titles or text", 
            "- Components extending beyond slide boundaries",
            "- Multiple components at same Y position without horizontal separation",
            ""
        ]
    
    def _build_spacing_guidance(self, context: EnhancedSlideContext) -> List[str]:
        """Build detailed spacing guidance"""
        
        deck_type = context.deck_type
        
        # Adjust spacing based on deck type
        if deck_type == DeckType.BUSINESS:
            spacing_style = "professional"
            title_size = "52-64px"
            body_size = "16-18px"
        elif deck_type == DeckType.EDUCATIONAL:
            spacing_style = "generous"
            title_size = "48-60px"
            body_size = "18-20px"
        elif deck_type == DeckType.CREATIVE:
            spacing_style = "dynamic"
            title_size = "60-80px"
            body_size = "16-18px"
        else:
            spacing_style = "balanced"
            title_size = "48-64px"
            body_size = "16-18px"
        
        # Helper to derive caption size range from body_size (robust to 'px' suffix)
        def _caption_range_from_body(sz: str) -> str:
            try:
                # Accept formats like '16-18px' or '16-18' or single '18px'
                import re
                nums = [int(n) for n in re.findall(r"\d+", str(sz))]
                if not nums:
                    return "14-16px"
                if len(nums) == 1:
                    b = max(8, nums[0] - 2)
                    return f"{b}px"
                lo, hi = nums[0], nums[1]
                return f"{max(8, lo-2)}-{max(8, hi-2)}px"
            except Exception:
                return "14-16px"

        return [
            f"\n📏 SPACING GUIDANCE - {spacing_style.upper()} STYLE:",
            "",
            "TYPOGRAPHY SIZING:",
            f"- Titles: {title_size}, bold weight",
            f"- Body text: {body_size}, regular weight",
            f"- Captions: {_caption_range_from_body(body_size)}",
            "",
            "TEXT BLOCK PADDING:",
            "- Content blocks: 20px internal padding",
            "- Card components: 24px internal padding", 
            "- Tight layouts: 16px internal padding",
            "",
            "LINE HEIGHT RULES:",
            "- Single line text: 1.2",
            "- 2-3 lines: 1.4",
            "- 4+ lines (paragraphs): 1.5",
            "",
            "WHITESPACE DISTRIBUTION:",
            "- Around titles: generous (60px+)",
            "- Between sections: moderate (40px+)",
            "- Within content: balanced (20px+)",
            ""
        ]
    
    def _build_consistency_rules(self, context: EnhancedSlideContext) -> List[str]:
        """Build rules for repeated structures across slides"""
        
        return [
            "\n🔄 CONSISTENCY RULES (REPEATED STRUCTURES):",
            "",
            "TEMPLATE ADHERENCE:",
            f"- This slide MUST follow the {context.layout_template.name} template",
            "- Use identical zone positions as defined above",
            "- Maintain consistent spacing between similar slides",
            "",
            "PATTERN CONSISTENCY:",
            "- If slide 2 used 'text left, image right', slide 3 should alternate or repeat",
            "- Comparison slides should use identical left/right structure",
            "- Process slides should follow same step layout pattern",
            "",
            "VISUAL RHYTHM:",
            "- Alternate layouts every 2-3 slides for visual interest",
            "- Keep consistent element sizes (title heights, image dimensions)",
            "- Use same color patterns for similar content types",
            "",
            "STRUCTURE INHERITANCE:",
            "- Titles should appear in same position across similar slides",
            "- Navigation/progress elements in consistent locations",
            "- Visual hierarchy maintained throughout deck",
            ""
        ]
    
    def _build_theme_integration(self, context: EnhancedSlideContext) -> List[str]:
        """Build theme integration guidance"""
        
        theme = context.theme
        color_palette = theme.get('color_palette', {})
        typography = theme.get('typography', {})
        
        guidance = [
            "\n🎨 THEME INTEGRATION:",
            "",
            "COLOR APPLICATION:",
        ]
        
        if color_palette:
            guidance.extend([
                f"- Primary background: {color_palette.get('primary_background', '#FFFFFF')}",
                f"- Secondary background: {color_palette.get('secondary_background', '#F8F9FA')}",
                f"- Accent 1: {color_palette.get('accent_1', '#3182CE')} (buttons, highlights)",
                f"- Accent 2: {color_palette.get('accent_2', '#38B2AC')} (secondary actions)",
                f"- Text primary: {color_palette.get('text_colors', {}).get('primary', '#1A202C')}",
            ])
        
        guidance.append("")
        
        if typography:
            hero_font = typography.get('hero_title', {}).get('family', 'Montserrat')
            body_font = typography.get('body_text', {}).get('family', 'Inter')
            
            guidance.extend([
                "TYPOGRAPHY APPLICATION:",
                f"- Hero/Title font: {hero_font}",
                f"- Body/Content font: {body_font}",
                f"- Maintain font consistency across similar elements",
                ""
            ])
        
        guidance.extend([
            "VISUAL STYLE:",
            f"- Background style: {theme.get('visual_style', {}).get('background_style', 'solid')}",
            "- Apply theme colors to shapes, borders, and accents",
            "- Use theme gradients for backgrounds when appropriate",
            ""
        ])
        
        return guidance
    
    def _build_component_requirements(self, context: EnhancedSlideContext, rag_context: Dict[str, Any]) -> List[str]:
        """Build component-specific requirements"""
        
        predicted = context.predicted_components
        guidance = [
            "\n🧩 COMPONENT REQUIREMENTS:",
            ""
        ]
        
        # Add component-specific guidance based on predictions
        if "TiptapTextBlock" in predicted:
            guidance.extend([
                "TIPTAP TEXT BLOCKS:",
                "- Use for ALL text content (not TextBlock)",
                "- Set proper alignment and verticalAlignment",
                "- Calculate height based on content length",
                "- Use texts array with fontSize, fontWeight, color",
                ""
            ])
        
        if "Image" in predicted:
            guidance.extend([
                "IMAGE COMPONENTS:",
                "- Always use src: 'placeholder' (never generate URLs)",
                "- Set appropriate objectFit: 'cover' or 'contain'",
                "- Add borderRadius for modern look (8px)",
                "- Ensure images don't exceed zone boundaries",
                ""
            ])

        # Team/Roadmap specific guidance: image galleries with captions
        slide_text = f"{getattr(context.slide_outline, 'title', '')} {getattr(context.slide_outline, 'content', '')}".lower()
        if any(k in slide_text for k in ['team', 'about us', 'who we are', 'speakers', 'speaker', 'bios', 'headshot']):
            guidance.extend([
                "TEAM CARDS (ONE PERSON PER BLOCK):",
                "- Use a 3-column grid of square headshots (borderRadius: 999)",
                "- BELOW each headshot, create a stacked caption with 3 lines: Name, Title, Description",
                "- Leave space to optionally place brand logos UNDER the name line (use Image components with objectFit 'contain')",
                "- Keep image containers square for perfect circle masks (width == height)",
                "- Use theme accent for a thin image border and subtle background shape",
                ""
            ])
        if any(k in slide_text for k in ['roadmap', 'timeline', 'phases', 'milestones', 'journey', 'stages']):
            guidance.extend([
                "ROADMAP GALLERY (THUMBNAILS WITH CAPTIONS):",
                "- Use 4 horizontal thumbnails with rounded corners",
                "- Add a short phase/milestone caption under each thumbnail",
                "- Maintain equal spacing and align captions center",
                "- Prefer objectFit: 'cover' for consistent visual weight",
                ""
            ])
        
        if "Shape" in predicted:
            guidance.extend([
                "SHAPE COMPONENTS:",
                "- Use for backgrounds, dividers, decorative elements",
                "- Position behind text (lower zIndex)",
                "- Avoid overlapping text content areas",
                "- Use theme colors with appropriate opacity",
                ""
            ])
        
        if "Chart" in predicted:
            guidance.extend([
                "CHART COMPONENTS:",
                "- Minimum size: 800×600px",
                "- Position with 80px gap from other components",
                "- Use actual data from slide content",
                "- Set showLegend: false for cleaner look",
                "- Rotate bottom axis labels 30–45° when names are long to avoid overlap/cropping",
                "- Axis config: set axisBottom.tickRotation and increase margins.bottom as needed",
                "  (Highcharts: use xAxis.labels.rotation or autoRotation; adjust chart.marginBottom)",
                ""
            ])
        
        # Add RAG context integration
        if rag_context.get('design_patterns'):
            guidance.extend([
                "RAG DESIGN PATTERNS:",
                f"- Apply patterns: {', '.join(rag_context['design_patterns'][:3])}",
                ""
            ])
        
        guidance.extend([
            "FINAL VALIDATION:",
            "- Ensure all components fit within slide boundaries (1920×1080)",
            "- Verify no overlapping components",
            "- Check text readability and contrast",
            "- Confirm layout matches template structure",
            ""
        ])
        
        return guidance
    
    def _initialize_deck_type_prompts(self) -> Dict[DeckType, List[str]]:
        """Initialize deck-type specific prompt guidance"""
        
        return {
            DeckType.BUSINESS: [
                "BUSINESS DECK CHARACTERISTICS:",
                "- Professional, clean layout with clear hierarchy",
                "- Conservative color palette with strategic accent use",
                "- Data-driven content with supporting visuals",
                "- Minimal decorative elements, focus on content clarity",
                "- Consistent alignment and structured grid usage",
                ""
            ],
            
            DeckType.EDUCATIONAL: [
                "EDUCATIONAL DECK CHARACTERISTICS:",
                "- Clear, step-by-step information presentation",
                "- Generous whitespace for better readability",
                "- Icons and visual aids to support learning",
                "- Friendly, approachable color scheme",
                "- Logical flow with visual progress indicators",
                ""
            ],
            
            DeckType.CREATIVE: [
                "CREATIVE DECK CHARACTERISTICS:",
                "- Dynamic, asymmetric layouts for visual interest",
                "- Bold typography and vibrant color combinations",
                "- Artistic shapes and creative visual elements",
                "- Overlapping elements for layered design (when non-conflicting)",
                "- Expressive use of whitespace and negative space",
                ""
            ],
            
            DeckType.TECHNICAL: [
                "TECHNICAL DECK CHARACTERISTICS:",
                "- Structured, logical layout emphasizing information hierarchy",
                "- Monospace or technical fonts for code/data",
                "- Diagrams, charts, and process flows",
                "- High contrast for readability",
                "- Clean, minimal aesthetic focusing on content",
                ""
            ],
            
            DeckType.COMPARISON: [
                "COMPARISON DECK CHARACTERISTICS:",
                "- Split-screen or side-by-side layouts",
                "- Identical structure on both sides for fair comparison",
                "- Clear visual separators (lines, spacing)",
                "- Consistent formatting for comparable elements",
                "- Highlight differences with color or emphasis",
                ""
            ],
            
            DeckType.DATA_HEAVY: [
                "DATA-HEAVY DECK CHARACTERISTICS:",
                "- Large, prominent charts and visualizations",
                "- Minimal text, maximum data visibility",
                "- Dashboard-style layout with multiple data points",
                "- High contrast for data readability",
                "- Strategic use of color to highlight key metrics",
                ""
            ],
            
            DeckType.NARRATIVE: [
                "NARRATIVE DECK CHARACTERISTICS:",
                "- Story-driven layout that guides the viewer",
                "- Visual flow that supports the narrative arc",
                "- Consistent visual theme throughout story",
                "- Hero images and emotional visual elements",
                "- Progressive revelation of information",
                ""
            ]
        }
    
    def detect_repeated_structure_needs(self, deck_outline: Any, current_slide_index: int) -> bool:
        """Detect if current slide should use repeated structure"""
        
        if not hasattr(deck_outline, 'slides') or len(deck_outline.slides) < 2:
            return False
        
        current_slide = deck_outline.slides[current_slide_index]
        current_content = getattr(current_slide, 'content', '').lower()
        
        # Check for comparison patterns
        if any(word in current_content for word in ['vs', 'versus', 'compare', 'option a', 'option b']):
            return True
        
        # Check for process/step patterns
        if any(word in current_content for word in ['step', 'phase', 'stage', 'process']):
            # Look for similar patterns in other slides
            similar_count = 0
            for other_slide in deck_outline.slides:
                other_content = getattr(other_slide, 'content', '').lower()
                if any(word in other_content for word in ['step', 'phase', 'stage', 'process']):
                    similar_count += 1
            return similar_count >= 2
        
        # Check for feature/benefit patterns
        if any(word in current_content for word in ['feature', 'benefit', 'advantage', 'capability']):
            similar_count = 0
            for other_slide in deck_outline.slides:
                other_content = getattr(other_slide, 'content', '').lower()
                if any(word in other_content for word in ['feature', 'benefit', 'advantage', 'capability']):
                    similar_count += 1
            return similar_count >= 2
        
        return False
    
    def build_context_from_generation_context(self, generation_context, rag_context: Dict[str, Any]) -> EnhancedSlideContext:
        """Build enhanced context from existing generation context"""
        
        # Detect if this is a title slide
        is_title_slide = (
            generation_context.slide_index == 0 or 
            'title' in getattr(generation_context.slide_outline, 'title', '').lower()
        )
        
        # Detect repeated structure needs
        has_repeated_structure = self.detect_repeated_structure_needs(
            generation_context.deck_outline, generation_context.slide_index
        )
        
        # Detect comparison slide
        slide_content = getattr(generation_context.slide_outline, 'content', '').lower()
        is_comparison_slide = any(word in slide_content for word in ['vs', 'versus', 'compare', 'comparison'])
        
        # Get predicted components from RAG
        predicted_components = rag_context.get('predicted_components', ['TiptapTextBlock', 'Image', 'Shape'])
        
        return EnhancedSlideContext(
            slide_outline=generation_context.slide_outline,
            slide_index=generation_context.slide_index,
            deck_outline=generation_context.deck_outline,
            theme=generation_context.theme.to_dict(),
            deck_type=None,  # Will be detected
            layout_template=None,  # Will be selected
            layout_data=None,  # Will be generated
            predicted_components=predicted_components,
            is_title_slide=is_title_slide,
            is_comparison_slide=is_comparison_slide,
            has_repeated_structure=has_repeated_structure
        )