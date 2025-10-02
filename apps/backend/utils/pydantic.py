from typing import Dict, Any, List, Literal

def get_field_type(field_schema: Dict[str, Any]) -> Any:
    """
    Determine the Python type from a field schema definition.
    
    Args:
        field_schema: The schema for a single field
        
    Returns:
        The corresponding Python type
    """
    schema_type = field_schema.get("type", "string")
    
    # Handle basic types
    if schema_type == "string":
        return str
    elif schema_type == "number":
        return float
    elif schema_type == "integer":
        return int
    elif schema_type == "boolean":
        return bool
    elif schema_type == "color":
        # Colors are typically strings in hex format
        return str
    elif schema_type == "enum":
        # For enums, create a Literal type with the allowed values
        enum_values = field_schema.get("enumValues", [])
        if not enum_values:
            return str
        
        # Create a Literal type with all possible values
        if len(enum_values) == 1:
            return Literal[enum_values[0]]
        return Literal[tuple(enum_values)]
    elif schema_type == "array":
        # For array types
        items = field_schema.get("items", {})
        item_type = get_field_type(items) if items else Any
        return List[item_type]
        
    # Default to Any for unknown types
    return Any

# Function to find components of a specific type in a slide
def find_components_by_type(slide, component_type):
    """
    Find all components of a specific type in a slide
    
    Args:
        slide: The slide object containing components
        component_type: The type of component to search for
        
    Returns:
        List of components matching the specified type
    """
    return [comp for comp in slide["components"] if comp["type"] == component_type]

def pop_default_from_schema(s):
    """
    Pop the default value from a schema
    """
    s.pop('default', None)

def rename_pydantic_model(model_class, new_name):
    # Create a new class with the same bases and namespace
    namespace = dict(model_class.__dict__)
    new_model = type(new_name, model_class.__bases__, namespace)
    
    # Copy over any special attributes that might be lost
    for attr in dir(model_class):
        if attr.startswith('__') and attr.endswith('__'):
            continue
        if not hasattr(new_model, attr):
            setattr(new_model, attr, getattr(model_class, attr))
    
    return new_model
