import { Theme } from '@/types/themes';
import { ComponentInstance } from '@/types/components';

/**
 * Apply theme settings to a specific component based on its type
 * @param component Component to apply theme to
 * @param theme Theme with settings to apply
 * @returns Updated component with theme applied
 */
export function applyThemeToComponent(
  component: ComponentInstance,
  theme: Theme
): ComponentInstance {
  if (!component || !theme) return component;

  // Extract theme values
  const { page, typography, accent1 } = theme;
  const { paragraph } = typography;

  // Clone component to avoid mutations
  const updatedComponent = { ...component, props: { ...component.props } };

  switch (component.type) {
    case 'Background':
      updatedComponent.props.backgroundColor = page.backgroundColor;
      updatedComponent.props.fill = page.backgroundColor;
      break;
      
    case 'TiptapTextBlock':
      updatedComponent.props.fontFamily = paragraph.fontFamily;
      updatedComponent.props.textColor = paragraph.color;
      if (paragraph.fontSize) {
        updatedComponent.props.fontSize = paragraph.fontSize;
      }
      if (paragraph.fontWeight) {
        updatedComponent.props.fontWeight = paragraph.fontWeight;
      }
      break;
      
    case 'Shape':
      updatedComponent.props.fill = accent1;
      break;
      
    case 'Chart':
      updatedComponent.props.accentColor = accent1;
      break;
      
    case 'Table':
      updatedComponent.props.headerColor = accent1;
      updatedComponent.props.textColor = paragraph.color;
      break;
      
    case 'Image':
      // Could apply border color from accent if border enabled
      if (updatedComponent.props.hasBorder) {
        updatedComponent.props.borderColor = accent1;
      }
      break;

    // Add other component types as needed
  }

  return updatedComponent;
}

/**
 * Apply theme to multiple components
 * @param components Array of components to update
 * @param theme Theme to apply
 * @returns New array with updated components
 */
export function applyThemeToComponents(
  components: ComponentInstance[],
  theme: Theme
): ComponentInstance[] {
  if (!components || !theme) return components;
  
  return components.map(component => applyThemeToComponent(component, theme));
}

/**
 * Generate CSS variables for theme to use in stylesheets
 * @param theme Theme to convert to CSS variables
 * @returns Object with CSS variable names and values
 */
export function themeToCssVariables(theme: Theme): Record<string, string> {
  if (!theme) return {};
  
  return {
    '--theme-bg-color': theme.page.backgroundColor,
    '--theme-text-color': theme.typography.paragraph.color,
    '--theme-font-family': theme.typography.paragraph.fontFamily,
    '--theme-accent-color': theme.accent1,
    '--theme-accent-secondary': theme.accent2 || theme.accent1,
    ...(theme.typography.paragraph.fontSize ? { '--theme-font-size': theme.typography.paragraph.fontSize } : {}),
    ...(theme.typography.paragraph.fontWeight ? { '--theme-font-weight': String(theme.typography.paragraph.fontWeight) } : {}),
    ...(theme.typography.heading?.fontFamily ? { '--theme-heading-font-family': theme.typography.heading.fontFamily } : {}),
    ...(theme.typography.heading?.color ? { '--theme-heading-color': theme.typography.heading.color } : {}),
  };
}

/**
 * Apply theme CSS variables to a DOM element
 * @param element DOM element to apply variables to
 * @param theme Theme to apply
 */
export function applyThemeToElement(element: HTMLElement, theme: Theme): void {
  if (!element || !theme) return;

  const cssVars = themeToCssVariables(theme);

  Object.entries(cssVars).forEach(([key, value]) => {
    element.style.setProperty(key, value);
  });
}

// ============================================================================
// Theme Color Utilities for Chat Blocks & Generation
// ============================================================================

/**
 * Default colors that should be considered as "no real theme"
 */
const DEFAULT_COLORS = ['#FFFFFF', '#FFF', '#FAFAFA', '#F5F5F5', '#E8E8E8', '#000000', '#000'];

/**
 * Reorder colors array to put accent colors first
 * CRITICAL: This tells the AI which are the primary brand colors
 */
export function reorderColorsWithAccentsFirst(
  colors: string[],
  accent1: string,
  accent2: string
): string[] {
  if (!colors || !Array.isArray(colors)) {
    return [accent1, accent2].filter(Boolean);
  }

  const normalizedAccent1 = accent1?.toLowerCase();
  const normalizedAccent2 = accent2?.toLowerCase();

  const otherColors = colors.filter(c => {
    const normalized = String(c || '').toLowerCase();
    return normalized !== normalizedAccent1 && normalized !== normalizedAccent2;
  });

  return [accent1, accent2, ...otherColors].filter(Boolean);
}

/**
 * Check if a color is a "real" color (not a default/white)
 */
export function isRealColor(color: string | undefined): boolean {
  if (!color || typeof color !== 'string') return false;
  const upper = color.toUpperCase().trim();
  return !DEFAULT_COLORS.includes(upper);
}

/**
 * Check if theme has real/meaningful colors (not just defaults)
 */
export function hasRealThemeColors(colors: {
  accent_1?: string;
  accent?: string;
  primary_background?: string;
  background?: string;
} | null | undefined): boolean {
  if (!colors) return false;

  const accent = colors.accent_1 || colors.accent;
  const bg = colors.primary_background || colors.background;

  return isRealColor(accent) || (isRealColor(bg) && bg?.toUpperCase() !== '#FFFFFF');
}

/**
 * Build theme payload for themeStore from color/typography data
 */
export function buildThemePayloadForStore(options: {
  colors: {
    primary_background: string;
    primary_text: string;
    accent_1: string;
    accent_2: string;
    colors?: string[];
    backgrounds?: string[];
  };
  typography: {
    headingFont: string;
    bodyFont: string;
  };
  logoUrl?: string;
}): any {
  const { colors, typography, logoUrl } = options;

  // Ensure accent colors are at front
  const reorderedColors = reorderColorsWithAccentsFirst(
    colors.colors || [],
    colors.accent_1,
    colors.accent_2
  );

  return {
    color_palette: {
      primary_background: colors.primary_background,
      primary_text: colors.primary_text,
      accent_1: colors.accent_1,
      accent_2: colors.accent_2,
      colors: reorderedColors,
      backgrounds: colors.backgrounds,
    },
    typography: {
      hero_title: { family: typography.headingFont },
      body_text: { family: typography.bodyFont },
    },
    logo: logoUrl ? { url: logoUrl } : undefined,
  };
}

/**
 * Build theme for outline.notes to pass to backend
 */
export function buildThemeForOutlineNotes(options: {
  colors: {
    primary_background: string;
    secondary_background?: string;
    primary_text: string;
    accent_1: string;
    accent_2: string;
    colors?: string[];
    backgrounds?: string[];
  };
  typography: {
    headingFont: string;
    bodyFont: string;
    headingWeight?: number;
  };
  logoUrl?: string;
  designStyle?: string;
  themeName?: string;
}): any {
  const { colors, typography, logoUrl, designStyle, themeName } = options;

  // CRITICAL: Ensure accent colors are at front
  const reorderedColors = reorderColorsWithAccentsFirst(
    colors.colors || [],
    colors.accent_1,
    colors.accent_2
  );

  return {
    theme_name: themeName || 'Custom Theme',
    color_palette: {
      primary_background: colors.primary_background,
      secondary_background: colors.secondary_background,
      primary_text: colors.primary_text,
      accent_1: colors.accent_1,
      accent_2: colors.accent_2,
      colors: reorderedColors,
      backgrounds: colors.backgrounds || [colors.primary_background],
    },
    typography: {
      hero_title: {
        family: typography.headingFont,
        weight: typography.headingWeight || 700,
      },
      body_text: {
        family: typography.bodyFont,
      },
    },
    logo: logoUrl ? { url: logoUrl } : undefined,
    design_style: designStyle,
  };
}

/**
 * Build workspace theme from theme editor data
 */
export function buildWorkspaceTheme(options: {
  name: string;
  backgroundColor: string;
  textColor: string;
  headingFont: string;
  bodyFont: string;
  accent1: string;
  accent2: string;
}): any {
  return {
    name: options.name,
    page: { backgroundColor: options.backgroundColor },
    typography: {
      paragraph: {
        fontFamily: options.bodyFont,
        color: options.textColor,
        fontSize: '16px',
        fontWeight: 400,
        lineHeight: 1.5,
      },
      heading: {
        fontFamily: options.headingFont,
        color: options.textColor,
        fontSize: '32px',
        fontWeight: 700,
      },
    },
    accent1: options.accent1,
    accent2: options.accent2,
  };
}

/**
 * Extract colors from various theme formats
 */
export function extractColorsFromTheme(theme: any): {
  background: string;
  text: string;
  accent1: string;
  accent2: string;
  colors: string[];
} {
  // Handle color_palette format
  if (theme?.color_palette) {
    return {
      background: theme.color_palette.primary_background || '#FFFFFF',
      text: theme.color_palette.primary_text || '#1A1A1A',
      accent1: theme.color_palette.accent_1 || '#FF4301',
      accent2: theme.color_palette.accent_2 || theme.color_palette.accent_1 || '#FF4301',
      colors: theme.color_palette.colors || [],
    };
  }

  // Handle flat theme format
  return {
    background: theme?.primary_background || theme?.background || '#FFFFFF',
    text: theme?.primary_text || theme?.text || '#1A1A1A',
    accent1: theme?.accent_1 || theme?.accent || '#FF4301',
    accent2: theme?.accent_2 || theme?.secondary || theme?.accent_1 || '#FF4301',
    colors: theme?.colors || [],
  };
}

/**
 * Extract fonts from various theme formats
 */
export function extractFontsFromTheme(theme: any): {
  headingFont: string;
  bodyFont: string;
} {
  // Handle typography format
  if (theme?.typography) {
    return {
      // Check new flat format first (hero_font, body_font), then old nested format
      headingFont: theme.typography.hero_font ||
                   theme.typography.heroFont ||
                   theme.typography.hero_title?.family ||
                   theme.typography.hero_title?.font_family ||
                   theme.typography.heading?.fontFamily ||
                   'Inter',
      bodyFont: theme.typography.body_font ||
                theme.typography.bodyFont ||
                theme.typography.body_text?.family ||
                theme.typography.body_text?.font_family ||
                theme.typography.paragraph?.fontFamily ||
                'Inter',
    };
  }

  // Handle flat format
  return {
    headingFont: theme?.headingFont || theme?.font || 'Inter',
    bodyFont: theme?.bodyFont || theme?.font || 'Inter',
  };
}