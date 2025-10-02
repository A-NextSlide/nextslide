#!/usr/bin/env python3
"""
Optimized collection of diverse palettes from Huemint API.
Takes advantage of multiple results per API call.
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

# Rate limiting - can be more aggressive since we get many results per call
REQUESTS_PER_MINUTE = 10
DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE  # 6 seconds


class OptimizedHuemintCollector:
    """Optimized collection of palettes from Huemint."""
    
    def __init__(self):
        self.supabase = get_supabase_client()
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.collected_palettes = []
        self.total_api_calls = 0
        
    def get_adjacency_templates(self) -> Dict[str, Dict[str, Any]]:
        """Get various adjacency matrix templates for different design contexts."""
        return {
            # Gradient templates (smooth transitions)
            "gradient_3": {
                "name": "3-Color Gradient",
                "num_colors": 3,
                "adjacency": [
                    0, 30, 60,
                    30, 0, 30,
                    60, 30, 0
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
            "gradient_7": {
                "name": "7-Color Rainbow Gradient",
                "num_colors": 7,
                "adjacency": [
                    0, 15, 30, 45, 60, 75, 90,
                    15, 0, 15, 30, 45, 60, 75,
                    30, 15, 0, 15, 30, 45, 60,
                    45, 30, 15, 0, 15, 30, 45,
                    60, 45, 30, 15, 0, 15, 30,
                    75, 60, 45, 30, 15, 0, 15,
                    90, 75, 60, 45, 30, 15, 0
                ],
                "description": "Rainbow gradient for creative designs",
                "use_case": "creative projects, illustrations",
                "category": "gradient"
            },
            
            # Presentation templates
            "presentation_basic": {
                "name": "Presentation Basic",
                "num_colors": 4,
                "adjacency": [
                    0, 15, 90, 75,    # Dark background
                    15, 0, 80, 65,    # Secondary bg
                    90, 80, 0, 40,    # Primary text
                    75, 65, 40, 0     # Accent
                ],
                "description": "High contrast for slides",
                "use_case": "presentations, slides",
                "category": "presentation"
            },
            "presentation_rich": {
                "name": "Presentation Rich",
                "num_colors": 6,
                "adjacency": [
                    0, 10, 85, 70, 60, 55,    # Primary bg
                    10, 0, 75, 60, 50, 45,    # Secondary bg
                    85, 75, 0, 35, 40, 45,    # Primary text
                    70, 60, 35, 0, 30, 35,    # Accent 1
                    60, 50, 40, 30, 0, 25,    # Accent 2
                    55, 45, 45, 35, 25, 0     # Accent 3
                ],
                "description": "Rich palette for dynamic presentations",
                "use_case": "keynotes, pitch decks",
                "category": "presentation"
            },
            
            # Website templates
            "website_modern": {
                "name": "Modern Website",
                "num_colors": 5,
                "adjacency": [
                    0, 8, 85, 70, 65,     # Background
                    8, 0, 77, 62, 57,     # Nav/Header
                    85, 77, 0, 45, 50,    # Text
                    70, 62, 45, 0, 35,    # Primary CTA
                    65, 57, 50, 35, 0     # Secondary CTA
                ],
                "description": "Modern website with CTAs",
                "use_case": "landing pages, web apps",
                "category": "website"
            },
            
            # Data visualization
            "dataviz_distinct": {
                "name": "Distinct Data Viz",
                "num_colors": 8,
                "adjacency": [
                    0, 60, 65, 70, 65, 60, 65, 70,
                    60, 0, 60, 65, 70, 65, 60, 65,
                    65, 60, 0, 60, 65, 70, 65, 60,
                    70, 65, 60, 0, 60, 65, 70, 65,
                    65, 70, 65, 60, 0, 60, 65, 70,
                    60, 65, 70, 65, 60, 0, 60, 65,
                    65, 60, 65, 70, 65, 60, 0, 60,
                    70, 65, 60, 65, 70, 65, 60, 0
                ],
                "description": "Distinct colors for data visualization",
                "use_case": "charts, graphs, dashboards",
                "category": "dataviz"
            },
            
            # Brand palettes
            "brand_versatile": {
                "name": "Versatile Brand",
                "num_colors": 5,
                "adjacency": [
                    0, 65, 80, 60, 55,
                    65, 0, 55, 45, 50,
                    80, 55, 0, 50, 45,
                    60, 45, 50, 0, 40,
                    55, 50, 45, 40, 0
                ],
                "description": "Versatile brand palette",
                "use_case": "branding, marketing materials",
                "category": "brand"
            }
        }
    
    def get_topic_prompts(self) -> List[Dict[str, Any]]:
        """Get diverse topic prompts with temperature variations."""
        topics = []
        base_topics = [
            {"topic": "artificial intelligence", "tags": ["tech", "AI", "futuristic"]},
            {"topic": "machine learning", "tags": ["tech", "ML", "data"]},
            {"topic": "cybersecurity", "tags": ["tech", "security", "digital"]},
            {"topic": "cloud computing", "tags": ["tech", "cloud", "software"]},
            {"topic": "blockchain", "tags": ["tech", "crypto", "finance"]},
            {"topic": "quantum computing", "tags": ["tech", "quantum", "future"]},
            
            {"topic": "photosynthesis", "tags": ["nature", "plants", "biology"]},
            {"topic": "ocean ecosystems", "tags": ["ocean", "marine", "water"]},
            {"topic": "climate change", "tags": ["environment", "sustainability"]},
            {"topic": "renewable energy", "tags": ["energy", "green", "sustainable"]},
            {"topic": "biodiversity", "tags": ["nature", "ecology", "conservation"]},
            
            {"topic": "startup pitch", "tags": ["business", "startup", "pitch"]},
            {"topic": "financial analysis", "tags": ["business", "finance", "data"]},
            {"topic": "marketing strategy", "tags": ["business", "marketing", "growth"]},
            {"topic": "product launch", "tags": ["business", "product", "launch"]},
            
            {"topic": "online education", "tags": ["education", "elearning", "digital"]},
            {"topic": "STEM education", "tags": ["education", "science", "technology"]},
            
            {"topic": "mental wellness", "tags": ["health", "wellness", "mindfulness"]},
            {"topic": "healthcare innovation", "tags": ["health", "medical", "tech"]},
            
            {"topic": "modern art", "tags": ["creative", "art", "contemporary"]},
            {"topic": "UX design", "tags": ["creative", "design", "user experience"]},
            {"topic": "architecture", "tags": ["creative", "building", "design"]},
        ]
        
        # Add temperature variations for each topic
        temperatures = [0.7, 1.0, 1.3, 1.6, 1.9]
        for base in base_topics:
            for temp in temperatures:
                topic = base.copy()
                topic["temperature"] = temp
                topics.append(topic)
        
        return topics
    
    async def generate_palette_batch(
        self,
        session: aiohttp.ClientSession,
        adjacency_template: Dict[str, Any],
        topic: Dict[str, Any],
        mode: str = "transformer"
    ) -> List[Dict[str, Any]]:
        """Generate multiple palettes in a single API call."""
        
        adjacency = adjacency_template["adjacency"]
        num_colors = adjacency_template["num_colors"]
        
        # Convert adjacency matrix to string array
        adjacency_str = [str(val) for val in adjacency]
        
        # Prepare locked colors if specified
        palette = ["-"] * num_colors
        if "locked_color" in adjacency_template:
            palette[0] = adjacency_template["locked_color"]
        
        # Request maximum results based on mode
        num_results = 50 if mode == "transformer" else 5
        
        json_data = {
            "mode": mode,
            "num_colors": num_colors,
            "temperature": str(topic.get("temperature", 1.0)),
            "num_results": num_results,
            "adjacency": adjacency_str,
            "palette": palette
        }
        
        palettes = []
        
        try:
            async with session.post(HUEMINT_API_URL, json=json_data) as response:
                if response.status == 200:
                    data = await response.json()
                    
                    if data and "results" in data and len(data["results"]) > 0:
                        # Process ALL results, not just the first one
                        for i, result in enumerate(data["results"]):
                            # Create unique name for each variant
                            variant_name = f"{topic['topic']} - {adjacency_template['name']} v{i+1}"
                            
                            palette_entry = {
                                "name": variant_name,
                                "colors": result["palette"],
                                "description": f"{adjacency_template['description']} for {topic['topic']} (variant {i+1})",
                                "category": adjacency_template["category"],
                                "tags": topic["tags"] + [adjacency_template["category"], mode, f"temp_{topic['temperature']}"],
                                "context": adjacency_template["use_case"],
                                "temperature": topic["temperature"],
                                "mode": mode,
                                "adjacency_matrix": adjacency,
                                "adjacency_template": adjacency_template["name"],
                                "topic": topic["topic"],
                                "score": result.get("score", 0),
                                "variant": i + 1,
                                "created_at": datetime.now().isoformat()
                            }
                            
                            palettes.append(palette_entry)
                        
                        print(f"✅ Generated {len(palettes)} palettes from single API call")
                        return palettes
                    else:
                        print(f"No results from Huemint")
                        return []
                else:
                    print(f"Error from Huemint API: {response.status}")
                    return []
                    
        except Exception as e:
            print(f"Error generating palettes: {e}")
            return []
    
    def generate_embedding(self, palette: Dict[str, Any]) -> List[float]:
        """Generate embedding for a palette."""
        text_parts = [
            palette["name"],
            palette["description"],
            palette.get("topic", ""),
            palette.get("context", ""),
            " ".join(palette.get("tags", [])),
            f"colors: {' '.join(palette['colors'])}",
            f"category: {palette.get('category', '')}",
            f"temperature: {palette.get('temperature', '')}",
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
    
    async def collect_palettes(self, target_count: int = 500):
        """Collect palettes efficiently using batch API calls."""
        adjacency_templates = self.get_adjacency_templates()
        topics = self.get_topic_prompts()
        modes = ["transformer", "diffusion"]
        
        print(f"Starting optimized palette collection...")
        print(f"Templates: {len(adjacency_templates)}")
        print(f"Topics: {len(topics)}")
        print(f"Modes: {len(modes)}")
        print(f"Target palettes: {target_count}")
        print(f"Expected API calls: ~{target_count // 30} (avg 30 palettes per call)")
        print()
        
        async with aiohttp.ClientSession() as session:
            # Shuffle for variety
            template_items = list(adjacency_templates.items())
            random.shuffle(template_items)
            random.shuffle(topics)
            
            for template_key, template in template_items:
                for topic in topics[:10]:  # Limit topics per template for variety
                    for mode in modes:
                        if len(self.collected_palettes) >= target_count:
                            break
                        
                        self.total_api_calls += 1
                        print(f"\n[API Call {self.total_api_calls}] {topic['topic']} - {template['name']} ({mode})")
                        print(f"Progress: {len(self.collected_palettes)}/{target_count} palettes")
                        
                        # Generate batch of palettes
                        batch_palettes = await self.generate_palette_batch(
                            session, template, topic, mode
                        )
                        
                        if batch_palettes:
                            # Generate embeddings for all palettes
                            print(f"Generating embeddings for {len(batch_palettes)} palettes...")
                            for palette in batch_palettes:
                                if len(self.collected_palettes) >= target_count:
                                    break
                                    
                                embedding = self.generate_embedding(palette)
                                if embedding:
                                    palette["embedding"] = embedding
                                self.collected_palettes.append(palette)
                            
                            print(f"Total collected: {len(self.collected_palettes)}")
                        
                        # Rate limiting
                        if len(self.collected_palettes) < target_count:
                            print(f"Waiting {DELAY_BETWEEN_REQUESTS}s before next request...")
                            await asyncio.sleep(DELAY_BETWEEN_REQUESTS)
                        
                    if len(self.collected_palettes) >= target_count:
                        break
                if len(self.collected_palettes) >= target_count:
                    break
        
        print(f"\n✅ Collection complete!")
        print(f"Total palettes: {len(self.collected_palettes)}")
        print(f"Total API calls: {self.total_api_calls}")
        print(f"Average palettes per call: {len(self.collected_palettes) / self.total_api_calls:.1f}")
        
        return self.collected_palettes
    
    def save_to_database(self, batch_size: int = 50):
        """Save collected palettes to database in batches."""
        if not self.collected_palettes:
            print("No palettes to save")
            return
        
        print(f"\nSaving {len(self.collected_palettes)} palettes to database...")
        
        saved_count = 0
        failed_count = 0
        
        # Save in batches for better performance
        for i in range(0, len(self.collected_palettes), batch_size):
            batch = self.collected_palettes[i:i+batch_size]
            batch_data = []
            
            for palette in batch:
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
                        "adjacency_template": palette.get("adjacency_template"),
                        "topic": palette.get("topic"),
                        "score": palette.get("score"),
                        "embedding": palette.get("embedding", [])
                    }
                    batch_data.append(db_data)
                except Exception as e:
                    print(f"❌ Error preparing palette: {e}")
                    failed_count += 1
            
            if batch_data:
                try:
                    # Batch insert
                    self.supabase.table("palettes").insert(batch_data).execute()
                    saved_count += len(batch_data)
                    print(f"✅ Saved batch of {len(batch_data)} palettes ({saved_count}/{len(self.collected_palettes)})")
                except Exception as e:
                    print(f"❌ Error saving batch: {e}")
                    failed_count += len(batch_data)
        
        print(f"\n✅ Finished saving to database")
        print(f"   Successfully saved: {saved_count}")
        print(f"   Failed: {failed_count}")
    
    def save_to_json(self, filename: str = None):
        """Save collected palettes to JSON file."""
        if not self.collected_palettes:
            print("No palettes to save")
            return
        
        if filename is None:
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            filename = f"palettes_optimized_{timestamp}.json"
        
        # Remove embeddings for JSON (too large)
        palettes_for_json = []
        for p in self.collected_palettes:
            p_copy = p.copy()
            p_copy.pop("embedding", None)
            palettes_for_json.append(p_copy)
        
        with open(filename, "w") as f:
            json.dump(palettes_for_json, f, indent=2)
        
        print(f"✅ Saved {len(palettes_for_json)} palettes to {filename}")
        
        # Show statistics
        categories = {}
        modes = {}
        templates = {}
        
        for p in palettes_for_json:
            cat = p.get("category", "unknown")
            categories[cat] = categories.get(cat, 0) + 1
            
            mode = p.get("mode", "unknown")
            modes[mode] = modes.get(mode, 0) + 1
            
            template = p.get("adjacency_template", "unknown")
            templates[template] = templates.get(template, 0) + 1
        
        print("\nPalette Statistics:")
        print(f"Categories: {dict(sorted(categories.items()))}")
        print(f"Modes: {dict(sorted(modes.items()))}")
        print(f"Templates: {dict(sorted(templates.items()))}")


async def main():
    """Main function to run optimized collection."""
    import argparse
    
    parser = argparse.ArgumentParser(description="Optimized Huemint palette collection")
    parser.add_argument("--target", type=int, default=500,
                       help="Target number of palettes to collect")
    parser.add_argument("--save-db", action="store_true",
                       help="Save to database")
    parser.add_argument("--save-json", action="store_true",
                       help="Save to JSON file")
    
    args = parser.parse_args()
    
    collector = OptimizedHuemintCollector()
    
    start_time = datetime.now()
    
    # Collect palettes
    await collector.collect_palettes(target_count=args.target)
    
    # Save results
    if args.save_json or not args.save_db:
        collector.save_to_json()
    
    if args.save_db:
        collector.save_to_database()
    
    elapsed = (datetime.now() - start_time).total_seconds()
    
    print("\n" + "="*60)
    print("COLLECTION COMPLETE")
    print("="*60)
    print(f"Total time: {elapsed:.1f}s ({elapsed/60:.1f} minutes)")
    print(f"Palettes collected: {len(collector.collected_palettes)}")
    print(f"API calls made: {collector.total_api_calls}")
    print(f"Efficiency: {len(collector.collected_palettes)/collector.total_api_calls:.1f} palettes per API call")


if __name__ == "__main__":
    asyncio.run(main())