import os
import json
import uuid
import base64
import hmac
import hashlib
import logging
import tempfile
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional, Tuple
import asyncio

import httpx
from fastapi import APIRouter, Depends, HTTPException, Query, Request, UploadFile, File
from fastapi.responses import JSONResponse, RedirectResponse
from pydantic import BaseModel, Field

from api.requests.api_auth import get_auth_header
from services.supabase_auth_service import get_auth_service
from services.pptx_importer import PPTXImporter
from services.agent_stream_bus import agent_stream_bus


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
        from utils.supabase import get_supabase_client

        self.supabase = get_supabase_client()

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
        self.supabase.table("conversion_jobs").insert(row).execute()
        return job_id

    def update(self, job_id: str, status: str, result: Optional[Dict[str, Any]] = None, error: Optional[str] = None) -> None:
        payload: Dict[str, Any] = {"status": status, "updated_at": datetime.utcnow().isoformat()}
        if result is not None:
            payload["result"] = result
        if error is not None:
            payload["error"] = error
        self.supabase.table("conversion_jobs").update(payload).eq("id", job_id).execute()

    def get(self, job_id: str) -> Optional[Dict[str, Any]]:
        res = self.supabase.table("conversion_jobs").select("*").eq("id", job_id).limit(1).execute()
        if not res.data:
            return None
        return res.data[0]


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
    access_token: str
) -> Dict[str, Any]:
    """
    Convert a Google Slides presentation to a deck using CustomComponents.

    Each slide is converted to a single CustomComponent that renders the entire
    slide as HTML/CSS, ensuring perfect visual fidelity.

    Args:
        presentation: The Google Slides API presentation data
        user_id: The user's ID for authentication
        access_token: OAuth access token for downloading images

    Returns:
        A deck dictionary with slides containing CustomComponents
    """
    import google.generativeai as genai
    from agents.config import VISION_IMPORT_MODEL

    # Configure Gemini
    api_key = os.getenv("GOOGLE_API_KEY") or os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=500, detail="Gemini API key not configured")
    genai.configure(api_key=api_key)

    # Get presentation metadata
    title = presentation.get("title", "Imported Presentation")
    page_size = presentation.get("pageSize", {})
    width_emu = page_size.get("width", {}).get("magnitude", 9144000)
    height_emu = page_size.get("height", {}).get("magnitude", 5143500)

    # Convert EMU to pixels (1 inch = 914400 EMU, assume 96 DPI)
    # Standard slide is 10" x 7.5" = 960 x 720 at 96 DPI, but we use 1920x1080
    aspect_ratio = width_emu / height_emu if height_emu > 0 else 16/9

    slides_data = presentation.get("slides", [])
    slides_out = []

    logger.info(f"[GoogleSlidesImport] Converting {len(slides_data)} slides to CustomComponents")

    for idx, slide in enumerate(slides_data):
        try:
            slide_id = slide.get("objectId", str(uuid.uuid4()))

            # Generate CustomComponent for this slide
            custom_component = await _generate_slide_custom_component(
                slide=slide,
                slide_index=idx,
                presentation=presentation,
                access_token=access_token,
                model=genai.GenerativeModel(VISION_IMPORT_MODEL)
            )

            # Extract title from slide for naming
            slide_title = _extract_slide_title(slide) or f"Slide {idx + 1}"

            slides_out.append({
                "id": slide_id,
                "title": slide_title,
                "components": [custom_component]
            })

            logger.info(f"[GoogleSlidesImport] Converted slide {idx + 1}/{len(slides_data)}")

        except Exception as e:
            logger.error(f"[GoogleSlidesImport] Failed to convert slide {idx + 1}: {e}")
            # Create a fallback error slide
            slides_out.append({
                "id": str(uuid.uuid4()),
                "title": f"Slide {idx + 1} (Error)",
                "components": [_create_error_slide_component(str(e))]
            })

    return {
        "uuid": str(uuid.uuid4()),
        "name": title,
        "slides": slides_out,
        "size": {"width": 1920, "height": 1080},
        "metadata": {
            "source": "google_slides_custom_component",
            "import_stats": {
                "slides": len(slides_out),
                "method": "custom_component_ai"
            }
        }
    }


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


async def _generate_slide_custom_component(
    slide: Dict[str, Any],
    slide_index: int,
    presentation: Dict[str, Any],
    access_token: str,
    model: Any
) -> Dict[str, Any]:
    """
    Generate a CustomComponent that renders a Google Slide.

    Uses AI to analyze the slide structure and generate a render function
    that recreates the slide as HTML/CSS.
    """
    # Prepare slide data for AI analysis
    slide_json = json.dumps(slide, indent=2, default=str)

    # Get presentation theme colors for reference
    theme_colors = _extract_theme_colors(presentation)

    # Build the AI prompt
    prompt = f"""You are a presentation slide converter. Convert this Google Slides slide data into a JavaScript render function for a CustomComponent.

The render function should recreate the slide EXACTLY as it appears in Google Slides using HTML and CSS.

SLIDE DATA:
```json
{slide_json[:15000]}  // Truncated if too long
```

THEME COLORS:
{json.dumps(theme_colors, indent=2)}

REQUIREMENTS:
1. The function signature MUST be: function render({{ props, state, updateState, isThumbnail, containerWidth, containerHeight }})
2. Return a React.createElement() tree that recreates the slide layout
3. Use absolute positioning for all elements (position: 'absolute')
4. Convert EMU units to percentages (1 EMU = magnitude / 914400 inches, use % of container)
5. Handle all shape types: rectangles, ellipses, text boxes, images, lines, etc.
6. Preserve exact colors (convert Google's rgbColor format to hex)
7. Handle text formatting: font size, weight, color, alignment
8. For images, use the contentUrl from the slide data
9. The root container should be position: 'relative' with width/height 100%
10. Handle gradients, shadows, and borders where specified
11. Support rotations using CSS transform: rotate()

IMPORTANT:
- Use React.createElement() NOT JSX
- All styles should be inline objects
- Handle missing data gracefully with fallbacks
- Scale font sizes proportionally (Google uses EMU, convert to reasonable px)
- Background should fill the entire slide

Output ONLY the JavaScript function code, no markdown, no explanation."""

    try:
        # Call Gemini to generate the render function
        response = await asyncio.get_event_loop().run_in_executor(
            None,
            lambda: model.generate_content(prompt)
        )

        render_code = response.text.strip()

        # Clean up the response (remove markdown code blocks if present)
        if render_code.startswith("```"):
            lines = render_code.split("\n")
            render_code = "\n".join(lines[1:-1] if lines[-1].startswith("```") else lines[1:])

        # Validate the render function
        if not render_code.startswith("function render"):
            # Try to fix common issues
            if "render" in render_code and "function" in render_code:
                # Extract the function
                start = render_code.find("function render")
                if start >= 0:
                    render_code = render_code[start:]
            else:
                raise ValueError("Invalid render function generated")

    except Exception as e:
        logger.warning(f"[GoogleSlidesImport] AI generation failed for slide {slide_index + 1}: {e}")
        # Create a fallback render function
        render_code = _create_fallback_render_function(slide, theme_colors)

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
            "props": {
                "slideIndex": slide_index,
                "sourceType": "google_slides"
            }
        }
    }


def _extract_theme_colors(presentation: Dict[str, Any]) -> Dict[str, str]:
    """Extract theme colors from a Google Slides presentation."""
    theme_colors = {
        "BACKGROUND": "#FFFFFF",
        "TEXT": "#000000",
        "ACCENT1": "#1A73E8",
        "ACCENT2": "#FBBC04",
        "ACCENT3": "#34A853",
        "ACCENT4": "#EA4335",
        "ACCENT5": "#A142F4",
        "ACCENT6": "#00ACC1"
    }

    try:
        masters = presentation.get("masters", [])
        if masters:
            master = masters[0]
            master_props = master.get("masterProperties", {})
            # Could extract actual theme colors here if needed
    except Exception:
        pass

    return theme_colors


def _create_fallback_render_function(slide: Dict[str, Any], theme_colors: Dict[str, str]) -> str:
    """Create a basic fallback render function when AI generation fails."""
    # Extract background color
    bg_color = "#FFFFFF"
    try:
        page_props = slide.get("pageProperties", {})
        bg_fill = page_props.get("pageBackgroundFill", {})
        solid = bg_fill.get("solidFill", {})
        if solid:
            color = solid.get("color", {})
            rgb = color.get("rgbColor", {})
            r = int(rgb.get("red", 1) * 255)
            g = int(rgb.get("green", 1) * 255)
            b = int(rgb.get("blue", 1) * 255)
            bg_color = f"#{r:02X}{g:02X}{b:02X}"
    except Exception:
        pass

    # Extract text content for display
    texts = []
    try:
        for el in slide.get("pageElements", []):
            shape = el.get("shape", {})
            text = shape.get("text", {})
            extracted = _extract_plain_text_from_google(text)
            if extracted:
                texts.append(extracted)
    except Exception:
        pass

    text_content = "\\n".join(texts[:5])  # Limit to first 5 text elements

    return f'''function render({{ props, state, updateState, isThumbnail, containerWidth, containerHeight }}) {{
  var rootStyle = {{
    width: '100%',
    height: '100%',
    backgroundColor: '{bg_color}',
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    boxSizing: 'border-box',
    fontFamily: 'system-ui, -apple-system, sans-serif'
  }};

  var textStyle = {{
    fontSize: isThumbnail ? '12px' : '24px',
    color: '#333333',
    textAlign: 'center',
    maxWidth: '80%',
    lineHeight: 1.5,
    whiteSpace: 'pre-wrap'
  }};

  return React.createElement('div', {{ style: rootStyle }},
    React.createElement('div', {{ style: textStyle }}, {json.dumps(text_content)})
  );
}}'''


def _create_error_slide_component(error_message: str) -> Dict[str, Any]:
    """Create a CustomComponent that displays an error message."""
    safe_error = error_message.replace("'", "\\'").replace('"', '\\"')[:200]

    render_code = f'''function render({{ props, state, updateState, isThumbnail, containerWidth, containerHeight }}) {{
  var rootStyle = {{
    width: '100%',
    height: '100%',
    backgroundColor: '#FEF2F2',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px',
    boxSizing: 'border-box'
  }};

  var iconStyle = {{
    fontSize: isThumbnail ? '24px' : '48px',
    marginBottom: '16px'
  }};

  var titleStyle = {{
    fontSize: isThumbnail ? '14px' : '24px',
    fontWeight: '600',
    color: '#991B1B',
    marginBottom: '8px'
  }};

  var messageStyle = {{
    fontSize: isThumbnail ? '10px' : '14px',
    color: '#7F1D1D',
    textAlign: 'center',
    maxWidth: '80%'
  }};

  return React.createElement('div', {{ style: rootStyle }},
    React.createElement('div', {{ style: iconStyle }}, '⚠️'),
    React.createElement('div', {{ style: titleStyle }}, 'Import Error'),
    React.createElement('div', {{ style: messageStyle }}, '{safe_error}')
  );
}}'''

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


# Helper functions for unit conversion (used by the converter)
def _magnitude(value: Optional[Dict[str, Any]]) -> float:
    """Extract magnitude from a Google Slides dimension object."""
    if not isinstance(value, dict):
        return 0.0
    try:
        return float(value.get("magnitude", 0))
    except Exception:
        return 0.0


def _dim_to_points(dim: Optional[Dict[str, Any]]) -> float:
    """Convert a Google Slides dimension to points."""
    if not isinstance(dim, dict):
        return 0.0
    mag = _magnitude(dim)
    unit = str(dim.get("unit") or "PT").upper()
    if unit == "EMU":
        return float(mag) / 12700.0
    return float(mag)


# ==============================================================================
# Import Job Functions
# ==============================================================================

# Note: The old _map_slides_to_internal function has been removed.
# All Google Slides imports now use _convert_google_slides_to_custom_components()
# which generates CustomComponents for perfect visual fidelity.


