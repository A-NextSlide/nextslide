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
import DirectCursors from './DirectCursors';
import SlideGeneratingPlaceholder from './SlideGeneratingPlaceholder';
import { DeckStatus } from '@/types/DeckTypes';
import ThumbnailNavigator from './ThumbnailNavigator';
import { useGroupKeyboardShortcuts } from '@/hooks/useGroupKeyboardShortcuts';
import ZoomIndicator from './ZoomIndicator';

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
  const { toast } = useToast();
  
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
  
  // Extract all slide IDs for the LazyLoadSlideContainer
  const allSlideIds = React.useMemo(() => {
    return slides.map(slide => slide.id);
  }, [slides]);
  
  // Use group keyboard shortcuts
  useGroupKeyboardShortcuts();
  
  // Add gesture support for pinch zoom
  React.useEffect(() => {
    const slideContainer = viewportRef.current;
    if (!slideContainer) return;

    let initialDistance = 0;
    let initialZoom = zoomLevel;
    
    // Also prevent browser zoom on the window level
    const preventBrowserZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        return false;
      }
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
      // Detect various zoom gestures
      const isPinchGesture = e.ctrlKey && !e.shiftKey && !e.altKey && !e.metaKey;
      const isZoomShortcut = (e.ctrlKey || e.metaKey) && !e.shiftKey;
      const isShiftScroll = e.shiftKey && !e.ctrlKey && !e.metaKey;
      
      // Also detect trackpad pinch by checking for non-integer deltaY values
      // Trackpad pinches often have fractional deltaY values
      const isProbablyTrackpadPinch = e.ctrlKey && Math.abs(e.deltaY) < 10 && e.deltaY % 1 !== 0;
      
      // Check if it's any zoom gesture
      if (isPinchGesture || isZoomShortcut || isShiftScroll || isProbablyTrackpadPinch) {
        e.preventDefault();
        e.stopPropagation();
        
        // Calculate new zoom level
        const delta = e.deltaY;
        const zoomSpeed = isProbablyTrackpadPinch ? 1.5 : 0.5; // More sensitive for trackpad
        const newZoom = Math.round(zoomLevel - delta * zoomSpeed);
        
        // Clamp between 50% and 200%
        const clampedZoom = Math.max(50, Math.min(200, newZoom));
        
        if (clampedZoom !== zoomLevel) {
          setZoomLevel(clampedZoom);
        }
        
        return false; // Extra prevention
      }
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const touch1 = e.touches[0];
        const touch2 = e.touches[1];
        initialDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        initialZoom = zoomLevel;
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
        
        // Clamp between 50% and 200%
        const clampedZoom = Math.max(50, Math.min(200, newZoom));
        
        if (clampedZoom !== zoomLevel) {
          setZoomLevel(clampedZoom);
        }
      }
    };

    // Handle native gesture events (Safari/iOS)
    let gestureInitialZoom = zoomLevel;
    
    const handleGestureStart = (e: any) => {
      e.preventDefault();
      gestureInitialZoom = zoomLevel;
    };
    
    const handleGestureChange = (e: any) => {
      e.preventDefault();
      const scale = e.scale || 1;
      const newZoom = Math.round(gestureInitialZoom * scale);
      const clampedZoom = Math.max(50, Math.min(200, newZoom));
      
      if (clampedZoom !== zoomLevel) {
        setZoomLevel(clampedZoom);
      }
    };
    
    const handleGestureEnd = (e: any) => {
      e.preventDefault();
    };

    // Add event listeners
    slideContainer.addEventListener('wheel', handleWheel, { passive: false });
    slideContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    slideContainer.addEventListener('touchmove', handleTouchMove, { passive: false });
    slideContainer.addEventListener('gesturestart', handleGestureStart, { passive: false });
    slideContainer.addEventListener('gesturechange', handleGestureChange, { passive: false });
    slideContainer.addEventListener('gestureend', handleGestureEnd, { passive: false });
    
    // Also add to window to catch any that bubble up
    window.addEventListener('wheel', preventBrowserZoom, { passive: false, capture: true });

    return () => {
      slideContainer.removeEventListener('wheel', handleWheel);
      slideContainer.removeEventListener('touchstart', handleTouchStart);
      slideContainer.removeEventListener('touchmove', handleTouchMove);
      slideContainer.removeEventListener('gesturestart', handleGestureStart);
      slideContainer.removeEventListener('gesturechange', handleGestureChange);
      slideContainer.removeEventListener('gestureend', handleGestureEnd);
      window.removeEventListener('wheel', preventBrowserZoom);
    };
  }, [zoomLevel, setZoomLevel, viewportRef]);
  
  // Add keyboard shortcuts for zooming
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      if (isInput || isContentEditable || isTextEditing) return;
      
      // Check for Ctrl/Cmd + Plus/Minus/0
      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          const newZoom = Math.min(200, zoomLevel + 10);
          setZoomLevel(newZoom);
        } else if (e.key === '-') {
          e.preventDefault();
          const newZoom = Math.max(50, zoomLevel - 10);
          setZoomLevel(newZoom);
        } else if (e.key === '0') {
          e.preventDefault();
          setZoomLevel(100);
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomLevel, setZoomLevel, isTextEditing]);
  
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
                  
                  {/* Fallback to direct cursor tracking if Yjs isn't working */}
                  <DirectCursors
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