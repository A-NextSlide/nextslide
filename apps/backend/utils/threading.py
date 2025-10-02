import asyncio

# Function to run CPU-bound tasks in a separate thread
async def run_in_threadpool(thread_pool, func, *args, **kwargs):
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(thread_pool, lambda: func(*args, **kwargs))

