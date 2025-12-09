from typing import List, Union, Literal, Optional, Dict, Any
from pydantic import BaseModel, Field, create_model
import uuid
import logging

from models.tools import ToolModel
from models.component import ComponentBase
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff
# Note: editor_notes removed - using simplified inline prompts
from agents.ai.clients import get_client, invoke
from agents.ai.rate_limit_tracker import is_provider_in_cooldown, mark_provider_rate_limited
from utils.deck import find_component_by_id, get_component_info
from utils.images import image_exists
from utils.summaries import get_slide_summary
from agents.dynamic_context.image_search import get_image_search_context

from agents.config import DECK_EDITOR_MODEL, CUSTOM_COMPONENT_FALLBACK_MODEL, IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_SUPPORTING
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from services.image_storage_service import ImageStorageService
import requests
import base64
import asyncio
from agents.editing.attachment_analyzer import (
    analyze_attachments,
    build_multimodal_content,
    get_attachment_context_summary,
    FileType
)
import threading
from queue import Queue
import re

logger = logging.getLogger(__name__)


def _truncate_component_for_prompt(component: dict, max_render_length: int = 2000) -> dict:
    """
    Truncate large component data for prompts to prevent token limit issues.
    Specifically truncates CustomComponent render fields which can be huge HTML strings.
    """
    if not component or not isinstance(component, dict):
        return component

    result = dict(component)

    # Handle the actual component data (might be nested under 'component' key)
    comp_data = result.get('component', result)

    comp_type = comp_data.get('type')
    props = comp_data.get('props', {})

    if comp_type == 'CustomComponent' and isinstance(props, dict):
        render_content = props.get('render', '')
        if isinstance(render_content, str) and len(render_content) > max_render_length:
            # Truncate the render HTML
            truncated = render_content[:max_render_length] + f'... [TRUNCATED - {len(render_content)} chars total]'
            if 'component' in result:
                result['component'] = dict(comp_data)
                result['component']['props'] = dict(props)
                result['component']['props']['render'] = truncated
            else:
                result['props'] = dict(props)
                result['props']['render'] = truncated
            logger.info(f"[EDIT] Truncated CustomComponent render from {len(render_content)} to {max_render_length} chars")

    return result


def _build_custom_component_prompt(component_args, slide_summary: dict, analyzed_attachments: list) -> str:
    """
    Build a focused, example-based prompt for CustomComponent creation.
    Follows the pattern from custom_component_generator.py - simple instructions + working example.

    Now supports flexible reasoning about attachments - the AI should understand what
    the user wants to do with uploaded files based on context.
    """
    from agents.editing.attachment_analyzer import FileType

    # Check if user uploaded reference images
    has_reference_images = any(att.is_vision_content for att in analyzed_attachments)
    has_data_files = any(att.file_type == FileType.SPREADSHEET for att in analyzed_attachments)
    has_any_attachments = len(analyzed_attachments) > 0

    # Get data context if spreadsheets were uploaded
    data_context = ""
    if has_data_files:
        for att in analyzed_attachments:
            if att.file_type == FileType.SPREADSHEET and att.text_content:
                data_context += f"\nDATA TO VISUALIZE:\n{att.text_content[:2000]}\n"

    # Build attachment section with URLs for direct use
    attachment_section = ""
    if has_any_attachments:
        attachment_urls = []
        for att in analyzed_attachments:
            if att.original_url:
                attachment_urls.append(f"- {att.name} ({att.file_type.value}): {att.original_url}")

        attachment_section = f"""
═══════════════════════════════════════════════════════════════
📎 USER ATTACHMENTS - REASON ABOUT INTENT
═══════════════════════════════════════════════════════════════

The user has uploaded files:
{chr(10).join(attachment_urls)}

**ANALYZE THE REQUEST TO DETERMINE INTENT:**

1. **USE AS CONTENT** - "use this logo", "add this image", "put this here"
   → Embed directly: <img src='URL' class='...' />

2. **ANALYZE & EXTRACT** - "analyze this", "extract data", "recreate this chart"
   → Study the image content and create HTML that represents/recreates it

3. **MATCH STYLE** - "make it look like this", "match this design"
   → Extract visual patterns (colors, fonts, layout) and apply them

4. **REPLACE CONTENT** - "use this instead of X", "swap the title for this"
   → Put the image where the referenced element would be

**IMPORTANT:** If the user mentions their uploaded file, incorporate it appropriately.
Use the URLs above directly in <img src='...'> tags when embedding images.
"""

    return f"""CREATE THIS CUSTOMCOMPONENT:
{component_args.component_request}

SLIDE CONTEXT:
{slide_summary}
{attachment_section}{data_context}
═══════════════════════════════════════════════════════════════
📋 CUSTOMCOMPONENT FORMAT (REQUIRED)
═══════════════════════════════════════════════════════════════

The "render" prop must be a COMPLETE HTML document as a single-line string:

STRUCTURE:
<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;overflow:hidden;background:transparent}}</style></head><body class='w-full h-full flex items-center justify-center'>YOUR_CONTENT</body></html>

RULES:
- Single line string (no newlines)
- Use SINGLE QUOTES for all HTML attributes
- Include Tailwind CDN
- Set background:transparent
- Use Tailwind classes for styling
- Content must fit in the specified dimensions (no scrolling)
- If using uploaded images, use <img src='ATTACHMENT_URL' class='...' />

═══════════════════════════════════════════════════════════════
📋 WORKING EXAMPLE
═══════════════════════════════════════════════════════════════

<!DOCTYPE html><html><head><script src='https://cdn.tailwindcss.com'></script><style>*{{margin:0;padding:0;box-sizing:border-box}}html,body{{width:100%;height:100%;overflow:hidden;background:transparent}}</style></head><body class='w-full h-full flex items-center justify-center p-8'><div class='w-full max-w-4xl'><h1 class='text-4xl font-bold text-white mb-6'>Your Title Here</h1><div class='grid grid-cols-3 gap-6'><div class='bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20'><div class='text-3xl font-bold text-emerald-400'>85%</div><div class='text-white/70'>Metric One</div></div><div class='bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20'><div class='text-3xl font-bold text-blue-400'>$2.4M</div><div class='text-white/70'>Metric Two</div></div><div class='bg-white/10 backdrop-blur rounded-2xl p-6 border border-white/20'><div class='text-3xl font-bold text-purple-400'>124</div><div class='text-white/70'>Metric Three</div></div></div></div></body></html>

Now create the CustomComponent the user requested. Position it appropriately on the 1920x1080 canvas."""


def _infer_style_guidance(slide_summary: str, base_prompt: str) -> str:
    """Derive style guidance tags based on deck purpose and user intent."""
    text = f"{slide_summary} {base_prompt}".lower()
    style_parts = []
    if any(k in text for k in ["artistic", "creative", "design", "portfolio", "brand exploration"]):
        style_parts.append("Artistic, visually expressive, on-brand styling")
    if any(k in text for k in ["education", "tutorial", "lesson", "course", "student", "teacher", "training"]):
        style_parts.append("Educational clarity, high contrast, legible, accurate visuals")
    if any(k in text for k in ["business", "enterprise", "strategy", "kpi", "executive", "stakeholder"]):
        style_parts.append("Professional business aesthetic, polished, consistent color accents")
    # Always enforce no-text, accuracy, and slide-appropriateness
    style_parts.append("No text or lettering in the image. Ensure factual accuracy for educational/business content.")
    return ". ".join(style_parts)


def _get_provider_service():
    return GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()


def _download_image_bytes(url: str) -> bytes:
    try:
        r = requests.get(url, timeout=10)
        if r.status_code == 200:
            return r.content
    except Exception:
        pass
    return b""


def _generate_image_for_request(base_prompt: str, slide_summary: str) -> str:
    """Generate a styled image and return Supabase URL."""
    service = _get_provider_service()
    style = _infer_style_guidance(slide_summary, base_prompt)
    prompt = f"{base_prompt}. {style}"
    # Use 1536x1024 for widescreen feel; service handles provider specifics
    coro = service.generate_image(prompt=prompt, size="1536x1024", transparent_background=IMAGE_TRANSPARENT_DEFAULT_SUPPORTING)
    result = asyncio.run(_run_coro(coro))
    if not isinstance(result, dict) or 'error' in result:
        return ""
    b64 = result.get('b64_json')
    if not b64:
        return ""
    storage = ImageStorageService()
    upload = asyncio.run(_run_coro(storage.upload_image_from_base64(b64, filename="agent-generated.png", content_type="image/png")))
    return upload.get('url', "") if isinstance(upload, dict) else ""


def _maybe_process_image_edit(edit_request: str, target_component: dict, relevant_components: list, slide_summary: str, deck_diff: DeckDiff, slide_id: str, component_id: str):
    """If edit involves manipulating image content, run edit or fuse and update src."""
    props = target_component.get('props', {}) or {}
    src = props.get('src')
    if not src:
        return
    # Detect fusion intent via keywords
    fuse = any(k in edit_request.lower() for k in ["merge", "combine", "composite", "fuse", "place into scene", "put into"])
    # Collect reference images from relevant components if any (Image components)
    ref_urls = []
    for rc in (relevant_components or []):
        try:
            if rc and rc.get('component', {}).get('type') == 'Image':
                rsrc = rc['component'].get('props', {}).get('src')
                if rsrc:
                    ref_urls.append(rsrc)
        except Exception:
            continue

    style = _infer_style_guidance(slide_summary, edit_request)
    service = _get_provider_service()

    async def _process():
        try:
            storage = ImageStorageService()
            if fuse and ref_urls:
                imgs = [_download_image_bytes(src)] + [_download_image_bytes(u) for u in ref_urls]
                imgs = [b for b in imgs if b]
                if not imgs:
                    return None
                result = await service.fuse_images(prompt=f"{edit_request}. {style}", image_bytes_list=imgs, size="1536x1024")
            else:
                img_bytes = _download_image_bytes(src)
                if not img_bytes:
                    return None
                result = await service.edit_image(instructions=f"{edit_request}. {style}", image_bytes=img_bytes, transparent_background=False, size="1536x1024")
            if not isinstance(result, dict) or 'error' in result or not result.get('b64_json'):
                return None
            upload = await storage.upload_image_from_base64(result['b64_json'], filename="agent-edited.png", content_type="image/png")
            return upload.get('url') if isinstance(upload, dict) else None
        except Exception:
            return None

    new_url = asyncio.run(_run_coro(_process()))
    if new_url:
        # Update component src in diff
        diff = {"props": {**props, "src": new_url}}
        deck_diff.update_component(slide_id, component_id, diff)


async def _run_coro(coro):
    return await coro

class ComponentMetadata(BaseModel):
    component_type: str = Field(description="The type of the component")
    component_id: str = Field(description="The id of the component")
    slide_id: str = Field(description="The id of the slide containing the component")

class EditComponentArgs(ToolModel):
    tool_name: Literal["edit_component"] = Field(description="Edit the properties of an existing component. Ensure the instructions are specific and clear enough to be implemented by the editor. To change the image, use the replace_component tool.")
    metadata: ComponentMetadata = Field(description="The metadata of the component to edit")
    edit_request: str = Field(description="The detailed description of the edit request for the component. Ensure the instructions are specific and clear enough to be implemented by the editor.")
    relevant_component_ids: List[Union[str]] = Field(description="The ids of the components that are relevant to the edit request")

def get_edit_component_model(deck_data: dict, component_types: List[str], component_ids: List[str], slide_ids: List[str]) -> BaseModel:
    infos = []
    for component_id in component_ids:
        info = get_component_info(deck_data, component_id)
        print(info)
        if not info:
            # Skip components not found (e.g., when frontend didn't include selection)
            continue
        infos.append((component_id, info["component_type"], info["slide_id"]))

    models = []
    for cid, ctype, sid in infos:
        ModelCls = create_model(
            f"ComponentMetadata_{cid}",
            __base__=ComponentMetadata,
            component_type=(str, Field(description="The type of the component", json_schema_extra={"enum": component_types})),
            component_id=(str, Field(description="The id of the component", default=cid)),
            slide_id=(str, Field(description="The id of the slide containing the component", default=sid))
        )
        models.append(ModelCls)
    # If no components found, fall back to generic (non-restrictive) metadata to avoid targeting wrong items
    if not models:
        FallbackMeta = create_model(
            "FallbackComponentMetadata",
            __base__=ComponentMetadata,
            component_type=(str, Field(description="The type of the component")),
            component_id=(str, Field(description="The id of the component")),
            slide_id=(str, Field(description="The id of the slide containing the component"))
        )
        return create_model(
            "EditComponent",
            __base__=EditComponentArgs,
            metadata=(FallbackMeta, Field(description="The metadata of the component to edit")),
        )
    # Build a Union dynamically without using unpack syntax that confuses the checker
    MetaUnion = Union[tuple(models)]
    return create_model(
        "EditComponent",
        __base__=EditComponentArgs,
        metadata=(MetaUnion, Field(description="The metadata of the component to edit")),
    )

def get_additional_context(component: ComponentBase):
    print("getting additional context")
    additional_context = ""
    try:
        # Support typed or dict component
        comp_type = getattr(component, 'type', None)
        comp_props = getattr(component, 'props', None)
        if comp_type is None and isinstance(component, dict):
            comp_type = component.get('type')
            comp_props = component.get('props', {})
        if comp_type == "Image":
            src = None
            if isinstance(comp_props, dict):
                src = comp_props.get('src')
            if src and not image_exists(src):
                additional_context = f"WARNING: The image url is {src} and the image does not exist"
    except Exception:
        pass
    return additional_context

def edit_component(edit_args: EditComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    component = find_component_by_id(deck_data, edit_args.metadata.component_id)

    # Check if component was found
    if not component:
        logger.error(f"Component {edit_args.metadata.component_id} not found in deck")
        raise ValueError(f"Component {edit_args.metadata.component_id} not found in deck")

    # Truncate component data to prevent token limit issues (CustomComponent HTML can be huge)
    component_for_prompt = _truncate_component_for_prompt(component)

    slide_summary = get_slide_summary(deck_data, edit_args.metadata.slide_id)
    relevant_components_raw = [find_component_by_id(deck_data, component_id) for component_id in edit_args.relevant_component_ids]
    # Truncate relevant components too
    relevant_components = [_truncate_component_for_prompt(c) for c in relevant_components_raw if c]
    component_diff_model = registry.get_component_diff_model(edit_args.metadata.component_type)
    additional_context = get_additional_context(component['component'])

    # Simplified system prompt
    system_prompt_base = """You are an expert presentation component editor.

CANVAS: 1920x1080 pixels. All positions in pixels.

YOUR TASK: Apply the user's edit request to the component.
- Execute their changes precisely
- Return a diff with only the changed properties
- If no changes needed, return empty diff"""

    # Focused context section (cached)
    context_section = f"""SLIDE CONTEXT:
{slide_summary}

RELATED COMPONENTS (for context only):
{relevant_components}

{f"COMPONENT NOTES: {additional_context}" if additional_context else ""}"""

    component_section = f"""COMPONENT TO EDIT:
{component_for_prompt}"""

    # Edit request is NOT cached (changes every time)
    edit_request_section = f"""EDIT REQUEST:
{edit_args.edit_request}"""

    EditResponse = create_model(
        "EditResponse",
        component_diff=(
            component_diff_model,
            Field(description="The comprehensive diff of changes to apply to the component")
        ),
        description=(
            str,
            Field(description="A succinct description of the changes to apply to the component")
        )
    )

    # Check if Gemini is in cooldown - use fallback if so
    if is_provider_in_cooldown("gemini"):
        logger.info(f"[COMPONENT_EDIT] Gemini in cooldown, using fallback: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
        client, model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
    else:
        client, model = get_client(DECK_EDITOR_MODEL)

    messages = [
        {"role": "system", "content": system_prompt_base},
        {
            "role": "user",
            "content": [
                {"type": "text", "text": context_section, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": component_section, "cache_control": {"type": "ephemeral"}},
                {"type": "text", "text": edit_request_section}
            ]
        }
    ]

    try:
        # Use content blocks with cache_control for Claude's prompt caching
        response = invoke(
            client=client,
            model=model,
            max_tokens=16384,
            response_model=EditResponse,
            messages=messages,
            max_retries=3,
        )
    except Exception as e:
        error_str = str(e).lower()
        # Check for rate limit and try fallback
        if '429' in error_str or 'rate' in error_str or 'quota' in error_str:
            mark_provider_rate_limited("gemini")
            logger.warning(f"[COMPONENT_EDIT] Gemini rate limited, retrying with fallback")
            fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
            try:
                response = invoke(
                    client=fallback_client,
                    model=fallback_model,
                    max_tokens=16384,
                    response_model=EditResponse,
                    messages=messages,
                    max_retries=3,
                )
            except Exception as fallback_err:
                logger.error(f"Component edit failed (fallback): {str(fallback_err)}")
                raise
        else:
            logger.error(f"Component edit failed for component {edit_args.metadata.component_id}: {str(e)}")
            logger.error(f"Component data length: {len(component_section)} chars")
            raise
    # Guardrail: ensure the diff targets the intended component id to avoid ID mismatch crashes
    try:
        component_diff = response.component_diff
        incoming_id = getattr(component_diff, 'id', None)
        target_id = edit_args.metadata.component_id
        if incoming_id != target_id:
            # Prefer pydantic-safe copy if available
            try:
                if hasattr(component_diff, 'model_copy'):
                    component_diff = component_diff.model_copy(update={'id': target_id})
                else:
                    setattr(component_diff, 'id', target_id)
            except Exception:
                # As a last resort, wrap in a dict compatible structure
                try:
                    component_diff = component_diff.model_dump(exclude_none=True)
                    component_diff['id'] = target_id
                except Exception:
                    # If all else fails, raise a clearer error
                    raise ValueError(f"Failed to coerce component diff id {incoming_id} -> {target_id}")
    except Exception:
        # If any unexpected structure, continue; update_component will still validate
        component_diff = response.component_diff

    deck_diff.update_component(edit_args.metadata.slide_id, edit_args.metadata.component_id, component_diff)
    
    # If this is an Image component and the edit request indicates visual edits,
    # attempt prompt-based image editing or fusion via configured provider.
    try:
        target_component = find_component_by_id(deck_data, edit_args.metadata.component_id)
        if target_component and target_component.get('component', {}).get('type') == 'Image':
            _maybe_process_image_edit(
                edit_request=edit_args.edit_request,
                target_component=target_component.get('component', {}),
                relevant_components=relevant_components,
                slide_summary=slide_summary,
                deck_diff=deck_diff,
                slide_id=edit_args.metadata.slide_id,
                component_id=edit_args.metadata.component_id
            )
    except Exception:
        # Non-fatal; continue with textual edits applied
        pass
    return deck_diff


class CreateComponentArgs(ToolModel):
    tool_name: Literal["create_new_component"] = Field(description="Create a new component on a slide. For Image components, this automatically generates AI images using Gemini/DALL-E based on your description. Use this as the PRIMARY tool for adding images to slides.")
    component_type: Union[str] = Field(description="The type of the component to create (e.g., Image, TiptapTextBlock, Chart, Shape, Title)")
    component_request: str = Field(description="Detailed description of the component to create. For images, describe what the image should show (e.g., 'a professional photo of a cat in a business suit'). The AI will generate the image automatically.")
    slide_id: Union[str] = Field(description="The id of the slide to add the component to")
    id: str = Field(description="UUID for the new component")

def get_create_new_component_model(component_types: List[str]) -> BaseModel:
    return create_model(
        "CreateNewComponent",
        __base__=CreateComponentArgs,
        component_type=(str, Field(description="The type of the component to create", json_schema_extra={"enum": component_types}))
    )

def create_new_component(component_args: CreateComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff, attachments: Optional[List[Dict[str, Any]]] = None):
    # Analyze all attachments (images, spreadsheets, documents, etc.)
    analyzed_attachments = analyze_attachments(attachments or [])

    # Build attachment context summary
    attachment_context = get_attachment_context_summary(analyzed_attachments)

    component_model = registry.get_component_model(component_args.component_type)
    slide_summary = get_slide_summary(deck_data, component_args.slide_id)

    # Simple, focused system prompt
    system_prompt = f"""You are an expert presentation component creator.

CANVAS: 1920x1080 pixels. Origin (0,0) is top-left. X increases rightward, Y increases downward.
All positions/sizes in PIXELS only (no percentages).

YOUR TASK: Create the exact component the user requests.
- Execute their vision precisely
- Don't question or suggest alternatives
- Fully define all required properties
{attachment_context}"""

    # Build focused prompt based on component type
    if component_args.component_type == "CustomComponent":
        prompt = _build_custom_component_prompt(component_args, slide_summary, analyzed_attachments)
    elif component_args.component_type == "Image":
        image_context = get_image_search_context(component_args.component_request)
        prompt = f"""CREATE THIS IMAGE COMPONENT:
{component_args.component_request}

SLIDE CONTEXT:
{slide_summary}

{f"IMAGE SEARCH HINTS: {image_context}" if image_context else ""}

Position it appropriately on the 1920x1080 canvas."""
    else:
        prompt = f"""CREATE THIS COMPONENT:
{component_args.component_request}

SLIDE CONTEXT:
{slide_summary}

POSITIONING RULES:
- Avoid overlapping existing components
- Leave 20px minimum spacing between elements
- Standard title position: Y=100-150
- Body content starts around Y=250
- Full-width content: width ~1720 (100px margins each side)"""

    CreateResponse = create_model(
        "CreateResponse",
        component=(
            component_model,
            Field(description="The new component that you have created")
        ),
        description=(
            str,
            Field(description="A succinct description of the component that you have created")
        )
    )

    # Check if Gemini is in cooldown - use fallback if so
    if is_provider_in_cooldown("gemini"):
        logger.info(f"[CREATE_COMPONENT] Gemini in cooldown, using fallback: {CUSTOM_COMPONENT_FALLBACK_MODEL}")
        client, model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
    else:
        client, model = get_client(DECK_EDITOR_MODEL)

    # Build multimodal user content using the unified analyzer
    # This handles images (as vision), spreadsheets (as data context), documents (as text), etc.
    user_content = build_multimodal_content(analyzed_attachments, prompt, max_images=3)

    # Log what we're sending
    image_count = sum(1 for att in analyzed_attachments if att.is_vision_content)
    data_count = sum(1 for att in analyzed_attachments if att.file_type == FileType.SPREADSHEET)
    doc_count = sum(1 for att in analyzed_attachments if att.file_type in [FileType.DOCUMENT, FileType.PRESENTATION])
    if analyzed_attachments:
        logger.info(f"[CREATE_COMPONENT] Attachments: {image_count} images, {data_count} data files, {doc_count} documents")

    messages = [
        { "role": "system", "content": system_prompt },
        { "role": "user", "content": user_content }
    ]

    try:
        response = invoke(
            client=client,
            model=model,
            max_tokens=16384,  # Increased from 4096 to prevent JSON truncation on complex components
            response_model=CreateResponse,
            messages=messages,
            max_retries=3,  # Increased from 2 to give more retry attempts
        )
    except Exception as e:
        error_str = str(e).lower()
        # Check for rate limit and try fallback
        if '429' in error_str or 'rate' in error_str or 'quota' in error_str:
            mark_provider_rate_limited("gemini")
            logger.warning(f"[CREATE_COMPONENT] Gemini rate limited, retrying with fallback")
            fallback_client, fallback_model = get_client(CUSTOM_COMPONENT_FALLBACK_MODEL)
            try:
                response = invoke(
                    client=fallback_client,
                    model=fallback_model,
                    max_tokens=16384,
                    response_model=CreateResponse,
                    messages=messages,
                    max_retries=3,
                )
            except Exception as fallback_err:
                logger.error(f"Component creation failed (fallback): {str(fallback_err)}")
                raise
        else:
            logger.error(f"Component creation failed for component {component_args.id}: {str(e)}")
            logger.error(f"System prompt length: {len(system_prompt)} chars")
            logger.error(f"User content blocks: {len(user_content)}")
            raise

    # Set the ID on the component after getting the response
    response.component.id = component_args.id

    # If the created component is an Image, handle image source appropriately
    # PRIORITY: User-uploaded images > LLM-suggested URL > AI-generated image
    try:
        if getattr(response.component, 'type', '') == 'Image':
            # Check if user uploaded images that should be used
            has_user_images = any(att.is_vision_content for att in analyzed_attachments)

            if has_user_images:
                # User uploaded an image - use it directly instead of generating
                # Find the first image attachment
                for att in analyzed_attachments:
                    if att.is_vision_content and att.original_url:
                        # Re-upload to our storage for persistence
                        from services.image_storage_service import ImageStorageService
                        try:
                            storage = ImageStorageService()
                            upload_coro = storage.upload_image_from_url(att.original_url)
                            upload_result = asyncio.run(_run_coro(upload_coro))
                            if isinstance(upload_result, dict) and upload_result.get('url'):
                                if not hasattr(response.component, 'props') or response.component.props is None:
                                    setattr(response.component, 'props', {})
                                response.component.props['src'] = upload_result['url']
                                logger.info(f"[CREATE_COMPONENT] Using user-uploaded image: {upload_result['url'][:60]}...")
                                break
                        except Exception as e:
                            # Use original URL if re-upload fails
                            if not hasattr(response.component, 'props') or response.component.props is None:
                                setattr(response.component, 'props', {})
                            response.component.props['src'] = att.original_url
                            logger.info(f"[CREATE_COMPONENT] Using user-uploaded image (original URL): {att.original_url[:60]}...")
                            break
            else:
                # No user images - generate a high-quality AI image
                new_url = _generate_image_for_request(
                    base_prompt=component_args.component_request,
                    slide_summary=slide_summary
                )
                if new_url:
                    # Ensure props exists and set src
                    if not hasattr(response.component, 'props') or response.component.props is None:
                        setattr(response.component, 'props', {})
                    response.component.props['src'] = new_url
    except Exception as e:
        # Non-fatal; keep LLM-produced component
        logger.warning(f"[CREATE_COMPONENT] Image handling failed: {e}")
        pass
    deck_diff.add_component(component_args.slide_id, response.component)
    return deck_diff

class RemoveComponentArgs(ToolModel):
    tool_name: Literal["remove_component"] = Field(description="Removing a component with a known id")
    component_id: Union[str] = Field(description="The id of the component to remove")
    slide_id: Union[str] = Field(description="The id of the slide containing the component")

def remove_component(component_args: RemoveComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    deck_diff.remove_component(component_args.slide_id, component_args.component_id)
    return deck_diff

class RemoveAllContentArgs(ToolModel):
    tool_name: Literal["remove_all_content"] = Field(description="Remove all content components (text, shapes, images, charts, etc.) from a slide, leaving only the background. Use this when asked to 'delete all content', 'clear the slide', 'remove everything', etc.")
    slide_id: Union[str] = Field(description="The id of the slide to clear")
    include_background: bool = Field(default=False, description="If True, also removes the background. Default is False (keeps background).")

def remove_all_content(remove_args: RemoveAllContentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    """Remove all content components from a slide, optionally keeping the background."""
    # Resolve slides for typed models or plain dicts
    slides_iter = []
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])

    # Find the slide
    slide = None
    for s in slides_iter:
        slide_id = getattr(s, 'id', None)
        if slide_id is None and isinstance(s, dict):
            slide_id = s.get('id')
        if slide_id == remove_args.slide_id:
            slide = s
            break

    if not slide:
        raise ValueError(f"Slide {remove_args.slide_id} not found")

    # Get components
    if hasattr(slide, 'components'):
        comps = list(getattr(slide, 'components', []) or [])
    elif isinstance(slide, dict):
        comps = list(slide.get('components', []) or [])
    else:
        comps = []

    # Get all components except background (unless include_background is True)
    components_to_remove = []
    for component in comps:
        comp_type = getattr(component, 'type', None)
        if comp_type is None and isinstance(component, dict):
            comp_type = component.get('type')

        # Skip background unless explicitly requested
        if comp_type == 'Background' and not remove_args.include_background:
            continue

        # Remove everything else
        comp_id = getattr(component, 'id', None)
        if comp_id is None and isinstance(component, dict):
            comp_id = component.get('id')
        if comp_id:
            components_to_remove.append(comp_id)

    # Remove all identified components
    for comp_id in components_to_remove:
        deck_diff.remove_component(remove_args.slide_id, comp_id)

    logger.info(f"Removed {len(components_to_remove)} components from slide {remove_args.slide_id}")
    return deck_diff

class RemoveComponentsByTypeArgs(ToolModel):
    tool_name: Literal["remove_components_by_type"] = Field(description="Remove all components of a specific type from a slide. Useful for 'delete all text', 'remove all shapes', 'clear all images', etc.")
    slide_id: Union[str] = Field(description="The id of the slide")
    component_types: List[str] = Field(description="List of component types to remove (e.g., ['TiptapTextBlock', 'TextBlock'] for all text, ['Shape'] for shapes, ['Image'] for images, ['Chart'] for charts)")

def remove_components_by_type(remove_args: RemoveComponentsByTypeArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    """Remove all components of specified types from a slide."""
    # Resolve slides for typed models or plain dicts
    slides_iter = []
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])

    # Find the slide
    slide = None
    for s in slides_iter:
        slide_id = getattr(s, 'id', None)
        if slide_id is None and isinstance(s, dict):
            slide_id = s.get('id')
        if slide_id == remove_args.slide_id:
            slide = s
            break

    if not slide:
        raise ValueError(f"Slide {remove_args.slide_id} not found")

    # Get components
    if hasattr(slide, 'components'):
        comps = list(getattr(slide, 'components', []) or [])
    elif isinstance(slide, dict):
        comps = list(slide.get('components', []) or [])
    else:
        comps = []

    # Get all components matching the specified types
    components_to_remove = []
    for component in comps:
        comp_type = getattr(component, 'type', None)
        if comp_type is None and isinstance(component, dict):
            comp_type = component.get('type')

        if comp_type in remove_args.component_types:
            comp_id = getattr(component, 'id', None)
            if comp_id is None and isinstance(component, dict):
                comp_id = component.get('id')
            if comp_id:
                components_to_remove.append(comp_id)

    # Remove all identified components
    for comp_id in components_to_remove:
        deck_diff.remove_component(remove_args.slide_id, comp_id)

    logger.info(f"Removed {len(components_to_remove)} components of types {remove_args.component_types} from slide {remove_args.slide_id}")
    return deck_diff

class ReplaceComponentArgs(ToolModel):
    tool_name: Literal["replace_component"] = Field(description="Replace an existing component with a new one, can be a different type")
    component_id: Union[str] = Field(description="The id of the component to replace")
    slide_id: Union[str] = Field(description="The id of the slide containing the component")
    new_component_type: Union[str] = Field(description="The type of the new component to create")
    component_request: str = Field(description="The detailed description of the new component to create. Ensure the instructions are specific and clear enough to be implemented by the editor.")

def get_replace_component_model(component_types: List[str]) -> BaseModel:
    return create_model(
        "ReplaceComponent",
        __base__=ReplaceComponentArgs,
        new_component_type=(str, Field(description="The type of the new component to create", json_schema_extra={"enum": component_types}))
    )

def replace_component(replace_args: ReplaceComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff, attachments: Optional[List[Dict[str, Any]]] = None):
    # First get the old component information
    old_component = find_component_by_id(deck_data, replace_args.component_id)

    # Truncate old component to avoid token issues
    old_component_truncated = _truncate_component_for_prompt(old_component)

    # Create focused replacement request
    enhanced_request = f"""REPLACE THIS COMPONENT:
{old_component_truncated}

WITH: {replace_args.component_request}

Keep similar position/size unless the request specifies otherwise."""
    
    # If the target is an Image and we're replacing with an Image, prefer in-place update of src/metadata
    try:
        old_comp = (old_component or {}).get("component") or {}
        old_type = (old_comp or {}).get("type")
        if old_type == "Image" and replace_args.new_component_type == "Image":
            # Create a temporary Image via the existing flow to obtain a suggested src/props
            create_args = CreateComponentArgs(
                tool_name="create_new_component",
                component_type=replace_args.new_component_type,
                component_request=enhanced_request,
                slide_id=replace_args.slide_id,
                id=str(uuid.uuid4())
            )
            temp_diff = create_new_component(create_args, registry, deck_data, DeckDiff(DeckDiffBase()), attachments=attachments)
            # Extract the created component's props from the temp diff (last added on this slide)
            image_props = {}
            try:
                # Find the slide diff and last component added
                for sd in getattr(temp_diff, 'deck_diff', {}).slides_to_update:
                    if sd.slide_id == replace_args.slide_id and sd.components_to_add:
                        # Use the last added component props as source
                        candidate = sd.components_to_add[-1]
                        image_props = getattr(candidate, 'props', {}) if hasattr(candidate, 'props') else (candidate.get('props') if isinstance(candidate, dict) else {})
                        break
            except Exception:
                image_props = {}

            # Build an in-place diff for the existing image: update src/alt/metadata only, preserve geometry
            src_val = (image_props or {}).get('src')
            image_diff_model = registry.get_component_diff_model("Image")
            safe_props = {"metadata": {"kind": "logo"}}
            if src_val:
                safe_props["src"] = src_val
            # Optionally propagate alt text
            if (image_props or {}).get('alt'):
                safe_props["alt"] = image_props.get('alt')

            image_diff = image_diff_model(
                id=replace_args.component_id,
                type="Image",
                props=safe_props
            )
            deck_diff.update_component(replace_args.slide_id, replace_args.component_id, image_diff)
            return deck_diff
    except Exception:
        # Fallback to remove+add path below
        pass

    # Fallback: remove-and-add approach (for non-Image or type changes)
    deck_diff.remove_component(replace_args.slide_id, replace_args.component_id)
    create_args = CreateComponentArgs(
        tool_name="create_new_component",
        component_type=replace_args.new_component_type,
        component_request=enhanced_request,
        slide_id=replace_args.slide_id,
        id=str(uuid.uuid4())
    )
    return create_new_component(create_args, registry, deck_data, deck_diff, attachments=attachments)