import os
import json
import uuid
import base64
import hmac
import hashlib
import logging
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Set, Tuple
import asyncio

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File, Response
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.pptx_importer import PPTXImporter
from services.agent_stream_bus import agent_stream_bus
from utils.background_tasks import create_background_task


logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["Google Integration"])


# ============================
# Models
# ============================


class OAuthInitResponse(BaseModel):
    url: str


class OAuthStatusResponse(BaseModel):
    connected: bool
    email: Optional[str] = None
    scopes: Optional[List[str]] = None


class JobResponse(BaseModel):
    jobId: str = Field(..., alias="jobId")


class SlidesImportRequest(BaseModel):
    presentationId: str


class ExportEditableRequest(BaseModel):
    deck: Dict[str, Any]
    options: Optional[Dict[str, Any]] = None


class ExportImagesRequest(BaseModel):
    deck: Dict[str, Any]
    options: Optional[Dict[str, Any]] = None


# ============================
# Utilities
# ============================


def _get_required_env(name: str) -> str:
    value = os.getenv(name)
    if not value:
        raise HTTPException(status_code=500, detail=f"Missing environment variable: {name}")
    return value


def _encode_state(payload: Dict[str, Any]) -> str:
    secret = os.getenv("GOOGLE_OAUTH_STATE_SECRET", os.getenv("STATE_HMAC_SECRET", ""))
    if not secret:
        # Fallback: unsigned state
        return base64.urlsafe_b64encode(json.dumps(payload).encode()).decode()
    raw = json.dumps(payload, separators=(",", ":")).encode()
    sig = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
    token = base64.urlsafe_b64encode(raw).decode() + "." + sig
    return token


def _decode_state(state: str) -> Dict[str, Any]:
    try:
        if "." in state:
            token, sig = state.rsplit(".", 1)
            raw = base64.urlsafe_b64decode(token.encode())
            secret = os.getenv("GOOGLE_OAUTH_STATE_SECRET", os.getenv("STATE_HMAC_SECRET", ""))
            if secret:
                expected = hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest()
                if not hmac.compare_digest(expected, sig):
                    raise ValueError("Invalid state signature")
            return json.loads(raw.decode())
        else:
            raw = base64.urlsafe_b64decode(state.encode())
            return json.loads(raw.decode())
    except Exception as e:
        logger.error(f"Failed to decode OAuth state: {e}")
        raise HTTPException(status_code=400, detail="Invalid OAuth state")


# Simple in-memory TTL cache for Slides presentation metadata (first/last slide lookup)
_presentation_cache: Dict[str, Dict[str, Any]] = {}
_presentation_cache_expiry: Dict[str, float] = {}
_presentation_cache_ttl_seconds = 60.0


def _cache_get(key: str) -> Optional[Dict[str, Any]]:
    now = datetime.utcnow().timestamp()
    exp = _presentation_cache_expiry.get(key)
    if exp is None or exp < now:
        # Expired
        if key in _presentation_cache:
            _presentation_cache.pop(key, None)
        _presentation_cache_expiry.pop(key, None)
        return None
    return _presentation_cache.get(key)


def _cache_set(key: str, value: Dict[str, Any]) -> None:
    _presentation_cache[key] = value
    _presentation_cache_expiry[key] = datetime.utcnow().timestamp() + _presentation_cache_ttl_seconds


# ============================
# Services (light wrappers to avoid circular imports)
# ============================


class GoogleTokenRecord(BaseModel):
    user_id: str
    provider_email: Optional[str] = None
    refresh_token: Optional[str] = None
    access_token: Optional[str] = None
    access_token_expiry: Optional[datetime] = None
    scopes: Optional[List[str]] = None


class GoogleTokenStorage:
    def __init__(self):
        from utils.supabase import get_supabase_client

        self.supabase = get_supabase_client()

    def _encrypt(self, plaintext: str) -> str:
        try:
            from cryptography.fernet import Fernet

            key = os.getenv("TOKEN_ENCRYPTION_KEY")
            if not key:
                logger.warning("TOKEN_ENCRYPTION_KEY not set; storing tokens unencrypted")
                return plaintext
            f = Fernet(key.encode())
            return f.encrypt(plaintext.encode()).decode()
        except Exception as e:
            logger.warning(f"Token encryption failed ({e}); storing plaintext")
            return plaintext

    def _decrypt(self, ciphertext: Optional[str]) -> Optional[str]:
        if not ciphertext:
            return None
        try:
            from cryptography.fernet import Fernet

            key = os.getenv("TOKEN_ENCRYPTION_KEY")
            if not key:
                return ciphertext
            f = Fernet(key.encode())
            return f.decrypt(ciphertext.encode()).decode()
        except Exception:
            return ciphertext

    def _parse_iso_datetime(self, value: Optional[str]) -> Optional[datetime]:
        if not value:
            return None
        try:
            # Handle trailing 'Z' as UTC
            v = value.replace('Z', '+00:00') if value.endswith('Z') else value
            dt = datetime.fromisoformat(v)
            # Ensure timezone-aware (UTC)
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=timezone.utc)
            return dt
        except Exception:
            return None

    def get_by_user(self, user_id: str) -> Optional[GoogleTokenRecord]:
        try:
            res = self.supabase.table("google_oauth_tokens").select("*").eq("user_id", user_id).limit(1).execute()
        except Exception as e:
            msg = str(e)
            if 'relation "public.google_oauth_tokens" does not exist' in msg:
                logger.warning("google_oauth_tokens table missing; reporting google auth as disconnected. Run scripts/add_google_integration_tables.sql")
                return None
            raise
        if not res.data:
            return None
        row = res.data[0]
        return GoogleTokenRecord(
            user_id=row.get("user_id"),
            provider_email=row.get("provider_email"),
            refresh_token=self._decrypt(row.get("refresh_token")),
            access_token=row.get("access_token"),
            access_token_expiry=self._parse_iso_datetime(row.get("access_token_expiry")),
            scopes=row.get("scopes") or [],
        )

    def upsert(self, record: GoogleTokenRecord) -> None:
        row = {
            "user_id": record.user_id,
            "provider_email": record.provider_email,
            "refresh_token": self._encrypt(record.refresh_token) if record.refresh_token else None,
            "access_token": record.access_token,
            "access_token_expiry": record.access_token_expiry.isoformat() if record.access_token_expiry else None,
            "scopes": record.scopes or [],
            "updated_at": datetime.utcnow().isoformat(),
        }
        try:
            self.supabase.table("google_oauth_tokens").upsert(row, on_conflict="user_id").execute()
        except Exception as e:
            msg = str(e)
            if 'relation "public.google_oauth_tokens" does not exist' in msg:
                logger.error("google_oauth_tokens table missing; run scripts/add_google_integration_tables.sql in your Supabase project")
                raise HTTPException(status_code=500, detail={"error": {"code": "SETUP_REQUIRED", "message": "Run add_google_integration_tables.sql to create required tables."}})
            raise

    def delete_by_user(self, user_id: str) -> None:
        try:
            self.supabase.table("google_oauth_tokens").delete().eq("user_id", user_id).execute()
        except Exception as e:
            msg = str(e)
            if 'relation "public.google_oauth_tokens" does not exist' in msg:
                logger.warning("google_oauth_tokens table missing during disconnect; ignoring")
                return
            raise


class GoogleOAuthService:
    def __init__(self):
        self.client_id = _get_required_env("GOOGLE_CLIENT_ID")
        self.client_secret = _get_required_env("GOOGLE_CLIENT_SECRET")
        self.default_redirect_uri = os.getenv("GOOGLE_REDIRECT_URI")
        self.scopes = [
            "https://www.googleapis.com/auth/presentations",
            "https://www.googleapis.com/auth/drive.file",
            "https://www.googleapis.com/auth/drive.readonly",
            "https://www.googleapis.com/auth/drive.metadata.readonly",
            # Sheets (readonly for binding)
            "https://www.googleapis.com/auth/spreadsheets.readonly",
        ]
        self.token_storage = GoogleTokenStorage()

    def build_consent_url(self, user_id: str, redirect_uri: Optional[str] = None) -> str:
        redirect = redirect_uri or self.default_redirect_uri
        if not redirect:
            raise HTTPException(status_code=400, detail="Missing redirectUri")
        state = _encode_state({
            "user_id": user_id,
            "redirect_uri": redirect,
            "nonce": uuid.uuid4().hex,
            "t": int(datetime.utcnow().timestamp()),
        })
        base = "https://accounts.google.com/o/oauth2/v2/auth"
        params = {
            "client_id": self.client_id,
            "response_type": "code",
            "redirect_uri": redirect,
            "scope": " ".join(self.scopes),
            "access_type": "offline",
            "prompt": "consent",
            "include_granted_scopes": "true",
            "state": state,
        }
        from urllib.parse import urlencode

        return f"{base}?{urlencode(params)}"

    async def exchange_code(self, code: str, redirect_uri: str) -> Dict[str, Any]:
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "code": code,
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "redirect_uri": redirect_uri,
            "grant_type": "authorization_code",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            raise HTTPException(status_code=400, detail=f"Token exchange failed: {resp.text}")
        return resp.json()

    async def refresh_access_token(self, user_id: str) -> Optional[str]:
        record = self.token_storage.get_by_user(user_id)
        if not record or not record.refresh_token:
            return None
        # Normalize to timezone-aware UTC
        now_utc = datetime.now(timezone.utc)
        expiry = record.access_token_expiry
        if expiry and expiry.tzinfo is None:
            expiry = expiry.replace(tzinfo=timezone.utc)
        if record.access_token and expiry and expiry > now_utc + timedelta(seconds=60):
            return record.access_token
        token_url = "https://oauth2.googleapis.com/token"
        data = {
            "client_id": self.client_id,
            "client_secret": self.client_secret,
            "refresh_token": record.refresh_token,
            "grant_type": "refresh_token",
        }
        async with httpx.AsyncClient(timeout=20.0) as client:
            resp = await client.post(token_url, data=data)
        if resp.status_code != 200:
            logger.error(f"Token refresh failed: {resp.text}")
            return None
        body = resp.json()
        access_token = body.get("access_token")
        expires_in = body.get("expires_in")
        if access_token and expires_in:
            record.access_token = access_token
            record.access_token_expiry = datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
            self.token_storage.upsert(record)
        return access_token

    async def revoke(self, access_token: Optional[str], refresh_token: Optional[str]) -> None:
        try:
            async with httpx.AsyncClient(timeout=10.0) as client:
                if refresh_token:
                    await client.post("https://oauth2.googleapis.com/revoke", params={"token": refresh_token})
                if access_token:
                    await client.post("https://oauth2.googleapis.com/revoke", params={"token": access_token})
        except Exception as e:
            logger.warning(f"Token revoke failed: {e}")


class GoogleApiClient:
    _shared_client: Optional[httpx.AsyncClient] = None
    _client_lock = asyncio.Lock()

    def __init__(self, oauth: GoogleOAuthService):
        self.oauth = oauth

    @classmethod
    async def _get_client(cls, headers: Optional[Dict[str, str]] = None) -> httpx.AsyncClient:
        # Lazy-init a shared AsyncClient with connection pooling and HTTP/2
        async with cls._client_lock:
            if cls._shared_client is None:
                cls._shared_client = httpx.AsyncClient(
                    timeout=20.0,
                    http2=True,
                    limits=httpx.Limits(
                        max_connections=100,
                        max_keepalive_connections=20
                    )
                )
        # Note: headers will still be passed per-request; do not set on client
        return cls._shared_client

    async def slides_get_presentation_cached(self, user_id: str, presentation_id: str) -> Dict[str, Any]:
        cache_key = f"pres:{user_id}:{presentation_id}"
        cached = _cache_get(cache_key)
        if cached is not None:
            return cached
        headers = await self._auth_headers(user_id)
        url = f"https://slides.googleapis.com/v1/presentations/{presentation_id}"
        client = await self._get_client()
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        body = resp.json()
        _cache_set(cache_key, body)
        return body

    async def _auth_headers(self, user_id: str) -> Dict[str, str]:
        token = await self.oauth.refresh_access_token(user_id)
        if not token:
            raise HTTPException(status_code=401, detail={"error": {"code": "TOKEN_MISSING", "message": "Google account not connected."}})
        return {"Authorization": f"Bearer {token}"}

    async def drive_watch_file(self, user_id: str, file_id: str, channel_id: str, webhook_url: str, channel_token: Optional[str] = None, ttl_seconds: int = 3600) -> Dict[str, Any]:
        """Register a Drive push notification channel for a file (spreadsheet).
        Docs: https://developers.google.com/drive/api/v3/push
        """
        headers = await self._auth_headers(user_id)
        headers = {**headers, "Content-Type": "application/json"}
        client = await self._get_client()
        body = {
            "id": channel_id,
            "type": "web_hook",
            "address": webhook_url,
        }
        if channel_token:
            body["token"] = channel_token
        # Note: Drive v3 changes.watch is preferred for broader scope; files.watch works per-file
        url = f"https://www.googleapis.com/drive/v3/files/{file_id}/watch"
        resp = await client.post(url, headers=headers, json=body)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

    async def drive_list_presentations(self, user_id: str, query: Optional[str], page_token: Optional[str], page_size: int = 20, scope: Optional[str] = None) -> Dict[str, Any]:
        headers = await self._auth_headers(user_id)
        base = "https://www.googleapis.com/drive/v3/files"
        q = ["mimeType = 'application/vnd.google-apps.presentation'", "trashed = false"]
        if query:
            escaped_query = query.replace("'", "\\'")
            q.append(f"name contains '{escaped_query}'")
        # Scope filter: mine | shared | all(default)
        scope_norm = (scope or "").strip().lower()
        if scope_norm == "mine":
            q.append("'me' in owners")
        elif scope_norm == "shared":
            q.append("sharedWithMe")
        # Clamp page_size to safe bounds
        if not isinstance(page_size, int):
            page_size = 20
        page_size = max(5, min(50, page_size))
        params = {
            "q": " and ".join(q),
            "fields": "nextPageToken, files(id, name, modifiedTime, owners, thumbnailLink)",
            "pageSize": str(page_size),
            "orderBy": "modifiedTime desc",
        }
        if page_token:
            params["pageToken"] = page_token
        client = await self._get_client()
        resp = await client.get(base, params=params, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

    async def drive_list_spreadsheets(self, user_id: str, query: Optional[str], page_token: Optional[str], page_size: int = 20, scope: Optional[str] = None) -> Dict[str, Any]:
        headers = await self._auth_headers(user_id)
        base = "https://www.googleapis.com/drive/v3/files"
        q = ["mimeType = 'application/vnd.google-apps.spreadsheet'", "trashed = false"]
        if query:
            escaped_query = query.replace("'", "\\'")
            q.append(f"name contains '{escaped_query}'")
        scope_norm = (scope or "").strip().lower()
        if scope_norm == "mine":
            q.append("'me' in owners")
        elif scope_norm == "shared":
            q.append("sharedWithMe")
        if not isinstance(page_size, int):
            page_size = 20
        page_size = max(5, min(50, page_size))
        params = {
            "q": " and ".join(q),
            "fields": "nextPageToken, files(id, name, modifiedTime, owners)",
            "pageSize": str(page_size),
            "orderBy": "modifiedTime desc",
        }
        if page_token:
            params["pageToken"] = page_token
        client = await self._get_client()
        resp = await client.get(base, params=params, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

    async def sheets_get_metadata(self, user_id: str, spreadsheet_id: str) -> Dict[str, Any]:
        headers = await self._auth_headers(user_id)
        client = await self._get_client()
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}"
        # Request only minimal fields to list sheet tabs
        params = {"fields": "spreadsheetId,properties(title),sheets(properties(sheetId,title))"}
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

    async def sheets_values_get(self, user_id: str, spreadsheet_id: str, range_a1: str) -> Tuple[Dict[str, Any], Optional[str]]:
        headers = await self._auth_headers(user_id)
        client = await self._get_client()
        url = f"https://sheets.googleapis.com/v4/spreadsheets/{spreadsheet_id}/values/{range_a1}"
        # Ask for valueRenderOption=UNFORMATTED_VALUE to coerce numbers cleanly
        params = {"valueRenderOption": "UNFORMATTED_VALUE"}
        resp = await client.get(url, params=params, headers=headers)
        if resp.status_code == 200:
            etag = resp.headers.get("ETag")
            return resp.json(), etag
        raise HTTPException(status_code=resp.status_code, detail=resp.text)

    async def slides_get_presentation(self, user_id: str, presentation_id: str) -> Dict[str, Any]:
        headers = await self._auth_headers(user_id)
        url = f"https://slides.googleapis.com/v1/presentations/{presentation_id}"
        client = await self._get_client()
        resp = await client.get(url, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()

    async def slides_get_page_thumbnail(self, user_id: str, presentation_id: str, page_id: str, size: Optional[str] = None, mime: Optional[str] = None) -> Dict[str, Any]:
        headers = await self._auth_headers(user_id)
        base = f"https://slides.googleapis.com/v1/presentations/{presentation_id}/pages/{page_id}/thumbnail"
        params: Dict[str, Any] = {}
        if size:
            params["thumbnailProperties.thumbnailSize"] = size
        if mime:
            params["thumbnailProperties.mimeType"] = mime
        client = await self._get_client()
        resp = await client.get(base, params=params, headers=headers)
        if resp.status_code != 200:
            raise HTTPException(status_code=resp.status_code, detail=resp.text)
        return resp.json()


# ============================
# Jobs (minimal scaffolding)
# ============================


class JobType:
    IMPORT_SLIDES = "IMPORT_SLIDES"
    IMPORT_PPTX = "IMPORT_PPTX"
    EXPORT_EDITABLE = "EXPORT_EDITABLE"
    EXPORT_IMAGES = "EXPORT_IMAGES"


class JobStatus:
    QUEUED = "QUEUED"
    RUNNING = "RUNNING"
    SUCCEEDED = "SUCCEEDED"
    FAILED = "FAILED"


class ConversionJobs:
    def __init__(self):
        # In-memory progress cache for quick updates without DB writes
        self._progress_cache: Dict[str, Dict[str, Any]] = {}

    def _get_client(self):
        """Get a fresh Supabase client for each operation to avoid stale connections."""
        from utils.supabase import get_supabase_client
        return get_supabase_client()

    def create(self, user_id: str, job_type: str, input_payload: Dict[str, Any]) -> str:
        job_id = str(uuid.uuid4())
        row = {
            "id": job_id,
            "user_id": user_id,
            "type": job_type,
            "status": JobStatus.QUEUED,
            "input": input_payload,
            "created_at": datetime.utcnow().isoformat(),
            "updated_at": datetime.utcnow().isoformat(),
        }
        self._get_client().table("conversion_jobs").insert(row).execute()
        self._progress_cache[job_id] = {"currentSlide": 0, "totalSlides": 0, "progress": 0}
        return job_id

    def update(self, job_id: str, status: str, result: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {"status": status, "updated_at": datetime.utcnow().isoformat()}
        if result is not None:
            payload["result"] = result
        if error is not None:
            payload["error"] = error
        self._get_client().table("conversion_jobs").update(payload).eq("id", job_id).execute()
        # Clear progress cache on completion
        if status in (JobStatus.SUCCEEDED, JobStatus.FAILED):
            self._progress_cache.pop(job_id, None)

    def update_progress(self, job_id: str, current_slide: int, total_slides: int) -> None:
        """Update job progress (in-memory only for speed)."""
        progress = int((current_slide / total_slides) * 100) if total_slides > 0 else 0
        self._progress_cache[job_id] = {
            "currentSlide": current_slide,
            "totalSlides": total_slides,
            "progress": progress
        }

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        res = self._get_client().table("conversion_jobs").select("*").eq("id", job_id).limit(1).execute()
        if not res.data:
            return None
        job = res.data[0]
        # Merge in-memory progress data
        if job_id in self._progress_cache:
            job["progress"] = self._progress_cache[job_id]
        return job


jobs_store = ConversionJobs()


# ==============================================================================
# Google Slides to CustomComponent Converter
# ==============================================================================
#
# This module converts Google Slides presentations directly to CustomComponents.
# Each slide becomes a single CustomComponent that renders the slide as HTML/CSS,
# providing perfect visual fidelity without needing to map to individual components.
# ==============================================================================


async def _convert_google_slides_to_custom_components(
    presentation: Dict[str, Any],
    user_id: str,
    access_token: str,
    job_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convert a Google Slides presentation to a deck using CustomComponents.

    Uses DIRECT DATA PARSING - no vision AI. Reads exact positions, sizes, fonts,
    colors from Google Slides API and generates deterministic HTML.

    Args:
        presentation: The Google Slides API presentation data
        user_id: The user's ID for authentication
        access_token: OAuth access token for downloading images
        job_id: Optional job ID for progress tracking

    Returns:
        A deck dictionary with slides containing CustomComponents
    """
    # Get presentation metadata
    title = presentation.get("title", "Imported Presentation")
    presentation_id = presentation.get("presentationId", "")
    slides_data = presentation.get("slides", [])

    # Get page size for coordinate conversion
    page_size = presentation.get("pageSize", {})
    page_width_emu = page_size.get("width", {}).get("magnitude", 9144000)
    page_height_emu = page_size.get("height", {}).get("magnitude", 5143500)

    logger.info(f"[GoogleSlidesImport] ===== STARTING IMPORT =====")
    logger.info(f"[GoogleSlidesImport] Presentation: {title} ({presentation_id})")
    logger.info(f"[GoogleSlidesImport] Page size: {page_width_emu} x {page_height_emu} EMU")
    logger.info(f"[GoogleSlidesImport] Slide count: {len(slides_data)}")

    # Extract theme colors for reference
    theme_colors = _extract_theme_colors(presentation)
    logger.info(f"[GoogleSlidesImport] Theme colors: {theme_colors}")

    slides_out = []
    total_slides = len(slides_data)

    for idx, slide in enumerate(slides_data):
        slide_id = slide.get("objectId", str(uuid.uuid4()))
        slide_title = _extract_slide_title(slide) or f"Slide {idx + 1}"

        logger.info(f"[GoogleSlidesImport] ----- Processing slide {idx + 1}/{total_slides}: {slide_id} -----")

        try:
            # Generate HTML from slide data (deterministic, no AI)
            html_content = await _generate_slide_html_from_data(
                slide=slide,
                slide_index=idx,
                page_width_emu=page_width_emu,
                page_height_emu=page_height_emu,
                theme_colors=theme_colors,
                access_token=access_token
            )

            custom_component = {
                "id": str(uuid.uuid4()),
                "type": "CustomComponent",
                "props": {
                    "position": {"x": 0, "y": 0},
                    "width": 1920,
                    "height": 1080,
                    "rotation": 0,
                    "opacity": 1,
                    "zIndex": 1,
                    "render": html_content,
                    "props": {
                        "slideIndex": idx,
                        "sourceType": "google_slides_parsed"
                    }
                }
            }

            slides_out.append({
                "id": slide_id,
                "title": slide_title,
                "components": [custom_component]
            })

            logger.info(f"[GoogleSlidesImport] Slide {idx + 1} converted successfully")

        except Exception as e:
            logger.error(f"[GoogleSlidesImport] ERROR on slide {idx + 1}: {e}", exc_info=True)
            slides_out.append({
                "id": str(uuid.uuid4()),
                "title": f"Slide {idx + 1} (Error)",
                "components": [_create_error_slide_component(str(e))]
            })

        # Update progress
        if job_id:
            jobs_store.update_progress(job_id, idx + 1, total_slides)

    logger.info(f"[GoogleSlidesImport] ===== IMPORT COMPLETE: {len(slides_out)} slides =====")

    return {
        "uuid": str(uuid.uuid4()),
        "name": title,
        "slides": slides_out,
        "size": {"width": 1920, "height": 1080},
        "metadata": {
            "source": "google_slides_parsed",
            "import_stats": {
                "slides": len(slides_out),
                "method": "data_parsing"
            }
        }
    }


async def _generate_slide_html_from_data(
    slide: Dict[str, Any],
    slide_index: int,
    page_width_emu: int,
    page_height_emu: int,
    theme_colors: Dict[str, str],
    access_token: str
) -> str:
    """
    Generate HTML for a slide by parsing the Google Slides API data directly.
    No AI - deterministic HTML generation from exact positions and styles.
    """
    import html as html_module

    # Output dimensions
    OUT_WIDTH = 1920
    OUT_HEIGHT = 1080

    # Calculate font scale factor
    # Google Slides uses points (1/72 inch). We need to scale to our output canvas.
    # Formula: output_width / (page_width_in_inches * 72)
    EMU_PER_INCH = 914400
    page_width_inches = page_width_emu / EMU_PER_INCH
    font_scale = OUT_WIDTH / (page_width_inches * 72)
    logger.info(f"[GoogleSlidesImport] Font scale: {font_scale:.3f} (page {page_width_inches:.2f}\" wide, 12pt -> {round(12 * font_scale)}px)")

    # Track all fonts used in this slide for dynamic Google Fonts loading
    fonts_used: Set[str] = set()

    def emu_to_px_x(emu: float) -> float:
        """Convert EMU to pixels (X axis)."""
        return (emu / page_width_emu) * OUT_WIDTH

    def emu_to_px_y(emu: float) -> float:
        """Convert EMU to pixels (Y axis)."""
        return (emu / page_height_emu) * OUT_HEIGHT

    def rgb_to_hex(rgb: Dict[str, Any]) -> str:
        """Convert Google RGB (0-1) to hex color."""
        if not rgb:
            return "#000000"
        r = int((rgb.get("red", 0) or 0) * 255)
        g = int((rgb.get("green", 0) or 0) * 255)
        b = int((rgb.get("blue", 0) or 0) * 255)
        return f"#{r:02X}{g:02X}{b:02X}"

    def resolve_color(color_obj: Dict[str, Any]) -> str:
        """Resolve a Google Slides color object to hex."""
        if not color_obj:
            return "#000000"

        # RGB color
        rgb_color = color_obj.get("rgbColor")
        if rgb_color:
            return rgb_to_hex(rgb_color)

        # Theme color reference
        theme_ref = color_obj.get("themeColor")
        if theme_ref and theme_ref in theme_colors:
            return theme_colors[theme_ref]

        return "#000000"

    def get_element_bounds(el: Dict[str, Any], parent_transform: Optional[Dict[str, Any]] = None) -> Dict[str, float]:
        """Extract position and size from element, accounting for transform and parent transform.
        Returns bounds dict with left, top, width, height, and optional rotation/flip transforms.
        """
        import math

        # Size in EMU
        size = el.get("size", {})
        width_emu = size.get("width", {}).get("magnitude", 0) or 0
        height_emu = size.get("height", {}).get("magnitude", 0) or 0

        # Transform matrix
        transform = el.get("transform", {})
        scale_x = transform.get("scaleX", 1) or 1
        scale_y = transform.get("scaleY", 1) or 1
        shear_x = transform.get("shearX", 0) or 0
        shear_y = transform.get("shearY", 0) or 0
        translate_x = transform.get("translateX", 0) or 0
        translate_y = transform.get("translateY", 0) or 0

        # Apply parent transform if in a group
        if parent_transform:
            parent_scale_x = parent_transform.get("scaleX", 1) or 1
            parent_scale_y = parent_transform.get("scaleY", 1) or 1
            parent_translate_x = parent_transform.get("translateX", 0) or 0
            parent_translate_y = parent_transform.get("translateY", 0) or 0

            # Combine transforms: apply child transform then parent transform
            translate_x = translate_x * parent_scale_x + parent_translate_x
            translate_y = translate_y * parent_scale_y + parent_translate_y
            scale_x = scale_x * parent_scale_x
            scale_y = scale_y * parent_scale_y

        # Calculate rotation from shear values (when shear_x = -sin(θ), shear_y = sin(θ))
        rotation_deg = 0
        if shear_x != 0 or shear_y != 0:
            # For pure rotation: shear_y = sin(θ), and scale_x = cos(θ)
            rotation_rad = math.atan2(shear_y, scale_x)
            rotation_deg = math.degrees(rotation_rad)

        # Check for flips (negative scale without shear usually means flip)
        flip_x = scale_x < 0 and shear_x == 0 and shear_y == 0
        flip_y = scale_y < 0 and shear_x == 0 and shear_y == 0

        # Apply scale to size, translate to position
        actual_width_emu = width_emu * abs(scale_x)
        actual_height_emu = height_emu * abs(scale_y)

        bounds = {
            "left": emu_to_px_x(translate_x),
            "top": emu_to_px_y(translate_y),
            "width": emu_to_px_x(actual_width_emu),
            "height": emu_to_px_y(actual_height_emu),
            "rotation": rotation_deg,
            "flip_x": flip_x,
            "flip_y": flip_y
        }

        logger.debug(f"[GoogleSlidesImport] Element bounds: size={width_emu}x{height_emu} EMU, "
                    f"scale={scale_x},{scale_y}, shear={shear_x},{shear_y}, "
                    f"rotation={rotation_deg:.1f}°, flip=({flip_x},{flip_y}), "
                    f"result={bounds}")

        return bounds

    def get_outline_style(outline: Dict[str, Any]) -> str:
        """Extract outline/border style from shape properties."""
        if not outline:
            return ""

        # Check if outline should be rendered
        property_state = outline.get("propertyState", "")
        if property_state == "NOT_RENDERED":
            return ""

        outline_fill = outline.get("outlineFill", {})
        if not outline_fill:
            return ""

        # Get outline color
        outline_color = "#000000"
        if "solidFill" in outline_fill:
            outline_color = resolve_color(outline_fill["solidFill"].get("color", {}))

        # Get outline weight - Google Slides uses EMU where 9525 EMU = 1 point
        # Scale to our canvas: 1 point at 72 DPI in a 1920px wide canvas
        weight = outline.get("weight", {})
        weight_px = 1
        if weight and weight.get("magnitude"):
            weight_emu = weight.get("magnitude", 9525)
            weight_pt = weight_emu / 9525  # EMU to points
            weight_px = max(1, weight_pt * font_scale)  # Scale to canvas

        # Get dash style
        dash_style = outline.get("dashStyle", "SOLID")
        border_style = "solid"
        if dash_style == "DASH":
            border_style = "dashed"
        elif dash_style == "DOT":
            border_style = "dotted"

        return f"border: {weight_px:.1f}px {border_style} {outline_color};"

    def get_transform_css(bounds: Dict[str, Any]) -> str:
        """Generate CSS transform string for rotation and flipping."""
        transforms = []
        rotation = bounds.get("rotation", 0)
        flip_x = bounds.get("flip_x", False)
        flip_y = bounds.get("flip_y", False)

        if rotation != 0:
            transforms.append(f"rotate({rotation:.1f}deg)")
        if flip_x:
            transforms.append("scaleX(-1)")
        if flip_y:
            transforms.append("scaleY(-1)")

        if transforms:
            return f"transform: {' '.join(transforms)}; transform-origin: center center;"
        return ""

    async def process_element(el: Dict[str, Any], el_idx: int, parent_transform: Optional[Dict[str, Any]] = None) -> str:
        """Process a single page element and return HTML."""
        nonlocal fonts_used

        el_id = el.get("objectId", f"el_{el_idx}")
        bounds = get_element_bounds(el, parent_transform)

        # Skip elements with no size (but allow very small elements)
        if bounds["width"] < 1 and bounds["height"] < 1:
            logger.warning(f"[GoogleSlidesImport] Skipping element {el_id}: too small")
            return ""

        element_html = ""

        # Handle grouped elements recursively
        element_group = el.get("elementGroup", {})
        if element_group:
            children = element_group.get("children", [])
            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Group with {len(children)} children")

            # Get group transform to apply to children
            group_transform = el.get("transform", {})

            group_children_html = []
            for child_idx, child in enumerate(children):
                child_html = await process_element(child, f"{el_idx}_{child_idx}", group_transform)
                if child_html:
                    group_children_html.append(child_html)

            if group_children_html:
                element_html = "\n".join(group_children_html)
            return element_html

        # Shape with text or plain shape
        shape = el.get("shape", {})
        if shape:
            shape_type = shape.get("shapeType", "RECTANGLE")
            shape_props = shape.get("shapeProperties", {})
            text_obj = shape.get("text", {})

            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Shape type={shape_type}, "
                       f"bounds=({bounds['left']:.0f},{bounds['top']:.0f},{bounds['width']:.0f}x{bounds['height']:.0f})")

            # Shape fill - check propertyState to determine if fill should be rendered
            fill_color = None
            outline = shape_props.get("outline", {})
            shape_bg = shape_props.get("shapeBackgroundFill", {})
            property_state = shape_bg.get("propertyState", "")

            should_apply_fill = False
            if "solidFill" in shape_bg:
                if property_state == "RENDERED":
                    should_apply_fill = True
                elif property_state == "NOT_RENDERED":
                    should_apply_fill = False
                elif property_state == "INHERIT":
                    should_apply_fill = shape_type != "TEXT_BOX"
                else:
                    should_apply_fill = shape_type != "TEXT_BOX"

            if should_apply_fill:
                solid_fill = shape_bg["solidFill"]
                fill_color = resolve_color(solid_fill.get("color", {}))
                alpha = solid_fill.get("alpha")
                if alpha is not None and alpha < 1.0:
                    if fill_color.startswith("#"):
                        r = int(fill_color[1:3], 16)
                        g = int(fill_color[3:5], 16)
                        b = int(fill_color[5:7], 16)
                        fill_color = f"rgba({r},{g},{b},{alpha:.2f})"
                logger.info(f"[GoogleSlidesImport] Shape {el_idx} fill: {fill_color} (state={property_state})")
            else:
                logger.debug(f"[GoogleSlidesImport] Shape {el_idx} no fill (state={property_state}, type={shape_type})")

            # Border radius for certain shapes
            border_radius = ""
            if shape_type == "ELLIPSE":
                border_radius = "border-radius: 50%;"
            elif shape_type == "ROUND_RECTANGLE":
                border_radius = "border-radius: 8px;"

            # Get outline style
            outline_style = get_outline_style(outline)

            # Process text content
            text_html = ""
            if text_obj and text_obj.get("textElements"):
                text_html = _process_text_elements_with_fonts(text_obj, theme_colors, resolve_color, fonts_used, font_scale)
                logger.debug(f"[GoogleSlidesImport] Text content: {text_html[:100] if text_html else 'empty'}...")

            # Get content alignment (vertical alignment within shape)
            content_alignment = shape_props.get("contentAlignment", "TOP")
            justify_content = "flex-start"  # TOP
            if content_alignment == "MIDDLE":
                justify_content = "center"
            elif content_alignment == "BOTTOM":
                justify_content = "flex-end"

            # Generate element HTML with proper text container
            # Google Slides default text box internal padding is ~0.05" (~5px)
            transform_css = get_transform_css(bounds)
            style = (
                f"position: absolute; "
                f"left: {bounds['left']:.1f}px; "
                f"top: {bounds['top']:.1f}px; "
                f"width: {bounds['width']:.1f}px; "
                f"height: {bounds['height']:.1f}px; "
                f"overflow: hidden; "
                f"display: flex; "
                f"flex-direction: column; "
                f"justify-content: {justify_content}; "
                f"padding: 5px; "
                f"box-sizing: border-box; "
            )
            if fill_color and fill_color.upper() != "#00000000":
                style += f"background-color: {fill_color}; "
            if border_radius:
                style += border_radius
            if outline_style:
                style += outline_style
            if transform_css:
                style += transform_css

            element_html = f'<div style="{style}">{text_html}</div>'

        # Image
        image = el.get("image", {})
        if image:
            # Try multiple URL sources - contentUrl is preferred, but sourceUrl may work for some images
            content_url = image.get("contentUrl", "")
            source_url = image.get("sourceUrl", "")

            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Image, contentUrl={content_url[:60] if content_url else 'none'}..., sourceUrl={source_url[:60] if source_url else 'none'}...")

            # Try content URL first (usually Google-hosted), then source URL
            image_data_url = None
            if content_url:
                image_data_url = await _download_and_encode_image(content_url, access_token)

            if not image_data_url and source_url:
                logger.info(f"[GoogleSlidesImport] Trying sourceUrl for image...")
                image_data_url = await _download_and_encode_image(source_url, access_token)

            if image_data_url:
                # Check for image crop properties
                image_props = image.get("imageProperties", {})
                crop = image_props.get("cropProperties", {})

                # Crop values are ratios (0-1) of how much to cut from each side
                left_offset = crop.get("leftOffset", 0) or 0
                right_offset = crop.get("rightOffset", 0) or 0
                top_offset = crop.get("topOffset", 0) or 0
                bottom_offset = crop.get("bottomOffset", 0) or 0

                has_crop = left_offset or right_offset or top_offset or bottom_offset

                if has_crop:
                    # Calculate the visible portion of the image
                    # visible_width_ratio = 1 - left_offset - right_offset
                    # visible_height_ratio = 1 - top_offset - bottom_offset
                    visible_width_ratio = max(0.01, 1 - left_offset - right_offset)
                    visible_height_ratio = max(0.01, 1 - top_offset - bottom_offset)

                    # The image needs to be scaled up so the visible portion fills the bounds
                    # Then positioned so the crop offsets are applied
                    img_width = bounds['width'] / visible_width_ratio
                    img_height = bounds['height'] / visible_height_ratio
                    img_left = -left_offset * img_width
                    img_top = -top_offset * img_height

                    # Use a container div for the crop
                    transform_css = get_transform_css(bounds)
                    container_style = (
                        f"position: absolute; "
                        f"left: {bounds['left']:.1f}px; "
                        f"top: {bounds['top']:.1f}px; "
                        f"width: {bounds['width']:.1f}px; "
                        f"height: {bounds['height']:.1f}px; "
                        f"overflow: hidden; "
                    )
                    if transform_css:
                        container_style += transform_css
                    img_style = (
                        f"position: absolute; "
                        f"left: {img_left:.1f}px; "
                        f"top: {img_top:.1f}px; "
                        f"width: {img_width:.1f}px; "
                        f"height: {img_height:.1f}px; "
                    )
                    element_html = f'<div style="{container_style}"><img src="{image_data_url}" style="{img_style}" /></div>'
                    logger.debug(f"[GoogleSlidesImport] Cropped image: offsets=({left_offset:.2f},{top_offset:.2f},{right_offset:.2f},{bottom_offset:.2f})")
                else:
                    # No crop - use object-fit to fill the bounds
                    transform_css = get_transform_css(bounds)
                    style = (
                        f"position: absolute; "
                        f"left: {bounds['left']:.1f}px; "
                        f"top: {bounds['top']:.1f}px; "
                        f"width: {bounds['width']:.1f}px; "
                        f"height: {bounds['height']:.1f}px; "
                        f"object-fit: fill; "
                    )
                    if transform_css:
                        style += transform_css
                    element_html = f'<img src="{image_data_url}" style="{style}" />'
            else:
                logger.warning(f"[GoogleSlidesImport] Failed to download image: {content_url[:60] if content_url else source_url[:60] if source_url else 'no url'}")

        # Line
        line = el.get("line", {})
        if line:
            line_props = line.get("lineProperties", {})
            stroke_color = "#000000"
            stroke_width = 1

            line_fill = line_props.get("lineFill", {})
            if "solidFill" in line_fill:
                stroke_color = resolve_color(line_fill["solidFill"].get("color", {}))

            weight = line_props.get("weight", {})
            if weight and weight.get("magnitude"):
                weight_emu = weight.get("magnitude", 9525)
                weight_pt = weight_emu / 9525  # EMU to points
                stroke_width = max(1, weight_pt * font_scale)  # Scale to canvas

            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Line, color={stroke_color}, width={stroke_width}")

            # Determine line direction from start and end connections or transform
            line_type = line.get("lineType", "STRAIGHT_LINE")
            line_category = line.get("lineCategory", "STRAIGHT")

            style = (
                f"position: absolute; "
                f"left: {bounds['left']:.1f}px; "
                f"top: {bounds['top']:.1f}px; "
                f"width: {bounds['width']:.1f}px; "
                f"height: {max(stroke_width, 1):.1f}px; "
                f"background-color: {stroke_color}; "
            )
            element_html = f'<div style="{style}"></div>'

        # Table
        table = el.get("table", {})
        if table:
            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Table")
            element_html = _process_table_element(table, bounds, theme_colors, resolve_color, font_scale)

        # SheetsChart - render as placeholder or fetch chart image
        sheets_chart = el.get("sheetsChart", {})
        if sheets_chart:
            logger.info(f"[GoogleSlidesImport] Element {el_idx}: SheetsChart")
            # Try to get the rendered chart image
            content_url = sheets_chart.get("contentUrl", "")
            if content_url:
                image_data_url = await _download_and_encode_image(content_url, access_token)
                if image_data_url:
                    style = (
                        f"position: absolute; "
                        f"left: {bounds['left']:.1f}px; "
                        f"top: {bounds['top']:.1f}px; "
                        f"width: {bounds['width']:.1f}px; "
                        f"height: {bounds['height']:.1f}px; "
                        f"object-fit: contain; "
                    )
                    element_html = f'<img src="{image_data_url}" style="{style}" />'

        # Video - render as placeholder with thumbnail
        video = el.get("video", {})
        if video:
            logger.info(f"[GoogleSlidesImport] Element {el_idx}: Video")
            thumb_url = video.get("thumbnail", {}).get("contentUrl", "")
            if thumb_url:
                image_data_url = await _download_and_encode_image(thumb_url, access_token)
                if image_data_url:
                    style = (
                        f"position: absolute; "
                        f"left: {bounds['left']:.1f}px; "
                        f"top: {bounds['top']:.1f}px; "
                        f"width: {bounds['width']:.1f}px; "
                        f"height: {bounds['height']:.1f}px; "
                        f"object-fit: cover; "
                    )
                    element_html = f'<div style="{style}; display: flex; align-items: center; justify-content: center; background: #000;"><img src="{image_data_url}" style="max-width: 100%; max-height: 100%;" /><div style="position: absolute; width: 60px; height: 60px; background: rgba(255,255,255,0.8); border-radius: 50%; display: flex; align-items: center; justify-content: center;">▶</div></div>'

        # WordArt
        word_art = el.get("wordArt", {})
        if word_art:
            rendered_text = word_art.get("renderedText", "")
            logger.info(f"[GoogleSlidesImport] Element {el_idx}: WordArt - '{rendered_text[:30]}'")
            style = (
                f"position: absolute; "
                f"left: {bounds['left']:.1f}px; "
                f"top: {bounds['top']:.1f}px; "
                f"width: {bounds['width']:.1f}px; "
                f"height: {bounds['height']:.1f}px; "
                f"display: flex; align-items: center; justify-content: center; "
                f"font-size: {bounds['height'] * 0.6:.0f}px; font-weight: bold; "
            )
            element_html = f'<div style="{style}">{html_module.escape(rendered_text)}</div>'

        return element_html

    # Extract background color and image
    bg_color = "#FFFFFF"
    bg_image_url = None
    page_props = slide.get("pageProperties", {})
    page_bg = page_props.get("pageBackgroundFill", {})

    if "solidFill" in page_bg:
        bg_color = resolve_color(page_bg["solidFill"].get("color", {}))
    elif "stretchedPictureFill" in page_bg:
        bg_image_url = page_bg["stretchedPictureFill"].get("contentUrl", "")

    logger.info(f"[GoogleSlidesImport] Slide {slide_index + 1} background: color={bg_color}, image={'yes' if bg_image_url else 'no'}")

    # Process all page elements using the new recursive function
    elements_html = []
    page_elements = slide.get("pageElements", [])
    logger.info(f"[GoogleSlidesImport] Slide {slide_index + 1} has {len(page_elements)} elements")

    for el_idx, el in enumerate(page_elements):
        element_html = await process_element(el, el_idx)
        if element_html:
            elements_html.append(element_html)

    # Build complete HTML document with dynamic Google Fonts
    elements_str = "\n    ".join(elements_html)

    # Generate Google Fonts link for all fonts used in this slide
    fonts_link = ""
    if fonts_used:
        # Format fonts for Google Fonts API
        # Only skip generic CSS font families, load everything else from Google Fonts
        google_fonts = []
        generic_fonts = {"sans-serif", "serif", "monospace", "cursive", "fantasy", "system-ui", "ui-sans-serif", "ui-serif", "ui-monospace"}
        for font in fonts_used:
            font_lower = font.lower().strip()
            if font_lower not in generic_fonts and font_lower:
                # URL encode font name and add all common weights + italic variants
                font_clean = font.strip()
                font_param = font_clean.replace(" ", "+") + ":ital,wght@0,100;0,200;0,300;0,400;0,500;0,600;0,700;0,800;0,900;1,100;1,200;1,300;1,400;1,500;1,600;1,700;1,800;1,900"
                google_fonts.append(font_param)

        if google_fonts:
            fonts_param = "&family=".join(google_fonts)
            fonts_link = f'<link href="https://fonts.googleapis.com/css2?family={fonts_param}&display=swap" rel="stylesheet">'
            logger.info(f"[GoogleSlidesImport] Loading Google Fonts: {list(fonts_used)}")

    # Handle background image if present
    bg_style = f"background-color: {bg_color};"
    if bg_image_url:
        bg_image_data = await _download_and_encode_image(bg_image_url, access_token)
        if bg_image_data:
            bg_style = f"background-image: url('{bg_image_data}'); background-size: cover; background-position: center;"

    html_output = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  {fonts_link}
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; overflow: hidden; }}
    .slide-container {{
      position: relative;
      width: {OUT_WIDTH}px;
      height: {OUT_HEIGHT}px;
      {bg_style}
      font-family: Arial, sans-serif;
    }}
  </style>
</head>
<body>
  <div class="slide-container">
    {elements_str}
  </div>
</body>
</html>'''

    return html_output


def _process_text_elements(text_obj: Dict[str, Any], theme_colors: Dict[str, str], resolve_color) -> str:
    """Process Google Slides text object into HTML with proper formatting."""
    import html as html_module

    paragraphs_html = []
    current_paragraph = []

    text_elements = text_obj.get("textElements", [])

    for te in text_elements:
        # Paragraph marker - flush current paragraph
        para_marker = te.get("paragraphMarker")
        if para_marker:
            if current_paragraph:
                # Get paragraph style
                para_style = para_marker.get("style", {})
                alignment = para_style.get("alignment", "START")
                text_align = "left"
                if alignment == "CENTER":
                    text_align = "center"
                elif alignment == "END":
                    text_align = "right"
                elif alignment == "JUSTIFIED":
                    text_align = "justify"

                line_spacing = para_style.get("lineSpacing", 100)
                line_height = line_spacing / 100 if line_spacing else 1.2

                para_html = "".join(current_paragraph)
                paragraphs_html.append(
                    f'<p style="text-align: {text_align}; line-height: {line_height}; margin-bottom: 0.5em;">{para_html}</p>'
                )
                current_paragraph = []
            continue

        # Text run
        text_run = te.get("textRun")
        if text_run:
            content = text_run.get("content", "")
            if not content or content == "\n":
                continue

            content = html_module.escape(content.rstrip("\n"))

            style = text_run.get("style", {})

            # Font size
            font_size_obj = style.get("fontSize", {})
            font_size = font_size_obj.get("magnitude", 14) if font_size_obj else 14

            # Font family
            font_family = style.get("fontFamily", "Arial")
            if font_family:
                font_family = font_family.replace('"', '\\"')

            # Text color
            fg_color = style.get("foregroundColor", {})
            opaque_color = fg_color.get("opaqueColor", {})
            text_color = resolve_color(opaque_color) if opaque_color else "#000000"

            # Font weight and style
            bold = style.get("bold", False)
            italic = style.get("italic", False)
            underline = style.get("underline", False)
            strikethrough = style.get("strikethrough", False)

            # Build inline style
            inline_style = f'font-size: {font_size}px; color: {text_color}; font-family: "{font_family}", sans-serif;'
            if bold:
                inline_style += " font-weight: bold;"
            if italic:
                inline_style += " font-style: italic;"

            text_decoration = []
            if underline:
                text_decoration.append("underline")
            if strikethrough:
                text_decoration.append("line-through")
            if text_decoration:
                inline_style += f" text-decoration: {' '.join(text_decoration)};"

            current_paragraph.append(f'<span style="{inline_style}">{content}</span>')

    # Flush any remaining paragraph
    if current_paragraph:
        para_html = "".join(current_paragraph)
        paragraphs_html.append(f'<p style="margin-bottom: 0.5em;">{para_html}</p>')

    return "".join(paragraphs_html)


def _process_text_elements_with_fonts(text_obj: Dict[str, Any], theme_colors: Dict[str, str], resolve_color, fonts_used: Set[str], font_scale: float = 2.667) -> str:
    """Process Google Slides text object into HTML with proper formatting, tracking fonts used.

    Args:
        font_scale: Multiplier to convert points to pixels for the scaled output.
                   Default 2.667 assumes standard 10" wide slide scaled to 1920px.
    """
    import html as html_module

    paragraphs_html = []
    current_paragraph = []
    current_para_style = {}

    text_elements = text_obj.get("textElements", [])
    current_bullet = None  # Track current paragraph's bullet info

    for te in text_elements:
        # Paragraph marker - flush current paragraph and capture next paragraph's style
        para_marker = te.get("paragraphMarker")
        if para_marker:
            if current_paragraph:
                # Get paragraph style from current marker
                para_style = current_para_style
                alignment = para_style.get("alignment", "START")
                text_align = "left"
                if alignment == "CENTER":
                    text_align = "center"
                elif alignment == "END":
                    text_align = "right"
                elif alignment == "JUSTIFIED":
                    text_align = "justify"

                line_spacing = para_style.get("lineSpacing", 100)
                line_height = line_spacing / 100 if line_spacing else 1.2

                # Get indentation
                indent_start = para_style.get("indentStart", {}).get("magnitude", 0) or 0
                indent_first_line = para_style.get("indentFirstLine", {}).get("magnitude", 0) or 0

                para_style_str = f"text-align: {text_align}; line-height: {line_height}; margin: 0; padding: 0;"

                # Handle bullet lists
                if current_bullet:
                    nesting_level = current_bullet.get("nestingLevel", 0)
                    glyph = current_bullet.get("glyph", "•")
                    # Add indent based on nesting level
                    indent_px = (nesting_level + 1) * 20
                    para_style_str += f" margin-left: {indent_px}px; padding-left: 15px;"
                    # Add bullet character
                    bullet_html = f'<span style="position: absolute; left: {nesting_level * 20}px;">{html_module.escape(glyph)}</span>'
                    para_html = bullet_html + "".join(current_paragraph)
                    para_style_str += " position: relative;"
                else:
                    if indent_start:
                        # Convert EMU to px (approximate)
                        indent_px = indent_start / 9525  # EMU to points, approx
                        para_style_str += f" margin-left: {indent_px:.0f}px;"
                    para_html = "".join(current_paragraph)

                paragraphs_html.append(f'<p style="{para_style_str}">{para_html}</p>')
                current_paragraph = []

            # Store this paragraph's style and bullet info for the next text runs
            current_para_style = para_marker.get("style", {})
            current_bullet = para_marker.get("bullet")
            continue

        # Text run
        text_run = te.get("textRun")
        if text_run:
            content = text_run.get("content", "")
            if not content or content == "\n":
                continue

            content = html_module.escape(content.rstrip("\n"))

            style = text_run.get("style", {})

            # Font size - handle different formats and scale from points to pixels
            font_size_obj = style.get("fontSize", {})
            if isinstance(font_size_obj, dict):
                font_size_pt = font_size_obj.get("magnitude", 14) or 14
            else:
                font_size_pt = 14
            # Scale font size from points to pixels for our output canvas
            font_size = round(font_size_pt * font_scale)

            # Font family - track it for Google Fonts loading
            font_family = style.get("fontFamily", "Arial") or "Arial"
            # Clean up font family name
            font_family = font_family.replace('"', '').strip()
            if font_family:
                fonts_used.add(font_family)
                logger.debug(f"[GoogleSlidesImport] Detected font: '{font_family}' at {font_size_pt}pt")

            # Weighted font detection (e.g., "Roboto Bold" should be "Roboto" with bold)
            weighted_bold = False
            weighted_italic = False
            font_parts = font_family.split()
            if len(font_parts) > 1:
                last_part = font_parts[-1].lower()
                if last_part in ("bold", "black", "heavy"):
                    weighted_bold = True
                    font_family = " ".join(font_parts[:-1])
                elif last_part in ("italic", "oblique"):
                    weighted_italic = True
                    font_family = " ".join(font_parts[:-1])
                elif last_part in ("light", "thin", "medium"):
                    # Keep the weight info but use base font family
                    font_family = " ".join(font_parts[:-1])

            # Text color
            fg_color = style.get("foregroundColor", {})
            opaque_color = fg_color.get("opaqueColor", {})
            text_color = resolve_color(opaque_color) if opaque_color else "#000000"

            # Font weight and style from explicit properties
            bold = style.get("bold", False) or weighted_bold
            italic = style.get("italic", False) or weighted_italic
            underline = style.get("underline", False)
            strikethrough = style.get("strikethrough", False)

            # Get font weight value if specified
            weight_value = style.get("weightedFontFamily", {}).get("weight", 400)
            if bold and weight_value < 600:
                weight_value = 700

            # Build inline style
            inline_style = f'font-size: {font_size}px; color: {text_color}; font-family: "{font_family}", sans-serif;'
            if weight_value != 400:
                inline_style += f" font-weight: {weight_value};"
            elif bold:
                inline_style += " font-weight: bold;"
            if italic:
                inline_style += " font-style: italic;"

            text_decoration = []
            if underline:
                text_decoration.append("underline")
            if strikethrough:
                text_decoration.append("line-through")
            if text_decoration:
                inline_style += f" text-decoration: {' '.join(text_decoration)};"

            # Handle baseline offset (subscript/superscript)
            baseline_offset = style.get("baselineOffset", "NONE")
            if baseline_offset == "SUPERSCRIPT":
                inline_style += " vertical-align: super; font-size: 0.75em;"
            elif baseline_offset == "SUBSCRIPT":
                inline_style += " vertical-align: sub; font-size: 0.75em;"

            # Handle links
            link = style.get("link", {})
            if link and link.get("url"):
                current_paragraph.append(f'<a href="{html_module.escape(link["url"])}" style="{inline_style}" target="_blank">{content}</a>')
            else:
                current_paragraph.append(f'<span style="{inline_style}">{content}</span>')

    # Flush any remaining paragraph with its style
    if current_paragraph:
        para_style = current_para_style
        alignment = para_style.get("alignment", "START")
        text_align = "left"
        if alignment == "CENTER":
            text_align = "center"
        elif alignment == "END":
            text_align = "right"
        elif alignment == "JUSTIFIED":
            text_align = "justify"

        line_spacing = para_style.get("lineSpacing", 100)
        line_height = line_spacing / 100 if line_spacing else 1.2

        para_style_str = f"text-align: {text_align}; line-height: {line_height}; margin: 0; padding: 0;"

        # Handle bullet lists for remaining paragraph
        if current_bullet:
            nesting_level = current_bullet.get("nestingLevel", 0)
            glyph = current_bullet.get("glyph", "•")
            indent_px = (nesting_level + 1) * 20
            para_style_str += f" margin-left: {indent_px}px; padding-left: 15px; position: relative;"
            bullet_html = f'<span style="position: absolute; left: {nesting_level * 20}px;">{html_module.escape(glyph)}</span>'
            para_html = bullet_html + "".join(current_paragraph)
        else:
            para_html = "".join(current_paragraph)

        paragraphs_html.append(f'<p style="{para_style_str}">{para_html}</p>')

    return "".join(paragraphs_html)


def _process_table_element(table: Dict[str, Any], bounds: Dict[str, float], theme_colors: Dict[str, str], resolve_color, font_scale: float = 2.667) -> str:
    """Process a table element into HTML."""
    rows = table.get("tableRows", [])
    if not rows:
        return ""

    # Dummy fonts set for tables (we don't track fonts from tables currently)
    dummy_fonts: Set[str] = set()

    table_html = []
    table_html.append(f'<table style="position: absolute; left: {bounds["left"]:.1f}px; top: {bounds["top"]:.1f}px; '
                     f'width: {bounds["width"]:.1f}px; height: {bounds["height"]:.1f}px; border-collapse: collapse;">')

    for row in rows:
        table_html.append("<tr>")
        cells = row.get("tableCells", [])
        for cell in cells:
            # Cell text - use the font-scaled version
            text_obj = cell.get("text", {})
            cell_text = ""
            if text_obj:
                cell_text = _process_text_elements_with_fonts(text_obj, theme_colors, resolve_color, dummy_fonts, font_scale)

            # Cell background
            cell_props = cell.get("tableCellProperties", {})
            cell_bg = cell_props.get("tableCellBackgroundFill", {})
            bg_color = ""
            if "solidFill" in cell_bg:
                bg_color = f"background-color: {resolve_color(cell_bg['solidFill'].get('color', {}))};"

            table_html.append(f'<td style="border: 1px solid #ccc; padding: 8px; {bg_color}">{cell_text}</td>')
        table_html.append("</tr>")

    table_html.append("</table>")
    return "".join(table_html)


async def _download_and_encode_image(url: str, access_token: str) -> Optional[str]:
    """Download an image and return as data URL with multiple fallback strategies."""
    if not url:
        return None

    logger.info(f"[GoogleSlidesImport] Downloading image: {url[:80]}...")

    async def try_download(headers: Dict[str, str]) -> Optional[httpx.Response]:
        """Attempt to download with given headers."""
        try:
            async with httpx.AsyncClient(timeout=60.0) as client:
                response = await client.get(url, headers=headers, follow_redirects=True)
                if response.status_code == 200 and len(response.content) > 0:
                    return response
                else:
                    logger.debug(f"[GoogleSlidesImport] Download attempt failed: status={response.status_code}, size={len(response.content)}")
                    return None
        except Exception as e:
            logger.debug(f"[GoogleSlidesImport] Download attempt error: {e}")
            return None

    response = None

    # Strategy 1: Try with OAuth token for Google URLs
    is_google_url = any(domain in url.lower() for domain in [
        "googleusercontent.com",
        "google.com",
        "googleapis.com",
        "ggpht.com",
        "lh3.google",
        "lh4.google",
        "lh5.google",
        "lh6.google"
    ])

    if is_google_url and access_token:
        logger.debug("[GoogleSlidesImport] Trying with OAuth token...")
        response = await try_download({"Authorization": f"Bearer {access_token}"})

    # Strategy 2: Try without auth (for public images)
    if not response:
        logger.debug("[GoogleSlidesImport] Trying without auth...")
        response = await try_download({})

    # Strategy 3: Try with a common user agent
    if not response:
        logger.debug("[GoogleSlidesImport] Trying with User-Agent header...")
        response = await try_download({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
        })

    # Strategy 4: For Google Drive URLs, try to convert to direct download format
    if not response and "drive.google.com" in url:
        # Convert sharing URL to direct download
        import re
        file_id_match = re.search(r'/d/([a-zA-Z0-9_-]+)', url)
        if file_id_match:
            file_id = file_id_match.group(1)
            direct_url = f"https://drive.google.com/uc?export=download&id={file_id}"
            logger.debug(f"[GoogleSlidesImport] Trying Drive direct URL: {direct_url}")
            try:
                async with httpx.AsyncClient(timeout=60.0) as client:
                    response = await client.get(
                        direct_url,
                        headers={"Authorization": f"Bearer {access_token}"} if access_token else {},
                        follow_redirects=True
                    )
                    if response.status_code != 200 or len(response.content) == 0:
                        response = None
            except Exception:
                response = None

    if response and response.status_code == 200 and len(response.content) > 100:
        content_type = response.headers.get("content-type", "image/png")
        if ";" in content_type:
            content_type = content_type.split(";")[0].strip()

        # Validate content type is an image
        if not content_type.startswith("image/"):
            # Try to detect from content
            content = response.content[:20]
            if content.startswith(b'\x89PNG'):
                content_type = "image/png"
            elif content.startswith(b'\xff\xd8\xff'):
                content_type = "image/jpeg"
            elif content.startswith(b'GIF'):
                content_type = "image/gif"
            elif content.startswith(b'RIFF') and b'WEBP' in content:
                content_type = "image/webp"
            elif b'<svg' in content.lower():
                content_type = "image/svg+xml"
            else:
                content_type = "image/png"  # Default fallback

        b64 = base64.b64encode(response.content).decode("utf-8")
        logger.info(f"[GoogleSlidesImport] Image downloaded successfully: {len(response.content)} bytes, type={content_type}")
        return f"data:{content_type};base64,{b64}"
    else:
        logger.warning(f"[GoogleSlidesImport] All image download strategies failed for: {url[:80]}")
        return None


def _extract_slide_title(slide: Dict[str, Any]) -> Optional[str]:
    """Extract the title from a Google Slides slide."""
    try:
        for el in slide.get("pageElements", []):
            shape = el.get("shape", {})
            placeholder = shape.get("placeholder", {})
            ptype = (placeholder.get("type") or "").upper()

            if ptype in ("TITLE", "CENTERED_TITLE"):
                text = shape.get("text", {})
                return _extract_plain_text_from_google(text)

        # Fallback: first text box
        for el in slide.get("pageElements", []):
            shape = el.get("shape", {})
            if (shape.get("shapeType") or "").upper() == "TEXT_BOX":
                text = shape.get("text", {})
                extracted = _extract_plain_text_from_google(text)
                if extracted:
                    return extracted[:100]  # Limit title length
    except Exception:
        pass
    return None


def _extract_plain_text_from_google(text_obj: Dict[str, Any]) -> str:
    """Extract plain text from Google Slides text object."""
    try:
        elements = text_obj.get("textElements", [])
        parts = []
        for te in elements:
            run = te.get("textRun") if isinstance(te, dict) else None
            if run:
                content = (run.get("content") or "").strip()
                if content:
                    parts.append(content)
        return " ".join(parts).strip()
    except Exception:
        return ""


def _preprocess_slide_for_ai(slide: Dict[str, Any]) -> Dict[str, Any]:
    """
    Pre-process Google Slide data into a cleaner format for AI.
    Extracts key visual elements with positions, sizes, colors, and text.
    """
    # Standard slide size in EMU
    SLIDE_WIDTH_EMU = 9144000
    SLIDE_HEIGHT_EMU = 5143500

    def emu_to_percent(emu: float, is_width: bool = True) -> float:
        """Convert EMU to percentage of slide."""
        base = SLIDE_WIDTH_EMU if is_width else SLIDE_HEIGHT_EMU
        return round((emu / base) * 100, 2)

    def get_transform_position(el: Dict[str, Any]) -> Dict[str, float]:
        """Extract position from element transform."""
        transform = el.get("transform", {})
        tx = transform.get("translateX", 0) or 0
        ty = transform.get("translateY", 0) or 0
        return {
            "left": emu_to_percent(tx, True),
            "top": emu_to_percent(ty, False)
        }

    def get_size(el: Dict[str, Any]) -> Dict[str, float]:
        """Extract size from element."""
        size = el.get("size", {})
        w = size.get("width", {}).get("magnitude", 0) or 0
        h = size.get("height", {}).get("magnitude", 0) or 0
        return {
            "width": emu_to_percent(w, True),
            "height": emu_to_percent(h, False)
        }

    def rgb_to_hex(rgb: Dict[str, Any]) -> str:
        """Convert Google RGB to hex color."""
        if not rgb:
            return "#000000"
        r = int((rgb.get("red", 0) or 0) * 255)
        g = int((rgb.get("green", 0) or 0) * 255)
        b = int((rgb.get("blue", 0) or 0) * 255)
        return f"#{r:02X}{g:02X}{b:02X}"

    def extract_text_content(text_obj: Dict[str, Any]) -> List[Dict[str, Any]]:
        """Extract text runs with formatting."""
        runs = []
        for el in text_obj.get("textElements", []):
            text_run = el.get("textRun")
            if text_run:
                content = text_run.get("content", "").strip()
                if content:
                    style = text_run.get("style", {})
                    font_size = style.get("fontSize", {}).get("magnitude", 14)
                    runs.append({
                        "text": content,
                        "fontSize": font_size,
                        "bold": style.get("bold", False),
                        "italic": style.get("italic", False),
                        "color": rgb_to_hex(style.get("foregroundColor", {}).get("opaqueColor", {}).get("rgbColor", {}))
                    })
        return runs

    # Extract background
    background = {"color": "#FFFFFF"}
    page_props = slide.get("pageProperties", {})
    bg_fill = page_props.get("pageBackgroundFill", {})
    if "solidFill" in bg_fill:
        rgb = bg_fill["solidFill"].get("color", {}).get("rgbColor", {})
        background["color"] = rgb_to_hex(rgb)

    # Extract elements
    elements = []
    for el in slide.get("pageElements", []):
        pos = get_transform_position(el)
        size = get_size(el)
        element_id = el.get("objectId", "")

        # Text box or shape with text
        shape = el.get("shape", {})
        if shape:
            shape_type = shape.get("shapeType", "RECTANGLE")
            text = shape.get("text", {})
            text_runs = extract_text_content(text) if text else []

            # Get shape fill color
            shape_props = shape.get("shapeProperties", {})
            fill = shape_props.get("shapeBackgroundFill", {})
            fill_color = None
            if "solidFill" in fill:
                rgb = fill["solidFill"].get("color", {}).get("rgbColor", {})
                fill_color = rgb_to_hex(rgb)

            elements.append({
                "type": "shape" if not text_runs else "text",
                "shapeType": shape_type,
                "position": pos,
                "size": size,
                "text": text_runs,
                "backgroundColor": fill_color
            })

        # Image
        image = el.get("image", {})
        if image:
            elements.append({
                "type": "image",
                "position": pos,
                "size": size,
                "contentUrl": image.get("contentUrl", "")
            })

        # Line
        line = el.get("line", {})
        if line:
            line_props = line.get("lineProperties", {})
            elements.append({
                "type": "line",
                "position": pos,
                "size": size,
                "strokeColor": rgb_to_hex(line_props.get("lineFill", {}).get("solidFill", {}).get("color", {}).get("rgbColor", {})),
                "strokeWidth": line_props.get("weight", {}).get("magnitude", 1)
            })

    return {
        "background": background,
        "elements": elements
    }


def _extract_theme_colors(presentation: Dict[str, Any]) -> Dict[str, str]:
    """Extract theme colors from a Google Slides presentation."""
    # Default theme colors as fallback
    theme_colors = {
        "DARK1": "#000000",
        "LIGHT1": "#FFFFFF",
        "DARK2": "#333333",
        "LIGHT2": "#F5F5F5",
        "ACCENT1": "#1A73E8",
        "ACCENT2": "#FBBC04",
        "ACCENT3": "#34A853",
        "ACCENT4": "#EA4335",
        "ACCENT5": "#A142F4",
        "ACCENT6": "#00ACC1",
        "HYPERLINK": "#1155CC",
        "FOLLOWED_HYPERLINK": "#6611CC",
        # Legacy mappings
        "BACKGROUND": "#FFFFFF",
        "TEXT": "#000000",
    }

    def rgb_to_hex(rgb: Dict[str, Any]) -> str:
        """Convert Google RGB (0-1) to hex color."""
        if not rgb:
            return "#000000"
        r = int((rgb.get("red", 0) or 0) * 255)
        g = int((rgb.get("green", 0) or 0) * 255)
        b = int((rgb.get("blue", 0) or 0) * 255)
        return f"#{r:02X}{g:02X}{b:02X}"

    try:
        masters = presentation.get("masters", [])
        if masters:
            master = masters[0]
            master_props = master.get("masterProperties", {})

            # Try to get colors from page elements (text styles, etc.)
            page_elements = master.get("pageElements", [])
            for el in page_elements:
                shape = el.get("shape", {})
                if shape:
                    text = shape.get("text", {})
                    if text:
                        for te in text.get("textElements", []):
                            text_run = te.get("textRun", {})
                            style = text_run.get("style", {})
                            fg_color = style.get("foregroundColor", {})
                            opaque = fg_color.get("opaqueColor", {})
                            if "themeColor" in opaque:
                                tc_name = opaque.get("themeColor", "")
                                rgb_color = opaque.get("rgbColor", {})
                                if tc_name and rgb_color:
                                    theme_colors[tc_name] = rgb_to_hex(rgb_color)

            # Also check page properties for background colors
            page_props = master.get("pageProperties", {})
            color_scheme = page_props.get("colorScheme", {})
            if color_scheme:
                colors = color_scheme.get("colors", [])
                for color_entry in colors:
                    color_type = color_entry.get("type", "")
                    rgb_color = color_entry.get("color", {}).get("rgbColor", {})
                    if color_type and rgb_color:
                        theme_colors[color_type] = rgb_to_hex(rgb_color)

        # Also check layouts for color scheme
        layouts = presentation.get("layouts", [])
        for layout in layouts:
            page_props = layout.get("pageProperties", {})
            color_scheme = page_props.get("colorScheme", {})
            if color_scheme:
                colors = color_scheme.get("colors", [])
                for color_entry in colors:
                    color_type = color_entry.get("type", "")
                    rgb_color = color_entry.get("color", {}).get("rgbColor", {})
                    if color_type and rgb_color:
                        theme_colors[color_type] = rgb_to_hex(rgb_color)
                break  # Only need one layout for color scheme

        logger.debug(f"[GoogleSlidesImport] Extracted theme colors: {theme_colors}")

    except Exception as e:
        logger.warning(f"[GoogleSlidesImport] Error extracting theme colors: {e}")

    return theme_colors


def _create_fallback_render_function(slide: Dict[str, Any], theme_colors: Dict[str, str]) -> str:
    """Create a basic fallback HTML when AI generation fails."""
    import html as html_module

    # Pre-process the slide to get clean data
    processed = _preprocess_slide_for_ai(slide)
    bg_color = processed.get("background", {}).get("color", "#FFFFFF")

    # Build HTML elements for the fallback
    elements_html = []
    for i, el in enumerate(processed.get("elements", [])[:15]):  # Limit to 15 elements
        left = el.get("position", {}).get("left", 0)
        top = el.get("position", {}).get("top", 0)
        width = el.get("size", {}).get("width", 50)
        height = el.get("size", {}).get("height", 10)

        if el.get("type") == "text" and el.get("text"):
            # Combine all text runs
            text_content = " ".join([run.get("text", "") for run in el.get("text", [])])
            text_content = html_module.escape(text_content)
            first_run = el.get("text", [{}])[0]
            font_size = first_run.get("fontSize", 24)
            color = first_run.get("color", "#000000")
            bold = "font-bold" if first_run.get("bold", False) else ""

            elements_html.append(f'''<div class="absolute {bold}" style="left: {left}%; top: {top}%; width: {width}%; font-size: {font_size}px; color: {color};">{text_content}</div>''')

        elif el.get("type") == "shape" and el.get("backgroundColor"):
            bg = el.get("backgroundColor", "#CCCCCC")
            radius = "rounded-full" if el.get("shapeType") == "ELLIPSE" else ""
            elements_html.append(f'''<div class="absolute {radius}" style="left: {left}%; top: {top}%; width: {width}%; height: {height}%; background-color: {bg};"></div>''')

        elif el.get("type") == "image" and el.get("contentUrl"):
            src = el.get("contentUrl", "")
            elements_html.append(f'''<img class="absolute object-contain" style="left: {left}%; top: {top}%; width: {width}%; height: {height}%;" src="{src}" />''')

    elements_str = "\n    ".join(elements_html)

    return f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; overflow: hidden; font-family: 'Inter', sans-serif; }}
  </style>
</head>
<body>
  <div class="relative w-full h-full" style="background-color: {bg_color};">
    {elements_str}
  </div>
</body>
</html>'''


def _create_error_slide_component(error_message: str) -> Dict[str, Any]:
    """Create a CustomComponent that displays an error message."""
    import html as html_module
    safe_error = html_module.escape(error_message[:200])

    render_code = f'''<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    * {{ margin: 0; padding: 0; box-sizing: border-box; }}
    html, body {{ width: 100%; height: 100%; overflow: hidden; }}
  </style>
</head>
<body class="bg-red-50 flex flex-col items-center justify-center h-full font-sans">
  <div class="text-5xl mb-4">⚠️</div>
  <div class="text-2xl font-semibold text-red-800 mb-2">Import Error</div>
  <div class="text-sm text-red-700 text-center max-w-[80%]">{safe_error}</div>
</body>
</html>'''

    return {
        "id": str(uuid.uuid4()),
        "type": "CustomComponent",
        "props": {
            "position": {"x": 0, "y": 0},
            "width": 1920,
            "height": 1080,
            "rotation": 0,
            "opacity": 1,
            "zIndex": 1,
            "render": render_code,
            "props": {"error": True}
        }
    }


# ==============================================================================
# Vision-Based Google Slides Import (Screenshot → AI Recreation)
# ==============================================================================

# Maximum slides allowed for vision-based import
MAX_VISION_IMPORT_SLIDES = 30


async def _convert_google_slides_via_vision(
    presentation: Dict[str, Any],
    user_id: str,
    api: "GoogleApiClient",
    job_id: Optional[str] = None
) -> Dict[str, Any]:
    """
    Convert Google Slides presentation using vision AI.

    Strategy:
    1. Fetch high-resolution thumbnails for each slide
    2. Pass each thumbnail through Gemini Vision to recreate as HTML
    3. Return deck with CustomComponents

    This provides better visual fidelity than data parsing for complex slides.
    """
    from google import genai
    from google.genai import types
    from agents.config import GEMINI_3_FLASH

    # Get presentation metadata
    title = presentation.get("title", "Imported Presentation")
    presentation_id = presentation.get("presentationId", "")
    slides_data = presentation.get("slides", [])
    total_slides = len(slides_data)

    logger.info(f"[GoogleSlidesVisionImport] ===== STARTING VISION IMPORT =====")
    logger.info(f"[GoogleSlidesVisionImport] Presentation: {title} ({presentation_id})")
    logger.info(f"[GoogleSlidesVisionImport] Slide count: {total_slides}")

    # Enforce slide limit
    if total_slides > MAX_VISION_IMPORT_SLIDES:
        raise HTTPException(
            status_code=400,
            detail=f"Presentation has {total_slides} slides. Maximum allowed is {MAX_VISION_IMPORT_SLIDES} slides."
        )

    # Initialize Gemini client
    api_key = os.environ.get("GOOGLE_API_KEY") or os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")

    gemini_client = genai.Client(api_key=api_key)

    async def fetch_thumbnail_image(slide_idx: int, page_id: str) -> Optional[bytes]:
        """Fetch thumbnail image data for a slide."""
        try:
            # Get thumbnail URL with LARGE size for best quality
            thumbnail_data = await api.slides_get_page_thumbnail(
                user_id=user_id,
                presentation_id=presentation_id,
                page_id=page_id,
                size="LARGE",  # Highest resolution available
                mime="PNG"
            )

            content_url = thumbnail_data.get("contentUrl")
            if not content_url:
                logger.warning(f"[GoogleSlidesVisionImport] No thumbnail URL for slide {slide_idx + 1}")
                return None

            # Download the image
            async with httpx.AsyncClient(timeout=30.0) as client:
                response = await client.get(content_url)
                if response.status_code == 200:
                    return response.content
                else:
                    logger.warning(f"[GoogleSlidesVisionImport] Failed to download thumbnail for slide {slide_idx + 1}: {response.status_code}")
                    return None

        except Exception as e:
            logger.warning(f"[GoogleSlidesVisionImport] Error fetching thumbnail for slide {slide_idx + 1}: {e}")
            return None

    async def recreate_slide_with_vision(slide_idx: int, image_bytes: bytes) -> Dict[str, Any]:
        """Use Gemini Vision to recreate a slide from its thumbnail."""

        # Convert to base64 for storage
        image_b64 = base64.b64encode(image_bytes).decode("utf-8")
        image_data_url = f"data:image/png;base64,{image_b64}"

        # Prompt for slide recreation
        prompt = """Recreate this presentation slide as HTML. Match the visual design EXACTLY.

RULES:
- Canvas size: 1920x1080px, overflow:hidden
- Use Tailwind CSS: <script src="https://cdn.tailwindcss.com"></script>
- Load fonts from Google Fonts as needed
- Match exact colors (use hex values like #RRGGBB)
- Match exact spacing, font sizes, and positions
- Recreate any charts/graphs using CSS or SVG
- For images, use a solid color placeholder div with similar dimensions
- Preserve all text content exactly as shown

Output a complete HTML document starting with <!DOCTYPE html>. No markdown, just HTML."""

        try:
            # Build contents with image and prompt
            contents = [
                types.Part.from_bytes(data=image_bytes, mime_type="image/png"),
                prompt
            ]

            response = gemini_client.models.generate_content(
                model=GEMINI_3_FLASH,
                contents=contents,
                config=types.GenerateContentConfig(
                    temperature=0.1,  # Low temp for precise recreation
                    max_output_tokens=16384,
                )
            )

            if response and response.text:
                html_code = _extract_html_from_vision_response(response.text)
                if html_code:
                    return {
                        "id": str(uuid.uuid4()),
                        "title": f"Slide {slide_idx + 1}",
                        "components": [{
                            "id": str(uuid.uuid4()),
                            "type": "CustomComponent",
                            "props": {
                                "position": {"x": 0, "y": 0},
                                "width": 1920,
                                "height": 1080,
                                "x": 0,
                                "y": 0,
                                "zIndex": 1,
                                "opacity": 1,
                                "rotation": 0,
                                "render": html_code,
                                # Note: originalImageUrl removed to avoid large base64 payloads in API response
                                "props": {
                                    "slideIndex": slide_idx,
                                    "sourceType": "google_slides_vision"
                                }
                            }
                        }]
                    }
        except Exception as e:
            logger.error(f"[GoogleSlidesVisionImport] Vision AI error for slide {slide_idx + 1}: {e}")

        # Fallback: use the image directly
        return _create_image_slide_fallback(image_data_url, slide_idx)

    # Process slides in batches to avoid rate limits
    slides_out = []
    batch_size = 5

    for batch_start in range(0, total_slides, batch_size):
        batch_end = min(batch_start + batch_size, total_slides)
        batch_slides = slides_data[batch_start:batch_end]

        logger.info(f"[GoogleSlidesVisionImport] Processing slides {batch_start + 1}-{batch_end}...")

        # Fetch thumbnails for this batch
        thumbnail_tasks = []
        for i, slide in enumerate(batch_slides):
            slide_idx = batch_start + i
            page_id = slide.get("objectId", str(slide_idx))
            thumbnail_tasks.append(fetch_thumbnail_image(slide_idx, page_id))

        thumbnails = await asyncio.gather(*thumbnail_tasks)

        # Helper to create error slides as async function
        async def create_error_slide(idx: int) -> Dict[str, Any]:
            return {
                "id": str(uuid.uuid4()),
                "title": f"Slide {idx + 1}",
                "components": [_create_error_slide_component("Failed to fetch slide thumbnail")]
            }

        # Recreate slides with vision
        recreation_tasks = []
        for i, (slide, thumbnail_bytes) in enumerate(zip(batch_slides, thumbnails)):
            slide_idx = batch_start + i
            if thumbnail_bytes:
                recreation_tasks.append(recreate_slide_with_vision(slide_idx, thumbnail_bytes))
            else:
                # No thumbnail available - create error slide
                recreation_tasks.append(create_error_slide(slide_idx))

        batch_results = await asyncio.gather(*recreation_tasks)
        slides_out.extend(batch_results)

        # Update progress
        if job_id:
            jobs_store.update_progress(job_id, batch_end, total_slides)

        logger.info(f"[GoogleSlidesVisionImport] Completed batch: {len(slides_out)}/{total_slides} slides")

    logger.info(f"[GoogleSlidesVisionImport] ===== IMPORT COMPLETE: {len(slides_out)} slides =====")

    return {
        "uuid": str(uuid.uuid4()),
        "name": title,
        "slides": slides_out,
        "size": {"width": 1920, "height": 1080},
        "metadata": {
            "source": "google_slides_vision",
            "import_stats": {
                "slides": len(slides_out),
                "method": "vision_ai"
            }
        }
    }


def _extract_html_from_vision_response(response: str) -> Optional[str]:
    """Extract HTML code from Gemini Vision response."""
    import re

    response = response.strip()

    # Try to find HTML code block first
    html_block = re.search(r"```html\s*([\s\S]*?)```", response, re.IGNORECASE)
    if html_block:
        code = html_block.group(1).strip()
        if code.lower().startswith('<!doctype') or code.lower().startswith('<html'):
            return code

    # Try generic code block
    generic_block = re.search(r"```\s*([\s\S]*?)```", response, re.IGNORECASE)
    if generic_block:
        code = generic_block.group(1).strip()
        if code.lower().startswith('<!doctype') or code.lower().startswith('<html'):
            return code

    # Try to find complete HTML document directly
    html_doc = re.search(r"(<!DOCTYPE html[\s\S]*?</html>)", response, re.IGNORECASE)
    if html_doc:
        return html_doc.group(1).strip()

    # Try to find <html> tag if no DOCTYPE
    html_tag = re.search(r"(<html[\s\S]*?</html>)", response, re.IGNORECASE)
    if html_tag:
        return "<!DOCTYPE html>\n" + html_tag.group(1).strip()

    # If response starts with DOCTYPE or html, use as-is
    if response.lower().startswith('<!doctype') or response.lower().startswith('<html'):
        return response

    return None


def _create_image_slide_fallback(image_data_url: str, slide_idx: int) -> Dict[str, Any]:
    """Create a slide that displays the original image as fallback."""
    return {
        "id": str(uuid.uuid4()),
        "title": f"Slide {slide_idx + 1}",
        "components": [
            {
                "id": str(uuid.uuid4()),
                "type": "Background",
                "props": {
                    "position": {"x": 0, "y": 0},
                    "width": 1920,
                    "height": 1080,
                    "x": 0,
                    "y": 0,
                    "zIndex": 0,
                    "opacity": 1,
                    "rotation": 0,
                    "backgroundType": "solid",
                    "backgroundColor": "#ffffffff"
                }
            },
            {
                "id": str(uuid.uuid4()),
                "type": "Image",
                "props": {
                    "position": {"x": 0, "y": 0},
                    "width": 1920,
                    "height": 1080,
                    "x": 0,
                    "y": 0,
                    "zIndex": 1,
                    "opacity": 1,
                    "rotation": 0,
                    "src": image_data_url,
                    "alt": f"Slide {slide_idx + 1}",
                    "objectFit": "contain"
                }
            }
        ]
    }


# ==============================================================================
# Import Job Functions
# ==============================================================================


async def _run_import_slides_job(user_id: str, job_id: str, presentation_id: str) -> None:
    """
    Import Google Slides using vision-based approach (screenshot → AI recreation).

    Strategy:
    1. Fetch high-resolution thumbnails for each slide from Google Slides API
    2. Pass each thumbnail through Gemini Vision to recreate as HTML
    3. Build deck with CustomComponents

    This provides better visual fidelity than data parsing for complex slides.
    Limited to MAX_VISION_IMPORT_SLIDES (30) slides.
    """
    oauth = GoogleOAuthService()
    api = GoogleApiClient(oauth)
    jobs_store.update(job_id, JobStatus.RUNNING)

    try:
        # Get access token
        access_token = await oauth.refresh_access_token(user_id)
        if not access_token:
            raise HTTPException(status_code=401, detail="Google authentication required")

        # Get the full presentation data from Google Slides API
        presentation = await api.slides_get_presentation(user_id, presentation_id)

        # Check slide count limit
        slides_data = presentation.get("slides", [])
        if len(slides_data) > MAX_VISION_IMPORT_SLIDES:
            raise HTTPException(
                status_code=400,
                detail=f"Presentation has {len(slides_data)} slides. Maximum allowed is {MAX_VISION_IMPORT_SLIDES} slides."
            )

        # Convert using vision-based approach (screenshot → AI recreation)
        logger.info(f"[GoogleSlidesImport] Converting to CustomComponents using VISION AI...")
        deck = await _convert_google_slides_via_vision(
            presentation=presentation,
            user_id=user_id,
            api=api,
            job_id=job_id
        )

        # Upload any embedded images to storage
        logger.info("[GoogleSlidesImport] Uploading images to storage...")
        deck = await _upload_deck_images_to_storage(deck)

        # Add import metadata
        result_data = {
            "deck": deck,
            "importMetadata": {
                "source": "google_slides_vision",
                "presentation_id": presentation_id,
                **deck.pop("metadata", {})
            }
        }

        jobs_store.update(job_id, JobStatus.SUCCEEDED, result_data)
        logger.info(f"[GoogleSlidesImport] Completed: {len(deck.get('slides', []))} slides via vision AI")

    except Exception as e:
        logger.exception("[GoogleSlidesImport] Job failed")
        jobs_store.update(job_id, JobStatus.FAILED, error=str(e))


async def _run_import_pptx_job(user_id: str, job_id: str, uploaded_file_path: str) -> None:
    jobs_store.update(job_id, JobStatus.RUNNING)
    try:
        # Use vision-based PPTX importer for perfect slide recreation
        from services.vision_pptx_importer import VisionPPTXImporter

        logger.info(f"[IMPORT_PPTX] Starting vision-based import...")
        importer = VisionPPTXImporter()
        deck = await importer.import_file(uploaded_file_path)

        # Update deck name from filename
        deck["name"] = os.path.splitext(os.path.basename(uploaded_file_path))[0]

        # Upload any embedded images to storage
        logger.info(f"[IMPORT_PPTX] Uploading images to storage...")
        deck = await _upload_deck_images_to_storage(deck)

        # Extract metadata
        import_metadata = deck.get("metadata", {})
        import_stats = import_metadata.get("import_stats", {})

        result_data = {
            "deck": deck,
            "importMetadata": import_metadata
        }

        jobs_store.update(job_id, JobStatus.SUCCEEDED, result_data)
        logger.info(f"[IMPORT_PPTX] Completed: {import_stats.get('slides', 0)} slides via {import_stats.get('method', 'unknown')}")

    except Exception as e:
        logger.exception("[IMPORT_PPTX] Job failed")
        jobs_store.update(job_id, JobStatus.FAILED, error=str(e))
    finally:
        # Clean up temp file
        try:
            os.unlink(uploaded_file_path)
        except (OSError, FileNotFoundError):
            pass  # File already deleted or doesn't exist


async def _upload_deck_images_to_storage(deck: Dict[str, Any]) -> Dict[str, Any]:
    """Upload all base64 embedded images in a deck to Supabase storage.

    If upload fails, strips base64 data to prevent timeout (images won't display but deck will save).
    """
    import hashlib
    import asyncio

    # First, collect all images that need uploading
    upload_tasks = []
    image_refs = []  # Track (slide_idx, comp_idx, prop_key) for each task

    for slide_idx, slide in enumerate(deck.get("slides", [])):
        for comp_idx, component in enumerate(slide.get("components", [])):
            comp_type = component.get("type", "")
            props = component.get("props", {})

            if comp_type == "Image":
                src = props.get("src", "")
                if src and src.startswith("data:"):
                    image_refs.append((slide_idx, comp_idx, "src", src))

            elif comp_type == "Background":
                bg_url = props.get("backgroundImageUrl", "")
                if bg_url and bg_url.startswith("data:"):
                    image_refs.append((slide_idx, comp_idx, "backgroundImageUrl", bg_url))

            elif comp_type == "CustomComponent":
                # CustomComponent may have originalImageUrl for reference
                orig_url = props.get("originalImageUrl", "")
                if orig_url and orig_url.startswith("data:"):
                    image_refs.append((slide_idx, comp_idx, "originalImageUrl", orig_url))

    logger.info(f"[ImageUpload] Found {len(image_refs)} embedded images to process")

    if not image_refs:
        return deck

    # Try to upload images to storage
    try:
        from services.image_storage_service import ImageStorageService
        storage = ImageStorageService()

        async def upload_single_image(data_url: str, idx: int) -> Optional[str]:
            """Upload a single image and return the URL or None."""
            try:
                header, b64_data = data_url.split(",", 1)
                content_type = header.split(":")[1].split(";")[0] if ":" in header else "image/png"
                file_hash = hashlib.md5(b64_data[:200].encode()).hexdigest()[:16]
                ext = content_type.split("/")[-1].split(";")[0] if "/" in content_type else "png"
                filename = f"pptx_{file_hash}.{ext}"

                result = await storage.upload_image_from_base64(b64_data, filename, content_type)
                if result.get("url") and not result.get("error"):
                    return result["url"]
            except Exception as e:
                logger.debug(f"[ImageUpload] Image {idx} upload failed: {e}")
            return None

        async with storage:
            # Upload in parallel batches of 5 to avoid overwhelming the server
            batch_size = 5
            uploaded_urls = []

            for i in range(0, len(image_refs), batch_size):
                batch = image_refs[i:i + batch_size]
                tasks = [upload_single_image(ref[3], i + j) for j, ref in enumerate(batch)]
                results = await asyncio.gather(*tasks, return_exceptions=True)
                uploaded_urls.extend(results)

            # Apply uploaded URLs back to deck
            images_uploaded = 0
            for idx, (slide_idx, comp_idx, prop_key, _) in enumerate(image_refs):
                url = uploaded_urls[idx] if idx < len(uploaded_urls) else None
                if isinstance(url, str) and url.startswith("http"):
                    deck["slides"][slide_idx]["components"][comp_idx]["props"][prop_key] = url
                    images_uploaded += 1
                else:
                    # Upload failed - remove base64 to prevent timeout, use placeholder
                    deck["slides"][slide_idx]["components"][comp_idx]["props"][prop_key] = ""
                    logger.debug(f"[ImageUpload] Image {idx} cleared (upload failed)")

            logger.info(f"[ImageUpload] Uploaded {images_uploaded}/{len(image_refs)} images to storage")

    except Exception as e:
        logger.warning(f"[ImageUpload] Storage upload failed: {e}, clearing embedded images")
        # Clear all embedded images to prevent timeout
        for slide_idx, comp_idx, prop_key, _ in image_refs:
            try:
                deck["slides"][slide_idx]["components"][comp_idx]["props"][prop_key] = ""
            except (IndexError, KeyError):
                pass

    return deck


async def _run_export_job(user_id: str, job_id: str, job_type: str, deck: Dict[str, Any], options: Optional[Dict[str, Any]]) -> None:
    jobs_store.update(job_id, JobStatus.RUNNING)
    try:
        # Placeholder: real implementation would render or create Slides
        result = {
            "presentationId": None,
            "webViewLink": None,
            "thumbnailLink": None,
            "note": f"{job_type} not yet implemented",
        }
        jobs_store.update(job_id, JobStatus.SUCCEEDED, result)
    except Exception as e:
        logger.exception("EXPORT job failed")
        jobs_store.update(job_id, JobStatus.FAILED, error=str(e))


# ============================
# Endpoints: OAuth
# ============================


@router.get("/google/auth/init", response_model=OAuthInitResponse)
async def google_auth_init(redirectUri: Optional[str] = Query(None), token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    oauth = GoogleOAuthService()
    url = oauth.build_consent_url(user_id=user_id, redirect_uri=redirectUri)
    return OAuthInitResponse(url=url)


@router.get("/google/auth/callback")
async def google_auth_callback(code: str = Query(...), state: str = Query(...)):
    payload = _decode_state(state)
    user_id = payload.get("user_id")
    redirect_uri = payload.get("redirect_uri")
    if not user_id or not redirect_uri:
        raise HTTPException(status_code=400, detail="Invalid OAuth state payload")
    oauth = GoogleOAuthService()
    token_body = await oauth.exchange_code(code=code, redirect_uri=redirect_uri)
    refresh_token = token_body.get("refresh_token")
    access_token = token_body.get("access_token")
    expires_in = token_body.get("expires_in")
    id_token = token_body.get("id_token")
    provider_email = None
    try:
        if id_token:
            # best-effort decode without verification to extract email
            parts = id_token.split(".")
            if len(parts) >= 2:
                body = json.loads(base64.urlsafe_b64decode(parts[1] + "==").decode())
                provider_email = body.get("email")
    except Exception:
        provider_email = None

    record = GoogleTokenRecord(
        user_id=user_id,
        provider_email=provider_email,
        refresh_token=refresh_token,
        access_token=access_token,
        access_token_expiry=(datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))) if expires_in else None,
        scopes=token_body.get("scope", "").split(" ") if token_body.get("scope") else None,
    )
    oauth.token_storage.upsert(record)

    app_redirect = os.getenv("FRONTEND_URL", "http://localhost:8080") + "/profile?tab=integrations&google=connected"
    return RedirectResponse(url=app_redirect)


@router.get("/google/auth/status", response_model=OAuthStatusResponse)
async def google_auth_status(token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        return OAuthStatusResponse(connected=False)
    user_id = user["id"]
    storage = GoogleTokenStorage()
    try:
        record = storage.get_by_user(user_id)
    except HTTPException as he:
        # Surface setup error without 500
        if isinstance(he.detail, dict) and he.detail.get("error", {}).get("code") == "SETUP_REQUIRED":
            return OAuthStatusResponse(connected=False)
        raise
    if not record or not record.refresh_token:
        return OAuthStatusResponse(connected=False)
    return OAuthStatusResponse(connected=True, email=record.provider_email, scopes=record.scopes)


@router.post("/google/auth/disconnect")
async def google_auth_disconnect(token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    storage = GoogleTokenStorage()
    record = storage.get_by_user(user_id)
    oauth = GoogleOAuthService()
    await oauth.revoke(record.access_token if record else None, record.refresh_token if record else None)
    storage.delete_by_user(user_id)
    return {"ok": True}


# ============================
# Endpoints: Drive listing
# ============================


@router.get("/google/drive/presentations")
async def list_presentations(
    query: Optional[str] = Query(None),
    pageToken: Optional[str] = Query(None),
    pageSize: Optional[int] = Query(None),
    scope: Optional[str] = Query(None, description="all | mine | shared"),
    token: Optional[str] = Depends(get_auth_header)
):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    oauth = GoogleOAuthService()
    api = GoogleApiClient(oauth)
    try:
        data = await api.drive_list_presentations(user_id=user_id, query=query, page_token=pageToken, page_size=pageSize or 20, scope=scope)
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Drive list failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


@router.get("/google/drive/spreadsheets")
async def list_spreadsheets(
    query: Optional[str] = Query(None),
    pageToken: Optional[str] = Query(None),
    pageSize: Optional[int] = Query(None),
    scope: Optional[str] = Query(None, description="all | mine | shared"),
    token: Optional[str] = Depends(get_auth_header)
):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    oauth = GoogleOAuthService()
    api = GoogleApiClient(oauth)
    try:
        data = await api.drive_list_spreadsheets(user_id=user_id, query=query, page_token=pageToken, page_size=pageSize or 20, scope=scope)
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Drive list spreadsheets failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


# ============================
# Endpoints: Presentation Metadata
# ============================


@router.get("/google/slides/{presentationId}/metadata")
async def get_presentation_metadata(
    presentationId: str,
    token: Optional[str] = Depends(get_auth_header)
):
    """Get presentation metadata including slide count."""
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    oauth = GoogleOAuthService()
    api = GoogleApiClient(oauth)
    try:
        presentation = await api.slides_get_presentation(user_id=user_id, presentation_id=presentationId)
        slides = presentation.get("slides", [])
        return {
            "presentationId": presentationId,
            "title": presentation.get("title", ""),
            "slideCount": len(slides),
            "pageSize": presentation.get("pageSize", {})
        }
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Get presentation metadata failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


# ============================
# Endpoints: Import
# ============================


@router.post("/import/slides", response_model=JobResponse)
async def import_slides(body: SlidesImportRequest, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    job_id = jobs_store.create(user_id=user_id, job_type=JobType.IMPORT_SLIDES, input_payload=body.model_dump())

    # FIX: Use safe background task wrapper for proper error logging
    create_background_task(
        _run_import_slides_job(user_id=user_id, job_id=job_id, presentation_id=body.presentationId),
        name=f"import_slides_{job_id}"
    )
    return JobResponse(jobId=job_id)


class ImportPptxUrlRequest(BaseModel):
    """Request to import a PPTX file from URL."""
    fileUrl: str = Field(..., description="URL to the uploaded PPTX file")
    fileName: Optional[str] = Field(default=None, description="Original filename")
    deckId: Optional[str] = Field(default=None, description="Target deck ID")


@router.post("/import/pptx", response_model=JobResponse)
async def import_pptx_from_url(body: ImportPptxUrlRequest, token: Optional[str] = Depends(get_auth_header)):
    """Import a PPTX file from a URL (e.g., from Supabase storage)."""
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]

    # Download the file from URL
    import httpx
    import tempfile

    try:
        async with httpx.AsyncClient() as client:
            response = await client.get(body.fileUrl, follow_redirects=True, timeout=60.0)
            if response.status_code != 200:
                raise HTTPException(status_code=400, detail=f"Failed to download file: {response.status_code}")
            content = response.content
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to download file: {str(e)}")

    # Save to temp file
    filename = body.fileName or "imported.pptx"
    with tempfile.NamedTemporaryFile(delete=False, suffix=".pptx") as tmp:
        tmp.write(content)
        tmp_path = tmp.name

    job_id = jobs_store.create(user_id=user_id, job_type=JobType.IMPORT_PPTX, input_payload={"filename": filename, "deckId": body.deckId})

    # FIX: Use safe background task wrapper for proper error logging
    create_background_task(
        _run_import_pptx_job(user_id=user_id, job_id=job_id, uploaded_file_path=tmp_path),
        name=f"import_pptx_{job_id}"
    )
    return JobResponse(jobId=job_id)


@router.post("/import/pptx/upload", response_model=JobResponse)
async def import_pptx_upload(file: UploadFile = File(...), token: Optional[str] = Depends(get_auth_header)):
    """Import a PPTX file via direct upload."""
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    if not file.filename.lower().endswith(".pptx"):
        raise HTTPException(status_code=400, detail="Only .pptx files are supported")
    import tempfile

    with tempfile.NamedTemporaryFile(delete=False, suffix=".pptx") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
    job_id = jobs_store.create(user_id=user_id, job_type=JobType.IMPORT_PPTX, input_payload={"filename": file.filename})

    # FIX: Use safe background task wrapper for proper error logging
    create_background_task(
        _run_import_pptx_job(user_id=user_id, job_id=job_id, uploaded_file_path=tmp_path),
        name=f"import_pptx_upload_{job_id}"
    )
    return JobResponse(jobId=job_id)


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, token: Optional[str] = Depends(get_auth_header)):
    # Optional auth; return job if exists
    job = jobs_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    # Use explicit JSON encoding to avoid Content-Length mismatch with large payloads
    content = {"status": job.get("status"), "result": job.get("result"), "error": job.get("error")}
    body = json.dumps(content, ensure_ascii=False).encode("utf-8")
    return Response(content=body, media_type="application/json")


@router.get("/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    job = jobs_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != JobStatus.SUCCEEDED:
        raise HTTPException(status_code=409, detail="Job not completed")
    # Use explicit JSON encoding to avoid Content-Length mismatch with large payloads
    result = job.get("result") or {}
    body = json.dumps(result, ensure_ascii=False).encode("utf-8")
    return Response(content=body, media_type="application/json")


# ============================
# Endpoints: Thumbnails
# ============================


@router.get("/google/slides/{presentationId}/pages/{pageId}/thumbnail")
async def get_slide_thumbnail(
    presentationId: str,
    pageId: str,
    size: Optional[str] = Query("MEDIUM"),
    mime: Optional[str] = Query("PNG"),
    pageIndex: Optional[int] = Query(None),
    token: Optional[str] = Depends(get_auth_header)
):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    api = GoogleApiClient(GoogleOAuthService())
    try:
        # Resolve special pageId shortcuts ("first", "last") or explicit pageIndex
        resolved_page_id = pageId
        try:
            pres = await api.slides_get_presentation_cached(user_id=user_id, presentation_id=presentationId)
            slides = pres.get("slides") or []
            if pageIndex is not None and isinstance(pageIndex, int) and 0 <= pageIndex < len(slides):
                resolved_page_id = slides[pageIndex].get("objectId") or resolved_page_id
            elif str(pageId).lower() == "first" and slides:
                resolved_page_id = slides[0].get("objectId") or resolved_page_id
            elif str(pageId).lower() == "last" and slides:
                resolved_page_id = slides[-1].get("objectId") or resolved_page_id
        except Exception:
            pass

        # Normalize enums
        size_norm = (size or "MEDIUM").upper()
        mime_norm = (mime or "PNG").upper()
        data = await api.slides_get_page_thumbnail(user_id=user_id, presentation_id=presentationId, page_id=resolved_page_id, size=size_norm, mime=mime_norm)
        return data
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Thumbnail fetch failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


class BatchThumbnailsRequest(BaseModel):
    items: List[Dict[str, str]]
    size: Optional[str] = Field("MEDIUM")
    mime: Optional[str] = Field("PNG")
    # Optional: allow client to control concurrency per request (safe bounds applied server-side)
    maxConcurrency: Optional[int] = Field(None)


@router.post("/google/slides/thumbnails:batch")
async def get_slide_thumbnails_batch(
    body: BatchThumbnailsRequest,
    token: Optional[str] = Depends(get_auth_header)
):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    api = GoogleApiClient(GoogleOAuthService())

    # Normalize enums once
    size_norm = (body.size or "MEDIUM").upper()
    mime_norm = (body.mime or "PNG").upper()

    async def _fetch_single(item: Dict[str, str]) -> Dict[str, Any]:
        pres_id = item.get("presentationId") or item.get("presentation_id")
        page_id = (item.get("pageId") or item.get("page_id") or "first")
        resolved_page_id = page_id
        try:
            pres = await api.slides_get_presentation_cached(user_id=user_id, presentation_id=pres_id)
            slides = pres.get("slides") or []
            if str(page_id).lower() == "first" and slides:
                resolved_page_id = slides[0].get("objectId") or resolved_page_id
            elif str(page_id).lower() == "last" and slides:
                resolved_page_id = slides[-1].get("objectId") or resolved_page_id
        except Exception:
            pass
        try:
            data = await api.slides_get_page_thumbnail(
                user_id=user_id,
                presentation_id=pres_id,
                page_id=resolved_page_id,
                size=size_norm,
                mime=mime_norm,
            )
            return {"presentationId": pres_id, "pageId": page_id, "resolvedPageId": resolved_page_id, "thumbnail": data}
        except Exception as e:
            return {"presentationId": pres_id, "pageId": page_id, "error": str(e)}

    # Cap concurrency to avoid rate limits; default to 4, clamp to [1, 16]
    try:
        requested_concurrency = int(body.maxConcurrency) if body.maxConcurrency is not None else 4
    except Exception:
        requested_concurrency = 4
    safe_concurrency = max(1, min(16, requested_concurrency))
    semaphore = asyncio.Semaphore(safe_concurrency)

    async def _guarded_fetch(item: Dict[str, str]) -> Dict[str, Any]:
        async with semaphore:
            return await _fetch_single(item)

    results = await asyncio.gather(*[_guarded_fetch(it) for it in (body.items or [])], return_exceptions=False)
    return {"results": results}


# ============================
# Endpoints: Sheets metadata and values
# ============================


@router.get("/google/sheets/{spreadsheetId}")
async def get_spreadsheet_metadata(spreadsheetId: str, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    api = GoogleApiClient(GoogleOAuthService())
    try:
        meta = await api.sheets_get_metadata(user_id=user_id, spreadsheet_id=spreadsheetId)
        return meta
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sheets metadata fetch failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


@router.get("/google/sheets/{spreadsheetId}/values")
async def get_spreadsheet_values(spreadsheetId: str, range: str = Query(..., alias="range"), token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    api = GoogleApiClient(GoogleOAuthService())
    try:
        data, etag = await api.sheets_values_get(user_id=user_id, spreadsheet_id=spreadsheetId, range_a1=range)
        return {**data, **({"etag": etag} if etag else {})}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Sheets values fetch failed: {e}")
        raise HTTPException(status_code=500, detail={"error": {"code": "TRANSIENT_GOOGLE_ERROR", "message": str(e)}})


# ============================
# Endpoints: Chart data bindings (bind/pause/resume/delete)
# ============================


class ChartBindRequest(BaseModel):
    deckId: str
    slideId: str
    componentId: str
    spreadsheetId: str
    sheetTitle: Optional[str] = None
    rangeA1: str
    mapping: Dict[str, Any]
    sessionId: Optional[str] = None


@router.post("/charts/{componentId}/bind/google-sheet")
async def bind_chart_to_google_sheet(componentId: str, body: ChartBindRequest, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]

    # Fetch initial values and compute normalized data
    api = GoogleApiClient(GoogleOAuthService())
    values_resp, etag = await api.sheets_values_get(user_id=user_id, spreadsheet_id=body.spreadsheetId, range_a1=body.rangeA1)
    values = values_resp.get("values", []) or []

    # Basic normalization: detect header row, map x and y series
    def _normalize(values_in: List[List[Any]], mapping: Dict[str, Any]) -> Dict[str, Any]:
        if not values_in:
            return {"series": []}
        header_row = int(mapping.get("headerRow", 1) or 1)
        headers = values_in[0] if header_row == 1 else None
        data_rows = values_in[1:] if header_row == 1 else values_in
        x_col_name = mapping.get("xColumn")
        series_spec = mapping.get("ySeries", [])
        # Resolve column indexes
        def _col_idx(name_or_idx: Any) -> Optional[int]:
            try:
                return int(name_or_idx)
            except Exception:
                if headers and isinstance(name_or_idx, str):
                    try:
                        return headers.index(name_or_idx)
                    except Exception:
                        return None
                return None
        x_idx = _col_idx(x_col_name)
        series = []
        for s in series_spec:
            s_name = s.get("name") or s.get("column")
            y_idx = _col_idx(s.get("column") or s.get("name"))
            points = []
            for row in data_rows:
                try:
                    x_val = row[x_idx] if (x_idx is not None and x_idx < len(row)) else None
                    y_val_raw = row[y_idx] if (y_idx is not None and y_idx < len(row)) else None
                    y_val = float(y_val_raw) if y_val_raw not in (None, "") else None
                    if x_val is not None and y_val is not None:
                        points.append({"name": str(x_val), "value": y_val})
                except Exception:
                    continue
            series.append({"name": str(s_name), "data": points})
        return {"series": series}

    normalized = _normalize(values, body.mapping)

    # Persist binding
    from utils.supabase import get_supabase_client
    sb = get_supabase_client()
    row = {
        "user_id": user_id,
        "deck_id": body.deckId,
        "slide_id": body.slideId,
        "component_id": body.componentId,
        "provider": "google_sheets",
        "spreadsheet_id": body.spreadsheetId,
        "sheet_title": body.sheetTitle,
        "range_a1": body.rangeA1,
        "mapping": body.mapping,
        "etag": etag,
        "status": "active",
        "updated_at": datetime.utcnow().isoformat(),
    }
    sb.table("chart_data_bindings").upsert(row, on_conflict="component_id").execute()

    # Register Drive push channel for this spreadsheet
    try:
        channel_id = str(uuid.uuid4())
        webhook_url = os.getenv("GOOGLE_DRIVE_WEBHOOK_URL") or (os.getenv("BACKEND_URL", "http://localhost:8081") + "/api/google/webhooks/drive")
        api_client = GoogleApiClient(GoogleOAuthService())
        watch_resp = await api_client.drive_watch_file(user_id=user_id, file_id=body.spreadsheetId, channel_id=channel_id, webhook_url=webhook_url)
        # Persist channel mapping
        sb.table("google_drive_watch_channels").insert({
            "user_id": user_id,
            "resource_id": watch_resp.get("resourceId"),
            "resource_uri": watch_resp.get("resourceUri"),
            "channel_id": watch_resp.get("id") or channel_id,
            "channel_token": None,
            "expiration": watch_resp.get("expiration"),
            "spreadsheet_id": body.spreadsheetId
        }).execute()
    except Exception as e:
        logger.warning(f"Drive watch registration failed: {e}")

    # Return with initial data
    return {"bindingId": f"component:{body.componentId}", "status": "active", "data": normalized}


@router.post("/charts/{componentId}/pause")
async def pause_chart_binding(componentId: str, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    from utils.supabase import get_supabase_client
    sb = get_supabase_client()
    sb.table("chart_data_bindings").update({"status": "paused", "updated_at": datetime.utcnow().isoformat()}).eq("component_id", componentId).eq("user_id", user_id).execute()
    return {"ok": True}


# ============================
# Webhook: Google Drive push notifications
# ============================


@router.post("/google/webhooks/drive")
async def drive_push_notifications(request: Request):
    """Endpoint to receive Drive push notifications.
    Expects X-Goog-Channel-Id, X-Goog-Resource-Id, X-Goog-Resource-State headers.
    """
    try:
        channel_id = request.headers.get("X-Goog-Channel-Id")
        resource_id = request.headers.get("X-Goog-Resource-Id")
        resource_state = request.headers.get("X-Goog-Resource-State")
        # token = request.headers.get("X-Goog-Channel-Token")  # optional for correlation
        # Find associated spreadsheet and user from our stored watch channel
        from utils.supabase import get_supabase_client
        sb = get_supabase_client()
        res = sb.table("google_drive_watch_channels").select("user_id, spreadsheet_id").eq("channel_id", channel_id).eq("resource_id", resource_id).limit(1).execute()
        if not res.data:
            return JSONResponse({"ok": True, "ignored": True}, status_code=200)
        row = res.data[0]
        user_id = row.get("user_id")
        spreadsheet_id = row.get("spreadsheet_id")
        # Fetch all active bindings for this spreadsheet
        bindings = sb.table("chart_data_bindings").select("deck_id,slide_id,component_id,range_a1,mapping").eq("user_id", user_id).eq("spreadsheet_id", spreadsheet_id).eq("status", "active").execute()
        if not bindings.data:
            return {"ok": True}
        # For each binding, refetch values and publish chart.data.updated to any known sessions (frontend associates by session)
        api = GoogleApiClient(GoogleOAuthService())
        for b in bindings.data:
            try:
                values_resp, etag = await api.sheets_values_get(user_id=user_id, spreadsheet_id=spreadsheet_id, range_a1=b.get("range_a1"))
                values = values_resp.get("values", []) or []
                mapping = b.get("mapping") or {}
                # Normalize same as in bind
                def _normalize(values_in, mapping_in):
                    if not values_in:
                        return {"series": []}
                    header_row = int(mapping_in.get("headerRow", 1) or 1)
                    headers = values_in[0] if header_row == 1 else None
                    data_rows = values_in[1:] if header_row == 1 else values_in
                    def _col_idx(name_or_idx):
                        try:
                            return int(name_or_idx)
                        except Exception:
                            if headers and isinstance(name_or_idx, str):
                                try:
                                    return headers.index(name_or_idx)
                                except Exception:
                                    return None
                            return None
                    x_idx = _col_idx(mapping_in.get("xColumn"))
                    out_series = []
                    for s in (mapping_in.get("ySeries", []) or []):
                        s_name = s.get("name") or s.get("column")
                        y_idx = _col_idx(s.get("column") or s.get("name"))
                        points = []
                        for row in data_rows:
                            try:
                                x_val = row[x_idx] if (x_idx is not None and x_idx < len(row)) else None
                                y_raw = row[y_idx] if (y_idx is not None and y_idx < len(row)) else None
                                y_val = float(y_raw) if y_raw not in (None, "") else None
                                if x_val is not None and y_val is not None:
                                    points.append({"name": str(x_val), "value": y_val, "x": str(x_val), "y": y_val})
                            except Exception:
                                continue
                        out_series.append({"name": str(s_name), "data": points})
                    # Heuristic xType detection (treat as time if labels look like dates/months/years)
                    def _looks_time_like(lbls):
                        months = ["jan","feb","mar","apr","may","jun","jul","aug","sep","oct","nov","dec"]
                        for l in (str(x).lower() for x in lbls if x is not None):
                            if any(m in l for m in months):
                                return True
                            if any(ch in l for ch in ("-","/")) and any(c.isdigit() for c in l):
                                return True
                            if any(str(y) in l for y in range(1990, 2051)):
                                return True
                        return False
                    labels = [p.get("name") for p in (out_series[0].get("data") if out_series else [])]
                    x_type = "time" if _looks_time_like(labels) else "category"
                    return {"series": out_series, "xType": x_type}
                normalized = _normalize(values, mapping)
                # Publish event – frontend will filter by componentId
                event = {
                    "type": "chart.data.updated",
                    "sessionId": "global",  # Frontend listens per editor session; here we can use a router later
                    "messageId": None,
                    "timestamp": int(datetime.utcnow().timestamp() * 1000),
                    "data": {
                        "deckId": b.get("deck_id"),
                        "slideId": b.get("slide_id"),
                        "componentId": b.get("component_id"),
                        "bindingId": f"component:{b.get('component_id')}",
                        "data": normalized,
                        "version": int(datetime.utcnow().timestamp())
                    }
                }
                # For now, publish to a known channel (could be per-deck session mapping)
                await agent_stream_bus.publish("charts", event)
            except Exception:
                continue
        return {"ok": True}
    except Exception as e:
        logger.error(f"Drive webhook error: {e}")
        return JSONResponse({"ok": False}, status_code=200)


@router.post("/charts/{componentId}/resume")
async def resume_chart_binding(componentId: str, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    from utils.supabase import get_supabase_client
    sb = get_supabase_client()
    sb.table("chart_data_bindings").update({"status": "active", "updated_at": datetime.utcnow().isoformat()}).eq("component_id", componentId).eq("user_id", user_id).execute()
    return {"ok": True}


@router.delete("/charts/{componentId}/binding")
async def delete_chart_binding(componentId: str, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    from utils.supabase import get_supabase_client
    sb = get_supabase_client()
    sb.table("chart_data_bindings").delete().eq("component_id", componentId).eq("user_id", user_id).execute()
    return {"ok": True}

# ============================
# Endpoints: Export
# ============================


@router.post("/export/slides/editable", response_model=JobResponse)
async def export_slides_editable(body: ExportEditableRequest, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    job_id = jobs_store.create(user_id=user_id, job_type=JobType.EXPORT_EDITABLE, input_payload={"options": body.options or {}})

    # FIX: Use safe background task wrapper for proper error logging
    create_background_task(
        _run_export_job(user_id=user_id, job_id=job_id, job_type=JobType.EXPORT_EDITABLE, deck=body.deck, options=body.options),
        name=f"export_editable_{job_id}"
    )
    return JobResponse(jobId=job_id)


@router.post("/export/slides/images", response_model=JobResponse)
async def export_slides_images(body: ExportImagesRequest, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    job_id = jobs_store.create(user_id=user_id, job_type=JobType.EXPORT_IMAGES, input_payload={"options": body.options or {}})

    # FIX: Use safe background task wrapper for proper error logging
    create_background_task(
        _run_export_job(user_id=user_id, job_id=job_id, job_type=JobType.EXPORT_IMAGES, deck=body.deck, options=body.options),
        name=f"export_images_{job_id}"
    )
    return JobResponse(jobId=job_id)


