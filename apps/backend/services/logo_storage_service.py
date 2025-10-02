#!/usr/bin/env python3
"""
Logo Storage Service - Downloads and stores brand logos in Supabase storage
Replaces CDN URLs with our own Supabase storage URLs to prevent 404 issues.
"""

import os
import hashlib
import aiohttp
import asyncio
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse
import mimetypes
from setup_logging_optimized import get_logger
from utils.supabase import get_supabase_client

logger = get_logger(__name__)

class LogoStorageService:
    """Service for downloading and storing brand logos in Supabase storage."""

    def __init__(self):
        """Initialize the logo storage service."""
        self.supabase = get_supabase_client()
        self.bucket_name = "slide-media"
        self.session = None
        self._cache = {}  # URL -> Supabase URL cache
        self._session_owner = False

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

    def _generate_logo_path(self, brand_domain: str, logo_url: str, logo_type: str = "logo") -> str:
        """
        Generate a consistent file path for logo storage.

        Args:
            brand_domain: Domain of the brand (e.g., 'instacart.com')
            logo_url: Original logo URL
            logo_type: Type of logo ('logo', 'symbol', 'icon')

        Returns:
            Storage path like 'logos/instacart.com/logo.svg'
        """
        # Get file extension from URL
        parsed = urlparse(logo_url)
        path = parsed.path
        ext = os.path.splitext(path)[1].lower()

        if not ext:
            # Default to .svg for logos
            ext = '.svg'

        # Clean domain for safe file naming
        clean_domain = brand_domain.lower().replace('.', '_')

        return f"logos/{clean_domain}/{logo_type}{ext}"

    async def download_and_store_logo(self, logo_url: str, brand_domain: str, logo_type: str = "logo") -> Dict[str, Any]:
        """
        Download a logo from external URL and store it in Supabase storage.

        Args:
            logo_url: External logo URL to download
            brand_domain: Brand domain (e.g., 'instacart.com')
            logo_type: Type of logo ('logo', 'symbol', 'icon')

        Returns:
            Dict with 'url' (Supabase URL), 'path' (storage path), and 'original_url'
        """
        # Check cache first
        cache_key = f"{brand_domain}:{logo_type}:{logo_url}"
        if cache_key in self._cache:
            logger.debug(f"Logo already cached: {brand_domain} {logo_type}")
            return self._cache[cache_key]

        try:
            # Generate storage path
            file_path = self._generate_logo_path(brand_domain, logo_url, logo_type)

            # Check if file already exists in storage
            try:
                existing = self.supabase.storage.from_(self.bucket_name).list(path=os.path.dirname(file_path))
                file_name = os.path.basename(file_path)

                if any(f['name'] == file_name for f in existing):
                    logger.info(f"Logo already exists in storage: {file_path}")
                    public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
                    result = {
                        'url': public_url,
                        'path': file_path,
                        'original_url': logo_url,
                        'cached': True
                    }
                    self._cache[cache_key] = result
                    return result
            except Exception as e:
                logger.debug(f"Error checking existing file: {e}")

            # Download the logo
            headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'image/svg+xml,image/*,*/*;q=0.8',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
                'Referer': f"https://{brand_domain}/"
            }

            async with self.session.get(logo_url, headers=headers, timeout=30) as response:
                if response.status != 200:
                    logger.warning(f"Failed to download logo: {logo_url} (status: {response.status})")
                    return {'url': logo_url, 'error': f"Download failed: {response.status}"}

                content = await response.read()
                content_type = response.headers.get('Content-Type', 'image/svg+xml')

                # Validate content
                if len(content) == 0:
                    logger.warning(f"Empty logo content: {logo_url}")
                    return {'url': logo_url, 'error': "Empty content"}

                # Upload to Supabase
                try:
                    upload_response = self.supabase.storage.from_(self.bucket_name).upload(
                        path=file_path,
                        file=content,
                        file_options={"content-type": content_type}
                    )

                    # Get public URL
                    public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)

                    result = {
                        'url': public_url,
                        'path': file_path,
                        'original_url': logo_url,
                        'brand_domain': brand_domain,
                        'logo_type': logo_type,
                        'content_type': content_type,
                        'size_bytes': len(content)
                    }

                    # Cache the result
                    self._cache[cache_key] = result

                    logger.info(f"Successfully stored logo: {brand_domain} {logo_type} -> {public_url}")
                    return result

                except Exception as upload_error:
                    logger.error(f"Error uploading logo to Supabase: {upload_error}")
                    return {'url': logo_url, 'error': f"Upload failed: {str(upload_error)}"}

        except Exception as e:
            logger.error(f"Error downloading/storing logo {logo_url}: {str(e)}")
            return {'url': logo_url, 'error': str(e)}

    async def process_brand_logos(self, brand_data: Dict[str, Any], brand_domain: str) -> Dict[str, Any]:
        """
        Process all logos in brand data, downloading and storing them.

        Args:
            brand_data: Brand data containing logos dict
            brand_domain: Brand domain for file organization

        Returns:
            Updated brand data with Supabase storage URLs
        """
        if not brand_data or not brand_data.get('logos'):
            return brand_data

        logos_data = brand_data['logos']
        updated_logos = {}

        # Process each logo category
        for category, logo_list in logos_data.items():
            if not isinstance(logo_list, list):
                updated_logos[category] = logo_list
                continue

            updated_logo_list = []

            for logo_item in logo_list:
                if not isinstance(logo_item, dict) or 'formats' not in logo_item:
                    updated_logo_list.append(logo_item)
                    continue

                # Process each format in the logo
                updated_formats = []
                logo_type = logo_item.get('type', 'logo')

                for format_item in logo_item.get('formats', []):
                    if not isinstance(format_item, dict) or 'url' not in format_item:
                        updated_formats.append(format_item)
                        continue

                    original_url = format_item['url']

                    # Skip if already our storage URL
                    if 'supabase' in original_url or 'nextslide.ai' in original_url:
                        updated_formats.append(format_item)
                        continue

                    # Download and store
                    storage_result = await self.download_and_store_logo(
                        original_url,
                        brand_domain,
                        logo_type
                    )

                    # Update format with new URL
                    updated_format = format_item.copy()
                    if 'error' not in storage_result:
                        updated_format['url'] = storage_result['url']
                        updated_format['original_url'] = original_url
                        updated_format['stored_at'] = storage_result.get('path')

                    updated_formats.append(updated_format)

                # Update logo item with new formats
                updated_logo_item = logo_item.copy()
                updated_logo_item['formats'] = updated_formats
                updated_logo_list.append(updated_logo_item)

            updated_logos[category] = updated_logo_list

        # Update brand data with processed logos
        updated_brand_data = brand_data.copy()
        updated_brand_data['logos'] = updated_logos

        return updated_brand_data

    async def check_logo_url_health(self, logo_url: str) -> bool:
        """
        Check if a logo URL is accessible (returns 200).

        Args:
            logo_url: URL to check

        Returns:
            True if accessible, False otherwise
        """
        try:
            async with self.session.head(logo_url, timeout=10) as response:
                return response.status == 200
        except Exception:
            return False

    async def cleanup(self):
        """Clean up resources."""
        if self.session and not self.session.closed:
            await self.session.close()
            self.session = None
            self._session_owner = False