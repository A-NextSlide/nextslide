"""
Image management - handles search, application, and styling of images.
"""
import asyncio
import json
import re
from typing import Dict, Any, List, Optional
from services.combined_image_service import CombinedImageService
from services.image_storage_service import ImageStorageService
from agents.ai.clients import get_client, invoke
from agents.config import COMPOSER_MODEL
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class ImageManager:
    """Manages image search, selection, and application to slides."""
    
    def __init__(self):
        self.image_service = CombinedImageService()
        self.storage_service = ImageStorageService()
        self.pending_images: Dict[str, List[Dict[str, Any]]] = {}
        self.image_update_queue: Optional[asyncio.Queue] = None
    
    async def search_images_background(
        self,
        deck_outline,
        deck_uuid: str,
        callback=None,
        max_images_per_slide: int = 6,
        search_queries: Optional[Dict] = None
    ) -> asyncio.Task:
        """Start background image search."""
        logger.info(f"🎯 IMAGE MANAGER: Starting background search for deck {deck_uuid}")
        logger.info(f"🎯 Deck title: {deck_outline.title if hasattr(deck_outline, 'title') else 'Unknown'}")
        logger.info(f"🎯 Number of slides: {len(deck_outline.slides) if hasattr(deck_outline, 'slides') else 0}")
        
        async def image_update_callback(update):
            logger.debug(f"🎯 IMAGE MANAGER CALLBACK: {update.get('type')} - {update.get('message', '')}")
            
            # Handle slide_images_found event (what the service actually sends)
            if update.get('type') == 'slide_images_found':
                data = update.get('data', {})
                slide_id = data.get('slide_id')
                images = data.get('images', [])
                if slide_id and images:
                    self.pending_images[slide_id] = images
                    logger.info(f"Stored {len(images)} pending images for slide {slide_id}")
            
            # Also handle the old event type just in case
            elif update.get('type') == 'slide_images_ready':
                slide_id = update.get('slide_id')
                images = update.get('images', [])
                if slide_id and images:
                    self.pending_images[slide_id] = images
                    logger.info(f"Stored {len(images)} pending images for slide {slide_id}")
            
            if callback:
                await callback(update)
        
        return await self.image_service.search_images_background(
            deck_outline=deck_outline,
            deck_uuid=deck_uuid,
            callback=image_update_callback,
            max_images_per_slide=max_images_per_slide,
            search_queries=search_queries
        )
    
    def get_pending_images_for_slide(self, slide_id: str) -> List[Dict[str, Any]]:
        """Get pending images for a specific slide."""
        images = self.pending_images.get(slide_id, [])
        if not images:
            # Debug: summarize pending images in logs
            logger.debug(f"No pending images for slide {slide_id}. Pending summary: {[ (sid, len(imgs)) for sid, imgs in self.pending_images.items() ]}")
        return images
    
    async def apply_pending_images(self, slide_id: str, slide_data: Dict[str, Any], theme: Dict[str, Any]) -> bool:
        """Apply pending images to a slide during generation."""
        if slide_id not in self.pending_images:
            return False
            
        images = self.pending_images[slide_id]
        image_components = [
            comp for comp in slide_data.get('components', [])
            if comp.get('type') == 'Image' and comp.get('props', {}).get('src') in ['', 'placeholder']
        ]
        
        applied = False
        for i, component in enumerate(image_components):
            if i < len(images):
                component['props']['src'] = images[i].get('url', '')
                component['props']['alt'] = images[i].get('alt', '')
                
                # Apply theme-appropriate effects
                effects = theme.get('visual_style', {}).get('image_effects', ['ken-burns'])
                if effects and 'ken-burns' in effects[0]:
                    component['props']['animation'] = {
                        "type": "ken-burns",
                        "duration": 20,
                        "scale": 1.1
                    }
                applied = True
        
        if applied:
            del self.pending_images[slide_id]
        
        return applied
    
    async def apply_selected_images(
        self,
        deck: Dict[str, Any],
        slide_index: int,
        slide_id: str,
        selected_urls: List[str]
    ) -> Optional[Dict[str, Any]]:
        """Apply user-selected images to a slide."""
        if slide_index >= len(deck.get('slides', [])):
            return None
            
        slide_data = deck['slides'][slide_index]
        
        image_components = [
            (i, comp) for i, comp in enumerate(slide_data.get('components', []))
            if comp.get('type') == 'Image' and 
            comp.get('props', {}).get('src') in ['', 'placeholder']
        ]
        
        if not image_components:
            return None
        
        for i, (comp_idx, component) in enumerate(image_components):
            if i < len(selected_urls):
                component['props']['src'] = selected_urls[i]
                component['props']['alt'] = f"User selected image {i+1}"
        
        return slide_data
    
    async def style_images_with_ai(
        self,
        slide_data: Dict[str, Any],
        available_images: List[Dict[str, Any]],
        theme: Dict[str, Any],
        palette: Optional[Dict[str, Any]]
    ) -> List[Dict[str, Any]]:
        """Get AI recommendations for image styling."""
        image_components = [
            comp for comp in slide_data.get('components', [])
            if comp.get('type') == 'Image'
        ]
        
        if not image_components:
            return []
        
        prompt = self._create_styling_prompt(
            slide_data, available_images, theme, palette, len(image_components)
        )
        
        client, model = get_client(COMPOSER_MODEL)
        response = await invoke(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            max_tokens=1500,
            response_model=None
        )
        
        return self._parse_styling_response(response)
    
    def _create_styling_prompt(
        self,
        slide_data: Dict[str, Any],
        available_images: List[Dict[str, Any]],
        theme: Dict[str, Any],
        palette: Optional[Dict[str, Any]],
        image_count: int
    ) -> str:
        """Create AI prompt for image styling decisions."""
        visual_style = theme.get('visual_style', {})
        color_palette = theme.get('color_palette', {})
        
        return f"""
You are styling images for a slide titled: {slide_data.get('title', 'Untitled')}
Theme: {theme.get('theme_name', 'Professional')}
Visual Style: {visual_style.get('background_style', 'solid-color')}
Effects Available: {', '.join(visual_style.get('image_effects', ['ken-burns']))}

For EACH of {image_count} images, decide:
1. Filter/effect preset
2. Mask shape (if applicable)
3. Overlay type and settings
4. Animation approach
5. Transform values

AVAILABLE STYLING OPTIONS:

1. FILTERS:
   - preset: "dramatic", "cyberpunk", "vintage", "dreamy", "noir", "vibrant", "muted"
   - brightness: 0.5-1.5, contrast: 0.5-2.0, grayscale: 0-1, sepia: 0-1, blur: 0-10

2. MASKS:
   - "circle", "hexagon", "diamond", "diagonal", "rounded", "polaroid"

3. OVERLAYS:
   - type: "gradient" or "solid"
   - Gradient presets: fadeToTransparent, fadeToBlack, fadeToWhite, vignette, radialFade, topFade, bottomFade, cinematic
   
4. ANIMATIONS:
   - type: "ken-burns", "fade-in", "slide-in", "zoom", "parallax", "none"
   - duration: seconds

5. TRANSFORMS:
   - scale, rotate, perspective, skew

Return a JSON array with styling for each image:
[
  {{
    "filter": {{"preset": "dramatic", "brightness": 0.8}},
    "mask": "circle",
    "overlay": {{"type": "gradient", "preset": "bottomFade"}},
    "animation": {{"type": "ken-burns", "duration": 20, "scale": 1.1}},
    "transform": {{"scale": 1.05}}
  }}
]

Consider text placement and readability when choosing overlays.
"""
    
    def _parse_styling_response(self, response: str) -> List[Dict[str, Any]]:
        """Parse AI styling response."""
        try:
            json_match = re.search(r'\[[\s\S]*\]', response)
            if json_match:
                return json.loads(json_match.group())
            return []
        except Exception as e:
            logger.error(f"Error parsing styling response: {e}")
            return []
    
    async def upload_image_from_url(self, url: str) -> Optional[Dict[str, Any]]:
        """Upload image to storage."""
        try:
            return await self.storage_service.upload_image_from_url(url)
        except Exception as e:
            logger.error(f"Error uploading image: {e}")
            return None 