"""Multimodal helpers for slide tools."""

from typing import Any, Dict, List
import base64
import logging
import re
import requests

logger = logging.getLogger(__name__)

# Maximum dimensions for multimodal images (to prevent token explosion)
# NOTE: 384px is plenty for LLM context - larger sizes waste tokens
MAX_IMAGE_DIMENSION = 384   # Max width or height in pixels (was 1024 - way too big)
MAX_IMAGE_BYTES = 150_000   # Max ~150KB per image after compression
JPEG_QUALITY = 60           # JPEG quality for compression (lower = smaller)


def _compress_image_for_multimodal(
    image_data: bytes,
    max_dimension: int = MAX_IMAGE_DIMENSION,
    max_bytes: int = MAX_IMAGE_BYTES,
) -> tuple:
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
        logger.info(
            f"[IMAGE_COMPRESS] {original_size//1024}KB -> {len(compressed_data)//1024}KB ({reduction:.0f}% reduction)"
        )

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
                        logger.warning("[MULTIMODAL] Skipping image - would exceed token budget")
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
                        logger.warning("[MULTIMODAL] Skipping image - would exceed token budget")
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
