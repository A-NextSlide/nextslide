import os
import logging
from typing import Optional

import httpx

logger = logging.getLogger(__name__)


def send_invite_email_via_resend(to_email: str, subject: str, html_body: str) -> bool:
    """
    Send an email using Resend if RESEND_API_KEY is configured.
    Returns True on success, False otherwise.
    """
    api_key = os.getenv("RESEND_API_KEY")
    if not api_key:
        return False

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": os.getenv("RESEND_FROM_EMAIL", "Nextslide <noreply@nextslide.ai>"),
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers=headers,
            json=payload,
            timeout=httpx.Timeout(connect=2.0, read=5.0, write=2.0, pool=2.0)
        )
        if 200 <= resp.status_code < 300:
            return True
        logger.warning(f"Resend email failed: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        logger.warning(f"Resend email error: {e}")
        return False


def send_collaborator_invite_email(email: str, deck_name: str, share_url: str) -> bool:
    subject = f"You're invited to collaborate on '{deck_name}'"
    html = f"""
    <div>
      <p>You have been invited to collaborate on <strong>{deck_name}</strong>.</p>
      <p>Click to open: <a href="{share_url}">{share_url}</a></p>
    </div>
    """
    return send_invite_email_via_resend(email, subject, html)


