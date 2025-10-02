from typing import Dict, Any, Optional

def find_current_slide(deck_data: Dict[str, Any], slide_id: Optional[str] = None, current_slide_index: Optional[int] = None) -> Optional[Dict[str, Any]]:
    """
    Find the current slide in the deck data based on slide_id or current_slide_index
    
    Args:
        deck_data: The complete deck data
        slide_id: Optional ID of the slide to find
        current_slide_index: Optional index of the slide to find
        
    Returns:
        The current slide data or None if not found
    """
    current_slide = None
    
    if not deck_data:
        return None
        
    # Normalize slides iterable for typed models or plain dicts
    slides_iter = []
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])

    # First try to get slide by ID
    if slide_id:
        for slide in slides_iter:
            sid = getattr(slide, 'id', None)
            if sid is None and isinstance(slide, dict):
                sid = slide.get('id')
            if sid == slide_id:
                current_slide = slide
                break
        if not current_slide:
            print(f"Slide with ID {slide_id} not found in deck data")

    # If no slide by ID, try using current_slide_index
    elif current_slide_index is not None:
        try:
            if 0 <= current_slide_index < len(slides_iter):
                current_slide = slides_iter[current_slide_index]
            else:
                print(f"Slide index {current_slide_index} out of range (0-{len(slides_iter)-1})")
        except Exception as e:
            print(f"Error getting slide by index: {str(e)}")
            
    return current_slide



def find_component_by_id(deck_data, component_id):
    """
    Find a component by its ID in the deck data and return its properties.
    
    Args:
        deck_data: The full deck data object
        component_id: The ID of the component to find
        
    Returns:
        A dictionary containing:
        - component: The full component object if found
        - slide_id: The ID of the slide containing the component
        - slide_index: The index of the slide in the deck
        - is_background: Boolean indicating if the component is a slide background
        Or None if the component is not found
    """
    if not deck_data or not component_id:
        return None
    
    # Resolve slides for typed models or plain dicts
    slides_iter = []
    if hasattr(deck_data, 'slides'):
        slides_iter = list(getattr(deck_data, 'slides', []) or [])
    elif isinstance(deck_data, dict):
        slides_iter = list(deck_data.get('slides', []) or [])

    for slide_index, slide in enumerate(slides_iter):
        slide_id = getattr(slide, 'id', None)
        if slide_id is None and isinstance(slide, dict):
            slide_id = slide.get('id')
        
        # Check if the component is in the slide's components
        if hasattr(slide, 'components'):
            comps = list(getattr(slide, 'components', []) or [])
        elif isinstance(slide, dict):
            comps = list(slide.get('components', []) or [])
        else:
            comps = []
        for component in comps:
            cid = getattr(component, 'id', None)
            if cid is None and isinstance(component, dict):
                cid = component.get('id')
            if cid == component_id:
                return {
                    "component": component,
                    "slide_id": slide_id,
                    "slide_index": slide_index,
                    "is_background": False
                }
    
    # Component not found
    return None

def get_component_properties(deck_data, component_id):
    """
    Get the properties of a component by its ID.
    
    Args:
        deck_data: The full deck data object
        component_id: The ID of the component to find
        
    Returns:
        A dictionary containing the component's properties and metadata,
        or None if the component is not found
    """
    result = find_component_by_id(deck_data, component_id)
    
    if not result:
        return None
    
    component = result["component"]
    
    # Create a response with component metadata and properties
    response = {
        "id": component.get("id", ""),
        "type": component.get("type", ""),
        "slide_id": result["slide_id"],
        "slide_index": result["slide_index"],
        "is_background": result["is_background"]
    }
    
    # Add all properties from the component's props
    if "props" in component:
        response["props"] = component["props"]
    
    return response

def create_grid_layout(slide_data, grid_rows=1080, grid_cols=1920):
    """
    Create a grid-based coordinate system representation of slide components.
    
    Args:
        slide_data: The slide data object containing components
        grid_rows: Number of rows in the grid (default: 1080)
        grid_cols: Number of columns in the grid (default: 1920)
        
    Returns:
        A string representation of the grid layout with components positioned in cells
    """
    # Extract all components with their geometric information
    components_data = extract_component_geometry(slide_data)
    
    if not components_data["components"]:
        return f"No components with valid geometry{components_data['skipped_message']}"
    
    all_components = components_data["components"]
    skipped_count = components_data["skipped_count"]
    
    # Process each component to convert to grid coordinates
    components = []
    for z_index, component in enumerate(all_components, 1):
        left, top, right, bottom = component["bounds"]
        
        # Convert to grid cells (1-based indexing for readability)
        # We'll map directly from 0-100 to 1-101 by adding 1
        start_col = int(left) + 1
        start_row = int(top) + 1
        end_col = int(right) + 1
        end_row = int(bottom) + 1
        
        components.append({
            "id": component["id"],
            "type": component["type"],
            "start_col": start_col,
            "start_row": start_row,
            "end_col": end_col,
            "end_row": end_row,
            "z_index": z_index,
            # Add normalized coordinates for reference
            "normalized": {
                "left": left,
                "top": top,
                "right": right,
                "bottom": bottom
            }
        })
    
    # Generate the layout string
    layout_text = f"Grid: Canvas Spans from cell(0,0) to cell({grid_cols},{grid_rows})\n"
    
    if skipped_count > 0:
        layout_text += f"   Skipped components: {skipped_count} (missing position or dimension properties)\n"
        
    layout_text += f"   Elements: {len(components)}\n"
    
    for comp in components:
        layout_text += f"   - id: {comp['id']}, type: {comp['type']}, "
        
        # Describe position in grid cells
        layout_text += f"layout: cell({comp['start_col']},{comp['start_row']}) to cell({comp['end_col']},{comp['end_row']}), "
        
        # Note if component is partially or fully out of bounds
        bounds_notes = []
        if comp['start_col'] < 1:
            bounds_notes.append("extends left")
        if comp['start_row'] < 1:
            bounds_notes.append("extends above")
        if comp['end_col'] > grid_cols:
            bounds_notes.append("extends right")
        if comp['end_row'] > grid_rows:
            bounds_notes.append("extends below")
            
        if bounds_notes:
            layout_text += f"bounds: {', '.join(bounds_notes)}, "
            
        layout_text += f"z-index: {comp['z_index']}\n"
    
    return layout_text

def create_overlap_matrix(slide_data):
    """
    Create a matrix showing which components overlap with each other.
    Background is ignored as it's implied to overlap with everything.
    
    Args:
        slide_data: The slide data object containing components
        
    Returns:
        A string representation of the overlap matrix
    """
    # Extract all components with their geometric information
    components_data = extract_component_geometry(slide_data)
    
    if not components_data["components"]:
        return f"Insufficient components to create an overlap matrix{components_data['skipped_message']}"
    
    all_components = components_data["components"]
    skipped_count = components_data["skipped_count"]
    
    # If we have only one component, return early
    if len(all_components) <= 1:
        skipped_msg = f" ({skipped_count} components skipped due to missing properties)" if skipped_count > 0 else ""
        return f"Insufficient components to create an overlap matrix{skipped_msg}"
    
    # Create labels for the matrix (type + id)
    labels = [f"{comp['id']}" for comp in all_components]
    
    # Initialize the matrix with "-" for no overlap
    matrix = [["-" for _ in range(len(labels))] for _ in range(len(labels))]
    
    # Fill the matrix with "X" where components overlap
    for i in range(len(all_components)):
        for j in range(i+1, len(all_components)):
            comp_i = all_components[i]
            comp_j = all_components[j]
            
            # Calculate if the components overlap using the visible bounds
            left_i, top_i, right_i, bottom_i = comp_i["visible_bounds"]
            left_j, top_j, right_j, bottom_j = comp_j["visible_bounds"]
            
            # Check for overlap
            overlap = (
                left_i < right_j and 
                right_i > left_j and 
                top_i < bottom_j and 
                bottom_i > top_j
            )
            
            if overlap:
                matrix[i][j] = "X"
                matrix[j][i] = "X"
    
    # Set diagonal to "-" (component doesn't overlap with itself)
    for i in range(len(matrix)):
        matrix[i][i] = "-"
    
    # Generate the matrix string
    matrix_text = "Overlap Matrix:\n"
    
    if skipped_count > 0:
        matrix_text += f"Skipped components: {skipped_count} (missing position or dimension properties)\n"
        
    # Header row
    header = "           |"
    for label in labels:
        header += f" {label.ljust(10)} |"
    matrix_text += header + "\n"
    
    # Separator row
    separator = "   -----------+"
    for _ in labels:
        separator += "-" * 12 + "+"
    matrix_text += separator + "\n"
    
    # Data rows
    for i, label in enumerate(labels):
        row = f"    {label.ljust(10)} |"
        for j in range(len(labels)):
            row += f" {matrix[i][j].center(10)} |"
        matrix_text += row + "\n"
    
    return matrix_text

def extract_component_geometry(slide_data, deck_width=1920, deck_height=1080):
    """
    Extract geometric information from slide components.
    
    Args:
        slide_data: The slide data object containing components
        
    Returns:
        A dictionary containing:
        - components: List of components with their geometric information
        - skipped_count: Number of components skipped due to missing properties
        - skipped_message: A message about skipped components if any
    """
    if not slide_data or "components" not in slide_data:
        return {
            "components": [],
            "skipped_count": 0,
            "skipped_message": ""
        }
    
    # Extract all components (skip background as it's implied to overlap with everything)
    all_components = []
    skipped_count = 0
    
    # Process regular components
    for component in slide_data.get("components", []):
        comp_id = component.get("id", "")
        comp_type = component.get("type", "")
        
        # Skip components without props
        if "props" not in component or component.get("props") is None:
            skipped_count += 1
            continue
        
        props = component["props"]
        
        # Validate required fields exist and are non-null
        position = props.get("position") if isinstance(props, dict) else None
        width = props.get("width") if isinstance(props, dict) else None
        height = props.get("height") if isinstance(props, dict) else None
        if not isinstance(position, dict) or position.get("x") is None or position.get("y") is None or width is None or height is None:
            skipped_count += 1
            continue
        
        # Get normalized position and dimensions
        x = position.get("x")
        y = position.get("y")
        
        # Calculate bounds (left, top, right, bottom)
        left = x - width / 2
        top = y - height / 2
        right = x + width / 2
        bottom = y + height / 2
        
        # For overlap matrix, we clamp to visible area
        visible_left = max(0, left)
        visible_top = max(0, top)
        visible_right = min(deck_width, right)
        visible_bottom = min(deck_height, bottom)
        
        all_components.append({
            "id": comp_id,
            "type": comp_type,
            "bounds": (left, top, right, bottom),
            "visible_bounds": (visible_left, visible_top, visible_right, visible_bottom)
        })
    
    # Create a message about skipped components
    skipped_message = f" ({skipped_count} components skipped due to missing properties)" if skipped_count > 0 else ""
    
    return {
        "components": all_components,
        "skipped_count": skipped_count,
        "skipped_message": skipped_message
    }

def get_all_component_ids(deck_data, slide_id=None):
    """
    Get all component IDs from the deck data.
    
    Args:
        deck_data: The full deck data object
        slide_id: Optional slide ID to filter components by
        
    Returns:
        A list of all component IDs in the deck, optionally filtered by slide ID
    """
    if not deck_data:
        return []
    
    component_ids = []

    # Typed models path
    if hasattr(deck_data, 'slides'):
        for slide in deck_data.slides:
            if slide_id and hasattr(slide, 'id') and slide.id != slide_id:
                continue
            if hasattr(slide, 'components'):
                for component in slide.components:
                    if hasattr(component, 'id'):
                        component_ids.append(component.id)
        return component_ids

    # Dict path
    if isinstance(deck_data, dict) and isinstance(deck_data.get('slides'), list):
        for slide in deck_data.get('slides', []):
            sid = slide.get('id') if isinstance(slide, dict) else None
            if slide_id and sid and sid != slide_id:
                continue
            for component in slide.get('components', []) or []:
                cid = component.get('id') if isinstance(component, dict) else None
                if cid:
                    component_ids.append(cid)
    
    return component_ids

def get_all_slide_ids(deck_data):
    """
    Get all slide IDs from the deck data.
    
    Args:
        deck_data: The full deck data object
        
    Returns:
        A list of all slide IDs in the deck
    """
    if not deck_data:
        return []
    
    slide_ids = []
    # Typed models path
    if hasattr(deck_data, 'slides'):
        for slide in deck_data.slides:
            if hasattr(slide, 'id'):
                slide_ids.append(slide.id)
        return slide_ids

    # Dict path
    if isinstance(deck_data, dict) and isinstance(deck_data.get('slides'), list):
        for slide in deck_data.get('slides', []):
            sid = slide.get('id') if isinstance(slide, dict) else None
            if sid:
                slide_ids.append(sid)
    
    return slide_ids

def get_component_info(deck_data, component_id):
    """
    Get the slide ID and component type for a given component ID.
    
    Args:
        deck_data: The full deck data object
        component_id: The ID of the component to find
        
    Returns:
        A dictionary containing:
        - slide_id: The ID of the slide containing the component
        - component_type: The type of the component
        Or None if the component is not found
    """
    if not deck_data or not component_id:
        return None
    
    result = find_component_by_id(deck_data, component_id)
    
    if not result:
        return None
    
    comp = result["component"]
    comp_type = getattr(comp, 'type', None)
    if comp_type is None and isinstance(comp, dict):
        comp_type = comp.get('type')
    return {
        "slide_id": result["slide_id"],
        "component_type": comp_type
    }
