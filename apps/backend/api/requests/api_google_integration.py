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
            q.append(f"name contains '{query.replace("'", "\\'")}'")
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
            q.append(f"name contains '{query.replace("'", "\\'")}'")
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


async def _map_slides_to_internal(presentation: Dict[str, Any]) -> Dict[str, Any]:
    def _to_hex_color(color: Dict[str, Any], default: str = "#000000FF") -> str:
        try:
            if not isinstance(color, dict):
                return default
            rgb = None
            alpha = 1.0
            if "rgbColor" in color:
                rgb = color.get("rgbColor") or {}
            elif "themeColor" in color:
                # Approximate common Google theme colors
                tc = str(color.get("themeColor") or "").upper()
                theme_map = {
                    "BACKGROUND": "#FFFFFFFF",
                    "TEXT": "#000000FF",
                    "ACCENT1": "#1A73E8FF",
                    "ACCENT2": "#FBBC04FF",
                    "ACCENT3": "#34A853FF",
                    "ACCENT4": "#EA4335FF",
                    "ACCENT5": "#A142F4FF",
                    "ACCENT6": "#00ACC1FF",
                    "LINK": "#1A73E8FF",
                    "THEME_COLOR_UNSPECIFIED": default,
                }
                return theme_map.get(tc, default)
            # Google may use separate alpha
            if "alpha" in color:
                try:
                    alpha = float(color.get("alpha"))
                except Exception:
                    alpha = 1.0
            r = int(round(float(rgb.get("red", 0)) * 255)) if rgb else 0
            g = int(round(float(rgb.get("green", 0)) * 255)) if rgb else 0
            b = int(round(float(rgb.get("blue", 0)) * 255)) if rgb else 0
            a = int(round(alpha * 255))
            return f"#{r:02X}{g:02X}{b:02X}{a:02X}"
        except Exception:
            return default

    def _magnitude(value: Optional[Dict[str, Any]]) -> float:
        if not isinstance(value, dict):
            return 0.0
        try:
            return float(value.get("magnitude", 0))
        except Exception:
            return 0.0

    def _dim_to_points(dim: Optional[Dict[str, Any]]) -> float:
        if not isinstance(dim, dict):
            return 0.0
        mag = _magnitude(dim)
        unit = str(dim.get("unit") or "PT").upper()
        if unit == "EMU":
            return float(mag) / 12700.0
        # PT or unknown fallback
        return float(mag)

    def _pt_to_px(pt: float) -> int:
        # 1pt = 1/72 inch; assuming 96 DPI, px = pt * (96/72)
        try:
            return int(round(float(pt) * (96.0 / 72.0)))
        except Exception:
            return int(round(float(pt) or 0.0))

    def _to_points(value: float, unit: Optional[str]) -> float:
        # Convert EMU to PT when needed (1pt = 12700 EMU)
        if unit and str(unit).upper() == "EMU":
            return float(value) / 12700.0
        return float(value)

    def _compute_bounds(el: Dict[str, Any], page_w_pt: float, page_h_pt: float) -> Dict[str, float]:
        # Compute axis-aligned bounding box by transforming the four corners in page space
        tr = el.get("transform") or {}
        # Infer unit
        unit = tr.get("unit")
        if isinstance(unit, str):
            unit = unit.upper()
        else:
            try:
                tx_raw = float(tr.get("translateX", 0) or 0.0)
                ty_raw = float(tr.get("translateY", 0) or 0.0)
                size = el.get("size") or {}
                w_mag = _magnitude(size.get("width"))
                h_mag = _magnitude(size.get("height"))
                unit = "EMU" if max(abs(tx_raw), abs(ty_raw), w_mag, h_mag) > 5000 else "PT"
            except Exception:
                unit = "PT"
        unit = (unit or "PT").upper()

        # Base size (pt)
        size = el.get("size") or {}
        w_pt = _dim_to_points(size.get("width"))
        h_pt = _dim_to_points(size.get("height"))

        # Transform the four corners into page coordinates (pt)
        corners = [
            _apply_transform_point(tr, 0.0, 0.0, unit),
            _apply_transform_point(tr, w_pt or 0.0, 0.0, unit),
            _apply_transform_point(tr, 0.0, h_pt or 0.0, unit),
            _apply_transform_point(tr, w_pt or 0.0, h_pt or 0.0, unit),
        ]
        min_x_pt = min(c["x"] for c in corners)
        max_x_pt = max(c["x"] for c in corners)
        min_y_pt = min(c["y"] for c in corners)
        max_y_pt = max(c["y"] for c in corners)

        # Convert to our canvas
        nx = int(round((min_x_pt / max(1.0, page_w_pt)) * 1920))
        ny = int(round((min_y_pt / max(1.0, page_h_pt)) * 1080))
        nw = int(round(((max_x_pt - min_x_pt) / max(1.0, page_w_pt)) * 1920))
        nh = int(round(((max_y_pt - min_y_pt) / max(1.0, page_h_pt)) * 1080))

        # Rotation from matrix
        import math as _math
        sx = float(tr.get("scaleX", 1.0) or 1.0)
        shy = float(tr.get("shearY", 0.0) or 0.0)
        try:
            angle_deg = int(round(_math.degrees(_math.atan2(shy, sx))))
        except Exception:
            angle_deg = 0

        # Clamp
        nx = max(0, min(1920, nx))
        ny = max(0, min(1080, ny))
        nw = max(1, min(1920, nw))
        nh = max(1, min(1080, nh))
        return {"x": nx, "y": ny, "width": nw, "height": nh, "rotation": angle_deg}

    def _apply_transform_point(tr: Dict[str, Any], x_pt: float, y_pt: float, unit: str) -> Dict[str, float]:
        # x' = sx*x + shx*y + tx ; y' = shy*x + sy*y + ty
        sx = float(tr.get("scaleX", 1.0) or 1.0)
        sy = float(tr.get("scaleY", 1.0) or 1.0)
        shx = float(tr.get("shearX", 0.0) or 0.0)
        shy = float(tr.get("shearY", 0.0) or 0.0)
        tx = _to_points(float(tr.get("translateX", 0.0) or 0.0), unit)
        ty = _to_points(float(tr.get("translateY", 0.0) or 0.0), unit)
        x_prime = (sx * x_pt) + (shx * y_pt) + tx
        y_prime = (shy * x_pt) + (sy * y_pt) + ty
        return {"x": x_prime, "y": y_prime}

    def _line_endpoints_px(el: Dict[str, Any], page_w_pt: float, page_h_pt: float, group_offset_px: Optional[Dict[str, int]] = None) -> Dict[str, Dict[str, int]]:
        size = el.get("size") or {}
        w_pt = _dim_to_points(size.get("width"))
        h_pt = _dim_to_points(size.get("height"))
        tr = el.get("transform") or {}
        unit = str(tr.get("unit") or "PT").upper()
        # Canonical endpoints in element space
        if (w_pt or 0) >= (h_pt or 0):
            # Horizontal canonical line at mid-height
            p1 = {"x": 0.0, "y": (h_pt or 0.0) / 2.0}
            p2 = {"x": (w_pt or 0.0), "y": (h_pt or 0.0) / 2.0}
        else:
            # Vertical canonical line at mid-width
            p1 = {"x": (w_pt or 0.0) / 2.0, "y": 0.0}
            p2 = {"x": (w_pt or 0.0) / 2.0, "y": (h_pt or 0.0)}
        # Transform to page coords (pt)
        tp1 = _apply_transform_point(tr, p1["x"], p1["y"], unit)
        tp2 = _apply_transform_point(tr, p2["x"], p2["y"], unit)
        # Convert to px relative to slide
        s_px = {
            "x": int(round((tp1["x"] / max(1.0, page_w_pt)) * 1920)),
            "y": int(round((tp1["y"] / max(1.0, page_h_pt)) * 1080))
        }
        e_px = {
            "x": int(round((tp2["x"] / max(1.0, page_w_pt)) * 1920)),
            "y": int(round((tp2["y"] / max(1.0, page_h_pt)) * 1080))
        }
        # Adjust to group-relative if requested
        if group_offset_px:
            s_px = {"x": s_px["x"] - int(group_offset_px.get("x", 0)), "y": s_px["y"] - int(group_offset_px.get("y", 0))}
            e_px = {"x": e_px["x"] - int(group_offset_px.get("x", 0)), "y": e_px["y"] - int(group_offset_px.get("y", 0))}
        return {"start": s_px, "end": e_px}

    def _extract_plain_text(text_obj: Dict[str, Any]) -> str:
        try:
            elements = (text_obj or {}).get("textElements") or []
            parts: List[str] = []
            for te in elements:
                run = te.get("textRun") if isinstance(te, dict) else None
                if not run:
                    continue
                content = (run.get("content") or "").replace("\r", "").replace("\n", "\n")
                parts.append(content)
            return ("".join(parts)).strip()
        except Exception:
            return ""

    def _map_text_block(shape: Dict[str, Any], bounds: Dict[str, float]) -> Optional[Dict[str, Any]]:
        text = (shape.get("text") or {})
        elements = text.get("textElements") or []
        segments: List[Dict[str, Any]] = []
        # Paragraph alignment / line spacing from first paragraph marker
        alignment = "left"
        line_height = None
        root_text_color = None
        for te in elements:
            pm = te.get("paragraphMarker") if isinstance(te, dict) else None
            if not pm:
                continue
            pstyle = pm.get("style") or {}
            align = (pstyle.get("alignment") or "").lower()
            if align in ("start", "left"):
                alignment = "left"
            elif align in ("end", "right"):
                alignment = "right"
            elif align in ("center",):
                alignment = "center"
            lh = pstyle.get("lineSpacing")
            if lh is not None:
                try:
                    line_height = float(lh) / 100.0
                except Exception:
                    line_height = None
            break
        for te in elements:
            run = te.get("textRun") if isinstance(te, dict) else None
            if not run:
                continue
            content = (run.get("content") or "").replace("\r", "").replace("\n", "\n")
            if not content.strip():
                continue
            style = run.get("style") or {}
            seg_style: Dict[str, Any] = {}
            if "foregroundColor" in style:
                seg_style["textColor"] = _to_hex_color(style.get("foregroundColor"))
                # Track a root textColor from the first colored run
                if not root_text_color:
                    root_text_color = seg_style["textColor"]
            if "bold" in style:
                seg_style["bold"] = bool(style.get("bold"))
            if "italic" in style:
                seg_style["italic"] = bool(style.get("italic"))
            if "underline" in style:
                seg_style["underline"] = bool(style.get("underline"))
            if "strikethrough" in style:
                seg_style["strike"] = bool(style.get("strikethrough"))
            if "fontSize" in style:
                try:
                    pt = _dim_to_points(style.get("fontSize"))
                    seg_style["fontSize"] = _pt_to_px(pt)
                except Exception:
                    pass
            if "weightedFontFamily" in style:
                fam = (style.get("weightedFontFamily") or {}).get("fontFamily")
                if fam:
                    seg_style["fontFamily"] = fam
                weight = (style.get("weightedFontFamily") or {}).get("weight")
                if weight:
                    try:
                        seg_style["fontWeight"] = str(weight)
                    except Exception:
                        pass
            # Defaults required by schema for inline style
            if "backgroundColor" not in seg_style:
                seg_style["backgroundColor"] = "#00000000"
            if "bold" not in seg_style:
                seg_style["bold"] = False
            if "italic" not in seg_style:
                seg_style["italic"] = False
            if "underline" not in seg_style:
                seg_style["underline"] = False
            if "strike" not in seg_style:
                seg_style["strike"] = False
            segments.append({"text": content, "style": seg_style})
        if not segments:
            return None
        # Compute dominant fontFamily for props-level hint
        from collections import Counter as _Counter
        fams = [s.get("style", {}).get("fontFamily") for s in segments if s.get("style", {}).get("fontFamily")]
        dominant_family = None
        if fams:
            dominant_family = _Counter(fams).most_common(1)[0][0]
        # Compute dominant font size (px). If none present, estimate from bounds height
        present_sizes = [s.get("style", {}).get("fontSize") for s in segments if isinstance(s.get("style"), dict) and isinstance(s.get("style", {}).get("fontSize"), (int, float))]
        if present_sizes:
            dominant_size_px = int(max(present_sizes))
        else:
            # Estimate: 25% of box height for single-line headline
            dominant_size_px = max(16, min(200, int(round(bounds["height"] * 0.25))))
        # Backfill missing fontSize on segments
        for s in segments:
            st = s.get("style") or {}
            if "fontSize" not in st or not isinstance(st.get("fontSize"), (int, float)):
                st["fontSize"] = dominant_size_px
                s["style"] = st
        comp = {
            "id": str(uuid.uuid4()),
            "type": "TiptapTextBlock",
            "props": {
                "position": {"x": bounds["x"], "y": bounds["y"]},
                "width": bounds["width"],
                "height": bounds["height"],
                "texts": segments,
                # Defaults to help schema
                "alignment": alignment,
                "verticalAlignment": "top",
                "padding": 0,
                "opacity": 1,
                "rotation": bounds.get("rotation", 0),
                "textColor": root_text_color or "#000000ff",
                **({"lineHeight": line_height} if line_height else {}),
                **({"fontFamily": dominant_family} if dominant_family else {}),
                **({"fontSize": dominant_size_px} if dominant_size_px else {}),
            }
        }
        return comp

    def _map_shape(shape: Dict[str, Any], elem: Dict[str, Any], bounds: Dict[str, float]) -> Optional[Dict[str, Any]]:
        props = shape.get("shapeProperties") or {}
        fill = props.get("shapeBackgroundFill") or {}
        solid = fill.get("solidFill") or {}
        gradient = fill.get("gradientFill") or {}
        outline = props.get("outline") or {}
        ofill = (outline.get("outlineFill") or {}).get("solidFill") or {}
        fill_color = _to_hex_color(solid.get("color"), default="#00000000")
        stroke_w_pt = _dim_to_points(outline.get("weight") if isinstance(outline.get("weight"), dict) else {}) if isinstance(outline, dict) else 0.0
        stroke_w = max(0, _pt_to_px(stroke_w_pt))
        stroke_color = _to_hex_color(ofill.get("color"), default=("#000000ff" if stroke_w > 0 else "#00000000"))
        # Map Slides shapeType to our schema
        stype = (shape.get("shapeType") or "").upper()
        shape_type = "rectangle"
        if stype in ("ELLIPSE", "CIRCLE", "OVAL"):
            try:
                # Prefer pageElement size (pre-transform) to detect perfect circles
                esize = (elem.get("size") or {}) if isinstance(elem, dict) else {}
                w_pt = _dim_to_points(esize.get("width"))
                h_pt = _dim_to_points(esize.get("height"))
                wv = float(w_pt or bounds.get("width") or 0)
                hv = float(h_pt or bounds.get("height") or 0)
                if max(wv, hv) > 0:
                    ratio = abs(wv - hv) / max(wv, hv)
                    # Be lenient: Slides often stores nearly-equal radii for circles after transforms
                    shape_type = "circle" if ratio <= 0.05 else "ellipse"
                else:
                    shape_type = "ellipse"
            except Exception:
                shape_type = "ellipse"
        elif stype in ("ROUNDED_RECTANGLE",):
            shape_type = "rectangle"
        elif stype in ("DIAMOND",):
            shape_type = "diamond"
        elif "ARROW" in stype:
            shape_type = "arrow"
        elif stype in ("ISOSCELES_TRIANGLE", "RIGHT_TRIANGLE", "TRIANGLE"):
            shape_type = "triangle"
        elif stype in ("HEART",):
            shape_type = "heart"
        elif stype in ("HEXAGON",):
            shape_type = "hexagon"
        elif stype in ("PENTAGON",):
            shape_type = "pentagon"
        elif stype in ("STAR", "STAR_5", "STAR_6", "STAR_7", "STAR_8", "STAR_10", "STAR_12"):
            shape_type = "star"
        # Border radius for rounded rectangles if provided
        border_radius = 0
        try:
            # Some presentations include a cornerRadius magnitude (pt); approximate to px
            cr = props.get("cornerRadius")
            if isinstance(cr, dict):
                border_radius = max(0, _pt_to_px(_dim_to_points(cr)))
            elif stype == "ROUNDED_RECTANGLE":
                border_radius = max(4, int(min(bounds["width"], bounds["height"]) * 0.08))
        except Exception:
            border_radius = 0
        # Detect inline text inside shapes (non-TEXT_BOX)
        has_text = False
        texts = []
        root_text_color = None
        try:
            if shape.get("text") and shape.get("text").get("textElements"):
                has_text = True
                elements = shape.get("text").get("textElements") or []
                for te in elements:
                    run = te.get("textRun") if isinstance(te, dict) else None
                    if not run:
                        continue
                    content = (run.get("content") or "").replace("\r", "").replace("\n", "\n")
                    if not content.strip():
                        continue
                    style = run.get("style") or {}
                    seg_style: Dict[str, Any] = {}
                    if "foregroundColor" in style:
                        seg_style["textColor"] = _to_hex_color(style.get("foregroundColor"))
                        if not root_text_color:
                            root_text_color = seg_style["textColor"]
                    if "bold" in style:
                        seg_style["bold"] = bool(style.get("bold"))
                    if "italic" in style:
                        seg_style["italic"] = bool(style.get("italic"))
                    if "fontSize" in style:
                        try:
                            pt = _dim_to_points(style.get("fontSize"))
                            seg_style["fontSize"] = _pt_to_px(pt)
                        except Exception:
                            pass
                    # Fill in required text style defaults for Shape schema
                    if "backgroundColor" not in seg_style:
                        seg_style["backgroundColor"] = "#00000000"
                    if "underline" not in seg_style:
                        seg_style["underline"] = False
                    if "strike" not in seg_style:
                        seg_style["strike"] = False
                    # Additional required keys in Shape.texts[].style schema
                    seg_style.setdefault("highlight", False)
                    seg_style.setdefault("subscript", False)
                    seg_style.setdefault("superscript", False)
                    # Provide both color and textColor to satisfy some schema variants
                    seg_style.setdefault("color", seg_style.get("textColor", "#000000ff"))
                    seg_style.setdefault("link", False)
                    seg_style.setdefault("href", "")
                    texts.append({"text": content, "style": seg_style})
        except Exception:
            has_text = False
            texts = []
        # Convert Slides gradient to our gradient object if present
        gradient_obj = None
        try:
            if isinstance(gradient, dict) and (gradient.get("stops") or gradient.get("type")):
                gtype = str((gradient.get("type") or "LINEAR").lower())
                angle = int(round(float(gradient.get("angle", 0)))) if isinstance(gradient.get("angle"), (int, float)) else 0
                stops_in = gradient.get("stops") or []
                stops = []
                for st in stops_in:
                    col = _to_hex_color((st or {}).get("color"), default="#000000ff")
                    pos = float((st or {}).get("position", 0)) * 100.0 if isinstance((st or {}).get("position"), (int, float)) and (st or {}).get("position") <= 1 else float((st or {}).get("position", 0))
                    stops.append({"color": col, "position": pos})
                if stops:
                    gradient_obj = {"type": ("linear" if "lin" in gtype else "radial"), "angle": angle, "stops": stops}
        except Exception:
            gradient_obj = None

        # Resolve final fill color for compatibility-only consumers
        # - If gradient-only, use first stop as a non-transparent fallback fill
        # - If fully transparent and no stroke/gradient, choose a neutral grey
        fill_color_final = fill_color
        try:
            if gradient_obj and isinstance(gradient_obj.get("stops"), list) and gradient_obj["stops"]:
                first_stop = gradient_obj["stops"][0]
                col = first_stop.get("color")
                if isinstance(col, str) and col:
                    fill_color_final = col
        except Exception:
            pass
        if (str(fill_color_final).upper() in ("#00000000", "#00000000FF", "#00000000")) and (not gradient_obj) and (stroke_w == 0):
            fill_color_final = "#CCCCCCFF"

        comp = {
            "id": str(uuid.uuid4()),
            "type": "Shape",
            "props": {
                "position": {"x": bounds["x"], "y": bounds["y"]},
                "width": bounds["width"],
                "height": bounds["height"],
                "rotation": bounds.get("rotation", 0),
                "shapeType": shape_type,
                # Provide both keys for broader renderer compatibility
                "shape": shape_type,
                "fill": fill_color_final,
                "backgroundColor": fill_color_final,
                **({"gradient": gradient_obj} if gradient_obj else {}),
                "stroke": stroke_color,
                "strokeWidth": stroke_w,
                "borderColor": stroke_color,
                "borderWidth": stroke_w,
                "opacity": 1,
                "zIndex": 1,
                **({"borderRadius": border_radius} if border_radius else {}),
                **({"hasText": True, "texts": texts, "textColor": root_text_color or "#000000ff"} if has_text else {}),
            }
        }
        return comp

    def _map_image(img: Dict[str, Any], bounds: Dict[str, float], alt_text: Optional[str] = None) -> Optional[Dict[str, Any]]:
        source = img.get("sourceUri") or img.get("contentUrl") or img.get("imageUri")
        if not source:
            return None
        # Normalize googleusercontent thumbnails to direct fetchable URLs where possible
        try:
            if isinstance(source, str) and "=w" in source and source.startswith("http"):
                # Leave as-is; storage layer will fetch and cache
                pass
        except Exception:
            pass
        # Crop (best-effort)
        crop_rect = None
        try:
            ip = img.get("imageProperties") or {}
            cp = ip.get("cropProperties") or {}
            # Support multiple possible keys
            left = cp.get("left") if cp.get("left") is not None else cp.get("leftOffset")
            right = cp.get("right") if cp.get("right") is not None else cp.get("rightOffset")
            top = cp.get("top") if cp.get("top") is not None else cp.get("topOffset")
            bottom = cp.get("bottom") if cp.get("bottom") is not None else cp.get("bottomOffset")
            def _clamp01(v: Any) -> float:
                try:
                    return max(0.0, min(1.0, float(v)))
                except Exception:
                    return 0.0
            if any(v is not None for v in [left, right, top, bottom]):
                crop_rect = {
                    "left": _clamp01(left or 0),
                    "top": _clamp01(top or 0),
                    "right": _clamp01(right or 0),
                    "bottom": _clamp01(bottom or 0),
                }
        except Exception:
            crop_rect = None
        # Flip/opacity (best-effort from transform and transparency)
        flip_x = False
        flip_y = False
        try:
            tr = (img.get("transform") or {})
            sx = float(tr.get("scaleX", 1.0) or 1.0)
            sy = float(tr.get("scaleY", 1.0) or 1.0)
            flip_x = sx < 0
            flip_y = sy < 0
        except Exception:
            pass
        opacity_val = 1
        try:
            ip = img.get("imageProperties") or {}
            trans = ip.get("transparency")
            if isinstance(trans, (int, float)):
                # Google transparency is 0..1 (fraction transparent). Convert to opacity (1 - transparency)
                opacity_val = max(0, min(1, 1 - float(trans)))
        except Exception:
            pass

        comp = {
            "id": str(uuid.uuid4()),
            "type": "Image",
            "props": {
                "position": {"x": bounds["x"], "y": bounds["y"]},
                "width": bounds["width"],
                "height": bounds["height"],
                "src": source,
                # Default to cover to match Slides default; allow contain if aspect requires
                "objectFit": "cover",
                # Border/shadow defaults safe per schema
                "borderRadius": 0,
                "borderWidth": 0,
                "borderColor": "#000000ff",
                "opacity": opacity_val,
                **({"cropRect": crop_rect} if crop_rect else {}),
                **({"alt": alt_text} if alt_text else {}),
                **({"rotation": bounds.get("rotation", 0)} if bounds.get("rotation") else {}),
                **({"flipX": flip_x} if flip_x else {}),
                **({"flipY": flip_y} if flip_y else {}),
            }
        }
        return comp

    def _map_table(table: Dict[str, Any], bounds: Dict[str, float]) -> Optional[Dict[str, Any]]:
        try:
            rows_in = (table.get("tableRows") or [])
            data: List[List[str]] = []
            headers_detected: List[str] = []
            show_header = False
            # Extract cell text and attempt header detection from first row styles
            first_row_styles_bold_count = 0
            for r in rows_in:
                cells = (r.get("tableCells") or [])
                row_vals: List[str] = []
                for ci, c in enumerate(cells):
                    txt = _extract_plain_text((c.get("text") or {}))
                    if not headers_detected and cells:
                        # Check bold style in first row cells
                        try:
                            elements = (c.get("text") or {}).get("textElements") or []
                            for te in elements:
                                run = te.get("textRun") if isinstance(te, dict) else None
                                if run and (run.get("style") or {}).get("bold"):
                                    first_row_styles_bold_count += 1
                                    break
                        except Exception:
                            pass
                    row_vals.append(txt)
                data.append(row_vals)
            headers: List[str] = []
            # Heuristic header detection: non-empty first row and majority bold
            if data:
                prospective = data[0]
                non_empty = sum(1 for v in prospective if (v or '').strip())
                if non_empty >= max(1, int(len(prospective) * 0.6)) and first_row_styles_bold_count >= max(1, int(len(prospective) * 0.5)):
                    headers = prospective
                    show_header = True
                    data = data[1:]
            comp = {
                "id": str(uuid.uuid4()),
                "type": "Table",
                "props": {
                    "position": {"x": bounds["x"], "y": bounds["y"]},
                    "width": bounds["width"],
                    "height": bounds["height"],
                    "opacity": 1,
                    "rotation": bounds.get("rotation", 0),
                    "zIndex": 1,
                    "textColor": "#000000ff",
                    **({"headers": headers} if headers else {}),
                    **({"showHeader": True} if show_header else {}),
                    "data": data,
                    # Minimal TableStyles to satisfy schema; renderer/validator can enrich
                    "tableStyles": {
                        "fontFamily": "Inter",
                        "fontSize": 14,
                        "borderColor": "#e2e8f0",
                        "borderWidth": 1,
                        "cellPadding": 8,
                        "headerBackgroundColor": "#f8fafc",
                        "headerTextColor": "#334155",
                        "cellBackgroundColor": "#ffffff",
                        "textColor": "#334155",
                        "alignment": "left",
                        "alternatingRowColor": False,
                        "hoverEffect": False
                    },
                    "cellStyles": [],
                }
            }
            return comp
        except Exception:
            return None

    def _map_sheets_chart(sc: Dict[str, Any], bounds: Dict[str, float]) -> Optional[Dict[str, Any]]:
        # Fallback map as Image using content URL if provided
        src = sc.get("contentUrl") or sc.get("thumbnailUrl") or sc.get("url")
        if not src:
            return None
        return {
            "id": str(uuid.uuid4()),
            "type": "Image",
            "props": {
                "position": {"x": bounds["x"], "y": bounds["y"]},
                "width": bounds["width"],
                "height": bounds["height"],
                "src": src,
                "objectFit": "contain",
                "borderRadius": 0,
                "borderWidth": 0,
                "borderColor": "#000000ff",
                **({"rotation": bounds.get("rotation", 0)} if bounds.get("rotation") else {}),
            }
        }

    def _map_video(video: Dict[str, Any], bounds: Dict[str, float]) -> Optional[Dict[str, Any]]:
        src = None
        try:
            source_type = (video.get("source") or "").upper()
            vid = video.get("id") or video.get("videoId") or video.get("sourceId")
            if source_type == "YOUTUBE" and vid:
                src = f"https://www.youtube.com/watch?v={vid}"
            elif source_type == "DRIVE" and vid:
                src = f"https://drive.google.com/file/d/{vid}/preview"
            else:
                src = video.get("url") or video.get("contentUrl")
        except Exception:
            src = video.get("url") or video.get("contentUrl")
        if not src:
            return None
        return {
            "id": str(uuid.uuid4()),
            "type": "Video",
            "props": {
                "position": {"x": bounds["x"], "y": bounds["y"]},
                "width": bounds["width"],
                "height": bounds["height"],
                "opacity": 1,
                "rotation": bounds.get("rotation", 0),
                "zIndex": 1,
                "src": src,
                "autoplay": False,
                "controls": True,
                "loop": False,
                "muted": False,
            }
        }

    # Page size from presentation for normalization
    page_size = (presentation.get("pageSize") or presentation.get("size") or {})
    page_w = _dim_to_points(page_size.get("width") if isinstance(page_size, dict) else None)
    page_h = _dim_to_points(page_size.get("height") if isinstance(page_size, dict) else None)
    # Sensible defaults if missing
    if page_w <= 0 or page_h <= 0:
        page_w, page_h = 1920.0, 1080.0

    slides_out: List[Dict[str, Any]] = []
    slides_in = presentation.get("slides") or []
    for idx, slide in enumerate(slides_in):
        components: List[Dict[str, Any]] = []
        # Build lookup for group children resolution
        elements = slide.get("pageElements") or []
        id_to_element = { (e.get("objectId") or str(i)): e for i, e in enumerate(elements) if isinstance(e, dict) }
        consumed_ids: set[str] = set()
        # Pre-scan: collect all child element IDs that belong to any group so we don't double-process them as top-level
        group_child_ids_global: set[str] = set()
        try:
            for el2 in elements:
                if not isinstance(el2, dict):
                    continue
                if "group" in el2 and isinstance(el2.get("group"), dict):
                    grp2 = el2.get("group") or {}
                    raw_children2 = grp2.get("children") or grp2.get("pageElements") or grp2.get("childrenObjectIds") or []
                    for ch2 in raw_children2:
                        if isinstance(ch2, dict):
                            cid2 = ch2.get("objectId")
                            if cid2:
                                group_child_ids_global.add(cid2)
                        elif isinstance(ch2, str):
                            group_child_ids_global.add(ch2)
        except Exception:
            pass
        # Determine slide title from placeholder TITLE if available
        slide_title = None
        try:
            for el in elements:
                shp = (el.get("shape") or {}) if isinstance(el, dict) else {}
                placeholder = (shp.get("placeholder") or {}) if isinstance(shp, dict) else {}
                ptype = (placeholder.get("type") or "").upper()
                if ptype in ("TITLE", "CENTERED_TITLE"):
                    t = _extract_plain_text(shp.get("text") or {})
                    if t:
                        slide_title = t
                        break
            if not slide_title:
                # Fallback: first non-empty text box
                for el in elements:
                    shp = (el.get("shape") or {}) if isinstance(el, dict) else {}
                    if (shp.get("shapeType") or "").upper() in ("TEXT_BOX",):
                        t = _extract_plain_text(shp.get("text") or {})
                        if t:
                            slide_title = t
                            break
        except Exception:
            slide_title = None
        if not slide_title:
            slide_title = f"Slide {idx + 1}"
        # Background from pageProperties
        try:
            page_props = (slide.get("pageProperties") or {})
            pbg = page_props.get("pageBackgroundFill") or {}
            # Ensure we emit exactly one background with all required canonical fields
            bg_added = False

            # Prefer gradient > image > solid
            grad = pbg.get("gradientFill") or {}
            if not bg_added and isinstance(grad, dict) and (grad.get("stops") or grad.get("type")):
                gtype = str((grad.get("type") or "LINEAR")).lower()
                angle = int(round(float(grad.get("angle", 0)))) if isinstance(grad.get("angle"), (int, float)) else 0
                stops_in = grad.get("stops") or []
                stops = []
                for st in stops_in:
                    col = _to_hex_color((st or {}).get("color"), default="#000000ff")
                    pos = float((st or {}).get("position", 0)) * 100.0 if isinstance((st or {}).get("position"), (int, float)) and (st or {}).get("position") <= 1 else float((st or {}).get("position", 0))
                    stops.append({"color": col, "position": pos})
                components.append({
                    "id": str(uuid.uuid4()),
                    "type": "Background",
                    "props": {
                        "position": {"x": 0, "y": 0},
                        "width": 1920,
                        "height": 1080,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 0,
                        "backgroundType": "gradient",
                        "backgroundColor": "#E8F4FDff",
                        "gradient": {"type": ("linear" if "lin" in gtype else "radial"), "angle": angle, "stops": stops},
                        "isAnimated": False,
                        "animationSpeed": 1,
                        "backgroundImageUrl": None,
                        "backgroundImageSize": "cover",
                        "backgroundImageRepeat": "no-repeat",
                        "backgroundImageOpacity": 1,
                        "patternType": None,
                        "patternColor": "#ccccccff",
                        "patternScale": 5,
                        "patternOpacity": 0.5,
                        "kind": "background"
                    }
                })
                bg_added = True

            pic = pbg.get("stretchedPictureFill") or {}
            img_url = pic.get("contentUrl") or pic.get("imageUrl") or pic.get("sourceUrl")
            if not bg_added and img_url:
                components.append({
                    "id": str(uuid.uuid4()),
                    "type": "Background",
                    "props": {
                        "position": {"x": 0, "y": 0},
                        "width": 1920,
                        "height": 1080,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 0,
                        "backgroundType": "image",
                        "backgroundColor": "#E8F4FDff",
                        "gradient": None,
                        "isAnimated": False,
                        "animationSpeed": 1,
                        "backgroundImageUrl": img_url,
                        "backgroundImageSize": "cover",
                        "backgroundImageRepeat": "no-repeat",
                        "backgroundImageOpacity": 1,
                        "patternType": None,
                        "patternColor": "#ccccccff",
                        "patternScale": 5,
                        "patternOpacity": 0.5,
                        "kind": "background"
                    }
                })
                bg_added = True

            solid = pbg.get("solidFill") or {}
            if not bg_added and isinstance(solid, dict):
                bg_color = _to_hex_color(solid.get("color"), default="#FFFFFFFF")
                components.append({
                    "id": str(uuid.uuid4()),
                    "type": "Background",
                    "props": {
                        "position": {"x": 0, "y": 0},
                        "width": 1920,
                        "height": 1080,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": 0,
                        "backgroundType": "color",
                        "backgroundColor": bg_color,
                        "gradient": None,
                        "isAnimated": False,
                        "animationSpeed": 1,
                        "backgroundImageUrl": None,
                        "backgroundImageSize": "cover",
                        "backgroundImageRepeat": "no-repeat",
                        "backgroundImageOpacity": 1,
                        "patternType": None,
                        "patternColor": "#ccccccff",
                        "patternScale": 5,
                        "patternOpacity": 0.5,
                        "kind": "background"
                    }
                })
                bg_added = True
        except Exception:
            pass

        # Elements
        z_cursor = 1
        for el in elements:
            if not isinstance(el, dict):
                continue
            obj_id = el.get("objectId")
            if obj_id and (obj_id in consumed_ids or obj_id in group_child_ids_global):
                continue
            bounds = _compute_bounds(el, page_w, page_h)
            if "shape" in el and isinstance(el.get("shape"), dict):
                shp = el.get("shape")
                shape_type = (shp.get("shapeType") or "").upper()
                # Only Slides TEXT_BOX should map to text; other shapes with text remain Shape with inline texts
                if shape_type == "TEXT_BOX":
                    comp = _map_text_block(shp, bounds)
                    if comp:
                        comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                        components.append(comp)
                    continue
                # Else map as Shape (rect/ellipse/circle/etc.)
                comp = _map_shape(shp, el, bounds)
                if comp:
                    comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                    components.append(comp)
                continue
            if "group" in el and isinstance(el.get("group"), dict):
                # We'll compute group bounding box from children (global coords)
                grp = el.get("group") or {}
                raw_children = grp.get("children") or grp.get("pageElements") or grp.get("childrenObjectIds") or []
                child_elements: List[Dict[str, Any]] = []
                child_ids: List[str] = []
                for ch in raw_children:
                    if isinstance(ch, dict):
                        child_el = ch
                        cid = child_el.get("objectId") or None
                    elif isinstance(ch, str):
                        cid = ch
                        child_el = id_to_element.get(ch)
                        if not child_el:
                            continue
                    else:
                        continue
                    child_elements.append(child_el)
                    if cid:
                        child_ids.append(cid)
                # First pass: compute bounds and group bbox
                min_x = 10**9; min_y = 10**9; max_x = -10**9; max_y = -10**9
                child_bounds: List[Dict[str, Any]] = []
                for cel in child_elements:
                    cb = _compute_bounds(cel, page_w, page_h)
                    child_bounds.append({"el": cel, "b": cb})
                    min_x = min(min_x, cb["x"])
                    min_y = min(min_y, cb["y"])
                    max_x = max(max_x, cb["x"] + cb["width"])
                    max_y = max(max_y, cb["y"] + cb["height"])
                group_offset_px = {"x": int(min_x if min_x < 10**9 else 0), "y": int(min_y if min_y < 10**9 else 0)}
                # Second pass: create children with relative positions
                group_child_component_ids: List[str] = []
                child_z_indices: List[int] = []
                for item in child_bounds:
                    cel = item["el"]
                    cb = item["b"]
                    if "shape" in cel and isinstance(cel.get("shape"), dict):
                        shp2 = cel.get("shape")
                        st2 = (shp2.get("shapeType") or "").upper()
                        if st2 == "TEXT_BOX":
                            # Keep children absolute coordinates
                            comp = _map_text_block(shp2, cb)
                            if comp:
                                comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                                components.append(comp)
                                group_child_component_ids.append(comp["id"])
                        else:
                            comp = _map_shape(shp2, cel, cb)
                            if comp:
                                comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                                components.append(comp)
                                group_child_component_ids.append(comp["id"])
                    elif "line" in cel and isinstance(cel.get("line"), dict):
                        line = cel.get("line")
                        lp = line.get("lineProperties") or {}
                        solid = (lp.get("lineFill") or {}).get("solidFill") or {}
                        stroke_color = _to_hex_color(solid.get("color"), default="#000000FF")
                        weight_pt = _dim_to_points(lp.get("weight")) if isinstance(lp.get("weight"), dict) else 1.0
                        stroke_w_px = max(1, _pt_to_px(weight_pt))
                        # Dash style mapping
                        dash = (lp.get("dashStyle") or "").upper()
                        dash_map = {
                            "DOT": "2,6",
                            "DASH": "6,6",
                            "DASH_DOT": "6,4,2,4",
                            "LONG_DASH": "10,6",
                            "LONG_DASH_DOT": "10,6,2,6",
                        }
                        endpoints = _line_endpoints_px(cel, page_w, page_h, group_offset_px=None)
                        start = endpoints["start"]
                        end = endpoints["end"]
                        comp = {
                            "id": str(uuid.uuid4()),
                            "type": "Lines",
                            "props": {
                                "position": {"x": min(start["x"], end["x"]), "y": min(start["y"], end["y"])},
                                "width": abs(end["x"] - start["x"]) or 1,
                                "height": abs(end["y"] - start["y"]) or 1,
                                "startPoint": {"x": start["x"], "y": start["y"]},
                                "endPoint": {"x": end["x"], "y": end["y"]},
                                "connectionType": "straight",
                                "stroke": stroke_color,
                                "strokeWidth": stroke_w_px,
                                "startShape": "none",
                                "endShape": "none",
                                "opacity": 1,
                                "rotation": 0,
                                **({"strokeDasharray": dash_map.get(dash, "none")} if dash and dash != "SOLID" else {}),
                            }
                        }
                        comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                        components.append(comp)
                        group_child_component_ids.append(comp["id"])
                    elif "image" in cel and isinstance(cel.get("image"), dict):
                        comp = _map_image(cel.get("image"), cb, alt_text=(cel.get("title") or cel.get("description")))
                        if comp:
                            comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                            components.append(comp)
                            group_child_component_ids.append(comp["id"])
                    elif "table" in cel and isinstance(cel.get("table"), dict):
                        comp = _map_table(cel.get("table"), cb)
                        if comp:
                            comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                            components.append(comp)
                            group_child_component_ids.append(comp["id"])
                    elif "sheetsChart" in cel and isinstance(cel.get("sheetsChart"), dict):
                        comp = _map_sheets_chart(cel.get("sheetsChart"), cb)
                        if comp:
                            comp["props"]["zIndex"] = z_cursor; child_z_indices.append(z_cursor); z_cursor += 1
                            components.append(comp)
                            group_child_component_ids.append(comp["id"])
                    elif "video" in cel and isinstance(cel.get("video"), dict):
                        comp = _map_video(cel.get("video"), cb)
                        if comp:
                            comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                            components.append(comp)
                            group_child_component_ids.append(comp["id"])
                # Mark consumed child element IDs if present in top-level list
                for cid in child_ids:
                    consumed_ids.add(cid)
                # Create Group component using computed bbox
                group_bounds = {
                    "x": int(min_x if min_x < 10**9 else 0),
                    "y": int(min_y if min_y < 10**9 else 0),
                    "width": int(max(1, (max_x - min_x) if max_x > -10**9 and min_x < 10**9 else 0)),
                    "height": int(max(1, (max_y - min_y) if max_y > -10**9 and min_y < 10**9 else 0))
                }
                # Compute group z-index behind children to avoid overlaying them
                min_child_z = min(child_z_indices) if child_z_indices else z_cursor
                group_z = max(0, min_child_z - 1)
                group_comp = {
                    "id": str(uuid.uuid4()),
                    "type": "Group",
                    "props": {
                        "position": {"x": group_bounds["x"], "y": group_bounds["y"]},
                        "width": group_bounds["width"],
                        "height": group_bounds["height"],
                        "children": group_child_component_ids,
                        "opacity": 1,
                        "rotation": 0,
                        "zIndex": group_z,
                        "locked": False
                    }
                }
                # Do not advance z_cursor for group container; it's not a visible overlay
                components.append(group_comp)
                continue
            if "line" in el and isinstance(el.get("line"), dict):
                line = el.get("line")
                lp = line.get("lineProperties") or {}
                solid = (lp.get("lineFill") or {}).get("solidFill") or {}
                stroke_color = _to_hex_color(solid.get("color"), default="#000000FF")
                weight_pt = _dim_to_points(lp.get("weight")) if isinstance(lp.get("weight"), dict) else 1.0
                stroke_w_px = max(1, _pt_to_px(weight_pt))
                dash = (lp.get("dashStyle") or "").upper()
                dash_map = {
                    "DOT": "2,6",
                    "DASH": "6,6",
                    "DASH_DOT": "6,4,2,4",
                    "LONG_DASH": "10,6",
                    "LONG_DASH_DOT": "10,6,2,6",
                }
                endpoints = _line_endpoints_px(el, page_w, page_h)
                start = endpoints["start"]
                end = endpoints["end"]
                # Arrowheads: default none; set if explicitly present
                def _arrow_shape(val: Any) -> str:
                    v = str(val or "NONE").upper()
                    return "arrow" if v not in ("NONE", "ARROW_TYPE_UNSPECIFIED") else "none"
                start_shape = "none"
                end_shape = "none"
                for k in ("startArrow", "arrowStart", "startHead", "startMarker"):
                    if k in lp:
                        start_shape = _arrow_shape(lp.get(k))
                        break
                for k in ("endArrow", "arrowEnd", "endHead", "endMarker"):
                    if k in lp:
                        end_shape = _arrow_shape(lp.get(k))
                        break
                # Connection type mapping if available
                connection_type = "straight"
                try:
                    cat = str((el.get("line") or {}).get("lineCategory") or "").upper()
                    if cat in ("BENT", "ELBOW"):
                        connection_type = "elbow"
                    elif cat in ("CURVED",):
                        connection_type = "curved"
                except Exception:
                    connection_type = "straight"
                comp = {
                    "id": str(uuid.uuid4()),
                    "type": "Lines",
                    "props": {
                        "position": {"x": min(start["x"], end["x"]), "y": min(start["y"], end["y"])},
                        "width": abs(end["x"] - start["x"]) or 1,
                        "height": abs(end["y"] - start["y"]) or 1,
                        "startPoint": {"x": start["x"], "y": start["y"]},
                        "endPoint": {"x": end["x"], "y": end["y"]},
                        "connectionType": connection_type,
                        "stroke": stroke_color,
                        "strokeWidth": stroke_w_px,
                        "startShape": start_shape,
                        "endShape": end_shape,
                        "opacity": 1,
                        "rotation": 0,
                        **({"strokeDasharray": dash_map.get(dash, "none")} if dash and dash != "SOLID" else {}),
                    }
                }
                comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                components.append(comp)
                continue
            if "image" in el and isinstance(el.get("image"), dict):
                comp = _map_image(el.get("image"), bounds, alt_text=(el.get("title") or el.get("description")))
                if comp:
                    comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                    components.append(comp)
                continue
            if "table" in el and isinstance(el.get("table"), dict):
                comp = _map_table(el.get("table"), bounds)
                if comp:
                    comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                    components.append(comp)
                continue
            if "sheetsChart" in el and isinstance(el.get("sheetsChart"), dict):
                comp = _map_sheets_chart(el.get("sheetsChart"), bounds)
                if comp:
                    comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                    components.append(comp)
                continue
            if "video" in el and isinstance(el.get("video"), dict):
                comp = _map_video(el.get("video"), bounds)
                if comp:
                    comp["props"]["zIndex"] = z_cursor; z_cursor += 1
                    components.append(comp)
                continue
            # TODO: wordArt/audio/other element types can be supported in next iterations

        slides_out.append({
            "id": slide.get("objectId") or str(uuid.uuid4()),
            "title": slide_title,
            "components": components
        })

    deck = {
        "uuid": str(uuid.uuid4()),
        "name": presentation.get("title", "Imported"),
        "slides": slides_out,
        "size": {"width": 1920, "height": 1080},
    }
    return deck


async def _run_import_slides_job(user_id: str, job_id: str, presentation_id: str) -> None:
    oauth = GoogleOAuthService()
    api = GoogleApiClient(oauth)
    jobs_store.update(job_id, JobStatus.RUNNING)
    
    temp_file_path = None
    try:
        # Step 1: Export Google Slides as PPTX
        logger.info(f"Exporting Google Slides {presentation_id} as PPTX")
        
        # Get presentation title for naming
        presentation = await api.slides_get_presentation(user_id, presentation_id)
        title = presentation.get("title", "Untitled")
        
        # Export as PPTX using Google Drive export
        # Try the direct export URL first
        export_url = f"https://docs.google.com/presentation/d/{presentation_id}/export/pptx"
        
        # Get access token for the user
        access_token = await oauth.refresh_access_token(user_id)
        if not access_token:
            raise HTTPException(status_code=401, detail="Google authentication required")
            
        logger.info(f"Exporting presentation {presentation_id} as PPTX")
        
        # Download the PPTX file with proper headers
        async with httpx.AsyncClient(follow_redirects=True, timeout=60.0) as client:
            # First attempt with the export URL
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Accept": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
                "User-Agent": "Mozilla/5.0 (compatible; SlideApp/1.0)"
            }
            
            response = await client.get(export_url, headers=headers)
            
            # If we get a 403/404, try the Drive API export endpoint
            if response.status_code in [403, 404]:
                logger.info("Direct export failed, trying Drive API export endpoint")
                drive_export_url = f"https://www.googleapis.com/drive/v3/files/{presentation_id}/export?mimeType=application/vnd.openxmlformats-officedocument.presentationml.presentation"
                response = await client.get(drive_export_url, headers=headers)
            
            if response.status_code != 200:
                logger.error(f"Export failed with status {response.status_code}: {response.text[:500]}")
                if response.status_code == 401:
                    raise HTTPException(status_code=401, detail="Google authentication expired. Please reconnect your Google account.")
                elif response.status_code == 403:
                    raise HTTPException(status_code=403, detail="Access denied. Please ensure you have access to this presentation.")
                elif response.status_code == 404:
                    raise HTTPException(status_code=404, detail="Presentation not found.")
                else:
                    raise HTTPException(status_code=response.status_code, detail=f"Failed to export Google Slides: {response.status_code}")
                    
            response.raise_for_status()
            
            # Save to temp file
            with tempfile.NamedTemporaryFile(delete=False, suffix=".pptx") as tmp:
                tmp.write(response.content)
                temp_file_path = tmp.name
                
        # Step 2: Import the PPTX file
        logger.info("Importing PPTX file")
        importer = PPTXImporter()
        deck = await importer.import_file(temp_file_path)
        
        # Update deck name from Google Slides title
        deck["name"] = title
        
        # Add import metadata
        result_data = {
            "deck": deck,
            "importMetadata": {
                "source": "google_slides_via_pptx",
                "presentation_id": presentation_id,
                **deck.pop("metadata", {})
            }
        }
        
        # For large presentations, update in chunks to avoid timeout
        try:
            jobs_store.update(job_id, JobStatus.SUCCEEDED, result_data)
        except Exception as e:
            # If update fails due to size/timeout, store minimal data
            logger.warning(f"Failed to store full deck data: {e}")
            minimal_data = {
                "deck": {
                    "id": deck.get("id"),
                    "name": deck.get("name"),
                    "slides": len(deck.get("slides", [])),
                    "metadata": deck.get("metadata", {})
                },
                "importMetadata": result_data["importMetadata"],
                "error": "Full deck data too large for storage"
            }
            jobs_store.update(job_id, JobStatus.SUCCEEDED, minimal_data)
        
    except httpx.HTTPStatusError as e:
        if e.response.status_code == 401:
            error_msg = "Google authentication expired. Please reconnect your Google account."
        else:
            error_msg = f"Failed to export Google Slides: {e.response.status_code}"
        logger.error(error_msg)
        jobs_store.update(job_id, JobStatus.FAILED, error=error_msg)
    except Exception as e:
        logger.exception("IMPORT_SLIDES job failed")
        jobs_store.update(job_id, JobStatus.FAILED, error=str(e))
    finally:
        # Clean up temp file
        if temp_file_path:
            try:
                os.unlink(temp_file_path)
            except:
                pass


async def _run_import_pptx_job(user_id: str, job_id: str, uploaded_file_path: str) -> None:
    jobs_store.update(job_id, JobStatus.RUNNING)
    try:
        # Use the robust PPTX importer with schema validation
        from services.robust_pptx_importer import RobustPPTXImporter
        importer = RobustPPTXImporter()
        deck = await importer.import_file(uploaded_file_path)
        
        # Get import report for metadata
        report = importer.get_import_report()
        
        # Update deck name from filename
        deck["name"] = os.path.splitext(os.path.basename(uploaded_file_path))[0]
        
        # Add import metadata to result
        import_metadata = deck.pop("metadata", {})
        import_metadata.update({
            "robust_import_report": report,
            "schema_validation": report['stats'].get('schema_validation', {}),
            "success_rate": report['success_rate'],
            "recovery_methods": report.get('recovery_methods_used', [])
        })
        
        result_data = {
            "deck": deck,
            "importMetadata": import_metadata
        }
        
        jobs_store.update(job_id, JobStatus.SUCCEEDED, result_data)
    except Exception as e:
        logger.exception("IMPORT_PPTX job failed")
        jobs_store.update(job_id, JobStatus.FAILED, error=str(e))
    finally:
        # Clean up temp file
        try:
            os.unlink(uploaded_file_path)
        except:
            pass


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

    app_redirect = os.getenv("FRONTEND_URL", "http://localhost:3000") + "/profile?tab=integrations&google=connected"
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
    import asyncio

    asyncio.create_task(_run_import_slides_job(user_id=user_id, job_id=job_id, presentation_id=body.presentationId))
    return JobResponse(jobId=job_id)


@router.post("/import/pptx/upload", response_model=JobResponse)
async def import_pptx_upload(file: UploadFile = File(...), token: Optional[str] = Depends(get_auth_header)):
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
    import asyncio

    asyncio.create_task(_run_import_pptx_job(user_id=user_id, job_id=job_id, uploaded_file_path=tmp_path))
    return JobResponse(jobId=job_id)


@router.get("/jobs/{job_id}")
async def get_job_status(job_id: str, token: Optional[str] = Depends(get_auth_header)):
    # Optional auth; return job if exists
    job = jobs_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return {"status": job.get("status"), "result": job.get("result"), "error": job.get("error")}


@router.get("/jobs/{job_id}/result")
async def get_job_result(job_id: str):
    job = jobs_store.get(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    if job.get("status") != JobStatus.SUCCEEDED:
        raise HTTPException(status_code=409, detail="Job not completed")
    return job.get("result") or {}


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
    import asyncio

    asyncio.create_task(_run_export_job(user_id=user_id, job_id=job_id, job_type=JobType.EXPORT_EDITABLE, deck=body.deck, options=body.options))
    return JobResponse(jobId=job_id)


@router.post("/export/slides/images", response_model=JobResponse)
async def export_slides_images(body: ExportImagesRequest, token: Optional[str] = Depends(get_auth_header)):
    auth_service = get_auth_service()
    user = auth_service.get_user_with_token(token) if token else None
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")
    user_id = user["id"]
    job_id = jobs_store.create(user_id=user_id, job_type=JobType.EXPORT_IMAGES, input_payload={"options": body.options or {}})
    import asyncio

    asyncio.create_task(_run_export_job(user_id=user_id, job_id=job_id, job_type=JobType.EXPORT_IMAGES, deck=body.deck, options=body.options))
    return JobResponse(jobId=job_id)


