#!/usr/bin/env python3
"""
Simple Brandfetch Cache - Check DB first, then API, then store result
Exactly what was requested: check backend first, if not found go to Brandfetch, save the result.
"""

import asyncio
import asyncpg
import json
from typing import Dict, Any, Optional

from services.brandfetch_service import BrandfetchService
from services.logo_storage_service import LogoStorageService
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class SimpleBrandfetchCache:
    """
    Simple cache-first Brandfetch wrapper.
    1. Check cache first
    2. If not found, call Brandfetch API
    3. Store the result in cache
    """
    
    def __init__(self, db_connection_string: str, brand_api_key: Optional[str] = None, logo_api_key: Optional[str] = None):
        self.db_connection_string = db_connection_string
        self.brandfetch_service = BrandfetchService(brand_api_key, logo_api_key)
        self.logo_storage_service = LogoStorageService()
        self.db_pool: Optional[asyncpg.Pool] = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        # Initialize database connection pool
        self.db_pool = await asyncpg.create_pool(
            self.db_connection_string,
            min_size=2,
            max_size=10,
            command_timeout=30,
            # Disable prepared statement cache for PgBouncer transaction/statement pooling
            # to avoid "prepared statement __asyncpg_stmt_X__ already exists" errors
            statement_cache_size=0
        )
        
        # Initialize Brandfetch service
        await self.brandfetch_service.__aenter__()

        # Initialize logo storage service
        await self.logo_storage_service.__aenter__()

        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.db_pool:
            await self.db_pool.close()
        
        if self.brandfetch_service.session:
            await self.brandfetch_service.__aexit__(exc_type, exc_val, exc_tb)

        # Clean up logo storage service
        await self.logo_storage_service.__aexit__(exc_type, exc_val, exc_tb)
    
    def _normalize_identifier(self, identifier: str) -> str:
        """
        Normalize identifier for consistent cache lookups.
        Only save valid domains (.com, .org, .net, etc.) to database.
        Avoid manufacturing fake domains from long brand phrases.
        """
        # Clean basic URL bits, but DO NOT force domain creation for names here
        raw = (identifier or "").strip()
        original_clean = raw.lower().strip()
        original_clean = original_clean.replace('https://', '').replace('http://', '')
        original_clean = original_clean.replace('www.', '')
        if '/' in original_clean:
            original_clean = original_clean.split('/')[0]
        original_clean = original_clean.split('?')[0].split('#')[0]

        # Use the underlying service cleaner but prevent .com auto-append from impacting cache keying
        clean_id = self.brandfetch_service._clean_identifier(original_clean)

        # If the input already looks like a domain, keep it; else mark as brand term
        import re
        looks_like_domain = bool(re.match(r"^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$", original_clean))

        # Only cache if it's a valid domain (contains a dot and common TLD)
        valid_tlds = {
            '.com', '.org', '.net', '.edu', '.gov', '.mil', '.int',
            '.co', '.io', '.ai', '.app', '.dev', '.tech', '.biz',
            '.info', '.me', '.tv', '.cc', '.ly', '.gl', '.sh'
        }

        if looks_like_domain and any(original_clean.endswith(tld) for tld in valid_tlds):
            return original_clean

        # For non-domains, avoid using the service's .com auto-append for cache key
        # Treat short, simple alphabetic tokens as brand terms; long/spacey tokens also as brand terms
        alpha_only = re.sub(r"[^a-z]", "", original_clean)
        if '.' not in original_clean and alpha_only:
            return f"_brand_name_{alpha_only}"

        # Otherwise mark invalid
        return f"_invalid_{clean_id}"
    
    async def get_brand_data(self, identifier: str, force_refresh: bool = False) -> Dict[str, Any]:
        """
        Get brand data - cache first approach.
        
        Args:
            identifier: Domain, brand name, or URL
            force_refresh: Skip cache and force fresh API call
            
        Returns:
            Dict with brand data (same format as BrandfetchService)
        """
        if not self.db_pool:
            raise RuntimeError("Service must be used as async context manager")
        
        normalized_id = self._normalize_identifier(identifier)
        
        # Step 1: Check cache first (unless force refresh or non-cacheable)
        if not force_refresh and not normalized_id.startswith('_brand_name_') and not normalized_id.startswith('_invalid_'):
            cached_result = await self._get_from_cache(normalized_id)
            if cached_result:
                logger.info(f"✓ Cache HIT for {normalized_id}")
                await self._increment_hit_count(normalized_id)

                # Check if logos in cached result are still valid
                if await self._should_refresh_logos(cached_result):
                    logger.info(f"🔄 Refreshing stale logos for {normalized_id}")
                    return await self.get_brand_data(identifier, force_refresh=True)

                return cached_result
            else:
                logger.info(f"✗ Cache MISS for {normalized_id}")
        elif normalized_id.startswith('_brand_name_') or normalized_id.startswith('_invalid_'):
            logger.info(f"⚠️  Skipping cache for non-domain: {identifier}")
        else:
            logger.info(f"🔄 Force refresh for {normalized_id}")
        
        # Step 2: Call Brandfetch API (use search-first resolution for names)
        api_result = await self.brandfetch_service.get_brand_data_with_search(identifier)

        # Step 2.5: Process logos - download and store in our Supabase storage
        if api_result and not api_result.get('error') and api_result.get('logos'):
            try:
                # Extract domain for logo storage organization
                brand_domain = api_result.get('domain', normalized_id)
                if brand_domain.startswith('_'):
                    # For non-domain identifiers, use clean identifier
                    brand_domain = identifier.replace(' ', '_').replace("'", "").lower()

                logger.info(f"📥 Processing logos for {brand_domain}")
                api_result = await self.logo_storage_service.process_brand_logos(api_result, brand_domain)
                logger.info(f"✅ Logos processed for {brand_domain}")
            except Exception as e:
                logger.error(f"Error processing logos for {identifier}: {e}")
                # Continue with original data if logo processing fails

        # Step 3: Store result in cache
        await self._store_in_cache(identifier, normalized_id, api_result)

        return api_result
    
    async def _get_from_cache(self, normalized_identifier: str) -> Optional[Dict[str, Any]]:
        """Get cached brand data from database."""
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow("""
                    SELECT api_response, success, created_at
                    FROM public.brandfetch_cache 
                    WHERE normalized_identifier = $1 
                    ORDER BY created_at DESC
                    LIMIT 1
                """, normalized_identifier)
                
                if row and row['success']:
                    # api_response is stored as JSON string, need to parse it
                    if isinstance(row['api_response'], str):
                        parsed = json.loads(row['api_response'])
                    else:
                        parsed = row['api_response']
                    # Defensive: some legacy rows may contain lists or unexpected shapes
                    if not isinstance(parsed, dict):
                        logger.warning(f"[BrandCache] Unexpected cached response shape for {normalized_identifier}: {type(parsed)}")
                        return {"error": "invalid_cached_response", "raw_type": str(type(parsed))}
                    return parsed
                
                return None
                
        except Exception as e:
            logger.error(f"Error reading from cache: {e}")
            return None
    
    async def _store_in_cache(self, identifier: str, normalized_identifier: str, api_result: Dict[str, Any]) -> None:
        """Store API result in cache (only valid domains)."""
        try:
            # Skip caching if it's not a valid domain
            if normalized_identifier.startswith('_brand_name_') or normalized_identifier.startswith('_invalid_'):
                logger.info(f"⚠️  Skipping cache for non-domain: {identifier}")
                return
                
            success = not api_result.get('error')
            
            async with self.db_pool.acquire() as conn:
                await conn.execute("""
                    INSERT INTO public.brandfetch_cache (
                        identifier, normalized_identifier, api_response, success
                    ) VALUES ($1, $2, $3, $4)
                    ON CONFLICT (normalized_identifier) DO UPDATE SET
                        api_response = EXCLUDED.api_response,
                        success = EXCLUDED.success,
                        created_at = NOW()
                """, 
                    identifier,
                    normalized_identifier,
                    json.dumps(api_result),
                    success
                )
                
                logger.info(f"💾 Cached {normalized_identifier} (success: {success})")
                
        except Exception as e:
            logger.error(f"Error storing in cache: {e}")
    
    async def _increment_hit_count(self, normalized_identifier: str) -> None:
        """Increment hit count for cache entry."""
        try:
            async with self.db_pool.acquire() as conn:
                await conn.execute("SELECT increment_cache_hit($1)", normalized_identifier)
        except Exception as e:
            logger.error(f"Error incrementing hit count: {e}")
    
    # Delegate all utility methods to the underlying BrandfetchService
    def get_best_logo(self, brand_data: Dict[str, Any], prefer_theme: str = "light", prefer_format: str = "svg") -> Optional[str]:
        return self.brandfetch_service.get_best_logo(brand_data, prefer_theme, prefer_format)
    
    def get_primary_colors(self, brand_data: Dict[str, Any], max_colors: int = 8):
        return self.brandfetch_service.get_primary_colors(brand_data, max_colors)
    
    def get_categorized_colors(self, brand_data: Dict[str, Any]):
        return self.brandfetch_service.get_categorized_colors(brand_data)
    
    def get_background_colors(self, brand_data: Dict[str, Any], max_colors: int = 4):
        return self.brandfetch_service.get_background_colors(brand_data, max_colors)
    
    def get_text_colors(self, brand_data: Dict[str, Any], background_color: str = None):
        return self.brandfetch_service.get_text_colors(brand_data, background_color)
    
    def get_accent_colors(self, brand_data: Dict[str, Any], max_colors: int = 3):
        return self.brandfetch_service.get_accent_colors(brand_data, max_colors)
    
    def get_brand_fonts(self, brand_data: Dict[str, Any]):
        return self.brandfetch_service.get_brand_fonts(brand_data)
    
    async def get_cache_stats(self) -> Dict[str, Any]:
        """Get simple cache statistics."""
        try:
            async with self.db_pool.acquire() as conn:
                row = await conn.fetchrow("SELECT * FROM brandfetch_cache_stats")
                if row:
                    return dict(row)
                return {}
        except Exception as e:
            logger.error(f"Error getting cache stats: {e}")
            return {}

    async def _should_refresh_logos(self, brand_data: Dict[str, Any]) -> bool:
        """
        Check if logos in brand data are stale and need refreshing.
        Returns True if any logo URLs return 404.
        """
        if not brand_data or not brand_data.get('logos'):
            return False

        logos_data = brand_data.get('logos', {})

        # Check a few logo URLs for health
        urls_to_check = []
        for category, logo_list in logos_data.items():
            if isinstance(logo_list, list):
                for logo_item in logo_list[:1]:  # Check only first logo per category
                    if isinstance(logo_item, dict) and 'formats' in logo_item:
                        formats = logo_item.get('formats', [])
                        if formats and isinstance(formats, list):
                            first_format = formats[0]
                            if isinstance(first_format, dict) and 'url' in first_format:
                                url = first_format['url']
                                # Only check external URLs (not our Supabase URLs)
                                if url and 'supabase' not in url and 'nextslide.ai' not in url:
                                    urls_to_check.append(url)

        if not urls_to_check:
            return False

        # Check health of a sample of URLs
        for url in urls_to_check[:3]:  # Check max 3 URLs to avoid delays
            is_healthy = await self.logo_storage_service.check_logo_url_health(url)
            if not is_healthy:
                logger.info(f"🚨 Stale logo detected: {url}")
                return True

        return False