from typing import Any, Dict, List, Optional, Type
from models.deck import create_typed_deck_model, create_typed_deck_diff_model
from models.slide import create_typed_slide_model, create_typed_slide_diff_model
from models.component import create_typed_component_model, create_typed_component_diff_model, ComponentBase, ComponentDiffBase
from models.props import create_props_model, create_diff_model

class ComponentRegistry:
    """
    A centralized registry that provides access to all typed models.
    
    This class creates and maintains typed models for components, slides, decks, 
    and diffs based on a registry definition.
    
    It can now work with either traditional registry definitions or
    TypeBox schemas received from the frontend.
    
    Example usage:
        registry = ComponentRegistry(registry_data, global_properties)
        
        # Get specific component model
        TextBlock = registry.get_component_model("TextBlock")
        
        # Create a typed slide
        slide = registry.SlideModel(title="My Slide", components=[...])
        
        # Create a typed component diff
        component_diff = registry.ComponentDiffModel(id="comp-1", type="TextBlock", props={...})
    """
    
    def __init__(self, json_schemas: Optional[Dict[str, Any]]):
        """
        Initialize the registry with component definitions and global properties.
        
        Args:
            registry_data: A dictionary mapping component types to their definitions
            global_properties: Optional global properties that apply to all components
            json_schemas: Optional JSON schemas for more accurate type definitions
        """
        self._json_schemas = json_schemas or {}
        self._props_models = {}
        self._props_diff_models = {}
        self._component_models = {}
        self._component_diff_models = {}
        

        # Process traditional registry data for any remaining components
        for type_name, schema in self._json_schemas.items():
            self._props_models[type_name] = create_props_model(type_name, schema["schema"])
            self._props_diff_models[type_name] = create_diff_model(self._props_models[type_name])

            self._component_models[type_name] = create_typed_component_model(type_name, self._props_models[type_name])
            self._component_diff_models[type_name] = create_typed_component_diff_model(type_name, self._props_diff_models[type_name])

        self.SlideModel = create_typed_slide_model(self._component_models)
        self.SlideDiffModel = create_typed_slide_diff_model(self._component_models, self._component_diff_models)

        self.DeckModel = create_typed_deck_model(self.SlideModel)
        self.DeckDiffModel = create_typed_deck_diff_model(self.SlideModel, self.SlideDiffModel)

    def get_json_schemas(self):
        return self._json_schemas
    
    def get_deck_model(self):
        return self.DeckModel
    
    def get_component_model(self, component_type: str):
        """
        Get the model class for a specific component type.
        
        Args:
            component_type: The type of component to get the model for
            
        Returns:
            The component model class or None if not found
        """
        return self._component_models.get(component_type)
    
    def get_component_diff_model(self, component_type: str):
        """
        Get the component diff model class for a specific component type.
        
        Args:
            component_type: The type of component to get the diff model for
            
        Returns:
            The component diff model class or None if not found
        """
        return self._component_diff_models.get(component_type)
    
    def get_component_diff_types(self) -> List[str]:
        """
        Get a list of all registered component diff types.
        
        Returns:
            List of component diff type names
        """
        return list(self._component_diff_models.keys())
    
    def get_all_component_diff_models(self):
        """
        Get all component diff model classes.
        
        Returns:
            Dictionary mapping component types to their diff model classes
        """
        return self._component_diff_models
    
    def get_component_types(self) -> List[str]:
        """
        Get a list of all registered component types.
        
        Returns:
            List of component type names
        """
        return list(self._component_models.keys())
    
    def get_component_schema(self, component_type: str):
        """
        Get the schema for a specific component type.
        
        Args:
            component_type: The type of component to get the schema for
            
        Returns:
            The component schema or None if not found
        """
        return self._component_models.get(component_type).model_json_schema()
    
    def get_component_model(self, component_type: str):
        """
        Get the model for a specific component type.
        
        Args:
            component_type: The type of component to get the model for
            
        Returns:
            The component model or None if not found
        """
        return self._component_models[component_type]
    
    def get_component_diff_model(self, component_type: str):
        """
        Get the model for a specific component diff type.
        
        Args:
            component_type: The type of component to get the schema for
            
        Returns:
            The component diff model or None if not found
        """
        return self._component_diff_models.get(component_type)
    
    def validate_deck_data(self, deck_data: Dict[str, Any]):
        """
        Validate deck data against the deck model
        """
        return self.DeckModel.model_validate(deck_data)
    

    def validate_deck_diff_data(self, deck_diff_data: Dict[str, Any]):
        """
        Validate deck diff data against the deck diff model
        """
        return self.DeckDiffModel.model_validate(deck_diff_data)
