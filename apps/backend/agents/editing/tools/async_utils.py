"""Async helpers for running coroutines from sync contexts."""

from typing import Any


def run_async(coro: Any) -> Any:
    """Run async coroutine from sync context, handling active event loops."""
    import asyncio

    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)
