"""
AI Image Generation endpoint for the ImagePicker and MediaHub components.
"""

import logging
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from agents.config import IMAGE_PROVIDER, IMAGE_TRANSPARENT_DEFAULT_FULL
import base64
from typing import List
import aiohttp
from services.gemini_image_service import GeminiImageService
from services.openai_image_service import OpenAIImageService
from services.image_storage_service import ImageStorageService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/images", tags=["Image Generation"])


class SlideContext(BaseModel):
    """Context information about the current slide"""
    title: str
    content: Optional[str] = ""
    theme: Optional[Dict[str, Any]] = None


class ImageGenerationRequest(BaseModel):
    """Request model for AI image generation"""
    prompt: str
    slideContext: SlideContext
    style: Optional[str] = "photorealistic"
    aspectRatio: Optional[str] = "16:9"
    deckTheme: Optional[Dict[str, Any]] = None  # Theme/style data from deck generation


class ImageGenerationResponse(BaseModel):
    """Response model for AI image generation"""
    url: str
    revised_prompt: Optional[str] = None
class EditImageRequest(BaseModel):
    """Request to edit an existing image with prompt instructions."""
    instructions: str
    imageUrl: Optional[str] = None
    imageBase64: Optional[str] = None
    transparentBackground: Optional[bool] = False
    aspectRatio: Optional[str] = "16:9"


class FuseImagesRequest(BaseModel):
    """Request to fuse multiple images guided by a prompt."""
    prompt: str
    images: List[str]  # URLs or base64 strings
    aspectRatio: Optional[str] = "16:9"



@router.post("/generate", response_model=ImageGenerationResponse)
async def generate_image(request: ImageGenerationRequest):
    """
    Generate an AI image based on the prompt and slide context.
    
    Args:
        request: The image generation request containing prompt and context
        
    Returns:
        ImageGenerationResponse with the generated image URL
    """
    try:
        # Initialize image service based on provider switch
        image_service = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        
        # Use the user's prompt as-is (no augmentation)
        enhanced_prompt = request.prompt
        
        logger.info(f"Generating image with prompt: {enhanced_prompt[:100]}...")
        
        # Generate the image
        result = await image_service.generate_image(
            prompt=enhanced_prompt,
            size=_get_size_from_aspect_ratio(request.aspectRatio),
            transparent_background=IMAGE_TRANSPARENT_DEFAULT_FULL,
            n=1
        )
        
        if not result or ('url' not in result and 'b64_json' not in result):
            raise HTTPException(
                status_code=500,
                detail="Failed to generate image"
            )
        
        # Convert base64 to data URL if needed
        image_url = result.get('url')
        if not image_url and result.get('b64_json'):
            # Upload to storage instead of using data URL
            try:
                storage_service = ImageStorageService()
                # Upload base64 directly without creating data URL
                upload_result = await storage_service.upload_image_from_base64(
                    base64_data=result['b64_json'],
                    filename=f"ai-generated-{request.aspectRatio}.png",
                    content_type="image/png"
                )
                
                if upload_result and upload_result.get('url'):
                    image_url = upload_result['url']
                    logger.info(f"Uploaded generated image to storage: {image_url}")
                else:
                    # Fallback to data URL if upload fails
                    image_url = f"data:image/png;base64,{result['b64_json'][:50]}...[truncated]"
                    logger.warning("Failed to upload generated image, using truncated data URL")
            except Exception as e:
                logger.error(f"Error uploading generated image: {e}")
                # Fallback to data URL but truncate for logging
                image_url = f"data:image/png;base64,{result['b64_json']}"
        
        logger.info(f"Successfully generated image")
        
        return ImageGenerationResponse(
            url=image_url,
            revised_prompt=result.get('revised_prompt')
        )
        
    except Exception as e:
        logger.error(f"Error generating image: {str(e)}", exc_info=True)
        raise HTTPException(
            status_code=500,
            detail=f"Image generation failed: {str(e)}"
        )


def _enhance_prompt_with_context(
    prompt: str,
    slide_context: SlideContext,
    style: str,
    aspect_ratio: str,
    deck_theme: Optional[Dict[str, Any]] = None
) -> str:
    """
    Enhance the user's prompt with slide context for better results.
    """
    # Start with the base prompt
    enhanced = prompt
    
    # CRITICAL: Always add "no text" instruction
    enhanced = f"{enhanced}."
    
    # Add slide context if available
    if slide_context.title:
        enhanced = f"{enhanced}. Context: This image is for a slide titled '{slide_context.title}'"
    
    # Add style preferences
    style_mappings = {
        "photorealistic": "photorealistic, high quality photography",
        "illustration": "digital illustration, clean vector art style",
        "artistic": "artistic, creative interpretation, painterly style",
        "minimal": "minimalist design, simple and clean",
        "cartoon": "cartoon style, vibrant and playful"
    }
    
    if style in style_mappings:
        enhanced = f"{enhanced}, {style_mappings[style]}"
    
    # Add deck theme guidance if available
    if deck_theme:
        # Extract visual style from theme
        visual_style = deck_theme.get('visual_style', {})
        color_palette = deck_theme.get('color_palette', {})
        
        # Add color guidance
        if color_palette:
            primary_color = color_palette.get('accent_1', color_palette.get('primary_accent'))
            secondary_color = color_palette.get('accent_2', color_palette.get('secondary_accent'))
            
            if primary_color:
                enhanced = f"{enhanced}. Use color accents similar to {primary_color}"
            if secondary_color:
                enhanced = f"{enhanced} and {secondary_color}"
        
        # Add visual style preferences
        if visual_style:
            if visual_style.get('overall_sophistication') == 'professional':
                enhanced = f"{enhanced}. Professional and sophisticated style"
            elif visual_style.get('overall_sophistication') == 'creative':
                enhanced = f"{enhanced}. Creative and vibrant style"
    
    # Add aspect ratio hints
    if aspect_ratio == "16:9":
        enhanced = f"{enhanced}, wide landscape format suitable for presentations"
    elif aspect_ratio == "1:1":
        enhanced = f"{enhanced}, square format"
    elif aspect_ratio == "9:16":
        enhanced = f"{enhanced}, tall portrait format"
    
    # Add presentation-specific requirements
    enhanced = f"{enhanced}. Professional quality suitable for business presentations"
    
    # Final reminder about no text
    enhanced = f"{enhanced}. IMPORTANT: The image must contain NO TEXT OR LETTERING of any kind"
    
    return enhanced


def _get_size_from_aspect_ratio(aspect_ratio: str) -> str:
    """
    Map aspect ratio to image generation model supported sizes.
    """
    # gpt-image-1 supports: 1024x1024, 1024x1536, 1536x1024, auto
    size_map = {
        "1:1": "1024x1024",
        "16:9": "1536x1024",  # Wide/landscape (closest to 16:9)
        "9:16": "1024x1536",  # Tall/portrait (closest to 9:16)
    }
    
    return size_map.get(aspect_ratio, "1536x1024")  # Default to wide 


async def _fetch_image_bytes(url: str) -> Optional[bytes]:
    try:
        timeout = aiohttp.ClientTimeout(total=20)
        headers = {
            "User-Agent": "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36",
            "Accept": "*/*",
        }
        async with aiohttp.ClientSession(timeout=timeout, headers=headers) as session:
            async with session.get(url, allow_redirects=True) as resp:
                if resp.status == 200:
                    return await resp.read()
                logger.warning(f"Failed to fetch image from URL: {url} (status={resp.status}, content-type={resp.headers.get('Content-Type')})")
                return None
    except Exception as e:
        logger.error(f"Exception fetching image from URL: {url} -> {e}", exc_info=True)
        return None


def _decode_base64(data_uri_or_b64: str) -> Optional[bytes]:
    try:
        s = data_uri_or_b64
        if s.startswith("data:"):
            # data URL format: data:<mime>;base64,<payload>
            s = s.split(",", 1)[1]
        return base64.b64decode(s)
    except Exception:
        return None


@router.post("/edit", response_model=ImageGenerationResponse)
async def edit_image(request: EditImageRequest):
    try:
        image_service = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        if IMAGE_PROVIDER != 'gemini' and not hasattr(image_service, 'edit_image'):
            raise HTTPException(status_code=400, detail="Image editing is currently supported only with Gemini provider")

        # Obtain image bytes from URL or base64
        image_bytes: Optional[bytes] = None
        if request.imageBase64:
            image_bytes = _decode_base64(request.imageBase64)
        elif request.imageUrl:
            if request.imageUrl.startswith("data:"):
                image_bytes = _decode_base64(request.imageUrl)
            else:
                image_bytes = await _fetch_image_bytes(request.imageUrl)
        if not image_bytes:
            raise HTTPException(status_code=400, detail="No valid image provided (URL or base64 required)")

        size = _get_size_from_aspect_ratio(request.aspectRatio or "16:9")
        result = await image_service.edit_image(
            instructions=request.instructions,
            image_bytes=image_bytes,
            transparent_background=bool(request.transparentBackground),
            size=size,
        )
        if not isinstance(result, dict) or ('url' not in result and 'b64_json' not in result):
            raise HTTPException(status_code=500, detail=f"Edit failed: {result.get('error', 'Unknown error') if isinstance(result, dict) else 'Unknown error'}")

        image_url = result.get('url')
        if not image_url and result.get('b64_json'):
            try:
                storage_service = ImageStorageService()
                upload_result = await storage_service.upload_image_from_base64(
                    base64_data=result['b64_json'],
                    filename=f"ai-edited-{request.aspectRatio}.png",
                    content_type="image/png"
                )
                image_url = upload_result.get('url') if upload_result else None
            except Exception as e:
                logger.error(f"Error uploading edited image: {e}")
                image_url = f"data:image/png;base64,{result.get('b64_json','')}"

        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to produce edited image URL")

        return ImageGenerationResponse(url=image_url, revised_prompt=result.get('revised_prompt'))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error editing image: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image edit failed: {str(e)}")


@router.post("/fuse", response_model=ImageGenerationResponse)
async def fuse_images(request: FuseImagesRequest):
    try:
        image_service = GeminiImageService() if IMAGE_PROVIDER == 'gemini' else OpenAIImageService()
        if IMAGE_PROVIDER != 'gemini' and not hasattr(image_service, 'fuse_images'):
            raise HTTPException(status_code=400, detail="Image fusion is currently supported only with Gemini provider")

        # Convert inputs into bytes array
        bytes_list: List[bytes] = []
        for src in request.images:
            data: Optional[bytes] = None
            if src.startswith('http'):
                data = await _fetch_image_bytes(src)
            else:
                data = _decode_base64(src)
            if data:
                bytes_list.append(data)
        if len(bytes_list) < 1:
            raise HTTPException(status_code=400, detail="At least one valid image is required")

        size = _get_size_from_aspect_ratio(request.aspectRatio or "16:9")
        result = await image_service.fuse_images(
            prompt=request.prompt,
            image_bytes_list=bytes_list,
            size=size,
        )
        if not isinstance(result, dict) or ('url' not in result and 'b64_json' not in result):
            raise HTTPException(status_code=500, detail=f"Fusion failed: {result.get('error', 'Unknown error') if isinstance(result, dict) else 'Unknown error'}")

        image_url = result.get('url')
        if not image_url and result.get('b64_json'):
            try:
                storage_service = ImageStorageService()
                upload_result = await storage_service.upload_image_from_base64(
                    base64_data=result['b64_json'],
                    filename=f"ai-fused-{request.aspectRatio}.png",
                    content_type="image/png"
                )
                image_url = upload_result.get('url') if upload_result else None
            except Exception as e:
                logger.error(f"Error uploading fused image: {e}")
                image_url = f"data:image/png;base64,{result.get('b64_json','')}"

        if not image_url:
            raise HTTPException(status_code=500, detail="Failed to produce fused image URL")

        return ImageGenerationResponse(url=image_url, revised_prompt=result.get('revised_prompt'))

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error fusing images: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Image fusion failed: {str(e)}")