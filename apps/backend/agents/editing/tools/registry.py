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
from agents.editing.tools.custom_component_edit import (
    CustomComponentStrReplaceArgs,
    CustomComponentViewArgs,
    CustomComponentRewriteArgs,
    custom_component_str_replace,
    custom_component_view,
    custom_component_rewrite,
)
from agents.editing.tools.custom_component_media import (
    CustomComponentAddMediaArgs,
    CustomComponentAddLogoArgs,
    custom_component_add_media,
    custom_component_add_logo,
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
    InsertVideoArgs,
    insert_video,
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
from agents.editing.tools.view_slide import (
    ViewSlideArgs,
    view_slide,
)
from utils.deck import get_all_component_ids, get_all_slide_ids


def get_tools_and_call_map(
    deck_data: Dict[str, Any],
    registry: ComponentRegistry,
    current_slide_id: Optional[str],
    attachments: Optional[List[Dict[str, Any]]] = None,
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
        # CustomComponent editing tools (Gemini-compatible)
        CustomComponentStrReplaceArgs,  # Fast, targeted string replacement (no AI)
        CustomComponentViewArgs,         # View HTML content
        CustomComponentRewriteArgs,      # Full rewrite with AI (uses simple response model)
        CustomComponentAddMediaArgs,     # Add images (logos, generated, stock) to CustomComponent HTML
        CustomComponentAddLogoArgs,      # Quick single logo addition to CustomComponent
        RemoveComponentArgs,
        RemoveAllContentArgs,
        RemoveComponentsByTypeArgs,
        StyleSlideArgs,
        UpdateBackgroundArgs,
        get_create_slide_model(get_all_slide_ids(deck_data)),
        get_duplicate_slide_model(get_all_slide_ids(deck_data)),
        RemoveSlideArgs,
        InsertImageArgs,
        InsertVideoArgs,
        InsertAttachmentArgs,
        ApplyThemePaletteArgs,
        ApplyBrandColorsArgs,
        ApplyWebsitePaletteArgs,
        ApplyKeywordPaletteArgs,
        ApplyRandomPaletteArgs,
        ApplyThemeFontsArgs,
        LogoSearchArgs,
        FirecrawlFetchArgs,
        ViewSlideArgs,  # Cross-slide awareness - view any slide's details
    ]

    # Create a wrapper for style_slide that passes attachments
    def style_slide_with_attachments(args, reg, deck, diff):
        return style_slide(args, reg, deck, diff, attachments=attachments)

    # Create a wrapper for create_new_component that passes attachments
    def create_new_component_with_attachments(args, reg, deck, diff):
        return create_new_component(args, reg, deck, diff, attachments=attachments)

    # Create a wrapper for replace_component that passes attachments
    def replace_component_with_attachments(args, reg, deck, diff):
        return replace_component(args, reg, deck, diff, attachments=attachments)

    # Create a wrapper for custom_component_rewrite that passes attachments
    def custom_component_rewrite_with_attachments(args, reg, deck, diff):
        return custom_component_rewrite(args, reg, deck, diff, attachments=attachments)

    call_map = {
        "edit_component": edit_component,
        "create_new_component": create_new_component_with_attachments,
        "remove_component": remove_component,
        "remove_all_content": remove_all_content,
        "remove_components_by_type": remove_components_by_type,
        "replace_component": replace_component_with_attachments,
        # CustomComponent editing tools (Gemini-compatible)
        "custom_component_str_replace": custom_component_str_replace,
        "custom_component_view": custom_component_view,
        "custom_component_rewrite": custom_component_rewrite_with_attachments,
        "custom_component_add_media": custom_component_add_media,
        "custom_component_add_logo": custom_component_add_logo,
        "style_slide": style_slide_with_attachments,
        "update_background": update_background,
        "create_slide": create_slide,
        "duplicate_slide": duplicate_slide,
        "remove_slide": remove_slide,
        "insert_image": insert_image,
        "insert_video": insert_video,
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
        "view_slide": view_slide,  # Cross-slide awareness
    }

    return tools, call_map


