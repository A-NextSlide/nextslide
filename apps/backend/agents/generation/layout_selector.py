"""
Smart Layout Selector
Automatically selects appropriate professional layouts based on slide content
"""

import json
import re
from pathlib import Path
from typing import Dict, List, Optional, Any
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

class LayoutSelector:
    """
    Selects optimal layout templates based on slide content analysis
    """
    
    def __init__(self, layout_kb_path: str = "agents/rag/knowledge_base/layout.json"):
        """Initialize with layout knowledge base."""
        self.layout_kb_path = Path(layout_kb_path)
        if not self.layout_kb_path.exists():
            # Try from parent directory
            parent_path = Path(__file__).parent.parent.parent / layout_kb_path
            if parent_path.exists():
                self.layout_kb_path = parent_path
        
        self.layouts = self._load_layouts()
        logger.info(f"Initialized LayoutSelector with {len(self.layouts)} professional templates")
    
    def _load_layouts(self) -> Dict[str, Any]:
        """Load layout templates from knowledge base."""
        try:
            with open(self.layout_kb_path, 'r') as f:
                data = json.load(f)
            return data.get('professional_templates', {})
        except Exception as e:
            logger.warning(f"Failed to load layouts: {e}")
            return {}
    
    def select_layout(self, 
                     slide_title: str,
                     slide_content: str,
                     image_count: int,
                     text_density: str = "medium") -> Optional[Dict[str, Any]]:
        """
        Select the best layout template for the given slide content.
        
        Args:
            slide_title: Title of the slide
            slide_content: Main content/outline of the slide
            image_count: Number of images expected
            text_density: "high", "medium", or "low"
            
        Returns:
            Layout template dict or None if no match
        """
        
        # Combine title and content for keyword analysis
        full_content = f"{slide_title} {slide_content}".lower()
        
        # Score each layout template
        layout_scores = {}
        
        for layout_name, layout_info in self.layouts.items():
            if layout_name in ['usage_guidelines', 'description']:
                continue
                
            score = self._score_layout(layout_info, full_content, image_count, text_density)
            if score > 0:
                layout_scores[layout_name] = {
                    'score': score,
                    'layout': layout_info
                }
        
        # Select best scoring layout
        if layout_scores:
            best_layout_name = max(layout_scores.keys(), key=lambda x: layout_scores[x]['score'])
            best_layout = layout_scores[best_layout_name]
            
            logger.info(f"Selected layout '{best_layout_name}' with score {best_layout['score']:.2f}")
            return {
                'name': best_layout_name,
                'template': best_layout['layout'],
                'score': best_layout['score']
            }
        
        return None
    
    def _score_layout(self, 
                     layout_info: Dict[str, Any], 
                     content: str, 
                     image_count: int,
                     text_density: str) -> float:
        """
        Score how well a layout matches the slide content.
        
        Returns:
            Score from 0.0 to 10.0, higher is better match
        """
        score = 0.0
        
        # 1. Keyword matching (40% of score)
        trigger_keywords = layout_info.get('trigger_keywords', [])
        keyword_matches = sum(1 for keyword in trigger_keywords if keyword in content)
        if trigger_keywords:
            keyword_score = (keyword_matches / len(trigger_keywords)) * 4.0
            score += keyword_score
        
        # 2. Image count compatibility (30% of score)  
        image_score = self._score_image_count(layout_info, image_count) * 3.0
        score += image_score
        
        # 3. Slide type matching (20% of score)
        slide_types = layout_info.get('slide_types', [])
        type_matches = sum(1 for slide_type in slide_types if slide_type in content)
        if slide_types:
            type_score = (type_matches / len(slide_types)) * 2.0
            score += type_score
        
        # 4. Use case alignment (10% of score)
        use_for = layout_info.get('use_for', '').lower()
        if any(word in content for word in use_for.split()):
            score += 1.0
        
        return score
    
    def _score_image_count(self, layout_info: Dict[str, Any], image_count: int) -> float:
        """Score based on how well the layout handles the image count."""
        
        # Count expected images in layout
        layout_images = 0
        
        if 'images' in layout_info:
            layout_images = len(layout_info['images'])
        elif 'features' in layout_info:
            layout_images = len(layout_info['features'])
        elif 'columns' in layout_info:
            layout_images = len(layout_info['columns'])
        elif 'main_image' in layout_info:
            layout_images = 1
            if 'sidebar_content' in layout_info:
                layout_images += len(layout_info['sidebar_content'])
        
        # Perfect match gets full score
        if layout_images == image_count:
            return 1.0
        
        # Close matches get partial score
        diff = abs(layout_images - image_count)
        if diff <= 1:
            return 0.7
        elif diff <= 2:
            return 0.4
        else:
            return 0.1
    
    def get_layout_by_name(self, layout_name: str) -> Optional[Dict[str, Any]]:
        """Get a specific layout template by name."""
        return self.layouts.get(layout_name)
    
    def list_available_layouts(self) -> List[str]:
        """List all available layout template names."""
        return [name for name in self.layouts.keys() 
                if name not in ['usage_guidelines', 'description']]

# Convenience function for easy import
def select_professional_layout(slide_title: str, 
                             slide_content: str, 
                             image_count: int,
                             text_density: str = "medium") -> Optional[Dict[str, Any]]:
    """
    Convenience function to select a professional layout.
    """
    selector = LayoutSelector()
    return selector.select_layout(slide_title, slide_content, image_count, text_density)