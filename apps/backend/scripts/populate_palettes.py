#!/usr/bin/env python3
"""
Script to populate the palettes table with hundreds of color palettes from Huemint API.
Generates diverse palettes with different themes, creates embeddings for search,
and stores them in the database.
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
import numpy as np

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

# Define different design contexts and their contrast matrices
DESIGN_CONTEXTS = {
    "website_modern": {
        "name": "Modern Website",
        "description": "Clean, minimalist web design with high contrast",
        "num_colors": 4,
        "adjacency": ["0", "85", "45", "35", "85", "0", "35", "65", "45", "35", "0", "35", "35", "65", "35", "0"],
        "tags": ["website", "modern", "minimal", "clean", "professional"]
    },
    "website_vibrant": {
        "name": "Vibrant Website",
        "description": "Bold, energetic web design with complementary colors",
        "num_colors": 5,
        "adjacency": ["0", "75", "60", "50", "40", "75", "0", "50", "60", "70", "60", "50", "0", "65", "55", "50", "60", "65", "0", "45", "40", "70", "55", "45", "0"],
        "tags": ["website", "vibrant", "bold", "energetic", "creative"]
    },
    "presentation_corporate": {
        "name": "Corporate Presentation",
        "description": "Professional presentation palette with subtle accents",
        "num_colors": 4,
        "adjacency": ["0", "90", "70", "50", "90", "0", "40", "60", "70", "40", "0", "30", "50", "60", "30", "0"],
        "tags": ["presentation", "corporate", "professional", "business", "formal"]
    },
    "presentation_creative": {
        "name": "Creative Presentation",
        "description": "Artistic presentation palette with dynamic contrasts",
        "num_colors": 5,
        "adjacency": ["0", "80", "65", "55", "45", "80", "0", "55", "65", "75", "65", "55", "0", "70", "60", "55", "65", "70", "0", "50", "45", "75", "60", "50", "0"],
        "tags": ["presentation", "creative", "artistic", "dynamic", "innovative"]
    },
    "brand_luxury": {
        "name": "Luxury Brand",
        "description": "Sophisticated palette for premium brands",
        "num_colors": 3,
        "adjacency": ["0", "85", "70", "85", "0", "40", "70", "40", "0"],
        "tags": ["brand", "luxury", "premium", "sophisticated", "elegant"]
    },
    "brand_tech": {
        "name": "Tech Brand",
        "description": "Modern tech company palette with futuristic feel",
        "num_colors": 4,
        "adjacency": ["0", "90", "75", "60", "90", "0", "50", "70", "75", "50", "0", "45", "60", "70", "45", "0"],
        "tags": ["brand", "tech", "modern", "futuristic", "innovative"]
    },
    "gradient_smooth": {
        "name": "Smooth Gradient",
        "description": "Smooth color transition for backgrounds",
        "num_colors": 4,
        "adjacency": ["0", "25", "50", "75", "25", "0", "25", "50", "50", "25", "0", "25", "75", "50", "25", "0"],
        "tags": ["gradient", "smooth", "background", "transition", "subtle"]
    },
    "gradient_vibrant": {
        "name": "Vibrant Gradient",
        "description": "Bold gradient with striking color shifts",
        "num_colors": 3,
        "adjacency": ["0", "40", "80", "40", "0", "40", "80", "40", "0"],
        "tags": ["gradient", "vibrant", "bold", "striking", "dynamic"]
    },
    "illustration_playful": {
        "name": "Playful Illustration",
        "description": "Fun, cheerful colors for illustrations",
        "num_colors": 5,
        "adjacency": ["0", "70", "60", "50", "40", "70", "0", "55", "60", "65", "60", "55", "0", "55", "50", "50", "60", "55", "0", "45", "40", "65", "50", "45", "0"],
        "tags": ["illustration", "playful", "fun", "cheerful", "colorful"]
    },
    "illustration_vintage": {
        "name": "Vintage Illustration",
        "description": "Retro-inspired palette with muted tones",
        "num_colors": 4,
        "adjacency": ["0", "60", "45", "35", "60", "0", "35", "45", "45", "35", "0", "30", "35", "45", "30", "0"],
        "tags": ["illustration", "vintage", "retro", "muted", "nostalgic"]
    },
    "data_viz": {
        "name": "Data Visualization",
        "description": "Clear, distinguishable colors for charts and graphs",
        "num_colors": 6,
        "adjacency": ["0", "80", "75", "70", "65", "60", "80", "0", "75", "70", "65", "60", "75", "75", "0", "70", "65", "60", "70", "70", "70", "0", "65", "60", "65", "65", "65", "65", "0", "60", "60", "60", "60", "60", "60", "0"],
        "tags": ["data", "visualization", "chart", "graph", "analytics"]
    },
    "monochromatic_blue": {
        "name": "Monochromatic Blue",
        "description": "Various shades of blue for cohesive design",
        "num_colors": 4,
        "adjacency": ["0", "30", "60", "90", "30", "0", "30", "60", "60", "30", "0", "30", "90", "60", "30", "0"],
        "tags": ["monochromatic", "blue", "cohesive", "harmonious", "calm"]
    },
    "complementary": {
        "name": "Complementary",
        "description": "Opposite colors on the color wheel",
        "num_colors": 2,
        "adjacency": ["0", "90", "90", "0"],
        "tags": ["complementary", "contrast", "bold", "striking", "opposite"]
    },
    "triadic": {
        "name": "Triadic",
        "description": "Three colors equally spaced on color wheel",
        "num_colors": 3,
        "adjacency": ["0", "70", "70", "70", "0", "70", "70", "70", "0"],
        "tags": ["triadic", "balanced", "vibrant", "harmonious", "dynamic"]
    },
    "analogous": {
        "name": "Analogous",
        "description": "Adjacent colors on the color wheel",
        "num_colors": 3,
        "adjacency": ["0", "20", "40", "20", "0", "20", "40", "20", "0"],
        "tags": ["analogous", "harmonious", "natural", "flowing", "subtle"]
    }
}

# Color mood descriptors for generating titles
COLOR_MOODS = [
    "Serene", "Vibrant", "Sophisticated", "Playful", "Elegant", "Bold", "Subtle",
    "Energetic", "Calm", "Professional", "Creative", "Modern", "Classic", "Fresh",
    "Warm", "Cool", "Dramatic", "Soft", "Dynamic", "Refined", "Whimsical",
    "Luxurious", "Minimal", "Rich", "Bright", "Muted", "Earthy", "Cosmic",
    "Tropical", "Arctic", "Desert", "Ocean", "Forest", "Urban", "Natural"
]

# Theme descriptors
THEMES = [
    "Dawn", "Dusk", "Midnight", "Aurora", "Nebula", "Oasis", "Horizon",
    "Eclipse", "Twilight", "Sunrise", "Sunset", "Storm", "Rainbow", "Prism",
    "Crystal", "Gemstone", "Metal", "Velvet", "Silk", "Canvas", "Marble",
    "Granite", "Pearl", "Coral", "Jade", "Amber", "Ruby", "Sapphire",
    "Emerald", "Amethyst", "Citrine", "Quartz", "Obsidian", "Moonstone"
]

async def generate_palette_batch(context_name: str, context: Dict[str, Any], 
                                temperature: float, mode: str = "transformer") -> List[Dict[str, Any]]:
    """Generate a batch of palettes for a given context"""
    
    json_data = {
        "mode": mode,
        "num_colors": context["num_colors"],
        "temperature": str(temperature),
        "num_results": 50 if mode == "transformer" else 5,
        "adjacency": context["adjacency"],
        "palette": ["-"] * context["num_colors"]  # No locked colors
    }
    
    try:
        response = requests.post(
            HUEMINT_API_URL,
            data=json.dumps(json_data),
            headers={"Content-Type": "application/json; charset=utf-8"},
            timeout=30
        )
        response.raise_for_status()
        
        results = response.json().get("results", [])
        
        palettes = []
        for idx, result in enumerate(results):
            # Generate a unique title
            mood = COLOR_MOODS[hash(str(result["palette"])) % len(COLOR_MOODS)]
            theme = THEMES[hash(str(result["palette"]) + str(idx)) % len(THEMES)]
            
            # Extract colors
            colors = result["palette"]
            
            # Generate description based on colors and context
            description = f"{context['description']}. A {mood.lower()} palette inspired by {theme.lower()} themes."
            
            # Create searchable content for embedding
            search_content = f"{mood} {theme} {context_name} {' '.join(context['tags'])} {description} colors: {' '.join(colors)}"
            
            palette = {
                "id": str(uuid.uuid4()),
                "name": f"{mood} {theme}",
                "colors": colors,
                "description": description,
                "tags": context["tags"] + [mood.lower(), theme.lower()],
                "category": context_name,
                "context": context["name"],
                "score": result.get("score", 0),
                "temperature": temperature,
                "mode": mode,
                "search_content": search_content,
                "created_at": datetime.utcnow().isoformat()
            }
            
            palettes.append(palette)
        
        return palettes
        
    except Exception as e:
        print(f"Error generating palettes for {context_name}: {str(e)}")
        return []

async def generate_embeddings(palettes: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
    """Generate embeddings for palette search"""
    
    for palette in palettes:
        try:
            # Generate embedding for search
            response = openai_client.embeddings.create(
                model=OPENAI_EMBEDDINGS_MODEL,
                input=palette["search_content"]
            )
            
            embedding = response.data[0].embedding
            # Store as text representation for PostgreSQL
            palette["embedding"] = '[' + ','.join(map(str, embedding)) + ']'
            
        except Exception as e:
            print(f"Error generating embedding for palette {palette['name']}: {str(e)}")
            palette["embedding"] = None
    
    return palettes

async def save_to_database(palettes: List[Dict[str, Any]]):
    """Save palettes to the database"""
    
    supabase = get_supabase_client()
    
    # First, create the palettes table if it doesn't exist
    create_table_sql = """
    CREATE TABLE IF NOT EXISTS palettes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name TEXT NOT NULL,
        colors TEXT[] NOT NULL,
        description TEXT,
        tags TEXT[],
        category TEXT,
        context TEXT,
        score FLOAT,
        temperature FLOAT,
        mode TEXT,
        embedding vector(1536),
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
    );
    
    -- Create indexes for better search performance
    CREATE INDEX IF NOT EXISTS palettes_name_idx ON palettes(name);
    CREATE INDEX IF NOT EXISTS palettes_tags_idx ON palettes USING GIN(tags);
    CREATE INDEX IF NOT EXISTS palettes_category_idx ON palettes(category);
    CREATE INDEX IF NOT EXISTS palettes_embedding_idx ON palettes USING ivfflat (embedding vector_cosine_ops);
    """
    
    # Note: You'll need to run this SQL directly in your Supabase dashboard
    # or use a migration tool as Supabase client doesn't support DDL
    
    print("\nIMPORTANT: Please run the following SQL in your Supabase dashboard:")
    print("=" * 80)
    print(create_table_sql)
    print("=" * 80)
    print("\nPress Enter once you've created the table...")
    input()
    
    # Insert palettes in batches
    batch_size = 50
    for i in range(0, len(palettes), batch_size):
        batch = palettes[i:i + batch_size]
        
        # Prepare data for insertion
        records = []
        for palette in batch:
            record = {
                "id": palette["id"],
                "name": palette["name"],
                "colors": palette["colors"],
                "description": palette["description"],
                "tags": palette["tags"],
                "category": palette["category"],
                "context": palette["context"],
                "score": palette["score"],
                "temperature": palette["temperature"],
                "mode": palette["mode"],
                "embedding": palette.get("embedding")
            }
            records.append(record)
        
        try:
            response = supabase.table("palettes").insert(records).execute()
            print(f"Inserted batch {i//batch_size + 1}: {len(response.data)} palettes")
        except Exception as e:
            print(f"Error inserting batch: {str(e)}")

async def main():
    """Main function to generate and save palettes"""
    
    print("Starting palette generation...")
    
    all_palettes = []
    
    # Temperature variations for diversity
    temperatures = [0.6, 0.9, 1.2, 1.5, 1.8]
    
    # Generate palettes for each context and temperature
    for context_name, context in DESIGN_CONTEXTS.items():
        print(f"\nGenerating palettes for {context['name']}...")
        
        for temp in temperatures:
            print(f"  Temperature {temp}...")
            
            # Generate with transformer mode
            palettes = await generate_palette_batch(context_name, context, temp, "transformer")
            all_palettes.extend(palettes)
            
            # Small delay to avoid rate limiting
            time.sleep(1)
            
            # Also generate some with diffusion mode for variety
            if temp == 1.2:  # Only one temperature for diffusion (slower)
                diffusion_palettes = await generate_palette_batch(context_name, context, temp, "diffusion")
                all_palettes.extend(diffusion_palettes)
                time.sleep(1)
    
    print(f"\nGenerated {len(all_palettes)} palettes total")
    
    # Generate embeddings
    print("\nGenerating embeddings for search...")
    all_palettes = await generate_embeddings(all_palettes)
    
    # Save to database
    print("\nSaving to database...")
    await save_to_database(all_palettes)
    
    print("\nPalette generation complete!")
    print(f"Total palettes created: {len(all_palettes)}")
    
    # Print some statistics
    categories = {}
    for p in all_palettes:
        cat = p["category"]
        categories[cat] = categories.get(cat, 0) + 1
    
    print("\nPalettes by category:")
    for cat, count in categories.items():
        print(f"  {cat}: {count}")

if __name__ == "__main__":
    asyncio.run(main()) 