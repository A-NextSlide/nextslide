import { useCallback, useState, useRef } from 'react';
import type { OutlineData } from '@/services/outlineAgentService';
import type { OutlinePreviewData, OutlineSlidePreview, OutlineUpdateAction } from '@/types/chatBlocks';
import type { OutlineFlowState } from '../types';
import {
  buildOutlinePreview,
  createOutlineSlideId,
  extractOutlineSlides,
  hasSlideTitleOverlap,
  mergeOutlinePreview,
} from '../utils/outline';

export interface SlideUpdate {
  index?: number;
  id?: string;
  backendId?: string;
  title?: string;
  subtitle?: string;
  content?: string;
  key_points?: string[];
  keyPoints?: string[];
}

export const useOutlineState = () => {
  const [outlineFlow, setOutlineFlow] = useState<OutlineFlowState | null>(null);
  const [outlineBlock, setOutlineBlock] = useState<OutlinePreviewData | null>(null);

  // Track current action for UI feedback
  const currentActionRef = useRef<OutlineUpdateAction | null>(null);

  const initializeOutline = useCallback((outlineData: OutlineData) => {
    console.log('[OutlineState] initializeOutline called with:', {
      hasSlides: Boolean(outlineData?.slides?.length),
      slideCount: outlineData?.slides?.length,
      title: outlineData?.title,
      action: outlineData?.action,
    });

    const preview = buildOutlinePreview(outlineData);
    const sourceSlides = extractOutlineSlides(outlineData);

    console.log('[OutlineState] buildOutlinePreview result:', {
      hasPreview: Boolean(preview),
      previewSlideCount: preview?.slides?.length,
      sourceSlideCount: sourceSlides.length,
    });

    // Helper to preserve needsBrandDomainConfirmation: false once user confirms domain
    const preserveConfirmedDomain = (prev: OutlineFlowState | null, newData: OutlineData) => {
      const userConfirmedDomain = prev?.stylePreferences?.needsBrandDomainConfirmation === false;
      if (userConfirmedDomain && newData.stylePreferences?.needsBrandDomainConfirmation !== false) {
        return {
          ...newData,
          stylePreferences: {
            ...newData.stylePreferences,
            needsBrandDomainConfirmation: false,
          },
        };
      }
      return newData;
    };

    if (preview?.slides?.length && sourceSlides.length > 0) {
      const normalizedSlides = sourceSlides.map((slide, index) => {
        const previewSlide = preview.slides[index];
        if (!previewSlide) return slide;
        return {
          ...slide,
          title: previewSlide.title,
          subtitle: previewSlide.subtitle,
          content: previewSlide.content || slide.content,
          isContentLoaded: Boolean(previewSlide.content || slide.content),
          key_points: previewSlide.keyPoints && previewSlide.keyPoints.length > 0
            ? previewSlide.keyPoints
            : slide.key_points,
        };
      });
      setOutlineFlow((prev) => preserveConfirmedDomain(prev, { ...outlineData, slides: normalizedSlides }));
    } else {
      const fallbackSlides = preview?.slides?.length
        ? preview.slides.map((slide) => ({
          title: slide.title || 'Untitled',
          subtitle: slide.subtitle,
          content: slide.content,
          key_points: slide.keyPoints,
          assignedVideo: slide.assignedVideo,
          taggedMedia: slide.taggedMedia,
        }))
        : outlineData.slides;
      setOutlineFlow((prev) => preserveConfirmedDomain(
        prev,
        fallbackSlides ? { ...outlineData, slides: fallbackSlides } : outlineData
      ));
    }
    setOutlineBlock(preview);
    return preview;
  }, []);

  const mergeOutline = useCallback((outlineData: OutlineData, options?: { allowReplace?: boolean }) => {
    const allowReplace = options?.allowReplace ?? true;
    setOutlineFlow((prev) => {
      if (!prev) return outlineData;

      const incomingSlides = extractOutlineSlides(outlineData);
      const existingSlides = prev.slides || [];
      const shouldReplace = allowReplace && !hasSlideTitleOverlap(existingSlides, incomingSlides);

      if (shouldReplace) {
        // Even when replacing, preserve needsBrandDomainConfirmation=false if set locally
        if (prev.stylePreferences?.needsBrandDomainConfirmation === false) {
          return {
            ...outlineData,
            stylePreferences: {
              ...outlineData.stylePreferences,
              needsBrandDomainConfirmation: false,
            },
          };
        }
        return outlineData;
      }
      const maxSlides = Math.max(existingSlides.length, incomingSlides.length);
      const mergedSlides = Array.from({ length: maxSlides }).map((_, index) => {
        const incoming = incomingSlides[index];
        const current = existingSlides[index];
        if (!incoming && current) return current;
        if (incoming && !current) return incoming;
        if (!incoming || !current) return null;

        const mergedContent = ((incoming as any).content && (incoming as any).content.length > ((current as any).content || '').length)
          ? (incoming as any).content
          : (current as any).content;
        const mergedKeyPoints = ((incoming as any).key_points && (incoming as any).key_points.length > ((current as any).key_points || []).length)
          ? (incoming as any).key_points
          : (current as any).key_points;
        const mergedTitle = (current.title && current.title !== 'Untitled' && current.title !== 'New Slide')
          ? current.title
          : incoming.title;

        return {
          ...current,
          ...incoming,
          title: mergedTitle,
          content: mergedContent,
          key_points: mergedKeyPoints,
          assignedVideo: (incoming as any).assignedVideo || (current as any).assignedVideo,
        };
      }).filter((slide): slide is NonNullable<typeof slide> => slide !== null);

      // CRITICAL: Preserve needsBrandDomainConfirmation=false if it was explicitly set locally
      // Once user confirms domain, backend responses should NEVER re-lock generation
      const userConfirmedDomain = prev.stylePreferences?.needsBrandDomainConfirmation === false;
      const mergedStylePreferences = {
        ...prev.stylePreferences,
        ...outlineData.stylePreferences,
        // If user already confirmed domain locally (false), ALWAYS preserve it - never let backend overwrite to true
        needsBrandDomainConfirmation: userConfirmedDomain
          ? false
          : (outlineData.stylePreferences?.needsBrandDomainConfirmation ?? prev.stylePreferences?.needsBrandDomainConfirmation),
      };

      return {
        ...prev,
        ...outlineData,
        stylePreferences: mergedStylePreferences,
        slides: mergedSlides,
        scraped_context: outlineData.scraped_context ?? prev.scraped_context,
        reference_sources: outlineData.reference_sources ?? prev.reference_sources,
        research_context: outlineData.research_context ?? prev.research_context,
        research_citations: outlineData.research_citations ?? prev.research_citations,
        scraped_videos: outlineData.scraped_videos ?? prev.scraped_videos,
      };
    });

    setOutlineBlock((prev) => {
      if (allowReplace && prev && outlineData.slides && !hasSlideTitleOverlap(prev.slides, outlineData.slides)) {
        return buildOutlinePreview(outlineData);
      }
      return mergeOutlinePreview(outlineData, prev, { allowReplace });
    });
  }, []);

  const handleSlideEdit = useCallback((slideId: string, updates: Partial<OutlineSlidePreview>) => {
    setOutlineBlock((prev) => {
      if (!prev) return prev;
      const slideIndex = prev.slides.findIndex((slide) => slide.id === slideId);
      if (slideIndex < 0) return prev;

      const updatedSlides = prev.slides.map((slide) =>
        slide.id === slideId ? { ...slide, ...updates } : slide
      );

      setOutlineFlow((flowPrev) => {
        if (!flowPrev?.slides || slideIndex < 0) return flowPrev;
        const updatedFlowSlides = [...flowPrev.slides];
        const currentSlide = updatedFlowSlides[slideIndex];
        if (!currentSlide) return flowPrev;

        updatedFlowSlides[slideIndex] = {
          ...currentSlide,
          title: updates.title ?? currentSlide.title,
          subtitle: updates.subtitle ?? currentSlide.subtitle,
          content: updates.content ?? currentSlide.content,
          key_points: updates.keyPoints ?? currentSlide.key_points,
        };

        return { ...flowPrev, slides: updatedFlowSlides };
      });

      return { ...prev, slides: updatedSlides };
    });
  }, []);

  const handleSlideAdd = useCallback(() => {
    const newSlide: OutlineSlidePreview = {
      id: createOutlineSlideId(),
      title: 'New Slide',
      content: '',
      keyPoints: [],
      isContentLoaded: false,
      isContentEdited: false,
    };

    setOutlineBlock((prev) => (prev ? { ...prev, slides: [...prev.slides, newSlide] } : prev));
    setOutlineFlow((prev) => (prev ? {
      ...prev,
      slides: [...(prev.slides || []), { title: 'New Slide', content: '', key_points: [] }],
    } : prev));
  }, []);

  const handleSlideDelete = useCallback((slideId: string) => {
    setOutlineBlock((prev) => {
      if (!prev) return prev;
      const slideIndex = prev.slides.findIndex((slide) => slide.id === slideId);
      if (slideIndex < 0) return prev;
      const updatedSlides = prev.slides.filter((slide) => slide.id !== slideId);

      setOutlineFlow((flowPrev) => {
        if (!flowPrev?.slides || slideIndex < 0) return flowPrev;
        const updatedFlowSlides = [...flowPrev.slides];
        updatedFlowSlides.splice(slideIndex, 1);
        return { ...flowPrev, slides: updatedFlowSlides };
      });

      return { ...prev, slides: updatedSlides };
    });
  }, []);

  const handleSlideReorder = useCallback((fromIndex: number, toIndex: number) => {
    setOutlineBlock((prev) => {
      if (!prev) return prev;
      const reordered = [...prev.slides];
      const [moved] = reordered.splice(fromIndex, 1);
      reordered.splice(toIndex, 0, moved);

      setOutlineFlow((flowPrev) => {
        if (!flowPrev?.slides) return flowPrev;
        const reorderedFlowSlides = [...flowPrev.slides];
        const [flowMoved] = reorderedFlowSlides.splice(fromIndex, 1);
        reorderedFlowSlides.splice(toIndex, 0, flowMoved);
        return { ...flowPrev, slides: reorderedFlowSlides };
      });

      return { ...prev, slides: reordered };
    });
  }, []);

  /**
   * Update specific slides by index or ID - for granular update_slides action
   * Only updates the specified slides, preserves everything else
   */
  const updateSpecificSlides = useCallback((updates: SlideUpdate[]) => {
    console.log('[OutlineState] updateSpecificSlides called with:', updates);

    setOutlineBlock((prev) => {
      if (!prev) return prev;

      const updatedSlides = prev.slides.map((slide, index) => {
        // Find matching update by index, id, or backendId
        const update = updates.find(u =>
          (u.index !== undefined && u.index === index) ||
          (u.id && u.id === slide.id) ||
          (u.backendId && u.backendId === slide.backendId)
        );

        if (!update) return slide;

        // Apply update, preserving existing values if not provided
        return {
          ...slide,
          title: update.title ?? slide.title,
          subtitle: update.subtitle ?? slide.subtitle,
          content: update.content ?? slide.content,
          keyPoints: update.keyPoints ?? update.key_points ?? slide.keyPoints,
          isContentLoaded: true,
          isUpdating: false,
          updateMessage: undefined,
          lastUpdatedAt: Date.now(),
        };
      });

      return {
        ...prev,
        slides: updatedSlides,
        updatingSlideIndices: [],
        currentAction: undefined,
        loadingMessage: undefined,
      };
    });

    // Also update outlineFlow
    setOutlineFlow((prev) => {
      if (!prev?.slides) return prev;

      const updatedFlowSlides = prev.slides.map((slide, index) => {
        const update = updates.find(u =>
          (u.index !== undefined && u.index === index)
        );

        if (!update) return slide;

        return {
          ...slide,
          title: update.title ?? slide.title,
          subtitle: update.subtitle ?? slide.subtitle,
          content: update.content ?? slide.content,
          key_points: update.keyPoints ?? update.key_points ?? slide.key_points,
        };
      });

      return { ...prev, slides: updatedFlowSlides };
    });
  }, []);

  /**
   * Set specific slides as updating (shows loading state on those slides only)
   */
  const setSlideUpdating = useCallback((
    indices: number[],
    isUpdating: boolean,
    message?: string
  ) => {
    setOutlineBlock((prev) => {
      if (!prev) return prev;

      const updatedSlides = prev.slides.map((slide, index) => {
        if (!indices.includes(index)) return slide;
        return {
          ...slide,
          isUpdating,
          updateMessage: isUpdating ? message : undefined,
        };
      });

      return {
        ...prev,
        slides: updatedSlides,
        updatingSlideIndices: isUpdating ? indices : [],
      };
    });
  }, []);

  /**
   * Set the current outline action (for UI feedback)
   */
  const setOutlineAction = useCallback((
    action: OutlineUpdateAction | null,
    loadingMessage?: string,
    slideIndices?: number[]
  ) => {
    currentActionRef.current = action;

    setOutlineBlock((prev) => {
      if (!prev) return prev;

      // If action is theme-only, don't touch slide loading states
      if (action === 'update_theme') {
        return {
          ...prev,
          isThemeUpdating: true,
          currentAction: action,
          loadingMessage,
          // Keep slides interactive
          isLoading: false,
        };
      }

      // If action is null, clear all loading states
      if (!action) {
        return {
          ...prev,
          isLoading: false,
          isThemeUpdating: false,
          updatingSlideIndices: [],
          currentAction: undefined,
          loadingMessage: undefined,
          slides: prev.slides.map(slide => ({
            ...slide,
            isUpdating: false,
            updateMessage: undefined,
          })),
        };
      }

      // For slide-specific actions, only mark those slides as updating
      if (action === 'update_slides' && slideIndices?.length) {
        return {
          ...prev,
          currentAction: action,
          loadingMessage,
          updatingSlideIndices: slideIndices,
          isLoading: false, // Keep other slides interactive
          slides: prev.slides.map((slide, index) => ({
            ...slide,
            isUpdating: slideIndices.includes(index),
            updateMessage: slideIndices.includes(index) ? loadingMessage : undefined,
          })),
        };
      }

      // For full outline actions, set global loading
      return {
        ...prev,
        isLoading: action === 'generate_outline' || action === 'update_outline',
        currentAction: action,
        loadingMessage,
      };
    });
  }, []);

  /**
   * Clear all loading states (call after any action completes)
   */
  const clearLoadingStates = useCallback(() => {
    currentActionRef.current = null;
    setOutlineBlock((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        isLoading: false,
        isThemeUpdating: false,
        updatingSlideIndices: [],
        currentAction: undefined,
        loadingMessage: undefined,
        slides: prev.slides.map(slide => ({
          ...slide,
          isUpdating: false,
          updateMessage: undefined,
        })),
      };
    });
  }, []);

  return {
    outlineFlow,
    outlineBlock,
    setOutlineFlow,
    setOutlineBlock,
    initializeOutline,
    mergeOutline,
    handleSlideEdit,
    handleSlideAdd,
    handleSlideDelete,
    handleSlideReorder,
    // New granular update methods
    updateSpecificSlides,
    setSlideUpdating,
    setOutlineAction,
    clearLoadingStates,
    currentActionRef,
  };
};
