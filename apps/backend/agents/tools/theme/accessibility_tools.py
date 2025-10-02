from typing import Dict, Any
from setup_logging_optimized import get_logger

logger = get_logger(__name__)


def validate_contrast_report(deck_theme: Dict[str, Any]) -> Dict[str, Any]:
    """Return a lightweight contrast report using ColorContrastManager.
    Does not mutate; callers can apply suggested fixes.
    """
    try:
        from agents.generation.color_contrast_manager import ColorContrastManager
        ccm = ColorContrastManager()
        palette = (deck_theme or {}).get('color_palette') or {}
        pb = palette.get('primary_background') or palette.get('background')
        pt = palette.get('primary_text') or palette.get('text')
        if not isinstance(pb, str) or not isinstance(pt, str):
            return {"ok": False, "issue": "missing_colors"}
        recommendation = ccm.get_readable_text_color(str(pb))
        ok = True
        if recommendation and recommendation.get('recommended') and recommendation['recommended'] != pt:
            ok = False
        return {
            "ok": ok,
            "recommended_text": recommendation.get('recommended') if recommendation else None,
        }
    except Exception as e:
        logger.warning(f"validate_contrast_report failed: {e}")
        return {"ok": False, "error": str(e)}


