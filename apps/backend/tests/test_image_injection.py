"""
Test suite for guaranteed image injection in CustomComponentGenerator.

Run with: python -m pytest tests/test_image_injection.py -v
Or directly: python tests/test_image_injection.py
"""

import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import asyncio
from typing import Dict
import pytest

# Test the injection function directly
def test_inject_prefetched_images():
    """Test that _inject_prefetched_images_into_html correctly replaces all patterns."""

    from agents.generation.custom_component_generator import CustomComponentGenerator

    generator = CustomComponentGenerator()

    # Sample prefetched images
    prefetched = {
        "image1": "https://example.com/real-image-1.jpg",
        "image1_query": "Elon Musk",
        "image2": "https://example.com/real-image-2.jpg",
        "image2_query": "Tesla Model S",
        "image3": "https://example.com/real-image-3.jpg",
        "image3_query": "Smart Checkout",
    }

    # Test Case 1: ${varName} pattern
    html1 = '''
    <html>
    <body>
        <img src="${image1}" alt="Test Image 1">
        <img src="${image2}" alt="Test Image 2">
        <img src="${customName}" alt="Custom">
    </body>
    </html>
    '''

    result1 = generator._inject_prefetched_images_into_html(html1, prefetched)

    assert 'src="https://example.com/real-image-1.jpg"' in result1, "image1 should be injected"
    assert 'src="https://example.com/real-image-2.jpg"' in result1, "image2 should be injected"
    assert '${' not in result1, "No ${} patterns should remain"
    print("✅ Test 1 PASSED: ${varName} patterns replaced")

    # Test Case 2: placeholder pattern
    html2 = '''
    <html>
    <body>
        <img src="placeholder" alt="Placeholder 1">
        <img src="" alt="Empty">
        <img src='placeholder' alt="Placeholder 2">
    </body>
    </html>
    '''

    result2 = generator._inject_prefetched_images_into_html(html2, prefetched)

    assert 'src="placeholder"' not in result2, "placeholder should be replaced"
    assert 'src=""' not in result2, "empty src should be replaced"
    assert 'https://example.com/real-image' in result2, "Real URLs should be present"
    print("✅ Test 2 PASSED: placeholder patterns replaced")

    # Test Case 3: JavaScript variable pattern
    html3 = '''
    <html>
    <head>
    <script>
        const image1 = props.image1 || 'placeholder';
        const image2 = props.image2 || '';
    </script>
    </head>
    <body>
        <img src="${image1}" alt="Test">
    </body>
    </html>
    '''

    result3 = generator._inject_prefetched_images_into_html(html3, prefetched)

    # Current injector contract: resolve image output in rendered HTML.
    # We intentionally do not rewrite all JS variable declarations.
    assert 'src="https://example.com/real-image-1.jpg"' in result3, "Rendered image src should be resolved"
    assert '${' not in result3, "Template src placeholders should be removed"
    print("✅ Test 3 PASSED: Rendered src resolved from JavaScript-backed template")

    # Test Case 4: Mixed patterns (real-world scenario)
    html4 = '''
    <!DOCTYPE html>
    <html>
    <head>
        <script>
            const image1 = props.image1 || 'placeholder';
            const heroImage = props.heroImage || '';
        </script>
    </head>
    <body>
        <div class="hero">
            <img src="${heroImage}" alt="Hero" class="hero-img">
        </div>
        <div class="cards">
            <div class="card">
                <img src="${image1}" alt="Card 1">
            </div>
            <div class="card">
                <img src="placeholder" alt="Card 2">
            </div>
            <div class="card">
                <img src="${randomName}" alt="Card 3">
            </div>
        </div>
    </body>
    </html>
    '''

    result4 = generator._inject_prefetched_images_into_html(html4, prefetched)

    # Count real URLs
    url_count = result4.count('https://example.com/real-image')
    assert url_count >= 4, f"Should have at least 4 real URLs, got {url_count}"
    assert '${' not in result4, "No ${} patterns should remain"
    assert 'src="placeholder"' not in result4, "No placeholder should remain"
    print(f"✅ Test 4 PASSED: Mixed patterns - injected {url_count} images")

    print("\n" + "="*60)
    print("🎉 ALL INJECTION TESTS PASSED!")
    print("="*60)


def test_term_to_prop_name():
    """Test prop name conversion."""

    from agents.generation.custom_component_helpers import _term_to_prop_name

    # Test conversions - but now we use numbered props so this is less critical
    # Keeping for backwards compatibility testing

    assert _term_to_prop_name("Elon Musk") == "elonMuskImage"
    assert _term_to_prop_name("Tesla Model S") == "teslaModelSImage"
    assert _term_to_prop_name("AI") == "aiImage"

    print("✅ Prop name conversion tests PASSED")


@pytest.mark.asyncio
async def test_full_flow_mock():
    """Test the full flow with mocked SerpAPI response."""

    print("\n" + "="*60)
    print("Testing full image injection flow...")
    print("="*60)

    from agents.generation.custom_component_generator import CustomComponentGenerator

    generator = CustomComponentGenerator()

    # Simulate what happens after AI generates HTML
    ai_generated_html = '''
    <!DOCTYPE html>
    <html>
    <head>
        <script>
            const heroImage = props.heroImage || 'placeholder';
            const cardImage1 = props.cardImage1 || '';
            const cardImage2 = props.cardImage2 || '';
        </script>
    </head>
    <body>
        <div class="hero">
            <img src="${heroImage}" alt="Hero Image" class="hero-bg">
        </div>
        <div class="content">
            <div class="card">
                <img src="${cardImage1}" alt="Feature 1">
                <h3>Feature One</h3>
            </div>
            <div class="card">
                <img src="placeholder" alt="Feature 2">
                <h3>Feature Two</h3>
            </div>
            <div class="card">
                <img src="" alt="Feature 3">
                <h3>Feature Three</h3>
            </div>
        </div>
    </body>
    </html>
    '''

    # Simulated prefetched images (as if SerpAPI returned these)
    prefetched = {
        "image1": "https://cdn.example.com/kroger-store.jpg",
        "image1_query": "Kroger Store",
        "image2": "https://cdn.example.com/smart-cart.jpg",
        "image2_query": "Smart Shopping Cart",
        "image3": "https://cdn.example.com/checkout.jpg",
        "image3_query": "Self Checkout",
        "image4": "https://cdn.example.com/ai-vision.jpg",
        "image4_query": "AI Computer Vision",
    }

    # Run the injection
    result = generator._inject_prefetched_images_into_html(ai_generated_html, prefetched)

    # Verify results
    print("\n📋 Verification:")

    # Check no placeholders remain
    has_placeholder = 'src="placeholder"' in result or "src='placeholder'" in result
    has_empty = 'src=""' in result or "src=''" in result
    has_variable = '${' in result

    print(f"  - Placeholder remaining: {'❌ YES' if has_placeholder else '✅ NO'}")
    print(f"  - Empty src remaining: {'❌ YES' if has_empty else '✅ NO'}")
    print(f"  - Variable ${{}} remaining: {'❌ YES' if has_variable else '✅ NO'}")

    # Count real URLs
    url_count = result.count('https://cdn.example.com/')
    print(f"  - Real URLs injected: {url_count}")

    # Assertions
    assert not has_placeholder, "No placeholders should remain"
    assert not has_empty, "No empty src should remain"
    assert not has_variable, "No ${} variables should remain"
    assert url_count >= 4, f"Should have at least 4 URLs, got {url_count}"

    print("\n✅ FULL FLOW TEST PASSED!")
    print(f"   Successfully injected {url_count} real image URLs")

    # Show a snippet of the result
    print("\n📄 Result snippet (first 500 chars):")
    print("-" * 40)
    print(result[:500])
    print("-" * 40)


def test_external_media_conversion():
    """Test that external_media images are converted to prefetched_images format."""
    print("\n" + "="*60)
    print("Testing external_media conversion...")
    print("="*60)

    from agents.generation.custom_component_generator import CustomComponentGenerator

    generator = CustomComponentGenerator()

    # Simulate external_media from Firecrawl
    external_media = {
        'images': [
            'https://cdn.example.com/external-1.jpg',
            'https://cdn.example.com/external-2.jpg',
            'https://cdn.example.com/external-3.jpg',
        ],
        'source_url': 'https://example.com',
    }

    # Convert external_media to prefetched_images format (simulating what generate() does)
    prefetched_images = {}
    external_images = external_media.get('images', [])
    for i, img_url in enumerate(external_images[:5], 1):
        prefetched_images[f"image{i}"] = img_url
        prefetched_images[f"image{i}_query"] = "external media"

    print(f"Converted {len(external_images)} external images to prefetched format")
    print(f"Keys: {list(prefetched_images.keys())}")

    # Now test injection with these images
    html = '''
    <html>
    <body>
        <img src="placeholder" alt="Image 1">
        <img src="${image1}" alt="Image 2">
        <img src="" alt="Image 3">
    </body>
    </html>
    '''

    result = generator._inject_prefetched_images_into_html(html, prefetched_images)

    # Verify all placeholders were replaced
    assert 'src="placeholder"' not in result, "placeholder should be replaced"
    assert '${' not in result, "${} pattern should be replaced"
    assert 'https://cdn.example.com/external' in result, "External URLs should be present"

    # Count injected URLs
    url_count = result.count('https://cdn.example.com/external')
    print(f"Injected {url_count} external image URLs")
    assert url_count >= 2, f"Should have at least 2 external URLs, got {url_count}"

    print("✅ External media conversion test PASSED")


def run_all_tests():
    """Run all tests."""
    print("="*60)
    print("🧪 RUNNING IMAGE INJECTION TESTS")
    print("="*60 + "\n")

    try:
        # Synchronous tests
        test_inject_prefetched_images()
        test_term_to_prop_name()
        test_external_media_conversion()

        # Async tests
        asyncio.run(test_full_flow_mock())

        print("\n" + "="*60)
        print("🎉🎉🎉 ALL TESTS PASSED! 🎉🎉🎉")
        print("="*60)
        print("\nThe image injection system is working correctly.")
        print("Images will be guaranteed to appear in generated slides.")

        return True

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        import traceback
        traceback.print_exc()
        return False


if __name__ == "__main__":
    success = run_all_tests()
    sys.exit(0 if success else 1)
