from pydantic import BaseModel, Field
from pydantic import create_model, model_validator
from typing import Dict, Any, Type, Literal
from uuid import uuid4

# ComponentBase class for all component type
class ComponentBase(BaseModel):
    """
    Base class for all component types
    For typed components, use the create_component_model function in registry.py
    """
    id: str = Field(default_factory=lambda: str(uuid4()))
    type: str = Field(description="The type of the component: Note this must match the Model Schema type")
    props: Dict[str, Any] = Field(default_factory=dict)


class ComponentDiffBase(BaseModel):
    """Represents a comprehensive diff of changes to apply to a component"""
    id: str  # ID of the component to update
    type: str = Field(None, description="Type of the component (required for components_to_add)")
    props: Dict[str, Any] = Field(default_factory=dict, description="Properties of the component to update ")


def validate_component_type(type, component):
    if type != component.type:
        raise ValueError(f"Component type mismatch: {type} != {component.type}")
    return component

def create_typed_component_model(
    type_name: str,
    props_model: type[BaseModel]
) -> Type[ComponentBase]:
    """
    Create a component model for a specific type.
    
    Args:
        type_name: The component type name
        schema: The schema for this component type
        
    Returns:
        A ComponentBase subclass for this component type
    """

     # Create field definitions for the model
    field_definitions = {
        "type": (Literal[type_name], Field(description=f"Note this must match the Model Schema of the component: {type_name}")),
        "props": (props_model, Field(description=f"The properties of the {type_name} component this must match the Model Schema of the component"))
    }
    
    # Create the model without _component_type to avoid Pydantic warnings
    model = create_model(
        f"{type_name}Component",
        __base__=ComponentBase,
        **field_definitions
    )
    
    # Store component type as a class attribute after creation
    model.__component_type__ = type_name
    
    return model

def create_typed_component_diff_model(
    type_name: str,
    props_diff_model: type[BaseModel],
) -> Type[ComponentDiffBase]:
    """
    Create a component diff model for a specific type.
    """
    
    field_definitions = {
        "type": (Literal[type_name], Field(description=f"Note this must match the Model Schema of the component: {type_name}")),
        "props": (props_diff_model, Field(description=f"The properties of the {type_name} component to update"))
    }
    
    return create_model(
        f"{type_name}ComponentDiff",
        __base__=ComponentDiffBase,
        **field_definitions
    )
