"""
Prompt builder for slide generation.
"""

from typing import Dict, Any, List
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.rag_system_prompt import get_rag_system_prompt
from agents.generation.components.prompt_compression import PromptCompressor
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SlidePromptBuilder:
    """Builds prompts for slide generation."""
    
    MAX_CONTEXT_CHARS = 32000  # ~8,000 tokens (reduced for better performance)
    
    def __init__(self):
        self.compressor = PromptCompressor()
    
    def build_system_prompt(self) -> str:
        """Build the system prompt."""
        return get_rag_system_prompt()
    
    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any]
    ) -> str:
        """Build the user prompt with RAG context."""
        # Compress RAG context first
        compressed_rag = self.compressor.compress_rag_context(rag_context)
        
        sections = []
        
        # Add slide information
        self._add_slide_info(sections, context)
        
        # Add mandatory content
        self._add_mandatory_content(sections, context)
        
        # Add extracted Excel/data file content if available
        self._add_extracted_data_context(sections, context)
        
        # Add typography requirements
        self._add_typography_requirements(sections, context, compressed_rag)
        
        # Add color palette
        self._add_color_palette(sections, context)
        
        # Add chart data if present
        if context.has_chart_data:
            self._add_chart_requirements(sections, context)
        
        # Add compressed RAG context
        self._add_rag_context(sections, compressed_rag, context)
        
        # Add image instructions
        self._add_image_instructions(sections, context)
        
        # Add final requirements
        self._add_final_requirements(sections)
        
        # Join and check size
        prompt = '\n'.join(sections)
        
        # Apply additional compression if still too large
        if len(prompt) > self.MAX_CONTEXT_CHARS:
            logger.warning(f"Prompt still large after RAG compression: {len(prompt)} chars (~{len(prompt)//4} tokens)")
            prompt = self.compressor.compress_prompt(prompt, target_tokens=8000)
            
            # Final truncation if still too large
            if len(prompt) > self.MAX_CONTEXT_CHARS:
                logger.error(f"Prompt still exceeds limit after compression: {len(prompt)} > {self.MAX_CONTEXT_CHARS}")
                prompt = prompt[:self.MAX_CONTEXT_CHARS - 200] + "\n\n[COMPRESSED]\n\nGenerate a JSON object with 'id', 'title', and 'components' array."
        
        logger.info(f"Final prompt size: {len(prompt)} chars (~{len(prompt)//4} tokens)")
        return prompt
    
    def _add_slide_info(self, sections: List[str], context: SlideGenerationContext):
        """Add basic slide information."""
        sections.extend([
            f"SLIDE {context.slide_index + 1} of {context.total_slides}",
            f"Title: {context.slide_outline.title}",
            f"Content: {context.slide_outline.content}"
        ])
    
    def _add_mandatory_content(self, sections: List[str], context: SlideGenerationContext):
        """Add mandatory content requirements."""
        sections.extend([
            "\n** CRITICAL: PRESENTATIONS MUST BE PUNCHY BUT SUBSTANTIVE!",
            "- Target 80-120 words per slide - not too sparse, not too dense",
            "- Use impactful bullet points (8-15 words each) with specifics",
            "- NO PARAGRAPHS - use structured bullet points",
            "- EVERY NUMBER needs a CHART - visualize all data",
            "- Charts should DOMINATE slides (60-80% of space)",
            "",
            "** MANDATORY: You MUST include the key points from the content above!",
            "- The title should be prominently displayed",
            "- Extract the ESSENCE of the content - not every word",
            "- Focus on the most impactful points only"
        ])
    
    def _add_extracted_data_context(self, sections: List[str], context: SlideGenerationContext):
        """Add extracted Excel/data file content if available."""
        # Check if the deck outline has extracted data in any slide
        extracted_data_found = False
        
        # Check if we have extracted data from the file context in the slide content
        # The data comes through the slide content after being processed by OpenAI Assistant
        if context.slide_outline.content:
            # Look for extracted data in the content
            content = context.slide_outline.content
            if "EXTRACTED DATA:" in content:
                sections.append("\n EXTRACTED DATA FROM UPLOADED FILES:")
                sections.append("WARNING: CRITICAL: Use the EXACT data provided below in your slide content!\n")
                
                # Extract the data section from content
                if "EXTRACTED DATA:" in content:
                    data_start = content.find("EXTRACTED DATA:")
                    data_section = content[data_start:]
                    # Get first few lines of extracted data
                    data_lines = data_section.split('\n')[:10]  # Show first 10 lines
                    sections.append("\n💼 ACTUAL DATA FROM YOUR FILE:")
                    for line in data_lines:
                        if line.strip():
                            sections.append(f"  {line.strip()}")
                    sections.append("\nWARNING: DO NOT USE GENERIC PLACEHOLDERS - USE THE EXACT VALUES PROVIDED!")
                    extracted_data_found = True
                
                # Check for chart data
                if "CHART DATA:" in content:
                    sections.append(f"\n📈 CHART DATA AVAILABLE")
                    sections.append("YOU MUST CREATE A CHART WITH THIS DATA!")
                    sections.append("Use the exact chart type and data format specified in the extracted data")
                    extracted_data_found = True
        
        # Look through all slides in the deck for extracted data
        for slide in context.deck_outline.slides:
            if hasattr(slide, 'extractedData') and slide.extractedData:
                if not extracted_data_found:
                    sections.append("\n EXTRACTED DATA FROM UPLOADED FILES:")
                    sections.append("WARNING: CRITICAL: Use these EXACT values in your slide content!\n")
                    extracted_data_found = True
                
                # If this is data for the current slide
                if slide.id == context.slide_outline.id:
                    sections.append(f"\n DATA FOR THIS SLIDE:")
                    if hasattr(slide.extractedData, 'data') and slide.extractedData.data:
                        # Show sample of the data
                        data_sample = slide.extractedData.data[:5] if len(slide.extractedData.data) > 5 else slide.extractedData.data
                        sections.append(f"Chart Type: {slide.extractedData.chartType}")
                        sections.append(f"Data Points: {len(slide.extractedData.data)} total")
                        sections.append(f"Sample: {data_sample}")
                else:
                    # Show data from other slides for context
                    if hasattr(slide.extractedData, 'data') and slide.extractedData.data:
                        # For watchlist/portfolio data
                        for item in slide.extractedData.data:
                            if isinstance(item, dict):
                                if 'shares' in item and 'currentValue' in item:
                                    sections.append(f"\n💼 PORTFOLIO DATA:")
                                    sections.append(f"- Symbol: {item.get('symbol', 'Unknown')}")
                                    sections.append(f"- Shares: {item.get('shares')}")
                                    sections.append(f"- Current Price: ${item.get('currentPrice', 'N/A')}")
                                    sections.append(f"- Total Value: ${item.get('currentValue')}")
                                    sections.append("USE THESE EXACT VALUES!")
                                elif 'currentPrice' in item and 'symbol' in item:
                                    sections.append(f"\n📈 STOCK DATA for {item.get('symbol')}:")
                                    sections.append(f"- Current Price: ${item.get('currentPrice')}")
                                    if '52WeekHigh' in item:
                                        sections.append(f"- 52-Week High: ${item.get('52WeekHigh')}")
                                    if '52WeekLow' in item:
                                        sections.append(f"- 52-Week Low: ${item.get('52WeekLow')}")
        
        if extracted_data_found:
            sections.append("\nWARNING: The slide content MUST use the real data shown above, not generic placeholders!")
    
    def _add_typography_requirements(self, sections: List[str], context: SlideGenerationContext, rag_context: Dict[str, Any]):
        """Add typography requirements from theme and RAG context."""
        sections.append("\n** MANDATORY TYPOGRAPHY FROM THEME:")
        
        typography = context.theme.typography
        hero_font = typography.get('hero_title', {}).get('family', 'Montserrat')  # Better default than Inter
        body_font = typography.get('body_text', {}).get('family', 'Poppins')  # Better default than Inter
        hero_size = typography.get('hero_title', {}).get('size', 96)
        body_size = typography.get('body_text', {}).get('size', 36)
        
        # Log what fonts we're using
        logger.info(f"[PROMPT BUILDER] Typography - Hero: {hero_font}, Body: {body_font}")
        
        sections.extend([
            f"HERO FONT (titles/headers): {hero_font}",
            f"BODY FONT (content/text): {body_font}",
            f"Hero default size: {hero_size}pt",
            f"Body default size: {body_size}pt"
        ])
        
        # Get text hierarchy from RAG context
        text_hierarchy = rag_context.get('text_hierarchy', {})

        # Add critical text rules from RAG
        if text_hierarchy.get('critical_rules'):
            rules = text_hierarchy['critical_rules']
            sections.append("\n** CRITICAL TEXT COMPONENT RULES:")

            # Add component requirements
            if 'component_requirements' in rules:
                for i, req in enumerate(rules['component_requirements'], 1):
                    # Replace placeholder fonts with actual theme fonts
                    req = req.replace('Hero font for impact', f"Hero='{hero_font}'").replace('Body font for context', f"Body='{body_font}'")
                    sections.append(f"{i}. {req}")

            # Add multiple blocks mandatory rules
            if 'multiple_blocks_mandatory' in rules:
                mbm = rules['multiple_blocks_mandatory']
                sections.extend([
                    "",
                    f"** 🔥 MANDATORY: {mbm.get('rule', '')}",
                    f"- {mbm.get('requirement', '')}",
                    f"- {mbm.get('positioning', '')}",
                ])

                # Add example if present
                if 'example' in mbm and 'implementation' in mbm['example']:
                    sections.append(f"- Example layout for '{mbm['example']['text']}':")
                    for impl in mbm['example']['implementation']:
                        sections.append(f"  * {impl}")

                sections.append(f"- {mbm.get('emphasis', '')}")

        # Add font sizing rules from RAG
        if text_hierarchy.get('sizing_rules'):
            sections.append("\n** CRITICAL FONT SIZING RULES - MAKE KEY INFO UNMISSABLE:")
            sizing = text_hierarchy['sizing_rules']

            # Add sizing rules in order
            if 'key_statistics' in sizing:
                rule = sizing['key_statistics']
                sections.append(f"1. {rule.get('description', '')}: {rule.get('size_range', '')}")

            if 'important_words' in sizing:
                rule = sizing['important_words']
                sections.append(f"2. {rule.get('description', '')}: {rule.get('size_range', '')}")

            if 'critical_takeaways' in sizing:
                rule = sizing['critical_takeaways']
                sections.append(f"3. {rule.get('description', '')}: {rule.get('size_range', '')} with {rule.get('weight', '')} weight")

            if 'supporting_context' in sizing:
                rule = sizing['supporting_context']
                sections.append(f"4. {rule.get('description', '')}: {rule.get('size_range', '')}")

            if 'space_allocation' in sizing:
                sections.append(f"5. {sizing['space_allocation'].get('rule', '')}")

            if 'custom_components' in sizing:
                sections.append(f"6. For CustomComponents: Key metrics at {sizing['custom_components'].get('key_metrics', '')}, supporting at {sizing['custom_components'].get('supporting', '')}")

            if 'contrast_principle' in sizing:
                sections.append(f"7. {sizing['contrast_principle']}")

            # Add examples from sizing rules
            for rule_name, rule_data in sizing.items():
                if isinstance(rule_data, dict) and 'examples' in rule_data:
                    for example in rule_data['examples']:
                        sections.append(f"8. Examples: {', '.join(rule_data['examples'])}")
                    break

        # Add creative patterns from RAG
        if text_hierarchy.get('patterns'):
            sections.append("\n** 🎨 CREATIVE TEXT HIERARCHY PATTERNS - SPLIT & EMPHASIZE:")
            patterns = text_hierarchy['patterns']

            for pattern_key, pattern in patterns.items():
                if isinstance(pattern, dict) and 'name' in pattern:
                    sections.append(f"\n{pattern['name']}")

                    # Add structure details
                    if 'structure' in pattern:
                        for part_name, part_details in pattern['structure'].items():
                            if isinstance(part_details, dict):
                                content = part_details.get('content', '')
                                size = part_details.get('size', '')
                                color = part_details.get('color', '')
                                weight = part_details.get('weight', '')
                                sections.append(f"- {part_name.replace('_', ' ').title()}: '{content}' at {size}, {color}, {weight}")

                    # Add examples
                    if 'examples' in pattern:
                        for example in pattern['examples']:
                            sections.append(f"- Example: {example}")

        # Add layout techniques from RAG
        if text_hierarchy.get('layout_techniques'):
            sections.append("\n** 📐 TEXT LAYOUT TECHNIQUES:")
            techniques = text_hierarchy['layout_techniques']

            tech_num = 1
            for key, value in techniques.items():
                if isinstance(value, dict):
                    sections.append(f"{tech_num}. {key.upper().replace('_', ' ')}: {value.get('description', '')}")
                    tech_num += 1

        # Add creative examples from RAG
        if text_hierarchy.get('examples'):
            sections.append("\n** ✨ CREATIVE SPLITTING EXAMPLES:")
            for example in text_hierarchy['examples']:
                if isinstance(example, dict):
                    structure = example.get('structure', '')
                    sections.append(f"- {structure}")

        # Add implementation rules from RAG
        if text_hierarchy.get('implementation'):
            impl = text_hierarchy['implementation']
            if isinstance(impl, dict):
                sections.append(f"\n{impl.get('mandatory', '')}")
            elif isinstance(impl, str):
                sections.append(f"\n{impl}")

    def _add_color_palette(self, sections: List[str], context: SlideGenerationContext):
        """Add color palette information."""
        palette = context.palette or {}
        theme_colors = context.theme.color_palette
        
        # Log what we received
        logger.info(f"[PROMPT BUILDER] Theme colors received: {theme_colors}")
        logger.info(f"[PROMPT BUILDER] Palette received: {palette}")
        
        # Get colors with better fallback handling
        bg_color = theme_colors.get('primary_background')
        if not bg_color:
            bg_color = palette.get('backgrounds', ['#FFFFFF'])[0] if palette.get('backgrounds') else '#FFFFFF'
            logger.warning(f"[PROMPT BUILDER] No primary_background in theme, using: {bg_color}")
            
        primary_accent = theme_colors.get('accent_1')
        if not primary_accent:
            primary_accent = palette.get('colors', ['#0066CC'])[0] if palette.get('colors') else '#0066CC'
            logger.warning(f"[PROMPT BUILDER] No accent_1 in theme, using: {primary_accent}")
            
        secondary_accent = theme_colors.get('accent_2')
        if not secondary_accent:
            if palette.get('colors') and len(palette.get('colors', [])) > 1:
                secondary_accent = palette.get('colors')[1]
            else:
                secondary_accent = '#FF6B6B'
            logger.warning(f"[PROMPT BUILDER] No accent_2 in theme, using: {secondary_accent}")
            
        text_color = theme_colors.get('primary_text') or self._get_text_color(bg_color)
        
        sections.extend([
            f"\n COLOR PALETTE - EXACTLY 3 COLORS:",
            f"BACKGROUND: {bg_color}",
            f"PRIMARY ACCENT: {primary_accent}",
            f"SECONDARY ACCENT: {secondary_accent}",
            f"TEXT: {text_color} (auto-selected for contrast)"
        ])
    
    def _add_chart_requirements(self, sections: List[str], context: SlideGenerationContext):
        """Add chart requirements if data is present."""
        sections.extend([
            f"\n**WARNING:** MANDATORY CHART - FAILURE TO INCLUDE = REJECTED SLIDE! **WARNING:**",
            "YOU ABSOLUTELY MUST CREATE A CHART COMPONENT WITH THIS DATA:",
            self._format_chart_data(context.slide_outline.extractedData),
            "\nWARNING: CRITICAL: The slide WILL BE REJECTED if you don't include a Chart component!",
            "The Chart component MUST use the EXACT data provided above!",
            "\n IMPORTANT CHART DATA RULES:",
            "1. Use the EXACT numerical values from the slide content",
            "2. Extract data points like 'Sales: $1.2M' or 'Growth: 45%' from the content",
            "3. NEVER use generic placeholder data like 'Stage 1: 1000, Stage 2: 600'",
            "4. If the content mentions specific percentages, revenues, or metrics - USE THEM",
            "5. The chart should visualize the ACTUAL data mentioned in the slide content",
            "",
            "\n CREATIVE CHART VISUALIZATION:",
            "- PREFER INNOVATIVE TYPES: treemap, sankey, sunburst, radar, waterfall, gauge",
            "- STYLING: Use gradient fills from theme colors, add subtle 3D depth",
            "- ANIMATIONS: Bars should grow, lines should draw, pies should rotate in",
            "- HIGHLIGHT: Make key data points stand out with different colors",
            "- ANNOTATIONS: Add callout labels for important values"
        ])
    
    def _add_rag_context(self, sections: List[str], rag_context: Dict[str, Any], context: SlideGenerationContext):
        """Add relevant RAG context."""
        # Critical rules
        if critical_rules := rag_context.get('critical_rules', {}):
            sections.append(f"\n{self._format_critical_rules(critical_rules, context)}")
        
        # Predicted components
        predicted = rag_context.get('predicted_components', [])
        if context.has_chart_data and "Chart" not in predicted:
            predicted.append("Chart")
        sections.append(f"\nCOMPONENTS TO USE: {', '.join(predicted)}")
        
        # Add specific Chart component instructions if predicted
        if "Chart" in predicted:
            sections.extend([
                            "\n CHART COMPONENT REQUIREMENTS:",
            "1. ALWAYS set showLegend: false for ALL charts",
            "2. Extract REAL data from the slide content - look for:",
            "   - Percentages: '45% increase', '30% of users'",
            "   - Dollar amounts: '$1.2M revenue', '$500K budget'",
            "   - Quantities: '1,200 units', '5 stages'",
            "   - Comparisons: 'Team A: 45, Team B: 38'",
            "3. NEVER use generic template data",
            "4. Use ACTUAL names and values from content",
            "",
            " CRITICAL CHART DESIGN - LARGE & IMPACTFUL:",
            "SIZE: Charts should be 800-1200px wide, 600-900px tall minimum",
            "POSITION: Can OVERLAP with titles and other elements for drama",
            "LABELS: Keep axis labels SMALL (12-16px) to emphasize data",
            "DATA: Make bars/lines THICK and BOLD with vibrant colors",
            "LAYOUT: Position charts to dominate 60-80% of slide space",
            "OVERLAP: Let charts extend behind/over titles for modern look",
            "",
            "EXAMPLE OVERLAPPING LAYOUT:",
            "- Title at {x: 100, y: 50} with large chart at {x: 0, y: 100}",
            "- Chart extends full width, title overlays on top-left",
            "- Text components positioned OVER chart areas with contrast"
            ])
        
        # Explicitly mention Icon if it's in the list
        if "Icon" in predicted:
            sections.extend([
                "\n ICON USAGE RULES:",
                "1. ONLY use icons for:",
                "   - Text labels and bullet points",
                "   - Data visualization (e.g., 3 filled + 1 empty icon for 75%)",
                "   - Process flow indicators",
                "2. NEVER use icons for:",
                "   - Background decoration",
                "   - General slide embellishment",
                "   - 'Filling space'",
                "3. For percentage infographics:",
                "   - Use CustomComponent with icon grid",
                "   - Example: 75% = 3 filled User icons + 1 unfilled",
                "\n ICON COMPONENT: Use the native Icon component type for icons!",
                "Icon props: iconLibrary (lucide/heroicons/feather/tabler), iconName, color, strokeWidth, filled",
                "Example: {\"type\": \"Icon\", \"props\": {\"iconLibrary\": \"lucide\", \"iconName\": \"Star\", \"color\": \"#000000\", \"strokeWidth\": 2, \"filled\": false, \"position\": {\"x\": 100, \"y\": 200}, \"width\": 48, \"height\": 48}}",
                "DO NOT use CustomComponent for icons - Icon is its own component type!"
            ])
        
        # Add CustomComponent text size emphasis
        if "CustomComponent" in predicted:
            sections.extend([
                "\n CUSTOMCOMPONENT TEXT FORMATTING - BOLD & IMPACTFUL!",
                "Make text stand out with proper sizing and BOLD formatting:",
                "TEXT SIZES (reasonable but readable):",
                "- Small labels: 16-20px with fontWeight: 600",
                "- Regular labels: 20-24px with fontWeight: 700",
                "- Body text: 24-32px with fontWeight: 600",
                "- Subheadings: 36-48px with fontWeight: 700",
                "- Main headings: 48-64px with fontWeight: 800", 
                "- Hero numbers: 96-144px with fontWeight: 900",
                "- Impact statements: 72-96px with fontWeight: 800",
                "",
                "FORMATTING FOR IMPACT:",
                "- ALWAYS use fontWeight 500+ (NEVER 400 or 'normal')",
                "- Add letterSpacing: '0.5px' to '2px' for headers",
                "- Use textShadow: '0 2px 4px rgba(0,0,0,0.2)' for depth",
                "- Apply bright accent colors to key metrics/numbers",
                "- Add semi-transparent colored backgrounds to text blocks",
                "- Use borderLeft with accent color for section dividers",
                "",
                "VISUAL HIERARCHY: Bold weights + Color contrast + Strategic spacing = Professional impact!"
            ])
            
            # Add content fitting rules
            sections.extend([
                "\n CRITICAL: CUSTOMCOMPONENT CONTENT MUST FIT WITHIN BOUNDARIES:",
                "1. CALCULATE SIZES PROPERLY:",
                "   - Available width = props.width - (padding * 2)",
                "   - Available height = props.height - (padding * 2)",
                "   - NEVER position elements outside these bounds",
                "",
                "2. PREVENT OVERFLOW:",
                "   - Use boxSizing: 'border-box' on all containers",
                "   - For grids: totalWidth = itemWidth * cols + gap * (cols - 1)",
                "   - Ensure this totalWidth <= available width",
                "   - Add overflow: 'hidden' to container as safety",
                "",
                "3. RESPONSIVE TEXT SIZING:",
                "   - If text might overflow, calculate: fontSize = containerWidth / (textLength * 0.6)",
                "   - Use Math.min(desiredSize, calculatedSize) to prevent overflow",
                "   - Multi-line text: add lineHeight and calculate total height",
                "",
                "4. ABSOLUTE POSITIONING RULES:",
                "   - NEVER use x values > (width - elementWidth - padding)",
                "   - NEVER use y values > (height - elementHeight - padding)",
                "   - Keep 40px minimum from all edges",
                "",
                "5. EXAMPLE CALCULATION:",
                "   - Component width: 1600px, padding: 80px",
                "   - Available space: 1600 - (80 * 2) = 1440px",
                "   - 3 columns with 40px gap: (1440 - 80) / 3 = 453px per column",
                "",
                "VERIFY: Every element must fit within the component's width/height!"
            ])
            
            # Add formatting examples
            sections.extend([
                "\n FORMATTING EXAMPLES FOR MAXIMUM IMPACT:",
                "1. HERO METRICS:",
                "   fontSize: '120px', fontWeight: 900, color: theme.accent_1,",
                "   textShadow: '0 4px 8px rgba(0,0,0,0.3)', letterSpacing: '1px'",
                "",
                "2. DATA LABELS:",
                "   fontSize: '24px', fontWeight: 700, color: theme.text,",
                "   opacity: 0.9, textTransform: 'uppercase', letterSpacing: '1.5px'",
                "",
                "3. PERCENTAGE/STATS:",
                "   fontSize: '96px', fontWeight: 800,",
                "   background: 'linear-gradient(135deg, ' + theme.accent_1 + ', ' + theme.accent_2 + ')',",
                "   WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent'",
                "",
                "4. SECTION HEADERS:",
                "   fontSize: '48px', fontWeight: 700, color: theme.accent_1,",
                "   borderBottom: '3px solid ' + theme.accent_1, paddingBottom: '20px'",
                "",
                "5. TEXT BLOCKS WITH BACKGROUND:",
                "   backgroundColor: theme.accent_1 + '20', // 20% opacity",
                "   borderLeft: '4px solid ' + theme.accent_1,",
                "   padding: '24px 32px', borderRadius: '8px'",
                "",
                "REMEMBER: Bold + Color + Shadow + Spacing = Visual Impact!"
            ])
        
        # Add specific CustomComponent rules if CustomComponent is predicted
        if "CustomComponent" in predicted:
            # Get theme information for CustomComponents
            theme = context.theme.to_dict() if hasattr(context.theme, 'to_dict') else context.theme
            colors = theme.get('color_palette', {})
            typography = theme.get('typography', {})

            # Get CustomComponent prompts from RAG
            cc_prompts = rag_context.get('customcomponent_prompts', {})

            # Add CustomComponent prompts from RAG
            sections.append("\n** MANDATORY CUSTOMCOMPONENT USAGE - THEMED & CREATIVE VISUALIZATION!")

            # Add theme integration rules
            if cc_prompts.get('theme_integration'):
                integration = cc_prompts['theme_integration']
                sections.append(f"CRITICAL: {integration.get('mandatory_rules', '')}")
                sections.append("")

                # Add color props
                if integration.get('color_props'):
                    color_props = integration['color_props']
                    sections.append(f"🎨 THEME INTEGRATION (MANDATORY):")
                    sections.append(f"{color_props.get('description', '')}")

                    # Add specific color values
                    sections.extend([
                        f"- Primary Color: {colors.get('accent_1', '#00F0FF')} (use for main elements, emphasis)",
                        f"- Secondary Color: {colors.get('accent_2', '#FF5722')} (use for contrasts, highlights)",
                        f"- Background: {colors.get('primary_background', '#0A0E27')} to {colors.get('secondary_background', '#1A1F3A')}",
                        f"- Text Color: {colors.get('primary_text', '#FFFFFF')} (ensure readability)",
                        f"- Hero Font: {typography.get('hero_title', {}).get('family', 'Poppins')} (for big numbers)",
                        f"- Body Font: {typography.get('body_text', {}).get('family', 'Inter')} (for labels)"
                    ])

                    # Add implementation notes
                    if 'implementation' in color_props:
                        sections.append("")
                        for impl in color_props['implementation']:
                            sections.append(f"→ {impl}")
                    sections.append("")

                # Add design integration
                if integration.get('design_integration'):
                    sections.append("✨ CREATIVE DESIGN PRINCIPLES:")
                    for principle in integration['design_integration']:
                        sections.append(f"- {principle}")
                    sections.append("")

            # Add composition and layout patterns
            sections.extend([
                "📐 COMPOSITION & LAYOUT:",
                "- Consider the entire slide composition",
                "- Complement other components visually",
                "- Use appropriate layout patterns:",
                "  * Side-by-side: Text (40%) + Visualization (60%)",
                "  * Top-bottom: Key message above, supporting viz below",
                "  * Full-slide: Component fills space with integrated text",
                "  * Asymmetric: Hero visualization (70%) + supporting content (30%)",
                "",
                "🎯 CREATIVE VISUALIZATION OPPORTUNITIES:",
                ""
            ])

            # Add creative principles from RAG
            if cc_prompts.get('creative_principles'):
                principles = cc_prompts['creative_principles']

                # Add visual storytelling
                if principles.get('visual_storytelling'):
                    for story in principles['visual_storytelling']:
                        sections.append(f"- {story}")
                    sections.append("")

                # Add component types and suggestions
                if principles.get('component_types'):
                    types = principles['component_types']

                    if types.get('metrics_kpis'):
                        sections.extend([
                            "📊 METRICS/KPIs (growth %, revenue, performance):",
                            f"→ USE: {', '.join(types['metrics_kpis'].get('suggestions', [])[:3])}",
                            "→ STYLE: Use theme's accent colors for particles/effects",
                            "→ Example: Revenue 45% → Large animated number with color particles matching theme",
                            ""
                        ])

                    if types.get('comparisons'):
                        sections.extend([
                "📈 COMPARISONS (before/after, vs, old/new):",
                            f"→ USE: {', '.join(types['comparisons'].get('suggestions', [])[:3])}",
                            "→ STYLE: Muted theme color for 'before', bright accent for 'after'",
                            "→ Example: Old: 45% → New: 340% with dramatic size difference and glow",
                            ""
                        ])

                    if types.get('timelines'):
                        sections.extend([
                "🗓️ TIMELINES/ROADMAPS (phases, milestones, journey):",
                            f"→ USE: {', '.join(types['timelines'].get('suggestions', [])[:3])}",
                            "→ STYLE: Gradient progression using theme colors",
                            "→ Example: Journey with connected dots in theme's accent color",
                            ""
                        ])

                    if types.get('processes'):
                        sections.extend([
                            "🔄 PROCESSES/DECISIONS (flow, framework, choices):",
                            f"→ USE: {', '.join(types['processes'].get('suggestions', [])[:3])}",
                            "→ STYLE: Use theme gradients for flow connections",
                            "→ Example: Decision paths with glowing theme-colored branches",
                            ""
                        ])

                    if types.get('engagement'):
                        sections.extend([
                "💭 ENGAGEMENT (quiz, poll, feedback):",
                            f"→ USE: {', '.join(types['engagement'].get('suggestions', [])[:3])}",
                "→ Example: 'What do you think?' → Create interactive poll",
                            ""
                        ])

            # Add theme integration reminder
            sections.extend([
                "",
                "🎨 CUSTOMCOMPONENT THEME INTEGRATION (CRITICAL):",
                "→ ALWAYS pass theme colors as props:",
                f"  - primaryColor: '{colors.get('accent_1', '#00F0FF')}'",
                f"  - secondaryColor: '{colors.get('accent_2', '#FF5722')}'", 
                f"  - backgroundColor: '{colors.get('primary_background', '#0A0E27')}'",
                f"  - textColor: '{colors.get('primary_text', '#FFFFFF')}'",
                f"  - fontFamily: '{typography.get('hero_title', {}).get('family', 'Poppins')}'"
            ])

            # Add implementation from color props
            if cc_prompts.get('theme_integration', {}).get('color_props', {}).get('implementation'):
                for impl in cc_prompts['theme_integration']['color_props']['implementation']:
                    sections.append(f"→ {impl}")
            sections.append("")

            # Add technical requirements from RAG
            if cc_prompts.get('technical_requirements'):
                tech = cc_prompts['technical_requirements']

                sections.append("** IMPLEMENTATION RULES:")
                if tech.get('structure'):
                    for i, rule in enumerate(tech['structure'], 1):
                        sections.append(f"{i}. {rule}")
                sections.append("")

                if tech.get('rendering'):
                    sections.append("** RENDERING REQUIREMENTS:")
                    for rule in tech['rendering']:
                        sections.append(f"- {rule}")
                    sections.append("")

            # Add contextual adaptation
            if cc_prompts.get('contextual_adaptation'):
                adapt = cc_prompts['contextual_adaptation']
                sections.append(f"** {adapt.get('description', 'CONTEXTUAL ADAPTATION')}:")
                if adapt.get('adaptations'):
                    for adaptation in adapt['adaptations']:
                        sections.append(f"- {adaptation}")
                sections.append("")

            sections.extend([
                "** DATA PRESENTATION PATTERNS - Choose based on content:",
                "- COMPARISONS: Split screen, overlapping circles, balance scales",
                "- PROGRESS: Journey maps, growth trees, filling containers",
                "- HIERARCHIES: Pyramids, nested circles, tree maps",
                "- TIMELINES: Animated sequences, calendar heatmaps, gantt-style",
                "",
                "Remember: CustomComponents should enhance the story, not distract!"
            ])
        
        # Component schemas
        if schemas := rag_context.get('component_schemas', {}):
            sections.append(f"\n{self._format_component_schemas(schemas, predicted)}")
    
    def _add_image_instructions(self, sections: List[str], context: SlideGenerationContext):
        """Add image handling instructions."""
        if context.tagged_media:
            # We have tagged media - use these instead of placeholders
            sections.append("\n🖼️ TAGGED MEDIA: Use the following uploaded media for Image components:")
            for media in context.tagged_media[:3]:  # Limit to first 3 for prompt size
                sections.append(f"- {media.get('filename', 'Unknown')}: {media.get('interpretation', '')}")
            sections.extend([
                "\nIMPORTANT: Still use src: 'placeholder' for Image components!",
                "The system will automatically replace placeholders with the tagged media URLs.",
                "Your job is to create Image components with src: 'placeholder' where you want images.",
                "For title slides: Include a hero image with src: 'placeholder'!",
                "Match the number of Image components to available media based on the interpretations above."
            ])
        elif context.available_images and context.async_images:
            # Async mode with available images - DON'T show them, just use placeholders
            sections.extend([
                f"\n🖼️ IMAGE PLACEHOLDERS REQUIRED ({len(context.available_images)} images available for user selection)",
                "CRITICAL: You MUST use src: 'placeholder' for ALL Image components!",
                "DO NOT use any URLs - the user will select images later.",
                "Create Image components with src: 'placeholder' where appropriate.",
                "For title slides: Include a hero image with src: 'placeholder'!"
            ])
        elif context.available_images:
            # Pre-fetched images mode - show and use them directly
            sections.append(f"\n🖼️ AVAILABLE IMAGES ({len(context.available_images)} found):")
            sections.append(f"{self._format_available_images(context.available_images[:6])}")
            sections.append("\nUse the URLs above directly in your Image components.")
        else:
            sections.extend([
                "\n🖼️ IMAGES: Use src: 'placeholder' (just the word 'placeholder', NOT a URL!)",
                "For title slides: PREFER a full-bleed hero image with src: 'placeholder'. Avoid split-screen for titles by default.",
                "Example: {\"type\": \"Image\", \"props\": {\"src\": \"placeholder\", \"position\": {\"x\": 0, \"y\": 0}, \"width\": 1920, \"height\": 1080}}"
            ])
        
        # Add image boundary rules
        sections.extend([
            "\n** CRITICAL IMAGE BOUNDARY RULES:",
            "1. CANVAS LIMITS: x + width MUST be <= 1920, y + height MUST be <= 1080",
            "2. RIGHT EDGE: If x > 960, max width = 1920 - x - 80 (for margin)",
            "3. BOTTOM EDGE: If y > 540, max height = 1080 - y - 80 (for margin)",
            "4. NO OVERFLOW: Images must NOT extend past canvas edges (except full-bleed)",
            "5. SAFE ZONES: Left (x=80, w=880), Right (x=960, w=880), Center (x=160, w=1600)",
            "6. VALIDATE: Always check x + width <= 1920 before placing any image"
        ])
        
        # Add creative visual enhancement rules
        sections.extend([
            "\n** CREATIVE VISUAL ENHANCEMENTS - MAKE IT DYNAMIC:",
            "",
            "IMAGE EFFECTS (apply to make images pop):",
            "- Animation: ken-burns (duration: 20, scale: 1.1) for subtle movement",
            "- Filters: dramatic, vibrant, cyberpunk, vintage for mood",
                "- Masks: circle, hexagon, diagonal for creative framing",
                "- Circle masks require square image boxes (width === height) to prevent side cropping",
            "- Overlays: gradient overlays (bottomFade, vignette) for depth",
            "",
            "SHAPE CREATIVITY (functional but beautiful):",
            "- Circles: Use LARGE (300-500px) for big statistics",
            "- Hexagons: Connect multiple for tech/process flows",
            "- Arrows: Curved paths for dynamic flow",
            "- Gradients: Subtle fills (10-20% color difference)",
            "- Transparency: 30-50% opacity for layering",
            "",
            "LAYOUT PATTERNS (break the grid):",
            "- Split-screen: 50/50 or 60/40 image/content balance",
            "- Asymmetric: Off-center for visual tension",
            "- Layered: Overlapping elements with transparency",
            "- Scattered: Polaroid-style image arrangements",
            "",
            "ANIMATION CHOREOGRAPHY (bring it to life):",
            "- Entrance: fade-in (400-600ms), slide-in (300-500ms), scale-up (500-700ms)",
            "- Stagger: Lists and steps with 100-200ms delays between items",
            "- Emphasis: Pulse or glow effects on key statistics",
            "- Images: Always add ken-burns or parallax for movement",
            "- Total time: Keep all animations under 2 seconds"
        ])
    
    def _add_final_requirements(self, sections: List[str]):
        """Add final generation requirements."""
        sections.extend([
            "\n** FINAL DESIGN REQUIREMENTS - CHART-DOMINANT & VISUALLY IMPACTFUL:",
            "1. CHARTS FIRST: Include LARGE charts (800-1200px wide) whenever there's data",
            "2. CHART POSITION: Let charts OVERLAP with titles/text for modern design",
            "3. COMPONENTS: Use 8-12 components including BOTH Charts AND CustomComponents",
            "4. LAYOUT: Charts should occupy 60-80% of slide space",
            "5. SIZES: Titles 120-180pt, body 32-48pt, Charts 800x600 minimum",
            "6. CHART LABELS: Keep axis labels SMALL (12-16px) to emphasize data",
            "7. OVERLAPPING: Position text OVER chart areas with contrasting backgrounds",
            "8. COLORS: Use vibrant theme colors for chart data, subtle for labels",
            "9. DATA VISUALIZATION: Turn EVERY metric into a visual (chart or CustomComponent)",
            "10. WHITESPACE: Let charts breathe but dominate the visual hierarchy",
            "11. WARNING: MUST include Charts for ANY quantitative data",
            "12. GOAL: Data-rich slides where charts tell the story at a glance",
            "",
            "** 🎯 MANDATORY TEXT SPLITTING FOR VISUAL HIERARCHY:",
            "- CREATE 2-4 SEPARATE TiptapTextBlock components per slide",
            "- SPLIT titles: 'Welcome to' (small) + 'THE FUTURE' (massive)",
            "- SPLIT metrics: '340' (huge, accent) + '%' (medium) + 'growth' (small)",
            "- USE different sizes, colors, and positions for each block",
            "- POSITION blocks to create visual flow and emphasis",
            "- EXAMPLE: Title at top (180pt), key metric center (240pt), context bottom (36pt)",
            "",
            "** CRITICAL COMPONENT VALIDATION RULES:",
            "- Every component MUST have: id (string), type (string), props (object)",
            "- Props MUST match EXACT schema - no extra properties allowed",
            "- Background: if patternType used, ONLY 'dots'/'lines'/'checkered'/'grid' (NOT 'none')",
            "- Image: animationType must be 'none'/'fade-in'/'slide-up'/'slide-down'/'slide-left'/'slide-right'",
            "- Shape: shapeType must be exact ('rectangle', 'circle', 'arrow', etc.)",
            "- All positions/sizes must be numbers, not strings",
            "- Component IDs should be unique UUIDs",
            "",
            "AVOID: AVOID THESE COMMON MISTAKES:",
            "WRONG: Random decorative shapes without purpose",
            "WRONG: Harsh gradients with extreme color differences",
            "WRONG: Using all 5 colors chaotically",
            "WRONG: Overcrowded layouts with no breathing room",
            "WRONG: Shapes that don't contain or frame content",
            "",
            "CORRECT: BOLD DESIGN PATTERNS:",
            "✓ Clean text on DARK gradient backgrounds",
            "✓ Functional divider lines with glow effects",
            "✓ DRAMATIC gradients using theme background colors",
            "✓ Well-framed content with gradient containers",
            "✓ Bold color contrasts for maximum impact"
        ])
        
        # Add Background component rule - CRITICAL
        sections.append(
            "\n** BACKGROUND: Use BARELY noticeable corner gradients with ONE color only! Format: backgroundType: 'gradient', gradient: {type: 'radial', position: 'top-right', stops: [{color: primary_background, position: 0}, {color: 'barely 5% darker same color', position: 70}, {color: primary_background, position: 100}]} - SUBTLE corner fade only! Should be almost imperceptible!"
        )
        
        # Add emoji prohibition rule
        sections.append(
            "\n** CRITICAL RULE - NO EMOJIS: NEVER use emojis anywhere! No emojis in text, titles, CustomComponents, or anywhere else. Write professional content without emoji decorations."
        )
        
        # Add universal text formatting rule
        sections.append(
            "\n** UNIVERSAL TEXT FORMATTING RULE: Make ALL text BOLD and IMPACTFUL. Use fontWeight 600+ for body, 700+ for headers, 900 for hero text. Add color contrast, shadows, and spacing for visual hierarchy. Text should POP off the slide!"
        )
        
        # Add CustomComponent container safety rule
        sections.append(
            "\n** CUSTOMCOMPONENT CONTAINER RULE: ALWAYS add overflow: 'hidden' to the outermost container div to prevent any content from exceeding component boundaries. Use boxSizing: 'border-box' on all containers."
        )
    
    def _get_text_color(self, bg_color: str) -> str:
        """Determine text color based on background."""
        return '#FFFFFF' if self._is_dark_color(bg_color) else '#1A202C'
    
    def _is_dark_color(self, hex_color: str) -> bool:
        """Check if a hex color is dark."""
        try:
            hex_color = hex_color.lstrip('#')
            r, g, b = tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
            brightness = (r * 299 + g * 587 + b * 114) / 1000
            return brightness < 128
        except:
            return False
    
    def _format_chart_data(self, data: Any) -> str:
        """Format chart data for prompt."""
        if not data:
            return "No specific data provided - extract from slide content"
        
        # Format the data more clearly
        if hasattr(data, 'data') and isinstance(data.data, list):
            formatted = f"\nChart Type: {getattr(data, 'chartType', 'auto-detect')}\n"
            formatted += f"Data Points ({len(data.data)} items):\n"
            for item in data.data[:10]:  # Show first 10
                if isinstance(item, dict):
                    name = item.get('name', 'Unknown')
                    value = item.get('value', 0)
                    formatted += f"  - {name}: {value}\n"
            if len(data.data) > 10:
                formatted += f"  ... and {len(data.data) - 10} more items\n"
            return formatted
        
        return str(data)
    
    def _format_critical_rules(self, rules: Dict[str, Any], context: SlideGenerationContext) -> str:
        """Format critical rules for prompt."""
        if not rules:
            return ""
        
        sections = []
        
        # Add summary if present
        if 'summary' in rules:
            sections.append(f"** RULES SUMMARY: {rules['summary']}")
        
        # Format specific rule sections concisely
        for key, value in rules.items():
            if key == 'summary':
                continue
            
            if isinstance(value, dict):
                # Format as bullet points
                items = []
                for k, v in value.items():
                    if isinstance(v, str) and len(v) < 100:
                        items.append(f"• {k}: {v}")
                    elif isinstance(v, list) and len(v) <= 3:
                        items.append(f"• {k}: {', '.join(str(i) for i in v)}")
                
                if items:
                    sections.append(f"\n{key.upper().replace('_', ' ')}:\n" + '\n'.join(items[:5]))
            
            elif isinstance(value, list) and value:
                # Just show first few items
                sections.append(f"\n{key.upper().replace('_', ' ')}:\n" + '\n'.join(f"• {v}" for v in value[:3]))
        
        return '\n'.join(sections)
    
    def _format_component_schemas(self, schemas: Dict[str, Any], predicted: List[str]) -> str:
        """Format component schemas."""
        # Import here to avoid circular dependencies
        from agents.rag.schema_extractor import SchemaExtractor
        
        # Create schema extractor instance
        extractor = SchemaExtractor()
        
        # Format schemas for the predicted components
        return extractor.format_for_prompt(predicted)
    
    def _format_available_images(self, images: List[Dict[str, Any]]) -> str:
        """Format available images."""
        # Implementation would format images
        return str(images) 

    def _format_component_schema(self, component_name: str, schema: Dict) -> str:
        """Format a component schema for the prompt"""
        lines = [f"\n{component_name}:"]
        
        # Process properties
        props = schema.get('properties', {})
        for prop_name, prop_info in props.items():
            # Skip internal fields
            if prop_name.startswith('_'):
                continue
                
            # Format the property line
            line = f"  {prop_name}: "
            
            # Add type information
            prop_type = prop_info.get('type', 'any')
            if prop_type == 'array':
                items_type = prop_info.get('items', {}).get('type', 'any')
                line += f"[{items_type}]"
            elif prop_type == 'object':
                # Handle nested objects
                if 'properties' in prop_info:
                    nested_props = []
                    for nested_name, nested_info in prop_info['properties'].items():
                        nested_type = nested_info.get('type', 'any')
                        nested_props.append(f"{nested_name}: {nested_type}")
                    line += "{\n    " + "\n    ".join(nested_props) + "\n  }"
                else:
                    line += "object"
            else:
                line += prop_type
            
            # Add constraints and options
            constraints = []
            if 'min' in prop_info:
                constraints.append(f"min: {prop_info['min']}")
            if 'max' in prop_info:
                constraints.append(f"max: {prop_info['max']}")
            if 'options' in prop_info:
                options_str = " | ".join(str(opt) for opt in prop_info['options'])
                constraints.append(f"options: {options_str}")
            
            if constraints:
                line += f" ({', '.join(constraints)})"
                
            lines.append(line)
        
        return '\n'.join(lines) 