#!/usr/bin/env python3
"""
Sync Font Registry with Actual Files on Disk
Filters out fonts that don't have corresponding directories in extracted/
"""

import json
import os
from pathlib import Path

# Paths
BACKEND_ROOT = Path(__file__).parent.parent
EXTRACTED_DIR = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'downloads' / 'extracted'
FONT_LIST_PATH = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'font_list_simple.json'
FONT_REGISTRY_PATH = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry.json'
OUTPUT_PATH = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'font_list_simple_filtered.json'

def get_existing_font_ids():
    """Get list of font IDs that actually exist on disk"""
    if not EXTRACTED_DIR.exists():
        print(f"❌ Extracted directory not found: {EXTRACTED_DIR}")
        return set()

    existing = set()
    for item in EXTRACTED_DIR.iterdir():
        if item.is_dir():
            existing.add(item.name)

    return existing

def filter_font_list():
    """Filter font_list_simple.json to only include fonts that exist on disk"""

    # Get existing font IDs
    existing_ids = get_existing_font_ids()
    print(f"Found {len(existing_ids)} font directories on disk")

    # Load current font list
    with open(FONT_LIST_PATH, 'r') as f:
        font_list = json.load(f)

    original_count = len(font_list)
    print(f"Current registry contains {original_count} fonts")

    # Filter to only existing fonts
    filtered_fonts = []
    removed_fonts = []

    for font in font_list:
        font_id = font.get('id', '')
        if font_id in existing_ids:
            filtered_fonts.append(font)
        else:
            removed_fonts.append({
                'id': font_id,
                'name': font.get('name', 'Unknown')
            })

    print(f"\n✓ Keeping {len(filtered_fonts)} fonts")
    print(f"✗ Removing {len(removed_fonts)} fonts that don't exist on disk")

    # Show some removed fonts
    if removed_fonts:
        print("\nSample of removed fonts:")
        for font in removed_fonts[:10]:
            print(f"  - {font['name']} (ID: {font['id']})")
        if len(removed_fonts) > 10:
            print(f"  ... and {len(removed_fonts) - 10} more")

    # Save filtered list
    with open(OUTPUT_PATH, 'w') as f:
        json.dump(filtered_fonts, f, indent=2)

    print(f"\n✓ Saved filtered font list to: {OUTPUT_PATH}")
    print(f"\nTo apply changes, run:")
    print(f"  mv {OUTPUT_PATH} {FONT_LIST_PATH}")

    # Create a report
    report = {
        'original_count': original_count,
        'filtered_count': len(filtered_fonts),
        'removed_count': len(removed_fonts),
        'removed_fonts': removed_fonts
    }

    report_path = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'sync_report.json'
    with open(report_path, 'w') as f:
        json.dump(report, f, indent=2)

    print(f"✓ Saved detailed report to: {report_path}")

    return filtered_fonts, removed_fonts

def filter_font_registry():
    """Filter font_registry.json to only include fonts that exist on disk"""

    # Get existing font IDs
    existing_ids = get_existing_font_ids()

    # Load current registry
    with open(FONT_REGISTRY_PATH, 'r') as f:
        registry = json.load(f)

    original_count = len(registry)
    print(f"\nFiltering font_registry.json ({original_count} fonts)...")

    # Filter to only existing fonts
    filtered_registry = {
        font_id: font_data
        for font_id, font_data in registry.items()
        if font_id in existing_ids
    }

    print(f"✓ Keeping {len(filtered_registry)} fonts in registry")
    print(f"✗ Removing {original_count - len(filtered_registry)} fonts from registry")

    # Save filtered registry
    output_registry_path = BACKEND_ROOT / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry_filtered.json'
    with open(output_registry_path, 'w') as f:
        json.dump(filtered_registry, f, indent=2)

    print(f"✓ Saved filtered registry to: {output_registry_path}")
    print(f"\nTo apply changes, run:")
    print(f"  mv {output_registry_path} {FONT_REGISTRY_PATH}")

if __name__ == '__main__':
    print("=" * 60)
    print("Font Registry Sync Tool")
    print("=" * 60)
    print()

    try:
        # Filter both files
        filter_font_list()
        filter_font_registry()

        print("\n" + "=" * 60)
        print("✓ Sync complete!")
        print("=" * 60)
        print("\nNext steps:")
        print("1. Review the filtered files")
        print("2. Apply changes by moving the filtered files over the originals")
        print("3. Restart your backend server")

    except Exception as e:
        print(f"\n❌ Error: {e}")
        import traceback
        traceback.print_exc()
