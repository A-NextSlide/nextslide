import React, { createContext, useCallback, useContext, useEffect, ReactNode, useMemo, useRef } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '../types/components';
import { useEditorState } from './EditorStateContext';
import { useDeckStore } from '../stores/deckStore';
import { useEditorStore } from '../stores/editorStore';
import { useNavigation } from './NavigationContext';
import { useEditModeTransitionStore } from '@/stores/editModeTransitionStore';
import { FontLoadingService } from '@/services/FontLoadingService';

type ActiveSlideContextType = {
  // Currently active slide data (either from draft or main store)
  activeSlide: SlideData | null;
  
  // Slide ID of the active slide
  slideId: string | null;
  
  // Active components to render (from draft store when editing, otherwise from deck store)
  activeComponents: ComponentInstance[];
  
  // Update a component in the active slide
  updateComponent: (componentId: string, updates: Partial<ComponentInstance>, skipHistory?: boolean) => void;
  
  // Add a component to the active slide
  addComponent: (component: ComponentInstance, skipHistory?: boolean) => void;
  
  // Remove a component from the active slide
  removeComponent: (componentId: string, skipHistory?: boolean) => void;
};

export const ActiveSlideContext = createContext<ActiveSlideContextType | null>(null);

export const ActiveSlideProvider = ({ children }: { children: ReactNode }) => {
  // Get current slide index from navigation
  const { currentSlideIndex } = useNavigation();
  
  // Get editing state from editor context
  const { isEditing } = useEditorState();
  
  // Get transition state from store
  const isInTransition = useEditModeTransitionStore(state => state.isInTransition);
  
  // Get deck data from deck store
  const slides = useDeckStore(state => state.deckData.slides);
  const updateSlide = useDeckStore(state => state.updateSlide);
  
  // Get editor store actions and state for history tracking
  const getDraftComponents = useEditorStore(state => state.getDraftComponents);
  const updateDraftComponent = useEditorStore(state => state.updateDraftComponent);
  const addDraftComponent = useEditorStore(state => state.addDraftComponent);
  const removeDraftComponent = useEditorStore(state => state.removeDraftComponent);
  const draftComponentsVersion = useEditorStore(state => state.draftComponentsVersion); // Track draft modifications
  const setActiveSlideId = useEditorStore(state => state.setActiveSlideId);

  // PERF: Removed historyIndex subscription. Previously needed to detect undo/redo
  // changes (since setDraftComponentsForSlide didn't increment draftComponentsVersion).
  // Now setDraftComponentsForSlide also increments draftComponentsVersion, so the
  // cross-store dependency is eliminated. This avoids potential batching issues between
  // the historyStore and editorStore.

  // Get current slide from deck store
  const currentSlide = slides[currentSlideIndex] || null;

  // Track the current slide ID
  const currentSlideId = currentSlide?.id;

  useEffect(() => {
    setActiveSlideId(currentSlideId || null);
  }, [currentSlideId, setActiveSlideId]);

  // Refs for stable callback references — avoids recreating callbacks on every render
  const currentSlideRef = useRef(currentSlide);
  currentSlideRef.current = currentSlide;
  const isEditingRef = useRef(isEditing);
  isEditingRef.current = isEditing;

  // Ref to preserve components during edit-mode transitions
  const lastTransitionComponentsRef = useRef<ComponentInstance[]>([]);

  // Compute active components synchronously (not via useEffect) to prevent
  // a one-frame flash when CSS drag variables are cleared before position updates propagate.
  const activeComponents = useMemo(() => {
    if (!currentSlide) return [];

    // During transitions, preserve the last known components to prevent flicker
    if (isInTransition) {
      return lastTransitionComponentsRef.current;
    }

    let result: ComponentInstance[];
    if (isEditing) {
      result = getDraftComponents(currentSlide.id);
    } else {
      result = currentSlide.components || [];
    }

    lastTransitionComponentsRef.current = result;
    return result;
  // PERF: Removed `lastOperation` and `historyIndex` from deps.
  // - `lastOperation`: not used in the computation, but every selectComponent() /
  //   updateDraftComponent() call changed it, causing unnecessary recomputation.
  // - `historyIndex`: no longer needed because setDraftComponentsForSlide now
  //   increments draftComponentsVersion, eliminating the cross-store dependency.
  // `draftComponentsVersion` alone is sufficient to detect all draft changes
  // (edits, undo/redo, add, remove).
  }, [currentSlide, isEditing, getDraftComponents, draftComponentsVersion, isInTransition]);
  
  // Update a component in the active slide (stable reference via useCallback + refs)
  const updateComponent = useCallback((componentId: string, updates: Partial<ComponentInstance>, skipHistory?: boolean) => {
    const slide = currentSlideRef.current;
    if (!slide) return;

    const props = updates.props || {};
    const fontCandidates = new Set<string>();
    const enqueueFont = (value: unknown) => {
      if (typeof value === 'string' && value.trim()) {
        fontCandidates.add(value);
      }
    };
    enqueueFont((props as any).fontFamily);
    enqueueFont((props as any).bodyFont);
    enqueueFont((props as any).headingFont);
    enqueueFont((props as any).tableStyles?.fontFamily);
    if (props && typeof (props as any).props === 'object') {
      enqueueFont((props as any).props.fontFamily);
      enqueueFont((props as any).props.bodyFont);
      enqueueFont((props as any).props.headingFont);
    }
    if (fontCandidates.size) {
      fontCandidates.forEach((font) => {
        FontLoadingService.loadFont(font).catch(() => {});
      });
    }

    if (isEditingRef.current) {
      updateDraftComponent(slide.id, componentId, updates, skipHistory);
      const deckState = useDeckStore.getState();
      if (deckState.yjsSyncEnabled && deckState.yjsDocManager && updates.props) {
        deckState.yjsDocManager.updateComponent(slide.id, componentId, updates.props);
      }
    } else {
      if (!slide.components) return;
      const updatedComponents = slide.components.map(comp =>
        comp.id === componentId
          ? { ...comp, ...updates, props: { ...comp.props, ...(updates.props || {}) } }
          : comp
      );
      updateSlide(slide.id, { components: updatedComponents });
    }
  }, [updateDraftComponent, updateSlide]);

  // Add a component to the active slide (stable reference)
  const addComponent = useCallback((component: ComponentInstance, skipHistory?: boolean) => {
    const slide = currentSlideRef.current;
    if (!slide) return;

    const currentComps = isEditingRef.current
      ? getDraftComponents(slide.id)
      : slide.components || [];

    const updatedComponent = {
      ...component,
      props: {
        ...component.props,
        existingComponents: component.props.existingComponents || currentComps
      }
    };

    if (isEditingRef.current) {
      addDraftComponent(slide.id, updatedComponent, skipHistory);
      const deckState = useDeckStore.getState();
      if (deckState.yjsSyncEnabled && deckState.yjsDocManager) {
        deckState.yjsDocManager.addComponent(slide.id, updatedComponent);
      }
    } else {
      const currentComponents = slide.components || [];
      updateSlide(slide.id, {
        components: [...currentComponents, updatedComponent]
      });
    }
  }, [getDraftComponents, addDraftComponent, updateSlide]);

  // Remove a component from the active slide (stable reference)
  const removeComponent = useCallback((componentId: string, skipHistory?: boolean) => {
    const slide = currentSlideRef.current;
    if (!slide) return;

    const allComponents = isEditingRef.current ? getDraftComponents(slide.id) : (slide.components || []);
    const target = allComponents.find(c => c.id === componentId);
    const isBackgroundComponent =
      target && (target.type === 'Background' || (target.id && target.id.toLowerCase().includes('background')));
    if (isBackgroundComponent) return;

    if (isEditingRef.current) {
      removeDraftComponent(slide.id, componentId, skipHistory);
      const deckState = useDeckStore.getState();
      if (deckState.yjsSyncEnabled && deckState.yjsDocManager) {
        deckState.yjsDocManager.removeComponent(slide.id, componentId);
      }
    } else {
      if (!slide.components) return;
      const filteredComponents = slide.components.filter(comp => comp.id !== componentId);
      updateSlide(slide.id, { components: filteredComponents });
    }
  }, [getDraftComponents, removeDraftComponent, updateSlide]);

  // Memoize context value to prevent unnecessary consumer re-renders.
  // With stable callback refs, this only changes when activeComponents or currentSlide changes.
  const value = useMemo(() => ({
    activeSlide: currentSlide,
    slideId: currentSlide?.id || null,
    activeComponents,
    updateComponent,
    addComponent,
    removeComponent
  }), [currentSlide, activeComponents, updateComponent, addComponent, removeComponent]);

  return (
    <ActiveSlideContext.Provider value={value}>
      {children}
    </ActiveSlideContext.Provider>
  );
};

export const StaticActiveSlideProvider = ({
  slide,
  children
}: {
  slide: SlideData | null;
  children: ReactNode;
}) => {
  const activeComponents = useMemo(() => {
    return Array.isArray(slide?.components) ? slide!.components : [];
  }, [slide]);

  const value = useMemo<ActiveSlideContextType>(() => ({
    activeSlide: slide ?? null,
    slideId: slide?.id ?? null,
    activeComponents,
    updateComponent: () => {},
    addComponent: () => {},
    removeComponent: () => {}
  }), [slide, activeComponents]);

  return (
    <ActiveSlideContext.Provider value={value}>
      {children}
    </ActiveSlideContext.Provider>
  );
};

// Custom hook to use the active slide context
export const useActiveSlide = () => {
  const context = useContext(ActiveSlideContext);

  if (!context) {
    throw new Error('useActiveSlide must be used within an ActiveSlideProvider');
  }

  return context;
}

// Safe version that returns null values if no provider is present
export const useActiveSlideSafe = () => {
  const context = useContext(ActiveSlideContext);

  if (!context) {
    return {
      activeSlide: null,
      slideId: null,
      activeComponents: [],
      updateComponent: () => {},
      addComponent: () => {},
      removeComponent: () => {}
    };
  }

  return context;
}
