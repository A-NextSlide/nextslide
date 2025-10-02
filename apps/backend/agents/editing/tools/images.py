from typing import Literal
from pydantic import Field

from models.tools import ToolModel
from utils.images import image_exists

class ValidateImageArgs(ToolModel):
    tool_name: Literal["validate_image"] = Field(description="Validate the image url")
    image_url: str = Field(description="The url of the image to validate")

def validate_image(edit_args: ValidateImageArgs, **kwargs):
    return image_exists(edit_args.image_url)