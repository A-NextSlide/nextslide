#!/usr/bin/env python3
"""
Logo.dev API integration service for reliable logo extraction.

Logo.dev provides high-quality company logos via API with:
- Multiple lookup methods: domain, company name, ticker, ISIN
- 18M companies, 52M brand assets, 628M domains indexed
- Global CDN delivery with configurable formats and sizes
- Smart fallback to monograms when full logos unavailable
"""

import os
import asyncio
import aiohttp
from typing import Dict, Any, Optional, List
from urllib.parse import urlparse, urljoin
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


class LogoDevService:
    """Logo.dev API integration for high-quality logo extraction."""
    
    def __init__(self):
        self.public_key = os.getenv('LOGODEV_PUBLIC_KEY')
        self.private_key = os.getenv('LOGODEV_PRIVATE_KEY')
        self.base_url = "https://img.logo.dev"
        self.session: Optional[aiohttp.ClientSession] = None
        
        if not self.public_key:
            logger.warning("LOGODEV_PUBLIC_KEY not found in environment")
        if not self.private_key:
            logger.warning("LOGODEV_PRIVATE_KEY not found in environment")
    
    async def __aenter__(self):
        """Async context manager entry."""
        connector = aiohttp.TCPConnector(
            ssl=True,
            limit=20,
            ttl_dns_cache=300,
            use_dns_cache=True
        )
        timeout = aiohttp.ClientTimeout(total=10, connect=5)
        self.session = aiohttp.ClientSession(
            connector=connector,
            timeout=timeout,
            headers={
                'User-Agent': 'SlideBackend/1.0 Logo Extractor'
            }
        )
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self.session:
            await self.session.close()
    
    def _extract_domain_from_url(self, url: str) -> Optional[str]:
        """Extract clean domain from URL."""
        try:
            parsed = urlparse(url)
            domain = parsed.netloc
            # Remove 'www.' prefix
            if domain.startswith('www.'):
                domain = domain[4:]
            return domain
        except Exception:
            return None
    
    def _build_logo_url(self, identifier: str, **params) -> str:
        """Build logo.dev API URL with parameters."""
        # Use private key if available, fallback to public key
        token = self.private_key or self.public_key
        
        # Build URL with identifier
        url = f"{self.base_url}/{identifier}"
        
        # Add default parameters
        query_params = {
            'token': token,
            'size': params.get('size', 200),
            'format': params.get('format', 'png'),
            'retina': 'true' if params.get('retina', True) else 'false'
        }
        
        # Add fallback parameter if specified
        if params.get('fallback'):
            query_params['fallback'] = params['fallback']
        
        # Build query string
        query_string = '&'.join(f"{k}={v}" for k, v in query_params.items() if v is not None)
        return f"{url}?{query_string}"
    
    async def get_logo_by_domain(self, domain: str, **params) -> Optional[Dict[str, Any]]:
        """Get logo by company domain."""
        try:
            # Clean domain (remove protocol, www, etc.)
            clean_domain = domain
            if '://' in domain:
                clean_domain = self._extract_domain_from_url(domain)
                if not clean_domain:
                    clean_domain = domain
            
            # Remove www. if present
            if clean_domain.startswith('www.'):
                clean_domain = clean_domain[4:]
            
            logo_url = self._build_logo_url(clean_domain, **params)
            
            # Test if logo is available by making a HEAD request
            async with self.session.head(logo_url) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '')
                    content_length = response.headers.get('content-length', '0')
                    
                    return {
                        'logo_url': logo_url,
                        'domain': clean_domain,
                        'method': 'domain_lookup',
                        'available': True,
                        'content_type': content_type,
                        'size_bytes': int(content_length) if content_length.isdigit() else None,
                        'format': params.get('format', 'png'),
                        'dimensions': params.get('size', 200)
                    }
                else:
                    logger.debug(f"Logo not available for domain {clean_domain}: HTTP {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting logo for domain {domain}: {e}")
            return None
    
    async def get_logo_by_company_name(self, company_name: str, **params) -> Optional[Dict[str, Any]]:
        """Get logo by company name."""
        try:
            # Logo.dev supports company name lookup directly
            clean_name = company_name.strip().lower().replace(' ', '')
            logo_url = self._build_logo_url(clean_name, **params)
            
            # Test availability
            async with self.session.head(logo_url) as response:
                if response.status == 200:
                    content_type = response.headers.get('content-type', '')
                    content_length = response.headers.get('content-length', '0')
                    
                    return {
                        'logo_url': logo_url,
                        'company_name': company_name,
                        'identifier': clean_name,
                        'method': 'company_name_lookup',
                        'available': True,
                        'content_type': content_type,
                        'size_bytes': int(content_length) if content_length.isdigit() else None,
                        'format': params.get('format', 'png'),
                        'dimensions': params.get('size', 200)
                    }
                else:
                    logger.debug(f"Logo not available for company {company_name}: HTTP {response.status}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error getting logo for company {company_name}: {e}")
            return None
    
    async def search_logo(self, query: str, url: Optional[str] = None, **params) -> Optional[Dict[str, Any]]:
        """Smart logo search - tries domain first if URL provided, then company name."""
        results = []
        
        # Strategy 1: If URL provided, try domain extraction
        if url and url.startswith('http'):
            domain = self._extract_domain_from_url(url)
            if domain:
                logger.debug(f"Trying logo lookup by domain: {domain}")
                result = await self.get_logo_by_domain(domain, **params)
                if result:
                    logger.info(f"Found logo via domain lookup: {domain}")
                    return result
        
        # Strategy 2: Try the query as a direct domain
        if '.' in query and not ' ' in query:
            logger.debug(f"Trying logo lookup by domain: {query}")
            result = await self.get_logo_by_domain(query, **params)
            if result:
                logger.info(f"Found logo via domain lookup: {query}")
                return result
        
        # Strategy 3: Try company name lookup
        logger.debug(f"Trying logo lookup by company name: {query}")
        result = await self.get_logo_by_company_name(query, **params)
        if result:
            logger.info(f"Found logo via company name lookup: {query}")
            return result
        
        # Strategy 4: Try common domain patterns
        if ' ' in query or len(query.split()) > 1:
            # Try common domain patterns for multi-word companies
            company_variants = [
                query.lower().replace(' ', ''),
                query.lower().replace(' ', '-'),
                query.lower().replace(' ', '_'),
                query.split()[0].lower(),  # First word only
            ]
            
            for variant in company_variants:
                for tld in ['.com', '.org', '.net']:
                    domain_candidate = f"{variant}{tld}"
                    logger.debug(f"Trying logo lookup by domain variant: {domain_candidate}")
                    result = await self.get_logo_by_domain(domain_candidate, **params)
                    if result:
                        logger.info(f"Found logo via domain variant: {domain_candidate}")
                        return result
        
        logger.warning(f"No logo found for query: {query}")
        return None
    
    async def get_logo_with_fallback(self, query: str, url: Optional[str] = None, **params) -> Dict[str, Any]:
        """Get logo with comprehensive fallback strategy."""
        
        # Try high-quality logo first
        params_hq = {**params, 'fallback': None, 'size': params.get('size', 200)}
        result = await self.search_logo(query, url, **params_hq)
        
        if result:
            return {
                **result,
                'fallback_used': False,
                'quality': 'high'
            }
        
        # Try with monogram fallback
        logger.info(f"No high-quality logo found for {query}, trying monogram fallback")
        params_fallback = {**params, 'fallback': 'monogram', 'size': params.get('size', 200)}
        result = await self.search_logo(query, url, **params_fallback)
        
        if result:
            return {
                **result,
                'fallback_used': True,
                'quality': 'monogram'
            }
        
        # Return failure info
        return {
            'available': False,
            'query': query,
            'url': url,
            'method': 'search_failed',
            'fallback_used': True,
            'quality': 'none',
            'error': 'No logo or monogram available'
        }
    
    async def get_brand_logo_variations(self, query: str, url: Optional[str] = None) -> Dict[str, Any]:
        """Get multiple logo variations for comprehensive brand assets."""
        
        variations = {}
        
        # Standard logo variations that Logo.dev supports
        logo_configs = [
            {'name': 'logo_standard', 'size': 200, 'format': 'png'},
            {'name': 'logo_large', 'size': 400, 'format': 'png'}, 
            {'name': 'logo_retina', 'size': 300, 'format': 'png', 'retina': True},
            {'name': 'logo_svg', 'size': 200, 'format': 'svg'},  # If supported
            {'name': 'monogram_standard', 'size': 200, 'format': 'png', 'fallback': 'monogram'},
            {'name': 'monogram_large', 'size': 400, 'format': 'png', 'fallback': 'monogram'}
        ]
        
        for config in logo_configs:
            try:
                name = config.pop('name')
                result = await self.search_logo(query, url, **config)
                
                if result and result.get('available'):
                    variations[name] = result
                    logger.debug(f"Found {name} for {query}")
                
            except Exception as e:
                logger.debug(f"Failed to get {config.get('name', 'variation')} for {query}: {e}")
                continue
        
        return {
            'query': query,
            'url': url,
            'variations_found': len(variations),
            'variations': variations,
            'has_standard_logo': 'logo_standard' in variations,
            'has_monogram': 'monogram_standard' in variations,
            'has_high_res': 'logo_large' in variations or 'logo_retina' in variations,
            'available_formats': list(set(v.get('format') for v in variations.values() if v.get('format')))
        }


# Helper function for easy integration
async def get_company_logo(company_name: str, url: Optional[str] = None, **params) -> Optional[Dict[str, Any]]:
    """Convenience function to get company logo."""
    async with LogoDevService() as service:
        return await service.get_logo_with_fallback(company_name, url, **params)


# Test function
async def test_logodev_service():
    """Test the LogoDev service with various companies."""
    test_cases = [
        {"name": "Apple", "url": "https://apple.com"},
        {"name": "Google", "url": "https://google.com"},
        {"name": "Microsoft", "url": "https://microsoft.com"},
        {"name": "Kroger", "url": "https://kroger.com"},
        {"name": "Netflix", "url": "https://netflix.com"},
        {"name": "GitHub", "url": "https://github.com"},
        {"name": "Nonexistent Company", "url": None},  # Test failure case
    ]
    
    async with LogoDevService() as service:
        for case in test_cases:
            print(f"\n🔍 Testing: {case['name']}")
            result = await service.get_logo_with_fallback(case['name'], case['url'])
            
            if result.get('available'):
                print(f"   ✅ Found logo: {result['logo_url']}")
                print(f"   📊 Method: {result['method']}")
                print(f"   🎨 Quality: {result['quality']}")
                print(f"   📐 Format: {result.get('format')} ({result.get('dimensions')}px)")
            else:
                print(f"   ❌ No logo found: {result.get('error', 'Unknown error')}")


if __name__ == "__main__":
    asyncio.run(test_logodev_service())