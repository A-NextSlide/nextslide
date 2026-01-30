"""
API endpoint for applying theme changes from the outline agent.

This endpoint takes theme_changes from the outline agent and applies them
to the outline's theme (stylePreferences and deck theme).

Theme processing logic lives in outline_agent/theme_executor.py and is
shared with the tool-calling path.
"""
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from setup_logging_optimized import get_logger
from .outline_agent.theme_executor import execute_theme_update

logger = get_logger(__name__)

router = APIRouter(prefix="/api/outline-theme", tags=["outline-theme"])


class ThemeChanges(BaseModel):
    """Theme changes from outline agent"""
    colors: Optional[Dict[str, Any]] = Field(default=None)
    brand: Optional[Dict[str, str]] = Field(default=None)
    fonts: Optional[Dict[str, str]] = Field(default=None)
    logo: Optional[Dict[str, Any]] = Field(default=None)


class ApplyThemeChangesRequest(BaseModel):
    """Request to apply theme changes"""
    outline_id: str = Field(description="ID of the outline to update")
    theme_changes: ThemeChanges = Field(description="Theme changes to apply")


class ApplyThemeChangesResponse(BaseModel):
    """Response with updated theme data"""
    success: bool
    style_preferences: Optional[Dict[str, Any]] = Field(default=None, description="Updated stylePreferences")
    theme_updates: Optional[Dict[str, Any]] = Field(default=None, description="Updates to apply to deck theme")
    message: str


@router.post("/apply")
async def apply_theme_changes(request: ApplyThemeChangesRequest) -> ApplyThemeChangesResponse:
    """
    Apply theme changes from the outline agent.

    Returns updated stylePreferences and theme updates to be merged with the outline.
    """
    try:
        logger.info(f"[OutlineTheme] Applying theme changes for outline {request.outline_id}")

        result = await execute_theme_update(
            theme_args=request.theme_changes.model_dump(),
            outline_id=request.outline_id,
        )

        return ApplyThemeChangesResponse(
            success=result.get("success", True),
            style_preferences=result.get("style_preferences"),
            theme_updates=result.get("theme_updates"),
            message=result.get("message", ""),
        )

    except Exception as e:
        logger.error(f"[OutlineTheme] Error applying theme changes: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))
