from typing import Any, Dict, List, Type, Optional, Tuple
from pydantic import BaseModel, Field, create_model
from models.component import ComponentBase, ComponentDiffBase
from models.slide import SlideBase, SlideDiffBase
from datetime import datetime

class DeckBase(BaseModel):
    """
    Model representing a deck with dynamic slides.
    
    Attributes:
        id: Unique identifier for the slide
        title: Title of the slide
        components: Optional list of component instances
    """
    uuid: str = Field(..., description="Unique identifier")
    name: str = Field(..., description="Name of the deck")
    slides: List[SlideBase] = Field(..., description="List of slides in the deck")
    size: Dict[str, int] = Field(default={"width": 1920, "height": 1080}, description="The size of the deck in pixels (width, height)")
    version: Optional[str] = Field(None, description="Version identifier")
    last_modified: Optional[datetime] = Field(None, description="Last modification timestamp")
    status: Optional[Dict[str, Any]] = Field(None, description="Generation status tracking")
    notes: Optional[Dict[str, Any]] = Field(None, description="Narrative flow analysis including story arc, themes, and presentation tips")

class DeckSharingInfo(BaseModel):
    """Information about who shared a deck with the user"""
    shared_by: Optional[Dict[str, str]] = Field(None, description="Information about who shared the deck {id, email, name}")
    share_type: Optional[str] = Field(None, description="Type of share: 'view' or 'edit'")
    shared_at: Optional[datetime] = Field(None, description="When the deck was shared")
    is_shared: bool = Field(False, description="Whether this is a shared deck")
    permissions: Optional[List[str]] = Field(None, description="List of permissions: ['view', 'edit', 'share']")
    share_link_id: Optional[str] = Field(None, description="ID of the share link if applicable")
    collaborator_id: Optional[str] = Field(None, description="ID of the collaborator record")

class DeckWithSharing(DeckBase):
    """Deck model extended with sharing information"""
    # Sharing metadata
    shared_by: Optional[Dict[str, str]] = Field(None, description="Information about who shared the deck")
    share_type: Optional[str] = Field(None, description="Type of share: 'view' or 'edit'")
    shared_at: Optional[datetime] = Field(None, description="When the deck was shared")
    is_shared: bool = Field(False, description="Whether this is a shared deck")
    is_owner: bool = Field(True, description="Whether the current user owns this deck")
    permissions: Optional[List[str]] = Field(None, description="List of permissions")
    share_link_id: Optional[str] = Field(None, description="ID of the share link if applicable")
    collaborator_id: Optional[str] = Field(None, description="ID of the collaborator record")
    
    # Additional metadata for list views
    first_slide: Optional[Dict[str, Any]] = Field(None, description="First slide for thumbnail")
    slide_count: Optional[int] = Field(None, description="Total number of slides")
    description: Optional[str] = Field(None, description="Deck description")
    # notes field is inherited from DeckBase

class CollaboratorInfo(BaseModel):
    """Information about a deck collaborator"""
    id: str = Field(..., description="Collaborator record ID")
    email: str = Field(..., description="Collaborator email")
    user_id: Optional[str] = Field(None, description="User ID if they have an account")
    permissions: List[str] = Field(['view'], description="List of permissions")
    status: str = Field('invited', description="Status: invited, active, or revoked")
    invited_at: datetime = Field(..., description="When they were invited")
    invited_by: Dict[str, str] = Field(..., description="Who invited them {id, email, name}")
    accepted_at: Optional[datetime] = Field(None, description="When they accepted")
    last_accessed_at: Optional[datetime] = Field(None, description="Last access time")
    access_count: int = Field(0, description="Number of times accessed")

class DeckDiffBase(BaseModel):
    """Represents a comprehensive diff of changes to apply to the entire deck"""
    slides_to_update: List[SlideDiffBase] = Field(default_factory=list, description="Updates to existing slides")
    slides_to_add: List[Dict[str, Any]] = Field(default_factory=list, description="New slides to add to the deck")
    slides_to_remove: List[str] = Field(default_factory=list, description="IDs of slides to remove")

def create_typed_deck_model(slide_model: Type[SlideBase]):
    slides = (
        List[slide_model],
        Field(description="Array of slides that belong to this deck. Must be one of the registered slide types.")
    )

    return create_model(
        "TypedDeckData",
        __base__=DeckBase,
        slides=slides
    )

def create_typed_deck_diff_model(slide_model: Type[SlideBase], slide_diff_model: Type[SlideDiffBase]):
    slides_to_update = (
        List[slide_diff_model],
        Field(description="Array of slides that belong to this deck. Must be one of the registered slide types.")
    )
    slides_to_add = (
        List[slide_model],
        Field(description="Array of slides diffs that belong to this deck. Must be one of the registered slide types.")
    )
    return create_model(
        "TypedDeckDiffData",
        __base__=DeckDiffBase,
        slides_to_update=slides_to_update,
        slides_to_add=slides_to_add,
    )

class DeckDiff:
    def __init__(self, deck_diff: DeckDiffBase):
        self.deck_diff = deck_diff

    # Component methods
    def add_component(self, slide_id: str, component: ComponentBase):
        """
        Add a component to a specific slide in the deck diff.
        
        Args:
            slide_id: The ID of the slide to add the component to
            component: The component to add
        """
        # Find the slide diff for the given slide_id or create a new one
        slide_diff = self._find_or_create_slide_diff(slide_id)
        
        # Add the component to the slide's components_to_add list
        if not hasattr(slide_diff, "components_to_add"):
            slide_diff.components_to_add = []
        
        slide_diff.components_to_add.append(component)
        
    def remove_component(self, slide_id: str, component_id: str):
        """
        Remove a component from a specific slide in the deck diff.
        
        Args:
            slide_id: The ID of the slide containing the component
            component_id: The ID of the component to remove
        """
        # Find the slide diff for the given slide_id or create a new one
        slide_diff = self._find_or_create_slide_diff(slide_id)
        
        # Add the component ID to the slide's components_to_remove list
        if not hasattr(slide_diff, "components_to_remove"):
            slide_diff.components_to_remove = []
            
        slide_diff.components_to_remove.append(component_id)

    def update_component(self, slide_id: str, component_id: str, component_diff: ComponentDiffBase):
        """
        Update a component in a specific slide in the deck diff.
        
        Args:
            slide_id: The ID of the slide containing the component
            component_id: The ID of the component to update
            component_diff: The component diff containing updates
        """
        if component_diff.id != component_id:
            raise ValueError(f"Component ID mismatch: {component_diff.id} != {component_id}")

        # Find the slide diff for the given slide_id or create a new one
        slide_diff = self._find_or_create_slide_diff(slide_id)
        
        # Add the component diff to the slide's components_to_update list
        if not hasattr(slide_diff, "components_to_update"):
            slide_diff.components_to_update = []
            
        # Check if there's already an update for this component
        for i, existing_diff in enumerate(slide_diff.components_to_update):
            if existing_diff.id == component_id:
                # If we already have an update for this component, merge the diffs
                self._merge_component_diff(existing_diff, component_diff)
                return
                
        # If no existing diff was found, add the new one
        slide_diff.components_to_update.append(component_diff)
    
    # Slide methods
    def add_slide(self, slide: SlideBase):
        """
        Add a new slide to the deck diff.
        
        Args:
            slide: The slide to add
        """
        if not hasattr(self.deck_diff, "slides_to_add"):
            self.deck_diff.slides_to_add = []
            
        self.deck_diff.slides_to_add.append(slide)
    
    def remove_slide(self, slide_id: str):
        """
        Remove a slide from the deck diff.
        
        Args:
            slide_id: The ID of the slide to remove
        """
        if not hasattr(self.deck_diff, "slides_to_remove"):
            self.deck_diff.slides_to_remove = []
            
        self.deck_diff.slides_to_remove.append(slide_id)
    
    def update_slide(self, slide_diff: SlideDiffBase):
        """
        Update a slide in the deck diff.
        
        Args:
            slide_diff: The slide diff containing updates
        """
        # Check if we already have an update for this slide
        for i, existing_diff in enumerate(self.deck_diff.slides_to_update):
            if existing_diff.slide_id == slide_diff.slide_id:
                # If we already have an update for this slide, merge the diffs
                self._merge_slide_diff(existing_diff, slide_diff)
                return
                
        # If no existing diff was found, add the new one
        self.deck_diff.slides_to_update.append(slide_diff)

    def get_slide_diff(self, slide_id: str) -> Optional[SlideDiffBase]:
        """
        Get the slide diff for a specific slide.
        
        Args:
            slide_id: The ID of the slide to get the diff for
            
        Returns:
            The slide diff or None if not found
        """
        for slide_diff in self.deck_diff.slides_to_update:
            if slide_diff.slide_id == slide_id:
                return slide_diff
                
        return None
    
    # Helper methods
    def _find_or_create_slide_diff(self, slide_id: str) -> SlideDiffBase:
        """
        Find the slide diff for a specific slide or create a new one.
        
        Args:
            slide_id: The ID of the slide to find or create a diff for
            
        Returns:
            The slide diff
        """
        # Check if we already have a diff for this slide
        slide_diff = self.get_slide_diff(slide_id)
        
        if not slide_diff:
            # If not, create a new slide diff
            slide_diff = SlideDiffBase(slide_id=slide_id)
            self.deck_diff.slides_to_update.append(slide_diff)
            
        return slide_diff
    
    def _merge_component_diff(self, existing_diff: ComponentDiffBase, new_diff: ComponentDiffBase):
        """
        Merge a new component diff into an existing one.
        
        Args:
            existing_diff: The existing component diff
            new_diff: The new component diff to merge
        """
        # Merge props (support both dict and Pydantic BaseModel for typed diffs)
        def _to_dict(val):
            try:
                if hasattr(val, "model_dump"):
                    return val.model_dump(exclude_none=True)
                if hasattr(val, "dict"):
                    return val.dict(exclude_none=True)
            except Exception:
                pass
            return dict(val) if isinstance(val, dict) else {}

        new_props = _to_dict(new_diff.props)
        existing_props_is_model = hasattr(existing_diff.props, "__class__") and hasattr(existing_diff.props, "model_dump")
        existing_props_dict = _to_dict(existing_diff.props)

        # Shallow merge (new overwrites existing)
        try:
            for key, value in new_props.items():
                existing_props_dict[key] = value
        except Exception:
            pass

        # Always use plain dict to avoid serialization issues in WebSocket events
        existing_diff.props = existing_props_dict
    
    def _merge_slide_diff(self, existing_diff: SlideDiffBase, new_diff: SlideDiffBase):
        """
        Merge a new slide diff into an existing one.
        
        Args:
            existing_diff: The existing slide diff
            new_diff: The new slide diff to merge
        """
        # Merge components_to_add
        if hasattr(new_diff, "components_to_add") and new_diff.components_to_add:
            if not hasattr(existing_diff, "components_to_add"):
                existing_diff.components_to_add = []
            existing_diff.components_to_add.extend(new_diff.components_to_add)
            
        # Merge components_to_remove
        if hasattr(new_diff, "components_to_remove") and new_diff.components_to_remove:
            if not hasattr(existing_diff, "components_to_remove"):
                existing_diff.components_to_remove = []
            existing_diff.components_to_remove.extend(new_diff.components_to_remove)
            
        # Merge components_to_update
        if hasattr(new_diff, "components_to_update") and new_diff.components_to_update:
            if not hasattr(existing_diff, "components_to_update"):
                existing_diff.components_to_update = []
                
            for new_comp_diff in new_diff.components_to_update:
                # Check if we already have an update for this component
                found = False
                for existing_comp_diff in existing_diff.components_to_update:
                    if existing_comp_diff.id == new_comp_diff.id:
                        # If we already have an update for this component, merge the diffs
                        self._merge_component_diff(existing_comp_diff, new_comp_diff)
                        found = True
                        break
                        
                if not found:
                    # If no existing diff was found, add the new one
                    existing_diff.components_to_update.append(new_comp_diff)
                    
        # Merge slide properties
        if hasattr(new_diff, "slide_properties") and new_diff.slide_properties:
            if not hasattr(existing_diff, "slide_properties"):
                existing_diff.slide_properties = {}
                
            for key, value in new_diff.slide_properties.items():
                existing_diff.slide_properties[key] = value

    def merge(self, other_deck_diff: 'DeckDiff'):
        """
        Merge another DeckDiff object into this one.
        
        Args:
            other_deck_diff: The DeckDiff object to merge into this one
        """
        # Merge slides_to_add
        if hasattr(other_deck_diff.deck_diff, "slides_to_add") and other_deck_diff.deck_diff.slides_to_add:
            if not hasattr(self.deck_diff, "slides_to_add"):
                self.deck_diff.slides_to_add = []
            self.deck_diff.slides_to_add.extend(other_deck_diff.deck_diff.slides_to_add)
        
        # Merge slides_to_remove
        if hasattr(other_deck_diff.deck_diff, "slides_to_remove") and other_deck_diff.deck_diff.slides_to_remove:
            if not hasattr(self.deck_diff, "slides_to_remove"):
                self.deck_diff.slides_to_remove = []
            self.deck_diff.slides_to_remove.extend(other_deck_diff.deck_diff.slides_to_remove)
        
        # Merge slides_to_update
        if hasattr(other_deck_diff.deck_diff, "slides_to_update") and other_deck_diff.deck_diff.slides_to_update:
            for other_slide_diff in other_deck_diff.deck_diff.slides_to_update:
                # Check if we already have an update for this slide
                existing_slide_diff = self.get_slide_diff(other_slide_diff.slide_id)
                
                if existing_slide_diff:
                    # If we already have an update for this slide, merge the diffs
                    self._merge_slide_diff(existing_slide_diff, other_slide_diff)
                else:
                    # If no existing diff was found, add the new one
                    self.deck_diff.slides_to_update.append(other_slide_diff)
        
        return self

