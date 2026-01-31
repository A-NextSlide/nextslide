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
        logger.error("RESEND_API_KEY not configured")
        return False

    from_email = os.getenv("RESEND_FROM_EMAIL", "Nextslide <noreply@nextslide.ai>")
    logger.info(f"Sending email via Resend: to={to_email}, from={from_email}, subject={subject}")

    try:
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "from": from_email,
            "to": [to_email],
            "subject": subject,
            "html": html_body
        }
        resp = httpx.post(
            "https://api.resend.com/emails",
            headers=headers,
            json=payload,
            timeout=httpx.Timeout(connect=5.0, read=10.0, write=5.0, pool=5.0)
        )
        if 200 <= resp.status_code < 300:
            logger.info(f"Resend email sent successfully: {resp.status_code}")
            return True
        logger.error(f"Resend email failed: {resp.status_code} {resp.text}")
        return False
    except Exception as e:
        logger.error(f"Resend email error: {e}", exc_info=True)
        return False


def send_collaborator_invite_email(email: str, deck_name: str, share_url: str) -> bool:
    """Send a branded collaboration invite email via Resend."""
    subject = f"You're invited to collaborate on '{deck_name}'"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
            </div>

            <!-- Content -->
            <div style="padding: 32px 40px;">
                <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">You've been invited to collaborate</h2>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                    Someone has invited you to collaborate on a presentation:
                </p>

                <!-- Deck Card -->
                <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111;">{deck_name}</p>
                </div>

                <!-- CTA Button -->
                <a href="{share_url}" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
                    Open Presentation
                </a>

                <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">
                    Or copy this link: <a href="{share_url}" style="color: #FF4301; text-decoration: none;">{share_url}</a>
                </p>
            </div>

            <!-- Footer -->
            <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
                <p style="margin: 0; color: #999; font-size: 12px;">
                    © Nextslide. Create beautiful presentations with AI.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return send_invite_email_via_resend(email, subject, html)


def send_password_reset_email(email: str, reset_link: str) -> bool:
    """Send password reset email via Resend."""
    subject = "Reset your Nextslide password"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
            </div>
            <div style="padding: 32px 40px;">
                <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">Reset your password</h2>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.5;">
                    We received a request to reset your password. Click the button below to choose a new password.
                </p>
                <a href="{reset_link}" style="display: inline-block; padding: 12px 24px; background: #111; color: white; text-decoration: none; border-radius: 6px; font-weight: 500;">
                    Reset Password
                </a>
                <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">
                    If you didn't request this, you can safely ignore this email. This link will expire in 24 hours.
                </p>
            </div>
            <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
                <p style="margin: 0; color: #999; font-size: 12px;">
                    © Nextslide. All rights reserved.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return send_invite_email_via_resend(email, subject, html)


def send_view_notification_email(
    email: str,
    user_name: str,
    deck_title: str,
    view_count: int,
    deck_url: str,
) -> bool:
    """Send a view milestone notification email via Resend."""
    subject = "Your slides are getting noticed"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #fafafa;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <!-- Header -->
            <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
            </div>

            <!-- Content -->
            <div style="padding: 32px 40px;">
                <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">People are watching</h2>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">
                    Hey {user_name},
                </p>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">
                    Your presentation <strong>{deck_title}</strong> just hit <strong>{view_count} views</strong> today. That's not nothing.
                </p>

                <!-- Highlight Card -->
                <div style="background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
                    <p style="margin: 0; font-size: 18px; font-weight: 600; color: #111;">{deck_title} &mdash; {view_count} views and counting</p>
                </div>

                <p style="margin: 0 0 16px; color: #666; line-height: 1.6;">
                    While everyone else is still wrestling with slide templates and fiddling with fonts, your ideas are already out there making an impression.
                </p>
                <p style="margin: 0 0 24px; color: #666; line-height: 1.6;">
                    NextSlide turns what you're thinking into polished presentations &mdash; fast. No design degree. No template hunting. Just your ideas, visualized.
                </p>

                <!-- CTA Button -->
                <a href="https://app.nextslide.ai/app" style="display: inline-block; padding: 14px 28px; background: #FF4301; color: white; text-decoration: none; border-radius: 6px; font-weight: 500; font-size: 16px;">
                    Create Another
                </a>

                <p style="margin: 24px 0 0; color: #999; font-size: 14px; line-height: 1.5;">
                    Or share this one: <a href="{deck_url}" style="color: #FF4301; text-decoration: none;">{deck_url}</a>
                </p>
            </div>

            <!-- Footer -->
            <div style="padding: 24px 40px; background: #fafafa; border-top: 1px solid #eee;">
                <p style="margin: 0 0 8px; color: #999; font-size: 12px; line-height: 1.5;">
                    You're getting this because your slides are doing well. Manage notifications in your profile settings.
                </p>
                <p style="margin: 0; color: #999; font-size: 12px;">
                    &copy; Nextslide. Turn ideas into presentations.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return send_invite_email_via_resend(email, subject, html)


def send_session_cleared_email(email: str) -> bool:
    """Notify user that their sessions were cleared by an admin."""
    subject = "Security notice: All sessions signed out"
    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <meta charset="utf-8">
    </head>
    <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; margin: 0; padding: 0; background-color: #f5f5f5;">
        <div style="max-width: 560px; margin: 40px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
            <div style="padding: 32px 40px; border-bottom: 1px solid #eee;">
                <h1 style="margin: 0; font-size: 24px; font-weight: 600; color: #111;">Nextslide</h1>
            </div>
            <div style="padding: 32px 40px;">
                <h2 style="margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #111;">Sessions signed out</h2>
                <p style="margin: 0 0 16px; color: #666; line-height: 1.5;">
                    All active sessions for your account have been signed out for security purposes.
                </p>
                <p style="margin: 0; color: #666; line-height: 1.5;">
                    If this wasn't you, please reset your password immediately.
                </p>
            </div>
        </div>
    </body>
    </html>
    """
    return send_invite_email_via_resend(email, subject, html)


