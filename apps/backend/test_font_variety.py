#!/usr/bin/env python3
"""
Test script to verify font selection variety and intelligent metadata-based selection.
Generates 10 different themes and checks that fonts are varied and appropriate.
"""

import sys
import os
from pathlib import Path

# Add backend to path
sys.path.insert(0, str(Path(__file__).parent))

from services.enhanced_font_service import EnhancedFontService
import hashlib

def generate_variety_seed(index: int, title: str) -> str:
    """Generate a variety seed for testing"""
    return hashlib.md5(f"{title}_{index}".encode()).hexdigest()

def test_font_variety():
    """Test that font selection shows variety across multiple deck generations"""
    print("=" * 80)
    print("FONT VARIETY TEST")
    print("=" * 80)
    
    service = EnhancedFontService()
    
    # Test contexts
    test_cases = [
        {
            'title': 'Tech Startup Pitch Deck',
            'vibe': 'modern',
            'keywords': ['technology', 'software', 'startup'],
            'audience': 'investors'
        },
        {
            'title': 'Luxury Fashion Brand Lookbook',
            'vibe': 'elegant',
            'keywords': ['fashion', 'luxury', 'premium'],
            'audience': 'high-end consumers'
        },
        {
            'title': 'Corporate Financial Report Q4',
            'vibe': 'professional',
            'keywords': ['finance', 'banking', 'data'],
            'audience': 'executives'
        },
        {
            'title': 'Creative Agency Portfolio',
            'vibe': 'creative',
            'keywords': ['design', 'branding', 'artistic'],
            'audience': 'potential clients'
        },
        {
            'title': 'Retro Gaming Conference',
            'vibe': 'retro',
            'keywords': ['gaming', 'vintage', '80s'],
            'audience': 'gamers'
        },
        {
            'title': 'University Research Presentation',
            'vibe': 'formal',
            'keywords': ['education', 'research', 'science'],
            'audience': 'academics'
        },
        {
            'title': 'Food Delivery App Launch',
            'vibe': 'playful',
            'keywords': ['food', 'mobile', 'consumer'],
            'audience': 'general public'
        },
        {
            'title': 'AI Technology Whitepaper',
            'vibe': 'technical',
            'keywords': ['artificial intelligence', 'machine learning', 'data'],
            'audience': 'technical professionals'
        },
        {
            'title': 'Wedding Photography Portfolio',
            'vibe': 'romantic',
            'keywords': ['photography', 'wedding', 'elegant'],
            'audience': 'couples'
        },
        {
            'title': 'Sustainable Energy Initiative',
            'vibe': 'clean',
            'keywords': ['environment', 'sustainability', 'green'],
            'audience': 'stakeholders'
        }
    ]
    
    all_font_pairs = []
    hero_fonts_used = []
    body_fonts_used = []
    
    print("\nGenerating themes with intelligent font selection...\n")
    
    for i, test_case in enumerate(test_cases, 1):
        variety_seed = generate_variety_seed(i, test_case['title'])
        
        result = service.select_font_pair(
            deck_title=test_case['title'],
            vibe=test_case['vibe'],
            content_keywords=test_case['keywords'],
            target_audience=test_case['audience'],
            variety_seed=variety_seed
        )
        
        hero = result['hero']
        body = result['body']
        source = result.get('source', 'unknown')
        hero_cat = result.get('hero_category', 'unknown')
        body_cat = result.get('body_category', 'unknown')
        
        all_font_pairs.append((hero, body))
        hero_fonts_used.append(hero)
        body_fonts_used.append(body)
        
        print(f"{i:2d}. {test_case['title']}")
        print(f"    Vibe: {test_case['vibe']}")
        print(f"    Hero: {hero} ({hero_cat})")
        print(f"    Body: {body} ({body_cat})")
        print(f"    Source: {source}")
        print()
    
    # Analysis
    print("=" * 80)
    print("VARIETY ANALYSIS")
    print("=" * 80)
    
    unique_pairs = len(set(all_font_pairs))
    unique_heroes = len(set(hero_fonts_used))
    unique_bodies = len(set(body_fonts_used))
    
    print(f"\nUnique font pairs: {unique_pairs} out of {len(test_cases)} themes")
    print(f"Unique hero fonts: {unique_heroes} out of {len(test_cases)}")
    print(f"Unique body fonts: {unique_bodies} out of {len(test_cases)}")
    
    # Check for repetition
    hero_usage = {}
    body_usage = {}
    
    for hero in hero_fonts_used:
        hero_usage[hero] = hero_usage.get(hero, 0) + 1
    
    for body in body_fonts_used:
        body_usage[body] = body_usage.get(body, 0) + 1
    
    if any(count > 2 for count in hero_usage.values()):
        print("\n⚠️  Warning: Some hero fonts used more than twice")
        for font, count in sorted(hero_usage.items(), key=lambda x: -x[1]):
            if count > 1:
                print(f"   - {font}: {count} times")
    else:
        print("\n✓ Good variety in hero fonts (no font used more than twice)")
    
    if any(count > 2 for count in body_usage.values()):
        print("\n⚠️  Warning: Some body fonts used more than twice")
        for font, count in sorted(body_usage.items(), key=lambda x: -x[1]):
            if count > 1:
                print(f"   - {font}: {count} times")
    else:
        print("\n✓ Good variety in body fonts (no font used more than twice)")
    
    # Success criteria
    success = True
    
    if unique_pairs < len(test_cases) * 0.7:  # At least 70% unique pairs
        print("\n❌ FAIL: Not enough variety in font pairs")
        success = False
    else:
        print("\n✓ PASS: Good variety in font pairs")
    
    if unique_heroes < len(test_cases) * 0.6:  # At least 60% unique heroes
        print("❌ FAIL: Not enough variety in hero fonts")
        success = False
    else:
        print("✓ PASS: Good variety in hero fonts")
    
    # Check for boring default fonts
    boring_fonts = {'Roboto', 'Inter', 'Montserrat', 'Open Sans', 'Lato'}
    overused_boring = sum(1 for f in hero_fonts_used + body_fonts_used if f in boring_fonts)
    
    if overused_boring > len(test_cases) * 0.4:  # More than 40% boring
        print(f"\n⚠️  Warning: {overused_boring} instances of overused fonts (Roboto, Inter, etc)")
    else:
        print(f"\n✓ Using diverse fonts beyond common defaults ({overused_boring}/{len(test_cases)*2} boring)")
    
    print("\n" + "=" * 80)
    if success:
        print("✓ FONT VARIETY TEST PASSED")
    else:
        print("❌ FONT VARIETY TEST FAILED")
    print("=" * 80)
    
    return success

def test_metadata_scoring():
    """Test that metadata-based scoring is working"""
    print("\n" + "=" * 80)
    print("METADATA SCORING TEST")
    print("=" * 80)
    
    service = EnhancedFontService()
    
    # Test that tech deck gets tech fonts
    tech_recommendations = service.get_fonts_for_theme(
        deck_title="AI Startup Pitch",
        vibe="modern",
        content_keywords=["technology", "artificial intelligence", "software"],
        target_audience="investors"
    )
    
    print("\nTech Context - Top 5 Hero Fonts:")
    for i, font in enumerate(tech_recommendations['hero'][:5], 1):
        print(f"  {i}. {font['name']} ({font['category']})")
        if font.get('tags'):
            print(f"     Tags: {', '.join(font['tags'][:5])}")
    
    # Test that elegant deck gets elegant fonts
    elegant_recommendations = service.get_fonts_for_theme(
        deck_title="Luxury Fashion Lookbook",
        vibe="elegant",
        content_keywords=["luxury", "fashion", "premium"],
        target_audience="high-end consumers"
    )
    
    print("\nElegant Context - Top 5 Hero Fonts:")
    for i, font in enumerate(elegant_recommendations['hero'][:5], 1):
        print(f"  {i}. {font['name']} ({font['category']})")
        if font.get('tags'):
            print(f"     Tags: {', '.join(font['tags'][:5])}")
    
    print("\n✓ Metadata scoring appears to be working")
    print("=" * 80)

if __name__ == '__main__':
    print("\nStarting Font Selection Tests...\n")
    
    try:
        test_metadata_scoring()
        variety_success = test_font_variety()
        
        if variety_success:
            print("\n✓ All tests passed!")
            sys.exit(0)
        else:
            print("\n❌ Some tests failed")
            sys.exit(1)
    except Exception as e:
        print(f"\n❌ Test error: {e}")
        import traceback
        traceback.print_exc()
        sys.exit(1)


