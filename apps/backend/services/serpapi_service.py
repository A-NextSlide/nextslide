import os
import re
import asyncio
import aiohttp
import urllib.parse
from typing import List, Dict, Any, Optional
from dotenv import load_dotenv
from serpapi import GoogleSearch
from services.image_validator import ImageValidator

# Load environment variables
load_dotenv()

class SerpAPIService:
    """Service for interacting with SerpAPI for Google Images search."""
    
    def __init__(self):
        """Initialize the service with API key from environment variables."""
        # Try both possible env var names
        self.api_key = os.getenv('SERPAPI_API_KEY') or os.getenv('SERPAPI_KEY')
        self.is_available = bool(self.api_key)
        
        if not self.is_available:
            print("Warning: SERPAPI_API_KEY not set. SerpAPI service will not be available.")
        
        # Create a persistent session for better performance
        self._session = None

    async def _get_session(self):
        """Get or create aiohttp session."""
        if self._session is None:
            self._session = aiohttp.ClientSession()
        return self._session
    
    async def __aenter__(self):
        return self
    
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        if self._session:
            await self._session.close()
            self._session = None

    def __del__(self):
        """Cleanup session when object is garbage collected"""
        if self._session and not self._session.closed:
            # Create a new event loop if necessary to close the session
            try:
                loop = asyncio.get_event_loop()
                if loop.is_running():
                    # Schedule the close for later
                    asyncio.create_task(self._session.close())
                else:
                    # Run it now
                    loop.run_until_complete(self._session.close())
            except Exception:
                # If we can't close properly, at least try to detach
                if hasattr(self._session, '_connector'):
                    self._session._connector._close()
    
    def _simple_keyword_extraction(self, title: str, content: str) -> str:
        """Simple fallback keyword extraction if AI fails."""
        # Remove common words
        stop_words = {'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                     'of', 'with', 'by', 'is', 'are', 'was', 'were', 'been', 'being', 'have', 
                     'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could', 'should'}
        
        # Extract words from title first
        words = title.split()
        keywords = [w for w in words if w.lower() not in stop_words and len(w) > 2]
        
        # Take first 3 meaningful words
        return ' '.join(keywords[:3]) if keywords else title[:30]

    def _build_query_from_slide(
        self,
        title: str,
        content: Optional[str],
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None
    ) -> str:
        """Build a specific, targeted image search query from slide content.

        Rules:
        - Prioritize proper nouns, specific entities, and concrete objects
        - Extract the MAIN subject/topic, not generic descriptors
        - Avoid generic modifiers like 'background', 'concept', 'teamwork'
        - Focus on what the slide is ABOUT, not what type of slide it is
        - Never exceed ~60 chars
        """
        try:
            text = f"{title or ''} \n {content or ''}"
            
            # Extended stop words - more aggressive filtering
            stop_words = {
                'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were',
                'been','being','have','has','had','do','does','did','will','would','could','should','may','might','must',
                'can','this','that','these','those','it','as','from','about','into','through','during','before','after',
                'above','below','between','under','over','please','make','apply','using','use','create','new','component',
                'replace','original','request','slide','context','maintaining','appropriate','style','styled','effect','effects',
                'section','chapter','overview','introduction','summary','agenda','goal','goals','objective','objectives',
                # Additional generic terms to filter out
                'presentation','background','concept','image','photo','visual','design','layout','professional','business',
                'corporate','modern','clean','simple','elegant','beautiful'
            }
            
            # Tokenize words, prioritize capitalized words (proper nouns)
            all_words = re.findall(r"[A-Z][A-Za-z\-']+|[a-z][a-z\-']+", text)
            
            # First pass: collect proper nouns (capitalized words not at sentence start)
            proper_nouns = []
            title_words_set = set((title or '').split())
            for i, word in enumerate(all_words):
                if word[0].isupper() and word.lower() not in stop_words:
                    # Skip if it's likely a sentence start
                    is_sentence_start = i == 0 or (i > 0 and all_words[i-1].endswith('.'))
                    # But include if it's in the title (likely important)
                    if not is_sentence_start or word in title_words_set:
                        if len(word) >= 3:
                            proper_nouns.append(word)
            
            # Second pass: collect meaningful common nouns from title
            title_keywords = []
            title_words = re.findall(r"[A-Za-z][A-Za-z\-']+", title or '')
            for w in title_words:
                wl = w.lower()
                if wl in stop_words:
                    continue
                if any(ch.isdigit() for ch in wl):
                    continue
                if len(wl) < 3:
                    continue
                # Skip overly generic terms
                if wl in {'thing','stuff','image','photo','picture','graphic','visual','data','information','slide','deck'}:
                    continue
                title_keywords.append(w)
            
            # Build query: prioritize proper nouns, then title keywords
            candidates = []
            
            # Add proper nouns first (most specific)
            for noun in proper_nouns[:2]:  # Max 2 proper nouns
                if noun not in candidates:
                    candidates.append(noun)
            
            # Add title keywords to fill out the query
            for kw in title_keywords:
                if len(candidates) >= 4:
                    break
                if kw not in candidates and kw.lower() not in [c.lower() for c in candidates]:
                    candidates.append(kw)
            
            # If we have very few candidates, extract from content too
            if len(candidates) < 2:
                content_words = re.findall(r"[A-Za-z][A-Za-z\-']+", content or '')
                for w in content_words:
                    wl = w.lower()
                    if wl in stop_words or len(wl) < 4:
                        continue
                    if wl not in [c.lower() for c in candidates]:
                        candidates.append(w)
                        if len(candidates) >= 3:
                            break
            
            # Build final query from candidates (no generic modifiers)
            query = ' '.join(candidates[:4])
            
            # Clamp and clean
            query = query.strip()
            if len(query) > 60:
                query = query[:60]
                
            # Fallback if empty - use first few words of title
            if not query:
                fallback_words = [w for w in (title or '').split() if len(w) > 3][:3]
                query = ' '.join(fallback_words) if fallback_words else 'abstract'
                
            return query
        except Exception:
            # Fallback to very simple extraction
            return self._simple_keyword_extraction(title or '', content or '')

    async def search_images(
        self,
        query: str,
        per_page: int = 10,
        page: int = 1,
        orientation: Optional[str] = None,  # landscape, portrait, square
        size: Optional[str] = None,  # large, medium, small
        color: Optional[str] = None,  # color filter
        locale: Optional[str] = None,  # not used for SerpAPI
    ) -> Dict[str, Any]:
        """Performs Google Images search using SerpAPI."""
        if not query or not self.is_available:
            return {"photos": [], "total_results": 0}

        # Clamp and sanitize query to avoid huge prompts
        query = (query or "").strip()
        if len(query) > 100:
            query = query[:100]
        # Build search parameters
        params = {
            "engine": "google",
            "q": query,
            "tbm": "isch",  # Image search
            "api_key": self.api_key,
            "num": min(per_page, 100),  # Increased limit
            "start": (page - 1) * per_page,
            "safe": "active",  # Safe search
            "ijn": page - 1  # Image page number
        }
        
        # Add image size filter
        if size == "large":
            params["imgsz"] = "l"
        elif size == "medium":
            params["imgsz"] = "m"
        elif size == "small":
            params["imgsz"] = "i"
        
        # Add aspect ratio filter
        if orientation == "landscape":
            params["imgar"] = "w"  # Wide
        elif orientation == "portrait":
            params["imgar"] = "t"  # Tall
        elif orientation == "square":
            params["imgar"] = "s"  # Square
        
        # Add color filter if specified
        if color:
            color_map = {
                'red': 'red', 'orange': 'orange', 'yellow': 'yellow', 
                'green': 'green', 'blue': 'blue', 'purple': 'purple',
                'pink': 'pink', 'brown': 'brown', 'black': 'black', 
                'gray': 'gray', 'grey': 'gray', 'white': 'white'
            }
            if color.lower() in color_map:
                params["imgcolor"] = color_map[color.lower()]

        try:
            # Use async HTTP request instead of synchronous GoogleSearch
            session = await self._get_session()
            
            # Build URL with params
            base_url = "https://serpapi.com/search.json"
            url = f"{base_url}?{urllib.parse.urlencode(params)}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    results = await response.json()
                    print(f"\n🔍 SERPAPI API RESPONSE for '{query}':")
                    print(f"  - Status: 200 OK")
                    print(f"  - Has images_results: {'images_results' in results}")
                    if 'images_results' in results:
                        print(f"  - Number of images_results: {len(results.get('images_results', []))}")
                    if 'error' in results:
                        print(f"  - API ERROR: {results.get('error')}")
                    return self._process_image_results(results)
                else:
                    error_text = await response.text()
                    print(f"SerpAPI HTTP error {response.status}: {error_text}")
                    return {"photos": [], "total_results": 0}
            
        except asyncio.TimeoutError:
            print(f"Timeout searching Google Images via SerpAPI ({query=})")
            return {"photos": [], "total_results": 0}
        except Exception as e:
            print(f"Error searching Google Images via SerpAPI ({query=}): {str(e)}")
            return {"photos": [], "total_results": 0}

    async def search_videos(
        self,
        query: str,
        per_page: int = 20,
        page: int = 1,
        duration: Optional[str] = None,  # short, medium, long
    ) -> Dict[str, Any]:
        """Performs Google Videos search using SerpAPI."""
        if not query or not self.is_available:
            return {"videos": [], "total_results": 0}

        # Build search parameters for video search
        params = {
            "engine": "google_videos",
            "q": query,
            "api_key": self.api_key,
            "num": min(per_page, 40),
            "start": (page - 1) * per_page,
        }
        
        # Add duration filter if specified
        if duration:
            duration_map = {
                'short': 'short',    # Under 4 minutes
                'medium': 'medium',  # 4-20 minutes
                'long': 'long'       # Over 20 minutes
            }
            if duration in duration_map:
                params["dur"] = duration_map[duration]

        try:
            search = GoogleSearch(params)
            results = search.get_dict()
            
            return self._process_video_results(results)
            
        except Exception as e:
            print(f"Error searching Google Videos via SerpAPI ({query=}): {str(e)}")
            return {"videos": [], "total_results": 0}

    async def search_gifs(
        self,
        query: str,
        per_page: int = 20,
        page: int = 1
    ) -> Dict[str, Any]:
        """Performs Google Images search for GIFs using SerpAPI."""
        if not query or not self.is_available:
            return {"photos": [], "total_results": 0}

        # Build search parameters for GIF search
        params = {
            "engine": "google",
            "q": f"{query} gif animated",  # Add gif and animated to query
            "tbm": "isch",  # Image search
            "api_key": self.api_key,
            "num": min(per_page, 100),
            "start": (page - 1) * per_page,
            "safe": "active",
            "ijn": page - 1,
            "tbs": "itp:animated"  # Filter for animated images (GIFs)
        }

        try:
            # Use async HTTP request
            session = await self._get_session()
            
            # Build URL with params
            base_url = "https://serpapi.com/search.json"
            url = f"{base_url}?{urllib.parse.urlencode(params)}"
            
            async with session.get(url) as response:
                if response.status == 200:
                    results = await response.json()
                    # Process as images but filter for GIFs
                    processed = self._process_image_results(results)
                else:
                    return {"photos": [], "total_results": 0}
            
            # Additional filtering to ensure we're getting GIFs
            gif_photos = []
            for photo in processed.get('photos', []):
                # Check if URL ends with .gif or contains gif in the URL
                url = photo.get('url', '').lower()
                if '.gif' in url or 'gif' in url:
                    gif_photos.append(photo)
                # Also include results that were found with the animated filter
                elif photo.get('serpapi_data', {}).get('is_product', False) == False:
                    gif_photos.append(photo)
            
            processed['photos'] = gif_photos
            processed['total_results'] = len(gif_photos)
            
            return processed
            
        except Exception as e:
            print(f"Error searching Google GIFs via SerpAPI ({query=}): {str(e)}")
            return {"photos": [], "total_results": 0}

    async def search_images_for_slide(
        self,
        slide_content: str,
        slide_title: str,
        slide_type: str,
        style_preferences: Optional[Dict[str, Any]] = None,
        num_images: int = 6,  # Increased from 3
        search_query: Optional[str] = None  # Allow passing in pre-generated query
    ) -> List[Dict[str, Any]]:
        """Search for images appropriate for a specific slide with retry logic."""
        
        # Use provided search query or fall back to simple extraction
        if not search_query:
            # Build a higher-quality query from slide signals
            search_query = self._build_query_from_slide(slide_title, slide_content, slide_type, style_preferences)
        
        print(f"Searching Google Images for: '{search_query}' (slide: {slide_title})")
        
        # Search for more images than requested to account for filtering
        results = await self.search_images(
            query=search_query,
            per_page=num_images * 4,  # Request 4x to account for invalid images
            orientation='landscape' if slide_type in ['title', 'closing'] else None
        )
        
        # If we don't get enough results, try a broader search
        if len(results.get('photos', [])) < num_images * 2:
            # Try without orientation restriction
            print(f"Expanding search without orientation filter...")
            additional_results = await self.search_images(
                query=search_query,
                per_page=num_images * 3
            )
            # Combine results, avoiding duplicates
            existing_urls = {img.get('url') for img in results.get('photos', [])}
            for img in additional_results.get('photos', []):
                if img.get('url') not in existing_urls:
                    results['photos'].append(img)
        
        # Validate images to filter out inaccessible ones
        all_images = results.get('photos', [])
        if all_images:
            print(f"Validating {len(all_images)} images for accessibility...")
            valid_images = await ImageValidator.filter_valid_images(all_images)
            print(f"Found {len(valid_images)} accessible images out of {len(all_images)}")
            
            # If we still don't have enough, try alternative search strategies
            if len(valid_images) < num_images:
                print(f"Need more images, trying alternative search strategies...")
                
                # Strategy 2: Try with different variations
                search_variations = [
                    f"{search_query} photo",
                    f"{search_query} illustration",
                    f"{search_query} concept",
                    self._simple_keyword_extraction(slide_title, slide_content),  # Fallback extraction
                    slide_title.split()[-1] if slide_title else "image"  # Last word of title
                ]
                
                for variation in search_variations:
                    if len(valid_images) >= num_images:
                        break
                        
                    if variation and variation != search_query:
                        print(f"Trying search variation: '{variation}'")
                        fallback_results = await self.search_images(
                            query=variation,
                            per_page=num_images * 2
                        )
                        fallback_images = await ImageValidator.filter_valid_images(
                            fallback_results.get('photos', [])
                        )
                        
                        # Add unique fallback images
                        existing_urls = {img.get('url') for img in valid_images}
                        for img in fallback_images:
                            if img.get('url') not in existing_urls:
                                valid_images.append(img)
                                if len(valid_images) >= num_images * 2:  # Stop at 2x requested
                                    break
            
            # If still not enough images, that's okay - better to have fewer specific images
            # than generic stock photos that don't relate to the content
            if len(valid_images) < num_images // 2:
                print(f"Only found {len(valid_images)} images for '{search_query}' - better than generic stock photos")
            
            return valid_images[:num_images]
        
        return []

    def _process_image_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Processes raw SerpAPI Google Images results into a structured format."""
        photos = []
        images_results = data.get('images_results', [])
        
        for idx, image_data in enumerate(images_results):
            # Extract image information
            original_url = image_data.get('original')
            thumbnail_url = image_data.get('thumbnail')
            title = image_data.get('title', 'Google Images result')
            source = image_data.get('source', 'Unknown source')
            link = image_data.get('link', '')
            
            # Skip if no usable image URL
            if not original_url:
                continue
            
            processed_photo = {
                'id': f'serpapi_{idx}_{hash(original_url) % 10000}',
                'photographer': source,
                'photographer_url': link,
                'page_url': link,
                'url': original_url,
                'alt': title,
                'width': image_data.get('original_width'),
                'height': image_data.get('original_height'),
                'src': {
                    'original': original_url,
                    'large': original_url,
                    'medium': thumbnail_url or original_url,
                    'small': thumbnail_url or original_url,
                    'thumbnail': thumbnail_url or original_url
                },
                'source': 'google_images',
                'serpapi_data': image_data  # Keep original data for reference
            }
            
            photos.append(processed_photo)
        
        return {
            'photos': photos,
            'total_results': len(photos),
            'page': 1,
            'per_page': len(photos),
            'search_information': data.get('search_information', {})
        }

    def _process_video_results(self, data: Dict[str, Any]) -> Dict[str, Any]:
        """Processes raw SerpAPI Google Videos results into a structured format."""
        videos = []
        video_results = data.get('video_results', [])
        
        for idx, video_data in enumerate(video_results):
            # Extract video information
            link = video_data.get('link', '')
            title = video_data.get('title', 'Untitled Video')
            thumbnail = video_data.get('thumbnail', '')
            duration = video_data.get('duration', '')
            source = video_data.get('source', 'Unknown')
            date = video_data.get('date', '')
            
            processed_video = {
                'id': f'serpapi_video_{idx}_{hash(link) % 10000}',
                'title': title,
                'link': link,
                'thumbnail': thumbnail,
                'duration': duration,
                'source': source,
                'date': date,
                'type': 'video'
            }
            
            videos.append(processed_video)
        
        return {
            'videos': videos,
            'total_results': len(videos),
            'page': 1,
            'per_page': len(videos),
            'search_information': data.get('search_information', {})
        }

    def _slide_needs_images(self, slide: Any, index: int) -> bool:
        """Determines if a slide is likely to benefit from an image."""
        title_lower = (slide.title or "").lower()
        content_lower = (slide.content or "").lower()
        
        # Always search images for title slides
        if index == 0:
            return True
            
        # Closing slides often benefit from images
        if any(term in title_lower for term in ['thank', 'question', 'q&a', 'conclusion']):
            return True
            
        # Skip data/chart slides - they have their own visuals
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return False
            
        # Skip highly technical or process slides
        if any(term in title_lower for term in ['architecture', 'workflow', 'process', 'diagram', 'flowchart', 'timeline']):
            return False
            
        # Skip agenda/outline slides - usually better with clean typography
        if any(term in title_lower for term in ['agenda', 'outline', 'contents', 'overview', 'objectives']):
            return False
            
        # For other slides, only search if they have substantial content
        # that might benefit from visual support
        if len(slide.content or "") > 100:
            return True
            
        return False

    def _determine_slide_type(self, slide: Any, index: int) -> str:
        """Determines a general type for a slide for image search context."""
        title_lower = (slide.title or "").lower()
        if index == 0 or 'title' in title_lower or 'welcome' in title_lower or 'introduction' in title_lower:
            return 'title'
        if hasattr(slide, 'extractedData') and slide.extractedData:
            return 'data'
        if any(term in title_lower for term in ['thank', 'question', 'q&a', 'contact', 'conclusion']):
            return 'closing'
        if any(term in title_lower for term in ['agenda', 'outline', 'contents', 'summary']):
            return 'summary'
        return 'content' # Default type

    async def search_images_for_deck(
        self,
        deck_outline: Any,
        palette: Optional[Dict[str, Any]] = None,
        max_images_per_slide: int = 6  # Increased from 3
    ) -> Dict[str, List[Dict[str, Any]]]:
        """Searches images for all slides in a deck outline."""
        images_by_slide: Dict[str, List[Dict[str, Any]]] = {}

        for i, slide in enumerate(deck_outline.slides):
            if self._slide_needs_images(slide, i):
                slide_images_data = await self.search_images_for_slide(
                    slide_content=slide.content or "",
                    slide_title=slide.title or f"Slide {i+1}",
                    slide_type=self._determine_slide_type(slide, i),
                    style_preferences=deck_outline.stylePreferences.model_dump() if deck_outline.stylePreferences else None,
                    num_images=max_images_per_slide
                )
                images_by_slide[slide.id] = slide_images_data
        
        return images_by_slide 