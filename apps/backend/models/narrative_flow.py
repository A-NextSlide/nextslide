"""
Narrative Flow models for presentation structure and storytelling guidance
"""
from typing import List, Optional, Literal
from pydantic import BaseModel


class NarrativePhase(BaseModel):
    """Represents a phase in the story arc"""
    name: str  # e.g., "Hook", "Problem Statement", "Solution"
    slides: List[str]  # slide IDs
    purpose: str
    suggested_duration: int  # seconds


class StoryArc(BaseModel):
    """The overall story structure of the presentation"""
    type: Literal["problem-solution", "chronological", "persuasive", "educational", "custom", "topical", "comparative"]
    description: str
    phases: List[NarrativePhase]


class KeyTheme(BaseModel):
    """Key themes throughout the presentation"""
    theme: str
    description: str
    related_slides: List[str]
    importance: Literal["high", "medium", "low"]


class FlowRecommendation(BaseModel):
    """Recommendations for improving flow"""
    type: Literal["transition", "pacing", "emphasis", "structure"]
    between_slides: Optional[List[str]] = None  # [from_slide_id, to_slide_id]
    recommendation: str
    priority: Literal["high", "medium", "low"]


class ToneAndStyle(BaseModel):
    """Tone and style analysis"""
    overall_tone: Literal["professional", "conversational", "inspirational", "educational", "persuasive"]
    language_level: Literal["technical", "general", "executive", "beginner"]
    engagement_techniques: List[str]  # e.g., "storytelling", "data visualization"


class PresentationTip(BaseModel):
    """Tips for presenting specific slides or general advice"""
    slide_id: Optional[str] = None  # None for general tips
    tip: str
    category: Literal["delivery", "content", "visual", "interaction"]


class NarrativeFlow(BaseModel):
    """Complete narrative flow analysis"""
    story_arc: StoryArc
    key_themes: List[KeyTheme]
    flow_recommendations: List[FlowRecommendation]
    tone_and_style: ToneAndStyle
    presentation_tips: List[PresentationTip]


class NarrativeFlowChanges(BaseModel):
    """Track changes to narrative flow after edits"""
    narrative_impact: Literal["high", "medium", "low", "none"]
    flow_adjustments: List[str]  # List of what changed 