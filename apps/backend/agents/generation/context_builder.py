"""Builds slide generation context with consistent deck/slide metadata."""

from typing import Any, Dict, List, Optional, Tuple

from agents.domain.models import SlideGenerationContext, ThemeSpec, ThemeDocument


def _theme_to_dict(theme: Any) -> Dict[str, Any]:
    if hasattr(theme, "to_dict"):
        return theme.to_dict()
    if isinstance(theme, dict):
        return theme
    return {}


def _normalize_theme(theme: Any) -> Any:
    if theme is None:
        return ThemeSpec.from_dict({})
    if isinstance(theme, (ThemeSpec, ThemeDocument)):
        return theme
    if isinstance(theme, dict):
        return ThemeSpec.from_dict(theme)
    return theme


def _get_style_pref(style_prefs: Any, key: str) -> Optional[Any]:
    if style_prefs is None:
        return None
    if hasattr(style_prefs, key):
        return getattr(style_prefs, key)
    if isinstance(style_prefs, dict):
        return style_prefs.get(key)
    return None


def _collect_presentation_context(deck_outline: Any) -> Tuple[Optional[str], List[str]]:
    style_prefs = getattr(deck_outline, "stylePreferences", None)
    if not style_prefs:
        return None, []

    parts: List[str] = []
    initial_idea = _get_style_pref(style_prefs, "initialIdea")
    vibe_context = _get_style_pref(style_prefs, "vibeContext")
    if initial_idea:
        parts.append(initial_idea)
    if vibe_context:
        parts.append(vibe_context)
    presentation_context = " | ".join(parts) if parts else None

    reference_images = _get_style_pref(style_prefs, "referenceImages") or []
    if not isinstance(reference_images, list):
        reference_images = []
    return presentation_context, reference_images


def _collect_reference_images(theme: Any, style_refs: List[str]) -> List[str]:
    reference_images: List[str] = list(style_refs or [])
    theme_dict = _theme_to_dict(theme)

    theme_refs = theme_dict.get("reference_images")
    if isinstance(theme_refs, list):
        reference_images.extend(theme_refs)

    deck_theme = theme_dict.get("deck_theme") or {}
    if isinstance(deck_theme, dict):
        deck_theme_refs = deck_theme.get("reference_images")
        if isinstance(deck_theme_refs, list):
            reference_images.extend(deck_theme_refs)

    # De-dup while preserving order
    seen = set()
    deduped: List[str] = []
    for ref in reference_images:
        if not isinstance(ref, str):
            continue
        if ref in seen:
            continue
        deduped.append(ref)
        seen.add(ref)
    return deduped


def _collect_tagged_media(slide_outline: Any) -> List[Dict[str, Any]]:
    tagged = []
    media_items = getattr(slide_outline, "taggedMedia", None) or []
    for media in media_items:
        media_dict = media.model_dump() if hasattr(media, "model_dump") else media
        if isinstance(media_dict, dict):
            tagged.append(media_dict)
    return tagged


def _collect_assigned_videos(slide_outline: Any) -> List[Dict[str, Any]]:
    assigned = getattr(slide_outline, "assignedVideo", None)
    if not assigned:
        return []
    assigned_dict = assigned.model_dump() if hasattr(assigned, "model_dump") else assigned
    if isinstance(assigned_dict, dict):
        return [assigned_dict]
    return []


def build_slide_context(
    deck_outline: Any,
    slide_outline: Any,
    slide_index: int,
    theme: Any,
    palette: Dict[str, Any],
    style_manifesto: str,
    deck_uuid: str,
    async_images: bool = False,
    available_images: Optional[List[Any]] = None,
    user_id: Optional[str] = None,
    visual_density: Optional[str] = None,
) -> SlideGenerationContext:
    """Create SlideGenerationContext with consistent deck/slide metadata."""
    theme_obj = _normalize_theme(theme)

    presentation_context, style_refs = _collect_presentation_context(deck_outline)
    reference_images = _collect_reference_images(theme_obj, style_refs)

    merged_available_images: List[Any] = list(available_images or [])
    extracted_images = getattr(deck_outline, "extractedImages", None) or []
    if isinstance(extracted_images, list):
        merged_available_images.extend(extracted_images)

    tagged_media = _collect_tagged_media(slide_outline)
    available_videos = _collect_assigned_videos(slide_outline)

    return SlideGenerationContext(
        slide_outline=slide_outline,
        slide_index=slide_index,
        deck_outline=deck_outline,
        theme=theme_obj,
        palette=palette or {},
        style_manifesto=style_manifesto or "",
        deck_uuid=deck_uuid,
        available_images=merged_available_images,
        available_videos=available_videos,
        async_images=async_images,
        tagged_media=tagged_media,
        user_id=user_id,
        presentation_context=presentation_context,
        reference_images=reference_images,
        visual_density=visual_density,
    )
