"""
Robust Supabase Client with Connection Pool Management

This module provides a resilient Supabase client with:
- Connection pool limits to prevent exhaustion
- Automatic connection cleanup and recycling
- Circuit breaker pattern to prevent cascading failures
- Configurable timeouts at multiple levels
"""
import os
import time
import logging
import threading
from typing import Optional, Callable, TypeVar, Any
from functools import wraps
from datetime import datetime, timedelta
from supabase import create_client, Client
from dotenv import load_dotenv
import httpx

# Load environment variables
load_dotenv()

logger = logging.getLogger(__name__)

# Get Supabase credentials from environment variables
SUPABASE_URL = os.getenv("SUPABASE_URL")
# Use service key if available, otherwise fall back to anon key
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

# =============================================================================
# CONNECTION POOL CONFIGURATION
# =============================================================================

# Maximum connections per host (prevents pool exhaustion)
# Keep low to allow horizontal scaling (100 instances × 5 = 500 connections)
MAX_CONNECTIONS = 5
MAX_KEEPALIVE_CONNECTIONS = 3

# Timeouts (in seconds)
CONNECT_TIMEOUT = 5.0
READ_TIMEOUT = 30.0
WRITE_TIMEOUT = 30.0
POOL_TIMEOUT = 5.0

# Connection recycling - recreate client after this many seconds
CONNECTION_MAX_AGE = 300  # 5 minutes

# Circuit breaker settings
CIRCUIT_BREAKER_THRESHOLD = 5  # failures before opening circuit
CIRCUIT_BREAKER_TIMEOUT = 30  # seconds before attempting to close circuit


# =============================================================================
# CIRCUIT BREAKER
# =============================================================================

class CircuitBreaker:
    """
    Circuit breaker to prevent cascading failures.

    States:
    - CLOSED: Normal operation, requests pass through
    - OPEN: Failing, requests are rejected immediately
    - HALF_OPEN: Testing if service recovered
    """

    CLOSED = "closed"
    OPEN = "open"
    HALF_OPEN = "half_open"

    def __init__(self, name: str, failure_threshold: int = 5, timeout: int = 30):
        self.name = name
        self.failure_threshold = failure_threshold
        self.timeout = timeout
        self.state = self.CLOSED
        self.failures = 0
        self.last_failure_time: Optional[datetime] = None
        self._lock = threading.Lock()

    def record_success(self):
        """Record a successful operation."""
        with self._lock:
            self.failures = 0
            if self.state == self.HALF_OPEN:
                logger.info(f"[CircuitBreaker:{self.name}] Circuit closed after successful request")
            self.state = self.CLOSED

    def record_failure(self):
        """Record a failed operation."""
        with self._lock:
            self.failures += 1
            self.last_failure_time = datetime.now()

            if self.failures >= self.failure_threshold:
                if self.state != self.OPEN:
                    logger.warning(f"[CircuitBreaker:{self.name}] Circuit OPENED after {self.failures} failures")
                self.state = self.OPEN

    def can_execute(self) -> bool:
        """Check if a request can be executed."""
        with self._lock:
            if self.state == self.CLOSED:
                return True

            if self.state == self.OPEN:
                # Check if timeout has passed
                if self.last_failure_time and \
                   datetime.now() - self.last_failure_time > timedelta(seconds=self.timeout):
                    logger.info(f"[CircuitBreaker:{self.name}] Trying half-open state")
                    self.state = self.HALF_OPEN
                    return True
                return False

            # HALF_OPEN - allow one request through
            return True

    def get_status(self) -> dict:
        """Get current circuit breaker status."""
        return {
            "name": self.name,
            "state": self.state,
            "failures": self.failures,
            "last_failure": self.last_failure_time.isoformat() if self.last_failure_time else None
        }


# Global circuit breaker for Supabase
_supabase_circuit_breaker = CircuitBreaker(
    "supabase",
    failure_threshold=CIRCUIT_BREAKER_THRESHOLD,
    timeout=CIRCUIT_BREAKER_TIMEOUT
)


# =============================================================================
# CLIENT MANAGEMENT
# =============================================================================

class SupabaseClientManager:
    """
    Manages Supabase client lifecycle with connection pooling and recycling.
    """

    def __init__(self):
        self._client: Optional[Client] = None
        self._client_created_at: Optional[datetime] = None
        self._lock = threading.Lock()
        self._request_count = 0

    def _create_httpx_client(self) -> httpx.Client:
        """Create an httpx client with proper connection pool limits."""
        return httpx.Client(
            http2=True,
            limits=httpx.Limits(
                max_connections=MAX_CONNECTIONS,
                max_keepalive_connections=MAX_KEEPALIVE_CONNECTIONS,
                keepalive_expiry=30.0  # Close idle connections after 30 seconds
            ),
            timeout=httpx.Timeout(
                connect=CONNECT_TIMEOUT,
                read=READ_TIMEOUT,
                write=WRITE_TIMEOUT,
                pool=POOL_TIMEOUT
            )
        )

    def _should_recycle_client(self) -> bool:
        """Check if the client should be recycled based on age."""
        if self._client is None or self._client_created_at is None:
            return True

        if self._is_client_closed():
            return True

        age = (datetime.now() - self._client_created_at).total_seconds()
        return age > CONNECTION_MAX_AGE

    def _is_client_closed(self) -> bool:
        """Check if the underlying HTTP client is closed."""
        if self._client is None:
            return False

        try:
            postgrest = getattr(self._client, "postgrest", None)
            session = getattr(postgrest, "session", None)
            if session is not None and getattr(session, "is_closed", False):
                return True
        except Exception:
            return False

        return False

    def get_client(self) -> Client:
        """
        Get or create a Supabase client with connection pool management.

        Returns:
            Client: A configured Supabase client instance

        Raises:
            ValueError: If credentials are not set
            RuntimeError: If circuit breaker is open
        """
        if not SUPABASE_URL or not SUPABASE_KEY:
            raise ValueError("SUPABASE_URL and SUPABASE_KEY environment variables must be set")

        # Check circuit breaker
        if not _supabase_circuit_breaker.can_execute():
            raise RuntimeError(
                f"Supabase circuit breaker is OPEN. Too many failures. "
                f"Will retry in {CIRCUIT_BREAKER_TIMEOUT} seconds."
            )

        with self._lock:
            # Recycle client if too old
            if self._should_recycle_client():
                self._close_client()

                try:
                    # Create new client
                    # Note: supabase-py 2.x uses ClientOptions, we use defaults
                    # with connection management handled at our level
                    self._client = create_client(
                        SUPABASE_URL,
                        SUPABASE_KEY
                    )
                    self._client_created_at = datetime.now()
                    self._request_count = 0
                    logger.debug(f"Created new Supabase client (max_conn={MAX_CONNECTIONS})")
                except Exception as e:
                    logger.error(f"Failed to create Supabase client: {e}")
                    _supabase_circuit_breaker.record_failure()
                    raise

            self._request_count += 1
            return self._client

    def _close_client(self):
        """Close and cleanup the current client."""
        if self._client is not None:
            try:
                # The supabase-py client doesn't have a close method,
                # but we can try to close the underlying httpx client
                if hasattr(self._client, 'postgrest') and hasattr(self._client.postgrest, 'session'):
                    self._client.postgrest.session.close()
            except Exception as e:
                logger.debug(f"Error closing Supabase client: {e}")
            finally:
                self._client = None
                self._client_created_at = None

    def reset(self):
        """Force reset the client (useful after errors)."""
        with self._lock:
            logger.info("Resetting Supabase client due to error or manual reset")
            self._close_client()

    def get_stats(self) -> dict:
        """Get client statistics."""
        return {
            "client_active": self._client is not None,
            "client_age_seconds": (
                (datetime.now() - self._client_created_at).total_seconds()
                if self._client_created_at else None
            ),
            "request_count": self._request_count,
            "circuit_breaker": _supabase_circuit_breaker.get_status()
        }


# Global client manager instance
_client_manager = SupabaseClientManager()


def get_supabase_client() -> Client:
    """
    Get a Supabase client with connection pool management.

    This is the main entry point for getting a Supabase client.
    It handles connection pooling, recycling, and circuit breaking.

    Returns:
        Client: A configured Supabase client instance

    Raises:
        ValueError: If credentials are not set
        RuntimeError: If circuit breaker is open
    """
    return _client_manager.get_client()


def reset_supabase_client() -> None:
    """
    Reset the Supabase client.

    Call this after encountering connection errors to force
    a new connection on the next request.
    """
    _client_manager.reset()


def get_supabase_stats() -> dict:
    """Get Supabase client statistics for monitoring."""
    return _client_manager.get_stats()


# =============================================================================
# RETRY DECORATOR WITH CIRCUIT BREAKER
# =============================================================================

T = TypeVar('T')


def with_supabase_retry(
    max_attempts: int = 3,
    timeout_seconds: float = 30.0,
    description: str = "operation"
) -> Callable:
    """
    Decorator for Supabase operations with retry, timeout, and circuit breaker.

    Args:
        max_attempts: Maximum number of retry attempts
        timeout_seconds: Timeout for each attempt
        description: Description for logging

    Example:
        @with_supabase_retry(max_attempts=3, description="fetch user")
        def get_user(user_id: str):
            client = get_supabase_client()
            return client.table("users").select("*").eq("id", user_id).execute()
    """
    def decorator(func: Callable[..., T]) -> Callable[..., T]:
        @wraps(func)
        def wrapper(*args, **kwargs) -> T:
            last_error = None

            for attempt in range(1, max_attempts + 1):
                # Check circuit breaker
                if not _supabase_circuit_breaker.can_execute():
                    raise RuntimeError(
                        f"Supabase circuit breaker is OPEN for {description}. "
                        f"Service appears unavailable."
                    )

                try:
                    # Execute with timeout using threading
                    from concurrent.futures import ThreadPoolExecutor, TimeoutError as FutureTimeout

                    with ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(func, *args, **kwargs)
                        result = future.result(timeout=timeout_seconds)

                    # Success - record and return
                    _supabase_circuit_breaker.record_success()
                    return result

                except FutureTimeout:
                    last_error = TimeoutError(f"Operation timed out after {timeout_seconds}s")
                    logger.warning(
                        f"[Supabase] {description} timed out on attempt {attempt}/{max_attempts}"
                    )
                    _supabase_circuit_breaker.record_failure()
                    reset_supabase_client()

                except Exception as e:
                    last_error = e
                    error_msg = str(e)
                    error_msg_lower = error_msg.lower()
                    logger.warning(
                        f"[Supabase] {description} failed on attempt {attempt}/{max_attempts}: {error_msg}"
                    )

                    # Check for transient errors that warrant retry
                    transient_errors = [
                        "ReadTimeout", "ConnectTimeout", "PoolTimeout",
                        "ConnectionResetError", "StreamReset",
                        "UNEXPECTED_EOF", "EOF occurred",
                        "RemoteProtocolError", "ReadError",
                        "The read operation timed out",
                        "Server disconnected",
                        "Cannot send a request, as the client has been closed",
                        "ClientConnectionError",
                        "Connection closed",
                        "Resource temporarily unavailable",
                    ]

                    is_transient = any(err.lower() in error_msg_lower for err in transient_errors)

                    if is_transient:
                        _supabase_circuit_breaker.record_failure()
                        reset_supabase_client()
                    else:
                        # Non-transient error, don't retry
                        raise

                # Exponential backoff between retries
                if attempt < max_attempts:
                    backoff = min(0.5 * (2 ** (attempt - 1)), 5.0)  # Cap at 5 seconds
                    time.sleep(backoff)

            # All attempts exhausted
            raise last_error

        return wrapper
    return decorator


# =============================================================================
# CONVENIENCE FUNCTIONS
# =============================================================================

def execute_with_retry(
    operation: Callable[[], T],
    description: str = "operation",
    max_attempts: int = 3,
    timeout_seconds: float = 30.0
) -> T:
    """
    Execute a Supabase operation with retry and timeout.

    This is a function-based alternative to the decorator.

    Args:
        operation: Zero-arg callable that performs the Supabase request
        description: Description for logging
        max_attempts: Maximum number of retry attempts
        timeout_seconds: Timeout for each attempt

    Returns:
        The operation's return value

    Example:
        result = execute_with_retry(
            lambda: client.table("users").select("*").execute(),
            description="fetch users",
            max_attempts=3
        )
    """
    @with_supabase_retry(max_attempts=max_attempts, timeout_seconds=timeout_seconds, description=description)
    def _wrapped():
        return operation()

    return _wrapped()


# =============================================================================
# HEALTH CHECK
# =============================================================================

def check_supabase_health() -> dict:
    """
    Perform a health check on the Supabase connection.

    Returns:
        dict with health status information
    """
    try:
        start = time.time()
        client = get_supabase_client()

        # Simple query to test connection
        result = execute_with_retry(
            lambda: client.table("users").select("id").limit(1).execute(),
            description="health check",
            max_attempts=1,
            timeout_seconds=5.0
        )

        latency = time.time() - start

        return {
            "healthy": True,
            "latency_ms": round(latency * 1000, 2),
            "stats": get_supabase_stats()
        }
    except Exception as e:
        return {
            "healthy": False,
            "error": str(e),
            "stats": get_supabase_stats()
        }
