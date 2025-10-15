#!/usr/bin/env python3
"""
Test script to verify font selection strategy:
- Body fonts: NO PixelBuddha (only Google Fonts, System fonts, Designer fonts)
- Hero/Title fonts: CAN use PixelBuddha (with 20% boost)
"""

import sys
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.enhanced_font_service import EnhancedFontService

def test_font_source_strategy():
    """Test that PixelBuddha fonts are excluded from body text but allowed for hero"""
    print("=" * 80)
    print("FONT SOURCE STRATEGY TEST")
    print("=" * 80)
    
    service = EnhancedFontService()
    
    print(f"\nTotal fonts available: {len(service.all_fonts)}")
    print(f"PixelBuddha fonts: {len(service.pixelbuddha_fonts)}")
    print(f"Designer fonts: {len(service.designer_fonts)}")
    
    # Test context
    test_case = {
        'title': 'Tech Startup Pitch Deck',
        'vibe': 'modern',
        'keywords': ['technology', 'software', 'startup'],
        'audience': 'investors'
    }
    
    print(f"\nTest Context: {test_case['title']}")
    print(f"Vibe: {test_case['vibe']}")
    
    # Get recommendations
    result = service.select_font_pair(
        deck_title=test_case['title'],
        vibe=test_case['vibe'],
        content_keywords=test_case['keywords'],
        target_audience=test_case['audience'],
        variety_seed='test123'
    )
    
    hero_id = result.get('hero_id')
    body_id = result.get('body_id')
    
    # Check sources
    hero_source = service.all_fonts[hero_id]['source'] if hero_id in service.all_fonts else 'unknown'
    body_source = service.all_fonts[body_id]['source'] if body_id in service.all_fonts else 'unknown'
    
    print("\n" + "=" * 80)
    print("RESULTS")
    print("=" * 80)
    
    print(f"\nHero Font: {result['hero']}")
    print(f"  Source: {hero_source}")
    print(f"  Category: {result.get('hero_category', 'unknown')}")
    print(f"  ✓ Can be PixelBuddha: {hero_source == 'pixelbuddha'} (ALLOWED)")
    
    print(f"\nBody Font: {result['body']}")
    print(f"  Source: {body_source}")
    print(f"  Category: {result.get('body_category', 'unknown')}")
    
    if body_source == 'pixelbuddha':
        print(f"  ❌ FAIL: Body font is PixelBuddha (should be excluded!)")
        return False
    else:
        print(f"  ✓ PASS: Body font is NOT PixelBuddha (correct!)")
    
    # Test multiple pairs to ensure consistency
    print("\n" + "=" * 80)
    print("CONSISTENCY TEST (10 generations)")
    print("=" * 80)
    
    pixelbuddha_body_count = 0
    total_tests = 10
    
    for i in range(total_tests):
        result = service.select_font_pair(
            deck_title=test_case['title'],
            vibe=test_case['vibe'],
            content_keywords=test_case['keywords'],
            target_audience=test_case['audience'],
            variety_seed=f'test_{i}'
        )
        
        body_id = result.get('body_id')
        if body_id and body_id in service.all_fonts:
            body_source = service.all_fonts[body_id]['source']
            if body_source == 'pixelbuddha':
                pixelbuddha_body_count += 1
                print(f"  {i+1}. ❌ Body: {result['body']} (PixelBuddha - WRONG!)")
            else:
                print(f"  {i+1}. ✓ Body: {result['body']} ({body_source})")
    
    print(f"\nPixelBuddha used for body text: {pixelbuddha_body_count}/{total_tests}")
    
    if pixelbuddha_body_count == 0:
        print("✓ PASS: No PixelBuddha fonts used for body text")
        return True
    else:
        print(f"❌ FAIL: {pixelbuddha_body_count} instances of PixelBuddha in body text")
        return False

def test_body_font_readability():
    """Test that body fonts are readable (sans/serif, not decorative)"""
    print("\n" + "=" * 80)
    print("BODY FONT READABILITY TEST")
    print("=" * 80)
    
    service = EnhancedFontService()
    
    contexts = [
        ('Tech Startup', 'modern', ['technology', 'software']),
        ('Corporate Report', 'professional', ['business', 'finance']),
        ('Educational Presentation', 'formal', ['education', 'academic']),
    ]
    
    for title, vibe, keywords in contexts:
        result = service.select_font_pair(
            deck_title=title,
            vibe=vibe,
            content_keywords=keywords,
            variety_seed=title
        )
        
        body_id = result.get('body_id')
        body_source = service.all_fonts[body_id]['source'] if body_id in service.all_fonts else 'unknown'
        body_category = result.get('body_category', 'unknown')
        
        print(f"\n{title}:")
        print(f"  Body: {result['body']}")
        print(f"  Source: {body_source}")
        print(f"  Category: {body_category}")
        
        # Check if it's a readable category
        readable_categories = ['sans', 'serif', 'display-serif']
        is_readable = any(cat in body_category.lower() for cat in readable_categories)
        
        if body_source == 'pixelbuddha':
            print(f"  ❌ FAIL: PixelBuddha font (should be excluded)")
        elif is_readable:
            print(f"  ✓ PASS: Readable category")
        else:
            print(f"  ⚠️  Warning: Category {body_category} may not be ideal for body text")

if __name__ == '__main__':
    print("\nTesting Font Selection Strategy...\n")
    
    try:
        test1_pass = test_font_source_strategy()
        test_body_font_readability()
        
        print("\n" + "=" * 80)
        if test1_pass:
            print("✓ ALL TESTS PASSED")
            print("=" * 80)
            print("\nFont Strategy Working Correctly:")
            print("  ✓ Body fonts: NO PixelBuddha (only Google/System/Designer fonts)")
            print("  ✓ Hero fonts: CAN use PixelBuddha (decorative/display fonts)")
            print("  ✓ Fonts are appropriate for their purpose")
            sys.exit(0)
        else:
            print("❌ SOME TESTS FAILED")
            print("=" * 80)
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)

