"""
Enhanced Font Service with Full Metadata Support
Intelligently recommends fonts based on actual font characteristics from PixelBuddha
"""

import json
import random
import hashlib
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Set
import logging
from difflib import SequenceMatcher
from collections import deque
from datetime import datetime, timedelta

logger = logging.getLogger(__name__)

# Import curated PixelBuddha font list for performance
try:
    from services.curated_pixelbuddha_fonts import CURATED_PIXELBUDDHA_FONTS, FALLBACK_PIXELBUDDHA_FONTS
    USE_CURATED_ONLY = True
except ImportError:
    CURATED_PIXELBUDDHA_FONTS = []
    FALLBACK_PIXELBUDDHA_FONTS = []
    USE_CURATED_ONLY = False

class EnhancedFontService:
    """
    Enhanced font service that uses complete metadata from PixelBuddha
    for intelligent font recommendations based on actual font characteristics.
    Includes variety mechanism to avoid repetitive font selections.
    """
    
    # Class-level usage tracking (shared across instances)
    _recent_hero_fonts: deque = deque(maxlen=20)
    _recent_body_fonts: deque = deque(maxlen=20)
    _font_usage_count: Dict[str, int] = {}
    
    def __init__(self):
        self.font_metadata = self._load_font_metadata()
        # DISABLED: PixelBuddha fonts disabled due to missing files on disk
        # self.pixelbuddha_fonts = self._load_pixelbuddha_fonts()
        self.pixelbuddha_fonts = {}  # Empty - not using PixelBuddha fonts
        self.designer_fonts = self._load_designer_fonts()
        self.google_fonts = self._load_google_fonts()
        self.all_fonts = {**self.designer_fonts, **self.google_fonts}  # Only Designer + Google

        # Build tag index for fast lookup
        self.tag_index = self._build_tag_index()
        self.best_for_index = self._build_best_for_index()

        logger.info(f"PixelBuddha fonts: DISABLED (only using Designer + Google fonts)")
        logger.info(f"Loaded {len(self.designer_fonts)} Designer fonts")
        logger.info(f"Loaded {len(self.google_fonts)} Google fonts")
        logger.info(f"Total fonts available: {len(self.all_fonts)}")
        logger.info(f"Loaded metadata for {len(self.font_metadata)} fonts")
        logger.info(f"Built index with {len(self.tag_index)} tags")
    
    def _load_font_metadata(self) -> Dict:
        """Load complete font metadata with descriptions, tags, and best_for info"""
        metadata_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'metadata' / 'font_metadata_complete.json'
        
        if metadata_path.exists():
            with open(metadata_path, 'r') as f:
                return json.load(f)
        
        logger.warning("Font metadata file not found")
        return {}
    
    def _load_pixelbuddha_fonts(self) -> Dict:
        """
        Load PixelBuddha font registry.
        PERFORMANCE: Only loads curated subset (80 fonts) instead of all 701.
        """
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                data = json.load(f)
                fonts = {}
                
                # Handle both wrapped and unwrapped formats
                font_data_dict = data.get('fonts', data) if isinstance(data, dict) else data
                
                # Create curated set for fast lookup
                curated_set = set(CURATED_PIXELBUDDHA_FONTS + FALLBACK_PIXELBUDDHA_FONTS) if USE_CURATED_ONLY else None
                
                loaded_count = 0
                skipped_count = 0
                
                for font_id, font_data in font_data_dict.items():
                    if isinstance(font_data, dict):
                        # PERFORMANCE FIX: Only load curated fonts
                        if USE_CURATED_ONLY and curated_set and font_id not in curated_set:
                            skipped_count += 1
                            continue
                        
                        font_data['source'] = 'pixelbuddha'
                        font_data['category'] = self._categorize_pixelbuddha_font(font_id, font_data)
                        fonts[font_id] = font_data
                        loaded_count += 1
                
                if USE_CURATED_ONLY:
                    logger.info(f"Loaded {loaded_count} curated PixelBuddha fonts (skipped {skipped_count})")
                else:
                    logger.info(f"Loaded {loaded_count} PixelBuddha fonts (all)")
                
                return fonts
        
        return {}
    
    def _load_designer_fonts(self) -> Dict:
        """Load Designer/Unblast font registry"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'designer' / 'font_registry.json'
        
        if registry_path.exists():
            with open(registry_path, 'r') as f:
                data = json.load(f)
                fonts = {}
                
                for font_id, font_data in data.items():
                    if isinstance(font_data, dict):
                        font_data['source'] = 'designer'
                        font_data['category'] = font_data.get('category', 'display')
                        fonts[font_id] = font_data
                
                return fonts
        
        return {}
    
    def _load_google_fonts(self) -> Dict:
        """
        Load popular Google Fonts for body text.
        These are high-quality, readable fonts perfect for body content.
        """
        google_fonts = {
            # Premium Sans-Serif (best for body text)
            'inter': {'name': 'Inter', 'source': 'google', 'category': 'sans'},
            'roboto': {'name': 'Roboto', 'source': 'google', 'category': 'sans'},
            'open-sans': {'name': 'Open Sans', 'source': 'google', 'category': 'sans'},
            'lato': {'name': 'Lato', 'source': 'google', 'category': 'sans'},
            'montserrat': {'name': 'Montserrat', 'source': 'google', 'category': 'sans'},
            'poppins': {'name': 'Poppins', 'source': 'google', 'category': 'sans'},
            'raleway': {'name': 'Raleway', 'source': 'google', 'category': 'sans'},
            'nunito': {'name': 'Nunito', 'source': 'google', 'category': 'sans'},
            'work-sans': {'name': 'Work Sans', 'source': 'google', 'category': 'sans'},
            'dm-sans': {'name': 'DM Sans', 'source': 'google', 'category': 'sans'},
            'plus-jakarta-sans': {'name': 'Plus Jakarta Sans', 'source': 'google', 'category': 'sans'},
            'space-grotesk': {'name': 'Space Grotesk', 'source': 'google', 'category': 'sans'},
            'manrope': {'name': 'Manrope', 'source': 'google', 'category': 'sans'},
            'outfit': {'name': 'Outfit', 'source': 'google', 'category': 'sans'},
            'sora': {'name': 'Sora', 'source': 'google', 'category': 'sans'},
            'figtree': {'name': 'Figtree', 'source': 'google', 'category': 'sans'},
            'geist': {'name': 'Geist', 'source': 'google', 'category': 'sans'},
            
            # Serif (for elegant contexts)
            'playfair-display': {'name': 'Playfair Display', 'source': 'google', 'category': 'serif'},
            'merriweather': {'name': 'Merriweather', 'source': 'google', 'category': 'serif'},
            'lora': {'name': 'Lora', 'source': 'google', 'category': 'serif'},
            'source-serif-pro': {'name': 'Source Serif Pro', 'source': 'google', 'category': 'serif'},
            'crimson-pro': {'name': 'Crimson Pro', 'source': 'google', 'category': 'serif'},
            
            # Monospace (for technical content)
            'jetbrains-mono': {'name': 'JetBrains Mono', 'source': 'google', 'category': 'mono'},
            'fira-code': {'name': 'Fira Code', 'source': 'google', 'category': 'mono'},
            'source-code-pro': {'name': 'Source Code Pro', 'source': 'google', 'category': 'mono'},
        }
        
        return google_fonts
    
    def _categorize_pixelbuddha_font(self, font_id: str, font_data: Dict) -> str:
        """Categorize PixelBuddha font based on metadata"""
        # Check metadata for category hints
        metadata = self.font_metadata.get(font_id, {})
        tags = metadata.get('tags', [])
        
        # Convert tags to lowercase for comparison
        tags_lower = [tag.lower() for tag in tags]
        
        # Categorize based on tags
        if any('serif' in tag and 'sans' not in tag for tag in tags_lower):
            if any(tag in tags_lower for tag in ['display', 'headline', 'poster']):
                return 'display-serif'
            return 'serif'
        elif any('sans' in tag or 'sans-serif' in tag for tag in tags_lower):
            return 'sans'
        elif any('script' in tag or 'handwritten' in tag or 'brush' in tag for tag in tags_lower):
            return 'script'
        elif any('display' in tag or 'headline' in tag for tag in tags_lower):
            return 'display'
        elif any('mono' in tag or 'code' in tag for tag in tags_lower):
            return 'mono'
        
        # Default category
        return 'display'
    
    def _build_tag_index(self) -> Dict[str, Set[str]]:
        """Build an index of tags to font IDs for fast lookup"""
        tag_index = {}
        
        for font_id, metadata in self.font_metadata.items():
            tags = metadata.get('tags', [])
            for tag in tags:
                tag_lower = tag.lower()
                if tag_lower not in tag_index:
                    tag_index[tag_lower] = set()
                tag_index[tag_lower].add(font_id)
        
        return tag_index
    
    def _build_best_for_index(self) -> Dict[str, Set[str]]:
        """Build an index of best_for use cases to font IDs"""
        best_for_index = {}
        
        for font_id, metadata in self.font_metadata.items():
            best_for_list = metadata.get('best_for', [])
            for use_case in best_for_list:
                if use_case not in best_for_index:
                    best_for_index[use_case] = set()
                best_for_index[use_case].add(font_id)
        
        return best_for_index
    
    def get_fonts_for_theme(self,
                           deck_title: str,
                           vibe: str,
                           content_keywords: Optional[List[str]] = None,
                           target_audience: Optional[str] = None,
                           variety_seed: Optional[str] = None,
                           maturity: Optional[str] = None) -> Dict:
        """
        Get font recommendations based on theme with intelligent metadata-based selection
        and variety mechanism to avoid repetition.
        """
        context = self._analyze_context(deck_title, vibe, content_keywords, target_audience, maturity)
        
        # Get fonts with scoring based on metadata
        hero_fonts = self._get_hero_fonts_with_scoring(context)
        body_fonts = self._get_body_fonts_with_scoring(context)
        
        # Apply variety/recency penalties
        hero_fonts = self._apply_variety_scoring(hero_fonts, is_hero=True)
        body_fonts = self._apply_variety_scoring(body_fonts, is_hero=False)
        
        # Format response with metadata
        return {
            'context': context,
            'hero': self._format_font_recommendations(hero_fonts[:12]),
            'body': self._format_font_recommendations(body_fonts[:8]),
            'variety_seed': variety_seed
        }
    
    def _analyze_context(self, deck_title: str, vibe: str,
                        content_keywords: Optional[List[str]],
                        target_audience: Optional[str],
                        maturity: Optional[str] = None) -> Dict:
        """Analyze context to determine font selection criteria"""

        context = {
            'title': deck_title.lower(),
            'vibe': vibe.lower(),
            'keywords': [k.lower() for k in content_keywords] if content_keywords else [],
            'audience': target_audience.lower() if target_audience else '',
            'maturity': maturity.lower() if maturity else 'general',
            'style': '',
            'type': '',
            'required_tags': set(),
            'preferred_tags': set(),
            'avoid_tags': set()
        }

        # NEW: Audience-based font preferences
        if target_audience:
            aud = target_audience.lower()
            if aud == 'kids':
                context['preferred_tags'].update(['playful', 'friendly', 'rounded', 'fun', 'colorful'])
                context['avoid_tags'].update(['formal', 'corporate', 'serious', 'heavy'])
            elif aud == 'teens':
                context['preferred_tags'].update(['modern', 'trendy', 'bold', 'edgy'])
                context['avoid_tags'].update(['childish', 'corporate'])
            elif aud == 'professionals':
                context['required_tags'].update(['professional', 'clean', 'modern'])
                context['avoid_tags'].update(['playful', 'comic', 'childish'])

        # NEW: Maturity-based font preferences
        if maturity:
            mat = maturity.lower()
            if mat == 'young':
                context['preferred_tags'].update(['friendly', 'playful', 'approachable'])
                context['avoid_tags'].update(['formal', 'corporate', 'serious'])
            elif mat == 'executive':
                context['required_tags'].update(['professional', 'sophisticated', 'refined'])
                context['avoid_tags'].update(['playful', 'fun', 'casual'])

        # Determine style based on vibe and keywords
        if vibe in ['professional', 'corporate', 'formal']:
            context['style'] = 'professional'
            context['required_tags'].update(['clean', 'modern', 'professional'])
            context['avoid_tags'].update(['graffiti', 'distorted', 'horror', 'comic'])
        elif vibe in ['creative', 'artistic', 'playful']:
            context['style'] = 'creative'
            context['preferred_tags'].update(['creative', 'artistic', 'unique', 'display'])
        elif vibe in ['modern', 'minimal', 'clean']:
            context['style'] = 'modern'
            context['required_tags'].update(['modern', 'minimal', 'clean'])
        elif vibe in ['elegant', 'luxury', 'sophisticated']:
            context['style'] = 'elegant'
            context['preferred_tags'].update(['elegant', 'sophisticated', 'serif'])
        elif vibe in ['retro', 'vintage', 'nostalgic']:
            context['style'] = 'retro'
            context['required_tags'].update(['retro', 'vintage', '60s', '70s', '80s'])
        
        # Analyze keywords for additional context
        all_text = ' '.join([deck_title] + (content_keywords or []))
        
        if any(word in all_text.lower() for word in ['tech', 'software', 'digital', 'ai', 'data']):
            context['type'] = 'tech'
            context['preferred_tags'].update(['geometric', 'futuristic', 'tech'])
        elif any(word in all_text.lower() for word in ['finance', 'banking', 'investment']):
            context['type'] = 'finance'
            context['required_tags'].update(['professional', 'trustworthy'])
        elif any(word in all_text.lower() for word in ['food', 'restaurant', 'cafe']):
            context['type'] = 'food'
            context['preferred_tags'].update(['friendly', 'warm', 'inviting'])
        
        return context
    
    def _score_font_for_context(self, font_id: str, context: Dict, for_body: bool = False) -> float:
        """
        Score a font based on how well it matches the context using metadata
        """
        score = 0.0
        metadata = self.font_metadata.get(font_id, {})
        
        if not metadata:
            # No metadata, use basic scoring
            return 1.0
        
        tags = set(tag.lower() for tag in metadata.get('tags', []))
        best_for = set(metadata.get('best_for', []))
        description = metadata.get('description', '').lower()
        
        # Score based on required tags (must have)
        if context['required_tags']:
            matches = context['required_tags'].intersection(tags)
            if not matches and context['style'] == 'professional':
                return 0.0  # Exclude if missing required tags for professional
            score += len(matches) * 10
        
        # Score based on preferred tags
        if context['preferred_tags']:
            matches = context['preferred_tags'].intersection(tags)
            score += len(matches) * 5
        
        # Penalize for avoid tags
        if context['avoid_tags']:
            matches = context['avoid_tags'].intersection(tags)
            score -= len(matches) * 20
        
        # Score based on best_for use cases
        if for_body:
            if 'body_text' in best_for:
                score += 15
            if 'readable' in tags or 'clean' in tags:
                score += 10
        else:
            if 'headline' in best_for or 'display' in best_for:
                score += 15
            if 'poster' in best_for or 'logo' in best_for:
                score += 10
        
        # Score based on description keywords
        context_words = context['keywords'] + [context['vibe']]
        for word in context_words:
            if word in description:
                score += 3
        
        # Bonus for matching style
        style_tags = {
            'professional': ['clean', 'modern', 'professional', 'corporate'],
            'creative': ['creative', 'artistic', 'unique', 'playful'],
            'elegant': ['elegant', 'sophisticated', 'luxury', 'refined'],
            'modern': ['modern', 'minimal', 'contemporary'],
            'retro': ['retro', 'vintage', 'nostalgic', 'classic']
        }
        
        if context['style'] in style_tags:
            for tag in style_tags[context['style']]:
                if tag in tags:
                    score += 7
        
        # Penalize inappropriate fonts for professional contexts
        if context['style'] == 'professional':
            inappropriate = ['graffiti', 'horror', 'comic', 'distorted', 'halloween']
            if any(tag in tags for tag in inappropriate):
                score -= 50
        
        return max(score, 0)
    
    def _get_hero_fonts_with_scoring(self, context: Dict) -> List[Tuple[str, float]]:
        """
        Get hero fonts with intelligent scoring based on metadata.
        Uses Designer and Google fonts only (PixelBuddha disabled).
        Prioritize distinctive, eye-catching fonts that make titles pop.
        """
        scored_fonts = []

        for font_id, font_data in self.all_fonts.items():
            score = self._score_font_for_context(font_id, context, for_body=False)

            # Boost Designer fonts for hero text - they're designed for display
            if font_data.get('source') == 'designer' and score > 0:
                score *= 1.15  # 15% boost for decorative designer fonts in hero position

            if score > 0:
                scored_fonts.append((font_id, score))

        # Sort by score descending
        scored_fonts.sort(key=lambda x: x[1], reverse=True)

        return scored_fonts
    
    def _get_body_fonts_with_scoring(self, context: Dict) -> List[Tuple[str, float]]:
        """
        Get body fonts with intelligent scoring based on metadata.
        Uses clean, readable fonts (Google Fonts, Designer fonts).
        PixelBuddha fonts are disabled entirely.
        """
        scored_fonts = []

        for font_id, font_data in self.all_fonts.items():
            score = self._score_font_for_context(font_id, context, for_body=True)

            # Boost Google fonts for body text - they're optimized for readability
            if font_data.get('source') == 'google' and score > 0:
                score *= 1.1  # 10% boost for Google fonts in body text

            if score > 0:
                scored_fonts.append((font_id, score))

        # Sort by score descending
        scored_fonts.sort(key=lambda x: x[1], reverse=True)

        return scored_fonts
    
    def _apply_variety_scoring(self, scored_fonts: List[Tuple[str, float]], is_hero: bool = True) -> List[str]:
        """
        Apply variety penalties to avoid repetitive font selections.
        Recent fonts get penalized, heavily used fonts get penalized.
        """
        recent_fonts = self._recent_hero_fonts if is_hero else self._recent_body_fonts
        
        rescored = []
        for font_id, base_score in scored_fonts:
            penalty = 0.0
            
            # Recency penalty - recently used fonts are penalized
            if font_id in recent_fonts:
                # More recent = higher penalty
                recency_position = list(recent_fonts).index(font_id)
                # 0 = most recent, maxlen-1 = oldest
                recency_penalty = (1.0 - (recency_position / len(recent_fonts))) * 0.6
                penalty += recency_penalty
            
            # Usage frequency penalty - overused fonts get penalized
            usage_count = self._font_usage_count.get(font_id, 0)
            if usage_count > 0:
                # Cap penalty at 0.3 for very frequently used fonts
                frequency_penalty = min(usage_count * 0.05, 0.3)
                penalty += frequency_penalty
            
            # Apply penalty (score can't go below 0)
            final_score = max(base_score * (1.0 - penalty), 0.1)
            rescored.append((font_id, final_score))
        
        # Re-sort after applying penalties
        rescored.sort(key=lambda x: x[1], reverse=True)
        
        # Return font IDs only
        return [font_id for font_id, _ in rescored]
    
    def _track_font_usage(self, font_id: str, is_hero: bool = True):
        """Track that a font was used to inform future variety decisions"""
        recent_fonts = self._recent_hero_fonts if is_hero else self._recent_body_fonts
        recent_fonts.append(font_id)
        self._font_usage_count[font_id] = self._font_usage_count.get(font_id, 0) + 1
    
    def _format_font_recommendations(self, font_ids: List[str]) -> List[Dict]:
        """Format font recommendations with metadata"""
        recommendations = []
        
        for font_id in font_ids:
            if font_id not in self.all_fonts:
                continue
                
            font_data = self.all_fonts[font_id]
            metadata = self.font_metadata.get(font_id, {})
            
            recommendation = {
                'id': font_id,
                'name': font_data.get('name', font_id),
                'category': font_data.get('category', 'unknown'),
                'source': font_data.get('source', 'unknown')
            }
            
            # Add metadata if available
            if metadata:
                recommendation['description'] = metadata.get('description', '')[:200]  # Truncate long descriptions
                recommendation['tags'] = metadata.get('tags', [])[:10]  # Limit tags
                recommendation['best_for'] = metadata.get('best_for', [])
            
            recommendations.append(recommendation)
        
        return recommendations
    
    def search_fonts_by_tags(self, tags: List[str]) -> List[Dict]:
        """Search fonts by specific tags"""
        matching_fonts = set()
        
        for tag in tags:
            tag_lower = tag.lower()
            if tag_lower in self.tag_index:
                matching_fonts.update(self.tag_index[tag_lower])
        
        # Format results
        results = []
        for font_id in matching_fonts:
            if font_id in self.all_fonts:
                font_data = self.all_fonts[font_id]
                metadata = self.font_metadata.get(font_id, {})
                
                results.append({
                    'id': font_id,
                    'name': font_data.get('name', font_id),
                    'category': font_data.get('category', 'unknown'),
                    'source': font_data.get('source', 'unknown'),
                    'tags': metadata.get('tags', [])[:10],
                    'description': metadata.get('description', '')[:200]
                })
        
        return results
    
    def get_fonts_for_use_case(self, use_case: str) -> List[Dict]:
        """Get fonts recommended for specific use case (body_text, headline, etc)"""
        if use_case not in self.best_for_index:
            return []
        
        font_ids = self.best_for_index[use_case]
        return self._format_font_recommendations(list(font_ids))
    
    def get_font_by_id(self, font_id: str) -> Optional[Dict]:
        """Get complete font details including metadata"""
        font_data = self.all_fonts.get(font_id)
        if not font_data:
            return None
        
        # Merge with metadata
        metadata = self.font_metadata.get(font_id, {})
        if metadata:
            font_data = {**font_data, **metadata}
        
        return font_data
    
    def get_font_path(self, font_id: str, style: str = 'regular') -> Optional[str]:
        """Get the file path for a specific font and style"""
        font_data = self.all_fonts.get(font_id)
        if not font_data:
            return None
        
        source = font_data.get('source', 'pixelbuddha')
        assets_root = Path(__file__).parent.parent / 'assets' / 'fonts'

        def _path_exists(rel: str) -> bool:
            return (Path(__file__).parent.parent / rel).exists()

        def _scan_for_best(base_dir: Path, is_pixelbuddha: bool) -> Optional[str]:
            if not base_dir.exists():
                return None
            # Recursively find valid font files, excluding macOS resource files
            candidates = []
            try:
                for ext in ['*.woff2', '*.woff', '*.otf', '*.ttf']:
                    for p in base_dir.rglob(ext):
                        parts = {part for part in p.parts}
                        name = p.name
                        if any(seg == '__MACOSX' for seg in p.parts):
                            continue
                        if name.startswith('._'):
                            continue
                        candidates.append(p)
            except Exception:
                return None
            if not candidates:
                return None
            # Preference is already implied by extension iteration order
            chosen = candidates[0]
            if is_pixelbuddha:
                remainder = chosen.relative_to(base_dir).as_posix()
                # Use actual on-disk layout under downloads/extracted
                return f"assets/fonts/pixelbuddha/downloads/extracted/{font_id}/{remainder}"
            else:
                remainder = chosen.relative_to(base_dir).as_posix()
                return f"assets/fonts/designer/{font_id}/{remainder}"

        if source == 'pixelbuddha':
            # Prefer declared files if they exist
            files = font_data.get('files', []) or []
            for f in files:
                rel = f.get('path') or f.get('url') or f.get('filename')
                if not rel:
                    continue
                # rel is already relative to assets root
                if _path_exists(rel):
                    return rel
            # Fallback: scan directory to locate a usable file
            # Use actual on-disk layout
            base_dir = assets_root / 'pixelbuddha' / 'downloads' / 'extracted' / font_id
            resolved = _scan_for_best(base_dir, True)
            if resolved:
                return resolved
            # Secondary fallback: try to find a directory that matches the id loosely
            try:
                pb_root = assets_root / 'pixelbuddha' / 'downloads' / 'extracted'
                if pb_root.exists():
                    # Normalize id by stripping common suffix patterns like " (1)"
                    base_id = font_id.split(' (')[0]
                    candidate_dir: Optional[Path] = None
                    for d in pb_root.iterdir():
                        if not d.is_dir():
                            continue
                        name = d.name
                        if name == font_id or name == base_id or name.startswith(base_id + '-'):
                            candidate_dir = d
                            break
                    if candidate_dir:
                        return _scan_for_best(candidate_dir, True)
            except Exception:
                pass
            return None
        else:
            styles = font_data.get('styles', {}) or {}
            # Try requested style
            if style in styles and styles[style]:
                file_info = styles[style][0]
                rel = f"assets/fonts/designer/{file_info['path']}"
                if _path_exists(rel):
                    return rel
            # Fallback to common style keys
            for fallback in ['regular', 'normal'] + (list(styles.keys()) if styles else []):
                if fallback and fallback in styles and styles[fallback]:
                    file_info = styles[fallback][0]
                    rel = f"assets/fonts/designer/{file_info['path']}"
                    if _path_exists(rel):
                        return rel
            # Final fallback: scan designer folder for the id
            base_dir = assets_root / 'designer' / font_id
            return _scan_for_best(base_dir, False)
    
    def get_statistics(self) -> Dict:
        """Get enhanced statistics about the font collection"""
        stats = {
            'total': len(self.all_fonts),
            'pixelbuddha': len(self.pixelbuddha_fonts),
            'designer': len(self.designer_fonts),
            'with_metadata': len(self.font_metadata),
            'categories': {},
            'tags': {},
            'use_cases': {}
        }
        
        # Category counts
        for font_data in self.all_fonts.values():
            cat = font_data.get('category', 'unknown')
            stats['categories'][cat] = stats['categories'].get(cat, 0) + 1
        
        # Tag counts (top 20)
        tag_counts = {}
        for metadata in self.font_metadata.values():
            for tag in metadata.get('tags', []):
                tag_lower = tag.lower()
                tag_counts[tag_lower] = tag_counts.get(tag_lower, 0) + 1
        
        sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)[:20]
        stats['tags'] = dict(sorted_tags)
        
        # Use case counts
        for use_case, fonts in self.best_for_index.items():
            stats['use_cases'][use_case] = len(fonts)
        
        return stats
    
    def select_font_pair(self,
                        deck_title: str,
                        vibe: str,
                        content_keywords: Optional[List[str]] = None,
                        target_audience: Optional[str] = None,
                        variety_seed: Optional[str] = None,
                        maturity: Optional[str] = None) -> Dict[str, str]:
        """
        Select a single font pair (hero + body) using variety seed for deterministic rotation.
        This is the main entry point for theme generation.

        Args:
            deck_title: Title of the presentation
            vibe: Overall vibe (professional, creative, elegant, etc.)
            content_keywords: List of topic keywords
            target_audience: Target audience (kids, teens, students, professionals, general)
            variety_seed: Seed for deterministic variety in font selection
            maturity: Content maturity level (young, professional, executive, general)
        """
        recommendations = self.get_fonts_for_theme(
            deck_title=deck_title,
            vibe=vibe,
            content_keywords=content_keywords,
            target_audience=target_audience,
            variety_seed=variety_seed,
            maturity=maturity  # Pass maturity
        )
        
        hero_fonts = recommendations['hero']
        body_fonts = recommendations['body']
        
        if not hero_fonts or not body_fonts:
            # Fallback to safe defaults
            return {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'fallback'}
        
        # Use variety_seed for deterministic rotation through top candidates
        if variety_seed:
            seed_hash = int(hashlib.md5(variety_seed.encode()).hexdigest(), 16)
            # Rotate through top 5 hero fonts
            hero_idx = seed_hash % min(5, len(hero_fonts))
            # Use different offset for body to avoid same font
            body_idx = (seed_hash + 3) % min(8, len(body_fonts))
        else:
            # No seed, pick top choice
            hero_idx = 0
            body_idx = 0
        
        selected_hero = hero_fonts[hero_idx]
        selected_body = body_fonts[body_idx]
        
        # Ensure hero and body are different
        if selected_hero['name'] == selected_body['name'] and len(body_fonts) > 1:
            body_idx = (body_idx + 1) % len(body_fonts)
            selected_body = body_fonts[body_idx]
        
        # Track usage for future variety
        self._track_font_usage(selected_hero['id'], is_hero=True)
        self._track_font_usage(selected_body['id'], is_hero=False)
        
        result = {
            'hero': selected_hero['name'],
            'body': selected_body['name'],
            'source': 'enhanced_metadata',
            'hero_id': selected_hero['id'],
            'body_id': selected_body['id'],
            'hero_category': selected_hero.get('category', 'unknown'),
            'body_category': selected_body.get('category', 'unknown')
        }
        
        logger.info(f"Selected font pair: {result['hero']} (hero) + {result['body']} (body)")
        
        return result