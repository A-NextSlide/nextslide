from typing import Optional, List
import re
from services.combined_image_service import CombinedImageService
import asyncio

STOP_WORDS = {
    'the','a','an','and','or','but','in','on','at','to','for','of','with','by','is','are','was','were',
    'been','being','have','has','had','do','does','did','will','would','could','should','may','might',
    'must','can','this','that','these','those','it','as','from','about','into','through','during','before',
    'after','above','below','between','under','over','please','make','apply','using','use','create','new',
    'component','replace','replacing','original','request','slide','context','maintaining','appropriate',
    'positioning','styling','effect','effects','style','styled','subtle','slight','beveled','edges','add'
}

ADJECTIVES = {
    'retro','vintage','warm','cool','modern','minimal','bold','chunky','golden','cream','off-white',
    'brown','orange','yellow','mustard','rust','sepia','diagonal','radial'
}

def _build_safe_image_query(text: str) -> str:
    """Extract a concise, safe image search query from a verbose request."""
    if not text:
        return ""

    # Remove sections after known markers (e.g., Slide context, Replace..., Original request)
    lowered = text.lower()
    for marker in ["slide context:", "slide context", "replace the following component:", "original request:"]:
        idx = lowered.find(marker)
        if idx != -1:
            text = text[:idx]
            lowered = text.lower()

    # Try to capture phrase after "image of|picture of|photo of"
    m = re.search(r"(?:image|picture|photo)\s+of\s+(.+)", lowered, flags=re.IGNORECASE)
    if m:
        candidate = m.group(1)
        # Stop at sentence end or newline
        candidate = re.split(r"[\.;\n]", candidate)[0]
        words = re.findall(r"[A-Za-z][A-Za-z\-']+", candidate)
    else:
        # Fallback: pick meaningful words from the whole request
        words = re.findall(r"[A-Za-z][A-Za-z\-']+", text)

    # Filter stop/adjective words and keep up to 3 tokens
    filtered: List[str] = []
    for w in words:
        wl = w.lower()
        if wl in STOP_WORDS or wl in ADJECTIVES:
            continue
        if len(wl) < 3:
            continue
        filtered.append(w)
        if len(filtered) >= 3:
            break

    # Fallback if filtering removed everything
    if not filtered and words:
        filtered = words[:2]

    query = " ".join(filtered)
    # Clamp query length
    if len(query) > 80:
        query = query[:80]
    return query.strip()


def get_image_search_context(component_request: str, num_results: int = 3) -> Optional[str]:
    """
    Generate dynamic context for image search based on component request.
    Uses the configured image provider to find high-quality images.
    
    Args:
        component_request (str): The component creation/editing request
        num_results (int): Number of image results to return
    
    Returns:
        Optional[str]: Formatted context string with image URLs, or None if no images found
    """
    try:
        image_service = CombinedImageService()
        
        # Extract safe, concise search terms from the request
        search_terms = _build_safe_image_query(component_request)
        if not search_terms:
            # Last resort: use the raw request, but clamped
            search_terms = component_request.strip()[:80]
        
        # Run async search in sync context
        async def search():
            results = await image_service.search_images(
                query=search_terms,
                per_page=num_results
            )
            return results.get('photos', [])
        
        # Get event loop and run the async function
        try:
            loop = asyncio.get_event_loop()
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
        
        photos = loop.run_until_complete(search())
        
        if not photos:
            return None
        
        # Extract URLs from photos
        image_urls = []
        for photo in photos:
            if 'src' in photo and 'large' in photo['src']:
                image_urls.append(photo['src']['large'])
            
        if not image_urls:
            return None
            
        # Format the context
        return f"""
        Here are some relevant high-quality images that match the description:
        {chr(10).join(f'- {url}' for url in image_urls)}
        
        These images were retrieved by the backend image search provider.
        Please use one of these URLs in the component's 'src' property if they are appropriate.
        """
        
    except Exception as e:
        print(f"Error generating image search context: {e}")
        return None

def extract_search_terms(request: str) -> str:
    # Backward compatibility wrapper; prefer _build_safe_image_query
    return _build_safe_image_query(request)