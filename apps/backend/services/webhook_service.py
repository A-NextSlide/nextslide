"""
Webhook Delivery Service

Handles delivering webhooks to external URLs when deck generation completes.
Includes HMAC signature verification and retry logic.
"""

import hmac
import hashlib
import json
import logging
import asyncio
from typing import Optional, Dict, Any
from datetime import datetime, timezone
from dataclasses import dataclass
import httpx

logger = logging.getLogger(__name__)


@dataclass
class WebhookPayload:
    """Standard webhook payload structure."""
    event: str  # "deck.created", "deck.completed", "deck.failed"
    deck_id: str
    status: str  # "generating", "completed", "failed"
    view_url: Optional[str] = None
    edit_url: Optional[str] = None
    pdf_url: Optional[str] = None
    outputs: Optional[Dict[str, Any]] = None
    slides_count: Optional[int] = None
    error_message: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None
    timestamp: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        """Convert to dictionary, excluding None values."""
        self.timestamp = self.timestamp or datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        return {k: v for k, v in {
            "event": self.event,
            "deck_id": self.deck_id,
            "status": self.status,
            "view_url": self.view_url,
            "edit_url": self.edit_url,
            "pdf_url": self.pdf_url,
            "outputs": self.outputs,
            "slides_count": self.slides_count,
            "error_message": self.error_message,
            "metadata": self.metadata,
            "timestamp": self.timestamp
        }.items() if v is not None}


class WebhookService:
    """Service for delivering webhooks."""

    MAX_RETRIES = 3
    RETRY_DELAYS = [1, 5, 30]  # Seconds between retries
    TIMEOUT = 30  # Seconds

    def __init__(self, signing_secret: Optional[str] = None):
        """
        Initialize webhook service.

        Args:
            signing_secret: Secret key for HMAC signatures.
                           If not provided, uses a default (should be set in production).
        """
        import os
        self.signing_secret = signing_secret or os.getenv("WEBHOOK_SIGNING_SECRET", "nextslide-webhook-secret")

    def _generate_signature(self, payload: str, timestamp: str) -> str:
        """
        Generate HMAC-SHA256 signature for the payload.

        Args:
            payload: JSON string of the payload
            timestamp: Unix timestamp string

        Returns:
            Hex-encoded signature
        """
        signed_payload = f"{timestamp}.{payload}"
        signature = hmac.new(
            self.signing_secret.encode(),
            signed_payload.encode(),
            hashlib.sha256
        ).hexdigest()
        return signature

    def verify_signature(self, payload: str, timestamp: str, signature: str) -> bool:
        """
        Verify a webhook signature.

        Args:
            payload: JSON string of the payload
            timestamp: Unix timestamp string from header
            signature: Signature from header

        Returns:
            True if signature is valid
        """
        expected = self._generate_signature(payload, timestamp)
        return hmac.compare_digest(expected, signature)

    async def deliver_webhook(
        self,
        url: str,
        payload: WebhookPayload,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """
        Deliver a webhook to the specified URL.

        Args:
            url: The webhook URL to POST to
            payload: The webhook payload
            metadata: Optional additional metadata to include

        Returns:
            True if delivery succeeded, False otherwise
        """
        if not url:
            logger.warning("No webhook URL provided, skipping delivery")
            return False

        # Validate URL
        if not url.startswith("https://"):
            logger.warning(f"Webhook URL must use HTTPS: {url}")
            # In development, allow http://localhost
            if not (url.startswith("http://localhost") or url.startswith("http://127.0.0.1")):
                return False

        # Add metadata if provided
        if metadata:
            payload.metadata = {**(payload.metadata or {}), **metadata}

        payload_dict = payload.to_dict()
        payload_json = json.dumps(payload_dict)

        # Generate timestamp and signature
        timestamp = str(int(datetime.utcnow().timestamp()))
        signature = self._generate_signature(payload_json, timestamp)

        headers = {
            "Content-Type": "application/json",
            "X-NextSlide-Signature": signature,
            "X-NextSlide-Timestamp": timestamp,
            "User-Agent": "NextSlide-Webhook/1.0"
        }

        # Retry loop
        for attempt in range(self.MAX_RETRIES):
            try:
                async with httpx.AsyncClient(timeout=self.TIMEOUT) as client:
                    response = await client.post(
                        url,
                        content=payload_json,
                        headers=headers
                    )

                    if response.status_code >= 200 and response.status_code < 300:
                        logger.info(f"Webhook delivered successfully to {url} (attempt {attempt + 1})")
                        return True

                    logger.warning(
                        f"Webhook delivery failed to {url}: "
                        f"status={response.status_code}, attempt={attempt + 1}/{self.MAX_RETRIES}"
                    )

            except httpx.TimeoutException:
                logger.warning(f"Webhook timeout to {url} (attempt {attempt + 1}/{self.MAX_RETRIES})")
            except httpx.RequestError as e:
                logger.warning(f"Webhook request error to {url}: {e} (attempt {attempt + 1}/{self.MAX_RETRIES})")
            except Exception as e:
                logger.error(f"Unexpected webhook error to {url}: {e}")

            # Wait before retry (except on last attempt)
            if attempt < self.MAX_RETRIES - 1:
                delay = self.RETRY_DELAYS[min(attempt, len(self.RETRY_DELAYS) - 1)]
                logger.info(f"Retrying webhook in {delay}s...")
                await asyncio.sleep(delay)

        logger.error(f"Webhook delivery failed after {self.MAX_RETRIES} attempts to {url}")
        return False

    async def send_deck_created(
        self,
        webhook_url: str,
        deck_id: str,
        view_url: str,
        edit_url: Optional[str] = None,
        pdf_url: Optional[str] = None,
        outputs: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send a deck.created webhook when generation starts."""
        payload = WebhookPayload(
            event="deck.created",
            deck_id=deck_id,
            status="generating",
            view_url=view_url,
            edit_url=edit_url,
            pdf_url=pdf_url,
            outputs=outputs,
        )
        return await self.deliver_webhook(webhook_url, payload, metadata)

    async def send_deck_completed(
        self,
        webhook_url: str,
        deck_id: str,
        view_url: str,
        slides_count: int,
        edit_url: Optional[str] = None,
        pdf_url: Optional[str] = None,
        outputs: Optional[Dict[str, Any]] = None,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send a deck.completed webhook when generation finishes."""
        payload = WebhookPayload(
            event="deck.completed",
            deck_id=deck_id,
            status="completed",
            view_url=view_url,
            edit_url=edit_url,
            pdf_url=pdf_url,
            outputs=outputs,
            slides_count=slides_count
        )
        return await self.deliver_webhook(webhook_url, payload, metadata)

    async def send_deck_failed(
        self,
        webhook_url: str,
        deck_id: str,
        error_message: str,
        metadata: Optional[Dict[str, Any]] = None
    ) -> bool:
        """Send a deck.failed webhook when generation fails."""
        payload = WebhookPayload(
            event="deck.failed",
            deck_id=deck_id,
            status="failed",
            error_message=error_message
        )
        return await self.deliver_webhook(webhook_url, payload, metadata)


# Singleton instance
_webhook_service: Optional[WebhookService] = None


def get_webhook_service() -> WebhookService:
    """Get the singleton WebhookService instance."""
    global _webhook_service
    if _webhook_service is None:
        _webhook_service = WebhookService()
    return _webhook_service
