"""
Unified Font Service - Combines PixelBuddha and Designer fonts
Provides intelligent font recommendations for theme generation
"""

import json
import random
from pathlib import Path
from typing import Dict, List, Optional, Tuple
import logging

logger = logging.getLogger(__name__)

# Lazy import within methods to avoid heavy imports during module load
try:
    # RegistryFonts helps us see what fonts are actually available in the running registry
    from services.registry_fonts import RegistryFonts  # type: ignore
except Exception:
    RegistryFonts = None  # type: ignore

class UnifiedFontService:
    """
    Unified service that combines PixelBuddha and Designer fonts
    for comprehensive font recommendations.
    """
    
    # Premium curated fonts for different contexts
    PREMIUM_FONTS = {
        'hero': {
            'professional': [
                '5014-hyperion-sleek-modern-sans',  # Designer - clean modern sans
                'alerio-sans-serif',  # Designer - versatile sans
                'glorida-—-sans-serif-family',  # Designer - elegant sans family
                'elastic-square-display-font',  # PixelBuddha
                'gendra-modern-sans-serif',  # PixelBuddha
                'marine-elmoure-sans-serif',  # Designer
            ],
            'creative': [
                'av-galveria-—-display-serif-font-',  # Designer - stylish serif
                'vintage-brunch-retro-font-duo',  # Designer - retro style
                'pink-zebra-quirky-four-font-family',  # Designer - playful
                '5114-cosmic-hippie-groovy-font',  # Designer - groovy
                '5112-nebula-swirl-retro-modern-font',  # Designer
                '5137-double-bubble-3d-typeface',  # Designer - 3D effect
            ],
            'tech': [
                '5115-hexaplex-geometric-typeface',  # Designer - geometric
                '5135-synthetika-futuristic-typeface',  # Designer - futuristic
                '5134-binary-groove-groovy-1980s-typeface',  # Designer - retro tech
                'acrona-display-font',  # Designer - modern display
                'acure---display-font',  # Designer - clean display
            ],
            'elegant': [
                'av-galveria-—-display-serif-font-',  # Designer
                'qitella-modern-stylist-font',  # Designer
                '5138-avalar-elegant-display',  # Designer
                'floriena-ligatures-sans',  # Designer
            ]
        },
        'body': {
            'professional': [
                'hiluna-—-clean-sans-serif',  # Designer
                'marine-elmoure-sans-serif',  # Designer
                'alerio-sans-serif',  # Designer
                'glorida-—-sans-serif-family',  # Designer
                'hkgroteskwide',  # Designer - HK Grotesk Wide
            ],
            'readable': [
                '5014-hyperion-sleek-modern-sans',  # Designer - excellent readability
                'alerio-sans-serif',  # Designer
                'marine-elmoure-sans-serif',  # Designer
            ]
        }
    }
    
    # Fonts to avoid for professional contexts
    AVOID_FOR_PROFESSIONAL = [
        'telefax', 'gokil', 'ancient-serpent', 'horror', 'zombie',
        'graffiti', 'trash', 'distorted', 'halloween', 'creepy',
        'razor-titan', 'graffitopia', 'new-kids-crew'
    ]
    
    def __init__(self):
        self.pixelbuddha_fonts = self._load_pixelbuddha_fonts()
        self.designer_fonts = self._load_designer_fonts()
        self.all_fonts = {**self.pixelbuddha_fonts, **self.designer_fonts}
        logger.info(f"Loaded {len(self.pixelbuddha_fonts)} PixelBuddha fonts and {len(self.designer_fonts)} Designer fonts")
    
    def _load_pixelbuddha_fonts(self) -> Dict:
        """Load PixelBuddha font registry"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                data = json.load(f)
                # The PixelBuddha registry is directly font_id -> font_data
                fonts = {}
                # Check if it's wrapped in 'fonts' key or not
                if isinstance(data, dict) and 'fonts' in data:
                    font_data_dict = data['fonts']
                else:
                    font_data_dict = data
                    
                for font_id, font_data in font_data_dict.items():
                    if isinstance(font_data, dict):
                        font_data['source'] = 'pixelbuddha'
                        # Ensure it has required fields
                        if 'name' not in font_data:
                            font_data['name'] = font_id.replace('-', ' ').title()
                        if 'category' not in font_data:
                            # Try to determine category from tags or name
                            font_data['category'] = self._categorize_pixelbuddha_font(font_data)
                        fonts[font_id] = font_data
                return fonts
        
        return {}
    
    def _categorize_pixelbuddha_font(self, font_data: dict) -> str:
        """Categorize a PixelBuddha font based on its data"""
        name = font_data.get('name', '').lower()
        tags = [t.lower() for t in font_data.get('tags', [])]
        all_text = f"{name} {' '.join(tags)}"
        
        if any(word in all_text for word in ['script', 'handwritten', 'brush', 'signature']):
            return 'script'
        elif any(word in all_text for word in ['serif']) and 'sans' not in all_text:
            return 'serif'
        elif any(word in all_text for word in ['sans', 'clean', 'modern']):
            return 'sans'
        elif any(word in all_text for word in ['display', 'decorative', 'retro', 'vintage']):
            return 'display'
        elif any(word in all_text for word in ['slab']):
            return 'slab'
        else:
            return 'display'  # Default
    
    def _load_designer_fonts(self) -> Dict:
        """Load Designer font registry"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'designer' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                data = json.load(f)
                # Already has source field
                return data.get('fonts', {})
        
        return {}
    
    def get_fonts_for_theme(
        self,
        deck_title: str,
        vibe: str,
        content_keywords: List[str] = None,
        target_audience: str = None
    ) -> Dict[str, any]:
        """
        Get appropriate fonts for a presentation theme.
        Intelligently selects from both PixelBuddha and Designer fonts.
        
        Returns:
            Dict with 'hero' and 'body' font recommendations
        """
        
        # Determine presentation context
        context = self._determine_context(deck_title, vibe, content_keywords, target_audience)

        # 1) Try to pick directly from the live component registry so we only use installable fonts
        hero_choice, body_choice, reg_source = self._select_from_registry(context, deck_title)

        if hero_choice or body_choice:
            # Format response with a single, decisive pick from the registry
            hero_details: List[Dict] = []
            body_details: List[Dict] = []

            if hero_choice:
                hero_details.append({
                    'name': hero_choice,
                    'id': hero_choice,
                    'source': reg_source or 'registry',
                    'category': 'display'
                })
            if body_choice:
                # Avoid duplicate hero/body
                if body_choice == hero_choice:
                    body_choice = None
                if body_choice:
                    body_details.append({
                        'name': body_choice,
                        'id': body_choice,
                        'source': reg_source or 'registry',
                        'category': 'sans'
                    })

            return {
                'hero': hero_details,
                'body': body_details,
                'context': context,
                'reasoning': f"Selected fonts from registry for {context['style']} style"
            }

        # 2) Fallback to curated assets-based selection (PixelBuddha + Designer), but return only 1 decisive pick each
        hero_fonts = self._get_hero_fonts(context)
        body_fonts = [f for f in self._get_body_fonts(context) if f not in hero_fonts]

        # Decide single hero/body by stable hashing for consistency
        hero_pick = self._stable_pick(hero_fonts)
        body_pick = self._stable_pick([f for f in body_fonts if f != hero_pick])

        hero_details = []
        if hero_pick and hero_pick in self.all_fonts:
            font_data = self.all_fonts[hero_pick]
            hero_details.append({
                'name': font_data.get('name', hero_pick),
                'id': hero_pick,
                'source': font_data.get('source', 'unknown'),
                'category': font_data.get('category', 'display')
            })

        body_details = []
        if body_pick and body_pick in self.all_fonts:
            font_data = self.all_fonts[body_pick]
            body_details.append({
                'name': font_data.get('name', body_pick),
                'id': body_pick,
                'source': font_data.get('source', 'unknown'),
                'category': font_data.get('category', 'sans')
            })

        return {
            'hero': hero_details,
            'body': body_details,
            'context': context,
            'reasoning': f"Selected fonts optimized for {context['type']} presentation with {context['style']} style"
        }
    
    def _determine_context(self, title: str, vibe: str, keywords: List[str] = None, audience: str = None) -> Dict:
        """Determine the presentation context"""
        
        title_lower = title.lower() if title else ''
        vibe_lower = vibe.lower() if vibe else ''
        keywords_text = ' '.join(keywords).lower() if keywords else ''
        audience_lower = audience.lower() if audience else ''
        all_text = f"{title_lower} {vibe_lower} {keywords_text} {audience_lower}"
        
        # Determine type
        if any(word in all_text for word in ['corporate', 'business', 'professional', 'formal', 'enterprise']):
            pres_type = 'corporate'
        elif any(word in all_text for word in ['startup', 'pitch', 'investor', 'funding']):
            pres_type = 'startup'
        elif any(word in all_text for word in ['creative', 'design', 'art', 'portfolio']):
            pres_type = 'creative'
        elif any(word in all_text for word in ['tech', 'technology', 'software', 'digital']):
            pres_type = 'tech'
        elif any(word in all_text for word in ['education', 'teaching', 'learning', 'school']):
            pres_type = 'educational'
        else:
            pres_type = 'general'
        
        # Determine style
        if vibe_lower in ['professional', 'formal', 'serious', 'corporate']:
            style = 'professional'
        elif vibe_lower in ['modern', 'innovative', 'tech', 'futuristic']:
            style = 'modern'
        elif vibe_lower in ['fun', 'playful', 'casual', 'friendly']:
            style = 'playful'
        elif vibe_lower in ['elegant', 'sophisticated', 'luxury', 'premium']:
            style = 'elegant'
        elif vibe_lower in ['creative', 'artistic', 'bold', 'unique']:
            style = 'creative'
        else:
            style = 'balanced'
        
        return {
            'type': pres_type,
            'style': style,
            'vibe': vibe_lower
        }
    
    def _get_hero_fonts(self, context: Dict) -> List[str]:
        """Get hero font recommendations based on context"""
        
        fonts = []
        
        # Start with premium curated fonts
        if context['style'] == 'professional':
            fonts.extend(self.PREMIUM_FONTS['hero']['professional'])
        elif context['style'] == 'creative' or context['style'] == 'playful':
            fonts.extend(self.PREMIUM_FONTS['hero']['creative'])
        elif context['style'] == 'modern' or context['type'] == 'tech':
            fonts.extend(self.PREMIUM_FONTS['hero']['tech'])
        elif context['style'] == 'elegant':
            fonts.extend(self.PREMIUM_FONTS['hero']['elegant'])
        else:
            # Mix from different categories
            fonts.extend(random.sample(self.PREMIUM_FONTS['hero']['professional'], 2))
            fonts.extend(random.sample(self.PREMIUM_FONTS['hero']['creative'], 2))
        
        # Add appropriate fonts from the full collection
        if context['style'] in ['professional', 'modern']:
            # Add clean sans and serif fonts
            for font_id, font_data in self.all_fonts.items():
                if font_data.get('category') in ['sans', 'serif'] and not self._is_inappropriate(font_id):
                    fonts.append(font_id)
                    if len(fonts) >= 20:
                        break
        
        # Shuffle for variety
        random.shuffle(fonts)
        
        # Remove duplicates while preserving order
        seen = set()
        unique_fonts = []
        for f in fonts:
            if f not in seen and f in self.all_fonts:
                seen.add(f)
                unique_fonts.append(f)
        
        return unique_fonts
    
    def _get_body_fonts(self, context: Dict) -> List[str]:
        """Get body font recommendations based on context"""
        
        fonts = []
        
        # Start with premium readable fonts
        fonts.extend(self.PREMIUM_FONTS['body']['professional'])
        fonts.extend(self.PREMIUM_FONTS['body']['readable'])
        
        # Add more readable fonts from collection
        for font_id, font_data in self.all_fonts.items():
            if font_data.get('category') == 'sans' and not self._is_inappropriate(font_id):
                fonts.append(font_id)
                if len(fonts) >= 20:
                    break
        
        # Shuffle for variety
        random.shuffle(fonts)
        
        # Remove duplicates
        seen = set()
        unique_fonts = []
        for f in fonts:
            if f not in seen and f in self.all_fonts:
                seen.add(f)
                unique_fonts.append(f)
        
        return unique_fonts

    def _select_from_registry(self, context: Dict, deck_title: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
        """Try to pick a single hero/body directly from the component registry fonts.
        Returns (hero_name, body_name, source_label). Names are registry-facing family names.
        """
        try:
            groups: Optional[Dict[str, List[str]]] = None
            # Prefer using the live ComponentRegistry so we reflect what the app can render
            comp_registry = None
            try:
                from models.registry import ComponentRegistry  # type: ignore
                comp_registry = ComponentRegistry()
            except Exception:
                comp_registry = None

            if RegistryFonts is not None:
                if comp_registry is not None:
                    groups = RegistryFonts.get_available_fonts(comp_registry)
                else:
                    groups = RegistryFonts.get_available_fonts()
            if not groups:
                return (None, None, None)

            # Build ordered preferences by style
            style = context.get('style', 'balanced')
            # Candidate groups for hero (display/headline) and body (readable)
            hero_group_prefs: List[str]
            body_group_prefs: List[str]
            if style in ['professional', 'modern', 'tech']:
                hero_group_prefs = ['Bold', 'Modern', 'Premium', 'Sans-Serif', 'Designer']
                body_group_prefs = ['Sans-Serif', 'Premium', 'Modern', 'Serif']
            elif style in ['elegant']:
                hero_group_prefs = ['Elegant', 'Serif', 'Premium', 'Designer']
                body_group_prefs = ['Serif', 'Sans-Serif', 'Elegant']
            elif style in ['creative', 'playful']:
                hero_group_prefs = ['Designer', 'Script', 'Bold', 'Modern']
                body_group_prefs = ['Sans-Serif', 'Modern', 'Premium']
            else:
                hero_group_prefs = ['Premium', 'Bold', 'Sans-Serif', 'Serif', 'Designer']
                body_group_prefs = ['Sans-Serif', 'Premium', 'Serif']

            # Gather candidates preserving preference order
            def gather_candidates(preferred_groups: List[str]) -> List[str]:
                seen = set()
                out: List[str] = []
                for g in preferred_groups:
                    names = groups.get(g, []) if isinstance(groups, dict) else []
                    for n in names:
                        if n and n not in seen:
                            seen.add(n)
                            out.append(n)
                # Also as a backstop, include any group content not in prefs
                for g, names in (groups.items() if isinstance(groups, dict) else []):
                    for n in (names or []):
                        if n and n not in seen:
                            seen.add(n)
                            out.append(n)
                return out

            hero_candidates = gather_candidates(hero_group_prefs)
            body_candidates = [n for n in gather_candidates(body_group_prefs) if n not in hero_candidates[:1]]

            # Stable, deterministic selection from candidates based on deck_title+style
            seed_basis = f"{deck_title}|{style}|{context.get('type','general')}"
            hero_name = self._stable_pick(hero_candidates, seed_basis)
            body_name = self._stable_pick([n for n in body_candidates if n != hero_name], seed_basis + "|body")

            # Avoid returning empties
            if not hero_name and not body_name:
                return (None, None, None)

            return (hero_name or None, body_name or None, 'registry')
        except Exception:
            return (None, None, None)

    def _stable_pick(self, items: List[str], seed_text: Optional[str] = None) -> Optional[str]:
        """Pick a single item from a list deterministically based on a seed string.
        Falls back to the first item.
        """
        if not items:
            return None
        if not seed_text:
            return items[0]
        try:
            import hashlib
            # Use a stable hash to pick an index
            h = hashlib.sha256(seed_text.encode('utf-8')).hexdigest()
            idx = int(h[:8], 16) % len(items)
            return items[idx]
        except Exception:
            return items[0]
    
    def _is_inappropriate(self, font_id: str) -> bool:
        """Check if a font is inappropriate for professional use"""
        font_lower = font_id.lower()
        return any(avoid in font_lower for avoid in self.AVOID_FOR_PROFESSIONAL)
    
    def get_font_by_id(self, font_id: str) -> Optional[Dict]:
        """Get font details by ID"""
        return self.all_fonts.get(font_id)
    
    def search_fonts(self, query: str, limit: int = 20) -> List[Dict]:
        """Search fonts by name or category"""
        query_lower = query.lower()
        results = []
        
        for font_id, font_data in self.all_fonts.items():
            if (query_lower in font_id.lower() or 
                query_lower in font_data.get('name', '').lower() or
                query_lower in font_data.get('category', '').lower()):
                results.append({
                    'id': font_id,
                    'name': font_data.get('name', font_id),
                    'category': font_data.get('category', 'unknown'),
                    'source': font_data.get('source', 'unknown')
                })
                
                if len(results) >= limit:
                    break
        
        return results
    
    def get_font_path(self, font_id: str, style: str = 'regular') -> Optional[str]:
        """Get the file path for a specific font and style"""
        font_data = self.all_fonts.get(font_id)
        if not font_data:
            return None
        
        source = font_data.get('source', 'pixelbuddha')
        
        if source == 'pixelbuddha':
            # PixelBuddha fonts have 'files' field
            files = font_data.get('files', [])
            if files:
                # Just return the path directly - it's already complete
                return files[0].get('path', '')
        else:
            # Designer fonts have 'styles' field
            styles = font_data.get('styles', {})
            
            # Try requested style first
            if style in styles and styles[style]:
                file_info = styles[style][0]  # Get first file for this style
                return f"assets/fonts/designer/{file_info['path']}"
            
            # Fall back to regular or first available style
            for fallback in ['regular', 'normal', list(styles.keys())[0] if styles else None]:
                if fallback and fallback in styles and styles[fallback]:
                    file_info = styles[fallback][0]
                    return f"assets/fonts/designer/{file_info['path']}"
        
        return None
    
    def get_statistics(self) -> Dict:
        """Get statistics about the font collection"""
        
        stats = {
            'total': len(self.all_fonts),
            'pixelbuddha': len(self.pixelbuddha_fonts),
            'designer': len(self.designer_fonts),
            'categories': {}
        }
        
        for font_data in self.all_fonts.values():
            cat = font_data.get('category', 'unknown')
            if cat not in stats['categories']:
                stats['categories'][cat] = 0
            stats['categories'][cat] += 1
        
        return stats