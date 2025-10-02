#!/usr/bin/env python3
"""
Debug helper to monitor font sizing in real-time during slide generation.
Run this alongside your slide generation to see font sizing decisions.
"""

import sys
import re
from datetime import datetime


def monitor_logs():
    """Monitor logs for font sizing operations."""
    print("=" * 80)
    print("FONT SIZING MONITOR - Watching for sizing operations...")
    print("=" * 80)
    print()

    # Patterns to watch for
    patterns = {
        'slide_start': r'\[SLIDE GENERATOR\].*Applying font sizing to slide (\d+)',
        'validator': r'\[COMPONENT VALIDATOR\].*applying adaptive font sizing to (\d+) components',
        'sizing': r'\[FONT SIZING\].*\'(.+?)\'.*-> ([\d.]+)px.*container=([\d.]+)x([\d.]+)',
        'complete': r'\[COMPONENT VALIDATOR\].*Applied font sizing to (\d+) text components',
        'title': r'✅ Title:.*-> ([\d.]+)px',
        'text': r'✅ (TextBlock|TiptapTextBlock):.*-> ([\d.]+)px'
    }

    slide_data = {}
    current_slide = None

    print("Monitoring for font sizing operations...")
    print("(This will show font sizes as slides are generated)")
    print()

    try:
        for line in sys.stdin:
            # Check for slide start
            match = re.search(patterns['slide_start'], line)
            if match:
                current_slide = int(match.group(1))
                slide_data[current_slide] = {'components': []}
                print(f"\n{'=' * 60}")
                print(f"📊 SLIDE {current_slide} - Starting font sizing")
                print(f"{'=' * 60}")

            # Check for component validator
            match = re.search(patterns['validator'], line)
            if match:
                count = match.group(1)
                print(f"   Processing {count} components...")

            # Check for individual sizing
            match = re.search(patterns['sizing'], line)
            if match:
                text = match.group(1)[:30]
                size = float(match.group(2))
                width = float(match.group(3))
                height = float(match.group(4))

                # Determine if size is reasonable
                status = "✅"
                if size < 10:
                    status = "⚠️ TOO SMALL"
                elif size > 200:
                    status = "⚠️ TOO LARGE"
                elif size == 16:
                    status = "❌ DEFAULT SIZE"

                print(f"   {status} '{text}...' -> {size:.1f}px (in {width:.0f}x{height:.0f}px)")

                if current_slide:
                    slide_data[current_slide]['components'].append({
                        'text': text,
                        'size': size,
                        'container': (width, height)
                    })

            # Check for completion
            match = re.search(patterns['complete'], line)
            if match and current_slide:
                count = match.group(1)
                print(f"\n   ✅ Completed: {count} components sized")

                # Show summary
                if current_slide in slide_data and slide_data[current_slide]['components']:
                    sizes = [c['size'] for c in slide_data[current_slide]['components']]
                    print(f"   📊 Size range: {min(sizes):.1f}px - {max(sizes):.1f}px")
                    print(f"   📊 Average: {sum(sizes)/len(sizes):.1f}px")

    except KeyboardInterrupt:
        print("\n\nStopped monitoring.")

    # Final summary
    if slide_data:
        print(f"\n{'=' * 80}")
        print("SUMMARY - Font Sizing Results")
        print(f"{'=' * 80}")

        all_sizes = []
        for slide_num, data in slide_data.items():
            if data['components']:
                sizes = [c['size'] for c in data['components']]
                all_sizes.extend(sizes)
                print(f"  Slide {slide_num}: {len(sizes)} components, {min(sizes):.1f}-{max(sizes):.1f}px")

        if all_sizes:
            print(f"\n  Overall: {min(all_sizes):.1f}-{max(all_sizes):.1f}px (avg: {sum(all_sizes)/len(all_sizes):.1f}px)")

            # Check for issues
            small = [s for s in all_sizes if s < 10]
            default = [s for s in all_sizes if s == 16]
            large = [s for s in all_sizes if s > 200]

            if small or default or large:
                print("\n  ⚠️ POTENTIAL ISSUES:")
                if small:
                    print(f"    - {len(small)} components with size < 10px")
                if default:
                    print(f"    - {len(default)} components with size = 16px (possible hardcode)")
                if large:
                    print(f"    - {len(large)} components with size > 200px")
            else:
                print("\n  ✅ No sizing issues detected!")


def test_example():
    """Generate example output to test the monitor."""
    print("[SLIDE GENERATOR] 🎨 Applying font sizing to slide 1")
    print("[COMPONENT VALIDATOR] Theme provided, applying adaptive font sizing to 3 components")
    print("[FONT SIZING] Calculating size for: 'Quarterly Review 202...' in 800x150px container")
    print("[FONT SIZING] 'Quarterly Review 2024...' -> 65.5px (container=800x150, iterations=8, lines=1, confidence=0.75)")
    print("  ✅ Title: 'Quarterly Review 2024...' -> 65.5px (container=800x150)")
    print("[FONT SIZING] Calculating size for: 'Revenue increased by...' in 600x200px container")
    print("[FONT SIZING] 'Revenue increased by 45%...' -> 38.2px (container=600x200, iterations=7, lines=2, confidence=0.85)")
    print("  ✅ TextBlock: 'Revenue increased by 45%...' -> 38.2px (container=600x200)")
    print("[COMPONENT VALIDATOR] ✅ Applied font sizing to 2 text components")
    print("[SLIDE GENERATOR] ✅ Validated 3 components")


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description="Monitor font sizing in slide generation")
    parser.add_argument("--test", action="store_true", help="Generate test output")
    args = parser.parse_args()

    if args.test:
        test_example()
    else:
        print("Usage: python your_slide_generator.py 2>&1 | python debug_font_sizing.py")
        print("Or: tail -f your_log_file.log | python debug_font_sizing.py")
        print("\nWaiting for input...")
        monitor_logs()