"""
Prompt compression utilities for reducing token usage.
"""

from typing import Dict, Any, List, Set
import re
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class PromptCompressor:
    """Compress prompts by removing redundancy while maintaining essential information."""
    
    # Keywords that indicate critical instructions
    CRITICAL_KEYWORDS = {
        'MANDATORY', 'MUST', 'CRITICAL', 'REQUIRED', 'ALWAYS', 'NEVER',
        'fontSize', 'padding', 'fontFamily', 'position', 'width', 'height'
    }
    
    def compress_rag_context(self, rag_context: Dict[str, Any]) -> Dict[str, Any]:
        """Compress RAG context by removing redundancy."""
        compressed = {}
        
        # Keep predicted components as-is (small)
        compressed['predicted_components'] = rag_context.get('predicted_components', [])
        
        # Compress critical rules
        if 'critical_rules' in rag_context:
            compressed['critical_rules'] = self._compress_critical_rules(rag_context['critical_rules'])
        
        # Keep only essential component schemas
        if 'component_schemas' in rag_context:
            predicted = set(rag_context.get('predicted_components', []))
            compressed['component_schemas'] = {
                comp: schema for comp, schema in rag_context['component_schemas'].items()
                if comp in predicted
            }
        
        # Compress examples - keep only one per component type
        if 'component_examples' in rag_context:
            compressed['component_examples'] = self._compress_examples(rag_context['component_examples'])
        
        # Compress other sections
        for key in ['layout_patterns', 'typography_rules', 'best_practices']:
            if key in rag_context:
                compressed[key] = self._deduplicate_list(rag_context[key])
        
        return compressed
    
    def _compress_critical_rules(self, rules: Dict[str, Any]) -> Dict[str, Any]:
        """Compress critical rules by removing verbosity and redundancy."""
        compressed = {}
        
        # Priority rules that should always be included
        priority_sections = {
            'visual_storytelling_mandatory', 'overlap_prevention', 
            'text_component_rules', 'chart_enforcement', 'validation'
        }
        
        for section, content in rules.items():
            if section in priority_sections:
                if isinstance(content, dict):
                    # Extract only the most important parts
                    compressed[section] = self._extract_essential_rules(content)
                elif isinstance(content, list):
                    # Deduplicate and shorten lists
                    compressed[section] = self._deduplicate_list(content)[:5]  # Max 5 items
                else:
                    compressed[section] = content
        
        # Add a compressed summary
        compressed['summary'] = self._create_rules_summary(rules)
        
        return compressed
    
    def _extract_essential_rules(self, content: Dict[str, Any]) -> Dict[str, Any]:
        """Extract only essential rules from verbose content."""
        essential = {}
        
        for key, value in content.items():
            # Skip overly verbose sections
            if key in ['examples', 'detailed_explanation', 'philosophy']:
                continue
            
            if isinstance(value, dict):
                # Recursively compress nested dicts
                compressed_value = self._extract_essential_rules(value)
                if compressed_value:  # Only include if not empty
                    essential[key] = compressed_value
            elif isinstance(value, list):
                # Keep only short lists or compress long ones
                if len(value) <= 3:
                    essential[key] = value
                else:
                    essential[key] = value[:3] + [f"... and {len(value) - 3} more"]
            elif isinstance(value, str):
                # Shorten long strings
                if len(value) > 200:
                    essential[key] = value[:200] + "..."
                else:
                    essential[key] = value
            else:
                essential[key] = value
        
        return essential
    
    def _deduplicate_list(self, items: List[str]) -> List[str]:
        """Remove duplicate concepts from a list."""
        seen_concepts = set()
        unique_items = []
        
        for item in items:
            # Extract key concept (first few words or until punctuation)
            concept = re.split(r'[:.!?]', item)[0].strip().lower()
            
            # Check if we've seen this concept
            if concept not in seen_concepts and len(concept) > 5:
                seen_concepts.add(concept)
                unique_items.append(item)
            elif any(keyword in item.upper() for keyword in self.CRITICAL_KEYWORDS):
                # Always keep items with critical keywords
                unique_items.append(item)
        
        return unique_items
    
    def _compress_examples(self, examples: Dict[str, Any]) -> Dict[str, Any]:
        """Keep only one example per component type."""
        compressed = {}
        
        for key, value in examples.items():
            if isinstance(value, list) and len(value) > 0:
                # Keep only the first example
                compressed[key] = value[0]
            elif isinstance(value, str):
                # Truncate long examples
                if len(value) > 500:
                    compressed[key] = value[:500] + "... [truncated]"
                else:
                    compressed[key] = value
        
        return compressed
    
    def _create_rules_summary(self, rules: Dict[str, Any]) -> str:
        """Create a concise summary of all rules."""
        summary_points = [
            "USE 8-12 components per slide with visual hierarchy",
            "TRANSFORM content into visual stories, not text walls",
            "PREVENT overlaps with 40px minimum gaps",
            "APPLY theme fonts/colors exactly as specified",
            "EMPHASIZE statistics with size + color + position",
            "CREATE magazine-style layouts with varied sizes",
            "MANDATORY: padding: 0 (numeric), fontWeight: 'normal'/'bold'",
            "CHARTS: Half-slide (880px), showLegend: false",
            "IMAGES: Minimum 400x400, hero 1600x900",
            "BACKGROUND: gradient, NEVER patternType:'none' - omit pattern fields if unused"
        ]
        
        return " | ".join(summary_points)
    
    def estimate_tokens(self, text: str) -> int:
        """Rough estimate of token count (4 chars ≈ 1 token)."""
        return len(text) // 4
    
    def compress_prompt(self, prompt: str, target_tokens: int = 5000) -> str:
        """Compress a full prompt to target token count."""
        current_tokens = self.estimate_tokens(prompt)
        
        if current_tokens <= target_tokens:
            return prompt
        
        logger.info(f"Compressing prompt from ~{current_tokens} to ~{target_tokens} tokens")
        
        # Split into sections
        sections = prompt.split('\n\n')
        
        # Prioritize sections
        priority_sections = []
        other_sections = []
        
        for section in sections:
            if any(keyword in section.upper() for keyword in ['SLIDE', 'TITLE:', 'CONTENT:', 'MANDATORY', 'CHART']):
                priority_sections.append(section)
            else:
                other_sections.append(section)
        
        # Build compressed prompt
        compressed = []
        tokens_used = 0
        
        # Add priority sections first
        for section in priority_sections:
            section_tokens = self.estimate_tokens(section)
            if tokens_used + section_tokens < target_tokens:
                compressed.append(section)
                tokens_used += section_tokens
        
        # Add other sections if space allows
        for section in other_sections:
            section_tokens = self.estimate_tokens(section)
            if tokens_used + section_tokens < target_tokens * 0.9:  # Leave 10% buffer
                # Compress the section if it's too long
                if section_tokens > 500:
                    section = self._compress_section(section)
                compressed.append(section)
                tokens_used += self.estimate_tokens(section)
        
        return '\n\n'.join(compressed)
    
    def _compress_section(self, section: str) -> str:
        """Compress a single section."""
        lines = section.split('\n')
        
        # Remove duplicate lines
        seen = set()
        unique_lines = []
        for line in lines:
            line_lower = line.strip().lower()
            if line_lower not in seen or any(k in line.upper() for k in self.CRITICAL_KEYWORDS):
                seen.add(line_lower)
                unique_lines.append(line)
        
        # Truncate if still too long
        if len(unique_lines) > 10:
            unique_lines = unique_lines[:8] + ["... [compressed]"]
        
        return '\n'.join(unique_lines) 