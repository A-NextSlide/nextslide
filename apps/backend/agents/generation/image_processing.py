"""Image post-processing helpers for slide generation."""

from typing import Dict, Any, List, Tuple, Optional
import re
import logging

from agents.domain.models import SlideGenerationContext
from setup_logging_optimized import get_logger

logger = get_logger(__name__)

# Check if logo.dev is available
_LOGODEV_AVAILABLE = False
try:
    from agents.tools.theme.logodev_service import LogoDevService
    _LOGODEV_AVAILABLE = True
except ImportError:
    pass


def _is_company_logo_query(query: str) -> Tuple[bool, str]:
    """Detect if a query is for a company logo and extract the company name."""
    q = query.lower().strip()

    # Skip generic logo queries (these return random vistaprint images)
    generic_terms = {'logo', 'company logo', 'brand logo', 'business logo', 'corporate logo'}
    if q in generic_terms:
        return False, ""

    # Patterns like "Apple logo", "Google Logo"
    logo_suffix_match = re.match(r'^(.+?)\s+logo$', q, re.IGNORECASE)
    if logo_suffix_match:
        company = logo_suffix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    # Patterns like "logo of Stripe", "logo for Netflix"
    logo_prefix_match = re.match(r'^logo\s+(?:of|for)\s+(.+)$', q, re.IGNORECASE)
    if logo_prefix_match:
        company = logo_prefix_match.group(1).strip()
        if company and company not in ('company', 'brand', 'business', 'corporate', 'the'):
            return True, company

    return False, ""


async def _fetch_logo_from_logodev(company_name: str) -> Optional[str]:
    """Fetch company logo from logo.dev and upload to our storage."""
    if not _LOGODEV_AVAILABLE:
        return None

    try:
        async with LogoDevService() as logo_service:
            result = await logo_service.get_logo_with_fallback(company_name)
            if result.get("available") and result.get("logo_url"):
                logo_url = result["logo_url"]
                logger.info(f"[CUSTOM IMG] Found logo via logo.dev for '{company_name}'")

                # Upload to our storage for CORS safety
                from services.image_storage_service import get_image_storage_service
                storage = get_image_storage_service()
                upload_result = await storage.upload_image_from_url(
                    logo_url,
                    metadata={"alt": f"{company_name} logo", "source": "logodev"}
                )
                if upload_result and upload_result.get("url"):
                    return upload_result["url"]
                return logo_url  # Fallback to direct URL
    except Exception as e:
        logger.warning(f"[CUSTOM IMG] Logo.dev lookup failed for '{company_name}': {e}")

    return None


async def process_custom_component_images(
    slide_data: Dict[str, Any],
    context: SlideGenerationContext
) -> None:
    """Replace placeholder images inside CustomComponent HTML with real images."""
    try:
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

                if src.startswith("${") or src.startswith("props."):
                    continue
                if alt.startswith("${") or alt.startswith("props."):
                    continue

                is_already_ours = src and ("supabase" in src.lower() or "nextslide" in src.lower())
                if is_already_ours:
                    continue

                search_query = re.sub(r"[^a-zA-Z0-9\\s]", " ", alt).strip()
                if not search_query:
                    search_query = f"{slide_title} professional" if slide_title else "professional business"
                    logger.info(f"[CUSTOM IMG] Empty alt text - using fallback: {search_query}")

                try:
                    final_url = None

                    # Check if this is a company logo query - route to logo.dev
                    is_logo, company_name = _is_company_logo_query(search_query)
                    if is_logo and company_name:
                        logger.info(f"[CUSTOM IMG] Routing company logo to logo.dev: '{company_name}'")
                        final_url = await _fetch_logo_from_logodev(company_name)
                        if final_url:
                            logger.info(f"[CUSTOM IMG] Got logo from logo.dev for '{company_name}'")
                    elif 'logo' in search_query.lower():
                        # Skip generic logo queries - they return random vistaprint images
                        logger.info(f"[CUSTOM IMG] Skipping generic logo query: '{search_query}'")
                        continue

                    # If not a logo or logo.dev failed, use regular image search
                    if not final_url:
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

                    if final_url:
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
