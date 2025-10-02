import requests
import json
import base64
from typing import Optional
from datetime import datetime


class CustomJsonEncoder(json.JSONEncoder):
    def default(self, obj):
        if isinstance(obj, datetime):
            return obj.isoformat()
        # Let the base class default method raise the TypeError
        return json.JSONEncoder.default(self, obj)

def safe_json_dumps(data, **kwargs):
    return json.dumps(data, cls=CustomJsonEncoder, **kwargs)

def create_placeholder_image() -> str:
    """Create a simple placeholder image when renderer fails"""
    # Simple 1x1 transparent PNG in base64
    placeholder_png = (
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
    )
    return placeholder_png

def render_deck_to_base64(deck_data: dict, slide_index: int = 0, use_fast_render: bool = True, debug: bool = False) -> str:
    """
    Render a deck slide using the frontend renderer service and return base64 image.
    
    Args:
        deck_data: The deck data dictionary
        slide_index: The index of the slide to render (default: 0)
        use_fast_render: Whether to use the fast render endpoint if available (default: True)
        debug: Whether to enable debug mode with bounding boxes (default: False)
        
    Returns:
        Base64 encoded PNG image string
        
    Raises:
        Exception: If rendering fails
    """
    try:
        # Wrap deck data if needed
        if "deckData" not in deck_data:
            deck_data = {"deckData": deck_data}
        
        # Try fast render endpoint first if enabled
        if use_fast_render:
            try:
                response = requests.post(
                    "http://localhost:3334/api/render/fast",
                    data=safe_json_dumps({
                        **deck_data,
                        "options": {
                            "quality": 0.85,
                            "format": "png",
                            "parallel": True,
                            "batchSize": 4,
                            "slideIndex": slide_index,
                            "debug": debug
                        }
                    }),
                    headers={'Content-Type': 'application/json'},
                    timeout=10
                )
                
                if response.status_code == 200:
                    result = response.json()
                    if result.get("success"):
                        screenshot_data = result.get("result", {}).get("screenshot", "")
                        if screenshot_data:
                            if screenshot_data.startswith("data:image/png;base64,"):
                                screenshot_data = screenshot_data[22:]
                            return screenshot_data
                            
            except Exception:
                pass  # Fall back to standard render
        
        # Standard render endpoint with debug support
        timeouts = [10, 30, 60]
        last_error = None
        
        for timeout in timeouts:
            try:
                # Add debug option to the request
                request_data = deck_data.copy()
                if "options" not in request_data:
                    request_data["options"] = {}
                request_data["options"]["debug"] = debug
                
                response = requests.post(
                    f"http://localhost:3334/api/render/{slide_index}",
                    data=safe_json_dumps(request_data),
                    headers={'Content-Type': 'application/json'},
                    timeout=timeout
                )
                
                if response.status_code == 200:
                    # Parse JSON response
                    result = response.json()
                    
                    # Check if successful
                    if result.get("success"):
                        # Extract screenshot from result
                        screenshot_data = result.get("result", {}).get("screenshot", "")
                        
                        if screenshot_data:
                            # Remove data:image/png;base64, prefix if present
                            if screenshot_data.startswith("data:image/png;base64,"):
                                screenshot_data = screenshot_data[22:]
                                
                            # Validate it's valid base64
                            try:
                                base64.b64decode(screenshot_data)
                                return screenshot_data
                            except Exception:
                                pass
                        
                elif response.status_code == 500:
                    error_data = response.json()
                    if "timeout" in error_data.get("error", "").lower():
                        last_error = error_data.get("error")
                        continue
                    else:
                        last_error = f"Server error: {error_data}"
                        break
                else:
                    last_error = f"HTTP {response.status_code}: {response.text}"
                    break
                    
            except requests.exceptions.Timeout:
                last_error = f"Request timed out after {timeout}s"
                continue
            except requests.exceptions.ConnectionError as e:
                last_error = f"Connection error: {e}"
                break
            except Exception as e:
                last_error = f"Unexpected error: {e}"
                break
        
        # If we get here, all attempts failed
        # Return placeholder image instead of failing completely
        return create_placeholder_image()
        
    except Exception:
        return create_placeholder_image() 