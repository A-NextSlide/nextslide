/**
 * ShardedSlideViewport - Enhanced slide viewport with document sharding
 * 
 * This component extends the standard SlideViewport with:
 * - Integration with LazyLoadSlideContainer for visibility-based loading
 * - Proper tracking of visible slides for document sharding
 * - Slide ID tracking for efficient loading/unloading
 */

import React, { useRef, useEffect, useCallback, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import SlideContainer from './viewport/SlideContainer';
import { motion, AnimatePresence } from 'framer-motion';
import ComponentSettingsEditor from '@/components/ComponentSettingsEditor';
import { useEditor } from '@/hooks/useEditor';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/stores/editorStore';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { copyToClipboard, pasteFromClipboard } from '@/utils/clipboardUtils';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { LazyLoadSlideContainer } from '@/yjs/LazyLoadSlideContainer';
import { useShardedYjs } from '@/yjs/ShardedYjsProvider';
import SimpleCursors from './SimpleCursors';

import SlideGeneratingPlaceholder from './SlideGeneratingPlaceholder';
import { DeckStatus } from '@/types/DeckTypes';
import ThumbnailNavigator from './ThumbnailNavigator';
import { useGroupKeyboardShortcuts } from '@/hooks/useGroupKeyboardShortcuts';
import ZoomIndicator from './ZoomIndicator';
import { clampZoom, ZOOM_LIMITS, ZOOM_STEP } from '@/utils/zoom';
import { useSlideViewportSize } from './viewport/useSlideViewportSize';
import { BROWSER } from '@/utils/browser';
import { useIsMobile } from '@/hooks/use-mobile';

interface ShardedSlideViewportProps {
  slides: SlideData[];
  currentSlideIndex: number;
  totalSlides: number;
  direction: 'next' | 'prev' | null;
  isTransitioning: boolean;
  isEditing: boolean;
  goToPrevSlide: () => void;
  goToNextSlide: () => void;
  updateSlide: (id: string, data: Partial<SlideData>) => void;
  viewportMaxHeight: number;
  preloadBuffer?: number;
}

const ShardedSlideViewport: React.FC<ShardedSlideViewportProps> = ({
  slides,
  currentSlideIndex,
  totalSlides,
  direction,
  isTransitioning,
  isEditing,
  goToPrevSlide,
  goToNextSlide,
  updateSlide,
  viewportMaxHeight,
  preloadBuffer = 1
}) => {
  const [selectedComponentId, setSelectedComponentId] = React.useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { width: slideWidth, height: slideHeight } = useSlideViewportSize(viewportRef);
  const { toast } = useToast();
  const isMobileView = useIsMobile();
  
  // Track visible slides for document sharding
  const [visibleSlideIds, setVisibleSlideIds] = useState<string[]>([]);
  
  // Get the Yjs context for cursor position updates
  const { updateCursor, updateSelection } = useShardedYjs();
  
  // Get data and functions from ActiveSlideContext
  const { activeComponents, updateComponent, removeComponent, addComponent } = useActiveSlide();
  
  // Get editing capability from editor hook
  const { isEditing: isEditingMode, setIsEditing } = useEditor();
  
  const currentSlide = slides[currentSlideIndex];
  
  // Get the latest version of the selected component from context
  const selectedComponent = React.useMemo(() => {
    if (!selectedComponentId) return null;
    
    // Get the most recent version of the component from context
    return activeComponents.find(comp => comp.id === selectedComponentId) || null;
  }, [selectedComponentId, activeComponents]);
  
  // Get isTextEditing state from the editor settings store
  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);
  
  // Get zoom level from the editor settings store
  const zoomLevel = useEditorSettingsStore(state => state.zoomLevel);
  const setZoomLevel = useEditorSettingsStore(state => state.setZoomLevel);
  const zoomLevelRef = useRef(zoomLevel);
  
  // Extract all slide IDs for the LazyLoadSlideContainer
  const allSlideIds = React.useMemo(() => {
    return slides.map(slide => slide.id);
  }, [slides]);
  
  // Use group keyboard shortcuts
  useGroupKeyboardShortcuts();
  const supportsGestureEvents = BROWSER.isSafari || BROWSER.isIOS;

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const applyZoom = useCallback((nextZoom: number) => {
    const clampedZoom = clampZoom(nextZoom);
    if (clampedZoom === zoomLevelRef.current) return;
    zoomLevelRef.current = clampedZoom;
    setZoomLevel(clampedZoom);
  }, [setZoomLevel]);

  const normalizeWheelDelta = useCallback((deltaY: number, deltaMode?: number) => {
    let normalized = deltaY;
    if (deltaMode === 1) normalized *= 16;
    else if (deltaMode === 2) normalized *= window.innerHeight;
    return normalized;
  }, []);
  
  // Add gesture support for pinch zoom
  React.useEffect(() => {
    const slideContainer = viewportRef.current;
    if (!slideContainer) return;
    // Mobile: skip custom zoom handlers (pinch/gesture/wheel relays). Native browser zoom is safer here.
    if (isMobileView) return;

    let initialDistance = 0;
    let initialZoom = zoomLevelRef.current;
    const normalizeWheelDelta = (e: WheelEvent) => {
      let deltaY = e.deltaY;
      if (e.deltaMode === 1) deltaY *= 16;
      else if (e.deltaMode === 2) deltaY *= window.innerHeight;
      return deltaY;
    };

    const handleWheel = (e: WheelEvent) => {
      // Prevent parent bounce if the event comes from a guarded scrollable
      const target = e.target as HTMLElement | null;
      const guardEl = target && typeof target.closest === 'function' ? (target.closest('[data-scroll-guard="true"]') as HTMLElement | null) : null;
      if (guardEl && !(e.ctrlKey || e.metaKey)) {
        const maxScrollTop = guardEl.scrollHeight - guardEl.clientHeight;
        let deltaY = e.deltaY;
        const dm = (e as any).deltaMode;
        if (dm === 1) deltaY *= 16; // lines → px
        else if (dm === 2) deltaY *= guardEl.clientHeight; // pages → px

        if (maxScrollTop <= 0) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const atTop = guardEl.scrollTop <= 0 && deltaY < 0;
        const atBottom = guardEl.scrollTop >= maxScrollTop && deltaY > 0;
        if (atTop || atBottom) {
          const next = Math.max(0, Math.min(maxScrollTop, guardEl.scrollTop + deltaY));
          if (next !== guardEl.scrollTop) guardEl.scrollTop = next;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        return; // Let inner scroll proceed
      }
      if (e.ctrlKey || e.metaKey) return;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        initialZoom = zoomLevelRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        
        const scale = distance / initialDistance;
        const newZoom = Math.round(initialZoom * scale);
        applyZoom(newZoom);
      }
    };

    // Handle native gesture events (Safari/iOS)
    let gestureInitialZoom = zoomLevelRef.current;

    const handleWindowWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const deltaY = normalizeWheelDelta(e.deltaY, e.deltaMode);
      const zoomFactor = Math.exp(-deltaY * 0.002);
      const nextZoom = Math.round(zoomLevelRef.current * zoomFactor);
      applyZoom(nextZoom);
    };

    const handleWindowGestureStart = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      gestureInitialZoom = zoomLevelRef.current;
    };

    const handleWindowGestureChange = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const gestureEvent = e as any;
      const scale = gestureEvent.scale || 1;
      const nextZoom = Math.round(gestureInitialZoom * scale);
      applyZoom(nextZoom);
    };

    const handleWindowGestureEnd = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    // Add event listeners
    slideContainer.addEventListener('wheel', handleWheel, { passive: false });
    slideContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    slideContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    window.addEventListener('wheel', handleWindowWheel, { passive: false, capture: true });
    if (supportsGestureEvents) {
      window.addEventListener('gesturestart', handleWindowGestureStart as EventListener, { passive: false, capture: true });
      window.addEventListener('gesturechange', handleWindowGestureChange as EventListener, { passive: false, capture: true });
      window.addEventListener('gestureend', handleWindowGestureEnd as EventListener, { passive: false, capture: true });
    }

    return () => {
      slideContainer.removeEventListener('wheel', handleWheel);
      slideContainer.removeEventListener('touchstart', handleTouchStart);
      slideContainer.removeEventListener('touchmove', handleTouchMove);
      window.removeEventListener('wheel', handleWindowWheel, { capture: true });
      if (supportsGestureEvents) {
        window.removeEventListener('gesturestart', handleWindowGestureStart as EventListener, { capture: true });
        window.removeEventListener('gesturechange', handleWindowGestureChange as EventListener, { capture: true });
        window.removeEventListener('gestureend', handleWindowGestureEnd as EventListener, { capture: true });
      }
    };
  }, [applyZoom, isMobileView, normalizeWheelDelta, supportsGestureEvents, viewportRef]);
  
  // Add keyboard shortcuts for zooming
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isZoomShortcut = (e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0');
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      if ((isInput || isContentEditable || isTextEditing) && !isZoomShortcut) return;
      
      // Check for Ctrl/Cmd + Plus/Minus/0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          applyZoom(zoomLevelRef.current + ZOOM_STEP);
        } else if (e.key === '-') {
          e.preventDefault();
          applyZoom(zoomLevelRef.current - ZOOM_STEP);
        } else if (e.key === '0') {
          e.preventDefault();
          applyZoom(100);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [applyZoom, isTextEditing]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as any;
      if (!data || data.source !== 'ns-slide-zoom') return;
      if (isMobileView) return;

      if (data.method === 'wheel' && typeof data.deltaY === 'number') {
        const deltaY = normalizeWheelDelta(data.deltaY, data.deltaMode);
        const zoomFactor = Math.exp(-deltaY * 0.002);
        const nextZoom = Math.round(zoomLevelRef.current * zoomFactor);
        applyZoom(nextZoom);
      } else if (data.method === 'gesture' && typeof data.scale === 'number') {
        const nextZoom = Math.round(zoomLevelRef.current * data.scale);
        applyZoom(nextZoom);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [applyZoom, isMobileView, normalizeWheelDelta]);
  
  // Cursor tracking and visible slides integration is now handled by the cursor components directly
  
  // Handle visible slides change
  const handleVisibleSlidesChange = (newVisibleSlideIds: string[]) => {
    setVisibleSlideIds(newVisibleSlideIds);
  };
  
  // Cursor tracking is now handled by the cursor components
  
  // Update selection in Yjs provider when component is selected
  useEffect(() => {
    if (!currentSlide) return;
    
    const selectedIds = selectedComponentId ? [selectedComponentId] : [];
    
    // Only update if the current slide is visible
    if (visibleSlideIds.includes(currentSlide.id)) {
      updateSelection(currentSlide.id, selectedIds);
    }
  }, [selectedComponentId, currentSlide, visibleSlideIds, updateSelection]);
  
  // Add keyboard shortcut 'e' to toggle edit mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      // If in a text input field OR text editing mode, don't process shortcuts
      if (isInput || isContentEditable || isTextEditing) return;

      // Don't toggle edit mode when in presentation mode
      if (document.body.classList.contains('presentation-mode')) return;

      // Use 'e' key to toggle edit mode
      if (e.key === 'e') {
        setIsEditing(!isEditingMode);
        
        // Also dispatch the force event for redundancy
        if (!isEditingMode) {
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };
    
    // Add event listener
    window.addEventListener('keydown', handleKeyDown);
    
    // Set up double-click handler for entering edit mode
    const handleDoubleClick = (e: MouseEvent) => {
      // Only activate if we're not already in edit mode
      if (!isEditingMode) {
        // Don't activate for inputs or content editables
        const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
        const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
        
        if (!isInput && !isContentEditable) {
          setIsEditing(true);
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };
    
    // Add double-click listener to the document (capture-phase)
    document.addEventListener('dblclick', handleDoubleClick, true);
    
    // Clean up both event listeners
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('dblclick', handleDoubleClick, true);
    };
  }, [isEditingMode, isTextEditing, setIsEditing]);
  
  // Auto-select the first component when entering edit mode
  React.useEffect(() => {
    if (isEditing && currentSlide) {
      if (activeComponents.length > 0 && !selectedComponentId) {
        // Select the first component automatically when entering edit mode
        setSelectedComponentId(activeComponents[0].id);
      }
    } else if (!isEditing) {
      // Clear selection when exiting edit mode
      setSelectedComponentId(null);
    }
  }, [isEditing, currentSlide, selectedComponentId, activeComponents]);

  // Handle keyboard shortcuts - UPDATED to support both Ctrl/Command keys and Delete key
  useEffect(() => {
    // Only add event listeners if we're in edit mode
    if (!isEditingMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      // If in a text input field OR text editing mode, don't process shortcuts
      if (isInput || isContentEditable || isTextEditing) return;

      // Check if it's a modifier key (Ctrl on Windows/Linux or Command on Mac)
      const isModifierKey = e.ctrlKey || e.metaKey; // metaKey is Command on Mac

      // Check for Ctrl/Cmd+C (Copy)
      if (isModifierKey && e.key === 'c') {
        e.preventDefault();
        if (selectedComponent) {
          copyToClipboard(selectedComponent);
          toast({
            title: "Component Copied",
            description: `${selectedComponent.type} copied to clipboard`,
            duration: 2000,
          });
        }
      }
      
      // Check for Ctrl/Cmd+V (Paste)
      if (isModifierKey && e.key === 'v') {
        e.preventDefault();
        const newComponent = pasteFromClipboard();
        if (newComponent && currentSlide) {
          // Pass false for skipHistory to ensure a single history entry is created
          addComponent(newComponent, false);
          setSelectedComponentId(newComponent.id);
          toast({
            title: "Component Pasted",
            description: `${newComponent.type} pasted from clipboard`,
            duration: 2000,
          });
        }
      }

      // Check for Delete key to delete the selected component
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedComponent && currentSlide) {
        e.preventDefault();
        
        // Check if this is a background component (can't delete these)
        const isBackgroundComponent = selectedComponent.type === 'Background' || 
                                     (selectedComponent.id && selectedComponent.id.toLowerCase().includes('background'));
        
        if (isBackgroundComponent) {
          toast({
            title: "Cannot Delete Background",
            description: "Background components cannot be removed",
            duration: 2000,
            variant: "destructive"
          });
          return;
        }
        
        // Store the ID before we clear selection
        const componentId = selectedComponent.id;
        
        // Clear selection first
        setSelectedComponentId(null);
        
        // Remove the component using ActiveSlideContext
        // Pass false for skipHistory to ensure a single history entry is created
        removeComponent(componentId, false);
        
        toast({
          title: "Component Deleted",
          description: `${selectedComponent.type} has been removed`,
          duration: 2000,
        });
      }
    };

    // Add event listener to the document
    document.addEventListener('keydown', handleKeyDown);

    // Clean up
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [selectedComponent, isEditingMode, isTextEditing, currentSlide, addComponent, removeComponent, toast]);
  
  const handleComponentSelect = (component: ComponentInstance) => {
    // Component selected
    setSelectedComponentId(component.id);
  };
  
  const handleComponentDeselect = () => {
    setSelectedComponentId(null);
  };
  
  const handleComponentUpdate = (componentId: string, updates: Partial<ComponentInstance>) => {
    // Component update requested
    
    // Use the ActiveSlideContext to update the component
    // Pass false for skipHistory to ensure a single history entry is created
    updateComponent(componentId, updates, false);
  };

  const handleSave = () => {
    if (currentSlide) {
      // Clear selected component first to prevent position jumps
      setSelectedComponentId(null);
      
      // Saving changes for slide
      
      // Force a final save of draft components to the permanent store BEFORE setting transition
      // This ensures the data is definitely saved regardless of transition detection
      if (isEditingMode) {
        // Manually applying draft changes before transition
        const applyDraftChanges = useEditorStore.getState().applyDraftChanges;
        applyDraftChanges();
      }
      
      // THEN use transition property to indicate saving to trigger the other mechanisms
      // Setting save transition flag for slide
      updateSlide(currentSlide.id, { 
        transition: 'save'
      });
    }
  };

  const handleCancel = () => {
    if (currentSlide) {
      // Clear selected component first to prevent position jumps
      setSelectedComponentId(null);
      // Use transition property to indicate cancellation
      updateSlide(currentSlide.id, { 
        transition: 'cancel'
      });
    }
  };

  const handleSaveAndExit = () => {
    handleSave();
    setIsEditing(false);
  };

  // Setup event listeners for slide navigation
  React.useEffect(() => {
    const handleSlideNavigate = (event: CustomEvent) => {
      const { direction } = event.detail;
      if (direction === 'next') {
        goToNextSlide();
      } else if (direction === 'prev') {
        goToPrevSlide();
      }
    };

    // Add event listener
    window.addEventListener('slide:navigate', handleSlideNavigate as EventListener);
    
    // Cleanup
    return () => {
      window.removeEventListener('slide:navigate', handleSlideNavigate as EventListener);
    };
  }, [goToNextSlide, goToPrevSlide]);

  return (
    <div 
      ref={viewportRef} 
      className="flex-1 relative overflow-hidden flex items-center justify-center max-w-full w-full h-full bg-background"
      style={{
        touchAction: 'pan-x pan-y', // Disable pinch zoom on touch devices
        userSelect: 'none', // Prevent text selection during zoom
      }}
    >
      <ZoomIndicator />
      
      {/* Main Content Area */}
      <div className="w-full h-full flex items-center justify-center">
        {/* This wrapper div maintains position while children animate */}
        <div className="relative flex justify-center items-center h-full">
          {/* Slide Container that adjusts position when editing */}
          <motion.div 
            className="flex flex-col relative"
            animate={{
              x: 0 // Don't animate the slide container position
            }}
            transition={{
              type: "spring",
              stiffness: 300,
              damping: 30
            }}
            style={{ 
              zIndex: 40, // Lower z-index so editor is clickable
              // Add right padding to make room for editor when in edit mode
              paddingRight: isEditing ? '280px' : '0px',
              transition: 'padding 0.3s ease-in-out',
              pointerEvents: 'auto' // Ensure clicks go through
            }} 
          >
            {/* Wrap with LazyLoadSlideContainer for visibility detection */}
            <LazyLoadSlideContainer 
              allSlideIds={allSlideIds}
              preloadBuffer={preloadBuffer}
              visibilityThreshold={0.2}
              onVisibleSlidesChange={handleVisibleSlidesChange}
            >
              {/* Zoom Transformation Container - only for slide content */}
              <div 
                style={{ 
                  transform: `scale(${zoomLevel/100})`, 
                  transformOrigin: 'center center',
                  transition: 'transform 0.2s ease',
                }}
              >
                <SlideContainer
                  slides={slides}
                  currentSlideIndex={currentSlideIndex}
                  direction={direction}
                  isEditing={isEditing}
                  selectedComponentId={selectedComponent?.id}
                  onComponentSelect={handleComponentSelect}
                  onComponentDeselect={handleComponentDeselect}
                  updateSlide={updateSlide}
                  slideWidth={slideWidth}
                  slideHeight={slideHeight}
                  zoomLevel={100}
                />
              </div>
              
              {/* Use both cursor systems to ensure at least one works */}
              {currentSlide && (
                <>
                  {/* Try Yjs-based cursor tracking first */}
                  <SimpleCursors
                    slideId={currentSlide.id}
                    containerRef={viewportRef}
                    zoomLevel={zoomLevel}
                  />
                </>
              )}
            </LazyLoadSlideContainer>
          </motion.div>
          
          {/* Editor panel - outside zoom container */}
          <AnimatePresence>
            {isEditing && (
              <motion.div
                className="fixed"
                style={{
                  right: '0px',
                  top: '0px',
                  zIndex: 50, // Higher z-index than slide
                  width: '280px', 
                  height: '74vh',
                  maxHeight: '635px',
                  display: 'flex',
                  flexDirection: 'column',
                  backgroundColor: 'var(--background)',
                  borderLeft: '1px solid var(--border)',
                  pointerEvents: 'auto' // Ensure clicks go through
                }}
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{
                  type: "spring",
                  stiffness: 300,
                  damping: 30
                }}
              >
                <div className="sticky top-0 flex justify-between items-center p-2 border-b border-border bg-background z-10">
                  <h3 className="text-sm font-medium">Properties</h3>
                  <button 
                    className="p-1 rounded-sm hover:bg-accent"
                    onClick={handleSaveAndExit}
                    title="Save and exit"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 6L6 18" />
                      <path d="M6 6l12 12" />
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1">
                  <ComponentSettingsEditor
                    component={selectedComponent}
                    onUpdate={(updates) => {
                      if (selectedComponent && currentSlide) {
                        handleComponentUpdate(
                          selectedComponent.id,
                          updates
                        );
                      }
                    }}
                    onDelete={() => {
                      if (selectedComponent && currentSlide) {
                        // Check if this is a background component (can't delete these)
                        const isBackgroundComponent = selectedComponent.type === 'Background' || 
                                                     (selectedComponent.id && selectedComponent.id.toLowerCase().includes('background'));
                        
                        if (isBackgroundComponent) {
                          toast({
                            title: "Cannot Delete Background",
                            description: "Background components cannot be removed",
                            duration: 2000,
                            variant: "destructive"
                          });
                          return;
                        }
                        
                        // Store the ID before we clear selection
                        const componentId = selectedComponent.id;
                        
                        // Clear selection first
                        setSelectedComponentId(null);
                        
                        // Remove the component using ActiveSlideContext
                        // Pass false for skipHistory to ensure a single history entry is created
                        removeComponent(componentId, false);
                      }
                    }}
                  />
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
};

export default ShardedSlideViewport;
