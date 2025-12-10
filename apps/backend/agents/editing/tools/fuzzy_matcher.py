"""
Fuzzy string matching utilities for HTML editing.

Provides multiple strategies for finding text in HTML:
1. Exact match
2. Whitespace-normalized match
3. Case-insensitive match
4. Fuzzy match using SequenceMatcher
5. Plain text pattern match
"""

from typing import Optional, Tuple
from html import unescape
from difflib import SequenceMatcher
import re
import logging

logger = logging.getLogger(__name__)


def strip_html_tags(html: str) -> str:
    """Remove HTML tags to get plain text content."""
    # Remove script and style content
    html = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.DOTALL | re.IGNORECASE)
    html = re.sub(r'<style[^>]*>.*?</style>', '', html, flags=re.DOTALL | re.IGNORECASE)
    # Remove HTML tags
    text = re.sub(r'<[^>]+>', '', html)
    # Unescape HTML entities
    text = unescape(text)
    # Normalize whitespace
    text = re.sub(r'\s+', ' ', text).strip()
    return text


def normalize_whitespace(text: str) -> str:
    """Collapse all whitespace to single spaces."""
    return re.sub(r'\s+', ' ', text).strip()


def normalize_whitespace_aggressive(text: str) -> str:
    """Remove ALL whitespace for matching purposes."""
    return re.sub(r'\s+', '', text)


def find_fuzzy_match(html: str, search_text: str, threshold: float = 0.85) -> Tuple[Optional[str], float]:
    """
    Find the best fuzzy match for search_text in html using sliding window.

    Uses SequenceMatcher (similar to Aider's approach) to find approximate matches.
    Returns: (matched_string, similarity_ratio)
    """
    if not search_text or not html:
        return None, 0.0

    search_len = len(search_text)
    best_match = None
    best_ratio = 0.0
    best_pos = -1

    # Optimization: if search text is very long, use larger step size
    step = 1 if search_len < 100 else max(1, search_len // 20)

    # Try exact length first
    for i in range(0, len(html) - search_len + 1, step):
        candidate = html[i:i + search_len]
        ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
        if ratio > best_ratio:
            best_ratio = ratio
            best_match = candidate
            best_pos = i

    # If we found a good match with stepping, refine around that position
    if best_pos >= 0 and step > 1:
        start = max(0, best_pos - step)
        end = min(len(html) - search_len + 1, best_pos + step)
        for i in range(start, end):
            candidate = html[i:i + search_len]
            ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = candidate
                best_pos = i

    # Also try varying lengths (±15%) to handle whitespace differences
    for length_mult in [0.9, 1.1, 0.85, 1.15]:
        adj_len = int(search_len * length_mult)
        if adj_len < 5 or adj_len > len(html):
            continue
        for i in range(0, len(html) - adj_len + 1, step):
            candidate = html[i:i + adj_len]
            ratio = SequenceMatcher(None, search_text, candidate, autojunk=False).ratio()
            if ratio > best_ratio:
                best_ratio = ratio
                best_match = candidate

    if best_ratio >= threshold:
        return best_match, best_ratio

    return None, best_ratio


def find_whitespace_normalized_match(html: str, search_text: str) -> Optional[str]:
    """
    Find match by normalizing whitespace in both strings.

    Returns the actual HTML substring that matches when whitespace is normalized.
    """
    normalized_search = normalize_whitespace(search_text)
    if not normalized_search:
        return None

    search_len = len(search_text)

    # Try windows of varying sizes (whitespace can expand or contract)
    for window_mult in [1.0, 1.2, 1.5, 0.8, 2.0]:
        window_size = int(search_len * window_mult)
        if window_size < 5 or window_size > len(html):
            continue

        for i in range(len(html) - window_size + 1):
            candidate = html[i:i + window_size]
            normalized_candidate = normalize_whitespace(candidate)

            if normalized_candidate == normalized_search:
                return candidate

            # Also try aggressive normalization (remove all whitespace)
            if normalize_whitespace_aggressive(candidate) == normalize_whitespace_aggressive(search_text):
                return candidate

    return None


def find_text_in_html(html: str, search_text: str) -> Tuple[bool, Optional[str], Optional[str]]:
    """
    Find text in HTML and return the actual HTML substring to replace.

    Uses multiple strategies:
    1. Exact match
    2. Whitespace-normalized match
    3. Case-insensitive match
    4. Fuzzy match using SequenceMatcher
    5. Plain text pattern match

    Returns: (found, actual_html_string, suggestion)
    """
    # 1. Exact match (fastest)
    if search_text in html:
        return True, search_text, None

    # 2. Whitespace-normalized match
    normalized_match = find_whitespace_normalized_match(html, search_text)
    if normalized_match:
        return True, normalized_match, "Matched with normalized whitespace"

    # 3. Case-insensitive exact match
    lower_html = html.lower()
    lower_search = search_text.lower()
    if lower_search in lower_html:
        idx = lower_html.find(lower_search)
        actual = html[idx:idx + len(search_text)]
        return True, actual, f"Found with different case: '{actual[:50]}...'"

    # 4. Whitespace-normalized + case-insensitive
    normalized_search = normalize_whitespace(search_text).lower()
    for window_mult in [1.0, 1.2, 1.5, 0.8, 2.0]:
        window_size = int(len(search_text) * window_mult)
        if window_size < 5 or window_size > len(html):
            continue
        for i in range(len(html) - window_size + 1):
            candidate = html[i:i + window_size]
            if normalize_whitespace(candidate).lower() == normalized_search:
                return True, candidate, "Matched with normalized whitespace and case"

    # 5. Fuzzy matching (SequenceMatcher)
    fuzzy_match, ratio = find_fuzzy_match(html, search_text, threshold=0.85)
    if fuzzy_match:
        return True, fuzzy_match, f"Fuzzy match (similarity={ratio:.2%})"

    # 6. Plain text pattern match
    plain_search = strip_html_tags(search_text)
    if plain_search and len(plain_search) > 10:
        escaped_search = re.escape(plain_search)
        pattern = escaped_search.replace(r'\ ', r'(?:\s|<[^>]+>)*')
        match = re.search(pattern, html, re.IGNORECASE)
        if match:
            return True, match.group(0), "Matched plain text content with flexible whitespace"

    # 7. Generate helpful suggestions
    suggestion = None

    if len(search_text) > 30:
        partial = search_text[:30]
        if partial in html:
            idx = html.find(partial)
            context = html[max(0, idx-20):idx+50]
            suggestion = f"Partial match at position {idx}. Context: ...{context}..."
        else:
            short_partial = search_text[:15]
            if short_partial in html:
                idx = html.find(short_partial)
                suggestion = f"Very short partial match at position {idx}."

    plain_text = strip_html_tags(html)
    plain_search_text = strip_html_tags(search_text) if '<' in search_text else search_text
    if plain_search_text and plain_search_text in plain_text:
        suggestion = "Text content exists but HTML structure differs. Try searching without HTML tags."

    if ratio > 0.5:
        if suggestion:
            suggestion += f" Best fuzzy match: {ratio:.0%} similarity."
        else:
            suggestion = f"Best fuzzy match: {ratio:.0%} similarity (threshold is 85%)."

    return False, None, suggestion


def apply_replacement(html: str, old_string: str, new_string: str) -> Tuple[bool, str, Optional[str]]:
    """
    Apply a string replacement to HTML with fuzzy matching fallback.

    Returns: (success, modified_html, message)
    """
    # Try to find the string
    found, actual_string, suggestion = find_text_in_html(html, old_string)

    if not found or not actual_string:
        return False, html, suggestion or "String not found in HTML"

    # Apply replacement (only first occurrence)
    idx = html.find(actual_string)
    if idx == -1:
        return False, html, "String found but replacement failed"

    modified = html[:idx] + new_string + html[idx + len(actual_string):]
    return True, modified, suggestion
