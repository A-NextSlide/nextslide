/**
 * useChatBlocks Hook
 * Manages inline chat blocks (theme editor, outline preview) state and interactions
 */

import { useState, useCallback, useRef } from 'react';
import { useThemeStore } from '@/stores/themeStore';
import { useFontLoader } from './useFontLoading';
import {
  ThemeEditorData,
  OutlinePreviewData,
  ChatBlock,
  editorDataToBackendTheme,
} from '@/types/chatBlocks';
import {
  reorderColorsWithAccentsFirst,
  buildThemePayloadForStore,
  buildWorkspaceTheme,
} from '@/utils/themeUtils';

interface UseChatBlocksOptions {
  outlineId: string;
  onThemeApplied?: (theme: ThemeEditorData) => void;
  onOutlineChanged?: (outline: OutlinePreviewData) => void;
}

export function useChatBlocks(options: UseChatBlocksOptions) {
  const { outlineId, onThemeApplied, onOutlineChanged } = options;
  const { loadFont, loadThemeFonts, isLoading: isFontLoading } = useFontLoader();

  // Block state
  const [themeBlock, setThemeBlock] = useState<ThemeEditorData | null>(null);
  const [outlineBlock, setOutlineBlock] = useState<OutlinePreviewData | null>(null);
  const [collapseState, setCollapseState] = useState<Record<string, boolean>>({});

  // Track pending changes for debouncing
  const pendingChangesRef = useRef<ThemeEditorData | null>(null);
  const syncTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Toggle collapse state for a block
   */
  const toggleCollapse = useCallback((blockId: string) => {
    setCollapseState(prev => ({
      ...prev,
      [blockId]: !prev[blockId],
    }));
  }, []);

  /**
   * Set collapse state for a block
   */
  const setCollapsed = useCallback((blockId: string, collapsed: boolean) => {
    setCollapseState(prev => ({
      ...prev,
      [blockId]: collapsed,
    }));
  }, []);

  /**
   * Sync theme to themeStore (debounced)
   */
  const syncThemeToStore = useCallback((themeData: ThemeEditorData) => {
    if (syncTimeoutRef.current) {
      clearTimeout(syncTimeoutRef.current);
    }

    pendingChangesRef.current = themeData;

    syncTimeoutRef.current = setTimeout(() => {
      const data = pendingChangesRef.current;
      if (!data || !outlineId) return;

      const themePayload = buildThemePayloadForStore({
        colors: data.colors,
        typography: data.typography,
        logoUrl: data.branding?.logoUrl,
      });

      useThemeStore.getState().setOutlineDeckTheme?.(outlineId, themePayload);
      pendingChangesRef.current = null;
    }, 100);
  }, [outlineId]);

  /**
   * Handle color change in theme editor
   */
  const handleColorChange = useCallback((colorKey: string, hex: string) => {
    setThemeBlock(prev => {
      if (!prev) return prev;

      const newColors = { ...prev.colors, [colorKey]: hex };

      // CRITICAL: Ensure accent_1 and accent_2 are at front of colors array
      const reorderedColors = reorderColorsWithAccentsFirst(
        newColors.colors || [],
        newColors.accent_1,
        newColors.accent_2
      );
      newColors.colors = reorderedColors;

      const updated = { ...prev, colors: newColors };

      // Sync to store
      syncThemeToStore(updated);

      return updated;
    });
  }, [syncThemeToStore]);

  /**
   * Handle font change in theme editor
   */
  const handleFontChange = useCallback(async (
    fontType: 'heading' | 'body',
    fontFamily: string
  ) => {
    // Load font first
    await loadFont(fontFamily);

    setThemeBlock(prev => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        typography: {
          ...prev.typography,
          [fontType === 'heading' ? 'headingFont' : 'bodyFont']: fontFamily,
        },
      };

      // Sync to store
      syncThemeToStore(updated);

      return updated;
    });
  }, [loadFont, syncThemeToStore]);

  /**
   * Handle brand/logo change
   */
  const handleBrandChange = useCallback((brand: {
    name?: string;
    logoUrl?: string;
    domain?: string;
  }) => {
    setThemeBlock(prev => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        branding: {
          ...prev.branding,
          brandName: brand.name ?? prev.branding?.brandName,
          logoUrl: brand.logoUrl ?? prev.branding?.logoUrl,
          brandDomain: brand.domain ?? prev.branding?.brandDomain,
        },
      };

      // Sync to store
      syncThemeToStore(updated);

      return updated;
    });
  }, [syncThemeToStore]);

  /**
   * Apply theme to workspace (commit changes)
   */
  const applyTheme = useCallback(async () => {
    if (!themeBlock) return;

    // Load fonts before applying
    await loadThemeFonts(
      themeBlock.typography.headingFont,
      themeBlock.typography.bodyFont
    );

    // Build workspace theme
    const workspaceTheme = buildWorkspaceTheme({
      name: themeBlock.branding?.brandName || 'Custom Theme',
      backgroundColor: themeBlock.colors.primary_background,
      textColor: themeBlock.colors.primary_text,
      headingFont: themeBlock.typography.headingFont,
      bodyFont: themeBlock.typography.bodyFont,
      accent1: themeBlock.colors.accent_1,
      accent2: themeBlock.colors.accent_2,
    });

    // Add to theme store and set as active
    const themeStore = useThemeStore.getState();
    const themeId = themeStore.addCustomTheme(workspaceTheme);
    themeStore.setWorkspaceTheme(themeId);
    themeStore.setThemeReady(true);

    // Also update outline deck theme
    const themePayload = buildThemePayloadForStore({
      colors: themeBlock.colors,
      typography: themeBlock.typography,
      logoUrl: themeBlock.branding?.logoUrl,
    });
    themeStore.setOutlineDeckTheme?.(outlineId, themePayload);

    // Notify parent
    onThemeApplied?.(themeBlock);
  }, [themeBlock, outlineId, loadThemeFonts, onThemeApplied]);

  /**
   * Set theme block from external source (e.g., agent event)
   */
  const setThemeFromAgent = useCallback(async (data: ThemeEditorData) => {
    // Load fonts first
    await loadThemeFonts(
      data.typography.headingFont,
      data.typography.bodyFont
    );

    setThemeBlock(data);

    // Sync to store
    syncThemeToStore(data);

    // Auto-expand when new theme arrives
    setCollapseState(prev => ({
      ...prev,
      [data.themeId]: false,
    }));
  }, [loadThemeFonts, syncThemeToStore]);

  /**
   * Set outline block from external source
   */
  const setOutlineFromAgent = useCallback((data: OutlinePreviewData) => {
    setOutlineBlock(data);
    onOutlineChanged?.(data);

    // Auto-expand when new outline arrives
    setCollapseState(prev => ({
      ...prev,
      [data.outlineId]: false,
    }));
  }, [onOutlineChanged]);

  /**
   * Update a slide in the outline
   */
  const updateSlide = useCallback((slideId: string, updates: Partial<{
    title: string;
    subtitle: string;
    keyPoints: string[];
    content: string;
  }>) => {
    setOutlineBlock(prev => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        slides: prev.slides.map(slide =>
          slide.id === slideId ? { ...slide, ...updates } : slide
        ),
      };

      onOutlineChanged?.(updated);
      return updated;
    });
  }, [onOutlineChanged]);

  /**
   * Delete a slide from outline
   */
  const deleteSlide = useCallback((slideId: string) => {
    setOutlineBlock(prev => {
      if (!prev) return prev;

      const updated = {
        ...prev,
        slides: prev.slides.filter(slide => slide.id !== slideId),
      };

      onOutlineChanged?.(updated);
      return updated;
    });
  }, [onOutlineChanged]);

  /**
   * Add a new slide to outline
   */
  const addSlide = useCallback((afterSlideId?: string) => {
    setOutlineBlock(prev => {
      if (!prev) return prev;

      const newSlide = {
        id: `slide-${Date.now()}`,
        title: 'New Slide',
        subtitle: '',
        keyPoints: [],
      };

      let slides = [...prev.slides];
      if (afterSlideId) {
        const index = slides.findIndex(s => s.id === afterSlideId);
        slides.splice(index + 1, 0, newSlide);
      } else {
        slides.push(newSlide);
      }

      const updated = { ...prev, slides };
      onOutlineChanged?.(updated);
      return updated;
    });
  }, [onOutlineChanged]);

  /**
   * Reorder slides in outline
   */
  const reorderSlides = useCallback((fromIndex: number, toIndex: number) => {
    setOutlineBlock(prev => {
      if (!prev) return prev;

      const slides = [...prev.slides];
      const [removed] = slides.splice(fromIndex, 1);
      slides.splice(toIndex, 0, removed);

      const updated = { ...prev, slides };
      onOutlineChanged?.(updated);
      return updated;
    });
  }, [onOutlineChanged]);

  /**
   * Get theme data in backend format
   */
  const getThemeForBackend = useCallback(() => {
    if (!themeBlock) return null;
    return editorDataToBackendTheme(themeBlock);
  }, [themeBlock]);

  /**
   * Clear all blocks
   */
  const clearBlocks = useCallback(() => {
    setThemeBlock(null);
    setOutlineBlock(null);
    setCollapseState({});
  }, []);

  return {
    // State
    themeBlock,
    outlineBlock,
    collapseState,
    isFontLoading,

    // Theme actions
    handleColorChange,
    handleFontChange,
    handleBrandChange,
    applyTheme,
    setThemeFromAgent,
    setThemeBlock,
    getThemeForBackend,

    // Outline actions
    setOutlineFromAgent,
    setOutlineBlock,
    updateSlide,
    deleteSlide,
    addSlide,
    reorderSlides,

    // UI actions
    toggleCollapse,
    setCollapsed,
    clearBlocks,
  };
}

export type UseChatBlocksReturn = ReturnType<typeof useChatBlocks>;
