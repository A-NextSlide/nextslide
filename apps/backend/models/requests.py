from pydantic import BaseModel, Field, field_validator, model_validator
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
    source: str = Field(default="", description="Filename or source description of the extracted data.")
    chartType: Optional[str] = Field(None, description="Suggested chart type for the data (e.g., 'bar', 'line', 'pie').")
    data: Optional[List[Dict[str, Any]]] = Field(default=None, description="The actual extracted tabular data, usually an array of objects.")
    title: Optional[str] = Field(None, description="Title for the chart visualization.")
    metadata: Optional[Dict[str, Any]] = Field(None, description="Additional metadata for chart configuration (e.g., legend settings).")

class ManualChartItem(BaseModel):
    """Represents a manually created or AI-generated chart on a slide"""
    id: str = Field(description="Unique identifier for the chart.")
    chartType: str = Field(description="Type of chart (e.g., 'bar', 'line', 'pie', 'waterfall', 'radar', 'heatmap').")
    data: List[Dict[str, Any]] = Field(description="Chart data array.")
    title: Optional[str] = Field(None, description="Title for the chart.")

class AssignedVideoItem(BaseModel):
    """Represents a video assigned to a slide from brand website scraping"""
    url: str = Field(description="URL of the video.")
    title: Optional[str] = Field(None, description="Title of the video.")
    thumbnail: Optional[str] = Field(None, description="Thumbnail URL for the video.")
    source_type: Optional[str] = Field(None, description="Video source type (e.g., 'youtube', 'vimeo', 'wistia').")
    embed_url: Optional[str] = Field(None, description="Embed URL for the video player.")
    video_id: Optional[str] = Field(None, description="Platform-specific video ID.")

class SlideOutline(BaseModel):
    id: str = Field(description="Unique identifier for the slide.")
    title: str = Field(description="Title of the slide.")
    content: str = Field(description="Main content/notes for the slide.")

    @field_validator("content", mode="before")
    @classmethod
    def _coerce_content_to_string(cls, value):
        """
        Coerce content to string if AI returns a list.

        Fixes SLIDE-BACKEND-1M: AI sometimes returns content as a list of strings
        instead of a single string. Join them with newlines.
        """
        if value is None:
            return ""
        if isinstance(value, list):
            # Join list items with newlines, filtering out non-strings
            return "\n".join(str(item) for item in value if item)
        return value
    deepResearch: Optional[bool] = Field(False, description="Flag indicating if deep research was enabled for this slide.")
    taggedMedia: Optional[List[TaggedMediaItem]] = Field(None, description="Media items tagged to this slide.")
    extractedData: Optional[ExtractedDataItem] = Field(None, description="Data extracted from files like CSV or Excel, potentially for chart generation.")
    # ✅ Support for multiple charts per slide
    manualCharts: Optional[List[ManualChartItem]] = Field(None, description="Array of charts for this slide. Supports multiple charts per slide.")
    # New: structured two-column comparison content for side-by-side layouts
    comparison: Optional[ComparisonBlock] = Field(
        default=None,
        description="Structured comparison block with left/right bullets and labels for side-by-side slides."
    )
    # AI-suggested image prompt extracted from [IMAGE: ...] tags in outline
    suggestedImagePrompt: Optional[str] = Field(
        default=None,
        description="Suggested image description extracted from outline, to be used in AI image generation tab."
    )
    # Citations and footnotes for Sources panel
    citations: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Citations from research/Perplexity"
    )
    footnotes: Optional[List[Dict[str, Any]]] = Field(
        default=None,
        description="Numbered footnotes for citation panel dropdown"
    )
    # Assigned video from brand website scraping (set by AI during outline generation)
    assignedVideo: Optional[AssignedVideoItem] = Field(
        default=None,
        description="Video assigned to this slide from brand website scraping."
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
    font: Optional[str] = Field(None, description="Preferred hero/heading font name (e.g., 'Montserrat', 'Bebas Neue').")
    bodyFont: Optional[str] = Field(None, description="Preferred body/paragraph font name (e.g., 'Open Sans', 'Roboto'). Should complement the hero font.")
    colors: Optional[ColorConfigItem] = Field(None, description="Color preferences for the deck.")
    logoUrl: Optional[str] = Field(None, description="URL to a company/brand logo to place consistently on slides (typically light/white variant for dark backgrounds).")
    logoUrlDark: Optional[str] = Field(None, description="URL to dark variant of the logo for use on light backgrounds.")
    brandName: Optional[str] = Field(None, description="Detected brand name when a real brand is identified.")
    brandDomain: Optional[str] = Field(None, description="Resolved brand domain when confidence is high.")
    brandDomainCandidates: Optional[List[str]] = Field(None, description="Candidate domains for brand confirmation.")
    needsBrandDomainConfirmation: Optional[bool] = Field(None, description="True when brand domain needs user confirmation.")
    autoSelectImages: Optional[bool] = Field(None, description="When True, frontend handles image search/application; backend skips SerpAPI search.")
    slideMode: Optional[str] = Field(None, description="Slide mode: 'interactive' for animations/interactions, 'static' for classic clean slides.")
    referenceImages: Optional[List[str]] = Field(None, description="URLs of design reference images (e.g., PPT screenshots) for the AI to match style/design from.")

    @field_validator("referenceImages", mode="before")
    @classmethod
    def _sanitize_reference_images(cls, value):
        if not value:
            return None
        if isinstance(value, str):
            value = [value]
        if not isinstance(value, list):
            return None
        cleaned: List[str] = []
        seen = set()
        for item in value:
            if not isinstance(item, str):
                continue
            trimmed = item.strip()
            if not trimmed:
                continue
            if trimmed.startswith("data:") or len(trimmed) > 2048:
                continue
            if not trimmed.startswith(("http://", "https://")):
                continue
            if trimmed in seen:
                continue
            cleaned.append(trimmed)
            seen.add(trimmed)
        return cleaned or None

class DeckOutline(BaseModel):
    id: str = Field(description="Unique identifier for the deck outline.")
    title: str = Field(description="Title of the presentation deck.")
    slides: List[SlideOutline] = Field(description="Array of slide outlines.")
    uploadedMedia: Optional[List[TaggedMediaItem]] = Field(None, description="All media files that were uploaded for potential use in the deck.")
    use_uploaded_images: Optional[bool] = Field(
        None,
        description="True when uploaded images should be applied to slides; false when uploads are reference-only.",
    )
    discarded_files: Optional[List[DiscardedFileItem]] = Field(None, description="Files that were uploaded but explicitly discarded or not used.")
    stylePreferences: Optional[StylePreferencesItem] = Field(None, description="User's style preferences for the deck.")
    notes: Optional[Dict[str, Any]] = Field(None, description="Narrative flow analysis including story arc, themes, and presentation tips.")
    conversation_history: Optional[Dict[str, Any]] = Field(
        None,
        description="Conversation history with user customization details.",
    )
    extractedImages: Optional[List[str]] = Field(None, description="Image URLs extracted from uploaded PPTX/PDF files for use in generated slides.")

class DeckOutlineResponse(BaseModel):
    message: str
    deck_outline_id: str
    timestamp: datetime

class DeckComposeRequest(BaseModel):
    """Request for streaming deck composition"""
    deck_id: Optional[str] = Field(default=None, description="UUID of the deck to compose. If not provided, uses outline.id")
    outline: DeckOutline = Field(description="The deck outline with slide information")
    force_restart: bool = Field(default=False, description="Force restart even if generation is in progress")
    async_images: bool = Field(default=False, description="If False, images are auto-applied; if True, placeholders are used")

    @model_validator(mode='after')
    def extract_deck_id_from_outline(self):
        """If deck_id is not provided, extract it from outline.id"""
        if self.deck_id is None:
            # Get outline id
            if hasattr(self.outline, 'id') and self.outline.id:
                self.deck_id = self.outline.id
            else:
                raise ValueError("deck_id must be provided either directly or via outline.id")
        return self


# ============================================================================
# Community Decks Models
# ============================================================================

from typing import Literal

class SubmitToCommunityRequest(BaseModel):
    """Request to submit a deck to the community gallery"""
    deck_uuid: str = Field(description="UUID of the deck to submit")
    title: str = Field(description="Title for community display")
    description: Optional[str] = Field(None, description="Description of the deck")
    category: Literal['business', 'education', 'marketing', 'creative', 'technology', 'personal'] = Field(
        description="Category for the deck"
    )
    tags: List[str] = Field(default_factory=list, description="Custom tags for searchability")


class CommunityDeckResponse(BaseModel):
    """Response model for a community deck (list view)"""
    id: str
    title: str
    description: Optional[str] = None
    category: str
    tags: List[str] = []
    slide_count: int = 0
    first_slide: Optional[Dict[str, Any]] = None
    author_name: Optional[str] = None
    remix_count: int = 0
    view_count: int = 0
    approved_at: Optional[str] = None
    submitted_at: Optional[str] = None


class CommunityDeckDetailResponse(CommunityDeckResponse):
    """Response model for a single community deck with full slides"""
    slides: List[Dict[str, Any]] = []
    theme: Optional[Dict[str, Any]] = None


class CommunityDecksListResponse(BaseModel):
    """Paginated list of community decks"""
    decks: List[CommunityDeckResponse]
    total: int
    page: int
    limit: int
    has_more: bool


class CommunitySubmissionResponse(BaseModel):
    """Response for user's community submission status"""
    id: str
    deck_uuid: str
    title: str
    description: Optional[str] = None
    category: str
    tags: List[str] = []
    status: str  # pending, approved, rejected
    rejection_reason: Optional[str] = None
    submitted_at: str
    reviewed_at: Optional[str] = None


class CommunityCategoryCount(BaseModel):
    """Category with count for filtering"""
    name: str
    display_name: str
    count: int


class RejectCommunitySubmissionRequest(BaseModel):
    """Request to reject a community submission"""
    reason: str = Field(description="Reason for rejection")
