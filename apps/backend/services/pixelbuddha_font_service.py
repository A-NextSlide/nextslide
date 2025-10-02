"""
PixelBuddha Font Service - Intelligent font selection using scraped metadata
"""

import json
import os
from typing import Dict, List, Optional, Tuple
from pathlib import Path

class PixelBuddhaFontService:
    """
    Service that uses the scraped PixelBuddha font descriptions 
    to provide intelligent font recommendations for presentations
    """
    
    def __init__(self):
        self.metadata = self._load_metadata()
        self.font_index = self._build_indices()
    
    def _load_metadata(self) -> Dict:
        """Load the scraped font metadata"""
        metadata_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'metadata' / 'font_metadata_complete.json'
        
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                return json.load(f)
        
        # Fallback to partial if complete not available
        partial_path = metadata_path.parent / 'font_metadata_partial.json'
        if partial_path.exists():
            with open(partial_path, 'r') as f:
                return json.load(f)
        
        return {}
    
    def _build_indices(self) -> Dict:
        """Build search indices for quick lookup"""
        indices = {
            'by_use_case': {},
            'by_personality': {},
            'by_era': {},
            'by_tag': {},
            'by_weight': {}
        }
        
        for font_name, data in self.metadata.items():
            # Index by use cases
            for use in data.get('best_for', []):
                if use not in indices['by_use_case']:
                    indices['by_use_case'][use] = []
                indices['by_use_case'][use].append(font_name)
            
            # Index by personality
            characteristics = data.get('style_characteristics', {})
            for personality in characteristics.get('personality', []):
                if personality not in indices['by_personality']:
                    indices['by_personality'][personality] = []
                indices['by_personality'][personality].append(font_name)
            
            # Index by era
            era = characteristics.get('era')
            if era:
                if era not in indices['by_era']:
                    indices['by_era'][era] = []
                indices['by_era'][era].append(font_name)
            
            # Index by tags
            for tag in data.get('tags', []):
                tag_lower = tag.lower()
                if len(tag_lower) > 2 and tag_lower not in ['font', 'typeface', 'fonts']:
                    if tag_lower not in indices['by_tag']:
                        indices['by_tag'][tag_lower] = []
                    indices['by_tag'][tag_lower].append(font_name)
            
            # Index by weight
            weight = characteristics.get('weight', 'regular')
            if weight not in indices['by_weight']:
                indices['by_weight'][weight] = []
            indices['by_weight'][weight].append(font_name)
        
        return indices
    
    def get_fonts_for_theme(
        self,
        deck_title: str,
        vibe: str,
        content_keywords: List[str],
        target_audience: str = None
    ) -> Dict[str, List[Dict]]:
        """
        Get font recommendations based on deck theme and content
        
        Returns structured recommendations with reasoning
        """
        
        recommendations = {
            'hero_fonts': [],      # For main titles
            'body_fonts': [],      # For content
            'accent_fonts': [],    # For special elements
            'recommended_pairings': []  # Font combinations
        }
        
        # Analyze the deck theme
        vibe_lower = vibe.lower()
        title_lower = deck_title.lower()
        
        # Map vibes to personality traits
        vibe_personality_map = {
            'professional': ['professional', 'elegant', 'modern'],
            'playful': ['playful', 'friendly', 'bold'],
            'creative': ['artistic', 'modern', 'bold'],
            'elegant': ['elegant', 'vintage', 'professional'],
            'casual': ['friendly', 'playful', 'modern'],
            'serious': ['professional', 'bold', 'modern'],
            'fun': ['playful', 'bold', 'friendly'],
            'minimal': ['modern', 'professional', 'elegant'],
            'vintage': ['vintage', 'elegant', 'artistic'],
            'tech': ['modern', 'bold', 'professional']
        }
        
        relevant_personalities = vibe_personality_map.get(vibe_lower, ['modern', 'professional'])
        
        # Get fonts by personality
        personality_fonts = []
        for personality in relevant_personalities:
            if personality in self.font_index['by_personality']:
                personality_fonts.extend(self.font_index['by_personality'][personality])
        
        # Remove duplicates and get top candidates
        personality_fonts = list(set(personality_fonts))[:20]
        
        # Score and categorize fonts
        for font_name in personality_fonts:
            font_data = self.metadata.get(font_name, {})
            score = self._calculate_font_score(font_data, vibe, content_keywords, target_audience)
            
            font_recommendation = {
                'name': font_data.get('name', font_name),
                'description': font_data.get('description', '')[:200],
                'score': score,
                'best_for': font_data.get('best_for', []),
                'personality': font_data.get('style_characteristics', {}).get('personality', []),
                'suggested_settings': self._get_suggested_settings(font_data)
            }
            
            # Categorize based on use cases
            if 'headlines' in font_data.get('best_for', []) or 'posters' in font_data.get('best_for', []):
                recommendations['hero_fonts'].append(font_recommendation)
            
            if 'body_text' in font_data.get('best_for', []) or 'print' in font_data.get('best_for', []):
                recommendations['body_fonts'].append(font_recommendation)
            
            # Fonts with strong personality for accents
            if len(font_data.get('style_characteristics', {}).get('personality', [])) > 2:
                recommendations['accent_fonts'].append(font_recommendation)
        
        # Sort by score
        for category in ['hero_fonts', 'body_fonts', 'accent_fonts']:
            recommendations[category] = sorted(
                recommendations[category], 
                key=lambda x: x['score'], 
                reverse=True
            )[:5]  # Top 5 per category
        
        # Generate pairing recommendations
        recommendations['recommended_pairings'] = self._generate_pairings(recommendations)
        
        return recommendations
    
    def _calculate_font_score(
        self,
        font_data: Dict,
        vibe: str,
        content_keywords: List[str],
        target_audience: str
    ) -> float:
        """Calculate relevance score for a font"""
        
        score = 0.0
        
        # Check vibe alignment
        vibe_lower = vibe.lower()
        personalities = font_data.get('style_characteristics', {}).get('personality', [])
        
        if vibe_lower in ['professional', 'serious'] and 'professional' in personalities:
            score += 3.0
        elif vibe_lower in ['playful', 'fun'] and 'playful' in personalities:
            score += 3.0
        elif vibe_lower in ['elegant', 'luxury'] and 'elegant' in personalities:
            score += 3.0
        
        # Check keyword matches in description
        description = font_data.get('description', '').lower()
        for keyword in content_keywords:
            if keyword.lower() in description:
                score += 1.0
        
        # Check tag matches
        tags = [tag.lower() for tag in font_data.get('tags', [])]
        for keyword in content_keywords:
            if keyword.lower() in tags:
                score += 0.5
        
        # Audience alignment
        if target_audience:
            audience_lower = target_audience.lower()
            if 'kid' in audience_lower and 'playful' in personalities:
                score += 2.0
            elif 'corporate' in audience_lower and 'professional' in personalities:
                score += 2.0
            elif 'creative' in audience_lower and 'artistic' in personalities:
                score += 2.0
        
        return score
    
    def _get_suggested_settings(self, font_data: Dict) -> Dict:
        """Get suggested typography settings for a font"""
        
        characteristics = font_data.get('style_characteristics', {})
        weight = characteristics.get('weight', 'regular')
        
        # Base settings
        settings = {
            'hero': {
                'size': '96pt',
                'weight': '700' if weight == 'bold' else '400',
                'letterSpacing': '-0.02em',
                'lineHeight': '1.1'
            },
            'body': {
                'size': '32pt',
                'weight': '400',
                'letterSpacing': '0',
                'lineHeight': '1.5'
            },
            'accent': {
                'size': '48pt',
                'weight': '500',
                'letterSpacing': '-0.01em',
                'lineHeight': '1.3'
            }
        }
        
        # Adjust based on characteristics
        if 'condensed' in characteristics.get('width', ''):
            settings['hero']['letterSpacing'] = '0'
            settings['body']['letterSpacing'] = '0.01em'
        
        if 'script' in font_data.get('tags', []):
            settings['hero']['letterSpacing'] = '0.02em'
            settings['accent']['letterSpacing'] = '0.02em'
        
        return settings
    
    def _generate_pairings(self, recommendations: Dict) -> List[Dict]:
        """Generate font pairing recommendations"""
        
        pairings = []
        
        # Pair hero fonts with body fonts
        for hero in recommendations.get('hero_fonts', [])[:3]:
            for body in recommendations.get('body_fonts', [])[:3]:
                # Check if they complement each other
                hero_personalities = set(hero.get('personality', []))
                body_personalities = set(body.get('personality', []))
                
                # Good pairings have contrasting but compatible personalities
                if hero_personalities != body_personalities:
                    pairing_score = 0
                    
                    # Bold + Clean is good
                    if 'bold' in hero_personalities and 'modern' in body_personalities:
                        pairing_score += 2
                    
                    # Elegant + Professional is good
                    if 'elegant' in hero_personalities and 'professional' in body_personalities:
                        pairing_score += 2
                    
                    # Playful + Friendly is good
                    if 'playful' in hero_personalities and 'friendly' in body_personalities:
                        pairing_score += 2
                    
                    if pairing_score > 0:
                        pairings.append({
                            'hero': hero['name'],
                            'body': body['name'],
                            'accent': recommendations.get('accent_fonts', [{}])[0].get('name'),
                            'score': pairing_score,
                            'reason': f"{hero['name']} provides impact while {body['name']} ensures readability"
                        })
        
        # Sort by score and return top 3
        return sorted(pairings, key=lambda x: x['score'], reverse=True)[:3]
    
    def generate_font_context_for_ai(self) -> str:
        """
        Generate a context string about available fonts for AI prompts
        This gives the AI rich information about font personalities
        """
        
        context = "PIXELBUDDHA FONTS WITH RICH DESCRIPTIONS:\n\n"
        
        # Group by primary personality
        personality_groups = {}
        for font_name, data in self.metadata.items():
            personalities = data.get('style_characteristics', {}).get('personality', ['versatile'])
            primary = personalities[0] if personalities else 'versatile'
            
            if primary not in personality_groups:
                personality_groups[primary] = []
            
            personality_groups[primary].append({
                'name': data.get('name', font_name),
                'description': data.get('description', '')[:100],
                'best_for': data.get('best_for', [])
            })
        
        # Format for AI consumption
        for personality, fonts in personality_groups.items():
            context += f"\n{personality.upper()} FONTS:\n"
            for font in fonts[:5]:  # Top 5 per category
                context += f"  • {font['name']}: {font['description']}..."
                if font['best_for']:
                    context += f" [Best for: {', '.join(font['best_for'][:3])}]"
                context += "\n"
        
        return context