"""
Image validation service to check if images are accessible and not behind Cloudflare protection.
"""

import aiohttp
import asyncio
from typing import Dict, Any, List, Optional
import logging

logger = logging.getLogger(__name__)

class ImageValidator:
    """Validates that images are accessible and not behind protection."""
    
    # Headers that indicate Cloudflare protection
    CLOUDFLARE_HEADERS = {
        'cf-ray', 'cf-cache-status', 'cf-request-id', 
        'cf-apo-via', 'cf-edge-cache'
    }
    
    # Common Cloudflare challenge response codes
    CLOUDFLARE_STATUS_CODES = {403, 503}
    
    # Headers to mimic a real browser
    BROWSER_HEADERS = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
        'Accept': 'image/webp,image/apng,image/*,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Accept-Encoding': 'gzip, deflate, br',
        'Cache-Control': 'no-cache',
        'Pragma': 'no-cache'
    }
    
    @staticmethod
    async def validate_image(url: str, timeout: int = 5) -> Dict[str, Any]:
        """
        Validates if an image URL is accessible.
        
        Returns:
            Dict with:
            - valid: bool - Whether the image is accessible
            - reason: str - Reason if invalid
            - headers: dict - Response headers (for debugging)
        """
        try:
            async with aiohttp.ClientSession() as session:
                async with session.head(
                    url, 
                    headers=ImageValidator.BROWSER_HEADERS,
                    timeout=aiohttp.ClientTimeout(total=timeout),
                    allow_redirects=True
                ) as response:
                    
                    # Check for Cloudflare protection
                    response_headers = {k.lower(): v for k, v in response.headers.items()}
                    
                    # Check if Cloudflare headers are present
                    has_cloudflare = any(
                        cf_header in response_headers 
                        for cf_header in ImageValidator.CLOUDFLARE_HEADERS
                    )
                    
                    # Check for Cloudflare challenge page
                    if response.status in ImageValidator.CLOUDFLARE_STATUS_CODES and has_cloudflare:
                        return {
                            'valid': False,
                            'reason': 'Cloudflare protection detected',
                            'status': response.status,
                            'headers': dict(response_headers)
                        }
                    
                    # Check for other access issues
                    if response.status == 403:
                        return {
                            'valid': False,
                            'reason': 'Access forbidden',
                            'status': response.status
                        }
                    
                    if response.status == 404:
                        return {
                            'valid': False,
                            'reason': 'Image not found',
                            'status': response.status
                        }
                    
                    # Check if it's actually an image
                    content_type = response_headers.get('content-type', '')
                    if response.status == 200 and not content_type.startswith('image/'):
                        return {
                            'valid': False,
                            'reason': f'Not an image (content-type: {content_type})',
                            'status': response.status
                        }
                    
                    # Image seems accessible
                    if response.status == 200:
                        return {
                            'valid': True,
                            'reason': 'Image accessible',
                            'status': response.status
                        }
                    
                    # Other status codes
                    return {
                        'valid': False,
                        'reason': f'HTTP {response.status}',
                        'status': response.status
                    }
                    
        except asyncio.TimeoutError:
            return {
                'valid': False,
                'reason': 'Timeout - server took too long to respond'
            }
        except aiohttp.ClientError as e:
            return {
                'valid': False,
                'reason': f'Network error: {str(e)}'
            }
        except Exception as e:
            return {
                'valid': False,
                'reason': f'Validation error: {str(e)}'
            }
    
    @staticmethod
    async def validate_images(urls: List[str], max_concurrent: int = 5) -> Dict[str, Dict[str, Any]]:
        """
        Validates multiple image URLs concurrently.
        
        Returns:
            Dict mapping URL to validation result
        """
        semaphore = asyncio.Semaphore(max_concurrent)
        
        async def validate_with_semaphore(url: str) -> tuple[str, Dict[str, Any]]:
            async with semaphore:
                result = await ImageValidator.validate_image(url)
                return url, result
        
        tasks = [validate_with_semaphore(url) for url in urls]
        results = await asyncio.gather(*tasks)
        
        return dict(results)
    
    @staticmethod
    async def filter_valid_images(images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Filters a list of image dictionaries to only include accessible images.
        
        Args:
            images: List of image dicts with 'url' field
            
        Returns:
            List of valid images
        """
        if not images:
            return []
        
        # Extract URLs
        urls = [img.get('url') or img.get('src', {}).get('large', '') for img in images]
        urls = [url for url in urls if url]  # Filter out empty URLs
        
        # Validate all URLs
        validation_results = await ImageValidator.validate_images(urls)
        
        # Filter images
        valid_images = []
        for img in images:
            url = img.get('url') or img.get('src', {}).get('large', '')
            if url and validation_results.get(url, {}).get('valid', False):
                valid_images.append(img)
            else:
                reason = validation_results.get(url, {}).get('reason', 'Unknown')
                logger.debug(f"Filtered out image: {url[:50]}... - Reason: {reason}")
        
        return valid_images 