import React, { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } from 'react';
import { useSearchParams, useParams, useLocation } from 'react-router-dom';
import ChatPanel from './ChatPanel';
import DeckPanel from './DeckPanel';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { useToast } from '@/hooks/use-toast';
import DeckHeader from './deck/DeckHeader';
import DeckSharing from './deck/DeckSharing';
import { createComponent } from "../utils/componentUtils";
import { useDeckStore } from '../stores/deckStore';
import { useEditorSettingsStore } from '../stores/editorSettingsStore';
import { useSlideNavigation } from '@/hooks/useSlideNavigation';
import { useEditor } from '@/hooks/useEditor';
import { NavigationProvider } from '@/context/NavigationContext';
import { EditorStateProvider } from '@/context/EditorStateContext';
import { ActiveSlideProvider, StaticActiveSlideProvider } from '@/context/ActiveSlideContext';
import { VersionHistoryProvider, useVersionHistory } from '@/context/VersionHistoryContext';
import { deckSyncService } from '@/lib/deckSyncService';
import VersionHistoryPanel from './VersionHistoryPanel';
import { DeckState } from '../stores/deckStoreTypes';
import { CollaborationWrapper } from '../yjs/CollaborationWrapper';
import { supabase } from '@/integrations/supabase/client';
import { RealtimeChannel } from '@supabase/supabase-js';

import { DeckStatus } from '@/types/DeckTypes';
import { SlideData } from '@/types/SlideTypes';
import type { ChatPanelProps } from './ChatPanel';
import PresentationMode from './deck/PresentationMode';
import { usePresentationStore } from '@/stores/presentationStore';
import { DEFAULT_SLIDE_WIDTH, DEFAULT_SLIDE_HEIGHT } from '@/utils/deckUtils';
import { normalizeSlideForRender } from '@/utils/slideNormalization';
import Slide from './Slide';
import { useSlideGenerationFlow } from './slide-editor/useSlideGenerationFlow';
import { useSlideImageAutomation } from './slide-editor/useSlideImageAutomation';
import QuickTipBubble from './common/QuickTipBubble';
import GuidedTour from './common/GuidedTour';
import DeckNotes from './deck/DeckNotes';
import { debugSlideImages } from '@/utils/debugSlideImages';
import { useOnboarding } from '@/context/OnboardingContext';
import { useIsMobile } from '@/hooks/use-mobile';

/**
 * SlideEditor content component that assumes all context providers are in place
 */
const SlideEditorContent: React.FC = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const isNewDeck = searchParams.get('new') === 'true';

  const [isChatCollapsed, setIsChatCollapsed] = useState(false);
  const [chatOpacity, setChatOpacity] = useState(1);
  const [hasSyncError, setHasSyncError] = useState(false);
  const [showQuickTip, setShowQuickTip] = useState(false);
  const [showTour, setShowTour] = useState(false);

  // Get onboarding state for tutorial and AI hints
  const { shouldShowTutorial, shouldShowAiHints, incrementTutorialViews, state: onboardingState } = useOnboarding();
  // Wait for auth to be ready before loading deck data.
  // Uses direct supabase client instead of useAuth() to avoid circular imports.
  const [isAuthLoading, setIsAuthLoading] = useState(true);
  useEffect(() => {
    supabase.auth.getSession().then(() => setIsAuthLoading(false));
  }, []);
  // Initialize with pending state for new decks
  const [deckStatus, setDeckStatus] = useState<DeckStatus | null>(() => {
    if (isNewDeck) {
      return {
        state: 'pending',
        progress: 0,
        message: 'Preparing to generate your presentation...',
        currentSlide: 0,
        totalSlides: 0,
        startedAt: new Date().toISOString()
      } as DeckStatus;
    }
    return null;
  });

  // Set initial system message for new decks
  useEffect(() => {
    if (isNewDeck && deckStatus?.state === 'pending') {
      setLastSystemMessageForChat({
        message: 'Preparing to generate your presentation...',
        metadata: {
          type: 'generation_status',
          state: 'pending',
          progress: 0,
          // Mark as streaming so ChatPanel replaces the welcome message
          isStreamingUpdate: true,
          stage: 'initialization'
        }
      });
    }
  }, []);

  // Guided tour trigger: open after ~5s if generating/creating and user hasn't seen it 2 times yet
  // Track whether we've already triggered the tour in this session to prevent double-triggering
  const tourTriggeredRef = useRef(false);

  useEffect(() => {
    // Don't trigger if onboarding state isn't loaded yet
    if (onboardingState === null) return;
    // Don't trigger if user has already seen the tour 2 times
    if (!shouldShowTutorial) return;
    // Don't trigger if we've already triggered in this session
    if (tourTriggeredRef.current) return;

    const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
    if (isGenerating) {
      const t = setTimeout(() => {
        if (!tourTriggeredRef.current) {
          tourTriggeredRef.current = true;
          setShowTour(true);
          // Increment the view count when tour is shown
          incrementTutorialViews();
        }
      }, 5000);
      return () => clearTimeout(t);
    }
  }, [deckStatus?.state, shouldShowTutorial, onboardingState, incrementTutorialViews]);

  // Editor controls (moved up so effects below can reference setIsEditing safely)
  const { isEditing, setIsEditing, undo, redo, canUndo, canRedo } = useEditor();
  const isMobile = useIsMobile();

  useEffect(() => {
    if (isMobile && isEditing) {
      setIsEditing(false);
    }
  }, [isMobile, isEditing, setIsEditing]);

  useEffect(() => {
    if (isMobile && isChatCollapsed) {
      setIsChatCollapsed(false);
    }
  }, [isMobile, isChatCollapsed]);

  const mobileContainerRef = useRef<HTMLDivElement>(null);
  const [mobileContainerHeight, setMobileContainerHeight] = useState(0);
  const [mobileChatHeight, setMobileChatHeight] = useState(0);
  const [isChatDragging, setIsChatDragging] = useState(false);
  const [showChatDragHint, setShowChatDragHint] = useState(false);
  const [hasShownChatDragHint, setHasShownChatDragHint] = useState(false);
  const chatHintStorageKey = 'ns-mobile-chat-handle-hint-shown';

  useEffect(() => {
    if (!isMobile) return;
    try {
      setHasShownChatDragHint(localStorage.getItem(chatHintStorageKey) === '1');
    } catch { }
  }, [isMobile]);

  useLayoutEffect(() => {
    if (!isMobile) return;
    const container = mobileContainerRef.current;
    if (!container) return;

    const update = () => {
      const nextHeight = container.getBoundingClientRect().height;
      if (nextHeight > 0) {
        setMobileContainerHeight(nextHeight);
      }
    };
    update();

    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => update());
    observer.observe(container);
    return () => observer.disconnect();
  }, [isMobile]);

  const clampValue = useCallback((value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  }, []);

  const minMobileChatHeight = useMemo(() => {
    if (!mobileContainerHeight) return 200;
    const scaled = Math.round(mobileContainerHeight * 0.40);
    return Math.max(220, Math.min(320, scaled));
  }, [mobileContainerHeight]);

  const maxMobileChatHeight = useMemo(() => {
    if (!mobileContainerHeight) return 420;
    // Allow chat to take up to 75% of screen height (leaving 25% for slide + arrows + handle)
    const maxByPercent = Math.round(mobileContainerHeight * 0.75);
    return Math.max(minMobileChatHeight + 120, maxByPercent);
  }, [mobileContainerHeight, minMobileChatHeight]);

  useEffect(() => {
    if (!isMobile || !mobileContainerHeight) return;
    // Initial chat height - keep slide + nav arrows visible with drag handle below them
    const initialHeight = clampValue(Math.round(mobileContainerHeight * 0.45), minMobileChatHeight, maxMobileChatHeight);
    setMobileChatHeight((prev) => {
      if (prev > 0) {
        return clampValue(prev, minMobileChatHeight, maxMobileChatHeight);
      }
      return initialHeight;
    });
  }, [isMobile, mobileContainerHeight, minMobileChatHeight, maxMobileChatHeight, clampValue]);

  const handleMobileChatHintDismiss = useCallback(() => {
    if (!showChatDragHint) return;
    setShowChatDragHint(false);
  }, [showChatDragHint]);

  const handleMobileFirstMessage = useCallback((message: string) => {
    if (!isMobile || hasShownChatDragHint) return;
    if (!message.trim()) return;
    setShowChatDragHint(true);
    setHasShownChatDragHint(true);
    try {
      localStorage.setItem(chatHintStorageKey, '1');
    } catch { }
  }, [hasShownChatDragHint, isMobile]);

  const handleChatHandlePointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (!isMobile) return;
    event.preventDefault();
    event.stopPropagation();
    handleMobileChatHintDismiss();

    const startY = event.clientY;
    const startHeight = mobileChatHeight;
    setIsChatDragging(true);

    const handleMove = (moveEvent: PointerEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = clampValue(startHeight + delta, minMobileChatHeight, maxMobileChatHeight);
      setMobileChatHeight(nextHeight);
    };

    const handleUp = () => {
      setIsChatDragging(false);
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
  }, [clampValue, handleMobileChatHintDismiss, isMobile, maxMobileChatHeight, minMobileChatHeight, mobileChatHeight]);

  // Allow starting the tour manually via header trigger
  useEffect(() => {
    const handleStart = () => {
      try { setIsEditing(false); } catch { }
      setShowTour(true);
    };
    window.addEventListener('tour:start', handleStart as EventListener);
    return () => window.removeEventListener('tour:start', handleStart as EventListener);
  }, [setIsEditing]);

  // AI hints are now provided by the onboarding context (shouldShowAiHints)

  // Ensure chat panel is visible for the chat step
  useEffect(() => {
    const openChat = () => {
      try { setIsChatCollapsed(false); } catch { }
    };
    window.addEventListener('tour:open-chat', openChat as EventListener);
    return () => window.removeEventListener('tour:open-chat', openChat as EventListener);
  }, []);

  // Allow forced exit from edit mode at any step
  useEffect(() => {
    const exitEdit = () => {
      try { setIsEditing(false); } catch { }
    };
    window.addEventListener('tour:exit-edit', exitEdit as EventListener);
    return () => window.removeEventListener('tour:exit-edit', exitEdit as EventListener);
  }, [setIsEditing]);

  // Guided tour fallback handled below after setIsEditing is available

  // Listen for deck_import_complete
  useEffect(() => {
    const handler = (e: CustomEvent) => {
      try {
        const deckIdFromEvent = e.detail?.deckId;
        const name = e.detail?.name || 'Imported deck';
        const activeDeckId = useDeckStore.getState().deckData?.uuid || deckIdFromEvent;
        if (!deckIdFromEvent || !activeDeckId || deckIdFromEvent !== activeDeckId) return;
        setLastSystemMessageForChat({
          message: `${name} imported successfully.`,
          metadata: {
            type: 'import_complete',
            isSystemEvent: true
          }
        });
      } catch { }
    };
    window.addEventListener('deck_import_complete', handler as EventListener);
    return () => window.removeEventListener('deck_import_complete', handler as EventListener);
  }, []);

  // If user opens the deck after import event fired, show one-time prompt using pending stash
  // Moved below to ensure deckData is initialized and changes are tracked
  const [realtimeChannel, setRealtimeChannel] = useState<RealtimeChannel | null>(null);
  const isUpdatingRef = useRef(false);
  const realtimeSetupRef = useRef(false);
  const lastProcessedUpdateRef = useRef<string>(''); // Track last update to prevent duplicates
  const lastMessageRef = useRef<string>(''); // Track last message to prevent duplicates
  const lastVersionRefetchTsRef = useRef<number>(0);
  const [lastSystemMessageForChat, setLastSystemMessageForChat] =
    useState<ChatPanelProps['newSystemMessage']>(null);
  const previousDeckStatusRef = useRef<DeckStatus | null>(null);
  const processedSlideIdsRef = useRef<Set<string>>(new Set()); // Track which slides have had images applied

  // Expose deck status globally for editor store to access
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__deckStatus = deckStatus;
    }
  }, [deckStatus]);

  const { toast } = useToast();
  const { isHistoryPanelOpen } = useVersionHistory();
  const { deckId } = useParams<{ deckId: string }>();

  // Reset all stores when switching to a different deck (router reuses same component instance)
  const prevDeckIdRef = useRef<string | undefined>(deckId);
  useEffect(() => {
    if (prevDeckIdRef.current && deckId && prevDeckIdRef.current !== deckId) {
      useDeckStore.getState().resetStore();
    }
    prevDeckIdRef.current = deckId;
  }, [deckId]);

  // Constants for panel management
  const CHAT_MIN_SIZE = 22; // Reduced from 22 to give more space to slides
  const COLLAPSE_THRESHOLD = 3;
  const TRANSITION_DURATION = 300; // milliseconds

  const deckData = useDeckStore(state => state.deckData);
  const updateDeckData = useDeckStore(state => state.updateDeckData);
  const updateSlide = useDeckStore(state => state.updateSlide);
  const addSlide = useDeckStore(state => state.addSlide);

  // Remove the automatic font optimization check since it should only trigger after generation
  // and only when there's actual overflow

  // Check deck data silently - store initialization handles loading
  useEffect(() => {
    // No need to log this on every render - store initializer handles it
  }, [deckData]);

  // Add beforeunload handler to ensure saves complete before navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      // Check if there are unsaved changes
      const deckData = useDeckStore.getState().deckData;
      const isSyncing = useDeckStore.getState().isSyncing;

      if (deckData && deckData.uuid && isSyncing) {
        // Prevent the default dialog and show custom message
        e.preventDefault();
        e.returnValue = 'Changes are still being saved. Are you sure you want to leave?';

        // Try to save synchronously (though this might not always complete)
        deckSyncService.saveDeck(deckData).catch(console.error);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, []);


  // Select sync states individually to avoid object reference issues
  const isSyncing = useDeckStore((state: DeckState) => state.isSyncing);
  const lastSyncTime = useDeckStore((state: DeckState) => state.lastSyncTime);
  const realtimeEnabled = true;

  const { currentSlideIndex, goToSlide, currentSlide } = useSlideNavigation();

  // Guided tour fallback: force edit mode when requested (now that setIsEditing is available)
  useEffect(() => {
    const handler = () => {
      try { setIsEditing(true); } catch { }
      try {
        window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
        window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
      } catch { }
    };
    window.addEventListener('tour:force-edit', handler as EventListener);
    return () => window.removeEventListener('tour:force-edit', handler as EventListener);
  }, [setIsEditing]);

  // Function to fetch latest deck data
  const lastFetchTimeRef = useRef<number>(0);
  const fetchLatestDeck = useCallback(async () => {
    if (!deckId) return;

    // Prevent fetching too frequently (minimum 2 seconds between fetches)
    const now = Date.now();
    if (now - lastFetchTimeRef.current < 2000) {
      console.log('[fetchLatestDeck] Skipping - too soon since last fetch');
      return;
    }
    lastFetchTimeRef.current = now;

    try {
      console.log('[fetchLatestDeck] Fetching deck:', deckId);
      const deck = await deckSyncService.getFullDeck(deckId);

      if (deck && deck.slides) {
        let slides = deck.slides;

        if (Array.isArray(slides) && slides.length > 0) {
          console.log('[fetchLatestDeck] Got deck with slides:', {
            slideCount: slides.length,
            firstSlideComponents: slides[0]?.components?.length || 0
          });

          const currentDeckData = useDeckStore.getState().deckData;

          // Calculate total component count
          const currentComponentCount = currentDeckData.slides.reduce((sum, s) => sum + (s.components?.length || 0), 0);
          const newComponentCount = slides.reduce((sum: number, s: any) => sum + ((s as any).components?.length || 0), 0);

          // Always update during generation to ensure we get the latest slides
          const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';

          if (currentComponentCount === 0 || newComponentCount > currentComponentCount || slides.length > currentDeckData.slides.length || isGenerating) {
            console.log('[fetchLatestDeck] Updating slides:', {
              currentComponents: currentComponentCount,
              newComponents: newComponentCount,
              slideCount: slides.length,
              isGenerating
            });

            useDeckStore.getState().updateDeckData({
              ...currentDeckData,
              uuid: currentDeckData.uuid || deckId,
              // Ensure deck name is kept in sync from server (which may already apply outline title)
              name: deck.name || currentDeckData.name,
              slides: slides as unknown as SlideData[]
            }, { skipBackend: true, isRealtimeUpdate: true });

            // Apply images immediately to newly added slides (if auto-select is enabled)
            // Check ALL slides, not just count difference (handles batched updates)
            const autoSelectImages = (window as any).__slideGenerationPreferences?.autoSelectImages;
            if (autoSelectImages) {
              const newSlides: Array<{ slide: any, index: number }> = [];

              // Find slides that haven't been processed yet
              for (let i = 0; i < slides.length; i++) {
                const slide = slides[i] as any;
                if (slide && slide.id && !processedSlideIdsRef.current.has(slide.id)) {
                  // Check if slide has Image components with placeholder src that need images
                  const hasPlaceholderImages = slide.components?.some((c: any) => {
                    if (c.type !== 'Image') return false;
                    const src = c.props?.src || '';
                    const isPlaceholder = !src || src === 'placeholder' || src === '/placeholder.svg';
                    // Check searchQuery in multiple places (AI may put it in props directly or metadata)
                    const hasSearchQuery = c.props?.searchQuery || c.props?.metadata?.searchQuery || c.props?.metadata?.topic || c.props?.alt;
                    return isPlaceholder && hasSearchQuery;
                  });

                  if (hasPlaceholderImages) {
                    newSlides.push({ slide, index: i });
                    processedSlideIdsRef.current.add(slide.id);
                  }
                }
              }

              if (newSlides.length > 0) {
                console.log(`[fetchLatestDeck] ${newSlides.length} new slide(s) with images detected, applying...`);

                // Import and use SlideImageUpdater
                import('@/utils/slideImageUpdater').then(({ SlideImageUpdater }) => {
                  const updater = SlideImageUpdater.getInstance();
                  // Apply images to each new slide
                  newSlides.forEach(({ slide, index }) => {
                    updater.applyImagesToNewSlide(slide.id, index);
                  });
                }).catch(err => {
                  console.error('[fetchLatestDeck] Error applying images:', err);
                });
              }
            }
          }
        }
      }
    } catch (error: any) {
      console.error('[fetchLatestDeck] Error fetching deck:', error);

      // If we get a 500 error, it might be because the deck is still being created
      // Retry once after a delay
      if (error?.status === 500 || error?.message?.includes('500')) {
        console.log('[fetchLatestDeck] Got 500 error, retrying in 2 seconds...');

        // Update status to show error
        setDeckStatus(prev => ({
          ...(prev || {
            state: 'error',
            progress: 0,
            message: 'Failed to load deck. The server is experiencing issues. Retrying...',
            currentSlide: 0,
            totalSlides: 0,
            startedAt: new Date().toISOString(),
            error: 'Failed to load deck. The server is experiencing issues. Retrying...'
          } as DeckStatus),
          state: 'error',
          message: 'Failed to load deck. The server is experiencing issues. Retrying...',
          error: 'Failed to load deck. The server is experiencing issues. Retrying...'
        }));

        setTimeout(async () => {
          try {
            const deck = await deckSyncService.getFullDeck(deckId);
            if (deck && deck.slides && Array.isArray(deck.slides) && deck.slides.length > 0) {
              const currentDeckData = useDeckStore.getState().deckData;
              useDeckStore.getState().updateDeckData({
                ...currentDeckData,
                uuid: currentDeckData.uuid || deckId,
                slides: deck.slides as unknown as SlideData[]
              });

              // Clear error status if successful
              setDeckStatus(prev => ({
                ...(prev as DeckStatus),
                state: 'completed',
                message: prev?.message || 'Deck loaded',
                error: undefined
              }));
            }
          } catch (retryError) {
            console.error('[fetchLatestDeck] Retry failed:', retryError);

            // Update status to show persistent error
            setDeckStatus(prev => ({
              ...(prev || {
                state: 'error',
                progress: 0,
                message: 'Unable to load deck. Please refresh the page or try again later.',
                currentSlide: 0,
                totalSlides: 0,
                startedAt: new Date().toISOString()
              } as DeckStatus),
              state: 'error',
              message: 'Unable to load deck. Please refresh the page or try again later.',
              error: 'Unable to load deck. Please refresh the page or try again later.'
            }));

            // Show error toast
            toast({
              title: 'Error Loading Deck',
              description: 'The server is having trouble loading your deck. Please refresh the page or try again later.',
              variant: 'destructive',
              duration: 8000
            });
          }
        }, 2000);
      } else {
        // For other errors, show immediately
        setDeckStatus(prev => ({
          ...(prev || {
            state: 'error',
            progress: 0,
            message: error?.message || 'Failed to load deck',
            currentSlide: 0,
            totalSlides: 0,
            startedAt: new Date().toISOString()
          } as DeckStatus),
          state: 'error',
          message: error?.message || 'Failed to load deck',
          error: error?.message || 'Failed to load deck'
        }));
      }
    }
  }, [deckId]);

  // Add event listener for programmatic navigation
  useEffect(() => {
    const handleNavigateToSlide = (event: CustomEvent) => {
      const slideIndex = event.detail?.slideIndex;
      if (typeof slideIndex === 'number' && slideIndex >= 0 && slideIndex < deckData.slides.length) {
        console.log(`[Navigation] Navigating to slide ${slideIndex + 1} via event`);
        goToSlide(slideIndex, { force: true });
      }
    };

    window.addEventListener('navigate-to-slide', handleNavigateToSlide as EventListener);

    return () => {
      window.removeEventListener('navigate-to-slide', handleNavigateToSlide as EventListener);
    };
  }, [goToSlide, deckData.slides.length]);

  const [deckName, setDeckName] = useState(deckData.name || 'New Presentation');

  useEffect(() => {
    if (deckData.name && deckData.name !== deckName) {
      setDeckName(deckData.name);
    }
  }, [deckData.name, deckName]);

  // Check for outline title when deck is new (one-time check) and persist to backend
  useEffect(() => {
    const suppliedName = deckData.name?.trim();
    const outlineTitle = deckData.outline?.title?.trim();
    const isPlaceholder = !suppliedName || suppliedName === 'New Presentation' || suppliedName === 'my-presentation' || /untitled/i.test(suppliedName);
    if (isNewDeck && outlineTitle && isPlaceholder) {
      console.log('[SlideEditor] Using outline title:', outlineTitle);
      setDeckName(outlineTitle);
      // Persist the title into deck data so it saves
      updateDeckData({ name: outlineTitle });
    }
  }, [isNewDeck, deckData.outline?.title]);

  // If coming from outline generation, use the stashed deck name immediately
  useEffect(() => {
    if (!isNewDeck) return;
    const suppliedName = deckData.name?.trim();
    const isPlaceholder = !suppliedName || suppliedName === 'New Presentation' || suppliedName === 'my-presentation' || /untitled/i.test(suppliedName);
    if (!isPlaceholder) return;
    try {
      const pendingName = (typeof window !== 'undefined' && (window as any).__activeGenerationDeckName) ||
        (typeof window !== 'undefined' && sessionStorage.getItem('activeGenerationDeckName')) || '';
      const trimmed = (pendingName || '').trim();
      if (trimmed) {
        setDeckName(trimmed);
        updateDeckData({ name: trimmed }, { skipBackend: true });
      }
    } catch { }
  }, [isNewDeck]);

  const isTextEditing = useEditorSettingsStore(state => state.isTextEditing);
  const isPresenting = usePresentationStore(state => state.isPresenting);
  const enterPresentation = usePresentationStore(state => state.enterPresentation);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isEditing) return;
      const isInput = ['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName || '');
      const isContentEditable = (e.target as HTMLElement)?.hasAttribute('contenteditable');
      if (isInput || isContentEditable || isTextEditing) return;

      if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
        if (e.shiftKey) {
          if (canRedo()) {
            e.preventDefault();
            redo();
          }
        } else {
          if (canUndo()) {
            e.preventDefault();
            undo();
          }
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
        if (canRedo()) {
          e.preventDefault();
          redo();
        }
      }

      // Presentation mode shortcut (P key)
      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        enterPresentation();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo, canUndo, canRedo, isTextEditing, isEditing, enterPresentation]);

  // Note: Removed auto-orientation presentation trigger - user must manually enter presentation mode

  const handleDeckNameChange = (newName: string) => {
    setDeckName(newName);
    updateDeckData({ name: newName });
  };

  const handleEditToggle = () => {
    // Simply toggle edit mode without updating slide data
    if (isMobile) return;
    setIsEditing(!isEditing);
  };

  const handleAddNewSlide = useCallback(() => {
    const newSlideIndex = deckData.slides.length;
    try {
      const defaultBackground = createComponent('Background', { color: '#000000' });
      const newSlideData = {
        title: 'New Slide',
        components: [defaultBackground],
        order: newSlideIndex,
        deckId: deckId || '',
        status: 'completed' as const
      };
      addSlide(newSlideData);
      goToSlide(newSlideIndex, { force: true });
    } catch (error) {
      // Just show the toast - no need for console error as well
      toast({
        title: 'Error',
        description: 'Failed to add new slide',
        variant: 'destructive'
      });
    }
  }, [addSlide, goToSlide, toast, deckData.slides.length]);

  const handleUndo = () => {
    if (canUndo()) {
      undo();
    }
  };
  const handleRedo = () => {
    if (canRedo()) {
      redo();
    }
  };

  const handleLayout = (sizes: number[]) => {
    // During generation, keep chat panel at normal size
    const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
    const opacity = Math.max(0.3, Math.min(1, (sizes[0] - COLLAPSE_THRESHOLD) / (CHAT_MIN_SIZE - COLLAPSE_THRESHOLD)));
    setChatOpacity(isGenerating ? 1 : opacity);

    // Don't allow collapsing during generation
    if (!isGenerating && sizes[0] < COLLAPSE_THRESHOLD) {
      setIsChatCollapsed(true);
    } else if (isChatCollapsed && sizes[0] > COLLAPSE_THRESHOLD) {
      setIsChatCollapsed(false);
    }

  };
  // Removed pixel width lock for chat panel to respect panel sizing

  const handleCollapseChange = (collapsed: boolean) => {
    setIsChatCollapsed(collapsed);
  };

  // Function to render slides for presentation mode
  // Renders at full resolution - PresentationMode handles scaling via CSS transform
  // IMPORTANT: Use deckSlideSize directly (not from normalizeSlideForRender) to ensure
  // the dimensions match what PresentationMode uses for scale calculation
  const renderSlide = (slide: SlideData, index: number, scale: number = 1, isThumbnail: boolean = false) => {
    const deckSlideSize = deckData.size || { width: DEFAULT_SLIDE_WIDTH, height: DEFAULT_SLIDE_HEIGHT };
    const normalized = normalizeSlideForRender(slide, deckSlideSize, { preferFallbackSize: true });
    const normalizedSlide = normalized?.slide || slide;
    // Use deckSlideSize directly instead of normalized.slideSize to ensure consistency
    // with PresentationMode's scale calculation which also uses deckData.size
    const baseSlideWidth = deckSlideSize.width;
    const baseSlideHeight = deckSlideSize.height;

    // Compute a defensive fallback background so presentation mode shows slide backgrounds
    const fallbackBackground = (() => {
      const normalizeHex = (hex: string) => {
        // Supports #RRGGBBAA, #RGBA, #RRGGBB
        const h = hex.trim();
        if (/^#([0-9a-fA-F]{8})$/.test(h)) {
          const m = h.match(/^#([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})([0-9a-fA-F]{2})$/);
          if (m) {
            const r = parseInt(m[1], 16);
            const g = parseInt(m[2], 16);
            const b = parseInt(m[3], 16);
            const a = parseInt(m[4], 16) / 255;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
        if (/^#([0-9a-fA-F]{4})$/.test(h)) {
          // #RGBA -> expand
          const m = h.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/);
          if (m) {
            const r = parseInt(m[1] + m[1], 16);
            const g = parseInt(m[2] + m[2], 16);
            const b = parseInt(m[3] + m[3], 16);
            const a = parseInt(m[4] + m[4], 16) / 255;
            return `rgba(${r}, ${g}, ${b}, ${a})`;
          }
        }
        return hex;
      };
      try {
        const components = Array.isArray(normalizedSlide.components) ? normalizedSlide.components : [];
        const bg = components.find(c => c && (c.type === 'Background' || (c.id && c.id.toLowerCase().includes('background'))));
        const props: any = bg?.props || {};
        // If a generic CSS background string is provided, prefer it
        if (typeof props.background === 'string' && props.background.trim()) {
          return props.background as string;
        }
        // Gradient object support
        const gradient = props.gradient || props.style?.background || (props.background && props.background.color ? props.background : null);
        if (typeof gradient === 'string' && gradient) return gradient;
        if (gradient && typeof gradient === 'object' && (Array.isArray((gradient as any).stops) || Array.isArray((gradient as any).colors))) {
          const rawStops = Array.isArray((gradient as any).stops) ? (gradient as any).stops : (gradient as any).colors;
          const stops = rawStops
            .filter((s: any) => s && s.color)
            .map((s: any) => {
              const pos = typeof s.position === 'number' ? (s.position <= 1 ? s.position * 100 : s.position) : undefined;
              const color = typeof s.color === 'string' ? normalizeHex(s.color) : s.color;
              return `${color}${typeof pos === 'number' ? ` ${pos}%` : ''}`;
            })
            .join(', ');
          if (stops) {
            if (gradient.type === 'radial') {
              return `radial-gradient(circle, ${stops})`;
            }
            const angle = typeof gradient.angle === 'number' ? gradient.angle : 180;
            return `linear-gradient(${angle}deg, ${stops})`;
          }
        }
        // Solid color fallbacks
        const directColor = props.backgroundColor || props.color || props.page?.backgroundColor || (normalizedSlide as any).backgroundColor;
        if (typeof directColor === 'string' && directColor) return normalizeHex(directColor as string);
        // Slide-level background image (legacy)
        const slideBgImg = (normalizedSlide as any).backgroundImage;
        if (typeof slideBgImg === 'string' && slideBgImg) return `url(${slideBgImg})`;
      } catch { }
      return undefined as string | undefined;
    })();

    if (isThumbnail) {
      const isImageBackground = typeof fallbackBackground === 'string' && fallbackBackground.includes('url(');
      const thumbnailBackground = isImageBackground ? undefined : fallbackBackground;
      return (
        <div
          className="w-full h-full relative overflow-hidden"
          style={thumbnailBackground ? { background: thumbnailBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : { background: '#f0f0f0' }}
        >
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-black/20">{index + 1}</span>
          </div>
        </div>
      );
    }

    // Render at full resolution - PresentationMode handles scaling
    return (
      <div
        className="w-full h-full relative overflow-hidden"
        style={{
          width: `${baseSlideWidth}px`,
          height: `${baseSlideHeight}px`,
          ...(fallbackBackground ? { background: fallbackBackground, backgroundSize: 'cover', backgroundPosition: 'center' } : {})
        }}
      >
        <NavigationProvider initialSlideIndex={index} onSlideChange={() => { }}>
          <EditorStateProvider initialEditingState={false} slideSizeOverride={deckSlideSize}>
            <StaticActiveSlideProvider slide={normalizedSlide}>
              <Slide
                key={normalizedSlide.id}
                slide={normalizedSlide}
                isActive={true}
                direction={null}
                isEditing={false}
                onSave={() => { }}
                selectedComponentId={undefined}
                onComponentSelect={() => { }}
                forceSimpleContainer={true}
              />
            </StaticActiveSlideProvider>
          </EditorStateProvider>
        </NavigationProvider>
      </div>
    );
  };

  // Helper function to parse message if it's JSON
  const parseMessageIfJSON = (message: string): string => {
    if (!message) return '';

    // Check if message looks like JSON
    if (message.trim().startsWith('{')) {
      try {
        const parsed = JSON.parse(message);

        // Extract the actual message from the JSON object
        if (parsed.message) return parsed.message;

        // If no message field, try to create a readable message from the JSON
        if (parsed.type === 'slide_completed') {
          return `Completed slide ${(parsed.slide_index || 0) + 1}: ${parsed.slide_title || 'Untitled'}`;
        } else if (parsed.type === 'deck_complete') {
          return 'Deck generation completed!';
        } else if (parsed.type === 'error') {
          return parsed.error || 'An error occurred';
        } else if (parsed.type === 'slide_started') {
          return `Generating slide ${(parsed.slide_index || 0) + 1}: ${parsed.slide_title || 'Untitled'}`;
        }

        // If we can't create a readable message, don't show raw JSON
        return 'Processing...';
      } catch (e) {
        // If parsing fails, return the original message
        return message;
      }
    }

    return message;
  };

  // Expose setDeckStatus to window for debugging
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).setDeckStatus = setDeckStatus;
      (window as any).useDeckStore = useDeckStore;
    }
    return () => {
      if (typeof window !== 'undefined') {
        delete (window as any).setDeckStatus;
        delete (window as any).useDeckStore;
      }
    };
  }, []);



  // Set up slide generation hook (single instance for this component)

  // Subscribe to realtime deck status updates for new decks
  useEffect(() => {
    if (!deckId || realtimeSetupRef.current || isAuthLoading) return;


    realtimeSetupRef.current = true;

    // Fetch initial deck status
    const fetchDeckStatus = async () => {
      try {
        // Ensure UUID is set in the store before fetching
        const currentDeckData = useDeckStore.getState().deckData;
        if (!currentDeckData.uuid && deckId) {
          useDeckStore.getState().updateDeckData({
            ...currentDeckData,
            uuid: deckId
          });
        }

        const deckData = await deckSyncService.getFullDeck(deckId);



        if (deckData) {
          // Validate that the data is for the correct deck
          if (deckData.uuid !== deckId) {
            return;
          }

          // Store slides if available
          if (deckData.slides) {
            let slides = deckData.slides;

            // Parse slides if they're a JSON string
            if (typeof slides === 'string') {
              try {
                slides = JSON.parse(slides);
                console.log('[fetchDeckStatus] Parsed slides from JSON string');
              } catch (e) {
                console.error('[fetchDeckStatus] Failed to parse slides JSON:', e);
                slides = [];
              }
            }

            if (Array.isArray(slides)) {
              console.log('[fetchDeckStatus] Updating deck with slides:', {
                slideCount: slides.length,
                firstSlideComponents: slides[0]?.components?.length || 0
              });

              const updatedDeckData = useDeckStore.getState().deckData;

              // Only update if it's the same deck
              if (!updatedDeckData.uuid || updatedDeckData.uuid === deckId) {
                useDeckStore.getState().updateDeckData({
                  ...updatedDeckData,
                  uuid: deckId, // Ensure UUID is set
                  // Sync deck name as soon as it's available from server
                  name: deckData.name || updatedDeckData.name,
                  slides: slides
                });
              }
            }
          }

          // Store outline if available
          if (deckData.outline) {

            updateDeckData({ outline: deckData.outline }, { skipBackend: true, isRealtimeUpdate: true });
          }

          // Store notes (narrative flow) if available
          if (deckData.notes) {
            console.log('[fetchDeckStatus] Found narrative flow in deck notes');
            updateDeckData({ notes: deckData.notes }, { skipBackend: true, isRealtimeUpdate: true });
          }

          if (deckData.status) {

            const initialStatus = deckData.status as DeckStatus;
            setDeckStatus(initialStatus);

            // More detailed logging

            // If deck is generating, show initial status in chat
            if (initialStatus.state === 'generating' || initialStatus.state === 'pending' || initialStatus.state === 'creating') {
              setLastSystemMessageForChat({
                message: parseMessageIfJSON(initialStatus.message) || 'Starting deck generation...',
                metadata: {
                  stage: 'init',
                  progress: typeof initialStatus.progress === 'number' ? initialStatus.progress : 0,
                  type: 'progress',  // Mark as progress type
                  totalSlides: initialStatus.totalSlides,
                  isStreamingUpdate: true
                }
              });
            }
            // If deck is already completed, just set the status (ChatPanel handles the welcome message)
            else if (initialStatus.state === 'completed' || (typeof initialStatus.progress === 'number' && initialStatus.progress >= 100)) {
              // Ensure we show completed state and not generating state
              setDeckStatus({
                ...initialStatus,
                state: 'completed',
                progress: 100,
                message: ''
              });

              // Clean up URL if it still has ?new=true
              if (searchParams.get('new') === 'true') {
                const newSearchParams = new URLSearchParams(searchParams);
                newSearchParams.delete('new');
                setSearchParams(newSearchParams, { replace: true });
                console.log('[SlideEditor] Removed ?new=true parameter for completed deck');
              }

              // Don't send "Your presentation is ready!" message for existing decks
              // ChatPanel handles the appropriate welcome message based on isExistingDeck prop
            }
          } else if (deckData) {
            // If deck exists but no status, check if it already has generated content
            const slides = deckData.slides || [];
            const hasGeneratedContent = slides.some((slide: any) =>
              slide.components && slide.components.length > 0
            );

            if (hasGeneratedContent) {
              // Deck already has content - treat as completed
              setDeckStatus({
                state: 'completed',
                currentSlide: slides.length,
                totalSlides: slides.length,
                message: '',
                progress: 100,
                startedAt: new Date().toISOString()
              });

              // Clean up URL if it still has ?new=true
              if (searchParams.get('new') === 'true') {
                const newSearchParams = new URLSearchParams(searchParams);
                newSearchParams.delete('new');
                setSearchParams(newSearchParams, { replace: true });
                console.log('[SlideEditor] Removed ?new=true parameter for deck with generated content');
              }
            } else if (isNewDeck && slides.length > 0) {
              // New deck with slides but no content yet - still generating
              setDeckStatus({
                state: 'generating',
                currentSlide: 1,
                totalSlides: slides.length,
                message: 'Loading deck...',
                progress: 0,
                startedAt: new Date().toISOString()
              });
            }
          }
        }
      } catch (error) {
        // Silently fail - realtime will pick up status
      }
    };

    fetchDeckStatus();

    // Only fetch deck data on mount if it's not a new deck being generated
    const timer = setTimeout(() => {
      if (!isNewDeck) {
        fetchLatestDeck();
      }
    }, 1000);

    // Disable local Supabase deck subscription; rely on store-level subscription for consistency
    /* BEGIN disabled local deck subscription
    const channel = supabase
      .channel(`deck-${deckId}`) // Unique channel for this deck
      .on(
        'postgres_changes',
        {
          event: 'UPDATE', // Specifically listen for UPDATE events
          schema: 'public',
          table: 'decks',
          filter: `uuid=eq.${deckId}` // Re-enable server-side filter
        },
        (payload) => {
          console.log('[DeckUpdate] Raw payload received:', {
            eventType: payload.eventType,
            hasNew: !!payload.new,
            uuid: (payload.new as any)?.uuid,
            deckId: deckId
          });
          
          // Client-side filter for the correct deckId
          if (!payload.new || (payload.new as any).uuid !== deckId) {
            console.log('[DeckUpdate] Filtered out - UUID mismatch');
            return;
          }

          // The event type filter should ensure this is an UPDATE.
          if (payload.eventType !== 'UPDATE') {
            console.log('[DeckUpdate] Filtered out - not an UPDATE event');
            return;
          }

          const newStatus = payload.new.status as DeckStatus | undefined;
          const newVersion = (payload.new as any)?.version;
          const newLastModified = (payload.new as any)?.last_modified || (payload.new as any)?.lastModified;
          const updateId = `${payload.new.uuid}-${payload.new.updated_at || payload.new.lastModified || Date.now()}`;
          
          // Skip if we've already processed this exact update
          if (lastProcessedUpdateRef.current === updateId) {
            console.log('[DeckUpdate] Skipping duplicate update:', updateId);
            return;
          }
          
          lastProcessedUpdateRef.current = updateId;
          
          if (newStatus) {
            console.log('[DeckStatus] Setting status from real-time update:', {
              state: newStatus.state,
              progress: newStatus.progress,
              currentSlide: newStatus.currentSlide,
              totalSlides: newStatus.totalSlides,
              message: newStatus.message?.substring(0, 50)
            });
            
            // Only process status updates for actual changes
            if (!newStatus) {
              return;
            }
            
            setDeckStatus(newStatus);

            const prevStatus = previousDeckStatusRef.current;

            // If the state is 'generating' and the message has changed, create a chat update.
            if (newStatus.state === 'generating' && 
                newStatus.message && 
                newStatus.message !== prevStatus?.message &&
                newStatus.message !== lastMessageRef.current
            ) {
              lastMessageRef.current = newStatus.message;
              // Parse the message to extract stage information
              let stage = 'status_update';
              
              // Detect message type from emoji and content
              if (newStatus.message.includes('🎨 Found palette')) {
                stage = 'palette_found';
              } else if (newStatus.message.includes('📐 Design system ready')) {
                stage = 'design_system_ready';
              } else if (newStatus.message.includes('⏳ Generating slide')) {
                stage = 'slide_started';
              } else if (newStatus.message.includes('✅ Completed slide')) {
                stage = 'slide_completed';
              } else if (newStatus.message.includes('🎉 Deck generation complete')) {
                stage = 'generation_complete';
              } else if (newStatus.message.includes('❌ Error:')) {
                stage = 'error';
              }
              
              setLastSystemMessageForChat({
                message: parseMessageIfJSON(newStatus.message), // Parse JSON if needed
                metadata: { 
                  stage: stage,
                  currentSlide: newStatus.currentSlide,
                  totalSlides: newStatus.totalSlides,
                  progress: newStatus.progress,
                  type: stage,
                  isStreamingUpdate: true  // Mark as streaming update to consolidate with generation messages
                }
              });
            }
            // Toast logic for completed/error states
            if (newStatus.state === 'completed' && 
                prevStatus?.state !== 'completed' && 
                prevStatus?.state !== null && 
                newStatus.progress === 100) {
              console.log('[DeckStatus] Deck generation completed, checking for slides');
              
              // Show the quick tip bubble
              setShowQuickTip(true);
              
              // Get deck data to check if font optimization is needed
              const deckData = useDeckStore.getState().deckData;
              const isFontOptimized = deckData.data?.fontOptimized === true;
              
              console.log('[SlideEditor] Completion - deck data:', {
                uuid: deckData.uuid,
                isFontOptimized,
                willShowFontButton: !isFontOptimized && !!deckData.uuid
              });
              
              // Dispatch deck generation complete event for auto font optimization
              // Only if this session observed an active generation or a real transition from generating
              const hadActiveGeneration =
                (typeof window !== 'undefined' && (window as any).__activeGenerationDeckId === deckId) ||
                prevStatus?.state === 'generating' || prevStatus?.state === 'creating';

              if (hadActiveGeneration) {
                console.log('[SlideEditor] Dispatching deck_generation_complete event');
                window.dispatchEvent(new CustomEvent('deck_generation_complete', {
                  detail: { deckId, timestamp: Date.now() }
                }));
              } else {
                console.log('[SlideEditor] Skipping auto-optimization dispatch: no active generation detected');
              }
              
              // Completion messages are now handled by GenerationCoordinator (deck_finalized event)
              // and useChatSystemMessages (adds welcome message after 800ms)
              // No need to send duplicate messages from here
              
              // Always fetch the latest deck when generation completes
              console.log('[DeckStatus] Fetching deck after completion');
              setTimeout(() => {
                fetchLatestDeck();
              }, 500);
              
              toast({
                title: "Deck Generation Complete!",
                description: "All slides have been generated successfully.",
                duration: 5000,
              });

              // Clear the active generation flag set by DeckList to avoid blocking future runs
              try {
                if (typeof window !== 'undefined' && (window as any).__activeGenerationDeckId === deckId) {
                  delete (window as any).__activeGenerationDeckId;
                }
              } catch {}
            } else if (newStatus.state === 'error' && prevStatus?.state !== 'error') {
              // Send error message to chat
              if (newStatus.message || newStatus.error) {
                setLastSystemMessageForChat({
                  message: parseMessageIfJSON(newStatus.error || newStatus.message || 'Generation failed'),
                  metadata: {
                    stage: 'error',
                    type: 'error',
                    progress: newStatus.progress || 0
                  }
                });
              }
              
              toast({
                title: "Generation Error",
                description: newStatus.error || "An error occurred while generating slides.",
                variant: "destructive",
                duration: 10000,
              });
            }

            // Update previous status after handling all logic
            previousDeckStatusRef.current = newStatus;
          }

          // If version/last_modified changed, refetch only when payload lacks slides and throttle
          try {
            const current = useDeckStore.getState().deckData;
            const versionChanged = !!newVersion && newVersion !== (current as any).version;
            const lmChanged = !!newLastModified && newLastModified !== (current as any).lastModified && newLastModified !== (current as any).last_modified;
            const payloadHasSlides = Array.isArray((payload.new as any)?.slides) && ((payload.new as any).slides as any[]).length > 0;
            if ((versionChanged || lmChanged) && !payloadHasSlides) {
              const now = Date.now();
              if (now - lastVersionRefetchTsRef.current > 2000) {
                lastVersionRefetchTsRef.current = now;
                setTimeout(() => {
                  try { fetchLatestDeck(); } catch {}
                }, 150);
              }
            }
          } catch {}
          
          // Update slides if they changed
          if (payload.new.slides && Array.isArray(payload.new.slides)) {
            
            const currentDeckData = useDeckStore.getState().deckData;
            
            // Create a signature of the update to detect duplicates
            const updateSignature = JSON.stringify(payload.new.slides.map((s: any) => ({
              id: s.id,
              componentCount: s.components?.length || 0,
              title: s.title
            })));
            
            // Check if we've already processed this exact update
            if ((window as any).__lastSlideUpdateSignature === updateSignature) {
              console.log('[DeckUpdate] Skipping duplicate slide update');
              return;
            }
            
            (window as any).__lastSlideUpdateSignature = updateSignature;
            
            // Log the update for debugging
            console.log('[DeckUpdate] Received slides update:', {
              slideCount: Array.isArray(payload.new.slides) ? payload.new.slides.length : 'Not an array',
              slidesType: typeof payload.new.slides,
              currentSlideCount: currentDeckData.slides?.length || 0,
              deckUuid: (payload.new as any).uuid,
              currentUuid: currentDeckData.uuid,
              deckId: deckId,
              firstSlideComponents: Array.isArray(payload.new.slides) ? payload.new.slides[0]?.components?.length || 0 : 'N/A',
              slideStatuses: Array.isArray(payload.new.slides) ? payload.new.slides.map((s: any) => s.status) : 'N/A',
              source: 'realtime_subscription'
            });
            
            // Validate deck UUID matches
            // If currentDeckData.uuid is not set, use the deckId from the URL
            const currentUuid = currentDeckData.uuid || deckId;
            
            // Check if the update is for the correct deck
            if (currentUuid !== deckId || (payload.new as any).uuid !== deckId) {
              return;
            }
            
            // During generation, always use the latest slides from the database
            // This allows progressive loading as slides are generated
            let slidesToUpdate = payload.new.slides;
            
            // During active SSE generation, only skip if slides have content
            // This prevents overwriting SSE updates with empty slides
            if (typeof window !== 'undefined' && (window as any).__activeGenerationDeckId === deckId) {
              const hasContent = slidesToUpdate?.some((s: any) => s.components && s.components.length > 0);
              if (!hasContent) {
                console.log('[DeckUpdate] Skipping empty slide update during SSE generation');
                return;
              }
            }
            
            // Prevent duplicate updates with better debouncing
            const updateKey = `${deckId}-${JSON.stringify(slidesToUpdate?.map((s: any) => s.id))}`;
            if (isUpdatingRef.current || lastProcessedUpdateRef.current === updateKey) {
              return;
            }
            
            lastProcessedUpdateRef.current = updateKey;
            isUpdatingRef.current = true;
            
            // Ensure the flag is reset after a timeout to prevent getting stuck
            setTimeout(() => {
              isUpdatingRef.current = false;
            }, 1000);
            
            // Check if slides need to be parsed from JSON string
            if (typeof slidesToUpdate === 'string') {
              try {
                slidesToUpdate = JSON.parse(slidesToUpdate);
                console.log('[DeckUpdate] Parsed slides from JSON string');
              } catch (e) {
                console.error('[DeckUpdate] Failed to parse slides JSON:', e);
                return;
              }
            }
            
            // Check if we would lose slides - this might indicate stale data
            const currentSlideCount = currentDeckData.slides?.length || 0;
            const newSlideCount = slidesToUpdate?.length || 0;
            
            // Only skip if we're losing more than half the slides (likely a bad update)
            if (newSlideCount < currentSlideCount / 2 && currentSlideCount > 4) {
              console.log('[DeckUpdate] Skipping update - would lose too many slides:', {
                current: currentSlideCount,
                new: newSlideCount
              });
              return;
            }
            
            // Log what we're updating
            
            // Update the deck data with new slides and outline if available
            // Also fix slide statuses based on content
            const isDeckCompleted = deckStatus?.state === 'completed';
            
            // Merge slides individually to support progressive updates
            const currentSlides = [...(currentDeckData.slides || [])];
            const updatedSlideIndices = new Set<number>();
            
            // Ensure we have enough slide slots
            const maxSlideCount = Math.max(currentSlides.length, slidesToUpdate.length);
            
            // If slidesToUpdate has fewer slides than current, it might be a partial update
            // We should preserve existing slides that aren't in the update
            console.log('[DeckUpdate] Slide counts:', {
              current: currentSlides.length,
              incoming: slidesToUpdate.length,
              max: maxSlideCount
            });
            
            slidesToUpdate.forEach((newSlide: any, index: number) => {
              // Check if this slide has actual content (components)
              const hasContent = newSlide.components && newSlide.components.length > 0;
              
              // Fix slide status based on content
              let fixedSlide = newSlide;
              
              // Preserve existing completed status if the current slide is already completed
              const currentSlide = currentSlides[index];
              const isCurrentlyCompleted = currentSlide?.status === 'completed';
              
              if (hasContent && (isDeckCompleted || newSlide.status === 'pending' || newSlide.status === 'generating')) {
                fixedSlide = { ...newSlide, status: 'completed' as const };
              } else if (isCurrentlyCompleted && !newSlide.status) {
                // If current slide is completed, preserve that status even if new data doesn't specify
                fixedSlide = { ...newSlide, status: 'completed' as const };
              } else if (!hasContent && !fixedSlide.status && !isCurrentlyCompleted) {
                // Only mark as pending if it wasn't already completed
                fixedSlide = { ...newSlide, status: 'pending' as const };
              }
              
              // Only update if the slide has changed (has content or is new)
              // Also update if the status has changed from pending to completed
              const currentSlideStatus = currentSlides[index]?.status;
              const statusChanged = currentSlideStatus !== fixedSlide.status;
              
              // Don't overwrite a completed slide with empty content
              const wouldLoseContent = isCurrentlyCompleted && 
                                      currentSlide?.components?.length > 0 && 
                                      (!newSlide.components || newSlide.components.length === 0);
              
              if (wouldLoseContent) {
                console.warn(`[DeckUpdate] Skipping update for slide ${index} - would lose content:`, {
                  currentComponents: currentSlide?.components?.length,
                  newComponents: newSlide.components?.length || 0,
                  currentStatus: currentSlide?.status,
                  newStatus: newSlide.status
                });
              } else if (!currentSlides[index] || hasContent || statusChanged) {
                currentSlides[index] = fixedSlide;
                updatedSlideIndices.add(index);
                console.log(`[DeckUpdate] Updating slide ${index}:`, {
                  hasContent,
                  components: fixedSlide.components?.length || 0,
                  status: fixedSlide.status,
                  previousStatus: currentSlideStatus
                });
              }
            });
            
            // Log which slides were updated
            if (updatedSlideIndices.size > 0) {
              console.log('[DeckUpdate] Updated slides:', Array.from(updatedSlideIndices));
            }
            
            const updates: any = {
              ...currentDeckData,
              uuid: currentDeckData.uuid || deckId, // Ensure UUID is always set, prefer existing UUID
              slides: currentSlides
            };
            
            // Include outline if it's in the update
            if (payload.new.outline) {
              updates.outline = payload.new.outline;
            }
            
            // Include notes (narrative flow) if it's in the update
            if (payload.new.notes) {
              updates.notes = payload.new.notes;
              console.log('[DeckUpdate] Found narrative flow in real-time update');
            }
            
            useDeckStore.getState().updateDeckData(updates, { isRealtimeUpdate: true, skipBackend: true });
            
            console.log('[DeckUpdate] Updated deck with slides:', {
              slideCount: currentSlides.length,
              firstSlideComponents: currentSlides[0]?.components?.length || 0,
              allSlideComponents: currentSlides.map((s: any) => s.components?.length || 0)
            });
            
            // Debug: Check for images in completed slides
            debugSlideImages(currentSlides);
            
            // Check for newly completed slides and optimize fonts
            currentSlides.forEach((slide: any, index: number) => {
              const previousSlide = slidesToUpdate[index];
              
              // Debug: Log all slide status comparisons
              // console.log(`[SlideCompletion] Checking slide ${slide.id || index}:`, {
              //   previousStatus: previousSlide?.status,
              //   currentStatus: slide.status,
              //   hasComponents: slide.components?.length > 0,
              //   previousComponents: previousSlide?.components?.length || 0
              // });
              
                                // Check if slide just completed
                  const statusChangedToCompleted = slide.status === 'completed' && 
                      previousSlide && 
                      (previousSlide.status === 'pending' || previousSlide.status === 'generating');
                  
                  const newComponentsAdded = slide.components?.length > 0 && 
                      (!previousSlide?.components || previousSlide.components.length === 0);
                  
                  if (statusChangedToCompleted || newComponentsAdded) {
                    console.log(`[SlideCompletion] Detected slide ${slide.id} completion`);
                    
                    // Dispatch event for slide completion
                    window.dispatchEvent(new CustomEvent('slide_completed', {
                      detail: {
                        slideId: slide.id,
                        slideIndex: index,
                        timestamp: Date.now()
                      }
                    }));
                  }
            });
            
            // Reset the flag after a short delay
            setTimeout(() => {
              isUpdatingRef.current = false;
            }, 500);
          }
        }
      )
      // Ensure other .on() listeners (like for INSERT) are removed or commented out for focused debugging
      .subscribe((status, err) => {
        console.log(`[RealtimeSubscription] Deck channel status: ${status}`, err);
        if (status === 'SUBSCRIBED') {
          console.log(`[RealtimeSubscription] Successfully subscribed to deck ${deckId}`);
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[RealtimeSubscription] Channel error:', err);
        } else if (status === 'TIMED_OUT') {
          console.error('[RealtimeSubscription] Channel timed out');
        } else if (status === 'CLOSED') {
          console.log('[RealtimeSubscription] Channel closed');
        } else {
          console.log(`[RealtimeSubscription] Unknown status: ${status}`);
        }
      });

    */
    // Log initial subscription attempt status
    setRealtimeChannel(null);

    // NOTE: Removed slide subscription as slides are now part of the decks table
    // Component streaming updates should come through the deck channel above

    // Listen for component generation events from your backend
    // This could be via WebSocket, SSE, or another realtime channel
    // Disable component broadcast subscription locally too; rely on store updates
    const componentChannel: any = null;

    // Cleanup subscription
    return () => {
      clearTimeout(timer);
      // channel disabled
      // slideChannel was removed - slides are part of deck updates now
      if (componentChannel) {
        supabase.removeChannel(componentChannel);
      }
      realtimeSetupRef.current = false;
    };
  }, [deckId, isNewDeck, toast, isAuthLoading]);

  useSlideGenerationFlow({
    deckId,
    isNewDeck,
    deckStatus,
    setDeckStatus,
    setLastSystemMessageForChat,
    searchParams,
    setSearchParams,
    deckData,
    fetchLatestDeck
  });
  useSlideImageAutomation({ deckData, deckStatus });

  // Debug helper for stuck generation UI
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).forceCompleteGeneration = () => {
        const deckData = useDeckStore.getState().deckData;
        const totalSlides = deckData.slides?.length || 0;
        const isFontOptimized = deckData.data?.fontOptimized === true;

        // Force completion status
        setDeckStatus({
          state: 'completed',
          progress: 100,
          message: 'Your presentation is ready!',
          currentSlide: totalSlides,
          totalSlides: totalSlides,
          startedAt: deckStatus?.startedAt || new Date().toISOString()
        });

        // Force completion message (guard against duplicates)
        if (previousDeckStatusRef.current?.progress !== 100) {
          setLastSystemMessageForChat({
            message: 'Your presentation is ready!',
            metadata: {
              type: 'generation_complete',
              stage: 'generation_complete',
              progress: 100,
              currentSlide: totalSlides,
              totalSlides: totalSlides,
              isStreamingUpdate: true
            }
          });
        }

        console.log('✅ Forced completion state');
        return 'Completion message sent!';
      };
    }
  }, [deckStatus, setDeckStatus, setLastSystemMessageForChat]);

  // Effect to ensure chat panel is visible during generation
  useEffect(() => {
    // Expose deck status globally for editor store to access
    if (typeof window !== 'undefined') {
      (window as any).__deckStatus = deckStatus;

      // Also expose a way to get current deck data for debugging
      (window as any).__getCurrentDeckData = () => {
        return useDeckStore.getState().deckData;
      };
    }

    const isGenerating = deckStatus?.state === 'generating' || deckStatus?.state === 'creating';
    if (isGenerating && isChatCollapsed) {
      setIsChatCollapsed(false);
      setChatOpacity(1);
    }

  }, [deckStatus?.state, isChatCollapsed]);

  // Debug: Log slide status changes (only once per deck load)
  useEffect(() => {
    if (deckData.slides.length > 0 && !(window as any).__debugLoggedDeck) {
      (window as any).__debugLoggedDeck = deckId;
    }
  }, [deckData.slides.length, deckId]);

  // Font optimization handler
  const handleSlideOptimization = useCallback(async (slide: SlideData) => {
    // Individual slide optimization removed - handled by manual button
  }, []);

  // Debug log the deck state (only on significant changes)
  useEffect(() => {
    const slideCount = deckData.slides?.length || 0;
    const hasComponents = deckData.slides?.some(s => s.components?.length > 0);

    // Only log if there's a meaningful change
    if (slideCount > 0 || deckStatus?.state === 'completed') {
      console.log('[SlideEditor] Deck state update:', {
        deckId,
        slideCount,
        hasComponents,
        deckStatus: deckStatus?.state
      });

      // Debug: Check what images are in the slides
      if (slideCount > 0 && deckStatus?.state === 'completed') {
        debugSlideImages(deckData.slides);
      }
    }
  }, [deckData.slides?.length, deckStatus?.state, deckId]);

  // If user opens the deck after import event fired, show one-time prompt using pending stash
  useEffect(() => {
    try {
      const currentDeckId = deckData?.uuid;
      if (!currentDeckId) return;
      const shownKey = `importPromptShown:${currentDeckId}`;
      const wasShown = typeof window !== 'undefined' && localStorage.getItem(shownKey) === '1';
      if (wasShown) return;
      const pending = (typeof window !== 'undefined') ? (window as any).__pendingImportMessage : null;
      if (pending && pending.deckId === currentDeckId) {
        const name = pending.name || 'Imported deck';
        setLastSystemMessageForChat({
          message: `${name} imported successfully.`,
          metadata: {
            type: 'import_complete',
            isSystemEvent: true
          }
        });
        try {
          localStorage.setItem(shownKey, '1');
          delete (window as any).__pendingImportMessage;
        } catch { }
      }
    } catch { }
  }, [deckData?.uuid]);

  return (
    <div className={`h-dvh bg-background flex flex-col overflow-hidden ${isChatCollapsed ? 'chat-collapsed' : ''}`} style={{ height: '100dvh' }}>
      <DeckHeader
        isEditing={isEditing}
        setIsEditing={handleEditToggle}
        handleAddNewSlide={handleAddNewSlide}
        deckName={deckName}
        setDeckName={handleDeckNameChange}
        handleUndo={handleUndo}
        handleRedo={handleRedo}
        canUndo={canUndo()}
        canRedo={canRedo()}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        realtimeEnabled={realtimeEnabled}
        deckStatus={deckStatus}
        rightSideComponents={
          <div className="flex items-center gap-1.5">
            {/* Hidden trigger; opened via header actions menu */}
            <DeckNotes
              deckId={deckId || deckData.uuid || ''}
              isGenerating={deckStatus?.state === 'generating' || deckStatus?.state === 'creating'}
              hideTrigger
            />
            {/* Secondary Share button */}
            <DeckSharing
              deckUuid={deckData.uuid || deckId}
              deckName={deckName}
            />
          </div>
        }
      />

      {/* Show generation progress if generating */}
      {/* Removed DeckGenerationProgress - using orange animated loading only */}

      <div className="flex-1 overflow-hidden pt-14">
        {isMobile ? (
          <div
            ref={mobileContainerRef}
            className={`relative h-full w-full overflow-hidden ${isChatDragging ? 'cursor-row-resize' : ''}`}
            onPointerDownCapture={handleMobileChatHintDismiss}
          >
            {/* Slide area - fixed size based on space above minimum chat position, never resizes during drag */}
            <div
              className="absolute top-0 left-0 right-0 px-2 overflow-hidden"
              style={{ bottom: `${minMobileChatHeight + 24}px` }}
            >
              <DeckPanel
                deckStatus={deckStatus}
                isNewDeck={isNewDeck}
                slides={deckData.slides}
                currentSlideIndex={currentSlideIndex}
                hideThumbnails
              />
            </div>

            {/* Bottom overlay: drag handle + chat - overlays slide when chat is expanded */}
            <div className="absolute bottom-0 left-0 right-0 z-10">
              {/* Drag handle */}
              <div className="relative flex items-center justify-center h-6 flex-shrink-0 bg-white dark:bg-zinc-900 border-t border-border/70">
                <button
                  type="button"
                  onPointerDown={handleChatHandlePointerDown}
                  className="group relative flex items-center justify-center w-full h-full touch-none"
                  aria-label="Resize chat"
                >
                  <span className="h-1 w-10 rounded-full bg-zinc-400/70 dark:bg-zinc-600/70 group-active:bg-zinc-500 dark:group-active:bg-zinc-500 transition-colors" />
                </button>

                {showChatDragHint && (
                  <button
                    type="button"
                    onClick={handleMobileChatHintDismiss}
                    className="absolute top-1/2 -translate-y-1/2 left-[calc(50%+36px)] px-2 py-1 rounded-full bg-[#FF4301] text-white text-[9px] font-medium shadow-lg whitespace-nowrap"
                  >
                    drag ↕
                  </button>
                )}
              </div>

              {/* Chat panel */}
              <div
                className="flex flex-col flex-shrink-0 bg-white dark:bg-zinc-900 shadow-2xl"
                style={{ height: `${mobileChatHeight || minMobileChatHeight}px` }}
              >
                <div className="flex-1 min-h-0 px-3 pb-[calc(env(safe-area-inset-bottom)+12px)]">
                  <ChatPanel
                    onCollapseChange={handleCollapseChange}
                    onUserMessageSend={handleMobileFirstMessage}
                    opacity={1}
                    newSystemMessage={lastSystemMessageForChat}
                    isExistingDeck={!isNewDeck || deckStatus?.state === 'completed'}
                  />
                </div>
              </div>
            </div>
          </div>
        ) : (
          <ResizablePanelGroup
            direction="horizontal"
            className="h-full bg-transparent"
            onLayout={handleLayout}
          >
            <ResizablePanel
              defaultSize={CHAT_MIN_SIZE}
              minSize={CHAT_MIN_SIZE}
              maxSize={40}
              className={`p-4 ${isChatCollapsed ? 'min-w-0' : 'min-w-[320px]'}`}
              style={{ flexShrink: 0 }}
              collapsible={true}
              collapsedSize={0}
              onCollapse={() => setIsChatCollapsed(true)}
              onExpand={() => setIsChatCollapsed(false)}
            >
              <div className="flex flex-col gap-4 h-full min-w-0 overflow-y-auto" data-scroll-guard="true">
                <ChatPanel
                  onCollapseChange={handleCollapseChange}
                  opacity={chatOpacity}
                  newSystemMessage={lastSystemMessageForChat}
                  isExistingDeck={!isNewDeck || deckStatus?.state === 'completed'}
                />
              </div>
            </ResizablePanel>

            <ResizableHandle withHandle />

            <ResizablePanel
              defaultSize={100 - CHAT_MIN_SIZE}
              minSize={60}
              className="relative flex flex-col bg-transparent min-w-0"
              style={{ minWidth: 0 }}
              collapsible={false}
            >
              <DeckPanel
                deckStatus={deckStatus}
                isNewDeck={isNewDeck}
                slides={deckData.slides}
                currentSlideIndex={currentSlideIndex}
              />

              <div
                className="absolute top-0 right-0 bottom-0 z-10 border-l border-gray-200/80 dark:border-white/10 bg-white dark:bg-zinc-900 overflow-hidden"
                style={{
                  width: '320px',
                  transform: isHistoryPanelOpen ? 'translateX(0)' : 'translateX(100%)',
                  opacity: isHistoryPanelOpen ? 1 : 0,
                  transition: 'all 0.25s cubic-bezier(0.4, 0, 0.2, 1)',
                  boxShadow: isHistoryPanelOpen ? '-8px 0 30px -12px rgba(0, 0, 0, 0.12)' : 'none'
                }}
              >
                {isHistoryPanelOpen && <VersionHistoryPanel />}
              </div>

            </ResizablePanel>
          </ResizablePanelGroup>
        )}
      </div>

      {/* Presentation Mode Overlay - rendered outside mobile/desktop conditional */}
      {deckData.slides && deckData.slides.length > 0 && (
        <PresentationMode
          slides={deckData.slides.filter(s => s && s.id && !s.id.startsWith('placeholder-'))}
          currentSlideIndex={currentSlideIndex}
          renderSlide={renderSlide}
          alwaysShowControls={isMobile}
          slideSize={deckData.size}
          deckUuid={deckData.uuid}
        />
      )}

      {/* Quick tip bubble */}
      <QuickTipBubble show={showQuickTip} />

      {/* Guided Tour Overlay */}
      <GuidedTour
        isOpen={showTour}
        onClose={() => setShowTour(false)}
        showAiHints={shouldShowAiHints}
        onAction={(action) => {
          if (action === 'enterEditMode') {
            try { setIsEditing(true); } catch { }
            try {
              window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
              window.dispatchEvent(new CustomEvent('editor:toggle-edit-mode'));
            } catch { }
          }
          if (action === 'openTheme') {
            // No-op here; clicking the theme button is already handled in the tour
          }
        }}
        steps={[
          {
            id: 'edit',
            targetSelector: '[data-tour="edit-button"]',
            title: 'Edit your slides',
            description: 'Click Edit to switch into powerful edit mode. You can press E or double‑click any slide too.',
            nextAction: 'enterEditMode',
            demo: null
          },
          {
            id: 'components',
            targetSelector: '[data-tour="component-toolbar"]',
            title: 'Add components',
            description: 'Use the toolbar to add text, shapes, charts, icons, tables, and media onto the canvas.',
            nextAction: null
          },
          {
            id: 'present',
            targetSelector: '[data-tour="present-button"]',
            title: 'Present your deck',
            description: 'Enter fullscreen presentation mode. Use arrow keys or swipe to navigate between slides.',
            nextAction: null
          },
          {
            id: 'share',
            targetSelector: '[data-tour="share-button"]',
            title: 'Share with anyone',
            description: 'Create share links, invite collaborators, and track who views your presentation.',
            nextAction: null
          },
          {
            id: 'chat',
            targetSelector: '[data-tour="chat-panel"]',
            title: 'AI chat helps you build',
            description: 'Ask for edits, generate content, or drop files/links. The AI will update slides for you.',
            nextAction: null,
            demo: null
          }
        ]}
      />
    </div>
  );
};

/**
 * Main SlideEditor component that provides all necessary context providers
 */
const SlideEditor: React.FC = () => {
  const [isEditing, setIsEditing] = useState(false);
  const [syncEnabled, setSyncEnabled] = useState(true);
  const [searchParams] = useSearchParams();
  const location = useLocation();

  // Check if this is a shared deck (accessed via share link)
  const isSharedAccess = (location.state as { sharedAccess?: boolean })?.sharedAccess === true;

  // Collaboration only enabled for shared decks
  // This prevents unnecessary WebSocket connections for solo users
  const [collaborationEnabled, setCollaborationEnabled] = useState(isSharedAccess);
  const AUTO_SYNC_INTERVAL = 30000;

  const setAutoSaveInterval = useDeckStore(state => state.setAutoSaveInterval);

  // Reset document styles and lock scroll when editor loads
  // This fixes the layout issue when navigating from DeckList and prevents page scrolling
  useEffect(() => {
    // Lock body scroll to prevent page from scrolling
    document.documentElement.style.position = 'fixed';
    document.documentElement.style.overflow = 'hidden';
    document.documentElement.style.width = '100%';
    document.documentElement.style.height = '100%';
    document.body.style.position = 'fixed';
    document.body.style.overflow = 'hidden';
    document.body.style.width = '100%';
    document.body.style.height = '100%';

    // Cleanup function - reset styles on unmount
    return () => {
      document.documentElement.style.position = '';
      document.documentElement.style.overflow = '';
      document.documentElement.style.width = '';
      document.documentElement.style.height = '';
      document.body.style.position = '';
      document.body.style.overflow = '';
      document.body.style.width = '';
      document.body.style.height = '';
      // Store that we were in the editor for DeckList to detect
      sessionStorage.setItem('lastEditedDeckId', 'true');
    };
  }, []);

  // Check if this is a newly generated deck
  const isNewDeck = searchParams.get('new') === 'true';

  // Delay collaboration for new decks to avoid connection errors
  useEffect(() => {
    if (isNewDeck) {

      setCollaborationEnabled(false);

      // Enable collaboration after a delay
      const timer = setTimeout(() => {

        setCollaborationEnabled(true);
      }, 10000); // 10 second delay

      return () => clearTimeout(timer);
    }
  }, [isNewDeck]);

  useEffect(() => {
    setAutoSaveInterval(300000);

    return () => setAutoSaveInterval(null);
  }, [setAutoSaveInterval]);

  useEffect(() => {
    const handleSlideDoubleClick = () => {
      window.dispatchEvent(new CustomEvent('editor:force-edit-mode'));
    };

    window.addEventListener('slide:doubleclick', handleSlideDoubleClick);

    return () => {
      window.removeEventListener('slide:doubleclick', handleSlideDoubleClick);
    };
  }, []);

  // Ensure Edit button is visible after generation completes
  useEffect(() => {
    const handleDeckGenerationComplete = () => {
      try {
        // Clear any chat selection mode that hides header edit button
        window.dispatchEvent(new CustomEvent('chat:selection-mode-changed', { detail: { selecting: false } }));
        // Re-broadcast current edit mode state so listeners refresh UI
        window.dispatchEvent(new CustomEvent('editor:edit-mode-changed', { detail: { isEditing } }));
        // Nudge UI to refresh header if needed
        window.dispatchEvent(new CustomEvent('deck:refresh-ui'));
      } catch { }
    };
    window.addEventListener('deck_generation_complete', handleDeckGenerationComplete);
    return () => {
      window.removeEventListener('deck_generation_complete', handleDeckGenerationComplete);
    };
  }, [isEditing]);

  // Export editing state globally
  useEffect(() => {
    if (typeof window !== 'undefined') {
      (window as any).__isEditMode = isEditing;
      // Dispatch event when edit mode changes
      window.dispatchEvent(new CustomEvent('editor:edit-mode-changed', {
        detail: { isEditing }
      }));
    }
  }, [isEditing]);



  const syncConfig = {
    enabled: syncEnabled,
    autoSyncInterval: AUTO_SYNC_INTERVAL,
    useSupabase: true,
    useRealtimeSubscription: true
  };

  const handleSlideChange = (index: number) => { };

  const handleEditingChange = (editing: boolean) => {
    setIsEditing(editing);
  };

  // Use real-time subscription with Yjs collaboration
  const adjustedSyncConfig = {
    ...syncConfig,
    // Enable real-time subscription for progressive loading
    useRealtimeSubscription: true
  };

  return (
    <CollaborationWrapper enabled={collaborationEnabled} showPanel={false}>
      <NavigationProvider initialSlideIndex={0} onSlideChange={handleSlideChange}>
        <EditorStateProvider
          syncConfig={adjustedSyncConfig}
          initialEditingState={isEditing}
          onEditingChange={handleEditingChange}
        >
          <VersionHistoryProvider>
            <ActiveSlideProvider>
              <SlideEditorContent />
            </ActiveSlideProvider>
          </VersionHistoryProvider>
        </EditorStateProvider>
      </NavigationProvider>
    </CollaborationWrapper>
  );
};

export default SlideEditor;
