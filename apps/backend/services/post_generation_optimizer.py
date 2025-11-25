"""
Post-Generation Optimizer
Optimizes text components after chat agent generation to fit perfectly in their containers.

This service runs after the AI generates slide content and:
1. Optimizes font sizes to fit perfectly in component boxes
2. Adjusts positions if needed to prevent overflow
3. Ensures text doesn't exceed container boundaries
4. Maintains visual hierarchy and readability
"""

import logging
from typing import Dict, Any, List, Tuple, Optional
from dataclasses import dataclass
from services.adaptive_font_sizer import AdaptiveFontSizer, SizingResult
from services.font_metrics_service import font_metrics_service

logger = logging.getLogger(__name__)


@dataclass
class OptimizationResult:
    """Result of text optimization"""
    component_index: int
    component_type: str
    original_font_size: float
    optimized_font_size: float
    original_position: Tuple[int, int]
    optimized_position: Tuple[int, int]
    position_adjusted: bool
    size_adjusted: bool
    fits_in_container: bool
    confidence: float


class PostGenerationOptimizer:
    """
    Optimizes text components after AI generation to ensure perfect fitting.
    
    This service is called after the chat agent generates slides to:
    - Calculate optimal font sizes that fit perfectly in containers
    - Adjust text positions to prevent overflow
    - Ensure all text is readable and within bounds
    """
    
    def __init__(self):
        self.font_sizer = AdaptiveFontSizer(font_metrics_service)
        logger.info("✅ PostGenerationOptimizer initialized")
    
    def optimize_slide(
        self,
        slide_data: Dict[str, Any],
        slide_index: int = 0
    ) -> Tuple[Dict[str, Any], List[OptimizationResult]]:
        """
        Optimize all text components in a slide for perfect fitting.
        
        Args:
            slide_data: Complete slide data with components
            slide_index: Slide index for logging
            
        Returns:
            Tuple of (optimized_slide_data, optimization_results)
        """
        logger.info(f"🎨 [FONT OPTIMIZER] Starting optimization for slide {slide_index + 1}")
        
        components = slide_data.get('components', [])
        if not components:
            logger.warning(f"⚠️ [FONT OPTIMIZER] No components found in slide {slide_index + 1}")
            return slide_data, []
        
        optimization_results = []
        optimized_count = 0
        
        for idx, component in enumerate(components):
            comp_type = component.get('type', '')
            
            # Only optimize text components
            if comp_type not in ['TiptapTextBlock', 'TextBlock', 'Title', 'Subtitle', 'Heading', 'Shape']:
                continue
            
            # Skip shapes without text
            if comp_type == 'Shape' and not component.get('props', {}).get('hasText'):
                continue
            
            # Optimize this component
            result = self._optimize_text_component(component, idx)
            
            if result:
                optimization_results.append(result)
                if result.size_adjusted or result.position_adjusted:
                    optimized_count += 1
                
                # Log the optimization
                if result.size_adjusted:
                    logger.info(
                        f"  📏 [{comp_type}] Component {idx}: "
                        f"Font {result.original_font_size:.1f}px → {result.optimized_font_size:.1f}px "
                        f"(confidence: {result.confidence:.2f})"
                    )
                
                if result.position_adjusted:
                    logger.info(
                        f"  📍 [{comp_type}] Component {idx}: "
                        f"Position {result.original_position} → {result.optimized_position}"
                    )
        
        logger.info(
            f"✅ [FONT OPTIMIZER] Optimized {optimized_count}/{len(components)} components in slide {slide_index + 1}"
        )
        
        return slide_data, optimization_results
    
    def _optimize_text_component(
        self,
        component: Dict[str, Any],
        component_index: int
    ) -> Optional[OptimizationResult]:
        """
        Optimize a single text component for perfect fitting.
        
        Returns:
            OptimizationResult if optimization was performed, None otherwise
        """
        try:
            comp_type = component.get('type', '')
            props = component.get('props', {})
            
            # Extract text content
            text_content = self._extract_text_content(props, comp_type)
            if not text_content or not text_content.strip():
                return None
            
            # Get container dimensions - ensure they are numeric
            width = props.get('width')
            height = props.get('height')

            # Convert to float, handling None and non-numeric values
            try:
                width = float(width) if width is not None else 0
                height = float(height) if height is not None else 0
            except (TypeError, ValueError):
                logger.debug(f"  ⚠️ Component {component_index} has invalid dimensions: {width}x{height}")
                return None

            if width <= 0 or height <= 0:
                logger.debug(f"  ⚠️ Component {component_index} missing dimensions: {width}x{height}")
                return None

            # Get current font size and position
            original_font_size = self._get_current_font_size(props, comp_type)
            original_position = self._get_position(props)

            # Calculate padding - ensure numeric
            padding_x, padding_y = self._get_padding(props, comp_type)
            padding_x = float(padding_x) if padding_x is not None else 0
            padding_y = float(padding_y) if padding_y is not None else 0

            # Get letter spacing - ensure numeric (can be None explicitly)
            letter_spacing = props.get('letterSpacing') or 0
            try:
                letter_spacing = float(letter_spacing)
            except (TypeError, ValueError):
                letter_spacing = 0
            
            # Calculate optimal font size - use original as max to only REDUCE, never increase
            sizing_result = self.font_sizer.find_optimal_size(
                text=text_content,
                container_width=width,
                container_height=height,
                font_family=props.get('fontFamily', 'Inter'),
                padding_x=padding_x,
                padding_y=padding_y,
                letter_spacing=letter_spacing,
                max_size=original_font_size  # Never increase beyond AI-generated size
            )

            # Apply optimized font size only if it was REDUCED (text didn't fit)
            optimized_font_size = sizing_result.font_size
            size_reduced = original_font_size - optimized_font_size > 0.5  # Only track reductions

            if size_reduced:
                self._apply_font_size(component, sizing_result, comp_type)
            else:
                # Text already fits at original size, no change needed
                optimized_font_size = original_font_size
            
            # Check if position needs adjustment
            optimized_position, position_adjusted = self._optimize_position(
                component, width, height, original_position
            )
            
            # Create optimization result
            result = OptimizationResult(
                component_index=component_index,
                component_type=comp_type,
                original_font_size=original_font_size,
                optimized_font_size=optimized_font_size,
                original_position=original_position,
                optimized_position=optimized_position,
                position_adjusted=position_adjusted,
                size_adjusted=size_reduced,
                fits_in_container=sizing_result.fits,
                confidence=sizing_result.confidence
            )
            
            return result
            
        except Exception as e:
            logger.warning(f"⚠️ Failed to optimize component {component_index}: {e}")
            return None
    
    def _extract_text_content(self, props: Dict[str, Any], comp_type: str) -> str:
        """Extract text content from component props"""
        text_content = ""
        
        # Rich text components (TiptapTextBlock, etc.)
        if 'texts' in props and isinstance(props['texts'], list):
            text_content = ' '.join([
                t.get('text', '') for t in props['texts'] if isinstance(t, dict)
            ])
        # Plain text components
        elif 'text' in props:
            text_content = props.get('text', '')
        # Shape with text
        elif comp_type == 'Shape' and props.get('hasText'):
            shape_texts = props.get('texts', [])
            if isinstance(shape_texts, list):
                text_content = ' '.join([
                    t.get('text', '') for t in shape_texts if isinstance(t, dict)
                ])
        
        return text_content
    
    def _get_current_font_size(self, props: Dict[str, Any], comp_type: str) -> float:
        """Get current font size from component"""
        # Try direct fontSize prop
        font_size = props.get('fontSize')
        if font_size is not None:
            try:
                return float(font_size)
            except (TypeError, ValueError):
                pass

        # Try from texts array
        if 'texts' in props and isinstance(props['texts'], list) and len(props['texts']) > 0:
            first_text = props['texts'][0]
            if isinstance(first_text, dict):
                text_font_size = first_text.get('fontSize')
                if text_font_size is not None:
                    try:
                        return float(text_font_size)
                    except (TypeError, ValueError):
                        pass

        # Default
        return 16.0
    
    def _get_position(self, props: Dict[str, Any]) -> Tuple[int, int]:
        """Get current position from component"""
        position = props.get('position', {})
        x = int(position.get('x', 0))
        y = int(position.get('y', 0))
        return (x, y)
    
    def _get_padding(self, props: Dict[str, Any], comp_type: str) -> Tuple[float, float]:
        """Get padding for component"""
        if comp_type == 'Shape' and props.get('hasText'):
            # Shape uses textPadding
            text_padding = props.get('textPadding', 16)
            return (text_padding, text_padding)
        else:
            # Regular text components
            padding_x = props.get('paddingX') or props.get('padding', 10)
            padding_y = props.get('paddingY') or props.get('padding', 5)
            return (padding_x, padding_y)
    
    def _apply_font_size(
        self,
        component: Dict[str, Any],
        sizing_result: SizingResult,
        comp_type: str
    ) -> None:
        """Apply optimized font size to component"""
        props = component.get('props', {})
        optimized_size = sizing_result.font_size
        
        # Set main fontSize
        props['fontSize'] = optimized_size
        
        # Set min/max to lock the size
        props['fontSizeMin'] = optimized_size
        props['fontSizeMax'] = optimized_size
        
        # Always use 1.2 line height for consistent fitting
        props['lineHeight'] = 1.2
        
        # Update texts array if present
        if 'texts' in props and isinstance(props['texts'], list):
            for text_segment in props['texts']:
                if isinstance(text_segment, dict):
                    # Preserve relative sizing for emphasized text
                    # Note: fontSize can be None explicitly, so use 'or' not just .get() default
                    current_size = text_segment.get('fontSize') or optimized_size
                    if current_size > optimized_size * 1.3:
                        # Keep emphasis but scale proportionally
                        text_segment['fontSize'] = optimized_size * 1.2
                    else:
                        text_segment['fontSize'] = optimized_size
        
        # Add metadata
        metadata = props.setdefault('metadata', {})
        metadata.update({
            'fontOptimized': True,
            'optimizedSize': optimized_size,
            'estimatedLines': sizing_result.estimated_lines,
            'fitConfidence': sizing_result.confidence,
            'fitsInContainer': sizing_result.fits
        })
        
        component['props'] = props
    
    def _optimize_position(
        self,
        component: Dict[str, Any],
        width: float,
        height: float,
        original_position: Tuple[int, int]
    ) -> Tuple[Tuple[int, int], bool]:
        """
        Optimize component position to ensure it fits within canvas bounds.
        
        Returns:
            Tuple of (optimized_position, was_adjusted)
        """
        CANVAS_WIDTH = 1920
        CANVAS_HEIGHT = 1080
        MARGIN = 80  # Minimum margin from edges
        
        x, y = original_position
        adjusted = False
        
        # Check if component exceeds right edge
        if x + width > CANVAS_WIDTH - MARGIN:
            new_x = max(MARGIN, CANVAS_WIDTH - MARGIN - width)
            if abs(new_x - x) > 5:  # Only adjust if significant
                x = int(new_x)
                adjusted = True
        
        # Check if component exceeds bottom edge
        if y + height > CANVAS_HEIGHT - MARGIN:
            new_y = max(MARGIN, CANVAS_HEIGHT - MARGIN - height)
            if abs(new_y - y) > 5:  # Only adjust if significant
                y = int(new_y)
                adjusted = True
        
        # Check if component is too close to left edge
        if x < MARGIN:
            x = MARGIN
            adjusted = True
        
        # Check if component is too close to top edge
        if y < MARGIN:
            y = MARGIN
            adjusted = True
        
        # Apply adjusted position if changed
        if adjusted:
            props = component.get('props', {})
            position = props.setdefault('position', {})
            position['x'] = x
            position['y'] = y
            props['position'] = position
            component['props'] = props
        
        return ((x, y), adjusted)
    
    def batch_optimize_slides(
        self,
        slides: List[Dict[str, Any]]
    ) -> Tuple[List[Dict[str, Any]], Dict[str, Any]]:
        """
        Optimize multiple slides in batch.
        
        Args:
            slides: List of slide data dictionaries
            
        Returns:
            Tuple of (optimized_slides, summary_stats)
        """
        logger.info(f"🎨 [FONT OPTIMIZER] Starting batch optimization for {len(slides)} slides")
        
        all_results = []
        optimized_slides = []
        
        for idx, slide in enumerate(slides):
            optimized_slide, results = self.optimize_slide(slide, idx)
            optimized_slides.append(optimized_slide)
            all_results.extend(results)
        
        # Calculate summary statistics
        total_components = len(all_results)
        size_adjusted = sum(1 for r in all_results if r.size_adjusted)
        position_adjusted = sum(1 for r in all_results if r.position_adjusted)
        avg_confidence = sum(r.confidence for r in all_results) / total_components if total_components > 0 else 0
        
        summary = {
            'total_slides': len(slides),
            'total_components_optimized': total_components,
            'size_adjustments': size_adjusted,
            'position_adjustments': position_adjusted,
            'average_confidence': round(avg_confidence, 2),
            'all_fit': all(r.fits_in_container for r in all_results)
        }
        
        logger.info(
            f"✅ [FONT OPTIMIZER] Batch optimization complete: "
            f"{size_adjusted} size adjustments, {position_adjusted} position adjustments "
            f"(avg confidence: {summary['average_confidence']})"
        )
        
        return optimized_slides, summary


# Singleton instance
post_generation_optimizer = PostGenerationOptimizer()

