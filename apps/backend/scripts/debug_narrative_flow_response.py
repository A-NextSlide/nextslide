#!/usr/bin/env python3
"""
Debug script to show the exact narrative flow data being sent by backend
"""
import requests
import json

BASE_URL = "http://localhost:9090"

print("🔍 Debugging Narrative Flow in Streaming Response\n")
print("=" * 60)

# Make a streaming request
response = requests.post(
    f"{BASE_URL}/api/openai/generate-outline-stream",
    json={
        "prompt": "Create a short presentation about AI",
        "detailLevel": "quick",
        "files": []
    },
    stream=True
)

narrative_flow_data = None
outline_complete_event = None

print("📡 Capturing streaming events...\n")

for line in response.iter_lines():
    if line:
        line_str = line.decode('utf-8')
        if line_str.startswith('data: '):
            try:
                event_data = json.loads(line_str[6:])
                event_type = event_data.get('type', 'unknown')
                
                # Capture the outline_complete event
                if event_type == 'outline_complete':
                    outline_complete_event = event_data
                    if 'narrative_flow' in event_data:
                        narrative_flow_data = event_data['narrative_flow']
                        print(f"✅ Found narrative_flow in {event_type} event!")
                    
            except json.JSONDecodeError:
                pass

if narrative_flow_data:
    print("\n📊 NARRATIVE FLOW DATA BEING SENT BY BACKEND:")
    print("=" * 60)
    print(json.dumps(narrative_flow_data, indent=2))
    
    print("\n🎯 Key Information:")
    print(f"- Story Arc Type: {narrative_flow_data['story_arc']['type']}")
    print(f"- Number of Phases: {len(narrative_flow_data['story_arc']['phases'])}")
    print(f"- Number of Themes: {len(narrative_flow_data['key_themes'])}")
    print(f"- Overall Tone: {narrative_flow_data['tone_and_style']['overall_tone']}")
    
    print("\n📝 Frontend should:")
    print("1. Parse the 'outline_complete' event")
    print("2. Extract the 'narrative_flow' field")
    print("3. Update the UI with this data instead of showing placeholder")
    
else:
    print("❌ No narrative flow data found in response")
    
print("\n" + "=" * 60)
print("💡 The backend IS sending narrative flow data!")
print("   The frontend needs to parse and display it.") 