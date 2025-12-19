export interface ThemePreviewLogo {
  url?: string;
  light_variant?: string;
  dark_variant?: string;
  source?: string;
}

export interface ThemePreviewState {
  theme?: any;
  palette?: any;
  typography?: any;
  tools?: Array<{ label: string; status: string }>;
  images?: any[];
  logo?: ThemePreviewLogo;
}

export function getInitialThemePreview(outline?: { stylePreferences?: any } | null): ThemePreviewState | null {
  const sp = outline?.stylePreferences;
  if (!sp) return null;

  const colors = sp.colors;
  if (!colors) return null;

  const palette: any = {
    primary_background: colors.background || '#FFFFFF',
    primary_text: colors.text || '#1F2937',
    colors: [colors.accent1, colors.accent2, colors.accent3].filter(Boolean),
    metadata: sp.logoUrl ? { logo_url: sp.logoUrl } : {}
  };

  const typography = sp.font ? {
    hero_title: { family: sp.font },
    body_text: { family: sp.font }
  } : undefined;

  const logo = sp.logoUrl ? { url: sp.logoUrl, source: 'style_preferences' } : undefined;

  return {
    palette,
    typography,
    logo,
    theme: {
      theme_name: sp.vibeContext ? `${sp.vibeContext} Theme` : 'Brand Theme',
      color_palette: palette,
      typography
    }
  };
}
