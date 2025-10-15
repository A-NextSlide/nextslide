#!/usr/bin/env python3
"""
Test script to compare outline generation between presentation mode and detailed mode
"""

import asyncio
import json
import sys
import os

# Add backend to path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), 'apps', 'backend'))

from services.outline.generator import OutlineGenerator
from services.outline.models import OutlineOptions
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def test_presentation_mode():
    """Test outline generation in presentation mode (standard detail level)"""
    logger.info("=" * 80)
    logger.info("TESTING PRESENTATION MODE (standard detail level)")
    logger.info("=" * 80)
    
    generator = OutlineGenerator()
    
    options = OutlineOptions(
        prompt="Create a presentation about AI in healthcare",
        detail_level="standard",  # Presentation mode
        slide_count=6,
        style_context="Professional, modern",
        enable_research=False  # Minimal research for presentation mode
    )
    
    result = await generator.generate(options)
    
    logger.info("\n" + "=" * 80)
    logger.info("PRESENTATION MODE RESULTS:")
    logger.info("=" * 80)
    logger.info(f"Title: {result.title}")
    logger.info(f"Number of slides: {len(result.slides)}")
    
    for i, slide in enumerate(result.slides, 1):
        slide_type = getattr(slide, 'slide_type', 'unknown')
        logger.info(f"\n--- Slide {i}: {slide.title} ({slide_type}) ---")
        logger.info(f"Content preview: {slide.content[:200]}..." if len(slide.content) > 200 else slide.content)
        word_count = len(slide.content.split())
        logger.info(f"Word count: {word_count}")
        if hasattr(slide, 'chart_data') and slide.chart_data:
            logger.info(f"Has chart: Yes")
    
    return result


async def test_detailed_mode():
    """Test outline generation in detailed mode"""
    logger.info("\n\n" + "=" * 80)
    logger.info("TESTING DETAILED MODE")
    logger.info("=" * 80)
    
    generator = OutlineGenerator()
    
    options = OutlineOptions(
        prompt="Create a presentation about AI in healthcare",
        detail_level="detailed",  # Detailed mode
        slide_count=6,
        style_context="Professional, modern",
        enable_research=True  # Full research for detailed mode
    )
    
    result = await generator.generate(options)
    
    logger.info("\n" + "=" * 80)
    logger.info("DETAILED MODE RESULTS:")
    logger.info("=" * 80)
    logger.info(f"Title: {result.title}")
    logger.info(f"Number of slides: {len(result.slides)}")
    
    for i, slide in enumerate(result.slides, 1):
        slide_type = getattr(slide, 'slide_type', 'unknown')
        logger.info(f"\n--- Slide {i}: {slide.title} ({slide_type}) ---")
        logger.info(f"Content preview: {slide.content[:200]}..." if len(slide.content) > 200 else slide.content)
        word_count = len(slide.content.split())
        logger.info(f"Word count: {word_count}")
        if hasattr(slide, 'chart_data') and slide.chart_data:
            logger.info(f"Has chart: Yes")
    
    return result


async def compare_modes():
    """Compare both modes side-by-side"""
    print("\n" + "=" * 80)
    print("STARTING OUTLINE MODE COMPARISON TEST")
    print("=" * 80)
    
    # Test presentation mode
    presentation_result = await test_presentation_mode()
    
    # Test detailed mode
    detailed_result = await test_detailed_mode()
    
    # Compare results
    print("\n\n" + "=" * 80)
    print("COMPARISON SUMMARY")
    print("=" * 80)
    
    presentation_total_words = sum(len(slide.content.split()) for slide in presentation_result.slides)
    detailed_total_words = sum(len(slide.content.split()) for slide in detailed_result.slides)
    
    presentation_charts = sum(1 for slide in presentation_result.slides if hasattr(slide, 'chart_data') and slide.chart_data)
    detailed_charts = sum(1 for slide in detailed_result.slides if hasattr(slide, 'chart_data') and slide.chart_data)
    
    print(f"\nPRESENTATION MODE:")
    print(f"  - Slides: {len(presentation_result.slides)}")
    print(f"  - Total words: {presentation_total_words}")
    print(f"  - Avg words per slide: {presentation_total_words / len(presentation_result.slides):.1f}")
    print(f"  - Charts: {presentation_charts} ({presentation_charts / len(presentation_result.slides) * 100:.0f}%)")
    
    print(f"\nDETAILED MODE:")
    print(f"  - Slides: {len(detailed_result.slides)}")
    print(f"  - Total words: {detailed_total_words}")
    print(f"  - Avg words per slide: {detailed_total_words / len(detailed_result.slides):.1f}")
    print(f"  - Charts: {detailed_charts} ({detailed_charts / len(detailed_result.slides) * 100:.0f}%)")
    
    print(f"\nDIFFERENCE:")
    word_diff = detailed_total_words - presentation_total_words
    chart_diff = detailed_charts - presentation_charts
    print(f"  - Words: {word_diff:+d} ({word_diff / presentation_total_words * 100:+.0f}%)")
    print(f"  - Charts: {chart_diff:+d}")
    
    print("\n" + "=" * 80)
    print("EXPECTED BEHAVIOR:")
    print("=" * 80)
    print("✅ Presentation mode should have:")
    print("   - FEWER words per slide (40-60 target)")
    print("   - MINIMAL charts (1-2 total, 20-30% density)")
    print("   - USE lighter model (claude-haiku-4-5)")
    print("   - SKIP heavy research/data aggregation")
    print("")
    print("✅ Detailed mode should have:")
    print("   - MORE words per slide (150-250 target)")
    print("   - MORE charts (40-50% density)")
    print("   - USE pro model (perplexity-sonar-pro)")
    print("   - INCLUDE comprehensive research")
    print("=" * 80)


if __name__ == "__main__":
    asyncio.run(compare_modes())

