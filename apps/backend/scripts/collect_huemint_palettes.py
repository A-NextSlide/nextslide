#!/usr/bin/env python3
"""
Collect diverse palettes from Huemint API with different design contexts.
Huemint understands color relationships through adjacency matrices.
"""

import os
import sys
import json
import time
import asyncio
import aiohttp
from typing import List, Dict, Any, Optional
from datetime import datetime
import random

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase import get_supabase_client
from openai import OpenAI
from agents.config import OPENAI_EMBEDDINGS_MODEL
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Huemint API endpoint
HUEMINT_API_URL = "https://api.huemint.com/color"

# Rate limiting
REQUESTS_PER_MINUTE = 10  # Be conservative to avoid bad colors
DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE  # 6 seconds


class HuemintPaletteCollector:
    """Collect diverse palettes from Huemint with proper adjacency matrices."""
    
    def __init__(self):
        self.supabase = get_supabase_client()
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.collected_palettes = []
        
    def get_adjacency_templates(self) -> Dict[str, Dict[str, Any]]:
        """
        Get various adjacency matrix templates for different design contexts.
        Based on Huemint's documentation about color relationships.
        """
        return {
            # Gradient templates (smooth transitions)
            "gradient_3": {
                "name": "3-Color Gradient",
                "num_colors": 3,
                "adjacency": [
                    0, 30, 60,    # Color 1: close to 2, far from 3
                    30, 0, 30,    # Color 2: close to both
                    60, 30, 0     # Color 3: close to 2, far from 1
                ],
                "description": "Smooth gradient transition",
                "use_case": "backgrounds, overlays",
                "category": "gradient"
            },
            "gradient_5": {
                "name": "5-Color Gradient",
                "num_colors": 5,
                "adjacency": [
                    0, 20, 40, 60, 80,
                    20, 0, 20, 40, 60,
                    40, 20, 0, 20, 40,
                    60, 40, 20, 0, 20,
                    80, 60, 40, 20, 0
                ],
                "description": "Extended gradient palette",
                "use_case": "data visualization, heatmaps",
                "category": "gradient"
            },
            
            # Website/presentation templates (high contrast for readability)
            "website_basic": {
                "name": "Website Basic",
                "num_colors": 4,
                "adjacency": [
                    0, 10, 85, 70,    # Background: low contrast with nav, high with text/accent
                    10, 0, 75, 60,    # Nav/secondary bg: high contrast with text
                    85, 75, 0, 40,    # Text: high contrast with backgrounds
                    70, 60, 40, 0     # Accent: good contrast with all
                ],
                "description": "Website with nav, text, and accent",
                "use_case": "websites, web apps",
                "category": "website"
            },
            "presentation_slide": {
                "name": "Presentation Slide",
                "num_colors": 5,
                "adjacency": [
                    0, 15, 90, 75, 60,    # Dark background
                    15, 0, 80, 65, 50,    # Secondary background
                    90, 80, 0, 40, 50,    # Primary text (high contrast)
                    75, 65, 40, 0, 30,    # Accent 1
                    60, 50, 50, 30, 0     # Accent 2
                ],
                "description": "High contrast for presentations",
                "use_case": "slides, presentations",
                "category": "presentation"
            },
            
            # Brand palettes (balanced, versatile)
            "brand_primary": {
                "name": "Brand Primary",
                "num_colors": 4,
                "adjacency": [
                    0, 70, 85, 60,    # Primary brand color
                    70, 0, 60, 45,    # Secondary brand
                    85, 60, 0, 50,    # Text/contrast
                    60, 45, 50, 0     # Accent
                ],
                "description": "Versatile brand palette",
                "use_case": "branding, marketing",
                "category": "brand"
            },
            
            # Illustration palettes (harmonious, artistic)
            "illustration_vibrant": {
                "name": "Vibrant Illustration",
                "num_colors": 6,
                "adjacency": [
                    0, 45, 50, 55, 40, 60,
                    45, 0, 40, 45, 50, 55,
                    50, 40, 0, 35, 45, 50,
                    55, 45, 35, 0, 40, 45,
                    40, 50, 45, 40, 0, 35,
                    60, 55, 50, 45, 35, 0
                ],
                "description": "Balanced colors for illustrations",
                "use_case": "illustrations, graphics",
                "category": "illustration"
            },
            
            # Data visualization (distinct colors)
            "data_viz": {
                "name": "Data Visualization",
                "num_colors": 5,
                "adjacency": [
                    0, 60, 65, 70, 55,    # All colors should be distinct
                    60, 0, 55, 60, 65,    # but not jarring
                    65, 55, 0, 60, 55,
                    70, 60, 60, 0, 60,
                    55, 65, 55, 60, 0
                ],
                "description": "Distinct colors for charts",
                "use_case": "charts, graphs, data",
                "category": "dataviz"
            },
            
            # Monochromatic variations
            "monochrome_blue": {
                "name": "Monochrome Blue",
                "num_colors": 4,
                "adjacency": [
                    0, 25, 50, 75,    # Gradual increase in contrast
                    25, 0, 25, 50,
                    50, 25, 0, 25,
                    75, 50, 25, 0
                ],
                "description": "Monochromatic blue variations",
                "use_case": "professional, corporate",
                "category": "monochrome",
                "locked_color": "#0066CC"  # Lock first color to blue
            }
        }
    
    def get_topic_prompts(self) -> List[Dict[str, Any]]:
        """Get topic-specific prompts for diverse palette generation."""
        return [
            # Technology
            {"topic": "artificial intelligence", "tags": ["tech", "AI", "futuristic"], "temperature": 1.0},
            {"topic": "cybersecurity", "tags": ["tech", "security", "digital"], "temperature": 0.8},
            {"topic": "cloud computing", "tags": ["tech", "cloud", "software"], "temperature": 1.1},
            {"topic": "blockchain", "tags": ["tech", "crypto", "finance"], "temperature": 1.2},
            
            # Nature/Science
            {"topic": "photosynthesis", "tags": ["nature", "plants", "biology"], "temperature": 1.0},
            {"topic": "ocean ecosystems", "tags": ["ocean", "marine", "water"], "temperature": 0.9},
            {"topic": "climate change", "tags": ["environment", "sustainability"], "temperature": 1.1},
            {"topic": "astronomy", "tags": ["space", "cosmos", "science"], "temperature": 1.3},
            
            # Business
            {"topic": "startup pitch", "tags": ["business", "startup", "pitch"], "temperature": 1.0},
            {"topic": "financial report", "tags": ["business", "finance", "corporate"], "temperature": 0.7},
            {"topic": "marketing strategy", "tags": ["business", "marketing"], "temperature": 1.2},
            
            # Education
            {"topic": "online learning", "tags": ["education", "elearning"], "temperature": 1.0},
            {"topic": "science fair", "tags": ["education", "science", "students"], "temperature": 1.3},
            
            # Health
            {"topic": "mental wellness", "tags": ["health", "wellness", "calm"], "temperature": 0.8},
            {"topic": "fitness goals", "tags": ["health", "fitness", "energy"], "temperature": 1.2},
            
            # Creative
            {"topic": "modern art", "tags": ["creative", "art", "design"], "temperature": 1.5},
            {"topic": "photography portfolio", "tags": ["creative", "photography"], "temperature": 1.1},
        ]
    
    async def generate_palette(
        self,
        session: aiohttp.ClientSession,
        adjacency_template: Dict[str, Any],
        topic: Dict[str, Any],
        mode: str = "transformer"
    ) -> Optional[Dict[str, Any]]:
        """Generate a single palette using Huemint API."""
        
        # Prepare the request
        adjacency = adjacency_template["adjacency"]
        num_colors = adjacency_template["num_colors"]
        
        # Convert adjacency matrix to string array
        adjacency_str = [str(val) for val in adjacency]
        
        # Prepare locked colors if specified
        palette = ["-"] * num_colors  # All unlocked by default
        if "locked_color" in adjacency_template:
            palette[0] = adjacency_template["locked_color"]
        
        json_data = {
            "mode": mode,
            "num_colors": num_colors,
            "temperature": str(topic.get("temperature", 1.0)),
            "num_results": 3,  # Get a few options
            "adjacency": adjacency_str,
            "palette": palette
        }
        
        try:
            async with session.post(HUEMINT_API_URL, json=json_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if data and "results" in data and len(data["results"]) > 0:
                        # Get the best result (first one)
                        best_result = data["results"][0]
                        
                        # Create palette entry
                        palette_entry = {
                            "name": f"{topic['topic']} - {adjacency_template['name']}",
                            "colors": best_result["palette"],
                            "description": f"{adjacency_template['description']} for {topic['topic']}",
                            "category": adjacency_template["category"],
                            "tags": topic["tags"] + [adjacency_template["category"], mode],
                            "context": adjacency_template["use_case"],
                            "temperature": topic["temperature"],
                            "mode": mode,
                            "adjacency_matrix": adjacency,
                            "adjacency_template": adjacency_template["name"],
                            "topic": topic["topic"],
                            "score": best_result.get("score", 0),
                            "created_at": datetime.now().isoformat()
                        }
                        
                        return palette_entry
                    else:
                        print(f"No results from Huemint for {topic['topic']}")
                        return None
                else:
                    print(f"Error from Huemint API: {response.status}")
                    return None
                    
        except Exception as e:
            print(f"Error generating palette: {e}")
            return None
    
    def generate_embedding(self, palette: Dict[str, Any]) -> List[float]:
        """Generate embedding for a palette."""
        # Create a comprehensive text representation
        text_parts = [
            palette["name"],
            palette["description"],
            palette.get("topic", ""),
            palette.get("context", ""),
            " ".join(palette.get("tags", [])),
            f"colors: {' '.join(palette['colors'])}",
            f"category: {palette.get('category', '')}",
            f"template: {palette.get('adjacency_template', '')}"
        ]
        
        text = " ".join(filter(None, text_parts))
        
        try:
            response = self.openai_client.embeddings.create(
                model=OPENAI_EMBEDDINGS_MODEL,
                input=text
            )
            return response.data[0].embedding
        except Exception as e:
            print(f"Error generating embedding: {e}")
            return None
    
    async def collect_palettes(self, limit: int = 100):
        """Collect diverse palettes from Huemint."""
        adjacency_templates = self.get_adjacency_templates()
        topics = self.get_topic_prompts()
        modes = ["transformer", "diffusion"]  # Both ML modes
        
        print(f"Starting palette collection...")
        print(f"Templates: {len(adjacency_templates)}")
        print(f"Topics: {len(topics)}")
        print(f"Modes: {len(modes)}")
        print(f"Max combinations: {len(adjacency_templates) * len(topics) * len(modes)}")
        
        async with aiohttp.ClientSession() as session:
            count = 0
            
            # Shuffle for variety
            template_items = list(adjacency_templates.items())
            random.shuffle(template_items)
            random.shuffle(topics)
            
            for template_key, template in template_items:
                for topic in topics:
                    for mode in modes:
                        if count >= limit:
                            break
                        
                        print(f"\n[{count + 1}/{limit}] Generating: {topic['topic']} - {template['name']} ({mode})")
                        
                        # Generate palette
                        palette = await self.generate_palette(session, template, topic, mode)
                        
                        if palette:
                            # Generate embedding
                            embedding = self.generate_embedding(palette)
                            if embedding:
                                palette["embedding"] = embedding
                            
                            self.collected_palettes.append(palette)
                            print(f"✅ Generated palette with {len(palette['colors'])} colors")
                            print(f"   Colors: {palette['colors']}")
                            count += 1
                        else:
                            print(f"❌ Failed to generate palette")
                        
                        # Rate limiting - important to avoid bad colors
                        print(f"   Waiting {DELAY_BETWEEN_REQUESTS}s before next request...")
                        await asyncio.sleep(DELAY_BETWEEN_REQUESTS)
                        
                    if count >= limit:
                        break
                if count >= limit:
                    break
        
        print(f"\n✅ Collected {len(self.collected_palettes)} palettes")
        return self.collected_palettes
    
    def save_to_database(self):
        """Save collected palettes to database."""
        if not self.collected_palettes:
            print("No palettes to save")
            return
        
        print(f"\nSaving {len(self.collected_palettes)} palettes to database...")
        
        for palette in self.collected_palettes:
            try:
                # Prepare data for database
                db_data = {
                    "name": palette["name"],
                    "colors": palette["colors"],
                    "description": palette["description"],
                    "category": palette["category"],
                    "tags": palette["tags"],
                    "context": palette["context"],
                    "temperature": palette.get("temperature", 1.0),
                    "mode": palette.get("mode", "transformer"),
                    "adjacency_matrix": palette.get("adjacency_matrix", []),
                    "embedding": palette.get("embedding", [])
                }
                
                # Insert into database
                self.supabase.table("palettes").insert(db_data).execute()
                print(f"✅ Saved: {palette['name']}")
                
            except Exception as e:
                print(f"❌ Error saving palette {palette['name']}: {e}")
        
        print(f"\n✅ Finished saving palettes to database")
    
    def save_to_json(self, filename: str = "huemint_palettes.json"):
        """Save collected palettes to JSON file for backup."""
        if not self.collected_palettes:
            print("No palettes to save")
            return
        
        # Remove embeddings for JSON (too large)
        palettes_for_json = []
        for p in self.collected_palettes:
            p_copy = p.copy()
            p_copy.pop("embedding", None)
            palettes_for_json.append(p_copy)
        
        with open(filename, "w") as f:
            json.dump(palettes_for_json, f, indent=2)
        
        print(f"✅ Saved {len(palettes_for_json)} palettes to {filename}")


async def main():
    """Main function to collect palettes."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Collect diverse palettes from Huemint")
    parser.add_argument("--limit", type=int, default=50, help="Number of palettes to collect")
    parser.add_argument("--save-db", action="store_true", help="Save to database")
    parser.add_argument("--save-json", action="store_true", help="Save to JSON file")
    
    args = parser.parse_args()
    
    collector = HuemintPaletteCollector()
    
    # Collect palettes
    await collector.collect_palettes(limit=args.limit)
    
    # Save results
    if args.save_json:
        collector.save_to_json()
    
    if args.save_db:
        collector.save_to_database()
    
    # Show summary
    print("\n" + "="*60)
    print("COLLECTION SUMMARY")
    print("="*60)
    
    # Group by category
    categories = {}
    for p in collector.collected_palettes:
        cat = p.get("category", "unknown")
        categories[cat] = categories.get(cat, 0) + 1
    
    print("\nPalettes by category:")
    for cat, count in sorted(categories.items()):
        print(f"  {cat}: {count}")
    
    # Group by mode
    modes = {}
    for p in collector.collected_palettes:
        mode = p.get("mode", "unknown")
        modes[mode] = modes.get(mode, 0) + 1
    
    print("\nPalettes by mode:")
    for mode, count in sorted(modes.items()):
        print(f"  {mode}: {count}")
    
    print(f"\nTotal palettes collected: {len(collector.collected_palettes)}")


if __name__ == "__main__":
    asyncio.run(main())