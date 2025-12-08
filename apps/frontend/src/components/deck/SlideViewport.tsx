import React, { useRef, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { BROWSER } from '@/utils/browser';
import { runWhenIdle } from '@/utils/scheduler';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SlideData } from '@/types/SlideTypes';
import { ComponentInstance } from '@/types/components';
import SlideContainer from './viewport/SlideContainer';
import ComponentToolbar from './viewport/ComponentToolbar';
import { motion, AnimatePresence } from 'framer-motion';
import ComponentSettingsEditor from '@/components/ComponentSettingsEditor';
import MultiComponentSettingsEditor from '@/components/MultiComponentSettingsEditor';
import { useEditor } from '@/hooks/useEditor';
import { useActiveSlide } from '@/context/ActiveSlideContext';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useEditorStore } from '@/stores/editorStore';
import { useEditorSettingsStore } from '@/stores/editorSettingsStore';
import { copyToClipboard, pasteFromClipboard, extractTextFromComponent, copyTextToSystemClipboard } from '@/utils/clipboardUtils';
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
import { useCustomComponentEditStore } from '@/stores/customComponentEditStore';
import { CommentsPanel } from './CommentsPanel';

// Lazy load the waiting game
import GenerationGameOverlay from '@/components/common/GenerationGameOverlay';

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
  const [showWaitingGame, setShowWaitingGame] = useState(false);
  const [isMobileView, setIsMobileView] = useState(false);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Detect mobile view for responsive editor panel
  useEffect(() => {
    const checkMobile = () => {
      setIsMobileView(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    window.addEventListener('orientationchange', checkMobile);
    return () => {
      window.removeEventListener('resize', checkMobile);
      window.removeEventListener('orientationchange', checkMobile);
    };
  }, []);

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
        const newEditingState = !isEditingMode;

        // CRITICAL: If exiting edit mode, save draft changes FIRST
        if (!newEditingState && isEditingMode) {
          const applyDraftChanges = useEditorStore.getState().applyDraftChanges;
          applyDraftChanges();

          setTimeout(() => {
            setIsEditing(newEditingState);
          }, 0);
        } else {
          setIsEditing(newEditingState);
        }

        // Also dispatch the force event for redundancy
        if (newEditingState) {
          window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        }
      }
    };

    // Handle toggle edit mode event
    const handleToggleEditMode = () => {
      if (isCurrentSlideCompleted) {
        const newEditingState = !isEditingMode;

        // CRITICAL: If exiting edit mode, save draft changes FIRST before toggling
        // This prevents showing old component state during the transition
        if (!newEditingState && isEditingMode) {
          const applyDraftChanges = useEditorStore.getState().applyDraftChanges;
          applyDraftChanges();

          // Small delay to ensure draft changes are applied before switching view mode
          setTimeout(() => {
            setIsEditing(newEditingState);
          }, 0);
        } else {
          // Entering edit mode - toggle immediately
          setIsEditing(newEditingState);
        }

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

    // Add event listeners - use document with capture to catch events before iframes
    document.addEventListener('keydown', handleKeyDown, true);
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
      document.removeEventListener('keydown', handleKeyDown, true);
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
          // Keep internal clipboard for paste within app
          copyToClipboard(selectedComponent);

          // Also copy text content to system clipboard
          const textContent = extractTextFromComponent(selectedComponent);
          if (textContent) {
            copyTextToSystemClipboard(textContent);
            toast({
              title: "Content Copied",
              description: "Text content copied to clipboard",
              duration: 2000,
            });
          } else {
            toast({
              title: "Component Copied",
              description: `${selectedComponent.type} copied (no text content)`,
              duration: 2000,
            });
          }
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
    // If we're currently in text editing mode and selecting a different component,
    // exit text editing to avoid sticky editor state carrying into the next selection
    try {
      const settingsStore = useEditorSettingsStore.getState();
      if (settingsStore.isTextEditing && component.id !== selectedComponentId) {
        // Attempt to blur the active editor (if any) before leaving edit mode
        try { useEditorStore.getState().activeTiptapEditor?.commands?.blur?.(); } catch { }
        settingsStore.setTextEditing(false);
      }
    } catch { }

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
    // Request HTML update from any active custom component iframe before exiting
    // This ensures layer reorders and other DOM changes are persisted
    const { iframeRef, activeComponentId } = useCustomComponentEditStore.getState();
    if (iframeRef?.current?.contentWindow && activeComponentId) {
      iframeRef.current.contentWindow.postMessage({
        target: 'ns-custom-component-edit',
        type: 'get-html',
      }, '*');
      // Small delay to allow HTML update to process before exiting
      setTimeout(() => {
        setIsEditing(false);
      }, 100);
    } else {
      setIsEditing(false);
    }
  };

  // Deselect components and exit text editing when changing slides
  React.useEffect(() => {
    // Clear local selection
    setSelectedComponentId(null);

    // Clear global multi-selection
    try { useEditorStore.getState().clearSelection(); } catch { }

    // Exit text editing and blur active editor if present
    // Add a small delay to allow any pending text saves to complete
    const timeoutId = setTimeout(() => {
      try {
        const settings = useEditorSettingsStore.getState();
        if (settings.isTextEditing) {
          // First blur the editor (this will trigger save in TiptapTextBlockRenderer)
          try {
            const editor = useEditorStore.getState().activeTiptapEditor;
            if (editor && !editor.isDestroyed) {
              editor.commands.blur();
            }
          } catch { }

          // Then clear the text editing state after a small delay
          setTimeout(() => {
            settings.setTextEditing(false);
          }, 50);
        }
      } catch { }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [currentSlideIndex]);

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
      } catch { }
      // Close game when deck is complete
      setShowWaitingGame(false);
    };
    window.addEventListener('deck_generation_complete', handleDeckComplete);
    window.addEventListener('deck_complete', handleDeckComplete);
    return () => {
      window.removeEventListener('deck_generation_complete', handleDeckComplete);
      window.removeEventListener('deck_complete', handleDeckComplete);
    };
  }, []);

  // Listen for waiting game toggle events
  React.useEffect(() => {
    const handleShowGame = () => setShowWaitingGame(true);
    const handleHideGame = () => setShowWaitingGame(false);
    window.addEventListener('show-waiting-game', handleShowGame);
    window.addEventListener('hide-waiting-game', handleHideGame);
    return () => {
      window.removeEventListener('show-waiting-game', handleShowGame);
      window.removeEventListener('hide-waiting-game', handleHideGame);
    };
  }, []);

  // No duplicate useEffect needed since we're using React's onMouseMove handler

  // Get the actual slide data for the current index
  const currentSlideData = slides && slides.length > currentSlideIndex ? slides[currentSlideIndex] : null;

  // Debug log for the specific slide data being used for SlideDisplay
  if (currentSlideData) {

  }

  // Handle click on viewport to refocus main document (pull focus out of iframes)
  const handleViewportClick = React.useCallback((e: React.MouseEvent) => {
    // Only refocus if clicking directly on the viewport background or slide container
    // Don't interfere with interactive elements
    const target = e.target as HTMLElement;
    const isInteractive = target.closest('button, input, textarea, [contenteditable], select, a');
    if (!isInteractive) {
      // Pull focus back to main document so keyboard shortcuts work
      (document.activeElement as HTMLElement)?.blur?.();
    }
  }, []);

  return (
    <div
      ref={viewportRef}
      className="flex-1 relative overflow-hidden flex items-center justify-center max-w-full w-full h-full bg-background"
      onClick={handleViewportClick}
      tabIndex={-1}
    >
      {/* Waiting Game Overlay */}
      <GenerationGameOverlay
        deckState={deckStatus?.state}
        startedAt={deckStatus?.startedAt}
        isVisibleOverride={showWaitingGame}
        currentSlideIndex={currentSlideIndex}
        totalSlides={totalSlides}
      />

      <ZoomIndicator />

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="absolute inset-0 overflow-auto"
        style={{
          scrollbarWidth: zoomLevel > 100 ? 'thin' : 'none',
          scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent',
        }}
      >
        {/* Canvas wrapper - centers content and provides scroll area when zoomed */}
        <div
          className="relative flex items-center justify-center"
          style={{
            minWidth: '100%',
            minHeight: '100%',
            // Only expand when zoomed in to allow scrolling
            width: zoomLevel > 100 ? `${zoomLevel}%` : '100%',
            height: zoomLevel > 100 ? `${zoomLevel}%` : '100%',
          }}
        >
          {/* Main content wrapper - shifts left and shrinks when editing (desktop only) */}
          <motion.div
            className="flex flex-col relative"
            initial={false}
            animate={{
              scale: isEditing ? (isMobileView ? 0.85 : 0.92) : 1,
              x: isEditing && !isMobileView ? -140 : 0, // Don't shift on mobile
              y: isEditing && isMobileView ? -20 : 0    // Slight upward shift on mobile for bottom panel
            }}
            transition={{
              duration: 0.18,
              ease: "easeOut"
            }}
            style={{
              zIndex: 40,
              pointerEvents: 'auto',
              willChange: 'transform',
            }}
          >
            {/* Controls bar - ABOVE the slide, left-aligned */}
            <div
              className="h-10 mb-2 flex items-center w-full"
              style={{ position: 'relative', zIndex: 50000 }}
            >
              {/* Toolbar on left - only in edit mode */}
              {isEditing && currentSlide && (
                <ComponentToolbar
                  slideId={currentSlide.id}
                  onComponentSelected={(componentId) => {
                    if (componentId) {
                      const component = activeComponents.find(c => c.id === componentId);
                      if (component) {
                        handleComponentSelect(component);
                      }
                    } else {
                      handleComponentDeselect();
                    }
                  }}
                />
              )}

              {/* Spacer when not editing */}
              {!isEditing && <div className="flex-1" />}

              {/* Edit/Done button on right - always rendered for tour visibility */}
              {currentSlide && (
                <button
                  className="px-3 py-1.5 text-xs font-semibold rounded-md border border-[#FF4301]/40 bg-white/80 dark:bg-zinc-900/80 hover:bg-[#FF4301]/10 hover:border-[#FF4301] text-[#FF4301] shadow-sm transition-all duration-200 hover:shadow-md disabled:opacity-50 disabled:cursor-not-allowed backdrop-blur-sm ml-auto"
                  style={{
                    fontFamily: '"HK Grotesk Wide", "Hanken Grotesk", sans-serif',
                    fontWeight: 600,
                    letterSpacing: '0.3px'
                  }}
                  data-tour="edit-button"
                  onClick={() => {
                    window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
                  }}
                  disabled={!isCurrentSlideCompleted}
                >
                  {isEditing ? 'Done' : 'Edit'}
                </button>
              )}
            </div>

            {/* Zoom Container - ONLY the slide zooms */}
            <div
              ref={zoomContainerRef}
              style={{
                transform: `scale(${zoomLevel / 100})`,
                transformOrigin: 'top center',
                transition: 'transform 0.1s ease-out',
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
                zoomLevel={zoomLevel}
                deckStatus={deckStatus}
                isNewDeck={isNewDeck}
              />
            </div>

            {/* Cursor overlays */}
            {currentSlide && (
              <>
                <SimpleCursors
                  slideId={currentSlide.id}
                  containerRef={scrollContainerRef}
                  offsetY={24}
                  zoomLevel={zoomLevel}
                />
                <DirectCursors
                  slideId={currentSlide.id}
                  containerRef={scrollContainerRef}
                  offsetY={24}
                  zoomLevel={zoomLevel}
                />
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

      {/* Editor panel - PORTALED to document.body to ensure it's above all other portals */}
      {/* On mobile: bottom sheet. On desktop: right sidebar */}
      {typeof document !== 'undefined' && document.body && createPortal(
        <AnimatePresence>
          {isEditing && (
            <motion.div
              className={`fixed ${isMobileView ? 'bottom-0 left-0 right-0 rounded-t-2xl' : 'top-0 right-0'}`}
              style={{
                zIndex: 50000, // Above selection overlay (40000) but below modals/popovers
                width: isMobileView ? '100%' : '280px',
                height: isMobileView ? '50vh' : '74vh',
                maxHeight: isMobileView ? '50vh' : '635px',
                display: 'flex',
                flexDirection: 'column',
                backgroundColor: 'var(--background)',
                borderLeft: isMobileView ? 'none' : '1px solid var(--border)',
                borderTop: isMobileView ? '1px solid var(--border)' : 'none',
                pointerEvents: 'auto', // Ensure clicks go through
                boxShadow: isMobileView ? '0 -4px 20px rgba(0,0,0,0.15)' : '-4px 0 20px rgba(0,0,0,0.1)',
                isolation: 'isolate', // Creates a new stacking context
              }}
              // Only stop propagation at bubble phase to allow child interactions
              onClick={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onPointerDown={(e) => e.stopPropagation()}
              data-tour="properties-panel"
              data-settings-panel="true"
              initial={{ opacity: 0, ...(isMobileView ? { y: 100 } : { x: 50 }) }}
              animate={{ opacity: 1, x: 0, y: 0 }}
              exit={{ opacity: 0, ...(isMobileView ? { y: 100 } : { x: 50 }) }}
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
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
};

export default SlideViewport;
