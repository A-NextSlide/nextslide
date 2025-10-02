#!/usr/bin/env python3
"""
Comprehensive performance analysis for deck generation to identify bottlenecks.
"""
import asyncio
import json
import sys
import os
import time
from datetime import datetime
from collections import defaultdict

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from models.requests import DeckOutline, SlideOutline
from models.registry import ComponentRegistry
from agents.generation.deck_composer import compose_deck_stream


class PerformanceAnalyzer:
    """Tracks performance metrics during deck generation."""
    
    def __init__(self):
        self.metrics = {
            'phases': {},
            'events': [],
            'errors': [],
            'theme_events': [],
            'slide_events': [],
            'timing_issues': []
        }
        self.phase_start_times = {}
        self.event_timings = defaultdict(list)
        
    def record_event(self, event_type, data, timestamp):
        """Record an event with timing information."""
        self.metrics['events'].append({
            'type': event_type,
            'timestamp': timestamp,
            'data': data
        })
        
        # Track phase transitions
        if event_type == 'progress':
            phase = data.get('phase', 'unknown')
            if phase not in self.phase_start_times:
                self.phase_start_times[phase] = timestamp
                self.metrics['phases'][phase] = {
                    'start': timestamp,
                    'events': []
                }
            self.metrics['phases'][phase]['events'].append(data)
            
        # Track theme-specific events
        elif event_type in ['theme_generated', 'theme_started']:
            self.metrics['theme_events'].append({
                'type': event_type,
                'timestamp': timestamp,
                'data': data
            })
            
        # Track slide events
        elif event_type in ['slide_started', 'slide_completed', 'slide_error']:
            self.metrics['slide_events'].append({
                'type': event_type,
                'timestamp': timestamp,
                'slide_index': data.get('slide_index', -1),
                'data': data
            })
            
        # Track errors
        elif event_type == 'error':
            self.metrics['errors'].append({
                'timestamp': timestamp,
                'message': data.get('message', 'Unknown error'),
                'data': data
            })
    
    def analyze_timing(self):
        """Analyze timing issues."""
        # Check if theme was generated before slides
        theme_gen_time = None
        first_slide_time = None
        
        for event in self.metrics['theme_events']:
            if event['type'] == 'theme_generated':
                theme_gen_time = event['timestamp']
                break
                
        for event in self.metrics['slide_events']:
            if event['type'] == 'slide_started':
                first_slide_time = event['timestamp']
                break
        
        if theme_gen_time and first_slide_time:
            diff = (datetime.fromisoformat(first_slide_time) - 
                   datetime.fromisoformat(theme_gen_time)).total_seconds()
            if diff < 0:
                self.metrics['timing_issues'].append({
                    'issue': 'Theme generated AFTER first slide started',
                    'delay': abs(diff)
                })
        elif not theme_gen_time:
            self.metrics['timing_issues'].append({
                'issue': 'No theme generation event detected'
            })
            
    def generate_report(self):
        """Generate a performance report."""
        self.analyze_timing()
        
        report = []
        report.append("\n" + "="*80)
        report.append("PERFORMANCE ANALYSIS REPORT")
        report.append("="*80)
        
        # Phase analysis
        report.append("\n📊 PHASE TIMING:")
        for phase, data in self.metrics['phases'].items():
            events = data['events']
            if events:
                duration = (datetime.fromisoformat(events[-1].get('timestamp', data['start'])) - 
                           datetime.fromisoformat(data['start'])).total_seconds()
                report.append(f"  - {phase}: {duration:.2f}s ({len(events)} events)")
        
        # Theme analysis
        report.append("\n🎨 THEME GENERATION:")
        if self.metrics['theme_events']:
            for event in self.metrics['theme_events']:
                report.append(f"  - {event['type']} at {event['timestamp']}")
        else:
            report.append("  ⚠️  NO THEME EVENTS DETECTED!")
            
        # Slide timing
        report.append("\n📄 SLIDE GENERATION:")
        slide_timings = defaultdict(dict)
        for event in self.metrics['slide_events']:
            idx = event['slide_index']
            if event['type'] == 'slide_started':
                slide_timings[idx]['start'] = event['timestamp']
            elif event['type'] == 'slide_completed':
                slide_timings[idx]['end'] = event['timestamp']
                
        for idx in sorted(slide_timings.keys()):
            timing = slide_timings[idx]
            if 'start' in timing and 'end' in timing:
                duration = (datetime.fromisoformat(timing['end']) - 
                           datetime.fromisoformat(timing['start'])).total_seconds()
                report.append(f"  - Slide {idx + 1}: {duration:.2f}s")
            else:
                report.append(f"  - Slide {idx + 1}: INCOMPLETE")
        
        # Timing issues
        if self.metrics['timing_issues']:
            report.append("\n⚠️  TIMING ISSUES:")
            for issue in self.metrics['timing_issues']:
                report.append(f"  - {issue['issue']}")
                if 'delay' in issue:
                    report.append(f"    Delay: {issue['delay']:.2f}s")
        
        # Errors
        if self.metrics['errors']:
            report.append("\n❌ ERRORS:")
            for error in self.metrics['errors'][:5]:  # First 5 errors
                report.append(f"  - {error['timestamp']}: {error['message']}")
                
        return "\n".join(report)


async def analyze_generation_performance():
    """Run performance analysis on deck generation."""
    print("\n🔬 Starting comprehensive performance analysis...\n")
    
    analyzer = PerformanceAnalyzer()
    
    # Create test deck
    deck_outline = DeckOutline(
        id="perf-test-deck-001",
        title="Performance Test Deck",
        stylePreferences={
            "visualStyle": "modern",
            "colorScheme": "vibrant",
            "vibeContext": "professional technology presentation"
        },
        slides=[
            SlideOutline(
                id=f"slide-{i}",
                title=f"Test Slide {i}",
                content=f"Content for performance testing slide {i}.",
                layout="title_and_content",
                suggestions=[]
            )
            for i in range(1, 4)  # 3 slides for testing
        ]
    )
    
    # Initialize registry
    registry = ComponentRegistry(json_schemas=None)
    
    start_time = time.time()
    
    try:
        # Monitor deck generation
        async for event in compose_deck_stream(
            deck_outline=deck_outline,
            registry=registry,
            deck_uuid="perf-test-" + datetime.now().strftime("%Y%m%d-%H%M%S"),
            max_parallel=2,
            async_images=False  # Disable to focus on theme/slide timing
        ):
            timestamp = datetime.now().isoformat()
            event_type = event.get('type', 'unknown')
            
            # Record all events
            analyzer.record_event(event_type, event, timestamp)
            
            # Log significant events
            if event_type == 'theme_generated':
                print(f"🎨 THEME GENERATED at {timestamp}")
            elif event_type == 'slide_started':
                idx = event.get('slide_index', -1)
                print(f"📄 Slide {idx + 1} STARTED at {timestamp}")
            elif event_type == 'slide_completed':
                idx = event.get('slide_index', -1)
                print(f"✅ Slide {idx + 1} COMPLETED at {timestamp}")
            elif event_type == 'progress':
                data = event.get('data', {})
                phase = data.get('phase', 'unknown')
                progress = data.get('progress', 0)
                print(f"⏳ {phase}: {progress}% - {data.get('message', '')}")
                
    except Exception as e:
        print(f"\n❌ ERROR during analysis: {str(e)}")
        import traceback
        traceback.print_exc()
        
    end_time = time.time()
    total_duration = end_time - start_time
    
    # Generate and print report
    report = analyzer.generate_report()
    print(report)
    
    print(f"\n⏱️  TOTAL GENERATION TIME: {total_duration:.2f}s")
    
    # Save detailed metrics
    metrics_file = f"test_output/performance_metrics_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
    os.makedirs("test_output", exist_ok=True)
    with open(metrics_file, 'w') as f:
        json.dump(analyzer.metrics, f, indent=2, default=str)
    print(f"\n📊 Detailed metrics saved to: {metrics_file}")
    
    return analyzer.metrics


async def main():
    """Run the performance analysis."""
    metrics = await analyze_generation_performance()
    
    # Check for critical issues
    if metrics['timing_issues']:
        print("\n⚠️  CRITICAL: Theme timing issues detected!")
        sys.exit(1)
    else:
        print("\n✅ No critical timing issues detected.")
        sys.exit(0)


if __name__ == "__main__":
    asyncio.run(main())
