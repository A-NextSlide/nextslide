"""Minimal brand utilities for outline requests (agent-driven, no heuristics)."""

import re
from typing import Optional, Dict

from models.requests import StylePreferencesItem


def _guess_brand_identifier(text: Optional[str]) -> Optional[str]:
    """Extract a domain-like token from free text if present."""
    if not text or not isinstance(text, str):
        return None
    match = re.search(r"\b([a-z0-9][a-z0-9\-]+\.[a-z]{2,})\b", text.lower())
    return match.group(1) if match else None


def _looks_like_domain(identifier: str) -> bool:
    """Return True when the value resembles a domain like example.com."""
    if not identifier or not isinstance(identifier, str):
        return False
    candidate = identifier.strip().lower()
    if " " in candidate:
        return False
    return bool(re.match(r"^[a-z0-9][a-z0-9\-\.]+\.[a-z]{2,}$", candidate))


def _is_reasonable_brand_term(identifier: str) -> bool:
    """Basic sanity check for a short brand term/domain."""
    if not identifier or not isinstance(identifier, str):
        return False
    cleaned = identifier.strip()
    return 2 <= len(cleaned) <= 64


def _is_entertainment_topic(title: str, vibe_context: Optional[str] = None) -> bool:
    """Defer topic classification to the model."""
    return False


def _select_complementary_body_font(hero_font: str, is_fun_topic: bool = False) -> Optional[str]:
    """No-op font pairing; let theme resolution handle fonts."""
    return None


async def _ai_extract_brand(title: str) -> Optional[Dict[str, str]]:
    """No-op brand extraction; prefer explicit brandContext inputs."""
    return None


async def _select_brand_appropriate_fonts(brand_name: str, brand_domain: Optional[str] = None) -> Dict[str, str]:
    """Return neutral defaults when brand fonts are unavailable."""
    return {"hero": "Montserrat", "body": "Open Sans"}


async def _hydrate_style_preferences(
    style_prefs: Optional[StylePreferencesItem],
    domain_hint: Optional[str] = None,
    outline_title: Optional[str] = None,
) -> Optional[StylePreferencesItem]:
    """Return style preferences unchanged; agent handles branding decisions."""
    return style_prefs
