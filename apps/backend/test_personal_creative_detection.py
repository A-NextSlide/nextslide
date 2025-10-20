#!/usr/bin/env python3
"""
Test script to verify personal/creative topic detection.
Run this to ensure the system properly classifies different presentation types.
"""

def detect_presentation_type(prompt: str) -> tuple[str, int]:
    """
    Simulates the detection logic from planner.py and generator.py
    Returns: (detected_context, recommended_slide_count_for_standard_mode)
    """
    prompt_lower = prompt.lower()
    
    # Personal/creative indicators
    personal_creative_indicators = [
        'birthday', 'party', 'celebration', 'anniversary', 'silly', 'fun',
        'pikachu', 'pokemon', 'mario', 'disney', 'cartoon', 'character',
        'hobby', 'personal', 'my story', 'my journey', 'family', 'friend',
        'wedding', 'baby shower', 'retirement party', 'surprise', 'gift',
        'vacation', 'travel', 'adventure', 'pet', 'recipe', 'cooking',
        'craft', 'diy', 'art project', 'scrapbook', 'slideshow for'
    ]
    
    # How-to/tutorial indicators
    howto_indicators = [
        'how to', 'guide to', 'tutorial', 'step by step', 'learn to',
        'beginner guide', 'getting started', 'introduction to', 'basics of'
    ]
    
    # Educational indicators
    educational_indicators = [
        'education', 'school', 'student', 'teacher', 'learning', 'lesson',
        'curriculum', 'course', 'module', 'training', 'workshop'
    ]
    
    # Detect context
    if any(indicator in prompt_lower for indicator in personal_creative_indicators):
        return ("personal", 5)  # 5 slides for standard mode
    elif any(indicator in prompt_lower for indicator in howto_indicators):
        return ("informational", 5)  # 5 slides for standard mode
    elif any(indicator in prompt_lower for indicator in educational_indicators):
        return ("educational", 6)
    else:
        return ("business", 6)  # Default business context


def test_detection():
    """Run tests on various presentation topics"""
    
    test_cases = [
        # Personal/Creative cases (should detect as "personal", 5 slides)
        ("Pikachu's Silly Birthday Slideshow for Milly", "personal", 5),
        ("My Summer Vacation Adventure", "personal", 5),
        ("Fun Facts About Pokemon", "personal", 5),
        ("Sarah's Baby Shower Celebration", "personal", 5),
        ("My Photography Hobby", "personal", 5),
        ("Wedding Anniversary Memories", "personal", 5),
        ("Family Vacation to Hawaii", "personal", 5),
        ("DIY Home Craft Project", "personal", 5),
        
        # How-To cases (should detect as "informational", 5 slides)
        ("How to Bake Sourdough Bread", "informational", 5),
        ("Guide to Starting a Garden", "informational", 5),
        ("Beginner's Tutorial: Watercolor Painting", "informational", 5),
        ("Step by Step: Building a Birdhouse", "informational", 5),
        
        # Educational cases (should detect as "educational", 6 slides)
        ("Introduction to Quantum Physics for Students", "educational", 6),
        ("School Project: Solar System", "educational", 6),
        ("Training Module: Customer Service", "educational", 6),
        
        # Business cases (should detect as "business", 6 slides)
        ("Q4 Revenue Analysis", "business", 6),
        ("Marketing Strategy 2025", "business", 6),
        ("Product Launch Plan", "business", 6),
        ("Financial Performance Review", "business", 6),
    ]
    
    print("=" * 80)
    print("PERSONAL/CREATIVE TOPIC DETECTION TEST")
    print("=" * 80)
    print()
    
    passed = 0
    failed = 0
    
    for prompt, expected_context, expected_slides in test_cases:
        detected_context, detected_slides = detect_presentation_type(prompt)
        
        context_match = detected_context == expected_context
        slides_match = detected_slides == expected_slides
        
        if context_match and slides_match:
            status = "✅ PASS"
            passed += 1
        else:
            status = "❌ FAIL"
            failed += 1
        
        print(f"{status}")
        print(f"  Prompt: \"{prompt}\"")
        print(f"  Expected: {expected_context} context, {expected_slides} slides")
        print(f"  Detected: {detected_context} context, {detected_slides} slides")
        
        if not context_match:
            print(f"  ⚠️  Context mismatch!")
        if not slides_match:
            print(f"  ⚠️  Slide count mismatch!")
        print()
    
    print("=" * 80)
    print(f"RESULTS: {passed} passed, {failed} failed out of {passed + failed} tests")
    print("=" * 80)
    
    if failed == 0:
        print("🎉 All tests passed! Detection logic is working correctly.")
    else:
        print(f"⚠️  {failed} test(s) failed. Review detection logic.")
    
    return failed == 0


if __name__ == "__main__":
    success = test_detection()
    exit(0 if success else 1)

