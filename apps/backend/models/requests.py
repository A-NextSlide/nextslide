from pydantic import BaseModel, Field
from typing import Optional, List, Dict, Any
from datetime import datetime
from models.deck import DeckBase, DeckDiffBase

class ComparisonBlock(BaseModel):
    """Structured two-column comparison content for a slide."""
    layout: Optional[str] = Field(
        default=None,
        description="Preferred layout for comparison: split_50_50 | split_60_40 | split_left_right"
    )
    leftLabel: Optional[str] = Field(default=None, description="Label for left side (e.g., 'Before', 'Team A', 'Old')")
    rightLabel: Optional[str] = Field(default=None, description="Label for right side (e.g., 'After', 'Team B', 'New')")
    leftBullets: List[str] = Field(default_factory=list, description="Bulleted points for the left column")
    rightBullets: List[str] = Field(default_factory=list, description="Bulleted points for the right column")

class ChatMessage(BaseModel):
    """Represents a single message in the chat history"""
    content: str  # The message content
    role: str  # Either 'user' or 'assistant'
    timestamp: datetime  # When the message was sent

class ChatRequest(BaseModel):
    message: str
    slide_id: Optional[str] = None
    current_slide_index: Optional[int] = None
    deck_data: DeckBase = None  
    chat_history: Optional[List[ChatMessage]] = None  # Chat history array
    run_uuid: Optional[str] = None # Optional run UUID to track the run
    # Optional UI selections for legacy /api/chat to bias edits
    selections: Optional[List[Dict[str, Any]]] = None

class ChatResponse(BaseModel):
    message: str
    timestamp: datetime
    deck_diff: Optional[DeckDiffBase] = None  # Only field for deck-level updates

class QualityEvaluationRequest(BaseModel):
    """Request for evaluating the quality of a deck modification based on user query"""
    user_query: str
    before_html: str
    after_html: str
    before_deck: dict
    after_deck: dict
    deck_diff: dict
    before_images: Optional[List[str]] = None  # Base64 encoded images of the before state
    after_images: Optional[List[str]] = None  # Base64 encoded images of the after state
    run_uuid: Optional[str] = None # Optional run UUID to track the run

class QualityEvaluationResponse(BaseModel):
    """Response with quality evaluation scores and feedback"""
    quality_score: float  # 1-5 score representing the quality of the modification
    explanation: str      # Explanation of the quality score
    strengths: List[str]  # List of strengths identified
    areas_for_improvement: List[str]  # List of areas for improvement
    timestamp: datetime

class RegistryRequest(BaseModel):
    requestType: Optional[str] = None  # Optional request type to specify which part of registry to return

class RegistryUpdateRequest(BaseModel):
    components: dict
    global_props: dict = Field(alias="global")
    source: Optional[str] = None
    schemas: Optional[Dict[str, Any]] = Field(None, description="TypeBox schemas for component types")

class TaggedMediaItem(BaseModel):
    id: str = Field(description="Unique identifier for the media item.")
    filename: str = Field(description="Original filename of the media.")
    type: str = Field(description="Type of the media.", enum=["image", "chart", "data", "pdf", "other"])
    content: Optional[str] = Field(None, description="Base64 encoded content of the file, or the data itself if not a file (e.g., chart data object).")
    previewUrl: Optional[str] = Field(None, description="URL for a preview of the media, if available (e.g., for images).") # Assuming format: uri means string
    interpretation: Optional[str] = Field(None, description="AI-generated interpretation or summary of the media content.")
    status: str = Field(description="Processing status of the media.", enum=["pending", "processed", "included", "excluded"])
    metadata: Optional[Dict[str, Any]] = Field(None, description="Any additional metadata associated with the media (e.g., chart type, image dimensions).")

class ExtractedDataItem(BaseModel):
    source: str = Field(description="Filename or source description of the extracted data.")
    chartType: Optional[str] = Field(None, description="Suggested chart type for the data (e.g., 'bar', 'line', 'pie').")
    data: List[Dict[str, Any]] = Field(description="The actual extracted tabular data, usually an array of objects.")
    title: Optional[str] = Field(None, description="Title for the chart visualization.")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata for chart configuration (e.g., legend settings).")

class SlideOutline(BaseModel):
    id: str = Field(description="Unique identifier for the slide.")
    title: str = Field(description="Title of the slide.")
    content: str = Field(description="Main content/notes for the slide.")
    deepResearch: Optional[bool] = Field(False, description="Flag indicating if deep research was enabled for this slide.")
    taggedMedia: Optional[List[TaggedMediaItem]] = Field(None, description="Media items tagged to this slide.")
    extractedData: Optional[ExtractedDataItem] = Field(None, description="Data extracted from files like CSV or Excel, potentially for chart generation.")
    # New: structured two-column comparison content for side-by-side layouts
    comparison: Optional[ComparisonBlock] = Field(
        default=None,
        description="Structured comparison block with left/right bullets and labels for side-by-side slides."
    )

class DiscardedFileItem(BaseModel):
    file_id: str = Field(description="Unique ID of the discarded file.")
    filename: str = Field(description="Original filename of the discarded file.")
    reasoning: str = Field(description="Reason why the file was discarded or not used.")

class ColorConfigItem(BaseModel):
    type: str = Field(description="Configuration type for colors.", enum=["default", "predefined", "ai", "custom"])
    name: Optional[str] = Field(None, description="Name of the predefined color palette if type is 'predefined'.")
    background: Optional[str] = Field(None, description="Background hex color code (e.g., '#FFFFFF').")
    text: Optional[str] = Field(None, description="Text hex color code (e.g., '#000000').")
    accent1: Optional[str] = Field(None, description="Primary accent hex color code.")
    accent2: Optional[str] = Field(None, description="Secondary accent hex color code.")
    accent3: Optional[str] = Field(None, description="Tertiary accent hex color code.")

class StylePreferencesItem(BaseModel):
    initialIdea: Optional[str] = Field(None, description="The original user prompt or idea for the presentation content.")
    vibeContext: Optional[str] = Field(None, description="User's description of the desired vibe, occasion, or audience for the presentation.")
    font: Optional[str] = Field(None, description="Preferred font name (e.g., 'Arial', 'Roboto').")
    colors: Optional[ColorConfigItem] = Field(None, description="Color preferences for the deck.")
    logoUrl: Optional[str] = Field(None, description="URL to a company/brand logo to place consistently on slides.")

class DeckOutline(BaseModel):
    id: str = Field(description="Unique identifier for the deck outline.")
    title: str = Field(description="Title of the presentation deck.")
    slides: List[SlideOutline] = Field(description="Array of slide outlines.")
    uploadedMedia: Optional[List[TaggedMediaItem]] = Field(None, description="All media files that were uploaded for potential use in the deck.")
    discarded_files: Optional[List[DiscardedFileItem]] = Field(None, description="Files that were uploaded but explicitly discarded or not used.")
    stylePreferences: Optional[StylePreferencesItem] = Field(None, description="User's style preferences for the deck.")
    notes: Optional[Dict[str, Any]] = Field(None, description="Narrative flow analysis including story arc, themes, and presentation tips.")

class DeckOutlineResponse(BaseModel):
    message: str
    deck_outline_id: str
    timestamp: datetime

class DeckComposeRequest(BaseModel):
    """Request for streaming deck composition"""
    deck_id: str = Field(description="UUID of the deck to compose")
    outline: DeckOutline = Field(description="The deck outline with slide information")
    force_restart: bool = Field(default=False, description="Force restart even if generation is in progress")
