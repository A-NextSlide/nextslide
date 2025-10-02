"""
Service for searching and retrieving color palettes from the database.
Provides semantic search capabilities and palette recommendations based on context.
"""

from typing import List, Dict, Any, Optional, Tuple
import os
from dotenv import load_dotenv
from openai import OpenAI
from utils.supabase import get_supabase_client
import random

# Load environment variables
load_dotenv()

# Import model from config
from agents.config import OPENAI_EMBEDDINGS_MODEL

class PaletteService:
    """Service for working with color palettes"""
    
    def __init__(self):
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.supabase_client = get_supabase_client()
        self.embeddings_model = OPENAI_EMBEDDINGS_MODEL
    
    async def search_palettes(
        self, 
        query: str, 
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """
        Search for palettes using semantic search.
        
        Args:
            query: Search query describing the desired palette
            category: Optional category filter (e.g., 'presentation_corporate')
            tags: Optional list of tags to filter by
            limit: Maximum number of results
            
        Returns:
            List of matching palettes
        """
        
        # Generate embedding for the query
        try:
            response = self.openai_client.embeddings.create(
                model=self.embeddings_model,
                input=query
            )
            embedding = response.data[0].embedding
            
            # Convert to PostgreSQL vector format
            embedding_str = '[' + ','.join(map(str, embedding)) + ']'
            
            # Use RPC function for vector similarity search
            rpc_params = {
                'query_embedding': embedding_str,
                'match_threshold': 0.3,  # Lowered threshold for better results
                'match_count': limit
            }
            
            if category:
                rpc_params['category_filter'] = category
            
            # Skip tags filter for now since it's causing issues
            # if tags:
            #     rpc_params['tags_filter'] = tags
            
            response = self.supabase_client.rpc(
                'search_palettes_by_embedding',
                rpc_params
            ).execute()
            
            if response.data:
                # Enforce exactly 4-color palettes from embedding results
                four_color = [p for p in response.data if len((p or {}).get('colors', [])) == 4]
                return four_color[:limit]
            
        except Exception as e:
            print(f"Error searching palettes with embeddings: {str(e)}")
        
        # Fallback to basic search if embedding search fails
        return await self._fallback_search(query, category, tags, limit)
    
    async def _fallback_search(
        self,
        query: str,
        category: Optional[str] = None,
        tags: Optional[List[str]] = None,
        limit: int = 10
    ) -> List[Dict[str, Any]]:
        """Fallback search using text matching"""
        
        query_builder = self.supabase_client.table('palettes').select('*')
        
        # Apply filters
        if category:
            query_builder = query_builder.eq('category', category)
        
        # For now, skip tag filtering since it's causing issues
        # if tags:
        #     # Search for any of the tags
        #     query_builder = query_builder.contains('tags', tags)
        
        # Text search in name and description
        if query:
            # Split query into words for better matching
            query_words = query.lower().split()
            
            # Search for any word in name or description
            search_conditions = []
            for word in query_words[:3]:  # Limit to first 3 words
                search_conditions.extend([
                    f"name.ilike.%{word}%",
                    f"description.ilike.%{word}%"
                ])
            
            if search_conditions:
                query_builder = query_builder.or_(','.join(search_conditions))
        
        try:
            response = query_builder.limit(limit * 3).execute()
            
            # If no results with text search, just get some palettes from the category
            if not response.data and category:
                response = self.supabase_client.table('palettes').select('*').eq('category', category).limit(limit * 3).execute()
            
            # If still no results, get random palettes
            if not response.data:
                response = self.supabase_client.table('palettes').select('*').limit(limit * 3).execute()
            
            # Enforce exactly 4-color palettes
            data = response.data or []
            four_color = [p for p in data if len((p or {}).get('colors', [])) == 4]
            return four_color[:limit]
        except Exception as e:
            print(f"Error in fallback search: {str(e)}")
            # Last resort: just get some palettes
            try:
                response = self.supabase_client.table('palettes').select('*').limit(limit).execute()
                return response.data
            except:
                return []
    
    async def get_palette_for_slide(
        self,
        slide_content: str,
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None
    ) -> Optional[Dict[str, Any]]:
        """
        Get a recommended palette for a specific slide.
        
        Args:
            slide_content: The content of the slide
            slide_type: Type of slide (title, content, data, etc.)
            style_preferences: User's style preferences
            
        Returns:
            Recommended palette or None
        """
        
        # Build search query based on slide characteristics
        query_parts = []
        
        # Add slide type context
        if slide_type == 'title':
            query_parts.extend(['bold', 'impactful', 'professional'])
        elif slide_type == 'data':
            query_parts.extend(['data visualization', 'clear', 'distinguishable'])
        elif slide_type == 'closing':
            query_parts.extend(['elegant', 'memorable', 'sophisticated'])
        
        # Add style preferences
        if style_preferences:
            if style_preferences.get('vibeContext'):
                query_parts.append(style_preferences['vibeContext'])
            
            # Check for specific color preferences
            if style_preferences.get('colors'):
                colors = style_preferences['colors']
                if colors.get('type') == 'predefined' and colors.get('name'):
                    query_parts.append(colors['name'])
        
        # Create search query
        search_query = ' '.join(query_parts)
        
        # Determine category based on content
        category = None
        if 'presentation' in slide_content.lower():
            category = 'presentation_corporate' if 'corporate' in search_query else 'presentation_creative'
        
        # Search for palettes
        palettes = await self.search_palettes(
            query=search_query,
            category=category,
            limit=5
        )
        
        # Return the best match or a random one from top results
        if palettes:
            return random.choice(palettes[:3])  # Choose from top 3 for variety
        
        return None
    
    async def get_palette_by_id(self, palette_id: str) -> Optional[Dict[str, Any]]:
        """Get a specific palette by ID"""
        
        response = self.supabase_client.table('palettes').select('*').eq('id', palette_id).execute()
        
        if response.data:
            return response.data[0]
        
        return None
    
    async def get_random_palette(self, category: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """Get a random palette, optionally filtered by category"""
        
        query = self.supabase_client.table('palettes').select('*')
        
        if category:
            query = query.eq('category', category)
        
        # Get a random sample
        response = query.limit(50).execute()
        
        if response.data:
            return random.choice(response.data)
        
        return None
    
    def apply_palette_to_slide(
        self,
        slide_components: List[Dict[str, Any]],
        palette: Dict[str, Any]
    ) -> List[Dict[str, Any]]:
        """
        Apply a color palette to slide components.
        
        Args:
            slide_components: List of slide components
            palette: Color palette to apply
            
        Returns:
            Updated components with palette colors
        """
        
        colors = palette['colors']
        
        # Define color assignments based on common patterns
        # Typically: background, primary text, secondary text, accent
        if len(colors) >= 4:
            bg_color = colors[0]
            primary_text = colors[1]
            secondary_text = colors[2]
            accent_color = colors[3]
        else:
            # Handle smaller palettes
            bg_color = colors[0] if len(colors) > 0 else '#FFFFFF'
            primary_text = colors[1] if len(colors) > 1 else '#000000'
            secondary_text = primary_text
            accent_color = colors[2] if len(colors) > 2 else primary_text
        
        # Apply colors to components
        for component in slide_components:
            comp_type = component.get('type')
            props = component.get('props', {})
            
            if comp_type == 'Background':
                props['fill'] = bg_color
            
            elif comp_type in ['Title', 'Heading']:
                props['color'] = primary_text
            
            elif comp_type in ['TextBlock', 'TiptapTextBlock']:
                props['color'] = secondary_text
            
            elif comp_type == 'Shape':
                # Functional-only: containers/dividers (no decorative fills)
                shape_type = props.get('shapeType', 'rectangle')
                if shape_type in ['rectangle']:
                    # Only apply when used as a text container (detect by presence of borderRadius or explicit flag)
                    if props.get('asContainer', True):
                        props['fill'] = f"{accent_color}20" if not str(accent_color).endswith('20') else accent_color
                        props['opacity'] = min(float(props.get('opacity', 0.15)), 0.2)
                elif shape_type in ['line']:
                    props['stroke'] = accent_color
            
            elif comp_type == 'Lines':
                props['stroke'] = accent_color
            
            component['props'] = props
        
        return slide_components
    
    def get_contrast_matrix_for_design(self, design_type: str) -> Dict[str, Any]:
        """
        Get a predefined contrast matrix for a specific design type.
        Useful for generating new palettes with Huemint.
        """
        
        matrices = {
            'high_contrast': {
                'num_colors': 2,
                'adjacency': ["0", "90", "90", "0"]
            },
            'presentation': {
                'num_colors': 4,
                'adjacency': ["0", "85", "45", "35", "85", "0", "35", "65", "45", "35", "0", "35", "35", "65", "35", "0"]
            },
            'gradient': {
                'num_colors': 4,
                'adjacency': ["0", "25", "50", "75", "25", "0", "25", "50", "50", "25", "0", "25", "75", "50", "25", "0"]
            },
            'data_viz': {
                'num_colors': 6,
                'adjacency': ["0", "80", "75", "70", "65", "60", "80", "0", "75", "70", "65", "60", "75", "75", "0", "70", "65", "60", "70", "70", "70", "0", "65", "60", "65", "65", "65", "65", "0", "60", "60", "60", "60", "60", "60", "0"]
            }
        }
        
        return matrices.get(design_type, matrices['presentation'])


# SQL function to create in Supabase for vector search
SEARCH_PALETTES_SQL = """
CREATE OR REPLACE FUNCTION search_palettes_by_embedding(
    query_embedding vector(1536),
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10,
    category_filter text DEFAULT NULL,
    tags_filter text[] DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    name text,
    colors text[],
    description text,
    tags text[],
    category text,
    context text,
    score float,
    temperature float,
    mode text,
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
        p.score,
        p.temperature,
        p.mode,
        1 - (p.embedding <=> query_embedding) as similarity
    FROM palettes p
    WHERE 
        (category_filter IS NULL OR p.category = category_filter)
        AND (tags_filter IS NULL OR p.tags && tags_filter)
        AND 1 - (p.embedding <=> query_embedding) > match_threshold
    ORDER BY p.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;
""" 