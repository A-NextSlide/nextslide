"""Image post-processing helpers for slide generation."""

from typing import Dict, Any, List
import re
import logging

from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


async def process_custom_component_images(
    slide_data: Dict[str, Any],
    context: SlideGenerationContext
) -> None:
    """Replace placeholder images inside CustomComponent HTML with real images."""
    try:
        bad_search_terms = {
            "image", "image0", "image1", "image2", "image3",
            "visualization", "dataname", "photo", "picture",
            "graphic", "visual", "background", "chart", "icon",
            "placeholder", "img", "figure", "illustration",
        }

        slide_title = getattr(context.slide_outline, "title", "") or ""
        slide_content = getattr(context.slide_outline, "content", "") or ""

        for comp in slide_data.get("components", []) or []:
            if comp.get("type") != "CustomComponent":
                continue

            props = comp.get("props", {}) or {}
            render_html = props.get("render", "")
            if not render_html or not isinstance(render_html, str):
                continue

            trimmed = render_html.strip().lower()
            if not (trimmed.startswith("<!doctype html") or trimmed.startswith("<html")):
                continue

            img_regex = re.compile(r"<img([^>]*)>", re.IGNORECASE)
            updated_html = render_html
            images_processed = 0

            for match in img_regex.finditer(render_html):
                attrs = match.group(1)
                src_match = re.search(r'src=["\']([^"\']*)["\']', attrs, re.IGNORECASE)
                alt_match = re.search(r'alt=["\']([^"\']*)["\']', attrs, re.IGNORECASE)

                src = src_match.group(1) if src_match else ""
                alt = alt_match.group(1) if alt_match else ""

                is_already_ours = src and ("supabase" in src.lower() or "nextslide" in src.lower())
                if is_already_ours:
                    continue

                search_query = re.sub(r"[^a-zA-Z0-9\\s]", " ", alt).strip().lower()
                is_bad_query = (
                    not search_query
                    or len(search_query) < 3
                    or search_query in bad_search_terms
                    or any(search_query.startswith(bad) for bad in bad_search_terms)
                )

                if is_bad_query:
                    search_query = f"{slide_title} professional" if slide_title else "professional business"
                    logger.info(f"[CUSTOM IMG] Bad alt text '{alt}' - using fallback: {search_query}")

                try:
                    from services.combined_image_service import CombinedImageService
                    image_service = CombinedImageService()

                    search_result = await image_service.search_images(
                        query=search_query,
                        per_page=1,
                        page=1,
                    )

                    images = search_result.get("photos", []) or search_result.get("results", [])
                    if not images:
                        logger.warning(f"[CUSTOM IMG] No images found for: {search_query}")
                        continue

                    image_data = images[0]
                    image_url = (
                        image_data.get("url")
                        or image_data.get("src", {}).get("large")
                        or image_data.get("src", {}).get("original")
                        or image_data.get("original_url")
                    )
                    if not image_url:
                        logger.warning(f"[CUSTOM IMG] No URL in search result for {search_query}")
                        continue

                    from services.image_storage_service import get_image_storage_service
                    storage = get_image_storage_service()

                    upload_result = await storage.upload_image_from_url(
                        image_url,
                        metadata={"alt": alt, "search_query": search_query, "source": "serpapi"},
                    )

                    if upload_result and upload_result.get("url"):
                        final_url = upload_result["url"]
                        old_img = match.group(0)
                        if "src=" in attrs:
                            new_attrs = re.sub(
                                r'src=["\'][^"\']*["\']',
                                f'src=\"{final_url}\"',
                                attrs,
                                flags=re.IGNORECASE,
                            )
                        else:
                            new_attrs = f' src=\"{final_url}\"' + attrs
                        new_img = f"<img{new_attrs}>"
                        updated_html = updated_html.replace(old_img, new_img, 1)
                        images_processed += 1
                        logger.info(f"[CUSTOM IMG] Applied image for '{search_query}': {final_url[:60]}...")
                    else:
                        logger.warning(f"[CUSTOM IMG] Upload failed for {search_query}")

                except Exception as e:
                    logger.warning(f"[CUSTOM IMG] Error searching for '{search_query}': {e}")
                    continue

            if images_processed > 0 and updated_html != render_html:
                props["render"] = updated_html
                logger.info(f"[CUSTOM IMG] Updated CustomComponent with {images_processed} images")

    except Exception as e:
        logger.warning(f"[CUSTOM IMG] Processing skipped: {e}")


def apply_tagged_media_to_images(
    slide_data: Dict[str, Any],
    tagged_media: List[Dict[str, Any]]
) -> None:
    """Replace placeholder Image components with tagged media URLs."""
    logger.debug("[IMAGE REPLACEMENT] Starting tagged media replacement")
    logger.info(f"[IMAGE REPLACEMENT] Tagged media count: {len(tagged_media)}")

    image_components = []
    for comp in slide_data.get("components", []) or []:
        if comp.get("type") != "Image":
            continue
        props = comp.get("props", {}) or {}
        try:
            alt_text = (props.get("alt") or "").strip().lower()
            metadata_kind = ((props.get("metadata") or {}).get("kind") or "").strip().lower()
            if alt_text == "logo" or metadata_kind == "logo":
                continue
        except Exception:
            pass
        if props.get("src") in ["placeholder", ""]:
            image_components.append(comp)

    if not image_components:
        logger.warning("[IMAGE REPLACEMENT] No placeholder images found to replace")
        return

    image_media = [
        media for media in tagged_media
        if media.get("previewUrl") and (media.get("type") in ["image", "other"])
    ]

    for i, img_comp in enumerate(image_components):
        if i >= len(image_media):
            break
        media = image_media[i]
        preview_url = media.get("previewUrl", "")

        if preview_url and (preview_url.startswith("data:") or preview_url.startswith("http")):
            img_comp["props"]["src"] = preview_url
            img_comp["props"]["autoApplied"] = True
        else:
            img_comp["props"]["src"] = "placeholder"

        img_comp["props"]["alt"] = media.get("interpretation", media.get("filename", ""))

        component_search_query = img_comp.get("props", {}).get("searchQuery", "").strip()
        if not component_search_query:
            component_search_query = img_comp.get("props", {}).get("alt", "").strip()

        media_interpretation = media.get("interpretation", "").strip()
        search_query = component_search_query or media_interpretation or media.get("filename", "")

        img_comp["props"]["metadata"] = {
            "taggedMediaId": media.get("id"),
            "filename": media.get("filename"),
            "type": media.get("type"),
            "originalUrl": media.get("previewUrl"),
            "searchQuery": search_query,
            "topic": media_interpretation or search_query,
        }

    if len(image_media) > len(image_components):
        logger.warning(
            "Slide has %s tagged images but only %s image components. Extra media not used.",
            len(image_media),
            len(image_components),
        )

    non_image_media = [m for m in tagged_media if m.get("type") != "image"]
    if non_image_media:
        details = ", ".join([f"{m.get('filename')} ({m.get('type')})" for m in non_image_media])
        logger.info(
            "Slide has %s non-image media items not applied: %s",
            len(non_image_media),
            details,
        )
