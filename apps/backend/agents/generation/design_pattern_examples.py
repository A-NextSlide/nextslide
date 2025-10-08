"""
Design Pattern Examples - Show models how to map web patterns to components

These examples demonstrate the mental model:
"I want to create X web pattern" → "Use these components"
"""

def get_hero_stat_pattern_example(theme: dict) -> dict:
    """
    Pattern: Massive centered number with context
    Web thinking: Hero section with dominant statistic
    """
    primary = theme.get('colors', {}).get('primary', '#3B82F6')
    secondary = theme.get('colors', {}).get('secondary', '#8B5CF6')
    
    return {
        'pattern_name': 'Hero Stat',
        'web_description': 'Full-bleed gradient with massive centered number',
        'components': [
            {
                'type': 'Background',
                'props': {
                    'backgroundType': 'gradient',
                    'gradientType': 'linear',
                    'gradientAngle': 135,
                    'gradientStops': [
                        {'color': primary, 'position': 0},
                        {'color': secondary, 'position': 100}
                    ],
                    'opacity': 1
                }
            },
            {
                'type': 'CustomComponent',
                'props': {
                    'position': {'x': 660, 'y': 340},
                    'width': 600,
                    'height': 400,
                    'code': '/* Animated counter - see customcomponent_library */',
                    'initialState': {},
                    'zIndex': 10
                }
            }
        ]
    }

def get_glass_card_grid_pattern_example(theme: dict) -> dict:
    """
    Pattern: Grid of glassmorphism cards
    Web thinking: Card grid with backdrop-blur
    """
    return {
        'pattern_name': 'Glass Card Grid',
        'web_description': '2x2 grid of frosted glass cards with stats',
        'components': [
            # Top left card
            {
                'type': 'Shape',
                'props': {
                    'position': {'x': 140, 'y': 300},
                    'width': 680,
                    'height': 240,
                    'shapeType': 'rectangle',
                    'backgroundColor': '#FFFFFF',
                    'opacity': 0.15,
                    'blur': 15,
                    'borderRadius': 24,
                    'borderWidth': 1,
                    'borderColor': '#FFFFFF',
                    'borderOpacity': 0.2,
                    'zIndex': 5
                }
            },
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 180, 'y': 340},
                    'width': 600,
                    'height': 160,
                    'texts': [
                        {
                            'text': '2.4B',
                            'fontSize': 72,
                            'fontWeight': 900,
                            'textColor': '#FFFFFF',
                            'style': []
                        },
                        {
                            'text': '\\nMarket Size',
                            'fontSize': 24,
                            'fontWeight': 500,
                            'textColor': '#FFFFFF',
                            'style': []
                        }
                    ],
                    'textAlign': 'center',
                    'zIndex': 6
                }
            },
            # Top right card
            {
                'type': 'Shape',
                'props': {
                    'position': {'x': 1100, 'y': 300},
                    'width': 680,
                    'height': 240,
                    'shapeType': 'rectangle',
                    'backgroundColor': '#FFFFFF',
                    'opacity': 0.15,
                    'blur': 15,
                    'borderRadius': 24,
                    'borderWidth': 1,
                    'borderColor': '#FFFFFF',
                    'borderOpacity': 0.2,
                    'zIndex': 5
                }
            },
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 1140, 'y': 340},
                    'width': 600,
                    'height': 160,
                    'texts': [
                        {
                            'text': '135%',
                            'fontSize': 72,
                            'fontWeight': 900,
                            'textColor': '#FFFFFF',
                            'style': []
                        },
                        {
                            'text': '\\nGrowth Rate',
                            'fontSize': 24,
                            'fontWeight': 500,
                            'textColor': '#FFFFFF',
                            'style': []
                        }
                    ],
                    'textAlign': 'center',
                    'zIndex': 6
                }
            },
            # Bottom cards follow same pattern...
        ]
    }

def get_split_screen_pattern_example(theme: dict) -> dict:
    """
    Pattern: 50/50 split with content on each side
    Web thinking: Two-column layout with divider
    """
    primary = theme.get('colors', {}).get('primary', '#3B82F6')
    
    return {
        'pattern_name': 'Split Screen',
        'web_description': '50/50 split - text left, visual right',
        'components': [
            # Dividing line
            {
                'type': 'Shape',
                'props': {
                    'position': {'x': 960, 'y': 200},
                    'width': 2,
                    'height': 680,
                    'shapeType': 'rectangle',
                    'backgroundColor': primary,
                    'opacity': 0.3,
                    'zIndex': 1
                }
            },
            # Left side content
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 120, 'y': 300},
                    'width': 720,
                    'height': 100,
                    'texts': [
                        {
                            'text': 'The Challenge',
                            'fontSize': 64,
                            'fontWeight': 700,
                            'textColor': primary,
                            'style': []
                        }
                    ],
                    'textAlign': 'left',
                    'zIndex': 5
                }
            },
            # Right side visual
            {
                'type': 'CustomComponent',
                'props': {
                    'position': {'x': 1040, 'y': 250},
                    'width': 760,
                    'height': 600,
                    'code': '/* Interactive visualization */',
                    'zIndex': 5
                }
            }
        ]
    }

def get_floating_elements_pattern_example(theme: dict) -> dict:
    """
    Pattern: Overlapping floating elements with depth
    Web thinking: Absolute positioned elements with z-index layering
    """
    primary = theme.get('colors', {}).get('primary', '#3B82F6')
    accent = theme.get('colors', {}).get('accent', '#EC4899')
    
    return {
        'pattern_name': 'Floating Elements',
        'web_description': 'Overlapping elements creating depth and drama',
        'components': [
            # Background image (bottom layer)
            {
                'type': 'Image',
                'props': {
                    'position': {'x': 800, 'y': 200},
                    'width': 1000,
                    'height': 700,
                    'src': 'image_url',
                    'objectFit': 'cover',
                    'opacity': 0.6,
                    'zIndex': 1
                }
            },
            # Floating glass card (middle layer)
            {
                'type': 'Shape',
                'props': {
                    'position': {'x': 100, 'y': 350},
                    'width': 800,
                    'height': 400,
                    'shapeType': 'rectangle',
                    'backgroundColor': '#FFFFFF',
                    'opacity': 0.95,
                    'blur': 20,
                    'borderRadius': 32,
                    'shadowBlur': 60,
                    'shadowColor': '#000000',
                    'shadowOpacity': 0.3,
                    'zIndex': 10
                }
            },
            # Massive number (top layer) - overlaps both
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 600, 'y': 250},
                    'width': 700,
                    'height': 300,
                    'texts': [
                        {
                            'text': '10X',
                            'fontSize': 240,
                            'fontWeight': 900,
                            'textColor': accent,
                            'style': []
                        }
                    ],
                    'textAlign': 'center',
                    'zIndex': 20
                }
            }
        ]
    }

def get_modern_title_pattern_example(theme: dict) -> dict:
    """
    Pattern: Modern title slide with dramatic typography
    Web thinking: Hero section with gradient, huge title, subtle metadata
    """
    primary = theme.get('colors', {}).get('primary', '#3B82F6')
    secondary = theme.get('colors', {}).get('secondary', '#8B5CF6')
    
    return {
        'pattern_name': 'Modern Title',
        'web_description': 'Apple-keynote style title with gradient background',
        'components': [
            # Gradient background
            {
                'type': 'Background',
                'props': {
                    'backgroundType': 'gradient',
                    'gradientType': 'radial',
                    'gradientStops': [
                        {'color': primary, 'position': 0},
                        {'color': secondary, 'position': 100}
                    ],
                    'opacity': 1
                }
            },
            # Massive title - centered with dramatic size
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 240, 'y': 350},
                    'width': 1440,
                    'height': 300,
                    'texts': [
                        {
                            'text': 'The Future',
                            'fontSize': 160,
                            'fontWeight': 900,
                            'textColor': '#FFFFFF',
                            'style': []
                        },
                        {
                            'text': ' is ',
                            'fontSize': 160,
                            'fontWeight': 300,
                            'textColor': '#FFFFFF',
                            'style': []
                        },
                        {
                            'text': 'Now',
                            'fontSize': 160,
                            'fontWeight': 900,
                            'textColor': '#FFFFFF',
                            'style': []
                        }
                    ],
                    'textAlign': 'center',
                    'lineHeight': 1.1,
                    'zIndex': 10
                }
            },
            # Subtle metadata at bottom
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 240, 'y': 920},
                    'width': 1440,
                    'height': 60,
                    'texts': [
                        {
                            'text': 'Presented by Team Alpha • October 2025',
                            'fontSize': 24,
                            'fontWeight': 400,
                            'textColor': '#FFFFFF',
                            'style': []
                        }
                    ],
                    'textAlign': 'center',
                    'opacity': 0.7,
                    'zIndex': 10
                }
            }
        ]
    }

def get_data_visualization_pattern_example(theme: dict) -> dict:
    """
    Pattern: Interactive data visualization with context
    Web thinking: Large CustomComponent for viz, supporting text cards
    """
    primary = theme.get('colors', {}).get('primary', '#3B82F6')
    
    return {
        'pattern_name': 'Data Visualization',
        'web_description': 'Interactive chart with supporting insight cards',
        'components': [
            # Main visualization - takes center stage
            {
                'type': 'CustomComponent',
                'props': {
                    'position': {'x': 140, 'y': 200},
                    'width': 1000,
                    'height': 700,
                    'code': '/* Custom interactive chart code */',
                    'zIndex': 10
                }
            },
            # Insight card - floats on the right
            {
                'type': 'Shape',
                'props': {
                    'position': {'x': 1200, 'y': 300},
                    'width': 600,
                    'height': 500,
                    'shapeType': 'rectangle',
                    'backgroundColor': '#FFFFFF',
                    'opacity': 0.95,
                    'blur': 10,
                    'borderRadius': 24,
                    'shadowBlur': 40,
                    'shadowColor': '#000000',
                    'shadowOpacity': 0.15,
                    'zIndex': 15
                }
            },
            {
                'type': 'TiptapTextBlock',
                'props': {
                    'position': {'x': 1240, 'y': 340},
                    'width': 520,
                    'height': 420,
                    'texts': [
                        {
                            'text': 'Key Insight\\n\\n',
                            'fontSize': 32,
                            'fontWeight': 700,
                            'textColor': primary,
                            'style': []
                        },
                        {
                            'text': 'Revenue increased 135% year-over-year, driven by enterprise adoption.',
                            'fontSize': 24,
                            'fontWeight': 400,
                            'textColor': '#1F2937',
                            'style': []
                        }
                    ],
                    'textAlign': 'left',
                    'zIndex': 16
                }
            }
        ]
    }

# Export all patterns
DESIGN_PATTERNS = {
    'hero_stat': get_hero_stat_pattern_example,
    'glass_card_grid': get_glass_card_grid_pattern_example,
    'split_screen': get_split_screen_pattern_example,
    'floating_elements': get_floating_elements_pattern_example,
    'modern_title': get_modern_title_pattern_example,
    'data_visualization': get_data_visualization_pattern_example
}

def get_pattern_examples_text(theme: dict) -> str:
    """
    Generate examples text showing pattern mappings for prompts.
    """
    text = "DESIGN PATTERN EXAMPLES\\n\\n"
    
    text += "These show how to think in web patterns and output components:\\n\\n"
    
    for pattern_key, pattern_func in DESIGN_PATTERNS.items():
        pattern = pattern_func(theme)
        text += f"═══ {pattern['pattern_name'].upper()} ═══\\n"
        text += f"Web Concept: {pattern['web_description']}\\n"
        text += f"Components Used: {len(pattern['components'])}\\n"
        text += f"Component Types: {', '.join(set(c['type'] for c in pattern['components']))}\\n\\n"
    
    text += "Use these patterns as inspiration. Mix and match. Create variations.\\n"
    text += "The key is: think about the visual effect you want, then map to components.\\n"
    
    return text

