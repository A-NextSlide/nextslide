"""Custom component edit helpers for slide tools."""

import os
from typing import Any, Dict, List, Optional
import asyncio
import logging
import uuid
from datetime import datetime, timezone

from models.deck import DeckDiff, DeckDiffBase
from models.component import ComponentDiffBase
from models.registry import ComponentRegistry
from agents.config import CUSTOM_COMPONENT_EDIT_MODEL, IMAGE_SEARCH_MODEL
from agents.editing.tools.async_utils import run_async
from agents.editing.tools.llm_utils import get_model_and_client, invoke_with_fallback
from agents.editing.tools.slide_tool_debug import _dbg
from agents.editing.tools.slide_tool_helpers import (
    _build_attachment_context,
    _build_chat_context,
    _detect_slide_mode_from_html,
    _extract_slide_content_for_redesign,
    _gather_reference_images,
    _build_uploaded_media_from_attachments,
)
from agents.editing.tools.slide_tool_models import _ReplacePlan
from agents.editing.tools.struct_utils import get_attr as _get_attr
from agents.editing.tools.fuzzy_matcher import apply_replacement

logger = logging.getLogger(__name__)

# Debug mode - set to True to save HTML/screenshots to /tmp for debugging
DEBUG_SAVE_FILES = os.environ.get("DEBUG_SLIDE_EDIT", "").lower() == "true"


def _extract_relevant_context(html: str, instruction: str, max_chars: int = 8000) -> str:
    """
    Extract relevant portions of HTML based on the instruction type.

    Instead of sending 20k+ chars to the LLM, extract only the relevant sections:
    - For color edits: CSS and inline styles
    - For text edits: Text nodes with context
    - For size edits: Size-related CSS
    - Default: Truncate smartly (head + key sections)

    Returns ~2-8k chars of relevant context.
    """
    import re

    instruction_lower = instruction.lower()

    # Always extract :root CSS variables (small, critical for theming)
    root_match = re.search(r':root\s*\{[^}]+\}', html, re.DOTALL)
    root_css = root_match.group(0) if root_match else ""

    # Extract all style blocks
    style_matches = re.findall(r'<style[^>]*>(.*?)</style>', html, re.DOTALL | re.IGNORECASE)
    all_styles = "\n".join(style_matches)

    # Detect edit type from instruction
    is_color_edit = any(word in instruction_lower for word in [
        'color', 'red', 'blue', 'green', 'yellow', 'purple', 'pink', 'orange',
        'black', 'white', 'grey', 'gray', '#', 'rgb', 'hsl', 'background', 'bg'
    ])

    is_size_edit = any(word in instruction_lower for word in [
        'size', 'bigger', 'smaller', 'large', 'small', 'font', 'scale',
        'width', 'height', 'padding', 'margin', 'massive', 'huge', 'tiny'
    ])

    is_text_edit = any(word in instruction_lower for word in [
        'text', 'title', 'change to', 'update', 'rename', 'heading',
        'subtitle', 'label', 'word', 'typo', 'fix the'
    ])

    is_svg_edit = any(word in instruction_lower for word in [
        'svg', 'path', 'arrow', 'icon', 'shape', 'vector', 'curve'
    ])

    context_parts = []

    # Always include root CSS if present
    if root_css:
        context_parts.append(f"/* :root CSS */\n{root_css}")

    if is_color_edit:
        # For color edits, include all CSS (usually smaller) + relevant HTML snippets
        context_parts.append(f"/* All Styles ({len(all_styles)} chars) */\n{all_styles[:6000]}")
        # Find inline styles
        inline_styles = re.findall(r'style="[^"]*(?:color|background|fill|stroke)[^"]*"', html, re.IGNORECASE)
        if inline_styles:
            context_parts.append(f"/* Inline Styles */\n{chr(10).join(inline_styles[:20])}")

    elif is_size_edit or is_svg_edit:
        # For size/SVG edits, include styles and SVG elements
        context_parts.append(f"/* All Styles */\n{all_styles[:4000]}")
        # Find SVG elements
        svg_matches = re.findall(r'<svg[^>]*>.*?</svg>', html, re.DOTALL | re.IGNORECASE)
        if svg_matches:
            for i, svg in enumerate(svg_matches[:3]):  # Max 3 SVGs
                context_parts.append(f"/* SVG {i+1} */\n{svg[:2000]}")
        # Find size-related inline styles
        size_styles = re.findall(r'(?:class|style)="[^"]*(?:font-size|width|height|scale|transform)[^"]*"', html, re.IGNORECASE)
        if size_styles:
            context_parts.append(f"/* Size Styles */\n{chr(10).join(size_styles[:15])}")

    elif is_text_edit:
        # For text edits, extract text content with surrounding context
        context_parts.append(f"/* Styles (truncated) */\n{all_styles[:2000]}")
        # Find text elements: headings, paragraphs, spans with text
        text_patterns = [
            r'<h[1-6][^>]*>.*?</h[1-6]>',
            r'<p[^>]*>.*?</p>',
            r'<span[^>]*>[^<]{3,}</span>',
            r'<div[^>]*class="[^"]*(?:title|heading|text)[^"]*"[^>]*>.*?</div>',
        ]
        text_elements = []
        for pattern in text_patterns:
            text_elements.extend(re.findall(pattern, html, re.DOTALL | re.IGNORECASE)[:10])
        if text_elements:
            context_parts.append(f"/* Text Elements */\n{chr(10).join(text_elements[:15])}")

    # Combine context parts
    context = "\n\n".join(context_parts)

    # If we got good context, use it; otherwise fall back to smart truncation
    if len(context) > 500:
        # Ensure we don't exceed max
        if len(context) > max_chars:
            context = context[:max_chars] + "\n/* ... truncated ... */"
        return context

    # Fallback: Smart truncation - keep head and relevant body sections
    # Extract head (usually contains styles)
    head_match = re.search(r'<head[^>]*>.*?</head>', html, re.DOTALL | re.IGNORECASE)
    head = head_match.group(0) if head_match else ""

    # Get body content
    body_match = re.search(r'<body[^>]*>(.*?)</body>', html, re.DOTALL | re.IGNORECASE)
    body = body_match.group(1) if body_match else html

    # Combine with smart truncation
    if len(head) + len(body) <= max_chars:
        return html

    # Keep head and truncate body
    remaining = max_chars - len(head) - 200
    return f"{head}\n<body>\n{body[:remaining]}\n/* ... body truncated ... */\n</body>"


# Logo.dev service for company logos
try:
    from agents.tools.theme.logodev_service import LogoDevService
    LOGODEV_AVAILABLE = True
except ImportError:
    LOGODEV_AVAILABLE = False
    logger.debug("[SLIDE_TOOLS] Logo.dev service not available")


# =============================================================================
# LOGO PRE-FETCHING FOR EDITING (AI-based)
# =============================================================================

async def _extract_company_names_with_ai(instruction: str) -> List[str]:
    """
    Use AI to extract company/brand names from a user instruction.
    Returns a list of company names that should have logos fetched.
    """
    if not instruction or len(instruction.strip()) < 5:
        return []

    try:
        from agents.ai.clients import get_client, invoke

        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        prompt = f"""Extract company/brand names from this instruction that would need logos.

INSTRUCTION: "{instruction}"

If the user mentions companies, brands, or organizations that would typically have logos, list them.
Examples:
- "add a customer section with Apple, Google, and Microsoft" → Apple, Google, Microsoft
- "show our partners: Stripe, Shopify, AWS" → Stripe, Shopify, AWS
- "trusted by Netflix, Spotify, and Uber" → Netflix, Spotify, Uber
- "make the background blue" → (none)
- "add a chart showing revenue" → (none)

Respond with ONLY a comma-separated list of company names, or "NONE" if no companies mentioned.
Do not include generic terms like "company", "brand", "customer", "partner"."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            100,
            0.0
        )

        result = str(response).strip()

        if result.upper() == "NONE" or not result:
            return []

        # Parse comma-separated list
        companies = [c.strip() for c in result.split(",") if c.strip()]
        # Filter out generic terms
        generic = {"company", "brand", "customer", "partner", "client", "logo", "none"}
        companies = [c for c in companies if c.lower() not in generic and len(c) > 1]

        if companies:
            logger.info(f"[SLIDE_TOOLS] AI extracted {len(companies)} companies: {companies}")

        return companies[:10]  # Limit to 10 companies

    except Exception as e:
        logger.warning(f"[SLIDE_TOOLS] AI company extraction failed: {e}")
        return []


async def _prefetch_company_logos(company_names: List[str]) -> Dict[str, str]:
    """
    Pre-fetch logos for a list of company names from logo.dev.
    Returns a dict of {propName: url} for use in HTML generation.
    """
    if not company_names or not LOGODEV_AVAILABLE:
        return {}

    prefetched: Dict[str, str] = {}

    async def fetch_one(company: str) -> Optional[tuple]:
        try:
            from services.image_storage_service import ImageStorageService

            async with LogoDevService() as logo_service:
                result = await logo_service.get_logo_with_fallback(company)

                if not result.get('available') or not result.get('logo_url'):
                    logger.debug(f"[SLIDE_TOOLS] No logo found for: {company}")
                    return None

                logo_url = result['logo_url']

                # Upload to our storage
                async with ImageStorageService() as storage:
                    upload_result = await storage.upload_image_from_url(
                        logo_url,
                        metadata={"source": "logodev", "company": company}
                    )
                    if upload_result and upload_result.get('url'):
                        # Create a prop name from company name
                        prop_name = company.lower().replace(" ", "").replace(".", "") + "Logo"
                        return (prop_name, upload_result['url'], company)

        except Exception as e:
            logger.warning(f"[SLIDE_TOOLS] Logo fetch failed for {company}: {e}")
        return None

    # Fetch all logos in parallel
    tasks = [fetch_one(company) for company in company_names]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple) and len(result) == 3:
            prop_name, url, company = result
            prefetched[prop_name] = url
            prefetched[f"{prop_name}_query"] = f"{company} logo"
            logger.info(f"[SLIDE_TOOLS] Pre-fetched logo for {company}")

    if prefetched:
        logo_count = len([k for k in prefetched if not k.endswith("_query")])
        logger.info(f"[SLIDE_TOOLS] Pre-fetched {logo_count} company logos")

    return prefetched


async def _extract_multi_image_requirements(instruction: str, current_html: str) -> List[str]:
    """
    Use AI to extract multiple image requirements for interactive scenarios.

    For example, if the instruction says "fix the buttons so each shows its own club image"
    and the HTML has buttons for "lob wedge", "driver", "7 iron", etc., this will
    return ["lob wedge golf club", "driver golf club", "7 iron golf club", ...].
    """
    if not instruction or len(instruction.strip()) < 5:
        return []

    # Quick heuristic: check if this looks like a multi-image interactive fix
    instruction_lower = instruction.lower()
    multi_image_keywords = [
        "each button", "each one", "different image", "own image", "respective",
        "fix the button", "fix click", "each shows", "each display", "when clicked"
    ]
    if not any(kw in instruction_lower for kw in multi_image_keywords):
        return []

    try:
        from agents.ai.clients import get_client, invoke

        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        # Extract button/tab labels from HTML
        import re
        button_texts = []

        # Invalid/placeholder text to skip
        skip_texts = {
            "none", "n/a", "na", "null", "undefined", "placeholder", "click", "button",
            "submit", "cancel", "close", "ok", "yes", "no", "true", "false", "image",
            "loading", "...", "→", "←", "×", "x", "+", "-"
        }

        def is_valid_label(text: str) -> bool:
            """Check if text is a valid button label worth searching for."""
            if not text or len(text) < 2 or len(text) > 50:
                return False
            text_lower = text.lower().strip()
            if text_lower in skip_texts:
                return False
            # Skip if it's just numbers or punctuation
            if text.isdigit() or not any(c.isalpha() for c in text):
                return False
            return True

        # Find button text content
        for match in re.findall(r'<button[^>]*>([^<]+)</button>', current_html, re.IGNORECASE):
            text = match.strip()
            if is_valid_label(text):
                button_texts.append(text)

        # Find data-label or data-club type attributes
        for match in re.findall(r'data-(?:label|club|item|name)=["\']([^"\']+)["\']', current_html, re.IGNORECASE):
            text = match.strip()
            if is_valid_label(text):
                button_texts.append(text)

        # Find tab labels
        for match in re.findall(r'<(?:span|div)[^>]*class=["\'][^"\']*(?:tab|label|name)[^"\']*["\'][^>]*>([^<]+)<', current_html, re.IGNORECASE):
            text = match.strip()
            if is_valid_label(text):
                button_texts.append(text)

        button_texts = list(dict.fromkeys(button_texts))  # Remove duplicates, preserve order

        if not button_texts:
            return []

        logger.info(f"[SLIDE_TOOLS] Found button/tab labels in HTML: {button_texts}")

        prompt = f"""The user wants to fix interactive buttons so each shows its own image.

INSTRUCTION: "{instruction}"

BUTTON/TAB LABELS FOUND IN HTML:
{chr(10).join(f'- {t}' for t in button_texts[:10])}

For EACH label, generate a SHORT image search query (2-5 words) that would find a good image.
Focus on the item being shown, not "button" or "icon".

Examples:
- "Lob Wedge" → "lob wedge golf club"
- "Driver" → "golf driver club"
- "7 Iron" → "7 iron golf club"
- "Tesla" → "Tesla electric car"
- "iPhone" → "iPhone smartphone"

Respond with ONLY a comma-separated list of search queries, one per button label.
If some labels don't need images, skip them."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{"role": "user", "content": prompt}],
            None,
            200,
            0.0
        )

        result = str(response).strip()

        if not result or result.upper() == "NONE":
            return []

        # Parse comma-separated list
        queries = [q.strip() for q in result.split(",") if q.strip()]

        # Filter out invalid queries
        invalid_terms = {"none", "n/a", "na", "skip", "null", "undefined", "placeholder", "image", "photo", "picture"}
        queries = [
            q for q in queries
            if len(q) > 2 and len(q) < 60 and q.lower() not in invalid_terms
        ]

        if queries:
            logger.info(f"[SLIDE_TOOLS] AI extracted {len(queries)} image queries: {queries}")

        return queries[:10]  # Limit to 10 images

    except Exception as e:
        logger.warning(f"[SLIDE_TOOLS] AI multi-image extraction failed: {e}")
        return []


async def _prefetch_multi_images(queries: List[str], context: str = "") -> Dict[str, str]:
    """
    Pre-fetch images for multiple search queries.
    Returns a dict of {propName: url} for use in HTML generation.
    """
    if not queries:
        return {}

    prefetched: Dict[str, str] = {}

    async def fetch_one(query: str, index: int) -> Optional[tuple]:
        try:
            from services.serpapi_service import SerpAPIService
            from services.image_storage_service import ImageStorageService

            # Add context to query if provided
            search_query = f"{query} {context}".strip() if context else query

            async with SerpAPIService() as serpapi:
                results = await serpapi.search_images(search_query, per_page=1)

                if not results:
                    logger.debug(f"[SLIDE_TOOLS] No image found for: {query}")
                    return None

                image_url = results[0].get("original") or results[0].get("thumbnail")
                if not image_url:
                    return None

                # Upload to our storage
                async with ImageStorageService() as storage:
                    upload_result = await storage.upload_image_from_url(
                        image_url,
                        metadata={"source": "multi_image_prefetch", "query": query}
                    )
                    if upload_result and upload_result.get('url'):
                        # Create a prop name from query
                        prop_name = f"image_{index}_{query.lower().replace(' ', '_')[:20]}"
                        return (prop_name, upload_result['url'], query)

        except Exception as e:
            logger.warning(f"[SLIDE_TOOLS] Multi-image fetch failed for {query}: {e}")
        return None

    # Fetch all images in parallel
    tasks = [fetch_one(query, i) for i, query in enumerate(queries)]
    results = await asyncio.gather(*tasks, return_exceptions=True)

    for result in results:
        if isinstance(result, tuple) and len(result) == 3:
            prop_name, url, query = result
            prefetched[prop_name] = url
            prefetched[f"{prop_name}_query"] = query
            logger.info(f"[SLIDE_TOOLS] Pre-fetched image for '{query}'")

    if prefetched:
        image_count = len([k for k in prefetched if not k.endswith("_query")])
        logger.info(f"[SLIDE_TOOLS] Pre-fetched {image_count} images for interactive elements")

    return prefetched


def _current_date_note() -> str:
    """Return a short current-date note for prompt grounding."""
    return f"CURRENT DATE (UTC): {datetime.now(timezone.utc).strftime('%Y-%m-%d')}"


def _generate_full_bleed_custom_component(
    slide_id: str,
    instruction: str,
    deck_data: Dict,
    current_slide: Dict,
    attachments: List[Dict] = None,
    use_attachments: bool = False,
    available_videos: List[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    """
    Generate a full-bleed CustomComponent via CustomComponentGenerator (same quality path as generation).
    Returns a normalized component dict {id,type,props}.
    """
    from agents.generation.custom_component_generator import CustomComponentGenerator

    theme = (deck_data or {}).get("theme") or {}
    colors = theme.get("color_palette") or theme.get("colors") or {}
    reference_images = _gather_reference_images("", attachments)
    uploaded_media = _build_uploaded_media_from_attachments(attachments or []) if use_attachments else None

    gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
    slide_context = {
        "title": _get_attr(current_slide, "title", "") or (deck_data or {}).get("name") or "Slide",
        "slide_index": 0,
        "total_slides": len((deck_data or {}).get("slides") or []) or 1,
        "slide_type": "content",
        "is_full_slide": True,
        "presentation_context": (deck_data or {}).get("name") or "",
        "background_color": (colors.get("primary_background") if isinstance(colors, dict) else None),
        "use_uploaded_images": use_attachments,
    }

    # Extract actual slide content - DO NOT pass user instructions as content
    actual_content = _extract_slide_content_for_redesign(current_slide)

    uploads_note = ""
    if use_attachments and attachments:
        uploads_note = "\n\nUPLOADS: Use the attached images as real assets in this redesign."

    # Pre-fetch company logos mentioned in the instruction (AI-based extraction)
    prefetched_logos: Dict[str, str] = {}
    if LOGODEV_AVAILABLE:
        try:
            company_names = run_async(_extract_company_names_with_ai(instruction))
            if company_names:
                prefetched_logos = run_async(_prefetch_company_logos(company_names))
        except Exception as e:
            logger.warning(f"[_generate_full_bleed] Logo pre-fetch failed: {e}")

    # Build logo context for the prompt
    logo_context = ""
    if prefetched_logos:
        logo_entries = []
        for key, url in prefetched_logos.items():
            if not key.endswith("_query"):
                company = prefetched_logos.get(f"{key}_query", key).replace(" logo", "")
                logo_entries.append(f"- {company}: {url}")
        if logo_entries:
            logo_context = "\n\nAVAILABLE COMPANY LOGOS (use these exact URLs):\n" + "\n".join(logo_entries)

    generated = run_async(
        gen.generate(
            content=f"""REDESIGN REQUEST: {instruction}{uploads_note}{logo_context}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- If reference images are provided, match their layout/style and transcribe any visible text the user asks to use exactly.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- Base the slide content on the EXISTING SLIDE CONTENT above, but DO honor explicit user requests to add/remove elements (e.g., add a video, remove cards).
- If company logos are listed above, use the EXACT URLs provided - do not use placeholder URLs for those logos.""",
            theme=theme if isinstance(theme, dict) else {},
            slide_context=slide_context,
            component_purpose="visualize",
            width=1920,
            height=1080,
            position={"x": 0, "y": 0},
            reference_images=reference_images or None,
            uploaded_media=uploaded_media,
            available_videos=available_videos,
            prefetched_images=prefetched_logos if prefetched_logos else None,
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
    task: str = "validation",
    slide_screenshot: Dict = None,
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

    # Log which slide/component we're editing for debugging
    logger.info(f"[TARGETED_EDIT] slide_id={slide_id}, component_id={comp_id}, html_len={len(current_html)}")

    # Save files for debugging (only if DEBUG_SAVE_FILES is enabled)
    if DEBUG_SAVE_FILES:
        try:
            with open("/tmp/slide_html_debug.html", "w") as f:
                f.write(current_html)
            logger.info(f"[TARGETED_EDIT] Saved HTML to /tmp/slide_html_debug.html")
        except Exception as e:
            logger.warning(f"[TARGETED_EDIT] Failed to save HTML: {e}")

    # Extract only relevant HTML context based on instruction (reduces from 20k to 2-8k)
    relevant_html = _extract_relevant_context(current_html, instruction, max_chars=8000)
    logger.info(f"[TARGETED_EDIT] Context: {len(current_html)} -> {len(relevant_html)} chars ({instruction[:50]})")

    # Build a concise, focused prompt
    prompt = f"""User request: "{instruction}"

RULES:
1. Find the EXACT string in HTML that needs to change
2. NEVER use empty new_string - always provide a replacement
3. For SVG sizing: use CSS transform (scale), NOT viewBox changes
4. For large visuals: they're usually SVG paths, not small text labels
5. Copy old_string EXACTLY (including quotes, whitespace)
6. KEEP REPLACEMENTS SMALL - find the SMALLEST string that needs to change
   - Instead of replacing entire <button>...</button>, replace just the specific attribute or text
   - For image src changes: replace just the src="..." part
   - For text changes: replace just the text content
   - For attribute changes: replace just the attribute="value" part
7. MAX 500 chars per old_string/new_string - if larger, break into multiple smaller ops

HTML CONTEXT:
{relevant_html}

FULL HTML AVAILABLE FOR EXACT MATCHING:
{current_html[:12000]}

Return JSON: {{"ops":[{{"old_string":"exact","new_string":"replacement"}}],"note":"what changed"}}"""

    # Build message with screenshot if available
    screenshot_data = None
    if slide_screenshot and slide_screenshot.get("data"):
        screenshot_data = f"data:{slide_screenshot.get('media_type', 'image/jpeg')};base64,{slide_screenshot['data']}"
        logger.info("[TARGETED_EDIT] Using slide_screenshot for visual context")

        # Save screenshot for debugging (only if DEBUG_SAVE_FILES is enabled)
        if DEBUG_SAVE_FILES:
            import base64
            try:
                img_data = base64.b64decode(slide_screenshot['data'])
                with open("/tmp/slide_screenshot_debug.jpg", "wb") as f:
                    f.write(img_data)
                logger.info("[TARGETED_EDIT] Saved screenshot to /tmp/slide_screenshot_debug.jpg")
            except Exception as e:
                logger.warning(f"[TARGETED_EDIT] Failed to save screenshot: {e}")

    user_content = []
    if screenshot_data:
        user_content.append({"type": "image_url", "image_url": {"url": screenshot_data}})
    user_content.append({"type": "text", "text": prompt})

    client, model = get_model_and_client(task, log_prefix="SLIDE_TOOLS")
    try:
        plan = invoke_with_fallback(
            client=client,
            model=model,
            messages=[
                {"role": "system", "content": "You are an HTML editor that ONLY outputs JSON. Look at the image to understand what element the user is referring to."},
                {"role": "user", "content": user_content if screenshot_data else prompt}
            ],
            response_model=_ReplacePlan,
            max_tokens=16000,  # Increased from 8000 to handle larger HTML replacements
            temperature=0.1,  # Very low temperature for reliable structured output
            log_prefix="SLIDE_TOOLS",
        )
    except Exception as e:
        # SLIDE-BACKEND-28B: Handle LLM failures gracefully
        logger.warning(f"[SLIDE_TOOLS] LLM failed to generate edit plan: {e}")
        plan = _ReplacePlan(ops=[], note=f"LLM error: {str(e)[:100]}")

    # Log what the LLM proposed
    for i, op in enumerate(plan.ops or []):
        logger.info(f"[TARGETED_EDIT] Proposed: '{op.old_string[:80]}' -> '{(op.new_string or '')[:80]}'")

    _dbg(
        "B",
        "slide_tools.py:_targeted_custom_component_edit",
        "replace_plan",
        {"slide_id": slide_id, "component_id": comp_id, "ops": len(plan.ops), "note": plan.note[:200]},
        runId="pre-fix",
    )

    # Safeguard: Reject dangerous changes
    def _is_dangerous_change(old_str: str, new_str: str, instruction_text: str = "") -> tuple[bool, str]:
        """Check if a change is likely to break the slide or be wrong."""
        import re
        old_lower = old_str.lower()
        instruction_lower = instruction_text.lower()

        # CRITICAL: Block empty string deletions (model was deleting CSS rules!)
        if new_str == "" or new_str.strip() == "":
            # Check if this is a CSS block deletion
            if re.search(r'\{[^}]*\}', old_str):
                return True, "Rejecting deletion of CSS rule - use replacement not deletion"
            # Block large deletions without replacement
            if len(old_str) > 50:
                return True, f"Rejecting large deletion ({len(old_str)} chars) without replacement"

        # Block viewBox changes (they affect ALL SVG elements, not just the target)
        # Only block if the viewBox value is actually being modified, not just present
        if 'viewbox' in old_lower:
            old_viewboxes = re.findall(r'viewbox\s*=\s*["\']([^"\']*)["\']', old_lower)
            new_viewboxes = re.findall(r'viewbox\s*=\s*["\']([^"\']*)["\']', new_str.lower())
            if old_viewboxes != new_viewboxes:
                return True, "Rejecting viewBox change - use CSS transform on specific element instead"

        # Reject changes to very large font-sizes (decorative text)
        font_match = re.search(r'font-size:\s*(\d+)px', old_lower)
        if font_match:
            size = int(font_match.group(1))
            if size >= 100:
                return True, f"Rejecting change to decorative font-size ({size}px)"
            # If user says "massive", "huge", "big" - don't change small fonts (they're labels!)
            if size < 50 and any(word in instruction_lower for word in ['massive', 'huge', 'big', 'giant', 'enormous']):
                return True, f"Rejecting change to small label font-size ({size}px) - user said element is 'massive' so it's not this"

        # Reject changes to body/html dimensions
        if '1920px' in old_str or '1080px' in old_str:
            return True, "Rejecting change to slide dimensions"

        # Reject changes to :root CSS variable definitions (not CSS rules that USE variables)
        # Only block if actually changing the :root block or replacing var(--x) with var(--y)
        if ':root' in old_str and ':root' in new_str:
            # Actually modifying :root block - block this
            return True, "Rejecting change to :root CSS variables"

        # Block replacing var(--x) with var(--y) (changing which variable is used)
        # But allow changes to other properties in the same CSS rule
        old_vars = re.findall(r'var\(--[^)]+\)', old_str)
        new_vars = re.findall(r'var\(--[^)]+\)', new_str)
        if old_vars != new_vars:
            # Check if ALL other content is the same (i.e., ONLY the var() changed)
            old_without_vars = re.sub(r'var\(--[^)]+\)', '', old_str)
            new_without_vars = re.sub(r'var\(--[^)]+\)', '', new_str)
            if old_without_vars.strip() == new_without_vars.strip():
                return True, "Rejecting change to CSS variable references"

        return False, ""

    # Apply ops
    new_html = current_html
    applied = 0
    failed_ops = []
    for op in (plan.ops or [])[:3]:
        if not op.old_string:
            continue

        # Safety check
        is_dangerous, danger_reason = _is_dangerous_change(op.old_string, op.new_string or "", instruction)
        if is_dangerous:
            logger.warning(f"[TARGETED_EDIT] BLOCKED: {danger_reason}")
            logger.warning(f"[TARGETED_EDIT] Would have changed: '{op.old_string[:80]}'")
            continue

        success, updated_html, note = apply_replacement(new_html, op.old_string, op.new_string or "")
        if not success:
            logger.warning(f"[TARGETED_EDIT] NOT FOUND: '{op.old_string[:100]}'")
            _dbg(
                "B",
                "slide_tools.py:_targeted_custom_component_edit",
                "old_string_missing",
                {"missing_preview": op.old_string[:120], "component_id": comp_id, "note": note},
                runId="pre-fix",
            )
            failed_ops.append(op)
            continue  # Try remaining ops instead of breaking
        logger.info(f"[TARGETED_EDIT] SUCCESS: applied replacement")
        new_html = updated_html
        applied += 1

    if applied == 0 and failed_ops:
        # RETRY with raw HTML
        retry_prompt = f"""Previous old_string NOT found. Copy EXACTLY from HTML.

REQUEST: {instruction}

FAILED: {failed_ops[0].old_string[:150] if failed_ops else ''}

HTML:
{current_html[:15000]}

JSON: {{"ops":[{{"old_string":"exact from HTML","new_string":"replacement"}}],"note":"what"}}"""

        try:
            retry_plan = invoke_with_fallback(
                client=client,
                model=model,
                messages=[
                    {"role": "system", "content": "You are an HTML editor that ONLY outputs JSON. Never output code, explanations, or markdown - only valid JSON objects."},
                    {"role": "user", "content": retry_prompt}
                ],
                response_model=_ReplacePlan,
                max_tokens=16000,  # Increased from 8000 to handle larger HTML replacements
                temperature=0.1,  # Very low temperature for reliable structured output
                log_prefix="SLIDE_TOOLS",
            )
        except Exception as e:
            # SLIDE-BACKEND-28B: Handle LLM failures gracefully
            logger.warning(f"[SLIDE_TOOLS] LLM retry failed: {e}")
            retry_plan = _ReplacePlan(ops=[], note=f"LLM retry error: {str(e)[:100]}")

        # Try retry ops
        for op in (retry_plan.ops or [])[:3]:
            if not op.old_string:
                continue
            success, updated_html, _note = apply_replacement(new_html, op.old_string, op.new_string or "")
            if success:
                new_html = updated_html
                applied += 1

        _dbg(
            "B",
            "slide_tools.py:_targeted_custom_component_edit",
            "retry_result",
            {"applied_after_retry": applied, "component_id": comp_id},
            runId="pre-fix",
        )

    if applied == 0:
        # Still no matches - return observation so the orchestrator can retry or pick a rewrite tool
        logger.warning(
            "[TARGETED_EDIT] ⚠️ NO CHANGES APPLIED for instruction: %s",
            instruction[:120],
        )
        logger.warning("[TARGETED_EDIT] ⚠️ Proposed %d ops, all failed or were blocked", len(plan.ops or []))
        for i, op in enumerate((plan.ops or [])[:3]):
            logger.warning("[TARGETED_EDIT] ⚠️ Op %d: old='%s...' new='%s...'", i, op.old_string[:80], (op.new_string or '')[:80])
        dd = DeckDiff(DeckDiffBase())
        obs = {
            "error": "custom_component_str_replace_failed",
            "component_id": comp_id,
            "instruction": instruction,
            "html_preview": current_html[:2000],
            "failed_old_strings": [op.old_string[:200] for op in (failed_ops or [])[:3] if op.old_string],
        }
        try:
            setattr(dd, "observation", obs)
        except Exception:
            pass
        return dd

    # Upload any external image URLs to our bucket
    try:
        from agents.generation.custom_component_image_pipeline import upload_external_urls_to_bucket
        new_html = run_async(upload_external_urls_to_bucket(new_html))
        logger.info("[TARGETED_EDIT] Uploaded external URLs to bucket")
    except Exception as e:
        logger.warning(f"[TARGETED_EDIT] Failed to upload external URLs: {e}")

    # Resolve any remaining placeholder images (src="placeholder" with alt text)
    try:
        from agents.generation.custom_component_image_pipeline import resolve_remaining_placeholders
        new_html = run_async(resolve_remaining_placeholders(new_html))
        logger.info("[TARGETED_EDIT] Resolved remaining placeholders in HTML")
    except Exception as e:
        logger.warning(f"[TARGETED_EDIT] Failed to resolve remaining placeholders: {e}")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        comp_id,
        ComponentDiffBase(id=comp_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg(
        "B",
        "slide_tools.py:_targeted_custom_component_edit",
        "applied_replace_ops",
        {"applied": applied, "old_len": len(current_html), "new_len": len(new_html)},
        runId="pre-fix",
    )
    return deck_diff


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
    use_attachments = bool(args.get("use_attachments"))
    available_videos = args.get("available_videos")
    if not isinstance(available_videos, list):
        available_videos = None

    components = _get_attr(current_slide, "components", []) or []
    custom_component = next((c for c in components if _get_attr(c, "id") == component_id), None)
    if not custom_component:
        custom_component = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
    if not custom_component:
        raise ValueError("CustomComponent not found for rewrite")

    logger.info("[custom_component_rewrite] Rewriting custom component")

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

    # Preserve the existing slide theme from current HTML (source of truth for rewrites).
    from agents.editing.tools.html_utils import (
        apply_theme_to_custom_component_html,
        extract_theme_from_custom_component_html,
    )
    current_theme_colors, current_theme_typography = extract_theme_from_custom_component_html(
        current_html,
        props if isinstance(props, dict) else {},
    )
    preserve_colors = dict(colors) if isinstance(colors, dict) else {}
    preserve_colors.update(current_theme_colors or {})
    preserve_typography = dict(typography) if isinstance(typography, dict) else {}
    preserve_typography.update(current_theme_typography or {})

    slide_mode = _detect_slide_mode_from_html(current_html)

    # Gather ALL reference images (we embed a few as multimodal, but include all URLs in text context)
    reference_images = _gather_reference_images(current_html, attachments)
    uploaded_media = _build_uploaded_media_from_attachments(attachments or []) if use_attachments else None

    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
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
            "use_uploaded_images": use_attachments,
        }
        theme_for_gen = dict(theme) if isinstance(theme, dict) else {}
        if preserve_colors:
            merged_palette = {}
            if isinstance(theme_for_gen.get("color_palette"), dict):
                merged_palette.update(theme_for_gen.get("color_palette") or {})
            elif isinstance(theme_for_gen.get("colors"), dict):
                merged_palette.update(theme_for_gen.get("colors") or {})
            merged_palette.update(preserve_colors)
            theme_for_gen["color_palette"] = merged_palette
        if preserve_typography:
            merged_typography = {}
            if isinstance(theme_for_gen.get("typography"), dict):
                merged_typography.update(theme_for_gen.get("typography") or {})
            merged_typography.update(preserve_typography)
            theme_for_gen["typography"] = merged_typography

        theme_lock_context = ""
        if preserve_colors or preserve_typography:
            theme_lines = [
                "\n\nKEEP THE SAME EXISTING THEME (DO NOT CHANGE IT):",
                "- Preserve the exact color palette and typography from the current slide.",
            ]
            if preserve_colors:
                color_pairs = [f"{k}={v}" for k, v in preserve_colors.items()]
                theme_lines.append("- Locked colors: " + ", ".join(color_pairs[:10]))
            if preserve_typography:
                heading = None
                body = None
                if isinstance(preserve_typography.get("heading"), dict):
                    heading = preserve_typography.get("heading", {}).get("family")
                elif isinstance(preserve_typography.get("heading"), str):
                    heading = preserve_typography.get("heading")
                if isinstance(preserve_typography.get("body"), dict):
                    body = preserve_typography.get("body", {}).get("family")
                elif isinstance(preserve_typography.get("body"), str):
                    body = preserve_typography.get("body")
                if heading or body:
                    theme_lines.append(f"- Locked fonts: heading={heading or 'unchanged'}, body={body or 'unchanged'}")
            theme_lock_context = "\n".join(theme_lines)
        # Include all attachment URLs in the prompt text so the model can infer intent without UI buttons.
        attachment_context = _build_attachment_context(
            attachments,
            "FILES (infer intent; if user says 'use this' and images exist, treat as primary reference and recreate):",
        )

        # Build chat context string (chronological: oldest first, newest last)
        chat_context, chat_count = _build_chat_context(chat_history, max_messages=10)
        if chat_count:
            logger.info(
                f"[custom_component_rewrite] Including {chat_count} chat messages as context (chronological order)"
            )

        # Extract actual content from existing HTML - DO NOT pass user instructions as content
        actual_content = _extract_slide_content_for_redesign(current_slide, current_html)

        uploads_note = ""
        if use_attachments and attachments:
            uploads_note = "\n\nUPLOADS: Use the attached images as real assets in this redesign."

        # Pre-fetch company logos mentioned in the instruction (AI-based extraction)
        prefetched_logos: Dict[str, str] = {}
        if LOGODEV_AVAILABLE:
            try:
                company_names = run_async(_extract_company_names_with_ai(instruction))
                if company_names:
                    prefetched_logos = run_async(_prefetch_company_logos(company_names))
                    if prefetched_logos:
                        logo_count = len([k for k in prefetched_logos if not k.endswith("_query")])
                        logger.info(f"[custom_component_rewrite] Pre-fetched {logo_count} company logos for rewrite")
            except Exception as e:
                logger.warning(f"[custom_component_rewrite] Logo pre-fetch failed: {e}")

        # Pre-fetch images for multi-image interactive scenarios (e.g., buttons that show different images)
        prefetched_multi_images: Dict[str, str] = {}
        try:
            multi_image_queries = run_async(_extract_multi_image_requirements(instruction, current_html))
            if multi_image_queries:
                # Get context from slide title or deck name
                search_context = _get_attr(current_slide, "title", "") or (deck_data or {}).get("name", "")
                prefetched_multi_images = run_async(_prefetch_multi_images(multi_image_queries, search_context))
                if prefetched_multi_images:
                    image_count = len([k for k in prefetched_multi_images if not k.endswith("_query")])
                    logger.info(f"[custom_component_rewrite] Pre-fetched {image_count} images for interactive elements")
        except Exception as e:
            logger.warning(f"[custom_component_rewrite] Multi-image pre-fetch failed: {e}")

        # Merge all prefetched assets
        all_prefetched = {**prefetched_logos, **prefetched_multi_images}

        # Build logo context for the prompt if we have pre-fetched logos
        logo_context = ""
        if prefetched_logos:
            logo_entries = []
            for key, url in prefetched_logos.items():
                if not key.endswith("_query"):
                    company = prefetched_logos.get(f"{key}_query", key).replace(" logo", "")
                    logo_entries.append(f"- {company}: {url}")
            if logo_entries:
                logo_context = "\n\nAVAILABLE COMPANY LOGOS (use these exact URLs):\n" + "\n".join(logo_entries)

        # Build multi-image context for interactive elements
        multi_image_context = ""
        if prefetched_multi_images:
            image_entries = []
            for key, url in prefetched_multi_images.items():
                if not key.endswith("_query"):
                    query = prefetched_multi_images.get(f"{key}_query", key)
                    image_entries.append(f"- {query}: {url}")
            if image_entries:
                multi_image_context = "\n\nAVAILABLE IMAGES FOR INTERACTIVE ELEMENTS (use these exact URLs in your JavaScript):\n" + "\n".join(image_entries)
                multi_image_context += "\n\nCRITICAL: Create a JavaScript object/map that associates each button with its corresponding image URL from the list above. When a button is clicked, update the main image src to show the matching image."

        generated = run_async(
            gen.generate(
                content=f"""REDESIGN REQUEST: {instruction}{attachment_context}{chat_context}{uploads_note}{logo_context}{multi_image_context}{theme_lock_context}

EXISTING SLIDE CONTENT TO REDESIGN:
{actual_content}

IMPORTANT:
- Fill the entire 1920x1080 canvas. Do not use max-width containers.
- If reference images are provided, match their layout and style.
- Use the conversation context above to understand what the user wants and any preferences they discussed.
- DO NOT display the redesign request text in the slide. Use it only to guide your design approach.
- Base the slide content on the EXISTING SLIDE CONTENT above, but DO honor explicit user requests to add/remove elements (e.g., add a video, remove cards).
- If company logos are listed above, use the EXACT URLs provided - do not use placeholder URLs for those logos.
- If interactive element images are listed above, create a JavaScript object mapping each element to its image URL, and wire up click handlers to swap the displayed image.""",
                theme=theme_for_gen,
                slide_context=slide_context,
                component_purpose="visualize",
                width=1920,
                height=1080,
                position={"x": 0, "y": 0},
                reference_images=reference_images or None,
                uploaded_media=uploaded_media,
                available_videos=available_videos,
                prefetched_images=all_prefetched if all_prefetched else None,
            )
        )
        new_html = ((generated or {}).get("props") or {}).get("render") or ""
        if not new_html:
            raise ValueError("generator returned empty render")

        # Enforce current-slide theme lock after rewrite generation.
        if preserve_colors or preserve_typography:
            themed_html = apply_theme_to_custom_component_html(
                new_html,
                preserve_colors or None,
                preserve_typography or None,
            )
            if themed_html != new_html:
                logger.info("[custom_component_rewrite] Re-applied existing theme lock to generated HTML")
            new_html = themed_html

        # Build diff with render + full-bleed sizing
        deck_diff = DeckDiff(DeckDiffBase())
        component_diff = ComponentDiffBase(
            id=comp_id,
            type="CustomComponent",
            props={"render": new_html, "position": {"x": 0, "y": 0}, "width": 1920, "height": 1080},
        )
        deck_diff.update_component(slide_id, comp_id, component_diff)

        _dbg(
            "B",
            "slide_tools.py:custom_component_rewrite",
            "rewrite_done",
            {
                "slide_id": slide_id,
                "component_id": comp_id,
                "mode": slide_mode,
                "model": getattr(gen, "model", None),
                "reference_images": reference_images,
                "old_len": len(current_html),
                "new_len": len(new_html),
            },
            runId="pre-fix",
        )
        logger.info(f"[custom_component_rewrite] Rewrote via CustomComponentGenerator ({len(current_html)} → {len(new_html)} chars)")
        return deck_diff
    except Exception as e:
        logger.warning(f"[custom_component_rewrite] Generator path failed, falling back to prompt-based rewrite: {e}")

    # Fallback: prompt-based rewrite (kept for safety)
    # Reuse CustomComponentGenerator prompt builder for quality parity
    try:
        from agents.generation.custom_component_generator import CustomComponentGenerator
        gen = CustomComponentGenerator(model=CUSTOM_COMPONENT_EDIT_MODEL)
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

    fallback_theme_lock_context = ""
    if preserve_colors or preserve_typography:
        fallback_lines = [
            "THEME LOCK (MUST PRESERVE EXACTLY):",
            "- Keep the same colors and fonts as the current slide.",
        ]
        if preserve_colors:
            fallback_lines.append("- Colors: " + ", ".join([f"{k}={v}" for k, v in preserve_colors.items()][:10]))
        if preserve_typography:
            fallback_lines.append(f"- Typography: {preserve_typography}")
        fallback_theme_lock_context = "\n\n" + "\n".join(fallback_lines)

    user_prompt = f"""{_current_date_note()}

CURRENT CUSTOMCOMPONENT HTML:
{current_html[:25000]}

REFERENCE IMAGE URLS (if any): {', '.join(reference_images) if reference_images else 'none'}

USER REQUEST (use this to guide your redesign, do NOT display this text in the slide):
{instruction}
{fallback_theme_lock_context}

IMPORTANT:
- Fill the entire 1920x1080 canvas.
- Do not use max-width containers (no max-w-7xl).
- DO NOT include the user request text as visible content in the slide.
- The slide content should be based on the CURRENT CUSTOMCOMPONENT HTML above, redesigned according to the user request.
- If the user explicitly requests new elements (e.g., a video), include them in the redesign.

Return ONLY the complete updated HTML (starting with <!DOCTYPE html>)."""

    client, model = get_model_and_client("custom_component_rewrite", log_prefix="SLIDE_TOOLS")

    new_html = invoke_with_fallback(
        client=client,
        model=model,
        messages=[{"role": "system", "content": system_prompt}, {"role": "user", "content": user_prompt}],
        response_model=None,  # Raw output
        max_tokens=32000,
        log_prefix="SLIDE_TOOLS",
    )

    # Clean up response (extract HTML if wrapped in markdown)
    if '```html' in new_html:
        new_html = new_html.split('```html')[1].split('```')[0].strip()
    elif '```' in new_html:
        new_html = new_html.split('```')[1].split('```')[0].strip()

    # Upload external URLs to bucket (this path bypasses the generator)
    try:
        from agents.generation.custom_component_image_pipeline import upload_external_urls_to_bucket, resolve_remaining_placeholders
        new_html = run_async(upload_external_urls_to_bucket(new_html))
        new_html = run_async(resolve_remaining_placeholders(new_html))
        logger.info("[custom_component_rewrite] Processed images in fallback path")
    except Exception as e:
        logger.warning(f"[custom_component_rewrite] Failed to process images in fallback: {e}")

    # Enforce current-slide theme lock after fallback rewrite generation.
    if preserve_colors or preserve_typography:
        themed_html = apply_theme_to_custom_component_html(
            new_html,
            preserve_colors or None,
            preserve_typography or None,
        )
        if themed_html != new_html:
            logger.info("[custom_component_rewrite] Re-applied existing theme lock in fallback path")
        new_html = themed_html

    # Build diff
    deck_diff = DeckDiff(DeckDiffBase())
    component_diff = ComponentDiffBase(
        id=comp_id,
        type="CustomComponent",
        props={"render": new_html}
    )
    deck_diff.update_component(slide_id, comp_id, component_diff)

    _dbg(
        "B",
        "slide_tools.py:custom_component_rewrite",
        "rewrite_done",
        {
            "slide_id": slide_id,
            "component_id": comp_id,
            "mode": slide_mode,
            "model": model,
            "sys_len": len(system_prompt),
            "user_len": len(user_prompt),
            "old_len": len(current_html),
            "new_len": len(new_html),
        },
        runId="pre-fix",
    )
    logger.info(f"[custom_component_rewrite] Rewrote HTML ({len(current_html)} → {len(new_html)} chars)")
    return deck_diff


def custom_component_str_replace(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
    slide_screenshot: Dict = None,
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
        raise ValueError("CustomComponent not found on slide")

    component_id = _get_attr(comp, "id")

    # If we have instruction but no old_string, use AI to figure out the replacement
    if instruction and not old_string:
        logger.info(f"[custom_component_str_replace] Using AI to determine replacement for: {instruction[:50]}...")
        return _targeted_custom_component_edit(slide_id, comp, instruction, deck_data, attachments, slide_screenshot=slide_screenshot)

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
        success, _updated_html, note = apply_replacement(html, old_string, new_string)
        if not success:
            raise ValueError(
                "old_string not found in CustomComponent HTML. "
                f"Searched for: '{old_string[:100]}...' in HTML starting with: '{html_preview}...'"
                + (f" Suggestion: {note}" if note else "")
            )
        new_html = _updated_html
    else:
        new_html = html.replace(old_string, new_string, 1)
    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type="CustomComponent", props={"render": new_html}),
    )
    _dbg(
        "B",
        "slide_tools.py:custom_component_str_replace",
        "str_replace_applied",
        {
            "slide_id": slide_id,
            "component_id": component_id,
            "old_preview": old_string[:120],
            "new_preview": new_string[:120],
        },
        runId="pre-fix",
    )
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

    For font overrides on CustomComponents, use:
    {"updates": {"overrideBodyFont": "Font Name", "overrideHeroFont": "Font Name"}}
    """
    slide_id = args.get("slide_id") or _get_attr(current_slide, "id")
    component_id = args.get("component_id")
    updates = args.get("updates") or {}

    # If no component_id provided, find the CustomComponent on the slide
    if not component_id:
        components = _get_attr(current_slide, "components", []) or []
        custom_comp = next((c for c in components if _get_attr(c, "type") == "CustomComponent"), None)
        if custom_comp:
            component_id = _get_attr(custom_comp, "id")
            logger.info(f"[component_prop_update] Auto-selected CustomComponent: {component_id}")

    if not component_id:
        raise ValueError("component_id is required (no CustomComponent found on slide)")
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

    # Log font override updates specifically
    font_updates = {k: v for k, v in updates.items() if 'Font' in k or 'font' in k}
    if font_updates:
        logger.info(f"[component_prop_update] 🎨 FONT UPDATE: {font_updates} for component {component_id}")
        # Debug: Log the full new_props to verify font overrides are included
        font_props_in_new = {k: v for k, v in new_props.items() if 'Font' in k or 'font' in k}
        logger.info(f"[component_prop_update] 📦 FULL DIFF PROPS (font keys): {font_props_in_new}")

    deck_diff = DeckDiff(DeckDiffBase())
    deck_diff.update_component(
        slide_id,
        component_id,
        ComponentDiffBase(id=component_id, type=ctype, props=new_props),
    )
    _dbg(
        "B",
        "slide_tools.py:component_prop_update",
        "prop_update",
        {"slide_id": slide_id, "component_id": component_id, "type": ctype, "keys": list(updates.keys())[:30]},
        runId="pre-fix",
    )
    logger.info(f"[component_prop_update] ✅ Updated {len(updates)} props for component {component_id}")
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
    logger.info(
        f"[view_component] Viewed component {component_id}: type={ctype}, "
        f"props_keys={list(props.keys()) if isinstance(props, dict) else 'N/A'}"
    )
    _dbg("B", "slide_tools.py:view_component", "component_viewed", out, runId="pre-fix")

    # Return empty DeckDiff since this is a read-only operation,
    # but attach the observation so orchestrator can feed it back to the agent.
    dd = DeckDiff(DeckDiffBase())
    try:
        setattr(dd, "observation", out)
    except Exception:
        pass
    return dd


def view_slide(
    args: Dict[str, Any],
    deck_data: Dict,
    current_slide: Dict,
    registry: ComponentRegistry = None,
    attachments: List[Dict] = None,
) -> DeckDiff:
    """
    Return full slide details (including CustomComponent HTML previews).
    Read-only tool - returns an empty DeckDiff with observation attached.

    Args: {"slide_id": str}
    """
    slide_id = args.get("slide_id") if isinstance(args, dict) else None
    if not slide_id:
        slide_id = _get_attr(current_slide, "id")

    slide = None
    slides = (deck_data or {}).get("slides") if isinstance(deck_data, dict) else None
    if isinstance(slides, list):
        slide = next((s for s in slides if _get_attr(s, "id") == slide_id), None)

    if not slide and _get_attr(current_slide, "id") == slide_id:
        slide = current_slide

    if not slide:
        raise ValueError(f"Slide {slide_id} not found")

    slide_title = _get_attr(slide, "title", "")
    components = _get_attr(slide, "components", []) or []
    out_components: List[Dict[str, Any]] = []

    from agents.editing.orchestrator_v2 import strip_frontend_editing_scripts

    for comp in components:
        ctype = _get_attr(comp, "type", "Unknown")
        props = _get_attr(comp, "props", {}) or {}
        comp_out: Dict[str, Any] = {
            "id": _get_attr(comp, "id"),
            "type": ctype,
        }
        if ctype == "CustomComponent":
            html = props.get("render", "") if isinstance(props, dict) else getattr(props, "render", "")
            html = strip_frontend_editing_scripts(html)
            comp_out["html"] = html or ""
            comp_out["html_preview"] = (html or "")[:2000]
            if isinstance(props, dict):
                sanitized_props = dict(props)
                if "render" in sanitized_props:
                    sanitized_props["render"] = "[omitted]"
                comp_out["props"] = sanitized_props
            else:
                comp_out["props"] = props
        else:
            comp_out["props"] = props

        out_components.append(comp_out)

    slide_props: Dict[str, Any] = {}
    if isinstance(slide, dict):
        slide_props = {k: v for k, v in slide.items() if k != "components"}

    out = {
        "id": slide_id,
        "title": slide_title,
        "slide_props": slide_props,
        "components": out_components,
    }

    logger.info(f"[view_slide] Viewed slide {slide_id}: {slide_title} ({len(out_components)} components)")
    _dbg("B", "slide_tools.py:view_slide", "slide_viewed", {"slide_id": slide_id, "components": len(out_components)}, runId="pre-fix")

    dd = DeckDiff(DeckDiffBase())
    try:
        setattr(dd, "observation", out)
    except Exception:
        pass
    return dd
