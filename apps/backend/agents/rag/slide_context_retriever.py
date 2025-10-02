"""
Slide Context Retriever for RAG-based Slide Generation
Intelligently retrieves only relevant information for each slide
"""

import json
from pathlib import Path
import os
from typing import Dict, Any, List, Optional, Set
import re
from models.requests import SlideOutline, DeckOutline
from setup_logging_optimized import get_logger
from agents.rag.schema_extractor import SchemaExtractor
from datetime import datetime

logger = get_logger(__name__)


class SlideContextRetriever:
    """
    Retrieves relevant context from knowledge base for slide generation
    """
    
    def __init__(self, kb_path: str = "agents/rag/knowledge_base"):
        """Initialize the retriever with knowledge base and schema extractor."""
        # Handle relative paths from different directories
        self.kb_path = Path(kb_path)
        if not self.kb_path.exists():
            # Try from parent directory (when running from test/)
            parent_path = Path(__file__).parent.parent.parent / kb_path
            if parent_path.exists():
                self.kb_path = parent_path
                logger.info(f"Using knowledge base path: {self.kb_path}")
        
        self.schema_extractor = SchemaExtractor()
        self.kb = self._load_knowledge_base()
        self.critical_rules = self._load_critical_rules()
        self.creative_content = self._load_creative_content()
        self.themed_components = self._load_themed_components()
        self.custom_component_cookbook = self._load_custom_component_cookbook()
        # Allow opting into legacy component libraries via env; default off to encourage bespoke variety
        self.use_component_library: bool = str(os.getenv("RAG_USE_COMPONENT_LIBRARY", "false")).lower() in ("1", "true", "yes")
        
        logger.info(f"Initialized SlideContextRetriever with KB version {self.kb.get('metadata', {}).get('version', 'Unknown')}")
    
    def _load_knowledge_base(self) -> Dict[str, Any]:
        """Load the complete knowledge base"""
        kb_file = self.kb_path / "complete_knowledge_base.json"
        try:
            with open(kb_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load knowledge base: {e}")
            return {}
    
    def _load_critical_rules(self) -> Dict[str, Any]:
        """Load critical rules that should always be included"""
        rules_file = self.kb_path / "critical_rules.json"
        try:
            with open(rules_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load critical rules: {e}")
            return {}
    
    def _load_creative_content(self) -> Dict[str, Any]:
        """Load creative content from prompts"""
        creative_file = self.kb_path / "prompts_creative_content.json"
        try:
            with open(creative_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to load creative content: {e}")
            return {}
    
    def _load_themed_components(self) -> Dict[str, Any]:
        """Load themed custom component library"""
        themed_file = self.kb_path / "custom_component_library_themed.json"
        try:
            with open(themed_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.info(f"Themed components not found, using standard library: {e}")
            return {}

    def _load_custom_component_cookbook(self) -> Dict[str, Any]:
        """Load practical cookbook for building CustomComponents"""
        cookbook_file = self.kb_path / "custom_component_cookbook.json"
        try:
            with open(cookbook_file, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.info(f"CustomComponent cookbook not found: {e}")
            return {}
    
    def get_slide_context(
        self,
        slide_outline: SlideOutline,
        slide_index: int,
        deck_outline: DeckOutline,
        theme: Dict[str, Any],
        palette: Dict[str, Any]
    ) -> Dict[str, Any]:
        """Get relevant context for a slide based on its characteristics."""
        
        logger.info(f"🔍 Starting context retrieval for slide {slide_index + 1}: {slide_outline.title}")
        start_time = datetime.now()
        
        # Predict components based on content
        predicted_components = self._predict_components(slide_outline, slide_index, deck_outline)
        logger.info(f"  Predicted {len(predicted_components)} components: {predicted_components}")
        
        # Get relevant critical rules
        critical_rules = self._get_relevant_critical_rules(predicted_components, slide_outline)
        logger.info(f"  Retrieved {len(critical_rules)} critical rules")
        
        # Get examples and schemas
        component_examples = self._get_component_examples(predicted_components, slide_outline)
        component_schemas = self._get_component_schemas(predicted_components)
        logger.info(f"  Retrieved {len(component_examples)} examples and {len(component_schemas)} schemas")
        
        # Get layout patterns
        layout_patterns = self._get_layout_patterns(predicted_components, slide_outline)
        logger.info(f"  Retrieved {len(layout_patterns)} layout patterns")
        
        # Get typography rules
        typography_rules = self._get_typography_rules(slide_outline, predicted_components)
        logger.info(f"  Retrieved {len(typography_rules)} typography rules")
        
        # Get best practices
        best_practices = self._get_best_practices(predicted_components)
        logger.info(f"  Retrieved {len(best_practices)} best practices")
        
        # Get design philosophy
        design_philosophy = self._get_design_philosophy()
        
        # Get creative content based on slide type
        creative_guidance = self._get_creative_guidance(slide_outline, slide_index, deck_outline)
        logger.info(f"  🎨 Retrieved {len(creative_guidance)} creative guidelines")
        
        # Extract theme fonts correctly from typography
        theme_fonts = {}
        if theme and isinstance(theme.get('typography'), dict):
            typography = theme['typography']
            if isinstance(typography.get('hero_title'), dict):
                theme_fonts['hero'] = typography['hero_title'].get('family', 'Montserrat')
            if isinstance(typography.get('body_text'), dict):
                theme_fonts['body'] = typography['body_text'].get('family', 'Poppins')
        
        logger.info(f"  📝 Theme fonts extracted: {theme_fonts}")
        
        context = {
            'predicted_components': predicted_components,
            'critical_rules': critical_rules,
            'component_examples': component_examples,
            'component_schemas': component_schemas,
            'layout_patterns': layout_patterns,
            'typography_rules': typography_rules,
            'best_practices': best_practices,
            'design_philosophy': design_philosophy,
            'creative_guidance': creative_guidance,  # Add creative content
            'custom_component_cookbook': self.custom_component_cookbook if "CustomComponent" in predicted_components else {},
            'theme_colors': palette.get('colors', []),
            'primary_color': palette.get('primary'),
            'theme_fonts': theme_fonts,
            'theme_typography': theme.get('typography', {})  # Pass full typography for reference
        }
        
        # Calculate context size
        context_size = len(str(context))
        elapsed = (datetime.now() - start_time).total_seconds()
        logger.info(f"✅ Context retrieval completed in {elapsed:.1f}s - Size: {context_size} chars (~{context_size // 4} tokens)")
        
        return context
    
    def _analyze_slide(self, slide_outline: SlideOutline, slide_index: int, deck_outline: DeckOutline) -> Dict[str, Any]:
        """Analyze slide characteristics"""
        if deck_outline is None:
            logger.error(f"❌ deck_outline is None in _analyze_slide for slide {slide_index + 1}!")
            raise ValueError(f"deck_outline cannot be None when analyzing slide {slide_index + 1}")
            
        title_lower = slide_outline.title.lower()
        content_lower = slide_outline.content.lower()
        
        # Check if slide has actual chart data (not just extractedData object)
        has_valid_chart_data = False
        chart_type = None
        if slide_outline.extractedData:
            # Check if extractedData has valid data array with actual data points
            if hasattr(slide_outline.extractedData, 'data') and slide_outline.extractedData.data:
                # Ensure data is a list with at least one valid data point
                if isinstance(slide_outline.extractedData.data, list) and len(slide_outline.extractedData.data) > 0:
                    has_valid_chart_data = True
                    chart_type = slide_outline.extractedData.chartType if hasattr(slide_outline.extractedData, 'chartType') else None
        
        characteristics = {
            "is_title_slide": slide_index == 0 or any(word in title_lower for word in ["title", "cover", "welcome"]),
            "is_closing_slide": slide_index == len(deck_outline.slides) - 1 or any(word in title_lower for word in ["thank", "questions", "contact"]),
            "has_chart": has_valid_chart_data,
            "chart_type": chart_type,
            "has_statistics": self._contains_statistics(slide_outline.content),
            "has_comparison": any(word in content_lower for word in ["vs", "versus", "compared", "better", "worse"]),
            "has_list": any(marker in slide_outline.content for marker in ["•", "-", "1.", "2.", "*"]),
            "content_length": len(slide_outline.content),
            "title_length": len(slide_outline.title),
            "has_quote": '"' in slide_outline.content or '"' in slide_outline.content,
            "emphasis_words": self._find_emphasis_words(slide_outline.content),
            "word_count": len(slide_outline.content.split()),
            "is_minimal": len(slide_outline.content.split()) < 20,
            "is_content_rich": len(slide_outline.content.split()) > 100
        }
        
        return characteristics
    
    def _contains_statistics(self, content: str) -> bool:
        """Check if content contains statistics."""
        stat_patterns = [
            r'\d+%',  # Percentages
            r'\d+[kKmMbB]',  # Abbreviated numbers
            r'\d{1,3}(,\d{3})+',  # Numbers with commas
            r'\$\d+',  # Dollar amounts
            r'\d+x',  # Multipliers
        ]
        
        for pattern in stat_patterns:
            if re.search(pattern, content):
                return True
        return False
    
    def _find_emphasis_words(self, content: str) -> List[str]:
        """Find words that should be emphasized"""
        emphasis_patterns = [
            r'\b(ONLY|NEVER|ALWAYS|MUST|KEY|CRITICAL|IMPORTANT)\b',
            r'\b(first|best|most|least|biggest|smallest)\b',
            r'\b(breakthrough|revolutionary|game-changing|innovative)\b'
        ]
        words = []
        for pattern in emphasis_patterns:
            words.extend(re.findall(pattern, content, re.IGNORECASE))
        return words
    
    def _predict_components(self, slide_outline: SlideOutline, slide_index: int, deck_outline: DeckOutline) -> List[str]:
        """Predict which components will be needed"""
        characteristics = self._analyze_slide(slide_outline, slide_index, deck_outline)
        components = ["Background"]  # Always need background
        
        # Always need text
        components.append("TiptapTextBlock")
        
        # Include Image when content or layout calls for it (not mandatory on every slide)
        try:
            layout = getattr(deck_outline, 'layout', '') or getattr(slide_outline, 'layout', '') or ''
            content_lower = (slide_outline.content or '').lower()
            title_lower = (slide_outline.title or '').lower()
            if 'image' in layout.lower() or any(k in content_lower for k in ['image', 'photo', 'diagram', 'illustration']) or any(k in title_lower for k in ['image', 'photo', 'diagram', 'illustration']):
                components.append("Image")
                logger.info("  🖼️ Image component added based on layout/content cues")
        except Exception:
            pass
        
        # 🚨 CRITICAL: Analyze content for CustomComponent triggers
        content_lower = slide_outline.content.lower()
        title_lower = slide_outline.title.lower()
        custom_component_reasons = []
        
        # Check for metrics/KPIs
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['growth', 'increase', 'improvement', 'metrics', 'kpi', 'performance', '%', 'roi', 'revenue', 'cost']):
            custom_component_reasons.append("metrics visualization (3d_rotating_cube_stats, liquid_progress_bars, kpi_cards or animated_progress_rings)")
        
        # Check for comparisons
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['before', 'after', 'vs', 'versus', 'comparison', 'difference', 'change', 'old', 'new']):
            custom_component_reasons.append("comparison visualization (comparison_bars or feature_toggle)")
        
        # Check for timelines
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['timeline', 'roadmap', 'journey', 'phases', 'steps', 'milestones', 'schedule', 'plan']):
            custom_component_reasons.append("timeline visualization (interactive_timeline)")
        
        # Check for processes
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['process', 'flow', 'decision', 'framework', 'methodology', 'approach', 'strategy']):
            custom_component_reasons.append("process visualization (decision_tree)")
        
        # Check for engagement
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['quiz', 'poll', 'vote', 'opinion', 'feedback', 'survey', 'what do you think']):
            custom_component_reasons.append("audience engagement (quiz_component or interactive_poll)")
        
        # Check for calculations
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['calculator', 'budget', 'investment', 'savings', 'cost benefit']):
            custom_component_reasons.append("calculation tool (interactive_slider)")
        
        # Check for urgency
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['deadline', 'launch', 'countdown', 'limited time', 'expires', 'coming soon']):
            custom_component_reasons.append("countdown visualization (countdown_timer)")
        
        # Check for achievements/milestones
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['achievement', 'milestone', 'success', 'celebration', 'reached', 'achieved', 'win', 'record']):
            custom_component_reasons.append("celebration effect (particle_explosion_reveal)")
        
        # Check for tech/future themes
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['tech', 'future', 'innovation', 'digital', 'cyber', 'ai', 'transform', 'disruption']):
            custom_component_reasons.append("tech visualization (glitch_text_effect or neon_glow_text)")
        
        # Check for features/highlights
        if any(trigger in content_lower or trigger in title_lower for trigger in 
               ['features', 'benefits', 'highlights', 'showcase', 'portfolio', 'capabilities']):
            custom_component_reasons.append("feature showcase (floating_3d_cards)")
        
        # Include CustomComponent only when there is a strong visual/data reason
        if custom_component_reasons or characteristics["has_statistics"]:
            components.append("CustomComponent")
            logger.info(f"  🎨 CustomComponent included for: {', '.join(custom_component_reasons) if custom_component_reasons else 'statistics emphasis'}")
        
        # Remove free-floating decorative shapes; only add Shape when acting as container/divider
        if characteristics["has_list"] or characteristics["has_comparison"]:
            components.append("Shape")
            # Prefer modern Lines component for connectors/dividers
            components.append("Lines")
            logger.info("  🔷 Shape added; Lines suggested for functional connectors/dividers")
        
        # Icons only when paired with text (bullets/headers/process labels)
        if characteristics["has_list"] or "header" in slide_outline.title.lower():
            components.append("Icon")
            logger.info("  🎯 Icon component added for bullets/headers only (no decorative usage)")
        
        # 🚨 CRITICAL: Chart if has data - MUST BE INCLUDED
        if characteristics["has_chart"]:
            components.append("Chart")
            logger.info(f"  📊 Chart component added - valid chart data detected!")
        
        # Prefer Table when we have structured/tabular data; otherwise do not bias by default
        try:
            has_tabular = False
            extracted = getattr(slide_outline, 'extractedData', None)
            data = getattr(extracted, 'data', None)
            if isinstance(data, list) and data:
                # Heuristic: multiple dict rows with 3+ distinct keys => table
                sample = [row for row in data[:5] if isinstance(row, dict)]
                keys_union = set()
                for row in sample:
                    keys_union.update(row.keys())
                has_tabular = len(keys_union) >= 3
            # Also trigger on textual cues for comparisons/pricing/specs
            text_blob = f"{slide_outline.title} {slide_outline.content}".lower()
            tabular_triggers = [
                'compare', 'comparison', 'vs ', 'versus', 'spec', 'specs', 'feature matrix',
                'pros and cons', 'pricing', 'tiers', 'plan', 'table', 'columns', 'rows'
            ]
            if any(t in text_blob for t in tabular_triggers):
                has_tabular = True or has_tabular
            if has_tabular:
                components.append("Table")
                logger.info("  📋 Table component added - tabular data detected")
        except Exception:
            # Stay silent if heuristic fails
            pass
        
        # Additional Images for rich layouts
        if characteristics["is_title_slide"] or characteristics["is_closing_slide"]:
            # Title/closing slides often benefit from multiple images
            logger.info(f"  🖼️ Extra images suggested for title/closing slide")
        
        # Extra CustomComponents for statistics
        if characteristics["has_statistics"]:
            logger.info(f"  💯 CustomComponent emphasized for animated statistics")
        
        # Shape for lists and comparisons
        if characteristics["has_comparison"] or characteristics["has_list"]:
            logger.info(f"  🔷 Shape emphasized for structure/comparison")
        
        # Group/ShapeWithText hints for certain layout patterns
        try:
            txt = (slide_outline.content or "").lower() + " " + (slide_outline.title or "").lower()
            if any(k in txt for k in ["framework", "stack", "pillar", "layers", "modules"]):
                components.append("Group")
                logger.info("  🧩 Group suggested for clustered layout (framework/pillars/layers)")
            if any(k in txt for k in ["callout", "badge", "highlight", "tip", "note"]):
                components.append("ShapeWithText")
                logger.info("  🏷️ ShapeWithText suggested for callouts/badges/highlights")
        except Exception:
            pass
        
        return list(set(components))  # Remove duplicates
    
    def _get_component_examples(self, predicted_components: List[str], slide_outline: SlideOutline) -> Dict[str, Any]:
        """Get examples for the predicted components, including custom library."""
        examples = {}
        
        # Get standard examples
        for comp in predicted_components:
            example = self.schema_extractor.get_example_for_component(comp)
            if example:
                examples[comp] = example
        
        # Add Table examples if Table is predicted
        if "Table" in predicted_components:
            # Add comprehensive Table guidance for the AI
            examples["Table_guidance"] = {
                "when_to_use": [
                    "Comparing features, specs, or options",
                    "Showing pros and cons",
                    "Presenting structured data in rows and columns",
                    "Displaying pricing tiers or plans",
                    "Listing team members with roles",
                    "Showing timelines or schedules",
                    "Presenting survey results or statistics in tabular form"
                ],
                "example": {
                    "type": "Table",
                    "props": {
                        "position": {"x": 160, "y": 200},
                        "width": 1600,
                        "height": 600,
                        "data": {
                            "headers": ["Feature", "Basic", "Pro", "Enterprise"],
                            "rows": [
                                ["Storage", "10GB", "100GB", "Unlimited"],
                                ["Users", "5", "25", "Unlimited"],
                                ["Support", "Email", "Priority", "24/7 Phone"]
                            ]
                        },
                        "style": {
                            "headerBackground": "{primary_dark}",
                            "headerColor": "#FFFFFF",
                            "rowBackground": "#FFFFFF",
                            "alternateRowBackground": "#F8F9FA",
                            "borderColor": "#E0E0E0",
                            "fontSize": 16,
                            "headerFontSize": 18,
                            "headerFontWeight": "bold",
                            "cellPadding": 10,
                            "borderRadius": 8
                        }
                    }
                },
                "design_tips": [
                    "Use alternating row colors for readability",
                    "Keep headers bold and distinct",
                    "Align numbers to the right, text to the left",
                    "Use theme colors for headers",
                    "Add subtle borders or shadows for definition"
                ]
            }
        
        # Add Icon examples if Icon is predicted
        if "Icon" in predicted_components:
            # Determine appropriate icons based on content
            content_lower = slide_outline.content.lower()
            
            # Feature/benefit icons
            if any(word in content_lower for word in ["feature", "benefit", "advantage"]):
                examples["Icon_feature"] = {
                    "type": "Icon",
                    "props": {
                        "position": {"x": 100, "y": 200},
                        "width": 48,
                        "height": 48,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 3,
                        "iconLibrary": "lucide",
                        "iconName": "Zap",
                        "color": "{accent_1}",  # Will be replaced with theme color
                        "strokeWidth": 2,
                        "filled": False
                    }
                }
            
            # List/bullet point icons
            if self._analyze_slide(slide_outline, 0, DeckOutline(id="temp", title="", slides=[slide_outline]))["has_list"]:
                examples["Icon_list"] = {
                    "type": "Icon",
                    "props": {
                        "position": {"x": 50, "y": 300},
                        "width": 32,
                        "height": 32,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 3,
                        "iconLibrary": "lucide",
                        "iconName": "ChevronRight",
                        "color": "{primary_mid}",
                        "strokeWidth": 2,
                        "filled": False
                    }
                }
            
            # Growth/metrics icons
            if any(word in content_lower for word in ["growth", "increase", "up"]):
                examples["Icon_growth"] = {
                    "type": "Icon",
                    "props": {
                        "position": {"x": 1600, "y": 150},
                        "width": 64,
                        "height": 64,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 3,
                        "iconLibrary": "lucide",
                        "iconName": "TrendingUp",
                        "color": "{accent_2}",
                        "strokeWidth": 2.5,
                        "filled": False
                    }
                }
            
            # Success/achievement icons
            if any(word in content_lower for word in ["success", "achieve", "win", "complete"]):
                examples["Icon_success"] = {
                    "type": "Icon",
                    "props": {
                        "position": {"x": 960, "y": 100},
                        "width": 72,
                        "height": 72,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 3,
                        "iconLibrary": "lucide",
                        "iconName": "Trophy",
                        "color": "{accent_1}",
                        "strokeWidth": 2,
                        "filled": True
                    }
                }
            
            # Default versatile icon
            examples["Icon_default"] = {
                "type": "Icon",
                "props": {
                    "position": {"x": 150, "y": 250},
                    "width": 48,
                    "height": 48,
                    "opacity": 1,
                    "rotation": 0,
                    "zIndex": 3,
                    "iconLibrary": "lucide",
                    "iconName": "Star",
                    "color": "{primary_dark}",
                    "strokeWidth": 2,
                    "filled": False
                }
            }
            
            logger.info(f"  🎯 Added {len([k for k in examples if k.startswith('Icon_')])} Icon examples based on content")
        
        # Load advanced examples. For CustomComponent, prefer bespoke guidance over library examples
        if "CustomComponent" in predicted_components:
            try:
                if self.use_component_library:
                    # PRIORITY 1: Load themed components that use slide theme colors
                    if self.themed_components:
                        themed = self.themed_components.get("themed_custom_components", {})
                        if themed:
                            logger.info("  🎨 Loading THEMED CustomComponents for consistency (env enabled)")
                            if self._contains_statistics(slide_outline.content):
                                hero_stats = themed.get("hero_statistics", {})
                                if hero_stats:
                                    themed_counter = hero_stats.get("themed_animated_counter", {})
                                    if themed_counter:
                                        examples["CustomComponent_themed_counter"] = themed_counter.get("example")
                                    themed_comparison = hero_stats.get("themed_comparison_bars", {})
                                    if themed_comparison:
                                        examples["CustomComponent_themed_comparison"] = themed_comparison.get("example")
                            if self._has_metrics(slide_outline) or "%" in slide_outline.content:
                                data_viz = themed.get("data_visualizations", {})
                                if data_viz:
                                    themed_ring = data_viz.get("themed_progress_ring", {})
                                    if themed_ring:
                                        examples["CustomComponent_themed_progress"] = themed_ring.get("example")
                            text_effects = themed.get("creative_text_effects", {})
                            if text_effects:
                                themed_glow = text_effects.get("themed_glowing_text", {})
                                if themed_glow:
                                    examples["CustomComponent_themed_text"] = themed_glow.get("example")

                    # FALLBACK: Original custom library (if themed not enough)
                    if len([k for k in examples if "CustomComponent" in k]) < 2:
                        custom_lib_file = self.kb_path / "custom_component_library.json"
                        if custom_lib_file.exists():
                            with open(custom_lib_file, 'r') as f:
                                custom_lib = json.load(f)
                                advanced = custom_lib.get("advanced_custom_components", {})
                            if advanced:
                                if self._contains_statistics(slide_outline.content):
                                    hero_stats = advanced.get("hero_statistics", {})
                                    if hero_stats and isinstance(hero_stats, dict):
                                        animated_counter = hero_stats.get("animated_counter_with_particles", {})
                                        if isinstance(animated_counter, dict):
                                            examples["CustomComponent_animated_counter"] = animated_counter.get("example")
                                        split_comparison = hero_stats.get("split_comparison_stat", {})
                                        if isinstance(split_comparison, dict):
                                            examples["CustomComponent_comparison"] = split_comparison.get("example")
                                text_effects = advanced.get("text_effects", {})
                                if text_effects and isinstance(text_effects, dict):
                                    gradient_text = text_effects.get("gradient_text", {})
                                    if isinstance(gradient_text, dict):
                                        examples["CustomComponent_gradient"] = gradient_text.get("example")

                    # Enhanced custom library (optional)
                    enhanced_lib_file = self.kb_path / "custom_component_library_enhanced.json"
                    if enhanced_lib_file.exists():
                        with open(enhanced_lib_file, 'r') as f:
                            enhanced_lib = json.load(f)
                        if self._needs_interaction(slide_outline):
                            interactive = enhanced_lib.get("interactive_components", {})
                            if interactive:
                                if any(word in slide_outline.content.lower() for word in ["quiz", "test", "assessment", "knowledge"]):
                                    quiz = interactive.get("quiz_component", {})
                                    if quiz:
                                        examples["CustomComponent_quiz"] = quiz.get("example")
                                elif any(word in slide_outline.content.lower() for word in ["poll", "vote", "opinion", "feedback"]):
                                    poll = interactive.get("interactive_poll", {})
                                    if poll:
                                        examples["CustomComponent_poll"] = poll.get("example")
                                elif any(word in slide_outline.content.lower() for word in ["calculate", "roi", "budget", "savings"]):
                                    slider = interactive.get("interactive_slider", {})
                                    if slider:
                                        examples["CustomComponent_slider"] = slider.get("example")
                        if self._has_metrics(slide_outline):
                            data_viz = enhanced_lib.get("data_visualizations", {})
                            if data_viz:
                                if any(word in slide_outline.content.lower() for word in ["dashboard", "kpi", "metrics"]):
                                    kpi = data_viz.get("kpi_cards", {})
                                    if kpi:
                                        examples["CustomComponent_kpi"] = kpi.get("example")
                                elif "%" in slide_outline.content:
                                    rings = data_viz.get("animated_progress_rings", {})
                                    if rings:
                                        examples["CustomComponent_progress"] = rings.get("example")
                        if any(word in slide_outline.content.lower() for word in ["timeline", "roadmap", "journey", "process"]):
                            enhancers = enhanced_lib.get("content_enhancers", {})
                            if enhancers:
                                timeline = enhancers.get("interactive_timeline", {})
                                if timeline:
                                    examples["CustomComponent_timeline"] = timeline.get("example")
                        slide_type = getattr(slide_outline, 'slideType', None)
                        if slide_type in ["title", "closing"] or "celebration" in slide_outline.content.lower():
                            effects = enhanced_lib.get("visual_effects", {})
                            if effects:
                                if "celebration" in slide_outline.content.lower() or "success" in slide_outline.content.lower():
                                    particles = effects.get("particle_burst", {})
                                    if particles:
                                        examples["CustomComponent_particles"] = particles.get("example")
                                else:
                                    floating = effects.get("floating_icons", {})
                                    if floating:
                                        examples["CustomComponent_floating"] = floating.get("example")

                # Always include BESPOKE guidance to encourage variety
                examples["CustomComponent_bespoke_guidance"] = {
                    "guidance": "Generate a bespoke, theme-aware JavaScript render using React.createElement only. No libraries, no imports, no JSX. Use props.primaryColor, props.secondaryColor, props.textColor, props.fontFamily. Start with const padding = props.padding || 32; then derive availableWidth/availableHeight; ensure width/height 100% on root; flexDirection: 'column'; avoid overflow; and position a clear title section above content.",
                    "patterns": [
                        "Hero metric with gradient text and subtle shadow",
                        "Split comparison bars with before/after labels",
                        "Dual-ring progress with large center value",
                        "Roadmap chips with connectors using theme accents"
                    ]
                }
                            
                logger.info(f"  ✨ Added {len(examples) - len(predicted_components)} CustomComponent helpers (bespoke-first; library={'on' if self.use_component_library else 'off'})")
            except Exception as e:
                logger.warning(f"Failed to load custom component library: {e}")
            
            # 🎯 ALWAYS suggest icon usage for slides with text content
            # This is outside the custom library try-except to ensure it always runs
            # NOTE: Icons should use the native Icon component, NOT CustomComponent
            # The Icon component is properly defined in our schema
            logger.info("  🎯 Icon component is available for use - AI should use native Icon, not CustomComponent")
                        
        return examples
    
    def _suggest_icon_for_content(self, content: str, icon_guide: Dict[str, Any]) -> str:
        """Suggest an appropriate icon based on content."""
        content_lower = content.lower()
        
        # Get content-specific icons from the guide
        content_icons = icon_guide.get("content_specific_icons", {})
        
        # Check for specific content types
        if any(word in content_lower for word in ["feature", "benefit", "advantage"]):
            icons = content_icons.get("features_and_benefits", {}).get("primary", ["Zap"])
            return icons[0] if icons else "Zap"
        
        elif any(word in content_lower for word in ["growth", "increase", "up"]):
            icons = content_icons.get("metrics_and_data", {}).get("growth", ["TrendingUp"])
            return icons[0] if icons else "TrendingUp"
        
        elif any(word in content_lower for word in ["secure", "security", "protect"]):
            icons = content_icons.get("technology_and_innovation", {}).get("security", ["Shield"])
            return icons[0] if icons else "Shield"
        
        elif any(word in content_lower for word in ["success", "achieve", "win"]):
            icons = content_icons.get("achievements", {}).get("success", ["Trophy"])
            return icons[0] if icons else "Trophy"
        
        elif any(word in content_lower for word in ["communicate", "message", "contact"]):
            icons = content_icons.get("communication", {}).get("messaging", ["MessageSquare"])
            return icons[0] if icons else "MessageSquare"
        
        elif any(word in content_lower for word in ["time", "clock", "schedule"]):
            icons = content_icons.get("metrics_and_data", {}).get("time", ["Clock"])
            return icons[0] if icons else "Clock"
        
        elif any(word in content_lower for word in ["people", "team", "user"]):
            icons = content_icons.get("metrics_and_data", {}).get("people", ["Users"])
            return icons[0] if icons else "Users"
        
        elif any(word in content_lower for word in ["idea", "innovation", "creative"]):
            return "Lightbulb"
        
        elif any(word in content_lower for word in ["target", "goal", "objective"]):
            return "Target"
        
        elif any(word in content_lower for word in ["process", "step", "flow"]):
            return "ArrowRight"
        
        # Default to a versatile icon
        return "Star"
    
    def _needs_interaction(self, slide_outline: SlideOutline) -> bool:
        """Check if slide would benefit from interactive components"""
        interaction_keywords = [
            "quiz", "test", "poll", "vote", "feedback", "choose", "select",
            "calculate", "compare", "explore", "discover", "engage", "interact",
            "decision", "option", "alternative", "scenario"
        ]
        content_lower = slide_outline.content.lower()
        return any(keyword in content_lower for keyword in interaction_keywords)
    
    def _has_metrics(self, slide_outline: SlideOutline) -> bool:
        """Check if slide contains metrics or data"""
        # Check for percentages, numbers, or metric keywords
        import re
        has_numbers = bool(re.search(r'\d+', slide_outline.content))
        has_percentage = '%' in slide_outline.content
        metric_keywords = ["metric", "kpi", "performance", "growth", "increase", "decrease", "revenue", "cost", "roi"]
        has_keywords = any(keyword in slide_outline.content.lower() for keyword in metric_keywords)
        
        return has_numbers or has_percentage or has_keywords
    
    def _get_component_schemas(self, predicted_components: List[str]) -> Dict[str, Any]:
        """Get schemas for the predicted components."""
        return self.schema_extractor.get_component_schemas(predicted_components)
    
    def _get_layout_patterns(self, predicted_components: List[str], slide_outline: SlideOutline) -> List[str]:
        """Get layout patterns based on components."""
        patterns = []
        
        # Load layout patterns from knowledge base
        layout_kb = self.kb_path / "layout.json"
        try:
            with open(layout_kb, 'r') as f:
                layout_data = json.load(f)
        except:
            layout_data = {}
        
        # 🚨 CRITICAL: Visual design requirements FIRST
        patterns.extend([
            "🚨 COMPONENT COUNT: Use only as many components as needed (quality over quantity)",
            "🚨 STRONG VISUAL ELEMENT when appropriate (hero image or data viz)",
            "🚨 NO PLAIN TEXT PARAGRAPHS - use structured text with hierarchy",
            "🚨 APPLY THEME COLORS THROUGHOUT - avoid pure black on pure white",
            "🚨 CREATE VISUAL HIERARCHY WITH 3+ FONT SIZES"
        ])
        
        # 🚨 CRITICAL: Overlap prevention
        patterns.extend([
            "OVERLAP PREVENTION: NO components may overlap - not even 1 pixel!",
            "MINIMUM GAPS: 40px between text blocks, 60px around charts/images",
            "VERTICAL FLOW: Start at y=80, place each component below previous with gap",
            "CHECK BOUNDS: Every component must check position + size against all others"
        ])
        
        # Get specific layout patterns based on slide type
        # Only treat as title if explicitly labeled or very short; avoid stripping content-heavy first slides
        first_title = (slide_outline.title or "").strip()
        is_explicit_title = first_title.lower() in ["title", "cover", "welcome"]
        is_very_short = len(first_title.split()) <= 3
        if is_explicit_title or is_very_short:
            # Title slide layouts
            layout_patterns_data = layout_data.get("layout_patterns", {})
            if isinstance(layout_patterns_data, dict):
                title_layouts = layout_patterns_data.get("title_slides", {})
                if isinstance(title_layouts, dict):
                    patterns.append("\n🎨 TITLE SLIDE LAYOUTS:")
                    for name, layout in title_layouts.items():
                        if isinstance(layout, dict):
                            patterns.append(f"- {name.upper()}: {layout.get('description', '')}")
            patterns.append("REQUIRED: Prefer FULL-BLEED hero image or LEFT-ALIGNED HERO title layout. Avoid 50/50 split by default for title slides.")
        
        elif "Chart" in predicted_components or slide_outline.extractedData:
            # Data slide layouts
            layout_patterns_data = layout_data.get("layout_patterns", {})
            if isinstance(layout_patterns_data, dict):
                data_layouts = layout_patterns_data.get("data_slides", {})
                if isinstance(data_layouts, dict):
                    patterns.append("\n📊 DATA SLIDE LAYOUTS:")
                    for name, layout in data_layouts.items():
                        if isinstance(layout, dict):
                            patterns.append(f"- {name.upper()}: {layout.get('description', '')}")
            patterns.append("REQUIRED: Chart + supporting visuals, not just chart alone")
        
        else:
            # Content slide layouts
            layout_patterns_data = layout_data.get("layout_patterns", {})
            if isinstance(layout_patterns_data, dict):
                content_layouts = layout_patterns_data.get("content_slides", {})
                if isinstance(content_layouts, dict):
                    patterns.append("\n📝 CONTENT SLIDE LAYOUTS:")
                    for name, layout in content_layouts.items():
                        if isinstance(layout, dict):
                            patterns.append(f"- {name.upper()}: {layout.get('description', '')}")
            patterns.append("REQUIRED: Image + text with creative layout")
        
        # Add creative techniques
        layout_patterns_data = layout_data.get("layout_patterns", {})
        if isinstance(layout_patterns_data, dict):
            techniques = layout_patterns_data.get("creative_techniques", {})
            if techniques and isinstance(techniques, dict):
                patterns.append("\n✨ CREATIVE TECHNIQUES:")
                for name, technique in techniques.items():
                    if isinstance(technique, dict):
                        patterns.append(f"- {name.upper()}: {technique.get('description', '')}")
        
        # Add text emphasis techniques
        patterns.extend([
            "\n🎯 TEXT EMPHASIS - SPLIT INTO MULTIPLE BLOCKS:",
            "CRITICAL: Don't put all text in ONE TiptapTextBlock!",
            "",
            "1️⃣ TITLE SPLITTING (MANDATORY for impact):",
            "   - Split titles into 2-3 TiptapTextBlocks",
            "   - Example: 'The Future is Now' becomes:",
            "     * Block 1: 'The' (72pt, muted color, y=200)",
            "     * Block 2: 'FUTURE' (240pt, accent color, bold, y=280)",
            "     * Block 3: 'is Now' (96pt, secondary color, y=480)",
            "",
            "2️⃣ EMPHASIS TECHNIQUES:",
            "   - KEY WORDS: Separate important words into own blocks",
            "   - SIZE VARIETY: 240pt → 96pt → 48pt for hierarchy",
            "   - COLOR CODING: Different colors for different elements",
            "   - POSITIONING: Stagger y-positions for visual flow",
            "",
            "3️⃣ CONTENT SPLITTING:",
            "   - Headers in one block (large, bold)",
            "   - Key points in separate blocks (medium)",
            "   - Supporting text in smaller blocks",
            "",
            "NEVER: One giant text block with everything!",
            "ALWAYS: Multiple blocks with visual hierarchy!"
        ])
        
        # Statistics layouts - MAKE THEM STUNNING!
        if self._contains_statistics(slide_outline.content):
            patterns.extend([
                "\n💯 STATISTICS LAYOUTS - CREATE VISUAL MASTERPIECES:",
                "🚨 CRITICAL: DON'T JUST DISPLAY DATA - MAKE IT UNFORGETTABLE!",
                "",
                "1️⃣ HERO STAT TECHNIQUE (Primary Method):",
                "   - Main number: 240-300pt in BOLD accent color",
                "   - Split into 3 TiptapTextBlocks:",
                "     * Number: '87%' at 280pt, accent color, bold",
                "     * Label: 'Growth Rate' at 96pt, secondary color", 
                "     * Context: 'vs. 23% industry avg' at 48pt, muted",
                "",
                "2️⃣ MULTI-STAT DASHBOARD:",
                "   - 3-4 stats with dramatic size hierarchy",
                "   - Primary: 200pt, Secondary: 120pt, Tertiary: 80pt",
                "   - Different colors for each stat",
                "   - Gradient shapes as backgrounds",
                "",
                "3️⃣ CREATIVE COMPONENTS:",
                "   - kpi_cards for metric dashboards",
                "   - animated_progress_rings for percentages",
                "   - comparison_bars for before/after",
                "   - gauge_chart for single metrics",
                "",
                "4️⃣ VISUAL ENHANCEMENTS:",
                "   - Gradient-filled circles/shapes behind numbers",
                "   - Blur effects for glow/aura (30-50px)",
                "   - Semi-transparent overlays for depth",
                "   - Multiple layers for sophistication",
                "",
                "5️⃣ LAYOUT PATTERNS:",
                "   - CENTER STAGE: One massive stat dominates",
                "   - SPLIT SCREEN: Big stat left, supporting viz right",
                "   - GRID: Multiple stats with clear hierarchy",
                "   - TIMELINE: Stats along visual journey",
                "",
                "REMEMBER: Every number deserves to be a VISUAL HERO!"
            ])
        
        # General creative patterns
        patterns.extend([
            "\n🎯 LAYOUT PRINCIPLES:",
            "HERO LAYOUTS: Large image with text overlay or side-by-side",
            "GRID LAYOUTS: Use 3-column or 2x2 grids for multiple items", 
            "ASYMMETRIC: 60/40 or 70/30 splits for visual interest",
            "LAYERED: Overlap shapes and images with transparency",
            "NEVER: Center everything, list vertically, use same font size"
        ])
        
        # 🎯 ICON USAGE GUIDANCE (functional only)
        patterns.extend([
            "\n🎯 ICON USAGE (functional only):",
            "ALLOWED:",
            "- Bullet point markers beside text (24-32px)",
            "- Inline with headers or labels",
            "- Process step indicators",
            "FORBIDDEN:",
            "- Floating decorative icons",
            "- Background icon patterns",
            "- Icons used to fill empty space",
            "PLACEMENT:",
            "- Left of text with 16-20px gap, vertically centered to text line"
        ])
        
        return patterns
    
    def _get_typography_rules(self, slide_outline: SlideOutline, predicted_components: List[str]) -> List[str]:
        """Get typography rules based on content - ENHANCED."""
        rules = []
        word_count = len(slide_outline.content.split())
        
        # 🚨 CRITICAL: Font application and text container design rules FIRST
        rules.extend([
            "🚨 MANDATORY: Set fontFamily property in EVERY TiptapTextBlock component",
            "🚨 MANDATORY: Use theme fonts - fontFamily MUST match typography.hero_title.family or typography.body_text.family from theme",
            "🚨 NEVER USE 'Inter' unless it's explicitly the theme font! Check theme.typography for correct fonts",
            "🚨 MANDATORY: fontWeight must be 'normal' or 'bold' (NEVER numeric like 400, 600, 700)",
            "✅ DESIGN: For text containers, prefer padding 16–32 (numeric), borderRadius 8–24, and optional semi-transparent theme backgrounds (10–30% opacity) for contrast",
            "🚨 CRITICAL: Include fontFamily in component props, not just in texts array",
            "🚨 EXAMPLE: \"fontFamily\": \"Bebas Neue\", \"padding\": 24, \"borderRadius\": 16, \"backgroundColor\": \"{accent_1}20\", \"fontWeight\": \"bold\"",
            "🚨 CustomComponents: Replace any 'Inter' in render functions with theme fonts!"
        ])
        
        # DRAMATIC: Bold character-based sizing rules for visual impact
        char_count = len(slide_outline.content)
        if word_count < 5:  # Very short (like single stats)
            rules.extend([
                "🎯 MEGA IMPACT: 120-240pt for very short text (1-5 words)",
                "Single statistics MUST use 180-240pt for drama",
                "CRITICAL: Split into multiple TiptapTextBlocks with different sizes/colors",
                "Example: Main number at 240pt, descriptor at 96pt",
                "Use ACCENT COLORS for the main element",
                "HEIGHT: fontSize × 1.4 for single line",
                "USE FULL PAGE: x=80, width=1760 for centered impact",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        elif word_count < 15:
            rules.extend([
                "🔥 BOLD TITLES: 80-120pt for short titles (6-15 words)",
                "CRITICAL: Break into multiple lines for visual hierarchy",
                "Use DIFFERENT COLORS for emphasis words",
                "Example: Important words in accent color, others in primary",
                "HEIGHT: Calculate lines needed, then fontSize × lines × 1.4",
                "Generous white space around text",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        elif word_count < 30:
            rules.extend([
                "📢 COMMANDING HEADERS: 56-80pt for medium titles (16-30 words)",
                "Split strategically - emphasis words on separate lines",
                "Mix font weights: bold for key terms",
                "HEIGHT: fontSize × lines × 1.4 + 20px buffer",
                "Use theme fonts consistently",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        elif word_count < 60:
            rules.extend([
                "BODY: 24-32pt for regular content (31-60 words)",
                "HEIGHT: Calculate based on width - chars_per_line = width / (fontSize × 0.6)",
                "Line height 1.5-1.6 for readability",
                "Left align for easier scanning",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        elif word_count < 100:
            rules.extend([
                "DETAILED: 20-28pt for longer content (61-100 words)",
                "HEIGHT: Use generous multiplier - fontSize × lines × 1.6",
                "Break into smaller chunks if possible",
                "Consider multiple text blocks",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        else:
            rules.extend([
                "DENSE: 18-24pt for very dense content (100+ words)",
                "HEIGHT: fontSize × lines × 1.7 for extra spacing",
                "MUST break into multiple text blocks",
                "Use columns or grid layout for readability",
                "PADDING: 0 (numeric) - NO EXCEPTIONS"
            ])
        
        # Height calculation rules
        rules.extend([
            "CRITICAL HEIGHT FORMULA: Single line = fontSize × 1.2, Multi-line = fontSize × lines × 1.3",
            "ALWAYS add 10-20% buffer to calculated height",
            "For CustomComponent with text: height = fontSize × 1.5 minimum",
            "PADDING: Always set padding: 0 (numeric zero, not string)",
            "NEVER use padding: 20, padding: '0px', or any string value"
        ])
        
        # Special rules for statistics
        if self._contains_statistics(slide_outline.content):
            rules.extend([
                "STATS EMPHASIS: 72-120pt for numbers",
                "Use accent colors for statistical highlights",
                "Consider CustomComponent for animated counting",
                "Isolate stats with generous white space",
                "PADDING: 0 for all stat displays"
            ])
        
        # Chart-specific typography
        if "Chart" in predicted_components:
            rules.append("CHART TITLES: Clear, concise, 48-72pt")
            rules.append("Data labels must be readable at 24pt minimum")
            rules.append("Chart text components: padding: 0")
        
        return rules
    
    def _get_best_practices(self, predicted_components: List[str]) -> List[str]:
        """Get best practices for the predicted components."""
        practices = []
        
        if "Chart" in predicted_components:
            practices.append("Keep charts simple and focused on key insights")
        
        if "CustomComponent" in predicted_components:
            practices.append("CustomComponent render must be a properly formatted string with \\n")
        
        practices.extend([
            "Maintain consistent spacing and alignment",
            "Use theme colors creatively and beautifully",
            "Ensure text and background colors complement each other"
        ])
        
        return practices
    
    def _get_relevant_critical_rules(self, components: List[str], slide_outline: SlideOutline) -> Dict[str, Any]:
        """Get critical rules relevant to this slide with visual storytelling as top priority"""
        rules = {}
        
        # 🎨 VISUAL STORYTELLING IS HIGHEST PRIORITY - Load it first
        try:
            storytelling_file = self.kb_path / "visual_storytelling.json"
            if storytelling_file.exists():
                with open(storytelling_file, 'r') as f:
                    visual_storytelling = json.load(f)
                    # Include the entire visual storytelling knowledge
                    rules["visual_storytelling_mandatory"] = visual_storytelling.get("visual_storytelling_principles", {})
                    rules["transformation_techniques"] = visual_storytelling.get("transformation_techniques", {})
                    rules["emotional_design_triggers"] = visual_storytelling.get("emotional_design_triggers", {})
                    rules["content_extraction_rules"] = visual_storytelling.get("content_extraction_rules", {})
                    rules["mood_based_transformations"] = visual_storytelling.get("mood_based_transformations", {})
                    logger.info("  🎨 Visual storytelling rules loaded - TOP PRIORITY")
        except Exception as e:
            logger.warning(f"Failed to load visual storytelling: {e}")
        
        # 🎯 CONTENT TRANSFORMATIONS - Load content-specific rules
        try:
            transformations_file = self.kb_path / "content_transformations.json"
            if transformations_file.exists():
                with open(transformations_file, 'r') as f:
                    content_transforms = json.load(f)
                    # Detect content type and include relevant transformation
                    content_type = self._detect_content_type(slide_outline)
                    if content_type:
                        rules["content_transformation"] = content_transforms.get("transformation_rules", {}).get(content_type, {})
                        rules["universal_principles"] = content_transforms.get("universal_principles", {})
                        logger.info(f"  🎯 Content transformation rules loaded for: {content_type}")
        except Exception as e:
            logger.warning(f"Failed to load content transformations: {e}")
        
        # Design philosophy from critical rules (includes new visual storytelling elements)
        rules["design_philosophy"] = self.critical_rules.get("design_philosophy", {})
        
        # Visual storytelling mandatory rules from critical_rules.json
        if "visual_storytelling_mandatory" in self.critical_rules:
            critical_storytelling = self.critical_rules["visual_storytelling_mandatory"]
            if isinstance(critical_storytelling, dict):
                # Make sure visual_storytelling_mandatory exists in rules
                if "visual_storytelling_mandatory" not in rules:
                    rules["visual_storytelling_mandatory"] = {}
                rules["visual_storytelling_mandatory"].update(critical_storytelling)
            else:
                # If it's not a dict, log a warning
                logger.warning(f"visual_storytelling_mandatory in critical_rules is not a dict: {type(critical_storytelling)}")
        
        # Always include the summary
        rules["summary"] = self.critical_rules.get("critical_rules_summary", {})
        
        # ALWAYS include color palette rules - CRITICAL FOR CONSISTENCY
        rules["color_palette_rules"] = self.critical_rules.get("color_palette_rules", {})
        
        # ALWAYS include visual design requirements - TOP PRIORITY
        rules["visual_design_requirements"] = self.critical_rules.get("visual_design_requirements", {})
        
        # ALWAYS include beautiful slide checklist
        rules["beautiful_slide_checklist"] = self.critical_rules.get("beautiful_slide_checklist", {})
        
        # ALWAYS include overlap prevention - critical for all slides
        rules["overlap_prevention"] = self.critical_rules.get("overlap_prevention", {})
        
        # ALWAYS include content transformation and inclusion rules - renamed to avoid duplicate
        rules["content_transformation_critical"] = self.critical_rules.get("content_transformation", {})
        rules["content_inclusion"] = self.critical_rules.get("content_inclusion", {})
        
        # Component hierarchy
        rules["component_hierarchy"] = self.critical_rules.get("component_hierarchy", {})
        
        # Creative layouts
        rules["creative_layouts"] = self.critical_rules.get("creative_layouts", {})
        
        # Text component rules
        rules["text_component_rules"] = self.critical_rules.get("text_component_rules", {})
        
        # Slide composition rules
        rules["slide_composition_rules"] = self.critical_rules.get("slide_composition_rules", {})
        
        # Title slide specific
        if slide_outline.title.lower() in ["title", "cover", "welcome"]:
            rules["title_slide"] = self.critical_rules.get("title_slide_requirements", {})
        
        # Data slide specific - CRITICAL CHECK
        if slide_outline.extractedData or "Chart" in components:
            rules["data_slide"] = self.critical_rules.get("data_slide_requirements", {})
            logger.info(f"  📊 Added data slide rules - chart detected")
        
        # Stats emphasis - ENHANCED CHECK
        if self._contains_statistics(slide_outline.content):
            rules["stat_emphasis"] = self.critical_rules.get("stat_emphasis", {})
            logger.info(f"  💯 Added stat emphasis rules - statistics detected")
        
        # Content approach
        word_count = len(slide_outline.content.split())
        if word_count < 20:
            rules["content_approach"] = self.critical_rules.get("minimal_content_approach", {})
        elif word_count > 100:
            rules["content_approach"] = self.critical_rules.get("content_rich_approach", {})
        
        # Always include validation
        rules["validation"] = self.critical_rules.get("technical_validation", {})
        
        # Common mistakes
        rules["common_mistakes"] = self.critical_rules.get("common_mistakes_to_avoid", {})
        
        return rules
    
    def _get_design_philosophy(self) -> Dict[str, Any]:
        """Get design philosophy from critical rules"""
        philosophy = self.critical_rules.get("design_philosophy", {})
        creative = self.critical_rules.get("creative_approaches", {})
        
        # Ensure philosophy is a dict
        if not isinstance(philosophy, dict):
            philosophy = {}
        
        # Ensure creative is a dict
        if not isinstance(creative, dict):
            creative = {}
        
        context = {
            "focus": philosophy.get("focus", []) if isinstance(philosophy, dict) else [],
            "minimal_decoration": philosophy.get("minimal_decoration", []) if isinstance(philosophy, dict) else [],
            "principle": creative.get("principle", "") if isinstance(creative, dict) else "",
            "paths": creative.get("paths", {}) if isinstance(creative, dict) else {}
        }
        
        return context
    
    def _get_creative_guidance(self, slide_outline: SlideOutline, slide_index: int, deck_outline: DeckOutline) -> List[str]:
        """Get creative guidance from prompts content"""
        guidance = []
        
        if not self.creative_content or 'sections' not in self.creative_content:
            return guidance
        
        sections = self.creative_content['sections']
        
        # Always include core creative principles
        if 'transformation_mission' in sections:
            guidance.append(sections['transformation_mission'])
        
        # Include visual hierarchy for all slides
        if 'visual_hierarchy' in sections:
            guidance.append(sections['visual_hierarchy'])
        
        # Include component strategy
        if 'component_strategy' in sections:
            guidance.append(sections['component_strategy'])
        
        # Always include layout narrative for creative layouts
        if 'layout_narrative' in sections:
            guidance.append("\n🎨 CREATIVE LAYOUT PATTERNS:\n" + sections['layout_narrative'])
        
        # Always include color emotion guidance
        if 'color_emotion' in sections:
            guidance.append("\n🌈 COLOR AS VISUAL LANGUAGE:\n" + sections['color_emotion'])
        
        # Always include mandatory transformations
        if 'mandatory_transformations' in sections:
            guidance.append("\n✨ VISUAL TRANSFORMATIONS:\n" + sections['mandatory_transformations'])
        
        # Title slide specific
        if self._analyze_slide(slide_outline, slide_index, deck_outline)["is_title_slide"]:
            if 'design_patterns' in sections:
                guidance.append(sections['design_patterns'])
        
        # Stats specific
        if self._contains_statistics(slide_outline.content):
            if 'emphasis_arsenal' in sections:
                guidance.append(sections['emphasis_arsenal'])
        
        # Include shape guidance if shapes are used
        if 'creative_shapes' in sections:
            guidance.append(sections['creative_shapes'])
        
        # Include custom component guidance
        if 'custom_components' in sections:
            guidance.append(sections['custom_components'])
        
        # Include background design
        if 'background_design' in sections:
            guidance.append(sections['background_design'])
        
        # Include image strategies if images are predicted
        if 'image_strategies' in sections:
            guidance.append(sections['image_strategies'])
        
        # Include icon guidance only when appropriate (lists/bullets/headers/process labels)
        try:
            has_bullets = any(marker in slide_outline.content for marker in ['•', '-', '*', '\n-', '\n•'])
            title_suggests_header = any(k in (slide_outline.title or '').lower() for k in ['overview', 'agenda', 'key', 'summary', 'highlights'])
            if has_bullets or title_suggests_header:
                guidance.append(
                    "ICON USAGE (optional, contextual): Icons are available via the native Icon component. "
                    "Use ONLY when they add clarity to bullets, headers, or labeled steps — not for decoration. "
                    "Do NOT add icons to every text block. "
                    "Use iconLibrary (lucide, heroicons, feather, tabler) and iconName. "
                    "DO NOT use CustomComponent for icons. "
                    "Place icons next to key points; width/height: 24–32 for lists, 48–72 for headers; "
                    "keep a 16–20px gap and vertical centering."
                )
        except Exception:
            # Be safe and skip icon guidance if analysis fails
            pass
        
        return guidance
    
    def _get_theme_adaptations(self, theme: Dict[str, Any], components: List[str]) -> Dict[str, Any]:
        """Get theme-specific adaptations"""
        adaptations = {}
        
        # Extract relevant theme properties
        if theme and isinstance(theme, dict):
            visual_style = theme.get("visual_style", {})
            if isinstance(visual_style, dict):
                theme_style = visual_style.get("style", "modern")
            else:
                theme_style = "modern"
            
            adaptations["style"] = theme_style
            
            # Component-specific adaptations
            if "TiptapTextBlock" in components:
                if theme_style == "bold":
                    adaptations["text_weight"] = "Use heavier weights (700-900)"
                elif theme_style == "elegant":
                    adaptations["text_weight"] = "Use lighter weights (300-500)"
            
            if "Chart" in components:
                color_palette = theme.get("color_palette", {})
                if isinstance(color_palette, dict):
                    primary_bg = color_palette.get("primary_background", "#FFFFFF")
                    adaptations["chart_theme"] = "dark" if primary_bg == "#000000" else "light"
                else:
                    adaptations["chart_theme"] = "light"
        
        return adaptations
    
    def get_batch_contexts(self, slides: List[SlideOutline], deck_outline: DeckOutline, theme: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Get contexts for multiple slides efficiently"""
        contexts = []
        for i, slide in enumerate(slides):
            context = self.get_slide_context(slide, i, deck_outline, theme)
            contexts.append(context)
        return contexts
    
    def get_context_summary(self, context: Dict[str, Any]) -> str:
        """Get a human-readable summary of the context"""
        summary = []
        summary.append(f"Slide: {context.get('slide_info', {}).get('title', 'Unknown')}")
        summary.append(f"Components: {', '.join(context.get('predicted_components', []))}")
        
        # Safely get typography title size
        typography = context.get('typography', {})
        if isinstance(typography, dict):
            title = typography.get('title', {})
            if isinstance(title, dict):
                title_size = title.get('recommended_size', 'N/A')
            else:
                title_size = 'N/A'
        else:
            title_size = 'N/A'
        summary.append(f"Title size: {title_size}")
        
        guidelines = context.get('guidelines', [])
        if guidelines:
            summary.append(f"Key guidelines: {guidelines[0]}")
        return " | ".join(summary) 

    def _detect_content_type(self, slide_outline: SlideOutline) -> Optional[str]:
        """Detect the type of content for transformation rules"""
        content = slide_outline.content.lower()
        
        # Load detection patterns
        try:
            transformations_file = self.kb_path / "content_transformations.json"
            if transformations_file.exists():
                with open(transformations_file, 'r') as f:
                    patterns = json.load(f).get("content_type_detection", {})
                    
                # Check for single statistic
                stat_count = len(re.findall(r'\d+[%$kKmMbB]|\d{1,3}(,\d{3})+', slide_outline.content))
                if stat_count == 1:
                    return "single_statistic"
                elif stat_count > 1 and stat_count <= 5:
                    return "multiple_statistics"
                
                # Check for comparisons
                comparison_keywords = patterns.get("comparison_patterns", [])
                if any(keyword in content for keyword in comparison_keywords):
                    return "comparison_content"
                
                # Check for process
                process_keywords = patterns.get("process_patterns", [])
                if any(keyword in content for keyword in process_keywords):
                    return "process_content"
                
                # Check for quotes
                if '"' in slide_outline.content or '"' in slide_outline.content:
                    return "quote_content"
                
                # Check for CTA
                cta_keywords = ["contact", "call", "email", "start", "begin", "join", "buy", "purchase"]
                if any(keyword in content for keyword in cta_keywords):
                    return "call_to_action_content"
                
                # Check for bullet lists
                if any(marker in slide_outline.content for marker in ["•", "-", "*"]) or re.search(r'\d+\.', slide_outline.content):
                    return "bullet_list_content"
                
                # Check for problem/solution
                if ("problem" in content and "solution" in content) or ("challenge" in content and "answer" in content):
                    return "problem_solution_content"
                    
        except Exception as e:
            logger.warning(f"Failed to detect content type: {e}")
        
        return None 