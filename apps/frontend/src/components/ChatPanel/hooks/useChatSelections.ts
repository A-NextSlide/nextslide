import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { getOverlappingComponentIds, getComponentBounds } from '@/utils/overlapDetection';
import { useDeckStore } from '@/stores/deckStore';
import { useEditor } from '@/hooks/useEditor';
import { useNavigation } from '@/context/NavigationContext';
import type { SelectedElement } from '../types';

interface UseChatSelectionsReturn {
  selectedElements: SelectedElement[];
  setSelectedElements: Dispatch<SetStateAction<SelectedElement[]>>;
  isSelecting: boolean;
  setIsSelecting: Dispatch<SetStateAction<boolean>>;
  removeSelection: (elementId: string) => void;
  clearSelections: () => void;
}

export function useChatSelections(): UseChatSelectionsReturn {
  const [selectedElements, setSelectedElements] = useState<SelectedElement[]>([]);
  const [isSelecting, setIsSelecting] = useState(false);
  const [hoveredElementId, setHoveredElementId] = useState<string | null>(null);
  const { isEditing: isSlideEditing } = useEditor();
  const { currentSlideIndex } = useNavigation();
  const slides = useDeckStore(state => state.deckData.slides);
  const currentSlideId = slides?.[currentSlideIndex]?.id || null;
  const lastSlideIdRef = useRef<string | null>(currentSlideId);

  const removeSelection = useCallback((elementId: string) => {
    setSelectedElements(prev => prev.filter(s => s.elementId !== elementId));
    const el = document.querySelector(`[data-component-id="${elementId}"]`) as HTMLElement | null;
    if (el) {
      el.removeAttribute('data-agent-selected');
      if (el.getAttribute('data-agent-hover') !== 'true') {
        el.style.outline = '';
        el.style.outlineOffset = '';
        el.style.boxShadow = '';
      } else {
        el.style.outline = '2px dashed #22c55e';
        el.style.outlineOffset = '2px';
        el.style.boxShadow = 'inset 0 0 0 2px rgba(34,197,94,0.35)';
      }
    }
  }, []);

  const clearSelections = useCallback(() => {
    setSelectedElements(prev => {
      prev.forEach(s => {
        const el = document.querySelector(`[data-component-id="${s.elementId}"]`) as HTMLElement | null;
        if (el) {
          el.removeAttribute('data-agent-selected');
          el.style.outline = '';
          el.style.outlineOffset = '';
          el.style.boxShadow = '';
        }
      });
      return [];
    });
    setHoveredElementId(null);
  }, []);

  useEffect(() => {
    const root = document;
    if (!isSelecting) {
      document.body.classList.remove('agent-select-mode');
      if (hoveredElementId) {
        const prev = (document.querySelector(`.component-wrapper[data-component-id="${hoveredElementId}"]`) || document.querySelector(`[data-component-id="${hoveredElementId}"]`)) as HTMLElement | null;
        if (prev) prev.removeAttribute('data-agent-hover');
        setHoveredElementId(null);
      }
      return;
    }

    document.body.classList.add('agent-select-mode');

    const getRootForId = (id: string): HTMLElement | null => {
      return (
        document.querySelector(`.component-wrapper[data-component-id="${id}"]`) as HTMLElement | null ||
        document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null
      );
    };

    const applyHoverStyles = (node: HTMLElement | null) => {
      if (!node) return;
      if (node.getAttribute('data-agent-selected') === 'true') return;
      node.setAttribute('data-agent-hover', 'true');
      node.style.outline = '2px dashed #22c55e';
      node.style.outlineOffset = '2px';
      node.style.boxShadow = 'inset 0 0 0 2px rgba(34,197,94,0.35)';
      node.style.position = node.style.position || 'relative';
      node.style.zIndex = String(Math.max(1000, Number(node.style.zIndex) || 0));
    };

    const clearHoverStyles = (node: HTMLElement | null) => {
      if (!node) return;
      node.removeAttribute('data-agent-hover');
      if (node.getAttribute('data-agent-selected') === 'true') {
        node.style.outline = '2px solid #22c55e';
        node.style.outlineOffset = '2px';
        node.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
      } else {
        node.style.outline = '';
        node.style.outlineOffset = '';
        node.style.boxShadow = '';
      }
    };

    const applySelectedStyles = (node: HTMLElement | null) => {
      if (!node) return;
      node.setAttribute('data-agent-selected', 'true');
      node.style.outline = '2px solid #22c55e';
      node.style.outlineOffset = '2px';
      node.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.25)';
      node.style.position = node.style.position || 'relative';
      node.style.zIndex = String(Math.max(1000, Number(node.style.zIndex) || 0));
    };

    const handleMouseMove = (e: MouseEvent) => {
      const elAtPoint = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement | null;
      const el = elAtPoint?.closest?.('[data-component-id]') as HTMLElement | null;
      const currentId = el?.getAttribute('data-component-id') || null;
      if (currentId === hoveredElementId) return;
      if (hoveredElementId) {
        const prev = getRootForId(hoveredElementId);
        clearHoverStyles(prev);
      }
      if (el && currentId) {
        const rootEl = getRootForId(currentId);
        const isSelected = selectedElements.some(s => s.elementId === currentId);
        if (!isSelected) applyHoverStyles(rootEl);
        setHoveredElementId(currentId);
      } else {
        setHoveredElementId(null);
      }
    };

    const handleClickCapture = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const el = target?.closest?.('[data-component-id]') as HTMLElement | null;
      if (!el) return;
      const elementId = el.getAttribute('data-component-id') || '';
      const elementType = el.getAttribute('data-component-type');
      const slideContainer = el.closest('[data-slide-id]') as HTMLElement | null;
      const slideId = slideContainer?.getAttribute('data-slide-id') || null;

      const bounds = getComponentBounds(elementId);
      let overlaps: string[] = [];
      try {
        const deck = useDeckStore.getState().deckData;
        const slide = deck?.slides?.find((s: any) => s.id === slideId);
        const comps = Array.isArray(slide?.components) ? slide.components : [];
        overlaps = getOverlappingComponentIds(elementId, comps);
      } catch { }

      const rootEl = getRootForId(elementId);
      applySelectedStyles(rootEl);

      setSelectedElements(prev => {
        if (prev.some(s => s.elementId === elementId)) return prev;
        let chipLabel = '';
        try {
          const deckData = (useDeckStore as any).getState().deckData;
          const slidesArr = Array.isArray(deckData?.slides) ? deckData.slides : [];
          const slideIndex = slideId ? slidesArr.findIndex((s: any) => s?.id === slideId) : -1;
          const slideNumber = slideIndex >= 0 ? slideIndex + 1 : null;
          const slideTitle = slideIndex >= 0 && typeof slidesArr[slideIndex]?.title === 'string' ? slidesArr[slideIndex].title.trim() : '';
          const hasTitle = Boolean(slideTitle);
          const typeMap: Record<string, string> = {
            TiptapTextBlock: 'Text',
            TextBlock: 'Text',
            Shape: 'Shape',
            ShapeWithText: 'Shape',
            Image: 'Image',
            Logo: 'Logo',
            Icon: 'Icon',
            Chart: 'Chart',
            Table: 'Table',
            Video: 'Video',
            Slide: 'Slide',
          };
          const typeName = typeMap[String(elementType || '')] || String(elementType || 'Element');
          if (typeName === 'Slide' && slideNumber) {
            chipLabel = hasTitle ? `Slide ${slideNumber} — ${slideTitle}` : `Slide ${slideNumber}`;
          } else if (slideNumber) {
            chipLabel = hasTitle ? `${typeName} on Slide ${slideNumber} — ${slideTitle}` : `${typeName} on Slide ${slideNumber}`;
          } else {
            chipLabel = typeName;
          }
        } catch {
          chipLabel = `${elementType || 'Element'}`;
        }
        return [...prev, { elementId, elementType, slideId, label: chipLabel, overlaps, bounds }];
      });
    };

    const handleMouseOver = (e: MouseEvent) => handleMouseMove(e);

    const handleMouseOut = (e: MouseEvent) => {
      const related = (e as MouseEvent).relatedTarget as HTMLElement | null;
      const stillInsideComponent = related?.closest?.('[data-component-id]');
      if (!stillInsideComponent && hoveredElementId) {
        const prev = document.querySelector(`[data-component-id="${hoveredElementId}"]`) as HTMLElement | null;
        clearHoverStyles(prev);
        setHoveredElementId(null);
      }
    };

    root.addEventListener('mousemove', handleMouseMove, true);
    root.addEventListener('mouseover', handleMouseOver, true);
    root.addEventListener('mouseout', handleMouseOut, true);
    root.addEventListener('mouseleave', handleMouseOut, true);
    root.addEventListener('click', handleClickCapture, true);
    return () => {
      root.removeEventListener('mousemove', handleMouseMove, true);
      root.removeEventListener('mouseover', handleMouseOver, true);
      root.removeEventListener('mouseout', handleMouseOut, true);
      root.removeEventListener('mouseleave', handleMouseOut, true);
      root.removeEventListener('click', handleClickCapture, true);
      document.body.classList.remove('agent-select-mode');
    };
  }, [isSelecting, hoveredElementId]);

  useEffect(() => {
    if (!isSelecting || selectedElements.length === 0) return;

    const getRootEl = (id: string): HTMLElement | null => {
      return (
        document.querySelector(`.component-wrapper[data-component-id="${id}"]`) as HTMLElement | null ||
        document.querySelector(`[data-component-id="${id}"]`) as HTMLElement | null
      );
    };

    const reapplySelections = () => {
      selectedElements.forEach(sel => {
        const el = getRootEl(sel.elementId);
        if (!el) return;
        if (el.getAttribute('data-agent-selected') !== 'true') {
          el.setAttribute('data-agent-selected', 'true');
        }
        if (!el.style.position) {
          el.style.position = 'relative';
        }
        const currentZ = Number(el.style.zIndex) || 0;
        if (currentZ < 1000) {
          el.style.zIndex = String(1000);
        }
      });
    };

    reapplySelections();

    const containers = Array.from(document.querySelectorAll('.slide-container'));
    const observers: MutationObserver[] = [];
    containers.forEach(container => {
      const observer = new MutationObserver((mutations) => {
        if (mutations && mutations.length > 0) {
          requestAnimationFrame(reapplySelections);
        }
      });
      observer.observe(container, { childList: true, subtree: true });
      observers.push(observer);
    });

    return () => {
      observers.forEach(o => o.disconnect());
    };
  }, [isSelecting, selectedElements]);

  useEffect(() => {
    if (isSlideEditing && isSelecting) {
      setIsSelecting(false);
      clearSelections();
    }
  }, [isSlideEditing]);

  useEffect(() => {
    const prev = lastSlideIdRef.current;
    if (prev && currentSlideId && prev !== currentSlideId) {
      console.log('[ChatSelections] Slide changed, clearing selections:', {
        from: prev,
        to: currentSlideId,
        hadSelections: selectedElements.length > 0,
        wasSelecting: isSelecting
      });
      if (isSelecting) {
        setIsSelecting(false);
      }
      if (selectedElements.length > 0) {
        clearSelections();
      }
    }
    lastSlideIdRef.current = currentSlideId;
  }, [currentSlideId, isSelecting, selectedElements.length, clearSelections]);

  useEffect(() => {
    try {
      window.dispatchEvent(new CustomEvent('chat:selection-mode-changed', { detail: { selecting: isSelecting } }));
    } catch { }
  }, [isSelecting]);

  return {
    selectedElements,
    setSelectedElements,
    isSelecting,
    setIsSelecting,
    removeSelection,
    clearSelections,
  };
}
