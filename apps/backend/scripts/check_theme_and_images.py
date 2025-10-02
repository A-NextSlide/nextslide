#!/usr/bin/env python3
"""Quick diagnostic to check theme and image timing"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.append(str(Path(__file__).parent.parent))

from datetime import datetime

def analyze_logs(log_file_path):
    """Analyze logs for theme and image timing"""
    
    theme_events = []
    image_events = []
    slide_events = []
    
    with open(log_file_path, 'r') as f:
        for line in f:
            timestamp = None
            if ' - INFO - ' in line:
                try:
                    timestamp = line.split(' - ')[0]
                except:
                    pass
                    
            # Theme events
            if 'Theme generation' in line or 'THEME' in line:
                theme_events.append((timestamp, line.strip()))
            
            # Image events  
            if 'image' in line.lower() and ('found' in line or 'search' in line):
                image_events.append((timestamp, line.strip()))
                
            # Slide generation events
            if 'Generating slide' in line or 'SLIDE GENERATION' in line:
                slide_events.append((timestamp, line.strip()))
    
    print("=" * 80)
    print("THEME GENERATION TIMELINE")
    print("=" * 80)
    for ts, event in theme_events[:10]:  # First 10 theme events
        print(f"{ts}: {event[:120]}...")
        
    print("\n" + "=" * 80)
    print("IMAGE SEARCH TIMELINE")
    print("=" * 80)
    for ts, event in image_events[:10]:  # First 10 image events
        print(f"{ts}: {event[:120]}...")
        
    print("\n" + "=" * 80)
    print("SLIDE GENERATION TIMELINE")
    print("=" * 80)
    for ts, event in slide_events[:10]:  # First 10 slide events
        print(f"{ts}: {event[:120]}...")

    # Check for timing issues
    print("\n" + "=" * 80)
    print("TIMING ANALYSIS")
    print("=" * 80)
    
    # Find first slide generation
    first_slide = None
    for ts, event in slide_events:
        if 'Generating slide 1' in event:
            first_slide = ts
            break
            
    # Find theme completion
    theme_complete = None
    for ts, event in theme_events:
        if 'Theme generation completed' in event or 'Using theme colors' in event:
            theme_complete = ts
            break
            
    # Find first images
    first_images = None
    for ts, event in image_events:
        if 'images found' in event or 'Found' in event:
            first_images = ts
            break
    
    if first_slide:
        print(f"First slide generation: {first_slide}")
    if theme_complete:
        print(f"Theme completion: {theme_complete}")
    else:
        print("⚠️ Theme completion not found in logs!")
    if first_images:
        print(f"First images found: {first_images}")
        
    # Check order
    if first_slide and theme_complete:
        if first_slide < theme_complete:
            print("\n❌ PROBLEM: Slides started before theme was ready!")
        else:
            print("\n✅ Good: Theme completed before slides")
            
    if first_slide and first_images:
        if first_slide < first_images:
            print("⚠️ WARNING: Slides started before images were found")
        else:
            print("✅ Good: Images found before slides")

if __name__ == "__main__":
    # Check if server.log exists
    log_file = "server.log"
    if Path(log_file).exists():
        print(f"Analyzing {log_file}...")
        analyze_logs(log_file)
    else:
        print(f"Log file {log_file} not found")
        print("Please save your logs to server.log and run again")
