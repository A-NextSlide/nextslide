import json
from typing import Optional, Dict, Any, get_origin, get_args
from pydantic import BaseModel, Field, model_validator
from pydantic import create_model as create_pydantic_model
from pydantic_core import PydanticUndefined
from pydantic.json_schema import SkipJsonSchema
# from json_schema_to_pydantic import create_model as create_model_from_schema
try:
    from json_schema_to_pydantic import create_model as create_model_from_schema
except ImportError:
    def create_model_from_schema(schema):
        # Fallback for when json_schema_to_pydantic is not available
        return create_pydantic_model("TempModel")
from utils.pydantic import pop_default_from_schema, rename_pydantic_model
from instructor.dsl.partial import PartialLiteralMixin

class PositionModel(BaseModel):
    x: float
    y: float

class PropsModelBase(BaseModel):
    """Base class for all props models"""
    model_config = { 
        "extra": "allow"  # Allow extra fields not defined in the model
    }
    position: PositionModel = Field(description="The position of the component in 1920x1080 reference frame")
    width: float = Field(description="The width of the component in pixels on a 1920x1080 reference frame")
    height: float = Field(description="The height of the component in pixels on a 1920x1080 reference frame")

class PropsDiffModelBase(BaseModel, PartialLiteralMixin):
    """Base class for all props diff models"""
    model_config = { 
        "exclude_none": True,
        "extra": "allow"  # Allow extra fields not defined in the model
    }
    position: Optional[PositionModel] = Field(description="The position of the component in 1920x1080 reference frame")
    width: Optional[float] = Field(description="The width of the component in pixels on a 1920x1080 reference frame")
    height: Optional[float] = Field(description="The height of the component in pixels on a 1920x1080 reference frame")

    # @model_validator(mode='after')
    def remove_none_values(self) -> 'BaseModel':
        model_dict = self.model_dump()
        filtered_dict = {k: v for k, v in model_dict.items() if v is not None}
        return self.model_validate(filtered_dict)

def create_props_model(type_name: str, schema: Dict[str, Any]) -> type[BaseModel]:
    model = create_model_from_schema(schema)
    fields = {}

    for name, field in model.model_fields.items():
        base_type = field.annotation or field.outer_type_

        # Keep core layout fields required; others become Optional
        if name in ("position", "width", "height"):
            annotated_type = base_type
            default_value = field.default if field.default is not PydanticUndefined else PydanticUndefined
        else:
            # Wrap in Optional to allow None/missing values for rich schemas (enums, literals, numbers)
            try:
                annotated_type = Optional[base_type]  # type: ignore
            except TypeError:
                annotated_type = base_type
            default_value = field.default if field.default is not PydanticUndefined else None

        new_field = Field(
            default=default_value,
            description=field.description,
        )

        fields[name] = (annotated_type, new_field)

    return create_pydantic_model(
        f"{type_name}Props",
        **fields,
        __base__=PropsModelBase
    )

def create_diff_model(model: type[BaseModel]) -> type[BaseModel]:
    fields = {}

    for name, field in model.model_fields.items():
        field_type = field.annotation or field.outer_type_

        new_field = Field(
            default=None,
            description=field.description,
            json_schema_extra=pop_default_from_schema,
        )
        fields[name] = (field_type | SkipJsonSchema[None], new_field)

    return create_pydantic_model(
        f"{model.__name__}Diff",
        **fields,
        __base__=PropsDiffModelBase
    )

def create_props_diff_model(type_name: str, schema: Dict[str, Any]) -> type[BaseModel]:
    model = create_props_model(type_name, schema)
    model = create_diff_model(model)
    return rename_pydantic_model(model, f"{type_name}PropsDiff")
