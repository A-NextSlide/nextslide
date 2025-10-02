import React, { useRef, useEffect, useCallback, useState } from 'react';
import { BROWSER } from '@/utils/browser';
import { runWhenIdle } from '@/utils/scheduler';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import SlideContainer from './viewport/SlideContainer';
import { motion, AnimatePresence } from 'framer-motion';
import ComponentSettingsEditor from '@/components/ComponentSettingsEditor';
import MultiComponentSettingsEditor from '@/components/MultiComponentSettingsEditor';
import { useEditor } from '@/hooks/useEditor';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/stores/editorStore';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { copyToClipboard, pasteFromClipboard } from '@/utils/clipboardUtils';
import { useToast } from '@/hooks/use-toast';
import { DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { useYjs } from '@/yjs/YjsProvider';
import SimpleCursors from './SimpleCursors';
import DirectCursors from './DirectCursors';
import SlideGeneratingPlaceholder from './SlideGeneratingPlaceholder';
import { DeckStatus } from '@/types/DeckTypes';
import ThumbnailNavigator from './ThumbnailNavigator';
import { useGroupKeyboardShortcuts } from '@/hooks/useGroupKeyboardShortcuts';
import ZoomIndicator from './ZoomIndicator';
import CommentPinsOverlay from './CommentPinsOverlay';
import { shareService } from '@/services/shareService';
import { useDeckStore } from '@/stores/deckStore';
import { CommentsPanel } from './CommentsPanel';

interface SlideViewportProps {
  slides: SlideData[];
  currentSlideIndex: number;
  totalSlides: number;
  direction: 'next' | 'prev' | null;
  isTransitioning: boolean;
  isEditing: boolean;
  goToPrevSlide: () => void;
  goToNextSlide: () => void;
  updateSlide: (id: string, data: Partial<SlideData>) => Promise<void>;
  viewportMaxHeight: number;
  deckStatus?: DeckStatus;
  isNewDeck?: boolean;
}

const SlideViewport: React.FC<SlideViewportProps> = ({
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
  deckStatus,
  isNewDeck
}) => {
  const [selectedComponentId, setSelectedComponentId] = React.useState<string | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  
  // Add ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const zoomContainerRef = useRef<HTMLDivElement>(null);
  
  // Yjs context for collaboration is initialized below
  
  // Get data and functions from ActiveSlideContext
  const { activeComponents, updateComponent, removeComponent, addComponent } = useActiveSlide();
  
  // Get editing capability from editor hook
  const { isEditing: isEditingMode, setIsEditing } = useEditor();
  
  const currentSlide = slides[currentSlideIndex];
  const deckUuid = useDeckStore(state => state.deckData?.uuid || '');
  
  // Check if current slide exists and has any components
  const isCurrentSlideCompleted = currentSlide && 
    currentSlide.components && 
    currentSlide.components.length > 0;
  
  // Memoize getCollaborators to prevent excessive re-renders
  const getCollaborators = React.useCallback(async () => {
    if (!deckUuid) return [];
    try {
      const resp = await shareService.getCollaborators(deckUuid as any);
      if ((resp as any).success && (resp as any).data) return (resp as any).data;
      return [];
    } catch { return []; }
  }, [deckUuid]);
  
  // Get the latest version of the selected component from context
  const selectedComponent = React.useMemo(() => {
    if (!selectedComponentId) return null;
    
    // Get the most recent version of the component from context
    const found = activeComponents.find(comp => comp.id === selectedComponentId) || null;
    return found;
  }, [selectedComponentId, activeComponents]);
  
  // Track active components and selection
  React.useEffect(() => {
    // No-op effect to track dependencies
  }, [activeComponents, selectedComponent]);
  
  // Get isTextEditing state from the editor settings store
  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);
  
  // Get zoom level from the editor settings store
  const zoomLevel = useEditorSettingsStore(state => state.zoomLevel);
  const setZoomLevel = useEditorSettingsStore(state => state.setZoomLevel);
  
  // Track zoom origin for cursor-based zooming
  const [zoomOrigin, setZoomOrigin] = useState({ x: 0.5, y: 0.5 });
  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  
  // Use group keyboard shortcuts
  useGroupKeyboardShortcuts();
  
  // Enhanced zoom handling with cursor-based zoom
  React.useEffect(() => {
    const slideContainer = document.getElementById('slide-display-container');
    const scrollContainer = scrollContainerRef.current;
    if (!slideContainer || !scrollContainer) return;

    let initialDistance = 0;
    let initialZoom = zoomLevel;

    const handleWheel = (e: WheelEvent) => {
      // If the event originates from a guarded scrollable inside a custom component,
      // prevent parent bounce when at edges and let the inner element handle scrolling
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
          // Clamp and consume to avoid rubber-band and parent scroll
          const next = Math.max(0, Math.min(maxScrollTop, guardEl.scrollTop + deltaY));
          if (next !== guardEl.scrollTop) guardEl.scrollTop = next;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // Not at edges, allow inner scroll to proceed without parent interference
        return;
      }
      // Check if we're over the slide area
      const rect = slideContainer.getBoundingClientRect();
      const isOverSlide = e.clientX >= rect.left && e.clientX <= rect.right && 
                         e.clientY >= rect.top && e.clientY <= rect.bottom;
      
      if (!isOverSlide) return;

      // On Mac, pinch gestures come through as wheel events with ctrlKey=true
      // Regular two-finger scrolling has ctrlKey=false
      const isPinchGesture = e.ctrlKey;
      
      if (isPinchGesture) {
        e.preventDefault();
        
        // Calculate cursor position relative to the slide container
        const containerRect = scrollContainer.getBoundingClientRect();
        const cursorX = e.clientX - containerRect.left + scrollContainer.scrollLeft;
        const cursorY = e.clientY - containerRect.top + scrollContainer.scrollTop;
        
        // Calculate the zoom origin as a percentage of container size
        const originX = cursorX / scrollContainer.scrollWidth;
        const originY = cursorY / scrollContainer.scrollHeight;
        
        // Store zoom origin
        setZoomOrigin({ x: originX, y: originY });
        
        // Calculate new zoom level
        const delta = e.deltaY;
        const zoomSpeed = 1; // Consistent speed for pinch
        const zoomFactor = delta > 0 ? 0.95 : 1.05; // Bigger increments for faster zoom
        const newZoom = Math.round(zoomLevel * zoomFactor);
        
        // Clamp between 65% and 400% for more range
        const clampedZoom = Math.max(65, Math.min(400, newZoom));
        
        if (clampedZoom !== zoomLevel) {
          // Calculate the cursor position before zoom
          const beforeZoomX = cursorX;
          const beforeZoomY = cursorY;
          
          // Set new zoom level
          setZoomLevel(clampedZoom);
          
          // Calculate where the cursor would be after zoom
          // We need to adjust scroll to keep cursor at same position
          requestAnimationFrame(() => {
            const scaleFactor = clampedZoom / zoomLevel;
            const newCursorX = beforeZoomX * scaleFactor;
            const newCursorY = beforeZoomY * scaleFactor;
            
            // Calculate scroll adjustment to keep cursor in same position
            const scrollAdjustX = newCursorX - cursorX;
            const scrollAdjustY = newCursorY - cursorY;
            
            // Apply scroll adjustment
            scrollContainer.scrollLeft += scrollAdjustX;
            scrollContainer.scrollTop += scrollAdjustY;
          });
        }
      }
      // If it's not a pinch gesture, let normal scrolling happen
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
        
        // Calculate center point for zoom origin
        const centerX = (touch1.clientX + touch2.clientX) / 2;
        const centerY = (touch1.clientY + touch2.clientY) / 2;
        
        const containerRect = scrollContainer.getBoundingClientRect();
        const originX = (centerX - containerRect.left + scrollContainer.scrollLeft) / scrollContainer.scrollWidth;
        const originY = (centerY - containerRect.top + scrollContainer.scrollTop) / scrollContainer.scrollHeight;
        
        setZoomOrigin({ x: originX, y: originY });
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
        
        // Clamp between 65% and 400% for wider range
        const clampedZoom = Math.max(65, Math.min(400, newZoom));
        
        if (clampedZoom !== zoomLevel) {
          setZoomLevel(clampedZoom);
        }
      }
    };

    // Add event listeners - keep passive: false to preventDefault on pinch-zoom
    slideContainer.addEventListener('wheel', handleWheel, { passive: false });
    slideContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    slideContainer.addEventListener('touchmove', handleTouchMove, { passive: false });

    return () => {
      slideContainer.removeEventListener('wheel', handleWheel as any);
      slideContainer.removeEventListener('touchstart', handleTouchStart);
      slideContainer.removeEventListener('touchmove', handleTouchMove);
    };
  }, [zoomLevel, setZoomLevel]);
  
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
          const newZoom = Math.min(400, zoomLevel + 10);
          setZoomLevel(newZoom);
          // Center the zoom origin when using keyboard
          setZoomOrigin({ x: 0.5, y: 0.5 });
        } else if (e.key === '-') {
          e.preventDefault();
          const newZoom = Math.max(65, zoomLevel - 10);
          setZoomLevel(newZoom);
          // Center the zoom origin when using keyboard
          setZoomOrigin({ x: 0.5, y: 0.5 });
        } else if (e.key === '0') {
          e.preventDefault();
          setZoomLevel(100);
          // Reset scroll when returning to 100%
          if (scrollContainerRef.current) {
            scrollContainerRef.current.scrollLeft = 0;
            scrollContainerRef.current.scrollTop = 0;
          }
        }
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [zoomLevel, setZoomLevel, isTextEditing]);

  // Listen for open/close comments panel events from header
  React.useEffect(() => {
    const open = () => setShowCommentsPanel(true);
    const close = () => setShowCommentsPanel(false);
    const toggle = () => setShowCommentsPanel(v => !v);
    window.addEventListener('comments:open-panel', open as EventListener);
    window.addEventListener('comments:close-panel', close as EventListener);
    window.addEventListener('comments:toggle-panel', toggle as EventListener);
    return () => {
      window.removeEventListener('comments:open-panel', open as EventListener);
      window.removeEventListener('comments:close-panel', close as EventListener);
      window.removeEventListener('comments:toggle-panel', toggle as EventListener);
    };
  }, []);
  
  // Add keyboard shortcut 'e' to toggle edit mode
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      
      // If in a text input field OR text editing mode, don't process shortcuts
      if (isInput || isContentEditable || isTextEditing) return;
      
      // Use 'e' key to toggle edit mode - only if current slide is completed
      if (e.key === 'e' && isCurrentSlideCompleted) {
        setIsEditing(!isEditingMode);
        
        // Also dispatch the force event for redundancy
        if (!isEditingMode) {
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };
    
    // Handle toggle edit mode event
    const handleToggleEditMode = () => {
      if (isCurrentSlideCompleted) {
        const newEditingState = !isEditingMode;
        setIsEditing(newEditingState);
        
        // Log component font sizes when entering edit mode
        if (newEditingState && currentSlide) {
          currentSlide.components?.forEach(comp => {
            if (comp.type === 'TiptapTextBlock' || comp.type === 'TextBlock' || comp.type === 'ShapeWithText') {
            }
          });
        }
        
        // Also dispatch the force event for redundancy
        if (newEditingState) {
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };
    
    // Handle force edit mode event - always enter edit mode when this is received
    const handleForceEditMode = () => {
      if (isCurrentSlideCompleted && !isEditingMode) {
        setIsEditing(true);
      }
    };
    
    // Add event listeners
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('editor:toggle-edit-mode', handleToggleEditMode);
    window.addEventListener('editor:force-edit-mode', handleForceEditMode);
    
    // Set up double-click handler for entering edit mode
    const handleDoubleClick = (e: MouseEvent) => {
      
      // Only activate if we're not already in edit mode AND current slide is completed
      if (!isEditingMode && isCurrentSlideCompleted) {
        // Don't activate for inputs or content editables
        const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
        const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
        
        if (!isInput && !isContentEditable) {
          setIsEditing(true);
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };
    
    // Handle custom slide double-click event
    const handleSlideDoubleClick = (e: CustomEvent) => {
      
      if (!isEditingMode && isCurrentSlideCompleted) {
        setIsEditing(true);
        window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
      }
    };
    
    // Add double-click listeners (use capture so we win over stopPropagation)
    document.addEventListener('dblclick', handleDoubleClick, true);
    window.addEventListener('slide:doubleclick', handleSlideDoubleClick as EventListener);
    
    // Clean up event listeners
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('editor:toggle-edit-mode', handleToggleEditMode);
      window.removeEventListener('editor:force-edit-mode', handleForceEditMode);
      document.removeEventListener('dblclick', handleDoubleClick, true);
      window.removeEventListener('slide:doubleclick', handleSlideDoubleClick as EventListener);
    };
  }, [isEditingMode, isTextEditing, setIsEditing, isCurrentSlideCompleted]);
  
  // Auto-select the first component when entering edit mode
  React.useEffect(() => {
    if (isEditing && currentSlide) {
      if (activeComponents.length > 0 && !selectedComponentId) {
        // Select the first component automatically when entering edit mode
        setSelectedComponentId(activeComponents[0].id);
        // Auto-selected first component
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
  
  // Get cursor update function from Yjs
  const { updateCursor, updateSelection } = useYjs();
  
  // Cursor tracking is now handled by the cursor components
  
  const handleComponentSelect = (component: ComponentInstance) => {
    // Component selected
    setSelectedComponentId(component.id);
    
    // Also select in the multi-selection system
    const editorStore = useEditorStore.getState();
    editorStore.selectComponent(component.id);
    
    // Broadcast selection to other users
    if (updateSelection && currentSlide) {
      updateSelection(currentSlide.id, [component.id]);
    }
  };
  
  const handleComponentDeselect = () => {
    setSelectedComponentId(null);
    
    // Clear selection for other users
    if (updateSelection && currentSlide) {
      updateSelection(currentSlide.id, []);
    }
  };
  
  const handleComponentUpdate = (componentId: string, updates: Partial<ComponentInstance>) => {
    // Component update requested
    
    // Use the ActiveSlideContext to update the component
    // Pass false for skipHistory to ensure a single history entry is created
    updateComponent(componentId, updates, false);
  };

  const handleSaveAndExit = () => {
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

  // Tour hook previously injected a demo text; per spec, do not modify slide data.

  // After deck completes, ensure edit toggle is available by clearing selection mode
  React.useEffect(() => {
    const handleDeckComplete = () => {
      try {
        window.dispatchEvent(new CustomEvent('chat:selection-mode-changed', { detail: { selecting: false } }));
      } catch {}
    };
    window.addEventListener('deck_generation_complete', handleDeckComplete);
    return () => window.removeEventListener('deck_generation_complete', handleDeckComplete);
  }, []);
  
  // No duplicate useEffect needed since we're using React's onMouseMove handler

  // Get the actual slide data for the current index
  const currentSlideData = slides && slides.length > currentSlideIndex ? slides[currentSlideIndex] : null;

  // Debug log for the specific slide data being used for SlideDisplay
  if (currentSlideData) {

  }

  return (
    <div 
      ref={viewportRef} 
      className="flex-1 relative overflow-hidden flex items-center justify-center max-w-full w-full h-full bg-background"
    >
      <ZoomIndicator />
      
      {/* Scrollable Container */}
      <div 
        ref={scrollContainerRef}
        className={`absolute inset-0 overflow-auto ${zoomLevel <= 100 ? 'scrollbar-hide' : ''}`}
        style={{
          // Hide scrollbars when at 100% zoom
          scrollbarWidth: zoomLevel > 100 ? 'auto' : 'none',
          msOverflowStyle: zoomLevel > 100 ? 'auto' : 'none',
        }}
      >
        {/* Zoom Content Wrapper - this expands based on zoom level */}
        <div 
          className="relative flex items-center justify-center"
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: `${zoomLevel}%`,
            height: `${zoomLevel}%`,
            // Center content when not zoomed
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* This wrapper div maintains position while children animate */}
          <div className="relative flex justify-center items-center">
            {/* Slide Container that adjusts position when editing - prevent flashing by keeping transform stable */}
            <motion.div 
              className="flex flex-col relative"
              initial={false}
              animate={{
                scale: isEditing ? 0.92 : 1,
                x: isEditing ? -140 : 0
              }}
              transition={{
                duration: 0.18,
                ease: "easeOut"
              }}
              style={{ 
                zIndex: 40,
                pointerEvents: 'auto',
                willChange: 'transform'
              }} 
            >
              {/* Zoom Transformation Container - only for slide content */}
              <div 
                ref={zoomContainerRef}
                style={{ 
                  transform: `scale(${zoomLevel/100})`, 
                  transformOrigin: `${zoomOrigin.x * 100}% ${zoomOrigin.y * 100}%`,
                  transition: 'transform 0.15s ease-out',
                  willChange: 'transform'
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
                  deckStatus={deckStatus}
                  isNewDeck={isNewDeck}
                />
              </div>
              
              {/* Use both cursor systems with specific offsets for accurate cursor positioning */}
              {currentSlide && (
                <>
                  {/* Try Yjs-based cursor tracking first */}
                  <SimpleCursors
                    slideId={currentSlide.id}
                    containerRef={scrollContainerRef}
                    offsetY={24} // Significant positive offset for perfect alignment
                    zoomLevel={zoomLevel} // Pass zoom level for cursor positioning
                  />
                  
                  {/* Fallback to direct cursor tracking if Yjs isn't working */}
                  <DirectCursors
                    slideId={currentSlide.id}
                    containerRef={scrollContainerRef}
                    offsetY={24} // Significant positive offset for perfect alignment
                    zoomLevel={zoomLevel} // Pass zoom level for cursor positioning
                  />
                  {/* Comments overlay */}
                  <CommentPinsOverlay
                    deckId={deckUuid}
                    slideId={currentSlide.id}
                    containerRef={scrollContainerRef}
                    zoomLevel={zoomLevel}
                    getCollaborators={getCollaborators}
                  />
                </>
              )}
            </motion.div>
          </div>
        </div>
      </div>
      
      {/* Editor panel - outside zoom and scroll containers */}
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
                data-tour="properties-panel"
                initial={{ opacity: 0, x: 50 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 50 }}
                transition={{
                  duration: 0.27,
                  ease: "easeInOut"
                }}
              >
                {showCommentsPanel ? (
                  <CommentsPanel
                    deckId={deckUuid}
                    slideId={currentSlide?.id}
                    getCollaborators={getCollaborators}
                    onClose={() => setShowCommentsPanel(false)}
                  />
                ) : (
                  <>
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
                      {(() => {
                        const { selectedComponentIds } = useEditorStore.getState();
                        if (selectedComponentIds.size > 1) {
                          const selectedComponents = activeComponents.filter(c => selectedComponentIds.has(c.id));
                          const componentTypes = new Set(selectedComponents.map(c => c.type));
                          const isSameType = componentTypes.size === 1;
                          if (isSameType) {
                            return (
                              <MultiComponentSettingsEditor
                                components={selectedComponents}
                                onUpdate={(componentId, updates) => {
                                  if (currentSlide) {
                                    handleComponentUpdate(componentId, updates);
                                  }
                                }}
                                onDelete={() => {
                                  selectedComponents.forEach(comp => {
                                    const isBackground = comp.type === 'Background' || 
                                                       (comp.id && comp.id.toLowerCase().includes('background'));
                                    if (!isBackground && currentSlide) {
                                      removeComponent(comp.id, false);
                                    }
                                  });
                                  useEditorStore.getState().clearSelection();
                                }}
                              />
                            );
                          }
                          return (
                            <div className="p-4 space-y-4">
                              <div className="text-sm font-medium">{selectedComponentIds.size} components selected (mixed types)</div>
                              <div className="space-y-2">
                                <button
                                  className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90"
                                  onClick={() => { if (currentSlide) { useEditorStore.getState().groupSelectedComponents(currentSlide.id); } }}
                                >
                                  Group Selection
                                </button>
                                <div className="grid grid-cols-2 gap-2">
                                  <button className="px-3 py-2 text-sm bg-secondary rounded-md hover:bg-secondary/80" onClick={() => { if (currentSlide) { useEditorStore.getState().alignSelectedComponents(currentSlide.id, 'left'); } }}>Align Left</button>
                                  <button className="px-3 py-2 text-sm bg-secondary rounded-md hover:bg-secondary/80" onClick={() => { if (currentSlide) { useEditorStore.getState().alignSelectedComponents(currentSlide.id, 'right'); } }}>Align Right</button>
                                </div>
                                {selectedComponentIds.size >= 3 && (
                                  <button className="w-full px-3 py-2 text-sm bg-secondary rounded-md hover:bg-secondary/80" onClick={() => { if (currentSlide) { useEditorStore.getState().distributeSelectedComponents(currentSlide.id, 'horizontal'); } }}>Distribute Horizontally</button>
                                )}
                              </div>
                            </div>
                          );
                        } else {
                          return (
                            <ComponentSettingsEditor
                              component={selectedComponent}
                              onUpdate={(updates) => {
                                if (selectedComponent && currentSlide) {
                                  handleComponentUpdate(selectedComponent.id, updates);
                                }
                              }}
                              onDelete={() => {
                                if (selectedComponent && currentSlide) {
                                  const isBackgroundComponent = selectedComponent.type === 'Background' || (selectedComponent.id && selectedComponent.id.toLowerCase().includes('background'));
                                  if (isBackgroundComponent) {
                                    toast({ title: "Cannot Delete Background", description: "Background components cannot be removed", duration: 2000, variant: "destructive" });
                                    return;
                                  }
                                  const componentId = selectedComponent.id;
                                  setSelectedComponentId(null);
                                  removeComponent(componentId, false);
                                }
                              }}
                            />
                          );
                        }
                      })()}
                    </div>
                  </>
                )}
              </motion.div>
            )}
          </AnimatePresence>
    </div>
  );
};

export default SlideViewport;
