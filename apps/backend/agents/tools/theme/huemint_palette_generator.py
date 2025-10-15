"""Huemint AI palette generator for creating beautiful color palettes."""

import httpx
from typing import Dict, List, Optional, Any
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class HuemintPaletteGenerator:
    """Generate aesthetically pleasing color palettes using Huemint AI API."""
    
    API_URL = "https://api.huemint.com/color"
    
    async def generate_palette(
        self,
        num_colors: int = 3,
        temperature: float = 1.2,
        num_results: int = 10,
        locked_colors: Optional[List[str]] = None,
        variety_seed: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Generate multiple color palettes using Huemint AI.

        Args:
            num_colors: Number of colors per palette (default 3)
            temperature: Randomness/creativity (0.0-2.0, default 1.2)
            num_results: Number of palettes to generate (default 10)
            locked_colors: Optional list of colors to lock in place
            variety_seed: Optional seed for temperature variation

        Returns:
            List of palette dictionaries with 'colors' key
        """
        try:
            # Use variety seed to vary temperature slightly for more diversity
            actual_temperature = temperature
            if variety_seed:
                # Hash seed to get deterministic but varied temperature (1.0-1.4)
                seed_hash = abs(hash(variety_seed))
                actual_temperature = 1.0 + (seed_hash % 5) * 0.1

            # Prepare locked palette (use "-" for unlocked positions)
            palette = locked_colors or []
            while len(palette) < num_colors:
                palette.append("-")
            
            # Create adjacency matrix (how colors should relate to each other)
            # Higher values = more different, lower = more similar
            adjacency = []
            for i in range(num_colors):
                for j in range(num_colors):
                    if i == j:
                        adjacency.append("0")
                    else:
                        # Mix of similarity (50) and difference (60) for variety
                        adjacency.append("60" if (i + j) % 2 == 0 else "50")
            
            request_data = {
                "mode": "transformer",
                "num_colors": num_colors,
                "temperature": str(actual_temperature),
                "num_results": num_results,
                "adjacency": adjacency,
                "palette": palette[:num_colors]
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.post(
                    self.API_URL,
                    json=request_data,
                    headers={"Content-Type": "application/json; charset=utf-8"}
                )
                
                if response.status_code != 200:
                    logger.error(f"Huemint API error: {response.status_code} {response.text}")
                    return []
                
                data = response.json()
                results = data.get("results", [])
                
                # Format results into our palette structure
                palettes = []
                for i, result in enumerate(results):
                    colors = result.get("palette", [])
                    if colors:
                        palettes.append({
                            "name": f"Huemint Palette {i + 1}",
                            "colors": colors,
                            "source": "huemint_ai",
                            "confidence": 0.95,  # Huemint generates high-quality palettes
                            "category": "presentation",
                            "tags": ["ai-generated", "harmonious"]
                        })
                
                logger.info(f"Generated {len(palettes)} palettes via Huemint AI")
                return palettes
                
        except Exception as e:
            logger.error(f"Error generating Huemint palette: {e}")
            return []
    
    async def generate_single_palette(
        self,
        num_colors: int = 3,
        temperature: float = 1.2,
        locked_colors: Optional[List[str]] = None,
        variety_seed: Optional[str] = None
    ) -> Optional[Dict[str, Any]]:
        """Generate a single color palette.

        Args:
            num_colors: Number of colors in palette (default 3)
            temperature: Randomness/creativity (default 1.2)
            locked_colors: Optional list of colors to lock
            variety_seed: Optional seed for temperature variation

        Returns:
            Single palette dictionary or None
        """
        palettes = await self.generate_palette(
            num_colors=num_colors,
            temperature=temperature,
            num_results=1,
            locked_colors=locked_colors,
            variety_seed=variety_seed
        )

        return palettes[0] if palettes else None
    
    async def generate_with_brand_colors(
        self,
        brand_colors: List[str],
        additional_colors: int = 2
    ) -> Optional[Dict[str, Any]]:
        """Generate a palette that incorporates existing brand colors.
        
        Args:
            brand_colors: List of hex colors to lock in place
            additional_colors: Number of additional colors to generate
            
        Returns:
            Palette dictionary incorporating brand colors
        """
        # Lock the brand colors and let Huemint fill in the rest
        total_colors = len(brand_colors) + additional_colors
        
        palette = await self.generate_single_palette(
            num_colors=total_colors,
            temperature=1.0,  # Lower temperature for more harmony with locked colors
            locked_colors=brand_colors
        )
        
        if palette:
            palette['name'] = 'Brand-Enhanced Palette'
            palette['tags'] = palette.get('tags', []) + ['brand-harmonized']
        
        return palette


# Convenience function for quick palette generation
async def generate_huemint_palette(
    num_colors: int = 3,
    variety_seed: Optional[str] = None
) -> Optional[Dict[str, Any]]:
    """Quick function to generate a single Huemint palette.

    Args:
        num_colors: Number of colors in palette (default 3)
        variety_seed: Optional seed for temperature variation

    Returns:
        Palette dictionary or None
    """
    generator = HuemintPaletteGenerator()

    return await generator.generate_single_palette(
        num_colors=num_colors,
        temperature=1.2,
        locked_colors=None,
        variety_seed=variety_seed
    )

