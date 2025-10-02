import os
import aiohttp
import base64
import asyncio
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Import model from config
from agents.config import OPENAI_IMAGE_MODEL

class OpenAIImageService:
    """Service for generating images using OpenAI's image generation model for supporting images."""
    
    def __init__(self):
        """Initialize the service with API key from environment variables."""
        self.api_key = os.getenv('OPENAI_API_KEY')
        self.is_available = bool(self.api_key)
        
        # Use model from config
        self.model = OPENAI_IMAGE_MODEL
        
        if self.is_available:
            self.base_url = "https://api.openai.com/v1"
            self.headers = {
                "Authorization": f"Bearer {self.api_key}",
                "Content-Type": "application/json"
            }
        else:
            print("Warning: OPENAI_API_KEY not set. AI image generation will be disabled.")
    
    async def generate_image(
        self,
        prompt: str,
        size: str = "1024x1024",  # Common sizes: 1024x1024, 1024x1536, 1536x1024
        transparent_background: bool = True,  # Default to transparent for supporting images
        n: int = 1,  # Number of images to generate
        retry_count: int = 0  # Internal parameter for retry logic
    ) -> Dict[str, Any]:
        """Generate a supporting image using gpt-image-1 with transparent background by default."""
        
        if not self.is_available:
            return {"error": "OpenAI API key not configured"}
        
        # Do not modify the user's prompt
        
        payload = {
            "model": self.model,
            "prompt": prompt,
            "n": n,
            "size": size
        }
        
        # Configure timeout for image generation
        # Note: gpt-image-1 is generally slower than DALL-E models and may need more time
        timeout = aiohttp.ClientTimeout(total=120, connect=10, sock_read=120)
        
        print(f"Starting image generation with {self.model}, timeout: 120s" + (f" (retry {retry_count})" if retry_count > 0 else ""))
        print(f"Prompt: {prompt[:100]}..." if len(prompt) > 100 else f"Prompt: {prompt}")
        
        session = None
        start_time = asyncio.get_event_loop().time()
        try:
            session = aiohttp.ClientSession(timeout=timeout)
            
            async with session.post(
                f"{self.base_url}/images/generations",
                headers=self.headers,
                json=payload
            ) as response:
                if response.status == 200:
                    data = await response.json()
                    result = self._process_response(data)
                    elapsed = asyncio.get_event_loop().time() - start_time
                    print(f"Successfully generated image using {self.model} in {elapsed:.1f}s")
                    return result
                else:
                    error_data = await response.json()
                    error_msg = error_data.get('error', {}).get('message', 'Unknown error')
                    print(f"{self.model} error: {error_msg}")
                    return {"error": error_msg}
                    
        except asyncio.TimeoutError:
            elapsed = asyncio.get_event_loop().time() - start_time
            print(f"Timeout error generating image with {self.model} after {elapsed:.1f}s")
            
            # Retry once on timeout if this is the first attempt
            if retry_count == 0:
                print(f"Retrying image generation due to timeout...")
                if session:
                    try:
                        await asyncio.shield(session.close())
                    except:
                        pass
                return await self.generate_image(prompt, size, transparent_background, n, retry_count + 1)
            
            return {"error": f"Image generation timed out after {elapsed:.1f} seconds (max: 120s)"}
        except asyncio.CancelledError:
            print(f"Image generation cancelled for {self.model}")
            return {"error": "Image generation was cancelled"}
        except Exception as e:
            elapsed = asyncio.get_event_loop().time() - start_time
            print(f"Error with {self.model} after {elapsed:.1f}s: {str(e)}")
            return {"error": str(e)}
        finally:
            # Shield session cleanup from cancellation
            if session:
                try:
                    await asyncio.shield(session.close())
                except Exception as e:
                    print(f"Error closing session: {e}")
    
    def _process_response(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Process the API response into a consistent format."""
        if "data" not in data or not data["data"]:
            return {"error": "No data in response"}
        
        result = data["data"][0]
        
        # gpt-image-1 returns b64_json by default
        # Don't include the actual base64 data in the URL to avoid token limits
        return {
            "b64_json": result.get("b64_json"),
            "url": None,  # Don't convert to data URL here
            "is_ai_generated": True,
            "revised_prompt": result.get("revised_prompt"),
            "usage": data.get("usage"),
            "model_used": self.model
        }
    
    def _b64_to_data_url(self, b64_json: str, mime_type: str = "image/png") -> str:
        """Convert base64 image to data URL."""
        if not b64_json:
            return None
        return f"data:{mime_type};base64,{b64_json}"
    
    async def generate_supporting_image(
        self,
        subject: str,
        context: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        transparent_background: bool = True
    ) -> Dict[str, Any]:
        """Generate a supporting image for specific content that needs custom illustration."""
        
        # Build a prompt for supporting images
        prompt = f"Create a clean, professional illustration of {subject}. Context: {context}. "
        prompt += "Style: Modern, minimalist, suitable for a professional presentation. "
        prompt += "Do not include any text or labels in the image. "
        
        # Add style preferences if available
        if style_preferences:
            if style_preferences.get('vibeContext'):
                prompt += f"Visual style: {style_preferences['vibeContext']}. "
            if style_preferences.get('colorPreference'):
                prompt += f"Use colors that match: {style_preferences['colorPreference']}. "
        
        # Size for supporting images (usually smaller, not full slide)
        size = "1024x1024"  # Square for flexibility
        
        result = await self.generate_image(
            prompt=prompt,
            size=size,
            transparent_background=transparent_background,
            n=1
        )
        
        return result
    
    def should_use_ai_generation(self, slide_title: str, slide_content: str) -> bool:
        """Determine if AI generation is needed for content that can't be found in stock photos."""
        
        # Keywords that strongly suggest AI generation is needed
        ai_necessary_keywords = [
            # Fictional characters/entities
            'pokemon', 'pikachu', 'mario', 'luigi', 'zelda', 'sonic',
            'dragon', 'unicorn', 'griffin', 'phoenix',
            
            # Specific branded content
            'nintendo', 'playstation', 'xbox',
            
            # Abstract concepts that need specific visualization
            'neural network visualization', 'blockchain diagram', 
            'quantum computing illustration', 'metaverse concept',
            
            # Custom scenarios
            'custom illustration', 'specific scenario', 'unique visualization'
        ]
        
        text_to_check = (slide_title + " " + slide_content).lower()
        
        # Check if any keywords require AI generation
        for keyword in ai_necessary_keywords:
            if keyword in text_to_check:
                return True
        
        return False 