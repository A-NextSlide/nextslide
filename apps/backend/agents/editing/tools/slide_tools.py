"""
Slide tools - AI-powered slide editing and creation.

Philosophy:
- edit_slide handles EVERYTHING on a slide (empty, custom component, standard)
- create_slide creates NEW slides with full AI-generated content
- Simple, powerful, let AI do the work
"""

from typing import Dict, List, Optional, Any
from pydantic import BaseModel, Field
import logging
import uuid

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from agents.config import get_model, MODEL_FALLBACK
import requests
import base64
import re

logger = logging.getLogger(__name__)


# ═══════════════════════════════════════════════════════════════════════════════
# MULTIMODAL HELPER - Download images for vision models
# ═══════════════════════════════════════════════════════════════════════════════

# Maximum dimensions for multimodal images (to prevent token explosion)
# NOTE: 384px is plenty for LLM context - larger sizes waste tokens
MAX_IMAGE_DIMENSION = 384   # Max width or height in pixels (was 1024 - way too big)
MAX_IMAGE_BYTES = 150_000   # Max ~150KB per image after compression
JPEG_QUALITY = 60           # JPEG quality for compression (lower = smaller)

def _compress_image_for_multimodal(image_data: bytes, max_dimension: int = MAX_IMAGE_DIMENSION, max_bytes: int = MAX_IMAGE_BYTES) -> tuple:
    """
    Compress and resize an image to prevent token inflation in multimodal messages.

    Returns:
        Tuple of (compressed_bytes, media_type)
    """
    try:
        from PIL import Image
        from io import BytesIO

        img = Image.open(BytesIO(image_data))
        original_size = len(image_data)

        # Convert to RGB if necessary
        if img.mode in ('RGBA', 'P', 'LA'):
            background = Image.new('RGB', img.size, (255, 255, 255))
            if img.mode == 'P':
                img = img.convert('RGBA')
            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
            img = background
        elif img.mode != 'RGB':
            img = img.convert('RGB')

        # Resize if too large
        width, height = img.size
        if width > max_dimension or height > max_dimension:
            ratio = min(max_dimension / width, max_dimension / height)
            new_size = (int(width * ratio), int(height * ratio))
            img = img.resize(new_size, Image.Resampling.LANCZOS)

        # Compress to JPEG
        quality = JPEG_QUALITY
        output = BytesIO()
        img.save(output, format='JPEG', quality=quality, optimize=True)

        while output.tell() > max_bytes and quality > 30:
            quality -= 10
            output = BytesIO()
            img.save(output, format='JPEG', quality=quality, optimize=True)

        compressed_data = output.getvalue()
        reduction = ((original_size - len(compressed_data)) / original_size * 100) if original_size > 0 else 0
        logger.info(f"[IMAGE_COMPRESS] {original_size//1024}KB -> {len(compressed_data)//1024}KB ({reduction:.0f}% reduction)")

        return compressed_data, 'image/jpeg'

    except ImportError:
        logger.warning("[IMAGE_COMPRESS] PIL not available, using original image")
        return image_data, 'image/png'
    except Exception as e:
        logger.warning(f"[IMAGE_COMPRESS] Compression failed: {e}")
        return image_data, 'image/png'


def _build_multimodal_content(text_content: str, attachments: List[Dict] = None) -> List[Dict[str, Any]]:
    """
    Build multimodal content array for vision models.
    Downloads images from URLs, compresses them, and includes them as base64 for the AI to see.

    Args:
        text_content: The text prompt
        attachments: List of attachments with 'url', 'name', 'mimeType'

    Returns:
        List of content blocks for multimodal message
    """
    content_parts = []

    # Add text first
    content_parts.append({
        "type": "text",
        "text": text_content
    })

    if not attachments:
        return content_parts

    # Process image attachments
    image_extensions = {'.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg'}
    image_mimes = {'image/png', 'image/jpeg', 'image/jpg', 'image/gif', 'image/webp', 'image/svg+xml'}
    total_tokens = 0
    MAX_TOTAL_TOKENS = 200_000  # Budget for all images

    for att in attachments[:3]:  # Limit to 3 images for performance
        url = att.get('url', '')
        name = att.get('name', '') or ''
        mime = att.get('mimeType', '') or att.get('type', '') or ''

        # Check if it's an image
        is_image = (
            mime.lower() in image_mimes or
            any(name.lower().endswith(ext) for ext in image_extensions) or
            any(ext in url.lower() for ext in image_extensions)
        )

        if not is_image or not url:
            continue

        try:
            # Handle data URLs
            if url.startswith('data:'):
                match = re.match(r'data:([^;]+);base64,(.+)', url)
                if match:
                    original_b64 = match.group(2)
                    # Decode, compress, and re-encode
                    try:
                        original_data = base64.b64decode(original_b64)
                        compressed_data, media_type = _compress_image_for_multimodal(original_data)
                        img_b64 = base64.b64encode(compressed_data).decode('utf-8')
                    except Exception:
                        img_b64 = original_b64
                        media_type = match.group(1)

                    est_tokens = len(img_b64) // 4
                    if total_tokens + est_tokens > MAX_TOTAL_TOKENS:
                        logger.warning(f"[MULTIMODAL] Skipping image - would exceed token budget")
                        continue
                    total_tokens += est_tokens

                    content_parts.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": img_b64
                        }
                    })
                    content_parts.append({
                        "type": "text",
                        "text": f"[Image: {name} - ANALYZE THIS and follow its design/content exactly]"
                    })
                    logger.info(f"[MULTIMODAL] ✅ Added base64 image: {name} (~{est_tokens//1000}K tokens)")
            else:
                # Download from URL
                response = requests.get(url, timeout=10, headers={
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                    'Accept': 'image/*'
                })
                if response.status_code == 200:
                    # Compress the image to prevent token explosion
                    compressed_data, media_type = _compress_image_for_multimodal(response.content)
                    img_b64 = base64.b64encode(compressed_data).decode('utf-8')

                    est_tokens = len(img_b64) // 4
                    if total_tokens + est_tokens > MAX_TOTAL_TOKENS:
                        logger.warning(f"[MULTIMODAL] Skipping image - would exceed token budget")
                        continue
                    total_tokens += est_tokens

                    content_parts.append({
                        "type": "image",
                        "source": {
                            "type": "base64",
                            "media_type": media_type,
                            "data": img_b64
                        }
                    })
                    content_parts.append({
                        "type": "text",
                        "text": f"[Image: {name} - ANALYZE THIS and follow its design/content exactly]"
                    })
                    logger.info(f"[MULTIMODAL] ✅ Added image: {name} (~{est_tokens//1000}K tokens)")
        except Exception as e:
            logger.warning(f"[MULTIMODAL] Failed to process image {name}: {e}")
            content_parts.append({
                "type": "text",
                "text": f"[Image URL - could not download: {url}]"
            })

    logger.info(f"[MULTIMODAL] Total image tokens: ~{total_tokens//1000}K")
    return content_parts

# region agent log
def _dbg(hypothesisId: str, location: str, message: str, data: Dict[str, Any], runId: str = "pre-fix") -> None:
    try:
        import json, time
        payload = {
            "sessionId": "debug-session",
            "runId": runId,
            "hypothesisId": hypothesisId,
            "location": location,
            "message": message,
            "data": data,
            "timestamp": int(time.time() * 1000),
        }
        with open("/Users/ahmed/Documents/Dev/nextslide/.cursor/debug.log", "a", encoding="utf-8") as f:
            f.write(json.dumps(payload, ensure_ascii=False) + "\n")
    except Exception:
        pass
# endregion


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER - Dict/Pydantic safe access
# ═══════════════════════════════════════════════════════════════════════════════

def _get_attr(obj, key, default=None):
    """Safely get attribute from dict or Pydantic model."""
    if obj is None:
        return default
    if isinstance(obj, dict):
        return obj.get(key, default)
    return getattr(obj, key, default)


# ═══════════════════════════════════════════════════════════════════════════════
# RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class ComponentProps(BaseModel):
    """Component properties."""
    class Config:
        extra = "allow"  # Allow any props


class GeneratedComponent(BaseModel):
    """A generated component."""
    type: str = Field(description="Component type: Background, TiptapTextBlock, Image, Chart, Shape, CustomComponent")
    props: Dict[str, Any] = Field(description="Component properties")


class SlideContent(BaseModel):
    """Generated slide content."""
    components: List[GeneratedComponent] = Field(description="List of components for the slide")


# ═══════════════════════════════════════════════════════════════════════════════
# PROMPTS
# ═══════════════════════════════════════════════════════════════════════════════

SLIDE_GENERATOR_PROMPT = """You are an expert slide designer. Generate beautiful, professional slide content.

CANVAS: 1920x1080 pixels. Origin (0,0) is top-left.

COMPONENT TYPES:

1. Background - Always include one
   props: { backgroundType: "gradient"|"solid", gradient?: {type, angle, stops}, backgroundColor?: hex color like FF0000 }

2. TiptapTextBlock - Text content
   props: { text: str, position: {x, y}, width, height, fontSize, fontWeight, textColor, alignment }

3. Image - Images
   props: { src: "url", position: {x, y}, width, height, objectFit: "cover"|"contain" }

4. Chart - Data visualization
   props: { chartType: "bar"|"line"|"pie", data: [{name, value, color}], position, width, height }

5. CustomComponent - Complex HTML/CSS (USE THIS for creative designs!)
   props: { render: "<!DOCTYPE html>...", position: {x, y}, width, height }
   The render prop should be a COMPLETE HTML document with Tailwind CSS.
   CRITICAL: Use SINGLE QUOTES in HTML, keep on ONE LINE.

DESIGN PRINCIPLES:
- Visual hierarchy (larger = more important)
- Breathing room (don't crowd)
- Professional, modern aesthetics
- Dark backgrounds with light text look great
- Use CustomComponent for anything fancy (timelines, cards, grids, etc.)

CUSTOMCOMPONENT TEMPLATE:
<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;overflow:hidden;background:transparent}}</style></head><body class='w-full h-full flex items-center justify-center p-8'>YOUR_CONTENT</body></html>
"""

SLIDE_EDIT_PROMPT = """You are an expert slide editor. Modify the slide based on the user's request.

CURRENT SLIDE COMPONENTS:
{current_components}

USER REQUEST: {instruction}

Return the COMPLETE updated slide components. Include ALL components (modified + unchanged).
If the slide only has a Background, generate new content based on the request.
"""

CUSTOM_COMPONENT_REWRITE_PROMPT = """You are an expert HTML/CSS designer. Modify this CustomComponent.

CURRENT HTML:
{current_html}

USER REQUEST: {instruction}

Return the COMPLETE updated HTML. Use Tailwind CSS classes.
Keep on ONE LINE, use SINGLE QUOTES for attributes.
"""


# ═══════════════════════════════════════════════════════════════════════════════
# HELPER FUNCTIONS
# ═══════════════════════════════════════════════════════════════════════════════

def _get_model_and_client(task: str = "slide_generate"):
    """Get model and client, handling rate limits."""
    model = get_model(task)

    if "gemini" in model and is_provider_in_cooldown("gemini"):
        model = get_model("fallback")
        logger.info(f"[SLIDE_TOOLS] Gemini in cooldown, using fallback: {model}")

    return get_client(model)


def _invoke_with_fallback(client, model, messages, response_model=None, max_tokens=32000):
    """Invoke LLM with automatic fallback on rate limit."""
    try:
        return invoke(
            client=client,
            model=model,
            messages=messages,
            response_model=response_model,
            max_tokens=max_tokens,
        )
    except Exception as e:
        error_str = str(e).lower()
        # Only fallback on actual rate limits, not other errors
        is_rate_limit = ('429' in error_str or 'rate limit' in error_str or 'quota exceeded' in error_str)
        is_not_filesystem = 'errno' not in error_str and 'file name' not in error_str

        if is_rate_limit and is_not_filesystem:
            logger.warning(f"[SLIDE_TOOLS] Rate limited, trying fallback")
            mark_provider_rate_limited("gemini" if "gemini" in model else "anthropic")
            fallback_client, fallback_model = get_client(MODEL_FALLBACK)
            return invoke(
                client=fallback_client,
                model=fallback_model,
                messages=messages,
                response_model=response_model,
                max_tokens=max_tokens,
            )
        raise


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
        import re
        text = re.sub(r'\n{3,}', '\n\n', text)
        # Limit length
        return text[:2000] if text else ""
    except Exception:
        # Fallback: simple regex extraction
        import re
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


# ═══════════════════════════════════════════════════════════════════════════════
# MAIN TOOLS
# ═══════════════════════════════════════════════════════════════════════════════

def edit_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    Edit a slide - AI decides what to change.

    CRITICAL LOGIC:
    1. If slide is empty/blank → GENERATE full content
    2. If slide has CustomComponent → REWRITE the HTML
    3. If slide has standard components → EDIT/REPLACE them

    Args:
        args: { "slide_id": str, "instruction": str }
        chat_history: Full chat history for context (user messages AND assistant responses)
    """
    slide_id = args.get('slide_id') or _get_attr(current_slide, 'id')
    instruction = args.get('instruction', '')

    components = _get_attr(current_slide, 'components', []) or []

    # Analyze slide state
    non_bg_components = [c for c in components if _get_attr(c, 'type') != 'Background']
    custom_component = next((c for c in components if _get_attr(c, 'type') == 'CustomComponent'), None)
    is_empty = len(non_bg_components) == 0

    instruction_l = (instruction or "").lower()
    has_image_attachments = bool(attachments) and any(
        (a.get("mimeType", "") or "").startswith("image/")
        or (a.get("type", "") or "").startswith("image/")
        or any((a.get("name", "") or "").lower().endswith(ext) for ext in [".png", ".jpg", ".jpeg", ".gif", ".webp"])
        for a in (attachments or [])
    )
    rewrite_keywords = [
        # Explicit rewrite requests
        "redesign", "redo", "rebuild", "from scratch", "start over",
        "completely different", "entirely different", "make it totally different",
        "overhaul", "transform",
        "replace the current", "match the image", "like the image", "use the image",
        # Branding changes (always need full rewrite)
        "co-brand", "cobrand", "rebrand", "brand with", "branded with",
        "add their logo", "add the logo", "use their logo",
        # Significant visual changes
        "make it nicer", "make it better", "improve the design",
        "more professional", "more modern", "update the style",
        "change the look", "change the style", "different style",
        "make it look", "make this look",
    ]
    wants_rewrite = any(k in instruction_l for k in rewrite_keywords) or ("img_" in instruction_l) or (".jpeg" in instruction_l) or (".png" in instruction_l)

    logger.info(f"[edit_slide] slide={slide_id}, empty={is_empty}, has_custom={custom_component is not None}")
    _dbg("B", "slide_tools.py:edit_slide", "branch_decision", {"slide_id": slide_id, "is_empty": is_empty, "has_custom": custom_component is not None, "wants_rewrite": wants_rewrite, "instruction_preview": (instruction or "")[:120]}, runId="pre-fix")

    # FORCE: For explicit redesign/rewrite requests, always produce a full-bleed CustomComponent.
    # This prevents the "NEW SLIDE" placeholder outcome when the slide has only standard components.
    if wants_rewrite and not custom_component:
        deck_diff = DeckDiff(DeckDiffBase())
        # remove non-background components
        for c in non_bg_components:
            cid = _get_attr(c, "id")
            if cid:
                deck_diff.remove_component(slide_id, cid)
        try:
            new_cc = _generate_full_bleed_custom_component(slide_id, instruction, deck_data, current_slide, attachments)
            deck_diff.add_component(slide_id, new_cc)
            _dbg("B", "slide_tools.py:edit_slide", "forced_full_bleed_custom_component", {"slide_id": slide_id, "new_component_id": new_cc.get("id"), "render_len": len(((new_cc.get("props") or {}).get("render")) or "")}, runId="pre-fix")
            return deck_diff
        except Exception as e:
            _dbg("B", "slide_tools.py:edit_slide", "forced_full_bleed_custom_component_failed", {"slide_id": slide_id, "error": str(e)[:200]}, runId="pre-fix")
            # fall through to existing behavior as last resort

    # CASE 1: Empty slide → Generate full content
    if is_empty:
        return _generate_slide_content(slide_id, instruction, current_slide, attachments)

    # CASE 2: Has CustomComponent → Rewrite HTML
    if custom_component:
        # Only do full rewrite if user explicitly asked for redesign/redo/etc.
        if wants_rewrite:
            return custom_component_rewrite(
                args={"slide_id": slide_id, "component_id": _get_attr(custom_component, "id"), "instruction": instruction},
                deck_data=deck_data,
                current_slide=current_slide,
                registry=registry,
                attachments=attachments,
                chat_history=chat_history,
            )
        # Otherwise: targeted edit attempt (Cursor-style) guided by AI to propose 1-3 exact replacements
        return _targeted_custom_component_edit(slide_id, custom_component, instruction, deck_data, attachments)

    # CASE 3: Standard components → Generate new slide content
    return _edit_standard_components(slide_id, components, instruction, attachments)

class _ReplaceOp(BaseModel):
    old_string: str = Field(description="Exact string to find in the HTML (must exist verbatim).")
    new_string: str = Field(description="Replacement string.")

class _ReplacePlan(BaseModel):
    ops: List[_ReplaceOp] = Field(default_factory=list, description="1-3 replacement operations to apply in order.")
    note: str = Field(default="", description="Brief note about what will change.")

def _gather_reference_images(current_html: str, attachments: List[Dict] = None) -> List[str]:
    """Collect reference image URLs from current HTML + attachments (return ALL unique URLs)."""
    reference_images: List[str] = []
    try:
        import re
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

def _run_async(coro):
    """Run async coroutine from sync context."""
    import asyncio
    try:
        loop = asyncio.get_event_loop()
        if loop.is_running():
            import concurrent.futures
            with concurrent.futures.ThreadPoolExecutor() as pool:
                return pool.submit(asyncio.run, coro).result()
        return loop.run_until_complete(coro)
    except RuntimeError:
        return asyncio.run(coro)

def _generate_full_bleed_custom_component(
    slide_id: str,
    instruction: str,
    deck_data: Dict,
    current_slide: Dict,
    attachments: List[Dict] = None,
) -> Dict[str, Any]:
    """
    Generate a full-bleed CustomComponent via CustomComponentGenerator (same quality path as generation).
    Returns a normalized component dict {id,type,props}.
    """
    from agents.generation.custom_component_generator import CustomComponentGenerator
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    reference_images = _gather_reference_images("", attachments)

    gen = CustomComponentGenerator()
    slide_context = {
        "title": _get_attr(current_slide, "title", "") or (deck_data or {}).get("name") or "Slide",
        "slide_index": 0,
        "total_slides": len((deck_data or {}).get("slides") or []) or 1,
        "slide_type": "content",
        "is_full_slide": True,
        "presentation_context": (deck_data or {}).get("name") or "",
        "background_color": (colors.get("primary_background") if isinstance(colors, dict) else None),
    }

    # Extract actual slide content - DO NOT pass user instructions as content
    actual_content = _extract_slide_content_for_redesign(current_slide)

    generated = _run_async(
        gen.generate(
            content=f"""REDESIGN REQUEST: {instruction}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- If reference images are provided, match their layout/style and transcribe any visible text the user asks to use exactly.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- The slide content should be based on the EXISTING SLIDE CONTENT above, not the redesign instructions.""",
            theme=theme if isinstance(theme, dict) else {},
            slide_context=slide_context,
            component_purpose="visualize",
            width=1920,
            height=1080,
            position={"x": 0, "y": 0},
            reference_images=reference_images or None,
        )
    )
    html = ((generated or {}).get("props") or {}).get("render") or ""
    if not html:
        raise ValueError("CustomComponentGenerator returned empty render")

    props = (generated or {}).get("props") or {}
    props = dict(props) if isinstance(props, dict) else {}
    props["render"] = html
    props["position"] = {"x": 0, "y": 0}
    props["width"] = 1920
    props["height"] = 1080

    return {"id": str(uuid.uuid4()), "type": "CustomComponent", "props": props}

def _targeted_custom_component_edit(
    slide_id: str,
    custom_component: Dict,
    instruction: str,
    deck_data: Dict,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Perform a surgical edit on CustomComponent HTML:
    - Use AI to propose exact old_string/new_string replacements (1-3)
    - Apply replacements mechanically (no HTML regeneration)
    If plan fails (no exact match), fall back to rewrite ONLY if needed.
    """
    comp_id = _get_attr(custom_component, "id")
    props = _get_attr(custom_component, "props", {}) or {}
    current_html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    current_html = strip_frontend_editing_scripts(current_html)

    # Theme context
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    typography = theme.get("typography") or {}
    att_hint = ""
    if attachments:
        try:
            safe = [f"- {a.get('name','file')}: {a.get('url','')}" for a in attachments]
            att_hint = "\n\nFILES AVAILABLE:\n" + "\n".join(safe)
        except Exception:
            att_hint = ""

    prompt = f"""You are a precise HTML editor. You must make a SMALL, TARGETED change without redesigning.

RULES:
- Do NOT rewrite the whole HTML.
- Propose 1-3 exact search/replace operations.
- old_string MUST exist verbatim in the provided HTML.
- Keep changes minimal and localized.

THEME (for color/font consistency):
- accent_1: {colors.get('accent_1')}
- accent_2: {colors.get('accent_2')}
- primary_text: {colors.get('primary_text')}
- primary_background: {colors.get('primary_background')}
- typography: {str(typography)[:500]}

CURRENT HTML (truncated to 25k):
{current_html[:25000]}

USER REQUEST:
{instruction}{att_hint}

Return a JSON object with:
{{"ops":[{{"old_string":"...", "new_string":"..."}}], "note":"..."}}"""

    client, model = _get_model_and_client("validation")
    plan = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "user", "content": prompt}],
        response_model=_ReplacePlan,
        max_tokens=8000,  # Increased from 2500 to handle larger HTML replacements for style changes
    )

    _dbg("B", "slide_tools.py:_targeted_custom_component_edit", "replace_plan", {"slide_id": slide_id, "component_id": comp_id, "ops": len(plan.ops), "note": plan.note[:200]}, runId="pre-fix")

    # Apply ops
    new_html = current_html
    applied = 0
    for op in (plan.ops or [])[:3]:
        if not op.old_string:
            continue
        if op.old_string not in new_html:
            _dbg("B", "slide_tools.py:_targeted_custom_component_edit", "old_string_missing", {"missing_preview": op.old_string[:120], "component_id": comp_id}, runId="pre-fix")
            break
        new_html = new_html.replace(op.old_string, op.new_string or "", 1)
        applied += 1

    if applied == 0:
        # Fallback: do NOT rewrite unless the request strongly implies redesign.
        # If we can't apply targeted changes, use the higher-quality rewrite (CustomComponentGenerator prompt).
        return custom_component_rewrite(
            args={"slide_id": slide_id, "component_id": comp_id, "instruction": instruction},
            deck_data=deck_data,
            current_slide={"id": slide_id, "components": [custom_component]},
            registry=None,
            attachments=attachments,
        )

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        comp_id,
        ComponentDiffBase(id=comp_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg("B", "slide_tools.py:_targeted_custom_component_edit", "applied_replace_ops", {"applied": applied, "old_len": len(current_html), "new_len": len(new_html)}, runId="pre-fix")
    return deck_diff


def _generate_slide_content(
    slide_id: str,
    instruction: str,
    current_slide: Dict,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Generate content for an empty slide."""
    logger.info(f"[_generate_slide_content] Generating content for empty slide")

    # Get existing background if any
    components = _get_attr(current_slide, 'components', []) or []
    background = next(
        (c for c in components if _get_attr(c, 'type') == 'Background'),
        None
    )

    prompt = f"""{SLIDE_GENERATOR_PROMPT}

EXISTING BACKGROUND: {_get_attr(background, 'props') if background else 'None - create a dark gradient background'}

USER REQUEST: {instruction}

Generate slide components. The slide is currently EMPTY.
Create visually appealing, professional content that fulfills the request.
Use CustomComponent for complex layouts (cards, grids, timelines, etc.)."""

    client, model = _get_model_and_client("slide_generate")

    # Check if we have image attachments - use multimodal content if so
    has_images = attachments and any(
        a.get('mimeType', '').startswith('image/') or
        a.get('type', '').startswith('image/') or
        any(a.get('name', '').lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp'])
        for a in attachments
    )

    if has_images:
        # Build multimodal content with images for the AI to SEE
        logger.info(f"[_generate_slide_content] 🖼️ Building multimodal content with {len(attachments)} attachments")
        user_content = _build_multimodal_content(prompt, attachments)
        messages = [{"role": "user", "content": user_content}]
    else:
        # Text-only, include attachment URLs in text
        if attachments:
            att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
            prompt += f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)
        messages = [{"role": "user", "content": prompt}]

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=messages,
        response_model=SlideContent,
        max_tokens=32000,
    )

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())

    for component in response.components:
        # Skip background if slide already has one
        if component.type == 'Background' and background:
            continue

        comp_dict = {
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        }
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_generate_slide_content] Generated {len(response.components)} components")
    return deck_diff


def _detect_slide_mode_from_html(html: str) -> str:
    try:
        h = (html or "").lower()
        if "<script" in h or "onclick=" in h or "onmouseover=" in h:
            return "interactive"
        return "static"
    except Exception:
        return "interactive"

def custom_component_rewrite(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    High-quality rewrite for a specific CustomComponent using CustomComponentGenerator prompts.
    Only use when user explicitly requests redesign/redo/etc., or as last resort fallback.

    Args: {"slide_id": str, "component_id": str, "instruction": str}
    chat_history: Full chat history for context (user messages AND assistant responses)
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    instruction = args.get("instruction", "")

    components = _get_attr(current_slide, "components", []) or []
    custom_component = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not custom_component:
        custom_component = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
    if not custom_component:
        raise ValueError("CustomComponent not found for rewrite")

    logger.info(f"[custom_component_rewrite] Rewriting custom component")

    comp_id = _get_attr(custom_component, 'id')
    props = _get_attr(custom_component, 'props', {}) or {}
    current_html = props.get('render', '') if isinstance(props, dict) else getattr(props, 'render', '')

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    current_html = strip_frontend_editing_scripts(current_html)

    # Extract theme context from deck
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    typography = theme.get("typography") or {}

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = ["- " + a.get('name', 'file') + ": " + a.get('url', '') for a in attachments]
        att_context = "\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    slide_mode = _detect_slide_mode_from_html(current_html)

    # Gather ALL reference images (we embed a few as multimodal, but include all URLs in text context)
    reference_images = _gather_reference_images(current_html, attachments)

    # Prefer the full CustomComponentGenerator.generate() flow (same as slide generation).
    def _run_async(coro):
        import asyncio
        try:
            loop = asyncio.get_event_loop()
            if loop.is_running():
                import concurrent.futures
                with concurrent.futures.ThreadPoolExecutor() as pool:
                    return pool.submit(asyncio.run, coro).result()
            return loop.run_until_complete(coro)
        except RuntimeError:
            return asyncio.run(coro)

    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator()
        # Compute slide index if present in deck_data
        try:
            slides = (deck_data or {}).get("slides") or []
            slide_index = next((i for i, s in enumerate(slides) if isinstance(s, dict) and s.get("id") == slide_id), 0)
        except Exception:
            slide_index = 0

        slide_context = {
            "title": _get_attr(current_slide, "title", "") or (deck_data or {}).get("name") or "Slide",
            "slide_index": slide_index,
            "total_slides": len((deck_data or {}).get("slides") or []) or 1,
            "slide_type": "content",
            "is_full_slide": True,
            "presentation_context": (deck_data or {}).get("name") or "",
            "background_color": (colors.get("primary_background") if isinstance(colors, dict) else None),
            "chat_history": chat_history,  # Pass full chat history for context
        }
        theme_for_gen = theme if isinstance(theme, dict) else {}
        # Include all attachment URLs in the prompt text so the model can infer intent without UI buttons.
        attachment_context = ""
        if attachments:
            safe = [f"- {a.get('name','file')}: {a.get('url','')}" for a in attachments]
            attachment_context = "\n\nFILES (infer intent; if user says 'use this' and images exist, treat as primary reference and recreate):\n" + "\n".join(safe)

        # Build chat context string
        chat_context = ""
        if chat_history:
            recent = chat_history[-10:] if len(chat_history) > 10 else chat_history
            chat_lines = []
            for msg in recent:
                role = msg.get('role', 'user')
                content = str(msg.get('content', ''))[:500]
                chat_lines.append(f"{role.upper()}: {content}")
            if chat_lines:
                chat_context = "\n\nCONVERSATION CONTEXT (use this to understand user preferences and agreements):\n" + "\n".join(chat_lines)
                logger.info(f"[custom_component_rewrite] Including {len(recent)} chat messages as context")

        # Extract actual content from existing HTML - DO NOT pass user instructions as content
        actual_content = _extract_slide_content_for_redesign(current_slide, current_html)

        generated = _run_async(
            gen.generate(
                content=f"""REDESIGN REQUEST: {instruction}{attachment_context}{chat_context}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas. Do not use max-width containers.
- If reference images are provided, match their layout and style.
- Use the conversation context above to understand what the user wants and any preferences they discussed.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- The slide content should be based on the EXISTING SLIDE CONTENT above, not the redesign instructions.""",
                theme=theme_for_gen,
                slide_context=slide_context,
                component_purpose="visualize",
                width=1920,
                height=1080,
                position={"x": 0, "y": 0},
                reference_images=reference_images or None,
            )
        )
        new_html = ((generated or {}).get("props") or {}).get("render") or ""
        if not new_html:
            raise ValueError("generator returned empty render")

        # Build diff with render + full-bleed sizing
        deck_diff = DeckDiff(DeckDiffBase())
        component_diff = ComponentDiffBase(
            id=comp_id,
            type="CustomComponent",
            props={"render": new_html, "position": {"x": 0, "y": 0}, "width": 1920, "height": 1080},
        )
        deck_diff.update_component(slide_id, comp_id, component_diff)

        _dbg("B", "slide_tools.py:custom_component_rewrite", "rewrite_done", {"slide_id": slide_id, "component_id": comp_id, "mode": slide_mode, "model": getattr(gen, "model", None), "reference_images": reference_images, "old_len": len(current_html), "new_len": len(new_html)}, runId="pre-fix")
        logger.info(f"[custom_component_rewrite] Rewrote via CustomComponentGenerator ({len(current_html)} → {len(new_html)} chars)")
        return deck_diff
    except Exception as e:
        logger.warning(f"[custom_component_rewrite] Generator path failed, falling back to prompt-based rewrite: {e}")

    # Fallback: prompt-based rewrite (kept for safety)
    # Reuse CustomComponentGenerator prompt builder for quality parity
    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator()
        system_prompt = gen._build_system_prompt(
            colors=colors if isinstance(colors, dict) else {},
            typography=typography if isinstance(typography, dict) else {},
            style_keywords=[],
            slide_mode=slide_mode,
            logo_url=None,
        )
    except Exception as e:
        system_prompt = "You are an expert HTML/CSS designer. Modify the CustomComponent with high quality and theme consistency. Fill 1920x1080."
        logger.warning(f"[custom_component_rewrite] Failed to build generator prompt, using fallback: {e}")

    user_prompt = f"""CURRENT CUSTOMCOMPONENT HTML:
{current_html[:25000]}

REFERENCE IMAGE URLS (if any): {', '.join(reference_images) if reference_images else 'none'}

USER REQUEST (use this to guide your redesign, do NOT display this text in the slide):
{instruction}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- Do not use max-width containers (no max-w-7xl).
- DO NOT include the user request text as visible content in the slide.
- The slide content should be based on the CURRENT CUSTOMCOMPONENT HTML above, redesigned according to the user request.

Return ONLY the complete updated HTML (starting with <!DOCTYPE html>)."""

    client, model = _get_model_and_client("custom_component_rewrite")

    new_html = _invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        response_model=None,  # Raw output
        max_tokens=32000,
    )

    # Clean up response (extract HTML if wrapped in markdown)
    if '```html' in new_html:
        new_html = new_html.split('```html')[1].split('```')[0].strip()
    elif '```' in new_html:
        new_html = new_html.split('```')[1].split('```')[0].strip()

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    component_diff = ComponentDiffBase(
        id=comp_id,
        type="CustomComponent",
        props={"render": new_html}
    )
    deck_diff.update_component(slide_id, comp_id, component_diff)

    _dbg("B", "slide_tools.py:custom_component_rewrite", "rewrite_done", {"slide_id": slide_id, "component_id": comp_id, "mode": slide_mode, "model": model, "sys_len": len(system_prompt), "user_len": len(user_prompt), "old_len": len(current_html), "new_len": len(new_html)}, runId="pre-fix")
    logger.info(f"[custom_component_rewrite] Rewrote HTML ({len(current_html)} → {len(new_html)} chars)")
    return deck_diff

def custom_component_str_replace(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Make a targeted edit to a CustomComponent.
    Can accept either:
    - instruction: str - AI will figure out what to change
    - old_string/new_string: str - Direct replacement
    Args: {"slide_id": str, "component_id": str, "instruction": str} OR {"slide_id": str, "component_id": str, "old_string": str, "new_string": str}
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    instruction = args.get("instruction") or ""
    old_string = args.get("old_string") or ""
    new_string = args.get("new_string") or ""

    components = _get_attr(current_slide, "components", []) or []

    # Find the component - first try by ID, then find any CustomComponent
    comp = None
    if component_id:
        comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not comp:
        comp = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
    if not comp or _get_attr(comp, "type") != "CustomComponent":
        raise ValueError(f"CustomComponent not found on slide")

    component_id = _get_attr(comp, "id")

    # If we have instruction but no old_string, use AI to figure out the replacement
    if instruction and not old_string:
        logger.info(f"[custom_component_str_replace] Using AI to determine replacement for: {instruction[:50]}...")
        return _targeted_custom_component_edit(slide_id, comp, instruction, deck_data, attachments)

    # Otherwise do direct replacement
    if not old_string:
        raise ValueError("Either 'instruction' or 'old_string' is required")

    props = _get_attr(comp, "props", {}) or {}
    html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")

    # CRITICAL: Strip frontend editing scripts from HTML before processing
    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
    html = strip_frontend_editing_scripts(html)

    if old_string not in html:
        # Provide more context about what went wrong
        html_preview = html[:500] if html else "(empty)"
        raise ValueError(f"old_string not found in CustomComponent HTML. Searched for: '{old_string[:100]}...' in HTML starting with: '{html_preview}...'")

    new_html = html.replace(old_string, new_string, 1)
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg("B", "slide_tools.py:custom_component_str_replace", "str_replace_applied", {"slide_id": slide_id, "component_id": component_id, "old_preview": old_string[:120], "new_preview": new_string[:120]}, runId="pre-fix")
    return deck_diff

def component_prop_update(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Mechanical prop merge for a component. No AI.
    Args: {"slide_id": str, "component_id": str, "updates": { ... }}
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    updates = args.get("updates") or {}
    if not component_id:
        raise ValueError("component_id is required")
    if not isinstance(updates, dict):
        raise ValueError("updates must be an object")

    components = _get_attr(current_slide, "components", []) or []
    comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not comp:
        raise ValueError(f"Component {component_id} not found")

    ctype = _get_attr(comp, "type", "Unknown")
    props = _get_attr(comp, "props", {}) or {}
    if not isinstance(props, dict):
        props = dict(props) if hasattr(props, "__iter__") else {}
    new_props = {**props, **updates}

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type=ctype, props=new_props),
    )
    _dbg("B", "slide_tools.py:component_prop_update", "prop_update", {"slide_id": slide_id, "component_id": component_id, "type": ctype, "keys": list(updates.keys())[:30]}, runId="pre-fix")
    return deck_diff

def view_component(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Return component details (and HTML preview for CustomComponent).
    This is a read-only tool - returns an empty DeckDiff.
    The component info is logged for the AI to see in context.

    Args: {"slide_id": str, "component_id": str}
    """
    component_id = args.get("component_id")
    components = _get_attr(current_slide, "components", []) or []

    # If no component_id provided, try to find the first CustomComponent or the first non-Background component
    if not component_id:
        # Prefer CustomComponent as that's usually what users want to inspect
        comp = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
        if not comp:
            # Fall back to first non-Background component
            comp = next((c for c in components if _get_attr(c, "type") != "Background"), None)
        if not comp:
            raise ValueError("component_id is required - no suitable component found on slide")
        component_id = _get_attr(comp, "id")
        logger.info(f"[view_component] No component_id provided, defaulting to {component_id}")
    else:
        comp = next((c for c in components if _get_attr(c, "id") == component_id), None)
        if not comp:
            raise ValueError(f"Component {component_id} not found")

    ctype = _get_attr(comp, "type", "Unknown")
    props = _get_attr(comp, "props", {}) or {}
    out: Dict[str, Any] = {"id": component_id, "type": ctype, "props": props}
    if ctype == "CustomComponent":
        html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")
        # CRITICAL: Strip frontend editing scripts before showing to AI
        from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts
        html = strip_frontend_editing_scripts(html)
        # Provide full HTML so the agent can actually reason + do targeted edits.
        # (Logs are not fed back into the LLM prompt; orchestrator will read this observation.)
        out["html"] = html or ""
        out["html_preview"] = (html or "")[:2000]

    # Log the component info for debugging/AI context
    logger.info(f"[view_component] Viewed component {component_id}: type={ctype}, props_keys={list(props.keys()) if isinstance(props, dict) else 'N/A'}")
    _dbg("B", "slide_tools.py:view_component", "component_viewed", out, runId="pre-fix")

    # Return empty DeckDiff since this is a read-only operation,
    # but attach the observation so orchestrator can feed it back to the agent.
    dd = DeckDiff(DeckDiffBase())
    try:
        setattr(dd, "observation", out)
    except Exception:
        pass
    return dd


def _edit_standard_components(
    slide_id: str,
    components: List[Dict],
    instruction: str,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """Edit standard components or replace with CustomComponent."""
    logger.info(f"[_edit_standard_components] Editing {len(components)} components")

    prompt = f"""{SLIDE_GENERATOR_PROMPT}

{SLIDE_EDIT_PROMPT.format(
    current_components=_format_components_for_prompt(components),
    instruction=instruction,
)}

Return ALL components for the slide (modified + unchanged).
Consider converting to a CustomComponent if the request requires complex layout."""

    client, model = _get_model_and_client("slide_generate")

    # Check if we have image attachments - use multimodal content if so
    has_images = attachments and any(
        a.get('mimeType', '').startswith('image/') or
        a.get('type', '').startswith('image/') or
        any(a.get('name', '').lower().endswith(ext) for ext in ['.png', '.jpg', '.jpeg', '.gif', '.webp'])
        for a in attachments
    )

    if has_images:
        # Build multimodal content with images for the AI to SEE
        logger.info(f"[_edit_standard_components] 🖼️ Building multimodal content with {len(attachments)} attachments")
        user_content = _build_multimodal_content(prompt, attachments)
        messages = [{"role": "user", "content": user_content}]
    else:
        # Text-only, include attachment URLs in text
        if attachments:
            att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
            prompt += f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)
        messages = [{"role": "user", "content": prompt}]

    response = _invoke_with_fallback(
        client=client,
        model=model,
        messages=messages,
        response_model=SlideContent,
        max_tokens=32000,
    )

    # Build diff - remove old components, add new ones
    deck_diff = DeckDiff(DeckDiffBase())

    # Remove all non-background components
    for c in components:
        if _get_attr(c, 'type') != 'Background':
            deck_diff.remove_component(slide_id, _get_attr(c, 'id'))

    # Add new components
    for component in response.components:
        if component.type == 'Background':
            # Update existing background instead of adding
            bg = next((c for c in components if _get_attr(c, 'type') == 'Background'), None)
            if bg:
                bg_id = _get_attr(bg, 'id')
                bg_diff = ComponentDiffBase(
                    id=bg_id,
                    type="Background",
                    props=component.props
                )
                deck_diff.update_component(slide_id, bg_id, bg_diff)
                continue

        comp_dict = {
            "id": str(uuid.uuid4()),
            "type": component.type,
            "props": component.props,
        }
        deck_diff.add_component(slide_id, comp_dict)

    logger.info(f"[_edit_standard_components] Generated {len(response.components)} components")
    return deck_diff


def create_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    chat_history: List[Dict] = None,
) -> DeckDiff:
    """
    Create a brand new slide with AI-generated content using CustomComponentGenerator.

    Args:
        args: { "instruction": str, "insert_after": optional str }
        chat_history: Full chat history for context (user messages AND assistant responses)
    """
    from agents.generation.custom_component_generator import CustomComponentGenerator

    instruction = args.get('instruction', '')
    insert_after = args.get('insert_after')

    # CRITICAL: Default insert_after to current slide so new slides appear after current, not at end
    if not insert_after and current_slide:
        insert_after = _get_attr(current_slide, 'id')
        logger.info(f"[create_slide] Auto-setting insert_after to current slide: {insert_after}")

    logger.info(f"[create_slide] Creating new slide: {instruction[:50]}... (insert_after={insert_after})")

    # Extract theme from deck
    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    bg_color = colors.get("primary_background", "#1e1e2e")

    # Gather reference images from attachments
    reference_images = _gather_reference_images("", attachments)

    # Build chat context string for the generator
    chat_context = ""
    if chat_history:
        # Format the last 10 messages for context
        recent = chat_history[-10:] if len(chat_history) > 10 else chat_history
        chat_lines = []
        for msg in recent:
            role = msg.get('role', 'user')
            content = str(msg.get('content', ''))[:500]  # Truncate long messages
            chat_lines.append(f"{role.upper()}: {content}")
        if chat_lines:
            chat_context = "\n\nCONVERSATION CONTEXT (use this to understand user preferences and agreements):\n" + "\n".join(chat_lines)
            logger.info(f"[create_slide] Including {len(recent)} chat messages as context")

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_context = "\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    # Calculate slide index for context
    slides = (deck_data or {}).get("slides") or []
    slide_index = len(slides)  # New slide will be added at the end (or after insert_after)

    # Build slide context for CustomComponentGenerator
    slide_context = {
        "title": instruction[:80] if instruction else "New Slide",
        "slide_index": slide_index,
        "total_slides": len(slides) + 1,
        "slide_type": "content",
        "is_full_slide": True,
        "background_color": bg_color,
        "presentation_context": (deck_data or {}).get("name") or "",
        "slide_mode": "interactive",  # Default to interactive for new slides
        "chat_history": chat_history,  # Pass full chat history for context
    }

    # Generate using CustomComponentGenerator for high-quality output
    gen = CustomComponentGenerator()
    try:
        generated = _run_async(
            gen.generate(
                content=f"""CREATE NEW SLIDE: {instruction}{att_context}{chat_context}

IMPORTANT:
- Create a complete, beautiful slide that fills the entire 1920x1080 canvas.
- Use the conversation context above to understand what the user wants.
- If the user discussed specific preferences (colors, style, interactivity), apply them.
- Make it visually stunning and professional.""",
                theme=theme if isinstance(theme, dict) else {},
                slide_context=slide_context,
                component_purpose="visualize",
                width=1920,
                height=1080,
                position={"x": 0, "y": 0},
                reference_images=reference_images or None,
            )
        )

        html = ((generated or {}).get("props") or {}).get("render") or ""
        if not html:
            raise ValueError("CustomComponentGenerator returned empty render")

        logger.info(f"[create_slide] Generated CustomComponent with {len(html)} chars HTML")

        # Build the slide with the generated CustomComponent
        slide_id = str(uuid.uuid4())
        slide_title = (instruction or "").strip()
        if not slide_title:
            slide_title = "New Slide"
        if len(slide_title) > 80:
            slide_title = slide_title[:77].rstrip() + "..."

        # Create background component
        background_comp = {
            "id": str(uuid.uuid4()),
            "type": "Background",
            "props": {
                "backgroundType": "solid",
                "backgroundColor": bg_color.lstrip("#") if bg_color.startswith("#") else bg_color
            }
        }

        # Create CustomComponent with the generated HTML
        custom_comp = {
            "id": str(uuid.uuid4()),
            "type": "CustomComponent",
            "props": {
                "render": html,
                "position": {"x": 0, "y": 0},
                "width": 1920,
                "height": 1080
            }
        }

        slide = {
            "id": slide_id,
            "title": slide_title,
            "components": [background_comp, custom_comp]
        }

    except Exception as e:
        logger.warning(f"[create_slide] CustomComponentGenerator failed, falling back to basic generation: {e}")
        # Fallback to the original simple approach
        prompt = f"""{SLIDE_GENERATOR_PROMPT}
{att_context}

USER REQUEST: {instruction}

Generate a complete, beautiful slide. Include:
1. A Background component (dark gradient recommended)
2. Prefer ONE CustomComponent for the entire layout (cards/grids/illustrations/text), so the slide feels cohesive.
   Only add extra components if absolutely necessary.

Make it visually stunning and professional."""

        client, model = _get_model_and_client("slide_generate")

        response = _invoke_with_fallback(
            client=client,
            model=model,
            messages=[{"role": "user", "content": prompt}],
            response_model=SlideContent,
            max_tokens=32000,
        )

        slide_id = str(uuid.uuid4())
        slide_title = (instruction or "").strip()
        if not slide_title:
            slide_title = "New Slide"
        if len(slide_title) > 80:
            slide_title = slide_title[:77].rstrip() + "..."

        slide = {
            "id": slide_id,
            "title": slide_title,
            "components": []
        }

        for component in response.components:
            comp_dict = {
                "id": str(uuid.uuid4()),
                "type": component.type,
                "props": component.props,
            }
            slide["components"].append(comp_dict)

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(slide)

    # If insert_after provided, set slide_order to position new slide correctly
    if insert_after and deck_data:
        try:
            slides = (deck_data or {}).get("slides") or []
            ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]
            if insert_after in ids:
                idx = ids.index(insert_after) + 1
                ids.insert(idx, slide_id)
                deck_diff.deck_diff.slide_order = ids
                logger.info(f"[create_slide] Set slide_order: new slide at position {idx}")
        except Exception as e:
            logger.warning(f"[create_slide] Failed to set slide_order: {e}")

    logger.info(f"[create_slide] Created slide with {len(slide['components'])} components")
    return deck_diff


def create_slide_variants(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> Dict[str, Any]:
    """
    Create TWO different versions of a new slide for user to choose from.
    Returns a special response with variants instead of a DeckDiff.

    Args:
        args: { "instruction": str, "insert_after": optional str }
    """
    instruction = args.get('instruction', '')
    insert_after = args.get('insert_after')

    # CRITICAL: Default insert_after to current slide so new slides appear after current, not at end
    if not insert_after and current_slide:
        insert_after = _get_attr(current_slide, 'id')
        logger.info(f"[create_slide_variants] Auto-setting insert_after to current slide: {insert_after}")

    logger.info(f"[create_slide_variants] 🎯 CALLED - Creating 2 slide variants: {instruction[:50]}... (insert_after={insert_after})")

    # Build attachment context
    att_context = ""
    if attachments:
        att_list = [f"- {a.get('name', 'file')}: {a.get('url', '')}" for a in attachments]
        att_context = f"\n\nUSER ATTACHMENTS (incorporate if relevant):\n" + "\n".join(att_list)

    # Extract theme context from deck
    theme_context = ""
    try:
        deck_theme = (deck_data or {}).get("theme") or {}
        if deck_theme:
            colors = deck_theme.get("color_palette") or {}
            bg_color = colors.get("primary_background", "#1e1e2e")
            text_color = colors.get("primary_text", "#ffffff")
            accent_colors = colors.get("colors", [])
            typography = deck_theme.get("typography") or {}
            title_font = typography.get("hero_title", {}).get("family", "Inter")
            body_font = typography.get("body_text", {}).get("family", "Inter")
            theme_context = f"""
DECK THEME (use these colors/fonts):
- Background: {bg_color}
- Text: {text_color}
- Accent colors: {', '.join(accent_colors[:3]) if accent_colors else 'blue, purple, green'}
- Title font: {title_font}
- Body font: {body_font}
"""
    except Exception:
        pass

    client, model = _get_model_and_client("slide_generate")

    # Generate two different variants
    variants = []

    for variant_num in [1, 2]:
        style_hint = "clean and minimal" if variant_num == 1 else "bold and dynamic"
        prompt = f"""{SLIDE_GENERATOR_PROMPT}
{att_context}
{theme_context}

USER REQUEST: {instruction}

STYLE: Create a {style_hint} version.

Generate a complete, beautiful slide. Include:
1. A Background component (use theme colors if provided)
2. Prefer ONE CustomComponent for the entire layout
3. Make it visually stunning and professional
4. {"Use clean lines, whitespace, and subtle styling" if variant_num == 1 else "Use bold typography, strong colors, and dynamic composition"}
"""

        try:
            response = _invoke_with_fallback(
                client=client,
                model=model,
                messages=[{"role": "user", "content": prompt}],
                response_model=SlideContent,
                max_tokens=32000,
            )

            # Build slide
            slide_id = str(uuid.uuid4())
            slide_title = (instruction or "").strip()
            if not slide_title:
                slide_title = "New Slide"
            if len(slide_title) > 80:
                slide_title = slide_title[:77].rstrip() + "..."

            slide = {
                "id": slide_id,
                "title": slide_title,
                "components": [],
                "variant_style": style_hint
            }

            for component in response.components:
                comp_dict = {
                    "id": str(uuid.uuid4()),
                    "type": component.type,
                    "props": component.props,
                }
                slide["components"].append(comp_dict)

            variants.append({
                "slide": slide,
                "label": f"Option {variant_num}: {style_hint.title()}",
                "style": style_hint
            })

            logger.info(f"[create_slide_variants] Created variant {variant_num} with {len(slide['components'])} components")
        except Exception as e:
            logger.warning(f"[create_slide_variants] Failed to create variant {variant_num}: {e}")
            continue

    if not variants:
        raise ValueError("Failed to create any slide variants")

    logger.info(f"[create_slide_variants] ✅ Returning {len(variants)} variants to orchestrator")
    return {
        "type": "slide_variants",
        "variants": variants,
        "instruction": instruction,
        "insert_after": insert_after
    }


def delete_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Delete a slide from the deck.

    Args:
        args: { "slide_id": str }
    """
    slide_id = args.get('slide_id')

    if not slide_id:
        raise ValueError("slide_id is required")

    logger.info(f"[delete_slide] Deleting slide: {slide_id}")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.remove_slide(slide_id)

    return deck_diff


def duplicate_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Duplicate an existing slide (mechanical, no AI).
    Args: {"slide_id": str, "insert_after": optional str}
    """
    import copy
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    insert_after = args.get("insert_after")
    slides = (deck_data or {}).get("slides") or []

    original = next((s for s in slides if isinstance(s, dict) and s.get("id") == slide_id), None)
    if not original:
        # Fall back to current_slide snapshot
        original = current_slide if isinstance(current_slide, dict) else None
    if not original:
        raise ValueError(f"Slide {slide_id} not found")

    new_slide = copy.deepcopy(original)
    new_slide["id"] = str(uuid.uuid4())
    # New component IDs
    for c in (new_slide.get("components") or []):
        if isinstance(c, dict):
            c["id"] = str(uuid.uuid4())

    # Add as slide_to_add; ordering handled by slide_order if desired later
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slides_to_add.append(new_slide)

    # If insert_after provided, produce a new slide_order (optional)
    if insert_after:
        try:
            ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]
            if insert_after in ids:
                idx = ids.index(insert_after) + 1
                ids.insert(idx, new_slide["id"])
                deck_diff.deck_diff.slide_order = ids
        except Exception:
            pass

    return deck_diff


def reorder_slides(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Reorder slides by producing deck_diff.slide_order, applied by agent_apply.apply_deckdiff.
    Args:
      - {"slide_id": str, "new_index": int}
      - OR {"slide_order": [slide_id,...]} (full order)
    """
    slides = (deck_data or {}).get("slides") or []
    ids = [s.get("id") for s in slides if isinstance(s, dict) and s.get("id")]

    order = args.get("slide_order")
    if isinstance(order, list) and order:
        # Trust provided order; append any missing to preserve
        mentioned = [sid for sid in order if sid in ids]
        tail = [sid for sid in ids if sid not in set(mentioned)]
        final = mentioned + tail
    else:
        sid = args.get("slide_id")
        new_index = args.get("new_index")
        if sid not in ids:
            raise ValueError("slide_id not found in deck")
        if not isinstance(new_index, int):
            raise ValueError("new_index must be an integer")
        ids.remove(sid)
        # clamp
        if new_index < 0:
            new_index = 0
        if new_index > len(ids):
            new_index = len(ids)
        ids.insert(new_index, sid)
        final = ids

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.deck_diff.slide_order = final
    return deck_diff


def apply_theme_to_custom_components(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Apply theme colors and fonts to ALL CustomComponents in the deck.

    This is a "hotswap" operation that updates CSS custom properties
    and font-family declarations in CustomComponent HTML.

    Args in dict:
        colors: Optional dict with color values (accent_1, primary_text, etc.)
        typography: Optional dict with font info (heading, body)

    If not provided, uses deck's existing theme.
    """
    from agents.editing.orchestrator_v2 import (
        apply_theme_to_custom_component_html,
        strip_frontend_editing_scripts
    )
    from models.slide import SlideDiffBase

    # Get theme from args or deck
    colors = args.get("colors")
    typography = args.get("typography")

    # Fall back to deck theme if not provided
    if not colors or not typography:
        theme = (deck_data or {}).get("theme") or {}
        if not colors:
            colors = theme.get("color_palette") or theme.get("colors") or {}
        if not typography:
            typography = theme.get("typography") or {}

    if not colors and not typography:
        logger.warning("[apply_theme_to_custom_components] No theme colors or typography to apply")
        return DeckDiff(DeckDiffBase())

    logger.info(f"[apply_theme_to_custom_components] Applying theme to all CustomComponents")
    logger.info(f"[apply_theme_to_custom_components] Colors: {list(colors.keys()) if colors else 'None'}")
    logger.info(f"[apply_theme_to_custom_components] Typography: {list(typography.keys()) if typography else 'None'}")

    slides_to_update = []
    updated_count = 0

    for slide in (deck_data or {}).get("slides", []):
        slide_id = slide.get("id")
        components = slide.get("components", [])
        components_to_update = []

        for comp in components:
            if comp.get("type") != "CustomComponent":
                continue

            props = comp.get("props", {})
            html = props.get("render", "")
            if not html:
                continue

            # Clean and apply theme
            clean_html = strip_frontend_editing_scripts(html)
            themed_html = apply_theme_to_custom_component_html(clean_html, colors, typography)

            if themed_html != html:
                comp_id = comp.get("id")
                components_to_update.append(
                    ComponentDiffBase(
                        id=comp_id,
                        type="CustomComponent",
                        props={"render": themed_html}
                    )
                )
                updated_count += 1
                logger.info(f"[apply_theme_to_custom_components] Updated component {comp_id} on slide {slide_id}")

        if components_to_update:
            slides_to_update.append(
                SlideDiffBase(
                    slide_id=slide_id,
                    components_to_update=components_to_update
                )
            )

    logger.info(f"[apply_theme_to_custom_components] Updated {updated_count} CustomComponents across {len(slides_to_update)} slides")

    return DeckDiff(DeckDiffBase(slides_to_update=slides_to_update))


# ═══════════════════════════════════════════════════════════════════════════════
# CROSS-SLIDE EDITING - Apply same edit to all slides
# ═══════════════════════════════════════════════════════════════════════════════

def edit_all_slides(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    event_cb: callable = None,
) -> DeckDiff:
    """
    Apply the same edit instruction to ALL slides in the deck IN PARALLEL.

    ONLY use when user explicitly mentions "all slides", "every slide", "across the deck", etc.

    This iterates through all slides and applies custom_component_str_replace to each.
    Useful for:
    - "Make all text larger across all slides"
    - "Change the font on every slide"
    - "Update the footer on all slides"
    - "Make all titles blue across the deck"

    Args:
        args: { "instruction": str } - The edit to apply to all slides

    Returns:
        DeckDiff with updates for all slides
    """
    import concurrent.futures

    instruction = args.get("instruction", "")
    if not instruction:
        raise ValueError("edit_all_slides requires an 'instruction' argument")

    slides = _get_attr(deck_data, "slides", []) or []
    if not slides:
        logger.warning("[edit_all_slides] No slides found in deck")
        return DeckDiff(DeckDiffBase())

    logger.info(f"[edit_all_slides] Applying '{instruction[:50]}...' to {len(slides)} slides IN PARALLEL")

    # Import SlideDiffBase for creating slide diffs
    from models.slide import SlideDiffBase

    # Prepare slides that have CustomComponents
    slides_to_process = []
    for i, slide in enumerate(slides):
        slide_id = _get_attr(slide, "id")
        if not slide_id:
            continue

        components = _get_attr(slide, "components", []) or []

        # Find CustomComponent on this slide
        custom_comp = next(
            (c for c in components if _get_attr(c, "type") == "CustomComponent"),
            None
        )

        if not custom_comp:
            logger.debug(f"[edit_all_slides] Slide {slide_id} has no CustomComponent, skipping")
            continue

        props = _get_attr(custom_comp, "props", {}) or {}
        if isinstance(props, dict):
            current_html = props.get("render", "")
        else:
            current_html = getattr(props, "render", "")

        if not current_html:
            logger.debug(f"[edit_all_slides] Slide {slide_id} CustomComponent has no HTML, skipping")
            continue

        slides_to_process.append((i, slide_id, custom_comp))

    logger.info(f"[edit_all_slides] Processing {len(slides_to_process)} slides with CustomComponents")

    def process_single_slide(args_tuple):
        """Process a single slide - called in parallel."""
        import time
        idx, slide_id, custom_comp = args_tuple
        start_time = time.time()
        logger.info(f"[edit_all_slides] 🚀 STARTING slide {idx+1}/{len(slides_to_process)}: {slide_id}")
        try:
            # Call the targeted edit function which handles AI replacement
            slide_diff = _targeted_custom_component_edit(
                slide_id=slide_id,
                custom_component=custom_comp,
                instruction=instruction,
                deck_data=deck_data,
                attachments=None,  # No per-slide attachments for batch edits
            )

            elapsed = time.time() - start_time
            # Extract the component update from the returned DeckDiff
            if slide_diff and hasattr(slide_diff, 'deck_diff'):
                inner = slide_diff.deck_diff
                if hasattr(inner, 'slides_to_update') and inner.slides_to_update:
                    logger.info(f"[edit_all_slides] ✅ FINISHED slide {idx+1}/{len(slides_to_process)}: {slide_id} ({elapsed:.1f}s)")
                    return inner.slides_to_update
            logger.info(f"[edit_all_slides] ⚠️ No updates for slide {slide_id} ({elapsed:.1f}s)")
            return []
        except Exception as e:
            elapsed = time.time() - start_time
            logger.warning(f"[edit_all_slides] ❌ FAILED slide {slide_id} ({elapsed:.1f}s): {e}")
            return []

    # Process all slides in parallel using ThreadPoolExecutor
    # All slides start at once - no cap on workers
    import time
    batch_start = time.time()
    all_slides_to_update = []
    max_workers = len(slides_to_process)  # All slides at once

    logger.info(f"[edit_all_slides] 🏁 Starting parallel processing with {max_workers} workers for {len(slides_to_process)} slides")

    with concurrent.futures.ThreadPoolExecutor(max_workers=max_workers) as executor:
        # Submit all tasks
        future_to_slide = {
            executor.submit(process_single_slide, args_tuple): args_tuple
            for args_tuple in slides_to_process
        }

        # Collect results as they complete
        for future in concurrent.futures.as_completed(future_to_slide):
            slide_updates = future.result()
            if slide_updates:
                all_slides_to_update.extend(slide_updates)

    batch_elapsed = time.time() - batch_start
    logger.info(f"[edit_all_slides] 🏆 BATCH COMPLETE: {len(all_slides_to_update)}/{len(slides)} slides updated in {batch_elapsed:.1f}s total")

    return DeckDiff(DeckDiffBase(slides_to_update=all_slides_to_update))
