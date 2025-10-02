import os
import hashlib
import aiohttp
import asyncio
from typing import Dict, Any, Optional, List, Tuple
from urllib.parse import urlparse
import mimetypes
import logging
from utils.supabase import get_supabase_client
import base64
from io import BytesIO

logger = logging.getLogger(__name__)

class ImageStorageService:
    """Service for uploading and managing images in Supabase storage."""
    
    def __init__(self):
        """Initialize the image storage service."""
        self.supabase = get_supabase_client()
        self.bucket_name = "slide-media"
        self.session = None
        self._cache = {}  # URL -> Supabase URL cache
        self._session_owner = False  # Track if we created the session
        
    async def __aenter__(self):
        """Async context manager entry."""
        if not self.session:
            self.session = aiohttp.ClientSession()
            self._session_owner = True
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session and self._session_owner:
            await self.session.close()
            self.session = None
            
    def _get_session(self):
        """Get or create aiohttp session."""
        if not self.session:
            self.session = aiohttp.ClientSession()
            self._session_owner = True
        return self.session
            
    def _truncate_data_url(self, url: str) -> str:
        """Truncate data URLs for logging to avoid huge base64 strings."""
        if url.startswith('data:'):
            return url[:50] + '...[truncated]'
        return url
    
    def _generate_file_path(self, url: str, content_type: Optional[str] = None) -> str:
        """Generate a unique file path based on URL hash."""
        # Create a hash of the URL for consistent naming
        url_hash = hashlib.md5(url.encode()).hexdigest()
        
        # Try to get extension from URL or content type
        parsed = urlparse(url)
        path = parsed.path
        ext = os.path.splitext(path)[1].lower()
        
        if not ext and content_type:
            # Try to get extension from content type
            ext = mimetypes.guess_extension(content_type) or ''
            
        if not ext:
            # Default to .jpg for images
            ext = '.jpg'
            
        # Organize by first 2 chars of hash for better bucket organization
        return f"images/{url_hash[:2]}/{url_hash}{ext}"
    
    async def upload_image_from_url(self, image_url: str, metadata: Optional[Dict[str, Any]] = None, headers_override: Optional[Dict[str, str]] = None) -> Dict[str, Any]:
        """
        Upload an image from a URL to Supabase storage.
        
        Args:
            image_url: The URL of the image to upload
            metadata: Optional metadata to store with the image
            
        Returns:
            Dict with 'url' (Supabase URL) and 'path' (storage path)
        """
        # Check cache first
        if image_url in self._cache:
            logger.debug(f"Image already cached: {self._truncate_data_url(image_url)}")
            return self._cache[image_url]
            
        try:
            session = self._get_session()
            
            # Add browser-like headers to avoid 403 errors
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Accept-Encoding': 'gzip, deflate',  # Remove 'br' to avoid Brotli encoding
                'Cache-Control': 'no-cache',
                'Pragma': 'no-cache',
                'Sec-Fetch-Dest': 'image',
                'Sec-Fetch-Mode': 'no-cors',
                'Sec-Fetch-Site': 'cross-site',
                'Referer': 'https://www.google.com/'
            }
            if isinstance(headers_override, dict):
                headers.update(headers_override)
            
            # Download the image with browser headers
            try:
                async with session.get(image_url, headers=headers, timeout=30) as response:
                    if response.status == 403:
                        # Try with a different referer if 403
                        headers['Referer'] = urlparse(image_url).scheme + '://' + urlparse(image_url).netloc + '/'
                        async with session.get(image_url, headers=headers, timeout=30) as retry_response:
                            if retry_response.status != 200:
                                logger.warning(f"Failed to download image after retry: {self._truncate_data_url(image_url)} (status: {retry_response.status})")
                                raise Exception(f"Failed to download image: {retry_response.status}")
                            response = retry_response
                            content = await response.read()
                            content_type = response.headers.get('Content-Type', 'image/jpeg')
                    elif response.status != 200:
                        raise Exception(f"Failed to download image: {response.status}")
                    else:
                        content = await response.read()
                        content_type = response.headers.get('Content-Type', 'image/jpeg')
            except aiohttp.ClientError as e:
                # Handle various aiohttp errors including encoding issues
                if "brotli" in str(e).lower():
                    logger.warning(f"Brotli encoding issue, retrying without br support: {self._truncate_data_url(image_url)}")
                    # Retry without any encoding preferences
                    headers['Accept-Encoding'] = 'identity'
                    async with session.get(image_url, headers=headers, timeout=30) as response:
                        if response.status != 200:
                            raise Exception(f"Failed to download image: {response.status}")
                        content = await response.read()
                        content_type = response.headers.get('Content-Type', 'image/jpeg')
                else:
                    raise
            
            # Generate file path
            file_path = self._generate_file_path(image_url, content_type)
            
            # Check if file already exists in storage
            existing = self.supabase.storage.from_(self.bucket_name).list(path=os.path.dirname(file_path))
            file_name = os.path.basename(file_path)
            
            if any(f['name'] == file_name for f in existing):
                logger.debug(f"Image already exists in storage: {file_path}")
                public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
                result = {'url': public_url, 'path': file_path, 'cached': True}
                self._cache[image_url] = result
                return result
            
            # Upload to Supabase
            response = self.supabase.storage.from_(self.bucket_name).upload(
                path=file_path,
                file=content,
                file_options={"content-type": content_type}
            )
            
            # Get public URL
            public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
            
            result = {
                'url': public_url,
                'path': file_path,
                'original_url': image_url,
                'metadata': metadata
            }
            
            # Cache the result
            self._cache[image_url] = result
            
            # Truncate data URLs for logging
            display_url = self._truncate_data_url(image_url)
            logger.info(f"Successfully uploaded image: {display_url} -> {public_url}")
            return result
            
        except Exception as e:
            # Truncate data URLs to avoid logging huge base64 strings
            display_url = self._truncate_data_url(image_url)
            logger.error(f"Error uploading image {display_url}: {str(e)}")
            # Return original URL as fallback
            return {'url': image_url, 'error': str(e)}
    
    async def upload_image_from_base64(self, base64_data: str, filename: str, content_type: str = "image/png") -> Dict[str, Any]:
        """
        Upload an image from base64 data to Supabase storage.
        
        Args:
            base64_data: Base64 encoded image data
            filename: Desired filename
            content_type: MIME type of the image
            
        Returns:
            Dict with 'url' (Supabase URL) and 'path' (storage path)
        """
        try:
            # Decode base64 data
            image_data = base64.b64decode(base64_data)
            
            # Generate unique file path
            file_hash = hashlib.md5(image_data).hexdigest()
            ext = mimetypes.guess_extension(content_type) or '.png'
            file_path = f"ai-generated/{file_hash[:2]}/{file_hash}{ext}"
            
            # Check if file already exists
            existing = self.supabase.storage.from_(self.bucket_name).list(path=os.path.dirname(file_path))
            file_name = os.path.basename(file_path)
            
            if any(f['name'] == file_name for f in existing):
                logger.debug(f"AI image already exists in storage: {file_path}")
                public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
                return {'url': public_url, 'path': file_path, 'cached': True}
            
            # Upload to Supabase
            response = self.supabase.storage.from_(self.bucket_name).upload(
                path=file_path,
                file=image_data,
                file_options={"content-type": content_type}
            )
            
            # Get public URL
            public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
            
            result = {
                'url': public_url,
                'path': file_path,
                'ai_generated': True,
                'original_filename': filename
            }
            
            logger.info(f"Successfully uploaded AI-generated image: {public_url}")
            return result
            
        except Exception as e:
            logger.error(f"Error uploading base64 image: {str(e)}")
            raise
    
    async def process_slide_images(self, slide_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process all images in a slide, uploading external ones to Supabase.
        
        Args:
            slide_data: Slide data containing components
            
        Returns:
            Updated slide data with Supabase URLs
        """
        components = slide_data.get('components', [])
        
        for component in components:
            if component.get('type') == 'Image':
                props = component.get('props', {})
                src = props.get('src', '')
                
                # Skip if already a Supabase URL or placeholder
                if 'supabase' in src or src == 'placeholder' or not src.startswith('http'):
                    continue
                    
                # Upload the image
                result = await self.upload_image_from_url(src)
                if 'error' not in result:
                    props['src'] = result['url']
                    props['original_src'] = src
                    
        return slide_data
    
    async def process_deck_images(self, deck_data: Dict[str, Any]) -> Dict[str, Any]:
        """
        Process all images in a deck, uploading external ones to Supabase.
        
        Args:
            deck_data: Deck data containing slides
            
        Returns:
            Updated deck data with Supabase URLs
        """
        slides = deck_data.get('slides', [])
        
        # Process all slides in parallel
        tasks = [self.process_slide_images(slide) for slide in slides]
        updated_slides = await asyncio.gather(*tasks)
        
        deck_data['slides'] = updated_slides
        return deck_data
    
    async def batch_upload_images(self, image_urls: List[str]) -> Dict[str, str]:
        """
        Upload multiple images in parallel.
        
        Args:
            image_urls: List of image URLs to upload
            
        Returns:
            Dict mapping original URLs to Supabase URLs
        """
        tasks = [self.upload_image_from_url(url) for url in image_urls]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        
        url_mapping = {}
        for url, result in zip(image_urls, results):
            if isinstance(result, dict) and 'url' in result:
                url_mapping[url] = result['url']
            else:
                url_mapping[url] = url  # Fallback to original
                
        return url_mapping 
    
    async def cleanup(self):
        """Clean up resources."""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
            self._session_owner = False 