"""
Process tagged media to upload base64 images to Supabase.
"""
import logging
from typing import Dict, Any, List
from services.image_storage_service import ImageStorageService

logger = logging.getLogger(__name__)


class TaggedMediaProcessor:
    """Process tagged media to prepare for slide generation."""
    
    def __init__(self):
        self.storage_service = ImageStorageService()
    
    async def process_tagged_media(self, tagged_media: List[Any]) -> List[Dict[str, Any]]:
        """
        Process tagged media items, uploading base64 images to Supabase.
        
        Args:
            tagged_media: List of tagged media items from the outline (can be dicts or Pydantic models)
            
        Returns:
            Updated tagged media with Supabase URLs
        """
        if not tagged_media:
            return []
        
        processed_media = []
        
        async with self.storage_service as storage:
            for media in tagged_media:
                try:
                    # Convert Pydantic model to dict if needed
                    if hasattr(media, 'model_dump'):
                        media_dict = media.model_dump()
                    else:
                        media_dict = media
                    
                    # Skip non-image media
                    if media_dict.get('type') != 'image':
                        processed_media.append(media_dict)
                        continue
                    
                    preview_url = media_dict.get('previewUrl', '')
                    
                    # Check if it's a base64 data URL
                    if preview_url.startswith('data:'):
                        logger.info(f"Processing base64 image: {media_dict.get('filename')}")
                        
                        # Extract base64 data from data URL
                        # Format: data:image/png;base64,<base64_data>
                        parts = preview_url.split(',', 1)
                        if len(parts) == 2:
                            header = parts[0]
                            base64_data = parts[1]
                            
                            # Extract MIME type
                            mime_type = 'image/png'  # Default
                            if 'image/jpeg' in header:
                                mime_type = 'image/jpeg'
                            elif 'image/jpg' in header:
                                mime_type = 'image/jpeg'
                            elif 'image/gif' in header:
                                mime_type = 'image/gif'
                            elif 'image/webp' in header:
                                mime_type = 'image/webp'
                            
                            # Upload to Supabase
                            result = await storage.upload_image_from_base64(
                                base64_data=base64_data,
                                filename=media_dict.get('filename', 'tagged-media.png'),
                                content_type=mime_type
                            )
                            
                            if 'error' not in result:
                                # Update media with Supabase URL
                                media_dict = media_dict.copy()  # Don't modify original
                                media_dict['previewUrl'] = result['url']
                                media_dict['supabase_path'] = result.get('path')
                                media_dict['original_preview_url'] = preview_url  # Keep original for reference
                                logger.info(f"Uploaded {media_dict.get('filename')} to Supabase: {result['url']}")
                            else:
                                logger.error(f"Failed to upload {media_dict.get('filename')}: {result['error']}")
                        else:
                            logger.warning(f"Invalid data URL format for {media_dict.get('filename')}")
                    
                    # If it's already a regular URL (http/https), keep it as is
                    elif preview_url.startswith('http'):
                        logger.info(f"Media {media_dict.get('filename')} already has URL: {preview_url}")
                    
                    processed_media.append(media_dict)
                    
                except Exception as e:
                    logger.error(f"Error processing media {getattr(media, 'filename', 'unknown')}: {str(e)}")
                    # Keep the original media item (as dict) even if processing fails
                    if hasattr(media, 'model_dump'):
                        processed_media.append(media.model_dump())
                    else:
                        processed_media.append(media)
        
        return processed_media
    
    async def process_deck_outline_media(self, deck_outline: Any) -> None:
        """
        Process all tagged media in a deck outline in-place.
        
        Args:
            deck_outline: DeckOutline object with slides containing tagged media
        """
        if not hasattr(deck_outline, 'slides'):
            return
        
        logger.info(f"Processing tagged media for deck: {deck_outline.title}")
        
        for slide in deck_outline.slides:
            if hasattr(slide, 'taggedMedia') and slide.taggedMedia:
                logger.info(f"Processing {len(slide.taggedMedia)} media items for slide: {slide.title}")
                # Process the tagged media and update in place
                slide.taggedMedia = await self.process_tagged_media(slide.taggedMedia)
        
        logger.info("Completed processing all tagged media in deck") 