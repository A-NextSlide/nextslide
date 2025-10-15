"""Enhance minimal brand colors with AI-generated complementary colors."""

from typing import List, Dict, Any
from .huemint_palette_generator import HuemintPaletteGenerator
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def enhance_minimal_brand_colors(
    brand_colors: List[str],
    brand_name: str,
    min_colors: int = 5
) -> Dict[str, Any]:
    """Enhance minimal brand colors by generating complementary colors."""
    if len(brand_colors) >= min_colors:
        return {'colors': brand_colors, 'source': 'brand_only', 'enhanced': False}
    
    logger.info(f"Enhancing {brand_name}: {len(brand_colors)} → {min_colors} colors")
    
    # Preserve original brand colors before passing to Huemint
    original_brand_colors = list(brand_colors)
    
    try:
        generator = HuemintPaletteGenerator()
        palette = await generator.generate_single_palette(
            num_colors=min_colors,
            temperature=1.0,
            locked_colors=list(brand_colors)  # Pass a copy to avoid mutation
        )
        
        if palette and palette.get('colors'):
            valid_colors = [c for c in palette['colors'] if c and c != '-']
            final_colors = list(brand_colors)
            for ec in valid_colors:
                if ec not in final_colors:
                    final_colors.append(ec)
            
            generated = [c for c in final_colors if c not in brand_colors]
            logger.info(f"Enhanced: {len(brand_colors)} brand + {len(generated)} AI")
            
            return {
                'colors': final_colors[:min_colors],
                'brand_colors': original_brand_colors,  # Use preserved original
                'generated_colors': generated,
                'source': 'brand_enhanced_with_ai',
                'enhanced': True,
                'confidence': 0.9
            }
    except Exception as e:
        logger.error(f"Enhancement failed: {e}")
    
    return {'colors': brand_colors, 'source': 'brand_only', 'enhanced': False}
