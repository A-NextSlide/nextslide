import { useCallback, useEffect, useRef, useState } from 'react';
import type { OutlineData } from '@/services/outlineAgentService';
import type { ThemeEditorData, ThemeColorPalette } from '@/types/chatBlocks';
import { useFontLoader } from '@/hooks/useFontLoading';
import { normalizeReferenceImages } from '@/utils/referenceImages';
import {
  buildThemeBlockFromOutline,
  mergeThemeBlockWithGenerated,
} from '../utils/theme';
import { extractDomainFromText } from '../utils/domain';

interface UseThemeBlockOptions {
  onThinkingStart?: (status: string, message?: string, query?: string) => void;
  onThinkingComplete?: (phase: string) => void;
}

export const useThemeBlock = (options: UseThemeBlockOptions = {}) => {
  const { onThinkingStart, onThinkingComplete } = options;
  const [themeBlock, setThemeBlock] = useState<ThemeEditorData | null>(null);
  const [isThemeLoading, setIsThemeLoading] = useState(false);
  const [lastThemeVibeContext, setLastThemeVibeContext] = useState<string | null>(null);
  const isThemeLoadingRef = useRef(false);
  // Stable outline ID to prevent creating new temp IDs on every call
  const stableOutlineIdRef = useRef<string | null>(null);
  const { loadThemeFonts } = useFontLoader();

  useEffect(() => {
    isThemeLoadingRef.current = isThemeLoading;
  }, [isThemeLoading]);

  const handleThemeColorChange = useCallback((colorKey: keyof ThemeColorPalette | string, hex: string) => {
    setThemeBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        colors: {
          ...prev.colors,
          [colorKey]: hex,
        },
        hasExplicitColors: true,
      };
    });
  }, []);

  const handleThemeFontChange = useCallback(async (fontType: 'heading' | 'body', fontFamily: string) => {
    const headingFont = fontType === 'heading' ? fontFamily : themeBlock?.typography.headingFont || 'Inter';
    const bodyFont = fontType === 'body' ? fontFamily : themeBlock?.typography.bodyFont || 'Inter';
    await loadThemeFonts(headingFont, bodyFont);

    setThemeBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        typography: {
          ...prev.typography,
          [fontType === 'heading' ? 'headingFont' : 'bodyFont']: fontFamily,
        },
      };
    });
  }, [loadThemeFonts, themeBlock]);

  const handleLogoChange = useCallback((logoUrl: string | null) => {
    setThemeBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        branding: { ...prev.branding, logoUrl: logoUrl || undefined },
      };
    });
  }, []);

  const handleBrandNameChange = useCallback((name: string) => {
    setThemeBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        branding: { ...prev.branding, brandName: name },
      };
    });
  }, []);

  const triggerThemeGeneration = useCallback(async ({
    vibeContext,
    outlineTitle,
    initialIdea,
    slides,
    availableVideos,
    stylePreferences,
  }: {
    vibeContext: string;
    outlineTitle: string;
    initialIdea?: string;
    slides?: Array<{ title: string; content?: string; key_points?: string[] }>;
    availableVideos?: any[];
    stylePreferences?: OutlineData['stylePreferences'];
  }) => {
    const normalizedVibe = vibeContext?.trim();
    if (!normalizedVibe) return;
    if (isThemeLoadingRef.current) return;
    if (lastThemeVibeContext && normalizedVibe.toLowerCase() === lastThemeVibeContext.toLowerCase()) {
      return;
    }

    // Skip regeneration if we already have explicit colors from a previous fetch
    // BUT only if the vibe is essentially just the domain (no style modifiers)
    if (themeBlock?.hasExplicitColors && themeBlock?.branding?.brandDomain) {
      const currentDomain = themeBlock.branding.brandDomain.toLowerCase();
      const domainBase = currentDomain.replace('.com', '').replace('.co', '').replace('.io', '');
      const vibeLower = normalizedVibe.toLowerCase().trim();

      // Only skip if vibe is JUST the domain name (no additional style modifiers)
      const isJustDomain = vibeLower === currentDomain ||
                           vibeLower === domainBase ||
                           vibeLower === `${domainBase}.com` ||
                           vibeLower === `www.${currentDomain}`;

      if (isJustDomain) {
        console.log('[useThemeBlock] Skipping regeneration - same domain without modifiers:', currentDomain);
        return;
      }
    }

    setIsThemeLoading(true);
    const isDomainLike = normalizedVibe.includes('.') && normalizedVibe.length < 64;
    const themeMessage = isDomainLike
      ? `Fetching brand images for ${normalizedVibe}...`
      : 'Generating theme...';
    onThinkingStart?.('fetching_brand', themeMessage, normalizedVibe);
    setThemeBlock((prev) => (prev ? { ...prev, loadingMessage: themeMessage } : prev));

    let didApplyTheme = false;
    const applyTheme = (theme: any) => {
      if (!theme?.color_palette) return;
      didApplyTheme = true;
      setThemeBlock((prev) => (prev ? { ...mergeThemeBlockWithGenerated(prev, theme), loadingMessage: undefined } : prev));
      setIsThemeLoading(false);
      setLastThemeVibeContext(normalizedVibe);
      onThinkingComplete?.('fetching_brand');
    };

    try {
      const { outlineApi } = await import('@/services/outlineApi');
      // Use stable outline ID to prevent duplicate theme generation calls
      if (!stableOutlineIdRef.current) {
        stableOutlineIdRef.current = `theme-${Date.now()}`;
      }
      const tempOutlineId = stableOutlineIdRef.current;
      const themeSlides = slides && slides.length > 0
        ? slides.map((slide, index) => ({
          id: `slide-${index}`,
          title: slide.title,
          content: slide.content || slide.key_points?.join('\n') || '',
        }))
        : [{ id: 'slide-0', title: outlineTitle || 'Presentation', content: '' }];

      const themeOutline = {
        id: tempOutlineId,
        title: outlineTitle || initialIdea || 'Presentation',
        slides: themeSlides,
        stylePreferences: {
          initialIdea,
          vibeContext: normalizedVibe,
          brandName: stylePreferences?.brandName,
          brandDomain: stylePreferences?.brandDomain,
          brandDomainCandidates: stylePreferences?.brandDomainCandidates,
          needsBrandDomainConfirmation: stylePreferences?.needsBrandDomainConfirmation,
          font: stylePreferences?.font,
          bodyFont: stylePreferences?.bodyFont,
          colors: stylePreferences?.colors,
          logoUrl: stylePreferences?.logoUrl,
          logoUrlDark: stylePreferences?.logoUrlDark,
          referenceImages: normalizeReferenceImages(stylePreferences?.referenceImages),
        },
        notes: {
          videos: Array.isArray(availableVideos) ? availableVideos : [],
        },
      };

      const themeResult = await outlineApi.generateThemeFromOutline(
        themeOutline as any,
        tempOutlineId,
        (evt) => {
          // Handle theme status events from the backend
          if ((evt as any).type === 'agent_event' || (evt as any).status) {
            const status = (evt as any).status || (evt as any).phase;
            const message = (evt as any).message || (evt as any).summary;
            if (status && message) {
              onThinkingStart?.(status, message);
            }
          }
          // Handle completed theme
          if ((evt as any).type === 'theme_generated' || (evt as any).type === 'theme_preview_update') {
            const theme = (evt as any).theme || evt;
            applyTheme(theme);
          }
        }
      );

      if (!didApplyTheme && themeResult?.theme?.color_palette) {
        applyTheme(themeResult.theme);
      }
    } catch (err) {
      console.error('[ConversationalOnboarding] Failed to fetch brand colors:', err);
      setIsThemeLoading(false);
      setThemeBlock((prev) => (prev ? { ...prev, loadingMessage: undefined } : prev));
      onThinkingComplete?.('fetching_brand');
    }

    if (!didApplyTheme) {
      setIsThemeLoading(false);
      setThemeBlock((prev) => (prev ? { ...prev, loadingMessage: undefined } : prev));
      onThinkingComplete?.('fetching_brand');
    }
  }, [lastThemeVibeContext, onThinkingComplete, onThinkingStart]);

  const initializeThemeFromOutline = useCallback((outlineData: OutlineData) => {
    const hasExistingTheme = Boolean(themeBlock?.hasExplicitColors);
    // Track if user has already confirmed the domain locally - this should NEVER be overwritten by backend
    const userConfirmedDomain = themeBlock?.branding?.needsBrandDomainConfirmation === false;

    const stylePrefs = outlineData.stylePreferences || {};
    // If user already confirmed domain locally, ignore backend's needsBrandDomainConfirmation
    const needsDomainConfirmation = userConfirmedDomain ? false : Boolean(stylePrefs.needsBrandDomainConfirmation);
    const vibeContext = stylePrefs.brandDomain || outlineData.brandContext || outlineData.style || outlineData.topic || outlineData.title;
    const vibeContextChanged = vibeContext && lastThemeVibeContext &&
      vibeContext.toLowerCase() !== lastThemeVibeContext.toLowerCase();

    // If we already have explicit colors from prefetch and no new brand domain was detected,
    // skip regeneration - the prefetched theme is good enough for topic-based themes
    const hasBrandDomain = Boolean(stylePrefs.brandDomain || outlineData.brandContext);
    const prefetchedThemeIsGoodEnough = hasExistingTheme && !hasBrandDomain;
    const shouldFetchTheme = !isThemeLoadingRef.current && !prefetchedThemeIsGoodEnough && (!hasExistingTheme || vibeContextChanged);

    // CRITICAL: If we already have explicit colors from theme generation, KEEP them
    // even if vibe context changed. Only rebuild if we don't have colors.
    // The theme generation happens async and its colors should persist.
    let currentThemeBlock = hasExistingTheme
      ? themeBlock
      : buildThemeBlockFromOutline(outlineData);

    // CRITICAL: Always preserve needsBrandDomainConfirmation: false once user confirmed domain locally
    // This prevents backend responses from re-locking the generation buttons
    if (userConfirmedDomain && currentThemeBlock?.branding?.needsBrandDomainConfirmation !== false) {
      currentThemeBlock = {
        ...currentThemeBlock!,
        branding: {
          ...currentThemeBlock!.branding,
          needsBrandDomainConfirmation: false,
        },
      };
    }

    if (currentThemeBlock && hasExistingTheme && !vibeContextChanged) {
      const mergedBranding = {
        ...currentThemeBlock.branding,
        brandName: stylePrefs.brandName ?? currentThemeBlock.branding?.brandName ?? outlineData.brandContext,
        brandDomain: stylePrefs.brandDomain ?? currentThemeBlock.branding?.brandDomain,
        brandDomainCandidates: stylePrefs.brandDomainCandidates ?? currentThemeBlock.branding?.brandDomainCandidates,
        // Preserve false if user already confirmed - never let backend overwrite this back to true
        needsBrandDomainConfirmation: userConfirmedDomain
          ? false
          : (stylePrefs.needsBrandDomainConfirmation ?? currentThemeBlock.branding?.needsBrandDomainConfirmation),
        logoUrl: stylePrefs.logoUrl ?? currentThemeBlock.branding?.logoUrl,
      };
      const brandingChanged = Boolean(
        mergedBranding.brandDomain !== currentThemeBlock.branding?.brandDomain ||
        mergedBranding.needsBrandDomainConfirmation !== currentThemeBlock.branding?.needsBrandDomainConfirmation ||
        mergedBranding.brandName !== currentThemeBlock.branding?.brandName ||
        mergedBranding.logoUrl !== currentThemeBlock.branding?.logoUrl ||
        JSON.stringify(mergedBranding.brandDomainCandidates || []) !== JSON.stringify(currentThemeBlock.branding?.brandDomainCandidates || [])
      );

      if (brandingChanged) {
        currentThemeBlock = {
          ...currentThemeBlock,
          branding: mergedBranding,
        };
      }
    }

    if (!hasExistingTheme || vibeContextChanged || currentThemeBlock !== themeBlock) {
      setThemeBlock(currentThemeBlock);
    }

    if (currentThemeBlock) {
      loadThemeFonts(currentThemeBlock.typography.headingFont, currentThemeBlock.typography.bodyFont);
    }

    if (needsDomainConfirmation) {
      setIsThemeLoading(false);
      return currentThemeBlock;
    }

    if (vibeContext && shouldFetchTheme) {
      void triggerThemeGeneration({
        vibeContext,
        outlineTitle: outlineData.topic || 'Presentation',
        initialIdea: outlineData.topic,
        slides: outlineData.slides,
        availableVideos: outlineData.scraped_videos,
        stylePreferences: outlineData.stylePreferences,
      });
    } else if (!isThemeLoadingRef.current) {
      setIsThemeLoading(false);
    }

    return currentThemeBlock;
  }, [lastThemeVibeContext, loadThemeFonts, themeBlock, triggerThemeGeneration]);

  const prefetchThemeFromPrompt = useCallback((prompt: string, styleContext?: string) => {
    if (!prompt) return;
    // Skip if we already have explicit colors (theme has been generated)
    if (themeBlock?.hasExplicitColors) {
      console.log('[useThemeBlock] Skipping prefetch - theme already has explicit colors');
      return;
    }
    const domainFromPrompt = extractDomainFromText(prompt);
    const domainFromStyle = extractDomainFromText(styleContext);
    const vibeContext = domainFromPrompt || domainFromStyle || styleContext || prompt;
    if (!vibeContext) return;
    if (isThemeLoadingRef.current) return;
    // Skip if we've already generated a theme for this context
    if (lastThemeVibeContext && vibeContext.toLowerCase() === lastThemeVibeContext.toLowerCase()) {
      console.log('[useThemeBlock] Skipping prefetch - same vibe context:', vibeContext);
      return;
    }

    const seedOutline: OutlineData = {
      action: 'generate_outline',
      topic: prompt,
      brandContext: domainFromPrompt || domainFromStyle,
      style: styleContext,
      slides: [],
      stylePreferences: {
        initialIdea: prompt,
        vibeContext,
        brandDomain: domainFromPrompt || domainFromStyle,
      },
    };

    const nextThemeBlock = buildThemeBlockFromOutline(seedOutline);
    setThemeBlock((prev) => prev || nextThemeBlock);
    loadThemeFonts(nextThemeBlock.typography.headingFont, nextThemeBlock.typography.bodyFont);

    void triggerThemeGeneration({
      vibeContext,
      outlineTitle: prompt,
      initialIdea: prompt,
      slides: seedOutline.slides,
      availableVideos: [],
      stylePreferences: seedOutline.stylePreferences,
    });
  }, [lastThemeVibeContext, loadThemeFonts, themeBlock?.hasExplicitColors, triggerThemeGeneration]);

  return {
    themeBlock,
    isThemeLoading,
    isThemeLoadingRef,
    lastThemeVibeContext,
    setThemeBlock,
    setIsThemeLoading,
    setLastThemeVibeContext,
    initializeThemeFromOutline,
    prefetchThemeFromPrompt,
    handleThemeColorChange,
    handleThemeFontChange,
    handleLogoChange,
    handleBrandNameChange,
  };
};
