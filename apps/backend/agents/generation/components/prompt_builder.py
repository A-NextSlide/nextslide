"""
Prompt builder for slide generation.
"""

from typing import Dict, Any, List, Optional
import re
from agents.domain.models import SlideGenerationContext
from agents.prompts.generation.rag_system_prompt import get_rag_system_prompt
from agents.generation.components.prompt_compression import PromptCompressor
from agents.generation.slide_color_extractor import SlideColorExtractor
from setup_logging_optimized import get_logger
from services.user_info_service import get_user_info_service

logger = get_logger(__name__)


class SlidePromptBuilder:
    """Builds prompts for slide generation."""
    
    MAX_CONTEXT_CHARS = 32000  # ~8,000 tokens (reduced for better performance)
    
    def __init__(self):
        self.compressor = PromptCompressor()
        self.color_extractor = SlideColorExtractor()
        # Memoize deck-wide static prompt blocks so every slide reuses identical cached content
        self._static_block_cache: Dict[str, str] = {}
    
    def build_system_prompt(self) -> str:
        """Build the system prompt."""
        return get_rag_system_prompt()
    
    def build_user_prompt(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any],
        brand_logo_url: Optional[str] = None
    ) -> str:
        """Build the user prompt with RAG context."""
        # Compress RAG context first
        compressed_rag = self.compressor.compress_rag_context(rag_context)
        
        sections = []
        
        # Detect market sizing slides (TAM/SAM/SOM)
        is_market = self._is_market_sizing(
            getattr(context.slide_outline, 'title', ''),
            getattr(context.slide_outline, 'content', '')
        )
        
        # Add slide information
        self._add_slide_info(sections, context)
        
        # Add mandatory content
        self._add_mandatory_content(sections, context)
        
        # Add extracted Excel/data file content if available
        self._add_extracted_data_context(sections, context)
        
        # Add typography requirements
        self._add_typography_requirements(sections, context)
        
        # Add color palette (do not override canonical theme colors)
        self._add_color_palette(sections, context)

        # Add theme-driven structural guidance
        self._add_theme_structural_guidance(sections, context)

        # Add rich Tiptap formatting guidelines to avoid plain paragraphs
        self._add_rich_tiptap_formatting(sections, context)
        
        # Add chart data if present (skip for market sizing slides where we prefer concentric rings)
        # Only propose charts when clearly appropriate (business/data context with real quantitative signals)
        if context.has_chart_data and not is_market:
            try:
                topic_text = f"{getattr(context.slide_outline, 'title', '')} {getattr(context.slide_outline, 'content', '')}".lower()
                numeric_signal = bool(re.search(r"(\$\s?\d|\d{1,3}(,\d{3})+|\d+\s?%|%\s?\d+|\d+\s?(units|users|sales|m|k|b))", topic_text))
                business_terms = ['arr', 'mrr', 'kpi', 'revenue', 'budget', 'forecast', 'metric', 'metrics', 'trend', 'yoy', 'mom', 'growth', 'market share', 'conversion', 'distribution', 'breakdown']
                clearly_business = any(k in topic_text for k in business_terms)
                if getattr(context, 'user_requested_charts', False) or (numeric_signal and clearly_business):
                    self._add_chart_requirements(sections, context)
            except Exception:
                pass
        
        # Add compressed RAG context
        self._add_rag_context(sections, compressed_rag, context)

        # Add text-heavy layout guardrails (prevents central CustomComponents/stats on dense slides)
        if self._is_text_heavy(context, rag_context):
            self._add_text_heavy_layout_rules(sections)
        else:
            # Add split-screen guidance for chart + text slides
            try:
                wants_chart = bool(context.has_chart_data)
            except Exception:
                wants_chart = False
            if wants_chart:
                sections.extend([
                    "\nSPLIT-SCREEN CHART + TEXT (RECOMMENDED):",
                    "- Use LEFT column for text (x=80, width=840) and RIGHT column for chart (x=960, width=880).",
                    "- Start chart at y>=220 and keep ≥60px gap from top/title; text blocks stacked at y=200, 290, 380, etc.",
                    "- Maintain ≥60px padding around the chart; no overlaps with text or icons.",
                    "- If chart is tall (>600px), cap bottom at y<=960 to avoid footer collisions."
                ])
        
        # Add general component boundary rules
        self._add_component_boundary_rules(sections)
        
        # Add image instructions
        self._add_image_instructions(sections, context)
        
        # Add brand logo instructions if available
        if brand_logo_url:
            self._add_brand_logo(sections, brand_logo_url)
        
        # Market sizing specific guidance (TAM/SAM/SOM concentric rings)
        if is_market:
            self._add_market_sizing_guidance(sections, context)

        # Add final requirements
        self._add_final_requirements(sections, context)
        
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

    def build_user_prompt_blocks(
        self,
        context: SlideGenerationContext,
        rag_context: Dict[str, Any],
        brand_logo_url: Optional[str] = None
    ) -> tuple[str, str]:
        """Build deck-static and per-slide prompt blocks separately.

        Returns (static_block, slide_block).
        The static block contains deck-level, reusable guidance that should be identical across slides.
        The slide block contains per-slide details (title/content, RAG, charts, theme-structure, etc.).
        """
        # Prepare shared artifacts
        compressed_rag = self.compressor.compress_rag_context(rag_context)
        slide_sections: List[str] = []

        cache_key = self._get_static_block_key(context)
        static_block = self._static_block_cache.get(cache_key)
        if static_block is None:
            static_sections: List[str] = []

            # Heuristics: what is deck-static vs per-slide
            # Static deck guidance must be invariant across slides to leverage prompt caching
            try:
                self._add_mandatory_content(static_sections, context)
            except Exception:
                pass
            try:
                self._add_typography_requirements(static_sections, context)
            except Exception:
                pass
            try:
                # Static block should stay identical across slides to unlock Claude caching;
                # skip slide-specific palette heuristics here.
                self._add_color_palette(static_sections, context, include_slide_preferences=False)
            except Exception:
                pass
            try:
                self._add_rich_tiptap_formatting(static_sections, context)
            except Exception:
                pass
            try:
                self._add_component_boundary_rules(static_sections)
            except Exception:
                pass

            # Add deck-wide image guidance once (static)
            try:
                self._add_image_instructions(static_sections, context)
            except Exception:
                pass

            # Add brand logo instruction once per deck if available (static)
            try:
                if brand_logo_url:
                    self._add_brand_logo(static_sections, brand_logo_url)
            except Exception:
                pass

            # Add general final requirements once (static)
            try:
                self._add_final_requirements(static_sections, context)
            except Exception:
                pass

            # Move cookbook guidance to static (identical across slides in a deck)
            try:
                cookbook = rag_context.get('custom_component_cookbook', {}) or {}
                if cookbook:
                    static_sections.extend([
                        "\nCUSTOMCOMPONENT COOKBOOK (deck-level):",
                        f"Signature: {cookbook.get('signature', '')}",
                        "Golden rules:",
                        *[f"- {rule}" for rule in cookbook.get('golden_rules', [])[:8]],
                    ])
            except Exception:
                pass

            # Cache ALL component schemas and CustomComponent cookbook in the static block
            try:
                # Load all component names from SchemaExtractor
                from agents.rag.schema_extractor import SchemaExtractor
                extractor = SchemaExtractor()
                all_components = list(extractor.schemas.keys()) if extractor.schemas else []
                if all_components:
                    static_sections.append("\nCOMPONENT SCHEMAS (all components, critical props):")
                    static_sections.append(self._format_component_schemas({}, all_components))
            except Exception:
                pass

            static_block = '\n'.join(static_sections)
            self._static_block_cache[cache_key] = static_block
            try:
                import hashlib as _hashlib
                digest = _hashlib.sha1(static_block.encode('utf-8')).hexdigest()
            except Exception:
                digest = 'na'
            logger.info(
                f"[PROMPT BUILDER] static block built for {cache_key}: len={len(static_block)} chars sha1={digest}"
            )
        else:
            try:
                import hashlib as _hashlib
                digest = _hashlib.sha1(static_block.encode('utf-8')).hexdigest()
            except Exception:
                digest = 'na'
            logger.info(
                f"[PROMPT BUILDER] static block cache hit for {cache_key}: len={len(static_block)} chars sha1={digest}"
            )

        # Slide-specific details
        try:
            self._add_slide_info(slide_sections, context)
        except Exception:
            pass
        try:
            self._add_extracted_data_context(slide_sections, context)
        except Exception:
            pass
        # Theme structural guidance can vary per slide
        try:
            self._add_theme_structural_guidance(slide_sections, context)
        except Exception:
            pass
        # RAG context is per slide
        try:
            self._add_rag_context(slide_sections, compressed_rag, context)
        except Exception:
            pass
        try:
            # Slide-level color nudges should live outside the cached static prefix
            self._add_slide_color_preferences(slide_sections, context)
        except Exception:
            pass
        # Cookbook moved to static block to maximize cache reuse

        # Chart requirements (conditional per-slide)
        try:
            topic_text = f"{getattr(context.slide_outline, 'title', '')} {getattr(context.slide_outline, 'content', '')}".lower()
            numeric_signal = bool(re.search(r"(\$\s?\d|\d{1,3}(,\d{3})+|\d+\s?%|%\s?\d+|\d+\s?(units|users|sales|m|k|b))", topic_text))
            business_terms = ['arr', 'mrr', 'kpi', 'revenue', 'budget', 'forecast', 'metric', 'metrics', 'trend', 'yoy', 'mom', 'growth', 'market share', 'conversion', 'distribution', 'breakdown']
            clearly_business = any(k in topic_text for k in business_terms)
            if getattr(context, 'user_requested_charts', False) or (numeric_signal and clearly_business):
                self._add_chart_requirements(slide_sections, context)
        except Exception:
            pass

        # Text heavy layout rules
        try:
            if self._is_text_heavy(context, rag_context):
                self._add_text_heavy_layout_rules(slide_sections)
        except Exception:
            pass

        # Images and brand/logo moved to static block

        # Market sizing (per-slide)
        try:
            is_market = self._is_market_sizing(
                getattr(context.slide_outline, 'title', ''),
                getattr(context.slide_outline, 'content', '')
            )
            if is_market:
                self._add_market_sizing_guidance(slide_sections, context)
        except Exception:
            pass

        # Final requirements moved to static block

        slide_block = '\n'.join(slide_sections)

        return static_block, slide_block

    def _get_static_block_key(self, context: SlideGenerationContext) -> str:
        """Build a cache key for deck-static prompt content."""
        try:
            if getattr(context, 'deck_uuid', None):
                return f"deck:{context.deck_uuid}"
        except Exception:
            pass

        try:
            deck_outline = getattr(context, 'deck_outline', None)
            if deck_outline and getattr(deck_outline, 'deckId', None):
                return f"deck-outline:{deck_outline.deckId}"
        except Exception:
            pass

        # Final fallback to theme signature to keep cache deterministic within a deck run
        try:
            theme_signature = None
            if hasattr(context, 'theme') and context.theme:
                theme = context.theme
                if hasattr(theme, 'signature'):
                    theme_signature = getattr(theme, 'signature')
                elif isinstance(theme, dict):
                    theme_signature = theme.get('signature') or theme.get('id')
            if theme_signature:
                return f"theme:{theme_signature}"
        except Exception:
            pass

        # Fallback to process-unique placeholder
        return "deck:global"

    def _is_market_sizing(self, title: str, content: str) -> bool:
        """Detect TAM/SAM/SOM or market sizing intent."""
        blob = f"{title} {content}".lower()
        keywords = [
            'tam', 'sam', 'som', 'tam/sam/som',
            'market sizing', 'market size', 'market opportunity',
            'total addressable market', 'serviceable available market', 'serviceable obtainable market'
        ]
        return any(k in blob for k in keywords)

    def _is_text_heavy(self, context: SlideGenerationContext, rag_context: Dict[str, Any]) -> bool:
        """Heuristic: consider slide text-heavy if outline content length is large and predicted text blocks are many."""
        try:
            content = (getattr(context.slide_outline, 'content', '') or '').strip()
            title = (getattr(context.slide_outline, 'title', '') or '').strip()
            predicted = rag_context.get('predicted_components', []) or []
            text_like = sum(1 for c in predicted if c in ['TiptapTextBlock', 'TextBlock'])
            return (len(content) > 280 or len(title) > 80) and text_like >= 2
        except Exception:
            return False

    def _add_text_heavy_layout_rules(self, sections: List[str]) -> None:
        """On text-heavy slides, forbid central heavy components; prescribe side-panel/banners and icon+text adjacency."""
        sections.extend([
            "\nTEXT-HEAVY LAYOUT GUARDRAILS (STRICT):",
            "- DO NOT place CustomComponent, Chart, Table, or 'stats hero' centered. No central dominance.",
            "- Use split layout: LEFT column for text, RIGHT column for visualization (or the reverse).",
            "- SIDE PANEL (preferred): x=960, width=880, y in 260–880; keep ≥60px gaps to text.",
            "- NARROW BANNER (alternative): y>=640, height<=320; stretch width 1760; must not cover text.",
            "- If text and icon belong together, keep them on the same row; first shrink text width before any vertical move.",
            "- If overlap is inevitable, MOVE the visualization (CustomComponent/Chart/Image), NOT the text+icon pair.",
            "- Only use a centered CustomComponent if slide is METRIC-FOCUSED with minimal text (<=60 words).",
        ])

    def _add_market_sizing_guidance(self, sections: List[str], context: SlideGenerationContext) -> None:
        """Add explicit instructions to render market sizing as massive concentric rings."""
        sections.extend([
            "\nMARKET SIZING VISUALIZATION (TAM/SAM/SOM) — REQUIRED PATTERN:",
            "- DO NOT use a Chart for market sizing slides.",
            "- Use a CustomComponent that draws THREE MASSIVE CONCENTRIC RINGS (TAM outer, SAM middle, SOM inner).",
            "- The rings must be TRANSPARENT (no fill) with THICK borders and extend OUTSIDE the slide canvas so the bottom is CUT OFF.",
            "- Place the MARKET SIZE TEXT INSIDE each circle (centered), using huge typography for values and uppercase labels.",
            "- Full-canvas composition: position {x:0,y:0}, width:1920, height:1080.",
            "- Use theme colors for ring strokes with 30–60% opacity (e.g., '#RRGGBB55').",
            "- Ensure readability: textColor from theme, bold weights, and strong size contrast TAM > SAM > SOM.",
            "- Example props: { rings: [{label:'TAM', value:'$12.3B'}, {label:'SAM', value:'$4.8B'}, {label:'SOM', value:'$1.2B'}] }",
        ])

    def _add_theme_structural_guidance(self, sections: List[str], context: SlideGenerationContext) -> None:
        """Add structural guidance based on theme instructions."""
        
        # Get slide-specific structure from theme
        slide_structure = self._get_slide_structure_from_theme(context)
        
        if not slide_structure:
            # Fallback for title slides
            if getattr(context, 'is_title_slide', False):
                sections.extend([
                    "\nTITLE HIERARCHY (CREATIVE FREEDOM):",
                    "- Make the hero title MASSIVE: 220–360pt for typical titles; 300–600pt for single/short words",
                    "- Prefer increasing the text container WIDTH to keep fewer lines before shrinking font size",
                ])
            # Ensure brand presence even without structured theme: request a logo placeholder
            try:
                sections.extend([
                    "\nLOGO REQUIREMENT:",
                    "- Create Image component with src: 'placeholder'",
                    "- Position: x=80, y=1028; Size: width=80, height=24",
                    "- Use objectFit: 'contain'",
                    "- Bottom-left MICRO logo anchored to the slide bottom (footer zone), consistent across slides; sits left of sources",
                    "- Set props.metadata.kind = 'logo' so the system can inject the real logo URL later"
                ])
            except Exception:
                pass
            return
        
        slide_type = slide_structure.get('slide_type', 'content')
        elements = slide_structure.get('elements_to_include', [])
        positioning = slide_structure.get('positioning', {})
        styling = slide_structure.get('styling', {})
        
        sections.append(f"\n🏗️ THEME-DRIVEN STRUCTURE ({slide_type.upper()} SLIDE):")
        sections.append(f"Required elements: {', '.join(elements)}")
        
        # Add element-specific positioning instructions
        for element in elements:
            if element in positioning:
                element_pos = positioning[element]
                
                if element == 'slide_number':
                    pos = element_pos.get('position', {})
                    style = element_pos.get('style', {})
                    # Default to the actual two-digit slide number
                    try:
                        number_text = element_pos.get('text', f"{context.slide_index + 1:02d}")
                    except Exception:
                        number_text = element_pos.get('text', '01')
                    sections.extend([
                        f"\nSLIDE NUMBER REQUIREMENT:",
                        f"- Create TiptapTextBlock with text: '{number_text}'",
                        f"- Position: x={pos.get('x', 80)}, y={pos.get('y', 1020)}",
                        f"- Style: fontSize={style.get('fontSize', 20)}, opacity={style.get('opacity', 0.6)}, fontWeight='{style.get('fontWeight', '400')}'",
                        f"- Colors: Use theme text color with reduced opacity",
                        f"- Small and subtle in bottom left corner"
                    ])
                elif element == 'logo':
                    pos = element_pos.get('position', {})
                    size = element_pos.get('size', {})
                    sections.extend([
                        f"\nLOGO REQUIREMENT:",
                        f"- Create Image component with src: 'placeholder'",
                        f"- Position: x={pos.get('x', 80)}, y={pos.get('y', 1028)}",
                        f"- Size: width={size.get('width', 80)}, height={size.get('height', 24)}",
                        f"- Use objectFit: 'contain'",
                        f"- Bottom-left MICRO logo anchored to the slide bottom (footer zone), consistent across slides; sits left of sources",
                        f"- Set props.metadata.kind = 'logo' so the system can inject the real logo URL later"
                    ])
                elif element == 'subtitle':
                    y_offset = element_pos.get('y_offset', 40)
                    style = element_pos.get('style', {})
                    sections.extend([
                        f"\nSUBTITLE REQUIREMENT:",
                        f"- Create TiptapTextBlock for subtitle below main title",
                        f"- Position: {y_offset}px below title",
                        f"- Style: fontSize={style.get('fontSize', 32)}, opacity={style.get('opacity', 0.8)}, fontWeight='{style.get('fontWeight', '400')}'",
                        f"- Extract subtitle from content or create descriptive subtitle"
                    ])
                elif element == 'divider_line':
                    divider_pos = element_pos
                    start = divider_pos.get('startPoint', {})
                    end = divider_pos.get('endPoint', {})
                    style = divider_pos.get('style', {})
                    
                    # Use smart line color resolution
                    from agents.generation.components.smart_line_styler import SmartLineStyler
                    line_styler = SmartLineStyler()
                    divider_color = line_styler.resolve_line_color(
                        divider_pos, 
                        fallback_color='#2563EB'  # Blue fallback instead of grey
                    )
                    
                    sections.extend([
                        f"\n⚠️ THEME-REQUIRED DIVIDER LINE:",
                        f"- Create EXACTLY ONE Lines component as a divider",
                        f"- startPoint: {{x: {start.get('x', 80)}, y: {start.get('y', 160)}}}",
                        f"- endPoint: {{x: {end.get('x', 1840)}, y: {end.get('y', 160)}}}",
                        f"- Style properties:",
                        f"  * stroke: '{divider_color}'",
                        f"  * strokeWidth: {style.get('strokeWidth', 2)}",
                        f"  * opacity: {style.get('opacity', 0.3)}",
                        f"  * connectionType: 'straight'",
                        f"  * startShape: 'none', endShape: 'none'",
                        f"- Metadata: {{role: 'divider'}}",
                        f"- DO NOT create any other decorative lines"
                    ])
                elif element == 'sources':
                    pos = element_pos.get('position', {})
                    style = element_pos.get('style', {})
                    width = element_pos.get('width', 1680)
                    height = element_pos.get('height', 40)
                    # Build compact sources footer guidance
                    sections.extend([
                        f"\nSOURCES FOOTER (IF CITATIONS PRESENT):",
                        f"- Create TiptapTextBlock as a compact FOOTNOTE in the footer zone (bottom of SLIDE, not content)",
                        f"- Position: x={pos.get('x', 1240)}, y={pos.get('y', 1028)}; width={width if isinstance(width,int) else 600}; height={height if isinstance(height,int) else 32}",
                        f"- Style: fontSize={style.get('fontSize', 14)}, opacity={style.get('opacity', 0.7)}, alignment='right'",
                        f"- Text content: 'Sources: [1][2][3]' (use indices referenced in slide text)",
                        f"- Superscript style: render each [n] as its OWN texts[] segment with style.superscript=true and fontSize ≈ 0.8× footer font",
                        f"- Visual tone: muted color (70–80% opacity), tight tracking; no periods or extra separators",
                        f"- Set props.metadata.role = 'sources'",
                        f"- Add a THIN SHORT footer divider line above this area (Lines component, ~200–400px width, strokeWidth 1–2, opacity ~0.3) aligned to the right; set props.metadata.role='footer_divider'",
                        f"- Keep subtle, anchored to slide bottom-right, and ensure no overlap with other components"
                    ])
        
        # Add content area constraints
        if 'content_area' in positioning:
            content_area = positioning['content_area']
            spacing_type = content_area.get('spacing', 'relaxed')
            sections.extend([
                f"\nCONTENT AREA CONSTRAINTS:",
                f"- Available area: x={content_area.get('x', 80)}, y={content_area.get('y', 200)}",
                f"- Dimensions: width={content_area.get('width', 1760)}, height={content_area.get('height', 600)}",
                f"- Spacing style: {spacing_type}",
                f"- ALL content components must fit within this area",
                f"- Maintain proper gaps as defined by theme structure"
            ])
        
        # Add color guidance from theme
        if 'colors' in styling:
            colors = styling['colors']
            sections.extend([
                f"\nTHEME STRUCTURE COLORS:",
                f"- Title color: {colors.get('title_color', '#1A1A1A')}",
                f"- Subtitle color: {colors.get('subtitle_color', '#4A5568')}",
                f"- Number color: {colors.get('number_color', '#6B7280')}",
                f"- Divider color: {colors.get('divider_color', '#E5E7EB')}"
            ])

        # If content contains citation markers like [1], [2], enforce a sources footer even if theme didn't list it
        try:
            content_text = f"{getattr(context.slide_outline, 'title', '')} {getattr(context.slide_outline, 'content', '')}"
            if re.search(r"\[[1-9][0-9]*\]", content_text):
                pos = (positioning.get('sources') or {}).get('position', {}) if isinstance(positioning, dict) else {}
                sections.extend([
                    "\nCITATIONS DETECTED — ADD SOURCES FOOTER:",
                    f"- Create TiptapTextBlock at x={pos.get('x', 1240)}, y={pos.get('y', 1028)}, width=600, height=32",
                    "- Text: 'Sources: [1][2][3]' (match the indices used in bullets)",
                    "- Superscript style: make each [n] a separate texts[] segment with style.superscript=true and slightly smaller fontSize",
                    "- Style: fontSize=14, opacity=0.7, alignment='right'; set props.metadata.role='sources'",
                    "- Add a thin short footer divider line just above (Lines component, ~280px width, strokeWidth 1–2, opacity ~0.3) aligned to the right; set props.metadata.role='footer_divider'",
                    "- Place at the very bottom-right (footer zone of the SLIDE, not the content) and avoid overlaps"
                ])
        except Exception:
            pass
    
    def _get_slide_structure_from_theme(self, context: SlideGenerationContext) -> Optional[Dict[str, Any]]:
        """Extract slide structure instructions from theme."""
        
        try:
            # Get theme document
            theme = context.theme
            if hasattr(theme, 'slide_themes'):
                slide_themes = theme.slide_themes
            elif isinstance(theme, dict):
                slide_themes = theme.get('slide_themes', {})
            else:
                return None
            
            # Find structure for current slide
            slide_id = getattr(context.slide_outline, 'id', str(context.slide_index))
            
            if slide_id in slide_themes:
                return slide_themes[slide_id].get('structure')
            
            # Fallback to index-based lookup
            slide_index_str = str(context.slide_index)
            if slide_index_str in slide_themes:
                return slide_themes[slide_index_str].get('structure')
            
        except Exception as e:
            logger.warning(f"Failed to get slide structure from theme: {e}")
        
        return None

    
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
            "- Use charts SELECTIVELY only when quantitative data exists AND it's appropriate for the topic",
            "- For PERSONAL/CREATIVE and GENERAL/HOW-TO topics, avoid charts unless explicitly requested; keep content fun and practical",
            "",
            "** MANDATORY: You MUST include ALL text from the outline content verbatim on the slide.",
            "- The title should be prominently displayed",
            "- You may add additional text/UI, but do NOT remove, paraphrase, or omit any original sentences.",
            "- Split the original text across multiple TiptapTextBlocks and adjust sizes so everything fits visibly."
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
                    sections.append("If appropriate, visualize with a Chart. Otherwise prefer a concise Table, a CustomComponent metric row, or structured text bullets.")
                    sections.append("When using a chart, use the exact chart type and data format specified in the extracted data")
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
    
    def _add_typography_requirements(self, sections: List[str], context: SlideGenerationContext):
        """Add typography requirements from theme."""
        sections.append("\n** MANDATORY TYPOGRAPHY FROM THEME:")
        
        # Handle both dict and object themes
        if hasattr(context.theme, 'typography'):
            typography = context.theme.typography
        elif isinstance(context.theme, dict):
            typography = context.theme.get('typography', {})
        else:
            logger.warning(f"[PROMPT BUILDER] Theme missing typography. Theme type: {type(context.theme)}")
            typography = {}
        
        # Handle both nested and flat typography structures
        hero_font = (typography.get('hero_title', {}).get('family') or
                    typography.get('hero_font') or
                    'Montserrat')  # Better default than Inter
        body_font = (typography.get('body_text', {}).get('family') or
                    typography.get('body_font') or
                    'Poppins')  # Better default than Inter

        # Get sizes - use larger defaults for better presentation visibility
        hero_size = (typography.get('hero_title', {}).get('size') or
                    typography.get('hero_size') or
                    180)  # Increased from 96
        body_size = (typography.get('body_text', {}).get('size') or
                    typography.get('body_size') or
                    48)  # Increased from 36
        
        # Log what fonts we're using
        logger.info(f"[PROMPT BUILDER] Typography - Hero: {hero_font}, Body: {body_font}")
        
        sections.extend([
            f"HERO FONT (titles/headers): {hero_font}",
            f"BODY FONT (content/text): {body_font}",
            f"Hero default size: {hero_size}pt",
            f"Body default size: {body_size}pt"
        ])
        
        # Add text component rules
        sections.extend([
            "\n** CRITICAL TEXT COMPONENT RULES:",
            "1. EVERY TiptapTextBlock MUST have fontFamily set in props",
            "2. Text backgrounds must be TRANSPARENT: set backgroundColor '#00000000'",
            "3. Include ALL styling in props, not just in texts array",
            "4. Use textShadow for contrast: '2px 2px 4px rgba(0,0,0,0.3)'",
            "5. fontWeight must be 'normal' or 'bold' (NEVER numeric like 400/600/700)",
            "6. letterSpacing must be numeric (e.g., -0.02), NOT strings like '-0.02em'",
            "7. Set both root textColor and texts[].style.textColor",
            f"8. ** NEVER use 'Inter' as fontFamily! Use theme fonts: Hero='{hero_font}', Body='{body_font}'",
            "9. SIZE COMPONENTS BASED ON CONTENT LENGTH:",
            "   - Short text (1-3 words): width 300-600px, height 80-120px",
            "   - Medium text (4-15 words): width 400-800px, height 100-200px",
            "   - Long text (16-50 words): width 600-1000px, height 200-400px",
            "   - Very long text (50+ words): width 800-1200px, height 400-600px",
            "10. PREVENT OVERLAPS: Maintain 40px gaps between components, verify bounds",
            "11. MINIMUM FONT SIZES (CRITICAL - NEVER GO BELOW):",
            "    - Title slides main title: 180pt minimum, prefer 220-360pt",
            "    - Regular slide titles: 120pt minimum, prefer 140-180pt",
            "    - Subtitles/headings: 72pt minimum, prefer 80-120pt",
            "    - Body text: 36pt minimum, prefer 40-48pt",
            "    - Small text (footnotes): 14pt minimum",
            "    - NEVER use fontSize below 14 for any text component",
            "",
            "** 🔥 MANDATORY: CREATE MULTIPLE TEXT BLOCKS FOR EMPHASIS:",
            "- NEVER put all text in one TiptapTextBlock!",
            "- Split text into 2-4 blocks for visual hierarchy",
            "- Position them strategically for maximum impact",
            "- Example layout for 'Welcome to THE FUTURE':",
            "  * Block 1: 'Welcome to' at {x: 100, y: 200}, 36pt, opacity 0.8",
            "  * Block 2: 'THE FUTURE' at {x: 100, y: 280}, 280pt, accent color",
            "- Use different colors for each block to create contrast"
        ])
        
        # De-dup: Refer to central Tiptap section instead of repeating patterns/sizing here
        sections.append("\nSee 'TIPTAP RICH FORMATTING' section for patterns, sizing, and layout techniques.")

    def _add_rich_tiptap_formatting(self, sections: List[str], context: SlideGenerationContext) -> None:
        """Add prescriptive, high-impact Tiptap formatting patterns to avoid boring paragraphs."""
        sections.extend([
            "\n** TIPTAP RICH FORMATTING - NO BORING PARAGRAPHS:",
            "- NEVER return one big paragraph.",
            "- ALWAYS create 3+ TiptapTextBlock components per slide with extreme hierarchy.",
            "- Use different sizes, weights, and colors for emphasis vs. context.",
            "- Prefer headline + subheadline + emphasized stat/keyword layout.",
            "",
            "** INLINE SEGMENT STYLE (texts[].style) — USE AGGRESSIVELY:",
            "- Allowed keys: bold, italic, underline, strike, superscript, subscript, textColor, backgroundColor",
            "- Emphasize KEYWORDS and NUMBERS by splitting into segments and applying style.bold=true and accent textColor",
            "- Increase fontSize on emphasis segments; keep surrounding context smaller and lighter (opacity 0.7–0.85)",
            "- Keep backgroundColor transparent ('#00000000') for all text",
            "",
            "** ABSOLUTE LAYOUT RULES (MODEL MUST OBEY):",
            "- Coordinate system is TOP-LEFT for text placement.",
            "- Respect margins: left x >= 80, right edge <= 1840, top y >= 80.",
            "- Titles/subtitles belong in a header band (y between 60 and 220).",
            "- Main content STARTS at y >= 220. DO NOT place text below y 880.",
            "- Maintain vertical gaps: 40–60px between consecutive text blocks.",
            "- NO overlaps: Ensure each component's rectangle does not intersect others.",
            "- For each component, OUTPUT explicit props.position {x,y}, width, height.",
            "- When using multiple text blocks, distribute them top-down (no bottom stacking).",
            "- If a hero visual exists, size/place it so text remains readable and non-overlapping.",
            "",
            "** HEIGHT-AWARE TEXT RULES (CRITICAL):",
            "- Small text blocks (height < 140px): enforce SINGLE-LINE text (no manual line breaks).",
            "- Multi-line text requires computed height: height >= fontSize × lines × 1.3 plus 10–20% buffer.",
            "- If text would wrap in a small box, do ONE of:",
            "  a) Increase the block height to the required multi-line height, OR",
            "  b) Split content into multiple shorter TiptapTextBlocks stacked with 40–60px gaps, OR",
            "  c) Reduce line breaks by making the sentence more concise.",
            "- Do NOT embed newline characters in texts[].text when height < 140px — use separate blocks instead.",
            "",
            "** TONE & MATURITY (match the request):",
            "- BUSINESS/SALES: crisp, outcome-driven, persuasive; use data only when real and relevant",
            "- EDUCATIONAL/TRAINING: clear, friendly, stepwise; examples and checks for understanding",
            "- GENERAL/PERSONAL/HOW-TO (e.g., recipes, hobbies): human, fun, sensory, practical; avoid stats/charts unless asked",
            "",
            "** REQUIRED TIPTAPTEXTBLOCK PROPS (FOR EACH BLOCK):",
            "- fontFamily (use theme hero/body)",
            "- fontWeight ('bold' for emphasis; 'normal' for context) — NEVER numeric",
            "- letterSpacing (-0.02 for big text; numeric value, not string)",
            "- lineHeight (1.0–1.2 for large headings, 1.3–1.4 for body)",
            "- textShadow (e.g., '0 4px 24px rgba(0,0,0,0.25)' for pop)",
            "- opacity (1 for most titles, 0.8–0.9 for subtle subtitle)",
            "- rotation (0)",
            "- zIndex (>= 1 to appear above background)",
            "- alignment ('left'|'center'|'right') and verticalAlignment ('top'|'middle'|'bottom')",
            "- backgroundColor '#00000000' (transparent)",
            "- textColor (root prop) and texts[].style.textColor for segments",
            "",
            "** READY-TO-USE PATTERNS (MUST USE AT LEAST ONE):",
            "PATTERN A – SMALL INTRO + MASSIVE HEADLINE (USE THESE EXACT SIZES):",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 100,'y': 120}, 'width': 1720, 'height': 80, 'texts': [ { 'text': 'Introducing', 'fontSize': 48, 'fontWeight': '400', 'opacity': 0.75 } ] } }",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 100,'y': 200}, 'width': 1720, 'height': 360, 'texts': [ { 'text': 'REVOLUTIONARY INSIGHTS', 'fontSize': 240, 'fontWeight': '900' } ] } }",
            "",
            "PATTERN B – SPLIT METRIC (Number/Unit/Label):",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 1200,'y': 360}, 'width': 600, 'height': 420, 'texts': [ { 'text': '340', 'fontSize': 240, 'fontWeight': '900' }, { 'text': '%', 'fontSize': 120, 'fontWeight': '800' }, { 'text': 'growth rate', 'fontSize': 36, 'fontWeight': '500', 'opacity': 0.7 } ], 'alignment': 'center', 'verticalAlignment': 'middle' } }",
            "",
            "PATTERN C – KEYWORD EMPHASIS IN SENTENCE:",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 120,'y': 540}, 'width': 1680, 'height': 160, 'texts': [ { 'text': 'We achieved ', 'fontSize': 40, 'fontWeight': '400' }, { 'text': 'BREAKTHROUGH', 'fontSize': 88, 'fontWeight': '900' }, { 'text': ' results', 'fontSize': 40, 'fontWeight': '400' } ] } }",
            "",
            "PATTERN D – INLINE CITATION MARKERS (SUPERSCRIPT):",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 120,'y': 720}, 'width': 1680, 'height': 120, 'texts': [ { 'text': 'Renewables provided ', 'fontSize': 40, 'fontWeight': '400' }, { 'text': '48', 'fontSize': 96, 'fontWeight': '900' , 'style': {'textColor': '{accent_1}', 'bold': true} }, { 'text': '%', 'fontSize': 56, 'fontWeight': '800' }, { 'text': ' of EU electricity in 2023', 'fontSize': 40, 'fontWeight': '400' }, { 'text': ' [1]', 'fontSize': 32, 'fontWeight': '400', 'style': {'superscript': true, 'textColor': '{primary_text}', 'backgroundColor': '#00000000'} } ] } }",
            "",
            "PATTERN E – ICON + LABEL (NO BULLET CHARACTERS IN TEXT):",
            "// Create an Icon component and a TiptapTextBlock label; ensure 16–20px gap and vertical centering",
            "{ 'type': 'Icon', 'props': { 'position': {'x': 100, 'y': 860}, 'width': 28, 'height': 28, 'iconLibrary': 'lucide', 'iconName': 'check-circle', 'color': '{accent_1}' } }",
            "{ 'type': 'TiptapTextBlock', 'props': { 'position': {'x': 132, 'y': 852}, 'width': 1568, 'height': 44, 'alignment': 'left', 'verticalAlignment': 'middle', 'texts': [ { 'text': 'Verified with customer data', 'fontSize': 40, 'fontWeight': '600' } ] } }",
            "",
            "** KEYWORD EMPHASIS (REQUIRED):",
            "- In EVERY TiptapTextBlock, emphasize 1–3 KEY segments (numbers, percentages, currency, named entities)",
            "- For each emphasized segment: set style.bold=true, style.textColor=accent_1, and increase fontSize ≥ 1.5× surrounding text",
            "- Split numbers and units: number gets larger size + accent color; unit smaller (0.5–0.7×) next to it",
            "- Keep surrounding context at lower opacity (0.7–0.85) to enhance contrast",
            "- Do NOT over-emphasize: keep emphasized characters ≤ 40% of the total text",
            "- CRITICAL: DO NOT include newline characters (\\n) in texts[].text segments - all segments should flow inline",
            "- Each texts[] array element is rendered inline with others; use separate TiptapTextBlocks for separate lines",
            "",
            "** COLOR USAGE:",
            "- Emphasis words use accent_1/accent_2 colors.",
            "- Context uses primary_text at 70–85% opacity.",
            "- Never color full paragraphs; only emphasize key words/metrics.",
            "",
            "** CITATIONS & SOURCES:",
            "- Inline [n] markers MUST be separate segments with style.superscript=true and slightly smaller fontSize",
            "- The Sources footer should render [1][2][3] as superscripts (each its own segment)",
            "",
            "** ICON + TEXT ADJACENCY (BULLET-STYLE ROWS; OPTIONAL):",
            "- Do NOT add icons to every text block; use only when they add clarity",
            "- If adding an Icon next to a text label, DO NOT include any bullet characters ('•', '-', '*') in the text",
            "- Place Icon to the LEFT of the text with a 16–20px gap; vertically center Icon to the text block",
            "- Set the text block verticalAlignment='middle' and alignment='left' to align baseline visually",
            "- Keep icon sizes 22–28px for standard rows; ensure colors follow theme",
            "",
            "** DO NOT:",
            "- Do not create a single TiptapTextBlock with long paragraph text.",
            "- Do not use backgroundColor for text blocks (transparent backgrounds only).",
            "- Do not mix all text in the same size; hierarchy is mandatory.",
            "- Do NOT output placeholder strings like 'New Text', 'Text', 'Your text here'."
        ])
    
    def _add_color_palette(
        self,
        sections: List[str],
        context: SlideGenerationContext,
        include_slide_preferences: bool = True,
        include_theme_palette: bool = True
    ):
        """Add color palette information."""
        palette = context.palette or {}
        
        # Extract color preferences from slide content, but only use when theme is not canonical
        if include_slide_preferences:
            slide_color_prefs = self.color_extractor.extract_color_preferences(
                context.slide_outline.content,
                context.slide_outline.title
            )
        else:
            slide_color_prefs = {
                'has_color_request': False,
                'color_instruction': None
            }
        
        # Handle both dict and object themes for color palette
        if hasattr(context.theme, 'color_palette'):
            theme_colors = context.theme.color_palette
        elif isinstance(context.theme, dict):
            theme_colors = context.theme.get('color_palette', {})
        else:
            logger.warning(f"[PROMPT BUILDER] Theme missing color_palette. Theme type: {type(context.theme)}")
            theme_colors = {}
        
        # Log what we received (redact large metadata like embeddings)
        def _redact_embeddings(obj: Dict[str, Any]) -> Dict[str, Any]:
            try:
                red = dict(obj or {})
                meta = red.get('metadata')
                if isinstance(meta, dict):
                    for key in list(meta.keys()):
                        if key.lower() in ['embedding', 'embeddings']:
                            meta[key] = '[redacted]'
                        else:
                            val = meta.get(key)
                            if isinstance(val, list) and len(val) > 64:
                                meta[key] = '[list redacted]'
                            elif isinstance(val, str) and len(val) > 2048:
                                meta[key] = '[string redacted]'
                    red['metadata'] = meta
                return red
            except Exception:
                return obj

        safe_theme_log = _redact_embeddings(theme_colors) if isinstance(theme_colors, dict) else theme_colors
        safe_palette_log = _redact_embeddings(palette) if isinstance(palette, dict) else palette
        logger.info(f"[PROMPT BUILDER] Theme colors received: {safe_theme_log}")
        logger.info(f"[PROMPT BUILDER] Palette received: {safe_palette_log}")
        # Determine sources for precedence rules
        try:
            palette_source = str((palette or {}).get('source', '')).lower() if isinstance(palette, dict) else ''
        except Exception:
            palette_source = ''
        try:
            theme_source = str((theme_colors or {}).get('source', '')).lower() if isinstance(theme_colors, dict) else ''
        except Exception:
            theme_source = ''
        is_db_palette = palette_source in ['database', 'palette_db', 'topic match']
        is_brand_palette = any(k in palette_source for k in ['brand', 'brandfetch'])
        is_brand_theme = any(k in theme_source for k in ['brand', 'brandfetch'])
        
        # Prefer true database palettes only when source indicates DB AND theme is not brand-sourced
        prefer_db = is_db_palette and not (is_brand_theme or is_brand_palette)
        if include_theme_palette and prefer_db and (palette.get('colors') and isinstance(palette.get('colors'), list)):
            logger.info(f"[PROMPT BUILDER] 🎨 Using DATABASE palette: {palette.get('name')}")
            logger.info(f"[PROMPT BUILDER] Database colors: {palette.get('colors')}")
            
            # Use database colors preferentially
            db_colors = palette.get('colors', [])
            # Choose accents from DB using colorfulness & avoid pure black/white
            def _rgb_tuple(hex_str: str):
                s = hex_str.lstrip('#')
                return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16))
            def _colorfulness(hex_str: str) -> float:
                r, g, b = _rgb_tuple(hex_str)
                return max(abs(r-g), abs(g-b), abs(b-r)) / 255.0
            def _is_extreme_brightness(hex_str: str) -> bool:
                b = self._estimate_brightness(hex_str)
                return b < 0.12 or b > 0.92
            if db_colors:
                scored = [
                    (
                        _colorfulness(c),
                        -abs(self._estimate_brightness(c) - 0.5),
                        c
                    ) for c in db_colors if not _is_extreme_brightness(c)
                ]
                if not scored:
                    scored = [(_colorfulness(c), -abs(self._estimate_brightness(c) - 0.5), c) for c in db_colors]
                scored.sort(reverse=True)
                if scored:
                    primary_accent = scored[0][2]
                    secondary_accent = scored[1][2] if len(scored) > 1 else scored[0][2]
                    logger.info(f"[PROMPT BUILDER] Using DB accents (scored): {primary_accent}, {secondary_accent}")
            
            # Always choose background from DB palette to reflect DB choice (skip pure white by default unless requested)
            if db_colors:
                try:
                    # If the slide explicitly asks for a white background, honor it when requested
                    if include_slide_preferences:
                        combined_text = f"{context.slide_outline.title} {context.slide_outline.content}".lower()
                        explicit_white = ('white background' in combined_text) or ('white bg' in combined_text)
                    else:
                        explicit_white = False
                    def _is_near_white(hex_color: str) -> bool:
                        try:
                            s = str(hex_color or '').strip().lower()
                            if s in ['#fff', '#ffffff']:
                                return True
                            return self._estimate_brightness(hex_color) > 0.97
                        except Exception:
                            return False
                    sorted_by_brightness = sorted(db_colors, key=lambda c: self._estimate_brightness(c), reverse=True)
                    if explicit_white:
                        # Prefer true white if present, else the lightest
                        whites = [c for c in sorted_by_brightness if _is_near_white(c)]
                        bg_color = (whites[0] if whites else sorted_by_brightness[0])
                    else:
                        non_white_candidates = [c for c in sorted_by_brightness if not _is_near_white(c)]
                        bg_color = (non_white_candidates[0] if non_white_candidates else sorted_by_brightness[0])
                    logger.info(f"[PROMPT BUILDER] Using DB-derived background (non-white preferred): {bg_color}")
                except Exception as e:
                    logger.warning(f"[PROMPT BUILDER] Failed to derive bg from DB palette: {e}")
                    bg_color = db_colors[0]
            else:
                # Final fallback to light background to avoid black bias
                bg_color = '#F8F9FA'
                
            # If gradients are present in palette, instruct gradient background
            gradients = palette.get('gradients') or []
            if gradients:
                sections.extend([
                    "\n BACKGROUND STYLE (GRADIENT PREFERRED):",
                    f"- Use linear gradient from palette: {gradients[0]}"
                ])

        elif include_theme_palette:
            # Get colors with better fallback handling
            bg_color = theme_colors.get('primary_background')
            if not bg_color:
                # Prefer light backgrounds from palette if present
                if palette.get('backgrounds'):
                    try:
                        bg_candidates = palette.get('backgrounds')
                        bg_color = sorted(bg_candidates, key=lambda c: self._estimate_brightness(c), reverse=True)[0]
                    except Exception as e:
                        logger.warning(f"[PROMPT BUILDER] Failed to pick light bg from palette.backgrounds: {e}")
                        bg_color = palette.get('backgrounds', ['#F8F9FA'])[0]
                else:
                    bg_color = '#F8F9FA'
                logger.warning(f"[PROMPT BUILDER] No primary_background in theme, using: {bg_color}")
                
            primary_accent = theme_colors.get('accent_1')
            if not primary_accent:
                # Avoid defaulting to blue - use varied colors
                default_accents = ['#10b981', '#dc2626', '#f59e0b', '#7c3aed', '#0891b2']
                palette_colors = palette.get('colors') if isinstance(palette.get('colors'), list) else None
                if palette_colors and len(palette_colors) > 0:
                    primary_accent = palette_colors[0]
                else:
                    # Use deterministic fallback instead of random choice so cached block stays stable
                    primary_accent = default_accents[0]
                logger.warning(f"[PROMPT BUILDER] No accent_1 in theme, using: {primary_accent}")

            secondary_accent = theme_colors.get('accent_2')
            if not secondary_accent:
                palette_colors = palette.get('colors') if isinstance(palette.get('colors'), list) else None
                if palette_colors and len(palette_colors) > 1:
                    secondary_accent = palette_colors[1]
                else:
                    # Use a complementary color to primary accent
                    secondary_accent = '#f97316' if primary_accent != '#f59e0b' else '#a855f7'
                logger.warning(f"[PROMPT BUILDER] No accent_2 in theme, using: {secondary_accent}")
            
        # Get text colors from palette if available, otherwise calculate
        if include_theme_palette and palette.get('text_colors'):
            text_color = palette['text_colors'].get('primary', self._get_text_color(bg_color))
            text_on_accent1 = palette['text_colors'].get('on_accent_1', '#FFFFFF')
            text_on_accent2 = palette['text_colors'].get('on_accent_2', '#FFFFFF')
        elif include_theme_palette:
            # Prefer theme-defined text colors if provided by normalization
            text_color = theme_colors.get('primary_text') or self._get_text_color(bg_color)
            text_on_accent1 = theme_colors.get('on_accent_1', self._get_text_color(primary_accent))
            text_on_accent2 = theme_colors.get('on_accent_2', self._get_text_color(secondary_accent))

        # Add slide-specific color instruction only if we DO NOT already have a canonical theme
        # Canonical = theme provides primary_background, accent_1, accent_2
        try:
            has_canonical_theme = (
                isinstance(theme_colors, dict)
                and bool(theme_colors.get('primary_background'))
                and bool(theme_colors.get('accent_1'))
                and bool(theme_colors.get('accent_2'))
            )
        except Exception:
            has_canonical_theme = False

        if include_slide_preferences and slide_color_prefs['has_color_request'] and slide_color_prefs['color_instruction']:
            if not has_canonical_theme:
                sections.extend([
                    f"\n⚠️ SLIDE-SPECIFIC COLOR REQUEST:",
                    f"{slide_color_prefs['color_instruction']}",
                    "",
                    "The user has requested specific colors for this slide.",
                    "Please generate appropriate colors based on their request while maintaining readability.",
                    ""
                ])
                search_query = self.color_extractor.get_palette_search_query(slide_color_prefs)
                if search_query:
                    sections.append(f"Consider colors matching: {search_query}")
                    sections.append("")
            else:
                # Theme is canonical; record that we are ignoring slide-specific color hints to preserve theme
                logger.info("[PROMPT BUILDER] Ignoring slide-specific color hints to preserve canonical theme")

        if include_theme_palette:
            sections.extend([
                f"\n COLOR PALETTE WITH PROPER CONTRAST:",
                f"BACKGROUND: {bg_color}",
                f"PRIMARY ACCENT: {primary_accent}",
                f"SECONDARY ACCENT: {secondary_accent}",
                f"TEXT ON BACKGROUND: {text_color} (contrast-checked)",
                f"TEXT ON ACCENT 1: {text_on_accent1}",
                f"TEXT ON ACCENT 2: {text_on_accent_2 if (text_on_accent_2:=text_on_accent2) else text_on_accent2}",
                "",
                "IMPORTANT: Prefer solid colored or gradient backgrounds from the palette over plain white unless the user explicitly requests white."
            ])

            # Add design tokens and variable elements from theme (for consistent application across slides)
            design_tokens = {}
            try:
                if hasattr(context.theme, 'visual_effects') and isinstance(context.theme.visual_effects, dict):
                    design_tokens = context.theme.visual_effects.get('design_tokens', {}) or {}
            except Exception:
                design_tokens = {}

            if design_tokens:
                dt_lines = ["\n DESIGN TOKENS (apply consistently across slides):"]
                for k in ['corner_radius', 'grid_gap', 'shadow', 'card_bg', 'stroke_width', 'animation_speed']:
                    if k in design_tokens:
                        dt_lines.append(f"- {k}: {design_tokens[k]}")
                if len(dt_lines) > 1:
                    sections.extend(dt_lines)

    def _add_slide_color_preferences(self, sections: List[str], context: SlideGenerationContext) -> None:
        """Add slide-level color overrides without polluting the cached static prompt."""
        try:
            slide_color_prefs = self.color_extractor.extract_color_preferences(
                context.slide_outline.content,
                context.slide_outline.title
            )
        except Exception:
            return

        if not slide_color_prefs.get('has_color_request') or not slide_color_prefs.get('color_instruction'):
            return

        # Respect canonical themes by default so palette stays consistent across deck
        if hasattr(context.theme, 'color_palette'):
            theme_colors = context.theme.color_palette
        elif isinstance(context.theme, dict):
            theme_colors = context.theme.get('color_palette', {})
        else:
            theme_colors = {}

        has_canonical_theme = (
            isinstance(theme_colors, dict)
            and bool(theme_colors.get('primary_background'))
            and bool(theme_colors.get('accent_1'))
            and bool(theme_colors.get('accent_2'))
        )

        if has_canonical_theme:
            logger.info("[PROMPT BUILDER] Ignoring slide-specific color hints to preserve canonical theme")
            return

        sections.extend([
            "\n⚠️ SLIDE-SPECIFIC COLOR REQUEST:",
            slide_color_prefs['color_instruction'],
            "",
            "The user has requested specific colors for this slide.",
            "Please generate appropriate colors based on their request while maintaining readability.",
            ""
        ])

        search_query = self.color_extractor.get_palette_search_query(slide_color_prefs)
        if search_query:
            sections.append(f"Consider colors matching: {search_query}")
            sections.append("")
    
    def _add_chart_requirements(self, sections: List[str], context: SlideGenerationContext):
        """Add chart requirements if data is present."""
        sections.extend([
            f"\nCHART OPPORTUNITY (only if appropriate):",
            "If this topic is BUSINESS/DATA or the user explicitly asked for charts, create a Chart component with this data:",
            self._format_chart_data(context.slide_outline.extractedData),
            "Use the EXACT data provided above. Do NOT invent values.",
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
        # Ensure required component types for theme-required elements are present
        try:
            slide_structure = self._get_slide_structure_from_theme(context)
            if slide_structure:
                els = slide_structure.get('elements_to_include', []) or []
                if 'divider_line' in els and 'Lines' not in predicted:
                    predicted.append('Lines')
                if 'logo' in els and 'Image' not in predicted:
                    predicted.append('Image')
                if any(e in els for e in ['slide_number', 'subtitle', 'sources']) and 'TiptapTextBlock' not in predicted:
                    predicted.append('TiptapTextBlock')
        except Exception:
            pass
        # If we have tabular data, ensure Table is listed; else ensure Chart when chart data exists
        if getattr(context, 'has_tabular_data', False):
            if 'Table' not in predicted:
                predicted.append('Table')
        elif context.has_chart_data and 'Chart' not in predicted:
            # Predict Chart only when there are clear quantitative signals AND business/data intent, or explicitly requested
            topic_text = f"{context.slide_outline.title} {context.slide_outline.content}".lower()
            numeric_signal = bool(re.search(r"(\$\s?\d|\d{1,3}(,\d{3})+|\d+\s?%|%\s?\d+)", topic_text))
            business_terms = ['arr', 'mrr', 'kpi', 'revenue', 'budget', 'forecast', 'metrics', 'trend', 'growth', 'market share']
            if getattr(context, 'user_requested_charts', False) or (numeric_signal and any(k in topic_text for k in business_terms)):
                predicted.append('Chart')

        # Promote CustomComponent for structured or creative visuals (processes, comparisons, timelines, hero stats)
        try:
            topic_text_cc = f"{context.slide_outline.title} {context.slide_outline.content}".lower()
            cc_triggers = ['process', 'step', 'steps', 'timeline', 'roadmap', 'flow', 'comparison', ' vs ', ' versus ', 'pillars', 'principles', 'framework', 'strategy', 'highlight', 'hero', 'kpi', 'metric']
            has_numbers_not_chart = bool(re.search(r"\b\d+\b", topic_text_cc)) and 'Chart' not in predicted
            if 'CustomComponent' not in predicted and (any(k in topic_text_cc for k in cc_triggers) or has_numbers_not_chart):
                predicted.append('CustomComponent')
        except Exception:
            pass

        # Promote ReactBits for modern, animated, and visually engaging presentations
        try:
            topic_text_rb = f"{context.slide_outline.title} {context.slide_outline.content}".lower()
            # ReactBits triggers for text animations
            text_animation_triggers = ['animate', 'animated', 'dynamic', 'modern', 'interactive', 'engaging', 'stunning']
            # Background animation triggers
            background_triggers = ['backdrop', 'background', 'atmosphere', 'ambience', 'visual effect']
            # Title/hero slide indicators
            is_title_slide = context.slide_index == 0 or any(k in topic_text_rb for k in ['introduction', 'welcome', 'title', 'cover'])

            if 'ReactBits' not in predicted:
                # Add ReactBits for title slides or slides with animation keywords
                if is_title_slide or any(k in topic_text_rb for k in text_animation_triggers + background_triggers):
                    predicted.append('ReactBits')
        except Exception:
            pass

        sections.append(f"\nCOMPONENTS TO USE: {', '.join(predicted)}")
        
        # Add specific Chart component instructions if predicted and not tabular
        if "Chart" in predicted and not getattr(context, 'has_tabular_data', False):
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
            "POSITION: Charts must NOT overlap other components (titles/text/images)",
            "LABELS: Keep axis labels SMALL (12-16px) to emphasize data; rotate bottom axis labels 30–45° when long to avoid overlap/cropping",
            "AXIS CONFIG: Set axisBottom.tickRotation appropriately and increase margins.bottom as needed (Highcharts: xAxis.labels.rotation and chart.marginBottom; allow xAxis.labels.autoRotation for dense labels)",
            "DATA: Make bars/lines THICK and BOLD with vibrant colors",
            "LAYOUT: Position charts to dominate 60-80% of slide space without collisions",
            "NO OVERLAP: Maintain 60px gap around charts; 40px for text blocks",
            "",
            "EXAMPLE NON-OVERLAPPING LAYOUT:",
            "- Title at {x: 100, y: 50} with chart below starting after title height + gap",
            "- Text components placed beside or below chart with required gaps"
            ])

        # Add specific ReactBits component instructions if predicted
        if "ReactBits" in predicted:
            sections.extend([
                "\n REACTBITS COMPONENT — ANIMATED MODERN COMPONENTS:",
                "ReactBits provides 26+ animated components for stunning, modern presentations.",
                "",
                "REACTBITS STRUCTURE:",
                '{"type": "ReactBits", "props": {"reactBitsId": "component-id", "position": {"x": 100, "y": 200}, "width": 800, "height": 400, ...component-specific-props}}',
                "",
                "AVAILABLE REACTBITS COMPONENTS:",
                "",
                "TEXT ANIMATIONS (9 components):",
                "  - blur-text: Blur-to-sharp reveal effect. Props: text, delay, animateBy ('words'|'characters'), direction, className",
                "  - count-up: Animated number counter. Props: to, from, duration, separator, className",
                "  - glitch-text: Cyberpunk RGB split effect. Props: text, className",
                "  - gradient-text: Animated rainbow gradient text. Props: text, colors (array of 3), speed, className",
                "  - scrambled-text: Matrix-style decrypt animation. Props: text, speed, className",
                "  - typewriter-text: Classic typing effect. Props: text, speed, showCursor, cursorColor, className",
                "  - neon-text: Glowing neon effect. Props: text, glowColor, intensity, flicker, className",
                "  - shiny-text: Shimmering highlight effect. Props: text, shimmerColor, speed, className",
                "  - rotating-text: Rotates through phrases. Props: words (comma-separated), interval, className",
                "",
                "BACKGROUNDS (9 components) — use these sparingly, only for title/hero slides:",
                "  - aurora: Northern lights gradient. Props: color1, color2, color3, speed, amplitude",
                "  - particles: 3D floating particles. Props: particleCount, colors (array), speed, spread",
                "  - waves: Smooth SVG wave animation. Props: waveColor, opacity, speed, amplitude",
                "  - dots-pattern: Animated dot grid. Props: dotColor, dotSize, spacing, animate",
                "  - gradient-mesh: Blurred mesh gradient. Props: color1, color2, color3, speed, blur",
                "  - starfield: Twinkling stars. Props: starCount, starColor, speed, twinkle",
                "  - beams: Animated light beams. Props: beamColor, beamCount, speed, opacity",
                "  - ripple-grid: Grid with ripple effects. Props: gridColor, rippleColor, cellSize, speed",
                "",
                "INTERACTIVE COMPONENTS (5 components):",
                "  - click-spark: Radial spark particles on click. Props: sparkColor, sparkSize, sparkCount, radius",
                "  - blob-cursor: Smooth blob cursor trail. Props: fillColor, size",
                "  - magic-bento: Interactive grid with spotlight. Props: enableSpotlight, enableStars, glowColor, particleCount",
                "  - carousel: Image carousel with controls. Props: images (array of URLs), autoplay, delay, loop",
                "  - spotlight-card: Card with spotlight on hover. Props: title, content, spotlightColor, width",
                "  - magnet: Magnetic hover effect. Props: text, magnetStrength, className",
                "  - dock: macOS-style dock. Props: iconCount, iconSize, magnification",
                "",
                "REACTBITS USAGE GUIDELINES:",
                "1. WHEN TO USE:",
                "   - Title/hero slides: Use TEXT ANIMATIONS for impactful titles (gradient-text, neon-text, glitch-text)",
                "   - Title slides only: BACKGROUND animations (aurora, starfield, particles) for atmosphere",
                "   - Interactive presentations: Use INTERACTIVE components (click-spark, blob-cursor, spotlight-card)",
                "   - Modern aesthetics: When slide content mentions 'animated', 'dynamic', 'modern', 'engaging'",
                "",
                "2. BEST PRACTICES:",
                "   - Text animations: Use on main titles or key phrases. Set width/height to fit text comfortably.",
                "   - Background components: ONLY on title/hero slides. Position at x=0, y=0, width=1920, height=1080 for full coverage.",
                "   - Interactive components: Perfect for engagement-focused slides. Size appropriately (400-800px typical).",
                "   - Combine wisely: gradient-text on aurora background for stunning title slides.",
                "",
                "3. SIZING:",
                "   - Text animations: width 400-1200px, height 80-300px depending on text length and font size",
                "   - Backgrounds: Always full-screen (x=0, y=0, width=1920, height=1080)",
                "   - Interactive: 300-800px typical, centered or positioned strategically",
                "",
                "4. EXAMPLES:",
                '   Title with gradient animation: {"type":"ReactBits","props":{"reactBitsId":"gradient-text","position":{"x":200,"y":300},"width":1520,"height":200,"text":"Stunning Presentations","colors":["#6366f1","#a855f7","#ec4899"],"speed":3,"className":"text-8xl font-bold"}}',
                '   Starfield background: {"type":"ReactBits","props":{"reactBitsId":"starfield","position":{"x":0,"y":0},"width":1920,"height":1080,"starCount":200,"starColor":"#ffffff","speed":0.5,"twinkle":true}}',
                '   Typewriter subtitle: {"type":"ReactBits","props":{"reactBitsId":"typewriter-text","position":{"x":200,"y":500},"width":1000,"height":100,"text":"AI-powered slide generation for modern teams","speed":15,"showCursor":true,"cursorColor":"#3b82f6","className":"text-3xl"}}',
                "",
                "5. AVOID:",
                "   - Don't use background animations on content-heavy slides (charts, text, data)",
                "   - Don't overlap ReactBits text animations with regular TiptapTextBlock",
                "   - Don't use too many animated components on one slide (max 2-3)",
                "   - Don't use background components when Background component is already present"
            ])

        # If outline carries structured two-column comparison, surface it explicitly
        try:
            cmp = getattr(context.slide_outline, 'comparison', None)
            if cmp:
                sections.extend([
                    "\n STRUCTURED COMPARISON (explicit):",
                    f"- Layout preference: {getattr(cmp, 'layout', None) or getattr(cmp, 'get', lambda k, d=None: None)('layout')}",
                    f"- Left label: {getattr(cmp, 'leftLabel', None) or getattr(cmp, 'get', lambda k, d=None: None)('leftLabel')}",
                    f"- Right label: {getattr(cmp, 'rightLabel', None) or getattr(cmp, 'get', lambda k, d=None: None)('rightLabel')}",
                    "- LEFT bullets (use as-is; do NOT paraphrase):",
                ])
                lb = getattr(cmp, 'leftBullets', None) or (cmp.get('leftBullets') if isinstance(cmp, dict) else [])
                rb = getattr(cmp, 'rightBullets', None) or (cmp.get('rightBullets') if isinstance(cmp, dict) else [])
                for b in lb[:6]:
                    sections.append(f"  • {str(b)}")
                sections.append("- RIGHT bullets (use as-is; do NOT paraphrase):")
                for b in rb[:6]:
                    sections.append(f"  • {str(b)}")
                sections.extend([
                    "RULE: Reflect these bullets in paired text blocks; keep order and phrasing consistent."
                ])
        except Exception:
            pass

        # Add specific Table component instructions if predicted
        if "Table" in predicted:
            sections.extend([
                "\n TABLE COMPONENT REQUIREMENTS:",
                "1. Use when data is naturally row/column (comparisons, specs, pricing, surveys).",
                "2. Headers: derive from keys when present; otherwise infer concise, short labels.",
                "3. Data: populate props.data as a 2D array of rows (strings/numbers).",
                "4. Sizing: width 1400–1680, height 520–760; align with 12-column grid.",
                "5. Styling (clean, professional):",
                "   - NO rounded corners on the table or cells (square edges).",
                "   - Strong header contrast (bold, high-contrast background and text).",
                "   - Minimal rules/lines: avoid heavy gridlines; prefer header bottom border and subtle row dividers only.",
                "   - Numeric columns right-aligned; text columns left-aligned.",
                "   - Comfortable cell padding (12–16px).",
                "   - Limit density: max ~6 columns and ~10–12 rows per table; split if more.",
                "6. Do NOT invent values. Use exact values from slide content/extracted data.",
                "EXAMPLE:",
                '{"type":"Table","props":{"position":{"x":160,"y":220},"width":1600,"height":600,"data":[["Feature","Basic","Pro"],["Storage","10GB","100GB"],["Users","5","25"]],"tableStyles":{"headerBackgroundColor":"{accent_1}","headerTextColor":"#FFFFFF","textColor":"{primary_text}","cellPadding":12}}}',
            ])
        
        # Explicitly mention Icon if it's in the list
        if "Icon" in predicted:
            sections.extend([
                "\n ICON USAGE RULES (FUNCTIONAL ONLY, OPTIONAL):",
                "NOTE: Use icons sparingly — do NOT add icons to every text block.",
                "1. ONLY use icons for:",
                "   - Text labels and bullet points (beside text)",
                "   - Process flow indicators (next to step labels)",
                "2. NEVER use icons for:",
                "   - Background decoration",
                "   - General slide embellishment",
                "   - 'Filling space'",
                "3. Placement: Place icon to the LEFT or RIGHT of the associated text with a 16–20px gap. Prefer left for standard bullets; right is allowed for sidebars, callouts, or asymmetric compositions.",
                "   - To force a side, set props.metadata.placement = 'left' | 'right' and forceAdjacency=true.",
                "\n ICON COMPONENT: Use the native Icon component type for icons!",
                "Icon props: iconLibrary (lucide/heroicons/feather/tabler), iconName, color, strokeWidth, filled",
                "DO NOT use CustomComponent for icons - Icon is its own component type!"
            ])

        # Lines guidance - only for connectors/arrows, NOT dividers (handled by theme)
        if "Lines" in predicted:
            # Check if theme already handles divider lines
            slide_structure = self._get_slide_structure_from_theme(context)
            has_theme_divider = slide_structure and 'divider_line' in slide_structure.get('elements_to_include', [])
            
            sections.extend([
                "\n LINES (CONNECTORS ONLY) — CORRECT USAGE:",
                "- Use startPoint/endPoint (x,y) — do NOT use position/width/height for Lines.",
                ""
            ])
            
            # Only add divider guidance if theme doesn't already handle it
            if not has_theme_divider:
                sections.extend([
                    "⚠️ DIVIDER LINES: Only create if explicitly mentioned in content or for clear visual separation.",
                    "- DO NOT automatically add dividers under titles unless theme requires it",
                    "- If a divider is needed: place BELOW all text with 40px gap minimum",
                    ""
                ])
            else:
                sections.extend([
                    "⚠️ DIVIDER LINES: Already handled by theme structure - DO NOT create additional dividers!",
                    ""
                ])
            
            sections.extend([
                "CONNECTOR LINES (arrows/flow):",
                "- For connectors between components A→B:",
                "  * startPoint.x = A.position.x + A.width, startPoint.y = A.position.y + (A.height / 2)",
                "  * endPoint.x = B.position.x, endPoint.y = B.position.y + (B.height / 2)",
                "  * endShape: 'arrow' for direction; startShape: 'none'",
                "- connectionType: 'straight' for simple links; 'elbow' to route around content; 'curved' for soft links.",
                "- stroke: use theme accent colors; strokeWidth: 3–6 for visibility",
                "- Only use Lines for showing relationships, flow, or connections - NOT for decoration",
            ])

        # Grid alignment and non-overlap layout rules (applies to all)
        sections.extend([
            "\n GRID AND LAYOUT RULES (STRICT):",
            "- Use a 12-column grid: column width ≈ 140px with 20px gutters (canvas 1920px, margins 80px).",
            "- Snap x to column starts: x = 80 + colIndex * (140 + 20). Widths should span whole columns (n * 140 + (n-1)*20).",
            "- Vertical rhythm: y positions in increments of 24px; maintain 40px min gaps between components.",
            "- NO OVERLAP: Before placing a component, ensure its bounds do not intersect any existing component bounds.",
            "- REQUIRED GAPS: ≥40px between text blocks; ≥60px around charts/images/CustomComponents.",
            "- EDGE SAFETY: Keep text ≥80px from canvas edges; images/charts ≥60px.",
            "- Icons next to text: when a TiptapTextBlock is used for bullets/labels, add an Icon on the left (default) or right (sidebar/callout) with a 16–20px gap.",
            "- Emphasis via Tiptap: split text into multiple segments, vary fontSize/color/weight; use theme accent_1 for emphasis, primary_text at 70–85% opacity for context.",
            "- Color pop (no background overlaps): use shape_color as subtle underline/highlight blocks behind short phrases (padding 8–12px, borderRadius 8–12).",
            "- Shapes act as CONTAINERS/BACKDROPS only: low zIndex, never used to 'push' text; do not rely on shapes to fix layout collisions.",
        ])

        # Encourage varied text and image placements for RAG output
        sections.extend([
            "\n LAYOUT VARIATIONS (CHOOSE TASTEFULLY, THEME-APPROPRIATE):",
            "- Staggered text blocks: one left, one right, with strong hierarchy.",
            "- Pull quote block: large quote on one side, supporting points on the other.",
            "- Sidebar layout: narrow column for labels/steps, wide column for body copy.",
            "- Split-screen with image: let the image occupy an entire half or a third; place text in the remaining area with generous margins.",
            "- Card grid: 2–3 columns of feature cards with icons and concise text.",
            "- Caption-over-image: text block over image with contrast layer for readability.",
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
                "- Use text shadows and color contrast (NO backgrounds)",
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
                "   - Clamp text: fontSize = Math.min(desired, Math.max(14, Math.floor(availableWidth / (text.length * 0.6))))",
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
            
            sections.extend([
                "\n** MANDATORY CUSTOMCOMPONENT USAGE - THEMED, BESPOKE & CREATIVE!",
                "CRITICAL: CustomComponents MUST follow the slide's theme and design language, and be custom-built (no templates):",
                "",
                "🎨 THEME INTEGRATION (MANDATORY):",
                f"- Primary Color: {colors.get('accent_1', '#00F0FF')} (main elements, emphasis)",
                f"- Secondary Color: {colors.get('accent_2', '#FF5722')} (contrast, highlights)",
                f"- Background: {colors.get('primary_background', '#0A0E27')} (subtle, avoid busy patterns)",
                f"- Text Color: {colors.get('primary_text', '#FFFFFF')} (ensure readability)",
                f"- Hero Font: {typography.get('hero_title', {}).get('family', 'Poppins')} (for hero numbers)",
                f"- Body Font: {typography.get('body_text', {}).get('family', 'Poppins')} (for labels)",
                "",
                "🚫 NO LIBRARIES OR PREBUILT TEMPLATES:",
                "- Do NOT import/require anything; no external libraries, no JSX, no CSS frameworks",
                "- Do NOT copy from any component library JSON; write bespoke JavaScript using React.createElement",
                "- Keep everything self-contained inside the render function string",
                "",
                "✨ CREATIVE DESIGN PRINCIPLES:",
                "- Match the presentation's visual style and flow",
                "- Use gradients that complement the slide background",
                "- Apply theme colors creatively (gradients, glows, shadows)",
                "- Ensure visual hierarchy aligns with slide content",
                "- Add subtle animations or effects that enhance, not distract",
                "",
                "📐 COMPOSITION & LAYOUT:",
                "- Consider the entire slide composition",
                "- Complement other components visually",
                "- Use appropriate layout patterns:",
                "  * Side-by-side: Text (40%) + Visualization (60%)",
                "  * Top-bottom: Key message above, supporting viz below",
                "  * Full-slide: Component fills space with integrated text",
                "  * Asymmetric: Hero visualization (70%) + supporting content (30%)",
                "",
                "🎯 VARIETY (RUN WILD WITHIN BOUNDS):",
                "- Hero metrics: animated counters, gradient-filled big numerals, progress arcs",
                "- Comparative visuals: split bars, scale indicators, dual-ring gauges",
                "- Layout enhancers: grid cards with icons, tag clouds (bounded), donut/waffle-like visuals",
                "- Timelines/flows: step chips with connectors, compact roadmaps using theme colors",
                "- Decorative-but-functional: soft gradient blobs as subtle backdrops behind stats (no overlap)",
                "",
                "🎨 THEME PROPS (PASS AND USE):",
                f"  - primaryColor: '{colors.get('accent_1', '#00F0FF')}', secondaryColor: '{colors.get('accent_2', '#FF5722')}',",
                f"    backgroundColor: '{colors.get('primary_background', '#0A0E27')}', textColor: '{colors.get('primary_text', '#FFFFFF')}',",
                f"    fontFamily: '{typography.get('hero_title', {}).get('family', 'Poppins')}'",
                "- Use transparency suffixes (e.g., + '20') for subtle overlays",
                "- Ensure visual consistency with other slide components",
                "",
                "** IMPLEMENTATION RULES:",
                "1. ALWAYS derive visuals from the slide content (numbers, comparisons, steps, etc.)",
                "2. Write a bespoke render function — no copying from libraries",
                "3. Position components prominently (not hidden in corners)",
                "4. Make them LARGE enough to be impactful (min 400x300)",
                "5. Use theme colors and fonts explicitly in styles",
                "",
                "** DATA PRESENTATION PATTERNS - Choose based on content:",
                "- COMPARISONS: Split screen, balanced circles (no overlaps), balance scales",
                "- PROGRESS: Journey maps, growth trees, filling containers",
                "- HIERARCHIES: Pyramids, nested circles, tree maps",
                "- TIMELINES: Animated sequences, calendar heatmaps, gantt-style",
                "",
                "** INTEGRATION EXAMPLES:",
                "1. Metrics Dashboard: TextBlock header + CustomComponent KPIs below",
                "2. Process Flow: CustomComponent pipeline with Shape connectors",
                "3. Comparison: Side-by-side TextBlock + CustomComponent chart",
                "4. Stats Hero: Full-slide CustomComponent with overlay TextBlocks",
                "",
                "Remember: CustomComponents should enhance the story, not distract!"
            ])

            # De-dup: Short reminder; detailed rules live in system prompt
            sections.extend([
                "\n🔧 CUSTOMCOMPONENT RENDER FUNCTION - FOLLOW SYSTEM RULES:",
                "- Single escaped string (no JSX/backticks).",
                "- First line: const padding = props.padding || 32; then derive sizes.",
                "- Root container uses flexDirection: 'column'.",
                "- NO try/catch, NO timers (setInterval/setTimeout/requestAnimationFrame), do NOT call updateState in render.",
                "- Do NOT redeclare a variable named 'state' inside render.",
                "- STRING QUOTES: For literal text children in React.createElement, use outer double quotes (\"...\") and ensure the inner text has NO double quotes. Convert any inner \" to single quotes. Apostrophes are allowed and should NOT be escaped. Other string literals may use single quotes."
            ])

            # Practical cookbook skeleton to guide the model
            sections.extend([
                "\n📘 CUSTOMCOMPONENT COOKBOOK — SAFE SKELETON (copy/paste and adapt):",
                "Use this exact signature and root styles. Keep it simple, no hooks, no JSX, no backticks.",
                "```javascript",
                "function render({ props, state, updateState, id, isThumbnail }) {",
                "  const padding = props.padding || 32;",
                "  const width = props.width || 600;",
                "  const height = props.height || 300;",
                "  const availableWidth = width - padding * 2;",
                "  const availableHeight = height - padding * 2;",
                "  const title = props.title || '';",
                "  const rawValue = (typeof props.value !== 'undefined' && props.value !== null) ? props.value : '';",
                "  const hasValue = String(rawValue).trim() !== '';",
                "  const valueText = hasValue ? String(rawValue) : '';",
                "  const label = props.label || '';",
                "  const primaryColor = props.primaryColor || '#00D4FF';",
                "  const secondaryColor = props.secondaryColor || '#06FFA5';",
                "  const textColor = props.textColor || '#FFFFFF';",
                "  const fontFamily = props.fontFamily || 'Poppins';",
                "  const alignment = (props.alignment || 'center');",
                "  const alignItems = alignment === 'left' ? 'flex-start' : (alignment === 'right' ? 'flex-end' : 'center');",
                "  const textAlign = alignment;",
                "  const emphasis = props.emphasis || (hasValue ? 'hero' : 'normal');",
                "  const maxValueHeight = Math.floor(availableHeight * (emphasis === 'hero' ? 0.7 : 0.5));",
                "  const valueSize = hasValue ? Math.min( Math.floor(availableWidth / Math.max(3, valueText.length * 0.6)), maxValueHeight ) : 0;",
                "  const labelSize = Math.min(36, Math.floor(availableWidth / 12));",
                "  const titleSize = title ? Math.min(48, Math.floor(availableWidth / Math.max(8, title.length * 0.5))) : 0;",
                "  const backdrop = (props.backdrop === true) ? (props.backdropColor || (secondaryColor + '10')) : 'transparent';",
                "  return React.createElement('div', {",
                "    style: { width: '100%', height: '100%', maxWidth: '100%', maxHeight: '100%', boxSizing: 'border-box', overflow: 'hidden', display: 'flex', flexDirection: 'column', position: 'relative', alignItems: alignItems, justifyContent: 'center', padding: padding + 'px', fontFamily, background: backdrop }",
                "  }, [",
                "    title && React.createElement('div', { key: 'title', style: { fontSize: titleSize + 'px', color: textColor, opacity: 0.85, marginBottom: '12px', letterSpacing: '0.5px', fontWeight: '700', textAlign: textAlign, width: '100%' } }, title),",
                "    hasValue && React.createElement('div', { key: 'value', style: { fontSize: Math.max(14, valueSize) + 'px', fontWeight: '900', background: 'linear-gradient(135deg, ' + primaryColor + ' 0%, ' + secondaryColor + ' 100%)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text', lineHeight: 1, letterSpacing: '-0.02em', textAlign: textAlign, width: '100%' } }, valueText),",
                "    label && React.createElement('div', { key: 'label', style: { fontSize: labelSize + 'px', color: textColor, opacity: 0.8, marginTop: '12px', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.1em', textAlign: textAlign, width: '100%' } }, label)",
                "  ]);",
                "}",
                "```",
                "Rules: No hooks inside render, do not call updateState in render, escape as a single string with \\n and no backticks when emitting JSON.",
                "For literal text children in React.createElement, use double quotes (\"...\"); escape internal double quotes as \\\". Other string literals can be single quotes.",
                "When adding literal text as the third argument of React.createElement, use double quotes so apostrophes don't break strings.",
                "Example: React.createElement('div', {...}, \"Fewer units needed with Dyna.co's proprietary learning algorithms\")",
                "IMPORTANT: When you create a CustomComponent, populate props.value and props.label from the slide content (outline/title/data).",
                "- Extract real metrics from the outline (percentages, currency, counts) and set props.value accordingly.",
                "- Set props.previous if a prior value is mentioned, and props.max/props.target if a goal is stated.",
                "- Include props.outline as an array of 2-6 short keywords from the slide content for chips.",
                "- Never use generic placeholders like 'Value' or 'Label'."
            ])
        
        # Component schemas
        if schemas := rag_context.get('component_schemas', {}):
            sections.append(f"\n{self._format_component_schemas(schemas, predicted)}")

        # Include cookbook content for CustomComponent if available
        if "CustomComponent" in predicted:
            cookbook = rag_context.get('custom_component_cookbook', {}) or {}
            if cookbook:
                try:
                    sections.extend([
                        "\nCUSTOMCOMPONENT COOKBOOK (concise):",
                        f"Signature: {cookbook.get('signature', '')}",
                        "Golden rules:",
                        *[f"- {rule}" for rule in cookbook.get('golden_rules', [])[:6]],
                    ])
                except Exception:
                    pass
    
    def _add_component_boundary_rules(self, sections: List[str]):
        """Add comprehensive boundary rules for all components."""
        sections.extend([
            "\n** CRITICAL COMPONENT BOUNDARY RULES (ALL COMPONENTS):",
            "",
            "CANVAS DIMENSIONS: 1920x1080 pixels (width x height)",
            "",
            "MANDATORY BOUNDARY VALIDATION FOR EVERY COMPONENT:",
            "1. POSITION CONSTRAINTS:",
            "   - x >= 0 (no negative x positions)",
            "   - y >= 0 (no negative y positions)",
            "   - x + width <= 1920 (right edge must not exceed canvas)",
            "   - y + height <= 1080 (bottom edge must not exceed canvas)",
            "",
            "2. SAFE POSITIONING ZONES:",
            "   - Full width: x=80, width=1760 (80px margins)",
            "   - Left half: x=80, width=880",
            "   - Right half: x=960, width=880",
            "   - Center: x=160, width=1600",
            "   - Bottom safe: y=max allowed is 1080 - height - 80",
            "",
            "3. COMPONENT-SPECIFIC LIMITS:",
            "   - TextBlocks: Max height 400px unless full-screen quote",
            "   - TextBlocks (multi-line): Min height = floor(fontSize × lines × 1.3) + 10–20% buffer",
            "   - TextBlocks (small): If height < 140px, keep SINGLE-LINE only (no manual line breaks)",
            "   - Charts: Max height 800px, width 880px (half screen)",
            "   - Icons: Position next to text, max 64x64px",
            "   - Shapes: As containers only, must fit within bounds",
            "   - Lines: Dividers must be BELOW text with 40px gap minimum",
            "   - CustomComponents: Min 600x400px, max 1760x920px",
            "",
            "4. OVERFLOW PREVENTION:",
            "   - ALWAYS calculate: rightEdge = x + width",
            "   - ALWAYS calculate: bottomEdge = y + height",
            "   - VERIFY: rightEdge <= 1920 AND bottomEdge <= 1080",
            "   - If overflow detected, either:",
            "     a) Reduce width/height to fit",
            "     b) Reposition to safe zone",
            "     c) Use standard safe dimensions",
            "",
            "5. HEIGHT-AWARE TEXT ADJUSTMENTS:",
            "   - If text wraps within a small-height block, increase height, split into more blocks, or shorten text to reduce line breaks.",
            "   - Maintain 40–60px vertical gaps between consecutive text blocks.",
            "",
            "6. COMMON MISTAKES TO AVOID:",
            "   - ❌ Placing components at y=900 with height=300 (exceeds 1080)",
            "   - ❌ Using x=1200 with width=800 (exceeds 1920)",
            "   - ❌ Negative positions (x=-50 or y=-20)",
            "   - ❌ Assuming components auto-resize (they don't)",
            "",
            "7. SAFE PATTERNS:",
            "   - Title at top: y=80-200, height=100-200",
            "   - Content blocks: y=300-800, height=100-400",
            "   - Bottom elements: y=max(880, 1000-height)",
            "   - Full-height: y=80, height=920 (with margins)",
            "",
            "VALIDATION EXAMPLE:",
            "Component: {x: 1200, y: 700, width: 600, height: 500}",
            "Check: 1200 + 600 = 1800 <= 1920 ✓",
            "Check: 700 + 500 = 1200 > 1080 ❌ OVERFLOW!",
            "Fix: Reduce height to 300 or reposition to y=500",
            "",
            "⚠️ EVERY COMPONENT MUST PASS THESE CHECKS!"
        ])
    
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
                "For title slides: Include a hero image with src: 'placeholder'!",
                "MANDATORY: Include at least one Image component with src: 'placeholder' on this slide.",
                "ALSO: For EACH Image component, include props.searchQuery: a concise 2–5 word image search phrase for that specific box (not slide-wide).",
                "Examples (good): 'super smash bros pikachu', 'venture capital portfolio', 'first round capital logo'.",
                "Avoid (too generic): 'super', 'plant', 'sun', 'data', 'background'."
            ])
        elif context.available_images:
            # Pre-fetched images mode - show and use them directly
            sections.append(f"\n🖼️ AVAILABLE IMAGES ({len(context.available_images)} found):")
            sections.append(f"{self._format_available_images(context.available_images[:6])}")
            sections.append("\nUse the URLs above directly in your Image components.")
            sections.append("Add props.searchQuery to each Image (2–5 words) to record the intended content for that slot.")
        else:
            sections.extend([
                "\n🖼️ IMAGES: Use src: 'placeholder' (just the word 'placeholder', NOT a URL!)",
                "For title slides: PREFER a full-bleed hero image with src: 'placeholder'. If split-screen, image can be LEFT or RIGHT based on composition.",
                "MANDATORY: Include at least one Image component with src: 'placeholder' on this slide.",
                "Example (full-bleed): {\"type\": \"Image\", \"props\": {\"src\": \"placeholder\", \"position\": {\"x\": 0, \"y\": 0}, \"width\": 1920, \"height\": 1080}}",
                "Also include props.searchQuery on each Image to guide later retrieval (2–5 precise words)."
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
        
        # Add creative visual enhancement rules (no decorative shapes)
        sections.extend([
            "\n** CREATIVE VISUAL ENHANCEMENTS - MAKE IT DYNAMIC:",
            "",
            "IMAGE EFFECTS (apply to make images pop):",
            "- Animation: ken-burns (duration: 20, scale: 1.1) for subtle movement",
            "- Filters: dramatic, vibrant, cyberpunk, vintage for mood",
                "- Masks: circle, hexagon, diagonal for creative framing",
                "- Circle mask rule: use a square image box (width === height) to prevent side cropping",
                "- Long titles: widen the title block (increase width) instead of making it too tall; overlay on images if needed with proper contrast",
            "- Overlays: gradient overlays (bottomFade, vignette) for depth",
            "",
            "SHAPES (FUNCTIONAL ONLY):",
            "- Use rectangles with subtle backgrounds as TEXT CONTAINERS only",
            "- Use thin lines/bars as DIVIDERS only",
            "- Arrows allowed only to indicate PROCESS FLOW (with labels)",
            "- NO free-floating decorative shapes",
            "",
            "LAYOUT PATTERNS (break the grid):",
            "- Title slides: Prefer FULL-BLEED hero or LEFT-ALIGNED HERO. Avoid 50/50 split for titles.",
            "- Split-screen (for content slides): 50/50 or 60/40 image/content (image LEFT or RIGHT)",
            "- Asymmetric: Off-center for visual tension",
            "- Layered: Depth via transparency without overlapping foreground components",
            "- Scattered: Polaroid-style image arrangements",
            "",
            "ANIMATION CHOREOGRAPHY (bring it to life):",
            "- Entrance: fade-in (400-600ms), slide-in (300-500ms), scale-up (500-700ms)",
            "- Stagger: Lists and steps with 100-200ms delays between items",
            "- Emphasis: Pulse or glow effects on key statistics",
            "- Images: Always add ken-burns or parallax for movement",
            "- Total time: Keep all animations under 2 seconds"
        ])
    
    def _determine_slide_type(self, context: SlideGenerationContext) -> str:
        """Determine the type of slide based on content and position."""
        slide_index = context.slide_index
        total_slides = context.total_slides
        title_lower = context.slide_outline.title.lower()
        content_lower = context.slide_outline.content.lower()
        
        # First slide is usually title
        if slide_index == 0:
            return 'title'
        
        # Last slide is usually conclusion
        if slide_index == total_slides - 1:
            if any(word in title_lower for word in ['conclusion', 'thank', 'summary', 'next step', 'questions']):
                return 'conclusion'
        
        # Section dividers
        if any(word in title_lower for word in ['chapter', 'section', 'part ']):
            return 'section'
        
        # Data slides
        if context.has_chart_data or any(word in content_lower for word in ['chart', 'graph', 'data', 'metrics', 'statistics']):
            return 'data'
        
        # Default to content
        return 'content'
    
    def _add_conclusion_slide_requirements(self, sections: List[str], context: SlideGenerationContext):
        """Add specific requirements for conclusion/thank you slides with personalization."""
        if self._determine_slide_type(context) == 'conclusion':
            # Get user info if available
            thank_you_message = "Thank you"
            contact_info = ""
            
            if context.user_id:
                user_info_service = get_user_info_service()
                user_info = user_info_service.get_user_info(context.user_id)
                
                # Generate personalized thank you message
                style = 'friendly'  # Could be determined by theme vibe
                thank_you_message = user_info_service.get_thank_you_message(user_info, style)
                
                # Add contact info if available
                if user_info.get('email'):
                    contact_info = f"\nContact: {user_info.get('email')}"
                    if user_info.get('job_title'):
                        contact_info = f"\n{user_info.get('name')} - {user_info.get('job_title')}{contact_info}"
            
            sections.extend([
                "\nCONCLUSION SLIDE REQUIREMENTS:",
                f"- Main message: '{thank_you_message}'",
                "- Use large, centered typography (80-120pt)",
                "- Keep design minimal and impactful",
            ])
            
            if contact_info:
                sections.append(f"- Include contact information at bottom:{contact_info}")
            
            sections.extend([
                "- Consider adding a subtle call-to-action if appropriate",
                "- Use the theme's accent or primary colors for emphasis"
            ])
    
    def _add_final_requirements(self, sections: List[str], context: SlideGenerationContext):
        """Add final generation requirements (trimmed, gated, non-duplicative)."""
        # Add conclusion-specific requirements if applicable
        self._add_conclusion_slide_requirements(sections, context)
        
        lines: List[str] = ["\nFINAL DESIGN REQUIREMENTS:"]
        if context.has_chart_data:
            lines.extend([
                "- Charts: 800–1200px width, 600–900px height; showLegend: false; axis labels 12–16px.",
                "- Charts must not overlap titles/text/images; maintain ≥60px gap.",
            ])
        lines.append("- Maintain clear visual hierarchy with ample whitespace and no component overlap.")
        
        # Check if theme handles dividers
        slide_structure = self._get_slide_structure_from_theme(context)
        has_theme_divider = slide_structure and 'divider_line' in slide_structure.get('elements_to_include', [])
        
        if has_theme_divider:
            lines.append("- Component order: Title → Subtitle → Content → Theme Divider (theme will handle divider positioning)")
        else:
            lines.append("- Component order: Title → Subtitle → Content → Optional Lines (only for connectors/flow)")
        
        lines.append("- Backgrounds: Prefer modern gradients using theme/palette colors (linear 135°). Use solid only if necessary for contrast.")
        sections.extend(lines)
    
    def _get_text_color(self, bg_color: str) -> str:
        """Determine text color based on background."""
        return '#FFFFFF' if self._is_dark_color(bg_color) else '#1A202C'
    
    def _estimate_brightness(self, hex_color: str) -> float:
        """Estimate brightness (0-1) for choosing backgrounds."""
        try:
            hex_color = hex_color.lstrip('#')
            r = int(hex_color[0:2], 16) / 255.0
            g = int(hex_color[2:4], 16) / 255.0
            b = int(hex_color[4:6], 16) / 255.0
            return (0.299 * r + 0.587 * g + 0.114 * b)
        except Exception:
            return 0.5

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
                    name = item.get('name') or item.get('label') or item.get('id') or ""
                    if not name:
                        # Skip unlabeled points to avoid 'Unknown' leakage into prompts
                        continue
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
        """Format component schemas with only critical props for predicted components."""
        from agents.rag.schema_extractor import SchemaExtractor
        extractor = SchemaExtractor()
        minimal = extractor.get_component_schemas(predicted)
        lines: List[str] = ["COMPONENT SCHEMAS (critical props):\n"]
        critical_map = {
            "Image": ["position", "width", "height", "src", "objectFit"],
            "Background": ["position", "width", "height", "backgroundType", "gradient"],
            "Icon": ["position", "width", "height", "iconLibrary", "iconName", "color", "strokeWidth", "filled"],
            "CustomComponent": ["position", "width", "height", "render"],
            "Group": ["position", "width", "height", "children"],
        }
        base_props = ["position", "width", "height", "opacity", "rotation", "zIndex"]
        for comp in predicted:
            props = minimal.get(comp, {}).get("properties", {})
            keep = critical_map.get(comp, base_props)
            lines.append(f"\n{comp}:")
            for key in keep:
                if key in props:
                    p = props[key]
                    t = p.get("type") if isinstance(p, dict) else None
                    suffix = f" ({t})" if t else ""
                    lines.append(f"  {key}:{suffix}")
                else:
                    lines.append(f"  {key}:")
        return "\n".join(lines)
    
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
    
    def _add_brand_logo(self, sections: List[str], brand_logo_url: str) -> None:
        """Add brand logo instructions with strict requirements."""
        sections.extend([
            "\nBRAND LOGO - MANDATORY CREATION REQUIREMENTS:",
            f"- EXACT LOGO URL TO USE: {brand_logo_url}",
            "",
            "LOGO COMPONENT CREATION - CRITICAL REQUIREMENTS:",
            "- YOU MUST CREATE A LOGO COMPONENT - This is not optional",
            "- ABSOLUTELY CRITICAL: src MUST be the exact URL above - NEVER use 'placeholder'",
            "- FORBIDDEN: Do NOT use src: 'placeholder' for logos - always use the real URL",
            "- REQUIRED: Component type: 'Image' with objectFit: 'contain'",
            "- REQUIRED: metadata: { 'kind': 'logo' } for proper system handling",
            "",
            "INTELLIGENT LOGO PLACEMENT (BIGGER, CONSISTENT):",
            "- DECK-WIDE CONSISTENCY: Choose ONE corner and keep it IDENTICAL across all slides.",
            "- DEFAULT ANCHOR: Top-right with ~24px margins on 1920×1080. For very formal decks, bottom-left is acceptable.",
            "- HONOR THEME: If theme.positioning.logo.position is provided, use it consistently.",
            "- TITLE SLIDES: Top-right, size 220-280px wide, 70-90px tall",
            "- CONTENT SLIDES: Header/top-right, size 140-180px wide, 44-56px tall", 
            "- DATA/STATS SLIDES: Bottom-right, size 110-140px wide, 36-48px tall",
            "- CONCLUSION SLIDES: Prominent top-right, size 240-300px wide, 80-100px tall",
            "",
            "ASPECT-AWARE CONTAINERS:",
            "- If the brand logo is square/icon style, use a SQUARE container (width == height)",
            "- Square sizes: 120-160px on title/conclusion, 100-130px on content, 90-110px on data slides",
            "- If the logo is wide/horizontal, use a WIDE container (~3× width vs height)",
            "- Do NOT place square logos inside very wide containers; avoid long horizontal boxes",
            "- Maintain aspect: never stretch the logo; let objectFit: 'contain' handle it",
            "",
            "COMPONENT STRUCTURE EXAMPLE:",
            "{",
            "  'type': 'Image',",
            f"  'props': {{",
            f"    'src': '{brand_logo_url}',",
            "    'alt': 'Brand Logo',",
            "    'objectFit': 'contain',",
            "    'position': { 'x': 1650, 'y': 60 },",
            "    'width': 200, 'height': 66,",
            "    'metadata': { 'kind': 'logo' }",
            "  }",
            "}",
            "",
            "- REMINDER: Create the logo component with the real URL, not placeholder!"
        ]) 
