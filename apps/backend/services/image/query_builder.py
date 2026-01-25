"""Query extraction and AI enhancement for image search."""

import asyncio
import re
from typing import Optional

from setup_logging_optimized import get_logger

from .constants import GENERIC_IMAGE_TERMS

logger = get_logger(__name__)


def extract_query_from_prop_name(prop_name: str) -> str:
    """
    Convert a camelCase prop name to a search query.

    Examples:
        elonMuskImage -> "elon musk"
        googleCampusPhoto -> "google campus"
        heroBackgroundImg -> "hero"
    """
    if not prop_name:
        return ''

    # Remove common image-related suffixes
    clean_name = re.sub(
        r'(Image|Photo|Pic|Picture|Img|Src|Url|Background|Bg|Thumbnail|Avatar|Icon|Logo|Banner)$',
        '',
        prop_name,
        flags=re.IGNORECASE
    )

    # Convert camelCase to spaces
    spaced = re.sub(r'([a-z])([A-Z])', r'\1 \2', clean_name)
    # Handle numbers
    spaced = re.sub(r'([a-zA-Z])(\d)', r'\1 \2', spaced)
    spaced = re.sub(r'(\d)([a-zA-Z])', r'\1 \2', spaced)

    return spaced.strip().lower()


def is_generic_query(query: str) -> bool:
    """
    Check if a query is too generic to produce good image search results.

    Generic queries like "image", "photo", "placeholder" will return
    random stock images that don't match the intended content.
    """
    if not query:
        return True

    q_lower = query.lower().strip()

    # Very short queries are generic
    if len(q_lower) <= 3:
        return True

    # Extract words
    words = set(re.findall(r'[a-z]+', q_lower))

    # If all words are generic terms, it's a generic query
    if words and words.issubset(GENERIC_IMAGE_TERMS):
        return True

    # Single generic word
    if q_lower in GENERIC_IMAGE_TERMS:
        return True

    return False


def clean_query(query: str) -> str:
    """
    Clean and normalize a search query.

    - Strip whitespace
    - Remove template variable markers
    - Validate it's not empty
    """
    if not query:
        return ''

    cleaned = query.strip()

    # Skip template variables
    if cleaned.startswith('${') or cleaned.startswith('props.'):
        return ''

    return cleaned


async def enhance_query_with_ai(
    query: str,
    slide_context: str = '',
    max_words: int = 6,
    max_chars: int = 50,
) -> str:
    """
    Use AI to enhance a generic or vague query into a specific image search term.

    This extracts brand names, specific entities, and concrete objects from
    the slide context to create a more targeted search query.

    Args:
        query: The original search query (might be generic like "hero image")
        slide_context: Context about the slide content, brand, deck title, etc.
        max_words: Maximum words in the enhanced query
        max_chars: Maximum characters in the enhanced query

    Returns:
        Enhanced query string, or cleaned original if enhancement fails/unnecessary
    """
    try:
        from agents.ai.clients import get_client, invoke
        from agents.config import IMAGE_SEARCH_MODEL

        client, model_name = get_client(IMAGE_SEARCH_MODEL)

        # Extract brand info from context for better prompting
        brand_match = ''
        if 'BRAND:' in slide_context:
            brand_search = re.search(r'BRAND:\s*([^\|]+)', slide_context)
            if brand_search:
                brand_match = brand_search.group(1).strip()

        if not brand_match and 'Topic:' in slide_context:
            topic_search = re.search(r'Topic:\s*([^\|]+)', slide_context)
            if topic_search:
                topic = topic_search.group(1).strip()
                # Extract domain name as potential brand
                if '.com' in topic or '.ai' in topic or '.io' in topic:
                    brand_match = topic.split('.')[0].title()
                else:
                    brand_match = topic

        if not brand_match and 'Deck:' in slide_context:
            deck_search = re.search(r'Deck:\s*([^\|]+)', slide_context)
            if deck_search:
                brand_match = deck_search.group(1).strip()

        prompt = f"""Write a short Google Images search query for this slide image.

CURRENT QUERY: {query}
SLIDE CONTEXT: {slide_context[:400] if slide_context else 'Presentation slide'}
{f"BRAND: {brand_match}" if brand_match else ""}

Based on the context, what specific image should appear here? Use names, brands, or specific things mentioned in the context. Keep it 2-5 words.

Return ONLY the search query, nothing else."""

        loop = asyncio.get_event_loop()
        response = await loop.run_in_executor(
            None,
            invoke,
            client,
            model_name,
            [{'role': 'user', 'content': prompt}],
            None,
            max_chars,  # Short response for concise queries
            0.3,  # Low temperature for consistency
        )

        enhanced = str(response).strip().strip('"\'')

        # Validate enhanced query
        word_count = len(enhanced.split())
        is_valid = (
            enhanced and
            word_count <= max_words and
            len(enhanced) < max_chars and
            'cannot' not in enhanced.lower() and
            'I ' not in enhanced
        )

        if is_valid:
            logger.debug("[QUERY_BUILDER] AI enhanced: '%s' -> '%s'", query, enhanced)
            return enhanced

    except Exception as e:
        logger.debug("[QUERY_BUILDER] AI enhancement failed: %s", e)

    # Fallback to cleaned original
    cleaned = clean_query(query)
    logger.debug("[QUERY_BUILDER] Using cleaned query: '%s' -> '%s'", query, cleaned)
    return cleaned if cleaned else query


def build_search_context(
    brand_name: str = '',
    deck_title: str = '',
    slide_title: str = '',
    presentation_context: str = '',
    content: str = '',
) -> str:
    """
    Build a context string for image search enhancement.

    This combines various slide/deck context into a single string
    that can be used by AI to understand what images are needed.
    """
    parts = []

    if brand_name:
        parts.append(f'BRAND: {brand_name}')

    if deck_title and deck_title != brand_name:
        parts.append(f'Deck: {deck_title}')

    if presentation_context:
        parts.append(f'Topic: {presentation_context[:150]}')

    if slide_title:
        parts.append(f'Slide: {slide_title}')

    if content:
        parts.append(content[:200])

    return ' | '.join(parts)
