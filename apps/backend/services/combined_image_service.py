from typing import List, Dict, Any, Optional, Tuple, Union
from dataclasses import dataclass, field
from collections import defaultdict, Counter
from datetime import datetime, timedelta
import aiohttp
import asyncio
import time
import os
import random
import re
from pathlib import Path
import hashlib
import json

import logging

from services.serpapi_service import SerpAPIService
from services.perplexity_image_service import PerplexityImageService
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from agents.config import IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_SUPPORTING, IMAGE_SEARCH_PROVIDER
from services.unsplash_service import UnsplashService  # Keep for future use
from services.image_storage_service import ImageStorageService
from services.image_validator import ImageValidator
from utils.token_bucket import TokenBucket

logger = logging.getLogger(__name__)

class CombinedImageService:
    """Service that intelligently combines SerpAPI (Google Images) and limited OpenAI image generation."""
    
    # Add a stop words set as class attribute
    STOP_WORDS = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'is', 'are', 'was', 'were', 'from', 'as', 'it',
        'this', 'that', 'these', 'those', 'be', 'been', 'being', 'have', 'has',
        'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may',
        'might', 'must', 'shall', 'can', 'into', 'through', 'during', 'before',
        'after', 'above', 'below', 'between', 'under', 'over'
    }
    
    # Add vague terms to filter out
    VAGUE_TERMS = {
        'image', 'picture', 'photo', 'illustration', 'graphic', 'visual',
        'slide', 'presentation', 'content', 'text', 'information', 'data',
        'background', 'design', 'layout', 'template', 'placeholder',
        # Extra generic terms that often pollute queries
        'super', 'colored', 'comparison', 'original', 'characters', 'stats', 'bros'
    }
    
    def __init__(self):
        """Initialize the combined image service."""
        # Initialize providers
        self.serpapi = SerpAPIService()
        self.perplexity = PerplexityImageService()
        # Provider switch for AI generation
        self.ai_generator = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        # self.unsplash = UnsplashService()  # Disabled for now
        self.storage = ImageStorageService()
        self.validator = ImageValidator()
        
        # Track AI usage per deck
        self._ai_usage_per_deck: Dict[str, int] = {}
        self.max_ai_per_deck = 3  # Limit AI generations per deck
        
        # Track image uniqueness per deck
        self._used_images_per_deck: Dict[str, set] = {}
        
        # Rate limiting for API calls (10 calls per second)
        self.rate_limiter = TokenBucket(tokens=10, time_unit=1)
        
        # Cache for search results (in-memory cache with TTL)
        self._search_cache: Dict[str, Tuple[List[Dict], float]] = {}
        self._cache_ttl = 3600  # 1 hour TTL
        
        # Connection pool for better performance
        self._connector = None
        self._session = None
    
    async def __aenter__(self):
        """Async context manager entry."""
        self._connector = aiohttp.TCPConnector(limit=100, limit_per_host=30)
        self._session = aiohttp.ClientSession(connector=self._connector)
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        if self._session:
            await self._session.close()
        if self._connector:
            await self._connector.close()
        # Ensure provider sessions are closed
        try:
            if hasattr(self, 'serpapi') and hasattr(self.serpapi, '__aexit__'):
                await self.serpapi.__aexit__(None, None, None)
        except Exception:
            pass
    
    def __del__(self):
        """Cleanup resources when object is garbage collected"""
        try:
            # Close the session if it exists and is not closed
            if self._session and not self._session.closed:
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._session.close())
                    else:
                        loop.run_until_complete(self._session.close())
                except Exception:
                    pass
            
            # Close the connector if it exists
            if self._connector and not self._connector.closed:
                try:
                    loop = asyncio.get_event_loop()
                    if loop.is_running():
                        asyncio.create_task(self._connector.close())
                    else:
                        loop.run_until_complete(self._connector.close())
                except Exception:
                    pass
            
            # Ensure SerpAPI service is cleaned up
            if hasattr(self, 'serpapi') and hasattr(self.serpapi, '__del__'):
                self.serpapi.__del__()
        except Exception:
            pass  # Silently fail in destructor
    
    def _get_cache_key(self, query: str, **kwargs) -> str:
        """Generate cache key for search query."""
        # Create a deterministic key from query and parameters
        key_data = {'query': query, **kwargs}
        key_str = json.dumps(key_data, sort_keys=True)
        return hashlib.md5(key_str.encode()).hexdigest()
    
    async def _get_cached_results(self, cache_key: str) -> Optional[List[Dict]]:
        """Get cached search results if still valid."""
        if cache_key in self._search_cache:
            results, timestamp = self._search_cache[cache_key]
            if time.time() - timestamp < self._cache_ttl:
                logger.debug(f"Cache hit for key: {cache_key}")
                return results
            else:
                # Expired, remove from cache
                del self._search_cache[cache_key]
        return None
    
    def _set_cached_results(self, cache_key: str, results: List[Dict]):
        """Store results in cache."""
        self._search_cache[cache_key] = (results, time.time())
        
        # Clean up old cache entries if cache is getting large
        if len(self._search_cache) > 1000:
            current_time = time.time()
            expired_keys = [
                k for k, (_, ts) in self._search_cache.items()
                if current_time - ts > self._cache_ttl
            ]
            for k in expired_keys:
                del self._search_cache[k]
    
    async def cleanup(self):
        """Properly clean up resources. Call this when done with the service."""
        # Clean up storage service session
        if hasattr(self, 'storage') and hasattr(self.storage, 'cleanup'):
            await self.storage.cleanup()
    
    def reset_deck_ai_count(self, deck_id: str):
        """Reset AI generation count for a new deck."""
        self._ai_usage_per_deck[deck_id] = 0
        # Also reset used images tracking
        self._used_images_per_deck[deck_id] = set()
    
    def get_ai_count(self, deck_id: str) -> int:
        """Get current AI generation count for a deck."""
        return self._ai_usage_per_deck.get(deck_id, 0)
    
    async def _select_diverse_images(self, images: List[Dict[str, Any]], num_images: int, deck_id: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        Select diverse images from search results, avoiding duplicates across the deck.
        
        Args:
            images: List of image search results
            num_images: Number of images to select
            deck_id: Optional deck ID for tracking used images
            
        Returns:
            Selected diverse images (NEVER reuses images)
        """
        if not images:
            return []
            
        # Get set of already used images for this deck
        used_urls = self._used_images_per_deck.get(deck_id, set()) if deck_id else set()
        
        # Filter out already used images - STRICT MODE: never reuse
        available_images = []
        for img in images:
            img_url = img.get('url', img.get('original', ''))
            if img_url and img_url not in used_urls:
                available_images.append(img)
        
        # Log if we're running low on unique images
        if len(available_images) < num_images:
            logger.warning(
                f"Only {len(available_images)} unique images available (requested {num_images}). "
                f"Better to have fewer unique images than reusing the same ones."
            )
        
        # Select from available images only (no reuse fallback)
        if len(available_images) <= num_images:
            selected = available_images
        else:
            # Strategy: Mix top results with some variety from the rest
            selected = []
            total = len(available_images)
            
            # Include top results (most relevant) - but not too many
            top_count = min(num_images // 2, 3)
            selected.extend(available_images[:top_count])
            
            # Add variety from middle section
            if total > 10 and len(selected) < num_images:
                middle_start = total // 3
                middle_end = 2 * total // 3
                middle_images = available_images[middle_start:middle_end]
                if middle_images:
                    middle_count = min(len(middle_images), (num_images - len(selected)) // 2)
                    selected.extend(random.sample(middle_images, middle_count))
            
            # Fill remaining slots with random selections
            remaining_needed = num_images - len(selected)
            if remaining_needed > 0:
                unused_images = [img for img in available_images if img not in selected]
                if unused_images:
                    additional = min(len(unused_images), remaining_needed)
                    selected.extend(random.sample(unused_images, additional))
            
            # Shuffle to mix relevance levels
            random.shuffle(selected)
            selected = selected[:num_images]
        
        # Track used images for this deck
        if deck_id:
            for img in selected:
                img_url = img.get('url', img.get('original', ''))
                if img_url:
                    self._used_images_per_deck.setdefault(deck_id, set()).add(img_url)
            
            logger.info(
                f"Selected {len(selected)} diverse images. "
                f"Total unique images used in deck: {len(self._used_images_per_deck.get(deck_id, set()))}"
            )
        
        return selected
    
    async def _upload_images_to_supabase(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """
        Upload images to Supabase storage to avoid CORS issues.
        
        Args:
            images: List of image dictionaries
            
        Returns:
            Updated image list with Supabase URLs
        """
        updated_images = []
        
        for img in images:
            try:
                # Handle AI-generated images with base64 data
                if img.get('ai_generated') and img.get('b64_json'):
                    result = await self.storage.upload_image_from_base64(
                        base64_data=img['b64_json'],
                        filename=f"ai-generated-{img.get('id', 'image')}.png",
                        content_type="image/png"
                    )
                    # Update the image URL
                    img['url'] = result['url']
                    img['supabase_path'] = result.get('path')
                    # Remove base64 data to save space
                    img.pop('b64_json', None)
                    
                # Handle regular image URLs
                elif img.get('url') and img['url'].startswith('http'):
                    # Skip if already a Supabase URL
                    if 'supabase' not in img['url']:
                        result = await self.storage.upload_image_from_url(
                            image_url=img['url'],
                            metadata={
                                'photographer': img.get('photographer'),
                                'alt': img.get('alt'),
                                'source': 'serpapi'
                            }
                        )
                        if 'error' not in result:
                            img['original_url'] = img['url']
                            img['url'] = result['url']
                            img['supabase_path'] = result.get('path')
                        else:
                            # If upload failed, skip this image
                            logger.warning(f"Failed to upload image, skipping: {img['url']}")
                            continue
                
                updated_images.append(img)
                
            except Exception as e:
                logger.error(f"Error uploading image to Supabase: {str(e)}")
                # Skip failed images instead of keeping them
                continue
                
        return updated_images
    
    async def _upload_single_image(self, img: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Upload a single image to Supabase storage.
        
        Args:
            img: Image dictionary
            
        Returns:
            Updated image dict with Supabase URL or None if failed
        """
        try:
            # Handle AI-generated images with base64 data
            if img.get('ai_generated') and img.get('b64_json'):
                result = await self.storage.upload_image_from_base64(
                    base64_data=img['b64_json'],
                    filename=f"ai-generated-{img.get('id', 'image')}.png",
                    content_type="image/png"
                )
                # Update the image URL
                img['url'] = result['url']
                img['supabase_path'] = result.get('path')
                # Remove base64 data to save space
                img.pop('b64_json', None)
                return img
                
            # Handle regular image URLs
            elif img.get('url') and img['url'].startswith('http'):
                # Skip if already a Supabase URL
                if 'supabase' in img['url']:
                    return img
                    
                result = await self.storage.upload_image_from_url(
                    image_url=img['url'],
                    metadata={
                        'photographer': img.get('photographer'),
                        'alt': img.get('alt'),
                        'source': 'serpapi'
                    }
                )
                if 'error' not in result:
                    img['original_url'] = img['url']
                    img['url'] = result['url']
                    img['supabase_path'] = result.get('path')
                    return img
                else:
                    logger.warning(f"Failed to upload image: {result.get('error')}")
                    return None
                    
        except Exception as e:
            logger.error(f"Error uploading image to Supabase: {str(e)}")
            return None
            
        return None
    
    async def search_images_for_slide(
        self,
        slide_content: str,
        slide_title: str,
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 6,
        deck_id: Optional[str] = None
    ) -> List[Dict[str, Any]]:
        """Search for images using the most appropriate service."""
        
        # Choose provider for web images
        web_results = []
        provider = (IMAGE_SEARCH_PROVIDER or 'serpapi').lower()
        if provider == 'perplexity' and getattr(self.perplexity, 'is_available', False):
            logger.info(f"Using Perplexity for slide images: {slide_title}")
            web_results = await self.perplexity.search_images_for_slide(
                slide_content=slide_content,
                slide_title=slide_title,
                slide_type=slide_type,
                style_preferences=style_preferences,
                num_images=num_images * 2
            )
        elif getattr(self.serpapi, 'is_available', False):
            logger.info(f"Using Google Images (SerpAPI) for slide: {slide_title}")
            web_results = await self.serpapi.search_images_for_slide(
                slide_content=slide_content,
                slide_title=slide_title,
                slide_type=slide_type,
                style_preferences=style_preferences,
                num_images=num_images * 2
            )
        
        if web_results:
            selected_images = await self._select_diverse_images(web_results, num_images, deck_id)
            if selected_images:
                return selected_images
        
        logger.debug("Web image provider returned no results, will check if AI generation is appropriate...")
        
        # Only use AI generation as a fallback or for specific needs
        if (self.ai_generator.is_available and 
            deck_id and 
            self.get_ai_count(deck_id) < self.max_ai_images_per_deck and
            self.ai_generator.should_use_ai_generation(slide_title, slide_content)):
            
            # Extract the specific subject needing AI generation
            subject = self._extract_ai_subject(slide_title, slide_content)
            
            if subject:
                # Only use AI if we really need it (no Google results or very specific technical diagrams)
                if not google_results or self._needs_technical_diagram(slide_title, slide_content):
                    result = await self.ai_generator.generate_supporting_image(
                        subject=subject,
                        context=slide_content[:200] if slide_content else slide_title,
                        style_preferences=style_preferences,
                        transparent_background=IMAGE_TRANSPARENT_DEFAULT_SUPPORTING
                    )
                    
                    if "error" not in result:
                        self._ai_usage_per_deck[deck_id] = self.get_ai_count(deck_id) + 1
                        logger.info(f"Using AI generation ({self.get_ai_count(deck_id)}/{self.max_ai_per_deck}) for: {subject}")
                        
                        # Format the OpenAI result
                        # Attribution and model identification per provider
                        model_used = 'gemini-2.5-flash-image-preview' if IMAGE_PROVIDER == 'gemini' else 'gpt-image-1'
                        attribution_url = 'https://ai.google.dev' if IMAGE_PROVIDER == 'gemini' else 'https://openai.com'

                        ai_result = {
                            'id': f'{IMAGE_PROVIDER}-generated-{self.get_ai_count(deck_id)}',
                            'photographer': 'AI Generated',
                            'photographer_url': attribution_url,
                            'page_url': '[AI Generated Image]',
                            'url': '[AI Generated Image]',  # Will be replaced after upload
                            'alt': f'AI generated {subject}',
                            'ai_generated': True,
                            'transparent_background': IMAGE_TRANSPARENT_DEFAULT_SUPPORTING,
                            'model_used': model_used,
                            'revised_prompt': result.get('revised_prompt'),
                            'b64_json': result.get('b64_json'),
                            'usage': result.get('usage')
                        }
                        
                        # AI images still need to be uploaded since they're base64
                        uploaded_ai = await self._upload_single_image(ai_result)
                        
                        if uploaded_ai:
                            return [uploaded_ai]
            
        # Last resort: no images available
        logger.warning(f"No images available for slide: {slide_title}")
        return []
    
    def _needs_technical_diagram(self, title: str, content: str) -> bool:
        """Check if the content specifically needs a technical diagram that can't be found in stock photos."""
        text = (title + " " + content).lower()
        
        technical_keywords = [
            'neural network architecture',
            'blockchain diagram',
            'quantum computing visualization',
            'system architecture',
            'flowchart',
            'technical diagram',
            'circuit diagram',
            'algorithm visualization'
        ]
        
        return any(keyword in text for keyword in technical_keywords)
    
    async def search_images_for_deck(
        self,
        deck_outline: Any,
        palette: Optional[Dict[str, Any]] = None,
        max_images_per_slide: int = 6
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Search images for all slides in a deck outline."""
        deck_id = deck_outline.id
        self.reset_deck_ai_count(deck_id)
        
        images_by_slide: Dict[str, List[Dict[str, Any]]] = {}
        
        # Collect all slides that need images
        slides_needing_images = []
        for i, slide in enumerate(deck_outline.slides):
            if self._slide_needs_images(slide, i):
                slides_needing_images.append((i, slide))
        
        # Create tasks for parallel image search
        search_tasks = []
        for i, slide in slides_needing_images:
            task = self.search_images_for_slide(
                slide_content=slide.content or "",
                slide_title=slide.title or f"Slide {i+1}",
                slide_type=self._determine_slide_type(slide, i),
                style_preferences=deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None,
                num_images=max_images_per_slide,
                deck_id=deck_id
            )
            search_tasks.append((slide.id, task))
        
        # Execute all searches in parallel
        if search_tasks:
            logger.info(f"Searching images for {len(search_tasks)} slides in parallel...")
            results = await asyncio.gather(*[task for _, task in search_tasks], return_exceptions=True)
            
            # Map results back to slide IDs
            for (slide_id, _), result in zip(search_tasks, results):
                if isinstance(result, Exception):
                    logger.error(f"Error searching images for slide {slide_id}: {result}")
                    images_by_slide[slide_id] = []
                else:
                    images_by_slide[slide_id] = result
        
        logger.info(f"Deck {deck_id} used {self.get_ai_count(deck_id)} AI-generated images")
        return images_by_slide
    
    async def search_images_for_deck_streaming(
        self,
        deck_outline: Any,
        palette: Optional[Dict[str, Any]] = None,
        max_images_per_slide: int = 6,
        search_strategies: Optional[Dict[str, Dict[str, Any]]] = None,
        search_queries: Optional[Dict[str, str]] = None
    ):
        """
        Search images for all slides in a deck and stream progress updates.
        
        Args:
            deck_outline: The deck outline containing slides
            palette: Optional color palette to influence search
            max_images_per_slide: Maximum images to return per slide
            search_strategies: Optional pre-computed search strategies
            search_queries: Optional pre-generated search queries by slide index
            
        Yields:
            Dict updates about search progress
        """
        deck_id = deck_outline.id
        self.reset_deck_ai_count(deck_id)
        
        # Extract all topics first
        topics_to_search = {}  # topic -> list of slide IDs that need it
        slide_topics = {}  # slide_id -> list of topics
        
        for i, slide in enumerate(deck_outline.slides):
            if self._slide_needs_images(slide, i):
                # Use pre-generated query if available
                if search_queries and str(i) in search_queries:
                    query = search_queries[str(i)]
                    # Handle both string and array formats
                    if isinstance(query, list):
                        # Filter out empty, short, AND vague queries
                        topics = [q for q in query if q and len(q.strip()) > 2 and q.lower().strip() not in self.VAGUE_TERMS]
                    elif isinstance(query, str) and len(query.strip()) > 2:
                        # Split string into words and filter vague terms
                        raw_topics = query.split()
                        topics = [t for t in raw_topics if t.lower().strip() not in self.VAGUE_TERMS]
                    else:
                        # Fall back to extraction if query is too vague
                        topics = self._extract_topics_from_slide(slide, i, deck_outline)
                else:
                    topics = self._extract_topics_from_slide(slide, i, deck_outline)
                
                # Filter out vague terms before storing
                topics = [t for t in topics if t.lower().strip() not in self.VAGUE_TERMS]
                
                if not topics:
                    logger.warning(f"No valid image search topics found for slide {i+1}: '{slide.title}'")
                    continue
                
                slide_topics[slide.id] = topics
                
                # Map topics to slides
                for topic in topics:
                    if topic not in topics_to_search:
                        topics_to_search[topic] = []
                    topics_to_search[topic].append(slide.id)
        
        # Step 2: Search for all topics in parallel
        search_tasks = []
        task_to_topic = {}  # Map tasks to their topics for easy lookup
        
        for topic, slide_ids in topics_to_search.items():
            # Create a task for each topic search
            task = asyncio.create_task(
                self._search_images_for_topic(
                    topic=topic,
                    deck_id=deck_id,
                    style_preferences=deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None,
                    num_images=12  # Get more images since they'll be distributed
                )
            )
            search_tasks.append((topic, slide_ids, task))
            task_to_topic[task] = (topic, slide_ids)  # Store mapping
        
        # Step 3: Gather results as they complete
        topic_images = {}
        topics_processed = 0
        total_topics = len(topics_to_search)
        
        # Process completed searches as they finish - USE asyncio.as_completed!
        for completed in asyncio.as_completed([task for _, _, task in search_tasks]):
            try:
                # Wait for the next completed task
                images = await completed
                
                # Get topic info from our mapping
                topic, slide_ids = task_to_topic.get(completed, (None, None))
                
                if topic:
                    topic_images[topic] = images
                    topics_processed += 1
                    
                    # Stream progress for this topic search
                    yield {
                        "type": "topic_images_found",
                        "message": f"Found {len(images)} images for topic: {topic}",
                        "progress": 18 + int((topics_processed / total_topics) * 2),
                        "data": {
                            "topic": topic,
                            "images_count": len(images),
                            "slides_using_topic": slide_ids
                        }
                    }
            except Exception as e:
                logger.error(f"Error in image search task: {e}")
        
        # Step 4: Distribute images to slides
        images_by_slide = {}
        
        for slide_id, topics in slide_topics.items():
            slide_images = []
            images_used = set()  # Track images already used to avoid duplicates within a slide
            
            # Collect images from all topics for this slide
            for topic in topics:
                if topic in topic_images:
                    # Take images for this topic, avoiding duplicates
                    for img in topic_images[topic]:
                        img_id = img.get('id') or img.get('url')
                        if img_id not in images_used and len(slide_images) < max_images_per_slide:
                            slide_images.append(img)
                            images_used.add(img_id)
            
            images_by_slide[slide_id] = slide_images
            
            # Find slide info
            slide_info = next((s for s in deck_outline.slides if s.id == slide_id), None)
            slide_index = next((i for i, s in enumerate(deck_outline.slides) if s.id == slide_id), 0)
            
            # Stream update for this slide
            yield {
                "type": "slide_images_found",
                "message": f"Assigned {len(slide_images)} images to slide",
                "progress": 20,
                "data": {
                    "slide_id": slide_id,
                    "slide_title": slide_info.title if slide_info else "Unknown",
                    "slide_index": slide_index,
                    "images": self._format_images_for_streaming(slide_images),
                    "images_count": len(slide_images),
                    "topics_used": topics
                }
            }
        
        # Final completion event
        logger.info(f"Deck {deck_id} used {self.get_ai_count(deck_id)} AI-generated images")
        yield {
            "type": "images_collection_complete",
            "message": f"Images collection complete - searched {len(topics_to_search)} unique topics",
            "progress": 20,
            "data": {
                "total_topics_searched": len(topics_to_search),
                "total_slides_processed": len(slide_topics),
                "ai_images_used": self.get_ai_count(deck_id)
            }
        }
    
    def _extract_ai_subject(self, title: str, content: str) -> Optional[str]:
        """Extract the specific subject that needs AI generation."""
        text = (title + " " + content).lower()
        
        # Map of keywords to subject extractions
        ai_subjects = {
            'pikachu': 'Pikachu, the yellow electric Pokemon',
            'mario': 'Mario from Nintendo, the plumber character',
            'luigi': 'Luigi from Nintendo, Mario\'s brother',
            'zelda': 'characters from The Legend of Zelda',
            'sonic': 'Sonic the Hedgehog',
            'pokemon': 'Pokemon creatures',
            'neural network': 'neural network architecture diagram',
            'blockchain': 'blockchain technology visualization',
            'quantum computing': 'quantum computing concept',
            'metaverse': 'metaverse virtual world concept'
        }
        
        for keyword, subject in ai_subjects.items():
            if keyword in text:
                return subject
        
        return None
    
    def _extract_main_subject(self, title: str, content: str) -> str:
        """Extract the main subject for search queries - SIMPLE 1-2 words only."""
        # Combine STOP_WORDS and VAGUE_TERMS for comprehensive filtering
        all_stop_words = self.STOP_WORDS.union(self.VAGUE_TERMS)

        def get_important_words(input_text: str) -> list[str]:
            words = input_text.split()
            important = []
            for w in words:
                # remove possessive 's
                if w.lower().endswith("'s"):
                    w = w[:-2]
                # strip punctuation
                w = w.strip('.,:;!?"()[]')
                if len(w) > 2 and w.lower() not in all_stop_words:
                    important.append(w)
            return important

        # Try title first
        important_words = get_important_words(title)
        
        # If title gives nothing, try content
        if not important_words:
            important_words = get_important_words(content)

        if not important_words:
            return ""
            
        # Prioritize single-word subjects if they seem important (e.g., Proper Nouns)
        if len(important_words) > 1 and important_words[0][0].isupper():
             return important_words[0]

        # Return up to 2 most important words
        return " ".join(important_words[:2])
    
    def _extract_topics_from_deck_outline(self, deck_outline: Any) -> List[str]:
        """Extract search topics from deck title and style preferences."""
        topics: List[str] = []
        
        try:
            # Extract from title using proper-noun phrase detection (e.g., "Super Smash Bros")
            if hasattr(deck_outline, 'title') and deck_outline.title:
                title = deck_outline.title.strip()
                # Strip punctuation that splits phrases
                clean = re.sub(r"[\.,!?:;]", "", title)
                tokens = clean.split()
                phrase_tokens: List[str] = []
                phrases: List[str] = []
                allowed_connectors = {"of", "and", "the"}
                for tok in tokens:
                    if tok and (tok[0].isupper() or tok.lower() in allowed_connectors):
                        # Continue phrase; keep connectors only if phrase already started
                        if tok.lower() in allowed_connectors and not phrase_tokens:
                            continue
                        phrase_tokens.append(tok)
                    else:
                        if phrase_tokens:
                            phrase = " ".join(phrase_tokens)
                            phrases.append(phrase)
                            phrase_tokens = []
                if phrase_tokens:
                    phrases.append(" ".join(phrase_tokens))

                # Normalize phrases and filter vagueness
                for ph in phrases:
                    ph_norm = ph.strip()
                    ph_norm_l = ph_norm.lower()
                    if len(ph_norm_l) < 4:
                        continue
                    if any(w in self.VAGUE_TERMS for w in ph_norm_l.split()):
                        # If entire phrase is a single vague token, skip; otherwise keep the phrase
                        if len(ph_norm_l.split()) == 1:
                            continue
                    # Special-case trim trailing generic terms like 'Characters', 'Stats'
                    ph_norm_l = re.sub(r"\b(characters?|stats?|comparison|original|colored)\b$", "", ph_norm_l).strip()
                    if ph_norm_l and ph_norm_l not in topics:
                        topics.append(ph_norm_l)

                # Fallback: also try text-based extraction to capture compound lower-case phrases
                extra = self._extract_topics_from_text(title)
                for t in extra:
                    if t not in topics and t not in self.VAGUE_TERMS:
                        topics.append(t)
            
            # Extract from vibe context (broad modifiers only)
            if hasattr(deck_outline, 'stylePreferences'):
                style_prefs = deck_outline.stylePreferences
                if hasattr(style_prefs, 'vibeContext') and style_prefs.vibeContext:
                    vibe_words = [w.strip().lower() for w in re.findall(r"[A-Za-z][A-Za-z\-']+", style_prefs.vibeContext)]
                    stop_words = {'with','from','about','this','that','your','have','been','will','does','what','where','when','which','and','the','for','presentation'}
                    for w in vibe_words:
                        if len(w) > 4 and w not in stop_words and w not in self.VAGUE_TERMS and w not in topics:
                            topics.append(w)
                            if len(topics) >= 5:
                                break
            
            # De-duplicate and limit
            seen = set()
            unique_topics: List[str] = []
            for t in topics:
                if t not in seen:
                    seen.add(t)
                    unique_topics.append(t)
            logger.info(f"Extracted {len(unique_topics)} topics from deck outline: {unique_topics}")
            return unique_topics[:5]
        except Exception as e:
            logger.error(f"Error extracting topics from deck outline: {e}")
            return []
    
    def _slide_needs_images(self, slide: Any, index: int) -> bool:
        """Determines if a slide would benefit from images."""
        title_lower = (slide.title or "").lower()
        content_lower = (slide.content or "").lower()
        
        # Title and closing slides always benefit from images
        if index == 0 or 'thank' in title_lower or 'question' in title_lower or 'conclusion' in title_lower:
            return True
        
        # Section headers benefit from images
        if len(slide.content or "") < 50 and 'title' in title_lower:
            return True
        
        # Content-heavy slides benefit from supporting visuals
        if len(slide.content or "") > 200:
            return True
        
        # Slides with special content that would benefit from AI generation
        if self.ai_generator.should_use_ai_generation(slide.title or "", slide.content or ""):
            return True
        
        # Data slides typically don't need additional images
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return False
        
        # Default to including images for better visual appeal
        return True
    
    def _determine_slide_type(self, slide: Any, index: int) -> str:
        """Determines the type of slide for image generation context."""
        title_lower = (slide.title or "").lower()
        
        if index == 0 or 'title' in title_lower or 'welcome' in title_lower or 'introduction' in title_lower:
            return 'title'
        
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return 'data'
        
        if any(term in title_lower for term in ['thank', 'question', 'q&a', 'contact', 'conclusion']):
            return 'closing'
        
        if any(term in title_lower for term in ['agenda', 'outline', 'contents', 'summary']):
            return 'summary'
        
        return 'content'
    
    async def search_images(
        self,
        query: str,
        per_page: int = 10,
        page: int = 1,
        orientation: Optional[str] = None,
        size: Optional[str] = None,
        color: Optional[str] = None,
        locale: Optional[str] = None,
    ) -> Dict[str, Any]:
        """Search images with provider preference and aggregation.

        If IMAGE_SEARCH_PROVIDER == 'perplexity', we will fetch from Perplexity and SerpAPI concurrently,
        prioritize Perplexity results on top, and return a larger set (favoring Perplexity).
        If only SerpAPI is available, fallback to SerpAPI.
        """

        provider = (IMAGE_SEARCH_PROVIDER or 'serpapi').lower()

        # Aggregation path: prefer Perplexity but also include SerpAPI if available
        if provider == 'perplexity' and (getattr(self.perplexity, 'is_available', False) or getattr(self.serpapi, 'is_available', False)):
            tasks = []
            pplx_task = None
            serp_task = None
            # Request more from Perplexity for richer coverage
            if getattr(self.perplexity, 'is_available', False):
                pplx_task = asyncio.create_task(self.perplexity.search_images(
                    query=query,
                    per_page=max(per_page * 3, per_page + 10),
                    page=page,
                    orientation=orientation,
                    size=size,
                    color=color,
                    locale=locale
                ))
                tasks.append(pplx_task)
            if getattr(self.serpapi, 'is_available', False):
                serp_task = asyncio.create_task(self.serpapi.search_images(
                    query=query,
                    per_page=max(per_page, 20),
                    page=page,
                    orientation=orientation,
                    size=size,
                    color=color,
                    locale=locale
                ))
                tasks.append(serp_task)

            combined: list[dict] = []
            try:
                # Collect both providers with an overall timeout for reliability
                results = await asyncio.wait_for(
                    asyncio.gather(*tasks, return_exceptions=True),
                    timeout=10.0
                )
                for r in results:
                    if isinstance(r, dict):
                        photos = r.get('photos', [])
                        if photos:
                            combined.extend(photos)
            except Exception:
                # On any error, attempt direct single-provider fallback
                if getattr(self.perplexity, 'is_available', False):
                    try:
                        r = await self.perplexity.search_images(query=query, per_page=per_page * 2)
                        combined = r.get('photos', [])
                    except Exception:
                        combined = []
                if not combined and getattr(self.serpapi, 'is_available', False):
                    try:
                        r = await self.serpapi.search_images(query=query, per_page=per_page)
                        combined = r.get('photos', [])
                    except Exception:
                        combined = []

            # Reorder: Perplexity first, then SerpAPI; dedupe by URL
            def is_from_pplx(img: dict) -> bool:
                return (img.get('source') == 'perplexity') or ('perplexity' in str(img.get('photographer', '')).lower())

            pplx_imgs = [img for img in combined if is_from_pplx(img)]
            serp_imgs = [img for img in combined if not is_from_pplx(img)]

            seen_urls = set()
            ordered: list[dict] = []
            for arr in (pplx_imgs, serp_imgs):
                for img in arr:
                    url = img.get('url') or img.get('src', {}).get('original')
                    if not url or url in seen_urls:
                        continue
                    seen_urls.add(url)
                    ordered.append(img)

            # Cap to an expanded size (favor more Perplexity)
            cap = max(per_page * 3, per_page + 20)
            return {"photos": ordered[:cap], "total_results": len(ordered)}

        # Non-aggregation path
        if getattr(self.serpapi, 'is_available', False):
            return await self.serpapi.search_images(
                query=query,
                per_page=per_page,
                page=page,
                orientation=orientation,
                size=size,
                color=color,
                locale=locale
            )

        logger.warning(f"No web image provider available for query: {query}")
        return {"photos": [], "total_results": 0}
    
    def _extract_topics_from_text(self, text: str) -> List[str]:
        """Extract meaningful image search topics from text."""
        if not text:
            return []
        
        # Don't search for images on quiz/Q&A slides
        quiz_indicators = ['quiz', 'q&a', 'questions', 'test your knowledge', 'review questions']
        if any(indicator in text.lower() for indicator in quiz_indicators):
            return []
        
        topics = []
        text = text.strip()
        
        # Common stop words to exclude
        stop_words = {
            'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
            'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
            'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would',
            'could', 'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
            'into', 'through', 'during', 'before', 'after', 'above', 'below', 'between',
            'under', 'again', 'further', 'then', 'once', 'here', 'there', 'when', 'where',
            'why', 'how', 'all', 'both', 'each', 'few', 'more', 'most', 'other', 'some',
            'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so', 'than', 'too',
            'very', 's', 't', 'can', 'will', 'just', 'don', 'should', 'now',
            'introduction', 'overview', 'conclusion', 'summary', 'about', 'understanding'
        }
        
        # Words that don't make good image searches on their own
        vague_terms = {
            'make', 'makes', 'making', 'made', 'take', 'takes', 'taking', 'took',
            'give', 'gives', 'giving', 'gave', 'get', 'gets', 'getting', 'got',
            'know', 'knows', 'knowing', 'knew', 'show', 'shows', 'showing', 'showed',
            'inside', 'outside', 'top', 'bottom', 'left', 'right', 'best', 'good',
            'new', 'old', 'first', 'last', 'next', 'previous', 'current', 'future',
            'past', 'present', 'today', 'tomorrow', 'yesterday', 'always', 'never',
            'everything', 'something', 'anything', 'nothing', 'everyone', 'someone',
            'unlock', 'unlocking', 'unlocked', 'power', 'powerful', 'explore', 'exploring',
            'discover', 'discovering', 'learn', 'learning', 'understand', 'understanding'
        }
        
        # Clean text - remove punctuation and convert to lowercase for processing
        clean_text = text.lower()
        for punct in ['.', ',', '!', '?', ':', ';', '-', '(', ')', '[', ']', '{', '}', '"', "'"]:
            clean_text = clean_text.replace(punct, ' ')
        
        words = clean_text.split()
        
        # Extract meaningful phrases based on patterns
        
        # Pattern 1: Look for domain-specific compound terms (2-3 words)
        for i in range(len(words)):
            # Two-word phrases
            if i < len(words) - 1:
                word1, word2 = words[i], words[i+1]
                if (word1 not in stop_words and word1 not in vague_terms and len(word1) > 2 and
                    word2 not in stop_words and word2 not in vague_terms and len(word2) > 2):
                    # Check if this is a meaningful domain term
                    phrase = f"{word1} {word2}"
                    # Good patterns: noun + noun, adjective + noun
                    if self._is_meaningful_phrase(phrase):
                        topics.append(phrase)
            
            # Three-word phrases for very specific terms
            if i < len(words) - 2:
                word1, word2, word3 = words[i], words[i+1], words[i+2]
                if (word1 not in stop_words and word2 not in stop_words and word3 not in stop_words and
                    len(word1) > 2 and len(word3) > 2):
                    phrase = f"{word1} {word2} {word3}"
                    if self._is_meaningful_phrase(phrase):
                        topics.append(phrase)
                        i += 2  # Skip ahead to avoid overlapping phrases
        
        # Pattern 2: Extract key single words that are meaningful on their own
        meaningful_singles = []
        for word in words:
            if (len(word) > 4 and word not in stop_words and word not in vague_terms and
                not word.isdigit() and word.isalpha()):
                # Check for domain-specific terms
                if self._is_domain_term(word):
                    meaningful_singles.append(word)
        
        # Add the most meaningful single words if we don't have enough phrases
        if len(topics) < 2 and meaningful_singles:
            topics.extend(meaningful_singles[:2])
        
        # If we still don't have good topics, try to extract the core subject
        if not topics and len(words) > 0:
            # Get the longest, most meaningful words
            candidates = [w for w in words if len(w) > 5 and w not in stop_words and w not in vague_terms]
            if candidates:
                topics.append(candidates[0])
        
        # Clean up and deduplicate
        cleaned_topics = []
        for topic in topics:
            topic = topic.strip()
            if topic and topic not in cleaned_topics:
                cleaned_topics.append(topic)
        
        return cleaned_topics[:3]  # Return max 3 topics
    
    def _is_meaningful_phrase(self, phrase: str) -> bool:
        """Check if a phrase is meaningful for image search."""
        # Scientific/technical terms
        scientific_indicators = [
            'synthesis', 'reaction', 'process', 'system', 'structure', 'cycle',
            'mechanism', 'function', 'cell', 'molecule', 'energy', 'light',
            'chemical', 'biological', 'physical', 'atomic', 'molecular'
        ]
        
        # Business/professional terms  
        business_indicators = [
            'strategy', 'analysis', 'market', 'growth', 'innovation', 'technology',
            'digital', 'transformation', 'development', 'management', 'leadership'
        ]
        
        # Educational terms
        educational_indicators = [
            'diagram', 'illustration', 'visualization', 'chart', 'graph', 'model',
            'example', 'demonstration', 'experiment', 'research', 'study'
        ]
        
        phrase_lower = phrase.lower()
        
        # Check if phrase contains meaningful indicators
        for indicators in [scientific_indicators, business_indicators, educational_indicators]:
            if any(ind in phrase_lower for ind in indicators):
                return True
        
        # Check for specific patterns that make good searches
        words = phrase_lower.split()
        if len(words) == 2:
            # Pattern: descriptor + noun (e.g., "cellular respiration", "quantum computing")
            if any(word.endswith(('tion', 'sion', 'ment', 'sis', 'ing', 'ure', 'omy', 'ogy')) for word in words):
                return True
        
        return False
    
    def _is_domain_term(self, word: str) -> bool:
        """Check if a single word is a domain-specific term worth searching."""
        word_lower = word.lower()
        
        # Scientific terms
        if any(word_lower.endswith(suffix) for suffix in ['synthesis', 'osis', 'ase', 'ide', 'ine']):
            return True
        
        # Technical terms
        if any(word_lower.startswith(prefix) for prefix in ['photo', 'bio', 'eco', 'micro', 'macro', 'cyber', 'crypto']):
            return True
        
        # Specific known good terms
        good_terms = {
            'photosynthesis', 'chloroplast', 'mitochondria', 'ecosystem', 'algorithm',
            'blockchain', 'artificial', 'intelligence', 'quantum', 'neural', 'genetic',
            'molecular', 'cellular', 'atomic', 'chemical', 'biological', 'ecological'
        }
        
        return word_lower in good_terms
    
    def _slide_needs_images(self, slide: Any, slide_index: int = 0) -> bool:
        """Check if a slide should have images searched for it."""
        # Check slide layout type
        layout = getattr(slide, 'layout', '').lower()
        if layout in ['quiz', 'q&a', 'questions', 'poll', 'survey']:
            return False
        
        # Check title for quiz/Q&A indicators
        title = getattr(slide, 'title', '').lower()
        no_image_indicators = [
            'quiz', 'q&a', 'question', 'test your', 'review', 'exercise',
            'practice', 'assessment', 'evaluation', 'check your'
        ]
        if any(indicator in title for indicator in no_image_indicators):
            return False
        
        # First slide (title) and last slide (conclusion) usually need images
        # Middle content slides need images too
        return True
    
    def _extract_topics_from_slide(self, slide: Any, index: int, deck_outline: Any) -> List[str]:
        """Extract simple, visual search topics from a slide."""
        topics = set()
        title = slide.title or ""
        content = slide.content or ""

        # 1. Get the main subject of the whole deck
        deck_prompt = ""
        try:
            deck_prompt = deck_outline.prompt or ""
        except AttributeError:
            # DeckOutline might not have a prompt attribute
            pass
        deck_subject = self._extract_main_subject(deck_outline.title, deck_prompt)
        if deck_subject:
            topics.add(deck_subject)

        # 2. Get the main subject of the current slide
        slide_subject = self._extract_main_subject(title, "")
        
        # If the slide subject is different and not just a subset of the deck subject, add it.
        if slide_subject and slide_subject.lower() not in deck_subject.lower():
            topics.add(slide_subject)
        
        # 3. Extract specific aspects based on slide content patterns
        all_text = (title + " " + content).lower()
        
        # Look for specific patterns in titles
        if 'abilities' in title.lower() or 'stats' in title.lower() or 'statistics' in title.lower():
            topics.add(f"{deck_subject} battle")
            topics.add(f"{deck_subject} abilities")
        elif 'evolution' in title.lower() or 'history' in title.lower():
            topics.add(f"{deck_subject} evolution")
            topics.add(f"{deck_subject} timeline")
        elif 'popular' in title.lower() or 'amazing' in title.lower() or 'why' in title.lower():
            topics.add(f"{deck_subject} merchandise")
            topics.add(f"{deck_subject} fans")
        
        # Content-based specific searches
        if 'battle' in all_text or 'attack' in all_text or 'damage' in all_text:
            topics.add(f"{deck_subject} battle scene")
        if 'merchandise' in all_text or 'billion' in all_text or 'sales' in all_text:
            topics.add(f"{deck_subject} products")
        if 'evolution' in all_text or 'evolve' in all_text:
            topics.add(f"{deck_subject} evolution chart")
        if 'friendship' in all_text or 'bond' in all_text:
            topics.add(f"{deck_subject} friendship")
        
        # If after all that we have nothing, we probably have vague titles.
        # Fallback to the deck subject if it exists.
        if not topics and deck_subject:
            topics.add(deck_subject)

        # Add thematic/visual elements based on content
        all_text = (title + " " + content).lower()
        
        # Element-based searches (keep existing logic but make more specific)
        if any(word in all_text for word in ['electric', 'lightning', 'thunder', 'shock', 'volt']):
            topics.add('lightning effects')
            topics.add('electric pokemon')
        if any(word in all_text for word in ['power', 'powerful', 'strong']):
            topics.add(f"{deck_subject} power")
        if any(word in all_text for word in ['cute', 'adorable', 'beloved']):
            topics.add(f"{deck_subject} cute")
        
        # Mood-based searches for abstract slides
        # Determine slide type based on index and content
        slide_type = self._determine_slide_type(slide, index)
        if slide_type in ['title', 'conclusion'] or not slide_subject:
            if any(word in all_text for word in ['innovat', 'future', 'transform']):
                topics.add('innovation')
            elif any(word in all_text for word in ['success', 'achieve', 'win']):
                topics.add('success')
            elif any(word in all_text for word in ['connect', 'network', 'together']):
                topics.add('connection')
        
        # Remove duplicates and filter out too generic terms
        unique_topics = []
        for topic in topics:
            # Skip if too short or generic
            if len(topic) > 3 and topic.lower() not in self.VAGUE_TERMS:
                unique_topics.append(topic)
        
        return unique_topics[:5]  # Return up to 5 search terms
    
    def _extract_comprehensive_topics(self, slide: Any, index: int, deck_outline: Any, max_topics: int = 5) -> List[str]:
        """
        Extract a comprehensive list of search topics from a slide, including
        the main subject, thematic elements, and specific entities.
        """
        # Start with simple topics
        topics = set(self._extract_topics_from_slide(slide, index, deck_outline))
        
        title = slide.title or ""
        content = slide.content or ""
        all_text = f"{title} {content}"
        
        # Add specific entities
        entities = self._extract_specific_entities(title, content)
        for entity in entities:
            if len(topics) < max_topics:
                topics.add(entity)
        
        # Add domain keywords
        domain_keywords = self._extract_domain_keywords(all_text)
        for keyword in domain_keywords:
            if len(topics) < max_topics:
                topics.add(keyword)
                
        # Prioritize and return
        return self._prioritize_topics(list(topics), max_topics)
    
    def _extract_specific_topics(self, content: str) -> List[str]:
        """Extract specific searchable topics from content."""
        topics = []
        content_lower = content.lower()
        
        # Technology keywords
        tech_terms = ['AI', 'machine learning', 'blockchain', 'cloud computing', 'cybersecurity', 
                      'data analytics', 'IoT', 'quantum computing', '5G', 'automation']
        
        # Healthcare keywords
        health_terms = ['treatment', 'therapy', 'patient care', 'medical device', 'diagnosis',
                        'healthcare innovation', 'telemedicine', 'clinical trial']
        
        # Business keywords
        business_terms = ['strategy', 'innovation', 'growth', 'transformation', 'leadership',
                          'market analysis', 'customer experience', 'digital transformation']
        
        # Check for specific terms
        all_terms = tech_terms + health_terms + business_terms
        for term in all_terms:
            if term.lower() in content_lower:
                topics.append(term)
                if len(topics) >= 2:  # Limit specific topics
                    break
        
        return topics
    
    async def _search_images_for_topic(
        self,
        topic: str,
        deck_id: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 12
    ) -> List[Dict[str, Any]]:
        """Search for images for a specific topic."""
        # Validate topic before searching
        if not topic or len(topic.strip()) < 3:
            return []
        
        # Skip if topic is too vague
        topic_lower = topic.lower().strip()
        if topic_lower in self.VAGUE_TERMS:
            logger.warning(f"Skipping vague search term: {topic}")
            return []
        
        # Check cache first
        cache_key = self._get_cache_key(topic, orientation='landscape', num_images=num_images)
        cached_results = await self._get_cached_results(cache_key)
        if cached_results:
            logger.info(f"Using cached results for topic: {topic}")
            # Select diverse images from cached results
            selected_images = await self._select_diverse_images(cached_results, num_images, deck_id)
            return selected_images
        
        # When we already have a topic/search query, search directly without AI extraction
        google_results = []
        
        provider = (IMAGE_SEARCH_PROVIDER or 'serpapi').lower()
        if provider == 'perplexity' and getattr(self.perplexity, 'is_available', False):
            logger.info(f"Using Perplexity for topic: {topic}")
            search_results = await self.perplexity.search_images(
                query=topic,
                per_page=num_images * 3,
                orientation='landscape'
            )
        elif getattr(self.serpapi, 'is_available', False):
            logger.info(f"Using Google Images (SerpAPI) for topic: {topic}")
            search_results = await self.serpapi.search_images(
                query=topic,
                per_page=num_images * 3,
                orientation='landscape'
            )
            
            if search_results and search_results.get('photos'):
                google_results = search_results['photos']
                
                # Cache the results
                self._set_cached_results(cache_key, google_results)
                
                # Select diverse images and return them directly - NO UPLOAD!
                selected_images = await self._select_diverse_images(google_results, num_images, deck_id)
                return selected_images
        
        # Fallback to empty if no results
        return []
    
    def _format_images_for_streaming(self, images: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        """Format images for streaming without large payloads."""
        logger.debug(f"📸 _format_images_for_streaming called with {len(images)} images")
        formatted_images = []
        for img in images:
            # Handle both formats - direct URL or src object
            if 'src' in img and isinstance(img['src'], dict):
                url = img['src'].get('large', img['src'].get('original', img.get('url', '')))
                thumbnail = img['src'].get('medium', img['src'].get('thumbnail', url))
            else:
                url = img.get('url', '')
                thumbnail = img.get('thumbnail', url)
            
            formatted_image = {
                'url': url,
                'thumbnail': thumbnail,
                'photographer': img.get('photographer', 'Unknown'),
                'alt': img.get('alt', ''),
                'id': img.get('id'),
                'ai_generated': img.get('ai_generated', False)
            }
            
            # Preserve topic field if present
            if 'topic' in img:
                formatted_image['topic'] = img['topic']
            
            # Don't include b64_json in the streamed data to avoid large payloads
            if 'b64_json' not in img:
                formatted_images.append(formatted_image)
        
        logger.debug(f"📸 Formatted {len(formatted_images)} images for streaming")
        
        return formatted_images
    
    async def search_images_background(
        self,
        deck_outline: Any,
        deck_uuid: str,
        callback: Optional[Any] = None,
        max_images_per_slide: int = 6,
        search_queries: Optional[Dict[str, str]] = None
    ):
        """
        Search for images in the background while deck is being generated.
        
        Args:
            deck_outline: The deck outline containing slides
            deck_uuid: UUID of the deck being created
            callback: Optional callback function for progress updates
            max_images_per_slide: Maximum images to collect per slide
            search_queries: Optional pre-generated search queries per slide
            
        Returns:
            Task that can be awaited for final results
        """
        logger.info(f"🖼️ COMBINED IMAGE SERVICE: Starting background search")
        logger.info(f"🖼️ Deck UUID: {deck_uuid}")
        logger.info(f"🖼️ Deck title: {getattr(deck_outline, 'title', 'Unknown')}")
        logger.info(f"🖼️ Number of slides: {len(getattr(deck_outline, 'slides', []))}")
        logger.info(f"🖼️ Max images per slide: {max_images_per_slide}")
        logger.info(f"🖼️ Has callback: {callback is not None}")
        logger.info(f"🖼️ Has search queries: {search_queries is not None}")
        
        logger.debug(f"🖼️ COMBINED IMAGE SERVICE START (deck_uuid={deck_uuid}, title={getattr(deck_outline, 'title', 'Unknown')}, slides={len(getattr(deck_outline, 'slides', []))}, has_callback={callback is not None})")
        
        deck_id = deck_uuid
        self.reset_deck_ai_count(deck_id)
        
        # Extract all topics first
        topics_to_search = {}  # topic -> list of slide IDs
        slide_topics = {}  # slide_id -> list of topics
        
        # First check if we have deck-wide searches from search_queries parameter
        deck_wide_topics = []
        if search_queries and isinstance(search_queries, dict):
            # Check for new deck-wide format
            if "deck_wide" in search_queries:
                deck_wide_data = search_queries["deck_wide"]
                deck_wide_topics = deck_wide_data.get("selected_searches", [])
                logger.info(f"Using deck-wide search topics from search_queries: {deck_wide_topics}")
        
        # If not found in search_queries, check if deck_outline has image_search_topics attribute
        if not deck_wide_topics:
            deck_wide_topics = getattr(deck_outline, 'image_search_topics', None) or []
            
        # If still no topics, extract from deck title and vibe context
        if not deck_wide_topics:
            logger.info("No deck-wide topics provided, extracting from outline...")
            deck_wide_topics = self._extract_topics_from_deck_outline(deck_outline)
        
        logger.info(f"🖼️ Deck-wide topics: {deck_wide_topics}")
        
        if deck_wide_topics:
            deck_wide_topics = deck_wide_topics[:10]  # Limit to 10 topics
            logger.info(f"🖼️ Deck-wide topics: {deck_wide_topics}")
            
            logger.info(f"Using {len(deck_wide_topics)} deck-wide topics from theme extraction")
            
            # First, identify which slides need images
            slides_needing_images = []
            for i, slide in enumerate(deck_outline.slides):
                if self._slide_needs_images(slide, i):
                    slides_needing_images.append((i, slide))
            
            if slides_needing_images:
                # Strategy: Build per-slide topics from deck-wide phrase(s) + slide titles
                # This avoids overly generic deck-wide queries like 'super'
                for i, slide in slides_needing_images:
                    slide_id = slide.id
                    if slide_id not in slide_topics:
                        slide_topics[slide_id] = []
                    # Prefer combining deck-wide core phrase (e.g., 'super smash bros') with slide-specific cues
                    # Extract slide-specific phrases
                    slide_title = getattr(slide, 'title', '') or ''
                    specific = self._extract_topics_from_text(slide_title) or []
                    # If none, use the slide title itself chunked
                    if not specific and slide_title:
                        specific = [w for w in re.findall(r"[A-Za-z][A-Za-z\-']+", slide_title) if len(w) > 3][:2]
                    # Combine with deck-wide topics to form targeted queries per slide
                    combined_for_slide: List[str] = []
                    for core in deck_wide_topics:
                        core = (core or '').strip()
                        if not core:
                            continue
                        if specific:
                            # Form queries like 'super smash bros pikachu' rather than just 'super'
                            q = f"{core} {' '.join(specific[:2])}".strip()
                        else:
                            q = core
                        q = q.strip()
                        if len(q) >= 3 and q.lower() not in self.VAGUE_TERMS:
                            combined_for_slide.append(q)
                    # De-dup and trim
                    dedup: List[str] = []
                    seen_local = set()
                    for q in combined_for_slide:
                        ql = q.lower()
                        if ql not in seen_local:
                            seen_local.add(ql)
                            dedup.append(q)
                    # Assign these queries to this slide and to topics_to_search mapping
                    for q in dedup[:3]:  # cap per slide
                        slide_topics[slide_id].append(q)
                        if q not in topics_to_search:
                            topics_to_search[q] = []
                        topics_to_search[q].append(slide_id)
        else:
            logger.info("No deck-wide topics found, extracting topics from slide content...")
            # Fallback to content-based extraction
            for slide_idx, slide in enumerate(deck_outline.slides):
                # Check if slide needs images
                if not self._slide_needs_images(slide, slide_idx):
                    logger.info(f"🖼️ Skipping slide {slide_idx + 1} '{getattr(slide, 'title', '')}' - doesn't need images")
                    continue
                
                slide_id = slide.id
                slide_topic_list = []
                
                # Extract topics from slide content
                if search_queries and slide_id in search_queries:
                    # Use pre-generated queries if available
                    query = search_queries[slide_id]
                    if query:
                        slide_topic_list.append(query)
                else:
                    # Generate topics from slide content
                    topics = []
                    
                    # From title
                    if slide.title:
                        logger.info(f"🖼️ Slide {slide_id} title: {slide.title}")
                        title_topics = self._extract_topics_from_text(slide.title)
                        if title_topics:
                            topics.extend(title_topics)
                            logger.info(f"🖼️ Title topics: {title_topics}")
                    
                    # From content (if we don't have enough topics)
                    if len(topics) < 2 and slide.content:
                        content_topics = self._extract_topics_from_text(slide.content[:300])  # First 300 chars
                        if content_topics:
                            topics.extend(content_topics)
                            logger.info(f"🖼️ Content topics: {content_topics}")
                    
                    # Use deck title as context if we still need topics
                    if len(topics) < 1:
                        deck_title_topics = self._extract_topics_from_text(deck_outline.title)
                        if deck_title_topics:
                            topics.extend(deck_title_topics)
                            logger.info(f"🖼️ Deck title topics: {deck_title_topics}")
                    
                    slide_topic_list = list(dict.fromkeys(topics))[:3]  # Deduplicate and limit to 3
                
                logger.info(f"🖼️ Slide {slide_idx + 1} '{slide.title}' final topics: {slide_topic_list}")
                
                # Store topics
                if slide_topic_list:
                    slide_topics[slide_id] = slide_topic_list
                    
                    for topic in slide_topic_list:
                        if topic not in topics_to_search:
                            topics_to_search[topic] = []
                        topics_to_search[topic].append(slide_id)
        
        logger.info(f"🖼️ Total unique topics to search: {len(topics_to_search)}")
        if len(topics_to_search) <= 10:
            logger.info(f"🖼️ Topics: {list(topics_to_search.keys())}")
        else:
            logger.info(f"🖼️ Topics: {list(topics_to_search.keys())[:10]}... (and {len(topics_to_search) - 10} more)")
        
        logger.info(f"🔍 Background image search task created!")
        
        if not topics_to_search:
            logger.warning("🖼️ NO TOPICS FOUND FOR IMAGE SEARCH!")
            return
        
        # Process results as they complete
        async def process_results():
            # OPTIMIZATION 1: Create all search tasks at once for parallel execution
            search_tasks = []
            
            logger.debug(f"Creating search tasks for {len(topics_to_search)} topics")
            
            for topic, slide_ids in topics_to_search.items():
                # With deck-wide searches, we can search for more images per topic
                # since we have fewer total searches
                # Calculate how many images we need based on number of slides using this topic
                slides_using_topic = len(slide_ids)
                # Get more images when multiple slides will share them
                num_images_per_topic = max(8, slides_using_topic * 4) if deck_wide_topics else 8
                
                # Create coroutine (not task yet)
                coro = self._search_images_for_topic_optimized(
                    topic=topic,
                    deck_id=deck_id,
                    style_preferences=deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None,
                    num_images=num_images_per_topic
                )
                
                # Store topic info with coroutine
                search_tasks.append((topic, slide_ids, coro))
                logger.info(f"Created search coroutine for topic: '{topic}'")
            
            # OPTIMIZATION 2: Process results in order while tracking which topic each belongs to
            topic_images = {}
            topics_processed = 0
            total_topics = len(topics_to_search)
            
            # Track slides that have received images
            slides_with_images = set()
            total_images_sent = 0
            
            # Track accumulated images per slide WITH their topics
            slide_accumulated_images = {}  # slide_id -> list of (topic, images)
            
            logger.info(f"Processing {len(search_tasks)} search tasks")
            
            # Process all tasks concurrently using gather
            logger.debug(f"Processing {len(search_tasks)} search tasks...")
            
            # Create list of coroutines paired with their metadata
            task_metadata = []
            coroutines = []
            for topic, slide_ids, coro in search_tasks:
                task_metadata.append((topic, slide_ids))
                coroutines.append(coro)
            
            # Track total number of tasks for progress logging
            total_tasks = len(coroutines)
            
            # Gather all results at once
            try:
                results = await asyncio.gather(*coroutines, return_exceptions=True)
            except Exception as e:
                logger.error(f"Error gathering search results: {e}")
                results = []
            
            # Process results with their metadata
            completed_count = 0
            for (topic, slide_ids), result in zip(task_metadata, results):
                try:
                    logger.debug(f"Processing result for topic '{topic}' -> slides: {slide_ids}")
                    
                    if isinstance(result, Exception):
                        logger.error(f"Error in search task for topic '{topic}': {result}")
                        continue
                    if not result:
                        continue
                    
                    # Result is directly a list of images, not a dict
                    logger.debug(f"Result type: {type(result)}, is_list={isinstance(result, list)}")
                    
                    images = result if isinstance(result, list) else []
                    if not images:
                        logger.warning(f"Topic '{topic}' returned no images")
                        logger.debug("No images in result")
                        continue
                    
                    logger.info(f"Topic '{topic}' returned {len(images)} images for {len(slide_ids)} slides")
                    
                    # Store topic images for caching
                    topic_images[topic] = images
                    
                    # Send topic_images_found callback
                    if callback and len(images) > 0:
                        await callback({
                            "type": "topic_images_found",
                            "message": f"Found {len(images)} images for: {topic}",
                            "progress": 18,
                            "data": {
                                "topic": topic,
                                "images_count": len(images),
                                "slides_using_topic": slide_ids
                            }
                        })
                    
                    # Give ALL images from this topic to EACH slide (don't distribute/divide)
                    for slide_id in slide_ids:
                        # Initialize slide data if needed
                        if slide_id not in slide_accumulated_images:
                            slide_accumulated_images[slide_id] = {}  # topic -> images mapping
                        
                        # Give ALL images from this topic to this slide
                        topic_slide_images = images.copy()  # Copy so we don't modify original
                        
                        # Add topic field to each image
                        for img in topic_slide_images:
                            img['topic'] = topic
                        
                        # Store under the topic
                        slide_accumulated_images[slide_id][topic] = topic_slide_images
                        
                        logger.info(f"Added ALL {len(topic_slide_images)} images from topic '{topic}' to slide {slide_id}")
                        
                    completed_count += 1
                    logger.debug(f"Task {completed_count}/{total_tasks} completed")
                    
                except asyncio.TimeoutError:
                    logger.warning(f"Image search timed out after 10s")
                    continue
                except Exception as e:
                    logger.error(f"Error processing search result: {e}", exc_info=True)
            
            # Now send accumulated images for each slide (only ONE update per slide)
            logger.info(f"Sending accumulated images for {len(slide_accumulated_images)} slides")
            logger.debug(f"Accumulated images check")
            logger.debug(f"Total slides with images: {len(slide_accumulated_images)}")
            for sid, topics in slide_accumulated_images.items():
                logger.debug(f"Slide {sid}: {len(topics)} topics, {sum(len(imgs) for imgs in topics.values())} total images")
            
            for slide_id, images_by_topic in slide_accumulated_images.items():
                if images_by_topic:
                    # Find slide info
                    slide_info = next((s for s in deck_outline.slides if s.id == slide_id), None)
                    slide_index = next((i for i, s in enumerate(deck_outline.slides) if s.id == slide_id), 0)
                    
                    # Create flat array of all images (for backward compatibility)
                    all_images = []
                    for topic, topic_images in images_by_topic.items():
                        all_images.extend(topic_images)
                    
                    # Don't limit images - frontend wants all of them
                    # The frontend will handle display limits
                    
                    # Mark slide as having received images
                    slides_with_images.add(slide_id)
                    total_images_sent += len(all_images)
                    
                    logger.info(f"Sending update for slide {slide_index + 1} with {len(all_images)} total images across {len(images_by_topic)} topics")
                    
                    # Send slide_images_ready for internal tracking
                    logger.debug(f"Calling callback slide_images_ready (slide_id={slide_id}, images={len(all_images)})")
                    
                    if callback:
                        await callback({
                            "type": "slide_images_ready",
                            "slide_id": slide_id,
                            "images": all_images
                        })
                    else:
                        logger.debug("No callback provided for slide_images_ready")
                    
                    # Format images for each topic
                    formatted_images_by_topic = {}
                    for topic, topic_images in images_by_topic.items():
                        formatted_images_by_topic[topic] = self._format_images_for_streaming(topic_images)
                    
                    # Also create flat formatted array
                    formatted_images_flat = self._format_images_for_streaming(all_images)
                    
                    slide_update = {
                        "type": "slide_images_found",
                        "message": f"Images ready for slide {slide_index + 1}",
                        "progress": 20,
                        "data": {
                            "slide_id": slide_id,
                            "slide_title": slide_info.title if slide_info else "Unknown",
                            "slide_index": slide_index,
                            "topics": list(images_by_topic.keys()),
                            "images_by_topic": formatted_images_by_topic,
                            "images": formatted_images_flat,  # Flat array for backward compatibility
                            "images_count": len(all_images),
                            "partial": False  # Final update for this slide
                        }
                    }
                    
                    logger.debug(f"📸 Sending slide_images_found with images_by_topic: {len(formatted_images_by_topic)} topics")
                    if logger.isEnabledFor(logging.DEBUG):
                        for topic, imgs in formatted_images_by_topic.items():
                            logger.debug(f"  - {topic}: {len(imgs)} images")
                        logger.debug(f"📸 Total images for slide: {len(formatted_images_flat)}")
                        
                        # Log the exact structure for debugging
                        logger.debug(f"📸 EXACT STRUCTURE being sent:")
                        logger.debug(f"  - slide_id: {slide_id}")
                        logger.debug(f"  - topics list: {list(images_by_topic.keys())}")
                        logger.debug(f"  - images_by_topic keys: {list(formatted_images_by_topic.keys())}")
                        logger.debug(f"  - First topic images sample: {list(formatted_images_by_topic.values())[0][:2] if formatted_images_by_topic else 'NO TOPICS'}")
                    
                    # Debug summary
                    logger.debug(f"SENT slide_images_found for slide {slide_index} (slide_id={slide_id}, topics={len(images_by_topic)}, total_images={len(formatted_images_flat)})")
                    
                    await callback(slide_update)
                    
                    # Also send slide_images_available event that frontend expects
                    logger.debug(f"📸 SENDING slide_images_available for slide {slide_index} (slide_id={slide_id})")
                    
                    await callback({
                        "type": "slide_images_available",
                        "data": {
                            "slide_id": slide_id,
                            "slide_index": slide_index,
                            "images": formatted_images_flat,
                            "images_by_topic": formatted_images_by_topic,
                            "topics": list(images_by_topic.keys()),
                            "total_count": len(all_images)
                        }
                    })
            
            # Final pass - only handle slides that didn't get any images
            logger.info(f"Final pass - checking {len(slide_topics)} slides, {len(slides_with_images)} already have images")
            
            for slide_id, topics in slide_topics.items():
                # Skip slides that already got images
                if slide_id in slides_with_images:
                    continue
                    
                slide_images = []
                images_used = set()
                
                logger.info(f"Processing slide {slide_id} (no images yet) with topics: {topics}")
                
                # Try to gather any leftover images from topics
                for topic in topics:
                    if topic in topic_images:
                        # Only take images that haven't been distributed yet
                        for img in topic_images[topic]:
                            img_id = img.get('id') or img.get('url')
                            if img_id not in images_used and len(slide_images) < max_images_per_slide:
                                slide_images.append(img)
                                images_used.add(img_id)
                
                if slide_images:
                    # Find slide info
                    slide_info = next((s for s in deck_outline.slides if s.id == slide_id), None)
                    slide_index = next((i for i, s in enumerate(deck_outline.slides) if s.id == slide_id), 0)
                    
                    logger.info(f"Slide {slide_index + 1} gets {len(slide_images)} images in final pass")
                    
                    if callback:
                        await callback({
                            "type": "slide_images_ready",
                            "slide_id": slide_id,
                            "images": slide_images
                        })
                        
                        await callback({
                            "type": "slide_images_found",
                            "message": f"Images ready for slide {slide_index + 1}",
                            "progress": 20,
                            "data": {
                                "slide_id": slide_id,
                                "slide_title": slide_info.title if slide_info else "Unknown",
                                "slide_index": slide_index,
                                "images": self._format_images_for_streaming(slide_images),
                                "images_count": len(slide_images),
                                "topics_used": topics
                            }
                        })
            
            # Count total images collected from slides that got images
            total_images_collected = total_images_sent
            slides_with_images_count = len(slides_with_images)
            logger.info(f"Final totals: {total_images_collected} images sent to {slides_with_images_count} slides")
            
            # Stream completion event
            if callback:
                await callback({
                    "type": "images_collection_complete",
                    "message": f"Images collection complete - searched {len(topics_to_search)} topics",
                    "progress": 20,
                    "data": {
                        "total_topics_searched": len(topics_to_search),
                        "total_slides_processed": len(slide_topics),
                        "ai_images_used": self.get_ai_count(deck_id)
                    }
                })
                
                # Send final images_ready_for_selection event (without partial flag)
                await callback({
                    "type": "images_ready_for_selection",
                    "message": f"All images ready - {total_images_collected} images for {slides_with_images_count} slides",
                    "progress": 25,
                    "data": {
                        "deck_id": deck_outline.id,
                        "deck_uuid": deck_uuid,
                        "total_images_available": total_images_collected,
                        "slides_with_images": slides_with_images_count
                        # Note: No "partial" flag - this is the final notification
                    }
                })
            
            # Build the return value with all images distributed to slides
            # We'll reconstruct from what was sent
            return topic_images  # Return the topic images for now
        
        # Start processing in background
        return asyncio.create_task(process_results())
    
    async def _search_images_for_topic_optimized(
        self,
        topic: str,
        deck_id: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 8
    ) -> List[Dict[str, Any]]:
        """Optimized search for images for a specific topic with rate limiting."""
        # Rate limit to avoid overwhelming the API
        await self.rate_limiter()
        
        # Validate topic before searching
        if not topic or len(topic.strip()) < 3:
            return []
        
        # Skip if topic is too vague
        topic_lower = topic.lower().strip()
        if topic_lower in self.VAGUE_TERMS:
            logger.warning(f"Skipping vague search term: {topic}")
            return []
        
        try:
            logger.info(f"Searching for topic: '{topic}' (optimized, {num_images} images)")
            provider = (IMAGE_SEARCH_PROVIDER or 'serpapi').lower()
            if provider == 'perplexity' and getattr(self.perplexity, 'is_available', False):
                search_task = self.perplexity.search_images(
                    query=topic,
                    per_page=num_images * 2,
                    orientation='landscape'
                )
            else:
                search_task = self.serpapi.search_images(
                    query=topic,
                    per_page=num_images * 2,
                    orientation='landscape'
                )
            
            search_results = await asyncio.wait_for(search_task, timeout=10.0)
            
            if not search_results or not search_results.get('photos'):
                logger.warning(f"No results for topic: '{topic}'")
                return []
            
            google_results = search_results['photos']
            logger.info(f"Found {len(google_results)} images for topic: '{topic}'")
            logger.debug(f"SERPAPI results for '{topic}': total_raw={len(google_results)}")
            
            # Use _select_diverse_images to avoid duplicates
            selected_images = await self._select_diverse_images(google_results, num_images, deck_id)
            logger.info(f"Selected {len(selected_images)} diverse images for topic: '{topic}')")
            logger.debug(f"Selected {len(selected_images)} images after diversity filter")
            
            # Ensure images have required fields
            formatted_images = []
            for img in selected_images:
                formatted_img = {
                    'url': img.get('url', img.get('original', '')),
                    'title': img.get('title', ''),
                    'width': img.get('width', 800),
                    'height': img.get('height', 600),
                    'thumbnail': img.get('thumbnail', img.get('url', '')),
                    'source': 'google',
                    'id': img.get('id', img.get('url', ''))
                }
                if formatted_img['url']:
                    formatted_images.append(formatted_img)
            
            logger.info(f"Returning {len(formatted_images)} formatted images for topic: '{topic}'")
            logger.debug(f"Returning {len(formatted_images)} formatted images")
            
            return formatted_images

        except asyncio.TimeoutError:
            logger.warning(f"Search timeout for topic: {topic}")
            return []
        except Exception as e:
            logger.error(f"Error searching for topic '{topic}': {e}", exc_info=True)
            return []
    
    async def _upload_single_image_with_retry(self, img: Dict[str, Any], max_retries: int = 2) -> Optional[Dict[str, Any]]:
        """Upload image with retry logic for better reliability."""
        for attempt in range(max_retries):
            try:
                # Quick check if already uploaded
                if img.get('url', '').startswith('https://') and 'supabase' in img.get('url', ''):
                    return img
                
                # Try upload with timeout
                upload_task = self._upload_single_image(img)
                result = await asyncio.wait_for(upload_task, timeout=5.0)
                
                if result:
                    return result
                    
            except asyncio.TimeoutError:
                logger.warning(f"Upload timeout for image (attempt {attempt + 1}/{max_retries})")
            except Exception as e:
                if attempt == max_retries - 1:
                    logger.error(f"Failed to upload image after {max_retries} attempts: {e}")
                    
        # Return original image if all uploads fail
        return img
    
    async def search_image_options_for_deck(
        self,
        deck_outline: Any,
        images_per_topic: int = 20,
        max_topics_per_slide: int = 5
    ) -> Dict[str, Any]:
        """
        Search for multiple image options per topic for user selection.
        Returns a structured response with all available images organized by topic and slide.
        
        Args:
            deck_outline: The deck outline to search images for
            images_per_topic: Number of images to return per search topic (default: 20)
            max_topics_per_slide: Maximum topics to search per slide (default: 5)
            
        Returns:
            Dict containing:
            - topics: Dict of topic -> list of image options
            - slides: Dict of slide_id -> topics and placeholder info
            - metadata: Search statistics
        """
        deck_id = deck_outline.id
        self.reset_deck_ai_count(deck_id)
        
        # Step 1: Extract comprehensive topics from all slides
        topics_to_search = {}  # topic -> list of slide IDs
        slide_info = {}  # slide_id -> slide metadata
        
        for i, slide in enumerate(deck_outline.slides):
            if not self._slide_needs_images(slide, i):
                continue

            slide_topics = self._extract_comprehensive_topics(
                slide, i, deck_outline, max_topics_per_slide
            )
            
            # Store slide info
            slide_info[slide.id] = {
                "id": slide.id,
                "title": slide.title,
                "index": i,
                "topics": slide_topics,
                "placeholders": self._count_image_placeholders(slide)
            }
            
            for topic in slide_topics:
                if topic not in topics_to_search:
                    topics_to_search[topic] = []
                topics_to_search[topic].append(slide.id)
        
        # Step 2: Search for images for all unique topics in parallel
        search_tasks = [
            self._search_images_for_topic_with_options(
                topic, deck_id, deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None, images_per_topic
            )
            for topic in topics_to_search
        ]
        
        search_results = await asyncio.gather(*search_tasks, return_exceptions=True)
        
        # Step 3: Organize results by topic
        images_by_topic = {}
        successful_searches = 0
        failed_searches = 0
        total_images_found = 0
        
        for topic, result in zip(topics_to_search.keys(), search_results):
            if isinstance(result, list):
                images_by_topic[topic] = result
                if result:  # Count as successful if we got any images
                    successful_searches += 1
                    total_images_found += len(result)
                else:
                    failed_searches += 1
            else:
                logger.error(f"Error searching for topic '{topic}': {result}")
                images_by_topic[topic] = []
                failed_searches += 1

        return {
            "topics": images_by_topic,
            "slides": slide_info,
            "metadata": {
                "total_topics_searched": len(topics_to_search),
                "successful_searches": successful_searches,
                "failed_searches": failed_searches,
                "total_images_found": total_images_found,
                "ai_images_generated": self.get_ai_count(deck_id),
                "total_slides_with_images": len(slide_info)
            }
        }
    
    def _count_image_placeholders(self, slide: Any) -> int:
        """Count the number of Image components in a slide."""
        count = 0
        if hasattr(slide, 'components') and slide.components:
            for component in slide.components:
                if component.type == 'Image':
                    count += 1
        return count

    async def _search_images_for_topic_with_options(
        self,
        topic: str,
        deck_id: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 20
    ) -> List[Dict[str, Any]]:
        """
        Search a topic and return a list of image options without uploading.
        Used for the image selection UI.
        """
        # This just wraps the normal search function
        return await self._search_images_for_topic(
            topic=topic,
            deck_id=deck_id,
            style_preferences=style_preferences,
            num_images=num_images
        )
    
    def _extract_entities_from_text(self, text: str) -> List[str]:
        """Extract meaningful entities and concepts from text."""
        if not text:
            return []
        
        entities = []
        
        # Extract capitalized words (likely proper nouns)
        words = text.split()
        i = 0
        while i < len(words):
            word = words[i]
            if word[0].isupper() and word.lower() not in self.STOP_WORDS:
                # Check if it's part of a multi-word entity
                entity = word
                j = i + 1
                # Limit multi-word entities to 3 words max
                while j < len(words) and words[j][0].isupper() and (j - i) < 3:
                    if words[j].lower() not in self.STOP_WORDS:
                        entity += " " + words[j]
                        j += 1
                    else:
                        break
                
                # Only add if it's meaningful (not too short)
                if len(entity) > 2 and len(entity.split()) <= 3:
                    entities.append(entity)
                i = j
            else:
                i += 1
        
        # Extract quoted phrases
        quoted = re.findall(r'"([^"]+)"', text)
        entities.extend([q for q in quoted if len(q) > 2 and len(q.split()) <= 4])
        
        # Extract domain-specific keywords
        keywords = self._extract_domain_keywords(text)
        entities.extend(keywords)
        
        return entities
    
    def _extract_comparison_topics(self, title: str, content: str) -> List[str]:
        """Extract individual topics from comparisons like 'A vs B' or 'A and B'."""
        topics = []
        full_text = f"{title} {content}"
        
        # Pattern for "vs", "versus", "compared to", etc.
        comparison_patterns = [
            r'(\w+(?:\s+\w+)*?)\s+vs\.?\s+(\w+(?:\s+\w+)*)',
            r'(\w+(?:\s+\w+)*?)\s+versus\s+(\w+(?:\s+\w+)*)',
            r'(\w+(?:\s+\w+)*?)\s+compared\s+to\s+(\w+(?:\s+\w+)*)',
            r'(\w+(?:\s+\w+)*?)\s+and\s+(\w+(?:\s+\w+)*)',
        ]
        
        for pattern in comparison_patterns:
            matches = re.findall(pattern, full_text, re.IGNORECASE)
            for match in matches:
                # Clean and limit the extracted topics
                topic1 = match[0].strip().split()[:2]  # Max 2 words
                topic2 = match[1].strip().split()[:2]  # Max 2 words
                
                if topic1:
                    topics.append(' '.join(topic1))
                if topic2:
                    topics.append(' '.join(topic2))
        
        return topics
    
    def _extract_specific_entities(self, title: str, content: str) -> List[str]:
        """Extract specific person, brand, or product names."""
        entities = []
        full_text = f"{title} {content}"
        
        # Common patterns for presentations about specific entities
        
        # Pattern for "about X", "on X", "featuring X"
        about_patterns = [
            r'about\s+([A-Z]\w+(?:\s+[A-Z]\w+)*)',
            r'featuring\s+([A-Z]\w+(?:\s+[A-Z]\w+)*)',
            r'introducing\s+([A-Z]\w+(?:\s+[A-Z]\w+)*)',
            r'profile\s+of\s+([A-Z]\w+(?:\s+[A-Z]\w+)*)',
        ]
        
        for pattern in about_patterns:
            matches = re.findall(pattern, full_text)
            entities.extend(matches)
        
        # Look for repeated capitalized names (likely the main subject)
        words = full_text.split()
        name_counts = {}
        for word in words:
            if word[0].isupper() and len(word) > 2:
                name_counts[word] = name_counts.get(word, 0) + 1
        
        # Add frequently mentioned names
        for name, count in name_counts.items():
            if count >= 2:  # Mentioned at least twice
                entities.append(name)
        
        return entities
    
    def _extract_domain_keywords(self, text: str) -> List[str]:
        """Extract domain-specific keywords based on context."""
        keywords = []
        text_lower = text.lower()
        
        # Technology domain
        if any(term in text_lower for term in ['technology', 'software', 'digital', 'ai', 'data']):
            tech_keywords = ['innovation', 'digital transformation', 'cloud computing', 
                            'artificial intelligence', 'machine learning', 'cybersecurity']
            keywords.extend([k for k in tech_keywords if k in text_lower])
        
        # Business domain
        if any(term in text_lower for term in ['business', 'market', 'strategy', 'growth']):
            business_keywords = ['leadership', 'strategy', 'growth', 'market analysis', 
                                'customer experience', 'revenue', 'profit']
            keywords.extend([k for k in business_keywords if k in text_lower])
        
        # Healthcare domain
        if any(term in text_lower for term in ['health', 'medical', 'patient', 'clinical']):
            health_keywords = ['healthcare', 'patient care', 'medical innovation', 
                              'clinical research', 'treatment', 'diagnosis']
            keywords.extend([k for k in health_keywords if k in text_lower])
        
        return keywords
    
    def _prioritize_topics(self, topics: List[str], max_topics: int) -> List[str]:
        """Prioritize topics based on relevance and specificity."""
        if len(topics) <= max_topics:
            return topics
        
        # Score topics based on specificity and relevance
        scored_topics = []
        for topic in topics:
            score = 0
            
            # Longer, more specific topics get higher scores
            score += len(topic.split())
            
            # Capitalized words (proper nouns) get higher scores
            if topic[0].isupper():
                score += 2
            
            # Topics with numbers or specific details get higher scores
            if re.search(r'\d', topic):
                score += 1
            
            scored_topics.append((score, topic))
        
        # Sort by score and return top topics
        scored_topics.sort(reverse=True)
        return [topic for _, topic in scored_topics[:max_topics]] 