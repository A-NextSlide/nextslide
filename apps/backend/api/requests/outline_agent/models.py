from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field



class ChatMessage(BaseModel):
    """A single chat message."""
    role: str  # 'user' or 'assistant'
    content: str

class FileAttachment(BaseModel):
    """A file attached to the message."""
    id: str = Field(description="Unique file ID")
    name: str = Field(description="Original filename")
    type: str = Field(description="MIME type")
    content: Optional[str] = Field(default=None, description="Base64 encoded content")
    url: Optional[str] = Field(default=None, description="URL to the file")
    size: Optional[int] = Field(default=None, description="File size in bytes")

class OutlineAgentRequest(BaseModel):
    """Request to the outline generation agent."""
    message: str = Field(..., description="User's message")
    chat_history: List[ChatMessage] = Field(default_factory=list, description="Previous conversation")
    context: Optional[Dict[str, Any]] = Field(default=None, description="Additional context (preferences, etc.)")
    files: Optional[List[FileAttachment]] = Field(default=None, description="Attached files to analyze")

class GenerateSlideContentRequest(BaseModel):
    """Request to generate detailed content for a single slide."""
    slide_title: str = Field(..., description="The title of the slide")
    slide_index: int = Field(..., description="The index of the slide in the presentation")
    total_slides: int = Field(..., description="Total number of slides in the presentation")
    presentation_topic: str = Field(..., description="The main topic of the presentation")
    presentation_context: Optional[str] = Field(None, description="Additional context about the presentation")
    existing_key_points: Optional[List[str]] = Field(None, description="Any existing key points for this slide")
    file_content: Optional[str] = Field(None, description="Content from uploaded files relevant to this slide")

class GenerateSlideContentResponse(BaseModel):
    """Response with generated slide content."""
    content: str = Field(..., description="The detailed narrative content for the slide")
    key_points: List[str] = Field(default_factory=list, description="Key bullet points for the slide")
