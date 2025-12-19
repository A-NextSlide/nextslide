import { useCallback, useState } from 'react';
import type { OutlineData } from '@/services/outlineAgentService';
import type { OutlinePreviewData, OutlineSlidePreview } from '@/types/chatBlocks';
import type { OutlineFlowState } from '../types';
import { buildOutlinePreview, createOutlineSlideId } from '../utils/outline';

export const useOutlineState = () => {
  const [outlineFlow, setOutlineFlow] = useState<OutlineFlowState | null>(null);
  const [outlineBlock, setOutlineBlock] = useState<OutlinePreviewData | null>(null);

  const initializeOutline = useCallback((outlineData: OutlineData) => {
    setOutlineFlow(outlineData);
    const preview = buildOutlinePreview(outlineData);
    setOutlineBlock(preview);
    return preview;
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
    handleSlideEdit,
    handleSlideAdd,
    handleSlideDelete,
    handleSlideReorder,
  };
};
