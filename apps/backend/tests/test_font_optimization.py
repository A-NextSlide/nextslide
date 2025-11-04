"""
Test Font Optimization System

Demonstrates how the post-generation font optimizer works.
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.post_generation_optimizer import PostGenerationOptimizer
import json


def test_basic_optimization():
    """Test basic font size optimization"""
    print("\n" + "="*80)
    print("TEST 1: Basic Font Size Optimization")
    print("="*80)
    
    optimizer = PostGenerationOptimizer()
    
    # Sample slide with a text component that needs optimization
    slide_data = {
        "components": [
            {
                "type": "Background",
                "props": {
                    "backgroundColor": "#0A0E27",
                    "position": {"x": 0, "y": 0},
                    "width": 1920,
                    "height": 1080
                }
            },
            {
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 100, "y": 100},
                    "width": 800,
                    "height": 200,
                    "fontSize": 72,  # AI's initial guess - might be too large
                    "fontFamily": "Inter",
                    "padding": 20,
                    "texts": [
                        {
                            "text": "This is a sample text that the AI agent generated",
                            "fontSize": 72
                        }
                    ]
                }
            }
        ]
    }
    
    print("\n📝 Original Component:")
    print(json.dumps(slide_data["components"][1]["props"], indent=2))
    
    # Run optimization
    optimized_slide, results = optimizer.optimize_slide(slide_data, slide_index=0)
    
    print("\n✅ Optimized Component:")
    print(json.dumps(optimized_slide["components"][1]["props"], indent=2))
    
    if results:
        result = results[0]
        print(f"\n📊 Optimization Results:")
        print(f"  - Original font size: {result.original_font_size}px")
        print(f"  - Optimized font size: {result.optimized_font_size}px")
        print(f"  - Size adjusted: {result.size_adjusted}")
        print(f"  - Position adjusted: {result.position_adjusted}")
        print(f"  - Fits in container: {result.fits_in_container}")
        print(f"  - Confidence: {result.confidence:.2%}")


def test_position_adjustment():
    """Test position adjustment for overflow prevention"""
    print("\n" + "="*80)
    print("TEST 2: Position Adjustment (Overflow Prevention)")
    print("="*80)
    
    optimizer = PostGenerationOptimizer()
    
    # Component positioned too close to bottom edge
    slide_data = {
        "components": [
            {
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 100, "y": 950},  # Too close to bottom (1080)
                    "width": 800,
                    "height": 200,
                    "fontSize": 24,
                    "fontFamily": "Inter",
                    "texts": [
                        {"text": "Text positioned too close to bottom edge"}
                    ]
                }
            }
        ]
    }
    
    print("\n📝 Original Position:")
    original_pos = slide_data["components"][0]["props"]["position"]
    print(f"  x: {original_pos['x']}, y: {original_pos['y']}")
    print(f"  Bottom edge: y + height = {original_pos['y']} + 200 = {original_pos['y'] + 200}")
    print(f"  Canvas height: 1080")
    print(f"  ⚠️  OVERFLOW: {original_pos['y'] + 200} > 1080")
    
    # Run optimization
    optimized_slide, results = optimizer.optimize_slide(slide_data, slide_index=0)
    
    print("\n✅ Optimized Position:")
    optimized_pos = optimized_slide["components"][0]["props"]["position"]
    print(f"  x: {optimized_pos['x']}, y: {optimized_pos['y']}")
    print(f"  Bottom edge: y + height = {optimized_pos['y']} + 200 = {optimized_pos['y'] + 200}")
    print(f"  ✓ FITS: {optimized_pos['y'] + 200} <= 1080")
    
    if results:
        result = results[0]
        print(f"\n📊 Position Adjustment:")
        print(f"  - Original: {result.original_position}")
        print(f"  - Optimized: {result.optimized_position}")
        print(f"  - Adjusted: {result.position_adjusted}")


def test_multiple_components():
    """Test optimization of multiple components in one slide"""
    print("\n" + "="*80)
    print("TEST 3: Multiple Component Optimization")
    print("="*80)
    
    optimizer = PostGenerationOptimizer()
    
    # Slide with multiple text components
    slide_data = {
        "components": [
            {
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 100, "y": 100},
                    "width": 1700,
                    "height": 200,
                    "fontSize": 120,  # Large title
                    "fontFamily": "Bebas Neue",
                    "padding": 0,
                    "texts": [{"text": "AMAZING TITLE SLIDE"}]
                }
            },
            {
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 100, "y": 350},
                    "width": 800,
                    "height": 150,
                    "fontSize": 32,  # Subtitle
                    "fontFamily": "Inter",
                    "padding": 10,
                    "texts": [{"text": "This is a subtitle with medium text"}]
                }
            },
            {
                "type": "TiptapTextBlock",
                "props": {
                    "position": {"x": 100, "y": 550},
                    "width": 1200,
                    "height": 400,
                    "fontSize": 18,  # Body text
                    "fontFamily": "Inter",
                    "padding": 20,
                    "texts": [
                        {
                            "text": "This is body text with a lot of content. "
                            "It might span multiple lines and needs proper sizing. "
                            "The optimizer will calculate the best font size to make "
                            "it fit perfectly in the available space."
                        }
                    ]
                }
            }
        ]
    }
    
    print("\n📝 Processing 3 text components...")
    
    # Run optimization
    optimized_slide, results = optimizer.optimize_slide(slide_data, slide_index=0)
    
    print(f"\n✅ Optimization Complete - {len(results)} components processed\n")
    
    for i, result in enumerate(results):
        print(f"Component {i + 1} ({result.component_type}):")
        print(f"  Font: {result.original_font_size}px → {result.optimized_font_size}px")
        if result.size_adjusted:
            change = ((result.optimized_font_size - result.original_font_size) / result.original_font_size) * 100
            print(f"  Change: {change:+.1f}%")
        else:
            print(f"  Change: No adjustment needed")
        print(f"  Confidence: {result.confidence:.2%}")
        print()


def test_batch_optimization():
    """Test batch optimization of multiple slides"""
    print("\n" + "="*80)
    print("TEST 4: Batch Slide Optimization")
    print("="*80)
    
    optimizer = PostGenerationOptimizer()
    
    # Multiple slides
    slides = [
        {
            "components": [
                {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": 100, "y": 100},
                        "width": 800,
                        "height": 200,
                        "fontSize": 48,
                        "texts": [{"text": "Slide 1 Title"}]
                    }
                }
            ]
        },
        {
            "components": [
                {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": 100, "y": 100},
                        "width": 800,
                        "height": 200,
                        "fontSize": 48,
                        "texts": [{"text": "Slide 2 Title"}]
                    }
                }
            ]
        },
        {
            "components": [
                {
                    "type": "TiptapTextBlock",
                    "props": {
                        "position": {"x": 100, "y": 100},
                        "width": 800,
                        "height": 200,
                        "fontSize": 48,
                        "texts": [{"text": "Slide 3 Title"}]
                    }
                }
            ]
        }
    ]
    
    print(f"\n📝 Processing {len(slides)} slides in batch...")
    
    # Run batch optimization
    optimized_slides, summary = optimizer.batch_optimize_slides(slides)
    
    print(f"\n✅ Batch Optimization Complete\n")
    print("Summary Statistics:")
    print(f"  Total slides: {summary['total_slides']}")
    print(f"  Total components: {summary['total_components_optimized']}")
    print(f"  Size adjustments: {summary['size_adjustments']}")
    print(f"  Position adjustments: {summary['position_adjustments']}")
    print(f"  Average confidence: {summary['average_confidence']:.2%}")
    print(f"  All components fit: {summary['all_fit']}")


def run_all_tests():
    """Run all font optimization tests"""
    print("\n" + "🎨" * 40)
    print("FONT OPTIMIZATION TEST SUITE")
    print("🎨" * 40)
    
    test_basic_optimization()
    test_position_adjustment()
    test_multiple_components()
    test_batch_optimization()
    
    print("\n" + "="*80)
    print("✅ ALL TESTS COMPLETE")
    print("="*80 + "\n")


if __name__ == "__main__":
    run_all_tests()

