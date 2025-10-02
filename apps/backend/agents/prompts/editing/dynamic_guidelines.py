from typing import List, Dict, Any, Tuple
from services.slide_templates_service import SlideTemplatesService, SlideTemplate

class DynamicGuidelinesGenerator:
    """Generates dynamic layout and style guidelines based on template analysis"""
    
    def __init__(self):
        self.templates_service = SlideTemplatesService()
        self.last_analyzed_templates = []  # Store templates for universal design extraction
    
    async def generate_guidelines_for_slide(
        self, 
        slide_content: str, 
        slide_type: str = None,
        style_preferences: Dict[str, Any] = None,
        use_design_search: bool = False
    ) -> Tuple[str, str, List[SlideTemplate]]:
        """
        Generate dynamic guidelines for a specific slide
        
        Args:
            slide_content: The content/context of the slide
            slide_type: Optional slide type (e.g., "title", "content", "comparison")
            style_preferences: Optional style preferences from the user
            use_design_search: Whether to search using design embeddings
            
        Returns:
            Tuple of (layout_guidelines, style_guidelines, templates_used)
        """
        print(f"\n{'='*80}")
        print(f"SEARCHING TEMPLATES FOR SLIDE")
        print(f"{'='*80}")
        print(f"Slide Content: {slide_content[:200]}...")
        print(f"Slide Type: {slide_type}")
        print(f"Using Design Search: {use_design_search}")
        
        # Create a search query that matches how embeddings were created in the database
        # If embeddings were created from tags + design + description, we need to extract similar info
        search_query = self._create_search_query(slide_content, slide_type)
        print(f"Search Query: {search_query}")
        
        # Search for relevant templates
        templates = await self.templates_service.search_templates(
            query=search_query,
            slide_type=slide_type,
            limit=5,  # Get top 5 most relevant templates
            use_design=use_design_search
        )
        
        print(f"\nFOUND {len(templates)} TEMPLATES:")
        for i, template in enumerate(templates, 1):
            print(f"\n--- Template {i} ---")
            print(f"UUID: {template.uuid}")
            print(f"Name: {template.name}")
            print(f"Description: {template.description}")
            print(f"Tags: {template.auto_tags + template.custom_tags}")
            print(f"Number of slides: {len(template.slides)}")
            print(f"Image URL: {template.image_url}")
            print(f"Design Description: {template.design_description[:200] if template.design_description else 'None'}...")
            
            # Show component breakdown
            component_count = {}
            for slide in template.slides:
                for comp in slide.get('components', []):
                    comp_type = comp.get('type', 'Unknown')
                    component_count[comp_type] = component_count.get(comp_type, 0) + 1
            print(f"Component Types: {component_count}")
        
        if not templates:
            print("\nNO TEMPLATES FOUND - Using default guidelines")
            # Fallback to default guidelines if no templates found
            from agents.prompts.editing.layout_guidelines import layout_guidelines
            from agents.prompts.editing.style_guidelines import style_guidelines
            return layout_guidelines, style_guidelines, []
        
        # Analyze templates to extract patterns
        print(f"\nANALYZING TEMPLATES...")
        layout_patterns, style_patterns = self.templates_service.analyze_templates(templates)
        
        # Extract specific design properties to emulate
        design_props = self.templates_service.extract_design_props(templates)
        
        # Log extracted properties
        print(f"\nEXTRACTED DESIGN PROPERTIES:")
        for comp_type, props in design_props.items():
            if props:
                print(f"\n{comp_type}:")
                for prop_name, values in props.items():
                    if values:
                        if isinstance(values[0], tuple):
                            # For tuples like sizes
                            print(f"  - {prop_name}: {values[:3]}")
                        else:
                            print(f"  - {prop_name}: {values[:5]}")
        
        # Generate enhanced guidelines with template context
        layout_guidelines = self._enhance_layout_guidelines(
            layout_patterns, 
            templates, 
            slide_type,
            style_preferences,
            design_props
        )
        
        style_guidelines = self._enhance_style_guidelines(
            style_patterns,
            templates,
            style_preferences,
            design_props
        )
        
        print(f"\nGENERATED GUIDELINES BASED ON TEMPLATES")
        print(f"{'='*80}\n")
        
        return layout_guidelines, style_guidelines, templates
    
    def _enhance_layout_guidelines(
        self, 
        base_guidelines: str, 
        templates: List[SlideTemplate],
        slide_type: str = None,
        style_preferences: Dict[str, Any] = None,
        design_props: Dict[str, Any] = None
    ) -> str:
        """Enhance layout guidelines with template-specific insights"""
        enhanced = [base_guidelines, "\n\nTEMPLATE-BASED RECOMMENDATIONS:"]
        
        # Add template-specific layout insights
        for i, template in enumerate(templates[:3], 1):
            enhanced.append(f"\nTemplate {i} ({template.name}):")
            
            # Analyze all slides in the template
            total_components = 0
            component_types = {}
            
            for slide in template.slides:
                components = slide.get('components', [])
                total_components += len(components)
                
                for comp in components:
                    comp_type = comp.get('type', 'Unknown')
                    component_types[comp_type] = component_types.get(comp_type, 0) + 1
            
            enhanced.append(f"  - Total slides: {len(template.slides)}")
            enhanced.append(f"  - Average components per slide: {total_components / len(template.slides):.1f}")
            enhanced.append(f"  - Component types: {', '.join([f'{count} {type_}' for type_, count in component_types.items()])}")
            
            # Add tags info
            all_tags = template.auto_tags + template.custom_tags
            if all_tags:
                enhanced.append(f"  - Tags: {', '.join(all_tags[:5])}")
            
            # Add design description if available
            if template.design_description:
                enhanced.append(f"  - Design: {template.design_description[:100]}...")
        
        # Add image references if available
        enhanced.append("\nVISUAL REFERENCES:")
        for template in templates[:3]:
            if template.image_url:
                enhanced.append(f"  - {template.name}: {template.image_url}")
        
        # Add component creation emphasis
        enhanced.append("\nCOMPONENT CREATION GUIDELINES:")
        enhanced.append("  - CREATE AS MANY COMPONENTS AS NEEDED to properly display all content")
        enhanced.append("  - Don't compress detailed content into few components")
        enhanced.append("  - Use the template's component count as a minimum guideline")
        enhanced.append("  - For detailed slides, exceed the template's component count if necessary")
        enhanced.append("  - Split long text into multiple TextBlocks for better readability")
        enhanced.append("  - Add visual elements (shapes, lines) between text sections")
        
        # Add visual markup guidelines
        enhanced.append("\nVISUAL MARKUP REQUIREMENTS:")
        enhanced.append("  - USE SHAPES SPARINGLY: Only for emphasis on key data points")
        enhanced.append("  - MINIMAL LINES: Thin dividers only when necessary (2-4px)")
        enhanced.append("  - HIGHLIGHT SELECTIVELY: Small accent shapes behind important numbers only")
        enhanced.append("  - CLEAN AESTHETIC: Focus on content, not decoration")
        enhanced.append("  - SUBTLE GRADIENTS ALLOWED: Very low opacity (5-15%) for professional depth")
        enhanced.append("  - DYNAMIC GRADIENT OFF: Always set dynamicGradient: false")
        enhanced.append("  - SUBTLE ACCENTS: If used, keep opacity low (0.1-0.2)")
        enhanced.append("  - DATA FOCUS: Let charts and content be the visual interest")
        
        # Add custom graphics guidance
        enhanced.append("\nDATA VISUALIZATION APPROACH:")
        enhanced.append("  - PREFER CHART COMPONENT: Use the built-in Chart for data visualization")
        enhanced.append("  - SIMPLE IS BETTER: Avoid complex custom shape arrangements")
        enhanced.append("  - IF CUSTOM NEEDED: Keep it minimal and professional")
        enhanced.append("  - NO DECORATIVE SHAPES: Focus on data clarity")
        enhanced.append("  - CLEAN PRESENTATION: Let the data speak for itself")
        enhanced.append("  - WHITESPACE IS GOOD: Don't fill every space")
        enhanced.append("  - PROFESSIONAL LOOK: Corporate-ready aesthetics")
        
        # Add specific shape recommendations based on templates
        if templates:
            shape_counts = {}
            line_counts = 0
            for template in templates[:3]:
                for slide in template.slides:
                    for comp in slide.get('components', []):
                        if comp.get('type') == 'Shape':
                            shape_type = comp.get('props', {}).get('shapeType', 'rectangle')
                            shape_counts[shape_type] = shape_counts.get(shape_type, 0) + 1
                        elif comp.get('type') == 'Lines':
                            line_counts += 1
            
            if shape_counts or line_counts:
                enhanced.append(f"\nVISUAL ELEMENTS IN TEMPLATES:")
                for shape_type, count in shape_counts.items():
                    enhanced.append(f"  - {shape_type}: {count} instances")
                if line_counts:
                    enhanced.append(f"  - Lines: {line_counts} instances")
                enhanced.append("  - Use similar visual element density in your design")
        
        # Calculate average components from templates
        if templates:
            total_avg_components = sum(
                sum(len(slide.get('components', [])) for slide in template.slides) / len(template.slides)
                for template in templates
            ) / len(templates)
            enhanced.append(f"  - Average components in reference templates: {total_avg_components:.1f}")
            enhanced.append(f"  - Recommended: Use AT LEAST this many components, more for detailed content")
        
        # Add style preference considerations
        if style_preferences:
            enhanced.append("\nSTYLE PREFERENCE ADJUSTMENTS:")
            if style_preferences.get('vibeContext'):
                enhanced.append(f"  - Adapt layout to match vibe: {style_preferences['vibeContext']}")
            if style_preferences.get('minimalist'):
                enhanced.append("  - Simplify layout, increase whitespace")
            if style_preferences.get('dense'):
                enhanced.append("  - Maximize content area, reduce margins")
        
        # Add creative font guidance
        enhanced.append("\nCREATIVE FONT USAGE:")
        enhanced.append("  - The template fonts are SUGGESTIONS, not requirements")
        enhanced.append("  - Feel free to choose fonts that better match the content mood")
        enhanced.append("  - Mix serif and sans-serif fonts for visual hierarchy")
        enhanced.append("  - Use bold/unique fonts for emphasis and impact")
        enhanced.append("  - Consider the 200+ available fonts in the system")
        enhanced.append("  - Don't be afraid to use Script, Contemporary, or Unique font categories")
        
        # Add specific design properties to emulate
        if design_props:
            enhanced.append("\nSPECIFIC DESIGN PROPERTIES TO EMULATE:")
            
            # TextBlock properties
            if 'TextBlock' in design_props and design_props['TextBlock']:
                enhanced.append("\nTEXTBLOCK PROPERTIES:")
                tb_props = design_props['TextBlock']
                if tb_props.get('fontSizes'):
                    enhanced.append(f"  - Font sizes: {', '.join(map(str, tb_props['fontSizes'][:5]))}pt")
                if tb_props.get('fontFamilies'):
                    enhanced.append(f"  - Font families: {', '.join(tb_props['fontFamilies'][:3])}")
                if tb_props.get('colors'):
                    enhanced.append(f"  - Text colors: {', '.join(tb_props['colors'][:5])}")
                if tb_props.get('lineHeights'):
                    enhanced.append(f"  - Line heights: {', '.join(map(str, tb_props['lineHeights'][:3]))}")
                if tb_props.get('fontWeights'):
                    enhanced.append(f"  - Font weights: {', '.join(map(str, tb_props['fontWeights'][:3]))}")
                if tb_props.get('textAligns'):
                    enhanced.append(f"  - Text alignments: {', '.join(tb_props['textAligns'][:3])}")
            
            # Title properties
            if 'Title' in design_props and design_props['Title']:
                enhanced.append("\nTITLE PROPERTIES:")
                title_props = design_props['Title']
                if title_props.get('fontSizes'):
                    enhanced.append(f"  - Font sizes: {', '.join(map(str, title_props['fontSizes'][:3]))}pt")
                if title_props.get('fontFamilies'):
                    enhanced.append(f"  - Font families: {', '.join(title_props['fontFamilies'][:2])}")
                if title_props.get('colors'):
                    enhanced.append(f"  - Colors: {', '.join(title_props['colors'][:3])}")
                if title_props.get('fontWeights'):
                    enhanced.append(f"  - Font weights: {', '.join(map(str, title_props['fontWeights'][:2]))}")
            
            # Shape properties
            if 'Shape' in design_props and design_props['Shape']:
                enhanced.append("\nSHAPE PROPERTIES:")
                shape_props = design_props['Shape']
                if shape_props.get('fills'):
                    enhanced.append(f"  - Fill colors: {', '.join(shape_props['fills'][:5])}")
                if shape_props.get('opacities'):
                    enhanced.append(f"  - Opacities: {', '.join(map(str, shape_props['opacities'][:5]))}")
                if shape_props.get('borderRadius'):
                    enhanced.append(f"  - Border radius values: {', '.join(map(str, shape_props['borderRadius'][:3]))}")
                if shape_props.get('common_sizes'):
                    size_strings = [f"{w}x{h}" for w, h in shape_props['common_sizes'][:5]]
                    enhanced.append(f"  - Common sizes: {', '.join(size_strings)}")
            
            # Lines properties
            if 'Lines' in design_props and design_props['Lines']:
                enhanced.append("\nLINES PROPERTIES:")
                lines_props = design_props['Lines']
                if lines_props.get('strokes'):
                    enhanced.append(f"  - Stroke colors: {', '.join(lines_props['strokes'][:3])}")
                if lines_props.get('strokeWidths'):
                    enhanced.append(f"  - Stroke widths: {', '.join(map(str, lines_props['strokeWidths'][:3]))}")
            
            # Positioning patterns
            if 'positioning' in design_props and design_props['positioning']:
                enhanced.append("\nPOSITIONING PATTERNS:")
                pos_props = design_props['positioning']
                if pos_props.get('margins'):
                    margin_summary = {}
                    for side, value in pos_props['margins'][:20]:
                        if side not in margin_summary:
                            margin_summary[side] = []
                        margin_summary[side].append(value)
                    for side, values in margin_summary.items():
                        avg_margin = sum(values) / len(values)
                        enhanced.append(f"  - {side} margin: ~{avg_margin:.0f}px")
            
            enhanced.append("\nIMPORTANT: Use these exact property values when creating components to match the template design")
        
        return "\n".join(enhanced)
    
    def _enhance_style_guidelines(
        self,
        base_guidelines: str,
        templates: List[SlideTemplate],
        style_preferences: Dict[str, Any] = None,
        design_props: Dict[str, Any] = None
    ) -> str:
        """Enhance style guidelines with template-specific insights"""
        enhanced = [base_guidelines, "\n\nTEMPLATE-DERIVED STYLES:"]
        
        # Extract and summarize style properties from all template slides
        all_font_sizes = []
        all_colors = []
        all_fonts = []
        
        for template in templates:
            for slide in template.slides:
                components = slide.get('components', [])
                
                for comp in components:
                    props = comp.get('props', {})
                    
                    # Collect font information
                    if 'fontSize' in props:
                        all_font_sizes.append({
                            'type': comp['type'],
                            'size': props['fontSize'],
                            'template': template.name
                        })
                    if 'fontFamily' in props:
                        all_fonts.append(props['fontFamily'])
                    if 'color' in props:
                        all_colors.append({
                            'type': comp['type'],
                            'color': props['color']
                        })
        
        # Generate recommendations based on collected data
        if all_font_sizes:
            enhanced.append("\nFONT SIZE RECOMMENDATIONS (from templates):")
            # Group by component type
            size_by_type = {}
            for item in all_font_sizes:
                if item['type'] not in size_by_type:
                    size_by_type[item['type']] = []
                size_by_type[item['type']].append(item['size'])
            
            for comp_type, sizes in size_by_type.items():
                avg_size = sum(sizes) / len(sizes)
                enhanced.append(f"  - {comp_type}: {avg_size:.0f}pt (based on {len(sizes)} examples)")
        
        if all_fonts:
            # Get unique fonts and their frequency
            font_freq = {}
            for font in all_fonts:
                font_freq[font] = font_freq.get(font, 0) + 1
            
            enhanced.append("\nFONT FAMILY RECOMMENDATIONS:")
            for font, count in sorted(font_freq.items(), key=lambda x: x[1], reverse=True)[:3]:
                enhanced.append(f"  - {font} (used {count} times)")
        
        if all_colors:
            enhanced.append("\nCOLOR PALETTE FROM TEMPLATES:")
            color_by_type = {}
            for item in all_colors:
                if item['type'] not in color_by_type:
                    color_by_type[item['type']] = []
                if item['color'] not in color_by_type[item['type']]:
                    color_by_type[item['type']].append(item['color'])
            
            for comp_type, colors in color_by_type.items():
                enhanced.append(f"  - {comp_type} colors: {', '.join(colors[:3])}")
        
        # Add visual analysis insights
        enhanced.append("\nVISUAL ANALYSIS INSIGHTS:")
        for template in templates[:2]:
            if template.visual_analysis:
                enhanced.append(f"\n{template.name}:")
                if 'colors' in template.visual_analysis:
                    enhanced.append(f"  - Dominant colors: {template.visual_analysis['colors']}")
                if 'style' in template.visual_analysis:
                    enhanced.append(f"  - Style: {template.visual_analysis['style']}")
        
        # Apply style preferences
        if style_preferences:
            enhanced.append("\nSTYLE PREFERENCE OVERRIDES:")
            if style_preferences.get('font'):
                enhanced.append(f"  - Primary font override: {style_preferences['font']}")
            if style_preferences.get('colors'):
                colors = style_preferences['colors']
                if colors.get('background'):
                    enhanced.append(f"  - Background color: {colors['background']}")
                if colors.get('text'):
                    enhanced.append(f"  - Text color: {colors['text']}")
                if colors.get('accent1'):
                    enhanced.append(f"  - Accent color: {colors['accent1']}")
        
        # Add creative font guidance
        enhanced.append("\nCREATIVE FONT USAGE:")
        enhanced.append("  - The template fonts are SUGGESTIONS, not requirements")
        enhanced.append("  - Feel free to choose fonts that better match the content mood")
        enhanced.append("  - Mix serif and sans-serif fonts for visual hierarchy")
        enhanced.append("  - Use bold/unique fonts for emphasis and impact")
        enhanced.append("  - Consider the 200+ available fonts in the system")
        enhanced.append("  - Don't be afraid to use Script, Contemporary, or Unique font categories")
        
        # Add specific design properties to emulate
        if design_props:
            enhanced.append("\nSPECIFIC DESIGN PROPERTIES TO EMULATE:")
            
            # TextBlock properties
            if 'TextBlock' in design_props and design_props['TextBlock']:
                enhanced.append("\nTEXTBLOCK PROPERTIES:")
                tb_props = design_props['TextBlock']
                if tb_props.get('fontSizes'):
                    enhanced.append(f"  - Font sizes: {', '.join(map(str, tb_props['fontSizes'][:5]))}pt")
                if tb_props.get('fontFamilies'):
                    enhanced.append(f"  - Font families: {', '.join(tb_props['fontFamilies'][:3])}")
                if tb_props.get('colors'):
                    enhanced.append(f"  - Text colors: {', '.join(tb_props['colors'][:5])}")
                if tb_props.get('lineHeights'):
                    enhanced.append(f"  - Line heights: {', '.join(map(str, tb_props['lineHeights'][:3]))}")
                if tb_props.get('fontWeights'):
                    enhanced.append(f"  - Font weights: {', '.join(map(str, tb_props['fontWeights'][:3]))}")
                if tb_props.get('textAligns'):
                    enhanced.append(f"  - Text alignments: {', '.join(tb_props['textAligns'][:3])}")
            
            # Title properties
            if 'Title' in design_props and design_props['Title']:
                enhanced.append("\nTITLE PROPERTIES:")
                title_props = design_props['Title']
                if title_props.get('fontSizes'):
                    enhanced.append(f"  - Font sizes: {', '.join(map(str, title_props['fontSizes'][:3]))}pt")
                if title_props.get('fontFamilies'):
                    enhanced.append(f"  - Font families: {', '.join(title_props['fontFamilies'][:2])}")
                if title_props.get('colors'):
                    enhanced.append(f"  - Colors: {', '.join(title_props['colors'][:3])}")
                if title_props.get('fontWeights'):
                    enhanced.append(f"  - Font weights: {', '.join(map(str, title_props['fontWeights'][:2]))}")
            
            # Shape properties
            if 'Shape' in design_props and design_props['Shape']:
                enhanced.append("\nSHAPE PROPERTIES:")
                shape_props = design_props['Shape']
                if shape_props.get('fills'):
                    enhanced.append(f"  - Fill colors: {', '.join(shape_props['fills'][:5])}")
                if shape_props.get('opacities'):
                    enhanced.append(f"  - Opacities: {', '.join(map(str, shape_props['opacities'][:5]))}")
                if shape_props.get('borderRadius'):
                    enhanced.append(f"  - Border radius values: {', '.join(map(str, shape_props['borderRadius'][:3]))}")
                if shape_props.get('common_sizes'):
                    size_strings = [f"{w}x{h}" for w, h in shape_props['common_sizes'][:5]]
                    enhanced.append(f"  - Common sizes: {', '.join(size_strings)}")
            
            # Lines properties
            if 'Lines' in design_props and design_props['Lines']:
                enhanced.append("\nLINES PROPERTIES:")
                lines_props = design_props['Lines']
                if lines_props.get('strokes'):
                    enhanced.append(f"  - Stroke colors: {', '.join(lines_props['strokes'][:3])}")
                if lines_props.get('strokeWidths'):
                    enhanced.append(f"  - Stroke widths: {', '.join(map(str, lines_props['strokeWidths'][:3]))}")
            
            # Positioning patterns
            if 'positioning' in design_props and design_props['positioning']:
                enhanced.append("\nPOSITIONING PATTERNS:")
                pos_props = design_props['positioning']
                if pos_props.get('margins'):
                    margin_summary = {}
                    for side, value in pos_props['margins'][:20]:
                        if side not in margin_summary:
                            margin_summary[side] = []
                        margin_summary[side].append(value)
                    for side, values in margin_summary.items():
                        avg_margin = sum(values) / len(values)
                        enhanced.append(f"  - {side} margin: ~{avg_margin:.0f}px")
            
            enhanced.append("\nIMPORTANT: Use these exact property values when creating components to match the template design")
        
        return "\n".join(enhanced)
    
    async def generate_deck_guidelines(
        self,
        deck_outline: Dict[str, Any],
        style_preferences: Dict[str, Any] = None
    ) -> Dict[str, Tuple[str, str]]:
        """
        Generate dynamic guidelines for an entire deck
        
        Args:
            deck_outline: The full deck outline containing all slides
            style_preferences: Optional style preferences from the user
            
        Returns:
            Dictionary mapping slide IDs to (layout_guidelines, style_guidelines) tuples
        """
        guidelines_by_slide = {}
        all_templates = []  # Collect all templates found
        
        # Process each slide to generate specific guidelines
        for slide in deck_outline.get('slides', []):
            slide_id = slide.get('id', 'unknown')
            slide_title = slide.get('title', '')
            slide_content = slide.get('content', '')
            
            # Infer slide type
            slide_type = self._infer_slide_type(slide)
            
            # Combine title and content for better search
            full_content = f"{slide_title}. {slide_content}"
            
            # Generate guidelines for this slide
            layout, style, templates = await self.generate_guidelines_for_slide(
                full_content,
                slide_type,
                style_preferences,
                use_design_search=False  # Using content search for better results
            )
            
            guidelines_by_slide[slide_id] = (layout, style)
            all_templates.extend(templates)  # Collect templates
        
        # Store all templates for universal design extraction
        self.last_analyzed_templates = all_templates
        
        return guidelines_by_slide
    
    def _infer_slide_type(self, slide: Dict[str, Any]) -> str:
        """Infer the type of slide based on its content and position"""
        title = slide.get('title', '').lower()
        content = slide.get('content', '').lower()
        
        # Check for specific slide types
        if any(word in title for word in ['title', 'cover', 'welcome']):
            return 'title'
        elif any(word in title for word in ['agenda', 'outline', 'contents']):
            return 'agenda'
        elif any(word in title for word in ['thank', 'questions', 'q&a']):
            return 'closing'
        elif any(word in title for word in ['section', 'part', 'chapter']):
            return 'section'
        elif any(word in title for word in ['comparison', 'versus', 'vs']):
            return 'comparison'
        elif any(word in content for word in ['chart', 'graph', 'data']):
            return 'data'
        elif any(word in title for word in ['problem', 'challenge', 'issue']):
            return 'problem'
        elif any(word in title for word in ['solution', 'approach', 'strategy']):
            return 'solution'
        else:
            return 'content'  # Default type
    
    def _create_search_query(self, slide_content: str, slide_type: str = None) -> str:
        """
        Create a search query that matches how embeddings were created in the database.
        Focus on generic concepts and tags rather than specific content.
        """
        # Extract the slide title (usually the first line)
        lines = slide_content.strip().split('\n')
        title = lines[0] if lines else ""
        
        # Start with slide type as primary search term
        query_parts = []
        
        # Add the slide type - simplified
        if slide_type:
            query_parts.append(slide_type)
        
        # Add simple keywords based on slide type
        if slide_type == 'title':
            query_parts.extend(["title", "introduction", "cover"])
        elif slide_type == 'content':
            query_parts.extend(["content", "information", "details"])
        elif slide_type == 'data':
            query_parts.extend(["data", "chart", "graph"])
        elif slide_type == 'closing':
            query_parts.extend(["thank", "conclusion", "contact"])
        else:
            query_parts.extend(["presentation", "slide"])
        
        # Create a simple search query - no special characters
        search_query = ' '.join(query_parts[:5])  # Limit to 5 terms
        
        return search_query 