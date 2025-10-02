#!/usr/bin/env python3
"""
Analyze deck generation bottlenecks by tracking detailed timing of each phase
"""

import asyncio
import aiohttp
import json
import uuid
import time
from datetime import datetime
from typing import Dict, List, Any, Tuple
from collections import defaultdict

API_BASE_URL = "http://localhost:9090"

class DetailedMetrics:
    """Track detailed metrics for each phase of generation"""
    
    def __init__(self, deck_id: str):
        self.deck_id = deck_id
        self.phases = defaultdict(lambda: {"start": None, "end": None, "events": []})
        self.events_timeline = []  # All events with timestamps
        self.slide_generation_details = {}  # Detailed info per slide
        
    def add_event(self, timestamp: float, event_type: str, data: Dict):
        self.events_timeline.append({
            "timestamp": timestamp,
            "event_type": event_type,
            "data": data
        })
        
        # Track phase transitions
        if event_type == "deck_creation_started":
            self.phases["deck_creation"]["start"] = timestamp
        elif event_type == "deck_created":
            self.phases["deck_creation"]["end"] = timestamp
            
        elif event_type == "image_search_started":
            self.phases["image_search"]["start"] = timestamp
        elif event_type == "images_collection_complete":
            self.phases["image_search"]["end"] = timestamp
            
        elif event_type == "slide_generated":
            slide_idx = data.get("slide_index", -1)
            if slide_idx not in self.slide_generation_details:
                self.slide_generation_details[slide_idx] = {
                    "start": None,
                    "end": timestamp,
                    "substeps": []
                }
            else:
                self.slide_generation_details[slide_idx]["end"] = timestamp
                
        # Track slide image phases
        elif "slide_images" in event_type:
            slide_idx = data.get("slide_index", -1)
            if slide_idx not in self.slide_generation_details:
                self.slide_generation_details[slide_idx] = {
                    "start": timestamp,
                    "end": None,
                    "substeps": []
                }
            self.slide_generation_details[slide_idx]["substeps"].append({
                "type": event_type,
                "timestamp": timestamp,
                "data": data
            })
            
    def analyze(self) -> Dict[str, Any]:
        """Analyze the collected metrics"""
        analysis = {
            "deck_id": self.deck_id,
            "phase_durations": {},
            "slide_analysis": {},
            "bottlenecks": [],
            "timeline_gaps": []
        }
        
        # Calculate phase durations
        for phase_name, phase_data in self.phases.items():
            if phase_data["start"] and phase_data["end"]:
                duration = phase_data["end"] - phase_data["start"]
                analysis["phase_durations"][phase_name] = {
                    "duration": duration,
                    "percentage": 0  # Will calculate after
                }
                
        # Calculate total time
        if self.events_timeline:
            total_time = self.events_timeline[-1]["timestamp"] - self.events_timeline[0]["timestamp"]
            
            # Update percentages
            for phase_name in analysis["phase_durations"]:
                duration = analysis["phase_durations"][phase_name]["duration"]
                analysis["phase_durations"][phase_name]["percentage"] = (duration / total_time) * 100
                
        # Analyze slide generation
        for slide_idx, slide_data in self.slide_generation_details.items():
            if slide_data["start"] and slide_data["end"]:
                slide_duration = slide_data["end"] - slide_data["start"]
                
                # Analyze substeps
                substep_durations = {}
                for i, substep in enumerate(slide_data["substeps"]):
                    if i > 0:
                        prev_substep = slide_data["substeps"][i-1]
                        duration = substep["timestamp"] - prev_substep["timestamp"]
                        substep_type = f"{prev_substep['type']}_to_{substep['type']}"
                        substep_durations[substep_type] = duration
                        
                analysis["slide_analysis"][slide_idx] = {
                    "total_duration": slide_duration,
                    "substep_durations": substep_durations
                }
                
        # Find timeline gaps (periods of inactivity)
        for i in range(1, len(self.events_timeline)):
            prev_event = self.events_timeline[i-1]
            curr_event = self.events_timeline[i]
            gap = curr_event["timestamp"] - prev_event["timestamp"]
            
            if gap > 5.0:  # Gaps larger than 5 seconds
                analysis["timeline_gaps"].append({
                    "start_event": prev_event["event_type"],
                    "end_event": curr_event["event_type"],
                    "gap_duration": gap,
                    "timestamp": prev_event["timestamp"]
                })
                
        # Identify bottlenecks
        if analysis["phase_durations"]:
            sorted_phases = sorted(
                analysis["phase_durations"].items(),
                key=lambda x: x[1]["duration"],
                reverse=True
            )
            
            for phase_name, phase_info in sorted_phases[:3]:
                if phase_info["percentage"] > 20:
                    analysis["bottlenecks"].append({
                        "phase": phase_name,
                        "duration": phase_info["duration"],
                        "percentage": phase_info["percentage"]
                    })
                    
        return analysis

async def analyze_single_deck_generation(num_slides: int = 3) -> DetailedMetrics:
    """Generate a single deck and collect detailed metrics"""
    
    deck_id = str(uuid.uuid4())
    metrics = DetailedMetrics(deck_id)
    
    outline = {
        "id": deck_id,
        "title": f"Bottleneck Analysis Deck - {datetime.now().strftime('%H:%M:%S')}",
        "slides": [
            {
                "id": str(uuid.uuid4()),
                "title": f"Analysis Slide {i+1}",
                "contentBlocks": [
                    f"Content for bottleneck analysis slide {i+1}",
                    "Testing generation performance"
                ]
            }
            for i in range(num_slides)
        ]
    }
    
    start_time = time.time()
    
    async with aiohttp.ClientSession() as session:
        print(f"🔍 Starting bottleneck analysis for deck with {num_slides} slides...")
        
        try:
            async with session.post(
                f"{API_BASE_URL}/api/deck/create-from-outline",
                json={"outline": outline, "async_images": True},
                headers={"Content-Type": "application/json"}
            ) as response:
                if response.status != 200:
                    error_text = await response.text()
                    print(f"❌ Error: HTTP {response.status}: {error_text}")
                    return metrics
                    
                # Process SSE stream
                async for line in response.content:
                    line = line.decode('utf-8').strip()
                    if line.startswith('data: '):
                        try:
                            data = json.loads(line[6:])
                            event_type = data.get('type', '')
                            current_time = time.time()
                            
                            metrics.add_event(current_time, event_type, data)
                            
                            # Print key events
                            if event_type in ['deck_created', 'image_search_started', 
                                            'images_collection_complete', 'slide_generated',
                                            'deck_complete']:
                                elapsed = current_time - start_time
                                print(f"  [{elapsed:6.2f}s] {event_type}")
                                
                        except json.JSONDecodeError:
                            pass
                            
        except Exception as e:
            print(f"❌ Error: {str(e)}")
            
    return metrics

def print_analysis(analysis: Dict[str, Any]):
    """Print the analysis results in a readable format"""
    
    print("\n" + "="*80)
    print("BOTTLENECK ANALYSIS RESULTS")
    print("="*80)
    
    print("\n📊 Phase Durations:")
    if analysis["phase_durations"]:
        for phase, info in sorted(analysis["phase_durations"].items(), 
                                 key=lambda x: x[1]["duration"], reverse=True):
            print(f"  {phase:25s}: {info['duration']:6.2f}s ({info['percentage']:5.1f}%)")
    else:
        print("  No phase data collected")
        
    print("\n🐌 Major Bottlenecks:")
    if analysis["bottlenecks"]:
        for bottleneck in analysis["bottlenecks"]:
            print(f"  - {bottleneck['phase']}: {bottleneck['duration']:.2f}s ({bottleneck['percentage']:.1f}% of total time)")
    else:
        print("  No significant bottlenecks identified")
        
    print("\n📑 Slide Generation Details:")
    if analysis["slide_analysis"]:
        for slide_idx in sorted(analysis["slide_analysis"].keys()):
            slide_info = analysis["slide_analysis"][slide_idx]
            print(f"\n  Slide {slide_idx + 1}:")
            print(f"    Total duration: {slide_info['total_duration']:.2f}s")
            
            if slide_info["substep_durations"]:
                print("    Substeps:")
                for substep, duration in sorted(slide_info["substep_durations"].items(),
                                              key=lambda x: x[1], reverse=True):
                    print(f"      {substep}: {duration:.2f}s")
    else:
        print("  No slide generation data collected")
        
    print("\n⏸️  Timeline Gaps (> 5s):")
    if analysis["timeline_gaps"]:
        for gap in sorted(analysis["timeline_gaps"], key=lambda x: x["gap_duration"], reverse=True)[:5]:
            print(f"  - {gap['gap_duration']:.1f}s gap between {gap['start_event']} and {gap['end_event']}")
    else:
        print("  No significant gaps found")

async def main():
    """Main analysis function"""
    
    print("🚀 Deck Generation Bottleneck Analysis")
    print("="*80)
    
    # Test with different slide counts
    test_configs = [
        {"slides": 1, "desc": "Single slide deck"},
        {"slides": 3, "desc": "Small deck (3 slides)"},
        {"slides": 5, "desc": "Medium deck (5 slides)"},
    ]
    
    for config in test_configs:
        print(f"\n\nTesting: {config['desc']}")
        print("-"*50)
        
        metrics = await analyze_single_deck_generation(config["slides"])
        analysis = metrics.analyze()
        print_analysis(analysis)
        
        # Wait between tests
        if config != test_configs[-1]:
            print("\n⏳ Waiting 5 seconds before next test...")
            await asyncio.sleep(5)
            
    # Additional analysis: Check API response times
    print("\n\n" + "="*80)
    print("API LATENCY ANALYSIS")
    print("="*80)
    
    await test_api_latency()
    
    print("\n✅ Analysis complete!")

async def test_api_latency():
    """Test latency of different API calls"""
    
    async with aiohttp.ClientSession() as session:
        # Test simple endpoint latency
        endpoints = [
            {"url": f"{API_BASE_URL}/", "desc": "Root endpoint"},
            {"url": f"{API_BASE_URL}/api/deck/create-from-outline-debug", "desc": "Debug endpoint", "method": "POST"},
        ]
        
        for endpoint in endpoints:
            method = endpoint.get("method", "GET")
            
            # Measure latency
            latencies = []
            for _ in range(5):
                start = time.time()
                
                try:
                    if method == "GET":
                        async with session.get(endpoint["url"]) as response:
                            await response.text()
                    else:
                        async with session.post(
                            endpoint["url"],
                            json={"test": "latency"},
                            headers={"Content-Type": "application/json"}
                        ) as response:
                            await response.text()
                            
                    latency = (time.time() - start) * 1000  # Convert to ms
                    latencies.append(latency)
                    
                except Exception as e:
                    print(f"  Error testing {endpoint['desc']}: {str(e)}")
                    
            if latencies:
                avg_latency = sum(latencies) / len(latencies)
                print(f"\n  {endpoint['desc']}:")
                print(f"    Average latency: {avg_latency:.1f}ms")
                print(f"    Min: {min(latencies):.1f}ms, Max: {max(latencies):.1f}ms")

if __name__ == "__main__":
    asyncio.run(main()) 