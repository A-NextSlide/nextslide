#!/usr/bin/env python3
"""
Comprehensive Knowledge Base Builder for Slide Generation
This script builds and maintains the knowledge base for the RAG system
"""

import json
import re
from pathlib import Path
from typing import Dict, Any, List
from datetime import datetime
import sys

# Add parent directory to path for imports
sys.path.append(str(Path(__file__).parent.parent.parent))


class ComprehensiveKnowledgeBuilder:
    """Builds comprehensive knowledge base from existing prompts and enhances it"""
    
    def __init__(self):
        self.kb_dir = Path("agents/rag/knowledge_base")
        self.kb_dir.mkdir(parents=True, exist_ok=True)
        self.kb = {}
    
    def build(self):
        """Build the complete knowledge base"""
        print("Building comprehensive knowledge base...")
        
        # Extract from existing prompts
        self._extract_from_prompts()
        
        # Enhance with additional guidelines
        self._add_component_details()
        self._add_design_patterns()
        self._add_typography_enhancements()
        self._add_layout_enhancements()
        self._add_color_theory()
        self._add_emphasis_techniques()
        self._add_chart_enhancements()
        self._add_image_enhancements()
        self._add_animation_guidelines()
        self._add_best_practices()
        self._add_accessibility()
        
        # Add metadata
        self.kb["metadata"] = {
            "version": "1.0.0",
            "generated_at": datetime.now().isoformat(),
            "description": "Comprehensive knowledge base for beautiful slide generation"
        }
        
        # Save everything
        self._save_knowledge_base()
        
        print("Knowledge base build complete!")
    
    def _extract_from_prompts(self):
        """Extract knowledge from existing slide generation prompts"""
        print("Extracting from existing prompts...")
        
        # Since slide_generation_prompts.py was deleted, we'll use hardcoded knowledge
        # This knowledge was previously extracted from the prompts
        content = ""  # Empty content since the file no longer exists
        
        # Extract typography rules
        self._extract_typography(content)
        # Extract layout rules
        self._extract_layout(content)
        # Extract component guidelines
        self._extract_components(content)
    
    def _extract_typography(self, content: str):
        """Extract typography rules from prompt content"""
        self.kb["typography"] = {
            "sizing_rules": {
                "character_based": {
                    "1-10": {
                        "max_size": 480,
                        "recommended": "320-480pt",
                        "ideal_for": "Single word impact",
                        "examples": ["NOW", "2024", "YES!", "BIG"],
                        "tips": [
                            "Use for maximum impact",
                            "Consider viewport - may need to scale down",
                            "Works best with bold weights"
                        ]
                    },
                    "11-20": {
                        "max_size": 360,
                        "recommended": "240-360pt",
                        "ideal_for": "Short impactful phrases",
                        "examples": ["Game Changer", "Think Different", "Next Level"],
                        "tips": [
                            "Great for title slides",
                            "Leave breathing room",
                            "Consider letter-spacing"
                        ]
                    },
                    "21-40": {
                        "max_size": 240,
                        "recommended": "180-240pt",
                        "ideal_for": "Titles and headers",
                        "examples": ["Introducing Our New Product", "Quarterly Sales Results"]
                    },
                    "41-80": {
                        "max_size": 160,
                        "recommended": "120-160pt",
                        "ideal_for": "Subtitles and key points"
                    },
                    "80-200": {
                        "max_size": 80,
                        "recommended": "48-80pt",
                        "ideal_for": "Body text and descriptions"
                    },
                    "200+": {
                        "max_size": 48,
                        "recommended": "30-48pt",
                        "ideal_for": "Dense content, longer paragraphs"
                    },
                    "tables": {
                        "max_size": 24,
                        "recommended": "8-18pt",
                        "ideal_for": "Data tables with many rows",
                        "minimum": 8,
                        "note": "Only for very dense content"
                    }
                },
                "height_calculation": {
                    "single_line": "fontSize × 1.2",
                    "multi_line": "fontSize × lines × 1.3",
                    "safety_buffer": "Add 10-20% extra",
                    "large_text": "If fontSize > 100, add extra 10%",
                    "custom_component": "fontSize × 1.5 minimum"
                }
            },
            "hierarchy": {
                "hero": {
                    "default_family": "Inter",
                    "default_size": 240,
                    "size_range": "240-800pt",
                    "weight": "700-900",
                    "letter_spacing": "-0.02em",
                    "line_height": 0.9,
                    "use_for": "Primary focus, title slides"
                },
                "section": {
                    "default_family": "Inter",
                    "default_size": 144,
                    "size_range": "120-180pt",
                    "weight": "600-700",
                    "letter_spacing": "-0.01em",
                    "line_height": 1.1,
                    "use_for": "Section headers, slide titles"
                },
                "body": {
                    "default_family": "Arial",
                    "default_size": 48,
                    "size_range": "36-64pt",
                    "weight": "400-500",
                    "line_height": 1.5,
                    "use_for": "Main content, descriptions"
                },
                "caption": {
                    "default_family": "Arial",
                    "default_size": 36,
                    "size_range": "24-36pt",
                    "weight": "400",
                    "line_height": 1.4,
                    "use_for": "Image captions, footnotes"
                }
            }
        }
    
    def _extract_layout(self, content: str):
        """Extract layout rules from prompt content"""
        self.kb["layout"] = {
            "grid_system": {
                "canvas": {
                    "width": 1920,
                    "height": 1080,
                    "aspect_ratio": "16:9",
                    "safe_area": {
                        "x": 80,
                        "y": 80,
                        "width": 1760,
                        "height": 920
                    }
                },
                "margins": {
                    "outer": 80,
                    "inner": 60,
                    "minimum": 40,
                    "generous": 120,
                    "edge_cases": {
                        "full_bleed": 0,
                        "breathing_room": 160
                    }
                },
                "columns": {
                    "single": {
                        "x": 80,
                        "width": 1760,
                        "use_for": "Centered content, full-width elements"
                    },
                    "halves": {
                        "left": {"x": 80, "width": 880},
                        "right": {"x": 960, "width": 880},
                        "gap": 80,
                        "use_for": "Side-by-side content, comparisons"
                    },
                    "thirds": {
                        "columns": [
                            {"x": 80, "width": 560},
                            {"x": 680, "width": 560},
                            {"x": 1280, "width": 560}
                        ],
                        "gap": 40,
                        "use_for": "Three options, triads"
                    },
                    "golden_ratio": {
                        "large": {"x": 80, "width": 1104},
                        "small": {"x": 1224, "width": 616},
                        "ratio": 1.618
                    }
                },
                "snap_points": {
                    "x": [80, 240, 400, 560, 720, 880, 960, 1040, 1200, 1360, 1520, 1680, 1840],
                    "y": [80, 120, 240, 360, 480, 540, 600, 720, 840, 960, 1000]
                }
            },
            "spacing": {
                "component_gaps": {
                    "minimum": 40,
                    "standard": 60,
                    "generous": 80,
                    "section_break": 120
                },
                "text_spacing": {
                    "title_to_subtitle": 40,
                    "title_to_body": 60,
                    "paragraph_gap": 40,
                    "list_items": 24
                },
                "overlap_prevention": {
                    "formula": "comp1.x >= comp2.x + comp2.width + 40",
                    "buffer_zones": {
                        "text": 40,
                        "images": 60,
                        "charts": 60
                    }
                }
            },
            "positioning": {
                "center_x": "(1920 - width) / 2",
                "center_y": "(1080 - height) / 2",
                "cumulative": "nextY = prevY + prevHeight + gap",
                "alignment_rules": [
                    "Align to grid points",
                    "Maintain consistent gaps",
                    "Group related elements",
                    "Create visual hierarchy with position"
                ]
            }
        }
    
    def _extract_components(self, content: str):
        """Extract component guidelines from prompt content"""
        self.kb["components"] = {
            "TiptapTextBlock": {
                "description": "Primary text component - use for 99% of text",
                "required_props": ["position", "width", "height", "texts"],
                "critical_rules": {
                    "padding": "Must always be 0 (numeric, not string)",
                    "texts": "Array of text objects with fontSize, color, etc.",
                    "height": "Calculate as fontSize × 1.2 for single line"
                },
                "best_practices": [
                    "Group related text in one component",
                    "Use backgroundColor for text on shapes",
                    "Combine multiple styles in texts array",
                    "Use for tables with small fonts (8pt+)"
                ],
                "common_patterns": {
                    "title_subtitle": {
                        "texts": [
                            {"text": "Main Title", "fontSize": 96},
                            {"text": "Subtitle", "fontSize": 48}
                        ]
                    },
                    "card_with_bg": {
                        "backgroundColor": "#F0F0F0",
                        "borderRadius": "20px",
                        "padding": 0
                    }
                }
            },
            "Chart": {
                "description": "Data visualization component",
                "required_props": ["position", "width", "height", "chartType", "data"],
                "positioning_rules": {
                    "always": "Left or right half, never center",
                    "left": {"x": 80, "width": 880},
                    "right": {"x": 960, "width": 880},
                    "height": "600-800px optimal"
                },
                "theme_detection": {
                    "light_backgrounds": ["#FFFFFF", "#F8F9FA", "#FAFAFA"],
                    "dark_backgrounds": ["#000000", "#1A1A1A", "#121212"],
                    "set_theme": "Based on Background component color"
                },
                "legend_rules": {
                    "bar": False,
                    "column": False,
                    "pie": False,
                    "line": "Only if multiple series",
                    "default": False
                }
            },
            "CustomComponent": {
                "description": "ONLY for animations and special effects",
                "required_props": ["position", "width", "height", "render", "props"],
                "critical_rules": {
                    "render": "Must be escaped string function",
                    "syntax": "Use React.createElement, NEVER JSX",
                    "template": "function render({ props, state, updateState }, instanceId) {...}"
                },
                "valid_use_cases": {
                    "animated_counter": "Numbers that count up",
                    "typewriter": "Text that types itself",
                    "particles": "Special visual effects",
                    "interactions": "Hover/click states"
                },
                "avoid": [
                    "Static text (use TiptapTextBlock)",
                    "Simple styling (use TiptapTextBlock)",
                    "Basic layouts"
                ]
            },
            "Image": {
                "description": "Image display component",
                "required_props": ["position", "width", "height", "src"],
                "src_rule": "ALWAYS use 'placeholder', never URLs",
                "minimum_sizes": {
                    "hero": "1600×900",
                    "feature": "800×600",
                    "card": "400×500",
                    "thumbnail": "200×200"
                },
                "object_fit_options": {
                    "cover": "Default - crops to fill",
                    "contain": "Shows entire image",
                    "fill": "Stretches to fit"
                }
            },
            "Background": {
                "description": "Slide background - first component",
                "required_props": ["position", "width", "height", "backgroundType"],
                "background_types": {
                    "gradient": {
                        "when_to_use": "90% of cases - for dynamic, modern, visually interesting slides",
                        "example": {
                            "position": {"x": 0, "y": 0},
                            "width": 1920,
                            "height": 1080,
                            "backgroundType": "gradient",
                            "gradient": {
                                "type": "linear",
                                "angle": 135,
                                "stops": [
                                    {"color": "#primary_dark", "position": 0},
                                    {"color": "#light_accent", "position": 100}
                                ]
                            }
                        },
                        "patterns": [
                            "Diagonal (135°) for dynamism",
                            "Vertical (0°/180°) for sunrise/sunset effects",
                            "Radial for spotlight focus",
                            "Multi-stop for creative color blends"
                        ]
                    },
                    "color": {
                        "when_to_use": "10% of cases - for minimalist designs, clean looks, or when content needs maximum focus",
                        "example": {
                            "position": {"x": 0, "y": 0},
                            "width": 1920,
                            "height": 1080,
                            "backgroundType": "color",
                            "backgroundColor": "#1E3A5F"
                        },
                        "best_for": [
                            "Text-heavy slides where gradient might be distracting",
                            "Minimalist design aesthetic",
                            "When brand guidelines specify solid colors",
                            "High-contrast requirements"
                        ]
                    }
                },
                "design_guidance": "Choose based on content and aesthetic - gradients add visual interest and depth, solids provide clean simplicity"
            }
        }
    
    def _add_component_details(self):
        """Add detailed component knowledge"""
        # Component combinations and advanced patterns
        self.kb["component_combinations"] = {
            "text_on_image": {
                "components": ["Image", "TiptapTextBlock"],
                "technique": "Image with gradient overlay, text on top",
                "overlay_options": {
                    "gradient": "Linear gradient with 60-80% opacity",
                    "solid": "Black at 60% opacity",
                    "blur": "Backdrop blur for glassmorphism"
                }
            },
            "data_with_insight": {
                "components": ["Chart", "TiptapTextBlock"],
                "layout": "Chart on one half, insights on other",
                "content_strategy": "Chart shows what, text explains why"
            },
            "card_grid": {
                "components": ["TiptapTextBlock", "Image", "Shape"],
                "layouts": {
                    "3_cards": "560px wide each, 40px gaps",
                    "4_cards": "400px wide, 2×2 grid"
                }
            }
        }
    
    def _add_design_patterns(self):
        """Add comprehensive design patterns"""
        self.kb["design_patterns"] = {
            "title_slides": {
                "hero_centered": {
                    "description": "Massive centered title",
                    "components": ["Background", "TiptapTextBlock"],
                    "typography": {
                        "size": "400-600pt",
                        "weight": "900",
                        "alignment": "center"
                    },
                    "tips": [
                        "Use full-bleed background image",
                        "Add gradient overlay for contrast",
                        "Keep it to 1-5 words max"
                    ]
                },
                "split_screen": {
                    "description": "Text and image side by side",
                    "components": ["Background", "Image", "TiptapTextBlock"],
                    "layout": {
                        "image": "Right half (960px wide)",
                        "text": "Left half, vertically centered"
                    }
                },
                "corner_accent": {
                    "description": "Title with decorative element",
                    "components": ["Background", "TiptapTextBlock", "Shape"],
                    "placement": "Title offset, shape in corner"
                }
            },
            "content_slides": {
                "bullet_points": {
                    "description": "Classic list format",
                    "typography": {
                        "title": "96-120pt",
                        "bullets": "48-64pt",
                        "spacing": "24px between items"
                    },
                    "enhancements": [
                        "Use icons instead of bullets",
                        "Reveal points progressively",
                        "Color-code by category"
                    ]
                },
                "comparison": {
                    "description": "Side-by-side comparison",
                    "layouts": {
                        "two_column": "Equal halves with divider",
                        "versus": "Dramatic split with VS in center",
                        "table": "Structured comparison grid"
                    }
                },
                "process_flow": {
                    "description": "Step-by-step visualization",
                    "components": ["TiptapTextBlock", "Shape", "CustomComponent"],
                    "options": [
                        "Horizontal arrow flow",
                        "Vertical timeline",
                        "Circular process"
                    ]
                }
            },
            "data_slides": {
                "single_chart_focus": {
                    "description": "One chart with insights",
                    "layout": "Chart left/right, text opposite",
                    "chart_size": "880×700px",
                    "text_content": [
                        "Key insight as title",
                        "3-4 bullet points explaining",
                        "Call-to-action if needed"
                    ]
                },
                "dashboard": {
                    "description": "Multiple data points",
                    "components": ["Chart", "TiptapTextBlock", "CustomComponent"],
                    "arrangements": [
                        "2×2 grid of smaller charts",
                        "One main chart + 3 KPIs",
                        "Stats row + supporting chart"
                    ]
                },
                "stat_hero": {
                    "description": "Single statistic emphasis",
                    "typography": "300-600pt for number",
                    "enhancements": [
                        "Animated counter",
                        "Progress visualization",
                        "Comparison context"
                    ]
                }
            },
            "closing_slides": {
                "cta": {
                    "description": "Call to action",
                    "components": ["TiptapTextBlock", "Shape"],
                    "styling": {
                        "action": "Large button-style shape",
                        "text": "96-144pt, high contrast",
                        "placement": "Centered or bottom third"
                    }
                },
                "thank_you": {
                    "description": "Closing gratitude",
                    "variations": [
                        "Simple centered text",
                        "With contact info",
                        "With QR code"
                    ]
                },
                "questions": {
                    "description": "Q&A slide",
                    "styling": "Large '?' or 'Questions?' text",
                    "additions": "Contact info, social handles"
                }
            }
        }
    
    def _add_typography_enhancements(self):
        """Add enhanced typography guidelines"""
        self.kb["typography"]["advanced"] = {
            "font_pairing": {
                "classic_elegant": {
                    "heading": "Playfair Display",
                    "body": "Source Sans Pro",
                    "mood": "Traditional, sophisticated",
                    "use_for": "Luxury, editorial, formal"
                },
                "modern_clean": {
                    "heading": "Inter",
                    "body": "Inter",
                    "mood": "Contemporary, minimal",
                    "use_for": "Tech, startups, modern brands"
                },
                "bold_impact": {
                    "heading": "Bebas Neue",
                    "body": "Open Sans",
                    "mood": "Strong, attention-grabbing",
                    "use_for": "Sports, events, bold statements"
                },
                "friendly_approachable": {
                    "heading": "Poppins",
                    "body": "Lato",
                    "mood": "Warm, inviting",
                    "use_for": "Education, community, social"
                }
            },
            "special_effects": {
                "gradient_text": {
                    "technique": "CSS gradient on text",
                    "use_sparingly": "Hero text only",
                    "colors": "2-3 colors max"
                },
                "outlined_text": {
                    "technique": "Stroke without fill",
                    "use_for": "Modern, minimalist",
                    "stroke_width": "2-4px"
                },
                "shadow_depth": {
                    "technique": "Multiple shadows",
                    "creates": "3D effect",
                    "best_at": "Large sizes"
                }
            },
            "readability_optimization": {
                "contrast_requirements": {
                    "minimum": 4.5,
                    "large_text": 3.0,
                    "ideal": 7.0
                },
                "line_length": {
                    "ideal": "45-75 characters",
                    "maximum": "90 characters",
                    "tip": "Shorter for slides"
                },
                "spacing_ratios": {
                    "line_height": "1.5× font size",
                    "paragraph_spacing": "1× font size",
                    "letter_spacing": {
                        "tight": "-0.02em for headlines",
                        "normal": "0 for body",
                        "loose": "0.05em for all caps"
                    }
                }
            }
        }
    
    def _add_layout_enhancements(self):
        """Add advanced layout techniques"""
        self.kb["layout"]["advanced"] = {
            "composition_techniques": {
                "rule_of_thirds": {
                    "grid": "3×3 division",
                    "placement": "Key elements at intersections",
                    "creates": "Dynamic, balanced layouts"
                },
                "golden_ratio": {
                    "value": 1.618,
                    "applications": {
                        "spacing": "Fibonacci sequence",
                        "proportions": "61.8% / 38.2% split"
                    }
                },
                "diagonal_method": {
                    "technique": "45° angle guides",
                    "creates": "Movement and energy",
                    "use_for": "Breaking grid monotony"
                },
                "symmetry_types": {
                    "reflection": "Mirror across axis",
                    "rotation": "Around center point",
                    "translation": "Repeated pattern"
                }
            },
            "whitespace_mastery": {
                "macro_space": {
                    "description": "Large areas of emptiness",
                    "creates": "Elegance, focus",
                    "minimum": "30% of slide"
                },
                "micro_space": {
                    "description": "Small gaps between elements",
                    "consistency": "Use spacing system",
                    "hierarchy": "More space = less related"
                },
                "active_space": {
                    "description": "Whitespace that guides eye",
                    "techniques": [
                        "Leading lines of space",
                        "Isolation for emphasis",
                        "Breathing room for readability"
                    ]
                }
            },
            "responsive_principles": {
                "safe_areas": {
                    "projection": "10% margin for variability",
                    "different_ratios": "Test 4:3 and 16:10",
                    "text_safety": "Keep critical info centered"
                },
                "scalable_layouts": {
                    "percentage_based": "Use relative sizing",
                    "anchor_points": "Fix to corners/edges",
                    "fluid_grids": "Columns that adapt"
                }
            }
        }
    
    def _add_color_theory(self):
        """Add comprehensive color theory"""
        self.kb["color_theory"] = {
            "psychology": {
                "red": {
                    "emotions": ["Energy", "Urgency", "Passion", "Danger"],
                    "physiological": "Increases heart rate",
                    "use_for": ["CTAs", "Warnings", "Sales", "Food"],
                    "cultural_notes": "Lucky in China, danger in West"
                },
                "blue": {
                    "emotions": ["Trust", "Calm", "Professional", "Cold"],
                    "physiological": "Lowers blood pressure",
                    "use_for": ["Corporate", "Tech", "Finance", "Healthcare"],
                    "shades": {
                        "navy": "Authority, tradition",
                        "sky": "Freedom, optimism",
                        "teal": "Clarity, communication"
                    }
                },
                "green": {
                    "emotions": ["Growth", "Nature", "Money", "Health"],
                    "physiological": "Easiest on eyes",
                    "use_for": ["Environment", "Finance", "Health", "Organic"],
                    "shades": {
                        "forest": "Stability, wealth",
                        "lime": "Energy, freshness",
                        "mint": "Calm, cleanliness"
                    }
                },
                "yellow": {
                    "emotions": ["Happiness", "Caution", "Energy"],
                    "physiological": "Stimulates mental activity",
                    "use_for": ["Warnings", "Children", "Optimism"],
                    "note": "Use sparingly - can cause strain"
                },
                "purple": {
                    "emotions": ["Luxury", "Creativity", "Mystery"],
                    "historical": "Royalty (expensive dye)",
                    "use_for": ["Premium", "Beauty", "Spiritual"]
                },
                "orange": {
                    "emotions": ["Friendly", "Confident", "Cheerful"],
                    "physiological": "Stimulates activity",
                    "use_for": ["CTA buttons", "Sports", "Youth"]
                },
                "black": {
                    "emotions": ["Sophistication", "Power", "Elegance"],
                    "use_for": ["Luxury", "Fashion", "Tech"],
                    "tip": "Rarely pure black - use #0A0A0A"
                },
                "white": {
                    "emotions": ["Purity", "Space", "Cleanliness"],
                    "use_for": ["Minimal", "Health", "Tech"],
                    "tip": "Off-white (#FAFAFA) easier on eyes"
                }
            },
            "color_schemes": {
                "monochromatic": {
                    "description": "Single hue, varied lightness/saturation",
                    "formula": "Base + tints/shades",
                    "mood": "Cohesive, sophisticated",
                    "example": ["#0066CC", "#3385D6", "#6699E0", "#99BBEB", "#CCE0F5"]
                },
                "analogous": {
                    "description": "Adjacent on color wheel",
                    "formula": "Base ± 30°",
                    "mood": "Harmonious, natural",
                    "example": ["Blue", "Blue-violet", "Violet"]
                },
                "complementary": {
                    "description": "Opposite on wheel",
                    "formula": "Base + 180°",
                    "mood": "High contrast, vibrant",
                    "tip": "Use 80/20 ratio"
                },
                "split_complementary": {
                    "description": "Base + two adjacent to complement",
                    "formula": "Base, (complement ± 30°)",
                    "mood": "Vibrant but less tension"
                },
                "triadic": {
                    "description": "Three equidistant colors",
                    "formula": "Base + 120° + 240°",
                    "mood": "Vibrant, balanced",
                    "ratio": "60-30-10"
                },
                "tetradic": {
                    "description": "Two complementary pairs",
                    "formula": "Rectangle on wheel",
                    "mood": "Rich, complex",
                    "warning": "Difficult to balance"
                }
            },
            "practical_application": {
                "60_30_10_rule": {
                    "60%": "Dominant/background (usually neutral)",
                    "30%": "Secondary/support (brand color)",
                    "10%": "Accent/CTA (high contrast)"
                },
                "contrast_hierarchy": {
                    "highest": "CTA buttons, key stats",
                    "high": "Headings, important info",
                    "medium": "Body text, standard elements",
                    "low": "Decorative, backgrounds"
                },
                "accessibility_safe": {
                    "combinations": [
                        {"bg": "#FFFFFF", "text": "#000000", "ratio": 21},
                        {"bg": "#000000", "text": "#FFFFFF", "ratio": 21},
                        {"bg": "#FFFFFF", "text": "#595959", "ratio": 7.0},
                        {"bg": "#000000", "text": "#969696", "ratio": 7.0}
                    ],
                    "tools": ["WebAIM Contrast Checker", "Stark", "Able"]
                }
            }
        }
    
    def _add_emphasis_techniques(self):
        """Add techniques for emphasizing content"""
        self.kb["emphasis_techniques"] = {
            "size_contrast": {
                "ratios": {
                    "subtle": "1.5×",
                    "moderate": "2-3×",
                    "dramatic": "4-5×",
                    "extreme": "8-10×"
                },
                "application": "Make important elements 2-3× larger"
            },
            "color_emphasis": {
                "techniques": {
                    "isolation": "One color in grayscale",
                    "contrast": "Complementary color",
                    "saturation": "Bright vs muted",
                    "temperature": "Warm vs cool"
                }
            },
            "spatial_emphasis": {
                "isolation": {
                    "description": "Surround with whitespace",
                    "minimum_space": "2× element size",
                    "creates": "Immediate focus"
                },
                "positioning": {
                    "center": "Natural focal point",
                    "golden_ratio": "Pleasing off-center",
                    "rule_of_thirds": "Dynamic placement"
                }
            },
            "motion_emphasis": {
                "entrance": {
                    "fade": "Subtle appearance",
                    "slide": "Directional attention",
                    "scale": "Growing importance",
                    "rotate": "Playful energy"
                },
                "continuous": {
                    "pulse": "Breathing effect",
                    "float": "Gentle movement",
                    "rotate": "Constant motion"
                }
            },
            "statistical_emphasis": {
                "techniques": {
                    "isolation": "Number alone on slide",
                    "comparison": "Before/after",
                    "visualization": "Chart or icon",
                    "animation": "Counting up"
                },
                "formatting": {
                    "large_numbers": "Use K, M, B",
                    "decimals": "Max 1-2 places",
                    "context": "Always provide",
                    "color": "Green up, red down"
                }
            }
        }
    
    def _add_chart_enhancements(self):
        """Add enhanced charting guidelines"""
        if "chart_guidelines" not in self.kb:
            self.kb["chart_guidelines"] = {}
        
        self.kb["chart_guidelines"]["enhanced"] = {
            "chart_selection_matrix": {
                "comparison": {
                    "few_items": "bar",
                    "many_items": "column",
                    "over_time": "line",
                    "parts_of_whole": "pie"
                },
                "relationship": {
                    "correlation": "scatter",
                    "distribution": "histogram",
                    "flow": "sankey"
                },
                "composition": {
                    "static": "pie",
                    "over_time": "stacked_area",
                    "hierarchical": "treemap"
                }
            },
            "data_storytelling": {
                "techniques": {
                    "annotation": "Call out key points",
                    "progression": "Reveal data in stages",
                    "comparison": "Benchmark lines",
                    "forecast": "Dotted projection lines"
                },
                "narrative_flow": {
                    "setup": "Context and baseline",
                    "conflict": "Problem or change",
                    "resolution": "Insight or action"
                }
            },
            "visual_enhancement": {
                "declutter": [
                    "Remove unnecessary gridlines",
                    "Simplify axis labels",
                    "Direct label instead of legend",
                    "Round numbers appropriately"
                ],
                "highlight": {
                    "techniques": [
                        "Color one bar differently",
                        "Add reference line",
                        "Use arrows for trends",
                        "Gradient for progression"
                    ]
                },
                "animation": {
                    "entrance": "Bars grow, lines draw",
                    "transition": "Smooth morphing",
                    "interaction": "Hover details"
                }
            }
        }
    
    def _add_image_enhancements(self):
        """Add enhanced image guidelines"""
        if "image_guidelines" not in self.kb:
            self.kb["image_guidelines"] = {}
        
        self.kb["image_guidelines"]["enhanced"] = {
            "composition_rules": {
                "rule_of_thirds": "Place subjects at intersections",
                "leading_lines": "Guide eye to focal point",
                "framing": "Use natural frames",
                "symmetry": "For formal, balanced feel",
                "patterns": "For visual interest"
            },
            "treatment_techniques": {
                "overlays": {
                    "gradient": {
                        "linear": "Top-down for text at bottom",
                        "radial": "Center focus vignette",
                        "directional": "Guide eye movement"
                    },
                    "color": {
                        "brand": "Unify with brand color",
                        "duotone": "Two-color treatment",
                        "multiply": "Darken for text"
                    }
                },
                "filters": {
                    "blur": {
                        "background": "3-5px for depth",
                        "foreground": "Selective focus"
                    },
                    "color_grading": {
                        "warm": "Orange/yellow tint",
                        "cool": "Blue/green tint",
                        "desaturated": "Professional look"
                    }
                },
                "masks": {
                    "geometric": "Circle, hexagon, etc.",
                    "organic": "Blob, wave shapes",
                    "text": "Image inside letters"
                }
            },
            "layout_systems": {
                "editorial": {
                    "full_bleed": "Edge to edge impact",
                    "margin_wrap": "Text flows around",
                    "cutout": "Subject extends out"
                },
                "grid_based": {
                    "modular": "Consistent sizing",
                    "masonry": "Pinterest-style varied",
                    "mosaic": "Artistic arrangement"
                },
                "asymmetric": {
                    "off_center": "Dynamic tension",
                    "overlapping": "Layered depth",
                    "diagonal": "Energy and movement"
                }
            }
        }
    
    def _add_animation_guidelines(self):
        """Add animation and motion guidelines"""
        self.kb["animation"] = {
            "principles": {
                "timing": {
                    "instant": "0-100ms - immediate feedback",
                    "fast": "200-300ms - UI transitions",
                    "normal": "400-500ms - content entrance",
                    "slow": "600-1000ms - dramatic effect",
                    "very_slow": "1000-2000ms - complex sequences"
                },
                "easing": {
                    "linear": "Constant speed - mechanical",
                    "ease_in": "Slow start - anticipation",
                    "ease_out": "Slow end - natural stop",
                    "ease_in_out": "S-curve - smooth",
                    "spring": "Bounce - playful",
                    "custom_bezier": "Brand-specific curves"
                },
                "properties": {
                    "transform": "Position, scale, rotate - GPU accelerated",
                    "opacity": "Fade effects - smooth",
                    "filter": "Blur, brightness - expensive",
                    "path": "SVG animations - complex"
                }
            },
            "choreography": {
                "sequential": {
                    "description": "One after another",
                    "delay_between": "50-200ms",
                    "use_for": "List reveals, steps"
                },
                "parallel": {
                    "description": "All together",
                    "synchronization": "Same duration",
                    "use_for": "Related elements"
                },
                "staggered": {
                    "description": "Overlapping cascade",
                    "overlap": "30-70%",
                    "creates": "Smooth flow"
                }
            },
            "purpose_driven": {
                "attention": {
                    "pulse": "Subtle size change",
                    "shake": "Horizontal movement",
                    "bounce": "Vertical movement"
                },
                "transition": {
                    "crossfade": "Scene changes",
                    "slide": "Linear progression",
                    "zoom": "Detail focus"
                },
                "feedback": {
                    "success": "Green checkmark draw",
                    "error": "Red shake",
                    "loading": "Spinner or progress"
                }
            },
            "performance": {
                "optimize": [
                    "Use transform over position",
                    "Animate opacity carefully",
                    "Avoid animating layout properties",
                    "Use will-change sparingly"
                ],
                "test": [
                    "On slower devices",
                    "With multiple animations",
                    "During transitions"
                ]
            }
        }
    
    def _add_best_practices(self):
        """Add general best practices"""
        self.kb["best_practices"] = {
            "design_process": {
                "content_first": [
                    "Understand the message",
                    "Identify key points",
                    "Structure narrative",
                    "Then design"
                ],
                "audience_centered": [
                    "Consider viewing distance",
                    "Account for environment",
                    "Match expectations",
                    "Test readability"
                ],
                "iterative": [
                    "Start with wireframes",
                    "Get feedback early",
                    "Refine progressively",
                    "Test on device"
                ]
            },
            "visual_hierarchy": {
                "techniques": {
                    "size": "Bigger = more important",
                    "color": "Contrast draws attention",
                    "space": "Isolation emphasizes",
                    "position": "Top/center prioritized",
                    "style": "Bold, italic, underline"
                },
                "scanning_patterns": {
                    "F_pattern": "Top-left to right, down",
                    "Z_pattern": "Diagonal scanning",
                    "focal_point": "Natural center attention"
                }
            },
            "consistency": {
                "maintain": [
                    "Color palette throughout",
                    "Font families (max 2)",
                    "Spacing system",
                    "Visual style",
                    "Animation timing"
                ],
                "vary": [
                    "Layouts for interest",
                    "Emphasis techniques",
                    "Content density"
                ]
            },
            "common_mistakes": {
                "typography": [
                    "Too small for viewing distance",
                    "Poor contrast with background",
                    "Too many fonts",
                    "Centered body text",
                    "Inconsistent sizing"
                ],
                "layout": [
                    "Overcrowding",
                    "Inconsistent margins",
                    "No visual hierarchy",
                    "Random positioning",
                    "Ignoring alignment"
                ],
                "color": [
                    "Too many colors",
                    "Clashing combinations",
                    "Poor contrast",
                    "Ignoring brand",
                    "No consistency"
                ],
                "content": [
                    "Too much text",
                    "No clear message",
                    "Missing context",
                    "Jargon overload",
                    "No call to action"
                ]
            },
            "quality_checklist": [
                "Is the main message clear?",
                "Can it be read from back of room?",
                "Does it follow brand guidelines?",
                "Is there visual hierarchy?",
                "Are animations purposeful?",
                "Is it accessible?",
                "Does it tell a story?"
            ]
        }
    
    def _add_accessibility(self):
        """Add accessibility guidelines"""
        self.kb["accessibility"] = {
            "color_contrast": {
                "WCAG_levels": {
                    "AAA": {
                        "normal_text": 7.0,
                        "large_text": 4.5,
                        "description": "Enhanced level"
                    },
                    "AA": {
                        "normal_text": 4.5,
                        "large_text": 3.0,
                        "description": "Minimum level"
                    }
                },
                "testing_tools": [
                    "WebAIM Contrast Checker",
                    "Stark (Figma/Sketch)",
                    "Chrome DevTools",
                    "Wave"
                ],
                "safe_combinations": [
                    {"bg": "#FFFFFF", "text": "#000000", "ratio": 21},
                    {"bg": "#000000", "text": "#FFFFFF", "ratio": 21},
                    {"bg": "#FFFFFF", "text": "#595959", "ratio": 7.0},
                    {"bg": "#000000", "text": "#969696", "ratio": 7.0}
                ]
            },
            "typography": {
                "minimum_sizes": {
                    "presentation": "24pt absolute minimum",
                    "handout": "12pt minimum",
                    "captions": "14pt minimum"
                },
                "readability": {
                    "fonts": "Sans-serif preferred",
                    "line_height": "1.5× minimum",
                    "line_length": "45-75 characters",
                    "justification": "Left-align body text"
                }
            },
            "color_blindness": {
                "types": {
                    "protanopia": "No red",
                    "deuteranopia": "No green", 
                    "tritanopia": "No blue",
                    "achromatopsia": "No color"
                },
                "strategies": [
                    "Don't rely on color alone",
                    "Use patterns or labels",
                    "Test with simulators",
                    "High contrast always works"
                ]
            },
            "motion": {
                "considerations": [
                    "Respect prefers-reduced-motion",
                    "Provide pause controls",
                    "No flashing >3Hz",
                    "Essential info not only in animation"
                ]
            },
            "screen_readers": {
                "support": [
                    "Logical reading order",
                    "Descriptive alt text",
                    "Proper heading hierarchy",
                    "Meaningful link text"
                ]
            }
        }
    
    def _save_knowledge_base(self):
        """Save the knowledge base to files"""
        # Save complete knowledge base
        complete_path = self.kb_dir / "complete_knowledge_base.json"
        with open(complete_path, 'w') as f:
            json.dump(self.kb, f, indent=2)
        print(f"✓ Saved complete knowledge base to {complete_path}")
        
        # Save individual sections for easier editing
        for section, content in self.kb.items():
            if section != "metadata" and isinstance(content, dict):
                section_path = self.kb_dir / f"{section}.json"
                with open(section_path, 'w') as f:
                    json.dump(content, f, indent=2)
                print(f"✓ Saved {section} to {section_path}")
        
        # Create index file
        index = {
            "description": "Slide Generation Knowledge Base Index",
            "version": self.kb["metadata"]["version"],
            "generated": self.kb["metadata"]["generated_at"],
            "sections": list(self.kb.keys()),
            "files": {
                "complete": "complete_knowledge_base.json",
                "sections": {
                    section: f"{section}.json" 
                    for section in self.kb.keys() 
                    if section != "metadata"
                }
            },
            "usage": {
                "complete": "Load complete_knowledge_base.json for all knowledge",
                "sections": "Load individual section files for specific topics",
                "editing": "Edit section files and rebuild to update"
            }
        }
        
        with open(self.kb_dir / "index.json", 'w') as f:
            json.dump(index, f, indent=2)
        print(f"✓ Created index file")
        
        # Create a README
        readme_content = """# Slide Generation Knowledge Base

This directory contains the comprehensive knowledge base for the slide generation RAG system.

## Structure

- `complete_knowledge_base.json` - Complete knowledge base in one file
- `index.json` - Index of all files and sections
- Individual section files (e.g., `components.json`, `typography.json`)

## Sections

1. **components** - Guidelines for each component type
2. **typography** - Font sizing, hierarchy, and pairing
3. **layout** - Grid system, spacing, and positioning
4. **color_theory** - Color psychology and combinations
5. **design_patterns** - Common slide layouts and patterns
6. **emphasis_techniques** - How to make content stand out
7. **chart_guidelines** - Data visualization best practices
8. **image_guidelines** - Image layouts and treatments
9. **animation** - Motion and transition guidelines
10. **best_practices** - General design principles
11. **accessibility** - Making slides accessible to all

## Usage

The RAG system will load relevant sections based on the slide being generated.

## Editing

1. Edit individual section JSON files
2. Run `python agents/rag/build_comprehensive_kb.py` to rebuild
3. Test changes with sample slide generation

## Version

Current version: 1.0.0
"""
        
        with open(self.kb_dir / "README.md", 'w') as f:
            f.write(readme_content)
        print(f"✓ Created README")
        
        print(f"\n✅ Knowledge base build complete!")
        print(f"📁 Location: {self.kb_dir}")
        print(f"📄 Files created: {len(list(self.kb_dir.glob('*.json')))}")


if __name__ == "__main__":
    builder = ComprehensiveKnowledgeBuilder()
    builder.build() 