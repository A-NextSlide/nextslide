#!/usr/bin/env python3
"""
Script to populate topic-specific palettes with better color matching.
Includes rate limiting to avoid Huemint rejections.
"""

import os
import sys
import time
import json
import requests
import asyncio
from typing import List, Dict, Any, Tuple
from datetime import datetime
import uuid
from openai import OpenAI
import random

# Add parent directory to path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from utils.supabase import get_supabase_client
from agents.config import OPENAI_EMBEDDINGS_MODEL
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Initialize OpenAI client for embeddings
openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

# Huemint API endpoint
HUEMINT_API_URL = "https://api.huemint.com/color"

# Rate limiting settings
REQUESTS_PER_MINUTE = 20  # Conservative rate limit
DELAY_BETWEEN_REQUESTS = 60 / REQUESTS_PER_MINUTE  # 3 seconds between requests

# Topic-specific palette configurations
# Start with just a few topics for testing
TOPIC_PALETTES_TEST = {
    "photosynthesis": {
        "name": "Photosynthesis & Plant Biology",
        "keywords": ["photosynthesis", "plants", "chlorophyll", "leaves", "green", "nature", "biology", "botanical"],
        "num_colors": 5,
        "adjacency": ["0", "30", "80", "45", "60", "30", "0", "25", "70", "35", "80", "25", "0", "30", "85", "45", "70", "30", "0", "40", "60", "35", "85", "40", "0"],
        "temperature_range": [0.8, 1.1],  # Just 2 temperatures for testing
        "locked_colors": ["#2ECC40", "-", "-", "-", "-"],  # Lock a green color
        "variations": [
            {"name": "Forest Photosynthesis", "locked": ["#0D7938", "-", "-", "-", "-"]},
            {"name": "Spring Photosynthesis", "locked": ["#39D87C", "-", "-", "-", "-"]},
            {"name": "Deep Forest", "locked": ["#1B5E20", "-", "-", "-", "-"]}
        ]
    },
    "ocean": {
        "name": "Ocean & Marine Life",
        "keywords": ["ocean", "sea", "marine", "water", "waves", "blue", "aquatic", "underwater", "fish", "coral"],
        "num_colors": 5,
        "adjacency": ["0", "25", "70", "50", "85", "25", "0", "30", "65", "45", "70", "30", "0", "35", "75", "50", "65", "35", "0", "40", "85", "45", "75", "40", "0"],
        "temperature_range": [0.7, 1.0],  # Just 2 temperatures for testing
        "locked_colors": ["#0074D9", "-", "-", "-", "-"],  # Lock a blue color
        "variations": [
            {"name": "Deep Ocean", "locked": ["#001f3f", "-", "-", "-", "-"]},
            {"name": "Tropical Waters", "locked": ["#00ACC1", "-", "-", "-", "-"]},
            {"name": "Coral Reef", "locked": ["#0097A7", "-", "#FF6F61", "-", "-"]}
        ]
    }
}

# Full palette configurations for later
TOPIC_PALETTES_FULL = {
    "photosynthesis": {
        "name": "Photosynthesis & Plant Biology",
        "keywords": ["photosynthesis", "plants", "chlorophyll", "leaves", "green", "nature", "biology", "botanical"],
        "num_colors": 5,
        "adjacency": ["0", "30", "80", "45", "60", "30", "0", "25", "70", "35", "80", "25", "0", "30", "85", "45", "70", "30", "0", "40", "60", "35", "85", "40", "0"],
        "temperature_range": [0.7, 1.0, 1.3],
        "locked_colors": ["#2ECC40", "-", "-", "-", "-"],  # Lock a green color
        "variations": [
            {"name": "Forest Photosynthesis", "locked": ["#0D7938", "-", "-", "-", "-"]},
            {"name": "Spring Photosynthesis", "locked": ["#39D87C", "-", "-", "-", "-"]},
            {"name": "Deep Forest", "locked": ["#1B5E20", "-", "-", "-", "-"]},
            {"name": "Lime Photosynthesis", "locked": ["#8BC34A", "-", "-", "-", "-"]},
            {"name": "Emerald Biology", "locked": ["#00695C", "-", "-", "-", "-"]}
        ]
    },
    "ocean": {
        "name": "Ocean & Marine Life",
        "keywords": ["ocean", "sea", "marine", "water", "waves", "blue", "aquatic", "underwater", "fish", "coral"],
        "num_colors": 5,
        "adjacency": ["0", "25", "70", "50", "85", "25", "0", "30", "65", "45", "70", "30", "0", "35", "75", "50", "65", "35", "0", "40", "85", "45", "75", "40", "0"],
        "temperature_range": [0.6, 0.9, 1.2],
        "locked_colors": ["#0074D9", "-", "-", "-", "-"],  # Lock a blue color
        "variations": [
            {"name": "Deep Ocean", "locked": ["#001f3f", "-", "-", "-", "-"]},
            {"name": "Tropical Waters", "locked": ["#00ACC1", "-", "-", "-", "-"]},
            {"name": "Coral Reef", "locked": ["#0097A7", "-", "#FF6F61", "-", "-"]},
            {"name": "Arctic Ocean", "locked": ["#B3E5FC", "-", "-", "-", "-"]},
            {"name": "Midnight Sea", "locked": ["#0D47A1", "-", "-", "-", "-"]}
        ]
    },
    "tesla": {
        "name": "Tesla & Electric Vehicles",
        "keywords": ["tesla", "electric", "vehicle", "car", "innovation", "technology", "ev", "automotive", "sustainable"],
        "num_colors": 4,
        "adjacency": ["0", "90", "70", "50", "90", "0", "40", "60", "70", "40", "0", "30", "50", "60", "30", "0"],
        "temperature_range": [0.5, 0.7, 0.9],
        "locked_colors": ["#CC0000", "-", "-", "-"],  # Tesla red
        "variations": [
            {"name": "Tesla Classic", "locked": ["#CC0000", "#FFFFFF", "-", "-"]},
            {"name": "Tesla Midnight", "locked": ["#1A1A1A", "#CC0000", "-", "-"]},
            {"name": "Tesla Future", "locked": ["#E82127", "-", "-", "#0080FF"]},
            {"name": "Tesla Energy", "locked": ["#FF0000", "-", "#00D100", "-"]},
            {"name": "Tesla Sleek", "locked": ["#2D2D2D", "#CC0000", "#C0C0C0", "-"]}
        ]
    },
    "ai_healthcare": {
        "name": "AI in Healthcare",
        "keywords": ["artificial intelligence", "healthcare", "medical", "technology", "diagnosis", "health", "medicine", "AI"],
        "num_colors": 5,
        "adjacency": ["0", "75", "60", "50", "40", "75", "0", "50", "60", "70", "60", "50", "0", "65", "55", "50", "60", "65", "0", "45", "40", "70", "55", "45", "0"],
        "temperature_range": [0.4, 0.6, 0.8],
        "locked_colors": ["-", "-", "#00BCD4", "-", "-"],  # Medical teal
        "variations": [
            {"name": "Medical AI", "locked": ["-", "#2196F3", "#00BCD4", "-", "-"]},
            {"name": "Health Tech", "locked": ["#4CAF50", "-", "-", "#03A9F4", "-"]},
            {"name": "Clinical AI", "locked": ["#FFFFFF", "#0288D1", "-", "-", "-"]},
            {"name": "Digital Health", "locked": ["-", "#00ACC1", "-", "#7C4DFF", "-"]},
            {"name": "Smart Medicine", "locked": ["-", "-", "#26A69A", "#5E35B1", "-"]}
        ]
    },
    "climate_change": {
        "name": "Climate Change & Sustainability",
        "keywords": ["climate", "environment", "sustainability", "green", "earth", "global warming", "eco", "renewable"],
        "num_colors": 5,
        "adjacency": ["0", "65", "45", "75", "50", "65", "0", "55", "40", "80", "45", "55", "0", "60", "35", "75", "40", "60", "0", "70", "50", "80", "35", "70", "0"],
        "temperature_range": [0.8, 1.1, 1.4],
        "locked_colors": ["-", "#4CAF50", "-", "-", "-"],  # Environmental green
        "variations": [
            {"name": "Earth Tones", "locked": ["#795548", "#4CAF50", "-", "-", "-"]},
            {"name": "Renewable Energy", "locked": ["#FFC107", "#4CAF50", "-", "#2196F3", "-"]},
            {"name": "Global Climate", "locked": ["-", "#388E3C", "#FF5722", "-", "-"]},
            {"name": "Sustainable Future", "locked": ["#8BC34A", "-", "-", "#00BCD4", "-"]},
            {"name": "Eco Systems", "locked": ["#689F38", "-", "#0097A7", "-", "-"]}
        ]
    },
    "space_exploration": {
        "name": "Space & Astronomy",
        "keywords": ["space", "astronomy", "cosmos", "galaxy", "stars", "universe", "planets", "nasa", "exploration"],
        "num_colors": 5,
        "adjacency": ["0", "80", "90", "70", "85", "80", "0", "75", "85", "60", "90", "75", "0", "80", "95", "70", "85", "80", "0", "75", "85", "60", "95", "75", "0"],
        "temperature_range": [0.9, 1.2, 1.5],
        "locked_colors": ["#000033", "-", "-", "-", "-"],  # Deep space blue
        "variations": [
            {"name": "Deep Space", "locked": ["#000033", "-", "#FFD700", "-", "-"]},
            {"name": "Nebula", "locked": ["#4A148C", "-", "#E91E63", "-", "-"]},
            {"name": "Cosmic", "locked": ["#1A237E", "-", "-", "#FF6F00", "-"]},
            {"name": "Galaxy", "locked": ["#0D47A1", "#7B1FA2", "-", "-", "-"]},
            {"name": "Stellar", "locked": ["#000051", "-", "#FFC107", "#FF5722", "-"]}
        ]
    },
    "food_culinary": {
        "name": "Food & Culinary",
        "keywords": ["food", "cooking", "culinary", "restaurant", "chef", "cuisine", "dining", "recipe", "gourmet"],
        "num_colors": 4,
        "adjacency": ["0", "60", "45", "70", "60", "0", "50", "40", "45", "50", "0", "55", "70", "40", "55", "0"],
        "temperature_range": [1.0, 1.3, 1.6],
        "locked_colors": ["-", "-", "#FF6B35", "-"],  # Food orange
        "variations": [
            {"name": "Gourmet", "locked": ["#8D6E63", "-", "#FF6B35", "-"]},
            {"name": "Fresh Kitchen", "locked": ["#66BB6A", "-", "#FFA726", "-"]},
            {"name": "Restaurant", "locked": ["#D32F2F", "#FFF9C4", "-", "-"]},
            {"name": "Bistro", "locked": ["#5D4037", "-", "#FF7043", "#FFE082"]},
            {"name": "Culinary Arts", "locked": ["-", "#F57C00", "#795548", "-"]}
        ]
    },
    "finance_banking": {
        "name": "Finance & Banking",
        "keywords": ["finance", "banking", "money", "investment", "economy", "business", "financial", "market", "trading"],
        "num_colors": 4,
        "adjacency": ["0", "85", "70", "60", "85", "0", "50", "75", "70", "50", "0", "45", "60", "75", "45", "0"],
        "temperature_range": [0.3, 0.5, 0.7],
        "locked_colors": ["-", "#1976D2", "-", "-"],  # Financial blue
        "variations": [
            {"name": "Corporate Finance", "locked": ["#0D47A1", "-", "-", "#FFC107"]},
            {"name": "Investment Banking", "locked": ["#1A237E", "-", "#4CAF50", "-"]},
            {"name": "Wealth Management", "locked": ["-", "#1565C0", "#FFD700", "-"]},
            {"name": "Trading", "locked": ["#263238", "#4CAF50", "#F44336", "-"]},
            {"name": "Financial Markets", "locked": ["-", "#0277BD", "-", "#FFA000"]}
        ]
    },
    "education": {
        "name": "Education & Learning",
        "keywords": ["education", "learning", "school", "teaching", "students", "classroom", "knowledge", "academic"],
        "num_colors": 5,
        "adjacency": ["0", "55", "40", "65", "50", "55", "0", "45", "35", "60", "40", "45", "0", "50", "40", "65", "35", "50", "0", "55", "50", "60", "40", "55", "0"],
        "temperature_range": [0.7, 1.0, 1.3],
        "locked_colors": ["-", "-", "#2196F3", "-", "-"],  # Education blue
        "variations": [
            {"name": "Classroom", "locked": ["-", "#4CAF50", "#2196F3", "-", "-"]},
            {"name": "University", "locked": ["#1A237E", "-", "-", "#FFC107", "-"]},
            {"name": "E-Learning", "locked": ["-", "#00BCD4", "#7C4DFF", "-", "-"]},
            {"name": "Academic", "locked": ["#3F51B5", "-", "-", "#FF9800", "-"]},
            {"name": "School Spirit", "locked": ["-", "#F44336", "#2196F3", "-", "#FFC107"]}
        ]
    },
    "fitness_sports": {
        "name": "Fitness & Sports",
        "keywords": ["fitness", "sports", "exercise", "gym", "health", "athletic", "training", "workout", "performance"],
        "num_colors": 4,
        "adjacency": ["0", "80", "65", "90", "80", "0", "70", "55", "65", "70", "0", "75", "90", "55", "75", "0"],
        "temperature_range": [1.2, 1.5, 1.8],
        "locked_colors": ["-", "#FF5722", "-", "-"],  # Energy orange
        "variations": [
            {"name": "Gym Power", "locked": ["#F44336", "-", "-", "#212121"]},
            {"name": "Athletic", "locked": ["-", "#FF5722", "#4CAF50", "-"]},
            {"name": "Sports Team", "locked": ["#1976D2", "#FFC107", "-", "-"]},
            {"name": "Fitness Energy", "locked": ["#FF6F00", "-", "#00E676", "-"]},
            {"name": "Training", "locked": ["-", "#E64A19", "-", "#424242"]}
        ]
    }
}

async def generate_palette_batch(
    topic_key: str,
    config: Dict[str, Any],
    variation: Dict[str, Any],
    temperature: float,
    mode: str = "transformer"
) -> Dict[str, Any]:
    """Generate a single palette for a topic variation with rate limiting."""
    
    json_data = {
        "mode": mode,
        "num_colors": config["num_colors"],
        "temperature": str(temperature),
        "num_results": 1,  # Generate one at a time to control quality
        "adjacency": config["adjacency"],
        "palette": variation["locked"]  # Use locked colors for variation
    }
    
    try:
        # Rate limiting delay
        await asyncio.sleep(DELAY_BETWEEN_REQUESTS)
        
        response = requests.post(
            HUEMINT_API_URL,
            data=json.dumps(json_data),
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=30
        )
        response.raise_for_status()
        
        results = response.json().get("results", [])
        
        if results:
            result = results[0]
            colors = result["palette"]
            
            # Create unique name combining topic and variation
            palette_name = f"{variation['name']} - {config['name']}"
            
            # Create comprehensive description
            description = f"A carefully curated palette for {config['name'].lower()} presentations. "
            description += f"Features {variation['name'].lower()} color scheme optimized for "
            description += f"{', '.join(config['keywords'][:3])} content."
            
            # Generate search content for embeddings
            search_content = f"{palette_name} {config['name']} {' '.join(config['keywords'])} {description}"
            
            # Generate embedding
            embedding_response = openai_client.embeddings.create(
                model=OPENAI_EMBEDDINGS_MODEL,
                input=search_content
            )
            embedding = embedding_response.data[0].embedding
            
            palette = {
                "id": str(uuid.uuid4()),
                "name": palette_name,
                "colors": colors,
                "description": description,
                "tags": config["keywords"] + [topic_key, variation['name'].lower().replace(' ', '_')],
                "category": "presentation",
                "context": config["name"],
                "score": result.get("score", 0),
                "temperature": temperature,
                "mode": mode,
                "embedding": '[' + ','.join(map(str, embedding)) + ']',
                "created_at": datetime.utcnow().isoformat()
            }
            
            print(f"  ✅ Generated: {palette_name} - Colors: {colors}")
            return palette
        else:
            print(f"  ⚠️ No results for {variation['name']}")
            return None
            
    except Exception as e:
        print(f"  ❌ Error generating palette: {str(e)}")
        return None

async def save_palettes_batch(palettes: List[Dict[str, Any]]):
    """Save a batch of palettes to the database."""
    if not palettes:
        return
    
    supabase = get_supabase_client()
    
    try:
        # Filter out None values
        valid_palettes = [p for p in palettes if p is not None]
        
        if valid_palettes:
            response = supabase.table("palettes").insert(valid_palettes).execute()
            print(f"\n💾 Saved {len(valid_palettes)} palettes to database")
    except Exception as e:
        print(f"\n❌ Error saving palettes: {str(e)}")

async def main():
    """Main function to generate topic-specific palettes."""
    
    print("🎨 Starting Topic-Specific Palette Generation")
    print(f"⏰ Rate limit: {REQUESTS_PER_MINUTE} requests per minute")
    print("="*60)
    
    all_palettes = []
    
    # Use full set for production
    palettes_to_use = TOPIC_PALETTES_FULL
    
    # Process each topic
    for topic_key, config in palettes_to_use.items():
        print(f"\n📚 Generating palettes for: {config['name']}")
        print("-"*40)
        
        topic_palettes = []
        
        # Generate palettes for each variation
        for variation in config["variations"]:
            # Try different temperatures for variety
            for temperature in config["temperature_range"]:
                palette = await generate_palette_batch(
                    topic_key,
                    config,
                    variation,
                    temperature,
                    "transformer"
                )
                
                if palette:
                    topic_palettes.append(palette)
                
                # Save after every 5 palettes to avoid losing progress
                if len(topic_palettes) >= 5:
                    await save_palettes_batch(topic_palettes)
                    all_palettes.extend(topic_palettes)
                    topic_palettes = []
                    print(f"  📊 Progress: {len(all_palettes)} palettes generated so far")
        
        # Save remaining palettes for this topic
        if topic_palettes:
            await save_palettes_batch(topic_palettes)
            all_palettes.extend(topic_palettes)
        
        print(f"  ✅ Completed {config['name']}: {len([p for p in all_palettes if topic_key in p.get('tags', [])])} palettes")
    
    print("\n" + "="*60)
    print(f"🎉 Palette generation complete!")
    print(f"📊 Total palettes created: {len(all_palettes)}")
    
    # Print summary by topic
    print("\n📈 Summary by topic:")
    for topic_key, config in palettes_to_use.items():
        count = len([p for p in all_palettes if topic_key in p.get('tags', [])])
        print(f"  {config['name']}: {count} palettes")

if __name__ == "__main__":
    asyncio.run(main())