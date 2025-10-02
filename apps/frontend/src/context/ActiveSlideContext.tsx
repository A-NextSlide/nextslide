import React, { createContext, useState, useContext, useEffect, ReactNode, useMemo, useRef, useCallback } from 'react';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '../types/components';
import { useEditorState } from './EditorStateContext';
import { useDeckStore } from '../stores/deckStore';
import { useEditorStore } from '../stores/editorStore';
import { useHistoryStore } from '../stores/historyStore';
import { useNavigation } from './NavigationContext';
import { useEditModeTransitionStore } from '@/stores/editModeTransitionStore';

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
  const lastOperation = useEditorStore(state => state.lastOperation); // Track undo/redo operations
  
  // Get history index from history store
  const historyIndex = useHistoryStore(state => state.historyIndex); // Track history changes
  
  // Local state to track components and force re-renders
  const [componentVersion, setComponentVersion] = useState(0);
  
  // Get current slide from deck store
  const currentSlide = slides[currentSlideIndex] || null;
  
  // Track the current slide ID
  const currentSlideId = currentSlide?.id;
  
  // Keep a local copy of active components
  const [activeComponents, setActiveComponents] = useState<ComponentInstance[]>([]);
  
  // PERFORMANCE: Batch component updates with RAF
  const pendingUpdateRef = useRef<boolean>(false);
  const forceComponentUpdate = useCallback(() => {
    if (!pendingUpdateRef.current) {
      pendingUpdateRef.current = true;
      requestAnimationFrame(() => {
        setComponentVersion(prev => prev + 1);
        pendingUpdateRef.current = false;
      });
    }
  }, []);
  
  // Track previous slide ID to detect actual slide changes
  const previousSlideIdRef = useRef<string | null>(null);
  const updateTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  
  // Fetch components when needed dependencies change
  useEffect(() => {
    if (!currentSlide) {
      setActiveComponents([]);
      return;
    }
    
    // PERFORMANCE: Skip during transitions
    if (isInTransition) {
      return;
    }
    
    // Check if we're actually changing slides
    const isSlideChange = previousSlideIdRef.current !== currentSlide.id;
    if (isSlideChange) {
      previousSlideIdRef.current = currentSlide.id;
    }
    
    // For non-editing mode, only update if the slide actually changed
    // This prevents double updates during navigation
    if (!isEditing && !isSlideChange && componentVersion === 0 && !lastOperation) {
      return;
    }
    
    // Clear any pending update
    if (updateTimeoutRef.current) {
      clearTimeout(updateTimeoutRef.current);
    }
    
    // PERFORMANCE: Use microtask instead of timeout for immediate updates
    const updateComponents = () => {
      if (isEditing) {
        // Get draft components
        const drafts = getDraftComponents(currentSlide.id);
        setActiveComponents(drafts);
      } else {
        const components = currentSlide.components || [];
        setActiveComponents(components);
      }
    };
    
    if (isSlideChange) {
      // Use timeout for slide changes to allow UI to update
      updateTimeoutRef.current = setTimeout(updateComponents, 50);
    } else {
      // Use microtask for other updates
      queueMicrotask(updateComponents);
    }
    
    return () => {
      if (updateTimeoutRef.current) {
        clearTimeout(updateTimeoutRef.current);
      }
    };
  }, [currentSlide, isEditing, getDraftComponents, componentVersion, historyIndex, lastOperation, isInTransition]);
  
  // Force update on history operations
  useEffect(() => {
    if (lastOperation && (lastOperation.startsWith('undo-') || lastOperation.startsWith('redo-'))) {
      forceComponentUpdate();
    }
  }, [lastOperation, forceComponentUpdate, currentSlideId, isEditing]);
  
  // Update a component in the active slide
  const updateComponent = (componentId: string, updates: Partial<ComponentInstance>, skipHistory?: boolean) => {
    if (!currentSlide) return;
    
    if (isEditing) {
      // When editing, update the draft component
      updateDraftComponent(currentSlide.id, componentId, updates, skipHistory);
      // Force a lightweight re-render via RAF so live controls (color sliders) reflect immediately
      // This is already batched by pendingUpdateRef to avoid spamming
      forceComponentUpdate();
    } else {
      // When not editing, update the slide directly
      // This should be rare/unused but included for completeness
      if (!currentSlide.components) return;
      
      const updatedComponents = currentSlide.components.map(comp => 
        comp.id === componentId 
          ? { ...comp, ...updates, props: { ...comp.props, ...(updates.props || {}) } } 
          : comp
      );
      
      updateSlide(currentSlide.id, { components: updatedComponents });
    }
  };
  
  // Add a component to the active slide
  const addComponent = (component: ComponentInstance, skipHistory?: boolean) => {
    if (!currentSlide) return;
    
    // Get the current components to calculate z-index
    const currentComps = isEditing 
      ? getDraftComponents(currentSlide.id)
      : currentSlide.components || [];
    
    // Create a new component with properly calculated z-index
    // If component already has props.existingComponents, we'll respect them
    // Otherwise we'll add the current slide's components
    const updatedComponent = { 
      ...component,
      props: {
        ...component.props,
        // Add existing components for z-index calculation if not already present
        // This property will be removed during component creation
        existingComponents: component.props.existingComponents || currentComps
      }
    };
    
    // The createComponent function in componentUtils will handle z-index calculation
    // using the existingComponents property we just added
    
    if (isEditing) {
      // When editing, add to the draft store (pass skipHistory param)
      addDraftComponent(currentSlide.id, updatedComponent, skipHistory);
      // Force a re-render
      forceComponentUpdate();
    } else {
      // When not editing, add to the slide directly
      // This should be rare/unused but included for completeness
      const currentComponents = currentSlide.components || [];
      updateSlide(currentSlide.id, { 
        components: [...currentComponents, updatedComponent] 
      });
    }
  };
  
  // Remove a component from the active slide
  const removeComponent = (componentId: string, skipHistory?: boolean) => {
    if (!currentSlide) return;
    
    // Guard: prevent deleting background components
    const allComponents = isEditing ? getDraftComponents(currentSlide.id) : (currentSlide.components || []);
    const target = allComponents.find(c => c.id === componentId);
    const isBackgroundComponent =
      target && (target.type === 'Background' || (target.id && target.id.toLowerCase().includes('background')));
    if (isBackgroundComponent) {
      // No toast here to keep context generic; UI handlers already give feedback
      return;
    }
    
    if (isEditing) {
      // When editing, remove from the draft store
      removeDraftComponent(currentSlide.id, componentId, skipHistory);
      // Force a re-render
      forceComponentUpdate();
    } else {
      // When not editing, remove from the slide directly
      // This should be rare/unused but included for completeness
      if (!currentSlide.components) return;
      
      const filteredComponents = currentSlide.components.filter(comp => comp.id !== componentId);
      updateSlide(currentSlide.id, { components: filteredComponents });
    }
  };
  
  // Update the current slide components when they change
  useEffect(() => {
    if (isEditing && currentSlide) {
      const draftComponents = getDraftComponents(currentSlide.id);
      setActiveComponents(draftComponents);
    } else if (!isEditing && currentSlide) {
      setActiveComponents(currentSlide.components || []);
    }
  }, [isEditing, currentSlide, getDraftComponents, lastOperation]);
  
  return (
    <ActiveSlideContext.Provider 
      value={{
        activeSlide: currentSlide,
        slideId: currentSlide?.id || null,
        activeComponents,
        updateComponent,
        addComponent,
        removeComponent
      }}
    >
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