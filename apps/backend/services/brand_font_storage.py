#!/usr/bin/env python3
"""
Brand Font Storage Service
Handles uploading, storing, and serving custom brand fonts via Supabase Storage
"""

import os
import hashlib
from typing import Dict, Any, Optional, List
from pathlib import Path
import mimetypes
import logging
from utils.supabase import get_supabase_client

logger = logging.getLogger(__name__)

class BrandFontStorageService:
    """Service for managing brand font files in Supabase storage."""

    def __init__(self):
        """Initialize the brand font storage service."""
        self.supabase = get_supabase_client()
        self.bucket_name = "slide-media"
        self._cache = {}  # Cache for font URLs

    def _generate_font_path(self, brand_id: str, font_name: str, variant: str, extension: str) -> str:
        """
        Generate a consistent file path for font storage.

        Args:
            brand_id: UUID of the brand
            font_name: Name of the font (e.g., "Proxima Nova")
            variant: Font variant (regular, bold, italic, etc.)
            extension: File extension (.ttf, .otf, .woff, .woff2)

        Returns:
            Storage path like 'fonts/brands/{brand_id}/proxima-nova-bold.woff2'
        """
        # Sanitize font name for filename
        safe_font_name = font_name.lower().replace(' ', '-').replace('_', '-')
        safe_variant = variant.lower().replace(' ', '-')

        # Ensure extension has dot
        if not extension.startswith('.'):
            extension = f'.{extension}'

        return f"fonts/brands/{brand_id}/{safe_font_name}-{safe_variant}{extension}"

    async def upload_font_file(
        self,
        brand_id: str,
        font_name: str,
        variant: str,
        file_bytes: bytes,
        filename: str
    ) -> Dict[str, Any]:
        """
        Upload a font file to Supabase storage.

        Args:
            brand_id: UUID of the brand
            font_name: Name of the font
            variant: Font variant (regular, bold, italic, etc.)
            file_bytes: Font file bytes
            filename: Original filename (for extension detection)

        Returns:
            Dict with 'url' (public URL), 'path' (storage path), and metadata
        """
        try:
            # Get file extension
            ext = os.path.splitext(filename)[1].lower()
            if not ext:
                ext = '.woff2'  # Default to woff2

            # Generate storage path
            file_path = self._generate_font_path(brand_id, font_name, variant, ext)

            # Determine content type
            content_type = mimetypes.types_map.get(ext, 'application/octet-stream')
            if ext in ['.ttf', '.otf', '.woff', '.woff2']:
                content_type = f'font/{ext[1:]}'

            # Upload to Supabase storage
            logger.info(f"Uploading font: {file_path} ({len(file_bytes)} bytes)")

            # Check if file already exists and delete it
            try:
                existing_files = self.supabase.storage.from_(self.bucket_name).list(
                    path=f"fonts/brands/{brand_id}"
                )
                file_name = os.path.basename(file_path)
                if any(f['name'] == file_name for f in existing_files):
                    logger.info(f"Removing existing font file: {file_path}")
                    self.supabase.storage.from_(self.bucket_name).remove([file_path])
            except Exception as e:
                logger.debug(f"No existing file to remove: {e}")

            # Upload new file
            response = self.supabase.storage.from_(self.bucket_name).upload(
                path=file_path,
                file=file_bytes,
                file_options={
                    'content-type': content_type,
                    'cache-control': '31536000',  # Cache for 1 year
                    'upsert': 'true'
                }
            )

            # Get public URL
            public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)

            result = {
                'url': public_url,
                'path': file_path,
                'variant': variant,
                'extension': ext,
                'size': len(file_bytes),
                'content_type': content_type
            }

            # Cache the result
            cache_key = f"{brand_id}:{font_name}:{variant}"
            self._cache[cache_key] = result

            logger.info(f"✅ Successfully uploaded font: {font_name} ({variant})")
            return result

        except Exception as e:
            logger.error(f"Error uploading font file: {e}")
            raise

    async def delete_font_file(self, brand_id: str, file_path: str) -> bool:
        """
        Delete a font file from Supabase storage.

        Args:
            brand_id: UUID of the brand
            file_path: Storage path of the font file

        Returns:
            True if successful, False otherwise
        """
        try:
            self.supabase.storage.from_(self.bucket_name).remove([file_path])
            logger.info(f"Deleted font file: {file_path}")
            return True
        except Exception as e:
            logger.error(f"Error deleting font file: {e}")
            return False

    async def list_brand_fonts(self, brand_id: str) -> List[Dict[str, Any]]:
        """
        List all font files for a brand.

        Args:
            brand_id: UUID of the brand

        Returns:
            List of font file metadata
        """
        try:
            files = self.supabase.storage.from_(self.bucket_name).list(
                path=f"fonts/brands/{brand_id}"
            )

            font_files = []
            for file in files:
                if file.get('name'):
                    full_path = f"fonts/brands/{brand_id}/{file['name']}"
                    public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(full_path)

                    font_files.append({
                        'name': file['name'],
                        'path': full_path,
                        'url': public_url,
                        'size': file.get('metadata', {}).get('size', 0),
                        'updated_at': file.get('updated_at'),
                        'created_at': file.get('created_at')
                    })

            return font_files

        except Exception as e:
            logger.error(f"Error listing brand fonts: {e}")
            return []

    def get_font_url(self, brand_id: str, font_name: str, variant: str = 'regular') -> Optional[str]:
        """
        Get the public URL for a specific font variant.

        Args:
            brand_id: UUID of the brand
            font_name: Name of the font
            variant: Font variant

        Returns:
            Public URL or None if not found
        """
        cache_key = f"{brand_id}:{font_name}:{variant}"
        if cache_key in self._cache:
            return self._cache[cache_key]['url']

        # Try to construct URL from known pattern
        # This assumes the file exists; better to check storage if critical
        safe_font_name = font_name.lower().replace(' ', '-').replace('_', '-')
        safe_variant = variant.lower().replace(' ', '-')

        # Try common extensions
        for ext in ['.woff2', '.woff', '.ttf', '.otf']:
            file_path = f"fonts/brands/{brand_id}/{safe_font_name}-{safe_variant}{ext}"
            try:
                # Check if file exists (you might want to cache this check)
                public_url = self.supabase.storage.from_(self.bucket_name).get_public_url(file_path)
                return public_url
            except:
                continue

        return None
