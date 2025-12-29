"""
Background task utilities for proper error handling.

Fire-and-forget tasks that don't log errors make debugging impossible.
This module provides safe wrappers that ensure errors are logged.
"""
import asyncio
import logging
from typing import Coroutine, Any, Optional, Callable
from functools import wraps

logger = logging.getLogger(__name__)


def create_background_task(
    coro: Coroutine[Any, Any, Any],
    name: Optional[str] = None,
    on_error: Optional[Callable[[Exception], None]] = None
) -> asyncio.Task:
    """
    Create a background task with proper error handling.

    Unlike bare asyncio.create_task(), this wrapper ensures that:
    1. Errors are logged to the console and Sentry
    2. The task has a name for debugging
    3. Optional error callback can be provided

    Usage:
        # Instead of:
        asyncio.create_task(my_async_function())

        # Use:
        create_background_task(my_async_function(), name="my_task")

    Args:
        coro: The coroutine to run
        name: Optional name for the task (for debugging)
        on_error: Optional callback to run on error

    Returns:
        The created asyncio.Task
    """
    async def wrapped():
        try:
            return await coro
        except asyncio.CancelledError:
            # Task was cancelled, this is expected
            logger.debug(f"Background task '{name}' was cancelled")
            raise
        except Exception as e:
            # Log the error with full context
            logger.error(
                f"Background task '{name or 'unnamed'}' failed: {e}",
                exc_info=True
            )
            # Call error callback if provided
            if on_error:
                try:
                    on_error(e)
                except Exception as callback_err:
                    logger.error(f"Error callback failed: {callback_err}")
            # Don't re-raise - this is fire-and-forget

    task = asyncio.create_task(wrapped(), name=name)
    return task


def background_task(name: Optional[str] = None):
    """
    Decorator for async functions that should run as background tasks.

    Usage:
        @background_task(name="process_webhook")
        async def process_webhook(data):
            ...

        # Then call it like a regular function (returns immediately)
        process_webhook(data)
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            coro = func(*args, **kwargs)
            return create_background_task(coro, name=name or func.__name__)
        return wrapper
    return decorator
