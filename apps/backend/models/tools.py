from typing import Literal, List
from pydantic import BaseModel, Field

class ToolModel(BaseModel):
    tool_name: Literal["undefined"] = Field(description="The name of the tool")

def undefined_tool(tool_args: ToolModel, state: any):
    raise Exception(f"Tool {tool_args.tool_name} is not defined")

def get_tools_descriptions(tools: List[ToolModel]):
    return "\n".join([f"{tool.model_json_schema()['title']}: {tool.model_fields['tool_name'].description}" for tool in tools])