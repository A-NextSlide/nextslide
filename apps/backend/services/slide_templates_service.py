from typing import List, Dict, Any, Optional, Tuple
import os
import json
import numpy as np
from dataclasses import dataclass
from openai import OpenAI
from supabase import Client
from utils.supabase import get_supabase_client
import logging
from collections import Counter, defaultdict
from dotenv import load_dotenv

from services.openai_service import OpenAIService
from agents.config import OPENAI_EMBEDDINGS_MODEL

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

@dataclass
class SlideTemplate:
    """Represents a slide template with its metadata and design properties"""
    uuid: str
    name: str
    slides: List[Dict[str, Any]]  # Full slide data
    description: Optional[str]
    content: Optional[Dict[str, Any]]
    auto_tags: List[str]
    custom_tags: List[str]
    size: Optional[Dict[str, int]]
    image_url: Optional[str]
    design_description: Optional[str]
    visual_analysis: Optional[Dict[str, Any]]
    embedding: Optional[str] = None  # Text representation of vector
    design_embedding: Optional[str] = None  # Text representation of design vector
    created_at: Optional[str] = None
    lastmodified: Optional[str] = None

class SlideTemplatesService:
    """Service for searching and analyzing slide templates"""
    
    def __init__(
        self,
        template_path: str = "services/prompts/Templates.JSON",
        system_prompt_path: str = "services/prompts/System_Prompt_Template_Transformation.txt",
    ):
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.supabase_client = get_supabase_client()
        self.embeddings_model = OPENAI_EMBEDDINGS_MODEL
        
    async def search_templates(self, query: str, slide_type: str = None, limit: int = 10, use_design: bool = False) -> List[SlideTemplate]:
        """
        Search for slide templates using embeddings
        
        Args:
            query: Search query (could be slide content, title, or description)
            slide_type: Optional filter for slide type/category (will search in tags)
            limit: Maximum number of results
            use_design: Whether to search using design embeddings instead of content embeddings
            
        Returns:
            List of matching slide templates
        """
        print(f"\n[SlideTemplatesService] Starting template search")
        print(f"  Query: {query[:100]}...")
        print(f"  Slide Type Filter: {slide_type}")
        print(f"  Using Design Embeddings: {use_design}")
        print(f"  Limit: {limit}")
        
        try:
            # Generate embedding for the query
            print(f"\n[SlideTemplatesService] Generating embedding for query...")
            query_embedding = await self._generate_embedding(query)
            print(f"  Embedding generated (dimension: {len(query_embedding)})")
            
            
            # Use the RPC function for vector similarity search
            print(f"\n[SlideTemplatesService] Calling Supabase RPC function...")
            
            try:
                response = self.supabase_client.rpc(
                    'search_slide_templates_by_embedding',
                    {
                        'query_embedding': query_embedding,
                        'embedding_column': 'design_embedding' if use_design else 'embedding',
                        'match_threshold': 0.1,
                        'match_count': limit,
                        'tag_filter': slide_type  # This will search in auto_tags/custom_tags
                    }
                ).execute()
                
                print(f"  RPC response received: {len(response.data)} results")
                
                # Convert response to SlideTemplate objects
                templates = []
                for row in response.data:
                    template = self._row_to_template(row)
                    templates.append(template)
                    print(f"  - Template: {template.name} (similarity: {row.get('similarity', 'N/A')})")
                    
                return templates
                
            except Exception as rpc_error:
                # Log the specific RPC error
                print(f"\n[SlideTemplatesService] RPC function error: {str(rpc_error)}")
                
                # If it's a function not found error, provide helpful message
                if "42883" in str(rpc_error) or "function" in str(rpc_error).lower():
                    print(f"  The search function doesn't exist in the database.")
                    print(f"  Please create it using the SQL provided in the documentation.")
                
                # Fall back to text search
                return await self._fallback_search(query, slide_type, limit)
            
        except Exception as e:
            error_str = str(e)
            print(f"\n[SlideTemplatesService] Error searching templates: {error_str}")
            return await self._fallback_search(query, slide_type, limit)
    
    def _embedding_to_pgvector(self, embedding: List[float]) -> str:
        """Convert embedding list to PostgreSQL vector string format"""
        return '[' + ','.join(map(str, embedding)) + ']'
    
    def _row_to_template(self, row: Dict[str, Any]) -> SlideTemplate:
        """Convert database row to SlideTemplate object"""
        # Convert UUID to string if necessary
        uuid_value = row['uuid']
        if hasattr(uuid_value, 'hex'):
            # It's a UUID object, convert to string
            uuid_value = str(uuid_value)
            
        return SlideTemplate(
            uuid=uuid_value,
            name=row['name'],
            slides=row['slides'],
            description=row.get('description'),
            content=row.get('content'),
            auto_tags=row.get('auto_tags', []),
            custom_tags=row.get('custom_tags', []),
            size=row.get('size'),
            image_url=row.get('image_url'),
            design_description=row.get('design_description'),
            visual_analysis=row.get('visual_analysis'),
            embedding=row.get('embedding'),
            design_embedding=row.get('design_embedding'),
            created_at=row.get('created_at'),
            lastmodified=row.get('lastmodified')
        )
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        response = self.openai_client.embeddings.create(
            model=self.embeddings_model,
            input=text
        )
        return response.data[0].embedding
    
    async def _fallback_search(self, query: str, slide_type: str = None, limit: int = 10) -> List[SlideTemplate]:
        """Fallback search using text matching and filters"""
        print(f"\n[SlideTemplatesService] Using fallback text search")
        
        try:
            if slide_type:
                print(f"  Searching for templates with tag: {slide_type}")
                
                # For JSONB tags, use proper query syntax
                response = self.supabase_client.table('slide_templates').select('*').filter(
                    'auto_tags', 'cs', f'["{slide_type}"]'
                ).limit(limit).execute()
                
                # If no results, try custom_tags
                if not response.data:
                    response = self.supabase_client.table('slide_templates').select('*').filter(
                        'custom_tags', 'cs', f'["{slide_type}"]'
                    ).limit(limit).execute()
                
                # If still no results, try text search in name/description
                if not response.data:
                    response = self.supabase_client.table('slide_templates').select('*').or_(
                        f"name.ilike.%{slide_type}%,description.ilike.%{slide_type}%"
                    ).limit(limit).execute()
            else:
                # No slide type specified, just get some templates
                print(f"  Getting any available templates...")
                response = self.supabase_client.table('slide_templates').select('*').limit(limit).execute()
            
            print(f"  Found {len(response.data)} templates")
            
            templates = []
            for row in response.data:
                template = self._row_to_template(row)
                templates.append(template)
                print(f"  - Template: {template.name}")
            
            return templates
            
        except Exception as e:
            print(f"\n[SlideTemplatesService] Error in fallback search: {str(e)}")
            return []
    
    def analyze_templates(self, templates: List[SlideTemplate]) -> Tuple[str, str]:
        """
        Analyze a collection of templates to extract common layout and style patterns
        
        Returns:
            Tuple of (layout_guidelines, style_guidelines)
        """
        layout_patterns = {
            'common_layouts': [],
            'spacing_patterns': {},
            'alignment_patterns': {},
            'component_arrangements': [],
            'grid_usage': {}
        }
        
        style_patterns = {
            'typography': {
                'title_sizes': [],
                'body_sizes': [],
                'heading_sizes': [],
                'font_families': [],
                'font_weights': []
            },
            'colors': {
                'backgrounds': [],
                'text_colors': [],
                'accent_colors': []
            },
            'spacing': {
                'margins': [],
                'paddings': [],
                'component_gaps': []
            },
            'visual_hierarchy': []
        }
        
        # Analyze each template's slides
        for template in templates:
            for slide in template.slides:
                self._analyze_slide_layout(slide, layout_patterns, template)
                self._analyze_slide_style(slide, style_patterns, template)
        
        # Use visual analysis data if available
        for template in templates:
            if template.visual_analysis:
                self._incorporate_visual_analysis(template.visual_analysis, style_patterns)
        
        # Generate guidelines from patterns
        layout_guidelines = self._generate_layout_guidelines(layout_patterns, templates)
        style_guidelines = self._generate_style_guidelines(style_patterns, templates)
        
        return layout_guidelines, style_guidelines
    
    def _analyze_slide_layout(self, slide: Dict[str, Any], patterns: Dict[str, Any], template: SlideTemplate):
        """Extract layout patterns from a slide"""
        components = slide.get('components', [])
        
        # Analyze component positions and arrangements
        positions = []
        for comp in components:
            if 'props' in comp and 'position' in comp['props']:
                positions.append({
                    'type': comp['type'],
                    'x': comp['props']['position']['x'],
                    'y': comp['props']['position']['y'],
                    'width': comp['props'].get('width', 0),
                    'height': comp['props'].get('height', 0)
                })
        
        # Detect layout patterns
        if positions:
            layout_type = self._detect_layout_type(positions)
            patterns['common_layouts'].append({
                'type': layout_type,
                'template_name': template.name,
                'slide_title': slide.get('title', 'Untitled')
            })
    
    def _analyze_slide_style(self, slide: Dict[str, Any], patterns: Dict[str, Any], template: SlideTemplate):
        """Extract style patterns from a slide"""
        components = slide.get('components', [])
        
        # Analyze text components for typography
        for comp in components:
            if comp['type'] in ['TextBlock', 'Title', 'Heading']:
                props = comp.get('props', {})
                
                # Extract font sizes
                if 'fontSize' in props:
                    if comp['type'] == 'Title':
                        patterns['typography']['title_sizes'].append(props['fontSize'])
                    elif comp['type'] == 'Heading':
                        patterns['typography']['heading_sizes'].append(props['fontSize'])
                    else:
                        patterns['typography']['body_sizes'].append(props['fontSize'])
                
                # Extract font properties
                if 'fontFamily' in props:
                    patterns['typography']['font_families'].append(props['fontFamily'])
                if 'fontWeight' in props:
                    patterns['typography']['font_weights'].append(props['fontWeight'])
                
                # Extract colors
                if 'color' in props:
                    patterns['colors']['text_colors'].append(props['color'])
        
        # Extract background colors from shapes
        for comp in components:
            if comp['type'] == 'Shape' and comp.get('props', {}).get('fill'):
                patterns['colors']['backgrounds'].append(comp['props']['fill'])
    
    def _incorporate_visual_analysis(self, visual_analysis: Dict[str, Any], patterns: Dict[str, Any]):
        """Incorporate visual analysis data into style patterns"""
        if 'colors' in visual_analysis:
            if 'dominant' in visual_analysis['colors']:
                patterns['colors']['accent_colors'].extend(visual_analysis['colors']['dominant'])
        
        if 'typography' in visual_analysis:
            if 'detected_fonts' in visual_analysis['typography']:
                patterns['typography']['font_families'].extend(visual_analysis['typography']['detected_fonts'])
    
    def _detect_layout_type(self, positions: List[Dict[str, Any]]) -> str:
        """Detect the type of layout based on component positions"""
        if not positions:
            return "empty"
        
        # Simple heuristics for layout detection
        x_positions = [p['x'] for p in positions]
        y_positions = [p['y'] for p in positions]
        
        # Check if components are centered
        canvas_center_x = 960  # 1920/2
        if all(abs(x - canvas_center_x) < 100 for x in x_positions):
            return "centered"
        
        # Check for two-column layout
        left_components = sum(1 for x in x_positions if x < canvas_center_x - 200)
        right_components = sum(1 for x in x_positions if x > canvas_center_x + 200)
        if left_components > 0 and right_components > 0:
            return "two-column"
        
        # Check for grid layout
        unique_x = len(set(round(x, -1) for x in x_positions))  # Round to nearest 10
        unique_y = len(set(round(y, -1) for y in y_positions))
        if unique_x > 2 and unique_y > 2:
            return "grid"
        
        return "custom"
    
    def _generate_layout_guidelines(self, patterns: Dict[str, Any], templates: List[SlideTemplate]) -> str:
        """Generate layout guidelines from analyzed patterns"""
        guidelines = []
        
        # Add template references
        guidelines.append("REFERENCE TEMPLATES:")
        for template in templates[:3]:
            guidelines.append(f"  - {template.name}: {template.description or 'No description'}")
            if template.image_url:
                guidelines.append(f"    Preview: {template.image_url}")
        
        # Analyze most common layouts
        if patterns['common_layouts']:
            layout_types = {}
            for layout_info in patterns['common_layouts']:
                layout_type = layout_info['type']
                layout_types[layout_type] = layout_types.get(layout_type, 0) + 1
            
            most_common = sorted(layout_types.items(), key=lambda x: x[1], reverse=True)
            guidelines.append(f"\nCOMMON LAYOUTS: {', '.join([f'{layout} ({count} slides)' for layout, count in most_common[:3]])}")
        
        # Add design descriptions if available
        guidelines.append("\nDESIGN INSIGHTS:")
        for template in templates[:2]:
            if template.design_description:
                guidelines.append(f"  - {template.name}: {template.design_description}")
        
        # Add dynamic guidelines based on template analysis
        guidelines.append("\nLAYOUT PRINCIPLES:")
        guidelines.append("  - Follow the composition patterns from reference templates")
        guidelines.append("  - Maintain visual balance as demonstrated in examples")
        guidelines.append("  - Use consistent spacing and alignment from templates")
        
        return "\n".join(guidelines)
    
    def _generate_style_guidelines(self, patterns: Dict[str, Any], templates: List[SlideTemplate]) -> str:
        """Generate style guidelines from analyzed patterns"""
        guidelines = []
        
        # Typography guidelines
        guidelines.append("TYPOGRAPHY:")
        if patterns['typography']['title_sizes']:
            avg_title_size = sum(patterns['typography']['title_sizes']) / len(patterns['typography']['title_sizes'])
            guidelines.append(f"  - Title size: {avg_title_size:.0f}pt (range: {min(patterns['typography']['title_sizes'])}-{max(patterns['typography']['title_sizes'])}pt)")
        
        if patterns['typography']['body_sizes']:
            avg_body_size = sum(patterns['typography']['body_sizes']) / len(patterns['typography']['body_sizes'])
            guidelines.append(f"  - Body text: {avg_body_size:.0f}pt (range: {min(patterns['typography']['body_sizes'])}-{max(patterns['typography']['body_sizes'])}pt)")
        
        if patterns['typography']['font_families']:
            # Get most common fonts
            font_counts = {}
            for font in patterns['typography']['font_families']:
                font_counts[font] = font_counts.get(font, 0) + 1
            common_fonts = sorted(font_counts.items(), key=lambda x: x[1], reverse=True)[:3]
            guidelines.append(f"  - Common fonts: {', '.join([f[0] for f in common_fonts])}")
        
        # Color guidelines
        guidelines.append("\nCOLORS:")
        if patterns['colors']['text_colors']:
            # Get unique colors
            unique_text_colors = list(set(patterns['colors']['text_colors']))[:5]
            guidelines.append(f"  - Text colors from templates: {', '.join(unique_text_colors)}")
        
        if patterns['colors']['backgrounds']:
            unique_bg_colors = list(set(patterns['colors']['backgrounds']))[:5]
            guidelines.append(f"  - Background colors: {', '.join(unique_bg_colors)}")
        
        # Add visual analysis insights
        guidelines.append("\nVISUAL STYLE NOTES:")
        for template in templates[:2]:
            if template.visual_analysis and 'style' in template.visual_analysis:
                guidelines.append(f"  - {template.name}: {template.visual_analysis['style']}")
        
        return "\n".join(guidelines)
    
    def extract_design_props(self, templates: List[SlideTemplate]) -> Dict[str, Any]:
        """
        Extract detailed design properties from templates to emulate
        
        Returns:
            Dictionary of design properties organized by component type
        """
        design_props = {
            'TextBlock': {
                'fontSizes': [],
                'fontFamilies': [],
                'colors': [],
                'lineHeights': [],
                'letterSpacings': [],
                'fontWeights': [],
                'textAligns': []
            },
            'Title': {
                'fontSizes': [],
                'fontFamilies': [],
                'colors': [],
                'fontWeights': []
            },
            'Shape': {
                'fills': [],
                'opacities': [],
                'borderRadius': [],
                'strokes': [],
                'strokeWidths': [],
                'common_sizes': []  # (width, height) tuples
            },
            'Lines': {
                'strokes': [],
                'strokeWidths': [],
                'patterns': []  # line patterns/styles
            },
            'Image': {
                'common_sizes': [],
                'borderRadius': [],
                'objectFits': []
            },
            'positioning': {
                'margins': [],  # distances from edges
                'spacings': [],  # distances between elements
                'alignments': []  # common x/y positions
            }
        }
        
        # Extract properties from each template
        for template in templates:
            for slide in template.slides:
                components = slide.get('components', [])
                
                # Calculate positioning patterns
                positions = []
                for comp in components:
                    if 'props' in comp and 'position' in comp['props']:
                        pos = comp['props']['position']
                        positions.append((pos['x'], pos['y']))
                
                # Extract margins (distance from edges)
                for x, y in positions:
                    left_margin = x
                    right_margin = 1920 - x  # assuming component width
                    top_margin = y
                    bottom_margin = 1080 - y  # assuming component height
                    
                    if left_margin < 200:
                        design_props['positioning']['margins'].append(('left', left_margin))
                    if right_margin < 200:
                        design_props['positioning']['margins'].append(('right', right_margin))
                    if top_margin < 200:
                        design_props['positioning']['margins'].append(('top', top_margin))
                    if bottom_margin < 200:
                        design_props['positioning']['margins'].append(('bottom', bottom_margin))
                
                # Extract component-specific properties
                for comp in components:
                    comp_type = comp.get('type')
                    props = comp.get('props', {})
                    
                    if comp_type == 'TextBlock' and comp_type in design_props:
                        if 'fontSize' in props:
                            design_props['TextBlock']['fontSizes'].append(props['fontSize'])
                        if 'fontFamily' in props:
                            design_props['TextBlock']['fontFamilies'].append(props['fontFamily'])
                        if 'color' in props:
                            design_props['TextBlock']['colors'].append(props['color'])
                        if 'lineHeight' in props:
                            design_props['TextBlock']['lineHeights'].append(props['lineHeight'])
                        if 'letterSpacing' in props:
                            design_props['TextBlock']['letterSpacings'].append(props['letterSpacing'])
                        if 'fontWeight' in props:
                            design_props['TextBlock']['fontWeights'].append(props['fontWeight'])
                        if 'textAlign' in props:
                            design_props['TextBlock']['textAligns'].append(props['textAlign'])
                    
                    elif comp_type == 'Title' and comp_type in design_props:
                        if 'fontSize' in props:
                            design_props['Title']['fontSizes'].append(props['fontSize'])
                        if 'fontFamily' in props:
                            design_props['Title']['fontFamilies'].append(props['fontFamily'])
                        if 'color' in props:
                            design_props['Title']['colors'].append(props['color'])
                        if 'fontWeight' in props:
                            design_props['Title']['fontWeights'].append(props['fontWeight'])
                    
                    elif comp_type == 'Shape' and comp_type in design_props:
                        if 'fill' in props:
                            design_props['Shape']['fills'].append(props['fill'])
                        if 'opacity' in props:
                            design_props['Shape']['opacities'].append(props['opacity'])
                        if 'borderRadius' in props:
                            design_props['Shape']['borderRadius'].append(props['borderRadius'])
                        if 'stroke' in props:
                            design_props['Shape']['strokes'].append(props['stroke'])
                        if 'strokeWidth' in props:
                            design_props['Shape']['strokeWidths'].append(props['strokeWidth'])
                        if 'width' in props and 'height' in props:
                            design_props['Shape']['common_sizes'].append((props['width'], props['height']))
                    
                    elif comp_type == 'Lines' and comp_type in design_props:
                        if 'stroke' in props:
                            design_props['Lines']['strokes'].append(props['stroke'])
                        if 'strokeWidth' in props:
                            design_props['Lines']['strokeWidths'].append(props['strokeWidth'])
        
        # Process and deduplicate the collected properties
        processed_props = {}
        for comp_type, props_dict in design_props.items():
            processed_props[comp_type] = {}
            for prop_name, values in props_dict.items():
                if values:
                    if prop_name in ['common_sizes']:
                        # Keep unique size tuples
                        processed_props[comp_type][prop_name] = list(set(values))
                    elif prop_name in ['margins', 'spacings', 'alignments']:
                        # Keep positioning patterns
                        processed_props[comp_type][prop_name] = values
                    else:
                        # For other properties, get unique values and their frequency
                        value_counts = Counter(values)
                        # Sort by frequency, keep top values
                        processed_props[comp_type][prop_name] = [
                            value for value, count in value_counts.most_common(5)
                        ]
        
        return processed_props 