"""AI-powered email HTML generation via Claude."""

import logging
from typing import Optional
from pydantic import BaseModel

logger = logging.getLogger(__name__)


class EmailGenerationResult(BaseModel):
    html: str
    subject: str


SYSTEM_PROMPT = """You are an expert email designer for Nextslide, an AI presentation platform.

Generate responsive HTML emails with these constraints:
- Use table-based layouts for maximum email client compatibility
- Inline CSS only (no <style> blocks or external stylesheets)
- Brand colors: #FF4301 (accent/CTA), #383636 (text), #666 (secondary text), #f5f5f5 (background)
- Max width: 560px, centered with margin: 40px auto
- Font stack: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif
- Use {{variable}} placeholder syntax for dynamic content (e.g., {{user_name}}, {{deck_title}})
- Include Nextslide branding: header with "Nextslide" text, footer with copyright
- Structure: header (brand) → content (message + CTA) → footer (copyright)
- CTA buttons: inline-block, padding 14px 28px, border-radius 6px, font-weight 500
- Always include <!DOCTYPE html>, charset utf-8, viewport meta tag

When editing existing HTML, preserve the overall structure but apply the requested changes.
Return ONLY the complete HTML document, no markdown fences or explanation."""


def generate_email_html(
    prompt: str,
    existing_html: Optional[str] = None,
    context: Optional[str] = None,
) -> EmailGenerationResult:
    """Generate or edit email HTML using Claude.

    Args:
        prompt: User instruction for what to generate/change
        existing_html: Existing HTML to edit (None for new generation)
        context: Additional context (template name, purpose, etc.)

    Returns:
        EmailGenerationResult with html and subject
    """
    from agents.ai.clients import get_client, invoke

    client, model = get_client("claude-sonnet-4-5")

    messages = [{"role": "system", "content": SYSTEM_PROMPT}]

    user_content = prompt
    if existing_html:
        user_content = f"Edit this existing email HTML based on the instruction below.\n\nCurrent HTML:\n{existing_html}\n\nInstruction: {prompt}"
    if context:
        user_content = f"Context: {context}\n\n{user_content}"

    messages.append({"role": "user", "content": user_content})

    result = invoke(
        client,
        model,
        messages,
        response_model=EmailGenerationResult,
        max_tokens=8192,
        temperature=0.4,
    )

    return result
