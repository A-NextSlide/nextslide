#!/usr/bin/env python3
"""Quick test script for the UniversalPPTXImporter"""

import asyncio
import sys
import logging
import json

# Set up logging to see what's happening
logging.basicConfig(level=logging.DEBUG, format='%(levelname)s - %(message)s')

async def test_importer(file_path: str):
    """Test importing a PPTX file"""
    from services.universal_pptx_importer import UniversalPPTXImporter

    print(f"\n{'='*60}")
    print(f"Testing PPTX Import: {file_path}")
    print(f"{'='*60}\n")

    importer = UniversalPPTXImporter()

    try:
        deck = await importer.import_file(file_path)

        print(f"\n{'='*60}")
        print("IMPORT RESULTS")
        print(f"{'='*60}\n")

        # Print summary
        print(f"Deck Name: {deck.get('name', 'Unknown')}")
        print(f"Total Slides: {len(deck.get('slides', []))}")

        # Print metadata
        metadata = deck.get('metadata', {})
        print(f"\nImport Stats:")
        stats = metadata.get('import_stats', {})
        for key, value in stats.items():
            if key != 'warnings':
                print(f"  {key}: {value}")

        # Print theme info
        theme = metadata.get('theme', {})
        print(f"\nTheme: {theme.get('name', 'Default')}")
        print(f"  Colors: {len(theme.get('colors', {}))} extracted")
        if theme.get('colors'):
            for name, color in list(theme.get('colors', {}).items())[:5]:
                print(f"    - {name}: {color}")
        print(f"  Fonts: {theme.get('fonts', {})}")

        # Print slide details
        print(f"\n{'='*60}")
        print("SLIDE DETAILS")
        print(f"{'='*60}")

        for i, slide in enumerate(deck.get('slides', [])):
            components = slide.get('components', [])
            print(f"\nSlide {i+1}: '{slide.get('title', 'Untitled')}'")
            print(f"  Components: {len(components)}")

            # Count by type
            type_counts = {}
            for comp in components:
                t = comp.get('type', 'Unknown')
                type_counts[t] = type_counts.get(t, 0) + 1

            for t, count in sorted(type_counts.items()):
                print(f"    - {t}: {count}")

            # Show first few text blocks
            text_blocks = [c for c in components if c.get('type') == 'TiptapTextBlock']
            if text_blocks:
                print(f"  Text content:")
                for tb in text_blocks[:3]:
                    texts = tb.get('props', {}).get('texts', [])
                    for t in texts[:2]:
                        text = t.get('text', '')[:80]
                        if text:
                            print(f"    - \"{text}...\"" if len(text) == 80 else f"    - \"{text}\"")

        print(f"\n{'='*60}")
        print("DESIGN SUMMARY (for style matching)")
        print(f"{'='*60}")
        design = importer.get_design_summary()
        if design:
            for key, value in design.items():
                if key not in ('all_colors', 'all_fonts'):
                    print(f"  {key}: {value}")

        # Save full output to JSON for inspection
        output_file = file_path.replace('.pptx', '_import_result.json')
        with open(output_file, 'w') as f:
            # Don't include full image data URLs in the output
            deck_copy = json.loads(json.dumps(deck))
            for slide in deck_copy.get('slides', []):
                for comp in slide.get('components', []):
                    if comp.get('type') == 'Image':
                        src = comp.get('props', {}).get('src', '')
                        if src and src.startswith('data:'):
                            comp['props']['src'] = f"{src[:50]}... [truncated base64]"
                    if comp.get('type') == 'Background':
                        bg_url = comp.get('props', {}).get('backgroundImageUrl', '')
                        if bg_url and bg_url.startswith('data:'):
                            comp['props']['backgroundImageUrl'] = f"{bg_url[:50]}... [truncated base64]"
            json.dump(deck_copy, f, indent=2)
        print(f"\nFull result saved to: {output_file}")

    except Exception as e:
        print(f"ERROR: {e}")
        import traceback
        traceback.print_exc()
        return 1

    return 0


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python test_pptx_import.py <path_to_pptx>")
        sys.exit(1)

    file_path = sys.argv[1]
    result = asyncio.run(test_importer(file_path))
    sys.exit(result)
