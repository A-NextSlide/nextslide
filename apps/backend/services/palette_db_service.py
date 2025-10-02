"""
Service for searching and retrieving color palettes from the database using embeddings.
"""

import os
import json
from typing import List, Dict, Any, Optional
from openai import OpenAI
from utils.supabase import get_supabase_client
from agents.config import OPENAI_EMBEDDINGS_MODEL
from setup_logging_optimized import get_logger
import numpy as np
import random

logger = get_logger(__name__)


class PaletteDBService:
    """Service for searching color palettes in the database using embeddings."""
    
    def __init__(self):
        self.supabase = get_supabase_client()
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.embeddings_model = OPENAI_EMBEDDINGS_MODEL
        # Track recently selected palettes per topic for better variety
        self._recent_selections = {}
        
    def generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for search query."""
        try:
            response = self.openai_client.embeddings.create(
                model=self.embeddings_model,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            logger.error(f"Error generating embedding: {e}")
            return None
    
    def search_palettes(
        self, 
        query: str, 
        limit: int = 5,
        category: Optional[str] = None,
        min_colors: int = 3,
        max_colors: int = 7
    ) -> List[Dict[str, Any]]:
        """
        Search for palettes using semantic search with embeddings.
        
        Args:
            query: Search query (deck title, topic, theme)
            limit: Number of results to return
            category: Optional category filter
            min_colors: Minimum number of colors in palette
            max_colors: Maximum number of colors in palette
            
        Returns:
            List of matching palettes sorted by relevance
        """
        try:
            # Generate embedding for the query
            embedding = self.generate_embedding(query)
            if not embedding:
                logger.warning(f"Failed to generate embedding for query: {query}")
                return self._fallback_search(query, limit, category)
            
            # Convert embedding to PostgreSQL vector format
            embedding_str = '[' + ','.join(map(str, embedding)) + ']'
            
            # Call the vector similarity search function
            logger.info(f"[VECTOR SEARCH] Searching for palettes using embeddings for: {query}")
            
            try:
                # Use RPC to call the match_palettes function
                results = self.supabase.rpc(
                    'match_palettes',
                    {
                        'query_embedding': embedding_str,
                        'match_threshold': 0.1,  # Lower threshold for more results
                        'match_count': limit * 2  # Get more results for filtering
                    }
                ).execute()
                
                if not results.data:
                    logger.info(f"No semantic matches found, trying text search for: {query}")
                    return self._fallback_search(query, limit, category)
                
                logger.info(f"[VECTOR SEARCH] Found {len(results.data)} semantic matches")
            except Exception as rpc_error:
                logger.error(f"Error calling match_palettes RPC: {rpc_error}")
                return self._fallback_search(query, limit, category)
            
            # Filter by color count and category if specified
            filtered_palettes = []
            for palette in results.data:
                colors = palette.get('colors', [])
                if min_colors <= len(colors) <= max_colors:
                    if category is None or palette.get('category') == category:
                        filtered_palettes.append(palette)
            
            # Optional: filter out grey-heavy palettes with very low saturation across colors
            def _hex_to_hsl(hex_color: str):
                try:
                    h = hex_color.lstrip('#')
                    r = int(h[0:2], 16) / 255.0
                    g = int(h[2:4], 16) / 255.0
                    b = int(h[4:6], 16) / 255.0
                    mx = max(r, g, b); mn = min(r, g, b)
                    l = (mx + mn) / 2.0
                    if mx == mn:
                        return (0.0, 0.0, l)
                    d = mx - mn
                    s = d / (2.0 - mx - mn) if l > 0.5 else d / (mx + mn)
                    if mx == r:
                        h_deg = (g - b) / d + (6 if g < b else 0)
                    elif mx == g:
                        h_deg = (b - r) / d + 2
                    else:
                        h_deg = (r - g) / d + 4
                    return (h_deg * 60.0 % 360.0, s, l)
                except Exception:
                    return (0.0, 0.0, 0.5)

            def _palette_saturation_score(p: Dict[str, Any]) -> float:
                cols = p.get('colors') or []
                if not cols:
                    return 0.0
                sats = []
                for c in cols:
                    if not isinstance(c, str) or not c.startswith('#') or len(c) < 7:
                        continue
                    _h, s, _l = _hex_to_hsl(c)
                    sats.append(s)
                return float(np.mean(sats)) if sats else 0.0

            try:
                # Keep palettes with reasonable colorfulness; allow fallback if all are neutral
                colorful = [p for p in filtered_palettes if _palette_saturation_score(p) >= 0.18]
                if colorful:
                    filtered_palettes = colorful
            except Exception:
                # If numpy missing or any error, skip this extra filter
                pass

            # Sort by similarity score and take top results
            filtered_palettes.sort(key=lambda x: x.get('similarity', 0), reverse=True)
            
            logger.info(f"Found {len(filtered_palettes[:limit])} matching palettes for query: {query}")
            # Normalize optional fields to safe strings for callers/tests that slice strings
            out: List[Dict[str, Any]] = []
            for p in filtered_palettes[:limit]:
                try:
                    if p.get('description') is None:
                        p['description'] = ''
                    if p.get('context') is None:
                        p['context'] = ''
                except Exception:
                    pass
                out.append(p)
            return out
            
        except Exception as e:
            logger.error(f"Error in semantic palette search: {e}")
            # Fall back to text search
            return self._fallback_search(query, limit, category)
    
    def _fallback_search(
        self, 
        query: str, 
        limit: int = 5,
        category: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """
        Fallback text-based search when semantic search fails.
        """
        try:
            # Build query with text search
            query_builder = self.supabase.table('palettes').select('*')
            
            # Add category filter if specified
            if category:
                query_builder = query_builder.eq('category', category)
            
            # Search in name, description, and tags using text search
            # This uses PostgreSQL's text search capabilities
            search_terms = query.lower().split()
            
            # Search for any of the terms in multiple fields
            # Look for the most important term first
            important_terms = []
            
            # Prioritize known topic keywords
            topic_keywords = {
                'photosynthesis': ['photosynthesis', 'plant', 'chlorophyll', 'forest'],
                'ocean': ['ocean', 'marine', 'sea', 'water', 'coral'],
                'tesla': ['tesla', 'electric', 'vehicle', 'ev'],
                'climate': ['climate', 'sustainability', 'environment'],
                'ai': ['artificial', 'intelligence', 'ai', 'machine'],
                'space': ['space', 'astronomy', 'galaxy', 'cosmos']
            }
            
            # Check if any known topics are in the query
            query_lower = query.lower()
            for topic, keywords in topic_keywords.items():
                if any(kw in query_lower for kw in keywords):
                    important_terms.extend(keywords[:2])  # Add top keywords
                    break
            
            # Add other search terms
            important_terms.extend(search_terms[:2])
            
            # Build search with important terms
            if important_terms:
                # Search in name, tags array, and description
                for term in important_terms[:2]:  # Use top 2 terms
                    # Use ilike for text fields and contains for array fields
                    query_builder = query_builder.or_(
                        f"name.ilike.%{term}%,"
                        f"description.ilike.%{term}%,"
                        f"context.ilike.%{term}%"
                    )
                    
                    # Also search in tags array if the term matches known keywords
                    if term in ['photosynthesis', 'ocean', 'marine', 'tesla', 'climate', 'space']:
                        # For important keywords, filter by tags
                        query_builder = query_builder.contains('tags', [term])
            
            # Execute query with limit
            results = query_builder.limit(limit * 3).execute()
            
            data = results.data or []
            # Enforce exactly 4-color palettes
            filtered = [p for p in data if len((p or {}).get('colors', [])) == 4]
            if filtered:
                logger.info(f"Fallback search found {len(filtered)} 4-color palettes")
                # Normalize optional fields for safety
                out: List[Dict[str, Any]] = []
                for p in filtered[:limit]:
                    try:
                        if p.get('description') is None:
                            p['description'] = ''
                        if p.get('context') is None:
                            p['context'] = ''
                    except Exception:
                        pass
                    out.append(p)
                return out
            else:
                logger.warning(f"No palettes found in fallback search for: {query}")
                return []
                
        except Exception as e:
            logger.error(f"Error in fallback palette search: {e}")
            return []
    
    def get_palette_by_id(self, palette_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific palette by ID."""
        try:
            result = self.supabase.table('palettes').select('*').eq('id', palette_id).single().execute()
            return result.data
        except Exception as e:
            logger.error(f"Error fetching palette by ID {palette_id}: {e}")
            return None
    
    def get_palettes_by_category(
        self, 
        category: str, 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Get palettes by category."""
        try:
            results = self.supabase.table('palettes').select('*').eq('category', category).limit(limit).execute()
            return results.data or []
        except Exception as e:
            logger.error(f"Error fetching palettes by category {category}: {e}")
            return []
    
    def search_by_tags(
        self, 
        tags: List[str], 
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Search palettes by tags."""
        try:
            # PostgreSQL array contains operator
            query = self.supabase.table('palettes').select('*')
            
            # Search for palettes that contain any of the specified tags
            for tag in tags:
                query = query.contains('tags', [tag])
            
            results = query.limit(limit).execute()
            return results.data or []
        except Exception as e:
            logger.error(f"Error searching palettes by tags {tags}: {e}")
            return []
    
    def search_palette_by_keywords(self, keywords: List[str], limit: int = 1) -> Optional[Dict[str, Any]]:
        """
        Search for palette by specific keywords.
        
        Args:
            keywords: List of keywords to search for
            limit: Number of results
            
        Returns:
            Best matching palette or None
        """
        if not keywords:
            return None
        
        # Join keywords into search query
        query = ' '.join(keywords)
        logger.info(f"[PALETTE DB] Searching for palette with keywords: {query}")
        
        # Search for palettes
        results = self.search_palettes(query, limit=limit)
        
        if results:
            logger.info(f"[PALETTE DB] Found palette for keywords '{query}': {results[0].get('name')}")
            return results[0]
        
        return None
    
    def get_palette_for_topic(
        self,
        topic: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        randomize: bool = True
    ) -> Optional[Dict[str, Any]]:
        """
        Get the best palette for a given topic/theme.
        This is the main method to use for deck generation.
        
        Args:
            topic: The topic/title of the deck
            style_preferences: Optional style preferences from user
            randomize: If True, randomly select from top matches for variety
            
        Returns:
            Best matching palette or None
        """
        try:
            # Build enhanced query with context
            query_parts = [topic]
            
            # Add style preferences to query
            if style_preferences:
                if 'vibeContext' in style_preferences:
                    query_parts.append(style_preferences['vibeContext'])
                if 'visualStyle' in style_preferences:
                    query_parts.append(style_preferences['visualStyle'])
                if 'colorMood' in style_preferences:
                    query_parts.append(style_preferences['colorMood'])
            
            # Determine category based on context
            category = None
            if any(word in topic.lower() for word in ['presentation', 'slides', 'deck', 'pitch']):
                category = 'presentation'
            elif any(word in topic.lower() for word in ['website', 'web', 'site', 'landing']):
                category = 'website'
            elif any(word in topic.lower() for word in ['brand', 'logo', 'identity']):
                category = 'brand'
            
            query_parts = [part for part in query_parts if isinstance(part, str) and part]
            # Create comprehensive search query (no warm bias)
            search_query = ' '.join(query_parts)
            logger.info(f"[PALETTE DB] Searching for palette with query: {search_query}")
            
            # Search for more palettes to have variety
            palettes = self.search_palettes(
                query=search_query,
                limit=10 if randomize else 3,  # Get more options when randomizing
                category=category,
                min_colors=4,  # Enforce exactly 4 colors
                max_colors=4
            )
            
            if palettes:
                # Helper: brightness and near-white detection
                def _estimate_brightness(hex_color: str) -> float:
                    try:
                        h = hex_color.lstrip('#')
                        r = int(h[0:2], 16) / 255.0
                        g = int(h[2:4], 16) / 255.0
                        b = int(h[4:6], 16) / 255.0
                        return (0.299 * r + 0.587 * g + 0.114 * b)
                    except Exception:
                        return 0.5

                def _is_near_white(hex_color: str) -> bool:
                    try:
                        if not isinstance(hex_color, str):
                            return False
                        s = hex_color.strip().lower()
                        if s in ['#fff', '#ffffff', '#fefefe', '#fdfdfd']:
                            return True
                        return _estimate_brightness(hex_color) > 0.98  # More lenient threshold
                    except Exception:
                        return False

                # Prefer palettes whose light background isn't pure white
                def _lightest_color(colors: List[str]) -> Optional[str]:
                    try:
                        return sorted(colors or [], key=lambda c: _estimate_brightness(c), reverse=True)[0]
                    except Exception:
                        return None

                non_white_candidates = []
                for p in palettes:
                    colors = p.get('colors') or []
                    lightest = _lightest_color(colors)
                    if lightest is not None and not _is_near_white(lightest):
                        non_white_candidates.append(p)

                candidate_list = non_white_candidates if non_white_candidates else palettes

                # Contrast-aware palette scoring (WCAG-based)
                def _hex_to_rgb(hex_color: str) -> tuple:
                    h = hex_color.lstrip('#')
                    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

                def _channel_to_linear(c: float) -> float:
                    c = c / 255.0
                    return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

                def _relative_luminance(hex_color: str) -> float:
                    try:
                        r, g, b = _hex_to_rgb(hex_color)
                        R = _channel_to_linear(r)
                        G = _channel_to_linear(g)
                        B = _channel_to_linear(b)
                        return 0.2126 * R + 0.7152 * G + 0.0722 * B
                    except Exception:
                        return 0.5

                def _contrast_ratio(c1: str, c2: str) -> float:
                    L1 = _relative_luminance(c1)
                    L2 = _relative_luminance(c2)
                    lighter = max(L1, L2)
                    darker = min(L1, L2)
                    return (lighter + 0.05) / (darker + 0.05)

                def _best_contrast_score(colors: List[str]) -> float:
                    if not colors:
                        return 0.0
                    candidates = list(colors) + ['#000000', '#FFFFFF']
                    best = 0.0
                    for bg in colors:
                        for tx in candidates:
                            if tx == bg:
                                continue
                            best = max(best, _contrast_ratio(bg, tx))
                    return best

                # Additional neutral/grey filter: prefer palettes with some saturation
                def _hex_to_hsl(hex_color: str):
                    try:
                        h = hex_color.lstrip('#')
                        r = int(h[0:2], 16) / 255.0
                        g = int(h[2:4], 16) / 255.0
                        b = int(h[4:6], 16) / 255.0
                        mx = max(r, g, b); mn = min(r, g, b)
                        l = (mx + mn) / 2.0
                        if mx == mn:
                            return (0.0, 0.0, l)
                        d = mx - mn
                        s = d / (2.0 - mx - mn) if l > 0.5 else d / (mx + mn)
                        if mx == r:
                            h_deg = (g - b) / d + (6 if g < b else 0)
                        elif mx == g:
                            h_deg = (b - r) / d + 2
                        else:
                            h_deg = (r - g) / d + 4
                        return (h_deg * 60.0 % 360.0, s, l)
                    except Exception:
                        return (0.0, 0.0, 0.5)

                def _palette_saturation_score(p: Dict[str, Any]) -> float:
                    cols = p.get('colors') or []
                    if not cols:
                        return 0.0
                    sats = []
                    for c in cols:
                        if not isinstance(c, str) or not c.startswith('#') or len(c) < 7:
                            continue
                        _h, s, _l = _hex_to_hsl(c)
                        sats.append(s)
                    return float(np.mean(sats)) if sats else 0.0

                try:
                    colorful_candidates = [p for p in candidate_list if _palette_saturation_score(p) >= 0.18]
                    if colorful_candidates:
                        candidate_list = colorful_candidates
                except Exception:
                    pass

                if randomize and len(candidate_list) > 1:
                    import random
                    import time
                    
                    # Use time-based seed for better variety across requests
                    random.seed(int(time.time() * 1000) % 100000)
                    
                    # Track recent selections for this topic to avoid immediate repeats
                    topic_key = topic.lower()[:50]  # Limit key length
                    recent_ids = self._recent_selections.get(topic_key, [])
                    
                    # Filter out recently selected palettes if we have enough alternatives
                    filtered_candidates = [p for p in candidate_list if p.get('id') not in recent_ids]
                    if len(filtered_candidates) < 3 and len(recent_ids) > 0:
                        # Reset recent selections if we're running out of variety
                        recent_ids.clear()
                        self._recent_selections[topic_key] = recent_ids
                        filtered_candidates = candidate_list
                    
                    # Take top candidates but shuffle for variety  
                    top_candidates = filtered_candidates[:min(10, len(filtered_candidates))]
                    
                    weights = []
                    for p in top_candidates:
                        colors = p.get('colors') or []
                        w = _best_contrast_score(colors)
                        # Penalize if lightest color is near-white (to avoid white-only backgrounds by default)
                        lightest = _lightest_color(colors)
                        near_white_penalty = 0.5 if (lightest is not None and _is_near_white(lightest)) else 0.0
                        weights.append(max(0.001, w * (1.0 - near_white_penalty)))
                    
                    selected_palette = random.choices(top_candidates, weights=weights, k=1)[0]
                    
                    # Track this selection (maintain order with list)
                    recent_ids.append(selected_palette.get('id'))
                    if len(recent_ids) > 3:  # Keep only last 3 selections
                        recent_ids.pop(0)  # Remove oldest
                    self._recent_selections[topic_key] = recent_ids
                    
                    logger.info(f"[PALETTE DB] Randomly selected palette: {selected_palette.get('name')} from {len(palettes)} options")
                    return selected_palette
                else:
                    # Pick palette with highest achievable contrast between bg/text
                    best = max(candidate_list, key=lambda p: _best_contrast_score(p.get('colors') or []))
                    logger.info(f"[PALETTE DB] Found palette: {best.get('name')} with {len(best.get('colors', []))} colors")
                    return best
            else:
                logger.warning(f"[PALETTE DB] No palette found for topic: {topic}")
                return None
                
        except Exception as e:
            logger.error(f"Error getting palette for topic {topic}: {e}")
            return None


    def get_palette_candidates_for_topic(
        self,
        topic: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        max_candidates: int = 5
    ) -> List[Dict[str, Any]]:
        """
        Return a shortlist of palette candidates for a given topic (ranked and filtered).

        This mirrors the search, filtering, and warmth bias logic used in get_palette_for_topic,
        but returns multiple candidate palettes for variety/selection UIs.

        Args:
            topic: The topic/title of the deck
            style_preferences: Optional style preferences from user
            max_candidates: Maximum number of candidate palettes to return

        Returns:
            List of candidate palette dicts (each including at least name, colors, tags, category)
        """
        try:
            # Build enhanced query with context
            query_parts: List[str] = [topic]
            if style_preferences:
                if 'vibeContext' in style_preferences:
                    query_parts.append(style_preferences['vibeContext'])
                if 'visualStyle' in style_preferences:
                    query_parts.append(style_preferences['visualStyle'])
                if 'colorMood' in style_preferences:
                    query_parts.append(style_preferences['colorMood'])

            # Determine category based on context
            category = None
            if any(word in topic.lower() for word in ['presentation', 'slides', 'deck', 'pitch']):
                category = 'presentation'
            elif any(word in topic.lower() for word in ['website', 'web', 'site', 'landing']):
                category = 'website'
            elif any(word in topic.lower() for word in ['brand', 'logo', 'identity']):
                category = 'brand'

            query_parts = [part for part in query_parts if isinstance(part, str) and part]
            search_query = ' '.join(query_parts)

            # Fetch a generous set to filter/score from
            palettes = self.search_palettes(
                query=search_query,
                limit=max(20, max_candidates * 4),
                category=category,
                min_colors=4,
                max_colors=4
            )

            if not palettes:
                palettes = []

            # If too few results, augment via tag search and random sampling
            if len(palettes) < max_candidates:
                try:
                    # Nature/plant related tags for photosynthesis-like topics
                    nature_tags = ['nature', 'green', 'forest', 'plant', 'leaf', 'eco', 'organic', 'botanical']
                    tag_results = self.search_by_tags(nature_tags, limit=max_candidates * 3) or []
                    palettes.extend(tag_results)
                except Exception:
                    pass
                # Random supplementation from DB
                try:
                    random_pool = self.get_random_palettes(count=max_candidates * 6, category=category) or []
                    palettes.extend(random_pool)
                except Exception:
                    pass

            # De-duplicate palettes (by id if present, else by name+colors signature)
            seen: set = set()
            deduped: List[Dict[str, Any]] = []
            for p in palettes:
                raw_colors = p.get('colors') or []
                safe_colors = [c for c in raw_colors if isinstance(c, str) and c]
                if len(safe_colors) != len(raw_colors):
                    # Preserve structure but drop invalid entries so downstream math is safe
                    p = dict(p)
                    p['colors'] = safe_colors
                pid = p.get('id') or f"{p.get('name','')}-{'|'.join(map(str, safe_colors))}"
                if pid in seen:
                    continue
                seen.add(pid)
                deduped.append(p)
            palettes = deduped

            # Ensure all palettes have clean color lists for downstream processing
            cleaned_palettes: List[Dict[str, Any]] = []
            for p in palettes:
                original_colors = p.get('colors') or []
                colors_list = [c for c in original_colors if isinstance(c, str) and c]
                if len(colors_list) != len(original_colors):
                    p = dict(p)
                    p['colors'] = colors_list
                cleaned_palettes.append(p)
            palettes = cleaned_palettes

            # Helpers copied from get_palette_for_topic
            def _estimate_brightness(hex_color: str) -> float:
                try:
                    h = hex_color.lstrip('#')
                    r = int(h[0:2], 16) / 255.0
                    g = int(h[2:4], 16) / 255.0
                    b = int(h[4:6], 16) / 255.0
                    return (0.299 * r + 0.587 * g + 0.114 * b)
                except Exception:
                    return 0.5

            def _is_near_white(hex_color: str) -> bool:
                try:
                    if not isinstance(hex_color, str):
                        return False
                    s = hex_color.strip().lower()
                    if s in ['#fff', '#ffffff']:
                        return True
                    return _estimate_brightness(hex_color) > 0.97
                except Exception:
                    return False

            def _lightest_color(colors: List[str]) -> Optional[str]:
                try:
                    return sorted(colors or [], key=lambda c: _estimate_brightness(c), reverse=True)[0]
                except Exception:
                    return None

            def _hex_to_hsl(hex_color: str):
                try:
                    h = hex_color.lstrip('#')
                    r = int(h[0:2], 16) / 255.0
                    g = int(h[2:4], 16) / 255.0
                    b = int(h[4:6], 16) / 255.0
                    max_c = max(r, g, b)
                    min_c = min(r, g, b)
                    l = (max_c + min_c) / 2.0
                    if max_c == min_c:
                        return (0.0, 0.0, l)
                    d = max_c - min_c
                    s = d / (2.0 - max_c - min_c) if l > 0.5 else d / (max_c + min_c)
                    if max_c == r:
                        h_deg = (g - b) / d + (6 if g < b else 0)
                    elif max_c == g:
                        h_deg = (b - r) / d + 2
                    else:
                        h_deg = (r - g) / d + 4
                    h_deg *= 60.0
                    return (h_deg % 360.0, s, l)
                except Exception:
                    return (0.0, 0.0, 0.5)

            def _warmth_from_colors(colors: List[str]) -> float:
                if not colors:
                    return 0.0
                score = 0.0
                for c in colors:
                    if not isinstance(c, str) or not c.startswith('#') or len(c) < 7:
                        continue
                    h, s, _ = _hex_to_hsl(c)
                    contrib = 0.0
                    if 0 <= h < 60:
                        contrib = 1.0
                    elif 60 <= h < 90:
                        contrib = 0.4
                    elif 320 <= h < 360:
                        contrib = 0.8
                    score += contrib * max(0.25, min(1.0, s))
                return min(1.0, score / max(1, len(colors)))

            # Avoid pink palettes completely (user constraint)
            def _is_pinkish(hex_color: str) -> bool:
                try:
                    h, s, _l = _hex_to_hsl(hex_color)
                    return (s >= 0.25) and (300 <= h <= 355)
                except Exception:
                    return False

            def _palette_is_pinkish(p: Dict[str, Any]) -> bool:
                cols = p.get('colors') or []
                # Consider pinkish if any strong pink present
                return any(_is_pinkish(c) for c in cols if isinstance(c, str))

            def _warmth_from_tags(tags: List[str]) -> float:
                if not tags:
                    return 0.0
                tl = [t.lower() for t in tags if isinstance(t, str)]
                bonus = 0.0
                if any(t in tl for t in ['warm']):
                    bonus += 0.6
                for kw in ['sunset', 'sunrise', 'gold', 'golden', 'amber', 'orange', 'red', 'coral', 'peach']:
                    if any(kw in t for t in tl):
                        bonus += 0.15
                return min(1.0, bonus)

            def _warmth_score(p: Dict[str, Any]) -> float:
                colors = p.get('colors') or []
                tags = p.get('tags') or []
                return min(1.0, 0.7 * _warmth_from_colors(colors) + 0.3 * _warmth_from_tags(tags))

            # Filter out palettes: avoid near-white-only backgrounds and avoid pinkish palettes
            non_white_candidates = []
            for p in palettes:
                colors = p.get('colors') or []
                lightest = _lightest_color(colors)
                if lightest is not None and not _is_near_white(lightest):
                    if not _palette_is_pinkish(p):
                        non_white_candidates.append(p)

            candidate_list = non_white_candidates if non_white_candidates else palettes
            # Also apply pink filter to fallback list if non_white_candidates was empty
            if candidate_list is palettes:
                candidate_list = [p for p in candidate_list if not _palette_is_pinkish(p)] or palettes
            # Keep top-N by similarity (already sorted), re-rank by contrast within top slice
            top_slice = candidate_list[: max(20, max_candidates * 3)]

            # Contrast helpers
            def _hex_to_rgb(hex_color: str) -> tuple:
                h = hex_color.lstrip('#')
                return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))

            def _channel_to_linear(c: float) -> float:
                c = c / 255.0
                return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4

            def _relative_luminance(hex_color: str) -> float:
                try:
                    r, g, b = _hex_to_rgb(hex_color)
                    R = _channel_to_linear(r)
                    G = _channel_to_linear(g)
                    B = _channel_to_linear(b)
                    return 0.2126 * R + 0.7152 * G + 0.0722 * B
                except Exception:
                    return 0.5

            def _contrast_ratio(c1: str, c2: str) -> float:
                L1 = _relative_luminance(c1)
                L2 = _relative_luminance(c2)
                lighter = max(L1, L2)
                darker = min(L1, L2)
                return (lighter + 0.05) / (darker + 0.05)

            def _best_contrast_score(colors: List[str]) -> float:
                if not colors:
                    return 0.0
                candidates = list(colors) + ['#000000', '#FFFFFF']
                best = 0.0
                for bg in colors:
                    for tx in candidates:
                        if tx == bg:
                            continue
                        best = max(best, _contrast_ratio(bg, tx))
                return best

            ranked = sorted(top_slice, key=lambda p: _best_contrast_score(p.get('colors') or []), reverse=True)

            # Return the top candidates
            return ranked[:max_candidates]

        except Exception as e:
            logger.error(f"Error getting palette candidates for topic {topic}: {e}")
            return []

    def get_random_palettes(
        self,
        count: int = 10,
        category: Optional[str] = None,
        include_tags: Optional[List[str]] = None,
        exclude_tags: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:
        """
        Get a random selection of palettes from the database, optionally filtered by category/tags.
        """
        try:
            q = self.supabase.table('palettes').select('*')
            if category:
                q = q.eq('category', category)
            # Include tags (any match)
            if include_tags:
                for tag in include_tags:
                    try:
                        q = q.contains('tags', [tag])
                    except Exception:
                        pass
            res = q.limit(max(200, count * 10)).execute()
            data = res.data or []
            # Exclude tags if requested
            if exclude_tags:
                excl = [t.lower() for t in exclude_tags]
                def _has_excl(p: Dict[str, Any]) -> bool:
                    try:
                        tags = [t.lower() for t in (p.get('tags') or []) if isinstance(t, str)]
                        return any(t in tags for t in excl)
                    except Exception:
                        return False
                data = [p for p in data if not _has_excl(p)]
            # Random sample
            import random as _rand
            if len(data) <= count:
                return data
            return _rand.sample(data, count)
        except Exception as e:
            logger.error(f"Error getting random palettes: {e}")
            return []

# Create SQL function for vector similarity search (run this in Supabase SQL editor)
SETUP_SQL = """
-- Create function for palette similarity search using pgvector
CREATE OR REPLACE FUNCTION match_palettes(
    query_embedding vector(1536),
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    name text,
    colors text[],
    description text,
    tags text[],
    category text,
    context text,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        p.id,
        p.name,
        p.colors,
        p.description,
        p.tags,
        p.category,
        p.context,
        1 - (p.embedding <=> query_embedding) as similarity
    FROM palettes p
    WHERE 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Create index for faster similarity search if not exists
CREATE INDEX IF NOT EXISTS palettes_embedding_idx ON palettes 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
"""
