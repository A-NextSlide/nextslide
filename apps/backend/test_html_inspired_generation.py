"""
End-to-end test for HTML-inspired slide generation.

Tests the new HTML-thinking approach with multiple slide types.
"""

import asyncio
import json
import sys
from pathlib import Path
from typing import List, Dict, Any
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent))

from agents.generation.html_inspired_generator import HTMLInspiredSlideGenerator
from agents.generation.slide_generator import SlideGeneratorV2
from agents.domain.models import SlideGenerationContext, SlideOutline, DeckOutline
from agents.generation.adapters import RAGRepositoryAdapter
from agents.generation.components.ai_generator import AISlideGenerator
from agents.generation.components.component_validator import ComponentValidator
from models.registry import RegistryManager
from agents.generation.theme_generator import ThemeGenerator
from agents.ai.llm_service import LLMService
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class MockTheme:
    """Mock theme for testing"""
    def __init__(self):
        self.primary_color = '#3B82F6'
        self.secondary_color = '#8B5CF6'
        self.accent_1 = '#EC4899'
        self.accent_2 = '#F59E0B'
        self.accent_3 = '#10B981'
        self.background = '#FFFFFF'
        self.text_color = '#1F2937'
        self.heading_font = 'Inter'
        self.body_font = 'Inter'
    
    def to_dict(self):
        return {
            'primary_color': self.primary_color,
            'secondary_color': self.secondary_color,
            'accent_1': self.accent_1,
            'accent_2': self.accent_2,
            'accent_3': self.accent_3,
            'background': self.background,
            'text_color': self.text_color,
            'heading_font': self.heading_font,
            'body_font': self.body_font
        }


class TestSlideGenerator:
    """Test harness for HTML-inspired generation"""
    
    def __init__(self):
        self.setup_components()
    
    def setup_components(self):
        """Initialize all required components"""
        logger.info("🔧 Setting up test components...")
        
        # Initialize services
        self.llm_service = LLMService()
        self.registry = RegistryManager()
        self.rag_repository = RAGRepositoryAdapter()
        
        # Initialize generators
        self.ai_generator = AISlideGenerator(self.llm_service)
        self.component_validator = ComponentValidator(self.registry)
        self.theme_generator = ThemeGenerator()
        
        # Create base generator
        self.base_generator = SlideGeneratorV2(
            rag_repository=self.rag_repository,
            ai_generator=self.ai_generator,
            component_validator=self.component_validator,
            registry=self.registry,
            theme_system=self.theme_generator
        )
        
        # Wrap with HTML-inspired generator
        self.html_generator = HTMLInspiredSlideGenerator(self.base_generator)
        
        logger.info("✅ Test components initialized")
    
    def create_test_slides(self) -> List[Dict[str, Any]]:
        """Create test slide definitions covering different types"""
        return [
            {
                'title': 'The Future of AI',
                'content': 'Welcome to our presentation on artificial intelligence and its transformative impact on business.',
                'slide_type': 'title',
                'index': 0
            },
            {
                'title': '$2.4 Billion Market',
                'content': 'The global AI market is expected to reach $2.4 billion by 2025, representing a 135% year-over-year growth rate. This represents a massive opportunity for early movers.',
                'slide_type': 'stat',
                'index': 1
            },
            {
                'title': 'Key Performance Metrics',
                'content': 'Our platform shows impressive results: 450+ enterprise customers, 99.9% uptime, $45M ARR, and 8x ROI for customers within 6 months.',
                'slide_type': 'data',
                'index': 2
            },
            {
                'title': 'Traditional vs AI-Powered',
                'content': 'Traditional systems: 45% accuracy, 2 hours processing time, high error rate. AI-powered systems: 95% accuracy, 5 minutes processing time, minimal errors.',
                'slide_type': 'comparison',
                'index': 3
            },
            {
                'title': 'Implementation Roadmap',
                'content': 'Our four-phase approach: Phase 1 Research & Planning (Q1), Phase 2 System Design (Q2), Phase 3 Development & Testing (Q3), Phase 4 Launch & Scale (Q4).',
                'slide_type': 'process',
                'index': 4
            },
            {
                'title': 'Why This Matters',
                'content': 'AI is transforming how businesses operate. Companies that adopt AI see 3-5x productivity gains, reduced costs by 40%, and improved decision-making speed by 10x.',
                'slide_type': 'content',
                'index': 5
            }
        ]
    
    async def generate_test_slide(
        self,
        slide_def: Dict[str, Any],
        total_slides: int
    ) -> Dict[str, Any]:
        """Generate a single test slide"""
        
        logger.info(f"\n{'='*80}")
        logger.info(f"🎨 Generating: {slide_def['title']}")
        logger.info(f"   Type: {slide_def['slide_type']}")
        logger.info(f"{'='*80}\n")
        
        # Create context
        slide_outline = SlideOutline(
            title=slide_def['title'],
            content=slide_def['content'],
            slide_type=slide_def['slide_type']
        )
        
        deck_outline = DeckOutline(
            title="HTML-Inspired Test Deck",
            slides=[slide_outline],
            deck_purpose="Test modern web-inspired design patterns",
            target_audience="Design-conscious users"
        )
        
        context = SlideGenerationContext(
            slide_outline=slide_outline,
            slide_index=slide_def['index'],
            total_slides=total_slides,
            deck_outline=deck_outline,
            theme=MockTheme(),
            deck_uuid="test-html-inspired",
            user_id="test-user",
            tagged_media=[],
            research_data=None,
            brand_data=None
        )
        
        # Generate slide
        result = {
            'slide_def': slide_def,
            'components': [],
            'events': [],
            'success': False,
            'error': None
        }
        
        try:
            async for event in self.html_generator.generate_slide(context):
                result['events'].append(event)
                
                if event.get('type') == 'slide_completed':
                    result['components'] = event.get('slide', {}).get('components', [])
                    result['success'] = True
                    
                    logger.info(f"✅ Slide generated successfully!")
                    logger.info(f"   Components: {len(result['components'])}")
                    logger.info(f"   Types: {', '.join(set(c.get('type', 'unknown') for c in result['components']))}")
        
        except Exception as e:
            result['error'] = str(e)
            logger.error(f"❌ Error generating slide: {e}", exc_info=True)
        
        return result
    
    async def run_full_test(self) -> Dict[str, Any]:
        """Run complete test suite"""
        logger.info("\n" + "="*80)
        logger.info("🚀 HTML-INSPIRED SLIDE GENERATION TEST")
        logger.info("="*80 + "\n")
        
        test_slides = self.create_test_slides()
        results = []
        
        for slide_def in test_slides:
            result = await self.generate_test_slide(slide_def, len(test_slides))
            results.append(result)
            
            # Brief pause between slides
            await asyncio.sleep(1)
        
        # Analyze results
        analysis = self.analyze_results(results)
        
        # Print summary
        self.print_summary(results, analysis)
        
        # Save detailed results
        self.save_results(results, analysis)
        
        return {
            'results': results,
            'analysis': analysis
        }
    
    def analyze_results(self, results: List[Dict[str, Any]]) -> Dict[str, Any]:
        """Analyze generation results"""
        analysis = {
            'total_slides': len(results),
            'successful': sum(1 for r in results if r['success']),
            'failed': sum(1 for r in results if not r['success']),
            'component_stats': {},
            'by_slide_type': {}
        }
        
        for result in results:
            if not result['success']:
                continue
            
            slide_type = result['slide_def']['slide_type']
            components = result['components']
            
            # Count component types
            for comp in components:
                comp_type = comp.get('type', 'unknown')
                analysis['component_stats'][comp_type] = analysis['component_stats'].get(comp_type, 0) + 1
            
            # Per slide type stats
            if slide_type not in analysis['by_slide_type']:
                analysis['by_slide_type'][slide_type] = {
                    'count': 0,
                    'avg_components': 0,
                    'component_types': set()
                }
            
            stats = analysis['by_slide_type'][slide_type]
            stats['count'] += 1
            stats['avg_components'] = (stats['avg_components'] * (stats['count'] - 1) + len(components)) / stats['count']
            stats['component_types'].update(c.get('type') for c in components)
        
        # Convert sets to lists for JSON serialization
        for slide_type in analysis['by_slide_type']:
            analysis['by_slide_type'][slide_type]['component_types'] = list(
                analysis['by_slide_type'][slide_type]['component_types']
            )
        
        return analysis
    
    def print_summary(self, results: List[Dict[str, Any]], analysis: Dict[str, Any]):
        """Print test summary"""
        print("\n" + "="*80)
        print("📊 TEST RESULTS SUMMARY")
        print("="*80 + "\n")
        
        print(f"Total Slides: {analysis['total_slides']}")
        print(f"✅ Successful: {analysis['successful']}")
        print(f"❌ Failed: {analysis['failed']}")
        print(f"Success Rate: {analysis['successful']/analysis['total_slides']*100:.1f}%\n")
        
        print("Component Usage:")
        for comp_type, count in sorted(analysis['component_stats'].items(), key=lambda x: x[1], reverse=True):
            print(f"  • {comp_type}: {count}")
        
        print("\n" + "-"*80 + "\n")
        
        print("By Slide Type:")
        for slide_type, stats in analysis['by_slide_type'].items():
            print(f"\n  {slide_type.upper()}:")
            print(f"    Slides: {stats['count']}")
            print(f"    Avg Components: {stats['avg_components']:.1f}")
            print(f"    Component Types: {', '.join(stats['component_types'])}")
        
        print("\n" + "="*80 + "\n")
        
        # Print individual slide details
        print("INDIVIDUAL SLIDES:\n")
        for i, result in enumerate(results, 1):
            status = "✅" if result['success'] else "❌"
            print(f"{status} Slide {i}: {result['slide_def']['title']}")
            print(f"   Type: {result['slide_def']['slide_type']}")
            
            if result['success']:
                print(f"   Components: {len(result['components'])}")
                comp_types = [c.get('type') for c in result['components']]
                print(f"   Types: {', '.join(comp_types)}")
            else:
                print(f"   Error: {result['error']}")
            print()
    
    def save_results(self, results: List[Dict[str, Any]], analysis: Dict[str, Any]):
        """Save results to file"""
        output_dir = Path(__file__).parent / 'test_output' / 'html_inspired'
        output_dir.mkdir(parents=True, exist_ok=True)
        
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        
        # Save full results
        results_file = output_dir / f'results_{timestamp}.json'
        with open(results_file, 'w') as f:
            json.dump({
                'timestamp': timestamp,
                'results': results,
                'analysis': analysis
            }, f, indent=2, default=str)
        
        logger.info(f"💾 Results saved to: {results_file}")
        
        # Save individual slide JSON for inspection
        for i, result in enumerate(results):
            if result['success']:
                slide_file = output_dir / f'slide_{i+1}_{result["slide_def"]["slide_type"]}_{timestamp}.json'
                with open(slide_file, 'w') as f:
                    json.dump({
                        'title': result['slide_def']['title'],
                        'type': result['slide_def']['slide_type'],
                        'components': result['components']
                    }, f, indent=2)


async def main():
    """Run the test"""
    try:
        tester = TestSlideGenerator()
        await tester.run_full_test()
        
        print("\n🎉 Test complete! Check test_output/html_inspired/ for detailed results.\n")
        
    except Exception as e:
        logger.error(f"Test failed: {e}", exc_info=True)
        print(f"\n❌ Test failed: {e}\n")
        return 1
    
    return 0


if __name__ == '__main__':
    exit_code = asyncio.run(main())
    sys.exit(exit_code)

