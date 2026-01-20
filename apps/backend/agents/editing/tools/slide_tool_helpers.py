"""Shared helpers for slide tools."""

from typing import Any, Dict, List, Tuple
import re

from agents.editing.tools.struct_utils import get_attr as _get_attr


def _extract_content_from_html(html: str) -> str:
    """Extract text content from HTML for use as slide content context."""
    if not html:
        return ""
    try:
        from bs4 import BeautifulSoup

        soup = BeautifulSoup(html, 'html.parser')
        # Remove script and style elements
        for script in soup(["script", "style"]):
            script.decompose()
        # Get text, preserving some structure
        text = soup.get_text(separator='\n', strip=True)
        # Clean up excessive newlines
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Limit length
        return text[:2000] if text else ""
    except Exception:
        # Fallback: simple regex extraction
        text = re.sub(r'<[^>]+>', ' ', html)
        text = re.sub(r'\s+', ' ', text).strip()
        return text[:2000] if text else ""


def _extract_slide_content_for_redesign(current_slide: dict, existing_html: str = None) -> str:
    """
    Extract actual content from an existing slide for redesign purposes.
    Returns a description of what the slide is ABOUT, not instructions on how to redesign it.
    """
    content_parts = []

    # Get slide title
    title = _get_attr(current_slide, "title", "")
    if title:
        content_parts.append(f"Slide Title: {title}")

    # Get description if available
    description = _get_attr(current_slide, "description", "")
    if description:
        content_parts.append(f"Description: {description}")

    # Extract content from existing HTML if provided
    if existing_html:
        html_content = _extract_content_from_html(existing_html)
        if html_content:
            content_parts.append(f"Current Content:\n{html_content}")

    # If we have components but no HTML, extract from components
    if not existing_html:
        components = _get_attr(current_slide, "components", []) or []
        for c in components:
            ctype = _get_attr(c, "type", "")
            props = _get_attr(c, "props", {}) or {}

            if ctype == "CustomComponent":
                html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")
                html_content = _extract_content_from_html(html)
                if html_content:
                    content_parts.append(f"Current Content:\n{html_content}")
            elif ctype == "TiptapTextBlock":
                text = props.get("text", "") if isinstance(props, dict) else getattr(props, "text", "")
                if text:
                    content_parts.append(f"Text: {str(text)[:500]}")

    return "\n\n".join(content_parts) if content_parts else "Empty slide"


def _format_components_for_prompt(components: List) -> str:
    """Format components for inclusion in prompt."""
    lines = []
    for c in components:
        ctype = _get_attr(c, 'type', 'Unknown')
        cid = _get_attr(c, 'id', 'no-id')
        props = _get_attr(c, 'props', {}) or {}

        # Handle props that might be Pydantic model
        def get_prop(key, default=''):
            if isinstance(props, dict):
                return props.get(key, default)
            return getattr(props, key, default)

        if ctype == 'Background':
            lines.append(f"- Background: {get_prop('backgroundType', 'solid')}")
        elif ctype == 'CustomComponent':
            html = get_prop('render', '')
            lines.append(f"- CustomComponent [{cid}]: {len(html)} chars HTML")
            lines.append(f"  HTML preview: {html[:500]}...")
        elif ctype == 'TiptapTextBlock':
            text = str(get_prop('text', ''))[:100]
            lines.append(f"- TiptapTextBlock [{cid}]: \"{text}\"")
        elif ctype == 'Image':
            lines.append(f"- Image [{cid}]: {str(get_prop('src', ''))[:50]}")
        else:
            lines.append(f"- {ctype} [{cid}]")

    return "\n".join(lines) if lines else "(empty slide)"


def _detect_slide_mode_from_html(html: str) -> str:
    try:
        h = (html or "").lower()
        if "<script" in h or "onclick=" in h or "onmouseover=" in h:
            return "interactive"
        return "static"
    except Exception:
        return "interactive"


def _gather_reference_images(current_html: str, attachments: List[Dict] = None) -> List[str]:
    """Collect reference image URLs from current HTML + attachments (return ALL unique URLs)."""
    reference_images: List[str] = []
    try:
        reference_images = re.findall(r"https?://[^\s'\"]+slide-media[^\s'\"]+", current_html or "")
    except Exception:
        reference_images = []
    if attachments:
        for a in attachments:
            url = a.get("url") or a.get("publicUrl")
            mime = a.get("mimeType") or a.get("type") or ""
            name = (a.get("name") or "").lower()
            if url and (mime.startswith("image/") or name.endswith((".png", ".jpg", ".jpeg", ".webp"))):
                reference_images.append(url)
    return list(dict.fromkeys([u for u in reference_images if u]))


def _has_image_attachments(attachments: List[Dict] = None) -> bool:
    if not attachments:
        return False
    return any(
        (a.get('mimeType', '') or '').startswith('image/')
        or (a.get('type', '') or '').startswith('image/')
        or any((a.get('name', '') or '').lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp'])
        for a in attachments
    )


def _format_attachment_lines(attachments: List[Dict]) -> List[str]:
    return [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]


def _build_attachment_context(attachments: List[Dict], header: str) -> str:
    if not attachments:
        return ""
    lines = _format_attachment_lines(attachments)
    return "\n\n" + header + "\n" + "\n".join(lines)


def _get_msg_field(msg, field: str, default: str = '') -> str:
    """Safely get a field from a message that might be a dict or Pydantic object."""
    if hasattr(msg, field):
        return getattr(msg, field, default) or default
    elif isinstance(msg, dict):
        return msg.get(field, default) or default
    return default


def _build_chat_context(chat_history: List[Dict], max_messages: int = 10) -> Tuple[str, int]:
    if not chat_history:
        return "", 0

    recent = chat_history[-max_messages:] if len(chat_history) > max_messages else chat_history
    chat_lines = []
    for msg in recent:
        role = _get_msg_field(msg, 'role', 'user')
        content = str(_get_msg_field(msg, 'content', ''))[:500]
        chat_lines.append(f"[{role.upper()}]: {content}")

    if not chat_lines:
        return "", 0

    context = "\n\nCONVERSATION HISTORY (chronological - oldest first, newest last):\n" + "\n---\n".join(chat_lines)
    return context, len(recent)


_IMAGE_EXTENSIONS = (".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg")


def _is_image_attachment(att: Dict[str, Any]) -> bool:
    if not isinstance(att, dict):
        return False
    mime = (att.get("mimeType") or att.get("type") or "").lower()
    if mime.startswith("image/"):
        return True
    name = (att.get("name") or att.get("fileName") or att.get("filename") or "").lower()
    return name.endswith(_IMAGE_EXTENSIONS)


def _build_uploaded_media_from_attachments(attachments: List[Dict]) -> List[Dict[str, Any]]:
    uploads: List[Dict[str, Any]] = []
    for att in attachments or []:
        if not _is_image_attachment(att):
            continue
        url = att.get("url") or att.get("publicUrl")
        if not url:
            continue
        name = att.get("name") or att.get("fileName") or att.get("filename") or "image"
        mime = att.get("mimeType") or att.get("type") or "image"
        uploads.append({
            "id": att.get("attachmentId") or url,
            "name": name,
            "filename": name,
            "type": mime,
            "url": url,
            "previewUrl": url,
            "interpretation": name,
        })
    return uploads


def _build_tagged_media_from_attachments(attachments: List[Dict]) -> List[Dict[str, Any]]:
    tagged: List[Dict[str, Any]] = []
    for upload in _build_uploaded_media_from_attachments(attachments):
        tagged.append({
            "id": upload.get("id") or upload.get("url"),
            "filename": upload.get("filename") or upload.get("name"),
            "type": "image",
            "previewUrl": upload.get("previewUrl") or upload.get("url"),
            "interpretation": upload.get("interpretation") or upload.get("filename") or upload.get("name"),
        })
    return tagged
