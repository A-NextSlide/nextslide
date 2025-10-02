"""
Deck persistence layer - handles all database operations and caching.
"""
import asyncio
import copy
import logging
from typing import Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor
from utils.supabase import get_deck, upload_deck


class DeckPersistence:
    """Handles deck storage with caching and retry logic."""
    _instance = None
    
    def __new__(cls):
        if cls._instance is None:
            cls._instance = super(DeckPersistence, cls).__new__(cls)
            # Initialize instance attributes here
            cls._instance._deck_cache = {}
            cls._instance._deck_locks = {}
            cls._instance._update_lock = asyncio.Lock()
            cls._instance._decks_in_composition = set()
            cls._instance._last_save_times = {}  # Track last save time per deck
            cls._instance._save_interval = 2.0  # Minimum seconds between saves
            cls._instance.user_id = None  # Store user ID for current session
        return cls._instance
    
    def get_lock(self, deck_uuid: str) -> asyncio.Lock:
        """Get or create a lock for a specific deck."""
        if deck_uuid not in self._deck_locks:
            self._deck_locks[deck_uuid] = asyncio.Lock()
        return self._deck_locks[deck_uuid]
    
    def start_composition(self, deck_uuid: str):
        """Mark a deck as being composed to use cache-first approach."""
        self._decks_in_composition.add(deck_uuid)
    
    def end_composition(self, deck_uuid: str):
        """Mark a deck composition as complete."""
        self._decks_in_composition.discard(deck_uuid)
    
    def set_user_id(self, user_id: str):
        """Set the user ID for the current session."""
        self.user_id = user_id
    
    async def get_deck_with_retry(self, deck_uuid: str, max_retries: int = 3, force_db: bool = False) -> Optional[Dict[str, Any]]:
        """Get deck from database with retry logic and cache fallback.
        
        Args:
            deck_uuid: UUID of the deck
            max_retries: Number of retries for database fetch
            force_db: If True, always fetch from database even if in composition mode
        """
        # If deck is being composed and not forcing DB read, use cache to avoid race conditions
        if not force_db and deck_uuid in self._decks_in_composition:
            if deck_uuid in self._deck_cache:
                return copy.deepcopy(self._deck_cache[deck_uuid])
            else:
                # Cache miss during composition is a problem - we need to initialize from DB
                # Run synchronous get_deck in executor
                import asyncio
                from concurrent.futures import ThreadPoolExecutor
                
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                    
                if deck:
                    self._deck_cache[deck_uuid] = copy.deepcopy(deck)
                    return deck
                return None
        
        # Try database first
        for attempt in range(max_retries):
            try:
                # Run synchronous get_deck in executor
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                if deck:
                    # Update cache on successful fetch
                    self._deck_cache[deck_uuid] = copy.deepcopy(deck)
                    return deck
                
                if attempt < max_retries - 1:
                    await asyncio.sleep(0.5 * (attempt + 1))
            except Exception:
                if attempt < max_retries - 1:
                    await asyncio.sleep(1.0 * (attempt + 1))
        
        # Fall back to cache if available
        if deck_uuid in self._deck_cache:
            return copy.deepcopy(self._deck_cache[deck_uuid])
        
        return None
    
    async def save_deck(self, deck_uuid: str, deck_data: Dict[str, Any]) -> bool:
        """Save deck to database and update cache."""
        return await self.save_deck_with_user(deck_uuid, deck_data, None)
    
    async def save_deck_with_user(self, deck_uuid: str, deck_data: Dict[str, Any], user_id: Optional[str] = None) -> bool:
        """Save deck to database with optional user ID."""
        try:
            # Update cache first - this is the source of truth during composition
            self._deck_cache[deck_uuid] = copy.deepcopy(deck_data)
            
            # Check if we should throttle this save
            if self.should_throttle_save(deck_uuid):
                logger = logging.getLogger(__name__)
                logger.debug(f"Throttling save for deck {deck_uuid} - too frequent updates")
                return True  # Return success but skip actual save
            
            # Preserve theme data
            if 'data' in deck_data and isinstance(deck_data['data'], dict):
                if 'theme' in deck_data['data']:
                    deck_data['theme'] = deck_data['data']['theme']
                if 'style_spec' in deck_data['data']:
                    deck_data['style_spec'] = deck_data['data']['style_spec']
            
            # Upload to database with user_id (run in executor to avoid blocking)
            import asyncio
            from concurrent.futures import ThreadPoolExecutor
            
            with ThreadPoolExecutor(max_workers=1) as executor:
                loop = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    executor,
                    upload_deck,
                    deck_data,
                    deck_uuid,
                    user_id
                )
            self.update_save_time(deck_uuid)
            
            if result is not None:
                return True
            else:
                return False
            
        except Exception as e:
            logging.getLogger(__name__).warning(f"Failed to save deck {deck_uuid}: {e}")
            return False
    
    async def update_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any], force_immediate: bool = False) -> bool:
        """Update a single slide in the deck."""
        # Log what we're updating
        import logging
        logger = logging.getLogger(__name__)
        
        component_count = len(slide_data.get("components", []))
        has_visual_fixes = slide_data.get("_visual_fixes_saved", False)
        logger.info(f"📝 Updating slide {slide_index + 1} for deck {deck_uuid}: {component_count} components, visual_fixes={has_visual_fixes}, force_immediate={force_immediate}")
        
        # Log component details for debugging
        if has_visual_fixes:
            for comp in slide_data.get("components", [])[:3]:  # First 3 components
                comp_id = comp.get("id", "unknown")
                comp_type = comp.get("type", "unknown")
                props = comp.get("props", {})
                logger.debug(f"  Component {comp_id} ({comp_type}): pos={props.get('position')}, fontSize={props.get('fontSize')}")
        
        # SIMPLIFIED: Always save immediately to prevent flickering
        # The slide_data already contains visual fixes if they were applied
        # If force_immediate is True, skip any throttling
        if force_immediate:
            logger.info(f"🚀 Force immediate update for slide {slide_index + 1}")
            # Temporarily clear throttle for this deck
            if deck_uuid in self._last_save_times:
                del self._last_save_times[deck_uuid]
        
        return await self._do_update_slide(deck_uuid, slide_index, slide_data)
    
    async def update_slide_with_user(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any], user_id: Optional[str] = None, force_immediate: bool = False) -> bool:
        """Update a single slide and ensure deck has user_id."""
        # First update the slide
        result = await self.update_slide(deck_uuid, slide_index, slide_data, force_immediate=force_immediate)
        
        # Then ensure deck has user_id if provided and not already set
        if result and user_id:
            import logging as _logging
            try:
                from utils.supabase import get_supabase_client
                supabase = get_supabase_client()
                
                # Check if deck already has user_id (run in executor to avoid blocking)
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    deck_check = await loop.run_in_executor(
                        executor,
                        lambda: supabase.table("decks").select("user_id").eq("uuid", deck_uuid).single().execute()
                    )
                    
                    if deck_check.data and not deck_check.data.get('user_id'):
                        # Update deck with user_id
                        await loop.run_in_executor(
                            executor,
                            lambda: supabase.table("decks").update({"user_id": user_id}).eq("uuid", deck_uuid).execute()
                        )
                    _logging.getLogger(__name__).info(f"Updated deck {deck_uuid} with user_id {user_id} during slide update")
            except Exception as e:
                _logging.getLogger(__name__).warning(f"Failed to update deck user_id during slide update: {e}")
        
        return result
    
    async def _do_update_slide(self, deck_uuid: str, slide_index: int, slide_data: Dict[str, Any]) -> bool:
        """Actually perform the slide update (internal method)."""
        import logging
        logger = logging.getLogger(__name__)
        
        logger.info(f"[PERSISTENCE] _do_update_slide called for deck {deck_uuid}, slide {slide_index}")
        logger.info(f"[PERSISTENCE] Slide data has {len(slide_data.get('components', []))} components")
        
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"[PERSISTENCE] _do_update_slide details:")
            logger.debug(f"  - Deck UUID: {deck_uuid}")
            logger.debug(f"  - Slide index: {slide_index}")
            logger.debug(f"  - Components in slide_data: {len(slide_data.get('components', []))}")
            if slide_data.get('components'):
                logger.debug(f"  - First component type: {slide_data['components'][0].get('type', 'unknown')}")
        
        # Use per-deck lock instead of global lock to allow parallel updates
        deck_lock = self._deck_locks.get(deck_uuid)
        if not deck_lock:
            deck_lock = asyncio.Lock()
            self._deck_locks[deck_uuid] = deck_lock
            
        async with deck_lock:
            # CRITICAL: During composition, cache is the source of truth
            if deck_uuid in self._decks_in_composition:
                # Get from cache first - it has the latest updates
                deck = self._deck_cache.get(deck_uuid)
                if not deck:
                    # Emergency fetch from database
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        loop = asyncio.get_event_loop()
                        deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                    if deck:
                        self._deck_cache[deck_uuid] = copy.deepcopy(deck)
                    else:
                        return False
                else:
                    # Make a copy to avoid mutations affecting cache
                    deck = copy.deepcopy(deck)
            else:
                # Not in composition - get from database
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                if not deck:
                    return False
                deck = copy.deepcopy(deck)
            
            # Update the specific slide
            slides = deck.get('slides', [])
            if slide_index < 0 or slide_index >= len(slides):
                return False
            
            # Update the slide
            slides[slide_index] = slide_data
            # Debug: print first Background and a couple of text components
            try:
                import logging as _logging
                bg = next((c for c in (slide_data.get('components') or []) if c.get('type') == 'Background'), None)
                texts = [c for c in (slide_data.get('components') or []) if c.get('type') in ['TextBlock','TiptapTextBlock','Title']][:2]
                _logging.getLogger(__name__).info(
                    "[PERSISTENCE] Slide %s background=%s text0=%s text1=%s",
                    slide_index,
                    (bg.get('props') if isinstance(bg, dict) else None),
                    (texts[0].get('props') if len(texts)>0 and isinstance(texts[0], dict) else None),
                    (texts[1].get('props') if len(texts)>1 and isinstance(texts[1], dict) else None),
                )
            except Exception:
                pass
            logger.info(f"[PERSISTENCE] Updated slide {slide_index} in deck, now has {len(slide_data.get('components', []))} components")
            
            # Update cache FIRST - this ensures other parallel updates see the latest data
            self._deck_cache[deck_uuid] = copy.deepcopy(deck)
            logger.info(f"[PERSISTENCE] Updated deck cache for {deck_uuid}")
            
            # Then save to database
            try:
                # Don't move theme/style_spec - keep them at root level
                # The upload_deck function should handle the structure as-is
                
                # IMPORTANT: Update timestamp and version for realtime
                from datetime import datetime
                import uuid
                deck['last_modified'] = datetime.utcnow().isoformat()
                deck['version'] = str(uuid.uuid4())
                
                # Log for debugging
                logger.info(f"Setting last_modified to {deck['last_modified']} for realtime update")
                
                # Run upload_deck in executor
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    await loop.run_in_executor(executor, upload_deck, deck, deck_uuid)
                logger.info(f"[PERSISTENCE] Successfully uploaded deck {deck_uuid} to database")
                
                # Verify the update
                with ThreadPoolExecutor(max_workers=1) as executor:
                    loop = asyncio.get_event_loop()
                    verify_deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                if verify_deck and verify_deck.get('slides') and slide_index < len(verify_deck['slides']):
                    verify_components = len(verify_deck['slides'][slide_index].get('components', []))
                    logger.info(f"[PERSISTENCE] Verification: Slide {slide_index} in DB now has {verify_components} components")
                    print(f"🔍 [PERSISTENCE] VERIFICATION:")
                    print(f"  - Slide {slide_index} in database has {verify_components} components")
                    if verify_components == 0:
                        print(f"  ❌ WARNING: Components were not saved to database!")
                        print(f"  - Expected: {len(slide_data.get('components', []))} components")
                else:
                    print(f"❌ [PERSISTENCE] Could not verify update!")
                
                return True
            except Exception:
                # Revert cache on failure
                if deck_uuid in self._decks_in_composition:
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        loop = asyncio.get_event_loop()
                        old_deck = await loop.run_in_executor(executor, get_deck, deck_uuid)
                    if old_deck:
                        self._deck_cache[deck_uuid] = copy.deepcopy(old_deck)
                return False
    
    def cache_deck(self, deck_uuid: str, deck_data: Dict[str, Any]):
        """Cache deck data locally."""
        self._deck_cache[deck_uuid] = copy.deepcopy(deck_data) 

    def should_throttle_save(self, deck_uuid: str) -> bool:
        """Check if we should throttle this save to prevent excessive updates."""
        import time
        current_time = time.time()
        last_save = self._last_save_times.get(deck_uuid, 0)
        
        # If deck is in composition and we saved recently, throttle
        if deck_uuid in self._decks_in_composition:
            if current_time - last_save < self._save_interval:
                return True
        
        return False
    
    def update_save_time(self, deck_uuid: str):
        """Update the last save time for a deck."""
        import time
        self._last_save_times[deck_uuid] = time.time() 