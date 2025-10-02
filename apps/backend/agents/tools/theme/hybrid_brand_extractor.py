#!/usr/bin/env python3
"""
Hybrid Brand Extractor - Combines brand guidelines search with website extraction.
Priority: Official brand guidelines first, then fall back to smart website extraction.
"""

import asyncio
from typing import Dict, Any, List
from agents.tools.theme.brand_guidelines_agent import BrandGuidelinesAgent
from agents.tools.theme.smart_brand_color_extractor import SmartBrandColorExtractor
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class HybridBrandExtractor:
    """Hybrid extractor that uses brand guidelines first, then website extraction."""
    
    def __init__(self):
        pass
    
    async def extract_brand_assets(self, brand_name: str, website_url: str) -> Dict[str, Any]:
        """
        Extract brand colors using hybrid approach:
        1. Search for official brand guidelines
        2. Fall back to smart website extraction
        3. Combine and prioritize results
        
        Args:
            brand_name: Name of the brand
            website_url: Website URL
            
        Returns:
            Combined brand asset data with official colors prioritized
        """
        
        result = {
            'brand_name': brand_name,
            'url': website_url,
            'colors': [],
            'official_colors': [],
            'website_colors': [],
            'sources': [],
            'extraction_method': 'hybrid',
            'guidelines_found': False,
            'website_extracted': False,
            'logo_extracted': False,
            'logo_url': None,
            'total_colors_found': 0,
            'confidence_score': 0
        }
        
        print(f"🔄 Hybrid extraction for {brand_name}")
        
        try:
            # Step 1: Try to find official brand guidelines
            print("   📋 Step 1: Searching for brand guidelines...")
            
            async with BrandGuidelinesAgent() as guidelines_agent:
                guidelines_result = await guidelines_agent.find_brand_guidelines(brand_name, website_url)
                
                if guidelines_result.get('official_colors') and len(guidelines_result['official_colors']) >= 2:
                    # Found good official colors
                    result['official_colors'] = guidelines_result['official_colors']
                    result['sources'].extend(guidelines_result['sources_found'])
                    result['guidelines_found'] = True
                    result['confidence_score'] = guidelines_result.get('confidence', 80)
                    
                    print(f"      ✅ Found {len(result['official_colors'])} official colors")
                    print(f"      🎨 Official: {', '.join(result['official_colors'][:4])}")
                else:
                    print("      ❌ No sufficient brand guidelines found")
            
            # Step 2: Always do website extraction as backup/supplement
            print("   🌐 Step 2: Smart website extraction...")
            
            # Ensure we have a valid website URL
            if not website_url or website_url == "None":
                website_url = f"https://www.{brand_name.lower()}.com"
                print(f"      🔗 Using constructed URL: {website_url}")
            
            async with SmartBrandColorExtractor() as website_extractor:
                website_result = await website_extractor.extract_brand_colors(brand_name, website_url)
                
                if website_result and website_result.get('colors'):
                    result['website_colors'] = website_result['colors']
                    result['website_extracted'] = True
                    
                    print(f"      ✅ Found {len(result['website_colors'])} website colors")
                    print(f"      🎨 Website: {', '.join(result['website_colors'][:4])}")
                else:
                    print(f"      ❌ Website extraction failed for {website_url}")
                    print(f"      🔍 Result: {website_result}")
            
            # Step 2.5: Extract high-quality logo
            print("   🖼️  Step 2.5: Logo extraction...")
            
            try:
                from agents.tools.theme.enhanced_logo_extractor import EnhancedLogoExtractor
                async with EnhancedLogoExtractor() as logo_extractor:
                    logo_result = await logo_extractor.extract_high_quality_logo(brand_name, website_url)
                    
                    if logo_result.get('logo_url'):
                        result['logo_url'] = logo_result['logo_url']
                        result['logo_extracted'] = True
                        
                        print(f"      ✅ Found logo: {logo_result.get('source', 'unknown')}")
                        print(f"      🖼️  Quality: {logo_result.get('quality_score', 0)}/100")
                    else:
                        print("      ❌ Logo extraction failed")
            except Exception as logo_error:
                print(f"      ⚠️  Logo extraction error: {logo_error}")
                logger.warning(f"Logo extraction failed for {brand_name}: {logo_error}")
            
            # Step 3: Combine and prioritize colors
            combined_colors = self._combine_color_sources(
                result['official_colors'], 
                result['website_colors'],
                brand_name
            )
            
            # Step 3.5: Enhance with missing color detection
            from agents.tools.theme.brand_color_enhancer import BrandColorEnhancer
            
            async with BrandColorEnhancer() as enhancer:
                enhancement_result = await enhancer.enhance_brand_colors(
                    brand_name, combined_colors, website_url
                )
                
                if enhancement_result['success']:
                    combined_colors = enhancement_result['enhanced_colors']
                    result['enhancement_methods'] = enhancement_result['enhancement_methods_used']
                    result['missing_colors_found'] = len(enhancement_result['missing_colors_found'])
                    print(f"      🎨 Enhancement: +{result['missing_colors_found']} missing colors")
            
            # Step 3.6: Legacy priority database (if available)
            try:
                from agents.tools.theme.brand_priority_database import BrandPriorityDatabase
                priority_db = BrandPriorityDatabase()
                
                enhanced_colors, priority_metadata = priority_db.enhance_extracted_colors(
                    brand_name, combined_colors
                )
                
                result['colors'] = enhanced_colors
                result['priority_enhanced'] = priority_metadata['priority_boost']
                result['priority_colors_used'] = priority_metadata.get('used_priorities', [])
                
                if priority_metadata['priority_boost']:
                    print(f"      🚀 Priority boost: {priority_metadata['original_count']} -> {priority_metadata['enhanced_count']} colors")
                    print(f"      ⭐ Priority colors: {', '.join(priority_metadata['used_priorities'])}")
            except Exception:
                # If priority database fails, use combined colors
                result['colors'] = combined_colors
                result['priority_enhanced'] = False
                result['priority_colors_used'] = []
            
            result['total_colors_found'] = len(result['colors'])
            
            # Step 4: Calculate final confidence score
            if result['guidelines_found'] and result['website_extracted']:
                result['confidence_score'] = min(95, result['confidence_score'] + 15)
                result['extraction_method'] = 'hybrid_complete'
                # Bonus for logo extraction
                if result['logo_extracted']:
                    result['confidence_score'] = min(98, result['confidence_score'] + 3)
            elif result['guidelines_found']:
                result['extraction_method'] = 'guidelines_only'
                if result['logo_extracted']:
                    result['confidence_score'] = min(90, result['confidence_score'] + 5)
            elif result['website_extracted']:
                result['confidence_score'] = 60
                result['extraction_method'] = 'website_only'
                if result['logo_extracted']:
                    result['confidence_score'] = min(75, result['confidence_score'] + 10)
            else:
                if result['logo_extracted']:
                    result['confidence_score'] = 30
                    result['extraction_method'] = 'logo_only'
            
            # Bonus for missing color enhancement
            if result.get('missing_colors_found', 0) > 0:
                enhancement_boost = min(15, result['missing_colors_found'] * 3)
                result['confidence_score'] = min(98, result['confidence_score'] + enhancement_boost)
                result['extraction_method'] += '_enhanced'
            
            # Major bonus for priority color enhancement
            if result.get('priority_enhanced'):
                priority_boost = min(20, len(result['priority_colors_used']) * 5)
                result['confidence_score'] = min(99, result['confidence_score'] + priority_boost)
                result['extraction_method'] += '_priority_enhanced'
            
            print(f"   ✅ Final: {len(result['colors'])} colors, confidence: {result['confidence_score']}%")
            if result['colors']:
                print(f"   🎨 Combined: {', '.join(result['colors'][:5])}")
            
            return result
            
        except Exception as e:
            print(f"   ❌ Hybrid extraction error: {e}")
            logger.error(f"Hybrid extraction failed for {brand_name}: {e}")
            
            # Emergency fallback - just return website colors if available
            if result['website_colors']:
                result['colors'] = result['website_colors']
                result['confidence_score'] = 40
                result['extraction_method'] = 'fallback_website'
            
            return result
    
    def _combine_color_sources(self, official_colors: List[str], website_colors: List[str], brand_name: str = None) -> List[str]:
        """
        Combine official and website colors with intelligent prioritization.
        
        Priority:
        1. Official brand guideline colors (highest priority)
        2. Website colors that complement official colors
        3. High-quality website colors as fallback
        """
        
        all_colors = []
        sources = []
        
        # Collect all colors with sources
        if official_colors:
            all_colors.extend(official_colors)
            sources.extend(['brand_guidelines'] * len(official_colors))
            print(f"      📋 Added {len(official_colors)} official colors")
        
        if website_colors:
            all_colors.extend(website_colors)
            sources.extend(['website'] * len(website_colors))
            print(f"      🌐 Added {len(website_colors)} website colors")
        
        # Apply intelligent prioritization if brand name is available
        if brand_name and all_colors:
            from agents.tools.theme.brand_color_prioritizer import BrandColorPrioritizer
            prioritizer = BrandColorPrioritizer()
            
            prioritized_colors = prioritizer.prioritize_colors(
                colors=all_colors,
                brand_name=brand_name,
                sources=sources,
                brand_context={}
            )
            
            # Remove duplicates while preserving priority order
            combined_colors = []
            seen_colors = set()
            
            # Take more colors to avoid cutting off important ones
            max_colors = min(12, len(prioritized_colors))  # Increased from 8 to 12
            
            for color in prioritized_colors:
                if color.upper() not in seen_colors:
                    combined_colors.append(color)
                    seen_colors.add(color.upper())
                    if len(combined_colors) >= max_colors:
                        break
        else:
            # Fallback to original logic if no brand name
            combined_colors = []
            
            # Start with official colors (highest priority)
            if official_colors:
                combined_colors.extend(official_colors)
            
            # Add complementary website colors
            if website_colors:
                for website_color in website_colors:
                    # Skip if too similar to existing official colors
                    is_duplicate = False
                    for official_color in official_colors:
                        if self._colors_similar(website_color, official_color, threshold=30):
                            is_duplicate = True
                            break
                    
                    if not is_duplicate and len(combined_colors) < 8:
                        combined_colors.append(website_color)
            
            # If no official colors, use website colors as primary source
            if not official_colors and website_colors:
                combined_colors = website_colors[:6]  # Take top 6 website colors
            print(f"      🌐 Using website colors as primary source")
        
        return self._deduplicate_colors(combined_colors)
    
    def _colors_similar(self, color1: str, color2: str, threshold: int = 30) -> bool:
        """Check if two colors are similar."""
        try:
            c1 = color1.lstrip('#')
            c2 = color2.lstrip('#')
            
            if len(c1) != 6 or len(c2) != 6:
                return False
            
            r1, g1, b1 = int(c1[0:2], 16), int(c1[2:4], 16), int(c1[4:6], 16)
            r2, g2, b2 = int(c2[0:2], 16), int(c2[2:4], 16), int(c2[4:6], 16)
            
            distance = ((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) ** 0.5
            return distance <= threshold
        except:
            return color1.upper() == color2.upper()
    
    def _deduplicate_colors(self, colors: List[str]) -> List[str]:
        """Remove duplicate colors."""
        seen = set()
        result = []
        
        for color in colors:
            if color and color not in seen:
                seen.add(color)
                result.append(color)
        
        return result