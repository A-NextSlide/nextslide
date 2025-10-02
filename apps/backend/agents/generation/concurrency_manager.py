"""
Production concurrency management for multi-user slide generation.
"""

from typing import Dict, Optional, Any
import asyncio
from collections import defaultdict
import time
from datetime import datetime
from setup_logging_optimized import get_logger
from agents import config

logger = get_logger(__name__)


class RateLimiter:
    """Simple rate limiter for API calls."""
    
    def __init__(self, calls_per_minute: int = 60, calls_per_hour: int = 1000):
        self.calls_per_minute = calls_per_minute
        self.calls_per_hour = calls_per_hour
        self.minute_calls = []
        self.hour_calls = []
        self.lock = asyncio.Lock()
    
    async def acquire(self):
        """Wait if necessary to respect rate limits."""
        async with self.lock:
            now = time.time()
            
            # Clean old calls
            self.minute_calls = [t for t in self.minute_calls if now - t < 60]
            self.hour_calls = [t for t in self.hour_calls if now - t < 3600]
            
            # Check minute limit
            if len(self.minute_calls) >= self.calls_per_minute:
                wait_time = 60 - (now - self.minute_calls[0])
                if wait_time > 0:
                    logger.warning(f"Rate limit reached, waiting {wait_time:.1f}s")
                    await asyncio.sleep(wait_time)
            
            # Check hour limit
            if len(self.hour_calls) >= self.calls_per_hour:
                wait_time = 3600 - (now - self.hour_calls[0])
                if wait_time > 0:
                    logger.warning(f"Hourly rate limit reached, waiting {wait_time:.1f}s")
                    await asyncio.sleep(wait_time)
            
            # Record call
            self.minute_calls.append(now)
            self.hour_calls.append(now)


class ConcurrencyManager:
    """Manages system-wide and per-user concurrency limits."""
    
    def __init__(
        self,
        max_global_slides: int = None,
        max_api_calls: int = None,
        max_per_user: int = None,
        calls_per_minute: int = None,
        calls_per_hour: int = None
    ):
        # Use config values if not provided
        max_global_slides = max_global_slides or config.MAX_GLOBAL_CONCURRENT_SLIDES
        max_api_calls = max_api_calls or config.MAX_API_CONCURRENT_CALLS
        max_per_user = max_per_user or config.MAX_SLIDES_PER_USER
        calls_per_minute = calls_per_minute or config.API_CALLS_PER_MINUTE
        calls_per_hour = calls_per_hour or config.API_CALLS_PER_HOUR
        
        # Global limits
        self.global_semaphore = asyncio.Semaphore(max_global_slides)
        self.api_semaphore = asyncio.Semaphore(max_api_calls)
        
        # Per-user tracking
        self.user_tasks: Dict[str, set] = defaultdict(set)
        self.user_semaphores: Dict[str, asyncio.Semaphore] = {}
        self.max_per_user = max_per_user
        
        # Rate limiting
        self.rate_limiter = RateLimiter(calls_per_minute, calls_per_hour)
        
        # Stats
        self.stats = {
            'total_requests': 0,
            'active_users': 0,
            'active_tasks': 0,
            'rejected_requests': 0,
            'completed_requests': 0
        }
        
        # Task tracking for background continuation
        self.active_generations: Dict[str, Dict[str, Any]] = {}
        
        # Global deck locks to prevent duplicate generation
        self._deck_locks: Dict[str, asyncio.Lock] = {}
        self._decks_in_generation: set = set()
        
        logger.info(
            f"Initialized ConcurrencyManager: "
            f"global={max_global_slides}, api={max_api_calls}, "
            f"per_user={max_per_user}, rate={calls_per_minute}/min"
        )
    
    def is_deck_generating(self, deck_uuid: str) -> bool:
        """Check if a deck is currently being generated."""
        return deck_uuid in self._decks_in_generation
    
    async def acquire_deck_lock(self, deck_uuid: str) -> bool:
        """
        Try to acquire exclusive lock for deck generation.
        Returns True if acquired, False if deck is already being generated.
        """
        # Check if deck is already being generated
        if deck_uuid in self._decks_in_generation:
            logger.warning(f"Deck {deck_uuid} is already being generated")
            return False
        
        # Create lock if doesn't exist
        if deck_uuid not in self._deck_locks:
            self._deck_locks[deck_uuid] = asyncio.Lock()
        
        # Check if lock is already held
        lock = self._deck_locks[deck_uuid]
        if lock.locked():
            logger.warning(f"Deck {deck_uuid} lock is already held")
            return False
        
        # Try to acquire lock
        try:
            # Use wait_for with a very short timeout to simulate non-blocking
            await asyncio.wait_for(lock.acquire(), timeout=0.001)
            self._decks_in_generation.add(deck_uuid)
            logger.info(f"Acquired global lock for deck {deck_uuid}")
            return True
        except asyncio.TimeoutError:
            logger.warning(f"Could not acquire lock for deck {deck_uuid} - already locked")
            return False
    
    def release_deck_lock(self, deck_uuid: str):
        """Release the deck generation lock."""
        if deck_uuid in self._deck_locks and self._deck_locks[deck_uuid].locked():
            self._deck_locks[deck_uuid].release()
            self._decks_in_generation.discard(deck_uuid)
            logger.info(f"Released global lock for deck {deck_uuid}")
    
    async def acquire_for_user(self, user_id: str, task_id: str) -> bool:
        """
        Acquire permission to generate for a user.
        Returns True if acquired, False if user has too many active tasks.
        """
        # Check if user already has too many tasks
        if len(self.user_tasks[user_id]) >= self.max_per_user:
            logger.warning(f"User {user_id} has too many active tasks")
            self.stats['rejected_requests'] += 1
            return False
        
        # Get or create user semaphore
        if user_id not in self.user_semaphores:
            self.user_semaphores[user_id] = asyncio.Semaphore(self.max_per_user)
        
        # Track active task
        self.user_tasks[user_id].add(task_id)
        self.stats['total_requests'] += 1
        self.stats['active_users'] = len(self.user_tasks)
        self.stats['active_tasks'] = sum(len(tasks) for tasks in self.user_tasks.values())
        
        # Store generation info for background tracking
        self.active_generations[task_id] = {
            'user_id': user_id,
            'started_at': time.time(),
            'status': 'acquiring'
        }
        
        # Acquire all necessary resources
        try:
            await self.global_semaphore.acquire()
            await self.user_semaphores[user_id].acquire()
            await self.api_semaphore.acquire()
            await self.rate_limiter.acquire()
            
            self.active_generations[task_id]['status'] = 'running'
            logger.info(f"Acquired resources for user {user_id}, task {task_id}")
            return True
            
        except Exception as e:
            # Release on error
            self.user_tasks[user_id].discard(task_id)
            self.active_generations.pop(task_id, None)
            logger.error(f"Failed to acquire resources: {e}")
            raise
    
    async def release_for_user(self, user_id: str, task_id: str):
        """Release resources after generation."""
        self.user_tasks[user_id].discard(task_id)
        
        # Clean up if user has no active tasks
        if not self.user_tasks[user_id]:
            self.user_tasks.pop(user_id, None)
        
        # Update stats
        self.stats['active_users'] = len(self.user_tasks)
        self.stats['active_tasks'] = sum(len(tasks) for tasks in self.user_tasks.values())
        self.stats['completed_requests'] += 1
        
        # Update generation status
        if task_id in self.active_generations:
            self.active_generations[task_id]['status'] = 'completed'
            self.active_generations[task_id]['completed_at'] = time.time()
        
        # Release semaphores
        self.global_semaphore.release()
        self.api_semaphore.release()
        if user_id in self.user_semaphores:
            self.user_semaphores[user_id].release()
        
        logger.info(f"Released resources for user {user_id}, task {task_id}")
        
        # Clean up old completed generations if configured
        if config.CLEANUP_COMPLETED_AFTER > 0:
            await self._cleanup_old_generations()
    
    async def _cleanup_old_generations(self):
        """Clean up old completed generations."""
        now = time.time()
        to_remove = []
        
        for task_id, info in self.active_generations.items():
            if (info['status'] == 'completed' and 
                'completed_at' in info and 
                now - info['completed_at'] > config.CLEANUP_COMPLETED_AFTER):
                to_remove.append(task_id)
        
        for task_id in to_remove:
            self.active_generations.pop(task_id, None)
        
        if to_remove:
            logger.info(f"Cleaned up {len(to_remove)} old completed generations")
    
    def get_user_active_count(self, user_id: str) -> int:
        """Get number of active tasks for a user."""
        return len(self.user_tasks.get(user_id, set()))
    
    def get_user_active_decks(self, user_id: str) -> int:
        """Get number of active deck generations for a user."""
        # Count unique deck generations (not individual slides)
        deck_tasks = set()
        for task_id in self.user_tasks.get(user_id, set()):
            # Extract deck ID from task ID (format: generation_id_deck or generation_id_slide_N)
            parts = task_id.split('_')
            if len(parts) >= 2:
                deck_id = f"{parts[0]}_{parts[1]}"
                deck_tasks.add(deck_id)
        return len(deck_tasks)
    
    def get_stats(self) -> dict:
        """Get current concurrency stats."""
        return {
            **self.stats,
            'active_generations': len([
                g for g in self.active_generations.values() 
                if g['status'] == 'running'
            ]),
            'timestamp': datetime.utcnow().isoformat()
        }


# Global instance for the application
concurrency_manager = ConcurrencyManager() 