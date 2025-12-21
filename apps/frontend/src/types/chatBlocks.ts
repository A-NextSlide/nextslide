/**
 * Chat Block Types
 * Types for inline editable blocks in the conversational chat
 */

import type { ThinkingStep } from './agentEvents';
import type { AssignedVideo, TaggedMedia } from './SlideTypes';

/**
 * Color palette structure matching backend color_palette
 */
export interface ThemeColorPalette {
  primary_background: string;
  secondary_background?: string;
  primary_text: string;
  accent_1: string;
  accent_2: string;
  colors: string[];
  backgrounds?: string[];
  text_colors?: {
    primary?: string;
    secondary?: string;
    muted?: string;
  };
}

/**
 * Typography structure matching backend typography
 */
export interface ThemeTypography {
  headingFont: string;
  bodyFont: string;
  headingWeight?: number;
  bodyWeight?: number;
}

/**
 * Brand information
 */
export interface ThemeBranding {
  logoUrl?: string;
  brandName?: string;
  brandDomain?: string;
  brandDomainCandidates?: string[];
  needsBrandDomainConfirmation?: boolean;
}

/**
 * Theme editor data for inline editing
 */
export interface ThemeEditorData {
  themeId: string;
  colors: ThemeColorPalette;
  typography: ThemeTypography;
  branding?: ThemeBranding;
  designStyle?: string;
  vibeContext?: string;
  isEditable: boolean;
  isLoading?: boolean;
  loadingMessage?: string;
}

/**
 * Slide in outline preview
 */
export interface OutlineSlidePreview {
  id: string;
  title: string;
  subtitle?: string;
  keyPoints?: string[];
  content?: string;
  generationContext?: string;
  isContentLoaded?: boolean;
  isContentEdited?: boolean;
  assignedVideo?: AssignedVideo;
  taggedMedia?: TaggedMedia[];
}

/**
 * Outline preview data for inline display
 */
export interface OutlinePreviewData {
  outlineId: string;
  title: string;
  slides: OutlineSlidePreview[];
  isEditable?: boolean;
  isLoading?: boolean;
}

/**
 * Research card data
 */
export interface ResearchCardData {
  id: string;
  query: string;
  content: string;
  citations: string[];
  timestamp: Date;
}

/**
 * Chat block types
 */
export type ChatBlockType = 'theme_editor' | 'outline_preview' | 'research_card';

/**
 * Generic chat block
 */
export interface ChatBlock<T = ThemeEditorData | OutlinePreviewData | ResearchCardData> {
  id: string;
  type: ChatBlockType;
  collapsed: boolean;
  data: T;
}

/**
 * Theme editor block
 */
export interface ThemeEditorBlock extends ChatBlock<ThemeEditorData> {
  type: 'theme_editor';
}

/**
 * Outline preview block
 */
export interface OutlinePreviewBlock extends ChatBlock<OutlinePreviewData> {
  type: 'outline_preview';
}

/**
 * Research card block
 */
export interface ResearchCardBlock extends ChatBlock<ResearchCardData> {
  type: 'research_card';
}

/**
 * Extended chat message with blocks
 */
export interface ChatMessageWithBlocks {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  blocks?: ChatBlock[];
  thinkingSteps?: ThinkingStep[];
  isStreaming?: boolean;
}

/**
 * Helper to check block type
 */
export function isThemeEditorBlock(block: ChatBlock): block is ThemeEditorBlock {
  return block.type === 'theme_editor';
}

export function isOutlinePreviewBlock(block: ChatBlock): block is OutlinePreviewBlock {
  return block.type === 'outline_preview';
}

export function isResearchCardBlock(block: ChatBlock): block is ResearchCardBlock {
  return block.type === 'research_card';
}

/**
 * Convert backend theme to ThemeEditorData
 */
export function backendThemeToEditorData(
  theme: any,
  themeId: string,
  vibeContext?: string
): ThemeEditorData {
  const colorPalette = theme?.color_palette || theme;
  const typography = theme?.typography || {};

  return {
    themeId,
    colors: {
      primary_background: colorPalette?.primary_background || '#FFFFFF',
      secondary_background: colorPalette?.secondary_background,
      primary_text: colorPalette?.primary_text || '#1A1A1A',
      accent_1: colorPalette?.accent_1 || '#FF4301',
      accent_2: colorPalette?.accent_2 || colorPalette?.accent_1 || '#FF4301',
      colors: colorPalette?.colors || [colorPalette?.accent_1, colorPalette?.accent_2].filter(Boolean),
      backgrounds: colorPalette?.backgrounds,
      text_colors: colorPalette?.text_colors,
    },
    typography: {
      headingFont: typography?.hero_title?.family || typography?.hero_title?.font_family || 'Inter',
      bodyFont: typography?.body_text?.family || typography?.body_text?.font_family || 'Inter',
      headingWeight: typography?.hero_title?.weight,
      bodyWeight: typography?.body_text?.weight,
    },
    branding: {
      logoUrl: theme?.logo?.url || theme?.logo_url || theme?.brandInfo?.logoUrl,
      brandName: theme?.brandInfo?.name || theme?.brand_name,
      brandDomain: theme?.brandInfo?.domain,
    },
    designStyle: theme?.design_style,
    vibeContext,
    isEditable: true,
  };
}

/**
 * Convert ThemeEditorData to backend theme format
 */
export function editorDataToBackendTheme(data: ThemeEditorData): any {
  return {
    color_palette: {
      primary_background: data.colors.primary_background,
      secondary_background: data.colors.secondary_background,
      primary_text: data.colors.primary_text,
      accent_1: data.colors.accent_1,
      accent_2: data.colors.accent_2,
      colors: data.colors.colors,
      backgrounds: data.colors.backgrounds,
      text_colors: data.colors.text_colors,
    },
    typography: {
      hero_title: {
        family: data.typography.headingFont,
        weight: data.typography.headingWeight,
      },
      body_text: {
        family: data.typography.bodyFont,
        weight: data.typography.bodyWeight,
      },
    },
    logo: data.branding?.logoUrl ? { url: data.branding.logoUrl } : undefined,
    design_style: data.designStyle,
  };
}
