"""
Enhanced Font Service with Full Metadata Support
Intelligently recommends fonts based on actual font characteristics from PixelBuddha
"""

import json
import random
import hashlib
import re
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
    USE_CURATED_ONLY = False
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
        self.pixelbuddha_fonts = self._load_pixelbuddha_fonts()
        self.designer_fonts = self._load_designer_fonts()
        self.loose_designer_fonts = self._scan_loose_designer_fonts()
        self.google_fonts = self._load_google_fonts()
        self.all_fonts = {}

        self._merge_fonts(self.pixelbuddha_fonts)
        self._merge_fonts(self.designer_fonts)
        self._merge_fonts(self.loose_designer_fonts)
        self._merge_fonts(self.google_fonts)

        # Build tag index for fast lookup
        self.tag_index = self._build_tag_index()
        self.best_for_index = self._build_best_for_index()

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

    def _load_registry_file(self, path: Path) -> Dict:
        """Load a registry JSON file, unwrapping `fonts` if present."""
        if not path.exists():
            return {}
        try:
            with open(path, 'r') as f:
                data = json.load(f)
            if isinstance(data, dict) and 'fonts' in data and isinstance(data['fonts'], dict):
                return data['fonts']
            if isinstance(data, dict):
                return data
        except Exception as e:
            logger.warning(f"Failed to load registry from {path}: {e}")
        return {}

    def _merge_fonts(self, fonts: Dict) -> None:
        """Merge fonts into the catalog without overwriting existing IDs."""
        if not fonts:
            return
        for font_id, font_data in fonts.items():
            if font_id not in self.all_fonts:
                self.all_fonts[font_id] = font_data
    
    def _load_pixelbuddha_fonts(self) -> Dict:
        """
        Load PixelBuddha font registry — all available fonts.
        """
        registry_root = Path(__file__).parent.parent / 'assets' / 'fonts' / 'pixelbuddha'
        registry_path = registry_root / 'font_registry.json'
        if not registry_path.exists():
            registry_path = registry_root / 'font_registry_filtered.json'

        font_data_dict = self._load_registry_file(registry_path)
        if not font_data_dict:
            return {}

        fonts = {}
        curated_set = set(CURATED_PIXELBUDDHA_FONTS + FALLBACK_PIXELBUDDHA_FONTS) if USE_CURATED_ONLY else None
        loaded_count = 0
        skipped_count = 0

        for font_id, font_data in font_data_dict.items():
            if not isinstance(font_data, dict):
                continue
            if USE_CURATED_ONLY and curated_set and font_id not in curated_set:
                skipped_count += 1
                continue
            normalized = dict(font_data)
            normalized.setdefault('id', font_id)
            normalized['source'] = 'pixelbuddha'
            normalized['category'] = self._categorize_pixelbuddha_font(font_id, normalized)
            fonts[font_id] = normalized
            loaded_count += 1

        if USE_CURATED_ONLY:
            logger.info(f"Loaded {loaded_count} curated PixelBuddha fonts (skipped {skipped_count})")
        else:
            logger.info(f"Loaded {loaded_count} PixelBuddha fonts (all)")

        return fonts
    
    def _load_designer_fonts(self) -> Dict:
        """Load Designer/Unblast font registry"""
        registry_path = Path(__file__).parent.parent / 'assets' / 'fonts' / 'designer' / 'font_registry.json'
        data = self._load_registry_file(registry_path)
        if not data:
            return {}

        fonts = {}
        for font_id, font_data in data.items():
            if not isinstance(font_data, dict):
                continue
            normalized = dict(font_data)
            normalized.setdefault('id', font_id)
            normalized['source'] = 'designer'
            normalized['category'] = normalized.get('category') or self._guess_category_from_name(normalized.get('name', font_id))
            fonts[font_id] = normalized

        return fonts

    def _scan_loose_designer_fonts(self) -> Dict:
        """Scan designer folder for font files not tracked in the registry."""
        root = Path(__file__).parent.parent / 'assets' / 'fonts' / 'designer'
        if not root.exists():
            return {}

        registered_dirs: Set[str] = set()
        for font_data in (self.designer_fonts or {}).values():
            styles = font_data.get('styles', {}) or {}
            for files in styles.values():
                for file_info in files or []:
                    path = file_info.get('path') if isinstance(file_info, dict) else None
                    if not path:
                        continue
                    parts = path.split('/')
                    if parts:
                        registered_dirs.add(parts[0])

        fonts: Dict[str, Dict] = {}
        weight_map = {
            'thin': 100,
            'extralight': 200,
            'ultralight': 200,
            'light': 300,
            'book': 400,
            'regular': 400,
            'medium': 500,
            'semibold': 600,
            'demibold': 600,
            'bold': 700,
            'extrabold': 800,
            'ultrabold': 800,
            'black': 900,
            'heavy': 900,
        }

        def _slugify(name: str) -> str:
            return re.sub(r'[^a-z0-9]+', '-', name.lower()).strip('-')

        def _parse_name(stem: str) -> Tuple[str, str, int]:
            cleaned = re.sub(r'[_-]+', ' ', stem).strip()
            tokens = cleaned.split()
            if not tokens:
                return stem, 'regular', 400
            last = tokens[-1].lower()
            if last in weight_map:
                family = ' '.join(tokens[:-1]).strip() or cleaned
                return family, last, weight_map[last]
            return cleaned, 'regular', 400

        for font_file in root.rglob('*'):
            if not font_file.is_file():
                continue
            if font_file.suffix.lower() not in {'.otf', '.ttf', '.woff', '.woff2'}:
                continue
            if '__MACOSX' in font_file.parts or font_file.name.startswith('._'):
                continue
            rel = font_file.relative_to(root).as_posix()
            first_dir = rel.split('/')[0] if '/' in rel else ''
            if first_dir in registered_dirs:
                continue
            if font_file.name in {'font_registry.json', 'font_list.json'}:
                continue

            family, style_key, weight_val = _parse_name(font_file.stem)
            font_id = _slugify(family)
            if font_id in self.designer_fonts or font_id in self.pixelbuddha_fonts:
                font_id = f"{font_id}-local"

            entry = fonts.setdefault(font_id, {
                'id': font_id,
                'name': family,
                'source': 'designer',
                'category': self._guess_category_from_name(family),
                'styles': {}
            })
            entry_styles = entry.setdefault('styles', {})
            entry_styles.setdefault(style_key, []).append({
                'path': rel,
                'format': font_file.suffix.lstrip('.'),
                'weight': weight_val,
                'style': 'normal'
            })

        return fonts
    
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
        
        for font_id, font_data in google_fonts.items():
            if isinstance(font_data, dict):
                font_data.setdefault('id', font_id)
        return google_fonts
    
    def _guess_category_from_name(self, font_name: str) -> str:
        """Guess font category from name when metadata unavailable"""
        name_lower = font_name.lower()
        
        # Editorial/Magazine fonts (Oranienbaum, Bodoni Moda, Rozha One, etc.)
        if any(kw in name_lower for kw in [
            'oranienbaum', 'bodoni', 'rozha', 'arvo', 'slabo', 'faustina', 
            'noticia', 'frank ruhl', 'libre baskerville', 'crimson', 
            'spectral', 'cormorant', 'italiana', 'gilda'
        ]):
            return 'serif'
        # Playful/Fun fonts
        elif any(kw in name_lower for kw in ['fredoka', 'baloo', 'chewy', 'bubblegum', 'bungee', 'bangers', 'comic', 'righteous', 'titan']):
            return 'display'
        # Display/Bold fonts
        elif any(kw in name_lower for kw in ['bebas', 'anton', 'oswald', 'impact', 'black', 'bold', 'display']):
            return 'display'
        # Script/Handwritten
        elif any(kw in name_lower for kw in ['pacifico', 'kaushan', 'caveat', 'script', 'hand']):
            return 'script'
        # Mono/Code
        elif any(kw in name_lower for kw in ['mono', 'code', 'jetbrains', 'fira', 'consolas']):
            return 'mono'
        # Slab
        elif 'slab' in name_lower:
            return 'slab'
        # Serif (general)
        elif any(kw in name_lower for kw in ['serif', 'times', 'garamond', 'playfair', 'merriweather']):
            return 'serif'
        # Default to sans
        else:
            return 'sans'
    
    def _categorize_pixelbuddha_font(self, font_id: str, font_data: Dict) -> str:
        """Categorize PixelBuddha font based on metadata"""
        # Check metadata for category hints
        metadata = self.font_metadata.get(font_id, {})
        tags = metadata.get('tags', [])
        
        # Convert tags to lowercase for comparison
        tags_lower = [str(tag).lower() for tag in tags if isinstance(tag, str)]
        name_lower = str(font_data.get('name', font_id)).lower()

        def tag_has(keywords: List[str]) -> bool:
            return any(any(kw in tag for kw in keywords) for tag in tags_lower)

        def name_has(keywords: List[str]) -> bool:
            return any(kw in name_lower for kw in keywords)

        mono_keywords = ['mono', 'monospace', 'code']
        script_keywords = ['script', 'handwritten', 'handwriting', 'hand lettering', 'hand-lettering', 'calligraphy', 'brush', 'signature']
        slab_keywords = ['slab']
        serif_keywords = ['serif', 'soft serif', 'display serif', 'serifs']
        sans_keywords = ['sans', 'sans-serif', 'sanf serif', 'grotesk', 'geometric', 'neo-grotesk']
        display_keywords = ['display', 'headline', 'poster', 'decorative', 'ornate', 'grunge', 'blackletter', 'gothic', 'pixel', '8bit', '8-bit', 'retro', 'vintage', 'experimental', 'stencil', 'outlined', 'outline', 'shadow', '3d']

        # Categorize based on tags
        if tag_has(mono_keywords) or name_has(mono_keywords):
            return 'mono'
        if tag_has(script_keywords) or name_has(script_keywords):
            return 'script'
        if tag_has(slab_keywords) or name_has(slab_keywords):
            return 'slab'
        if (tag_has(serif_keywords) or name_has(serif_keywords)) and not (tag_has(sans_keywords) or name_has(sans_keywords)):
            return 'serif'
        if tag_has(sans_keywords) or name_has(sans_keywords):
            return 'sans'
        if tag_has(display_keywords) or name_has(display_keywords):
            return 'display'
        
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

    def _normalize_font_query(self, font_name: str) -> str:
        """Normalize font names for fuzzy matching."""
        if not font_name:
            return ''
        cleaned = re.sub(r'[_-]+', ' ', str(font_name)).lower()
        cleaned = re.sub(r'[^a-z0-9\\s]+', ' ', cleaned)
        weight_tokens = {
            'thin', 'extralight', 'ultralight', 'light', 'book', 'regular', 'medium',
            'semibold', 'demibold', 'bold', 'extrabold', 'ultrabold', 'black', 'heavy',
            'italic', 'oblique', 'condensed', 'expanded', 'narrow', 'wide'
        }
        tokens = [t for t in cleaned.split() if t and t not in weight_tokens]
        return ' '.join(tokens).strip()

    def _tokenize_font_name(self, font_name: str) -> Set[str]:
        normalized = self._normalize_font_query(font_name)
        if not normalized:
            return set()
        return set(normalized.split())

    def _infer_style_from_name(self, font_name: str) -> Optional[str]:
        name = str(font_name or '').lower()
        if any(tok in name for tok in ['script', 'hand', 'brush', 'calligraphy']):
            return 'script'
        if 'mono' in name or 'code' in name:
            return 'mono'
        if 'slab' in name:
            return 'slab'
        if 'serif' in name and 'sans' not in name:
            return 'serif'
        if any(tok in name for tok in ['sans', 'grotesk', 'gotham', 'helvetica']):
            return 'sans'
        if any(tok in name for tok in ['display', 'headline']):
            return 'display'
        return None

    def _normalize_category(self, category: str) -> Optional[str]:
        cat = str(category or '').lower()
        if 'mono' in cat:
            return 'mono'
        if 'script' in cat or 'hand' in cat:
            return 'script'
        if 'slab' in cat:
            return 'slab'
        if 'serif' in cat and 'sans' not in cat:
            return 'serif'
        if 'sans' in cat:
            return 'sans'
        if 'display' in cat:
            return 'display'
        return None

    def _get_available_font_ids(self, include_remote: bool = False) -> Set[str]:
        cache_attr = '_available_font_ids_remote' if include_remote else '_available_font_ids_local'
        cached = getattr(self, cache_attr, None)
        if cached is not None:
            return cached

        available: Set[str] = set()
        for font_id, font_data in self.all_fonts.items():
            source = font_data.get('source', '')
            if not include_remote and source in {'google', 'system', 'cdn', 'fontshare'}:
                continue
            try:
                if source in {'google', 'system', 'cdn', 'fontshare'}:
                    available.add(font_id)
                elif self.get_font_path(font_id, 'regular'):
                    available.add(font_id)
            except Exception:
                continue

        setattr(self, cache_attr, available)
        return available

    def get_available_font_ids(self, include_remote: bool = False) -> Set[str]:
        """Public accessor for available font IDs."""
        return self._get_available_font_ids(include_remote=include_remote)

    def match_font_name(
        self,
        font_name: str,
        *,
        is_hero: bool = False,
        include_remote: bool = False
    ) -> Optional[str]:
        """Find the best available font name to match a requested font."""
        if not font_name:
            return None

        normalized = self._normalize_font_query(font_name)
        if not normalized:
            return None

        available_ids = self._get_available_font_ids(include_remote=include_remote)
        requested_tokens = self._tokenize_font_name(font_name)
        desired_style = self._infer_style_from_name(font_name)

        best_name = None
        best_score = 0.0

        for font_id in available_ids:
            font_data = self.all_fonts.get(font_id, {})
            candidate_name = font_data.get('name', font_id)
            candidate_norm = self._normalize_font_query(candidate_name)
            if not candidate_norm:
                continue
            if candidate_norm == normalized:
                return candidate_name

            name_similarity = SequenceMatcher(None, normalized, candidate_norm).ratio()
            candidate_tokens = self._tokenize_font_name(candidate_name)
            token_overlap = 0.0
            if requested_tokens and candidate_tokens:
                token_overlap = len(requested_tokens & candidate_tokens) / len(requested_tokens | candidate_tokens)

            candidate_category = self._normalize_category(font_data.get('category'))
            category_match = 0.0
            if desired_style and candidate_category == desired_style:
                category_match = 1.0

            metadata = self.font_metadata.get(font_id, {})
            tags = set(tag.lower() for tag in metadata.get('tags', []) if isinstance(tag, str))
            tag_overlap = 0.0
            if requested_tokens and tags:
                tag_overlap = len(requested_tokens & tags) / max(len(requested_tokens), 1)

            score = (
                name_similarity * 0.55 +
                token_overlap * 0.2 +
                category_match * 0.15 +
                tag_overlap * 0.1
            )

            if is_hero:
                if candidate_category in {'display', 'serif'}:
                    score += 0.05
            else:
                if candidate_category == 'display':
                    score -= 0.1

            if score > best_score:
                best_score = score
                best_name = candidate_name

        return best_name
    
    def get_fonts_for_theme(self,
                           deck_title: str,
                           vibe: str,
                           content_keywords: Optional[List[str]] = None,
                           target_audience: Optional[str] = None,
                           variety_seed: Optional[str] = None) -> Dict:
        """
        Get font recommendations based on theme with intelligent metadata-based selection
        and variety mechanism to avoid repetition.
        """
        context = self._analyze_context(deck_title, vibe, content_keywords, target_audience)
        
        # Get fonts with scoring based on metadata
        hero_fonts = self._get_hero_fonts_with_scoring(context)
        body_fonts = self._get_body_fonts_with_scoring(context)
        
        # Apply variety/recency penalties
        hero_fonts = self._apply_variety_scoring(hero_fonts, is_hero=True)
        body_fonts = self._apply_variety_scoring(body_fonts, is_hero=False)
        
        # Format response with metadata
        return {
            'context': context,
            'hero': self._format_font_recommendations(hero_fonts[:20]),  # Increased from 12
            'body': self._format_font_recommendations(body_fonts[:25]),  # Increased from 8
            'variety_seed': variety_seed
        }
    
    def _analyze_context(self, deck_title: str, vibe: str,
                        content_keywords: Optional[List[str]],
                        target_audience: Optional[str]) -> Dict:
        """Analyze context to determine font selection criteria"""

        context = {
            'title': deck_title.lower(),
            'vibe': vibe.lower(),
            'keywords': [k.lower() for k in content_keywords] if content_keywords else [],
            'audience': target_audience.lower() if target_audience else '',
            'style': '',
            'type': '',
            'required_tags': set(),
            'preferred_tags': set(),
            'avoid_tags': set()
        }

        # Determine style based on vibe and keywords
        if vibe in ['professional', 'corporate', 'formal']:
            context['style'] = 'professional'
            context['required_tags'].update(['clean', 'modern', 'professional'])
            context['avoid_tags'].update(['graffiti', 'distorted', 'horror', 'comic'])
        elif vibe in ['creative', 'artistic', 'playful']:
            context['style'] = 'creative'
            context['preferred_tags'].update(['creative', 'artistic', 'unique', 'display', 'playful', 'fun', 'bold', 'expressive'])
            # Avoid overly corporate/boring fonts for creative contexts
            context['avoid_tags'].update(['corporate', 'formal', 'conservative'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        elif vibe in ['modern', 'minimal', 'clean']:
            context['style'] = 'modern'
            context['required_tags'].update(['modern', 'minimal', 'clean'])
        elif vibe in ['elegant', 'luxury', 'sophisticated']:
            context['style'] = 'elegant'
            context['preferred_tags'].update(['elegant', 'sophisticated', 'serif'])
        elif vibe in ['retro', 'vintage', 'nostalgic']:
            context['style'] = 'retro'
            context['required_tags'].update(['retro', 'vintage', '60s', '70s', '80s'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        
        # Analyze keywords for additional context
        all_text = ' '.join([deck_title] + (content_keywords or []))

        if any(word in all_text.lower() for word in ['gaming', 'game', 'arcade', 'pixel', '8bit', '8-bit', 'retro game']):
            context['type'] = 'gaming'
            context['preferred_tags'].update(['pixel', 'arcade', '8bit', '8-bit', 'retro', 'game'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        elif any(word in all_text.lower() for word in ['80s', '70s', '60s', 'disco', 'groovy', 'vintage', 'throwback']):
            context['type'] = 'retro'
            context['preferred_tags'].update(['retro', 'vintage', '80s', '70s', '60s', 'disco', 'groovy'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        elif any(word in all_text.lower() for word in ['music', 'concert', 'festival', 'band', 'artist']):
            context['type'] = 'music'
            context['preferred_tags'].update(['bold', 'creative', 'artistic', 'display'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        elif any(word in all_text.lower() for word in ['kids', 'children', 'playful', 'fun']):
            context['type'] = 'kids'
            context['preferred_tags'].update(['playful', 'fun', 'cute', 'friendly', 'rounded'])
            # NOTE: Bold fonts are for HERO/DISPLAY only, not body text
        elif any(word in all_text.lower() for word in ['tech', 'software', 'digital', 'ai', 'data']):
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
        Balanced scoring across Designer, PixelBuddha, and Google fonts.
        Prioritize distinctive, eye-catching fonts that make titles pop.
        """
        scored_fonts = []

        for font_id, font_data in self.all_fonts.items():
            score = self._score_font_for_context(font_id, context, for_body=False)

            # HUGE boost for Designer fonts - they're our premium, unique fonts!
            source = font_data.get('source', '').lower()
            category = font_data.get('category', '').lower()
            
            if 'designer' in source or font_data.get('category') == 'designer':
                score *= 2.5  # 150% boost for Designer fonts - USE THESE FIRST!
                logger.debug(f"Designer font boosted: {font_id} (source: {source})")
            
            # Balanced boost for PixelBuddha fonts - excellent display fonts
            elif source == 'pixelbuddha':
                score *= 1.35  # 35% boost for PixelBuddha fonts (reduced from 1.8x to balance with Google)
                logger.debug(f"PixelBuddha font boosted: {font_id}")
            
            # Boost for Google fonts - includes great Editorial/Serif fonts
            elif source == 'google':
                # Extra boost for Editorial/Serif fonts (Oranienbaum, Bodoni Moda, Rozha One, etc.)
                # These are excellent for hero/display text
                if any(keyword in category for keyword in ['editorial', 'serif', 'display']) or 'editorial' in font_id:
                    score *= 1.45  # 45% boost for Editorial/Serif Google fonts
                    logger.debug(f"Google Editorial/Serif font boosted: {font_id} (category: {category})")
                else:
                    score *= 1.35  # 35% boost for other Google fonts (balanced with PixelBuddha)
            
            # Penalize boring defaults even if they score well
            boring_fonts = ['inter', 'roboto', 'arial', 'helvetica', 'times-new-roman', 'lato']
            if any(boring in font_id.lower() for boring in boring_fonts):
                score *= 0.3  # Heavy penalty for boring fonts

            if score > 0:
                scored_fonts.append((font_id, score))

        # Sort by score descending
        scored_fonts.sort(key=lambda x: x[1], reverse=True)

        return scored_fonts
    
    def _get_body_fonts_with_scoring(self, context: Dict) -> List[Tuple[str, float]]:
        """
        Get body fonts with intelligent scoring based on metadata.
        Uses clean, readable fonts (Google Fonts, Designer sans-serif fonts).
        Prefers Designer fonts when they're readable and clean.
        AVOIDS BOLD/THICK FONTS FOR BODY TEXT - body text needs to be readable!
        """
        scored_fonts = []

        for font_id, font_data in self.all_fonts.items():
            score = self._score_font_for_context(font_id, context, for_body=True)

            # Prioritize clean Designer sans-serif fonts for body text
            source = font_data.get('source', '').lower()
            category = font_data.get('category', '').lower()
            font_name = font_data.get('name', '').lower()

            # PENALTY for BOLD/FAT fonts - they're hard to read in body text!
            is_bold_font = any(keyword in font_name for keyword in [
                'bold', 'black', 'heavy', 'extra bold', 'ultra', 'fat',
                'thick', 'bebas', 'oswald', 'impact', 'anton', 'archivo black'
            ])

            # Also penalize fonts categorized as 'display' - they're for headlines, not body
            is_display_font = 'display' in category

            if is_bold_font or is_display_font:
                # Penalize bold/thick/display fonts for body text - they're hard to read!
                # STRICT RULE: Never use bold/display fonts for body text unless explicitly requested
                if context.get('prefer_bold_body', False):
                    score *= 0.5  # Heavy penalty even when preferred
                else:
                    score = 0.0  # STRICT BAN: Score 0 means it won't be selected
                logger.debug(f"Bold/Display body font penalized: {font_id} (category={category}, score={score})")
            
            if 'designer' in source and 'sans' in category:
                # Designer sans-serif fonts are great for body text!
                score *= 1.5  # 50% boost for clean Designer sans-serif fonts
                logger.debug(f"Designer sans-serif font boosted for body: {font_id}")
            
            # Boost Google fonts for body text - they're optimized for readability
            elif source == 'google' and score > 0:
                score *= 1.2  # 20% boost for Google fonts in body text
            
            # Slight penalty for boring defaults to encourage variety
            boring_fonts = ['inter', 'arial', 'helvetica', 'times-new-roman']
            if any(boring in font_id.lower() for boring in boring_fonts):
                score *= 0.5  # Moderate penalty for boring fonts

            if score > 0:
                scored_fonts.append((font_id, score))

        # Sort by score descending
        scored_fonts.sort(key=lambda x: x[1], reverse=True)

        return scored_fonts
    
    def _apply_variety_scoring(self, scored_fonts: List[Tuple[str, float]], is_hero: bool = True) -> List[str]:
        """
        Apply variety penalties to avoid repetitive font selections.
        Recent fonts get penalized, heavily used fonts get penalized.
        AGGRESSIVE penalties to ensure real variety!
        """
        recent_fonts = self._recent_hero_fonts if is_hero else self._recent_body_fonts
        
        rescored = []
        for font_id, base_score in scored_fonts:
            penalty = 0.0
            
            # Recency penalty - recently used fonts are penalized HEAVILY
            if font_id in recent_fonts:
                # More recent = higher penalty
                recency_position = list(recent_fonts).index(font_id)
                # 0 = most recent, maxlen-1 = oldest
                # Increased from 0.6 to 0.85 for more aggressive variety
                recency_penalty = (1.0 - (recency_position / len(recent_fonts))) * 0.85
                penalty += recency_penalty
            
            # Usage frequency penalty - overused fonts get penalized MORE
            usage_count = self._font_usage_count.get(font_id, 0)
            if usage_count > 0:
                # Increased from 0.05 to 0.08, cap at 0.5 instead of 0.3
                frequency_penalty = min(usage_count * 0.08, 0.5)
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
        if source in {'google', 'system', 'cdn', 'fontshare'}:
            return None
        assets_root = Path(__file__).parent.parent / 'assets' / 'fonts'

        def _path_exists(rel: str) -> bool:
            return (Path(__file__).parent.parent / rel).exists()

        def _scan_for_best(base_dir: Path, is_pixelbuddha: bool, actual_dir_name: Optional[str] = None) -> Optional[str]:
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
            # Use actual directory name if provided, otherwise use font_id
            dir_name = actual_dir_name if actual_dir_name else font_id
            if is_pixelbuddha:
                remainder = chosen.relative_to(base_dir).as_posix()
                # Use actual on-disk layout under downloads/extracted
                return f"assets/fonts/pixelbuddha/downloads/extracted/{dir_name}/{remainder}"
            else:
                remainder = chosen.relative_to(base_dir).as_posix()
                return f"assets/fonts/designer/{dir_name}/{remainder}"

        if source == 'pixelbuddha' or source == 'registry':
            # For 'registry' source, we need to search both PixelBuddha and Designer
            # But try PixelBuddha first since most fonts are from there
            
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
                        # FIXED: Match directories with number prefixes (e.g., "4126-403-doshi" matches "403-doshi")
                        # Strategy: Check if the font_id appears at the end of the directory name, or as a component
                        # This handles cases like:
                        # - "4126-403-doshi" matching "403-doshi"
                        if (name == font_id or 
                            name == base_id or 
                            name.endswith('-' + font_id) or
                            name.endswith('-' + base_id) or
                            ('-' + font_id + '-') in name or
                            ('-' + base_id + '-') in name or
                            name.startswith(font_id + '-') or
                            name.startswith(base_id + '-')):
                            candidate_dir = d
                            break
                    if candidate_dir:
                        return _scan_for_best(candidate_dir, True, candidate_dir.name)
            except Exception:
                pass
            
            # If source is 'registry' and we didn't find it in PixelBuddha, try Designer
            if source == 'registry':
                base_dir = assets_root / 'designer' / font_id
                resolved = _scan_for_best(base_dir, False)
                if resolved:
                    return resolved
            
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
            'google': len(self.google_fonts),
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
    
    def _font_has_files(self, font_id: str) -> bool:
        """Check if a font actually has available files on disk"""
        try:
            # Try to get font path - if it returns None, font doesn't have files
            path = self.get_font_path(font_id, 'regular')
            return path is not None
        except Exception:
            return False
    
    def _filter_available_fonts(self, fonts: List[Dict]) -> List[Dict]:
        """Filter list to only include fonts with actual files available"""
        available = []
        for font in fonts:
            font_id = font.get('id', '')
            source = str(font.get('source', '')).lower()
            if source in {'google', 'system', 'cdn', 'fontshare'}:
                available.append(font)
                continue
            if font_id and self._font_has_files(font_id):
                available.append(font)
        return available
    
    def select_font_pair(self,
                        deck_title: str,
                        vibe: str,
                        content_keywords: Optional[List[str]] = None,
                        target_audience: Optional[str] = None,
                        variety_seed: Optional[str] = None) -> Dict[str, str]:
        """
        Select a single font pair (hero + body) using variety seed for deterministic rotation.
        This is the main entry point for theme generation.
        """
        recommendations = self.get_fonts_for_theme(
            deck_title=deck_title,
            vibe=vibe,
            content_keywords=content_keywords,
            target_audience=target_audience,
            variety_seed=variety_seed
        )
        
        hero_fonts = recommendations['hero']
        body_fonts = recommendations['body']
        
        # CRITICAL: Filter out fonts without actual files
        hero_fonts = self._filter_available_fonts(hero_fonts)
        body_fonts = self._filter_available_fonts(body_fonts)
        
        if not hero_fonts or not body_fonts:
            # Fallback to safe defaults
            logger.warning(f"⚠️  No available fonts found after filtering! Using fallback fonts.")
            return {'hero': 'Montserrat', 'body': 'Roboto', 'source': 'fallback'}
        
        # Use variety_seed for deterministic rotation through top candidates
        if variety_seed:
            seed_hash = int(hashlib.md5(variety_seed.encode()).hexdigest(), 16)
            # Rotate through top 15 hero fonts (increased from 5 for more variety)
            hero_idx = seed_hash % min(15, len(hero_fonts))
            # Use different offset for body to avoid same font (increased from 8 to 20)
            body_idx = (seed_hash + 3) % min(20, len(body_fonts))
        else:
            # No seed, pick top choice
            hero_idx = 0
            body_idx = 0
        
        selected_hero = hero_fonts[hero_idx]
        selected_body = body_fonts[body_idx]
        
        # CRITICAL: Validate font names aren't invalid strings
        invalid_fonts = ['fonts', 'font', 'font family', 'fontfamily', 'default', 'none', 'null']
        
        hero_name = selected_hero.get('name', '')
        body_name = selected_body.get('name', '')
        
        # If hero font is invalid, try next ones or fallback
        if hero_name.lower() in invalid_fonts:
            logger.warning(f"⚠️  Invalid hero font '{hero_name}' detected! Trying alternatives...")
            for attempt in range(min(5, len(hero_fonts))):
                alt_idx = (hero_idx + attempt + 1) % len(hero_fonts)
                if hero_fonts[alt_idx]['name'].lower() not in invalid_fonts:
                    selected_hero = hero_fonts[alt_idx]
                    hero_name = selected_hero['name']
                    logger.info(f"✅ Using alternative hero font: {hero_name}")
                    break
            else:
                # All failed, use hardcoded fallback
                logger.warning("⚠️  All hero fonts invalid! Using Bebas Neue fallback")
                selected_hero = {'id': 'bebas-neue', 'name': 'Bebas Neue', 'category': 'bold'}
                hero_name = 'Bebas Neue'
        
        # If body font is invalid, try alternatives or fallback
        if body_name.lower() in invalid_fonts:
            logger.warning(f"⚠️  Invalid body font '{body_name}' detected! Trying alternatives...")
            for attempt in range(min(8, len(body_fonts))):
                alt_idx = (body_idx + attempt + 1) % len(body_fonts)
                if body_fonts[alt_idx]['name'].lower() not in invalid_fonts:
                    selected_body = body_fonts[alt_idx]
                    body_name = selected_body['name']
                    logger.info(f"✅ Using alternative body font: {body_name}")
                    break
            else:
                # All failed, use hardcoded fallback
                logger.warning("⚠️  All body fonts invalid! Using Poppins fallback")
                selected_body = {'id': 'poppins', 'name': 'Poppins', 'category': 'sans-serif'}
                body_name = 'Poppins'
        
        # Ensure hero and body are different
        if hero_name == body_name and len(body_fonts) > 1:
            body_idx = (body_idx + 1) % len(body_fonts)
            if body_fonts[body_idx]['name'].lower() not in invalid_fonts:
                selected_body = body_fonts[body_idx]
                body_name = selected_body['name']
        
        # Track usage for future variety
        self._track_font_usage(selected_hero.get('id', hero_name), is_hero=True)
        self._track_font_usage(selected_body.get('id', body_name), is_hero=False)
        
        result = {
            'hero': hero_name,
            'body': body_name,
            'source': 'enhanced_metadata',
            'hero_id': selected_hero.get('id', hero_name),
            'body_id': selected_body.get('id', body_name),
            'hero_category': selected_hero.get('category', 'unknown'),
            'body_category': selected_body.get('category', 'unknown')
        }
        
        logger.info(f"Selected font pair: {result['hero']} (hero) + {result['body']} (body)")
        print(f"✅ ENHANCED_FONT_SERVICE selected: Hero={result['hero']}, Body={result['body']}")
        
        return result
