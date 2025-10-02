"""
Middleware for request tracking and enhanced logging
"""
import time
import uuid
import asyncio
from typing import Callable, Dict, Any
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.types import ASGIApp

import logging
from datetime import datetime

logger = logging.getLogger(__name__)


class RequestLoggingMiddleware(BaseHTTPMiddleware):
    """Middleware that adds request context and logs request lifecycle"""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self.active_requests: Dict[str, Dict[str, Any]] = {}
    
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Generate request ID
        request_id = str(uuid.uuid4())[:8]
        method = request.method
        path = request.url.path
        
        # Store request context
        request.state.request_id = request_id
        
        # Track request
        start_time = time.time()
        self.active_requests[request_id] = {
            'endpoint': path,
            'start_time': start_time,
            'client': request.client.host if request.client else 'unknown'
        }
        
        # Log request start (only for non-health endpoints)
        if not path.endswith('/health'):
            logger.info(f"Request started: {method} {path} - Request ID: {request_id}")
        
        try:
            # Process request
            response = await call_next(request)
            
            # Log request completion
            duration_ms = int((time.time() - start_time) * 1000)
            if not path.endswith('/health'):
                logger.info(f"Request completed: {method} {path} - Status: {response.status_code} - Duration: {duration_ms}ms - Request ID: {request_id}")
            
            # Add request ID to response headers
            response.headers["X-Request-ID"] = request_id
            response.headers["X-Process-Time"] = str(duration_ms)
            
            return response
            
        except Exception as e:
            # Log request error
            duration_ms = int((time.time() - start_time) * 1000)
            
            logger.error(f"Request failed: {method} {path} - Error: {str(e)} - Duration: {duration_ms}ms - Request ID: {request_id}")
            raise
            
        finally:
            # Clean up
            self.active_requests.pop(request_id, None)


class LogDeduplicationMiddleware(BaseHTTPMiddleware):
    """Middleware that helps deduplicate logs across parallel requests"""
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        self._recent_logs: Dict[str, float] = {}
        self._cleanup_task = None
        
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Start cleanup task if not running
        if self._cleanup_task is None or self._cleanup_task.done():
            self._cleanup_task = asyncio.create_task(self._cleanup_old_entries())
        
        return await call_next(request)
    
    async def _cleanup_old_entries(self):
        """Clean up old log entries periodically"""
        while True:
            await asyncio.sleep(60)  # Clean up every minute
            now = time.time()
            expired = [k for k, v in self._recent_logs.items() if now - v > 300]  # 5 minutes
            for k in expired:
                self._recent_logs.pop(k, None) 


class AuthenticationMiddleware(BaseHTTPMiddleware):
    """
    Middleware that handles authentication globally
    Validates tokens and attaches user info to requests
    """
    
    # Paths that don't require authentication
    PUBLIC_PATHS = [
        "/health",
        "/api/health",
        "/docs",
        "/openapi.json",
        "/redoc",
        "/auth/signup",
        "/auth/signin",
        "/auth/refresh",
        "/auth/password/reset",
        "/auth/validate-token",  # Add this to public paths
        "/auth/google/signin",   # Google OAuth endpoints
        "/auth/google/signup",
        "/auth/magic-link/send", # Magic Link endpoints
        "/auth/magic-link/verify",
        "/auth/check-email",
        "/api/public/"  # All public deck endpoints
    ]
    
    # Paths that need special handling for SSE
    SSE_PATHS = [
        "/api/deck/compose-stream",
        "/api/deck/create-from-outline",
        "/api/openai/generate-outline-stream"
    ]
    
    # Protected paths that require authentication
    PROTECTED_PATHS = [
        "/api/deck/",
        "/auth/me",
        "/auth/decks",
        "/auth/profile",
        "/api/admin/"  # Admin endpoints require authentication
    ]
    
    def __init__(self, app: ASGIApp):
        super().__init__(app)
        
    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        # Skip auth for public paths
        path = request.url.path
        if any(path.startswith(p) for p in self.PUBLIC_PATHS):
            return await call_next(request)
            
        # Special handling for SSE endpoints
        is_sse = any(path.startswith(p) for p in self.SSE_PATHS)
        
        # Extract token from header or query params (for SSE)
        auth_header = request.headers.get("Authorization", "")
        token = None
        
        if auth_header.startswith("Bearer "):
            token = auth_header.replace("Bearer ", "")
        elif is_sse:
            # For SSE endpoints, also check query parameters
            token = request.query_params.get("token")
            
        # Check if this is a protected path
        is_protected = any(path.startswith(p) for p in self.PROTECTED_PATHS)
        
        # Validate token if present
        if token:
            try:
                # Quick check: decode JWT and check expiry before making API call
                import jwt
                is_expired = False
                try:
                    # Decode without verification just to check expiry
                    payload = jwt.decode(token, options={"verify_signature": False})
                    exp = payload.get('exp', 0)
                    if exp and exp < datetime.now().timestamp():
                        # Token is expired
                        is_expired = True
                        logger.debug(f"Token expired for path {path}")
                except jwt.DecodeError:
                    logger.debug(f"Invalid JWT format for path {path}")
                except:
                    pass  # Continue with full validation if decode fails
                
                if is_expired and is_protected:
                    # Return 401 for expired tokens on protected paths
                    response = Response(
                        content='{"detail":"Token expired. Please sign in again."}',
                        status_code=401,
                        headers={
                            "Content-Type": "application/json",
                            "X-Token-Status": "expired"
                        }
                    )
                    return response
                
                # Full validation
                from services.session_manager import validate_token
                user = validate_token(token)
                
                if user:
                    # Attach user to request state for easy access
                    request.state.user = user
                    request.state.user_id = user.get('id')
                    request.state.token = token
                    logger.debug(f"Authenticated request from user {user.get('id')} to {path}")
                else:
                    # Invalid token
                    logger.warning(f"Invalid token provided for {path}")
                    request.state.user = None
                    request.state.user_id = None
                    request.state.token = None
                    
                    if is_protected:
                        # Return 401 for invalid tokens on protected paths
                        response = Response(
                            content='{"detail":"Invalid authentication token. Please sign in again."}',
                            status_code=401,
                            headers={
                                "Content-Type": "application/json",
                                "X-Token-Status": "invalid"
                            }
                        )
                        return response
            except Exception as e:
                logger.error(f"Error validating token: {e}")
                request.state.user = None
                request.state.user_id = None
                request.state.token = None
                
                if is_protected:
                    # Return 500 for unexpected errors on protected paths
                    response = Response(
                        content='{"detail":"Authentication service error. Please try again."}',
                        status_code=500,
                        headers={"Content-Type": "application/json"}
                    )
                    return response
        else:
            # No token provided
            request.state.user = None
            request.state.user_id = None
            request.state.token = None
            
            if is_protected:
                # Return 401 for missing auth on protected paths
                response = Response(
                    content='{"detail":"Authentication required. Please sign in."}',
                    status_code=401,
                    headers={
                        "Content-Type": "application/json",
                        "X-Token-Status": "missing"
                    }
                )
                return response
            
        # Continue processing
        response = await call_next(request)
        
        # Add auth status to response headers
        if hasattr(request.state, 'user_id') and request.state.user_id:
            response.headers["X-Auth-Status"] = "authenticated"
            response.headers["X-User-ID"] = request.state.user_id
        else:
            response.headers["X-Auth-Status"] = "anonymous"
            
        # Add CORS headers for auth (important for frontend to read these headers)
        response.headers["Access-Control-Expose-Headers"] = "X-Auth-Status, X-User-ID, X-Token-Status"
            
        return response 