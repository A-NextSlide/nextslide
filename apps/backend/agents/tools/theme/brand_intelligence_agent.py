#!/usr/bin/env python3
"""
Brand Intelligence Agent - Intelligently extracts and understands brand assets
from minimal context using AI reasoning, not hardcoded rules.
"""

import asyncio
import re
from typing import Dict, Any, List, Optional
from datetime import datetime
import os

from dotenv import load_dotenv
from openai import OpenAI

# Load environment variables
load_dotenv()
from agents.tools.theme.holistic_brand_extractor import HolisticBrandExtractor
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class BrandIntelligenceAgent:
    """Intelligent agent that understands brand context and extracts assets automatically."""
    
    def __init__(self):
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.holistic_extractor = HolisticBrandExtractor()
        
        # Common brand URL patterns (for bootstrapping, not hardcoding everything)
        self.url_patterns = {
            'spotify': 'https://www.spotify.com',
            'airbnb': 'https://www.airbnb.com', 
            'netflix': 'https://www.netflix.com',
            'youtube': 'https://www.youtube.com',
            'instagram': 'https://www.instagram.com',
            'facebook': 'https://www.facebook.com',
            'google': 'https://www.google.com',
            'apple': 'https://www.apple.com',
            'microsoft': 'https://www.microsoft.com',
            'amazon': 'https://www.amazon.com',
            'tesla': 'https://www.tesla.com',
            'nike': 'https://www.nike.com',
            'adidas': 'https://www.adidas.com',
            'coca-cola': 'https://www.coca-cola.com',
            'mcdonalds': 'https://www.mcdonalds.com',
            'starbucks': 'https://www.starbucks.com',
            'uber': 'https://www.uber.com',
            'slack': 'https://slack.com',
            'zoom': 'https://zoom.us',
            'shopify': 'https://www.shopify.com',
            'instacart': 'https://www.instacart.com'
        }
    
    async def analyze_brand_from_context(self, user_input: str, presentation_context: Dict[str, Any] = None) -> Dict[str, Any]:
        """
        Intelligently analyze brand requirements from user context.
        
        Args:
            user_input: User's request (e.g., "Create a Spotify pitch deck")
            presentation_context: Additional context about the presentation
            
        Returns:
            Complete brand analysis with assets
        """
        
        print(f"🧠 Analyzing brand context from: '{user_input}'")
        
        # Step 1: Extract brand names and context using AI
        brand_context = await self._extract_brand_context(user_input, presentation_context)
        
        if not brand_context.get('brands'):
            print("   ❌ No brands detected in context")
            return {'success': False, 'reason': 'No brands detected'}
        
        # Step 2: For each brand, get complete assets
        brand_results = []
        for brand_info in brand_context['brands']:
            brand_name = brand_info['name']
            brand_url = brand_info.get('url')
            
            print(f"   🎯 Processing brand: {brand_name}")
            
            # Get brand assets intelligently
            brand_assets = await self._get_intelligent_brand_assets(brand_name, brand_url)
            
            if brand_assets.get('success'):
                # Step 3: Use AI to analyze color semantics
                semantic_analysis = await self._analyze_color_semantics_with_ai(
                    brand_name, brand_assets
                )
                brand_assets.update(semantic_analysis)
                
                brand_results.append({
                    'brand_name': brand_name,
                    'brand_url': brand_url,
                    'assets': brand_assets,
                    'context': brand_info.get('context', {})
                })
        
        return {
            'success': True,
            'brands': brand_results,
            'original_context': brand_context,
            'extraction_timestamp': datetime.now().isoformat()
        }
    
    async def _extract_brand_context(self, user_input: str, presentation_context: Dict = None) -> Dict[str, Any]:
        """Use AI to extract brand context from user input."""
        
        context_prompt = f"""
        Analyze this user request and extract brand context:
        
        User Input: "{user_input}"
        Additional Context: {presentation_context or {}}
        
        Extract:
        1. Brand names mentioned (companies, products, services)
        2. Likely website URLs for each brand
        3. The presentation context (pitch deck, marketing materials, etc.)
        4. Brand relationship (client, competitor, inspiration, etc.)
        
        Respond in JSON format:
        {{
            "brands": [
                {{
                    "name": "Brand Name",
                    "url": "https://www.brand.com",
                    "context": {{
                        "relationship": "client|competitor|inspiration|target",
                        "presentation_type": "pitch_deck|marketing|analysis",
                        "confidence": 0.95
                    }}
                }}
            ],
            "overall_context": "Brief description of what user wants"
        }}
        """
        
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a brand intelligence expert. Analyze user requests and extract brand context. Always respond in valid JSON format."},
                    {"role": "user", "content": context_prompt}
                ],
                temperature=0.3
            )
            
            # Parse JSON response
            import json
            result = json.loads(response.choices[0].message.content.strip())
            
            # Enrich with URL patterns if missing
            for brand in result.get('brands', []):
                if not brand.get('url'):
                    brand_key = brand['name'].lower().replace(' ', '').replace('-', '')
                    if brand_key in self.url_patterns:
                        brand['url'] = self.url_patterns[brand_key]
                        print(f"   🔗 Auto-resolved {brand['name']} → {brand['url']}")
            
            return result
            
        except Exception as e:
            logger.error(f"Failed to extract brand context: {e}")
            
            # Fallback: simple brand name detection
            brand_names = []
            for pattern_name, url in self.url_patterns.items():
                if pattern_name in user_input.lower():
                    brand_names.append({
                        'name': pattern_name.title(),
                        'url': url,
                        'context': {'confidence': 0.7, 'method': 'fallback'}
                    })
            
            return {
                'brands': brand_names,
                'overall_context': 'Extracted using fallback pattern matching'
            }
    
    async def _get_intelligent_brand_assets(self, brand_name: str, brand_url: Optional[str]) -> Dict[str, Any]:
        """Get complete brand assets intelligently."""
        
        if not brand_url:
            print(f"      ❌ No URL available for {brand_name}")
            return {'success': False, 'reason': 'No URL available'}
        
        try:
            # Use our holistic extractor  
            async with self.holistic_extractor:
                result = await self.holistic_extractor.extract_complete_brand(brand_name, brand_url)
            
            if result.get('final_colors'):
                return {
                    'success': True,
                    'colors': result['final_colors'],
                    'fonts': result.get('final_fonts', []),
                    'logo_url': result.get('website_logo_url'),
                    'extraction_method': result.get('extraction_method'),
                    'confidence_score': result.get('confidence_score', 0),
                    'sources': result.get('sources', []),
                    'color_categories': result.get('color_categories', {}),
                    'raw_result': result
                }
            else:
                return {'success': False, 'reason': 'No colors extracted'}
                
        except Exception as e:
            logger.error(f"Failed to extract assets for {brand_name}: {e}")
            return {'success': False, 'reason': str(e)}
    
    async def _analyze_color_semantics_with_ai(self, brand_name: str, brand_assets: Dict[str, Any]) -> Dict[str, Any]:
        """Use AI to understand color semantics instead of hardcoded rules."""
        
        colors = brand_assets.get('colors', [])
        if not colors:
            return {'semantic_roles': {}}
        
        semantic_prompt = f"""
        Analyze these brand colors for {brand_name} and determine their semantic roles:
        
        Colors: {colors[:8]}
        
        Based on your knowledge of {brand_name}'s brand identity, categorize these colors by their likely usage:
        
        Consider:
        1. Which color is the PRIMARY brand color (most recognizable)?
        2. Which colors are used for BACKGROUNDS (light, neutral)?
        3. Which colors are used for ACCENTS/HIGHLIGHTS (vibrant, attention-grabbing)?
        4. Which colors are used for TEXT (readable, high contrast)?
        5. Which are NEUTRAL/SUPPORTING colors?
        
        Respond in JSON format:
        {{
            "primary_brand_color": "#COLOR",
            "background_colors": ["#COLOR1", "#COLOR2"],
            "accent_colors": ["#COLOR1", "#COLOR2"],
            "text_colors": ["#COLOR1", "#COLOR2"], 
            "neutral_colors": ["#COLOR1"],
            "reasoning": "Brief explanation of color roles for this brand"
        }}
        """
        
        try:
            response = self.openai_client.chat.completions.create(
                model="gpt-4",
                messages=[
                    {"role": "system", "content": "You are a color semantics expert. Analyze brand colors and determine their semantic roles. Always respond in valid JSON format."},
                    {"role": "user", "content": semantic_prompt}
                ],
                temperature=0.2
            )
            
            import json
            semantic_analysis = json.loads(response.choices[0].message.content.strip())
            
            print(f"      🎨 AI semantic analysis:")
            print(f"         Primary: {semantic_analysis.get('primary_brand_color')}")
            print(f"         Backgrounds: {semantic_analysis.get('background_colors', [])[:2]}")
            print(f"         Accents: {semantic_analysis.get('accent_colors', [])[:2]}")
            
            return {'semantic_roles': semantic_analysis}
            
        except Exception as e:
            logger.error(f"AI semantic analysis failed: {e}")
            return {'semantic_roles': {}}
    
    async def get_slide_generation_config(self, brand_analysis: Dict[str, Any]) -> Dict[str, Any]:
        """Convert brand analysis into slide generation configuration."""
        
        if not brand_analysis.get('success') or not brand_analysis.get('brands'):
            return {}
        
        # Use the first/primary brand for slide generation
        primary_brand = brand_analysis['brands'][0]
        brand_assets = primary_brand.get('assets', {})
        semantic_roles = brand_assets.get('semantic_roles', {})
        
        # Create slide generation config
        config = {
            'brand_name': primary_brand['brand_name'],
            'logo_url': brand_assets.get('logo_url'),
            'colors': {
                'primary': semantic_roles.get('primary_brand_color') or brand_assets.get('colors', [None])[0],
                'backgrounds': semantic_roles.get('background_colors', []),
                'accents': semantic_roles.get('accent_colors', []),
                'text': semantic_roles.get('text_colors', []),
                'all_colors': brand_assets.get('colors', [])
            },
            'fonts': brand_assets.get('fonts', []),  # Include extracted fonts
            'confidence_score': brand_assets.get('confidence_score', 0),
            'extraction_method': brand_assets.get('extraction_method', 'unknown')
        }
        
        print(f"   📋 Slide generation config created for {config['brand_name']}")
        print(f"      Primary color: {config['colors']['primary']}")
        print(f"      Logo: {'✅' if config['logo_url'] else '❌'}")
        
        return config


# Integration function for the theme director
async def analyze_brand_from_user_context(user_input: str, presentation_context: Dict[str, Any] = None) -> Optional[Dict[str, Any]]:
    """
    Main integration function for theme director.
    
    Args:
        user_input: User's request (e.g., "Create a Spotify deck")
        presentation_context: Additional context
        
    Returns:
        Slide generation config or None
    """
    
    agent = BrandIntelligenceAgent()
    
    try:
        # Get brand analysis
        brand_analysis = await agent.analyze_brand_from_context(user_input, presentation_context)
        
        if not brand_analysis.get('success'):
            return None
        
        # Convert to slide generation config
        slide_config = await agent.get_slide_generation_config(brand_analysis)
        
        return slide_config if slide_config else None
        
    except Exception as e:
        logger.error(f"Brand intelligence analysis failed: {e}")
        return None