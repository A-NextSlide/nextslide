"""
Simplified HTML-inspired test focusing on prompt generation and patterns.

Tests the new HTML-thinking prompts without full infrastructure dependencies.
"""

import json
from pathlib import Path
from datetime import datetime

# Import only what we need
from agents.prompts.generation.html_inspired_system_prompt import (
    get_html_inspired_system_prompt,
    get_html_inspired_user_prompt_template
)
from agents.generation.customcomponent_library import (
    CUSTOMCOMPONENT_TEMPLATES,
    get_customcomponent_guidance,
    get_animated_counter_template,
    get_comparison_slider_template,
    get_progress_timeline_template,
    get_stat_card_grid_template
)
from agents.generation.design_pattern_examples import (
    DESIGN_PATTERNS,
    get_pattern_examples_text
)


class SimpleHTMLInspiredTest:
    """Simplified test of HTML-inspired patterns"""
    
    def __init__(self):
        self.theme = {
            'colors': {
                'primary': '#3B82F6',
                'secondary': '#8B5CF6',
                'accent': '#EC4899',
                'background': '#FFFFFF',
                'text': '#1F2937'
            },
            'fonts': {
                'heading': 'Inter',
                'body': 'Inter'
            }
        }
        
        self.output_dir = Path(__file__).parent / 'test_output' / 'html_inspired_simple'
        self.output_dir.mkdir(parents=True, exist_ok=True)
        
        self.timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    
    def test_system_prompt(self):
        """Test system prompt generation"""
        print("\n" + "="*80)
        print("TEST 1: System Prompt")
        print("="*80 + "\n")
        
        prompt = get_html_inspired_system_prompt()
        
        print(f"Length: {len(prompt)} characters")
        print(f"Lines: {len(prompt.split(chr(10)))} lines")
        
        # Check for key concepts
        concepts = [
            'HTML', 'web design', 'glassmorphism', 'hero section',
            'CustomComponent', 'card grid', 'split screen', 'overlap'
        ]
        
        found = {concept: concept.lower() in prompt.lower() for concept in concepts}
        
        print("\nKey Concepts Found:")
        for concept, is_found in found.items():
            status = "✅" if is_found else "❌"
            print(f"  {status} {concept}")
        
        # Save prompt
        output_file = self.output_dir / f'system_prompt_{self.timestamp}.txt'
        with open(output_file, 'w') as f:
            f.write(prompt)
        
        print(f"\n💾 Saved to: {output_file}")
        
        return all(found.values())
    
    def test_customcomponent_templates(self):
        """Test CustomComponent templates"""
        print("\n" + "="*80)
        print("TEST 2: CustomComponent Templates")
        print("="*80 + "\n")
        
        results = {}
        
        for name, info in CUSTOMCOMPONENT_TEMPLATES.items():
            print(f"\nTesting {name}...")
            
            try:
                # Generate template with test theme
                template_func = info['template']
                code = template_func(self.theme['colors'])
                
                # Basic validation
                is_valid = (
                    'function render' in code and
                    'React.createElement' in code and
                    'width: ' in code and
                    'height: ' in code
                )
                
                results[name] = {
                    'valid': is_valid,
                    'length': len(code),
                    'description': info['description'],
                    'use_cases': info['use_cases'],
                    'code_preview': code[:200] + '...'
                }
                
                status = "✅" if is_valid else "❌"
                print(f"  {status} {name}")
                print(f"     Description: {info['description']}")
                print(f"     Code length: {len(code)} chars")
                print(f"     Use cases: {', '.join(info['use_cases'][:2])}")
                
            except Exception as e:
                results[name] = {'valid': False, 'error': str(e)}
                print(f"  ❌ {name}: {e}")
        
        # Save templates
        output_file = self.output_dir / f'customcomponent_templates_{self.timestamp}.json'
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\n💾 Saved to: {output_file}")
        
        return all(r.get('valid', False) for r in results.values())
    
    def test_design_patterns(self):
        """Test design pattern examples"""
        print("\n" + "="*80)
        print("TEST 3: Design Pattern Examples")
        print("="*80 + "\n")
        
        results = {}
        
        for pattern_name, pattern_func in DESIGN_PATTERNS.items():
            print(f"\nTesting {pattern_name}...")
            
            try:
                pattern = pattern_func(self.theme)
                
                # Validate pattern structure
                is_valid = (
                    'pattern_name' in pattern and
                    'web_description' in pattern and
                    'components' in pattern and
                    len(pattern['components']) > 0
                )
                
                component_types = [c['type'] for c in pattern['components']]
                
                results[pattern_name] = {
                    'valid': is_valid,
                    'pattern_name': pattern['pattern_name'],
                    'description': pattern['web_description'],
                    'component_count': len(pattern['components']),
                    'component_types': component_types,
                    'full_pattern': pattern
                }
                
                status = "✅" if is_valid else "❌"
                print(f"  {status} {pattern['pattern_name']}")
                print(f"     Web concept: {pattern['web_description']}")
                print(f"     Components: {len(pattern['components'])}")
                print(f"     Types: {', '.join(set(component_types))}")
                
            except Exception as e:
                results[pattern_name] = {'valid': False, 'error': str(e)}
                print(f"  ❌ {pattern_name}: {e}")
        
        # Save patterns
        output_file = self.output_dir / f'design_patterns_{self.timestamp}.json'
        with open(output_file, 'w') as f:
            json.dump(results, f, indent=2, default=str)
        
        print(f"\n💾 Saved to: {output_file}")
        
        return all(r.get('valid', False) for r in results.values())
    
    def test_pattern_examples_text(self):
        """Test pattern examples text generation"""
        print("\n" + "="*80)
        print("TEST 4: Pattern Examples Text")
        print("="*80 + "\n")
        
        text = get_pattern_examples_text(self.theme)
        
        print(f"Generated text length: {len(text)} characters")
        print(f"\nPreview (first 500 chars):\n")
        print(text[:500] + "...\n")
        
        # Save text
        output_file = self.output_dir / f'pattern_examples_text_{self.timestamp}.txt'
        with open(output_file, 'w') as f:
            f.write(text)
        
        print(f"💾 Saved to: {output_file}")
        
        return len(text) > 500
    
    def test_customcomponent_guidance(self):
        """Test CustomComponent guidance text"""
        print("\n" + "="*80)
        print("TEST 5: CustomComponent Guidance")
        print("="*80 + "\n")
        
        guidance = get_customcomponent_guidance()
        
        print(f"Generated guidance length: {len(guidance)} characters")
        print(f"\nPreview (first 500 chars):\n")
        print(guidance[:500] + "...\n")
        
        # Save guidance
        output_file = self.output_dir / f'customcomponent_guidance_{self.timestamp}.txt'
        with open(output_file, 'w') as f:
            f.write(guidance)
        
        print(f"💾 Saved to: {output_file}")
        
        return len(guidance) > 300
    
    def test_complete_prompt_assembly(self):
        """Test assembling a complete prompt for a slide"""
        print("\n" + "="*80)
        print("TEST 6: Complete Prompt Assembly")
        print("="*80 + "\n")
        
        # Simulate different slide types
        test_cases = [
            {
                'title': 'The Future of AI',
                'content': 'Welcome to our presentation',
                'type': 'title'
            },
            {
                'title': '$2.4B Market Opportunity',
                'content': 'The AI market is growing rapidly',
                'type': 'stat'
            },
            {
                'title': 'Performance Metrics',
                'content': 'Key metrics: 450+ customers, 99.9% uptime, $45M ARR',
                'type': 'data'
            }
        ]
        
        results = []
        
        for i, test_case in enumerate(test_cases, 1):
            print(f"\nTest Case {i}: {test_case['type']} slide")
            print(f"  Title: {test_case['title']}")
            
            # Build a mock user prompt
            user_prompt = f"""
SLIDE TO CREATE:
• Title: {test_case['title']}
• Content: {test_case['content']}
• Type: {test_case['type']}

THEME COLORS:
{json.dumps(self.theme['colors'], indent=2)}

{get_customcomponent_guidance()}

{get_pattern_examples_text(self.theme)[:1000]}...
"""
            
            results.append({
                'test_case': test_case,
                'system_prompt_length': len(get_html_inspired_system_prompt()),
                'user_prompt_length': len(user_prompt),
                'total_tokens_estimate': (len(get_html_inspired_system_prompt()) + len(user_prompt)) / 4
            })
            
            print(f"  ✅ System prompt: {results[-1]['system_prompt_length']} chars")
            print(f"  ✅ User prompt: {results[-1]['user_prompt_length']} chars")
            print(f"  📊 Est. tokens: ~{int(results[-1]['total_tokens_estimate'])}")
            
            # Save complete prompt example
            output_file = self.output_dir / f'complete_prompt_{test_case["type"]}_{self.timestamp}.txt'
            with open(output_file, 'w') as f:
                f.write("SYSTEM PROMPT:\n")
                f.write("="*80 + "\n")
                f.write(get_html_inspired_system_prompt())
                f.write("\n\n")
                f.write("USER PROMPT:\n")
                f.write("="*80 + "\n")
                f.write(user_prompt)
        
        # Save results summary
        summary_file = self.output_dir / f'prompt_assembly_summary_{self.timestamp}.json'
        with open(summary_file, 'w') as f:
            json.dump(results, f, indent=2)
        
        print(f"\n💾 Results saved to: {summary_file}")
        
        return len(results) == len(test_cases)
    
    def run_all_tests(self):
        """Run all tests"""
        print("\n" + "🚀"*40)
        print("HTML-INSPIRED GENERATION TESTS")
        print("🚀"*40 + "\n")
        
        tests = [
            ("System Prompt", self.test_system_prompt),
            ("CustomComponent Templates", self.test_customcomponent_templates),
            ("Design Patterns", self.test_design_patterns),
            ("Pattern Examples Text", self.test_pattern_examples_text),
            ("CustomComponent Guidance", self.test_customcomponent_guidance),
            ("Complete Prompt Assembly", self.test_complete_prompt_assembly)
        ]
        
        results = {}
        
        for test_name, test_func in tests:
            try:
                result = test_func()
                results[test_name] = {'passed': result, 'error': None}
            except Exception as e:
                results[test_name] = {'passed': False, 'error': str(e)}
                print(f"\n❌ Test failed with error: {e}\n")
        
        # Print summary
        print("\n" + "="*80)
        print("TEST SUMMARY")
        print("="*80 + "\n")
        
        passed = sum(1 for r in results.values() if r['passed'])
        total = len(results)
        
        for test_name, result in results.items():
            status = "✅ PASS" if result['passed'] else "❌ FAIL"
            print(f"{status} - {test_name}")
            if result['error']:
                print(f"       Error: {result['error']}")
        
        print(f"\n{'='*80}")
        print(f"Results: {passed}/{total} tests passed ({passed/total*100:.0f}%)")
        print(f"{'='*80}\n")
        
        print(f"📁 All output saved to: {self.output_dir}\n")
        
        return passed == total


def main():
    """Run the simplified test"""
    try:
        tester = SimpleHTMLInspiredTest()
        success = tester.run_all_tests()
        
        if success:
            print("🎉 All tests passed!\n")
            return 0
        else:
            print("⚠️  Some tests failed. Check output for details.\n")
            return 1
            
    except Exception as e:
        print(f"\n❌ Test suite failed: {e}\n")
        import traceback
        traceback.print_exc()
        return 1


if __name__ == '__main__':
    import sys
    sys.exit(main())

