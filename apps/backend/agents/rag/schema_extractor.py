"""
Schema Extractor for RAG-based Slide Generation
Extracts minimal component schemas without metadata for efficient token usage
"""

import json
from pathlib import Path
from typing import Dict, Any, List, Optional, Set, Literal
from setup_logging_optimized import get_logger
from pydantic_core import PydanticUndefined

logger = get_logger(__name__)


class SchemaExtractor:
    """
    Extracts minimal schemas from typebox schemas for specific components
    """
    
    def __init__(self, schema_path: str = "schemas/typebox_schemas_latest.json"):
        # Handle relative paths from different directories
        self.schema_path = Path(schema_path)
        if not self.schema_path.exists():
            # Try from parent directory
            parent_path = Path(__file__).parent.parent.parent / schema_path
            if parent_path.exists():
                self.schema_path = parent_path
                logger.info(f"Using schema path: {self.schema_path}")
        
        self.schemas = self._load_schemas()
        self._cache = {}  # Cache processed schemas
        logger.info(f"Loaded schemas for {len(self.schemas)} components")
    
    def _load_schemas(self) -> Dict[str, Any]:
        """Load the complete typebox schemas"""
        try:
            with open(self.schema_path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.error(f"Failed to load schemas: {e}")
            return {}
    
    def get_minimal_schema(self, component_name: str) -> Dict[str, Any]:
        """Get minimal schema for a single component"""
        if component_name in self._cache:
            return self._cache[component_name]
        
        if component_name not in self.schemas:
            # Provide fallback minimal schemas for commonly used components that
            # may not be present in the TypeBox set yet
            fallback = self._get_fallback_schema(component_name)
            if fallback:
                logger.info(f"Using fallback minimal schema for {component_name}")
                self._cache[component_name] = fallback
                return fallback
            logger.warning(f"Component {component_name} not found in schemas")
            return {}
        
        full_schema = self.schemas[component_name].get("schema", {})
        minimal = self._extract_minimal(full_schema, component_name)
        
        self._cache[component_name] = minimal
        return minimal

    def _get_fallback_schema(self, component_name: str) -> Dict[str, Any]:
        """Return a minimal, safe schema for missing components to guide the model.
        This does not replace proper TypeBox schemas but helps prompt construction.
        """
        try:
            cn = component_name.strip()
            if cn in ('Line', 'Lines'):
                # Provide a richer fallback aligned with the frontend registry for Lines
                end_shape_enum = [
                    "none",
                    "arrow",
                    "circle",
                    "hollowCircle",
                    "square",
                    "hollowSquare",
                    "diamond",
                    "hollowDiamond"
                ]
                connection_type_enum = [
                    "straight",
                    "elbow",
                    "curved",
                    "quadratic",
                    "cubic"
                ]
                # The Lines component derives its bounds from endpoints; keep base styling props
                return {
                    "type": cn,
                    "properties": {
                        # Base visual props
                        "opacity": {"type": "number", "minimum": 0, "maximum": 1},
                        "rotation": {"type": "number", "minimum": 0, "maximum": 360},
                        "zIndex": {"type": "number"},
                        # Endpoints
                        "startPoint": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "connection": {
                                    "type": "object",
                                    "properties": {
                                        "componentId": {"type": "string"},
                                        "side": {"enum": [
                                            "top","right","bottom","left",
                                            "topLeft","topRight","bottomLeft","bottomRight","center"
                                        ], "type": "string"},
                                        "offset": {
                                            "type": "object",
                                            "properties": {"x": {"type": "number"}, "y": {"type": "number"}}
                                        }
                                    }
                                }
                            },
                            "required": ["x", "y"]
                        },
                        "endPoint": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"},
                                "connection": {
                                    "type": "object",
                                    "properties": {
                                        "componentId": {"type": "string"},
                                        "side": {"enum": [
                                            "top","right","bottom","left",
                                            "topLeft","topRight","bottomLeft","bottomRight","center"
                                        ], "type": "string"},
                                        "offset": {
                                            "type": "object",
                                            "properties": {"x": {"type": "number"}, "y": {"type": "number"}}
                                        }
                                    }
                                }
                            },
                            "required": ["x", "y"]
                        },
                        # Style
                        "connectionType": {"enum": connection_type_enum, "type": "string"},
                        "startShape": {"enum": end_shape_enum, "type": "string"},
                        "endShape": {"enum": end_shape_enum, "type": "string"},
                        "stroke": {"type": "string"},
                        "strokeWidth": {"type": "number", "minimum": 1, "maximum": 20},
                        "strokeDasharray": {"type": "string"},
                        # Curves
                        "controlPoints": {
                            "type": "array",
                            "items": {"type": "object", "properties": {"x": {"type": "number"}, "y": {"type": "number"}}}
                        }
                    },
                    "required": ["startPoint", "endPoint", "stroke", "strokeWidth"]
                }
            if cn == 'Group':
                return {
                    "type": "Group",
                    "properties": {
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        },
                        "width": {"type": "number", "minimum": 1, "maximum": 1920},
                        "height": {"type": "number", "minimum": 1, "maximum": 1080},
                        "opacity": {"type": "number", "minimum": 0, "maximum": 1},
                        "rotation": {"type": "number", "minimum": 0, "maximum": 360},
                        "zIndex": {"type": "number"},
                        "components": {"type": "array", "items": {"type": "object"}}
                    },
                    "required": ["position", "width", "height", "components"]
                }
            if cn == 'ShapeWithText':
                return {
                    "type": "ShapeWithText",
                    "properties": {
                        "position": {
                            "type": "object",
                            "properties": {
                                "x": {"type": "number"},
                                "y": {"type": "number"}
                            },
                            "required": ["x", "y"]
                        },
                        "width": {"type": "number"},
                        "height": {"type": "number"},
                        "opacity": {"type": "number"},
                        "rotation": {"type": "number"},
                        "zIndex": {"type": "number"},
                        "shapeType": {"enum": ["rectangle", "circle", "ellipse", "diamond", "rounded"], "type": "string"},
                        "fill": {"type": "string"},
                        "stroke": {"type": "string"},
                        "strokeWidth": {"type": "number"},
                        "texts": {"type": "array", "items": {"type": "object", "properties": {"text": {"type": "string"}}}}
                    },
                    "required": ["position", "width", "height", "shapeType"]
                }
        except Exception:
            pass
        return {}
    
    def _extract_minimal(self, schema: Dict[str, Any], component_name: str) -> Dict[str, Any]:
        """Extract minimal schema without metadata"""
        # Add debug logging for Icon component
        if component_name == "Icon":
            logger.debug(f"Processing Icon component schema: {schema.get('allOf', 'No allOf found')}")
        
        # Handle allOf pattern (common in TypeBox schemas)
        if "allOf" in schema:
            # Merge all schemas in allOf
            merged_properties = {}
            merged_required = []
            
            for sub_schema in schema["allOf"]:
                if "properties" in sub_schema:
                    merged_properties.update(sub_schema["properties"])
                if "required" in sub_schema:
                    merged_required.extend(sub_schema["required"])
            
            schema["properties"] = merged_properties
            schema["required"] = list(set(merged_required))  # Remove duplicates
            
            if component_name == "Icon":
                logger.debug(f"Icon merged properties: {list(merged_properties.keys())}")
        
        if not schema.get("properties"):
            return {}
        
        minimal = {
            "type": component_name,
            "properties": {}
        }
        
        # Add required fields if present
        if "required" in schema:
            minimal["required"] = schema["required"]
        
        # Special handling for Background component - add base component properties
        if component_name == "Background":
            # Add base component properties that are missing from the schema
            base_properties = {
                "position": {
                    "type": "object",
                    "properties": {
                        "x": {"type": "number"},
                        "y": {"type": "number"}
                    },
                    "required": ["x", "y"]
                },
                "width": {"type": "number", "minimum": 1, "maximum": 1920},
                "height": {"type": "number", "minimum": 1, "maximum": 1080},
                "opacity": {"type": "number", "minimum": 0, "maximum": 1},
                "rotation": {"type": "number", "minimum": 0, "maximum": 360},
                "zIndex": {"type": "number"}
            }
            # Merge base properties with existing ones
            schema["properties"] = {**base_properties, **schema.get("properties", {})}
            # Add base required fields
            base_required = ["position", "width", "height"]
            existing_required = schema.get("required", [])
            schema["required"] = base_required + [r for r in existing_required if r not in base_required]
        
        # Process each property
        for prop_name, prop_schema in schema.get("properties", {}).items():
            minimal["properties"][prop_name] = self._extract_property(prop_schema)
        
        if component_name == "Icon":
            logger.debug(f"Icon minimal schema: {minimal}")
        
        return minimal
    
    def _extract_property(self, prop: Dict[str, Any]) -> Dict[str, Any]:
        """Extract minimal property schema"""
        minimal = {}
        
        # Handle anyOf with const values (TypeBox enum pattern)
        if "anyOf" in prop:
            # Extract enum values from anyOf const patterns
            enum_values = []
            for option in prop["anyOf"]:
                if isinstance(option, dict) and "const" in option:
                    enum_values.append(option["const"])
            if enum_values:
                # Limit font enums to reduce token usage
                if len(enum_values) > 20 and any('font' in str(v).lower() for v in enum_values[:5]):
                    # Keep only essential fonts for token efficiency
                    essential_fonts = [
                        'Arial', 'Helvetica', 'Roboto', 'Open Sans', 'Montserrat', 
                        'Poppins', 'Raleway', 'Lato', 'Montserrat', 'Playfair Display',
                        'Merriweather', 'Bebas Neue', 'Orbitron', 'Oswald'
                    ]
                    enum_values = [v for v in enum_values if v in essential_fonts]
                    if not enum_values:  # Fallback if no match
                        enum_values = ['Arial', 'Helvetica', 'Roboto', 'Open Sans']
                minimal["enum"] = enum_values
                minimal["type"] = "string"  # Most enums are strings
                return minimal
        
        # Keep essential type information
        if "type" in prop:
            minimal["type"] = prop["type"]
        
        # Handle nested objects
        if prop.get("type") == "object" and "properties" in prop:
            minimal["properties"] = {}
            for sub_name, sub_prop in prop["properties"].items():
                minimal["properties"][sub_name] = self._extract_property(sub_prop)
            if "required" in prop:
                minimal["required"] = prop["required"]
        
        # Handle arrays
        elif prop.get("type") == "array" and "items" in prop:
            minimal["items"] = self._extract_property(prop["items"])
        
        # Keep essential constraints
        for constraint in ["minimum", "maximum", "enum", "pattern"]:
            if constraint in prop:
                minimal[constraint] = prop[constraint]
        
        # Special handling for specific properties
        if prop.get("_ui_type") == "UIArray" and "items" in prop:
            # This is likely the texts array in TiptapTextBlock
            minimal["description"] = "Array of text objects"
        
        return minimal
    
    def get_component_schemas(self, components: List[str]) -> Dict[str, Any]:
        """Get minimal schemas for multiple components"""
        schemas = {}
        for component in components:
            schema = self.get_minimal_schema(component)
            if schema:
                schemas[component] = schema
        return schemas
    
    def format_for_prompt(self, components: List[str]) -> str:
        """Format schemas for inclusion in prompt"""
        schemas = self.get_component_schemas(components)
        
        if not schemas:
            return ""
        
        formatted = ["COMPONENT SCHEMAS:\n"]
        
        for component, schema in schemas.items():
            formatted.append(f"\n{component}:")
            formatted.append(self._format_schema_readable(schema.get("properties", {}), indent=2))
        
        return "\n".join(formatted)
    
    def _format_schema_readable(self, properties: Dict[str, Any], indent: int = 0) -> str:
        """Format schema in a readable way for the prompt"""
        lines = []
        indent_str = " " * indent
        
        for prop_name, prop_schema in properties.items():
            prop_type = prop_schema.get("type", "any")
            
            if prop_type == "object" and "properties" in prop_schema:
                lines.append(f"{indent_str}{prop_name}: {{")
                lines.append(self._format_schema_readable(prop_schema["properties"], indent + 2))
                lines.append(f"{indent_str}}}")
            elif prop_type == "array":
                item_type = prop_schema.get("items", {}).get("type", "any")
                if "properties" in prop_schema.get("items", {}):
                    lines.append(f"{indent_str}{prop_name}: [")
                    lines.append(f"{indent_str}  {{")
                    lines.append(self._format_schema_readable(prop_schema["items"]["properties"], indent + 4))
                    lines.append(f"{indent_str}  }}")
                    lines.append(f"{indent_str}]")
                else:
                    lines.append(f"{indent_str}{prop_name}: {prop_type}<{item_type}>")
            else:
                # Add constraints if any
                constraints = []
                if "enum" in prop_schema:
                    # Format enum values nicely
                    enum_values = prop_schema['enum']
                    if len(enum_values) <= 3:
                        constraints.append(f"options: {' | '.join(str(v) for v in enum_values)}")
                    else:
                        constraints.append(f"options: {' | '.join(str(v) for v in enum_values[:3])} | ...")
                if "minimum" in prop_schema:
                    constraints.append(f"min: {prop_schema['minimum']}")
                if "maximum" in prop_schema:
                    constraints.append(f"max: {prop_schema['maximum']}")
                
                constraint_str = f" ({', '.join(constraints)})" if constraints else ""
                lines.append(f"{indent_str}{prop_name}: {prop_type}{constraint_str}")
        
        return "\n".join(lines)
    
    def get_example_for_component(self, component_name: str) -> Optional[Dict[str, Any]]:
        """Get a minimal example for a component based on its schema"""
        schema = self.get_minimal_schema(component_name)
        if not schema:
            return None
        
        example = {
            "type": component_name,
            "props": {}
        }
        
        # Generate example based on component type
        if component_name == "TiptapTextBlock":
            example["props"] = {
                "texts": [
                    {
                        "text": "Your text content here",
                        "style": {
                            "fontSize": 48,
                            "color": "#333333",
                            "fontFamily": "Open Sans"
                        }
                    }
                ],
                "position": {"x": 100, "y": 200},
                "width": 800,
                "height": 100,
                "padding": 0
            }
        elif component_name == "Image":
            example["props"] = {
                "src": "placeholder",
                "position": {"x": 0, "y": 0},
                "width": 1920,
                "height": 1080,
                "objectFit": "cover"
            }
        elif component_name == "Background":
            example["props"] = {
                "position": {"x": 0, "y": 0},
                "width": 1920,
                "height": 1080,
                "backgroundType": "gradient",
                "gradient": {
                    "type": "linear",
                    "angle": 135,
                    "stops": [
                        {"color": "#1E3A5F", "position": 0},
                        {"color": "#4A7BA7", "position": 100}
                    ]
                }
            }
        elif component_name == "Shape":
            example["props"] = {
                "position": {"x": 100, "y": 100},
                "width": 200,
                "height": 200,
                "shapeType": "rectangle",
                "fill": "#000000",
                "opacity": 0.1
            }
        elif component_name == "Chart":
            example["props"] = {
                "position": {"x": 80, "y": 140},
                "width": 880,
                "height": 700,
                "chartType": "bar",
                "theme": "light",
                "showLegend": False,
                "data": {
                    "categories": ["A", "B", "C"],
                    "series": [{"name": "Values", "data": [10, 20, 30]}]
                }
            }
        elif component_name == "Icon":
            example["props"] = {
                "position": {"x": 100, "y": 200},
                "width": 48,
                "height": 48,
                "opacity": 1,
                "rotation": 0,
                "zIndex": 3,
                "iconLibrary": "lucide",
                "iconName": "Star",
                "color": "#000000",
                "strokeWidth": 2,
                "filled": False
            }
        
        return example 