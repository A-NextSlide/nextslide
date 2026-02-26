"""
Font Intelligence - Smart font pairing based on brand, content, and typography rules.
Uses EnhancedFontService metadata (698 fonts, 1010 tags) for intelligent selection.
"""

import logging
import random
import hashlib
from typing import Dict, List, Optional, Tuple, Set

logger = logging.getLogger(__name__)


class FontIntelligence:
    """
    Smart font selection that dynamically queries 698+ fonts with metadata.

    Uses:
    1. Tag index (1010 unique tags) for semantic matching
    2. best_for index (headlines, body_text, logos, etc.) for role matching
    3. style_characteristics (personality, era, weight) for nuanced selection
    4. Typography pairing rules for harmony
    """

    # Fonts to NEVER select (problematic, ugly, or overused)
    EXCLUDED_FONTS = {
        'absently', 'absently display', 'absently display font',
        'alerio', 'alerio sans', 'alerio sans serif',
        'impact',  # Meme font
        'comic sans', 'comic sans ms',  # Universally disliked
        'papyrus',  # Avatar meme
    }

    # Typography pairing rules - which categories pair well
    PAIRING_RULES = {
        'display': ['sans', 'serif', 'geometric-sans', 'humanist-sans'],
        'display-serif': ['sans', 'geometric-sans', 'humanist-sans'],
        'editorial-serif': ['sans', 'geometric-sans', 'humanist-sans'],
        'serif': ['sans', 'geometric-sans', 'humanist-sans'],
        'sans': ['serif', 'geometric-sans', 'sans'],
        'geometric-sans': ['serif', 'humanist-sans', 'sans'],
        'playful': ['rounded-sans', 'sans', 'friendly', 'sans'],
        'script': ['sans', 'serif'],
        'mono': ['sans', 'geometric-sans'],
    }

    # Tags that indicate niche/specialty fonts — penalized unless content demands them
    NICHE_TAGS = frozenset({
        'horror', 'graffiti', 'blackletter', 'pixel', 'gothic', 'comic', 'cartoon',
        'western', 'medieval', 'psychedelic', 'punk', 'distressed', 'grunge', 'stencil',
        'dark', 'aggressive', 'cyberpunk', 'military', 'streetwear', 'hip-hop',
        'y2k', 'sci-fi', 'fantasy', '3d', 'shadow', 'inline', 'textured',
        'decorative', 'victorian', 'art-nouveau', 'bohemian', 'tropical',
    })

    # Tags that should NEVER appear on body fonts — hard readability gate
    BODY_BLOCKED_TAGS = frozenset({
        'horror', 'graffiti', 'blackletter', 'pixel', 'gothic', 'comic', 'cartoon',
        'western', 'medieval', 'psychedelic', 'punk', 'distressed', 'grunge', 'stencil',
        'decorative', '3d', 'shadow', 'inline', 'textured', 'outline',
    })

    # Map brand styles to metadata tags (these exist in our 1010 tags)
    BRAND_STYLE_TAGS = {
        'university': {
            'hero_tags': ['serif', 'traditional', 'elegant', 'classic', 'editorial', 'sophisticated', 'timeless', 'academic'],
            'body_tags': ['clean', 'readable', 'professional', 'minimal', 'modern'],
            'avoid_tags': ['graffiti', 'horror', 'comic', 'distorted', 'playful', 'fun'],
            'best_for_hero': ['headlines', 'logos', 'presentations'],
            'best_for_body': ['body_text', 'presentations', 'print'],
        },
        'tech': {
            'hero_tags': ['geometric', 'modern', 'futuristic', 'minimal', 'tech', 'digital', 'sleek', 'sharp', 'contemporary'],
            'body_tags': ['clean', 'readable', 'technical', 'modern', 'geometric'],
            'avoid_tags': ['vintage', 'retro', 'handwritten', 'script', 'ornate'],
            'best_for_hero': ['headlines', 'logos', 'web'],
            'best_for_body': ['body_text', 'web', 'presentations'],
        },
        'luxury': {
            'hero_tags': ['elegant', 'sophisticated', 'luxury', 'refined', 'high-end', 'premium', 'classy', 'fashion', 'editorial'],
            'body_tags': ['clean', 'minimal', 'refined', 'elegant', 'light'],
            'avoid_tags': ['playful', 'comic', 'grunge', 'distressed', 'casual'],
            'best_for_hero': ['logos', 'headlines', 'invitations'],
            'best_for_body': ['body_text', 'print', 'invitations'],
        },
        'sports': {
            'hero_tags': ['bold', 'strong', 'dynamic', 'athletic', 'condensed', 'impact', 'powerful', 'energetic', 'action'],
            'body_tags': ['clean', 'readable', 'condensed', 'modern'],
            'avoid_tags': ['delicate', 'script', 'ornate', 'feminine'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'web'],
        },
        'creative': {
            'hero_tags': ['artistic', 'unique', 'expressive', 'creative', 'display', 'decorative', 'quirky', 'fun', 'bold'],
            'body_tags': ['readable', 'clean', 'friendly', 'modern'],
            'avoid_tags': ['corporate', 'formal', 'conservative'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'web'],
        },
        'corporate': {
            'hero_tags': ['professional', 'clean', 'trustworthy', 'modern', 'business', 'corporate', 'neutral'],
            'body_tags': ['readable', 'clean', 'professional', 'neutral'],
            'avoid_tags': ['graffiti', 'horror', 'comic', 'playful', 'distorted'],
            'best_for_hero': ['headlines', 'presentations', 'logos'],
            'best_for_body': ['body_text', 'presentations', 'print'],
        },
        'food': {
            'hero_tags': ['friendly', 'warm', 'inviting', 'organic', 'handwritten', 'rustic', 'cozy', 'appetizing'],
            'body_tags': ['readable', 'friendly', 'warm', 'clean'],
            'avoid_tags': ['cold', 'technical', 'futuristic', 'corporate'],
            'best_for_hero': ['logos', 'packaging', 'headlines'],
            'best_for_body': ['body_text', 'packaging'],
        },
        'health': {
            'hero_tags': ['clean', 'trustworthy', 'caring', 'modern', 'fresh', 'calm', 'wellness', 'medical'],
            'body_tags': ['readable', 'clean', 'calming', 'professional'],
            'avoid_tags': ['aggressive', 'horror', 'grunge', 'distressed'],
            'best_for_hero': ['headlines', 'logos', 'web'],
            'best_for_body': ['body_text', 'web', 'print'],
        },
        'kids': {
            'hero_tags': ['playful', 'fun', 'rounded', 'friendly', 'cute', 'cartoon', 'bouncy', 'whimsical', 'cheerful'],
            'body_tags': ['readable', 'rounded', 'friendly', 'clean'],
            'avoid_tags': ['serious', 'corporate', 'formal', 'horror'],
            'best_for_hero': ['headlines', 'logos', 'packaging'],
            'best_for_body': ['body_text', 'web'],
        },
        'retro': {
            'hero_tags': ['retro', 'vintage', '70s', '80s', '60s', '50s', 'nostalgic', 'classic', 'throwback', 'disco', 'groovy'],
            'body_tags': ['readable', 'clean', 'vintage', 'classic'],
            'avoid_tags': ['futuristic', 'modern', 'minimal'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'print'],
        },
        'gaming': {
            'hero_tags': ['pixel', '8-bit', 'arcade', 'gaming', 'retro', 'bold', 'futuristic', 'tech', 'digital'],
            'body_tags': ['readable', 'clean', 'modern', 'tech'],
            'avoid_tags': ['elegant', 'serif', 'traditional', 'formal'],
            'best_for_hero': ['headlines', 'logos', 'posters'],
            'best_for_body': ['body_text', 'web'],
        },
        'music': {
            'hero_tags': ['bold', 'creative', 'artistic', 'expressive', 'display', 'dynamic', 'groovy', 'rock', 'concert'],
            'body_tags': ['readable', 'clean', 'modern'],
            'avoid_tags': ['corporate', 'formal', 'conservative'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'web'],
        },
        'fashion': {
            'hero_tags': ['elegant', 'sophisticated', 'fashion', 'editorial', 'minimal', 'chic', 'stylish', 'luxury'],
            'body_tags': ['clean', 'minimal', 'elegant', 'light'],
            'avoid_tags': ['comic', 'playful', 'grunge', 'casual'],
            'best_for_hero': ['logos', 'headlines', 'print'],
            'best_for_body': ['body_text', 'print', 'web'],
        },
        'wedding': {
            'hero_tags': ['elegant', 'romantic', 'script', 'calligraphy', 'delicate', 'ornate', 'flourish', 'wedding'],
            'body_tags': ['readable', 'elegant', 'clean', 'serif'],
            'avoid_tags': ['bold', 'grunge', 'horror', 'comic'],
            'best_for_hero': ['invitations', 'logos', 'headlines'],
            'best_for_body': ['body_text', 'invitations', 'print'],
        },
        'halloween': {
            'hero_tags': ['horror', 'gothic', 'dark', 'blackletter', 'medieval', 'distressed', 'grunge', 'spooky', 'creepy'],
            'body_tags': ['clean', 'readable', 'modern', 'neutral'],
            'avoid_tags': ['cute', 'playful', 'cheerful', 'friendly'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'web'],
        },
        'urban': {
            'hero_tags': ['graffiti', 'streetwear', 'hip-hop', 'punk', 'edgy', 'bold', 'urban', 'street'],
            'body_tags': ['clean', 'readable', 'modern', 'neutral'],
            'avoid_tags': ['elegant', 'formal', 'delicate', 'ornate'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'web'],
        },
        'fantasy': {
            'hero_tags': ['medieval', 'gothic', 'blackletter', 'fantasy', 'victorian', 'decorative', 'ornate', 'mystical'],
            'body_tags': ['readable', 'clean', 'serif', 'classic'],
            'avoid_tags': ['modern', 'tech', 'futuristic', 'corporate'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'print'],
        },
        'western_style': {
            'hero_tags': ['western', 'distressed', 'slab-serif', 'vintage', 'rustic', 'rugged', 'americana'],
            'body_tags': ['readable', 'clean', 'classic', 'neutral'],
            'avoid_tags': ['futuristic', 'modern', 'tech', 'digital'],
            'best_for_hero': ['headlines', 'posters', 'logos'],
            'best_for_body': ['body_text', 'print'],
        },
    }

    def __init__(self):
        self._font_service = None
        self._available_fonts = None
        self._font_metadata = None

    @property
    def font_service(self):
        """Lazy load EnhancedFontService"""
        if self._font_service is None:
            from services.enhanced_font_service import EnhancedFontService
            self._font_service = EnhancedFontService()
        return self._font_service

    @property
    def available_fonts(self) -> List[str]:
        """Get list of available font names"""
        if self._available_fonts is None:
            try:
                available_ids = self.font_service.get_available_font_ids(include_remote=False)
                self._available_fonts = [
                    self.font_service.all_fonts[font_id].get('name', font_id)
                    for font_id in available_ids
                ]
            except Exception:
                self._available_fonts = []
        return self._available_fonts

    @property
    def font_metadata(self) -> Dict:
        """Get font metadata dictionary"""
        if self._font_metadata is None:
            self._font_metadata = self.font_service.font_metadata
        return self._font_metadata

    def select_fonts_for_brand(
        self,
        brand_name: str,
        brand_domain: Optional[str] = None,
        content_topic: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Select fonts that match a brand's personality using metadata search.
        Returns: {'hero': font_name, 'body': font_name, 'reasoning': explanation}
        """
        logger.info(f"[FontIntelligence] Selecting fonts for brand: {brand_name}")

        # Determine brand style
        brand_style = self._detect_brand_style(brand_name, brand_domain, content_topic)
        logger.info(f"[FontIntelligence] Detected brand style: {brand_style}")

        # Get style config
        style_config = self.BRAND_STYLE_TAGS.get(brand_style, self.BRAND_STYLE_TAGS['corporate'])

        # Find hero fonts by scoring against metadata
        hero_candidates = self._find_fonts_by_metadata(
            required_tags=style_config['hero_tags'],
            avoid_tags=style_config.get('avoid_tags', []),
            best_for=style_config.get('best_for_hero', ['headlines']),
            is_hero=True,
            limit=15
        )

        # Find body fonts
        body_candidates = self._find_fonts_by_metadata(
            required_tags=style_config['body_tags'],
            avoid_tags=style_config.get('avoid_tags', []),
            best_for=style_config.get('best_for_body', ['body_text']),
            is_hero=False,
            limit=15
        )

        # Pick from top candidates with some randomness for variety
        hero_font = self._pick_with_variety(hero_candidates, brand_name)
        body_font = self._pick_with_variety(body_candidates, brand_name + "_body", exclude=hero_font)

        # Ensure good pairing
        hero_font, body_font = self._ensure_good_pairing(hero_font, body_font)

        # Get metadata for reasoning
        hero_meta = self.font_metadata.get(hero_font.lower().replace(' ', '-'), {})
        body_meta = self.font_metadata.get(body_font.lower().replace(' ', '-'), {})

        hero_tags = hero_meta.get('tags', [])[:5]
        body_tags = body_meta.get('tags', [])[:5]

        reasoning = f"For {brand_style} brand: Selected {hero_font} ({', '.join(hero_tags)}) as hero, paired with {body_font} ({', '.join(body_tags)}) for readability."

        logger.info(f"[FontIntelligence] Selected: hero={hero_font}, body={body_font}")
        return {
            'hero': hero_font,
            'body': body_font,
            'reasoning': reasoning,
            'style': brand_style,
            'hero_tags': hero_tags,
            'body_tags': body_tags
        }

    def select_fonts_for_content(
        self,
        title: str,
        topic: Optional[str] = None,
        vibe: Optional[str] = None,
        audience: Optional[str] = None,
    ) -> Dict[str, str]:
        """
        Select fonts based on content/topic when no brand is specified.
        Uses metadata search for intelligent matching.
        """
        logger.info(f"[FontIntelligence] Selecting fonts for content: {title}")

        # Detect content style from title/topic
        content_style = self._detect_content_style(title, topic, vibe, audience)
        logger.info(f"[FontIntelligence] Detected content style: {content_style}")

        # Get style config
        style_config = self.BRAND_STYLE_TAGS.get(content_style, self.BRAND_STYLE_TAGS['corporate'])

        # Find fonts using metadata
        hero_candidates = self._find_fonts_by_metadata(
            required_tags=style_config['hero_tags'],
            avoid_tags=style_config.get('avoid_tags', []),
            best_for=style_config.get('best_for_hero', ['headlines', 'presentations']),
            is_hero=True,
            limit=15
        )

        body_candidates = self._find_fonts_by_metadata(
            required_tags=style_config['body_tags'],
            avoid_tags=style_config.get('avoid_tags', []),
            best_for=style_config.get('best_for_body', ['body_text', 'presentations']),
            is_hero=False,
            limit=15
        )

        # Seed variety based on title
        seed = title + (topic or '') + (vibe or '')
        hero_font = self._pick_with_variety(hero_candidates, seed)
        body_font = self._pick_with_variety(body_candidates, seed + "_body", exclude=hero_font)

        # Ensure good pairing
        hero_font, body_font = self._ensure_good_pairing(hero_font, body_font)

        reasoning = f"Selected for {content_style} content: {hero_font} (hero) + {body_font} (body)"

        logger.info(f"[FontIntelligence] Selected: hero={hero_font}, body={body_font}")
        return {
            'hero': hero_font,
            'body': body_font,
            'reasoning': reasoning,
            'style': content_style
        }

    def _find_fonts_by_metadata(
        self,
        required_tags: List[str],
        avoid_tags: List[str],
        best_for: List[str],
        is_hero: bool,
        limit: int = 15
    ) -> List[Tuple[str, float]]:
        """
        Find fonts by searching metadata tags and best_for fields.
        Returns list of (font_name, score) tuples sorted by score.
        """
        scored_fonts = []
        available_lower = {f.lower(): f for f in self.available_fonts}
        avoid_tags_lower = set(t.lower() for t in avoid_tags)
        required_tags_lower = set(t.lower() for t in required_tags)

        for font_id, metadata in self.font_metadata.items():
            # Check if font is available in our registry
            font_name = metadata.get('name', font_id.replace('-', ' ').title())
            font_name_lower = font_name.lower()

            # Try to find matching available font
            actual_font_name = None
            if font_name_lower in available_lower:
                actual_font_name = available_lower[font_name_lower]
            elif font_id in available_lower:
                actual_font_name = available_lower[font_id]
            else:
                # Try partial match
                for avail_lower, avail_name in available_lower.items():
                    if font_id in avail_lower or avail_lower in font_id:
                        actual_font_name = avail_name
                        break

            if not actual_font_name:
                continue

            # Skip excluded/problematic fonts
            if any(excluded in actual_font_name.lower() for excluded in self.EXCLUDED_FONTS):
                continue

            # Get font tags and best_for
            font_tags = set(t.lower() for t in metadata.get('tags', []))
            font_best_for = set(metadata.get('best_for', []))

            # Skip if has avoid tags
            if font_tags.intersection(avoid_tags_lower):
                continue

            # Body fonts: hard-block unreadable niche tags
            if not is_hero and font_tags.intersection(self.BODY_BLOCKED_TAGS):
                continue

            # Score calculation
            score = 0.0

            # Tag matches (primary scoring)
            for tag in required_tags:
                tag_lower = tag.lower()
                if tag_lower in font_tags:
                    score += 10
                # Partial match (e.g., "elegant" matches "elegant font")
                elif any(tag_lower in t for t in font_tags):
                    score += 5

            # Niche tag penalty — niche fonts only when content demands them
            font_niche_tags = font_tags.intersection(self.NICHE_TAGS)
            if font_niche_tags:
                unlocked = font_niche_tags.intersection(required_tags_lower)
                unmatched = len(font_niche_tags) - len(unlocked)
                if unmatched > 0:
                    score -= unmatched * 30

            # best_for matches
            for bf in best_for:
                if bf in font_best_for:
                    score += 8

            # Role-specific bonuses
            if is_hero:
                if 'headlines' in font_best_for or 'posters' in font_best_for:
                    score += 5
                if 'display' in font_tags or 'headline' in font_tags:
                    score += 5
            else:
                if 'body_text' in font_best_for:
                    score += 10  # Strong bonus for body text suitability
                if 'body-text' in font_tags or 'clean' in font_tags:
                    score += 5

            # Style characteristics bonus
            style_chars = metadata.get('style_characteristics', {})
            personality = style_chars.get('personality', [])
            for p in personality:
                p_lower = p.lower()
                if any(p_lower in t.lower() for t in required_tags):
                    score += 3

            # Weight appropriateness
            weight = style_chars.get('weight', '')
            if is_hero and weight in ['bold', 'black', 'heavy']:
                score += 3
            elif not is_hero and weight in ['regular', 'light', 'medium']:
                score += 3

            # Skip very low scores
            if score < 5:
                continue

            scored_fonts.append((actual_font_name, score))

        # Sort by score descending
        scored_fonts.sort(key=lambda x: x[1], reverse=True)

        # Log top candidates
        if scored_fonts:
            top_5 = [(f, s) for f, s in scored_fonts[:5]]
            logger.info(f"[FontIntelligence] Top candidates: {top_5}")

        return scored_fonts[:limit]

    def _pick_with_variety(
        self,
        candidates: List[Tuple[str, float]],
        seed: str,
        exclude: Optional[str] = None
    ) -> str:
        """Pick from top candidates with seeded randomness for variety"""
        if not candidates:
            return 'Poppins' if 'body' not in seed else 'Inter'

        # Filter out excluded font
        if exclude:
            candidates = [(f, s) for f, s in candidates if f.lower() != exclude.lower()]

        if not candidates:
            return 'Inter'

        # Use seed for deterministic variety among top candidates
        seed_hash = int(hashlib.md5(seed.encode()).hexdigest(), 16)

        # Pick from top 8 candidates for variety
        top_n = min(8, len(candidates))
        idx = seed_hash % top_n

        return candidates[idx][0]

    def _detect_brand_style(
        self,
        brand_name: str,
        brand_domain: Optional[str],
        content_topic: Optional[str]
    ) -> str:
        """Detect the brand style category"""
        combined = f"{brand_name} {brand_domain or ''} {content_topic or ''}".lower()

        style_keywords = {
            'university': ['university', 'college', 'school', 'academic', 'institute', 'faculty', 'campus'],
            'tech': ['tech', 'software', 'digital', 'saas', 'cloud', 'data', '.io', 'startup', 'crypto', 'blockchain'],
            'halloween': ['halloween', 'horror', 'spooky', 'haunted', 'scary', 'creepy', 'zombie', 'ghost', 'witch', 'vampire'],
            'urban': ['urban', 'graffiti', 'hip-hop', 'hip hop', 'streetwear', 'skate'],
            'fantasy': ['fantasy', 'medieval', 'dragon', 'wizard', 'mythical', 'enchanted'],
            'western_style': ['western', 'cowboy', 'ranch', 'rodeo', 'frontier', 'saloon', 'wild west'],
            'sports': ['sport', 'athletic', 'fitness', 'gym', 'league', 'football', 'basketball', 'soccer', 'running'],
            'luxury': ['luxury', 'premium', 'exclusive', 'haute', 'boutique', 'designer', 'high-end', 'elite'],
            'food': ['food', 'restaurant', 'cafe', 'coffee', 'bakery', 'kitchen', 'dining', 'culinary', 'bistro'],
            'kids': ['kids', 'children', 'toy', 'preschool', 'nursery', 'pediatric'],
            'creative': ['design', 'creative', 'artist', 'agency', 'photography', 'illustration'],
            'health': ['health', 'medical', 'wellness', 'clinic', 'pharma', 'hospital', 'therapy'],
            'retro': ['retro', 'vintage', '80s', '70s', '60s', 'throwback', 'nostalgia'],
            'gaming': ['gaming', 'esports', 'arcade', 'pixel', 'nintendo', 'playstation', 'xbox'],
            'music': ['music', 'concert', 'festival', 'band', 'record', 'audio'],
            'fashion': ['fashion', 'apparel', 'clothing', 'couture', 'vogue', 'runway'],
            'wedding': ['wedding', 'bridal', 'marriage', 'engagement', 'ceremony'],
        }

        for style, keywords in style_keywords.items():
            if any(kw in combined for kw in keywords):
                return style

        return 'corporate'

    def _detect_content_style(
        self,
        title: str,
        topic: Optional[str],
        vibe: Optional[str],
        audience: Optional[str]
    ) -> str:
        """Detect content style from title, topic, vibe, audience"""
        combined = f"{title} {topic or ''} {audience or ''}".lower()

        # Check vibe first if provided
        if vibe:
            vibe_lower = vibe.lower()
            vibe_map = {
                # Corporate / professional
                'professional': 'corporate', 'formal': 'corporate', 'business': 'corporate',
                'serious': 'corporate', 'corporate': 'corporate', 'trustworthy': 'corporate',
                # Tech / modern
                'modern': 'tech', 'minimal': 'tech', 'sleek': 'tech', 'futuristic': 'tech',
                'digital': 'tech', 'innovative': 'tech', 'technical': 'tech',
                # Creative
                'creative': 'creative', 'artistic': 'creative', 'fun': 'creative',
                'expressive': 'creative', 'colorful': 'creative', 'quirky': 'creative',
                # Luxury / elegant
                'elegant': 'luxury', 'luxury': 'luxury', 'premium': 'luxury',
                'sophisticated': 'luxury', 'refined': 'luxury', 'chic': 'luxury',
                # Sports / energetic
                'bold': 'sports', 'energetic': 'sports', 'dynamic': 'sports',
                'athletic': 'sports', 'powerful': 'sports', 'intense': 'sports',
                # Retro / vintage
                'retro': 'retro', 'vintage': 'retro', 'nostalgic': 'retro',
                'classic': 'retro', 'throwback': 'retro', 'groovy': 'retro',
                # Kids / playful
                'playful': 'kids', 'cute': 'kids', 'whimsical': 'kids',
                'cheerful': 'kids', 'friendly': 'kids',
                # Dark / horror / halloween
                'dark': 'halloween', 'spooky': 'halloween', 'horror': 'halloween',
                'scary': 'halloween', 'creepy': 'halloween', 'gothic': 'halloween',
                'macabre': 'halloween',
                # Urban / street
                'urban': 'urban', 'street': 'urban', 'graffiti': 'urban',
                'edgy': 'urban', 'raw': 'urban', 'gritty': 'urban',
                # Gaming
                'gaming': 'gaming', 'pixel': 'gaming', 'arcade': 'gaming',
                '8-bit': 'gaming', 'cyberpunk': 'gaming',
                # Fantasy / medieval
                'fantasy': 'fantasy', 'medieval': 'fantasy', 'mystical': 'fantasy',
                'magical': 'fantasy', 'enchanted': 'fantasy', 'mythical': 'fantasy',
                # Western
                'western': 'western_style', 'cowboy': 'western_style',
                'rustic': 'western_style', 'rugged': 'western_style',
                # Wedding / romantic
                'romantic': 'wedding', 'dreamy': 'wedding', 'love': 'wedding',
                # Music / concert
                'concert': 'music', 'festival': 'music', 'rock': 'music',
                'punk': 'music', 'musical': 'music',
                # Fashion
                'fashion': 'fashion', 'stylish': 'fashion', 'trendy': 'fashion',
                # Food
                'warm': 'food', 'cozy': 'food', 'organic': 'food',
                'appetizing': 'food', 'homemade': 'food',
                # Health
                'calming': 'health', 'wellness': 'health', 'zen': 'health',
                'peaceful': 'health',
            }
            for v, style in vibe_map.items():
                if v in vibe_lower:
                    return style

        # Fall back to keyword detection
        return self._detect_brand_style(title, None, topic)

    def _ensure_good_pairing(self, hero: str, body: str) -> Tuple[str, str]:
        """Ensure the font pair works well together typographically"""
        # Same font is never a good pair
        if hero.lower() == body.lower():
            body = self._get_safe_body_font(hero)

        # Get categories
        hero_cat = self._get_font_category(hero)
        body_cat = self._get_font_category(body)

        # Check pairing rules
        good_body_cats = self.PAIRING_RULES.get(hero_cat, ['sans', 'serif'])

        if body_cat not in good_body_cats:
            logger.info(f"[FontIntelligence] Poor pairing: {hero} ({hero_cat}) + {body} ({body_cat})")
            # Find better body font
            body_candidates = self._find_fonts_by_metadata(
                required_tags=['readable', 'clean'],
                avoid_tags=[],
                best_for=['body_text'],
                is_hero=False,
                limit=10
            )
            if body_candidates:
                body = self._pick_with_variety(body_candidates, hero + "_repairing", exclude=hero)
                logger.info(f"[FontIntelligence] Replaced body with: {body}")

        return hero, body

    def _get_safe_body_font(self, exclude: str) -> str:
        """Get a safe body font that's different from the excluded one"""
        safe_body_fonts = ['Inter', 'Lato', 'Work Sans', 'Nunito', 'Open Sans', 'Poppins']
        for font in safe_body_fonts:
            if font.lower() != exclude.lower():
                return font
        return 'Inter'

    def _get_font_category(self, font_name: str) -> str:
        """Get the category of a font from metadata"""
        font_id = font_name.lower().replace(' ', '-')

        # Check font service data
        font_data = self.font_service.all_fonts.get(font_id, {})
        category = font_data.get('category', '')
        if category:
            return category

        # Check metadata
        metadata = self.font_metadata.get(font_id, {})
        tags = set(t.lower() for t in metadata.get('tags', []))

        # Infer from tags
        if 'serif' in tags and 'sans' not in tags:
            if 'display' in tags or 'editorial' in tags:
                return 'editorial-serif'
            return 'serif'
        elif 'script' in tags or 'handwritten' in tags:
            return 'script'
        elif 'mono' in tags or 'monospace' in tags:
            return 'mono'
        elif 'display' in tags:
            return 'display'
        elif 'playful' in tags or 'fun' in tags:
            return 'playful'

        # Fallback to name-based guessing
        return self.font_service._guess_category_from_name(font_name)


# Singleton instance
_font_intelligence = None


def get_font_intelligence() -> FontIntelligence:
    """Get or create FontIntelligence singleton"""
    global _font_intelligence
    if _font_intelligence is None:
        _font_intelligence = FontIntelligence()
    return _font_intelligence


async def select_fonts_for_brand(
    brand_name: str,
    brand_domain: Optional[str] = None,
    content_topic: Optional[str] = None
) -> Dict[str, str]:
    """
    Convenience function for selecting fonts for a brand.
    Returns: {'hero': font_name, 'body': font_name, 'reasoning': str}
    """
    fi = get_font_intelligence()
    return fi.select_fonts_for_brand(brand_name, brand_domain, content_topic)


async def select_fonts_for_content(
    title: str,
    topic: Optional[str] = None,
    vibe: Optional[str] = None,
    audience: Optional[str] = None
) -> Dict[str, str]:
    """
    Convenience function for selecting fonts for content.
    Returns: {'hero': font_name, 'body': font_name, 'reasoning': str}
    """
    fi = get_font_intelligence()
    return fi.select_fonts_for_content(title, topic, vibe, audience)
