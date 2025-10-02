from typing import List, Union, Literal
from pydantic import BaseModel, Field, create_model
import uuid

from models.tools import ToolModel
from models.component import ComponentBase
from models.registry import ComponentRegistry
from models.deck import DeckBase, DeckDiff
from agents.prompts.editing.editor_notes import get_editor_notes
from agents.ai.clients import get_client, invoke
from utils.deck import find_component_by_id, get_component_info
from utils.images import image_exists 
from utils.summaries import get_slide_summary
from agents.dynamic_context.image_search import get_image_search_context

from agents.config import DECK_EDITOR_MODEL, IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_SUPPORTING
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from services.image_storage_service import ImageStorageService
import requests
import asyncio
import threading
from queue import Queue
import re


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
    editor_notes = get_editor_notes((1920, 1080))
    system_prompt = f"""
    You are a helpful assistant that helps with deck editing.
    You will be given a component data in the <component> tag and a user request in the <edit_request> tag.
    You will then make the changes to the component data and return edit response summary.
    You will respect the rules in the <editor_notes> tag.
    You will also be given a list of relevant component ids in the <relevant_component_ids> tag, you are not allowed to change these components, but you can use them to understand the context of the edit request.
    If changes are not needed, return an empty diff.
    """
    
    component = find_component_by_id(deck_data, edit_args.metadata.component_id)
    slide_summary = get_slide_summary(deck_data, edit_args.metadata.slide_id)
    relevant_components = [find_component_by_id(deck_data, component_id) for component_id in edit_args.relevant_component_ids]
    component_diff_model = registry.get_component_diff_model(edit_args.metadata.component_type)
    additional_context = get_additional_context(component['component'])
    
    prompt = f"""
    <editor_notes>
    {editor_notes}
    </editor_notes>

    <edit_request>
    {edit_args.edit_request}
    </edit_request>

    <relevant_components>
    {relevant_components}
    </relevant_components>

    <additional_component_context>
    {additional_context}
    </additional_component_context

    <slide_summary>
    {slide_summary}
    </slide_summary>

    <component>
    {component}
    </component>
    """

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
    
    client, model = get_client(DECK_EDITOR_MODEL)

    response = invoke(
        client=client,
        model=model,
        max_tokens=4096,
        response_model=EditResponse,
        messages=[
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
        ],
        max_retries=2,
    )
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
    tool_name: Literal["create_new_component"] = Field(description="Creating a new component")
    component_type: Union[str] = Field(description="The type of the component")
    component_request: str = Field(description="The of the edit request for the component. Ensure the instructions are specific and clear enough to be implemented by the editor.")
    slide_id: Union[str] = Field(description="The id of the slide to add the component to")
    id: str = Field(description="UUID for the new component")

def get_create_new_component_model(component_types: List[str]) -> BaseModel:
    return create_model(
        "CreateNewComponent",
        __base__=CreateComponentArgs,
        component_type=(str, Field(description="The type of the component to create", json_schema_extra={"enum": component_types}))
    )

def create_new_component(component_args: CreateComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    editor_notes = get_editor_notes((1920, 1080))
    system_prompt = f"""
    You are a helpful assistant that helps with deck editing.
    You are tasked with creating a new component that you can find in the <component_request> tag.
    You will respect the rules outlined in the <editor_notes> tag.
    It is important that you fully define the component and that you dont leave any ambiguity.
    """
    
    component_model = registry.get_component_model(component_args.component_type)
    slide_summary = get_slide_summary(deck_data, component_args.slide_id)
    
    # Get dynamic context based on component type
    dynamic_context = ""
    if component_args.component_type == "Image":
        image_context = get_image_search_context(component_args.component_request)
        if image_context:
            dynamic_context = f"""
            <image_search_context>
            {image_context}
            </image_search_context>
            """
    
    prompt = f"""
    <editor_notes>
    {editor_notes}
    </editor_notes>

    <slide_summary>
    {slide_summary}
    </slide_summary>

    <component_request>
    {component_args.component_request}
    </component_request>

    {dynamic_context}
    """

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
    
    client, model = get_client(DECK_EDITOR_MODEL)

    response = invoke(
        client=client,
        model=model,
        max_tokens=4096,
        response_model=CreateResponse,
        messages=[
            { "role": "system", "content": system_prompt },
            { "role": "user", "content": prompt }
        ],
        max_retries=2,
    )

    # Set the ID on the component after getting the response
    response.component.id = component_args.id
    
    # If the created component is an Image, ensure a high-quality AI image is generated
    # according to deck intent and style, and set the src accordingly.
    try:
        if getattr(response.component, 'type', '') == 'Image':
            new_url = _generate_image_for_request(
                base_prompt=component_args.component_request,
                slide_summary=slide_summary
            )
            if new_url:
                # Ensure props exists and set src
                if not hasattr(response.component, 'props') or response.component.props is None:
                    setattr(response.component, 'props', {})
                response.component.props['src'] = new_url
    except Exception:
        # Non-fatal; keep LLM-produced component
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

def replace_component(replace_args: ReplaceComponentArgs, registry: ComponentRegistry, deck_data: DeckBase, deck_diff: DeckDiff):
    # First get the old component information
    old_component = find_component_by_id(deck_data, replace_args.component_id)
    slide_summary = get_slide_summary(deck_data, replace_args.slide_id)
    
    # Create enhanced component request that includes old component info
    enhanced_request = f"""
    Replace the following component:
    {old_component}
    
    Original request: {replace_args.component_request}
    
    Slide context:
    {slide_summary}
    
    Please create a new {replace_args.new_component_type} component that replaces the old one while maintaining appropriate positioning and styling.
    """
    
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
            temp_diff = create_new_component(create_args, registry, deck_data, DeckDiff(DeckDiffBase()))
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
    return create_new_component(create_args, registry, deck_data, deck_diff)