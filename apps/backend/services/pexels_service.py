import os
import aiohttp
import asyncio
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

class PexelsService:
    """Service for interacting with Pexels API for stock photo and video search."""
    
    STOP_WORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by', 'is', 'are', 'was', 'were',
        'from', 'as', 'it', 'this', 'that', 'these', 'those', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did'
    }

    def __init__(self):
        """Initialize the service with API key from environment variables."""
        self.api_key = os.getenv('PEXELS_API_KEY')
        if not self.api_key:
            raise ValueError("PEXELS_API_KEY environment variable not set")
        
        self.base_url = "https://api.pexels.com/v1"
        self.headers = {
            "Authorization": self.api_key
        }
    
    def _extract_keywords(self, text: str, num_keywords: int = 3) -> List[str]:
        """Extracts meaningful keywords from text, prioritizing proper nouns and specific entities."""
        if not text:
            return []
        
        import re
        
        # Split into words while preserving capitalization
        words = text.split()
        
        # Categorize words by importance for image search
        proper_nouns = []      # Capitalized words (likely names, brands, places)
        concrete_nouns = []    # Specific tangible things
        abstract_concepts = [] # Generic concepts
        
        # Abstract concepts that are bad for image search
        ABSTRACT_WORDS = {
            'time', 'over', 'through', 'during', 'analysis', 'overview', 'trends', 
            'growth', 'performance', 'strategy', 'approach', 'process', 'method',
            'popularity', 'success', 'impact', 'effect', 'influence', 'change',
            'development', 'progress', 'improvement', 'advancement', 'evolution',
            'comparison', 'versus', 'against', 'between', 'among', 'within'
        }
        
        for word in words:
            # Clean punctuation
            clean_word = re.sub(r'[^\w]', '', word)
            if len(clean_word) < 2 or clean_word.lower() in self.STOP_WORDS:
                continue
                
            clean_lower = clean_word.lower()
            
            # Skip abstract concepts completely
            if clean_lower in ABSTRACT_WORDS:
                continue
                
            # Prioritize proper nouns (capitalized words)
            if clean_word[0].isupper() and len(clean_word) > 2:
                proper_nouns.append(clean_word)
            # Concrete nouns that make good image subjects
            elif clean_lower in {'car', 'house', 'computer', 'phone', 'building', 'office', 
                               'people', 'person', 'team', 'group', 'meeting', 'presentation',
                               'chart', 'graph', 'data', 'technology', 'innovation', 'design',
                               'pokemon', 'character', 'game', 'product', 'brand', 'company',
                               'restaurant', 'food', 'store', 'shop', 'market', 'industry'}:
                concrete_nouns.append(clean_lower)
            # Everything else as backup
            else:
                abstract_concepts.append(clean_lower)
        
        # Build keywords in order of priority
        keywords = []
        
        # 1. First priority: Proper nouns (brand names, character names, etc.)
        keywords.extend(proper_nouns[:num_keywords])
        
        # 2. Second priority: Concrete nouns
        if len(keywords) < num_keywords:
            keywords.extend(concrete_nouns[:num_keywords - len(keywords)])
        
        # 3. Last resort: Other words (but avoid abstract concepts)
        if len(keywords) < num_keywords:
            keywords.extend(abstract_concepts[:num_keywords - len(keywords)])
        
        # Remove duplicates while preserving order
        unique_keywords = []
        seen = set()
        for word in keywords:
            if word.lower() not in seen:
                unique_keywords.append(word)
                seen.add(word.lower())
        
        return unique_keywords[:num_keywords]

    async def search_images(
        self,
        query: str,
        per_page: int = 10,
        page: int = 1,
        orientation: Optional[str] = None,  # landscape, portrait, square
        size: Optional[str] = None,  # large, medium, small
        color: Optional[str] = None,  # red, orange, yellow, green, turquoise, blue, violet, pink, brown, black, gray, white or hex
        locale: Optional[str] = None,  # en-US, pt-BR, es-ES, etc.
    ) -> Dict[str, Any]:
        """Performs the actual Pexels API search."""
        if not query:
            return {"photos": [], "total_results": 0}

        params = {
            "query": query,
            "per_page": min(per_page, 80),  # API max is 80
            "page": page
        }
        
        if orientation: params["orientation"] = orientation
        if size: params["size"] = size
        if color: params["color"] = color
        if locale: params["locale"] = locale
        
        # Configure timeout for Pexels API requests (30 seconds should be enough)
        timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=30)
        
        session = None
        try:
            session = aiohttp.ClientSession(timeout=timeout)
            
            async with session.get(f"{self.base_url}/search", headers=self.headers, params=params) as response:
                if response.status == 200:
                    data = await response.json()
                    return self._process_image_results(data)
                else:
                    print(f"Pexels API error ({query=}): {response.status} - {await response.text()}")
                    return {"photos": [], "total_results": 0}
                    
        except asyncio.TimeoutError:
            print(f"Timeout error searching Pexels ({query=})")
            return {"photos": [], "total_results": 0}
        except asyncio.CancelledError:
            print(f"Pexels search cancelled ({query=})")
            return {"photos": [], "total_results": 0}
        except Exception as e:
            print(f"Error searching Pexels ({query=}): {str(e)}")
            return {"photos": [], "total_results": 0}
        finally:
            # Shield session cleanup from cancellation
            if session:
                try:
                    await asyncio.shield(session.close())
                except Exception as e:
                    print(f"Error closing Pexels session: {e}")
    
    async def search_images_for_slide(
        self,
        slide_content: str,
        slide_title: str,
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 3
    ) -> List[Dict[str, Any]]:
        """Search for images appropriate for a specific slide."""
        
        # Extract more keywords and don't filter as aggressively
        primary_keywords = self._extract_keywords(slide_title, num_keywords=4)
        secondary_keywords = self._extract_keywords(slide_content, num_keywords=3)

        # Combine keywords without duplicates
        all_keywords = primary_keywords + [k for k in secondary_keywords if k not in primary_keywords]
        
        # Use the actual content keywords as the search query
        if all_keywords:
            search_query = ' '.join(all_keywords[:5])  # Use up to 5 most relevant keywords
        else:
            # Only use generic fallback if we truly have no keywords
            if slide_type == 'title':
                search_query = "presentation title slide"
            elif slide_type == 'closing':
                search_query = "thank you conclusion"
            else:
                search_query = "business presentation"
        
        print(f"Searching Pexels for: '{search_query}' (slide: {slide_title})")
        
        # Always use landscape for presentation slides
        results = await self.search_images(
            query=search_query,
            per_page=num_images,
            orientation='landscape'
        )
        
        return results.get('photos', [])
    
    async def get_curated_images(
        self,
        per_page: int = 15,
        page: int = 1
    ) -> Dict[str, Any]:
        """Fetches curated images from Pexels."""
        params = {"per_page": min(per_page, 80), "page": page}
        # Configure timeout for Pexels API requests
        timeout = aiohttp.ClientTimeout(total=30, connect=10, sock_read=30)
        
        session = None
        try:
            session = aiohttp.ClientSession(timeout=timeout)
            
            async with session.get(f"{self.base_url}/curated", headers=self.headers, params=params) as response:
                if response.status == 200:
                    return self._process_image_results(await response.json())
                else:
                    print(f"Pexels API error (curated): {response.status} - {await response.text()}")
                    return {"photos": [], "total_results": 0}
                    
        except asyncio.TimeoutError:
            print(f"Timeout error getting curated Pexels images")
            return {"photos": [], "total_results": 0}
        except asyncio.CancelledError:
            print(f"Pexels curated request cancelled")
            return {"photos": [], "total_results": 0}
        except Exception as e:
            print(f"Error getting curated Pexels images: {str(e)}")
            return {"photos": [], "total_results": 0}
        finally:
            # Shield session cleanup from cancellation
            if session:
                try:
                    await asyncio.shield(session.close())
                except Exception as e:
                    print(f"Error closing Pexels session: {e}")
    
    async def search_images_for_deck(
        self,
        deck_outline: Any, # Should be DeckOutline type from models
        palette: Optional[Dict[str, Any]] = None, # Make palette optional
        max_images_per_slide: int = 3
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Searches images for all slides in a deck outline."""
        images_by_slide: Dict[str, List[Dict[str, Any]]] = {}
        
        palette_color_name: Optional[str] = None
        if palette and 'colors' in palette and palette['colors']:
            palette_color_name = self._hex_to_color_name(palette['colors'][0])

        for i, slide in enumerate(deck_outline.slides):
            if self._slide_needs_images(slide, i):
                # Pass slide.title to search_images_for_slide
                slide_images_data = await self.search_images_for_slide(
                    slide_content=slide.content or "",
                    slide_title=slide.title or f"Slide {i+1}", # Ensure title is not None
                    slide_type=self._determine_slide_type(slide, i),
                    style_preferences=deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None,
                    num_images=max_images_per_slide
                )
                
                # Pexels API search doesn't strictly filter by color for general queries,
                # but `palette_color_name` could be used if specific color search endpoint exists or for post-filtering.
                # For now, it's not directly used in the Pexels query itself beyond keyword hints if any.
                images_by_slide[slide.id] = slide_images_data
        
        return images_by_slide
    
    def _process_image_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Processes raw Pexels API photo results into a structured format."""
        photos = []
        for photo_data in data.get('photos', []):
            src = photo_data.get('src', {})
            processed_photo = {
                'id': photo_data.get('id'),
                'photographer': photo_data.get('photographer'),
                'photographer_url': photo_data.get('photographer_url'),
                'page_url': photo_data.get('url'), # Pexels page for the photo
                'url': src.get('large'), # Direct URL to the large image
                'alt': photo_data.get('alt', 'Pexels stock photo'), # Default alt text
                'avg_color': photo_data.get('avg_color'),
                'width': photo_data.get('width'),
                'height': photo_data.get('height'),
                'src_sizes': {
                    'original': src.get('original'),
                    'large2x': src.get('large2x'),
                    'large': src.get('large'),
                    'medium': src.get('medium'),
                    'small': src.get('small'),
                    'portrait': src.get('portrait'),
                    'landscape': src.get('landscape'),
                    'tiny': src.get('tiny')
                }
            }
            if processed_photo['url']: # Only include if we have a usable image URL
                photos.append(processed_photo)
        
        return {
            'photos': photos,
            'total_results': data.get('total_results', 0),
            'page': data.get('page', 1),
            'per_page': data.get('per_page', 15),
            'next_page': data.get('next_page')
        }
    
    def _slide_needs_images(self, slide: Any, index: int) -> bool:
        """Determines if a slide is likely to benefit from an image."""
        title_lower = (slide.title or "").lower()
        # First slide (usually title) and closing slides often need images
        if index == 0 or 'thank' in title_lower or 'question' in title_lower or 'conclusion' in title_lower:
            return True
        # Slides with very little text might be image-focused
        if len(slide.content or "") < 50 and 'title' in title_lower:
             return True
        # Content-heavy slides can be broken up with images
        if len(slide.content or "") > 200:
            return True
        # Data slides might have charts, but can still use supporting imagery
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return False # Usually charts take precedence
        return False # Default to not needing an image for other content slides unless specified
    
    def _determine_slide_type(self, slide: Any, index: int) -> str:
        """Determines a general type for a slide for image search context."""
        title_lower = (slide.title or "").lower()
        if index == 0 or 'title' in title_lower or 'welcome' in title_lower or 'introduction' in title_lower:
            return 'title'
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return 'data'
        if any(term in title_lower for term in ['thank', 'question', 'q&a', 'contact', 'conclusion']):
            return 'closing'
        if any(term in title_lower for term in ['agenda', 'outline', 'contents', 'summary']):
            return 'summary'
        return 'content' # Default type
    
    def _hex_to_color_name(self, hex_color: str) -> Optional[str]:
        """Converts a hex color string to a Pexels API compatible color name (simplified)."""
        if not hex_color or not hex_color.startswith('#') or len(hex_color) != 7:
            return None
        hex_val = hex_color.lstrip('#')
        try:
            r, g, b = int(hex_val[0:2], 16), int(hex_val[2:4], 16), int(hex_val[4:6], 16)
        except ValueError:
            return None

        # Simplified mapping - Pexels API supports specific color names or hex codes.
        # This function is more for keyword hinting if used.
        if r > 200 and g < 100 and b < 100: return 'red'
        if r > 200 and g > 150 and b < 100: return 'orange' # Adjusted for orange
        if r > 200 and g > 200 and b < 100: return 'yellow'
        if r < 100 and g > 150 and b < 100: return 'green' # Adjusted for green
        if r < 100 and g > 150 and b > 150: return 'turquoise' # Added turquoise
        if r < 100 and g < 100 and b > 150: return 'blue' # Adjusted for blue
        if r > 150 and g < 100 and b > 150: return 'violet' # Added violet/purple
        if r > 200 and g > 100 and b > 150: return 'pink' # Added pink
        if 100 < r < 180 and 50 < g < 130 and b < 100: return 'brown' # Added brown
        if r < 70 and g < 70 and b < 70: return 'black'
        if 150 < r < 200 and 150 < g < 200 and 150 < b < 200: return 'gray' # Adjusted for gray
        if r > 220 and g > 220 and b > 220: return 'white'
        
        return None # Fallback if no simple match 