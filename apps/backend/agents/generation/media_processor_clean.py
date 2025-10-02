"""
Clean media processor implementation.

Handles:
- Base64 image upload to Supabase
- Image validation and optimization
- Error recovery
- Batch processing
"""

import asyncio
import base64
import logging
from typing import Dict, Any, List, Optional
from dataclasses import dataclass
from io import BytesIO

from PIL import Image

from agents.core.interfaces import IMediaProcessor, IImageService
from agents.generation.config import get_media_config
from agents.generation.exceptions import (
    MediaProcessingError, ImageUploadError,
    ImageFormatError, ImageSizeError
)

logger = logging.getLogger(__name__)


@dataclass
class ProcessedMedia:
    """Result of media processing"""
    id: str
    filename: str
    url: str
    type: str
    interpretation: str
    original_url: Optional[str] = None
    error: Optional[str] = None


class MediaProcessor(IMediaProcessor):
    """
    Clean implementation of media processor.
    
    Responsibilities:
    - Process tagged media items
    - Upload base64 images to cloud storage
    - Validate and optimize images
    - Handle errors gracefully
    """
    
    def __init__(
        self,
        image_service: IImageService,
        config: Optional[Any] = None
    ):
        self.image_service = image_service
        self.config = config or get_media_config()
        
    async def process(self, media_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process a list of media items"""
        if not media_items:
            return []
            
        logger.info(f"Processing {len(media_items)} media items")
        
        # Process in batches for efficiency
        batch_size = 5
        processed = []
        
        for i in range(0, len(media_items), batch_size):
            batch = media_items[i:i + batch_size]
            batch_results = await self._process_batch(batch)
            processed.extend(batch_results)
            
        logger.info(f"Successfully processed {len(processed)} media items")
        return processed
    
    async def _process_batch(self, media_items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Process a batch of media items concurrently"""
        tasks = [self._process_single(item) for item in media_items]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        processed = []
        for item, result in zip(media_items, results):
            if isinstance(result, Exception):
                logger.error(f"Failed to process {item.get('filename', 'unknown')}: {str(result)}")
                # Keep original item with error flag
                processed_item = item.copy()
                processed_item['error'] = str(result)
                processed.append(processed_item)
            else:
                processed.append(result)
                
        return processed
    
    async def _process_single(self, media_item: Dict[str, Any]) -> Dict[str, Any]:
        """Process a single media item"""
        # Extract fields
        media_id = media_item.get('id', '')
        filename = media_item.get('filename', 'unknown')
        media_type = media_item.get('type', '')
        preview_url = media_item.get('previewUrl', '')
        interpretation = media_item.get('interpretation', '')
        
        # Skip non-image media
        if media_type != 'image':
            logger.debug(f"Skipping non-image media: {filename}")
            return media_item
        
        # Check if already processed (has HTTP URL)
        if preview_url.startswith('http'):
            logger.debug(f"Media already processed: {filename}")
            return media_item
        
        # Process base64 image
        if preview_url.startswith('data:'):
            try:
                processed_url = await self._process_base64_image(
                    preview_url, filename, media_id
                )
                
                # Return updated item
                processed_item = media_item.copy()
                processed_item['previewUrl'] = processed_url
                processed_item['original_preview_url'] = preview_url
                processed_item['processed'] = True
                
                logger.info(f"Processed {filename}: {processed_url}")
                return processed_item
                
            except Exception as e:
                raise MediaProcessingError(
                    f"Failed to process {filename}",
                    cause=e,
                    context={'media_id': media_id, 'filename': filename}
                )
        
        # No processing needed
        return media_item
    
    async def _process_base64_image(
        self,
        data_url: str,
        filename: str,
        media_id: str
    ) -> str:
        """Process a base64 data URL and upload to storage"""
        # Parse data URL
        try:
            header, base64_data = data_url.split(',', 1)
        except ValueError:
            raise ImageFormatError(f"Invalid data URL format for {filename}")
        
        # Extract MIME type
        mime_type = self._extract_mime_type(header)
        
        # Decode base64
        try:
            image_data = base64.b64decode(base64_data)
        except Exception as e:
            raise ImageFormatError(f"Invalid base64 data for {filename}", cause=e)
        
        # Validate image
        await self._validate_image(image_data, filename, mime_type)
        
        # Optimize if needed
        if self.config.enable_image_optimization:
            image_data = await self._optimize_image(image_data, mime_type)
        
        # Upload to storage
        try:
            # Generate unique filename
            ext = self._get_extension_from_mime(mime_type)
            storage_filename = f"{media_id}-{filename}"
            if not storage_filename.endswith(ext):
                storage_filename += ext
            
            # Upload
            url = await self.image_service.upload_image(image_data, storage_filename)
            return url
            
        except Exception as e:
            raise ImageUploadError(
                f"Failed to upload {filename}",
                cause=e,
                context={'filename': filename, 'media_id': media_id}
            )
    
    async def _validate_image(
        self,
        image_data: bytes,
        filename: str,
        mime_type: str
    ) -> None:
        """Validate image data"""
        # Check size
        size_mb = len(image_data) / (1024 * 1024)
        if size_mb > self.config.max_image_size_mb:
            raise ImageSizeError(
                f"Image {filename} exceeds size limit: {size_mb:.1f}MB > {self.config.max_image_size_mb}MB"
            )
        
        # Check format
        ext = self._get_extension_from_mime(mime_type)
        if ext.lstrip('.') not in self.config.supported_image_formats:
            raise ImageFormatError(
                f"Unsupported image format for {filename}: {mime_type}"
            )
        
        # Validate image can be opened
        try:
            image = Image.open(BytesIO(image_data))
            
            # Check dimensions
            width, height = image.size
            if width < 10 or height < 10:
                raise ImageSizeError(f"Image {filename} too small: {width}x{height}")
            
            if width > 10000 or height > 10000:
                raise ImageSizeError(f"Image {filename} too large: {width}x{height}")
                
        except Exception as e:
            if isinstance(e, (ImageSizeError, ImageFormatError)):
                raise
            raise ImageFormatError(f"Invalid image data for {filename}", cause=e)
    
    async def _optimize_image(self, image_data: bytes, mime_type: str) -> bytes:
        """Optimize image for web delivery"""
        try:
            # Open image
            image = Image.open(BytesIO(image_data))
            
            # Convert RGBA to RGB if needed for JPEG
            if mime_type == 'image/jpeg' and image.mode == 'RGBA':
                # Create white background
                background = Image.new('RGB', image.size, (255, 255, 255))
                background.paste(image, mask=image.split()[3])
                image = background
            
            # Resize if too large
            max_dimension = 2048
            if image.width > max_dimension or image.height > max_dimension:
                image.thumbnail((max_dimension, max_dimension), Image.Resampling.LANCZOS)
            
            # Save optimized
            output = BytesIO()
            format_name = 'JPEG' if mime_type == 'image/jpeg' else 'PNG'
            
            save_kwargs = {
                'format': format_name,
                'optimize': True
            }
            
            if format_name == 'JPEG':
                save_kwargs['quality'] = self.config.image_quality
                save_kwargs['progressive'] = True
            
            image.save(output, **save_kwargs)
            return output.getvalue()
            
        except Exception as e:
            logger.warning(f"Failed to optimize image: {str(e)}")
            # Return original if optimization fails
            return image_data
    
    def _extract_mime_type(self, header: str) -> str:
        """Extract MIME type from data URL header"""
        # Format: data:image/png;base64
        mime_type = 'image/png'  # Default
        
        if 'image/jpeg' in header:
            mime_type = 'image/jpeg'
        elif 'image/jpg' in header:
            mime_type = 'image/jpeg'
        elif 'image/gif' in header:
            mime_type = 'image/gif'
        elif 'image/webp' in header:
            mime_type = 'image/webp'
        elif 'image/svg' in header:
            mime_type = 'image/svg+xml'
            
        return mime_type
    
    def _get_extension_from_mime(self, mime_type: str) -> str:
        """Get file extension from MIME type"""
        extensions = {
            'image/jpeg': '.jpg',
            'image/png': '.png',
            'image/gif': '.gif',
            'image/webp': '.webp',
            'image/svg+xml': '.svg'
        }
        return extensions.get(mime_type, '.png') 