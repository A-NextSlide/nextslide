import type { OutlineData } from '@/services/outlineAgentService';
import type { ThemeEditorData } from '@/types/chatBlocks';

export const buildThemeBlockFromOutline = (outlineData: OutlineData): ThemeEditorData => {
  const stylePrefs = outlineData.stylePreferences || {};
  const colors = stylePrefs.colors || {};
  const defaultColors = { bg: '#FFFFFF', text: '#1F2937', accent1: '#FF4301', accent2: '#3B82F6' };

  return {
    themeId: `theme-${Date.now()}`,
    colors: {
      primary_background: colors.background || defaultColors.bg,
      primary_text: colors.text || defaultColors.text,
      accent_1: colors.accent1 || defaultColors.accent1,
      accent_2: colors.accent2 || colors.accent1 || defaultColors.accent2,
      colors: [colors.accent1, colors.accent2, colors.accent3].filter(Boolean) as string[] || [defaultColors.accent1, defaultColors.accent2],
      backgrounds: [colors.background].filter(Boolean) as string[] || [defaultColors.bg],
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
  };
};

export const buildThemePayload = (themeBlock: ThemeEditorData) => {
  const { colors, typography } = themeBlock;
  const accentsArray = [colors.accent_1, colors.accent_2].filter(Boolean);

  return {
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
    typography: {
      hero_title: { family: typography.headingFont },
      body_text: { family: typography.bodyFont },
    },
  };
};

export const buildStylePreferencesFromTheme = (themeBlock: ThemeEditorData) => ({
  colors: {
    type: 'custom' as const,
    background: themeBlock.colors.primary_background,
    text: themeBlock.colors.primary_text,
    accent1: themeBlock.colors.accent_1,
    accent2: themeBlock.colors.accent_2,
  },
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
  };
};
