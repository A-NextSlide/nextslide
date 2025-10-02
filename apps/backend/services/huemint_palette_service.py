import aiohttp
import asyncio
import json
from typing import List, Dict, Any, Optional
import os
from openai import OpenAI
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import model from config
from agents.config import OPENAI_EMBEDDINGS_MODEL

class HuemintPaletteService:
    """Service for generating color palettes using Huemint API"""
    
    def __init__(self):
        self.api_url = "https://api.huemint.com/color"
        self.openai_client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        self.embeddings_model = OPENAI_EMBEDDINGS_MODEL
        # Configure timeout settings
        self.timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=20)
        self._session = None
    
    async def _get_session(self):
        """Get or create an aiohttp session with proper configuration"""
        if self._session is None or self._session.closed:
            connector = aiohttp.TCPConnector(
                limit=10,
                limit_per_host=5,
                keepalive_timeout=30,
                enable_cleanup_closed=True
            )
            self._session = aiohttp.ClientSession(
                timeout=self.timeout,
                connector=connector,
                headers={"Content-Type": "application/json"}
            )
        return self._session
    
    async def close(self):
        """Properly close the aiohttp session."""
        if hasattr(self, '_session') and self._session and not self._session.closed:
            await self._session.close()
            self._session = None
    
    async def generate_palette(
        self, 
        query: str,
        num_colors: int = 7,  # Use 7 colors for maximum creative flexibility
        temperature: float = 1.6,  # Higher creativity for stunning palettes
        mode: str = "transformer",  # Most creative mode by default
        locked_colors: Optional[List[str]] = None,
        adjacency: Optional[List[str]] = None
    ) -> List[Dict[str, Any]]:  # Changed return type to List
        """
        Generate a color palette using Huemint API
        
        Args:
            query: Text description for the palette
            num_colors: Number of colors (2-12)
            temperature: Creativity level (0-2.4)
            mode: "transformer", "diffusion", or "random"
            locked_colors: List of hex colors to lock, use "-" for unlocked
            adjacency: Adjacency matrix as flat array of strings
        
        Returns:
            List of palette dictionaries
        """
        try:
            # Generate embedding for the query to find similar concepts
            embedding = await self._generate_embedding(query)
            
            # Default adjacency matrix for good color relationships
            if adjacency is None:
                if num_colors == 5:
                    # 5x5 adjacency matrix for rich, harmonious palettes
                    adjacency = [
                        "0", "90", "70", "50", "30",   # Dark primary
                        "90", "0", "80", "60", "40",   # Dark secondary
                        "70", "80", "0", "85", "60",   # Mid tone
                        "50", "60", "85", "0", "90",   # Light accent
                        "30", "40", "60", "90", "0"    # Light background
                    ]
                elif num_colors == 3:
                    # 3x3 adjacency matrix for harmonious triadic colors
                    adjacency = [
                        "0", "80", "60",   # First color works well with others
                        "80", "0", "50",   # Second color harmonizes
                        "60", "50", "0"    # Third color complements
                    ]
                elif num_colors == 4:
                    # 4x4 adjacency matrix for harmonious colors
                    adjacency = [
                        "0", "85", "60", "40",
                        "85", "0", "40", "70",
                        "60", "40", "0", "40",
                        "40", "70", "40", "0"
                    ]
                else:
                    # Generate default adjacency
                    adjacency = self._generate_default_adjacency(num_colors)
            
            # Default locked colors
            if locked_colors is None:
                locked_colors = ["-"] * num_colors
            
            # Prepare request data
            json_data = {
                "mode": mode,
                "num_colors": num_colors,
                "temperature": str(temperature),
                "num_results": 50 if mode == "transformer" else 5,
                "adjacency": adjacency,
                "palette": locked_colors
            }
            
            # Make API request with proper error handling
            session = await self._get_session()
            
            try:
                async with session.post(
                    self.api_url,
                    json=json_data
                ) as response:
                    if response.status == 200:
                        data = await response.json()
                        
                        # Process results
                        palettes = self._process_huemint_results(data, query)
                        
                        # Add embeddings and tags
                        for palette in palettes:
                            palette['embedding'] = embedding
                            palette['tags'] = self._generate_tags(query, palette['colors'])
                        
                        return palettes
                    else:
                        print(f"Huemint API error: {response.status}")
                        return self._get_fallback_palette(query, num_colors)
                        
            except asyncio.CancelledError:
                print(f"Request cancelled for query: {query}")
                return self._get_fallback_palette(query, num_colors)
            except asyncio.TimeoutError:
                print(f"Timeout for Huemint API request: {query}")
                return self._get_fallback_palette(query, num_colors)
            except Exception as e:
                print(f"Error calling Huemint API: {str(e)}")
                return self._get_fallback_palette(query, num_colors)
                
        except Exception as e:
            print(f"Error in generate_palette: {str(e)}")
            return self._get_fallback_palette(query, num_colors)
    
    def _get_fallback_palette(self, query: str, num_colors: int) -> List[Dict[str, Any]]:
        """Generate a fallback palette when API fails"""
        # Much better, harmonious fallback palettes
        fallback_palettes = [
            {
                'name': f"Professional Blue Palette",
                'description': f"Clean professional palette for: {query}",
                'colors': ["#1E3A5F", "#4A7BA7", "#8FBCDB", "#F0F4F8"][:num_colors],
                'score': 0.8,
                'source': 'fallback',
                'temperature': '1.0',
                'tags': ['professional', 'clean', 'trustworthy', 'blue']
            },
            {
                'name': f"Modern Coral Palette",
                'description': f"Modern vibrant palette for: {query}",
                'colors': ["#2D3748", "#FC8181", "#FED7D7", "#F7FAFC"][:num_colors],
                'score': 0.75,
                'source': 'fallback',
                'temperature': '1.0',
                'tags': ['modern', 'vibrant', 'coral', 'energetic']
            },
            {
                'name': f"Earth Tone Palette",
                'description': f"Natural earth palette for: {query}",
                'colors': ["#44403C", "#DC8F5F", "#F3E7DB", "#FAF9F7"][:num_colors],
                'score': 0.75,
                'source': 'fallback',
                'temperature': '1.0',
                'tags': ['natural', 'warm', 'earth', 'organic']
            },
            {
                'name': f"Teal Accent Palette",
                'description': f"Contemporary teal palette for: {query}",
                'colors': ["#1A202C", "#319795", "#81E6D9", "#F7FAFC"][:num_colors],
                'score': 0.75,
                'source': 'fallback',
                'temperature': '1.0',
                'tags': ['contemporary', 'teal', 'fresh', 'modern']
            },
            {
                'name': f"Purple Gradient Palette",
                'description': f"Sophisticated purple palette for: {query}",
                'colors': ["#2D1B69", "#7C3AED", "#E9D8FD", "#FAF5FF"][:num_colors],
                'score': 0.75,
                'source': 'fallback',
                'temperature': '1.0',
                'tags': ['sophisticated', 'purple', 'elegant', 'creative']
            }
        ]
        
        # Choose based on query keywords
        query_lower = query.lower()
        
        if any(word in query_lower for word in ['tech', 'software', 'digital', 'data', 'ai', 'computer']):
            selected = fallback_palettes[0]  # Professional Blue
        elif any(word in query_lower for word in ['creative', 'design', 'art', 'innovation']):
            selected = fallback_palettes[4]  # Purple Gradient
        elif any(word in query_lower for word in ['energy', 'dynamic', 'startup', 'growth']):
            selected = fallback_palettes[1]  # Modern Coral
        elif any(word in query_lower for word in ['nature', 'organic', 'sustainable', 'eco']):
            selected = fallback_palettes[2]  # Earth Tone
        elif any(word in query_lower for word in ['health', 'medical', 'wellness', 'fresh']):
            selected = fallback_palettes[3]  # Teal Accent
        else:
            # Default to professional blue for business contexts
            selected = fallback_palettes[0]
        
        # Ensure we have exactly the requested number of colors
        selected['colors'] = selected['colors'][:num_colors]
        
        return [selected]  # Return one fallback palette
    
    async def generate_palettes_for_deck(
        self,
        deck_title: str,
        deck_content: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_palettes: int = 3  # Reduced from 5
    ) -> List[Dict[str, Any]]:
        """
        Generate multiple palette options for a deck
        
        Args:
            deck_title: Title of the deck
            deck_content: Summary of deck content
            style_preferences: Style preferences from user
            num_palettes: Number of palette options to generate
        
        Returns:
            List of palette options
        """
        # Create a comprehensive query
        query_parts = [deck_title]
        
        if style_preferences:
            if style_preferences.get('vibeContext'):
                query_parts.append(style_preferences['vibeContext'])
            if style_preferences.get('initialIdea'):
                query_parts.append(style_preferences['initialIdea'])
        
        query_parts.append(deck_content)
        full_query = " ".join(query_parts)
        
        # Determine temperature based on content
        temperature = 0.8  # Default conservative for better harmony
        
        # Adjust for different contexts
        if any(word in full_query.lower() for word in ['corporate', 'professional', 'business', 'finance']):
            temperature = 0.5  # Very conservative
        elif any(word in full_query.lower() for word in ['creative', 'artistic', 'bold', 'vibrant']):
            temperature = 1.2  # More creative but not too wild
        elif any(word in full_query.lower() for word in ['minimal', 'clean', 'simple', 'elegant']):
            temperature = 0.3  # Very conservative
        
        # Generate palettes with different approaches
        all_palettes = []
        
        # 1. Main palette with optimal settings (4 colors)
        main_palettes = await self.generate_palette(
            query=full_query,
            num_colors=4,  # 4-color palettes for better cohesion
            temperature=temperature,
            mode="transformer"
        )
        all_palettes.extend(main_palettes[:num_palettes])
        
        # 2. If we need more, try with slightly different temperature
        if len(all_palettes) < num_palettes:
            alt_temp = temperature + 0.3 if temperature < 1.0 else temperature - 0.3
            alt_palettes = await self.generate_palette(
                query=full_query,
                num_colors=4,
                temperature=alt_temp,
                mode="transformer"
            )
            all_palettes.extend(alt_palettes[:num_palettes - len(all_palettes)])
        
        # 3. If still need more, try different mode for variety
        if len(all_palettes) < num_palettes:
            diffusion_palettes = await self.generate_palette(
                query=full_query,
                num_colors=4,
                temperature=temperature,
                mode="transformer"
            )
            all_palettes.extend(diffusion_palettes[:num_palettes - len(all_palettes)])
        
        # Ensure we have good contrast in each palette
        for palette in all_palettes:
            self._ensure_contrast(palette)
        
        return all_palettes[:num_palettes]
    
    def _generate_default_adjacency(self, num_colors: int) -> List[str]:
        """Generate a default adjacency matrix for any number of colors"""
        matrix = []
        for i in range(num_colors):
            for j in range(num_colors):
                if i == j:
                    matrix.append("0")
                elif abs(i - j) == 1:
                    matrix.append("70")  # Adjacent colors
                elif abs(i - j) == 2:
                    matrix.append("50")  # Near colors
                else:
                    matrix.append("30")  # Distant colors
        return matrix
    
    def _process_huemint_results(self, data: Dict[str, Any], query: str) -> List[Dict[str, Any]]:
        """Process raw Huemint API results into our palette format"""
        palettes = []
        
        # Huemint returns results in 'results' key
        if 'results' in data:
            for idx, result in enumerate(data['results'][:10]):  # Top 10 results
                palette = {
                    'name': f"{query} Palette {idx + 1}",
                    'description': f"AI-generated palette for: {query}",
                    'colors': result.get('palette', []),
                    'score': result.get('score', 0),
                    'source': 'huemint',
                    'temperature': data.get('temperature', '1.3')
                }
                palettes.append(palette)
        
        # Sort by score if available
        palettes.sort(key=lambda x: x.get('score', 0), reverse=True)
        
        return palettes
    
    def _ensure_contrast(self, palette: Dict[str, Any]) -> None:
        """Ensure the palette has beautiful, complementary colors with good contrast"""
        colors = palette.get('colors', [])
        
        if len(colors) >= 2:
            bg_color = colors[0]
            
            # Ensure good contrast for all non-background colors
            for i in range(1, len(colors)):
                color = colors[i]
                bg_brightness = self._get_brightness(bg_color)
                color_brightness = self._get_brightness(color)
                
                # Calculate contrast ratio
                contrast_ratio = abs(bg_brightness - color_brightness)
                
                # If contrast is too low, adjust the color
                if contrast_ratio < 0.4:  # Increased threshold for better contrast
                    if bg_brightness > 0.5:
                        # Light background, darken the color
                        r, g, b = self._hex_to_rgb(color)
                        # Darken more aggressively
                        factor = 0.5  # 50% darker
                        colors[i] = self._rgb_to_hex(
                            int(r * factor), 
                            int(g * factor), 
                            int(b * factor)
                        )
                    else:
                        # Dark background, lighten the color
                        r, g, b = self._hex_to_rgb(color)
                        # Lighten more aggressively
                        factor = 1.8  # 80% lighter
                        colors[i] = self._rgb_to_hex(
                            min(255, int(r * factor + 30)),
                            min(255, int(g * factor + 30)),
                            min(255, int(b * factor + 30))
                        )
                    
                    palette['adjusted_for_contrast'] = True
    
    def _get_brightness(self, hex_color: str) -> float:
        """Calculate brightness of a hex color (0-1)"""
        # Remove # if present
        hex_color = hex_color.lstrip('#')
        
        # Convert to RGB
        r = int(hex_color[0:2], 16) / 255.0
        g = int(hex_color[2:4], 16) / 255.0
        b = int(hex_color[4:6], 16) / 255.0
        
        # Calculate perceived brightness
        return (0.299 * r + 0.587 * g + 0.114 * b)
    
    def _hex_to_rgb(self, hex_color: str) -> tuple:
        """Convert hex color to RGB values"""
        hex_color = hex_color.lstrip('#')
        return tuple(int(hex_color[i:i+2], 16) for i in (0, 2, 4))
    
    def _rgb_to_hex(self, r: int, g: int, b: int) -> str:
        """Convert RGB values to hex color"""
        return f"#{r:02x}{g:02x}{b:02x}"
    
    def _generate_tags(self, query: str, colors: List[str]) -> List[str]:
        """Generate tags for the palette based on query and colors"""
        tags = []
        
        # Extract keywords from query
        keywords = query.lower().split()
        
        # Add relevant tags
        for keyword in keywords:
            if keyword in ['presentation', 'deck', 'slides']:
                tags.append('presentation')
            elif keyword in ['corporate', 'business', 'professional']:
                tags.append('corporate')
            elif keyword in ['creative', 'artistic', 'bold']:
                tags.append('creative')
            elif keyword in ['minimal', 'clean', 'simple']:
                tags.append('minimal')
            elif keyword in ['dark', 'light', 'bright']:
                tags.append(keyword)
        
        # Analyze colors
        if colors:
            avg_brightness = sum(self._get_brightness(c) for c in colors) / len(colors)
            if avg_brightness > 0.7:
                tags.append('light')
            elif avg_brightness < 0.3:
                tags.append('dark')
            else:
                tags.append('balanced')
        
        # Color count
        tags.append(f"{len(colors)}-colors")
        
        return list(set(tags))  # Remove duplicates
    
    async def _generate_embedding(self, text: str) -> List[float]:
        """Generate embedding for text using OpenAI"""
        response = self.openai_client.embeddings.create(
            model=self.embeddings_model,
            input=text
        )
        return response.data[0].embedding 

    def __del__(self):
        """Clean up the aiohttp session on destruction."""
        if hasattr(self, '_session') and self._session and not self._session.closed:
            # Just close the connector to prevent the warning
            # The session itself will be garbage collected
            if self._session.connector:
                self._session.connector._closed = True 