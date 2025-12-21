import { useCallback, useState } from 'react';
import type { OutlineData } from '@/services/outlineAgentService';
import type { OutlinePreviewData, OutlineSlidePreview } from '@/types/chatBlocks';
import type { OutlineFlowState } from '../types';
import {
  buildOutlinePreview,
  createOutlineSlideId,
  extractOutlineSlides,
  hasSlideTitleOverlap,
  mergeOutlinePreview,
} from '../utils/outline';

export const useOutlineState = () => {
  const [outlineFlow, setOutlineFlow] = useState<OutlineFlowState | null>(null);
  const [outlineBlock, setOutlineBlock] = useState<OutlinePreviewData | null>(null);

  const initializeOutline = useCallback((outlineData: OutlineData) => {
    const preview = buildOutlinePreview(outlineData);
    const sourceSlides = extractOutlineSlides(outlineData);
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
      setOutlineFlow({ ...outlineData, slides: normalizedSlides });
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
      setOutlineFlow(fallbackSlides ? { ...outlineData, slides: fallbackSlides } : outlineData);
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

      return {
        ...prev,
        ...outlineData,
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
  };
};
