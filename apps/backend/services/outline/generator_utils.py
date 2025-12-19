from typing import Optional, Tuple
import re
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def extract_image_prompt_from_content(content: str) -> Tuple[str, Optional[str]]:
    """Extract [IMAGE: ...] tag from content and return cleaned content and prompt."""
    pattern = r'\[IMAGE:\s*([^\]]+)\]'
    match = re.search(pattern, content, re.IGNORECASE)
    if match:
        image_prompt = match.group(1).strip()
        cleaned_content = re.sub(pattern, '', content, flags=re.IGNORECASE).strip()
        cleaned_content = re.sub(r'\n{3,}', '\n\n', cleaned_content)
        logger.debug(f"[IMAGE EXTRACT] Extracted image prompt: '{image_prompt}'")
        return cleaned_content, image_prompt
    return content, None
