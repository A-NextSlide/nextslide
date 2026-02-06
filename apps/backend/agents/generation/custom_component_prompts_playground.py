"""
Playground-specific prompt wrappers for slide HTML generation.

These wrap the production prompts from custom_component_prompts.py and add
a strict "use content verbatim" rule so every model gets identical text and
can only compete on visual design quality.
"""

from typing import Dict, Any, Optional, List

from agents.generation.custom_component_prompts import (
    build_system_prompt as _production_system_prompt,
    build_user_prompt as _production_user_prompt,
)

# ── Verbatim content instructions injected into prompts ──────────────────────

_VERBATIM_SYSTEM_BLOCK = (
    "\n\n"
    "🚨 CONTENT FIDELITY — ABSOLUTE RULE 🚨\n"
    "The slide content has already been written by the outline author. "
    "Your ONLY job is to DESIGN and VISUALIZE it — not to rewrite it.\n"
    "- Use EVERY word, sentence, stat, and talking point from the CONTENT section EXACTLY as provided.\n"
    "- Do NOT paraphrase, summarize, shorten, reword, or add your own copy.\n"
    "- Do NOT invent new headings, bullet points, stats, or filler text that are not in the content.\n"
    "- If the content has 3 bullet points, show 3 bullet points — not 5, not 2.\n"
    "- You may split content across visual regions (cards, columns, tabs) but every word must appear.\n"
    "- The slide title in the CONTENT section is the slide title — use it as-is.\n"
)

_VERBATIM_USER_BLOCK = (
    "\n"
    "⚠️ VERBATIM RULE: Use ALL of the content below EXACTLY as written. "
    "Do not paraphrase, summarize, or invent your own text. "
    "Your job is to create a stunning visual layout for this EXACT content — every word must appear on the slide.\n"
)


def build_system_prompt_playground(
    colors: Dict[str, str],
    typography: Dict[str, str],
    design_philosophy: str = "",
    logo_url: Optional[str] = None,
    slide_mode: str = "interactive",
) -> str:
    """Build playground system prompt — production prompt + verbatim content rule."""
    base = _production_system_prompt(
        colors, typography, design_philosophy, logo_url, slide_mode
    )
    # Insert the verbatim block right after the first line (role description)
    # so it's the first major instruction the model sees.
    first_newline = base.find("\n")
    if first_newline > 0:
        return base[:first_newline] + _VERBATIM_SYSTEM_BLOCK + base[first_newline:]
    return base + _VERBATIM_SYSTEM_BLOCK


def build_user_prompt_playground(
    *,
    content: str,
    slide_context: Dict[str, Any],
    width: int,
    height: int,
    component_purpose: str = "visualize",
    external_media: Optional[Dict[str, Any]] = None,
    uploaded_media: Optional[list] = None,
    prefetched_images: Optional[Dict[str, str]] = None,
    reference_images: Optional[List[str]] = None,
    logo_url: Optional[str] = None,
    available_videos: Optional[List[Dict[str, Any]]] = None,
) -> str:
    """Build playground user prompt — production prompt + verbatim content reminder."""
    base = _production_user_prompt(
        content=content,
        slide_context=slide_context,
        width=width,
        height=height,
        component_purpose=component_purpose,
        external_media=external_media,
        uploaded_media=uploaded_media,
        prefetched_images=prefetched_images,
        reference_images=reference_images,
        logo_url=logo_url,
        available_videos=available_videos,
    )
    # Insert the verbatim block right before the CONTENT: section
    content_marker = "CONTENT:"
    idx = base.find(content_marker)
    if idx > 0:
        return base[:idx] + _VERBATIM_USER_BLOCK + base[idx:]
    # Fallback: prepend
    return _VERBATIM_USER_BLOCK + base
