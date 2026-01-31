"""
Slack request authentication and token encryption.

- HMAC-SHA256 signature verification for incoming Slack requests
- Fernet symmetric encryption for bot tokens at rest
"""

import hashlib
import hmac
import logging
import os
import time
from typing import Optional

from cryptography.fernet import Fernet
from fastapi import HTTPException, Request

logger = logging.getLogger(__name__)

# Lazy-initialised Fernet cipher
_fernet: Optional[Fernet] = None


def _get_fernet() -> Fernet:
    global _fernet
    if _fernet is None:
        key = os.getenv("SLACK_TOKEN_ENCRYPTION_KEY")
        if not key:
            raise RuntimeError("SLACK_TOKEN_ENCRYPTION_KEY is not set")
        _fernet = Fernet(key.encode() if isinstance(key, str) else key)
    return _fernet


# ── Signature verification ──────────────────────────────────────────────────

async def verify_slack_signature(request: Request) -> bytes:
    """
    FastAPI dependency that verifies the X-Slack-Signature header.
    Returns the raw request body on success; raises 401 on failure.
    """
    signing_secret = os.getenv("SLACK_SIGNING_SECRET")
    if not signing_secret:
        raise HTTPException(status_code=500, detail="SLACK_SIGNING_SECRET not configured")

    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not timestamp or not signature:
        raise HTTPException(status_code=401, detail="Missing Slack signature headers")

    # Reject requests older than 5 minutes (replay protection)
    try:
        if abs(time.time() - float(timestamp)) > 300:
            raise HTTPException(status_code=401, detail="Request timestamp too old")
    except ValueError:
        raise HTTPException(status_code=401, detail="Invalid timestamp")

    body = await request.body()
    sig_basestring = f"v0:{timestamp}:{body.decode('utf-8')}"
    computed = "v0=" + hmac.new(
        signing_secret.encode(), sig_basestring.encode(), hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(computed, signature):
        logger.warning("Slack signature mismatch")
        raise HTTPException(status_code=401, detail="Invalid Slack signature")

    return body


# ── Token encryption ────────────────────────────────────────────────────────

def encrypt_token(plaintext: str) -> str:
    """Encrypt a bot token for storage."""
    return _get_fernet().encrypt(plaintext.encode()).decode()


def decrypt_token(ciphertext: str) -> str:
    """Decrypt a stored bot token."""
    return _get_fernet().decrypt(ciphertext.encode()).decode()
