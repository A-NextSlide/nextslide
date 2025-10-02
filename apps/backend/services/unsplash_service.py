import os
import aiohttp
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
import urllib.parse

# Load environment variables
load_dotenv()

class UnsplashService:
    """Service for fetching images from Unsplash API."""
    
    def __init__(self):
        """Initialize the service with API key from environment variables."""
        self.access_key = os.getenv('UNSPLASH_ACCESS_KEY')
        self.is_available = bool(self.access_key)
        
        if self.is_available:
            self.base_url = "https://api.unsplash.com"
            self.headers = {
                "Authorization": f"Client-ID {self.access_key}"
            }
        else:
            print("Warning: UNSPLASH_ACCESS_KEY not set. Unsplash image search will be disabled.")
    
    async def search_images(
        self,
        query: str,
        per_page: int = 10,
        page: int = 1,
        orientation: Optional[str] = None,  # landscape, portrait, squarish
        color: Optional[str] = None,  # black_and_white, black, white, yellow, orange, red, purple, magenta, green, teal, blue
        order_by: Optional[str] = "relevant"  # latest, oldest, popular, relevant
    ) -> Dict[str, Any]:
        """Search for images on Unsplash."""
        
        if not self.is_available:
            return {"results": [], "total": 0, "total_pages": 0}
        
        params = {
            "query": query,
            "per_page": per_page,
            "page": page,
            "order_by": order_by
        }
        
        if orientation:
            params["orientation"] = orientation
        if color:
            params["color"] = color
        
        async with aiohttp.ClientSession() as session:
            try:
                url = f"{self.base_url}/search/photos?{urllib.parse.urlencode(params)}"
                async with session.get(url, headers=self.headers) as response:
                    if response.status == 200:
                        return await response.json()
                    else:
                        error_data = await response.json()
                        print(f"Unsplash API error: {error_data}")
                        return {"results": [], "total": 0, "total_pages": 0}
            except Exception as e:
                print(f"Error searching Unsplash: {str(e)}")
                return {"results": [], "total": 0, "total_pages": 0}
    
    async def search_backgrounds(
        self,
        theme: str,
        color_preference: Optional[str] = None,
        per_page: int = 5
    ) -> List[Dict[str, Any]]:
        """Search specifically for background images suitable for presentations."""
        
        # Keywords that work well for backgrounds
        background_keywords = [
            f"{theme} background abstract",
            f"{theme} texture minimal",
            f"{theme} gradient soft",
            f"{theme} bokeh blur",
            f"{theme} pattern subtle"
        ]
        
        all_results = []
        
        for keyword in background_keywords[:2]:  # Limit API calls
            results = await self.search_images(
                query=keyword,
                per_page=per_page,
                orientation="landscape",
                color=color_preference
            )
            
            if results.get("results"):
                all_results.extend(results["results"])
        
        # Format results for our use
        formatted_results = []
        for img in all_results[:per_page]:
            formatted_results.append({
                'id': f'unsplash-{img["id"]}',
                'url': img["urls"]["regular"],  # Good quality for presentations
                'thumbnail': img["urls"]["small"],
                'photographer': img["user"]["name"],
                'photographer_url': img["user"]["links"]["html"],
                'page_url': img["links"]["html"],
                'alt': img.get("alt_description", f"{theme} background"),
                'color': img.get("color"),
                'blur_hash': img.get("blur_hash"),  # For loading placeholders
                'width': img["width"],
                'height': img["height"]
            })
        
        return formatted_results
    
    async def search_nature_images(
        self,
        subject: str,
        per_page: int = 10
    ) -> List[Dict[str, Any]]:
        """Search for nature and real-world photography."""
        
        # Search for nature/real-world images
        results = await self.search_images(
            query=f"{subject} nature photography",
            per_page=per_page,
            order_by="popular"
        )
        
        formatted_results = []
        for img in results.get("results", []):
            formatted_results.append({
                'id': f'unsplash-{img["id"]}',
                'url': img["urls"]["regular"],
                'thumbnail': img["urls"]["small"],
                'photographer': img["user"]["name"],
                'photographer_url': img["user"]["links"]["html"],
                'page_url': img["links"]["html"],
                'alt': img.get("alt_description", subject),
                'color': img.get("color"),
                'blur_hash': img.get("blur_hash"),
                'width': img["width"],
                'height': img["height"]
            })
        
        return formatted_results
    
    def format_for_slide(self, unsplash_image: Dict[str, Any]) -> Dict[str, Any]:
        """Format Unsplash image data for slide component use."""
        return {
            'id': unsplash_image['id'],
            'photographer': unsplash_image['photographer'],
            'photographer_url': unsplash_image['photographer_url'],
            'page_url': unsplash_image['page_url'],
            'url': unsplash_image['url'],
            'alt': unsplash_image['alt'],
            'source': 'unsplash'
        } 