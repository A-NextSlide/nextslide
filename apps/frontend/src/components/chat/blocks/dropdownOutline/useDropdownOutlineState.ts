import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DragEvent, MouseEvent } from 'react';
import type { OutlineEditField, OutlineSlide, SlideContentResponse } from './types';

interface UseDropdownOutlineStateOptions {
  slides: OutlineSlide[];
  onSlideEdit?: (slideId: string, updates: Partial<OutlineSlide>) => void;
  onSlideReorder?: (fromIndex: number, toIndex: number) => void;
  onLoadContent?: (slideId: string, slideIndex: number) => Promise<SlideContentResponse>;
}

export function useDropdownOutlineState(options: UseDropdownOutlineStateOptions) {
  const { slides, onSlideEdit, onSlideReorder, onLoadContent } = options;
  const [expandedSlides, setExpandedSlides] = useState<Set<string>>(new Set());
  const [loadingSlides, setLoadingSlides] = useState<Set<string>>(new Set());
  const [editingField, setEditingField] = useState<OutlineEditField | null>(null);
  const [editValue, setEditValue] = useState('');
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const slideById = useMemo(() => {
    return new Map(slides.map(slide => [slide.id, slide]));
  }, [slides]);

  const startEditing = useCallback((
    e: MouseEvent,
    slideId: string,
    field: OutlineEditField['field'],
    value: string,
    keyPointIndex?: number
  ) => {
    e.stopPropagation();
    setEditingField({ slideId, field, keyPointIndex });
    setEditValue(value);
  }, []);

  const resetEditing = useCallback(() => {
    setEditingField(null);
    setEditValue('');
  }, []);

  useEffect(() => {
    setExpandedSlides(prev => {
      const next = new Set([...prev].filter(id => slideById.has(id)));
      return next.size === prev.size ? prev : next;
    });
    setLoadingSlides(prev => {
      const next = new Set([...prev].filter(id => slideById.has(id)));
      return next.size === prev.size ? prev : next;
    });
    if (editingField && !slideById.has(editingField.slideId)) {
      resetEditing();
    }
  }, [editingField, resetEditing, slideById]);

  const saveEdit = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    if (!editingField) return;

    const { slideId, field, keyPointIndex } = editingField;
    const slide = slideById.get(slideId);
    if (!slide) return;

    if (field === 'title') {
      onSlideEdit?.(slideId, { title: editValue });
    } else if (field === 'keyPoint' && typeof keyPointIndex === 'number') {
      const newKeyPoints = [...(slide.keyPoints || [])];
      newKeyPoints[keyPointIndex] = editValue;
      onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
    } else if (field === 'content') {
      onSlideEdit?.(slideId, { content: editValue, isContentLoaded: true, isContentEdited: true });
    }

    resetEditing();
  }, [editingField, editValue, onSlideEdit, resetEditing, slideById]);

  const cancelEdit = useCallback((e?: MouseEvent) => {
    e?.stopPropagation();
    resetEditing();
  }, [resetEditing]);

  const requestContentLoad = useCallback((slideId: string, slideIndex: number) => {
    if (!onLoadContent) return;
    const slide = slideById.get(slideId);
    if (!slide || slide.isContentLoaded) return;

    let shouldLoad = false;
    setLoadingSlides(prev => {
      if (prev.has(slideId)) return prev;
      shouldLoad = true;
      const next = new Set(prev);
      next.add(slideId);
      return next;
    });

    if (!shouldLoad) return;

    (async () => {
      try {
        const contentData = await onLoadContent(slideId, slideIndex);
        const updates: Partial<OutlineSlide> = {
          content: contentData.content ?? '',
          isContentLoaded: true,
          isContentEdited: slide.isContentEdited ?? false,
        };
        if (contentData.keyPoints) {
          updates.keyPoints = contentData.keyPoints;
        }
        onSlideEdit?.(slideId, updates);
      } catch (error) {
        console.error('Failed to load content for slide:', slideId, error);
      } finally {
        setLoadingSlides(prev => {
          const next = new Set(prev);
          next.delete(slideId);
          return next;
        });
      }
    })();
  }, [onLoadContent, onSlideEdit, slideById]);

  const toggleSlide = useCallback((
    slideId: string,
    slideIndex: number,
    isExpanded: boolean
  ) => {
    if (isExpanded) {
      setExpandedSlides(prev => {
        const next = new Set(prev);
        next.delete(slideId);
        return next;
      });
      return;
    }

    setExpandedSlides(prev => {
      const next = new Set(prev);
      next.add(slideId);
      return next;
    });
    requestContentLoad(slideId, slideIndex);
  }, [requestContentLoad]);

  const handleAddKeyPoint = useCallback((e: MouseEvent, slideId: string) => {
    e.stopPropagation();
    e.preventDefault();
    const slide = slideById.get(slideId);
    if (!slide) return;

    const newKeyPoints = [...(slide.keyPoints || []), 'New point'];
    onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
  }, [onSlideEdit, slideById]);

  const handleRemoveKeyPoint = useCallback((
    e: MouseEvent,
    slideId: string,
    index: number
  ) => {
    e.stopPropagation();
    e.preventDefault();
    const slide = slideById.get(slideId);
    if (!slide) return;

    const newKeyPoints = (slide.keyPoints || []).filter((_, i) => i !== index);
    onSlideEdit?.(slideId, { keyPoints: newKeyPoints });
  }, [onSlideEdit, slideById]);

  const handleDragStart = useCallback((e: DragEvent, index: number) => {
    const target = e.target as HTMLElement | null;

    // Prevent dragging from form elements or buttons
    if (
      target?.tagName === 'INPUT' ||
      target?.tagName === 'TEXTAREA' ||
      target?.isContentEditable ||
      target?.closest('button')
    ) {
      e.preventDefault();
      return;
    }

    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', index.toString());
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDragOver = useCallback((e: DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedIndex !== null && draggedIndex !== index) {
      setDragOverIndex(index);
    }
  }, [draggedIndex]);

  const handleDragLeave = useCallback(() => {
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: DragEvent, toIndex: number) => {
    e.preventDefault();
    if (draggedIndex !== null && draggedIndex !== toIndex && onSlideReorder) {
      onSlideReorder(draggedIndex, toIndex);
    }
    setDraggedIndex(null);
    setDragOverIndex(null);
  }, [draggedIndex, onSlideReorder]);

  return {
    state: {
      expandedSlides,
      loadingSlides,
      editingField,
      editValue,
      draggedIndex,
      dragOverIndex,
    },
    handlers: {
      setEditValue,
      startEditing,
      saveEdit,
      cancelEdit,
      toggleSlide,
      handleAddKeyPoint,
      handleRemoveKeyPoint,
      handleDragStart,
      handleDragEnd,
      handleDragOver,
      handleDragLeave,
      handleDrop,
    },
  };
}
