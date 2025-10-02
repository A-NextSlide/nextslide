"""
Layout Integrator - Connects the structured layout system to existing slide generation.

This integrator:
1. Plugs into the existing SlideGeneratorV2 
2. Enhances prompts with structured layout guidance
3. Ensures consistent, non-overlapping designs
4. Maintains compatibility with current system
"""

import logging
from typing import Dict, List, Any, Optional
from dataclasses import dataclass

from agents.generation.structured_layout_engine import (
    StructuredLayoutEngine, DeckType, LayoutTemplate
)
from agents.generation.components.enhanced_prompt_builder import (
    EnhancedPromptBuilder, EnhancedSlideContext
)

logger = logging.getLogger(__name__)

class LayoutIntegrator:
    """Integrates structured layouts with existing slide generation"""
    
    def __init__(self):
        self.layout_engine = StructuredLayoutEngine()
        self.enhanced_prompt_builder = EnhancedPromptBuilder()
        logger.info("✅ LayoutIntegrator initialized")
    
    def enhance_slide_generation_context(self, 
                                       generation_context,
                                       rag_context: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance existing generation context with structured layout"""
        
        try:
            # Create enhanced context
            enhanced_context = self.enhanced_prompt_builder.build_context_from_generation_context(
                generation_context, rag_context
            )
            
            # Detect deck type
            enhanced_context.deck_type = self.layout_engine.detect_deck_type(
                generation_context.deck_outline, 
                {'slide_content': generation_context.slide_outline.content}
            )
            
            # Get appropriate template
            enhanced_context.layout_template = self.layout_engine.get_layout_template(
                enhanced_context.deck_type,
                generation_context.slide_index,
                generation_context.slide_outline.content,
                enhanced_context.is_title_slide
            )
            
            # Generate structured layout
            enhanced_context.layout_data = self.layout_engine.generate_structured_layout(
                enhanced_context.layout_template,
                generation_context.slide_outline,
                generation_context.theme.to_dict(),
                enhanced_context.predicted_components
            )
            
            # Return enhanced context data for integration
            return {
                'enhanced_context': enhanced_context,
                'deck_type': enhanced_context.deck_type.value,
                'template_name': enhanced_context.layout_template.name,
                'layout_zones': enhanced_context.layout_data.get('zones', {}),
                'suggested_components': enhanced_context.layout_template.suggested_components,
                'anti_overlap_applied': True
            }
            
        except Exception as e:
            logger.error(f"Failed to enhance generation context: {e}")
            # Return basic fallback
            return {
                'enhanced_context': None,
                'deck_type': 'business',
                'template_name': 'Business Standard',
                'layout_zones': {},
                'suggested_components': ['TiptapTextBlock', 'Image', 'Shape'],
                'anti_overlap_applied': False
            }
    
    def build_enhanced_prompt(self, 
                            generation_context,
                            rag_context: Dict[str, Any],
                            enhanced_data: Dict[str, Any]) -> str:
        """Build enhanced prompt with structured layout guidance"""
        
        enhanced_context = enhanced_data.get('enhanced_context')
        
        if enhanced_context:
            try:
                # Use enhanced prompt builder
                enhanced_prompt = self.enhanced_prompt_builder.build_enhanced_user_prompt(
                    enhanced_context, rag_context
                )
                
                logger.info(f"✅ Enhanced prompt generated: {len(enhanced_prompt)} chars, "
                           f"deck_type={enhanced_data.get('deck_type')}, "
                           f"template={enhanced_data.get('template_name')}")
                
                return enhanced_prompt
                
            except Exception as e:
                logger.error(f"Enhanced prompt generation failed: {e}")
        
        # Fallback to original prompt with basic enhancements
        return self._build_fallback_enhanced_prompt(generation_context, rag_context, enhanced_data)
    
    def _build_fallback_enhanced_prompt(self, 
                                      generation_context,
                                      rag_context: Dict[str, Any],
                                      enhanced_data: Dict[str, Any]) -> str:
        """Build fallback enhanced prompt if main enhancement fails"""
        
        # Import original builder
        from agents.generation.components.prompt_builder import SlidePromptBuilder
        original_builder = SlidePromptBuilder()
        
        # Get original prompt
        original_prompt = original_builder.build_user_prompt(generation_context, rag_context)
        
        # Add basic enhancements
        enhancements = [
            f"\n🎯 DETECTED DECK TYPE: {enhanced_data.get('deck_type', 'business').upper()}",
            f"📐 SUGGESTED TEMPLATE: {enhanced_data.get('template_name', 'Standard Layout')}",
            "",
            "🚫 CRITICAL ANTI-OVERLAP RULES:",
            "- Title at y: 60-120px",
            "- Main content starts at y: 280px minimum", 
            "- Minimum 40px gap between text components",
            "- Minimum 60px gap between text and shapes",
            "- Components must stay within 1920×1080 boundaries",
            "",
            "📏 PROFESSIONAL SPACING:",
            "- Text padding: 20px internal",
            "- Line height: 1.4 for multi-line text",
            "- Component margins: 40px+ between sections",
            ""
        ]
        
        enhanced_prompt = original_prompt + "\n".join(enhancements)
        
        logger.info(f"✅ Fallback enhanced prompt generated: {len(enhanced_prompt)} chars")
        return enhanced_prompt
    
    def post_process_generated_components(self, 
                                        components: List[Dict[str, Any]],
                                        enhanced_data: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Post-process generated components to ensure no overlaps"""
        
        if not components or not enhanced_data.get('anti_overlap_applied'):
            return components
        
        try:
            # Apply overlap prevention
            processed_components = self._fix_component_overlaps(components)
            
            # Validate against layout zones if available
            layout_zones = enhanced_data.get('layout_zones', {})
            if layout_zones:
                processed_components = self._validate_against_zones(processed_components, layout_zones)
            
            logger.info(f"✅ Post-processed {len(components)} components")
            return processed_components
            
        except Exception as e:
            logger.error(f"Component post-processing failed: {e}")
            return components
    
    def _fix_component_overlaps(self, components: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Fix overlapping components by adjusting positions"""
        
        if not components:
            return components
        
        # Sort by center Y position
        sorted_components = sorted(
            components,
            key=lambda c: c.get('props', {}).get('position', {}).get('y', 0)
        )
        
        adjusted_components = []
        min_gap = 40  # Minimum gap between components
        
        for i, component in enumerate(sorted_components):
            props = component.get('props', {})
            position = props.get('position', {})
            
            # Use top-left semantics for this pass
            x, y = position.get('x', 0), position.get('y', 0)
            width, height = props.get('width', 100), props.get('height', 50)
            
            # Check for overlaps with previous components
            for prev_comp in adjusted_components:
                prev_props = prev_comp.get('props', {})
                prev_pos = prev_props.get('position', {})
                prev_x, prev_y = prev_pos.get('x', 0), prev_pos.get('y', 0)
                prev_width = prev_props.get('width', 100)
                prev_height = prev_props.get('height', 50)
                
                # Check for overlap
                if (x < prev_x + prev_width and x + width > prev_x and
                    y < prev_y + prev_height and y + height > prev_y):
                    
                    # Adjust Y position to avoid overlap
                    # Move down using top-left semantics
                    new_y = prev_y + prev_height + min_gap
                    position['y'] = int(new_y)
                    logger.debug(f"Fixed overlap: moved component from y={y} to y={new_y}")
                    break
            
            adjusted_components.append(component)
        
        return adjusted_components
    
    def _validate_against_zones(self, 
                              components: List[Dict[str, Any]],
                              layout_zones: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Validate components against layout zones"""
        
        validated_components = []
        
        for component in components:
            props = component.get('props', {})
            position = props.get('position', {})
            
            x, y = position.get('x', 0), position.get('y', 0)
            width, height = props.get('width', 100), props.get('height', 50)
            
            # Check if component fits in any zone
            fits_in_zone = False
            
            for zone_name, zone_data in layout_zones.items():
                zone_bounds = zone_data.get('bounds', {})
                zone_x = zone_bounds.get('x', 0)
                zone_y = zone_bounds.get('y', 0)
                zone_width = zone_bounds.get('width', 1920)
                zone_height = zone_bounds.get('height', 1080)
                
                # Check if component fits in this zone (with some tolerance)
                # Using top-left bounds directly
                comp_left = x
                comp_top = y
                comp_right = x + width
                comp_bottom = y + height
                if (comp_left >= zone_x - 50 and comp_top >= zone_y - 50 and
                    comp_right <= zone_x + zone_width + 50 and
                    comp_bottom <= zone_y + zone_height + 50):
                    fits_in_zone = True
                    break
            
            # If component doesn't fit in any zone, adjust to fit in slide
            if not fits_in_zone:
                # Ensure component fits within slide boundaries
                # Clamp top-left into slide bounds
                CANVAS_W, CANVAS_H = 1920, 1080
                if x + width > CANVAS_W:
                    position['x'] = int(max(0, CANVAS_W - width))
                if y + height > CANVAS_H:
                    position['y'] = int(max(0, CANVAS_H - height))
                
                logger.debug(f"Adjusted component to fit in slide boundaries")
            
            validated_components.append(component)
        
        return validated_components
    
    def generate_layout_summary(self, enhanced_data: Dict[str, Any]) -> Dict[str, Any]:
        """Generate a summary of the applied layout"""
        
        return {
            'deck_type': enhanced_data.get('deck_type', 'unknown'),
            'template_name': enhanced_data.get('template_name', 'Unknown'),
            'zones_count': len(enhanced_data.get('layout_zones', {})),
            'suggested_components': enhanced_data.get('suggested_components', []),
            'anti_overlap_enabled': enhanced_data.get('anti_overlap_applied', False),
            'enhancement_status': 'success' if enhanced_data.get('enhanced_context') else 'fallback'
        }


class SlideGeneratorV2Enhanced:
    """Enhanced version of SlideGeneratorV2 with structured layout integration"""
    
    def __init__(self, original_generator, enable_structured_layouts: bool = True):
        self.original_generator = original_generator
        self.layout_integrator = LayoutIntegrator() if enable_structured_layouts else None
        self.structured_layouts_enabled = enable_structured_layouts
        
        logger.info(f"✅ SlideGeneratorV2Enhanced initialized, "
                   f"structured_layouts={'enabled' if enable_structured_layouts else 'disabled'}")
    
    async def generate_slide(self, context):
        """Enhanced slide generation with structured layouts"""
        
        # Use original generator as base, but enhance the process
        async for event in self.original_generator.generate_slide(context):
            
            # Intercept and enhance certain steps
            if event.get('type') == 'slide_substep' and event.get('substep') == 'preparing_context':
                
                if self.structured_layouts_enabled:
                    # Add structured layout context
                    enhanced_event = event.copy()
                    enhanced_event['message'] = f"Applying structured layout for slide {context.slide_index + 1}"
                    yield enhanced_event
                    
                    # Log the enhancement
                    logger.info(f"🏗️  Applied structured layout to slide {context.slide_index + 1}")
                else:
                    yield event
            else:
                yield event
    
    def enhance_context_if_enabled(self, generation_context, rag_context: Dict[str, Any]) -> Dict[str, Any]:
        """Enhance context if structured layouts are enabled"""
        
        if not self.structured_layouts_enabled or not self.layout_integrator:
            return {
                'enhanced_context': None,
                'deck_type': 'business',
                'template_name': 'Standard',
                'anti_overlap_applied': False
            }
        
        return self.layout_integrator.enhance_slide_generation_context(
            generation_context, rag_context
        )
    
    def build_enhanced_prompt_if_enabled(self, 
                                       generation_context,
                                       rag_context: Dict[str, Any]) -> str:
        """Build enhanced prompt if structured layouts are enabled"""
        
        if not self.structured_layouts_enabled or not self.layout_integrator:
            # Fall back to original prompt builder
            from agents.generation.components.prompt_builder import SlidePromptBuilder
            original_builder = SlidePromptBuilder()
            return original_builder.build_user_prompt(generation_context, rag_context)
        
        # Use enhanced context
        enhanced_data = self.enhance_context_if_enabled(generation_context, rag_context)
        return self.layout_integrator.build_enhanced_prompt(
            generation_context, rag_context, enhanced_data
        )


def create_enhanced_slide_generator(original_generator, enable_structured_layouts: bool = True):
    """Factory function to create enhanced slide generator"""
    
    return SlideGeneratorV2Enhanced(original_generator, enable_structured_layouts)