import React, { useRef, useEffect, useCallback, useState, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { BROWSER } from '@/utils/browser';
import { runWhenIdle } from '@/utils/scheduler';
import { ChevronLeft, ChevronRight, Maximize2, Presentation } from 'lucide-react';
import { usePresentationStore } from '@/stores/presentationStore';
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
import { updateSelectionDirectly } from '@/yjs/utils/cursorUtils';

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
import { useIsMobile } from '@/hooks/use-mobile';
import { useSlideViewportSize } from './viewport/useSlideViewportSize';
import { clampZoom, ZOOM_STEP } from '@/utils/zoom';
import { usePreventMobileZoom, MOBILE_SLIDE_GUARD_STYLE, preventSafariGestureZoom } from '@/hooks/usePreventMobileZoom';

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
  const isMobileView = useIsMobile();
  const enterPresentation = usePresentationStore(state => state.enterPresentation);
  const viewportRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const currentSlide = slides[currentSlideIndex];
  // Note: The viewport element already contains the chrome (controls bar, slide control bar)
  // and the computeSlideSize function adds its own padding. We don't need additional reserved height
  // as that was double-counting space and making slides too small.
  const { width: slideWidth, height: slideHeight } = useSlideViewportSize(viewportRef);

  // Add ref for the scrollable container
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const slideAreaRef = useRef<HTMLDivElement>(null);

  // Yjs context for collaboration is initialized below

  // Get data and functions from ActiveSlideContext
  const { activeComponents, updateComponent, removeComponent, addComponent } = useActiveSlide();

  // Get editing capability from editor hook
  const { isEditing: isEditingMode, setIsEditing } = useEditor();

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

  // Mobile stability: keep zoom fixed at 100 to avoid reflow loops / tiny initial renders.
  useEffect(() => {
    if (!isMobileView) return;
    if (zoomLevel !== 100) {
      setZoomLevel(100);
    }
  }, [isMobileView, setZoomLevel, zoomLevel]);

  // Prevent native browser zoom on mobile – pinch-to-zoom on heavy slide DOM crashes the tab
  usePreventMobileZoom();
  useEffect(() => {
    if (!BROWSER.isMobile) return;
    const el = viewportRef.current;
    if (!el) return;
    return preventSafariGestureZoom(el);
  }, []);

  const zoomScale = zoomLevel / 100;
  const scaledSlideWidth = Math.max(1, Math.round(slideWidth * zoomScale));
  const scaledSlideHeight = Math.max(1, Math.round(slideHeight * zoomScale));
  // Controls bar is hidden on mobile when not editing
  const topBarHeight = currentSlide && (!isMobileView || isEditing) ? 48 : 0;
  const bottomBarHeight = slides.length > 0 ? 56 : 0;
  const chromeHeight = topBarHeight + bottomBarHeight;
  const canvasHeight = Math.max(1, scaledSlideHeight + chromeHeight);

  const [showCommentsPanel, setShowCommentsPanel] = useState(false);
  const supportsGestureEvents = BROWSER.isSafari || BROWSER.isIOS;

  // Use group keyboard shortcuts
  useGroupKeyboardShortcuts();

  const zoomLevelRef = useRef(zoomLevel);
  const previousZoomRef = useRef(zoomLevel);
  const skipExternalZoomRef = useRef(false);

  useEffect(() => {
    zoomLevelRef.current = zoomLevel;
  }, [zoomLevel]);

  const getViewportCenter = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
  }, []);

  const getZoomAnchor = useCallback((clientX: number, clientY: number) => {
    const container = scrollContainerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    const isInside = clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
    if (!isInside) {
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    }
    return { x: clientX, y: clientY };
  }, []);

  const normalizeWheelDelta = useCallback((deltaY: number, deltaMode?: number) => {
    let normalized = deltaY;
    if (deltaMode === 1) normalized *= 16;
    else if (deltaMode === 2) normalized *= window.innerHeight;
    return normalized;
  }, []);

  const adjustScrollForZoom = useCallback((currentZoom: number, nextZoom: number, anchor?: { x: number; y: number } | null) => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    const anchorX = anchor?.x ?? rect.left + rect.width / 2;
    const anchorY = anchor?.y ?? rect.top + rect.height / 2;
    const offsetX = anchorX - rect.left;
    const offsetY = anchorY - rect.top;

    const currentScale = currentZoom / 100;
    const nextScale = nextZoom / 100;
    if (!Number.isFinite(currentScale) || currentScale <= 0) return;

    const contentX = container.scrollLeft + offsetX;
    const contentY = container.scrollTop + offsetY;
    const scaleRatio = nextScale / currentScale;

    const nextContentX = contentX * scaleRatio;
    const nextContentY = contentY * scaleRatio;

    requestAnimationFrame(() => {
      container.scrollLeft = nextContentX - offsetX;
      container.scrollTop = nextContentY - offsetY;
    });
  }, []);

  const zoomTo = useCallback((nextZoom: number, anchor?: { x: number; y: number } | null) => {
    const currentZoom = zoomLevelRef.current;
    const clampedZoom = clampZoom(nextZoom);
    if (clampedZoom === currentZoom) return;

    skipExternalZoomRef.current = true;
    zoomLevelRef.current = clampedZoom;
    setZoomLevel(clampedZoom);
    adjustScrollForZoom(currentZoom, clampedZoom, anchor);
    previousZoomRef.current = clampedZoom;
  }, [adjustScrollForZoom, clampZoom, setZoomLevel]);

  useEffect(() => {
    const scrollContainer = scrollContainerRef.current;
    if (!scrollContainer) return;

    // SKIP ALL CUSTOM ZOOM HANDLERS ON MOBILE
    // The native browser zoom or a simplified mobile-specific handler should be used instead
    // Attempting to manually handle touch/gesture events for zoom on mobile is causing crashes
    if (isMobileView) return;

    const pinchState = { initialDistance: 0, initialZoom: zoomLevelRef.current };
    let gestureInitialZoom = zoomLevelRef.current;

    const handleWheel = (e: WheelEvent) => {
      // ... same logic as before, just wrapped in the effect ...
      // Keeping existing implementation for desktop
      const target = e.target as HTMLElement | null;
      const guardEl = target && typeof target.closest === 'function' ? (target.closest('[data-scroll-guard="true"]') as HTMLElement | null) : null;
      if (guardEl && !(e.ctrlKey || e.metaKey)) {
        const maxScrollTop = guardEl.scrollHeight - guardEl.clientHeight;
        let deltaY = e.deltaY;
        const dm = (e as any).deltaMode;
        if (dm === 1) deltaY *= 16;
        else if (dm === 2) deltaY *= guardEl.clientHeight;

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
        return;
      }

      if (e.ctrlKey || e.metaKey) return;
    };

    const handleTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const [touch1, touch2] = e.touches;
        pinchState.initialDistance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        pinchState.initialZoom = zoomLevelRef.current;
      }
    };

    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault();
        const [touch1, touch2] = e.touches;
        const distance = Math.hypot(
          touch2.clientX - touch1.clientX,
          touch2.clientY - touch1.clientY
        );
        const scale = pinchState.initialDistance ? distance / pinchState.initialDistance : 1;
        const nextZoom = Math.round(pinchState.initialZoom * scale);
        const center = {
          x: (touch1.clientX + touch2.clientX) / 2,
          y: (touch1.clientY + touch2.clientY) / 2
        };
        zoomTo(nextZoom, center);
      }
    };

    const handleWindowWheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      e.stopPropagation();
      const deltaY = normalizeWheelDelta(e.deltaY, e.deltaMode);
      const zoomFactor = Math.exp(-deltaY * 0.002);
      const nextZoom = Math.round(zoomLevelRef.current * zoomFactor);
      zoomTo(nextZoom, getZoomAnchor(e.clientX, e.clientY));
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
      zoomTo(nextZoom, getViewportCenter());
    };

    const handleWindowGestureEnd = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
    };

    scrollContainer.addEventListener('wheel', handleWheel, { passive: false });
    // Only setup desktop zoom handlers
    scrollContainer.addEventListener('touchstart', handleTouchStart, { passive: true });
    scrollContainer.addEventListener('touchmove', handleTouchMove, { passive: false });

    window.addEventListener('wheel', handleWindowWheel, { passive: false, capture: true });
    if (supportsGestureEvents) {
      window.addEventListener('gesturestart', handleWindowGestureStart as EventListener, { passive: false, capture: true });
      window.addEventListener('gesturechange', handleWindowGestureChange as EventListener, { passive: false, capture: true });
      window.addEventListener('gestureend', handleWindowGestureEnd as EventListener, { passive: false, capture: true });
    }

    return () => {
      scrollContainer.removeEventListener('wheel', handleWheel as EventListener);
      scrollContainer.removeEventListener('touchstart', handleTouchStart as EventListener);
      scrollContainer.removeEventListener('touchmove', handleTouchMove as EventListener);

      window.removeEventListener('wheel', handleWindowWheel, { capture: true });
      if (supportsGestureEvents) {
        window.removeEventListener('gesturestart', handleWindowGestureStart as EventListener, { capture: true });
        window.removeEventListener('gesturechange', handleWindowGestureChange as EventListener, { capture: true });
        window.removeEventListener('gestureend', handleWindowGestureEnd as EventListener, { capture: true });
      }
    };
  }, [getViewportCenter, getZoomAnchor, normalizeWheelDelta, supportsGestureEvents, zoomTo, isMobileView]);

  useEffect(() => {
    const previousZoom = previousZoomRef.current;
    if (previousZoom === zoomLevel) return;

    if (skipExternalZoomRef.current) {
      skipExternalZoomRef.current = false;
      previousZoomRef.current = zoomLevel;
      return;
    }

    adjustScrollForZoom(previousZoom, zoomLevel, getViewportCenter());
    previousZoomRef.current = zoomLevel;
  }, [adjustScrollForZoom, getViewportCenter, zoomLevel]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data as any;
      if (!data || data.source !== 'ns-slide-zoom') return;
      // IMPORTANT: ignore zoom relays on mobile; they can trigger rapid zoom updates + huge relayouts
      // (especially when interacting with iframed components), which has been crashing the app.
      if (isMobileView) return;

      const anchor = (typeof data.clientX === 'number' && typeof data.clientY === 'number')
        ? getZoomAnchor(data.clientX, data.clientY)
        : getViewportCenter();

      if (data.method === 'wheel' && typeof data.deltaY === 'number') {
        const deltaY = normalizeWheelDelta(data.deltaY, data.deltaMode);
        const zoomFactor = Math.exp(-deltaY * 0.002);
        const nextZoom = Math.round(zoomLevelRef.current * zoomFactor);
        zoomTo(nextZoom, anchor);
      } else if (data.method === 'gesture' && typeof data.scale === 'number') {
        const nextZoom = Math.round(zoomLevelRef.current * data.scale);
        zoomTo(nextZoom, anchor);
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [getViewportCenter, getZoomAnchor, isMobileView, normalizeWheelDelta, zoomTo]);

  // Add keyboard shortcuts for zooming
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isZoomShortcut = (e.ctrlKey || e.metaKey) && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '0');

      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');

      if ((isInput || isContentEditable || isTextEditing) && !isZoomShortcut) return;

      if (e.ctrlKey || e.metaKey) {
        if (e.key === '+' || e.key === '=') {
          e.preventDefault();
          zoomTo(zoomLevelRef.current + ZOOM_STEP, getViewportCenter());
        } else if (e.key === '-') {
          e.preventDefault();
          zoomTo(zoomLevelRef.current - ZOOM_STEP, getViewportCenter());
        } else if (e.key === '0') {
          e.preventDefault();
          zoomTo(100, getViewportCenter());
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [getViewportCenter, isTextEditing, zoomTo]);

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

  // Ctrl/Cmd+Shift+C shortcut to toggle comments panel
  React.useEffect(() => {
    const handleCommentsShortcut = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'C') {
        e.preventDefault();
        setShowCommentsPanel(v => !v);
      }
    };
    document.addEventListener('keydown', handleCommentsShortcut, true);
    return () => document.removeEventListener('keydown', handleCommentsShortcut, true);
  }, []);

  // Prevent iframes from stealing focus in view mode — keyboard shortcuts like 'e'
  // fire on the parent document, but iframes create a separate browsing context that
  // swallows keydown events. Pull focus back whenever an iframe grabs it.
  React.useEffect(() => {
    if (isMobileView) return;
    const handleWindowBlur = () => {
      // When the window loses focus, check if it went to an iframe inside the slide
      // (document.activeElement will be the <iframe>). In view mode, yank focus back.
      requestAnimationFrame(() => {
        const active = document.activeElement;
        if (active?.tagName === 'IFRAME' && !isEditingMode) {
          (active as HTMLElement).blur();
          document.body.focus();
        }
      });
    };
    window.addEventListener('blur', handleWindowBlur);
    return () => window.removeEventListener('blur', handleWindowBlur);
  }, [isEditingMode, isMobileView]);

  // Add keyboard shortcut 'e' to toggle edit mode
  React.useEffect(() => {
    if (isMobileView) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      // Skip shortcuts when in text editing mode or in input elements
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');

      // If in a text input field OR text editing mode, don't process shortcuts
      if (isInput || isContentEditable || isTextEditing) return;

      // Don't toggle edit mode when in presentation mode
      if (document.body.classList.contains('presentation-mode')) return;

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
  }, [isEditingMode, isTextEditing, setIsEditing, isCurrentSlideCompleted, isMobileView]);

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

  // Get selection update function from Yjs context (may be a no-op when store-backed collaboration is active).
  const { updateSelection } = useYjs();

  // Cursor tracking is now handled by the cursor components

  const broadcastSelection = useCallback((componentIds: string[]) => {
    if (!currentSlide) return;

    // Keep context provider path working for legacy views.
    try {
      updateSelection(currentSlide.id, componentIds);
    } catch {
      // Silent: context may be detached in store-backed mode.
    }

    // Always broadcast through global/store-backed awareness as fallback.
    updateSelectionDirectly(currentSlide.id, componentIds);
  }, [currentSlide, updateSelection]);

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
    broadcastSelection([component.id]);
  };

  const handleComponentDeselect = () => {
    setSelectedComponentId(null);

    // Clear selection for other users
    broadcastSelection([]);
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
  // In edit mode, auto-select CustomComponent to show image editing panel
  React.useEffect(() => {
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

      // Auto-select CustomComponent when in edit mode for quick image editing
      if (isEditing && currentSlide?.components) {
        // Find the first CustomComponent on the slide
        const customComponent = currentSlide.components.find(c => c.type === 'CustomComponent');
        if (customComponent) {
          // Select the CustomComponent to show its settings panel with images expanded
          setSelectedComponentId(customComponent.id);
          try {
            useEditorStore.getState().clearSelection();
            useEditorStore.getState().selectComponent(customComponent.id);
          } catch { }
        } else {
          // No CustomComponent, clear selection
          setSelectedComponentId(null);
          try { useEditorStore.getState().clearSelection(); } catch { }
        }
      } else {
        // Not in edit mode, clear selection
        setSelectedComponentId(null);
        try { useEditorStore.getState().clearSelection(); } catch { }
      }
    }, 10);

    return () => clearTimeout(timeoutId);
  }, [currentSlideIndex, isEditing, currentSlide?.id]);

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

  // Mobile: tap on slide to enter fullscreen presentation mode
  const handleMobileSlideTap = React.useCallback((e: React.MouseEvent) => {
    if (!isMobileView || isEditing) return;
    // Don't trigger on interactive elements or control bar buttons
    const target = e.target as HTMLElement;
    if (target.closest('button, input, textarea, [contenteditable], select, a')) return;
    // Only trigger if tapping within the slide display area
    if (!target.closest('[data-slide-viewport="true"]')) return;
    enterPresentation();
  }, [isMobileView, isEditing, enterPresentation]);

  return (
    <div
      ref={viewportRef}
      data-slide-viewport="true"
      className="flex-1 relative overflow-hidden flex items-center justify-center max-w-full w-full h-full bg-background"
      onClick={handleViewportClick}
      tabIndex={-1}
      style={BROWSER.isMobile ? MOBILE_SLIDE_GUARD_STYLE : undefined}
    >
      {/* Waiting Game Overlay */}
      <GenerationGameOverlay isVisible={showWaitingGame} />

      <ZoomIndicator />

      {/* Scrollable Container */}
      <div
        ref={scrollContainerRef}
        className="absolute inset-0"
        style={{
          overflow: zoomLevel > 100 ? 'auto' : 'hidden',
          scrollbarWidth: zoomLevel > 100 ? 'thin' : 'none',
          scrollbarColor: 'rgba(155, 155, 155, 0.5) transparent',
          overscrollBehavior: 'contain',
        }}
      >
        {/* Canvas wrapper - centers content and provides scroll area when zoomed */}
        {/* On mobile, position slide near top with minimal padding */}
        <div
          className={`relative flex justify-center ${isMobileView ? 'items-start pt-3' : 'items-center'}`}
          style={{
            minWidth: '100%',
            minHeight: '100%',
            width: `${scaledSlideWidth}px`,
            height: `${canvasHeight}px`,
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
              width: `${scaledSlideWidth}px`,
              pointerEvents: 'auto',
              willChange: 'transform',
            }}
          >
            {/* Controls bar - ABOVE the slide, left-aligned - hide on mobile when not editing */}
            {(!isMobileView || isEditing) && (
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

                {/* Spacer */}
                <div className="flex-1" />
              </div>
            )}

            {/* On mobile: tappable slide area that enters fullscreen presentation */}
            <div
              ref={slideAreaRef}
              className="relative"
              onClick={isMobileView && !isEditing ? handleMobileSlideTap : undefined}
              style={isMobileView && !isEditing ? { cursor: 'pointer' } : undefined}
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
                slideWidth={slideWidth}
                slideHeight={slideHeight}
                deckStatus={deckStatus}
                isNewDeck={isNewDeck}
              />

              {/* Mobile fullscreen hint icon */}
              {isMobileView && !isEditing && currentSlide && isCurrentSlideCompleted && (
                <div className="absolute top-2 right-2 z-10 pointer-events-none">
                  <div className="flex items-center gap-1 px-2 py-1 rounded-md bg-black/50 backdrop-blur-sm">
                    <Maximize2 className="w-3.5 h-3.5 text-white/80" />
                    <span className="text-[10px] text-white/80 font-medium">Tap to present</span>
                  </div>
                </div>
              )}
              {/* Comment pins overlay - inside slide area for correct positioning */}
              {currentSlide && (
                <CommentPinsOverlay
                  deckId={deckUuid}
                  slideId={currentSlide.id}
                  containerRef={slideAreaRef}
                  zoomLevel={zoomLevel}
                  getCollaborators={getCollaborators}
                />
              )}
            </div>

            {/* Cursor overlays */}
            {currentSlide && (
              <SimpleCursors
                slideId={currentSlide.id}
                containerRef={scrollContainerRef}
                offsetY={24}
                zoomLevel={zoomLevel}
              />
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
                height: isMobileView ? '42vh' : '74vh',
                maxHeight: isMobileView ? '42vh' : '635px',
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

      {/* Mobile Present Button moved to SlideControlBar */}
    </div>
  );
};

export default SlideViewport;
