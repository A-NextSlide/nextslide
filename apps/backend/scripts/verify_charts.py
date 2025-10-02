#!/usr/bin/env python3
"""
Simple script to verify charts are being generated in financial presentations.
"""
import requests
import json

# Test prompt for financial presentation
test_prompt = """Create a Q4 2024 financial report presentation with:
- Revenue breakdown by category
- Year-over-year growth comparison  
- Profit margin trends
Include charts and graphs."""

# Make non-streaming request to get the full outline
url = "http://localhost:8000/api/openai/generate-outline"
data = {
    "prompt": test_prompt,
    "model": "gemini-2.5-flash-lite",
    "detailLevel": "quick"
}

print("Sending request to generate outline...")
response = requests.post(url, json=data)

if response.status_code == 200:
    result = response.json()
    slides = result.get("slides", [])
    
    print(f"\n✅ Generated {len(slides)} slides\n")
    
    charts_found = 0
    for i, slide in enumerate(slides, 1):
        title = slide.get("title", "Untitled")
        has_chart = bool(slide.get("extractedData"))
        
        if has_chart:
            charts_found += 1
            chart_type = slide["extractedData"].get("chartType", "unknown")
            data_points = len(slide["extractedData"].get("data", []))
            print(f"Slide {i}: {title}")
            print(f"  ✅ Has {chart_type} chart with {data_points} data points")
        else:
            print(f"Slide {i}: {title}")
            print(f"  ❌ No chart")
    
    print(f"\n📊 Summary: {charts_found}/{len(slides)} slides have charts")
    
    if charts_found > 0:
        print("\n✅ SUCCESS: Charts are being generated!")
        # Print sample chart data
        for slide in slides:
            if slide.get("extractedData"):
                print(f"\nSample chart data from '{slide['title']}':")
                print(json.dumps(slide["extractedData"], indent=2)[:500] + "...")
                break
    else:
        print("\n❌ FAILED: No charts were generated")
else:
    print(f"❌ Error: {response.status_code}")
    print(response.text) 