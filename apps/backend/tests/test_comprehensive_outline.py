#!/usr/bin/env python3
"""
Test script to verify comprehensive outline generation with research-backed content.
Tests the full pipeline with Perplexity Sonar Pro.
"""

import asyncio
import sys
import os

# Add the backend directory to the path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from services.outline.generator import OutlineGenerator
from services.outline.models import OutlineOptions


async def test_comprehensive_outline():
    """Test outline generation with detailed mode and research enabled."""
    
    print("=" * 80)
    print("TESTING COMPREHENSIVE OUTLINE GENERATION")
    print("=" * 80)
    print()
    
    # Create outline generator
    generator = OutlineGenerator()
    
    # Test options - DETAILED mode with research enabled
    options = OutlineOptions(
        prompt="Deep Analysis of First Round Capital Holdings and Portfolio Companies",
        detail_level="detailed",  # CRITICAL: Use detailed for investment-grade content
        enable_research=True,     # Should be default now, but explicitly set
        slide_count=12            # Request 12 slides for comprehensive analysis
    )
    
    print(f"📊 Test Configuration:")
    print(f"   Topic: {options.prompt}")
    print(f"   Detail Level: {options.detail_level}")
    print(f"   Research Enabled: {options.enable_research}")
    print(f"   Slide Count: {options.slide_count}")
    print()
    print("🔬 Starting generation with Perplexity Sonar Pro...")
    print("   (This may take 30-60 seconds for comprehensive research and content)")
    print()
    
    try:
        # Generate outline
        result = await generator.generate(options)
        
        print("✅ GENERATION COMPLETE!")
        print("=" * 80)
        print()
        
        # Analyze results
        print(f"📄 Presentation Title: {result.title}")
        print(f"📊 Total Slides: {len(result.slides)}")
        print(f"⏱️  Generation Time: {result.generation_time:.2f}s")
        print()
        
        # Check first 3 slides for quality
        print("=" * 80)
        print("CONTENT QUALITY ANALYSIS")
        print("=" * 80)
        print()
        
        for idx, slide in enumerate(result.slides[:3], 1):
            print(f"\n{'='*80}")
            print(f"SLIDE {idx}: {slide.title}")
            print(f"Type: {slide.slide_type}")
            print(f"{'='*80}")
            
            content = slide.content
            word_count = len(content.split())
            bullet_count = content.count('•')
            has_section_headers = '##' in content
            has_subbullets = '  •' in content or '    •' in content
            has_numbers = any(char.isdigit() for char in content)
            citation_count = content.count('[')
            
            print(f"\n📊 METRICS:")
            print(f"   Word Count: {word_count}")
            print(f"   Bullet Count: {bullet_count}")
            print(f"   Section Headers: {'Yes ✅' if has_section_headers else 'No ❌'}")
            print(f"   Multi-level Bullets: {'Yes ✅' if has_subbullets else 'No ❌'}")
            print(f"   Contains Numbers: {'Yes ✅' if has_numbers else 'No ❌'}")
            print(f"   Citations: {citation_count}")
            
            print(f"\n📝 CONTENT PREVIEW (first 500 chars):")
            print("-" * 80)
            print(content[:500])
            if len(content) > 500:
                print(f"\n   ... ({len(content) - 500} more characters)")
            print("-" * 80)
            
            # Quality checks
            print(f"\n✅ QUALITY CHECKS:")
            checks = []
            
            if slide.slide_type in ['content', 'agenda'] and word_count >= 150:
                checks.append(f"✅ Comprehensive content ({word_count} words)")
            elif slide.slide_type in ['content', 'agenda'] and word_count < 150:
                checks.append(f"❌ Content too short ({word_count} words, expected 200-500+ for detailed mode)")
            
            if has_section_headers:
                checks.append("✅ Uses section headers (##)")
            elif slide.slide_type == 'content':
                checks.append("⚠️  No section headers (recommended for detailed mode)")
            
            if has_subbullets:
                checks.append("✅ Multi-level bullet structure")
            elif slide.slide_type == 'content':
                checks.append("⚠️  No sub-bullets (recommended for comprehensive analysis)")
            
            if has_numbers:
                checks.append("✅ Contains specific data/numbers")
            else:
                checks.append("❌ No numbers found (should include specific metrics)")
            
            if citation_count > 0:
                checks.append(f"✅ Research citations present ({citation_count})")
            else:
                checks.append("⚠️  No research citations")
            
            for check in checks:
                print(f"   {check}")
        
        print()
        print("=" * 80)
        print("OVERALL ASSESSMENT")
        print("=" * 80)
        print()
        
        # Calculate overall metrics
        total_words = sum(len(slide.content.split()) for slide in result.slides)
        avg_words = total_words / len(result.slides) if result.slides else 0
        slides_with_headers = sum(1 for slide in result.slides if '##' in slide.content)
        slides_with_citations = sum(1 for slide in result.slides if '[' in slide.content)
        
        print(f"📊 Overall Metrics:")
        print(f"   Total Words: {total_words}")
        print(f"   Average Words/Slide: {avg_words:.1f}")
        print(f"   Slides with Section Headers: {slides_with_headers}/{len(result.slides)}")
        print(f"   Slides with Citations: {slides_with_citations}/{len(result.slides)}")
        print()
        
        # Final verdict
        if avg_words >= 200 and slides_with_headers >= 2 and slides_with_citations >= 5:
            print("🎉 SUCCESS! Content meets investment-grade standards:")
            print("   ✅ Comprehensive depth (200+ words avg)")
            print("   ✅ Structured with section headers")
            print("   ✅ Research-backed with citations")
            print()
            print("   The system is producing GenSpark-quality content! 🚀")
        elif avg_words >= 150:
            print("⚠️  PARTIAL SUCCESS - Content is good but could be more comprehensive:")
            if avg_words < 200:
                print(f"   ⚠️  Average words ({avg_words:.1f}) below ideal (200+)")
            if slides_with_headers < 2:
                print("   ⚠️  Few section headers (consider using more ## headers)")
            if slides_with_citations < 5:
                print("   ⚠️  Limited citations (should have more research backing)")
        else:
            print("❌ NEEDS IMPROVEMENT - Content is too brief:")
            print(f"   ❌ Average words ({avg_words:.1f}) well below target (200-500+)")
            print("   Check that detailed mode prompts are being used")
        
        return result
        
    except Exception as e:
        print(f"❌ ERROR during generation: {e}")
        import traceback
        traceback.print_exc()
        return None


if __name__ == "__main__":
    print()
    print("🧪 COMPREHENSIVE OUTLINE GENERATION TEST")
    print()
    
    # Run the test
    result = asyncio.run(test_comprehensive_outline())
    
    if result:
        print()
        print("=" * 80)
        print("✅ Test completed successfully!")
        print("=" * 80)
        sys.exit(0)
    else:
        print()
        print("=" * 80)
        print("❌ Test failed - see errors above")
        print("=" * 80)
        sys.exit(1)

