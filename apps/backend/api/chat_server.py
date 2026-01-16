import os
import sys

# Disable debug logging from libraries before importing them
os.environ["ANTHROPIC_LOG"] = "error"
os.environ["LANGCHAIN_TRACING_V2"] = "false"
os.environ["LANGSMITH_TRACING"] = "false"

import time
import json
import uuid
import asyncio
import logging
import hashlib
from pathlib import Path
from typing import Optional, Literal, List, Dict, Any, Tuple
from datetime import datetime
from collections import defaultdict
from functools import lru_cache

from fastapi import FastAPI, HTTPException, Depends, Header, Request, UploadFile, File
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import uvicorn
import httpx

# Import Sentry
import sentry_sdk
from sentry_sdk.integrations.fastapi import FastApiIntegration
from sentry_sdk.integrations.logging import LoggingIntegration

# Add request deduplication cache
# Cache recent deck creation requests to prevent duplicates
_recent_deck_creations: Dict[str, float] = {}
_DEDUP_WINDOW_SECONDS = 60  # Prevent duplicate requests within 60 seconds

def _get_request_hash(outline: dict, user_id: str) -> str:
    """Generate a hash for deduplicating requests"""
    # Create a more comprehensive hash that includes actual content
    import hashlib
    import json
    
    # Include outline ID, title, slide titles/content, and user to identify duplicates
    hash_data = {
        'user_id': user_id or 'anon',
        'outline_id': outline.get('id', ''),  # Include outline ID
        'title': outline.get('title', ''),
        'slide_count': len(outline.get('slides', [])),
        'slides': []
    }
    
    # Include slide titles and content for better deduplication
    for slide in outline.get('slides', []):
        ed = slide.get('extractedData') or {}
        ed_has_chart = bool(isinstance(ed, dict) and ed.get('chartType') and isinstance(ed.get('data'), list) and len(ed.get('data')) > 0)
        manual_charts = slide.get('manualCharts') or []
        manual_has_chart = isinstance(manual_charts, list) and len(manual_charts) > 0
        hash_data['slides'].append({
            'title': slide.get('title', ''),
            'content': slide.get('content', '')[:100],  # First 100 chars of content
            'has_chart': ed_has_chart or manual_has_chart
        })
    
    # Create a deterministic hash
    hash_string = json.dumps(hash_data, sort_keys=True)
    return hashlib.md5(hash_string.encode()).hexdigest()

# Control registry logging verbosity
QUIET_REGISTRY = os.environ.get("QUIET_REGISTRY", "true").lower() == "true"

# Set up logging first
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from setup_logging_optimized import setup_logging

# Configure logging for the entire application
setup_logging()

# Initialize Sentry after loading env vars but before creating app
load_dotenv(override=True)

# Configure Sentry
sentry_logging = LoggingIntegration(
    level=logging.INFO,        # Capture info and above as breadcrumbs
    event_level=logging.ERROR  # Send errors as events
)

sentry_sdk.init(
    dsn=os.getenv("SENTRY_DSN"),  # You'll set this in .env
    integrations=[
        FastApiIntegration(transaction_style='endpoint'),
        sentry_logging,
    ],
    traces_sample_rate=0.1,  # 10% of transactions for performance monitoring
    profiles_sample_rate=0.1,  # 10% of transactions for profiling
    environment=os.getenv("ENV", "development"),
    release=os.getenv("RENDER_GIT_COMMIT", "unknown"),  # Tracks deployments
    send_default_pii=False,  # Don't send personally identifiable information
    before_send=lambda event, hint: event if event.get('level') != 'debug' else None  # Filter debug events
)

# Initialize PostHog for product analytics (lazy initialization in analytics_service)
from services.analytics_service import track_event, track_deck_composition_started, track_deck_composition_completed

from models.requests import ChatRequest, ChatResponse, RegistryUpdateRequest, QualityEvaluationRequest, QualityEvaluationResponse, DeckOutline, DeckOutlineResponse, SlideOutline, DeckComposeRequest
from models.deck import DeckBase
from models.registry import ComponentRegistry, set_global_registry

from api.requests.api_chat import process_api_chat
from api.requests.api_registry import api_registry
from api.requests.api_quality_evaluate import api_evaluate_quality
from api.requests.api_deck_outline import process_deck_outline
from api.requests.api_pptx_convert import convert_pptx_to_png
from api.requests.api_deck_check import check_deck_exists, DeckCheckRequest, DeckCheckResponse
from api.requests.api_openai_outline import (
    process_openai_outline, 
    OpenAIOutlineRequest, 
    OpenAIOutlineResponse,
    process_openai_outline_stream,
    process_media_interpretation,
    process_content_enhancement
)
from api.requests.api_media_search import (
    process_media_search,
    MediaSearchRequest,
    MediaSearchResponse
)

# Import the image options router
from api.image_options_endpoints import router as image_options_router
from api.image_generation_endpoint import router as image_generation_router
# Import the font server router
from api.font_server import router as font_router
# Import the auth router
from api.requests.api_auth import router as auth_router
from api.requests.api_auth import get_auth_header
from api.requests.api_deck_sharing import router as deck_sharing_router
from api.requests.api_public_deck import router as public_deck_router
from api.requests.api_og_image import router as og_image_router, share_router as og_share_router
from api.requests.api_teams import router as teams_router
from api.requests.api_deck_access import router as deck_access_router
from api.requests.api_comments import router as comments_router
from api.requests.api_outline_chat import router as outline_chat_router
from api.requests.api_outline_agent import router as outline_agent_router
from api.requests.api_outline_theme import router as outline_theme_router
from api.requests.api_slide_research import router as slide_research_router
from api.requests.api_slide_reorder import router as slide_reorder_router
# Make narrative test optional if module was removed during cleanup
try:
    from api.requests.api_narrative_test import router as narrative_test_router
except Exception:  # ModuleNotFoundError or other import errors
    narrative_test_router = None
from api.requests.api_websocket_analytics import router as websocket_analytics_router
from api.requests.api_agent_endpoints import router as agent_router
from api.requests.api_agent_stream import router as agent_stream_router
from api.requests.api_uploads import router as uploads_router
from api.requests.api_agent_messages import router as agent_messages_router
from api.requests.api_theme import router as theme_router
from api.requests.api_deck_notes import router as deck_notes_router
from api.requests.api_admin import router as admin_router
from api.requests.api_admin_analytics import router as admin_analytics_router
from api.requests.api_community import router as community_router
from api.requests.api_google_integration import router as google_router
from api.requests.api_integrations import router as integrations_router
from api.requests.api_file_analysis import router as file_analysis_router
from api.requests.api_billing import router as billing_router
from api.requests.api_speech_to_text import router as speech_to_text_router
from api.requests.api_developer import router as developer_router
from api.requests.api_public_v1 import router as public_api_v1_router
from api.requests.api_followup import router as followup_router
from fastapi import Depends

# Middleware imports removed - files were deleted

# Set up logging
logger = logging.getLogger(__name__)
logger.info("Chat server starting up...")

# Disable output buffering for real-time streaming
os.environ['PYTHONUNBUFFERED'] = '1'

# Request model for media interpretation
class MediaInterpretationRequest(BaseModel):
    files: List[Dict[str, Any]]  # Contains id, name, type, content, size
    slides: List[SlideOutline]    # List of slide outlines
    mediaPrompt: str
    systemPrompts: Optional[Dict[str, str]] = None

# Create FastAPI app
app = FastAPI(title="Slide Sorcery Chat API")

# Custom middleware removed - files were deleted

# Configure CORS based on environment (robust detection)
import os
ENVIRONMENT = (
    os.getenv("ENVIRONMENT")
    or os.getenv("ENV")
    or os.getenv("NODE_ENV")
    or "development"
).lower()

# Always include production domains; add localhost only outside production
allowed_origins = {
    "https://app.nextslide.ai",
    "https://www.nextslide.ai",
    "https://nextslide.ai",
}

if ENVIRONMENT != "production":
    # In non-production, also allow localhost and common dev ports
    allowed_origins.update(
        {
            "http://localhost:3000",
            "http://localhost:3001",
            "http://localhost:5173",
            "http://localhost:8080",
            "http://localhost:8081",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:3001",
            "http://127.0.0.1:5173",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:8081",
            # Local network for mobile testing
            "http://169.254.135.222:8080",
        }
    )

# Enable CORS to allow requests from frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(allowed_origins),
    # Allow any subdomain of nextslide.ai over HTTPS, localhost over HTTP, and local network IPs for mobile testing
    allow_origin_regex=r"https://([a-z0-9-]+\\.)?nextslide\\.ai$|http://(localhost|127\\.0\\.0\\.1|192\\.168\\.\\d+\\.\\d+|10\\.\\d+\\.\\d+\\.\\d+|169\\.254\\.\\d+\\.\\d+)(:\\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods to simplify dev preflights
    allow_headers=["*"],  # Echo requested headers for preflight
    expose_headers=["X-Request-ID", "X-Process-Time", "X-Auth-Status", "X-User-ID", "X-Token-Status"],
    max_age=3600,  # Cache preflight requests for 1 hour
)

# Global exception handler to ensure CORS headers are always sent even on 500 errors
@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    """Catch unhandled exceptions and return proper JSON response with CORS headers."""
    import traceback
    logger.error(f"[GlobalExceptionHandler] Unhandled exception: {exc}")
    logger.error(traceback.format_exc())

    # Get origin from request
    origin = request.headers.get("origin", "")

    # Build response with CORS headers
    response = JSONResponse(
        status_code=500,
        content={"error": {"code": "INTERNAL_ERROR", "message": str(exc)}}
    )

    # Add CORS headers manually for unhandled exceptions
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"

    return response

# Mount static files for assets directory
assets_dir = (Path(__file__).resolve().parent.parent / "assets").resolve()
app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="assets")

# Include the routers
app.include_router(auth_router)
app.include_router(image_options_router)
app.include_router(image_generation_router)
app.include_router(font_router)
app.include_router(deck_sharing_router)
app.include_router(public_deck_router)
app.include_router(og_image_router)
app.include_router(og_share_router)  # Share routes at root level (/p/, /e/)
app.include_router(teams_router)
app.include_router(deck_access_router)
app.include_router(comments_router)
app.include_router(outline_chat_router)
app.include_router(outline_agent_router)
app.include_router(outline_theme_router)
app.include_router(slide_research_router)
app.include_router(slide_reorder_router)
if narrative_test_router is not None:
    app.include_router(narrative_test_router, prefix="", tags=["Narrative Test"])
app.include_router(websocket_analytics_router, prefix="", tags=["Websocket Analytics"])
app.include_router(deck_notes_router, prefix="", tags=["Deck Notes"])
app.include_router(admin_router)
app.include_router(admin_analytics_router)
app.include_router(community_router)
app.include_router(agent_router)
app.include_router(agent_stream_router)
app.include_router(uploads_router)
app.include_router(agent_messages_router)
app.include_router(google_router)
app.include_router(integrations_router)
app.include_router(theme_router)
app.include_router(file_analysis_router, prefix="/api/files", tags=["File Analysis"])
app.include_router(billing_router, prefix="/api", tags=["Billing"])
app.include_router(speech_to_text_router)
app.include_router(developer_router, tags=["Developer API"])
app.include_router(followup_router, prefix="/api", tags=["Follow-up Messages"])
# Mount public API at /v1 (clean URLs for api.nextslide.ai) and /api/v1 (backward compatibility)
app.include_router(public_api_v1_router, prefix="/v1", tags=["Public API v1"])
app.include_router(public_api_v1_router, prefix="/api/v1", tags=["Public API v1"])

# Global registry storage
REGISTRY = None
DEBUG_VISUALIZE_IMAGES = True

def load_registry_on_startup():
    """Try to load registry from saved schemas on startup"""
    global REGISTRY
    
    # Check for environment variable first
    schemas_path = os.environ.get('SCHEMAS_PATH')
    
    # If not set, check default location
    if not schemas_path:
        schemas_path = os.path.join(os.path.dirname(__file__), '../schemas/typebox_schemas_latest.json')
    
    if os.path.exists(schemas_path):
        try:
            with open(schemas_path, 'r') as f:
                schemas = json.load(f)
            
            REGISTRY = ComponentRegistry(schemas)
            set_global_registry(REGISTRY)  # Make available globally
            if not QUIET_REGISTRY:
                print(f"✅ Registry loaded from {schemas_path} ({len(schemas)} schemas)")
            return True
        except Exception as e:
            print(f"⚠️  Failed to load registry from {schemas_path}: {e}")
    
    return False

# Try to load registry on startup
load_registry_on_startup()

# In-memory storage for frontend debug logs (last 100 entries)
_frontend_debug_logs: List[Dict[str, Any]] = []
_MAX_DEBUG_LOGS = 100

class FrontendLogEntry(BaseModel):
    level: str = "log"
    message: str
    data: Optional[str] = None
    timestamp: Optional[str] = None
    userAgent: Optional[str] = None
    url: Optional[str] = None

@app.post("/api/debug-log")
async def receive_debug_log(entry: FrontendLogEntry):
    """Receive debug logs from frontend for mobile Safari debugging"""
    global _frontend_debug_logs
    log_entry = {
        "level": entry.level,
        "message": entry.message,
        "data": entry.data,
        "timestamp": entry.timestamp or datetime.now().isoformat(),
        "userAgent": entry.userAgent,
        "url": entry.url,
        "received_at": datetime.now().isoformat()
    }
    _frontend_debug_logs.append(log_entry)
    # Keep only last N entries
    if len(_frontend_debug_logs) > _MAX_DEBUG_LOGS:
        _frontend_debug_logs = _frontend_debug_logs[-_MAX_DEBUG_LOGS:]

    # Also print to server logs for Render visibility
    print(f"[FRONTEND-LOG] [{entry.level.upper()}] {entry.message} | {entry.data or ''}")
    return {"status": "ok"}

@app.get("/api/debug-logs")
async def get_debug_logs():
    """Get recent frontend debug logs - for viewing in browser"""
    return {"logs": _frontend_debug_logs, "count": len(_frontend_debug_logs)}

@app.delete("/api/debug-logs")
async def clear_debug_logs():
    """Clear all frontend debug logs"""
    global _frontend_debug_logs
    _frontend_debug_logs = []
    return {"status": "cleared"}

@app.get("/")
def read_root():
    return {"message": "Slide Sorcery Chat API is running"}

@app.post("/api/chat", response_model=ChatResponse)
async def api_chat_endpoint(request: ChatRequest, token: Optional[str] = Depends(get_auth_header)):
    global REGISTRY

    # Check and consume credits for chat
    user_id = None
    if token:
        from services.supabase_auth_service import get_auth_service
        from services.billing_service import get_billing_service, CreditAction

        auth_service = get_auth_service()
        user = auth_service.get_user_with_token(token)
        if user:
            user_id = user.get('id')
            billing = get_billing_service()

            # Check credits before processing
            has_credits, cost, remaining = await billing.check_credits(user_id, CreditAction.AI_CHAT)
            if not has_credits:
                logger.warning(f"User {user_id} has insufficient credits for chat: {remaining} < {cost}")
                # Return a special response indicating no credits
                return ChatResponse(
                    response="__INSUFFICIENT_CREDITS__",
                    debug_info={"error": "insufficient_credits", "remaining": remaining, "required": cost}
                )

            # Consume credits
            success, remaining_after, _ = await billing.consume_credits(
                user_id,
                CreditAction.AI_CHAT,
                metadata={"deck_id": request.deck_id if hasattr(request, 'deck_id') else None},
                description="AI chat message"
            )
            if not success:
                logger.warning(f"Failed to consume credits for user {user_id}")
                return ChatResponse(
                    response="__INSUFFICIENT_CREDITS__",
                    debug_info={"error": "insufficient_credits", "remaining": remaining_after, "required": cost}
                )
            logger.info(f"User {user_id} consumed {cost} credit for chat, remaining: {remaining_after}")

    return await process_api_chat(request, REGISTRY)

@app.post("/api/registry")
async def api_registry_endpoint(request: RegistryUpdateRequest):
    """
    Receive and store registry data from the frontend
    """
    try:
        # Store the registry data in our global variable
        global REGISTRY
        REGISTRY = await api_registry(request)
        set_global_registry(REGISTRY)  # Make available globally

        return {
            "status": "success",
            "message": "Registry data received and stored",
            "schemas_processed": request.schemas is not None and len(request.schemas) > 0
        }
    except Exception as e:
        import traceback
        print(f"Error processing registry update: {str(e)}")
        print(traceback.format_exc())
        return {"error": str(e)}

@app.get("/api/health")
async def health_check():
    """Health check with Supabase circuit breaker status."""
    from services.supabase import get_supabase_stats, check_supabase_health

    supabase_stats = get_supabase_stats()
    circuit_state = supabase_stats.get("circuit_breaker", {}).get("state", "unknown")

    # Determine overall health based on circuit breaker state
    if circuit_state == "open":
        status = "degraded"
    else:
        status = "healthy"

    return {
        "status": status,
        "timestamp": datetime.now().isoformat(),
        "supabase": supabase_stats
    }


@app.get("/api/health/supabase")
async def supabase_health():
    """Detailed Supabase health check (performs actual query)."""
    from services.supabase import check_supabase_health
    return check_supabase_health()


@app.post("/api/admin/reset-circuit-breaker")
async def reset_circuit_breaker_endpoint():
    """
    Manually reset the Supabase circuit breaker.
    Use this to recover after a Supabase outage is resolved.
    """
    from services.supabase import reset_circuit_breaker
    result = reset_circuit_breaker()
    return {
        "message": "Circuit breaker reset to CLOSED",
        "status": result
    }


@app.get("/api/sentry-test")
async def test_sentry():
    """Test endpoint to verify Sentry is working"""
    # This will create a breadcrumb
    logger.info("Sentry test endpoint called")
    
    # This will trigger an error that Sentry will capture
    try:
        1 / 0
    except Exception as e:
        # Manually capture the exception with extra context
        sentry_sdk.capture_exception(e, extras={
            "test": True,
            "endpoint": "/api/sentry-test",
            "purpose": "Verify Sentry integration"
        })
        raise HTTPException(status_code=500, detail="Test error for Sentry")

@app.get("/sentry-debug")
async def trigger_error():
    """Sentry's recommended debug endpoint"""
    division_by_zero = 1 / 0

@app.post("/api/quality-evaluate", response_model=QualityEvaluationResponse)
async def api_quality_evaluate_endpoint(request: QualityEvaluationRequest):
    return await api_evaluate_quality(request, debug=DEBUG_VISUALIZE_IMAGES)

@app.post("/api/deck-outline", response_model=DeckOutlineResponse)
async def api_deck_outline_endpoint(request: DeckOutline):
    """
    Process a deck outline and compose the complete deck with slides and components.
    """
    try:
        # Wait for the deck to be composed and uploaded
        result = await process_deck_outline(request, REGISTRY)
        
        # The result contains the deck_data with the uploaded deck
        if result and 'deck_data' in result:
            deck_data = result['deck_data']
            deck_uuid = deck_data.get('uuid', request.id)
            
            # Verify the deck was actually uploaded
            if 'uuid' not in deck_data:
                raise Exception("Deck was composed but not uploaded to database")
            
            return DeckOutlineResponse(
                message=f"Deck '{request.title}' created successfully with {len(request.slides)} slides.",
                deck_outline_id=deck_uuid,  # Return the actual deck UUID from Supabase
                timestamp=datetime.now()
            )
        else:
            # If composition failed but didn't throw an error
            raise Exception("Deck composition completed but no deck data was returned")
            
    except Exception as e:
        # Log the error but still return a response
        print(f"Error processing deck outline: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return DeckOutlineResponse(
            message=f"Error processing deck outline: {str(e)}",
            deck_outline_id=request.id,
            timestamp=datetime.now()
        )

@app.post("/api/deck-check", response_model=DeckCheckResponse)
async def api_deck_check_endpoint(request: DeckCheckRequest, token: Optional[str] = Depends(get_auth_header)):
    """
    Check if a deck exists in the database.
    """
    # Extract user from token
    user_id = None
    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.info(f"Authenticated user for deck check: {user_id}")
        except Exception as e:
            logger.warning(f"Could not extract user from token: {str(e)}")
    return await check_deck_exists(request)

@app.get("/api/v1/concurrency/stats")
async def api_concurrency_stats():
    """
    Get current concurrency statistics for monitoring deck generation load.
    
    Returns information about:
    - Active users and tasks
    - Current resource usage
    - System limits
    """
    from api.requests.api_deck_check import get_concurrency_stats
    return await get_concurrency_stats()

@app.post("/api/pptx-convert")
async def api_pptx_convert_endpoint(file: UploadFile = File(...)):
    """
    Convert a PPTX file to PNG images
    """
    try:
        # Convert the PPTX file to PNG images
        screenshots = await convert_pptx_to_png(file)
        
        return {
            "success": True,
            "screenshots": screenshots,
            "message": f"Converted {len(screenshots)} slides successfully"
        }
    except Exception as e:
        import traceback
        print(f"Error processing PPTX conversion: {str(e)}")
        print(traceback.format_exc())
        return {
            "success": False,
            "error": str(e)
        }

@app.post("/api/openai/generate-outline", response_model=OpenAIOutlineResponse)
async def api_openai_outline_endpoint(request: OpenAIOutlineRequest):
    """
    Generate slide outline using OpenAI with prompts provided by frontend
    """
    return await process_openai_outline(request)

@app.post("/api/openai/generate-outline-stream")
async def api_openai_outline_stream_endpoint(request: OpenAIOutlineRequest, token: Optional[str] = Depends(get_auth_header)):
    """
    Generate slide outline using OpenAI with real-time progress updates via Server-Sent Events
    """
    # CRITICAL: Log IMMEDIATELY to see what frontend sent
    print("="*100)
    print(f"[ENDPOINT] ⚠️⚠️⚠️ STREAMING ENDPOINT CALLED")
    print(f"[ENDPOINT] request.detailLevel = {request.detailLevel}")
    print(f"[ENDPOINT] request.prompt = {request.prompt[:60]}")
    print(f"[ENDPOINT] 🔴🔴🔴 request.async_images = {request.async_images}")
    print(f"[ENDPOINT] 🔴 Type: {type(request.async_images)}")
    print(f"[ENDPOINT] 🔴 Is None: {request.async_images is None}")
    print(f"[ENDPOINT] 🔴 Is True: {request.async_images is True}")
    print(f"[ENDPOINT] 🔴 Is False: {request.async_images is False}")
    print("="*100)
    
    logger.info(f"[ENDPOINT] ⚠️⚠️⚠️ RECEIVED REQUEST AT /api/openai/generate-outline-stream")
    logger.info(f"[ENDPOINT] request.detailLevel = {request.detailLevel}")
    logger.info(f"[ENDPOINT] request.model = {request.model}")
    logger.info(f"Outline generation started for model: {request.model}")
    
    # Extract user from token
    user_id = None
    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.info(f"Authenticated user for outline generation: {user_id}")
        except Exception as e:
            logger.warning(f"Could not extract user from token: {str(e)}")
    
    try:
        global REGISTRY
        if logger.isEnabledFor(logging.DEBUG):
            logger.debug(f"Request has files: {len(request.files) if request.files else 0}")
            if request.files:
                file_types = [f.get('type', 'unknown') for f in request.files]
                logger.debug(f"File types: {file_types}")
        
        # Pass user_id to the outline processing
        request._user_id = user_id  # Attach user_id to request
        result = await process_openai_outline_stream(request, REGISTRY)
        logger.info(f"Returning streaming response (model: {request.model})")
        return result
    except Exception as e:
        logger.error(f"Error in API endpoint: {e}")
        import traceback
        traceback.print_exc()
        raise

@app.get("/api/openai/generate-outline-stream")
async def api_openai_outline_stream_get_endpoint(
    prompt: Optional[str] = None,
    detailLevel: Optional[str] = None,
    slideCount: Optional[int] = None,
    styleContext: Optional[str] = None,
    fontPreference: Optional[str] = None,
    colorPreference: Optional[str] = None,
    model: Optional[str] = None,
    token: Optional[str] = Depends(get_auth_header)
):
    """
    GET alias for outline streaming to support EventSource clients.
    Note: For large payloads/files, prefer POST.
    """
    # Extract user from token
    user_id = None
    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.info(f"Authenticated user for outline generation (GET): {user_id}")
        except Exception as e:
            logger.warning(f"Could not extract user from token (GET): {str(e)}")

    # Parse colorPreference if JSON string provided
    parsed_color: Optional[Any] = None
    if colorPreference:
        try:
            parsed_color = json.loads(colorPreference)
        except Exception:
            parsed_color = colorPreference

    try:
        # Build request model
        req = OpenAIOutlineRequest(
            prompt=prompt or "",
            detailLevel=detailLevel or "standard",
            slideCount=slideCount,
            styleContext=styleContext,
            fontPreference=fontPreference,
            colorPreference=parsed_color,
            model=model
        )
        # Attach user id
        setattr(req, "_user_id", user_id)

        global REGISTRY
        result = await process_openai_outline_stream(req, REGISTRY)
        return result
    except Exception as e:
        logger.error(f"Error in GET outline stream endpoint: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/openai/interpret-media")
async def api_openai_interpret_media_endpoint(request: MediaInterpretationRequest):
    """
    Interpret media files using OpenAI Vision and other models
    """
    try:
        # No need to convert slides, they're already SlideOutline objects
        media_items = await process_media_interpretation(
            request.files, 
            request.slides, 
            request.mediaPrompt
        )
        
        return {
            "success": True,
            "mediaItems": [item.dict() for item in media_items],
            "message": f"Successfully interpreted {len(media_items)} media items"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to interpret media: {str(e)}"
        }

@app.post("/api/openai/enhance-content")
async def api_openai_enhance_content_endpoint(request: dict):
    """
    Enhance slide content using OpenAI with web search capabilities
    """
    try:
        content = request.get("content", "")
        
        # Handle both old format (enhancePrompt) and new format (systemPrompts)
        enhance_prompt = request.get("enhancePrompt", "")
        
        # Check for new format with systemPrompts
        if not enhance_prompt and "systemPrompts" in request:
            system_prompts = request.get("systemPrompts", {})
            enhance_prompt = system_prompts.get("contentEnhancement", "")
        
        # If no enhance prompt provided, use a default one
        if not enhance_prompt:
            enhance_prompt = "Enhance this content with current data, statistics, and relevant examples"
        
        if not content:
            return {"error": "Content is required"}
            
        result = await process_content_enhancement(content, enhance_prompt)
        
        return {
            "success": True,
            "result": result,
            "message": "Content enhanced successfully"
        }
        
    except Exception as e:
        return {
            "success": False,
            "error": str(e),
            "message": f"Failed to enhance content: {str(e)}"
        }

@app.post("/api/media/search", response_model=MediaSearchResponse)
async def api_media_search_endpoint(request: MediaSearchRequest):
    """
    Search for images, videos, or gifs using SerpAPI
    """
    try:
        return await process_media_search(request)
    except Exception as e:
        logger.error(f"Error in media search endpoint: {str(e)}", exc_info=True)
        return MediaSearchResponse(
            results=[],
            total=0,
            query=request.query,
            type=request.type
        )


class MediaProxyRequest(BaseModel):
    """Request model for proxying/uploading external media to our storage"""
    url: str = Field(..., description="External image URL to proxy")


class MediaProxyResponse(BaseModel):
    """Response model for media proxy endpoint"""
    success: bool
    url: str = Field(..., description="Supabase storage URL")
    original_url: str = Field(..., description="Original external URL")
    error: Optional[str] = None


@app.post("/api/media/proxy", response_model=MediaProxyResponse)
async def api_media_proxy_endpoint(request: MediaProxyRequest):
    """
    Proxy external images through our backend and upload to Supabase storage.
    This prevents broken images from sites that block external linking.
    """
    try:
        from services.image_storage_service import ImageStorageService

        # Validate URL
        if not request.url or not request.url.startswith('http'):
            return MediaProxyResponse(
                success=False,
                url=request.url,
                original_url=request.url,
                error="Invalid URL"
            )

        # Skip if already a Supabase URL
        if 'supabase' in request.url:
            return MediaProxyResponse(
                success=True,
                url=request.url,
                original_url=request.url
            )

        # Upload to Supabase
        async with ImageStorageService() as storage:
            result = await storage.upload_image_from_url(request.url)

            if 'error' in result:
                logger.warning(f"Failed to proxy image {request.url}: {result['error']}")
                return MediaProxyResponse(
                    success=False,
                    url=request.url,  # Return original as fallback
                    original_url=request.url,
                    error=result['error']
                )

            logger.info(f"Proxied image: {request.url} -> {result['url']}")
            return MediaProxyResponse(
                success=True,
                url=result['url'],
                original_url=request.url
            )

    except Exception as e:
        logger.error(f"Error in media proxy endpoint: {str(e)}", exc_info=True)
        return MediaProxyResponse(
            success=False,
            url=request.url,
            original_url=request.url,
            error=str(e)
        )


@app.post("/api/deck/compose-stream")
async def api_deck_compose_stream_endpoint(request: DeckComposeRequest, token: Optional[str] = Depends(get_auth_header)):
    print("="*100)
    print(f"[DECK COMPOSE] 🎨🎨🎨 DECK COMPOSITION ENDPOINT CALLED")
    print(f"[DECK COMPOSE] deck_id: {request.deck_id}")
    print(f"[DECK COMPOSE] 🔴🔴🔴 request.async_images = {request.async_images}")
    print(f"[DECK COMPOSE] 🔴 Type: {type(request.async_images)}")
    print(f"[DECK COMPOSE] 🔴 Is False: {request.async_images is False}")
    print("="*100)

    logger.info(f"Deck composition started for: {request.deck_id}")
    logger.info(f"🔴 async_images: {request.async_images}")

    # Extract user from token if available and associate deck
    user_id = None
    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.info(f"Associating deck {request.deck_id} with user {user_id}")
                # Associate the deck with the user
                auth_service.associate_deck_with_user(user_id, request.deck_id)

                # NOTE: Credits are consumed in /deck/create-from-outline endpoint
                # Do NOT consume credits here to avoid double-charging
                # This endpoint may be called as a follow-up stream for progress tracking
                logger.info(f"[compose-stream] Skipping credit consumption - handled by /deck/create-from-outline")
        except Exception as e:
            logger.warning(f"Could not associate deck with user: {e}")

    # Debug: Check taggedMedia in incoming request - use structured logging
    if logger.isEnabledFor(logging.DEBUG):
        logger.debug(f"Received deck compose request for deck: {request.deck_id}")
        logger.debug(f"Outline has {len(request.outline.slides)} slides")
        
        # Debug: Check stylePreferences
        if hasattr(request.outline, 'stylePreferences'):
            style_info = {
                'has_style': request.outline.stylePreferences is not None,
                'vibe_context': getattr(request.outline.stylePreferences, 'vibeContext', 'NOT SET') if request.outline.stylePreferences else None
            }
            logger.debug(f"StylePreferences: {style_info}")
        
        # Log first 2 slides' media info
        for i, slide in enumerate(request.outline.slides[:2]):
            tm_count = len(slide.taggedMedia) if slide.taggedMedia else 0
            if tm_count > 0:
                logger.debug(f"Slide {i+1} '{slide.title}' has {tm_count} taggedMedia items")
    
    try:
        # Use global registry
        global REGISTRY
        if REGISTRY is None:
            raise HTTPException(status_code=500, detail="Registry not initialized")
        
        # Create streaming response
        from api.requests.api_deck_compose_stream import create_deck_compose_stream, StreamingDeckComposeRequest
        stream_request = StreamingDeckComposeRequest(
            deck_id=request.deck_id,
            outline=request.outline,
            force_restart=request.force_restart,
            async_images=getattr(request, 'async_images', True)  # Support async image selection
        )
        generator = create_deck_compose_stream(stream_request, REGISTRY, user_id=user_id)
        
        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
                    
    except Exception as e:
        logger.error(f"Error in deck compose stream: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/deck/create")
async def api_deck_create_endpoint(request: DeckComposeRequest):
    """
    Create a new deck from an outline
    """
    try:
        global REGISTRY
        result = await process_deck_outline(request, REGISTRY)
        
        if result and 'deck_data' in result:
            deck_data = result['deck_data']
            deck_uuid = deck_data.get('uuid', request.outline.id)
            
            if 'uuid' not in deck_data:
                raise Exception("Deck was composed but not uploaded to database")
            
            return DeckOutlineResponse(
                message=f"Deck '{request.outline.title}' created successfully with {len(request.outline.slides)} slides.",
                deck_outline_id=deck_uuid,
                timestamp=datetime.now()
            )
        else:
            raise Exception("Deck composition completed but no deck data was returned")
            
    except Exception as e:
        print(f"Error processing deck creation: {str(e)}")
        import traceback
        traceback.print_exc()
        
        return DeckOutlineResponse(
            message=f"Error processing deck creation: {str(e)}",
            deck_outline_id=request.outline.id,
            timestamp=datetime.now()
        )

@app.post("/api/deck/create-from-outline")
async def api_deck_create_from_outline_endpoint(request: dict, token: Optional[str] = Depends(get_auth_header)):
    """
    Create and compose a deck from an outline with streaming updates
    """
    outline = request.get('outline', {})
    num_slides = len(outline.get('slides', []))
    logger.info(f"Deck creation started: {outline.get('title', 'Untitled')} ({num_slides} slides)")
    
    # Extract user from token if available
    user_id = None
    if token:
        try:
            from services.supabase_auth_service import get_auth_service
            auth_service = get_auth_service()
            user = auth_service.get_user_with_token(token)
            if user:
                user_id = user.get('id')
                logger.info(f"Authenticated user for deck creation: {user_id}")
        except Exception as e:
            logger.warning(f"Could not extract user from token: {str(e)}")
    
    # Ensure outline has an ID before deduplication check
    if 'id' not in outline:
        outline['id'] = str(uuid.uuid4())
        logger.info(f"Generated outline ID: {outline['id']}")
    else:
        logger.info(f"Outline already has ID: {outline['id']}")

    # Track deck composition started in PostHog
    track_deck_composition_started(
        user_id=user_id,
        deck_id=outline['id'],
        slide_count=num_slides
    )
    
    # Log the request for debugging
    logger.warning(f"DECK CREATE REQUEST - Outline ID: {outline.get('id')}, Title: {outline.get('title')}, User: {user_id or 'anon'}")
    
    # Check for duplicate requests AFTER ensuring outline has an ID
    request_hash = _get_request_hash(outline, user_id)
    current_time = time.time()
    
    logger.info(f"Request hash: {request_hash}")
    
    # Clean up old entries
    _recent_deck_creations_copy = _recent_deck_creations.copy()
    for key, timestamp in _recent_deck_creations_copy.items():
        if current_time - timestamp > _DEDUP_WINDOW_SECONDS:
            del _recent_deck_creations[key]
    
    # Check if this is a duplicate request
    if request_hash in _recent_deck_creations:
        last_request_time = _recent_deck_creations[request_hash]
        time_since_last = current_time - last_request_time
        if time_since_last < _DEDUP_WINDOW_SECONDS:
            logger.warning(f"DUPLICATE DECK CREATION REJECTED - Same request within {time_since_last:.1f}s (limit: {_DEDUP_WINDOW_SECONDS}s)")
            logger.warning(f"  - Hash: {request_hash}")
            logger.warning(f"  - Title: {outline.get('title')}")
            logger.warning(f"  - Outline ID: {outline.get('id')}")
            raise HTTPException(
                status_code=429, 
                detail={
                    "error": "duplicate_request",
                    "message": f"Duplicate request detected. Please wait {_DEDUP_WINDOW_SECONDS} seconds between identical deck creation requests.",
                    "time_remaining": _DEDUP_WINDOW_SECONDS - time_since_last,
                    "outline_id": outline.get('id'),
                    "deck_id": outline.get('id'),  # Include deck_id for frontend navigation
                    "deck_url": f"/deck/{outline.get('id')}"  # Include deck_url as well
                }
            )
    
    # Record this request
    _recent_deck_creations[request_hash] = current_time
    logger.info(f"Request recorded with hash: {request_hash}")

    # ===== CREDIT TRACKING =====
    # Check credits and determine how many slides we can generate
    num_slides = len(outline.get('slides', []))
    slides_to_generate = num_slides
    is_partial_generation = False
    hidden_slides_count = 0
    force_sequential = False

    if user_id and num_slides > 0:
        from services.billing_service import get_billing_service, CreditAction
        billing = get_billing_service()

        credit_per_slide = billing.get_credit_cost(CreditAction.SLIDE_GENERATION)
        total_cost = num_slides * credit_per_slide
        balance = await billing.get_user_balance(user_id)

        if balance:
            logger.info(f"[CREDITS] User {user_id} balance: {balance.remaining_credits} credits, needs {total_cost} for {num_slides} slides")

            # For pro/enterprise, allow full generation
            if balance.plan_id in ('pro', 'enterprise'):
                slides_to_generate = num_slides
            else:
                # Calculate how many slides user can afford
                affordable_slides = balance.remaining_credits // credit_per_slide

                if affordable_slides < num_slides:
                    # Partial generation - generate what they can afford
                    slides_to_generate = max(0, affordable_slides)  # At least 0
                    hidden_slides_count = num_slides - slides_to_generate
                    is_partial_generation = True
                    force_sequential = True  # Generate sequentially for partial generations

                    logger.info(f"[CREDITS] PARTIAL: User can afford {slides_to_generate}/{num_slides} slides. {hidden_slides_count} slides will not be generated.")

                    # Truncate outline to only include affordable slides (no upgrade slide anymore)
                    if slides_to_generate > 0:
                        outline['slides'] = outline.get('slides', [])[:slides_to_generate]
                        logger.info(f"[CREDITS] Truncated outline to {slides_to_generate} slides")
                    else:
                        # User has 0 credits - return error so frontend shows paywall
                        logger.info(f"[CREDITS] User has no credits. Returning INSUFFICIENT_CREDITS error.")

                        async def insufficient_credits_response():
                            yield f"data: {json.dumps({'type': 'error', 'error': 'INSUFFICIENT_CREDITS', 'message': 'You have no credits remaining. Please upgrade to continue.', 'remaining': 0, 'required': num_slides * credit_per_slide, 'plan': 'free'})}\n\n"
                            yield f"data: {json.dumps({'type': 'end', 'message': 'Stream complete'})}\n\n"

                        return StreamingResponse(
                            insufficient_credits_response(),
                            media_type="text/event-stream",
                            headers={
                                "Cache-Control": "no-cache",
                                "Connection": "keep-alive",
                                "X-Accel-Buffering": "no"
                            }
                        )

            # Consume credits for the slides we're actually generating (not the upgrade slide)
            if slides_to_generate > 0:
                actual_cost = slides_to_generate * credit_per_slide
                success, remaining, overage = await billing.consume_credits(
                    user_id,
                    CreditAction.SLIDE_GENERATION,
                    metadata={
                        "deck_id": outline.get('id'),
                        "num_slides": slides_to_generate,
                        "total_cost": actual_cost,
                        "is_partial": is_partial_generation,
                        "hidden_slides": hidden_slides_count
                    },
                    description=f"Generate {slides_to_generate} slides for deck",
                    quantity=slides_to_generate
                )

                if success:
                    logger.info(f"[CREDITS] CONSUMED: {actual_cost} credits for {slides_to_generate} slides. Remaining: {remaining}")
                else:
                    logger.warning(f"[CREDITS] FAILED to consume credits for user {user_id}")
        else:
            logger.warning(f"[CREDITS] Could not get balance for user {user_id}")
    elif not user_id:
        logger.info("[CREDITS] No user_id - skipping credit tracking (anonymous user)")
    # ===== END CREDIT TRACKING =====

    try:
        # Use global registry
        global REGISTRY
        if REGISTRY is None:
            raise HTTPException(status_code=500, detail="Registry not initialized")
        
        # Import and create the request object from the proper module
        from api.requests.api_deck_create_stream import CreateDeckFromOutlineRequest, stream_deck_creation
        from agents.config import MAX_PARALLEL_SLIDES, DELAY_BETWEEN_SLIDES
        
        # Create the request object with the data from the raw request
        # Use sequential generation (max_parallel=1) for partial/paywall generations
        effective_max_parallel = 1 if force_sequential else request.get('max_parallel', MAX_PARALLEL_SLIDES)

        # Accept both snake_case and camelCase for style preferences
        style_prefs = request.get('stylePreferences') or request.get('style_preferences')

        create_request = CreateDeckFromOutlineRequest(
            outline=outline,
            stylePreferences=style_prefs,
            max_parallel=effective_max_parallel,
            delay_between_slides=request.get('delay_between_slides', DELAY_BETWEEN_SLIDES),
            async_images=request.get('async_images', False)  # Default to auto-apply mode to show image recommendations
        )

        # Store metadata in request for later use
        create_request._user_id = user_id
        create_request._is_partial_generation = is_partial_generation
        create_request._hidden_slides_count = hidden_slides_count
        
        # Create the streaming response
        generator = stream_deck_creation(create_request, REGISTRY)
        
        return StreamingResponse(
            generator,
            media_type="text/event-stream",
            headers={
                "Cache-Control": "no-cache",
                "Connection": "keep-alive",
                "X-Accel-Buffering": "no"
            }
        )
                    
    except Exception as e:
        logger.error(f"Error in deck creation stream: {e}")
        import traceback
        logger.error(traceback.format_exc())
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/deck/create-from-outline-debug")
async def api_deck_create_from_outline_debug_endpoint(request: dict):
    """Debug endpoint to see what's actually being sent"""
    print(f"\n{'='*80}")
    print(f"=== DEBUG: Raw request data ===")
    print(f"{'='*80}")
    print(f"Request keys: {list(request.keys())}")
    print(f"Full request: {json.dumps(request, indent=2)[:1000]}...")
    print(f"{'='*80}\n")
    
    return {"message": "Debug info printed to console", "received": request}

if __name__ == "__main__":
    # Run the server with uvicorn
    logger.info("Starting Slide Sorcery Chat API on http://127.0.0.1:9090")
    logger.info(f"Image Debug Visualization: {'ENABLED' if DEBUG_VISUALIZE_IMAGES else 'DISABLED'}")
    logger.info("Press CTRL+C to quit")
    
    # Get environment variables with defaults
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "9090"))
    
    logger.info(f"Server configured to run on {host}:{port}")
    
    # Set workers=1 (process) but enable multiple concurrent requests within the process
    # Enable reload for development
    uvicorn.run("api.chat_server:app", host=host, port=port, reload=True, workers=1, access_log=False)
