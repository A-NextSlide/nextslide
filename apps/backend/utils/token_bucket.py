import time
import asyncio
from threading import RLock

class TokenBucket:
    def __init__(self, tokens: int, time_unit: int):
        self.tokens = tokens
        self.max_tokens = tokens  # Store the max/initial tokens
        self.time_unit = time_unit
        self.generated_at = time.time()
        self.lock = RLock()

    async def __call__(self):
        # Calculate sleep time inside lock, but sleep outside
        sleep_time = 0
        
        with self.lock:
            now = time.time()
            time_since_generation = now - self.generated_at

            # Calculate new tokens based on max rate, not current tokens
            new_tokens = time_since_generation * self.max_tokens / self.time_unit

            if new_tokens >= 1:
                self.tokens = min(self.tokens + int(new_tokens), self.max_tokens)
                self.generated_at = now

            if self.tokens >= 1:
                self.tokens -= 1
            else:
                # Sleep time = time needed to generate 1 token
                # Rate is max_tokens per time_unit, so time per token is time_unit/max_tokens
                sleep_time = (1 - self.tokens) * self.time_unit / self.max_tokens
        
        # Sleep outside the lock to avoid blocking
        if sleep_time > 0:
            await asyncio.sleep(sleep_time) 