import type { OutlineData } from '@/services/outlineAgentService';
import type { ThemeEditorData } from '@/types/chatBlocks';

export const buildThemeBlockFromOutline = (outlineData: OutlineData): ThemeEditorData => {
  const stylePrefs = outlineData.stylePreferences || {};
  const colors = stylePrefs.colors || {};
  const defaultColors = { bg: '#FFFFFF', text: '#1F2937', accent1: '#FF4301', accent2: '#3B82F6' };
  const resolveColor = (value?: string) => (typeof value === 'string' && value.trim() ? value : undefined);
  const hasExplicitColors = Boolean(
    resolveColor(colors.background) ||
    resolveColor(colors.text) ||
    resolveColor(colors.accent1) ||
    resolveColor(colors.accent2) ||
    resolveColor(colors.accent3)
  );
  const explicitAccents = [
    resolveColor(colors.accent1),
    resolveColor(colors.accent2),
    resolveColor(colors.accent3),
  ].filter(Boolean) as string[];
  const fallbackAccents = [defaultColors.accent1, defaultColors.accent2];
  const paletteAccents = hasExplicitColors ? explicitAccents : fallbackAccents;
  const paletteBackgrounds = hasExplicitColors
    ? ([resolveColor(colors.background)].filter(Boolean) as string[])
    : [defaultColors.bg];

  return {
    themeId: `theme-${Date.now()}`,
    colors: {
      primary_background: resolveColor(colors.background) || defaultColors.bg,
      primary_text: resolveColor(colors.text) || defaultColors.text,
      accent_1: resolveColor(colors.accent1) || defaultColors.accent1,
      accent_2: resolveColor(colors.accent2) || resolveColor(colors.accent1) || defaultColors.accent2,
      colors: paletteAccents,
      backgrounds: paletteBackgrounds,
    },
    typography: {
      headingFont: stylePrefs.font || 'Inter',
      bodyFont: stylePrefs.bodyFont || 'Inter',
    },
    branding: {
      logoUrl: stylePrefs.logoUrl,
      brandName: stylePrefs.brandName || outlineData.brandContext,
      brandDomain: stylePrefs.brandDomain,
      brandDomainCandidates: stylePrefs.brandDomainCandidates,
      needsBrandDomainConfirmation: stylePrefs.needsBrandDomainConfirmation,
    },
    designStyle: outlineData.style || 'modern',
    vibeContext: stylePrefs.vibeContext || outlineData.brandContext || outlineData.style || outlineData.topic,
    isEditable: true,
    hasExplicitColors,
  };
};

export const buildThemePayload = (themeBlock: ThemeEditorData) => {
  const { colors, typography } = themeBlock;
  const accentsArray = [colors.accent_1, colors.accent_2].filter(Boolean);
  const includePalette = themeBlock.hasExplicitColors === true;

  return {
    ...(includePalette ? {
      color_palette: {
        primary_background: colors.primary_background,
        primary_text: colors.primary_text,
        accent_1: colors.accent_1,
        accent_2: colors.accent_2,
        colors: [...accentsArray, ...(colors.colors || [])],
        backgrounds: colors.backgrounds || [colors.primary_background],
        text_colors: { primary: colors.primary_text },
        metadata: {
          logo_url: themeBlock.branding?.logoUrl,
        },
      },
    } : {}),
    typography: {
      hero_title: { family: typography.headingFont },
      body_text: { family: typography.bodyFont },
    },
    ...(themeBlock.branding?.logoUrl ? { logo: { url: themeBlock.branding.logoUrl } } : {}),
  };
};

export const buildStylePreferencesFromTheme = (themeBlock: ThemeEditorData) => ({
  ...(themeBlock.hasExplicitColors ? {
    colors: {
      type: 'custom' as const,
      background: themeBlock.colors.primary_background,
      text: themeBlock.colors.primary_text,
      accent1: themeBlock.colors.accent_1,
      accent2: themeBlock.colors.accent_2,
    },
  } : {}),
  font: themeBlock.typography.headingFont,
  bodyFont: themeBlock.typography.bodyFont,
  logoUrl: themeBlock.branding?.logoUrl,
  brandName: themeBlock.branding?.brandName,
  brandDomain: themeBlock.branding?.brandDomain,
  brandDomainCandidates: themeBlock.branding?.brandDomainCandidates,
  needsBrandDomainConfirmation: themeBlock.branding?.needsBrandDomainConfirmation,
  vibeContext: themeBlock.vibeContext,
});

export const resolveThemeLogoUrl = (theme: any) => {
  return (
    theme?.brandInfo?.logoUrl ||
    theme?.color_palette?.metadata?.logo_url ||
    theme?.logo?.url ||
    theme?.logo_info?.url ||
    theme?.style_preferences?.logoUrl ||
    theme?.stylePreferences?.logoUrl ||
    theme?.logoUrl
  );
};

export const mergeThemeBlockWithGenerated = (prev: ThemeEditorData, theme: any): ThemeEditorData => {
  const colorPalette = theme?.color_palette || {};
  const brandInfo = theme?.brandInfo || {};
  const hasExplicitColors = Boolean(
    colorPalette.primary_background ||
    colorPalette.primary_text ||
    colorPalette.accent_1 ||
    colorPalette.accent_2
  );
  return {
    ...prev,
    colors: {
      primary_background: colorPalette.primary_background || prev.colors.primary_background,
      primary_text: colorPalette.primary_text || prev.colors.primary_text,
      accent_1: colorPalette.accent_1 || prev.colors.accent_1,
      accent_2: colorPalette.accent_2 || prev.colors.accent_2,
      colors: colorPalette.colors || prev.colors.colors,
      backgrounds: colorPalette.backgrounds || prev.colors.backgrounds,
    },
    typography: {
      headingFont: theme?.typography?.hero_title?.family || prev.typography.headingFont,
      bodyFont: theme?.typography?.body_text?.family || prev.typography.bodyFont,
    },
    branding: {
      ...prev.branding,
      logoUrl: resolveThemeLogoUrl(theme) || prev.branding?.logoUrl,
      brandName: brandInfo.brandName || prev.branding?.brandName,
      brandDomain: brandInfo.brandDomain || prev.branding?.brandDomain,
      brandDomainCandidates: brandInfo.brandDomainCandidates || prev.branding?.brandDomainCandidates,
      needsBrandDomainConfirmation: brandInfo.needsBrandDomainConfirmation ?? prev.branding?.needsBrandDomainConfirmation,
    },
    hasExplicitColors: hasExplicitColors || prev.hasExplicitColors,
  };
};
