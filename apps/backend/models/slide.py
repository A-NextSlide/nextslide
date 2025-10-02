from pydantic import BaseModel, Field, create_model, Discriminator
from typing import Dict, Any, List, Optional, Union, Type, Annotated
from uuid import uuid4
from models.component import create_typed_component_model, create_typed_component_diff_model
from models.component import ComponentBase, ComponentDiffBase

# SlideData model that matches your interface
class SlideBase(BaseModel):
    """
    Model representing a slide with dynamic components.
    For typed components, use the create_component_model function in registry.py
    
    Attributes:
        id: Unique identifier for the slide
        title: Title of the slide
        components: Optional list of component instances
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    title: str
    components: List[ComponentBase] = Field(default_factory=list)
    
class SlideDiffBase(BaseModel):
    """Represents a comprehensive diff of changes to apply to a slide"""
    slide_id: str  = Field(description="ID of the slide to update")
    components_to_add: List[ComponentBase] = Field(
        default_factory=list, 
        description="New components to add to the slide. Each component MUST have id, type, and props fields. Ensure units for position, width and height are in pixels from (0,0)-(1920,1080) NOT percentages."
    )
    components_to_update: List[ComponentDiffBase] = Field(
        default_factory=list, 
        description="Existing components to update, ensure units for position, width and height are in pixels from (0,0)-(1920,1080) NOT percentages, ensure we make property updates inside props object"
    )
    components_to_remove: List[str] = Field(default_factory=list, description="IDs of components to remove")
    slide_properties: Dict[str, Any] = Field(default_factory=dict, description="Properties of the slide itself to update")

def get_component_list_model(components_models_map: Dict[str, Any]):
    # Create a discriminated union based on the 'type' field
    component_types = list(components_models_map.values())
    
    if not component_types:
        # Fallback to ComponentBase if no specific types are registered
        components = (
            List[ComponentBase],
            Field(
                default_factory=list,
                description="Array of components that belong to this slide."
            )
        )
    else:
        # Create discriminated union first, then wrap in List
        ComponentUnion = Annotated[
            Union[tuple(component_types)],
            Field(discriminator='type')
        ]
        
        components = (
            List[ComponentUnion],
            Field(
                default_factory=list,
                description=f"Array of components that belong to this slide. Must be one of the registered component types: {', '.join(components_models_map.keys())}"
            )
        )
    return components

def get_component_diff_list_model(components_diff_models_map: Dict[str, Any]):
    # Create a discriminated union for component diffs based on the 'type' field  
    component_diff_types = list(components_diff_models_map.values())
    
    if not component_diff_types:
        # Fallback to ComponentDiffBase if no specific types are registered
        components = (
            List[ComponentDiffBase],
            Field(
                default_factory=list,
                description="Array of component diffs that belong to this slide."
            )
        )
    else:
        # Create discriminated union first, then wrap in List
        ComponentDiffUnion = Annotated[
            Union[tuple(component_diff_types)],
            Field(discriminator='type')
        ]
        
        components = (
            List[ComponentDiffUnion],
            Field(
                default_factory=list,
                description=f"Array of component diffs that belong to this slide. Must be one of the registered component types: {', '.join(components_diff_models_map.keys())}"
            )
        )
    return components


def create_typed_slide_model(
    components_models_map: Dict[str, Any],
) -> Type[SlideBase]:
    """
    Create a SlideData model that validates components based on a registry.
    
    Args:
        registry: A dictionary of registry entries for different component types
        global_properties: Optional global properties that apply to all components
        model_name: Name for the created slide class
        
    Returns:
        A SlideData subclass with type-specific validation
    """
    components = get_component_list_model(components_models_map)
    return create_model(
        "TypedSlideData",
        __base__=SlideBase,
        components=components
    )

def create_typed_slide_diff_model(
    components_models_map: Dict[str, Any],
    components_diff_models_map: Dict[str, Any],
) -> Type[SlideDiffBase]:
    """Create a SlideDiff model that validates components based on a registry."""

    components_to_add = get_component_list_model(components_models_map)
    components_to_update = get_component_diff_list_model(components_diff_models_map)

    return create_model(
        "TypedSlideDiffData",
        __base__=SlideDiffBase,
        components_to_add=components_to_add,
        components_to_update=components_to_update,
    )
 