from typing import List, Dict, Any, Tuple, Optional

from models.registry import ComponentRegistry

from agents.editing.tools.component import (
    EditComponentArgs,
    CreateComponentArgs,
    RemoveComponentArgs,
    RemoveAllContentArgs,
    RemoveComponentsByTypeArgs,
    ReplaceComponentArgs,
    edit_component,
    create_new_component,
    remove_component,
    remove_all_content,
    remove_components_by_type,
    replace_component,
    get_create_new_component_model,
    get_edit_component_model,
    get_replace_component_model,
)
from agents.editing.tools.slide import StyleSlideArgs, style_slide
from agents.editing.tools.background import UpdateBackgroundArgs, update_background
from agents.editing.tools.slide_ops import (
    CreateSlideArgs,
    create_slide,
    DuplicateSlideArgs,
    duplicate_slide,
    RemoveSlideArgs,
    remove_slide,
    InsertImageArgs,
    insert_image,
    InsertAttachmentArgs,
    insert_attachment,
    get_create_slide_model,
    get_duplicate_slide_model,
)
from agents.editing.tools.theme_bridge import (
    ApplyThemePaletteArgs,
    apply_theme_palette,
    ApplyBrandColorsArgs,
    apply_brand_colors,
    ApplyWebsitePaletteArgs,
    apply_website_palette,
    ApplyKeywordPaletteArgs,
    apply_keyword_palette,
    ApplyRandomPaletteArgs,
    apply_random_palette,
    ApplyThemeFontsArgs,
    apply_theme_fonts,
)
from agents.editing.tools.logo_search import (
    LogoSearchArgs,
    add_logos,
)
from agents.editing.tools.firecrawl import (
    FirecrawlFetchArgs,
    firecrawl_fetch,
)
from utils.deck import get_all_component_ids, get_all_slide_ids


def get_tools_and_call_map(
    deck_data: Dict[str, Any],
    registry: ComponentRegistry,
    current_slide_id: Optional[str],
) -> Tuple[List[Any], Dict[str, Any]]:
    # Filter out ReactBits from editing agent - it requires specific pre-built component IDs
    # For custom interactive components, use CustomComponent instead
    available_types = [t for t in registry.get_component_types() if t != 'ReactBits']

    tools = [
        get_edit_component_model(
            deck_data=deck_data,
            component_types=available_types,
            component_ids=get_all_component_ids(deck_data, current_slide_id),
            slide_ids=get_all_slide_ids(deck_data),
        ),
        get_create_new_component_model(component_types=available_types),
        get_replace_component_model(component_types=available_types),
        RemoveComponentArgs,
        RemoveAllContentArgs,
        RemoveComponentsByTypeArgs,
        StyleSlideArgs,
        UpdateBackgroundArgs,
        get_create_slide_model(get_all_slide_ids(deck_data)),
        get_duplicate_slide_model(get_all_slide_ids(deck_data)),
        RemoveSlideArgs,
        InsertImageArgs,
        InsertAttachmentArgs,
        ApplyThemePaletteArgs,
        ApplyBrandColorsArgs,
        ApplyWebsitePaletteArgs,
        ApplyKeywordPaletteArgs,
        ApplyRandomPaletteArgs,
        ApplyThemeFontsArgs,
        LogoSearchArgs,
        FirecrawlFetchArgs,
    ]

    call_map = {
        "edit_component": edit_component,
        "create_new_component": create_new_component,
        "remove_component": remove_component,
        "remove_all_content": remove_all_content,
        "remove_components_by_type": remove_components_by_type,
        "replace_component": replace_component,
        "style_slide": style_slide,
        "update_background": update_background,
        "create_slide": create_slide,
        "duplicate_slide": duplicate_slide,
        "remove_slide": remove_slide,
        "insert_image": insert_image,
        "insert_attachment": insert_attachment,
        "apply_theme_palette": apply_theme_palette,
        "apply_brand_colors": apply_brand_colors,
        "apply_website_palette": apply_website_palette,
        "apply_keyword_palette": apply_keyword_palette,
        "apply_random_palette": apply_random_palette,
        "apply_theme_fonts": apply_theme_fonts,
        "add_logos": add_logos,
        "logo_search": add_logos,  # alias accepted from LLM
        "firecrawl_fetch": firecrawl_fetch,
    }

    return tools, call_map


